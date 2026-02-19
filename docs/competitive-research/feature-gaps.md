# Feature Gap Analysis & Improvement Opportunities

*Last Updated: January 31, 2026*

## Executive Summary

Yume has achieved **complete feature parity and superiority**. We have 15+ unique features no competitor offers. Only 1 remaining gap:
1. **Light mode** (low priority - accessibility only)

---

## Priority Tiers

### P0 - Must Have (Competitive Baseline) ✅ COMPLETE

| Feature | Claude Code CLI | Cursor | Yume Status |
|---------|-----------------|--------|-----------------|
| Smooth input (no lag) | Broken | Yes | ✅ Native rendering |
| Stable rendering | Broken | Issues v0.45+ | ✅ Best in class |
| File editing | Yes | Yes | ✅ Yes |
| Command execution | Yes | Yes | ✅ Yes |
| Git operations | Yes | Yes | ✅ Yes |
| Multi-file context | Yes | Yes | ✅ Yes |
| Session persistence | Partial | Yes | ✅ Auto-save |
| Crash recovery | No | Yes | ✅ 24hr window |

### P1 - Should Have (Competitive Advantage) ✅ COMPLETE

| Feature | Claude Code CLI | Competitors | Yume Status |
|---------|-----------------|-------------|-----------------|
| Visual file tree | No | Cursor/Windsurf: Yes | ✅ Full w/ git status |
| Visual diff preview | No | Cursor: Yes | ✅ DiffViewer component |
| Drag-drop file add | No | Cursor: Yes | ✅ Native desktop |
| Image paste support | Partial | Cursor: Yes | ✅ Implemented |
| Cost tracking | No | Cline: Yes | ✅ Full analytics modal |
| Token usage display | Partial | Cline: Yes | ✅ Per-model breakdown |
| Project switching | Poor | Cursor: Good | ✅ RecentProjectsModal |
| Search in conversation | No | Most: No | ✅ With highlighting |

### P2 - Nice to Have (Delight Features) ✅ MOSTLY COMPLETE

| Feature | Description | Yume Status |
|---------|-------------|-----------------|
| Parallel agents visual | See multiple agents working | ✅ AgentsModal + 4 built-in |
| Agent activity timeline | Visual history of agent actions | ✅ Enabled |
| Checkpoint visual UI | Time-travel through changes | ✅ CheckpointButton + Timeline |
| Theme support | Dark/light/custom themes | ✅ **12 themes** (dark only) |
| Syntax highlighting | In code blocks | ✅ Implemented |
| Markdown rendering | Pretty message display | ✅ Implemented |
| Keyboard shortcuts | Power user efficiency | ✅ 32+ shortcuts |
| Custom commands | Slash commands with templates | ✅ /clear, /model, /title, /init, /compact + custom |
| Font customization | Monospace + UI fonts | ✅ Comic Mono/Neue |
| System prompts | Custom system prompts | ✅ Implemented |
| Smart file mentions | @r recent, @m modified | ✅ Full @ mention system |
| Ultrathink support | Extended thinking mode | ✅ Cmd+K insert + rainbow highlighting |
| Stream indicators | Activity timers | ✅ Thinking/bash/compacting timers |
| **Thinking streaming** | Live extended thinking display | ✅ **UNIQUE** - not even CLI has this |
| Git panel | Visual git changes | ✅ With +/- line stats |
| History panel | Message rollback | ✅ Implemented |
| Background opacity | Window transparency | ✅ Implemented |
| Command palette | Quick actions (Cmd+P) | ✅ Implemented |
| MCP support | User-installable MCP servers | ✅ Implemented |
| Light mode | Light theme option | ❌ Not implemented |

---

## Competitive Feature Matrix

