# Architecture Update: Official CLI Integration Strategy

> **Date:** 2026-01-29
> **Status:** Implementation Complete
> **Impact:** Multi-provider support via official CLI binaries

## Summary

The multi-provider expansion leverages **official CLI binaries** from each provider rather than direct REST API integrations. `yume-cli` acts as a universal agent shim that spawns official CLIs and translates their output to Claude-compatible format.

## Architecture

### What yume-cli Does

1. **CLI Detection:** Locates official CLI binaries (`gemini`, `codex`)
2. **Process Spawning:** Launches with appropriate flags:
   - Gemini: `gemini --model <model> --output-format stream-json --yolo <prompt>`
   - Codex: `codex exec --json -C <cwd> --full-auto -m <model> <prompt>`
3. **Stream Translation:** Converts provider messages to Claude format
   - Tool name normalization (e.g., `run_shell_command` -> `Bash`)
   - Event type mapping (e.g., Gemini `tool_result` -> Claude `tool_result`)
4. **Agent Loop:** Think -> Act -> Observe cycle with safety limits:
   - MAX_TURNS: 50 iterations
   - MAX_DURATION_MS: 10 minutes
   - MAX_HISTORY_MESSAGES: 100 (auto-compaction)
5. **Session Persistence:** Stores in `~/.yume/sessions/{provider}/`
6. **Plugin Support:** Loads agents/skills from `~/.yume/plugins/`

### What yume-cli Does NOT Do

- Make direct REST API calls (delegates to official CLIs)
- Manage authentication or API keys (users auth via official CLIs)
- Cache API responses

## Benefits

1. **No API Key Management** - Official CLIs handle authentication
2. **Official Tool Support** - CLIs implement Read/Write/Edit/Bash natively
3. **Reduced Maintenance** - Provider updates handled by official CLIs
4. **Simpler Codebase** - ~500 lines translation logic vs ~5000 lines full implementation
5. **User Control** - Clear separation of concerns for auth management

## Translation Examples

### Gemini -> Claude

```json
// Gemini input
{"type": "function_call", "name": "ReadFile", "args": {"path": "app.tsx"}}

// yume-cli output
{"type": "tool_use", "id": "toolu_1", "name": "Read", "input": {"file_path": "app.tsx"}}
```

### Codex -> Claude

```json
// Codex input
{"type": "tool_call", "id": "call_1", "name": "edit_file", "args": {"path": "app.tsx", "old": "foo", "new": "bar"}}

// yume-cli output
{"type": "tool_use", "id": "toolu_1", "name": "Edit", "input": {"file_path": "app.tsx", "old_string": "foo", "new_string": "bar"}}
```

## User Experience

### One-Time Setup

```bash
# Gemini
npm install -g @google/gemini-cli
gemini auth login

# OpenAI
npm install -g @openai/codex
codex login
```

### In Yume UI

1. Settings -> Providers tab shows CLI status
2. Install CLI and authenticate externally
3. Status updates to "Ready"
4. Create sessions with that provider

## Remaining Work

1. Windows/Linux binary distribution
2. Golden transcript compliance tests
3. Auth status verification before session start
