# Yume CLI (`yume-cli`) Technical Specification

> **Last Updated:** 2026-01-14
> **Implementation Status:** ~60% complete (structure done, translation pending)

## Implementation Summary

| Component | Status | Location |
|-----------|--------|----------|
| Directory Structure | ✅ Complete | `src-yume-cli/` |
| Entry Point | ✅ Complete | `src-yume-cli/src/index.ts` |
| CLI Argument Parsing | ✅ Complete | `src-yume-cli/src/index.ts` |
| Provider Interface | ✅ Complete | `src-yume-cli/src/providers/base.ts` |
| Provider Factory | ✅ Complete | `src-yume-cli/src/providers/index.ts` |
| Gemini Provider Stub | ✅ Complete | `src-yume-cli/src/providers/gemini.ts` |
| OpenAI Provider Stub | ✅ Complete | `src-yume-cli/src/providers/openai.ts` |
| Agent Loop | ✅ Complete | `src-yume-cli/src/core/agent-loop.ts` |
| Session Management | ✅ Complete | `src-yume-cli/src/core/session.ts` |
| Stream Emission | ✅ Complete | `src-yume-cli/src/core/emit.ts` |
| Path Security | ✅ Complete | `src-yume-cli/src/core/pathSecurity.ts` |
| Tool: Glob | ✅ Complete | `src-yume-cli/src/tools/glob.ts` |
| Tool: Grep | ✅ Complete | `src-yume-cli/src/tools/grep.ts` |
| Tool: LS | ✅ Complete | `src-yume-cli/src/tools/ls.ts` |
| Tool: Bash | ✅ Complete | `src-yume-cli/src/tools/bash.ts` |
| Tool: File (Read) | ✅ Complete | `src-yume-cli/src/tools/file.ts` |
| Tool: Edit | ✅ Complete | `src-yume-cli/src/tools/edit.ts` |
| Tool: Write | ✅ Complete | `src-yume-cli/src/tools/write.ts` |
| CLI Spawning | ❌ Pending | Gemini/Codex binary spawning |
| Stream Translation | ❌ Pending | Provider → Claude format |
| Build Scripts | ❌ Pending | `build:yume-cli:*` commands |

## Overview
`yume-cli` is a standalone Node.js executable that acts as a **thin translation shim**. It spawns official CLI binaries (`gemini` from @google/gemini-cli, `codex` for OpenAI) and translates their stream-json output to Claude-compatible format.

The **non-negotiable contract**: `yume-cli` must emit line-delimited JSON objects that match the current Claude stream protocol parsed by Yume (`src-tauri/src/stream_parser.rs`).

## Key Architecture Shift
**Previous approach:** `yume-cli` would implement the full agent loop (Think → Act → Observe) and make REST API calls directly.

**New approach:** `yume-cli` is a thin shim that:
1. Spawns the official CLI for the selected provider (`gemini`, `codex`)
2. Reads the CLI's stdout stream-json
3. Translates messages to Claude-compatible format
4. Emits translated messages to its own stdout

This approach:
- Delegates authentication to official CLIs (no API key management)
- Reduces maintenance burden (official CLIs handle updates)
- Leverages official tool implementations
- Simplifies the codebase significantly

## Implementation Stack

### Language & Runtime
- **Language:** TypeScript (Node.js 20+)
- **Compiler:** `@yao-pkg/pkg` for cross-platform binaries
- **Source Location:** `src-yume-cli/` at project root

### Directory Structure
```
src-yume-cli/
├── index.ts              # Entry point, CLI parsing
├── core/
│   ├── spawner.ts        # CLI process spawning
│   ├── translator.ts     # Stream-json translation
│   └── emit.ts           # Stdout JSON emission
├── providers/
│   ├── base.ts           # Provider interface
│   ├── gemini.ts         # Gemini CLI spawner + translator
│   ├── openai.ts         # Codex CLI spawner + translator
│   └── claude.ts         # Claude CLI spawner (passthrough)
├── translators/
│   ├── gemini-to-claude.ts   # Gemini → Claude message translation
│   ├── codex-to-claude.ts    # Codex → Claude message translation
│   └── types.ts              # Stream message type definitions
├── detection/
│   ├── cli-detector.ts   # Detect installed CLIs
│   └── auth-checker.ts   # Check authentication status
├── utils/
│   ├── process.ts        # Process management utilities
│   ├── paths.ts          # Cross-platform path handling
│   └── logger.ts         # Debug logging to stderr
└── types.ts              # Shared type definitions
```

