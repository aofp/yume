# Critical stdin Handling Patterns - Complete Documentation

## The Most Critical Detail: `--print` Flag and stdin

### NEVER REMOVE THE `--print` FLAG

```bash
# CRITICAL: --print is REQUIRED for programmatic use
claude --print --output-format stream-json --verbose

# Without --print, Claude enters interactive mode and HANGS
claude --output-format stream-json  # WRONG - Will freeze!
```

## stdin Writing Patterns

### Yurucode's Current Pattern (Problematic)

```javascript
// Embedded server stdin handling with timeouts
const stdinTimeout = setTimeout(() => {
  console.error(`⚠️ Stdin write timeout - forcing close`);
  try {
    claudeProcess.stdin.end();
    claudeProcess.stdin.destroy();
  } catch (e) {
    console.error(`Failed to force close stdin: ${e.message}`);
  }
}, 10000); // 10 second timeout - TOO SHORT!

claudeProcess.stdin.write(messageToSend, (err) => {
  clearTimeout(stdinTimeout);
  if (err) {
    console.error(`❌ Error writing to stdin:`, err);
  } else {
    console.log(`✅ Successfully wrote to stdin`);
  }
});
```

### Problems with Yurucode's Approach

1. **10-second timeout is too short** - Complex prompts need more time
2. **Forcibly destroys stdin** - Corrupts Claude's state
3. **No retry mechanism** - Single failure kills everything
4. **Synchronous callback** - Can block event loop

### Claudia's Correct Pattern (No stdin at all!)

```rust
// Claudia passes prompt as COMMAND LINE ARGUMENT
let args = vec![
    "--prompt", &prompt,  // Prompt as argument, NOT stdin!
    "--output-format", "stream-json",
    "--verbose",
    "--print",
];

// No stdin writing needed!
let mut cmd = Command::new("claude");
for arg in args {
    cmd.arg(arg);
}
cmd.spawn()?;
```

## Critical Difference: Argument vs stdin

### Method 1: Command Line Argument (PREFERRED - Claudia's way)

```rust
// Pass prompt as command line argument
Command::new("claude")
    .arg("--prompt")
    .arg("Analyze this code...")  // Prompt as argument
    .arg("--output-format")
    .arg("stream-json")
    .arg("--print")
    .spawn()
```

**Advantages:**
- No stdin handling needed
- No timeouts to manage
- No risk of corruption
- Works with any prompt size (shell limits apply)

### Method 2: stdin Input (Yurucode's problematic way)

```javascript
// Pass prompt via stdin
const child = spawn('claude', [
  '--output-format', 'stream-json',
  '--print'  // Still required!
]);

// Must write to stdin
child.stdin.write(prompt);
child.stdin.end();  // Must close stdin
```

**Problems:**
- Requires careful stdin management
- Can timeout or hang
- Risk of partial writes
- Complex error handling

## Platform-Specific stdin Issues

### macOS
```javascript
// macOS allows larger argument sizes
// ARG_MAX typically 256KB
const maxPromptSize = 256 * 1024;
```

### Windows/WSL
```javascript
// Windows has smaller command line limits
// 32KB for cmd.exe, 8KB safe limit
const maxPromptSize = 8 * 1024;

// WSL adds complexity with path translation
const wslScript = `cat | ${claudePath} --print --output-format json`;
// This pipes stdin through WSL, adding latency
```

### Linux
```javascript
// Linux varies by distribution
// Typically 128KB-2MB
const maxPromptSize = 128 * 1024;
```

## Correct stdin Implementation (If You Must Use It)

### Rust Async stdin Writing

```rust
use tokio::io::AsyncWriteExt;
use tokio::time::{timeout, Duration};

async fn write_to_stdin(
    child: &mut Child,
    prompt: &str
) -> Result<(), Error> {
    if let Some(stdin) = child.stdin.as_mut() {
        // Write with generous timeout
        match timeout(
            Duration::from_secs(60),  // 60 seconds, not 10!
            stdin.write_all(prompt.as_bytes())
        ).await {
            Ok(Ok(_)) => {
                // Flush to ensure data is sent
                stdin.flush().await?;
                
                // Close stdin to signal end of input
                stdin.shutdown().await?;
                
                Ok(())
            }
            Ok(Err(e)) => Err(Error::WriteError(e)),
            Err(_) => Err(Error::Timeout),
        }
    } else {
        Err(Error::NoStdin)
    }
}
```

### Node.js Proper stdin Handling

```javascript
function writeToStdin(child, prompt) {
    return new Promise((resolve, reject) => {
        // Check if stdin is available
        if (!child.stdin) {
            return reject(new Error('No stdin available'));
        }
        
        // Set up error handling first
        child.stdin.on('error', (err) => {
            reject(err);
        });
        
        // Write in chunks for large prompts
        const CHUNK_SIZE = 64 * 1024; // 64KB chunks
        let offset = 0;
        
        function writeNextChunk() {
            if (offset >= prompt.length) {
                // All data written, close stdin
                child.stdin.end(() => {
                    resolve();
                });
                return;
            }
            
            const chunk = prompt.slice(offset, offset + CHUNK_SIZE);
            const canContinue = child.stdin.write(chunk);
            offset += CHUNK_SIZE;
            
            if (canContinue) {
                // Can write immediately
                setImmediate(writeNextChunk);
            } else {
                // Wait for drain event
                child.stdin.once('drain', writeNextChunk);
            }
        }
        
        writeNextChunk();
    });
}
```

