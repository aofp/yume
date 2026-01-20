# Architecture Update: Official CLI Integration Strategy

**Date:** 2026-01-14
**Status:** Active Development
**Impact:** Phase 2 & 3 of Roadmap

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

### New Approach (Current)
- `yume-cli` is a **thin translation shim**
- Spawns official CLI binaries (`gemini`, `codex`)
- Reads their stream-json output
- Translates to Claude-compatible format
- Emits to stdout

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

1. **CLI Detection:** Check if required CLI is installed (`gemini --version`, `codex --version`)
2. **Auth Verification:** Check if user is authenticated (`gemini auth status`, `codex auth status`)
3. **Process Spawning:** Launch official CLI with appropriate arguments
4. **Stream Reading:** Read line-delimited JSON from CLI stdout
5. **Message Translation:** Convert provider-specific messages to Claude format
6. **Output Emission:** Write translated messages to yume-cli stdout
7. **Error Handling:** Translate CLI errors to Claude-compatible error messages

## What yume-cli Does NOT Do

- ❌ Make REST API calls
- ❌ Implement agent loop (Think → Act → Observe)
- ❌ Execute tools locally
- ❌ Manage authentication or tokens
- ❌ Cache API responses
- ❌ Implement retry logic (CLIs handle this)
- ❌ Session persistence (CLIs handle this)

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

#### Code (Upcoming)
- [ ] `src-yume-cli/` - New directory structure
  - [ ] `core/spawner.ts` - CLI process spawning
  - [ ] `core/translator.ts` - Message translation
  - [ ] `translators/gemini-to-claude.ts` - Gemini translation
  - [ ] `translators/codex-to-claude.ts` - Codex translation
  - [ ] `detection/cli-detector.ts` - CLI detection
  - [ ] `detection/auth-checker.ts` - Auth verification
- [ ] `src/renderer/components/Settings/ProvidersTab.tsx` - CLI status UI
- [ ] Update server adapters to spawn yume-cli

## Migration Path

### Phase 1: Scaffolding (Current)
- [x] Update documentation to reflect new architecture
- [ ] Create `src-yume-cli/` directory structure
- [ ] Implement CLI detection utilities
- [ ] Implement auth checking utilities

### Phase 2: Translation Layer
- [ ] Install and study official CLIs (`@google/gemini-cli`, `codex-cli`)
- [ ] Document their stream-json formats
- [ ] Implement translation logic for each provider
- [ ] Write unit tests for translation

### Phase 3: Integration
- [ ] Wire yume-cli into Yume's server
- [ ] Add CLI status UI in settings
- [ ] Add installation instructions
- [ ] Test end-to-end flows

### Phase 4: Polish
- [ ] Add helpful error messages for missing CLIs
- [ ] Add auth verification before session start
- [ ] Add version compatibility checks
- [ ] Document user setup flow

## Open Questions

1. **Gemini CLI Availability:** Is `@google/gemini-cli` published and stable? If not, we may need a fallback to direct API calls.

2. **Codex CLI Availability:** Is there an official `codex-cli` package? OpenAI may not have published one yet.

3. **Stream-JSON Format:** Do these CLIs emit line-delimited JSON? If not, we may need PTY parsing.

4. **Tool Support:** Do the CLIs implement all the tools we need (Read, Write, Edit, etc.)?

5. **Session Persistence:** Do the CLIs handle session persistence, or do we need to implement this?

## Fallback Strategy

If official CLIs are not available or don't support stream-json:

1. **Gemini:** Fall back to REST API integration (original Phase 2 plan)
2. **OpenAI:** Fall back to REST API integration (original Phase 2 plan)
3. Keep documentation for both approaches
4. Implement detection logic to choose best path

## Conclusion

This architectural update significantly simplifies our multi-provider integration by leveraging official CLIs. The key insight is that we don't need to reimplement the agent loop - we just need to translate output formats.

If the official CLIs don't exist or don't meet our needs, we can fall back to the original REST API approach. But if they work as expected, this approach will save months of development time and ongoing maintenance.

---

**Next Steps:**
1. Research availability of `@google/gemini-cli` and `codex-cli`
2. Test their stream-json output formats
3. Begin implementation of translation layer
4. Update roadmap based on findings
