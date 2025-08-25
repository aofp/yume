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
const { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } = require("fs");
const { dirname, join } = require("path");
const { createServer } = require("http");
const { Server } = require("socket.io");
const { homedir, platform } = require("os");

// Import the wrapper module for API capture and token tracking
const claudeWrapper = require("./wrapper-module.js");

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
      "/opt/claude/bin/claude"
    )
    
    # Check each user's .npm-global
    for user_home in /home/*; do
      if [ -d "$user_home" ]; then
        claude_paths+=("$user_home/.npm-global/bin/claude")
        claude_paths+=("$user_home/node_modules/.bin/claude")
        claude_paths+=("$user_home/.local/bin/claude")
      fi
    done
    
    # Check nvm installations
    if [ -d "$HOME/.nvm" ]; then
      for nvm_path in $HOME/.nvm/versions/node/*/bin/claude; do
        [ -x "$nvm_path" ] && claude_paths+=("$nvm_path")
      done
    fi
    
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
      echo "Claude CLI not found in WSL. Searched all common paths including npm global installations." >&2
      exit 127
    fi
    
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
  pingTimeout: 600000, // 10 minutes - prevent timeout during long operations
  pingInterval: 30000, // 30 seconds heartbeat
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
let lastAssistantMessageIds = new Map();  // Map of sessionId -> lastAssistantMessageId
let allAssistantMessageIds = new Map();  // Map of sessionId -> Array of all assistant message IDs
let streamHealthChecks = new Map(); // Map of sessionId -> interval
let streamTimeouts = new Map(); // Map of sessionId -> timeout
let activeFileOperations = new Map(); // Map of sessionId -> Set of active tool_use IDs for file operations

// Session persistence to disk for recovery after restart
class SessionPersistence {
  constructor() {
    this.sessionDir = join(homedir(), '.yurucode', 'sessions');
    this.ensureDirectory();
  }
  
  ensureDirectory() {
    if (!existsSync(this.sessionDir)) {
      mkdirSync(this.sessionDir, { recursive: true });
      console.log(`📁 Created session directory: ${this.sessionDir}`);
    }
  }
  
  saveSession(sessionId, sessionData) {
    try {
      const filePath = join(this.sessionDir, `${sessionId}.json`);
      writeFileSync(filePath, JSON.stringify(sessionData, null, 2));
      console.log(`💾 Saved session to disk: ${sessionId}`);
    } catch (error) {
      console.error(`❌ Failed to save session ${sessionId}:`, error.message);
    }
  }
  
  loadSession(sessionId) {
    try {
      const filePath = join(this.sessionDir, `${sessionId}.json`);
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
      const filePath = join(this.sessionDir, `${sessionId}.json`);
      if (existsSync(filePath)) {
        unlinkSync(filePath);
        console.log(`🗑️ Deleted session file: ${sessionId}`);
      }
    } catch (error) {
      console.error(`❌ Failed to delete session ${sessionId}:`, error.message);
    }
  }
}

const sessionPersistence = new SessionPersistence();

// Add process spawn mutex to prevent race conditions
let isSpawningProcess = false;
const processSpawnQueue = [];

// Helper function to generate title with Sonnet
async function generateTitle(sessionId, userMessage, socket, onSuccess) {
  try {
    console.log(`🏷️ Generating title for session ${sessionId}`);
    console.log(`🏷️ Message preview: "${userMessage.substring(0, 100)}..."`);
    
    // Spawn a separate claude process just for title generation
    const titlePrompt = `user message: "${userMessage.substring(0, 200)}"
task: reply with ONLY 1-3 words describing what user wants. lowercase only. no punctuation. be extremely concise. examples: "echo command", "file search", "debug issue"`;
    
    const titleArgs = [
      '-p', titlePrompt,  // Pass prompt via -p flag
      '--print',  // Non-interactive mode
      '--output-format', 'json',
      '--model', 'claude-3-5-sonnet-20241022'
    ];
    
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
    
    // No need to write to stdin - prompt is passed via -p flag
    child.stdin.end();
    
  } catch (error) {
    console.error('🏷️ Failed to generate title:', error);
  }
}

// Memory management - EXACTLY LIKE WINDOWS
const MAX_MESSAGE_HISTORY = 1000; // Limit message history per session
const MAX_LINE_BUFFER_SIZE = 50 * 1024 * 1024; // 50MB max buffer for large responses

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

