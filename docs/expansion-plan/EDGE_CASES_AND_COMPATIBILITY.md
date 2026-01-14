# Translation Layer Edge Cases & Compatibility

This document enumerates scenarios the translation layer (`yume-cli` or adapters) must handle to ensure Yume behaves consistently across Claude, Gemini, and OpenAI/Codex.

## 1. Provider Capability Matrix (Minimum)
| Capability | Claude CLI | Gemini (Shim) | OpenAI/Codex (Shim) | Notes |
|------------|------------|---------------|---------------------|-------|
| Streaming text | ✅ | ✅ | ✅ | Must emit `text` chunks |
| Tool calls | ✅ | ✅ | ✅ | Buffer partial args |
| Usage tokens | ✅ | ✅ | ✅ | Use fallback tokenizer if missing |
| Interrupt | ✅ | ✅ | ✅ | Emit `interrupt` + `result` |
| Session resume | ✅ | ✅ | ✅ | Stable `session_id` required |
| Compaction boundary | ✅ | ⚠️ | ⚠️ | Shim may simulate if needed |
| Tool approvals | ✅ | ✅ | ✅ | Honor `permissionMode` |

## 2. Protocol Edge Cases
- **Partial JSON:** Buffer tool call arguments until valid JSON; never emit partial `tool_use`.
- **Long lines:** Keep JSON lines under ~100KB to avoid parser drops.
- **Invalid UTF-8:** Sanitize to valid UTF-8 before emitting JSON.
- **Missing usage:** Provide estimated token counts and mark as such in `result`.
- **Multiple tool calls:** Emit sequential `tool_use` events, wait for each `tool_result`.
- **Parallel tool calls:** Providers may return multiple calls in one turn; serialize them deterministically.
- **Out-of-order events:** Never emit `tool_result` before `tool_use`.
- **No result:** Always emit a terminal `result` to end the turn.
- **Tool schema drift:** Log unexpected tool fields to stderr; avoid dropping required fields.
- **Legacy terminators:** `$` is accepted by the parser but avoid emitting it from shims.
- **Field mapping:** File tools must use `file_path` even if providers return `path`.

## 3. Authentication & Identity Scenarios
- CLI not installed / path invalid.
- Auth token expired or missing.
- Multiple auth sources present (prefer CLI token, fallback to env var).
- Multi-account selection (choose active account or prompt user).

## 4. Network & Provider Failures
- Offline network or DNS failure.
- TLS/SSL errors.
- 401/403 auth errors.
- 429 rate limits with retry-after.
- 500/503 transient errors.
- Streaming disconnect mid-response.

## 5. Tool Execution Scenarios
- Permission denied or read-only filesystem.
- Tool input path outside working directory.
- Binary missing for tool execution (`Bash`).
- Long command output (chunk or summarize).
- Tool returns non-zero exit; emit `tool_result` with `is_error: true`.
- Interactive approval timeout; emit `tool_result` with `is_error: true`.

## 6. Windows & WSL Specifics
- Path normalization (`C:\` vs `/mnt/c/`).
- Spaces in paths and quoting.
- Line endings (`\r\n`).
- WSL availability detection and fallback.

## 7. Context & Compaction Scenarios
- Provider with huge context (Gemini) where auto-compaction is unnecessary.
- Provider with smaller context where compaction is required.
- Compaction triggered while tool execution is pending.
- Session id changes after compaction (`system` with `subtype: "session_id"`).

## 8. UI/UX Consistency
- Streaming indicator starts at first `text` or `tool_use`.
- Stop button triggers `interrupt` and ends with `result`.
- Tool approvals always gate execution in `interactive` mode.
- Errors must surface in UI without breaking the session.

## 9. Observability
- All debug logs go to stderr.
- Include provider name in stderr logs for easier triage.
- Emit provider-specific error codes where possible.

## 10. Test Matrix (Minimum)
Run golden transcript tests across:
- **OS:** macOS, Windows, Linux
- **Providers:** Claude, Gemini (shim), OpenAI/Codex (shim)
- **Scenarios:** text-only, single tool, multiple tools, tool error, interrupt, auth failure, rate limit, stream disconnect.
