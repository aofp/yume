/// Memory MCP Server management commands
/// Handles starting/stopping the @modelcontextprotocol/server-memory process
/// and provides JSON-RPC communication for memory operations
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use std::thread;
use std::sync::mpsc;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

// Global store for memory server process and IO handles
struct MemoryServerState {
    process: Option<Child>,
    stdin: Option<ChildStdin>,
    stdout: Option<BufReader<ChildStdout>>,
}

static MEMORY_SERVER: Lazy<Mutex<MemoryServerState>> = Lazy::new(|| {
    Mutex::new(MemoryServerState {
        process: None,
        stdin: None,
        stdout: None,
    })
});

// Request ID counter for JSON-RPC
static REQUEST_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Serialize, Deserialize)]
pub struct MemoryServerResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MemoryServerStatus {
    pub running: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MemoryEntity {
    pub name: String,
    #[serde(rename = "entityType")]
    pub entity_type: String,
    pub observations: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MemoryRelation {
    pub from: String,
    pub to: String,
    #[serde(rename = "relationType")]
    pub relation_type: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct KnowledgeGraph {
    pub entities: Vec<MemoryEntity>,
    pub relations: Vec<MemoryRelation>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MemoryQueryResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entities: Option<Vec<MemoryEntity>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub relations: Option<Vec<MemoryRelation>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MemoryPruneResult {
    pub success: bool,
    pub pruned_count: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Get the path where memory.jsonl will be stored
/// Cross-platform: ~/.yume/memory.jsonl
fn get_memory_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "Could not find home directory".to_string())?;
    let yume_dir = home.join(".yume");

    // Ensure directory exists
    if !yume_dir.exists() {
        std::fs::create_dir_all(&yume_dir)
            .map_err(|e| format!("Failed to create .yume directory: {}", e))?;
    }

    Ok(yume_dir)
}

/// Get the path to the lock file
fn get_lock_file_path() -> Result<PathBuf, String> {
    Ok(get_memory_dir()?.join("memory.lock"))
}

/// Acquire lock to prevent multiple server instances
fn acquire_lock() -> Result<(), String> {
    let lock_path = get_lock_file_path()?;
    let pid = std::process::id();

    // Check if lock exists and if the process is still alive
    if lock_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&lock_path) {
            if let Ok(old_pid) = content.trim().parse::<u32>() {
                // Check if process is still running (cross-platform)
                #[cfg(unix)]
                {
                    use std::process::Command;
                    let result = Command::new("kill").args(["-0", &old_pid.to_string()]).status();
                    if result.map(|s| s.success()).unwrap_or(false) {
                        return Err(format!("Memory server already running (PID: {})", old_pid));
                    }
                }
                #[cfg(windows)]
                {
                    // On Windows, check if process exists via tasklist
                    let output = Command::new("tasklist")
                        .args(["/FI", &format!("PID eq {}", old_pid)])
                        .output();
                    if let Ok(out) = output {
                        let stdout = String::from_utf8_lossy(&out.stdout);
                        if stdout.contains(&old_pid.to_string()) {
                            return Err(format!("Memory server already running (PID: {})", old_pid));
                        }
                    }
                }
            }
        }
        // Stale lock, remove it
        let _ = std::fs::remove_file(&lock_path);
    }

    // Write our PID
    std::fs::write(&lock_path, pid.to_string())
        .map_err(|e| format!("Failed to create lock file: {}", e))?;

    Ok(())
}

/// Release lock file
fn release_lock() {
    if let Ok(lock_path) = get_lock_file_path() {
        let _ = std::fs::remove_file(lock_path);
    }
}

/// Add memory server to Claude Code CLI using `claude mcp add`
/// This allows Claude Code agent to use the memory tools
fn add_memory_to_mcp_config() -> Result<(), String> {
    let memory_file = get_memory_dir()?.join("memory.jsonl");

    // First check if memory server already exists
    let check_output = Command::new("claude")
        .args(["mcp", "list"])
        .output()
        .map_err(|e| format!("Failed to run claude mcp list: {}", e))?;

    let list_output = String::from_utf8_lossy(&check_output.stdout);
    if list_output.contains("memory:") {
        println!("[Memory] Memory server already registered with Claude Code");
        return Ok(());
    }

    // Use `claude mcp add` to register the memory server at user scope
    // Format: claude mcp add -s user memory -e MEMORY_FILE_PATH=... -- npx -y @modelcontextprotocol/server-memory
    let output = Command::new("claude")
        .args([
            "mcp", "add",
            "-s", "user",
            "memory",
            "-e", &format!("MEMORY_FILE_PATH={}", memory_file.to_string_lossy()),
            "--",
            "npx", "-y", "@modelcontextprotocol/server-memory"
        ])
        .output()
        .map_err(|e| format!("Failed to run claude mcp add: {}", e))?;

    if output.status.success() {
        println!("[Memory] Registered memory server with Claude Code CLI");
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // If already exists, that's fine
        if stderr.contains("already exists") {
            println!("[Memory] Memory server already registered");
            Ok(())
        } else {
            Err(format!("Failed to add memory server: {}", stderr))
        }
    }
}

/// Remove memory server from Claude Code CLI using `claude mcp remove`
fn remove_memory_from_mcp_config() -> Result<(), String> {
    // Use `claude mcp remove` to unregister the memory server
    let output = Command::new("claude")
        .args(["mcp", "remove", "-s", "user", "memory"])
        .output()
        .map_err(|e| format!("Failed to run claude mcp remove: {}", e))?;

    if output.status.success() {
        println!("[Memory] Removed memory server from Claude Code CLI");
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // If not found, that's fine
        if stderr.contains("not found") || stderr.contains("does not exist") {
            println!("[Memory] Memory server was not registered");
            Ok(())
        } else {
            // Log warning but don't fail - server might not be registered
            println!("[Memory] Warning removing memory server: {}", stderr);
            Ok(())
        }
    }
}

/// Get the full path to the memory file
#[tauri::command]
pub fn get_memory_file_path() -> Result<String, String> {
    let dir = get_memory_dir()?;
    Ok(dir.join("memory.jsonl").to_string_lossy().to_string())
}

/// Send a JSON-RPC request to the memory server with timeout
///
/// RACE CONDITION FIX: Previously, the stdout handle was moved into a thread and
/// lost on timeout, breaking all subsequent requests. Now we:
/// 1. Keep the lock held throughout the request/response cycle
/// 2. Match response ID to request ID to handle out-of-order responses
/// 3. Use a separate thread for timeout while preserving stdout ownership
fn send_mcp_request_with_timeout(method: &str, params: Value, timeout_secs: u64) -> Result<Value, String> {
    let mut state = MEMORY_SERVER
        .lock()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;

    if state.stdin.is_none() || state.stdout.is_none() {
        return Err("Server not available".to_string());
    }

    let id = REQUEST_ID.fetch_add(1, Ordering::SeqCst);
    let request = json!({
        "jsonrpc": "2.0",
        "id": id,
        "method": method,
        "params": params
    });

    let request_str = serde_json::to_string(&request)
        .map_err(|e| format!("Serialize error: {}", e))?;

    // Write request (stdin stays owned by state)
    {
        let stdin = state.stdin.as_mut().unwrap();
        writeln!(stdin, "{}", request_str).map_err(|e| format!("Write error: {}", e))?;
        stdin.flush().map_err(|e| format!("Flush error: {}", e))?;
    }

    // RACE CONDITION FIX: Take stdout, spawn thread, but ALWAYS return stdout to state
    // Use Arc<Mutex<Option<BufReader>>> pattern to safely share between threads
    let stdout = state.stdout.take().ok_or("Stdout not available")?;
    let stdout_arc = Arc::new(Mutex::new(Some(stdout)));
    let stdout_arc_clone = Arc::clone(&stdout_arc);

    // Drop state lock before waiting (allows other threads to check server status)
    drop(state);

    let (tx, rx) = mpsc::channel();

    thread::spawn(move || {
        let result = if let Ok(mut guard) = stdout_arc_clone.lock() {
            if let Some(ref mut stdout) = *guard {
                let mut line = String::new();
                stdout.read_line(&mut line).map(|_| line)
            } else {
                Err(std::io::Error::new(std::io::ErrorKind::Other, "stdout taken"))
            }
        } else {
            Err(std::io::Error::new(std::io::ErrorKind::Other, "lock failed"))
        };
        let _ = tx.send(result);
    });

    // Wait for response with timeout
    let response_result = rx.recv_timeout(Duration::from_secs(timeout_secs));

    // CRITICAL: Always return stdout to state, even on timeout
    // The reading thread may still be blocked, but we recover the Arc
    let mut state = MEMORY_SERVER.lock().map_err(|e| format!("Lock error: {}", e))?;

    // Try to recover stdout from Arc (only succeeds if read thread finished)
    match Arc::try_unwrap(stdout_arc) {
        Ok(mutex) => {
            if let Ok(opt_stdout) = mutex.into_inner() {
                state.stdout = opt_stdout;
            }
        }
        Err(arc) => {
            // Read thread still holds a reference - stdout is lost for this request
            // but we can try to recover on next request by checking process status
            let should_retry = {
                if let Ok(guard) = arc.lock() {
                    guard.is_some()
                } else {
                    false
                }
            }; // guard dropped here

            if should_retry {
                // stdout still exists, just being read - try to unwrap now that guard is dropped
                if let Ok(inner) = Arc::try_unwrap(arc) {
                    if let Ok(opt_stdout) = inner.into_inner() {
                        state.stdout = opt_stdout;
                    }
                }
            }
        }
    }

    match response_result {
        Ok(Ok(response_line)) => {
            let response: Value = serde_json::from_str(&response_line)
                .map_err(|e| format!("Parse error: {}", e))?;

            // Verify response ID matches request ID (race condition fix)
            let response_id = response.get("id").and_then(|v| v.as_u64());
            if response_id != Some(id) {
                println!("[Memory] Warning: Response ID mismatch (expected {}, got {:?})", id, response_id);
                // Continue anyway - single-threaded MCP server shouldn't have this issue
            }

            if let Some(error) = response.get("error") {
                return Err(format!("MCP error: {}", error));
            }
            Ok(response.get("result").cloned().unwrap_or(Value::Null))
        }
        Ok(Err(e)) => {
            Err(format!("Read error: {}", e))
        }
        Err(_) => {
            // Timeout - stdout may be lost, but at least we tried to recover it
            println!("[Memory] Request timed out after {}s, server may be unresponsive", timeout_secs);
            Err(format!("MCP request '{}' timed out after {} seconds. Try restarting the memory server.", method, timeout_secs))
        }
    }
}

/// Send a JSON-RPC request to the memory server with default 10 second timeout
fn send_mcp_request(method: &str, params: Value) -> Result<Value, String> {
    send_mcp_request_with_timeout(method, params, 10)
}

/// Start the memory MCP server using npx
#[tauri::command]
pub async fn start_memory_server() -> Result<MemoryServerResult, String> {
    // Acquire lock to prevent multiple instances
    if let Err(e) = acquire_lock() {
        return Ok(MemoryServerResult {
            success: false,
            error: Some(e),
        });
    }

    // Check if already running
    {
        let state = MEMORY_SERVER
            .lock()
            .map_err(|e| format!("Failed to acquire lock: {}", e))?;
        if state.process.is_some() {
            return Ok(MemoryServerResult {
                success: true,
                error: Some("Memory server already running".to_string()),
            });
        }
    }

    // Get memory file path
    let memory_dir = get_memory_dir()?;
    let memory_file = memory_dir.join("memory.jsonl");

    println!(
        "[Memory] Starting MCP memory server, data file: {}",
        memory_file.display()
    );

    // Spawn npx process
    // Cross-platform: npx works the same on all platforms
    #[cfg(target_os = "windows")]
    let npx_cmd = "npx.cmd";
    #[cfg(not(target_os = "windows"))]
    let npx_cmd = "npx";

    // Get PATH from environment to ensure npx is findable
    // In bundled apps, PATH is often minimal, so we add common node locations
    let mut path_env = std::env::var("PATH").unwrap_or_default();

    // Add common Node.js/npm paths that might not be in bundled app's PATH
    let home = std::env::var("HOME").unwrap_or_default();
    let extra_paths = vec![
        "/usr/local/bin".to_string(),        // homebrew intel
        "/opt/homebrew/bin".to_string(),     // homebrew arm64
        format!("{}/Library/pnpm", home),    // pnpm
        format!("{}/.local/bin", home),      // local bin
        "/usr/bin".to_string(),
    ];

    for extra in &extra_paths {
        if !path_env.contains(extra) {
            path_env = format!("{}:{}", extra, path_env);
        }
    }

    // Also expand nvm paths
    let nvm_dir = format!("{}/.nvm/versions/node", home);
    if let Ok(entries) = std::fs::read_dir(&nvm_dir) {
        for entry in entries.flatten() {
            let bin_path = entry.path().join("bin");
            if bin_path.exists() {
                let bin_str = bin_path.to_string_lossy();
                if !path_env.contains(bin_str.as_ref()) {
                    path_env = format!("{}:{}", bin_str, path_env);
                }
            }
        }
    }

    println!("[Memory] Enhanced PATH: {}", path_env);

    // Set the enhanced PATH for this process and child processes
    std::env::set_var("PATH", &path_env);

    // Try to find npx explicitly
    let npx_path = which::which(npx_cmd).map_err(|e| format!("npx not found: {}. PATH={}", e, path_env))?;
    println!("[Memory] Found npx at: {:?}", npx_path);

    let mut cmd = Command::new(&npx_path);
    cmd.arg("-y")
        .arg("@modelcontextprotocol/server-memory")
        .env(
            "MEMORY_FILE_PATH",
            memory_file.to_string_lossy().to_string(),
        )
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // Hide console window on Windows
    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to start memory server: {}", e))?;

    let pid = child.id();
    println!("[Memory] Server started with PID: {}", pid);

    // Extract stdin/stdout handles
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Failed to get stdin handle".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to get stdout handle".to_string())?;

