# Translation Layer Edge Cases & Compatibility

This document enumerates scenarios the translation layer (`yume-cli` or adapters) must handle to ensure Yume behaves consistently across Claude, Gemini, and OpenAI/Codex.

## 1. Provider Capability Matrix (Minimum)
| Capability | Claude CLI | Gemini (Shim) | OpenAI/Codex (Shim) | Notes |
|------------|------------|---------------|---------------------|-------|
| Streaming text | ✅ | ✅ | ✅ | Must emit `text` chunks |
| Tool calls | ✅ | ✅ | ✅ | Buffer partial args |
| Usage tokens | ✅ | ✅ | ✅ | Use fallback tokenizer if missing |
| Interrupt | ✅ | ✅ | ✅ | Emit `interrupt` + `result` |
| Session resume | ✅ | ✅ | ✅ | Stable `session_id` required |
| Compaction boundary | ✅ | ⚠️ | ⚠️ | Shim may simulate if needed |
| Tool approvals | ✅ | ✅ | ✅ | Honor `permissionMode` |

## 1.1 Feature Parity Matrix (Extended)

This matrix shows which features work with which providers:

| Feature | Claude | Gemini | OpenAI | Notes |
|---------|--------|--------|--------|-------|
| Text streaming | ✅ | ✅ | ✅ | Core requirement |
| Tool calls | ✅ | ✅ | ✅ | Core requirement |
| Multi-tool parallel | ✅ | ✅ | ✅ | Shim serializes for determinism |
| Image input | ✅ | ✅ | ✅ | Base64 encoding required |
| PDF input | ✅ | ✅ | ❌ | OpenAI lacks native PDF support |
| Thinking/reasoning | ✅ | ⚠️ | ✅ | Gemini 2.0 Thinking, O1/O3 models |
| Extended thinking | ✅ | ❌ | ✅ | Sonnet 4 / O1 models only |
| Session resume | ✅ | ✅* | ✅* | *Shim maintains local state |
| Native session files | ✅ | ❌ | ❌ | Only Claude uses ~/.claude/projects |
| MCP (Model Context Protocol) | ✅ | ❌ | ❌ | Claude-only feature |
| Subagents (Task tool) | ✅ | ⚠️ | ⚠️ | Shim simulates via nested calls |
| Caching (prompt cache) | ✅ | ✅ | ❌ | OpenAI has no caching API |
| Custom agents | ✅ | ✅ | ✅ | Via system prompt injection |
| Hooks | ✅ | ⚠️ | ⚠️ | PreToolUse/PostToolUse only in shim |
| Skills | ✅ | ✅ | ✅ | Injected via system prompt |
| Context compaction | ✅ | ✅ | ✅ | Different thresholds per provider |
| Cost tracking | ✅ | ✅ | ✅ | Provider-specific pricing |
| Token counting | ✅ | ✅ | ✅ | Tiktoken fallback for estimates |

**Legend:**
- ✅ = Full support
- ⚠️ = Partial/simulated support
- ❌ = Not supported

### Degradation Strategy

When a feature is unsupported:
1. **Silent degradation:** Disable feature, no error (e.g., MCP)
2. **Warning:** Log to stderr, continue (e.g., PDF on OpenAI)
3. **Error:** Block if critical (e.g., no tools on a tool-heavy task)

## 2. Protocol Edge Cases
- **Partial JSON:** Buffer tool call arguments until valid JSON; never emit partial `tool_use`.
- **Long lines:** Keep JSON lines under ~100KB to avoid parser drops.
- **Invalid UTF-8:** Sanitize to valid UTF-8 before emitting JSON.
- **Missing usage:** Provide estimated token counts and mark as such in `result`.
- **Multiple tool calls:** Emit sequential `tool_use` events, wait for each `tool_result`.
- **Parallel tool calls:** Providers may return multiple calls in one turn; serialize them deterministically.
- **Out-of-order events:** Never emit `tool_result` before `tool_use`.
- **No result:** Always emit a terminal `result` to end the turn.
- **Tool schema drift:** Log unexpected tool fields to stderr; avoid dropping required fields.
- **Legacy terminators:** `$` is accepted by the parser but avoid emitting it from shims.
- **Field mapping:** File tools must use `file_path` even if providers return `path`.

## 3. Authentication & Identity Scenarios
- CLI not installed / path invalid.
- Auth token expired or missing.
- Multiple auth sources present (prefer CLI token, fallback to env var).
- Multi-account selection (choose active account or prompt user).

