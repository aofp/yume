/**
 * Frontend Wrapper Integration for Token Tracking and Compaction
 * 
 * This processes messages that come directly from Rust,
 * since the server-side wrapper is bypassed.
 */

// Wrapper state
const wrapperState = {
  sessions: new Map<string, SessionState>(),
  sessionMapping: new Map<string, string>(), // Map temp IDs to real IDs
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
  // Resolve mapped session ID (temp -> real)
  const resolvedId = wrapperState.sessionMapping.get(sessionId) || sessionId;
  
  console.log(`🔍 [WRAPPER-SESSION] Getting session:`, {
    requested: sessionId,
    resolved: resolvedId,
    isTemp: sessionId.startsWith('temp-'),
    isMapped: wrapperState.sessionMapping.has(sessionId),
    allMappings: Array.from(wrapperState.sessionMapping.entries())
  });
  
  if (!wrapperState.sessions.has(resolvedId)) {
    wrapperState.sessions.set(resolvedId, {
      id: resolvedId,
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
    console.log(`✅ [WRAPPER-SESSION] Created NEW session:`, {
      id: resolvedId,
      requested: sessionId,
      totalSessions: wrapperState.sessions.size,
      allSessions: Array.from(wrapperState.sessions.keys())
    });
  } else {
    const session = wrapperState.sessions.get(resolvedId)!;
    console.log(`📦 [WRAPPER-SESSION] Using EXISTING session:`, {
      id: resolvedId,
      requested: sessionId,
      currentTokens: session.totalTokens,
      messageCount: session.messageCount
    });
  }
  return wrapperState.sessions.get(resolvedId)!;
}

export function processWrapperMessage(message: any, sessionId: string): any {
  // Debug input - ALWAYS log this
  console.log('🎨🎨🎨 [WRAPPER] processWrapperMessage ENTRY:', {
    sessionId: sessionId?.substring(0, 8),
    messageType: message?.type,
    hasUsage: !!message?.usage,
    hasWrapperTokens: !!message?.wrapper_tokens,
    usage: message?.usage,
    rustTokens: message?.rust_tokens,
    fullMessage: JSON.stringify(message).substring(0, 500)
  });
  
  // Auto-detect and map session IDs when we see a real session ID in a message
  console.log(`🔍 [WRAPPER-MAPPING] Checking for auto-mapping:`, {
    hasSessionId: !!message.session_id,
    messageSessionId: message.session_id,
    currentSessionId: sessionId,
    isCurrentTemp: sessionId.startsWith('temp-'),
    isMessageTemp: message.session_id?.startsWith('temp-'),
    shouldMap: message.session_id && sessionId.startsWith('temp-') && !message.session_id.startsWith('temp-')
  });
  
  if (message.session_id && sessionId.startsWith('temp-') && !message.session_id.startsWith('temp-')) {
    console.log(`🔄🔄🔄 [WRAPPER-MAPPING] AUTO-MAPPING TRIGGERED: ${sessionId} -> ${message.session_id}`);
    mapSessionIds(sessionId, message.session_id);
  }
  
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
  
  // Get the session (will resolve temp -> real mapping automatically)
  const session = getWrapperSession(sessionId);
  const resolvedId = wrapperState.sessionMapping.get(sessionId) || sessionId;
  
  if (sessionId !== resolvedId) {
    console.log(`🔄 [WRAPPER] Using resolved session: ${sessionId} -> ${resolvedId}`);
  }
  
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
    
    const percentage = message.wrapper_tokens.percentage || ((session.totalTokens / 200000) * 100).toFixed(2);
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
        percentage: ((session.totalTokens / 200000) * 100).toFixed(2) + '%'
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
    
    // IMPORTANT: Understanding token types:
    // - input_tokens: NEW input for this message (not including cache)
    // - output_tokens: NEW output generated
    // - cache_read_input_tokens: SIZE of cached context (SNAPSHOT, not incremental!)
    // - cache_creation_input_tokens: One-time cost when content is first cached
    
    // Accumulate only NEW tokens
    session.inputTokens += input;
    session.outputTokens += output;
    
    // Cache creation happens once when content is cached (accumulate this)
    if (cacheCreation > 0) {
      session.cacheCreationTokens += cacheCreation;
    }
    
    // Cache read is the SIZE of cached content - it's a snapshot, not incremental!
    // This represents the conversation history that's being reused
    session.cacheReadTokens = cacheRead; // REPLACE, don't accumulate!
    
    const prevTotal = session.totalTokens;
    // Total context in use = cached history + new tokens
    // This is what counts against the 200k limit
    session.totalTokens = session.cacheReadTokens + session.inputTokens + session.outputTokens;
    session.lastUpdateTime = Date.now();
    
    const delta = session.totalTokens - prevTotal;
    const percentage = (session.totalTokens / 200000 * 100).toFixed(2);
    
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
  const percentage = (session.totalTokens / 200000 * 100).toFixed(2);
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
  
  // Debug output - log complete wrapper details
  console.log('🎨✅ [WRAPPER] FINAL processed message:', {
    sessionId: sessionId?.substring(0, 8),
    messageType: processed.type,
    hasWrapper: !!processed.wrapper,
    wrapperTokens: processed.wrapper?.tokens,
    sessionTokens: session.totalTokens,
    percentage: processed.wrapper?.tokens?.percentage
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
  const percentageSaved = ((savedTokens / 200000) * 100).toFixed(2);
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

export function mapSessionIds(tempId: string, realId: string) {
  console.log(`📍 [WRAPPER-MAP] mapSessionIds called:`, {
    tempId,
    realId,
    areEqual: tempId === realId,
    existingMappings: Array.from(wrapperState.sessionMapping.entries()),
    existingSessions: Array.from(wrapperState.sessions.keys())
  });
  
  if (tempId !== realId) {
    console.log(`🔄 [WRAPPER-MAP] Creating mapping: ${tempId} -> ${realId}`);
    wrapperState.sessionMapping.set(tempId, realId);
    
    // If there was already a session for the temp ID, merge its tokens into the real session
    const tempSession = wrapperState.sessions.get(tempId);
    console.log(`🔍 [WRAPPER-MAP] Temp session exists:`, {
      exists: !!tempSession,
      tempTokens: tempSession?.totalTokens || 0,
      tempMessages: tempSession?.messageCount || 0
    });
    
    if (tempSession) {
      const realSession = getWrapperSession(realId);
      const beforeTokens = realSession.totalTokens;
      
      realSession.inputTokens += tempSession.inputTokens;
      realSession.outputTokens += tempSession.outputTokens;
      realSession.cacheCreationTokens += tempSession.cacheCreationTokens;
      realSession.cacheReadTokens += tempSession.cacheReadTokens;
      realSession.totalTokens = realSession.inputTokens + realSession.outputTokens + 
                               realSession.cacheCreationTokens + realSession.cacheReadTokens;
      realSession.messageCount += tempSession.messageCount;
      
      console.log(`🔄 [WRAPPER-MAP] MERGED temp -> real session:`, {
        tempId,
        realId,
        beforeTokens,
        afterTokens: realSession.totalTokens,
        tokensMerged: tempSession.totalTokens,
        messagesAdded: tempSession.messageCount,
        realSession
      });
      
      // Delete the temp session
      wrapperState.sessions.delete(tempId);
      console.log(`🗑️ [WRAPPER-MAP] Deleted temp session: ${tempId}`);
    }
    
    console.log(`✅ [WRAPPER-MAP] Mapping complete. Current state:`, {
      mappings: Array.from(wrapperState.sessionMapping.entries()),
      sessions: Array.from(wrapperState.sessions.keys())
    });
  } else {
    console.log(`⚠️ [WRAPPER-MAP] IDs are identical, no mapping needed`);
  }
}

export function getSessionTokenData(sessionId: string) {
  // Resolve mapped session ID
  const resolvedId = wrapperState.sessionMapping.get(sessionId) || sessionId;
  const session = wrapperState.sessions.get(resolvedId);
  if (!session) return null;
  
  const percentage = (session.totalTokens / 200000 * 100).toFixed(2);
  return {
    total: session.totalTokens,
    input: session.inputTokens,
    output: session.outputTokens,
    cacheCreation: session.cacheCreationTokens,
    cacheRead: session.cacheReadTokens,
    percentage: parseFloat(percentage),
    percentageDisplay: `${percentage}%`,
    remaining: 200000 - session.totalTokens,
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
          const percentage = (session.totalTokens / 200000 * 100).toFixed(2);
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