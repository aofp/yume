# changelog

## 0.20.0 — march 3, 2026

- reliable interrupt/kill (PID fallback, brute-force scan, drop interrupted messages)
- agent teams (rust backend + react panel for multi-agent coordination)
- file conflict detection across tabs
- rules tab (.claude/rules/ CRUD)
- per-provider model picker with enable/disable
- kiro provider support
- remote access foundation (?mobile=1 with device token auth)
- large prompt stdin pipe (>100KB avoids E2BIG)
- image compression pipeline + thumbnails in chat
- pane split state transfer + F7/F8 split/combine + /pane commands
- HTTP hooks with SSRF protection
- background agent permission modes + memory scope + auto-worktree cleanup
- NotebookEdit snapshot support
- context bar warning thresholds lowered (75/80/85%)
- bash output window 5 head + 15 tail lines
- incremental message analytics O(1)
- nvm4w support
- windows: fix OS error 193, suppress child error dialogs

## 0.19.0 — february 28, 2026

- /schedule command (timed: 5m/2pm/14:00, event-based: next/done)
- schedule indicator in context bar with dropdown management
- remove fsync from mcp bash stream (windows AV lag fix)
- cross-platform isPidAlive
- adaptive bg process polling (3s active / 15s idle)
- bash stream poll 100ms → 300ms
- git refresh in-flight guard
- windows defender exclusion tip in settings

## 0.18.1 — february 27, 2026

- map bedrock models (Claude via AWS Bedrock)
- improve TUI parsing
- fix background processes and agents not visible in UI

## 0.18.0 — february 27, 2026

- effort/budget controls (low/medium/high + max budget USD)
- OpenAI Codex provider enabled (JSONL parser for codex v0.100+ events, session resume)
- 15+ new slash commands (/config, /theme, /help, /stats, /memory, /mcp, /tasks, /new, /history, /rename, /analytics)
- CLAUDE.local.md + MEMORY.md editor support
- auto-memory toggle
- ANSI virtual terminal buffer rewrite
- focus stability (removed focus heartbeat, focusout rate limiter)
- system prompt + disallowed tools passed to yume-cli
- cobalt theme fix
- windows claude detection improvements

## 0.17.2 — february 26, 2026

- fix linux PTY usage limits (raw fork/exec, repeated CRs)

## 0.17.1 — february 26, 2026

- row split panels (3x2 grid, up to 6 panels)
- vim mode (normal/insert/visual/command)
- flatpak support
- windows git bash preference
- worktree isolation for background agents
- favorite projects with hotkey bindings
- memoized message list for streaming perf
- toast feedback on command palette toggles
- fix jsonl parser dollar sign splitting
- fix production Socket.IO port discovery

## 0.16.0 — february 23, 2026

- windows path safety (os error 267)
- bg agent capacity CAS loop
- lock-free process registry
- useShallow selectors
- warm → tengu theme rename

## 0.15.1 — february 23, 2026

- fix plan command

## 0.15.0 — february 23, 2026

- instant new-tab UX (deferred project picker)
- secret censoring (API keys, tokens redacted in all output)
- image drag-and-drop with compression
- Cmd+K/O shortcut remap
- warm theme
- bg process agent-checked dedup

## 0.14.2 — february 22, 2026

- wait for server readiness before frontend connect

## 0.14.1 — february 21, 2026

- ethereal spinner words
- CSS zoom on all platforms
- input focus flicker fix

## 0.14.0 — february 21, 2026

- AskUser IPC (Claude can ask structured questions mid-session)
- API key auth mode + custom base URL proxy
- file drop attachment (text/code files as content)
- /rewind command
- macOS TCC permission fix
- windows ConPTY /usage support

## 0.13.1 — february 18, 2026

- fix windows claude detection via npm
- fix haiku model misattribution
- image compression
- fix button stats day logic
- improve cli subprocessing

## 0.13.0 — february 18, 2026

- focus swizzle with resignFirstResponder rejection
- debounced makeFirstResponder with resign/become key tracking
- streaming perf and context breakdown fallback
- welcome screen and plugins tab cleanup
- model ID updates (claude-sonnet-4-6)
- tooltip and stream indicator improvements
- smart CLI update via npm registry check

## 0.12.2 — february 17, 2026

- fix macOS focus loss after click
- streaming performance improvements
- context breakdown fallback
- compile fix for class_addMethod bool type

