# Feature Gap Analysis & Improvement Opportunities

*Last Updated: January 2026*

## Executive Summary

Yurucode has achieved **P0 and P1 feature parity**. The next step to being "100% best Claude Code UI" requires:
1. **Enable existing features** (checkpoints - code exists!)
2. **Fill UX gaps** (command palette, light mode, notifications)
3. **Consider tab completion** (biggest differentiator gap vs Cursor/Windsurf)

---

## Priority Tiers

### P0 - Must Have (Competitive Baseline) ✅ COMPLETE

| Feature | Claude Code CLI | Cursor | Yurucode Status |
|---------|-----------------|--------|-----------------|
| Smooth input (no lag) | Broken | Yes | ✅ Native rendering |
| Stable rendering | Broken | Issues v0.45+ | ✅ Best in class |
| File editing | Yes | Yes | ✅ Yes |
| Command execution | Yes | Yes | ✅ Yes |
| Git operations | Yes | Yes | ✅ Yes |
| Multi-file context | Yes | Yes | ✅ Yes |
| Session persistence | Partial | Yes | ✅ Auto-save |
| Crash recovery | No | Yes | ✅ 24hr window |

### P1 - Should Have (Competitive Advantage)

These differentiate yurucode from both CLI and other GUIs.

| Feature | Claude Code CLI | Competitors | Yurucode Status |
|---------|-----------------|-------------|-----------------|
| Visual file tree | No | Cursor/Windsurf: Yes | ✅ Full implementation w/ git status |
| Visual diff preview | No | Cursor: Yes | ✅ DiffViewer component |
| Drag-drop file add | No | Cursor: Yes | ✅ Native desktop capability |
| Image paste support | Partial | Cursor: Yes | ✅ Implemented |
| Cost tracking | No | Cline: Yes | ✅ Full analytics modal |
| Token usage display | Partial | Cline: Yes | ✅ Per-model breakdown |
| Project switching | Poor | Cursor: Good | ✅ RecentProjectsModal |
| Search in conversation | No | Most: No | ✅ With navigation & highlighting |

### P2 - Nice to Have (Delight Features)

These create "wow" moments and build loyalty.

| Feature | Description | Yurucode Status |
|---------|-------------|-----------------|
| Parallel agents visual | See multiple agents working | ✅ AgentsModal + 5 built-in agents |
| Agent activity timeline | Visual history of agent actions | ✅ **Enabled** |
| Checkpoint visual UI | Time-travel through changes | ✅ **Enabled** (CheckpointButton + TimelineNavigator) |
| Theme support | Dark/light/custom themes | ✅ **30 themes** (dark only) |
| Syntax highlighting | In code blocks | ✅ Implemented |
| Markdown rendering | Pretty message display | ✅ Implemented |
| Keyboard shortcuts | Power user efficiency | ✅ Full shortcut system |
| Custom commands | Slash commands with templates | ✅ Implemented |
| Font customization | Monospace + UI fonts | ✅ Implemented (Comic Mono/Neue) |
| System prompts | Custom system prompts | ✅ Implemented |
| Smart file mentions | @r recent, @m modified | ✅ Implemented |
| Command palette | Quick actions (Cmd+K) | ❌ Not implemented |
| Split views | Multiple conversations | ❌ Not implemented |
| Light mode | Light theme option | ❌ Not implemented |

---

## Detailed Feature Opportunities

### 1. Visual Diff System

**Current gap**: CLI shows text diffs in terminal, hard to parse visually.

**Opportunity**:
- Side-by-side diff view
- Syntax highlighted changes
- Accept/reject per-hunk
- Preview before applying

**Inspiration**: Cursor's inline diff, VS Code's diff editor

**Implementation complexity**: Medium

---

### 2. File Tree Integration

**Current gap**: CLI has no file browser, must type paths.

**Opportunity**:
- Collapsible file tree sidebar
- Click to add to context
- Drag files to chat
- Visual git status indicators

**Inspiration**: VS Code explorer, Cursor sidebar

**Implementation complexity**: Medium

---

### 3. Real-time Token/Cost Tracking

**Current gap**: CLI shows usage only at end of session.

**Opportunity**:
- Live token counter
- Cost estimate per message
- Session total cost
- Budget alerts

**Inspiration**: Cline's cost transparency

**Implementation complexity**: Low (API provides token counts)

---

### 4. Smart Context Suggestions

**Current gap**: CLI requires manual file specification.

