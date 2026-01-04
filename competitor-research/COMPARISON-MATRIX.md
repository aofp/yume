# Feature Comparison Matrix

## Legend
- ✅ = has feature
- ⚡ = best-in-class implementation
- ❌ = missing
- 🔶 = partial/basic implementation

---

## Speed & Performance Features

| Feature | yurucode | sculptor | opcode | cursor | windsurf |
|---------|----------|----------|--------|--------|----------|
| Native app (not electron) | ⚡ tauri | ⚡ tauri | ⚡ tauri | ❌ electron | ❌ electron |
| Cold startup time | ✅ <2s | 🔶 ~1min first | ✅ fast | 🔶 ~5s | 🔶 ~5s |
| Virtualized message list | ✅ | ❌ | ❌ | ✅ | ✅ |
| Performance presets | ⚡ auto-detect | ❌ | ❌ | ❌ | ❌ |
| Device-adaptive config | ⚡ RAM/cores/battery | ❌ | ❌ | ❌ | ❌ |
| Low-memory mode | ✅ <500 messages | ❌ | ❌ | ❌ | ❌ |
| GPU acceleration toggle | ✅ | ❌ | ❌ | ❌ | ❌ |
| 4x faster generation | ❌ | ❌ | ❌ | ⚡ composer | ✅ swe-1.5 |
| 20x faster codebase search | ❌ | ❌ | ❌ | ❌ | ⚡ swe-grep |
| Sub-30s turns | ❌ | ❌ | ❌ | ⚡ | ✅ |

---

## Keyboard Shortcuts & UX Speed

| Feature | yurucode | sculptor | opcode | cursor | windsurf |
|---------|----------|----------|--------|--------|----------|
| Total shortcuts | ⚡ 30+ | 🔶 ~5 | 🔶 ~10 | ✅ ~25 | ✅ ~20 |
| Tab management (cmd+t/w/d) | ⚡ | ❌ | ❌ | ✅ | ✅ |
| Quick tab switch (cmd+1-9) | ⚡ | ❌ | ❌ | ✅ | ✅ |
| Model toggle (cmd+o) | ⚡ | ❌ | ❌ | ✅ | ✅ |
| Ultrathink insert (cmd+k) | ⚡ unique | ❌ | ❌ | ❌ | ❌ |
| Bash mode (!/$ prefix) | ⚡ unique | ❌ | ❌ | ❌ | ❌ |
| @ file mentions | ✅ | ✅ | ❌ | ⚡ | ⚡ |
| / commands | ✅ | ✅ | ❌ | ⚡ | ⚡ |
| Context compaction (cmd+m) | ⚡ | ❌ | ❌ | ❌ | ❌ |
| Search messages (cmd+f) | ✅ | ❌ | ❌ | ✅ | ✅ |

---

## Parallel & Agent Features

| Feature | yurucode | sculptor | opcode | cursor | windsurf |
|---------|----------|----------|--------|--------|----------|
| Parallel agents | ❌ | ⚡ containers | ✅ background | ⚡ 8 agents | ✅ |
| Container isolation | ❌ | ⚡ docker | ❌ | ✅ worktrees | ❌ |
| Custom agent creation | ❌ | ✅ | ⚡ cc_agents | ❌ | ❌ |
| Agent-centric workflow | ❌ | ✅ | ✅ | ⚡ 2.0 | ✅ cascade |
| Pairing mode (sync) | ❌ | ⚡ mutagen | ❌ | ❌ | ❌ |
| Fork from history | ❌ | ⚡ | ❌ | ❌ | ❌ |
| Pre-built agents | ❌ | ❌ | ⚡ git/sast/test | ❌ | ❌ |

---

## Context & Intelligence

| Feature | yurucode | sculptor | opcode | cursor | windsurf |
|---------|----------|----------|--------|--------|----------|
| Real-time action awareness | ❌ | ❌ | ❌ | ❌ | ⚡ |
| Context window meter | ❌ | ✅ | ❌ | ❌ | ⚡ |
| Live preview in IDE | ❌ | ❌ | ❌ | ❌ | ⚡ click-to-edit |
| Click element to edit | ❌ | ❌ | ❌ | ❌ | ⚡ |
| Multi-file understanding | 🔶 via claude | ✅ | 🔶 | ⚡ composer | ⚡ cascade |
| Codebase semantic search | ❌ | ❌ | ❌ | ⚡ | ✅ |
| Auto-execute commands | ❌ | ❌ | ❌ | ❌ | ⚡ turbo mode |

---

## Session & Project Management

| Feature | yurucode | sculptor | opcode | cursor | windsurf |
|---------|----------|----------|--------|--------|----------|
| Multi-tab sessions | ⚡ | ❌ | ❌ | ✅ | ✅ |
| Session restore | ✅ | ✅ | ⚡ | ✅ | ✅ |
| Timeline checkpoints | ✅ | ⚡ snapshots | ⚡ visual | ❌ | ❌ |
| Visual project browser | ✅ | ❌ | ⚡ | ✅ | ✅ |
| Recent projects (cmd+r) | ⚡ | ❌ | ✅ | ✅ | ✅ |
| Session tabs | ⚡ | ❌ | ❌ | ✅ | ✅ |
| Duplicate tab (cmd+d) | ⚡ unique | ❌ | ❌ | ❌ | ❌ |

---

## Analytics & Tracking

| Feature | yurucode | sculptor | opcode | cursor | windsurf |
|---------|----------|----------|--------|--------|----------|
| Usage analytics modal | ✅ | ❌ | ⚡ visual charts | ✅ | ✅ |
| Cost tracking | ✅ | ❌ | ⚡ detailed | ✅ | ✅ |
| Token breakdown | 🔶 | ❌ | ⚡ by model/time | ✅ | ✅ |
| Data export | ❌ | ❌ | ⚡ | ❌ | ❌ |

---

## Configuration & Extensibility

| Feature | yurucode | sculptor | opcode | cursor | windsurf |
|---------|----------|----------|--------|--------|----------|
| MCP server management | ❌ | ⚡ custom | ⚡ registry | ❌ | ❌ |
| CLAUDE.md editor | ❌ | ❌ | ⚡ built-in | ❌ | ❌ |
| Custom dockerfiles | ❌ | ⚡ devcontainer | ❌ | ❌ | ❌ |
| System prompt presets | ✅ | ⚡ per-project | ❌ | ✅ | ✅ |
| Model selection | ✅ | ✅ | ✅ | ⚡ multi | ⚡ multi |
| Hooks configuration | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## Platform & Distribution

| Feature | yurucode | sculptor | opcode | cursor | windsurf |
|---------|----------|----------|--------|--------|----------|
| macOS | ✅ | ✅ | ✅ | ✅ | ✅ |
| Windows native | ✅ | ❌ wsl only | ✅ | ✅ | ✅ |
| Linux | ✅ | ✅ | ✅ | ✅ | ✅ |
| Bundle size | ⚡ ~15MB | 🔶 +docker | ⚡ ~20MB | ❌ ~400MB | ❌ ~350MB |
| Open source | ❌ | ✅ | ✅ AGPL | ❌ | ❌ |

---

## Pricing

| Tool | Price | Notes |
|------|-------|-------|
| yurucode | ? | uses your claude subscription |
| sculptor | free (beta) | requires claude pro/max or api |
| opcode | free | AGPL, open source |
| cursor | $20/mo | 500 fast requests |
| windsurf | $15/mo | more ai usage |
