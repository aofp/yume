/// Tauri command handlers module
/// This module contains all the IPC commands exposed to the frontend via Tauri's invoke system
/// Commands handle various operations including:
/// - Window management (DevTools, minimize, maximize, close)
/// - File system operations (folder selection, file search)
/// - Application state management (sessions, settings)
/// - Git integration
/// - Server communication
/// - Claude CLI direct spawning and management

pub mod claude_commands;
pub mod claude_info;
pub mod claude_detector;
pub mod database;
pub mod hooks;
pub mod compaction;
pub mod mcp;
pub mod custom_commands;
pub mod plugins;

// Re-export custom commands directly so they're available at commands:: level
pub use custom_commands::*;

use serde::{Deserialize, Serialize};
use tauri::{State, Window, Emitter};
use std::path::{Path, PathBuf};
use std::fs;
use std::time::SystemTime;
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use std::process::{Child, Stdio};
use once_cell::sync::Lazy;

use crate::state::AppState;
use crate::logged_server;

// Global store for running bash processes
static BASH_PROCESSES: Lazy<Arc<Mutex<HashMap<String, Child>>>> = Lazy::new(|| {
    Arc::new(Mutex::new(HashMap::new()))
});

// Global mutex to serialize git operations and prevent lock conflicts
// Uses tokio::sync::Mutex because guards need to be held across await points
static GIT_OPERATION_MUTEX: Lazy<tokio::sync::Mutex<()>> = Lazy::new(|| tokio::sync::Mutex::new(()));

/// Represents a folder selection from the native file dialog
#[derive(Debug, Serialize, Deserialize)]
pub struct FolderSelection {
    pub path: String,
}

/// Represents a file or directory found during search operations
/// Used by search_files, get_recent_files, and get_folder_contents commands
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

/// Represents the Git status of a repository
/// Parsed from `git status --porcelain` output
#[derive(Debug, Serialize, Deserialize)]
pub struct GitStatus {
    pub modified: Vec<String>,
    pub added: Vec<String>,
    pub deleted: Vec<String>,
    pub renamed: Vec<String>,
}

/// Represents a Claude agent loaded from ~/.claude/agents
#[derive(Debug, Serialize, Deserialize)]
pub struct ClaudeAgent {
    pub id: String,
    pub name: String,
    pub model: String,
    pub system_prompt: String,
    pub created_at: u64,
    pub updated_at: u64,
}

/// Get the user's home directory path
#[tauri::command]
pub fn get_home_directory() -> Result<String, String> {
    use dirs::home_dir;
    
    home_dir()
        .map(|path| path.to_string_lossy().to_string())
        .ok_or_else(|| "Could not determine home directory".to_string())
}

/// Get the current working directory
#[tauri::command]
pub fn get_current_directory() -> Result<String, String> {
    std::env::current_dir()
        .map(|path| path.to_string_lossy().to_string())
        .map_err(|e| format!("Failed to get current directory: {}", e))
}

/// Write content to a file (used by rollback to restore files)
#[tauri::command]
pub fn write_file_content(path: String, content: String) -> Result<(), String> {
    use std::fs;
    use std::path::Path;

    let file_path = Path::new(&path);

    // Create parent directories if they don't exist
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create parent directories: {}", e))?;
    }

    fs::write(file_path, content)
        .map_err(|e| format!("Failed to write file: {}", e))
}

/// Delete a file (used by rollback to remove files created by Claude)
#[tauri::command]
pub fn delete_file(path: String) -> Result<(), String> {
    use std::fs;
    use std::path::Path;

    let file_path = Path::new(&path);

    if file_path.exists() {
        fs::remove_file(file_path)
            .map_err(|e| format!("Failed to delete file: {}", e))
    } else {
        // File doesn't exist, nothing to delete
        Ok(())
    }
}

/// Read file content (used for backup before rollback)
#[tauri::command]
pub fn read_file_content(path: String) -> Result<Option<String>, String> {
    use std::fs;
    use std::path::Path;

    let file_path = Path::new(&path);

    if !file_path.exists() {
        return Ok(None);
    }

    // Check if file is too large (>10MB) - skip backup for huge files
    let metadata = fs::metadata(file_path)
        .map_err(|e| format!("Failed to get file metadata: {}", e))?;

    if metadata.len() > 10 * 1024 * 1024 {
        return Err("File too large to backup (>10MB)".to_string());
    }

    // Try to read as UTF-8, if it fails it might be binary
    match fs::read_to_string(file_path) {
        Ok(content) => Ok(Some(content)),
        Err(e) => {
            // Check if it's a UTF-8 error (binary file)
            if e.kind() == std::io::ErrorKind::InvalidData {
                Err("Binary file - cannot backup text content".to_string())
            } else {
                Err(format!("Failed to read file: {}", e))
            }
        }
    }
}

/// Atomic file restore with backup - restores a file and returns the previous content
/// This allows undo if something goes wrong
#[tauri::command]
pub fn atomic_file_restore(
    path: String,
    new_content: String
) -> Result<Option<String>, String> {
    use std::fs;
    use std::path::Path;

    let file_path = Path::new(&path);

    // Read current content for backup
    let previous_content = if file_path.exists() {
        let metadata = fs::metadata(file_path)
            .map_err(|e| format!("Failed to get file metadata: {}", e))?;

        // Skip backup for huge files
        if metadata.len() > 10 * 1024 * 1024 {
            None
        } else {
            fs::read_to_string(file_path).ok()
        }
    } else {
        None
    };

    // Create parent directories if they don't exist
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create parent directories: {}", e))?;
    }

    // Write new content
    fs::write(file_path, new_content)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(previous_content)
}

/// Atomic file delete with backup - deletes a file and returns the previous content
#[tauri::command]
pub fn atomic_file_delete(path: String) -> Result<Option<String>, String> {
    use std::fs;
    use std::path::Path;

    let file_path = Path::new(&path);

    if !file_path.exists() {
        return Ok(None);
    }

    // Read current content for backup
    let metadata = fs::metadata(file_path)
        .map_err(|e| format!("Failed to get file metadata: {}", e))?;

    let previous_content = if metadata.len() > 10 * 1024 * 1024 {
        None // Skip backup for huge files
    } else {
        fs::read_to_string(file_path).ok()
    };

    // Delete the file
    fs::remove_file(file_path)
        .map_err(|e| format!("Failed to delete file: {}", e))?;

    Ok(previous_content)
}

/// Toggles the Chrome DevTools window
/// Only available in debug builds for security reasons
/// Triggered by F12 key in the frontend
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

/// Opens a native folder selection dialog
/// Returns the selected folder path or None if cancelled
/// Uses Tauri's dialog plugin with async callback for macOS stability
#[tauri::command]
pub async fn select_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    println!("select_folder command called");
    
    use tauri_plugin_dialog::DialogExt;
    use tokio::sync::oneshot;
    
    // Create a channel to receive the result
    let (tx, rx) = oneshot::channel();
    
    // Get the dialog builder
    let dialog = app.dialog().file();
    
    // Configure and show the dialog with callback
    dialog
        .set_title("Select a folder")
        .pick_folder(move |path| {
            let result = match path {
                Some(p) => {
                    let path_str = p.to_string();
                    println!("Folder selected: {}", path_str);
                    Some(path_str)
                }
                None => {
                    println!("Folder selection cancelled");
                    None
                }
            };
            // Send the result through the channel
            let _ = tx.send(result);
        });
    
    // Wait for the result
    match rx.await {
        Ok(result) => Ok(result),
        Err(_) => {
            println!("Failed to receive folder selection result");
            Err("Failed to receive folder selection result".to_string())
        }
    }
}

/// Returns the port number where the Node.js backend server is running
/// This port is dynamically allocated at startup to avoid conflicts
#[tauri::command]
pub async fn get_server_port(state: State<'_, AppState>) -> Result<u16, String> {
    Ok(state.server_port())
}

