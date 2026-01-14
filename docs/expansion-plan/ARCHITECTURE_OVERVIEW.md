# Multi-Model CLI Architecture Expansion

## Overview

Currently, Yume is tightly coupled to the `claude` CLI. To support Gemini and Codex (and potentially others), we must abstract the underlying CLI interaction into a plugin-based or adapter-based architecture.

## Core Philosophy: CLI-First

Yume acts as a GUI layer over **existing CLI tools**. 
- **NO Direct SDKs:** We do not use `@google/generative-ai` or `openai` libraries in the production server.
- **NO API Keys:** Yume does not store or manage API keys. Authentication is handled entirely by the user through the respective CLI (e.g., `claude login`, `gcloud auth login`).
- **Binary Integration:** Yume interacts with these tools via `stdin`/`stdout`, just as it does with the Claude CLI.

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
   * @returns {object|null} - Normalized message object (type: 'assistant', 'tool', etc.) or null if ignored.
   */
  parseOutput(line) {}

  /**
   * Formats the system prompt or arguments specific to the CLI.
   */
  getArgs(context) {}
}
```

## Supported Providers

### 1. Claude (Current)
- **Binary:** `claude`
- **Protocol:** JSON stream (`--output-format stream-json`)
- **Status:** Implemented (needs refactoring into adapter).

### 2. Gemini CLI
- **Binary:** `gemini` (or custom wrapper)
- **Protocol:** Needs investigation. Likely JSON or structured text.
- **Key Differences:** Parameter names, context handling, output format.

### 3. Codex CLI (GitHub Copilot CLI)
- **Binary:** `gh copilot` / `copilot`
- **Protocol:** Text/Interactive. May require a `pty` wrapper if it doesn't support structured JSON output natively.

## Frontend Changes

1.  **Session Store:** Update `claudeCodeStore.ts` to `agentStore.ts` to hold the `activeProvider` (claude, gemini, codex).
2.  **UI:** Add a Provider Selector in the sidebar or new session modal.
3.  **Settings:** Add configuration sections for each provider (binary path, specific flags).

## Roadmap

1.  **Refactor Server:** Extract Claude logic from `server-claude-direct.cjs` into `adapters/claude.js`.
2.  **Generic Server:** Create `server-core.js` that loads the correct adapter based on initialization params.
3.  **Gemini Prototype:** Build a minimal `adapters/gemini.js` and test connection.
4.  **Codex Prototype:** Build a minimal `adapters/codex.js`.
5.  **Frontend Integration:** expose switching logic.
