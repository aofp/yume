# ProcessRegistry: Complete Implementation Guide

## Overview

The ProcessRegistry is **THE MOST CRITICAL COMPONENT** for preventing orphaned processes and memory leaks. Without it, Claude processes continue running invisibly after the UI loses track of them.

## Architecture

```rust
/// The complete ProcessRegistry system from claudia
pub struct ProcessRegistry {
    processes: Arc<Mutex<HashMap<i64, ProcessHandle>>>, // run_id -> ProcessHandle
    next_id: Arc<Mutex<i64>>,                          // Auto-incrementing ID
}

pub struct ProcessHandle {
    pub info: ProcessInfo,
    pub child: Arc<Mutex<Option<Child>>>,  // The actual process
    pub live_output: Arc<Mutex<String>>,   // Accumulating output
}

pub struct ProcessInfo {
    pub run_id: i64,
    pub process_type: ProcessType,
    pub pid: u32,
    pub started_at: DateTime<Utc>,
    pub project_path: String,
    pub task: String,
    pub model: String,
}

pub enum ProcessType {
    AgentRun { agent_id: i64, agent_name: String },
    ClaudeSession { session_id: String },
}
```

## Critical Implementation Details

### 1. Process Registration MUST Happen Immediately

```rust
// CRITICAL: Register BEFORE any async operations
async fn spawn_claude_process(
    prompt: &str,
    session_id: Option<String>
) -> Result<String, Error> {
    // Spawn the process
    let mut child = Command::new("claude")
        .arg("--prompt").arg(prompt)
        .arg("--output-format").arg("stream-json")
        .arg("--print")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    
    // Get PID immediately
    let pid = child.id().ok_or("No PID")?;
    
    // CRITICAL: Register BEFORE reading stdout!
    // If you wait for session_id from stdout, the process might crash first
    let temp_run_id = registry.generate_id()?;
    registry.register_temp_process(temp_run_id, pid, child);
    
    // NOW safe to extract session_id
    let session_id = extract_session_id(&mut child.stdout).await?;
    
    // Update registration with real session_id
    registry.update_session_id(temp_run_id, session_id);
}
```

### 2. Session ID Extraction Pattern

```rust
/// Extract session ID from Claude's init message
/// MUST happen within 500ms of spawn
async fn extract_session_id(
    stdout: &mut BufReader<ChildStdout>
) -> Result<String, Error> {
    // Use timeout to prevent hanging
    timeout(Duration::from_millis(500), async {
        let mut line = String::new();
        
        while stdout.read_line(&mut line).await? > 0 {
            // Look for init message
            if line.contains(r#""type":"system"#) && 
               line.contains(r#""subtype":"init"#) {
                // Parse JSON to get session_id
                if let Ok(json) = serde_json::from_str::<Value>(&line) {
                    if let Some(id) = json["session_id"].as_str() {
                        return Ok(id.to_string());
                    }
                }
            }
            line.clear();
        }
        
        Err("Session ID not found in init message")
    }).await?
}
```

### 3. Process Cleanup MUST Be Guaranteed

```rust
impl Drop for ProcessRegistry {
    fn drop(&mut self) {
        // CRITICAL: Kill all processes on shutdown
        let processes = self.processes.lock().unwrap();
        for (run_id, handle) in processes.iter() {
            if let Some(child) = handle.child.lock().unwrap().as_mut() {
                // Try graceful shutdown first
                let _ = child.kill();
                
                // Force kill if still running
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
    }
}
```

## Platform-Specific Process Management

### macOS Process Killing

```rust
#[cfg(target_os = "macos")]
pub fn kill_process_tree(pid: u32) -> Result<(), Error> {
    // First, find all child processes
    let output = std::process::Command::new("pgrep")
        .arg("-P")
        .arg(pid.to_string())
        .output()?;
    
    let children = String::from_utf8_lossy(&output.stdout);
    
    // Kill children first
    for child_pid in children.lines() {
        if let Ok(cpid) = child_pid.trim().parse::<i32>() {
            unsafe {
                libc::kill(cpid, libc::SIGTERM);
            }
        }
    }
    
    // Then kill parent
    unsafe {
        // Try SIGTERM first
        libc::kill(pid as i32, libc::SIGTERM);
        
        // Wait 2 seconds
        std::thread::sleep(Duration::from_secs(2));
        
        // Check if still running
        if libc::kill(pid as i32, 0) == 0 {
            // Still alive, use SIGKILL
            libc::kill(pid as i32, libc::SIGKILL);
        }
    }
    
    Ok(())
}
```

