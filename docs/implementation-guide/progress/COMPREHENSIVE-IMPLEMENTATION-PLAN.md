# Comprehensive Implementation Plan - yurucode Direct CLI Spawning Migration

## 🎯 Project Goal
Migrate yurucode from embedded Node.js server architecture to direct Rust-based CLI spawning, eliminating the freeze bug and improving performance.

## 📊 Current Status (Day 1 Progress)

### ✅ Completed Components
1. **ProcessRegistry** - Full implementation with Drop trait for cleanup
2. **Binary Detection** - Complete Claude binary discovery system
3. **Progress Tracking** - Comprehensive documentation structure

### 🔄 In Progress
- Session Management implementation
- CLI Spawning mechanics

### 📝 Pending
- Stream Parser
- Title Generation
- Frontend migration (Socket.IO → Tauri Events)
- Integration testing

## 🏗️ Architecture Overview

### Current (BROKEN)
```
User → React → Socket.IO → Node.js Server → Claude CLI
         ↑                      ↓
         └──────────────────────┘
Problems: 2-hour timeout, memory leaks, process orphans
```

### Target (FIXED)
```
User → React → Tauri Events → Rust → Claude CLI
         ↑                       ↓
         └───────────────────────┘
Benefits: No timeouts, direct control, immediate cleanup
```

## 📋 Implementation Phases

### Phase 1: Backend Foundation (Days 1-5) 
#### Day 1 ✅
- [x] ProcessRegistry with Drop trait
- [x] Binary detection system
- [x] Module structure setup

#### Day 2 (Session Management)
- [ ] Session ID extraction (500ms window)
- [ ] Session validation (26 chars)
- [ ] Session file management
- [ ] Resume capability

#### Day 3 (CLI Spawning)
- [ ] Direct spawn implementation
- [ ] Argument ordering (CRITICAL)
- [ ] --print flag handling
- [ ] Process registration timing

#### Day 4 (Stream Parser)
- [ ] Line-by-line JSON parsing
- [ ] Message type extraction
- [ ] Token accumulation
- [ ] Error handling

#### Day 5 (Title Generation)
- [ ] Separate Sonnet process
- [ ] Async title extraction
- [ ] 50-char limit handling
- [ ] Fallback mechanisms

### Phase 2: Frontend Migration (Days 6-8)
#### Day 6 (Remove Socket.IO)
- [ ] Remove socket.io-client dependency
- [ ] Delete all socket handlers
- [ ] Remove reconnection logic
- [ ] Clean up port management

#### Day 7 (Add Tauri Events)
- [ ] Import Tauri API
- [ ] Create command handlers
- [ ] Set up event listeners
- [ ] Session-specific events

#### Day 8 (Store Updates)
- [ ] Remove readOnly flag
- [ ] Fix token accumulation (+=)
- [ ] Update streaming state
- [ ] Session management fixes

### Phase 3: Testing & Verification (Days 9-14)
#### Day 9-10 (Integration Testing)
- [ ] 5-minute task test (10x)
- [ ] 30-minute task test (5x)
- [ ] 2-hour task test (3x)
- [ ] Memory monitoring (<300MB)

#### Day 11-12 (Platform Testing)
- [ ] macOS (Intel + Apple Silicon)
- [ ] Windows 10/11
- [ ] WSL integration
- [ ] Binary detection on all platforms

#### Day 13-14 (Final Verification)
- [ ] All features working
- [ ] No performance regression
- [ ] Documentation complete
- [ ] Release ready

## 🔧 Critical Implementation Details

### 1. Session ID Extraction Pattern
```rust
// MUST extract within 500ms
timeout(Duration::from_millis(500), async {
    // Parse: {"type":"system","subtype":"init","session_id":"..."}
    if msg["type"] == "system" && msg["subtype"] == "init" {
        if let Some(session_id) = msg["session_id"].as_str() {
            // IMMEDIATE registration
            registry.register_claude_session(session_id, ...);
        }
    }
}).await
```

### 2. Argument Order (EXACT)
```bash
claude \
  --resume SESSION_ID \       # 1. Resume FIRST (if resuming)
  --prompt "text" \          # 2. Prompt
  --model MODEL \            # 3. Model
  --output-format stream-json \ # 4. Format
  --print                    # 5. CRITICAL - always last
```

