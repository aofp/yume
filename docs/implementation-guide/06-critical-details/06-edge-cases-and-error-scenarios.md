# Complete Edge Cases and Error Scenarios

## Process Spawn Failures

### Error: Claude Binary Not Found
```rust
// Scenario: Claude CLI not installed or not in PATH
match Command::new("claude").spawn() {
    Err(e) if e.kind() == io::ErrorKind::NotFound => {
        // Binary doesn't exist
        return Err("Claude CLI not installed. Please install from: https://claude.ai/cli");
    }
    Err(e) => return Err(format!("Failed to spawn: {}", e)),
    Ok(child) => child,
}

// Recovery: Try multiple locations
fn find_claude_with_fallbacks() -> Result<PathBuf> {
    let attempts = vec![
        ("environment", env::var("CLAUDE_PATH").ok()),
        ("which command", which::which("claude").ok()),
        ("home directory", dirs::home_dir().map(|h| h.join(".local/bin/claude"))),
        ("system path", Some(PathBuf::from("/usr/local/bin/claude"))),
    ];
    
    for (source, path_opt) in attempts {
        if let Some(path) = path_opt {
            if path.exists() {
                log::info!("Found Claude via {}: {:?}", source, path);
                return Ok(path);
            }
        }
    }
    
    Err("Claude not found. Try: export CLAUDE_PATH=/path/to/claude")
}
```

### Error: Permission Denied
```rust
// Scenario: Claude binary exists but not executable
match Command::new("claude").spawn() {
    Err(e) if e.kind() == io::ErrorKind::PermissionDenied => {
        // Try to make it executable
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = fs::metadata("claude")?.permissions();
            perms.set_mode(0o755);
            fs::set_permissions("claude", perms)?;
            
            // Retry spawn
            Command::new("claude").spawn()?
        }
        
        #[cfg(not(unix))]
        return Err("Claude binary not executable");
    }
}
```

### Error: Resource Exhaustion
```rust
// Scenario: System out of resources (PIDs, memory, file handles)
match Command::new("claude").spawn() {
    Err(e) if e.raw_os_error() == Some(11) => { // EAGAIN
        // Wait and retry with exponential backoff
        for attempt in 0..5 {
            tokio::time::sleep(Duration::from_millis(100 * 2_u64.pow(attempt))).await;
            
            if let Ok(child) = Command::new("claude").spawn() {
                return Ok(child);
            }
        }
        
        Err("System resources exhausted. Close other applications.")
    }
}
```

## Session ID Extraction Failures

### Error: No Session ID in Output
```rust
// Scenario: Claude doesn't output session ID (wrong version, error)
async fn extract_session_id_with_fallback(
    stdout: &mut BufReader<ChildStdout>
) -> Result<String> {
    match timeout(Duration::from_secs(2), extract_session_id(stdout)).await {
        Ok(Ok(id)) => Ok(id),
        Ok(Err(_)) | Err(_) => {
            // Fallback: Generate synthetic session ID
            let synthetic_id = generate_synthetic_session_id();
            log::warn!("Using synthetic session ID: {}", synthetic_id);
            Ok(synthetic_id)
        }
    }
}

fn generate_synthetic_session_id() -> String {
    use rand::Rng;
    const CHARSET: &[u8] = b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let mut rng = rand::thread_rng();
    
    (0..26)
        .map(|_| {
            let idx = rng.gen_range(0..CHARSET.len());
            CHARSET[idx] as char
        })
        .collect()
}
```

### Error: Malformed Session ID
```rust
// Scenario: Session ID exists but wrong format
fn validate_session_id(id: &str) -> Result<String> {
    // Must be exactly 26 alphanumeric characters
    if id.len() != 26 {
        return Err(format!("Invalid session ID length: {} (expected 26)", id.len()));
    }
    
    if !id.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err("Session ID contains invalid characters".to_string());
    }
    
    Ok(id.to_string())
}

// Recovery: Clean and pad/truncate
fn repair_session_id(id: &str) -> String {
    let clean: String = id.chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .take(26)
        .collect();
    
    if clean.len() < 26 {
        // Pad with zeros
        format!("{:0<26}", clean)
    } else {
        clean
    }
}
```

