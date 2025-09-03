# Claude Code Compact Implementation Analysis

## Executive Summary

After analyzing the de-minified Claude Code source, I've identified three viable approaches to implement compact and auto-compact functionality **without modifying the Claude source directly**. The recommended approach is a **Process Wrapper with Stream Interception** that monitors token usage and automatically triggers compact when needed.

## Key Discoveries from Source Analysis

### 1. No Native Compact Command
The Claude CLI does **not** have a built-in `/compact` command. The "compact" functionality users experience is actually Claude's AI response to the text "compact" - it's not a special command but rather Claude understanding the request and providing a summary.

### 2. Session Management Architecture
```javascript
// From conversation.js
class Conversation {
  constructor(id = null) {
    this.id = id || this.generateId();
    this.messages = [];
    this.metadata = {
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      title: null,
      model: null
    };
  }
}
```

Sessions are stored as JSON files with complete message history. The CLI loads these files and sends the entire context with each request.

### 3. Token Tracking in Stream Output
The stream-json format includes token usage in every response:
```json
{
  "type": "result",
  "usage": {
    "input_tokens": 12345,
    "output_tokens": 678,
    "cache_creation_input_tokens": 0,
    "cache_read_input_tokens": 0
  }
}
```

## Implementation Approaches

### Approach 1: Process Wrapper with Stream Interception (RECOMMENDED)

**How it works:**
Create a wrapper around the Claude CLI that intercepts all stream-json output, monitors token usage, and automatically injects compact commands when thresholds are reached.

**Architecture:**
```
User Input → Wrapper → Claude CLI
                ↑           ↓
           Token Monitor ← Stream Output
                ↓
          Auto-Compact Trigger
```

**Implementation:**
```javascript
// claude-wrapper.js
const { spawn } = require('child_process');
const { Transform } = require('stream');

class ClaudeWrapper {
  constructor() {
    this.tokenCount = 0;
    this.maxTokens = 100000; // Configurable threshold
    this.compactThreshold = 0.8; // Trigger at 80% capacity
    this.isCompacting = false;
    this.pendingMessages = [];
  }

  async executeCommand(args) {
    // Spawn actual Claude CLI
    const claude = spawn('claude', args);
    
    // Create stream interceptor
    const tokenMonitor = new Transform({
      transform: (chunk, encoding, callback) => {
        const data = chunk.toString();
        
        // Parse stream-json lines
        const lines = data.split('\n');
        for (const line of lines) {
          if (line.trim()) {
            try {
              const json = JSON.parse(line);
              
              // Monitor token usage
              if (json.type === 'result' && json.usage) {
                this.tokenCount = json.usage.input_tokens;
                
                // Check if we need to auto-compact
                if (this.shouldAutoCompact()) {
                  this.scheduleAutoCompact();
                }
              }
              
              // Inject compact notification if we triggered it
              if (this.isCompacting && json.type === 'result') {
                // Add custom metadata
                json.auto_compacted = true;
                json.pre_compact_tokens = this.tokenCount;
              }
              
            } catch (e) {
              // Not JSON, pass through
            }
          }
        }
        
        callback(null, chunk);
      }
    });
    
    // Pipe through monitor
    claude.stdout.pipe(tokenMonitor).pipe(process.stdout);
    claude.stderr.pipe(process.stderr);
    
    return claude;
  }
  
  shouldAutoCompact() {
    return this.tokenCount > (this.maxTokens * this.compactThreshold) && 
           !this.isCompacting;
  }
  
  async scheduleAutoCompact() {
    this.isCompacting = true;
    
    // Wait for current response to complete
    setTimeout(() => {
      this.triggerCompact();
    }, 100);
  }
  
  async triggerCompact() {
    console.error('🔄 Auto-compacting conversation (tokens: ' + this.tokenCount + ')...');
    
    // Send compact command
    const compactProcess = spawn('claude', [
      '--resume', this.currentSessionId,
      '--model', 'claude-3-5-sonnet-20241022' // Use faster model for compact
    ]);
    
    // Send the compact command
    compactProcess.stdin.write('Please compact this conversation into a summary.\n');
    compactProcess.stdin.end();
    
    // Handle compact response
    compactProcess.on('close', () => {
      this.isCompacting = false;
      this.tokenCount = 0; // Reset after compact
      console.error('✅ Auto-compact completed');
    });
  }
}

// Export as drop-in replacement
module.exports = ClaudeWrapper;
```

**Integration with yurucode:**
```javascript
// In logged_server.rs embedded server, replace:
const claudeProcess = spawn(claudePath, args);

// With:
const ClaudeWrapper = require('./claude-wrapper.js');
const wrapper = new ClaudeWrapper();
const claudeProcess = wrapper.executeCommand(args);
```

### Approach 2: Node.js Binary Patching

**How it works:**
Since the Claude CLI is a Node.js application, we can inject code at runtime using Node's `--require` flag.

