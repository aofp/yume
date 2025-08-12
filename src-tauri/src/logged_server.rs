use std::process::{Command, Child, Stdio};
use std::fs;
use std::sync::{Arc, Mutex};
use tracing::info;

// SIMPLE FLAG TO CONTROL CONSOLE VISIBILITY AND DEVTOOLS
pub const YURUCODE_SHOW_CONSOLE: bool = false;  // SET TO TRUE TO SEE CONSOLE AND FORCE DEVTOOLS

// Global handle to the server process
static SERVER_PROCESS: Mutex<Option<Arc<Mutex<Child>>>> = Mutex::new(None);

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
        
        // Generate title on first message
        if (!session.hasGeneratedTitle && userMessage && userMessage.length > 5) {
            session.hasGeneratedTitle = true;
            
            // Generate a simple title from the first message
            setTimeout(() => {
                let title = userMessage
                    .toLowerCase()
                    .replace(/[^\w\s]/g, '')
                    .trim()
                    .substring(0, 30);
                    
                if (title && title.length > 2) {
                    log(`[${sessionId}] Generated title: "${title}"`);
                    socket.emit(`title:${sessionId}`, { title });
                }
            }, 1000);
        }
        
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
                    } else if (json.type === 'content_block_delta' && json.delta?.text) {
                        socket.emit(`message:${sessionId}`, {
                            type: 'assistant',
                            id: assistantMessageId,
                            text: json.delta.text,
                            streaming: true,
                            timestamp: Date.now()
                        });
                    } else if (json.type === 'message_stop') {
                        socket.emit(`message:${sessionId}`, {
                            type: 'assistant',
                            id: assistantMessageId,
                            streaming: false,
                            timestamp: Date.now()
                        });
                        lastAssistantMessageIds.delete(sessionId);
                    } else if (json.type === 'assistant' && json.message?.content) {
                        // Handle full assistant message (non-streaming format)
                        const messageId = `assistant-${sessionId}-${Date.now()}`;
                        lastAssistantMessageIds.set(sessionId, messageId);
                        
                        // Extract text content
                        for (const block of json.message.content) {
                            if (block.type === 'text') {
                                socket.emit(`message:${sessionId}`, {
                                    type: 'assistant',
                                    message: { content: block.text },
                                    streaming: true, // Keep streaming true - will be cleared by result message
                                    id: messageId,
                                    timestamp: Date.now()
                                });
                            }
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