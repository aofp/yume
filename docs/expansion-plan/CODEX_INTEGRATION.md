# Codex / OpenAI Integration Plan

> **Last Updated:** 2026-01-14
> **Implementation Status:** ~65% complete

## Implementation Summary

| Component | Status | Notes |
|-----------|--------|-------|
| Provider Definition | ✅ Complete | `models.ts` with Codex 5.1 Mini/5.2 |
| Provider Service | ✅ Complete | Enable/disable OpenAI provider |
| Provider UI | ✅ Complete | Settings tab, selector, no-provider modal |
| CLI Detection | ✅ Complete | `check_cli_installed('codex')` |
| Backend Spawner | ✅ Complete | `yume_cli_spawner.rs` with OpenAI enum |
| Reasoning Effort | ✅ Complete | `reasoning_effort` param in spawner |
| yume-cli Provider | 🔄 50% | `src-yume-cli/src/providers/openai.ts` |
| Stream Translation | ❌ Pending | Codex → Claude format |
| Auth Verification | ❌ Pending | `codex auth status` check |

## Objective
Enable Yume to drive OpenAI-compatible models (Codex/GPT-4o/O1) through the official `codex` CLI. A thin `yume-cli` shim spawns the official CLI and translates its stream-json output to Claude-compatible format.

## Integration Strategy (Official CLI + Shim)
1. **Primary Path:** `yume-cli --provider openai` spawns the official `codex` CLI binary.
2. **Translation Layer:** `yume-cli` parses the Codex stream-json output and translates it to Claude-compatible format.
3. **No Direct API Calls:** `yume-cli` does not make REST calls to OpenAI API - it delegates to the official CLI.
4. **No SDKs in Server:** No `openai` npm package or other SDK usage in Yume's server or Rust core.

**Note:** GitHub Copilot CLI (`gh copilot`) has been removed from the plan due to:
- Limited capabilities (no file editing, no tool calls)
- Fragile PTY screen-scraping required
- OpenAI `codex` CLI provides full functionality

## Authentication
Authentication is handled entirely by the official `codex` CLI. Yume does **not** manage API keys.

### User Setup (One-Time)
```bash
# Install the official Codex CLI
npm install -g codex-cli

# Authenticate (user runs this separately)
codex auth login
```

### Auth Verification in yume-cli
```typescript
// Check if codex CLI is installed and authenticated
async function verifyCodexCLI(): Promise<{ installed: boolean; authenticated: boolean }> {
  try {
    // Check if binary exists
    const { exitCode } = await execAsync('codex --version');
    if (exitCode !== 0) {
      return { installed: false, authenticated: false };
    }

    // Check auth status
    const { stdout, exitCode: authExitCode } = await execAsync('codex auth status');
    const authenticated = authExitCode === 0 && !stdout.includes('not authenticated');

    return { installed: true, authenticated };
  } catch (error) {
    return { installed: false, authenticated: false };
  }
}
```

### Auth Status Display in UI
Yume's settings should show:
- Whether `codex` CLI is installed
- Whether the user is authenticated
- Prompt to run `codex auth login` if not authenticated

## Protocol Mapping
All OpenAI output must be normalized to the Claude-compatible stream-json format described in:
`docs/expansion-plan/PROTOCOL_NORMALIZATION.md`.

### Required Emissions
- `system` init message with `session_id`, `model`, `cwd`, `permissionMode`, `tools`.
- `text` for streamed content chunks.
- `tool_use` / `tool_result` for function calls and local tool execution.
- `usage` and terminal `result` for token tracking and UI completion.

### Tool Set (Recommended)
`Read`, `Write`, `Edit`, `MultiEdit`, `Glob`, `Grep`, `LS`, `Bash`

## CLI Spawning

### Basic Usage
```typescript
// Spawn the official codex CLI
async function spawnCodexCLI(options: {
  model: string;
  prompt: string;
  sessionId?: string;
  cwd: string;
}): Promise<ChildProcess> {
  // Construct arguments for official codex CLI
  const args = [
    '--model', options.model,
    '--output-format', 'stream-json',  // If supported
    '--prompt', options.prompt,
  ];

  if (options.sessionId) {
    args.push('--session-id', options.sessionId);
  }

  const process = spawn('codex', args, {
    cwd: options.cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  return process;
}
```

### Stream Translation
The official `codex` CLI emits its own stream-json format. `yume-cli` must translate this to Claude-compatible format:

```typescript
interface CodexStreamMessage {
  type: 'text' | 'tool_call' | 'tool_result' | 'usage' | 'done';
  content?: string;
  // ... Codex-specific fields
}

interface ClaudeStreamMessage {
  type: 'text' | 'tool_use' | 'tool_result' | 'usage' | 'result';
  content?: string;
  // ... Claude-specific fields
}

function translateCodexToClaudeMessage(codexMsg: CodexStreamMessage): ClaudeStreamMessage | null {
  switch (codexMsg.type) {
    case 'text':
      return { type: 'text', content: codexMsg.content };

    case 'tool_call':
      // Translate tool_call to tool_use
      return {
        type: 'tool_use',
        id: codexMsg.id || generateToolUseId(),
        name: codexMsg.functionName,
        input: codexMsg.arguments,
      };

    case 'tool_result':
      // Pass through (already compatible)
      return {
        type: 'tool_result',
        tool_use_id: codexMsg.callId,
        content: codexMsg.result,
      };

    case 'usage':
      return normalizeCodexUsage(codexMsg);

    case 'done':
      return { type: 'result', is_error: false };

    default:
      return null;
  }
}
```

