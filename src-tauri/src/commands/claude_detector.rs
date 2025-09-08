/// Claude CLI Detection Commands
/// These commands support detecting both native Windows and WSL Claude installations

use std::process::Command;
use std::path::Path;

/// Check if a file exists on the filesystem
#[tauri::command]
pub fn check_file_exists(path: String) -> Result<bool, String> {
    Ok(Path::new(&path).exists())
}

/// Check if WSL is available on the system
#[tauri::command]
pub fn check_wsl_available() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        
        // Try to run a simple WSL command
        let result = Command::new("wsl")
            .args(&["--version"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
        
        Ok(result.is_ok())
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        Ok(false) // WSL only exists on Windows
    }
}

/// Get WSL username
#[tauri::command]
pub fn get_wsl_username() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        
        let output = Command::new("wsl")
            .args(&["-e", "bash", "-c", "whoami"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("Failed to get WSL username: {}", e))?;
        
        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
        } else {
            Err("Failed to get WSL username".to_string())
        }
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        Err("WSL is not available on this platform".to_string())
    }
}

/// Check if a file exists in WSL
#[tauri::command]
pub fn check_wsl_file_exists(path: String) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        
        let check_cmd = format!("[ -f \"{}\" ] && echo 'exists'", path);
        let output = Command::new("wsl")
            .args(&["-e", "bash", "-c", &check_cmd])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("Failed to check WSL file: {}", e))?;
        
        Ok(output.status.success() && String::from_utf8_lossy(&output.stdout).contains("exists"))
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        let _ = path;
        Err("WSL is not available on this platform".to_string())
    }
}

/// Execute a command in WSL
#[tauri::command]
pub fn execute_wsl_command(command: String) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        
        let output = Command::new("wsl")
            .args(&["-e", "bash", "-c", &command])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("Failed to execute WSL command: {}", e))?;
        
        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        let _ = command;
        Err("WSL is not available on this platform".to_string())
    }
}

/// Execute a Windows command
#[tauri::command]
pub fn execute_command(command: String, args: Vec<String>) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        
        let output = Command::new(command)
            .args(args)
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("Failed to execute command: {}", e))?;
        
        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        let output = Command::new(command)
            .args(args)
            .output()
            .map_err(|e| format!("Failed to execute command: {}", e))?;
        
        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    }
}

/// Save Claude settings to persistent storage
#[tauri::command]
pub fn save_claude_settings(settings: serde_json::Value) -> Result<(), String> {
    // Store in app data directory
    let app_data_dir = dirs::config_dir()
        .ok_or_else(|| "Could not determine config directory".to_string())?;
    
    let settings_dir = app_data_dir.join("yurucode");
    std::fs::create_dir_all(&settings_dir)
        .map_err(|e| format!("Failed to create settings directory: {}", e))?;
    
    let settings_file = settings_dir.join("claude_settings.json");
    let content = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    
    std::fs::write(settings_file, content)
        .map_err(|e| format!("Failed to write settings: {}", e))?;
    
    Ok(())
}

/// Load Claude settings from persistent storage
#[tauri::command]
pub fn load_claude_settings() -> Result<serde_json::Value, String> {
    let app_data_dir = dirs::config_dir()
        .ok_or_else(|| "Could not determine config directory".to_string())?;
    
    let settings_file = app_data_dir.join("yurucode").join("claude_settings.json");
    
    if !settings_file.exists() {
        return Ok(serde_json::json!(null));
    }
    
    let content = std::fs::read_to_string(settings_file)
        .map_err(|e| format!("Failed to read settings: {}", e))?;
    
    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse settings: {}", e))
}