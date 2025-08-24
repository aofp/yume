/**
 * Wrapper Integration for server-claude-macos.js
 * 
 * This code should be added at the top of the server file
 * It provides complete API response capture with always-on logging
 */

// ============================================
// UNIVERSAL CLAUDE WRAPPER - ALWAYS DEBUG
// ============================================

class UniversalClaudeWrapper {
  constructor(config = {}) {
    // Always-on configuration
    this.config = {
      maxTokens: 100000,
      enabled: true,
      debug: true, // ALWAYS ON
      captureAll: true,
      augmentStream: true,
      trackTokens: true,
      compactThreshold: 75000,
      ...config
    };
    
    // Session management
    this.sessions = new Map();
    this.currentSessionId = null;
    
    // Process management
    this.activeProcesses = new Map();
    this.claudePath = null;
    
    // API response tracking
    this.apiResponses = new Map();
    this.messageHistory = new Map();
    
    // Statistics
    this.stats = {
      totalSpawns: 0,
      totalMessages: 0,
      totalTokens: 0,
      errors: 0,
      compacts: 0
    };
    
    console.log('🎯 [WRAPPER] Universal Claude Wrapper initialized with ALWAYS-ON debug');
    console.log('🎯 [WRAPPER] Config:', this.config);
  }
  
  /**
   * Always log with clear prefix
   */
  log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const prefix = level === 'error' ? '❌' : level === 'info' ? '✅' : '📊';
    
