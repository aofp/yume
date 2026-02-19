# Universal Session & Context Architecture

> **Last Updated:** 2026-01-31
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

**Implementation Status:**
- ✅ `conversationStore.ts` implemented - saves UCF to `~/.yume/conversations/`
- ✅ `conversationTranslator.ts` implemented - Claude/Gemini/OpenAI adapters
- Storage location: `~/.yume/conversations/{sessionId}.json` (UCF format)
- Metadata: `~/.yume/conversations/{sessionId}.meta.json` (quick-load)
- Backups: `~/.yume/conversations/backups/{sessionId}.{timestamp}.json`

### Session Data Structure (`~/.yume/conversations/{sessionId}.json`)

This is the **Unified Conversation Format (UCF)** - see `types/ucf.ts` for full schema.

```json
{
  "id": "session-uuid",
  "version": "1.0",
  "created": "2026-01-28T10:00:00Z",
  "updated": "2026-01-28T11:30:00Z",
  "cwd": "/path/to/project",
  "title": "Refactoring Auth",
  "currentProvider": "claude",
  "currentModel": "claude-sonnet-4-5-20250929",
  "messages": [
    {
      "id": "msg-1",
      "timestamp": "2026-01-28T10:00:00Z",
      "role": "user",
      "provider": "user",
      "content": [{ "type": "text", "text": "Analyze this file..." }]
    },
    {
      "id": "msg-2",
      "timestamp": "2026-01-28T10:00:05Z",
      "role": "assistant",
      "provider": "claude",
      "model": "claude-sonnet-4-5-20250929",
      "content": [{ "type": "text", "text": "I see the issue..." }],
      "toolCalls": [{ "id": "tc-1", "name": "Read", "input": {...}, "status": "completed" }],
      "usage": { "inputTokens": 1500, "outputTokens": 400 }
    }
  ],
  "usage": {
    "totalInputTokens": 1500,
    "totalOutputTokens": 400,
    "totalCost": 0.015,
    "byProvider": { "claude": {...} }
  },
  "providerState": {
    "claude": { "sessionId": "...", "sessionFile": "~/.claude/projects/..." }
  },
  "switches": []
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

## 4. Implementation Status

### Track A: Frontend & Visualization
| Task | Status |
|------|--------|
| `ContextBar.tsx` dynamic context limits | ❌ Pending (still hardcoded 200K) |
| `ModelSelector` with model properties | ✅ `getModelById()` in models.ts |

### Track B: Backend & Shim
| Task | Status | Location |
|------|--------|----------|
| `--history-file` argument in yume-cli | ✅ Complete | `src-yume-cli/src/core/agent-loop.ts:139` |
| `loadHistoryFromFile()` function | ✅ Complete | `src-yume-cli/src/core/session.ts` |
| `yume_cli_spawner.rs` history option | ❌ Pending | Not implemented |
| `forkSessionToProvider()` frontend | ❌ Pending | Not implemented |

### Track C: Translation Layer
| Task | Status | Location |
|------|--------|----------|
| UCF type definitions | ✅ Complete | `src/renderer/types/ucf.ts` |
| ConversationStore service | ✅ Complete | `src/renderer/services/conversationStore.ts` |
| ConversationTranslator service | ✅ Complete | `src/renderer/services/conversationTranslator.ts` |
| `importFromClaude()` | ✅ Complete | Parses Claude JSONL files |
| `exportToClaude()` | ✅ Complete | Generates Claude history format |
| `exportToGemini()` | ✅ Complete | Generates Gemini history format |
| `exportToOpenAI()` | ✅ Complete | Generates OpenAI history format |
| `analyzeSwitch()` | ✅ Complete | Checks feature parity |
| `prepareForSwitch()` | ✅ Complete | Handles thinking/artifact translation |

## 5. Token Standardization
Different providers count tokens differently.
*   **Claude:** Native tokenizer.
*   **Gemini:** Character count / ~4 estimate or API usage return.
*   **OpenAI:** Tiktoken.

**Decision:** Rely on the `usage` event emitted by the provider (via `yume-cli`) for *actual* costs. For the *Context Bar* visualization (before API return), use a rough estimator (char count / 4) or caching the last known usage.