## Stream Parsing Failures

### Error: Incomplete JSON
```rust
// Scenario: Network interruption causes partial JSON
struct RobustJsonParser {
    buffer: String,
    max_buffer_size: usize,
}

impl RobustJsonParser {
    fn parse_partial(&mut self, data: &str) -> Vec<serde_json::Value> {
        self.buffer.push_str(data);
        let mut complete_jsons = Vec::new();
        
        // Try to extract complete JSON objects
        let mut depth = 0;
        let mut start = 0;
        
        for (i, ch) in self.buffer.char_indices() {
            match ch {
                '{' => depth += 1,
                '}' => {
                    depth -= 1;
                    if depth == 0 {
                        // Found complete object
                        let json_str = &self.buffer[start..=i];
                        if let Ok(json) = serde_json::from_str(json_str) {
                            complete_jsons.push(json);
                        }
                        start = i + 1;
                    }
                }
                _ => {}
            }
        }
        
        // Keep incomplete portion for next call
        if start < self.buffer.len() {
            self.buffer = self.buffer[start..].to_string();
        } else {
            self.buffer.clear();
        }
        
        // Prevent buffer overflow
        if self.buffer.len() > self.max_buffer_size {
            log::error!("JSON buffer overflow, clearing");
            self.buffer.clear();
        }
        
        complete_jsons
    }
}
```

### Error: Invalid UTF-8
```rust
// Scenario: Binary data or corruption in stream
fn handle_invalid_utf8(bytes: &[u8]) -> String {
    // Try to recover as much valid UTF-8 as possible
    String::from_utf8_lossy(bytes).into_owned()
}

// When reading from stdout
let mut buf = vec![0u8; 8192];
match stdout.read(&mut buf).await {
    Ok(n) => {
        let text = handle_invalid_utf8(&buf[..n]);
        // Process text...
    }
}
```

## Process Management Failures

### Error: Zombie Processes
```rust
// Scenario: Parent dies, child becomes zombie
async fn reap_zombies() {
    loop {
        tokio::time::sleep(Duration::from_secs(60)).await;
        
        #[cfg(unix)]
        {
            // Reap any zombie children
            unsafe {
                while libc::waitpid(-1, std::ptr::null_mut(), libc::WNOHANG) > 0 {
                    log::info!("Reaped zombie process");
                }
            }
        }
    }
}
```

### Error: Process Won't Die
```rust
// Scenario: Process ignores SIGTERM
async fn force_kill_process(child: &mut Child) -> Result<()> {
    // Try graceful shutdown
    child.kill().await?;
    
    // Wait up to 5 seconds
    match timeout(Duration::from_secs(5), child.wait()).await {
        Ok(Ok(_)) => return Ok(()),
        _ => {
            // Force kill
            if let Some(pid) = child.id() {
                #[cfg(unix)]
                unsafe {
                    libc::kill(pid as i32, libc::SIGKILL);
                }
                
                #[cfg(windows)]
                {
                    let _ = std::process::Command::new("taskkill")
                        .args(["/F", "/PID", &pid.to_string()])
                        .output();
                }
            }
        }
    }
    
    Ok(())
}
```

### Error: Orphaned Processes
```rust
// Scenario: Parent crashes, children keep running
fn setup_process_group() {
    #[cfg(unix)]
    unsafe {
        // Create new process group
        libc::setpgid(0, 0);
        
        // Register cleanup on parent exit
        extern "C" fn cleanup_handler(_: i32) {
            // Kill entire process group
            libc::killpg(libc::getpgid(0), libc::SIGTERM);
        }
        
        libc::signal(libc::SIGTERM, cleanup_handler as usize);
        libc::signal(libc::SIGINT, cleanup_handler as usize);
    }
}
```

## Network and IPC Failures

### Error: Pipe Broken
```rust
// Scenario: Reading from closed pipe
async fn read_with_broken_pipe_handling(
    reader: &mut BufReader<ChildStdout>
) -> Result<String> {
    let mut line = String::new();
    
    match reader.read_line(&mut line).await {
        Ok(0) => Err("EOF reached".into()),
        Ok(_) => Ok(line),
        Err(e) if e.kind() == io::ErrorKind::BrokenPipe => {
            Err("Process terminated unexpectedly".into())
        }
        Err(e) => Err(e.into())
    }
}
```

