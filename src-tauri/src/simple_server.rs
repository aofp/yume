use std::process::{Command, Stdio};
use std::thread;
use std::time::Duration;
use tracing::{info, error};

pub fn start_server_simple() {
    info!("Starting server using simple approach...");
    
    thread::spawn(|| {
        // Just run the server directly - no fancy stuff
        // From x86_64-pc-windows-msvc\release, we need to go up 5 levels
        let server_paths = vec![
            "server-claude-direct.cjs",
            "../../../../../server-claude-direct.cjs",  // This should work!
            "../../../../server-claude-direct.cjs",
            "../../../server-claude-direct.cjs",
            "../../server-claude-direct.cjs",
            "../server-claude-direct.cjs",
            "src-tauri/resources/server-simple.cjs",
            "resources/server-simple.cjs",
        ];
        
        let node_commands = vec!["node", "node.exe"];
        
        for node_cmd in &node_commands {
            for server_path in &server_paths {
                info!("Trying: {} {}", node_cmd, server_path);
                
                let result = Command::new(node_cmd)
                    .arg(server_path)
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped())
                    .spawn();
                
                match result {
                    Ok(mut child) => {
                        info!("SERVER STARTED! PID: {:?}, Command: {} {}", child.id(), node_cmd, server_path);
                        
                        // Write a success marker
                        let _ = std::fs::write(
                            std::env::temp_dir().join("yurucode-server-started.txt"),
                            format!("Server started with PID: {:?}", child.id())
                        );
                        
                        // Keep it running
                        let _ = child.wait();
                        return;
                    }
                    Err(e) => {
                        error!("Failed with {} {}: {}", node_cmd, server_path, e);
                    }
                }
            }
        }
        
        error!("FAILED TO START SERVER - TRIED ALL OPTIONS");
        
        // As last resort, try to start from temp with a minimal server
        start_minimal_server();
    });
    
    // Give it time to start
    thread::sleep(Duration::from_secs(3));
}

fn start_minimal_server() {
    info!("Starting minimal fallback server...");
    
    let temp_dir = std::env::temp_dir().join("yurucode-fallback");
    let _ = std::fs::create_dir_all(&temp_dir);
    
    // Write a minimal server that just accepts connections
    let minimal_server = r#"
const express = require('express');
const { Server } = require('socket.io');
const http = require('http');
const { spawn } = require('child_process');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
    cors: { origin: "*" }
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'yurucode-claude' });
});

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    socket.on('sendMessage', (data) => {
        const { message, sessionId } = data;
        console.log('Message received:', message);
        
        // Spawn claude
        const claude = spawn('claude', ['--output-format', 'stream-json'], {
            cwd: data.workingDirectory || process.cwd()
        });
        
        claude.stdout.on('data', (chunk) => {
            const lines = chunk.toString().split('\n');
            for (const line of lines) {
                if (line.trim()) {
                    try {
                        const json = JSON.parse(line);
                        socket.emit('claudeResponse', json);
                    } catch (e) {
                        console.log('Raw:', line);
                    }
                }
            }
        });
        
        claude.stderr.on('data', (data) => {
            socket.emit('claudeError', { error: data.toString() });
        });
        
        claude.on('close', (code) => {
            socket.emit('claudeComplete', { code });
        });
        
        claude.stdin.write(message + '\n');
        claude.stdin.end();
    });
    
    socket.on('interruptSession', () => {
        socket.emit('claudeResponse', {
            type: 'message',
            role: 'system',
            content: 'Task interrupted by user.'
        });
    });
});

httpServer.listen(3001, () => {
    console.log('Minimal server running on port 3001');
});
"#;
    
    let server_path = temp_dir.join("minimal-server.js");
    let _ = std::fs::write(&server_path, minimal_server);
    
    // Try to run it
    if let Ok(mut child) = Command::new("node")
        .arg(&server_path)
        .current_dir(&temp_dir)
        .spawn()
    {
        info!("Minimal server started with PID: {:?}", child.id());
        let _ = child.wait();
    }
}