# Universal Claude Wrapper - Testing Guide

## ✅ Integration Complete

The wrapper is now integrated into `server-claude-macos.js` with:
- **Always-on debug logging** (no env vars needed)
- **Complete API response capture**
- **Token tracking with accumulation**
- **Compaction detection with summaries**
- **Socket.IO endpoints for debugging**

## 🚀 How to Test

### 1. Restart the Server

```bash
# Kill any existing server
lsof -ti :32716 | xargs kill -9

# Restart yurucode
npm run tauri:dev
```

### 2. Look for Wrapper Initialization

You should see these logs in the terminal:

```
════════════════════════════════════════════════════════
🎯 UNIVERSAL CLAUDE WRAPPER INITIALIZED
🎯 Debug: ALWAYS ON
🎯 Token Tracking: ENABLED
🎯 API Capture: ENABLED
🎯 Compact Detection: ENABLED
════════════════════════════════════════════════════════
```

### 3. Send a Test Message

Send any message and watch for wrapper logs:

```
✅ [WRAPPER] Process wrapped for monitoring
✅ [WRAPPER] Created session: [sessionId]
📡 [WRAPPER] API system #1
📡 [WRAPPER] API user #2
📡 [WRAPPER] API assistant #3
📊 [WRAPPER] TOKENS +100 → 100/100000
```

### 4. Test Compaction

Send `/compact` command and watch for:

```
🗜️ [WRAPPER] COMPACTION DETECTED! Saved [X] tokens
🗜️ [WRAPPER] Compaction complete
```

You should see a summary message with:
- Tokens saved
- Messages compressed
- Tools used
- Summary of conversation

### 5. Check Wrapper Stats

Open browser console (F12) and run:

```javascript
// Get all wrapper stats
socket.emit('wrapper:get-stats', null, (r) => console.log(r));

// Get API responses for current session
socket.emit('wrapper:get-api-responses', sessionId, (r) => console.log(r));

// Get all sessions
socket.emit('wrapper:get-sessions', null, (r) => console.log(r));
```

## 📊 What You Should See

### Every API Call
```
📡 [WRAPPER] API [type] #[count] {
  sessionId: "xxx",
  type: "assistant",
  subtype: null
}
```

### Token Updates
```
📊 [WRAPPER] TOKENS +50 → 150/100000 {
  session: "xxx",
  input: 100,
  output: 50,
  cache: 0,
  total: 150,
  percent: "0%"
}
```

### Compaction
```
🗜️ [WRAPPER] COMPACTION DETECTED! Saved 5000 tokens
✅ Conversation compacted successfully!

📊 Compaction Summary:
• Tokens saved: 5,000
• Messages compressed: 20
• Tools used: 5
• Total saved so far: 5,000
📦 Tools: Bash (3x), Read (2x)
💬 Recent topics: implement feature | fix bug | test
📡 API calls: system: 1, user: 10, assistant: 10

✨ Context reset - you can continue normally.
```

### Session End
```
════════════════════════════════════════════════════════
📊 SESSION STATS: [sessionId]
────────────────────────────────────────────────────────
Messages: 20
Tokens: 5000 (5%)
API Calls: 22
Tool Calls: 5
Compactions: 1
Tokens Saved: 5000
Errors: 0
════════════════════════════════════════════════════════
```

## 🔍 Debugging

### If wrapper not working:

1. **Check import**: Make sure `import claudeWrapper from './wrapper-module.js';` is at top of server
2. **Check wrapping**: Make sure `claudeProcess = claudeWrapper.wrapProcess(claudeProcess, sessionId);` is after spawn
3. **Check logs**: Look for "UNIVERSAL CLAUDE WRAPPER INITIALIZED" at server start
4. **Check browser console**: Try `socket.emit('wrapper:get-stats', null, console.log)`

### Common Issues:

- **No wrapper logs**: Wrapper not imported or initialized
- **No token counts**: Usage field not being captured
- **No compaction summary**: Compaction detection not working
- **No API responses**: Process not wrapped correctly

## 📝 Features

The wrapper provides:

1. **Complete API Capture**
   - Every request/response logged
   - Stored in memory for debugging
   - Available via Socket.IO

2. **Token Tracking**
   - Input, output, cache tokens
   - Accumulation across messages
   - Reset on compaction

3. **Compaction Detection**
   - Automatic detection
   - Summary generation
   - Token savings tracking

4. **Session Statistics**
   - Message counts
   - Tool usage
   - Error tracking
   - Performance metrics

5. **Always-On Debug**
   - No environment variables needed
   - Clear, formatted logs
   - Color-coded by type

## 🎯 Success Indicators

You know the wrapper is working when:

1. ✅ See initialization logs at startup
2. ✅ See API response logs for every message
3. ✅ See token accumulation logs
4. ✅ See compaction summaries with details
5. ✅ Can query stats from browser console
6. ✅ Session stats shown at end

## 🚨 Important

- Wrapper is **ALWAYS ON** - no config needed
- All logs go to **console** - check terminal
- Stats available via **Socket.IO** - use browser console
- Compaction shows **detailed summary** - not empty result
- Tokens **accumulate** - watch the counts grow