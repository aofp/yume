use std::process::{Command, Child, Stdio};
use std::sync::{Arc, Mutex};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use tracing::info;

// SIMPLE FLAG TO CONTROL CONSOLE VISIBILITY AND DEVTOOLS
pub const YURUCODE_SHOW_CONSOLE: bool = false;  // SET TO TRUE TO SEE CONSOLE AND FORCE DEVTOOLS

// Global handle to the server process
static SERVER_PROCESS: Mutex<Option<Arc<Mutex<Child>>>> = Mutex::new(None);

// Get log file path
pub fn get_log_path() -> PathBuf {
    let log_dir = if cfg!(target_os = "macos") {
        dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("/tmp"))
            .join("Library")
            .join("Logs")
            .join("yurucode")
    } else if cfg!(target_os = "windows") {
        dirs::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("C:\\temp"))
            .join("yurucode")
            .join("logs")
    } else {
        dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("/tmp"))
            .join(".yurucode")
            .join("logs")
    };
    
    // Create log directory if it doesn't exist
    let _ = fs::create_dir_all(&log_dir);
    log_dir.join("server.log")
}

// Write to log file
fn write_log(message: &str) {
    if let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(get_log_path())
    {
        let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
        let _ = writeln!(file, "[{}] {}", timestamp, message);
    }
}

// Clear log file (called at server start)
fn clear_log() {
    if let Ok(mut file) = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(get_log_path())
    {
        let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
        let _ = writeln!(file, "=== yurucode server log started at {} ===", timestamp);
    }
}

// Get server logs (limited to last 800 lines)
pub fn get_server_logs() -> String {
    match fs::read_to_string(get_log_path()) {
        Ok(contents) => {
            let lines: Vec<&str> = contents.lines().collect();
            const MAX_LINES: usize = 800;
            
            if lines.len() > MAX_LINES {
                let start_index = lines.len() - MAX_LINES;
                let mut result = format!("... (showing last {} lines)\n", MAX_LINES);
                result.push_str(&lines[start_index..].join("\n"));
                result
            } else {
                contents
            }
        }
        Err(e) => format!("Failed to read logs: {}", e)
    }
}

// EMBEDDED SERVER - REQUIRES SOCKET.IO TO BE BUNDLED
const EMBEDDED_SERVER: &str = r#"
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

function log(msg) {
    console.log(`[SERVER] ${msg}`);
}

log('=================================');
log('YURUCODE SERVER STARTING');
log('=================================');
log('Node version: ' + process.version);
log('Current directory: ' + process.cwd());
log('NODE_PATH: ' + (process.env.NODE_PATH || 'not set'));

// Load Socket.IO - it must be available
let io;
try {
    const { Server } = require('socket.io');
    io = Server;
    log('✓ Socket.io loaded successfully');
} catch (e) {
    log('❌ FATAL: Socket.io not found!');
    log('Error: ' + e.message);
    log('Socket.IO is required for this app to function');
    
    // Keep the server running to show the error
    const errorServer = http.createServer((req, res) => {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Socket.IO not found. The app bundle is missing required dependencies.');
    });
    
    errorServer.listen(3001, () => {
        log('Error server running on port 3001');
    });
    
    return;
}

// SOCKET.IO SERVER
const server = http.createServer((req, res) => {
    // Add CORS headers for all requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
    } else {
        res.writeHead(404);
        res.end();
    }
});

const socketServer = new io(server, {
    cors: { origin: "*" },
    transports: ['websocket', 'polling']
});

const activeProcesses = new Map();
const lastAssistantMessageIds = new Map();
const sessions = new Map(); // Store session data including working directory

