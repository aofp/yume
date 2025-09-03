use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MCPServer {
    pub name: String,
    pub transport: String, // "stdio" or "sse"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    pub scope: String, // "local", "project", "user"
    #[serde(default)]
    pub connected: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MCPConfig {
    pub version: String,
    pub servers: Vec<MCPServer>,
}

#[derive(Debug, Serialize)]
pub struct AddServerResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ImportResult {
    pub imported: usize,
    pub failed: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub errors: Option<Vec<String>>,
}

pub struct MCPManager {
    config_path: PathBuf,
}

impl MCPManager {
    pub fn new(app: &AppHandle) -> Self {
        let config_path = Self::get_config_path(app);
        Self { config_path }
    }

    fn get_config_path(_app: &AppHandle) -> PathBuf {
        // Use dirs crate for cross-platform config directory
        let app_dir = dirs::config_dir()
            .expect("Failed to get config directory")
            .join("yurucode");
        
        // Ensure directory exists
        if !app_dir.exists() {
            fs::create_dir_all(&app_dir).expect("Failed to create config directory");
        }
        
        app_dir.join("mcp_config.json")
    }

    fn load_config(&self) -> Result<MCPConfig, String> {
        if !self.config_path.exists() {
            // Return empty config if file doesn't exist
            return Ok(MCPConfig {
                version: "1.0".to_string(),
                servers: Vec::new(),
            });
        }

        let content = fs::read_to_string(&self.config_path)
            .map_err(|e| format!("Failed to read config: {}", e))?;
        
        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse config: {}", e))
    }

    fn save_config(&self, config: &MCPConfig) -> Result<(), String> {
        let json = serde_json::to_string_pretty(config)
            .map_err(|e| format!("Failed to serialize config: {}", e))?;
        
        fs::write(&self.config_path, json)
            .map_err(|e| format!("Failed to write config: {}", e))?;
        
        Ok(())
    }

    pub fn list_servers(&self) -> Result<Vec<MCPServer>, String> {
        let config = self.load_config()?;
        Ok(config.servers)
    }

    pub fn add_server(&self, server: MCPServer) -> Result<AddServerResult, String> {
        let mut config = self.load_config()?;
        
        // Check if server with same name already exists
        if config.servers.iter().any(|s| s.name == server.name) {
            return Ok(AddServerResult {
                success: false,
                message: None,
                error: Some(format!("Server '{}' already exists", server.name)),
            });
        }
        
        // Validate based on transport type
        match server.transport.as_str() {
            "stdio" => {
                if server.command.is_none() || server.command.as_ref().unwrap().is_empty() {
                    return Ok(AddServerResult {
                        success: false,
                        message: None,
                        error: Some("Command is required for stdio transport".to_string()),
                    });
                }
            }
            "sse" => {
                if server.url.is_none() || server.url.as_ref().unwrap().is_empty() {
                    return Ok(AddServerResult {
                        success: false,
                        message: None,
                        error: Some("URL is required for SSE transport".to_string()),
                    });
                }
            }
            _ => {
                return Ok(AddServerResult {
                    success: false,
                    message: None,
                    error: Some(format!("Invalid transport type: {}", server.transport)),
                });
            }
        }
        
        config.servers.push(server);
        self.save_config(&config)?;
        
        Ok(AddServerResult {
            success: true,
            message: Some("Server added successfully".to_string()),
            error: None,
        })
    }

    pub fn remove_server(&self, name: &str) -> Result<String, String> {
        let mut config = self.load_config()?;
        
        let initial_count = config.servers.len();
        config.servers.retain(|s| s.name != name);
        
        if config.servers.len() == initial_count {
            return Err(format!("Server '{}' not found", name));
        }
        
        self.save_config(&config)?;
        Ok(format!("Server '{}' removed successfully", name))
    }

    pub fn test_connection(&self, name: &str) -> Result<String, String> {
        let config = self.load_config()?;
        
        let server = config.servers.iter()
            .find(|s| s.name == name)
            .ok_or_else(|| format!("Server '{}' not found", name))?;
        
        match server.transport.as_str() {
            "stdio" => {
                // Test stdio connection by checking if command exists
                if let Some(ref command) = server.command {
                    // Split command to handle cases like "npx @package"
                    let parts: Vec<&str> = command.split_whitespace().collect();
                    let base_command = if parts.is_empty() {
                        command.as_str()
                    } else {
                        parts[0]
                    };
                    
                    // Check if command exists in PATH
                    match std::process::Command::new(if cfg!(target_os = "windows") { "where" } else { "which" })
                        .arg(base_command)
                        .output() 
                    {
                        Ok(output) if output.status.success() => {
                            Ok(format!("Connection test successful: '{}' command found", base_command))
                        }
                        _ => {
                            // Try to run the command with --version or --help to test
                            match std::process::Command::new(base_command)
                                .arg("--version")
                                .output()
                            {
                                Ok(_) => Ok(format!("Connection test successful: '{}' is available", base_command)),
                                Err(e) => Err(format!("Command '{}' not found: {}", base_command, e))
                            }
                        }
                    }
                } else {
                    Err("No command specified for stdio transport".to_string())
                }
            }
            "sse" => {
                // Test SSE connection with a simple HTTP request
                if let Some(ref url) = server.url {
                    // For now, just validate the URL format
                    if url.starts_with("http://") || url.starts_with("https://") {
                        Ok(format!("SSE endpoint '{}' appears valid (actual connection test pending)", url))
                    } else {
                        Err(format!("Invalid URL format: {}", url))
                    }
                } else {
                    Err("No URL specified for SSE transport".to_string())
                }
            }
            _ => Err(format!("Unknown transport type: {}", server.transport))
        }
    }

    pub fn import_from_claude_desktop(&self) -> Result<ImportResult, String> {
        let claude_config_path = Self::get_claude_desktop_config_path()?;
        
        if !claude_config_path.exists() {
            return Ok(ImportResult {
                imported: 0,
                failed: 0,
                errors: Some(vec!["Claude Desktop configuration not found".to_string()]),
            });
        }

        let content = fs::read_to_string(&claude_config_path)
            .map_err(|e| format!("Failed to read Claude Desktop config: {}", e))?;
        
        let claude_config: serde_json::Value = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse Claude Desktop config: {}", e))?;
        
        let mut imported = 0;
        let mut failed = 0;
        let mut errors = Vec::new();
        
        // Claude Desktop config has "mcpServers" key
        if let Some(mcp_servers) = claude_config.get("mcpServers").and_then(|v| v.as_object()) {
            for (name, server_config) in mcp_servers {
                // Try to convert Claude Desktop format to our format
                let server = match Self::convert_claude_server(name.clone(), server_config) {
                    Ok(s) => s,
                    Err(e) => {
                        failed += 1;
                        errors.push(format!("Failed to import '{}': {}", name, e));
                        continue;
                    }
                };
                
                // Try to add the server
                match self.add_server(server) {
                    Ok(result) if result.success => imported += 1,
                    Ok(result) => {
                        failed += 1;
                        if let Some(error) = result.error {
                            errors.push(error);
                        }
                    }
                    Err(e) => {
                        failed += 1;
                        errors.push(e);
                    }
                }
            }
        }
        
        Ok(ImportResult {
            imported,
            failed,
            errors: if errors.is_empty() { None } else { Some(errors) },
        })
    }

    fn convert_claude_server(name: String, config: &serde_json::Value) -> Result<MCPServer, String> {
        // Claude Desktop format typically has:
        // { "command": "...", "args": [...], "env": {...} }
        
        let command = config.get("command")
            .and_then(|v| v.as_str())
            .ok_or("Missing command")?
            .to_string();
        
        let args = config.get("args")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default();
        
        let env = config.get("env")
            .and_then(|v| v.as_object())
            .map(|obj| {
                obj.iter()
                    .filter_map(|(k, v)| {
                        v.as_str().map(|s| (k.clone(), s.to_string()))
                    })
                    .collect()
            })
            .unwrap_or_default();
        
        Ok(MCPServer {
            name,
            transport: "stdio".to_string(), // Claude Desktop only supports stdio
            command: Some(command),
            args,
            env,
            url: None,
            scope: "local".to_string(),
            connected: false,
        })
    }

    pub fn export_config(&self) -> Result<String, String> {
        let config = self.load_config()?;
        serde_json::to_string_pretty(&config)
            .map_err(|e| format!("Failed to serialize config: {}", e))
    }

    fn get_claude_desktop_config_path() -> Result<PathBuf, String> {
        #[cfg(target_os = "windows")]
        {
            // Try APPDATA first (standard Windows installation)
            if let Ok(appdata) = std::env::var("APPDATA") {
                let standard_path = PathBuf::from(appdata)
                    .join("Claude")
                    .join("claude_desktop_config.json");
                if standard_path.exists() {
                    return Ok(standard_path);
                }
            }
            
            // Try LOCALAPPDATA for Windows Store version
            if let Ok(localappdata) = std::env::var("LOCALAPPDATA") {
                let store_path = PathBuf::from(localappdata)
                    .join("Claude")
                    .join("claude_desktop_config.json");
                if store_path.exists() {
                    return Ok(store_path);
                }
            }
            
            // Return the standard path even if not found (for error message)
            let appdata = std::env::var("APPDATA")
                .map_err(|_| "Failed to get APPDATA directory")?;
            Ok(PathBuf::from(appdata)
                .join("Claude")
                .join("claude_desktop_config.json"))
        }
        
        #[cfg(target_os = "macos")]
        {
            let home = std::env::var("HOME")
                .map_err(|_| "Failed to get HOME directory")?;
            Ok(PathBuf::from(home)
                .join("Library")
                .join("Application Support")
                .join("Claude")
                .join("claude_desktop_config.json"))
        }
        
        #[cfg(not(any(target_os = "windows", target_os = "macos")))]
        {
            let home = std::env::var("HOME")
                .map_err(|_| "Failed to get HOME directory")?;
            Ok(PathBuf::from(home)
                .join(".config")
                .join("Claude")
                .join("claude_desktop_config.json"))
        }
    }
}