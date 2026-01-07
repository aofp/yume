# yurucode Feature Roadmap (January 2026)

## Strategic Goal: Beat Claude Code CLI's UX in Every Way a GUI Can

---

## Implementation Phases

### Phase 0: Quick Wins (Week 1) - Unlock Disabled Features

These features are **already coded** but disabled:

| Feature | File | Action | Effort |
|---------|------|--------|--------|
| Timeline checkpoints | `checkpointService.ts` | Re-enable listeners | 0.5 days |
| Timeline navigator | `TimelineNavigator.tsx` | Wire to UI | 0.5 days |
| Agent execution | `agentExecutionService.ts` | Verify integration | 1 day |

**Why this matters**: Get 3 features for ~2 days work. Immediate competitive boost.

---

### Phase 1: Context Awareness (Week 1-2)

#### 1.1 Context Window Meter
**beats**: windsurf (their best feature), sculptor, cli
**complexity**: low-medium
**impact**: CRITICAL

```
implementation:
- add token counter component to status bar or chat header
- track input_tokens, output_tokens, cache_read, cache_creation
- calculate percentage: (current / 200k) * 100
- visual: progress bar green (<50%) → yellow (50-80%) → red (>80%)
- tooltip: show breakdown (input/output/cache)
- click to expand: per-message token costs
- integrate with existing analytics system
- shortcut: cmd+. already shows stats, enhance it
```

**Files to modify**:
- `src/renderer/components/Chat/ClaudeChat.tsx` - add meter component
- `src/renderer/stores/claudeCodeStore.ts` - track token state
- Create `src/renderer/components/ContextMeter/ContextMeter.tsx`

#### 1.2 Conversation Export
**beats**: parity with cli `/export`
**complexity**: low
**impact**: high

```
implementation:
- add "Export" button to session menu
- export formats: markdown, json, html
- include: messages, model, project, timestamps
- exclude: internal state, sensitive data
- shortcut: cmd+shift+e
- save to clipboard or file picker
```

**Files to modify**:
- `src/renderer/services/exportService.ts` (create)
- `src/renderer/components/SessionTabs/SessionTabs.tsx` - add menu option

---

### Phase 2: Real-Time Interaction (Week 2)

#### 2.1 Real-Time Message Queueing
**beats**: unique cli feature no GUI has
**complexity**: medium-high
**impact**: CRITICAL for power users

```
implementation:
- allow typing while Claude is responding
- show "queued" indicator on pending messages
- messages send automatically after response
- cmd+enter to force-queue even during streaming
- visual: pending message appears dimmed in chat
- can cancel queued messages
```

**Why this is critical**: Claude CLI's "real-time steering" is its most unique UX innovation. Users can send messages while Claude works, queue commands, and maintain flow. No GUI has this.

#### 2.2 Background Task Indicator
**beats**: cli Ctrl+B feature
**complexity**: medium
**impact**: high

```
implementation:
- show running background processes in sidebar/status bar
- indicator: spinning icon + count
- click to expand: list of running tasks
- can cancel individual tasks
- integrate with existing session state
```

---

### Phase 3: Turbo Mode (Week 2-3)

#### 3.1 Auto-Execute Safe Commands
**beats**: windsurf turbo mode
**complexity**: medium
**impact**: high

```
implementation:
- toggle in settings + status bar indicator
- auto-approve: npm/yarn commands, file creates, git status/diff
- configurable allow-list per project
- configurable deny-list (rm -rf, force push, etc.)
- visual: turbo lightning icon in status bar
- hold cmd to pause turbo mode temporarily
- shortcut: cmd+shift+t to toggle
- audit log: show what was auto-approved
```

**Safety first**:
- default deny-list: `rm -rf`, `sudo`, `chmod 777`, `force push`
- sandbox npm commands (no postinstall scripts in turbo)
- revert capability for auto-approved file changes

---

### Phase 4: Session Management (Week 3)

#### 4.1 Session Forking UI
**beats**: sculptor (their killer feature), cli --fork-session
**complexity**: medium
**impact**: high

```
implementation:
- right-click any message: "Fork from here"
- creates new tab with conversation up to that point
- visual: fork icon in message menu
- timeline view shows branch points
- shortcut: cmd+b to fork from current
- compare branches side-by-side (stretch goal)
```

**Integration with existing**:
- Timeline UI already exists (disabled)
- Checkpoint system partially implemented
- Just need to wire fork action and branch visualization

#### 4.2 Named Sessions
**beats**: cli /rename feature
**complexity**: low
**impact**: medium

```
implementation:
- extend existing /title command to persist as session name
- show named sessions in recent projects modal
- searchable by name
- auto-suggest names based on content (stretch goal)
```

---

### Phase 5: Parallel Execution (Week 3-4)

#### 5.1 Parallel Tab Execution
**beats**: sculptor (docker containers), cursor (8 agents)
**complexity**: HIGH
**impact**: CRITICAL for power users

```
implementation strategy A (simpler):
- each tab is already independent Claude session
- add "Run in parallel" action to send same prompt to multiple tabs
- aggregate results view
- no file isolation (trust user)

implementation strategy B (sculptor-like):
- git worktree per tab for isolation
- merge management UI
- more complex but safer

recommendation: start with A, add B later if needed
```

**Cursor's approach**:
- 8 parallel agents max
- git worktrees for isolation
- automatic best-solution selection

**Sculptor's approach**:
- docker containers
- mutagen file sync
- more isolation but slower