/// Reads the port number from the ~/.yurucode/current-port.txt file
/// This file is written by the server when it starts to enable discovery
#[tauri::command]
pub async fn read_port_file() -> Result<u16, String> {
    use std::fs;
    use std::path::PathBuf;
    
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "Could not find home directory")?;
    
    let port_file = PathBuf::from(home).join(".yurucode").join("current-port.txt");
    
    if !port_file.exists() {
        return Err(format!("Port file does not exist: {:?}", port_file));
    }
    
    let content = fs::read_to_string(&port_file)
        .map_err(|e| format!("Failed to read port file: {}", e))?;
    
    let port = content.trim().parse::<u16>()
        .map_err(|e| format!("Invalid port number in file: {}", e))?;
    
    Ok(port)
}

/// Creates a new application window with the same configuration as the main window
/// Each window gets a unique ID to support multiple instances
/// Windows are borderless, transparent, and have custom decorations
#[tauri::command]
pub async fn new_window(app: tauri::AppHandle) -> Result<(), String> {
    let title = if cfg!(debug_assertions) {
        "yuru code (dev)"
    } else {
        "yuru code"
    };
    
    let _window = tauri::WebviewWindowBuilder::new(
        &app,
        format!("main-{}", uuid::Uuid::new_v4()), // Unique window label
        tauri::WebviewUrl::App("index.html".into())
    )
    .title(title)
    .inner_size(516.0, 509.0)
    .min_inner_size(516.0, 509.0)
    .resizable(true)
    .fullscreen(false)
    .decorations(false)
    .transparent(true)
    .center()
    .skip_taskbar(false)
    .accept_first_mouse(true)
    .build()
    .map_err(|e| e.to_string())?;
    
    Ok(())
}

/// Sends a message to the Claude CLI for a specific session
/// Currently a placeholder - actual implementation handled by WebSocket server
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

/// Interrupts an active Claude session (Ctrl+C equivalent)
/// Currently a placeholder - actual implementation handled by WebSocket server
#[tauri::command]
pub fn interrupt_session(
    _state: State<'_, AppState>,
    _session_id: String,
) -> Result<(), String> {
    // For now, just return OK - will implement async version later
    Ok(())
}

/// Clears the context for a Claude session
/// Currently a placeholder - actual implementation handled by WebSocket server
#[tauri::command]
pub fn clear_session(
    _state: State<'_, AppState>,
    _session_id: String,
) -> Result<(), String> {
    // For now, just return OK - will implement async version later
    Ok(())
}

/// Returns information about all active Claude sessions
/// Used by the frontend to populate the tab bar
#[tauri::command]
pub async fn get_sessions(state: State<'_, AppState>) -> Result<Vec<SessionInfo>, String> {
    Ok(state.get_sessions())
}

/// Sets the zoom level for the webview
/// Currently handled by frontend CSS transforms
#[tauri::command]
pub async fn set_zoom_level(_window: Window, _level: f64) -> Result<(), String> {
    // Zoom level will be handled via frontend for now
    Ok(())
}

/// Minimizes the application window to the taskbar/dock
#[tauri::command]
pub async fn minimize_window(window: Window) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

