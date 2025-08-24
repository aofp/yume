# Testing the Wrapper

## Current Status

The wrapper is now integrated directly into the stream processing:
1. ✅ Wrapper module imported
2. ✅ Wrapper initialized with always-on debug
3. ✅ `processLine` called for every line from Claude
4. ✅ Line augmented with wrapper data

## How It Works

```javascript
// In processStreamLine function:
const augmentedLine = claudeWrapper.processLine(line, sessionId);
if (augmentedLine && augmentedLine !== line) {
  line = augmentedLine;  // Use augmented version
}
```

## What Should Happen

When you restart the server and send messages, you should see:

### 1. Initialization
```
════════════════════════════════════════════════════════
🎯 UNIVERSAL CLAUDE WRAPPER INITIALIZED
🎯 Debug: ALWAYS ON
🎯 Token Tracking: ENABLED
🎯 API Capture: ENABLED
🎯 Compact Detection: ENABLED
════════════════════════════════════════════════════════
```

### 2. For Every API Response
```
✅ [WRAPPER] Created session: dc1913a9-8420-4f3a-ba31-e9be3fa5460f
📡 [WRAPPER] API system #1 { sessionId: "dc1913a9", type: "system", subtype: "init" }
📡 [WRAPPER] API assistant #2 { sessionId: "dc1913a9", type: "assistant" }
📊 [WRAPPER] TOKENS +78 → 78/100000 { input: 3, output: 78, total: 78, percent: "0%" }
📡 [WRAPPER] API user #3 { sessionId: "dc1913a9", type: "user" }
📡 [WRAPPER] API result #4 { sessionId: "dc1913a9", type: "result" }
```

### 3. For Compaction
```
🗜️ [WRAPPER] COMPACTION DETECTED! Saved 500 tokens
✅ Conversation compacted successfully!

📊 Compaction Summary:
• Tokens saved: 500
• Messages compressed: 10
• Tools used: 3
• Total saved so far: 500
📦 Tools: Bash (2x), Read (1x)
💬 Recent topics: test | echo | debug
📡 API calls: system: 1, user: 5, assistant: 5

✨ Context reset - you can continue normally.
```

### 4. Session End
```
════════════════════════════════════════════════════════
📊 SESSION STATS: dc1913a9-8420-4f3a-ba31-e9be3fa5460f
────────────────────────────────────────────────────────
Messages: 10
Tokens: 500 (0%)
API Calls: 12
Tool Calls: 3
Compactions: 1
Tokens Saved: 500
Errors: 0
════════════════════════════════════════════════════════
```

## Debugging

To check if wrapper is working:

1. **Check browser console**:
```javascript
// Get wrapper stats
socket.emit('wrapper:get-stats', null, console.log);

// Get API responses
socket.emit('wrapper:get-api-responses', sessionId, console.log);
```

2. **Check augmented data**:
Each JSON line should have a `wrapper` field:
```json
{
  "type": "assistant",
  "message": { ... },
  "wrapper": {
    "enabled": true,
    "session": { ... },
    "tokens": { ... },
    "compaction": { ... }
  }
}
```

## If Not Working

1. **No wrapper logs**: Check server restart happened
2. **No token counts**: `usage` field not being captured
3. **No compaction summary**: Detection logic issue
4. **Process exits early**: Stream processing interrupted

## Quick Test

1. Restart server: `npm run tauri:dev`
2. Send: `echo test`
3. Watch for wrapper logs
4. Send: `/compact`
5. Check for detailed summary (not empty result)