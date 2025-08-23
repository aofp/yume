# Session ID Extraction: The Most Critical Part of Claude CLI Integration

## Why Session ID is EVERYTHING

Without the session ID, you CANNOT:
- Resume conversations
- Track token usage per session
- Implement checkpoints
- Associate messages with sessions
- Kill specific sessions
- Implement multi-session support

## When & Where Session ID Appears

### The ONLY Place: Init Message
```json
{"type":"init","data":{"session_id":"01JAX4KY9Z8V5W3N2Q1R6P0M7F","model":"claude-3-5-sonnet-20241022","cwd":"/Users/name/project"}}
```

**CRITICAL FACTS:**
1. Session ID appears ONLY in the first JSON message
2. It's in the `init` type message
3. You get ONE CHANCE to capture it
4. If you miss it, you can't get it back
5. It appears within 100-500ms of process spawn

## Extraction Implementation

### Pattern 1: Immediate Capture (RECOMMENDED)
```javascript
class SessionIdExtractor {
    constructor() {
        this.sessionId = null;
        this.capturePromise = null;
        this.captured = false;
    }
    
    startCapture(process) {
        this.capturePromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Session ID capture timeout'));
            }, 5000); // 5 second timeout
            
            let buffer = '';
            
            const onData = (chunk) => {
                buffer += chunk.toString();
                
                // Look for init message
                const lines = buffer.split('\n');
                
                for (const line of lines) {
                    if (line.trim() && !this.captured) {
                        try {
                            const msg = JSON.parse(line);
                            
                            // CRITICAL: Check for init message
                            if (msg.type === 'init' && msg.data?.session_id) {
                                this.sessionId = msg.data.session_id;
                                this.captured = true;
                                
                                clearTimeout(timeout);
                                process.stdout.removeListener('data', onData);
                                
                                resolve(this.sessionId);
                                return;
                            }
                        } catch (e) {
                            // Not JSON or parse error, continue
                        }
                    }
                }
                
                // Keep only incomplete line in buffer
                buffer = lines[lines.length - 1];
            };
            
            process.stdout.on('data', onData);
            
            // Also check stderr for errors
            process.stderr.once('data', (chunk) => {
                const error = chunk.toString();
                if (error.includes('ERROR') || error.includes('Failed')) {
                    clearTimeout(timeout);
                    reject(new Error(`Claude error: ${error}`));
                }
            });
        });
        
        return this.capturePromise;
    }
    
    async getSessionId() {
        if (this.captured) {
            return this.sessionId;
        }
        if (this.capturePromise) {
            return await this.capturePromise;
        }
        throw new Error('Capture not started');
    }
}

// Usage
const extractor = new SessionIdExtractor();
const process = spawn('claude', args);
const sessionId = await extractor.startCapture(process);
console.log('Captured session ID:', sessionId);
```

### Pattern 2: Stream Parser Integration
```javascript
class StreamParserWithSessionCapture {
    constructor() {
        this.sessionId = null;
        this.sessionCallbacks = [];
        this.buffer = '';
    }
    
    onSessionId(callback) {
        if (this.sessionId) {
            // Already have it
            callback(this.sessionId);
        } else {
            // Queue callback
            this.sessionCallbacks.push(callback);
        }
    }
    
    feed(chunk) {
        this.buffer += chunk;
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop() || '';
        
        for (const line of lines) {
            this.processLine(line);
        }
    }
    
    processLine(line) {
        if (!line.trim()) return;
        
        try {
            const msg = JSON.parse(line);
            
            // PRIORITY 1: Extract session ID
            if (!this.sessionId && msg.type === 'init') {
                this.handleInit(msg.data);
            }
            
            // Continue with other processing
            this.routeMessage(msg);
        } catch (e) {
            console.warn('Parse error:', e);
        }
    }
    
    handleInit(data) {
        if (data.session_id) {
            this.sessionId = data.session_id;
            
            // Notify all waiting callbacks
            for (const callback of this.sessionCallbacks) {
                callback(this.sessionId);
            }
            this.sessionCallbacks = [];
            
            // Store immediately
            this.persistSessionId(this.sessionId);
        }
    }
    
    persistSessionId(sessionId) {
        // CRITICAL: Store immediately in case of crash
        fs.writeFileSync(
            `.claude-session-${Date.now()}.txt`,
            sessionId,
            'utf8'
        );
    }
}
```