**Opportunity**:
- Auto-suggest relevant files based on query
- "Did you mean to include X?" prompts
- Learn from user patterns
- Treesitter-based suggestions (like Aider)

**Inspiration**: Aider's context fetching, Cursor's auto-context

**Implementation complexity**: High

---

### 5. Visual Agent Status

**Current gap**: CLI shows text status only.

**Opportunity**:
- Progress indicators for long operations
- Agent "thinking" visualization
- Multi-agent dashboard
- Background task notifications

**Inspiration**: Cursor's agent mode, macOS activity views

**Implementation complexity**: Medium

---

### 6. Checkpoint/Timeline UI

**Current gap**: CLI has `/rewind` but no visual history.

**Opportunity**:
- Visual timeline of changes
- Click to preview any checkpoint
- Branch from any point
- Compare checkpoints

**Inspiration**: Git history UIs, time machine interfaces

**Implementation complexity**: High

---

### 7. MCP Visual Manager

**Current gap**: CLI MCP config is manual JSON editing.

**Opportunity**:
- Visual MCP server browser
- One-click install
- Configure with UI forms
- Status dashboard

**Inspiration**: VS Code extension marketplace

**Implementation complexity**: Medium

---

### 8. Quick Actions Menu

**Current gap**: CLI requires remembering commands.

**Opportunity**:
- Context menu on selected text
- "Explain this", "Fix this", "Test this"
- Customizable actions
- Keyboard shortcuts

**Inspiration**: GitHub Copilot context menu, Cursor's quick actions

**Implementation complexity**: Low

---

### 9. Conversation Search

**Current gap**: No way to search past conversations.

**Opportunity**:
- Full-text search across sessions
- Filter by date, project, topic
- Jump to specific message
- Semantic search

**Inspiration**: Slack search, email search

**Implementation complexity**: Medium

---

### 10. Collaboration Features (Future)

**Current gap**: All tools are single-user.

**Opportunity**:
- Share sessions with team
- Real-time collaboration
- Comments on suggestions
- Team templates

**Inspiration**: Zed's multiplayer, Google Docs

**Implementation complexity**: Very High (future consideration)

---

## Competitive Feature Matrix

| Feature | Claude CLI | Cursor | Windsurf | Opcode | Yurucode |
|---------|------------|--------|----------|--------|----------|
| Smooth UI | No | Yes | Yes | ? | ✅ Yes |
| File tree | No | Yes | Yes | Yes | ✅ Yes (w/ git) |
| Visual diff | No | Yes | Yes | Yes | ✅ Yes |
| Cost tracking | Partial | No | No | Yes | ✅ Yes (full) |
| **5h/7d limit tracking** | No | No | No | No | ✅ **Unique** |
| Token display | Partial | No | No | Partial | ✅ Yes (by model) |
| Image paste | Partial | Yes | Yes | ? | ✅ Yes |
| Checkpoints | Yes | No | No | Yes | ✅ **Enabled** |
| Timeline UI | No | No | No | Yes | ✅ Yes |
| MCP | Yes | No | No | Yes | ✅ Full UI |
| Built-in agents | No | No | No | No | ✅ **5 agents** |
| Custom commands | No | No | No | No | ✅ **12 defaults** |
| Hooks system | Partial | Partial | No | No | ✅ **9 events** |
| Themes | No | ~5 | ~3 | No | ✅ **30 themes** |
| Auto-compaction | No | No | No | No | ✅ **60%/65%** |
| Crash recovery | No | No | No | No | ✅ **Unique** |
| Keyboard shortcuts | No | Yes | Yes | No | ✅ **30+** |
| Drag & drop | No | Yes | Yes | No | ✅ Yes |
| Font customization | No | Yes | No | No | ✅ Yes |
| Subagents | Yes | Yes | Yes | Yes | ✅ Via Claude |
| CLAUDE.md editor | No | No | No | Yes | ❌ No |
| Multi-project | Partial | Yes | Yes | Yes | ✅ Yes |
| Light mode | No | Yes | Yes | ? | ❌ No |
| Command palette | No | Yes | Yes | No | ❌ No |

---

## Implementation Roadmap Status

### Phase 1: Foundation (P0) ✅ COMPLETE
1. ✅ Eliminate all input lag
2. ✅ Stable, flicker-free rendering
3. ✅ Basic session persistence
4. ✅ Crash recovery