### Windows Process Killing

```rust
#[cfg(target_os = "windows")]
pub fn kill_process_tree(pid: u32) -> Result<(), Error> {
    // Windows kills child processes automatically with /T flag
    let output = std::process::Command::new("taskkill")
        .args(["/F", "/T", "/PID", &pid.to_string()])
        .output()?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(Error::KillFailed(stderr.to_string()));
    }
    
    Ok(())
}
```

### Linux Process Killing

```rust
#[cfg(target_os = "linux")]
pub fn kill_process_tree(pid: u32) -> Result<(), Error> {
    // Use process group to kill all children
    unsafe {
        // Get process group ID
        let pgid = libc::getpgid(pid as i32);
        
        if pgid > 0 {
            // Kill entire process group
            libc::killpg(pgid, libc::SIGTERM);
            
            // Wait and force kill if needed
            std::thread::sleep(Duration::from_secs(2));
            libc::killpg(pgid, libc::SIGKILL);
        } else {
            // Fallback to single process kill
            libc::kill(pid as i32, libc::SIGKILL);
        }
    }
    
    Ok(())
}
```

## Complete ProcessRegistry Implementation

```rust
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::process::Child;
use chrono::{DateTime, Utc};

pub struct ProcessRegistry {
    processes: Arc<Mutex<HashMap<i64, ProcessHandle>>>,
    next_id: Arc<Mutex<i64>>,
    
    // Tracking for orphan detection
    pid_to_run_id: Arc<Mutex<HashMap<u32, i64>>>,
    session_to_run_id: Arc<Mutex<HashMap<String, i64>>>,
}

impl ProcessRegistry {
    pub fn new() -> Self {
        Self {
            processes: Arc::new(Mutex::new(HashMap::new())),
            next_id: Arc::new(Mutex::new(1000000)),
            pid_to_run_id: Arc::new(Mutex::new(HashMap::new())),
            session_to_run_id: Arc::new(Mutex::new(HashMap::new())),
        }
    }
    
    /// Generate unique ID for tracking
    pub fn generate_id(&self) -> Result<i64, String> {
        let mut next_id = self.next_id.lock().map_err(|e| e.to_string())?;
        let id = *next_id;
        *next_id += 1;
        Ok(id)
    }
    
    /// Register a Claude session with temporary ID (before session_id known)
    pub fn register_temp_process(
        &self,
        run_id: i64,
        pid: u32,
        child: Child,
    ) -> Result<(), String> {
        let mut processes = self.processes.lock().map_err(|e| e.to_string())?;
        let mut pid_map = self.pid_to_run_id.lock().map_err(|e| e.to_string())?;
        
        // Check for existing process with same PID
        if let Some(existing_run_id) = pid_map.get(&pid) {
            log::warn!("PID {} already registered as run_id {}", pid, existing_run_id);
            // Kill the existing process as it's likely orphaned
            if let Some(handle) = processes.get_mut(existing_run_id) {
                if let Some(child) = handle.child.lock().unwrap().as_mut() {
                    let _ = child.kill();
                }
            }
            processes.remove(existing_run_id);
            pid_map.remove(&pid);
        }
        
        let handle = ProcessHandle {
            info: ProcessInfo {
                run_id,
                process_type: ProcessType::ClaudeSession { 
                    session_id: format!("temp_{}", run_id) 
                },
                pid,
                started_at: Utc::now(),
                project_path: String::new(),
                task: String::new(),
                model: String::new(),
            },
            child: Arc::new(Mutex::new(Some(child))),
            live_output: Arc::new(Mutex::new(String::new())),
        };
        
        processes.insert(run_id, handle);
        pid_map.insert(pid, run_id);
        
        Ok(())
    }
    
    /// Update temporary registration with real session_id
    pub fn update_session_id(
        &self,
        run_id: i64,
        session_id: String,
    ) -> Result<(), String> {
        let mut processes = self.processes.lock().map_err(|e| e.to_string())?;
        let mut session_map = self.session_to_run_id.lock().map_err(|e| e.to_string())?;
        
        if let Some(handle) = processes.get_mut(&run_id) {
            // Update process type with real session_id
            handle.info.process_type = ProcessType::ClaudeSession { 
                session_id: session_id.clone() 
            };
            
            // Update session mapping
            session_map.insert(session_id, run_id);
            
            Ok(())
        } else {
            Err(format!("Run ID {} not found", run_id))
        }
    }
    
    /// Kill a process by session_id
    pub async fn kill_by_session_id(&self, session_id: &str) -> Result<(), String> {
        let session_map = self.session_to_run_id.lock().map_err(|e| e.to_string())?;
        
        if let Some(run_id) = session_map.get(session_id).copied() {
            drop(session_map); // Release lock before calling kill
            self.kill_by_run_id(run_id).await
        } else {
            Err(format!("Session {} not found", session_id))
        }
    }
    
    /// Kill a process by run_id
    pub async fn kill_by_run_id(&self, run_id: i64) -> Result<(), String> {
        let mut processes = self.processes.lock().map_err(|e| e.to_string())?;
        let mut pid_map = self.pid_to_run_id.lock().map_err(|e| e.to_string())?;
        let mut session_map = self.session_to_run_id.lock().map_err(|e| e.to_string())?;
        
        if let Some(handle) = processes.remove(&run_id) {
            // Remove from maps
            pid_map.remove(&handle.info.pid);
            if let ProcessType::ClaudeSession { session_id } = &handle.info.process_type {
                session_map.remove(session_id);
            }
            
            // Kill the process
            if let Some(mut child) = handle.child.lock().unwrap().take() {
                match child.kill().await {
                    Ok(_) => {
                        log::info!("Killed process {} (PID: {})", run_id, handle.info.pid);
                    }
                    Err(e) => {
                        log::error!("Failed to kill process: {}", e);
                        // Try platform-specific kill
                        kill_process_tree(handle.info.pid)?;
                    }
                }
            }
            
            Ok(())
        } else {
            Err(format!("Run ID {} not found", run_id))
        }
    }
    
    /// Check for orphaned processes
    pub async fn cleanup_orphans(&self) {
        let mut orphans = Vec::new();
        
        {
            let processes = self.processes.lock().unwrap();
            for (run_id, handle) in processes.iter() {
                // Check if process is still alive
                if let Some(child) = handle.child.lock().unwrap().as_mut() {
                    match child.try_wait() {
                        Ok(Some(_status)) => {
                            // Process has exited
                            orphans.push(*run_id);
                        }
                        Ok(None) => {
                            // Still running, check if it's been too long
                            let duration = Utc::now() - handle.info.started_at;
                            if duration.num_hours() > 24 {
                                log::warn!("Process {} running for {} hours, considering orphaned",
                                         run_id, duration.num_hours());
                                orphans.push(*run_id);
                            }
                        }
                        Err(e) => {
                            log::error!("Error checking process {}: {}", run_id, e);
                            orphans.push(*run_id);
                        }
                    }
                } else {
                    // No child handle, definitely orphaned
                    orphans.push(*run_id);
                }
            }
        }
        
        // Clean up orphans
        for run_id in orphans {
            log::info!("Cleaning up orphaned process {}", run_id);
            let _ = self.kill_by_run_id(run_id).await;
        }
    }
    
    /// Get all active sessions
    pub fn get_active_sessions(&self) -> Vec<(String, ProcessInfo)> {
        let processes = self.processes.lock().unwrap();
        let mut sessions = Vec::new();
        
        for handle in processes.values() {
            if let ProcessType::ClaudeSession { session_id } = &handle.info.process_type {
                sessions.push((session_id.clone(), handle.info.clone()));
            }
        }
        
        sessions
    }
    
    /// Emergency kill all
    pub async fn kill_all(&self) {
        let processes = self.processes.lock().unwrap();
        let run_ids: Vec<i64> = processes.keys().copied().collect();
        drop(processes);
        
        for run_id in run_ids {
            let _ = self.kill_by_run_id(run_id).await;
        }
    }
}

impl Drop for ProcessRegistry {
    fn drop(&mut self) {
        // Synchronously kill all processes on drop
        let processes = self.processes.lock().unwrap();
        for (_run_id, handle) in processes.iter() {
            if let Some(mut child) = handle.child.lock().unwrap().take() {
                let _ = child.start_kill();
                
                // Force kill by PID
                #[cfg(unix)]
                unsafe {
                    libc::kill(handle.info.pid as i32, libc::SIGKILL);
                }
                
                #[cfg(windows)]
                {
                    let _ = std::process::Command::new("taskkill")
                        .args(["/F", "/PID", &handle.info.pid.to_string()])
                        .output();
                }
            }
        }
    }
}
```

