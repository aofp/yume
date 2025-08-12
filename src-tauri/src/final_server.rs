use std::process::Command;
use std::fs;
use std::path::PathBuf;
use tracing::{info, error};

// EMBED THE ENTIRE SERVER IN THE BINARY!
const EMBEDDED_SERVER: &str = r#"
const express = require('express');
const { Server } = require('socket.io');
const http = require('http');
const { spawn } = require('child_process');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    transports: ['websocket', 'polling']
});

const activeProcesses = new Map();
const sessions = new Map();

app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'yurucode-claude' });
});

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    socket.on('sendMessage', (data) => {
        const { message, sessionId, workingDirectory, resumeSession } = data;
        console.log(`[${sessionId}] Message:`, message?.substring(0, 50));
        
        // Kill existing process
        if (activeProcesses.has(sessionId)) {
            activeProcesses.get(sessionId).kill();
            activeProcesses.delete(sessionId);
        }
        
        // Spawn Claude
        const args = ['--output-format', 'stream-json'];
        if (resumeSession) args.push('--resume');
        
        const claude = spawn('claude', args, {
            cwd: workingDirectory || process.cwd(),
            shell: true
        });
        
        activeProcesses.set(sessionId, claude);
        
        // Handle output
        claude.stdout.on('data', (chunk) => {
            const lines = chunk.toString().split('\n');
            for (const line of lines) {
                if (line.trim()) {
                    try {
                        const json = JSON.parse(line);
                        socket.emit('claudeResponse', json);
                    } catch (e) {
                        // Not JSON
                    }
                }
            }
        });
        
        claude.stderr.on('data', (data) => {
            socket.emit('claudeError', { error: data.toString() });
        });
        
        claude.on('close', (code) => {
            activeProcesses.delete(sessionId);
            socket.emit('claudeComplete', { code });
        });
        
        // Send message
        claude.stdin.write(message + '\n');
        claude.stdin.end();
    });
    
    socket.on('interruptSession', (sessionId) => {
        if (activeProcesses.has(sessionId)) {
            activeProcesses.get(sessionId).kill('SIGINT');
            activeProcesses.delete(sessionId);
            socket.emit('claudeResponse', {
                type: 'message',
                role: 'system',
                content: 'Task interrupted by user.',
                interrupted: true
            });
        }
    });
    
    socket.on('clearSession', (sessionId) => {
        if (activeProcesses.has(sessionId)) {
            activeProcesses.get(sessionId).kill();
            activeProcesses.delete(sessionId);
        }
        sessions.delete(sessionId);
    });
    
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

httpServer.listen(3001, () => {
    console.log('EMBEDDED SERVER RUNNING ON PORT 3001');
});
"#;

pub fn start_final_server() {
    info!("Starting FINAL embedded server solution...");
    
    std::thread::spawn(|| {
        // Create temp directory for our server
        let temp_base = std::env::temp_dir();
        let server_dir = temp_base.join("yurucode-runtime");
        
        // Clean and recreate
        let _ = fs::remove_dir_all(&server_dir);
        if let Err(e) = fs::create_dir_all(&server_dir) {
            error!("Failed to create server dir: {}", e);
            return;
        }
        
        // Write the embedded server
        let server_path = server_dir.join("server.js");
        if let Err(e) = fs::write(&server_path, EMBEDDED_SERVER) {
            error!("Failed to write server: {}", e);
            return;
        }
        
        info!("Server written to: {:?}", server_path);
        
        // Write package.json
        let package_json = r#"{
            "name": "yurucode-runtime",
            "private": true,
            "dependencies": {
                "express": "^5.1.0",
                "cors": "^2.8.5",
                "socket.io": "^4.8.1"
            }
        }"#;
        
        let _ = fs::write(server_dir.join("package.json"), package_json);
        
        // Check if node_modules exists, if not install
        let node_modules = server_dir.join("node_modules");
        if !node_modules.exists() {
            info!("Installing dependencies...");
            let output = Command::new("npm")
                .args(&["install", "--production", "--silent"])
                .current_dir(&server_dir)
                .output();
            
            match output {
                Ok(out) => {
                    if !out.status.success() {
                        error!("npm install failed: {}", String::from_utf8_lossy(&out.stderr));
                    } else {
                        info!("Dependencies installed");
                    }
                }
                Err(e) => error!("Failed to run npm install: {}", e)
            }
        }
        
        // Now start the server
        let node_commands = vec!["node.exe", "node"];
        
        for node_cmd in node_commands {
            info!("Trying to start with: {}", node_cmd);
            
            let result = Command::new(node_cmd)
                .arg(&server_path)
                .current_dir(&server_dir)
                .spawn();
            
            match result {
                Ok(mut child) => {
                    info!("✅ SERVER STARTED SUCCESSFULLY! PID: {}", child.id());
                    
                    // Write success marker
                    let success_path = temp_base.join("yurucode-server-success.txt");
                    let _ = fs::write(
                        success_path,
                        format!("Server running!\nPID: {}\nPath: {:?}", child.id(), server_path)
                    );
                    
                    // Keep it running
                    let _ = child.wait();
                    return;
                }
                Err(e) => {
                    error!("Failed with {}: {}", node_cmd, e);
                }
            }
        }
        
        error!("❌ FAILED TO START SERVER WITH ANY METHOD");
    });
    
    // Give it time to start
    std::thread::sleep(std::time::Duration::from_secs(3));
}