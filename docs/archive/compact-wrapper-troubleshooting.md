# Compact Wrapper Troubleshooting Guide

## Common Issues and Solutions

### Issue: Claude binary not found

**Symptoms:**
```
Error: Claude CLI not found. Please ensure Claude is installed.
```

**Solutions:**

1. **Verify Claude is installed:**
   ```bash
   which claude  # Unix/macOS
   where claude  # Windows
   ```

2. **Check installation path:**
   ```bash
   # macOS
   ls /opt/homebrew/bin/claude
   ls /usr/local/bin/claude
   
   # Windows
   dir "C:\Program Files\Claude\claude.exe"
   
   # Linux
   ls /usr/local/bin/claude
   ```

3. **Add Claude to PATH:**
   ```bash
   # Unix/macOS/Linux
   export PATH="/path/to/claude:$PATH"
   
   # Windows
   set PATH=C:\path\to\claude;%PATH%
   ```

4. **Specify path directly:**
   ```javascript
   wrapper.claudePath = '/custom/path/to/claude';
   ```

---

### Issue: Wrapper not triggering auto-compact

**Symptoms:**
- Token count exceeds threshold but no compact occurs
- No compact notifications appear

**Solutions:**

1. **Check if enabled:**
   ```javascript
   console.log(wrapper.config.enabled);  // Should be true
   console.log(wrapper.config.auto);     // Should be true
   ```

2. **Verify threshold:**
   ```javascript
   console.log(`Threshold: ${wrapper.config.threshold}`);
   console.log(`Current: ${session.tokenCount}`);
   ```

3. **Check cooldown:**
   ```javascript
   const timeSinceCompact = Date.now() - session.lastCompact;
   console.log(`Cooldown remaining: ${wrapper.config.cooldown - timeSinceCompact}ms`);
   ```

4. **Monitor events:**
   ```javascript
   wrapper.on('token-update', (data) => {
     console.log('Token update:', data);
   });
   ```

5. **Force trigger:**
   ```javascript
   await wrapper.triggerAutoCompact();
   ```

---

### Issue: Compact fails or times out

**Symptoms:**
```
Error: Compact timeout
Error: Compact failed with code 1
```

**Solutions:**

1. **Increase timeout:**
   ```javascript
   const wrapper = new ClaudeCompactWrapper({
     compactTimeout: 120000  // 2 minutes
   });
   ```

2. **Check Claude connectivity:**
   ```bash
   claude --version
   claude --help
   ```

3. **Verify session exists:**
   ```javascript
   console.log('Current session:', wrapper.currentSessionId);
   console.log('Session exists:', wrapper.sessions.has(wrapper.currentSessionId));
   ```

4. **Use different model:**
   ```javascript
   const wrapper = new ClaudeCompactWrapper({
     model: 'claude-3-haiku-20240307'  // Faster model
   });
   ```

---

### Issue: High memory usage

**Symptoms:**
- Process using excessive memory
- Memory keeps growing

**Solutions:**

1. **Disable logging:**
   ```javascript
   const wrapper = new ClaudeCompactWrapper({
     debug: false,
     logFile: null
   });
   ```

2. **Clear old sessions:**
   ```javascript
   // Periodically clear old sessions
   setInterval(() => {
     const now = Date.now();
     for (const [id, session] of wrapper.sessions) {
       if (now - session.metrics.created > 3600000) {  // 1 hour
         wrapper.sessions.delete(id);
       }
     }
   }, 600000);  // Every 10 minutes
   ```

3. **Limit session storage:**
   ```javascript
   if (wrapper.sessions.size > 100) {
     const oldest = [...wrapper.sessions.entries()]
       .sort((a, b) => a[1].metrics.created - b[1].metrics.created)[0];
     wrapper.sessions.delete(oldest[0]);
   }
   ```

---

### Issue: WSL path problems

**Symptoms:**
```
Error: ENOENT: no such file or directory
Invalid path format
```

**Solutions:**

1. **Check WSL detection:**
   ```javascript
   console.log('Is WSL:', wrapper.isWSL);
   ```

2. **Test path conversion:**
   ```javascript
   const winPath = 'C:\\Users\\test\\file.txt';
   const converted = wrapper.convertPath(winPath);
   console.log('Converted:', converted);  // Should be /mnt/c/Users/test/file.txt
   ```

3. **Use WSL Claude:**
   ```bash
   # Install Claude in WSL
   sudo apt install claude  # Or appropriate package manager
   ```

4. **Force Windows Claude from WSL:**
   ```javascript
   wrapper.claudePath = '/mnt/c/Program Files/Claude/claude.exe';
   ```

---

### Issue: Token count inaccurate

**Symptoms:**
- Displayed tokens don't match actual usage
- Compact triggers at wrong threshold

**Solutions:**

1. **Verify stream format:**
   ```javascript
   wrapper.on('stream-data', (data) => {
     if (data.usage) {
       console.log('Usage from Claude:', data.usage);
     }
   });
   ```

2. **Check parsing:**
   ```javascript
   const testLine = '{"type":"result","usage":{"input_tokens":1000}}';
   wrapper.processStreamLine(testLine);
   ```

3. **Reset token count:**
   ```javascript
   const session = wrapper.sessions.get(wrapper.currentSessionId);
   session.tokenCount = 0;
   ```

---

### Issue: Events not firing

**Symptoms:**
- UI not updating
- No notifications appearing

**Solutions:**

1. **Check event listeners:**
   ```javascript
   console.log('Listeners:', wrapper.eventNames());
   console.log('Token listeners:', wrapper.listenerCount('token-update'));
   ```

