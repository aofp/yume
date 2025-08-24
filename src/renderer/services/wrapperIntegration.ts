/**
 * Frontend Wrapper Integration for Token Tracking and Compaction
 * 
 * This processes messages that come directly from Rust,
 * since the server-side wrapper is bypassed.
 */

// Wrapper state
const wrapperState = {
  sessions: new Map<string, SessionState>(),
  debug: true,
  initialized: false,
  autoCompactThreshold: 160000, // Trigger at 160k tokens (80% of 200k)
  autoCompactPending: new Map<string, string>() // Track pending auto-compacts
};

interface SessionState {
  id: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  messageCount: number;
  compactCount: number;
  wasCompacted: boolean;
  tokensSaved: number;
  created: number;
  autoCompactTriggered?: boolean;
  lastUserMessage?: string;
  lastUpdateTime: number;
}

function getWrapperSession(sessionId: string): SessionState {
  if (!wrapperState.sessions.has(sessionId)) {
    wrapperState.sessions.set(sessionId, {
      id: sessionId,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalTokens: 0,
      messageCount: 0,
      compactCount: 0,
      wasCompacted: false,
      tokensSaved: 0,
      created: Date.now(),
      lastUpdateTime: Date.now()
    });
    if (wrapperState.debug) {
      console.log(`✅ [WRAPPER] Created session: ${sessionId}`);
    }
  }
  return wrapperState.sessions.get(sessionId)!;
}

