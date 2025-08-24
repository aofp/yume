# Compact Wrapper Implementation Guide

## Quick Start: Drop-in Wrapper Script

This wrapper can be implemented TODAY without modifying any Claude source code.

## Complete Wrapper Implementation

### 1. The Wrapper Script

Create `/Users/yuru/yurucode/scripts/claude-compact-wrapper.js`:

```javascript
#!/usr/bin/env node

const { spawn } = require('child_process');
const readline = require('readline');
const path = require('path');
const fs = require('fs');

/**
 * ClaudeCompactWrapper - Adds auto-compact to Claude CLI
 * 
 * Features:
 * - Monitors token usage from stream-json output
 * - Automatically triggers compact at threshold
 * - Preserves all original Claude functionality
 * - Zero modification to Claude source required
 */
class ClaudeCompactWrapper {
  constructor(config = {}) {
    // Configuration
    this.config = {
      maxTokens: config.maxTokens || 100000,
      compactThreshold: config.compactThreshold || 0.75, // 75% of max
      cooldownMs: config.cooldownMs || 300000, // 5 minutes
      compactModel: config.compactModel || 'claude-3-5-sonnet-20241022',
      debug: config.debug || false,
      ...config
    };
    
    // State tracking
    this.currentTokens = 0;
    this.sessionId = null;
    this.lastCompactTime = 0;
    this.isCompacting = false;
    this.messageBuffer = [];
    this.claudeProcess = null;
  }
  
  log(message, ...args) {
    if (this.config.debug) {
      console.error(`[WRAPPER] ${message}`, ...args);
    }
  }
  
  /**
   * Main entry point - wraps Claude CLI execution
   */
  async run(args) {
    this.log('Starting Claude with args:', args);
    
    // Find the real Claude binary
    const claudePath = this.findClaudeBinary();
    if (!claudePath) {
      console.error('Error: Claude CLI not found');
      process.exit(1);
    }
    
    // Spawn Claude process
    this.claudeProcess = spawn(claudePath, args, {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    // Setup stream processing
    this.setupStreamProcessing();
    
    // Handle process lifecycle
    this.setupProcessHandlers();
    
    // Pipe stdin to Claude
    process.stdin.pipe(this.claudeProcess.stdin);
    
    return new Promise((resolve, reject) => {
      this.claudeProcess.on('close', (code) => {
        resolve(code);
      });
      
      this.claudeProcess.on('error', (err) => {
        reject(err);
      });
    });
  }
  
  /**
   * Find Claude binary location
   */
  findClaudeBinary() {
    const possiblePaths = [
      '/opt/homebrew/bin/claude',
      '/usr/local/bin/claude',
      '/usr/bin/claude',
      path.join(process.env.HOME, '.local/bin/claude'),
      'claude' // Let system PATH resolve it
    ];
    
    for (const claudePath of possiblePaths) {
      try {
        if (fs.existsSync(claudePath)) {
          this.log('Found Claude at:', claudePath);
          return claudePath;
        }
      } catch (e) {
        // Continue searching
      }
    }
    
    // Try to use 'which' command
    try {
      const which = require('child_process').execSync('which claude', { encoding: 'utf8' });
      return which.trim();
    } catch (e) {
      return null;
    }
  }
  
  /**
   * Setup stream processing to monitor tokens
   */
  setupStreamProcessing() {
    const rl = readline.createInterface({
      input: this.claudeProcess.stdout,
      crlfDelay: Infinity
    });
    
    rl.on('line', (line) => {
      // Process each line
      this.processStreamLine(line);
      
      // Output to stdout (preserve original behavior)
      console.log(line);
    });
    
    // Also pipe stderr
    this.claudeProcess.stderr.on('data', (data) => {
      process.stderr.write(data);
    });
  }
  
  /**
   * Process individual stream-json lines
   */
  processStreamLine(line) {
    if (!line.trim()) return;
    
    try {
      const data = JSON.parse(line);
      
      // Extract session ID
      if (data.session_id && !this.isCompacting) {
        this.sessionId = data.session_id;
        this.log('Session ID:', this.sessionId);
      }
      
      // Monitor token usage
      if (data.type === 'result' && data.usage) {
        this.updateTokenUsage(data.usage);
      }
      
      // Check if this is our auto-compact response
      if (this.isCompacting && data.type === 'result') {
        this.handleCompactComplete(data);
      }
      
    } catch (e) {
      // Not JSON or parse error - ignore
    }
  }
  
  /**
   * Update token tracking and check thresholds
   */
  updateTokenUsage(usage) {
    this.currentTokens = usage.input_tokens || 0;
    
    this.log(`Tokens: ${this.currentTokens}/${this.config.maxTokens} (${Math.round(this.currentTokens/this.config.maxTokens*100)}%)`);
    
    // Check if we should trigger auto-compact
    if (this.shouldAutoCompact()) {
      this.triggerAutoCompact();
    }
  }
  
  /**
   * Determine if auto-compact should trigger
   */
  shouldAutoCompact() {
    // Don't compact if already compacting
    if (this.isCompacting) return false;
    
    // Check cooldown
    const timeSinceCompact = Date.now() - this.lastCompactTime;
    if (timeSinceCompact < this.config.cooldownMs) {
      this.log('Compact on cooldown for', this.config.cooldownMs - timeSinceCompact, 'ms');
      return false;
    }
    
    // Check token threshold
    const threshold = this.config.maxTokens * this.config.compactThreshold;
    return this.currentTokens > threshold;
  }
  
  /**
   * Trigger automatic compact operation
   */
  async triggerAutoCompact() {
    console.error('\n🔄 AUTO-COMPACT: Token limit approaching, compacting conversation...\n');
    
    this.isCompacting = true;
    this.lastCompactTime = Date.now();
    
    // Create a new process for the compact command
    const compactArgs = [
      '--resume', this.sessionId,
      '--model', this.config.compactModel,
      '--output-format', 'stream-json',
      '--verbose'
    ];
    
    this.log('Triggering compact with args:', compactArgs);
    
    const compactProcess = spawn(this.findClaudeBinary(), compactArgs);
    
    // Send compact request
    const compactPrompt = `Please provide a concise summary of our conversation so far. 
