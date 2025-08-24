#!/usr/bin/env node

/**
 * Universal Claude Process Wrapper
 * 
 * SYSTEMATIC APPROACH:
 * 1. Intercepts ALL claude CLI calls
 * 2. Captures EVERY API response
 * 3. Works identically on macOS and Windows
 * 4. Provides complete token tracking
 * 5. Handles all error conditions
 * 
 * Integration Points:
 * - Direct spawn replacement in server
 * - Stream augmentation for all messages
 * - Session state management
 * - Cross-platform compatibility
 */

const { spawn, execSync } = require('child_process');
const { EventEmitter } = require('events');
const readline = require('readline');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Platform detection
const PLATFORM = os.platform();
const IS_WINDOWS = PLATFORM === 'win32';
const IS_MACOS = PLATFORM === 'darwin';
const IS_LINUX = PLATFORM === 'linux';
const IS_WSL = IS_LINUX && fs.existsSync('/proc/version') && 
               fs.readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft');

class UniversalClaudeWrapper extends EventEmitter {
  constructor(config = {}) {
    super();
    
    // Configuration with defaults
    this.config = {
      maxTokens: 100000,
      enabled: true,
      debug: false,
      captureAll: true,
      augmentStream: true,
      trackTokens: true,
      compactThreshold: 75000,
      healthCheckInterval: 5000,
      bufferLimit: 10 * 1024 * 1024, // 10MB
      ...config
    };
    
    // Session management
    this.sessions = new Map();
    this.currentSessionId = null;
    
    // Process management
    this.activeProcesses = new Map();
    this.claudePath = null;
    
    // Stream processing
    this.buffers = new Map();
    this.healthChecks = new Map();
    
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
    
    this.log('info', 'Universal Claude Wrapper initialized', {
      platform: PLATFORM,
      isWSL: IS_WSL,
      config: this.config
    });
    
    // Find Claude binary on initialization
    this.findClaudeBinary();
  }
  
