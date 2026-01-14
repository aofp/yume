# Yume Expansion Roadmap

## Phase 1: Foundation (Complete)
- [x] **Claude CLI Integration**: Native support for Claude 3.5 Sonnet/Opus.
- [x] **Multi-Session Architecture**: Tabbed interface with independent contexts.
- [x] **VSCode Integration**:
    - [x] Embedded UI via Webview.
    - [x] Extension for launching/connecting.
    - [x] Theme synchronization.
- [x] **Core Tooling**: Edit, Bash, Glob, Grep tools implemented in Rust/Node.

## Phase 2: The Universal Shim (Current Focus)
**Goal:** Decouple Yume from Claude-specific logic by introducing `yume-cli`.

- [ ] **Build `yume-cli`**:
    - [ ] Standalone Node.js executable.
    - [ ] `GeminiProvider` (Google Gen AI).
    - [ ] `OpenAIProvider` (GPT-4o, O1).
    - [ ] Standardized I/O protocol (matching Claude Code).
- [ ] **Integrate Shim into Yume**:
    - [ ] Rust spawners for Gemini/OpenAI calling `yume-cli`.
    - [ ] UI Model Selector updates.

## Phase 3: Advanced IDE Integration
- [ ] **VSCode Deep Integration**:
    - [ ] Open files directly from Yume chat references.
    - [ ] Stream VSCode diagnostics (errors) into Yume context.
    - [ ] "Apply to Editor" button for code blocks.
- [ ] **JetBrains Plugin**:
    - [ ] Port the VSCode Webview architecture to IntelliJ/PyCharm.

## Phase 4: Local Models
- [ ] **Ollama Support**: Add `OllamaProvider` to `yume-cli`.
- [ ] **Local Embeddings**: Rust-based vector search for codebase RAG.

## Phase 5: Team Collaboration
- [ ] **Shared Sessions**: Real-time multiplayer collaboration on a Yume session.
- [ ] **Cloud Sync**: Optional encrypted sync for session history.