# Multi-Model CLI Architecture Expansion

## Overview

Currently, Yume is tightly coupled to the `claude` CLI. To support Gemini and Codex (and potentially others), we must abstract the underlying CLI interaction into a plugin-based or adapter-based architecture.

## Core Philosophy: CLI-First

Yume acts as a GUI layer over **existing CLI tools**. 
- **NO Direct SDKs:** We do not use `@google/generative-ai` or `openai` libraries in the production server.
- **NO API Keys:** Yume does not store or manage API keys. Authentication is handled entirely by the user through the respective CLI (e.g., `claude login`, `gcloud auth login`).
- **Binary Integration:** Yume interacts with these tools via `stdin`/`stdout`, just as it does with the Claude CLI.
- **Shim Allowed:** For providers without a strict CLI protocol, we use `yume-cli` as a shim that still behaves like a CLI and emits Claude-compatible stream-json.

## Core Abstraction: `CliAdapter`

We will introduce a `CliAdapter` interface (likely a TypeScript interface in the frontend and a corresponding structure in the Node.js server) that defines how Yume interacts with an agentic CLI.

### Server-Side Adapter (Node.js)

The `server-claude-*.cjs` files will be refactored into a generic `server-core.cjs` that delegates to specific adapters.

```javascript
class CliAdapter {
  constructor(config) {}
  
  /**
   * Spawns the CLI process with specific arguments.
   * @param {string} prompt - The user's input.
   * @param {object} context - Session context (working dir, history).
   * @returns {ChildProcess} - The spawned process.
   */
  spawn(prompt, context) {}

  /**
   * Parses a line of output from the CLI's stdout.
   * @param {string} line - Raw output line.
   * @returns {object|null} - Claude-compatible stream-json message (type: 'text', 'tool_use', etc.) or null if ignored.
   */
  parseOutput(line) {}

  /**
   * Formats the system prompt or arguments specific to the CLI.
   */
  getArgs(context) {}
}
```

### Protocol Contract
Adapters must output **Claude-compatible stream-json** (line-delimited JSON objects with `type` fields) so existing parsing and UI logic stays intact. See `docs/expansion-plan/PROTOCOL_NORMALIZATION.md` for the canonical schema.
For the recommended architecture and tool support tiers, see `docs/expansion-plan/TECHNICAL_APPROACH.md`.
For field-level message shapes and tool inputs, see `docs/expansion-plan/STREAM_JSON_REFERENCE.md` and `docs/expansion-plan/TOOL_SCHEMA_REFERENCE.md`.

### Event Naming Compatibility
Today the frontend listens to Tauri events like `claude-message:{sessionId}`. To avoid a large refactor:
- Keep emitting the same event names for all providers (compatibility mode), or
- Add new `agent-message:{sessionId}` events and emit both during migration.

## Supported Providers

### 1. Claude (Current)
- **Binary:** `claude`
- **Protocol:** JSON stream (`--output-format stream-json`)
- **Status:** Implemented (refactoring into adapter in progress).

### 2. Gemini (Shim)
- **Binary:** `yume-cli --provider gemini` (shim)
- **Protocol:** Claude-compatible stream-json (emitted by shim).
- **Status:** Active integration.
- **Key Differences:** Function-calling format, usage metadata, massive context window.

### 3. OpenAI/Codex (Shim)
- **Primary:** `yume-cli --provider openai` (OpenAI/Codex API)
- **Fallback:** `gh copilot` via PTY if no API access is available.
- **Protocol:** Claude-compatible stream-json emitted by shim or adapter.

## Frontend Changes

1.  **Session Store:** Update `claudeCodeStore.ts` to `agentStore.ts` to hold the `activeProvider` (claude, gemini, codex).
2.  **UI:** Add a Provider Selector in the sidebar or new session modal.
3.  **Settings:** Add configuration sections for each provider (binary path, specific flags).

## Roadmap

1.  **Refactor Server:** Extract Claude logic from `server-claude-direct.cjs` into `adapters/claude.js`. (In Progress)
2.  **Generic Server:** Create `server-core.js` that loads the correct adapter based on initialization params.
3.  **Gemini Prototype:** Build a minimal `adapters/gemini.js` (shim-backed) and test connection. (Active Integration)
4.  **Codex Prototype:** Build a minimal `adapters/codex.js` (OpenAI-backed) and test connection.
5.  **Frontend Integration:** expose switching logic.
