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

### 3. Session + State Handling
- Maintain a **local session id** that is stable across retries.
- Store conversation history in memory with optional persistence to `~/.yume/sessions/<id>.json` (plan).
- Emit `system` init once per session:
  - `subtype: "init"`
  - `session_id`, `model`, `cwd`, `permissionMode`, `tools`
- On interrupts, emit `interrupt` then a terminal `result` with `is_error: true`.

## Tool Definitions (Claude-Compatible)
Yume's UI expects Claude-style tool names and payloads. Implement the same names and schema.

### `Edit` (File Modification)
- **Description:** Replace a string in a file with a new string.
- **Schema:** `{ path, old_string, new_string }`
- **Notes:** Apply deterministic replacements; avoid partial line edits unless exact match fails.

### `Write` (File Creation/Overwrite)
- **Description:** Write full content to a file.
- **Schema:** `{ path, content }`

### `Bash` (Command Execution)
- **Description:** Run a shell command.
- **Schema:** `{ command }`
- **Safety:** Respect Yume Guard and permission mode. Log stdout/stderr to `tool_result`.

### `Glob` (File Search)
- **Description:** Find files matching a pattern.
- **Schema:** `{ pattern }`

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
  [--api-base <url>] \
  [--permission-mode <interactive|auto|deny>] \
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
