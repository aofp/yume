# features

complete feature reference.

---

## session management

### tabs
- up to 99 concurrent sessions (pro), 3 (trial)
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
| threshold | action |
|-----------|--------|
| 70% | yellow warning |
| 77.5% | auto-compact triggers |
| 85% | force compact |

sends `/compact` on next user message. generates context manifest preserving important files/functions/decisions.

### token tracking
- input, output, cache read, cache creation tokens
- cost per message (model-specific pricing)
- session totals
- daily/weekly/monthly aggregation

### rate limits (claude only)
- 5-hour limit tracking
- 7-day limit tracking
- reset timestamps
- separate for opus vs sonnet

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
| claude | sonnet 4.5, opus 4.5 | `@anthropic-ai/claude-code` |
| gemini | 2.5 pro, 2.5 flash | `@google/gemini-cli` |
| openai | gpt-5.2 codex, gpt-5.1 mini | `@openai/codex` |

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
- 9 events: UserPromptSubmit, PreToolUse, PostToolUse, AssistantResponse, SessionStart, SessionEnd, ContextWarning, CompactionTrigger, Error
- actions: continue, block, modify
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

## memory v2 system

### overview
per-project markdown memory with TTL-based expiration.

### storage
- location: `~/.yume/memory/`
- format: markdown files per project
- structure:
  - `global/preferences.md` - user preferences
  - `global/patterns.md` - global coding patterns
  - `projects/{hash}/learnings.md` - project learnings
  - `projects/{hash}/errors.md` - error→solution mappings
  - `projects/{hash}/patterns.md` - project patterns
  - `projects/{hash}/brief.md` - project overview

### importance levels
| level | ttl | use case |
|-------|-----|----------|
| 1 | 1 day | ephemeral notes |
| 2 | 7 days | short-term context |
| 3 | 30 days | normal learnings |
| 4 | 90 days | important patterns |
| 5 | permanent | critical knowledge |

### auto-learning triggers
- error/fix patterns: detects `/error|bug|fix|issue|problem|crash|fail/i`
- architecture decisions: detects `/should (use|prefer|avoid)|best practice|pattern/i`

### mcp server
custom `yume-mcp-memory.cjs` with tools:
- `add_observations` - add memories
- `search_nodes` - search by query
- `read_graph` - read all memories

### settings tab
- enable/disable memory system
- view entries per project
- add/delete entries with importance

---

## background agents

### queue management
- max 4 concurrent agents
- 10-minute timeout per agent
- queued → running → completed/failed/cancelled states
- real-time progress polling (5s interval)

### git integration
- automatic branch creation (`yume-async-{type}-{id}`)
- isolated work on dedicated branches
- merge/delete branch operations
- conflict detection before merge

### ui components
- `AgentQueuePanel` - sliding panel with agent cards
- `ProgressIndicator` - real-time status display
- context bar button with running agent count

### cli flags
```bash
yume-cli --async --output-file ./out.json --git-branch feature-xyz
```

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

### context bar enhancements
- git count badge (modified + added + deleted)
- line changes tracking per session

---

## command palette

**shortcut**: `cmd/ctrl + p`

### features
- 56 commands across 10 categories
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

## keyboard shortcuts

### navigation
| action | key |
|--------|-----|
| new session | `cmd/ctrl + n` |
| new tab | `cmd/ctrl + t` |
| close tab | `cmd/ctrl + w` |
| tab 1-9 | `cmd/ctrl + 1-9` |
| settings | `cmd/ctrl + ,` |
| command palette | `cmd/ctrl + p` |

### chat
| action | key |
|--------|-----|
| send | `cmd/ctrl + enter` |
| focus input | `cmd/ctrl + /` |
| clear context | `cmd/ctrl + shift + c` |
| stop | `esc` |
| voice | `f5` |

### window
| action | key |
|--------|-----|
| zoom in | `cmd/ctrl + +` |
| zoom out | `cmd/ctrl + -` |
| reset zoom | `cmd/ctrl + 0` |
| devtools | `cmd/ctrl + shift + i` or `f12` |

### editor
| action | key |
|--------|-----|
| save claude.md | `cmd/ctrl + s` |
| close modal | `esc` |

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
- encrypted license (xor cipher + base64)
- localStorage key: `yume-license-v3`

### process
- isolation: tauri, react, node.js separate
- content security policy
- sandboxed file access

### validation
- 4 layers: frontend, tauri, server, claude
- path traversal prevention
- redos-safe regex for skills

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
- dmg installer
- gatekeeper compatible

### windows
- wsl support for claude cli
- hidden console windows
- msi/nsis installers
- acrylic effects
- snap layout support
- high dpi (permonitorv2)

### linux
- gtk3/gtk4 integration
- x11/wayland compatible
- system tray
- appimage, deb, rpm, aur

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
| tier | tabs | windows | price |
|------|------|---------|-------|
| trial | 3 | 1 | free |
| pro | 99 | 99 | $21 |

### validation
- server validation (configured per installation)
- 5-minute response cache
- 30-minute auto-revalidation
- format: `XXXXX-XXXXX-XXXXX-XXXXX-XXXXX`

---

## tech specs

### architecture
- rust/tauri 2.9 backend
- react 19 frontend
- node.js server (compiled to binary)

### code
- 152 tauri commands
- 24 frontend services
- ~51k lines (39k ts/tsx + 12k rust)
- 32 rust files

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
