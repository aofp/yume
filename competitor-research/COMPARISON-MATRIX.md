# Feature Comparison Matrix (Updated January 2026)

## Legend
- ⚡ = best-in-class implementation
- ✅ = has feature
- 🔶 = partial/basic implementation
- ❌ = missing

---

## Speed & Performance Features

| Feature | yume | sculptor | opcode | cursor | windsurf | claude cli |
|---------|----------|----------|--------|--------|----------|------------|
| Native app (not electron) | ⚡ tauri | ⚡ tauri | ⚡ tauri | ❌ electron | ❌ electron | ⚡ bun cli |
| Cold startup time | ⚡ <2s | 🔶 ~1min (docker) | ✅ ~5s | 🔶 ~5s | 🔶 ~5s | ⚡ instant |
| Bundle size | ⚡ ~15MB | 🔶 +docker | ⚡ ~20MB | ❌ ~400MB | ❌ ~350MB | ⚡ ~10MB |
| Memory footprint | ⚡ ~50MB | 🔶 +containers | ✅ ~100MB | ❌ ~300MB | ❌ ~280MB | ⚡ ~30MB |
| Virtualized message list | ✅ | ❌ | ❌ | ✅ | ✅ | n/a (terminal) |
| Performance presets | ⚡ auto-detect | ❌ | ❌ | ❌ | ❌ | ❌ |
| GPU acceleration toggle | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 4x faster generation | ❌ | ❌ | ❌ | ⚡ composer | ❌ | ❌ |
| SWE-1.5 (13x faster) | ❌ | ❌ | ❌ | ❌ | ⚡ | ❌ |

---

## Keyboard Shortcuts & UX Speed

| Feature | yume | sculptor | opcode | cursor | windsurf | claude cli |
|---------|----------|----------|--------|--------|----------|------------|
| Total shortcuts | ⚡ 30+ | 🔶 ~5 | 🔶 ~10 | ✅ ~25 | ✅ ~20 | ⚡ 30+ |
| Tab management (cmd+t/w/d) | ⚡ | ❌ | ❌ | ✅ | ✅ | n/a |
| Quick tab switch (cmd+1-9) | ⚡ | ❌ | ❌ | ✅ | ✅ | n/a |
| Model toggle (cmd+o) | ⚡ | ❌ | ❌ | ✅ | ✅ | ✅ /model |
| Ultrathink insert (cmd+k) | ⚡ unique | ❌ | ❌ | ❌ | ❌ | ✅ natural lang |
| Bash mode (!/$ prefix) | ⚡ unique | ❌ | ❌ | ❌ | ❌ | ❌ |
| @ file mentions | ✅ | ✅ | ❌ | ⚡ | ⚡ | ⚡ |
| / commands | ✅ | ✅ | ❌ | ⚡ | ⚡ | ⚡ 18+ built-in |
| Context compaction (cmd+m) | ⚡ | ❌ | ❌ | ❌ | ❌ | ✅ /compact |
| Search messages (cmd+f) | 🔶 | ❌ | ❌ | ✅ | ✅ | ❌ |
| Vim mode | ❌ | ❌ | ❌ | ✅ | ❌ | ⚡ /vim |
| Real-time steering | ❌ | ❌ | ❌ | ❌ | ❌ | ⚡ unique |

---

## Parallel & Agent Features

| Feature | yume | sculptor | opcode | cursor | windsurf | claude cli |
|---------|----------|----------|--------|--------|----------|------------|
| Parallel agents | ❌ | ⚡ docker containers | ✅ background | ⚡ 8 agents | ✅ | ⚡ Task tool |
| Container isolation | ❌ | ⚡ docker | ❌ | ✅ worktrees | ❌ | ❌ |
| Custom agent creation | ✅ 5 built-in | ✅ | ⚡ cc_agents | ❌ | ❌ | ⚡ yaml agents |
| Built-in subagents | ⚡ 5 core | ✅ | ⚡ git/sast/test | ❌ | ❌ | ⚡ Plan/Explore |
| Background agents | ❌ | ✅ | ❌ | ⚡ cloud agents | ⚡ cascade | ✅ Ctrl+B |
| Fork from history | ❌ | ⚡ | ❌ | ❌ | ❌ | ✅ --fork-session |
| Orchestrator mode | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ (kilo has) |

