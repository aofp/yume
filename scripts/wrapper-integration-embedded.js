/**
 * Wrapper Integration Module for Embedded Server
 * 
 * This code should be added to the embedded server in logged_server.rs
 * It provides seamless integration with the claude-process-wrapper
 * 
 * INTEGRATION STEPS:
 * 1. Add this code after the require statements in EMBEDDED_SERVER
 * 2. Replace the spawn logic with wrapper spawn
 * 3. Handle wrapper events for enhanced tracking
 */

// ============================================
// ADD THIS AFTER THE REQUIRE STATEMENTS
// ============================================

// Try to load the universal wrapper
let UniversalClaudeWrapper;
let wrapperInstance = null;

// Attempt to load wrapper from multiple locations
const wrapperPaths = [
  path.join(__dirname, 'claude-process-wrapper.js'),
  path.join(__dirname, '../scripts/claude-process-wrapper.js'),
  path.join(process.cwd(), 'scripts/claude-process-wrapper.js'),
  './claude-process-wrapper.js',
  '/tmp/yurucode-server/claude-process-wrapper.js'
];

for (const wrapperPath of wrapperPaths) {
  try {
    if (fs.existsSync(wrapperPath)) {
      UniversalClaudeWrapper = require(wrapperPath);
      console.log(`✅ Loaded wrapper from: ${wrapperPath}`);
      break;
    }
  } catch (e) {
    // Continue trying other paths
  }
}

// Initialize wrapper if found
if (UniversalClaudeWrapper) {
  try {
    wrapperInstance = new UniversalClaudeWrapper({
      enabled: true,
      debug: process.env.WRAPPER_DEBUG === 'true',
      maxTokens: 100000,
      captureAll: true,
      augmentStream: true,
      trackTokens: true,
      compactThreshold: 75000
    });
    
    console.log('✅ Universal Claude Wrapper initialized');
    
    // Set up event handlers to forward data to frontend
    wrapperInstance.on('tokens-updated', (data) => {
      if (io) {
        io.emit(`wrapper:tokens:${data.sessionId}`, data);
      }
    });
    
    wrapperInstance.on('api-response', (data) => {
      if (io) {
        // Store API responses for debugging
        if (!global.wrapperApiResponses) {
          global.wrapperApiResponses = new Map();
        }
        if (!global.wrapperApiResponses.has(data.sessionId)) {
          global.wrapperApiResponses.set(data.sessionId, []);
        }
        global.wrapperApiResponses.get(data.sessionId).push(data.response);
        
        // Keep last 50 responses per session
        const responses = global.wrapperApiResponses.get(data.sessionId);
        if (responses.length > 50) {
          responses.shift();
        }
      }
    });
    
    wrapperInstance.on('compaction', (data) => {
      if (io) {
        io.emit(`wrapper:compaction:${data.sessionId}`, {
          type: 'system',
          subtype: 'compaction',
          message: `Conversation compacted. Saved ${data.savedTokens} tokens.`,
          summary: data.summary,
          timestamp: Date.now()
        });
      }
    });
    
    wrapperInstance.on('process-error', (data) => {
      console.error(`⚠️ Wrapper process error for ${data.sessionId}:`, data.error);
    });
    
    wrapperInstance.on('health', (data) => {
      // Health check - can be used for monitoring
      if (process.env.WRAPPER_DEBUG === 'true') {
        console.log(`💚 Health check for ${data.sessionId}: PID ${data.pid}, uptime ${data.uptime}ms`);
      }
    });
    
  } catch (e) {
    console.error('⚠️ Failed to initialize wrapper:', e);
    wrapperInstance = null;
  }
} else {
  console.log('⚠️ Universal wrapper not found - using direct spawn');
}

// ============================================
// REPLACE THE SPAWN LOGIC IN sendMessage
// ============================================

// FIND THIS SECTION (around line 450-500):
// const claudeProcess = isWSL ? (() => { ... })() : spawn(CLAUDE_PATH, args, spawnOptions);

// REPLACE WITH:
let claudeProcess;