2. **Test event emission:**
   ```javascript
   wrapper.emit('test-event', { test: true });
   ```

3. **Verify session ID:**
   ```javascript
   wrapper.on('token-update', (data) => {
     console.log('Event session:', data.sessionId);
     console.log('Current session:', wrapper.currentSessionId);
   });
   ```

---

### Issue: Configuration not loading

**Symptoms:**
- Settings not taking effect
- Using default values unexpectedly

**Solutions:**

1. **Check config file location:**
   ```javascript
   const paths = [
     path.join(os.homedir(), '.yurucode', 'compact.json'),
     path.join(os.homedir(), '.claude-compact.json'),
     path.join(process.cwd(), 'compact.config.json')
   ];
   
   paths.forEach(p => {
     console.log(`${p}: ${fs.existsSync(p)}`);
   });
   ```

2. **Validate JSON:**
   ```bash
   cat ~/.yurucode/compact.json | jq .
   ```

3. **Check environment variables:**
   ```javascript
   console.log('Env vars:', {
     enabled: process.env.CLAUDE_COMPACT_ENABLED,
     auto: process.env.CLAUDE_COMPACT_AUTO,
     threshold: process.env.CLAUDE_COMPACT_THRESHOLD
   });
   ```

4. **Force configuration:**
   ```javascript
   const wrapper = new ClaudeCompactWrapper({
     enabled: true,
     auto: true,
     threshold: 75000
   });
   ```

---

### Issue: Performance problems

**Symptoms:**
- Slow response times
- High CPU usage
- Laggy interface

**Solutions:**

1. **Disable debug mode:**
   ```javascript
   const wrapper = new ClaudeCompactWrapper({
     debug: false,
     showNotifications: false
   });
   ```

2. **Reduce event frequency:**
   ```javascript
   let lastEmit = 0;
   wrapper.on('stream-data', (data) => {
     const now = Date.now();
     if (now - lastEmit > 100) {  // Throttle to 10Hz
       // Process event
       lastEmit = now;
     }
   });
   ```

3. **Profile performance:**
   ```javascript
   console.time('wrapper-init');
   const wrapper = new ClaudeCompactWrapper();
   console.timeEnd('wrapper-init');
   
   console.time('process-line');
   wrapper.processStreamLine(line);
   console.timeEnd('process-line');
   ```

---

## Debug Commands

### Check wrapper status

```javascript
// In console or debug script
const wrapper = getWrapper();  // Get your wrapper instance

// Basic info
console.log('Platform:', wrapper.platform);
console.log('Is WSL:', wrapper.isWSL);
console.log('Claude path:', wrapper.claudePath);

// Configuration
console.log('Config:', wrapper.config);

// Statistics
console.log('Stats:', wrapper.getStats());

// Sessions
console.log('Active sessions:', wrapper.sessions.size);
console.log('Current session:', wrapper.currentSessionId);

// Session details
if (wrapper.currentSessionId) {
  const session = wrapper.sessions.get(wrapper.currentSessionId);
  console.log('Session state:', session);
}
```

### Enable verbose logging

```javascript
// Temporary verbose mode
wrapper.config.debug = true;
wrapper.config.logLevel = 'debug';

// Log everything
wrapper.on('log', (entry) => {
  console.log(`[${entry.level}] ${entry.message}`, entry.data);
});

wrapper.on('stream-data', (data) => {
  console.log('Stream:', JSON.stringify(data));
});
```

### Test compact manually

```javascript
// Force compact for testing
async function testCompact() {
  const wrapper = getWrapper();
  
  // Set up test session
  wrapper.currentSessionId = 'test-session';
  wrapper.sessions.set('test-session', {
    tokenCount: 100000,  // High count
    lastCompact: 0,       // No cooldown
    isCompacting: false,
    compactAttempts: 0,
    messageQueue: [],
    metrics: {
      compactCount: 0,
      totalSaved: 0,
      created: Date.now()
    }
  });
  
  // Trigger
  await wrapper.triggerAutoCompact();
}

testCompact().catch(console.error);
```

---

## Error Codes

| Code | Meaning | Solution |
|------|---------|----------|
| CW001 | Claude binary not found | Install Claude or update PATH |
| CW002 | Token parsing failed | Check stream-json format |
| CW003 | Compact failed | Check Claude connectivity |
| CW004 | Session not found | Verify session ID |
| CW005 | Configuration invalid | Fix JSON syntax |
| CW006 | Timeout exceeded | Increase timeout value |
| CW007 | Max attempts reached | Reset attempt counter |
| CW008 | Cooldown active | Wait or reduce cooldown |

---

## Getting Help

If issues persist:

1. **Collect debug info:**
   ```bash
   node -e "
   const w = require('./claude-compact-wrapper');
   const wrapper = new w({ debug: true });
   console.log({
     platform: wrapper.platform,
     isWSL: wrapper.isWSL,
     nodeVersion: process.version,
     config: wrapper.config
   });
   "
   ```

2. **Run tests:**
   ```bash
   node scripts/test-compact-wrapper.js
   ```

3. **Create minimal reproduction:**
   ```javascript
   const ClaudeCompactWrapper = require('./claude-compact-wrapper');
   const wrapper = new ClaudeCompactWrapper({ debug: true });
   
   // Your failing code here
   wrapper.run(['--version']).catch(console.error);
   ```

4. **Check logs:**
   ```bash
   tail -f ~/.yurucode/compact.log  # If logging to file
   ```

5. **Report issue with:**
   - Platform and OS version
   - Node.js version
   - Claude version
   - Error messages
   - Debug output
   - Configuration used