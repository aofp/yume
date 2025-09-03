# Wrapper Test Instructions

## After Restarting the App

1. **Open DevTools** (F12 or Cmd+Option+I)
2. **Check Console Tab**

## What You Should See Immediately

When the app starts, you should see:
```
[WRAPPER] Module loaded, waiting for first message...
[TauriClient] Wrapper module imported, processWrapperMessage: function
```

## When You Send a Message

On the FIRST message you send, you'll see:
```
════════════════════════════════════════════════════════
🎯 FRONTEND WRAPPER ACTIVATED (first message)
🎯 Token tracking: ENABLED
🎯 Compaction detection: ENABLED
🎯 Debug logging: ENABLED
════════════════════════════════════════════════════════
🎯 Global claudeWrapper object available in console
```

Then for EVERY message:
```
[TauriClient] BEFORE wrapper: [message type] [session id]
📡 [WRAPPER] API [message type]
📊 [WRAPPER] TOKENS +X → Y/100000 (Z%)
[TauriClient] AFTER wrapper: [message type] has wrapper: true
```

## Testing Compaction

Send `/compact` and you should see:
```
🗜️ [WRAPPER] COMPACTION DETECTED! Saved X tokens
🗜️ [WRAPPER] Compaction complete
```

And the UI will show a helpful summary instead of empty result.

## Manual Testing in Console

After sending first message, you can test:
```javascript
// Check if wrapper is loaded
claudeWrapper

// Get current stats
claudeWrapper.getStats()

// Test processing
const test = { type: 'test', usage: { input_tokens: 10, output_tokens: 20 } };
claudeWrapper.processMessage(test, 'test-session');
```

## If Nothing Shows

If you don't see ANY of these logs:
1. Hard refresh the browser (Cmd+Shift+R)
2. Check for errors in console
3. Make sure you restarted with `npm run tauri:dev:mac`
4. Check that Vite rebuilt the files