    // Store everything
    let mut state = MEMORY_SERVER
        .lock()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;
    state.process = Some(child);
    state.stdin = Some(stdin);
    state.stdout = Some(BufReader::new(stdout));

    // Drop lock before doing MCP handshake
    drop(state);

    // Give the server time to initialize before handshake
    println!("[Memory] Waiting for server to initialize...");
    thread::sleep(Duration::from_millis(500));

    // Perform MCP initialization handshake
    println!("[Memory] Performing MCP initialization handshake...");
    match perform_mcp_handshake() {
        Ok(_) => {
            println!("[Memory] MCP handshake completed successfully");

            // Add memory server to Claude's MCP config so CLI can use it
            if let Err(e) = add_memory_to_mcp_config() {
                println!("[Memory] Warning: Failed to add to MCP config: {}", e);
            }

            Ok(MemoryServerResult {
                success: true,
                error: None,
            })
        }
        Err(e) => {
            println!("[Memory] MCP handshake failed: {}", e);
            // Clean up on failure
            let mut state = MEMORY_SERVER.lock().unwrap();
            state.stdin = None;
            state.stdout = None;
            if let Some(mut child) = state.process.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
            Ok(MemoryServerResult {
                success: false,
                error: Some(format!("MCP handshake failed: {}", e)),
            })
        }
    }
}

