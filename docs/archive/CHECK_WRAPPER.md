# Checking if Wrapper is Working

## In Browser Console (F12)

Run these commands:

```javascript
// Check if wrapper is loaded
window.claudeWrapper

// If undefined, wrapper isn't loaded
// If object, wrapper is loaded

// Check for wrapper initialization message
// You should see:
// ════════════════════════════════
// 🎯 FRONTEND WRAPPER INITIALIZED
// ════════════════════════════════

// If wrapper is loaded, check sessions
claudeWrapper.getStats()

// Manual test - process a fake message
const testMessage = {
  type: 'result',
  result: '',
  usage: { input_tokens: 0, output_tokens: 0 }
};
const processed = window.claudeWrapper.processMessage(testMessage, 'test-session');
console.log('Processed:', processed);
// Should show compaction summary
```

## If Wrapper Not Loaded

1. **Force rebuild**: 
   ```bash
   # Stop the app
   # Delete build cache
   rm -rf node_modules/.vite
   rm -rf src-tauri/target/debug/deps/*tauri*
   
   # Restart
   npm run tauri:dev
   ```

2. **Check imports are working**:
   - Open DevTools
   - Go to Sources tab
   - Find `wrapperIntegration.ts`
   - Check if it's loaded

3. **Check for errors**:
   - Look for red errors in console
   - Especially module import errors

## Quick Test

If wrapper IS loaded but not logging, the issue might be that messages aren't being processed. Check:

1. Send "echo test" 
2. Look in console for:
   - `[TauriClient]` logs (these should exist)
   - `[WRAPPER]` logs (these are missing)

3. If no WRAPPER logs, check if processWrapperMessage is being called:
   - Open Sources tab
   - Find tauriClaudeClient.ts
   - Set breakpoint at line 298: `message = processWrapperMessage(message, sessionId);`
   - Send another message
   - See if breakpoint hits

## The Issue

Based on your logs showing NO wrapper output, either:
1. **Module not loaded** - wrapperIntegration.ts isn't being imported
2. **Function not called** - processWrapperMessage isn't executing
3. **Build cache** - Vite isn't rebuilding the changes

Most likely it's #3 - build cache issue.