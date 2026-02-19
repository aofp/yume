# Yume CLI (`yume-cli`) Technical Specification

> **Last Updated:** 2026-01-31
> **Status:** Complete (macOS ready, Windows/Linux binaries pending)

## Overview

`yume-cli` is a standalone Node.js executable that acts as a **universal agent shim**. It spawns official CLI binaries (`gemini` from @google/gemini-cli, `codex` from @openai/codex) and translates their output to Claude-compatible format.

**Contract:** Output must be line-delimited JSON matching `src-tauri/src/stream_parser.rs`.

## Architecture

1. Spawn official CLI for selected provider
2. Read stdout stream-json line-by-line
3. Translate messages to Claude format (tool names, event types)
4. Emit to stdout
5. Handle tool calls via local executors when needed
6. Manage session persistence in `~/.yume/sessions/{provider}/`

**Safety limits:** MAX_TURNS=50, MAX_DURATION=10min, MAX_HISTORY=100

## Directory Structure

```
src-yume-cli/
├── src/
│   ├── index.ts              # Entry point, CLI parsing
│   ├── types.ts              # Type definitions
│   ├── core/
│   │   ├── agent-loop.ts     # Think -> Act -> Observe cycle
│   │   ├── emit.ts           # Claude-compatible JSON emission
│   │   ├── pathSecurity.ts   # Path validation
│   │   ├── plugins.ts        # Plugin loader (agents, skills)
│   │   └── session.ts        # Session management
│   ├── providers/
│   │   ├── base.ts           # Provider interface
│   │   ├── index.ts          # Provider factory
│   │   ├── gemini.ts         # Gemini CLI spawner
│   │   └── openai.ts         # Codex CLI spawner
│   └── tools/
│       ├── bash.ts, edit.ts, file.ts, glob.ts, grep.ts, ls.ts, write.ts
├── dist/                     # Compiled output
└── package.json
```

## Build Commands

```bash
npm run build:yume-cli:macos    # -> src-tauri/resources/yume-cli-macos-arm64
npm run build:yume-cli:windows  # -> src-tauri/resources/yume-cli-windows-x64.exe
npm run build:yume-cli:linux    # -> src-tauri/resources/yume-cli-linux-x64
npm run build:yume-cli:all      # All platforms
```

**Zero runtime dependencies** - uses Node.js built-ins only.

## CLI Interface

```bash
yume-cli start \
  --provider <gemini|openai> \
  --model <model_name> \
  --cwd <working_directory> \
  --session-id <id> \
  [--prompt <text>] \
  [--resume <session_id>] \
  [--permission-mode <default|auto|deny>] \
  [--verbose]
```

## Protocol (Stdout)

One JSON object per line, no prefixes, no ANSI. Required types:
- `system` (init metadata)
- `text` (streamed content)
- `tool_use` / `tool_result`
- `usage`
- `result`
- `message_stop` (recommended)

See `PROTOCOL_NORMALIZATION.md` for full mapping.

## Provider Strategies

### Gemini

- **Binary:** `gemini` (from @google/gemini-cli)
- **Auth:** `gemini auth login`
- **Args:** `--model <m> --output-format stream-json --yolo <prompt>`
- **Translation:**
  - `run_shell_command` -> `Bash`
  - `read_file` -> `Read`
  - `write_file` -> `Write`
  - `edit_file` -> `Edit`
  - `list_directory` -> `LS`
  - `find_files`/`glob` -> `Glob`
  - `search_files`/`grep` -> `Grep`

### OpenAI/Codex

- **Binary:** `codex` (from @openai/codex)
- **Auth:** `codex login`
- **Args:** `exec --json -C <cwd> --full-auto -m <m> <prompt>`
- **Translation:** `detectToolFromCommand()` maps bash commands:
  - `cat/head/tail` -> `Read`
  - `find/fd` -> `Glob`
  - `grep/rg/ag` -> `Grep`
  - `ls/tree` -> `LS`
  - `sed/awk` -> `Edit`
  - `curl/wget` -> `WebFetch`
- **Mini models:** Use `reasoning_effort=low`

## Tool Definitions

Use Claude-style names. The UI expects `file_path` (not `path`).

| Tool | Schema |
|------|--------|
| Read | `{ file_path }` |
| Write | `{ file_path, content }` |
| Edit | `{ file_path, old_string, new_string }` |
| MultiEdit | `{ file_path, edits: [{old_string, new_string}] }` |
| Glob | `{ pattern, path? }` |
| Grep | `{ pattern, path? }` |
| LS | `{ path? }` |
| Bash | `{ command }` |

Optional tools (only if implemented): WebFetch, WebSearch, TodoWrite, Task, NotebookEdit

## Session Persistence

```
~/.yume/sessions/
├── gemini/
│   └── sess-*.json
├── openai/
│   └── sess-*.json
└── index.json
```

Sessions are **NOT portable** between providers.

## Error Handling

- **Auth failure:** `system` with `subtype: "error"`
- **Tool error:** `tool_result` with `is_error: true`
- **Provider error:** `error` then `result` with `is_error: true`

## Security

1. **Path Validation:** Reject paths outside `cwd` unless allowed
2. **Secret Redaction:** Scan tool output for API keys, tokens, private keys
3. **Output Limits:** Truncate over 100KB
4. **Command Timeout:** 120s default

**Secret patterns detected:**
- API keys (`ghp_*`, `sk-*`, `AIza*`, `AKIA*`, `npm_*`)
- OAuth tokens (`ya29.*`, `Bearer *`)
- Private keys (`-----BEGIN * PRIVATE KEY-----`)
- Connection strings (`mongodb://`, `postgres://`)
