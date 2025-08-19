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
pub fn clear_log() {
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
/**
 * macOS-compatible server that runs claude CLI directly
 * IDENTICAL TO WINDOWS SERVER - NO SDK, NO API KEY - just direct claude CLI calls with streaming
 */
// Safe console wrapper to handle closed file descriptors in production
const originalConsole = {
  log: console.log.bind(console),
  error: console.error.bind(console),
  warn: console.warn.bind(console),
  info: console.info.bind(console),
  debug: console.debug.bind(console)
};

// Override console methods with safe versions
console.log = function(...args) {
  try {
    originalConsole.log(...args);
  } catch (e) {
    if (e.code !== 'EBADF' && e.code !== 'EPIPE') throw e;
  }
};

console.error = function(...args) {
  try {
    originalConsole.error(...args);
  } catch (e) {
    if (e.code !== 'EBADF' && e.code !== 'EPIPE') throw e;
  }
};

console.warn = function(...args) {
  try {
    originalConsole.warn(...args);
  } catch (e) {
    if (e.code !== 'EBADF' && e.code !== 'EPIPE') throw e;
  }
};

console.info = function(...args) {
  try {
    originalConsole.info(...args);
  } catch (e) {
    if (e.code !== 'EBADF' && e.code !== 'EPIPE') throw e;
  }
};

console.debug = function(...args) {
  try {
    originalConsole.debug(...args);
  } catch (e) {
    if (e.code !== 'EBADF' && e.code !== 'EPIPE') throw e;
  }
};


// No need for module override when not using asar

// Claude CLI path - try multiple locations
const { execSync, spawn } = require("child_process");
const { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync } = require("fs");
const path = require("path");
const { dirname, join } = path;
const { createServer } = require("http");
const { Server } = require("socket.io");
const { homedir, platform } = require("os");

// __dirname is already defined in CommonJS
let CLAUDE_PATH = 'claude'; // Default to PATH lookup

// Try to find Claude CLI in common locations
const isWindows = platform() === 'win32';

// Helper function to create WSL command for claude with comprehensive path checking
function createWslClaudeCommand(args, workingDir) {
  // Escape args for bash
  const escapedArgs = args.map(arg => {
    // Use strong quoting for args with special characters
    if (arg.includes(' ') || arg.includes('"') || arg.includes("'") || arg.includes('$') || arg.includes('\\') || arg.includes('\n')) {
      return "'" + arg.replace(/'/g, "'\\''") + "'";
    }
    return arg;
  }).join(' ');
  
  // Build a simpler, more robust detection script
  const findClaudeScript = `
    claude_paths=(
      "/usr/local/bin/claude"
      "/usr/bin/claude"
      "$HOME/.local/bin/claude"
      "$HOME/.npm-global/bin/claude"
      "$HOME/node_modules/.bin/claude"
      "$HOME/.claude/local/claude"
      "$HOME/.claude/local/node_modules/.bin/claude"
      "/opt/claude/bin/claude"
      "$HOME/AppData/Local/npm/claude"
      "$HOME/AppData/Roaming/npm/claude"
    )
    
    # Check each user's .npm-global and .claude paths
    for user_home in /home/*; do
      if [ -d "$user_home" ]; then
        claude_paths+=("$user_home/.npm-global/bin/claude")
        claude_paths+=("$user_home/node_modules/.bin/claude")
        claude_paths+=("$user_home/.local/bin/claude")
        claude_paths+=("$user_home/.claude/local/claude")
        claude_paths+=("$user_home/.claude/local/node_modules/.bin/claude")
      fi
    done
    
    # Check nvm installations
    if [ -d "$HOME/.nvm" ]; then
      for nvm_path in $HOME/.nvm/versions/node/*/bin/claude; do
        [ -x "$nvm_path" ] && claude_paths+=("$nvm_path")
      done
    fi
    
    # Also check for Windows-style npm installations in WSL
    for npm_prefix in "$HOME/.npm" "/usr/local" "/usr"; do
      [ -x "$npm_prefix/bin/claude" ] && claude_paths+=("$npm_prefix/bin/claude")
    done
    
    # Try to find claude in PATH first
    if command -v claude &>/dev/null; then
      claude_cmd="claude"
    else
      # Check all known paths
      claude_cmd=""
      for path in "\${claude_paths[@]}"; do
        if [ -x "$path" ]; then
          claude_cmd="$path"
          break
        fi
      done
    fi
    
    if [ -z "$claude_cmd" ]; then
      echo "ERROR: Claude CLI not found in WSL" >&2
      echo "Searched paths:" >&2
      for path in "\${claude_paths[@]}"; do
        echo "  - $path" >&2
      done
      echo "Please install Claude CLI in WSL using: npm install -g @anthropic/claude-cli" >&2
      exit 127
    fi
    
    echo "DEBUG: Found Claude at: $claude_cmd" >&2
    
    ${workingDir ? `cd '${workingDir.replace(/'/g, "'\\''")}'` : ':'}
    exec "$claude_cmd" ${escapedArgs}
  `.trim();
  
  return ['wsl.exe', ['-e', 'bash', '-c', findClaudeScript]];
}

if (isWindows) {
  // On Windows, Claude only runs in WSL, so we'll use our comprehensive command builder
  console.log('🔍 Windows detected, Claude will be invoked through WSL with comprehensive path detection...');
  CLAUDE_PATH = 'WSL_CLAUDE'; // Special marker to use createWslClaudeCommand
  
} else {
  // macOS/Linux paths
  const possibleClaudePaths = [
    join(homedir(), '.npm-global/bin/claude'), // npm global install path
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
    '/usr/bin/claude',
    process.env.CLAUDE_PATH, // Allow env override
  ].filter(Boolean);

  for (const claudePath of possibleClaudePaths) {
    try {
      if (existsSync(claudePath)) {
        CLAUDE_PATH = claudePath;
        console.log(`✅ Found Claude CLI at: ${CLAUDE_PATH}`);
        break;
      }
    } catch (e) {
      // Continue searching
    }
  }

  // If still not found, try 'which' command
  if (CLAUDE_PATH === 'claude') {
    try {
      const whichResult = execSync('which claude', { encoding: 'utf8' }).trim();
      if (whichResult) {
        CLAUDE_PATH = whichResult;
        console.log(`✅ Found Claude CLI via which: ${CLAUDE_PATH}`);
      }
    } catch (e) {
      // Not in PATH, continue to whereis
    }
  }

  // If still not found, try 'whereis' command
  if (CLAUDE_PATH === 'claude') {
    try {
      const whereisResult = execSync('whereis claude', { encoding: 'utf8' }).trim();
      // whereis output format: "claude: /path/to/claude /another/path/to/claude"
      const matches = whereisResult.match(/claude:\s+(.+)/);
      if (matches && matches[1]) {
        const paths = matches[1].split(/\s+/);
        for (const path of paths) {
          if (existsSync(path)) {
            CLAUDE_PATH = path;
            console.log(`✅ Found Claude CLI via whereis: ${CLAUDE_PATH}`);
            break;
          }
        }
      }
    } catch (e) {
      console.warn(`⚠️ Claude CLI not found via whereis. Using 'claude' and hoping for the best.`);
    }
  }
}

const express = require("express");
const cors = require("cors");
const net = require("net");

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 86400000, // 24 hours - essentially infinite
  pingInterval: 10000, // 10 seconds heartbeat - more frequent
  upgradeTimeout: 60000, // 60 seconds for upgrade
  maxHttpBufferSize: 5e8, // 500mb - handle large contexts
  perMessageDeflate: false, // Disable compression for better streaming performance
  httpCompression: false // Disable HTTP compression for streaming
});

app.use(cors());
app.use(express.json());

// ALWAYS use dynamic port - for BOTH development AND production
const PORT = (() => {
  // First check environment variable (passed from Rust)
  if (process.env.PORT) {
    const port = parseInt(process.env.PORT);
    console.log(`✅ Using PORT from Rust: ${port}`);
    return port;
  }
  
  // Otherwise find an available port dynamically
  console.log('🔍 Finding available port in range 60000-61000...');
  let port = 60000 + Math.floor(Math.random() * 1001);
  
  for (let i = 0; i < 100; i++) {
    const testPort = 60000 + ((port - 60000 + i) % 1001);
    const server = net.createServer();
    try {
      server.listen(testPort, '127.0.0.1');
      server.close();
      console.log(`✅ Found available port: ${testPort}`);
      return testPort;
    } catch (e) {
      // Port in use, try next
    }
  }
  
  // Last resort fallback
  console.log('⚠️ Could not find available port, using 3001');
  return 3001;
})();

// Track active Claude processes and assistant message IDs - EXACTLY LIKE WINDOWS
let sessions = new Map();
let activeProcesses = new Map();  // Map of sessionId -> process
let activeProcessStartTimes = new Map();  // Map of sessionId -> process start time

// Session persistence to disk for recovery after restart
class SessionPersistence {
  constructor() {
    this.sessionDir = path.join(homedir(), '.yurucode', 'sessions');
    this.ensureDirectory();
    // Don't auto-load on startup to avoid conflicts
  }
  
  ensureDirectory() {
    if (!existsSync(this.sessionDir)) {
      mkdirSync(this.sessionDir, { recursive: true });
      console.log(`📁 Created session directory: ${this.sessionDir}`);
    }
  }
  
  saveSession(sessionId, sessionData) {
    try {
      const filePath = path.join(this.sessionDir, `${sessionId}.json`);
      const dataToSave = {
        id: sessionData.id || sessionId,
        name: sessionData.name,
        workingDirectory: sessionData.workingDirectory,
        messages: sessionData.messages || [],
        claudeSessionId: sessionData.claudeSessionId,
        hasGeneratedTitle: sessionData.hasGeneratedTitle,
        createdAt: sessionData.createdAt,
        savedAt: Date.now()
      };
      writeFileSync(filePath, JSON.stringify(dataToSave, null, 2));
      console.log(`💾 Saved session to disk: ${sessionId}`);
    } catch (error) {
      console.error(`❌ Failed to save session ${sessionId}:`, error.message);
    }
  }
  
  loadSession(sessionId) {
    try {
      const filePath = path.join(this.sessionDir, `${sessionId}.json`);
      if (existsSync(filePath)) {
        const data = JSON.parse(readFileSync(filePath, 'utf8'));
        console.log(`📂 Loaded session from disk: ${sessionId}`);
        return data;
      }
    } catch (error) {
      console.error(`❌ Failed to load session ${sessionId}:`, error.message);
    }
    return null;
  }
  
  deleteSession(sessionId) {
    try {
      const filePath = path.join(this.sessionDir, `${sessionId}.json`);
      if (existsSync(filePath)) {
        unlinkSync(filePath);
        console.log(`🗑️ Deleted session file: ${sessionId}`);
      }
    } catch (error) {
      console.error(`❌ Failed to delete session ${sessionId}:`, error.message);
    }
  }
}

// Read Claude's native session files directly
class ClaudeProjectReader {
  constructor() {
    this.projectsDir = path.join(homedir(), '.claude', 'projects');
  }
  
  findSessionFile(claudeSessionId) {
    try {
      if (!existsSync(this.projectsDir)) return null;
      
      const projects = readdirSync(this.projectsDir);
      for (const project of projects) {
        const sessionFile = path.join(this.projectsDir, project, `${claudeSessionId}.jsonl`);
        if (existsSync(sessionFile)) {
          console.log(`🔍 Found Claude session file: ${project}/${claudeSessionId}.jsonl`);
          return { projectId: project, sessionFile };
        }
      }
    } catch (error) {
      console.error('❌ Error searching for Claude session:', error.message);
    }
    return null;
  }
  
  verifySessionExists(claudeSessionId) {
    return this.findSessionFile(claudeSessionId) !== null;
  }
}

const sessionPersistence = new SessionPersistence();
const claudeReader = new ClaudeProjectReader();
let lastAssistantMessageIds = new Map();  // Map of sessionId -> lastAssistantMessageId
let streamHealthChecks = new Map(); // Map of sessionId -> interval
let streamTimeouts = new Map(); // Map of sessionId -> timeout
let messageDeduplication = new Map(); // Map of sessionId -> Set of message hashes
let sessionBackupInterval = null; // Interval for periodic session backups
let processRetryCount = new Map(); // Map of sessionId -> retry count

// Add process spawn mutex to prevent race conditions
let isSpawningProcess = false;
const processSpawnQueue = [];

// Helper function to generate title with Sonnet
async function generateTitle(sessionId, userMessage, socket, onSuccess) {
  try {
    console.log(`🏷️ Generating title for session ${sessionId}`);
    console.log(`🏷️ Message preview: "${userMessage.substring(0, 100)}..."`);
    
    // Spawn a separate claude process just for title generation
    const titleArgs = [
      '--print',  // Non-interactive mode
      '--output-format', 'json',
      '--model', 'claude-3-5-sonnet-20241022'
    ];
    
    const titlePrompt = `user message: "${userMessage.substring(0, 200)}"
task: reply with ONLY 1-3 words describing what user wants. lowercase only. no punctuation. be extremely concise. examples: "echo command", "file search", "debug issue"`;
    
    console.log(`🏷️ Title prompt: "${titlePrompt}"`);
    
    // Ensure Node.js is in PATH for Claude CLI
    const enhancedEnv = { ...process.env };
    const nodeBinDir = '/opt/homebrew/bin';
    if (!enhancedEnv.PATH?.includes(nodeBinDir)) {
      enhancedEnv.PATH = `${nodeBinDir}:${enhancedEnv.PATH || '/usr/bin:/bin'}`;
    }
    
    const child = isWindows && CLAUDE_PATH === 'WSL_CLAUDE' ? 
      (() => {
        const [wslCommand, wslArgs] = createWslClaudeCommand(titleArgs, null);
        return spawn(wslCommand, wslArgs, {
          cwd: process.cwd(),
          env: enhancedEnv,
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
          detached: false
        });
      })() :
      spawn(CLAUDE_PATH, titleArgs, {
      cwd: process.cwd(),
      env: enhancedEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,  // Always hide windows
      detached: false
    });
    
    let output = '';
    let errorOutput = '';
    
    child.stdout.on('data', (data) => {
      output += data.toString();
      console.log(`🏷️ Title generation stdout: ${data.toString()}`);
    });
    
    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
      console.log(`🏷️ Title generation stderr: ${data.toString()}`);
    });
    
    child.on('close', (code) => {
      console.log(`🏷️ Title generation process closed with code ${code}`);
      console.log(`🏷️ Full output: "${output}"`);
      if (errorOutput) {
        console.log(`🏷️ Error output: "${errorOutput}"`);
      }
      
      try {
        const lines = output.trim().split('\n');
        const lastLine = lines[lines.length - 1];
        console.log(`🏷️ Parsing last line: "${lastLine}"`);
        const response = JSON.parse(lastLine);
        
        // Handle both 'completion' and 'result' fields
        const titleText = response.completion || response.result;
        
        if (titleText) {
          let title = titleText
            .toLowerCase()
            .replace(/[^\w\s]/g, '')
            .trim()
            .substring(0, 30);
          
          if (title && title.length > 2) {
            console.log(`🏷️ Generated title: "${title}" - emitting to client`);
            const eventName = `title:${sessionId}`;
            console.log(`🏷️ Emitting event: ${eventName} with data:`, { title });
            socket.emit(eventName, { title });
            // Mark title as successfully generated
            if (onSuccess) onSuccess();
          } else {
            console.log(`🏷️ Title too short or empty: "${title}"`);
          }
        } else {
          console.log(`🏷️ No title text in response:`, response);
        }
      } catch (e) {
        console.error('🏷️ Failed to parse title response:', e);
        console.error('🏷️ Raw output was:', output);
      }
    });
    
    child.on('error', (error) => {
      console.error('🏷️ Failed to spawn title generation process:', error);
    });
    
    // Send the prompt
    console.log(`🏷️ Writing prompt to stdin`);
    child.stdin.write(titlePrompt);
    child.stdin.end();
    
  } catch (error) {
    console.error('🏷️ Failed to generate title:', error);
  }
}

// Memory management - EXACTLY LIKE WINDOWS
const MAX_MESSAGE_HISTORY = 10000; // Increased limit for long sessions
const MAX_LINE_BUFFER_SIZE = 500 * 1024 * 1024; // 500MB for very large responses
const SESSION_BACKUP_INTERVAL = 30000; // Backup sessions every 30 seconds
const MAX_RETRY_ATTEMPTS = 3; // Retry failed claude spawns
const COMPRESS_THRESHOLD = 1024 * 1024; // Compress messages > 1MB
const MESSAGE_CHUNK_SIZE = 64 * 1024; // Send large messages in 64KB chunks

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    pid: process.pid,
    service: 'yurucode-claude',
    claudeCodeLoaded: true
  });
});

// Delete a project and all its sessions
app.delete('/claude-project/:projectPath', async (req, res) => {
  try {
    const { projectPath } = req.params;
    const projectDir = join(homedir(), '.claude', 'projects', projectPath);
    
    console.log('Deleting project:', projectDir);
    
    if (!existsSync(projectDir)) {
      return res.status(404).json({ error: 'project not found' });
    }
    
    // Delete the entire project directory
    const { rm } = await import('fs/promises');
    await rm(projectDir, { recursive: true, force: true });
    
    console.log('Project deleted successfully');
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ error: 'Failed to delete project', details: error.message });
  }
});

// Delete a specific session
app.delete('/claude-session/:projectPath/:sessionId', async (req, res) => {
  try {
    const { projectPath, sessionId } = req.params;
    const sessionPath = join(homedir(), '.claude', 'projects', projectPath, `${sessionId}.jsonl`);
    
    console.log('Deleting session:', sessionPath);
    
    if (!existsSync(sessionPath)) {
      return res.status(404).json({ error: 'session not found' });
    }
    
    // Delete the session file
    const { unlink } = await import('fs/promises');
    await unlink(sessionPath);
    
    console.log('Session deleted successfully');
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting session:', error);
    res.status(500).json({ error: 'Failed to delete session', details: error.message });
  }
});

// Load a specific claude session with better error handling
app.get('/claude-session/:projectPath/:sessionId', async (req, res) => {
  try {
    const { projectPath, sessionId } = req.params;
    const sessionPath = join(homedir(), '.claude', 'projects', projectPath, `${sessionId}.jsonl`);
    
    console.log('Loading session request:');
    console.log('  - Raw projectPath:', projectPath);
    console.log('  - SessionId:', sessionId);
    console.log('  - Full path:', sessionPath);
    console.log('  - Platform:', platform());
    
    if (!existsSync(sessionPath)) {
      console.error('Session not found:', sessionPath);
      return res.status(404).json({ error: 'session not found' });
    }
    
    // Read the session file using promises for better error handling
    const { readFile } = await import('fs/promises');
    
    try {
      const content = await readFile(sessionPath, 'utf8');
      console.log('Raw file content preview (first 200 chars):', content.substring(0, 200).replace(/\n/g, '\\n').replace(/\r/g, '\\r'));
      console.log('Total file size:', content.length, 'characters');
      
      // Check if file ends with newline or $
      const lastChar = content[content.length - 1];
      console.log('File ends with:', lastChar === '\n' ? 'newline' : lastChar === '$' ? 'dollar' : 'char: ' + lastChar);
      
      const messages = [];
      
      // Claude session files are JSONL with $ as line terminator
      // BUT $ can also appear within JSON strings, so we need to be careful
      // Each line starts with { and ends with }$ (or }\n for the last line)
      
      let currentPos = 0;
      let validMessages = 0;
      let errorCount = 0;
      let lineNumber = 0;
      
      while (currentPos < content.length) {
        lineNumber++;
        
        // Skip whitespace
        while (currentPos < content.length && /\s/.test(content[currentPos])) {
          currentPos++;
        }
        
        if (currentPos >= content.length) break;
        
        // Find the start of a JSON object
        if (content[currentPos] !== '{') {
          console.log('Warning: Expected { at position', currentPos, 'but found:', content[currentPos]);
          // Skip to next line
          const nextLine = content.indexOf('\n', currentPos);
          if (nextLine === -1) break;
          currentPos = nextLine + 1;
          continue;
        }
        
        // Find the end of this JSON object by looking for }$ or }\n
        let braceCount = 0;
        let inString = false;
        let escapeNext = false;
        let jsonEnd = -1;
        
        for (let i = currentPos; i < content.length; i++) {
          const char = content[i];
          
          if (escapeNext) {
            escapeNext = false;
            continue;
          }
          
          if (char === '\\') {
            escapeNext = true;
            continue;
          }
          
          if (char === '"' && !escapeNext) {
            inString = !inString;
            continue;
          }
          
          if (!inString) {
            if (char === '{') {
              braceCount++;
            } else if (char === '}') {
              braceCount--;
              if (braceCount === 0) {
                // Check if next char is $ or newline
                if (i + 1 < content.length) {
                  const nextChar = content[i + 1];
                  if (nextChar === '$' || nextChar === '\n' || nextChar === '\r') {
                    jsonEnd = i + 1;
                    break;
                  }
                } else {
                  // End of file
                  jsonEnd = i + 1;
                  break;
                }
              }
            }
          }
        }
        
        if (jsonEnd === -1) {
          console.log('Warning: Could not find end of JSON object starting at position', currentPos);
          break;
        }
        
        // Extract and parse the JSON
        const jsonStr = content.substring(currentPos, jsonEnd);
        
        try {
          const data = JSON.parse(jsonStr);
          
          // Add all valid session data
          messages.push(data);
          validMessages++;
          
          if (validMessages <= 5) {
            // Log first few for debugging
            if (data.type === 'summary') {
              console.log(`Line ${lineNumber}: Added summary:`, (data.summary || '').substring(0, 50));
            } else if (data.type === 'user') {
              console.log(`Line ${lineNumber}: Added user message`);
            } else if (data.type === 'assistant') {
              console.log(`Line ${lineNumber}: Added assistant message`);
            } else if (data.sessionId) {
              console.log(`Line ${lineNumber}: Added session metadata`);
            }
          }
        } catch (err) {
          errorCount++;
          if (errorCount <= 5) {
            console.log(`Failed to parse JSON at line ${lineNumber}, position ${currentPos}:`, err.message);
            console.log('JSON preview:', jsonStr.substring(0, 100));
          }
        }
        
        // Move past the $ or newline
        currentPos = jsonEnd;
        if (currentPos < content.length && content[currentPos] === '$') {
          currentPos++;
        }
        if (currentPos < content.length && content[currentPos] === '\n') {
          currentPos++;
        }
        if (currentPos < content.length && content[currentPos] === '\r') {
          currentPos++;
        }
      }
      
      console.log(`Processed ${lineNumber} lines, successfully parsed ${validMessages} JSON objects from session file`);
      
      // Extract project path to actual directory
      // Handle Windows drive letter properly (C--Users becomes C:/Users)
      const actualPath = projectPath
        .replace(/^([A-Z])--/, '$1:/')  // C-- becomes C:/
        .replace(/^-/, '/')
        .replace(/-/g, '/');
      
      console.log(`Loaded session with ${messages.length} messages`);
      console.log(`Converted project path: ${projectPath} -> ${actualPath}`);
      
      res.json({ 
        sessionId,
        projectPath: actualPath,
        messages,
        sessionCount: messages.length
      });
    } catch (readError) {
      console.error('Error reading session file:', readError);
      res.status(500).json({ error: 'Failed to read session', details: readError.message });
    }
  } catch (error) {
    console.error('Error loading session:', error);
    res.status(500).json({ error: 'Failed to load session', details: error.message });
  }
});

// Projects endpoint - loads claude projects asynchronously with enhanced error handling
app.get('/claude-projects', async (req, res) => {
  try {
    const claudeDir = join(homedir(), '.claude', 'projects');
    
    console.log('Loading projects from:', claudeDir);
    console.log('Platform:', platform());
    
    // Check if projects directory exists
    if (!existsSync(claudeDir)) {
      console.log('Claude projects directory not found:', claudeDir);
      return res.json({ projects: [] });
    }
    
    // Load projects asynchronously using promises
    const { readdir, stat, readFile } = await import('fs/promises');
    
    const projectDirs = await readdir(claudeDir);
    console.log(`Found ${projectDirs.length} project directories`);
    
    // Filter out system files and process projects in parallel
    const projectPromises = projectDirs
      .filter(dir => !dir.startsWith('.'))
      .map(async (projectDir) => {
        try {
          const projectPath = join(claudeDir, projectDir);
          const stats = await stat(projectPath);
          
          if (!stats.isDirectory()) return null;
          
          // Load sessions for this project
          const sessionFiles = await readdir(projectPath);
          const sessionPromises = sessionFiles
            .filter(file => file.endsWith('.jsonl'))
            .map(async (sessionFile) => {
              try {
                const sessionPath = join(projectPath, sessionFile);
                const sessionStats = await stat(sessionPath);
                const sessionId = sessionFile.replace('.jsonl', '');
                
                // Read first few lines to get summary and message count
                let summary = 'untitled session';
                let messageCount = 0;
                let firstUserMessage = '';
                
                try {
                  const content = await readFile(sessionPath, 'utf8');
                  const lines = content.split(/\r?\n/).filter(line => line.trim());
                  messageCount = lines.length;
                  
                  // Try to find summary from first few lines
                  for (let i = 0; i < Math.min(5, lines.length); i++) {
                    try {
                      const data = JSON.parse(lines[i]);
                      if (data.summary) {
                        summary = data.summary;
                        break;
                      }
                      // Fallback to first user message if no summary
                      if (data.role === 'user' && data.content && !firstUserMessage) {
                        firstUserMessage = data.content.slice(0, 100);
                      }
                    } catch {}
                  }
                  
                  // Use first user message as summary if no official summary found
                  if (summary === 'untitled session' && firstUserMessage) {
                    summary = firstUserMessage + (firstUserMessage.length >= 100 ? '...' : '');
                  }
                } catch (err) {
                  console.error('Error reading session file:', sessionPath, err);
                }
                
                return {
                  id: sessionId,
                  summary,
                  timestamp: sessionStats.mtime.getTime(),
                  createdAt: sessionStats.birthtime?.getTime() || sessionStats.ctime?.getTime() || sessionStats.mtime.getTime(),
                  path: sessionPath,
                  messageCount
                };
              } catch (err) {
                console.error('Error processing session:', sessionFile, err);
                return null;
              }
            });
          
          const sessions = (await Promise.all(sessionPromises)).filter(Boolean);
          
          if (sessions.length === 0) return null;
          
          // Sort sessions by timestamp (newest first)
          sessions.sort((a, b) => b.timestamp - a.timestamp);
          
          // Get project creation time (oldest session creation time)
          const projectCreatedAt = Math.min(...sessions.map(s => s.createdAt || s.timestamp));
          
          return {
            path: projectDir,
            name: projectDir,
            sessions,
            lastModified: sessions[0]?.timestamp || stats.mtime.getTime(),
            createdAt: projectCreatedAt,
            sessionCount: sessions.length,
            totalMessages: sessions.reduce((sum, s) => sum + (s.messageCount || 0), 0)
          };
        } catch (err) {
          console.error('Error processing project:', projectDir, err);
          return null;
        }
      });
    
    const projects = (await Promise.all(projectPromises)).filter(Boolean);
    
    // Sort projects by last modified date (most recently opened first)
    projects.sort((a, b) => b.lastModified - a.lastModified);
    
    console.log(`Returning ${projects.length} projects`);
    res.json({ projects });
  } catch (error) {
    console.error('Error loading projects:', error);
    res.status(500).json({ error: 'Failed to load projects', details: error.message });
  }
});

// Quick projects endpoint - returns just project names and session counts for fast loading
app.get('/claude-projects-quick', async (req, res) => {
  try {
    // Get pagination params from query string
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    
    const claudeDir = join(homedir(), '.claude', 'projects');
    
    console.log('Quick loading project list from:', claudeDir);
    
    // Check if projects directory exists
    if (!existsSync(claudeDir)) {
      console.log('Claude projects directory not found:', claudeDir);
      return res.json({ projects: [], count: 0 });
    }
    
    const { readdir, stat } = await import('fs/promises');
    const projectDirs = await readdir(claudeDir);
    
    // Quick filter for directories only
    const projectPromises = projectDirs
      .filter(dir => !dir.startsWith('.'))
      .map(async (projectDir) => {
        try {
          const projectPath = join(claudeDir, projectDir);
          const stats = await stat(projectPath);
          if (!stats.isDirectory()) return null;
          
          // Count session files without reading them
          const sessionFiles = await readdir(projectPath);
          const sessionCount = sessionFiles.filter(f => f.endsWith('.jsonl')).length;
          
          // Just return name, path, and count for quick loading
          return {
            path: projectDir,
            name: projectDir,
            sessionCount: sessionCount,
            lastModified: stats.mtime.getTime()
          };
        } catch {
          return null;
        }
      });
    
    const projects = (await Promise.all(projectPromises)).filter(Boolean);
    projects.sort((a, b) => b.lastModified - a.lastModified);
    
    // Apply pagination
    const totalCount = projects.length;
    const paginatedProjects = projects.slice(offset, offset + limit);
    
    console.log(`Quick loaded ${paginatedProjects.length} of ${totalCount} project names (offset: ${offset}, limit: ${limit})`);
    res.json({ projects: paginatedProjects, count: totalCount });
  } catch (error) {
    console.error('Error quick loading projects:', error);
    res.status(500).json({ error: 'Failed to load projects', details: error.message });
  }
});

// Get sessions for a specific project using Server-Sent Events for streaming
app.get('/claude-project-sessions/:projectName', async (req, res) => {
  // Support pagination with offset and limit query params
  const offset = parseInt(req.query.offset) || 0;
  const limit = parseInt(req.query.limit) || 10;
  try {
    const projectName = decodeURIComponent(req.params.projectName);
    console.log('📂 Loading sessions for project:', projectName);
    
    // Set up Server-Sent Events
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    
    const claudeDir = join(homedir(), '.claude', 'projects');
    const projectPath = join(claudeDir, projectName);
    
    // Check if project directory exists
    if (!existsSync(projectPath)) {
      res.write('data: {"done": true, "sessions": []}\n\n');
      res.end();
      return;
    }
    
    const { readdir, stat, readFile } = await import('fs/promises');
    
    // Get all session files
    const sessionFiles = await readdir(projectPath);
    const jsonlFiles = sessionFiles
      .filter(f => f.endsWith('.jsonl'))
      .slice(0, 50); // Limit to 50 sessions for performance
    
    if (jsonlFiles.length === 0) {
      res.write('data: {"done": true, "sessions": []}\n\n');
      res.end();
      return;
    }
    
    // Get file stats and sort by modification time
    const fileStats = await Promise.all(
      jsonlFiles.map(async (file) => {
        const filePath = join(projectPath, file);
        const stats = await stat(filePath);
        return {
          filename: file,
          path: filePath,
          timestamp: stats.mtime.getTime()
        };
      })
    );
    
    fileStats.sort((a, b) => b.timestamp - a.timestamp);
    
    // Apply pagination
    const paginatedFiles = fileStats.slice(offset, offset + limit);
    
    // Process each file and stream it
    for (let i = 0; i < paginatedFiles.length; i++) {
      const { filename, path: filePath, timestamp } = paginatedFiles[i];
      
      try {
        const sessionId = filename.replace('.jsonl', '');
        let summary = 'Untitled session';
        let title = null;
        let messageCount = 0;
        
        // Read first few lines to get summary
        const content = await readFile(filePath, 'utf8');
        const lines = content.split(/\r?\n/).filter(line => line.trim());
        messageCount = lines.length;
        
        // Try to find summary or title from first few lines
        for (let j = 0; j < Math.min(5, lines.length); j++) {
          try {
            const data = JSON.parse(lines[j]);
            if (data.summary) {
              summary = data.summary;
              break;
            }
            if (data.title) {
              title = data.title;
            }
            // Use first user message as fallback
            if (data.role === 'user' && data.content && summary === 'Untitled session') {
              summary = data.content.slice(0, 100);
              if (data.content.length > 100) summary += '...';
            }
          } catch {}
        }
        
        // Check last line for metadata
        if (lines.length > 0) {
          try {
            const lastData = JSON.parse(lines[lines.length - 1]);
            if (lastData.title) {
              title = lastData.title;
            }
          } catch {}
        }
        
        const session = {
          id: sessionId,
          summary: summary,
          title: title,
          timestamp: timestamp,
          path: filename,
          messageCount: Math.min(messageCount, 50) // Cap reported count at 50
        };
        
        // Stream this session immediately with pagination info
        res.write(`data: ${JSON.stringify({ 
          session, 
          index: offset + i, 
          total: fileStats.length,
          hasMore: (offset + limit) < fileStats.length 
        })}\n\n`);
        console.log(`  📄 Sent session ${offset + i + 1}/${fileStats.length}: ${sessionId}`);
        
      } catch (e) {
        console.log(`Error processing ${filename}:`, e.message);
      }
    }
    
    // Send completion event with pagination info
    res.write(`data: ${JSON.stringify({ 
      done: true, 
      totalCount: fileStats.length,
      hasMore: (offset + limit) < fileStats.length 
    })}\n\n`);
    console.log(`✅ Streamed ${paginatedFiles.length} sessions (offset: ${offset}, total: ${fileStats.length})`);
    res.end();
    
  } catch (error) {
    console.error('Error loading project sessions:', error);
    res.write(`data: {"error": true, "message": "${error.message}"}\n\n`);
    res.end();
  }
});

// Get last modified date for a specific project
app.get('/claude-project-date/:projectName', async (req, res) => {
  try {
    const projectName = decodeURIComponent(req.params.projectName);
    console.log(`📅 Getting date for project: ${projectName}`);
    
    const claudeDir = join(homedir(), '.claude', 'projects');
    const projectPath = join(claudeDir, projectName);
    
    // Check if project exists
    if (!existsSync(projectPath)) {
      return res.json({ projectName, lastModified: Date.now() });
    }
    
    const { readdir, stat } = await import('fs/promises');
    
    // Get the most recent session file
    const sessionFiles = await readdir(projectPath);
    const jsonlFiles = sessionFiles.filter(f => f.endsWith('.jsonl'));
    
    if (jsonlFiles.length === 0) {
      // No sessions, use directory modification time
      const dirStats = await stat(projectPath);
      return res.json({ projectName, lastModified: dirStats.mtime.getTime() });
    }
    
    // Get modification times of all session files
    const fileTimes = await Promise.all(
      jsonlFiles.map(async (file) => {
        const filePath = join(projectPath, file);
        const stats = await stat(filePath);
        return stats.mtime.getTime();
      })
    );
    
    // Return the most recent modification time
    const lastModified = Math.max(...fileTimes);
    const date = new Date(lastModified);
    console.log(`  ✅ ${projectName}: ${date.toLocaleString()}`);
    
    res.json({ projectName, lastModified });
  } catch (error) {
    console.error('Error getting project date:', error);
    res.json({ projectName: req.params.projectName, lastModified: Date.now() });
  }
});

// Get session count for a specific project
app.get('/claude-project-session-count/:projectName', async (req, res) => {
  try {
    const projectName = decodeURIComponent(req.params.projectName);
    
    const claudeDir = join(homedir(), '.claude', 'projects');
    const projectPath = join(claudeDir, projectName);
    
    // Check if project exists
    if (!existsSync(projectPath)) {
      return res.json({ projectName, sessionCount: 0 });
    }
    
    const { readdir } = await import('fs/promises');
    
    // Count .jsonl files
    const sessionFiles = await readdir(projectPath);
    const sessionCount = sessionFiles.filter(f => f.endsWith('.jsonl')).length;
    
    res.json({ projectName, sessionCount });
  } catch (error) {
    console.error('Error getting session count:', error);
    res.json({ projectName: req.params.projectName, sessionCount: 0 });
  }
});

// PID file management - use temp directory for production
// Each server instance gets a unique PID file based on its port
const pidFilePath = process.env.ELECTRON_RUN_AS_NODE 
  ? join(homedir(), `.yurucode-server-${PORT}.pid`)
  : join(__dirname, `server-${PORT}.pid`);

function writePidFile() {
  try {
    writeFileSync(pidFilePath, process.pid.toString());
    console.log(`📝 Server PID ${process.pid} written to ${pidFilePath}`);
  } catch (err) {
    console.log(`⚠️ Could not write PID file (running from read-only location?):`, err.message);
    // Don't fail if we can't write PID file in production
  }
}

function removePidFile() {
  try {
    if (fs.existsSync(pidFilePath)) {
      fs.unlinkSync(pidFilePath);
      console.log(`🗑️ Removed PID file`);
    }
  } catch (err) {
    // Ignore errors when removing PID file
  }
}

// Clean up on exit
process.on('SIGINT', () => {
  console.log('\n🛑 Server shutting down...');
  removePidFile();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Server terminated');
  removePidFile();
  process.exit(0);
});

process.on('exit', () => {
  removePidFile();
});

process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught exception:', error);
  removePidFile();
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled rejection at:', promise, 'reason:', reason);
  removePidFile();
  process.exit(1);
});

// Socket.IO connection handling - EXACTLY LIKE WINDOWS
io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id);

  socket.on('createSession', async (data, callback) => {
    try {
      // Use provided sessionId if resuming, otherwise generate new one
      const sessionId = data.sessionId || `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const isResuming = !!data.sessionId;
      
      if (isResuming) {
        console.log(`🔄 Resuming existing session: ${sessionId}`);
        
        // Check if we already have this session in memory
        if (sessions.has(sessionId)) {
          const existingSession = sessions.get(sessionId);
          console.log(`✅ Session ${sessionId} already exists in memory, updating socket`);
          existingSession.socketId = socket.id;
          
          if (callback) {
            callback({ 
              success: true, 
              sessionId,
              workingDirectory: existingSession.workingDirectory,
              messages: existingSession.messages,
              claudeSessionId: existingSession.claudeSessionId
            });
          }
          return;
        }
        
        // Try to load from disk
        const savedSession = sessionPersistence.loadSession(sessionId);
        if (savedSession) {
          console.log(`📂 Loaded session ${sessionId} from disk, claudeSessionId: ${savedSession.claudeSessionId}`);
          
          // Verify the Claude session still exists
          if (savedSession.claudeSessionId && claudeReader.verifySessionExists(savedSession.claudeSessionId)) {
            console.log(`✅ Claude session ${savedSession.claudeSessionId} verified on disk`);
            
            // Restore session to memory
            const restoredSession = {
              ...savedSession,
              socketId: socket.id,
              wasInterrupted: false
            };
            sessions.set(sessionId, restoredSession);
            
            if (callback) {
              callback({ 
                success: true, 
                sessionId,
                workingDirectory: restoredSession.workingDirectory,
                messages: restoredSession.messages || [],
                claudeSessionId: restoredSession.claudeSessionId
              });
            }
            return;
          } else {
            console.log(`⚠️ Claude session ${savedSession.claudeSessionId} no longer exists, will start fresh`);
          }
        } else {
          console.log(`⚠️ Session ${sessionId} not found on disk`);
        }
      } else {
        console.log(`✨ Creating new session: ${sessionId}`);
      }
      
      // Use provided directory, or home directory as fallback (NOT process.cwd() which would be the app bundle)
      const workingDirectory = data.workingDirectory || homedir();
      
      // CRITICAL FIX: Handle both direct claudeSessionId and nested in options
      let claudeSessionId = null;
      let messages = [];
      let hasGeneratedTitle = false;
      
      // Check for data in different locations (client sends it differently sometimes)
      if (data.claudeSessionId) {
        claudeSessionId = data.claudeSessionId;
        console.log(`🔄 Using direct claudeSessionId: ${claudeSessionId}`);
      } else if (data.options && data.options.claudeSessionId) {
        claudeSessionId = data.options.claudeSessionId;
        console.log(`🔄 Using claudeSessionId from options: ${claudeSessionId}`);
      }
      
      // If we have a claudeSessionId, verify it exists on disk
      if (claudeSessionId && !claudeReader.verifySessionExists(claudeSessionId)) {
        console.log(`⚠️ Claude session ${claudeSessionId} doesn't exist on disk, will start fresh`);
        claudeSessionId = null; // Clear invalid session ID
      }
      
      if (data.messages) {
        messages = data.messages;
      } else if (data.options && data.options.messages) {
        messages = data.options.messages;
      }
      
      if (data.hasGeneratedTitle) {
        hasGeneratedTitle = data.hasGeneratedTitle;
      } else if (data.options && data.options.hasGeneratedTitle) {
        hasGeneratedTitle = data.options.hasGeneratedTitle;
      }
      
      const sessionData = {
        id: sessionId,
        name: data.name || 'new session',
        socketId: socket.id,
        workingDirectory: workingDirectory,
        messages: messages,
        createdAt: Date.now(),
        claudeSessionId: claudeSessionId,
        hasGeneratedTitle: hasGeneratedTitle,
        wasInterrupted: false  // Reset on new connection
      };
      
      sessions.set(sessionId, sessionData);
      
      // Save to disk for persistence
      sessionPersistence.saveSession(sessionId, sessionData);
      
      console.log(`✅ Session created and stored: ${sessionId}`);
      console.log(`📁 Working directory: ${workingDirectory}`);
      console.log(`📊 Total sessions in memory: ${sessions.size}`);
      console.log(`🔍 Session IDs in memory:`, Array.from(sessions.keys()));
      if (sessionData.claudeSessionId) {
        console.log(`🔄 Has claudeSessionId for resumption: ${sessionData.claudeSessionId}`);
      }
      
      if (callback) {
        callback({
          success: true,
          sessionId: sessionId,
          workingDirectory: workingDirectory,
          messages: sessionData.messages,
          claudeSessionId: sessionData.claudeSessionId
        });
      }
    } catch (error) {
      console.error('❌ Error creating session:', error);
      if (callback) {
        callback({
          success: false,
          error: error.message
        });
      }
    }
  });

  socket.on('sendMessage', async (data, callback) => {
    const { sessionId, content: message, model } = data;
    console.log(`📨 sendMessage called for session: ${sessionId}`);
    console.log(`📊 Current sessions in memory: ${sessions.size}`);
    console.log(`🔍 Available session IDs:`, Array.from(sessions.keys()));
    
    let session = sessions.get(sessionId);
    
    if (!session) {
      console.log(`⚠️ Session ${sessionId} not found, creating new session automatically`);
      
      // auto-create a new session for this id
      const workingDirectory = homedir();
      const sessionData = {
        id: sessionId,
        name: 'restored session',
        socketId: socket.id,
        workingDirectory: workingDirectory,
        messages: [],
        createdAt: Date.now(),
        claudeSessionId: null,
        hasGeneratedTitle: false,
        wasInterrupted: false
      };
      
      sessions.set(sessionId, sessionData);
      sessionPersistence.saveSession(sessionId, sessionData);
      session = sessionData;
      
      console.log(`✅ Auto-created session ${sessionId}`);
      console.log(`📁 Working directory: ${workingDirectory}`);
      
      // emit sessionCreated event to client so it knows the session exists
      socket.emit('sessionCreated', {
        sessionId: sessionId,
        workingDirectory: workingDirectory,
        messages: [],
        claudeSessionId: null
      });
    }
    
    // Log the model being used
    console.log(`[${sessionId}] Using model: ${model} (type: ${typeof model})`);
    
    // Queue the request to prevent concurrent spawning issues
    const spawnRequest = async () => {
      try {
        console.log('\n📨 Processing message request:', {
          sessionId,
          messageLength: message?.length || 0,
          model,
          queueLength: processSpawnQueue.length
        });

        // Check if there's an existing process for this session
        if (activeProcesses.has(sessionId)) {
          const existingProcess = activeProcesses.get(sessionId);
          const processStartTime = activeProcessStartTimes.get(sessionId) || Date.now();
          const processAge = Date.now() - processStartTime;
          
          // If process is very young (< 3 seconds), queue this message instead of killing
          if (processAge < 3000) {
            console.log(`⏳ Process for session ${sessionId} is only ${processAge}ms old, queueing message instead of killing`);
            
            // Send a status message to the client
            socket.emit(`message:${sessionId}`, {
              type: 'system',
              subtype: 'info',
              message: 'processing previous message, will send yours next...',
              timestamp: Date.now()
            });
            
            // Re-queue this request to try again later
            setTimeout(() => {
              processSpawnQueue.push(spawnRequest);
              processNextInQueue();
            }, 2000);
            
            // Exit early without processing this message yet
            return;
          }
          
          console.log(`⚠️ Killing existing process for session ${sessionId} (PID: ${existingProcess.pid}, age: ${processAge}ms)`);
          
          // Kill the entire process group if on Unix
          if (process.platform !== 'win32' && existingProcess.pid) {
            try {
              process.kill(-existingProcess.pid, 'SIGINT'); // Negative PID kills process group
            } catch (e) {
              // Fallback to regular kill
              existingProcess.kill('SIGINT');
            }
          } else {
            existingProcess.kill('SIGINT');
          }
          
          activeProcesses.delete(sessionId);
          activeProcessStartTimes.delete(sessionId);
          
          // Mark session as interrupted since we killed the process - but KEEP claudeSessionId
          session.wasInterrupted = true;
          // CRITICAL: Never clear claudeSessionId during interruption - Claude Code preserves sessions
          console.log(`🔄 Marked session ${sessionId} as interrupted while preserving claudeSessionId for seamless resume: ${session.claudeSessionId}`);
          
          // CRITICAL FIX: Clear any streaming assistant messages immediately when killing process
          const lastAssistantMessageId = lastAssistantMessageIds.get(sessionId);
          if (lastAssistantMessageId) {
            console.log(`🔴 Immediately clearing streaming state for assistant message ${lastAssistantMessageId} on process kill`);
            socket.emit(`message:${sessionId}`, {
              type: 'assistant',
              id: lastAssistantMessageId,
              streaming: false,
              timestamp: Date.now()
            });
            lastAssistantMessageIds.delete(sessionId);
          }
          
          // Wait a bit for the process to fully terminate
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        // The streaming state was cleared above when we killed the process

        // Use session's working directory, fallback to home directory (NOT process.cwd() in bundled app)
        let processWorkingDir = session.workingDirectory || homedir();
        console.log(`📂 Using working directory: ${processWorkingDir}`);

      // Build the claude command - EXACTLY LIKE WINDOWS BUT WITH MACOS FLAGS
      const args = [
        '--print',
        '--output-format', 'stream-json', 
        '--verbose', 
        '--dangerously-skip-permissions',
        '--append-system-prompt', 'CRITICAL: you are in yurucode ui. ALWAYS: use all lowercase (no capitals ever), be extremely concise, never use formal language, no greetings/pleasantries, straight to the point, code/variables keep proper case, one line answers preferred'
      ];
      
      // Add model flag if specified
      if (model) {
        args.push('--model', model);
        console.log(`🤖 Using model: ${model}`);
      }
      
      // CRITICAL FIX: Always try to resume if we have a claudeSessionId
      // Claude Code maintains sessions across interruptions - only start fresh if session is explicitly cleared
      if (session.claudeSessionId) {
        args.push('--resume', session.claudeSessionId);
        console.log('🔄 Using --resume flag with session:', session.claudeSessionId);
        console.log('🔄 This matches Claude Code behavior - sessions persist across interruptions');
      } else {
        console.log('📝 Starting fresh conversation (no previous Claude session ID)');
      }
      
      // Reset the interrupted flag regardless - it's only used for user feedback
      if (session.wasInterrupted) {
        session.wasInterrupted = false;
        console.log('🔄 Reset interrupted flag while preserving session for --resume');
      }

      // Spawn claude process with proper PATH for Node.js
      console.log(`🚀 Spawning claude with args:`, args);
      console.log(`🔍 Active processes count: ${activeProcesses.size}`);
      
      // Ensure Node.js is in PATH for Claude CLI (which uses #!/usr/bin/env node)
      const enhancedEnv = { ...process.env };
      const nodeBinDir = '/opt/homebrew/bin';
      if (!enhancedEnv.PATH?.includes(nodeBinDir)) {
        enhancedEnv.PATH = `${nodeBinDir}:${enhancedEnv.PATH || '/usr/bin:/bin'}`;
        console.log(`🔧 Added ${nodeBinDir} to PATH for Claude CLI`);
      }
      
      // Add unique session identifier to environment to ensure isolation
      enhancedEnv.CLAUDE_SESSION_ID = sessionId;
      enhancedEnv.CLAUDE_INSTANCE = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Explicitly set PWD environment variable for Claude's bash commands
      enhancedEnv.PWD = processWorkingDir;
      enhancedEnv.HOME = homedir(); // Ensure HOME is set correctly
      console.log(`🔧 Set PWD=${processWorkingDir} and HOME=${homedir()} in environment`);
      
      // Remove artificial delay - handle race conditions properly instead
      if (isSpawningProcess) {
        console.log(`⏳ Another Claude process is initializing...`);
      }
      
      isSpawningProcess = true;
      
      // Ensure the directory exists before spawning
      if (!existsSync(processWorkingDir)) {
        console.warn(`⚠️ Working directory does not exist: ${processWorkingDir}, using home directory`);
        processWorkingDir = homedir();
      }
      
      const spawnOptions = {
        cwd: processWorkingDir,
        env: enhancedEnv,
        shell: false,
        windowsHide: true,  // Always hide windows
        detached: true,  // Run in separate process group for better isolation
        stdio: ['pipe', 'pipe', 'pipe']  // Explicit stdio configuration
      };
      
      console.log(`🚀 Spawning claude process with options:`, {
        cwd: spawnOptions.cwd,
        claudePath: CLAUDE_PATH,
        args: args
      });
      
      const claudeProcess = isWindows && CLAUDE_PATH === 'WSL_CLAUDE' ? 
        (() => {
          // Convert Windows path to WSL path if needed
          let wslWorkingDir = processWorkingDir;
          if (processWorkingDir && processWorkingDir.match(/^[A-Z]:\\/)) {
            const driveLetter = processWorkingDir[0].toLowerCase();
            const pathWithoutDrive = processWorkingDir.substring(2).replace(/\\/g, '/');
            wslWorkingDir = `/mnt/${driveLetter}${pathWithoutDrive}`;
            console.log(`📂 Converted Windows path to WSL: ${processWorkingDir} -> ${wslWorkingDir}`);
          }
          
          const [wslCommand, wslArgs] = createWslClaudeCommand(args, wslWorkingDir);
          console.log(`🚀 Running WSL command: wsl.exe -e bash -c`);
          console.log(`🚀 WSL bash command (first 500 chars):`, wslArgs[2].substring(0, 500));
          
          return spawn(wslCommand, wslArgs, spawnOptions);
        })() :
        spawn(CLAUDE_PATH, args, spawnOptions);
      
      // Mark spawning as complete after a short delay
      setTimeout(() => {
        isSpawningProcess = false;
      }, 500);

      // Store process reference and start time
      activeProcesses.set(sessionId, claudeProcess);
      activeProcessStartTimes.set(sessionId, Date.now());
      
      // On Unix systems, detached processes need special handling
      if (process.platform !== 'win32') {
        claudeProcess.unref(); // Allow parent to exit independently
      }

      // Send input if not resuming - handle WSL differently
      if (message) {
        // Check for ultrathink command
        let messageToSend = message;
        if (message.trim().toLowerCase() === 'ultrathink' || message.trim().toLowerCase() === 'ultrathink.') {
          // Transform ultrathink into a prompt that triggers extended thinking
          messageToSend = `I need you to engage in deep, extended thinking about a complex problem. Show your complete thought process.

Think step by step through this problem:
"What are the most interesting and non-obvious connections between quantum mechanics, consciousness, and information theory? Explore multiple perspectives and challenge conventional assumptions."

Use <thinking> tags extensively to show your reasoning process.`;
          console.log(`🧠 ULTRATHINK mode activated - triggering extended thinking demonstration`);
        }
        
        messageToSend = messageToSend + '\n';
        console.log(`📝 Sending message to claude (${messageToSend.length} chars)`);
        
        // For WSL, we need to be more careful with stdin
        if (isWindows && CLAUDE_PATH === 'WSL_CLAUDE') {
          // Write in chunks to avoid buffer issues with WSL
          const chunkSize = 4096;
          let offset = 0;
          
          const writeNextChunk = () => {
            if (offset < messageToSend.length) {
              const chunk = messageToSend.substring(offset, offset + chunkSize);
              claudeProcess.stdin.write(chunk, (err) => {
                if (err) {
                  console.error(`❌ Error writing to stdin:`, err);
                  claudeProcess.stdin.end();
                } else {
                  offset += chunkSize;
                  // Small delay between chunks for WSL
                  setTimeout(writeNextChunk, 10);
                }
              });
            } else {
              claudeProcess.stdin.end();
            }
          };
          
          // Add delay for WSL to ensure bash script starts
          setTimeout(writeNextChunk, 500);
        } else {
          // Normal operation for macOS/Linux
          claudeProcess.stdin.write(messageToSend);
          claudeProcess.stdin.end();
        }
      }
      
      // Generate title with Sonnet (fire and forget) - only for first message
      console.log(`🏷️ Title check: hasGeneratedTitle=${session.hasGeneratedTitle}, messageLength=${message?.length}`);
      if (!session.hasGeneratedTitle && message && message.length > 5) {
        // Extract only text content (no attachments)
        let textContent = message;
        try {
          // Check if content is JSON array (with attachments)
          const parsed = JSON.parse(message);
          if (Array.isArray(parsed)) {
            // Find text blocks only
            const textBlocks = parsed.filter(block => block.type === 'text');
            textContent = textBlocks.map(block => block.text).join(' ');
            console.log(`🏷️ Extracted text from JSON: "${textContent.substring(0, 50)}..."`);
          }
        } catch (e) {
          // Not JSON, use as-is (plain text message)
          console.log(`🏷️ Using plain text content: "${textContent.substring(0, 50)}..."`);
        }
        
        // Only generate title if we have actual text content
        if (textContent && textContent.trim().length > 5) {
          console.log(`🏷️ Calling generateTitle for session ${sessionId}`);
          // Only mark as generated after successful generation
          generateTitle(sessionId, textContent, socket, () => {
            console.log(`🏷️ Title successfully generated for session ${sessionId}`);
            session.hasGeneratedTitle = true;
          });
          // Add retry logic if title generation fails
          setTimeout(() => {
            if (!session.hasGeneratedTitle) {
              console.log(`🏷️ Retrying title generation for session ${sessionId}`);
              generateTitle(sessionId, textContent, socket, () => {
                session.hasGeneratedTitle = true;
              });
            }
          }, 5000); // Retry after 5 seconds if first attempt fails
        } else {
          console.log(`🏷️ Skipping title generation - text too short: "${textContent}"`);
        }
      }

      // Process streaming output - EXACTLY LIKE WINDOWS
      let lineBuffer = '';
      let messageCount = 0;
      let bytesReceived = 0;
      let lastDataTime = Date.now();
      let streamStartTime = Date.now();
      
      // Cleanup any existing health check for this session
      if (streamHealthChecks.has(sessionId)) {
        clearInterval(streamHealthChecks.get(sessionId));
      }
      // No timeouts to clear anymore
      
      // Log stream health check every 5 seconds
      const streamHealthInterval = setInterval(() => {
        const timeSinceLastData = Date.now() - lastDataTime;
        const streamDuration = Date.now() - streamStartTime;
        console.log(`🩺 [${sessionId}] duration: ${streamDuration}ms | since_last: ${timeSinceLastData}ms | bytes: ${bytesReceived} | msgs: ${messageCount} | buffer: ${lineBuffer.length} | alive: ${activeProcesses.has(sessionId)}`);
        
        if (timeSinceLastData > 15000) {
          // Send keepalive more frequently to prevent any timeouts
          socket.emit(`keepalive:${sessionId}`, { timestamp: Date.now() });
        }
        if (timeSinceLastData > 60000) {
          console.log(`⏳ Long operation in progress - ${timeSinceLastData}ms since last data`);
        }
        if (timeSinceLastData > 300000) {
          console.log(`⏳ Very long operation - ${Math.floor(timeSinceLastData/60000)} minutes since last data`);
        }
        // NEVER kill process due to timeout - let it run forever if needed
      }, 5000);
      
      // Store health check interval for cleanup
      streamHealthChecks.set(sessionId, streamHealthInterval);
      
      // NO TIMEOUT AT ALL - sessions run forever
      // Don't even track timeouts
      
      const processStreamLine = (line) => {
        if (!line.trim()) {
          console.log(`🔸 [${sessionId}] Empty line received`);
          return;
        }
        
        console.log(`🔹 [${sessionId}] Processing line (${line.length} chars): ${line.substring(0, 100)}...`);
        
        try {
          const jsonData = JSON.parse(line);
          console.log(`📦 [${sessionId}] Message type: ${jsonData.type}${jsonData.subtype ? ` (${jsonData.subtype})` : ''}`);
          
          // Extract session ID if present (update it every time to ensure we have the latest)
          if (jsonData.session_id) {
            session.claudeSessionId = jsonData.session_id;
            console.log(`📌 [${sessionId}] Claude session ID: ${session.claudeSessionId}`);
            // Save session to disk when we get the Claude session ID
            sessionPersistence.saveSession(sessionId, session);
          }
          
          // Handle different message types - EXACTLY LIKE WINDOWS
          if (jsonData.type === 'system' && jsonData.subtype === 'init') {
            // Send system init message
            socket.emit(`message:${sessionId}`, {
              type: 'system',
              subtype: 'init',
              message: jsonData,
              timestamp: Date.now()
            });
            
          } else if (jsonData.type === 'assistant') {
            // Each assistant message should be separate to preserve all content
            const messageId = `assistant-${sessionId}-${Date.now()}-${Math.random()}`;
            
            // Extract content from assistant message
            if (jsonData.message?.content) {
              let hasContent = false;
              let contentBlocks = [];
              let hasToolUse = false;
              
              // Check what content we have and preserve all blocks
              for (const block of jsonData.message.content) {
                if (block.type === 'text' || block.type === 'thinking') {
                  hasContent = true;
                  contentBlocks.push(block);
                } else if (block.type === 'tool_use') {
                  hasToolUse = true;
                  // Send tool use as separate message immediately
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
              
              // Send assistant message with all non-tool content blocks (text + thinking)
              if (hasContent && contentBlocks.length > 0) {
                lastAssistantMessageIds.set(sessionId, messageId); // Track this message ID
                console.log(`📝 [${sessionId}] Emitting assistant message ${messageId} with streaming=true`);
                console.log(`📝 [${sessionId}] Content blocks: ${contentBlocks.length} (types: ${contentBlocks.map(b => b.type).join(', ')})`);
                socket.emit(`message:${sessionId}`, {
                  type: 'assistant',
                  message: { content: contentBlocks },  // Send full content blocks array
                  streaming: true,  // Set streaming to true during active streaming
                  id: messageId,
                  timestamp: Date.now()
                });
                
                // Save to session with memory management
                session.messages.push({
                  type: 'assistant',
                  message: { content: contentBlocks },
                  id: messageId,
                  timestamp: Date.now()
                });
                
                // Trim message history if too large
                if (session.messages.length > MAX_MESSAGE_HISTORY) {
                  const trimCount = Math.floor(MAX_MESSAGE_HISTORY * 0.2); // Remove 20%
                  session.messages.splice(0, trimCount);
                  console.log(`🧹 Trimmed ${trimCount} old messages from session ${sessionId}`);
                }
                
                messageCount++;
              } else if (hasToolUse && !hasContent) {
                // If there's only tool uses and no text/thinking, skip assistant message
                console.log('Assistant message with only tool uses, skipping text message');
              }
            }
            
          } else if (jsonData.type === 'user' && jsonData.message?.content) {
            // Handle tool results from user messages
            for (const block of jsonData.message.content) {
              if (block.type === 'tool_result') {
                socket.emit(`message:${sessionId}`, {
                  type: 'tool_result',
                  message: {
                    tool_use_id: block.tool_use_id,
                    content: block.content,
                    is_error: block.is_error
                  },
                  timestamp: Date.now(),
                  id: `toolresult-${sessionId}-${Date.now()}`
                });
              }
            }
            
          } else if (jsonData.type === 'result') {
            console.log(`📦 Message type: result`);
            console.log(`   ✅ Result: success=${!jsonData.is_error}, duration=${jsonData.duration_ms}ms`);
            
            // Log usage/cost information if present
            if (jsonData.usage) {
              console.log(`\n📊 TOKEN USAGE FROM CLAUDE CLI:`);
              console.log(`   input_tokens: ${jsonData.usage.input_tokens || 0}`);
              console.log(`   output_tokens: ${jsonData.usage.output_tokens || 0}`);
              console.log(`   cache_creation_input_tokens: ${jsonData.usage.cache_creation_input_tokens || 0}`);
              console.log(`   cache_read_input_tokens: ${jsonData.usage.cache_read_input_tokens || 0}`);
            }
            
            // If we have a last assistant message, send an update to mark it as done streaming
            const lastAssistantMessageId = lastAssistantMessageIds.get(sessionId);
            if (lastAssistantMessageId) {
              console.log(`✅ Marking assistant message ${lastAssistantMessageId} as streaming=false (result received)`);
              const session = sessions.get(sessionId);
              const lastAssistantMsg = session?.messages.find(m => m.id === lastAssistantMessageId);
              
              socket.emit(`message:${sessionId}`, {
                type: 'assistant',
                id: lastAssistantMessageId,
                message: lastAssistantMsg?.message || { content: '' },
                streaming: false,
                timestamp: Date.now()
              });
              lastAssistantMessageIds.delete(sessionId); // Reset
            }
            
            // Just send the result message with model info
            // Model is available from the outer scope (sendMessage handler)
            console.log(`✅ [${sessionId}] Sending result message with model: ${model}`);
            const resultMessage = {
              type: 'result',
              ...jsonData,
              streaming: false,
              id: `result-${sessionId}-${Date.now()}`,
              model: model || 'unknown' // Use model from outer scope directly
            };
            console.log(`   - Model in result message: ${resultMessage.model}`);
            socket.emit(`message:${sessionId}`, resultMessage);
            messageCount++;
          }
          
        } catch (e) {
          // Not JSON, treat as plain text
          console.log(`⚠️ [${sessionId}] Failed to parse JSON, treating as plain text:`, e.message);
          console.log(`⚠️ [${sessionId}] Line was: ${line}`);
        }
      };

      // Handle stdout
      claudeProcess.stdout.on('data', (data) => {
        const str = data.toString();
        bytesReceived += data.length;
        lastDataTime = Date.now();
        
        console.log(`📥 [${sessionId}] STDOUT received: ${str.length} bytes (total: ${bytesReceived})`);
        console.log(`📥 [${sessionId}] Data preview: ${str.substring(0, 200).replace(/\n/g, '\\n')}...`);
        
        // CIRCULAR BUFFER - keep only recent data to prevent overflow
        if (lineBuffer.length > MAX_LINE_BUFFER_SIZE) {
          console.warn(`⚠️ [${sessionId}] Buffer approaching limit (${lineBuffer.length} bytes), using circular buffer`);
          // Keep only the last 80% of the buffer
          const keepSize = Math.floor(MAX_LINE_BUFFER_SIZE * 0.8);
          const newlineIndex = lineBuffer.lastIndexOf('\n', lineBuffer.length - keepSize);
          if (newlineIndex > 0) {
            // Process everything before the cutoff
            const toProcess = lineBuffer.substring(0, newlineIndex);
            const lines = toProcess.split('\n');
            for (const line of lines) {
              if (line.trim()) {
                try {
                  processStreamLine(line);
                } catch (e) {
                  console.error(`[${sessionId}] Failed to process line during rotation:`, e);
                }
              }
            }
            // Keep only recent data
            lineBuffer = lineBuffer.substring(newlineIndex + 1);
            console.log(`⚠️ [${sessionId}] Rotated buffer, kept ${lineBuffer.length} bytes`);
          } else {
            // Emergency clear if no newline found
            console.error(`⚠️ [${sessionId}] Emergency buffer clear`);
            lineBuffer = '';
          }
        }
        
        lineBuffer += str;
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() || '';
        
        console.log(`📋 [${sessionId}] Split into ${lines.length} lines, buffer remaining: ${lineBuffer.length} chars`);
        
        for (let i = 0; i < lines.length; i++) {
          console.log(`📋 [${sessionId}] Processing line ${i + 1}/${lines.length}`);
          processStreamLine(lines[i]);
        }
      });

      // Handle stderr
      claudeProcess.stderr.on('data', (data) => {
        const error = data.toString();
        console.error(`⚠️ [${sessionId}] Claude stderr (${data.length} bytes):`, error);
        lastDataTime = Date.now();
        
        // Check if this is a "No conversation found" error
        if (error.includes('No conversation found with session ID')) {
          console.log(`🔄 Resume failed - Claude session ${session.claudeSessionId} no longer exists`);
          
          // IMPORTANT: Only clear session ID if Claude definitively says it doesn't exist
          // This preserves session resumption for temporary network issues
          session.claudeSessionId = null;
          session.wasInterrupted = false;
          
          // Add a user-friendly info message
          console.log(`🔄 Will start fresh conversation - previous session expired`);
        } else {
          // Emit other errors to client
          socket.emit(`message:${sessionId}`, { 
            type: 'error',
            error, 
            claudeSessionId: session.claudeSessionId,
            streaming: false 
          });
        }
      });

      // Handle process exit
      claudeProcess.on('close', (code) => {
        // Clean up all tracking for this session
        if (streamHealthChecks.has(sessionId)) {
          clearInterval(streamHealthChecks.get(sessionId));
          streamHealthChecks.delete(sessionId);
        }
        // No timeouts to clean up
        clearInterval(streamHealthInterval);
        const streamDuration = Date.now() - streamStartTime;
        console.log(`👋 [${sessionId}] Claude process exited with code ${code}`);
        console.log(`📊 [${sessionId}] STREAM SUMMARY:`);
        console.log(`   ├─ Total duration: ${streamDuration}ms`);
        console.log(`   ├─ Total bytes: ${bytesReceived}`);
        console.log(`   ├─ Messages: ${messageCount}`);
        console.log(`   └─ Exit code: ${code}`);
        activeProcesses.delete(sessionId);
        activeProcessStartTimes.delete(sessionId);
        
        // Mark session as completed (not interrupted) when process exits normally
        if (code === 0) {
          const session = sessions.get(sessionId);
          if (session) {
            session.wasInterrupted = false;
            sessionPersistence.saveSession(sessionId, session);
            console.log(`✅ Marked session ${sessionId} as completed normally and saved to disk`);
          }
        } else if (code === 1) {
          // Exit code 1 can mean --resume failed, but could also be other issues
          const session = sessions.get(sessionId);
          if (session && session.claudeSessionId) {
            console.log(`⚠️ Process exited with code 1 - preserving session ID for retry (${session.claudeSessionId})`);
            // CONSERVATIVE: Don't clear session ID on exit code 1 - let next attempt decide
            // session.claudeSessionId = null;
            session.wasInterrupted = true; // Mark as interrupted for user feedback
          }
        }
        
        // Process any remaining buffer
        if (lineBuffer.trim()) {
          try {
            processStreamLine(lineBuffer);
          } catch (e) {
            console.error('Failed to process remaining buffer:', e);
          }
        }
        
        // ALWAYS clear streaming state on process exit - send complete message update
        const lastAssistantMessageId = lastAssistantMessageIds.get(sessionId);
        if (lastAssistantMessageId) {
          console.log(`🔴 Forcing streaming=false for assistant message ${lastAssistantMessageId} on process exit`);
          // Get the last assistant message to preserve its content
          const session = sessions.get(sessionId);
          const lastAssistantMsg = session?.messages.find(m => m.id === lastAssistantMessageId);
          
          socket.emit(`message:${sessionId}`, {
            type: 'assistant',
            id: lastAssistantMessageId,
            message: lastAssistantMsg?.message || { content: '' },
            streaming: false,
            timestamp: Date.now()
          });
          lastAssistantMessageIds.delete(sessionId);
        }
        
        // Always ensure streaming is marked as false for all messages
        socket.emit(`message:${sessionId}`, {
          type: 'system',
          subtype: 'stream_end',
          streaming: false,
          timestamp: Date.now()
        });
        
        // Handle unexpected exit codes
        if (code === null || code === -2 || code === 'SIGKILL') {
          console.error(`⚠️ Claude process terminated unexpectedly (code: ${code})`);
          socket.emit(`message:${sessionId}`, {
            type: 'error',
            error: 'session terminated unexpectedly. you can resume by sending another message.',
            streaming: false,
            timestamp: Date.now()
          });
        } else if (code !== 0) {
          console.error(`Claude process failed with exit code ${code}`);
          socket.emit(`message:${sessionId}`, {
            type: 'system',
            subtype: 'info',
            message: `process completed with code ${code}`,
            timestamp: Date.now()
          });
        }
      });

      // Handle process errors
      claudeProcess.on('error', (err) => {
        // Clean up all tracking for this session
        if (streamHealthChecks.has(sessionId)) {
          clearInterval(streamHealthChecks.get(sessionId));
          streamHealthChecks.delete(sessionId);
        }
        // No timeouts to clean up
        clearInterval(streamHealthInterval);
        console.error(`❌ [${sessionId}] Failed to spawn claude:`, err);
        console.error(`❌ [${sessionId}] Error details:`, {
          message: err.message,
          code: err.code,
          syscall: err.syscall,
          path: err.path
        });
        
        // Clean up any streaming state - send complete message update
        const lastAssistantMessageId = lastAssistantMessageIds.get(sessionId);
        if (lastAssistantMessageId) {
          console.log(`🔴 Forcing streaming=false for assistant message ${lastAssistantMessageId} on process error`);
          const session = sessions.get(sessionId);
          const lastAssistantMsg = session?.messages.find(m => m.id === lastAssistantMessageId);
          
          socket.emit(`message:${sessionId}`, {
            type: 'assistant',
            id: lastAssistantMessageId,
            message: lastAssistantMsg?.message || { content: '' },
            streaming: false,
            timestamp: Date.now()
          });
        }
        
        socket.emit(`message:${sessionId}`, { 
          type: 'error',
          error: `claude process error: ${err.message}. try sending your message again.`, 
          claudeSessionId: session.claudeSessionId,
          streaming: false 
        });
        
        activeProcesses.delete(sessionId);
        activeProcessStartTimes.delete(sessionId);
        lastAssistantMessageIds.delete(sessionId);
        if (callback) callback({ success: false, error: err.message });
      });

        // Send success callback
        if (callback) callback({ success: true });

      } catch (error) {
        console.error('❌ Error in spawnRequest:', error);
        socket.emit(`message:${sessionId}`, { 
          type: 'error',
          error: error.message, 
          claudeSessionId: session.claudeSessionId,
          streaming: false 
        });
        if (callback) callback({ success: false, error: error.message });
      } finally {
        // Process next request in queue
        processNextInQueue();
      }
    };
    
    // Add to queue and process
    processSpawnQueue.push(spawnRequest);
    console.log(`📋 Added request to queue. Queue length: ${processSpawnQueue.length}`);
    
    // Process queue if not already processing
    if (processSpawnQueue.length === 1) {
      processNextInQueue();
    }
  });
  
  // Helper function to process spawn queue
  function processNextInQueue() {
    if (processSpawnQueue.length > 0) {
      const nextRequest = processSpawnQueue.shift();
      console.log(`🔄 Processing next spawn request. Remaining in queue: ${processSpawnQueue.length}`);
      nextRequest();
    }
  }

  socket.on('interrupt', ({ sessionId }) => {
    const process = activeProcesses.get(sessionId);
    const session = sessions.get(sessionId);
    if (process) {
      console.log(`🛑 Killing claude process for session ${sessionId} (PID: ${process.pid})`);
      
      // Kill the entire process group if on Unix
      if (process.platform !== 'win32' && process.pid) {
        try {
          process.kill(-process.pid, 'SIGINT'); // Negative PID kills process group
        } catch (e) {
          // Fallback to regular kill
          process.kill('SIGINT');
        }
      } else {
        process.kill('SIGINT');  // Use SIGINT for graceful interrupt
      }
      
      activeProcesses.delete(sessionId);
      activeProcessStartTimes.delete(sessionId);
      
      // Mark session as interrupted but keep the session ID for potential resume
      if (session) {
        session.wasInterrupted = true;
        console.log(`🔄 Marked session ${sessionId} as interrupted`);
      }
      
      // If we have a last assistant message, mark it as done streaming
      const lastAssistantMessageId = lastAssistantMessageIds.get(sessionId);
      if (lastAssistantMessageId) {
        socket.emit(`message:${sessionId}`, {
          type: 'assistant',
          id: lastAssistantMessageId,
          streaming: false,
          timestamp: Date.now()
        });
        lastAssistantMessageIds.delete(sessionId);
      }
      
      socket.emit(`message:${sessionId}`, {
        type: 'system',
        subtype: 'interrupted',
        message: 'task interrupted by user',
        timestamp: Date.now()
      });
    }
  });
  
  socket.on('clearSession', ({ sessionId }) => {
    let session = sessions.get(sessionId);
    if (!session) {
      console.log(`⚠️ Session not found: ${sessionId}`);
      // Instead of returning, create a new session
      console.log(`⚠️ Creating new session for ${sessionId} on clearSession`);
      
      const workingDirectory = homedir();
      session = {
        id: sessionId,
        name: 'cleared session',
        socketId: socket.id,
        workingDirectory: workingDirectory,
        messages: [],
        createdAt: Date.now(),
        claudeSessionId: null,
        hasGeneratedTitle: false,
        wasInterrupted: false
      };
      
      sessions.set(sessionId, session);
      sessionPersistence.saveSession(sessionId, session);
      console.log(`✅ Auto-created session ${sessionId} for clearSession`);
    }
    
    // Kill any active process
    const process = activeProcesses.get(sessionId);
    if (process) {
      console.log(`🛑 Killing process for cleared session ${sessionId}`);
      process.kill('SIGINT');
      activeProcesses.delete(sessionId);
      activeProcessStartTimes.delete(sessionId);
    }
    
    // Clear the session data but keep the session alive
    session.messages = [];
    session.claudeSessionId = null;  // ONLY clear claudeSessionId on explicit clear context
    session.hasGeneratedTitle = false;  // Reset title generation flag so next message gets a new title
    session.wasInterrupted = false;  // Reset interrupted flag
    
    console.log(`🧹 [SERVER] Cleared session ${sessionId} - next message will start fresh Claude conversation`);
    
    // Update saved session on disk
    sessionPersistence.saveSession(sessionId, session);
    
    // Clear any tracked assistant message IDs and ensure streaming is false
    const lastAssistantMessageId = lastAssistantMessageIds.get(sessionId);
    if (lastAssistantMessageId) {
      console.log(`🔴 Clearing streaming state for assistant message ${lastAssistantMessageId} on session clear`);
      socket.emit(`message:${sessionId}`, {
        type: 'assistant',
        id: lastAssistantMessageId,
        streaming: false,
        timestamp: Date.now()
      });
    }
    lastAssistantMessageIds.delete(sessionId);  // Clear any tracked assistant message IDs
    
    console.log(`✅ Session ${sessionId} cleared - will start fresh Claude session on next message`);
    
    // Send clear confirmation
    socket.emit(`message:${sessionId}`, {
      type: 'system',
      subtype: 'clear',
      message: 'session cleared',
      timestamp: Date.now()
    });
    
    // Emit title reset
    const eventName = `title:${sessionId}`;
    console.log(`🏷️ Emitting title reset for cleared session: ${eventName}`);
    socket.emit(eventName, { title: 'new session' });
  });
  
  socket.on('deleteSession', async (data, callback) => {
    const { sessionId } = data;
    sessions.delete(sessionId);
    lastAssistantMessageIds.delete(sessionId);  // Clean up tracking
    callback({ success: true });
  });

  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected:', socket.id);
    // Clean up any processes and intervals associated with this socket
    for (const [sessionId, session] of sessions.entries()) {
      if (session.socketId === socket.id) {
        // Clean up health checks and timeouts
        if (streamHealthChecks.has(sessionId)) {
          clearInterval(streamHealthChecks.get(sessionId));
          streamHealthChecks.delete(sessionId);
        }
        // No timeouts to clean up
        
        const process = activeProcesses.get(sessionId);
        if (process) {
          console.log(`🧹 Cleaning up process for session ${sessionId}`);
          process.kill('SIGINT');
          activeProcesses.delete(sessionId);
          activeProcessStartTimes.delete(sessionId);
        }
        lastAssistantMessageIds.delete(sessionId);
      }
    }
  });
});