socketServer.on('connection', (socket) => {
    log('Client connected: ' + socket.id);
    
    // Log all events for debugging
    socket.onAny((eventName, ...args) => {
        log('Event received: ' + eventName);
    });
    
    socket.on('createSession', (data, callback) => {
        const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const workingDirectory = data.workingDirectory || data.workingDir || process.cwd();
        const model = data.model;
        
        // Store session data
        sessions.set(sessionId, {
            id: sessionId,
            workingDirectory: workingDirectory,
            model: model,
            messages: [],
            claudeSessionId: null,
            hasGeneratedTitle: false
        });
        
        log(`[${sessionId}] Session created - workingDir: ${workingDirectory}, model: ${model || 'default'}`);
        if (callback) callback({ 
            success: true, 
            sessionId,
            messages: [],
            workingDirectory 
        });
    });
    
    socket.on('resumeSession', (data, callback) => {
        const { sessionId, workingDir, model } = data;
        log(`[${sessionId}] Session resumed - workingDir: ${workingDir}, model: ${model || 'default'}`);
        if (callback) callback({ success: true, sessionId });
    });
    
    socket.on('sendMessage', (data, callback) => {
        const { sessionId, message, content, model } = data;
        const userMessage = message || content; // Handle both field names
        
        // Get session data
        const session = sessions.get(sessionId);
        if (!session) {
            log(`[${sessionId}] ERROR: Session not found`);
            if (callback) callback({ success: false, error: 'Session not found' });
            return;
        }
        
        // Use session's working directory
        let workingDir = session.workingDirectory;
        log(`[${sessionId}] Received sendMessage event`);
        log(`[${sessionId}] Message: ${userMessage ? userMessage.substring(0, 50) + '...' : 'EMPTY'}`);
        log(`[${sessionId}] Working dir: ${workingDir}`);
        
        if (!userMessage) {
            log(`[${sessionId}] ERROR: No message content received`);
            if (callback) callback({ success: false, error: 'No message content' });
            return;
        }
        
        // Kill existing process
        if (activeProcesses.has(sessionId)) {
            activeProcesses.get(sessionId).kill();
            activeProcesses.delete(sessionId);
        }
        
        // Build args for Claude - MUST include all critical flags
        const args = ['--print', '--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions'];
        
        // Add casual prompt for yurucode
        const casualPrompt = `CRITICAL: you are in yurucode ui. ALWAYS:
- use all lowercase (no capitals ever)
- be extremely concise
- never use formal language  
- no greetings/pleasantries
- straight to the point
- code/variables keep proper case
- one line answers preferred`;
        args.push('--append-system-prompt', casualPrompt);
        
        if (model) args.push('--model', model);
        
        let claude;
        
        // On Windows, use WSL to run Claude
        if (process.platform === 'win32') {
            log('Windows detected - using WSL to run claude');
            
            // Convert Windows path to WSL path
            if (workingDir.match(/^[A-Z]:\\/)) {
                const driveLetter = workingDir[0].toLowerCase();
                const pathWithoutDrive = workingDir.substring(2).replace(/\\/g, '/');
                const wslPath = `/mnt/${driveLetter}${pathWithoutDrive}`;
                log(`[${sessionId}] Converted Windows path to WSL: ${workingDir} -> ${wslPath}`);
                workingDir = wslPath;
            }
            
            // Build WSL command - escape args properly and include cd to working directory
            const escapedArgs = args.map(arg => {
                if (arg.includes(' ') || arg.includes('\n') || arg.includes('"') || arg.includes("'")) {
                    return "'" + arg.replace(/'/g, "'\\''") + "'";
                }
                return arg;
            }).join(' ');
            
            // Change to working directory in WSL before running claude
            const wslArgs = ['-e', 'bash', '-c', 
                `cd '${workingDir}' && (if command -v claude &> /dev/null; then claude ${escapedArgs}; elif [ -x ~/.claude/local/claude ]; then ~/.claude/local/claude ${escapedArgs}; elif [ -x ~/.local/bin/claude ]; then ~/.local/bin/claude ${escapedArgs}; else echo "Claude CLI not found in WSL" >&2 && exit 127; fi)`
            ];
            
            log('WSL command: wsl.exe ' + wslArgs.join(' '));
            
            claude = spawn('wsl.exe', wslArgs, {
                cwd: session.workingDirectory, // Use original Windows path for spawn
                stdio: ['pipe', 'pipe', 'pipe']
            });
        } else {
            // Unix/Mac - try to find Claude
            const claudePaths = [
                'claude',
                '/usr/local/bin/claude',
                path.join(process.env.HOME || '', '.local', 'bin', 'claude'),
                path.join(process.env.HOME || '', '.claude', 'local', 'claude')
            ];
            
            let CLAUDE_PATH = 'claude';
            for (const p of claudePaths) {
                try {
                    require('child_process').execSync(`"${p}" --version`, { stdio: 'ignore' });
                    CLAUDE_PATH = p;
                    log('Found Claude at: ' + p);
                    break;
                } catch (e) {}
            }
            
            claude = spawn(CLAUDE_PATH, args, {
                cwd: workingDir,
                shell: false
            });
        }
        
        activeProcesses.set(sessionId, claude);
        
        // Title generation is handled by the main server (server-claude-direct.cjs)
        // We don't generate titles here to avoid duplicates
        
        // Send user message with proper encoding
        const inputContent = userMessage.endsWith('\\n') ? userMessage : userMessage + '\\n';
        claude.stdin.write(inputContent, 'utf8', (err) => {
            if (err) {
                log(`[${sessionId}] Error writing to stdin: ${err}`);
                socket.emit(`message:${sessionId}`, {
                    type: 'system',
                    subtype: 'error',
                    message: `Failed to send prompt: ${err.message}`,
                    timestamp: Date.now()
                });
            } else {
                log(`[${sessionId}] Prompt sent to Claude`);
            }
            claude.stdin.end();
        });
        
        let buffer = '';
        let assistantMessageId = null;
        let messageCount = 0;
        
        claude.stdout.on('data', (data) => {
            const str = data.toString();
            log(`[${sessionId}] STDOUT received: ${str.length} bytes`);
            log(`[${sessionId}] Raw data preview: ${str.substring(0, 200).replace(/\\n/g, '\\\\n').replace(/\\r/g, '\\\\r')}...`);
            buffer += str;
            
            // Claude CLI with --print sends complete JSON objects without newlines
            // Try to parse complete JSON objects from the buffer
            let startIndex = 0;
            while (startIndex < buffer.length) {
                // Find a complete JSON object by looking for balanced braces
                let braceCount = 0;
                let inString = false;
                let escapeNext = false;
                let endIndex = -1;
                
                for (let i = startIndex; i < buffer.length; i++) {
                    const char = buffer[i];
                    
                    if (escapeNext) {
                        escapeNext = false;
                        continue;
                    }
                    
                    if (char === '\\\\') {
                        escapeNext = true;
                        continue;
                    }
                    
                    if (char === '"' && !escapeNext) {
                        inString = !inString;
                        continue;
                    }
                    
                    if (!inString) {
                        if (char === '{') braceCount++;
                        else if (char === '}') {
                            braceCount--;
                            if (braceCount === 0) {
                                endIndex = i + 1;
                                break;
                            }
                        }
                    }
                }
                
                if (endIndex === -1) {
                    // No complete JSON object found, keep remaining in buffer
                    buffer = buffer.substring(startIndex);
                    break;
                }
                
                // Extract and process the JSON object
                const jsonStr = buffer.substring(startIndex, endIndex);
                startIndex = endIndex;
                
                if (!jsonStr.trim()) continue;
                log(`[${sessionId}] Processing JSON: ${jsonStr.substring(0, 100)}...`);
                
                try {
                    const json = JSON.parse(jsonStr);
                    log(`[${sessionId}] Parsed JSON: ${JSON.stringify(json).substring(0, 200)}...`);
                    log(`[${sessionId}] Message type: ${json.type}`);
                    
                    // Handle stream-json format from Claude CLI
                    if (json.type === 'message_start' && json.message) {
                        assistantMessageId = json.message.id;
                        lastAssistantMessageIds.set(sessionId, assistantMessageId);
                        socket.emit(`message:${sessionId}`, {
                            type: 'assistant',
                            id: assistantMessageId,
                            streaming: true,
                            timestamp: Date.now()
                        });
                    } else if (json.type === 'content_block_start' && json.content_block?.type === 'tool_use') {
                        // Tool use starting in streaming format
                        log(`[${sessionId}] 🔧 STREAMING TOOL USE START: ${json.content_block.name}`);
                        socket.emit(`message:${sessionId}`, {
                            type: 'tool_use',
                            message: {
                                name: json.content_block.name,
                                input: {},  // Will be filled by deltas
                                id: json.content_block.id
                            },
                            timestamp: Date.now(),
                            id: `tool-${sessionId}-${Date.now()}-${json.index}`
                        });
                    } else if (json.type === 'content_block_delta') {
                        if (json.delta?.text) {
                            // Text delta
                            socket.emit(`message:${sessionId}`, {
                                type: 'assistant',
                                id: assistantMessageId,
                                text: json.delta.text,
                                streaming: true,
                                timestamp: Date.now()
                            });
                        } else if (json.delta?.partial_json) {
                            // Tool input delta - we could accumulate these but for now just log
                            log(`[${sessionId}] Tool input delta: ${json.delta.partial_json}`);
                        }
                    } else if (json.type === 'message_stop') {
                        socket.emit(`message:${sessionId}`, {
                            type: 'assistant',
                            id: assistantMessageId,
                            streaming: false,
                            timestamp: Date.now()
                        });
                        lastAssistantMessageIds.delete(sessionId);
                    } else if (json.type === 'user' && json.message?.content) {
                        // Handle user message with tool results
                        for (const block of json.message.content) {
                            if (block.type === 'tool_result') {
                                log(`[${sessionId}] 📊 TOOL RESULT FOUND for tool ${block.tool_use_id}`);
                                // Send tool result as separate message
                                socket.emit(`message:${sessionId}`, {
                                    type: 'tool_result',
                                    message: {
                                        content: block.content,
                                        tool_use_id: block.tool_use_id,
                                        is_error: block.is_error
                                    },
                                    timestamp: Date.now(),
                                    id: `tool-result-${sessionId}-${Date.now()}`
                                });
                            }
                        }
                    } else if (json.type === 'assistant' && json.message?.content) {
                        // Handle full assistant message (non-streaming format)
                        const messageId = `assistant-${sessionId}-${Date.now()}`;
                        lastAssistantMessageIds.set(sessionId, messageId);
                        
                        // Extract text content AND tool uses
                        let textContent = '';
                        const toolUses = [];
                        
                        for (const block of json.message.content) {
                            if (block.type === 'text') {
                                textContent += block.text;
                            } else if (block.type === 'tool_use') {
                                log(`[${sessionId}] 🔧 TOOL USE FOUND: ${block.name}`);
                                toolUses.push(block);
                                // Send tool use as separate message
                                socket.emit(`message:${sessionId}`, {
                                    type: 'tool_use',
                                    message: {
                                        name: block.name,
                                        input: block.input,
                                        id: block.id
                                    },
                                    timestamp: Date.now(),
                                    id: `tool-${sessionId}-${Date.now()}`
                                });
                            }
                        }
                        
                        // Send text content if any
                        if (textContent) {
                            socket.emit(`message:${sessionId}`, {
                                type: 'assistant',
                                message: { content: textContent },
                                streaming: true, // Keep streaming true - will be cleared by result message
                                id: messageId,
                                timestamp: Date.now()
                            });
                        }
                    } else if (json.type === 'result') {
                        log(`[${sessionId}] Result received: ${json.result}`);
                        // Clear streaming state
                        if (lastAssistantMessageIds.has(sessionId)) {
                            socket.emit(`message:${sessionId}`, {
                                type: 'assistant',
                                id: lastAssistantMessageIds.get(sessionId),
                                streaming: false,
                                timestamp: Date.now()
                            });
                            lastAssistantMessageIds.delete(sessionId);
                        }
                        // Send result message
                        socket.emit(`message:${sessionId}`, {
                            type: 'result',
                            ...json,
                            streaming: false,
                            id: `result-${sessionId}-${Date.now()}`
                        });
                    }
                    
                    // Always emit raw for debugging
                    socket.emit(`raw:${sessionId}`, json);
                    messageCount++;
                } catch (e) {
                    log(`[${sessionId}] Parse error: ${e.message} for JSON: ${jsonStr}`);
                }
            }
            
            // Clear buffer if all parsed
            if (startIndex >= buffer.length) {
                buffer = '';
            }
        });
        
        claude.stderr.on('data', (data) => {
            const error = data.toString();
            log(`[${sessionId}] Claude stderr: ${error}`);
            
            // Send error to UI
            socket.emit(`message:${sessionId}`, {
                type: 'system',
                subtype: 'error',
                message: error,
                timestamp: Date.now()
            });
        });
        
        claude.on('error', (err) => {
            log(`[${sessionId}] Process error: ${err}`);
            socket.emit(`message:${sessionId}`, {
                type: 'system',
                subtype: 'error',
                message: `Failed to run Claude: ${err.message}`,
                timestamp: Date.now()
            });
            activeProcesses.delete(sessionId);
        });
        
        claude.on('exit', (code) => {
            log(`[${sessionId}] Claude process exited with code ${code}`);
            log(`[${sessionId}] Total messages processed: ${messageCount}`);
            activeProcesses.delete(sessionId);
            
            // Clear any remaining streaming state
            if (lastAssistantMessageIds.has(sessionId)) {
                socket.emit(`message:${sessionId}`, {
                    type: 'assistant',
                    id: lastAssistantMessageIds.get(sessionId),
                    streaming: false,
                    timestamp: Date.now()
                });
                lastAssistantMessageIds.delete(sessionId);
            }
            
            // Send result message to ensure UI clears streaming
            socket.emit(`message:${sessionId}`, {
                type: 'result',
                id: `result-${sessionId}-${Date.now()}`,
                sessionId,
                streaming: false,
                timestamp: Date.now()
            });
        });
        
        if (callback) callback({ success: true });
    });
    
    socket.on('interrupt', (data, callback) => {
        const sessionId = data.sessionId || data;
        log(`[${sessionId}] Interrupt requested`);
        if (activeProcesses.has(sessionId)) {
            activeProcesses.get(sessionId).kill();
            activeProcesses.delete(sessionId);
        }
        if (lastAssistantMessageIds.has(sessionId)) {
            socket.emit(`message:${sessionId}`, {
                type: 'assistant',
                id: lastAssistantMessageIds.get(sessionId),
                streaming: false,
                timestamp: Date.now()
            });
            lastAssistantMessageIds.delete(sessionId);
        }
        if (callback) callback({ success: true });
    });
    
    socket.on('interruptSession', (data, callback) => {
        const sessionId = data.sessionId || data;
        log(`[${sessionId}] InterruptSession requested`);
        if (activeProcesses.has(sessionId)) {
            activeProcesses.get(sessionId).kill();
            activeProcesses.delete(sessionId);
        }
        if (lastAssistantMessageIds.has(sessionId)) {
            socket.emit(`message:${sessionId}`, {
                type: 'assistant',
                id: lastAssistantMessageIds.get(sessionId),
                streaming: false,
                timestamp: Date.now()
            });
            lastAssistantMessageIds.delete(sessionId);
        }
        if (callback) callback({ success: true });
    });
    
    socket.on('clearSession', (data, callback) => {
        const sessionId = data.sessionId || data;
        if (activeProcesses.has(sessionId)) {
            activeProcesses.get(sessionId).kill();
            activeProcesses.delete(sessionId);
        }
        lastAssistantMessageIds.delete(sessionId);
        if (callback) callback({ success: true });
    });
    
    socket.on('setWorkingDirectory', (data, callback) => {
        const { sessionId, directory } = data;
        const session = sessions.get(sessionId);
        if (session) {
            session.workingDirectory = directory;
            log(`[${sessionId}] Updated working directory: ${directory}`);
            if (callback) callback({ success: true });
        } else {
            log(`[${sessionId}] Session not found for setWorkingDirectory`);
            if (callback) callback({ success: false, error: 'Session not found' });
        }
    });
    
    socket.on('disconnect', () => {
        log('Client disconnected');
    });
});

server.listen(3001, '0.0.0.0', () => {
    log('✅ SOCKET.IO SERVER RUNNING ON PORT 3001');
});
"#;

pub fn stop_logged_server() {
    info!("Stopping server...");
    
    if let Ok(mut process_guard) = SERVER_PROCESS.try_lock() {
        if let Some(process_arc) = process_guard.take() {
            if let Ok(mut process) = process_arc.try_lock() {
                let _ = process.kill();
            }
        }
    }
    
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        
        let _ = Command::new("taskkill")
            .args(&["/F", "/IM", "node.exe"])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn();
    }
}

