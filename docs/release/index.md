# yume

**夢** — dream

the native desktop app for the claude code cli. tabs, orchestration, live thinking, background agents, and 50+ things the terminal can't do — driving the same official claude you already pay for. current version: **0.37.0**

---

## why yume

the claude code cli is excellent, but it's a terminal: one session, no persistence, thinking shown after the fact, and it flickers and lags in long conversations. yume keeps the exact same claude (it spawns the official cli, never an api wrapper) and wraps it in a fast, native desktop app.

- **zero flicker, instant input** — native tauri + rust rendering, not a terminal repaint
- **never lose work** — crash recovery with 5-minute snapshots and 24-hour retention
- **see claude think** — extended thinking streams live, token by token
- **do four things at once** — up to 4 background agents on isolated branches/worktrees
- **stay on budget** — a usage-limit guard that stops before your 5-hour window bills into overage

---

## core features

- **multi-tab sessions** — up to 99 concurrent conversations (pro), each with its own context
- **orchestration flow** — auto-injected understand → decompose → act → verify for complex tasks
- **background agents** — 4 concurrent, git-branch or worktree isolation, auto-injected results
- **background bash** — detached long-running commands that report back into the session
- **live thinking** — extended-thinking streaming via a dedicated proxy sidecar
- **token + cost tracking** — per-message and aggregate, with an analytics dashboard
- **crash recovery** — periodic snapshots, full window + session restoration
- **multi-provider** — claude, gemini, openai, kiro through their official clis
- **schedule system** — `/schedule` for timed (`5m`, `2pm`) and event (`next`, `done`) triggers
- **effort + budget controls** — per-model thinking budget and effort level
- **rules management** — `.claude/rules/*.md` CRUD from settings
- **askuser** — claude asks you structured multiple-choice questions mid-session
- **secret censoring** — api keys and tokens redacted across every output stream
- **vim mode** — full normal / insert / visual / command keybindings
- **remote access** — pair a device, connect over LAN (foundation)
- **7 languages** — english, spanish, french, german, polish, chinese, japanese

---

## models

yume ships the current claude lineup and keeps up as new models land.

| provider | models | integration |
|----------|--------|-------------|
| claude | **fable 5** (default flagship), **sonnet 5** (1M context), sonnet 4.6, opus 4.8, opus 4.7 | native (official cli) |
| gemini | 3.1 pro preview, 3 flash preview | via yume-cli shim |
| openai | gpt-5.5, gpt-5.4 mini | via yume-cli shim |
| kiro | auto, claude sonnet 4.5, claude haiku 4.5, glm-5 | via kiro cli |

`cmd/ctrl + shift + k` toggles between fable and sonnet. non-claude providers run through the yume-cli shim, which translates their output into claude-compatible streaming. switching provider forks the session.

---

## context management

- **auto-compaction** — dynamic threshold (default 85%): warn at T-5%, auto at T, force at T+5%; configurable or off (the cli also handles it)
- **manifest generation** — preserves files, functions, and decisions across a compact
- **rate-limit tracking** — 5-hour and 7-day windows read from `claude /usage` (claude only)
- **usage-limit guard** — optionally stops new turns before the 5-hour window hits 100%, so a subscription never spills into metered overage
- **context bar** — color-coded usage, git + line-change badges, provider-aware

---

## analytics

- **per-message stats** — input / output / cache tokens and dollar cost
- **dashboard** — daily, weekly, and monthly views with streaks
- **breakdowns** — by project, model, and date
- **export** — csv / json

---

## background agents

- **queue** — 4 concurrent, 30-minute timeout
- **isolation** — none, git branch, or full worktree per agent
- **inter-agent messaging** — coordinate work across agents
- **streaming isolation** — background agents never disturb the main session's stream
- **ui** — a sliding panel with live agent cards and progress

---

## plugin system

six component types under `~/.yume/plugins/`, plus a marketplace:

- **commands** — custom slash commands
- **agents** — specialized assistants with their own system prompts
- **hooks** — intercept lifecycle events (prompt submit, tool use, compaction, subagents…)
- **skills** — auto-inject context by file type, keyword, or ReDoS-safe regex
- **mcp** — model context protocol servers
- **monitors** — background monitors

claude-code plugins are supported directly. a bundled plugin ships 4 agents and 5 commands.

---

## 4 built-in agents

| agent | purpose |
|-------|---------|
| yume-architect | planning, task decomposition, risk-spotting |
| yume-explorer | read-only codebase analysis (sonnet) |
| yume-implementer | focused code changes |
| yume-guardian | review, security, and domain tasks (tests, docs, devops) |

agents use the selected model and sync to `~/.claude/agents/`.

---

## hooks

23 event types, **7 active**: `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `ContextWarning`, `CompactionTrigger`, `SubagentStart`, `SubagentStop`. run bash / python / node / powershell scripts (5s default timeout) or http hooks (POST JSON, SSRF-protected).

---

## ui

- **18 themes** — 12 dark (OLED-optimized) + 6 light
- **font picker** — bundled + system monospace and sans fonts
- **window opacity** — 50–100%
- **voice dictation** — F5 to toggle
- **claude.md editor** — edit project + memory files in-app
- **file preview** — images, audio, video, PDF, syntax-highlighted code
- **rollback** — per-message file-change tracking with one-click restore
- **diff viewer** — side-by-side and inline
- **stream event dots** — live tool-activity visualization
- **virtual scrolling** — thousands of messages without lag

---

## command palette

`cmd/ctrl + p` opens a VS Code-style palette: fuzzy search, submenu navigation (themes, fonts, opacity), live theme preview, and toggle state.

---

## platforms

| platform | installer |
|----------|-----------|
| mac apple silicon | `yume_x.x.x_arm64.pkg` |
| mac intel | `yume_x.x.x_x64.pkg` |
| windows x64 / arm64 | `yume_x.x.x_x64-setup.exe` |
| linux deb | `yume_x.x.x_amd64.deb` |
| linux rpm | `yume-x.x.x-1.x86_64.rpm` |
| linux flatpak | `io.github.aofp.yume` |

native binary. requires the claude cli.

---

## pricing

- **demo** — free. 2 tabs, 2 panes, 1 window. every feature available to try.
- **pro monthly** — $4/mo (paypal). 99 tabs / panes / windows. cancel anytime; access runs to period end.
- **pro lifetime** — $49 once. same limits, plus every future version, forever.

license re-verifies weekly (~7d ± 12h jitter, server-clock anchored) with a 7-day offline grace window. on failure it reverts to demo and shows a retry banner — your key is kept.

---

## tech

- rust / tauri 2 backend, react 19 frontend
- compiled node.js server binaries, per platform
- spawns the official claude cli — no api keys handled, no tokens stored
- no telemetry; local-first (only the license check leaves the machine)

---

## docs

- [getting started](getting-started.md)
- [features](features.md)
- [faq](faq.md)
- [changelog](changelog.md)

---

not affiliated with anthropic. "claude" is a trademark of anthropic.
