# Complete Implementation Checklist - Every Detail for Perfect Claude Integration

## Pre-Implementation Verification

### ✅ Understanding Current Architecture
- [ ] Read yurucode's embedded server (3,500 lines in `logged_server.rs`)
- [ ] Understand why embedded server causes freezes
- [ ] Map all Socket.IO events and handlers
- [ ] Document current message flow
- [ ] Identify all timeout locations (2-hour, 30-second, 5-second)
- [ ] Find all buffer limits (50MB max)
- [ ] List all synchronous operations that block

### ✅ Understanding Target Architecture (Claudia)
- [ ] Study ProcessRegistry implementation
- [ ] Understand session ID extraction pattern
- [ ] Map Tauri command structure
- [ ] Document streaming approach
- [ ] Analyze error handling patterns
- [ ] Review platform-specific code

## Phase 1: Core Process Management

### ✅ Binary Detection
- [ ] Implement `find_claude_binary()` for all platforms
- [ ] Check environment variable `CLAUDE_PATH` first
- [ ] Try `which claude` command
- [ ] Check user home directory (`~/.local/bin/claude`)
- [ ] Check system locations (`/usr/local/bin/claude`)
- [ ] macOS: Check `/opt/homebrew/bin/claude`
- [ ] Windows: Check `%LOCALAPPDATA%\Claude\claude.exe`
- [ ] Windows: Check `C:\Program Files\Claude\claude.exe`
- [ ] WSL: Dynamic user detection with `whoami`
- [ ] WSL: Check `/home/$USER/.claude/local/node_modules/.bin/claude`
- [ ] Implement fallback error messages with installation instructions

### ✅ Process Spawning
- [ ] Use `tokio::process::Command` not `std::process::Command`
- [ ] Set `stdout(Stdio::piped())`
- [ ] Set `stderr(Stdio::piped())`
- [ ] Set `stdin(Stdio::piped())` if using stdin
- [ ] Set `kill_on_drop(true)` for cleanup
- [ ] Set `current_dir()` to project path
- [ ] Handle spawn errors (ENOENT, EACCES, EAGAIN)

### ✅ Argument Ordering (CRITICAL!)
```rust
// MUST be in this exact order:
1. --resume SESSION_ID      (if resuming)
2. --prompt "text"          (or use stdin)
3. --model MODEL_NAME       (optional)
4. --output-format stream-json
5. --verbose
6. --print                  (NEVER REMOVE!)
7. --dangerously-skip-permissions (macOS only)
8. --append-system-prompt "text" (optional)
```

### ✅ Session ID Extraction
- [ ] Read from stdout immediately after spawn
- [ ] Use 500ms timeout for extraction
- [ ] Look for `"type":"system"` and `"subtype":"init"`
- [ ] Extract `session_id` field (26 alphanumeric chars)
- [ ] Validate format: `/^[a-zA-Z0-9]{26}$/`
- [ ] Generate synthetic ID if extraction fails
- [ ] Register in ProcessRegistry immediately

## Phase 2: ProcessRegistry Implementation

### ✅ Core Registry
- [ ] Create `HashMap<i64, ProcessHandle>` for tracking
- [ ] Implement auto-incrementing run_id
- [ ] Map session_id to run_id
- [ ] Map PID to run_id (for orphan detection)
- [ ] Store process start time (for PID reuse detection)
- [ ] Implement `Arc<Mutex<>>` for thread safety

### ✅ Process Registration
- [ ] Register BEFORE reading stdout
- [ ] Use temporary ID before session_id known
- [ ] Update with real session_id after extraction
- [ ] Check for PID conflicts
- [ ] Kill existing process if PID reused

### ✅ Process Cleanup
- [ ] Implement Drop trait for automatic cleanup
- [ ] Try SIGTERM first (graceful)
- [ ] Wait 2 seconds for termination
- [ ] Send SIGKILL if still running
- [ ] Platform-specific kill commands
- [ ] Reap zombie processes periodically
- [ ] Clean up on app shutdown

## Phase 3: Stream Parsing

