# Yurucode Complete Troubleshooting Guide

**Version:** 0.1.0
**Last Updated:** January 9, 2026
**Platforms:** macOS, Windows, Linux

## Table of Contents

1. [Installation Issues](#1-installation-issues)
2. [Startup Problems](#2-startup-problems)
3. [Claude CLI Issues](#3-claude-cli-issues)
4. [Session Management Problems](#4-session-management-problems)
5. [Performance Issues](#5-performance-issues)
6. [UI/Display Problems](#6-uidisplay-problems)
7. [Network & Connection Issues](#7-network--connection-issues)
8. [Database & Storage Issues](#8-database--storage-issues)
9. [Memory & Resource Issues](#9-memory--resource-issues)
10. [Platform-Specific Issues](#10-platform-specific-issues)
11. [Advanced Debugging](#11-advanced-debugging)
12. [Error Codes Reference](#12-error-codes-reference)

---

## 1. Installation Issues

### 1.1 macOS Installation Problems

#### Issue: "Yurucode.app is damaged and can't be opened"

**Cause**: macOS Gatekeeper quarantine flag

**Solutions**:
```bash
# Solution 1: Remove quarantine attribute
xattr -cr /Applications/Yurucode.app

# Solution 2: Clear quarantine via terminal
sudo xattr -rd com.apple.quarantine /Applications/Yurucode.app

# Solution 3: Allow in System Preferences
System Preferences > Security & Privacy > General > "Open Anyway"
```

**Prevention**: Sign and notarize the app properly

#### Issue: "The application 'Yurucode' can't be opened"

**Cause**: Wrong architecture (Intel vs Apple Silicon)

**Diagnosis**:
```bash
# Check your Mac architecture
uname -m  # arm64 = Apple Silicon, x86_64 = Intel

# Check app architecture
file /Applications/Yurucode.app/Contents/MacOS/Yurucode
```

**Solution**: Download the universal binary or correct architecture version

#### Issue: Missing dependencies on macOS

**Symptoms**: App crashes immediately after launch

**Check dependencies**:
```bash
# List dynamic libraries
otool -L /Applications/Yurucode.app/Contents/MacOS/Yurucode

# Check for missing libraries
for lib in $(otool -L /Applications/Yurucode.app/Contents/MacOS/Yurucode | grep -v "/usr/lib" | awk '{print $1}'); do
  if [ ! -f "$lib" ]; then
    echo "Missing: $lib"
  fi
done
```

### 1.2 Windows Installation Problems

#### Issue: Windows Defender SmartScreen blocks installation

**Solution 1**: Run anyway
1. Click "More info"
2. Click "Run anyway"

**Solution 2**: Unblock file
```powershell
# Unblock the installer
Unblock-File -Path .\yurucode-installer.msi

# Or via Properties
# Right-click > Properties > Unblock
```

**Solution 3**: Temporarily disable SmartScreen
```powershell
# Run as Administrator
Set-ItemProperty -Path HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer -Name SmartScreenEnabled -Value "Off"
# Remember to re-enable after installation!
```

#### Issue: Missing Visual C++ Redistributables

**Symptoms**: Error about missing VCRUNTIME140.dll

**Solution**:
```powershell
# Download and install Visual C++ Redistributables
# https://aka.ms/vs/17/release/vc_redist.x64.exe

# Or use winget
winget install Microsoft.VCRedist.2015+.x64
```

#### Issue: Installation fails with error 2503/2502

**Cause**: Insufficient permissions

**Solutions**:
```powershell
# Solution 1: Run as Administrator
msiexec /i yurucode-1.0.0-x64.msi

# Solution 2: Take ownership of Temp folder
takeown /f %TEMP% /r /d y
icacls %TEMP% /grant %USERNAME%:F /t
```

### 1.3 Linux Installation Problems

#### Issue: AppImage won't run

**Solution**:
```bash
# Make executable
chmod +x Yurucode.AppImage

# If still failing, check FUSE
sudo apt install fuse libfuse2  # Ubuntu/Debian
sudo dnf install fuse           # Fedora
sudo pacman -S fuse2            # Arch

# Extract and run directly if FUSE unavailable
./Yurucode.AppImage --appimage-extract
./squashfs-root/AppRun
```

#### Issue: Missing shared libraries

**Diagnosis**:
```bash
# Check dependencies
ldd yurucode | grep "not found"

# Common missing libraries
sudo apt install libwebkit2gtk-4.0-37  # WebKit
sudo apt install libssl1.1              # OpenSSL
sudo apt install libgtk-3-0             # GTK3
```

---

## 2. Startup Problems

### 2.1 App Won't Start

#### Complete Diagnostic Process

**Step 1: Check logs**
```bash
# macOS server logs
cat ~/Library/Logs/yurucode/server.log

# Windows server logs
type %LOCALAPPDATA%\yurucode\logs\server.log

# Linux server logs
cat ~/.yurucode/logs/server.log
```

**Step 2: Run with debug mode**
```bash
# Set environment variable
export RUST_LOG=debug
export YURUCODE_DEBUG=true

# macOS
/Applications/Yurucode.app/Contents/MacOS/Yurucode

# Windows
"C:\Program Files\Yurucode\yurucode.exe"

# Linux
./yurucode
```

**Step 3: Check process status**
```bash
# See if process is running
ps aux | grep yurucode

# Check port usage (ports are dynamically allocated in 20000-65000 range)
netstat -an | grep -E "20[0-9]{3}|[3-6][0-9]{4}"
lsof -i :20000-65000  # macOS/Linux
```

### 2.2 Window Doesn't Appear

#### Issue: Process runs but no window

**Causes & Solutions**:

1. **Hidden window state**
```bash
# Reset window position (delete state file)
# macOS
rm ~/Library/Application\ Support/yurucode/window-state.json

# Windows
del %APPDATA%\yurucode\window-state.json
```

2. **Display configuration issue**
```bash
# Check display configuration
# macOS
system_profiler SPDisplaysDataType

# Force window to primary display
defaults write be.yuru.yurucode NSWindow\ Frame\ MainWindow "0 0 1024 768"
```

3. **GPU driver issues**
```bash
# Disable hardware acceleration
export WEBKIT_DISABLE_COMPOSITING_MODE=1
```

### 2.3 Crash on Startup

#### Systematic debugging approach:

**1. Safe mode start**:
```bash
# Start with minimal configuration
yurucode --safe-mode --disable-gpu --no-sandbox
```

**2. Clear all cache and config**:
```bash
# macOS
rm -rf ~/Library/Application\ Support/yurucode
rm -rf ~/Library/Caches/yurucode

# Windows
rmdir /s %APPDATA%\yurucode
rmdir /s %LOCALAPPDATA%\yurucode

# Linux
rm -rf ~/.config/yurucode
rm -rf ~/.cache/yurucode
```

**3. Check crash dumps**:
```bash
# macOS crash reports
open ~/Library/Logs/DiagnosticReports/
# Look for Yurucode*.crash files

# Windows
eventvwr.msc
# Check Windows Logs > Application

# Linux
journalctl -xe | grep yurucode
coredumpctl list
```

---

## 3. Claude CLI Issues

### 3.1 Claude Binary Not Found

#### Complete diagnostic process:

**Step 1: Verify Claude installation**
```bash
# Check common locations
which claude           # System PATH
ls ~/.local/bin/claude # User installation
ls /usr/local/bin/claude # System-wide

# Windows
where claude
dir "%LOCALAPPDATA%\Claude\claude.exe"
```

**Step 2: Manual path configuration**
```javascript
// In Yurucode settings, set custom path:
{
  "claudeBinaryPath": "/custom/path/to/claude"
}
```

**Step 3: Environment variable setup**
```bash
# Add to shell profile
export CLAUDE_BINARY_PATH="/path/to/claude"
export PATH="$PATH:/path/to/claude/directory"
```

### 3.2 Claude CLI Version Mismatch

#### Diagnosis:
```bash
# Check Claude version
claude --version

# Check required version
cat /Applications/Yurucode.app/Contents/Resources/requirements.txt
```

#### Solution:
```bash
# Update Claude CLI
npm update -g @anthropic/claude-cli
# Or
pip install --upgrade anthropic-claude-cli
```

### 3.3 Authentication Issues

#### Issue: "API key not configured"

**Solutions**:

1. **Environment variable**:
```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

2. **Claude config file**:
```bash
# Edit Claude config
claude config set api_key sk-ant-...

# Verify
claude config get api_key
```

3. **Yurucode settings**:
```json
{
  "apiKey": "sk-ant-...",
  "apiKeySource": "environment"
}
```

### 3.4 WSL Issues (Windows)

#### Issue: Can't find Claude in WSL

**Complete WSL setup**:
```powershell
# 1. Enable WSL
wsl --install

# 2. Set WSL version
wsl --set-default-version 2

# 3. Install Ubuntu
wsl --install -d Ubuntu

# 4. Enter WSL
wsl

# 5. Install Claude in WSL
curl -O https://claude-cli-install.sh
bash claude-cli-install.sh

# 6. Configure path in Yurucode
{
  "claudeBinaryPath": "wsl",
  "wslCommand": "/home/username/.local/bin/claude"
}
```

---

## 4. Session Management Problems

### 4.1 Session Won't Start

#### Comprehensive debugging:

**1. Check server status**:
```typescript
// In DevTools console
const store = useClaudeCodeStore.getState();
console.log('Connected:', store.isConnected);
console.log('Server port:', store.serverPort);
```

**Note:** The server runs as a compiled binary on each platform:
- macOS: `yurucode-server-macos-arm64` (Apple Silicon) or `yurucode-server-macos-x64` (Intel)
- Windows: `yurucode-server-windows-x64.exe`
- Linux: `yurucode-server-linux-x64`

Fallback .cjs files exist for backwards compatibility when binaries fail.

**2. Test WebSocket connection**:
```javascript
// Test WebSocket manually
const socket = io(`ws://localhost:${port}`);
socket.on('connect', () => console.log('Connected'));
socket.on('error', (e) => console.error('Error:', e));
```

**3. Verify process spawning**:
```bash
# Monitor process creation
# macOS/Linux
sudo fs_usage -w -f process | grep claude

# Windows
procmon.exe /Filter:"ProcessName contains claude"
```

### 4.2 Messages Not Sending

#### Diagnostic steps:

**1. Check message queue**:
```javascript
// In DevTools
const session = store.sessions.get(sessionId);
console.log('Queue:', session.messageQueue);
console.log('Streaming:', session.isStreaming);
```

**2. Monitor WebSocket events**:
```javascript
// Debug WebSocket
socket.onAny((event, ...args) => {
  console.log(`Event: ${event}`, args);
});
```

**3. Check for blocking hooks**:
```bash
# Disable all hooks temporarily
mv ~/.config/yurucode/hooks.json ~/.config/yurucode/hooks.json.bak
```

### 4.3 Session Disconnects Randomly

#### Root cause analysis:

**1. Network stability**:
```bash
# Monitor network interruptions
ping -t 127.0.0.1 | grep -E "timeout|unreachable"

# Check for port conflicts (dynamic port range 20000-65000)
lsof -i :20000-65000
netstat -an | grep -E "20[0-9]{3}|[3-6][0-9]{4}"
```

**2. Resource limits**:
```bash
# Check system limits
ulimit -a

# Increase limits if needed
ulimit -n 4096  # File descriptors
ulimit -u 2048  # Processes
```

**3. Memory pressure**:
```bash
# Monitor memory usage
watch -n 1 'ps aux | grep yurucode'

# Check for OOM killer (Linux)
dmesg | grep -i "killed process"
```

---

## 5. Performance Issues

### 5.1 Slow Response Times

#### Performance profiling:

**1. Enable performance monitoring**:
```javascript
// In DevTools console
localStorage.setItem('yurucode_perf_monitor', 'true');
window.location.reload();
```

**2. Analyze metrics**:
```javascript
// Get performance report
const perfMonitor = window.__PERF_MONITOR__;
console.table(perfMonitor.getAllMetrics());
console.log('Violations:', perfMonitor.checkThresholds());
```

**3. Chrome DevTools profiling**:
```
1. Open DevTools (F12)
2. Performance tab
3. Start recording
4. Perform slow action
5. Stop recording
6. Analyze flame graph
```

### 5.2 High CPU Usage

#### Diagnosis and solutions:

**1. Identify CPU-intensive operations**:
```bash
# Sample CPU usage
# macOS
sample Yurucode 10 -file cpu_sample.txt

# Linux
perf record -p $(pgrep yurucode) -g
perf report

# Windows
wpr -start CPU -start ReferenceSet -filemode
# Reproduce issue
wpr -stop report.etl
```

**2. Common causes**:
- Infinite re-renders in React
- Unthrottled event handlers
- Large message history
- Memory leaks causing GC pressure

**Solutions**:
```javascript
// Limit message history
const MAX_MESSAGES = 1000;
if (messages.length > MAX_MESSAGES) {
  messages = messages.slice(-MAX_MESSAGES);
}

// Throttle scroll handlers
const handleScroll = throttle(() => {
  // Handle scroll
}, 100);
```

### 5.3 Memory Leaks

#### Detection and fixing:

**1. Memory profiling**:
```javascript
// Take heap snapshots
// DevTools > Memory > Take snapshot
// Compare snapshots over time
```

**2. Common leak sources**:

```javascript
// Event listeners not removed
useEffect(() => {
  const handler = () => {};
  window.addEventListener('resize', handler);
  return () => window.removeEventListener('resize', handler); // Cleanup!
}, []);

// Timers not cleared
useEffect(() => {
  const timer = setInterval(() => {}, 1000);
  return () => clearInterval(timer); // Cleanup!
}, []);

// WebSocket listeners accumulating
socket.off('event'); // Remove old before adding new
socket.on('event', handler);
```

**3. Force garbage collection**:
```javascript
// In DevTools console (requires --expose-gc flag)
if (global.gc) {
  global.gc();
  console.log('GC triggered');
}
```

---

## 6. UI/Display Problems

### 6.1 Blank/White Screen

#### Systematic debugging:

**1. Check DevTools console**:
```
F12 > Console
Look for React errors, failed resource loads
```

**2. Verify resources loading**:
```
F12 > Network
Check for 404s, failed loads
```

**3. React error boundaries**:
```javascript
// Check if error boundary triggered
localStorage.getItem('yurucode_errors');
```

**4. Force refresh**:
```
Ctrl+Shift+R (Windows/Linux)
Cmd+Shift+R (macOS)
```

### 6.2 Styling Issues

#### Common problems and fixes:

**1. Fonts not loading**:
```css
/* Check font paths */
@font-face {
  font-family: 'Inter';
  src: url('/fonts/Inter.woff2') format('woff2');
  /* Ensure path is correct */
}
```

**2. Dark theme issues**:
```javascript
// Force theme refresh
document.documentElement.className = 'dark';
localStorage.setItem('theme', 'dark');
```

**3. CSS not applying**:
```bash
# Clear CSS cache
rm -rf node_modules/.vite
npm run build
```

### 6.3 Scrolling Problems

#### Fixes for scroll issues:

**1. Virtual scrolling broken**:
```javascript
// Reset virtual scroller
const virtualizer = document.querySelector('.virtual-list');
virtualizer.scrollTop = 0;
virtualizer.style.height = 'auto';
virtualizer.offsetHeight; // Force reflow
virtualizer.style.height = '';
```

**2. Stuck scroll position**:
```javascript
// Reset scroll state
sessionStorage.removeItem('scroll_position_' + sessionId);
window.scrollTo(0, 0);
```

---

## 7. Network & Connection Issues

### 7.1 WebSocket Connection Failed

#### Comprehensive diagnosis:

**1. Check server running**:
```bash
# Find Node.js server process
ps aux | grep "server-claude"
pgrep -f "EMBEDDED_SERVER"
```

**2. Port availability**:
```bash
# Check if ports are in use (dynamic range 20000-65000)
lsof -i :20000-65000

# Kill conflicting processes on a specific port
kill -9 $(lsof -t -i :PORT_NUMBER)
```

**3. Firewall issues**:
```bash
# macOS
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --listapps
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add /Applications/Yurucode.app

# Windows
netsh advfirewall firewall add rule name="Yurucode" dir=in action=allow program="C:\Program Files\Yurucode\yurucode.exe"

# Linux (allow dynamic port range)
sudo ufw allow 20000:65000/tcp
```

### 7.2 Connection Keeps Dropping

#### Stability improvements:

**1. Increase timeouts**:
```javascript
// In settings
{
  "websocket": {
    "pingTimeout": 60000,
    "pingInterval": 25000,
    "reconnectionDelay": 1000,
    "reconnectionDelayMax": 5000,
    "reconnectionAttempts": Infinity
  }
}
```

**2. Network quality monitoring**:
```javascript
// Add connection quality monitor
let missedPings = 0;
socket.on('pong', () => missedPings = 0);
setInterval(() => {
  socket.emit('ping');
  missedPings++;
  if (missedPings > 3) {
    console.warn('Connection quality poor');
  }
}, 5000);
```

---

## 8. Database & Storage Issues

### 8.1 Database Corruption

#### Recovery process:

**1. Backup current database**:
```bash
# Find database
# macOS
cp ~/Library/Application\ Support/yurucode/yurucode.db yurucode.db.corrupt

# Windows
copy %APPDATA%\yurucode\yurucode.db yurucode.db.corrupt
```

**2. Attempt repair**:
```sql
-- Using sqlite3 command
sqlite3 yurucode.db

-- Check integrity
PRAGMA integrity_check;

-- If errors, try to recover
.mode insert
.output recovered_data.sql
.dump
.quit

-- Create new database
sqlite3 yurucode_new.db < recovered_data.sql
```

**3. Reset database**:
```bash
# Last resort - delete and recreate
rm yurucode.db
# App will recreate on next start
```

### 8.2 Storage Quota Exceeded

#### Solutions:

**1. Check storage usage**:
```javascript
// In DevTools
navigator.storage.estimate().then(estimate => {
  console.log(`Using ${estimate.usage} of ${estimate.quota} bytes`);
});
```

**2. Clear old data**:
```javascript
// Clear old sessions
const cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000); // 30 days
Object.keys(localStorage).forEach(key => {
  if (key.startsWith('session_')) {
    const data = JSON.parse(localStorage.getItem(key));
    if (data.timestamp < cutoff) {
      localStorage.removeItem(key);
    }
  }
});
```

**3. Increase quota (if possible)**:
```javascript
// Request persistent storage
navigator.storage.persist().then(granted => {
  console.log('Persistent storage:', granted ? 'granted' : 'denied');
});
```

---

## 9. Memory & Resource Issues

### 9.1 Out of Memory Errors

#### Diagnosis and mitigation:

**1. Memory profiling**:
```bash
# Monitor memory usage
# macOS
while true; do
  ps -o pid,vsz,rss,comm -p $(pgrep Yurucode)
  sleep 1
done

# Windows
typeperf "\Process(yurucode)\Working Set" -si 1

# Linux
watch -n 1 'ps aux | grep yurucode'
```

**2. Heap dump analysis**:
```javascript
// Take heap dump (Chrome DevTools)
// Memory tab > Take heap snapshot
// Look for:
// - Detached DOM nodes
// - Large arrays/strings
// - Circular references
```

**3. Memory limits**:
```bash
# Increase Node.js memory limit
export NODE_OPTIONS="--max-old-space-size=4096"

# Increase Rust stack size
export RUST_MIN_STACK="8388608"  # 8MB
```

### 9.2 Process Limits Reached

#### System limit adjustments:

**macOS**:
```bash
# Check limits
launchctl limit

# Increase limits
sudo launchctl limit maxfiles 65536 200000
sudo launchctl limit maxproc 2048 2048
```

**Linux**:
```bash
# Check limits
ulimit -a

# Edit /etc/security/limits.conf
* soft nofile 65536
* hard nofile 65536
* soft nproc 4096
* hard nproc 4096
```

**Windows**:
```powershell
# Increase desktop heap
# Regit HKEY_LOCAL_MACHINE\System\CurrentControlSet\Control\Session Manager\SubSystems
# Increase SharedSection values
```

---

## 10. Platform-Specific Issues

### 10.1 macOS-Specific

#### Issue: "Operation not permitted" errors

**Solution**:
```bash
# Grant full disk access
System Preferences > Security & Privacy > Privacy > Full Disk Access
# Add Yurucode.app

# Reset permissions
tccutil reset All be.yuru.yurucode
```

#### Issue: Translucent sidebar not working

**Solution**:
```bash
# Enable transparency
defaults write com.apple.universalaccess reduceTransparency -bool false

# Force redraw
killall Dock
```

### 10.2 Windows-Specific

#### Issue: High DPI scaling problems

**Solutions**:
```xml
<!-- yurucode.exe.manifest -->
<application>
  <windowsSettings>
    <dpiAware>true/PM</dpiAware>
    <dpiAwareness>PerMonitorV2</dpiAwareness>
  </windowsSettings>
</application>
```

**Registry fix**:
```reg
[HKEY_CURRENT_USER\Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers]
"C:\\Program Files\\Yurucode\\yurucode.exe"="~ HIGHDPIAWARE"
```

#### Issue: Antivirus false positives

**Solutions**:
1. Add exclusion for Yurucode folder
2. Submit for analysis to antivirus vendor
3. Sign with EV certificate

### 10.3 Linux-Specific

#### Issue: GTK theme issues

**Solutions**:
```bash
# Force GTK theme
export GTK_THEME=Adwaita:dark
export GTK2_RC_FILES=/usr/share/themes/Adwaita-dark/gtk-2.0/gtkrc

# Use system theme
gsettings set org.gnome.desktop.interface gtk-theme 'Adwaita-dark'
```

#### Issue: Wayland compatibility

**Solutions**:
```bash
# Force X11
export GDK_BACKEND=x11

# Or enable Wayland features
export MOZ_ENABLE_WAYLAND=1
export WEBKIT_DISABLE_COMPOSITING_MODE=1
```

---

## 11. Advanced Debugging

### 11.1 Debug Mode Activation

**Complete debug setup**:
```bash
# Environment variables
export RUST_LOG=trace
export RUST_BACKTRACE=full
export YURUCODE_DEBUG=true
export NODE_ENV=development
export DEBUG=*

# Launch with debugging
yurucode --debug --verbose --log-level=trace
```

### 11.2 Logging Configuration

**Custom log configuration**:
```json
{
  "logging": {
    "level": "trace",
    "targets": {
      "console": true,
      "file": true,
      "syslog": false
    },
    "filters": {
      "yurucode": "trace",
      "tauri": "debug",
      "wry": "info"
    },
    "rotation": {
      "maxSize": "10MB",
      "maxFiles": 5
    }
  }
}
```

### 11.3 Remote Debugging

**Enable remote debugging**:
```bash
# Start with remote debugging
yurucode --remote-debugging-port=9222

# Connect Chrome DevTools
chrome://inspect/#devices
```

### 11.4 Core Dumps

**Enable core dumps**:
```bash
# macOS/Linux
ulimit -c unlimited
sudo sysctl -w kern.corefile=/tmp/core.%P

# Generate core dump on crash
kill -QUIT $(pgrep yurucode)

# Analyze core dump
lldb yurucode -c /tmp/core.12345
gdb yurucode /tmp/core.12345
```

### 11.5 Strace/DTrace Analysis

**System call tracing**:
```bash
# Linux
strace -f -e trace=all -p $(pgrep yurucode) 2>&1 | tee strace.log

# macOS
sudo dtruss -p $(pgrep Yurucode) 2>&1 | tee dtrace.log

# Windows (ProcMon)
procmon.exe /Quiet /Minimized /BackingFile trace.pml
```

---

## 12. Error Codes Reference

### Application Error Codes

| Code | Description | Solution |
|------|-------------|----------|
| E001 | Claude binary not found | Install Claude CLI or set path |
| E002 | Session spawn failed | Check Claude installation and permissions |
| E003 | WebSocket connection failed | Check firewall and ports |
| E004 | Database initialization failed | Check disk space and permissions |
| E005 | Port allocation failed | Kill conflicting processes |
| E006 | Memory allocation failed | Increase system memory or limits |
| E007 | Process limit reached | Increase ulimits |
| E008 | API key invalid | Set valid Anthropic API key |
| E009 | Model not available | Check model name and availability |
| E010 | Context overflow | Trigger compaction or start new session |

### System Error Codes

| Code | Platform | Description | Solution |
|------|----------|-------------|----------|
| 0x80070005 | Windows | Access denied | Run as administrator |
| 0x80004005 | Windows | Unspecified error | Check event logs |
| SIGKILL (9) | Unix | Process killed | Check OOM killer |
| SIGSEGV (11) | Unix | Segmentation fault | Memory corruption, check core dump |
| SIGPIPE (13) | Unix | Broken pipe | Connection lost, reconnect |
| 127 | Unix | Command not found | Check PATH and binary location |

---

## Quick Reference Card

### Emergency Recovery Commands

```bash
# Full reset (nuclear option)
# macOS
rm -rf ~/Library/Application\ Support/yurucode
rm -rf ~/Library/Caches/yurucode
rm -rf ~/Library/Logs/yurucode
rm -rf ~/Library/Preferences/be.yuru.yurucode.plist

# Windows
rmdir /s /q %APPDATA%\yurucode
rmdir /s /q %LOCALAPPDATA%\yurucode
reg delete HKCU\Software\yurucode /f

# Linux
rm -rf ~/.config/yurucode
rm -rf ~/.cache/yurucode
rm -rf ~/.local/share/yurucode
rm -rf ~/.yurucode
```

### Health Check Script

```bash
#!/bin/bash
echo "=== Yurucode Health Check ==="

# Check process
pgrep yurucode > /dev/null && echo "Process running" || echo "Process not running"

# Check ports (dynamic allocation in 20000-65000 range)
lsof -i :20000-65000 > /dev/null 2>&1 && echo "Port(s) open" || echo "No ports open"

# Check Claude
which claude > /dev/null && echo "Claude found" || echo "Claude not found"

# Check disk space
df -h . | awk 'NR==2 {print "Disk usage: " $5}'

# Check memory
free -h | awk 'NR==2 {print "Memory: " $3 "/" $2}'

echo "=== End Health Check ==="
```

---

## Getting Help

### Support Channels

1. **GitHub Issues**: https://github.com/yurucode/yurucode/issues
2. **Discord Community**: https://discord.gg/yurucode
3. **Email Support**: support@yurucode.app
4. **Documentation**: https://docs.yurucode.app

### Information to Provide

When reporting issues, include:

1. **System Information**:
```bash
yurucode --version
uname -a  # or systeminfo on Windows
claude --version
```

2. **Error Messages**: Complete error text
3. **Logs**: Recent log files
4. **Steps to Reproduce**: Exact steps
5. **Expected vs Actual**: What should happen vs what happens
6. **Screenshots**: If UI-related

### Debug Bundle Generation

```bash
#!/bin/bash
# Create debug bundle
mkdir yurucode-debug
cd yurucode-debug

# Collect system info
uname -a > system.txt
yurucode --version >> system.txt

# Collect logs (macOS)
cp ~/Library/Logs/yurucode/server.log . 2>/dev/null

# Collect logs (Linux - run this instead on Linux)
# cp ~/.yurucode/logs/server.log . 2>/dev/null

# Create archive
cd ..
tar -czf yurucode-debug.tar.gz yurucode-debug/
echo "Debug bundle created: yurucode-debug.tar.gz"
```

For Windows, collect logs from:
```powershell
copy %LOCALAPPDATA%\yurucode\logs\server.log yurucode-debug\
```

---

This comprehensive troubleshooting guide covers all common issues and their solutions. For issues not covered here, please contact support with detailed information about your problem.