
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

// ============================================
// DEBUG MODE - Set to false in production
// ============================================
const DEBUG = process.env.YUME_DEBUG === 'true';

// In production, disable ALL console.log output to reduce log spam
// Only errors and warnings are kept for critical issues
if (!DEBUG) {
  const noop = () => {};
  console.log = noop;
  console.info = noop;
  console.debug = noop;
  // Keep console.error and console.warn for critical issues
}

// Debug logging helper - only logs when DEBUG is true
function debugLog(...args) {
  if (DEBUG) console.log(...args);
}

// ============================================
// WRAPPER_INJECTED - Universal Claude Wrapper
// ============================================

const wrapperState = {
  sessions: new Map(),
  stats: { apiCalls: 0, totalTokens: 0, compacts: 0 }
};

function getWrapperSession(sessionId) {
  if (!wrapperState.sessions.has(sessionId)) {
    wrapperState.sessions.set(sessionId, {
      id: sessionId,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      messageCount: 0,
      apiResponses: [],
      history: [], // Track message history for compaction summary
      compactCount: 0,
      wasCompacted: false,
      tokensSaved: 0
    });
    console.log(`✅ [WRAPPER] Created session: ${sessionId}`);
  }
  return wrapperState.sessions.get(sessionId);
}

// Calculate accumulated context tokens from existing messages
// This reads the LAST usage data which contains the total context at that point
function calculateAccumulatedTokensFromMessages(messages) {
  if (!messages || messages.length === 0) return 0;

  // Find the last message with usage data - this contains the total context
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const usage = msg.usage || msg.message?.usage;
    if (usage) {
      // The cache_read represents all previously cached content
      // cache_creation is new content being added
      // Context window = input tokens only (matches Claude Code formula)
      const cacheRead = usage.cache_read_input_tokens || 0;
      const cacheCreation = usage.cache_creation_input_tokens || 0;
      const input = usage.input_tokens || 0;
      // Note: output tokens are NOT counted in context window
      const total = cacheRead + cacheCreation + input;
      console.log(`📊 [WRAPPER] Calculated context from history: ${total} (cache_read=${cacheRead}, cache_creation=${cacheCreation}, input=${input})`);
      return total;
    }
  }
  return 0;
}

// Initialize wrapper session with existing tokens (for resumed sessions)
function initWrapperSessionWithTokens(sessionId, initialTokens) {
  const session = getWrapperSession(sessionId);
  if (initialTokens > 0 && session.totalTokens === 0) {
    session.totalTokens = initialTokens;
    console.log(`📊 [WRAPPER] Initialized session ${sessionId} with ${initialTokens} accumulated tokens from history`);
  }
  return session;
}

function processWrapperLine(line, sessionId) {
  if (!line || !line.trim()) return line;
  
  const session = getWrapperSession(sessionId);
  
  try {
    const data = JSON.parse(line);
    
    // Log API response
    wrapperState.stats.apiCalls++;
    console.log(`📡 [WRAPPER] API ${data.type} #${wrapperState.stats.apiCalls}`);
    
    // Store API response
    session.apiResponses.push({
      timestamp: Date.now(),
      type: data.type,
      data: { ...data }
    });
    
    // Track messages
    if (data.type === 'user' || data.type === 'assistant') {
      session.messageCount++;
    }
    
    // Update tokens if usage present
    // CRITICAL: Skip 'result' messages - they contain CUMULATIVE session totals, not per-turn usage!
    // The result message sums up all cache_read_input_tokens across ALL turns, which corrupts
    // our context tracking. Only assistant messages have accurate per-turn context size.
    // NOTE: Usage can be at data.usage OR data.message.usage depending on message type
    const usage = data.usage || data.message?.usage;
    if (usage && data.type !== 'result') {
      const input = usage.input_tokens || 0;
      const output = usage.output_tokens || 0;
      const cacheCreation = usage.cache_creation_input_tokens || 0;
      const cacheRead = usage.cache_read_input_tokens || 0;

      // IMPORTANT: Claude API returns TOTAL context window usage, not deltas!
      // However, when Anthropic's cache expires, cache_read becomes 0 even though
      // the conversation history still exists. We track the max seen to prevent
      // the counter from going down when cache expires.
      const prevTotal = session.totalTokens;

      // Set current values (not accumulate)
      session.inputTokens = input;
      session.outputTokens = output;
      session.cacheCreationTokens = cacheCreation;
      session.cacheReadTokens = cacheRead;

      // CONTEXT WINDOW = input tokens only (what model receives)
      // Matches Claude Code official formula: input + cache_creation + cache_read
      // Output tokens are GENERATED, not part of input context window
      // cache_read = previous conversation (cached by Anthropic)
      // cache_creation = new content being cached
      // input = new input not in cache
      const reportedTotal = cacheRead + cacheCreation + input;

      // Keep the higher value - prevents counter from resetting when cache expires
      // The actual conversation history is still there even if cache_read is 0
      session.totalTokens = Math.max(session.totalTokens, reportedTotal);

      const delta = session.totalTokens - prevTotal;
      wrapperState.stats.totalTokens += delta;

      console.log(`📊 [WRAPPER] TOKENS +${delta} → ${session.totalTokens}/200000 (${Math.round(session.totalTokens/2000)}%)`);
      if (cacheCreation > 0 || cacheRead > 0) {
        console.log(`   📦 Cache: creation=${cacheCreation}, read=${cacheRead}`);
      }
    }
    
    // Detect compaction - Claude's /compact returns 0 tokens 
    if (data.type === 'result' && 
        (!data.usage || (data.usage.input_tokens === 0 && data.usage.output_tokens === 0)) &&
        session.totalTokens > 0) {  // Only if we had tokens before
      
      const savedTokens = session.totalTokens;
      console.log(`🗜️ [WRAPPER] COMPACTION DETECTED! Saved ${savedTokens} tokens`);
      
      session.compactCount++;
      session.wasCompacted = true;
      session.tokensSaved += savedTokens;
      wrapperState.stats.compacts++;
      
      // Reset tokens
      session.inputTokens = 0;
      session.outputTokens = 0;
      session.totalTokens = 0;
      
      // Don't overwrite data.result - Claude provides its own summary!
      // If Claude didn't provide a summary (empty result), add a minimal one
      if (!data.result || data.result === '') {
        data.result = `Conversation compacted. Saved ${savedTokens.toLocaleString()} tokens.`;
      }
      
      // Add wrapper metadata
      data.wrapper_compact = {
        savedTokens,
        totalSaved: session.tokensSaved,
        compactCount: session.compactCount
      };
      
      console.log(`🗜️ [WRAPPER] Compaction complete`);
    }
    
    // Add wrapper data to every message
    data.wrapper = {
      enabled: true,
      tokens: {
        total: session.totalTokens,
        input: session.inputTokens,
        output: session.outputTokens,
        cache_read: session.cacheReadTokens || 0,
        cache_creation: session.cacheCreationTokens || 0
      },
      compaction: {
        count: session.compactCount,
        wasCompacted: session.wasCompacted,
        tokensSaved: session.tokensSaved
      }
    };
    
    return JSON.stringify(data);
    
  } catch (e) {
    // Not JSON - pass through
    return line;
  }
}

console.log('════════════════════════════════════════════════════════');
console.log('🎯 WRAPPER EMBEDDED - Token tracking and compaction enabled');
console.log('════════════════════════════════════════════════════════');



// No need for module override when not using asar

// Claude CLI path - try multiple locations
const { execSync, spawn } = require("child_process");
const fs = require("fs");
const { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync, statSync } = fs;
const { dirname, join, isAbsolute } = require("path");
const { createServer } = require("http");
const { Server } = require("socket.io");
const { homedir, platform } = require("os");

// __dirname is already defined in CommonJS
let CLAUDE_PATH = 'claude'; // Default to PATH lookup

// Try to find Claude CLI in common locations
const isWindows = platform() === 'win32';

