# Architecture Update: Official CLI Integration Strategy

**Date:** 2026-01-28
**Status:** ✅ Implementation Complete
**Impact:** Phase 2 & 3 of Roadmap (both complete)

## Overview

The multi-provider expansion strategy has been updated to leverage **official CLI binaries** from each provider rather than implementing direct REST API integrations. This significantly simplifies the architecture and reduces maintenance burden.

## What Changed

### Previous Approach (Discarded)
- `yume-cli` would implement a full agent loop (Think → Act → Observe)
- Direct REST API calls to Gemini and OpenAI endpoints
- API key management within yume-cli
- Tool execution implementation in yume-cli
- Token caching and auth management
- Session persistence in `~/.yume/sessions/`

### New Approach (Implemented)
- `yume-cli` is a **universal agent shim** with its own agent loop
- Spawns official CLI binaries (`gemini`, `codex`) with auto-approve flags
- Reads their stream-json/JSONL output line-by-line
- Translates to Claude-compatible format with tool name normalization
- Implements Think -> Act -> Observe cycle (MAX_TURNS=50, MAX_DURATION=10min)
- Supports plugin system (agents, skills from `~/.yume/plugins/`)
- Handles session persistence in `~/.yume/sessions/{provider}/`

## Provider Integration Details

### Gemini Provider
- **Official CLI:** `@google/gemini-cli` npm package
- **Installation:** `npm install -g @google/gemini-cli`
- **Authentication:** User runs `gemini auth login` (OAuth via browser)
- **yume-cli role:** Spawn `gemini` CLI and translate its stream-json

### OpenAI/Codex Provider
- **Official CLI:** `codex-cli` npm package
- **Installation:** `npm install -g codex-cli`
- **Authentication:** User runs `codex auth login`
- **yume-cli role:** Spawn `codex` CLI and translate its stream-json

### Claude Provider (Unchanged)
- **Official CLI:** `claude` (bundled with Yume)
- **Authentication:** Handled automatically on first run
- **yume-cli role:** Optional passthrough mode for consistency

## Benefits of This Approach

1. **No API Key Management**
   - Official CLIs handle authentication
   - Yume never touches API keys or tokens
   - Users authenticate using standard methods (OAuth, etc.)

2. **Official Tool Support**
   - CLIs implement Read/Write/Edit/Bash/etc. natively
   - No need to reimplement tool execution
   - Tools work exactly as providers intend

3. **Reduced Maintenance**
   - Provider updates handled by official CLIs
   - No need to track API changes
   - Bug fixes come from providers

4. **Simpler Codebase**
   - Pure translation logic (~500 lines vs ~5000 lines)
   - No HTTP client code
   - No token caching logic
   - No agent loop implementation

5. **User Control**
   - Users see which CLIs are installed
   - Users manage authentication separately
   - Clear separation of concerns

6. **Stability**
   - Official CLIs are well-tested
   - Breaking changes are rare
   - Version pinning is straightforward

## What yume-cli Does

1. **CLI Detection:** Spawns official CLI binaries (`gemini`, `codex`)
2. **Process Spawning:** Launch official CLI with appropriate arguments:
   - Gemini: `gemini --model <model> --output-format stream-json --yolo <prompt>`
   - Codex: `codex exec --json -C <cwd> --full-auto -m <model> <prompt>`
3. **Stream Reading:** Read line-delimited JSON from CLI stdout
4. **Message Translation:** Convert provider-specific messages to Claude format
   - Tool name normalization (e.g., `run_shell_command` -> `Bash`, `read_file` -> `Read`)
   - Tool result handling (Gemini: `tool_result`, Codex: `item.completed`)
5. **Output Emission:** Write translated messages to yume-cli stdout
6. **Error Handling:** Translate CLI errors to Claude-compatible error messages
7. **Agent Loop:** Implements Think -> Act -> Observe with safety limits:
   - MAX_TURNS: 50 iterations
   - MAX_DURATION_MS: 10 minutes
   - MAX_HISTORY_MESSAGES: 100 (auto-compaction)
8. **Session Persistence:** Stores sessions in `~/.yume/sessions/{provider}/`
9. **Plugin Support:** Loads agents/skills from `~/.yume/plugins/`

## What yume-cli Does NOT Do

- ❌ Make direct REST API calls (delegates to official CLIs)
- ❌ Manage authentication or API keys (users authenticate separately via official CLIs)
- ❌ Cache API responses

**Note:** yume-cli does implement local tool executors in `src/tools/` which are used when providers return tool calls. The official CLIs (gemini, codex) may execute tools internally, but yume-cli handles any tool calls that bubble up through its agent loop.

## Translation Examples

### Gemini → Claude

**Gemini CLI Output:**
```json
{"type": "text", "content": "I'll help you."}
{"type": "function_call", "name": "ReadFile", "args": {"path": "app.tsx"}}
{"type": "function_result", "call_id": "fc_1", "result": "...contents..."}
{"type": "done"}
```

**yume-cli Output (translated):**
```json
{"type": "text", "content": "I'll help you."}
{"type": "tool_use", "id": "toolu_1", "name": "Read", "input": {"file_path": "app.tsx"}}
{"type": "tool_result", "tool_use_id": "toolu_1", "content": "...contents..."}
{"type": "result", "is_error": false}
```

### Codex → Claude

**Codex CLI Output:**
```json
{"type": "text", "content": "Sure!"}
{"type": "tool_call", "id": "call_1", "name": "edit_file", "args": {"path": "app.tsx", "old": "foo", "new": "bar"}}
{"type": "tool_result", "call_id": "call_1", "result": "Success"}
{"type": "done"}
```

