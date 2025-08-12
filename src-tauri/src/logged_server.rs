use std::process::{Command, Child};
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tracing::info;

// Global handle to the server process
static SERVER_PROCESS: Mutex<Option<Arc<Mutex<Child>>>> = Mutex::new(None);

// EMBED THE ENTIRE SERVER IN THE BINARY WITH LOGGING!
const EMBEDDED_SERVER: &str = r#"
const fs = require('fs');
const path = require('path');

// CREATE LOG FILE - Write to yurucode/logs directory
const logFile = 'C:\\\\Users\\\\muuko\\\\Desktop\\\\yurucode\\\\logs\\\\yurucode-server.log';
function log(msg) {
    const timestamp = new Date().toISOString();
    const logMsg = `[${timestamp}] ${msg}\n`;
    console.log(msg);
    fs.appendFileSync(logFile, logMsg);
}

log('=================================');
log('YURUCODE SERVER STARTING');
log('=================================');
log('Node version: ' + process.version);
log('Current directory: ' + process.cwd());
log('Script location: ' + __filename);
log('Temp directory: ' + (process.env.TEMP || '/tmp'));

// TRY TO LOAD DEPENDENCIES
let express, cors, io, http, spawn;

try {
    log('Loading express...');
    express = require('express');
    log('✓ Express loaded');
} catch (e) {
    log('✗ Failed to load express: ' + e.message);
    log('Installing dependencies...');
    
    // Try to install
    const { execSync } = require('child_process');
    try {
        execSync('npm install express cors socket.io --production', {
            cwd: __dirname,
            stdio: 'inherit'
        });
        express = require('express');
        log('✓ Dependencies installed');
    } catch (installError) {
        log('✗ Failed to install: ' + installError.message);
        process.exit(1);
    }
}

try {
    cors = require('cors');
    const { Server } = require('socket.io');
    io = Server;
    http = require('http');
    spawn = require('child_process').spawn;
    log('✓ All modules loaded');
} catch (e) {
    log('✗ Failed to load modules: ' + e.message);
    process.exit(1);
}

// CREATE SERVER
const app = express();
app.use(cors());
app.use(express.json());

const httpServer = http.createServer(app);
const socketServer = new io(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    transports: ['websocket', 'polling']
});

const activeProcesses = new Map();
const sessionDirs = new Map();
const sessionTitles = new Map(); // Track if we've generated title for each session
const lastAssistantMessageIds = new Map(); // Track last assistant message ID for streaming state

