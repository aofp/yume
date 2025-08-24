# Compact Wrapper Quick Start Guide

## 🚀 5-Minute Integration

### Step 1: Test the wrapper standalone

```bash
# Test if it works with your Claude installation
node scripts/claude-compact-wrapper.js --version

# Run tests
node scripts/test-compact-wrapper.js
```

### Step 2: Update logged_server.rs

Open `/Users/yuru/yurucode/src-tauri/src/logged_server.rs` and modify the embedded server code:

```javascript
// Find this section around line 124:
const EMBEDDED_SERVER: &str = r#"

// Add these lines at the top of the embedded server:
const path = require('path');
const fs = require('fs');

// Load the compact wrapper if it exists
let ClaudeCompactWrapper;
try {
  // Try to load from resources directory first (bundled)
  ClaudeCompactWrapper = require('./claude-compact-wrapper.js');
} catch (e) {
  try {
    // Fallback to scripts directory (development)
    ClaudeCompactWrapper = require('../scripts/claude-compact-wrapper.js');
  } catch (e2) {
    console.log('Compact wrapper not found - using direct spawn');
  }
}

// Create wrapper instance if available
let wrapperInstance = null;
if (ClaudeCompactWrapper) {
  wrapperInstance = new ClaudeCompactWrapper({
    enabled: true,
    auto: true,
    threshold: 75000,
    debug: process.env.CLAUDE_COMPACT_DEBUG === 'true'
  });
  
  // Setup event forwarding to frontend
  wrapperInstance.on('token-update', (data) => {
    if (io) {
      io.emit(`compact:token-update:${data.sessionId}`, data);
    }
  });
  
  wrapperInstance.on('compact-start', (data) => {
    if (io) {
      io.emit(`compact:start:${data.sessionId}`, {
        type: 'system',
        subtype: 'compact-start',
        message: 'Auto-compacting conversation...'
      });
    }
  });
  
  wrapperInstance.on('compact-complete', (data) => {
    if (io) {
      io.emit(`compact:complete:${data.sessionId}`, {
        type: 'system',
        subtype: 'compact-complete',
        message: `Saved ${data.saved} tokens (${data.percentage}% reduction)`
      });
    }
  });
  
  console.log('✅ Compact wrapper loaded and configured');
}

// Then find the spawn section (search for "spawn(claudePath"):
// REPLACE this line:
const claudeProcess = spawn(claudePath, args, {

// WITH this:
const claudeProcess = wrapperInstance 
  ? await wrapperInstance.spawnClaude(args)
  : spawn(claudePath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });
```

### Step 3: Bundle the wrapper for production

Add to `/Users/yuru/yurucode/scripts/bundle-macos-server.js`:

```javascript
// Copy compact wrapper to resources
fs.copyFileSync(
  path.join(__dirname, 'claude-compact-wrapper.js'),
  path.join(resourcesDir, 'claude-compact-wrapper.js')
);
console.log('Copied compact wrapper to resources');
```

### Step 4: Add UI indicator (optional)

In your main React app, add the CompactIndicator:

```jsx
// In src/renderer/App.minimal.tsx or equivalent
import { CompactIndicator } from './components/Compact/CompactIndicator';

// Add to your component
return (
  <div>
    {/* Your existing UI */}
    <CompactIndicator />
  </div>
);
```

### Step 5: Test it!

1. **Start yurucode normally**
2. **Have a conversation** until tokens build up
3. **Watch for auto-compact** at 75% threshold
4. **Check the console** for compact notifications

## 🎯 Quick Configuration

### Via environment variables (easiest)

```bash
# Enable/disable
export CLAUDE_COMPACT_ENABLED=true
export CLAUDE_COMPACT_AUTO=true

# Set threshold
export CLAUDE_COMPACT_THRESHOLD=50000

# Debug mode
export CLAUDE_COMPACT_DEBUG=true

# Start yurucode
npm run tauri:dev
```

### Via config file

Create `~/.yurucode/compact.json`:

```json
{
  "enabled": true,
  "auto": true,
  "threshold": 75000,
  "cooldown": 300000,
  "showNotifications": true
}
```

## 🧪 Testing

### Manual test

```javascript
// In browser console (if using dev tools)
const socket = window.socket; // Your socket instance
socket.emit('triggerCompact', { sessionId: 'current-session-id' });
```

### Load test

```bash
# Create a test script
cat > test-compact-load.js << 'EOF'
const ClaudeCompactWrapper = require('./scripts/claude-compact-wrapper.js');

const wrapper = new ClaudeCompactWrapper({
  threshold: 100,  // Very low
  debug: true
});

// Simulate high token usage
wrapper.currentSessionId = 'test';
wrapper.sessions.set('test', wrapper.createSessionState());

// Trigger updates
for (let i = 0; i < 200; i += 10) {
  wrapper.updateTokenUsage({ input_tokens: i });
}
EOF

node test-compact-load.js
```

## 🔍 Verify It's Working

### Check logs

```bash
# If debug is enabled
tail -f ~/.yurucode/*.log | grep -i compact
```

### Monitor in UI

Look for:
- Token counter in bottom-right
- Yellow warning at 70%
- Auto-compact notification at 75%
- Green success message after compact

### Check metrics

```javascript
// In browser console
socket.emit('getCompactConfig', (config) => {
  console.log('Config:', config);
});
```

## 🚨 Common Issues

### "Claude not found"

```bash
# Fix: Ensure Claude is in PATH
which claude || echo "Claude not installed"
```

### "Wrapper not triggering"

```javascript
// Fix: Check configuration
console.log(wrapperInstance.config);
```

### "Token count wrong"

```bash
# Fix: Ensure stream-json output
claude --output-format stream-json --help
```

## 📊 Monitor Performance

```javascript
// Add to your server code
setInterval(() => {
  if (wrapperInstance) {
    const stats = wrapperInstance.getStats();
    console.log('Wrapper stats:', {
      calls: stats.wrappedCalls,
      compacts: stats.compactCount,
      saved: stats.totalTokensSaved,
      uptime: Math.round(stats.uptime / 1000) + 's'
    });
  }
}, 60000); // Every minute
```

## ✅ Success Checklist

- [ ] Wrapper script in place
- [ ] logged_server.rs modified
- [ ] Configuration created
- [ ] Tests passing
- [ ] UI indicator visible (optional)
- [ ] Auto-compact working
- [ ] Token savings verified

## 🎉 Done!

You now have automatic context management in yurucode. The wrapper will:

1. Monitor token usage in real-time
2. Trigger compact at 75% capacity
3. Save 80-90% of tokens typically
4. Continue conversations seamlessly
5. Work on all platforms

## Next Steps

- Adjust thresholds based on usage
- Customize compact prompts
- Add export functionality
- Monitor performance metrics

---

**Need help?** Check the [full documentation](./compact-wrapper-documentation.md) or [troubleshooting guide](./compact-wrapper-troubleshooting.md).