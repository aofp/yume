# Codex / OpenAI Integration Plan

> **Last Updated:** 2026-01-29
> **Implementation Status:** ~85% complete

## Implementation Summary

| Component | Status | Notes |
|-----------|--------|-------|
| Provider Definition | Done | `models.ts` with Codex 5.1 Mini/5.2 |
| Provider Service | Done | Enable/disable via `providersService.ts` |
| Provider UI | Done | Settings tab, selector, no-provider modal |
| CLI Detection | Done | `detect_provider_support` Tauri command |
| Backend Spawner | Done | `yume_cli_spawner.rs` with OpenAI enum |
| Reasoning Effort | Done | `reasoning_effort` param in spawner |
| yume-cli Provider | Done | `src-yume-cli/src/providers/openai.ts` |
| Stream Translation | Done | Codex CLI to Claude format in yume-cli |
| Auth Verification | Pending | Manual user authentication required |

## Objective
Enable Yume to drive OpenAI models (Codex/GPT-4o/O1) through the official `codex` CLI. The `yume-cli` shim spawns the official CLI and translates its stream-json output to Claude-compatible format.

## Integration Strategy (Official CLI + Shim)
1. **Primary Path:** `yume-cli --provider openai` spawns the official `codex` CLI binary.
2. **Translation Layer:** `yume-cli` parses the Codex stream-json output and translates it to Claude-compatible format.
3. **No Direct API Calls:** `yume-cli` does not make REST calls to OpenAI API - it delegates to the official CLI.
4. **No SDKs in Server:** No `openai` npm package or other SDK usage in Yume's server or Rust core.

## Authentication
Authentication is handled entirely by the official `codex` CLI. Yume does **not** manage API keys.

### User Setup (One-Time)
```bash
# Install the official Codex CLI
npm install -g @openai/codex

# Authenticate (user runs this separately)
codex login
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

**UI models (`models.ts`):**
- `gpt-5.2-codex` (200K/100K, reasoning_effort: xhigh, thinking)
- `gpt-5.1-codex-mini` (200K/100K, reasoning_effort: low)

**Extended models in yume-cli (`openai.ts`):**
- `gpt-4o` (128K/16K)
- `gpt-4o-mini` (128K/16K)
- `o1` (200K/100K)
- `o1-mini` (128K/65K)
- `o3-mini` (200K/100K)

| Model | Context | Output | Compaction |
|-------|---------|--------|------------|
| gpt-5.2-codex | 200K | 100K | 60% |
| gpt-5.1-codex-mini | 200K | 100K | 60% |
| gpt-4o | 128K | 16K | 60% |
| gpt-4o-mini | 128K | 16K | 60% |
| o1 | 200K | 100K | 60% |
| o1-mini | 128K | 65K | 60% |
| o3-mini | 200K | 100K | 60% |

Compaction uses 60% threshold (same as Claude). O1/O3 reasoning models have large outputs.

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
  - Link to installation instructions (`npm install -g @openai/codex`)
- **Event Flow:** Reuse `claude-message:{sessionId}` events to avoid frontend refactors.

## Implemented Tool Detection (in `openai.ts`)

The OpenAI provider detects tool types from command patterns:

```typescript
function detectToolFromCommand(command: string): string {
  const cmd = command.trim().toLowerCase();

  // File reading: cat, head, tail → Read
  // File search: find, fd, *.glob → Glob
  // Content search: grep, rg, ag → Grep
  // Directory listing: ls, tree → LS
  // File editing: sed, awk → Edit
  // File creation: touch, > → Write
  // Git operations: git → Bash
  // Web fetch: curl, wget → WebFetch
  // Default → Bash
}
```

The codex CLI uses `--json` output format with events like:
- `thread.started`, `turn.started` - session init
- `item.completed` - content (agent_message, reasoning, command_execution, file_read, etc.)
- `turn.completed` - usage info

## Remaining Work
- Manual auth verification (user must run `codex login` separately)
- Golden transcript tests across platforms

## User Setup

```bash
# 1. Install Codex CLI
npm install -g @openai/codex

# 2. Authenticate
codex login
```

Then select OpenAI as provider in Yume settings. Yume verifies CLI installation and auth status before starting sessions.