// PERIODIC SESSION BACKUP
function backupSessions() {
  try {
    const sessionData = Array.from(sessions.entries()).map(([id, session]) => ({
      id,
      claudeSessionId: session.claudeSessionId,
      messageCount: session.messages.length,
      hasGeneratedTitle: session.hasGeneratedTitle,
      wasInterrupted: session.wasInterrupted,
      model: session.model
    }));
    // In production, write to disk - for now just log
    if (sessionData.length > 0) {
      console.log(`💾 Backing up ${sessionData.length} sessions (${sessionData.map(s => s.messageCount).reduce((a,b) => a+b, 0)} total messages)`);
    }
  } catch (e) {
    console.error('Failed to backup sessions:', e);
  }
}

// Start periodic backups
sessionBackupInterval = setInterval(backupSessions, SESSION_BACKUP_INTERVAL);

// Cleanup on exit
process.on('exit', () => {
  if (sessionBackupInterval) {
    clearInterval(sessionBackupInterval);
  }
  backupSessions(); // Final backup on exit
});

// Start server with error handling
httpServer.listen(PORT, () => {
  writePidFile();
  console.log(`🚀 yurucode server running on port ${PORT}`);
  console.log(`📂 Working directory: ${process.cwd()}`);
  console.log(`🖥️ Platform: ${platform()}`);
  console.log(`🏠 Home directory: ${homedir()}`);
  console.log(`📁 Claude projects: ${join(homedir(), '.claude', 'projects')}`);
  
  // Check if Claude projects directory exists and is accessible
  const projectsDir = join(homedir(), '.claude', 'projects');
  if (existsSync(projectsDir)) {
    console.log('✅ Claude projects directory exists');
    try {
      const { readdirSync } = require('fs');
      const projects = readdirSync(projectsDir);
      console.log(`📊 Found ${projects.length} project directory(s)`);
      if (projects.length > 0 && platform() === 'win32') {
        console.log('🔍 Sample project paths (first 3):');
        projects.slice(0, 3).forEach(p => {
          console.log(`  - ${p}`);
          // Check if it looks like a Windows path that needs conversion
          if (p.match(/^[A-Z]--/)) {
            const converted = p.replace(/^([A-Z])--/, '$1:/').replace(/-/g, '/');
            console.log(`    → Would convert to: ${converted}`);
          }
        });
      }
    } catch (e) {
      console.log('⚠️ Could not list projects:', e.message);
    }
  } else {
    console.log('⚠️ Claude projects directory not found at:', projectsDir);
  }
  
  console.log(`✅ Server configured for ${platform() === 'win32' ? 'Windows' : platform()}`);
  
  // Warmup bash command to prevent focus loss on first run
  console.log('🔥 Warming up bash execution...');
  const warmupCmd = spawn('echo', ['warmup'], {
    shell: false,
    stdio: 'pipe'
  });
  warmupCmd.on('close', () => {
    console.log('✅ Bash warmup complete');
  });
  warmupCmd.on('error', (err) => {
    console.warn('⚠️ Bash warmup failed:', err.message);
  });
});

