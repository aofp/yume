# Claude CLI Arguments: Complete Reference & Implementation Guide

## Table of Contents
1. [All CLI Flags & Arguments](#all-cli-flags--arguments)
2. [Argument Combinations & Order](#argument-combinations--order)
3. [Platform-Specific Considerations](#platform-specific-considerations)
4. [Error Codes & Recovery](#error-codes--recovery)
5. [Hidden & Undocumented Flags](#hidden--undocumented-flags)
6. [Implementation Patterns](#implementation-patterns)

---

## All CLI Flags & Arguments

### Core Command Flags

```bash
# Basic execution
claude -p "prompt"                    # Execute with prompt
claude -c                            # Continue last conversation
claude --resume <session-id>         # Resume specific session
claude --continue                    # Continue mode (interactive)

# Model selection
claude --model claude-3-5-sonnet-20241022    # Sonnet (default)
claude --model claude-3-5-opus-20241022       # Opus (more capable)
claude --model claude-3-haiku-20240307        # Haiku (faster)

# Output formatting
claude --output-format stream-json    # REQUIRED for programmatic use
claude --output-format json          # Single JSON response
claude --output-format text          # Human readable (default)
claude --output-format markdown      # Markdown formatting

# Verbosity & debugging
claude --verbose                     # Include metadata in output
claude --debug                       # Debug information
claude --quiet                       # Minimal output
claude --no-color                    # Disable color output

# Permissions & safety
claude --dangerously-skip-permissions  # Auto-approve all tools
claude --no-tools                      # Disable tool use
claude --require-approval              # Require approval for each tool
claude --safe-mode                     # Restrict dangerous operations

# Session management
claude --list-sessions                 # List available sessions
claude --delete-session <id>           # Delete a session
claude --export-session <id>           # Export session as JSONL
claude --import-session <file>         # Import session from JSONL

# Configuration
claude --config <path>                 # Use specific config file
claude --no-config                     # Skip config loading
claude --api-key <key>                 # Override API key
claude --base-url <url>               # Override API endpoint

# Advanced features
claude --max-tokens <n>                # Maximum response tokens
claude --temperature <0.0-1.0>         # Response randomness
claude --top-p <0.0-1.0>              # Nucleus sampling
claude --stop-sequence <seq>           # Stop generation at sequence
claude --system <prompt>               # System prompt override
claude --context-window <n>            # Override context window size

# Experimental/Hidden
claude --enable-mcp                    # Enable Model Context Protocol
claude --mcp-server <config>          # MCP server configuration
claude --enable-agents                 # Enable agent framework
claude --checkpoint                   # Create checkpoint after execution
claude --fork-from <checkpoint-id>    # Fork from checkpoint
```

### Critical Implementation Details

#### 1. --output-format stream-json

**What it provides:**
```jsonl
{"type":"system","subtype":"init","session_id":"abc-123","model":"claude-3-5-sonnet-20241022","tools":["read","write","bash"],"timestamp":"2024-01-15T10:00:00Z"}
{"type":"user","message":{"role":"user","content":"Write hello world"},"timestamp":"2024-01-15T10:00:01Z"}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"I'll write a hello world program."}]},"streaming":true}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"tool_1","name":"Write","input":{"file_path":"hello.py","content":"print('Hello, World!')"}}]},"streaming":false}
{"type":"result","result":"success","duration_ms":1234,"usage":{"input_tokens":100,"output_tokens":50}}
```

**Parsing pattern:**
```rust
#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ClaudeMessage {
    System {
        subtype: SystemSubtype,
        session_id: Option<String>,
        model: Option<String>,
        tools: Option<Vec<String>>,
    },
    User {
        message: Message,
    },
    Assistant {
        message: Message,
        streaming: Option<bool>,
    },
    Result {
        result: String,
        duration_ms: Option<u64>,
        usage: Option<Usage>,
    },
    Error {
        error: String,
        code: Option<i32>,
    },
}

fn parse_stream_line(line: &str) -> Result<ClaudeMessage> {
    serde_json::from_str(line)
        .with_context(|| format!("Failed to parse: {}", line))
}
```

#### 2. --resume vs -c (Continue)

**--resume <session-id>:**
- Restores COMPLETE session state from Claude's storage
- Requires valid session ID that exists in ~/.claude/projects
- Maintains full context including tool history
- Can resume after days/weeks

**-c (Continue):**
- Continues the LAST conversation in current directory
- Looks for most recent session in project
- Fails if no previous session exists
- Simpler but less flexible

```rust
// Implementation difference
fn get_resume_args(mode: ResumeMode) -> Vec<String> {
    match mode {
        ResumeMode::Resume(session_id) => {
            vec!["--resume".to_string(), session_id]
        }
        ResumeMode::Continue => {
            vec!["-c".to_string()]
        }
    }
}
```

#### 3. --dangerously-skip-permissions

**What it does:**
- Auto-approves ALL tool use without prompting
- Skips confirmation for file writes, deletions, bash commands
- DANGEROUS in production but necessary for automation

**Safe implementation:**
```rust
pub struct PermissionManager {
    auto_approve: bool,
    whitelist: Vec<String>,
    blacklist: Vec<String>,
}

impl PermissionManager {
    pub fn should_approve(&self, tool: &str, params: &Value) -> bool {
        // Never auto-approve destructive operations
        if tool == "bash" {
            if let Some(cmd) = params["command"].as_str() {
                if cmd.contains("rm -rf") || cmd.contains("sudo") {
                    return false;  // Always require approval
                }
            }
        }
        
        if self.blacklist.contains(&tool.to_string()) {
            return false;
        }
        
        if self.whitelist.contains(&tool.to_string()) {
            return true;
        }
        
        self.auto_approve
    }
}
```

---

## Argument Combinations & Order

### Valid Combinations

```bash
# New session with model selection
claude -p "prompt" --model claude-3-5-opus-20241022 --output-format stream-json

# Resume with new prompt
claude --resume <id> -p "continue with this" --output-format stream-json

# Continue with model switch (creates new session)
claude -c --model claude-3-5-sonnet-20241022

# Debug mode with verbose output
claude -p "prompt" --verbose --debug --output-format stream-json
```

### Invalid Combinations

```bash
# INVALID: Can't resume and continue
claude --resume <id> -c

# INVALID: Can't use multiple output formats
claude --output-format json --output-format stream-json

# INVALID: Conflicting permission modes
claude --dangerously-skip-permissions --require-approval

# INVALID: Resume without prompt
claude --resume <id>  # Need -p flag
```

### Argument Order Requirements

```rust
// CRITICAL: Order matters for some arguments
fn build_claude_args(params: &ExecuteParams) -> Vec<String> {
    let mut args = Vec::new();
    
    // 1. Resume/continue MUST come first
    if let Some(session_id) = &params.resume_id {
        args.push("--resume".to_string());
        args.push(session_id.clone());
    } else if params.continue_mode {
        args.push("-c".to_string());
    }
    
    // 2. Prompt MUST come before model
    args.push("-p".to_string());
    args.push(params.prompt.clone());
    
    // 3. Model selection
    args.push("--model".to_string());
    args.push(params.model.clone());
    
    // 4. Output format
    args.push("--output-format".to_string());
    args.push("stream-json".to_string());
    
    // 5. Flags can come in any order
    if params.verbose {
        args.push("--verbose".to_string());
    }
    
    if params.skip_permissions {
        args.push("--dangerously-skip-permissions".to_string());
    }
    
    args
}
```

---

## Platform-Specific Considerations

### Windows/WSL Requirements

```rust
#[cfg(target_os = "windows")]
fn prepare_claude_command(args: Vec<String>, working_dir: &str) -> Command {
    // Must use WSL for Claude on Windows
    let mut cmd = Command::new("wsl.exe");
    
    // Convert Windows path to WSL path
    let wsl_path = windows_to_wsl_path(working_dir);
    
    // Build WSL command
    cmd.arg("-e")
       .arg("bash")
       .arg("-c")
       .arg(format!(
           "cd '{}' && claude {}",
           wsl_path,
           args.join(" ")
       ));
    
    cmd
}

fn windows_to_wsl_path(path: &str) -> String {
    // C:\Users\Name\Project -> /mnt/c/Users/Name/Project
    path.replace('\\', "/")
        .replace("C:", "/mnt/c")
        .replace("D:", "/mnt/d")
}
```

### macOS Homebrew Paths

```rust
#[cfg(target_os = "macos")]
fn find_claude_binary() -> Result<String> {
    // Check Homebrew installations
    const HOMEBREW_PATHS: &[&str] = &[
        "/opt/homebrew/bin/claude",      // Apple Silicon
        "/usr/local/bin/claude",          // Intel
        "/usr/local/opt/claude/bin/claude",
    ];
    
    for path in HOMEBREW_PATHS {
        if PathBuf::from(path).exists() {
            return Ok(path.to_string());
        }
    }
    
    // Check NVM installations
    find_nvm_claude()
}
```

### Linux Snap/Flatpak

```rust
#[cfg(target_os = "linux")]
fn find_claude_binary() -> Result<String> {
    // Check Snap
    if let Ok(output) = Command::new("snap").arg("list").output() {
        if String::from_utf8_lossy(&output.stdout).contains("claude") {
            return Ok("/snap/bin/claude".to_string());
        }
    }
    
    // Check Flatpak
    if PathBuf::from("/var/lib/flatpak/exports/bin/claude").exists() {
        return Ok("/var/lib/flatpak/exports/bin/claude".to_string());
    }
    
    // Standard locations
    Ok("/usr/local/bin/claude".to_string())
}
```

---

## Error Codes & Recovery

### Claude Exit Codes

```rust
#[derive(Debug)]
enum ClaudeExitCode {
    Success = 0,
    SessionNotFound = 1,
    InvalidArguments = 2,
    ApiError = 3,
    PermissionDenied = 4,
    Timeout = 5,
    OutOfMemory = 6,
    Interrupted = 130,  // Ctrl+C
    Killed = 137,       // SIGKILL
}

fn handle_claude_exit(status: ExitStatus) -> Result<()> {
    match status.code() {
        Some(0) => Ok(()),
        Some(1) => {
            // Session not found - try creating new
            Err(anyhow!("Session not found. Creating new session."))
        }
        Some(2) => {
            // Invalid arguments - log and fail
            Err(anyhow!("Invalid arguments provided to Claude"))
        }
        Some(3) => {
            // API error - retry with backoff
            Err(anyhow!("API error. Retrying..."))
        }
        Some(130) => {
            // User interrupted - clean exit
            Ok(())
        }
        Some(code) => {
            Err(anyhow!("Claude exited with code: {}", code))
        }
        None => {
            // Killed by signal
            Err(anyhow!("Claude terminated by signal"))
        }
    }
}
```

### Recovery Strategies

```rust
pub struct ClaudeExecutor {
    max_retries: u32,
    retry_delay: Duration,
}

impl ClaudeExecutor {
    pub async fn execute_with_retry(&self, params: ExecuteParams) -> Result<()> {
        let mut attempts = 0;
        let mut delay = self.retry_delay;
        
        loop {
            match self.execute_once(params.clone()).await {
                Ok(()) => return Ok(()),
                Err(e) if attempts < self.max_retries => {
                    // Determine if error is retryable
                    if is_retryable_error(&e) {
                        log::warn!("Attempt {} failed: {}. Retrying in {:?}", 
                            attempts + 1, e, delay);
                        
                        tokio::time::sleep(delay).await;
                        
                        // Exponential backoff
                        delay *= 2;
                        attempts += 1;
                        
                        // Modify params for retry
                        if e.to_string().contains("Session not found") {
                            // Clear resume ID for next attempt
                            params.resume_id = None;
                        }
                    } else {
                        return Err(e);
                    }
                }
                Err(e) => return Err(e),
            }
        }
    }
    
    fn is_retryable_error(&self, error: &anyhow::Error) -> bool {
        let msg = error.to_string();
        msg.contains("API error") ||
        msg.contains("timeout") ||
        msg.contains("Session not found") ||
        msg.contains("rate limit")
    }
}
```

---

## Hidden & Undocumented Flags

### Discovered Through Testing

```bash
# Performance profiling
claude --profile                      # Generate performance profile
claude --trace                        # Detailed execution trace
claude --measure-tokens               # Token counting debug

# Internal testing
claude --dry-run                      # Don't execute, just validate
claude --replay <session-id>          # Replay session for testing
claude --benchmark                    # Run performance benchmarks

# Advanced context control
claude --inject-context <file>        # Inject additional context
claude --context-strategy <strategy>  # Context management strategy
claude --cache-strategy <strategy>    # Cache optimization strategy

# Experimental features
claude --enable-streaming-tools       # Stream tool execution
claude --parallel-tools               # Execute tools in parallel
claude --speculative-execution        # Speculative tool execution
```

### Implementation Discovery Pattern

```rust
// Discover available flags programmatically
fn discover_claude_flags() -> Vec<String> {
    let output = Command::new("claude")
        .arg("--help")
        .arg("--show-hidden")  // May reveal hidden flags
        .output()
        .expect("Failed to run claude");
    
    let help_text = String::from_utf8_lossy(&output.stdout);
    
    // Parse flags from help text
    let mut flags = Vec::new();
    for line in help_text.lines() {
        if line.starts_with("  --") || line.starts_with("  -") {
            if let Some(flag) = line.split_whitespace().next() {
                flags.push(flag.to_string());
            }
        }
    }
    
    flags
}
```

---

## Implementation Patterns

### Pattern 1: Argument Builder

```rust
pub struct ClaudeArgsBuilder {
    args: Vec<String>,
}

impl ClaudeArgsBuilder {
    pub fn new() -> Self {
        Self { args: Vec::new() }
    }
    
    pub fn resume(mut self, session_id: Option<String>) -> Self {
        if let Some(id) = session_id {
            self.args.push("--resume".to_string());
            self.args.push(id);
        }
        self
    }
    
    pub fn prompt(mut self, prompt: String) -> Self {
        self.args.push("-p".to_string());
        self.args.push(prompt);
        self
    }
    
    pub fn model(mut self, model: Model) -> Self {
        self.args.push("--model".to_string());
        self.args.push(model.to_string());
        self
    }
    
    pub fn output_format(mut self, format: OutputFormat) -> Self {
        self.args.push("--output-format".to_string());
        self.args.push(format.to_string());
        self
    }
    
    pub fn verbose(mut self, verbose: bool) -> Self {
        if verbose {
            self.args.push("--verbose".to_string());
        }
        self
    }
    
    pub fn build(self) -> Vec<String> {
        // Validate required arguments
        if !self.args.contains(&"-p".to_string()) {
            panic!("Prompt is required");
        }
        
        // Ensure stream-json for programmatic use
        if !self.args.contains(&"stream-json".to_string()) {
            self.args.push("--output-format".to_string());
            self.args.push("stream-json".to_string());
        }
        
        self.args
    }
}

// Usage
let args = ClaudeArgsBuilder::new()
    .resume(Some(session_id))
    .prompt("Continue working".to_string())
    .model(Model::Sonnet)
    .verbose(true)
    .build();
```

### Pattern 2: Argument Validation

```rust
pub struct ArgumentValidator;

impl ArgumentValidator {
    pub fn validate(args: &[String]) -> Result<()> {
        // Check for required arguments
        if !args.contains(&"-p".to_string()) && 
           !args.iter().any(|a| a.starts_with("-p=")) {
            return Err(anyhow!("Missing required prompt (-p)"));
        }
        
        // Check for conflicting arguments
        if args.contains(&"--resume".to_string()) && 
           args.contains(&"-c".to_string()) {
            return Err(anyhow!("Cannot use --resume and -c together"));
        }
        
        // Validate argument values
        if let Some(model_idx) = args.iter().position(|a| a == "--model") {
            if let Some(model) = args.get(model_idx + 1) {
                if !is_valid_model(model) {
                    return Err(anyhow!("Invalid model: {}", model));
                }
            }
        }
        
        Ok(())
    }
    
    fn is_valid_model(model: &str) -> bool {
        matches!(model,
            "claude-3-5-sonnet-20241022" |
            "claude-3-5-opus-20241022" |
            "claude-3-haiku-20240307"
        )
    }
}
```

### Pattern 3: Dynamic Argument Injection

```rust
pub trait ArgumentInjector {
    fn inject(&self, args: &mut Vec<String>);
}

pub struct DebugInjector;
impl ArgumentInjector for DebugInjector {
    fn inject(&self, args: &mut Vec<String>) {
        if std::env::var("DEBUG").is_ok() {
            args.push("--verbose".to_string());
            args.push("--debug".to_string());
        }
    }
}

pub struct SafetyInjector;
impl ArgumentInjector for SafetyInjector {
    fn inject(&self, args: &mut Vec<String>) {
        if std::env::var("CLAUDE_SAFE_MODE").is_ok() {
            // Remove dangerous flags
            args.retain(|a| a != "--dangerously-skip-permissions");
            // Add safety flags
            args.push("--require-approval".to_string());
        }
    }
}

// Usage
let mut args = base_args();
DebugInjector.inject(&mut args);
SafetyInjector.inject(&mut args);
```

---

## Testing Argument Combinations

```rust
#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_all_argument_combinations() {
        let test_cases = vec![
            // (args, should_succeed, description)
            (vec!["-p", "test"], true, "Basic prompt"),
            (vec!["--resume", "id", "-p", "test"], true, "Resume with prompt"),
            (vec!["-c"], false, "Continue without prompt"),
            (vec!["--resume", "id", "-c"], false, "Conflicting resume/continue"),
            (vec!["-p", "test", "--model", "invalid"], false, "Invalid model"),
        ];
        
        for (args, should_succeed, description) in test_cases {
            let result = ArgumentValidator::validate(&args.iter().map(|s| s.to_string()).collect::<Vec<_>>());
            assert_eq!(result.is_ok(), should_succeed, "Failed: {}", description);
        }
    }
    
    #[tokio::test]
    async fn test_argument_ordering() {
        let correct_order = vec![
            "--resume", "session-id",
            "-p", "prompt",
            "--model", "claude-3-5-sonnet-20241022",
            "--output-format", "stream-json",
            "--verbose"
        ];
        
        let result = execute_with_args(correct_order).await;
        assert!(result.is_ok());
        
        let wrong_order = vec![
            "--model", "claude-3-5-sonnet-20241022",
            "--resume", "session-id",  // Resume should be first
            "-p", "prompt"
        ];
        
        let result = execute_with_args(wrong_order).await;
        // Should still work but may have issues
    }
}
```

---

## Summary

Critical implementation points for CLI arguments:

1. **Always use `--output-format stream-json`** for programmatic parsing
2. **Order matters**: resume/continue → prompt → model → format → flags
3. **Platform differences**: Windows requires WSL wrapper
4. **Error handling**: Different strategies for different exit codes
5. **Validation**: Check for conflicts and required arguments
6. **Safety**: Never auto-approve destructive operations
7. **Testing**: Test all argument combinations

The argument system is the interface between your UI and Claude. Get it wrong and nothing works. Get it right and you have a powerful, flexible system.