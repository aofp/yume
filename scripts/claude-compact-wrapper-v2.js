#!/usr/bin/env node

/**
 * Claude Compact Wrapper V2 - Token Truth Source
 * 
 * This wrapper is the authoritative source for:
 * - Token counting and accumulation
 * - Token usage percentage
 * - Compact summary generation
 * - Session history tracking
 * 
 * Every message gets augmented with complete token state.
 */

const { spawn, execSync } = require('child_process');
const { EventEmitter } = require('events');
const readline = require('readline');
const path = require('path');
const fs = require('fs');
const os = require('os');

class ClaudeCompactWrapperV2 extends EventEmitter {
  constructor(config = {}) {
    super();
    
    // Configuration
    this.config = {
      maxTokens: config.maxTokens || 100000,
      enabled: config.enabled !== false,
      debug: config.debug || false,
      compactThreshold: config.compactThreshold || 75000,
      summaryMaxLength: config.summaryMaxLength || 500,
      ...config
    };
    
    // Session management
    this.sessions = new Map();
    this.currentSessionId = null;
    this.platform = os.platform();
    this.isWSL = this.detectWSL();
    
    // Claude process
    this.claudeProcess = null;
    this.claudePath = null;
    
    // Message tracking for summary
    this.messageBuffer = [];
    this.maxMessageBuffer = 100;
    
    this.log('info', 'ClaudeCompactWrapperV2 initialized', this.config);
  }
  
  /**
   * Log utility
   */
  log(level, message, data = null) {
    if (this.config.debug || level === 'error') {
      console.error(`[WRAPPER-V2] [${level.toUpperCase()}] ${message}`, data || '');
    }
    
    this.emit('log', { level, message, data, timestamp: Date.now() });
  }
  
  /**
   * Detect WSL environment
   */
  detectWSL() {
    if (this.platform !== 'linux') return false;
    try {
      return fs.readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft');
    } catch {
      return false;
    }
  }
  
  /**
   * Get or create session
   */
  getOrCreateSession(sessionId = null) {
    const id = sessionId || this.currentSessionId || 'default';
    
    if (!this.sessions.has(id)) {
      this.sessions.set(id, {
        // Token tracking
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCacheTokens: 0,
        totalTokens: 0,
        
        // Message history
        messages: [],
        messageCount: 0,
        
        // Compact tracking
        compactCount: 0,
        lastCompact: null,
        totalTokensSaved: 0,
        lastCompactSummary: null,
        
        // State
        isCompacting: false,
        wasCompacted: false,
        created: Date.now(),
        
        // Metrics
        tokenHistory: [],
        avgTokensPerMessage: 0
      });
    }
    
    return this.sessions.get(id);
  }
  
  /**
   * Main processing - augment EVERY line with token state
   */
  processStreamLine(line) {
    if (!line.trim()) return line;
    
    try {
      const data = JSON.parse(line);
      
      // Update session ID if present
      if (data.session_id) {
        this.currentSessionId = data.session_id;
      }
      
      // CRITICAL: Track tokens from EVERY message with usage
      if (data.usage) {
        this.updateTokenCounts(data.usage);
      }
      
      // Store message content for summary generation
      if (data.type === 'assistant' && data.message) {
        this.storeMessage('assistant', data.message);
      } else if (data.type === 'user' && data.message) {
        this.storeMessage('user', data.message);
      }
      
      // ALWAYS inject complete token state into EVERY message
      data.wrapper_token_state = this.getCompleteTokenState();
      
      // Special handling for compact results
      if (this.isCompactResult(data)) {
        data = this.augmentCompactResult(data);
      }
      
      // Special handling for result messages
      if (data.type === 'result') {
        data = this.augmentResultMessage(data);
      }
      
      return JSON.stringify(data);
      
    } catch (e) {
      // Not JSON, pass through
      return line;
    }
  }
  
