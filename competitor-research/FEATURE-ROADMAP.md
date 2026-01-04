# yurucode Speed Dominance Roadmap

## Mission: FASTEST Claude Code GUI - Beat Everyone

---

## Phase 1: Speed Foundation (Critical)

### 1.1 Context Window Meter
**beats**: windsurf, sculptor
**complexity**: low
**impact**: high

```
implementation:
- add token counter to status bar
- real-time update during streaming
- color coding: green (<50%) → yellow (50-80%) → red (>80%)
- click to show breakdown by message
- shortcut: cmd+. to toggle visibility
```

### 1.2 Parallel Tab Execution
**beats**: sculptor (containers), cursor (8 agents)
**complexity**: high
**impact**: critical

```
implementation:
- each tab runs independent claude session
- shared project context across tabs
- tab status indicators (running/idle/complete)
- result aggregation view
- shortcut: cmd+shift+enter = run in new parallel tab
- visual: split view to monitor multiple tabs
```

### 1.3 Turbo Mode (Auto-Execute)
**beats**: windsurf turbo mode
**complexity**: medium
**impact**: high

```
implementation:
- toggle in settings + status bar indicator
- auto-approve: npm/yarn commands, file creates, git ops
- configurable allow/deny lists per project
- hold cmd to pause turbo mode
- shortcut: cmd+shift+t to toggle
- security: sandbox commands in turbo mode
```

### 1.4 Instant Actions Bar
**beats**: everyone
**complexity**: medium
**impact**: high

```
implementation:
- floating action bar appears on text selection
- quick actions: explain, fix, optimize, test
- appears above selected text (like notion)
- keyboard: select + space to trigger
- customizable action slots
```

---

## Phase 2: Preview & Context (Differentiators)

### 2.1 Live Preview Pane
**beats**: windsurf click-to-edit
**complexity**: high
**impact**: high

```
implementation:
- split pane with embedded browser
- auto-detect dev server port
- hot reload integration
- click element → generates @mention
- shortcut: cmd+shift+p to toggle preview
- lightweight: use webview not full browser
```

### 2.2 Real-Time Action Tracking
**beats**: windsurf cascade awareness
**complexity**: high
**impact**: high

```
implementation:
- track: clipboard, recent files, git changes, terminal commands
- sidebar showing recent context
- auto-inject relevant context on send
- opt-in with granular controls
- indicator: "claude sees: 5 recent actions"
- shortcut: cmd+shift+a to show action log
```

### 2.3 Smart Context Injection
**beats**: all competitors
**complexity**: medium
**impact**: high

```
implementation:
- auto-detect related files from mentions
- pull in imports/dependencies automatically
- show injected context preview before send
- user can remove items
- learns from usage patterns
```

### 2.4 Fork/Branch Timeline
**beats**: sculptor fork feature
**complexity**: medium
**impact**: medium

```
implementation:
- any message can be branched from
- visual timeline with branch points
- cmd+click message = "branch from here"
- compare branches side-by-side
- merge branches back
- shortcut: cmd+b to branch from current
```

---

## Phase 3: Agent Power (Competitive Parity)

### 3.1 Agent Library
**beats**: opcode pre-built agents, sculptor custom agents
**complexity**: medium
**impact**: medium

```
implementation:
- pre-built agents: git-committer, test-writer, security-audit, docs-gen
- custom agent creation ui
- agent marketplace/sharing
- one-click agent activation
- shortcut: cmd+n opens agent picker
- agents stored in ~/.yurucode/agents/
```

### 3.2 MCP Server Registry
**beats**: sculptor/opcode mcp management
**complexity**: medium
**impact**: medium

```
implementation:
- settings tab for mcp servers
- add/remove/test servers
- import from claude desktop config
- per-project mcp overrides
- status indicators
```

### 3.3 CLAUDE.md Editor
**beats**: opcode built-in editor
**complexity**: low
**impact**: low

