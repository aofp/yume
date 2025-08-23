# Claude CLI Argument Ordering - CRITICAL Documentation

## The Most Important Rule: Argument Order MATTERS

Claude CLI is **extremely sensitive** to argument order. Wrong order = silent failures or hangs.

## Correct Argument Order (MUST FOLLOW)

```bash
claude [RESUME] [PROMPT] [MODEL] [OUTPUT] [FLAGS] [SYSTEM]

1. --resume SESSION_ID     (if resuming)
2. --prompt "text"         (or stdin if not provided)
3. --model MODEL_NAME      (optional, has default)
4. --output-format FORMAT  (required for programmatic use)
5. --verbose              (optional)
6. --print                (REQUIRED for non-interactive)
7. --dangerously-skip-permissions (optional, macOS)
8. --append-system-prompt  (optional, custom system prompt)
```

## Examples of CORRECT Ordering

### New Session
```bash
claude \
  --prompt "Hello Claude" \
  --model claude-3-5-sonnet-20241022 \
  --output-format stream-json \
  --verbose \
  --print
```

### Resume Session
```bash
claude \
  --resume abc123def456ghi789jkl012mno \
  --prompt "Continue working on this" \
  --model claude-3-5-sonnet-20241022 \
  --output-format stream-json \
  --verbose \
  --print
```

### With System Prompt
```bash
claude \
  --prompt "Analyze this" \
  --output-format stream-json \
  --print \
  --append-system-prompt "You are an expert code reviewer"
```

## Examples of WRONG Ordering (Will Fail!)

### ❌ WRONG: --print before --output-format
```bash
claude --prompt "Hello" --print --output-format stream-json
# May hang or produce wrong output format
```

### ❌ WRONG: --resume after --prompt
```bash
claude --prompt "Hello" --resume abc123 --output-format stream-json --print
# Resume flag ignored, starts new session instead!
```

### ❌ WRONG: Model after output format
```bash
claude --prompt "Hello" --output-format stream-json --model claude-3-5-sonnet-20241022 --print
# May use wrong model or fail
```

## Platform-Specific Ordering

### macOS
```bash
claude \
  --prompt "$PROMPT" \
  --output-format stream-json \
  --verbose \
  --print \
  --dangerously-skip-permissions  # macOS specific flag at end
```

### Windows (via WSL)
```bash
wsl.exe -e bash -c "claude \
  --prompt '$PROMPT' \
  --output-format stream-json \
  --verbose \
  --print"
```

### Linux
```bash
claude \
  --prompt "$PROMPT" \
  --output-format stream-json \
  --verbose \
  --print
```

## Implementation in Code

### Rust (Claudia's Correct Pattern)
```rust
fn build_claude_args(
    prompt: &str,
    session_id: Option<&str>,
    model: &str,
) -> Vec<String> {
    let mut args = Vec::new();
    
    // 1. Resume MUST come first
    if let Some(id) = session_id {
        args.push("--resume".to_string());
        args.push(id.to_string());
    }
    
    // 2. Prompt comes next
    args.push("--prompt".to_string());
    args.push(prompt.to_string());
    
    // 3. Model specification
    args.push("--model".to_string());
    args.push(model.to_string());
    
    // 4. Output format
    args.push("--output-format".to_string());
    args.push("stream-json".to_string());
    
    // 5. Verbose flag
    args.push("--verbose".to_string());
    
    // 6. Print flag LAST (most important!)
    args.push("--print".to_string());
    
    args
}
```

### JavaScript (Yurucode's Current Pattern - Has Issues)
```javascript
// CURRENT (WRONG ORDER)
const args = [
  '--print',  // WRONG: Should be after output-format
  '--output-format', 'stream-json',
  '--verbose',
  '--dangerously-skip-permissions'
];

if (resumeId) {
  args.push('--resume', resumeId);  // WRONG: Resume should be FIRST
}

// CORRECT ORDER
const args = [];

// Resume MUST be first
if (resumeId) {
  args.push('--resume', resumeId);
}

// Prompt next (if using args instead of stdin)
if (prompt) {
  args.push('--prompt', prompt);
}

// Then model
args.push('--model', model);

// Output format
args.push('--output-format', 'stream-json');

// Verbose
args.push('--verbose');

// Print MUST be last of the core flags
args.push('--print');

// Platform-specific flags at the very end
if (process.platform === 'darwin') {
  args.push('--dangerously-skip-permissions');
}
```

## Special Cases and Edge Cases

### 1. Empty Prompt
```bash
# WRONG - Will hang waiting for input
claude --output-format stream-json --print

# RIGHT - Use explicit empty prompt
claude --prompt "" --output-format stream-json --print

# OR - Provide via stdin
echo "" | claude --output-format stream-json --print
```

### 2. Very Long Prompts
```bash
# For prompts > 32KB on Windows, MUST use stdin
echo "$LONG_PROMPT" | claude \
  --output-format stream-json \
  --verbose \
  --print

# DO NOT use --prompt with long text on Windows
# ARG_MAX limits: Windows (32KB), macOS (256KB), Linux (128KB-2MB)
```

### 3. Special Characters in Prompt
```bash
# WRONG - Unescaped quotes break parsing
claude --prompt "She said "hello"" --output-format stream-json --print

# RIGHT - Properly escaped
claude --prompt "She said \"hello\"" --output-format stream-json --print

# BEST - Use stdin for complex content
echo 'She said "hello"' | claude --output-format stream-json --print
```

