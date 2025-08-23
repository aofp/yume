# Claude CLI Invocation: The Complete Technical Reference

## This Document Contains EVERYTHING About How Claude CLI is Called

---

## 1. EXACT COMMAND CONSTRUCTION

### Basic Command Structure
```bash
# Minimal viable command
claude -p "prompt text here" --output-format stream-json

# Full command with all common flags
claude \
  --resume <session-id> \
  -p "prompt text" \
  --model claude-3-5-sonnet-20241022 \
  --output-format stream-json \
  --verbose \
  --dangerously-skip-permissions
```

### Claudia's Exact Implementation
```rust
// claudia/src-tauri/src/commands/claude.rs - Line 928-936
let args = vec![
    "-p".to_string(),                    // ALWAYS FIRST after resume
    prompt.clone(),                       // The actual prompt text
    "--model".to_string(),                // Model flag
    model.clone(),                        // Model identifier
    "--output-format".to_string(),        // REQUIRED for parsing
    "stream-json".to_string(),            // MUST be stream-json
    "--verbose".to_string(),              // Include metadata
    "--dangerously-skip-permissions".to_string(), // Skip approval prompts
];
```

### Yurucode's Current (BROKEN) Implementation
```javascript
// Inside embedded server string - Line 1050-1065
const args = [
    '-p', message,           // Prompt
    '--print',               // YURUCODE SPECIFIC - NEVER REMOVE
    '--output-format', 'stream-json',
    '--verbose',
    '--model', model || 'claude-3-5-sonnet-20241022'
];

if (isResuming) {
    args.unshift('--resume', session.claudeSessionId);
}
```

---

## 2. COMPLETE ARGUMENT MATRIX

### All Valid Argument Combinations

```bash
# NEW SESSION - Most Common
claude -p "write hello world" \
       --model claude-3-5-sonnet-20241022 \
       --output-format stream-json \
       --verbose

# RESUME SESSION - Critical for context
claude --resume abc-123-def-456 \
       -p "continue with the next function" \
       --model claude-3-5-sonnet-20241022 \
       --output-format stream-json \
       --verbose

# CONTINUE LAST - Simple continuation
claude -c \
       -p "add error handling" \
       --output-format stream-json

# WITH SYSTEM PROMPT OVERRIDE
claude -p "implement the function" \
       --system "You are an expert Rust developer" \
       --model claude-3-5-opus-20241022 \
       --output-format stream-json

# WITH TOKEN LIMITS
claude -p "summarize this file" \
       --max-tokens 4096 \
       --output-format stream-json

# WITH TEMPERATURE CONTROL
claude -p "generate creative solutions" \
       --temperature 0.9 \
       --top-p 0.95 \
       --output-format stream-json

# WITH MCP SERVERS
claude -p "analyze the database" \
       --enable-mcp \
       --mcp-server postgresql://localhost/mydb \
       --output-format stream-json
```

---

## 3. BINARY PATH DETECTION

### Claudia's Complete Path Detection
```rust
// claudia/src-tauri/src/claude_binary.rs
pub fn find_claude_binary(app_handle: &tauri::AppHandle) -> Result<String, String> {
    // 1. Check database for stored path
    if let Ok(stored_path) = get_stored_claude_path() {
        if PathBuf::from(&stored_path).exists() {
            return Ok(stored_path);
        }
    }
    
    // 2. Try 'which' command
    if let Ok(output) = Command::new("which").arg("claude").output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            // Handle aliased output: "claude: aliased to /path/to/claude"
            if path.starts_with("claude:") && path.contains("aliased to") {
                let actual_path = path.split("aliased to").nth(1).unwrap().trim();
                return Ok(actual_path.to_string());
            }
            return Ok(path);
        }
    }
    
    // 3. Check NVM installations (Node Version Manager)
    if let Ok(home) = env::var("HOME") {
        let nvm_dir = PathBuf::from(&home).join(".nvm/versions/node");
        if nvm_dir.exists() {
            for entry in fs::read_dir(&nvm_dir)? {
                let version_dir = entry?.path();
                let claude_path = version_dir.join("bin/claude");
                if claude_path.exists() {
                    return Ok(claude_path.to_string_lossy().to_string());
                }
            }
        }
    }
    
    // 4. Check standard locations IN ORDER
    const STANDARD_PATHS: &[&str] = &[
        "/usr/local/bin/claude",
        "/opt/homebrew/bin/claude",        // macOS M1/M2
        "~/.local/bin/claude",              // User installation
        "~/.claude/local/node_modules/.bin/claude", // Claude's own installation
        "~/.npm-global/bin/claude",         // npm global
        "~/.yarn/bin/claude",               // Yarn global
        "~/.bun/bin/claude",                // Bun
        "/usr/bin/claude",                  // System-wide
        "~/node_modules/.bin/claude",       // Local project
    ];
    
    for path in STANDARD_PATHS {
        let expanded = shellexpand::tilde(path).to_string();
        if PathBuf::from(&expanded).exists() {
            return Ok(expanded);
        }
    }
    
    Err("Claude binary not found".to_string())
}
```