pub fn start_logged_server() {
    info!("Starting server for macOS");
    
    // On macOS, use the bundled server file directly
    #[cfg(target_os = "macos")]
    {
        start_macos_server();
        return;
    }
    
    // Original embedded server logic for other platforms
    #[cfg(not(target_os = "macos"))]
    {
        info!("Starting embedded server");
        
        // Create temp directory for server
        let server_dir = std::env::temp_dir().join("yurucode-server");
        let _ = fs::create_dir_all(&server_dir);
        
        // Write embedded server to temp
        let server_path = server_dir.join("server.js");
        if let Err(e) = fs::write(&server_path, EMBEDDED_SERVER) {
            info!("Failed to write server: {}", e);
            return;
        }
        
        // Determine where to find node_modules
        let node_path = if cfg!(debug_assertions) {
            // In development, find project root dynamically
            std::env::current_exe()
                .ok()
                .and_then(|p| p.parent()?.parent()?.parent()?.parent().map(|p| p.to_path_buf()))
                .map(|p| p.join("node_modules"))
        } else {
            // In production, look for bundled node_modules
            std::env::current_exe()
                .ok()
                .and_then(|p| p.parent().map(|p| p.to_path_buf()))
                .map(|p| p.join("resources").join("node_modules"))
        };
    
    // Try to start server with Node.js
    let node_paths = vec!["node", "node.exe"];
    
    for node_cmd in node_paths {
        info!("Trying: {}", node_cmd);
        
        let mut cmd = Command::new(node_cmd);
        cmd.arg(&server_path)
           .current_dir(&server_dir);
        
        // Set NODE_PATH if we found node_modules
        if let Some(ref modules_path) = node_path {
            info!("Setting NODE_PATH to: {:?}", modules_path);
            cmd.env("NODE_PATH", modules_path);
        }
        
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NEW_CONSOLE: u32 = 0x00000010;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            
            let flags = if YURUCODE_SHOW_CONSOLE {
                info!("Console VISIBLE");
                CREATE_NEW_CONSOLE
            } else {
                info!("Console HIDDEN");
                CREATE_NO_WINDOW
            };
            
            cmd.creation_flags(flags);
        }
        
        if YURUCODE_SHOW_CONSOLE {
            cmd.stdout(Stdio::inherit())
               .stderr(Stdio::inherit());
        }
        
        match cmd.spawn() {
            Ok(child) => {
                info!("✅ Server started with PID: {}", child.id());
                
                let child_arc = Arc::new(Mutex::new(child));
                if let Ok(mut process_guard) = SERVER_PROCESS.lock() {
                    *process_guard = Some(child_arc);
                }
                
                return;
            }
            Err(e) => {
                info!("Failed: {}", e);
            }
        }
    }
    
        info!("❌ Failed to start server");
    }
}

