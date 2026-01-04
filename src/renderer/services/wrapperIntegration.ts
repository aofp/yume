/**
 * Frontend Wrapper Integration for Token Tracking and Compaction
 * 
 * This processes messages that come directly from Rust,
 * since the server-side wrapper is bypassed.
 */

// Check if we're in development mode
const isDev = import.meta.env?.DEV || process.env.NODE_ENV === 'development';

// Wrapper state - debug disabled by default in production
const wrapperState = {
  sessions: new Map<string, SessionState>(),
  sessionMapping: new Map<string, string>(), // Map temp IDs to real IDs
  debug: isDev, // Only enable debug in development
  initialized: false,
  autoCompactThreshold: 120000, // 60% of 200k context window (matches compactionService)
  autoCompactPending: new Map<string, string>() // Track pending auto-compacts
};

// Debug logging helper - only logs when debug is enabled
const debugLog = (...args: any[]) => {
  if (wrapperState.debug) {
    console.log(...args);
  }
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
  }
  return wrapperState.sessions.get(resolvedId)!;
}

export function processWrapperMessage(message: any, sessionId: string): any {
  // Auto-detect and map session IDs when we see a real session ID in a message
  if (message.session_id && sessionId.startsWith('temp-') && !message.session_id.startsWith('temp-')) {
    mapSessionIds(sessionId, message.session_id);
  }

  // Initialize on first call
  if (!wrapperState.initialized) {
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
        }
      };
    }
  }
  
  // Get the session (will resolve temp -> real mapping automatically)
  const session = getWrapperSession(sessionId);

  // Clone message to avoid mutation
  const processed = { ...message };

  // Check if server already provided wrapper tokens
  if (message.wrapper_tokens) {
    // Server wrapper already tracked tokens, sync with our state
    session.inputTokens = message.wrapper_tokens.input || session.inputTokens;
    session.outputTokens = message.wrapper_tokens.output || session.outputTokens;
    session.cacheCreationTokens = message.wrapper_tokens.cache_creation || session.cacheCreationTokens;
    session.cacheReadTokens = message.wrapper_tokens.cache_read || session.cacheReadTokens;
    session.totalTokens = message.wrapper_tokens.total || session.totalTokens;
    session.compactCount = message.wrapper_tokens.compactCount || session.compactCount;
    session.tokensSaved = message.wrapper_tokens.tokensSaved || session.tokensSaved;
    session.lastUpdateTime = Date.now();
  }
  
  // Track ALL message types for accurate counting
  if (message.type === 'user' || message.type === 'assistant' || message.type === 'system') {
    session.messageCount++;
  }
  
  // Also track tool messages
  if (message.type === 'tool_use' || message.type === 'tool_result') {
    session.messageCount++;
  }
  
  // Update tokens if usage present - ALWAYS track ALL token types
  // Skip if we already got tokens from server wrapper
  if (message.usage && !message.wrapper_tokens) {
    const input = message.usage.input_tokens || 0;
    const output = message.usage.output_tokens || 0;
    const cacheCreation = message.usage.cache_creation_input_tokens || 0;
    const cacheRead = message.usage.cache_read_input_tokens || 0;
    
    // IMPORTANT: Understanding token types:
    // - input_tokens: NEW input for this message (not including cache)
    // - output_tokens: NEW output generated
    // - cache_read_input_tokens: SIZE of cached context (SNAPSHOT, not incremental!)
    // - cache_creation_input_tokens: One-time cost when content is first cached
    
    // DON'T accumulate - the API gives us per-message tokens
    // IMPORTANT: cache_read_input_tokens from API is CUMULATIVE across all turns,
    // NOT the current context size! We track context size incrementally.
    session.inputTokens = input;
    session.outputTokens = output;

    // Cache creation happens once when content is cached
    session.cacheCreationTokens = cacheCreation;

    // Cache read from API is cumulative - store it but don't use for context calculation
    session.cacheReadTokens = cacheRead;

    // CORRECT FORMULA for actual context size:
    // Track incrementally by ACCUMULATING output tokens (which become part of context)
    // The server wrapper does this correctly - we should use wrapper.tokens.total when available
    // For now, accumulate output tokens as a rough estimate
    // The real context size comes from the server's wrapper.tokens.total field
    if (output > 0) {
      session.totalTokens += output; // Accumulate output tokens
    }
    // Also add input tokens for new messages (but don't double-count)
    if (input > 0 && cacheRead === 0) {
      // Only add input if this is a new context (no cache read yet)
      session.totalTokens += input;
    }
    session.lastUpdateTime = Date.now();

    // DISABLED: Auto-compact trigger based on frontend calculation
    // The calculation here is unreliable because cache_read_input_tokens from the API
    // is cumulative across turns, not the actual context size.
    // Auto-compaction should be handled by compactionService using the server's tracked tokens.
    // See claudeCodeStore.ts line 1668-1671 for the correct trigger point.

    // Log for debugging but don't trigger auto-compact
    if (wrapperState.debug) {
      const percentage = (session.totalTokens / 200000 * 100).toFixed(2);
      console.log(`📊 [WRAPPER] Token update: ${percentage}% (${session.totalTokens}/200000)`);
      console.log(`   API values: cacheRead=${cacheRead}, cacheCreation=${cacheCreation}, input=${input}, output=${output}`);
    }
  }
  
  // Detect and handle compaction
  if (isCompactResult(message)) {
    const savedTokens = session.totalTokens;
    const claudeResult = message.result || ''; // Save Claude's original result

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

    // Generate helpful summary (includes Claude's result if present)
    processed.result = generateCompactSummary(session, savedTokens, claudeResult);

    // Add compaction metadata
    processed.wrapper_compact = {
      savedTokens,
      totalSaved: session.tokensSaved,
      compactCount: session.compactCount
    };

    debugLog('[WRAPPER] 🗜️ Compact detected:', {
      savedTokens,
      compactCount: session.compactCount,
      claudeResultLength: claudeResult.length
    });
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

  return processed;
}