| Feature | Claude CLI | Cursor | Windsurf | Opcode | Yume |
|---------|------------|--------|----------|--------|----------|
| Smooth UI | No | Yes | Yes | ? | ✅ Yes |
| File tree | No | Yes | Yes | Yes | ✅ Yes (w/ git) |
| Visual diff | No | Yes | Yes | Yes | ✅ Yes |
| Cost tracking | Partial | No | No | Yes | ✅ Yes (full) |
| **5h/7d limit tracking** | No | No | No | No | ✅ **UNIQUE** |
| Token display | Partial | No | No | Partial | ✅ Yes (by model) |
| Image paste | Partial | Yes | Yes | ? | ✅ Yes |
| Checkpoints | Yes | No | No | Yes | ✅ Visual UI |
| Timeline UI | No | No | No | Yes | ✅ Yes |
| MCP | Yes | No | No | Yes | ✅ Full UI |
| Built-in agents | No | No | No | No | ✅ **4 agents** |
| Custom commands | No | No | No | No | ✅ **Yes** |
| Hooks system | Partial | Partial | No | No | ✅ **9 events (4 active)** |
| Security guard | No | No | No | No | ✅ **Yume Guard** |
| Themes | No | ~5 | ~3 | No | ✅ **12 themes** |
| Auto-compaction | Yes | No | No | No | ✅ 75%/80% |
| Crash recovery | No | No | No | No | ✅ **UNIQUE** |
| Keyboard shortcuts | No | Yes | Yes | No | ✅ **32+** |
| Drag & drop | No | Yes | Yes | No | ✅ Yes |
| Font customization | No | Yes | No | No | ✅ Yes |
| @ mentions | No | No | No | No | ✅ **UNIQUE** |
| Ultrathink support | CLI typing | No | No | No | ✅ **Cmd+K + highlighting** |
| **Thinking streaming** | No | No | No | No | ✅ **UNIQUE** |
| Stream timers | No | No | No | No | ✅ **UNIQUE** |
| Git panel | No | Yes | Yes | ? | ✅ Yes |
| History panel | No | No | No | ? | ✅ **UNIQUE** |
| MCP UI | No | No | No | Yes | ✅ Full UI |
| Light mode | No | Yes | Yes | ? | ❌ No |
| Command palette | No | Yes | Yes | No | ✅ Yes |

---

## Unique Yume Features (No Competitor Has)

| Feature | Description |
|---------|-------------|
| **5h + 7-day limit tracking** | Visual quota bars in context bar |
| **Yume Guard** | Built-in security hook (blocks rm -rf, sudo, etc.) |
| **4 built-in agents** | architect, explorer, implementer, guardian |
| **@ mention system** | @r (recent files), @m (modified files), folder navigation |
| **Stream timers** | Live thinking/bash/compacting duration |
| **History/rollback panel** | Visual message history navigation |
| **Ultrathink highlighting** | Rainbow gradient when typing ultrathink |
| **Thinking streaming** | Live extended thinking display - see Claude's reasoning in real-time |
| **Cmd+K ultrathink** | Quick insert thinking mode prefix |
| **12 themes** | Way more than any competitor |
| **9 hook events (4 active)** | pre_tool_use, context_warning, compaction_trigger, user_prompt_submit |
| **Crash recovery** | Auto-save with 24hr restoration window |
| **Freeware** | vs $240-2400/year subscriptions |

---

## Remaining Gaps (1 item)

### 1. Light Mode

**Status**: Not implemented

**Why it matters**: Accessibility requirement

**Effort**: Low (1 day - infrastructure exists with 12 themes)

**Priority**: Low - dark mode is standard for developers

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
1. ✅ Checkpoint/timeline UI
2. ✅ Visual agent status (AgentsModal + 4 built-in)
3. ✅ Conversation search
4. ✅ Custom commands system (/clear, /model, /title, /init, /compact)
5. ✅ Hooks system (9 events defined, 4 active: user_prompt_submit, pre_tool_use, context_warning, compaction_trigger)
6. ✅ @ mention system (@r, @m, folders)
7. ✅ Ultrathink support (Cmd+K + highlighting)
8. ✅ Git panel with line stats
9. ✅ History/rollback panel
10. ✅ Command palette (Cmd+P)

### Phase 4: Advanced (P2) ✅ MOSTLY COMPLETE
1. ✅ MCP visual manager
2. ✅ 32+ keyboard shortcuts
3. ✅ 12 themes (dark mode only)
4. ✅ Font customization
5. ✅ System prompts
6. ✅ Background opacity
7. ✅ Stream indicators with timers
8. ⬜ Light mode (only remaining gap)

---

## Quick Reference

### ✅ Done (January 2026)
- 5h + 7-day Anthropic limit tracking (UNIQUE)
- Token counter with percentage
- Cost estimate (full breakdown)
- 32+ keyboard shortcuts
- Drag & drop (tabs + files)
- Git diff viewer
- Git panel with +/- stats
- Window state persistence
- 12 themes
- 4 built-in yume agents
- Custom slash commands
- 9 hook events (4 active) + yume-guardian agent
- MCP visual manager
- Checkpoints + Timeline
- Auto-compaction at 75%/80%
- Crash recovery (24hr)
- Font customization
- System prompts selector
- @ mentions (@r, @m, folders)
- Ultrathink (Cmd+K + highlighting)
- Stream timers
- History/rollback panel
- Virtualized message list
- Bash mode (!/$)
- Background opacity

### ⬜ Remaining (1 day of work)
1. Light mode (1 day - low priority)

---

## Sources

- [Cursor Features](https://cursor.com/features)
- [Windsurf Changelog](https://windsurf.com/changelog)
- [Claude Code SWE-bench](https://www.anthropic.com/engineering/claude-code-best-practices) - 80.9% leads market
