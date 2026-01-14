# Technical Approach: Multi-Provider Translation Layer

This document outlines the **recommended** technical approach for adding Gemini and OpenAI/Codex support while keeping Yume's existing Claude-compatible stream-json pipeline intact.

## 1. Goals and Non-Negotiable Invariants
- Preserve the existing stream parser (`src-tauri/src/stream_parser.rs`).
- Preserve the existing event flow (`claude-message:{sessionId}`) during migration.
- Do not store provider API keys inside Yume (env vars or CLI auth only).
- Maintain consistent UI behavior (tool approvals, streaming, analytics).

## 2. Current Baseline (Claude)
Yume expects line-delimited JSON objects with `type` fields that match Claude CLI output. Any new provider must **emit the same schema** to avoid UI and parser changes.

## 3. Recommended Architecture (Best Approach)
**Type A Shim-as-Agent** is the preferred architecture.
- `yume-cli` performs the agent loop (think -> act -> observe).
- Providers are treated as raw reasoning engines.
- Tool execution happens locally in the shim.
- The shim emits Claude-compatible stream-json to stdout.

Avoid Type B PTY screen-scraping unless no API access exists.

### Normalization Pseudocode (Type A)
```text
for chunk in provider_stream:
  if chunk.text:
    emit { type: "text", content: chunk.text }

  if chunk.tool_call:
    args = buffer_until_valid_json(chunk.tool_call.args)
    emit { type: "tool_use", id, name, input: args }
    if permissionMode == "interactive": wait_for_approval()  # planned mode
    result = run_tool(name, args)
    emit { type: "tool_result", tool_use_id: id, content: result }
    send_tool_result_back_to_provider(result)

emit { type: "usage", ... }
emit { type: "result", is_error: false }
emit { type: "message_stop" }
```

## 4. Process Model (Compatibility vs Performance)
Support both modes to minimize server changes:

1. **Spawn-per-turn (compatibility)**
   - Mirrors Claude CLI behavior.
   - Lowest risk for existing server integration.

2. **Persistent session (performance)**
   - Keeps history and tool state in memory.
   - Requires stdin control frames for messages and interrupts.

## 5. Protocol Contract (Canonical)
The shim must emit:
- `system` init (session metadata, tools, permissionMode)
- `text` (streamed content chunks)
- `tool_use` / `tool_result` (strict pairing)
- `usage` + terminal `result`
- `message_stop` (preferred end marker)

See `docs/expansion-plan/PROTOCOL_NORMALIZATION.md`.
For field-level message shapes, see `docs/expansion-plan/STREAM_JSON_REFERENCE.md`.

### Message Flow: Text-Only Turn
1. Emit `system` init if this is the first turn.
2. Stream content via one or more `text` events.
3. Emit `usage`.
4. Emit terminal `result`.
5. Emit `message_stop`.

### Message Flow: Tool Call Turn
1. Emit `tool_use` when the model requests a tool.
2. If `permissionMode` is `interactive` (planned), wait for approval.
3. Execute tool locally.
4. Emit `tool_result`.
5. Continue streaming `text` (if any).
6. Emit `usage`, then `result`, then `message_stop`.

## 6. Tool Support Levels
Not all providers support the same tool surface. Use explicit tiers:

**Core Tools (required for parity):**
- `Read`, `Write`, `Edit`, `MultiEdit`, `Glob`, `Grep`, `LS`, `Bash`

**File tool inputs must use `file_path`** to match UI rendering and analytics.

**Extended Tools (optional):**
- `WebFetch`, `WebSearch`, `NotebookEdit`

**Claude-Specific Tools (optional, may be disabled):**
- `Task`, `TaskOutput`, `TodoWrite`, `Skill`, `LSP`, `KillShell`

Do not advertise tools in `system.tools` unless the shim can execute them.
Tool names should align with UI expectations (see `src/renderer/config/tools.ts` and `src/renderer/components/Chat/MessageRenderer.tsx`).
For input field details, see `docs/expansion-plan/TOOL_SCHEMA_REFERENCE.md`.

## 7. Permissions and Approvals
Current sessions emit `permissionMode: "default"`. Planned shim modes:
- `permissionMode: "interactive"` must pause tool execution until approval.
- `permissionMode: "auto"` executes tools immediately.
- `permissionMode: "deny"` emits `tool_result` with `is_error: true`.

## 8. Session and Compaction Handling
- Keep a stable `session_id` across retries.
- Emit `system` with `subtype: "session_id"` if compaction changes identity.
- Allow per-provider compaction defaults (Gemini large context, smaller models stricter).

### Subagent Messages (Task Tool)
If the shim implements `Task`/subagents, include `parent_tool_use_id` on subagent messages (when emitting nested assistant/user messages).
The UI uses this field to keep streaming indicators active.

## 9. Hooks and Tool Approval Compatibility
Yume runs `pre_tool_use` and `post_tool_use` hooks on tool events.
Ensure that shim-emitted `tool_use` and `tool_result` messages are present so hooks and analytics remain accurate.

## 10. Tool Result Guidance
The UI renders diffs from tool inputs for file edits.
Keep `tool_result.content` concise and avoid embedding huge diffs unless necessary.

## 11. Usage, Costing, and Analytics
- Map provider usage to `usage` and `result.usage`.
- If usage is unavailable, use a tokenizer fallback and label as estimated.
- Persist usage by provider + model for analytics parity.

## 12. Error Handling Strategy
- Always emit a terminal `result` on failure.
- Emit `error` for provider errors or transport failures.
- Map rate limits (429) and auth failures (401/403) to user-facing messages.

### Recommended Error Mapping
- 401/403 -> `system` with `subtype: "error"` during init, or `error` + `result` mid-turn.
- 429 -> `error` + `result` with retry-after metadata if available.
- 5xx -> `error` + `result` and suggest retry.

## 13. Cross-Platform Requirements
- Normalize file paths for Windows and WSL.
- Ensure stdout is UTF-8 and free of ANSI sequences.
- Flush stdout after every JSON line.

## 14. Packaging and Distribution
- Bundle `yume-cli` per platform alongside server binaries.
- Sign binaries for macOS and Windows.
- Keep a fallback path for dev builds (Node-based shim).

## 15. Testing and Validation
Minimum tests:
- Text-only response
- Single tool call
- Multiple tool calls
- Tool error
- Interrupt mid-stream
- Auth failure
- Rate limit
- Stream disconnect

Run the full matrix on macOS, Windows, Linux.

## 16. Open Questions (Research)
- Gemini streaming deltas and function-call formats
- OpenAI Responses vs Chat Completions tool-call behavior
- Token usage fidelity across providers
- Best default compaction strategy per model family