// Helper function to generate title with Claude Sonnet
async function generateTitle(sessionId, userMessage, socket) {
  try {
    log(`🏷️ Generating title for session ${sessionId}`);
    log(`🏷️ Message preview: "${userMessage.substring(0, 100)}..."`);
    
    // Spawn a separate claude process just for title generation
    const titleArgs = [
      '--output-format', 'json',
      '--model', 'claude-3-5-sonnet-20241022',
      '--print'  // Non-interactive mode
    ];
    
    const titlePrompt = `user message: "${userMessage.substring(0, 200)}"
task: reply with ONLY 1-3 words describing what user wants. lowercase only. no punctuation. be extremely concise. examples: "echo command", "file search", "debug issue"`;
    
    log(`🏷️ Title prompt: "${titlePrompt}"`);
    
    // Use WSL on Windows for title generation
    const { spawn } = require('child_process');
    const escapedArgs = titleArgs.map(arg => {
      if (arg.includes(' ') || arg.includes('\n') || arg.includes('"') || arg.includes("'")) {
        return "'" + arg.replace(/'/g, "'\\''") + "'";
      }
      return arg;
    }).join(' ');
    
    const wslArgs = ['-e', 'bash', '-c', 
      `if command -v claude &> /dev/null; then claude ${escapedArgs}; elif [ -x ~/.claude/local/claude ]; then ~/.claude/local/claude ${escapedArgs}; elif [ -x ~/.local/bin/claude ]; then ~/.local/bin/claude ${escapedArgs}; else echo "Claude CLI not found" >&2 && exit 127; fi`
    ];
    
    const child = spawn('wsl.exe', wslArgs, {
      cwd: process.cwd(),
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let output = '';
    let errorOutput = '';
    
    child.stdout.on('data', (data) => {
      output += data.toString();
      log(`🏷️ Title generation stdout: ${data.toString()}`);
    });
    
    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    // Send the prompt
    child.stdin.write(titlePrompt);
    child.stdin.end();
    
    child.on('close', (code) => {
      log(`🏷️ Title generation process exited with code ${code}`);
      
      if (code === 0 && output) {
        try {
          // Parse the JSON response - Claude CLI returns 'result' not 'content'
          const response = JSON.parse(output);
          if (response && response.result) {
            const title = response.result.trim().toLowerCase();
            if (title && title.length > 3 && title.length < 50) {
              log(`🏷️ Generated title: "${title}"`);
              socket.emit(`title:${sessionId}`, { title });
            }
          } else if (response && response.content) {
            // Fallback for different response format
            const title = response.content.trim().toLowerCase();
            if (title && title.length > 3 && title.length < 50) {
              log(`🏷️ Generated title: "${title}"`);
              socket.emit(`title:${sessionId}`, { title });
            }
          }
        } catch (e) {
          log(`🏷️ Failed to parse title response: ${e.message}`);
        }
      } else {
        log(`🏷️ Title generation failed: ${errorOutput}`);
      }
    });
    
    // Timeout after 5 seconds
    setTimeout(() => {
      child.kill();
    }, 5000);
    
  } catch (error) {
    log(`🏷️ Error generating title: ${error.message}`);
  }
}

// HEALTH ENDPOINT
app.get('/health', (req, res) => {
    log('Health check requested');
    res.json({ status: 'ok', service: 'yurucode-claude' });
});

// SOCKET HANDLING
socketServer.on('connection', (socket) => {
    log('Client connected: ' + socket.id);
    
    // Log ALL socket events
    socket.onAny((event, ...args) => {
        log(`Socket event received: ${event}`);
        log(`Event data: ${JSON.stringify(args).substring(0, 200)}`);
    });
    
    // Handle createSession event with proper callback
    socket.on('createSession', (data, callback) => {
        log('createSession event received!');
        log('Session data: ' + JSON.stringify(data).substring(0, 500));
        
        // Extract session info - use the name field properly
        const sessionName = data.name || 'new session';
        const sessionId = data.sessionId || sessionName.replace(/\s+/g, '-');
        const workingDirectory = data.workingDirectory || 'C:\\\\Users\\\\muuko\\\\Desktop\\\\yurucode';
        
        // Store the working directory for this session
        sessionDirs.set(sessionId, workingDirectory);
        log(`Stored working directory for session ${sessionId}: ${workingDirectory}`);
        
        // Send proper callback response that the client expects
        if (callback) {
            const response = {
                success: true,
                sessionId: sessionId,
                workingDirectory: workingDirectory,
                messages: []
            };
            log('Sending createSession callback response: ' + JSON.stringify(response));
            callback(response);
        }
    });
    
    // Handle sendMessage event with callback
    socket.on('sendMessage', (data, callback) => {
        log('sendMessage event received!');
        log('Message data: ' + JSON.stringify(data).substring(0, 500));
        
        const { content, sessionId, model, workingDirectory } = data;
        const messageContent = content || data.message;
        
        // Generate title on first message using Claude
        if (!sessionTitles.has(sessionId) && messageContent && messageContent.length > 5) {
            sessionTitles.set(sessionId, true);
            // Extract text content only (no attachments)
            let textContent = messageContent;
            try {
                const parsed = JSON.parse(messageContent);
                if (parsed.messages && parsed.messages[0]) {
                    textContent = parsed.messages[0].content;
                }
            } catch (e) {
                // messageContent is already plain text
            }
            
            // Only generate title if we have actual text content
            if (textContent && textContent.trim().length > 5) {
                log(`🏷️ Calling generateTitle for session ${sessionId}`);
                generateTitle(sessionId, textContent, socket);
            } else {
                log(`🏷️ Skipping title generation - text too short: "${textContent}"`);
            }
        }
        
        // Use workingDirectory from data, or from stored session, or from createSession
        const sessionDir = workingDirectory || sessionDirs.get(sessionId) || 'C:\\\\Users\\\\muuko\\\\Desktop\\\\yurucode';
        
        log(`[${sessionId}] Message content: ${messageContent?.substring(0, 100)}...`);
        log(`[${sessionId}] Model: ${model}`);
        log(`[${sessionId}] Using working directory: ${sessionDir}`);
        
        // Send acknowledgment callback immediately
        if (callback) {
            log('Sending sendMessage callback response');
            callback({ success: true });
        }
        
        // Kill existing process if any
        if (activeProcesses.has(sessionId)) {
            log(`[${sessionId}] Killing existing process`);
            activeProcesses.get(sessionId).kill();
            activeProcesses.delete(sessionId);
        }
        
        // Build claude command args
        const args = ['--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions'];
        if (model) {
            args.push('--model', model);
        }
        
        log(`[${sessionId}] Spawning claude with args: ${args.join(' ')}`);
        log(`[${sessionId}] Spawn directory: ${sessionDir}`);
        
        try {
            // On Windows, use WSL to run claude
            const isWindows = process.platform === 'win32';
            let command, commandArgs, claude;
            
            if (isWindows) {
                // Convert Windows path to WSL path
                // First replace backslashes with forward slashes, then convert drive letter
                const wslPath = sessionDir
                    .replace(/\\/g, '/')  // Replace single backslashes with forward slashes
                    .replace(/^([A-Z]):/i, (match, drive) => '/mnt/' + drive.toLowerCase());
                log(`[${sessionId}] Converting path for WSL: ${sessionDir} -> ${wslPath}`);
                
                // Use wsl.exe to run claude in WSL
                command = 'wsl.exe';
                commandArgs = ['-e', 'claude', ...args];  // -e to execute command
                
                log(`[${sessionId}] Using WSL to spawn claude: wsl.exe ${commandArgs.join(' ')}`);
                log(`[${sessionId}] WSL working directory: cd "${wslPath}" && claude ${args.join(' ')}`);
                
                // Build WSL command that tries multiple claude locations (same as server-claude-direct.cjs)
                const escapedArgs = args.map(arg => {
                    if (arg.includes(' ') || arg.includes('\\n') || arg.includes('"') || arg.includes("'")) {
                        return "'" + arg.replace(/'/g, "'\\\\''") + "'";
                    }
                    return arg;
                }).join(' ');
                
                // Try multiple locations: PATH, ~/.claude/local/claude, ~/.local/bin/claude
                const wslCommand = `cd "${wslPath}" && (if command -v claude &> /dev/null; then claude ${escapedArgs}; elif [ -x ~/.claude/local/claude ]; then ~/.claude/local/claude ${escapedArgs}; elif [ -x ~/.local/bin/claude ]; then ~/.local/bin/claude ${escapedArgs}; else echo "Claude CLI not found" >&2 && exit 127; fi)`;
                
                log(`[${sessionId}] WSL command: ${wslCommand}`);
                
                const wslArgs = ['-e', 'bash', '-c', wslCommand];
                
                claude = spawn('wsl.exe', wslArgs, {
                    cwd: sessionDir,
                    shell: false,  // Don't use shell with wsl.exe
                    env: { ...process.env }
                });
            } else {
                // On non-Windows, run claude directly
                command = 'claude';
                commandArgs = args;
                
                claude = spawn(command, commandArgs, {
                    cwd: sessionDir,
                    shell: true,
                    env: { ...process.env }
                });
            }
            
            log(`[${sessionId}] Claude spawned with PID: ${claude.pid}`);
            activeProcesses.set(sessionId, claude);
            
            // Handle stdout (streaming JSON responses)
            claude.stdout.on('data', (chunk) => {
                log(`[${sessionId}] Claude stdout received: ${chunk.toString().substring(0, 200)}`);
                const lines = chunk.toString().split('\n');
                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            const json = JSON.parse(line);
                            
                            // Track assistant messages for streaming state
                            if (json.type === 'assistant' && json.message?.content) {
                                const messageId = `assistant-${sessionId}-${Date.now()}-${Math.random()}`;
                                lastAssistantMessageIds.set(sessionId, messageId);
                                json.id = messageId;
                                json.streaming = true;
                            }
                            
                            // Clear streaming state when we get a result
                            if (json.type === 'result') {
                                const lastAssistantId = lastAssistantMessageIds.get(sessionId);
                                if (lastAssistantId) {
                                    // First, send update to mark assistant message as done streaming
                                    socket.emit(`message:${sessionId}`, {
                                        type: 'assistant',
                                        id: lastAssistantId,
                                        streaming: false,
                                        timestamp: Date.now()
                                    });
                                    lastAssistantMessageIds.delete(sessionId);
                                }
                                json.streaming = false;
                            }
                            
                            // Emit on the session-specific channel the client expects
                            const channel = `message:${sessionId}`;
                            log(`[${sessionId}] Emitting on channel: ${channel}`);
                            socket.emit(channel, json);
                        } catch (e) {
                            log(`[${sessionId}] Non-JSON output: ${line}`);
                        }
                    }
                }
            });
            
            // Handle stderr
            claude.stderr.on('data', (data) => {
                const errorMsg = data.toString();
                log(`[${sessionId}] Claude stderr: ${errorMsg}`);
                // Also emit errors on the session channel
                socket.emit(`message:${sessionId}`, {
                    type: 'error',
                    error: errorMsg
                });
            });
            
            // Handle spawn errors
            claude.on('error', (err) => {
                log(`[${sessionId}] Claude spawn error: ${err.message}`);
                socket.emit(`message:${sessionId}`, {
                    type: 'error',
                    error: 'Failed to spawn Claude: ' + err.message
                });
            });
            
            // Handle process exit
            claude.on('close', (code) => {
                log(`[${sessionId}] Claude exited with code: ${code}`);
                activeProcesses.delete(sessionId);
                
                // Clear any remaining streaming state
                const lastAssistantId = lastAssistantMessageIds.get(sessionId);
                if (lastAssistantId) {
                    socket.emit(`message:${sessionId}`, {
                        type: 'assistant',
                        id: lastAssistantId,
                        streaming: false,
                        timestamp: Date.now()
                    });
                    lastAssistantMessageIds.delete(sessionId);
                } else if (code !== 0) {
                    // If no assistant message was created and exit code is non-zero, send error
                    socket.emit(`message:${sessionId}`, {
                        type: 'error',
                        error: `Claude process exited with code ${code} without producing output`
                    });
                }
                
                // Send completion message
                socket.emit(`message:${sessionId}`, {
                    type: 'complete',
                    code: code
                });
            });
            
            // Send the message to Claude
            if (messageContent) {
                log(`[${sessionId}] Writing message to Claude stdin`);
                claude.stdin.write(messageContent + '\n');
                claude.stdin.end();
            } else {
                log(`[${sessionId}] ERROR: No message content to send!`);
            }
            
        } catch (err) {
            log(`[${sessionId}] Failed to spawn claude: ${err.message}`);
            socket.emit(`message:${sessionId}`, {
                type: 'error',
                error: 'Failed to spawn Claude: ' + err.message
            });
        }
    });
    
    // Handle interrupt event
    socket.on('interrupt', (data, callback) => {
        const sessionId = data.sessionId || data;
        log(`[${sessionId}] Interrupt requested`);
        
        if (activeProcesses.has(sessionId)) {
            activeProcesses.get(sessionId).kill('SIGINT');
            activeProcesses.delete(sessionId);
            
            // Clear streaming state
            const lastAssistantId = lastAssistantMessageIds.get(sessionId);
            if (lastAssistantId) {
                socket.emit(`message:${sessionId}`, {
                    type: 'assistant',
                    id: lastAssistantId,
                    streaming: false,
                    timestamp: Date.now()
                });
                lastAssistantMessageIds.delete(sessionId);
            }
            
            socket.emit(`message:${sessionId}`, {
                type: 'message',
                role: 'system',
                content: 'Task interrupted by user.',
                interrupted: true
            });
        }
        
        if (callback) {
            callback({ success: true });
        }
    });
    
    // Handle clear session
    socket.on('clearSession', (data, callback) => {
        const sessionId = data.sessionId || data;
        log(`[${sessionId}] Clear session requested`);
        
        // Kill any running process
        if (activeProcesses.has(sessionId)) {
            activeProcesses.get(sessionId).kill();
            activeProcesses.delete(sessionId);
        }
        
        // Clear streaming state
        lastAssistantMessageIds.delete(sessionId);
        
        if (callback) {
            callback({ success: true });
        }
    });
    
    // Handle other session management events
    socket.on('getSessionHistory', (data, callback) => {
        log('getSessionHistory requested');
        if (callback) {
            callback({ success: true, messages: [], workingDirectory: process.cwd() });
        }
    });
    
    socket.on('listSessions', (callback) => {
        log('listSessions requested');
        if (callback) {
            callback({ success: true, sessions: [] });
        }
    });
    
    socket.on('deleteSession', (data, callback) => {
        log('deleteSession requested');
        if (callback) {
            callback({ success: true });
        }
    });
    
    socket.on('setWorkingDirectory', (data, callback) => {
        log('setWorkingDirectory requested: ' + data.directory);
        if (callback) {
            callback({ success: true });
        }
    });
    
    socket.on('disconnect', () => {
        log('Client disconnected: ' + socket.id);
        
        // Clean up any processes for this client
        // Note: We'd need to track which processes belong to which socket
    });
});

// START SERVER
const PORT = 3001;
httpServer.listen(PORT, '0.0.0.0', () => {
    log('=================================');
    log(`✅ SERVER RUNNING ON PORT ${PORT}`);
    log('=================================');
    log('Check logs at: ' + logFile);
});

httpServer.on('error', (err) => {
    log('❌ Server error: ' + err.message);
    if (err.code === 'EADDRINUSE') {
        log(`Port ${PORT} is already in use!`);
    }
});
"#;

pub fn stop_logged_server() {
    info!("Stopping logged server...");
    
    // Try to stop our specific server process first
    if let Ok(mut process_guard) = SERVER_PROCESS.try_lock() {
        if let Some(process_arc) = process_guard.take() {
            if let Ok(mut process) = process_arc.try_lock() {
                let pid = process.id();
                info!("Killing server process with PID: {:?}", pid);
                
                // Kill the process using the Child's kill method
                #[cfg(target_os = "windows")]
                {
                    use std::os::windows::process::CommandExt;
                    const CREATE_NO_WINDOW: u32 = 0x08000000;
                    
                    // Kill the process directly first
                    let _ = process.kill();
                    
                    // Force kill with taskkill - don't wait
                    let _ = Command::new("taskkill")
                        .args(&["/F", "/T", "/PID", &pid.to_string()])
                        .creation_flags(CREATE_NO_WINDOW)
                        .spawn(); // Don't wait
                    
                    // Also kill all node.exe processes - don't wait
                    let _ = Command::new("taskkill")
                        .args(&["/F", "/IM", "node.exe"])
                        .creation_flags(CREATE_NO_WINDOW)
                        .spawn(); // Don't wait
                }
                
                #[cfg(not(target_os = "windows"))]
                {
                    let _ = process.kill();
                }
                
                info!("Server stop command issued");
            }
        }
    }
    
    // Don't wait - let the OS clean up after we exit
}

pub fn start_logged_server() {
    info!("Starting LOGGED server with full debugging...");
    
    // Write logs to the yurucode directory (5 levels up from exe)
    let log_dir = if let Ok(exe_path) = std::env::current_exe() {
        exe_path
            .parent() // release
            .and_then(|p| p.parent()) // x86_64-pc-windows-msvc
            .and_then(|p| p.parent()) // target
            .and_then(|p| p.parent()) // src-tauri
            .and_then(|p| p.parent()) // yurucode
            .map(|p| p.join("logs"))
            .unwrap_or_else(|| PathBuf::from("C:\\Users\\muuko\\Desktop\\yurucode\\logs"))
    } else {
        PathBuf::from("C:\\Users\\muuko\\Desktop\\yurucode\\logs")
    };
    
    // Create logs directory
    let _ = fs::create_dir_all(&log_dir);
    
    // First, write a Rust log
    let rust_log_path = log_dir.join("yurucode-rust.log");
    let mut rust_log = String::new();
    rust_log.push_str("=== RUST SERVER STARTUP LOG ===\n");
    rust_log.push_str(&format!("Time: {:?}\n", std::time::SystemTime::now()));
    rust_log.push_str(&format!("Exe path: {:?}\n", std::env::current_exe()));
    rust_log.push_str(&format!("Current dir: {:?}\n", std::env::current_dir()));
    rust_log.push_str(&format!("Temp dir: {:?}\n", std::env::temp_dir()));
    
    std::thread::spawn(move || {
        // Create server directory
        let server_dir = std::env::temp_dir().join("yurucode-logged");
        rust_log.push_str(&format!("Server dir: {:?}\n", server_dir));
        
        // Clean and create
        let _ = fs::remove_dir_all(&server_dir);
        if let Err(e) = fs::create_dir_all(&server_dir) {
            rust_log.push_str(&format!("ERROR: Failed to create dir: {}\n", e));
            let _ = fs::write(&rust_log_path, &rust_log);
            return;
        }
        
        // Write server
        let server_path = server_dir.join("server.js");
        if let Err(e) = fs::write(&server_path, EMBEDDED_SERVER) {
            rust_log.push_str(&format!("ERROR: Failed to write server: {}\n", e));
            let _ = fs::write(&rust_log_path, &rust_log);
            return;
        }
        rust_log.push_str(&format!("Server written to: {:?}\n", server_path));
        
        // Write package.json
        let package_json = r#"{
            "name": "yurucode-logged",
            "dependencies": {
                "express": "^5.1.0",
                "cors": "^2.8.5",
                "socket.io": "^4.8.1"
            }
        }"#;
        
        let _ = fs::write(server_dir.join("package.json"), package_json);
        
        // Try to find Node.js
        let node_commands = vec![
            "node.exe",
            "node",
            r"C:\Program Files\nodejs\node.exe",
            r"C:\Program Files (x86)\nodejs\node.exe",
        ];
        
        rust_log.push_str("Trying to start server...\n");
        
        for node_cmd in node_commands {
            rust_log.push_str(&format!("Trying: {}\n", node_cmd));
            
            let result = Command::new(node_cmd)
                .arg(&server_path)
                .current_dir(&server_dir)
                .spawn();
            
            match result {
                Ok(child) => {
                    let pid = child.id();
                    rust_log.push_str(&format!("✅ SUCCESS! Server started with PID: {}\n", pid));
                    rust_log.push_str(&format!("Command: {} {:?}\n", node_cmd, server_path));
                    let _ = fs::write(&rust_log_path, &rust_log);
                    
                    // Also write success file
                    let success_path = log_dir.join("yurucode-server-RUNNING.txt");
                    let _ = fs::write(
                        success_path,
                        format!("SERVER IS RUNNING!\nPID: {}\nPath: {:?}\nNode: {}", 
                                pid, server_path, node_cmd)
                    );
                    
                    // Store the process handle globally
                    let child_arc = Arc::new(Mutex::new(child));
                    if let Ok(mut process_guard) = SERVER_PROCESS.lock() {
                        *process_guard = Some(child_arc.clone());
                        info!("Server process stored globally with PID: {}", pid);
                    }
                    
                    // Keep it running in this thread
                    if let Ok(mut child_guard) = child_arc.lock() {
                        let _ = child_guard.wait();
                    }
                    return;
                }
                Err(e) => {
                    rust_log.push_str(&format!("  Failed: {}\n", e));
                }
            }
        }
        
        rust_log.push_str("❌ FAILED TO START SERVER WITH ANY METHOD\n");
        let _ = fs::write(&rust_log_path, &rust_log);
    });
    
    // Give it time to start
    std::thread::sleep(std::time::Duration::from_secs(3));
    
    info!("Check logs at:");
    info!("  - yurucode\\logs\\yurucode-rust.log (Rust startup)");
    info!("  - yurucode\\logs\\yurucode-server.log (Node.js server)");
    info!("  - yurucode\\logs\\yurucode-server-RUNNING.txt (If successful)");
}