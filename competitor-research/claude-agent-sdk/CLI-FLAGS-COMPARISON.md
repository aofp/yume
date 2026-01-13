# CLI Flags Comparison: yume vs SDK

## Current yume Implementation

From `claude_spawner.rs`:

```rust
// Flags yume currently uses:
--resume <session_id>         // Resume session
-c                            // Continue conversation
-p <prompt>                   // Initial prompt
--model <model>               // Model selection
--output-format stream-json   // JSON streaming output
--print                       // Print mode (new sessions only)
--verbose                     // Debug output
--dangerously-skip-permissions // Skip all permissions (macOS)
```

---

## SDK Options → CLI Flags Mapping

Based on `agentSdkTypes.d.ts`:

| SDK Option | CLI Flag | yume Status | Priority |
|------------|----------|-----------------|----------|
| `resume` | `--resume` | ✅ implemented | - |
| `continue` | `-c` | ✅ implemented | - |
| `model` | `--model` | ✅ implemented | - |
| `permissionMode` | `--permission-mode` | ❌ missing | HIGH |
| `allowDangerouslySkipPermissions` | `--dangerously-skip-permissions` | ⚠️ partial | - |
| `forkSession` | `--fork-session` | ❌ missing | MEDIUM |
| `systemPrompt` | `--system-prompt` | ❌ missing | HIGH |
| `allowedTools` | `--allowed-tools` | ❌ missing | MEDIUM |
| `disallowedTools` | `--disallowed-tools` | ❌ missing | MEDIUM |
| `mcpServers` | `--mcp-config` | ❌ missing | LOW |
| `agents` | `--agents` | ❌ missing | LOW |
| `maxTurns` | `--max-turns` | ❌ missing | MEDIUM |
| `maxBudgetUsd` | `--max-budget-usd` | ❌ missing | MEDIUM |
| `maxThinkingTokens` | `--max-thinking-tokens` | ❌ missing | LOW |
| `additionalDirectories` | `--additional-directories` | ❌ missing | LOW |
| `betas` | `--betas` | ❌ missing | HIGH |
| `persistSession` | `--persist-session` | ❌ missing | LOW |
| `enableFileCheckpointing` | `--enable-file-checkpointing` | ❌ missing | MEDIUM |
| `outputFormat` | `--output-format` (json_schema) | ❌ missing | LOW |
| `plugins` | `--plugins` | ❌ missing | LOW |

---

## CRITICAL DISCOVERY: Bidirectional Streaming

### `--input-format stream-json`

The SDK uses **bidirectional streaming** with:
```
--output-format stream-json --input-format stream-json
```

This enables:
1. **Live control requests** - interrupt, setModel, setPermissionMode
2. **Streaming user messages** - multi-turn without respawning
3. **Dynamic MCP server updates** - add/remove servers mid-session
4. **File checkpointing** - rewindFiles() capability

### Current yume Limitation

yume spawns a NEW process for each message:
```
User message 1 → spawn claude → get response → process exits
User message 2 → spawn claude --resume → get response → process exits
```

### SDK/Ideal Approach

SDK keeps ONE process alive:
```
spawn claude --input-format stream-json
  ← stream user message 1
  → stream response 1
  ← stream user message 2
  → stream response 2
  ← interrupt()
  ← setModel("opus")
  ← stream user message 3
  → stream response 3
```

---

## Permission Modes

From SDK types:

```typescript
type PermissionMode =
  | 'default'           // Standard behavior, prompts for dangerous ops
  | 'acceptEdits'       // Auto-accept file edits
  | 'bypassPermissions' // Skip all checks (requires allowDangerouslySkipPermissions)
  | 'plan'              // Planning mode, no tool execution
  | 'delegate'          // Restricts to Teammate/Task tools only
  | 'dontAsk'           // Deny if not pre-approved
```

### yume Current

Only uses `--dangerously-skip-permissions` on macOS, which maps to `bypassPermissions`.