### ✅ Buffer Management
- [ ] Use `BufReader` with 8KB buffer
- [ ] Process line-by-line, never accumulate
- [ ] Clear buffer after each line
- [ ] Handle incomplete JSON across reads
- [ ] Track JSON depth for object boundaries
- [ ] Handle `$` terminator in stream
- [ ] Implement max line length (1MB)

### ✅ JSON Parsing
- [ ] Parse each complete line as JSON
- [ ] Handle fragmented JSON objects
- [ ] Extract message type field
- [ ] Extract content for display
- [ ] Extract token usage for analytics
- [ ] Handle tool use messages
- [ ] Recover from parse errors

### ✅ Backpressure
- [ ] Use bounded channels (capacity 100)
- [ ] Implement async send with await
- [ ] Monitor channel capacity
- [ ] Slow down reading if channel full
- [ ] Drop old messages if overwhelmed

## Phase 4: Error Handling

### ✅ Spawn Errors
- [ ] Binary not found → Search fallback paths
- [ ] Permission denied → Try chmod +x
- [ ] Resource exhaustion → Exponential backoff
- [ ] Working directory invalid → Use home directory

### ✅ Stream Errors
- [ ] Broken pipe → Process died, clean up
- [ ] Invalid UTF-8 → Use lossy conversion
- [ ] Buffer overflow → Clear and continue
- [ ] JSON parse error → Skip line, continue

### ✅ Process Errors
- [ ] Won't die → Force kill with SIGKILL
- [ ] Zombie process → Reap with waitpid
- [ ] Orphaned process → Kill by PID
- [ ] Memory leak → Monitor and restart

## Phase 5: Platform-Specific Implementation

### ✅ macOS
- [ ] Add `--dangerously-skip-permissions` flag
- [ ] Handle sandbox restrictions
- [ ] Check `/opt/homebrew/bin` for M1 Macs
- [ ] Use `libc::kill()` for process termination
- [ ] Handle .DS_Store in session directories

### ✅ Windows Native
- [ ] Check `%LOCALAPPDATA%\Claude\claude.exe`
- [ ] Use `taskkill /F /PID` for termination
- [ ] Add `windowsHide: true` to prevent console
- [ ] Handle 8KB command line limit
- [ ] Convert paths with backslashes