## Integration with Tauri

```rust
// main.rs
fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Initialize ProcessRegistry
            let registry = ProcessRegistry::new();
            
            // Start orphan cleanup task
            let registry_clone = registry.clone();
            tokio::spawn(async move {
                let mut interval = tokio::time::interval(Duration::from_secs(60));
                loop {
                    interval.tick().await;
                    registry_clone.cleanup_orphans().await;
                }
            });
            
            // Store in app state
            app.manage(registry);
            
            Ok(())
        })
        .on_window_close_requested(|app, _event| {
            // Kill all processes when window closes
            let registry = app.state::<ProcessRegistry>();
            tokio::runtime::Handle::current().block_on(async {
                registry.kill_all().await;
            });
            // Allow close
            false
        })
        .run(tauri::generate_context!())
        .expect("error running tauri app");
}
```

## Common Bugs and Solutions

### Bug 1: Process Not Registered Before Crash

```rust
// WRONG - Process crashes before registration
let mut child = spawn_claude()?;
let session_id = read_session_id(&mut child).await?; // Might crash here!
registry.register(session_id, child); // Never reached

// RIGHT - Register immediately
let mut child = spawn_claude()?;
let temp_id = registry.register_temp(child)?;
let session_id = read_session_id(&mut child).await?;
registry.update_with_session(temp_id, session_id);
```

