# Critical Features Verification Checklist

## Purpose
Ensure 100% feature parity after migrating from embedded server to direct CLI spawning. Every feature that works now MUST work identically or better after migration.

## Current yurucode Features Inventory

### 1. Session Management ✅
**Current Implementation:** 
- Each tab has unique `claudeSessionId`
- Sessions stored in `claudeCodeStore.ts`
- Session resume via `--resume SESSION_ID` flag

**After Migration Requirements:**
- [ ] Session ID extraction within 500ms of spawn
- [ ] Session ID format validation (26 alphanumeric chars)
- [ ] Session persistence across app restarts
- [ ] Multi-tab session isolation
- [ ] Session cleanup on tab close

**Testing:**
```bash
# Test session creation
claude --prompt "test" --output-format stream-json --print
# Verify session ID in init message

# Test session resume
claude --resume [SESSION_ID] --prompt "continue" --output-format stream-json --print
# Verify context maintained
```

### 2. Context Management ✅
**Current Implementation:**
- Clear context via Ctrl+L
- Resets `claudeSessionId` and analytics
- Creates new session for clean slate

**After Migration Requirements:**
- [ ] Clear context creates new session
- [ ] Old session properly terminated
- [ ] Analytics reset to zero
- [ ] No orphaned processes
- [ ] Memory freed immediately

### 3. Streaming Output ✅
**Current Implementation:**
- Parse `--output-format stream-json`
- Real-time token display
- Thinking indicator during processing

**After Migration Requirements:**
- [ ] Line-by-line JSON parsing
- [ ] Handle incomplete JSON fragments
- [ ] Process `$` terminator
- [ ] Thinking indicator tied to `streaming` flag
- [ ] Smooth UI updates (<50ms latency)
- [ ] No data loss on fast streams

### 4. Token Analytics ✅
**Current Implementation:**
- Track input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens
- Accumulate with `+=` operator (NOT assignment)
- Display in status bar

**After Migration Requirements:**
- [ ] Extract token counts from stream
- [ ] Proper accumulation (`totalTokens += tokens`)
- [ ] Per-session tracking
- [ ] Survive session resume
- [ ] Reset on clear context
- [ ] Cache token differentiation

### 5. Model Selection ✅
**Current Implementation:**
- Toggle between Opus/Sonnet via Ctrl+O
- Pass `--model` flag to CLI
- Model persists per session

**After Migration Requirements:**
- [ ] Model flag in correct argument position
- [ ] Model selection survives session resume
- [ ] UI reflects current model
- [ ] Works with both new and resumed sessions

### 6. Title Generation ✅
**Current Implementation:**
- Separate Claude process with Sonnet
- First user message triggers title
- 50-char limit with ellipsis

**After Migration Requirements:**
- [ ] Spawn separate title process
- [ ] Use Sonnet-3.5 specifically
- [ ] Non-blocking (parallel to main chat)
- [ ] Handle title generation failures gracefully
- [ ] Update tab title in UI

**Title Generation Code Pattern:**
```rust
// Must spawn separate process for title
let title_prompt = format!("Generate a 50-char title for: {}", first_message);
spawn_claude_for_title(title_prompt, "claude-3-5-sonnet");
```

### 7. Draft Input & Attachments ✅
**Current Implementation:**
- Multi-line input with Shift+Enter
- File attachments support
- Draft persists during streaming

**After Migration Requirements:**
- [ ] Handle multi-line prompts
- [ ] Escape special characters properly
- [ ] Support file paths in prompt
- [ ] 8KB limit handling on Windows
- [ ] Use stdin for large prompts

### 8. Keyboard Shortcuts ✅
All shortcuts must continue working:

- [ ] Ctrl+T - New tab/session
- [ ] Ctrl+W - Close tab (kill process)
- [ ] Ctrl+Tab/Ctrl+Shift+Tab - Navigate tabs
- [ ] Ctrl+L - Clear context
- [ ] Ctrl+O - Toggle model
- [ ] Ctrl+R - Recent projects modal
- [ ] Ctrl+F - Search in messages
- [ ] Escape - Stop streaming (kill process)
- [ ] ? - Show help

### 9. Process Lifecycle ✅
**Current Implementation:**
- Spawn on message send
- Kill on tab close
- Kill on app exit

**After Migration Requirements:**
- [ ] Register process immediately after spawn
- [ ] Track by PID and session ID
- [ ] Kill with platform-specific commands
- [ ] Prevent orphaned processes
- [ ] Handle process crash recovery
- [ ] Clean up on unexpected exit

### 10. Error Handling ✅
**Current Implementation:**
- Socket.IO reconnection
- Health checks every 5 seconds
- Timeout handling

**After Migration Requirements:**
- [ ] Binary not found → Clear error message
- [ ] Permission denied → Suggest chmod +x
- [ ] Process crash → Auto-recovery
- [ ] Network errors → Retry logic
- [ ] Large output → Stream without accumulation
- [ ] Session corruption → Fallback to new

### 11. Platform Compatibility ✅

#### macOS Requirements:
- [ ] Binary detection (Homebrew, NVM, direct)
- [ ] `--dangerously-skip-permissions` flag
- [ ] SIGTERM → SIGKILL process termination
- [ ] Handle sandbox restrictions
- [ ] Support both Intel and Apple Silicon

#### Windows Requirements:
- [ ] Native binary detection
- [ ] WSL fallback with path translation
- [ ] taskkill /F for process termination
- [ ] 8KB command line limit handling
- [ ] CRLF → LF conversion

