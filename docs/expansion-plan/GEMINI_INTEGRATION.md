# Gemini Integration Plan

## Objective
Enable Yume to drive Google's Gemini models via a CLI-compatible shim while preserving Claude-compatible stream-json so the existing UI and parser remain unchanged.

## Integration Strategy (Shim-First)
1. **Primary Path:** `yume-cli --provider gemini` (emits Claude-compatible stream-json).
2. **Optional Path:** Wrap a stable Gemini CLI *only if* it can be normalized without screen scraping.
3. **No SDKs in Server:** Any REST/SDK usage lives inside `yume-cli`, not the Rust core.

## Authentication
Yume does **not** store API keys. Auth is sourced from the host machine:
- **Preferred:** `gcloud auth print-access-token`
- **Fallback:** Application Default Credentials (`GOOGLE_APPLICATION_CREDENTIALS`)
- **Optional:** `GOOGLE_API_KEY` (env var only; not stored)

### Auth Research Checklist (All Platforms)
- Verify token acquisition on macOS, Windows, and Linux.
- Confirm token refresh behavior and how to detect expiration.
- Confirm minimal permissions required for Gemini API access.

## Protocol Mapping
All Gemini output must be normalized to the Claude-compatible stream-json format described in:
`docs/expansion-plan/PROTOCOL_NORMALIZATION.md`.

### Required Emissions
- `system` init message with `session_id`, `model`, `cwd`, `permissionMode`, `tools`.
- `text` for streamed content chunks.
- `tool_use` / `tool_result` for function calls and local tool execution.
- `usage` and terminal `result` for token tracking and UI completion.

## Tool Support
Gemini function calling should be mapped to Yume's standard tools:
- `Read`, `Write`, `Edit`, `MultiEdit`, `Glob`, `Grep`, `LS`, `Bash`

If Gemini returns partial function arguments, buffer until valid JSON before emitting `tool_use`.
Use `docs/expansion-plan/TOOL_SCHEMA_REFERENCE.md` for input field expectations (e.g., `file_path`).

## Context Management
Gemini models may have large context windows.
- **Plan:** Allow per-provider auto-compaction settings.
- **Requirement:** Still emit `usage` so Yume's context bar remains accurate.

## Error Handling & Recovery
- **Auth failure:** Emit `system` with `subtype: "error"` and halt session creation.
- **Quota exceeded:** Emit `error` and `result` with `is_error: true`.
- **Stream disconnect:** Retry once with the same session id, then fail cleanly.
- **Tool schema mismatch:** Emit `tool_result` with `is_error: true`; log details to stderr only.

## Yume Integration Points
- **Rust/Tauri:** Add a Gemini spawner or adapter that launches `yume-cli --provider gemini` with `--model`, `--cwd`, and `--session-id`.
- **Server Adapter:** If using the Node server path, add a shim adapter that spawns `yume-cli` and forwards stdout to the existing stream parser.
- **Settings:** Allow model selection and optional `gcloud` path override.
- **Event Flow:** Reuse `claude-message:{sessionId}` events to avoid frontend refactors.

## Research Checklist
- Confirm streaming payload shape (delta vs full content chunks).
- Confirm function calling format and required fields.
- Validate usage metadata and token units.
- Validate stable model identifiers for analytics.
- Validate rate limit headers and retry semantics.
- Confirm safety settings defaults and override options.

## Implementation Steps
1. Implement `GeminiStrategy` inside `yume-cli` using REST streaming.
2. Normalize output to Claude-compatible stream-json.
3. Wire `adapters/shim.js` to spawn `yume-cli --provider gemini`.
4. Run golden transcript tests on macOS, Windows, Linux.
