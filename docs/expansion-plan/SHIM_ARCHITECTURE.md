# Shim Architecture: The "Yume CLI Translation Layer" (`yume-cli`)

> **Last Updated:** 2026-01-14
> **Implementation Status:** ~60% complete

## Implementation Summary

| Component | Status | Notes |
|-----------|--------|-------|
| Architecture Design | ✅ Complete | Official CLI spawning strategy finalized |
| Backend Spawner | ✅ Complete | `yume_cli_spawner.rs` with full Rust implementation |
| yume-cli Structure | ✅ Complete | TypeScript implementation in `src-yume-cli/` |
| Tool Executors | ✅ Complete | All core tools (Read, Write, Edit, Glob, Grep, Bash, LS) |
| CLI Spawning Logic | ❌ Pending | Need to spawn `gemini`/`codex` binaries |
| Translation Layers | ❌ Pending | Gemini→Claude, Codex→Claude translation |
| Binary Distribution | ❌ Pending | Build scripts for cross-platform binaries |

## Strategic Decision: Leverage Official CLIs
We have evaluated different approaches for multi-provider support:
*   **Option 1: Direct REST integration** - Would require API key management, tool execution, and full agent loop implementation.
*   **Option 2: Wrap existing CLIs** - Screen scraping is fragile and breaks on updates.
*   **Decision:** **Spawn official CLIs and translate their output** (`@google/gemini-cli`, `codex` CLI).

This approach:
- Delegates authentication to official CLIs (no API key storage)
- Leverages official tool implementations
- Reduces maintenance burden (providers handle updates)
- Simplifies our codebase to pure translation logic

## The Yume CLI Shim (`yume-cli`)
A lightweight Node.js binary bundled with Yume. It is **NOT** a full agent implementation, but a **thin translation layer**.

### Core Responsibilities
1.  **CLI Spawning:** Launches the official CLI binary for the selected provider (`gemini`, `codex`, `claude`).
2.  **Stream Reading:** Reads line-delimited JSON from the CLI's stdout.
3.  **Protocol Translation:** Converts provider-specific stream-json to Claude-compatible format.
4.  **Output Emission:** Emits translated messages to its own stdout in Claude format.
5.  **Error Handling:** Captures CLI errors and translates them to Claude-compatible error messages.

### What yume-cli Does NOT Do
- Does not make REST API calls to providers
- Does not implement the agent loop (Think → Act → Observe) - official CLIs do this
- Does not execute tools locally - official CLIs handle tool execution
- Does not manage authentication - users authenticate with official CLIs separately
- Does not cache tokens - official CLIs handle auth token management

## Protocol Contract (Non-Negotiable)
Yume's backend already parses Claude stream-json. The shim must **match that protocol** so the rest of the stack stays unchanged. See `docs/expansion-plan/PROTOCOL_NORMALIZATION.md` for the canonical schema and message examples.

## Tool Execution & Approval Flow
- Current sessions use `permissionMode: "default"`.
- `permissionMode` governs whether tools run automatically or require approval (planned for shim).
- In interactive mode, the shim must pause tool execution until the UI approves.
- If a tool is denied, emit `tool_result` with `is_error: true` and a clear message.
- Tool names should align with UI expectations (see `src/renderer/config/tools.ts` and `src/renderer/components/Chat/MessageRenderer.tsx`).

## Architecture

```
[ Yume GUI ]
    ^
    | (Claude-compatible stream-json via stdout)
    v
[ Yume Server (Node.js) ]
    ^
    | (spawns yume-cli)
    v
[ yume-cli Translation Shim ]
    ^
    | (spawns official CLI and reads stdout)
    v
[ Official Provider CLI ]
    |
    +--- [ gemini ] (from @google/gemini-cli)
    |      - Auth: `gemini auth login` (user runs separately)
    |      - Tools: Executed by gemini CLI
    |      - Output: Gemini-specific stream-json
    |
    +--- [ codex ] (official OpenAI Codex CLI)
    |      - Auth: `codex auth login` (user runs separately)
    |      - Tools: Executed by codex CLI
    |      - Output: Codex-specific stream-json
    |
    +--- [ claude ] (official Claude CLI)
           - Auth: Handled automatically on first run
           - Tools: Executed by claude CLI
           - Output: Claude stream-json (passthrough)
```

## Implementation Approach: Official CLI Translation

**The Approach:** Spawn official CLIs and translate their output. No direct REST calls.

### Example Flow: Gemini Provider

1.  **User Input:** "Refactor app.tsx"
2.  **Yume spawns:** `yume-cli --provider gemini --model gemini-2.0-flash --prompt "Refactor app.tsx"`
3.  **yume-cli spawns:** `gemini --model gemini-2.0-flash --output-format stream-json --prompt "Refactor app.tsx"`
4.  **gemini CLI output:** (Gemini-specific stream-json)
    ```json
    {"type": "text", "content": "I'll refactor app.tsx for you."}
    {"type": "function_call", "name": "ReadFile", "args": {"path": "app.tsx"}}
    {"type": "function_result", "call_id": "fc_1", "result": "...file contents..."}
    {"type": "function_call", "name": "WriteFile", "args": {"path": "app.tsx", "content": "...new content..."}}
    {"type": "function_result", "call_id": "fc_2", "result": "Success"}
    {"type": "done"}
    ```
5.  **yume-cli translates:** (Claude-compatible stream-json)
    ```json
    {"type": "text", "content": "I'll refactor app.tsx for you."}
    {"type": "tool_use", "id": "toolu_1", "name": "Read", "input": {"file_path": "app.tsx"}}
    {"type": "tool_result", "tool_use_id": "toolu_1", "content": "...file contents..."}
    {"type": "tool_use", "id": "toolu_2", "name": "Write", "input": {"file_path": "app.tsx", "content": "...new content..."}}
    {"type": "tool_result", "tool_use_id": "toolu_2", "content": "Success"}
    {"type": "result", "is_error": false}
    ```
6.  **Yume GUI:** Receives Claude-compatible messages and renders them normally.

### Example Flow: OpenAI Provider

Same flow, but:
- `yume-cli` spawns `codex` instead of `gemini`
- Translation logic converts Codex stream-json to Claude format
- User must have run `codex auth login` separately

## Why this is the Best Approach
1.  **No Auth Management:** Official CLIs handle authentication - we never touch API keys.
2.  **Official Tool Support:** CLIs implement tools natively - we don't need to reimplement Read/Write/Edit/etc.
3.  **Reduced Maintenance:** Provider updates are handled by official CLIs, not our codebase.
4.  **Simpler Code:** Pure translation logic is much simpler than full agent loop + REST integration.
5.  **Speed:** No PTY overhead. Direct stdio streaming.
6.  **Compatibility:** Claude-compatible stream-json keeps Tauri + frontend code intact across providers.
7.  **User Control:** Users authenticate with official CLIs using standard methods (OAuth, API keys, etc.).

## Cross-Platform Notes
- Use native path separators when executing tools.
- Avoid shell-specific quoting; pass argv arrays when possible.
- Emit UTF-8 JSON only (sanitize invalid bytes).