### Dependencies
```json
{
  "dependencies": {},
  "devDependencies": {
    "@yao-pkg/pkg": "^5.0.0",
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0"
  }
}
```

**Note:** Zero runtime dependencies. Everything uses Node.js built-in APIs (child_process, fs, path, etc.). No provider SDKs, no tiktoken, no HTTP libraries.

### Build Commands
```bash
# Development
npx ts-node src-yume-cli/index.ts --provider gemini --model gemini-1.5-pro

# Production build
npm run build:yume-cli:macos    # -> src-tauri/resources/yume-cli-macos-arm64
npm run build:yume-cli:windows  # -> src-tauri/resources/yume-cli-windows-x64.exe
npm run build:yume-cli:linux    # -> src-tauri/resources/yume-cli-linux-x64
npm run build:yume-cli:all      # All platforms
```

### Binary Targets
| Platform | Binary Name | Architecture |
|----------|-------------|--------------|
| macOS | `yume-cli-macos-arm64` | Apple Silicon |
| macOS | `yume-cli-macos-x64` | Intel |
| Windows | `yume-cli-windows-x64.exe` | x64 |
| Linux | `yume-cli-linux-x64` | x64 |

## Architecture

### 1. CLI Spawner + Stream Translator
The shim spawns the official CLI and translates its output in real-time.

```typescript
async function runYumeCLI(provider: string, options: CLIOptions): Promise<void> {
  // 1) Spawn the official CLI for the provider
  const cliProcess = spawnProviderCLI(provider, options);

  // 2) Read stdout line-by-line
  const reader = readline.createInterface({
    input: cliProcess.stdout,
    crlfDelay: Infinity,
  });

  // 3) Translate each message and emit to our stdout
  for await (const line of reader) {
    try {
      const providerMessage = JSON.parse(line);
      const claudeMessage = translateMessage(provider, providerMessage);

      if (claudeMessage) {
        // Emit translated message to our stdout
        console.log(JSON.stringify(claudeMessage));
      }
    } catch (error) {
      // Log parse errors to stderr
      console.error(`[yume-cli] Failed to parse message: ${error.message}`);
    }
  }

  // 4) Wait for process to complete
  const exitCode = await waitForExit(cliProcess);

  if (exitCode !== 0) {
    // Emit error result
    console.log(JSON.stringify({
      type: 'result',
      is_error: true,
      error: `CLI exited with code ${exitCode}`
    }));
  }
}
```

### 2. Compatibility Contract (Stdout Protocol)
`yume-cli` must emit **Claude stream-json**. One JSON object per line, no prefixes, no ANSI.

Minimum required types:
- `system` (init metadata)
- `text` (streamed content)
- `tool_use` / `tool_result`
- `usage`
- `result`
- `message_stop` (recommended)

See `docs/expansion-plan/PROTOCOL_NORMALIZATION.md` for full mapping.

### 3. Process Model (Compatibility with Existing Server)
Yume currently spawns the Claude CLI per turn. To minimize server changes, `yume-cli` should support **both**:

1. **Spawn-per-turn mode** (preferred for compatibility)
   - Accept `--prompt` (or stdin) and `--resume <session_id>` to continue a session.
   - Exit after emitting `result` and `message_stop`.

2. **Persistent session mode** (future optimization)
   - `yume-cli start --session-id <id>` keeps the process alive.
   - Read control frames from stdin (JSON lines):
     - `{ "type": "user", "content": "..." }`
     - `{ "type": "interrupt" }`
     - `{ "type": "set_permission_mode", "mode": "interactive|auto|deny" }`
     - `{ "type": "tool_approval", "id": "call_1", "approved": true }`

### 4. Session + State Handling
- Maintain a **local session id** that is stable across retries.
- Store conversation history in memory with optional persistence (see Session Persistence below).
- Emit `system` init once per session:
  - `subtype: "init"`
  - `session_id`, `model`, `cwd`, `permissionMode`, `tools`
- Default `permissionMode` should be `"default"` unless the UI explicitly requests another value.
- On interrupts, emit `interrupt` then a terminal `result` with `is_error: true`.
- Emit `system` with `subtype: "session_id"` if the session id changes (compaction or migration).

## Session Persistence

### Storage Location
Provider sessions are stored separately from Claude's native sessions:

```
~/.yume/sessions/
├── gemini/
│   ├── sess-abc123.json
│   └── sess-def456.json
├── openai/
│   └── sess-ghi789.json
└── index.json  # Session index for quick lookup
```

