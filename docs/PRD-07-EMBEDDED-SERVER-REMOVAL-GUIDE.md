# CRITICAL: Embedded Server Removal Guide
## ⚠️ WARNING: This is the Most Dangerous Change You Can Make

---

## Table of Contents
1. [Why The Embedded Server Exists](#why-the-embedded-server-exists)
2. [Critical Gotchas](#critical-gotchas)
3. [Platform-Specific Challenges](#platform-specific-challenges)
4. [Step-by-Step Removal Plan](#step-by-step-removal-plan)
5. [Testing Requirements](#testing-requirements)
6. [Emergency Recovery](#emergency-recovery)

---

## Why The Embedded Server Exists

### The embedded server (5,680 lines in `logged_server.rs`) exists because:

1. **Windows WSL Complexity**
   - Windows users often have Claude installed in WSL, not native Windows
   - Path translation required: `C:\Users\...` → `/mnt/c/users/...`
   - Different execution methods: `wsl.exe -e bash -c` vs direct execution

2. **Node.js PATH Issues**
   - Claude CLI requires Node.js in PATH
   - macOS apps have limited PATH environment
   - Windows has different Node.js locations

3. **Real-time Stream Parsing**
   - Claude outputs `stream-json` format
   - Needs buffering and parsing line-by-line
   - Socket.IO provides reliable real-time communication

4. **Session State Management**
   - Tracks multiple concurrent sessions
   - Manages message history for context recreation
   - Handles `/compact` command detection

5. **Cross-Platform Compatibility**
   - Single codebase for Windows/macOS/Linux
   - Handles platform-specific quirks

---

## Critical Gotchas

### 🚨 GOTCHA #1: Windows WSL Detection
```javascript
// Current embedded server handles this complexity:
function getClaudeCommand(args, workingDir, message) {
  if (CLAUDE_EXECUTION_MODE === 'wsl') {
    // Complex WSL username detection
    let wslUser = execSync(`wsl.exe -e bash -c "whoami"`).trim();
    
    // Path conversion
    const wslWorkingDir = windowsToWslPath(workingDir);
    
    // Find Claude in WSL
    const possiblePaths = [
      `/home/${wslUser}/.claude/local/node_modules/.bin/claude`,
      `/home/${wslUser}/.npm-global/bin/claude`,
      `/usr/local/bin/claude`
    ];
  }
}
```

**If you remove this:** Windows users with WSL Claude will be completely broken.

### 🚨 GOTCHA #2: Path Translation
```javascript
// Windows to WSL path conversion
function windowsToWslPath(winPath) {
  if (!winPath) return '/tmp';
  
  // Handle special characters and spaces
  winPath = winPath.replace(/\\/g, '/');
  
  // C:\ → /mnt/c/
  if (winPath[1] === ':') {
    const driveLetter = winPath[0].toLowerCase();
    return `/mnt/${driveLetter}/${winPath.slice(3)}`;
  }
  
  return winPath;
}
```

**If you remove this:** File operations will fail on Windows WSL.

### 🚨 GOTCHA #3: Node.js Binary Location
```javascript
// Current server finds Node.js dynamically
const nodePaths = isWindows ? [
  'C:\\Program Files\\nodejs\\node.exe',
  'C:\\Program Files (x86)\\nodejs\\node.exe',
  process.env.ProgramFiles + '\\nodejs\\node.exe',
  which.sync('node', { nothrow: true })
] : [
  '/usr/local/bin/node',
  '/opt/homebrew/bin/node',
  '/usr/bin/node'
];
```

**If you remove this:** Claude CLI won't find Node.js.

### 🚨 GOTCHA #4: Stream JSON Parsing
```javascript
// Complex stream parsing with buffering
let buffer = '';
let messageBuffer = [];
let isStreamingContent = false;

claudeProcess.stdout.on('data', (chunk) => {
  buffer += chunk.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop(); // Keep incomplete line in buffer
  
  lines.forEach(line => {
    if (!line.trim()) return;
    
    try {
      const data = JSON.parse(line);
      
      // Handle different message types
      if (data.type === 'message_start') {
        // Start new message
      } else if (data.type === 'content_block_delta') {
        // Accumulate content
      } else if (data.type === 'message_stop') {
        // Finalize message
      }
    } catch (e) {
      // Handle partial JSON
    }
  });
});
```

**If you remove this:** Message streaming will break.

### 🚨 GOTCHA #5: Session Resume Fallback
```javascript
// Current server handles --resume failures gracefully
if (code === 1 && args.includes('--resume')) {
  console.log('Resume failed, recreating context...');
  
  // Remove --resume flag
  const newArgs = args.filter(arg => arg !== '--resume' && !arg.startsWith('ses_'));
  
  // Add context messages
  const contextMessages = session.messages.slice(-10);
  // ... recreate context
}
```

**If you remove this:** Session resume failures will be unrecoverable.

### 🚨 GOTCHA #6: /compact Command Detection
```javascript
// Detects and handles compaction
if (assistantText?.includes('compacted this conversation')) {
  session.wasCompacted = true;
  session.claudeSessionId = null; // Force new session
  
  // Emit special event
  socket.emit('session-compacted', { sessionId });
}
```

**If you remove this:** Compacted sessions will break.

### 🚨 GOTCHA #7: Health Checks During Streaming
```javascript
// Monitors streaming health
streamHealthChecks.set(sessionId, setInterval(() => {
  const timeSinceLastOutput = Date.now() - lastOutputTime;
  
  if (timeSinceLastOutput > 30000 && isStreaming) {
    console.warn('Stream appears stuck, attempting recovery...');
    // Recovery logic
  }
}, 5000));
```

**If you remove this:** Stuck streams won't be detected.

---

## Platform-Specific Challenges

### Windows Challenges
1. **WSL vs Native**: Must detect and handle both
2. **Path Formats**: Backslashes, drive letters, UNC paths
3. **Process Management**: Different kill commands
4. **Hidden Windows**: Need windowsHide flag
5. **Shell Execution**: .cmd files need special handling

### macOS Challenges
1. **Limited PATH**: Apps don't inherit shell PATH
2. **Homebrew Locations**: /opt/homebrew vs /usr/local
3. **Code Signing**: Spawned processes need entitlements
4. **Sandbox Restrictions**: File access limitations

### Linux Challenges
1. **Distro Differences**: Package locations vary
2. **Permission Issues**: Different user/group handling
3. **Desktop Integration**: Various desktop environments

---

## Step-by-Step Removal Plan

### ⚠️ DO NOT ATTEMPT THIS UNLESS YOU HAVE:
- [ ] Full test coverage on all platforms
- [ ] Beta testers on Windows (WSL and native)
- [ ] Beta testers on macOS (Intel and Apple Silicon)
- [ ] Beta testers on Linux (Ubuntu, Fedora, Arch)
- [ ] Rollback plan ready
- [ ] 2-4 weeks for testing

### Phase 1: Parallel Implementation (Weeks 1-2)

#### Step 1.1: Create Native Rust Commands
```rust
// src-tauri/src/commands/native_claude.rs
use std::process::Stdio;
use tokio::process::{Command, Child};
use tokio::io::{AsyncBufReadExt, BufReader};

#[derive(Debug)]
pub struct NativeClaudeExecutor {
    process: Option<Child>,
    platform_handler: Box<dyn PlatformHandler>,
}

trait PlatformHandler {
    fn get_claude_path(&self) -> Result<String, String>;
    fn prepare_args(&self, args: Vec<String>) -> Vec<String>;
    fn translate_path(&self, path: &str) -> String;
}

struct WindowsHandler {
    use_wsl: bool,
    wsl_user: Option<String>,
}

impl PlatformHandler for WindowsHandler {
    fn get_claude_path(&self) -> Result<String, String> {
        if self.use_wsl {
            // Complex WSL detection
            let wsl_user = self.wsl_user.as_ref()
                .ok_or("WSL user not detected")?;
            
            // Try multiple locations
            let paths = vec![
                format!("/home/{}/.claude/local/node_modules/.bin/claude", wsl_user),
                format!("/home/{}/.npm-global/bin/claude", wsl_user),
                "/usr/local/bin/claude".to_string(),
            ];
            
            // Test each path
            for path in paths {
                let test = Command::new("wsl.exe")
                    .args(&["-e", "test", "-f", &path])
                    .output()
                    .await?;
                
                if test.status.success() {
                    return Ok(path);
                }
            }
            
            Err("Claude not found in WSL".to_string())
        } else {
            // Native Windows detection
            which::which("claude")
                .map(|p| p.to_string_lossy().to_string())
                .map_err(|e| e.to_string())
        }
    }
    
    fn translate_path(&self, path: &str) -> String {
        if self.use_wsl {
            // Windows to WSL path translation
            if path.len() > 1 && path.chars().nth(1) == Some(':') {
                let drive = path.chars().nth(0).unwrap().to_lowercase();
                format!("/mnt/{}/{}", drive, path[3..].replace('\\', "/"))
            } else {
                path.to_string()
            }
        } else {
            path.to_string()
        }
    }
}

struct MacOSHandler;

impl PlatformHandler for MacOSHandler {
    fn get_claude_path(&self) -> Result<String, String> {
        // Check common locations
        let paths = vec![
            "/opt/homebrew/bin/claude",
            "/usr/local/bin/claude",
            "/Users/{}/.claude/local/node_modules/.bin/claude",
        ];
        
        for path in paths {
            if std::path::Path::new(path).exists() {
                return Ok(path.to_string());
            }
        }
        
        // Try which
        which::which("claude")
            .map(|p| p.to_string_lossy().to_string())
            .map_err(|e| format!("Claude not found: {}", e))
    }
}
```

#### Step 1.2: Stream JSON Parser
```rust
// src-tauri/src/stream_parser.rs
use serde_json::Value;
use tokio::io::AsyncBufReadExt;

pub struct StreamJsonParser {
    buffer: String,
    message_buffer: Vec<Value>,
    current_message: Option<Value>,
}

impl StreamJsonParser {
    pub async fn parse_stream<R: AsyncBufReadExt>(
        &mut self,
        reader: &mut R,
    ) -> Result<Vec<Message>, String> {
        let mut messages = Vec::new();
        let mut line = String::new();
        
        while reader.read_line(&mut line).await? > 0 {
            if line.trim().is_empty() {
                line.clear();
                continue;
            }
            
            match serde_json::from_str::<Value>(&line) {
                Ok(data) => {
                    match data["type"].as_str() {
                        Some("message_start") => {
                            self.current_message = Some(data);
                        }
                        Some("content_block_delta") => {
                            if let Some(ref mut msg) = self.current_message {
                                // Accumulate content
                                self.append_content(msg, &data);
                            }
                        }
                        Some("message_stop") => {
                            if let Some(msg) = self.current_message.take() {
                                messages.push(self.finalize_message(msg)?);
                            }
                        }
                        Some("error") => {
                            return Err(format!("Claude error: {}", data["message"]));
                        }
                        _ => {
                            // Handle other message types
                        }
                    }
                }
                Err(e) => {
                    // Buffer partial JSON
                    self.buffer.push_str(&line);
                    
                    // Try parsing buffered content
                    if let Ok(data) = serde_json::from_str::<Value>(&self.buffer) {
                        // Process buffered message
                        self.buffer.clear();
                    }
                }
            }
            
            line.clear();
        }
        
        Ok(messages)
    }
}
```

#### Step 1.3: Session State Management
```rust
// src-tauri/src/session_manager.rs
use std::collections::HashMap;
use tokio::sync::RwLock;

pub struct SessionManager {
    sessions: Arc<RwLock<HashMap<String, Session>>>,
    resume_fallback: bool,
}

impl SessionManager {
    pub async fn resume_or_create(
        &self,
        session_id: &str,
        context: Option<Vec<Message>>,
    ) -> Result<String, String> {
        // Try to resume
        match self.try_resume(session_id).await {
            Ok(id) => Ok(id),
            Err(e) if self.resume_fallback => {
                // Fallback to context recreation
                warn!("Resume failed: {}, recreating context", e);
                self.create_with_context(context).await
            }
            Err(e) => Err(e),
        }
    }
    
    async fn try_resume(&self, session_id: &str) -> Result<String, String> {
        let output = Command::new(self.claude_path())
            .args(&["--resume", session_id, "--dry-run"])
            .output()
            .await?;
        
        if output.status.success() {
            Ok(session_id.to_string())
        } else {
            Err("Session not found".to_string())
        }
    }
}
```

### Phase 2: Feature Flag Implementation (Weeks 3-4)

#### Step 2.1: Add Feature Flags
```rust
// src-tauri/src/config.rs
pub struct Config {
    pub use_native_execution: bool,
    pub enable_wsl_support: bool,
    pub fallback_to_embedded: bool,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            use_native_execution: env::var("USE_NATIVE_EXECUTION")
                .map(|v| v == "true")
                .unwrap_or(false),
            enable_wsl_support: env::var("ENABLE_WSL")
                .map(|v| v == "true")
                .unwrap_or(cfg!(windows)),
            fallback_to_embedded: env::var("FALLBACK_TO_EMBEDDED")
                .map(|v| v == "true")
                .unwrap_or(true),
        }
    }
}
```

#### Step 2.2: Dual-Mode Execution
```rust
// src-tauri/src/commands/mod.rs
#[tauri::command]
pub async fn execute_claude(
    state: State<'_, AppState>,
    session_id: String,
    message: String,
) -> Result<(), String> {
    let config = state.config.lock().await;
    
    if config.use_native_execution {
        // Try native execution
        match native_claude::execute(&session_id, &message).await {
            Ok(result) => Ok(result),
            Err(e) if config.fallback_to_embedded => {
                warn!("Native execution failed: {}, falling back", e);
                embedded_server::execute(&session_id, &message).await
            }
            Err(e) => Err(e),
        }
    } else {
        // Use embedded server
        embedded_server::execute(&session_id, &message).await
    }
}
```

### Phase 3: Testing Matrix (Weeks 5-6)

#### Required Test Scenarios

##### Windows Tests
```powershell
# Test 1: Native Windows Claude
$env:USE_NATIVE_EXECUTION = "true"
$env:ENABLE_WSL = "false"
npm run tauri:dev

# Test 2: WSL Claude
$env:USE_NATIVE_EXECUTION = "true"
$env:ENABLE_WSL = "true"
npm run tauri:dev

# Test 3: Fallback mode
$env:USE_NATIVE_EXECUTION = "true"
$env:FALLBACK_TO_EMBEDDED = "true"
# Intentionally break Claude path to test fallback
```

##### macOS Tests
```bash
# Test 1: Homebrew Claude
export USE_NATIVE_EXECUTION=true
export CLAUDE_PATH=/opt/homebrew/bin/claude
npm run tauri:dev

# Test 2: npm-installed Claude
export USE_NATIVE_EXECUTION=true
export CLAUDE_PATH=~/.npm-global/bin/claude
npm run tauri:dev

# Test 3: Limited PATH environment
PATH=/usr/bin:/bin npm run tauri:dev
```

##### Edge Cases to Test
1. **Long-running sessions** (2+ hours)
2. **Large messages** (10,000+ tokens)
3. **Rapid message sending** (10 messages in 1 second)
4. **Network interruptions** during streaming
5. **Process crashes** during execution
6. **Multiple concurrent sessions** (5+)
7. **Session resume after app restart**
8. **Compact command handling**
9. **File path with spaces and special characters**
10. **Unicode in messages and file paths**

### Phase 4: Gradual Rollout (Weeks 7-8)

#### Step 4.1: Beta Testing
```typescript
// Enable for beta testers only
const BETA_USERS = [
  'user-id-1',
  'user-id-2',
  // ... add beta testers
];

export const FEATURE_FLAGS = {
  USE_NATIVE_EXECUTION: BETA_USERS.includes(getUserId()),
  // ... other flags
};
```

#### Step 4.2: Telemetry
```rust
// Track success/failure rates
#[derive(Serialize)]
struct ExecutionMetrics {
    method: String, // "native" or "embedded"
    success: bool,
    duration_ms: u64,
    error: Option<String>,
    platform: String,
    wsl: bool,
}

async fn track_execution(metrics: ExecutionMetrics) {
    // Send to analytics service
    if let Err(e) = analytics::track("execution", metrics).await {
        warn!("Failed to track metrics: {}", e);
    }
}
```

### Phase 5: Embedded Server Removal (Weeks 9-10)

#### Step 5.1: Final Verification Checklist
- [ ] Native execution success rate > 99%
- [ ] All beta testers approve
- [ ] No critical bugs in 2 weeks
- [ ] Fallback mechanism tested
- [ ] Documentation updated
- [ ] Support team trained

#### Step 5.2: Actual Removal
```rust
// src-tauri/src/logged_server.rs

// Step 1: Move embedded server to separate module
#[cfg(feature = "embedded_server")]
mod embedded {
    pub const EMBEDDED_SERVER: &str = include_str!("legacy/embedded_server.js");
}

// Step 2: Conditional compilation
#[cfg(feature = "embedded_server")]
pub use embedded::EMBEDDED_SERVER;

#[cfg(not(feature = "embedded_server"))]
pub const EMBEDDED_SERVER: &str = "";

// Step 3: Update Cargo.toml
// [features]
// default = ["embedded_server"]
// production = []  // No embedded server

// Step 4: Build without embedded server
// cargo build --features production
```

#### Step 5.3: Keep Backup
```bash
# Before removal, create backup branch
git checkout -b backup/embedded-server-final
git push origin backup/embedded-server-final

# Tag the last version with embedded server
git tag -a v1.0.0-last-embedded -m "Last version with embedded server"
git push origin v1.0.0-last-embedded

# Archive the embedded server code
tar -czf embedded-server-backup.tar.gz src-tauri/src/logged_server.rs
aws s3 cp embedded-server-backup.tar.gz s3://backups/yurucode/
```

---

## Testing Requirements

### Automated Test Suite
```typescript
// tests/native-execution.test.ts
describe('Native Execution', () => {
  describe('Windows', () => {
    it('should detect WSL Claude', async () => {
      // Mock WSL environment
      const result = await detectClaudePath('wsl');
      expect(result).toMatch(/\/home\/.*\/\.claude/);
    });
    
    it('should translate Windows paths to WSL', () => {
      expect(translatePath('C:\\Users\\test\\project'))
        .toBe('/mnt/c/Users/test/project');
    });
    
    it('should handle spaces in paths', () => {
      expect(translatePath('C:\\Program Files\\test'))
        .toBe('/mnt/c/Program Files/test');
    });
  });
  
  describe('Stream Parsing', () => {
    it('should handle partial JSON', async () => {
      const parser = new StreamJsonParser();
      const chunks = [
        '{"type": "message_',
        'start", "message": {',
        '"role": "assistant"}}',
      ];
      
      for (const chunk of chunks) {
        await parser.processChunk(chunk);
      }
      
      expect(parser.getCurrentMessage()).toBeDefined();
    });
    
    it('should handle rapid streaming', async () => {
      // Simulate 100 chunks/second
      const startTime = Date.now();
      for (let i = 0; i < 100; i++) {
        await parser.processChunk(generateChunk());
      }
      const duration = Date.now() - startTime;
      
      expect(duration).toBeLessThan(1000);
    });
  });
  
  describe('Fallback Behavior', () => {
    it('should fallback to embedded on native failure', async () => {
      // Break native execution
      process.env.CLAUDE_PATH = '/nonexistent';
      
      const result = await executeWithFallback('test');
      expect(result.method).toBe('embedded');
    });
    
    it('should not fallback if disabled', async () => {
      process.env.FALLBACK_TO_EMBEDDED = 'false';
      process.env.CLAUDE_PATH = '/nonexistent';
      
      await expect(executeWithFallback('test'))
        .rejects.toThrow('Claude not found');
    });
  });
});
```

### Manual Test Protocol
```markdown
## Manual Testing Checklist

### Windows (Native)
- [ ] Install Claude via npm globally
- [ ] Start yurucode with native execution
- [ ] Create new session
- [ ] Send 10 messages
- [ ] Use Edit tool
- [ ] Use Bash tool with Windows paths
- [ ] Resume session after restart
- [ ] Handle compact command

### Windows (WSL)
- [ ] Install Claude in WSL
- [ ] Remove native Windows Claude
- [ ] Start yurucode
- [ ] Verify WSL detection
- [ ] Test path translation (C:\ → /mnt/c/)
- [ ] Edit files in Windows directories from WSL
- [ ] Test with spaces in paths
- [ ] Test Unicode filenames

### macOS
- [ ] Test with Homebrew Claude
- [ ] Test with npm Claude
- [ ] Remove Claude from PATH
- [ ] Verify path detection
- [ ] Test with limited PATH
- [ ] Test Apple Silicon
- [ ] Test Intel Mac

### Linux
- [ ] Test Ubuntu 22.04
- [ ] Test Fedora
- [ ] Test Arch
- [ ] Test with different shells (bash, zsh, fish)
- [ ] Test with different Node.js versions

### Stress Testing
- [ ] 1000+ message session
- [ ] 10 concurrent sessions
- [ ] 1MB+ message content
- [ ] Network disconnection during stream
- [ ] Kill Claude process manually
- [ ] Corrupt session file
- [ ] Fill disk space
- [ ] Low memory conditions
```

---

## Emergency Recovery

### If Everything Breaks

#### Immediate Recovery
```bash
#!/bin/bash
# emergency-restore.sh

echo "🚨 EMERGENCY RESTORE ACTIVATED"

# 1. Stop all processes
pkill -f yurucode
pkill -f claude

# 2. Restore embedded server
git checkout backup/embedded-server-final -- src-tauri/src/logged_server.rs

# 3. Disable native execution
cat > .env.local << EOF
USE_NATIVE_EXECUTION=false
FALLBACK_TO_EMBEDDED=true
EOF

# 4. Clear all caches
rm -rf target/
rm -rf node_modules/.cache/
rm -rf ~/.yurucode/cache/

# 5. Rebuild with embedded server
npm install
npm run build

echo "✅ Restored to embedded server version"
```

#### Recovery Verification
```javascript
// Verify embedded server is working
const testServer = () => {
  const server = spawn('node', ['-e', EMBEDDED_SERVER]);
  
  server.stdout.on('data', (data) => {
    if (data.toString().includes('Server started')) {
      console.log('✅ Embedded server operational');
      server.kill();
    }
  });
  
  setTimeout(() => {
    console.error('❌ Embedded server not responding');
    server.kill();
    process.exit(1);
  }, 5000);
};
```

#### Data Recovery
```typescript
// Recover corrupted sessions
async function recoverSessions() {
  const backupDir = path.join(homedir(), '.yurucode', 'backups');
  const sessions = await fs.readdir(backupDir);
  
  for (const sessionFile of sessions) {
    try {
      const data = await fs.readFile(
        path.join(backupDir, sessionFile),
        'utf8'
      );
      
      // Validate JSON
      JSON.parse(data);
      
      // Restore to main directory
      await fs.copyFile(
        path.join(backupDir, sessionFile),
        path.join(homedir(), '.yurucode', 'sessions', sessionFile)
      );
      
      console.log(`✅ Recovered session: ${sessionFile}`);
    } catch (e) {
      console.error(`❌ Failed to recover: ${sessionFile}`);
    }
  }
}
```

---

## Platform-Specific Recovery

### Windows Recovery
```powershell
# Windows-specific recovery script
# recover-windows.ps1

Write-Host "Recovering Windows installation..." -ForegroundColor Yellow

# 1. Check WSL status
$wslStatus = wsl --status
if ($LASTEXITCODE -ne 0) {
    Write-Host "WSL not available, using native mode" -ForegroundColor Red
    $env:ENABLE_WSL = "false"
}

# 2. Find Node.js
$nodePath = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodePath) {
    Write-Host "Node.js not found, installing..." -ForegroundColor Yellow
    winget install OpenJS.NodeJS
}

# 3. Find Claude
$claudePaths = @(
    "$env:APPDATA\npm\claude.cmd",
    "$env:PROGRAMFILES\claude\claude.exe",
    "$(wsl echo '~/.claude/local/node_modules/.bin/claude')"
)

$claudeFound = $false
foreach ($path in $claudePaths) {
    if (Test-Path $path) {
        Write-Host "Found Claude at: $path" -ForegroundColor Green
        $env:CLAUDE_PATH = $path
        $claudeFound = $true
        break
    }
}

if (-not $claudeFound) {
    Write-Host "Claude not found, please install manually" -ForegroundColor Red
    exit 1
}

# 4. Reset to embedded server
$env:USE_NATIVE_EXECUTION = "false"
$env:FALLBACK_TO_EMBEDDED = "true"

# 5. Rebuild
npm run build:win

Write-Host "Recovery complete!" -ForegroundColor Green
```

### macOS Recovery
```bash
#!/bin/bash
# recover-macos.sh

echo "🍎 Recovering macOS installation..."

# 1. Check Homebrew
if ! command -v brew &> /dev/null; then
    echo "Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

# 2. Find Node.js
if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    brew install node
fi

# 3. Find Claude
claude_paths=(
    "/opt/homebrew/bin/claude"
    "/usr/local/bin/claude"
    "$HOME/.npm-global/bin/claude"
    "$HOME/.claude/local/node_modules/.bin/claude"
)

claude_found=false
for path in "${claude_paths[@]}"; do
    if [ -f "$path" ]; then
        echo "✅ Found Claude at: $path"
        export CLAUDE_PATH="$path"
        claude_found=true
        break
    fi
done

if [ "$claude_found" = false ]; then
    echo "❌ Claude not found, installing..."
    npm install -g @anthropic/claude-cli
fi

# 4. Reset permissions
chmod +x "$CLAUDE_PATH"
xattr -cr "$CLAUDE_PATH"  # Remove quarantine

# 5. Reset to embedded
export USE_NATIVE_EXECUTION=false
export FALLBACK_TO_EMBEDDED=true

# 6. Rebuild
npm run build:mac

echo "✅ Recovery complete!"
```

---

## Post-Removal Maintenance

### After Successfully Removing Embedded Server

#### 1. Update Documentation
```markdown
# Migration Guide

## For Users Upgrading from v1.x (Embedded Server)

### Windows Users
1. Ensure Claude CLI is installed:
   - Native: `npm install -g @anthropic/claude-cli`
   - WSL: `npm install -g @anthropic/claude-cli` inside WSL

2. Set environment variable:
   - Native: `SET USE_WSL=false`
   - WSL: `SET USE_WSL=true`

### macOS Users
1. Install Claude CLI:
   ```bash
   npm install -g @anthropic/claude-cli
   ```

2. Add to PATH if needed:
   ```bash
   echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.zshrc
   ```

### Linux Users
1. Install Claude CLI with proper permissions:
   ```bash
   sudo npm install -g @anthropic/claude-cli
   ```
```

#### 2. Monitor Error Rates
```typescript
// Add telemetry for native execution
interface ExecutionError {
  platform: string;
  wsl: boolean;
  error: string;
  claudePath: string;
  args: string[];
  timestamp: Date;
}

class ErrorMonitor {
  private errors: ExecutionError[] = [];
  
  logError(error: ExecutionError) {
    this.errors.push(error);
    
    // Alert if error rate > 1%
    const recentErrors = this.errors.filter(
      e => Date.now() - e.timestamp.getTime() < 3600000
    );
    
    if (recentErrors.length > 10) {
      this.alertHighErrorRate(recentErrors);
    }
  }
  
  private alertHighErrorRate(errors: ExecutionError[]) {
    // Send to monitoring service
    console.error('HIGH ERROR RATE DETECTED:', {
      count: errors.length,
      platforms: [...new Set(errors.map(e => e.platform))],
      errors: errors.slice(0, 5),
    });
  }
}
```

#### 3. Support Scripts
```bash
#!/bin/bash
# diagnose-native-execution.sh

echo "Diagnosing Native Execution Issues"
echo "=================================="

# 1. Check Claude installation
echo -n "Claude CLI: "
if command -v claude &> /dev/null; then
    claude --version
else
    echo "NOT FOUND ❌"
fi

# 2. Check Node.js
echo -n "Node.js: "
node --version || echo "NOT FOUND ❌"

# 3. Check PATH
echo "PATH contains:"
echo "$PATH" | tr ':' '\n' | grep -E "(npm|node|claude)"

# 4. Test execution
echo "Testing Claude execution..."
echo "test" | claude --help &> /dev/null
if [ $? -eq 0 ]; then
    echo "✅ Claude execution successful"
else
    echo "❌ Claude execution failed"
fi

# 5. Platform-specific checks
if [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]]; then
    echo "Windows detected"
    
    # Check WSL
    if command -v wsl.exe &> /dev/null; then
        echo "WSL available"
        wsl.exe -e claude --version || echo "Claude not in WSL"
    fi
fi

# 6. Generate report
cat > diagnostic-report.txt << EOF
Diagnostic Report
Generated: $(date)
Platform: $OSTYPE
Claude: $(command -v claude || echo "not found")
Node: $(node --version || echo "not found")
PATH: $PATH
EOF

echo "Report saved to diagnostic-report.txt"
```

---

## Conclusion

### The Hard Truth About Removing the Embedded Server

**It's not just removing code - it's reimplementing 2+ years of platform-specific fixes and workarounds.**

The embedded server is technical debt, but it's **functional technical debt** that handles:
- 3 operating systems
- 2 Windows execution modes (native + WSL)
- Multiple Node.js installations
- Various Claude installation methods
- Path translation complexities
- Stream parsing edge cases
- Session recovery scenarios
- Real-time communication reliability

### Recommendation

1. **Don't remove it until you have 100% feature parity**
2. **Test on real users' machines, not just dev environments**
3. **Keep the embedded server as a fallback for at least 6 months**
4. **Monitor error rates closely after migration**
5. **Have a instant rollback plan ready**

### Remember

**Every line of that 5,680-line embedded server exists for a reason.** It might be ugly, but it works. Don't break what works unless you're absolutely certain the replacement is better in every way.