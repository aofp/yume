# Yume CLI (`yume-cli`) Technical Specification

## Overview
`yume-cli` is a standalone Node.js executable that acts as a **universal agent shim**. It bridges the gap between Yume's GUI (which expects Claude-compatible stream-json) and providers that lack a stateful CLI agent (Gemini, OpenAI/Codex, local endpoints).

The **non-negotiable contract**: `yume-cli` must emit line-delimited JSON objects that match the current Claude stream protocol parsed by Yume (`src-tauri/src/stream_parser.rs`).

## Architecture

### 1. Core Loop (Think → Act → Observe)
The CLI runs a continuous loop until the model signals completion.

```typescript
while (true) {
  // 1) THINK: Send history + tools to the provider
  const response = await provider.generate(history, tools);

  // 2) PARSE: Emit canonical stream-json messages to stdout
  //    - text chunks -> { type: "text", content: "..." }
  //    - tool calls -> { type: "tool_use", id, name, input }

  if (response.isText) {
    history.push({ role: "assistant", content: response.text });
    break;
  }

  if (response.isToolCall) {
    // 3) ACT: Execute tool locally
    const result = await tools.execute(response.toolName, response.args);

    // 4) OBSERVE: Emit tool_result to stdout
    emit("tool_result", result);

    // 5) UPDATE: Add tool call + tool result to history
    history.push({ role: "assistant", tool_calls: response.toolCalls });
    history.push({ role: "tool", content: result });
  }
}
```

### 2. Compatibility Contract (Stdout Protocol)
`yume-cli` must emit **Claude stream-json**. One JSON object per line, no prefixes, no ANSI.

Minimum required types:
- `system` (init metadata)
- `text` (streamed content)
- `tool_use` / `tool_result`
- `usage`
- `result`
- `message_stop` (recommended)

See `docs/expansion-plan/PROTOCOL_NORMALIZATION.md` for full mapping.

### 3. Process Model (Compatibility with Existing Server)
Yume currently spawns the Claude CLI per turn. To minimize server changes, `yume-cli` should support **both**:

1. **Spawn-per-turn mode** (preferred for compatibility)
   - Accept `--prompt` (or stdin) and `--resume <session_id>` to continue a session.
   - Exit after emitting `result` and `message_stop`.

2. **Persistent session mode** (future optimization)
   - `yume-cli start --session-id <id>` keeps the process alive.
   - Read control frames from stdin (JSON lines):
     - `{ "type": "user", "content": "..." }`
     - `{ "type": "interrupt" }`
     - `{ "type": "set_permission_mode", "mode": "interactive|auto|deny" }`
     - `{ "type": "tool_approval", "id": "call_1", "approved": true }`

### 4. Session + State Handling
- Maintain a **local session id** that is stable across retries.
- Store conversation history in memory with optional persistence to `~/.yume/sessions/<id>.json` (plan).
- Emit `system` init once per session:
  - `subtype: "init"`
  - `session_id`, `model`, `cwd`, `permissionMode`, `tools`
- Default `permissionMode` should be `"default"` unless the UI explicitly requests another value.
- On interrupts, emit `interrupt` then a terminal `result` with `is_error: true`.
- Emit `system` with `subtype: "session_id"` if the session id changes (compaction or migration).

## Tool Definitions (Claude-Compatible)
Yume's UI expects Claude-style tool names and payloads. Implement the same names and schema, and only advertise tools that the shim can execute.
Use the UI references in `src/renderer/config/tools.ts` and `src/renderer/components/Chat/MessageRenderer.tsx` to validate tool names and inputs.
See `docs/expansion-plan/TOOL_SCHEMA_REFERENCE.md` for UI-required input fields.

**Important:** The UI expects file tools to use `file_path` (not `path`).

### Core Tools (Required for Parity)

#### `Read`
- **Description:** Read file contents.
- **Schema:** `{ file_path, ... }`
- **Notes:** Pass through additional fields without dropping them.

#### `Write`
- **Description:** Write full content to a file.
- **Schema:** `{ file_path, content }`

#### `Edit`
- **Description:** Replace a string in a file with a new string.
- **Schema:** `{ file_path, old_string, new_string }`
- **Notes:** Apply deterministic replacements; avoid partial line edits unless exact match fails.

#### `MultiEdit`
- **Description:** Apply multiple edits to a single file.
- **Schema:** `{ file_path, edits: [{ old_string, new_string }] }`

#### `Glob`
- **Description:** Find files matching a pattern.
- **Schema:** `{ pattern, path? }`

#### `Grep`
- **Description:** Search within files.
- **Schema:** `{ pattern, path? }`

#### `LS`
- **Description:** List directory contents.
- **Schema:** `{ path? }`

#### `Bash`
- **Description:** Run a shell command.
- **Schema:** `{ command }`
- **Safety:** Respect Yume Guard and permission mode. Log stdout/stderr to `tool_result`.

### Optional Tools (Only If Implemented)

#### `WebFetch`
- **Schema:** `{ url }`

#### `WebSearch`
- **Schema:** `{ query }`

#### `TodoWrite`
- **Schema:** `{ todos: [...] }`

#### `Task`
- **Schema:** `{ description, subagent_type? }`

#### `TaskOutput`
- **Schema:** `{ task_id? }`

#### `NotebookEdit`
- **Schema:** `{ notebook_path, ... }`

#### `Skill`, `LSP`, `KillShell`
- **Schema:** provider-defined; pass through without transformation.

If a tool is not implemented, do **not** list it in the `system.tools` array.

## Provider Strategies
The CLI accepts `--provider` to select a strategy. Each strategy **must** normalize output to the canonical stream-json schema.

### Gemini Strategy
- **Auth:** `gcloud auth print-access-token` (or ADC fallback).
- **API:** Gemini REST streaming.
- **Quirks:** Function calls may not include IDs; generate deterministic IDs.

### OpenAI / Codex Strategy
- **Auth:** `OPENAI_API_KEY` (and optional `OPENAI_BASE_URL` for compatible endpoints).
- **API:** Streaming responses with tool calls.
- **Quirks:** Buffer partial tool call JSON until valid before emitting `tool_use`.

### Copilot (Fallback Only)
- **Auth:** `gh auth token`
- **API:** PTY wrapper around `gh copilot` (only if API access is unavailable).
- **Quirks:** Heuristic parsing and fragile; prefer OpenAI-compatible endpoints.

## CLI Interface

```bash
yume-cli start \
  --provider <gemini|openai|codex|copilot> \
  --model <model_name> \
  --cwd <working_directory> \
  --session-id <id> \
  [--prompt <text>] \
  [--resume <session_id>] \
  [--output-format stream-json] \
  [--api-base <url>] \
  [--permission-mode <default|interactive|auto|deny>] \
  [--protocol-version <v>] \
  [--verbose]
```

## Error Handling
- **Auth failure:** Emit `system` with `subtype: "error"` + human-readable message.
- **Tool error:** Emit `tool_result` with `is_error: true` and include stderr.
- **Provider error:** Emit `error`, then `result` with `is_error: true`.

## Cross-Platform Requirements
- Normalize paths (Windows vs POSIX) before tool execution.
- Emit UTF-8 JSON; replace invalid bytes.
- Log debug output to stderr only.
 - Flush stdout after every JSON line to keep UI streaming responsive.

## Security & Safety
- Respect `permissionMode` for all tool execution.
- Deny or sandbox commands that escape the working directory when configured.
- Avoid echoing secrets into `tool_result` payloads (redact when possible).