// Helper function to create WSL command for claude
function createWslClaudeCommand(args, workingDir, message) {
  // Use full path to WSL.exe - Node in temp directory needs this
  const wslPath = 'C:\\Windows\\System32\\wsl.exe';
  
  // The workingDir is already in WSL format (e.g., /mnt/c/Users/...)
  // It was converted before calling this function
  // CRITICAL: Require a valid working directory - no defaults to avoid temp directory
  if (!workingDir) {
    throw new Error('Working directory is required for WSL Claude command');
  }
  const wslWorkingDir = workingDir;
  
  // For the main message, run Claude with the args
  if (message) {
    // Try multiple possible Claude paths in WSL
    // First check which paths exist
    const { execFileSync } = require('child_process');
    let claudePath = null;
    
    // First, get the actual WSL username dynamically
    let wslUser = 'user'; // fallback default
    try {
      wslUser = execFileSync(wslPath, ['-e', 'bash', '-c', 'whoami'], {
        encoding: 'utf8',
        windowsHide: true
      }).trim();
      console.log(`🔍 WSL user detected: ${wslUser}`);
    } catch (e) {
      console.warn('⚠️ Could not detect WSL user, using default');
    }
    
    // Potential paths to check (in order of preference) - using dynamic user
    const possiblePaths = [
      `/home/${wslUser}/.claude/local/node_modules/.bin/claude`,  // User-specific claude install
      `~/.npm-global/bin/claude`,  // npm global install
      `~/node_modules/.bin/claude`,  // Local install in home
      `/usr/local/bin/claude`,  // System-wide install
      `/usr/bin/claude`,  // System binary
      `~/.local/bin/claude`  // User local bin
    ];
    
    // Find the first working Claude path
    for (const path of possiblePaths) {
      try {
        // Expand ~ to $HOME and check if file exists
        const checkCmd = path.startsWith('~') 
          ? `[ -f "${path.replace('~', '$HOME')}" ] && echo "exists"`
          : `[ -f "${path}" ] && echo "exists"`;
        
        const result = execFileSync(wslPath, ['-e', 'bash', '-c', checkCmd], {
          encoding: 'utf8',
          windowsHide: true
        }).trim();
        
        if (result === 'exists') {
          // For paths with ~, we need to expand to actual home path
          if (path.startsWith('~')) {
            // Get actual home directory
            const homeDir = execFileSync(wslPath, ['-e', 'bash', '-c', 'echo $HOME'], {
              encoding: 'utf8',
              windowsHide: true
            }).trim();
            claudePath = path.replace('~', homeDir);
          } else {
            claudePath = path;
          }
          console.log(`✅ Found Claude at: ${claudePath}`);
          break;
        }
      } catch (e) {
        // Path doesn't exist, continue checking
      }
    }
    
    // If still not found, try 'which claude'
    if (!claudePath) {
      try {
        const whichResult = execFileSync(wslPath, ['-e', 'bash', '-c', 'which claude'], {
          encoding: 'utf8',
          windowsHide: true
        }).trim();
        
        if (whichResult) {
          claudePath = whichResult;
          console.log(`✅ Found Claude via 'which': ${claudePath}`);
        }
      } catch (e) {
        // Claude not in PATH
      }
    }
    
    // Default to a dynamic path if nothing found (will fail but with clear error)
    if (!claudePath) {
      claudePath = `/home/${wslUser}/.claude/local/node_modules/.bin/claude`;
      console.log(`⚠️ Claude not found in WSL, using default path: ${claudePath}`);
      console.log('⚠️ Please install Claude CLI in WSL: npm install -g @anthropic-ai/claude-cli');
    }
    
    // Build the command with all the args - quote ones that need it
    const argsStr = args.map(arg => {
      // Only quote args that contain spaces or special characters
      if (arg.includes(' ') || arg.includes(':') || arg.includes('(') || arg.includes(')') || arg.includes(',')) {
        // Escape single quotes properly for bash
        return `'${arg.replace(/'/g, "'\\''")}'`;
      }
      return arg;
    }).join(' ');
    
    // For very long messages, use a temp file to avoid command line length limits
    // Create temp file in WSL /tmp with unique name
    const tempFileName = `/tmp/yume-msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.txt`;
    
    // Write message to temp file, then cat it to Claude, then delete temp file
    // Use base64 encoding to safely pass the message content to WSL
    const messageBase64 = Buffer.from(message).toString('base64');
    
    // Build the WSL command - decode base64, write to temp, pipe to claude, cleanup
    const script = `cd "${wslWorkingDir}" && echo "${messageBase64}" | base64 -d > "${tempFileName}" && cat "${tempFileName}" | ${claudePath} ${argsStr} 2>&1; rm -f "${tempFileName}"`;
    
    console.log(`🔍 WSL script (main message):`);
    console.log(`  Working dir: ${wslWorkingDir}`);
    console.log(`  Claude path: ${claudePath}`);
    console.log(`  Args: ${argsStr}`);
    console.log(`  Message length: ${message.length} chars`);
    console.log(`  Using temp file: ${tempFileName}`);
    
    return [wslPath, ['-e', 'bash', '-c', script], true];
  } else {
    // Title generation - use same path detection
    const { execFileSync } = require('child_process');
    const wslPath = 'C:\\Windows\\System32\\wsl.exe';
    let claudePath = null;
    
    // Get WSL username dynamically
    let wslUser = 'user';
    try {
      wslUser = execFileSync(wslPath, ['-e', 'bash', '-c', 'whoami'], {
        encoding: 'utf8',
        windowsHide: true
      }).trim();
      console.log(`🔍 WSL user detected for title gen: ${wslUser}`);
    } catch (e) {
      console.warn('⚠️ Could not detect WSL user for title gen, using default');
    }
    
    // Use same paths as main message with dynamic user
    const possiblePaths = [
      `/home/${wslUser}/.claude/local/node_modules/.bin/claude`,
      `~/.npm-global/bin/claude`,
      `~/node_modules/.bin/claude`,
      `/usr/local/bin/claude`,
      `/usr/bin/claude`,
      `~/.local/bin/claude`
    ];
    
    for (const path of possiblePaths) {
      try {
        const checkCmd = path.startsWith('~') 
          ? `[ -f "${path.replace('~', '$HOME')}" ] && echo "exists"`
          : `[ -f "${path}" ] && echo "exists"`;
        
        const result = execFileSync(wslPath, ['-e', 'bash', '-c', checkCmd], {
          encoding: 'utf8',
          windowsHide: true
        }).trim();
        
        if (result === 'exists') {
          // For paths with ~, we need to expand to actual home path
          if (path.startsWith('~')) {
            // Get actual home directory
            const homeDir = execFileSync(wslPath, ['-e', 'bash', '-c', 'echo $HOME'], {
              encoding: 'utf8',
              windowsHide: true
            }).trim();
            claudePath = path.replace('~', homeDir);
          } else {
            claudePath = path;
          }
          break;
        }
      } catch (e) {
        // Continue checking
      }
    }
    
    if (!claudePath) {
      try {
        const whichResult = execFileSync(wslPath, ['-e', 'bash', '-c', 'which claude'], {
          encoding: 'utf8',
          windowsHide: true
        }).trim();
        
        if (whichResult) {
          claudePath = whichResult;
        }
      } catch (e) {
        // Not in PATH
      }
    }
    
    if (!claudePath) {
      claudePath = `/home/${wslUser}/.claude/local/node_modules/.bin/claude`;
      console.log(`⚠️ Claude not found for title gen, using default: ${claudePath}`);
    }
    
    // For title generation, use direct WSL with full path
    const script = `cat | ${claudePath} --print --output-format json --model claude-sonnet-4-5-20250929 2>&1`;
    
    console.log(`🔍 WSL script (title gen)`);
    return [wslPath, ['-e', 'bash', '-c', script], false];
  }
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

// Serve built frontend for vscode at /vscode-app
// In dev: proxy to vite, in prod: serve static files
// Read vite port from tauri config or use default
let VITE_DEV_PORT = 50490;
try {
  const tauriConfig = JSON.parse(readFileSync(join(__dirname, 'src-tauri', 'tauri.conf.json'), 'utf-8'));
  const match = tauriConfig?.build?.devUrl?.match(/:(\d+)/);
  if (match) VITE_DEV_PORT = parseInt(match[1]);
} catch (e) { /* ignore */ }
const VITE_DEV_URL = process.env.VITE_DEV_URL || `http://127.0.0.1:${VITE_DEV_PORT}`;

// Helper to proxy requests to vite
async function proxyToVite(req, res, targetPath) {
  const targetUrl = VITE_DEV_URL + targetPath;
  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Accept': req.headers.accept || '*/*',
        'Accept-Encoding': 'identity'
      }
    });

    if (response.ok) {
      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Access-Control-Allow-Origin', '*');
      const buffer = Buffer.from(await response.arrayBuffer());
      return res.send(buffer);
    }
    return false;
  } catch (e) {
    return false;
  }
}

// Proxy vite internal paths (must be before /vscode-app)
app.use(['/@vite', '/@react-refresh', '/@fs', '/src', '/node_modules', '/public'], async (req, res, next) => {
  const result = await proxyToVite(req, res, req.originalUrl);
  if (!result) next();
});

// Serve frontend for vscode at /vscode-app
app.use('/vscode-app', async (req, res, next) => {
  const result = await proxyToVite(req, res, req.url);
  if (result) return;

  // Fallback: serve from dist-renderer in resources (production)
  // Use process.cwd() since Rust sets current_dir to resources folder
  const distPathProd = join(process.cwd(), 'dist-renderer');
  if (existsSync(distPathProd)) {
    return express.static(distPathProd)(req, res, next);
  }

  // Dev fallback: try __dirname/dist/renderer
  const distPathDev = join(__dirname, 'dist', 'renderer');
  if (existsSync(distPathDev)) {
    return express.static(distPathDev)(req, res, next);
  }

  res.status(503).send('Frontend not available');
});

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

// VSCode extension connection tracking
let vscodeConnections = new Set(); // Set of socket.id from vscode clients
let vscodeConnected = false; // Quick flag for vscode connection status
let cachedSettings = null; // Cached settings from main app to sync to vscode

// Add process spawn mutex to prevent race conditions
let isSpawningProcess = false;
const processSpawnQueue = [];

// Track sessions that are currently spawning (before process is registered)
// This prevents the race condition where interrupt is called during spawn
const spawningProcesses = new Map(); // sessionId -> { startTime, aborted }

// Track pending interrupts that need to be processed once spawn completes
const pendingInterrupts = new Map(); // sessionId -> callback

// Track pending streaming=false timers to prevent premature state changes in agentic mode
// When a process exits, we wait before marking streaming=false to allow for follow-up processes
const pendingStreamingFalseTimers = new Map(); // sessionId -> { timer, timestamp }

// Debounce time for streaming=false transitions (ms)
// In agentic mode, processes cycle rapidly. This delay prevents UI flicker.
const STREAMING_FALSE_DEBOUNCE_MS = 600;

// ============================================
// MESSAGE BATCHING - Reduce socket.emit overhead
// ============================================
const messageBatches = new Map(); // sessionId -> { messages: [], timer: null, socket: null }
const BATCH_INTERVAL_MS = 16; // One frame at 60fps

// ============================================
// SESSION TTL CLEANUP - Remove stale sessions
// ============================================
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const SESSION_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // Run cleanup every hour

// Periodic cleanup of stale sessions older than 24 hours
function cleanupStaleSessions() {
  const now = Date.now();
  let cleanedCount = 0;

  for (const [sessionId, session] of sessions.entries()) {
    const lastActivity = session.lastActivity || session.createdAt || 0;
    const age = now - lastActivity;

    if (age > SESSION_TTL_MS) {
      console.log(`🧹 Cleaning up stale session ${sessionId} (inactive for ${Math.round(age / 1000 / 60 / 60)} hours)`);

      // Clean up all associated state
      sessions.delete(sessionId);
      wrapperState.sessions.delete(sessionId);
      messageBatches.delete(sessionId);
      lastAssistantMessageIds.delete(sessionId);
      allAssistantMessageIds.delete(sessionId);
      activeProcesses.delete(sessionId);
      activeProcessStartTimes.delete(sessionId);
      streamHealthChecks.delete(sessionId);
      streamTimeouts.delete(sessionId);
      spawningProcesses.delete(sessionId);
      pendingInterrupts.delete(sessionId);
      cancelPendingStreamingFalse(sessionId);
      cleanupBatch(sessionId);

      cleanedCount++;
    }
  }

  if (cleanedCount > 0) {
    console.log(`🧹 Session TTL cleanup completed: removed ${cleanedCount} stale sessions`);
  }
}

// Start periodic session cleanup
setInterval(cleanupStaleSessions, SESSION_CLEANUP_INTERVAL_MS);
console.log(`⏰ Session TTL cleanup scheduled (every ${SESSION_CLEANUP_INTERVAL_MS / 1000 / 60} minutes, TTL: ${SESSION_TTL_MS / 1000 / 60 / 60} hours)`);

// Add message to batch queue, emit after interval or immediately for priority messages
function queueMessage(sessionId, message, socket, immediate = false) {
  if (!messageBatches.has(sessionId)) {
    messageBatches.set(sessionId, { messages: [], timer: null, socket });
  }

  const batch = messageBatches.get(sessionId);
  batch.socket = socket;

  // Priority messages emit immediately: result, error, system, streaming_end
  const isPriority = immediate ||
    message.type === 'result' ||
    message.type === 'error' ||
    message.type === 'system' ||
    message.streaming_end === true ||
    message.streaming === false;

  if (isPriority) {
    // Flush any pending batch first
    flushBatch(sessionId);
    // Emit priority message immediately
    socket.emit(`message:${sessionId}`, message);
    return;
  }

  // Queue non-priority message
  batch.messages.push(message);

  // Start batch timer if not already running
  if (!batch.timer) {
    batch.timer = setTimeout(() => flushBatch(sessionId), BATCH_INTERVAL_MS);
  }
}

// Flush all batched messages for a session
function flushBatch(sessionId) {
  const batch = messageBatches.get(sessionId);
  if (!batch) return;

  if (batch.timer) {
    clearTimeout(batch.timer);
    batch.timer = null;
  }

  if (batch.messages.length > 0 && batch.socket) {
    // Emit batched messages
    if (batch.messages.length === 1) {
      batch.socket.emit(`message:${sessionId}`, batch.messages[0]);
    } else {
      // Emit as batch for multiple messages
      batch.socket.emit(`messageBatch:${sessionId}`, batch.messages);
    }
    batch.messages = [];
  }
}

// Cleanup batch state for a session
function cleanupBatch(sessionId) {
  const batch = messageBatches.get(sessionId);
  if (batch) {
    if (batch.timer) clearTimeout(batch.timer);
    messageBatches.delete(sessionId);
  }
}

// Helper to cancel pending streaming=false for a session
function cancelPendingStreamingFalse(sessionId) {
  const pending = pendingStreamingFalseTimers.get(sessionId);
  if (pending) {
    clearTimeout(pending.timer);
    pendingStreamingFalseTimers.delete(sessionId);
    console.log(`🔄 [${sessionId}] Cancelled pending streaming=false (new process starting)`);
  }
}

// Helper function to generate title with Sonnet
async function generateTitle(sessionId, userMessage, socket, onSuccess) {
  try {
    console.log(`🏷️ Generating title for session ${sessionId}`);
    console.log(`🏷️ Message preview: "${userMessage}"`);
    
    // Spawn a separate claude process just for title generation
    const titlePrompt = `user message: "${userMessage.substring(0, 200)}"
task: reply with ONLY 1-3 words describing what user wants. lowercase only. no punctuation. be extremely concise. examples: "echo command", "file search", "debug issue"`;
    
    const titleArgs = [
      '-p', titlePrompt,  // Pass prompt via -p flag
      '--print',  // Non-interactive mode
      '--output-format', 'json',
      '--model', 'claude-sonnet-4-5-20250929'
    ];
    
    console.log(`🏷️ Title prompt: "${titlePrompt}"`);
    
    // Ensure Node.js is in PATH for Claude CLI
    const enhancedEnv = { ...process.env };
    const nodeBinDir = '/opt/homebrew/bin';
    if (!enhancedEnv.PATH?.includes(nodeBinDir)) {
      enhancedEnv.PATH = `${nodeBinDir}:${enhancedEnv.PATH || '/usr/bin:/bin'}`;
    }
    
    // Use a dedicated yume-title-gen directory for title generation
    // This keeps title generation sessions separate from main project sessions
    const titleGenDir = join(homedir(), '.yume-title-gen');
    
    // Create the directory if it doesn't exist
    try {
      if (!existsSync(titleGenDir)) {
        mkdirSync(titleGenDir, { recursive: true });
        console.log('📁 Created title generation directory:', titleGenDir);
      }
    } catch (e) {
      console.log('⚠️ Could not create title gen directory, using home:', e.message);
    }
    
    const child = isWindows && CLAUDE_PATH === 'WSL_CLAUDE' ? 
      (() => {
        // Get WSL username dynamically for title gen dir
        const { execSync } = require('child_process');
        let wslUser = 'user';
        try {
          wslUser = execSync(`C:\\Windows\\System32\\wsl.exe -e bash -c "whoami"`, {
            encoding: 'utf8',
            windowsHide: true
          }).trim();
        } catch (e) {
          // Use default
        }
        
        // For WSL, use a dedicated directory in WSL home with dynamic user
        const wslTitleGenDir = `/home/${wslUser}/.yume-title-gen`;
        
        // Create the WSL directory if needed
        try {
          execSync(`C:\\Windows\\System32\\wsl.exe -e bash -c "mkdir -p ${wslTitleGenDir}"`, {
            windowsHide: true
          });
        } catch (e) {
          console.log('⚠️ Could not create WSL title gen directory:', e.message);
        }
        
        const [wslCommand, wslArgs, inputHandled] = createWslClaudeCommand(titleArgs, wslTitleGenDir, null);
        return spawn(wslCommand, wslArgs, {
          cwd: titleGenDir,
          env: enhancedEnv,
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
          detached: false
        });
      })() :
      spawn(CLAUDE_PATH, titleArgs, {
      cwd: titleGenDir,
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
    service: 'yume-claude',
    claudeCodeLoaded: true,
    port: PORT,
    sessions: Object.keys(sessions).length
  });
});

// Claude usage limits endpoint (for vscode mode - mirrors tauri get_claude_usage_limits)
app.get('/claude-usage-limits', async (req, res) => {
  try {
    // Read credentials from macOS keychain
    const { execSync } = require('child_process');
    let credentialsJson;
    try {
      credentialsJson = execSync(
        'security find-generic-password -s "Claude Code-credentials" -w',
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
      ).trim();
    } catch (e) {
      return res.status(401).json({ error: 'No Claude credentials found in keychain' });
    }

    const credentials = JSON.parse(credentialsJson);
    const oauth = credentials.claudeAiOauth;
    if (!oauth || !oauth.accessToken) {
      return res.status(401).json({ error: 'No OAuth credentials found' });
    }

    // Call Anthropic usage API
    const response = await fetch('https://api.anthropic.com/api/oauth/usage', {
      method: 'GET',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
        'User-Agent': 'claude-code/2.0.76',
        'Authorization': `Bearer ${oauth.accessToken}`,
        'anthropic-beta': 'oauth-2025-04-20'
      }
    });

    if (!response.ok) {
      const body = await response.text();
      return res.status(response.status).json({ error: `Usage API returned ${response.status}: ${body}` });
    }

    const apiData = await response.json();
    res.json({
      five_hour: apiData.five_hour,
      seven_day: apiData.seven_day,
      seven_day_opus: apiData.seven_day_opus,
      seven_day_sonnet: apiData.seven_day_sonnet,
      subscription_type: oauth.subscriptionType,
      rate_limit_tier: oauth.rateLimitTier
    });
  } catch (e) {
    console.error('[UsageLimits] Error:', e);
    res.status(500).json({ error: e.message });
  }
});

// VSCode extension status endpoint
app.get('/vscode-status', (req, res) => {
  res.json({
    connected: vscodeConnected,
    count: vscodeConnections.size
  });
});

// VSCode proxy - forwards to vite dev server (uses VITE_DEV_PORT defined earlier)
app.use('/vscode', async (req, res, next) => {
  const targetUrl = `http://127.0.0.1:${VITE_DEV_PORT}${req.url}`;
  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: { ...req.headers, host: `127.0.0.1:${VITE_DEV_PORT}` }
    });

    // Forward headers
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'transfer-encoding') {
        res.setHeader(key, value);
      }
    });

    res.status(response.status);
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (e) {
    // Vite not running, serve 503
    res.status(503).send('yume dev server not running');
  }
});

// VSCode UI entry point - serves the actual yume app via proxy
app.get('/vscode-ui', (req, res) => {
  const cwd = req.query.cwd || '';
  // Redirect to our proxy endpoint which serves the frontend
  res.redirect(`/vscode-app/?vscode=1&cwd=${encodeURIComponent(cwd)}&port=${PORT}`);
});

// Legacy VSCode proxy UI endpoint - minimal fallback
app.get('/vscode-ui-minimal', (req, res) => {
  // Serve a minimal proxy page that connects to the same server
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Yume</title>
  <script src="https://cdn.socket.io/4.7.4/socket.io.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #000;
      --fg: #e0e0e0;
      --fg-dim: #666;
      --accent: #7dd3fc;
      --input-bg: #111;
      --border: #333;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      font-size: 13px;
      background: var(--bg);
      color: var(--fg);
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .header {
      padding: 6px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
      color: var(--fg-dim);
    }
    .status { display: flex; align-items: center; gap: 6px; }
    .status.connected { color: #4ade80; }
    .status.disconnected { color: #f87171; }
    .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 6px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .message {
      padding: 10px 14px;
      border-radius: 8px;
      max-width: 90%;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: 'SF Mono', Consolas, monospace;
      font-size: 12px;
      line-height: 1.5;
    }
    .message.user {
      background: var(--accent);
      color: #000;
      align-self: flex-end;
      border-radius: 8px 8px 2px 8px;
    }
    .message.assistant {
      background: var(--input-bg);
      border: 1px solid var(--border);
      align-self: flex-start;
      border-radius: 8px 8px 8px 2px;
    }
    .message.system {
      background: transparent;
      color: var(--fg-dim);
      font-size: 11px;
      align-self: center;
      font-style: italic;
    }
    .message.tool {
      background: #1a1a2e;
      border: 1px solid #2a2a4e;
      font-size: 11px;
      color: #a0a0c0;
    }
    .input-area {
      padding: 6px;
      border-top: 1px solid var(--border);
      display: flex;
      gap: 8px;
    }
    textarea {
      flex: 1;
      background: var(--input-bg);
      color: var(--fg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 10px;
      font-family: inherit;
      font-size: 13px;
      resize: none;
      min-height: 44px;
      max-height: 200px;
    }
    textarea:focus { outline: none; border-color: var(--accent); }
    button {
      background: var(--accent);
      color: #000;
      border: none;
      border-radius: 6px;
      padding: 10px 20px;
      cursor: pointer;
      font-weight: 500;
      font-size: 12px;
    }
    button:hover { opacity: 0.9; }
    button:disabled { opacity: 0.4; cursor: not-allowed; }
    .streaming { opacity: 0.7; }
    .empty {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--fg-dim);
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="status disconnected" id="status">
      <span class="dot"></span>
      <span id="status-text">connecting...</span>
    </div>
    <span id="session-info"></span>
  </div>
  <div class="messages" id="messages">
    <div class="empty">yume vscode proxy</div>
  </div>
  <div class="input-area">
    <textarea id="input" placeholder="type a message..." rows="1"></textarea>
    <button id="send" disabled>send</button>
  </div>
  <script>
    const PORT = window.location.port || ${PORT};
    let socket = null;
    let sessionId = null;
    let streaming = false;
    let streamingContent = '';

    const messagesEl = document.getElementById('messages');
    const inputEl = document.getElementById('input');
    const sendBtn = document.getElementById('send');
    const statusEl = document.getElementById('status');
    const statusTextEl = document.getElementById('status-text');
    const sessionInfoEl = document.getElementById('session-info');

    function setStatus(connected, text) {
      statusEl.className = 'status ' + (connected ? 'connected' : 'disconnected');
      statusTextEl.textContent = text;
      sendBtn.disabled = !connected || streaming;
    }

    function addMessage(role, content, id) {
      const empty = messagesEl.querySelector('.empty');
      if (empty) empty.remove();

      let el = id ? document.getElementById('msg-' + id) : null;
      if (!el) {
        el = document.createElement('div');
        el.className = 'message ' + role;
        if (id) el.id = 'msg-' + id;
        messagesEl.appendChild(el);
      }
      el.textContent = content;
      el.className = 'message ' + role + (streaming && role === 'assistant' ? ' streaming' : '');
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return el;
    }

    function connect() {
      socket = io('http://localhost:' + PORT, { transports: ['websocket'], query: { client: 'vscode-ui' } });

      socket.on('connect', () => {
        setStatus(true, 'connected');
        socket.emit('vscode:connected');

        // Create session
        socket.emit('createSession', {
          workingDirectory: new URLSearchParams(window.location.search).get('cwd') || '~'
        }, (res) => {
          if (res?.sessionId) {
            sessionId = res.sessionId;
            sessionInfoEl.textContent = sessionId.slice(0, 8);
            setupMessageHandlers();
          }
        });
      });

      socket.on('disconnect', () => setStatus(false, 'disconnected'));
      socket.on('connect_error', (e) => setStatus(false, 'error: ' + e.message));
    }

    function setupMessageHandlers() {
      socket.on('message:' + sessionId, handleMessage);
      socket.on('messageBatch:' + sessionId, (batch) => batch.forEach(handleMessage));
    }

    function handleMessage(data) {
      const msg = data.message || data;
      const type = msg.type;

      if (type === 'assistant') {
        streaming = true;
        sendBtn.disabled = true;
        const content = msg.message?.content || msg.content || '';
        if (typeof content === 'string') {
          streamingContent = content;
          addMessage('assistant', content, 'streaming');
        }
      } else if (type === 'result' || type === 'streaming_end') {
        streaming = false;
        sendBtn.disabled = false;
        const el = document.getElementById('msg-streaming');
        if (el) el.id = '';
        streamingContent = '';
      } else if (type === 'user') {
        // already shown
      } else if (type === 'tool_use' || type === 'tool_result') {
        const name = msg.message?.name || msg.name || 'tool';
        addMessage('tool', name + ': ' + (msg.message?.input ? JSON.stringify(msg.message.input).slice(0,100) : '...'));
      }
    }

    function send() {
      const text = inputEl.value.trim();
      if (!text || !sessionId || streaming) return;

      addMessage('user', text);
      socket.emit('sendMessage', { sessionId, message: text });
      inputEl.value = '';
      inputEl.style.height = 'auto';
    }

    sendBtn.onclick = send;
    inputEl.onkeydown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    };
    inputEl.oninput = () => {
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(inputEl.scrollHeight, 200) + 'px';
    };

    connect();
  </script>
</body>
</html>`);
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
    const { rm } = fs.promises;
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
    const { unlink } = fs.promises;
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
      // Load from WSL
      // Get WSL username dynamically
      let wslUser = 'user';
      try {
        const { execSync } = require('child_process');
        wslUser = execSync(`C:\\Windows\\System32\\wsl.exe -e bash -c "whoami"`, {
          encoding: 'utf8',
          windowsHide: true
        }).trim();
      } catch (e) {
        console.warn('Could not detect WSL user, using default');
      }
      const sessionPath = `/home/${wslUser}/.claude/projects/${projectPath}/${sessionId}.jsonl`;
      console.log('  - WSL path:', sessionPath);
      
      // Read the file from WSL
      try {
        const { execSync } = require('child_process');
        
        const readCmd = `powershell.exe -NoProfile -Command "& {wsl.exe -e bash -c 'cat \\"${sessionPath}\\" 2>/dev/null'}"`;
        const content = execSync(readCmd, {
          encoding: 'utf8',
          windowsHide: true,
          maxBuffer: 50 * 1024 * 1024 // 50MB buffer
        });
      console.log('Raw file content:', content.replace(/\n/g, '\\n').replace(/\r/g, '\\r'));
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

      // Track context usage for Windows/WSL sessions too
      let lastContextSnapshot = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, total: 0 };

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
          
          // Filter out empty user messages (these are often just placeholders after tool use)
          if (data.role === 'user') {
            // Check if content is missing, undefined, or empty
            if (!data.content) {
              // Skip user messages without content
              currentPos = jsonEnd;
              if (currentPos < content.length && content[currentPos] === '$') currentPos++;
              if (currentPos < content.length && content[currentPos] === '\n') currentPos++;
              if (currentPos < content.length && content[currentPos] === '\r') currentPos++;
              continue;
            }
            
            // Check if content is empty or just whitespace
            const contentStr = typeof data.content === 'string' ? data.content : 
                             Array.isArray(data.content) && data.content.length > 0 ? 
                             data.content.map(c => c.text || '').join('') : '';
            if (!contentStr.trim()) {
              // Skip empty user messages
              currentPos = jsonEnd;
              if (currentPos < content.length && content[currentPos] === '$') currentPos++;
              if (currentPos < content.length && content[currentPos] === '\n') currentPos++;
              if (currentPos < content.length && content[currentPos] === '\r') currentPos++;
              continue;
            }
          }

          // Skip meta messages (system/internal messages like local-command-caveat)
          if (data.isMeta === true) {
            currentPos = jsonEnd;
            if (currentPos < content.length && content[currentPos] === '$') currentPos++;
            if (currentPos < content.length && content[currentPos] === '\n') currentPos++;
            if (currentPos < content.length && content[currentPos] === '\r') currentPos++;
            continue;
          }

          // Skip user messages that only contain system tags (not actual user content)
          if (data.type === 'user' || data.role === 'user') {
            const msgContent = data.message?.content || data.content || '';
            const contentStr = typeof msgContent === 'string' ? msgContent :
                             (Array.isArray(msgContent) ? msgContent.map(c => c.text || '').join('') : '');
            // Skip messages that start with XML-like tags (system/meta messages)
            if (/^\s*<[a-z][a-z0-9-]*>/i.test(contentStr)) {
              currentPos = jsonEnd;
              if (currentPos < content.length && content[currentPos] === '$') currentPos++;
              if (currentPos < content.length && content[currentPos] === '\n') currentPos++;
              if (currentPos < content.length && content[currentPos] === '\r') currentPos++;
              continue;
            }
          }

          // Get context snapshot from assistant messages (overwrite with latest)
          // Context = cache_read + cache_creation + input (current context window size)
          if (data.type === 'assistant' && data.message?.usage) {
            const usage = data.message.usage;
            const input = usage.input_tokens || 0;
            const output = usage.output_tokens || 0;
            const cacheRead = usage.cache_read_input_tokens || 0;
            const cacheCreation = usage.cache_creation_input_tokens || 0;
            // Context window = cache_read + cache_creation + input (NOT output)
            lastContextSnapshot = {
              input,
              output,
              cacheRead,
              cacheCreation,
              total: cacheRead + cacheCreation + input
            };
          }

          // Add valid session data
          messages.push(data);
          validMessages++;

          if (validMessages <= 5) {
            // Log first few for debugging
            if (data.type === 'summary') {
              console.log(`Line ${lineNumber}: Added summary:`, data.summary || '');
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
            console.log('JSON output:', jsonStr);
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
      
      // Extract title from messages
      let title = null;
      
      // Check for title in last message (often metadata/title is stored there)
      if (messages.length > 0) {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg.type === 'title' && lastMsg.title) {
          title = lastMsg.title;
        } else if (lastMsg.type === 'metadata' && lastMsg.title) {
          title = lastMsg.title;
        } else if (lastMsg.title && !lastMsg.role) {
          title = lastMsg.title;
        }
      }
      
      // If no title found, check for summary type messages
      if (!title) {
        const summaryMsg = messages.find(m => m.type === 'summary' && m.summary);
        if (summaryMsg) {
          title = summaryMsg.summary;
        }
      }
      
      // If still no title, use first user message
      if (!title) {
        const firstUserMsg = messages.find(m => m.role === 'user' && m.content);
        if (firstUserMsg) {
          const content = typeof firstUserMsg.content === 'string' ? firstUserMsg.content :
                         Array.isArray(firstUserMsg.content) ? 
                         firstUserMsg.content.find(c => c.type === 'text')?.text || '' : '';
          if (content) {
            title = content.substring(0, 100);
          }
        }
      }
      
      // Default title if none found
      if (!title) {
        title = 'Untitled session';
      }
      
        res.json({
          sessionId,
          projectPath: actualPath,
          messages,
          sessionCount: messages.length,
          title,
          usage: {
            // Return CURRENT context snapshot, not accumulated totals
            inputTokens: lastContextSnapshot.input,
            outputTokens: lastContextSnapshot.output,
            cacheReadTokens: lastContextSnapshot.cacheRead,
            cacheCreationTokens: lastContextSnapshot.cacheCreation,
            totalContextTokens: lastContextSnapshot.total // This is the actual context window usage
          }
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
      const { readFile } = fs.promises;
      
      try {
        const content = await readFile(sessionPath, 'utf8');
        
        // Use the same parsing logic as Windows
        const messages = [];
        const lines = content.split(/\$|\n/).filter(line => line.trim());

        // Track context usage - we need the LAST context snapshot, not accumulated totals
        // The context window shows CURRENT context size from the most recent message
        let lastContextSnapshot = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, total: 0 };

        for (const line of lines) {
          try {
            const data = JSON.parse(line);

            // Filter out empty user messages (check data.type, not data.role)
            // JSONL format has type: 'user' at top level, content at data.message.content
            if (data.type === 'user') {
              const msgContent = data.message?.content;
              // Check if content is missing, undefined, or empty
              if (!msgContent) {
                continue; // Skip user messages without content
              }

              const contentStr = typeof msgContent === 'string' ? msgContent :
                               Array.isArray(msgContent) && msgContent.length > 0 ?
                               msgContent.map(c => c.text || '').join('') : '';
              if (!contentStr.trim()) {
                continue; // Skip empty user messages
              }
            }

            // Skip queue-operation and other non-message types
            if (data.type === 'queue-operation') {
              continue;
            }

            // Skip meta messages (system/internal messages like local-command-caveat)
            if (data.isMeta === true) {
              continue;
            }

            // Skip user messages that only contain system tags (not actual user content)
            if (data.type === 'user') {
              const msgContent = data.message?.content || '';
              const contentStr = typeof msgContent === 'string' ? msgContent :
                               (Array.isArray(msgContent) ? msgContent.map(c => c.text || '').join('') : '');
              // Skip messages that start with XML-like tags (system/meta messages)
              if (/^\s*<[a-z][a-z0-9-]*>/i.test(contentStr)) {
                continue;
              }
            }

            // Get context snapshot from assistant messages (overwrite with latest)
            // Context = cache_read + cache_creation + input (current context window size)
            if (data.type === 'assistant' && data.message?.usage) {
              const usage = data.message.usage;
              const input = usage.input_tokens || 0;
              const output = usage.output_tokens || 0;
              const cacheRead = usage.cache_read_input_tokens || 0;
              const cacheCreation = usage.cache_creation_input_tokens || 0;
              // Context window = cache_read + cache_creation + input (NOT output)
              lastContextSnapshot = {
                input,
                output,
                cacheRead,
                cacheCreation,
                total: cacheRead + cacheCreation + input
              };
            }

            messages.push(data);
          } catch (err) {
            // Skip invalid lines
          }
        }

        // Generate synthetic result messages for each turn (user -> assistant sequence)
        // This allows the frontend to display metadata like tokens, model, etc.
        const processedMessages = [];
        let turnStartTimestamp = null;
        let currentTurnToolCount = 0;
        let currentTurnUsage = null;
        let currentTurnModel = null;

        for (let i = 0; i < messages.length; i++) {
          const msg = messages[i];
          processedMessages.push(msg);

          // Track turn start when we see a user message
          if (msg.type === 'user') {
            // Check if this is a tool_result (continuation) or new user message
            const content = msg.message?.content;
            const isToolResult = Array.isArray(content) && content.some(c => c.type === 'tool_result');
            if (!isToolResult) {
              turnStartTimestamp = msg.timestamp;
              currentTurnToolCount = 0;
              currentTurnUsage = null;
              currentTurnModel = null;
            } else {
              // Tool results don't start new turns
              currentTurnToolCount++;
            }
          }

          // Track assistant message data
          if (msg.type === 'assistant') {
            if (msg.message?.usage) {
              currentTurnUsage = msg.message.usage;
            }
            if (msg.message?.model) {
              currentTurnModel = msg.message.model;
            }
            // Count tool_use blocks
            const content = msg.message?.content;
            if (Array.isArray(content)) {
              currentTurnToolCount += content.filter(c => c.type === 'tool_use').length;
            }

            // Check if this is the last assistant message before next user message (or end)
            const nextMsg = messages[i + 1];
            const isEndOfTurn = !nextMsg ||
              (nextMsg.type === 'user' &&
               !(Array.isArray(nextMsg.message?.content) &&
                 nextMsg.message.content.some(c => c.type === 'tool_result')));

            if (isEndOfTurn && currentTurnUsage) {
              // Calculate duration from turn start to this message
              let durationMs = 0;
              if (turnStartTimestamp && msg.timestamp) {
                const startTime = new Date(turnStartTimestamp).getTime();
                const endTime = new Date(msg.timestamp).getTime();
                durationMs = endTime - startTime;
              }

              // Calculate cost based on model and tokens
              const input = currentTurnUsage.input_tokens || 0;
              const output = currentTurnUsage.output_tokens || 0;
              const cacheRead = currentTurnUsage.cache_read_input_tokens || 0;
              const cacheCreation = currentTurnUsage.cache_creation_input_tokens || 0;

              let costUsd = 0;
              if (currentTurnModel?.includes('opus')) {
                // Opus pricing: $15/M input, $75/M output, cache read $1.5/M, cache create $18.75/M
                costUsd = (input * 15 + output * 75 + cacheRead * 1.5 + cacheCreation * 18.75) / 1000000;
              } else {
                // Sonnet pricing: $3/M input, $15/M output, cache read $0.3/M, cache create $3.75/M
                costUsd = (input * 3 + output * 15 + cacheRead * 0.3 + cacheCreation * 3.75) / 1000000;
              }

              // Create synthetic result message
              processedMessages.push({
                type: 'result',
                subtype: 'success',
                is_error: false,
                duration_ms: durationMs,
                usage: currentTurnUsage,
                total_cost_usd: costUsd,
                model: currentTurnModel,
                tool_count: currentTurnToolCount,
                num_turns: Math.floor((i + 1) / 2), // Approximate turn count
                id: `result-${msg.uuid || i}`,
                timestamp: msg.timestamp
              });
            }
          }
        }

        // Extract title from original messages (before processing added result messages)
        let title = null;

        // Check for title in last message
        if (messages.length > 0) {
          const lastMsg = messages[messages.length - 1];
          if (lastMsg.type === 'title' && lastMsg.title) {
            title = lastMsg.title;
          } else if (lastMsg.type === 'metadata' && lastMsg.title) {
            title = lastMsg.title;
          } else if (lastMsg.title && !lastMsg.type) {
            title = lastMsg.title;
          }
        }

        // If no title found, check for summary type messages
        if (!title) {
          const summaryMsg = messages.find(m => m.type === 'summary' && m.summary);
          if (summaryMsg) {
            title = summaryMsg.summary;
          }
        }

        // If still no title, use first user message
        if (!title) {
          const firstUserMsg = messages.find(m => m.type === 'user' && m.message?.content);
          if (firstUserMsg) {
            const msgContent = firstUserMsg.message.content;
            const contentText = typeof msgContent === 'string' ? msgContent :
                           Array.isArray(msgContent) ?
                           msgContent.find(c => c.type === 'text')?.text || '' : '';
            if (contentText) {
              title = contentText.substring(0, 100);
            }
          }
        }

        // Default title if none found
        if (!title) {
          title = 'Untitled session';
        }

        const actualPath = projectPath
          .replace(/^([A-Z])--/, '$1:/')
          .replace(/^-/, '/')
          .replace(/-/g, '/');

        res.json({
          sessionId,
          projectPath: actualPath,
          messages: processedMessages, // Use processed messages with synthetic result messages
          sessionCount: processedMessages.length,
          title,
          usage: {
            // Return CURRENT context snapshot, not accumulated totals
            inputTokens: lastContextSnapshot.input,
            outputTokens: lastContextSnapshot.output,
            cacheReadTokens: lastContextSnapshot.cacheRead,
            cacheCreationTokens: lastContextSnapshot.cacheCreation,
            totalContextTokens: lastContextSnapshot.total // This is the actual context window usage
          }
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

// Get token usage from session file - lightweight endpoint for stats refresh
app.get('/session-tokens/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { workingDirectory } = req.query;

    if (!workingDirectory) {
      return res.status(400).json({ error: 'workingDirectory query param required' });
    }

    // Convert working directory to project path format (e.g., /Users/yuru/yume -> -Users-yuru-yume)
    const projectPath = workingDirectory.replace(/^\//, '-').replace(/\//g, '-');
    const sessionPath = join(homedir(), '.claude', 'projects', projectPath, `${sessionId}.jsonl`);

    console.log('[session-tokens] Fetching tokens for:', { sessionId, workingDirectory, projectPath, sessionPath });

    if (!existsSync(sessionPath)) {
      return res.json({ found: false, usage: null });
    }

    const { readFile } = fs.promises;
    const content = await readFile(sessionPath, 'utf8');
    const lines = content.split(/\$|\n/).filter(line => line.trim());

    // Track context usage from the LAST assistant message (snapshot, not accumulated)
    let lastContextSnapshot = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, total: 0 };

    for (const line of lines) {
      try {
        const data = JSON.parse(line);

        // Get context snapshot from assistant messages (overwrite with latest)
        if (data.type === 'assistant' && data.message?.usage) {
          const usage = data.message.usage;
          const input = usage.input_tokens || 0;
          const output = usage.output_tokens || 0;
          const cacheRead = usage.cache_read_input_tokens || 0;
          const cacheCreation = usage.cache_creation_input_tokens || 0;
          // Context window = cache_read + cache_creation + input (NOT output)
          lastContextSnapshot = {
            input,
            output,
            cacheRead,
            cacheCreation,
            total: cacheRead + cacheCreation + input
          };
        }
      } catch (err) {
        // Skip invalid lines
      }
    }

    const contextPercentage = (lastContextSnapshot.total / 200000) * 100;

    console.log('[session-tokens] Returning:', lastContextSnapshot);

    res.json({
      found: true,
      usage: {
        input_tokens: lastContextSnapshot.input,
        output_tokens: lastContextSnapshot.output,
        cache_read_input_tokens: lastContextSnapshot.cacheRead,
        cache_creation_input_tokens: lastContextSnapshot.cacheCreation,
        total_context: lastContextSnapshot.total,
        context_percentage: contextPercentage
      }
    });
  } catch (error) {
    console.error('[session-tokens] Error:', error);
    res.status(500).json({ error: 'Failed to get session tokens', details: error.message });
  }
});

// Load a yume-cli session (gemini/openai) - these are stored as JSON in ~/.yume/sessions/
app.get('/yume-session/:provider/:sessionId', async (req, res) => {
  try {
    const { provider, sessionId } = req.params;

    console.log('Loading yume-cli session:');
    console.log('  - Provider:', provider);
    console.log('  - SessionId:', sessionId);

    // Validate provider - SECURITY: also check for path separators
    if (!['gemini', 'openai'].includes(provider) || provider.includes('/') || provider.includes('\\')) {
      return res.status(400).json({ error: 'Invalid provider. Must be gemini or openai' });
    }

    // SECURITY: Validate sessionId - only allow safe characters (alphanumeric, hyphens, underscores)
    if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
      console.error('Invalid session ID format (potential path traversal):', sessionId);
      return res.status(400).json({ error: 'Invalid session ID format' });
    }

    // SECURITY: Use basename as additional safety and verify path stays in expected directory
    const safeSessionId = require('path').basename(sessionId);
    const expectedDir = join(homedir(), '.yume', 'sessions', provider);
    const sessionPath = join(expectedDir, `${safeSessionId}.json`);

    // SECURITY: Verify resolved path is within expected directory
    if (!sessionPath.startsWith(expectedDir + require('path').sep)) {
      console.error('Path traversal attempt detected:', sessionPath);
      return res.status(400).json({ error: 'Invalid session path' });
    }
    console.log('  - Full path:', sessionPath);

    if (!existsSync(sessionPath)) {
      console.error('Yume session not found:', sessionPath);
      return res.status(404).json({ error: 'session not found' });
    }

    // Read the session file
    const { readFile } = fs.promises;

    try {
      const content = await readFile(sessionPath, 'utf8');
      const sessionData = JSON.parse(content);

      console.log('  - Loaded session with', sessionData.history?.length || 0, 'messages');

      // Transform yume-cli format to Yume internal format
      const messages = [];

      if (sessionData.history && Array.isArray(sessionData.history)) {
        for (const msg of sessionData.history) {
          // Convert history items to Yume message format
          if (msg.role === 'user') {
            messages.push({
              type: 'user',
              timestamp: new Date().toISOString(),
              message: {
                content: msg.content
              }
            });
          } else if (msg.role === 'assistant' || msg.role === 'model') {
            messages.push({
              type: 'assistant',
              timestamp: new Date().toISOString(),
              message: {
                content: [{ type: 'text', text: msg.content }],
                model: sessionData.model
              }
            });
          }
        }
      }

      // Extract title from first user message if available
      let title = sessionData.title || 'Untitled session';
      if (!sessionData.title && messages.length > 0) {
        const firstUserMsg = messages.find(m => m.type === 'user');
        if (firstUserMsg && firstUserMsg.message?.content) {
          const contentText = typeof firstUserMsg.message.content === 'string'
            ? firstUserMsg.message.content
            : firstUserMsg.message.content;
          if (contentText) {
            title = contentText.substring(0, 100);
          }
        }
      }

      // Return in the same format as claude-session endpoint
      res.json({
        sessionId: sessionData.id,
        projectPath: sessionData.cwd || '/',
        messages: messages,
        sessionCount: messages.length,
        title: title,
        provider: sessionData.provider,
        model: sessionData.model,
        usage: {
          inputTokens: sessionData.usage?.inputTokens || 0,
          outputTokens: sessionData.usage?.outputTokens || 0,
          cacheReadTokens: sessionData.usage?.cacheReadTokens || 0,
          cacheCreationTokens: sessionData.usage?.cacheCreationTokens || 0,
          totalContextTokens: (sessionData.usage?.inputTokens || 0) +
                              (sessionData.usage?.cacheReadTokens || 0) +
                              (sessionData.usage?.cacheCreationTokens || 0)
        }
      });
    } catch (readError) {
      console.error('Error reading yume session file:', readError);
      res.status(500).json({ error: 'Failed to read session', details: readError.message });
    }
  } catch (error) {
    console.error('Error loading yume session:', error);
    res.status(500).json({ error: 'Failed to load session', details: error.message });
  }
});

// Analytics cache to prevent repeated heavy computation
let analyticsCache = null;
let analyticsCacheTime = 0;
const ANALYTICS_CACHE_TTL_MS = 60000; // Cache for 1 minute
let analyticsInProgress = false;

// Analytics endpoint - reads all Claude sessions and extracts token usage
// Uses caching to prevent stack overflow from repeated heavy computation
app.get('/claude-analytics', async (req, res) => {
  console.log('📊 Analytics request received');

  // Return cached data if fresh enough
  const now = Date.now();
  if (analyticsCache && (now - analyticsCacheTime) < ANALYTICS_CACHE_TTL_MS) {
    console.log('📊 Returning cached analytics (age: ' + Math.round((now - analyticsCacheTime) / 1000) + 's)');
    return res.json(analyticsCache);
  }

  // Prevent concurrent analytics computations (can cause stack overflow)
  if (analyticsInProgress) {
    console.log('📊 Analytics computation in progress, returning stale cache or empty');
    if (analyticsCache) {
      return res.json(analyticsCache);
    }
    return res.json({
      totalSessions: 0,
      totalMessages: 0,
      totalTokens: 0,
      totalCost: 0,
      tokenBreakdown: { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 },
      byModel: {},
      byProvider: {
        claude: { sessions: 0, tokens: 0, cost: 0, tokenBreakdown: { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 } },
        gemini: { sessions: 0, tokens: 0, cost: 0, tokenBreakdown: { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 } },
        openai: { sessions: 0, tokens: 0, cost: 0, tokenBreakdown: { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 } }
      },
      byDate: {},
      byProject: {},
      cached: true,
      computing: true
    });
  }

  analyticsInProgress = true;
  console.log('📊 Computing fresh analytics...');

  // Helper to yield to event loop - resets V8 call stack (fixes pkg binary stack overflow)
  const yieldToEventLoop = () => new Promise(resolve => setImmediate(resolve));

  try {
    const analytics = {
      totalSessions: 0,
      totalMessages: 0,
      totalTokens: 0,
      totalCost: 0,
      tokenBreakdown: {
        input: 0,
        output: 0,
        cacheCreation: 0,
        cacheRead: 0
      },
      byModel: {},
      byProvider: {
        claude: { sessions: 0, tokens: 0, cost: 0, tokenBreakdown: { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 } },
        gemini: { sessions: 0, tokens: 0, cost: 0, tokenBreakdown: { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 } },
        openai: { sessions: 0, tokens: 0, cost: 0, tokenBreakdown: { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 } }
      },
      byDate: {},
      byProject: {}
    };

    // Global dedup set - tracks messageId:requestId across ALL files (ccusage compatible)
    const globalProcessedHashes = new Set();
    // Track sessions we've already counted (for session count dedup)
    const countedSessions = new Set();

    const createTokenBreakdown = () => ({
      input: 0,
      output: 0,
      cacheCreation: 0,
      cacheRead: 0
    });

    const createModelTotals = () => ({
      sessions: 0,
      tokens: 0,
      cost: 0,
      tokenBreakdown: createTokenBreakdown()
    });

    // Normalize model name to a readable key
    const normalizeModelName = (modelString) => {
      if (!modelString) return 'unknown';
      const lower = modelString.toLowerCase();
      // Claude models
      if (lower.includes('opus')) return 'opus';
      if (lower.includes('sonnet')) return 'sonnet';
      if (lower.includes('haiku')) return 'haiku';
      // Gemini models (check specific patterns for 2.5-pro/flash format)
      if (lower.includes('2.5-pro') || lower.includes('gemini-pro')) return 'gemini-pro';
      if (lower.includes('2.5-flash') || lower.includes('gemini-flash')) return 'gemini-flash';
      if (lower.includes('gemini')) return 'gemini';
      // OpenAI/Codex models (check mini first since it's more specific)
      if (lower.includes('5.1-codex') || lower.includes('codex-mini')) return 'gpt-codex-mini';
      if (lower.includes('5.2-codex') || lower.includes('codex')) return 'gpt-codex';
      if (lower.includes('gpt')) return 'gpt';
      // Return original if no match
      return modelString;
    };

    // Ensure model stats exist in analytics.byModel
    const ensureModelStats = (analytics, modelKey) => {
      if (!analytics.byModel[modelKey]) {
        analytics.byModel[modelKey] = createModelTotals();
      }
      return analytics.byModel[modelKey];
    };

    // Ensure model stats exist in dateStats.byModel
    const ensureDateModelStats = (dateStats, modelKey) => {
      if (!dateStats.byModel[modelKey]) {
        dateStats.byModel[modelKey] = createModelTotals();
      }
      return dateStats.byModel[modelKey];
    };

    // Scan yume-cli sessions for analytics
    // IMPORTANT: Uses SYNC file ops to avoid V8 stack overflow in pkg binary
    // The async promise queue causes crashes when closing many file handles
    const scanYumeCliAnalytics = (provider, analytics, pricing) => {
      const sessionsDir = join(homedir(), '.yume', 'sessions', provider);

      if (!existsSync(sessionsDir)) {
        console.log(`📊 No ${provider} sessions directory found at ${sessionsDir}`);
        return;
      }

      try {
        const files = fs.readdirSync(sessionsDir);
        const jsonFiles = files.filter(f => f.endsWith('.json'));

        console.log(`📊 Scanning ${jsonFiles.length} ${provider} session files...`);

        for (const file of jsonFiles) {
          try {
            const filePath = join(sessionsDir, file);
            const content = fs.readFileSync(filePath, 'utf8');
            const session = JSON.parse(content);

            // Get usage from session
            const usage = session.usage || {};
            const inputTokens = usage.inputTokens || 0;
            const outputTokens = usage.outputTokens || 0;
            const cacheReadTokens = usage.cacheReadTokens || 0;
            const cacheCreationTokens = usage.cacheCreationTokens || 0;

            // Skip sessions with no usage data
            if (inputTokens === 0 && outputTokens === 0 && cacheReadTokens === 0 && cacheCreationTokens === 0) {
              continue;
            }

            // Calculate cost using provider pricing
            const providerPricing = pricing[provider];
            const cost = (inputTokens * providerPricing.input) +
                         (outputTokens * providerPricing.output) +
                         (cacheReadTokens * providerPricing.cacheRead) +
                         (cacheCreationTokens * providerPricing.cacheCreation);

            // Update provider stats
            analytics.byProvider[provider].sessions++;
            analytics.byProvider[provider].tokens += inputTokens + outputTokens;
            analytics.byProvider[provider].cost += cost;
            analytics.byProvider[provider].tokenBreakdown.input += inputTokens;
            analytics.byProvider[provider].tokenBreakdown.output += outputTokens;
            analytics.byProvider[provider].tokenBreakdown.cacheRead += cacheReadTokens;
            analytics.byProvider[provider].tokenBreakdown.cacheCreation += cacheCreationTokens;

            // Update totals
            analytics.totalSessions++;
            analytics.totalTokens += inputTokens + outputTokens;
            analytics.totalCost += cost;
            analytics.tokenBreakdown.input += inputTokens;
            analytics.tokenBreakdown.output += outputTokens;
            analytics.tokenBreakdown.cacheRead += cacheReadTokens;
            analytics.tokenBreakdown.cacheCreation += cacheCreationTokens;

            // Update byDate
            const sessionDate = new Date(session.updated || session.created || Date.now());
            const dateKey = formatDateKey(sessionDate);
            if (!analytics.byDate[dateKey]) {
              analytics.byDate[dateKey] = createDateStats();
            }
            analytics.byDate[dateKey].sessions++;
            analytics.byDate[dateKey].tokens += inputTokens + outputTokens;
            analytics.byDate[dateKey].cost += cost;
            analytics.byDate[dateKey].tokenBreakdown.input += inputTokens;
            analytics.byDate[dateKey].tokenBreakdown.output += outputTokens;
            analytics.byDate[dateKey].tokenBreakdown.cacheRead += cacheReadTokens;
            analytics.byDate[dateKey].tokenBreakdown.cacheCreation += cacheCreationTokens;

            // Update byProject using session.cwd
            if (session.cwd) {
              const projectName = session.cwd.split('/').pop() || session.cwd;
              if (!analytics.byProject[projectName]) {
                analytics.byProject[projectName] = {
                  sessions: 0,
                  messages: 0,
                  tokens: 0,
                  cost: 0,
                  lastUsed: 0,
                  byDate: {}
                };
              }
              analytics.byProject[projectName].sessions++;
              analytics.byProject[projectName].tokens += inputTokens + outputTokens;
              analytics.byProject[projectName].cost += cost;
              analytics.byProject[projectName].lastUsed = Math.max(
                analytics.byProject[projectName].lastUsed,
                sessionDate.getTime()
              );
            }

            // Count messages
            const messageCount = (session.history || []).filter(
              m => m.role === 'user' || m.role === 'assistant'
            ).length;
            analytics.totalMessages += messageCount;
            if (session.cwd) {
              const projectName = session.cwd.split('/').pop() || session.cwd;
              if (analytics.byProject[projectName]) {
                analytics.byProject[projectName].messages += messageCount;
              }
            }
          } catch (err) {
            console.log(`Could not parse ${provider} analytics session ${file}:`, err.message);
          }
        }

        console.log(`📊 ${provider} sessions: ${analytics.byProvider[provider].sessions} sessions, ${analytics.byProvider[provider].tokens} tokens`);
      } catch (err) {
        console.error(`Error scanning ${provider} sessions:`, err.message);
      }
    };

    const createDateStats = () => ({
      sessions: 0,
      messages: 0,
      tokens: 0,
      cost: 0,
      tokenBreakdown: createTokenBreakdown(),
      byModel: {}
    });

    const createProjectStats = (lastUsed) => ({
      sessions: 0,
      messages: 0,
      tokens: 0,
      cost: 0,
      lastUsed,
      byDate: {}
    });

    const createProjectDateStats = () => ({
      sessions: 0,
      messages: 0,
      tokens: 0,
      cost: 0,
      tokenBreakdown: createTokenBreakdown()
    });

    const MAX_ANALYTICS_JSONL_LINE_LENGTH = 256 * 1024;
    const sanitizeAnalyticsLine = (rawLine, contextLabel) => {
      const trimmed = rawLine.trim();
      if (!trimmed) return null;
      if (trimmed.length > MAX_ANALYTICS_JSONL_LINE_LENGTH) {
        debugLog(`[Analytics] Skipping oversized line in ${contextLabel} (${trimmed.length} chars)`);
        return null;
      }
      return trimmed;
    };

    const addTokenBreakdown = (target, delta) => {
      target.input += delta.input;
      target.output += delta.output;
      target.cacheCreation += delta.cacheCreation;
      target.cacheRead += delta.cacheRead;
    };

    const formatDateKey = (dateObj) => {
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const ensureDateStats = (dateKey) => {
      if (!analytics.byDate[dateKey]) {
        analytics.byDate[dateKey] = createDateStats();
      }
      return analytics.byDate[dateKey];
    };

    const ensureProjectStats = (projectName, lastUsed) => {
      if (!analytics.byProject[projectName]) {
        analytics.byProject[projectName] = createProjectStats(lastUsed);
      } else if (typeof lastUsed === 'number' && lastUsed > analytics.byProject[projectName].lastUsed) {
        analytics.byProject[projectName].lastUsed = lastUsed;
      }
      return analytics.byProject[projectName];
    };

    const ensureProjectDateStats = (projectStats, dateKey) => {
      if (!projectStats.byDate[dateKey]) {
        projectStats.byDate[dateKey] = createProjectDateStats();
      }
      return projectStats.byDate[dateKey];
    };

    // Pricing per token (matching ccusage methodology)
    // Claude Sonnet 4.5: $3/M input, $15/M output, $3.75/M cache_creation, $0.30/M cache_read
    // Claude Opus 4.5: $15/M input, $75/M output, $18.75/M cache_creation, $1.50/M cache_read
    // Gemini 2.5 Pro: $1.25/M input, $10/M output
    // Gemini 2.5 Flash: $0.15/M input, $0.60/M output ($3.50/M thinking output)
    // GPT-5.2-Codex: $1.75/M input, $14/M output
    // GPT-5.1-Codex-Mini: $0.25/M input, $2/M output
    const pricing = {
      // Claude Sonnet 4.5: $3/M input, $15/M output, $3.75/M cache_creation, $0.30/M cache_read
      sonnet: {
        input: 3e-6,
        output: 15e-6,
        cacheCreation: 3.75e-6,
        cacheRead: 0.30e-6
      },
      // Claude Opus 4.5 (Nov 2025 pricing): $5/M input, $25/M output, $6.25/M cache_creation, $0.50/M cache_read
      opus: {
        input: 5e-6,
        output: 25e-6,
        cacheCreation: 6.25e-6,
        cacheRead: 0.50e-6
      },
      // Claude Haiku 4.5: $0.80/M input, $4/M output, $1/M cache_creation, $0.08/M cache_read
      haiku: {
        input: 0.80e-6,
        output: 4e-6,
        cacheCreation: 1e-6,
        cacheRead: 0.08e-6
      },
      // Gemini 2.5 Pro
      'gemini-pro': {
        input: 1.25e-6,       // $1.25/M
        output: 10e-6,        // $10/M
        cacheCreation: 0.625e-6,  // estimated 50% of input
        cacheRead: 0.3125e-6      // estimated 25% of input
      },
      // Gemini 2.5 Flash
      'gemini-flash': {
        input: 0.15e-6,       // $0.15/M
        output: 0.60e-6,      // $0.60/M (standard), $3.50/M (thinking)
        cacheCreation: 0.075e-6,
        cacheRead: 0.0375e-6
      },
      // Fallback for generic gemini
      gemini: {
        input: 1.25e-6,       // Use pro pricing as fallback
        output: 10e-6,
        cacheCreation: 0.625e-6,
        cacheRead: 0.3125e-6
      },
      // GPT-5.2-Codex
      'gpt-codex': {
        input: 1.75e-6,       // $1.75/M
        output: 14e-6,        // $14/M
        cacheCreation: 0,
        cacheRead: 0
      },
      // GPT-5.1-Codex-Mini
      'gpt-codex-mini': {
        input: 0.25e-6,       // $0.25/M
        output: 2e-6,         // $2/M
        cacheCreation: 0,
        cacheRead: 0
      },
      // Fallback for generic gpt/openai
      openai: {
        input: 1.75e-6,       // Use codex pricing as fallback
        output: 14e-6,
        cacheCreation: 0,
        cacheRead: 0
      },
      gpt: {
        input: 1.75e-6,
        output: 14e-6,
        cacheCreation: 0,
        cacheRead: 0
      },
      // Default rates for unknown models (use sonnet rates as fallback)
      default: {
        input: 3e-6,
        output: 15e-6,
        cacheCreation: 3.75e-6,
        cacheRead: 0.30e-6
      }
    };
    
    // Determine the Claude projects directory based on platform
    // IMPORTANT: Uses SYNC file ops to avoid V8 stack overflow in pkg binary
    let projectsDir;
    if (isWindows) {
      // Directly access WSL filesystem through Windows mount - no wsl.exe commands

      // Try different WSL mount paths and users
      const possibleUsers = ['yuru', 'muuko', process.env.USER, process.env.USERNAME].filter(Boolean);
      const possibleDistros = ['Ubuntu', 'Ubuntu-20.04', 'Ubuntu-22.04', 'Ubuntu-24.04'];
      const possiblePrefixes = ['\\\\wsl$', '\\\\wsl.localhost'];

      console.log('📊 Analytics: Searching for WSL Claude projects...');
      console.log('  Possible users:', possibleUsers);
      console.log('  Possible distros:', possibleDistros);

      let wslProjectsPath = null;
      let attemptCount = 0;

      for (const prefix of possiblePrefixes) {
        for (const distro of possibleDistros) {
          for (const user of possibleUsers) {
            const testPath = `${prefix}\\${distro}\\home\\${user}\\.claude\\projects`;
            attemptCount++;
            try {
              fs.statSync(testPath);
              wslProjectsPath = testPath;
              console.log(`✅ Found WSL Claude projects at: ${testPath} (attempt ${attemptCount})`);
              break;
            } catch (e) {
              // Silent - try next combination
            }
          }
          if (wslProjectsPath) break;
        }
        if (wslProjectsPath) break;
      }

      if (!wslProjectsPath) {
        console.log(`❌ WSL Claude projects not found after ${attemptCount} attempts`);
      }

      if (wslProjectsPath) {
        try {
          const projectDirs = fs.readdirSync(wslProjectsPath);
          console.log(`Found ${projectDirs.length} projects in WSL directory`);

          // Process projects (limit to prevent memory issues)
          const maxProjects = 10;
          let wslProjectCount = 0;
          for (const projectName of projectDirs.slice(0, maxProjects)) {
            // Yield every 3 projects to reset V8 call stack
            if (wslProjectCount > 0 && wslProjectCount % 3 === 0) {
              await yieldToEventLoop();
            }
            wslProjectCount++;

            const projectPath = path.win32.join(wslProjectsPath, projectName);

            try {
              const stats = fs.statSync(projectPath);
              if (!stats.isDirectory()) continue;

              console.log(`Processing WSL project: ${projectName}`);

              // Get session files
              const sessionFiles = fs.readdirSync(projectPath);
              const jsonlFiles = sessionFiles.filter(f => f.endsWith('.jsonl'));
              console.log(`  Found ${jsonlFiles.length} session files`);

              // Process sessions (limit to prevent memory issues)
              const maxSessions = 20;
              let wslSessionCount = 0;
              for (const sessionFile of jsonlFiles.slice(0, maxSessions)) {
                // Yield every 5 sessions to reset V8 call stack
                if (wslSessionCount > 0 && wslSessionCount % 5 === 0) {
                  await yieldToEventLoop();
                }
                wslSessionCount++;
                try {
                  const sessionPath = path.win32.join(projectPath, sessionFile);
                  const fileStats = fs.statSync(sessionPath);

                  // Skip very large files
                  if (fileStats.size > 10 * 1024 * 1024) {
                    console.log(`  Skipping large file: ${sessionFile} (${fileStats.size} bytes)`);
                    continue;
                  }

                  console.log(`  Reading session: ${sessionFile} (${fileStats.size} bytes)`);
                  const content = fs.readFileSync(sessionPath, 'utf8');

                  // Parse JSONL file - ccusage compatible per-message processing
                  const allLines = content.split('\n');
                  const sessionLastUsed = fileStats.mtime.getTime();
                  const cleanProjectName = projectName.replace(/-/g, '/');
                  let sessionHasData = false;
                  let messageCount = 0;
                  const countedMessageRequestIds = new Set();

                  for (const rawLine of allLines) {
                    const sanitizedLine = sanitizeAnalyticsLine(rawLine, `${projectName}/${sessionFile}`);
                    if (!sanitizedLine) continue;

                    try {
                      const data = JSON.parse(sanitizedLine);

                      // Count messages
                      if (data.type === 'user') {
                        messageCount++;
                      } else if (data.type === 'assistant' && data.requestId) {
                        if (!countedMessageRequestIds.has(data.requestId)) {
                          countedMessageRequestIds.add(data.requestId);
                          messageCount++;
                        }
                      }

                      // ccusage compatible: check if message has usage.input_tokens
                      const usage = data.message?.usage;
                      if (!usage || typeof usage.input_tokens !== 'number') continue;

                      // Global dedup by messageId:requestId
                      const messageId = data.message?.id;
                      const requestId = data.requestId;
                      if (messageId && requestId) {
                        const hashKey = `${messageId}:${requestId}`;
                        if (globalProcessedHashes.has(hashKey)) continue;
                        globalProcessedHashes.add(hashKey);
                      }

                      const messageDate = data.timestamp ? formatDateKey(new Date(data.timestamp)) : formatDateKey(new Date());
                      const model = normalizeModelName(data.message?.model);
                      const inputTokens = usage.input_tokens || 0;
                      const outputTokens = usage.output_tokens || 0;
                      const cacheCreationTokens = usage.cache_creation_input_tokens || 0;
                      const cacheReadTokens = usage.cache_read_input_tokens || 0;
                      const totalTokens = inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens;

                      if (totalTokens === 0) continue;
                      sessionHasData = true;

                      const rates = pricing[model] || pricing.default;
                      const cost = (inputTokens * rates.input) +
                                   (outputTokens * rates.output) +
                                   (cacheCreationTokens * rates.cacheCreation) +
                                   (cacheReadTokens * rates.cacheRead);

                      const msgBreakdown = { input: inputTokens, output: outputTokens, cacheCreation: cacheCreationTokens, cacheRead: cacheReadTokens };

                      analytics.totalTokens += totalTokens;
                      analytics.totalCost += cost;
                      addTokenBreakdown(analytics.tokenBreakdown, msgBreakdown);

                      const modelStats = ensureModelStats(analytics, model);
                      modelStats.tokens += totalTokens;
                      modelStats.cost += cost;
                      addTokenBreakdown(modelStats.tokenBreakdown, msgBreakdown);

                      const providerStats = analytics.byProvider.claude;
                      providerStats.tokens += totalTokens;
                      providerStats.cost += cost;
                      addTokenBreakdown(providerStats.tokenBreakdown, msgBreakdown);

                      const dateStats = ensureDateStats(messageDate);
                      dateStats.tokens += totalTokens;
                      dateStats.cost += cost;
                      addTokenBreakdown(dateStats.tokenBreakdown, msgBreakdown);
                      const dateModelStats = ensureDateModelStats(dateStats, model);
                      dateModelStats.tokens += totalTokens;
                      dateModelStats.cost += cost;

                      const projectStats = ensureProjectStats(cleanProjectName, sessionLastUsed);
                      projectStats.tokens += totalTokens;
                      projectStats.cost += cost;
                      const projectDateStats = ensureProjectDateStats(projectStats, messageDate);
                      projectDateStats.tokens += totalTokens;
                      projectDateStats.cost += cost;
                      addTokenBreakdown(projectDateStats.tokenBreakdown, msgBreakdown);
                    } catch (e) {
                      // Skip invalid JSON
                    }
                  }

                  if (sessionHasData) {
                    const sessionKey = `${projectName}/${sessionFile}`;
                    if (!countedSessions.has(sessionKey)) {
                      countedSessions.add(sessionKey);
                      analytics.totalSessions++;
                      analytics.totalMessages += messageCount;
                      analytics.byProvider.claude.sessions++;

                      const sessionDate = formatDateKey(new Date(sessionLastUsed));
                      const dateStats = ensureDateStats(sessionDate);
                      dateStats.sessions++;
                      dateStats.messages += messageCount;

                      const projectStats = ensureProjectStats(cleanProjectName, sessionLastUsed);
                      projectStats.sessions++;
                      projectStats.messages += messageCount;

                      // Also update project's byDate sessions/messages for time-range filtering
                      const projectDateStats = ensureProjectDateStats(projectStats, sessionDate);
                      projectDateStats.sessions++;
                      projectDateStats.messages += messageCount;
                    }
                  }
                } catch (e) {
                  console.error(`  Error processing session ${sessionFile}:`, e.message);
                }
              }
            } catch (e) {
              console.error(`Error processing project ${projectName}:`, e.message);
            }
          }
        } catch (e) {
          console.error('Error reading WSL projects directory:', e.message);
          // Fall through to Windows fallback
          wslProjectsPath = null;
        }
      }
      
      // If WSL mount didn't work, try Windows path as fallback
      if (!wslProjectsPath) {
        console.log('WSL mount not accessible, trying Windows path...');
        const windowsProjectsPath = path.win32.join(homedir(), '.claude', 'projects');

        try {
          const projectDirs = fs.readdirSync(windowsProjectsPath);
          console.log(`Found ${projectDirs.length} projects in Windows directory`);

          // Process limited number of projects
          for (const projectName of projectDirs.slice(0, 5)) {
            const projectPath = path.win32.join(windowsProjectsPath, projectName);
            const stats = fs.statSync(projectPath);

            if (!stats.isDirectory()) continue;

            console.log(`Processing Windows project: ${projectName}`);

            // Get session files
            const sessionFiles = fs.readdirSync(projectPath);
            const jsonlFiles = sessionFiles.filter(f => f.endsWith('.jsonl'));
            console.log(`  Found ${jsonlFiles.length} session files`);

            // Process limited number of sessions
            for (const sessionFile of jsonlFiles.slice(0, 10)) {
              try {
                const sessionPath = path.win32.join(projectPath, sessionFile);
                const fileStats = fs.statSync(sessionPath);

                // Skip very large files
                if (fileStats.size > 10 * 1024 * 1024) {
                  console.log(`  Skipping large file: ${sessionFile} (${fileStats.size} bytes)`);
                  continue;
                }

                console.log(`  Reading session: ${sessionFile} (${fileStats.size} bytes)`);
                const content = fs.readFileSync(sessionPath, 'utf8');

                // Parse JSONL file - ccusage compatible per-message processing
                const allLines = content.split('\n');
                const sessionLastUsed = fileStats.mtime.getTime();
                const cleanProjectName = projectName.replace(/-/g, '/');
                let sessionHasData = false;
                let messageCount = 0;
                const countedMessageRequestIds = new Set();

                for (const rawLine of allLines) {
                  const sanitizedLine = sanitizeAnalyticsLine(rawLine, `${projectName}/${sessionFile}`);
                  if (!sanitizedLine) continue;

                  try {
                    const data = JSON.parse(sanitizedLine);

                    // Count messages
                    if (data.type === 'user') {
                      messageCount++;
                    } else if (data.type === 'assistant' && data.requestId) {
                      if (!countedMessageRequestIds.has(data.requestId)) {
                        countedMessageRequestIds.add(data.requestId);
                        messageCount++;
                      }
                    }

                    // ccusage compatible: check if message has usage.input_tokens
                    const usage = data.message?.usage;
                    if (!usage || typeof usage.input_tokens !== 'number') continue;

                    // Global dedup by messageId:requestId
                    const messageId = data.message?.id;
                    const requestId = data.requestId;
                    if (messageId && requestId) {
                      const hashKey = `${messageId}:${requestId}`;
                      if (globalProcessedHashes.has(hashKey)) continue;
                      globalProcessedHashes.add(hashKey);
                    }

                    const messageDate = data.timestamp ? formatDateKey(new Date(data.timestamp)) : formatDateKey(new Date());
                    const model = normalizeModelName(data.message?.model);
                    const inputTokens = usage.input_tokens || 0;
                    const outputTokens = usage.output_tokens || 0;
                    const cacheCreationTokens = usage.cache_creation_input_tokens || 0;
                    const cacheReadTokens = usage.cache_read_input_tokens || 0;
                    const totalTokens = inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens;

                    if (totalTokens === 0) continue;
                    sessionHasData = true;

                    const rates = pricing[model] || pricing.default;
                    const cost = (inputTokens * rates.input) +
                                 (outputTokens * rates.output) +
                                 (cacheCreationTokens * rates.cacheCreation) +
                                 (cacheReadTokens * rates.cacheRead);

                    const msgBreakdown = { input: inputTokens, output: outputTokens, cacheCreation: cacheCreationTokens, cacheRead: cacheReadTokens };

                    analytics.totalTokens += totalTokens;
                    analytics.totalCost += cost;
                    addTokenBreakdown(analytics.tokenBreakdown, msgBreakdown);

                    const modelStats = ensureModelStats(analytics, model);
                    modelStats.tokens += totalTokens;
                    modelStats.cost += cost;
                    addTokenBreakdown(modelStats.tokenBreakdown, msgBreakdown);

                    const providerStats = analytics.byProvider.claude;
                    providerStats.tokens += totalTokens;
                    providerStats.cost += cost;
                    addTokenBreakdown(providerStats.tokenBreakdown, msgBreakdown);

                    const dateStats = ensureDateStats(messageDate);
                    dateStats.tokens += totalTokens;
                    dateStats.cost += cost;
                    addTokenBreakdown(dateStats.tokenBreakdown, msgBreakdown);
                    const dateModelStats = ensureDateModelStats(dateStats, model);
                    dateModelStats.tokens += totalTokens;
                    dateModelStats.cost += cost;

                    const projectStats = ensureProjectStats(cleanProjectName, sessionLastUsed);
                    projectStats.tokens += totalTokens;
                    projectStats.cost += cost;
                    const projectDateStats = ensureProjectDateStats(projectStats, messageDate);
                    projectDateStats.tokens += totalTokens;
                    projectDateStats.cost += cost;
                    addTokenBreakdown(projectDateStats.tokenBreakdown, msgBreakdown);
                  } catch (e) {
                    // Skip invalid JSON
                  }
                }

                if (sessionHasData) {
                  const sessionKey = `${projectName}/${sessionFile}`;
                  if (!countedSessions.has(sessionKey)) {
                    countedSessions.add(sessionKey);
                    analytics.totalSessions++;
                    analytics.totalMessages += messageCount;
                    analytics.byProvider.claude.sessions++;

                    const sessionDate = formatDateKey(new Date(sessionLastUsed));
                    const dateStats = ensureDateStats(sessionDate);
                    dateStats.sessions++;
                    dateStats.messages += messageCount;

                    const projectStats = ensureProjectStats(cleanProjectName, sessionLastUsed);
                    projectStats.sessions++;
                    projectStats.messages += messageCount;

                    // Also update project's byDate sessions/messages for time-range filtering
                    const projectDateStats = ensureProjectDateStats(projectStats, sessionDate);
                    projectDateStats.sessions++;
                    projectDateStats.messages += messageCount;
                  }
                }
              } catch (e) {
                console.error(`  Error processing session ${sessionFile}:`, e.message);
              }
            }
          }
        } catch (e) {
          console.error('Error reading Windows projects:', e.message);
        }
      }
    } else {
      // Non-Windows: read directly from filesystem
      // IMPORTANT: Uses SYNC file ops to avoid V8 stack overflow in pkg binary
      // The async promise queue causes crashes when closing many file handles
      const projectsDir = join(homedir(), '.claude', 'projects');

      // Limits to prevent stack overflow in pkg binary
      const MAX_PROJECTS = 50;
      const MAX_FILES_PER_PROJECT = 10000;  // Increased to handle large projects with many subagents
      const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB max file size
      let projectCount = 0;

      // Recursive function to find all .jsonl files in a directory (ccusage compatible)
      const findJsonlFilesRecursively = (dir, files = [], depth = 0) => {
        if (depth > 5) return files; // Prevent infinite recursion
        try {
          const entries = fs.readdirSync(dir);
          for (const entry of entries) {
            const fullPath = join(dir, entry);
            try {
              const st = fs.statSync(fullPath);
              if (st.isDirectory()) {
                findJsonlFilesRecursively(fullPath, files, depth + 1);
              } else if (entry.endsWith('.jsonl')) {
                files.push(fullPath);
              }
            } catch (e) { /* skip inaccessible */ }
          }
        } catch (e) { /* skip inaccessible dirs */ }
        return files;
      };

      try {
        const projectDirs = fs.readdirSync(projectsDir);

        for (const projectName of projectDirs) {
          if (projectCount >= MAX_PROJECTS) {
            console.log(`📊 Reached max projects limit (${MAX_PROJECTS}), stopping`);
            break;
          }

          // Yield every 5 projects to reset V8 call stack (prevents pkg binary crash)
          if (projectCount > 0 && projectCount % 5 === 0) {
            await yieldToEventLoop();
          }

          const projectPath = join(projectsDir, projectName);
          let stats;
          try {
            stats = fs.statSync(projectPath);
          } catch (e) {
            continue; // Skip inaccessible paths
          }

          if (!stats.isDirectory()) continue;
          projectCount++;

          // Get all session files RECURSIVELY (including subagents/)
          const jsonlFiles = findJsonlFilesRecursively(projectPath).slice(0, MAX_FILES_PER_PROJECT);

          let sessionCount = 0;
          for (const sessionPath of jsonlFiles) {
            // Yield every 10 sessions to reset V8 call stack
            if (sessionCount > 0 && sessionCount % 10 === 0) {
              await yieldToEventLoop();
            }
            sessionCount++;
            try {
              // sessionPath is now a full path from recursive search
              const sessionFileName = require('path').basename(sessionPath);
              const fileStats = fs.statSync(sessionPath);

              // Skip large files to prevent memory issues
              if (fileStats.size > MAX_FILE_SIZE) {
                console.log(`📊 Skipping large file: ${sessionFileName} (${Math.round(fileStats.size / 1024 / 1024)}MB)`);
                continue;
              }

              const content = fs.readFileSync(sessionPath, 'utf8');

              // Parse JSONL file - Claude CLI format
              // NEW: Process each message individually and assign to its OWN date (ccusage compatible)
              const lines = content.split('\n');
              const sessionLastUsed = fileStats.mtime.getTime();
              const cleanProjectName = projectName.replace(/-/g, '/');
              let sessionHasData = false;
              let messageCount = 0;
              const countedMessageRequestIds = new Set();

              for (const rawLine of lines) {
                const sanitizedLine = sanitizeAnalyticsLine(rawLine, `${projectName}/${sessionFileName}`);
                if (!sanitizedLine) continue;

                try {
                  const data = JSON.parse(sanitizedLine);

                  // Count messages (user and assistant)
                  if (data.type === 'user') {
                    messageCount++;
                  } else if (data.type === 'assistant' && data.requestId) {
                    if (!countedMessageRequestIds.has(data.requestId)) {
                      countedMessageRequestIds.add(data.requestId);
                      messageCount++;
                    }
                  }

                  // ccusage compatible: check if message has usage.input_tokens (not type-specific)
                  const usage = data.message?.usage;
                  if (!usage || typeof usage.input_tokens !== 'number') continue;

                  // Global dedup by messageId:requestId (ccusage algorithm)
                  const messageId = data.message?.id;
                  const requestId = data.requestId;
                  if (messageId && requestId) {
                    const hashKey = `${messageId}:${requestId}`;
                    if (globalProcessedHashes.has(hashKey)) continue;
                    globalProcessedHashes.add(hashKey);
                  }

                  // Get message date from its own timestamp (not session-level)
                  const messageDate = data.timestamp ? formatDateKey(new Date(data.timestamp)) : formatDateKey(new Date());

                  // Get model and calculate cost for this message
                  const model = normalizeModelName(data.message?.model);
                  const inputTokens = usage.input_tokens || 0;
                  const outputTokens = usage.output_tokens || 0;
                  const cacheCreationTokens = usage.cache_creation_input_tokens || 0;
                  const cacheReadTokens = usage.cache_read_input_tokens || 0;
                  const totalTokens = inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens;

                  if (totalTokens === 0) continue;
                  sessionHasData = true;

                  const rates = pricing[model] || pricing.default;
                  const cost = (inputTokens * rates.input) +
                               (outputTokens * rates.output) +
                               (cacheCreationTokens * rates.cacheCreation) +
                               (cacheReadTokens * rates.cacheRead);

                  const msgBreakdown = {
                    input: inputTokens,
                    output: outputTokens,
                    cacheCreation: cacheCreationTokens,
                    cacheRead: cacheReadTokens
                  };

                  // Update totals
                  analytics.totalTokens += totalTokens;
                  analytics.totalCost += cost;
                  addTokenBreakdown(analytics.tokenBreakdown, msgBreakdown);

                  // Update model stats
                  const modelStats = ensureModelStats(analytics, model);
                  modelStats.tokens += totalTokens;
                  modelStats.cost += cost;
                  addTokenBreakdown(modelStats.tokenBreakdown, msgBreakdown);

                  // Update provider stats (Claude)
                  const providerStats = analytics.byProvider.claude;
                  providerStats.tokens += totalTokens;
                  providerStats.cost += cost;
                  addTokenBreakdown(providerStats.tokenBreakdown, msgBreakdown);

                  // Update date stats (per-message date assignment)
                  const dateStats = ensureDateStats(messageDate);
                  dateStats.tokens += totalTokens;
                  dateStats.cost += cost;
                  addTokenBreakdown(dateStats.tokenBreakdown, msgBreakdown);
                  const dateModelStats = ensureDateModelStats(dateStats, model);
                  dateModelStats.tokens += totalTokens;
                  dateModelStats.cost += cost;

                  // Update project stats
                  const projectStats = ensureProjectStats(cleanProjectName, sessionLastUsed);
                  projectStats.tokens += totalTokens;
                  projectStats.cost += cost;
                  const projectDateStats = ensureProjectDateStats(projectStats, messageDate);
                  projectDateStats.tokens += totalTokens;
                  projectDateStats.cost += cost;
                  addTokenBreakdown(projectDateStats.tokenBreakdown, msgBreakdown);
                } catch (e) {
                  // Skip invalid lines
                }
              }

              // Count session and messages once per session file
              if (sessionHasData) {
                const sessionKey = sessionPath;  // Use full path as unique key
                if (!countedSessions.has(sessionKey)) {
                  countedSessions.add(sessionKey);
                  analytics.totalSessions++;
                  analytics.totalMessages += messageCount;
                  analytics.byProvider.claude.sessions++;

                  // Note: session/message counts for dates/projects are approximations
                  // since messages span multiple dates - we count session for the file's mtime date
                  const sessionDate = formatDateKey(new Date(sessionLastUsed));
                  const dateStats = ensureDateStats(sessionDate);
                  dateStats.sessions++;
                  dateStats.messages += messageCount;

                  const projectStats = ensureProjectStats(cleanProjectName, sessionLastUsed);
                  projectStats.sessions++;
                  projectStats.messages += messageCount;

                  // Also update project's byDate sessions/messages for time-range filtering
                  const projectDateStats = ensureProjectDateStats(projectStats, sessionDate);
                  projectDateStats.sessions++;
                  projectDateStats.messages += messageCount;
                }
              }
            } catch (e) {
              console.error(`Error processing session ${sessionFile}:`, e.message);
            }
          }
        }
      } catch (e) {
        console.error('Error reading projects directory:', e);
      }
    }

    // Scan yume-cli sessions (Gemini and OpenAI) - sync to avoid stack overflow
    scanYumeCliAnalytics('gemini', analytics, pricing);
    scanYumeCliAnalytics('openai', analytics, pricing);

    console.log(`📊 Analytics loaded: ${analytics.totalSessions} sessions, ${analytics.totalTokens} tokens`);
    console.log(`📊 Provider breakdown - Claude: ${analytics.byProvider.claude.sessions}, Gemini: ${analytics.byProvider.gemini.sessions}, OpenAI: ${analytics.byProvider.openai.sessions}`);

    // Cache the result
    analyticsCache = analytics;
    analyticsCacheTime = Date.now();
    analyticsInProgress = false;

    res.json(analytics);
  } catch (error) {
    analyticsInProgress = false;
    console.error('Error loading analytics:', error);
    res.status(500).json({ error: 'Failed to load analytics', details: error.message });
  }
});

