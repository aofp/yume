# Bidirectional Streaming: The Key Differentiator

## The Discovery

From SDK analysis, the CLI supports **bidirectional streaming**:

```bash
claude --input-format stream-json --output-format stream-json
```

This enables a **persistent process** that accepts JSON commands on stdin.

---

## Current yume Approach (Suboptimal)

```
User types message 1
  → spawn new claude process with -p "message"
  → process outputs response
  → process EXITS

User types message 2
  → spawn NEW claude process with --resume <id> -p "message"
  → process outputs response
  → process EXITS

(repeat for every message)
```

**Problems:**
- Process spawn overhead (~100-500ms per message)
- No way to interrupt mid-response
- No way to change model mid-session
- No file checkpointing possible
- MCP servers restart each time

---

## Bidirectional Streaming Approach (SDK/Target)

```
Session start
  → spawn claude --input-format stream-json --output-format stream-json
  → process stays ALIVE

User types message 1
  → write JSON to stdin: {"type": "user", "message": {...}}
  ← read response from stdout

User clicks interrupt
  → write to stdin: {"type": "interrupt"}
  ← process stops current generation

User types message 2
  → write JSON to stdin: {"type": "user", "message": {...}}
  ← read response from stdout

User changes model
  → write to stdin: {"type": "set_model", "model": "opus"}
  ← confirmation

(process stays alive until explicit close)
```

---

## Input Protocol

Based on SDK types, stdin accepts these message types:

### User Message
```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": [{"type": "text", "text": "Hello Claude"}]
  }
}
```

### Interrupt
```json
{
  "type": "interrupt"
}
```

### Set Permission Mode
```json
{
  "type": "set_permission_mode",
  "mode": "acceptEdits"
}
```

### Set Model
```json
{
  "type": "set_model",
  "model": "claude-opus-4-20250514"
}
```

### Set Max Thinking Tokens
```json
{
  "type": "set_max_thinking_tokens",
  "max": 16000
}
```

### Rewind Files
```json
{
  "type": "rewind_files",
  "user_message_uuid": "abc-123-def"
}
```

### Set MCP Servers
```json
{
  "type": "set_mcp_servers",
  "servers": {
    "my-server": {
      "command": "node",
      "args": ["./server.js"]
    }
  }
}
```

---

## Implementation Changes Required

### 1. Modify `build_claude_command`

```rust
fn build_claude_command(&self, claude_path: &str, options: &SpawnOptions) -> Result<Command> {
    let mut cmd = Command::new(claude_path);

    // Enable bidirectional streaming
    cmd.arg("--input-format").arg("stream-json");
    cmd.arg("--output-format").arg("stream-json");

    // Resume if continuing session
    if let Some(session_id) = &options.resume_session_id {
        cmd.arg("--resume").arg(session_id);
    }

    // Model and other options
    cmd.arg("--model").arg(&options.model);

    // DO NOT use -p flag - prompt goes via stdin
    // DO NOT use --print - we're streaming

    // CRITICAL: Pipe stdin too
    cmd.stdin(Stdio::piped())
       .stdout(Stdio::piped())
       .stderr(Stdio::piped())
       .kill_on_drop(true);

    Ok(cmd)
}
```

### 2. Modify `spawn_claude`

```rust
pub async fn spawn_claude(&self, app: AppHandle, options: SpawnOptions) -> Result<SpawnResult> {
    // ... existing setup ...

    // Take stdin handle and store it
    let stdin = child.stdin.take()
        .ok_or_else(|| anyhow!("No stdin available"))?;

    // Store stdin in registry for later use
    self.registry.register_stdin(run_id, stdin)?;

    // Send initial prompt via stdin if provided
    if !options.prompt.trim().is_empty() {
        self.send_user_message(run_id, &options.prompt).await?;
    }

    // ... rest of setup ...
}
```

### 3. Add Control Methods