## Tooling (Function Calling)
The official `codex` CLI handles tool calls natively. `yume-cli` just needs to:
- Translate tool call format to Claude-compatible `tool_use` messages.
- Translate tool results back to Claude format.
Use `docs/expansion-plan/TOOL_SCHEMA_REFERENCE.md` for input field expectations (e.g., `file_path`).

## O1 / Reasoning Models
If models emit reasoning or "thinking" signals:
- Prefer mapping to `thinking` events if a structured signal exists.
- Otherwise treat as plain `text` to avoid UI breakage.

## Context Window Limits

| Model | Input Limit | Output Limit | Compaction Threshold |
|-------|-------------|--------------|---------------------|
| gpt-4o | 128,000 | 16,384 | 60% (~77K tokens) |
| gpt-4o-mini | 128,000 | 16,384 | 60% |
| o1 | 200,000 | 100,000 | 60% (~120K tokens) |
| o1-mini | 128,000 | 65,536 | 60% |
| o3-mini | 200,000 | 100,000 | 60% |

### Compaction Note

OpenAI models have smaller context than Gemini, so compaction behaves more like Claude:
- Threshold at 60% (same as Claude)
- O1/O3 reasoning models output can be very long; watch output limits

## Rate Limit Handling

OpenAI uses aggressive rate limiting. Implement robust retry logic:

```typescript
interface RateLimitState {
  retryAfter: number | null;
  requestsRemaining: number | null;
  tokensRemaining: number | null;
}

async function callOpenAIWithRetry(
  request: OpenAIRequest,
  maxRetries = 3
): Promise<Response> {
  const backoff = {
    initial: 1000,
    max: 60000,
    multiplier: 2,
  };

  let delay = backoff.initial;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await callOpenAI(request);

    if (response.ok) {
      return response;
    }

    if (response.status === 429) {
      // Rate limited - check retry-after header
      const retryAfter = response.headers.get('retry-after');
      if (retryAfter) {
        delay = parseInt(retryAfter, 10) * 1000;
      } else {
        delay = Math.min(delay * backoff.multiplier, backoff.max);
      }

      console.error(`[yume-cli] Rate limited, retrying in ${delay}ms`);
      await sleep(delay);
      continue;
    }

    if (response.status >= 500) {
      // Server error - retry with backoff
      delay = Math.min(delay * backoff.multiplier, backoff.max);
      console.error(`[yume-cli] Server error ${response.status}, retrying in ${delay}ms`);
      await sleep(delay);
      continue;
    }

    // Other errors - don't retry
    throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
  }

  throw new Error('Max retries exceeded');
}
```

### Rate Limit Headers

Parse OpenAI rate limit headers for proactive throttling:

```typescript
function parseRateLimitHeaders(headers: Headers): RateLimitState {
  return {
    retryAfter: headers.has('retry-after')
      ? parseInt(headers.get('retry-after')!, 10)
      : null,
    requestsRemaining: headers.has('x-ratelimit-remaining-requests')
      ? parseInt(headers.get('x-ratelimit-remaining-requests')!, 10)
      : null,
    tokensRemaining: headers.has('x-ratelimit-remaining-tokens')
      ? parseInt(headers.get('x-ratelimit-remaining-tokens')!, 10)
      : null,
  };
}
```

## Error Handling & Recovery
- **Auth missing/invalid:** Emit `system` error before session start.
- **Rate limit (429):** Emit `error`, wait for retry-after, then retry.
- **Server error (5xx):** Retry with exponential backoff, max 3 attempts.
- **Stream disconnect:** Retry once with the same session id, then fail cleanly.
- **Tool schema mismatch:** Emit `tool_result` with `is_error: true`; log details to stderr only.
- **Context overflow:** Emit `error` suggesting compaction, then `result` with `is_error: true`.

## Yume Integration Points
- **Rust/Tauri:** Add an OpenAI/Codex spawner or adapter that launches `yume-cli --provider openai` with `--model`, `--cwd`, and `--session-id`.
- **yume-cli Shim:** The shim spawns the official `codex` CLI binary and translates its stream-json output.
- **Server Adapter:** Node server spawns `yume-cli --provider openai` and forwards translated stdout to the existing stream parser.
- **Settings:**
  - CLI detection: Check if `codex` CLI is installed
  - Auth status: Check if user is authenticated
  - Model selection dropdown
  - Link to installation instructions (`npm install -g codex-cli`)
- **Event Flow:** Reuse `claude-message:{sessionId}` events to avoid frontend refactors.

## Research Checklist
- Confirm which OpenAI endpoints support tool calls + streaming (Chat vs Responses).
- Validate usage fields for cost tracking (input/output tokens).
- Validate model naming conventions (stable IDs for analytics).
- Confirm rate limits and error codes (429, 503) for retry logic.
- Confirm partial tool-call JSON chunking behavior.

## Implementation Steps
1. Install and test the official `codex-cli` package to understand its stream-json format.
2. Implement CLI spawner in `yume-cli` that launches `codex` binary with appropriate args.
3. Build stream-json translation layer to convert Codex messages to Claude-compatible format.
4. Implement CLI detection and auth verification commands.
5. Wire `yume-cli --provider openai` into Yume's server adapter.
6. Add UI for CLI installation status and auth verification.
7. Run golden transcript tests on macOS, Windows, Linux.

## User Documentation

Users will need to:
1. Install the Codex CLI globally:
   ```bash
   npm install -g codex-cli
   ```

2. Authenticate with their OpenAI account:
   ```bash
   codex auth login
   ```

3. Select OpenAI as their provider in Yume's settings
4. Choose an OpenAI model (GPT-4o, GPT-4o Mini, O1, O1 Mini, O3 Mini)

Yume will verify the CLI is installed and authenticated before allowing OpenAI sessions to start.
