use std::path::Path;
/// Claude CLI Detection Commands
/// These commands support detecting both native Windows and WSL Claude installations
use std::process::Command;

use crate::app::APP_ID;

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
            // Normalize CRLF to LF for Windows compatibility, then trim
            Ok(String::from_utf8_lossy(&output.stdout)
                .replace("\r\n", "\n")
                .trim()
                .to_string())
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
    let app_data_dir =
        dirs::config_dir().ok_or_else(|| "Could not determine config directory".to_string())?;

    let settings_dir = app_data_dir.join(APP_ID);
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
    let app_data_dir =
        dirs::config_dir().ok_or_else(|| "Could not determine config directory".to_string())?;

    let settings_file = app_data_dir.join(APP_ID).join("claude_settings.json");

    if !settings_file.exists() {
        return Ok(serde_json::json!(null));
    }

    let content = std::fs::read_to_string(settings_file)
        .map_err(|e| format!("Failed to read settings: {}", e))?;

    serde_json::from_str(&content).map_err(|e| format!("Failed to parse settings: {}", e))
}

/// Get an environment variable value
#[tauri::command]
pub fn get_env_var(name: String) -> Result<Option<String>, String> {
    Ok(std::env::var(&name).ok())
}

/// Get Windows-specific paths for Claude detection
/// Returns a JSON object with common Windows paths
#[tauri::command]
pub fn get_windows_paths() -> Result<serde_json::Value, String> {
    let mut paths = serde_json::Map::new();

    // Get USERPROFILE
    if let Ok(userprofile) = std::env::var("USERPROFILE") {
        paths.insert(
            "userprofile".to_string(),
            serde_json::Value::String(userprofile),
        );
    }

    // Get APPDATA
    if let Ok(appdata) = std::env::var("APPDATA") {
        paths.insert("appdata".to_string(), serde_json::Value::String(appdata));
    }

    // Get LOCALAPPDATA
    if let Ok(localappdata) = std::env::var("LOCALAPPDATA") {
        paths.insert(
            "localappdata".to_string(),
            serde_json::Value::String(localappdata),
        );
    }

    // Get PATH directories
    if let Ok(path_env) = std::env::var("PATH") {
        #[cfg(target_os = "windows")]
        let separator = ';';
        #[cfg(not(target_os = "windows"))]
        let separator = ':';

        let path_dirs: Vec<String> = path_env
            .split(separator)
            .map(|s| s.to_string())
            .filter(|s| !s.is_empty())
            .collect();
        paths.insert(
            "path_dirs".to_string(),
            serde_json::Value::Array(
                path_dirs
                    .into_iter()
                    .map(serde_json::Value::String)
                    .collect(),
            ),
        );
    }

    // Get home directory using dirs crate
    if let Some(home) = dirs::home_dir() {
        paths.insert(
            "home".to_string(),
            serde_json::Value::String(home.to_string_lossy().to_string()),
        );
    }

    Ok(serde_json::Value::Object(paths))
}

/// Check if a CLI tool is installed by running --version
/// Searches common installation paths since bundled apps have minimal PATH
/// Now async to avoid blocking the main thread
#[tauri::command]
pub async fn check_cli_installed(cli_name: String) -> Result<serde_json::Value, String> {
    use tracing::info;

    // Run the blocking work on a separate thread to avoid blocking the main thread
    let result = tokio::task::spawn_blocking(move || {
        info!("Checking if CLI '{}' is installed", cli_name);

        // Try to find the CLI binary in common paths
        if let Some((path, version)) = find_cli_binary(&cli_name) {
            info!(
                "CLI '{}' found at: {}, version: {:?}",
                cli_name, path, version
            );
            return serde_json::json!({
                "installed": true,
                "version": version,
                "path": path
            });
        }

        info!("CLI '{}' not found in any location", cli_name);
        serde_json::json!({
            "installed": false,
            "version": null
        })
    })
    .await
    .map_err(|e| format!("Failed to check CLI: {}", e))?;

    Ok(result)
}

/// Find a CLI binary by searching common installation paths
/// Returns (path, version) if found
fn find_cli_binary(cli_name: &str) -> Option<(String, Option<String>)> {
    use std::path::PathBuf;
    use tracing::debug;

    let mut paths_to_check: Vec<String> = Vec::new();

    // Common paths for npm global installs
    if let Ok(home) = std::env::var("HOME") {
        // NVM paths (most common for node-based CLIs)
        let nvm_dir = PathBuf::from(&home).join(".nvm").join("versions").join("node");
        if let Ok(entries) = std::fs::read_dir(&nvm_dir) {
            for entry in entries.flatten() {
                if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                    let cli_path = entry.path().join("bin").join(cli_name);
                    paths_to_check.push(cli_path.to_string_lossy().to_string());
                }
            }
        }

        // Other common paths
        paths_to_check.extend(vec![
            format!("{}/.local/bin/{}", home, cli_name),
            format!("{}/.npm-global/bin/{}", home, cli_name),
            format!("{}/.yarn/bin/{}", home, cli_name),
            format!("{}/.bun/bin/{}", home, cli_name),
            format!("{}/bin/{}", home, cli_name),
            format!("{}/.config/yarn/global/node_modules/.bin/{}", home, cli_name),
        ]);
    }

    // System paths
    paths_to_check.extend(vec![
        format!("/opt/homebrew/bin/{}", cli_name),
        format!("/usr/local/bin/{}", cli_name),
        format!("/usr/bin/{}", cli_name),
        format!("/bin/{}", cli_name),
    ]);

    #[cfg(target_os = "windows")]
    {
        if let Ok(appdata) = std::env::var("APPDATA") {
            let npm_path = PathBuf::from(&appdata).join("npm");
            paths_to_check.push(npm_path.join(format!("{}.cmd", cli_name)).to_string_lossy().to_string());
            paths_to_check.push(npm_path.join(format!("{}.exe", cli_name)).to_string_lossy().to_string());
            paths_to_check.push(npm_path.join(cli_name).to_string_lossy().to_string());
        }
    }

    // Check each path
    for path in &paths_to_check {
        let path_buf = PathBuf::from(path);
        if path_buf.exists() && path_buf.is_file() {
            debug!("Found {} at: {}", cli_name, path);
            let version = get_cli_version(path);
            return Some((path.clone(), version));
        }
    }

    // Fallback: try running the command directly (works if in PATH)
    #[cfg(target_os = "windows")]
    let result = {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        Command::new(cli_name)
            .args(&["--version"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
    };

    #[cfg(not(target_os = "windows"))]
    let result = Command::new(cli_name).args(&["--version"]).output();

    if let Ok(output) = result {
        if output.status.success() {
            let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
            return Some((cli_name.to_string(), Some(version)));
        }
    }

    None
}

/// Get version from a CLI binary
fn get_cli_version(path: &str) -> Option<String> {
    #[cfg(target_os = "windows")]
    let result = {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        Command::new(path)
            .args(&["--version"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
    };

    #[cfg(not(target_os = "windows"))]
    let result = Command::new(path).args(&["--version"]).output();

    if let Ok(output) = result {
        if output.status.success() {
            let version_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !version_str.is_empty() {
                return Some(version_str);
            }
        }
    }
    None
}
