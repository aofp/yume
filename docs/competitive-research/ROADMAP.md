# Yume Roadmap

*January 2026 - Updated*

---

## Current State: What Makes Us Better Than CLI

Yume solves the #1 Claude Code CLI problem: **terminal flickering and input lag** (GitHub Issue #1913, 700+ upvotes, 9+ months unfixed).

### Complete Feature List

| Category | Feature | vs CLI |
|----------|---------|--------|
| **Core** | Native rendering | No flickering, no input lag |
| | Multi-tab sessions | Work on multiple things simultaneously |
| | Crash recovery | Auto-restore sessions (24hr window) |
| | Virtualized messages | Handles long sessions without lag |
| **Panels** | Files panel | Click to navigate, see git status |
| | Git panel | Visual diffs with +/- line stats |
| | History/Rollback panel | Visual message history |
| **Context** | Token meter | Always visible percentage + auto/user mode |
| | 5h + 7d limit bars | Visual Anthropic quota tracking (UNIQUE) |
| | Auto-compact | 60%/65% thresholds with visual warnings |
| | Context full overlay | Compact/clear buttons when context full |
| **Tools** | MCP manager | Toggle switches, server status, not JSON |
| | Hooks UI | Visual form, 9 event types, built-in guard |
| | Model selector | Dropdown + tool count indicator |
| **Input** | Ultrathink highlighting | Rainbow gradient when typing "ultrathink" |
| | Cmd+K ultrathink insert | Quick insert ultrathink prefix |
| | @ mentions | Files, @r (recent), @m (modified), folders |
| | / commands | /clear, /model, /title, /init, /compact + custom |
| | Bash mode (!/$ prefix) | Direct terminal commands |
| | Drag & drop | Drop files into context |
| **Output** | Stream indicators | Thinking/bash/compacting timers |
| | Syntax highlighting | Code blocks |
| | Markdown rendering | Full markdown support |
| | Diff viewer | Visual file diffs |
| **Agents** | 5 built-in agents | architect, explorer, implementer, guardian, specialist |
| | Custom agents | Create your own with system prompts |
| | Agent sync | Auto-sync to ~/.claude/agents/ |
| **Themes** | 30 dark themes | CLI has terminal colors only |
| | Font customization | Mono (Comic Mono) + Sans (Neue) |
| | Background opacity | Adjustable transparency |
| **Session** | Checkpoints | Manual save points |
| | Timeline navigator | Visual checkpoint history |
| | Session stats | Detailed usage modal |
| **Analytics** | Full analytics | By model, date, project breakdown |
| | Cost tracking | Per-session and cumulative |
| **Shortcuts** | 32+ keyboard shortcuts | Comprehensive keyboard-first design |

---

## What's Actually Missing

Only 2 things that genuinely matter:

### 1. Command Palette (Cmd+P)

**Why it matters**: Standard UX pattern. Every professional tool has it (VS Code, Slack, Notion, Linear).

**What it does**:
- Fuzzy search all actions
- Quick access to any feature
- Keyboard-first navigation

**Shortcut**: Cmd+P (reserved). Sessions browser moved to Cmd+J.

**Effort**: Medium (2-3 days)

---

### 2. Light Mode

**Why it matters**: Accessibility. Some users have vision issues or work in bright environments.

**What it does**:
- Light color scheme option
- System preference detection
- Toggle in settings

**Effort**: Low (1 day - theme infrastructure already exists with 30 themes)

---

## That's It

Everything else is either:
- Already implemented
- Not important enough to prioritize
- Adds complexity without clear value

### Explicitly NOT on the roadmap:

| Feature | Why Not |
|---------|---------|
| Thinking mode toggle | Cmd+K inserts ultrathink - already done |
| Collapsible tool outputs | CSS exists, can enhance later but not critical |
| Session templates | Most users don't need this complexity |
| Snippet library | Users have their own tools for this |
| Session forking | Checkpoints already exist, can add branching later |
| Session export | Edge case, low demand |
| Session branching | Over-engineered for the use case |
| Split views | Tabs already solve this |
| Smart file suggestions | @ mentions + Claude handle context |

---

## Implementation Order

1. **Light Mode** - 1 day, accessibility requirement
2. **Command Palette** - 2-3 days, polish and professionalism

Total: ~4 days of focused work.

After these 2 features, yume has no meaningful gaps vs CLI or competitors.

---

## Success Criteria

Yume is "100% better than CLI" when:

1. ✅ No flickering or input lag (done)
2. ✅ Visual management of sessions, files, MCP, hooks (done)
3. ✅ Context tracking with 5h/7d limits (done - UNIQUE)
4. ✅ Ultrathink support (done - Cmd+K + highlighting)
5. ⬜ Accessible to all users (needs light mode)
6. ⬜ Discoverable features (needs command palette)

---

## Unique Advantages Summary

Features NO competitor has:

| Feature | Details |
|---------|---------|
| 5h + 7d limit tracking | Visual quota bars in context bar |
| Yume Guard hook | Built-in security protection |
| 5 built-in agents | architect, explorer, implementer, guardian, specialist |
| 30 themes | Way more than Cursor (~5), Windsurf (~3), Opcode (0) |
| 9 hook events | Most comprehensive hook system |
| $21 one-time | vs $240-2400/year subscriptions |
| Crash recovery | Auto-save with 24hr restoration |
| @ mention system | @r recent, @m modified, folder navigation |

---

## Note on Auto-Compact

Our compaction thresholds (60% auto, 65% force) match Claude Code's behavior. This is not a differentiator - it's parity. We show the warnings visually which is better UX, but the underlying logic is the same.