### Phase 2: Visual Enhancement (P1) ✅ COMPLETE
1. ✅ File tree sidebar (with git status)
2. ✅ Visual diff previews
3. ✅ Cost/token tracking (full analytics)
4. ✅ Image paste support

### Phase 3: Power Features (P1-P2) ✅ COMPLETE
1. ✅ **Checkpoint/timeline UI (NOW ENABLED)**
2. ✅ Visual agent status (AgentsModal + 5 built-in agents)
3. ✅ Conversation search
4. ✅ Custom commands system
5. ✅ Hooks system (9 events)
6. ❌ Command palette (Cmd+K)

### Phase 4: Advanced (P2) ✅ MOSTLY COMPLETE
1. ✅ MCP visual manager
2. ✅ Keyboard shortcut system
3. ✅ **30 themes** (dark mode only)
4. ✅ Font customization
5. ✅ System prompts
6. ✅ Smart file mentions (@r, @m)
7. ❌ Split views
8. ❌ Light mode

### Phase 5: Differentiation (Future)
1. ❌ Smart context suggestions
2. ❌ Collaboration features
3. ❌ Team/enterprise features
4. ❌ Plugin system

Note: Tab completion removed - it's an IDE feature, not applicable to chat interfaces.

---

## Quick Wins (January 2026)

### ✅ Already Done (Updated January 2026)
- **5h + 7-day Anthropic limit tracking** (UNIQUE - no competitor has this)
- Token counter (AnalyticsModal)
- Cost estimate (full breakdown by model)
- **30+ keyboard shortcuts** (keyboard-first design)
- **Drag & drop** (tab reordering, file drops)
- **Git diff viewer** (visual diff preview)
- Window state persistence
- **30 themes** (way more than Cursor ~5, Windsurf ~3, Opcode 0)
- 5 built-in yurucode agents (architect, explorer, implementer, guardian, specialist)
- **12 default custom commands** with templates (global/project)
- Hooks system (**9 event types** - Opcode has 0)
- MCP visual manager
- **Checkpoints ENABLED** (Opcode also has this)
- **Timeline UI ENABLED** (Opcode also has this)
- **Auto-compaction at 60%/65%** (UNIQUE)
- **Crash recovery** (auto-save every 5 min - UNIQUE)
- Font customization (Comic Mono/Neue)
- System prompts selector
- Smart file mentions (@r recent, @m modified)
- Virtualized message list (handles long sessions)
- Bash mode (!/$) for direct commands

### 🎯 Remaining Priorities (To Be "100% Best")

| Feature | Effort | Impact | Why |
|---------|--------|--------|-----|
| **Light mode** | LOW | MEDIUM | Infrastructure exists. Many users need it. |
| **System notifications** | LOW | MEDIUM | Native OS feature. Alert on task completion. |
| **Command palette** | MEDIUM | HIGH | Cmd+K is expected. Every competitor has it. |

### 📈 Stretch Goals (Competitive Parity)

| Feature | Effort | Impact | Why |
|---------|--------|--------|-----|
| **Memories/preferences** | MEDIUM | MEDIUM | Cursor & Windsurf have it. Persist coding style. |
| **Tab completion** | HIGH | CRITICAL | Biggest gap. Every competitor has it. Consider basic implementation. |
| **Web preview pane** | MEDIUM | MEDIUM | Windsurf has it. See changes in-app. |

---

## Strategic Analysis