### Pattern 3: Rust Implementation (Claudia Style)
```rust
use tokio::io::{AsyncBufReadExt, BufReader};
use std::sync::{Arc, Mutex};

pub struct SessionIdCapture {
    session_id: Arc<Mutex<Option<String>>>,
}

impl SessionIdCapture {
    pub fn new() -> Self {
        Self {
            session_id: Arc::new(Mutex::new(None)),
        }
    }
    
    pub async fn capture_from_stdout(
        &self,
        stdout: tokio::process::ChildStdout
    ) -> Result<String, String> {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        let session_id_clone = self.session_id.clone();
        
        // Set timeout
        let capture = async {
            while let Ok(Some(line)) = lines.next_line().await {
                if let Ok(msg) = serde_json::from_str::<serde_json::Value>(&line) {
                    // CRITICAL: Check for init message
                    if msg["type"] == "init" {
                        if let Some(sid) = msg["data"]["session_id"].as_str() {
                            let mut session_guard = session_id_clone.lock().unwrap();
                            *session_guard = Some(sid.to_string());
                            return Ok(sid.to_string());
                        }
                    }
                }
            }
            Err("Session ID not found in stream".to_string())
        };
        
        // Timeout after 5 seconds
        match tokio::time::timeout(
            std::time::Duration::from_secs(5),
            capture
        ).await {
            Ok(result) => result,
            Err(_) => Err("Session ID capture timeout".to_string())
        }
    }
}
```

## Common Failure Patterns

### MISTAKE 1: Processing Messages Before Session ID
```javascript
// WRONG - Processing messages without session ID
process.stdout.on('data', (chunk) => {
    const lines = chunk.toString().split('\n');
    for (const line of lines) {
        const msg = JSON.parse(line);
        // Processing without checking for session ID first
        handleMessage(msg);  // NO SESSION ID YET!
    }
});

// RIGHT - Session ID first, then processing
let sessionId = null;
process.stdout.on('data', (chunk) => {
    const lines = chunk.toString().split('\n');
    for (const line of lines) {
        const msg = JSON.parse(line);
        
        // ALWAYS check for session ID first
        if (!sessionId && msg.type === 'init') {
            sessionId = msg.data.session_id;
            registerSession(sessionId);
        }
        
        // Now safe to process with session context
        if (sessionId) {
            handleMessage(msg, sessionId);
        }
    }
});
```

### MISTAKE 2: Async Race Conditions
```javascript
// WRONG - Race condition
let sessionId = null;
process.stdout.on('data', async (chunk) => {
    // Async processing can cause race conditions
    await someAsyncOperation();
    
    // Session ID might be set by another chunk by now
    if (!sessionId) {
        // Might miss the init message
    }
});

// RIGHT - Synchronous session ID capture
let sessionId = null;
const sessionIdPromise = new Promise((resolve) => {
    process.stdout.on('data', (chunk) => {
        // Synchronous processing for session ID
        if (!sessionId) {
            const lines = chunk.toString().split('\n');
            for (const line of lines) {
                try {
                    const msg = JSON.parse(line);
                    if (msg.type === 'init' && msg.data?.session_id) {
                        sessionId = msg.data.session_id;
                        resolve(sessionId);
                        break;
                    }
                } catch {}
            }
        }
    });
});

// Wait for session ID before continuing
const capturedId = await sessionIdPromise;
```