#[cfg(target_os = "macos")]
fn start_macos_server() {
    info!("Starting macOS server");
    clear_log(); // Clear logs from previous run
    write_log("=== Starting macOS server ===");
    
    // Get the executable path for debugging
    let exe_path = std::env::current_exe().unwrap_or_default();
    info!("Executable path: {:?}", exe_path);
    write_log(&format!("Executable path: {:?}", exe_path));
    
    // Find the server file
    let server_path = if cfg!(debug_assertions) {
        // In development, use project root
        info!("Development mode - looking for server in project root");
        write_log("Development mode - looking for server in project root");
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent()?.parent()?.parent()?.parent().map(|p| p.to_path_buf()))
            .map(|p| p.join("server-claude-macos.js"))
    } else {
        // In production, try both .js and .cjs versions
        info!("Production mode - looking for server in .app bundle");
        write_log("Production mode - looking for server in .app bundle");
        
        let result = std::env::current_exe()
            .ok()
            .and_then(|p| {
                write_log(&format!("Exe: {:?}", p));
                let macos_dir = p.parent()?;
                write_log(&format!("MacOS dir: {:?}", macos_dir));
                let contents_dir = macos_dir.parent()?;
                write_log(&format!("Contents dir: {:?}", contents_dir));
                let resources_dir = contents_dir.join("Resources").join("resources");
                write_log(&format!("Resources dir: {:?}", resources_dir));
                
                // Try .js first (original working file)
                let server_js = resources_dir.join("server-claude-macos.js");
                if server_js.exists() {
                    write_log(&format!("Found server.js at: {:?}", server_js));
                    return Some(server_js);
                }
                
                // Fall back to .cjs
                let server_cjs = resources_dir.join("server-claude-macos.cjs");
                write_log(&format!("Looking for server.cjs at: {:?}", server_cjs));
                Some(server_cjs)
            });
        
        if result.is_none() {
            write_log("Failed to construct production server path");
        }
        
        result
    };
    
    if let Some(server_file) = server_path {
        if !server_file.exists() {
            info!("Server file not found at: {:?}", server_file);
            return;
        }
        
        info!("Using server file: {:?}", server_file);
        
        // Get node_modules path
        let node_modules = if cfg!(debug_assertions) {
            // In development
            server_file.parent().map(|p| p.join("node_modules"))
        } else {
            // In production, node_modules are in the same resources directory
            server_file.parent().map(|p| p.join("node_modules"))
        };
        
        // Also check if node_modules exists
        if let Some(ref modules) = node_modules {
            if !modules.exists() {
                write_log(&format!("Warning: node_modules not found at: {:?}", modules));
            } else {
                write_log(&format!("node_modules found at: {:?}", modules));
            }
        }
        
        write_log("Attempting to spawn Node.js server...");
        let mut cmd = Command::new("node");
        cmd.arg(&server_file);
        
        if let Some(ref modules) = node_modules {
            write_log(&format!("Setting NODE_PATH to: {:?}", modules));
            cmd.env("NODE_PATH", modules);
        }
        
        // Always capture output for logging
        cmd.stdout(Stdio::piped())
           .stderr(Stdio::piped());
        
        // Set working directory to resources folder for relative requires
        if let Some(working_dir) = server_file.parent() {
            cmd.current_dir(working_dir);
            write_log(&format!("Working directory: {:?}", working_dir));
        }
        
        write_log(&format!("Spawn command: node {:?}", &server_file));
        match cmd.spawn() {
            Ok(mut child) => {
                write_log(&format!("✅ macOS server spawned with PID: {}", child.id()));
                info!("✅ macOS server spawned with PID: {}", child.id());
                
                // Spawn threads to log stdout and stderr
                if let Some(stdout) = child.stdout.take() {
                    std::thread::spawn(move || {
                        use std::io::{BufRead, BufReader};
                        let reader = BufReader::new(stdout);
                        for line in reader.lines() {
                            if let Ok(line) = line {
                                write_log(&format!("[SERVER OUT] {}", line));
                                info!("[SERVER OUT] {}", line);
                            }
                        }
                    });
                }
                
                if let Some(stderr) = child.stderr.take() {
                    std::thread::spawn(move || {
                        use std::io::{BufRead, BufReader};
                        let reader = BufReader::new(stderr);
                        for line in reader.lines() {
                            if let Ok(line) = line {
                                write_log(&format!("[SERVER ERR] {}", line));
                                info!("[SERVER ERR] {}", line);
                            }
                        }
                    });
                }
                
                let child_arc = Arc::new(Mutex::new(child));
                if let Ok(mut process_guard) = SERVER_PROCESS.lock() {
                    *process_guard = Some(child_arc);
                }
                
                info!("✅ macOS server process tracking set up");
            }
            Err(e) => {
                write_log(&format!("❌ Failed to start macOS server: {}", e));
                write_log(&format!("Error kind: {:?}", e.kind()));
                write_log(&format!("Current dir: {:?}", std::env::current_dir()));
                info!("❌ Failed to start macOS server: {}", e);
                
                // Try to check if node exists
                write_log("Checking for Node.js installation...");
                match Command::new("which").arg("node").output() {
                    Ok(output) => {
                        let node_path = String::from_utf8_lossy(&output.stdout);
                        if node_path.trim().is_empty() {
                            write_log("Node.js not found in PATH!");
                        } else {
                            write_log(&format!("Node location: {}", node_path));
                        }
                    }
                    Err(e) => {
                        write_log(&format!("Could not run 'which node': {}", e));
                    }
                }
                
                // Try common node locations on macOS
                let common_paths = vec![
                    "/usr/local/bin/node",
                    "/opt/homebrew/bin/node",
                    "/usr/bin/node",
                ];
                
                for path in common_paths {
                    if std::path::Path::new(path).exists() {
                        write_log(&format!("Found node at: {}", path));
                        // Try to spawn with absolute path
                        write_log(&format!("Retrying with absolute path: {}", path));
                        let mut retry_cmd = Command::new(path);
                        retry_cmd.arg(&server_file);
                        
                        if let Some(ref modules) = node_modules {
                            retry_cmd.env("NODE_PATH", modules);
                        }
                        
                        if let Some(working_dir) = server_file.parent() {
                            retry_cmd.current_dir(working_dir);
                        }
                        
                        retry_cmd.stdout(Stdio::piped())
                                 .stderr(Stdio::piped());
                        
                        match retry_cmd.spawn() {
                            Ok(mut child) => {
                                write_log(&format!("✅ Retry successful with {}, PID: {}", path, child.id()));
                                
                                // Handle stdout
                                if let Some(stdout) = child.stdout.take() {
                                    std::thread::spawn(move || {
                                        use std::io::{BufRead, BufReader};
                                        let reader = BufReader::new(stdout);
                                        for line in reader.lines() {
                                            if let Ok(line) = line {
                                                write_log(&format!("[SERVER OUT] {}", line));
                                            }
                                        }
                                    });
                                }
                                
                                // Handle stderr
                                if let Some(stderr) = child.stderr.take() {
                                    std::thread::spawn(move || {
                                        use std::io::{BufRead, BufReader};
                                        let reader = BufReader::new(stderr);
                                        for line in reader.lines() {
                                            if let Ok(line) = line {
                                                write_log(&format!("[SERVER ERR] {}", line));
                                            }
                                        }
                                    });
                                }
                                
                                // Store process handle
                                let child_arc = Arc::new(Mutex::new(child));
                                if let Ok(mut process_guard) = SERVER_PROCESS.lock() {
                                    *process_guard = Some(child_arc);
                                }
                                
                                return;
                            }
                            Err(e) => {
                                write_log(&format!("Retry with {} failed: {}", path, e));
                            }
                        }
                    }
                }
            }
        }
    } else {
        write_log("ERROR: Could not determine server path");
        info!("Could not determine server path");
    }
}