---

## Context & Intelligence

| Feature | yume | sculptor | opcode | cursor | windsurf | claude cli |
|---------|----------|----------|--------|--------|----------|------------|
| Context window meter | ❌ | ✅ token meter | ❌ | ❌ | ⚡ real-time | ✅ status line |
| Live preview in IDE | ❌ | ❌ | ❌ | ⚡ visual editor | ⚡ click-to-edit | ❌ |
| Click element to edit | ❌ | ❌ | ❌ | ⚡ | ⚡ | ❌ |
| Multi-file understanding | 🔶 via claude | ✅ | 🔶 | ⚡ composer | ⚡ cascade | ⚡ native |
| Codebase semantic search | ❌ | ❌ | ❌ | ⚡ | ⚡ cortex | ⚡ built-in |
| Auto-execute commands | ❌ | ❌ | ❌ | ❌ | ⚡ turbo mode | ❌ |
| MCP support | ✅ | ⚡ custom | ⚡ registry | ❌ | ✅ 100 tools | ⚡ full |
| Memories system | ❌ | ❌ | ❌ | ✅ | ⚡ auto-gen | ✅ CLAUDE.md |
| Context pinning | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |

---

## Session & Project Management

| Feature | yume | sculptor | opcode | cursor | windsurf | claude cli |
|---------|----------|----------|--------|--------|----------|------------|
| Multi-tab sessions | ⚡ | ❌ | ❌ | ✅ | ✅ | ❌ (terminal) |
| Session restore | ✅ | ✅ | ⚡ | ✅ | ✅ | ⚡ --resume |
| Named sessions | 🔶 /title | ❌ | ❌ | ❌ | ❌ | ⚡ /rename |
| Timeline checkpoints | 🔶 disabled | ⚡ snapshots | ⚡ visual | ❌ | ❌ | ✅ rewindFiles |
| Visual project browser | ✅ | ❌ | ⚡ | ✅ | ✅ | 🔶 /resume |
| Recent projects (cmd+r) | ⚡ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Duplicate tab (cmd+d) | ⚡ unique | ❌ | ❌ | ❌ | ❌ | ❌ |
| Session forking | ❌ | ⚡ | ❌ | ❌ | ❌ | ✅ --fork-session |

---

## Analytics & Tracking

| Feature | yume | sculptor | opcode | cursor | windsurf | claude cli |
|---------|----------|----------|--------|--------|----------|------------|
| Usage analytics modal | ⚡ detailed | ❌ | ⚡ visual charts | ✅ | ✅ | ✅ /stats |
| Cost tracking | ⚡ | ❌ | ⚡ detailed | ✅ | ✅ | ⚡ /cost |
| Token breakdown | ⚡ | ❌ | ⚡ by model/time | ✅ | ✅ | ✅ /usage |
| Data export | ❌ | ❌ | ⚡ | ❌ | ❌ | ✅ /export |
| Daily usage charts | ⚡ | ❌ | ⚡ | ❌ | ❌ | ⚡ graphs |

---

## Configuration & Extensibility

| Feature | yume | sculptor | opcode | cursor | windsurf | claude cli |
|---------|----------|----------|--------|--------|----------|------------|
| MCP server management | ✅ ui | ⚡ custom | ⚡ registry | ❌ | ✅ | ⚡ /mcp |
| CLAUDE.md editor | ❌ | ❌ | ⚡ built-in | ❌ | ❌ | ⚡ /memory |
| System prompt presets | ✅ | ⚡ per-project | ❌ | ✅ | ✅ | ⚡ /memory |
| Model selection | ✅ opus/sonnet | ✅ | ✅ | ⚡ multi | ⚡ multi+SWE-1 | ⚡ full |
| Hooks configuration | ⚡ 9 events | ❌ | ❌ | ❌ | ❌ | ⚡ 10 events |
| Custom commands | ✅ 8 built-in | ❌ | ❌ | ❌ | ❌ | ⚡ plugins |
| Plugin system | ❌ | ❌ | ❌ | ❌ | ❌ | ⚡ 12+ plugins |
| Theming | ⚡ full | ❌ | 🔶 | 🔶 | 🔶 | 🔶 /theme |

