# yume

**夢** — dream

desktop app for claude cli with multi-provider support. current version: **0.29.0**

---

## core features

- **multi-tab sessions** — up to 99 concurrent conversations (pro)
- **auto-compaction** — variable threshold (default 75%), user configurable or disable
- **token tracking** — input/output/cache tokens, cost per message
- **crash recovery** — 30s auto-save, full state restoration
- **multi-provider** — claude, gemini, openai, kiro via official clis
- **agent teams** — multi-agent coordination with task tracking
- **schedule system** — `/schedule` for timed and event-based tasks
- **effort controls** — low/medium/high effort level per session
- **rules management** — .claude/rules/ CRUD in settings
- **askuser ipc** — claude asks structured questions mid-session
- **secret censoring** — api keys/tokens redacted in output
- **vim mode** — full normal/insert/visual/command modes
- **row split panels** — up to 6 panels in 3x2 grid
- **kiro provider** — 4th provider support

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

## multi-provider

| provider | models | status |
|----------|--------|--------|
| claude | sonnet 4.6, opus 4.7 | ✅ native |
| gemini | 3.1 pro preview, 3 flash preview | ✅ via yume-cli |
| openai | gpt-5.5 codex, gpt-5.4 mini | ✅ via yume-cli |
| kiro | auto, claude sonnet 4.5, claude haiku 4.5, glm-5 | ✅ via kiro cli |

unified stream-json protocol. provider switching forks session.

---

## background agents

- **queue management** — 4 concurrent, no timeout
- **git isolation** — automatic branch per agent (yume-async-{type}-{id})
- **merge workflow** — conflict detection, merge/delete operations
- **streaming isolation** — agents don't interfere with main session
- **ui** — sliding panel with agent cards, real-time progress

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

## hooks (23 events)

**active:** `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `ContextWarning`, `CompactionTrigger`, `SubagentStart`, `SubagentStop`

**defined (not wired):** `AssistantResponse`, `SessionStart`, `SessionEnd`, `Error`, `WorktreeCreate`, `WorktreeRemove`, `ConfigChange`, `TaskCreated`, `PostCompact`, `CwdChanged`, `FileChanged`, `InstructionsLoaded`, `StopFailure`, `PermissionDenied`, `Elicitation`, `ElicitationResult`, `PreCompact`

bash/python/node/powershell scripts with 5s timeout. http hooks supported (POST JSON with SSRF protection).

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

## keyboard shortcuts (40+)

| action | key |
|--------|-----|
| new tab | `cmd/ctrl + t` |
| close tab | `cmd/ctrl + w` |
| command palette | `cmd/ctrl + p` |
| model & tools | `cmd/ctrl + k` |
| toggle model | `cmd/ctrl + shift + k` |
| files panel | `cmd/ctrl + e` |
| git panel | `cmd/ctrl + g` |
| settings | `cmd/ctrl + ,` |
| search messages | `cmd/ctrl + f` |
| clear context | `cmd/ctrl + l` |
| analytics | `cmd/ctrl + y` |
| stop | `esc` |
| zoom | `cmd/ctrl + +/-/0` |
| help | `?` or `f1` |

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
| mac m1/m2/m3/m4 | `yume_x.x.x_arm64.pkg` |
| mac intel | `yume_x.x.x_x64.pkg` |
| windows | `yume_x.x.x_x64-setup.exe` |
| linux deb | `yume_x.x.x_amd64.deb` |
| linux rpm | `yume-x.x.x-1.x86_64.rpm` |
| linux flatpak | `io.github.aofp.yume` |

~50mb binary. requires claude cli.

---

## pricing

- **demo** — free, 2 tabs, 2 panes, 1 window
- **pro monthly** — $4/mo, 99 tabs, 99 panes, 99 windows. paypal subscription. cancel anytime; access until period ends.
- **pro lifetime** — $49 one-time, 99 tabs, 99 panes, 99 windows. forever updates.

license is re-verified weekly (~7d ± 12h jitter) with a 7-day network grace period anchored to the server clock. on validation failure, yume reverts to demo and offers a retry banner (key is retained).

---

## tech

- rust/tauri 2.9 backend
- react 19 frontend
- node.js server (compiled binaries)
- 230+ tauri commands
- 24 frontend services
- ~90k+ lines of code

---

## docs

- [getting started](getting-started.md)
- [features](features.md)
- [faq](faq.md)
- [changelog](changelog.md)

---

not affiliated with anthropic.
