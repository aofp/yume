use serde::{Deserialize, Serialize};
use tauri::{State, Window};

use crate::state::AppState;

#[derive(Debug, Serialize, Deserialize)]
pub struct FolderSelection {
    pub path: String,
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