/// Toggles window maximization state
/// If maximized, restores to previous size; otherwise maximizes
#[tauri::command]
pub async fn maximize_window(window: Window) -> Result<(), String> {
    if window.is_maximized().unwrap_or(false) {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

/// Sets the window opacity (0.0 to 1.0)
/// On Windows, uses SetLayeredWindowAttributes for true window transparency
/// On macOS/Linux, this is a no-op as CSS opacity works for those platforms
#[tauri::command]
#[allow(unused_variables)]
pub async fn set_window_opacity(window: Window, opacity: f64) -> Result<(), String> {
    use tracing::info;

    // Clamp opacity between 0.65 and 1.0 (same range as frontend slider)
    let clamped = opacity.max(0.65).min(1.0);
    info!("Setting window opacity to: {}", clamped);

    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::{HWND, COLORREF};
        use windows::Win32::UI::WindowsAndMessaging::{
            SetLayeredWindowAttributes, LWA_ALPHA
        };

        if let Ok(hwnd) = window.hwnd() {
            unsafe {
                let hwnd = HWND(hwnd.0);
                // Convert 0.0-1.0 to 0-255 byte range
                let alpha = (clamped * 255.0) as u8;

                if let Err(e) = SetLayeredWindowAttributes(hwnd, COLORREF(0), alpha, LWA_ALPHA) {
                    return Err(format!("Failed to set window opacity: {:?}", e));
                }
                info!("Windows opacity set to alpha={} ({}%)", alpha, (clamped * 100.0) as i32);
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        // On macOS and Linux, CSS opacity works, so this is a no-op
        // The frontend handles opacity via document.documentElement.style.opacity
        info!("Non-Windows platform: opacity handled by CSS");
    }

    Ok(())
}

/// Closes the current window
/// The server remains running if other windows are open (multi-window support)
/// Server cleanup happens automatically when the last window closes
#[tauri::command]
pub async fn close_window(window: Window) -> Result<(), String> {
    use tracing::info;
    
    info!("Close window command received");
    
    // Just close this specific window
    // DON'T kill all node processes - that affects other instances!
    // The app-level handler will stop the server when the last window closes
    window.close().map_err(|e| e.to_string())?;
    
    Ok(())
}

/// Shows a context menu at the specified coordinates
/// Placeholder for future implementation with Tauri's menu API
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

/// Saves a setting value to persistent storage
/// Settings are stored as JSON and persist across app restarts
#[tauri::command]
pub async fn save_settings(
    state: State<'_, AppState>,
    key: String,
    value: serde_json::Value,
) -> Result<(), String> {
    state.save_setting(key, value).map_err(|e| e.to_string())
}

/// Loads a setting value from persistent storage
/// Returns None if the setting doesn't exist
#[tauri::command]
pub async fn load_settings(
    state: State<'_, AppState>,
    key: String,
) -> Result<Option<serde_json::Value>, String> {
    Ok(state.load_setting(key))
}

/// Returns the list of recently opened project directories
/// Used to populate the recent projects modal (Ctrl+R)
#[tauri::command]
pub async fn get_recent_projects(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    Ok(state.get_recent_projects())
}

/// Adds a project directory to the recent projects list
/// Automatically manages list size and deduplication
#[tauri::command]
pub async fn add_recent_project(
    state: State<'_, AppState>,
    path: String,
) -> Result<(), String> {
    state.add_recent_project(path);
    Ok(())
}

/// Information about a Claude session
/// Used for session management and tab display
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInfo {
    pub id: String,              // Unique session identifier
    pub working_dir: String,     // Current working directory for the session
    pub model: String,           // Claude model being used (opus/sonnet)
    pub message_count: usize,    // Number of messages in the conversation
    pub token_count: usize,      // Total tokens used in the session
}

/// Checks if a given path is a directory
/// Used to validate dropped items and path inputs
#[tauri::command]
pub fn check_is_directory(path: String) -> Result<bool, String> {
    let path = Path::new(&path);
    Ok(path.is_dir())
}

/// Toggles the console visibility setting for the Node.js server
/// Changes take effect on next server restart
/// Used for debugging server issues
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

/// Get available system fonts
/// Returns a list of font families available on the system
#[tauri::command]
pub fn get_system_fonts() -> Result<Vec<String>, String> {
    use std::collections::HashSet;
    
    let mut fonts = HashSet::new();
    
    // Platform-specific font directories
    #[cfg(target_os = "macos")]
    {
        let home_fonts = format!("{}/Library/Fonts", std::env::var("HOME").unwrap_or_default());
        let font_dirs = vec![
            "/System/Library/Fonts",
            "/Library/Fonts",
            home_fonts.as_str(),
        ];
        
        for dir in font_dirs {
            if let Ok(entries) = std::fs::read_dir(dir) {
                for entry in entries.flatten() {
                    if let Some(name) = entry.file_name().to_str() {
                        if name.ends_with(".ttf") || name.ends_with(".otf") || name.ends_with(".ttc") {
                            // Extract font name from filename (simplified)
                            let font_name = name.replace(".ttf", "")
                                .replace(".otf", "")
                                .replace(".ttc", "")
                                .replace("-", " ");
                            fonts.insert(font_name);
                        }
                    }
                }
            }
        }
    }
    
    #[cfg(target_os = "windows")]
    {
        if let Ok(entries) = std::fs::read_dir("C:\\Windows\\Fonts") {
            for entry in entries.flatten() {
                if let Some(name) = entry.file_name().to_str() {
                    if name.ends_with(".ttf") || name.ends_with(".otf") {
                        let font_name = name.replace(".ttf", "")
                            .replace(".otf", "")
                            .replace("-", " ");
                        fonts.insert(font_name);
                    }
                }
            }
        }
    }
    
    #[cfg(target_os = "linux")]
    {
        let home_fonts = format!("{}/.fonts", std::env::var("HOME").unwrap_or_default());
        let home_local_fonts = format!("{}/.local/share/fonts", std::env::var("HOME").unwrap_or_default());
        let font_dirs = vec![
            "/usr/share/fonts",
            "/usr/local/share/fonts",
            home_fonts.as_str(),
            home_local_fonts.as_str(),
        ];
        
        for dir in font_dirs {
            if let Ok(entries) = std::fs::read_dir(dir) {
                for entry in entries.flatten() {
                    if let Some(name) = entry.file_name().to_str() {
                        if name.ends_with(".ttf") || name.ends_with(".otf") {
                            let font_name = name.replace(".ttf", "")
                                .replace(".otf", "")
                                .replace("-", " ");
                            fonts.insert(font_name);
                        }
                    }
                }
            }
        }
    }
    
    // Convert to sorted vector
    let mut font_list: Vec<String> = fonts.into_iter().collect();
    font_list.sort();
    
    Ok(font_list)
}

/// Executes a bash command and returns the output
/// Platform-specific implementation for Windows (via WSL/Git Bash), macOS, and Linux
/// Now with process tracking for cancellation support
#[tauri::command]
pub async fn execute_bash(command: String, working_dir: Option<String>) -> Result<String, String> {
    use std::process::Command;
    use tokio::time::{timeout, Duration};
    
    // Use provided working directory or home directory as fallback
    let cwd = working_dir.unwrap_or_else(|| {
        dirs::home_dir()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| String::from("/"))
    });

    // Check if this is a git command - if so, serialize with other git operations
    let is_git_command = command.trim().starts_with("git ") || command.contains(" git ");

    // Acquire git mutex if needed (held for duration of command to prevent races)
    let _git_guard = if is_git_command {
        Some(GIT_OPERATION_MUTEX.lock().await)
    } else {
        None
    };

    // Wait for git lock file if this is a git command
    if is_git_command {
        let dir_path = std::path::PathBuf::from(&cwd);
        if !wait_for_git_lock(&dir_path) {
            return Err("Git is busy (index.lock exists)".to_string());
        }
    }

    // Spawn task to handle bash execution
    let handle = tokio::spawn(async move {
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            
            // Try WSL first, then Git Bash, then cmd
            let output = Command::new("wsl")
                .current_dir(&cwd)
                .args(&["bash", "-c", &command])
                .creation_flags(CREATE_NO_WINDOW)
                .output()
                .or_else(|_| {
                    Command::new("bash")
                        .current_dir(&cwd)
                        .args(&["-c", &command])
                        .creation_flags(CREATE_NO_WINDOW)
                        .output()
                })
                .or_else(|_| {
                    Command::new("cmd")
                        .current_dir(&cwd)
                        .args(&["/C", &command])
                        .creation_flags(CREATE_NO_WINDOW)
                        .output()
                })
                .map_err(|e| format!("Failed to execute command: {}", e))?;
            
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            
            // Check if the command failed based on exit status
            if !output.status.success() {
                // Special case: git commit with nothing to commit returns exit code 1
                // but outputs to stdout, not stderr
                if command.starts_with("git commit") && stdout.contains("nothing to commit") {
                    // This is not really an error, return the message as success
                    return Ok(stdout.to_string());
                }
                
                // Return error with both stderr and stdout for debugging
                let error_msg = if !stderr.is_empty() {
                    stderr.to_string()
                } else if !stdout.is_empty() {
                    stdout.to_string()
                } else {
                    format!("Command failed with exit code: {:?}", output.status.code())
                };
                return Err(error_msg);
            }
            
            // Command succeeded, return output
            if !stderr.is_empty() {
                Ok(format!("{}\n{}", stdout, stderr))
            } else {
                Ok(stdout.to_string())
            }
        }
        
        #[cfg(not(target_os = "windows"))]
        {
            let output = Command::new("bash")
                .current_dir(&cwd)
                .args(&["-c", &command])
                .output()
                .map_err(|e| format!("Failed to execute command: {}", e))?;
            
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            
            // Check if the command failed based on exit status
            if !output.status.success() {
                // Special case: git commit with nothing to commit returns exit code 1
                // but outputs to stdout, not stderr
                if command.starts_with("git commit") && stdout.contains("nothing to commit") {
                    // This is not really an error, return the message as success
                    return Ok(stdout.to_string());
                }
                
                // Return error with both stderr and stdout for debugging
                let error_msg = if !stderr.is_empty() {
                    stderr.to_string()
                } else if !stdout.is_empty() {
                    stdout.to_string()
                } else {
                    format!("Command failed with exit code: {:?}", output.status.code())
                };
                return Err(error_msg);
            }
            
            // Command succeeded, return output
            if !stderr.is_empty() {
                Ok(format!("{}\n{}", stdout, stderr))
            } else {
                Ok(stdout.to_string())
            }
        }
    });
    
    // Wait for the task with a timeout (30 seconds for long-running commands)
    match timeout(Duration::from_secs(30), handle).await {
        Ok(Ok(result)) => result,
        Ok(Err(e)) => Err(format!("Task error: {}", e)),
        Err(_) => Err("Command timed out after 30 seconds".to_string()),
    }
}

/// Spawn a bash command and stream output in real-time
#[tauri::command]
pub async fn spawn_bash(
    window: Window,
    command: String, 
    working_dir: Option<String>
) -> Result<String, String> {
    use std::process::Command;
    use std::thread;
    use std::io::{BufRead, BufReader as StdBufReader};
    
    // Generate unique process ID
    let process_id = format!("bash-{}", uuid::Uuid::new_v4());
    let pid_clone = process_id.clone();
    
    tracing::info!("Spawning bash command: {} with ID: {}", command, process_id);
    
    // Use provided working directory or home directory as fallback
    let cwd = working_dir.unwrap_or_else(|| {
        dirs::home_dir()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| String::from("/"))
    });
    
    tracing::info!("Working directory: {}", cwd);
    
    // Spawn the process
    #[cfg(target_os = "windows")]
    let mut child = {
        use std::os::windows::process::CommandExt;
        // Combine flags to prevent window creation and focus stealing
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        const DETACHED_PROCESS: u32 = 0x00000008;
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;
        
        // Use combined flags to prevent focus loss
        let creation_flags = CREATE_NO_WINDOW | DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP;
        
        Command::new("wsl")
            .current_dir(&cwd)
            .args(&["bash", "-c", &command])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .stdin(Stdio::null())
            .creation_flags(creation_flags)
            .spawn()
            .or_else(|_| {
                Command::new("bash")
                    .current_dir(&cwd)
                    .args(&["-c", &command])
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped())
                    .stdin(Stdio::null())
                    .creation_flags(creation_flags)
                    .spawn()
            })
            .or_else(|_| {
                Command::new("cmd")
                    .current_dir(&cwd)
                    .args(&["/C", &command])
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped())
                    .stdin(Stdio::null())
                    .creation_flags(creation_flags)
                    .spawn()
            })
            .map_err(|e| format!("Failed to spawn command: {}", e))?
    };
    
    #[cfg(not(target_os = "windows"))]
    let mut child = Command::new("bash")
        .current_dir(&cwd)
        .args(&["-c", &command])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn command: {}", e))?;
    
    // Take stdout and stderr for streaming
    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;
    
    // Store process for potential cancellation
    {
        let mut processes = BASH_PROCESSES.lock().unwrap();
        processes.insert(process_id.clone(), child);
    }
    
    // Spawn threads to stream stdout and stderr
    let window_clone = window.clone();
    let pid_stdout = process_id.clone();
    thread::spawn(move || {
        let reader = StdBufReader::new(stdout);
        for line in reader.lines() {
            if let Ok(line) = line {
                tracing::info!("Bash stdout: {}", line);
                let _ = window_clone.emit(&format!("bash-output-{}", pid_stdout), &line);
            }
        }
        tracing::info!("Bash stdout reader finished for {}", pid_stdout);
    });
    
    let window_clone = window.clone();
    let pid_stderr = process_id.clone();
    thread::spawn(move || {
        let reader = StdBufReader::new(stderr);
        for line in reader.lines() {
            if let Ok(line) = line {
                tracing::info!("Bash stderr: {}", line);
                let _ = window_clone.emit(&format!("bash-error-{}", pid_stderr), &line);
            }
        }
        tracing::info!("Bash stderr reader finished for {}", pid_stderr);
    });
    
    // Spawn task to wait for completion and clean up
    let processes_clone = BASH_PROCESSES.clone();
    let window_for_async = window.clone();  // Clone for async closure
    tokio::spawn(async move {
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        
        loop {
            let should_break = {
                let mut processes = processes_clone.lock().unwrap();
                if let Some(mut child) = processes.remove(&pid_clone) {
                    match child.try_wait() {
                        Ok(Some(status)) => {
                            tracing::info!("Bash process {} completed with status: {:?}", pid_clone, status.code());
                            let _ = window_for_async.emit(&format!("bash-complete-{}", pid_clone), &status.code());
                            true
                        }
                        Ok(None) => {
                            // Still running, put it back
                            processes.insert(pid_clone.clone(), child);
                            false
                        }
                        Err(e) => {
                            tracing::error!("Error checking bash process {}: {}", pid_clone, e);
                            true
                        }
                    }
                } else {
                    // Process was killed or removed
                    true
                }
            };
            
            if should_break {
                break;
            }
            
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        }
    });
    
    Ok(process_id)
}

