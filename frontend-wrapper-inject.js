/**
 * Frontend Wrapper Injection
 * 
 * Since Rust bypasses our server wrapper, we need to intercept
 * messages in the frontend where they arrive.
 * 
 * Add this to the frontend code that receives Claude messages.
 */

// Wrapper state
const wrapperState = {
  sessions: new Map()
};

function getWrapperSession(sessionId) {
  if (!wrapperState.sessions.has(sessionId)) {
    wrapperState.sessions.set(sessionId, {
      id: sessionId,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      messageCount: 0,
      compactCount: 0,
      wasCompacted: false,
      tokensSaved: 0
    });
    console.log(`✅ [WRAPPER] Created session: ${sessionId}`);
  }
  return wrapperState.sessions.get(sessionId);
}

function processWrapperMessage(message, sessionId) {
  const session = getWrapperSession(sessionId);
  
  // Parse if string
  let data = typeof message === 'string' ? JSON.parse(message) : message;
  
  // Log API response
  console.log(`📡 [WRAPPER] API ${data.type}`);
  
  // Track messages
  if (data.type === 'user' || data.type === 'assistant') {
    session.messageCount++;
  }
  
  // Update tokens if usage present
  if (data.usage) {
    const input = data.usage.input_tokens || 0;
    const output = data.usage.output_tokens || 0;
    const cacheCreation = data.usage.cache_creation_input_tokens || 0;
    
    session.inputTokens += input + cacheCreation;
    session.outputTokens += output;
    
    const prevTotal = session.totalTokens;
    session.totalTokens = session.inputTokens + session.outputTokens;
    
    const delta = session.totalTokens - prevTotal;
    console.log(`📊 [WRAPPER] TOKENS +${delta} → ${session.totalTokens}/100000 (${Math.round(session.totalTokens/1000)}%)`);
  }
  
  // Detect compaction
  if (data.type === 'result' && data.result === '' && 
      (!data.usage || (data.usage.input_tokens === 0 && data.usage.output_tokens === 0))) {
    
    const savedTokens = session.totalTokens;
    console.log(`🗜️ [WRAPPER] COMPACTION DETECTED! Saved ${savedTokens} tokens`);
    
    session.compactCount++;
    session.wasCompacted = true;
    session.tokensSaved += savedTokens;
    
    // Reset tokens
    session.inputTokens = 0;
    session.outputTokens = 0;
    session.totalTokens = 0;
    
    // Generate summary
    data.result = `✅ Conversation compacted successfully!
    
📊 Compaction Summary:
• Tokens saved: ${savedTokens}
• Messages compressed: ${session.messageCount}
• Total saved so far: ${session.tokensSaved}

✨ Context reset - you can continue normally.`;
    
    data.wrapper_compact = {
      savedTokens,
      totalSaved: session.tokensSaved,
      compactCount: session.compactCount
    };
    
    console.log(`🗜️ [WRAPPER] Compaction complete`);
  }
  
  // Add wrapper data
  data.wrapper = {
    enabled: true,
    tokens: {
      total: session.totalTokens,
      input: session.inputTokens,
      output: session.outputTokens
    },
    compaction: {
      count: session.compactCount,
      wasCompacted: session.wasCompacted,
      tokensSaved: session.tokensSaved
    }
  };
  
  return data;
}

// Export for use in frontend
if (typeof window !== 'undefined') {
  window.claudeWrapper = {
    processMessage: processWrapperMessage,
    getSession: getWrapperSession,
    getStats: () => wrapperState
  };
  
  console.log('════════════════════════════════════════════════════════');
  console.log('🎯 FRONTEND WRAPPER READY');
  console.log('🎯 Use: claudeWrapper.processMessage(message, sessionId)');
  console.log('════════════════════════════════════════════════════════');
}

export { processWrapperMessage, getWrapperSession };