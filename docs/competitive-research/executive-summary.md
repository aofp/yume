# Executive Summary: Yume & Claude Code CLI

*Prepared for presentation to Claude Code team*

*January 2026*

---

## What is Yume?

**Yume** is a native desktop GUI for Claude Code CLI. It wraps the existing Claude Code CLI to provide a flicker-free, lag-free desktop experience while preserving all of Claude Code's capabilities.

**Pricing**: $21 one-time purchase (uses user's existing Claude Pro/Max subscription)

---

## Why We Built This

We love Claude Code. It's genuinely revolutionary:

> "As a product it's a mile ahead of Codex in QoL features. The harness, prompts and the model make for a magical experience."

> "Claude Code dominated the CLI coding product experience this year."

But terminal rendering issues create real friction for users. We wanted to solve this specific problem without competing with Claude Code's core capabilities.

---

## The Problem We Solve

### Terminal Flickering (Issue #1913)
- **700+ upvotes** (and growing), 9+ months open
- Technical analysis documented **4,000-6,700 scroll events/second**
- VS Code/Cursor crashes after 10-20 minutes, **losing unsaved work**
- Still open as of January 5, 2026

### Root Cause
Claude Code's React Ink renderer performs full terminal redraws on each streaming chunk. Anthropic rewrote the renderer from scratch (v2.0.72+), which reduced flickering—but IDE-specific issues persist.

### Why It's Hard to Fix
The Claude Code team made thoughtful tradeoffs:

> "We value this native experience a lot. We may explore alternate screen mode in the future, but our bar is quite high." — Thariq, Anthropic

They preserved terminal muscle memory (text selection, scrollback, search) rather than taking over the terminal completely. This is the right call for a CLI tool, but introduces rendering complexity.

---

## Our Approach

### What We Do
- Wrap Claude Code CLI in a native Tauri (Rust) desktop app
- React frontend renders in proper WebView (not terminal)
- Eliminates terminal rendering layer entirely
- Uses the Claude Agent SDK / CLI under the hood

### What We Don't Do
- We don't replace Claude Code—we complement it
- We don't compete on model capabilities
- We don't reimplement the agent loop
- We don't charge recurring fees

### Technical Architecture
```
┌────────────────────────────────────┐
│     Yume Desktop Window        │ ← Native (Tauri)
├────────────────────────────────────┤
│       React UI (WebView)           │ ← Proper rendering
├────────────────────────────────────┤
│      Claude Code CLI Process       │ ← Your code, unchanged
├────────────────────────────────────┤
│         Claude API                 │ ← User's subscription
└────────────────────────────────────┘
```

---

## Claude Code Strengths We Preserve

Everything that makes Claude Code great:

| Capability | Status |
|------------|--------|
| 80.9% SWE-bench (leads market) | ✓ Unchanged |
| Plan mode | ✓ Unchanged |
| Subagents | ✓ Unchanged |
| Background agents | ✓ Unchanged |
| MCP integration (8M+ downloads) | ✓ Unchanged |
| CLAUDE.md context | ✓ Unchanged |
| Skills system | ✓ Unchanged |
| Hooks | ✓ Unchanged |
| Checkpoints / /rewind | ✓ Unchanged |
| Git integration | ✓ Unchanged |

---

## What We Add

### Immediate Value
| Problem | CLI Experience | Yume |
|---------|----------------|----------|
| Flickering | 4,000+ events/sec | 0 (native rendering) |
| VS Code crashes | 10-20 min | Never |
| Input lag | 100ms-10s | <50ms target |
| Paste freeze (#16335) | Breaks in Jan 2026 | Native paste |
| Korean panic (#16327) | Crashes | Unicode-safe |
| IME support | Fixed but fragile | Native OS IME |

### Already Implemented
- ✅ **5h + 7-day Anthropic limit tracking** (unique - tracks actual subscription limits)
- ✅ Visual file tree (with git status indicators)
- ✅ Git diff viewer (visual diff preview)
- ✅ **9-event hook system** (user_prompt_submit, pre/post_tool_use, session_start/end, etc.)
- ✅ **Drag & drop** (tab reordering, file drops)
- ✅ **32+ keyboard shortcuts** (keyboard-first design)
- ✅ **12 themes** (oled optimized)
- ✅ **5 built-in agents** (architect, explorer, implementer, guardian, specialist)
- ✅ **Auto-compaction** at 60%/65% thresholds
- ✅ **Crash recovery** (auto-save every 5 min)
- ✅ Session management with tabs
- ✅ Usage dashboard (full AnalyticsModal)
- ✅ MCP visual manager (MCPTab)
- ✅ **Checkpoint + Timeline navigator** (visual git-style UI)
- ✅ **12 default custom commands** (/code-review, /commit, /pr, etc.)
- ✅ Virtualized message list (handles long sessions)
- ✅ Bash mode (!/$) for direct commands
- ✅ Conversation search
- ✅ **CLAUDE.md editor** (visual editor with save/discard)
- ✅ **Command palette** (56 commands, Cmd+P)
- ✅ **Multi-provider** (Claude + Gemini + OpenAI via yume-cli)
- ✅ **Background agents** (4 concurrent, git branch isolation)
- ✅ **Memory MCP server** (persistent knowledge graph)
- ✅ **Skills system** (auto-inject context, ReDoS-safe triggers)
- ✅ **Plugin system** (5 component types)
- ✅ **Session changes panel** (track file modifications)
- ✅ **Line changes tracking** (+added/-removed per session)
- ✅ **Toast notifications** (success/error/info)

### Future Enhancements
- Light mode theme
- System notifications

---

## Target Users

We serve users who:
1. **Love Claude Code** but hate terminal lag
2. **Use IDE terminals** (VS Code, Cursor) where crashes are worst
3. **Need IME support** (Japanese, Chinese, Korean developers)
4. **Work on long sessions** where degradation accumulates
5. **Prefer visual interfaces** over pure CLI

We're not trying to replace CLI power users who love the terminal.

---

## Business Model

### Why $21 One-Time?

| Approach | Why We Chose It |
|----------|-----------------|
| **Not subscription** | Developers hate subscription fatigue |
| **Not API-based** | Uses existing Claude subscription |
| **Not free** | We need to sustain development |
| **Low price** | $21 is impulse-buy, not budget decision |
| **One-time** | Ownership > renting |

### Revenue Model
- $21 per license
- No recurring fees
- No API markup
- No upsells

---

## What This Means for Anthropic

### Potential Benefits
1. **Expands Claude Code's reach** - Users who can't tolerate terminal issues can still use Claude Code
2. **Reduces support burden** - We handle desktop-specific issues
3. **Increases Claude subscription value** - One subscription, multiple interfaces
4. **Validates market** - Desktop GUI demand without Anthropic's investment

### Not Competing
- We use Claude Code CLI—we don't replace it
- We don't access Claude API directly—users use their subscription
- We don't modify or redistribute Claude Code source
- We're additive, not competitive

---

## About Us

**yume** = Japanese for "loose/relaxed code"

We're building tools that make AI coding more accessible. This is our first product.

### Why We Care
We use Claude Code daily. We've experienced the flickering. We've lost work to crashes. We built the tool we wanted to exist.

---

## Open Questions for Claude Code Team

If you'd consider engaging, we'd love to understand:

1. **Are there plans for an official desktop client?** We'd happily sunset if so.

2. **Would a partnership make sense?** We could share usage patterns, bug reports, or user feedback.

3. **Any guidance on CLI integration?** We use the CLI as a subprocess—are there preferred patterns?

4. **Future API considerations?** The Agent SDK is powerful—would a desktop-focused integration be welcome?

---

## Technical Details

For engineering review, see:
- [Claude Code CLI Analysis](./claude-code-cli.md)
- [Technical Architecture](./technical-architecture.md)
- [UI Improvement Opportunities](./ui-improvement-opportunities.md)

---

## Contact

[Your contact information here]

---

## Sources

- [How Claude Code is Built - Pragmatic Engineer](https://newsletter.pragmaticengineer.com/p/how-claude-code-is-built)
- [Boris Cherny Interview - Developing.dev](https://www.developing.dev/p/boris-cherny-creator-of-claude-code)
- [The Signature Flicker - Peter Steinberger](https://steipete.me/posts/2025/signature-flicker)
- [GitHub Issue #1913](https://github.com/anthropics/claude-code/issues/1913)
- [Anthropic Engineering - Claude Code Best Practices](https://www.anthropic.com/engineering/claude-code-best-practices)
- [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-typescript)
- [How Anthropic Teams Use Claude Code](https://www.anthropic.com/news/how-anthropic-teams-use-claude-code)
