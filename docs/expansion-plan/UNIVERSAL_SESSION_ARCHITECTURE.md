# Universal Session & Context Architecture

> **Related Documents:**
> - [CONVERSATION_PORTABILITY.md](./CONVERSATION_PORTABILITY.md) - Detailed translation layer and UCF specification
> - [PROVIDER_REFERENCE.md](./PROVIDER_REFERENCE.md) - Model and feature matrix (single source of truth)
> - [YUME_CLI_SPEC.md](./YUME_CLI_SPEC.md) - Session storage in yume-cli

## Objective
Enable seamless switching between providers (Claude, Gemini, OpenAI) while maintaining conversation history ("Cross-Agent Resumption") and providing accurate, model-specific context usage visualization.

**Note:** This document covers the foundational session architecture. For the detailed Unified Conversation Format (UCF), translation layer, and feature degradation handling, see [CONVERSATION_PORTABILITY.md](./CONVERSATION_PORTABILITY.md).

## 1. Dynamic Context Visualization

### Problem
`ContextBar.tsx` currently hardcodes the context window to `200,000` tokens. This renders the usage bar inaccurate for Gemini (1M-2M tokens) or GPT-4o (128k tokens).

### Solution
1.  **Source of Truth:** Use `src/renderer/config/models.ts` which already contains `contextWindow` for each model.
2.  **Data Flow:**
    *   `ContextBar` receives `selectedModel`.
    *   Look up `ModelDefinition` using `getModelById`.
    *   Use `model.contextWindow` for percentage calculations.
    *   Fallback to 200k if model not found.

## 2. Universal Session Storage (The "Yume Standard")

To allow resuming conversations across agents, we need a normalized storage format that Yume controls, rather than relying solely on Claude's opaque `~/.claude/projects` or `yume-cli`'s internal state.

### Session Data Structure (`~/.yume/sessions/{sessionId}.json`)
```json
{
  "id": "uuid",
  "created_at": 1736850000000,
  "updated_at": 1736850100000,
  "title": "Refactoring Auth",
  "provider": "claude",
  "model": "claude-3-5-sonnet",
  "working_directory": "/path/to/project",
  "messages": [
    {
      "role": "user",
      "content": "Analyze this file...",
      "timestamp": 1736850000000
    },
    {
      "role": "assistant",
      "content": "I see the issue...",
      "tool_calls": [...],
      "timestamp": 1736850005000
    }
  ],
  "usage": {
    "input_tokens": 1500,
    "output_tokens": 400
  }
}
```

## 3. Cross-Agent Resumption Strategy

### Direction A: Claude -> Gemini/OpenAI (Easy)
Since `yume-cli` is our own code, we can easily inject history.

1.  **Export:** Frontend takes current `sessions` store state (messages).
2.  **Transform:** Save messages to a temporary "context dump" file (e.g., `.yume/tmp/context_{id}.json`).
3.  **Spawn:** Call `yume-cli` with a new flag: `--history-file <path>`.
4.  **Load:** `yume-cli` reads the file at startup and populates its internal history before accepting the first user prompt.

### Direction B: Gemini/OpenAI -> Claude (Hard)
Claude CLI manages its own state in `~/.claude/projects/`. We cannot easily inject a history into a *running* Claude process, nor easily create a valid Claude state file from scratch without reverse-engineering their storage format perfectly.

**Strategy:** "Context Injection via Prompt"
1.  **Summarize:** If switching *to* Claude, condense the previous conversation history.
2.  **Prompt:** Start the new Claude session with a system-like user prompt:
    > "I am continuing a session from another agent. Here is the conversation history so far: [Insert Transcript]. Please use this context for our next steps."

## 4. Implementation Steps (Parallelizable)

### Track A: Frontend & Visualization (Assign to: Current Agent)
1.  Refactor `ContextBar.tsx` to use dynamic context limits.
2.  Refactor `ModelSelector` logic to ensure `selectedModel` properties are accessible.

### Track B: Backend & Shim (Assign to: Parallel Agent)
1.  **Update `yume-cli`:**
    *   Add `--history-file` argument support.
    *   Implement history loading in `agent-loop.ts`.
2.  **Update `yume_cli_spawner.rs`:**
    *   Accept an optional `history_file_path` in `SpawnOptions`.
3.  **Frontend Service:**
    *   Implement `forkSessionToProvider(sessionId, targetProvider)` in `claudeCodeStore`.
    *   This function serializes history and calls the spawner.

## 5. Token Standardization
Different providers count tokens differently.
*   **Claude:** Native tokenizer.
*   **Gemini:** Character count / ~4 estimate or API usage return.
*   **OpenAI:** Tiktoken.

**Decision:** Rely on the `usage` event emitted by the provider (via `yume-cli`) for *actual* costs. For the *Context Bar* visualization (before API return), use a rough estimator (char count / 4) or caching the last known usage.
