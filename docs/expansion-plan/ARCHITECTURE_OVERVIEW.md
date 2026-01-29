# Multi-Model CLI Architecture Expansion

> **Last Updated:** 2026-01-28
> **Implementation Status:** ~95% complete (macOS ready, Windows/Linux binaries pending)

## Implementation Summary

| Component | Status | Location |
|-----------|--------|----------|
| Provider Service | ✅ Complete | `src/renderer/services/providersService.ts` |
| Provider Selector UI | ✅ Complete | `src/renderer/components/ProviderSelector/` |
| Providers Tab | ✅ Complete | `src/renderer/components/Settings/ProvidersTab.tsx` |
| Model Registry | ✅ Complete | `src/renderer/config/models.ts` |
| yume-cli Shim | ✅ Complete | `src-yume-cli/` |
| Backend Spawner | ✅ Complete | `src-tauri/src/yume_cli_spawner.rs` |
| CLI Detection | ✅ Complete | `src-tauri/src/commands/claude_detector.rs` |
| Analytics Multi-Model | ✅ Complete | `server-claude-*.cjs` |
| UCF Types | ✅ Complete | `src/renderer/types/ucf.ts` |
| Conversation Store | ✅ Complete | `src/renderer/services/conversationStore.ts` |
| Translation Layer | ✅ Complete | `src/renderer/services/conversationTranslator.ts` |
| Agent Loop | ✅ Complete | `src-yume-cli/src/core/agent-loop.ts` |
| Tool Executors | ✅ Complete | `src-yume-cli/src/tools/` |
| Plugin System | ✅ Complete | `src-yume-cli/src/core/plugins.ts` |

## Overview

Yume supports multiple AI providers (Claude, Gemini, OpenAI/Codex) through a CLI-first architecture. The underlying CLI interaction is abstracted via adapters and a translation shim.

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

### 2. Gemini (Official CLI via Shim)
- **Binary:** `yume-cli --provider gemini` spawns official `gemini` CLI from @google/gemini-cli
- **Protocol:** Gemini stream-json → translated to Claude-compatible by yume-cli
- **Authentication:** User runs `gemini auth login` separately
- **Installation:** `npm install -g @google/gemini-cli`
- **Status:** ✅ Complete
- **Key Differences:** Function-calling format (tool_use/tool_result), usage metadata, massive context window (1M tokens)
- **CLI Flags:** `--model`, `--output-format stream-json`, `--yolo` (auto-approve)

### 3. OpenAI/Codex (Official CLI via Shim)
- **Binary:** `yume-cli --provider openai` spawns official `codex` CLI
- **Protocol:** Codex JSONL → translated to Claude-compatible by yume-cli
- **Authentication:** User runs `codex login` separately
- **Installation:** `npm install -g @openai/codex`
- **Status:** ✅ Complete
- **CLI Flags:** `exec --json -C <cwd> --full-auto -m <model>`
- **Special handling:** Mini models use `model_reasoning_effort="low"` override

## Frontend Changes

1.  **Session Store:** Update `claudeCodeStore.ts` to `agentStore.ts` to hold the `activeProvider` (claude, gemini, codex).
2.  **UI:** Add a Provider Selector in the sidebar or new session modal.
3.  **Settings:** Add configuration sections for each provider (binary path, specific flags).

## Implementation Status

1.  ✅ **yume-cli Shim:** Complete TypeScript implementation in `src-yume-cli/`
2.  ✅ **Gemini Provider:** Spawns `gemini` CLI with stream-json translation
3.  ✅ **OpenAI Provider:** Spawns `codex` CLI with JSONL translation
4.  ✅ **Backend Spawner:** `yume_cli_spawner.rs` handles multi-provider process management
5.  ✅ **Frontend Integration:** Provider switching, model selection, analytics
6.  🔄 **Binary Distribution:** macOS works, Windows/Linux binaries pending

## Model Identifier Strategy

All providers use a normalized `{provider}:{model}` format for analytics and cost tracking.

### Model Mapping Table

**Note:** Model IDs are defined in `src/renderer/config/models.ts` - DO NOT CHANGE without explicit approval.

| Provider | API Model ID | Display Name | Context Window |
|----------|-------------|--------------|----------------|
| Claude | claude-sonnet-4-5-20250929 | Sonnet 4.5 | 200K |
| Claude | claude-opus-4-5-20251101 | Opus 4.5 | 200K |
| Gemini | gemini-2.5-pro | Gemini 2.5 Pro | 1M |
| Gemini | gemini-2.5-flash | Gemini 2.5 Flash | 1M |
| OpenAI | gpt-5.2-codex | Codex 5.2 | 200K |
| OpenAI | gpt-5.1-codex-mini | Codex 5.1 Mini | 200K |

**yume-cli internal models** (additional models supported):
| Gemini | gemini-2.0-flash | Gemini 2.0 Flash | 1M |
| Gemini | gemini-3-flash | Gemini 3 Flash | 1M |
| Gemini | gemini-2.0-flash-thinking-exp | Gemini 2.0 Thinking | 32K |
| OpenAI | gpt-4o | GPT-4o | 128K |
| OpenAI | gpt-4o-mini | GPT-4o Mini | 128K |
| OpenAI | o1/o1-mini/o3-mini | O-series | 128-200K |

### Implementation

See `src/renderer/config/models.ts` for the actual model registry:

