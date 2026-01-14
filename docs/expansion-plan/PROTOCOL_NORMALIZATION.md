# Protocol Normalization Strategy

## Objective
To ensure Yume works with Gemini and Codex the same way it works with Claude CLI, all provider output must be translated into the **exact stream-json format** Yume already parses (`src-tauri/src/stream_parser.rs`). The translation layer (in `yume-cli` or a server adapter) must emit the same line-delimited JSON objects Claude produces.

## 1. Canonical Stream JSON (Yume Contract)
Yume's current pipeline expects one JSON object per line on stdout with a required `type` field. The translator must **emit Claude-compatible messages**, not ad-hoc JSON.

### Required Message Types (Minimum Viable Set)
- `system`: Session initialization and metadata.
  - Required for init: `subtype: "init"`, `session_id`, `model`, `cwd`, `permissionMode`, `tools` (array of tool names).
- `text`: Streaming assistant content.
  - Required fields: `content` (string). Optional `id` for chunk tracking.
- `tool_use`: Tool invocation request.
  - Required fields: `id`, `name`, `input` (object).
- `tool_result`: Tool execution result.
  - Required fields: `tool_use_id`, `content` (string), optional `is_error` (boolean).
- `usage`: Token counts for the last call or accumulated totals.
  - Required fields: `input_tokens`, `output_tokens`.
  - Optional: `cache_creation_input_tokens`, `cache_read_input_tokens`.
- `result`: End-of-turn completion record.
  - Required fields: `is_error` (boolean). Optional: `subtype`, `usage`, `total_cost_usd`, `duration_ms`, `errors`.
- `message_stop`: Explicit end-of-message marker (optional but recommended).
- `error`: Fatal or recoverable error message (`message`, optional `code`).

### Optional Message Types (Pass Through When Available)
- `thinking`: `{ "type": "thinking", "is_thinking": true, "thought": "..." }`
- `assistant` / `user`: Full message objects (Claude-style nested message shape).
- `interrupt`: Emitted when the model is interrupted.
- `stream_event`: Raw provider streaming event (debug only; avoid in normal mode).

### Example Line-Delimited Stream
```json
{"type":"system","subtype":"init","session_id":"sess_123","model":"gemini-1.5-pro","cwd":"/repo","permissionMode":"interactive","tools":["Edit","Write","Bash","Glob"]}
{"type":"text","content":"Sure, I can help with that."}
{"type":"tool_use","id":"call_1","name":"Edit","input":{"path":"src/app.tsx","old_string":"foo","new_string":"bar"}}
{"type":"tool_result","tool_use_id":"call_1","content":"ok"}
{"type":"usage","input_tokens":120,"output_tokens":310}
{"type":"result","is_error":false,"subtype":"success","usage":{"input_tokens":120,"output_tokens":310}}
{"type":"message_stop"}
```

## 2. Normalization Pipeline (Translation Layer)
1. **Ingest** provider stream (REST streaming, local CLI, or PTY).
2. **Canonicalize** to the Claude stream-json schema (types above).
3. **Emit** line-delimited JSON to stdout, **no ANSI**, **no prefixes**.
4. **Log** provider-specific debug output to stderr only.

### Strictness Rules
- Emit only valid JSON objects, one per line.
- Tool call `id` values must be unique per session and stable across retries.
- `tool_result.tool_use_id` must match the originating `tool_use.id`.
- If a provider cannot stream, simulate streaming by chunking output into `text` events.

## 3. Provider Mappings

### Gemini (Type A: Shim-as-Agent)
**Source:** Gemini REST streaming.

Mapping:
- `content.parts[].text` -> `text`
- `functionCall` -> `tool_use`
  - If Gemini does not return IDs, generate: `call_gemini_<monotonic_counter>`.
- Usage metadata (if provided) -> `usage`

### OpenAI / Codex (Type A: Shim-as-Agent)
**Source:** OpenAI streaming APIs.

Mapping:
- `delta.content` -> `text`
- `tool_calls` -> `tool_use` (buffer partial JSON until valid)
- Final usage -> `usage` and `result`

### GitHub Copilot CLI (Type B: Shim-as-Driver, Fallback Only)
**Source:** `gh copilot` TUI via PTY.

Mapping (heuristic, fragile):
- Detect suggested commands and convert them into `tool_use` of type `Bash`.
- Gate execution behind Yume's approval UI, then capture output as `tool_result`.
- Use `text` for plain assistant output.

## 4. Errors, Interrupts, and Retry Semantics
- **Auth failures:** Emit `system` with `subtype: "error"` and a human-readable message.
- **Provider timeouts:** Emit `error` and a `result` with `is_error: true`.
- **User interrupt:** Emit `interrupt`, then `result` with `is_error: true` or `subtype: "cancelled"`.

## 5. Cross-Platform Notes
- Normalize paths to OS-native separators in tool inputs.
- Use UTF-8 for stdout; replace invalid bytes to keep JSON valid.
- Avoid shell-specific quoting; tool execution should happen in the same layer as `tool_use`.

## 6. Compliance Tests (Required)
Create golden transcripts that replay a full session:
1. Plain text response
2. Single tool call
3. Multiple tool calls
4. Tool error
5. Interrupt mid-stream

The translation layer must pass these tests on macOS, Windows, and Linux before provider rollout.