```
implementation:
- dedicated tab for CLAUDE.md editing
- syntax highlighting
- live preview
- project-wide search for CLAUDE.md files
- template library
- shortcut: cmd+shift+c to open
```

---

## Phase 4: Speed Optimizations (Polish)

### 4.1 Predictive Commands
**beats**: no one has this
**complexity**: high
**impact**: medium

```
implementation:
- analyze command history patterns
- suggest likely next commands
- ghost text in input field
- tab to accept
- learns per-project patterns
```

### 4.2 Ambient Input Mode
**beats**: no one has this
**complexity**: low
**impact**: high

```
implementation:
- typing anywhere focuses input immediately
- no need to click input field
- escape clears and blurs
- maintains context from previous focus
```

### 4.3 Speed Dial Projects
**beats**: no one has this
**complexity**: low
**impact**: medium

```
implementation:
- pin up to 9 projects
- cmd+shift+1-9 instant switch
- reorder via drag
- shows in title bar or sidebar
- persists across sessions
```

### 4.4 Command Chaining
**beats**: no one has this
**complexity**: medium
**impact**: medium

```
implementation:
- "then" keyword chains commands
- example: "fix the bug then write tests then commit"
- visual progress through chain
- can pause/skip steps
- abort on error option
```

### 4.5 Session Templates
**beats**: no one has this
**complexity**: low
**impact**: medium

```
implementation:
- save current setup as template
- includes: model, system prompt, mcp servers, turbo settings
- one-click apply to new tab
- bundled templates for common workflows
```

---

## Phase 5: Advanced (Future)

### 5.1 Container Isolation (Optional)
**beats**: sculptor docker containers
**complexity**: very high
**impact**: low (niche users)

```
implementation:
- optional docker sandboxing
- custom dockerfiles support
- devcontainer.json compatibility
- performance mode vs safe mode toggle
```

### 5.2 Multi-Model Racing
**beats**: cursor parallel attempts
**complexity**: high
**impact**: medium

```
implementation:
- same prompt to multiple models
- first good answer wins
- or: aggregate best parts
- cost vs speed tradeoff setting
```

### 5.3 Voice Input
**beats**: no one has this
**complexity**: medium
**impact**: low (accessibility)

```
implementation:
- push-to-talk or always-on
- transcription + send
- voice commands for actions
- shortcut: cmd+shift+v to toggle
```

---

## Implementation Priority Queue

### Must Have (Phase 1+2)
1. Context Window Meter - 1 day
2. Turbo Mode - 2 days
3. Parallel Tab Execution - 5 days
4. Ambient Input Mode - 0.5 days
5. Live Preview Pane - 4 days
6. Instant Actions Bar - 2 days

### Should Have (Phase 3)
7. Agent Library - 3 days
8. Fork/Branch Timeline - 3 days
9. Real-Time Action Tracking - 4 days
10. MCP Server Registry - 2 days

### Nice to Have (Phase 4+5)
11. Speed Dial Projects - 1 day
12. Predictive Commands - 4 days
13. Command Chaining - 2 days
14. Session Templates - 1 day
15. CLAUDE.md Editor - 1 day

---

## Speed KPIs to Track

| Metric | Current | Phase 1 | Phase 2 | Phase 3 |
|--------|---------|---------|---------|---------|
| Tasks per hour | 5-10 | 15-20 | 25-30 | 40+ |
| Keystrokes per task | 100+ | 50 | 30 | 20 |
| Wait time % | 60% | 40% | 25% | 15% |
| Context switches | many | few | rare | none |
| Parallel throughput | 1x | 4x | 6x | 8x |

---

## Competitive Taglines

**vs sculptor**: "faster without docker overhead"
**vs opcode**: "same features, faster ui, better shortcuts"
**vs cursor**: "native speed, lower cost, claude-focused"
**vs windsurf**: "all the awareness, none of the bloat"

## Ultimate Goal

**yurucode = fastest possible claude code experience**
- sub-second everything
- keyboard-first always
- parallel by default
- zero friction workflow