export function processWrapperMessage(message: any, sessionId: string): any {
  // Debug input
  console.log('🎨 [WRAPPER] processWrapperMessage called:', {
    sessionId: sessionId?.substring(0, 8),
    messageType: message?.type,
    hasUsage: !!message?.usage,
    hasWrapperTokens: !!message?.wrapper_tokens
  });
  
  // Initialize on first call
  if (!wrapperState.initialized) {
    console.log('════════════════════════════════════════════════════════');
    console.log('🎯 FRONTEND WRAPPER ACTIVATED (first message)');
    console.log('🎯 Token tracking: ENABLED (Rust → Frontend)');
    console.log('🎯 Compaction detection: ENABLED');
    console.log('🎯 Debug logging: ENABLED');
    console.log('════════════════════════════════════════════════════════');
    wrapperState.initialized = true;
    
    // Make available globally for debugging and verification
    if (typeof window !== 'undefined') {
      (window as any).claudeWrapper = {
        processMessage: processWrapperMessage,
        getStats: getWrapperStats,
        clearSession: clearWrapperSession,
        setDebug: setWrapperDebug,
        getTokenData: getSessionTokenData,
        getSessions: () => Array.from(wrapperState.sessions.entries()),
        getState: () => wrapperState,
        forceUpdate: (sessionId: string, tokens: any) => {
          const session = getWrapperSession(sessionId);
          if (tokens.input !== undefined) session.inputTokens = tokens.input;
          if (tokens.output !== undefined) session.outputTokens = tokens.output;
          if (tokens.total !== undefined) session.totalTokens = tokens.total;
          session.lastUpdateTime = Date.now();
          console.log('🔄 [WRAPPER] Force updated tokens', session);
        }
      };
      console.log('🎯 Global claudeWrapper object available in console');
      console.log('🎯 Try: claudeWrapper.getStats() or claudeWrapper.getTokenData(sessionId)');
    }
  }
  
  const session = getWrapperSession(sessionId);
  
  // Clone message to avoid mutation
  const processed = { ...message };
  
  // Check if server already provided wrapper tokens
  if (message.wrapper_tokens) {
    // Server wrapper already tracked tokens, sync with our state
    console.log('📥 [WRAPPER] Received token data from server:', message.wrapper_tokens);
    session.inputTokens = message.wrapper_tokens.input || session.inputTokens;
    session.outputTokens = message.wrapper_tokens.output || session.outputTokens;
    session.cacheCreationTokens = message.wrapper_tokens.cache_creation || session.cacheCreationTokens;
    session.cacheReadTokens = message.wrapper_tokens.cache_read || session.cacheReadTokens;
    session.totalTokens = message.wrapper_tokens.total || session.totalTokens;
    session.compactCount = message.wrapper_tokens.compactCount || session.compactCount;
    session.tokensSaved = message.wrapper_tokens.tokensSaved || session.tokensSaved;
    session.lastUpdateTime = Date.now();
    
    const percentage = message.wrapper_tokens.percentage || ((session.totalTokens / 200000) * 100).toFixed(1);
    console.log(`📊 [WRAPPER] SERVER TOKENS → ${session.totalTokens}/200000 (${percentage}%)`, {
      total: session.totalTokens,
      input: session.inputTokens,
      output: session.outputTokens,
      cache: session.cacheCreationTokens + session.cacheReadTokens
    });
  }
  
  // Log API response with complete token info
  if (wrapperState.debug) {
    const hasUsage = !!message.usage;
    const hasWrapperTokens = !!message.wrapper_tokens;
    const tokenInfo = hasUsage ? {
      input: message.usage.input_tokens || 0,
      output: message.usage.output_tokens || 0,
      cache_creation: message.usage.cache_creation_input_tokens || 0,
      cache_read: message.usage.cache_read_input_tokens || 0
    } : null;
    
    console.log(`📡 [WRAPPER] API ${message.type}`, {
      sessionId: sessionId.substring(0, 8),
      type: message.type,
      subtype: message.subtype,
      hasUsage,
      hasWrapperTokens,
      tokens: tokenInfo,
      streaming: message.streaming
    });
  }
  
  // Track ALL message types for accurate counting
  if (message.type === 'user' || message.type === 'assistant' || message.type === 'system') {
    session.messageCount++;
  }
  
  // Also track tool messages
  if (message.type === 'tool_use' || message.type === 'tool_result') {
    session.messageCount++;
  }
  
  // Special handling for result messages (contain final token counts)
  if (message.type === 'result') {
    if (message.usage) {
      console.log('✅ [WRAPPER] RESULT MESSAGE - Final token counts received', {
        input: message.usage.input_tokens,
        output: message.usage.output_tokens,
        cache_creation: message.usage.cache_creation_input_tokens,
        cache_read: message.usage.cache_read_input_tokens,
        total: session.totalTokens,
        percentage: ((session.totalTokens / 200000) * 100).toFixed(1) + '%'
      });
    } else if (!isCompactResult(message)) {
      // Result without usage might be an error or special case
      console.log('⚠️ [WRAPPER] Result message without token usage', {
        type: message.type,
        subtype: message.subtype,
        hasResult: !!message.result
      });
    }
  }
  
  // Update tokens if usage present - ALWAYS track ALL token types
  // Skip if we already got tokens from server wrapper
  if (message.usage && !message.wrapper_tokens) {
    console.log('🔥 [WRAPPER] PROCESSING USAGE DATA:', {
      sessionId: sessionId.substring(0, 8),
      messageType: message.type,
      usage: message.usage
    });
    
    const input = message.usage.input_tokens || 0;
    const output = message.usage.output_tokens || 0;
    const cacheCreation = message.usage.cache_creation_input_tokens || 0;
    const cacheRead = message.usage.cache_read_input_tokens || 0;
    
    // Accumulate ALL token types separately for accurate tracking
    session.inputTokens += input;
    session.outputTokens += output;
    session.cacheCreationTokens += cacheCreation;
    session.cacheReadTokens += cacheRead;
    
    const prevTotal = session.totalTokens;
    // Total includes ALL token types
    session.totalTokens = session.inputTokens + session.outputTokens + session.cacheCreationTokens + session.cacheReadTokens;
    session.lastUpdateTime = Date.now();
    
    const delta = session.totalTokens - prevTotal;
    const percentage = (session.totalTokens / 200000 * 100).toFixed(1);
    
    // ALWAYS log token updates for visibility
    if (wrapperState.debug) {
      const indicator = delta > 0 ? '+' : delta < 0 ? '' : '=';
      const barLength = 20;
      const filledBars = Math.round((session.totalTokens / 200000) * barLength);
      const emptyBars = barLength - filledBars;
      const progressBar = '█'.repeat(filledBars) + '░'.repeat(emptyBars);
      
      console.log(`📊 [WRAPPER] TOKENS ${indicator}${delta} → ${session.totalTokens}/200000 [${progressBar}] ${percentage}%`, {
        input: session.inputTokens,
        output: session.outputTokens,
        cache_creation: session.cacheCreationTokens,
        cache_read: session.cacheReadTokens,
        total: session.totalTokens,
        percentage: `${percentage}%`,
        remaining: 200000 - session.totalTokens
      });
    }
    
    // Check for auto-compaction threshold
    if (session.totalTokens >= wrapperState.autoCompactThreshold && !session.autoCompactTriggered) {
      console.log(`⚠️ [WRAPPER] AUTO-COMPACT THRESHOLD REACHED! ${session.totalTokens}/${wrapperState.autoCompactThreshold} tokens`);
      session.autoCompactTriggered = true;
      
      // Add auto-compact trigger to message
      processed.wrapper_auto_compact = {
        triggered: true,
        threshold: wrapperState.autoCompactThreshold,
        currentTokens: session.totalTokens
      };
    }
  }
  
  // Detect and handle compaction
  if (isCompactResult(message)) {
    const savedTokens = session.totalTokens;
    
    if (wrapperState.debug) {
      console.log(`🗜️ [WRAPPER] COMPACTION DETECTED! Saved ${savedTokens} tokens`);
    }
    
    session.compactCount++;
    session.wasCompacted = true;
    session.tokensSaved += savedTokens;
    
    // Reset ALL token types and auto-compact flag after compaction
    session.inputTokens = 0;
    session.outputTokens = 0;
    session.cacheCreationTokens = 0;
    session.cacheReadTokens = 0;
    session.totalTokens = 0;
    session.autoCompactTriggered = false; // Reset so it can trigger again later
    session.lastUpdateTime = Date.now();
    
    // Generate helpful summary
    processed.result = generateCompactSummary(session, savedTokens);
    
    // Add compaction metadata
    processed.wrapper_compact = {
      savedTokens,
      totalSaved: session.tokensSaved,
      compactCount: session.compactCount
    };
    
    if (wrapperState.debug) {
      console.log(`🗜️ [WRAPPER] Compaction complete`, {
        savedTokens,
        totalSaved: session.tokensSaved,
        count: session.compactCount
      });
    }
  }
  
  // Add COMPLETE wrapper metadata to every message
  const percentage = (session.totalTokens / 200000 * 100).toFixed(1);
  processed.wrapper = {
    enabled: true,
    version: '1.0.0',
    tokens: {
      total: session.totalTokens,
      input: session.inputTokens,
      output: session.outputTokens,
      cache_creation: session.cacheCreationTokens,
      cache_read: session.cacheReadTokens,
      max: 200000,
      percentage: parseFloat(percentage),
      percentage_display: `${percentage}%`,
      remaining: 200000 - session.totalTokens,
      used_ratio: `${session.totalTokens}/200000`
    },
    compaction: {
      count: session.compactCount,
      wasCompacted: session.wasCompacted,
      tokensSaved: session.tokensSaved
    },
    session: {
      id: sessionId,
      messageCount: session.messageCount,
      created: session.created
    }
  };
  
  // Debug output
  console.log('🎨 [WRAPPER] Returning processed message:', {
    sessionId: sessionId?.substring(0, 8),
    messageType: processed.type,
    hasWrapper: !!processed.wrapper,
    totalTokens: session.totalTokens
  });
  
  return processed;
}