### Platform-Specific Binary Locations

#### macOS
```bash
# Intel Mac
/usr/local/bin/claude
/usr/local/opt/claude/bin/claude

# Apple Silicon
/opt/homebrew/bin/claude
/opt/homebrew/opt/claude/bin/claude

# NVM (any Mac)
~/.nvm/versions/node/v20.10.0/bin/claude
~/.nvm/versions/node/v18.18.0/bin/claude

# Direct installation
~/.claude/local/node_modules/.bin/claude
```

#### Windows (via WSL)
```bash
# WSL paths
/home/<username>/.claude/local/node_modules/.bin/claude
/home/<username>/.npm-global/bin/claude
/usr/local/bin/claude

# Windows native (rare)
C:\Users\<username>\AppData\Roaming\npm\claude.cmd
C:\Program Files\nodejs\claude.cmd
```

#### Linux
```bash
# System packages
/usr/bin/claude
/usr/local/bin/claude

# Snap
/snap/bin/claude

# Flatpak
/var/lib/flatpak/exports/bin/claude

# User installations
~/.local/bin/claude
~/.npm-global/bin/claude
```

---

## 4. ENVIRONMENT VARIABLE SETUP

### Critical Environment Variables
```rust
fn create_command_with_env(program: &str) -> Command {
    let mut cmd = Command::new(program);
    
    // MUST preserve these for Claude to work
    for (key, value) in std::env::vars() {
        match key.as_str() {
            // Core system
            "PATH" => cmd.env("PATH", value),
            "HOME" => cmd.env("HOME", value),
            "USER" => cmd.env("USER", value),
            "SHELL" => cmd.env("SHELL", value),
            
            // Locale (affects output encoding)
            "LANG" => cmd.env("LANG", value),
            "LC_ALL" => cmd.env("LC_ALL", value),
            k if k.starts_with("LC_") => cmd.env(k, value),
            
            // Node.js paths
            "NODE_PATH" => cmd.env("NODE_PATH", value),
            "NODE_ENV" => cmd.env("NODE_ENV", value),
            
            // NVM support
            "NVM_DIR" => cmd.env("NVM_DIR", value),
            "NVM_BIN" => cmd.env("NVM_BIN", value),
            "NVM_INC" => cmd.env("NVM_INC", value),
            
            // Homebrew (macOS)
            "HOMEBREW_PREFIX" => cmd.env("HOMEBREW_PREFIX", value),
            "HOMEBREW_CELLAR" => cmd.env("HOMEBREW_CELLAR", value),
            "HOMEBREW_REPOSITORY" => cmd.env("HOMEBREW_REPOSITORY", value),
            
            // Terminal info (for color output)
            "TERM" => cmd.env("TERM", value),
            "COLORTERM" => cmd.env("COLORTERM", value),
            
            // Claude-specific
            "ANTHROPIC_API_KEY" => cmd.env("ANTHROPIC_API_KEY", value),
            "CLAUDE_HOME" => cmd.env("CLAUDE_HOME", value),
            "CLAUDE_CONFIG" => cmd.env("CLAUDE_CONFIG", value),
            
            _ => {} // Skip others
        }
    }
    
    // Special handling for NVM paths
    if program.contains("/.nvm/versions/node/") {
        if let Some(node_bin_dir) = Path::new(program).parent() {
            let current_path = env::var("PATH").unwrap_or_default();
            let node_bin_str = node_bin_dir.to_string_lossy();
            
            // Prepend NVM bin to PATH if not already there
            if !current_path.contains(&node_bin_str.as_ref()) {
                let new_path = format!("{}:{}", node_bin_str, current_path);
                cmd.env("PATH", new_path);
            }
        }
    }
    
    cmd
}
```

---

## 5. WORKING DIRECTORY HANDLING

### Setting Working Directory is CRITICAL
```rust
// ALWAYS set working directory - Claude uses it for relative paths
let mut cmd = Command::new(claude_binary);
cmd.current_dir(project_path)  // <-- CRITICAL
   .stdout(Stdio::piped())
   .stderr(Stdio::piped());
```

### Platform-Specific Path Translation

