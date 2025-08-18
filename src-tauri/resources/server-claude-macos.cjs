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

// __dirname is already defined in CommonJS
let CLAUDE_PATH = 'claude'; // Default to PATH lookup

// Try to find Claude CLI in common locations
const isWindows = platform() === 'win32';

// Helper function to create WSL command for claude
function createWslClaudeCommand(args, workingDir, message) {
  // Only quote arguments that actually need it - don't quote simple flags
  const escapedArgs = args.map(arg => {
    // Only quote if the arg contains special characters
    if (arg.includes(' ') || arg.includes('"') || arg.includes("'") || arg.includes('$') || arg.includes('\\') || arg.includes('\n') || arg.includes('(') || arg.includes(')') || arg.includes('|') || arg.includes('&') || arg.includes(';')) {
      return "'" + arg.replace(/'/g, "'\\''") + "'";
    }
    // Don't quote simple arguments like --print, --output-format, etc.
    return arg;
  }).join(' ');
  
  const wslPath = 'C:\\Windows\\System32\\wsl.exe';
  
  // If we have a message, pipe it directly to claude
  if (message) {
    const escapedMessage = message.replace(/'/g, "'\\''");
    // Simpler script - always capture stderr to see errors
    const script = workingDir 
      ? `cd '${workingDir.replace(/'/g, "'\\''")}'` + ` 2>/dev/null; echo '${escapedMessage}' | /home/yuru/node_modules/.bin/claude ${escapedArgs} 2>&1`
      : `echo '${escapedMessage}' | /home/yuru/node_modules/.bin/claude ${escapedArgs} 2>&1`;
    
    console.log(`🔍 WSL script to execute: ${script}`);
    return [wslPath, ['-e', 'bash', '-c', script], true]; // true = input already handled
  }
  
  // No message - claude will wait for stdin
  const script = workingDir
    ? `cd '${workingDir.replace(/'/g, "'\\''")}'` + ` 2>/dev/null; /home/yuru/node_modules/.bin/claude ${escapedArgs} 2>&1`
    : `/home/yuru/node_modules/.bin/claude ${escapedArgs} 2>&1`;
  
  console.log(`🔍 WSL script to execute: ${script}`);
  return [wslPath, ['-e', 'bash', '-c', script], false]; // false = need to send stdin
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
let streamHealthChecks = new Map(); // Map of sessionId -> interval
let streamTimeouts = new Map(); // Map of sessionId -> timeout

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
        const [wslCommand, wslArgs, inputHandled] = createWslClaudeCommand(titleArgs, null, null);
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
    
    console.log('Loading session request:');
    console.log('  - Raw projectPath:', projectPath);
    console.log('  - SessionId:', sessionId);
    console.log('  - Platform:', platform());
    
    if (isWindows) {
      // Use WSL to load the session
      const { execSync } = require('child_process');
      
      // Detect WSL user
      let wslUser = 'yuru';
      try {
        wslUser = execSync('powershell.exe -NoProfile -Command "& {wsl.exe whoami}"', {
          encoding: 'utf8',
          windowsHide: true
        }).trim();
      } catch (e) {
        // Use default
      }
      
      const wslSessionPath = `/home/${wslUser}/.claude/projects/${projectPath}/${sessionId}.jsonl`;
      console.log('  - WSL path:', wslSessionPath);
      
      // Read the file from WSL
      const readCmd = `powershell.exe -NoProfile -Command "& {wsl.exe -e bash -c 'cat ${wslSessionPath} 2>/dev/null'}"`;
      try {
        const content = execSync(readCmd, {
          encoding: 'utf8',
          windowsHide: true,
          maxBuffer: 50 * 1024 * 1024 // 50MB buffer for large sessions
        });
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
        console.error('Error reading session file from WSL:', readError.message);
        res.status(404).json({ error: 'Session not found' });
      }
    } else {
      // Non-Windows: read directly from filesystem
      const sessionPath = join(homedir(), '.claude', 'projects', projectPath, `${sessionId}.jsonl`);
      console.log('  - Full path:', sessionPath);
      
      if (!existsSync(sessionPath)) {
        console.error('Session not found:', sessionPath);
        return res.status(404).json({ error: 'session not found' });
      }
      
      // Read the session file using promises for better error handling
      const { readFile } = await import('fs/promises');
      
      try {
        const content = await readFile(sessionPath, 'utf8');
        
        // Use the same parsing logic as Windows
        const messages = [];
        const lines = content.split(/\$|\n/).filter(line => line.trim());
        
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            messages.push(data);
          } catch (err) {
            // Skip invalid lines
          }
        }
        
        const actualPath = projectPath
          .replace(/^([A-Z])--/, '$1:/')
          .replace(/^-/, '/')
          .replace(/-/g, '/');
        
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
    }
  } catch (error) {
    console.error('Error loading session:', error);
    res.status(500).json({ error: 'Failed to load session', details: error.message });
  }
});