**yurucode approach**:
- leverage existing multi-tab
- add parallel dispatch
- manual result comparison (v1)
- automatic selection (v2)

---

### Phase 6: Files Panel (Week 4)

#### 6.1 File Tree Panel
**beats**: standard IDE expectation
**complexity**: medium
**impact**: medium

```
implementation:
- sidebar panel showing project file tree
- toggle with cmd+e (already mapped)
- file actions: open, rename, delete, create
- integrates with @ mentions
- shows git status on files
- search/filter files
```

**Note**: Currently only @mentions provide file access. A persistent panel is standard expectation.

#### 6.2 Git Panel
**beats**: standard IDE expectation
**complexity**: medium
**impact**: medium

```
implementation:
- toggle with cmd+g (already mapped)
- show: unstaged, staged, recent commits
- actions: stage, unstage, commit, diff view
- integrates with checkpoint system
```

---

### Phase 7: Power User Features (Week 4+)

#### 7.1 CLAUDE.md Editor
**beats**: opcode built-in editor, cli /memory
**complexity**: low
**impact**: medium

```
implementation:
- tab/modal for editing CLAUDE.md
- syntax highlighting for markdown
- preview mode
- find all CLAUDE.md files in project
- templates library
- shortcut: cmd+shift+c
```

#### 7.2 Vim Mode
**beats**: cli /vim
**complexity**: medium
**impact**: medium (power users)

```
implementation:
- toggle in settings + /vim command
- basic vim keybindings: hjkl, w/b, d/c, u, etc.
- show mode indicator (normal/insert/visual)
- escape to normal mode
- integrate with existing keyboard system
```

#### 7.3 Plugin System (Future)
**beats**: cli's 12+ official plugins
**complexity**: HIGH
**impact**: future extensibility

```
concept:
- json/yaml plugin manifest
- hook into existing hooks system
- custom commands
- custom agents
- marketplace/discovery
```

---

## UX Polish Checklist

### Micro-Interactions (Throughout)

| Element | Current | Target |
|---------|---------|--------|
| Button press | static | scale 0.95, 200ms |
| Hover states | basic | smooth transitions |
| Loading states | basic | skeleton loaders |
| Success feedback | none | subtle animation |
| Error feedback | alert | inline + shake |

### Empty States

| Screen | Current | Add |
|--------|---------|-----|
| New tab | blank | "drop folder or cmd+r for recent" |
| No sessions | list | "start your first session" |
| Search empty | none | "no matches found" |
| Analytics empty | none | "no usage data yet" |

### Onboarding Flow

```
step 1: "welcome to yurucode" (first launch only)
step 2: "drop a folder to start" (animated)
step 3: "key shortcuts" (highlight 5 most used)
step 4: "try cmd+k for ultrathink" (demo)
step 5: "press ? anytime for help"
```

---

## Implementation Priority Queue

### Must Have (4 weeks)
| # | Feature | Days | Cumulative |
|---|---------|------|------------|
| 1 | Enable timeline/checkpoints | 1 | 1 |
| 2 | Context window meter | 2 | 3 |
| 3 | Conversation export | 1 | 4 |
| 4 | Empty states | 0.5 | 4.5 |
| 5 | Session forking UI | 2 | 6.5 |
| 6 | Real-time message queueing | 3 | 9.5 |
| 7 | Turbo mode | 3 | 12.5 |
| 8 | Parallel tab execution | 5 | 17.5 |

### Should Have (2 weeks)
| # | Feature | Days | Cumulative |
|---|---------|------|------------|
| 9 | File tree panel | 3 | 20.5 |
| 10 | Git panel | 2 | 22.5 |
| 11 | CLAUDE.md editor | 1 | 23.5 |
| 12 | Vim mode | 2 | 25.5 |

### Nice to Have (ongoing)
| # | Feature | Days |
|---|---------|------|
| 13 | Skeleton loaders | 1 |
| 14 | Micro-interactions | 2 |
| 15 | Onboarding flow | 1 |
| 16 | Named sessions | 1 |
| 17 | Plugin system | 5+ |

---

## Success Metrics

### Speed KPIs

| Metric | Current | Phase 1 | Phase 2 | Phase 3 |
|--------|---------|---------|---------|---------|
| Tasks per hour | 5-10 | 15-20 | 25-30 | 40+ |
| Keystrokes per task | 100+ | 50 | 30 | 20 |
| Wait time % | 60% | 40% | 25% | 15% |
| Context switches | many | few | rare | none |
| Parallel throughput | 1x | 2x | 4x | 8x |

### Feature Parity

| Competitor | Current Parity | Target |
|------------|----------------|--------|
| Claude CLI | 65% | 95% |
| Cursor | 40% | 80% |
| Windsurf | 45% | 85% |
| Sculptor | 50% | 90% |
| Opcode | 55% | 90% |

---

## Competitive Taglines

**vs sculptor**: "faster without docker overhead, native windows support"
**vs opcode**: "more shortcuts, stable windows, better analytics"
**vs cursor**: "25x smaller, $9 not $20/month, no chromium vulns"
**vs windsurf**: "native speed, keyboard-first, no security risks"
**vs claude cli**: "visual tabs, full theming, point-and-click everything"

---

## Ultimate Goal

```
yurucode = the FASTEST, most NATIVE, most KEYBOARD-EFFICIENT Claude Code GUI

- sub-second everything
- keyboard-first always
- parallel by default (coming)
- zero friction workflow
- native, not electron
- secure, not chromium
- $9 one-time, not $20/month
```