// Quick projects endpoint - returns just project count and names quickly
app.get('/claude-projects-quick', async (req, res) => {
  try {
    // Get pagination params from query string
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    // On Windows, load from WSL where Claude actually stores projects
    if (isWindows) {
      console.log('🔍 Windows detected - loading projects from WSL');
      
      // Get WSL username dynamically
      let wslUser = 'user';
      try {
        const { execSync } = require('child_process');
        wslUser = execSync(`C:\\Windows\\System32\\wsl.exe -e bash -c "whoami"`, {
          encoding: 'utf8',
          windowsHide: true
        }).trim();
      } catch (e) {
        console.warn('Could not detect WSL user, using default');
      }
      const wslProjectsDir = `/home/${wslUser}/.claude/projects`;
      
      try {
        const { execFileSync } = require('child_process');
        
        // Get list of projects - we'll get their real last-used time from sessions
        // Use wsl.exe directly with execFileSync to avoid shell interpretation
        const wslPath = 'C:\\Windows\\System32\\wsl.exe';
        // Get all directories including "-" - quote the path to handle spaces
        const bashCmd = `cd "${wslProjectsDir}" && for d in *; do [ -d "$d" ] && echo "$d"; done`;
        console.log('📂 Getting projects from WSL:', wslProjectsDir);
        
        const output = execFileSync(wslPath, ['-e', 'bash', '-c', bashCmd], {
          encoding: 'utf8',
          windowsHide: true
        }).trim();
        
        if (!output) {
          console.log('❌ No projects found in WSL');
          return res.json({ projects: [], count: 0 });
        }
        
        // Parse the output (just directory names now)
        const projectDirs = output.split('\n')
          .filter(line => line.trim())
          .filter(projectName => {
            // CRITICAL: Filter out temp directories, server directories, and title gen directories
            const lowerName = projectName.toLowerCase();
            if (lowerName.includes('temp') || 
                lowerName.includes('tmp') || 
                lowerName.includes('yume-server') ||
                lowerName.includes('yume-title-gen') ||
                lowerName === '-yume-title-gen' ||
                lowerName.includes('appdata') ||
                lowerName.includes('-mnt-c-users-') && lowerName.includes('-appdata-local-temp')) {
              console.log(`🚫 Filtering out temp/server/title-gen directory: ${projectName}`);
              return false;
            }
            return true;
          });
        
        const projects = [];
        
        for (const projectName of projectDirs) {
            // Get the most recent session's timestamp for sorting
            let lastModified = 0;
            try {
              // Get the most recent .jsonl file's timestamp
              const timestampCmd = `cd ${wslProjectsDir}/${projectName} && ls -t *.jsonl 2>/dev/null | head -1 | xargs -r stat -c %Y 2>/dev/null`;
              const timestamp = execFileSync(wslPath, ['-e', 'bash', '-c', timestampCmd], {
                encoding: 'utf8',
                windowsHide: true
              }).trim();
              
              if (timestamp && !isNaN(timestamp)) {
                lastModified = parseInt(timestamp) * 1000;
              }
            } catch (e) {
              // No sessions or error - use 0 timestamp
              lastModified = 0;
            }
            
            // Count sessions for this project
            let sessionCount = 0;
            try {
              const countBashCmd = `ls -1 ${wslProjectsDir}/"${projectName}"/*.jsonl 2>/dev/null | wc -l`;
              const count = execFileSync(wslPath, ['-e', 'bash', '-c', countBashCmd], {
                encoding: 'utf8',
                windowsHide: true
              }).trim();
              sessionCount = parseInt(count) || 0;
            } catch (e) {
              // Ignore count errors
            }
            
            // Skip projects with no sessions and no recent activity
            if (sessionCount === 0 && lastModified === 0) {
              continue;
            }
            
            projects.push({
              name: projectName,
              path: projectName,
              lastModified: lastModified,
              sessionCount: sessionCount,
              sessions: []
            });
          }
          
        // Sort by most recently used (based on session timestamps)
        projects.sort((a, b) => b.lastModified - a.lastModified);
        
        console.log(`✅ Found ${projects.length} projects in WSL`);
        
        // Apply pagination
        const totalCount = projects.length;
        const paginatedProjects = projects.slice(offset, offset + limit);
        
        console.log(`📄 Returning ${paginatedProjects.length} projects (offset: ${offset}, limit: ${limit}, total: ${totalCount})`);
        
        // Send response immediately
        res.json({ 
          projects: paginatedProjects, 
          count: totalCount 
        });
        
        return;
        
      } catch (error) {
        console.error('❌ ERROR loading Windows projects:', error.message);
        console.error('Stack:', error.stack);
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
    
    const { readdir, stat } = fs.promises;
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

// Get recent conversations across all projects for resume modal
app.get('/claude-recent-conversations', async (req, res) => {
  try {
    // Check for project filter (current directory)
    const filterProject = req.query.project;
    const limit = filterProject ? 9 : 9;

    console.log(filterProject
      ? `📂 Loading recent conversations for project: ${filterProject}`
      : '📂 Loading recent conversations across all projects');

    const projectsDir = join(homedir(), '.claude', 'projects');

    if (!existsSync(projectsDir)) {
      console.log('No projects directory found');
      return res.json({ conversations: [] });
    }

    const conversations = [];
    const { readdir, stat, readFile } = fs.promises;

    // Get all project directories (or just the filtered one)
    let projectDirs = await readdir(projectsDir);

    // If filtering by project, only process that project
    if (filterProject) {
      // Convert working directory path to Claude's escaped format
      const escapedPath = filterProject.replace(/\//g, '-');
      projectDirs = projectDirs.filter(dir => dir === escapedPath);
      if (projectDirs.length === 0) {
        console.log('Project not found:', filterProject, 'escaped:', escapedPath);
        return res.json({ conversations: [] });
      }
    }

    for (const projectDir of projectDirs) {
      // Skip temp/system directories
      const lowerName = projectDir.toLowerCase();
      if (lowerName.includes('temp') ||
          lowerName.includes('tmp') ||
          lowerName.includes('yume-server') ||
          lowerName.includes('yume-title-gen')) {
        continue;
      }

      const projectPath = join(projectsDir, projectDir);

      try {
        const projectStat = await stat(projectPath);
        if (!projectStat.isDirectory()) continue;

        // Get session files in this project (exclude agent subagent files)
        const files = await readdir(projectPath);
        const sessionFiles = files.filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'));

        // Get file stats and sort by modification time (skip empty files)
        const fileStats = await Promise.all(
          sessionFiles.map(async (f) => {
            try {
              const filePath = join(projectPath, f);
              const fileStat = await stat(filePath);
              // Skip empty files
              if (fileStat.size === 0) return null;
              return {
                filename: f,
                path: filePath,
                mtime: fileStat.mtime.getTime()
              };
            } catch {
              return null;
            }
          })
        );

        // Sort by most recent - take more files initially since many may be empty
        // We'll filter down to limit later after checking content
        const maxPerProject = filterProject ? 50 : 10;
        const sortedFiles = fileStats
          .filter(Boolean)
          .sort((a, b) => b.mtime - a.mtime)
          .slice(0, maxPerProject);

        // Parse each session file
        for (const fileInfo of sortedFiles) {
          try {
            const content = await readFile(fileInfo.path, 'utf8');
            const lines = content.trim().split('\n').filter(l => l.trim());

            if (lines.length === 0) continue;

            const sessionId = fileInfo.filename.replace('.jsonl', '');
            let title = 'Untitled conversation';
            let summary = '';
            let messageCount = 0;
            let totalContextTokens = 0; // Track context usage from last result message

            // Count messages and look for title
            for (const line of lines) {
              try {
                const data = JSON.parse(line);

                // Skip meta messages (system tags like local-command-caveat)
                if (data.isMeta === true) {
                  continue;
                }

                // Extract context tokens from result messages with usage
                if (data.type === 'result' && data.usage) {
                  const usage = data.usage;
                  const input = usage.input_tokens || 0;
                  const cacheRead = usage.cache_read_input_tokens || 0;
                  const cacheCreation = usage.cache_creation_input_tokens || 0;
                  // Context = input + cacheRead + cacheCreation (same formula as wrapperIntegration)
                  totalContextTokens = input + cacheRead + cacheCreation;
                }

                // Check for title in various formats
                if (data.type === 'title' && data.title) {
                  title = data.title;
                } else if (data.type === 'summary' && data.summary) {
                  title = data.summary;
                  summary = data.summary;
                } else if (data.title && !data.role) {
                  title = data.title;
                }

                // Count actual messages (skip meta messages for counting too)
                if (data.role === 'user' || data.role === 'assistant' ||
                    data.type === 'user' || data.type === 'assistant') {

                  // Get content string for filtering
                  const msgContent = data.content || data.message?.content;
                  let contentStr = '';
                  if (typeof msgContent === 'string') {
                    contentStr = msgContent;
                  } else if (Array.isArray(msgContent)) {
                    const textBlock = msgContent.find(c => c.type === 'text');
                    if (textBlock?.text) {
                      contentStr = textBlock.text;
                    }
                  }

                  // Skip messages that start with XML-like tags (system/meta messages)
                  if (/^\s*<[a-z][a-z0-9-]*>/i.test(contentStr)) {
                    continue;
                  }

                  messageCount++;

                  // Get first user message as summary if no title
                  if (!summary && (data.role === 'user' || data.type === 'user')) {
                    if (contentStr) {
                      summary = contentStr.substring(0, 100);
                    }
                  }
                }
              } catch {
                // Skip unparseable lines
              }
            }

            // Use summary as title if no title found
            if (title === 'Untitled conversation' && summary) {
              title = summary.substring(0, 60) + (summary.length > 60 ? '...' : '');
            }

            // Skip system-generated conversations (Warmup, etc.)
            if (title === 'Warmup' || title.toLowerCase().includes('warmup')) {
              continue;
            }

            // Decode project path to get project name
            const projectName = projectDir.replace(/^-/, '/').replace(/-/g, '/').split('/').pop() || projectDir;

            conversations.push({
              id: sessionId,
              title: title,
              summary: summary,
              projectPath: projectDir,
              projectName: projectName,
              timestamp: fileInfo.mtime,
              messageCount: messageCount,
              filePath: fileInfo.path,
              totalContextTokens: totalContextTokens // Context usage from last result
            });
          } catch (err) {
            console.log(`Could not parse session ${fileInfo.filename}:`, err.message);
          }
        }
      } catch (err) {
        // Skip projects we can't read
        continue;
      }
    }

    // Helper function to scan yume-cli sessions (Gemini/OpenAI)
    const scanYumeCliSessions = async (provider, filterProject) => {
      const yumeSessionsDir = join(homedir(), '.yume', 'sessions', provider);
      const foundSessions = [];

      // Check if directory exists
      if (!existsSync(yumeSessionsDir)) {
        console.log(`No ${provider} sessions directory found at ${yumeSessionsDir}`);
        return foundSessions;
      }

      try {
        const sessionFiles = await readdir(yumeSessionsDir);
        const jsonFiles = sessionFiles.filter(f => f.endsWith('.json'));

        for (const filename of jsonFiles) {
          try {
            const filePath = join(yumeSessionsDir, filename);
            const fileStat = await stat(filePath);

            // Skip empty files
            if (fileStat.size === 0) continue;

            const content = await readFile(filePath, 'utf8');
            const session = JSON.parse(content);

            // Filter by project if specified
            if (filterProject && session.cwd !== filterProject) {
              continue;
            }

            // Extract conversation metadata
            const id = session.id || filename.replace('.json', '');
            let title = session.metadata?.title || 'Untitled conversation';
            let summary = '';
            let messageCount = 0;
            // Get context tokens from session usage (yume-cli stores cumulative usage)
            let totalContextTokens = 0;
            if (session.usage) {
              const input = session.usage.input_tokens || 0;
              const cacheRead = session.usage.cache_read_input_tokens || 0;
              const cacheCreation = session.usage.cache_creation_input_tokens || 0;
              totalContextTokens = input + cacheRead + cacheCreation;
            }

            // Count messages and extract first user message for summary
            if (session.history && Array.isArray(session.history)) {
              for (const msg of session.history) {
                if (msg.role === 'user' || msg.role === 'assistant') {
                  messageCount++;

                  // Get first user message as summary
                  if (!summary && msg.role === 'user') {
                    const content = msg.content;
                    if (typeof content === 'string') {
                      summary = content.substring(0, 100);
                    } else if (Array.isArray(content)) {
                      const textBlock = content.find(c => c.type === 'text');
                      if (textBlock?.text) {
                        summary = textBlock.text.substring(0, 100);
                      }
                    }
                  }
                }
              }
            }

            // Use summary as title if no title found
            if (title === 'Untitled conversation' && summary) {
              title = summary.substring(0, 60) + (summary.length > 60 ? '...' : '');
            }

            // Parse timestamp from updated field (ISO string to epoch)
            let timestamp = fileStat.mtime.getTime();
            if (session.updated) {
              try {
                timestamp = new Date(session.updated).getTime();
              } catch {
                // Fall back to file mtime
              }
            }

            // Derive project path (same escaping as Claude)
            const cwd = session.cwd || '';
            const projectPath = cwd.replace(/\//g, '-');
            const projectName = cwd.split('/').pop() || cwd;

            foundSessions.push({
              id: id,
              title: title,
              summary: summary,
              projectPath: projectPath,
              projectName: projectName,
              timestamp: timestamp,
              messageCount: messageCount,
              filePath: filePath,
              provider: provider,
              totalContextTokens: totalContextTokens
            });
          } catch (err) {
            console.log(`Could not parse ${provider} session ${filename}:`, err.message);
          }
        }

        console.log(`Found ${foundSessions.length} ${provider} sessions`);
      } catch (err) {
        console.log(`Error scanning ${provider} sessions:`, err.message);
      }

      return foundSessions;
    };

    // Scan yume-cli sessions for Gemini
    const geminiSessions = await scanYumeCliSessions('gemini', filterProject);
    conversations.push(...geminiSessions);

    // Scan yume-cli sessions for OpenAI
    const openaiSessions = await scanYumeCliSessions('openai', filterProject);
    conversations.push(...openaiSessions);

    // Add provider field to Claude sessions
    for (const conv of conversations) {
      if (!conv.provider) {
        conv.provider = 'claude';
      }
    }

    // Sort all conversations by timestamp (most recent first) and limit
    conversations.sort((a, b) => b.timestamp - a.timestamp);
    const recentConversations = conversations.slice(0, limit);

    console.log(`Loaded ${recentConversations.length} recent conversations${filterProject ? ` for ${filterProject}` : ''}`);
    res.json({ conversations: recentConversations });
  } catch (error) {
    console.error('Error loading recent conversations:', error);
    res.status(500).json({ error: 'Failed to load conversations', details: error.message });
  }
});

// Get sessions for a specific project - stream them one by one
app.get('/claude-project-sessions/:projectName', async (req, res) => {
  try {
    const projectName = decodeURIComponent(req.params.projectName);
    console.log('📂 Loading sessions for project:', projectName);
    
    // Set up Server-Sent Events
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    
    if (isWindows) {
      // Load from WSL where Claude stores projects
      // Get WSL username dynamically
      let wslUser = 'user';
      try {
        const { execSync } = require('child_process');
        wslUser = execSync(`C:\\Windows\\System32\\wsl.exe -e bash -c "whoami"`, {
          encoding: 'utf8',
          windowsHide: true
        }).trim();
      } catch (e) {
        console.warn('Could not detect WSL user, using default');
      }
      const projectPath = `/home/${wslUser}/.claude/projects/${projectName}`;
      
      try {
        // Get file list from WSL
        console.log('🚀 Getting session list from WSL:', projectPath);
        const { execFileSync } = require('child_process');
        
        // Get list of .jsonl files with modification times, sorted by most recent first
        const wslPath = 'C:\\Windows\\System32\\wsl.exe';
        const bashCmd = `cd "${projectPath}" 2>/dev/null && for f in *.jsonl; do [ -f "$f" ] && stat -c "%Y:%n" -- "$f"; done | sort -rn | head -50`;
        
        const output = execFileSync(wslPath, ['-e', 'bash', '-c', bashCmd], {
          encoding: 'utf8',
          windowsHide: true
        }).trim();
        
        if (!output) {
          console.log('No sessions found');
          res.write('data: {"done": true, "sessions": []}\n\n');
          res.end();
          return;
        }
        
        // Parse files and sort by timestamp
        const files = output.split('\n')
          .filter(line => line.trim())
          .map(line => {
            const [timestamp, filename] = line.split(':');
            return {
              filename: filename,
              timestamp: parseInt(timestamp) * 1000
            };
          })
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, 10);
        
        if (files.length === 0) {
          console.log('No sessions found');
          res.write('data: {"done": true, "sessions": []}\n\n');
          res.end();
          return;
        }
        
        // Process each file and stream it immediately
        for (let i = 0; i < files.length; i++) {
          const { filename, timestamp } = files[i];
          try {
            // Stop after 50 sessions for performance
            if (i >= 50) {
              break;
            }
            
            // Read first line from WSL
            const wslPath = 'C:\\Windows\\System32\\wsl.exe';
            const firstLine = execFileSync(wslPath, ['-e', 'bash', '-c', `head -n1 "${projectPath}/${filename}" 2>/dev/null`], {
              encoding: 'utf8',
              windowsHide: true
            }).trim();
            
            // Read last line to check for metadata/title
            const lastLine = execFileSync(wslPath, ['-e', 'bash', '-c', `tail -n1 "${projectPath}/${filename}" 2>/dev/null`], {
              encoding: 'utf8',
              windowsHide: true
            }).trim();
            
            // Get line count (but limit counting to first 50 lines for performance)
            const lineCount = execFileSync(wslPath, ['-e', 'bash', '-c', `head -n50 "${projectPath}/${filename}" 2>/dev/null | wc -l`], {
              encoding: 'utf8',
              windowsHide: true
            }).trim();
            
            const sessionId = filename.replace('.jsonl', '');
            
            let summary = 'Untitled session';
            let title = null;
            
            // Check last line for metadata/title (Claude often stores this at the end)
            try {
              const lastData = JSON.parse(lastLine);
              if (lastData.type === 'title' && lastData.title) {
                title = lastData.title;
              } else if (lastData.type === 'metadata' && lastData.title) {
                title = lastData.title;
              } else if (lastData.title && !lastData.role) {
                // Standalone title object
                title = lastData.title;
              }
            } catch (e) {
              // Not valid JSON or no title in last line
            }
            
            // If no title found in metadata, check first line
            if (!title) {
              try {
                const data = JSON.parse(firstLine);
                // Check for different possible title fields
                if (data.summary) {
                  summary = data.summary;
                  if (!title) title = data.summary;
                }
                if (data.title) {
                  title = data.title;
                }
                // If it's a user message, use the content as summary
                if (!title && data.role === 'user' && data.content) {
                  if (typeof data.content === 'string') {
                    summary = data.content.substring(0, 100);
                    title = summary;
                  } else if (Array.isArray(data.content)) {
                    // Handle array content (with text blocks)
                    const textBlock = data.content.find(c => c.type === 'text');
                    if (textBlock && textBlock.text) {
                      summary = textBlock.text.substring(0, 100);
                      title = summary;
                    }
                  }
                }
                // If it's session metadata with a type field
                if (data.type === 'summary' && data.summary) {
                  title = data.summary;
                  summary = data.summary;
                }
              } catch (e) {
                // Parse error, use default
                console.log(`Could not parse session title from: ${firstLine}`);
              }
            }
            
            const session = {
              id: sessionId,
              summary: summary,
              title: title,
              timestamp: timestamp,
              path: filename,
              messageCount: parseInt(lineCount) || 0
            };
            
            // Stream this session immediately
            res.write(`data: ${JSON.stringify({ session, index: i, total: files.length })}\n\n`);
            console.log(`  📄 Sent session ${i + 1}/${files.length}: ${sessionId}`);
            
          } catch (e) {
            console.log(`Error processing ${filename}:`, e.message);
          }
        }
        
        // Send completion event
        res.write('data: {"done": true}\n\n');
        console.log(`✅ Streamed all sessions`);
        res.end();
        
      } catch (e) {
        console.error('Error loading sessions:', e.message);
        res.write('data: {"error": true, "message": "' + e.message + '"}\n\n');
        res.end();
      }
    } else {
      // macOS/Linux implementation
      const { readdir: readdirAsync, stat: statAsync, readFile: readFileAsync } = fs.promises;
      const claudeDir = join(homedir(), '.claude', 'projects');
      const projectPath = join(claudeDir, projectName);

      try {
        if (!existsSync(projectPath)) {
          console.log('Project path not found:', projectPath);
          res.write('data: {"done": true, "sessions": []}\n\n');
          res.end();
          return;
        }

        // Get all .jsonl files
        const files = await readdirAsync(projectPath);
        const sessionFiles = files.filter(f => f.endsWith('.jsonl'));

        // Get stats for each file and sort by modification time
        const filesWithStats = await Promise.all(
          sessionFiles.map(async (filename) => {
            try {
              const filePath = join(projectPath, filename);
              const stats = await statAsync(filePath);
              return {
                filename,
                timestamp: stats.mtimeMs
              };
            } catch (e) {
              return null;
            }
          })
        );

        const validFiles = filesWithStats
          .filter(f => f !== null)
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, 50);

        if (validFiles.length === 0) {
          console.log('No sessions found in:', projectPath);
          res.write('data: {"done": true, "sessions": []}\n\n');
          res.end();
          return;
        }

        // Process each file
        for (let i = 0; i < validFiles.length; i++) {
          const { filename, timestamp } = validFiles[i];
          try {
            const filePath = join(projectPath, filename);
            const content = await readFileAsync(filePath, 'utf8');
            const lines = content.trim().split('\n');

            const sessionId = filename.replace('.jsonl', '');
            let title = 'Untitled conversation';
            let summary = '';
            let messageCount = 0;

            // Scan all lines for title (same logic as /claude-recent-conversations)
            for (const line of lines) {
              try {
                const data = JSON.parse(line);

                // Skip meta messages (system tags like local-command-caveat)
                if (data.isMeta === true) {
                  continue;
                }

                // Check for title in various formats
                if (data.type === 'title' && data.title) {
                  title = data.title;
                } else if (data.type === 'summary' && data.summary) {
                  title = data.summary;
                  summary = data.summary;
                } else if (data.title && !data.role) {
                  title = data.title;
                }

                // Count actual messages (skip meta messages for counting too)
                if (data.role === 'user' || data.role === 'assistant' ||
                    data.type === 'user' || data.type === 'assistant') {

                  // Get content string for filtering
                  const msgContent = data.content || data.message?.content;
                  let contentStr = '';
                  if (typeof msgContent === 'string') {
                    contentStr = msgContent;
                  } else if (Array.isArray(msgContent)) {
                    const textBlock = msgContent.find(c => c.type === 'text');
                    if (textBlock?.text) {
                      contentStr = textBlock.text;
                    }
                  }

                  // Skip messages that start with XML-like tags (system/meta messages)
                  if (/^\s*<[a-z][a-z0-9-]*>/i.test(contentStr)) {
                    continue;
                  }

                  messageCount++;

                  // Get first user message as summary if no title
                  if (!summary && (data.role === 'user' || data.type === 'user')) {
                    if (contentStr) {
                      summary = contentStr.substring(0, 100);
                    }
                  }
                }
              } catch {
                // Skip unparseable lines
              }
            }

            // Use summary as title if no title found
            if (title === 'Untitled conversation' && summary) {
              title = summary.substring(0, 60) + (summary.length > 60 ? '...' : '');
            }

            const session = {
              id: sessionId,
              summary: summary || title,
              title: title,
              timestamp: timestamp,
              path: filename,
              messageCount: messageCount
            };

            res.write(`data: ${JSON.stringify({ session, index: i, total: validFiles.length })}\n\n`);
            console.log(`  📄 Sent session ${i + 1}/${validFiles.length}: ${sessionId}`);

          } catch (e) {
            console.log(`Error processing ${filename}:`, e.message);
          }
        }

        res.write('data: {"done": true}\n\n');
        console.log(`✅ Streamed all sessions`);
        res.end();

      } catch (e) {
        console.error('Error loading sessions:', e.message);
        res.write('data: {"error": true, "message": "' + e.message + '"}\n\n');
        res.end();
      }
    }
  } catch (error) {
    console.error('Error loading project sessions:', error);
    // Headers already sent, so just end the stream
    try {
      res.write(`data: {"error": true, "message": "${error.message}"}\n\n`);
      res.end();
    } catch (e) {
      // Response already ended
    }
  }
});

// Get last modified date for a specific project
app.get('/claude-project-date/:projectName', async (req, res) => {
  try {
    const projectName = decodeURIComponent(req.params.projectName);
    console.log(`📅 Getting date for project: ${projectName}`);
    
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
      
      // Get the modification time of the MOST RECENT session file
      const recentCmd = `powershell.exe -NoProfile -Command "& {wsl.exe -e bash -c 'cd ${projectPath} && ls -t *.jsonl 2>/dev/null | head -1 | xargs -r stat -c %Y 2>/dev/null'}"`;
      const { execSync } = require('child_process');
      const recentTime = execSync(recentCmd, {
        encoding: 'utf8',
        windowsHide: true
      }).trim();
      
      let lastModified = Date.now();
      if (recentTime && !isNaN(recentTime)) {
        lastModified = parseInt(recentTime) * 1000;
        const date = new Date(lastModified);
        console.log(`  ✅ ${projectName}: ${date.toLocaleString()} (${recentTime})`);
      } else {
        console.log(`  ⚠️ ${projectName}: No sessions found, using current time`);
      }
      
      res.json({ projectName, lastModified });
    } else {
      // Non-Windows implementation
      res.json({ projectName, lastModified: Date.now() });
    }
  } catch (error) {
    console.error('Error getting project date:', error);
    res.json({ projectName: req.params.projectName, lastModified: Date.now() });
  }
});

// Get session count for a specific project
app.get('/claude-project-session-count/:projectName', async (req, res) => {
  try {
    const projectName = decodeURIComponent(req.params.projectName);
    
    if (isWindows) {
      // Load from WSL
      // Get WSL username dynamically
      let wslUser = 'user';
      try {
        const { execSync } = require('child_process');
        wslUser = execSync(`C:\\Windows\\System32\\wsl.exe -e bash -c "whoami"`, {
          encoding: 'utf8',
          windowsHide: true
        }).trim();
      } catch (e) {
        console.warn('Could not detect WSL user, using default');
      }
      const projectPath = `/home/${wslUser}/.claude/projects/${projectName}`;
      
      try {
        const { execSync } = require('child_process');
        
        // Count sessions in WSL
        const countCmd = `powershell.exe -NoProfile -Command "& {wsl.exe -e bash -c 'ls -1 ${projectPath}/*.jsonl 2>/dev/null | wc -l'}"`;
        const count = execSync(countCmd, {
          encoding: 'utf8',
          windowsHide: true
        }).trim();
        
        const sessionCount = parseInt(count) || 0;
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
        
        const projectDirs = dirList.split('\n')
          .filter(dir => dir && !dir.startsWith('.') && dir !== 'NO_DIR')
          .filter(projectName => {
            // CRITICAL: Filter out temp directories, server directories, and title gen directories
            const lowerName = projectName.toLowerCase();
            if (lowerName.includes('temp') || 
                lowerName.includes('tmp') || 
                lowerName.includes('yume-server') ||
                lowerName.includes('yume-title-gen') ||
                lowerName === '-yume-title-gen' ||
                lowerName.includes('appdata') ||
                lowerName.includes('-mnt-c-users-') && lowerName.includes('-appdata-local-temp')) {
              console.log(`🚫 Filtering out temp/server/title-gen directory: ${projectName}`);
              return false;
            }
            return true;
          });
        console.log(`✅ Found ${projectDirs.length} projects in WSL (after filtering):`, projectDirs);
        
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
    const { readdir, stat, readFile } = fs.promises;
    
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
  ? join(homedir(), `.yume-server-${PORT}.pid`)
  : join(__dirname, `server-${PORT}.pid`);

function writePidFile() {
  try {
    writeFileSync(pidFilePath, process.pid.toString());
    console.log(`📝 Server PID ${process.pid} written to ${pidFilePath}`);
  } catch (err) {
    console.log(`⚠️ Could not write PID file (running from read-only location?):`, err.message);
  }
  
  // CRITICAL: Write port to user-writable location for client discovery
  try {
    const userPortDir = join(homedir(), '.yume');
    if (!existsSync(userPortDir)) {
      mkdirSync(userPortDir, { recursive: true });
    }
    const portFile = join(userPortDir, 'current-port.txt');
    writeFileSync(portFile, String(PORT));
    console.log(`📝 Server PORT ${PORT} written to ${portFile}`);
  } catch (err) {
    console.log(`⚠️ Could not write port file:`, err.message);
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

// Track all spawned child process PIDs for cleanup
const allChildPids = new Set();

// Track active working directories for git lock cleanup on shutdown
const activeWorkingDirectories = new Set();

// Helper function to forcefully kill all child processes
function forceKillAllChildren() {
  console.log('🔪 Force killing all child processes...');

  // First, kill tracked PIDs with SIGKILL
  for (const pid of allChildPids) {
    try {
      process.kill(pid, 'SIGKILL');
      console.log(`   SIGKILL sent to PID ${pid}`);
    } catch (e) {
      // Process may already be dead
    }
  }
  allChildPids.clear();

  // Note: We only kill processes we spawned (tracked PIDs above)
  // We do NOT use pkill -f "claude" as that would kill Claude processes
  // not associated with Yume
}

// Helper function to clean up git lock files in tracked working directories
function cleanupGitLocks() {
  if (activeWorkingDirectories.size === 0) return;

  console.log(`🔓 Cleaning up git locks in ${activeWorkingDirectories.size} tracked directories...`);

  for (const dir of activeWorkingDirectories) {
    try {
      const lockPath = join(dir, '.git', 'index.lock');
      if (existsSync(lockPath)) {
        unlinkSync(lockPath);
        console.log(`   Removed git lock: ${lockPath}`);
      }
    } catch (e) {
      // Ignore errors - lock may not exist or we may not have permissions
    }
  }

  activeWorkingDirectories.clear();
}

// Graceful shutdown function
let isShuttingDown = false;
function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n🛑 ${signal} received - graceful shutdown starting...`);

  // 0. Clean up git lock files first (before killing processes that might be using git)
  cleanupGitLocks();

  // 1. First, send SIGTERM/SIGINT to all active Claude processes (and their process groups on Unix)
  const activeCount = activeProcesses.size;
  const pidsToKill = [];
  const isUnix = process.platform === 'darwin' || process.platform === 'linux';
  if (activeCount > 0) {
    console.log(`🔪 Sending SIGTERM to ${activeCount} active Claude process(es)...`);
    for (const [sessionId, proc] of activeProcesses.entries()) {
      try {
        if (proc.pid) {
          pidsToKill.push(proc.pid);
          // On Unix with detached processes, kill the process group
          if (isUnix) {
            try {
              process.kill(-proc.pid, 'SIGTERM'); // Negative PID kills process group
              console.log(`   SIGTERM sent to process group for session ${sessionId} (PGID: ${proc.pid})`);
            } catch (e) {
              // Fallback to direct kill if process group kill fails
              proc.kill('SIGTERM');
              console.log(`   SIGTERM sent to process for session ${sessionId} (PID: ${proc.pid})`);
            }
          } else {
            proc.kill('SIGTERM');
            console.log(`   SIGTERM sent to process for session ${sessionId} (PID: ${proc.pid})`);
          }
        }
      } catch (e) {
        // Process may already be dead
      }
    }
  }

  // 2. Clear all health check intervals and timeouts
  for (const [sessionId, interval] of streamHealthChecks.entries()) {
    clearInterval(interval);
  }
  streamHealthChecks.clear();

  for (const [sessionId, timeout] of streamTimeouts.entries()) {
    clearTimeout(timeout);
  }
  streamTimeouts.clear();

  // 3. Clear pending streaming false timers
  for (const [sessionId, timerData] of pendingStreamingFalseTimers.entries()) {
    if (timerData.timer) clearTimeout(timerData.timer);
  }
  pendingStreamingFalseTimers.clear();

  // 4. Clear message batch timers
  for (const [sessionId, batch] of messageBatches.entries()) {
    if (batch.timer) clearTimeout(batch.timer);
  }
  messageBatches.clear();

  // 5. Disconnect all Socket.IO clients
  io.disconnectSockets(true);

  // 6. Close HTTP server
  httpServer.close(() => {
    console.log('✅ HTTP server closed');
  });

  // 7. Remove PID file
  removePidFile();

  // 8. Clear session data
  sessions.clear();
  lastAssistantMessageIds.clear();
  allAssistantMessageIds.clear();
  activeProcesses.clear();
  activeProcessStartTimes.clear();

  // 9. Wait 500ms for SIGTERM to take effect, then SIGKILL any survivors
  setTimeout(() => {
    console.log('🔪 Sending SIGKILL to any surviving processes...');
    for (const pid of pidsToKill) {
      try {
        // On Unix, kill the process group with SIGKILL
        if (isUnix) {
          try {
            process.kill(-pid, 'SIGKILL'); // Negative PID kills process group
            console.log(`   SIGKILL sent to process group (PGID: ${pid})`);
          } catch (e) {
            // Fallback to direct kill
            process.kill(pid, 'SIGKILL');
            console.log(`   SIGKILL sent to PID ${pid}`);
          }
        } else {
          process.kill(pid, 'SIGKILL');
          console.log(`   SIGKILL sent to PID ${pid}`);
        }
      } catch (e) {
        // Process already dead, good
      }
    }

    // Force kill any remaining child processes
    forceKillAllChildren();

    // Final git lock cleanup in case any were created during shutdown
    cleanupGitLocks();

    console.log('✅ Graceful shutdown complete');

    // Wait another 200ms then exit
    setTimeout(() => process.exit(0), 200);
  }, 500);
}

// Clean up on exit
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

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
  // Don't exit on unhandled rejections - just log them
  // This prevents spurious crashes from network issues
});

// Socket.IO connection handling - EXACTLY LIKE WINDOWS
io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id);

  // Track first bash command to restore focus on macOS
  let isFirstBashCommand = true;
  const bashToolUseIds = new Map(); // Maps tool_use_id to tool info for focus restoration

  // Check if this is a vscode client (passed in query params)
  const isVscodeClient = socket.handshake.query?.client === 'vscode';
  if (isVscodeClient) {
    console.log('🆚 VSCode extension connected:', socket.id);
  }

  // VSCode extension connection handlers
  socket.on('vscode:connected', () => {
    vscodeConnections.add(socket.id);
    vscodeConnected = vscodeConnections.size > 0;
    console.log(`🆚 VSCode client registered: ${socket.id} (total: ${vscodeConnections.size})`);
    // Broadcast to all clients
    io.emit('vscode:status', { connected: vscodeConnected, count: vscodeConnections.size });
    // Send current settings to the vscode client
    if (cachedSettings) {
      socket.emit('settings:sync', cachedSettings);
    }
  });

  // Settings sync - main app sends settings, server broadcasts to vscode clients
  socket.on('settings:update', (settings) => {
    console.log('📦 Settings updated from main app');
    cachedSettings = settings;
    // Broadcast to all vscode clients
    vscodeConnections.forEach(id => {
      io.to(id).emit('settings:sync', settings);
    });
  });

  socket.on('vscode:disconnected', () => {
    vscodeConnections.delete(socket.id);
    vscodeConnected = vscodeConnections.size > 0;
    console.log(`🆚 VSCode client unregistered: ${socket.id} (total: ${vscodeConnections.size})`);
    io.emit('vscode:status', { connected: vscodeConnected, count: vscodeConnections.size });
  });

  // Request current vscode status (for clients that join late)
  socket.on('vscode:getStatus', (callback) => {
    if (typeof callback === 'function') {
      callback({ connected: vscodeConnected, count: vscodeConnections.size });
    }
  });

  // Force disconnect all vscode clients (called when user disables extension)
  socket.on('vscode:disconnectAll', () => {
    console.log(`🆚 Disconnecting all VSCode clients (${vscodeConnections.size} total)`);
    // Tell all vscode clients to disconnect
    vscodeConnections.forEach(id => {
      io.to(id).emit('vscode:forceDisconnect');
    });
    // Clear the connections
    vscodeConnections.clear();
    vscodeConnected = false;
    // Broadcast updated status
    io.emit('vscode:status', { connected: false, count: 0 });
  });

  socket.on('createSession', async (data, callback) => {
    try {
      // Check if this is loading an existing session
      let sessionId;
      let existingClaudeSessionId = null;
      let existingMessages = [];
      let existingSession = null; // Define at the top level
      
      if (data.existingSessionId && data.messages) {
        // Loading an existing session - preserve the session ID and messages
        sessionId = data.existingSessionId;
        
        // Check if session already exists and was compacted
        existingSession = sessions.get(sessionId);
        if (existingSession?.wasCompacted) {
          // Don't restore old claudeSessionId if session was compacted
          existingClaudeSessionId = null;
          console.log(`📂 Loading compacted session: ${sessionId} - ignoring old Claude ID`);
        } else {
          existingClaudeSessionId = data.claudeSessionId || null;
          console.log(`📂 Loading existing session: ${sessionId} with Claude ID: ${existingClaudeSessionId}`);
        }
        
        existingMessages = data.messages || [];
        console.log(`📝 Loaded ${existingMessages.length} existing messages`);

        // Calculate accumulated tokens from existing messages for wrapper state
        const accumulatedTokens = calculateAccumulatedTokensFromMessages(existingMessages);
        if (accumulatedTokens > 0) {
          initWrapperSessionWithTokens(sessionId, accumulatedTokens);
        }
      } else {
        // Creating a brand new session
        sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        console.log(`✨ Creating new session: ${sessionId}`);
      }
      
      // Validate working directory - NEVER use temp directories
      let workingDirectory = data.workingDirectory;
      
      // Check if this is a temp directory
      if (workingDirectory) {
        const lowerPath = workingDirectory.toLowerCase();
        if (lowerPath.includes('\\temp\\') || 
            lowerPath.includes('/temp/') ||
            lowerPath.includes('\\tmp\\') ||
            lowerPath.includes('/tmp/') ||
            lowerPath.includes('appdata\\local\\temp') ||
            lowerPath.includes('yume-server')) {
          console.log(`🚫 Rejecting temp directory as working directory: ${workingDirectory}`);
          workingDirectory = null; // Reset to force using home
        }
      }
      
      // Use provided directory, or home directory as fallback (NOT temp directory)
      if (!workingDirectory) {
        workingDirectory = homedir();
        console.log(`📂 Using home directory as fallback: ${workingDirectory}`);
      }
      
      const sessionData = {
        id: sessionId,
        name: data.name || 'new session',
        socketId: socket.id,
        workingDirectory: workingDirectory,
        messages: existingMessages,  // Use loaded messages if available
        createdAt: Date.now(),
        lastActivity: Date.now(),  // Track last activity for TTL cleanup
        claudeSessionId: existingClaudeSessionId,  // Preserve Claude session ID
        hasGeneratedTitle: existingMessages.length > 0,  // If we have messages, we likely have a title
        wasInterrupted: false,  // Track if last conversation was interrupted vs completed
        wasCompacted: existingSession?.wasCompacted || false,  // Preserve compacted state
        disallowedTools: data.disallowedTools || []  // User-disabled tools from modal
      };
      
      sessions.set(sessionId, sessionData);

      console.log(`✅ Session ready: ${sessionId}`);
      console.log(`📁 Working directory: ${workingDirectory}`);

      // Get accumulated token context from wrapper (calculated above from existing messages)
      const wrapperSession = getWrapperSession(sessionId);
      const contextTokens = wrapperSession?.totalTokens || 0;

      if (callback) {
        callback({
          success: true,
          sessionId: sessionId,
          workingDirectory: workingDirectory,
          // Return context usage for resumed sessions
          usage: existingMessages.length > 0 ? {
            totalContextTokens: contextTokens,
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: contextTokens,
            cacheCreationTokens: 0
          } : null
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
    console.log('🚨🚨🚨 RUNNING FROM: server-claude-macos.cjs FILE');
    console.log('Data received:', { ...data, content: data.content ? '(content present)' : '(no content)' });
    const { sessionId, content: message, model, autoGenerateTitle } = data;
    const session = sessions.get(sessionId);
    
    if (!session) {
      console.error(`❌ Session not found: ${sessionId}`);
      if (callback) callback({ success: false, error: 'Session not found' });
      return;
    }

    // Update last activity timestamp for TTL tracking
    session.lastActivity = Date.now();

    // Check if this is a bash command (starts with $)
    if (message && message.startsWith('$')) {
      console.log(`🐚 Executing bash command: ${message}`);
      const bashCommand = message.substring(1).trim(); // Remove the $ prefix
      
      // Execute the bash command directly
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      try {
        // Emit user message first
        socket.emit(`message:${sessionId}`, {
          type: 'user',
          message: { content: message },
          timestamp: Date.now()
        });
        
        // Execute the command
        const workingDir = session.workingDirectory || require('os').homedir();
        console.log(`🐚 Executing in directory: ${workingDir}`);
        
        let execResult;
        
        // Check if we're on Windows and need to use WSL
        if (process.platform === 'win32') {
          // Execute in WSL
          const wslPath = 'C:\\Windows\\System32\\wsl.exe';
          const wslCommand = `cd "${workingDir}" && ${bashCommand}`;
          console.log(`🐚 Using WSL to execute: ${wslCommand}`);
          
          execResult = await execAsync(`"${wslPath}" -e bash -c "${wslCommand.replace(/"/g, '\\"')}"`, {
            timeout: 30000, // 30 second timeout
            maxBuffer: 10 * 1024 * 1024 // 10MB buffer
          });
        } else {
          // Execute directly on macOS/Linux
          execResult = await execAsync(bashCommand, {
            cwd: workingDir,
            timeout: 30000, // 30 second timeout
            maxBuffer: 10 * 1024 * 1024 // 10MB buffer
          });
        }
        
        const { stdout, stderr } = execResult;
        
        // Send the result back
        const output = stdout || stderr || '(no output)';
        socket.emit(`message:${sessionId}`, {
          type: 'assistant',
          message: {
            content: [
              { type: 'text', text: `\`\`\`\n${output}\n\`\`\`` }
            ]
          },
          streaming: false,
          timestamp: Date.now()
        });
        
        if (callback) callback({ success: true });
      } catch (error) {
        console.error('❌ Bash command failed:', error);
        
        // Extract actual output from the error
        let output = '';
        if (error.stdout) {
          output += error.stdout;
        }
        if (error.stderr) {
          if (output) output += '\n';
          output += error.stderr;
        }
        
        // If we have no output at all, use the error message
        if (!output) {
          output = error.message;
        }
        
        // Format the error output properly
        const exitCode = error.code || 'unknown';
        const formattedOutput = `❌ Command failed with exit code ${exitCode}\n\n${output}`;
        
        socket.emit(`message:${sessionId}`, {
          type: 'assistant',
          message: {
            content: [
              { type: 'text', text: `\`\`\`ansi\n${formattedOutput}\n\`\`\`` }
            ]
          },
          streaming: false,
          timestamp: Date.now()
        });
        
        // Still report success since we sent the output as a message
        if (callback) callback({ success: true });
      }
      
      return; // Don't process through Claude
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

        // RACE CONDITION FIX: Check if a process is currently being spawned for this session
        // This prevents duplicate processes when multiple messages arrive in quick succession
        if (spawningProcesses.has(sessionId)) {
          const spawnState = spawningProcesses.get(sessionId);
          const spawnAge = Date.now() - spawnState.startTime;

          console.log(`⏳ [${sessionId}] Process is currently spawning (${spawnAge}ms ago) - queueing message`);

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
          }, 1500);

          return; // Exit early without spawning another process
        }

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
          // KEEP claudeSessionId so we can --resume with full context
          console.log(`🔄 Marked session ${sessionId} as interrupted (keeping claudeSessionId: ${session.claudeSessionId} for resume)`);
          
          // Wait a bit for the process to fully terminate
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Emit a message to set streaming=true for the new request after interruption
          // This ensures the UI shows the "thinking..." state when we interrupt and send a new message
          console.log(`🔄 Emitting streaming=true after interruption for session ${sessionId}`);
          socket.emit(`message:${sessionId}`, {
            type: 'system',
            subtype: 'streaming_resumed',
            streaming: true,
            timestamp: Date.now()
          });
        }

        // The process exit handler will properly clean up when the old process dies

        // Validate session's working directory - NEVER use temp directories
        let processWorkingDir = session.workingDirectory;
        
        // Check if this is a temp directory
        if (processWorkingDir) {
          const lowerPath = processWorkingDir.toLowerCase();
          if (lowerPath.includes('\\temp\\') || 
              lowerPath.includes('/temp/') ||
              lowerPath.includes('\\tmp\\') ||
              lowerPath.includes('/tmp/') ||
              lowerPath.includes('appdata\\local\\temp') ||
              lowerPath.includes('yume-server')) {
            console.log(`🚫 Session has temp directory, using home instead: ${processWorkingDir}`);
            processWorkingDir = null;
          }
        }
        
        // Use session's working directory, fallback to home directory (NOT temp directory)
        if (!processWorkingDir) {
          processWorkingDir = homedir();
          console.log(`📂 Using home directory as fallback: ${processWorkingDir}`);
        } else {
          console.log(`📂 Using working directory: ${processWorkingDir}`);
        }

      // Build the claude command - EXACTLY LIKE WINDOWS BUT WITH MACOS FLAGS
      // Combine system-disallowed tools with user-disabled tools from modal
      const systemDisallowed = ['AskUserQuestion', 'EnterPlanMode', 'ExitPlanMode'];
      const userDisallowed = session.disallowedTools || [];
      const allDisallowed = [...new Set([...systemDisallowed, ...userDisallowed])];
      console.log(`🔧 Disallowed tools: ${allDisallowed.join(',')}`);

      const args = [
        '--print',
        '--output-format', 'stream-json',
        '--verbose',
        '--dangerously-skip-permissions',
        '--disallowed-tools', allDisallowed.join(','),
        '--append-system-prompt', 'CRITICAL: you are in yume ui. ALWAYS: use all lowercase (no capitals ever), be extremely concise, never use formal language, no greetings/pleasantries, straight to the point, code/variables keep proper case, one line answers preferred. !!FOR COMPLEX TASKS: YOU MUST PLAN FIRST use THINK and TODO as MUCH AS POSSIBLE to break down everything, including planning into multiple steps and do edits in small chunks!!'
      ];
      
      // Add model flag if specified
      // Force sonnet for /compact command
      if (message && message.trim() === '/compact') {
        args.push('--model', 'claude-sonnet-4-5-20250929');
        console.log(`🤖 Using model: claude-sonnet-4-5-20250929 (forced for /compact)`);
      } else if (model) {
        args.push('--model', model);
        console.log(`🤖 Using model: ${model}`);
      }
      
      // Determine if we're resuming or recreating
      let isResuming = false;
      
      // Use --resume if we have a claudeSessionId (even after interrupt)
      isResuming = session.claudeSessionId;
      if (isResuming) {
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

      // REMOVED broken echo detection - all messages should go to Claude

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

      // Mark this session as spawning to handle interrupt race condition
      spawningProcesses.set(sessionId, { startTime: Date.now(), aborted: false });
      console.log(`🔄 Session ${sessionId} marked as spawning`);
      
      // Ensure the directory exists before spawning
      if (!existsSync(processWorkingDir)) {
        console.warn(`⚠️ Working directory does not exist: ${processWorkingDir}, using home directory`);
        processWorkingDir = homedir();
      }
      
      // Use detached: true on Unix (macOS/Linux) to enable process group killing
      // This allows kill(-pid, signal) to kill the entire process tree
      // On Windows, keep detached: false to avoid console windows
      const isUnix = process.platform === 'darwin' || process.platform === 'linux';

      const spawnOptions = {
        cwd: processWorkingDir,
        env: enhancedEnv,
        shell: false,
        windowsHide: true,  // Always hide windows - prevents black console
        // IMPORTANT: Do NOT use windowsVerbatimArguments with WSL - it breaks argument passing!
        detached: isUnix,  // Enable process group on Unix for proper cleanup
        stdio: ['pipe', 'pipe', 'pipe']  // Explicit stdio configuration
      };
      
      console.log(`🚀 Spawning claude process with options:`, {
        cwd: spawnOptions.cwd,
        claudePath: CLAUDE_PATH,
        args: args
      });
      
      let claudeProcess;
      if (isWindows && CLAUDE_PATH === 'WSL_CLAUDE') {
        // Convert Windows path to WSL path if needed
        let wslWorkingDir = processWorkingDir;
        if (processWorkingDir && processWorkingDir.match(/^[A-Z]:\\/)) {
          const driveLetter = processWorkingDir[0].toLowerCase();
          const pathWithoutDrive = processWorkingDir.substring(2).replace(/\\/g, '/');
          wslWorkingDir = `/mnt/${driveLetter}${pathWithoutDrive}`;
          console.log(`📂 Converted Windows path to WSL: ${processWorkingDir} -> ${wslWorkingDir}`);
        }
        
        // Build the message with context if needed
        let messageToSend = message;
        if (session.pendingContextRestore && session.messages && session.messages.length > 0) {
          console.log(`🔄 Building context for WSL command`);
          let contextSummary = "Here's our previous conversation context:\\n\\n";
          
          const recentMessages = session.messages.slice(-10);
          for (const msg of recentMessages) {
            if (msg.type === 'user') {
              const content = msg.message?.content || '';
              // Handle both string and array content
              let textContent = '';
              if (typeof content === 'string') {
                textContent = content;
              } else if (Array.isArray(content)) {
                textContent = content.filter(c => c.type === 'text').map(c => c.text).join('');
              }
              contextSummary += `User: ${textContent.substring(0, 200)}${textContent.length > 200 ? '...' : ''}\\n\\n`;
            } else if (msg.type === 'assistant') {
              const content = msg.message?.content || '';
              let textContent = '';
              if (typeof content === 'string') {
                textContent = content;
              } else if (Array.isArray(content)) {
                textContent = content.filter(c => c.type === 'text').map(c => c.text).join('');
              }
              contextSummary += `Assistant: ${textContent.substring(0, 200)}${textContent.length > 200 ? '...' : ''}\\n\\n`;
            }
          }
          
          contextSummary += `---\\nNow, continuing our conversation: ${message}`;
          messageToSend = contextSummary;
          session.pendingContextRestore = false;
        }
        
        const [wslCommand, wslArgs, inputHandled] = createWslClaudeCommand(args, wslWorkingDir, messageToSend);
        console.log(`🚀 Running WSL command: ${wslCommand}`);
        console.log(`🚀 WSL args (first 500 chars):`, JSON.stringify(wslArgs).substring(0, 500));
        console.log(`🚀 Input handled in script: ${inputHandled}`);
        
        // Check if WSL.exe exists before trying to spawn
        if (!existsSync(wslCommand)) {
          console.error(`❌ WSL.exe not found at: ${wslCommand}`);
          console.error(`❌ Please ensure WSL is installed on Windows`);
          throw new Error('WSL.exe not found. Please install Windows Subsystem for Linux.');
        }
        
        claudeProcess = spawn(wslCommand, wslArgs, spawnOptions);
        claudeProcess.inputHandled = inputHandled;
      } else {
        claudeProcess = spawn(CLAUDE_PATH, args, spawnOptions);
      }

      // Clear spawning flag immediately after spawn() returns (process created)
      // This is more accurate than using setTimeout, which could cause race conditions
      isSpawningProcess = false;

      // Store process reference and start time
      activeProcesses.set(sessionId, claudeProcess);
      activeProcessStartTimes.set(sessionId, Date.now());

      // Track PID for cleanup on shutdown
      if (claudeProcess.pid) {
        allChildPids.add(claudeProcess.pid);
      }

      // Track working directory for git lock cleanup on shutdown
      if (processWorkingDir) {
        activeWorkingDirectories.add(processWorkingDir);
      }

      // Cancel any pending streaming=false from previous process exit
      // This prevents UI flicker in agentic mode where processes cycle rapidly
      cancelPendingStreamingFalse(sessionId);

      // Check if this session was marked for abort during spawning
      const spawnState = spawningProcesses.get(sessionId);
      spawningProcesses.delete(sessionId); // Remove spawning state
      console.log(`✅ Session ${sessionId} spawn complete, process registered (PID: ${claudeProcess.pid})`);

      // If interrupt was requested during spawn, kill immediately
      if (spawnState?.aborted || pendingInterrupts.has(sessionId)) {
        console.log(`🛑 Session ${sessionId} was interrupted during spawn - killing immediately`);
        const pendingCallback = pendingInterrupts.get(sessionId);
        pendingInterrupts.delete(sessionId);

        // Kill the process using process group
        if (claudeProcess.pid) {
          try {
            process.kill(-claudeProcess.pid, 'SIGINT');
          } catch (e) {
            claudeProcess.kill('SIGINT');
          }
        }

        activeProcesses.delete(sessionId);
        activeProcessStartTimes.delete(sessionId);

        // Call pending callback if exists
        if (pendingCallback) {
          pendingCallback({ success: true, killedDuringSpawn: true });
        }

        // Send interrupted message
        socket.emit(`message:${sessionId}`, {
          type: 'system',
          subtype: 'interrupted',
          message: 'task interrupted by user',
          timestamp: Date.now()
        });
        return; // Don't continue with normal processing
      }

      // REMOVED: claudeProcess.unref() - this was causing zombie processes
      // We want child processes to be killed when the server exits
      // The unref() call was allowing processes to survive parent death

      // Send input based on session state
      if (session.pendingContextRestore && session.messages && session.messages.length > 0) {
        // Restore context by sending previous messages as a summary
        console.log(`🔄 Restoring context with ${session.messages.length} previous messages`);
        
        // Build context summary from previous messages
        let contextSummary = "Here's our previous conversation context:\n\n";
        
        // Include last few messages for context (limit to prevent overwhelming)
        const recentMessages = session.messages.slice(-10); // Last 10 messages
        for (const msg of recentMessages) {
          if (msg.type === 'user') {
            const content = msg.message?.content || '';
            // Handle both string and array content
            let textContent = '';
            if (typeof content === 'string') {
              textContent = content;
            } else if (Array.isArray(content)) {
              textContent = content.filter(c => c.type === 'text').map(c => c.text).join('');
            }
            contextSummary += `User: ${textContent.substring(0, 200)}${textContent.length > 200 ? '...' : ''}\n\n`;
          } else if (msg.type === 'assistant') {
            const content = msg.message?.content || '';
            // Handle both string and array content
            let textContent = '';
            if (typeof content === 'string') {
              textContent = content;
            } else if (Array.isArray(content)) {
              textContent = content.filter(c => c.type === 'text').map(c => c.text).join('');
            }
            contextSummary += `Assistant: ${textContent.substring(0, 200)}${textContent.length > 200 ? '...' : ''}\n\n`;
          }
        }
        
        contextSummary += `---\nNow, continuing our conversation: ${message}`;
        
        const messageToSend = contextSummary + '\n';
        console.log(`📝 Sending context + message to claude (${messageToSend.length} chars)`);
        
        if (!claudeProcess.inputHandled) {
          // Add timeout for stdin write to prevent hanging
          const stdinTimeout = setTimeout(() => {
            console.error(`⚠️ Stdin write timeout - forcing close`);
            try {
              claudeProcess.stdin.end();
              claudeProcess.stdin.destroy();
            } catch (e) {
              console.error(`Failed to force close stdin: ${e.message}`);
            }
          }, 10000); // 10 second timeout for stdin write
          
          claudeProcess.stdin.write(messageToSend, (err) => {
            clearTimeout(stdinTimeout);
            if (err) {
              console.error(`❌ Error writing to stdin:`, err);
            } else {
              console.log(`✅ Successfully sent context restoration`);
            }
            // IMPORTANT: Close stdin for --print mode to signal end of input
            claudeProcess.stdin.end();
            console.log(`📝 Closed stdin after sending message (--print mode requires this)`);
          });
        }
        
        session.pendingContextRestore = false; // Reset flag
      } else if (message && !claudeProcess.inputHandled) {
        // ALWAYS send the message, whether resuming or not
        // When resuming, --resume restores history but we still need to send the new message
        const messageToSend = message + '\n';
        console.log(`📝 Sending message to claude via stdin (${message.length} chars) - resuming=${isResuming}`);
        
        // Write immediately - Claude with --print needs input right away
        // Add timeout for stdin write to prevent hanging
        const stdinTimeout = setTimeout(() => {
          console.error(`⚠️ Stdin write timeout - forcing close`);
          try {
            claudeProcess.stdin.end();
            claudeProcess.stdin.destroy();
          } catch (e) {
            console.error(`Failed to force close stdin: ${e.message}`);
          }
        }, 10000); // 10 second timeout for stdin write
        
        claudeProcess.stdin.write(messageToSend, (err) => {
          clearTimeout(stdinTimeout);
          if (err) {
            console.error(`❌ Error writing to stdin:`, err);
          } else {
            console.log(`✅ Successfully wrote to stdin`);
          }
          // IMPORTANT: Close stdin for --print mode to signal end of input
          claudeProcess.stdin.end();
          console.log(`📝 Closed stdin after sending message (--print mode requires this)`);
        });
      } else if (claudeProcess.inputHandled) {
        console.log(`📝 Message already embedded in WSL script`);
      } else if (!message) {
        console.log(`📝 No message to send`);
      }
      
      // Generate title with Sonnet (fire and forget) - only for first message if enabled
      console.log(`🏷️ Title check: hasGeneratedTitle=${session.hasGeneratedTitle}, messageLength=${message?.length}, autoGenerateTitle=${autoGenerateTitle}`);
      if (autoGenerateTitle && !session.hasGeneratedTitle && message && message.length > 5) {
        // Extract only text content (no attachments)
        let textContent = message;
        try {
          // Check if content is JSON array (with attachments)
          const parsed = JSON.parse(message);
          if (Array.isArray(parsed)) {
            // Find text blocks only
            const textBlocks = parsed.filter(block => block.type === 'text');
            textContent = textBlocks.map(block => block.text).join(' ');
            console.log(`🏷️ Extracted text from JSON: "${textContent}"`);
          }
        } catch (e) {
          // Not JSON, use as-is (plain text message)
          console.log(`🏷️ Using plain text content: "${textContent}"`);
        }
        
        // Only generate title if we have actual text content
        if (textContent && textContent.trim().length > 5) {
          console.log(`🏷️ Calling generateTitle for session ${sessionId}`);
          // Only mark as generated after successful generation
          generateTitle(sessionId, textContent, socket, () => {
            console.log(`🏷️ Title successfully generated for session ${sessionId}`);
            session.hasGeneratedTitle = true;
          });
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
        debugLog(`🩺 [${sessionId}] duration: ${streamDuration}ms | since_last: ${timeSinceLastData}ms | bytes: ${bytesReceived} | msgs: ${messageCount} | buffer: ${lineBuffer.length} | alive: ${activeProcesses.has(sessionId)}`);
        
        if (timeSinceLastData > 30000) {
          console.error(`⚠️ WARNING: No data received for ${timeSinceLastData}ms!`);
          // Send keepalive to prevent client timeout
          socket.emit(`keepalive:${sessionId}`, { timestamp: Date.now() });
        }
        
        // If no data for 45 seconds, try to recover the stream
        if (timeSinceLastData > 45000 && timeSinceLastData < 50000) {
          console.warn(`⚠️ Stream stalled for ${timeSinceLastData}ms, attempting recovery...`);
          // Send a newline to potentially unstick the process
          if (activeProcesses.has(sessionId)) {
            const proc = activeProcesses.get(sessionId);
            if (proc.stdin && !proc.stdin.destroyed) {
              try {
                // Send a few newlines to make sure Claude gets input
                proc.stdin.write('\n\n');
                console.log(`📝 Sent newlines to potentially unstick process`);
              } catch (e) {
                console.error(`Failed to write to stdin: ${e.message}`);
              }
            }
          }
        }
        
        // NO TIME LIMIT - Claude can think as long as it needs
        // Extended thinking and complex tasks can take arbitrary time
      }, 5000);
      
      // Store health check interval for cleanup
      streamHealthChecks.set(sessionId, streamHealthInterval);
      
      // Set overall stream timeout (2 hours max per stream - for very long tasks)
      const streamTimeout = setTimeout(() => {
        console.warn(`⏰ Stream timeout reached for session ${sessionId} after 2 hours`);
        if (activeProcesses.has(sessionId)) {
          const proc = activeProcesses.get(sessionId);
          console.log(`⏰ Terminating long-running process for ${sessionId}`);
          proc.kill('SIGTERM');
        }
      }, 7200000); // 2 hours
      streamTimeouts.set(sessionId, streamTimeout);
      
      const processStreamLine = (line) => {
        if (!line.trim()) {
          debugLog(`🔸 [${sessionId}] Empty line received`);
          return;
        }

        debugLog(`🔹 [${sessionId}] Processing line (${line.length} chars): ${line}`);
        
        // WRAPPER: Process line for API capture and token tracking
        try {
          const augmentedLine = processWrapperLine(line, sessionId);
          if (augmentedLine && augmentedLine !== line) {
            line = augmentedLine;
          }
        } catch (e) {
          console.error(`[WRAPPER] Error processing line:`, e.message);
        }
        
        // Update lastDataTime whenever we process a valid line (including thinking blocks)
        lastDataTime = Date.now();
        
        // Check for "No conversation found" error message
        if (line.includes('No conversation found with session ID')) {
          console.log(`🔄 [${sessionId}] Resume failed - session not found in Claude storage`);
          console.log(`🔄 [${sessionId}] Will create new session with existing context on next message`);
          
          // Clear the invalid session ID so next attempt doesn't use --resume
          const session = sessions.get(sessionId);
          if (session) {
            // Clear the invalid session ID
            session.claudeSessionId = null;
            
            // Send a result message with checkpoint restore flag
            const errorResultId = `result-error-${Date.now()}-${Math.random()}`;
            const errorResultMessage = {
              id: errorResultId,
              type: 'result',
              subtype: 'error',
              is_error: true,
              error: 'Session not found - restoring from checkpoint',
              requiresCheckpointRestore: true, // Signal frontend to restore from checkpoint
              streaming: false,
              timestamp: Date.now()
            };
            const channel = `message:${sessionId}`;
            console.log(`📤 [${sessionId}] Emitting error result with checkpoint restore flag`);
            socket.emit(channel, errorResultMessage);
            console.log(`📤 [${sessionId}] Sent checkpoint restore signal`);
            
            // Send info message to explain what happened
            const infoMessageId = `system-info-${Date.now()}-${Math.random()}`;
            socket.emit(`message:${sessionId}`, {
              id: infoMessageId,
              type: 'system',
              subtype: 'info',
              message: { content: 'session history not found - send message again to continue' },
              timestamp: Date.now(),
              streaming: false
            });
            console.log(`📤 [${sessionId}] Sent info message ${infoMessageId} about session not found`);
            
            // Mark session as ready for new messages
            session.isReady = true;
            console.log(`✅ [${sessionId}] Session marked as ready after resume failure`);
          }
          return; // Don't try to parse as JSON
        }
        
        try {
          const jsonData = JSON.parse(line);
          console.log(`📦 [${sessionId}] Message type: ${jsonData.type}${jsonData.subtype ? ` (${jsonData.subtype})` : ''}`);
          
          // Extract session ID if present (update it every time to ensure we have the latest)
          // BUT: Don't store session_id from compact results as they can't be resumed
          const lastUserMessage = session?.messages?.filter(m => m.role === 'user').pop();
          const isCompactCommand = lastUserMessage?.message?.content?.trim() === '/compact';
          const isCompactResult = isCompactCommand && jsonData.type === 'result';
          
          if (jsonData.session_id && !isCompactResult) {
            // Check if this is a NEW Claude session (different session_id)
            const previousClaudeSessionId = session.claudeSessionId;
            const isNewClaudeSession = previousClaudeSessionId && previousClaudeSessionId !== jsonData.session_id;

            if (isNewClaudeSession) {
              // New Claude session detected - but DON'T reset tokens!
              // When resume fails or session changes, the conversation history is still
              // sent to claude (that's why cache_read is high). The context continues to accumulate.
              // Only reset on explicit /compact command.
              const wrapperSession = getWrapperSession(sessionId);
              console.log(`🔄 [${sessionId}] Claude session ID changed (${previousClaudeSessionId} → ${jsonData.session_id})`);
              console.log(`🔄 [${sessionId}] Preserving accumulated tokens: ${wrapperSession.totalTokens} (history still sent to claude)`);
            }

            session.claudeSessionId = jsonData.session_id;
            console.log(`📌 [${sessionId}] Claude session ID: ${session.claudeSessionId}`);
          } else if (isCompactResult && jsonData.session_id) {
            console.log(`🗜️ [${sessionId}] Ignoring session ID from compact result: ${jsonData.session_id} (not resumable)`);
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

            // Emit mid-stream context update if usage data is present
            // Skip subagent messages - they have their own context window
            if (jsonData.message?.usage && !jsonData.parent_tool_use_id) {
              const usage = jsonData.message.usage;
              const input = usage.input_tokens || 0;
              const output = usage.output_tokens || 0;
              const cacheRead = usage.cache_read_input_tokens || 0;
              const cacheCreation = usage.cache_creation_input_tokens || 0;

              // CRITICAL: Context window = input tokens only (NOT output)
              // Formula: cache_read + cache_creation + input
              // See: https://docs.anthropic.com/en/api/messages
              const total = cacheRead + cacheCreation + input;

              console.log(`📊 [${sessionId}] Mid-stream context update:`);
              console.log(`   input_tokens: ${input}`);
              console.log(`   cache_read: ${cacheRead}`);
              console.log(`   cache_creation: ${cacheCreation}`);
              console.log(`   TOTAL: ${total}/200000 (${Math.round(total/2000)}%)`);
              console.log(`   (output_tokens: ${output} - NOT counted in context)`);

              // Emit context-update event for real-time UI updates
              socket.emit(`context-update:${sessionId}`, {
                inputTokens: input,
                outputTokens: output,
                cacheReadTokens: cacheRead,
                cacheCreationTokens: cacheCreation,
                totalContextTokens: total,
                timestamp: Date.now()
              });
            } else if (jsonData.message?.usage && jsonData.parent_tool_use_id) {
              console.log(`📊 [${sessionId}] Skipping context update from subagent (parent: ${jsonData.parent_tool_use_id.substring(0, 20)}...)`);
            }

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
                  // Debug log for thinking blocks
                  if (block.type === 'thinking') {
                    console.log(`🧠 [${sessionId}] Found thinking block: ${(block.thinking || block.text || '').substring(0, 100)}...`);
                  }
                } else if (block.type === 'tool_use') {
                  hasToolUse = true;

                  // Capture file snapshot for rollback (before the edit is applied)
                  let fileSnapshot = null;

                  // Calculate line numbers for Edit/MultiEdit tools
                  let enhancedInput = block.input;
                  if ((block.name === 'Edit' || block.name === 'MultiEdit') && block.input?.file_path) {
                    try {
                      const filePath = block.input.file_path;
                      // Handle both absolute and relative paths
                      const fullPath = isAbsolute(filePath) ? filePath : join(session.workingDirectory || process.cwd(), filePath);
                      
                      console.log(`📍 [${sessionId}] Calculating line numbers for ${block.name} on ${fullPath}`);
                      
                      if (existsSync(fullPath)) {
                        const fileContent = readFileSync(fullPath, 'utf8');
                        const fileLines = fileContent.split('\n');
                        console.log(`📍 [${sessionId}] File has ${fileLines.length} lines`);

                        // Capture snapshot for rollback (file content BEFORE edit)
                        const fileStat = statSync(fullPath);
                        fileSnapshot = {
                          path: fullPath,
                          originalContent: fileContent,
                          timestamp: Date.now(),
                          mtime: fileStat.mtimeMs, // For conflict detection
                          sessionId: sessionId // For cross-session conflict detection
                        };
                        console.log(`📸 [${sessionId}] Captured file snapshot for rollback: ${fullPath} (${fileContent.length} bytes, mtime=${fileStat.mtimeMs})`);

                        if (block.name === 'Edit' && block.input.old_string) {
                          // Find line number for single edit
                          const oldString = block.input.old_string;
                          const oldLines = oldString.split('\n');
                          console.log(`📍 [${sessionId}] Looking for ${oldLines.length} line(s) in file`);
                          
                          // Find where this text appears in the file
                          let found = false;
                          for (let i = 0; i <= fileLines.length - oldLines.length; i++) {
                            let match = true;
                            for (let j = 0; j < oldLines.length; j++) {
                              if (fileLines[i + j] !== oldLines[j]) {
                                match = false;
                                break;
                              }
                            }
                            if (match) {
                              enhancedInput = { ...block.input, lineNumber: i + 1, endLineNumber: i + oldLines.length };
                              console.log(`📍 [${sessionId}] Found edit at lines ${i + 1}-${i + oldLines.length}`);
                              found = true;
                              break;
                            }
                          }
                          if (!found) {
                            console.log(`📍 [${sessionId}] Could not find exact match for old_string in file`);
                          }
                        } else if (block.name === 'MultiEdit' && block.input.edits) {
                          // Find line numbers for multiple edits
                          let currentFileContent = fileContent;
                          let currentFileLines = fileLines;
                          
                          const editsWithLineNumbers = block.input.edits.map((edit, editIdx) => {
                            if (!edit.old_string) return edit;
                            
                            const oldLines = edit.old_string.split('\n');
                            console.log(`📍 [${sessionId}] Edit ${editIdx + 1}: Looking for ${oldLines.length} line(s)`);
                            
                            // Find where this text appears in the current file state
                            for (let i = 0; i <= currentFileLines.length - oldLines.length; i++) {
                              let match = true;
                              for (let j = 0; j < oldLines.length; j++) {
                                if (currentFileLines[i + j] !== oldLines[j]) {
                                  match = false;
                                  break;
                                }
                              }
                              if (match) {
                                console.log(`📍 [${sessionId}] Edit ${editIdx + 1} found at lines ${i + 1}-${i + oldLines.length}`);
                                
                                // Apply this edit to our working copy for subsequent edits
                                const newLines = edit.new_string.split('\n');
                                currentFileLines.splice(i, oldLines.length, ...newLines);
                                currentFileContent = currentFileLines.join('\n');
                                
                                return { ...edit, lineNumber: i + 1, endLineNumber: i + oldLines.length };
                              }
                            }
                            console.log(`📍 [${sessionId}] Edit ${editIdx + 1} could not find match`);
                            return edit;
                          });
                          
                          enhancedInput = { ...block.input, edits: editsWithLineNumbers };
                        }
                      } else {
                        console.log(`📍 [${sessionId}] File not found: ${fullPath}`);
                        // New file - snapshot indicates it didn't exist
                        fileSnapshot = {
                          path: fullPath,
                          originalContent: null, // null means file didn't exist
                          isNewFile: true,
                          timestamp: Date.now(),
                          mtime: null, // No mtime for new files
                          sessionId: sessionId
                        };
                        console.log(`📸 [${sessionId}] Captured snapshot for NEW file: ${fullPath}`);
                      }
                    } catch (err) {
                      console.log(`📍 [${sessionId}] Error calculating line numbers for ${block.name}: ${err.message}`);
                    }
                  }

                  // Handle Write tool - capture existing file content before overwrite
                  if (block.name === 'Write' && block.input?.file_path && !fileSnapshot) {
                    try {
                      const filePath = block.input.file_path;
                      const fullPath = isAbsolute(filePath) ? filePath : join(session.workingDirectory || process.cwd(), filePath);

                      if (existsSync(fullPath)) {
                        const fileContent = readFileSync(fullPath, 'utf8');
                        const fileStat = statSync(fullPath);
                        fileSnapshot = {
                          path: fullPath,
                          originalContent: fileContent,
                          timestamp: Date.now(),
                          mtime: fileStat.mtimeMs,
                          sessionId: sessionId
                        };
                        console.log(`📸 [${sessionId}] Captured Write snapshot: ${fullPath} (${fileContent.length} bytes, mtime=${fileStat.mtimeMs})`);
                      } else {
                        // New file being created
                        fileSnapshot = {
                          path: fullPath,
                          originalContent: null,
                          isNewFile: true,
                          timestamp: Date.now(),
                          mtime: null,
                          sessionId: sessionId
                        };
                        console.log(`📸 [${sessionId}] Captured Write snapshot for NEW file: ${fullPath}`);
                      }
                    } catch (err) {
                      console.log(`📸 [${sessionId}] Error capturing Write snapshot: ${err.message}`);
                    }
                  }

                  // Track Bash tool use for focus restoration on macOS
                  if (block.name === 'Bash' && isFirstBashCommand) {
                    console.log(`🔧 [${sessionId}] Tracking first Bash tool use: ${block.id}`);
                    bashToolUseIds.set(block.id, { sessionId, timestamp: Date.now() });
                  }

                  // Send tool use as separate message immediately
                  const toolUseMessage = {
                    type: 'tool_use',
                    message: {
                      name: block.name,
                      input: enhancedInput,
                      id: block.id
                    },
                    timestamp: Date.now(),
                    id: `tool-${sessionId}-${Date.now()}`
                  };
                  // Include file snapshot for rollback if captured
                  if (fileSnapshot) {
                    toolUseMessage.fileSnapshot = fileSnapshot;
                  }
                  // Include parent_tool_use_id if this is a subagent message
                  if (jsonData.parent_tool_use_id) {
                    toolUseMessage.parent_tool_use_id = jsonData.parent_tool_use_id;
                    debugLog(`🤖 [${sessionId}] Subagent tool_use (parent: ${jsonData.parent_tool_use_id.substring(0, 20)}...): ${block.name}`);
                  }
                  queueMessage(sessionId, toolUseMessage, socket, true); // immediate for tool_use
                }
              }
              
              // Send assistant message with all non-tool content blocks (text + thinking)
              if (hasContent && contentBlocks.length > 0) {
                lastAssistantMessageIds.set(sessionId, messageId); // Track this message ID
                console.log(`📝 [${sessionId}] Emitting assistant message ${messageId} with streaming=true`);
                console.log(`📝 [${sessionId}] Content blocks: ${contentBlocks.length} (types: ${contentBlocks.map(b => b.type).join(', ')})`);
                const assistantMessage = {
                  type: 'assistant',
                  id: messageId,
                  message: {
                    ...jsonData.message,
                    content: contentBlocks  // Only send text/thinking blocks, not tool_use blocks
                  },
                  streaming: true,  // Set streaming to true during active streaming
                  timestamp: Date.now()
                };
                // Include parent_tool_use_id if this is a subagent message
                if (jsonData.parent_tool_use_id) {
                  assistantMessage.parent_tool_use_id = jsonData.parent_tool_use_id;
                  debugLog(`🤖 [${sessionId}] Subagent assistant message (parent: ${jsonData.parent_tool_use_id.substring(0, 20)}...)`);
                }
                queueMessage(sessionId, assistantMessage, socket);
                
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
                // ALWAYS emit assistant message, even if only tool uses
                // This ensures UI shows all messages properly
                lastAssistantMessageIds.set(sessionId, messageId);
                
                if (!allAssistantMessageIds.has(sessionId)) {
                  allAssistantMessageIds.set(sessionId, []);
                }
                allAssistantMessageIds.get(sessionId).push(messageId);
                
                console.log(`📝 [${sessionId}] Emitting assistant message ${messageId} (tool-only) with streaming=true`);
                socket.emit(`message:${sessionId}`, {
                  type: 'assistant',
                  id: messageId,
                  message: { 
                    ...jsonData.message,
                    content: []  // Empty content array for tool-only messages
                  },
                  streaming: true,
                  timestamp: Date.now()
                });
                
                // Save to session
                const session = sessions.get(sessionId);
                if (session) {
                  session.messages.push({
                    type: 'assistant',
                    message: { content: [] },
                    id: messageId,
                    timestamp: Date.now()
                  });
                }
                
                messageCount++;
              }
            }
            
          } else if (jsonData.type === 'user' && jsonData.message?.content) {
            // Handle tool results from user messages
            for (const block of jsonData.message.content) {
              if (block.type === 'tool_result') {
                // Check if this is a Bash tool result and trigger focus restoration on macOS
                if (bashToolUseIds.has(block.tool_use_id)) {
                  console.log(`🔧 [${sessionId}] Bash tool result received, triggering focus restoration`);
                  const bashInfo = bashToolUseIds.get(block.tool_use_id);
                  bashToolUseIds.delete(block.tool_use_id); // Clean up

                  // Set flag to false after first bash command
                  if (isFirstBashCommand) {
                    isFirstBashCommand = false;
                    console.log(`🔧 [${sessionId}] First bash command completed, focus restoration disabled for future commands`);
                  }

                  // NOTE: Focus restoration disabled on macOS server-side
                  // The frontend ClaudeChat.tsx has periodic focus guards that handle this more reliably
                  // Server-triggered focus restoration was causing race conditions with the guard
                  // and disrupting WKWebView's internal focus state
                }

                // Check if this is an Edit/MultiEdit tool result and enhance with context lines
                let enhancedContent = block.content;
                
                if (typeof block.content === 'string' && 
                    (block.content.includes('has been updated') || (block.content.includes('Applied') && block.content.includes('edits to')))) {
                  
                  // Extract file path from the content
                  const filePathMatch = block.content.match(/The file (.+?) has been updated/) || 
                                        block.content.match(/Applied \d+ edits? to (.+?):/);
                  
                  if (filePathMatch) {
                    const filePath = filePathMatch[1];
                    const fullPath = join(session.workingDirectory || process.cwd(), filePath);
                    console.log(`📝 [${sessionId}] Attempting to enhance diff for: ${filePath}`);
                    
                    // Try to read the file and add context lines
                    try {
                      if (existsSync(fullPath)) {
                        const fileContent = readFileSync(fullPath, 'utf8');
                        const fileLines = fileContent.split('\n');
                        
                        // Parse the diff lines to find changed line numbers
                        const diffLines = block.content.split('\n');
                        const lineNumberRegex = /^\s*(\d+)→/;
                        const changedLineNumbers = new Set();
                        
                        diffLines.forEach(line => {
                          const match = line.match(lineNumberRegex);
                          if (match) {
                            changedLineNumbers.add(parseInt(match[1]));
                          }
                        });
                        
                        // If we found changed lines, enhance the output with context
                        if (changedLineNumbers.size > 0) {
                          console.log(`📝 [${sessionId}] Found ${changedLineNumbers.size} changed lines, enhancing with context`);
                          const contextLines = 3; // Number of context lines to show
                          const enhancedDiffLines = [];
                          
                          // Add the header from original content
                          const headerEndIdx = diffLines.findIndex(line => line.includes("Here's the result of running"));
                          if (headerEndIdx >= 0) {
                            enhancedDiffLines.push(...diffLines.slice(0, headerEndIdx + 1));
                          }
                          
                          // Process each changed line number
                          const sortedLineNumbers = Array.from(changedLineNumbers).sort((a, b) => a - b);
                          let lastPrintedLine = -999; // Track last printed line to avoid duplicates
                          
                          sortedLineNumbers.forEach(lineNum => {
                            const startLine = Math.max(1, lineNum - contextLines);
                            const endLine = Math.min(fileLines.length, lineNum + contextLines);
                            
                            // Add context before
                            for (let i = startLine; i < lineNum; i++) {
                              if (i > lastPrintedLine) {
                                const paddedLineNum = String(i).padStart(6, ' ');
                                if (!changedLineNumbers.has(i)) {
                                  enhancedDiffLines.push(`${paddedLineNum} ${fileLines[i - 1]}`);
                                } else {
                                  // This is a changed line, show with arrow
                                  enhancedDiffLines.push(`${paddedLineNum}→${fileLines[i - 1]}`);
                                }
                                lastPrintedLine = i;
                              }
                            }
                            
                            // Add the changed line (it's already in the diff)
                            const paddedLineNum = String(lineNum).padStart(6, ' ');
                            if (lineNum > lastPrintedLine) {
                              enhancedDiffLines.push(`${paddedLineNum}→${fileLines[lineNum - 1]}`);
                              lastPrintedLine = lineNum;
                            }
                            
                            // Add context after
                            for (let i = lineNum + 1; i <= endLine; i++) {
                              if (i > lastPrintedLine) {
                                const paddedLineNum = String(i).padStart(6, ' ');
                                if (!changedLineNumbers.has(i)) {
                                  enhancedDiffLines.push(`${paddedLineNum} ${fileLines[i - 1]}`);
                                } else {
                                  // This is a changed line, show with arrow
                                  enhancedDiffLines.push(`${paddedLineNum}→${fileLines[i - 1]}`);
                                }
                                lastPrintedLine = i;
                              }
                            }
                            
                            // Add separator if there's a gap to next change
                            const nextLineNum = sortedLineNumbers[sortedLineNumbers.indexOf(lineNum) + 1];
                            if (nextLineNum && nextLineNum > endLine + 1) {
                              enhancedDiffLines.push('   ...');
                            }
                          });
                          
                          enhancedContent = enhancedDiffLines.join('\n');
                          console.log(`📝 [${sessionId}] Enhanced diff created with ${enhancedDiffLines.length} lines`);
                        } else {
                          console.log(`📝 [${sessionId}] No line numbers found in diff, keeping original content`);
                        }
                      }
                    } catch (err) {
                      console.log(`Could not enhance Edit output with context lines: ${err.message}`);
                      // Keep original content if file reading fails
                    }
                  }
                }
                
                const toolResultMessage = {
                  type: 'tool_result',
                  message: {
                    tool_use_id: block.tool_use_id,
                    content: enhancedContent,
                    is_error: block.is_error
                  },
                  timestamp: Date.now(),
                  id: `toolresult-${sessionId}-${Date.now()}`
                };
                // Include parent_tool_use_id if this is a subagent message
                if (jsonData.parent_tool_use_id) {
                  toolResultMessage.parent_tool_use_id = jsonData.parent_tool_use_id;
                  console.log(`🤖 [${sessionId}] Subagent tool_result (parent: ${jsonData.parent_tool_use_id.substring(0, 20)}...)`);
                }
                socket.emit(`message:${sessionId}`, toolResultMessage);

                // NOTE: Removed focus trigger - it was STEALING focus, not restoring it
                // Modern macOS doesn't lose focus when spawning child processes
              }
            }
            
          } else if (jsonData.type === 'content_block_start') {
            // Handle content block start events
            console.log(`📝 [${sessionId}] Content block starting:`, jsonData.content_block?.type);
            socket.emit(`message:${sessionId}`, {
              type: 'content_block_start',
              content_block: jsonData.content_block,
              index: jsonData.index,
              timestamp: Date.now()
            });
            
          } else if (jsonData.type === 'content_block_stop') {
            // Handle content block stop events
            console.log(`📝 [${sessionId}] Content block stopped:`, jsonData.index);
            socket.emit(`message:${sessionId}`, {
              type: 'content_block_stop',
              index: jsonData.index,
              timestamp: Date.now()
            });
            
          } else if (jsonData.type === 'rate_limit') {
            // Handle rate limit events
            console.log(`⚠️ [${sessionId}] Rate limit:`, jsonData.rate_limit);
            socket.emit(`message:${sessionId}`, {
              type: 'rate_limit',
              rate_limit: jsonData.rate_limit,
              timestamp: Date.now()
            });
            
          } else if (jsonData.type === 'progress') {
            // Handle progress events for long operations
            console.log(`⏳ [${sessionId}] Progress:`, jsonData.progress);
            socket.emit(`message:${sessionId}`, {
              type: 'progress',
              progress: jsonData.progress,
              message: jsonData.message,
              timestamp: Date.now()
            });
            
          } else if (jsonData.type === 'compact' || (jsonData.type === 'system' && jsonData.subtype === 'compact')) {
            // Handle explicit compact events
            console.log(`🗜️ [${sessionId}] Context compacted`);
            socket.emit(`message:${sessionId}`, {
              type: 'system',
              subtype: 'compact',
              message: { content: 'context compressed - usage will reset on next message' },
              timestamp: Date.now()
            });
            
          } else if (jsonData.type === 'ping' || jsonData.type === 'pong') {
            // Handle ping/pong for keep-alive
            console.log(`🏓 [${sessionId}] ${jsonData.type} received`);
            // Don't emit to frontend, just acknowledge
            
          } else if (jsonData.type === 'metadata') {
            // Handle metadata events
            console.log(`📋 [${sessionId}] Metadata:`, jsonData);
            if (jsonData.title) {
              // Send title update
              socket.emit(`title:${sessionId}`, jsonData.title);
            }
            
          } else if (jsonData.type === 'summary') {
            // Handle summary events
            console.log(`📝 [${sessionId}] Summary:`, jsonData.summary);
            if (jsonData.summary) {
              socket.emit(`title:${sessionId}`, jsonData.summary);
            }
            
          } else if (jsonData.type === 'result') {
            console.log(`📦 [${sessionId}] RESULT MESSAGE RECEIVED!`);
            console.log(`   ✅ Result: success=${!jsonData.is_error}, duration=${jsonData.duration_ms}ms`);
            console.log(`   📊 Full result data:`, JSON.stringify(jsonData, null, 2));
            
            // Check if this is a compact result - look for the last user message being /compact
            const session = sessions.get(sessionId);
            const lastUserMessage = session?.messages?.filter(m => m.role === 'user').pop();
            const isCompactCommand = lastUserMessage?.message?.content?.trim() === '/compact';
            
            // Compact results have specific patterns in the result text
            const isCompactResult = isCompactCommand && 
                                   (jsonData.result?.includes('Compacted') || 
                                    jsonData.result?.includes('compressed') ||
                                    jsonData.result?.includes('summary') ||
                                    jsonData.result === '' ||
                                    jsonData.result === null);
            
            if (isCompactResult) {
              console.log(`🗜️ [${sessionId}] Detected /compact command completion`);
              console.log(`🗜️ [${sessionId}] Result text: "${jsonData.result}"`);
              console.log(`🗜️ [${sessionId}] Session ID in result: ${jsonData.session_id}`);
              console.log(`🗜️ [${sessionId}] Usage data:`, jsonData.usage);
              
              // IMPORTANT: After compact, Claude returns a new session ID but it's NOT resumable
              // We need to clear the session ID so the next message starts fresh with the compacted context
              if (session) {
                const oldSessionId = session.claudeSessionId;
                // Clear the session ID - next message will start fresh
                session.claudeSessionId = null;
                // Mark that this session has been compacted so we don't try to restore old IDs
                session.wasCompacted = true;
                console.log(`🗜️ Cleared session ID (was ${oldSessionId}) - next message will start fresh after compact`);
                console.log(`🗜️ Marked session as compacted to prevent old ID restoration`);
                console.log(`🗜️ The compact command has summarized the conversation - continuing with reduced context`);
              }
              
              // Extract the new token count from the compact result
              // The compact command returns the new compressed token count
              const compactedTokens = jsonData.usage ? {
                input: jsonData.usage.input_tokens || 0,
                output: jsonData.usage.output_tokens || 0,
                cache_creation: jsonData.usage.cache_creation_input_tokens || 0,
                cache_read: jsonData.usage.cache_read_input_tokens || 0,
                total: (jsonData.usage.input_tokens || 0) + (jsonData.usage.output_tokens || 0) + (jsonData.usage.cache_creation_input_tokens || 0) + (jsonData.usage.cache_read_input_tokens || 0)
              } : null;
              
              if (compactedTokens) {
                console.log(`🗜️ [${sessionId}] Compacted token count: ${compactedTokens.total} (input: ${compactedTokens.input}, output: ${compactedTokens.output})`);
              }
              
              // Send compact notification with token info
              socket.emit(`message:${sessionId}`, {
                type: 'system',
                subtype: 'compact',
                session_id: null, // Clear session ID after compact
                message: { 
                  content: 'context compacted - starting fresh with reduced tokens',
                  compactedTokens: compactedTokens,
                  compactSummary: jsonData.result || 'conversation summarized'
                },
                timestamp: Date.now()
              });
            }
            
            // Log usage/cost information if present
            if (jsonData.usage) {
              const input = jsonData.usage.input_tokens || 0;
              const output = jsonData.usage.output_tokens || 0;
              const cacheCreation = jsonData.usage.cache_creation_input_tokens || 0;
              const cacheRead = jsonData.usage.cache_read_input_tokens || 0;

              // Get tracked total from wrapper - this persists across cache expiry
              const wrapperSessionForLog = getWrapperSession(sessionId);
              const trackedTotal = wrapperSessionForLog.totalTokens;
              // Also calculate API-reported total for comparison
              const apiReportedTotal = cacheRead + cacheCreation + input + output;

              console.log(`\n📊 TOKEN USAGE BREAKDOWN:`);
              console.log(`   ┌─────────────────┬──────────┬──────────────┬────────────┐`);
              console.log(`   │ Type            │ Input    │ Cache Read   │ Cache New  │`);
              console.log(`   ├─────────────────┼──────────┼──────────────┼────────────┤`);
              console.log(`   │ User Message    │ ${String(input).padEnd(8)} │              │            │`);
              console.log(`   │ Assistant Reply │ ${String(output).padEnd(8)} │              │            │`);
              console.log(`   │ Context History │          │ ${String(cacheRead).padEnd(12)} │            │`);
              console.log(`   │ New Cache       │          │              │ ${String(cacheCreation).padEnd(10)} │`);
              console.log(`   ├─────────────────┼──────────┼──────────────┼────────────┤`);
              console.log(`   │ Subtotal        │ ${String(input + output).padEnd(8)} │ ${String(cacheRead).padEnd(12)} │ ${String(cacheCreation).padEnd(10)} │`);
              console.log(`   └─────────────────┴──────────┴──────────────┴────────────┘`);
              console.log(`   API REPORTED: ${apiReportedTotal} | TRACKED TOTAL: ${trackedTotal} / 200000 (${(trackedTotal/2000).toFixed(1)}%)`);
              console.log(`   Note: Tracked total persists even when Anthropic's cache expires`);
            }
            
            // NOTE: Do NOT mark streaming=false here on result message!
            // In agentic mode (using Task tool, subagents), there can be multiple
            // result messages per conversation as each "turn" completes.
            // Marking streaming=false here causes premature UI state changes.
            // The process exit handler will mark streaming=false with a debounce
            // to properly handle both normal and agentic workflows.
            const lastAssistantMessageId = lastAssistantMessageIds.get(sessionId);
            if (lastAssistantMessageId) {
              console.log(`📋 [${sessionId}] Result received with last assistant message ${lastAssistantMessageId} - deferring streaming=false to process exit`);
              // Don't delete lastAssistantMessageIds here - process exit handler needs it
            }
            
            // Just send the result message with model info and session ID
            // Model is available from the outer scope (sendMessage handler)
            console.log(`✅ [${sessionId}] Sending result message with model: ${model}`);
            
            // Don't include session_id in result if this was a compact command
            // NOTE: Do NOT include streaming: false here! (see comment at line 4332)
            // In agentic mode, result messages are intermediate - streaming state
            // is controlled by the process exit handler with debounce.
            const resultMessage = {
              type: 'result',
              ...jsonData,
              // streaming: false, -- REMOVED: causes premature UI state change in agentic mode
              id: `result-${sessionId}-${Date.now()}`,
              model: model || 'unknown' // Use model from outer scope directly
            };
            
            // CRITICAL: Include usage directly (like Windows) AND in wrapper field
            // This ensures compatibility with both old Windows code and new wrapper integration
            if (jsonData.usage) {
              // Include usage directly for Windows compatibility
              resultMessage.usage = jsonData.usage;

              // Get wrapper session to get the accurate accumulated token count
              const wrapperSession = getWrapperSession(sessionId);

              // Add wrapper tokens for enhanced analytics
              // wrapperSession.totalTokens is updated from all messages with usage (including result)
              resultMessage.wrapper = {
                tokens: {
                  input: jsonData.usage.input_tokens || 0,
                  output: jsonData.usage.output_tokens || 0,
                  total: wrapperSession.totalTokens,
                  cache_read: jsonData.usage.cache_read_input_tokens || 0,
                  cache_creation: jsonData.usage.cache_creation_input_tokens || 0
                }
              };
              console.log(`📊 [WRAPPER-TOKENS] Added both usage and wrapper tokens to result message:`, {
                usage: resultMessage.usage,
                wrapperTokens: resultMessage.wrapper.tokens
              });
            } else {
              console.log(`❌ [WRAPPER-TOKENS] No usage data in jsonData, neither usage nor wrapper field added`);
            }

            // Only include session_id if it's not a compact result
            if (!isCompactResult && session.claudeSessionId) {
              resultMessage.session_id = session.claudeSessionId;
            }
            
            console.log(`   - Model in result message: ${resultMessage.model}`);
            console.log(`   - Session ID in result message: ${resultMessage.session_id || '(cleared after compact)'}`);
            if (resultMessage.usage) {
              console.log(`   - Usage: input=${resultMessage.usage.input_tokens || 0}, output=${resultMessage.usage.output_tokens || 0}, cache_read=${resultMessage.usage.cache_read_input_tokens || 0}, cache_creation=${resultMessage.usage.cache_creation_input_tokens || 0}`);
              console.log(`   - Context total: ${resultMessage.wrapper?.tokens?.total || 0}`);
            }
            
            // Debug log the full resultMessage before emitting
            debugLog(`📤 [EMIT-DEBUG] About to emit result message with wrapper field:`, {
              hasWrapper: !!resultMessage.wrapper,
              wrapperTokens: resultMessage.wrapper?.tokens,
              messageKeys: Object.keys(resultMessage),
              wrapperStructure: resultMessage.wrapper ? Object.keys(resultMessage.wrapper) : null
            });
            
            socket.emit(`message:${sessionId}`, resultMessage);
            messageCount++;
          }
          
        } catch (e) {
          // Not JSON, treat as plain text
          debugLog(`⚠️ [${sessionId}] Failed to parse JSON, treating as plain text:`, e.message);
          debugLog(`⚠️ [${sessionId}] Line was: ${line}`);
        }
      };

      // Add debugging for the spawned process
      console.log(`🔍 [${sessionId}] Process spawned with PID: ${claudeProcess.pid}`);
      console.log(`🔍 [${sessionId}] Process connected: ${claudeProcess.connected}`);
      
      // Capture stderr for debugging (buffer accumulates for WSL error detection)
      let stderrBuffer = '';

      // Handle stdout
      // Set up periodic buffer flush to prevent stalls
      const bufferFlushInterval = setInterval(() => {
        if (lineBuffer.length > 0 && Date.now() - lastDataTime > 5000) {
          console.warn(`⚠️ [${sessionId}] Flushing stale buffer (${lineBuffer.length} chars)`);
          // Try to process incomplete JSON as-is
          if (lineBuffer.trim()) {
            try {
              processStreamLine(lineBuffer);
              lineBuffer = '';
            } catch (e) {
              // If it's not valid JSON, wait for more data
              console.log(`📝 [${sessionId}] Buffer contains incomplete JSON, waiting for more data`);
            }
          }
        }
      }, 5000);
      
      claudeProcess.stdout.on('data', (data) => {
        const str = data.toString();
        bytesReceived += data.length;
        lastDataTime = Date.now();
        
        console.log(`📥 [${sessionId}] STDOUT received: ${str.length} bytes (total: ${bytesReceived})`);
        console.log(`📥 [${sessionId}] Data preview: ${str.substring(0, 200)}...`);
        
        // Prevent memory overflow from excessive buffering
        if (lineBuffer.length > MAX_LINE_BUFFER_SIZE) {
          console.error(`⚠️ [${sessionId}] Line buffer overflow (${lineBuffer.length} bytes), processing and clearing`);
          // Force process partial data
          if (lineBuffer.includes('{')) {
            // Try to find complete JSON objects
            const jsonMatches = lineBuffer.match(/\{[^}]*\}/g);
            if (jsonMatches) {
              for (const jsonStr of jsonMatches) {
                try {
                  processStreamLine(jsonStr);
                } catch (e) {
                  console.error(`[${sessionId}] Failed to process JSON chunk:`, e);
                }
              }
            }
          }
          lineBuffer = '';
        }
        
        lineBuffer += str;
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() || '';
        
        debugLog(`📋 [${sessionId}] Split into ${lines.length} lines, buffer remaining: ${lineBuffer.length} chars`);

        for (let i = 0; i < lines.length; i++) {
          debugLog(`📋 [${sessionId}] Processing line ${i + 1}/${lines.length}`);
          processStreamLine(lines[i]);
        }
      });
      
      // Clean up buffer flush interval on process exit
      claudeProcess.on('exit', () => {
        clearInterval(bufferFlushInterval);
      });

      // Handle stderr (single handler - avoid duplicates which cause memory leaks)
      claudeProcess.stderr.on('data', (data) => {
        const error = data.toString();
        stderrBuffer += error; // Accumulate for WSL error detection
        console.error(`⚠️ [${sessionId}] Claude stderr (${data.length} bytes):`, error);
        lastDataTime = Date.now();

        // Check for common WSL errors
        if (error.includes('command not found') || error.includes('No such file')) {
          console.error(`❌ [${sessionId}] WSL PATH ERROR - Claude CLI not found!`);
          console.error(`❌ [${sessionId}] Full stderr: ${stderrBuffer}`);
        }
        if (error.includes('bash:') || error.includes('sh:')) {
          console.error(`❌ [${sessionId}] WSL BASH ERROR detected`);
        }

        // Check if this is a "No conversation found" error
        if (error.includes('No conversation found with session ID')) {
          console.log(`🔄 Resume failed - session not found in Claude storage`);
          console.log(`🔄 Clearing invalid session ID - will use fresh conversation on next message`);
          if (session?.wasCompacted) {
            console.log(`🔄 This was expected - session was compacted and old ID is no longer valid`);
          }
          
          // Clear the invalid session ID
          session.claudeSessionId = null;
          session.wasInterrupted = false;
          
          // Send result message with checkpoint restore flag
          const errorResultId = `result-error-${Date.now()}-${Math.random()}`;
          const errorResultMessage = {
            id: errorResultId,
            type: 'result',
            subtype: 'error',
            is_error: true,
            error: 'Session not found - restoring from checkpoint',
            requiresCheckpointRestore: true,
            streaming: false,
            timestamp: Date.now()
          };
          const channel = `message:${sessionId}`;
          console.log(`📤 [${sessionId}] Emitting error result with checkpoint restore (stderr)`);
          socket.emit(channel, errorResultMessage);
          console.log(`📤 [${sessionId}] Sent checkpoint restore signal (stderr)`);
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
        // Remove PID from tracking set
        if (claudeProcess.pid) {
          allChildPids.delete(claudeProcess.pid);
        }

        // Clean stdin on exit
        if (claudeProcess.stdin && !claudeProcess.stdin.destroyed) {
          try {
            claudeProcess.stdin.end();
            console.log(`📝 Closed stdin on process exit`);
          } catch (e) {
            // Ignore errors on cleanup
          }
        }

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
        console.log(`   ├─ Exit code: ${code}`);
        console.log(`   ├─ Stderr: ${stderrBuffer || '(empty)'}`);
        console.log(`   └─ Line buffer: ${lineBuffer || '(empty)'}`);
        
        // Log if we got no output at all
        if (bytesReceived === 0) {
          console.error(`❌ [${sessionId}] NO OUTPUT RECEIVED FROM CLAUDE!`);
          console.error(`❌ [${sessionId}] This usually means:`);
          console.error(`   1. Claude CLI is not installed in WSL`);
          console.error(`   2. Claude is not in any of the expected paths`);
          console.error(`   3. WSL is not running properly`);
          console.error(`   4. The command syntax is wrong`);
        }
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
          // Exit code 1 might mean --resume failed OR other errors
          const session = sessions.get(sessionId);
          
          // Check if stderr contains "No conversation found" - mark for recreation
          if (session && session.claudeSessionId && stderrBuffer.includes('No conversation found')) {
            console.log(`⚠️ Resume failed - session not found in Claude storage`);
            console.log(`🔄 Will recreate session with existing context on next attempt`);
            // Clear the invalid session ID
            session.claudeSessionId = null;
            
            // Send result message with checkpoint restore flag
            const errorResultId = `result-error-${Date.now()}-${Math.random()}`;
            const errorResultMessage = {
              id: errorResultId,
              type: 'result',
              subtype: 'error',
              is_error: true,
              error: 'Session not found - restoring from checkpoint',
              requiresCheckpointRestore: true,
              streaming: false,
              timestamp: Date.now()
            };
            const channel = `message:${sessionId}`;
            console.log(`📤 [${sessionId}] Emitting error result with checkpoint restore (exit code 1)`);
            socket.emit(channel, errorResultMessage);
            console.log(`📤 [${sessionId}] Sent checkpoint restore signal (exit code 1)`);
            
            // Clear the assistant message ID tracking
            const lastAssistantMessageId = lastAssistantMessageIds.get(sessionId);
            if (lastAssistantMessageId) {
              console.log(`🔴 Clearing assistant message ID ${lastAssistantMessageId} after resume failure`);
              lastAssistantMessageIds.delete(sessionId);
            }
            
            // Send a subtle notification that we'll continue without resume
            socket.emit(`message:${sessionId}`, {
              type: 'system',
              subtype: 'info',
              message: { content: 'continuing conversation (session history not found in claude)' },
              timestamp: Date.now(),
              streaming: false
            });
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
        
        // Only clear streaming state if this wasn't an interrupted process
        // When interrupted, a new process is spawned and we don't want to clear its streaming state
        const session = sessions.get(sessionId);
        if (session?.wasInterrupted) {
          console.log(`🔄 Skipping streaming=false for interrupted process (new process is running)`);
        } else {
          // Use debounced streaming=false to prevent UI flicker in agentic mode
          // In agentic mode, processes cycle rapidly (result -> new message -> new process)
          // Without debounce, UI briefly shows "not streaming" then "streaming" again
          const lastAssistantMessageId = lastAssistantMessageIds.get(sessionId);

          // Cancel any existing pending timer for this session
          cancelPendingStreamingFalse(sessionId);

          console.log(`⏱️ [${sessionId}] Scheduling streaming=false with ${STREAMING_FALSE_DEBOUNCE_MS}ms debounce`);

          const timer = setTimeout(() => {
            // Check if a new process has started while we were waiting
            if (activeProcesses.has(sessionId)) {
              console.log(`🔄 [${sessionId}] New process started during debounce - skipping streaming=false`);
              pendingStreamingFalseTimers.delete(sessionId);
              return;
            }

            // Check if session was interrupted while we were waiting
            const currentSession = sessions.get(sessionId);
            if (currentSession?.wasInterrupted) {
              console.log(`🔄 [${sessionId}] Session interrupted during debounce - skipping streaming=false`);
              pendingStreamingFalseTimers.delete(sessionId);
              return;
            }

            if (lastAssistantMessageId) {
              console.log(`🔴 [${sessionId}] Debounce complete - marking streaming=false for ${lastAssistantMessageId}`);
              const lastAssistantMsg = currentSession?.messages.find(m => m.id === lastAssistantMessageId);

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

            // NOTE: Removed focus trigger - it was STEALING focus, not restoring it
            // Modern macOS doesn't lose focus when spawning child processes

            pendingStreamingFalseTimers.delete(sessionId);
          }, STREAMING_FALSE_DEBOUNCE_MS);

          pendingStreamingFalseTimers.set(sessionId, { timer, timestamp: Date.now() });
        }
        
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
          // Don't show error for interrupted sessions (SIGINT typically exits with code 130 or 2)
          if (session.wasInterrupted) {
            console.log(`Process exited with code ${code} after interruption - not showing error`);
            session.wasInterrupted = false; // Reset the flag
          } else {
            console.error(`Claude process failed with exit code ${code}`);
            socket.emit(`message:${sessionId}`, {
              type: 'system',
              subtype: 'info',
              message: `process completed with code ${code}`,
              timestamp: Date.now()
            });
          }
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
        // For errors, we mark streaming=false immediately (no debounce) since
        // the process definitely failed and user needs to know to retry
        cancelPendingStreamingFalse(sessionId); // Cancel any pending debounced timer

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
          lastAssistantMessageIds.delete(sessionId);
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

        // Clean up spawning state on error
        isSpawningProcess = false;
        spawningProcesses.delete(sessionId);

        // Handle any pending interrupt callback that was waiting for spawn to complete
        const pendingInterruptCallback = pendingInterrupts.get(sessionId);
        if (pendingInterruptCallback) {
          console.log(`📝 Calling pending interrupt callback for session ${sessionId} due to spawn error`);
          pendingInterrupts.delete(sessionId);
          pendingInterruptCallback({ success: false, error: error.message, spawnFailed: true });
        }

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
    const claudeProcess = activeProcesses.get(sessionId);
    const session = sessions.get(sessionId);

    console.log(`⛔ Interrupt requested for session ${sessionId}`);

    // Clear the spawn queue on interrupt to prevent stale messages from being sent
    // This is important when user interrupts and immediately sends a new message
    const queueLengthBefore = processSpawnQueue.length;
    if (queueLengthBefore > 0) {
      processSpawnQueue.length = 0; // Clear the entire queue
      console.log(`🧹 Cleared ${queueLengthBefore} queued messages after interrupt`);
    }

    // CRITICAL: Check if process is currently spawning (race condition fix)
    const spawnState = spawningProcesses.get(sessionId);
    if (spawnState && !spawnState.aborted) {
      console.log(`⚠️ Session ${sessionId} is currently spawning - marking for abort`);
      spawnState.aborted = true;
      spawningProcesses.set(sessionId, spawnState);

      // Store callback to be called when spawn completes
      if (callback) {
        pendingInterrupts.set(sessionId, callback);
        console.log(`📝 Stored pending interrupt callback for session ${sessionId}`);
      }

      // Send immediate feedback to user
      socket.emit(`message:${sessionId}`, {
        type: 'system',
        subtype: 'interrupted',
        message: 'stopping task...',
        timestamp: Date.now()
      });

      return; // Will be handled when spawn completes
    }

    if (claudeProcess) {
      console.log(`🛑 Killing claude process for session ${sessionId} (PID: ${claudeProcess.pid})`);

      // Kill the entire process group on Unix/macOS
      if (claudeProcess.pid) {
        try {
          process.kill(-claudeProcess.pid, 'SIGINT'); // Negative PID kills process group
        } catch (e) {
          // Fallback to regular kill
          claudeProcess.kill('SIGINT');
        }
      } else {
        claudeProcess.kill('SIGINT');
      }

      activeProcesses.delete(sessionId);
      activeProcessStartTimes.delete(sessionId);
      
      // Mark session as interrupted for proper resume handling
      if (session) {
        session.wasInterrupted = true;
        console.log(`🔄 Session ${sessionId} interrupted - marked wasInterrupted=true for followup`);
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
      
      // Include wrapper tokens so frontend can update context usage even on interrupt
      const wrapperSession = getWrapperSession(sessionId);
      socket.emit(`message:${sessionId}`, {
        type: 'system',
        subtype: 'interrupted',
        message: 'task interrupted by user',
        timestamp: Date.now(),
        wrapper: {
          tokens: {
            input: wrapperSession.inputTokens || 0,
            output: wrapperSession.outputTokens || 0,
            total: wrapperSession.totalTokens || 0,
            cache_read: wrapperSession.cacheReadTokens || 0,
            cache_creation: wrapperSession.cacheCreationTokens || 0
          }
        }
      });
      
      // Send callback response so client knows interrupt completed
      if (callback) {
        callback({ success: true });
      }
    } else {
      // No active process to interrupt - but still send success to update UI state
      console.log(`⚠️ No active process found for session ${sessionId} - nothing to interrupt`);

      // Also clear any spawning state that might be stale
      spawningProcesses.delete(sessionId);
      pendingInterrupts.delete(sessionId);

      // Still emit interrupted message to ensure UI state is consistent
      socket.emit(`message:${sessionId}`, {
        type: 'system',
        subtype: 'interrupted',
        message: 'task stopped',
        timestamp: Date.now()
      });

      if (callback) {
        callback({ success: true, noProcess: true });
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
    const claudeProcess = activeProcesses.get(sessionId);
    if (claudeProcess) {
      console.log(`🛑 Killing process for cleared session ${sessionId} (PID: ${claudeProcess.pid})`);
      if (claudeProcess.pid) {
        try {
          process.kill(-claudeProcess.pid, 'SIGINT');
        } catch (e) {
          claudeProcess.kill('SIGINT');
        }
      } else {
        claudeProcess.kill('SIGINT');
      }
      activeProcesses.delete(sessionId);
      activeProcessStartTimes.delete(sessionId);
    }
    
    // Clear the session data but keep the session alive
    session.messages = [];
    session.claudeSessionId = null;  // Reset Claude session ID so next message starts fresh
    session.hasGeneratedTitle = false;  // Reset title generation flag so next message gets a new title
    session.wasInterrupted = false;  // Reset interrupted flag
    session.wasCompacted = false;  // Reset compacted flag
    session.lastActivity = Date.now();  // Update last activity on clear

    // Clean up associated state Maps (but session stays alive)
    lastAssistantMessageIds.delete(sessionId);  // Clear any tracked assistant message IDs
    allAssistantMessageIds.delete(sessionId);  // Clear all assistant message IDs
    wrapperState.sessions.delete(sessionId);  // Clear wrapper state (will be recreated on next message)
    messageBatches.delete(sessionId);  // Clear message batches
    pendingInterrupts.delete(sessionId);  // Clear pending interrupts
    spawningProcesses.delete(sessionId);  // Clear spawning state
    cancelPendingStreamingFalse(sessionId);  // Clear pending streaming timers
    cleanupBatch(sessionId);  // Ensure batch cleanup

    console.log(`✅ Session ${sessionId} cleared - will start fresh Claude session on next message`);

    // Send clear confirmation
    socket.emit(`message:${sessionId}`, {
      type: 'system',
      subtype: 'clear',
      message: 'session cleared',
      timestamp: Date.now()
    });

    // Note: Don't emit title reset - frontend handles tab numbering in clearContext
  });
  
  socket.on('deleteSession', async (data, callback) => {
    const { sessionId } = data;
    console.log(`🗑️ Deleting session ${sessionId} and cleaning up all associated state`);

    // Clean up all Maps associated with this session
    sessions.delete(sessionId);
    wrapperState.sessions.delete(sessionId);  // Clean up wrapper state
    messageBatches.delete(sessionId);  // Clean up message batches
    lastAssistantMessageIds.delete(sessionId);  // Clean up tracking
    allAssistantMessageIds.delete(sessionId);  // Clean up all assistant message IDs
    activeProcesses.delete(sessionId);  // Clean up any orphaned process references
    activeProcessStartTimes.delete(sessionId);  // Clean up process start times
    streamHealthChecks.delete(sessionId);  // Clean up stream health checks
    streamTimeouts.delete(sessionId);  // Clean up stream timeouts
    cancelPendingStreamingFalse(sessionId);  // Clean up pending streaming timers
    spawningProcesses.delete(sessionId);  // Clean up spawning state
    pendingInterrupts.delete(sessionId);  // Clean up pending interrupts
    cleanupBatch(sessionId);  // Ensure batch cleanup

    callback({ success: true });
  });

  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected:', socket.id);

    // Clean up vscode connection if this was a vscode client
    if (vscodeConnections.has(socket.id)) {
      vscodeConnections.delete(socket.id);
      vscodeConnected = vscodeConnections.size > 0;
      console.log(`🆚 VSCode client disconnected: ${socket.id} (total: ${vscodeConnections.size})`);
      io.emit('vscode:status', { connected: vscodeConnected, count: vscodeConnections.size });
    }

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
        
        const claudeProcess = activeProcesses.get(sessionId);
        if (claudeProcess) {
          console.log(`🧹 Cleaning up process for session ${sessionId} (PID: ${claudeProcess.pid})`);
          if (claudeProcess.pid) {
            try {
              process.kill(-claudeProcess.pid, 'SIGINT');
            } catch (e) {
              claudeProcess.kill('SIGINT');
            }
          } else {
            claudeProcess.kill('SIGINT');
          }
          activeProcesses.delete(sessionId);
          activeProcessStartTimes.delete(sessionId);
        }
        lastAssistantMessageIds.delete(sessionId);
        allAssistantMessageIds.delete(sessionId);  // Clean up all assistant message IDs
        wrapperState.sessions.delete(sessionId);  // Clean up wrapper state
        messageBatches.delete(sessionId);  // Clean up message batches
        pendingInterrupts.delete(sessionId);  // Clean up pending interrupts
        cancelPendingStreamingFalse(sessionId);  // Clean up pending streaming timers
        spawningProcesses.delete(sessionId);  // Clean up spawning state
        cleanupBatch(sessionId);  // Ensure batch cleanup
      }
    }
  });
});

