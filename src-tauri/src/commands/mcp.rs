use crate::mcp::{AddServerResult, ImportResult, MCPManager, MCPServer};
use std::collections::HashMap;

#[tauri::command]
pub async fn mcp_list(app: tauri::AppHandle) -> Result<Vec<MCPServer>, String> {
    let manager = MCPManager::new(&app);
    manager.list_servers()
}

#[tauri::command]
pub async fn mcp_add(
    app: tauri::AppHandle,
    name: String,
    transport: String,
    command: Option<String>,
    args: Vec<String>,
    env: HashMap<String, String>,
    url: Option<String>,
    scope: String,
) -> Result<AddServerResult, String> {
    let manager = MCPManager::new(&app);
    let server = MCPServer {
        name,
        transport,
        command,
        args,
        env,
        url,
        scope,
        connected: false,
    };
    manager.add_server(server)
}

#[tauri::command]
pub async fn mcp_remove(app: tauri::AppHandle, name: String) -> Result<String, String> {
    let manager = MCPManager::new(&app);
    manager.remove_server(&name)
}

#[tauri::command]
pub async fn mcp_test_connection(app: tauri::AppHandle, name: String) -> Result<String, String> {
    let manager = MCPManager::new(&app);
    manager.test_connection(&name)
}

#[tauri::command]
pub async fn mcp_import_claude_desktop(app: tauri::AppHandle) -> Result<ImportResult, String> {
    let manager = MCPManager::new(&app);
    manager.import_from_claude_desktop()
}

#[tauri::command]
pub async fn mcp_export_config(app: tauri::AppHandle) -> Result<String, String> {
    let manager = MCPManager::new(&app);
    manager.export_config()
}