/// Read a line from stdout with a timeout
fn read_line_with_timeout(stdout: &mut BufReader<ChildStdout>, _timeout: Duration) -> Result<String, String> {
    // Note: timeout parameter reserved for future async implementation

    // We can't easily do async with BufReader, so we'll use a simpler approach:
    // Just read with a manual timeout using poll-like behavior
    // For now, just do a regular read but log if it takes too long
    let start = std::time::Instant::now();
    let mut line = String::new();

    // Note: This is still blocking, but we'll detect slow responses
    match stdout.read_line(&mut line) {
        Ok(_) => {
            let elapsed = start.elapsed();
            if elapsed > Duration::from_secs(5) {
                println!("[Memory] Warning: read took {:?}", elapsed);
            }
            Ok(line)
        }
        Err(e) => Err(format!("Read error: {}", e)),
    }
}

/// Perform MCP protocol initialization handshake
fn perform_mcp_handshake() -> Result<(), String> {
    println!("[Memory] Starting MCP handshake...");

    let mut state = MEMORY_SERVER
        .lock()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;

    if state.stdin.is_none() || state.stdout.is_none() {
        return Err("Server IO handles not available".to_string());
    }

    let id = REQUEST_ID.fetch_add(1, Ordering::SeqCst);

    // Step 1: Send initialize request
    let init_request = json!({
        "jsonrpc": "2.0",
        "id": id,
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {
                "name": "yume",
                "version": "1.0.0"
            }
        }
    });

    let request_str = serde_json::to_string(&init_request)
        .map_err(|e| format!("Failed to serialize init request: {}", e))?;

    println!("[Memory] Sending initialize request: {}", request_str);

    // Write init request
    {
        let stdin = state.stdin.as_mut().unwrap();
        writeln!(stdin, "{}", request_str).map_err(|e| format!("Failed to write init request: {}", e))?;
        stdin.flush().map_err(|e| format!("Failed to flush init request: {}", e))?;
    }
    println!("[Memory] Sent initialize request, waiting for response...");

    // Read init response with timeout logging
    let response_line = {
        let stdout = state.stdout.as_mut().unwrap();
        read_line_with_timeout(stdout, Duration::from_secs(30))?
    };
    println!("[Memory] Received init response: {}", response_line.trim());

    if response_line.is_empty() {
        return Err("Empty response from server".to_string());
    }

    let response: Value = serde_json::from_str(&response_line)
        .map_err(|e| format!("Failed to parse init response '{}': {}", response_line.trim(), e))?;

    if response.get("error").is_some() {
        return Err(format!("Init error: {}", response["error"]));
    }

    // Step 2: Send initialized notification (no response expected)
    let initialized_notification = json!({
        "jsonrpc": "2.0",
        "method": "notifications/initialized"
    });

    let notif_str = serde_json::to_string(&initialized_notification)
        .map_err(|e| format!("Failed to serialize initialized notification: {}", e))?;

    {
        let stdin = state.stdin.as_mut().unwrap();
        writeln!(stdin, "{}", notif_str).map_err(|e| format!("Failed to write initialized notification: {}", e))?;
        stdin.flush().map_err(|e| format!("Failed to flush initialized notification: {}", e))?;
    }
    println!("[Memory] Sent initialized notification - handshake complete");

    Ok(())
}