## 4. Network & Provider Failures
- Offline network or DNS failure.
- TLS/SSL errors.
- 401/403 auth errors.
- 429 rate limits with retry-after.
- 500/503 transient errors.
- Streaming disconnect mid-response.

### Rate Limit Handling (Detailed)

```typescript
interface BackoffConfig {
  initial: number;      // Initial delay in ms
  max: number;          // Maximum delay in ms
  multiplier: number;   // Exponential multiplier
  jitter: number;       // Randomization factor (0-1)
  maxRetries: number;   // Maximum retry attempts
}

const BACKOFF_DEFAULTS: BackoffConfig = {
  initial: 1000,
  max: 60000,
  multiplier: 2,
  jitter: 0.1,
  maxRetries: 3,
};

// Provider-specific configurations
const PROVIDER_BACKOFF: Record<string, Partial<BackoffConfig>> = {
  gemini: {
    initial: 500,       // Gemini is more generous
    maxRetries: 5,
  },
  openai: {
    initial: 1000,      // OpenAI rate limits more aggressively
    max: 120000,        // Allow longer waits
    maxRetries: 3,
  },
};

async function withRetry<T>(
  provider: string,
  fn: () => Promise<T>,
  config?: Partial<BackoffConfig>
): Promise<T> {
  const opts = {
    ...BACKOFF_DEFAULTS,
    ...PROVIDER_BACKOFF[provider],
    ...config,
  };

  let delay = opts.initial;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Check if retryable
      if (!isRetryableError(error)) {
        throw error;
      }

      // Check for retry-after header
      const retryAfter = getRetryAfter(error);
      if (retryAfter) {
        delay = retryAfter * 1000;
      } else {
        delay = Math.min(delay * opts.multiplier, opts.max);
      }

      // Add jitter
      delay *= (1 + (Math.random() - 0.5) * opts.jitter * 2);

      console.error(
        `[yume-cli] Retry ${attempt + 1}/${opts.maxRetries} in ${Math.round(delay)}ms`
      );

      await sleep(delay);
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

function isRetryableError(error: any): boolean {
  const status = error?.status || error?.response?.status;
  return status === 429 || status >= 500;
}

function getRetryAfter(error: any): number | null {
  const header = error?.response?.headers?.get?.('retry-after')
    || error?.headers?.['retry-after'];

  if (header) {
    const seconds = parseInt(header, 10);
    if (!isNaN(seconds)) return seconds;
  }

  return null;
}
```

### Provider-Specific Rate Limits

| Provider | Requests/min | Tokens/min | Strategy |
|----------|-------------|------------|----------|
| Claude | ~60 | ~100K | Generous, rarely hit |
| Gemini | ~60 | ~1M | Very generous |
| OpenAI Tier 1 | 500 | 30K | Aggressive limiting |
| OpenAI Tier 4+ | 10K | 800K | More headroom |
| Azure OpenAI | Varies | Varies | Check deployment limits |

## 5. Tool Execution Scenarios
- Permission denied or read-only filesystem.
- Tool input path outside working directory.
- Binary missing for tool execution (`Bash`).
- Long command output (chunk or summarize).
- Tool returns non-zero exit; emit `tool_result` with `is_error: true`.
- Interactive approval timeout; emit `tool_result` with `is_error: true`.

## 6. Windows & WSL Specifics
- Path normalization (`C:\` vs `/mnt/c/`).
- Spaces in paths and quoting.
- Line endings (`\r\n`).
- WSL availability detection and fallback.

## 7. Context & Compaction Scenarios
- Provider with huge context (Gemini) where auto-compaction is unnecessary.
- Provider with smaller context where compaction is required.
- Compaction triggered while tool execution is pending.
- Session id changes after compaction (`system` with `subtype: "session_id"`).

## 8. UI/UX Consistency
- Streaming indicator starts at first `text` or `tool_use`.
- Stop button triggers `interrupt` and ends with `result`.
- Tool approvals always gate execution in `interactive` mode.
- Errors must surface in UI without breaking the session.

## 9. Observability
- All debug logs go to stderr.
- Include provider name in stderr logs for easier triage.
- Emit provider-specific error codes where possible.

## 10. Test Matrix (Minimum)
Run golden transcript tests across:
- **OS:** macOS, Windows, Linux
- **Providers:** Claude, Gemini (shim), OpenAI/Codex (shim)
- **Scenarios:** text-only, single tool, multiple tools, tool error, interrupt, auth failure, rate limit, stream disconnect.