function isCompactResult(message: any): boolean {
  // Compaction has empty result and 0 tokens
  return message.type === 'result' &&
         message.result === '' &&
         (!message.usage || (message.usage.input_tokens === 0 && message.usage.output_tokens === 0));
}

function generateCompactSummary(session: SessionState, savedTokens: number): string {
  const percentageSaved = ((savedTokens / 200000) * 100).toFixed(1);
  return `✅ Conversation compacted successfully!

📊 Compaction Summary:
• Tokens saved: ${savedTokens.toLocaleString()} (${percentageSaved}% of context window)
• Messages compressed: ${session.messageCount}
• Compactions done: ${session.compactCount}
• Total tokens saved: ${session.tokensSaved.toLocaleString()}

✨ Context has been reset. You can continue the conversation normally.

💡 The conversation history has been compressed to save tokens while preserving context (200k window).`;
}

// Export functions
export function getWrapperStats(sessionId?: string) {
  if (sessionId) {
    return getWrapperSession(sessionId);
  }
  
  // Return all sessions
  const stats = {
    sessions: Array.from(wrapperState.sessions.entries()).map(([id, session]) => ({
      id,
      messages: session.messageCount,
      tokens: session.totalTokens,
      compactions: session.compactCount,
      tokensSaved: session.tokensSaved
    })),
    totalSessions: wrapperState.sessions.size
  };
  
  return stats;
}