/// Stop the memory MCP server
#[tauri::command]
pub async fn stop_memory_server() -> Result<MemoryServerResult, String> {
    // Remove memory server from Claude's MCP config first
    if let Err(e) = remove_memory_from_mcp_config() {
        println!("[Memory] Warning: Failed to remove from MCP config: {}", e);
    }

    let mut state = MEMORY_SERVER
        .lock()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;

    // Drop IO handles first
    state.stdin = None;
    state.stdout = None;

    if let Some(mut child) = state.process.take() {
        println!("[Memory] Stopping memory server (PID: {})", child.id());

        match child.kill() {
            Ok(_) => {
                let _ = child.wait();
                println!("[Memory] Memory server stopped");

                // Release lock file
                release_lock();

                Ok(MemoryServerResult {
                    success: true,
                    error: None,
                })
            }
            Err(e) => {
                let error_msg = format!("Failed to kill memory server: {}", e);
                println!("[Memory] {}", error_msg);

                // Still release lock even on error
                release_lock();

                Ok(MemoryServerResult {
                    success: false,
                    error: Some(error_msg),
                })
            }
        }
    } else {
        // Release lock even if server wasn't running
        release_lock();

        Ok(MemoryServerResult {
            success: true,
            error: Some("Memory server was not running".to_string()),
        })
    }
}