```typescript
// From src/renderer/config/models.ts
interface ModelDefinition {
  id: string;                // Full model ID for API calls
  shortName: string;         // Short name for display and shortcuts
  displayName: string;       // Full display name
  provider: ProviderType;    // 'claude' | 'gemini' | 'openai'
  contextWindow: number;     // Context window size
  maxOutput: number;         // Max output tokens
  supportsTools: boolean;
  supportsThinking?: boolean;
  reasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh';
}

// Example entries (actual IDs - DO NOT CHANGE without approval):
// Claude: claude-sonnet-4-5-20250929, claude-opus-4-5-20251101
// Gemini: gemini-2.5-pro, gemini-2.5-flash
// OpenAI: gpt-5.2-codex, gpt-5.1-codex-mini
```

## Cost Tracking

### Pricing Rates (per 1M tokens, as of 2025-01)

| Model | Input | Output | Cache Read | Cache Write |
|-------|-------|--------|------------|-------------|
| claude:opus-4.5 | $15.00 | $75.00 | $1.50 | $18.75 |
| claude:sonnet-4 | $3.00 | $15.00 | $0.30 | $3.75 |
| gemini:1.5-pro | $3.50 | $10.50 | $0.88 | - |
| gemini:1.5-flash | $0.075 | $0.30 | $0.02 | - |
| gemini:2.0-flash | $0.10 | $0.40 | - | - |
| openai:gpt-4o | $2.50 | $10.00 | - | - |
| openai:gpt-4o-mini | $0.15 | $0.60 | - | - |
| openai:o1 | $15.00 | $60.00 | - | - |
| openai:o1-mini | $3.00 | $12.00 | - | - |
| openai:o3-mini | $1.10 | $4.40 | - | - |

### Implementation

```typescript
// src/renderer/config/pricing.ts
export const PRICING: Record<string, TokenPricing> = {
  'claude:opus-4.5': { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  'claude:sonnet-4': { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  'gemini:1.5-pro': { input: 3.5, output: 10.5, cacheRead: 0.88 },
  'gemini:1.5-flash': { input: 0.075, output: 0.30, cacheRead: 0.02 },
  'gemini:2.0-flash': { input: 0.10, output: 0.40 },
  'openai:gpt-4o': { input: 2.5, output: 10 },
  'openai:gpt-4o-mini': { input: 0.15, output: 0.60 },
  'openai:o1': { input: 15, output: 60 },
  'openai:o1-mini': { input: 3, output: 12 },
  'openai:o3-mini': { input: 1.1, output: 4.4 },
};

function calculateCost(modelKey: string, usage: TokenUsage): number {
  const pricing = PRICING[modelKey];
  if (!pricing) return 0;

  let cost = 0;
  cost += (usage.inputTokens / 1_000_000) * pricing.input;
  cost += (usage.outputTokens / 1_000_000) * pricing.output;

  if (pricing.cacheRead && usage.cacheReadTokens) {
    cost += (usage.cacheReadTokens / 1_000_000) * pricing.cacheRead;
  }
  if (pricing.cacheWrite && usage.cacheWriteTokens) {
    cost += (usage.cacheWriteTokens / 1_000_000) * pricing.cacheWrite;
  }

  return cost;
}
```

### Cost Fallback Strategy

1. **Provider returns `cost_usd`:** Use directly (most accurate)
2. **Provider returns token counts:** Calculate using pricing table
3. **No usage data:** Estimate using tiktoken (mark as estimated in UI)

## Concurrent Sessions

Users may open multiple tabs with different providers simultaneously.

### Resource Management

- Each tab spawns one CLI process (Claude or yume-cli)
- Max concurrent processes: Same as `maxTabs` (99 Pro, 2 Trial)
- Memory limit per yume-cli process: ~100MB
- Cleanup: Process killed when tab closes or on app exit

### Server Handling

```typescript
// Session tracking in server
interface ActiveSession {
  sessionId: string;
  provider: 'claude' | 'gemini' | 'openai';
  process: ChildProcess;
  model: string;
  cwd: string;
  startedAt: Date;
}

const activeSessions = new Map<string, ActiveSession>();

// Limit enforcement
function canSpawnSession(provider: string): boolean {
  const count = activeSessions.size;
  const limit = getLicenseFeatures().maxTabs;
  return count < limit;
}

// Cleanup on tab close
function terminateSession(sessionId: string): void {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.process.kill('SIGTERM');
    activeSessions.delete(sessionId);
  }
}

// Cleanup on app exit
process.on('exit', () => {
  for (const session of activeSessions.values()) {
    session.process.kill('SIGTERM');
  }
});
```

### Analytics Aggregation

Analytics data is aggregated across all providers:

```typescript
interface AnalyticsEntry {
  sessionId: string;
  provider: string;
  model: string;
  cwd: string;
  timestamp: Date;
  usage: TokenUsage;
  costUsd: number;
}

// Query analytics by provider
function getAnalyticsByProvider(provider?: string): AnalyticsEntry[] {
  const entries = db.query('SELECT * FROM analytics ORDER BY timestamp DESC');
  if (provider) {
    return entries.filter(e => e.provider === provider);
  }
  return entries;
}

// Aggregate by model
function getUsageByModel(): Record<string, TokenUsage> {
  const result: Record<string, TokenUsage> = {};
  for (const entry of getAnalyticsByProvider()) {
    const key = `${entry.provider}:${entry.model}`;
    if (!result[key]) {
      result[key] = { inputTokens: 0, outputTokens: 0 };
    }
    result[key].inputTokens += entry.usage.inputTokens;
    result[key].outputTokens += entry.usage.outputTokens;
  }
  return result;
}