// Clean up old PID files on startup
function cleanupOldPidFiles() {
  try {
    const pidPattern = /^(\.yume-)?server-\d+\.pid$/;
    
    // Clean up PID files in home directory
    const homeDir = homedir();
    if (fs.existsSync(homeDir)) {
      const homeFiles = fs.readdirSync(homeDir);
      homeFiles.forEach(file => {
        if (pidPattern.test(file)) {
          const fullPath = join(homeDir, file);
          // Don't delete our current PID file
          if (fullPath !== pidFilePath) {
            try {
              fs.unlinkSync(fullPath);
              console.log(`🗑️ Cleaned up old PID file: ${file}`);
            } catch (err) {
              // Ignore errors for individual files
            }
          }
        }
      });
    }
    
    // Clean up PID files in current directory
    const currentDir = __dirname;
    if (fs.existsSync(currentDir)) {
      const dirFiles = fs.readdirSync(currentDir);
      dirFiles.forEach(file => {
        if (pidPattern.test(file)) {
          const fullPath = join(currentDir, file);
          // Don't delete our current PID file
          if (fullPath !== pidFilePath) {
            try {
              fs.unlinkSync(fullPath);
              console.log(`🗑️ Cleaned up old PID file: ${file}`);
            } catch (err) {
              // Ignore errors for individual files
            }
          }
        }
      });
    }
    
    // Clean up PID files in temp directory (for extracted server)
    const tmpDir = process.env.TEMP || process.env.TMP || '/tmp';
    const yumeServerDir = join(tmpDir, 'yume-server');
    if (fs.existsSync(yumeServerDir)) {
      const tmpFiles = fs.readdirSync(yumeServerDir);
      tmpFiles.forEach(file => {
        if (pidPattern.test(file)) {
          const fullPath = join(yumeServerDir, file);
          // Don't delete our current PID file
          if (fullPath !== pidFilePath) {
            try {
              fs.unlinkSync(fullPath);
              console.log(`🗑️ Cleaned up old PID file in temp: ${file}`);
            } catch (err) {
              // Ignore errors for individual files
            }
          }
        }
      });
    }
    
    console.log('✅ PID file cleanup complete');
  } catch (err) {
    console.log('⚠️ PID file cleanup error:', err.message);
    // Don't fail startup if cleanup fails
  }
}