// Quick projects endpoint - returns just project count and names quickly
app.get('/claude-projects-quick', async (req, res) => {
  try {
    // On Windows, ALWAYS load from WSL, NEVER from Windows filesystem
    if (isWindows) {
      console.log('🚨 WINDOWS DETECTED - LOADING FROM WSL ONLY!');
      try {
        // Get WSL user using PowerShell
        let wslUser = 'yuru'; // default
        try {
          const { execSync } = require('child_process');
          console.log('🔍 Detecting WSL user via PowerShell...');
          const psCommand = 'powershell.exe -NoProfile -Command "& {wsl.exe whoami}"';
          console.log('💻 PowerShell command:', psCommand);
          wslUser = execSync(psCommand, {
            encoding: 'utf8',
            windowsHide: true
          }).trim();
          console.log('✅ WSL user found:', wslUser);
        } catch (e) {
          console.log('⚠️ Could not detect WSL user, using default:', wslUser);
          console.log('  Error:', e.message);
        }
        
        const wslProjectsDir = `/home/${wslUser}/.claude/projects`;
        console.log('📂 WSL projects directory:', wslProjectsDir);
        console.log('🔍 WSL user detected:', wslUser);
        
        // Get project list from WSL using PowerShell
        const { execSync } = require('child_process');
        console.log('🔧 Executing WSL command via PowerShell to list projects...');
        const psListCommand = `powershell.exe -NoProfile -Command "& {wsl.exe -e bash -c 'if [ -d ${wslProjectsDir} ]; then ls -1 ${wslProjectsDir}; else echo NO_PROJECTS_DIR; fi'}"`;
        console.log('💻 PowerShell command:', psListCommand);
        const dirList = execSync(psListCommand, {
          encoding: 'utf8',
          windowsHide: true
        }).trim();
        
        console.log('📝 Raw PowerShell/WSL output:', JSON.stringify(dirList));
        
        let projectDirs = [];
        
        if (!dirList || dirList === 'NO_PROJECTS_DIR' || dirList === 'ECHO is on.' || dirList.includes('system cannot find')) {
          console.log('❌ WSL command failed or no projects directory found');
          console.log('🔍 Testing WSL availability...');
          
          // Try a simpler command to test WSL using PowerShell
          try {
            const testWSL = execSync('powershell.exe -NoProfile -Command "& {wsl.exe echo WSL_TEST}"', {
              encoding: 'utf8',
              windowsHide: true
            }).trim();
            console.log('🧪 WSL test result:', testWSL);
            
            if (testWSL !== 'WSL_TEST') {
              console.log('❌ WSL is not working properly');
              return res.json({ projects: [], count: 0 });
            }
            
            // WSL works, try creating the projects directory if it doesn't exist
            console.log('🔨 Creating Claude projects directory in WSL if needed...');
            const createDirCommand = `powershell.exe -NoProfile -Command "& {wsl.exe -e bash -c 'mkdir -p /home/${wslUser}/.claude/projects && ls -1 /home/${wslUser}/.claude/projects'}"`;
            console.log('💻 Create dir command:', createDirCommand);
            const altDirList = execSync(createDirCommand, {
              encoding: 'utf8',
              windowsHide: true
            }).trim();
            console.log('📝 Directory creation result:', altDirList);
            
            if (altDirList === 'NO_DIR' || !altDirList) {
              console.log('❌ Claude projects directory does not exist in WSL');
              return res.json({ projects: [], count: 0 });
            }
            
            projectDirs = altDirList.split('\n').filter(dir => dir && !dir.startsWith('.') && dir !== 'NO_DIR');
            console.log(`✅ Found ${projectDirs.length} projects in WSL (alternative method):`, projectDirs);
          } catch (altError) {
            console.log('❌ Alternative WSL detection also failed:', altError.message);
            return res.json({ projects: [], count: 0 });
          }
        } else {
          projectDirs = dirList.split('\n').filter(dir => dir && !dir.startsWith('.'));
        }
        
        console.log(`✅ Found ${projectDirs.length} projects in WSL:`, projectDirs);
        
        // Get LATEST SESSION modification time for each project (not directory time)
        // SKIP DATES - RETURN INSTANTLY!
        let modTimes = {};
        projectDirs.forEach(name => {
          modTimes[name] = Date.now(); // Just use now for instant loading
        });
        
        // Build project list with real dates
        const quickProjects = projectDirs.map(projectName => ({
          path: projectName,
          name: projectName,
          sessionCount: null, // Will be loaded async
          lastModified: modTimes[projectName] || Date.now()
        }));
        
        // Sort by last modified
        quickProjects.sort((a, b) => b.lastModified - a.lastModified);
        
        console.log(`✅ Returning ${quickProjects.length} projects INSTANTLY`);
        
        // Send response immediately with project names
        res.json({ projects: quickProjects, count: quickProjects.length });
        
        // Now load session counts in parallel (fire and forget)
        console.log('🚀 Starting parallel session count loading...');
        Promise.all(projectDirs.map(async (projectName) => {
          const projectPath = `${wslProjectsDir}/${projectName}`;
          try {
            // Count up to 50, then just show 50+ (much faster)
            const countCommand = `powershell.exe -NoProfile -Command "& {wsl.exe -e bash -c 'ls -1 ${projectPath}/*.jsonl 2>/dev/null | head -51 | wc -l'}"`;
            const { execSync } = require('child_process');
            const sessionList = execSync(countCommand, {
              encoding: 'utf8',
              windowsHide: true,
              shell: true
            }).trim();
            let counted = parseInt(sessionList) || 0;
            const sessionCount = counted > 50 ? '50+' : counted;
            console.log(`  ✅ ${projectName}: ${sessionCount} sessions`);
            return { name: projectName, sessionCount };
          } catch (e) {
            console.log(`  ⚠️ ${projectName}: error counting`);
            return { name: projectName, sessionCount: 0 };
          }
        })).then(results => {
          console.log('✅ All session counts loaded:', results.map(r => `${r.name}(${r.sessionCount})`).join(', '));
        }).catch(err => {
          console.log('❌ Error loading session counts:', err);
        });
        
        return; // Already sent response
        
      } catch (error) {
        console.error('❌ ERROR loading WSL projects:', error.message);
        console.error('Stack:', error.stack);
        // NEVER fall back to Windows filesystem - return empty if WSL fails
        return res.json({ projects: [], count: 0 });
      }
    }
    
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
          
          // On Windows, if sessionCount is 0, don't report it as 0 - sessions might be in WSL
          // Return null to indicate unknown count rather than wrong count
          const effectiveSessionCount = (isWindows && sessionCount === 0) ? null : sessionCount;
          
          // Just return name, path, and count for quick loading
          return {
            path: projectDir,
            name: projectDir,
            sessionCount: effectiveSessionCount,
            lastModified: stats.mtime.getTime()
          };
        } catch {
          return null;
        }
      });
    
    const projects = (await Promise.all(projectPromises)).filter(Boolean);
    projects.sort((a, b) => b.lastModified - a.lastModified);
    
    console.log(`Quick loaded ${projects.length} project names`);
    res.json({ projects, count: projects.length });
  } catch (error) {
    console.error('Error quick loading projects:', error);
    res.status(500).json({ error: 'Failed to load projects', details: error.message });
  }
});

