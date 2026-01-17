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
use std::sync::Mutex;

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

/// Get the full path to the memory file
#[tauri::command]
pub fn get_memory_file_path() -> Result<String, String> {
    let dir = get_memory_dir()?;
    Ok(dir.join("memory.jsonl").to_string_lossy().to_string())
}

/// Send a JSON-RPC request to the memory server and wait for response
fn send_mcp_request(method: &str, params: Value) -> Result<Value, String> {
    let mut state = MEMORY_SERVER
        .lock()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;

    // Check both handles exist before borrowing
    if state.stdin.is_none() {
        return Err("Memory server stdin not available".to_string());
    }
    if state.stdout.is_none() {
        return Err("Memory server stdout not available".to_string());
    }

    let id = REQUEST_ID.fetch_add(1, Ordering::SeqCst);

    let request = json!({
        "jsonrpc": "2.0",
        "id": id,
        "method": method,
        "params": params
    });

    let request_str = serde_json::to_string(&request)
        .map_err(|e| format!("Failed to serialize request: {}", e))?;

    // Write request - borrow stdin mutably
    {
        let stdin = state.stdin.as_mut().unwrap();
        writeln!(stdin, "{}", request_str).map_err(|e| format!("Failed to write to stdin: {}", e))?;
        stdin.flush().map_err(|e| format!("Failed to flush stdin: {}", e))?;
    }

    // Read response - borrow stdout mutably (stdin borrow ended)
    let mut response_line = String::new();
    {
        let stdout = state.stdout.as_mut().unwrap();
        stdout
            .read_line(&mut response_line)
            .map_err(|e| format!("Failed to read response: {}", e))?;
    }

    let response: Value = serde_json::from_str(&response_line)
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    if let Some(error) = response.get("error") {
        return Err(format!("MCP error: {}", error));
    }

    Ok(response.get("result").cloned().unwrap_or(Value::Null))
}

/// Start the memory MCP server using npx
#[tauri::command]
pub async fn start_memory_server() -> Result<MemoryServerResult, String> {
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

    let mut child = Command::new(npx_cmd)
        .arg("-y")
        .arg("@modelcontextprotocol/server-memory")
        .env(
            "MEMORY_FILE_PATH",
            memory_file.to_string_lossy().to_string(),
        )
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
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

    // Perform MCP initialization handshake
    println!("[Memory] Performing MCP initialization handshake...");
    match perform_mcp_handshake() {
        Ok(_) => {
            println!("[Memory] MCP handshake completed successfully");
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

/// Perform MCP protocol initialization handshake
fn perform_mcp_handshake() -> Result<(), String> {
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

    // Write init request
    {
        let stdin = state.stdin.as_mut().unwrap();
        writeln!(stdin, "{}", request_str).map_err(|e| format!("Failed to write init request: {}", e))?;
        stdin.flush().map_err(|e| format!("Failed to flush init request: {}", e))?;
    }
    println!("[Memory] Sent initialize request");

    // Read init response
    let mut response_line = String::new();
    {
        let stdout = state.stdout.as_mut().unwrap();
        stdout
            .read_line(&mut response_line)
            .map_err(|e| format!("Failed to read init response: {}", e))?;
    }
    println!("[Memory] Received init response: {}", response_line.trim());

    let response: Value = serde_json::from_str(&response_line)
        .map_err(|e| format!("Failed to parse init response: {}", e))?;

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
    println!("[Memory] Sent initialized notification");

    Ok(())
}

/// Stop the memory MCP server
#[tauri::command]
pub async fn stop_memory_server() -> Result<MemoryServerResult, String> {
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
                Ok(MemoryServerResult {
                    success: true,
                    error: None,
                })
            }
            Err(e) => {
                let error_msg = format!("Failed to kill memory server: {}", e);
                println!("[Memory] {}", error_msg);
                Ok(MemoryServerResult {
                    success: false,
                    error: Some(error_msg),
                })
            }
        }
    } else {
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

/// Kill memory server on app exit (called from cleanup)
pub fn cleanup_memory_server() {
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
}