// Clean up old PID files before starting
cleanupOldPidFiles();

// ============================================
// PARENT PID WATCHDOG - BULLETPROOF ZOMBIE PREVENTION
// ============================================
// The server will self-terminate when its parent (Tauri) dies.
// This is the ONLY reliable way to prevent zombie processes when:
// - User presses Cmd+Q on macOS
// - Tauri crashes
// - System kills the app
// - Force quit
// Without this, the server becomes orphaned (PPID=1) and runs forever.

const PARENT_PID_AT_STARTUP = process.ppid;
console.log(`👁️ Parent PID watchdog initialized: parent=${PARENT_PID_AT_STARTUP}, self=${process.pid}`);

function isParentAlive() {
  try {
    // Check if parent process still exists
    // On macOS/Linux, process.ppid returns current parent
    // If parent dies, ppid becomes 1 (launchd/init)
    const currentPpid = process.ppid;

    // If PPID changed to 1, parent died
    if (currentPpid === 1 && PARENT_PID_AT_STARTUP !== 1) {
      console.log(`💀 Parent died! PPID changed from ${PARENT_PID_AT_STARTUP} to 1 (launchd/init)`);
      return false;
    }

    // Double-check: try to signal the original parent
    // kill(pid, 0) checks if process exists without sending a signal
    process.kill(PARENT_PID_AT_STARTUP, 0);
    return true;
  } catch (err) {
    // ESRCH = No such process (parent died)
    // EPERM = Permission denied (parent exists but we can't signal it - still alive)
    if (err.code === 'ESRCH') {
      console.log(`💀 Parent process ${PARENT_PID_AT_STARTUP} no longer exists (ESRCH)`);
      return false;
    }
    // EPERM means process exists but we don't have permission - parent is alive
    return true;
  }
}

