# Shim Architecture: The "Yume CLI Translation Layer" (`yume-cli`)

> **Last Updated:** 2026-01-31
> **Implementation Status:** ✅ Complete (macOS ready, Windows/Linux binaries pending)

## Implementation Summary

| Component | Status | Notes |
|-----------|--------|-------|
| Architecture Design | ✅ Complete | Official CLI spawning strategy finalized |
| Backend Spawner | ✅ Complete | `yume_cli_spawner.rs` with full Rust implementation |
| yume-cli Structure | ✅ Complete | TypeScript implementation in `src-yume-cli/` |
| Tool Executors | ✅ Complete | All core tools (Read, Write, Edit, Glob, Grep, Bash, LS) |
| CLI Spawning Logic | ✅ Complete | Gemini/Codex spawning in providers/*.ts |
| Translation Layers | ✅ Complete | Gemini→Claude, Codex→Claude translation |
| Agent Loop | ✅ Complete | Think→Act→Observe cycle in core/agent-loop.ts |
| Plugin System | ✅ Complete | Agents, skills loader in core/plugins.ts |
| Binary Distribution | 🔄 In Progress | macOS works, Windows/Linux pending |

## Strategic Decision: Leverage Official CLIs
We have evaluated different approaches for multi-provider support:
*   **Option 1: Direct REST integration** - Requires API key management, tool execution, and full agent loop.
*   **Option 2: Wrap existing CLIs** - Screen scraping is fragile and breaks on updates.
*   **Decision:** **Spawn official CLIs and translate their output** (`@google/gemini-cli`, `@openai/codex`).

This approach:
- Delegates authentication to official CLIs (no API key storage)
- Leverages official tool implementations
- Reduces maintenance burden (providers handle updates)
- Simplifies our codebase to pure translation logic

## The Yume CLI Shim (`yume-cli`)
A Node.js binary bundled with Yume that provides a **universal agent interface** for non-Claude providers.

### Core Responsibilities
1.  **CLI Spawning:** Launches the official CLI binary for the selected provider (`gemini`, `codex`).
2.  **Stream Reading:** Reads line-delimited JSON from the CLI's stdout.
3.  **Protocol Translation:** Converts provider-specific stream-json to Claude-compatible format.
4.  **Agent Loop:** Implements Think → Act → Observe cycle with safety limits (50 turns max).
5.  **Local Tool Execution:** Provides fallback tool executors (Bash, Read, Write, Edit, Glob, Grep, LS).
6.  **Plugin System:** Loads agents and skills from `~/.yume/plugins/`.
7.  **Session Persistence:** Stores sessions in `~/.yume/sessions/{provider}/`.
8.  **Output Emission:** Emits translated messages to its own stdout in Claude format.
9.  **Error Handling:** Captures CLI errors and translates them to Claude-compatible error messages.

### What yume-cli Does NOT Do
- Does not make direct REST API calls to providers (delegates to official CLIs)
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

1.  **User Input:** "Fix the bug in auth.ts"
2.  **Yume spawns:** `yume-cli --provider openai --model gpt-4o --prompt "Fix the bug in auth.ts"`
3.  **yume-cli spawns:** `codex exec --json -C <cwd> --full-auto -m gpt-4o "Fix the bug in auth.ts"`
4.  **codex CLI output:** (JSONL format)
    ```json
    {"type": "thread.started", "thread_id": "..."}
    {"type": "item.completed", "item": {"type": "agent_message", "text": "I'll fix the bug."}}
    {"type": "item.completed", "item": {"type": "command_execution", "command": "cat auth.ts", "aggregated_output": "...", "exit_code": 0}}
    {"type": "turn.completed", "usage": {"input_tokens": 1000, "output_tokens": 500}}
    ```
5.  **yume-cli translates:** (Claude-compatible stream-json)
    ```json
    {"type": "text", "content": "I'll fix the bug."}
    {"type": "tool_use", "id": "tool-123", "name": "Read", "input": {"command": "cat auth.ts"}}
    {"type": "tool_result", "tool_use_id": "tool-123", "content": "...", "is_error": false}
    {"type": "usage", "usage": {"inputTokens": 1000, "outputTokens": 500}}
    {"type": "result", "is_error": false}
    ```

**Note:** Codex uses `--full-auto` for auto-approval and `detectToolFromCommand()` maps bash commands (cat → Read, grep → Grep, etc.) to Claude tool types for proper UI rendering.

## Why This Approach
1.  **No Auth Management:** Official CLIs handle authentication.
2.  **Official Tool Support:** CLIs implement tools natively.
3.  **Reduced Maintenance:** Provider updates handled by official CLIs.
4.  **Simpler Code:** Pure translation logic.
5.  **Speed:** Direct stdio streaming, no PTY overhead.
6.  **Compatibility:** Claude-compatible stream-json keeps Tauri + frontend intact.
7.  **User Control:** Standard auth methods (OAuth, API keys, etc.).

## Cross-Platform Notes
- Use native path separators when executing tools.
- Avoid shell-specific quoting; pass argv arrays when possible.
- Emit UTF-8 JSON only (sanitize invalid bytes).

## Backend Integration (Rust)

The `yume_cli_spawner.rs` module handles:

1. **Binary Location:** Searches for yume-cli in multiple locations:
   - Development: `src-yume-cli/dist/index.js` (runs via node)
   - Production: Bundled binary in `Resources/resources/`
   - Override: `YUME_CLI_BINARY` environment variable

2. **Process Spawning:** Uses `tokio::process::Command` with proper env inheritance

3. **Event Routing:** Multi-channel emission for session compatibility:
   - Synthetic session ID channel for initial routing
   - Real session ID channel after extraction from init event
   - Original frontend session ID for send_message routing

4. **Stream Handling:**
   - Separate stdout/stderr handlers
   - Session ID extraction from `type: "system", subtype: "init"` or `type: "init"` events
   - Completion detection on `type: "message_stop"` or `type: "result"`

## Agent Loop Safety Limits

The agent loop in `core/agent-loop.ts` implements:

- **MAX_TURNS:** 50 iterations maximum
- **MAX_HISTORY_MESSAGES:** 100 messages (auto-compaction when exceeded)

These limits prevent runaway sessions and unbounded resource consumption.