/// Kill a specific bash process
#[tauri::command]
pub fn kill_bash_process(process_id: String) -> Result<(), String> {
    let mut processes = BASH_PROCESSES.lock().unwrap();

    if let Some(mut child) = processes.remove(&process_id) {
        match child.kill() {
            Ok(_) => {
                tracing::info!("Killed bash process: {}", process_id);
                Ok(())
            }
            Err(e) => {
                tracing::error!("Failed to kill bash process {}: {}", process_id, e);
                Err(format!("Failed to kill process: {}", e))
            }
        }
    } else {
        Err("Process not found".to_string())
    }
}

/// Kill all running bash processes - called on app exit
/// This is a public function that can be called from lib.rs
pub fn kill_all_bash_processes() {
    let mut processes = BASH_PROCESSES.lock().unwrap();
    let count = processes.len();

    if count > 0 {
        tracing::info!("Killing {} bash processes on shutdown...", count);
        for (process_id, mut child) in processes.drain() {
            match child.kill() {
                Ok(_) => tracing::info!("Killed bash process: {}", process_id),
                Err(e) => tracing::warn!("Failed to kill bash process {}: {}", process_id, e),
            }
            // Wait briefly for process to exit
            let _ = child.wait();
        }
        tracing::info!("All bash processes killed");
    }
}

/// Opens a URL in the system's default browser
/// Platform-specific implementation for Windows, macOS, and Linux
#[tauri::command]
pub fn open_external(url: String) -> Result<(), String> {
    // Open URL in default browser
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        
        std::process::Command::new("cmd")
            .args(&["/C", "start", "", &url])
            .creation_flags(CREATE_NO_WINDOW)
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

/// Returns the current Node.js server logs
/// Used for debugging server issues
#[tauri::command]
pub fn get_server_logs() -> Result<String, String> {
    Ok(logged_server::get_server_logs())
}

/// Returns the file path where server logs are stored
/// Useful for accessing historical logs
#[tauri::command]
pub fn get_server_log_path() -> Result<String, String> {
    Ok(logged_server::get_log_path().to_string_lossy().to_string())
}

/// Clears the server logs file
/// Used to reset logs for debugging
#[tauri::command]
pub fn clear_server_logs() -> Result<(), String> {
    logged_server::clear_log();
    Ok(())
}

/// Load Claude agents from ~/.claude/agents directory (global agents)
/// Does NOT include yurucode built-in agents
#[tauri::command]
pub fn load_claude_agents() -> Result<Vec<ClaudeAgent>, String> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Could not determine home directory".to_string())?;

    let agents_dir = home_dir.join(".claude").join("agents");

    load_agents_from_directory(&agents_dir)
}

/// Load project-specific Claude agents from a directory's .claude/agents
#[tauri::command]
pub fn load_project_agents(directory: String) -> Result<Vec<ClaudeAgent>, String> {
    use std::path::PathBuf;
    
    let project_dir = PathBuf::from(directory);
    let agents_dir = project_dir.join(".claude").join("agents");
    
    load_agents_from_directory(&agents_dir)
}

// Helper function to load agents from a specific directory
fn load_agents_from_directory(agents_dir: &std::path::Path) -> Result<Vec<ClaudeAgent>, String> {
    use std::fs;
    
    if !agents_dir.exists() {
        return Ok(Vec::new());
    }
    
    let mut agents = Vec::new();
    
    // Read all .md files in the agents directory
    for entry in fs::read_dir(&agents_dir).map_err(|e| format!("Failed to read agents directory: {}", e))? {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();
        
        if path.extension().and_then(|s| s.to_str()) == Some("md") {
            // Read the file
            let content = fs::read_to_string(&path)
                .map_err(|e| format!("Failed to read agent file: {}", e))?;
            
            // Parse the frontmatter
            if let Some((frontmatter, body)) = parse_frontmatter(&content) {
                // Extract name and model from frontmatter
                let name = extract_yaml_field(&frontmatter, "name").unwrap_or_default();
                let model = extract_yaml_field(&frontmatter, "model").unwrap_or_else(|| "opus".to_string());
                
                if !name.is_empty() && !body.trim().is_empty() {
                    let file_metadata = fs::metadata(&path).ok();
                    let created_at = file_metadata.as_ref()
                        .and_then(|m| m.created().ok())
                        .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
                        .map(|d| d.as_secs())
                        .unwrap_or(0);
                    let updated_at = file_metadata.as_ref()
                        .and_then(|m| m.modified().ok())
                        .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
                        .map(|d| d.as_secs())
                        .unwrap_or(0);
                    
                    agents.push(ClaudeAgent {
                        id: format!("claude-agent-{}", name),
                        name,
                        model,
                        system_prompt: body.trim().to_string(),
                        created_at,
                        updated_at,
                    });
                }
            }
        }
    }
    
    Ok(agents)
}

// Helper function to parse YAML frontmatter
fn parse_frontmatter(content: &str) -> Option<(String, String)> {
    if content.starts_with("---\n") {
        let parts: Vec<&str> = content.splitn(3, "---\n").collect();
        if parts.len() >= 3 {
            return Some((parts[1].to_string(), parts[2].to_string()));
        }
    }
    None
}

// Helper function to extract a field from YAML frontmatter
fn extract_yaml_field(yaml: &str, field: &str) -> Option<String> {
    for line in yaml.lines() {
        if line.starts_with(&format!("{}:", field)) {
            let value = line.split(':').nth(1)?.trim();
            // Remove quotes if present
            let value = value.trim_matches('"').trim_matches('\'');
            return Some(value.to_string());
        }
    }
    None
}

/// Save a Claude agent to the global agents directory (~/.claude/agents)
#[tauri::command]
pub fn save_global_agent(agent: ClaudeAgent) -> Result<(), String> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Could not determine home directory".to_string())?;
    
    let agents_dir = home_dir.join(".claude").join("agents");
    save_agent_to_directory(&agent, &agents_dir)
}

/// Save a Claude agent to a project's agents directory
#[tauri::command]
pub fn save_project_agent(agent: ClaudeAgent, directory: String) -> Result<(), String> {
    use std::path::PathBuf;
    
    let project_dir = PathBuf::from(directory);
    let agents_dir = project_dir.join(".claude").join("agents");
    save_agent_to_directory(&agent, &agents_dir)
}