  /**
   * Update token counts - THE source of truth
   */
  updateTokenCounts(usage) {
    const session = this.getOrCreateSession();
    
    // Accumulate all token types
    const inputTokens = usage.input_tokens || 0;
    const outputTokens = usage.output_tokens || 0;
    const cacheCreation = usage.cache_creation_input_tokens || 0;
    const cacheRead = usage.cache_read_input_tokens || 0;
    
    session.totalInputTokens += inputTokens + cacheCreation;
    session.totalOutputTokens += outputTokens;
    session.totalCacheTokens += cacheRead;
    
    // Calculate total
    const previousTotal = session.totalTokens;
    session.totalTokens = session.totalInputTokens + session.totalOutputTokens;
    
    // Track history
    session.tokenHistory.push({
      timestamp: Date.now(),
      input: inputTokens,
      output: outputTokens,
      total: session.totalTokens,
      delta: session.totalTokens - previousTotal
    });
    
    // Keep last 100 entries
    if (session.tokenHistory.length > 100) {
      session.tokenHistory.shift();
    }
    
    // Calculate average
    if (session.messageCount > 0) {
      session.avgTokensPerMessage = Math.round(session.totalTokens / session.messageCount);
    }
    
    this.log('debug', `Tokens updated: ${session.totalTokens}/${this.config.maxTokens} (${Math.round(session.totalTokens/this.config.maxTokens*100)}%)`);
    
    // Emit token update event
    this.emit('tokens-updated', {
      sessionId: this.currentSessionId,
      tokens: session.totalTokens,
      percentage: session.totalTokens / this.config.maxTokens
    });
  }
  
  /**
   * Store message content for summary generation
   */
  storeMessage(role, message) {
    const session = this.getOrCreateSession();
    
    // Extract text content
    let content = '';
    if (message.content) {
      if (typeof message.content === 'string') {
        content = message.content;
      } else if (Array.isArray(message.content)) {
        content = message.content.map(block => {
          if (block.type === 'text') return block.text;
          if (block.type === 'tool_use') return `[Tool: ${block.name}]`;
          if (block.type === 'tool_result') return `[Result: ${block.content?.substring(0, 100)}...]`;
          return '';
        }).join('\n');
      }
    }
    
    // Store structured message
    const storedMessage = {
      timestamp: Date.now(),
      role,
      content,
      tokens: session.totalTokens,
      tools: this.extractTools(message),
      code: this.extractCode(content)
    };
    
    session.messages.push(storedMessage);
    session.messageCount++;
    
    // Keep rolling window
    if (session.messages.length > this.maxMessageBuffer) {
      session.messages.shift();
    }
    
    // Also store in global buffer for summary
    this.messageBuffer.push(storedMessage);
    if (this.messageBuffer.length > this.maxMessageBuffer) {
      this.messageBuffer.shift();
    }
  }
  
  /**
   * Extract tool usage from message
   */
  extractTools(message) {
    const tools = [];
    
    if (message.content && Array.isArray(message.content)) {
      message.content.forEach(block => {
        if (block.type === 'tool_use') {
          tools.push({
            name: block.name,
            input: block.input
          });
        }
      });
    }
    
    return tools;
  }
  
  /**
   * Extract code blocks from content
   */
  extractCode(content) {
    const codeBlocks = [];
    const codeRegex = /```(\w+)?\n([\s\S]*?)```/g;
    let match;
    
    while ((match = codeRegex.exec(content)) !== null) {
      codeBlocks.push({
        language: match[1] || 'plain',
        code: match[2]
      });
    }
    
    return codeBlocks;
  }
  
  /**
   * Get complete token state for injection
   */
  getCompleteTokenState() {
    const session = this.getOrCreateSession();
    
    const current = session.totalTokens;
    const max = this.config.maxTokens;
    const percentage = current / max;
    const remaining = max - current;
    
    return {
      // Session totals
      session: {
        id: this.currentSessionId,
        input_tokens: session.totalInputTokens,
        output_tokens: session.totalOutputTokens,
        cache_tokens: session.totalCacheTokens,
        total_tokens: current,
        message_count: session.messageCount
      },
      
      // Usage info
      usage: {
        current,
        max,
        percentage,
        percentage_display: `${Math.round(percentage * 100)}%`,
        tokens_remaining: remaining,
        tokens_used_display: `${this.formatTokenCount(current)}/${this.formatTokenCount(max)}`
      },
      
      // Thresholds
      thresholds: {
        warning: Math.round(max * 0.7),
        critical: Math.round(max * 0.9),
        compact: this.config.compactThreshold,
        will_compact_in: Math.max(0, this.config.compactThreshold - current),
        should_compact: current > this.config.compactThreshold
      },
      
      // Compact info
      compact: {
        available: current > 1000,
        recommended: current > this.config.compactThreshold,
        last_compact: session.lastCompact,
        compact_count: session.compactCount,
        total_saved: session.totalTokensSaved
      },
      
      // Estimates
      estimates: {
        avg_message_tokens: session.avgTokensPerMessage,
        messages_remaining: session.avgTokensPerMessage > 0 
          ? Math.floor(remaining / session.avgTokensPerMessage)
          : 'N/A',
        percentage_per_message: session.avgTokensPerMessage > 0
          ? (session.avgTokensPerMessage / max * 100).toFixed(1) + '%'
          : 'N/A'
      }
    };
  }
  
