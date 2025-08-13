use serde::{Deserialize, Serialize};
use tauri::{State, Window};
use std::path::{Path, PathBuf};
use std::fs;
use std::time::SystemTime;

use crate::state::AppState;
use crate::logged_server;

#[derive(Debug, Serialize, Deserialize)]
pub struct FolderSelection {
    pub path: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileSearchResult {
    #[serde(rename = "type")]
    pub file_type: String,  // "file" or "directory"
    pub path: String,
    pub name: String,
    #[serde(rename = "relativePath")]
    pub relative_path: String,
    #[serde(rename = "lastModified")]
    pub last_modified: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GitStatus {
    pub modified: Vec<String>,
    pub added: Vec<String>,
    pub deleted: Vec<String>,
    pub renamed: Vec<String>,
}

#[tauri::command]
pub fn toggle_devtools(window: tauri::WebviewWindow) -> Result<(), String> {
    println!("DevTools toggle requested via F12");
    
    // DevTools methods are only available in debug builds
    #[cfg(debug_assertions)]
    {
        if window.is_devtools_open() {
            window.close_devtools();
            println!("DevTools closed");
        } else {
            window.open_devtools();
            println!("DevTools opened");
        }
    }
    
    #[cfg(not(debug_assertions))]
    {
        let _ = window; // Suppress unused warning
        println!("DevTools not available in release builds");
    }
    
    Ok(())
}

#[tauri::command]
pub async fn select_folder() -> Result<Option<String>, String> {
    println!("select_folder command called");
    
    // Use rfd which works better on macOS
    use rfd::AsyncFileDialog;
    
    let folder = AsyncFileDialog::new()
        .set_title("Select a folder")
        .pick_folder()
        .await;
    
    match folder {
        Some(path) => {
            let path_str = path.path().to_string_lossy().to_string();
            println!("Folder selected: {}", path_str);
            Ok(Some(path_str))
        }
        None => {
            println!("Folder selection cancelled");
            Ok(None)
        }
    }
}

#[tauri::command]
pub async fn get_server_port(state: State<'_, AppState>) -> Result<u16, String> {
    Ok(state.server_port())
}

#[tauri::command]
pub fn send_message(
    _state: State<'_, AppState>,
    _session_id: String,
    _message: String,
    _working_dir: String,
    _model: String,
) -> Result<(), String> {
    // For now, just return OK - will implement async version later
    Ok(())
}

#[tauri::command]
pub fn interrupt_session(
    _state: State<'_, AppState>,
    _session_id: String,
) -> Result<(), String> {
    // For now, just return OK - will implement async version later
    Ok(())
}

#[tauri::command]
pub fn clear_session(
    _state: State<'_, AppState>,
    _session_id: String,
) -> Result<(), String> {
    // For now, just return OK - will implement async version later
    Ok(())
}

#[tauri::command]
pub async fn get_sessions(state: State<'_, AppState>) -> Result<Vec<SessionInfo>, String> {
    Ok(state.get_sessions())
}

#[tauri::command]
pub async fn set_zoom_level(_window: Window, _level: f64) -> Result<(), String> {
    // Zoom level will be handled via frontend for now
    Ok(())
}

#[tauri::command]
pub async fn minimize_window(window: Window) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn maximize_window(window: Window) -> Result<(), String> {
    if window.is_maximized().unwrap_or(false) {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub async fn close_window(_window: Window) -> Result<(), String> {
    use tracing::info;
    
    info!("Close window command received - shutting down application");
    
    // Spawn a thread to kill the server but don't wait for it
    std::thread::spawn(|| {
        // Kill all node processes immediately on Windows
        #[cfg(target_os = "windows")]
        {
            use std::process::Command;
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            
            // Force kill all node.exe processes
            let _ = Command::new("taskkill")
                .args(&["/F", "/IM", "node.exe"])
                .creation_flags(CREATE_NO_WINDOW)
                .spawn();
        }
        
        // Also try to stop the logged server
        crate::logged_server::stop_logged_server();
    });
    
    // Exit immediately - don't wait for anything
    std::thread::sleep(std::time::Duration::from_millis(50)); // Just 50ms to let kill command start
    std::process::exit(0);
}

#[tauri::command]
pub async fn show_context_menu(
    _window: Window,
    _x: f64,
    _y: f64,
    _has_selection: bool,
) -> Result<(), String> {
    // Context menu will be implemented later with Tauri 2.0 menu API
    Ok(())
}

#[tauri::command]
pub async fn save_settings(
    state: State<'_, AppState>,
    key: String,
    value: serde_json::Value,
) -> Result<(), String> {
    state.save_setting(key, value).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn load_settings(
    state: State<'_, AppState>,
    key: String,
) -> Result<Option<serde_json::Value>, String> {
    Ok(state.load_setting(key))
}

#[tauri::command]
pub async fn get_recent_projects(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    Ok(state.get_recent_projects())
}

#[tauri::command]
pub async fn add_recent_project(
    state: State<'_, AppState>,
    path: String,
) -> Result<(), String> {
    state.add_recent_project(path);
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInfo {
    pub id: String,
    pub working_dir: String,
    pub model: String,
    pub message_count: usize,
    pub token_count: usize,
}

#[tauri::command]
pub fn check_is_directory(path: String) -> Result<bool, String> {
    let path = Path::new(&path);
    Ok(path.is_dir())
}

#[tauri::command]
pub fn toggle_console_visibility() -> Result<String, String> {
    // Toggle the environment variable
    let current = std::env::var("YURUCODE_SHOW_CONSOLE").unwrap_or_default();
    let new_value = if current == "1" { "0" } else { "1" };
    std::env::set_var("YURUCODE_SHOW_CONSOLE", &new_value);
    
    // Return status message
    if new_value == "1" {
        Ok("Console will be visible on next server restart".to_string())
    } else {
        Ok("Console will be hidden on next server restart".to_string())
    }
}

#[tauri::command]
pub fn open_external(url: String) -> Result<(), String> {
    // Open URL in default browser
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(&["/C", "start", "", &url])
            .spawn()
            .map_err(|e| format!("Failed to open URL: {}", e))?;
    }
    
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Failed to open URL: {}", e))?;
    }
    
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Failed to open URL: {}", e))?;
    }
    
    Ok(())
}

#[tauri::command]
pub fn get_server_logs() -> Result<String, String> {
    Ok(logged_server::get_server_logs())
}

#[tauri::command]
pub fn get_server_log_path() -> Result<String, String> {
    Ok(logged_server::get_log_path().to_string_lossy().to_string())
}

#[tauri::command]
pub async fn search_files(
    query: String,
    directory: String,
    include_hidden: bool,
    max_results: usize,
) -> Result<Vec<FileSearchResult>, String> {
    use walkdir::WalkDir;
    
    let dir_path = PathBuf::from(&directory);
    if !dir_path.exists() {
        return Err(format!("Directory does not exist: {}", directory));
    }
    
    let mut results = Vec::new();
    let query_lower = query.to_lowercase();
    
    // Walk through directory
    for entry in WalkDir::new(&dir_path)
        .max_depth(5)  // Limit depth for performance
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if results.len() >= max_results {
            break;
        }
        
        let path = entry.path();
        let name = path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");
        
        // Skip hidden files unless requested
        if !include_hidden && name.starts_with('.') {
            continue;
        }
        
        // Skip common ignore patterns
        if name == "node_modules" || name == ".git" || name == "target" || name == "dist" {
            continue;
        }
        
        // Check if name matches query (fuzzy match)
        let name_lower = name.to_lowercase();
        if query.is_empty() || name_lower.contains(&query_lower) || fuzzy_match(&query_lower, &name_lower) {
            // Convert to Unix-style paths for consistency across platforms
            let relative_path = path.strip_prefix(&dir_path)
                .unwrap_or(path)
                .to_string_lossy()
                .replace('\\', "/");
            
            // Get last modified time
            let last_modified = fs::metadata(path)
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
                .map(|d| d.as_secs());
            
            results.push(FileSearchResult {
                file_type: if path.is_dir() { "directory".to_string() } else { "file".to_string() },
                path: path.to_string_lossy().to_string(),
                name: name.to_string(),
                relative_path,
                last_modified,
            });
        }
    }
    
    // Sort by relevance
    results.sort_by(|a, b| {
        // Exact matches first
        let a_exact = a.name.to_lowercase() == query_lower;
        let b_exact = b.name.to_lowercase() == query_lower;
        if a_exact && !b_exact { return std::cmp::Ordering::Less; }
        if !a_exact && b_exact { return std::cmp::Ordering::Greater; }
        
        // Then by whether name starts with query
        let a_starts = a.name.to_lowercase().starts_with(&query_lower);
        let b_starts = b.name.to_lowercase().starts_with(&query_lower);
        if a_starts && !b_starts { return std::cmp::Ordering::Less; }
        if !a_starts && b_starts { return std::cmp::Ordering::Greater; }
        
        // Finally by path length
        a.relative_path.len().cmp(&b.relative_path.len())
    });
    
    Ok(results)
}

#[tauri::command]
pub async fn get_recent_files(
    directory: String,
    limit: usize,
) -> Result<Vec<FileSearchResult>, String> {
    use walkdir::WalkDir;
    
    let dir_path = PathBuf::from(&directory);
    if !dir_path.exists() {
        return Err(format!("Directory does not exist: {}", directory));
    }
    
    let mut files: Vec<FileSearchResult> = Vec::new();
    
    // Walk through directory
    for entry in WalkDir::new(&dir_path)
        .max_depth(5)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        
        // Skip directories and hidden files
        if path.is_dir() {
            continue;
        }
        
        let name = path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");
        
        if name.starts_with('.') {
            continue;
        }
        
        // Skip common ignore patterns
        let path_str = path.to_string_lossy();
        if path_str.contains("node_modules") || 
           path_str.contains(".git") || 
           path_str.contains("target") || 
           path_str.contains("dist") {
            continue;
        }
        
        // Get last modified time
        if let Ok(metadata) = fs::metadata(path) {
            if let Ok(modified) = metadata.modified() {
                if let Ok(duration) = modified.duration_since(SystemTime::UNIX_EPOCH) {
                    // Convert to Unix-style paths for consistency across platforms
                    let relative_path = path.strip_prefix(&dir_path)
                        .unwrap_or(path)
                        .to_string_lossy()
                        .replace('\\', "/");
                    
                    files.push(FileSearchResult {
                        file_type: "file".to_string(),
                        path: path.to_string_lossy().to_string(),
                        name: name.to_string(),
                        relative_path,
                        last_modified: Some(duration.as_secs()),
                    });
                }
            }
        }
    }
    
    // Sort by last modified time (most recent first)
    files.sort_by(|a, b| {
        b.last_modified.unwrap_or(0).cmp(&a.last_modified.unwrap_or(0))
    });
    
    // Take only the requested limit
    files.truncate(limit);
    
    Ok(files)
}

#[tauri::command]
pub async fn get_folder_contents(
    folder_path: String,
    max_results: usize,
) -> Result<Vec<FileSearchResult>, String> {
    use std::fs;
    
    let dir_path = PathBuf::from(&folder_path);
    if !dir_path.exists() {
        return Err(format!("Directory does not exist: {}", folder_path));
    }
    
    let mut results = Vec::new();
    
    // Read directory contents
    match fs::read_dir(&dir_path) {
        Ok(entries) => {
            for entry in entries.flatten() {
                if results.len() >= max_results {
                    break;
                }
                
                let path = entry.path();
                let name = path.file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_string();
                
                // Skip hidden files
                if name.starts_with('.') {
                    continue;
                }
                
                // Get metadata
                let metadata = entry.metadata().ok();
                let is_dir = metadata.as_ref().map(|m| m.is_dir()).unwrap_or(false);
                let last_modified = metadata
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs());
                
                // Create relative path
                let relative_path = path.strip_prefix(&dir_path)
                    .unwrap_or(&path)
                    .to_string_lossy()
                    .replace('\\', "/");
                
                results.push(FileSearchResult {
                    file_type: if is_dir { "directory".to_string() } else { "file".to_string() },
                    path: path.to_string_lossy().to_string(),
                    name,
                    relative_path,
                    last_modified,
                });
            }
            
            // Sort by type (directories first), then configs, then by name
            results.sort_by(|a, b| {
                // Directories first
                match (a.file_type.as_str(), b.file_type.as_str()) {
                    ("directory", "file") => return std::cmp::Ordering::Less,
                    ("file", "directory") => return std::cmp::Ordering::Greater,
                    _ => {}
                }
                
                // If both are files, check if they're config files
                if a.file_type == "file" && b.file_type == "file" {
                    let a_is_config = a.name.contains("config") || 
                                     a.name.ends_with(".json") || 
                                     a.name.ends_with(".yml") || 
                                     a.name.ends_with(".yaml") ||
                                     a.name.ends_with(".toml") ||
                                     a.name == "package.json" ||
                                     a.name == "tsconfig.json" ||
                                     a.name == ".env";
                    let b_is_config = b.name.contains("config") || 
                                     b.name.ends_with(".json") || 
                                     b.name.ends_with(".yml") || 
                                     b.name.ends_with(".yaml") ||
                                     b.name.ends_with(".toml") ||
                                     b.name == "package.json" ||
                                     b.name == "tsconfig.json" ||
                                     b.name == ".env";
                    
                    match (a_is_config, b_is_config) {
                        (true, false) => return std::cmp::Ordering::Less,
                        (false, true) => return std::cmp::Ordering::Greater,
                        _ => {}
                    }
                }
                
                // Finally alphabetical
                a.name.to_lowercase().cmp(&b.name.to_lowercase())
            });
            
            Ok(results)
        }
        Err(e) => Err(format!("Failed to read directory: {}", e))
    }
}

