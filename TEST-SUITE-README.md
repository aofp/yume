# yurucode Test Suite & Fixes

## Problem Fixed
When starting a second Claude session while the first was still streaming, the first session would timeout and stop receiving data. This has been **FIXED**.

## Key Fixes Applied to `server-claude-macos.js`

### 1. Process Isolation
- Changed `detached: false` → `detached: true` for better process group isolation
- Added `claudeProcess.unref()` for Unix systems
- Each process runs in its own process group

### 2. Queue-Based Spawning
- Added spawn queue to prevent race conditions
- Processes are spawned sequentially with delays
- 200-500ms delays between spawns to prevent Claude CLI conflicts

### 3. Enhanced Process Cleanup
- Use `process.kill(-pid, 'SIGINT')` to kill entire process groups
- Better cleanup on interrupts and errors
- Proper streaming state management

### 4. Environment Isolation
- Each session gets unique environment variables
- `CLAUDE_SESSION_ID` and `CLAUDE_INSTANCE` for isolation
- Prevents internal Claude CLI conflicts

## Test Suite Files

### 1. `test-suite-macos.sh`
Comprehensive test suite that checks all aspects of the app:
```bash
./test-suite-macos.sh
```

**Tests:**
- Server health check
- Multi-tab session creation
- Keyboard shortcuts
- Concurrent streaming
- Process isolation
- Memory management
- Session resume
- Title generation
- Error recovery
- Performance metrics

### 2. `demo-ui-macos.sh`
Interactive UI demo showcasing all features:
```bash
./demo-ui-macos.sh
```

**Demos:**
- Window & OLED theme
- Multi-tab sessions
- Concurrent streaming (FIXED!)
- Model selection
- Message features
- Session management
- Streaming control
- Analytics & tokens
- Window controls
- Error recovery

### 3. `test-concurrent.js`
Automated concurrent session test:
```bash
# First install socket.io-client if needed
npm install socket.io-client

# Run the test
node test-concurrent.js
```

**What it does:**
1. Creates 3 sessions
2. Sends messages to all simultaneously
3. Monitors for timeouts (>30s = bad)
4. Reports results

## How to Test the Fix

### Quick Test
1. Start the app normally
2. Open Tab 1 (Ctrl+T)
3. Send: "Write a long Python tutorial about decorators"
4. Immediately open Tab 2 (Ctrl+T)
5. Send: "Explain quantum computing"
6. **Both should stream without Tab 1 timing out!**

### Automated Test
```bash
# Terminal 1: Make sure server is running
npm run server:macos

# Terminal 2: Run concurrent test
node test-concurrent.js
```

### Manual Verification
Check server logs for:
- "📋 Added request to queue"
- "⏳ Waiting for previous Claude process"
- "🔄 Processing next spawn request"
- No "WARNING: No data received" messages

## If Issues Persist

1. **Restart the app completely** - Store changes require restart
2. **Check active processes:**
   ```bash
   pgrep -f claude
   ```
3. **Kill stuck processes:**
   ```bash
   pkill -f claude
   ```
4. **Check server logs:**
   ```bash
   npm run server:macos
   # Look for timeout warnings
   ```

## Performance Impact

The fixes add small delays (200-500ms) when spawning new Claude processes, but this ensures:
- No race conditions
- No session interference
- Reliable concurrent streaming
- Better error recovery

## Summary

✅ **Concurrent sessions now work properly!**
- Multiple tabs can stream simultaneously
- No more timeouts when switching tabs
- Better process isolation and cleanup
- Queue-based spawning prevents conflicts

The test suite provides comprehensive testing and demo capabilities for both development and showcase purposes.