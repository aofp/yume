/**
 * Universal Claude Wrapper Module - Drop-in Integration
 * 
 * Import this at the top of server-claude-macos.js:
 * import './wrapper-module.js';
 */

import readline from 'readline';
import { EventEmitter } from 'events';

// ============================================
// UNIVERSAL CLAUDE WRAPPER WITH ALWAYS-ON DEBUG
// ============================================

class UniversalClaudeWrapper extends EventEmitter {
  constructor(config = {}) {
    super();
    
    // Always-on configuration
    this.config = {
      maxTokens: 200000,
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
    
    // API response tracking
    this.apiResponses = new Map();
    this.messageHistory = new Map();
    this.allApiCalls = [];
    
    // Statistics
    this.stats = {
      totalSpawns: 0,
      totalMessages: 0,
      totalTokens: 0,
      errors: 0,
      compacts: 0,
      apiCalls: 0
    };
    
    console.log('');
    console.log('════════════════════════════════════════════════════════');
    console.log('🎯 UNIVERSAL CLAUDE WRAPPER INITIALIZED');
    console.log('🎯 Debug: ALWAYS ON');
    console.log('🎯 Token Tracking: ENABLED');
    console.log('🎯 API Capture: ENABLED');
    console.log('🎯 Compact Detection: ENABLED');
    console.log('════════════════════════════════════════════════════════');
    console.log('');
  }
  
  /**
   * Always log with clear formatting
   */
  log(level, message, data = null) {
    const timestamp = new Date().toISOString().split('T')[1];
    const icons = {
      error: '❌',
      info: '✅',
      debug: '🔍',
      token: '📊',
      api: '📡',
      compact: '🗜️'
    };
    
    const icon = icons[level] || '📝';
    const color = level === 'error' ? '\x1b[31m' : level === 'token' ? '\x1b[36m' : '\x1b[32m';
    const reset = '\x1b[0m';
    
    console.log(`${color}${icon} [WRAPPER ${timestamp}] ${message}${reset}`, data ? JSON.stringify(data, null, 2) : '');
  }
  
  /**
   * Get or create session
   */
  getSession(sessionId) {
    if (!sessionId) sessionId = this.currentSessionId || 'default';
    
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        id: sessionId,
        created: Date.now(),
        
        // Token tracking - CRITICAL
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        totalTokens: 0,
        
        // Message tracking
        messages: [],
        messageCount: 0,
        userMessages: [],
        assistantMessages: [],
        
        // API responses - COMPLETE CAPTURE
        apiResponses: [],
        apiTypes: {},
        
        // Tool tracking
        toolCalls: [],
        toolsByName: {},
        
        // Compaction
        compactCount: 0,
        lastCompact: null,
        wasCompacted: false,
        compactSummaries: [],
        tokensSaved: 0,
        
        // State
        isStreaming: false,
        lastAssistantMessageId: null,
        errors: []
      });
      