  /**
   * Format token count for display
   */
  formatTokenCount(count) {
    if (count < 1000) return count.toString();
    if (count < 1000000) return `${(count / 1000).toFixed(1)}k`;
    return `${(count / 1000000).toFixed(2)}m`;
  }
  
  /**
   * Check if this is a compact result
   */
  isCompactResult(data) {
    // Compact results have empty result and 0 tokens
    return data.type === 'result' &&
           data.result === '' &&
           data.usage?.input_tokens === 0 &&
           data.usage?.output_tokens === 0;
  }
  
  /**
   * Augment compact result with summary
   */
  augmentCompactResult(data) {
    const session = this.getOrCreateSession();
    
    this.log('info', 'Augmenting compact result with generated summary');
    
    // Generate summary from tracked messages
    const summary = this.generateCompactSummary();
    
    // Store summary
    session.lastCompactSummary = summary;
    session.lastCompact = Date.now();
    session.compactCount++;
    
    // Calculate token savings
    const savedTokens = session.totalTokens;
    session.totalTokensSaved += savedTokens;
    
    // Reset token counts
    session.totalInputTokens = 0;
    session.totalOutputTokens = 0;
    session.totalCacheTokens = 0;
    session.totalTokens = 0;
    session.wasCompacted = true;
    
    // Clear message history (compacted)
    session.messages = [];
    this.messageBuffer = [];
    
    // Augment the result with summary
    data.result = this.formatSummaryForDisplay(summary, savedTokens);
    data.wrapper_compact_summary = summary;
    data.wrapper_token_savings = {
      before: savedTokens,
      after: 0,
      saved: savedTokens,
      percentage: 100,
      total_saved: session.totalTokensSaved
    };
    
    this.emit('compact-complete', {
      sessionId: this.currentSessionId,
      summary,
      savedTokens
    });
    
    return data;
  }
  
  /**
   * Generate compact summary from messages
   */
  generateCompactSummary() {
    const session = this.getOrCreateSession();
    const messages = session.messages || [];
    
    // Analyze conversation
    const analysis = {
      topics: [],
      tools: new Set(),
      codeBlocks: 0,
      files: new Set(),
      errors: [],
      keyPoints: []
    };
    
    // Process messages
    messages.forEach(msg => {
      // Extract tools
      if (msg.tools && msg.tools.length > 0) {
        msg.tools.forEach(t => analysis.tools.add(t.name));
      }
      
      // Count code blocks
      if (msg.code && msg.code.length > 0) {
        analysis.codeBlocks += msg.code.length;
      }
      
      // Extract file operations
      const fileMatches = msg.content.match(/\b(\w+\.\w+)\b/g);
      if (fileMatches) {
        fileMatches.forEach(f => {
          if (f.includes('.')) analysis.files.add(f);
        });
      }
      
      // Extract key points (first line of user messages)
      if (msg.role === 'user' && msg.content) {
        const firstLine = msg.content.split('\n')[0];
        if (firstLine.length > 10 && firstLine.length < 200) {
          analysis.keyPoints.push(firstLine);
        }
      }
    });
    
    // Extract main topics from key points
    analysis.topics = this.extractTopics(analysis.keyPoints);
    
    // Build summary object
    return {
      timestamp: new Date().toISOString(),
      message_count: messages.length,
      topics: analysis.topics,
      tools_used: Array.from(analysis.tools),
      code_blocks: analysis.codeBlocks,
      files_touched: Array.from(analysis.files).slice(0, 10),
      key_points: analysis.keyPoints.slice(-5), // Last 5 key points
      token_count: session.totalTokens
    };
  }
  
  /**
   * Extract main topics from messages
   */
  extractTopics(keyPoints) {
    // Simple topic extraction - group by common words
    const topics = [];
    const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for']);
    
    // Count word frequency
    const wordFreq = {};
    keyPoints.forEach(point => {
      const words = point.toLowerCase().split(/\s+/);
      words.forEach(word => {
        if (word.length > 3 && !commonWords.has(word)) {
          wordFreq[word] = (wordFreq[word] || 0) + 1;
        }
      });
    });
    
    // Get top topics
    Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([word, count]) => {
        if (count > 1) {
          topics.push(word);
        }
      });
    
