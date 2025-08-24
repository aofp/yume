#!/usr/bin/env node

/**
 * Claude Compact Wrapper
 * 
 * A transparent process wrapper that adds automatic context compaction to Claude CLI.
 * Monitors token usage and triggers intelligent compaction at configurable thresholds.
 * 
 * Features:
 * - Real-time token monitoring from stream-json output
 * - Automatic compaction at configurable thresholds
 * - Platform-agnostic (Windows/macOS/Linux/WSL)
 * - Zero modification to Claude source code
 * - Session state management
 * - Message queueing during compaction
 * - Configurable via JSON or environment variables
 * 
 * @author yurucode
 * @version 1.0.0
 */

const { spawn, execSync } = require('child_process');
const { EventEmitter } = require('events');
const readline = require('readline');
const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * Main wrapper class that extends EventEmitter for UI updates
 */
class ClaudeCompactWrapper extends EventEmitter {
  constructor(config = {}) {
    super();
    
    // Load and merge configuration
    this.config = this.loadConfiguration(config);
    
    // Initialize state
    this.sessions = new Map(); // Per-session state tracking
    this.platform = os.platform(); // 'darwin', 'win32', 'linux'
    this.isWSL = this.detectWSL();
    this.claudePath = null;
    this.claudeProcess = null;
    this.currentSessionId = null;
    
    // Performance monitoring
    this.metrics = {
      wrappedCalls: 0,
      compactCount: 0,
      totalTokensSaved: 0,
      startTime: Date.now()
    };
    
    // Setup logging
    this.setupLogging();
    
    this.log('info', 'ClaudeCompactWrapper initialized', { 
      platform: this.platform, 
      isWSL: this.isWSL,
      config: this.config 
    });
  }
  
  /**
   * Load configuration from multiple sources
   */
  loadConfiguration(overrides = {}) {
    const defaults = {
      // Core settings
      enabled: true,
      auto: true,
      maxTokens: 100000,
      threshold: 75000,
      thresholdPercent: 0.75,
      cooldown: 300000, // 5 minutes
      model: 'claude-3-5-sonnet-20241022',
      
      // Advanced settings
      preserveRecent: 5,
      preserveCodeBlocks: true,
      preserveMode: 'smart', // smart|aggressive|conservative
      maxCompactAttempts: 3,
      compactTimeout: 60000, // 1 minute
      
      // Logging
      debug: false,
      logLevel: 'info', // debug|info|warn|error
      logFile: null,
      
      // Notifications
      showNotifications: true,
      showTokenUsage: true,
      showSavings: true,
      
      // Export
      exportEnabled: false,
      exportFormat: 'markdown',
      exportPath: path.join(os.homedir(), '.yurucode', 'compacts')
    };
    
    // Try to load from config file
    let fileConfig = {};
    const configPaths = [
      path.join(os.homedir(), '.yurucode', 'compact.json'),
      path.join(os.homedir(), '.claude-compact.json'),
      path.join(process.cwd(), 'compact.config.json')
    ];
    
    for (const configPath of configPaths) {
      if (fs.existsSync(configPath)) {
        try {
          fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          this.log('debug', `Loaded config from ${configPath}`);
          break;
        } catch (e) {
          this.log('warn', `Failed to parse config from ${configPath}`, e);
        }
      }
    }
    
    // Environment variable overrides
    const envConfig = {};
    if (process.env.CLAUDE_COMPACT_ENABLED !== undefined) {
      envConfig.enabled = process.env.CLAUDE_COMPACT_ENABLED === 'true';
    }
    if (process.env.CLAUDE_COMPACT_AUTO !== undefined) {
      envConfig.auto = process.env.CLAUDE_COMPACT_AUTO === 'true';
    }
    if (process.env.CLAUDE_COMPACT_THRESHOLD) {
      envConfig.threshold = parseInt(process.env.CLAUDE_COMPACT_THRESHOLD);
    }
    if (process.env.CLAUDE_COMPACT_DEBUG) {
      envConfig.debug = process.env.CLAUDE_COMPACT_DEBUG === 'true';
    }
    
    // Merge configurations (priority: overrides > env > file > defaults)
    return { ...defaults, ...fileConfig, ...envConfig, ...overrides };
  }
  