---

## Platform & Distribution

| Feature | yume | sculptor | opcode | cursor | windsurf | claude cli |
|---------|----------|----------|--------|--------|----------|------------|
| macOS | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Windows native | ⚡ | ❌ wsl only | 🔶 issues | ✅ | ✅ | ✅ |
| Linux | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| IDE integration | ❌ standalone | ❌ | ❌ | ⚡ vscode fork | ⚡ 40+ IDEs | ⚡ vscode ext |
| Open source | ❌ | ❌ | ⚡ AGPL | ❌ | ❌ | ❌ |
| Security vulns (2025) | ✅ minimal | ✅ | ✅ | ❌ 94 chromium | ❌ 94 chromium | ✅ |

---

## Pricing (as of January 2026)

| Tool | Price | Notes |
|------|-------|-------|
| yume | $9 one-time | uses your claude subscription |
| sculptor | free (beta) | requires claude pro/max or api |
| opcode | free forever | AGPL, open source |
| cursor | $20-200/mo | $20 Pro, $60 Pro+, $200 Ultra |
| windsurf | $15-60/mo | $15 Pro, $30 Teams, $60+ Enterprise |
| claude cli | included | with Claude Pro/Max subscription |
| kilo code | free | open source, 500+ model providers |
| opencode | free | open source, 75+ providers |
| aider | free | open source |

---

## Market Context (2025-2026)

| Metric | Value |
|--------|-------|
| AI coding market size | $4.7-7.4B (2025) |
| Projected (2030) | $14-24B |
| Claude Code ARR | $1B milestone (Dec 2025) |
| Cursor ARR | $1B+ (Dec 2025) |
| Cursor valuation | $29.3B |
| Cognition/Windsurf valuation | $10.2B |
| Anthropic 2025 revenue | $9B target |
| Developer adoption rate | 82% use AI tools daily |
| AI-generated code | 41% of all code |

---

## Key Competitive Insights

### yume WINS vs Claude CLI
- Visual tab management with cmd+t/w/d/1-9
- Custom theming with 65+ color options
- Built-in usage analytics dashboard
- Point-and-click MCP server management
- Visual project/session browsers

### yume LOSES vs Claude CLI
- No real-time steering (queuing messages during processing)
- No plugin system (12+ official plugins)
- No vim mode
- No session forking (--fork-session)
- No /export command
- No /stats graphs

### yume WINS vs Cursor
- 25x smaller bundle size
- 6x less memory usage
- $9 one-time vs $20+/month
- No Electron security vulnerabilities
- Full MCP support

### yume LOSES vs Cursor
- No parallel agents (0 vs 8)
- No BugBot PR review
- No visual editor
- No background cloud agents
- No Composer model speed

### yume WINS vs Windsurf
- Faster startup (<2s vs ~5s)
- Smaller footprint
- No subscription required
- Keyboard-first design
- No Chromium vulnerabilities

### yume LOSES vs Windsurf
- No turbo mode (auto-execute)
- No context meter
- No Cascade memory system
- No one-click deploys
- No SWE-1 model access

---

## Strategic Positioning Summary

```
yume = FASTEST native Claude Code GUI

vs sculptor: faster (no docker overhead), windows native
vs opcode: more shortcuts, better analytics, stable windows
vs cursor: 25x smaller, no subscription, secure
vs windsurf: native speed, keyboard-first, no vulns
vs claude cli: visual tabs, theming, point-and-click
```
