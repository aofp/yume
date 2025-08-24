# Process Wrapper Quick Start

## Files Created
```
scripts/
├── claude-process-wrapper.cjs        # Main wrapper class
├── wrapper-integration-embedded.js   # Integration code
├── wrapper-bundle-embedded.cjs       # Ready-to-embed bundle
├── test-wrapper.cjs                  # Test suite (100% pass)
├── bundle-wrapper-for-embed.cjs      # Bundling script
├── WRAPPER_INTEGRATION.md           # Detailed integration guide
└── WRAPPER_QUICKSTART.md            # This file

docs/
└── PROCESS_WRAPPER_SOLUTION.md      # Complete documentation
```

## Quick Integration

### 1. Generate Bundle
```bash
node scripts/bundle-wrapper-for-embed.cjs
```

### 2. Test Wrapper
```bash
node scripts/test-wrapper.cjs
```

### 3. Integrate into logged_server.rs

Add at the beginning of EMBEDDED_SERVER (after line 150):
```javascript
// Load bundled wrapper
${cat scripts/wrapper-bundle-embedded.cjs}
```

Replace spawn logic (around line 450-500):
```javascript
let claudeProcess;
if (global.wrapperInstance) {
  claudeProcess = await global.wrapperInstance.spawnClaude(args, {
    sessionId: sessionId,
    cwd: workingDir,
    env: enhancedEnv
  });
} else {
  // Original spawn code as fallback
  claudeProcess = spawn(CLAUDE_PATH, args, spawnOptions);
}
```

### 4. Test Integration
```bash
WRAPPER_DEBUG=true npm run tauri:dev
```

Look for: "✅ Universal Claude Wrapper initialized"

## Key Features
- ✅ Captures ALL Claude API responses
- ✅ Works on macOS and Windows
- ✅ Real-time token tracking
- ✅ Automatic compaction detection
- ✅ Complete error handling
- ✅ Session state management

## Debug Commands

In browser console:
```javascript
// Check wrapper status
socket.emit('wrapper:get-stats', null, (r) => console.log(r));

// Get API responses
socket.emit('wrapper:get-api-responses', sessionId, (r) => console.log(r));

// Export session data
socket.emit('wrapper:export-session', sessionId, (r) => console.log(r));
```

## Support
- Check logs at `~/Library/Logs/yurucode/wrapper.log` (macOS)
- Enable debug: `WRAPPER_DEBUG=true`
- Run tests: `node scripts/test-wrapper.cjs`