# features

complete feature reference.

---

## session management

### tabs
- up to 99 concurrent sessions (pro), 2 (demo)
- independent context per tab
- lazy reconnection (connects when accessed)
- drag & drop reordering
- persistence across restarts (optional)
- auto-generated or custom titles

### session lifecycle
states: created → connecting → active ↔ streaming ↔ idle → disconnected/terminated

### crash recovery
- 30s periodic auto-save
- 5-minute snapshots
- window position restoration
- tracks up to 50 modified files
- 7-day snapshot retention

---

## context management

### auto-compaction
| setting | description |
|---------|-------------|
| threshold | dynamic (default 85%): warn at T-5%, auto at T, force at T+5% |
| range | user-configurable, or off (the cli also handles compaction) |
| manifest | preserves important files, functions, and decisions across a compact |

sends `/compact` on the next user message when the threshold is crossed.

### token tracking
- input, output, cache read, cache creation tokens
- cost per message (model-specific pricing, including fable 5 and sonnet 5)
- session totals
- daily/weekly/monthly aggregation

### rate limits (claude only)
- 5-hour and 7-day limit tracking read from `claude /usage`
- reset timestamps
- **usage-limit guard** — optionally blocks new turns before the 5-hour window reaches 100%, so a subscription never spills into metered overage (settings → general)

### context bar
- visual usage indicator
- color-coded thresholds
- click for detailed breakdown
- provider-aware (5h/7d bars only for claude)
- git count badge (modified + added + deleted)
- line changes badge (+added -removed)
- right-click to customize button visibility
- customizable: command palette, dictation, files panel, history buttons

---

## multi-provider

### supported providers

| provider | models | cli package |
|----------|--------|-------------|
| claude | fable 5 (default), sonnet 5 (1M context), sonnet 4.6, opus 4.8, opus 4.7 | `@anthropic-ai/claude-code` |
| gemini | 3.1 pro preview, 3 flash preview | `@google/gemini-cli` |
| openai | gpt-5.5, gpt-5.4 mini | `@openai/codex` |
| kiro | auto, claude sonnet 4.5, claude haiku 4.5, glm-5 | `kiro` |

### implementation
- yume-cli shim spawns official clis
- unified stream-json protocol (claude-compatible)
- tool translation (codex commands → claude tools)
- provider lock-in per session (switching forks)

### tool translation (codex → claude)
| codex command | claude tool |
|---------------|-------------|
| cat, head, tail | Read |
| find, fd, globs | Glob |
| grep, rg, ag | Grep |
| ls, tree | LS |
| sed, awk | Edit |
| touch, >, >> | Write |
| curl, wget | WebFetch |
| git, others | Bash |

---

## plugin system

### directory
`~/.yume/plugins/{plugin-id}/`

### manifest (plugin.json)
```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "author": "name",
  "components": ["commands", "agents", "hooks", "skills", "mcp"]
}
```

### 5 component types

#### commands
- location: `commands/*.md`
- yaml frontmatter: description, category, argument-hint, allowed-tools
- template variables: `$ARGUMENTS`, `$1`, `$2`
- bundled: `/compact`, `/init`, `/commit`, `/review`, `/iterate`

#### agents
- location: `agents/*.md`
- yaml frontmatter: name, model, description
- markdown body = system prompt
- synced to `~/.claude/agents/`

