# Multi-Model Expansion Roadmap

This roadmap outlines the steps to transform Yume from a Claude-specific GUI to a universal Agentic IDE.

## Phase 1: Preparation & Architecture (Week 1-2)
- [ ] **Protocol Definition:** Document the exact JSON streaming protocol Yume expects from the server.
- [ ] **Server Refactor:** Split `server-claude-direct.cjs` into:
    - `server/core.js` (Express, Socket.IO, Process Mgmt)
    - `server/adapters/claude.js` (Claude-specific logic)
    - `server/adapters/base.js` (Base class)
- [ ] **Frontend Preparation:**
    - Refactor `claudeCodeStore` to `agentStore`.
    - Abstract `Claude` naming in UI components where generic "Agent" is more appropriate.

## Phase 2: The Universal Shim (Week 3-4)
- [ ] **Build `yume-cli`:** A standalone Node.js CLI tool.
    - **Core:** Event loop, Tool execution (`fs`, `exec`), Protocol emitter.
    - **Auth:** Helpers to fetch tokens from `gcloud`, `gh`, `env`.
- [ ] **Implement Gemini Strategy:** Connect `yume-cli` to Gemini 1.5 Pro via REST (using `gcloud` token).
- [ ] **Verify Parity:** Ensure `yume-cli` passes the same integration tests as the native `claude` CLI adapter.

## Phase 3: Provider Expansion (Week 5-6)
- [ ] **OpenAI Strategy:** Add OpenAI support to `yume-cli`.
- [ ] **Local LLM Strategy:** Add support for Ollama/Llama.cpp endpoints (OpenAI compatible).
- [ ] **UI Integration:** Update Yume Settings to select "Provider" which passes flags to `yume-cli`.

## Phase 4: Polish & Documentation (Week 7-8)
- [ ] **Unified Docs:** Update main `README.md` to reflect multi-model nature.
- [ ] **Configuration:** Create a robust "Providers" settings tab to manage API keys/paths for different CLIs.
- [ ] **Release:** Launch Yume 2.0 with Multi-Agent support.

## Success Metrics
- User can switch between Claude (Anthropic), Gemini (Google), and GPT (OpenAI) within the same app.
- All "Unique Features" (Timeline, Diff View, Context Bar) work across all models.