export function clearWrapperSession(sessionId: string) {
  wrapperState.sessions.delete(sessionId);
  if (wrapperState.debug) {
    console.log(`[WRAPPER] Cleared session: ${sessionId}`);
  }
}

export function setWrapperDebug(enabled: boolean) {
  wrapperState.debug = enabled;
}

export function setAutoCompactMessage(sessionId: string, message: string) {
  wrapperState.autoCompactPending.set(sessionId, message);
  if (wrapperState.debug) {
    console.log(`[WRAPPER] Stored auto-compact pending message for session ${sessionId.substring(0, 8)}`);
  }
}

export function getAutoCompactMessage(sessionId: string): string | undefined {
  return wrapperState.autoCompactPending.get(sessionId);
}

export function clearAutoCompactMessage(sessionId: string) {
  wrapperState.autoCompactPending.delete(sessionId);
}

export function getSessionTokenData(sessionId: string) {
  const session = wrapperState.sessions.get(sessionId);
  if (!session) return null;
  
  const percentage = (session.totalTokens / 100000 * 100).toFixed(1);
  return {
    total: session.totalTokens,
    input: session.inputTokens,
    output: session.outputTokens,
    cacheCreation: session.cacheCreationTokens,
    cacheRead: session.cacheReadTokens,
    percentage: parseFloat(percentage),
    percentageDisplay: `${percentage}%`,
    remaining: 100000 - session.totalTokens,
    compactCount: session.compactCount,
    tokensSaved: session.tokensSaved,
    lastUpdate: session.lastUpdateTime
  };
}

// Module loaded log - THIS MUST SHOW IN CONSOLE
console.log('════════════════════════════════════════════════════════');
console.log('🚨 [WRAPPER MODULE] LOADED AT', new Date().toISOString());
console.log('🚨 [WRAPPER MODULE] processWrapperMessage:', typeof processWrapperMessage);
console.log('🚨 [WRAPPER MODULE] Waiting for first message...');
console.log('════════════════════════════════════════════════════════');

// Periodic token status display (every 30 seconds when active)
if (typeof window !== 'undefined') {
  setInterval(() => {
    if (wrapperState.sessions.size > 0) {
      const activeSessions = Array.from(wrapperState.sessions.values())
        .filter(s => Date.now() - s.lastUpdateTime < 300000); // Active in last 5 minutes
      
      if (activeSessions.length > 0) {
        console.log('━━━━━━━━━━━━━ TOKEN STATUS UPDATE ━━━━━━━━━━━━━');
        activeSessions.forEach(session => {
          const percentage = (session.totalTokens / 200000 * 100).toFixed(1);
          const barLength = 30;
          const filledBars = Math.round((session.totalTokens / 200000) * barLength);
          const emptyBars = barLength - filledBars;
          const progressBar = '█'.repeat(filledBars) + '░'.repeat(emptyBars);
          
          console.log(`📊 Session ${session.id.substring(0, 8)}: [${progressBar}] ${percentage}% (${session.totalTokens}/200000)`);
        });
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      }
    }
  }, 30000); // Every 30 seconds
}