    console.log(`${prefix} [WRAPPER] [${level.toUpperCase()}] ${message}`, data || '');
  }
  
  /**
   * Get or create session state
   */
  getSession(sessionId) {
    if (!sessionId) sessionId = this.currentSessionId || 'default';
    
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        id: sessionId,
        created: Date.now(),
        
        // Token tracking
        inputTokens: 0,
        outputTokens: 0,
        cacheTokens: 0,
        totalTokens: 0,
        
        // Message tracking
        messages: [],
        messageCount: 0,
        lastMessageTime: null,
        
        // API responses
        apiResponses: [],
        toolCalls: [],
        
        // Compaction
        compactCount: 0,
        lastCompact: null,
        wasCompacted: false,
        compactSummaries: [],
        
        // Streaming state
        isStreaming: false,
        lastAssistantMessageId: null,
        
        // Errors
        errors: []
      });
      
      this.log('info', `Created new session: ${sessionId}`);
    }
    
    return this.sessions.get(sessionId);
  }
  
  /**
   * Process line from Claude output
   */
  processLine(line, sessionId) {
    if (!line || !line.trim()) return line;
    
    const session = this.getSession(sessionId);
    
    try {
      // Parse JSON line
      const data = JSON.parse(line);
      
      // Log EVERY API response
      this.log('info', `API Response [${sessionId}] type=${data.type}`, {
        type: data.type,
        usage: data.usage,
        id: data.id || data.uuid
      });
      
      // Track session ID
      if (data.session_id) {
        this.currentSessionId = data.session_id;
      }
      
      // CRITICAL: Capture ALL API responses
      this.captureApiResponse(data, sessionId);
      
      // Update token counts from usage field
      if (data.usage) {
        this.updateTokens(data.usage, sessionId);
      }
      
      // Track messages
      if (data.type === 'user' || data.type === 'assistant') {
        this.trackMessage(data, sessionId);
      }
      
      // Track tool usage
      if (data.tool_calls || data.tool_use || (data.message?.content && Array.isArray(data.message.content))) {
        const content = data.message?.content || [];
        for (const block of content) {
          if (block.type === 'tool_use') {
            this.log('info', `Tool use detected: ${block.name}`);
            session.toolCalls.push({
              timestamp: Date.now(),
              name: block.name,
              input: block.input
            });
          }
        }
      }
      
      // Handle streaming state
      if (data.type === 'assistant' && data.id) {
        session.isStreaming = true;
        session.lastAssistantMessageId = data.id;
      }
      
      // Handle result (end of streaming)
      if (data.type === 'result') {
        session.isStreaming = false;
        this.handleResult(data, sessionId);
      }
      
      // Detect and handle compaction
      if (this.isCompactResult(data)) {
        this.handleCompaction(data, sessionId);
      }
      
      // ALWAYS augment with complete state
      data.wrapper = {
        enabled: true,
        session: {
          id: sessionId,
          messageCount: session.messageCount,
          isStreaming: session.isStreaming
        },
        tokens: {
          input: session.inputTokens,
          output: session.outputTokens,
          cache: session.cacheTokens,
          total: session.totalTokens,
          max: this.config.maxTokens,
          percentage: Math.round(session.totalTokens / this.config.maxTokens * 100) + '%',
          remaining: this.config.maxTokens - session.totalTokens
        },
        compaction: {
          count: session.compactCount,
          lastCompact: session.lastCompact,
          wasCompacted: session.wasCompacted
        },
        captured: {
          apiResponses: session.apiResponses.length,
          toolCalls: session.toolCalls.length,
          errors: session.errors.length
        }
      };
      
      return JSON.stringify(data);
      
    } catch (e) {
      // Not JSON or error - pass through unchanged
      return line;
    }
  }
  
  /**
   * Capture API response
   */
  captureApiResponse(data, sessionId) {
    const session = this.getSession(sessionId);
    
    const response = {
      timestamp: Date.now(),
      type: data.type,
      data: { ...data }
    };
    
    // Store in session
    session.apiResponses.push(response);
    
    // Keep last 100 responses
    if (session.apiResponses.length > 100) {
      session.apiResponses.shift();
    }
    
    // Store globally
    if (!this.apiResponses.has(sessionId)) {
      this.apiResponses.set(sessionId, []);
    }
    this.apiResponses.get(sessionId).push(response);
    
    this.log('info', `Captured API response #${session.apiResponses.length} for ${sessionId}`);
  }
  
  /**
   * Update token counts
   */
  updateTokens(usage, sessionId) {
    const session = this.getSession(sessionId);
    
    const inputTokens = usage.input_tokens || 0;
    const outputTokens = usage.output_tokens || 0;
    const cacheCreation = usage.cache_creation_input_tokens || 0;
    const cacheRead = usage.cache_read_input_tokens || 0;
    
    // Accumulate tokens
    session.inputTokens += inputTokens + cacheCreation;
    session.outputTokens += outputTokens;
    session.cacheTokens += cacheRead;
    
    const previousTotal = session.totalTokens;
    session.totalTokens = session.inputTokens + session.outputTokens;
    
    this.stats.totalTokens += (session.totalTokens - previousTotal);
    
    this.log('info', `📊 TOKENS UPDATED [${sessionId}]`, {
      input: session.inputTokens,
      output: session.outputTokens,
      total: session.totalTokens,
      percentage: (session.totalTokens / this.config.maxTokens * 100).toFixed(1) + '%'
    });
    
    // Emit token update event if io exists
    if (global.io) {
      global.io.emit(`wrapper:tokens:${sessionId}`, {
        sessionId,
        tokens: session.totalTokens,
        usage: {
          input: session.inputTokens,
          output: session.outputTokens,
          cache: session.cacheTokens,
          total: session.totalTokens,
          max: this.config.maxTokens,
          percentage: session.totalTokens / this.config.maxTokens
        }
      });
    }
  }
  
  /**
   * Track messages
   */
  trackMessage(data, sessionId) {
    const session = this.getSession(sessionId);
    
    const message = {
      timestamp: Date.now(),
      type: data.type,
      id: data.id,
      content: data.message?.content || data.content || '',
      tokens: session.totalTokens
    };
    
    session.messages.push(message);
    session.messageCount++;
    session.lastMessageTime = message.timestamp;
    
    this.stats.totalMessages++;
    
    this.log('info', `Message tracked: ${data.type} #${session.messageCount}`);
  }
  
  /**
   * Handle result message
   */
  handleResult(data, sessionId) {
    const session = this.getSession(sessionId);
    
    this.log('info', `Result received for ${sessionId}`, {
      isError: data.is_error,
      duration: data.duration_ms,
      usage: data.usage
    });
  }
  
  /**
   * Check if result is from compaction
   */
  isCompactResult(data) {
    return data.type === 'result' &&
           data.result === '' &&
           data.usage?.input_tokens === 0 &&
           data.usage?.output_tokens === 0;
  }
  
  /**
   * Handle compaction with proper summary
   */
  handleCompaction(data, sessionId) {
    const session = this.getSession(sessionId);
    
    const savedTokens = session.totalTokens;
    
    this.log('info', `🗜️ COMPACTION DETECTED for ${sessionId}!`, {
      savedTokens,
      previousMessages: session.messageCount
    });
    
    // Generate summary from tracked messages
    const summary = this.generateCompactSummary(session);
    
    // Store summary
    session.compactSummaries.push({
      timestamp: Date.now(),
      summary,
      savedTokens
    });
    
    // Reset session
    session.compactCount++;
    session.lastCompact = Date.now();
    session.wasCompacted = true;
    session.inputTokens = 0;
    session.outputTokens = 0;
    session.cacheTokens = 0;
    session.totalTokens = 0;
    session.messages = [];
    
    this.stats.compacts++;
    
    // Augment result with summary
    data.result = `✅ Conversation compacted successfully

📊 Summary:
• Messages processed: ${session.messageCount}
• Tokens saved: ${savedTokens}
• Tools used: ${session.toolCalls.length}
${summary}

You can continue the conversation normally.`;
    
    data.compaction = {
      saved: savedTokens,
      summary,
      timestamp: Date.now()
    };
    
    // Emit compaction event
    if (global.io) {
      global.io.emit(`wrapper:compaction:${sessionId}`, {
        type: 'system',
        subtype: 'compaction',
        message: data.result,
        savedTokens,
        summary
      });
    }
    
    this.log('info', `Compaction complete, summary generated`);
  }
  
  /**
   * Generate compact summary
   */
  generateCompactSummary(session) {
    const recentMessages = session.messages.slice(-10);
    const tools = [...new Set(session.toolCalls.map(t => t.name))];
    
    const lines = [];
    
    if (tools.length > 0) {
      lines.push(`• Tools used: ${tools.join(', ')}`);
    }
    
    if (recentMessages.length > 0) {
      lines.push(`• Recent topics: ${recentMessages.map(m => {
        if (typeof m.content === 'string') {
          return m.content.substring(0, 50);
        }
        return 'interaction';
      }).filter(c => c).slice(0, 3).join(', ')}`);
    }
    
    return lines.join('\n');
  }
  
  /**
   * Process stream with readline
   */
  setupStreamProcessing(claudeProcess, sessionId) {
    const session = this.getSession(sessionId);
    
    this.log('info', `Setting up stream processing for ${sessionId}`);
    
    // Import readline for line-by-line processing
    const readline = require('readline');
    
    const rl = readline.createInterface({
      input: claudeProcess.stdout,
      crlfDelay: Infinity
    });
    
    rl.on('line', (line) => {
      try {
        const augmented = this.processLine(line, sessionId);
        // Output augmented line to stdout
        if (augmented) {
          console.log(augmented);
        }
      } catch (e) {
        this.log('error', `Error processing line for ${sessionId}`, e);
      }
    });
    
    // Handle stderr
    claudeProcess.stderr.on('data', (chunk) => {
      const error = chunk.toString();
      session.errors.push({
        timestamp: Date.now(),
        error
      });
      
      // Pass through stderr
      process.stderr.write(chunk);
    });
  }
  
  /**
   * Get statistics
   */
  getStats(sessionId) {
    if (sessionId) {
      const session = this.getSession(sessionId);
      return {
        session,
        apiResponseCount: session.apiResponses.length,
        isActive: this.activeProcesses.has(sessionId)
      };
    }
    
    return {
      global: this.stats,
      sessions: Array.from(this.sessions.keys()).map(id => {
        const session = this.sessions.get(id);
        return {
          id,
          messages: session.messageCount,
          tokens: session.totalTokens,
          apiResponses: session.apiResponses.length
        };
      })
    };
  }
}

// ============================================
// INITIALIZE WRAPPER GLOBALLY
// ============================================

console.log('🚀 Initializing Universal Claude Wrapper...');
global.wrapperInstance = new UniversalClaudeWrapper({
  enabled: true,
  debug: true, // ALWAYS ON
  maxTokens: 100000
});

console.log('✅ Wrapper initialized and ready');

// ============================================
// EXPORT FOR USE
// ============================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = global.wrapperInstance;
}