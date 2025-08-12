use std::path::PathBuf;
use std::fs;
use std::process::{Command, Child};
use tracing::{info, error};

// Embed the server code directly in the binary
const SERVER_CODE: &str = include_str!("../resources/server-simple.cjs");

pub struct EmbeddedServer {
    process: Option<Child>,
    server_path: Option<PathBuf>,
}

impl EmbeddedServer {
    pub fn new() -> Self {
        Self {
            process: None,
            server_path: None,
        }
    }
    
    pub fn start(&mut self) -> Result<(), String> {
        info!("Starting embedded server...");
        
        // Get temp directory
        let temp_dir = std::env::temp_dir();
        let server_dir = temp_dir.join("yurucode-server");
        
        // Create server directory
        fs::create_dir_all(&server_dir)
            .map_err(|e| format!("Failed to create server dir: {}", e))?;
        
        // Write server file
        let server_path = server_dir.join("server.cjs");
        fs::write(&server_path, SERVER_CODE)
            .map_err(|e| format!("Failed to write server: {}", e))?;
        
        info!("Server written to: {:?}", server_path);
        
        // Copy node_modules from resources if available
        if cfg!(not(debug_assertions)) {
            // In production, try to extract bundled node_modules
            self.extract_dependencies(&server_dir)?;
        }
        
        // Find Node.js
        let node_cmd = find_node();
        info!("Using Node.js: {}", node_cmd);
        
        // Start the server
        let mut cmd = Command::new(&node_cmd);
        cmd.arg(&server_path)
           .current_dir(&server_dir)
           .env("NODE_ENV", "production");
        
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        
        match cmd.spawn() {
            Ok(child) => {
                info!("Server started with PID: {}", child.id());
                self.process = Some(child);
                self.server_path = Some(server_path);
                Ok(())
            }
            Err(e) => {
                error!("Failed to start server: {}", e);
                Err(format!("Failed to start server: {}", e))
            }
        }
    }
    
    pub fn stop(&mut self) {
        if let Some(mut process) = self.process.take() {
            info!("Stopping server...");
            let _ = process.kill();
            let _ = process.wait();
        }
        
        // Clean up temp files
        if let Some(path) = self.server_path.take() {
            let _ = fs::remove_file(path);
        }
    }
    
    fn extract_dependencies(&self, server_dir: &PathBuf) -> Result<(), String> {
        // In a real implementation, we'd extract bundled node_modules
        // For now, we'll install them on first run
        let node_modules = server_dir.join("node_modules");
        if !node_modules.exists() {
            info!("Installing server dependencies...");
            
            // Create package.json
            let package_json = r#"{
                "name": "yurucode-server",
                "dependencies": {
                    "express": "^5.1.0",
                    "cors": "^2.8.5",
                    "socket.io": "^4.8.1"
                }
            }"#;
            
            fs::write(server_dir.join("package.json"), package_json)
                .map_err(|e| format!("Failed to write package.json: {}", e))?;
            
            // Run npm install
            let output = Command::new("npm")
                .args(&["install", "--production"])
                .current_dir(&server_dir)
                .output()
                .map_err(|e| format!("Failed to run npm install: {}", e))?;
            
            if !output.status.success() {
                error!("npm install failed: {}", String::from_utf8_lossy(&output.stderr));
                return Err("Failed to install dependencies".to_string());
            }
        }
        
        Ok(())
    }
}

fn find_node() -> String {
    // Try common locations
    #[cfg(target_os = "windows")]
    {
        for path in &[
            "node.exe",
            "C:\\Program Files\\nodejs\\node.exe",
            "C:\\Program Files (x86)\\nodejs\\node.exe",
        ] {
            if PathBuf::from(path).exists() || which::which(path).is_ok() {
                return path.to_string();
            }
        }
    }
    
    "node".to_string()
}

impl Drop for EmbeddedServer {
    fn drop(&mut self) {
        self.stop();
    }
}