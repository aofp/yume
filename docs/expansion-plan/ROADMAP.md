# Multi-Provider Expansion Roadmap

This roadmap focuses on making Yume provider-agnostic while preserving the existing Claude-compatible stream-json pipeline.

## Phase 0: Protocol Contract (Week 0-1)
- [x] **Canonical Protocol:** Document Claude-compatible stream-json requirements (match `src-tauri/src/stream_parser.rs`).
- [x] **Golden Transcript Tests:** Replayable fixtures for text, tool use, errors, and interrupts.
- [x] **Edge-Case Matrix:** Enumerate cross-platform/provider failure modes.
- [x] **Technical Approach Doc:** Finalize best-practice architecture and tool support tiers.

## Phase 1: Foundation (Week 1-2)
- [x] **Claude CLI Integration**: Native support for Claude 3.5 Sonnet/Opus.
- [x] **Multi-Session Architecture**: Tabbed interface with independent contexts.
- [x] **Core Tooling**: Read, Write, Edit, Glob, Grep, Bash tool definitions.
- [ ] **Server Refactor:** Extract CLI logic into adapters (Claude + Shim).
- [ ] **Event Compatibility:** Decide whether to keep `claude-message` events or add `agent-message`.
- [ ] **Gemini Proto-Integration:** Initial shim implementation for Gemini REST streaming.

## Phase 2: Translation Layer (Week 3-4)
- [ ] **Build `yume-cli`:** Standalone shim emitting Claude-compatible stream-json.
- [ ] **Gemini Strategy:** REST streaming + function calling normalization.
- [ ] **OpenAI Strategy:** Streaming tool-call buffering + usage mapping.
- [ ] **Compliance:** Pass golden transcript tests on macOS, Windows, Linux.

## Phase 3: Provider Expansion (Week 5-6)
- [ ] **Gemini Provider:** Wire `yume-cli --provider gemini` into Yume.
- [ ] **Codex Provider:** Wire `yume-cli --provider openai` into Yume.
- [ ] **Local LLM Provider:** OpenAI-compatible endpoints (Ollama/Llama.cpp).
- [ ] **Provider Analytics:** Cost/token tracking by provider+model.

## Phase 4: UI/UX & Settings (Week 7-8)
- [ ] **Provider Switcher:** UI for selecting provider per session.
- [ ] **Providers Tab:** Auth status, model selection, binary paths.
- [ ] **Graceful Fallbacks:** Degraded mode when tool calls are unavailable.

## Phase 5: Optional Extensions (Post-Launch)
- [ ] **IDE Integration:** VSCode/JetBrains deep linking.
- [ ] **Team Collaboration:** Shared sessions and encrypted sync.

## Success Metrics
- User can switch between Claude, Gemini, and OpenAI/Codex in one app.
- All existing UI features work across providers without code changes.
- Protocol compliance tests pass across macOS, Windows, Linux.