#### Windows to WSL Path Conversion
```rust
fn windows_to_wsl_path(windows_path: &str) -> String {
    // C:\Users\Name\Project -> /mnt/c/Users/Name/Project
    let path = windows_path.replace('\\', '/');
    
    // Handle drive letters
    if path.starts_with("C:") {
        path.replace("C:", "/mnt/c")
    } else if path.starts_with("D:") {
        path.replace("D:", "/mnt/d")
    } else if path.starts_with("E:") {
        path.replace("E:", "/mnt/e")
    } else {
        // Network path \\server\share -> /mnt/server/share
        if path.starts_with("//") {
            path.replace("//", "/mnt/")
        } else {
            path
        }
    }
}
```

#### WSL Command Construction
```javascript
// Yurucode's WSL wrapper (embedded server)
function createWslClaudeCommand(args, workingDir, message) {
    const wslPath = 'C:\\Windows\\System32\\wsl.exe';
    
    // Get WSL username
    let wslUser = execSync(`${wslPath} -e bash -c "whoami"`).trim();
    
    // Find Claude in WSL
    const claudePaths = [
        `/home/${wslUser}/.claude/local/node_modules/.bin/claude`,
        `/home/${wslUser}/.npm-global/bin/claude`,
        `/usr/local/bin/claude`
    ];
    
    let claudePath = null;
    for (const path of claudePaths) {
        const exists = execSync(
            `${wslPath} -e bash -c "[ -f '${path}' ] && echo 'yes' || echo 'no'"`
        ).trim();
        if (exists === 'yes') {
            claudePath = path;
            break;
        }
    }
    
    // Build command
    const argsStr = args.map(arg => {
        // Quote arguments with spaces
        if (arg.includes(' ')) {
            return `'${arg.replace(/'/g, "'\\''")}'`;
        }
        return arg;
    }).join(' ');
    
    const script = `cd '${workingDir}' && ${claudePath} ${argsStr}`;
    
    return [wslPath, ['-e', 'bash', '-c', script]];
}
```

---

## 6. PROCESS SPAWNING PATTERNS

### Rust (Claudia) - tokio::process
```rust
use tokio::process::{Command, Child};

async fn spawn_claude(
    binary_path: &str,
    args: Vec<String>,
    working_dir: &str,
) -> Result<Child, String> {
    let mut cmd = Command::new(binary_path);
    
    // Add all arguments
    for arg in args {
        cmd.arg(arg);
    }
    
    // Set working directory
    cmd.current_dir(working_dir);
    
    // CRITICAL: Pipe stdout/stderr for streaming
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    
    // OPTIONAL: Set stdin for interactive mode
    cmd.stdin(Stdio::piped());
    
    // Spawn the process
    let child = cmd.spawn()
        .map_err(|e| format!("Failed to spawn Claude: {}", e))?;
    
    Ok(child)
}
```

### Node.js (Yurucode) - child_process
```javascript
const { spawn } = require('child_process');

