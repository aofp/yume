use std::process::{Command, Child};
use std::path::PathBuf;
use std::fs;
use std::sync::Mutex;
use tracing::{info, error};
use tauri::Manager;

pub struct ServerManager {
    process: Mutex<Option<Child>>,
}

impl ServerManager {
    pub fn new() -> Self {
        Self {
            process: Mutex::new(None),
        }
    }

    pub fn start_server(&self, app_handle: &tauri::AppHandle) -> Result<(), String> {
        // Log to file for debugging
        let log_path = std::env::temp_dir().join("yurucode-server.log");
        let mut log_content = String::new();
        
        log_content.push_str(&format!("=== Server Start Attempt ===\n"));
        log_content.push_str(&format!("Time: {:?}\n", std::time::SystemTime::now()));
        
        // Determine server file and paths
        // Use server-simple.cjs for production (it works!)
        let server_filename = if cfg!(debug_assertions) {
            "server-claude-direct.cjs"
        } else {
            "server-simple.cjs"  // This one works in production
        };
        
        let (server_path, working_dir) = if cfg!(debug_assertions) {
            // Development mode
            let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
            let project_root = exe_path
                .parent()
                .and_then(|p| p.parent())
                .and_then(|p| p.parent())
                .and_then(|p| p.parent())
                .ok_or("Failed to find project root")?;
            
            log_content.push_str(&format!("Dev mode - project root: {:?}\n", project_root));
            (project_root.join(server_filename), project_root.to_path_buf())
        } else {
            // Production mode
            let resource_dir = app_handle.path()
                .resource_dir()
                .map_err(|e| format!("Failed to get resource dir: {}", e))?;
            
            log_content.push_str(&format!("Production mode - resource dir: {:?}\n", resource_dir));
            
            // List resource directory contents
            if let Ok(entries) = fs::read_dir(&resource_dir) {
                log_content.push_str("Resource dir contents:\n");
                for entry in entries {
                    if let Ok(entry) = entry {
                        log_content.push_str(&format!("  - {:?}\n", entry.path()));
                    }
                }
            }
            
            (resource_dir.join(server_filename), resource_dir)
        };
        
        // Check if server file exists
        if !server_path.exists() {
            log_content.push_str(&format!("ERROR: Server file not found at {:?}\n", server_path));
            fs::write(&log_path, &log_content).ok();
            return Err(format!("Server file not found at {:?}", server_path));
        }
        
        log_content.push_str(&format!("Server path: {:?}\n", server_path));
        log_content.push_str(&format!("Working dir: {:?}\n", working_dir));
        
        // Find Node.js
        let node_cmd = find_node_command();
        log_content.push_str(&format!("Node command: {}\n", node_cmd));
        
        // Build command
        let mut cmd = Command::new(&node_cmd);
        cmd.arg(server_path.to_str().unwrap())
           .current_dir(&working_dir)
           .env("NODE_ENV", if cfg!(debug_assertions) { "development" } else { "production" });
        
        // Hide console on Windows
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        
        // Spawn the server
        match cmd.spawn() {
            Ok(child) => {
                let pid = child.id();
                log_content.push_str(&format!("SUCCESS: Server started with PID {}\n", pid));
                
                // Store the process
                *self.process.lock().unwrap() = Some(child);
                
                // Write PID file
                if let Ok(temp_dir) = std::env::temp_dir().canonicalize() {
                    let pid_file = temp_dir.join("yurucode-server.pid");
                    fs::write(&pid_file, pid.to_string()).ok();
                    log_content.push_str(&format!("PID file written to {:?}\n", pid_file));
                }
                
                fs::write(&log_path, &log_content).ok();
                
                info!("Server started successfully with PID {}", pid);
                Ok(())
            }
            Err(e) => {
                log_content.push_str(&format!("ERROR: Failed to spawn server: {}\n", e));
                fs::write(&log_path, &log_content).ok();
                
                error!("Failed to spawn server: {}", e);
                Err(format!("Failed to spawn server: {}", e))
            }
        }
    }
    
    pub fn stop_server(&self) {
        if let Ok(mut process_guard) = self.process.lock() {
            if let Some(mut child) = process_guard.take() {
                info!("Stopping server process...");
                
                #[cfg(target_os = "windows")]
                {
                    // On Windows, use taskkill
                    Command::new("taskkill")
                        .args(&["/F", "/PID", &child.id().to_string()])
                        .output()
                        .ok();
                }
                
                #[cfg(not(target_os = "windows"))]
                {
                    child.kill().ok();
                }
                
                child.wait().ok();
                info!("Server stopped");
            }
        }
        
        // Clean up PID file
        if let Ok(temp_dir) = std::env::temp_dir().canonicalize() {
            let pid_file = temp_dir.join("yurucode-server.pid");
            fs::remove_file(pid_file).ok();
        }
    }
}

fn find_node_command() -> String {
    // Try to find Node.js
    #[cfg(target_os = "windows")]
    {
        // Check common Windows locations
        let locations = [
            "C:\\Program Files\\nodejs\\node.exe",
            "C:\\Program Files (x86)\\nodejs\\node.exe",
            "node.exe",
            "node",
        ];
        
        for loc in &locations {
            if PathBuf::from(loc).exists() || which::which(loc).is_ok() {
                return loc.to_string();
            }
        }
    }
    
    // Default
    "node".to_string()
}

impl Drop for ServerManager {
    fn drop(&mut self) {
        self.stop_server();
    }
}