## 0.12.1 — february 17, 2026

- fix Windows auth login URL quoting
- fix macOS Sequoia install
- fix pkg installer overwrite failure

## 0.12.0 — february 17, 2026

- inline auth login modal with proactive auth check
- token refresh on 401
- unified bash stream polling
- stream event dots as icons with gradient blending
- per-modal pane tracking
- sonnet for tab titles
- demo limits enforcement (3 panes / 1 window)
- usage limits retry with null-aware TTL caching
- Windows Credential Manager fallback
- scroll/focus/tab UI fixes
- Linux/Windows build fixes

## 0.11.0 — february 14, 2026

- stream event dots with gradient blending
- per-modal pane tracking
- demo limits enforcement

## 0.10.2 — february 12, 2026

- fix token counting
- add themes
- show 5h/7d usage limits on welcome screen

## 0.10.1 — february 11, 2026

- fix edge cases in token tracking
- ui polish

## 0.10.0 — february 10, 2026

- usage limits display on welcome screen
- theme system overhaul (12 themes)
- token counting improvements

## 0.9.8 — february 8, 2026

- stability and performance improvements
- streaming fixes

## 0.9.7 — february 7, 2026

- streaming improvements
- ui refinements

## 0.9.5 — february 5, 2026

- bug fixes and performance improvements

## 0.9.0 — february 3, 2026

- major stability improvements
- background agent enhancements

## 0.8.3 — february 1, 2026

- first published release with binaries
- macos arm64 + x64, windows, linux (deb + rpm)
- multi-provider support via yume-cli
- plugin system with commands, agents, hooks, skills, mcp
- 4 built-in agents
- orchestration flow

---

## 0.7.x — january 31, 2026

- internal releases
- multi-provider architecture
- plugin system foundations

---

## 0.6.7 — january 30, 2026

- acp protocol support
- sandbox security improvements
- tool permissions editor with allow/deny patterns
- tools modal improvements
- analytics performance fix (removed 60d/90d aggregations)

## 0.6.6 — january 29, 2026

- compaction service improvements
- settings ui enhancements

## 0.6.5 — january 29, 2026

- minor fixes and improvements

## 0.6.4 — january 29, 2026

- intelligent followup queueing with silent interrupt
- improved shutdown handling
- scroll virtualizer improvements
- ui tweaks

## 0.6.3 — january 29, 2026

- fix nvm-installed claude detection on linux
- improve process cleanup
- fix gemini provider

## 0.6.2 — january 29, 2026

- code cleanup and quality improvements
- refactor agents

## 0.6.1 — january 28, 2026

- variable auto-compact threshold (default 75%)

## 0.6.0 — january 28, 2026

- context bar improvements
- analytics chart fixes
- compaction service updates

---

## 0.5.9 — january 26, 2026

- fix outdated compaction percentages
- 12 themes (was 10)
- memory v2 documentation

## 0.5.8 — january 26, 2026

- linux/windows release builds
- hero text improvements

## 0.5.7 — january 25, 2026

