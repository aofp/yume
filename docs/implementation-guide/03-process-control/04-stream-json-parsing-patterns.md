# Claude CLI Stream-JSON Output Parsing Patterns

## Stream Format Overview

Claude CLI with `--output-format stream-json` produces newline-delimited JSON (NDJSON):
```
{"type":"init","data":{"session_id":"01JAX4KY9Z8V5W3N2Q1R6P0M7F","model":"claude-3-5-sonnet-20241022"}}
{"type":"message_start","data":{"role":"assistant"}}
{"type":"content_start","data":{"content_type":"text"}}
{"type":"content_delta","data":{"delta":"Hello"}}
{"type":"content_delta","data":{"delta":" world"}}
{"type":"content_end","data":{}}
{"type":"message_end","data":{"stop_reason":"end_turn","usage":{"input_tokens":10,"output_tokens":2}}}
{"type":"done","data":{}}
```

## Parser Implementation

### Core Parser Class
```javascript
class ClaudeStreamParser {
    constructor() {
        this.buffer = '';
        this.sessionId = null;
        this.currentMessage = null;
        this.isStreaming = false;
        this.tokenUsage = {
            input_tokens: 0,
            output_tokens: 0,
            cache_creation_tokens: 0,
            cache_read_tokens: 0
        };
    }
    
    // Feed data into parser
    feed(chunk) {
        this.buffer += chunk;
        const lines = this.buffer.split('\n');
        
        // Keep incomplete line in buffer
        this.buffer = lines.pop() || '';
        
        // Process complete lines
        for (const line of lines) {
            if (line.trim()) {
                this.processLine(line);
            }
        }
    }
    
    // Process single line of JSON
    processLine(line) {
        try {
            const message = JSON.parse(line);
            this.handleMessage(message);
        } catch (error) {
            console.error('Parse error:', error, 'Line:', line);
            // Don't throw - Claude sometimes outputs non-JSON
        }
    }
    
    // Route message by type
    handleMessage(message) {
        const { type, data } = message;
        
        switch (type) {
            case 'init':
                this.handleInit(data);
                break;
            case 'message_start':
                this.handleMessageStart(data);
                break;
            case 'content_start':
                this.handleContentStart(data);
                break;
            case 'content_delta':
                this.handleContentDelta(data);
                break;
            case 'content_end':
                this.handleContentEnd(data);
                break;
            case 'message_end':
                this.handleMessageEnd(data);
                break;
            case 'error':
                this.handleError(data);
                break;
            case 'done':
                this.handleDone(data);
                break;
            default:
                console.warn('Unknown message type:', type);
        }
    }
}
```

### Message Type Handlers

```javascript
// CRITICAL: Session ID extraction
handleInit(data) {
    // Session ID is ONLY available here
    this.sessionId = data.session_id;
    this.model = data.model;
    this.emit('session_started', {
        sessionId: this.sessionId,
        model: this.model,
        timestamp: Date.now()
    });
}

// Message lifecycle start
handleMessageStart(data) {
    this.currentMessage = {
        role: data.role,
        content: '',
        timestamp: Date.now(),
        streaming: true
    };
    this.isStreaming = true;
    this.emit('message_start', this.currentMessage);
}

// Content type initialization
handleContentStart(data) {
    this.currentContentType = data.content_type;
    
    if (data.content_type === 'text') {
        // Regular text content
        this.currentMessage.contentType = 'text';
    } else if (data.content_type === 'tool_use') {
        // Tool invocation
        this.currentMessage.contentType = 'tool';
        this.currentMessage.toolName = data.tool_name;
        this.currentMessage.toolInput = '';
    }
}

// CRITICAL: Streaming text accumulation
handleContentDelta(data) {
    const delta = data.delta || '';
    
    if (this.currentContentType === 'text') {
        this.currentMessage.content += delta;
        this.emit('content_delta', {
            delta,
            accumulated: this.currentMessage.content
        });
    } else if (this.currentContentType === 'tool_use') {
        this.currentMessage.toolInput += delta;
        this.emit('tool_delta', {
            delta,
            toolName: this.currentMessage.toolName,
            accumulated: this.currentMessage.toolInput
        });
    }
}

// Content block completion
handleContentEnd(data) {
    this.emit('content_end', {
        type: this.currentContentType,
        content: this.currentMessage.content
    });
    this.currentContentType = null;
}

// CRITICAL: Token usage extraction
handleMessageEnd(data) {
    this.isStreaming = false;
    this.currentMessage.streaming = false;
    
    // Extract token usage
    if (data.usage) {
        this.tokenUsage.input_tokens += data.usage.input_tokens || 0;
        this.tokenUsage.output_tokens += data.usage.output_tokens || 0;
        this.tokenUsage.cache_creation_tokens += data.usage.cache_creation_tokens || 0;
        this.tokenUsage.cache_read_tokens += data.usage.cache_read_tokens || 0;
    }
    
    // Stop reason
    this.currentMessage.stopReason = data.stop_reason;
    
    this.emit('message_end', {
        message: this.currentMessage,
        usage: data.usage,
        stopReason: data.stop_reason
    });
    
    this.currentMessage = null;
}

// Error handling
handleError(data) {
    this.isStreaming = false;
    this.emit('error', {
        type: data.error_type,
        message: data.message,
        details: data.details
    });
}

// Session completion
handleDone(data) {
    this.isStreaming = false;
    this.emit('done', {
        sessionId: this.sessionId,
        totalUsage: this.tokenUsage
    });
}
```

