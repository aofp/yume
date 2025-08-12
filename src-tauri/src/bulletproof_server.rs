use std::process::Command;
use std::path::{Path, PathBuf};
use std::fs;
use tracing::{info, error};

pub fn start_server_bulletproof() {
    info!("Starting bulletproof server search...");
    
    // Get the exe location
    let exe_path = std::env::current_exe().unwrap_or_default();
    let exe_dir = exe_path.parent().unwrap_or(Path::new("."));
    
    info!("Exe location: {:?}", exe_path);
    info!("Exe directory: {:?}", exe_dir);
    
    // Log to file for debugging
    let log_file = std::env::temp_dir().join("yurucode-server-search.log");
    let mut log = format!("Server search log\n");
    log.push_str(&format!("Exe: {:?}\n", exe_path));
    log.push_str(&format!("Dir: {:?}\n", exe_dir));
    
    // Search for server file starting from exe location and going up
    let mut current = exe_dir.to_path_buf();
    let server_names = vec!["server-claude-direct.cjs", "server-simple.cjs"];
    
    for _ in 0..10 {  // Go up max 10 levels
        log.push_str(&format!("Checking: {:?}\n", current));
        
        for server_name in &server_names {
            let server_path = current.join(server_name);
            log.push_str(&format!("  Looking for: {:?}\n", server_path));
            
            if server_path.exists() {
                log.push_str(&format!("  FOUND! {:?}\n", server_path));
                let _ = fs::write(&log_file, &log);
                
                // Start the server
                start_server_at_path(&server_path);
                return;
            }
        }
        
        // Also check in src-tauri/resources
        let resources_path = current.join("src-tauri").join("resources");
        for server_name in &server_names {
            let server_path = resources_path.join(server_name);
            if server_path.exists() {
                log.push_str(&format!("  FOUND in resources! {:?}\n", server_path));
                let _ = fs::write(&log_file, &log);
                start_server_at_path(&server_path);
                return;
            }
        }
        
        // Go up one level
        if let Some(parent) = current.parent() {
            current = parent.to_path_buf();
        } else {
            break;
        }
    }
    
    log.push_str("Server not found! Creating embedded server...\n");
    let _ = fs::write(&log_file, &log);
    
    // If we can't find the server, create one
    create_and_start_embedded_server();
}

fn start_server_at_path(server_path: &Path) {
    info!("Starting server at: {:?}", server_path);
    
    let node_commands = vec!["node.exe", "node"];
    let working_dir = server_path.parent().unwrap_or(Path::new("."));
    
    for node_cmd in node_commands {
        let result = Command::new(node_cmd)
            .arg(server_path)
            .current_dir(working_dir)
            .spawn();
        
        match result {
            Ok(mut child) => {
                info!("SERVER STARTED! PID: {:?}", child.id());
                
                // Write success file
                let success_file = std::env::temp_dir().join("yurucode-server-running.txt");
                let _ = fs::write(
                    success_file,
                    format!("Server running\nPID: {:?}\nPath: {:?}", child.id(), server_path)
                );
                
                // Keep the server running
                std::thread::spawn(move || {
                    let _ = child.wait();
                });
                
                return;
            }
            Err(e) => {
                error!("Failed to start with {}: {}", node_cmd, e);
            }
        }
    }
}

fn create_and_start_embedded_server() {
    info!("Creating embedded server...");
    
    let temp_dir = std::env::temp_dir().join("yurucode-embedded");
    let _ = fs::create_dir_all(&temp_dir);
    
    // Write the server code
    let server_code = include_str!("../../resources/server-simple.cjs");
    let server_path = temp_dir.join("server.cjs");
    
    if let Err(e) = fs::write(&server_path, server_code) {
        error!("Failed to write embedded server: {}", e);
        // Try with a minimal server instead
        create_minimal_server();
        return;
    }
    
    // Install dependencies
    let package_json = r#"{
        "name": "yurucode-server",
        "dependencies": {
            "express": "^5.1.0",
            "cors": "^2.8.5",
            "socket.io": "^4.8.1"
        }
    }"#;
    
    let _ = fs::write(temp_dir.join("package.json"), package_json);
    
    // Run npm install
    let _ = Command::new("npm")
        .args(&["install", "--production", "--silent"])
        .current_dir(&temp_dir)
        .output();
    
    start_server_at_path(&server_path);
}

fn create_minimal_server() {
    let temp_dir = std::env::temp_dir().join("yurucode-minimal");
    let _ = fs::create_dir_all(&temp_dir);
    
    // Ultra minimal server that just proxies to claude
    let minimal = r#"
const net = require('net');
const { spawn } = require('child_process');

// Create a simple TCP server on port 3001
const server = net.createServer((socket) => {
    console.log('Client connected');
    
    const claude = spawn('claude', ['--output-format', 'stream-json']);
    
    claude.stdout.pipe(socket);
    socket.pipe(claude.stdin);
    
    claude.on('exit', () => socket.end());
    socket.on('end', () => claude.kill());
});

server.listen(3001, () => {
    console.log('Minimal proxy server on port 3001');
});
"#;
    
    let server_path = temp_dir.join("minimal.js");
    let _ = fs::write(&server_path, minimal);
    
    // Try to run it
    let _ = Command::new("node")
        .arg(&server_path)
        .current_dir(&temp_dir)
        .spawn();
}