      this.log('info', `Created session: ${sessionId}`);
    }
    
    return this.sessions.get(sessionId);
  }
  
  /**
   * Wrap a Claude process for monitoring
   */
  wrapProcess(claudeProcess, sessionId) {
    this.log('info', `Wrapping process for session: ${sessionId}`);
    
    const session = this.getSession(sessionId);
    this.activeProcesses.set(sessionId, claudeProcess);
    
    // Create readline interface for line-by-line processing
    const rl = readline.createInterface({
      input: claudeProcess.stdout,
      crlfDelay: Infinity
    });
    
    let lineCount = 0;
    
    rl.on('line', (line) => {
      lineCount++;
      
      try {
        // Process and augment the line
        const processed = this.processLine(line, sessionId);
        
        // Output the processed line (maintains stream)
        if (processed) {
          process.stdout.write(processed + '\n');
        }
      } catch (e) {
        this.log('error', `Error processing line ${lineCount}`, e.message);
        // Pass through unchanged on error
        process.stdout.write(line + '\n');
      }
    });
    
    // Handle stderr
    claudeProcess.stderr.on('data', (chunk) => {
      const error = chunk.toString();
      session.errors.push({
        timestamp: Date.now(),
        error
      });
      
      this.log('error', `Process stderr:`, error);
      
      // Pass through stderr
      process.stderr.write(chunk);
    });
    
    // Handle process exit
    claudeProcess.on('exit', (code, signal) => {
      this.activeProcesses.delete(sessionId);
      session.isStreaming = false;
      
      this.log('info', `Process exited for ${sessionId}`, { code, signal, linesProcessed: lineCount });
      
      // Log final session stats
      this.logSessionStats(sessionId);
    });
    
    return claudeProcess;
  }
  
  /**
   * Process a line from Claude output
   */
  processLine(line, sessionId) {
    if (!line || !line.trim()) return line;
    
    const session = this.getSession(sessionId);
    
    try {
      // Parse JSON
      const data = JSON.parse(line);
      
      // CAPTURE EVERYTHING
      this.captureApiResponse(data, sessionId);
      
      // Update session ID if present
      if (data.session_id && data.session_id !== sessionId) {
        this.currentSessionId = data.session_id;
        this.log('info', `Session ID updated: ${sessionId} → ${data.session_id}`);
      }
      
      // Process based on type
      switch (data.type) {
        case 'system':
          this.handleSystem(data, session);
          break;
          
        case 'user':
          this.handleUser(data, session);
          break;
          
        case 'assistant':
          this.handleAssistant(data, session);
          break;
          
        case 'result':
          this.handleResult(data, session);
          break;
      }
      
      // Update tokens if usage present
      if (data.usage) {
        this.updateTokens(data.usage, sessionId);
      }
      
      // Detect tool usage
      if (data.message?.content && Array.isArray(data.message.content)) {
        for (const block of data.message.content) {
          if (block.type === 'tool_use') {
            this.trackToolUse(block, session);
          }
        }
      }
      
      // AUGMENT with wrapper data
      data.wrapper = this.getAugmentation(session);
      
      return JSON.stringify(data);
      
    } catch (e) {
      // Not JSON - pass through
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
      sessionId,
      type: data.type,
      subtype: data.subtype,
      data: { ...data }
    };
    
    // Store in session
    session.apiResponses.push(response);
    
    // Track by type
    if (!session.apiTypes[data.type]) {
      session.apiTypes[data.type] = 0;
    }
    session.apiTypes[data.type]++;
    
    // Store globally
    this.allApiCalls.push(response);
    
    // Keep reasonable limits
    if (session.apiResponses.length > 200) {
      session.apiResponses.shift();
    }
    
    if (this.allApiCalls.length > 1000) {
      this.allApiCalls.shift();
    }
    
    this.stats.apiCalls++;
    
    this.log('api', `API ${data.type} #${this.stats.apiCalls}`, {
      sessionId: sessionId.substring(0, 8),
      type: data.type,
      subtype: data.subtype
    });
  }
  
  /**
   * Handle system messages
   */
  handleSystem(data, session) {
    if (data.subtype === 'init') {
      this.log('info', `Session initialized with tools: ${data.tools?.length || 0}`);
    }
  }
  
  /**
   * Handle user messages
   */
  handleUser(data, session) {
    session.userMessages.push({
      timestamp: Date.now(),
      content: data.message?.content || ''
    });
    
    session.messageCount++;
    this.stats.totalMessages++;
  }
  
  /**
   * Handle assistant messages
   */
  handleAssistant(data, session) {
    session.assistantMessages.push({
      timestamp: Date.now(),
      id: data.message?.id,
      content: data.message?.content || ''
    });
    
    session.messageCount++;
    session.isStreaming = true;
    session.lastAssistantMessageId = data.message?.id;
    
    this.stats.totalMessages++;
  }
  
  /**
   * Handle result messages
   */
  handleResult(data, session) {
    session.isStreaming = false;
    
    // Check for compaction
    if (this.isCompactResult(data)) {
      this.handleCompaction(data, session);
    } else {
      this.log('info', `Result: ${data.subtype || 'complete'}`, {
        duration: data.duration_ms,
        cost: data.total_cost_usd,
        turns: data.num_turns
      });
    }
  }
  
  /**
   * Track tool usage
   */
  trackToolUse(block, session) {
    const tool = {
      timestamp: Date.now(),
      name: block.name,
      id: block.id,
      input: block.input
    };
    
    session.toolCalls.push(tool);
    
    if (!session.toolsByName[block.name]) {
      session.toolsByName[block.name] = 0;
    }
    session.toolsByName[block.name]++;
    
    this.log('info', `Tool used: ${block.name} (${session.toolsByName[block.name]} times)`);
  }
  
  /**
   * Update token counts - CRITICAL
   */
  updateTokens(usage, sessionId) {
    const session = this.getSession(sessionId);
    
    // Extract all token types
    const input = usage.input_tokens || 0;
    const output = usage.output_tokens || 0;
    const cacheCreation = usage.cache_creation_input_tokens || 0;
    const cacheRead = usage.cache_read_input_tokens || 0;
    
    // ACCUMULATE - never reset except on compact
    session.inputTokens += input;
    session.outputTokens += output;
    session.cacheCreationTokens += cacheCreation;
    session.cacheReadTokens += cacheRead;
    
    const prevTotal = session.totalTokens;
    session.totalTokens = session.inputTokens + session.outputTokens;
    
    const delta = session.totalTokens - prevTotal;
    this.stats.totalTokens += delta;
    
    this.log('token', `TOKENS +${delta} → ${session.totalTokens}/${this.config.maxTokens}`, {
      session: sessionId.substring(0, 8),
      input: session.inputTokens,
      output: session.outputTokens,
      cache: session.cacheReadTokens,
      total: session.totalTokens,
      percent: Math.round(session.totalTokens / this.config.maxTokens * 100) + '%'
    });
    
    // Emit update event
    this.emit('tokens-updated', {
      sessionId,
      tokens: session.totalTokens,
      usage: {
        input: session.inputTokens,
        output: session.outputTokens,
        cacheCreation: session.cacheCreationTokens,
        cacheRead: session.cacheReadTokens,
        total: session.totalTokens,
        max: this.config.maxTokens,
        percentage: session.totalTokens / this.config.maxTokens
      }
    });
  }
  
  /**
   * Check if result is compaction
   */
  isCompactResult(data) {
    // Compaction has empty result and 0 tokens
    return data.type === 'result' &&
           data.result === '' &&
           (!data.usage || (data.usage.input_tokens === 0 && data.usage.output_tokens === 0));
  }
  
  /**
   * Handle compaction
   */
  handleCompaction(data, session) {
    const savedTokens = session.totalTokens;
    
    this.log('compact', `COMPACTION DETECTED! Saved ${savedTokens} tokens`);
    
    // Generate summary
    const summary = this.generateSummary(session);
    
    // Store compaction info
    session.compactSummaries.push({
      timestamp: Date.now(),
      savedTokens,
      summary,
      messageCount: session.messageCount,
      toolCount: session.toolCalls.length
    });
    
    // Update stats
    session.compactCount++;
    session.lastCompact = Date.now();
    session.wasCompacted = true;
    session.tokensSaved += savedTokens;
    this.stats.compacts++;
    
    // RESET tokens after compaction
    session.inputTokens = 0;
    session.outputTokens = 0;
    session.cacheCreationTokens = 0;
    session.cacheReadTokens = 0;
    session.totalTokens = 0;
    
    // Clear message history
    session.messages = [];
    session.userMessages = [];
    session.assistantMessages = [];
    
    // Augment result with summary
    data.result = `✅ Conversation compacted successfully!

📊 Compaction Summary:
• Tokens saved: ${savedTokens.toLocaleString()}
• Messages compressed: ${session.messageCount}
• Tools used: ${session.toolCalls.length}
• Total saved so far: ${session.tokensSaved.toLocaleString()}

${summary}

✨ Context reset - you can continue normally.`;
    
    data.wrapper_compact = {
      savedTokens,
      summary,
      totalSaved: session.tokensSaved,
      compactCount: session.compactCount
    };
    
    this.log('compact', 'Compaction complete', {
      savedTokens,
      totalSaved: session.tokensSaved,
      compactCount: session.compactCount
    });
    
    // Emit compaction event
    this.emit('compaction', {
      sessionId: session.id,
      savedTokens,
      summary
    });
  }
  
  /**
   * Generate summary
   */
  generateSummary(session) {
    const lines = [];
    
    // Tool usage summary
    if (Object.keys(session.toolsByName).length > 0) {
      const topTools = Object.entries(session.toolsByName)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => `${name} (${count}x)`)
        .join(', ');
      lines.push(`📦 Tools: ${topTools}`);
    }
    
    // Recent messages
    const recentUser = session.userMessages.slice(-3);
    if (recentUser.length > 0) {
      lines.push(`💬 Recent topics: ${recentUser.map(m => {
        const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        return content.substring(0, 30) + (content.length > 30 ? '...' : '');
      }).join(' | ')}`);
    }
    
    // API call breakdown
    if (Object.keys(session.apiTypes).length > 0) {
      const apiSummary = Object.entries(session.apiTypes)
        .map(([type, count]) => `${type}: ${count}`)
        .join(', ');
      lines.push(`📡 API calls: ${apiSummary}`);
    }
    
    return lines.join('\n');
  }
  
  /**
   * Get augmentation data
   */
  getAugmentation(session) {
    return {
      enabled: true,
      version: '1.0.0',
      session: {
        id: session.id,
        messageCount: session.messageCount,
        isStreaming: session.isStreaming,
        created: session.created
      },
      tokens: {
        input: session.inputTokens,
        output: session.outputTokens,
        cacheCreation: session.cacheCreationTokens,
        cacheRead: session.cacheReadTokens,
        total: session.totalTokens,
        max: this.config.maxTokens,
        percentage: Math.round(session.totalTokens / this.config.maxTokens * 100),
        remaining: this.config.maxTokens - session.totalTokens
      },
      compaction: {
        count: session.compactCount,
        lastCompact: session.lastCompact,
        wasCompacted: session.wasCompacted,
        tokensSaved: session.tokensSaved
      },
      tools: {
        total: session.toolCalls.length,
        byName: session.toolsByName
      },
      api: {
        total: session.apiResponses.length,
        types: session.apiTypes
      }
    };
  }
  
  /**
   * Log session statistics
   */
  logSessionStats(sessionId) {
    const session = this.getSession(sessionId);
    
    console.log('');
    console.log('════════════════════════════════════════════════════════');
    console.log(`📊 SESSION STATS: ${sessionId}`);
    console.log('────────────────────────────────────────────────────────');
    console.log(`Messages: ${session.messageCount}`);
    console.log(`Tokens: ${session.totalTokens} (${Math.round(session.totalTokens / this.config.maxTokens * 100)}%)`);
    console.log(`API Calls: ${session.apiResponses.length}`);
    console.log(`Tool Calls: ${session.toolCalls.length}`);
    console.log(`Compactions: ${session.compactCount}`);
    console.log(`Tokens Saved: ${session.tokensSaved}`);
    console.log(`Errors: ${session.errors.length}`);
    console.log('════════════════════════════════════════════════════════');
    console.log('');
  }
  
  /**
   * Get statistics
   */
  getStats(sessionId) {
    if (sessionId) {
      const session = this.getSession(sessionId);
      return {
        session: {
          ...session,
          isActive: this.activeProcesses.has(sessionId)
        }
      };
    }
    
    // Global stats
    return {
      global: this.stats,
      sessions: Array.from(this.sessions.entries()).map(([id, session]) => ({
        id,
        messages: session.messageCount,
        tokens: session.totalTokens,
        apiCalls: session.apiResponses.length,
        isActive: this.activeProcesses.has(id)
      })),
      totalApiCalls: this.allApiCalls.length
    };
  }
}

// ============================================
// INITIALIZE AND EXPORT
// ============================================

const wrapper = new UniversalClaudeWrapper();

// Make available globally
global.claudeWrapper = wrapper;

// Export for import
export default wrapper;

// Log ready
console.log('🎯 Wrapper ready for process wrapping');
console.log('🎯 Usage: claudeWrapper.wrapProcess(claudeProcess, sessionId);');
console.log('');