// Handle port already in use error
httpServer.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use`);
    console.log('Attempting to kill existing process and retry...');
    
    // Try to kill any existing Node.js servers on this port
    const { exec } = require('child_process');
    exec(`lsof -ti :${PORT} | xargs kill -9`, (err) => {
      if (!err) {
        console.log('Killed existing process, retrying in 1 second...');
        setTimeout(() => {
          httpServer.listen(PORT);
        }, 1000);
      } else {
        console.error('Failed to kill existing process. Please restart the app.');
        process.exit(1);
      }
    });
  } else {
    console.error('Server error:', error);
    process.exit(1);
  }
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
    #[cfg(not(target_os = "macos"))]
    {
        info!("Starting embedded server on port {}", port);
        clear_log(); // Clear logs from previous run
        write_log("=== Starting embedded server ===");
        
        // Create temp directory for server
        let server_dir = std::env::temp_dir().join("yurucode-server");
        let _ = fs::create_dir_all(&server_dir);
        
        // Write embedded server to temp as CommonJS
        let server_path = server_dir.join("server.cjs");
        if let Err(e) = fs::write(&server_path, EMBEDDED_SERVER) {
            info!("Failed to write server: {}", e);
            return;
        }
        
        // Write package.json for dependencies
        let package_json = r#"{
  "name": "yurucode-server",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "express": "^4.18.2",
    "socket.io": "^4.6.1",
    "cors": "^2.8.5"
  }
}"#;
        let package_path = server_dir.join("package.json");
        if let Err(e) = fs::write(&package_path, package_json) {
            write_log(&format!("Failed to write package.json: {}", e));
        }
        
        // Instead of installing, try to find existing node_modules
        let node_modules = server_dir.join("node_modules");
        if !node_modules.exists() {
            write_log("Looking for existing node_modules...");
            
            // Try to find node_modules in various locations
            let possible_modules = vec![
                // Development: project root
                std::env::current_exe()
                    .ok()
                    .and_then(|p| p.parent()?.parent()?.parent()?.parent().map(|p| p.to_path_buf()))
                    .map(|p| p.join("node_modules")),
                // Production: bundled resources
                std::env::current_exe()
                    .ok()
                    .and_then(|p| p.parent().map(|p| p.to_path_buf()))
                    .map(|p| p.join("resources").join("node_modules")),
                // User's project directory (fallback)
                dirs::home_dir()
                    .and_then(|home| {
                        let path = home.join("Desktop").join("yurucode").join("node_modules");
                        path.exists().then(|| path)
                    }),
            ];
            
            for modules_path in possible_modules.into_iter().flatten() {
                if modules_path.exists() {
                    write_log(&format!("Found node_modules at: {:?}", modules_path));
                    // Create symlink or set NODE_PATH (will be set below)
                    break;
                }
            }
        }
        
        // Determine where to find node_modules - try multiple locations
        let node_path = vec![
            // User's project directory (most reliable on Windows)
            dirs::home_dir()
                .map(|home| home.join("Desktop").join("yurucode").join("node_modules"))
                .unwrap_or_default(),
            // Development: project root
            std::env::current_exe()
                .ok()
                .and_then(|p| p.parent()?.parent()?.parent()?.parent().map(|p| p.to_path_buf()))
                .map(|p| p.join("node_modules"))
                .unwrap_or_default(),
            // Production: bundled resources
            std::env::current_exe()
                .ok()
                .and_then(|p| p.parent().map(|p| p.to_path_buf()))
                .map(|p| p.join("resources").join("node_modules"))
                .unwrap_or_default(),
        ]
        .into_iter()
        .find(|p| p.exists());
        
        // Try to start server with Node.js - try various paths
        let mut node_paths: Vec<String> = if cfg!(target_os = "windows") {
            vec![
                "node.exe".to_string(),
                "node".to_string(),
                r"C:\Program Files\nodejs\node.exe".to_string(),
                r"C:\Program Files (x86)\nodejs\node.exe".to_string(),
            ]
        } else {
            vec![
                "node".to_string(),
                "/usr/local/bin/node".to_string(),
                "/usr/bin/node".to_string(),
            ]
        };
        
        // Add user-specific Node.js paths on Windows
        #[cfg(target_os = "windows")]
        if let Ok(appdata) = std::env::var("APPDATA") {
            node_paths.push(format!("{}\\npm\\node.exe", appdata));
        }
        
        // Check if Node.js is in a custom location via NODE_HOME
        if let Ok(node_home) = std::env::var("NODE_HOME") {
            let node_exe = if cfg!(target_os = "windows") {
                format!("{}\\node.exe", node_home)
            } else {
                format!("{}/bin/node", node_home)
            };
            node_paths.insert(0, node_exe);
        }
        
        write_log(&format!("Looking for Node.js in {} locations", node_paths.len()));
        
        for node_cmd in node_paths {
            info!("Trying Node.js at: {}", node_cmd);
            write_log(&format!("Trying Node.js at: {}", node_cmd));
            
            let mut cmd = Command::new(&node_cmd);
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
                    info!("Failed to start with {}: {}", node_cmd, e);
                    write_log(&format!("Failed to start with {}: {}", node_cmd, e));
                    
                    // Try to provide more helpful error messages
                    if e.kind() == std::io::ErrorKind::NotFound {
                        write_log("Node.js not found. Please ensure Node.js is installed.");
                        info!("Node.js not found. Checking PATH: {:?}", std::env::var("PATH"));
                    }
                }
            }
        }
        
        info!("❌ Failed to start server");
    }
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