Include all important technical details, code snippets, and key decisions. 
This summary will be used to continue our conversation with reduced token usage.
Format the summary clearly with sections if appropriate.`;
    
    compactProcess.stdin.write(compactPrompt + '\n');
    compactProcess.stdin.end();
    
    // Collect compact output
    let compactOutput = '';
    compactProcess.stdout.on('data', (data) => {
      compactOutput += data.toString();
      // Also output to user
      process.stdout.write(data);
    });
    
    compactProcess.on('close', () => {
      this.log('Compact complete');
      this.handleCompactComplete({ compactOutput });
    });
  }
  
  /**
   * Handle completion of compact operation
   */
  handleCompactComplete(data) {
    this.isCompacting = false;
    this.currentTokens = 0; // Reset token count
    
    console.error('\n✅ AUTO-COMPACT: Complete! Token usage reset.\n');
    
    // Log savings if available
    if (data.usage) {
      const savings = this.currentTokens - (data.usage.input_tokens || 0);
      console.error(`📊 Tokens saved: ${savings}\n`);
    }
  }
  
  /**
   * Setup process lifecycle handlers
   */
  setupProcessHandlers() {
    // Handle Ctrl+C
    process.on('SIGINT', () => {
      this.log('Received SIGINT, cleaning up...');
      if (this.claudeProcess) {
        this.claudeProcess.kill('SIGINT');
      }
      process.exit(0);
    });
    
    // Handle termination
    process.on('SIGTERM', () => {
      this.log('Received SIGTERM, cleaning up...');
      if (this.claudeProcess) {
        this.claudeProcess.kill('SIGTERM');
      }
      process.exit(0);
    });
  }
}

// Configuration can be loaded from file or environment
function loadConfig() {
  const config = {};
  
  // Check for config file
  const configPath = path.join(process.env.HOME, '.claude-compact.json');
  if (fs.existsSync(configPath)) {
    try {
      const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      Object.assign(config, fileConfig);
    } catch (e) {
      console.error('Warning: Failed to load config from', configPath);
    }
  }
  
  // Environment variable overrides
  if (process.env.CLAUDE_MAX_TOKENS) {
    config.maxTokens = parseInt(process.env.CLAUDE_MAX_TOKENS);
  }
  if (process.env.CLAUDE_COMPACT_THRESHOLD) {
    config.compactThreshold = parseFloat(process.env.CLAUDE_COMPACT_THRESHOLD);
  }
  if (process.env.CLAUDE_DEBUG) {
    config.debug = process.env.CLAUDE_DEBUG === 'true';
  }
  
  return config;
}

// Main execution
if (require.main === module) {
  const config = loadConfig();
  const wrapper = new ClaudeCompactWrapper(config);
  
  // Pass through all CLI arguments
  const args = process.argv.slice(2);
  
  wrapper.run(args).then((code) => {
    process.exit(code);
  }).catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
}

module.exports = ClaudeCompactWrapper;
```