// Get sessions for a specific project (limit to 30 for performance)
app.get('/claude-project-sessions/:projectName', async (req, res) => {
  try {
    const projectName = decodeURIComponent(req.params.projectName);
    console.log('📂 Loading sessions for project:', projectName);
    
    if (isWindows) {
      // Get WSL user
      let wslUser = 'yuru';
      try {
        const { execSync } = require('child_process');
        wslUser = execSync('powershell.exe -NoProfile -Command "& {wsl.exe whoami}"', {
          encoding: 'utf8',
          windowsHide: true
        }).trim();
      } catch (e) {
        // Use default
      }
      
      const projectPath = `/home/${wslUser}/.claude/projects/${projectName}`;
      
      try {
        // Get ALL session data in ONE command for speed
        console.log('🚀 Loading all session data in one batch...');
        // Simplified approach - get file list first, then process each
        const filesCmd = `powershell.exe -NoProfile -Command "& {wsl.exe -e bash -c 'cd ${projectPath} && ls -1t *.jsonl 2>/dev/null | head -10'}"`;
        const { execSync } = require('child_process');
        const fileList = execSync(filesCmd, {
          encoding: 'utf8',
          windowsHide: true,
          shell: true
        }).trim();
        
        if (!fileList) {
          console.log('No sessions found');
          return res.json({ sessions: [] });
        }
        
        const files = fileList.split('\n').filter(f => f);
        const sessions = [];
        
        // Process each file individually
        for (const filename of files) {
          try {
            const dataCmd = `powershell.exe -NoProfile -Command "& {wsl.exe -e bash -c 'cd ${projectPath} && head -n1 ${filename} 2>/dev/null'}"`;
            const metaCmd = `powershell.exe -NoProfile -Command "& {wsl.exe -e bash -c 'cd ${projectPath} && stat -c %Y ${filename} 2>/dev/null'}"`;
            const lineCmd = `powershell.exe -NoProfile -Command "& {wsl.exe -e bash -c 'cd ${projectPath} && wc -l < ${filename} 2>/dev/null'}"`;
            
            const firstLine = execSync(dataCmd, { encoding: 'utf8', windowsHide: true }).trim();
            const modTime = execSync(metaCmd, { encoding: 'utf8', windowsHide: true }).trim();
            const lineCount = execSync(lineCmd, { encoding: 'utf8', windowsHide: true }).trim();
            
            const sessionId = filename.replace('.jsonl', '');
            const timestamp = parseInt(modTime) * 1000;
            
            let summary = 'Untitled session';
            let title = null;
            try {
              const data = JSON.parse(firstLine);
              if (data.summary) {
                summary = data.summary;
              } else if (data.role === 'user' && data.content) {
                summary = data.content.substring(0, 100);
              }
              title = data.title || data.summary || summary;
            } catch (e) {
              // Parse error, use default
            }
            
            sessions.push({
              id: sessionId,
              summary: summary,
              title: title,
              timestamp: timestamp,
              path: filename,
              messageCount: parseInt(lineCount) || 0
            });
          } catch (e) {
            console.log(`Error processing ${filename}:`, e.message);
          }
        }
        
        console.log(`✅ Loaded ${sessions.length} sessions`);
        return res.json({ sessions });
        
      } catch (e) {
        console.error('Error loading sessions:', e.message);
        res.json({ sessions: [] });
      }
    } else {
      // Non-Windows implementation
      res.json({ sessions: [] });
    }
  } catch (error) {
    console.error('Error loading project sessions:', error);
    res.status(500).json({ error: 'Failed to load sessions' });
  }
});

