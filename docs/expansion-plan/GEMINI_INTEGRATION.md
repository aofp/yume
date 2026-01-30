# Gemini Integration Plan

> **Last Updated:** 2026-01-29
> **Implementation Status:** ~85% complete

## Implementation Summary

| Component | Status | Notes |
|-----------|--------|-------|
| Provider Definition | Done | `models.ts` with Gemini 2.5 Flash/Pro |
| Provider Service | Done | Enable/disable via `providersService.ts` |
| Provider UI | Done | Settings tab, selector, no-provider modal |
| CLI Detection | Done | `detect_provider_support` Tauri command |
| Backend Spawner | Done | `yume_cli_spawner.rs` with Gemini enum |
| yume-cli Provider | Done | `src-yume-cli/src/providers/gemini.ts` |
| Stream Translation | Done | Gemini CLI to Claude format in yume-cli |
| Auth Verification | Pending | Manual user authentication required |

## Objective
Enable Yume to drive Google's Gemini models via the official `gemini` CLI (`@google/gemini-cli`). The `yume-cli` shim spawns the official CLI and translates its stream-json output to Claude-compatible format.

## Integration Strategy (Official CLI + Shim)
1. **Primary Path:** `yume-cli --provider gemini` spawns the official `gemini` CLI binary.
2. **Translation Layer:** `yume-cli` parses the Gemini stream-json output and translates it to Claude-compatible format.
3. **No Direct API Calls:** `yume-cli` does not make REST calls to Gemini API - it delegates to the official CLI.
4. **No SDKs in Server:** No `@google/generative-ai` or other SDK usage in Yume's server or Rust core.

## Authentication
Authentication is handled entirely by the official `gemini` CLI. Yume does **not** manage API keys or tokens.

### User Setup (One-Time)
```bash
# Install the official Gemini CLI
npm install -g @google/gemini-cli

# Authenticate (user runs this separately)
gemini auth login
```

### Auth Verification in yume-cli
```typescript
// Check if gemini CLI is installed and authenticated
async function verifyGeminiCLI(): Promise<{ installed: boolean; authenticated: boolean }> {
  try {
    // Check if binary exists
    const { exitCode } = await execAsync('gemini --version');
    if (exitCode !== 0) {
      return { installed: false, authenticated: false };
    }

    // Check auth status (example command - adjust based on actual CLI)
    const { stdout, exitCode: authExitCode } = await execAsync('gemini auth status');
    const authenticated = authExitCode === 0 && !stdout.includes('not authenticated');

    return { installed: true, authenticated };
  } catch (error) {
    return { installed: false, authenticated: false };
  }
}
```

### Auth Status Display in UI
Yume's settings should show:
- Whether `gemini` CLI is installed
- Whether the user is authenticated
- Prompt to run `gemini auth login` if not authenticated

## CLI Spawning

### Basic Usage
```typescript
// Spawn the official gemini CLI
async function spawnGeminiCLI(options: {
  model: string;
  prompt: string;
  sessionId?: string;
  cwd: string;
}): Promise<ChildProcess> {
  // Construct arguments for official gemini CLI
  const args = [
    '--model', options.model,
    '--output-format', 'stream-json',  // If supported
    '--prompt', options.prompt,
  ];

  if (options.sessionId) {
    args.push('--session-id', options.sessionId);
  }

  const process = spawn('gemini', args, {
    cwd: options.cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  return process;
}
```

### Stream Translation
The official `gemini` CLI emits its own stream-json format. `yume-cli` must translate this to Claude-compatible format:

```typescript
interface GeminiStreamMessage {
  type: 'text' | 'function_call' | 'function_result' | 'usage' | 'done';
  content?: string;
  // ... Gemini-specific fields
}

interface ClaudeStreamMessage {
  type: 'text' | 'tool_use' | 'tool_result' | 'usage' | 'result';
  content?: string;
  // ... Claude-specific fields
}

function translateGeminiToClaudeMessage(geminiMsg: GeminiStreamMessage): ClaudeStreamMessage | null {
  switch (geminiMsg.type) {
    case 'text':
      return { type: 'text', content: geminiMsg.content };

    case 'function_call':
      // Translate function_call to tool_use
      return {
        type: 'tool_use',
        id: generateToolUseId(),
        name: geminiMsg.functionName,
        input: geminiMsg.arguments,
      };

    case 'function_result':
      // Translate to tool_result
      return {
        type: 'tool_result',
        tool_use_id: geminiMsg.callId,
        content: geminiMsg.result,
      };

    case 'usage':
      return normalizeGeminiUsage(geminiMsg);

    case 'done':
      return { type: 'result', is_error: false };

    default:
      return null;
  }
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

Gemini function calling is mapped to Yume's standard tools via `GEMINI_TO_CLAUDE_TOOLS` in `gemini.ts`:

```typescript
// Tool name translation: Gemini CLI -> Claude format
const GEMINI_TO_CLAUDE_TOOLS: Record<string, string> = {
  'run_shell_command': 'Bash',
  'read_file': 'Read',
  'write_file': 'Write',
  'edit_file': 'Edit',
  'list_directory': 'LS',
  'find_files': 'Glob',
  'search_files': 'Grep',
  'glob': 'Glob',
  'grep': 'Grep',
  'ls': 'LS',
  'bash': 'Bash',
  'read': 'Read',
  'write': 'Write',
  'edit': 'Edit',
};
```

If Gemini returns partial function arguments, buffer until valid JSON before emitting `tool_use`.
Use `docs/expansion-plan/TOOL_SCHEMA_REFERENCE.md` for input field expectations (e.g., `file_path`).

## Context Management
Gemini models have massive context windows (up to 1M tokens).

### Context Window Limits

**UI models (`models.ts`):**
- `gemini-2.5-pro` (1M context, 8K output, thinking)
- `gemini-2.5-flash` (1M context, 8K output)

**Extended models in yume-cli (`gemini.ts`):**
- `gemini-2.0-flash` (1M/8K)
- `gemini-2.5-pro` (1M/65K)
- `gemini-2.5-flash` (1M/65K)
- `gemini-3-flash` (1M/65K)
- `gemini-2.0-flash-thinking-exp` (32K/8K)
- `gemini-1.5-pro` (1M/8K)
- `gemini-1.5-flash` (1M/8K)

| Model | Context | Output | Compaction |
|-------|---------|--------|------------|
| gemini-2.5-pro | 1M | 65K | 80% |
| gemini-2.5-flash | 1M | 65K | 80% |
| gemini-2.0-flash | 1M | 8K | 80% |
| gemini-2.0-flash-thinking-exp | 32K | 8K | 60% |
| gemini-1.5-pro | 1M | 8K | 80% |
| gemini-1.5-flash | 1M | 8K | 80% |

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
- **yume-cli Shim:** The shim spawns the official `gemini` CLI binary and translates its stream-json output.
- **Server Adapter:** Node server spawns `yume-cli --provider gemini` and forwards translated stdout to the existing stream parser.
- **Settings:**
  - CLI detection: Check if `gemini` CLI is installed
  - Auth status: Check if user is authenticated
  - Model selection dropdown
  - Link to installation instructions (`npm install -g @google/gemini-cli`)
- **Event Flow:** Reuse `claude-message:{sessionId}` events to avoid frontend refactors.

## Remaining Work
- Manual auth verification (user must run `gemini auth login` separately)
- Golden transcript tests across platforms

## User Setup

```bash
# 1. Install Gemini CLI
npm install -g @google/gemini-cli

# 2. Authenticate
gemini auth login
```

Then select Gemini as provider in Yume settings. Yume verifies CLI installation and auth status before starting sessions.