### 3. Process Registration Timing
```rust
// CORRECT - Always registered
let mut child = spawn_claude()?;
let pid = child.id().unwrap_or(0);
registry.register_claude_process(..., child); // IMMEDIATELY!
let session_id = extract_from_output().await?;
```

### 4. Token Accumulation Fix
```typescript
// ALWAYS use +=
session.analytics.tokens.input += update.input;
session.analytics.tokens.output += update.output;
// NEVER use =
```

### 5. Event Names Convention
```typescript
// Session-specific events
`claude-output:${sessionId}`
`claude-error:${sessionId}`
`claude-complete:${sessionId}`
`claude-tokens:${sessionId}`
```

## 🚨 Known Risks & Mitigations

### Risk 1: Session ID Extraction Failure
**Impact**: Session lost, can't resume
**Mitigation**: Generate synthetic ID as fallback

### Risk 2: Process Orphaning
**Impact**: Memory leaks, zombie processes
**Mitigation**: Drop trait + immediate registration

### Risk 3: Platform Differences
**Impact**: Works on one OS, fails on another
**Mitigation**: Extensive platform-specific testing

### Risk 4: Large Output Handling
**Impact**: Memory overflow, UI freeze
**Mitigation**: Stream processing, buffer limits

## 📊 Success Metrics

### Performance Targets
- Memory: <300MB constant (currently 400MB-4GB)
- CPU: <15% during streaming (currently 25-40%)
- Latency: <50ms response (currently 500ms)
- Success Rate: 100% for all task durations

### Feature Parity Checklist
- [ ] Session management (create, resume, clear)
- [ ] Streaming output with thinking indicator
- [ ] Token analytics with accumulation
- [ ] Model selection (Opus/Sonnet)
- [ ] Title generation (50 chars)
- [ ] Draft input with attachments
- [ ] All keyboard shortcuts
- [ ] Process lifecycle management
- [ ] Error handling and recovery
- [ ] Recent projects browser
- [ ] Search functionality

## 🔄 Next Steps (Immediate)

### Today (Day 1 Completion)
1. ✅ ProcessRegistry implementation
2. ✅ Binary detection
3. ⏳ Begin Session Management planning
4. ⏳ Create integration test framework

### Tomorrow (Day 2)
1. Implement session ID extraction
2. Add session validation
3. Create session file helpers
4. Test session resume

### This Week
1. Complete backend foundation
2. Begin frontend migration
3. Create integration tests
4. Document all changes

## 📝 Testing Strategy

### Unit Tests
- ProcessRegistry operations
- Binary detection on all platforms
- Session ID extraction
- Stream parser accuracy

### Integration Tests
```rust
#[test]
async fn test_full_conversation_flow() {
    // 1. Spawn Claude
    // 2. Extract session ID
    // 3. Send message
    // 4. Receive response
    // 5. Check tokens
    // 6. Resume session
    // 7. Clean shutdown
}
```

### Performance Tests
```rust
#[test]
async fn test_2_hour_task() {
    // Run task for 2 hours
    // Monitor memory (must stay <300MB)
    // Check no timeouts
    // Verify completion
}
```

## 🎯 Definition of Success

The migration is complete when:
1. ✅ All tests pass 100% of the time
2. ✅ No freezes on any task duration
3. ✅ Memory stays under 300MB
4. ✅ No orphaned processes
5. ✅ Sessions fully resumable
6. ✅ Works on all platforms
7. ✅ No feature regressions
8. ✅ Performance improved

## 📚 Reference Documentation

### Critical Docs
- [claudia ProcessRegistry](../../../claudia/src-tauri/src/process/registry.rs)
- [claudia Binary Detection](../../../claudia/src-tauri/src/claude_binary.rs)
- [claudia Claude Commands](../../../claudia/src-tauri/src/commands/claude.rs)

### Implementation Guides
- [Ultimate Migration Checklist](../ULTIMATE-MIGRATION-CHECKLIST.md)
- [Critical Features Verification](../CRITICAL-FEATURES-VERIFICATION.md)
- [Session Extraction Analytics](../SESSION-EXTRACTION-ANALYTICS.md)

---

**Status**: Day 1 Complete - ProcessRegistry & Binary Detection implemented
**Next**: Session Management implementation
**Confidence**: HIGH - Following proven claudia patterns