# yume Implementation Roadmap

Based on Claude Agent SDK analysis.

---

## Priority Matrix

| Priority | Effort | Impact | Feature |
|----------|--------|--------|---------|
| P0 | LOW | HIGH | Bug fixes |
| P1 | LOW | HIGH | Permission modes |
| P1 | LOW | HIGH | Beta features (1M context) |
| P2 | MEDIUM | HIGH | Bidirectional streaming |
| P2 | LOW | MEDIUM | Fork session |
| P3 | MEDIUM | MEDIUM | File checkpointing |
| P3 | LOW | MEDIUM | Tool restrictions |
| P4 | HIGH | LOW | MCP configuration |

---

## Phase 1: Critical Bug Fixes

**Effort: 1-2 days**

### Bug 1: Session Routing (CRITICAL)

**File**: `src-tauri/src/commands/claude_commands.rs:134-137`

```rust
// BROKEN: Always gets first session
let session = sessions.into_iter().next()

// FIX:
let session = sessions.into_iter()
    .find(|s| s.session_id == request.session_id)
    .ok_or_else(|| format!("Session {} not found", request.session_id))?;
```

### Bug 2: Env Var for Compact State

**File**: `src-tauri/src/commands/claude_commands.rs:175`

```rust
// BROKEN: Using env var for session state
std::env::set_var("COMPACT_ORIGINAL_SESSION", ...);

// FIX: Use proper session state
session_manager.set_compact_original(&session_id, &original_session_id).await;
```

### Bug 3: Token Tracking

**File**: `src/renderer/services/wrapperIntegration.ts`

Issue: Frontend calculates context size incorrectly using `cache_read_input_tokens` which is cumulative.

Fix: Use `contextWindow` from `modelUsage` in result messages.

---

## Phase 2: Essential CLI Flags

**Effort: 3-5 days**

### 2.1 Permission Mode Selector

Add to `SpawnOptions`:
```rust
pub permission_mode: PermissionMode,

enum PermissionMode {
    Default,
    AcceptEdits,
    BypassPermissions,
    Plan,
    DontAsk,
}
```

Add to `build_claude_command`:
```rust
if options.permission_mode != PermissionMode::Default {
    cmd.arg("--permission-mode").arg(match options.permission_mode {
        PermissionMode::AcceptEdits => "acceptEdits",
        PermissionMode::BypassPermissions => "bypassPermissions",
        PermissionMode::Plan => "plan",
        PermissionMode::DontAsk => "dontAsk",
        _ => "default",
    });
}

// Remove --dangerously-skip-permissions, use permission_mode instead
```

Frontend:
```typescript
// Add to claudeCodeStore
permissionMode: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'

// Add UI selector in settings
```

### 2.2 Beta Features (1M Context)

Add to `SpawnOptions`:
```rust
pub betas: Vec<String>,
```

Add to `build_claude_command`:
```rust
for beta in &options.betas {
    cmd.arg("--betas").arg(beta);
}
```

Frontend - add toggle for "Extended Context (1M tokens)":
```typescript
if (settings.extendedContext) {
    options.betas = ['context-1m-2025-08-07'];
}
```

### 2.3 System Prompt

Add to `SpawnOptions`:
```rust
pub system_prompt: Option<String>,
```

Add to `build_claude_command`:
```rust
if let Some(prompt) = &options.system_prompt {
    cmd.arg("--system-prompt").arg(prompt);
}
```

---

## Phase 3: Bidirectional Streaming

**Effort: 1-2 weeks** (MAJOR REFACTOR)

### Current Architecture

```
Message 1 → spawn() → response → process exits
Message 2 → spawn(--resume) → response → process exits
```

### Target Architecture

```
Session start → spawn(--input-format stream-json)
  ← write message 1 to stdin
  → read response 1 from stdout
  ← write message 2 to stdin
  → read response 2 from stdout
  ← write {"type": "interrupt"} to stdin
  ... process stays alive until session ends
```

### Implementation Steps

1. **Modify `build_claude_command`**:
```rust
cmd.arg("--input-format").arg("stream-json");
cmd.arg("--output-format").arg("stream-json");
// Remove -p flag, prompt goes via stdin
```

2. **Keep stdin piped**:
```rust
cmd.stdin(Stdio::piped())  // Currently only stdout/stderr are piped
```

3. **Message protocol for stdin**:
```json
{"type": "user", "message": {"role": "user", "content": "Hello"}}
{"type": "interrupt"}
{"type": "set_permission_mode", "mode": "acceptEdits"}
{"type": "set_model", "model": "claude-opus-4-20250514"}
```

4. **Update `send_prompt`**:
```rust
pub async fn send_prompt(&self, session_id: &str, prompt: &str) -> Result<()> {
    let message = json!({
        "type": "user",
        "message": {
            "role": "user",
            "content": [{"type": "text", "text": prompt}]
        }
    });
    self.registry.write_to_stdin(run_id, &format!("{}\n", message)).await
}
```

