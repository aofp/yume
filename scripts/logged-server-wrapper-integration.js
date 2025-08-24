/**
 * Integration code for logged_server.rs
 * 
 * This shows how to modify the embedded server in logged_server.rs
 * to use the ClaudeCompactWrapper instead of direct spawning.
 * 
 * IMPORTANT: This code needs to be embedded in logged_server.rs
 * replacing the existing spawn logic.
 */

// Add this at the top of the embedded server code in logged_server.rs
const ClaudeCompactWrapper = require('./claude-compact-wrapper.js');

// Configuration that can be passed from Rust
const wrapperConfig = {
  enabled: true,
  auto: true,
  threshold: 75000,
  thresholdPercent: 0.75,
  cooldown: 300000,
  model: 'claude-3-5-sonnet-20241022',
  debug: process.env.CLAUDE_COMPACT_DEBUG === 'true',
  showNotifications: true,
  showTokenUsage: true,
  showSavings: true
};

// Create a singleton wrapper instance
let wrapperInstance = null;

function getWrapper() {
  if (!wrapperInstance) {
    wrapperInstance = new ClaudeCompactWrapper(wrapperConfig);
    
    // Setup event listeners for UI updates
    wrapperInstance.on('token-update', (data) => {
      // Send to frontend via Socket.IO
      if (io) {
        io.emit(`compact:token-update:${data.sessionId}`, data);
      }
    });
    
    wrapperInstance.on('compact-start', (data) => {
      // Send to frontend
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
      // Send to frontend
      if (io) {
        io.emit(`compact:complete:${data.sessionId}`, {
          type: 'system',
          subtype: 'compact-complete',
          message: `Compact complete! Saved ${data.saved} tokens (${data.percentage}% reduction)`,
          data
        });
      }
    });
    
    wrapperInstance.on('error', (error) => {
      console.error('[WRAPPER ERROR]', error);
    });
  }
  
  return wrapperInstance;
}