```rust
impl ClaudeSpawner {
    /// Send a user message to an active session
    pub async fn send_user_message(&self, run_id: i64, content: &str) -> Result<()> {
        let message = json!({
            "type": "user",
            "message": {
                "role": "user",
                "content": [{"type": "text", "text": content}]
            }
        });
        self.write_stdin(run_id, &message).await
    }

    /// Interrupt current generation
    pub async fn interrupt(&self, run_id: i64) -> Result<()> {
        let message = json!({"type": "interrupt"});
        self.write_stdin(run_id, &message).await
    }

    /// Change model mid-session
    pub async fn set_model(&self, run_id: i64, model: &str) -> Result<()> {
        let message = json!({"type": "set_model", "model": model});
        self.write_stdin(run_id, &message).await
    }

    /// Change permission mode
    pub async fn set_permission_mode(&self, run_id: i64, mode: &str) -> Result<()> {
        let message = json!({"type": "set_permission_mode", "mode": mode});
        self.write_stdin(run_id, &message).await
    }

    /// Rewind files to earlier state
    pub async fn rewind_files(&self, run_id: i64, message_uuid: &str) -> Result<()> {
        let message = json!({
            "type": "rewind_files",
            "user_message_uuid": message_uuid
        });
        self.write_stdin(run_id, &message).await
    }

    async fn write_stdin(&self, run_id: i64, message: &serde_json::Value) -> Result<()> {
        let json = format!("{}\n", serde_json::to_string(message)?);
        self.registry.write_to_stdin(run_id, &json).await
            .map_err(|e| anyhow!(e))
    }
}
```

### 4. Update ProcessRegistry

```rust
pub struct ProcessInfo {
    // ... existing fields ...
    stdin: Option<tokio::process::ChildStdin>,
}

impl ProcessRegistry {
    pub fn register_stdin(&self, run_id: i64, stdin: ChildStdin) -> Result<(), String> {
        let mut processes = self.processes.lock()
            .map_err(|e| e.to_string())?;
        if let Some(info) = processes.get_mut(&run_id) {
            info.stdin = Some(stdin);
            Ok(())
        } else {
            Err(format!("Process {} not found", run_id))
        }
    }

    pub async fn write_to_stdin(&self, run_id: i64, data: &str) -> Result<(), String> {
        let stdin = {
            let mut processes = self.processes.lock()
                .map_err(|e| e.to_string())?;
            processes.get_mut(&run_id)
                .and_then(|info| info.stdin.as_mut())
                .ok_or_else(|| format!("No stdin for process {}", run_id))?
                // Need to clone or use Arc<Mutex<>> for stdin
        };

        use tokio::io::AsyncWriteExt;
        stdin.write_all(data.as_bytes()).await
            .map_err(|e| e.to_string())?;
        stdin.flush().await
            .map_err(|e| e.to_string())
    }
}
```

---

## Frontend Changes

### New Tauri Commands

```typescript
// src/renderer/services/tauriApi.ts
export async function interruptSession(sessionId: string): Promise<void> {
  return invoke('interrupt_session', { sessionId });
}

export async function setModel(sessionId: string, model: string): Promise<void> {
  return invoke('set_model', { sessionId, model });
}

export async function rewindFiles(sessionId: string, messageUuid: string): Promise<void> {
  return invoke('rewind_files', { sessionId, messageUuid });
}
```

### Store Updates

```typescript
// claudeCodeStore.ts

// No longer need to spawn new process per message
async sendMessage(content: string) {
  // Just write to existing session's stdin
  await tauriApi.sendMessage(this.sessionId, content);
}

// True interrupt, not just process kill
async interrupt() {
  await tauriApi.interruptSession(this.sessionId);
  // Process stays alive, just stops current generation
}

// Model switch without new session
async switchModel(model: string) {
  await tauriApi.setModel(this.sessionId, model);
  this.model = model;
}
```

---

## Benefits Summary

| Feature | Current | With Bidirectional |
|---------|---------|-------------------|
| Message latency | +100-500ms spawn | ~0ms |
| Interrupt | Kill process | Graceful interrupt |
| Model switch | New session | Same session |
| File rewind | Not possible | Full support |
| MCP servers | Restart each time | Stay connected |
| Memory | Spawn/teardown overhead | Steady state |

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Process hangs | Timeout + force kill fallback |
| Stdin buffer full | Async write with backpressure |
| Protocol changes | Version check on init message |
| Session state | Graceful recovery on disconnect |

---

## Recommended Approach

1. **Keep existing spawn-per-message** as fallback
2. **Add bidirectional mode** as opt-in feature
3. **Gradually migrate** once proven stable
4. **Feature flag** for A/B testing

```rust
enum StreamingMode {
    Legacy,        // Current spawn-per-message
    Bidirectional, // New persistent process
}
```

---

## Sources

- SDK types: `agentSdkTypes.d.ts` line 526-617 (Query interface)
- SDK transport: `transport/processTransportTypes.d.ts`
- CLI help: `claude --help` (see --input-format flag)
