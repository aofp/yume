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

## Model Identifier Strategy

All providers use a normalized `{provider}:{model}` format for analytics and cost tracking.

### Model Mapping Table

| Provider | API Model ID | Display Name | Analytics Key |
|----------|-------------|--------------|---------------|
| Claude | claude-sonnet-4-20250514 | Sonnet 4 | claude:sonnet-4 |
| Claude | claude-opus-4-5-20251101 | Opus 4.5 | claude:opus-4.5 |
| Gemini | gemini-1.5-pro | Gemini 1.5 Pro | gemini:1.5-pro |
| Gemini | gemini-1.5-flash | Gemini 1.5 Flash | gemini:1.5-flash |
| Gemini | gemini-2.0-flash | Gemini 2.0 Flash | gemini:2.0-flash |
| Gemini | gemini-2.0-flash-thinking | Gemini 2.0 Thinking | gemini:2.0-thinking |
| OpenAI | gpt-4o | GPT-4o | openai:gpt-4o |
| OpenAI | gpt-4o-mini | GPT-4o Mini | openai:gpt-4o-mini |
| OpenAI | o1 | O1 | openai:o1 |
| OpenAI | o1-mini | O1 Mini | openai:o1-mini |
| OpenAI | o3-mini | O3 Mini | openai:o3-mini |

### Implementation

```typescript
interface ModelInfo {
  provider: 'claude' | 'gemini' | 'openai';
  apiModelId: string;
  displayName: string;
  analyticsKey: string;
  contextLimit: number;
  outputLimit: number;
}

const MODEL_REGISTRY: Record<string, ModelInfo> = {
  'claude:sonnet-4': {
    provider: 'claude',
    apiModelId: 'claude-sonnet-4-20250514',
    displayName: 'Sonnet 4',
    analyticsKey: 'claude:sonnet-4',
    contextLimit: 200000,
    outputLimit: 16000,
  },
  'gemini:1.5-pro': {
    provider: 'gemini',
    apiModelId: 'gemini-1.5-pro',
    displayName: 'Gemini 1.5 Pro',
    analyticsKey: 'gemini:1.5-pro',
    contextLimit: 1000000,
    outputLimit: 8192,
  },
  // ... etc
};

function normalizeModelId(provider: string, apiModelId: string): string {
  // Map API model ID to analytics key
  for (const [key, info] of Object.entries(MODEL_REGISTRY)) {
    if (info.provider === provider && info.apiModelId === apiModelId) {
      return key;
    }
  }
  // Fallback: construct from provider and model
  return `${provider}:${apiModelId.replace(/[-_]?\d{8}$/, '')}`;
}
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