function spawnClaude(args, workingDir) {
    const claudePath = findClaudeBinary();
    
    const child = spawn(claudePath, args, {
        cwd: workingDir,
        env: {
            ...process.env,
            // Ensure Node can be found
            PATH: `${process.env.PATH}:${path.dirname(claudePath)}`
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        
        // Windows-specific
        shell: false,
        windowsHide: true,
        
        // CRITICAL: Increase buffer size for large outputs
        maxBuffer: 50 * 1024 * 1024  // 50MB
    });
    
    return child;
}
```

---

## 7. STDIN HANDLING FOR PROMPTS

### Sending Prompts via STDIN (Alternative Method)
```rust
// Some cases require sending prompt via stdin instead of -p flag
async fn send_prompt_via_stdin(
    child: &mut Child,
    prompt: &str,
) -> Result<()> {
    let stdin = child.stdin.as_mut()
        .ok_or("Failed to get stdin")?;
    
    // Write prompt to stdin
    stdin.write_all(prompt.as_bytes()).await?;
    stdin.write_all(b"\n").await?;  // End with newline
    
    // CRITICAL: Close stdin to signal end of input
    drop(stdin);
    
    Ok(())
}
```

### Title Generation Pattern (Special Case)
```javascript
// Yurucode's title generation uses different args
const titleArgs = [
    '--print',  // Different from normal execution
    '--output-format', 'json',  // Not stream-json
    '--model', 'claude-3-5-sonnet-20241022'
];

// Send prompt via stdin for title generation
const child = spawn(claudePath, titleArgs);
child.stdin.write(prompt);
child.stdin.end();
```

---

## 8. REAL COMMAND EXAMPLES

### Example 1: New Session
```bash
# Actual command executed
/opt/homebrew/bin/claude \
  -p "Write a Rust function to parse JSON" \
  --model claude-3-5-sonnet-20241022 \
  --output-format stream-json \
  --verbose \
  --dangerously-skip-permissions

# Working directory: /Users/username/my-project
```

### Example 2: Resume Session
```bash
# Actual command executed
/opt/homebrew/bin/claude \
  --resume 550e8400-e29b-41d4-a716-446655440000 \
  -p "Add error handling to the function" \
  --model claude-3-5-sonnet-20241022 \
  --output-format stream-json \
  --verbose

# Working directory: /Users/username/my-project
```

### Example 3: Continue Last
```bash
# Actual command executed
/opt/homebrew/bin/claude \
  -c \
  -p "Now add tests for the function" \
  --output-format stream-json \
  --verbose

# Working directory: /Users/username/my-project
```

### Example 4: WSL on Windows
```bash
# Windows command
C:\Windows\System32\wsl.exe -e bash -c "cd '/mnt/c/Users/Name/project' && /home/wsluser/.claude/local/node_modules/.bin/claude -p 'Write hello world' --model claude-3-5-sonnet-20241022 --output-format stream-json --verbose"
```

---

## 9. EXIT CODES & THEIR MEANINGS

```rust
// Claude CLI exit codes
match exit_code {
    0 => "Success",
    1 => "Session not found (for --resume)",
    2 => "Invalid arguments",
    3 => "API error",
    4 => "Permission denied",
    5 => "Timeout",
    6 => "Out of memory",
    127 => "Command not found (binary path wrong)",
    130 => "Interrupted (Ctrl+C)",
    137 => "Killed (SIGKILL)",
    139 => "Segmentation fault",
    _ => "Unknown error"
}
```

---

## 10. COMPLETE SPAWN FUNCTION

### The EXACT Pattern You Should Implement
```rust
pub async fn execute_claude_command(
    project_path: String,
    prompt: String,
    model: String,
    resume_session_id: Option<String>,
) -> Result<(), String> {
    // 1. Find binary
    let claude_binary = find_claude_binary()?;
    
    // 2. Build arguments IN ORDER
    let mut args = Vec::new();
    
    // Resume MUST come first if present
    if let Some(session_id) = resume_session_id {
        args.push("--resume".to_string());
        args.push(session_id);
    }
    
    // Prompt and model
    args.push("-p".to_string());
    args.push(prompt);
    args.push("--model".to_string());
    args.push(model);
    
    // REQUIRED flags
    args.push("--output-format".to_string());
    args.push("stream-json".to_string());
    args.push("--verbose".to_string());
    
    // Optional but recommended
    args.push("--dangerously-skip-permissions".to_string());
    
    // 3. Create command
    let mut cmd = Command::new(&claude_binary);
    
    // Add arguments
    for arg in args {
        cmd.arg(arg);
    }
    
    // 4. Set working directory (CRITICAL)
    cmd.current_dir(&project_path);
    
    // 5. Set up pipes
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    cmd.stdin(Stdio::null());  // We're not using stdin
    
    // 6. Set environment
    cmd.env("PATH", std::env::var("PATH").unwrap_or_default());
    cmd.env("HOME", std::env::var("HOME").unwrap_or_default());
    
    // 7. Spawn
    let mut child = cmd.spawn()
        .map_err(|e| format!("Failed to spawn Claude: {}", e))?;
    
    // 8. Get output handles
    let stdout = child.stdout.take().ok_or("Failed to get stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to get stderr")?;
    
    // 9. Process streams (separate tasks)
    let stdout_task = tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            // Process each line
            println!("STDOUT: {}", line);
        }
    });
    
    let stderr_task = tokio::spawn(async move {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            // Process errors
            eprintln!("STDERR: {}", line);
        }
    });
    
    // 10. Wait for completion
    let status = child.wait().await
        .map_err(|e| format!("Failed to wait for Claude: {}", e))?;
    
    // 11. Check exit code
    if !status.success() {
        return Err(format!("Claude exited with status: {}", status));
    }
    
    Ok(())
}
```

---

## CRITICAL IMPLEMENTATION NOTES

1. **NEVER forget `--output-format stream-json`** - Without it, you can't parse output
2. **ALWAYS set working directory** - Claude uses it for all file operations
3. **--resume MUST be first argument** if resuming
4. **Order matters**: resume → prompt → model → format → other flags
5. **Pipe stdout AND stderr** - Errors come on stderr
6. **Handle exit codes properly** - Code 1 means session not found
7. **Preserve PATH environment variable** - Claude needs to find Node.js
8. **Use full binary path** - Don't rely on PATH lookup
9. **Increase buffer size** for large outputs
10. **Close stdin if not using it** - Prevents hanging

This is EVERYTHING about how Claude CLI is called. Every flag, every environment variable, every platform quirk.