    return topics.length > 0 ? topics : ['general discussion'];
  }
  
  /**
   * Format summary for display
   */
  formatSummaryForDisplay(summary, savedTokens) {
    const lines = [
      '📊 Conversation Compacted Successfully',
      '',
      '📝 Summary:',
      `• Messages processed: ${summary.message_count}`,
      `• Topics discussed: ${summary.topics.join(', ')}`,
    ];
    
    if (summary.tools_used.length > 0) {
      lines.push(`• Tools used: ${summary.tools_used.join(', ')}`);
    }
    
    if (summary.code_blocks > 0) {
      lines.push(`• Code blocks: ${summary.code_blocks}`);
    }
    
    if (summary.files_touched.length > 0) {
      lines.push(`• Files: ${summary.files_touched.slice(0, 5).join(', ')}`);
    }
    
    if (summary.key_points.length > 0) {
      lines.push('', '🎯 Recent discussion:');
      summary.key_points.forEach(point => {
        lines.push(`• ${point.substring(0, 80)}${point.length > 80 ? '...' : ''}`);
      });
    }
    
    lines.push(
      '',
      '💾 Token Savings:',
      `• Tokens before: ${this.formatTokenCount(savedTokens)}`,
      `• Tokens after: 0`,
      `• Saved: ${this.formatTokenCount(savedTokens)} (100%)`,
      '',
      '✅ You can continue the conversation normally.'
    );
    
    return lines.join('\n');
  }
  
  /**
   * Augment result messages with token info
   */
  augmentResultMessage(data) {
    const session = this.getOrCreateSession();
    
    // Add display-friendly token info
    data.wrapper_display = {
      tokens: `${this.formatTokenCount(session.totalTokens)}/${this.formatTokenCount(this.config.maxTokens)}`,
      percentage: `${Math.round(session.totalTokens / this.config.maxTokens * 100)}%`,
      session_id: this.currentSessionId
    };
    
    return data;
  }
  
  /**
   * Find Claude binary
   */
  findClaudeBinary() {
    if (this.claudePath) return this.claudePath;
    
    const paths = [
      '/opt/homebrew/bin/claude',
      '/usr/local/bin/claude',
      '/usr/bin/claude',
      path.join(os.homedir(), '.local/bin/claude')
    ];
    
    for (const testPath of paths) {
      if (fs.existsSync(testPath)) {
        this.claudePath = testPath;
        return testPath;
      }
    }
    
    // Try system PATH
    try {
      const cmd = this.platform === 'win32' ? 'where claude' : 'which claude';
      this.claudePath = execSync(cmd, { encoding: 'utf8' }).trim().split('\n')[0];
      return this.claudePath;
    } catch {
      throw new Error('Claude CLI not found');
    }
  }
  
  /**
   * Spawn Claude with monitoring
   */
  async spawnClaude(args) {
    const claudePath = this.findClaudeBinary();
    
    this.log('info', `Spawning Claude: ${claudePath}`, { args });
    
    this.claudeProcess = spawn(claudePath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });
    
    // Process output through our augmentation
    const rl = readline.createInterface({
      input: this.claudeProcess.stdout,
      crlfDelay: Infinity
    });
    
    rl.on('line', (line) => {
      // Process and augment line
      const augmented = this.processStreamLine(line);
      // Output augmented line
      console.log(augmented);
    });
    
    // Pass through stderr
    this.claudeProcess.stderr.on('data', (data) => {
      process.stderr.write(data);
    });
    
    return this.claudeProcess;
  }
  
  /**
   * Get statistics
   */
  getStats() {
    const stats = {
      sessions: this.sessions.size,
      currentSession: this.currentSessionId,
      totalMessages: 0,
      totalTokens: 0,
      totalCompacts: 0,
      totalSaved: 0
    };
    
    for (const [id, session] of this.sessions) {
      stats.totalMessages += session.messageCount;
      stats.totalTokens += session.totalTokens;
      stats.totalCompacts += session.compactCount;
      stats.totalSaved += session.totalTokensSaved;
    }
    
    return stats;
  }
}

// Export for use
module.exports = ClaudeCompactWrapperV2;

// CLI usage
if (require.main === module) {
  const wrapper = new ClaudeCompactWrapperV2({
    debug: true,
    maxTokens: 100000
  });
  
  const args = process.argv.slice(2);
  
  wrapper.spawnClaude(args).then(() => {
    console.error('Claude process completed');
  }).catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
}