#[tauri::command]
pub async fn get_git_status(directory: String) -> Result<GitStatus, String> {
    use std::process::Command;
    
    let dir_path = PathBuf::from(&directory);
    if !dir_path.exists() {
        return Err(format!("Directory does not exist: {}", directory));
    }
    
    // Run git status command
    let output = Command::new("git")
        .args(&["status", "--porcelain", "-uall"])
        .current_dir(&dir_path)
        .output()
        .map_err(|e| format!("Failed to run git: {}", e))?;
    
    if !output.status.success() {
        return Err("Not a git repository".to_string());
    }
    
    let mut status = GitStatus {
        modified: Vec::new(),
        added: Vec::new(),
        deleted: Vec::new(),
        renamed: Vec::new(),
    };
    
    let output_str = String::from_utf8_lossy(&output.stdout);
    
    for line in output_str.lines() {
        if line.len() < 3 {
            continue;
        }
        
        let status_code = &line[..2];
        let file_path = line[3..].trim();
        
        match status_code {
            " M" | "M " | "MM" => status.modified.push(file_path.to_string()),
            "A " | "AM" => status.added.push(file_path.to_string()),
            "D " | " D" => status.deleted.push(file_path.to_string()),
            "R " => status.renamed.push(file_path.to_string()),
            "??" => {}, // Untracked files - ignore for now
            _ => {
                // Modified files can have various status codes
                if status_code.contains('M') {
                    status.modified.push(file_path.to_string());
                }
            }
        }
    }
    
    Ok(status)
}

// Helper function for fuzzy matching
fn fuzzy_match(query: &str, text: &str) -> bool {
    let mut query_chars = query.chars();
    let mut current_char = query_chars.next();
    
    for text_char in text.chars() {
        if let Some(qc) = current_char {
            if qc == text_char {
                current_char = query_chars.next();
            }
        } else {
            return true; // All query chars found
        }
    }
    
    current_char.is_none() // True if all query chars were found
}