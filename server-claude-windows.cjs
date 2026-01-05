console.log('════════════════════════════════════════════════════════════════════');
console.log('🪟 YURUCODE SERVER: Windows External Server (server-claude-windows.cjs)');
console.log('🪟 Platform-specific server for Windows - aligned with macOS flow');
console.log('🪟 Edit code at: server-claude-windows.cjs');
console.log('🪟 Uses external file for easier debugging and updates');
console.log('════════════════════════════════════════════════════════════════════');

/**
 * Windows-compatible server that runs claude CLI directly
 * Aligned with macOS server - NO SDK, NO API KEY - just direct claude CLI calls with streaming
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
      // Per-request tokens (last API call)
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      // Accumulated tokens (across all API calls in session)
      accumulatedInputTokens: 0,
      accumulatedOutputTokens: 0,
      accumulatedTotalTokens: 0,
      accumulatedCacheRead: 0,
      accumulatedCacheCreation: 0,
      messageCount: 0,
      apiResponses: [],
      compactCount: 0,
      wasCompacted: false,
      tokensSaved: 0
    });
    console.log(`✅ [WRAPPER] Created session: ${sessionId}`);
  }
  return wrapperState.sessions.get(sessionId);
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
    
    // Detect /compact command starting and generate summary
    if (data.type === 'user' && data.message?.content) {
      const content = typeof data.message.content === 'string' 
        ? data.message.content 
        : (Array.isArray(data.message.content) 
            ? data.message.content.find(c => c.type === 'text')?.text 
            : '');
      if (content?.trim() === '/compact') {
        session.compactInProgress = true;
        console.log(`🗜️ [WRAPPER] Detected /compact command starting`);
        
        // Generate our own summary from conversation history
        const recentMessages = session.history.slice(-20); // Last 20 API messages
        let summary = `✅ Conversation compacted successfully!\n\n`;
        summary += `📊 Compaction Summary:\n`;
        summary += `• Messages compressed: ${session.messageCount}\n`;
        summary += `• Tokens saved: ${session.totalTokens.toLocaleString()}\n`;
        
        // Find the main topics discussed
        const userMessages = recentMessages.filter(m => m.type === 'user');
        if (userMessages.length > 0) {
          summary += `\n📝 Recent context:\n`;
          const topics = userMessages.slice(-3).map(m => {
            const content = m.data?.message?.content;
            let text = '';
            if (typeof content === 'string') {
              text = content;
            } else if (Array.isArray(content)) {
              const textBlock = content.find(c => c.type === 'text');
              text = textBlock?.text || '';
            }
            // Clean up and truncate
            text = text.replace(/\n+/g, ' ').trim();
            if (text.length > 80) {
              text = text.substring(0, 77) + '...';
            }
            return text;
          }).filter(t => t);
          
          topics.forEach((topic, i) => {
            summary += `• ${topic}\n`;
          });
        }
        
        summary += `\n✨ Context reset - you can continue normally.`;
        
        session.compactSummary = summary;
        console.log(`🗜️ [WRAPPER] Generated compact summary: ${summary.substring(0, 100)}...`);
      }
    }
    
    // Update tokens if usage present (but skip during compact operations)
    // During compact, we'll reset tokens instead of accumulating
    const isCompactOperation = session.compactInProgress || session.isCompacting;

    if (data.usage && !isCompactOperation) {
      const input = data.usage.input_tokens || 0;
      const output = data.usage.output_tokens || 0;
      const cacheCreation = data.usage.cache_creation_input_tokens || 0;
      const cacheRead = data.usage.cache_read_input_tokens || 0;

      // Store per-request values (for reference/debugging)
      session.inputTokens = input;
      session.outputTokens = output;
      session.cacheCreationTokens = cacheCreation;
      session.cacheReadTokens = cacheRead;
      session.totalTokens = input + output;

      // ACCUMULATE tokens across all API calls in this session
      // This gives accurate tracking of total context usage over time
      session.accumulatedInputTokens += input;
      session.accumulatedOutputTokens += output;
      session.accumulatedCacheRead += cacheRead;
      session.accumulatedCacheCreation += cacheCreation;

      const prevAccumulated = session.accumulatedTotalTokens;
      session.accumulatedTotalTokens += input + output;

      const delta = input + output;
      wrapperState.stats.totalTokens += delta;

      // Show accumulated context usage
      const percentage = Math.round(session.accumulatedTotalTokens / 2000);
      console.log(`📊 [WRAPPER] TOKENS +${delta} → ${session.accumulatedTotalTokens}/200000 (${percentage}%)`);
      if (cacheCreation > 0 || cacheRead > 0) {
        console.log(`   📦 Cache: creation=${cacheCreation}, read=${cacheRead} (cache_read doesn't count toward 200k limit)`);
      }
    } else if (data.usage && isCompactOperation) {
      // During compact, just log but don't accumulate
      console.log(`🗜️ [WRAPPER] Compact operation tokens (not accumulated):`, data.usage);
    }
    
    // Track if this is during a compact operation
    if (data.type === 'assistant' && session.compactInProgress) {
      // Capture assistant messages during compaction for summary
      if (data.message?.content) {
        let content = '';
        if (typeof data.message.content === 'string') {
          content = data.message.content;
        } else if (Array.isArray(data.message.content)) {
          content = data.message.content
            .filter(c => c.type === 'text')
            .map(c => c.text)
            .join('');
        }
        if (content) {
          session.compactSummary = content;
          console.log(`🗜️ [WRAPPER] Captured compact summary: ${content.substring(0, 100)}...`);
        }
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

      // Reset tokens (both per-request and accumulated)
      session.inputTokens = 0;
      session.outputTokens = 0;
      session.totalTokens = 0;
      session.cacheCreationTokens = 0;
      session.cacheReadTokens = 0;
      session.accumulatedInputTokens = 0;
      session.accumulatedOutputTokens = 0;
      session.accumulatedTotalTokens = 0;
      session.accumulatedCacheRead = 0;
      session.accumulatedCacheCreation = 0;
      
      // Use Claude's summary if we captured it, otherwise use fallback
      if (session.compactSummary) {
        data.result = session.compactSummary;
        delete session.compactSummary; // Clean up
      } else if (!data.result || data.result === '') {
        data.result = `Conversation compacted. Saved ${savedTokens.toLocaleString()} tokens.`;
      }
      
      // Add wrapper metadata
      data.wrapper_compact = {
        savedTokens,
        totalSaved: session.tokensSaved,
        compactCount: session.compactCount
      };
      
      session.compactInProgress = false; // Clear flag
      console.log(`🗜️ [WRAPPER] Compaction complete`);
    }
    
    // Add wrapper data to every message
    data.wrapper = {
      enabled: true,
      tokens: {
        // Accumulated totals (what the user cares about for context usage)
        total: session.accumulatedTotalTokens,
        input: session.accumulatedInputTokens,
        output: session.accumulatedOutputTokens,
        cache_read: session.accumulatedCacheRead || 0,
        cache_creation: session.accumulatedCacheCreation || 0,
        // Per-request values (for debugging/reference)
        lastRequest: {
          input: session.inputTokens,
          output: session.outputTokens,
          total: session.totalTokens
        }
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
const { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } = fs;
const { dirname, join, isAbsolute } = require("path");
const { createServer } = require("http");
const { Server } = require("socket.io");
const { homedir, platform } = require("os");

// __dirname is already defined in CommonJS
let CLAUDE_PATH = 'claude'; // Default to PATH lookup

// Try to find Claude CLI in common locations
const isWindows = platform() === 'win32';

// Claude execution mode settings
let CLAUDE_EXECUTION_MODE = 'auto'; // 'native-windows', 'wsl', or 'auto'
let NATIVE_WINDOWS_CLAUDE_PATH = null;
let WSL_CLAUDE_PATH = null;

// Helper function to load Claude settings from storage
function loadClaudeSettings() {
  try {
    const settingsPath = isWindows 
      ? join(process.env.APPDATA || process.env.USERPROFILE, 'yurucode', 'claude_settings.json')
      : join(homedir(), '.config', 'yurucode', 'claude_settings.json');
    
    if (existsSync(settingsPath)) {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
      console.log('📋 Loaded Claude settings:', settings.settings?.executionMode || 'not set');
      
      if (settings.settings?.executionMode) {
        CLAUDE_EXECUTION_MODE = settings.settings.executionMode;
      }
      if (settings.detection?.nativeWindows?.path) {
        NATIVE_WINDOWS_CLAUDE_PATH = settings.detection.nativeWindows.path;
        console.log('🎯 Native Windows Claude path:', NATIVE_WINDOWS_CLAUDE_PATH);
      }
      if (settings.detection?.wsl?.path) {
        WSL_CLAUDE_PATH = settings.detection.wsl.path;
        console.log('🎯 WSL Claude path:', WSL_CLAUDE_PATH);
      }
    }
  } catch (e) {
    console.log('⚠️ Could not load Claude settings, using defaults:', e.message);
  }
}

// Path translation utilities
function windowsToWslPath(windowsPath) {
  // Convert C:\Users\... to /mnt/c/Users/...
  if (!windowsPath) return windowsPath;
  const normalized = windowsPath.replace(/\\/g, '/');
  const match = normalized.match(/^([A-Z]):(.*)/i);
  if (match) {
    return `/mnt/${match[1].toLowerCase()}${match[2]}`;
  }
  return normalized;
}

function wslToWindowsPath(wslPath) {
  // Convert /mnt/c/Users/... to C:\Users\...
  if (!wslPath) return wslPath;
  const match = wslPath.match(/^\/mnt\/([a-z])(.*)/i);
  if (match) {
    return `${match[1].toUpperCase()}:${match[2].replace(/\//g, '\\')}`;
  }
  return wslPath;
}

// Helper function to create native Windows command for claude
function createNativeWindowsClaudeCommand(args, workingDir, message) {
  let claudePath = NATIVE_WINDOWS_CLAUDE_PATH || 'claude';
  let nodeExe = null;
  let claudeJs = null;
  
  // Check if this is a .cmd file - if so, we need to find Node.js and the actual .js file
  if (claudePath.endsWith('.cmd')) {
    console.log(`📦 Detected .cmd file, looking for Node.js and actual JS file...`);
    
    // Find Node.js executable
    const possibleNodePaths = [
      'C:\\Program Files\\nodejs\\node.exe',
      'C:\\Program Files (x86)\\nodejs\\node.exe',
      process.env.ProgramFiles + '\\nodejs\\node.exe',
      process.env['ProgramFiles(x86)'] + '\\nodejs\\node.exe',
    ].filter(Boolean);
    
    for (const nodePath of possibleNodePaths) {
      if (existsSync(nodePath)) {
        nodeExe = nodePath;
        break;
      }
    }
    
    // Check if Node.js is in the npm directory itself
    if (!nodeExe) {
      const npmDir = require('path').dirname(claudePath);
      const nodeInNpm = require('path').join(npmDir, 'node.exe');
      if (existsSync(nodeInNpm)) {
        nodeExe = nodeInNpm;
        console.log(`✅ Found Node.js in npm directory: ${nodeExe}`);
      }
    }
    
    // Try to find Node.js via PATH (most reliable)
    if (!nodeExe) {
      try {
        const { execSync } = require('child_process');
        const whereNode = execSync('where node', { encoding: 'utf8', windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] }).trim();
        if (whereNode) {
          const paths = whereNode.split('\n').map(p => p.trim()).filter(p => p.endsWith('.exe'));
          if (paths.length > 0) {
            nodeExe = paths[0];
            console.log(`✅ Found Node.js via PATH: ${nodeExe}`);
          }
        }
      } catch (e) {
        // Try PowerShell as fallback
        try {
          const psResult = execSync('powershell -Command "Get-Command node | Select-Object -ExpandProperty Source"', { 
            encoding: 'utf8', 
            windowsHide: true,
            stdio: ['pipe', 'pipe', 'ignore']
          }).trim();
          if (psResult && psResult.endsWith('.exe')) {
            nodeExe = psResult;
            console.log(`✅ Found Node.js via PowerShell: ${nodeExe}`);
          }
        } catch (e2) {
          console.error('⚠️ Could not find Node.js via where or PowerShell');
        }
      }
    }
    
    // Find the actual Claude JS file
    const path = require('path');
    const cmdDir = path.dirname(claudePath);
    console.log(`📂 Looking for Claude JS relative to: ${cmdDir}`);
    
    const possibleJsPaths = [
      // npm global installation paths
      path.join(cmdDir, 'node_modules', '@anthropic-ai', 'claude-cli', 'bin', 'claude.js'),
      path.join(cmdDir, '..', '@anthropic-ai', 'claude-cli', 'bin', 'claude.js'),
      path.join(cmdDir, '..', 'node_modules', '@anthropic-ai', 'claude-cli', 'bin', 'claude.js'),
      // Check in the npm global node_modules
      path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@anthropic-ai', 'claude-cli', 'bin', 'claude.js'),
      // Check relative to the .cmd file
      claudePath.replace('.cmd', '.js'),
      claudePath.replace('claude.cmd', '..\\@anthropic-ai\\claude-cli\\bin\\claude.js'),
      // Additional paths to check
      path.join(cmdDir, 'node_modules', 'claude', 'bin', 'claude.js'),
      path.join(cmdDir, '..', 'lib', 'node_modules', '@anthropic-ai', 'claude-cli', 'bin', 'claude.js'),
    ].filter(Boolean);
    
    console.log(`🔍 Checking ${possibleJsPaths.length} possible paths for Claude JS...`);
    for (const jsPath of possibleJsPaths) {
      const exists = existsSync(jsPath);
      console.log(`  ${exists ? '✅' : '❌'} ${jsPath}`);
      if (exists) {
        claudeJs = jsPath;
        break;
      }
    }
    
    if (nodeExe && claudeJs) {
      console.log(`✅ Using Node.js to run Claude directly:`);
      console.log(`  Node: ${nodeExe}`);
      console.log(`  Claude JS: ${claudeJs}`);
      claudePath = nodeExe;
      args = [claudeJs, ...args];
    } else if (!nodeExe) {
      console.error(`❌ Could not find Node.js executable`);
      console.error(`  Checked standard paths and PATH environment`);
      console.error(`  Please ensure Node.js is installed and in PATH`);
      // Try to fall back to .cmd file with shell
      console.log(`⚠️ Falling back to .cmd file execution with shell`);
    } else if (!claudeJs) {
      console.error(`❌ Could not find Claude JavaScript file`);
      console.error(`  Checked paths relative to: ${cmdDir}`);
      console.error(`  Node.js found at: ${nodeExe}`);
      // Try to fall back to .cmd file with shell
      console.log(`⚠️ Falling back to .cmd file execution with shell`);
    }
  }
  
  console.log(`🖥️ Creating native Windows Claude command`);
  console.log(`  Claude path: ${claudePath}`);
  console.log(`  Working dir: ${workingDir}`);
  console.log(`  Args: ${args.join(' ')}`);
  
  if (message) {
    // For native Windows, we need to write to a temp file for large messages
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    
    const windowsTempFile = path.join(os.tmpdir(), `yurucode-msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.txt`);
    
    try {
      fs.writeFileSync(windowsTempFile, message, 'utf8');
      console.log(`  Temp file: ${windowsTempFile} (${message.length} chars)`);
    } catch (err) {
      console.error(`❌ Failed to write temp file: ${err.message}`);
      throw err;
    }
    
    // Return command, args, input handled flag, and temp file
    return [claudePath, args, true, windowsTempFile];
  } else {
    // Title generation - no input needed
    return [claudePath, args, false, null];
  }
}

// Helper function to choose the appropriate command builder
function getClaudeCommand(args, workingDir, message) {
  // Always load latest settings
  loadClaudeSettings();
  
  // Convert paths based on execution mode
  let effectiveWorkingDir = workingDir;
  
  if (CLAUDE_EXECUTION_MODE === 'native-windows' && NATIVE_WINDOWS_CLAUDE_PATH) {
    // Use native Windows execution
    console.log('🖥️ Using native Windows Claude execution');
    return createNativeWindowsClaudeCommand(args, workingDir, message);
  } else if (CLAUDE_EXECUTION_MODE === 'wsl' || (isWindows && !NATIVE_WINDOWS_CLAUDE_PATH)) {
    // Use WSL execution (also fallback for Windows if no native path)
    console.log('🐧 Using WSL Claude execution');
    effectiveWorkingDir = windowsToWslPath(workingDir);
    return createWslClaudeCommand(args, effectiveWorkingDir, message);
  } else if (CLAUDE_EXECUTION_MODE === 'auto') {
    // Auto mode - prefer native Windows if available
    if (NATIVE_WINDOWS_CLAUDE_PATH) {
      console.log('🤖 Auto mode: Using native Windows Claude');
      return createNativeWindowsClaudeCommand(args, workingDir, message);
    } else if (isWindows) {
      console.log('🤖 Auto mode: Falling back to WSL');
      effectiveWorkingDir = windowsToWslPath(workingDir);
      return createWslClaudeCommand(args, effectiveWorkingDir, message);
    }
  }
  
  // Non-Windows systems - return standard command
  return [CLAUDE_PATH, args, false, null];
}

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
    // Find Claude path - try dynamic detection first, then fallback to known locations
    const { execFileSync } = require('child_process');
    let claudePath = null;
    
    // First get WSL username
    let wslUser = 'yuru'; // default from your system
    try {
      wslUser = execFileSync(wslPath, ['-e', 'bash', '-c', 'whoami'], {
        encoding: 'utf8',
        windowsHide: true
      }).trim();
      console.log(`🔍 WSL user: ${wslUser}`);
    } catch (e) {
      console.log(`⚠️ Could not detect WSL user, using default: ${wslUser}`);
    }
    
    // Try to source .bashrc and get claude alias
    try {
      console.log(`🔎 Finding Claude path by sourcing .bashrc...`);
      const typeCmd = `. /home/${wslUser}/.bashrc 2>/dev/null && type claude 2>/dev/null`;
      const typeOutput = execFileSync(wslPath, ['-e', 'bash', '-c', typeCmd], {
        encoding: 'utf8',
        windowsHide: true
      }).trim();
      
      if (typeOutput) {
        console.log(`🔍 'type claude' output: ${typeOutput}`);
        
        // Parse alias format: claude is aliased to `/home/yuru/.claude/local/claude'
        if (typeOutput.includes('is aliased to')) {
          const match = typeOutput.match(/is aliased to [`']([^`']+)[`']/);
          if (match) {
            claudePath = match[1];
            console.log(`✅ CLAUDE PATH FROM ALIAS: ${claudePath}`);
          }
        }
      }
    } catch (e) {
      console.log(`⚠️ Could not get claude from .bashrc`);
    }
    
    // If not found, check the known location from your system
    if (!claudePath) {
      const knownPath = `/home/${wslUser}/.claude/local/claude`;
      console.log(`🔎 Checking known location: ${knownPath}`);
      try {
        const exists = execFileSync(wslPath, ['-e', 'bash', '-c', `[ -f "${knownPath}" ] && echo "yes"`], {
          encoding: 'utf8',
          windowsHide: true
        }).trim();
        
        if (exists === 'yes') {
          claudePath = knownPath;
          console.log(`✅ CLAUDE FOUND AT: ${claudePath}`);
        }
      } catch (e) {
        // File doesn't exist
      }
    }
    
    // If still not found, check PATH
    if (!claudePath) {
      try {
        claudePath = execFileSync(wslPath, ['-e', 'bash', '-c', 'which claude 2>/dev/null'], {
          encoding: 'utf8',
          windowsHide: true
        }).trim();
        if (claudePath) {
          console.log(`✅ CLAUDE PATH FROM WHICH: ${claudePath}`);
        }
      } catch (e) {
        // Not in PATH
      }
    }
    
    // If Claude path not found, error out clearly
    if (!claudePath) {
      const errorMsg = `Claude CLI not found in WSL. Checked: /home/${wslUser}/.claude/local/claude. Please ensure Claude is installed.`;
      console.error(`❌ ${errorMsg}`);
      throw new Error(errorMsg);
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
    const wslTempFileName = `/tmp/yurucode-msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.txt`;
    
    // For large messages, write to a Windows temp file first to avoid command line limits
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    
    // Create a Windows temp file
    const windowsTempFile = path.join(os.tmpdir(), `yurucode-msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.txt`);
    
    try {
      // Write the message directly to the Windows temp file
      fs.writeFileSync(windowsTempFile, message, 'utf8');
    } catch (err) {
      console.error(`❌ Failed to write temp file: ${err.message}`);
      throw err;
    }
    
    // Convert Windows path to WSL path for the temp file
    const windowsTempDrive = windowsTempFile[0].toLowerCase();
    const windowsTempPath = windowsTempFile.substring(2).replace(/\\/g, '/');
    const wslWindowsTempFile = `/mnt/${windowsTempDrive}${windowsTempPath}`;
    
    // Build the WSL command - copy from Windows temp to WSL temp, pipe to claude, cleanup both files
    // Use trap to ensure cleanup happens even on errors
    const script = `trap 'rm -f "${wslTempFileName}"' EXIT; cd "${wslWorkingDir}" && cat "${wslWindowsTempFile}" > "${wslTempFileName}" && rm -f "${wslWindowsTempFile}" && cat "${wslTempFileName}" | ${claudePath} ${argsStr} 2>&1`;
    
    console.log(`🔍 WSL script (main message):`);
    console.log(`  Working dir: ${wslWorkingDir}`);
    console.log(`  Claude path: ${claudePath}`);
    console.log(`  Args: ${argsStr}`);
    console.log(`  Message length: ${message.length} chars`);
    console.log(`  Windows temp file: ${windowsTempFile}`);
    console.log(`  WSL temp file: ${wslTempFileName}`);
    
    return [wslPath, ['-e', 'bash', '-c', script], true, windowsTempFile];
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
    
    // For title generation, build command with the provided args
    const argsStr = args.map(arg => {
      // Only quote args that contain spaces or special characters
      if (arg.includes(' ') || arg.includes(':') || arg.includes('(') || arg.includes(')') || arg.includes(',')) {
        // Escape single quotes properly for bash
        return `'${arg.replace(/'/g, "'\\''")}'`;
      }
      return arg;
    }).join(' ');
    
    // For title generation with -p flag, no stdin needed
    const script = `cd "${wslWorkingDir}" && ${claudePath} ${argsStr} 2>&1`;
    
    console.log(`🔍 WSL script (title gen) with args: ${argsStr}`);
    return [wslPath, ['-e', 'bash', '-c', script], false];
  }
}

if (isWindows) {
  // Load Claude settings to determine execution mode
  loadClaudeSettings();

  // Auto-detect native Windows Claude if not already set
  if (!NATIVE_WINDOWS_CLAUDE_PATH) {
    console.log('🔍 Auto-detecting native Windows Claude CLI...');

    // Common Windows installation paths for Claude
    const appData = process.env.APPDATA || '';
    const userProfile = process.env.USERPROFILE || '';
    const localAppData = process.env.LOCALAPPDATA || '';

    const possibleNativeWindowsPaths = [
      // npm global installation (most common)
      join(appData, 'npm', 'claude.cmd'),
      join(appData, 'npm', 'claude.exe'),
      // User-specific installations
      join(userProfile, '.claude', 'local', 'claude.exe'),
      join(localAppData, 'Programs', 'claude', 'claude.exe'),
      join(localAppData, 'Claude', 'claude.exe'),
      // Scoop
      join(userProfile, 'scoop', 'apps', 'claude', 'current', 'claude.exe'),
      join(userProfile, 'scoop', 'shims', 'claude.exe'),
      // Chocolatey
      'C:\\ProgramData\\chocolatey\\bin\\claude.exe',
      // Program Files
      'C:\\Program Files\\Claude\\claude.exe',
      'C:\\Program Files (x86)\\Claude\\claude.exe',
    ].filter(Boolean);

    // Check common paths first
    for (const checkPath of possibleNativeWindowsPaths) {
      try {
        if (existsSync(checkPath)) {
          NATIVE_WINDOWS_CLAUDE_PATH = checkPath;
          console.log(`✅ Found native Windows Claude at: ${checkPath}`);
          break;
        }
      } catch (e) {
        // Continue searching
      }
    }

    // If not found in common paths, try 'where claude' command
    if (!NATIVE_WINDOWS_CLAUDE_PATH) {
      try {
        const whereResult = execSync('where claude', {
          encoding: 'utf8',
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'ignore']
        }).trim();
        if (whereResult) {
          const paths = whereResult.split('\n').map(p => p.trim()).filter(p => p);
          for (const foundPath of paths) {
            if (foundPath.endsWith('.exe') || foundPath.endsWith('.cmd')) {
              NATIVE_WINDOWS_CLAUDE_PATH = foundPath;
              console.log(`✅ Found native Windows Claude via 'where': ${foundPath}`);
              break;
            }
          }
        }
      } catch (e) {
        console.log('⚠️ "where claude" command failed or claude not in PATH');
      }
    }

    // If still not found, also check if 'claude' command works directly
    if (!NATIVE_WINDOWS_CLAUDE_PATH) {
      try {
        execSync('claude --version', {
          encoding: 'utf8',
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'ignore'],
          timeout: 5000
        });
        // If we get here, 'claude' is in PATH
        NATIVE_WINDOWS_CLAUDE_PATH = 'claude';
        console.log(`✅ 'claude' command is available in PATH`);
      } catch (e) {
        // Not available
      }
    }
  }

  console.log('════════════════════════════════════════════════════════════════════');
  console.log('🔍 PLATFORM: Windows detected');
  console.log('🔍 CLAUDE EXECUTION MODE:', CLAUDE_EXECUTION_MODE);
  if (NATIVE_WINDOWS_CLAUDE_PATH) {
    console.log('✅ Native Windows Claude available:', NATIVE_WINDOWS_CLAUDE_PATH);
  }
  if (WSL_CLAUDE_PATH) {
    console.log('✅ WSL Claude available:', WSL_CLAUDE_PATH);
  }
  console.log('════════════════════════════════════════════════════════════════════');

  // Set marker based on mode - PREFER native Windows if available
  if (NATIVE_WINDOWS_CLAUDE_PATH && (CLAUDE_EXECUTION_MODE === 'native-windows' || CLAUDE_EXECUTION_MODE === 'auto')) {
    CLAUDE_PATH = 'NATIVE_WINDOWS_CLAUDE';
    console.log('🎯 Using native Windows Claude CLI');
  } else if (NATIVE_WINDOWS_CLAUDE_PATH && !WSL_CLAUDE_PATH) {
    // If only native Windows is available, use it regardless of mode
    CLAUDE_PATH = 'NATIVE_WINDOWS_CLAUDE';
    console.log('🎯 Using native Windows Claude CLI (only option available)');
  } else {
    CLAUDE_PATH = 'WSL_CLAUDE'; // Fall back to WSL
    console.log('🎯 Using WSL Claude CLI');
  }

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
  pingTimeout: 1200000, // 20 minutes - support long-running operations
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
let activeBashProcesses = new Map();  // Map of sessionId -> bash process
let lastAssistantMessageIds = new Map();  // Map of sessionId -> lastAssistantMessageId
let allAssistantMessageIds = new Map();  // Map of sessionId -> Array of all assistant message IDs
let streamHealthChecks = new Map(); // Map of sessionId -> interval
let streamTimeouts = new Map(); // Map of sessionId -> timeout
let stoppedSessions = new Map(); // Map of sessionId -> boolean - tracks sessions that should stop processing buffered data
let killedProcessPIDs = new Set(); // Set of PIDs that were killed due to resume failure - ignore their buffered data

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

    // CRITICAL FIX: On Windows native mode, override SHELL to use PowerShell
    // This prevents Claude CLI's Bash tool from using /usr/bin/bash (from Git Bash/WSL)
    if (isWindows && CLAUDE_EXECUTION_MODE === 'native-windows' && NATIVE_WINDOWS_CLAUDE_PATH) {
      // Set SHELL to PowerShell for Windows native mode
      enhancedEnv.SHELL = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
      enhancedEnv.COMSPEC = process.env.COMSPEC || 'C:\\Windows\\System32\\cmd.exe';

      // Add Node.js to PATH using Windows path separator (;)
      const nodePaths = [
        'C:\\Program Files\\nodejs',
        'C:\\Program Files (x86)\\nodejs',
        process.env.ProgramFiles && `${process.env.ProgramFiles}\\nodejs`,
      ].filter(Boolean);

      for (const nodePath of nodePaths) {
        if (existsSync(nodePath) && !enhancedEnv.PATH?.includes(nodePath)) {
          enhancedEnv.PATH = `${nodePath};${enhancedEnv.PATH || ''}`;
          break;
        }
      }
    } else if (!isWindows) {
      // Unix systems - add homebrew path if needed
      const nodeBinDir = '/opt/homebrew/bin';
      if (!enhancedEnv.PATH?.includes(nodeBinDir)) {
        enhancedEnv.PATH = `${nodeBinDir}:${enhancedEnv.PATH || '/usr/bin:/bin'}`;
      }
    }

    // Use a dedicated yurucode-title-gen directory for title generation
    // This keeps title generation sessions separate from main project sessions
    const titleGenDir = join(homedir(), '.yurucode-title-gen');
    
    // Create the directory if it doesn't exist
    try {
      if (!existsSync(titleGenDir)) {
        const { mkdirSync } = require('fs');
        mkdirSync(titleGenDir, { recursive: true });
        console.log('📁 Created title generation directory:', titleGenDir);
      }
    } catch (e) {
      console.log('⚠️ Could not create title gen directory, using home:', e.message);
    }
    
    const child = isWindows ? 
      (() => {
        // Use getClaudeCommand to determine the right execution mode
        const [command, commandArgs, inputHandled, tempFile] = getClaudeCommand(titleArgs, titleGenDir, null);
        
        if (command === 'C:\\Windows\\System32\\wsl.exe') {
          // WSL mode - need to handle WSL-specific directory
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
          
          const wslTitleGenDir = `/home/${wslUser}/.yurucode-title-gen`;
          try {
            execSync(`C:\\Windows\\System32\\wsl.exe -e bash -c "mkdir -p ${wslTitleGenDir}"`, {
              windowsHide: true
            });
          } catch (e) {
            console.log('⚠️ Could not create WSL title gen directory:', e.message);
          }
        }
        
        const spawnOpts = {
          cwd: titleGenDir,
          env: enhancedEnv,
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
          detached: false
        };
        
        // For .cmd files on Windows, we need shell: true
        // BUT not if we're running Node.js directly
        if ((command.endsWith('.cmd') || command.endsWith('.bat')) && !command.endsWith('node.exe')) {
          spawnOpts.shell = true;
          
          // Add Node.js to PATH for .cmd execution
          const nodePaths = [
            'C:\\Program Files\\nodejs',
            'C:\\Program Files (x86)\\nodejs',
            process.env.ProgramFiles + '\\nodejs',
          ].filter(Boolean);
          
          for (const nodePath of nodePaths) {
            if (existsSync(nodePath)) {
              spawnOpts.env = { ...spawnOpts.env };
              spawnOpts.env.PATH = nodePath + ';' + (spawnOpts.env.PATH || process.env.PATH);
              console.log(`✅ Added Node.js to PATH for .cmd execution: ${nodePath}`);
              break;
            }
          }
        }
        
        return spawn(command, commandArgs, spawnOpts);
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
    console.log('  - Execution mode:', CLAUDE_EXECUTION_MODE);

    if (isWindows && CLAUDE_EXECUTION_MODE !== 'native-windows') {
      // Load from WSL (WSL mode)
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
          title
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
            
            // Filter out empty user messages (these are often just placeholders after tool use)
            if (data.role === 'user') {
              // Check if content is missing, undefined, or empty
              if (!data.content) {
                continue; // Skip user messages without content
              }
              
              const contentStr = typeof data.content === 'string' ? data.content : 
                               Array.isArray(data.content) && data.content.length > 0 ? 
                               data.content.map(c => c.text || '').join('') : '';
              if (!contentStr.trim()) {
                continue; // Skip empty user messages
              }
            }
            
            messages.push(data);
          } catch (err) {
            // Skip invalid lines
          }
        }
        
        // Extract title from messages
        let title = null;
        
        // Check for title in last message
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
        
        const actualPath = projectPath
          .replace(/^([A-Z])--/, '$1:/')
          .replace(/^-/, '/')
          .replace(/-/g, '/');
        
        res.json({ 
          sessionId,
          projectPath: actualPath,
          messages,
          sessionCount: messages.length,
          title
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

// Analytics endpoint - reads all Claude sessions and extracts token usage
app.get('/claude-analytics', async (req, res) => {
  console.log('📊 Loading analytics from all Claude sessions...');
  
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
      byModel: {
        opus: { sessions: 0, tokens: 0, cost: 0 },
        sonnet: { sessions: 0, tokens: 0, cost: 0 }
      },
      byDate: {},
      byProject: {}
    };
    
    // Determine the Claude projects directory based on platform
    let projectsDir;
    if (isWindows) {
      // Directly access WSL filesystem through Windows mount - no wsl.exe commands
      const { readdir, readFile, stat } = await import('fs/promises');
      const path = await import('path');

      let wslProjectsPath = null;

      // Only try WSL paths if not in native-windows mode
      if (CLAUDE_EXECUTION_MODE !== 'native-windows') {
        // Try different WSL mount paths and users
        const possibleUsers = ['yuru', 'muuko', process.env.USER, process.env.USERNAME].filter(Boolean);
        const possibleDistros = ['Ubuntu', 'Ubuntu-20.04', 'Ubuntu-22.04', 'Ubuntu-24.04'];
        const possiblePrefixes = ['\\\\wsl$', '\\\\wsl.localhost'];

        console.log('📊 Analytics: Searching for WSL Claude projects...');
        console.log('  Possible users:', possibleUsers);
        console.log('  Possible distros:', possibleDistros);

        let attemptCount = 0;

        for (const prefix of possiblePrefixes) {
          for (const distro of possibleDistros) {
            for (const user of possibleUsers) {
              const testPath = `${prefix}\\${distro}\\home\\${user}\\.claude\\projects`;
              attemptCount++;
              try {
                await stat(testPath);
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
      } else {
        console.log('📊 Analytics: Native Windows mode - skipping WSL, using Windows projects');
      }

      if (wslProjectsPath) {
        try {
          const projectDirs = await readdir(wslProjectsPath);
          console.log(`Found ${projectDirs.length} projects in WSL directory`);
          
          // Process projects (limit to prevent memory issues)
          const maxProjects = 10;
          for (const projectName of projectDirs.slice(0, maxProjects)) {
            const projectPath = path.win32.join(wslProjectsPath, projectName);
            
            try {
              const stats = await stat(projectPath);
              if (!stats.isDirectory()) continue;
              
              console.log(`Processing WSL project: ${projectName}`);
              
              // Get session files
              const sessionFiles = await readdir(projectPath);
              const jsonlFiles = sessionFiles.filter(f => f.endsWith('.jsonl'));
              console.log(`  Found ${jsonlFiles.length} session files`);
              
              // Process sessions (limit to prevent memory issues)
              const maxSessions = 20;
              for (const sessionFile of jsonlFiles.slice(0, maxSessions)) {
                try {
                  const sessionPath = path.win32.join(projectPath, sessionFile);
                  const fileStats = await stat(sessionPath);
                  
                  // Skip very large files
                  if (fileStats.size > 10 * 1024 * 1024) {
                    console.log(`  Skipping large file: ${sessionFile} (${fileStats.size} bytes)`);
                    continue;
                  }
                  
                  console.log(`  Reading session: ${sessionFile} (${fileStats.size} bytes)`);
                  const content = await readFile(sessionPath, 'utf8');
                  
                  // Parse lines to extract analytics from Claude CLI format
                  const allLines = content.split('\n').filter(line => line.trim());
                  console.log(`    Total lines in file: ${allLines.length}`);
                  
                  let sessionTokens = 0;
                  let sessionCost = 0;
                  let sessionModel = 'sonnet';
                  let sessionDate = new Date().toISOString().split('T')[0];
                  let messageCount = 0;
                  
                  for (const line of allLines) {
                    try {
                      const data = JSON.parse(line);
                      
                      // Claude CLI outputs token usage in assistant messages
                      if (data.type === 'assistant' && data.message && data.message.usage) {
                        const usage = data.message.usage;

                        // FIX: Count only NEW tokens - cache reads don't count towards limit
                        const inputTokens = usage.input_tokens || 0;
                        const outputTokens = usage.output_tokens || 0;
                        const cacheCreationTokens = usage.cache_creation_input_tokens || 0;
                        const cacheReadTokens = usage.cache_read_input_tokens || 0; // tracked but not counted
                        sessionTokens += inputTokens + outputTokens + cacheCreationTokens; // Removed cacheReadTokens
                        
                        // Detect model from message
                        if (data.message && data.message.model) {
                          sessionModel = data.message.model.toLowerCase().includes('opus') ? 'opus' : 'sonnet';
                        }
                        
                        // Calculate cost based on model
                        // Claude 4 Opus: $15/million input, $75/million output
                        // Claude 4 Sonnet: $3/million input, $15/million output
                        // Cache write: Opus $18.75/million, Sonnet $3.75/million
                        // Cache read: Opus $1.50/million, Sonnet $0.30/million
                        const isOpus = sessionModel === 'opus';
                        const inputRate = isOpus ? 15.0 / 1_000_000 : 3.0 / 1_000_000;
                        const outputRate = isOpus ? 75.0 / 1_000_000 : 15.0 / 1_000_000;
                        const cacheWriteRate = isOpus ? 18.75 / 1_000_000 : 3.75 / 1_000_000;
                        const cacheReadRate = isOpus ? 1.50 / 1_000_000 : 0.30 / 1_000_000;
                        
                        sessionCost += inputTokens * inputRate + 
                                     outputTokens * outputRate + 
                                     cacheCreationTokens * cacheWriteRate + 
                                     cacheReadTokens * cacheReadRate;
                        
                        // Track individual token types for breakdown
                        analytics.tokenBreakdown.input += inputTokens;
                        analytics.tokenBreakdown.output += outputTokens;
                        analytics.tokenBreakdown.cacheCreation += cacheCreationTokens;
                        analytics.tokenBreakdown.cacheRead += cacheReadTokens;
                      }
                      
                      // Count all message types
                      if (data.type === 'user' || data.type === 'assistant') {
                        messageCount++;
                      }
                      
                      // Get timestamp from any message
                      if (data.timestamp) {
                        sessionDate = new Date(data.timestamp).toISOString().split('T')[0];
                      }
                    } catch (e) {
                      // Skip invalid JSON
                    }
                  }
                  
                  console.log(`    Parsed: ${messageCount} messages, ${sessionTokens} tokens`);
                  
                  // Update analytics if session has data
                  if (sessionTokens > 0) {
                    console.log(`    Session: ${sessionTokens} tokens, $${sessionCost.toFixed(4)}`);
                    
                    analytics.totalSessions++;
                    analytics.totalMessages += messageCount * 2; // Each result ~= 2 messages (user + assistant)
                    analytics.totalTokens += sessionTokens;
                    analytics.totalCost += sessionCost;
                    
                    // Update model breakdown
                    const modelKey = sessionModel === 'opus' ? 'opus' : 'sonnet';
                    analytics.byModel[modelKey].sessions++;
                    analytics.byModel[modelKey].tokens += sessionTokens;
                    analytics.byModel[modelKey].cost += sessionCost;
                    
                    // Update date breakdown
                    if (!analytics.byDate[sessionDate]) {
                      analytics.byDate[sessionDate] = { sessions: 0, messages: 0, tokens: 0, cost: 0 };
                    }
                    analytics.byDate[sessionDate].sessions++;
                    analytics.byDate[sessionDate].messages += messageCount * 2;
                    analytics.byDate[sessionDate].tokens += sessionTokens;
                    analytics.byDate[sessionDate].cost += sessionCost;
                    
                    // Update project breakdown (clean project name)
                    const cleanProjectName = projectName.replace(/-/g, '/');
                    if (!analytics.byProject[cleanProjectName]) {
                      analytics.byProject[cleanProjectName] = { 
                        sessions: 0, 
                        messages: 0, 
                        tokens: 0, 
                        cost: 0, 
                        lastUsed: fileStats.mtime.getTime() 
                      };
                    }
                    analytics.byProject[cleanProjectName].sessions++;
                    analytics.byProject[cleanProjectName].messages += messageCount * 2;
                    analytics.byProject[cleanProjectName].tokens += sessionTokens;
                    analytics.byProject[cleanProjectName].cost += sessionCost;
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
          const projectDirs = await readdir(windowsProjectsPath);
          console.log(`Found ${projectDirs.length} projects in Windows directory`);
          
          // Process limited number of projects
          for (const projectName of projectDirs.slice(0, 5)) {
            const projectPath = path.win32.join(windowsProjectsPath, projectName);
            const stats = await stat(projectPath);
            
            if (!stats.isDirectory()) continue;
            
            console.log(`Processing Windows project: ${projectName}`);
            
            // Get session files
            const sessionFiles = await readdir(projectPath);
            const jsonlFiles = sessionFiles.filter(f => f.endsWith('.jsonl'));
            console.log(`  Found ${jsonlFiles.length} session files`);
            
            // Process limited number of sessions
            for (const sessionFile of jsonlFiles.slice(0, 10)) {
              try {
                const sessionPath = path.win32.join(projectPath, sessionFile);
                const fileStats = await stat(sessionPath);
                
                // Skip very large files
                if (fileStats.size > 10 * 1024 * 1024) {
                  console.log(`  Skipping large file: ${sessionFile} (${fileStats.size} bytes)`);
                  continue;
                }
                
                console.log(`  Reading session: ${sessionFile} (${fileStats.size} bytes)`);
                const content = await readFile(sessionPath, 'utf8');
                
                // Parse lines to extract analytics from Claude CLI format
                const allLines = content.split('\n').filter(line => line.trim());
                console.log(`    Total lines in file: ${allLines.length}`);
                
                let sessionTokens = 0;
                let sessionCost = 0;
                let sessionModel = 'sonnet';
                let sessionDate = new Date().toISOString().split('T')[0];
                let messageCount = 0;
                
                for (const line of allLines) {
                  try {
                    const data = JSON.parse(line);
                    
                    // Claude CLI outputs token usage in 'result' messages
                    if (data.type === 'assistant' && data.message && data.message.usage) {
                      const usage = data.message.usage;

                      // FIX: Count only NEW tokens - cache reads don't count towards limit
                      const inputTokens = usage.input_tokens || 0;
                      const outputTokens = usage.output_tokens || 0;
                      const cacheCreationTokens = usage.cache_creation_input_tokens || 0;
                      const cacheReadTokens = usage.cache_read_input_tokens || 0; // tracked but not counted
                      sessionTokens += inputTokens + outputTokens + cacheCreationTokens; // Removed cacheReadTokens
                      
                      // Detect model from message
                      if (data.message && data.message.model) {
                        sessionModel = data.message.model.toLowerCase().includes('opus') ? 'opus' : 'sonnet';
                      }
                      
                      // Calculate cost based on model
                      // Claude 4 pricing per million tokens
                      const isOpus = sessionModel === 'opus';
                      const inputRate = isOpus ? 15.0 / 1_000_000 : 3.0 / 1_000_000;
                      const outputRate = isOpus ? 75.0 / 1_000_000 : 15.0 / 1_000_000;
                      const cacheWriteRate = isOpus ? 18.75 / 1_000_000 : 3.75 / 1_000_000;
                      const cacheReadRate = isOpus ? 1.50 / 1_000_000 : 0.30 / 1_000_000;
                      
                      sessionCost += inputTokens * inputRate + 
                                   outputTokens * outputRate + 
                                   cacheCreationTokens * cacheWriteRate + 
                                   cacheReadTokens * cacheReadRate;
                      
                      // Track individual token types for breakdown
                      analytics.tokenBreakdown.input += inputTokens;
                      analytics.tokenBreakdown.output += outputTokens;
                      analytics.tokenBreakdown.cacheCreation += cacheCreationTokens;
                      analytics.tokenBreakdown.cacheRead += cacheReadTokens;
                    }
                    
                    // Count all message types
                    if (data.type === 'user' || data.type === 'assistant') {
                      messageCount++;
                    }
                    
                    // Get timestamp from any message
                    if (data.timestamp) {
                      sessionDate = new Date(data.timestamp).toISOString().split('T')[0];
                    }
                  } catch (e) {
                    // Skip invalid JSON
                  }
                }
                
                console.log(`    Parsed: ${messageCount} messages, ${sessionTokens} tokens`);
                
                // Update analytics
                if (sessionTokens > 0) {
                  console.log(`    Session: ${sessionTokens} tokens, $${sessionCost.toFixed(4)}`);
                  
                  analytics.totalSessions++;
                  analytics.totalMessages += messageCount * 2;
                  analytics.totalTokens += sessionTokens;
                  analytics.totalCost += sessionCost;
                  
                  // Update model breakdown
                  const modelKey = sessionModel === 'opus' ? 'opus' : 'sonnet';
                  analytics.byModel[modelKey].sessions++;
                  analytics.byModel[modelKey].tokens += sessionTokens;
                  analytics.byModel[modelKey].cost += sessionCost;
                  
                  // Update date breakdown
                  if (!analytics.byDate[sessionDate]) {
                    analytics.byDate[sessionDate] = { sessions: 0, messages: 0, tokens: 0, cost: 0 };
                  }
                  analytics.byDate[sessionDate].sessions++;
                  analytics.byDate[sessionDate].messages += messageCount * 2;
                  analytics.byDate[sessionDate].tokens += sessionTokens;
                  analytics.byDate[sessionDate].cost += sessionCost;
                  
                  // Update project breakdown
                  const cleanProjectName = projectName.replace(/-/g, '/');
                  if (!analytics.byProject[cleanProjectName]) {
                    analytics.byProject[cleanProjectName] = { 
                      sessions: 0, 
                      messages: 0, 
                      tokens: 0, 
                      cost: 0, 
                      lastUsed: fileStats.mtime.getTime() 
                    };
                  }
                  analytics.byProject[cleanProjectName].sessions++;
                  analytics.byProject[cleanProjectName].messages += messageCount * 2;
                  analytics.byProject[cleanProjectName].tokens += sessionTokens;
                  analytics.byProject[cleanProjectName].cost += sessionCost;
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
                  
                  // Claude CLI outputs token usage in 'result' messages
                  if (data.type === 'assistant' && data.message && data.message.usage) {
                    const usage = data.message.usage;

                    // FIX: Count only NEW tokens - cache reads don't count towards limit
                    const inputTokens = usage.input_tokens || 0;
                    const outputTokens = usage.output_tokens || 0;
                    const cacheCreationTokens = usage.cache_creation_input_tokens || 0;
                    const cacheReadTokens = usage.cache_read_input_tokens || 0; // tracked but not counted
                    sessionTokens += inputTokens + outputTokens + cacheCreationTokens; // Removed cacheReadTokens
                    
                    // Detect model from message
                    if (data.message && data.message.model) {
                      sessionModel = data.message.model.toLowerCase().includes('opus') ? 'opus' : 'sonnet';
                    }
                    
                    // Calculate cost based on model
                    // Claude 4 pricing per million tokens
                    const isOpus = sessionModel === 'opus';
                    const inputRate = isOpus ? 15.0 / 1_000_000 : 3.0 / 1_000_000;
                    const outputRate = isOpus ? 75.0 / 1_000_000 : 15.0 / 1_000_000;
                    const cacheWriteRate = isOpus ? 18.75 / 1_000_000 : 3.75 / 1_000_000;
                    const cacheReadRate = isOpus ? 1.50 / 1_000_000 : 0.30 / 1_000_000;
                    
                    sessionCost += inputTokens * inputRate + 
                                 outputTokens * outputRate + 
                                 cacheCreationTokens * cacheWriteRate + 
                                 cacheReadTokens * cacheReadRate;
                    
                    // Track individual token types for breakdown
                    analytics.tokenBreakdown.input += inputTokens;
                    analytics.tokenBreakdown.output += outputTokens;
                    analytics.tokenBreakdown.cacheCreation += cacheCreationTokens;
                    analytics.tokenBreakdown.cacheRead += cacheReadTokens;
                  }
                  
                  // Count all message types
                  if (data.type === 'user' || data.type === 'assistant') {
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
                
                // Update date breakdown
                if (!analytics.byDate[sessionDate]) {
                  analytics.byDate[sessionDate] = { sessions: 0, messages: 0, tokens: 0, cost: 0 };
                }
                analytics.byDate[sessionDate].sessions++;
                analytics.byDate[sessionDate].messages += lines.length * 2;
                analytics.byDate[sessionDate].tokens += sessionTokens;
                analytics.byDate[sessionDate].cost += sessionCost;
                
                // Update project breakdown
                if (!analytics.byProject[projectName]) {
                  analytics.byProject[projectName] = { sessions: 0, messages: 0, tokens: 0, cost: 0, lastUsed: Date.now() };
                }
                analytics.byProject[projectName].sessions++;
                analytics.byProject[projectName].messages += messageCount;
                analytics.byProject[projectName].tokens += sessionTokens;
                analytics.byProject[projectName].cost += sessionCost;
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
    
    console.log(`📊 Analytics loaded: ${analytics.totalSessions} sessions, ${analytics.totalTokens} tokens`);
    res.json(analytics);
  } catch (error) {
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
    // On Windows, check execution mode to determine which projects to load
    if (isWindows && CLAUDE_EXECUTION_MODE !== 'native-windows') {
      console.log('🔍 Windows detected with WSL mode - loading projects from WSL');
      
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
                lowerName.includes('yurucode-server') ||
                lowerName.includes('yurucode-title-gen') ||
                lowerName === '-yurucode-title-gen' ||
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

    if (isWindows && CLAUDE_EXECUTION_MODE === 'native-windows') {
      console.log('🪟 Native Windows mode - loading projects from:', claudeDir);
    } else {
      console.log('Quick loading project list from:', claudeDir);
    }
    
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
          
          // On Windows WSL mode, if sessionCount is 0, sessions might be in WSL
          // Return null to indicate unknown count rather than wrong count
          // In native-windows mode, trust the local count
          const effectiveSessionCount = (isWindows && CLAUDE_EXECUTION_MODE !== 'native-windows' && sessionCount === 0) ? null : sessionCount;
          
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
    
    if (isWindows && CLAUDE_EXECUTION_MODE !== 'native-windows') {
      // Load from WSL where Claude stores projects (WSL mode)
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
      console.log('🔍 WSL mode - loading sessions from:', projectPath);
      
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
      // macOS/Linux/native-Windows implementation - read from ~/.claude/projects
      const projectPath = path.join(os.homedir(), '.claude', 'projects', projectName);
      if (isWindows && CLAUDE_EXECUTION_MODE === 'native-windows') {
        console.log('🪟 Native Windows mode - loading sessions from:', projectPath);
      }
      
      try {
        // Check if project directory exists
        if (!fs.existsSync(projectPath)) {
          console.log('Project directory not found:', projectPath);
          res.write('data: {"done": true, "sessions": []}\n\n');
          res.end();
          return;
        }
        
        // Get all .jsonl files
        const files = fs.readdirSync(projectPath)
          .filter(f => f.endsWith('.jsonl'))
          .map(f => {
            const fullPath = path.join(projectPath, f);
            const stats = fs.statSync(fullPath);
            return {
              filename: f,
              fullPath: fullPath,
              timestamp: stats.mtimeMs
            };
          })
          .sort((a, b) => b.timestamp - a.timestamp);
        
        console.log(`Found ${files.length} sessions in project`);
        
        if (files.length === 0) {
          res.write('data: {"done": true, "sessions": []}\n\n');
          res.end();
          return;
        }
        
        // Process each file and stream it
        for (let i = 0; i < Math.min(files.length, 50); i++) {
          const { filename, fullPath, timestamp } = files[i];
          try {
            // Read first line of the file
            const firstLine = fs.readFileSync(fullPath, 'utf8').split('\n')[0];
            if (!firstLine) continue;
            
            const metadata = JSON.parse(firstLine);
            const sessionId = metadata.uuid || filename.replace('.jsonl', '');
            
            const session = {
              id: sessionId,
              name: metadata.project_path || 'Untitled',
              createdAt: new Date(timestamp).toISOString(),
              messageCount: 0,
              projectName: projectName
            };
            
            // Try to count messages (lines in file)
            try {
              const content = fs.readFileSync(fullPath, 'utf8');
              session.messageCount = content.split('\n').filter(line => line.trim()).length;
            } catch (e) {
              // Ignore errors counting messages
            }
            
            // Stream this session
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
    }
  } catch (error) {
    console.error('Error loading project sessions:', error);
    res.write('data: {"error": true, "message": "Failed to load sessions"}\n\n');
    res.end();
  }
});

// Get last modified date for a specific project
app.get('/claude-project-date/:projectName', async (req, res) => {
  try {
    const projectName = decodeURIComponent(req.params.projectName);
    console.log(`📅 Getting date for project: ${projectName}`);

    if (isWindows && CLAUDE_EXECUTION_MODE !== 'native-windows') {
      // Get WSL user (WSL mode)
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
      // macOS/Linux implementation
      const projectPath = path.join(os.homedir(), '.claude', 'projects', projectName);
      let lastModified = Date.now();
      
      try {
        if (fs.existsSync(projectPath)) {
          const stats = fs.statSync(projectPath);
          lastModified = stats.mtimeMs;
        }
      } catch (e) {
        console.log(`  ⚠️ ${projectName}: Error getting date, using current time`);
      }
      
      res.json({ projectName, lastModified });
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

    if (isWindows && CLAUDE_EXECUTION_MODE !== 'native-windows') {
      // Load from WSL (WSL mode)
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
      // Non-Windows (macOS/Linux) implementation
      const projectsDir = path.join(os.homedir(), '.claude', 'projects');
      const projectPath = path.join(projectsDir, projectName);
      
      try {
        // Count .jsonl files in the project directory
        const files = await fs.promises.readdir(projectPath);
        const sessionFiles = files.filter(f => f.endsWith('.jsonl'));
        const sessionCount = sessionFiles.length;
        
        console.log(`[Session Count] Project: ${projectName}, Count: ${sessionCount}`);
        res.json({ projectName, sessionCount });
      } catch (error) {
        console.error(`[Session Count] Error counting sessions for ${projectName}:`, error);
        res.json({ projectName, sessionCount: 0 });
      }
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to get session count' });
  }
});

// Projects endpoint - loads claude projects asynchronously with enhanced error handling
app.get('/claude-projects', async (req, res) => {
  try {
    // On Windows, check execution mode - only load from WSL if NOT in native-windows mode
    if (isWindows && CLAUDE_EXECUTION_MODE !== 'native-windows') {
      console.log('🚨 WINDOWS DETECTED (WSL mode) - LOADING FROM WSL ONLY!');
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
                lowerName.includes('yurucode-server') ||
                lowerName.includes('yurucode-title-gen') ||
                lowerName === '-yurucode-title-gen' ||
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

    if (isWindows && CLAUDE_EXECUTION_MODE === 'native-windows') {
      console.log('🪟 Native Windows mode - loading projects from:', claudeDir);
    } else {
      console.log('Loading projects from:', claudeDir);
    }
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
  
  // Track first bash command to restore focus on Windows
  let isFirstBashCommand = true;
  const bashToolUseIds = new Map(); // Maps tool_use_id to tool info for focus restoration

  // Handle Claude settings updates from frontend
  socket.on('claude-settings-update', (data) => {
    console.log('🔄 Received Claude settings update:', data.settings?.executionMode);
    if (data.settings) {
      CLAUDE_EXECUTION_MODE = data.settings.executionMode || 'auto';
      if (data.detection?.nativeWindows?.path) {
        NATIVE_WINDOWS_CLAUDE_PATH = data.detection.nativeWindows.path;
      }
      if (data.detection?.wsl?.path) {
        WSL_CLAUDE_PATH = data.detection.wsl.path;
      }
      console.log('✅ Claude settings updated successfully');
    }
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
      } else {
        // Creating a brand new session
        sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        console.log(`✨ Creating new session: ${sessionId}`);
      }
      
      // Validate working directory - NEVER use temp directories
      let workingDirectory = data.workingDirectory;
      
      // Convert WSL paths to Windows paths when using native Windows mode
      if (workingDirectory && isWindows && CLAUDE_EXECUTION_MODE === 'native-windows' && NATIVE_WINDOWS_CLAUDE_PATH) {
        const originalPath = workingDirectory;
        workingDirectory = wslToWindowsPath(workingDirectory);
        if (originalPath !== workingDirectory) {
          console.log(`🔄 [Session Creation] Converted WSL path to Windows path: ${originalPath} → ${workingDirectory}`);
        }
      }
      
      // Check if this is a temp directory
      if (workingDirectory) {
        const lowerPath = workingDirectory.toLowerCase();
        if (lowerPath.includes('\\temp\\') || 
            lowerPath.includes('/temp/') ||
            lowerPath.includes('\\tmp\\') ||
            lowerPath.includes('/tmp/') ||
            lowerPath.includes('appdata\\local\\temp') ||
            lowerPath.includes('yurucode-server')) {
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
        claudeSessionId: existingClaudeSessionId,  // Preserve Claude session ID
        interruptedSessionId: null,  // Store interrupted session ID separately
        hasGeneratedTitle: existingMessages.length > 0,  // If we have messages, we likely have a title
        wasInterrupted: false,  // Track if last conversation was interrupted vs completed
        wasCompacted: existingSession?.wasCompacted || false  // Preserve compacted state
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
    console.log('📨 [sendMessage] Processing message in EMBEDDED SERVER');
    const { sessionId, content: message, autoGenerateTitle, systemPromptSettings } = data;
    let { model } = data; // Use let for model so we can reassign it for /compact
    const session = sessions.get(sessionId);
    
    if (!session) {
      console.error(`❌ Session not found: ${sessionId}`);
      if (callback) callback({ success: false, error: 'Session not found' });
      return;
    }
    
    // Check if this is the /test command
    if (message && message.trim() === '/test') {
      console.log(`🧪 [TEST] Test command received`);
      
      // Emit user message
      socket.emit(`message:${sessionId}`, {
        type: 'user',
        message: { content: message },
        timestamp: Date.now()
      });
      
      // Send test response
      const testMessageId = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      socket.emit(`message:${sessionId}`, {
        id: testMessageId,
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: '✅ test command works!\n\nyurucode is running properly.' }
          ]
        },
        streaming: false,
        timestamp: Date.now()
      });
      
      // Also emit to Claude session if different
      if (session.claudeSessionId && session.claudeSessionId !== sessionId) {
        socket.emit(`message:${session.claudeSessionId}`, {
          id: testMessageId,
          type: 'assistant',
          message: {
            content: [
              { type: 'text', text: '✅ test command works!\n\nyurucode is running properly.' }
            ]
          },
          streaming: false,
          timestamp: Date.now()
        });
      }
      
      if (callback) callback({ success: true });
      return;
    }
    
    // Check if this is a bash command (starts with $)
    if (message && message.startsWith('$')) {
      console.log(`🐚 [BASH] Detected bash command: ${message}`);
      let bashCommand = message.substring(1).trim(); // Remove the $ prefix
      console.log(`🐚 [BASH] Extracted command: ${bashCommand}`);
      
      // Use spawn with proper configuration to hide windows
      const { spawn } = require('child_process');
      
      // Generate message ID outside try block so it's accessible to event handlers
      const bashMessageId = `bash-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      try {
        // Emit user message first
        socket.emit(`message:${sessionId}`, {
          type: 'user',
          message: { content: message },
          timestamp: Date.now()
        });
        
        // Send initial placeholder for bash command (NO STREAMING)
        socket.emit(`message:${sessionId}`, {
          id: bashMessageId,
          type: 'assistant',
          message: { content: '' },
          streaming: false,  // Don't show thinking for bash commands,
          timestamp: Date.now()
        });
        
        // Also emit to Claude session if different
        if (session.claudeSessionId && session.claudeSessionId !== sessionId) {
          socket.emit(`message:${session.claudeSessionId}`, {
            id: bashMessageId,
            type: 'assistant',
            message: { content: '' },
            streaming: false,  // Don't show thinking for bash commands,
            timestamp: Date.now()
          });
        }
        
        console.log(`🐚 [BASH] Started streaming with message ID: ${bashMessageId}`);
        
        // Execute the command
        const workingDir = session.workingDirectory || require('os').homedir();
        console.log(`🐚 [BASH] Working directory: ${workingDir}`);
        
        // Check if we're on Windows
        if (process.platform === 'win32') {
          let bashProcess;

          // Store bash process for interrupt handling
          activeBashProcesses.set(sessionId, null);

          // Always use PowerShell on Windows (not cmd.exe)
          const useCmdExe = false;

          if (useCmdExe) {
            // Use cmd.exe for Windows native commands
            console.log(`🐚 [CMD] Running Windows command: ${bashCommand}`);
            console.log(`🐚 [CMD] Working directory: ${workingDir}`);

            // Use /C with the command directly - no extra quotes needed for simple commands
            // Node.js spawn handles argument passing correctly
            bashProcess = spawn('cmd.exe', ['/C', bashCommand], {
              cwd: workingDir,        // Use Windows path directly
              windowsHide: true,      // Hide console window
              detached: false,        // Stay attached to parent
              shell: false,           // Don't use another shell
              stdio: ['ignore', 'pipe', 'pipe']  // Capture output
            });
            
            console.log(`🐚 [CMD] Process spawned`);
            activeBashProcesses.set(sessionId, bashProcess);
          } else {
            // Use PowerShell for normal commands (single ! prefix)
            console.log(`🐚 [POWERSHELL] Running command: ${bashCommand}`);
            console.log(`🐚 [POWERSHELL] Working directory: ${workingDir}`);

            // Use PowerShell with -Command flag
            bashProcess = spawn('powershell.exe', [
              '-NoProfile',
              '-NonInteractive',
              '-Command',
              bashCommand
            ], {
              cwd: workingDir,        // Use Windows path directly
              windowsHide: true,      // Hide console window
              detached: false,        // Stay attached to parent
              shell: false,           // Don't use another shell
              stdio: ['ignore', 'pipe', 'pipe']  // Capture output
            });

            console.log(`🐚 [POWERSHELL] Process spawned`);
            activeBashProcesses.set(sessionId, bashProcess);
          }
          
          let output = '';
          let errorOutput = '';
          
          // Capture output
          bashProcess.stdout.on('data', (data) => {
            const chunk = data.toString();
            output += chunk;
            const isCmd = useCmdExe ? '[CMD]' : '[BASH]';
            console.log(`🐚 ${isCmd} stdout chunk (${chunk.length} bytes)`);
          });
          
          bashProcess.stderr.on('data', (data) => {
            const chunk = data.toString();
            errorOutput += chunk;
            const isCmd = useCmdExe ? '[CMD]' : '[BASH]';
            console.log(`🐚 ${isCmd} stderr chunk (${chunk.length} bytes)`);
          });
          
          // Handle completion
          bashProcess.on('close', (code) => {
            const isCmd = useCmdExe ? '[CMD]' : '[BASH]';
            console.log(`🐚 ${isCmd} Process exited with code ${code}`);
            console.log(`🐚 ${isCmd} Total output: ${output.length} bytes stdout, ${errorOutput.length} bytes stderr`);
            console.log(`🐚 ${isCmd} Sending streaming: false to clear thinking state`);
            
            // Clean up bash process tracking
            activeBashProcesses.delete(sessionId);
            
            // Determine final output and format based on exit code
            let finalOutput = '';
            if (code !== 0) {
              // Command failed - show error clearly
              if (errorOutput) {
                finalOutput = `❌ Command failed with exit code ${code}\n\nError output:\n${errorOutput}`;
                if (output) {
                  finalOutput += `\n\nStandard output:\n${output}`;
                }
              } else if (output) {
                finalOutput = `❌ Command failed with exit code ${code}\n\n${output}`;
              } else {
                finalOutput = `❌ Command failed with exit code ${code} (no output)`;
              }
            } else {
              // Command succeeded - show normal output
              finalOutput = output || errorOutput || '(no output)';
            }
            
            // Send result to UI with ANSI color support
            // Using ansi-block to preserve colors in the output
            const resultMessage = {
              id: bashMessageId,  // Use same ID to update the streaming message
              type: 'assistant',
              message: {
                content: [
                  { type: 'text', text: `\`\`\`ansi\n${finalOutput}\n\`\`\`` }
                ]
              },
              streaming: false,  // Bash commands never stream
              timestamp: Date.now()
            };
            
            // Need to check what sessionId we're using
            console.log(`🐚 ${isCmd} SessionId:`, sessionId);
            console.log(`🐚 ${isCmd} Emitting result on channel: message:${sessionId}`);
            console.log(`🐚 ${isCmd} Result message:`, JSON.stringify(resultMessage).substring(0, 500));
            // Emit to BOTH the regular session AND the Claude session if different
            socket.emit(`message:${sessionId}`, resultMessage);
            
            // If there's a separate claudeSessionId, emit there too
            if (session.claudeSessionId && session.claudeSessionId !== sessionId) {
              console.log(`🐚 ${isCmd} Also emitting to Claude session: message:${session.claudeSessionId}`);
              socket.emit(`message:${session.claudeSessionId}`, resultMessage);
            }
            
            // Also try emitting a separate streaming end signal
            setTimeout(() => {
              console.log(`🐚 ${isCmd} Sending explicit stream end signal`);
              socket.emit(`message:${sessionId}`, {
                type: 'system',
                subtype: 'stream_end',
                streaming: false,
                timestamp: Date.now()
              });
              
              if (session.claudeSessionId && session.claudeSessionId !== sessionId) {
                socket.emit(`message:${session.claudeSessionId}`, {
                  type: 'system',
                  subtype: 'stream_end',
                  streaming: false,
                  timestamp: Date.now()
                });
              }
            }, 100);
            
            // Always report success for bash commands - the output is sent as a message
            // Don't treat non-zero exit codes as errors in the callback
            if (callback) callback({ success: true });
          });
          
          // Also handle 'exit' event for better reliability
          bashProcess.on('exit', (code, signal) => {
            const isCmd = useCmdExe ? '[CMD]' : '[BASH]';
            console.log(`🐚 ${isCmd} Process EXIT event: code=${code}, signal=${signal}`);
          });
          
          
          bashProcess.on('error', (error) => {
            const isCmd = useCmdExe ? '[CMD]' : '[BASH]';
            console.error(`🐚 ${isCmd} Process error: ${error.message}`);
            console.log(`🐚 ${isCmd} Sending streaming: false due to error`);
            
            socket.emit(`message:${sessionId}`, {
              type: 'assistant',
              message: {
                content: [
                  { type: 'text', text: `\`\`\`\nError: ${error.message}\n\`\`\`` }
                ]
              },
              streaming: false,  // Clear streaming state on error
              timestamp: Date.now()
            });
            
            if (callback) callback({ success: false, error: error.message });
          });
        } else {
          // macOS/Linux - use spawn for consistency
          console.log(`🐚 [BASH] Unix command: ${bashCommand}`);
          console.log(`🐚 [BASH] Using bashMessageId: ${bashMessageId}`);
          
          const bashProcess = spawn('bash', ['-c', bashCommand], {
            cwd: workingDir,
            stdio: ['ignore', 'pipe', 'pipe']
          });
          
          // Store bash process for interrupt handling
          activeBashProcesses.set(sessionId, bashProcess);
          
          let output = '';
          let errorOutput = '';
          let processCompleted = false;
          
          
          bashProcess.stdout.on('data', (data) => {
            output += data.toString();
            console.log(`🐚 [BASH] stdout received: ${data.toString().length} bytes`);
          });
          
          bashProcess.stderr.on('data', (data) => {
            errorOutput += data.toString();
            console.log(`🐚 [BASH] stderr received: ${data.toString().length} bytes`);
          });
          
          bashProcess.on('close', (code) => {
            if (processCompleted) {
              console.log(`🐚 [BASH] Ignoring duplicate close event`);
              return;
            }
            processCompleted = true;
            
            // Clean up bash process tracking
            activeBashProcesses.delete(sessionId);
            
            console.log(`🐚 [BASH] Unix process exited with code ${code}`);
            console.log(`🐚 [BASH] Total output: ${output.length} bytes stdout, ${errorOutput.length} bytes stderr`);
            console.log(`🐚 [BASH] Sending result with bashMessageId: ${bashMessageId}`);
            
            // Determine final output and format based on exit code
            let finalOutput = '';
            if (code !== 0) {
              // Command failed - show error clearly
              if (errorOutput) {
                finalOutput = `❌ Command failed with exit code ${code}\n\nError output:\n${errorOutput}`;
                if (output) {
                  finalOutput += `\n\nStandard output:\n${output}`;
                }
              } else if (output) {
                finalOutput = `❌ Command failed with exit code ${code}\n\n${output}`;
              } else {
                finalOutput = `❌ Command failed with exit code ${code} (no output)`;
              }
            } else {
              // Command succeeded - show normal output
              finalOutput = output || errorOutput || '(no output)';
            }
            
            const resultMessage = {
              id: bashMessageId,  // Use same ID to update the streaming message
              type: 'assistant',
              message: {
                content: [
                  { type: 'text', text: `\`\`\`ansi\n${finalOutput}\n\`\`\`` }
                ]
              },
              streaming: false,  // Bash commands never stream
              timestamp: Date.now()
            };
            
            socket.emit(`message:${sessionId}`, resultMessage);
            
            // Always report success for bash commands - the output is sent as a message
            // Don't treat non-zero exit codes as errors in the callback
            if (callback) callback({ success: true });
          });
          
          bashProcess.on('error', (error) => {
            if (processCompleted) return;
            processCompleted = true;
            
            console.error(`🐚 [BASH] Unix process error: ${error.message}`);
            socket.emit(`message:${sessionId}`, {
              id: bashMessageId,
              type: 'assistant',
              message: {
                content: [
                  { type: 'text', text: `\`\`\`\nError: ${error.message}\n\`\`\`` }
                ]
              },
              streaming: false,  // Clear streaming state on error
              timestamp: Date.now()
            });
            
            if (callback) callback({ success: false, error: error.message });
          });
          
        }
      } catch (error) {
        console.error(`🐚 [BASH] Failed to spawn: ${error.message}`);
        socket.emit(`message:${sessionId}`, {
          type: 'assistant',
          message: {
            content: [
              { type: 'text', text: `\`\`\`\nFailed to execute: ${error.message}\n\`\`\`` }
            ]
          },
          streaming: false,  // Clear streaming state on failure
          timestamp: Date.now()
        });
        
        if (callback) callback({ success: false, error: error.message });
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

        // CRITICAL: Clear stopped flag when starting new message processing
        // This allows new messages to be processed after a resume failure
        if (stoppedSessions.get(sessionId)) {
          console.log(`🔄 [${sessionId}] Clearing stopped flag for new message`);
          stoppedSessions.delete(sessionId);
        }

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
        }

        // Don't modify streaming state here - let the UI continue showing streaming
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
              lowerPath.includes('yurucode-server')) {
            console.log(`🚫 Session has temp directory, using home instead: ${processWorkingDir}`);
            processWorkingDir = null;
          }
        }
        
        // Convert WSL paths to Windows paths when using native Windows mode
        console.log(`🔍 Path conversion check:
          - processWorkingDir: ${processWorkingDir}
          - isWindows: ${isWindows}
          - CLAUDE_EXECUTION_MODE: ${CLAUDE_EXECUTION_MODE}
          - NATIVE_WINDOWS_CLAUDE_PATH: ${NATIVE_WINDOWS_CLAUDE_PATH}`);
        
        if (processWorkingDir && isWindows && CLAUDE_EXECUTION_MODE === 'native-windows' && NATIVE_WINDOWS_CLAUDE_PATH) {
          const originalPath = processWorkingDir;
          processWorkingDir = wslToWindowsPath(processWorkingDir);
          if (originalPath !== processWorkingDir) {
            console.log(`🔄 Converted WSL path to Windows path: ${originalPath} → ${processWorkingDir}`);
          } else {
            console.log(`ℹ️ Path unchanged (not WSL format): ${processWorkingDir}`);
          }
        } else {
          console.log(`⏭️ Skipping path conversion (conditions not met)`);
        }
        
        // Use session's working directory, fallback to home directory (NOT temp directory)
        if (!processWorkingDir) {
          processWorkingDir = homedir();
          console.log(`📂 Using home directory as fallback: ${processWorkingDir}`);
        } else {
          console.log(`📂 Using working directory: ${processWorkingDir}`);
        }

      // Build the claude command - EXACTLY LIKE WINDOWS BUT WITH MACOS FLAGS
      const args = [
        '--print',
        '--output-format', 'stream-json',
        '--verbose',
        '--dangerously-skip-permissions',
        '--disallowed-tools', 'AskUserQuestion,EnterPlanMode,ExitPlanMode'
      ];
      
      // Add system prompt if configured (passed from frontend or use default)
      const promptSettings = systemPromptSettings || {};
      const defaultPrompt = 'you are in yurucode ui. prefer lowercase, be extremely concise, never use formal language, no greetings or pleasantries, straight to the point. you must plan first - use think and todo as much as possible to break down everything, including planning into multiple steps and do edits in small chunks';
      
      if (promptSettings.enabled !== false) { // Default to enabled
        let systemPrompt = '';
        
        if (promptSettings.mode === 'custom' && promptSettings.customPrompt) {
          systemPrompt = promptSettings.customPrompt;
        } else if (promptSettings.mode === 'preset' && promptSettings.selectedPreset) {
          // Handle presets if needed
          systemPrompt = defaultPrompt; // For now, use default
        } else {
          // Use default yurucode prompt
          systemPrompt = defaultPrompt;
        }
        
        if (systemPrompt) {
          args.push('--append-system-prompt');
          args.push(systemPrompt);
          console.log(`🎯 [${sessionId}] Using system prompt mode: ${promptSettings.mode || 'default'} (${systemPrompt.length} chars)`);
        }
      } else {
        console.log(`🎯 [${sessionId}] System prompt disabled`);
      }
      
      // Auto-trigger compact if we're near the token limit (97% = 194k tokens)
      const currentTokens = session.totalTokens || 0;
      const tokenLimit = 200000;
      const compactThreshold = 194000; // 97% of limit
      
      if (currentTokens >= compactThreshold && !session.isCompacting && message.trim() !== '/compact') {
        console.log(`⚠️ Auto-compact triggered: ${currentTokens}/${tokenLimit} tokens (${Math.round(currentTokens/tokenLimit*100)}%)`);
        
        // Inform user that we're auto-compacting
        socket.emit(`message:${sessionId}`, {
          type: 'system',
          subtype: 'info',
          message: { content: `📊 Context nearly full (${Math.round(currentTokens/tokenLimit*100)}%). Auto-compacting conversation...` },
          timestamp: Date.now()
        });
        
        // Trigger compact
        processedMessage = '/compact';
      }
      
      // Check for custom /compact command - handle it ourselves instead of sending to Claude
      // Support: /compact [optional instructions] - compresses conversation with custom focus
      // Create a mutable copy of message for processing
      let processedMessage = message;
      
      const compactMatch = processedMessage?.match(/^\/compact\s*(.*)?$/i);
      if (compactMatch) {
        const customInstructions = compactMatch[1]?.trim() || null;
        console.log(`🗜️ Custom /compact triggered - will use Sonnet to self-summarize`);
        if (customInstructions) {
          console.log(`🗜️ Custom instructions: "${customInstructions}"`);
        }
        
        // Force Sonnet 4.5 model for compact operations (faster and more efficient)
        model = 'claude-sonnet-4-5-20250929';
        console.log(`🗜️ Using Sonnet 4.5 for compact operation: ${model}`);
        
        // Check if we have an active session to compact
        if (!session.claudeSessionId) {
          console.log(`⚠️ No active session to compact`);
          socket.emit(`message:${sessionId}`, {
            type: 'system',
            subtype: 'error',
            message: { content: 'No active conversation to compact. Start a conversation first.' },
            timestamp: Date.now()
          });
          
          processSpawnQueue.shift();
          isSpawningProcess = false;
          if (processSpawnQueue.length > 0) {
            processNextSpawnRequest();
          }
          return;
        }
        
        // Step 1: Ask current Claude to summarize the conversation
        // Use the CURRENT session to generate summary
        let summaryPrompt = `Please provide a detailed summary of our entire conversation so far. Include:
1. Key facts about me (name, project details, preferences)
2. Main topics we've discussed
3. Any code or solutions we've worked on
4. Important decisions or conclusions
5. Current task/problem we're addressing
6. Any context needed to continue our work

Format as a clear, structured summary that preserves all important context.`;
        
        // Add custom instructions if provided
        if (customInstructions) {
          summaryPrompt += `\n\nAdditional instructions for the summary:\n${customInstructions}`;
        }
        
        console.log(`🗜️ Asking Claude to self-summarize with session ${session.claudeSessionId}`);
        
        // Replace the user's /compact message with our summary request
        processedMessage = summaryPrompt;
        
        // Mark that we're in compact mode
        session.isCompacting = true;
        // Get token count from wrapper if available, otherwise use session count
        const wrapperSession = typeof getWrapperSession !== 'undefined' ? getWrapperSession(sessionId) : null;
        console.log(`🗜️ Wrapper session state:`, wrapperSession ? {
          totalTokens: wrapperSession.totalTokens,
          inputTokens: wrapperSession.inputTokens,
          outputTokens: wrapperSession.outputTokens
        } : 'not available');
        console.log(`🗜️ Session token state: totalTokens=${session.totalTokens}`);
        session.compactStartTokens = wrapperSession?.totalTokens || session.totalTokens || 0;
        session.compactMessageCount = session.messages?.length || 0;
        session.compactCustomInstructions = customInstructions;
        console.log(`🗜️ Set compactStartTokens to ${session.compactStartTokens}`);
        
        // Continue with normal flow but with our summary prompt
        // The result will be caught in the result handler
      }
      
      // Add model flag if specified
      if (model) {
        args.push('--model', model);
        console.log(`🤖 Using model: ${model}`);
      }
      
      // Determine if we're resuming or recreating
      let isResuming = false;
      
      // Check for interrupted session to restore
      if (!session.claudeSessionId && session.interruptedSessionId && session.wasInterrupted) {
        console.log(`🔄 Restoring interrupted session: ${session.interruptedSessionId}`);
        session.claudeSessionId = session.interruptedSessionId;
        session.interruptedSessionId = null;
      }
      
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
      } else if (session.wasCompacted && session.compactSummary) {
        console.log('📝 Starting fresh conversation after compaction');
        console.log(`🗜️ Previous conversation was compacted, saved ${session.tokensSavedByCompact || 0} tokens`);
        console.log(`🗜️ Injecting summary into new conversation`);
        
        // Prepend the summary to the user's message
        const summaryContext = `[Previous conversation context - compacted from ${session.tokensSavedByCompact} tokens]:\n${session.compactSummary}\n\n[Continuing conversation]\nUser: ${processedMessage}`;
        processedMessage = summaryContext;
        
        // Clear the compact flag after using the summary
        session.wasCompacted = false;
        session.compactSummary = null;
        
        console.log(`🗜️ Message with context: ${message.substring(0, 200)}...`);
      } else {
        console.log('📝 Starting fresh conversation (no previous session)');
      }

      // REMOVED broken echo detection - all messages should go to Claude

      // Spawn claude process with proper PATH for Node.js
      console.log(`🚀 Spawning claude with args:`, args);
      console.log(`🔍 Active processes count: ${activeProcesses.size}`);

      // Ensure Node.js is in PATH for Claude CLI
      const enhancedEnv = { ...process.env };

      // CRITICAL FIX: On Windows native mode, override SHELL to use PowerShell
      // This prevents Claude CLI's Bash tool from using /usr/bin/bash (from Git Bash/WSL)
      // which would fail trying to run cmd.exe commands through bash
      if (isWindows && CLAUDE_EXECUTION_MODE === 'native-windows' && NATIVE_WINDOWS_CLAUDE_PATH) {
        // Set SHELL to PowerShell for Windows native mode
        enhancedEnv.SHELL = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
        // Also set COMSPEC to ensure cmd.exe fallback works
        enhancedEnv.COMSPEC = process.env.COMSPEC || 'C:\\Windows\\System32\\cmd.exe';
        console.log(`🔧 Set SHELL to PowerShell for Windows native mode`);

        // Add Node.js to PATH using Windows path separator (;)
        const nodePaths = [
          'C:\\Program Files\\nodejs',
          'C:\\Program Files (x86)\\nodejs',
          process.env.ProgramFiles && `${process.env.ProgramFiles}\\nodejs`,
          process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}\\Programs\\nodejs`,
        ].filter(Boolean);

        for (const nodePath of nodePaths) {
          if (existsSync(nodePath) && !enhancedEnv.PATH?.includes(nodePath)) {
            enhancedEnv.PATH = `${nodePath};${enhancedEnv.PATH || ''}`;
            console.log(`🔧 Added Node.js to PATH: ${nodePath}`);
            break;
          }
        }
      } else if (!isWindows) {
        // Unix systems - add homebrew path if needed
        const nodeBinDir = '/opt/homebrew/bin';
        if (!enhancedEnv.PATH?.includes(nodeBinDir)) {
          enhancedEnv.PATH = `${nodeBinDir}:${enhancedEnv.PATH || '/usr/bin:/bin'}`;
          console.log(`🔧 Added ${nodeBinDir} to PATH for Claude CLI`);
        }
      }

      // Add unique session identifier to environment to ensure isolation
      enhancedEnv.CLAUDE_SESSION_ID = sessionId;
      enhancedEnv.CLAUDE_INSTANCE = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Add small delay to prevent race conditions with multiple Claude instances
      if (isSpawningProcess) {
        console.log(`⏳ Waiting for previous Claude process to initialize...`);
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      isSpawningProcess = true;

      // Mark this session as spawning to handle interrupt race condition
      spawningProcesses.set(sessionId, { startTime: Date.now(), aborted: false });
      console.log(`🔄 Session ${sessionId} marked as spawning`);
      
      // Convert WSL paths to Windows paths when using native Windows mode (for validation)
      if (processWorkingDir && isWindows && CLAUDE_EXECUTION_MODE === 'native-windows' && NATIVE_WINDOWS_CLAUDE_PATH) {
        const originalPath = processWorkingDir;
        const convertedPath = wslToWindowsPath(processWorkingDir);
        if (originalPath !== convertedPath) {
          console.log(`🔄 Converting WSL path for validation: ${originalPath} → ${convertedPath}`);
          processWorkingDir = convertedPath;
        }
      }
      
      // Explicitly set PWD environment variable for Claude's bash commands (AFTER conversion)
      enhancedEnv.PWD = processWorkingDir;
      enhancedEnv.HOME = homedir(); // Ensure HOME is set correctly
      console.log(`🔧 Set PWD=${processWorkingDir} and HOME=${homedir()} in environment`);
      
      // Ensure the directory exists before spawning
      if (!existsSync(processWorkingDir)) {
        console.warn(`⚠️ Working directory does not exist: ${processWorkingDir}, using home directory`);
        processWorkingDir = homedir();
      }
      
      const spawnOptions = {
        cwd: processWorkingDir,
        env: enhancedEnv,
        shell: false,
        windowsHide: true,  // Always hide windows - prevents black console
        // IMPORTANT: Do NOT use windowsVerbatimArguments with WSL - it breaks argument passing!
        detached: false,  // Don't detach on Windows to avoid console window
        stdio: ['pipe', 'pipe', 'pipe']  // Explicit stdio configuration
      };
      
      console.log(`🚀 Spawning claude process with options:`, {
        cwd: spawnOptions.cwd,
        claudePath: CLAUDE_PATH,
        args: args
      });
      
      let claudeProcess;
      let windowsTempFileToCleanup = null; // Track temp file for cleanup
      
      if (isWindows) {
        // Use the unified command builder that checks settings
        let effectiveWorkingDir = processWorkingDir;
        
        // Build the message with context if needed
        let messageToSend = processedMessage;
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
          
          contextSummary += `---\\nNow, continuing our conversation: ${processedMessage}`;
          messageToSend = contextSummary;
          session.pendingContextRestore = false;
        }
        
        const [command, commandArgs, inputHandled, tempFile] = getClaudeCommand(args, effectiveWorkingDir, messageToSend);
        windowsTempFileToCleanup = tempFile; // Store temp file path for cleanup
        
        console.log(`🚀 Running command: ${command}`);
        console.log(`🚀 Args (first 500 chars):`, JSON.stringify(commandArgs).substring(0, 500));
        console.log(`🚀 Input handled: ${inputHandled}`);
        
        // Check if command exists before trying to spawn
        if (command.includes('wsl.exe') && !existsSync(command)) {
          console.error(`❌ WSL.exe not found at: ${command}`);
          console.error(`❌ Please ensure WSL is installed on Windows`);
          throw new Error('WSL.exe not found. Please install Windows Subsystem for Linux.');
        }
        
        // For .cmd files on Windows, we need shell: true
        // BUT not if we're running Node.js directly
        if ((command.endsWith('.cmd') || command.endsWith('.bat')) && !command.endsWith('node.exe')) {
          spawnOptions.shell = true;
          
          // Add Node.js to PATH for .cmd execution
          const nodePaths = [
            'C:\\Program Files\\nodejs',
            'C:\\Program Files (x86)\\nodejs',
            process.env.ProgramFiles + '\\nodejs',
          ].filter(Boolean);
          
          for (const nodePath of nodePaths) {
            if (existsSync(nodePath)) {
              spawnOptions.env = { ...spawnOptions.env };
              spawnOptions.env.PATH = nodePath + ';' + (spawnOptions.env.PATH || process.env.PATH);
              console.log(`✅ Added Node.js to PATH for .cmd execution: ${nodePath}`);
              break;
            }
          }
        }
        
        claudeProcess = spawn(command, commandArgs, spawnOptions);
        claudeProcess.inputHandled = inputHandled;
      } else {
        claudeProcess = spawn(CLAUDE_PATH, args, spawnOptions);
      }
      
      // Mark spawning as complete after a short delay
      setTimeout(() => {
        isSpawningProcess = false;
      }, 500);

      // Store process reference and start time
      activeProcesses.set(sessionId, claudeProcess);
      activeProcessStartTimes.set(sessionId, Date.now());

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

        // Kill the process using the proper Windows method
        const isWindows = process.platform === 'win32';
        if (isWindows && claudeProcess.pid) {
          try {
            require('child_process').execSync(`taskkill /F /T /PID ${claudeProcess.pid}`, {
              stdio: 'ignore',
              timeout: 5000
            });
          } catch (e) {}
          try { claudeProcess.kill(); } catch (e) {}
        } else if (claudeProcess.pid) {
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

      // On Unix systems, detached processes need special handling
      if (process.platform !== 'win32') {
        claudeProcess.unref(); // Allow parent to exit independently
      }

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
        const messageToSend = processedMessage + '\n';
        console.log(`📝 Sending message to claude via stdin (${processedMessage.length} chars) - resuming=${isResuming}`);
        
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
        console.log(`📝 Message already embedded in command (WSL or temp file)`);
        // For native Windows with temp file, we need to pipe it to stdin
        if (windowsTempFileToCleanup && CLAUDE_EXECUTION_MODE === 'native-windows') {
          const fs = require('fs');
          try {
            const tempContent = fs.readFileSync(windowsTempFileToCleanup, 'utf8');
            console.log(`📝 Piping temp file content to stdin (${tempContent.length} chars)`);
            claudeProcess.stdin.write(tempContent);
            claudeProcess.stdin.end();
            // Clean up temp file after reading
            setTimeout(() => {
              try {
                fs.unlinkSync(windowsTempFileToCleanup);
                console.log(`🗑️ Cleaned up temp file: ${windowsTempFileToCleanup}`);
              } catch (e) {
                // Ignore cleanup errors
              }
            }, 1000);
          } catch (e) {
            console.error(`❌ Failed to read temp file: ${e.message}`);
          }
        }
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
      let watchdogTimerRef = { timer: null }; // Store watchdog timer reference
      
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
        
        // Info at 1 minute - this is normal for complex tasks
        if (timeSinceLastData > 60000 && timeSinceLastData < 65000) {
          console.log(`⏳ No data for 1 min - Claude processing complex task...`);
          socket.emit(`keepalive:${sessionId}`, { 
            timestamp: Date.now(),
            info: 'Processing complex task',
            elapsed: timeSinceLastData 
          });
        }
        
        // Warning at 5 minutes
        if (timeSinceLastData > 300000 && timeSinceLastData < 305000) {
          console.warn(`⚠️ No data for 5 min - task taking longer than usual`);
          socket.emit(`keepalive:${sessionId}`, { 
            timestamp: Date.now(),
            warning: 'Long-running operation in progress',
            elapsed: timeSinceLastData 
          });
        }
        
        // Serious warning at 8 minutes
        if (timeSinceLastData > 480000 && timeSinceLastData < 485000) {
          console.error(`🚨 No data for 8 min - may be frozen`);
          socket.emit(`message:${sessionId}`, {
            type: 'system',
            subtype: 'warning',
            content: '⚠️ Claude has been silent for 8 minutes. Will terminate at 10 minutes if no response.',
            timestamp: Date.now()
          });
        }
        
        // Don't try to recover with newlines - it doesn't work and can break things
        // Claude legitimately takes time to process complex tasks
        
        // NO TIME LIMIT - Claude can think as long as it needs
        // Extended thinking and complex tasks can take arbitrary time
      }, 5000); // Check every 5 seconds - balance between monitoring and performance
      
      // Store health check interval for cleanup
      streamHealthChecks.set(sessionId, streamHealthInterval);
      
      // Function to reset watchdog timer
      const resetWatchdog = () => {
        if (watchdogTimerRef.timer) {
          clearTimeout(watchdogTimerRef.timer);
        }
        watchdogTimerRef.timer = setTimeout(() => {
          const finalTimeSinceData = Date.now() - lastDataTime;
          console.error(`🐕 WATCHDOG: Killing frozen process after ${finalTimeSinceData}ms of no data`);
          
          // Force kill everything
          if (activeBashProcesses.has(sessionId)) {
            const bashProc = activeBashProcesses.get(sessionId);
            if (bashProc) {
              try { bashProc.kill('SIGKILL'); } catch(e) {}
              activeBashProcesses.delete(sessionId);
            }
          }
          
          if (activeProcesses.has(sessionId)) {
            const proc = activeProcesses.get(sessionId);
            try { proc.kill('SIGKILL'); } catch(e) {}
            activeProcesses.delete(sessionId);
            activeProcessStartTimes.delete(sessionId);
          }
          
          // Send error message
          socket.emit(`message:${sessionId}`, {
            type: 'system',
            subtype: 'error',
            content: '🔴 Watchdog timer: Claude was terminated due to unresponsiveness',
            timestamp: Date.now()
          });
          
          // Clean up all timers
          if (streamHealthChecks.has(sessionId)) {
            clearInterval(streamHealthChecks.get(sessionId));
            streamHealthChecks.delete(sessionId);
          }
          if (streamTimeouts.has(sessionId)) {
            clearTimeout(streamTimeouts.get(sessionId));
            streamTimeouts.delete(sessionId);
          }
        }, 660000); // Kill after 11 minutes (gives 10 min warning + 1 min buffer)
      };
      
      // Start the watchdog timer
      resetWatchdog();
      
      // Set overall stream timeout (45 minutes max - even complex tasks shouldn't take longer)
      const streamTimeout = setTimeout(() => {
        console.warn(`⏰ Stream timeout reached for session ${sessionId} after 45 minutes`);
        if (activeProcesses.has(sessionId)) {
          const proc = activeProcesses.get(sessionId);
          console.log(`⏰ Terminating long-running process for ${sessionId}`);
          proc.kill('SIGTERM');
        }
      }, 2700000); // 45 minutes max
      streamTimeouts.set(sessionId, streamTimeout);
      
      const processStreamLine = (line) => {
        if (!line.trim()) {
          return;
        }

        // CRITICAL: Check if this process was killed - if so, don't emit any more messages
        // This prevents buffered stdout data from continuing to emit streaming=true after process kill
        // Using PID check is more reliable than session-level flag because it survives new process spawns
        if (claudeProcess && claudeProcess.pid && killedProcessPIDs.has(claudeProcess.pid)) {
          console.log(`🛑 [${sessionId}] Process ${claudeProcess.pid} was killed - ignoring buffered line`);
          return;
        }

        // Also check session-level stopped flag as a fallback
        if (stoppedSessions.get(sessionId)) {
          console.log(`🛑 [${sessionId}] Session stopped - ignoring buffered line`);
          return;
        }

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
        resetWatchdog(); // Reset the watchdog timer on valid data
        
        // Check for "No conversation found" error message
        if (line.includes('No conversation found with session ID')) {
          console.log(`🔄 [${sessionId}] Resume failed - session not found in Claude storage`);
          console.log(`🔄 [${sessionId}] KILLING process and clearing state`);

          // CRITICAL: Mark session as stopped to prevent buffered data from emitting
          stoppedSessions.set(sessionId, true);
          console.log(`🛑 [${sessionId}] Marked session as stopped - buffered data will be ignored`);

          // CRITICAL: Kill the process immediately to stop further streaming
          try {
            if (claudeProcess && !claudeProcess.killed) {
              const pidToKill = claudeProcess.pid;
              console.log(`🛑 [${sessionId}] Killing claude process PID: ${pidToKill}`);
              // Track this PID so any buffered data from it is ignored
              if (pidToKill) {
                killedProcessPIDs.add(pidToKill);
                console.log(`🛑 [${sessionId}] Added PID ${pidToKill} to killed set`);
              }
              claudeProcess.kill('SIGTERM');
              activeProcesses.delete(sessionId);
              activeProcessStartTimes.delete(sessionId);
            }
          } catch (killErr) {
            console.error(`❌ [${sessionId}] Error killing process:`, killErr.message);
          }

          // Clear streaming state for any pending assistant messages
          const lastAssistantMessageId = lastAssistantMessageIds.get(sessionId);
          if (lastAssistantMessageId) {
            console.log(`🔴 [${sessionId}] Clearing streaming for message ${lastAssistantMessageId}`);
            socket.emit(`update:${sessionId}`, {
              id: lastAssistantMessageId,
              streaming: false
            });
            lastAssistantMessageIds.delete(sessionId);
          }

          // Send stream end to ensure UI stops showing spinner
          socket.emit(`message:${sessionId}`, {
            type: 'system',
            subtype: 'stream_end',
            streaming: false,
            timestamp: Date.now()
          });

          // Clear the invalid session ID so next attempt doesn't use --resume
          const session = sessions.get(sessionId);
          if (session) {
            // Clear the invalid session ID
            session.claudeSessionId = null;

            // Send info message to explain what happened (NOT an error result)
            const infoMessageId = `system-info-${Date.now()}-${Math.random()}`;
            socket.emit(`message:${sessionId}`, {
              id: infoMessageId,
              type: 'system',
              subtype: 'info',
              message: { content: 'session expired - send message again to continue' },
              timestamp: Date.now(),
              streaming: false
            });
            console.log(`📤 [${sessionId}] Sent info message ${infoMessageId} about session expiry`);

            // Mark session as ready for new messages
            session.isReady = true;
            console.log(`✅ [${sessionId}] Session marked as ready after resume failure`);
          }
          return; // Don't try to parse as JSON
        }
        
        try {
          const jsonData = JSON.parse(line);
          
          // Extract session ID if present (update it every time to ensure we have the latest)
          // BUT: Don't store session_id from compact results as they can't be resumed
          const lastUserMessage = session?.messages?.filter(m => m.role === 'user').pop();
          const isCompactCommand = lastUserMessage?.message?.content?.trim() === '/compact';
          const isCompactResult = isCompactCommand && jsonData.type === 'result';
          
          // Don't store ANY session IDs during a compact operation
          if (jsonData.session_id && !isCompactCommand) {
            // Check if this is a NEW Claude session (different session_id)
            const previousClaudeSessionId = session.claudeSessionId;
            const isNewClaudeSession = previousClaudeSessionId && previousClaudeSessionId !== jsonData.session_id;

            if (isNewClaudeSession) {
              // New Claude session detected - reset wrapper token counters
              // Each Claude session has its own 200k context window
              const wrapperSession = getWrapperSession(sessionId);
              const oldTokens = wrapperSession.accumulatedTotalTokens;
              // Reset per-request tokens
              wrapperSession.totalTokens = 0;
              wrapperSession.inputTokens = 0;
              wrapperSession.outputTokens = 0;
              wrapperSession.cacheCreationTokens = 0;
              wrapperSession.cacheReadTokens = 0;
              // Reset accumulated tokens
              wrapperSession.accumulatedInputTokens = 0;
              wrapperSession.accumulatedOutputTokens = 0;
              wrapperSession.accumulatedTotalTokens = 0;
              wrapperSession.accumulatedCacheRead = 0;
              wrapperSession.accumulatedCacheCreation = 0;
              console.log(`🔄 [${sessionId}] NEW Claude session detected (${previousClaudeSessionId} → ${jsonData.session_id})`);
              console.log(`🔄 [${sessionId}] Reset wrapper tokens: ${oldTokens} → 0 (each session has independent 200k limit)`);
            }

            session.claudeSessionId = jsonData.session_id;
            console.log(`📌 [${sessionId}] Claude session ID: ${session.claudeSessionId}`);
          } else if (isCompactCommand && jsonData.session_id) {
            console.log(`🗜️ [${sessionId}] Ignoring session ID during compact: ${jsonData.session_id} (not resumable)`);
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
                  // Debug log for thinking blocks
                  if (block.type === 'thinking') {
                    console.log(`🧠 [${sessionId}] Found thinking block: ${(block.thinking || block.text || '').substring(0, 100)}...`);
                  }
                } else if (block.type === 'tool_use') {
                  hasToolUse = true;
                  
                  // Don't calculate line numbers for Edit/MultiEdit tools anymore
                  // The diff will be shown in the tool_result message instead
                  // Just use the original input without enhancements
                  
                  // Track Bash tool uses for focus restoration on Windows
                  if (block.name === 'Bash' && isFirstBashCommand) {
                    console.log(`🔧 [${sessionId}] Tracking first Bash tool use: ${block.id}`);
                    bashToolUseIds.set(block.id, { sessionId, timestamp: Date.now() });
                  }
                  
                  // Send tool use as separate message immediately (without line number enhancements)
                  const toolUseMessage = {
                    type: 'tool_use',
                    message: {
                      name: block.name,
                      input: block.input,  // Use original input without enhancements
                      id: block.id
                    },
                    timestamp: Date.now(),
                    id: `tool-${sessionId}-${Date.now()}`
                  };
                  // Include parent_tool_use_id if this is a subagent message
                  if (jsonData.parent_tool_use_id) {
                    toolUseMessage.parent_tool_use_id = jsonData.parent_tool_use_id;
                    console.log(`🤖 [${sessionId}] Subagent tool_use (parent: ${jsonData.parent_tool_use_id.substring(0, 20)}...): ${block.name}`);
                  }
                  socket.emit(`message:${sessionId}`, toolUseMessage);
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
                  console.log(`🤖 [${sessionId}] Subagent assistant message (parent: ${jsonData.parent_tool_use_id.substring(0, 20)}...)`);
                }
                socket.emit(`message:${sessionId}`, assistantMessage);
                
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
                // Check if this is a Bash tool result and trigger focus restoration on Windows
                if (bashToolUseIds.has(block.tool_use_id)) {
                  console.log(`🔧 [${sessionId}] Bash tool result received, triggering focus restoration`);
                  const bashInfo = bashToolUseIds.get(block.tool_use_id);
                  bashToolUseIds.delete(block.tool_use_id); // Clean up
                  
                  // Set flag to false after first bash command
                  if (isFirstBashCommand) {
                    isFirstBashCommand = false;
                    console.log(`🔧 [${sessionId}] First bash command completed, focus restoration disabled for future commands`);
                  }
                  
                  // Emit event to trigger focus restoration on Windows
                  if (process.platform === 'win32') {
                    socket.emit(`trigger:focus:${bashInfo.sessionId}`, {
                      timestamp: Date.now()
                    });
                  }
                }
                
                // Check if this is an Edit/MultiEdit tool result and enhance with context lines
                let enhancedContent = block.content;
                
                // More permissive check for Edit tool results
                if (typeof block.content === 'string' && 
                    (block.content.includes('has been updated') || 
                     block.content.includes('updated.') || 
                     (block.content.includes('Applied') && block.content.includes('edit')) ||
                     block.content.includes('The file') ||
                     block.content.includes('snippet of the edited file'))) {
                  
                  // Extract file path from the content - try multiple patterns
                  const filePathMatch = block.content.match(/The file (.+?) has been updated/) || 
                                        block.content.match(/Applied \d+ edits? to (.+?):/) ||
                                        block.content.match(/file[:\s]+(.+?)(?:\s+has been|\s+updated|:|\n)/) ||
                                        block.content.match(/\/[^\s]+\.(?:tsx?|jsx?|py|rs|md|css|json|yml|yaml|toml|html|vue|svelte)/g);
                  
                  if (filePathMatch) {
                    // Handle different match formats
                    const filePath = Array.isArray(filePathMatch) && !filePathMatch[1] 
                                    ? filePathMatch[0] 
                                    : (filePathMatch[1] || filePathMatch[0]);
                    const fullPath = join(session.workingDirectory || process.cwd(), filePath);
                    console.log(`📝 [${sessionId}] Attempting to enhance diff for: ${filePath}`);
                    
                    // Try to read the file and add context lines
                    try {
                      if (existsSync(fullPath)) {
                        const fileContent = readFileSync(fullPath, 'utf8');
                        const fileLines = fileContent.split('\n');
                        
                        // Parse the diff lines to find changed line numbers
                        const diffLines = block.content.split('\n');
                        // Match various line number formats: "42→", "  42→", "42:", line 42, etc
                        const lineNumberRegex = /(?:^\s*(\d+)[→:])|(?:line[s]?\s+(\d+))/i;
                        const changedLineNumbers = new Set();
                        
                        diffLines.forEach(line => {
                          const match = line.match(lineNumberRegex);
                          if (match) {
                            // Get the first captured group that has a value
                            const lineNum = match[1] || match[2];
                            if (lineNum) {
                              changedLineNumbers.add(parseInt(lineNum));
                            }
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
                  streaming: true,  // Keep streaming true during tool execution
                  timestamp: Date.now(),
                  id: `toolresult-${sessionId}-${Date.now()}`
                };
                // Include parent_tool_use_id if this is a subagent message
                if (jsonData.parent_tool_use_id) {
                  toolResultMessage.parent_tool_use_id = jsonData.parent_tool_use_id;
                  console.log(`🤖 [${sessionId}] Subagent tool_result (parent: ${jsonData.parent_tool_use_id.substring(0, 20)}...)`);
                }
                socket.emit(`message:${sessionId}`, toolResultMessage);
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
            console.log(`📦 [${sessionId}] RESULT: success=${!jsonData.is_error}, duration=${jsonData.duration_ms}ms`);
            
            // Check if this is a compact result - look for the last user message being /compact
            const session = sessions.get(sessionId);
            const lastUserMessage = session?.messages?.filter(m => m.role === 'user').pop();
            const isCompactCommand = lastUserMessage?.message?.content?.trim() === '/compact';
            
            // Check if we're in custom compacting mode (Claude is generating summary)
            const isCustomCompacting = session?.isCompacting === true;
            
            // Compact results have specific patterns in the result text
            const isCompactResult = isCompactCommand && 
                                   (jsonData.result?.includes('Compacted') || 
                                    jsonData.result?.includes('compressed') ||
                                    jsonData.result?.includes('summary') ||
                                    jsonData.result === '' ||
                                    jsonData.result === null);
            
            // Handle custom compacting - when Claude returns the summary
            if (isCustomCompacting) {
              console.log(`🗜️ [${sessionId}] Received compact summary from Claude`);
              
              // Check if result is empty or generic - if so, use last assistant message
              let actualSummary = jsonData.result;
              if (!actualSummary || 
                  actualSummary.trim() === '' || 
                  actualSummary.includes('ready to continue') ||
                  actualSummary.includes('continue normally') ||
                  actualSummary.length < 50) {
                
                console.log(`🗜️ Result is empty/generic, looking for last assistant message`);
                
                // Find the last assistant message with text content
                const assistantMessages = session?.messages?.filter(m => m.type === 'assistant' && m.message?.content) || [];
                for (let i = assistantMessages.length - 1; i >= 0; i--) {
                  const msg = assistantMessages[i];
                  const content = msg.message?.content;
                  
                  // Extract text from content blocks
                  let textContent = '';
                  if (typeof content === 'string') {
                    textContent = content;
                  } else if (Array.isArray(content)) {
                    const textBlocks = content.filter(block => block.type === 'text' && block.text);
                    textContent = textBlocks.map(block => block.text).join('\n').trim();
                  }
                  
                  // Use this as summary if it's substantial (for compact, any substantial message is the summary)
                  if (textContent && textContent.length > 100) {
                    actualSummary = textContent;
                    console.log(`🗜️ Using assistant message as summary (${textContent.length} chars)`);
                    break;
                  }
                }
                
                // If still no good summary, use a fallback
                if (!actualSummary || actualSummary.length < 50) {
                  actualSummary = `Conversation compacted successfully. Previous context preserved.`;
                  console.log(`🗜️ Using fallback summary`);
                }
              }
              
              console.log(`🗜️ Summary length: ${actualSummary.length} chars`);
              console.log(`🗜️ Previous token count: ${session.compactStartTokens}`);
              
              // Store the summary
              session.compactSummary = actualSummary;
              // Fix the token tracking - get from wrapper if available
              const wrapperSession = typeof getWrapperSession !== 'undefined' ? getWrapperSession(sessionId) : null;
              session.tokensSavedByCompact = session.compactStartTokens || wrapperSession?.totalTokens || 0;
              
              // Clear the current session ID - we'll start fresh
              const oldSessionId = session.claudeSessionId;
              session.claudeSessionId = null;
              session.wasCompacted = true;
              session.isCompacting = false;
              
              console.log(`🗜️ Saved summary and cleared session ${oldSessionId}`);
              console.log(`🗜️ Next message will start fresh with summary as context`);
              
              // Send success message to user with the actual summary
              let resultText = `✅ Conversation compacted successfully!\n\n📊 Compaction Summary:\n• Tokens saved: ${session.tokensSavedByCompact.toLocaleString()}\n• Previous messages: ${session.compactMessageCount || session.messages.length}\n• Summary preserved: Yes`;
              
              if (session.compactCustomInstructions) {
                resultText += `\n• Custom focus: ${session.compactCustomInstructions}`;
              }
              
              // Include the actual summary from Claude
              resultText += `\n\n📝 Summary:\n${actualSummary}\n\n✨ Context has been compressed. You can continue normally.`;
              
              // Calculate the duration from when the process started (or use jsonData.duration_ms)
              const processStartTime = activeProcessStartTimes.get(sessionId);
              // Use Claude's reported duration if available, otherwise calculate from start time
              const duration = jsonData.duration_ms || (processStartTime ? (Date.now() - processStartTime) : 0);
              console.log(`🗜️ Duration: jsonData.duration_ms=${jsonData.duration_ms}, calculated=${processStartTime ? Date.now() - processStartTime : 'N/A'}, using=${duration}ms`);
              
              const compactMessage = {
                type: 'result',
                subtype: 'success',
                is_error: false,
                result: resultText,
                session_id: null, // No session ID since we're starting fresh
                duration_ms: jsonData.duration_ms || duration, // Use Claude's duration or our calculated one
                usage: {
                  input_tokens: 0,
                  output_tokens: 0,
                  cache_creation_input_tokens: 0,
                  cache_read_input_tokens: 0
                },
                wrapperTokens: {
                  input: 0,
                  output: 0,
                  total: 0,
                  cache_read: 0,
                  cache_creation: 0
                },
                streaming: false,
                id: `result-${sessionId}-${Date.now()}-${Math.random()}`,
                model: jsonData.model || model || 'claude-sonnet-4-5-20250929',
                timestamp: Date.now()
              };
              
              socket.emit(`message:${sessionId}`, compactMessage);
              console.log(`📤 [${sessionId}] Sent compact success message`);
              
              // Clear message history but keep the summary
              session.messages = [];
              session.compactCount = (session.compactCount || 0) + 1;
              
              // Don't process the normal result - we handled it
              return;
            }
            
            // Handle old-style compact (shouldn't happen with our custom handling)
            if (isCompactResult && !isCustomCompacting) {
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
                // Store the compact summary and token info for the next session
                session.compactSummary = jsonData.result || 'conversation summarized';
                session.compactedTokenCount = compactedTokens?.total || 0;
                session.tokensSavedByCompact = (session.totalTokens || 0);
                console.log(`🗜️ Cleared session ID (was ${oldSessionId}) - next message will start fresh after compact`);
                console.log(`🗜️ Marked session as compacted to prevent old ID restoration`);
                console.log(`🗜️ Stored compact summary for next session: ${session.compactSummary.substring(0, 100)}...`);
                console.log(`🗜️ The compact command has summarized the conversation - continuing with reduced context`);
              }
              
              // After compact, we don't know the exact new token count until the next message
              // The /compact command itself returns usage: 0 which is not the compressed context size
              // Reset tokens to 0 and let the next message establish the new baseline
              console.log(`🗜️ [${sessionId}] Compact complete - tokens will reset on next message`);

              // Reset session token tracking
              if (session) {
                const savedTokens = session.totalTokens || 0;
                session.totalTokens = 0;
                session.inputTokens = 0;
                session.outputTokens = 0;
                console.log(`🗜️ [${sessionId}] Reset session tokens from ${savedTokens} to 0`);
              }

              // Also reset wrapper session accumulated tokens
              const wrapperSession = getWrapperSession(sessionId);
              const savedAccumulated = wrapperSession.accumulatedTotalTokens;
              wrapperSession.accumulatedInputTokens = 0;
              wrapperSession.accumulatedOutputTokens = 0;
              wrapperSession.accumulatedTotalTokens = 0;
              wrapperSession.accumulatedCacheRead = 0;
              wrapperSession.accumulatedCacheCreation = 0;
              wrapperSession.inputTokens = 0;
              wrapperSession.outputTokens = 0;
              wrapperSession.totalTokens = 0;
              console.log(`🗜️ [${sessionId}] Reset wrapper accumulated tokens from ${savedAccumulated} to 0`);
              
              // Send compact notification with reset instruction
              socket.emit(`message:${sessionId}`, {
                type: 'system',
                subtype: 'compact',
                session_id: null, // Clear session ID after compact
                message: { 
                  content: 'context compacted - tokens reset',
                  compactedTokens: {
                    input: 0,
                    output: 0,
                    total: 0,
                    cache_read: 0,
                    cache_creation: 0,
                    reset: true  // Flag to indicate full reset
                  },
                  tokensSaved: session?.tokensSavedByCompact || 0,
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
              const thisRequest = input + output;

              // Get accumulated values from wrapper session
              const wrapperSession = getWrapperSession(sessionId);
              const accumulatedTotal = wrapperSession.accumulatedTotalTokens;

              console.log(`\n📊 TOKEN USAGE BREAKDOWN:`);
              console.log(`   ┌─────────────────┬──────────┬──────────────┬────────────┐`);
              console.log(`   │ Type            │ Input    │ Cache Read   │ Cache New  │`);
              console.log(`   ├─────────────────┼──────────┼──────────────┼────────────┤`);
              console.log(`   │ User Message    │ ${String(input).padEnd(8)} │              │            │`);
              console.log(`   │ Assistant Reply │ ${String(output).padEnd(8)} │              │            │`);
              console.log(`   │ Context History │          │ ${String(cacheRead).padEnd(12)} │            │`);
              console.log(`   │ Cache Created   │          │              │ ${String(cacheCreation).padEnd(10)} │`);
              console.log(`   ├─────────────────┼──────────┼──────────────┼────────────┤`);
              console.log(`   │ New Tokens      │ ${String(thisRequest).padEnd(8)} │ (billing)    │ (billing)  │`);
              console.log(`   └─────────────────┴──────────┴──────────────┴────────────┘`);
              console.log(`   ACCUMULATED CONTEXT: ${accumulatedTotal} / 200000 (${(accumulatedTotal/2000).toFixed(1)}%)`);
              console.log(`   Note: Accumulated across session. Cache values are for billing only.`);
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
            const resultMessage = {
              type: 'result',
              ...jsonData,
              streaming: false,
              id: `result-${sessionId}-${Date.now()}`,
              model: model || 'unknown' // Use model from outer scope directly
            };
            
            // CRITICAL: Include usage directly (like Windows) AND in wrapper field
            // This ensures compatibility with both old Windows code and new wrapper integration
            if (jsonData.usage) {
              // Include usage directly for Windows compatibility
              resultMessage.usage = jsonData.usage;

              // Get accumulated values from wrapper session
              const wrapperSession = getWrapperSession(sessionId);

              // Also add wrapper tokens for enhanced analytics - use ACCUMULATED values
              resultMessage.wrapper = {
                tokens: {
                  // Accumulated totals (for context usage display)
                  input: wrapperSession.accumulatedInputTokens,
                  output: wrapperSession.accumulatedOutputTokens,
                  total: wrapperSession.accumulatedTotalTokens,
                  cache_read: wrapperSession.accumulatedCacheRead,
                  cache_creation: wrapperSession.accumulatedCacheCreation,
                  // Per-request values (for debugging/reference)
                  lastRequest: {
                    input: jsonData.usage.input_tokens || 0,
                    output: jsonData.usage.output_tokens || 0,
                    total: (jsonData.usage.input_tokens || 0) + (jsonData.usage.output_tokens || 0),
                    cache_read: jsonData.usage.cache_read_input_tokens || 0,
                    cache_creation: jsonData.usage.cache_creation_input_tokens || 0
                  }
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
            if (resultMessage.usage && resultMessage.wrapper?.tokens) {
              const accTotal = resultMessage.wrapper.tokens.total;
              const lastReq = resultMessage.wrapper.tokens.lastRequest;
              console.log(`   - Usage breakdown (this request):`);
              console.log(`     • input_tokens: ${lastReq?.input || 0}`);
              console.log(`     • output_tokens: ${lastReq?.output || 0}`);
              console.log(`     • cache_creation: ${lastReq?.cache_creation || 0} (billing only)`);
              console.log(`     • cache_read: ${lastReq?.cache_read || 0} (billing only)`);
              console.log(`     • ACCUMULATED CONTEXT: ${accTotal} / 200000 (${(accTotal/2000).toFixed(1)}%)`);
            }
            
            // Debug log the full resultMessage before emitting
            console.log(`📤 [EMIT-DEBUG] About to emit result message with wrapper field:`, {
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
          console.log(`⚠️ [${sessionId}] Failed to parse JSON, treating as plain text:`, e.message);
          console.log(`⚠️ [${sessionId}] Line was: ${line}`);
        }
      };

      // Add debugging for the spawned process
      console.log(`🔍 [${sessionId}] Process spawned with PID: ${claudeProcess.pid}`);
      console.log(`🔍 [${sessionId}] Process connected: ${claudeProcess.connected}`);
      
      // Capture stderr for debugging
      let stderrBuffer = '';
      claudeProcess.stderr.on('data', (chunk) => {
        const str = chunk.toString();
        stderrBuffer += str;
        console.error(`❌ [${sessionId}] STDERR output: ${str}`);
        
        // Check for common WSL errors
        if (str.includes('command not found') || str.includes('No such file')) {
          console.error(`❌ [${sessionId}] WSL PATH ERROR - Claude CLI not found!`);
          console.error(`❌ [${sessionId}] Full stderr: ${stderrBuffer}`);
        }
        if (str.includes('bash:') || str.includes('sh:')) {
          console.error(`❌ [${sessionId}] WSL BASH ERROR detected`);
        }
      });
      
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
        resetWatchdog(); // Reset watchdog on any data reception
        
        // Only log STDOUT summary for large outputs to reduce log spam
        if (str.length > 1000) {
          console.log(`📥 [${sessionId}] STDOUT: ${str.length} bytes (total: ${bytesReceived})`);
        }
        
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
        
        for (let i = 0; i < lines.length; i++) {
          processStreamLine(lines[i]);
        }
      });
      
      // Clean up buffer flush interval on process exit
      claudeProcess.on('exit', () => {
        clearInterval(bufferFlushInterval);
      });

      // Handle stderr
      claudeProcess.stderr.on('data', (data) => {
        const error = data.toString();
        console.error(`⚠️ [${sessionId}] Claude stderr (${data.length} bytes):`, error);
        lastDataTime = Date.now();
        
        // Check if this is a "No conversation found" error
        // NOTE: This is already handled in stdout handler, just log here
        if (error.includes('No conversation found with session ID')) {
          console.log(`🔄 [${sessionId}] Resume failed (stderr) - already handled in stdout`);
          if (session?.wasCompacted) {
            console.log(`🔄 This was expected - session was compacted and old ID is no longer valid`);
          }
          // Don't retry or emit errors - stdout handler already killed process and sent info
          return;
        } else if (error.includes('Error:') || error.includes('error:')) {
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
        // Clean stdin on exit
        if (claudeProcess.stdin && !claudeProcess.stdin.destroyed) {
          try {
            claudeProcess.stdin.end();
            console.log(`📝 Closed stdin on process exit`);
          } catch (e) {
            // Ignore errors on cleanup
          }
        }
        
        // Clean up watchdog timer
        if (watchdogTimerRef.timer) {
          clearTimeout(watchdogTimerRef.timer);
          watchdogTimerRef.timer = null;
          console.log(`🐕 Watchdog timer cleared on process exit`);
        }
        
        // Clean up Windows temp file if it exists
        if (windowsTempFileToCleanup) {
          try {
            const fs = require('fs');
            if (fs.existsSync(windowsTempFileToCleanup)) {
              fs.unlinkSync(windowsTempFileToCleanup);
              console.log(`🧹 Cleaned up Windows temp file: ${windowsTempFileToCleanup}`);
            }
          } catch (e) {
            console.warn(`⚠️ Failed to clean up temp file: ${e.message}`);
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

        // Clean up killed PID tracking now that process has fully exited
        if (claudeProcess && claudeProcess.pid) {
          killedProcessPIDs.delete(claudeProcess.pid);
        }

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

          // Check if stderr contains "No conversation found" - this was already handled in stdout
          // Just log it and clean up if somehow it wasn't caught earlier
          if (session && session.claudeSessionId && stderrBuffer.includes('No conversation found')) {
            console.log(`⚠️ [${sessionId}] Resume failed detected on exit (exit code 1)`);
            // Clear the invalid session ID if not already cleared
            session.claudeSessionId = null;
            session.isReady = true;
            // Don't send error result - already handled or just send simple info
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
        // Clean up Windows temp file on error
        if (windowsTempFileToCleanup) {
          try {
            const fs = require('fs');
            if (fs.existsSync(windowsTempFileToCleanup)) {
              fs.unlinkSync(windowsTempFileToCleanup);
              console.log(`🧹 Cleaned up Windows temp file on error: ${windowsTempFileToCleanup}`);
            }
          } catch (e) {
            console.warn(`⚠️ Failed to clean up temp file: ${e.message}`);
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
    const bashProcess = activeBashProcesses.get(sessionId);
    const session = sessions.get(sessionId);
    const isWindows = process.platform === 'win32';

    console.log(`⛔ Interrupt requested for session ${sessionId}`);

    // Helper function to force kill a process on Windows using taskkill
    const forceKillWindows = (pid) => {
      if (!pid) return;
      try {
        // Use taskkill with /F (force) and /T (tree - kill child processes too)
        require('child_process').execSync(`taskkill /F /T /PID ${pid}`, {
          stdio: 'ignore',
          timeout: 5000
        });
        console.log(`🛑 Force killed process tree for PID ${pid} using taskkill`);
      } catch (e) {
        console.log(`⚠️ taskkill failed for PID ${pid}: ${e.message}`);
      }
    };

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

    // Check for bash process first
    if (bashProcess) {
      console.log(`🛑 Killing bash process for session ${sessionId} (PID: ${bashProcess.pid})`);

      try {
        // Kill the bash process
        if (isWindows) {
          // On Windows, use taskkill to force kill the entire process tree
          forceKillWindows(bashProcess.pid);
          // Also try regular kill as backup
          try { bashProcess.kill(); } catch (e) {}
        } else if (bashProcess.pid) {
          try {
            process.kill(-bashProcess.pid, 'SIGTERM'); // Negative PID kills process group on Unix
          } catch (e) {
            // Fallback to regular kill
            bashProcess.kill('SIGTERM');
          }
        } else {
          bashProcess.kill('SIGTERM');
        }

        activeBashProcesses.delete(sessionId);

        // Send interrupted message
        socket.emit(`message:${sessionId}`, {
          type: 'system',
          subtype: 'interrupted',
          message: 'bash command interrupted by user',
          timestamp: Date.now()
        });

        // Send callback response so client knows interrupt completed
        if (callback) {
          callback({ success: true });
        }
      } catch (error) {
        console.error(`❌ Error killing bash process: ${error.message}`);
        if (callback) {
          callback({ success: false, error: error.message });
        }
      }
    } else if (claudeProcess) {
      console.log(`🛑 Killing claude process for session ${sessionId} (PID: ${claudeProcess.pid})`);

      // Kill the process
      if (isWindows) {
        // On Windows, use taskkill to force kill the entire process tree
        forceKillWindows(claudeProcess.pid);
        // Also try regular kill as backup
        try { claudeProcess.kill(); } catch (e) {}
      } else if (claudeProcess.pid) {
        try {
          process.kill(-claudeProcess.pid, 'SIGINT'); // Negative PID kills process group on Unix
        } catch (e) {
          // Fallback to regular kill
          claudeProcess.kill('SIGINT');
        }
      } else {
        claudeProcess.kill('SIGINT');
      }

      activeProcesses.delete(sessionId);
      activeProcessStartTimes.delete(sessionId);
      stoppedSessions.set(sessionId, true);  // Prevent buffered data from emitting

      // When user explicitly stops, prevent auto-resume by clearing session state
      // This ensures any new message starts a fresh Claude session, not a resume
      if (session) {
        session.wasInterrupted = false;  // Don't allow auto-resume
        session.claudeSessionId = null;  // Clear so next message starts fresh
        session.interruptedSessionId = null;  // Clear interrupted session too
        console.log(`🛑 Session ${sessionId} stopped by user - cleared session state to prevent auto-resume`);
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
      const isWindows = process.platform === 'win32';
      if (isWindows && claudeProcess.pid) {
        // On Windows, use taskkill to force kill the entire process tree
        try {
          require('child_process').execSync(`taskkill /F /T /PID ${claudeProcess.pid}`, {
            stdio: 'ignore',
            timeout: 5000
          });
        } catch (e) {
          console.log(`⚠️ taskkill failed: ${e.message}`);
        }
        try { claudeProcess.kill(); } catch (e) {}
      } else if (claudeProcess.pid) {
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
    lastAssistantMessageIds.delete(sessionId);  // Clear any tracked assistant message IDs
    stoppedSessions.delete(sessionId);  // Clear stopped flag so new messages can be processed

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
    stoppedSessions.delete(sessionId);  // Clean up stopped flag
    cancelPendingStreamingFalse(sessionId);  // Clean up pending streaming timers
    spawningProcesses.delete(sessionId);  // Clean up spawning state
    callback({ success: true });
  });

  // Checkpoint system implementation
  const checkpoints = new Map(); // Map of sessionId -> array of checkpoints
  const timelines = new Map();   // Map of sessionId -> timeline
  
  // Create checkpoint handler
  socket.on('create-checkpoint', async (data) => {
    const { sessionId, description, trigger = 'manual' } = data;
    console.log(`📸 Creating checkpoint for session ${sessionId}`);
    
    try {
      const session = sessions.get(sessionId);
      if (!session) {
        socket.emit('checkpoint-error', { 
          sessionId, 
          error: 'Session not found' 
        });
        return;
      }
      
      // Create checkpoint ID
      const checkpointId = `chk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Capture current state
      const checkpoint = {
        id: checkpointId,
        sessionId: sessionId,
        projectPath: session.projectPath || process.cwd(),
        parentId: timelines.get(sessionId)?.currentCheckpoint,
        createdAt: new Date().toISOString(),
        messageCount: session.messages ? session.messages.length : 0,
        metadata: {
          description: description,
          trigger: trigger,
          tokensUsed: session.tokenCount || 0,
          model: session.model || 'opus',
          messageIds: session.messages ? session.messages.map(m => m.id) : [],
        },
        fileSnapshots: [], // TODO: Implement file tracking
      };
      
      // Store checkpoint
      if (!checkpoints.has(sessionId)) {
        checkpoints.set(sessionId, []);
      }
      checkpoints.get(sessionId).push(checkpoint);
      
      // Update timeline
      if (!timelines.has(sessionId)) {
        timelines.set(sessionId, {
          sessionId: sessionId,
          rootCheckpoint: checkpointId,
          currentCheckpoint: checkpointId,
          checkpoints: new Map(),
          branches: [],
        });
      } else {
        const timeline = timelines.get(sessionId);
        timeline.currentCheckpoint = checkpointId;
        timeline.checkpoints.set(checkpointId, checkpoint);
      }
      
      // Save to disk (optional) - handle platform-specific paths
      const homeDir = process.platform === 'win32' 
        ? process.env.USERPROFILE || process.env.HOMEDRIVE + process.env.HOMEPATH
        : process.env.HOME || homedir();
      const checkpointDir = path.join(homeDir, '.yurucode', 'checkpoints', sessionId);
      if (!fs.existsSync(checkpointDir)) {
        fs.mkdirSync(checkpointDir, { recursive: true });
      }
      
      const checkpointFile = path.join(checkpointDir, `${checkpointId}.json`);
      fs.writeFileSync(checkpointFile, JSON.stringify(checkpoint, null, 2));
      
      console.log(`✅ Checkpoint created: ${checkpointId}`);
      socket.emit('checkpoint-created', { 
        sessionId, 
        checkpoint 
      });
      
    } catch (error) {
      console.error('❌ Checkpoint creation failed:', error);
      socket.emit('checkpoint-error', { 
        sessionId, 
        error: error.message 
      });
    }
  });

  // Restore checkpoint handler
  socket.on('restore-checkpoint', async (data) => {
    const { sessionId, checkpointId } = data;
    console.log(`⏮️ Restoring checkpoint ${checkpointId} for session ${sessionId}`);
    
    try {
      const sessionCheckpoints = checkpoints.get(sessionId);
      if (!sessionCheckpoints) {
        throw new Error('No checkpoints found for session');
      }
      
      const checkpoint = sessionCheckpoints.find(c => c.id === checkpointId);
      if (!checkpoint) {
        throw new Error('Checkpoint not found');
      }
      
      const session = sessions.get(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }
      
      // Restore messages up to checkpoint
      const restoredMessages = session.messages.filter(m => 
        checkpoint.metadata.messageIds.includes(m.id)
      );
      
      // Update session state
      session.messages = restoredMessages;
      session.tokenCount = checkpoint.metadata.tokensUsed;
      
      // Update timeline
      const timeline = timelines.get(sessionId);
      if (timeline) {
        timeline.currentCheckpoint = checkpointId;
      }
      
      console.log(`✅ Checkpoint restored: ${checkpointId}`);
      socket.emit('checkpoint-restored', { 
        sessionId, 
        checkpointId,
        messages: restoredMessages 
      });
      
    } catch (error) {
      console.error('❌ Checkpoint restoration failed:', error);
      socket.emit('checkpoint-error', { 
        sessionId, 
        error: error.message 
      });
    }
  });

  // Get timeline handler
  socket.on('get-timeline', async (data) => {
    const { sessionId } = data;
    
    const timeline = timelines.get(sessionId);
    const sessionCheckpoints = checkpoints.get(sessionId) || [];
    
    socket.emit('timeline-data', {
      sessionId,
      timeline: timeline || null,
      checkpoints: sessionCheckpoints,
    });
  });

  // Agent execution system implementation
  const agentRuns = new Map(); // Map of runId -> agent run data
  const activeAgents = new Map(); // Map of runId -> active process
  
  // Execute agent handler
  socket.on('execute-agent', async (data) => {
    const { 
      sessionId, 
      agentConfig,
      projectPath = process.cwd()
    } = data;
    
    console.log(`🤖 Executing agent for session ${sessionId}`);
    
    const runId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      // Create agent run record
      const agentRun = {
        id: runId,
        sessionId: sessionId,
        status: 'starting',
        config: agentConfig,
        projectPath: projectPath,
        startTime: new Date().toISOString(),
        endTime: null,
        output: [],
        metrics: {
          messagesProcessed: 0,
          tokensUsed: 0,
          toolsExecuted: 0,
          errors: 0,
        },
      };
      
      agentRuns.set(runId, agentRun);
      
      // Build Claude command with agent configuration
      const args = [
        '--output-format', 'stream-json',
        '--verbose',
        '--print',
      ];
      
      // Add model if specified
      if (agentConfig.model) {
        args.push('--model', agentConfig.model);
      }
      
      // Add system prompt if provided
      let systemPrompt = agentConfig.systemPrompt || '';
      if (agentConfig.task) {
        systemPrompt = `${systemPrompt}\n\nTask: ${agentConfig.task}`;
      }
      
      // Spawn Claude process for agent - handle platform differences
      const spawnArgs = [...args];
      console.log(`🚀 Spawning agent process: claude ${spawnArgs.join(' ')}`);
      
      // Determine Claude path based on platform
      const isWindows = process.platform === 'win32';
      const isWSL = process.platform === 'linux' && fs.existsSync('/mnt/c');
      const actualClaudePath = isWindows ? 
        (claudePath.endsWith('.cmd') ? claudePath : `${claudePath}.cmd`) :
        claudePath;
      
      const agentProcess = spawn(actualClaudePath, spawnArgs, {
        cwd: projectPath,
        env: { ...process.env },
        shell: isWindows, // Use shell on Windows for .cmd files
      });
      
      activeAgents.set(runId, agentProcess);
      agentRun.status = 'running';
      
      // Send initial message with system prompt
      if (systemPrompt) {
        agentProcess.stdin.write(systemPrompt + '\n');
      }
      
      // Handle agent output
      let outputBuffer = '';
      agentProcess.stdout.on('data', (chunk) => {
        outputBuffer += chunk.toString();
        const lines = outputBuffer.split('\n');
        outputBuffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line);
              
              // Update metrics
              agentRun.metrics.messagesProcessed++;
              
              // Track tool usage
              if (parsed.type === 'tool_use') {
                agentRun.metrics.toolsExecuted++;
              }
              
              // Track token usage
              if (parsed.type === 'result' && parsed.usage) {
                agentRun.metrics.tokensUsed += (parsed.usage.output_tokens || 0);
              }
              
              // Store output
              agentRun.output.push({
                timestamp: new Date().toISOString(),
                data: parsed,
              });
              
              // Emit progress update
              socket.emit('agent-progress', {
                runId,
                sessionId,
                data: parsed,
                metrics: agentRun.metrics,
              });
              
            } catch (e) {
              console.error('Failed to parse agent output:', e);
              agentRun.metrics.errors++;
            }
          }
        }
      });
      
      // Handle agent errors
      agentProcess.stderr.on('data', (chunk) => {
        const error = chunk.toString();
        console.error(`❌ Agent error: ${error}`);
        agentRun.metrics.errors++;
        
        socket.emit('agent-error', {
          runId,
          sessionId,
          error: error,
        });
      });
      
      // Handle agent completion
      agentProcess.on('close', (code) => {
        console.log(`✅ Agent completed with code ${code}`);
        
        agentRun.status = code === 0 ? 'completed' : 'failed';
        agentRun.endTime = new Date().toISOString();
        
        activeAgents.delete(runId);
        
        socket.emit('agent-completed', {
          runId,
          sessionId,
          status: agentRun.status,
          metrics: agentRun.metrics,
        });
        
        // Auto-create checkpoint after agent run if configured
        if (agentConfig.createCheckpoint) {
          const checkpointData = {
            sessionId: sessionId,
            description: `Agent run: ${agentConfig.name || runId}`,
            trigger: 'auto',
          };
          socket.emit('create-checkpoint', checkpointData);
        }
      });
      
      socket.emit('agent-started', {
        runId,
        sessionId,
        config: agentConfig,
      });
      
    } catch (error) {
      console.error('❌ Agent execution failed:', error);
      socket.emit('agent-error', {
        runId,
        sessionId,
        error: error.message,
      });
    }
  });
  
  // Stop agent handler
  socket.on('stop-agent', async (data) => {
    const { runId } = data;
    console.log(`⏹️ Stopping agent ${runId}`);
    
    const agentProcess = activeAgents.get(runId);
    if (agentProcess) {
      agentProcess.kill('SIGINT');
      activeAgents.delete(runId);
      
      const agentRun = agentRuns.get(runId);
      if (agentRun) {
        agentRun.status = 'stopped';
        agentRun.endTime = new Date().toISOString();
      }
      
      socket.emit('agent-stopped', { runId });
    } else {
      socket.emit('agent-error', {
        runId,
        error: 'Agent not found or already stopped',
      });
    }
  });
  
  // Get agent runs handler
  socket.on('get-agent-runs', async (data) => {
    const { sessionId } = data;
    
    const sessionRuns = Array.from(agentRuns.values())
      .filter(run => run.sessionId === sessionId);
    
    socket.emit('agent-runs-data', {
      sessionId,
      runs: sessionRuns,
    });
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
        
        const claudeProcess = activeProcesses.get(sessionId);
        if (claudeProcess) {
          console.log(`🧹 Cleaning up process for session ${sessionId} (PID: ${claudeProcess.pid})`);
          const isWindows = process.platform === 'win32';
          if (isWindows && claudeProcess.pid) {
            try {
              require('child_process').execSync(`taskkill /F /T /PID ${claudeProcess.pid}`, {
                stdio: 'ignore',
                timeout: 5000
              });
            } catch (e) {}
            try { claudeProcess.kill(); } catch (e) {}
          } else if (claudeProcess.pid) {
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
        cancelPendingStreamingFalse(sessionId);  // Clean up pending streaming timers
        spawningProcesses.delete(sessionId);  // Clean up spawning state
      }
    }
  });
});

// Clean up old PID files on startup
function cleanupOldPidFiles() {
  try {
    const pidPattern = /^(\.yurucode-)?server-\d+\.pid$/;
    
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
    const yurucodeServerDir = join(tmpDir, 'yurucode-server');
    if (fs.existsSync(yurucodeServerDir)) {
      const tmpFiles = fs.readdirSync(yurucodeServerDir);
      tmpFiles.forEach(file => {
        if (pidPattern.test(file)) {
          const fullPath = join(yurucodeServerDir, file);
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
  
  // Skip bash warmup - not needed with exec()
  console.log('✅ Server ready for bash commands');
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