### Error: Buffer Full
```rust
// Scenario: Writing to full pipe buffer
async fn write_with_backpressure(
    stdin: &mut ChildStdin,
    data: &[u8]
) -> Result<()> {
    let chunk_size = 4096;
    
    for chunk in data.chunks(chunk_size) {
        loop {
            match stdin.write(chunk).await {
                Ok(_) => break,
                Err(e) if e.kind() == io::ErrorKind::WouldBlock => {
                    // Buffer full, wait
                    tokio::time::sleep(Duration::from_millis(10)).await;
                }
                Err(e) => return Err(e.into()),
            }
        }
    }
    
    stdin.flush().await?;
    Ok(())
}
```

## File System Failures

### Error: Session File Locked
```rust
// Scenario: Another process has session file open
use fs2::FileExt;

fn open_session_with_retry(path: &Path) -> Result<File> {
    for attempt in 0..10 {
        let file = File::open(path)?;
        
        match file.try_lock_shared() {
            Ok(_) => return Ok(file),
            Err(_) => {
                // File locked, wait and retry
                std::thread::sleep(Duration::from_millis(100 * attempt));
            }
        }
    }
    
    Err("Session file locked by another process".into())
}
```

### Error: Disk Full
```rust
// Scenario: No space to write session data
fn write_with_space_check(path: &Path, data: &[u8]) -> Result<()> {
    // Check available space
    let metadata = fs2::statvfs(path.parent().unwrap())?;
    let available = metadata.available_space();
    
    if available < data.len() as u64 + 1024 * 1024 { // Keep 1MB buffer
        return Err("Insufficient disk space".into());
    }
    
    // Write with atomic rename
    let temp_path = path.with_extension("tmp");
    fs::write(&temp_path, data)?;
    fs::rename(temp_path, path)?;
    
    Ok(())
}
```

## Memory Issues

### Error: Out of Memory
```rust
// Scenario: System running low on memory
fn check_memory_before_spawn() -> Result<()> {
    #[cfg(unix)]
    {
        let mut info = std::mem::zeroed::<libc::sysinfo>();
        unsafe {
            if libc::sysinfo(&mut info) == 0 {
                let free_mb = (info.freeram * info.mem_unit as u64) / 1024 / 1024;
                
                if free_mb < 100 { // Less than 100MB free
                    return Err("Insufficient memory. Close other applications.".into());
                }
            }
        }
    }
    
    Ok(())
}
```

### Error: Memory Leak Detection
```rust
// Scenario: Process memory growing unbounded
struct MemoryMonitor {
    last_size: usize,
    growth_count: usize,
}

impl MemoryMonitor {
    async fn check_memory_growth(&mut self) -> Result<()> {
        let current = get_memory_usage();
        
        if current > self.last_size + 10_000_000 { // 10MB growth
            self.growth_count += 1;
            
            if self.growth_count > 10 {
                // Sustained growth, likely a leak
                return Err("Memory leak detected".into());
            }
        } else {
            self.growth_count = 0;
        }
        
        self.last_size = current;
        Ok(())
    }
}
```

## Race Conditions

### Error: Concurrent Session Access
```rust
// Scenario: Multiple processes trying to use same session
use std::sync::Arc;
use tokio::sync::Semaphore;

struct SessionLock {
    locks: Arc<DashMap<String, Arc<Semaphore>>>,
}

impl SessionLock {
    async fn acquire(&self, session_id: &str) -> SemaphorePermit {
        let sem = self.locks
            .entry(session_id.to_string())
            .or_insert_with(|| Arc::new(Semaphore::new(1)))
            .clone();
        
        sem.acquire().await.unwrap()
    }
}

// Usage
let _permit = session_lock.acquire(session_id).await;
// Do work with exclusive session access
// Permit dropped automatically
```

