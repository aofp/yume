# Claudia Implementation Analysis

## 🔍 Key Findings from Studying Claudia

### 1. ProcessRegistry (registry.rs)
**Critical Patterns Identified:**
- **IMMEDIATE Registration**: Process registered right after spawn (line 62-84)
- **Process Types**: Two types - `AgentRun` and `ClaudeSession`
- **Unique ID Generation**: Uses high number starting at 1000000 for non-agent processes
- **Live Output Tracking**: Maintains live output buffer for each process
- **Graceful Shutdown**: Tries SIGTERM first, then SIGKILL if needed
- **Platform-Specific Kill**: Different commands for Windows vs Unix

**Implementation Requirements:**
- Arc<Mutex<>> for thread-safe process tracking
- HashMap for storing process handles by run_id
- Proper Drop trait implementation for cleanup
- Child process handle management

### 2. Binary Detection (claude_binary.rs)
**Discovery Methods (in priority order):**
1. Database stored path (if exists and valid)
2. `which` command (handles aliases)
3. NVM installations (~/.nvm/versions/node/*/bin)
4. Standard paths (/usr/local/bin, /opt/homebrew/bin, etc.)
5. User paths (~/.local/bin, ~/.claude/local, etc.)
6. PATH environment variable

**Version Selection:**
- Extracts version using regex pattern: `\d+\.\d+\.\d+`
- Selects highest version when multiple found
- Falls back to path preference if no version available

**Environment Handling:**
- Preserves critical env vars (PATH, HOME, NODE_PATH, NVM_DIR, etc.)
- Adds NVM/Homebrew directories to PATH if needed
- Handles proxy environment variables

### 3. Claude Process Spawning (commands/claude.rs)
**Session ID Extraction (CRITICAL - 500ms window):**
```rust
// Line 1212-1238: Parse init message
if msg["type"] == "system" && msg["subtype"] == "init" {
    if let Some(claude_session_id) = msg["session_id"].as_str() {
        // IMMEDIATE registration with ProcessRegistry
        registry.register_claude_session(...)
    }
}
```

**Argument Order (EXACT):**
1. `--resume SESSION_ID` (if resuming)
2. `--continue` (if continuing)
3. `--prompt "text"`
4. `--model MODEL`
5. `--output-format stream-json`
6. `--print` (CRITICAL - must always be present)

**Stream Handling:**
- Spawns separate tasks for stdout and stderr
- Uses BufReader with AsyncBufReadExt
- Emits events: `claude-output:SESSION_ID` and `claude-error:SESSION_ID`
- Stores live output in ProcessRegistry

**Process Management:**
- Stores child in global ClaudeProcessState
- Kills existing process before starting new one
- Waits for process completion
- Emits `claude-complete:SESSION_ID` event when done

## 📊 Architecture Comparison

### Current yurucode (BROKEN):
```
User Input → React → Socket.IO → Node.js Server → Claude CLI
                ↑                      ↓
                └──────────────────────┘
```
**Problems:**
- 2-hour timeout in embedded server
- Node.js middle layer adds complexity
- Socket.IO can lose messages
- Server embedded in Rust as string

### Target Architecture (from claudia):
```
User Input → React → Tauri Events → Rust → Claude CLI
                ↑                      ↓
                └──────────────────────┘
```
**Benefits:**
- NO TIMEOUTS (direct spawning)
- Direct process control
- Immediate process registration
- Native event system

## 🚨 Critical Implementation Points

### 1. Session ID Extraction
- **Window**: ONLY 500ms after spawn
- **Location**: First stdout line with `type:system, subtype:init`
- **Format**: 26-character string
- **Action**: IMMEDIATE registration after extraction

### 2. Process Registration Timing
```rust
// WRONG - Can create orphans
let child = spawn_claude()?;
let session_id = extract_id(child).await?; // Could fail!
registry.register(child);

// RIGHT - Always registered
let child = spawn_claude()?;
registry.register(child); // IMMEDIATELY!
let session_id = extract_id(child).await?;
```

### 3. Stream JSON Parsing
- Parse each line as JSON
- Look for specific message types
- Handle partial lines and buffer management
- Clear buffer after each complete line

### 4. Event Names
- Session-specific: `claude-output:SESSION_ID`
- Generic fallback: `claude-output`
- Completion: `claude-complete:SESSION_ID`

## 🎯 Migration Path

### Phase 1: Backend Foundation
1. Copy ProcessRegistry exactly from claudia
2. Copy Binary Detection exactly from claudia
3. Implement ClaudeProcessState

### Phase 2: Core Spawning
1. Implement spawn_claude_process function
2. Add session ID extraction logic
3. Implement stream handlers

### Phase 3: Frontend Migration
1. Replace Socket.IO with Tauri event listeners
2. Update store to use Tauri commands
3. Handle session-specific events

## ⚠️ Common Pitfalls to Avoid

1. **Missing --print flag**: Claude won't output anything
2. **Wrong argument order**: Session won't resume
3. **Late registration**: Process becomes orphan
4. **Buffer overflow**: Not clearing after each line
5. **Missing env vars**: Claude can't find Node.js

## 📝 Notes on Current yurucode Issues

### The Embedded Server Problem
- Server code is at line 124+ in `logged_server.rs`
- It's a JavaScript string constant `EMBEDDED_SERVER`
- Extracted to `/tmp/yurucode-server/server.cjs` at runtime
- Has hardcoded 2-hour timeout causing freezes

### Why Direct Spawning Fixes Everything
- No intermediate server = no timeouts
- Direct process control = immediate kill
- Native Rust = better memory management
- Tauri events = reliable communication

## 🔧 Implementation Priority

1. **IMMEDIATE**: ProcessRegistry (prevents orphans)
2. **CRITICAL**: Session ID extraction (500ms window)
3. **IMPORTANT**: Binary detection (finds Claude)
4. **REQUIRED**: Stream parsing (communication)
5. **NECESSARY**: Frontend migration (user interaction)

---

**Conclusion**: Claudia's implementation is proven to work without freezes. The key is DIRECT spawning with IMMEDIATE registration and proper session ID extraction within the 500ms window.