## Advanced Parsing Patterns

### Thinking Block Detection
```javascript
// Claude thinking blocks have special format
class ThinkingParser extends ClaudeStreamParser {
    constructor() {
        super();
        this.isThinking = false;
        this.thinkingContent = '';
    }
    
    handleContentStart(data) {
        if (data.metadata?.is_thinking) {
            this.isThinking = true;
            this.thinkingContent = '';
            this.emit('thinking_start');
        } else {
            super.handleContentStart(data);
        }
    }
    
    handleContentDelta(data) {
        if (this.isThinking) {
            this.thinkingContent += data.delta;
            this.emit('thinking_delta', {
                delta: data.delta,
                accumulated: this.thinkingContent
            });
        } else {
            super.handleContentDelta(data);
        }
    }
    
    handleContentEnd(data) {
        if (this.isThinking) {
            this.emit('thinking_end', {
                content: this.thinkingContent
            });
            this.isThinking = false;
            this.thinkingContent = '';
        } else {
            super.handleContentEnd(data);
        }
    }
}
```

### Multi-Part Message Handling
```javascript
// Handle messages with multiple content blocks
class MultiPartParser extends ClaudeStreamParser {
    constructor() {
        super();
        this.contentBlocks = [];
        this.currentBlockIndex = -1;
    }
    
    handleContentStart(data) {
        this.currentBlockIndex++;
        this.contentBlocks[this.currentBlockIndex] = {
            type: data.content_type,
            content: '',
            metadata: data.metadata || {}
        };
        super.handleContentStart(data);
    }
    
    handleContentDelta(data) {
        if (this.currentBlockIndex >= 0) {
            this.contentBlocks[this.currentBlockIndex].content += data.delta;
        }
        super.handleContentDelta(data);
    }
    
    handleMessageEnd(data) {
        // Attach all content blocks to message
        this.currentMessage.contentBlocks = [...this.contentBlocks];
        this.contentBlocks = [];
        this.currentBlockIndex = -1;
        super.handleMessageEnd(data);
    }
}
```

### Verbose Mode Parser
```javascript
// With --verbose flag, additional metadata appears
class VerboseParser extends ClaudeStreamParser {
    handleMessage(message) {
        // Verbose mode includes debug messages
        if (message.type === 'debug') {
            this.handleDebug(message.data);
            return;
        }
        
        // Verbose mode includes timing
        if (message.type === 'timing') {
            this.handleTiming(message.data);
            return;
        }
        
        super.handleMessage(message);
    }
    
    handleDebug(data) {
        this.emit('debug', {
            level: data.level,
            message: data.message,
            timestamp: data.timestamp
        });
    }
    
    handleTiming(data) {
        this.emit('timing', {
            phase: data.phase,
            duration_ms: data.duration_ms
        });
    }
}
```

## Buffering Strategies

