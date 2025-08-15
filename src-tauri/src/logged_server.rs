/// Node.js server process management module
/// This module handles spawning and managing the Node.js backend server that bridges
/// between Tauri and the Claude CLI. The server:
/// - Spawns Claude CLI processes with proper arguments
/// - Parses Claude's stream-json output format
/// - Communicates with the frontend via Socket.IO WebSocket
/// - Manages multiple concurrent Claude sessions
/// - Handles platform-specific requirements (WSL on Windows, etc.)

use std::process::{Command, Child, Stdio};
use std::sync::{Arc, Mutex};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use tracing::info;

// SIMPLE FLAG TO CONTROL CONSOLE VISIBILITY AND DEVTOOLS
// Set to true during development to see server console output and force DevTools open
pub const YURUCODE_SHOW_CONSOLE: bool = false;  // SET TO TRUE TO SEE CONSOLE AND FORCE DEVTOOLS

// Global handle to the server process and port
// We use Arc<Mutex<>> for thread-safe access to the child process
// This allows us to kill the specific server process on shutdown
static SERVER_PROCESS: Mutex<Option<Arc<Mutex<Child>>>> = Mutex::new(None);
static SERVER_PORT: Mutex<Option<u16>> = Mutex::new(None);

/// Returns the platform-specific path for server log files
/// - macOS: ~/Library/Logs/yurucode/server.log
/// - Windows: %LOCALAPPDATA%\yurucode\logs\server.log
/// - Linux: ~/.yurucode/logs/server.log
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

/// Appends a timestamped message to the server log file
/// Used for debugging server startup and runtime issues
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

/// Clears the log file and writes a header with current timestamp
/// Called at server startup to ensure fresh logs for each session
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

/// Returns the contents of the server log file (limited to last 800 lines)
/// Used by the frontend to display server logs for debugging
/// Creates a placeholder log file on Windows if it doesn't exist
pub fn get_server_logs() -> String {
    // On Windows with embedded server, create a log file if it doesn't exist
    #[cfg(target_os = "windows")]
    {
        let log_path = get_log_path();
        if !log_path.exists() {
            let _ = fs::create_dir_all(log_path.parent().unwrap());
            let _ = fs::write(&log_path, "=== yurucode server log ===\nEmbedded server running\nNote: Real-time logging not available in embedded mode\n");
        }
    }
    
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

/// Embedded Node.js server code as a string literal
/// This is the actual server implementation that gets written to a temp file and executed
/// The server:
/// - Creates a Socket.IO WebSocket server for real-time communication
/// - Spawns Claude CLI processes with proper arguments
/// - Parses Claude's stream-json output format
/// - Manages session state and working directories
/// - Handles platform-specific Claude execution (WSL on Windows)
/// - Implements tool use detection and forwarding
/// - Manages streaming state for proper UI updates
const EMBEDDED_SERVER: &str = r#"
// Restore console logging for debugging
const originalConsole = console;

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

// Enable logging to original console
function log(msg) {
    try {
        originalConsole.log(msg);
    } catch (e) {
        // Fallback if console fails
    }
}

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
    transports: ['websocket', 'polling'],
    pingTimeout: 600000, // 10 minutes - prevent timeout during long operations
    pingInterval: 30000, // 30 seconds heartbeat
    upgradeTimeout: 60000, // 60 seconds for upgrade
    maxHttpBufferSize: 5e8, // 500mb - handle large contexts
    perMessageDeflate: false, // Disable compression for better streaming performance
    httpCompression: false // Disable HTTP compression for streaming
});

const activeProcesses = new Map();
const lastAssistantMessageIds = new Map();
const sessions = new Map(); // Store session data including working directory
const streamHealthChecks = new Map(); // Map of sessionId -> interval
const streamTimeouts = new Map(); // Map of sessionId -> timeout

