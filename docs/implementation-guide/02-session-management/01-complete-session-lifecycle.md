# Complete Session Lifecycle: From Creation to Destruction

## Table of Contents
1. [Session Architecture Overview](#session-architecture-overview)
2. [Session Creation Deep Dive](#session-creation-deep-dive)
3. [Session Persistence & Storage](#session-persistence--storage)
4. [Session Resumption Mechanics](#session-resumption-mechanics)
5. [Session State Synchronization](#session-state-synchronization)
6. [Error Recovery Patterns](#error-recovery-patterns)
7. [Memory Management](#memory-management)
8. [Implementation Checklist](#implementation-checklist)

---

## Session Architecture Overview

### Claudia's Session Model

```rust
// Core session components
pub struct Session {
    pub id: String,                    // UUID from Claude
    pub project_id: String,            // Encoded project path
    pub project_path: String,          // Actual filesystem path
    pub todo_data: Option<Value>,      // Associated todo state
    pub created_at: u64,               // Unix timestamp
    pub first_message: Option<String>, // For display
    pub message_timestamp: Option<String>,
    
    // Runtime state (not persisted)
    pub process_handle: Option<ProcessHandle>,
    pub streaming: bool,
    pub last_activity: SystemTime,
}
```

### Yurucode's Current Issues

```javascript
// Yurucode's in-memory session (embedded server)
const sessions = new Map(); // PROBLEM: Lost on crash

sessions.set(sessionId, {
    claudeSessionId: null,  // May be null if resume fails
    workingDir: workingDirectory,
    messages: [],           // Accumulates indefinitely
    streaming: false,
    lastAssistantMessageIds: new Set(),
    wasInterrupted: false,
    pendingContextRestore: false
});
```

**Critical Problems:**
1. Sessions stored in JavaScript Map (volatile)
2. No persistence between server restarts
3. Memory leak from accumulated messages
4. No session migration capability
5. Resume failures cause state inconsistency

---

## Session Creation Deep Dive

### Step 1: Initial Request Processing

**Claudia's Approach:**
```rust
#[tauri::command]
pub async fn execute_claude_code(
    app: AppHandle,
    project_path: String,
    prompt: String,
    model: String,
) -> Result<(), String> {
    // 1. Validate inputs
    if project_path.trim().is_empty() {
        return Err("Project path required".to_string());
    }
    
    // 2. Find Claude binary (cached after first call)
    let claude_path = find_claude_binary(&app)?;
    
    // 3. Build arguments - CRITICAL ORDER
    let args = vec![
        "-p".to_string(),           // Prompt flag
        prompt.clone(),              // User's prompt
        "--model".to_string(),       // Model flag
        model.clone(),               // Model identifier
        "--output-format".to_string(),
        "stream-json".to_string(),   // REQUIRED for parsing
        "--verbose".to_string(),     // Include metadata
        "--dangerously-skip-permissions".to_string(), // Auto-approve
    ];
    
    // 4. Create command with proper environment
    let cmd = create_system_command(&claude_path, args, &project_path);
    
    // 5. Spawn and handle streaming
    spawn_claude_process(app, cmd, prompt, model, project_path).await
}
```

**GOTCHA #1: Argument Order Matters**
```rust
// WRONG - Claude expects specific order
let args = vec![
    "--model", model,
    "-p", prompt,  // Prompt must come after its flag
];

// RIGHT
let args = vec![
    "-p", prompt,
    "--model", model,
];
```

**GOTCHA #2: Environment Variables**
```rust
fn create_system_command(claude_path: &str, args: Vec<String>, project_path: &str) -> Command {
    let mut cmd = create_command_with_env(claude_path);
    
    // CRITICAL: Must set working directory
    cmd.current_dir(project_path)  // Claude uses this for relative paths
       .stdout(Stdio::piped())     // Required for streaming
       .stderr(Stdio::piped());     // Capture errors
    
    // Add all arguments
    for arg in args {
        cmd.arg(arg);
    }
    
    cmd
}
```

### Step 2: Session ID Extraction

**The Challenge:** Claude doesn't provide session ID immediately

```rust
// PATTERN: Parse stream for init message
let stdout_task = tokio::spawn(async move {
    let mut lines = stdout_reader.lines();
    let mut session_extracted = false;
    
    while let Ok(Some(line)) = lines.next_line().await {
        if !session_extracted {
            if let Ok(msg) = serde_json::from_str::<Value>(&line) {
                // Claude sends this format:
                // {"type":"system","subtype":"init","session_id":"uuid-here",...}
                if msg["type"] == "system" && msg["subtype"] == "init" {
                    if let Some(sid) = msg["session_id"].as_str() {
                        session_extracted = true;
                        
                        // CRITICAL: Store immediately
                        create_session_record(sid, &project_path).await?;
                        
                        // Register with ProcessRegistry
                        registry.register_claude_session(
                            sid.to_string(),
                            pid,
                            project_path.clone(),
                            prompt.clone(),
                            model.clone()
                        )?;
                    }
                }
            }
        }
        
        // Continue processing all lines
        process_stream_line(&line, session_id).await;
    }
});
```

### Step 3: Session Storage

**File Structure:**
```
~/.claude/
├── projects/
│   ├── -Users-name-project1/       # Encoded project path
│   │   ├── session-id-1.jsonl      # Session history
│   │   ├── session-id-2.jsonl      # Another session
│   │   └── .metadata.json          # Project metadata
│   └── -Users-name-project2/
│       └── session-id-3.jsonl
├── checkpoints/                    # Claudia's checkpoint system
│   └── session-id-1/
│       └── checkpoint-id/
│           ├── metadata.json
│           ├── messages.zst        # Compressed messages
│           └── files/              # File snapshots
└── settings.json                   # User settings
```

**Session JSONL Format:**
```jsonl
{"type":"system","subtype":"init","session_id":"abc-123","cwd":"/Users/name/project","timestamp":"2024-01-15T10:00:00Z"}
{"type":"user","message":{"role":"user","content":"Write hello world"},"timestamp":"2024-01-15T10:00:01Z"}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"I'll write..."}]},"timestamp":"2024-01-15T10:00:02Z"}
{"type":"tool_use","tool":"Write","input":{"file_path":"hello.py","content":"print('Hello')"},"timestamp":"2024-01-15T10:00:03Z"}
```

---

## Session Persistence & Storage

### Claudia's Compression Strategy

```rust
use zstd::stream::{encode_all, decode_all};

pub struct CheckpointStorage {
    compression_level: i32,  // Default: 3 (balance speed/size)
}

impl CheckpointStorage {
    pub fn save_messages(&self, messages: &str) -> Result<Vec<u8>> {
        // Compress with zstd (70% size reduction typical)
        let compressed = encode_all(
            messages.as_bytes(), 
            self.compression_level
        )?;
        
        // GOTCHA: Check compression actually helped
        if compressed.len() >= messages.len() {
            // Compression made it bigger (rare but possible)
            return Ok(messages.as_bytes().to_vec());
        }
        
        Ok(compressed)
    }
    
    pub fn load_messages(&self, compressed: &[u8]) -> Result<String> {
        // Try decompression first
        match decode_all(compressed) {
            Ok(decompressed) => String::from_utf8(decompressed)
                .map_err(|e| anyhow!("Invalid UTF-8: {}", e)),
            Err(_) => {
                // Might be uncompressed (fallback)
                String::from_utf8(compressed.to_vec())
                    .map_err(|e| anyhow!("Failed to decode: {}", e))
            }
        }
    }
}
```

### Content-Addressable Storage for Files

```rust
// Claudia's deduplication strategy
pub fn save_file_snapshot(&self, snapshot: &FileSnapshot) -> Result<()> {
    // Use SHA256 hash as filename
    let mut hasher = Sha256::new();
    hasher.update(&snapshot.content);
    let hash = format!("{:x}", hasher.finalize());
    
    // Store in content pool (deduplicates identical files)
    let content_file = self.content_pool_dir.join(&hash);
    
    if !content_file.exists() {
        // First time seeing this content
        let compressed = encode_all(
            snapshot.content.as_bytes(),
            self.compression_level
        )?;
        fs::write(&content_file, compressed)?;
    }
    
    // Create reference pointing to content
    let reference = json!({
        "path": snapshot.file_path,
        "hash": hash,
        "permissions": snapshot.permissions,
        "checkpoint_id": snapshot.checkpoint_id,
    });
    
    fs::write(
        self.refs_dir.join(&snapshot.checkpoint_id).join("ref.json"),
        serde_json::to_string_pretty(&reference)?
    )?;
    
    Ok(())
}
```

---

## Session Resumption Mechanics

### The --resume Flag Deep Dive

**What --resume Actually Does:**
1. Restores Claude's internal conversation state
2. Rebuilds tool usage history
3. Reconstructs file modification tracking
4. Re-establishes context window

### Claudia's Resume Implementation

```rust
pub async fn resume_claude_code(
    app: AppHandle,
    project_path: String,
    session_id: String,  // Critical: Must be Claude's session ID
    prompt: String,
    model: String,
) -> Result<(), String> {
    // Verify session exists in Claude's storage
    let session_path = get_claude_dir()?
        .join("projects")
        .join(encode_project_path(&project_path))
        .join(format!("{}.jsonl", session_id));
    
    if !session_path.exists() {
        return Err(format!("Session {} not found", session_id));
    }
    
    // Build resume arguments
    let args = vec![
        "--resume".to_string(),      // Resume flag
        session_id.clone(),           // Session to resume
        "-p".to_string(),            // New prompt
        prompt.clone(),
        "--model".to_string(),
        model.clone(),
        "--output-format".to_string(),
        "stream-json".to_string(),
        "--verbose".to_string(),
    ];
    
    let cmd = create_system_command(&claude_path, args, &project_path);
    spawn_claude_process(app, cmd, prompt, model, project_path).await
}
```

### Yurucode's Resume Problem

```javascript
// Current yurucode approach (embedded server)
if (session.claudeSessionId) {
    args.push('--resume', session.claudeSessionId);
    console.log('🔄 Using --resume flag with session:', session.claudeSessionId);
} else {
    console.log('⚠️ No session ID, creating new session');
}

// PROBLEM: What if resume fails?
claudeProcess.on('exit', (code) => {
    if (code === 1) {
        // Resume failed - session doesn't exist
        // Yurucode's "solution": Clear session ID and retry
        session.claudeSessionId = null;
        // This loses all context!
    }
});
```

### Proper Resume Failure Handling

```rust
// Claudia's approach
async fn resume_with_fallback(
    session_id: String,
    prompt: String,
) -> Result<String, String> {
    // Try resume first
    match resume_claude_code(session_id.clone(), prompt.clone()).await {
        Ok(()) => Ok(session_id),
        Err(e) if e.contains("No conversation found") => {
            // Session doesn't exist in Claude's storage
            log::warn!("Resume failed, creating new session with history");
            
            // Load historical messages
            let messages = load_session_history(&session_id)?;
            
            // Create new session with context
            create_session_with_context(messages, prompt).await
        }
        Err(e) => Err(e)
    }
}

async fn create_session_with_context(
    historical_messages: Vec<Value>,
    new_prompt: String
) -> Result<String, String> {
    // Build context prompt including history
    let mut context = String::new();
    context.push_str("Previous conversation context:\n");
    
    for msg in historical_messages.iter().take(10) {  // Limit context size
        if let Some(content) = msg["message"]["content"].as_str() {
            context.push_str(&format!("- {}\n", content));
        }
    }
    
    context.push_str("\nContinue with the following request:\n");
    context.push_str(&new_prompt);
    
    // Create new session with context
    execute_claude_code(context).await
}
```

---

## Session State Synchronization

### The Three-Layer Sync Problem

```
Frontend State ←→ Backend State ←→ Claude State
     ↓                ↓                 ↓
  Zustand        ProcessRegistry    JSONL Files
```

### Critical Sync Points

1. **Session Creation**
```rust
// Backend notifies frontend
app.emit("session-created", json!({
    "session_id": session_id,
    "project_path": project_path,
    "created_at": SystemTime::now(),
}));

// Frontend updates store
sessionStore.addSession({
    id: event.payload.session_id,
    projectPath: event.payload.project_path,
    createdAt: new Date(event.payload.created_at),
});
```

2. **Message Streaming**
```rust
// Backend emits each message
app.emit(&format!("claude-output:{}", session_id), &line);

// Frontend maintains message array
const handleMessage = (line: string) => {
    const msg = JSON.parse(line);
    sessionStore.appendMessage(sessionId, msg);
    
    // CRITICAL: Update UI state based on message type
    if (msg.type === 'assistant' && msg.streaming === false) {
        sessionStore.setStreaming(sessionId, false);
    }
};
```

3. **Session Completion**
```rust
// Backend detects process exit
match child.wait().await {
    Ok(status) => {
        app.emit(&format!("claude-complete:{}", session_id), status.success());
        
        // Update ProcessRegistry
        registry.mark_session_complete(session_id);
        
        // Persist final state
        save_session_metadata(session_id, status);
    }
}
```

### State Consistency Guarantees

```typescript
// Frontend state management pattern
class SessionStore {
    private sessions: Map<string, Session> = new Map();
    private pendingUpdates: Map<string, Update[]> = new Map();
    
    async syncWithBackend(sessionId: string) {
        // Get backend state
        const backendSession = await invoke('get_session_state', { sessionId });
        
        // Detect conflicts
        const localSession = this.sessions.get(sessionId);
        if (localSession && localSession.version < backendSession.version) {
            // Backend is ahead - reconcile
            this.reconcileState(localSession, backendSession);
        }
        
        // Apply pending updates
        const pending = this.pendingUpdates.get(sessionId) || [];
        for (const update of pending) {
            await this.applyUpdate(sessionId, update);
        }
        this.pendingUpdates.delete(sessionId);
    }
    
    private reconcileState(local: Session, remote: Session) {
        // Merge strategy: Remote wins for facts, local wins for UI state
        const reconciled = {
            ...remote,  // Facts from backend
            uiState: local.uiState,  // Preserve UI state
            draftInput: local.draftInput,  // Preserve user input
        };
        
        this.sessions.set(reconciled.id, reconciled);
    }
}
```

---

## Error Recovery Patterns

### Common Failure Scenarios

1. **Claude Binary Not Found**
```rust
fn find_claude_with_fallback() -> Result<String, String> {
    // Try cached path first
    if let Ok(cached) = load_cached_claude_path() {
        if PathBuf::from(&cached).exists() {
            return Ok(cached);
        }
    }
    
    // Try common locations
    const COMMON_PATHS: &[&str] = &[
        "/usr/local/bin/claude",
        "/opt/homebrew/bin/claude",
        "~/.local/bin/claude",
    ];
    
    for path in COMMON_PATHS {
        let expanded = shellexpand::tilde(path).to_string();
        if PathBuf::from(&expanded).exists() {
            cache_claude_path(&expanded)?;
            return Ok(expanded);
        }
    }
    
    // Last resort: Ask user
    Err("Claude not found. Please select installation.".to_string())
}
```

2. **Session Corruption**
```rust
fn load_session_with_recovery(session_id: &str) -> Result<Vec<Value>> {
    let session_path = get_session_path(session_id);
    
    // Try primary file
    match read_jsonl_file(&session_path) {
        Ok(messages) => Ok(messages),
        Err(e) => {
            log::error!("Session file corrupted: {}", e);
            
            // Try backup
            let backup_path = session_path.with_extension("jsonl.bak");
            if backup_path.exists() {
                log::info!("Recovering from backup");
                return read_jsonl_file(&backup_path);
            }
            
            // Try checkpoint recovery
            if let Ok(checkpoint) = find_latest_checkpoint(session_id) {
                log::info!("Recovering from checkpoint: {}", checkpoint.id);
                return load_checkpoint_messages(&checkpoint);
            }
            
            Err(anyhow!("Session unrecoverable"))
        }
    }
}
```

3. **Memory Pressure**
```rust
struct SessionMemoryManager {
    max_messages_in_memory: usize,  // Default: 1000
    max_memory_mb: usize,           // Default: 100
}

impl SessionMemoryManager {
    async fn manage_memory(&self, session: &mut Session) {
        // Check message count
        if session.messages.len() > self.max_messages_in_memory {
            // Offload old messages to disk
            let to_offload = session.messages.drain(..500).collect::<Vec<_>>();
            self.write_to_overflow_file(&session.id, &to_offload).await?;
            
            // Keep reference to overflow file
            session.overflow_files.push(format!("{}-overflow-{}.jsonl", 
                session.id, 
                SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs()
            ));
        }
        
        // Check memory usage
        let memory_usage = self.estimate_memory_usage(&session);
        if memory_usage > self.max_memory_mb * 1024 * 1024 {
            // Force garbage collection
            session.messages.shrink_to_fit();
            
            // Clear caches
            session.clear_derived_data();
        }
    }
}
```

---

## Memory Management

### Message Accumulation Problem

**Yurucode's Issue:**
```javascript
// Messages accumulate forever
session.messages.push(newMessage);
// No cleanup, no limits, no offloading
```

**Claudia's Solution:**
```rust
pub struct MessageBuffer {
    messages: VecDeque<Message>,
    max_size: usize,
    overflow_strategy: OverflowStrategy,
}

pub enum OverflowStrategy {
    DropOldest,       // Remove old messages
    OffloadToDisk,    // Write to overflow file
    Compress,         // Compress old messages
    Summarize,        // AI summarization of old context
}

impl MessageBuffer {
    pub fn add_message(&mut self, msg: Message) -> Result<()> {
        if self.messages.len() >= self.max_size {
            match self.overflow_strategy {
                OverflowStrategy::DropOldest => {
                    self.messages.pop_front();
                }
                OverflowStrategy::OffloadToDisk => {
                    let batch = self.messages.drain(..100).collect::<Vec<_>>();
                    self.write_overflow_batch(batch)?;
                }
                OverflowStrategy::Compress => {
                    self.compress_old_messages()?;
                }
                OverflowStrategy::Summarize => {
                    let summary = self.summarize_context()?;
                    self.messages.clear();
                    self.messages.push_back(Message::Summary(summary));
                }
            }
        }
        
        self.messages.push_back(msg);
        Ok(())
    }
}
```

### Virtual Scrolling for Large Sessions

```typescript
// Use TanStack Virtual for rendering
import { useVirtualizer } from '@tanstack/react-virtual';

function MessageList({ messages }: { messages: Message[] }) {
    const parentRef = useRef<HTMLDivElement>(null);
    
    const virtualizer = useVirtualizer({
        count: messages.length,
        getScrollElement: () => parentRef.current,
        estimateSize: useCallback(() => 100, []),  // Estimated height
        overscan: 5,  // Render 5 extra items
        getItemKey: useCallback((index) => messages[index].id, [messages]),
    });
    
    // Only render visible items
    return (
        <div ref={parentRef} style={{ height: '600px', overflow: 'auto' }}>
            <div style={{ height: `${virtualizer.getTotalSize()}px` }}>
                {virtualizer.getVirtualItems().map((virtualItem) => (
                    <div
                        key={virtualItem.key}
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            transform: `translateY(${virtualItem.start}px)`,
                        }}
                    >
                        <Message message={messages[virtualItem.index]} />
                    </div>
                ))}
            </div>
        </div>
    );
}
```

---

## Implementation Checklist

### Phase 1: Core Session Management (Week 1)

- [ ] Remove embedded server from `logged_server.rs`
- [ ] Create `session.rs` module with proper types
- [ ] Implement `ProcessRegistry` for tracking
- [ ] Add session creation command
- [ ] Add session resume command
- [ ] Add session kill command
- [ ] Create session storage module
- [ ] Implement JSONL reading/writing

### Phase 2: Persistence Layer (Week 2)

- [ ] Implement zstd compression
- [ ] Create content-addressable file storage
- [ ] Add session metadata tracking
- [ ] Implement backup strategy
- [ ] Create recovery mechanisms
- [ ] Add session migration support
- [ ] Implement session export/import

### Phase 3: State Management (Week 3)

- [ ] Create proper Zustand stores
- [ ] Implement state synchronization
- [ ] Add optimistic updates
- [ ] Create conflict resolution
- [ ] Implement pending update queue
- [ ] Add state persistence
- [ ] Create state migration system

### Phase 4: Memory Optimization (Week 4)

- [ ] Implement message buffering
- [ ] Add overflow strategies
- [ ] Create virtual scrolling
- [ ] Implement lazy loading
- [ ] Add garbage collection triggers
- [ ] Create memory monitoring
- [ ] Implement cache eviction

### Testing Requirements

```rust
#[cfg(test)]
mod session_tests {
    use super::*;
    
    #[tokio::test]
    async fn test_session_creation() {
        let session = create_session("test", "prompt").await.unwrap();
        assert!(!session.id.is_empty());
        assert!(get_session_path(&session.id).exists());
    }
    
    #[tokio::test]
    async fn test_session_resume() {
        let session1 = create_session("test", "prompt1").await.unwrap();
        let session2 = resume_session(&session1.id, "prompt2").await.unwrap();
        assert_eq!(session1.id, session2.id);
    }
    
    #[tokio::test]
    async fn test_session_corruption_recovery() {
        let session = create_session("test", "prompt").await.unwrap();
        corrupt_session_file(&session.id);
        let recovered = load_session_with_recovery(&session.id).await;
        assert!(recovered.is_ok());
    }
    
    #[tokio::test]
    async fn test_memory_overflow() {
        let mut buffer = MessageBuffer::new(100, OverflowStrategy::OffloadToDisk);
        for i in 0..200 {
            buffer.add_message(create_test_message(i)).await.unwrap();
        }
        assert_eq!(buffer.messages.len(), 100);
        assert!(buffer.has_overflow_files());
    }
}
```

---

## Summary

The session management system is the **heart** of the Claude UI. Key requirements:

1. **Persistent Storage**: All sessions must survive restarts
2. **Reliable Resumption**: --resume must work or gracefully fallback
3. **State Consistency**: Frontend/Backend/Claude must stay in sync
4. **Memory Efficiency**: Handle 1000+ message sessions without OOM
5. **Error Recovery**: Corrupt sessions must be recoverable
6. **Performance**: <50ms session switch, <16ms render

Critical implementation order:
1. ProcessRegistry first (foundation)
2. Native CLI spawning (remove Node.js)
3. Proper state management (Zustand stores)
4. Memory optimization (virtual scrolling)
5. Error recovery (checkpoints)