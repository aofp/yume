# changelog

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
- auto-compaction (55% warn, 60% auto, 65% force)
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

### built-in agents
- yume-architect (planning)
- yume-explorer (read-only analysis)
- yume-implementer (code changes)
- yume-guardian (review/audit)
- yume-specialist (domain expertise)
- auto-sync to `~/.claude/agents/`
- uses selected model

### hooks
- 9 events: UserPromptSubmit, PreToolUse, PostToolUse, AssistantResponse, SessionStart, SessionEnd, ContextWarning, CompactionTrigger, Error
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
- queue management (4 concurrent, 10min timeout)
- git branch isolation (yume-async-{type}-{id})
- merge/delete branch operations
- conflict detection before merge
- sliding panel ui with agent cards
- real-time progress indicator

### memory mcp server
- persistent knowledge graph (~/.yume/memory.jsonl)
- auto-learning from conversations
- entity/relation/observation model
- search and retrieval
- settings tab for management

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