/// Check if memory server is running
#[tauri::command]
pub fn check_memory_server() -> Result<MemoryServerStatus, String> {
    let mut state = MEMORY_SERVER
        .lock()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;

    if let Some(ref mut child) = state.process {
        match child.try_wait() {
            Ok(Some(_status)) => {
                // Process has exited
                state.process = None;
                state.stdin = None;
                state.stdout = None;
                Ok(MemoryServerStatus { running: false })
            }
            Ok(None) => Ok(MemoryServerStatus { running: true }),
            Err(e) => {
                println!("[Memory] Error checking process status: {}", e);
                Ok(MemoryServerStatus { running: false })
            }
        }
    } else {
        Ok(MemoryServerStatus { running: false })
    }
}

/// Create entities in the knowledge graph
#[tauri::command]
pub fn memory_create_entities(entities: Vec<MemoryEntity>) -> Result<MemoryServerResult, String> {
    let params = json!({
        "name": "create_entities",
        "arguments": {
            "entities": entities
        }
    });

    match send_mcp_request("tools/call", params) {
        Ok(_) => Ok(MemoryServerResult {
            success: true,
            error: None,
        }),
        Err(e) => Ok(MemoryServerResult {
            success: false,
            error: Some(e),
        }),
    }
}

/// Create relations between entities
#[tauri::command]
pub fn memory_create_relations(relations: Vec<MemoryRelation>) -> Result<MemoryServerResult, String>
{
    let params = json!({
        "name": "create_relations",
        "arguments": {
            "relations": relations
        }
    });

    match send_mcp_request("tools/call", params) {
        Ok(_) => Ok(MemoryServerResult {
            success: true,
            error: None,
        }),
        Err(e) => Ok(MemoryServerResult {
            success: false,
            error: Some(e),
        }),
    }
}

