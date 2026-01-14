# Codex / OpenAI Integration Plan

## Objective
Enable Yume to drive OpenAI-compatible models (Codex/GPT-4o/O1, Azure OpenAI, and compatible endpoints) through the same Claude-compatible stream-json pipeline used by Claude CLI.

## Integration Strategy (Shim-First)
1. **Primary Path:** `yume-cli --provider openai` (Claude-compatible stream-json).
2. **No SDKs in Server:** Any REST/SDK usage stays inside `yume-cli`.

**Note:** GitHub Copilot CLI (`gh copilot`) has been removed from the plan due to:
- Limited capabilities (no file editing, no tool calls)
- Fragile PTY screen-scraping required
- OpenAI-compatible endpoints are universally available

Users who want Copilot-like features should use OpenAI endpoints directly.

## Authentication
Yume does **not** store API keys.
- **OpenAI:** `OPENAI_API_KEY` (env var only) and optional `OPENAI_BASE_URL`
- **Azure OpenAI:** `AZURE_OPENAI_API_KEY` + `AZURE_OPENAI_ENDPOINT`
- **Compatible Endpoints:** `OPENAI_API_KEY` + `OPENAI_BASE_URL` (for Ollama, Together, etc.)

### Auth Validation

```typescript
async function getOpenAIAuth(): Promise<OpenAIAuth> {
  // Check for Azure first (more specific)
  const azureKey = process.env.AZURE_OPENAI_API_KEY;
  const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;

  if (azureKey && azureEndpoint) {
    return {
      type: 'azure',
      apiKey: azureKey,
      baseUrl: azureEndpoint,
    };
  }

  // Standard OpenAI / compatible endpoint
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'No OpenAI authentication found. Set OPENAI_API_KEY environment variable.'
    );
  }

  return {
    type: 'openai',
    apiKey,
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  };
}
```

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

## Tooling (Function Calling)
OpenAI streams tool calls as partial JSON arguments.
The shim must:
- Buffer partial tool arguments until valid JSON.
- Emit a single `tool_use` per call with a stable id.
- Execute tools locally and emit `tool_result`.
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
- **Server Adapter:** If using the Node server path, add a shim adapter that spawns `yume-cli` and forwards stdout to the existing stream parser.
- **Settings:** Allow model selection and `OPENAI_BASE_URL` overrides.
- **Event Flow:** Reuse `claude-message:{sessionId}` events to avoid frontend refactors.

## Research Checklist
- Confirm which OpenAI endpoints support tool calls + streaming (Chat vs Responses).
- Validate usage fields for cost tracking (input/output tokens).
- Validate model naming conventions (stable IDs for analytics).
- Confirm rate limits and error codes (429, 503) for retry logic.
- Confirm partial tool-call JSON chunking behavior.

## Implementation Steps
1. Implement `OpenAIStrategy` inside `yume-cli`.
2. Normalize output to Claude-compatible stream-json.
3. Wire `adapters/shim.js` to spawn `yume-cli --provider openai`.
4. Run golden transcript tests on macOS, Windows, Linux.