### MISTAKE 3: Not Handling Resume vs New Session
```javascript
// WRONG - Assuming session ID always comes from init
const sessionId = await captureSessionId(process);

// RIGHT - Handle both new and resumed sessions
class SessionManager {
    async getSessionId(args, process) {
        // Check if we're resuming
        const resumeIndex = args.indexOf('--resume');
        if (resumeIndex !== -1) {
            // We already know the session ID
            const knownSessionId = args[resumeIndex + 1];
            
            // But verify it's accepted
            const initMsg = await this.waitForInit(process);
            if (initMsg.session_id !== knownSessionId) {
                throw new Error('Resume failed - different session ID');
            }
            
            return knownSessionId;
        } else {
            // New session - capture from init
            return await this.captureNewSessionId(process);
        }
    }
}
```

## Session ID Validation

### Format Validation
```javascript
function isValidSessionId(id) {
    // Claude session IDs are 26 characters, alphanumeric
    // Format: 01JAX4KY9Z8V5W3N2Q1R6P0M7F
    const pattern = /^[0-9A-Z]{26}$/;
    return pattern.test(id);
}

function validateAndStore(sessionId) {
    if (!sessionId) {
        throw new Error('Session ID is null');
    }
    
    if (!isValidSessionId(sessionId)) {
        throw new Error(`Invalid session ID format: ${sessionId}`);
    }
    
    // Store in multiple places for redundancy
    storeInMemory(sessionId);
    storeInFile(sessionId);
    storeInDatabase(sessionId);
    
    return sessionId;
}
```

### Session ID Recovery
```javascript
class SessionIdRecovery {
    constructor() {
        this.storage = {
            memory: new Map(),
            file: '.claude-sessions.json',
            recent: []
        };
    }
    
    async recoverSessionId(projectPath, timestamp) {
        // Try multiple recovery methods
        
        // 1. Check memory cache
        const fromMemory = this.storage.memory.get(projectPath);
        if (fromMemory) return fromMemory;
        
        // 2. Check file storage
        try {
            const sessions = JSON.parse(
                fs.readFileSync(this.storage.file, 'utf8')
            );
            const match = sessions.find(s => 
                s.projectPath === projectPath &&
                Math.abs(s.timestamp - timestamp) < 60000
            );
            if (match) return match.sessionId;
        } catch {}
        
        // 3. Check Claude's own storage
        const claudeDir = path.join(
            os.homedir(),
            '.claude',
            'projects',
            this.encodeProjectPath(projectPath)
        );
        
        if (fs.existsSync(claudeDir)) {
            const files = fs.readdirSync(claudeDir);
            const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));
            
            // Get most recent session
            const recent = jsonlFiles
                .map(f => ({
                    name: f.replace('.jsonl', ''),
                    time: fs.statSync(path.join(claudeDir, f)).mtime
                }))
                .sort((a, b) => b.time - a.time)[0];
            
            if (recent && isValidSessionId(recent.name)) {
                return recent.name;
            }
        }
        
        throw new Error('Could not recover session ID');
    }
    
    encodeProjectPath(projectPath) {
        // Claude encodes paths for directory names
        return projectPath.replace(/\//g, '-');
    }
}
```

## Process Registry Integration

### Immediate Registration Pattern
```javascript
class ProcessWithSessionRegistry {
    constructor() {
        this.registry = new Map();
        this.pendingRegistrations = new Map();
    }
    
    async spawnAndRegister(args, options) {
        const process = spawn('claude', args, options);
        const pid = process.pid;
        
        // Create pending registration
        this.pendingRegistrations.set(pid, {
            process,
            args,
            options,
            startTime: Date.now()
        });
        
        // Capture session ID
        const sessionId = await this.captureSessionId(process);
        
        // Complete registration
        this.registry.set(sessionId, {
            sessionId,
            pid,
            process,
            args,
            options,
            startTime: this.pendingRegistrations.get(pid).startTime
        });
        
        // Clean up pending
        this.pendingRegistrations.delete(pid);
        
        return { process, sessionId };
    }
    
    async captureSessionId(process) {
        return new Promise((resolve, reject) => {
            let captured = false;
            const timeout = setTimeout(() => {
                if (!captured) {
                    reject(new Error('Session ID timeout'));
                }
            }, 5000);
            
            const captureData = (chunk) => {
                const lines = chunk.toString().split('\n');
                
                for (const line of lines) {
                    if (!line.trim() || captured) continue;
                    
                    try {
                        const msg = JSON.parse(line);
                        if (msg.type === 'init' && msg.data?.session_id) {
                            captured = true;
                            clearTimeout(timeout);
                            resolve(msg.data.session_id);
                            
                            // Remove listener after capture
                            process.stdout.removeListener('data', captureData);
                            break;
                        }
                    } catch {}
                }
            };
            
            process.stdout.on('data', captureData);
        });
    }
    
    getBySessionId(sessionId) {
        return this.registry.get(sessionId);
    }
    
    killBySessionId(sessionId) {
        const entry = this.registry.get(sessionId);
        if (entry) {
            entry.process.kill();
            this.registry.delete(sessionId);
            return true;
        }
        return false;
    }
}
```