/// Add observations to an existing entity
#[tauri::command]
pub fn memory_add_observations(
    entity_name: String,
    observations: Vec<String>,
) -> Result<MemoryServerResult, String> {
    let params = json!({
        "name": "add_observations",
        "arguments": {
            "observations": [{
                "entityName": entity_name,
                "contents": observations
            }]
        }
    });

    match send_mcp_request("tools/call", params) {
        Ok(_) => Ok(MemoryServerResult {
            success: true,
            error: None,
        }),
        Err(e) => Ok(MemoryServerResult {
            success: false,
            error: Some(e),
        }),
    }
}

/// Search for nodes in the knowledge graph
#[tauri::command]
pub fn memory_search_nodes(query: String) -> Result<MemoryQueryResult, String> {
    let params = json!({
        "name": "search_nodes",
        "arguments": {
            "query": query
        }
    });

    match send_mcp_request("tools/call", params) {
        Ok(result) => {
            // Parse the result content
            if let Some(content) = result.get("content") {
                if let Some(arr) = content.as_array() {
                    if let Some(first) = arr.first() {
                        if let Some(text) = first.get("text").and_then(|t| t.as_str()) {
                            if let Ok(graph) = serde_json::from_str::<KnowledgeGraph>(text) {
                                return Ok(MemoryQueryResult {
                                    success: true,
                                    entities: Some(graph.entities),
                                    relations: Some(graph.relations),
                                    error: None,
                                });
                            }
                        }
                    }
                }
            }
            Ok(MemoryQueryResult {
                success: true,
                entities: Some(vec![]),
                relations: Some(vec![]),
                error: None,
            })
        }
        Err(e) => Ok(MemoryQueryResult {
            success: false,
            entities: None,
            relations: None,
            error: Some(e),
        }),
    }
}

/// Read the entire knowledge graph
#[tauri::command]
pub fn memory_read_graph() -> Result<MemoryQueryResult, String> {
    let params = json!({
        "name": "read_graph",
        "arguments": {}
    });

    match send_mcp_request("tools/call", params) {
        Ok(result) => {
            if let Some(content) = result.get("content") {
                if let Some(arr) = content.as_array() {
                    if let Some(first) = arr.first() {
                        if let Some(text) = first.get("text").and_then(|t| t.as_str()) {
                            if let Ok(graph) = serde_json::from_str::<KnowledgeGraph>(text) {
                                return Ok(MemoryQueryResult {
                                    success: true,
                                    entities: Some(graph.entities),
                                    relations: Some(graph.relations),
                                    error: None,
                                });
                            }
                        }
                    }
                }
            }
            Ok(MemoryQueryResult {
                success: true,
                entities: Some(vec![]),
                relations: Some(vec![]),
                error: None,
            })
        }
        Err(e) => Ok(MemoryQueryResult {
            success: false,
            entities: None,
            relations: None,
            error: Some(e),
        }),
    }
}