### Line Buffer with Partial Handling
```javascript
class RobustLineBuffer {
    constructor(onLine) {
        this.buffer = '';
        this.onLine = onLine;
        this.maxBufferSize = 1024 * 1024; // 1MB max
    }
    
    feed(chunk) {
        this.buffer += chunk;
        
        // Prevent memory overflow
        if (this.buffer.length > this.maxBufferSize) {
            console.error('Buffer overflow, clearing');
            this.buffer = '';
            return;
        }
        
        // Process all complete lines
        let newlineIndex;
        while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
            const line = this.buffer.slice(0, newlineIndex);
            this.buffer = this.buffer.slice(newlineIndex + 1);
            
            if (line.trim()) {
                try {
                    this.onLine(line);
                } catch (error) {
                    console.error('Line processing error:', error);
                }
            }
        }
    }
    
    flush() {
        // Process remaining buffer on stream end
        if (this.buffer.trim()) {
            try {
                this.onLine(this.buffer);
            } catch (error) {
                console.error('Flush error:', error);
            }
        }
        this.buffer = '';
    }
}
```

### Chunked Parser for Large Responses
```javascript
class ChunkedParser extends ClaudeStreamParser {
    constructor() {
        super();
        this.chunkSize = 4096; // 4KB chunks
        this.pendingContent = '';
    }
    
    handleContentDelta(data) {
        this.pendingContent += data.delta;
        
        // Emit in chunks to prevent UI blocking
        while (this.pendingContent.length >= this.chunkSize) {
            const chunk = this.pendingContent.slice(0, this.chunkSize);
            this.pendingContent = this.pendingContent.slice(this.chunkSize);
            
            this.emit('content_chunk', {
                chunk,
                isPartial: true
            });
        }
        
        // Don't accumulate in main message to save memory
        // Reconstruct from chunks if needed
    }
    
    handleContentEnd(data) {
        // Emit remaining content
        if (this.pendingContent) {
            this.emit('content_chunk', {
                chunk: this.pendingContent,
                isPartial: false
            });
            this.pendingContent = '';
        }
        super.handleContentEnd(data);
    }
}
```

## Error Recovery Patterns

### Malformed JSON Recovery
```javascript
class RecoverableParser extends ClaudeStreamParser {
    processLine(line) {
        try {
            const message = JSON.parse(line);
            this.consecutiveErrors = 0;
            this.handleMessage(message);
        } catch (error) {
            this.consecutiveErrors = (this.consecutiveErrors || 0) + 1;
            
            // Try to extract partial JSON
            const partialMatch = line.match(/\{"type":"([^"]+)"/);
            if (partialMatch) {
                const type = partialMatch[1];
                
                // Handle known safe failures
                if (type === 'content_delta') {
                    // Try to extract delta
                    const deltaMatch = line.match(/"delta":"([^"]*)"/);
                    if (deltaMatch) {
                        this.handleContentDelta({ delta: deltaMatch[1] });
                        return;
                    }
                }
            }
            
            // Log but don't crash
            console.warn('Malformed JSON:', line.slice(0, 100));
            
            // Abort if too many consecutive errors
            if (this.consecutiveErrors > 10) {
                this.emit('error', {
                    type: 'parse_failure',
                    message: 'Too many consecutive parse errors'
                });
            }
        }
    }
}
```

### Stream Interruption Recovery
```javascript
class InterruptRecoveryParser extends ClaudeStreamParser {
    constructor() {
        super();
        this.lastActivity = Date.now();
        this.checkInterval = null;
    }
    
    startHealthCheck() {
        this.checkInterval = setInterval(() => {
            const idleTime = Date.now() - this.lastActivity;
            
            if (this.isStreaming && idleTime > 30000) {
                // 30 seconds without data during streaming
                this.emit('stream_timeout', {
                    idleTime,
                    lastContent: this.currentMessage?.content.slice(-100)
                });
                
                // Force end streaming
                this.handleMessageEnd({
                    stop_reason: 'timeout',
                    usage: {}
                });
            }
        }, 5000);
    }
    
    feed(chunk) {
        this.lastActivity = Date.now();
        super.feed(chunk);
    }
    
    cleanup() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }
    }
}
```

## Real-World Integration

