# Gemini Integration Plan

## Objective
Enable Yume to drive Google's Gemini models via a CLI-compatible shim while preserving Claude-compatible stream-json so the existing UI and parser remain unchanged.

## Integration Strategy (Shim-First)
1. **Primary Path:** `yume-cli --provider gemini` (emits Claude-compatible stream-json).
2. **Optional Path:** Wrap a stable Gemini CLI *only if* it can be normalized without screen scraping.
3. **No SDKs in Server:** Any REST/SDK usage lives inside `yume-cli`, not the Rust core.

## Authentication
Yume does **not** store API keys. Auth is sourced from the host machine:
- **Preferred:** `gcloud auth print-access-token`
- **Fallback:** Application Default Credentials (`GOOGLE_APPLICATION_CREDENTIALS`)
- **Optional:** `GOOGLE_API_KEY` (env var only; not stored)

### Auth Research Checklist (All Platforms)
- Verify token acquisition on macOS, Windows, and Linux.
- Confirm token refresh behavior and how to detect expiration.
- Confirm minimal permissions required for Gemini API access.

### Token Caching

`gcloud auth print-access-token` is slow (~500ms). Cache tokens in memory:

```typescript
class GcloudAuthCache {
  private token: string | null = null;
  private expiresAt: number = 0;
  private refreshPromise: Promise<string> | null = null;

  async getToken(): Promise<string> {
    const now = Date.now();

    // Return cached token if still valid (5 min buffer)
    if (this.token && now < this.expiresAt - 300_000) {
      return this.token;
    }

    // Deduplicate concurrent refresh requests
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.refresh();
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async refresh(): Promise<string> {
    try {
      const { stdout } = await execAsync('gcloud auth print-access-token', {
        timeout: 10_000,
      });

      this.token = stdout.trim();
      // Google tokens expire in 1 hour, cache for 55 minutes
      this.expiresAt = Date.now() + 55 * 60 * 1000;

      return this.token;
    } catch (error) {
      throw new Error(`Failed to get gcloud token: ${error.message}`);
    }
  }

  invalidate(): void {
    this.token = null;
    this.expiresAt = 0;
  }
}

// Singleton instance
export const gcloudAuth = new GcloudAuthCache();
```

### Auth Fallback Chain

```typescript
async function getGeminiAuth(): Promise<{ type: 'bearer' | 'api-key'; value: string }> {
  // 1. Try gcloud CLI (preferred)
  try {
    const token = await gcloudAuth.getToken();
    return { type: 'bearer', value: token };
  } catch {
    // gcloud not available or not logged in
  }

  // 2. Try ADC file
  const adcPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (adcPath && await fileExists(adcPath)) {
    try {
      const token = await getTokenFromADC(adcPath);
      return { type: 'bearer', value: token };
    } catch {
      // ADC file invalid
    }
  }

  // 3. Try API key (least preferred - no user identity)
  const apiKey = process.env.GOOGLE_API_KEY;
  if (apiKey) {
    return { type: 'api-key', value: apiKey };
  }

  throw new Error(
    'No Gemini authentication found. Run `gcloud auth login` or set GOOGLE_API_KEY.'
  );
}
```

### 401 Handling

On 401 response, invalidate cache and retry once:

```typescript
async function callGeminiWithRetry(request: GeminiRequest): Promise<Response> {
  const auth = await getGeminiAuth();
  let response = await callGemini(request, auth);

  if (response.status === 401 && auth.type === 'bearer') {
    // Token may have expired, force refresh
    gcloudAuth.invalidate();
    const newAuth = await getGeminiAuth();
    response = await callGemini(request, newAuth);
  }

  return response;
}
```

## Protocol Mapping
All Gemini output must be normalized to the Claude-compatible stream-json format described in:
`docs/expansion-plan/PROTOCOL_NORMALIZATION.md`.

### Required Emissions
- `system` init message with `session_id`, `model`, `cwd`, `permissionMode`, `tools`.
- `text` for streamed content chunks.
- `tool_use` / `tool_result` for function calls and local tool execution.
- `usage` and terminal `result` for token tracking and UI completion.

## Tool Support
Gemini function calling should be mapped to Yume's standard tools:
- `Read`, `Write`, `Edit`, `MultiEdit`, `Glob`, `Grep`, `LS`, `Bash`

If Gemini returns partial function arguments, buffer until valid JSON before emitting `tool_use`.
Use `docs/expansion-plan/TOOL_SCHEMA_REFERENCE.md` for input field expectations (e.g., `file_path`).

## Context Management
Gemini models have massive context windows (up to 1M tokens).

### Context Window Limits

| Model | Input Limit | Output Limit | Compaction Threshold |
|-------|-------------|--------------|---------------------|
| gemini-1.5-pro | 1,000,000 | 8,192 | 80% (~800K tokens) |
| gemini-1.5-flash | 1,000,000 | 8,192 | 80% |
| gemini-2.0-flash | 1,000,000 | 8,192 | 80% |
| gemini-2.0-flash-thinking | 32,767 | 8,192 | 60% |

### Compaction Strategy

Because Gemini has huge context, compaction rarely triggers:
- Set threshold to 80% (vs 60% for Claude)
- Still emit `usage` so Yume's context bar remains accurate
- When compaction does trigger, summarize old messages like Claude

```typescript
function getCompactionThreshold(model: string): number {
  if (model.includes('thinking')) {
    return 0.60; // Thinking models have smaller context
  }
  return 0.80; // Standard Gemini models
}
```

### Usage Estimation

Gemini returns usage in API responses. Map to standard format:

```typescript
interface GeminiUsage {
  promptTokenCount: number;
  candidatesTokenCount: number;
  cachedContentTokenCount?: number;
}

function normalizeGeminiUsage(usage: GeminiUsage): TokenUsage {
  return {
    inputTokens: usage.promptTokenCount,
    outputTokens: usage.candidatesTokenCount,
    cacheReadTokens: usage.cachedContentTokenCount || 0,
  };
}
```

## Error Handling & Recovery
- **Auth failure:** Emit `system` with `subtype: "error"` and halt session creation.
- **Quota exceeded:** Emit `error` and `result` with `is_error: true`.
- **Stream disconnect:** Retry once with the same session id, then fail cleanly.
- **Tool schema mismatch:** Emit `tool_result` with `is_error: true`; log details to stderr only.

## Yume Integration Points
- **Rust/Tauri:** Add a Gemini spawner or adapter that launches `yume-cli --provider gemini` with `--model`, `--cwd`, and `--session-id`.
- **Server Adapter:** If using the Node server path, add a shim adapter that spawns `yume-cli` and forwards stdout to the existing stream parser.
- **Settings:** Allow model selection and optional `gcloud` path override.
- **Event Flow:** Reuse `claude-message:{sessionId}` events to avoid frontend refactors.

## Research Checklist
- Confirm streaming payload shape (delta vs full content chunks).
- Confirm function calling format and required fields.
- Validate usage metadata and token units.
- Validate stable model identifiers for analytics.
- Validate rate limit headers and retry semantics.
- Confirm safety settings defaults and override options.

## Implementation Steps
1. Implement `GeminiStrategy` inside `yume-cli` using REST streaming.
2. Normalize output to Claude-compatible stream-json.
3. Wire `adapters/shim.js` to spawn `yume-cli --provider gemini`.
4. Run golden transcript tests on macOS, Windows, Linux.