**yume-cli Output (translated):**
```json
{"type": "text", "content": "Sure!"}
{"type": "tool_use", "id": "toolu_1", "name": "Edit", "input": {"file_path": "app.tsx", "old_string": "foo", "new_string": "bar"}}
{"type": "tool_result", "tool_use_id": "toolu_1", "content": "Success"}
{"type": "result", "is_error": false}
```

## User Experience Flow

### Setup (One-Time Per Provider)

**Gemini:**
```bash
# User runs once
npm install -g @google/gemini-cli
gemini auth login
```

**OpenAI:**
```bash
# User runs once
npm install -g codex-cli
codex auth login
```

### In Yume UI

1. User opens Settings → Providers tab
2. Sees status for each provider:
   - ✅ Claude: Ready (bundled)
   - ⚠️ Gemini: CLI not installed → [Install Instructions]
   - ⚠️ OpenAI: Not authenticated → [Run `codex auth login`]
3. Installs CLI and authenticates
4. Status updates to ✅ Ready
5. Can now create sessions with that provider

### Session Creation

1. User clicks "New Session"
2. Selects provider (Claude / Gemini / OpenAI)
3. Selects model
4. Yume spawns `yume-cli --provider <provider> --model <model>`
5. yume-cli spawns official CLI
6. Translation happens transparently
7. UI receives Claude-compatible messages

## Implementation Changes

### Updated Files

#### Documentation
- ✅ `ROADMAP.md` - Updated Phase 2 & 3 tasks
- ✅ `GEMINI_INTEGRATION.md` - Official CLI spawning approach
- ✅ `CODEX_INTEGRATION.md` - Official CLI spawning approach
- ✅ `YUME_CLI_SPEC.md` - Thin shim architecture
- ✅ `SHIM_ARCHITECTURE.md` - Translation layer details
- ✅ `PROVIDER_REFERENCE.md` - CLI installation & auth
- ✅ `ARCHITECTURE_OVERVIEW.md` - Provider integration details

#### Code (Complete)
- [x] `src-yume-cli/` - Full TypeScript implementation
  - [x] `src/index.ts` - Entry point, CLI parsing
  - [x] `src/core/agent-loop.ts` - Agent loop with Think -> Act -> Observe
  - [x] `src/core/emit.ts` - Stream emission utilities
  - [x] `src/core/session.ts` - Session management
  - [x] `src/core/plugins.ts` - Plugin loader (agents, skills)
  - [x] `src/core/pathSecurity.ts` - Path validation
  - [x] `src/providers/base.ts` - Provider interface
  - [x] `src/providers/gemini.ts` - Gemini CLI spawner + translation
  - [x] `src/providers/openai.ts` - Codex CLI spawner + translation
  - [x] `src/providers/index.ts` - Provider factory
  - [x] `src/tools/*.ts` - Tool executors (Bash, Read, Write, Edit, Glob, Grep, LS)
- [x] `src/renderer/components/Settings/ProvidersTab.tsx` - CLI status UI
- [x] `src-tauri/src/yume_cli_spawner.rs` - Rust spawner with event handling

## Migration Path

### Phase 1: Scaffolding ✅ Complete
- [x] Update documentation to reflect new architecture
- [x] Create `src-yume-cli/` directory structure
- [x] Implement CLI detection utilities
- [x] Implement provider factory pattern

### Phase 2: Translation Layer ✅ Complete
- [x] Install and study official CLIs (`@google/gemini-cli`, `@openai/codex`)
- [x] Document their stream-json formats
- [x] Implement translation logic for Gemini (tool_use/tool_result events)
- [x] Implement translation logic for Codex (item.completed events)
- [x] Tool name normalization (detectToolFromCommand for Codex)

### Phase 3: Integration ✅ Complete
- [x] Wire yume-cli into Yume's backend via `yume_cli_spawner.rs`
- [x] Add CLI status UI in ProvidersTab.tsx
- [x] Multi-channel event emission for session routing
- [x] Session ID extraction from init events

### Phase 4: Polish 🔄 In Progress
- [x] Error handling for missing CLIs
- [x] Model-specific handling (mini models reasoning effort override)
- [ ] Binary distribution (macOS works, Windows/Linux pending)
- [ ] Golden transcript compliance tests

## Resolved Questions

1. **Gemini CLI:** `@google/gemini-cli` is available and stable. Uses `--output-format stream-json` and `--yolo` for auto-approve.

2. **Codex CLI:** `@openai/codex` is available. Uses `exec --json --full-auto` for JSONL output with auto-approve.

3. **Stream-JSON Format:** Both CLIs emit line-delimited JSON. Gemini uses `message`, `tool_use`, `tool_result`, `result` types. Codex uses `thread.started`, `item.completed`, `turn.completed` types.

4. **Tool Support:** Both CLIs implement native tools. yume-cli provides local tool executors as fallback.

5. **Session Persistence:** yume-cli handles session persistence in `~/.yume/sessions/{provider}/`

## Conclusion

The CLI-first architecture is fully implemented. Both Gemini and Codex providers work via the yume-cli shim:

- **Gemini:** Spawns `gemini` CLI, translates tool_use/tool_result events
- **Codex:** Spawns `codex` CLI, translates item.completed events with intelligent tool detection

The key insight was correct: we delegate tool execution to the official CLIs and focus on translation. The yume-cli adds value through:
- Unified Claude-compatible output format
- Plugin system support (agents, skills)
- Session persistence across providers
- Safety limits (max turns, max duration, history compaction)

---

**Remaining Work:**
1. Windows/Linux binary distribution
2. Golden transcript compliance tests
3. Auth status verification before session start