### Node.js Child Process Integration
```javascript
const { spawn } = require('child_process');
const { EventEmitter } = require('events');

class ClaudeCliClient extends EventEmitter {
    constructor(claudeBinary) {
        super();
        this.claudeBinary = claudeBinary;
        this.parser = new ClaudeStreamParser();
        this.setupParserEvents();
    }
    
    setupParserEvents() {
        this.parser.on = (event, handler) => {
            // Forward parser events
            this.on(`parser:${event}`, handler);
        };
        
        this.parser.emit = (event, data) => {
            this.emit(`parser:${event}`, data);
        };
    }
    
    spawn(args) {
        this.process = spawn(this.claudeBinary, args, {
            stdio: ['pipe', 'pipe', 'pipe']
        });
        
        // Parse stdout
        this.process.stdout.on('data', (chunk) => {
            this.parser.feed(chunk.toString());
        });
        
        // Handle stderr (errors/warnings)
        this.process.stderr.on('data', (chunk) => {
            const text = chunk.toString();
            
            // Some stderr is normal (progress, warnings)
            if (text.includes('ERROR') || text.includes('FATAL')) {
                this.emit('error', {
                    type: 'stderr',
                    message: text
                });
            } else {
                this.emit('warning', text);
            }
        });
        
        // Process exit
        this.process.on('exit', (code, signal) => {
            this.parser.flush();
            this.emit('exit', { code, signal });
        });
        
        return this.process;
    }
}
```

### WebSocket Streaming
```javascript
// Stream parsed output over WebSocket
class ClaudeWebSocketStreamer {
    constructor(ws) {
        this.ws = ws;
        this.parser = new ClaudeStreamParser();
        this.setupStreaming();
    }
    
    setupStreaming() {
        // Session started
        this.parser.on('session_started', (data) => {
            this.ws.send(JSON.stringify({
                type: 'session_started',
                sessionId: data.sessionId,
                model: data.model
            }));
        });
        
        // Content streaming
        this.parser.on('content_delta', (data) => {
            this.ws.send(JSON.stringify({
                type: 'content_delta',
                delta: data.delta
            }));
        });
        
        // Message complete
        this.parser.on('message_end', (data) => {
            this.ws.send(JSON.stringify({
                type: 'message_complete',
                usage: data.usage,
                stopReason: data.stopReason
            }));
        });
        
        // Error
        this.parser.on('error', (data) => {
            this.ws.send(JSON.stringify({
                type: 'error',
                error: data
            }));
        });
    }
    
    feedData(chunk) {
        this.parser.feed(chunk);
    }
}
```

## Performance Optimization

### Lazy Parsing
```javascript
// Only parse what's needed for UI
class LazyParser extends ClaudeStreamParser {
    constructor(options = {}) {
        super();
        this.parseContent = options.parseContent !== false;
        this.parseUsage = options.parseUsage !== false;
        this.parseMetadata = options.parseMetadata !== false;
    }
    
    handleContentDelta(data) {
        if (!this.parseContent) {
            // Skip content parsing for performance
            this.emit('content_skipped');
            return;
        }
        super.handleContentDelta(data);
    }
    
    handleMessageEnd(data) {
        if (!this.parseUsage) {
            delete data.usage;
        }
        super.handleMessageEnd(data);
    }
}
```

### Batch Processing
```javascript
// Batch deltas to reduce UI updates
class BatchedParser extends ClaudeStreamParser {
    constructor(batchInterval = 100) {
        super();
        this.batchInterval = batchInterval;
        this.deltaBatch = [];
        this.batchTimer = null;
    }
    
    handleContentDelta(data) {
        this.deltaBatch.push(data.delta);
        
        if (!this.batchTimer) {
            this.batchTimer = setTimeout(() => {
                this.flushBatch();
            }, this.batchInterval);
        }
    }
    
    flushBatch() {
        if (this.deltaBatch.length > 0) {
            const combined = this.deltaBatch.join('');
            this.emit('content_batch', {
                delta: combined,
                count: this.deltaBatch.length
            });
            this.deltaBatch = [];
        }
        this.batchTimer = null;
    }
    
    handleMessageEnd(data) {
        this.flushBatch();
        super.handleMessageEnd(data);
    }
}
```

## Critical Parsing Rules

1. **Session ID is only in init message** - Must capture immediately
2. **Content deltas must be accumulated** - They arrive character by character
3. **Token usage is in message_end** - Not available until message completes
4. **Newlines are message separators** - Each JSON object on own line
5. **Buffer incomplete lines** - Chunks may split mid-JSON
6. **Handle non-JSON lines** - Claude sometimes outputs progress/debug text
7. **Flush on process exit** - Final line may not have newline
8. **Track streaming state** - Critical for UI updates
9. **Parse errors are recoverable** - Don't crash on malformed JSON
10. **Memory management** - Don't accumulate unbounded content