// Get session count for a specific project
app.get('/claude-project-session-count/:projectName', async (req, res) => {
  try {
    const projectName = decodeURIComponent(req.params.projectName);
    
    if (isWindows) {
      // Get WSL user
      let wslUser = 'yuru';
      try {
        const { execSync } = require('child_process');
        wslUser = execSync('powershell.exe -NoProfile -Command "& {wsl.exe whoami}"', {
          encoding: 'utf8',
          windowsHide: true
        }).trim();
      } catch (e) {
        // Use default
      }
      
      const projectPath = `/home/${wslUser}/.claude/projects/${projectName}`;
      
      try {
        const countCommand = `powershell.exe -NoProfile -Command "& {wsl.exe -e bash -c 'find ${projectPath} -name *.jsonl -type f 2>/dev/null | wc -l'}"`;
        const { execSync } = require('child_process');
        const sessionList = execSync(countCommand, {
          encoding: 'utf8',
          windowsHide: true
        }).trim();
        const sessionCount = parseInt(sessionList) || 0;
        
        res.json({ projectName, sessionCount });
      } catch (e) {
        res.json({ projectName, sessionCount: 0 });
      }
    } else {
      // Non-Windows implementation
      res.json({ projectName, sessionCount: 0 });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to get session count' });
  }
});

// Projects endpoint - loads claude projects asynchronously with enhanced error handling
app.get('/claude-projects', async (req, res) => {
  try {
    // On Windows, ALWAYS load from WSL, NEVER from Windows filesystem
    if (isWindows) {
      console.log('🚨 WINDOWS DETECTED - LOADING FROM WSL ONLY!');
      try {
        // Get WSL user using PowerShell
        let wslUser = 'yuru'; // default
        try {
          const { execSync } = require('child_process');
          console.log('🔍 Detecting WSL user via PowerShell...');
          const psCommand = 'powershell.exe -NoProfile -Command "& {wsl.exe whoami}"';
          console.log('💻 PowerShell command:', psCommand);
          wslUser = execSync(psCommand, {
            encoding: 'utf8',
            windowsHide: true
          }).trim();
          console.log('✅ WSL user found:', wslUser);
        } catch (e) {
          console.log('⚠️ Could not detect WSL user, using default:', wslUser);
          console.log('  Error:', e.message);
        }
        
        const wslProjectsDir = `/home/${wslUser}/.claude/projects`;
        console.log('📂 WSL projects directory:', wslProjectsDir);
        console.log('🔍 WSL user detected:', wslUser);
        
        // Get project list from WSL using PowerShell
        const { execSync } = require('child_process');
        console.log('🔧 Executing WSL command via PowerShell to list projects...');
        const psListCommand = `powershell.exe -NoProfile -Command "& {wsl.exe -e bash -c 'if [ -d ${wslProjectsDir} ]; then ls -1 ${wslProjectsDir}; else echo NO_PROJECTS_DIR; fi'}"`;
        console.log('💻 PowerShell command:', psListCommand);
        const dirList = execSync(psListCommand, {
          encoding: 'utf8',
          windowsHide: true
        }).trim();
        
        console.log('📝 Raw PowerShell/WSL output:', JSON.stringify(dirList));
        
        if (!dirList || dirList === 'NO_PROJECTS_DIR' || dirList === 'ECHO is on.' || dirList.includes('system cannot find')) {
          console.log('❌ No projects found or WSL error');
          return res.json({ projects: [] });
        }
        
        const projectDirs = dirList.split('\n').filter(dir => dir && !dir.startsWith('.') && dir !== 'NO_DIR');
        console.log(`✅ Found ${projectDirs.length} projects in WSL:`, projectDirs);
        
        // Load full project details
        const projects = [];
        for (const projectName of projectDirs) {
          const projectPath = `${wslProjectsDir}/${projectName}`;
          
          // Get session files
          const sessions = [];
          try {
            const sessionList = execSync(`powershell.exe -NoProfile -Command "& {wsl.exe -e bash -c 'find ${projectPath} -name *.jsonl -type f -exec basename {} .jsonl \\\\; 2>/dev/null'}"`, {
              encoding: 'utf8',
              windowsHide: true,
              shell: true
            }).trim();
            
            if (sessionList) {
              const sessionIds = sessionList.split('\n').filter(id => id);
              
              for (const sessionId of sessionIds.slice(0, 5)) { // Limit to first 5 sessions for performance
                const sessionPath = `${projectPath}/${sessionId}.jsonl`;
                
                let summary = 'untitled session';
                let messageCount = 0;
                let timestamp = Date.now();
                
                try {
                  // Get line count
                  const lineCount = execSync(`powershell.exe -NoProfile -Command "& {wsl.exe -e bash -c 'wc -l < ${sessionPath}'}"`, {
                    encoding: 'utf8',
                    windowsHide: true
                  }).trim();
                  messageCount = parseInt(lineCount) || 0;
                  
                  // Get first line for summary
                  const firstLine = execSync(`powershell.exe -NoProfile -Command "& {wsl.exe -e bash -c 'head -n1 ${sessionPath}'}"`, {
                    encoding: 'utf8',
                    windowsHide: true
                  }).trim();
                  
                  if (firstLine) {
                    try {
                      const data = JSON.parse(firstLine);
                      if (data.summary) {
                        summary = data.summary;
                      } else if (data.role === 'user' && data.content) {
                        summary = data.content.slice(0, 100);
                        if (data.content.length > 100) summary += '...';
                      }
                    } catch (e) {
                      // Ignore JSON parse errors
                    }
                  }
                  
                  // Get modification time
                  const modTime = execSync(`powershell.exe -NoProfile -Command "& {wsl.exe -e bash -c 'stat -c %Y ${sessionPath}'}"`, {
                    encoding: 'utf8',
                    windowsHide: true
                  }).trim();
                  timestamp = parseInt(modTime) * 1000 || Date.now();
                  
                } catch (e) {
                  // Ignore errors for individual sessions
                }
                
                sessions.push({
                  id: sessionId,
                  summary,
                  timestamp,
                  createdAt: timestamp,
                  path: sessionPath,
                  messageCount
                });
              }
            }
          } catch (e) {
            console.log(`Error loading sessions for ${projectName}:`, e.message);
          }
          
          if (sessions.length > 0) {
            sessions.sort((a, b) => b.timestamp - a.timestamp);
            
            projects.push({
              path: projectName,
              name: projectName,
              sessions,
              lastModified: sessions[0].timestamp,
              createdAt: Math.min(...sessions.map(s => s.timestamp)),
              sessionCount: sessions.length,
              totalMessages: sessions.reduce((sum, s) => sum + s.messageCount, 0)
            });
          }
        }
        
        projects.sort((a, b) => b.lastModified - a.lastModified);
        console.log(`✅ Returning ${projects.length} projects from WSL`);
        console.log('📊 Full projects data:', JSON.stringify(projects, null, 2).slice(0, 500));
        return res.json({ projects });
        
      } catch (error) {
        console.error('❌ ERROR loading WSL projects:', error.message);
        console.error('Stack:', error.stack);
        // NEVER fall back to Windows filesystem - return empty if WSL fails
        return res.json({ projects: [], count: 0 });
      }
    }
    
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
      
      // Use provided directory, or home directory as fallback (NOT process.cwd() which would be the app bundle)
      const workingDirectory = data.workingDirectory || homedir();
      
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
    const session = sessions.get(sessionId);
    
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
          // Clear the session ID since the conversation was interrupted
          session.claudeSessionId = null;
          console.log(`🔄 Marked session ${sessionId} as interrupted and cleared claudeSessionId`);
          
          // Wait a bit for the process to fully terminate
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Don't modify streaming state here - let the UI continue showing streaming
        // The process exit handler will properly clean up when the old process dies

        // Use session's working directory, fallback to home directory (NOT process.cwd() in bundled app)
        const processWorkingDir = session.workingDirectory || homedir();
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
      
      // Use --resume if we have a claudeSessionId AND the last conversation wasn't interrupted
      if (session.claudeSessionId && !session.wasInterrupted) {
        args.push('--resume', session.claudeSessionId);
        console.log('🔄 Using --resume flag with session:', session.claudeSessionId);
      } else {
        if (session.wasInterrupted) {
          console.log('📝 Starting fresh conversation (last conversation was interrupted)');
          session.wasInterrupted = false; // Reset the flag
          session.claudeSessionId = null; // Clear the invalid session ID
        } else {
          console.log('📝 Starting fresh conversation (no previous session)');
        }
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
          
          const [wslCommand, wslArgs, inputHandled] = createWslClaudeCommand(args, wslWorkingDir, message);
          console.log(`🚀 Running WSL command: ${wslCommand}`);
          console.log(`🚀 WSL args:`, wslArgs);
          console.log(`🚀 Input handled in script: ${inputHandled}`);
          
          const process = spawn(wslCommand, wslArgs, spawnOptions);
          process.inputHandled = inputHandled;
          return process;
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

      // Send input if not resuming and not already handled
      if (message && !claudeProcess.inputHandled) {
        const messageToSend = message + '\n';
        console.log(`📝 Sending message to claude (${message.length} chars)`);
        
        // Write immediately - Claude with --print needs input right away
        claudeProcess.stdin.write(messageToSend, (err) => {
          if (err) {
            console.error(`❌ Error writing to stdin:`, err);
          } else {
            console.log(`✅ Successfully wrote to stdin`);
          }
          claudeProcess.stdin.end();
          console.log(`📝 Stdin closed`);
        });
      } else if (claudeProcess.inputHandled) {
        console.log(`📝 Input already handled in WSL script via echo pipe`);
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
        if (error.includes('No conversation found with session ID')) {
          console.log(`🔄 Resume failed - clearing invalid session ID and retrying with fresh conversation`);
          
          // Clear the invalid session ID
          session.claudeSessionId = null;
          session.wasInterrupted = false;
          
          // Don't emit the error to client, just log it
          console.log(`🔄 Will start fresh on next message`);
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
        if (streamTimeouts.has(sessionId)) {
          clearTimeout(streamTimeouts.get(sessionId));
          streamTimeouts.delete(sessionId);
        }
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
            console.log(`✅ Marked session ${sessionId} as completed normally`);
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