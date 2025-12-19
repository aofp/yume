/**
 * Integration patch for server-claude-macos.js
 * 
 * This shows the exact changes needed to integrate ClaudeCompactWrapperV2
 * as the source of truth for all token information.
 * 
 * INSTRUCTIONS:
 * 1. Add the import at the top of server-claude-macos.js
 * 2. Replace the sendMessage handler
 * 3. The wrapper will handle all token tracking and summary generation
 */

// ============================================
// ADD THIS AT THE TOP OF server-claude-macos.js
// ============================================

import ClaudeCompactWrapperV2 from './scripts/claude-compact-wrapper-v2.js';

// Create wrapper instance - this is our token truth source
const tokenWrapper = new ClaudeCompactWrapperV2({
  maxTokens: 200000,
  enabled: true,
  debug: process.env.CLAUDE_WRAPPER_DEBUG === 'true',
  compactThreshold: 192000
});

// Track wrapper sessions by socket session
const wrapperSessions = new Map();

// ============================================
// REPLACE THE sendMessage HANDLER WITH THIS:
// ============================================

socket.on('sendMessage', async (data) => {
  const { message, sessionId, model, claudeSessionId, isResume } = data;
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📨 [${sessionId}] Received message request`);
  console.log(`   Message: "${message?.substring(0, 50)}${message?.length > 50 ? '...' : ''}"`);
  console.log(`   Model: ${model || 'default'}`);
  console.log(`   Claude Session: ${claudeSessionId || 'none'}`);
  console.log(`${'='.repeat(60)}\n`);
  
  // Initialize session if needed
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      messages: [],
      claudeSessionId: null,
      tempId: sessionId,
      activeModel: model || 'claude-sonnet-4-5-20250929',
      streaming: false,
      lastAssistantMessageIds: [],
      wasCompacted: false
    });
  }
  
  const session = sessions.get(sessionId);
  
  // Set wrapper's current session
  tokenWrapper.currentSessionId = sessionId;
  
  // Store user message in wrapper for summary generation
  tokenWrapper.storeMessage('user', { content: message });
  
  // Add to session history
  session.messages.push({
    role: 'user',
    message: { content: message, role: 'human' },
    timestamp: Date.now()
  });
  
  try {
    const claudePath = findClaudePath();
    if (!claudePath) {
      throw new Error('Claude CLI not found');
    }
    
    // Build args
    const args = [
      '--output-format', 'stream-json',
      '--verbose'
    ];
    
    // Model selection
    if (message && message.trim() === '/compact') {
      args.push('--model', 'claude-sonnet-4-5-20250929');
    } else if (model) {
      args.push('--model', model);
    }
    
    // Resume if we have session
    if (session.claudeSessionId && !session.wasCompacted) {
      args.push('--resume', session.claudeSessionId);
    }
    
    // Spawn Claude
    const claudeProcess = spawn(claudePath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
      ...(data.workingDir && { cwd: data.workingDir })
    });
    
    // Process output through wrapper for token tracking
    const rl = readline.createInterface({
      input: claudeProcess.stdout,
      crlfDelay: Infinity
    });
    
    rl.on('line', (line) => {
      if (!line.trim()) return;
      
      // CRITICAL: Process through wrapper for token tracking
      const augmentedLine = tokenWrapper.processStreamLine(line);
      
      try {
        const augmentedData = JSON.parse(augmentedLine);
        
        // Extract session ID if present
        if (augmentedData.session_id && !session.wasCompacted) {
          session.claudeSessionId = augmentedData.session_id;
          console.log(`🔑 [${sessionId}] Session ID: ${augmentedData.session_id}`);
        }
        
        // Handle streaming state
        if (augmentedData.type === 'message_start') {
          session.streaming = true;
        } else if (augmentedData.type === 'message_stop' || augmentedData.type === 'result') {
          session.streaming = false;
        }
        
        // Check for compact completion
        if (augmentedData.wrapper_compact_summary) {
          console.log(`🗜️ [${sessionId}] Compact completed - summary generated`);
          session.wasCompacted = true;
          session.claudeSessionId = null; // Reset for fresh start
        }
        
        // IMPORTANT: Send token state separately for UI updates
        if (augmentedData.wrapper_token_state) {
          socket.emit(`token-state:${sessionId}`, {
            type: 'token-update',
            data: augmentedData.wrapper_token_state,
            timestamp: Date.now()
          });
        }
        
        // Send the augmented message
        socket.emit(`message:${sessionId}`, augmentedData);
        
      } catch (e) {
        console.error('Failed to parse augmented line:', e);
        // Send original if parsing fails
        socket.emit(`message:${sessionId}`, { type: 'text', text: line });
      }
    });
    
    // Handle stderr
    claudeProcess.stderr.on('data', (data) => {
      console.error(`[CLAUDE STDERR] ${data}`);
    });
    
    // Send message
    claudeProcess.stdin.write(message + '\n');
    claudeProcess.stdin.end();
    
    // Handle completion
    await new Promise((resolve, reject) => {
      claudeProcess.on('close', (code) => {
        console.log(`✅ [${sessionId}] Claude process completed with code ${code}`);
        resolve(code);
      });
      
      claudeProcess.on('error', (err) => {
        console.error(`❌ [${sessionId}] Claude process error:`, err);
        reject(err);
      });
    });
    
  } catch (error) {
    console.error(`❌ [${sessionId}] Error:`, error);
    
    socket.emit(`message:${sessionId}`, {
      type: 'error',
      error: error.message,
      timestamp: Date.now()
    });
  }
});

// ============================================
// ADD THESE NEW ENDPOINTS:
// ============================================

// Get current token state
socket.on('getTokenState', (sessionId, callback) => {
  tokenWrapper.currentSessionId = sessionId;
  const state = tokenWrapper.getCompleteTokenState();
  callback(state);
});

// Get wrapper statistics
socket.on('getWrapperStats', (callback) => {
  const stats = tokenWrapper.getStats();
  callback(stats);
});

// Manual compact trigger
socket.on('triggerCompact', async (data) => {
  const { sessionId } = data;
  console.log(`Manual compact triggered for session ${sessionId}`);
  
  // Send /compact command
  socket.emit('sendMessage', {
    message: '/compact',
    sessionId,
    model: 'claude-sonnet-4-5-20250929'
  });
});

// ============================================
// UPDATE FRONTEND TO USE TOKEN STATE:
// ============================================

/*
In your frontend (claudeCodeStore.ts), listen for token-state events:

socket.on(`token-state:${sessionId}`, (data) => {
  const state = data.data;
  
  // Update session with token info
  session.tokenState = state;
  session.tokenPercentage = state.usage.percentage;
  session.tokenDisplay = state.usage.tokens_used_display;
  
  // Update UI
  updateTokenDisplay(state);
});

// Display in UI:
<div className="token-display">
  <div className="token-bar" style={{width: `${tokenState.usage.percentage * 100}%`}} />
  <span>{tokenState.usage.tokens_used_display} ({tokenState.usage.percentage_display})</span>
</div>
*/