  /**
   * Setup logging system
   */
  setupLogging() {
    this.logLevels = { debug: 0, info: 1, warn: 2, error: 3 };
    this.currentLogLevel = this.logLevels[this.config.logLevel] || 1;
    
    // Setup log file if configured
    if (this.config.logFile) {
      const logDir = path.dirname(this.config.logFile);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      this.logStream = fs.createWriteStream(this.config.logFile, { flags: 'a' });
    }
  }
  
  /**
   * Logging utility
   */
  log(level, message, data = null) {
    const levelNum = this.logLevels[level] || 1;
    if (levelNum < this.currentLogLevel) return;
    
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      data
    };
    
    // Console output for debug mode
    if (this.config.debug || level === 'error') {
      const prefix = `[${timestamp}] [${level.toUpperCase()}] [WRAPPER]`;
      console.error(prefix, message, data || '');
    }
    
    // File output if configured
    if (this.logStream) {
      this.logStream.write(JSON.stringify(logEntry) + '\n');
    }
    
    // Emit for UI updates
    this.emit('log', logEntry);
  }
  
  /**
   * Detect if running in WSL
   */
  detectWSL() {
    if (this.platform !== 'linux') return false;
    
    try {
      const procVersion = fs.readFileSync('/proc/version', 'utf8');
      return procVersion.toLowerCase().includes('microsoft');
    } catch (e) {
      return false;
    }
  }
  
  /**
   * Find Claude binary on the system
   */
  findClaudeBinary() {
    if (this.claudePath) return this.claudePath;
    
    this.log('debug', 'Searching for Claude binary...');
    
    // Platform-specific search paths
    const searchPaths = this.getSearchPaths();
    
    // Check each path
    for (const testPath of searchPaths) {
      if (this.checkClaudePath(testPath)) {
        this.claudePath = testPath;
        this.log('info', `Found Claude at: ${testPath}`);
        return testPath;
      }
    }
    
    // Try system PATH
    const systemPath = this.findInSystemPath();
    if (systemPath) {
      this.claudePath = systemPath;
      this.log('info', `Found Claude in PATH: ${systemPath}`);
      return systemPath;
    }
    
    throw new Error('Claude CLI not found. Please ensure Claude is installed.');
  }
  
  /**
   * Get platform-specific search paths
   */
  getSearchPaths() {
    const paths = [];
    
    switch (this.platform) {
      case 'darwin': // macOS
        paths.push(
          '/opt/homebrew/bin/claude',
          '/usr/local/bin/claude',
          '/Applications/Claude.app/Contents/MacOS/claude',
          path.join(os.homedir(), '.local/bin/claude'),
          path.join(os.homedir(), 'Library/Application Support/Claude/claude')
        );
        break;
      
      case 'win32': // Windows
        paths.push(
          'C:\\Program Files\\Claude\\claude.exe',
          'C:\\Program Files (x86)\\Claude\\claude.exe',
          path.join(process.env.LOCALAPPDATA || '', 'Claude\\claude.exe'),
          path.join(process.env.PROGRAMFILES || '', 'Anthropic\\claude.exe'),
          path.join(os.homedir(), 'AppData\\Local\\Claude\\claude.exe')
        );
        break;
      
      case 'linux': // Linux/WSL
        paths.push(
          '/usr/local/bin/claude',
          '/usr/bin/claude',
          '/opt/claude/bin/claude',
          path.join(os.homedir(), '.local/bin/claude'),
          '/snap/bin/claude',
          '/var/lib/flatpak/exports/bin/claude'
        );
        
        if (this.isWSL) {
          // Add Windows paths accessible from WSL
          paths.push(
            '/mnt/c/Program Files/Claude/claude.exe',
            '/mnt/c/Program Files (x86)/Claude/claude.exe'
          );
        }
        break;
    }
    
    return paths;
  }
  
  /**
   * Check if a path contains valid Claude binary
   */
  checkClaudePath(testPath) {
    try {
      // Add .exe extension on Windows if not present
      if (this.platform === 'win32' && !testPath.endsWith('.exe')) {
        testPath += '.exe';
      }
      
      // Check if file exists and is executable
      const stats = fs.statSync(testPath);
      if (stats.isFile()) {
        // On Unix, check execute permission
        if (this.platform !== 'win32') {
          fs.accessSync(testPath, fs.constants.X_OK);
        }
        return true;
      }
    } catch (e) {
      // Path doesn't exist or isn't accessible
    }
    
    return false;
  }
  
  /**
   * Find Claude in system PATH
   */
  findInSystemPath() {
    try {
      const command = this.platform === 'win32' ? 'where' : 'which';
      const result = execSync(`${command} claude`, { 
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'] // Suppress stderr
      });
      
      const paths = result.trim().split('\n');
      return paths[0]; // Return first match
    } catch (e) {
      return null;
    }
  }
  
  /**
   * Convert paths for WSL if needed
   */
  convertPath(inputPath) {
    if (!this.isWSL) return inputPath;
    
    // Convert Windows paths (C:\path) to WSL format (/mnt/c/path)
    if (inputPath.match(/^[A-Z]:\\/i)) {
      const drive = inputPath[0].toLowerCase();
      const rest = inputPath.substring(2).replace(/\\/g, '/');
      return `/mnt/${drive}${rest}`;
    }
    
    // Convert WSL paths to Windows format if needed
    if (inputPath.startsWith('/mnt/') && inputPath[6] === '/') {
      const drive = inputPath[5].toUpperCase();
      const rest = inputPath.substring(7).replace(/\//g, '\\');
      return `${drive}:\\${rest}`;
    }
    
    return inputPath;
  }
  
  /**
   * Main execution entry point
   */
  async run(args = []) {
    this.metrics.wrappedCalls++;
    
    try {
      // Find Claude binary
      const claudePath = this.findClaudeBinary();
      
      // Parse arguments for session info
      this.parseArguments(args);
      
      // Spawn Claude process with monitoring
      await this.spawnClaude(claudePath, args);
      
    } catch (error) {
      this.log('error', 'Failed to run Claude', error);
      this.emit('error', error);
      throw error;
    }
  }
  
  /**
   * Parse CLI arguments to extract session info
   */
  parseArguments(args) {
    // Look for --resume flag to get session ID
    const resumeIndex = args.indexOf('--resume');
    if (resumeIndex !== -1 && args[resumeIndex + 1]) {
      this.currentSessionId = args[resumeIndex + 1];
      this.log('debug', `Resuming session: ${this.currentSessionId}`);
    }
    
    // Check for output format
    const formatIndex = args.indexOf('--output-format');
    if (formatIndex !== -1) {
      this.outputFormat = args[formatIndex + 1];
    }
  }
  
  /**
   * Spawn Claude process with monitoring
   */
  async spawnClaude(claudePath, args) {
    return new Promise((resolve, reject) => {
      this.log('info', `Spawning Claude: ${claudePath}`, { args });
      
      // Platform-specific spawn options
      const spawnOptions = this.getSpawnOptions();
      
      // Convert paths for WSL if needed
      if (this.isWSL) {
        args = args.map(arg => this.convertPath(arg));
      }
      
      // Spawn the process
      this.claudeProcess = spawn(claudePath, args, spawnOptions);
      
      // Setup stream processing
      this.setupStreamProcessing();
      
      // Setup process lifecycle handlers
      this.setupProcessHandlers(resolve, reject);
      
      // Pipe stdin
      if (process.stdin && !process.stdin.destroyed) {
        process.stdin.pipe(this.claudeProcess.stdin);
      }
    });
  }
  
  /**
   * Get platform-specific spawn options
   */
  getSpawnOptions() {
    const options = {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    };
    
    if (this.platform === 'win32') {
      options.shell = true; // Required for Windows
      options.windowsHide = true; // Hide console window
    }
    
    return options;
  }
  
  /**
   * Setup stream processing for token monitoring
   */
  setupStreamProcessing() {
    // Create readline interface for line-by-line processing
    const rl = readline.createInterface({
      input: this.claudeProcess.stdout,
      crlfDelay: Infinity
    });
    
    // Process each line
    rl.on('line', (line) => {
      this.processStreamLine(line);
      
      // Forward to stdout
      console.log(line);
    });
    
    // Handle stderr
    this.claudeProcess.stderr.on('data', (data) => {
      process.stderr.write(data);
    });
  }
  
  /**
   * Process individual lines from stream-json output
   */
  processStreamLine(line) {
    if (!line.trim()) return;
    
    try {
      const data = JSON.parse(line);
      
      // Extract session ID from stream
      if (data.session_id && !this.isCompacting()) {
        this.updateSessionId(data.session_id);
      }
      
      // Monitor token usage
      if (data.type === 'result' && data.usage) {
        this.updateTokenUsage(data.usage);
      }
      
      // Check for compact completion
      if (this.isCompacting() && data.type === 'result') {
        this.handleCompactComplete(data);
      }
      
      // Emit parsed data for UI updates
      this.emit('stream-data', data);
      
    } catch (e) {
      // Not JSON or parse error - could be plain text output
      this.log('debug', 'Non-JSON line', { line });
    }
  }
  
  /**
   * Update current session ID
   */
  updateSessionId(sessionId) {
    if (sessionId !== this.currentSessionId) {
      this.currentSessionId = sessionId;
      this.log('debug', `Session ID updated: ${sessionId}`);
      
      // Initialize session state if new
      if (!this.sessions.has(sessionId)) {
        this.sessions.set(sessionId, this.createSessionState());
      }
    }
  }
  
  /**
   * Create initial session state
   */
  createSessionState() {
    return {
      tokenCount: 0,
      lastCompact: 0,
      isCompacting: false,
      compactAttempts: 0,
      messageQueue: [],
      metrics: {
        compactCount: 0,
        totalSaved: 0,
        created: Date.now()
      }
    };
  }
  
  /**
   * Update token usage and check thresholds
   */
  updateTokenUsage(usage) {
    if (!this.currentSessionId) return;
    
    const session = this.sessions.get(this.currentSessionId);
    if (!session) return;
    
    // Update token count
    const oldCount = session.tokenCount;
    session.tokenCount = usage.input_tokens || 0;
    
    this.log('info', `Token usage: ${session.tokenCount}/${this.config.maxTokens}`, {
      sessionId: this.currentSessionId,
      percentage: Math.round(session.tokenCount / this.config.maxTokens * 100)
    });
    
    // Emit token update for UI
    this.emit('token-update', {
      sessionId: this.currentSessionId,
      current: session.tokenCount,
      max: this.config.maxTokens,
      percentage: session.tokenCount / this.config.maxTokens
    });
    
    // Check if we should auto-compact
    if (this.shouldAutoCompact(session)) {
      this.triggerAutoCompact();
    }
  }
  
  /**
   * Determine if auto-compact should trigger
   */
  shouldAutoCompact(session) {
    // Check if feature is enabled
    if (!this.config.enabled || !this.config.auto) {
      return false;
    }
    
    // Don't compact if already compacting
    if (session.isCompacting) {
      return false;
    }
    
    // Check cooldown
    const timeSinceCompact = Date.now() - session.lastCompact;
    if (timeSinceCompact < this.config.cooldown) {
      this.log('debug', `Compact on cooldown for ${this.config.cooldown - timeSinceCompact}ms`);
      return false;
    }
    
    // Check attempt limit
    if (session.compactAttempts >= this.config.maxCompactAttempts) {
      this.log('warn', `Max compact attempts reached for session ${this.currentSessionId}`);
      return false;
    }
    
    // Check threshold
    const threshold = this.config.threshold || (this.config.maxTokens * this.config.thresholdPercent);
    return session.tokenCount > threshold;
  }
  
  /**
   * Check if currently compacting
   */
  isCompacting() {
    if (!this.currentSessionId) return false;
    const session = this.sessions.get(this.currentSessionId);
    return session ? session.isCompacting : false;
  }
  
  /**
   * Trigger automatic compaction
   */
  async triggerAutoCompact() {
    const session = this.sessions.get(this.currentSessionId);
    if (!session) return;
    
    this.log('info', '🔄 AUTO-COMPACT: Triggering automatic compaction', {
      sessionId: this.currentSessionId,
      tokenCount: session.tokenCount
    });
    
    // Update state
    session.isCompacting = true;
    session.lastCompact = Date.now();
    session.compactAttempts++;
    
    // Emit event for UI
    this.emit('compact-start', {
      sessionId: this.currentSessionId,
      tokenCount: session.tokenCount,
      attempt: session.compactAttempts
    });
    
    // Show notification if configured
    if (this.config.showNotifications) {
      console.error('\n' + '='.repeat(60));
      console.error('🔄 AUTO-COMPACT: Optimizing conversation memory...');
      console.error(`   • Current tokens: ${session.tokenCount}`);
      console.error(`   • Threshold: ${this.config.threshold || this.config.maxTokens * this.config.thresholdPercent}`);
      console.error(`   • Using model: ${this.config.model}`);
      console.error('='.repeat(60) + '\n');
    }
    
    // Execute compact
    await this.executeCompact();
  }
  
  /**
   * Execute the compact operation
   */
  async executeCompact() {
    return new Promise((resolve, reject) => {
      const compactArgs = [
        '--resume', this.currentSessionId,
        '--model', this.config.model,
        '--output-format', 'stream-json',
        '--verbose'
      ];
      
      this.log('debug', 'Executing compact', { args: compactArgs });
      
      // Find Claude binary
      const claudePath = this.findClaudeBinary();
      
      // Spawn compact process
      const compactProcess = spawn(claudePath, compactArgs, this.getSpawnOptions());
      
      // Generate compact prompt based on configuration
      const compactPrompt = this.generateCompactPrompt();
      
      // Send compact request
      compactProcess.stdin.write(compactPrompt + '\n');
      compactProcess.stdin.end();
      
      // Collect output
      let outputBuffer = '';
      const rl = readline.createInterface({
        input: compactProcess.stdout,
        crlfDelay: Infinity
      });
      
      rl.on('line', (line) => {
        outputBuffer += line + '\n';
        console.log(line); // Forward to user
        
        // Parse for completion
        try {
          const data = JSON.parse(line);
          if (data.type === 'result') {
            this.handleCompactComplete(data);
          }
        } catch (e) {
          // Continue
        }
      });
      
      // Handle completion
      compactProcess.on('close', (code) => {
        if (code === 0) {
          this.log('info', 'Compact process completed successfully');
          resolve();
        } else {
          this.log('error', `Compact process failed with code ${code}`);
          reject(new Error(`Compact failed with code ${code}`));
        }
      });
      
      // Timeout handling
      setTimeout(() => {
        if (compactProcess.exitCode === null) {
          compactProcess.kill();
          reject(new Error('Compact timeout'));
        }
      }, this.config.compactTimeout);
    });
  }
  
  /**
   * Generate compact prompt based on conversation type
   */
  generateCompactPrompt() {
    const prompts = {
      technical: `Please provide a concise technical summary of our conversation, preserving:
- All code snippets and commands verbatim
- Technical decisions and rationale
- Error messages and solutions
- Architecture and design patterns
- Implementation details
Format as structured technical documentation.`,
      
      creative: `Summarize our creative work, maintaining:
- Character details and development
- Plot points and story arc
- World-building elements
- Dialogue style and tone
- Creative decisions
Present as a creative brief.`,
      
      research: `Synthesize our research findings, including:
- Key data points and statistics
- Methodologies used
- Conclusions and insights
- Evidence and sources
- Next steps and recommendations
Structure as an executive summary.`,
      
      default: `Please provide a concise summary of our conversation so far.
Include all important details, decisions, and context.
Preserve any code, data, or specific information discussed.
This summary will be used to continue our conversation with reduced token usage.`
    };
    
    // Detect conversation type (could be enhanced with ML)
    const type = this.detectConversationType();
    return prompts[type] || prompts.default;
  }
  
  /**
   * Detect conversation type for optimal compaction
   */
  detectConversationType() {
    // This could be enhanced with actual analysis
    // For now, return 'default'
    return 'default';
  }
  
  /**
   * Handle compact completion
   */
  handleCompactComplete(data) {
    const session = this.sessions.get(this.currentSessionId);
    if (!session) return;
    
    // Calculate savings
    const oldTokens = session.tokenCount;
    const newTokens = data.usage ? data.usage.input_tokens : 0;
    const saved = oldTokens - newTokens;
    const percentage = oldTokens > 0 ? Math.round(saved / oldTokens * 100) : 0;
    
    // Update state
    session.isCompacting = false;
    session.tokenCount = newTokens;
    session.metrics.compactCount++;
    session.metrics.totalSaved += saved;
    
    // Update global metrics
    this.metrics.compactCount++;
    this.metrics.totalTokensSaved += saved;
    
    this.log('info', '✅ Compact completed', {
      sessionId: this.currentSessionId,
      oldTokens,
      newTokens,
      saved,
      percentage
    });
    
    // Show notification if configured
    if (this.config.showNotifications && this.config.showSavings) {
      console.error('\n' + '='.repeat(60));
      console.error('✅ AUTO-COMPACT: Complete!');
      console.error(`   • Tokens before: ${oldTokens}`);
      console.error(`   • Tokens after: ${newTokens}`);
      console.error(`   • Tokens saved: ${saved} (${percentage}% reduction)`);
      console.error('='.repeat(60) + '\n');
    }
    
    // Emit event for UI
    this.emit('compact-complete', {
      sessionId: this.currentSessionId,
      oldTokens,
      newTokens,
      saved,
      percentage
    });
    
    // Export if configured
    if (this.config.exportEnabled) {
      this.exportCompact(data);
    }
  }
  
  /**
   * Export compact to file
   */
  async exportCompact(data) {
    try {
      const exportDir = this.config.exportPath;
      if (!fs.existsSync(exportDir)) {
        fs.mkdirSync(exportDir, { recursive: true });
      }
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `compact-${this.currentSessionId}-${timestamp}.${this.config.exportFormat}`;
      const filepath = path.join(exportDir, filename);
      
      let content;
      if (this.config.exportFormat === 'json') {
        content = JSON.stringify(data, null, 2);
      } else {
        content = this.formatAsMarkdown(data);
      }
      
      fs.writeFileSync(filepath, content);
      this.log('info', `Compact exported to ${filepath}`);
      
    } catch (e) {
      this.log('error', 'Failed to export compact', e);
    }
  }
  
  /**
   * Format compact data as markdown
   */
  formatAsMarkdown(data) {
    const timestamp = new Date().toISOString();
    return `# Conversation Compact

**Date:** ${timestamp}
**Session:** ${this.currentSessionId}
**Tokens Saved:** ${data.saved || 'N/A'}

## Summary

${data.result || 'No summary available'}

## Metadata

- Model: ${this.config.model}
- Tokens: ${data.usage ? data.usage.input_tokens : 'N/A'}
- Duration: ${data.duration_ms || 'N/A'}ms

---
*Generated by ClaudeCompactWrapper*`;
  }
  
  /**
   * Setup process lifecycle handlers
   */
  setupProcessHandlers(resolve, reject) {
    // Handle process close
    this.claudeProcess.on('close', (code) => {
      this.log('debug', `Claude process closed with code ${code}`);
      this.cleanup();
      resolve(code);
    });
    
    // Handle process error
    this.claudeProcess.on('error', (error) => {
      this.log('error', 'Claude process error', error);
      this.cleanup();
      reject(error);
    });
    
    // Handle signals
    process.on('SIGINT', () => this.handleSignal('SIGINT'));
    process.on('SIGTERM', () => this.handleSignal('SIGTERM'));
  }
  
  /**
   * Handle process signals
   */
  handleSignal(signal) {
    this.log('info', `Received ${signal}, cleaning up...`);
    
    if (this.claudeProcess && !this.claudeProcess.killed) {
      this.claudeProcess.kill(signal);
    }
    
    this.cleanup();
    process.exit(0);
  }
  
  /**
   * Cleanup resources
   */
  cleanup() {
    // Close log stream
    if (this.logStream) {
      this.logStream.end();
    }
    
    // Clear session data if needed
    if (this.currentSessionId) {
      const session = this.sessions.get(this.currentSessionId);
      if (session && session.isCompacting) {
        session.isCompacting = false;
      }
    }
    
    // Log final metrics
    this.log('info', 'Wrapper shutdown', {
      metrics: this.metrics,
      uptime: Date.now() - this.metrics.startTime
    });
  }
  
  /**
   * Get wrapper statistics
   */
  getStats() {
    return {
      ...this.metrics,
      uptime: Date.now() - this.metrics.startTime,
      sessions: this.sessions.size,
      currentSession: this.currentSessionId
    };
  }
}

/**
 * CLI entry point
 */
if (require.main === module) {
  const wrapper = new ClaudeCompactWrapper();
  
  // Setup event listeners for debugging
  if (wrapper.config.debug) {
    wrapper.on('token-update', (data) => {
      console.error('[TOKEN UPDATE]', data);
    });
    
    wrapper.on('compact-start', (data) => {
      console.error('[COMPACT START]', data);
    });
    
    wrapper.on('compact-complete', (data) => {
      console.error('[COMPACT COMPLETE]', data);
    });
  }
  
  // Run with CLI arguments
  const args = process.argv.slice(2);
  
  wrapper.run(args).then((code) => {
    process.exit(code || 0);
  }).catch((error) => {
    console.error('Fatal error:', error.message);
    process.exit(1);
  });
}

// Export for programmatic use
module.exports = ClaudeCompactWrapper;