let watchdogInterval = null;

function startParentWatchdog() {
  // Check parent every 500ms - fast enough to catch quick exits
  watchdogInterval = setInterval(() => {
    if (!isParentAlive()) {
      console.log('🛑 Parent process died - server self-terminating to prevent zombie...');

      // Clean shutdown
      cleanupGitLocks();
      forceKillAllChildren();
      removePidFile();

      // Stop the watchdog
      if (watchdogInterval) {
        clearInterval(watchdogInterval);
      }

      // Exit immediately
      console.log('✅ Self-termination complete - goodbye!');
      process.exit(0);
    }
  }, 500);

  // Ensure watchdog doesn't prevent process exit
  watchdogInterval.unref();

  console.log('👁️ Parent watchdog started - server will self-terminate if parent dies');
}

// Start server with error handling
httpServer.listen(PORT, () => {
  writePidFile();

  // Start the parent watchdog AFTER server is running
  startParentWatchdog();

  console.log(`🚀 yume server running on port ${PORT}`);
  console.log(`📂 Working directory: ${process.cwd()}`);
  console.log(`🖥️ Platform: ${platform()}`);
  console.log(`🏠 Home directory: ${homedir()}`);
  console.log(`📁 Claude projects: ${join(homedir(), '.claude', 'projects')}`);
  
  // Check if Claude projects directory exists and is accessible
  const projectsDir = join(homedir(), '.claude', 'projects');
  if (existsSync(projectsDir)) {
    console.log('✅ Claude projects directory exists');
    try {
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
});

// Handle port already in use error
httpServer.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use (likely another yume instance)`);
    console.error('Exiting - Tauri will retry with a different port');
    // Exit with code 48 (EADDRINUSE) to signal port conflict to Tauri
    // Do NOT kill other processes - allow multiple yume instances to coexist
    process.exit(48);
  } else {
    console.error('Server error:', error);
    process.exit(1);
  }
});