## Testing Session ID Extraction

### Unit Tests
```javascript
// test/session-id-extraction.test.js
const { spawn } = require('child_process');
const { SessionIdExtractor } = require('../src/session-extractor');

describe('Session ID Extraction', () => {
    test('captures session ID from init message', async () => {
        const mockProcess = {
            stdout: new EventEmitter(),
            stderr: new EventEmitter()
        };
        
        const extractor = new SessionIdExtractor();
        const capturePromise = extractor.startCapture(mockProcess);
        
        // Simulate Claude output
        mockProcess.stdout.emit('data', Buffer.from(
            '{"type":"init","data":{"session_id":"01JAX4KY9Z8V5W3N2Q1R6P0M7F"}}\n'
        ));
        
        const sessionId = await capturePromise;
        expect(sessionId).toBe('01JAX4KY9Z8V5W3N2Q1R6P0M7F');
    });
    
    test('handles fragmented JSON', async () => {
        const mockProcess = {
            stdout: new EventEmitter(),
            stderr: new EventEmitter()
        };
        
        const extractor = new SessionIdExtractor();
        const capturePromise = extractor.startCapture(mockProcess);
        
        // Send fragmented data
        mockProcess.stdout.emit('data', Buffer.from('{"type":"init","data":{'));
        mockProcess.stdout.emit('data', Buffer.from('"session_id":"01JAX4KY9Z8V5W3N2Q1R6P0M7F"'));
        mockProcess.stdout.emit('data', Buffer.from('}}\n'));
        
        const sessionId = await capturePromise;
        expect(sessionId).toBe('01JAX4KY9Z8V5W3N2Q1R6P0M7F');
    });
    
    test('times out if no session ID', async () => {
        const mockProcess = {
            stdout: new EventEmitter(),
            stderr: new EventEmitter()
        };
        
        const extractor = new SessionIdExtractor();
        const capturePromise = extractor.startCapture(mockProcess);
        
        // Send non-init messages
        mockProcess.stdout.emit('data', Buffer.from(
            '{"type":"message","data":{"content":"Hello"}}\n'
        ));
        
        await expect(capturePromise).rejects.toThrow('timeout');
    }, 6000);
});
```

## Critical Implementation Checklist

- [ ] Session ID extraction happens BEFORE any other processing
- [ ] Extraction is SYNCHRONOUS (no async until captured)
- [ ] Timeout is set (5 seconds max)
- [ ] Session ID is validated (26 char alphanumeric)
- [ ] Session ID is stored immediately (multiple places)
- [ ] Process is registered with session ID
- [ ] Resume vs new session logic is handled
- [ ] Fragmented JSON is handled
- [ ] Extraction failure is handled gracefully
- [ ] Session ID is attached to ALL emitted events
- [ ] Recovery mechanism exists for lost session IDs

## The Golden Rule

**CAPTURE SESSION ID FIRST, EVERYTHING ELSE SECOND**

Without the session ID, you have no context. With it, you can:
- Resume conversations
- Track usage
- Implement checkpoints
- Support multiple sessions
- Provide proper UI state

Session ID extraction is the MOST CRITICAL part of Claude CLI integration. Get this wrong and nothing else matters.