### 12. Performance Targets ✅
**Must achieve after migration:**

- [ ] Memory usage: Constant 250-300MB (currently 400MB-4GB)
- [ ] CPU usage: <15% during streaming (currently 25-40%)
- [ ] Response latency: <50ms (currently 500ms)
- [ ] Startup time: <2 seconds (currently 3-5 seconds)
- [ ] No memory leaks after 24 hours
- [ ] Handle 100+ concurrent sessions

### 13. Recent Projects ✅
**Current Implementation:**
- List projects from `~/.claude/projects/`
- Decode project paths
- Show in modal with Ctrl+R

**After Migration Requirements:**
- [ ] Parse encoded project directories
- [ ] List available sessions per project
- [ ] Sort by most recent
- [ ] Handle corrupted project files
- [ ] Quick open with number keys (1-9)

### 14. Search Functionality ✅
**Current Implementation:**
- Ctrl+F opens search
- Highlights matches in messages
- Navigate with Enter/Shift+Enter

**After Migration Requirements:**
- [ ] Search works during streaming
- [ ] Highlight updates dynamically
- [ ] Case-insensitive search
- [ ] Search across all messages
- [ ] Maintain scroll position

### 15. Copy/Paste Support ✅
**Current Implementation:**
- Right-click context menu
- Copy message content
- Copy code blocks

**After Migration Requirements:**
- [ ] Copy works during streaming
- [ ] Preserve formatting
- [ ] Copy partial selections
- [ ] Code block detection
- [ ] Platform-specific clipboard API

## Feature Testing Matrix

| Feature | macOS | Windows | WSL | Priority |
|---------|-------|---------|-----|----------|
| Basic messaging | 🔴 | 🔴 | 🔴 | P0 |
| Session resume | 🔴 | 🔴 | 🔴 | P0 |
| Streaming output | 🔴 | 🔴 | 🔴 | P0 |
| Process cleanup | 🔴 | 🔴 | 🔴 | P0 |
| Token tracking | 🔴 | 🔴 | 🔴 | P1 |
| Title generation | 🔴 | 🔴 | 🔴 | P1 |
| Model selection | 🔴 | 🔴 | 🔴 | P1 |
| Clear context | 🔴 | 🔴 | 🔴 | P1 |
| Keyboard shortcuts | 🔴 | 🔴 | 🔴 | P2 |
| Recent projects | 🔴 | 🔴 | 🔴 | P2 |
| Search | 🔴 | 🔴 | 🔴 | P2 |
| Copy/paste | 🔴 | 🔴 | 🔴 | P2 |

**Legend:** 🔴 Not tested | 🟡 Partially working | 🟢 Fully working

## Regression Testing Checklist

### Before Each Release:

**Basic Flow:**
- [ ] Send simple message
- [ ] Send multi-line message
- [ ] Send message with code
- [ ] Stop streaming mid-response
- [ ] Clear context and continue

**Session Management:**
- [ ] Create new session
- [ ] Resume existing session
- [ ] Switch between tabs
- [ ] Close tab during streaming
- [ ] Reopen closed session

**Edge Cases:**
- [ ] 5-minute task completion
- [ ] 30-minute task completion
- [ ] 2-hour task completion
- [ ] 10MB output handling
- [ ] 100MB output handling
- [ ] Rapid message sending
- [ ] Network interruption recovery

**Platform Specific:**
- [ ] macOS: NVM installation works
- [ ] macOS: Homebrew installation works
- [ ] Windows: Native installation works
- [ ] Windows: WSL fallback works
- [ ] Windows: 8KB prompt limit handling

## Implementation Validation

### Phase 1: Core Functionality (Week 1-2)
```rust
// These MUST work before anything else
✅ Binary detection
✅ Process spawning with --print
✅ Session ID extraction
✅ Basic streaming
✅ Process termination
```

### Phase 2: Feature Parity (Week 3-4)
```rust
// Match current yurucode features
✅ Session resume
✅ Token tracking
✅ Title generation
✅ Model selection
✅ Clear context
```

### Phase 3: Platform Testing (Week 5-6)
```rust
// Ensure works on all platforms
✅ macOS Intel
✅ macOS Apple Silicon
✅ Windows 10/11 Native
✅ Windows WSL 1
✅ Windows WSL 2
```

### Phase 4: Performance (Week 7-8)
```rust
// Meet or exceed targets
✅ Memory < 300MB constant
✅ CPU < 15% streaming
✅ Latency < 50ms
✅ No freezes on long tasks
✅ No data loss ever
```

## Final Verification

**DO NOT SHIP UNTIL ALL ITEMS ARE ✅:**

- [ ] All P0 features working on all platforms
- [ ] All P1 features working on all platforms  
- [ ] Zero freezes on any duration task
- [ ] Memory usage stable at 250-300MB
- [ ] All processes cleaned up properly
- [ ] User testing confirms feature parity
- [ ] No regressions from current version
- [ ] Documentation updated
- [ ] Release notes prepared

## Critical Success Criteria

The migration is ONLY successful if:

1. **Every feature that works now continues to work**
2. **The freeze bug is completely eliminated**
3. **Memory usage is constant, not growing**
4. **Works identically on macOS and Windows**
5. **Users notice only improvements, no regressions**

Remember: We're not just fixing bugs - we're ensuring yurucode becomes the most reliable Claude UI available. Every detail matters.