#### hooks
- location: `hooks/*.js`, `hooks/*.py`, `hooks/*.sh`
- 23 events defined, **7 active**: `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `ContextWarning`, `CompactionTrigger`, `SubagentStart`, `SubagentStop`
- 16 events defined but not wired: `AssistantResponse`, `SessionStart`, `SessionEnd`, `Error`, `WorktreeCreate`, `WorktreeRemove`, `ConfigChange`, `TaskCreated`, `PostCompact`, `CwdChanged`, `FileChanged`, `InstructionsLoaded`, `StopFailure`, `PermissionDenied`, `Elicitation`, `ElicitationResult`, `PreCompact`
- actions: continue, block, modify, defer (CC v2.1.89+)
- hook types: script (bash/python/node/powershell), HTTP (POST JSON with SSRF protection)
- 5s timeout default
- variable substitution: `${session_id}`, `${message}`, `${file}`

#### skills
- auto-inject context based on triggers
- trigger types: file extensions (`*.py`), keywords (`react`), regex (`/^def /`)
- tabbed modal editor (general, triggers, content tabs)
- tag-based trigger configuration
- markdown content editor with preview
- ReDoS validation for regex patterns
- custom skills in localStorage
- plugin skills from md files

#### mcp
- model context protocol servers
- config: command, args, env, transport type
- auto-start option
- import from claude desktop
- stdio & sse transports

---

## 4 built-in agents

| agent | purpose | tools |
|-------|---------|-------|
| yume-architect | plans, designs, decomposes tasks | all except edit/write |
| yume-explorer | finds, reads, understands code (sonnet, read-only) | read-only |
| yume-implementer | makes focused code changes | all tools |
| yume-guardian | reviews, audits, verifies + domain tasks (tests, docs, devops, data) | all except edit/write |

agents auto-sync to `~/.claude/agents/yume-*.md` when enabled. use selected model. pid tracking prevents multi-instance conflicts.

---

## background agents

### queue management
- max 4 concurrent agents
- 30-minute timeout per agent
- queued → running → completed/failed/cancelled states
- real-time progress polling (5s interval)
- uses claude cli directly with `--dangerously-skip-permissions`
- streaming isolation: does NOT control main session streaming state

### git integration
- automatic branch creation (`yume-async-{type}-{id}`)
- worktree isolation mode (in addition to git branch)
- auto-worktree cleanup on cancel
- merge/delete branch operations
- conflict detection before merge

### permissions & scope
- permission modes per agent (dangerously-skip, ask, deny)
- memory scope settings (shared, isolated, read-only)

### ui components
- `AgentQueuePanel` - sliding panel with agent cards
- `ProgressIndicator` - real-time status display
- context bar button with running agent count

### cli flags
```bash
yume-cli --async --output-file ./out.json --git-branch feature-xyz
```

---

## background bash processes

- run long commands detached from the session (`run_in_background`)
- survives the originating turn; results auto-inject when the process finishes
- state in `~/.yume/bg-processes.json`, output in `~/.yume/bg-output/`
- indicator in the ui with list/kill/clear controls (`cmd/ctrl + b`)

---

## analytics

### per-message
- input/output tokens
- cache read/creation tokens
- cost in dollars

### dashboard (📊)
- time ranges: 7d, 14d, 30d, all-time
- view modes: all sessions, specific project
- breakdowns: by model, date, project
- deduplication by requestId
- csv/json export

### performance monitoring
enable: `localStorage.setItem('yume_perf_monitor', 'true')`

| metric | target | warning | critical |
|--------|--------|---------|----------|
| fps | 60 | <30 | — |
| memory | — | 100mb | 200mb |
| startup | <3s | — | 5s |
| message send | — | 500ms | 1s |
| compaction | — | 5s | 10s |

export with p50/p90/p99 percentiles.

---

## ui

### row split panels
- up to 6 panels in 3x2 grid (3 columns x 2 rows)
- independent sessions per panel
- drag-to-resize between rows
- keyboard shortcuts: cmd/ctrl+shift+1/2/3

### vim mode
- normal/insert/visual/command modes for chat input
- standard vim motions (h/j/k/l, w/b/e, 0/$)
- ex commands (:w to send, :q to clear)
- toggle via settings or command palette

### favorite projects
- assign hotkeys (a-z) to projects
- quick-access from projects modal
- persistent across sessions

### themes (12)
yume (default), void, cobalt, slate, arctic, synth, mint, grove, ochre, bourbon, burnt, rose

oled optimized (pure black backgrounds).

### fonts
- 26 monospace: jetbrains mono, fira code, source code pro, sf mono, cascadia code, etc
- 26 sans-serif: inter, sf pro, roboto, open sans, etc

### customization
- window opacity: 50-100%
- global watermark image
- word wrap toggle
- sound on complete
- show result stats
- auto-generate titles

### window
- frameless with custom title bar
- adaptive menu positioning
- minimize/maximize/close
- state persistence (position, size, maximized)
- multi-window support (99 in pro)

### message rendering
- full markdown (commonmark spec)
- syntax highlighting (100+ languages via prism.js)
- code blocks with copy button
- file references: `@file.tsx`, `@src/components/`, `@**/*.test.ts`
- diff viewer (side-by-side, inline)
- virtual scrolling (50+ messages threshold, 25 item overscan)

### voice dictation
- f5 to toggle
- web speech api
- continuous recognition
- visual indicator (pulsing mic)
- preserves existing input

### projects modal
- infinite scroll pagination (20 projects / 10 sessions per page)
- server-side streaming (sse) for progressive session loading
- dual-view: projects list → sessions view with back navigation
- context menu: new session, browse, delete, fork
- search: cmd/ctrl+f for filtering
- session count badges, git changes count
- keyboard: arrows, enter, backspace, delete, home/end, escape

### session changes panel (cmd+s)
- shows files modified during current session
- status indicators: A (added), D (deleted), M (modified), W (write)
- line change statistics badge: +added -removed
- click file to view inline diff (before/after comparison)
- tab disabled when no session changes exist
- files sorted alphabetically with color-coded status

### toast notifications
- global singleton service for app-wide notifications
- 3 types: success (green), error (red), info (accent)
- 2-second default duration
- used for: session ops, dictation toggle, context clearing, compaction

### command autocomplete
- triggered by `/` in input
- 3 sources: built-in, custom, plugin commands
- built-in: `/clear`, `/model`, `/title`, `/init`, `/compact`
- plugin badges showing command origin
- tab to fill, enter to send

### rules tab
- crud for `.claude/rules/*.md` in settings
- create, edit, delete rule files

### secret censoring
- api keys/tokens automatically redacted in output
- applies to bash output, bg processes, mcp

### image thumbnails
- drag-and-drop images into chat
- compression pipeline for large images

### copy picker modal
- select specific code block to copy from messages
- keyboard-navigable block selection

### claude.local.md + memory.md editor
- extended claude.md editor for local overrides
- in-app memory.md editing

### context bar enhancements
- git count badge (modified + added + deleted)
- line changes tracking per session

---

## command palette

**shortcut**: `cmd/ctrl + p`

### features
- 80+ commands across 10 categories
- fuzzy search with scoring (exact > starts with > contains > category > fuzzy)
- submenu navigation (themes, font size, line height, opacity, plugins)
- live theme preview (cancel with esc to restore)
- toggle commands show on/off state
- keyboard nav (arrows, enter, tab, escape)
- direct navigation to settings tabs

### categories
- tabs (new, close, next, previous)
- panels (files, git, search, history)
- session (stats, checkpoint, clear)
- model (selector, toggle opus/sonnet)
- input (ultrathink, dictation)
- zoom (in, out, reset)
- appearance (theme, font, opacity)
- settings (open, specific tabs)
- menu (projects, agents, analytics)

---

## schedule system

- `/schedule` command for timed tasks
- relative triggers: `5m`, `2h` (from now)
- absolute triggers: `2pm`, `14:00` (wall clock)
- event-based triggers: `next` (after response), `done` (streaming ends)
- schedule indicator pill in context bar
- per-session task management dropdown

---

## effort controls

- effort level setting: five steps — low / medium / high / xhigh / max (xhigh+ on supported models)
- thinking budget control per model
- passed as `--effort` to cli

---

## askuser ipc

- claude can ask structured questions mid-session
- single/multi-select choice popover in chat
- file-based ipc (write question, poll answer)
- inline wizard styles with completion sound

---

## keyboard shortcuts (50+)

### tabs
| action | key |
|--------|-----|
| new tab | `cmd/ctrl + t` |
| close tab | `cmd/ctrl + w` |
| duplicate tab | `cmd/ctrl + d` |
| fork session | `cmd/ctrl + shift + d` |
| next tab | `ctrl + tab` |
| switch to tab | `cmd/ctrl + 1-9` |
| switch pane | `cmd/ctrl + shift + 1/2/3` |
| rename tab | `f2` |

### panels
| action | key |
|--------|-----|
| command palette | `cmd/ctrl + p` |
| files panel | `cmd/ctrl + e` |
| git panel | `cmd/ctrl + g` |
| session changes | `cmd/ctrl + shift + s` |
| sessions browser | `cmd/ctrl + j` |
| recent projects | `cmd/ctrl + r` |
| new pane | `cmd/ctrl + n` |
| new window | `cmd/ctrl + shift + n` |
| agents | `cmd/ctrl + shift + a` |
| bg processes | `cmd/ctrl + b` |
| settings | `cmd/ctrl + ,` |

### session
| action | key |
|--------|-----|
| session stats | `cmd/ctrl + .` |
| model & tools | `cmd/ctrl + k` |
| toggle model | `cmd/ctrl + shift + k` |
| open project | `cmd/ctrl + o` |
| clear context | `cmd/ctrl + l` |
| compact context | `cmd/ctrl + m` |
| resume session | `cmd/ctrl + shift + r` |
| edit claude.md | `cmd/ctrl + shift + e` |
| analytics | `cmd/ctrl + y` |
| rollback/history | `cmd/ctrl + h` |

### input
| action | key |
|--------|-----|
| search messages | `cmd/ctrl + f` |
| clear input | `cmd/ctrl + u` |
| focus input | `cmd/ctrl + /` |
| direct paste | `cmd/ctrl + shift + v` |
| new line | `shift + enter` |
| auto-scroll | `ctrl + s` |
| zoom | `cmd/ctrl + +/-/0` |
| dictate | `f5` |
| cancel/stop | `esc` |
| help | `?` or `f1` |

---

## file operations

### search
- fuzzy matching
- glob patterns (`*.ts`, `**/*.tsx`)
- substring matching
- relevance sorting
- 5-second ttl cache

### file management
- recent files (recently modified)
- folder contents listing
- git changed files (from status)
- conflict detection (concurrent edits)
- atomic delete with restore
- modification tracking

### claude.md editor
- in-app editing
- file existence detection
- unsaved changes warning
- token count display
- cmd/ctrl+s to save

---

## database

### location
- macos/linux: `~/.yume/yume.db`
- windows: `%APPDATA%\yume\yume.db`

### tables
- `sessions` — id, name, status, working_directory, claude_session_id, timestamps
- `messages` — id, session_id, message_type, role, content, tool_uses, usage, timestamp
- `analytics` — session_id, tokens_input/output/cache, cost_usd, model, timestamp
- `checkpoints` — id, session_id, timestamp, title, messages, token_stats, metadata
- `settings` — key, value, updated_at
- `compaction_history` — session_id, timestamp, before_tokens, after_tokens, summary

### features
- wal mode for concurrency
- fts5 full-text search

---

## timeline & checkpoints

- visual timeline of conversation
- manual checkpoints (user-created)
- auto checkpoints (before compaction, every n messages)
- hover preview (message count, tokens, cost)
- click to restore
- export/import capability

---

## security

### data
- no telemetry
- local-only operation
- conversations stay on disk
- only network call: license validation

### storage
- license stored locally in `~/.yume/license.json` (survives reinstalls)
- localStorage key: `yume-license-v3`

### process
- isolation: tauri, react, node.js separate
- content security policy
- sandboxed file access

### validation
- 4 layers: frontend, tauri, server, claude
- path traversal prevention
- redos-safe regex for skills
- secret censoring in bash output, bg processes, mcp

### yume-cli limits
- max_turns: 50
- max_duration: 10 minutes
- max_history: 100 messages
- tool timeout: 2 min (bash), 5 min (provider)
- bash command whitelist (~50)
- dangerous pattern blacklist

---

## platforms

### macos
- universal binary (intel + apple silicon)
- traffic light positioning
- translucent sidebar
- vibrancy effects
- pkg installer
- gatekeeper compatible

### windows
- wsl support for claude cli
- hidden console windows
- exe installer
- acrylic effects
- snap layout support
- high dpi (permonitorv2)

### linux
- gtk3/gtk4 integration
- x11/wayland compatible
- system tray
- appimage, deb, rpm, aur, flatpak

---

## developer

### debug mode
enable: `localStorage.setItem('yume_debug_mode', 'true')` or `YUME_DEBUG=true`

features: verbose logging, performance metrics, memory profiling, network inspection, state debugging

### dev commands (cmd/ctrl+shift+p)
- `dev.reload` — reload window
- `dev.clear-cache` — clear localStorage
- `dev.export-state` — export app state
- `dev.import-state` — import app state
- `dev.reset-database` — reset sqlite

### error boundaries
- component isolation
- fallback ui
- error logging to localStorage

---

## license

### tiers
| tier | tabs | panes | windows | price |
|------|------|-------|---------|-------|
| demo | 2 | 2 | 1 | free |
| pro monthly | 99 | 99 | 99 | $4/mo |
| pro lifetime | 99 | 99 | 99 | $49 one-time |

monthly is a paypal subscription. cancel anytime; access continues until the current period ends. lifetime is a one-time payment with forever updates.

### license re-verification

- **weekly recheck** — license is re-validated against the server every ~7 days (± 12h jitter, server-clock anchored)
- **7-day network grace** — if the server is unreachable, yume keeps working for 7 days from the last successful check (anchored to server clock to defeat client clock skew)
- **revert to demo** — on a definitive server-says-invalid response, yume immediately reverts to demo and shows a non-blocking banner
- **retain key for retry** — the key is kept on disk so the user can retry validation from the banner without re-entering it
- **license banner** — `LicenseBanner` component offers retry / upgrade / dismiss when revalidation fails

### validation
- server validation (configured per installation)
- 5-minute response cache
- weekly auto-revalidation (~7d ± 12h jitter)
- format: `XXXXX-XXXXX-XXXXX-XXXXX-XXXXX`
- storage: `~/.yume/license.json` (survives uninstall)

---

## tech specs

### architecture
- rust/tauri 2.10 backend
- react 19 frontend
- node.js server (compiled to binary)

### code
- 200+ tauri commands
- 26 frontend services
- 3,600+ automated tests

### binary
- ~50mb size
- v8 bytecode protection (server)
- no node.js dependency at runtime

### performance
| metric | value |
|--------|-------|
| startup | 2.3s |
| memory (idle) | 145mb |
| memory (active) | 380mb |
| message latency | 65ms |
| compaction | 3.8s |
| fps (scrolling) | 58 |
