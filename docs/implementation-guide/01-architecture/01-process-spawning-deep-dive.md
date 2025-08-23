# Process Spawning Deep Dive: Complete Implementation Guide

## Table of Contents
1. [Critical Architecture Differences](#critical-architecture-differences)
2. [Claudia's Native Process Spawning](#claudias-native-process-spawning)
3. [Yurucode's Embedded Server Issues](#yurucodes-embedded-server-issues)
4. [Gotchas and Edge Cases](#gotchas-and-edge-cases)
5. [Implementation Blueprint](#implementation-blueprint)

---

## Critical Architecture Differences

### The Fundamental Problem

**Yurucode's Current Flow:**
```
React → Socket.IO → Node.js (embedded string) → spawn() → WSL (Windows) → Claude CLI
```

**Claudia's Direct Flow:**
```
React → Tauri IPC → Rust tokio::process → Claude CLI
```

### Why This Matters

1. **Process Orphaning**: Node.js crash leaves Claude processes running
2. **Signal Propagation**: Ctrl+C doesn't properly propagate through layers
3. **Memory Leaks**: Node.js server accumulates session data
4. **Debugging Nightmare**: Line numbers in embedded string don't match reality
5. **Hot Reload Broken**: Must rebuild Rust to change JavaScript

---

## Claudia's Native Process Spawning

### Complete spawn_claude_process Implementation

```rust
// claudia/src-tauri/src/commands/claude.rs - Lines 1157-1322

async fn spawn_claude_process(
    app: AppHandle, 
    mut cmd: Command, 
    prompt: String, 
    model: String, 
    project_path: String
) -> Result<(), String> {
    // CRITICAL PATTERN 1: Tokio BufReader for async line reading
    use tokio::io::{AsyncBufReadExt, BufReader};
    use std::sync::Mutex;

    // GOTCHA #1: Must take stdout/stderr BEFORE spawning
    let mut child = cmd.spawn()
        .map_err(|e| format!("Failed to spawn Claude: {}", e))?;
    
    // CRITICAL: Take handles immediately after spawn
    let stdout = child.stdout.take().ok_or("Failed to get stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to get stderr")?;
    
    // GOTCHA #2: Get PID immediately for tracking
    let pid = child.id().unwrap_or(0);
    
    // PATTERN: Arc<Mutex> for thread-safe session ID extraction
    let session_id_holder: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
    let run_id_holder: Arc<Mutex<Option<i64>>> = Arc::new(Mutex::new(None));
    
    // CRITICAL: Store child in global state BEFORE processing output
    let claude_state = app.state::<ClaudeProcessState>();
    {
        let mut current_process = claude_state.current_process.lock().await;
        // GOTCHA #3: Kill existing process to prevent multiple simultaneous
        if let Some(mut existing_child) = current_process.take() {
            log::warn!("Killing existing Claude process before starting new one");
            let _ = existing_child.kill().await;
        }
        *current_process = Some(child);
    }
    
    // PATTERN: Spawn separate tasks for stdout and stderr
    let stdout_task = tokio::spawn(async move {
        let mut lines = stdout_reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            // CRITICAL: Parse EVERY line for session ID extraction
            if let Ok(msg) = serde_json::from_str::<serde_json::Value>(&line) {
                if msg["type"] == "system" && msg["subtype"] == "init" {
                    if let Some(claude_session_id) = msg["session_id"].as_str() {
                        // GOTCHA #4: Lock and check for None to avoid double registration
                        let mut session_id_guard = session_id_holder_clone.lock().unwrap();
                        if session_id_guard.is_none() {
                            *session_id_guard = Some(claude_session_id.to_string());
                            
                            // CRITICAL: Register with ProcessRegistry immediately
                            match registry_clone.register_claude_session(
                                claude_session_id.to_string(),
                                pid,
                                project_path_clone.clone(),
                                prompt_clone.clone(),
                                model_clone.clone(),
                            ) {
                                Ok(run_id) => {
                                    let mut run_id_guard = run_id_holder_clone.lock().unwrap();
                                    *run_id_guard = Some(run_id);
                                }
                                Err(e) => {
                                    log::error!("Failed to register: {}", e);
                                }
                            }
                        }
                    }
                }
            }
            
            // PATTERN: Store live output for debugging
            if let Some(run_id) = *run_id_holder_clone.lock().unwrap() {
                let _ = registry_clone.append_live_output(run_id, &line);
            }
            
            // CRITICAL: Emit with session isolation
            if let Some(ref session_id) = *session_id_holder_clone.lock().unwrap() {
                let _ = app_handle.emit(&format!("claude-output:{}", session_id), &line);
            }
            // GOTCHA #5: Also emit generic event for backward compatibility
            let _ = app_handle.emit("claude-output", &line);
        }
    });
    
    // PATTERN: Separate wait task to avoid blocking
    tokio::spawn(async move {
        let _ = stdout_task.await;
        let _ = stderr_task.await;
        
        // CRITICAL: Get child from state to wait on it
        let mut current_process = claude_state_wait.lock().await;
        if let Some(mut child) = current_process.take() {
            match child.wait().await {
                Ok(status) => {
                    // GOTCHA #6: Add delay to ensure all messages are processed
                    tokio::time::sleep(Duration::from_millis(100)).await;
                    
                    // Emit completion with session isolation
                    if let Some(ref session_id) = *session_id_holder_clone3.lock().unwrap() {
                        let _ = app_handle_wait.emit(
                            &format!("claude-complete:{}", session_id),
                            status.success(),
                        );
                    }
                }
                Err(e) => {
                    log::error!("Failed to wait: {}", e);
                }
            }
        }
        
        // CRITICAL: Unregister from ProcessRegistry
        if let Some(run_id) = *run_id_holder_clone2.lock().unwrap() {
            let _ = registry_clone2.unregister_process(run_id);
        }
        
        // Clear the process from state
        *current_process = None;
    });
    
    Ok(())
}
```

### Key Patterns to Implement

1. **Thread-Safe Session ID Extraction**
   - Use `Arc<Mutex<Option<String>>>` for session ID holder
   - Check for None before setting to avoid double registration

2. **Process Registry Integration**
   - Register immediately after getting session ID
   - Store run_id for later cleanup
   - Append live output for debugging

3. **Dual Event Emission**
   - Session-specific events: `claude-output:{session_id}`
   - Generic events for backward compatibility

4. **Graceful Process Cleanup**
   - Always unregister from ProcessRegistry
   - Clear process from state
   - Add delays for message processing

---

## Yurucode's Embedded Server Issues

### The Embedded Server Anti-Pattern

**Current Implementation (logged_server.rs):**
```rust
// Line 124: Start of 3500+ line JavaScript string
const EMBEDDED_SERVER: &str = r#"
/**
 * macOS-compatible server that runs claude CLI directly
 * IDENTICAL TO WINDOWS SERVER - NO SDK, NO API KEY
 */
// ... 3500+ lines of JavaScript as a string ...
"#;
```

### Critical Problems

1. **No Syntax Checking**
   ```javascript
   // This error won't be caught until runtime:
   const session = sessions.get(sessionId;  // Missing parenthesis
   ```

2. **WSL Translation Complexity**
   ```javascript
   // Lines 193-299: WSL path detection nightmare
   function createWslClaudeCommand(args, workingDir, message) {
       let wslUser = execSync(`wsl.exe -e bash -c "whoami"`).trim();
       
       const possiblePaths = [
           `/home/${wslUser}/.claude/local/node_modules/.bin/claude`,
           `~/.npm-global/bin/claude`,
           // ... 6 more paths to check
       ];
       
       // Complex bash script generation
       const script = `cat | ${claudePath} ${argsStr} 2>&1`;
       return [wslPath, ['-e', 'bash', '-c', script], true];
   }
   ```

3. **Session State in JavaScript Map**
   ```javascript
   // Line 532: In-memory session storage
   const sessions = new Map(); // Lost on server crash
   ```

4. **Process Spawn Queue (Anti-Pattern)**
   ```javascript
   // Lines 534-536: Attempted mutex in JavaScript
   let isSpawningProcess = false;
   const processSpawnQueue = [];
   // This doesn't actually prevent race conditions!
   ```

---

## Gotchas and Edge Cases

### 1. Session ID Extraction Timing

**Problem:** Claude doesn't send session ID immediately
```rust
// WRONG: Assuming first message has session_id
let first_line = lines.next_line().await?;
let msg = serde_json::from_str(&first_line)?;
let session_id = msg["session_id"].as_str()?; // WILL FAIL

// RIGHT: Parse every line until we find it
while let Ok(Some(line)) = lines.next_line().await {
    if let Ok(msg) = serde_json::from_str::<Value>(&line) {
        if msg["type"] == "system" && msg["subtype"] == "init" {
            if let Some(sid) = msg["session_id"].as_str() {
                // Found it!
            }
        }
    }
}
```

### 2. Process Already Running

**Problem:** User rapidly clicks "New Session"
```rust
// GOTCHA: Must kill existing process
let mut current_process = claude_state.current_process.lock().await;
if let Some(mut existing_child) = current_process.take() {
    // Don't just drop it - explicitly kill
    let _ = existing_child.kill().await;
    // Optional: Wait for it to actually die
    let _ = tokio::time::timeout(
        Duration::from_secs(2),
        existing_child.wait()
    ).await;
}
```

### 3. WSL Path Translation

**Problem:** Windows paths need complex translation
```rust
// Windows path: C:\Users\Name\Project
// WSL path: /mnt/c/Users/Name/Project

fn windows_to_wsl_path(win_path: &str) -> String {
    let path = win_path.replace('\\', "/");
    if path.starts_with("C:") {
        path.replace("C:", "/mnt/c")
    } else if path.starts_with("D:") {
        path.replace("D:", "/mnt/d")
    } else {
        path
    }
}
```

### 4. JSONL Parsing with Dollar Terminators

**Problem:** Claude uses $ as line terminator, but $ can appear in JSON
```javascript
// WRONG: Simple split
const lines = content.split('$');

// RIGHT: Proper JSON boundary detection (from yurucode)
let braceCount = 0;
let inString = false;
let escapeNext = false;

for (let i = currentPos; i < content.length; i++) {
    const char = content[i];
    
    if (escapeNext) {
        escapeNext = false;
        continue;
    }
    
    if (char === '\\') {
        escapeNext = true;
        continue;
    }
    
    if (char === '"' && !escapeNext) {
        inString = !inString;
        continue;
    }
    
    if (!inString) {
        if (char === '{') braceCount++;
        else if (char === '}') {
            braceCount--;
            if (braceCount === 0) {
                // Check if next char is $ or newline
                if (i + 1 < content.length) {
                    const nextChar = content[i + 1];
                    if (nextChar === '$' || nextChar === '\n') {
                        jsonEnd = i + 1;
                        break;
                    }
                }
            }
        }
    }
}
```

### 5. Stdout Buffer Overflow

**Problem:** Large tool outputs can overflow Node.js buffer
```javascript
// WRONG: Default buffer
const child = spawn(command, args);

// RIGHT: Increase buffer size
const child = spawn(command, args, {
    maxBuffer: 50 * 1024 * 1024 // 50MB
});

// BETTER: Stream processing (Claudia's approach)
const reader = BufReader::new(stdout);
while let Ok(Some(line)) = reader.lines().next_line().await {
    // Process line by line - no buffer limit
}
```

### 6. Process Kill on Windows vs Unix

**Problem:** Different kill mechanisms per platform
```rust
// Claudia's approach
pub async fn kill_process(&self, run_id: i64) -> Result<bool, String> {
    // Try graceful first
    match child.start_kill() {
        Ok(_) => {
            // Wait up to 5 seconds
            match timeout(Duration::from_secs(5), child.wait()).await {
                Ok(_) => return Ok(true),
                Err(_) => {} // Timeout, try force kill
            }
        }
        Err(_) => {}
    }
    
    // Platform-specific force kill
    if cfg!(target_os = "windows") {
        Command::new("taskkill")
            .args(["/F", "/PID", &pid.to_string()])
            .output()?;
    } else {
        // Unix: SIGTERM then SIGKILL
        Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .output()?;
        
        thread::sleep(Duration::from_secs(2));
        
        // Check if still running
        if Command::new("kill").args(["-0", &pid.to_string()]).output()?.status.success() {
            // Still running, force kill
            Command::new("kill")
                .args(["-KILL", &pid.to_string()])
                .output()?;
        }
    }
}
```

### 7. Environment Variable Inheritance

**Problem:** Claude needs proper PATH to find Node.js
```rust
// Claudia's create_command_with_env
fn create_command_with_env(program: &str) -> Command {
    let mut cmd = Command::new(program);
    
    // Critical environment variables to preserve
    for (key, value) in std::env::vars() {
        if key == "PATH"
            || key == "HOME"
            || key == "USER"
            || key == "SHELL"
            || key == "LANG"
            || key.starts_with("LC_")
            || key == "NODE_PATH"
            || key == "NVM_DIR"
            || key == "NVM_BIN"
            || key == "HOMEBREW_PREFIX"
        {
            cmd.env(&key, &value);
        }
    }
    
    // Special handling for NVM installations
    if program.contains("/.nvm/versions/node/") {
        if let Some(node_bin_dir) = Path::new(program).parent() {
            let current_path = env::var("PATH").unwrap_or_default();
            let node_bin_str = node_bin_dir.to_string_lossy();
            if !current_path.contains(&node_bin_str.as_ref()) {
                let new_path = format!("{}:{}", node_bin_str, current_path);
                cmd.env("PATH", new_path);
            }
        }
    }
    
    cmd
}
```

---

## Implementation Blueprint

### Phase 1: Remove Embedded Server

**Step 1: Extract server to separate file**
```rust
// logged_server.rs - BEFORE
const EMBEDDED_SERVER: &str = r#"...3500 lines..."#;

// logged_server.rs - AFTER
pub mod claude_process;
use claude_process::spawn_claude;
```

**Step 2: Create native spawn module**
```rust
// src-tauri/src/claude_process.rs
use tokio::process::{Command, Child};
use tokio::io::{AsyncBufReadExt, BufReader};

pub struct ClaudeProcess {
    child: Child,
    session_id: Option<String>,
    pid: u32,
}

impl ClaudeProcess {
    pub async fn spawn(
        project_path: &str,
        prompt: &str,
        model: &str,
        resume_id: Option<&str>,
    ) -> Result<Self, String> {
        let mut cmd = Command::new(find_claude_binary()?);
        
        // Build arguments
        if let Some(id) = resume_id {
            cmd.arg("--resume").arg(id);
        }
        cmd.arg("-p").arg(prompt)
           .arg("--model").arg(model)
           .arg("--output-format").arg("stream-json")
           .arg("--verbose")
           .arg("--dangerously-skip-permissions");
        
        cmd.current_dir(project_path);
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());
        
        let mut child = cmd.spawn()
            .map_err(|e| format!("Failed to spawn: {}", e))?;
        
        let pid = child.id().unwrap_or(0);
        
        Ok(Self {
            child,
            session_id: None,
            pid,
        })
    }
    
    pub async fn read_stdout_line(&mut self) -> Option<String> {
        // Implementation
    }
}
```

### Phase 2: Port ProcessRegistry

**Step 1: Copy Claudia's registry structure**
```rust
// src-tauri/src/process/registry.rs
pub struct ProcessRegistry {
    processes: Arc<Mutex<HashMap<i64, ProcessHandle>>>,
    next_id: Arc<Mutex<i64>>,
}

pub struct ProcessHandle {
    pub info: ProcessInfo,
    pub child: Arc<Mutex<Option<Child>>>,
    pub live_output: Arc<Mutex<String>>,
}
```

**Step 2: Add Tauri commands**
```rust
#[tauri::command]
pub async fn list_running_sessions(
    registry: State<'_, ProcessRegistryState>
) -> Result<Vec<ProcessInfo>, String> {
    registry.0.get_running_claude_sessions()
}

#[tauri::command]
pub async fn kill_session(
    registry: State<'_, ProcessRegistryState>,
    session_id: String
) -> Result<bool, String> {
    if let Some(info) = registry.0.get_claude_session_by_id(&session_id)? {
        registry.0.kill_process(info.run_id).await
    } else {
        Ok(false)
    }
}
```

### Phase 3: Update Frontend

**Step 1: Replace Socket.IO with Tauri events**
```typescript
// BEFORE: Socket.IO
socket.on('claude-stream', (data) => {
    handleMessage(data);
});

// AFTER: Tauri events
import { listen } from '@tauri-apps/api/event';

const unlisten = await listen(`claude-output:${sessionId}`, (event) => {
    handleMessage(event.payload);
});
```

**Step 2: Direct command invocation**
```typescript
// BEFORE: Socket.IO emit
socket.emit('claude-command', {
    sessionId,
    prompt,
    model,
    workingDirectory
});

// AFTER: Tauri invoke
import { invoke } from '@tauri-apps/api/tauri';

await invoke('execute_claude', {
    projectPath: workingDirectory,
    prompt,
    model,
    resumeId: sessionId
});
```

### Testing Strategy

1. **Unit Tests for Process Spawning**
```rust
#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    async fn test_spawn_with_resume() {
        let process = ClaudeProcess::spawn(
            "/tmp/test",
            "test prompt",
            "claude-3-5-sonnet-20241022",
            Some("existing-session-id")
        ).await;
        
        assert!(process.is_ok());
        let proc = process.unwrap();
        assert!(proc.pid > 0);
    }
}
```

2. **Integration Tests for Full Flow**
```rust
#[tokio::test]
async fn test_full_session_lifecycle() {
    // Spawn
    let session_id = execute_claude(
        "/tmp/test",
        "Write hello world",
        "sonnet"
    ).await.unwrap();
    
    // Verify in registry
    let sessions = list_running_sessions().await.unwrap();
    assert!(sessions.iter().any(|s| {
        matches!(&s.process_type, ProcessType::ClaudeSession { sid } if sid == &session_id)
    }));
    
    // Kill
    let killed = kill_session(session_id).await.unwrap();
    assert!(killed);
    
    // Verify removed
    let sessions = list_running_sessions().await.unwrap();
    assert!(!sessions.iter().any(|s| {
        matches!(&s.process_type, ProcessType::ClaudeSession { sid } if sid == &session_id)
    }));
}
```

---

## Summary of Critical Implementation Points

1. **Remove embedded server immediately** - It's unmaintainable
2. **Implement ProcessRegistry first** - Foundation for everything else
3. **Use tokio::process::Command** - Not std::process
4. **Parse every stdout line for session ID** - Don't assume first line
5. **Handle platform differences explicitly** - Windows vs Unix kill
6. **Stream processing over buffering** - Avoid overflow
7. **Test process lifecycle thoroughly** - Spawn, track, kill, cleanup
8. **Preserve environment variables** - Claude needs PATH
9. **Add proper error recovery** - Graceful degradation
10. **Implement session isolation** - Event names with session ID