// Helper function to save an agent to a specific directory
fn save_agent_to_directory(agent: &ClaudeAgent, agents_dir: &std::path::Path) -> Result<(), String> {
    use std::fs;
    
    // Create directory if it doesn't exist
    if !agents_dir.exists() {
        fs::create_dir_all(agents_dir)
            .map_err(|e| format!("Failed to create agents directory: {}", e))?;
    }
    
    // Create the markdown content with YAML frontmatter
    let content = format!(
        "---\nname: {}\nmodel: {}\n---\n\n{}",
        agent.name,
        agent.model,
        agent.system_prompt
    );
    
    // Write to file (name.md)
    let file_path = agents_dir.join(format!("{}.md", agent.name));
    fs::write(&file_path, content)
        .map_err(|e| format!("Failed to write agent file: {}", e))?;
    
    Ok(())
}

/// Delete a Claude agent from the global agents directory
#[tauri::command]
pub fn delete_global_agent(agent_name: String) -> Result<(), String> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Could not determine home directory".to_string())?;
    
    let agents_dir = home_dir.join(".claude").join("agents");
    let file_path = agents_dir.join(format!("{}.md", agent_name));
    
    if file_path.exists() {
        std::fs::remove_file(&file_path)
            .map_err(|e| format!("Failed to delete agent file: {}", e))?;
    }
    
    Ok(())
}

/// Delete a project agent
#[tauri::command]
pub fn delete_project_agent(agent_name: String, directory: String) -> Result<(), String> {
    use std::path::PathBuf;
    
    let project_dir = PathBuf::from(directory);
    let agents_dir = project_dir.join(".claude").join("agents");
    let file_path = agents_dir.join(format!("{}.md", agent_name));
    
    if file_path.exists() {
        std::fs::remove_file(&file_path)
            .map_err(|e| format!("Failed to delete agent file: {}", e))?;
    }
    
    Ok(())
}

// ============================================================================
// YURUCODE AGENTS SYNC - Write/Remove yurucode-*.md files to ~/.claude/agents/
// ============================================================================

/// The 5 Yurucode Core Agents - these get written to ~/.claude/agents/
/// All agents use the currently selected model (passed in at sync time)
const YURUCODE_AGENTS: &[(&str, &str, &str)] = &[
    // (name, description, system_prompt)
    (
        "yurucode-architect",
        "proactively use this agent before implementing complex features. plans architecture, decomposes tasks into steps, identifies dependencies and risks. use this first when task has 3+ steps.",
        "architect agent. plan, design, decompose. think first. output: steps, dependencies, risks. use TodoWrite."
    ),
    (
        "yurucode-explorer",
        "proactively use this agent for codebase exploration and context gathering. searches files, reads code, understands structure. use instead of manual Glob/Grep for broad searches. read-only.",
        "explorer agent. find, read, understand. use Glob, Grep, Read. output: paths, snippets, structure. no edits."
    ),
    (
        "yurucode-implementer",
        "proactively use this agent for code changes after planning. makes small, focused edits. use for implementing planned changes from architect.",
        "implementer agent. code, edit, build. read before edit. small changes. output: working code, minimal diff."
    ),
    (
        "yurucode-guardian",
        "proactively use this agent after significant code changes. reviews for bugs, security issues, performance problems. use after implementer completes work.",
        "guardian agent. review, audit, verify. check bugs, security, performance. output: issues, severity, fixes."
    ),
    (
        "yurucode-specialist",
        "proactively use this agent for domain-specific tasks: writing tests, documentation, devops configs, data processing.",
        "specialist agent. adapt to domain: test, docs, devops, data. output: domain artifacts."
    ),
];

/// Get the path to the yurucode PID tracking directory
fn get_yurucode_pids_dir() -> Result<PathBuf, String> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Could not determine home directory".to_string())?;
    Ok(home_dir.join(".claude").join("agents").join(".yurucode-pids"))
}

/// Register this yurucode instance's PID
fn register_yurucode_pid() -> Result<(), String> {
    let pids_dir = get_yurucode_pids_dir()?;

    // Create directory if it doesn't exist
    if !pids_dir.exists() {
        fs::create_dir_all(&pids_dir)
            .map_err(|e| format!("Failed to create PIDs directory: {}", e))?;
    }

    // Write our PID to a file
    let pid = std::process::id();
    let pid_file = pids_dir.join(format!("{}", pid));
    fs::write(&pid_file, pid.to_string())
        .map_err(|e| format!("Failed to write PID file: {}", e))?;

    Ok(())
}

/// Unregister this yurucode instance's PID
fn unregister_yurucode_pid() -> Result<(), String> {
    let pids_dir = get_yurucode_pids_dir()?;
    let pid = std::process::id();
    let pid_file = pids_dir.join(format!("{}", pid));

    if pid_file.exists() {
        let _ = fs::remove_file(&pid_file);
    }

    Ok(())
}

/// Check if a process with given PID is still running
#[cfg(target_os = "macos")]
fn is_process_running(pid: u32) -> bool {
    use std::process::Command;

    Command::new("kill")
        .args(["-0", &pid.to_string()])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[cfg(target_os = "windows")]
fn is_process_running(pid: u32) -> bool {
    use std::process::Command;

    Command::new("tasklist")
        .args(["/FI", &format!("PID eq {}", pid), "/NH"])
        .output()
        .map(|o| {
            let output = String::from_utf8_lossy(&o.stdout);
            output.contains(&pid.to_string())
        })
        .unwrap_or(false)
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn is_process_running(pid: u32) -> bool {
    // Linux: check /proc/PID
    std::path::Path::new(&format!("/proc/{}", pid)).exists()
}

/// Check if other yurucode instances are running (besides this one)
fn other_yurucode_instances_running() -> bool {
    let pids_dir = match get_yurucode_pids_dir() {
        Ok(dir) => dir,
        Err(_) => return false,
    };

    if !pids_dir.exists() {
        return false;
    }

    let current_pid = std::process::id();

    // Read all PID files and check if those processes are alive
    if let Ok(entries) = fs::read_dir(&pids_dir) {
        for entry in entries.flatten() {
            if let Some(filename) = entry.file_name().to_str() {
                if let Ok(pid) = filename.parse::<u32>() {
                    // Skip our own PID
                    if pid == current_pid {
                        continue;
                    }

                    // Check if this process is still alive
                    if is_process_running(pid) {
                        return true;
                    } else {
                        // Clean up stale PID file
                        let _ = fs::remove_file(entry.path());
                    }
                }
            }
        }
    }

    false
}

/// Write yurucode agent files to ~/.claude/agents/
/// Uses the provided model for all agents
fn write_yurucode_agent_files(model: &str) -> Result<(), String> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Could not determine home directory".to_string())?;

    let agents_dir = home_dir.join(".claude").join("agents");

    // Create directory if it doesn't exist
    if !agents_dir.exists() {
        fs::create_dir_all(&agents_dir)
            .map_err(|e| format!("Failed to create agents directory: {}", e))?;
    }

    // Write each agent file with the current model
    // Quote values to handle YAML special characters like colons
    for (name, description, system_prompt) in YURUCODE_AGENTS {
        let content = format!(
            "---\nname: \"{}\"\nmodel: \"{}\"\ndescription: \"{}\"\n---\n\n{}",
            name, model, description, system_prompt
        );

        let file_path = agents_dir.join(format!("{}.md", name));
        fs::write(&file_path, content)
            .map_err(|e| format!("Failed to write agent file {}: {}", name, e))?;
    }

    Ok(())
}

/// Remove yurucode agent files from ~/.claude/agents/
fn remove_yurucode_agent_files() -> Result<(), String> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Could not determine home directory".to_string())?;

    let agents_dir = home_dir.join(".claude").join("agents");

    // Remove each agent file
    for (name, _, _) in YURUCODE_AGENTS {
        let file_path = agents_dir.join(format!("{}.md", name));
        if file_path.exists() {
            let _ = fs::remove_file(&file_path);
        }
    }

    Ok(())
}

/// Sync yurucode agents to ~/.claude/agents/ based on enabled state
/// Call this on app startup and when toggling agents or switching models
#[tauri::command]
pub fn sync_yurucode_agents(enabled: bool, model: Option<String>) -> Result<(), String> {
    if enabled {
        // Use provided model or default to "opus"
        let model_str = model.as_deref().unwrap_or("opus");
        // Register our PID and write agent files
        register_yurucode_pid()?;
        write_yurucode_agent_files(model_str)?;
        tracing::info!("Yurucode agents synced to ~/.claude/agents/ with model: {}", model_str);
    } else {
        // Remove agent files (but keep PID registered for cleanup logic)
        remove_yurucode_agent_files()?;
        tracing::info!("Yurucode agents removed from ~/.claude/agents/");
    }

    Ok(())
}