// Analytics endpoint - reads all Claude sessions and extracts token usage
app.get('/claude-analytics', async (req, res) => {
  console.log('📊 Loading analytics from all Claude sessions...');
  
  try {
    const analytics = {
      totalSessions: 0,
      totalMessages: 0,
      totalTokens: 0,
      totalCost: 0,
      byModel: {
        opus: { sessions: 0, tokens: 0, cost: 0 },
        sonnet: { sessions: 0, tokens: 0, cost: 0 }
      },
      byDate: {},
      byProject: {}
    };
    
    const { readdir, readFile, stat } = await import('fs/promises');
    const projectsDir = join(homedir(), '.claude', 'projects');
    
    try {
      const projectDirs = await readdir(projectsDir);
      
      for (const projectName of projectDirs) {
        const projectPath = join(projectsDir, projectName);
        const stats = await stat(projectPath);
        
        if (!stats.isDirectory()) continue;
        
        // Get all session files
        const sessionFiles = await readdir(projectPath);
        const jsonlFiles = sessionFiles.filter(f => f.endsWith('.jsonl'));
        
        for (const sessionFile of jsonlFiles) {
          try {
            const sessionPath = join(projectPath, sessionFile);
            const content = await readFile(sessionPath, 'utf8');
            
            // Parse JSONL file - Claude CLI format
            const lines = content.split('\n').filter(line => line.trim());
            let sessionTokens = 0;
            let sessionCost = 0;
            let sessionModel = 'sonnet';
            let sessionDate = new Date().toISOString().split('T')[0];
            let messageCount = 0;
            
            for (const line of lines) {
              try {
                const data = JSON.parse(line);
                
                // Claude CLI uses type: "assistant" for assistant messages with usage data
                if (data.type === 'assistant' && data.message && data.message.usage) {
                  messageCount++;
                  const usage = data.message.usage;
                  
                  // Only count NEW tokens for session total, not cached tokens
                  // Cache tokens represent pre-computed context, not new usage
                  const inputTokens = usage.input_tokens || 0;
                  const outputTokens = usage.output_tokens || 0;
                  sessionTokens += inputTokens + outputTokens;
                  
                  // Detect model from message
                  if (data.message.model) {
                    sessionModel = data.message.model.includes('opus') ? 'opus' : 'sonnet';
                  }
                  
                  // Calculate cost based on model
                  const isOpus = sessionModel === 'opus';
                  const inputRate = isOpus ? 0.000015 : 0.000003;
                  const outputRate = isOpus ? 0.000075 : 0.000015;
                  sessionCost += inputTokens * inputRate + outputTokens * outputRate;
                }
                
                // Count user messages too
                if (data.type === 'user') {
                  messageCount++;
                }
                
                // Get timestamp from any message
                if (data.timestamp) {
                  sessionDate = new Date(data.timestamp).toISOString().split('T')[0];
                }
              } catch (e) {
                // Skip invalid lines
              }
            }
            
            // Update analytics
            if (sessionTokens > 0 || messageCount > 0) {
              analytics.totalSessions++;
              analytics.totalMessages += messageCount;
              analytics.totalTokens += sessionTokens;
              analytics.totalCost += sessionCost;
              
              // Update model breakdown
              if (sessionModel === 'opus') {
                analytics.byModel.opus.sessions++;
                analytics.byModel.opus.tokens += sessionTokens;
                analytics.byModel.opus.cost += sessionCost;
              } else {
                analytics.byModel.sonnet.sessions++;
                analytics.byModel.sonnet.tokens += sessionTokens;
                analytics.byModel.sonnet.cost += sessionCost;
              }
              
              // Update by date
              if (!analytics.byDate[sessionDate]) {
                analytics.byDate[sessionDate] = {
                  sessions: 0,
                  messages: 0,
                  tokens: 0,
                  cost: 0
                };
              }
              analytics.byDate[sessionDate].sessions++;
              analytics.byDate[sessionDate].messages += messageCount;
              analytics.byDate[sessionDate].tokens += sessionTokens;
              analytics.byDate[sessionDate].cost += sessionCost;
              
              // Update by project
              const cleanProjectName = projectName.replace(/-\d{4}-\d{2}-\d{2}.*$/, '');
              if (!analytics.byProject[cleanProjectName]) {
                analytics.byProject[cleanProjectName] = {
                  sessions: 0,
                  messages: 0,
                  tokens: 0,
                  cost: 0,
                  lastUsed: Date.now()
                };
              }
              analytics.byProject[cleanProjectName].sessions++;
              analytics.byProject[cleanProjectName].messages += messageCount;
              analytics.byProject[cleanProjectName].tokens += sessionTokens;
              analytics.byProject[cleanProjectName].cost += sessionCost;
            }
          } catch (e) {
            console.error(`Error processing session ${sessionFile}:`, e.message);
          }
        }
      }
    } catch (e) {
      console.error('Error reading projects directory:', e.message);
    }
    
    console.log(`📊 Analytics loaded: ${analytics.totalSessions} sessions, ${analytics.totalTokens} tokens`);
    res.json(analytics);
  } catch (error) {
    console.error('Error loading analytics:', error);
    res.status(500).json({ error: 'Failed to load analytics', details: error.message });
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
      const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      console.log(`✨ Creating new session: ${sessionId}`);
      
      // Use provided directory, or create a safe sandbox directory
      // NEVER use homedir() as it gives access to all user files
      const safeDir = join(homedir(), '.yurucode', 'sandbox', sessionId);
      mkdirSync(safeDir, { recursive: true });
      const workingDirectory = data.workingDirectory || safeDir;
      
      const sessionData = {
        id: sessionId,
        name: data.name || 'new session',
        socketId: socket.id,
        workingDirectory: workingDirectory,
        messages: [],
        createdAt: Date.now(),
        claudeSessionId: null,
        hasGeneratedTitle: false,
        wasInterrupted: false  // Track if last conversation was interrupted vs completed
      };
      
      sessions.set(sessionId, sessionData);
      
      console.log(`✅ Session ready: ${sessionId}`);
      console.log(`📁 Working directory: ${workingDirectory}`);
      
      if (callback) {
        callback({
          success: true,
          sessionId: sessionId,
          workingDirectory: workingDirectory
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
      console.error(`❌ Session not found: ${sessionId}`);
      if (callback) callback({ success: false, error: 'Session not found' });
      return;
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
          
          // Mark session as interrupted since we killed the process
          session.wasInterrupted = true;
          // DON'T clear the session ID - we want to resume the conversation with the new message
          // session.claudeSessionId = null; // REMOVED - keep session ID for resume
          console.log(`🔄 Marked session ${sessionId} as interrupted but keeping claudeSessionId=${session.claudeSessionId} for resume`);
          
          // Wait a bit for the process to fully terminate
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Don't modify streaming state here - let the UI continue showing streaming
        // The process exit handler will properly clean up when the old process dies

        // Use session's working directory, fallback to safe sandbox (NEVER homedir())
        let processWorkingDir = session.workingDirectory || join(homedir(), '.yurucode', 'sandbox', sessionId);
        console.log(`📂 Using working directory: ${processWorkingDir}`);

      // Build the claude command - EXACTLY LIKE WINDOWS BUT WITH MACOS FLAGS
      const args = [
        '--print',
        '--output-format', 'stream-json', 
        '--verbose', 
        '--dangerously-skip-permissions',
        '--append-system-prompt', 'CRITICAL: you are in yurucode ui. ALWAYS: use all lowercase (no capitals ever), be extremely concise, never use formal language, no greetings/pleasantries, straight to the point, code/variables keep proper case, one line answers preferred. !!YOU MUST PLAN FIRST use THINK and TODO as MUCH AS POSSIBLE to break down everything, including planning into multiple steps and do edits in small chunks!!'
      ];
      
      // Add model flag if specified
      if (model) {
        args.push('--model', model);
        console.log(`🤖 Using model: ${model}`);
      }
      
      // Use --resume if we have a claudeSessionId (even after interrupt)
      console.log(`🔍 Session state check: claudeSessionId=${session.claudeSessionId}, wasInterrupted=${session.wasInterrupted}`);
      if (session.claudeSessionId) {
        args.push('--resume', session.claudeSessionId);
        console.log('🔄 Using --resume flag with session:', session.claudeSessionId);
        // Reset interrupt flag after resuming
        if (session.wasInterrupted) {
          console.log('📝 Resuming after interrupt');
          session.wasInterrupted = false;
        }
      } else {
        console.log('📝 Starting fresh conversation (no previous session)');
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
      
      // Add small delay to prevent race conditions with multiple Claude instances
      if (isSpawningProcess) {
        console.log(`⏳ Waiting for previous Claude process to initialize...`);
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      isSpawningProcess = true;
      
      // Ensure the directory exists before spawning
      if (!existsSync(processWorkingDir)) {
        console.warn(`⚠️ Working directory does not exist: ${processWorkingDir}, creating safe sandbox`);
        const safeFallback = join(homedir(), '.yurucode', 'sandbox', sessionId);
        mkdirSync(safeFallback, { recursive: true });
        processWorkingDir = safeFallback;
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
      
      let claudeProcess = isWindows && CLAUDE_PATH === 'WSL_CLAUDE' ? 
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
      
      // Store process reference for wrapper monitoring (but don't wrap stdout)
      console.log('✅ [WRAPPER] Process ready for monitoring');
      
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
      if (streamTimeouts.has(sessionId)) {
        clearTimeout(streamTimeouts.get(sessionId));
      }
      
      // Log stream health check every 5 seconds
      const streamHealthInterval = setInterval(() => {
        const timeSinceLastData = Date.now() - lastDataTime;
        const streamDuration = Date.now() - streamStartTime;
        console.log(`🩺 [${sessionId}] duration: ${streamDuration}ms | since_last: ${timeSinceLastData}ms | bytes: ${bytesReceived} | msgs: ${messageCount} | buffer: ${lineBuffer.length} | alive: ${activeProcesses.has(sessionId)}`);
        
        if (timeSinceLastData > 30000) {
          console.error(`⚠️ WARNING: No data received for ${timeSinceLastData}ms!`);
          // Send keepalive to prevent client timeout
          socket.emit(`keepalive:${sessionId}`, { timestamp: Date.now() });
        }
        
        // If no data for 5 minutes, consider stream dead
        if (timeSinceLastData > 300000) {
          console.error(`💀 Stream appears dead after ${timeSinceLastData}ms, cleaning up`);
          if (activeProcesses.has(sessionId)) {
            const proc = activeProcesses.get(sessionId);
            proc.kill('SIGTERM');
            activeProcesses.delete(sessionId);
            activeProcessStartTimes.delete(sessionId);
          }
          clearInterval(streamHealthInterval);
        }
      }, 5000);
      
      // Store health check interval for cleanup
      streamHealthChecks.set(sessionId, streamHealthInterval);
      
      // Flag to prevent duplicate processing after retry
      let isRetrying = false;
      
      // Set overall stream timeout (10 minutes max per stream)
      const streamTimeout = setTimeout(() => {
        console.warn(`⏰ Stream timeout reached for session ${sessionId} after 10 minutes`);
        if (activeProcesses.has(sessionId)) {
          const proc = activeProcesses.get(sessionId);
          console.log(`⏰ Terminating long-running process for ${sessionId}`);
          proc.kill('SIGTERM');
        }
      }, 600000); // 10 minutes
      streamTimeouts.set(sessionId, streamTimeout);
      
      const processStreamLine = (line) => {
        // Don't process any more lines if we're retrying
        if (isRetrying) {
          console.log(`🔸 [${sessionId}] Skipping line processing - retry in progress`);
          return;
        }
        
        if (!line.trim()) {
          console.log(`🔸 [${sessionId}] Empty line received`);
          return;
        }
        
        console.log(`🔹 [${sessionId}] Processing line (${line.length} chars): ${line.substring(0, 100)}...`);
        
        // WRAPPER: Process line through wrapper for API capture and token tracking
        let jsonData;
        try {
          // First parse the line to get the original data
          jsonData = JSON.parse(line);
          
          // Process through wrapper to track tokens
          const augmentedLine = claudeWrapper.processLine(line, sessionId);
          if (augmentedLine && augmentedLine !== line) {
            // Parse the augmented line to get the updated data
            jsonData = JSON.parse(augmentedLine);
          }
          
          // Get current session token state from wrapper
          const wrapperSession = claudeWrapper.getSession(sessionId);
          if (wrapperSession && jsonData.usage) {
            // Add wrapper token tracking to the message
            jsonData.wrapper_tokens = {
              total: wrapperSession.totalTokens,
              input: wrapperSession.inputTokens,
              output: wrapperSession.outputTokens,
              cache_creation: wrapperSession.cacheCreationTokens,
              cache_read: wrapperSession.cacheReadTokens,
              percentage: ((wrapperSession.totalTokens / 200000) * 100).toFixed(1),
              compactCount: wrapperSession.compactCount,
              tokensSaved: wrapperSession.tokensSaved
            };
            console.log(`📊 [WRAPPER] Token state for ${sessionId}: ${wrapperSession.totalTokens}/200000 (${jsonData.wrapper_tokens.percentage}%)`);
          }
        } catch (e) {
          console.error(`[WRAPPER] Error processing line:`, e.message);
          // Try to parse as regular JSON if wrapper fails
          try {
            jsonData = JSON.parse(line);
          } catch (parseError) {
            console.error(`Failed to parse line as JSON:`, parseError.message);
            return;
          }
        }
        
        try {
          console.log(`📦 [${sessionId}] Message type: ${jsonData.type}${jsonData.subtype ? ` (${jsonData.subtype})` : ''}`);
          
          // Extract session ID if present (update it every time to ensure we have the latest)
          if (jsonData.session_id) {
            session.claudeSessionId = jsonData.session_id;
            console.log(`📌 [${sessionId}] Claude session ID: ${session.claudeSessionId}`);
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
                  
                  // Track file operations to prevent interrupting during writes
                  const fileOperationTools = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'];
                  if (fileOperationTools.includes(block.name)) {
                    if (!activeFileOperations.has(sessionId)) {
                      activeFileOperations.set(sessionId, new Set());
                    }
                    activeFileOperations.get(sessionId).add(block.id);
                    console.log(`📝 [${sessionId}] Started file operation: ${block.name} (${block.id})`);
                  }
                  
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
                
                // Check if there's a pending interrupt now that Claude has started responding
                const session = sessions.get(sessionId);
                if (session?.pendingInterrupt) {
                  console.log(`🔄 [${sessionId}] Claude started responding - executing queued interrupt`);
                  const interruptCallback = session.interruptCallback;
                  session.pendingInterrupt = false;
                  session.interruptCallback = null;
                  
                  // Execute the interrupt immediately
                  setTimeout(() => {
                    console.log(`🛑 [${sessionId}] Executing queued interrupt now`);
                    const process = activeProcesses.get(sessionId);
                    if (process) {
                      // Kill the process
                      if (process.platform !== 'win32' && process.pid) {
                        try {
                          process.kill(-process.pid, 'SIGINT');
                        } catch (e) {
                          process.kill('SIGINT');
                        }
                      } else {
                        process.kill('SIGINT');
                      }
                      
                      activeProcesses.delete(sessionId);
                      activeProcessStartTimes.delete(sessionId);
                      
                      // Clean up lastAssistantMessageIds
                      lastAssistantMessageIds.delete(sessionId);
                      
                      // Mark session as interrupted
                      if (session) {
                        session.wasInterrupted = true;
                      }
                      
                      // Send interrupt message
                      socket.emit(`message:${sessionId}`, {
                        type: 'system',
                        subtype: 'interrupted',
                        message: 'task interrupted by user',
                        timestamp: Date.now()
                      });
                      
                      // Callback to client
                      if (interruptCallback) {
                        interruptCallback({ success: true });
                      }
                    }
                  }, 100); // Small delay to let the first message send
                  return; // Don't send more messages after interrupt
                }
                
                // Track all assistant message IDs for this session
                if (!allAssistantMessageIds.has(sessionId)) {
                  allAssistantMessageIds.set(sessionId, []);
                }
                allAssistantMessageIds.get(sessionId).push(messageId);
                console.log(`📝 [${sessionId}] Emitting assistant message ${messageId} with streaming=true`);
                console.log(`📝 [${sessionId}] Content blocks: ${contentBlocks.length} (types: ${contentBlocks.map(b => b.type).join(', ')})`);
                socket.emit(`message:${sessionId}`, {
                  type: 'assistant',
                  id: messageId,
                  message: { 
                    ...jsonData.message,
                    content: contentBlocks  // Only send text/thinking blocks, not tool_use blocks
                  },
                  streaming: true,  // Set streaming to true during active streaming
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
                // Clear completed file operation from tracking
                if (activeFileOperations.has(sessionId)) {
                  const fileOps = activeFileOperations.get(sessionId);
                  if (fileOps.has(block.tool_use_id)) {
                    fileOps.delete(block.tool_use_id);
                    console.log(`✅ [${sessionId}] Completed file operation: ${block.tool_use_id}`);
                    if (fileOps.size === 0) {
                      activeFileOperations.delete(sessionId);
                    }
                  }
                }
                
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
            
            // Mark ALL assistant messages for this session as done streaming
            const assistantMessageIds = allAssistantMessageIds.get(sessionId) || [];
            if (assistantMessageIds.length > 0) {
              console.log(`✅ Marking ${assistantMessageIds.length} assistant messages as streaming=false (result received)`);
              const session = sessions.get(sessionId);
              
              assistantMessageIds.forEach(messageId => {
                const assistantMsg = session?.messages.find(m => m.id === messageId);
                console.log(`✅ Marking assistant message ${messageId} as streaming=false`);
                
                socket.emit(`message:${sessionId}`, {
                  type: 'assistant',
                  id: messageId,
                  message: assistantMsg?.message || { content: '' },
                  streaming: false,
                  timestamp: Date.now()
                });
              });
              
              // Clear the tracking arrays since they're all done
              allAssistantMessageIds.delete(sessionId);
              lastAssistantMessageIds.delete(sessionId);
          allAssistantMessageIds.delete(sessionId);
            }
            
            // Send the result message with model info and wrapper tokens
            // Model is available from the outer scope (sendMessage handler)
            console.log(`✅ [${sessionId}] Sending result message with model: ${model}`);
            const resultMessage = {
              type: 'result',
              ...jsonData,
              streaming: false,
              id: `result-${sessionId}-${Date.now()}`,
              model: model || 'unknown', // Use model from outer scope directly
              wrapper_tokens: jsonData.wrapper_tokens // Include wrapper token data
            };
            console.log(`   - Model in result message: ${resultMessage.model}`);
            if (jsonData.wrapper_tokens) {
              console.log(`   - Wrapper tokens: ${jsonData.wrapper_tokens.total}/200000 (${jsonData.wrapper_tokens.percentage}%)`);
            }
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
        
        // Prevent memory overflow from excessive buffering
        if (lineBuffer.length > MAX_LINE_BUFFER_SIZE) {
          console.error(`⚠️ [${sessionId}] Line buffer overflow (${lineBuffer.length} bytes), processing and clearing`);
          // Try to process what we have
          const lines = lineBuffer.split('\n');
          console.log(`⚠️ [${sessionId}] Processing ${lines.length} buffered lines`);
          for (const line of lines) {
            if (line.trim()) {
              try {
                processStreamLine(line);
              } catch (e) {
                console.error(`[${sessionId}] Failed to process line during overflow:`, e);
              }
            }
          }
          lineBuffer = '';
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
        if (error.includes('No conversation found with session ID') && !isRetrying) {
          isRetrying = true; // Set flag to prevent duplicate retry
          console.log(`🔄 Resume failed - session not found in Claude storage`);
          console.log(`🔄 Clearing invalid session ID - will use fresh conversation on next message`);
          
          // Clear the invalid session ID so next message starts fresh
          session.claudeSessionId = null;
          session.wasInterrupted = false;
          
          // Kill the current process 
          if (claudeProcess && !claudeProcess.killed) {
            console.log(`🛑 Killing failed resume process (PID: ${claudeProcess.pid})`);
            // Remove all listeners to prevent duplicate processing
            claudeProcess.stdout.removeAllListeners();
            claudeProcess.stderr.removeAllListeners();
            claudeProcess.removeAllListeners();
            claudeProcess.kill('SIGINT');
          }
          
          // Remove current process from tracking
          activeProcesses.delete(sessionId);
          activeProcessStartTimes.delete(sessionId);
          
          // Clear any health checks and timeouts for the failed process
          if (streamHealthChecks.has(sessionId)) {
            clearInterval(streamHealthChecks.get(sessionId));
            streamHealthChecks.delete(sessionId);
          }
          if (streamTimeouts.has(sessionId)) {
            clearTimeout(streamTimeouts.get(sessionId));
            streamTimeouts.delete(sessionId);
          }
          
          // Send error result to frontend with requiresCheckpointRestore flag
          const errorResultId = `result-error-${Date.now()}-${Math.random()}`;
          const errorResultMessage = {
            id: errorResultId,
            type: 'result',
            subtype: 'error',
            is_error: true,
            error: 'Session not found - please try sending your message again',
            requiresCheckpointRestore: true,
            streaming: false,
            timestamp: Date.now()
          };
          const channel = `message:${sessionId}`;
          console.log(`📤 [${sessionId}] Emitting error result with checkpoint restore flag`);
          socket.emit(channel, errorResultMessage);
          
          // Don't retry automatically - let the frontend handle resending
          console.log(`📤 [${sessionId}] Sent checkpoint restore signal - frontend should resend message`);
          return; // Stop processing this request
          
          /* BROKEN RETRY CODE - COMMENTED OUT
            const retryStreamHealthInterval = setInterval(() => {
              const timeSinceLastData = Date.now() - lastDataTime;
              const streamDuration = Date.now() - streamStartTime;
              console.log(`🩺 [${sessionId}] RETRY duration: ${streamDuration}ms | since_last: ${timeSinceLastData}ms | bytes: ${bytesReceived} | msgs: ${messageCount} | alive: ${activeProcesses.has(sessionId)}`);
              
              if (timeSinceLastData > 30000) {
                console.error(`⚠️ WARNING: No retry data received for ${timeSinceLastData}ms!`);
                socket.emit(`keepalive:${sessionId}`, { timestamp: Date.now() });
              }
              
              if (timeSinceLastData > 300000) {
                console.error(`💀 Retry stream appears dead after ${timeSinceLastData}ms, cleaning up`);
                if (activeProcesses.has(sessionId)) {
                  const proc = activeProcesses.get(sessionId);
                  proc.kill('SIGTERM');
                  activeProcesses.delete(sessionId);
                  activeProcessStartTimes.delete(sessionId);
                }
                clearInterval(retryStreamHealthInterval);
              }
            }, 5000);
            
            // Store health check interval for cleanup
            streamHealthChecks.set(sessionId, retryStreamHealthInterval);
            
            // Set overall stream timeout for retry
            const retryStreamTimeout = setTimeout(() => {
              console.warn(`⏰ Retry stream timeout reached for session ${sessionId} after 10 minutes`);
              if (activeProcesses.has(sessionId)) {
                const proc = activeProcesses.get(sessionId);
                proc.kill('SIGTERM');
                activeProcesses.delete(sessionId);
                activeProcessStartTimes.delete(sessionId);
              }
            }, 600000); // 10 minutes
            
            streamTimeouts.set(sessionId, retryStreamTimeout);
            
            // Store the message before any async operations - capture it from outer scope
            const retryMessage = message;
            console.log(`📝 Captured message for retry: "${retryMessage}"`);
            
            // Wait for process to be ready before sending message
            setTimeout(() => {
              // Send the same message to new process
              if (retryMessage && retryProcess && !retryProcess.killed) {
                let messageToSend = retryMessage;
                if (retryMessage.trim().toLowerCase() === 'ultrathink' || retryMessage.trim().toLowerCase() === 'ultrathink.') {
                  messageToSend = 'Please think deeply and thoroughly about this request, exploring multiple angles and considering edge cases before providing your response.';
                }
                
                console.log(`📝 About to send retry message to claude (${messageToSend.length} chars)`);
                console.log(`📝 Full retry message content: "${messageToSend}"`);
                console.log(`📝 Process alive: ${!retryProcess.killed}, PID: ${retryProcess.pid}`);
                try {
                  retryProcess.stdin.write(messageToSend + '\n');
                  retryProcess.stdin.end();
                  console.log(`✅ Retry message sent successfully`);
                } catch (e) {
                  console.error(`❌ Failed to send message to retry process:`, e);
                  socket.emit(`message:${sessionId}`, { 
                    type: 'error',
                    error: 'Failed to send message after retry', 
                    streaming: false 
                  });
                }
              } else {
                console.log(`⚠️ No message to retry or process killed`);
              }
            }, 200); // Slightly longer delay to ensure process is ready
            
            // Re-attach same handlers to new process but don't use the old processStreamLine
            // since it checks isRetrying flag which would prevent processing
            retryProcess.stdout.on('data', (data) => {
              const str = data.toString();
              bytesReceived += data.length;
              lastDataTime = Date.now();
              
              lineBuffer += str;
              const lines = lineBuffer.split('\n');
              lineBuffer = lines.pop() || '';
              
              for (let i = 0; i < lines.length; i++) {
                // Process line directly without checking isRetrying since this IS the retry
                const line = lines[i];
                if (!line.trim()) continue;
                
                // Call the original processStreamLine logic but skip the isRetrying check
                // by temporarily setting it to false for this processing
                const wasRetrying = isRetrying;
                isRetrying = false;
                processStreamLine(line);
                isRetrying = wasRetrying;
              }
            });
            
            // Handle stderr for retry process 
            retryProcess.stderr.on('data', (data) => {
              const error = data.toString();
              console.error(`⚠️ [${sessionId}] Retry Claude stderr (${data.length} bytes):`, error);
              
              // Don't retry again if retry also fails - emit error this time
              socket.emit(`message:${sessionId}`, { 
                type: 'error',
                error, 
                claudeSessionId: session.claudeSessionId,
                streaming: false 
              });
            });
            
            // Handle process exit for retry
            retryProcess.on('close', (code) => {
              // Same cleanup logic as original process
              if (streamHealthChecks.has(sessionId)) {
                clearInterval(streamHealthChecks.get(sessionId));
                streamHealthChecks.delete(sessionId);
              }
              if (streamTimeouts.has(sessionId)) {
                clearTimeout(streamTimeouts.get(sessionId));
                streamTimeouts.delete(sessionId);
              }
              clearInterval(retryStreamHealthInterval);
              
              console.log(`👋 [${sessionId}] Retry Claude process exited with code ${code}`);
              
              // Clean up tracking
              activeProcesses.delete(sessionId);
              activeProcessStartTimes.delete(sessionId);
              
              // Send completion message
              const lastAssistantMessageId = lastAssistantMessageIds.get(sessionId);
              if (lastAssistantMessageId) {
                socket.emit(`message:${sessionId}`, {
                  type: 'assistant',
                  id: lastAssistantMessageId,
                  message: { content: '' },
                  streaming: false,
                  timestamp: Date.now()
                });
                lastAssistantMessageIds.delete(sessionId);
              }
              
              isSpawningProcess = false;
            });
            
            // Handle spawn error for retry
            retryProcess.on('error', (err) => {
              console.error(`❌ [${sessionId}] Failed to spawn retry claude:`, err);
              // Clean up health monitoring
              if (streamHealthChecks.has(sessionId)) {
                clearInterval(streamHealthChecks.get(sessionId));
                streamHealthChecks.delete(sessionId);
              }
              if (streamTimeouts.has(sessionId)) {
                clearTimeout(streamTimeouts.get(sessionId));
                streamTimeouts.delete(sessionId);
              }
              clearInterval(retryStreamHealthInterval);
              
              activeProcesses.delete(sessionId);
              activeProcessStartTimes.delete(sessionId);
              isSpawningProcess = false;
              
              socket.emit(`message:${sessionId}`, { 
                type: 'error',
                error: `Failed to retry after resume failure: ${err.message}`, 
                claudeSessionId: session.claudeSessionId,
                streaming: false 
              });
            });
            
          }, 100);
          
          // Don't emit the resume failure error to client since we're retrying
          return;
          END OF BROKEN RETRY CODE */
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
        
        // Clean up any pending interrupt
        const session = sessions.get(sessionId);
        if (session?.pendingInterrupt) {
          console.log(`🧹 [${sessionId}] Cleaning up pending interrupt on process close`);
          if (session.interruptCallback) {
            session.interruptCallback({ success: false, error: 'Process ended before interrupt could execute' });
          }
          session.pendingInterrupt = false;
          session.interruptCallback = null;
        }
        if (streamTimeouts.has(sessionId)) {
          clearTimeout(streamTimeouts.get(sessionId));
          streamTimeouts.delete(sessionId);
        }
        clearInterval(streamHealthInterval);
        
        // Clean up file operations tracking
        if (activeFileOperations.has(sessionId)) {
          activeFileOperations.delete(sessionId);
          console.log(`🧹 Cleared file operations tracking for session ${sessionId} on process close`);
        }
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
        // BUT only if it wasn't already marked as interrupted (interrupt handler sets this)
        if (code === 0) {
          const session = sessions.get(sessionId);
          if (session && !session.wasInterrupted) {
            // Only mark as completed if it wasn't interrupted
            session.wasInterrupted = false;
            console.log(`✅ Marked session ${sessionId} as completed normally`);
          } else if (session && session.wasInterrupted) {
            console.log(`⚠️ Session ${sessionId} exited with code 0 but was interrupted - keeping wasInterrupted=true`);
          }
        } else if (code === 1) {
          // Exit code 1 often means --resume failed
          const session = sessions.get(sessionId);
          if (session && session.claudeSessionId) {
            console.log(`⚠️ Process exited with code 1 - likely resume failed, clearing session ID`);
            session.claudeSessionId = null;
            session.wasInterrupted = false;
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
          allAssistantMessageIds.delete(sessionId);
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
        
        // Clean up any pending interrupt
        const session = sessions.get(sessionId);
        if (session?.pendingInterrupt) {
          console.log(`🧹 [${sessionId}] Cleaning up pending interrupt on process error`);
          if (session.interruptCallback) {
            session.interruptCallback({ success: false, error: 'Process error occurred before interrupt could execute' });
          }
          session.pendingInterrupt = false;
          session.interruptCallback = null;
        }
        if (streamTimeouts.has(sessionId)) {
          clearTimeout(streamTimeouts.get(sessionId));
          streamTimeouts.delete(sessionId);
        }
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

  socket.on('interrupt', ({ sessionId }, callback) => {
    console.log(`🛑 INTERRUPT received for session ${sessionId}`);
    const process = activeProcesses.get(sessionId);
    const session = sessions.get(sessionId);
    
    // Check if Claude has started responding yet
    const hasStartedResponding = lastAssistantMessageIds.has(sessionId);
    if (process && !hasStartedResponding) {
      console.log(`⏳ [${sessionId}] Claude hasn't started responding yet, queueing interrupt for when it does...`);
      
      // Mark that we want to interrupt as soon as Claude starts responding
      if (session && !session.pendingInterrupt) {
        session.pendingInterrupt = true;
        session.interruptCallback = callback;
        console.log(`📌 [${sessionId}] Interrupt queued - will trigger when Claude starts responding`);
      } else if (!session) {
        console.log(`⚠️ [${sessionId}] No session found, cannot queue interrupt`);
        if (callback) callback({ success: false, error: 'Session not found' });
      }
      return; // Don't interrupt yet, wait for Claude to start
    }
    
    // Check if there are active file operations
    const fileOps = activeFileOperations.get(sessionId);
    if (fileOps && fileOps.size > 0) {
      console.log(`⏳ [${sessionId}] Waiting for ${fileOps.size} file operation(s) to complete before interrupting...`);
      
      // Wait for file operations to complete (max 5 seconds)
      const maxWaitTime = 5000;
      const checkInterval = 100;
      let waitTime = 0;
      
      const waitForFileOps = setInterval(() => {
        waitTime += checkInterval;
        const currentFileOps = activeFileOperations.get(sessionId);
        
        if (!currentFileOps || currentFileOps.size === 0 || waitTime >= maxWaitTime) {
          clearInterval(waitForFileOps);
          
          if (waitTime >= maxWaitTime) {
            console.log(`⚠️ [${sessionId}] Timeout waiting for file operations, interrupting anyway`);
          } else {
            console.log(`✅ [${sessionId}] File operations completed, proceeding with interrupt`);
          }
          
          // Proceed with interrupt
          performInterrupt();
        }
      }, checkInterval);
      
      return; // Exit early, performInterrupt will be called when ready
    }
    
    // No file operations, proceed immediately
    performInterrupt();
    
    function performInterrupt() {
      // Clear the spawn queue on interrupt to prevent stale messages from being sent
      // This is important when user interrupts and immediately sends a new message
      const queueLengthBefore = processSpawnQueue.length;
      if (queueLengthBefore > 0) {
        processSpawnQueue.length = 0; // Clear the entire queue
        console.log(`🧹 Cleared ${queueLengthBefore} queued messages after interrupt`);
      }
      
      // Clear any pending interrupt flags
      if (session) {
        session.pendingInterrupt = false;
        session.interruptCallback = null;
      }
      
      if (process) {
        console.log(`🛑 Found active process for session ${sessionId} (PID: ${process.pid})`);
        
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
        
        // Mark session as interrupted for proper resume handling
        if (session) {
          console.log(`🔄 Marking session ${sessionId} as interrupted (claudeSessionId: ${session.claudeSessionId})`);
          session.wasInterrupted = true;
          // Don't clear claudeSessionId here - keep it for potential resume
          console.log(`🔄 Session ${sessionId} interrupted - marked wasInterrupted=true for followup`);
        } else {
          console.log(`⚠️ No session found for ${sessionId} during interrupt`);
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
        
        // Send callback response so client knows interrupt completed
        if (callback) {
          callback({ success: true });
        }
      } else {
        console.log(`⚠️ No active process found for session ${sessionId} during interrupt`);
        // No active process to interrupt
        if (callback) {
          callback({ success: true });
        }
      }
      
      // Clear any remaining file operations tracking for this session
      if (activeFileOperations.has(sessionId)) {
        activeFileOperations.delete(sessionId);
        console.log(`🧹 Cleared file operations tracking for session ${sessionId}`);
      }
    }
  });
  
  socket.on('clearSession', ({ sessionId }) => {
    const session = sessions.get(sessionId);
    if (!session) {
      console.error(`Session not found: ${sessionId}`);
      return;
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
    session.claudeSessionId = null;  // Reset Claude session ID so next message starts fresh
    session.hasGeneratedTitle = false;  // Reset title generation flag so next message gets a new title
    session.wasInterrupted = false;  // Reset interrupted flag
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
        if (streamTimeouts.has(sessionId)) {
          clearTimeout(streamTimeouts.get(sessionId));
          streamTimeouts.delete(sessionId);
        }
        
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
  
  // ============================================
  // WRAPPER SOCKET ENDPOINTS
  // ============================================
  
  socket.on('wrapper:get-stats', (sessionId, callback) => {
    const stats = claudeWrapper.getStats(sessionId);
    console.log('📊 [WRAPPER] Stats requested');
    callback({ success: true, stats });
  });
  
  socket.on('wrapper:get-api-responses', (sessionId, callback) => {
    if (sessionId && claudeWrapper.apiResponses.has(sessionId)) {
      const responses = claudeWrapper.apiResponses.get(sessionId);
      console.log(`📊 [WRAPPER] Returning ${responses.length} API responses for ${sessionId}`);
      callback({ 
        success: true, 
        responses 
      });
    } else {
      const allResponses = claudeWrapper.allApiCalls;
      console.log(`📊 [WRAPPER] Returning ${allResponses.length} total API responses`);
      callback({
        success: true,
        responses: allResponses
      });
    }
  });
  
  socket.on('wrapper:get-sessions', (_, callback) => {
    const sessions = Array.from(claudeWrapper.sessions.entries()).map(([id, session]) => ({
      id,
      messages: session.messageCount,
      tokens: session.totalTokens,
      apiCalls: session.apiResponses.length,
      compactions: session.compactCount,
      tokensSaved: session.tokensSaved
    }));
    console.log(`📊 [WRAPPER] Returning ${sessions.length} sessions`);
    callback({ success: true, sessions });
  });
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