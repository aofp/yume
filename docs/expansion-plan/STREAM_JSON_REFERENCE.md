# Stream-JSON Reference (Claude-Compatible)

This reference mirrors the message shapes parsed by Yume in `src-tauri/src/stream_parser.rs`.
Use it when implementing shims or adapters.

## Common Rules
- One JSON object per line.
- No `data:` prefixes (not SSE).
- UTF-8 only; sanitize invalid bytes.

## Message Types

### `system`
```json
{
  "type": "system",
  "subtype": "init",
  "session_id": "sess-123",
  "model": "claude-sonnet-4-20250514",
  "cwd": "/repo",
  "permissionMode": "default",
  "tools": ["Read", "Write", "Bash", "Grep"]
}
```

Optional fields:
- `uuid`, `message`
- `compact_metadata`: `{ "trigger": "auto|manual", "pre_tokens": 50000 }`
Note: `tools` should list only tools the shim can execute.

### `text`
```json
{ "type": "text", "content": "Hello world", "id": "chunk-1" }
```

### `usage`
```json
{
  "type": "usage",
  "input_tokens": 120,
  "output_tokens": 310,
  "cache_creation_input_tokens": 0,
  "cache_read_input_tokens": 0
}
```

### `tool_use`
```json
{
  "type": "tool_use",
  "id": "call_1",
  "name": "Edit",
  "input": { "file_path": "src/app.tsx", "old_string": "foo", "new_string": "bar" }
}
```

### `tool_result`
```json
{
  "type": "tool_result",
  "tool_use_id": "call_1",
  "content": "ok",
  "is_error": false
}
```

`content` can be:
- string
- object with `content`
- object with `output`

### `assistant` / `user`
Claude-style nested message objects. These are passed through as raw JSON for frontend handling.
Optional `parent_tool_use_id` may appear on subagent messages.

If used, `message.content` is typically:
- string, or
- array of content blocks with `type` in: `text`, `tool_use`, `tool_result`, `thinking`, `image`.

### `thinking`
```json
{ "type": "thinking", "is_thinking": true, "thought": "..." }
```

### `result`
```json
{
  "type": "result",
  "is_error": false,
  "subtype": "success",
  "usage": { "input_tokens": 120, "output_tokens": 310 }
}
```

Optional fields:
- `uuid`, `session_id`, `duration_ms`, `duration_api_ms`
- `total_cost_usd`, `modelUsage`, `errors`, `structured_output`

### `error`
```json
{ "type": "error", "message": "Auth failed", "code": "AUTH" }
```

### `interrupt`
```json
{ "type": "interrupt" }
```

### `message_stop`
```json
{ "type": "message_stop" }
```

### `stream_event` (debug)
```json
{ "type": "stream_event", "event": { "type": "content_block_delta", "delta": { "text": "Hello" } } }
```
Optional fields: `parent_tool_use_id`, `uuid`, `session_id`.

### `raw`
Used internally for unknown message types.

## Notes
- `permissionMode` is currently `"default"` in Yume sessions.
- `$` is accepted as a legacy terminator by the parser, but `message_stop` is preferred for shims.