/// Cleanup yurucode agents on app exit
/// Only removes agent files if no other yurucode instances are running
#[tauri::command]
pub fn cleanup_yurucode_agents_on_exit() -> Result<(), String> {
    // Unregister our PID first
    unregister_yurucode_pid()?;

    // Only remove agent files if no other instances are running
    if !other_yurucode_instances_running() {
        remove_yurucode_agent_files()?;

        // Also clean up the PIDs directory if empty
        if let Ok(pids_dir) = get_yurucode_pids_dir() {
            let _ = fs::remove_dir(&pids_dir); // Only succeeds if empty
        }

        tracing::info!("Yurucode agents cleaned up (last instance)");
    } else {
        tracing::info!("Yurucode agents kept (other instances running)");
    }

    Ok(())
}

/// Check if yurucode agents are currently synced to ~/.claude/agents/
#[tauri::command]
pub fn are_yurucode_agents_synced() -> Result<bool, String> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Could not determine home directory".to_string())?;

    let agents_dir = home_dir.join(".claude").join("agents");

    // Check if all yurucode agent files exist
    for (name, _, _) in YURUCODE_AGENTS {
        let file_path = agents_dir.join(format!("{}.md", name));
        if !file_path.exists() {
            return Ok(false);
        }
    }

    Ok(true)
}

// ============================================================================

/// Searches for files and directories matching a query string
/// Supports fuzzy matching and filters out common ignore patterns
/// Returns results sorted by relevance (exact matches first)
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

/// Returns the most recently modified files in a directory
/// Recursively searches up to 5 levels deep
/// Filters out hidden files and common build/dependency directories
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

/// Returns the immediate contents of a folder (non-recursive)
/// Sorts results with directories first, then config files, then alphabetically
/// Filters out hidden files
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

/// Find the git root directory by traversing up from the given path
fn find_git_root(dir_path: &PathBuf) -> Option<PathBuf> {
    let mut current = dir_path.clone();
    loop {
        if current.join(".git").exists() {
            return Some(current);
        }
        if !current.pop() {
            return None;
        }
    }
}

/// Check if git index is locked and wait briefly if so
/// Removes stale lock files that were left behind by crashed processes
fn wait_for_git_lock(dir_path: &PathBuf) -> bool {
    // Find actual git root (lock file is always at repo root, not subdirectory)
    let git_root = match find_git_root(dir_path) {
        Some(root) => root,
        None => return true, // Not a git repo, no lock possible
    };

    let lock_path = git_root.join(".git/index.lock");

    if !lock_path.exists() {
        return true;
    }

    // First check: if lock is older than 2 seconds, it's likely stale (most git ops are fast)
    if let Ok(metadata) = std::fs::metadata(&lock_path) {
        if let Ok(modified) = metadata.modified() {
            if let Ok(elapsed) = modified.elapsed() {
                if elapsed.as_secs() >= 2 {
                    // Lock is old - remove it immediately
                    if std::fs::remove_file(&lock_path).is_ok() {
                        eprintln!("Removed stale git lock file (older than 2s): {:?}", lock_path);
                        return true;
                    }
                }
            }
        }
    }

    // Lock exists and is fresh - check if there's actually a git process running
    if !is_git_process_running() {
        // No git process running, this is a stale lock from a crash
        if std::fs::remove_file(&lock_path).is_ok() {
            eprintln!("Removed stale git lock file (no git process running): {:?}", lock_path);
            return true;
        }
    }

    // Git process might be running, wait up to 1 second (10 x 100ms)
    for _ in 0..10 {
        if !lock_path.exists() {
            return true;
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }

    // Lock still exists after 1s - force remove since zombie is likely the cause
    if std::fs::remove_file(&lock_path).is_ok() {
        eprintln!("Force removed git lock file after 1s wait: {:?}", lock_path);
        return true;
    }

    false
}

/// Check if any git process is currently running
/// Uses broader pattern matching to catch git subprocesses (git-remote-https, etc.)
fn is_git_process_running() -> bool {
    use std::process::Command;

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        // Check for git.exe and git-*.exe subprocesses
        if let Ok(output) = Command::new("tasklist")
            .creation_flags(CREATE_NO_WINDOW)
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout).to_lowercase();
            return stdout.contains("git.exe") || stdout.contains("git-");
        }
        return false;
    }

    #[cfg(not(target_os = "windows"))]
    {
        // Use pgrep to find actual git processes (not our own grep/pgrep)
        // Look for /usr/bin/git or similar git binaries, excluding claude/yurucode processes
        if let Ok(output) = Command::new("pgrep")
            .args(&["-x", "git"])  // -x for exact match on process name
            .output()
        {
            if output.status.success() {
                return true;
            }
        }
        // Also check for git subprocesses like git-remote-https
        if let Ok(output) = Command::new("pgrep")
            .args(&["-f", "^/.*git-"])  // Match git-* subprocesses with full path
            .output()
        {
            if output.status.success() {
                return true;
            }
        }
        // No git process found
        false
    }
}

/// Returns the Git status for a repository
/// Parses output from `git status --porcelain`
/// Returns an error if the directory is not a Git repository
#[tauri::command]
pub async fn get_git_status(directory: String) -> Result<GitStatus, String> {
    use std::process::Command;

    let dir_path = PathBuf::from(&directory);
    if !dir_path.exists() {
        return Err(format!("Directory does not exist: {}", directory));
    }

    // Acquire git mutex to serialize with other git operations
    let _git_guard = GIT_OPERATION_MUTEX.lock().await;

    // Wait for any existing git lock to clear
    if !wait_for_git_lock(&dir_path) {
        return Err("Git is busy (index.lock exists)".to_string());
    }

    // Run git status command
    #[cfg(target_os = "windows")]
    let output = {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        
        Command::new("git")
            .args(&["status", "--porcelain", "-uall"])
            .current_dir(&dir_path)
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("Failed to run git: {}", e))?
    };
    
    #[cfg(not(target_os = "windows"))]
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

/// Cleans up stale git lock files in a directory
/// Called on app close and can be called manually
/// Returns the path of the removed lock file if one was removed
#[tauri::command]
pub fn cleanup_git_lock(directory: String) -> Option<String> {
    let dir_path = PathBuf::from(&directory);
    let lock_path = dir_path.join(".git/index.lock");

    if lock_path.exists() {
        // Check if git process is running before removing
        if !is_git_process_running() {
            if std::fs::remove_file(&lock_path).is_ok() {
                eprintln!("Cleaned up git lock file on request: {:?}", lock_path);
                return Some(lock_path.to_string_lossy().to_string());
            }
        }
    }
    None
}

/// Public function to clean git locks - can be called from lib.rs on app close
pub fn cleanup_git_lock_sync(directory: &str) {
    let dir_path = PathBuf::from(directory);
    let lock_path = dir_path.join(".git/index.lock");

    if lock_path.exists() {
        // On app close, always remove the lock (no git process check needed)
        if std::fs::remove_file(&lock_path).is_ok() {
            eprintln!("Cleaned up git lock file on app close: {:?}", lock_path);
        }
    }
}

/// Cleanup all stale git lock files on startup
/// Scans common locations for leftover lock files from crashed sessions
pub fn cleanup_stale_git_locks_on_startup() {
    // Only cleanup if no git process is running
    if is_git_process_running() {
        eprintln!("Git process running, skipping startup lock cleanup");
        return;
    }

    let mut cleaned = 0;

    // Get home directory
    if let Some(home) = dirs::home_dir() {
        // Check current working directory
        if let Ok(cwd) = std::env::current_dir() {
            if cleanup_single_git_lock(&cwd) {
                cleaned += 1;
            }
        }

        // Check common project locations (avoid Documents/Desktop to prevent macOS permission prompts)
        let project_dirs = vec![
            home.join("yurucode"),
            home.join("projects"),
            home.join("code"),
            home.join("dev"),
        ];

        for dir in project_dirs {
            if dir.exists() && dir.is_dir() {
                if cleanup_single_git_lock(&dir) {
                    cleaned += 1;
                }
                // Also check immediate subdirectories (common project structure)
                if let Ok(entries) = std::fs::read_dir(&dir) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.is_dir() {
                            if cleanup_single_git_lock(&path) {
                                cleaned += 1;
                            }
                        }
                    }
                }
            }
        }
    }

    if cleaned > 0 {
        eprintln!("Startup: cleaned {} stale git lock file(s)", cleaned);
    }
}