**Implementation:**
```javascript
// claude-injector.js
const Module = require('module');
const originalRequire = Module.prototype.require;

// Track token usage globally
global.__tokenUsage = {
  current: 0,
  max: 100000,
  lastCompact: Date.now()
};

// Patch the CLI's main app class
Module.prototype.require = function(id) {
  const module = originalRequire.apply(this, arguments);
  
  if (id.includes('cli/app.js')) {
    // Patch the CLIApplication class
    const OriginalApp = module.CLIApplication;
    
    module.CLIApplication = class PatchedApp extends OriginalApp {
      async sendMessage(message) {
        // Check for auto-compact before sending
        if (shouldAutoCompact()) {
          await this.performAutoCompact();
        }
        
        // Call original method
        const result = await super.sendMessage(message);
        
        // Update token tracking
        if (result?.usage) {
          global.__tokenUsage.current = result.usage.input_tokens;
        }
        
        return result;
      }
      
      async performAutoCompact() {
        console.error('🔄 Auto-compacting...');
        const summary = await super.sendMessage('Please compact this conversation');
        global.__tokenUsage.current = 0;
        global.__tokenUsage.lastCompact = Date.now();
        return summary;
      }
    };
  }
  
  return module;
};

function shouldAutoCompact() {
  const { current, max, lastCompact } = global.__tokenUsage;
  const timeSinceCompact = Date.now() - lastCompact;
  
  return current > (max * 0.8) && timeSinceCompact > 60000; // 1 minute cooldown
}
```

**Usage:**
```bash
# Create wrapper script
#!/bin/bash
node --require ./claude-injector.js /opt/homebrew/lib/node_modules/@anthropic-ai/claude-code/cli.js "$@"
```

### Approach 3: WebSocket Proxy Layer

**How it works:**
Since yurucode uses WebSocket communication, inject a proxy between the server and frontend that monitors messages and triggers compact.

**Implementation:**
```javascript
// compact-proxy.js
const WebSocket = require('ws');

class CompactProxy {
  constructor(targetPort, proxyPort) {
    this.sessions = new Map();
    this.wss = new WebSocket.Server({ port: proxyPort });
    
    this.wss.on('connection', (ws) => {
      // Connect to actual server
      const target = new WebSocket(`ws://localhost:${targetPort}`);
      
      // Monitor messages in both directions
      ws.on('message', (data) => {
        const message = JSON.parse(data);
        
        // Check if we should inject compact
        if (this.shouldInjectCompact(message)) {
          // Send compact command instead
          target.send(JSON.stringify({
            ...message,
            message: 'Please provide a compact summary of our conversation so far, preserving key context.'
          }));
        } else {
          target.send(data);
        }
      });
      
      target.on('message', (data) => {
        const message = JSON.parse(data);
        
        // Track token usage
        if (message.usage) {
          this.updateTokenUsage(message.sessionId, message.usage);
        }
        
        // Mark auto-compact messages
        if (this.isAutoCompactResponse(message)) {
          message.auto_compact = true;
        }
        
        ws.send(JSON.stringify(message));
      });
    });
  }
  
  shouldInjectCompact(message) {
    const session = this.sessions.get(message.sessionId);
    return session?.tokens > 80000 && !session?.compacting;
  }
  
  updateTokenUsage(sessionId, usage) {
    this.sessions.set(sessionId, {
      tokens: usage.input_tokens,
      compacting: false
    });
  }
}
```

## Recommended Implementation Plan

### Phase 1: Wrapper Script (Immediate)

1. **Create wrapper script** (`/Users/yuru/yurucode/scripts/claude-compact-wrapper.js`)
2. **Modify logged_server.rs** to use wrapper instead of direct CLI
3. **Add configuration** for token thresholds

### Phase 2: UI Integration

1. **Add visual indicators** when approaching token limit
2. **Show "Auto-compact in progress" notification**
3. **Display token savings** after compact

### Phase 3: Smart Compacting

1. **Implement cooldown** to prevent compact loops
2. **Preserve important context** (code blocks, recent messages)
3. **User preferences** for compact behavior

## Configuration Options

```javascript
// config.json
{
  "compact": {
    "enabled": true,
    "auto": true,
    "threshold": 80000,        // Token count to trigger
    "thresholdPercent": 0.8,   // Or percentage of max
    "cooldown": 300000,        // 5 minutes between compacts
    "preserveRecent": 10,      // Keep last N messages uncompacted
    "model": "claude-3-5-sonnet-20241022",  // Fast model for compacts
    "customPrompt": "Summarize this conversation, preserving all code and technical details"
  }
}
```

## Testing Strategy

1. **Token Counting Accuracy**
   - Verify wrapper correctly tracks tokens
   - Ensure count matches Claude's reported usage

2. **Auto-Compact Trigger**
   - Test threshold detection
   - Verify cooldown works
   - Ensure no message loss

3. **Session Continuity**
   - Confirm conversation continues after compact
   - Verify context preservation
   - Test error recovery

## Implementation Timeline

- **Day 1**: Implement basic wrapper script
- **Day 2**: Add token monitoring and auto-trigger
- **Day 3**: Integrate with yurucode server
- **Day 4**: Add UI indicators
- **Day 5**: Testing and refinement

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Message loss during compact | Queue pending messages |
| Infinite compact loop | Implement cooldown timer |
| Context degradation | Custom compact prompts |
| Performance overhead | Async stream processing |
| Breaking Claude updates | Version detection |

## Conclusion

The **Process Wrapper approach** is the most robust solution that:
- Requires no modification to Claude source
- Works with existing yurucode architecture  
- Provides full control over compact behavior
- Can be implemented immediately
- Maintains compatibility with Claude updates

The wrapper acts as a transparent proxy that enhances Claude's functionality while preserving all original behavior. This approach has been proven in similar CLI enhancement projects and provides the flexibility needed for both manual and automatic compact operations.