### 4. Multiple System Prompts
```bash
# WRONG - Multiple --append-system-prompt flags
claude \
  --prompt "Hello" \
  --append-system-prompt "Be concise" \
  --append-system-prompt "Be helpful" \  # Second one ignored!
  --output-format stream-json \
  --print

# RIGHT - Combine into one
claude \
  --prompt "Hello" \
  --append-system-prompt "Be concise. Be helpful." \
  --output-format stream-json \
  --print
```

## Model Name Formats

### Current Models (as of January 2025)
```bash
# Sonnet (default, fastest for coding)
--model claude-3-5-sonnet-20241022

# Opus (most capable)
--model claude-3-opus-20240229

# Haiku (fastest, cheapest)
--model claude-3-haiku-20240307

# Legacy models (may still work)
--model claude-3-sonnet-20240229
--model claude-2.1
--model claude-2.0
```

## Output Format Options

```bash
# For programmatic use (RECOMMENDED)
--output-format stream-json   # Streaming JSON lines
--output-format json          # Single JSON response

# For human reading
--output-format text          # Plain text (default)
--output-format markdown      # Formatted markdown

# Special formats
--output-format diff          # Diff format for code changes
--output-format xml           # XML structured output
```

## Critical Flags Explained

### --print (MOST IMPORTANT)
```bash
# WITHOUT --print: Claude enters interactive mode
claude --prompt "Hello"  # HANGS waiting for interactive input!

# WITH --print: Claude runs and exits
claude --prompt "Hello" --print  # Runs and completes
```

### --verbose
```bash
# Shows token usage and timing information
claude --prompt "Hello" --output-format stream-json --verbose --print

# Output includes:
# - Token counts (input, output, cache)
# - Response time
# - Model used
# - Session ID
```

### --dangerously-skip-permissions
```bash
# macOS ONLY - Skips file access permission checks
# Required when running from sandboxed app
claude \
  --prompt "Read file.txt" \
  --output-format stream-json \
  --print \
  --dangerously-skip-permissions
```

### --resume vs --continue
```bash
# --resume: Resumes specific session by ID
claude --resume abc123def456 --prompt "Continue" --print

# --continue: Continues last session in current directory
claude --continue --prompt "Continue" --print

# Note: --continue is shorthand, --resume with ID is more reliable
```

## Error Messages from Wrong Ordering

### "No prompt provided"
```
Cause: --prompt after other flags
Fix: Put --prompt early in argument list
```

### "Invalid output format"
```
Cause: --output-format not recognized due to order
Fix: Ensure --output-format comes before --print
```

### "Session not found"
```
Cause: --resume not processed due to wrong position
Fix: --resume MUST be first argument
```

### Process hangs indefinitely
```
Cause: Missing --print flag
Fix: Always include --print for non-interactive use
```

## Testing Argument Order

### Test Script
```bash
#!/bin/bash

# Test correct order
echo "Testing correct order..."
claude \
  --prompt "Say 'correct order'" \
  --model claude-3-5-sonnet-20241022 \
  --output-format stream-json \
  --verbose \
  --print

# Test wrong order (will fail)
echo "Testing wrong order..."
claude \
  --print \
  --verbose \
  --output-format stream-json \
  --model claude-3-5-sonnet-20241022 \
  --prompt "Say 'wrong order'"

# Test resume order
echo "Testing resume..."
SESSION_ID=$(claude --prompt "Start session" --output-format json --print | jq -r .session_id)
claude \
  --resume "$SESSION_ID" \
  --prompt "Continue session" \
  --output-format stream-json \
  --print
```

## Complete Working Examples

### Example 1: Simple Query
```bash
claude \
  --prompt "What is 2+2?" \
  --output-format stream-json \
  --print
```

### Example 2: Code Analysis
```bash
claude \
  --prompt "Analyze this code for bugs: $(cat main.rs)" \
  --model claude-3-5-sonnet-20241022 \
  --output-format stream-json \
  --verbose \
  --print
```

### Example 3: Resume with Context
```bash
claude \
  --resume "$SESSION_ID" \
  --prompt "Based on our previous discussion, implement the next feature" \
  --model claude-3-5-sonnet-20241022 \
  --output-format stream-json \
  --verbose \
  --print
```

### Example 4: With Custom System Prompt
```bash
claude \
  --prompt "Review this PR" \
  --output-format stream-json \
  --print \
  --append-system-prompt "You are a senior engineer reviewing code. Be thorough but constructive."
```

## Debugging Argument Issues

### Enable Debug Logging
```bash
# Set environment variable
export CLAUDE_DEBUG=1

# Run command
claude --prompt "Test" --output-format stream-json --print

# Check log output for argument parsing
```

### Verify Arguments Programmatically
```rust
fn verify_args(args: &[String]) -> Result<(), String> {
    // Check --resume is first if present
    if args.iter().any(|a| a == "--resume") {
        if args[0] != "--resume" {
            return Err("--resume must be first argument".to_string());
        }
    }
    
    // Check --print is present
    if !args.iter().any(|a| a == "--print") {
        return Err("--print flag is required".to_string());
    }
    
    // Check --output-format comes before --print
    let output_pos = args.iter().position(|a| a == "--output-format");
    let print_pos = args.iter().position(|a| a == "--print");
    
    if let (Some(o), Some(p)) = (output_pos, print_pos) {
        if o > p {
            return Err("--output-format must come before --print".to_string());
        }
    }
    
    Ok(())
}
```

## Summary

**REMEMBER:**
1. **--resume** ALWAYS first
2. **--prompt** early (or use stdin)
3. **--model** before output format
4. **--output-format** before print
5. **--print** ALWAYS required and near the end
6. **Platform flags** at the very end

Get the order wrong, and Claude will silently fail, hang, or produce unexpected results. There are NO error messages for wrong argument order - it just doesn't work!