  /**
   * Logging with levels
   */
  log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      data,
      platform: PLATFORM
    };
    
    if (this.config.debug || level === 'error') {
      console.error(`[WRAPPER] [${level.toUpperCase()}] ${message}`, data || '');
    }
    
    this.emit('log', logEntry);
  }
  
  /**
   * Find Claude binary across platforms
   */
  findClaudeBinary() {
    // Check if already found
    if (this.claudePath && fs.existsSync(this.claudePath)) {
      return this.claudePath;
    }
    
    // Platform-specific paths
    const searchPaths = [];
    
    if (IS_MACOS) {
      searchPaths.push(
        '/opt/homebrew/bin/claude',
        '/usr/local/bin/claude',
        path.join(os.homedir(), '.local/bin/claude')
      );
    } else if (IS_WINDOWS) {
      searchPaths.push(
        'C:\\Program Files\\Claude\\claude.exe',
        'C:\\Users\\' + os.userInfo().username + '\\AppData\\Local\\Claude\\claude.exe',
        path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'claude', 'claude.exe')
      );
    } else if (IS_WSL) {
      // In WSL, try to find Windows claude.exe
      searchPaths.push(
        '/mnt/c/Users/' + process.env.USER + '/AppData/Local/Programs/claude/claude.exe',
        '/mnt/c/Program Files/Claude/claude.exe'
      );
    } else {
      // Linux
      searchPaths.push(
        '/usr/local/bin/claude',
        '/usr/bin/claude',
        path.join(os.homedir(), '.local/bin/claude')
      );
    }
    
    // Check each path
    for (const testPath of searchPaths) {
      if (fs.existsSync(testPath)) {
        this.claudePath = testPath;
        this.log('info', `Found Claude at: ${testPath}`);
        return testPath;
      }
    }
    
    // Try system PATH
    try {
      let command;
      if (IS_WINDOWS && !IS_WSL) {
        command = 'where claude';
      } else {
        command = 'which claude';
      }
      
      const result = execSync(command, { encoding: 'utf8' }).trim();
      const paths = result.split('\n').filter(p => p);
      
      if (paths.length > 0) {
        this.claudePath = paths[0];
        this.log('info', `Found Claude in PATH: ${this.claudePath}`);
        return this.claudePath;
      }
    } catch (e) {
      this.log('debug', 'Claude not found in PATH');
    }
    
    this.log('error', 'Claude CLI not found on system');
    throw new Error('Claude CLI not found. Please install it first.');
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
        
        // Streaming state
        isStreaming: false,
        lastAssistantMessageId: null,
        
        // Error tracking
        errors: [],
        
        // Performance metrics
        metrics: {
          avgResponseTime: 0,
          totalResponseTime: 0,
          responseCount: 0
        }
      });
    }
    
    return this.sessions.get(sessionId);
  }
  
  /**
   * Main spawn function - replaces direct claude spawn
   */
  async spawnClaude(args, options = {}) {
    const sessionId = options.sessionId || this.currentSessionId || 'default';
    const workingDir = options.cwd || process.cwd();
    const env = options.env || process.env;
    
    this.currentSessionId = sessionId;
    const session = this.getSession(sessionId);
    
    this.stats.totalSpawns++;
    
    this.log('info', `Spawning Claude for session ${sessionId}`, {
      args,
      workingDir,
      platform: PLATFORM
    });
    
    // Ensure Claude path is found
    const claudePath = this.findClaudeBinary();
    
    // Platform-specific spawn options
    let spawnCommand = claudePath;
    let spawnArgs = args;
    let spawnOptions = {
      cwd: workingDir,
      env: { ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      detached: false
    };
    
    // Handle WSL specially
    if (IS_WSL) {
      // Convert WSL path to Windows path
      const winPath = workingDir.replace('/mnt/c/', 'C:\\\\').replace(/\//g, '\\\\');
      spawnCommand = 'cmd.exe';
      spawnArgs = ['/c', 'cd', winPath, '&&', claudePath, ...args];
    }
    
    // Spawn the process
    const claudeProcess = spawn(spawnCommand, spawnArgs, spawnOptions);
    
    if (!claudeProcess.pid) {
      throw new Error('Failed to spawn Claude process');
    }
    
    // Store process reference
    this.activeProcesses.set(sessionId, claudeProcess);
    
    // Set up stream processing
    this.setupStreamProcessing(claudeProcess, sessionId);
    
    // Set up health monitoring
    this.setupHealthMonitoring(claudeProcess, sessionId);
    
    // Handle process exit
    claudeProcess.on('exit', (code, signal) => {
      this.handleProcessExit(sessionId, code, signal);
    });
    
    // Handle process errors
    claudeProcess.on('error', (error) => {
      this.handleProcessError(sessionId, error);
    });
    
    return claudeProcess;
  }
  
  /**
   * Set up stream processing for stdout
   */
  setupStreamProcessing(claudeProcess, sessionId) {
    const session = this.getSession(sessionId);
    const buffer = { data: '', size: 0 };
    this.buffers.set(sessionId, buffer);
    
    // Create readline interface for line-by-line processing
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
      
      this.emit('error', {
        sessionId,
        error
      });
    });
    
    // Handle stdin
    if (claudeProcess.stdin) {
      process.stdin.pipe(claudeProcess.stdin);
    }
  }
  
  /**
   * Process individual line from Claude output
   */
  processLine(line, sessionId) {
    if (!line || !line.trim()) return line;
    
    const session = this.getSession(sessionId);
    
    try {
      // Parse JSON line
      const data = JSON.parse(line);
      
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
      if (data.tool_calls || data.tool_use) {
        this.trackToolUsage(data, sessionId);
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
      if (this.config.augmentStream) {
        data.wrapper = this.getAugmentationData(sessionId);
      }
      
      return JSON.stringify(data);
      
    } catch (e) {
      // Not JSON or error - pass through unchanged
      return line;
    }
  }
  
  /**
   * Capture API response for analysis
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
    
    this.emit('api-response', {
      sessionId,
      response
    });
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
    
    this.log('debug', `Tokens updated for ${sessionId}`, {
      input: session.inputTokens,
      output: session.outputTokens,
      total: session.totalTokens,
      percentage: (session.totalTokens / this.config.maxTokens * 100).toFixed(1)
    });
    
    this.emit('tokens-updated', {
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
    
    // Store in global history
    if (!this.messageHistory.has(sessionId)) {
      this.messageHistory.set(sessionId, []);
    }
    this.messageHistory.get(sessionId).push(message);
    
    this.emit('message', {
      sessionId,
      message
    });
  }
  
  /**
   * Track tool usage
   */
  trackToolUsage(data, sessionId) {
    const session = this.getSession(sessionId);
    
    const toolUsage = {
      timestamp: Date.now(),
      tools: []
    };
    
    if (data.tool_calls) {
      toolUsage.tools = data.tool_calls.map(t => ({
        name: t.name || t.function?.name,
        input: t.input || t.function?.arguments
      }));
    } else if (data.tool_use) {
      toolUsage.tools = [{
        name: data.tool_use.name,
        input: data.tool_use.input
      }];
    }
    
    if (toolUsage.tools.length > 0) {
      session.toolCalls.push(toolUsage);
      
      this.emit('tools-used', {
        sessionId,
        tools: toolUsage.tools
      });
    }
  }
  
  /**
   * Handle result message
   */
  handleResult(data, sessionId) {
    const session = this.getSession(sessionId);
    
    // Update metrics
    if (session.lastMessageTime) {
      const responseTime = Date.now() - session.lastMessageTime;
      session.metrics.responseCount++;
      session.metrics.totalResponseTime += responseTime;
      session.metrics.avgResponseTime = 
        session.metrics.totalResponseTime / session.metrics.responseCount;
    }
    
    this.emit('result', {
      sessionId,
      result: data.result,
      usage: data.usage,
      metrics: session.metrics
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
   * Handle compaction
   */
  handleCompaction(data, sessionId) {
    const session = this.getSession(sessionId);
    
    const savedTokens = session.totalTokens;
    
    // Reset session
    session.compactCount++;
    session.lastCompact = Date.now();
    session.wasCompacted = true;
    session.inputTokens = 0;
    session.outputTokens = 0;
    session.cacheTokens = 0;
    session.totalTokens = 0;
    
    this.stats.compacts++;
    
    // Generate summary
    const summary = this.generateSummary(sessionId);
    
    // Augment result
    data.result = `✅ Conversation compacted successfully\n\n` +
                  `Saved ${savedTokens} tokens\n` +
                  `${summary}`;
    
    data.compaction = {
      saved: savedTokens,
      summary,
      timestamp: Date.now()
    };
    
    this.emit('compaction', {
      sessionId,
      savedTokens,
      summary
    });
  }
  
  /**
   * Generate conversation summary
   */
  generateSummary(sessionId) {
    const session = this.getSession(sessionId);
    const messages = session.messages.slice(-20); // Last 20 messages
    
    const summary = {
      messageCount: session.messageCount,
      toolsUsed: session.toolCalls.length,
      duration: Date.now() - session.created,
      topics: []
    };
    
    // Simple topic extraction
    const words = {};
    messages.forEach(msg => {
      const tokens = msg.content.toLowerCase().split(/\s+/);
      tokens.forEach(token => {
        if (token.length > 4) {
          words[token] = (words[token] || 0) + 1;
        }
      });
    });
    
    summary.topics = Object.entries(words)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);
    
    return `Summary: ${summary.messageCount} messages, ` +
           `${summary.toolsUsed} tool calls, ` +
           `topics: ${summary.topics.join(', ')}`;
  }
  
  /**
   * Get augmentation data for stream
   */
  getAugmentationData(sessionId) {
    const session = this.getSession(sessionId);
    
    return {
      session: {
        id: sessionId,
        created: session.created,
        messageCount: session.messageCount,
        isStreaming: session.isStreaming
      },
      tokens: {
        input: session.inputTokens,
        output: session.outputTokens,
        cache: session.cacheTokens,
        total: session.totalTokens,
        max: this.config.maxTokens,
        percentage: (session.totalTokens / this.config.maxTokens * 100).toFixed(1) + '%',
        remaining: this.config.maxTokens - session.totalTokens
      },
      compaction: {
        count: session.compactCount,
        lastCompact: session.lastCompact,
        wasCompacted: session.wasCompacted,
        shouldCompact: session.totalTokens > this.config.compactThreshold
      },
      metrics: session.metrics,
      platform: PLATFORM,
      wrapper: 'universal-1.0.0'
    };
  }
  
  /**
   * Set up health monitoring
   */
  setupHealthMonitoring(claudeProcess, sessionId) {
    const healthCheck = setInterval(() => {
      if (!claudeProcess.killed && claudeProcess.pid) {
        this.emit('health', {
          sessionId,
          pid: claudeProcess.pid,
          uptime: Date.now() - this.getSession(sessionId).created
        });
      } else {
        clearInterval(healthCheck);
        this.healthChecks.delete(sessionId);
      }
    }, this.config.healthCheckInterval);
    
    this.healthChecks.set(sessionId, healthCheck);
  }
  
  /**
   * Handle process exit
   */
  handleProcessExit(sessionId, code, signal) {
    const session = this.getSession(sessionId);
    
    session.isStreaming = false;
    this.activeProcesses.delete(sessionId);
    
    if (this.healthChecks.has(sessionId)) {
      clearInterval(this.healthChecks.get(sessionId));
      this.healthChecks.delete(sessionId);
    }
    
    this.buffers.delete(sessionId);
    
    this.log('info', `Process exited for ${sessionId}`, { code, signal });
    
    this.emit('process-exit', {
      sessionId,
      code,
      signal,
      session
    });
  }
  
  /**
   * Handle process error
   */
  handleProcessError(sessionId, error) {
    const session = this.getSession(sessionId);
    
    session.errors.push({
      timestamp: Date.now(),
      error: error.message
    });
    
    this.stats.errors++;
    
    this.log('error', `Process error for ${sessionId}`, error);
    
    this.emit('process-error', {
      sessionId,
      error: error.message || error.toString()
    });
  }
  
  /**
   * Kill process for session
   */
  killProcess(sessionId) {
    if (this.activeProcesses.has(sessionId)) {
      const process = this.activeProcesses.get(sessionId);
      process.kill('SIGTERM');
      this.activeProcesses.delete(sessionId);
      
      this.log('info', `Killed process for ${sessionId}`);
    }
  }
  
  /**
   * Get session statistics
   */
  getSessionStats(sessionId) {
    const session = this.getSession(sessionId);
    
    return {
      ...session,
      apiResponseCount: session.apiResponses.length,
      isActive: this.activeProcesses.has(sessionId)
    };
  }
  
  /**
   * Get all statistics
   */
  getAllStats() {
    const sessionStats = [];
    
    for (const [id, session] of this.sessions) {
      sessionStats.push({
        id,
        messages: session.messageCount,
        tokens: session.totalTokens,
        active: this.activeProcesses.has(id)
      });
    }
    
    return {
      global: this.stats,
      sessions: sessionStats,
      activeProcesses: this.activeProcesses.size,
      platform: PLATFORM,
      claudePath: this.claudePath
    };
  }
  
  /**
   * Clear session data
   */
  clearSession(sessionId) {
    this.killProcess(sessionId);
    this.sessions.delete(sessionId);
    this.apiResponses.delete(sessionId);
    this.messageHistory.delete(sessionId);
    
    this.log('info', `Cleared session ${sessionId}`);
  }
  
  /**
   * Export session data
   */
  exportSessionData(sessionId) {
    const session = this.getSession(sessionId);
    const apiResponses = this.apiResponses.get(sessionId) || [];
    const messageHistory = this.messageHistory.get(sessionId) || [];
    
    return {
      session,
      apiResponses,
      messageHistory,
      exported: Date.now()
    };
  }
}

// Export for use as module
module.exports = UniversalClaudeWrapper;

// CLI usage
if (require.main === module) {
  const wrapper = new UniversalClaudeWrapper({
    debug: process.env.DEBUG === 'true',
    maxTokens: parseInt(process.env.MAX_TOKENS || '100000')
  });
  
  // Set up event logging
  wrapper.on('log', (log) => {
    if (log.level === 'error' || process.env.DEBUG === 'true') {
      fs.appendFileSync('wrapper.log', JSON.stringify(log) + '\n');
    }
  });
  
  // Get CLI arguments
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: node claude-process-wrapper.js [claude arguments]');
    process.exit(1);
  }
  
  // Spawn claude with wrapper
  wrapper.spawnClaude(args, {
    sessionId: 'cli-' + Date.now(),
    cwd: process.cwd()
  }).then(claudeProcess => {
    // Wait for process to exit
    claudeProcess.on('exit', (code) => {
      process.exit(code || 0);
    });
  }).catch(error => {
    console.error('Failed to spawn Claude:', error);
    process.exit(1);
  });
}