function isCompactResult(message: any): boolean {
  // Compact result is detected by:
  // 1. type === 'result'
  // 2. Zero usage tokens (both input and output are 0) - THE definitive indicator
  // Note: Claude may return non-empty result with its own summary, so don't check result === ''
  if (message.type !== 'result') return false;

  // Primary check: zero usage tokens - the definitive indicator of compact
  // Compact results have 0 input and 0 output tokens because the context was reset
  const hasZeroUsage = message.usage &&
    message.usage.input_tokens === 0 &&
    message.usage.output_tokens === 0;

  // Secondary check: num_turns field combined with zero/missing cache tokens
  // This catches edge cases where usage might not be present
  const hasNumTurnsWithNoCache = message.num_turns !== undefined &&
    (!message.usage?.cache_read_input_tokens || message.usage.cache_read_input_tokens === 0);

  return hasZeroUsage || hasNumTurnsWithNoCache;
}

function generateCompactSummary(session: SessionState, savedTokens: number, claudeResult?: string): string {
  const percentageSaved = ((savedTokens / 200000) * 100).toFixed(2);

  let summary = `**Conversation compacted successfully.**

**Summary:**
- Tokens saved: **${savedTokens.toLocaleString()}** (${percentageSaved}% of context window)
- Messages compressed: ${session.messageCount}
- Compactions done: ${session.compactCount}
- Total tokens saved: ${session.tokensSaved.toLocaleString()}

Context has been reset. You can continue the conversation normally.`;

  // If Claude provided its own summary, append it
  if (claudeResult && claudeResult.trim()) {
    summary += `\n\n---\n\n**Claude's Summary:**\n${claudeResult}`;
  }

  return summary;
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
  if (tempId !== realId) {
    wrapperState.sessionMapping.set(tempId, realId);

    // If there was already a session for the temp ID, merge its tokens into the real session
    const tempSession = wrapperState.sessions.get(tempId);

    if (tempSession) {
      const realSession = getWrapperSession(realId);

      // Take the latest values, don't accumulate (these are snapshots)
      realSession.inputTokens = Math.max(realSession.inputTokens, tempSession.inputTokens);
      realSession.outputTokens = Math.max(realSession.outputTokens, tempSession.outputTokens);
      realSession.cacheCreationTokens = Math.max(realSession.cacheCreationTokens, tempSession.cacheCreationTokens);
      realSession.cacheReadTokens = Math.max(realSession.cacheReadTokens, tempSession.cacheReadTokens);
      realSession.totalTokens = realSession.cacheReadTokens + realSession.cacheCreationTokens + realSession.inputTokens;
      realSession.messageCount += tempSession.messageCount;

      // Delete the temp session
      wrapperState.sessions.delete(tempId);
    }
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

// Module initialization complete - no logging needed in production