### Bug 2: Zombie Processes

```rust
// WRONG - Child becomes zombie
child.kill().await?; // Parent dead, child zombie

// RIGHT - Ensure complete cleanup
child.kill().await?;
child.wait().await?; // Reap zombie
```

### Bug 3: PID Reuse

```rust
// WRONG - PID might be reused
let pid = child.id();
// ... time passes ...
kill_process(pid); // Might kill wrong process!

// RIGHT - Keep child handle
registry.track_process(child);
registry.kill_by_session_id(session_id); // Uses handle, not PID
```

## Testing the Registry

```rust
#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn test_no_orphans() {
        let registry = ProcessRegistry::new();
        
        // Spawn 10 processes
        for i in 0..10 {
            let child = spawn_test_process().await.unwrap();
            let run_id = registry.register_temp_process(
                i, 
                child.id().unwrap(), 
                child
            ).unwrap();
        }
        
        // Kill registry (should kill all)
        drop(registry);
        
        // Check no processes remain
        let remaining = count_test_processes();
        assert_eq!(remaining, 0, "Orphaned processes found!");
    }
}
```

## Critical Takeaways

1. **Always register processes IMMEDIATELY after spawning**
2. **Use ProcessRegistry for ALL process management**
3. **Never rely on PID alone - PIDs can be reused**
4. **Implement Drop trait to guarantee cleanup**
5. **Run periodic orphan cleanup**
6. **Test with process crashes and force kills**

Without ProcessRegistry, yurucode will leak processes that run forever, consuming memory and CPU until the system crashes.