5. **Add control methods**:
```rust
pub async fn interrupt_session(&self, session_id: &str) -> Result<()> {
    let message = json!({"type": "interrupt"});
    self.registry.write_to_stdin(run_id, &format!("{}\n", message)).await
}

pub async fn set_model(&self, session_id: &str, model: &str) -> Result<()> {
    let message = json!({"type": "set_model", "model": model});
    self.registry.write_to_stdin(run_id, &format!("{}\n", message)).await
}
```

### Benefits

- **Faster**: No process spawn overhead per message
- **Control**: Live interrupt, model switch, permission change
- **Features**: File checkpointing, MCP updates
- **Efficient**: One process handles entire session

---

## Phase 4: Session Management

**Effort: 2-3 days**

### 4.1 Fork Session

```rust
pub fork_session: bool,

// In build_claude_command:
if options.fork_session {
    cmd.arg("--fork-session");
}
```

### 4.2 Limits

```rust
pub max_turns: Option<u32>,
pub max_budget_usd: Option<f64>,

// In build_claude_command:
if let Some(turns) = options.max_turns {
    cmd.arg("--max-turns").arg(turns.to_string());
}
if let Some(budget) = options.max_budget_usd {
    cmd.arg("--max-budget-usd").arg(budget.to_string());
}
```

---

## Phase 5: Message Type Enhancements

**Effort: 2-3 days**

### Update `stream_parser.rs`

Add parsing for:

```rust
// SDKCompactBoundaryMessage
struct CompactBoundaryMessage {
    subtype: String, // "compact_boundary"
    compact_metadata: CompactMetadata,
}

struct CompactMetadata {
    trigger: String, // "manual" | "auto"
    pre_tokens: u64,
}

// SDKStatusMessage
struct StatusMessage {
    subtype: String, // "status"
    status: Option<String>, // "compacting" | null
}

// SDKToolProgressMessage
struct ToolProgressMessage {
    type_: String, // "tool_progress"
    tool_use_id: String,
    tool_name: String,
    elapsed_time_seconds: f64,
}
```

### Update init message parsing

```rust
struct SystemInitMessage {
    // Existing
    tools: Vec<String>,
    model: String,

    // Add these:
    mcp_servers: Vec<McpServerInfo>,
    slash_commands: Vec<String>,
    output_style: String,
    skills: Vec<String>,
    plugins: Vec<PluginInfo>,
    permission_mode: String,
}
```

---

## Phase 6: File Checkpointing

**Effort: 3-5 days**

Requires bidirectional streaming (Phase 3).

### 6.1 Enable Flag

```rust
pub enable_file_checkpointing: bool,

// In build_claude_command:
if options.enable_file_checkpointing {
    cmd.arg("--enable-file-checkpointing");
}
```

### 6.2 Rewind Control

```rust
pub async fn rewind_files(&self, session_id: &str, message_uuid: &str) -> Result<()> {
    let message = json!({
        "type": "rewind_files",
        "user_message_uuid": message_uuid
    });
    self.registry.write_to_stdin(run_id, &format!("{}\n", message)).await
}
```

### 6.3 Frontend Integration

- Store message UUIDs with file changes
- Add "Rewind to here" button on user messages
- Show file diff before rewind

---

## Testing Strategy

### Unit Tests

```rust
#[test]
fn test_permission_mode_flag() {
    let options = SpawnOptions {
        permission_mode: PermissionMode::AcceptEdits,
        ..Default::default()
    };
    let cmd = spawner.build_claude_command(&path, &options).unwrap();
    assert!(cmd.get_args().any(|a| a == "--permission-mode"));
}
```

### Integration Tests

```rust
#[tokio::test]
async fn test_bidirectional_streaming() {
    let spawner = ClaudeSpawner::new(...);
    let result = spawner.spawn_claude(app, options).await.unwrap();

    // Send first message
    spawner.send_prompt(&result.session_id, "Hello").await.unwrap();
    // Wait for response

    // Interrupt
    spawner.interrupt_session(&result.session_id).await.unwrap();

    // Session should still be alive
    assert!(spawner.is_session_alive(&result.session_id).await);

    // Send second message
    spawner.send_prompt(&result.session_id, "Continue").await.unwrap();
}
```

---

## Timeline Summary

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 1 (Bug fixes) | 1-2 days | None |
| Phase 2 (Essential flags) | 3-5 days | Phase 1 |
| Phase 3 (Bidirectional) | 1-2 weeks | Phase 1 |
| Phase 4 (Session mgmt) | 2-3 days | Phase 2 |
| Phase 5 (Message types) | 2-3 days | Phase 1 |
| Phase 6 (Checkpointing) | 3-5 days | Phase 3 |

**Total**: ~4-6 weeks for complete implementation

---

## Quick Wins (Can Do Now)

1. Fix session routing bug (30 min)
2. Add `--betas` flag for 1M context (1 hour)
3. Add `--permission-mode` selector (2 hours)
4. Parse `contextWindow` from result for accurate token tracking (1 hour)
5. Add `--fork-session` option (30 min)

---

## Sources

- SDK Types: `competitor-research/claude-agent-sdk/source/sdk-npm/entrypoints/agentSdkTypes.d.ts`
- CLI Comparison: `competitor-research/claude-agent-sdk/CLI-FLAGS-COMPARISON.md`
- Current Implementation: `src-tauri/src/claude_spawner.rs`