### ✅ Windows WSL
- [ ] Detect WSL version (1 vs 2)
- [ ] Translate paths (`C:\` → `/mnt/c/`)
- [ ] Dynamic user detection with `whoami`
- [ ] Handle line ending conversion (CRLF → LF)
- [ ] Check antivirus blocking

### ✅ Linux
- [ ] Check distro-specific paths
- [ ] Handle different init systems
- [ ] Use process groups for cleanup
- [ ] Check SELinux/AppArmor restrictions

## Phase 6: Session Management

### ✅ Session Files
- [ ] Locate `~/.claude/projects/` directory
- [ ] Parse encoded project paths
- [ ] Read JSONL session files
- [ ] Extract project path from first line
- [ ] Handle file locking with flock
- [ ] Implement session file cleanup

### ✅ Session Resume
- [ ] Pass `--resume SESSION_ID` as FIRST argument
- [ ] Verify session file exists
- [ ] Check session not locked
- [ ] Handle corrupted session files
- [ ] Fallback to new session if resume fails

## Phase 7: Frontend Migration

### ✅ Remove Socket.IO
- [ ] Uninstall socket.io-client package
- [ ] Remove all socket imports
- [ ] Remove socket event listeners
- [ ] Remove reconnection logic
- [ ] Remove health check timers

### ✅ Implement Tauri Events
- [ ] Import `invoke` and `listen` from @tauri-apps/api
- [ ] Create Tauri commands for Claude operations
- [ ] Set up event listeners for streaming
- [ ] Handle command errors with try/catch
- [ ] Implement cleanup on unmount

### ✅ Update Store
- [ ] Remove socket references
- [ ] Add Tauri command calls
- [ ] Update streaming state management
- [ ] Fix token accumulation (use `+=` not `=`)
- [ ] Handle session switching

## Phase 8: Testing

### ✅ Unit Tests
- [ ] Test binary detection on all platforms
- [ ] Test argument ordering
- [ ] Test session ID extraction
- [ ] Test JSON parsing with fragments
- [ ] Test process cleanup
- [ ] Test error recovery

### ✅ Integration Tests
- [ ] Test 5-minute task completion
- [ ] Test 30-minute task completion
- [ ] Test 2-hour task completion
- [ ] Test session resume
- [ ] Test concurrent sessions
- [ ] Test memory stability

### ✅ Platform Tests
- [ ] Test on macOS (Intel and M1)
- [ ] Test on Windows 10/11
- [ ] Test on WSL 1 and WSL 2
- [ ] Test on Ubuntu/Debian
- [ ] Test on Fedora/RHEL

### ✅ Stress Tests
- [ ] Run 10 concurrent sessions
- [ ] Generate 1GB of output
- [ ] Run for 24 hours continuously
- [ ] Kill processes randomly
- [ ] Simulate network interruptions

## Phase 9: Performance Verification

### ✅ Memory
- [ ] Verify constant memory usage (< 300MB)
- [ ] No growth over time
- [ ] Proper buffer cleanup
- [ ] No leaked processes

### ✅ CPU
- [ ] < 15% CPU during streaming
- [ ] No spinning loops
- [ ] Proper async/await usage
- [ ] Efficient JSON parsing

### ✅ Latency
- [ ] < 50ms message processing
- [ ] < 100ms session start
- [ ] < 25ms per streamed message
- [ ] Instant process termination

## Phase 10: Documentation

### ✅ Code Documentation
- [ ] Document all public functions
- [ ] Add inline comments for complex logic
- [ ] Create architecture diagrams
- [ ] Document error codes

### ✅ User Documentation
- [ ] Installation guide
- [ ] Troubleshooting guide
- [ ] Platform-specific notes
- [ ] Migration guide from old version

## Critical Reminders

### 🚨 NEVER FORGET
1. **NEVER remove `--print` flag** - Claude will hang
2. **ALWAYS register process immediately** - Before any async ops
3. **--resume MUST be first argument** - Or it's ignored
4. **Session ID is only in init message** - Extract within 500ms
5. **Always use ProcessRegistry** - Never manage processes directly
6. **Stream, don't accumulate** - Or memory explodes
7. **Handle all error cases** - Claude fails silently
8. **Test on all platforms** - Behavior varies significantly

### 🐛 Common Bugs to Avoid
1. **Wrong argument order** → Silent failures
2. **Missing `--print`** → Hangs forever
3. **Not registering process** → Orphans on crash
4. **Accumulating buffers** → Memory exhaustion
5. **Synchronous operations** → UI freezes
6. **Ignoring backpressure** → Data loss
7. **Not handling WSL paths** → Windows failures
8. **Forgetting Drop trait** → Process leaks

## Success Metrics

After implementation, these MUST all be true:
- [ ] Zero freezes on tasks of any duration
- [ ] Memory usage stays under 300MB
- [ ] All processes cleaned up on exit
- [ ] Session resume works reliably
- [ ] No data loss ever
- [ ] Works on all platforms
- [ ] Response time < 50ms
- [ ] 100% task completion rate

## Final Verification

### Before Release
- [ ] Run 24-hour stress test
- [ ] Test with 100+ sessions
- [ ] Verify no memory leaks
- [ ] Check all processes terminate
- [ ] Confirm no orphaned files
- [ ] Test crash recovery
- [ ] Verify platform compatibility
- [ ] Document all known issues

### Sign-off Checklist
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Memory usage acceptable
- [ ] Performance targets met
- [ ] Documentation complete
- [ ] Code reviewed
- [ ] Platform testing complete
- [ ] Ready for production

---

## Implementation Order

1. **Start with ProcessRegistry** - Core of everything
2. **Implement spawn_claude_process** - With proper arg order
3. **Add session ID extraction** - Critical for tracking
4. **Build stream parser** - For output handling
5. **Add error handling** - For all edge cases
6. **Platform-specific code** - Handle differences
7. **Frontend migration** - Socket.IO to Tauri
8. **Testing suite** - Verify everything works
9. **Performance optimization** - Fine-tune
10. **Documentation** - Complete the picture

**Estimated Time: 8-12 weeks for complete, tested implementation**

---

*This checklist represents EVERY critical detail learned from analyzing both yurucode and claudia. Missing any item risks bugs, freezes, or data loss.*