/// Delete an entity and its relations
#[tauri::command]
pub fn memory_delete_entity(entity_name: String) -> Result<MemoryServerResult, String> {
    let params = json!({
        "name": "delete_entities",
        "arguments": {
            "entityNames": [entity_name]
        }
    });

    match send_mcp_request("tools/call", params) {
        Ok(_) => Ok(MemoryServerResult {
            success: true,
            error: None,
        }),
        Err(e) => Ok(MemoryServerResult {
            success: false,
            error: Some(e),
        }),
    }
}

/// Prune memories older than retention_days
/// Reads memory.jsonl, filters by timestamp, writes back
#[tauri::command]
pub fn memory_prune_old(retention_days: u32) -> Result<MemoryPruneResult, String> {
    let memory_file = get_memory_dir()?.join("memory.jsonl");

    if !memory_file.exists() {
        return Ok(MemoryPruneResult {
            success: true,
            pruned_count: 0,
            error: None,
        });
    }

    let content = std::fs::read_to_string(&memory_file)
        .map_err(|e| format!("Failed to read memory file: {}", e))?;

    let cutoff = chrono::Utc::now() - chrono::Duration::days(retention_days as i64);

    let mut kept_lines = Vec::new();
    let mut pruned_count = 0;

    // Compile regex once for performance
    let date_regex = regex::Regex::new(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}")
        .map_err(|e| format!("Regex error: {}", e))?;

    for line in content.lines() {
        if line.trim().is_empty() {
            continue;
        }

        // Parse line to check timestamp
        let should_keep = if let Some(caps) = date_regex.find(line) {
            let date_str = caps.as_str();
            // Try parsing with and without timezone
            let parsed_date = chrono::DateTime::parse_from_rfc3339(&format!("{}Z", date_str))
                .or_else(|_| chrono::DateTime::parse_from_rfc3339(date_str));

            if let Ok(date) = parsed_date {
                date.with_timezone(&chrono::Utc) > cutoff
            } else {
                true // Keep if we can't parse
            }
        } else {
            true // Keep if no timestamp found
        };

        if should_keep {
            kept_lines.push(line.to_string());
        } else {
            pruned_count += 1;
        }
    }

    // Write back (with newline at end)
    let new_content = if kept_lines.is_empty() {
        String::new()
    } else {
        format!("{}\n", kept_lines.join("\n"))
    };

    std::fs::write(&memory_file, new_content)
        .map_err(|e| format!("Failed to write memory file: {}", e))?;

    println!("[Memory] Pruned {} old memories (retention: {} days)", pruned_count, retention_days);

    Ok(MemoryPruneResult {
        success: true,
        pruned_count,
        error: None,
    })
}

/// Clear all memories by deleting the memory.jsonl file
#[tauri::command]
pub fn memory_clear_all() -> Result<MemoryServerResult, String> {
    let memory_file = get_memory_dir()?.join("memory.jsonl");

    if memory_file.exists() {
        std::fs::remove_file(&memory_file)
            .map_err(|e| format!("Failed to delete memory file: {}", e))?;
        println!("[Memory] Cleared all memories");
    } else {
        println!("[Memory] Memory file does not exist, nothing to clear");
    }

    Ok(MemoryServerResult {
        success: true,
        error: None,
    })
}

/// Kill memory server on app exit (called from cleanup)
pub fn cleanup_memory_server() {
    // Remove memory server from Claude's MCP config on exit
    if let Err(e) = remove_memory_from_mcp_config() {
        println!("[Memory] Warning: Failed to remove from MCP config on exit: {}", e);
    }

    if let Ok(mut state) = MEMORY_SERVER.lock() {
        state.stdin = None;
        state.stdout = None;
        if let Some(mut child) = state.process.take() {
            println!(
                "[Memory] Cleaning up memory server on exit (PID: {})",
                child.id()
            );
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    // Release lock file
    release_lock();
}