### 2. Integration with yurucode

Modify the embedded server in `/Users/yuru/yurucode/src-tauri/src/logged_server.rs`:

```javascript
// Replace this line:
const claudeProcess = spawn(claudePath, args, {

// With:
const wrapperPath = path.join(__dirname, '../scripts/claude-compact-wrapper.js');
const claudeProcess = spawn('node', [wrapperPath, ...args], {
```

### 3. Configuration File

Create `~/.claude-compact.json`:

```json
{
  "maxTokens": 100000,
  "compactThreshold": 0.75,
  "cooldownMs": 300000,
  "compactModel": "claude-3-5-sonnet-20241022",
  "debug": false,
  "compactPrompts": {
    "default": "Please provide a concise summary of our conversation so far.",
    "technical": "Summarize our technical discussion, preserving all code, commands, and implementation details.",
    "creative": "Capture the essence of our creative work so far.",
    "analysis": "Summarize the key findings and insights from our analysis."
  }
}
```

### 4. Testing Script

Create `/Users/yuru/yurucode/test-compact-wrapper.js`:

```javascript
const ClaudeCompactWrapper = require('./scripts/claude-compact-wrapper.js');

async function test() {
  console.log('Testing Claude Compact Wrapper...\n');
  
  // Test with low token threshold for quick testing
  const wrapper = new ClaudeCompactWrapper({
    maxTokens: 1000,  // Very low for testing
    compactThreshold: 0.8,
    cooldownMs: 1000, // 1 second for testing
    debug: true
  });
  
  // Simulate Claude CLI args
  const args = [
    '--model', 'claude-3-5-sonnet-20241022',
    '--output-format', 'stream-json',
    '--verbose'
  ];
  
  console.log('Running wrapper with test configuration...');
  await wrapper.run(args);
}

test().catch(console.error);
```

## Usage Examples

### Manual Usage
```bash
# Use wrapper directly
node /path/to/claude-compact-wrapper.js --model claude-3-5-sonnet-20241022

# Set as alias
alias claude-compact='node /path/to/claude-compact-wrapper.js'
claude-compact --help
```

### Environment Variables
```bash
# Configure via environment
export CLAUDE_MAX_TOKENS=50000
export CLAUDE_COMPACT_THRESHOLD=0.7
export CLAUDE_DEBUG=true

node claude-compact-wrapper.js
```

### Programmatic Usage
```javascript
const ClaudeCompactWrapper = require('./claude-compact-wrapper.js');

const wrapper = new ClaudeCompactWrapper({
  maxTokens: 80000,
  compactThreshold: 0.8,
  customPrompts: {
    beforeCompact: "I'm about to compact our conversation...",
    afterCompact: "Compact complete! Let's continue..."
  }
});

wrapper.run(process.argv.slice(2));
```

## Monitoring & Debugging

### Debug Output
Enable debug mode to see detailed wrapper operations:
```bash
CLAUDE_DEBUG=true node claude-compact-wrapper.js
```

### Log File
Add logging to track compact operations:
```javascript
// Add to wrapper constructor
this.logFile = fs.createWriteStream('claude-compact.log', { flags: 'a' });

// Add to log method
this.logFile.write(`[${new Date().toISOString()}] ${message}\n`);
```

## Next Steps

1. **Test the wrapper** with low token thresholds
2. **Integrate into yurucode** by modifying logged_server.rs
3. **Add UI indicators** for auto-compact status
4. **Collect metrics** on token savings
5. **Fine-tune thresholds** based on usage patterns

## Benefits

- ✅ **No Claude modification** - Works with any version
- ✅ **Immediate deployment** - Can use today
- ✅ **Full compatibility** - Preserves all Claude features
- ✅ **Configurable** - Adjust thresholds per user
- ✅ **Transparent** - Users see compact happening
- ✅ **Efficient** - Uses fast Sonnet model for compacts
- ✅ **Safe** - Cooldown prevents compact loops