// REPLACE THE EXISTING sendMessage HANDLER with this:
socket.on('sendMessage', async (data) => {
  const { message, sessionId, model, claudeSessionId, isResume } = data;
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📨 [${sessionId}] Received message request`);
  console.log(`   Message: "${message?.substring(0, 50)}${message?.length > 50 ? '...' : ''}"`);
  console.log(`   Model: ${model || 'default'}`);
  console.log(`   Claude Session: ${claudeSessionId || 'none'}`);
  console.log(`   Resume: ${isResume}`);
  console.log(`${'='.repeat(60)}\n`);
  
  // Store session data
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      messages: [],
      claudeSessionId: null,
      tempId: sessionId,
      activeModel: model || 'claude-3-5-sonnet-20241022',
      streaming: false,
      lastAssistantMessageIds: [],
      wasCompacted: false // Track compacted sessions
    });
  }
  
  const session = sessions.get(sessionId);
  
  // Check if session was compacted and clear old ID
  if (session.wasCompacted && claudeSessionId) {
    console.log(`🗜️ Ignoring old session ID ${claudeSessionId} - session was compacted`);
    session.claudeSessionId = null;
  } else if (claudeSessionId && !session.wasCompacted) {
    session.claudeSessionId = claudeSessionId;
  }
  
  // Add user message to history
  session.messages.push({
    role: 'user',
    message: { content: message, role: 'human' },
    timestamp: Date.now()
  });
  
  try {
    // Find Claude binary path
    const claudePath = findClaudePath();
    if (!claudePath) {
      throw new Error('Claude CLI not found');
    }
    
    // Build command arguments
    const args = [
      '--output-format', 'stream-json',
      '--verbose'
    ];
    
    // Force sonnet for /compact command
    if (message && message.trim() === '/compact') {
      args.push('--model', 'claude-3-5-sonnet-20241022');
      console.log(`🤖 Using model: claude-3-5-sonnet-20241022 (forced for /compact)`);
    } else if (model) {
      args.push('--model', model);
      console.log(`🤖 Using model: ${model}`);
    }
    
    // Add resume flag if we have a session
    if (session.claudeSessionId) {
      args.push('--resume', session.claudeSessionId);
      console.log(`📂 Resuming session: ${session.claudeSessionId}`);
    }
    
    // USE THE WRAPPER INSTEAD OF DIRECT SPAWN
    const wrapper = getWrapper();
    
    // Create a custom spawn function for the wrapper
    const spawnWithWrapper = async () => {
      return new Promise((resolve, reject) => {
        // The wrapper will handle the actual spawn
        const claudeProcess = wrapper.spawnClaude(args);
        
        // Set up stream processing
        const rl = readline.createInterface({
          input: claudeProcess.stdout,
          crlfDelay: Infinity
        });
        
        let buffer = '';
        let messageCount = 0;
        
        rl.on('line', (line) => {
          buffer += line + '\n';
          
          if (line.trim()) {
            try {
              const jsonData = JSON.parse(line);
              
              // Process the message
              processClaudeMessage(jsonData, sessionId, session);
              
              // Send to client
              socket.emit(`message:${sessionId}`, jsonData);
              
              messageCount++;
            } catch (e) {
              console.error('Failed to parse JSON:', e);
            }
          }
        });
        
        // Handle stderr
        claudeProcess.stderr.on('data', (data) => {
          console.error(`[CLAUDE STDERR] ${data}`);
        });
        
        // Send the message
        claudeProcess.stdin.write(message + '\n');
        claudeProcess.stdin.end();
        
        // Handle completion
        claudeProcess.on('close', (code) => {
          if (code === 0) {
            resolve({ success: true, messageCount });
          } else {
            reject(new Error(`Claude process exited with code ${code}`));
          }
        });
        
        claudeProcess.on('error', (err) => {
          reject(err);
        });
      });
    };
    
    // Execute with wrapper
    const result = await spawnWithWrapper();
    
    console.log(`✅ [${sessionId}] Message processing complete`);
    console.log(`   Messages sent: ${result.messageCount}`);
    
  } catch (error) {
    console.error(`❌ [${sessionId}] Error:`, error);
    
    socket.emit(`message:${sessionId}`, {
      type: 'error',
      error: error.message,
      timestamp: Date.now()
    });
  }
});

// Helper function to process Claude messages
function processClaudeMessage(jsonData, sessionId, session) {
  // Extract session ID if present
  if (jsonData.session_id) {
    const lastUserMessage = session?.messages?.filter(m => m.role === 'user').pop();
    const isCompactCommand = lastUserMessage?.message?.content?.trim() === '/compact';
    const isCompactResult = isCompactCommand && jsonData.type === 'result';
    
    if (!isCompactResult) {
      session.claudeSessionId = jsonData.session_id;
      console.log(`🔑 [${sessionId}] Extracted Claude session ID: ${jsonData.session_id}`);
    } else {
      console.log(`🗜️ [${sessionId}] Compact result - not storing session ID`);
      session.claudeSessionId = null;
      session.wasCompacted = true;
    }
  }
  
  // Track streaming state
  if (jsonData.type === 'message_start') {
    session.streaming = true;
    session.lastAssistantMessageIds = [];
  } else if (jsonData.type === 'message_stop') {
    session.streaming = false;
  } else if (jsonData.type === 'result') {
    session.streaming = false;
  }
  
  // Store assistant messages
  if (jsonData.type === 'content_block_delta' && jsonData.delta?.text) {
    // Track assistant message IDs for proper cleanup
    if (!session.lastAssistantMessageIds.includes(jsonData.index)) {
      session.lastAssistantMessageIds.push(jsonData.index);
    }
  }
}

// ADD THIS CONFIGURATION ENDPOINT for the frontend
socket.on('getCompactConfig', (callback) => {
  const wrapper = getWrapper();
  const config = wrapper.config;
  const stats = wrapper.getStats();
  
  callback({
    config,
    stats,
    enabled: config.enabled,
    auto: config.auto,
    threshold: config.threshold,
    maxTokens: config.maxTokens
  });
});

// ADD THIS CONTROL ENDPOINT
socket.on('setCompactConfig', (newConfig) => {
  const wrapper = getWrapper();
  
  // Update wrapper configuration
  Object.assign(wrapper.config, newConfig);
  
  console.log('Compact configuration updated:', newConfig);
  
  // Send confirmation
  socket.emit('compact:config-updated', wrapper.config);
});

// ADD THIS MANUAL TRIGGER ENDPOINT
socket.on('triggerCompact', async (data) => {
  const { sessionId } = data;
  const wrapper = getWrapper();
  
  console.log(`Manual compact triggered for session ${sessionId}`);
  
  try {
    await wrapper.triggerAutoCompact();
    socket.emit(`compact:manual-complete:${sessionId}`, {
      success: true,
      message: 'Manual compact completed successfully'
    });
  } catch (error) {
    socket.emit(`compact:manual-error:${sessionId}`, {
      success: false,
      error: error.message
    });
  }
});

// Export for testing
module.exports = {
  getWrapper,
  wrapperConfig
};