## Session Resumption and stdin

### CRITICAL: Resume Changes stdin Behavior

When using `--resume`, the prompt handling differs:

```bash
# New session - prompt required
claude --prompt "Hello" --print --output-format stream-json

# Resume session - prompt is for NEW message
claude --resume SESSION_ID --prompt "Continue..." --print --output-format stream-json
```

### stdin with Resume

```javascript
// WRONG - Don't send history via stdin when resuming
if (isResuming) {
    child.stdin.write(previousContext + '\n' + newMessage);  // WRONG!
}

// RIGHT - Only send new message
child.stdin.write(newMessage + '\n');  // History loaded from session file
```

## Error Recovery for stdin Issues

### Detecting stdin Problems

```rust
// Check if Claude is expecting stdin
async fn is_waiting_for_input(child: &Child) -> bool {
    // Check process state
    match child.try_wait() {
        Ok(Some(status)) => {
            // Process already exited
            false
        }
        Ok(None) => {
            // Process still running, might be waiting
            true
        }
        Err(_) => false
    }
}
```

### Recovery Strategies

```rust
enum StdinRecovery {
    Retry,      // Try writing again
    Kill,       // Kill and restart process
    Timeout,    // Wait longer
    Skip,       // Continue without stdin
}

async fn handle_stdin_failure(
    child: &mut Child,
    error: Error
) -> StdinRecovery {
    match error {
        Error::BrokenPipe => {
            // stdin closed unexpectedly
            StdinRecovery::Kill
        }
        Error::WouldBlock => {
            // Buffer full, wait
            StdinRecovery::Timeout
        }
        Error::Timeout => {
            // Took too long
            if is_waiting_for_input(child).await {
                StdinRecovery::Retry
            } else {
                StdinRecovery::Kill
            }
        }
        _ => StdinRecovery::Kill
    }
}
```

## Best Practices

### 1. Prefer Command Line Arguments

```rust
// BEST - No stdin needed
Command::new("claude")
    .arg("--prompt").arg(prompt)
    .arg("--print")
    .spawn()
```

### 2. If Using stdin, Handle Backpressure

```javascript
// Handle 'drain' event for large inputs
if (!child.stdin.write(data)) {
    await new Promise(resolve => {
        child.stdin.once('drain', resolve);
    });
}
```

### 3. Always Close stdin Properly

```javascript
// Always end stdin when done
child.stdin.end(() => {
    console.log('stdin closed successfully');
});
```

### 4. Set Reasonable Timeouts

```rust
// Use generous timeouts for complex tasks
const STDIN_TIMEOUT: Duration = Duration::from_secs(300); // 5 minutes
```

### 5. Monitor Process State

```rust
// Check if process is still alive before writing
if child.try_wait()?.is_none() {
    // Safe to write
    child.stdin.write_all(data).await?;
}
```

## Common stdin Bugs to Avoid

### Bug 1: Writing After Process Exit

```javascript
// WRONG
child.stdin.write(data);  // Process might be dead!

// RIGHT
if (!child.killed && child.exitCode === null) {
    child.stdin.write(data);
}
```

### Bug 2: Not Handling EPIPE

```javascript
// WRONG
child.stdin.write(data);  // Can throw EPIPE

// RIGHT
child.stdin.write(data, (err) => {
    if (err && err.code === 'EPIPE') {
        console.log('Process terminated before stdin write');
    }
});
```

### Bug 3: Forgetting to Close stdin

```javascript
// WRONG
child.stdin.write(prompt);  // Claude waits forever for more input

// RIGHT
child.stdin.write(prompt);
child.stdin.end();  // Signal end of input
```

### Bug 4: Timeout Too Short

```javascript
// WRONG
setTimeout(() => child.stdin.destroy(), 5000);  // 5 seconds too short!

// RIGHT
setTimeout(() => child.stdin.destroy(), 300000);  // 5 minutes minimum
```

## Debugging stdin Issues

### Enable Verbose Logging

```javascript
// Log all stdin events
child.stdin.on('error', (err) => console.error('stdin error:', err));
child.stdin.on('finish', () => console.log('stdin finish'));
child.stdin.on('close', () => console.log('stdin close'));
child.stdin.on('drain', () => console.log('stdin drain'));
```

### Check Process State

```bash
# Check if process is waiting for input
lsof -p PID | grep PIPE

# Check stdin state
cat /proc/PID/fd/0
```

### Monitor Buffer Usage

```javascript
console.log('stdin writable:', child.stdin.writable);
console.log('stdin buffer:', child.stdin.writableLength);
console.log('stdin high water:', child.stdin.writableHighWaterMark);
```

## Conclusion

**The safest approach is to avoid stdin entirely** by using `--prompt` as a command line argument (like claudia does). If you must use stdin:

1. Use generous timeouts (5+ minutes)
2. Handle all error cases
3. Always close stdin properly
4. Monitor process state
5. Implement retry logic
6. Never forcibly destroy stdin

Remember: **NEVER remove the `--print` flag** or Claude will hang waiting for interactive input!