# Day 2 Implementation Plan - Stream Parser & Integration

## 🎯 Day 2 Objectives

Build the stream parser for Claude's output and integrate all backend components to achieve a working end-to-end flow.

## 📅 Date: 2025-08-24

## 🏗️ Architecture Focus

```
Claude CLI → stdout/stderr → Stream Parser → Message Types → Frontend Events
                                    ↓
                              Token Analytics
                                    ↓
                              Session State
```

## 📋 Detailed Task Breakdown

### Morning Session (4 hours)

#### Phase 1: Stream Parser Core (2 hours)
1. **JSON Line Parser**
   - [ ] Handle complete JSON lines
   - [ ] Handle fragmented JSON
   - [ ] Buffer management
   - [ ] Error recovery

2. **Message Type System**
   - [ ] Define all message types enum
   - [ ] Parse type-specific fields
   - [ ] Handle unknown message types
   - [ ] Message validation

3. **Token Extraction**
   - [ ] Extract input_tokens
   - [ ] Extract output_tokens
   - [ ] Extract cache tokens
   - [ ] Accumulation logic (+=)

#### Phase 2: Process Integration (2 hours)
1. **Fix Child Process Management**
   - [ ] Modify registry to support child retrieval
   - [ ] Implement proper stdin handling
   - [ ] Connect stdout/stderr properly
   - [ ] Test process lifecycle

2. **Event Emission System**
   - [ ] Session-specific events
   - [ ] Generic fallback events
   - [ ] Error event handling
   - [ ] Completion events

### Afternoon Session (4 hours)

#### Phase 3: Title Generation (1 hour)
1. **Async Title Process**
   - [ ] Spawn separate Claude instance
   - [ ] Use Sonnet model
   - [ ] Extract title from response
   - [ ] 50-char limit enforcement

#### Phase 4: Integration Testing (3 hours)
1. **End-to-End Test**
   - [ ] Spawn Claude process
   - [ ] Send initial prompt
   - [ ] Receive streaming response
   - [ ] Extract session ID
   - [ ] Accumulate tokens
   - [ ] Clean shutdown

2. **Session Resume Test**
   - [ ] Create session
   - [ ] Send message
   - [ ] Resume session
   - [ ] Verify context maintained

3. **Error Handling Test**
   - [ ] Binary not found
   - [ ] Process crash
   - [ ] Timeout handling
   - [ ] Cleanup verification

## 📊 Critical Implementation Patterns

### 1. Stream Parser Pattern
```rust
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ClaudeStreamMessage {
    #[serde(rename = "text")]
    Text { content: String },
    
    #[serde(rename = "usage")]
    Usage {
        input_tokens: u32,
        output_tokens: u32,
        cache_creation_input_tokens: Option<u32>,
        cache_read_input_tokens: Option<u32>,
    },
    
    #[serde(rename = "system")]
    System {
        subtype: String,
        session_id: Option<String>,
    },
    
    #[serde(rename = "message_stop")]
    MessageStop,
    
    #[serde(rename = "error")]
    Error { message: String },
}
```

### 2. Token Accumulation Pattern
```rust
// ALWAYS use += for accumulation
if let ClaudeStreamMessage::Usage { input_tokens, output_tokens, .. } = msg {
    session.total_input_tokens += input_tokens;
    session.total_output_tokens += output_tokens;
}
```

### 3. Event Emission Pattern
```rust
// Session-specific event
app.emit(&format!("claude-output:{}", session_id), &message)?;

// Generic fallback
app.emit("claude-output", &message)?;
```

### 4. Process Lifecycle Pattern
```rust
// 1. Spawn
let mut child = spawn_claude(options)?;

// 2. Register IMMEDIATELY
let run_id = registry.register(child)?;

// 3. Extract session ID (500ms)
let session_id = extract_session_id(&mut child).await?;

// 4. Stream handling
handle_streams(&mut child, session_id).await?;

// 5. Cleanup (automatic via Drop)
```

## 🔧 Technical Challenges

### Challenge 1: Fragmented JSON
**Problem**: JSON messages may be split across multiple lines
**Solution**: Buffer incomplete lines, parse when complete

### Challenge 2: Child Process Access
**Problem**: Need to get child from registry for stdin/stdout
**Solution**: Add `take_child()` method to registry

### Challenge 3: Concurrent Streaming
**Problem**: Multiple sessions streaming simultaneously
**Solution**: Session-isolated event channels

## 📈 Success Metrics

### Stream Parser
- [ ] Parses 100% of valid JSON lines
- [ ] Handles malformed JSON gracefully
- [ ] Zero data loss during streaming
- [ ] < 10ms parsing latency

### Integration
- [ ] Full conversation flow works
- [ ] Session resume works
- [ ] Title generation works
- [ ] No memory leaks
- [ ] No orphaned processes

## 🚨 Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| JSON parsing fails | High | Fallback to raw text |
| Child extraction complex | Medium | Alternative: store stdin separately |
| Event emission race | Low | Use async channels |
| Memory growth | Medium | Clear buffers after use |

## 📝 Implementation Order

1. **Stream Parser Core** (FIRST - everything depends on this)
2. **Message Types** (needed for parsing)
3. **Token Extraction** (critical for analytics)
4. **Process Integration** (connects everything)
5. **Event System** (frontend communication)
6. **Title Generation** (can be async)
7. **Integration Tests** (verify everything)

## 🎯 Definition of Day 2 Success

The day is successful when:
1. ✅ Stream parser handles all message types
2. ✅ Tokens accumulate correctly (+=)
3. ✅ Full spawn → stream → complete flow works
4. ✅ Session can be resumed
5. ✅ Title generation works
6. ✅ Integration test passes
7. ✅ No compilation errors
8. ✅ Memory stable

## 📚 Reference Implementation

Study these files from claudia:
- `/claudia/src-tauri/src/commands/claude.rs` - Lines 1157-1320 (stream handling)
- Message parsing logic
- Event emission patterns

## 💡 Key Insights from Day 1

1. **Immediate Registration** - Prevents orphans
2. **500ms Window** - Critical for session ID
3. **Drop Trait** - Automatic cleanup
4. **Argument Order** - Must be exact

## 🔄 Today's Workflow

```
1. Implement Stream Parser
   ↓
2. Define Message Types
   ↓
3. Extract Tokens
   ↓
4. Fix Process Management
   ↓
5. Connect Events
   ↓
6. Title Generation
   ↓
7. Integration Test
   ↓
8. Document Progress
```

## 📊 Time Allocation

- Stream Parser: 2 hours
- Process Integration: 2 hours
- Title Generation: 1 hour
- Testing: 2 hours
- Documentation: 1 hour

---

**Ready to begin Day 2 implementation!**