**Note:** Claude native sessions remain in `~/.claude/projects/`. These are not duplicated.

### Session File Schema
```json
{
  "id": "sess-abc123",
  "provider": "gemini",
  "model": "gemini-1.5-pro",
  "cwd": "/Users/yuru/project",
  "created": "2025-01-14T00:00:00Z",
  "updated": "2025-01-14T01:30:00Z",
  "history": [
    {
      "role": "user",
      "content": "Refactor the login component"
    },
    {
      "role": "assistant",
      "content": "I'll help you refactor...",
      "tool_calls": [
        { "id": "call_1", "name": "Read", "input": { "file_path": "/src/Login.tsx" } }
      ]
    },
    {
      "role": "tool",
      "tool_call_id": "call_1",
      "content": "// Login.tsx contents..."
    }
  ],
  "usage": {
    "total_input_tokens": 5000,
    "total_output_tokens": 1200,
    "total_cost_usd": 0.0234
  },
  "metadata": {
    "title": "Login Refactor",
    "compaction_count": 0
  }
}
```

### Session Index Schema
```json
{
  "sessions": [
    {
      "id": "sess-abc123",
      "provider": "gemini",
      "model": "gemini-1.5-pro",
      "cwd": "/Users/yuru/project",
      "title": "Login Refactor",
      "updated": "2025-01-14T01:30:00Z",
      "message_count": 24
    }
  ]
}
```

### Cross-Provider Compatibility
Sessions are **NOT portable** between providers:
- Switching providers starts a fresh session
- History format differs between providers
- Tool call IDs are provider-specific

### Session Resume Flow
```typescript
async function resumeSession(sessionId: string): Promise<Session> {
  const sessionPath = path.join(SESSIONS_DIR, provider, `${sessionId}.json`);

  if (!await fs.exists(sessionPath)) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  const session = JSON.parse(await fs.readFile(sessionPath, 'utf-8'));

  // Validate provider matches
  if (session.provider !== currentProvider) {
    throw new Error(`Cannot resume ${session.provider} session with ${currentProvider}`);
  }

  return session;
}
```

## Tool Definitions (Claude-Compatible)
Yume's UI expects Claude-style tool names and payloads. Implement the same names and schema, and only advertise tools that the shim can execute.
Use the UI references in `src/renderer/config/tools.ts` and `src/renderer/components/Chat/MessageRenderer.tsx` to validate tool names and inputs.
See `docs/expansion-plan/TOOL_SCHEMA_REFERENCE.md` for UI-required input fields.

**Important:** The UI expects file tools to use `file_path` (not `path`).

### Core Tools (Required for Parity)

#### `Read`
- **Description:** Read file contents.
- **Schema:** `{ file_path, ... }`
- **Notes:** Pass through additional fields without dropping them.

#### `Write`
- **Description:** Write full content to a file.
- **Schema:** `{ file_path, content }`

#### `Edit`
- **Description:** Replace a string in a file with a new string.
- **Schema:** `{ file_path, old_string, new_string }`
- **Notes:** Apply deterministic replacements; avoid partial line edits unless exact match fails.

#### `MultiEdit`
- **Description:** Apply multiple edits to a single file.
- **Schema:** `{ file_path, edits: [{ old_string, new_string }] }`

#### `Glob`
- **Description:** Find files matching a pattern.
- **Schema:** `{ pattern, path? }`

#### `Grep`
- **Description:** Search within files.
- **Schema:** `{ pattern, path? }`

#### `LS`
- **Description:** List directory contents.
- **Schema:** `{ path? }`

#### `Bash`
- **Description:** Run a shell command.
- **Schema:** `{ command }`
- **Safety:** Respect Yume Guard and permission mode. Log stdout/stderr to `tool_result`.

### Optional Tools (Only If Implemented)

#### `WebFetch`
- **Schema:** `{ url }`

#### `WebSearch`
- **Schema:** `{ query }`

#### `TodoWrite`
- **Schema:** `{ todos: [...] }`

#### `Task`
- **Schema:** `{ description, subagent_type? }`

#### `TaskOutput`
- **Schema:** `{ task_id? }`

#### `NotebookEdit`
- **Schema:** `{ notebook_path, ... }`

#### `Skill`, `LSP`, `KillShell`
- **Schema:** provider-defined; pass through without transformation.

If a tool is not implemented, do **not** list it in the `system.tools` array.

## Provider Strategies
The CLI accepts `--provider` to select which official CLI to spawn. Each strategy spawns the official binary and translates its output.

