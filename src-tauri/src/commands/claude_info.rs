/// Claude binary information command
/// Provides info about Claude installations for display in settings

use serde::{Deserialize, Serialize};
use tracing::info;
use crate::claude_binary::{discover_claude_installations, ClaudeInstallation};

/// Response structure for Claude binary information
#[derive(Debug, Serialize)]
pub struct ClaudeBinaryInfo {
    pub installations: Vec<ClaudeInstallation>,
    pub selected: Option<ClaudeInstallation>,
    pub platform: String,
    pub wsl_available: bool,
}

/// Gets information about available Claude binaries
#[tauri::command]
pub async fn get_claude_binary_info() -> Result<ClaudeBinaryInfo, String> {
    info!("get_claude_binary_info command called");
    
    // Find all Claude installations
    let installations = discover_claude_installations();
    
    // Get the selected one (first one is selected by default)
    let selected = installations.first().cloned();
    
    // Determine platform
    let platform = if cfg!(target_os = "windows") {
        "windows".to_string()
    } else if cfg!(target_os = "macos") {
        "macos".to_string()
    } else {
        "linux".to_string()
    };
    
    // Check WSL availability (only on Windows)
    let wsl_available = if cfg!(target_os = "windows") {
        // Check if WSL is available by trying to run wsl --version
        std::process::Command::new("wsl")
            .arg("--version")
            .output()
            .map(|output| output.status.success())
            .unwrap_or(false)
    } else {
        false
    };
    
    Ok(ClaudeBinaryInfo {
        installations,
        selected,
        platform,
        wsl_available,
    })
}