/// Helper to cleanup a single git lock file
fn cleanup_single_git_lock(dir: &PathBuf) -> bool {
    let lock_path = dir.join(".git/index.lock");
    if lock_path.exists() {
        if std::fs::remove_file(&lock_path).is_ok() {
            eprintln!("Removed stale git lock: {:?}", lock_path);
            return true;
        }
    }
    false
}

/// Returns git diff numstat for line additions/deletions per file
/// Uses native git on Windows to avoid WSL issues
#[tauri::command]
pub async fn get_git_diff_numstat(directory: String) -> Result<String, String> {
    use std::process::Command;

    let dir_path = PathBuf::from(&directory);
    if !dir_path.exists() {
        return Err(format!("Directory does not exist: {}", directory));
    }

    // Acquire git mutex to serialize with other git operations
    let _git_guard = GIT_OPERATION_MUTEX.lock().await;

    // Wait for any existing git lock to clear
    if !wait_for_git_lock(&dir_path) {
        return Err("Git is busy (index.lock exists)".to_string());
    }

    // Run git diff --numstat command using native git
    // --ignore-cr-at-eol fixes Windows CRLF line ending issues
    #[cfg(target_os = "windows")]
    let output = {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        Command::new("git")
            .args(&["diff", "--numstat", "--ignore-cr-at-eol"])
            .current_dir(&dir_path)
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("Failed to run git diff: {}", e))?
    };

    #[cfg(not(target_os = "windows"))]
    let output = Command::new("git")
        .args(&["diff", "--numstat", "--ignore-cr-at-eol"])
        .current_dir(&dir_path)
        .output()
        .map_err(|e| format!("Failed to run git diff: {}", e))?;

    if !output.status.success() {
        return Err("Failed to get git diff numstat".to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Helper function for fuzzy matching
/// Returns true if all characters in the query appear in the text in order
/// Example: "abc" matches "app_bar_config" (a-b-c appear in order)
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

/// Restores focus to the application window (Windows only)
/// Called after bash command to prevent focus loss
#[tauri::command]
pub fn restore_window_focus(window: tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::{
            SetForegroundWindow,
            ShowWindow, SW_RESTORE, BringWindowToTop,
            GetForegroundWindow, GetWindowThreadProcessId
        };
        use windows::Win32::UI::Input::KeyboardAndMouse::{
            SetActiveWindow, SetFocus
        };
        use windows::Win32::System::Threading::{
            GetCurrentThreadId, AttachThreadInput
        };
        
        let hwnd = window.hwnd().map_err(|e| format!("Failed to get window handle: {}", e))?;
        unsafe {
            let hwnd = HWND(hwnd.0);
            
            // Get the thread of the foreground window
            let foreground = GetForegroundWindow();
            let mut foreground_thread = 0u32;
            if !foreground.0.is_null() {
                foreground_thread = GetWindowThreadProcessId(foreground, None);
            }
            
            let current_thread = GetCurrentThreadId();
            
            // Attach our thread to the foreground thread temporarily
            // This allows us to bring our window to the foreground more reliably
            let mut attached = false;
            if foreground_thread != 0 && foreground_thread != current_thread {
                attached = AttachThreadInput(current_thread, foreground_thread, true).as_bool();
            }
            
            // Multiple attempts to ensure window gets focus
            let _ = BringWindowToTop(hwnd);
            let _ = ShowWindow(hwnd, SW_RESTORE);
            let _ = SetActiveWindow(hwnd);
            let _ = SetForegroundWindow(hwnd);
            let _ = SetFocus(Some(hwnd));
            
            // Detach the thread input if we attached it
            if attached {
                let _ = AttachThreadInput(current_thread, foreground_thread, false);
            }
        }
    }
    
    #[cfg(target_os = "macos")]
    {
        // On macOS, do NOT call window.set_focus() - it disrupts webview's internal focus state
        // causing the textarea to lose focus even though the window appears focused.
        // The webview handles focus better without native intervention.
        // Focus restoration is handled in the frontend instead.
        let _ = window; // Suppress unused warning
    }

    #[cfg(target_os = "linux")]
    {
        let _ = window; // Suppress unused warning - Linux generally handles focus well
    }

    Ok(())
}

/// Get Claude CLI version
#[tauri::command]
pub async fn get_claude_version() -> Result<String, String> {
    use std::process::Command;
    
    // Try to get Claude version
    let output = Command::new("claude")
        .arg("--version")
        .output()
        .map_err(|e| format!("Failed to run claude --version: {}", e))?;
    
    if output.status.success() {
        // Normalize CRLF to LF for Windows compatibility, then trim
        let version = String::from_utf8_lossy(&output.stdout)
            .replace("\r\n", "\n")
            .trim()
            .to_string();
        Ok(version)
    } else {
        Ok("unknown".to_string())
    }
}

/// Get Claude CLI binary path
#[tauri::command]
pub async fn get_claude_path() -> Result<String, String> {
    use std::process::Command;
    
    // Try to find Claude binary path using which
    #[cfg(not(target_os = "windows"))]
    {
        let output = Command::new("which")
            .arg("claude")
            .output()
            .map_err(|e| format!("Failed to run which claude: {}", e))?;
        
        if output.status.success() {
            // Normalize CRLF to LF for Windows compatibility, then trim
            let path = String::from_utf8_lossy(&output.stdout)
                .replace("\r\n", "\n")
                .trim()
                .to_string();
            Ok(path)
        } else {
            // Default path on macOS
            Ok("/usr/local/bin/claude".to_string())
        }
    }

    #[cfg(target_os = "windows")]
    {
        let output = Command::new("where")
            .arg("claude")
            .output()
            .map_err(|e| format!("Failed to run where claude: {}", e))?;

        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout)
                .lines()
                .next()
                .unwrap_or("claude")
                .trim()
                .to_string();
            Ok(path)
        } else {
            Ok("claude".to_string())
        }
    }
}

// ============================================================================
// FILE CONFLICT DETECTION FOR ROLLBACK
// ============================================================================

/// Get the current modification time of a file in milliseconds
#[tauri::command]
pub fn get_file_mtime(path: String) -> Result<Option<f64>, String> {
    use std::fs;
    use std::path::Path;
    use std::time::UNIX_EPOCH;

    let file_path = Path::new(&path);

    if !file_path.exists() {
        return Ok(None);
    }

    let metadata = fs::metadata(file_path)
        .map_err(|e| format!("Failed to get file metadata: {}", e))?;

    let mtime = metadata
        .modified()
        .map_err(|e| format!("Failed to get modification time: {}", e))?;

    let duration = mtime
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("System time error: {}", e))?;

    // Return milliseconds like JavaScript's Date.now()
    Ok(Some(duration.as_secs_f64() * 1000.0))
}

/// File conflict info returned from conflict check
#[derive(serde::Serialize)]
pub struct FileConflict {
    pub path: String,
    pub snapshot_mtime: Option<f64>,
    pub current_mtime: Option<f64>,
    pub exists: bool,
    pub conflict_type: String, // "modified", "deleted", "created", "none"
}

