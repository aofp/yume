# Codex / OpenAI Integration Plan

## Objective
Enable Yume to drive OpenAI-compatible models (Codex/GPT-4o/O1, Azure OpenAI, and compatible endpoints) through the same Claude-compatible stream-json pipeline used by Claude CLI.

## Integration Strategy (Shim-First)
1. **Primary Path:** `yume-cli --provider openai` (Claude-compatible stream-json).
2. **Fallback:** `gh copilot` via PTY only if API access is unavailable.
3. **No SDKs in Server:** Any REST/SDK usage stays inside `yume-cli`.

## Authentication
Yume does **not** store API keys.
- **OpenAI / Azure:** `OPENAI_API_KEY` (env var only) and optional `OPENAI_BASE_URL`.
- **GitHub Copilot:** `gh auth token` if fallback is needed.

## Protocol Mapping
All OpenAI output must be normalized to the Claude-compatible stream-json format described in:
`docs/expansion-plan/PROTOCOL_NORMALIZATION.md`.

### Required Emissions
- `system` init message with `session_id`, `model`, `cwd`, `permissionMode`, `tools`.
- `text` for streamed content chunks.
- `tool_use` / `tool_result` for function calls and local tool execution.
- `usage` and terminal `result` for token tracking and UI completion.

### Tool Set (Recommended)
`Read`, `Write`, `Edit`, `MultiEdit`, `Glob`, `Grep`, `LS`, `Bash`

## Tooling (Function Calling)
OpenAI streams tool calls as partial JSON arguments.
The shim must:
- Buffer partial tool arguments until valid JSON.
- Emit a single `tool_use` per call with a stable id.
- Execute tools locally and emit `tool_result`.
Use `docs/expansion-plan/TOOL_SCHEMA_REFERENCE.md` for input field expectations (e.g., `file_path`).

## O1 / Reasoning Models
If models emit reasoning or "thinking" signals:
- Prefer mapping to `thinking` events if a structured signal exists.
- Otherwise treat as plain `text` to avoid UI breakage.

## Error Handling & Recovery
- **Auth missing/invalid:** Emit `system` error before session start.
- **Rate limit:** Emit `error` + `result` with `is_error: true`; surface retry-after if present.
- **Stream disconnect:** Retry once with the same session id, then fail cleanly.
- **Tool schema mismatch:** Emit `tool_result` with `is_error: true`; log details to stderr only.

## Yume Integration Points
- **Rust/Tauri:** Add an OpenAI/Codex spawner or adapter that launches `yume-cli --provider openai` with `--model`, `--cwd`, and `--session-id`.
- **Server Adapter:** If using the Node server path, add a shim adapter that spawns `yume-cli` and forwards stdout to the existing stream parser.
- **Settings:** Allow model selection and `OPENAI_BASE_URL` overrides.
- **Event Flow:** Reuse `claude-message:{sessionId}` events to avoid frontend refactors.

## Research Checklist
- Confirm which OpenAI endpoints support tool calls + streaming (Chat vs Responses).
- Validate usage fields for cost tracking (input/output tokens).
- Validate model naming conventions (stable IDs for analytics).
- Confirm rate limits and error codes (429, 503) for retry logic.
- Confirm partial tool-call JSON chunking behavior.

## Implementation Steps
1. Implement `OpenAIStrategy` inside `yume-cli`.
2. Normalize output to Claude-compatible stream-json.
3. Wire `adapters/shim.js` to spawn `yume-cli --provider openai`.
4. Run golden transcript tests on macOS, Windows, Linux.
