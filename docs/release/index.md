# yume

**夢** — dream

desktop app for claude cli with multi-provider support. current version: **0.6.4**

---

## core features

- **multi-tab sessions** — up to 99 concurrent conversations (pro)
- **auto-compaction** — variable threshold (default 75%), user configurable or disable
- **token tracking** — input/output/cache tokens, cost per message
- **crash recovery** — 30s auto-save, full state restoration
- **multi-provider** — claude, gemini, openai via official clis

---

## context management

- **usage thresholds** — auto-compact at user-configured threshold (default 75%)
- **manifest generation** — preserves files, functions, decisions
- **rate limit tracking** — 5h + 7d limits from anthropic api (claude only)
- **context bar** — visual indicator with color-coded warnings

---

## analytics

- **per-message stats** — tokens, cache hits, cost in dollars
- **dashboard** — 📊 button for daily/weekly/monthly views
- **breakdowns** — by project, model, date
- **export** — csv/json

---

## multi-provider (95% complete)

| provider | models | status |
|----------|--------|--------|
| claude | sonnet 4.5, opus 4.5 | ✅ native |
| gemini | 2.5 pro, 2.5 flash | ✅ via yume-cli |
| openai | gpt-5.2 codex, gpt-5.1 mini | ✅ via yume-cli |

unified stream-json protocol. provider switching forks session. macos binaries bundled.

---

## background agents

- **queue management** — 4 concurrent, no timeout
- **git isolation** — automatic branch per agent (yume-async-{type}-{id})
- **merge workflow** — conflict detection, merge/delete operations
- **streaming isolation** — agents don't interfere with main session
- **ui** — sliding panel with agent cards, real-time progress

---

## memory v2 system

per-project markdown memory:
- **storage** — `~/.yume/memory/` (markdown files)
- **auto-learning** — extracts patterns from conversations
- **importance levels** — 1-5 with TTL (1 day to permanent)
- **access** — search, retrieve relevant memories for prompts

---

## plugin system

5 component types in `~/.yume/plugins/`:

- **commands** — custom slash commands (md files)
- **agents** — specialized assistants with system prompts
- **hooks** — intercept 9 events (prompt submit, tool use, response, etc)
- **skills** — auto-inject context based on file types/keywords
- **mcp** — model context protocol servers

bundled plugin: 4 agents, 5 commands.

---

## 4 built-in agents

| agent | purpose |
|-------|---------|
| yume-architect | planning, task decomposition |
| yume-explorer | read-only codebase analysis (sonnet) |
| yume-implementer | focused code changes |
| yume-guardian | code review, security + domain tasks |

agents use selected model. synced to `~/.claude/agents/`.

---

## hooks (9 events, 3 active)

**active:** `PreToolUse`, `ContextWarning`, `CompactionTrigger`

**defined (not wired):** `UserPromptSubmit`, `PostToolUse`, `AssistantResponse`, `SessionStart`, `SessionEnd`, `Error`

js/py/sh scripts with 5s timeout.

---

## ui features

- **12 themes** — yume, void, cobalt, slate, arctic, synth, mint, grove, ochre, bourbon, burnt, rose
- **26 monospace fonts** — jetbrains mono, fira code, etc
- **26 sans fonts** — inter, sf pro, roboto, etc
- **window opacity** — 50-100%
- **voice dictation** — f5 to toggle
- **claude.md editor** — in-app project config editing
- **timeline/checkpoints** — save/restore conversation states
- **diff viewer** — side-by-side and inline
- **virtual scrolling** — handles 1000+ message sessions

---

## command palette (56 commands)

`cmd/ctrl + p` opens palette with:
- 10 categories (tabs, panels, session, model, input, zoom, appearance, settings, menu, settings tabs)
- fuzzy search with scoring
- submenu navigation (themes, fonts, opacity)
- live theme preview
- toggle commands with on/off state

---

## keyboard shortcuts (32+)

| action | key |
|--------|-----|
| send | `cmd/ctrl + enter` |
| new tab | `cmd/ctrl + n` |
| close tab | `cmd/ctrl + w` |
| tab 1-9 | `cmd/ctrl + 1-9` |
| settings | `cmd/ctrl + ,` |
| command palette | `cmd/ctrl + p` |
| stop | `esc` |
| voice | `f5` |
| zoom | `cmd/ctrl + +/-/0` |
| devtools | `cmd/ctrl + shift + i` |

---

## file operations

- **search** — fuzzy, glob patterns, substring matching
- **recent files** — recently modified
- **git integration** — changed files from status
- **conflict detection** — concurrent edit warnings
- **atomic delete** — with restore support

---

## database

sqlite in `~/.yume/yume.db`:
- sessions, messages, analytics, checkpoints, settings, compaction_history
- wal mode for concurrency
- fts5 full-text search

---

## security

- no telemetry
- local-only (except license validation)
- encrypted license storage (xor + base64)
- process isolation (tauri, react, node.js separate)
- path traversal prevention
- input validation (4 layers)

---

## platforms

| platform | installer |
|----------|-----------|
| mac m1/m2/m3/m4 | `yume-x.x.x-arm64.dmg` |
| mac intel | `yume-x.x.x-x64.dmg` |
| windows | `yume-x.x.x-x64-setup.exe` |
| linux | `yume-x.x.x-x64.AppImage` |

~50mb binary. requires claude cli.

---

## pricing

- **trial** — free, 3 tabs, 1 window
- **pro** — $29 once, 99 tabs, 99 windows

---

## tech

- rust/tauri 2.9 backend
- react 19 frontend
- node.js server (compiled binaries)
- 181+ tauri commands
- 24 frontend services
- ~83k lines of code (62k ts/tsx + 21k rust)

---

## docs

- [getting started](getting-started.md)
- [features](features.md)
- [faq](faq.md)
- [changelog](changelog.md)

---

not affiliated with anthropic.