/// Check multiple files for conflicts before rollback
/// Takes a list of (path, expected_mtime, is_new_file) tuples
#[tauri::command]
pub fn check_file_conflicts(
    files: Vec<(String, Option<f64>, bool)>
) -> Result<Vec<FileConflict>, String> {
    use std::fs;
    use std::path::Path;
    use std::time::UNIX_EPOCH;

    let mut conflicts = Vec::new();

    for (path, snapshot_mtime, is_new_file) in files {
        let file_path = Path::new(&path);
        let exists = file_path.exists();

        let current_mtime = if exists {
            fs::metadata(file_path)
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_secs_f64() * 1000.0)
        } else {
            None
        };

        // Determine conflict type
        let conflict_type = if is_new_file {
            // File was new when snapshot taken (didn't exist)
            // On rollback, we want to DELETE this file
            if !exists {
                // File was already deleted by something else - that's fine, no conflict
                "none".to_string()
            } else {
                // File exists - we created it. Now check if it was modified since.
                // For new files, snapshot_mtime is None (file didn't exist),
                // but we have the snapshot timestamp which represents when we captured it.
                // We can't compare mtimes for new files, so we rely on the global
                // registry check (get_conflicting_edits) to detect cross-session modifications.
                // Don't flag as conflict here - mtime check doesn't work for new files.
                "none".to_string()
            }
        } else {
            // File existed when snapshot taken - we have originalContent to restore
            if !exists {
                "deleted".to_string() // File was deleted externally
            } else if let (Some(snap_mt), Some(curr_mt)) = (snapshot_mtime, current_mtime) {
                // Allow 1 second tolerance for filesystem time precision
                if (curr_mt - snap_mt).abs() > 1000.0 {
                    "modified".to_string()
                } else {
                    "none".to_string()
                }
            } else {
                // Can't compare mtimes (shouldn't happen for existing files)
                // Don't assume conflict - rely on global registry check
                "none".to_string()
            }
        };

        if conflict_type != "none" {
            conflicts.push(FileConflict {
                path,
                snapshot_mtime,
                current_mtime,
                exists,
                conflict_type,
            });
        }
    }

    Ok(conflicts)
}

/// File edit record for global registry
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct FileEditRecord {
    pub path: String,
    pub session_id: String,
    pub timestamp: f64,
    pub operation: String, // "edit", "write", "create", "delete"
}

/// Get the global file edit registry path
fn get_file_edit_registry_path() -> std::path::PathBuf {
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
        std::path::PathBuf::from(home)
            .join("Library")
            .join("Application Support")
            .join("yurucode")
            .join("file_edit_registry.json")
    }

    #[cfg(target_os = "windows")]
    {
        let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
        std::path::PathBuf::from(appdata)
            .join("yurucode")
            .join("file_edit_registry.json")
    }

    #[cfg(target_os = "linux")]
    {
        let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
        std::path::PathBuf::from(home)
            .join(".config")
            .join("yurucode")
            .join("file_edit_registry.json")
    }
}

/// Get lock file path for registry
fn get_registry_lock_path() -> std::path::PathBuf {
    let mut path = get_file_edit_registry_path();
    path.set_extension("lock");
    path
}

/// Acquire a simple file lock with timeout
/// Returns Ok(()) if lock acquired, Err if timeout
fn acquire_registry_lock() -> Result<(), String> {
    use std::fs;
    use std::thread;
    use std::time::{Duration, Instant};

    let lock_path = get_registry_lock_path();
    let timeout = Duration::from_secs(5);
    let start = Instant::now();

    // Ensure parent directory exists
    if let Some(parent) = lock_path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    loop {
        // Try to create lock file exclusively
        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&lock_path)
        {
            Ok(file) => {
                // Write PID for debugging
                use std::io::Write;
                let mut f = file;
                let _ = writeln!(f, "{}", std::process::id());
                return Ok(());
            }
            Err(_) => {
                // Lock file exists, check if stale (>30 seconds old)
                if let Ok(metadata) = fs::metadata(&lock_path) {
                    if let Ok(modified) = metadata.modified() {
                        if let Ok(age) = modified.elapsed() {
                            if age > Duration::from_secs(30) {
                                // Stale lock, remove it
                                let _ = fs::remove_file(&lock_path);
                                continue;
                            }
                        }
                    }
                }

                // Check timeout
                if start.elapsed() > timeout {
                    return Err("Timeout waiting for registry lock".to_string());
                }

                // Wait and retry
                thread::sleep(Duration::from_millis(50));
            }
        }
    }
}

/// Release the registry lock
fn release_registry_lock() {
    let lock_path = get_registry_lock_path();
    let _ = std::fs::remove_file(lock_path);
}

/// Register a file edit in the global registry
/// This allows cross-session conflict detection
#[tauri::command]
pub fn register_file_edit(
    path: String,
    session_id: String,
    timestamp: f64,
    operation: String
) -> Result<(), String> {
    use std::fs;

    // Acquire lock for thread-safe access
    acquire_registry_lock()?;

    let result = (|| {
        let registry_path = get_file_edit_registry_path();

        // Ensure parent directory exists
        if let Some(parent) = registry_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create registry directory: {}", e))?;
        }

        // Read existing registry
        let mut records: Vec<FileEditRecord> = if registry_path.exists() {
            let content = fs::read_to_string(&registry_path)
                .map_err(|e| format!("Failed to read registry: {}", e))?;
            serde_json::from_str(&content).unwrap_or_default()
        } else {
            Vec::new()
        };

        // Add new record
        records.push(FileEditRecord {
            path,
            session_id,
            timestamp,
            operation,
        });

        // Keep only records from last 24 hours to prevent unbounded growth
        let cutoff = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs_f64() * 1000.0 - 24.0 * 60.0 * 60.0 * 1000.0)
            .unwrap_or(0.0);

        records.retain(|r| r.timestamp > cutoff);

        // Write back
        let content = serde_json::to_string_pretty(&records)
            .map_err(|e| format!("Failed to serialize registry: {}", e))?;

        fs::write(&registry_path, content)
            .map_err(|e| format!("Failed to write registry: {}", e))?;

        Ok(())
    })();

    // Always release lock
    release_registry_lock();

    result
}

/// Normalize path for comparison (handle Windows backslashes and case)
fn normalize_path_for_comparison(path: &str) -> String {
    let normalized = path.replace('\\', "/");
    // On Windows and macOS, paths are case-insensitive
    #[cfg(any(target_os = "windows", target_os = "macos"))]
    {
        normalized.to_lowercase()
    }
    #[cfg(target_os = "linux")]
    {
        normalized
    }
}

/// Get edits from OTHER sessions that conflict with a rollback
/// Returns edits to the specified files by sessions other than current_session_id
/// that occurred after the specified timestamp
#[tauri::command]
pub fn get_conflicting_edits(
    paths: Vec<String>,
    current_session_id: String,
    after_timestamp: f64
) -> Result<Vec<FileEditRecord>, String> {
    use std::fs;

    let registry_path = get_file_edit_registry_path();

    if !registry_path.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(&registry_path)
        .map_err(|e| format!("Failed to read registry: {}", e))?;

    let records: Vec<FileEditRecord> = serde_json::from_str(&content)
        .unwrap_or_default();

    // Normalize paths for comparison
    let normalized_paths: Vec<String> = paths.iter()
        .map(|p| normalize_path_for_comparison(p))
        .collect();

    // Filter for conflicting edits
    let conflicts: Vec<FileEditRecord> = records
        .into_iter()
        .filter(|r| {
            // Must be from a different session
            r.session_id != current_session_id &&
            // Must be after the rollback target
            r.timestamp > after_timestamp &&
            // Must be for one of the files we're rolling back (normalized comparison)
            normalized_paths.contains(&normalize_path_for_comparison(&r.path))
        })
        .collect();

    Ok(conflicts)
}

/// Clear all file edit records for a session (call when session is cleared)
#[tauri::command]
pub fn clear_session_edits(session_id: String) -> Result<(), String> {
    use std::fs;

    let registry_path = get_file_edit_registry_path();

    if !registry_path.exists() {
        return Ok(());
    }

    // Acquire lock for thread-safe access
    acquire_registry_lock()?;

    let result = (|| {
        let content = fs::read_to_string(&registry_path)
            .map_err(|e| format!("Failed to read registry: {}", e))?;

        let mut records: Vec<FileEditRecord> = serde_json::from_str(&content)
            .unwrap_or_default();

        // Remove all records for this session
        records.retain(|r| r.session_id != session_id);

        let content = serde_json::to_string_pretty(&records)
            .map_err(|e| format!("Failed to serialize registry: {}", e))?;

        fs::write(&registry_path, content)
            .map_err(|e| format!("Failed to write registry: {}", e))?;

        Ok(())
    })();

    // Always release lock
    release_registry_lock();

    result
}