if (wrapperInstance) {
  // Use wrapper for enhanced tracking
  console.log(`🎯 Using Universal Wrapper for session ${sessionId}`);
  
  try {
    // Configure wrapper for this session
    wrapperInstance.currentSessionId = sessionId;
    
    // Spawn with wrapper
    claudeProcess = await wrapperInstance.spawnClaude(args, {
      sessionId: sessionId,
      cwd: workingDir,
      env: enhancedEnv
    });
    
    // The wrapper handles all stream processing and augmentation
    // We just need to handle the augmented output
    
    // Store reference for cleanup
    if (!global.wrapperProcesses) {
      global.wrapperProcesses = new Map();
    }
    global.wrapperProcesses.set(sessionId, claudeProcess);
    
    console.log(`✅ Wrapper spawn successful for ${sessionId}, PID: ${claudeProcess.pid}`);
    
  } catch (e) {
    console.error(`❌ Wrapper spawn failed for ${sessionId}:`, e);
    // Fall back to direct spawn
    claudeProcess = isWSL ? (() => {
      const wslCommand = 'wsl.exe';
      const wslArgs = ['-e', 'bash', '-c', `cd "${workingDir}" && "${CLAUDE_PATH}" ${args.map(arg => `"${arg}"`).join(' ')}`];
      const process = spawn(wslCommand, wslArgs, spawnOptions);
      process.inputHandled = inputHandled;
      return process;
    })() : spawn(CLAUDE_PATH, args, spawnOptions);
  }
  
} else {
  // Fallback to original spawn logic
  claudeProcess = isWSL ? (() => {
    const wslCommand = 'wsl.exe';
    const wslArgs = ['-e', 'bash', '-c', `cd "${workingDir}" && "${CLAUDE_PATH}" ${args.map(arg => `"${arg}"`).join(' ')}`];
    const process = spawn(wslCommand, wslArgs, spawnOptions);
    process.inputHandled = inputHandled;
    return process;
  })() : spawn(CLAUDE_PATH, args, spawnOptions);
}

// ============================================
// ADD WRAPPER STATS ENDPOINT
// ============================================

// Add this to your socket.io event handlers:
socket.on('wrapper:get-stats', (sessionId, callback) => {
  if (wrapperInstance) {
    const stats = sessionId 
      ? wrapperInstance.getSessionStats(sessionId)
      : wrapperInstance.getAllStats();
    callback({ success: true, stats });
  } else {
    callback({ success: false, error: 'Wrapper not available' });
  }
});

socket.on('wrapper:get-api-responses', (sessionId, callback) => {
  if (global.wrapperApiResponses && global.wrapperApiResponses.has(sessionId)) {
    callback({ 
      success: true, 
      responses: global.wrapperApiResponses.get(sessionId) 
    });
  } else {
    callback({ success: false, error: 'No API responses found' });
  }
});

socket.on('wrapper:export-session', (sessionId, callback) => {
  if (wrapperInstance) {
    const data = wrapperInstance.exportSessionData(sessionId);
    callback({ success: true, data });
  } else {
    callback({ success: false, error: 'Wrapper not available' });
  }
});

// ============================================
// CLEANUP ON DISCONNECT
// ============================================

// Add this to the disconnect handler:
socket.on('disconnect', () => {
  console.log('Client disconnected');
  
  // Clean up wrapper processes if any
  if (global.wrapperProcesses) {
    for (const [sessionId, process] of global.wrapperProcesses) {
      if (process && !process.killed) {
        console.log(`Cleaning up wrapper process for ${sessionId}`);
        process.kill('SIGTERM');
      }
    }
    global.wrapperProcesses.clear();
  }
  
  // Clean up wrapper sessions
  if (wrapperInstance) {
    for (const sessionId of activeProcesses.keys()) {
      wrapperInstance.killProcess(sessionId);
    }
  }
});

// ============================================
// SERVER SHUTDOWN HANDLER
// ============================================

// Add proper cleanup on server shutdown:
process.on('SIGTERM', () => {
  console.log('Server shutting down...');
  
  if (wrapperInstance) {
    const stats = wrapperInstance.getAllStats();
    console.log('Wrapper final stats:', stats);
  }
  
  if (global.wrapperProcesses) {
    for (const [sessionId, process] of global.wrapperProcesses) {
      if (process && !process.killed) {
        process.kill('SIGTERM');
      }
    }
  }
  
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// ============================================
// DEBUGGING HELPER
// ============================================

// Add this for debugging wrapper state:
if (process.env.WRAPPER_DEBUG === 'true') {
  setInterval(() => {
    if (wrapperInstance) {
      const stats = wrapperInstance.getAllStats();
      console.log('📊 Wrapper Stats:', {
        sessions: stats.sessions.length,
        activeProcesses: stats.activeProcesses,
        totalMessages: stats.global.totalMessages,
        totalTokens: stats.global.totalTokens
      });
    }
  }, 30000); // Every 30 seconds
}