- streaming isolation fix (background agents don't clear main session state)
- auto-update infrastructure
- tool reorganization (8 categories)
- background agent file tracking

## 0.5.6 — january 24, 2026

- memory ttl and auto-pruning
- multi-query memory search
- scrolling improvements
- style fixes

## 0.5.5 — january 23, 2026

- fix concurrent spawn race condition
- scroll virtualization improvements
- token counting accuracy
- diff selection enhancements

## 0.5.4 — january 22, 2026

- improved syntax highlighting

## 0.5.3 — january 21, 2026

- minor release notes fix

## 0.5.2 — january 21, 2026

- improved syntax highlighting

## 0.5.1 — january 20, 2026

- fix diff line number visibility
- style improvements

## 0.5.0 — january 19, 2026

### highlights
- bash streaming race fix
- token display improvements
- session isolation fixes
- linux compositing support

---

## 0.4.6 — january 18, 2026

- fix scroll anchoring
- stop/interrupt button improvements
- bash output indicator

## 0.4.5 — january 17, 2026

- minor bug fixes

## 0.4.4 — january 16, 2026

- performance improvements

## 0.4.3 — january 15, 2026

- stability improvements

## 0.4.2 — january 14, 2026

- ui refinements

## 0.4.1 — january 13, 2026

- minor fixes

## 0.4.0 — january 12, 2026

major release.

### highlights
- background agents (4 concurrent)
- git branch isolation
- orchestration flow

---

## 0.3.7 — january 11, 2026

- bug fixes

## 0.3.6 — january 10, 2026

- stability improvements

## 0.3.5 — january 9, 2026

- ui improvements

---

## 0.1.6 — january 8, 2026

- early fixes

## 0.1.5 — january 7, 2026

- initial improvements

## 0.1.0 — january 2026

initial release.

### sessions
- multi-tab (99 pro, 2 trial)
- independent context per tab
- lazy reconnection
- drag & drop reordering
- persistence across restarts
- crash recovery (30s auto-save, 5-min snapshots)
- window state restoration

### context management
- auto-compaction (variable threshold, default 75%, user configurable or disable)
- manifest generation (preserves files/functions/decisions)
- token tracking (input, output, cache read, cache creation)
- cost per message
- rate limit tracking (5h + 7d, claude only)
- visual context bar with thresholds

### multi-provider (95% complete)
- claude native (sonnet 4.5, opus 4.5)
- gemini via yume-cli (2.5 pro, 2.5 flash)
- openai via yume-cli (gpt-5.2 codex, gpt-5.1 mini)
- unified stream-json protocol
- tool translation (codex → claude tools)
- provider lock-in per session
- macos binaries bundled (win/linux pending)

### plugin system
- 5 component types: commands, agents, hooks, skills, mcp
- bundled "yume" plugin (5 agents, 5 commands)
- plugin install/uninstall/enable/disable
- component sync to `~/.claude/`

### built-in agents (4)
- yume-architect (planning, decomposition)
- yume-explorer (read-only codebase analysis, sonnet)
- yume-implementer (focused code changes)
- yume-guardian (review/audit + domain tasks: tests, docs, devops, data)
- auto-sync to `~/.claude/agents/`
- uses selected model

### hooks (9 defined, 3 active)
- active: PreToolUse, ContextWarning, CompactionTrigger
- defined (not wired): UserPromptSubmit, PostToolUse, AssistantResponse, SessionStart, SessionEnd, Error
- js/py/sh scripts
- 5s timeout
- variable substitution

### analytics
- per-message stats
- dashboard (7d/14d/30d/all-time)
- breakdowns by model, date, project
- csv/json export
- performance monitoring (fps, memory, latency)

### ui
- 12 themes (oled optimized)
- 26 monospace + 26 sans fonts
- window opacity control
- voice dictation (f5)
- claude.md editor
- timeline & checkpoints
- diff viewer
- virtual scrolling
- 32+ keyboard shortcuts
- command palette (56 commands, cmd+p)
- session changes panel
- line changes tracking (+added/-removed)
- context bar customization (right-click menu)
- toast notifications

### background agents
- queue management (4 concurrent, no timeout)
- git branch isolation (yume-async-{type}-{id})
- merge/delete branch operations
- conflict detection before merge
- streaming isolation (does NOT control main session)
- sliding panel ui with agent cards
- real-time progress indicator

### memory v2 system
- per-project markdown files (~/.yume/memory/)
- 5 importance levels (1=ephemeral to 5=permanent)
- ttl-based expiration (1 day to permanent)
- auto-pruning of expired entries
- custom mcp server (yume-mcp-memory.cjs)
- context injection via `<yume-memory>` block
- 15 tauri commands for full crud

### file operations
- fuzzy/glob/substring search
- recent files
- git integration
- conflict detection
- atomic delete with restore

### database
- sqlite with wal mode
- fts5 full-text search
- sessions, messages, analytics, checkpoints, settings, compaction_history

### security
- no telemetry
- local-only (except license validation)
- encrypted license storage
- process isolation
- 4-layer input validation
- yume-cli safety limits

### platforms
- macos arm64 + x64
- windows x64 (wsl support)
- linux x64 (appimage, deb, rpm)

### known issues
- windows/linux yume-cli binaries need build
- checkpoint branching disabled (history/rollback works fine)

---

## roadmap

### 0.2.0
- conversation portability (ucf format)
- vscode deep linking
- jetbrains ide support
- light mode

### 0.3.0
- collaborative sessions
- cloud sync
- plugin marketplace
- team collaboration features

### ongoing
- gemini/openai provider refinement
- performance optimization
- additional themes