### Gemini Strategy
- **Binary:** `gemini` (from @google/gemini-cli npm package)
- **Auth:** Handled by `gemini auth login` (user runs separately)
- **Translation:** Gemini stream-json → Claude stream-json
- **Detection:** Check for `gemini --version` to verify installation
- **Auth Check:** Run `gemini auth status` to verify authentication

### OpenAI / Codex Strategy
- **Binary:** `codex` (official OpenAI Codex CLI)
- **Auth:** Handled by `codex auth login` (user runs separately)
- **Translation:** Codex stream-json → Claude stream-json
- **Detection:** Check for `codex --version` to verify installation
- **Auth Check:** Run `codex auth status` to verify authentication

### Claude Strategy (Passthrough)
- **Binary:** `claude` (official Claude CLI)
- **Auth:** Handled by Claude CLI (auto on first run)
- **Translation:** None needed (already Claude-compatible)
- **Purpose:** Allows Yume to use a single spawner interface for all providers

## CLI Interface

```bash
yume-cli start \
  --provider <gemini|openai|codex|copilot> \
  --model <model_name> \
  --cwd <working_directory> \
  --session-id <id> \
  [--prompt <text>] \
  [--resume <session_id>] \
  [--output-format stream-json] \
  [--api-base <url>] \
  [--permission-mode <default|interactive|auto|deny>] \
  [--protocol-version <v>] \
  [--verbose]
```

## Error Handling
- **Auth failure:** Emit `system` with `subtype: "error"` + human-readable message.
- **Tool error:** Emit `tool_result` with `is_error: true` and include stderr.
- **Provider error:** Emit `error`, then `result` with `is_error: true`.

## Cross-Platform Requirements
- Normalize paths (Windows vs POSIX) before tool execution.
- Emit UTF-8 JSON; replace invalid bytes.
- Log debug output to stderr only.
 - Flush stdout after every JSON line to keep UI streaming responsive.

## Security & Safety
- Respect `permissionMode` for all tool execution.
- Deny or sandbox commands that escape the working directory when configured.
- Avoid echoing secrets into `tool_result` payloads (redact when possible).

### Secret Detection & Redaction

Before emitting any `tool_result`, scan content for sensitive patterns:

```typescript
const SECRET_PATTERNS = [
  // API keys and tokens
  /(?:api[_-]?key|secret|password|token|auth)\s*[:=]\s*['"]?[\w\-]{20,}/gi,

  // Provider-specific patterns
  /ghp_[a-zA-Z0-9]{36}/g,           // GitHub PAT
  /github_pat_[a-zA-Z0-9_]{22,}/g,  // GitHub fine-grained PAT
  /sk-[a-zA-Z0-9]{48}/g,            // OpenAI API key
  /sk-proj-[a-zA-Z0-9\-_]{80,}/g,   // OpenAI project key
  /AIza[a-zA-Z0-9_\-]{35}/g,        // Google API key
  /ya29\.[a-zA-Z0-9_\-]+/g,         // Google OAuth token
  /AKIA[A-Z0-9]{16}/g,              // AWS Access Key ID
  /npm_[a-zA-Z0-9]{36}/g,           // NPM token

  // Private keys
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,

  // Connection strings
  /(?:mongodb|postgres|mysql|redis):\/\/[^\s]+/gi,

  // Bearer tokens in headers
  /Bearer\s+[a-zA-Z0-9\-_\.]+/gi,
];

function redactSecrets(content: string): { redacted: string; count: number } {
  let count = 0;

  const redacted = SECRET_PATTERNS.reduce((text, pattern) => {
    return text.replace(pattern, (match) => {
      count++;
      // Preserve pattern type for debugging
      const prefix = match.slice(0, 4);
      return `[REDACTED:${prefix}...]`;
    });
  }, content);

  return { redacted, count };
}

// Usage in tool execution
function emitToolResult(toolId: string, content: string): void {
  const { redacted, count } = redactSecrets(content);

  if (count > 0) {
    console.error(`[yume-cli] Warning: Redacted ${count} potential secret(s) from tool output`);
  }

  emit({
    type: 'tool_result',
    tool_use_id: toolId,
    content: redacted,
  });
}
```

### Additional Security Measures

1. **Path Validation:** Reject paths outside `cwd` unless explicitly allowed
2. **Command Filtering:** Warn on dangerous commands (`rm -rf /`, `sudo`, etc.)
3. **Output Size Limits:** Truncate tool output over 100KB to prevent memory issues
4. **Timeout Enforcement:** Kill long-running commands after configurable timeout (default: 120s)
