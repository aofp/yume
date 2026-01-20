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
- For file tools, `input` should include `file_path` (not `path`) to match UI expectations.
- See `docs/expansion-plan/TOOL_SCHEMA_REFERENCE.md` for tool input fields used by the UI.
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
{"type":"system","subtype":"init","session_id":"sess_123","model":"gemini-1.5-pro","cwd":"/repo","permissionMode":"default","tools":["Read","Write","Edit","MultiEdit","Glob","Grep","LS","Bash"]}
{"type":"text","content":"Sure, I can help with that."}
{"type":"tool_use","id":"call_1","name":"Edit","input":{"file_path":"src/app.tsx","old_string":"foo","new_string":"bar"}}
{"type":"tool_result","tool_use_id":"call_1","content":"ok"}
{"type":"usage","input_tokens":120,"output_tokens":310}
{"type":"result","is_error":false,"subtype":"success","usage":{"input_tokens":120,"output_tokens":310}}
{"type":"message_stop"}
```

Note: `tools` should list only what the shim can actually execute.

### Message Ordering & Stream Boundaries
- Emit `system` (init) first, exactly once per session.
- Emit `text` events in order; do not interleave multiple assistant messages.
- Emit `tool_use` then **wait** for a corresponding `tool_result` before continuing assistant text.
- Emit `result` as the terminal message for the turn; emit `message_stop` after `result`.
- `message_stop` is preferred for shims; the parser also accepts the legacy `$` terminator from Claude CLI.
- If multiple tool calls are required, emit them sequentially and wait for each result.

### System Subtypes
- `init`: Required session metadata (`session_id`, `model`, `cwd`, `permissionMode`, `tools`).
- `session_id`: Optional update when session identity changes (e.g., compaction).
- `compact_boundary`: Optional boundary message for compaction metadata.
- `error`: Use for auth failures or configuration problems before any response.

### Chunking & Buffer Limits
Yume's stream parser buffers multi-line JSON with a ~100KB limit. To avoid drops:
- Keep each JSON object on a single line.
- Chunk long text responses into multiple `text` messages.
- Avoid emitting huge `tool_result` payloads as a single line; chunk or summarize with a file reference.

## 2. Normalization Pipeline (Translation Layer)
1. **Ingest** provider stream (REST streaming, local CLI, or PTY).
2. **Canonicalize** to the Claude stream-json schema (types above).
3. **Emit** line-delimited JSON to stdout, **no ANSI**, **no prefixes**.
4. **Log** provider-specific debug output to stderr only.

### Strictness Rules
- Emit only valid JSON objects, one per line.
- Do not prepend `data:` or other SSE prefixes.
- Tool call `id` values must be unique per session and stable across retries.
- `tool_result.tool_use_id` must match the originating `tool_use.id`.
- If a provider cannot stream, simulate streaming by chunking output into `text` events.
- Always emit `usage` at least once per completed turn (or provide a tokenizer fallback).
- Emit `result` even after errors to ensure the UI transitions out of "streaming".
- Do not advertise unsupported tools in `system.tools`.

### Permissions & Approvals
Current Yume sessions emit `permissionMode: "default"` in the `system` init message (see `src-tauri/src/stream_parser.rs` tests).

Planned extension (shim-controlled):
- `permissionMode: "interactive"`: emit `tool_use`, wait for UI approval before running.
- `permissionMode: "auto"`: execute tools immediately.
- `permissionMode: "deny"`: do not execute; emit `tool_result` with `is_error: true`.

If you implement these modes in the shim, make sure they **degrade** safely to `"default"` when the UI does not recognize them.

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
- **Retry:** If a call retries, reuse the same tool call `id` and append `error` metadata in `result.errors` when applicable.

## 5. Cross-Platform Notes
- Normalize paths to OS-native separators in tool inputs.
- Use UTF-8 for stdout; replace invalid bytes to keep JSON valid.
- Avoid shell-specific quoting; tool execution should happen in the same layer as `tool_use`.

## 6. Usage and Costing
- If the provider returns usage, map it to `usage` and `result.usage`.
- If usage is not provided, use a local tokenizer and mark `result.usage` as estimated.
- Keep `modelUsage` optional, but emit it when model-level cost tracking is available.

### Tool Result Payloads
Yume's renderer accepts `tool_result.content` as:
- String
- Object with `content`
- Object with `output`

Prefer strings for large outputs and avoid multi-megabyte JSON objects.

## 7. Compliance Tests (Required)
Create golden transcripts that replay a full session:
1. Plain text response
2. Single tool call
3. Multiple tool calls
4. Tool error
5. Interrupt mid-stream

The translation layer must pass these tests on macOS, Windows, and Linux before provider rollout.

See `docs/expansion-plan/STREAM_JSON_REFERENCE.md` for field-level message shapes and `docs/expansion-plan/EDGE_CASES_AND_COMPATIBILITY.md` for broader scenario coverage.