// Helper function to generate title with Sonnet
async function generateTitle(sessionId, userMessage, socket) {
    try {
        log(`🏷️ Generating title for session ${sessionId}`);
        log(`🏷️ Message preview: "${userMessage.substring(0, 100)}..."`);
        
        const titlePrompt = `user message: "${userMessage.substring(0, 200)}"
task: reply with ONLY 1-3 words describing what user wants. lowercase only. no punctuation. be extremely concise. examples: "echo command", "file search", "debug issue"`;
        
        // Build args for title generation - simpler than main Claude
        const titleArgs = ['--output-format', 'json', '--model', 'claude-3-5-sonnet-20241022', '--print'];
        
        let titleProcess;
        
        // On Windows, use WSL
        if (process.platform === 'win32') {
            const escapedArgs = titleArgs.map(arg => {
                if (arg.includes(' ') || arg.includes('\n')) {
                    return "'" + arg.replace(/'/g, "'\\''") + "'";
                }
                return arg;
            }).join(' ');
            
            const wslArgs = ['-e', 'bash', '-c', 
                `(if command -v claude &> /dev/null; then claude ${escapedArgs}; elif [ -x ~/.claude/local/claude ]; then ~/.claude/local/claude ${escapedArgs}; elif [ -x ~/.local/bin/claude ]; then ~/.local/bin/claude ${escapedArgs}; else exit 127; fi)`
            ];
            
            titleProcess = spawn('wsl.exe', wslArgs, {
                stdio: ['pipe', 'pipe', 'pipe'],
                windowsHide: true
            });
        } else {
            // Direct spawn for non-Windows
            titleProcess = spawn('claude', titleArgs, {
                stdio: ['pipe', 'pipe', 'pipe']
            });
        }
        
        let output = '';
        
        titleProcess.stdout.on('data', (data) => {
            output += data.toString();
        });
        
        titleProcess.on('exit', (code) => {
            if (code === 0) {
                try {
                    const lines = output.trim().split('\n');
                    const lastLine = lines[lines.length - 1];
                    const parsed = JSON.parse(lastLine);
                    
                    if (parsed.result) {
                        const title = parsed.result.substring(0, 30).toLowerCase().trim();
                        log(`🏷️ Generated title: "${title}"`);
                        
                        socket.emit(`title:${sessionId}`, {
                            title
                        });
                    }
                } catch (e) {
                    log(`🏷️ Failed to parse title response: ${e.message}`);
                }
            }
        });
        
        // Send the prompt
        titleProcess.stdin.write(titlePrompt);
        titleProcess.stdin.end();
        
    } catch (error) {
        log(`🏷️ Failed to generate title: ${error.message}`);
    }
}

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
        
        // Use --resume if we have a claudeSessionId (for continuing conversations)
        if (session.claudeSessionId) {
            args.push('--resume', session.claudeSessionId);
            log(`[${sessionId}] Using --resume with Claude session ID: ${session.claudeSessionId}`);
        } else {
            log(`[${sessionId}] Starting fresh conversation (no previous session)`);
        }
        
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
                stdio: ['pipe', 'pipe', 'pipe'],
                windowsHide: true  // Hide WSL console window
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
                shell: false,
                windowsHide: true  // Hide Claude window on Windows
            });
        }
        
        activeProcesses.set(sessionId, claude);
        
        // Generate title for first message in session
        if (!session.hasGeneratedTitle && userMessage && userMessage.length > 5) {
            log(`🏷️ Triggering title generation for session ${sessionId}`);
            generateTitle(sessionId, userMessage, socket);
            session.hasGeneratedTitle = true;
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
        let lastDataTime = Date.now();
        let streamStartTime = Date.now();
        
        // Cleanup any existing health check for this session
        if (streamHealthChecks.has(sessionId)) {
            clearInterval(streamHealthChecks.get(sessionId));
        }
        if (streamTimeouts.has(sessionId)) {
            clearTimeout(streamTimeouts.get(sessionId));
        }
        
        // Log stream health check every 5 seconds
        const streamHealthInterval = setInterval(() => {
            const timeSinceLastData = Date.now() - lastDataTime;
            const streamDuration = Date.now() - streamStartTime;
            log(`🩺 STREAM HEALTH CHECK [${sessionId}]`);
            log(`   ├─ Stream duration: ${streamDuration}ms`);
            log(`   ├─ Time since last data: ${timeSinceLastData}ms`);
            log(`   └─ Process alive: ${activeProcesses.has(sessionId)}`);
            
            if (timeSinceLastData > 30000) {
                log(`⚠️ WARNING: No data received for ${timeSinceLastData}ms!`);
                // Send keepalive to prevent client timeout
                socket.emit(`keepalive:${sessionId}`, { timestamp: Date.now() });
            }
            
            // If no data for 5 minutes, consider stream dead
            if (timeSinceLastData > 300000) {
                log(`💀 Stream appears dead after ${timeSinceLastData}ms, cleaning up`);
                if (activeProcesses.has(sessionId)) {
                    const proc = activeProcesses.get(sessionId);
                    proc.kill('SIGTERM');
                    activeProcesses.delete(sessionId);
                }
                clearInterval(streamHealthInterval);
            }
        }, 5000);
        
        // Store health check interval for cleanup
        streamHealthChecks.set(sessionId, streamHealthInterval);
        
        // Set overall stream timeout (10 minutes max per stream)
        const streamTimeout = setTimeout(() => {
            log(`⏰ Stream timeout reached for session ${sessionId} after 10 minutes`);
            if (activeProcesses.has(sessionId)) {
                const proc = activeProcesses.get(sessionId);
                log(`⏰ Terminating long-running process for ${sessionId}`);
                proc.kill('SIGTERM');
            }
        }, 600000); // 10 minutes
        streamTimeouts.set(sessionId, streamTimeout);
        
        claude.stdout.on('data', (data) => {
            lastDataTime = Date.now();
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
                    
                    // Capture Claude session ID from system init message
                    if (json.type === 'system' && json.subtype === 'init' && json.session_id) {
                        const session = sessions.get(sessionId);
                        if (session) {
                            session.claudeSessionId = json.session_id;
                            log(`[${sessionId}] Captured Claude session ID: ${json.session_id}`);
                        }
                    }
                    
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
            
            // Clean up all tracking for this session
            if (streamHealthChecks.has(sessionId)) {
                clearInterval(streamHealthChecks.get(sessionId));
                streamHealthChecks.delete(sessionId);
            }
            if (streamTimeouts.has(sessionId)) {
                clearTimeout(streamTimeouts.get(sessionId));
                streamTimeouts.delete(sessionId);
            }
            
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
            
            // Clean up all tracking for this session
            if (streamHealthChecks.has(sessionId)) {
                clearInterval(streamHealthChecks.get(sessionId));
                streamHealthChecks.delete(sessionId);
            }
            if (streamTimeouts.has(sessionId)) {
                clearTimeout(streamTimeouts.get(sessionId));
                streamTimeouts.delete(sessionId);
            }
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
        
        // Reset session to clear context
        const session = sessions.get(sessionId);
        if (session) {
            session.claudeSessionId = null;  // Reset Claude session ID so next message starts fresh
            session.hasGeneratedTitle = false;  // Reset title generation flag
            log(`[${sessionId}] Session context cleared`);
        }
        
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

// ALWAYS use dynamic port from environment (set by Rust)
const PORT = process.env.PORT || (() => {
    // This should never happen as Rust always sets PORT
    log('⚠️ WARNING: PORT not set by Rust, using fallback 3001');
    return 3001;
})();
server.listen(PORT, '0.0.0.0', () => {
    log('✅ SOCKET.IO SERVER RUNNING ON PORT ' + PORT);
});
"#;

/// Returns the port number where the server is running
/// Returns None if the server hasn't been started yet
#[allow(dead_code)]
pub fn get_server_port() -> Option<u16> {
    SERVER_PORT.lock().ok()?.clone()
}

/// Stops the Node.js server process for this specific Tauri instance
/// This is instance-specific to support multiple app windows
/// Uses normal kill first, then force kill if needed
pub fn stop_logged_server() {
    info!("Stopping server for THIS instance only...");
    
    if let Ok(mut process_guard) = SERVER_PROCESS.try_lock() {
        if let Some(process_arc) = process_guard.take() {
            if let Ok(mut process) = process_arc.try_lock() {
                let pid = process.id();
                info!("Killing server process with PID: {}", pid);
                
                // Try normal kill first
                if let Err(e) = process.kill() {
                    info!("Normal kill failed: {}, trying force kill", e);
                    
                    // On Windows, use taskkill for this specific PID only
                    #[cfg(target_os = "windows")]
                    {
                        use std::process::Command;
                        let _ = Command::new("taskkill")
                            .args(&["/F", "/PID", &pid.to_string()])
                            .output();
                        info!("Force killed PID {}", pid);
                    }
                } else {
                    info!("Server process killed successfully");
                }
            } else {
                info!("Could not lock process");
            }
        } else {
            info!("No server process to stop");
        }
    } else {
        info!("Could not lock SERVER_PROCESS");
    }
}

/// Starts the Node.js backend server on the specified port
/// Platform-specific behavior:
/// - macOS: Uses external server file from bundle/project
/// - Windows/Linux: Uses embedded server code
/// The server is started as a detached process that survives parent crashes
pub fn start_logged_server(port: u16) {
    info!("Starting server on port {}", port);
    
    // Stop any existing server first to avoid port conflicts
    stop_logged_server();
    
    // Store the port
    if let Ok(mut port_guard) = SERVER_PORT.lock() {
        *port_guard = Some(port);
    }
    
    // Wait a bit for the port to be released
    std::thread::sleep(std::time::Duration::from_millis(500));
    
    // On macOS, use the bundled server file directly
    #[cfg(target_os = "macos")]
    {
        start_macos_server(port);
        return;
    }
    
    // Original embedded server logic for other platforms (Windows/Linux)
    info!("Starting embedded server on port {}", port);
    clear_log(); // Clear logs from previous run
    write_log("=== Starting embedded server ===");
    
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
           .current_dir(&server_dir)
           .env("PORT", port.to_string());
        
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
            const DETACHED_PROCESS: u32 = 0x00000008;
            
            // Use DETACHED_PROCESS so the server survives if the parent crashes
            // We'll explicitly kill it in stop_logged_server()
            let flags = if YURUCODE_SHOW_CONSOLE {
                info!("Console VISIBLE + DETACHED");
                CREATE_NEW_CONSOLE | DETACHED_PROCESS
            } else {
                info!("Console HIDDEN + DETACHED");
                CREATE_NO_WINDOW | DETACHED_PROCESS
            };
            
            cmd.creation_flags(flags);
        }
        
        // Always capture output for logging, even when console is hidden
        cmd.stdout(Stdio::piped())
           .stderr(Stdio::piped());
        
        match cmd.spawn() {
            Ok(mut child) => {
                info!("✅ Server started with PID: {}", child.id());
                write_log(&format!("✅ Server started with PID: {}", child.id()));
                
                // Spawn threads to capture and log stdout/stderr
                if let Some(stdout) = child.stdout.take() {
                    std::thread::spawn(move || {
                        use std::io::{BufRead, BufReader};
                        let reader = BufReader::new(stdout);
                        for line in reader.lines() {
                            if let Ok(line) = line {
                                write_log(&format!("[SERVER OUT] {}", line));
                                info!("[SERVER OUT] {}", line);
                                if YURUCODE_SHOW_CONSOLE {
                                    println!("[SERVER OUT] {}", line);
                                }
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
                                if YURUCODE_SHOW_CONSOLE {
                                    eprintln!("[SERVER ERR] {}", line);
                                }
                            }
                        }
                    });
                }
                
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

/// macOS-specific server startup
/// Uses an external server file (server-claude-macos.js) rather than embedded code
/// This allows for easier debugging and avoids code signing issues
/// Handles both development (project root) and production (.app bundle) scenarios
#[cfg(target_os = "macos")]
fn start_macos_server(port: u16) {
    info!("Starting macOS server on port {}", port);
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
        
        write_log(&format!("Attempting to spawn Node.js server on port {}...", port));
        let mut cmd = Command::new("node");
        cmd.arg(&server_file)
           .env("PORT", port.to_string());
        
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
                        write_log(&format!("Retrying with absolute path: {} on port {}", path, port));
                        let mut retry_cmd = Command::new(path);
                        retry_cmd.arg(&server_file)
                                 .env("PORT", port.to_string());
                        
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