### Error: PID Reuse
```rust
// Scenario: OS reuses PID before we clean up
struct ProcessTracker {
    processes: HashMap<u32, (Instant, String)>, // PID -> (start_time, session_id)
}

impl ProcessTracker {
    fn verify_process(&self, pid: u32) -> bool {
        if let Some((start_time, _)) = self.processes.get(&pid) {
            // Check if process start time matches
            #[cfg(unix)]
            {
                let stat_path = format!("/proc/{}/stat", pid);
                if let Ok(stat) = fs::read_to_string(stat_path) {
                    // Parse start time from stat
                    // If different, PID was reused
                }
            }
        }
        false
    }
}
```

## Platform-Specific Edge Cases

### macOS: Sandbox Restrictions
```rust
// Scenario: Running from sandboxed app
#[cfg(target_os = "macos")]
fn handle_sandbox_restrictions() -> Result<()> {
    // Check if sandboxed
    if env::var("APP_SANDBOX_CONTAINER_ID").is_ok() {
        // We're sandboxed, need special handling
        
        // Use security-scoped bookmarks for file access
        // Use XPC for privileged operations
        // Add --dangerously-skip-permissions flag
        
        return Err("Running in sandbox. Some features limited.".into());
    }
    
    Ok(())
}
```

### Windows: Antivirus Interference
```rust
// Scenario: Antivirus blocks or delays execution
#[cfg(windows)]
async fn spawn_with_antivirus_retry(cmd: &str) -> Result<Child> {
    for attempt in 0..5 {
        match Command::new(cmd).spawn() {
            Ok(child) => return Ok(child),
            Err(e) if e.kind() == io::ErrorKind::PermissionDenied => {
                // Might be antivirus scan
                log::warn!("Spawn blocked, attempt {}/5", attempt + 1);
                tokio::time::sleep(Duration::from_secs(2)).await;
            }
            Err(e) => return Err(e.into()),
        }
    }
    
    Err("Failed after 5 attempts. Check antivirus settings.".into())
}
```

### Linux: Different Init Systems
```rust
// Scenario: systemd vs init.d vs upstart
#[cfg(target_os = "linux")]
fn detect_init_system() -> &'static str {
    if Path::new("/run/systemd/system").exists() {
        "systemd"
    } else if Path::new("/etc/init.d").exists() {
        "sysvinit"
    } else {
        "unknown"
    }
}
```

## Recovery Strategies Summary

| Error Type | Detection | Recovery | Prevention |
|------------|-----------|----------|------------|
| Binary not found | ENOENT | Search multiple paths | Bundle Claude |
| Permission denied | EACCES | chmod +x | Check on startup |
| Process won't die | Still running after SIGTERM | SIGKILL | Timeout kills |
| Zombie process | waitpid returns > 0 | Reap periodically | Proper wait() |
| Memory leak | RSS growth | Restart process | Monitor memory |
| Pipe broken | EPIPE | Restart process | Check before write |
| Session locked | flock fails | Wait and retry | Use lock files |
| Disk full | ENOSPC | Clean old sessions | Monitor space |
| PID reuse | Start time mismatch | Verify process | Use handles not PIDs |

## Testing Error Scenarios

```rust
#[cfg(test)]
mod error_tests {
    #[test]
    fn test_binary_not_found() {
        let result = Command::new("nonexistent").spawn();
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().kind(), io::ErrorKind::NotFound);
    }
    
    #[test]
    fn test_zombie_reaping() {
        // Create zombie
        let mut child = Command::new("sleep").arg("0").spawn().unwrap();
        let pid = child.id().unwrap();
        
        // Don't wait() - creates zombie
        drop(child);
        
        // Verify zombie exists and reap it
        unsafe {
            let result = libc::waitpid(pid as i32, std::ptr::null_mut(), libc::WNOHANG);
            assert!(result > 0);
        }
    }
    
    #[test]
    fn test_memory_leak_detection() {
        let mut monitor = MemoryMonitor::default();
        
        // Simulate leak
        for _ in 0..15 {
            monitor.last_size += 11_000_000; // 11MB growth
            assert!(monitor.check_memory_growth().await.is_err());
        }
    }
}
```

This comprehensive documentation covers all edge cases and error scenarios that can occur when implementing Claude CLI integration.