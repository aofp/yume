/**
 * Quick integration script to add wrapper support to server-claude-macos.js
 * 
 * This adds minimal changes to make the wrapper work with the existing server
 */

// Add this at the top of server-claude-macos.js after the imports:

// Load the compact wrapper if available
let ClaudeCompactWrapper;
try {
  // Try to load wrapper from scripts directory
  ClaudeCompactWrapper = await import('./scripts/claude-compact-wrapper.js');
  ClaudeCompactWrapper = ClaudeCompactWrapper.default || ClaudeCompactWrapper;
  console.log('✅ Compact wrapper loaded');
} catch (e) {
  console.log('⚠️ Compact wrapper not found - using direct spawn');
}

// Create wrapper instance if available
let wrapperInstance = null;
if (ClaudeCompactWrapper) {
  wrapperInstance = new ClaudeCompactWrapper({
    enabled: true,
    auto: true,
    threshold: 75000,
    thresholdPercent: 0.75,
    cooldown: 300000,
    debug: process.env.CLAUDE_COMPACT_DEBUG === 'true',
    showNotifications: true
  });
  
  // Setup event forwarding to frontend
  wrapperInstance.on('token-update', (data) => {
    if (io) {
      io.emit(`compact:token-update:${data.sessionId}`, data);
    }
  });
  
  wrapperInstance.on('compact-start', (data) => {
    if (io) {
      io.emit(`compact:start:${data.sessionId}`, {
        type: 'system',
        subtype: 'compact-start',
        message: 'Auto-compacting conversation...',
        data
      });
    }
  });
  
  wrapperInstance.on('compact-complete', (data) => {
    if (io) {
      io.emit(`compact:complete:${data.sessionId}`, {
        type: 'system',
        subtype: 'compact-complete',
        message: `Saved ${data.saved} tokens (${data.percentage}% reduction)`,
        data
      });
    }
  });
}

// Then modify the spawn section in sendMessage handler:
// FIND this line (around line 300-400):
// const claudeProcess = spawn(commandToUse, argsToUse, {

// REPLACE with:
let claudeProcess;
if (wrapperInstance) {
  // Use wrapper if available
  wrapperInstance.currentSessionId = sessionId;
  
  // Ensure session state exists
  if (!wrapperInstance.sessions.has(sessionId)) {
    wrapperInstance.sessions.set(sessionId, wrapperInstance.createSessionState());
  }
  
  // Parse args for wrapper
  wrapperInstance.parseArguments(args);
  
  // Spawn with wrapper (it will monitor tokens)
  claudeProcess = await wrapperInstance.spawnClaude(args);
} else {
  // Fallback to direct spawn
  claudeProcess = spawn(commandToUse, argsToUse, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
    ...(workingDir && { cwd: workingDir })
  });
}

// The rest of the code remains the same - the wrapper's stream processing
// will augment messages with token data automatically