### Yurucode's Unique Advantages (Lean Into These)
1. **5h + 7-day Anthropic limit tracking** - **UNIQUE** - Only yurucode tracks actual subscription limits
2. **Auto-compaction at 60%/65%** - No competitor does this (not Opcode, not Cursor, not Windsurf)
3. **$9 one-time purchase** - Cursor charges $20-200/mo, Windsurf $15-60/mo, Opcode is free but fewer features
4. **Native Rust performance** - Cursor has memory issues, Windsurf WSL crashes, Opcode likely Electron
5. **Full Claude ecosystem** - MCP, hooks, skills, checkpoints all supported
6. **9 hook events** - Most comprehensive hook system (Opcode has 0)
7. **30 themes** - Way more than Cursor (~5), Windsurf (~3), or Opcode (0)
8. **5 built-in agents** - architect, explorer, implementer, guardian, specialist - **UNIQUE** (Opcode doesn't have this)
9. **12 default custom commands** - Slash commands with $ARGUMENTS templates - **UNIQUE**
10. **30+ keyboard shortcuts** - Keyboard-first design, bash mode (!/$)
11. **Crash recovery** - Auto-save every 5 min - **UNIQUE** (Opcode doesn't have this)
12. **Drag & drop** - Tab reordering, file drops
13. **Git diff viewer** - Visual diff preview
14. **Virtualized messages** - Handles long sessions without lag
15. **No telemetry** - Privacy advantage
16. **80.9% SWE-bench** - Claude leads, we're Claude-native

### Competitor Weaknesses to Exploit
1. **Cursor**: Performance issues since v0.45.9, expensive for heavy users, no checkpoint UI
2. **Windsurf**: Beta feel, files >300 lines struggle, credit discrepancies, no custom agents
3. **Opcode**: YC-backed but missing: hooks, themes, built-in agents, auto-compaction, crash recovery, keyboard shortcuts, custom commands, 5h/7d limit tracking
4. **All**: No one tracks actual Anthropic 5h/7d limits except yurucode

### What NOT to Build
- Full IDE features (let Claude Code handle it)
- Proprietary models (use Claude's superiority)
- Extension marketplace (wrong target market)
- Cloud sync/collaboration (privacy is our advantage)

---

## Implementation Roadmap

### Phase 1: Quick Wins ✅ DONE
1. ✅ Enable checkpoint/timeline UI
2. [ ] Add light mode theme
3. [ ] Implement system notifications (Tauri has native support)
4. [ ] Add command palette (Cmd+K)

### Phase 2: UX Polish
1. [ ] Memories/preferences system
2. [ ] CLAUDE.md editor (Opcode has this)
3. [ ] Improved agent visualization
4. [ ] Better error states

### Phase 3: Differentiation (Consider)
1. [ ] Web preview integration
2. [ ] Voice input support

---

## New Competitor Features to Watch (Jan 2026)

### From Cursor 2.x
- **Parallel Agents**: Up to 8 agents running simultaneously using git worktrees
- **Visual Editor**: Click-and-drag web design with live preview
- **Debug Mode**: Agents with runtime logs for bug reproduction
- **AI Code Reviews**: Automated review in sidepanel
- **Clarifying Questions**: Interactive UI for plan refinement
- **Priority Processing**: 2x rate for guaranteed low-latency (~50 tokens/sec)

### From Windsurf Wave 13
- **Auto-Generate Memories**: Autonomous context retention
- **Tab to Jump**: Predicts next edit location
- **Codemaps (Beta)**: Visual code mapping
- **Lifeguard (Beta)**: In-IDE bug detection

### From Continue.dev
- **CLI with TUI/Headless Mode**: Can run as coding agent or background agent
- **Custom Assistants**: Multiple assistants with different configurations
- **Background Agents**: Battle-tested workflows for GitHub, Sentry, Linear
- **Rules Generation**: AI can write rules for you in agent mode
- **OAuth for MCP**: Secure authentication for MCP servers

### From Claude Code (Platform Updates)
- **Claude Agent SDK**: Programmatic access to Claude Code capabilities
- **Skills System**: Dynamic loading of specialized instructions
- **Ultrathink Mode**: UI toggle for thinking modes could be valuable
- **Status Line**: Could show in Yurucode UI

### Feature Recommendations for Yurucode

| Feature | Priority | Rationale |
|---------|----------|-----------|
| Thinking mode selector | HIGH | Easy win, Claude supports "think"/"ultrathink" |
| Auto-updater (Tauri plugin) | HIGH | All competitors have this |
| Plan mode toggle | MEDIUM | Execute vs plan-first, popular in Cursor |
| Deep linking (`yurucode://`) | MEDIUM | Open sessions from terminal/browser |
| Skills system UI | MEDIUM | Expose Claude's skills in GUI |
| Parallel sessions | LOW | Run multiple Claude instances |
| Background agent notifications | LOW | Notify when long tasks complete |

---

## Sources

- [Cursor Features](https://cursor.com/features) - $29.3B valuation, 50%+ Fortune 500
- [Windsurf Wave 13](https://windsurf.com/changelog) - Multi-agent, SWE-1.5
- [Cursor Pricing Backlash](https://techcrunch.com/2025/07/07/cursor-apologizes-for-unclear-pricing-changes-that-upset-users/)
- [Zed Performance](https://zed.dev/blog/fastest-ai-code-editor)
- [Claude Code SWE-bench](https://www.anthropic.com/engineering/claude-code-best-practices) - 80.9% leads market