### Recommended

Add permission mode selector:
```rust
cmd.arg("--permission-mode").arg(match options.permission_mode {
    PermissionMode::Default => "default",
    PermissionMode::AcceptEdits => "acceptEdits",
    PermissionMode::Bypass => "bypassPermissions",
    PermissionMode::Plan => "plan",
});
```

---

## Beta Features

The SDK supports:
```typescript
betas?: ['context-1m-2025-08-07']
```

This enables **1M token context window** for Sonnet 4/4.5.

CLI flag:
```
--betas context-1m-2025-08-07
```

---

## Query Methods (Streaming Mode Only)

These require `--input-format stream-json`:

| Method | Description |
|--------|-------------|
| `interrupt()` | Stop current execution |
| `setPermissionMode(mode)` | Change permission mode mid-session |
| `setModel(model)` | Switch models mid-session |
| `setMaxThinkingTokens(n)` | Limit thinking tokens |
| `supportedCommands()` | Get available slash commands |
| `supportedModels()` | Get available models |
| `mcpServerStatus()` | Check MCP server status |
| `accountInfo()` | Get account info |
| `rewindFiles(messageId)` | Restore files to earlier state |
| `setMcpServers(config)` | Update MCP servers dynamically |

---

## Implementation Priority

### Phase 1: Essential Flags

1. **`--permission-mode`** - granular control
2. **`--betas`** - enable 1M context
3. **`--system-prompt`** - custom prompts

### Phase 2: Session Management

4. **`--fork-session`** - branch conversations
5. **`--max-turns`** - prevent runaway
6. **`--max-budget-usd`** - cost control

### Phase 3: Bidirectional Streaming

7. **`--input-format stream-json`** - THE BIG ONE
   - Enables all Query methods
   - Single process for multi-turn
   - Live control (interrupt, model switch)
   - File checkpointing

### Phase 4: Advanced Features

8. **`--allowed-tools` / `--disallowed-tools`**
9. **`--enable-file-checkpointing`**
10. **`--mcp-config`**

---

## Message Types to Add

From SDK `agentSdkTypes.d.ts`:

| Message Type | yume Status |
|--------------|-----------------|
| `SDKAssistantMessage` | ✅ handled |
| `SDKUserMessage` | ✅ handled |
| `SDKResultMessage` | ✅ handled |
| `SDKSystemMessage` (init) | ✅ handled |
| `SDKPartialAssistantMessage` | ⚠️ partial |
| `SDKCompactBoundaryMessage` | ❌ missing |
| `SDKStatusMessage` | ❌ missing |
| `SDKHookResponseMessage` | ❌ missing |
| `SDKToolProgressMessage` | ❌ missing |
| `SDKAuthStatusMessage` | ❌ missing |

### New Fields to Parse

```typescript
// In SDKSystemMessage (init)
mcp_servers: { name: string; status: string }[];
slash_commands: string[];
output_style: string;
skills: string[];
plugins: { name: string; path: string }[];

// In SDKResultMessage
structured_output?: unknown;
modelUsage: { [modelName: string]: ModelUsage };
permission_denials: SDKPermissionDenial[];

// ModelUsage includes:
contextWindow: number;  // ACTUAL context size, not just tokens used
```

---

## Token Tracking Fix

SDK's `ModelUsage`:

```typescript
type ModelUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  webSearchRequests: number;
  costUSD: number;
  contextWindow: number;  // THIS IS THE KEY
};
```

### Current Bug

`wrapperIntegration.ts` calculates context size incorrectly.

### Fix

Use `contextWindow` from `modelUsage` in result messages for accurate context tracking.

---

## Sources

- SDK types: `competitor-research/claude-agent-sdk/source/sdk-npm/entrypoints/agentSdkTypes.d.ts`
- Claude Code repo: `competitor-research/claude-agent-sdk/source/claude-code/`
- yume spawner: `src-tauri/src/claude_spawner.rs`
