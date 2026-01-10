# Yurucode Grade Report

*Subjective Analysis - January 2026*

## Executive Summary

**Overall Grade: B+ (82%)**

Yurucode is a feature-rich, polished Claude Code GUI with excellent UX and unique capabilities. Native Rust/Tauri architecture outperforms Electron competitors. Code quality is functional but has accumulated technical debt. Zero tests is the biggest risk.

---

## Internal Code Quality

| Category | Grade | Notes |
|----------|-------|-------|
| Architecture | B+ | Clean three-process model, proper separation |
| Rust Backend | A- | Excellent patterns, anyhow, tokio, process management |
| React/TS Quality | C+ | 4600-line god store, works but messy |
| Testing | F | 0 tests. Critical risk. |
| Features | A | Comprehensive - 12+ unique features |
| UX/Design | A- | Polished OLED theme, 30 themes, cohesive |
| Maintainability | C | God object, code duplication, magic numbers |
| Documentation | B | CLAUDE.md thorough, inline docs sparse |
| Security | C | dangerously-skip-permissions, permissive CSP |
| Build/Tooling | B+ | Solid scripts, multi-platform |

### Technical Debt Highlights
- `claudeCodeStore.ts` = 4636 lines (god object)
- Token tracking duplicated in 3+ places
- 3 platform server files with 90% identical code
- `any` types scattered in TypeScript
- Magic numbers hardcoded (200000 context, timeouts)

---

## Competitive Grades

### vs Claude Code CLI

| Aspect | CLI | Yurucode | Winner |
|--------|-----|----------|--------|
| Flickering/Lag | React Ink issues | Native, smooth | **Yurucode** |
| IME Support | Broken | Native OS handling | **Yurucode** |
| Quota Tracking | None | 5h + 7-day bars | **Yurucode** |
| Stream Timers | None | Live durations | **Yurucode** |
| File Mentions | Type paths | @ autocomplete | **Yurucode** |
| Config UX | JSON editing | Visual forms | **Yurucode** |
| Power Features | Native | Wrapped | CLI |
| Bleeding Edge | First | Delayed | CLI |

**Grade vs CLI: A-** (solves pain points, minor feature lag)

---

### vs Cursor ($20-200/mo)

| Aspect | Cursor | Yurucode | Winner |
|--------|--------|----------|--------|
| Market Position | $29B, 50% F500 | Indie | Cursor |
| Performance | Electron memory issues | Native Rust | **Yurucode** |
| Tab Completion | 250 tok/s | N/A (different product) | Cursor |
| Price | $240-2400/yr | $21 one-time | **Yurucode** |
| Extensions | VS Code ecosystem | None | Cursor |
| Multi-Model | GPT, Claude, Gemini | Claude only | Cursor |
| Themes | ~5 | 30 | **Yurucode** |
| Quota Tracking | None | 5h + 7-day | **Yurucode** |
| Enterprise | SOC2, SSO | None | Cursor |
| Debug Mode | Visual debugger | None | Cursor |

**Grade vs Cursor: B** (different product category, price advantage, no IDE features)

---

### vs Windsurf ($15/mo)

| Aspect | Windsurf | Yurucode | Winner |
|--------|----------|----------|--------|
| UX Polish | Excellent | Excellent | Tie |
| Auto-Context | Best in class | Manual | Windsurf |
| Performance | Electron | Native Rust | **Yurucode** |
| Price | $180/yr | $21 one-time | **Yurucode** |
| Themes | ~3 | 30 | **Yurucode** |
| Multi-Agent | Wave 13 parallel | 5 built-in agents | Tie |
| Quota Tracking | None | 5h + 7-day | **Yurucode** |
| Memories | Yes | No | Windsurf |
| Enterprise | SOC2 coming | None | Windsurf |

**Grade vs Windsurf: B+** (different category, performance win, price win)

---

### vs Opcode (Free, Direct Competitor)

| Aspect | Opcode | Yurucode | Winner |
|--------|--------|----------|--------|
| Price | Free | $9 | Opcode |
| 5h/7d Limits | No | Yes | **Yurucode** |
| Built-in Agents | 0 | 5 | **Yurucode** |
| Themes | 0 | 30 | **Yurucode** |
| Hook Events | 0 | 9 | **Yurucode** |
| Yurucode Guard | No | Yes | **Yurucode** |
| @ Mentions | No | Yes | **Yurucode** |
| Stream Timers | No | Yes | **Yurucode** |
| Ultrathink | No | Yes | **Yurucode** |
| Crash Recovery | No | Yes | **Yurucode** |
| Keyboard Shortcuts | Few | 32+ | **Yurucode** |
| Custom Commands | No | 12 defaults | **Yurucode** |
| Bash Mode | No | Yes | **Yurucode** |
| CLAUDE.md Editor | Yes | No | Opcode |
| MCP Support | Yes | Yes | Tie |
| Checkpoints | Yes | Yes | Tie |

**Grade vs Opcode: A** (technically superior in 13+ categories)

---

### vs Aider (CLI, Free)

| Aspect | Aider | Yurucode | Winner |
|--------|-------|----------|--------|
| Context Fetching | Best (treesitter) | Via Claude | Aider |
| Git Integration | Native auto-commit | Via Claude | Aider |
| Multi-Model | Any LLM | Claude only | Aider |
| Learning Curve | Steeper | Easier | **Yurucode** |
| Visual Interface | None | Full GUI | **Yurucode** |
| Accessibility | CLI only | Mouse + keyboard | **Yurucode** |

**Grade vs Aider: B** (different philosophies, GUI vs CLI power)

---

### vs Cline (VS Code Extension, Free)

| Aspect | Cline | Yurucode | Winner |
|--------|-------|----------|--------|
| Price | API costs only | $21 + API | Cline |
| IDE Integration | Full VS Code | Standalone | Cline |
| Cost Transparency | Per-request | Session totals | Tie |
| MCP | Can create tools | Uses tools | Cline |
| Desktop Native | No (extension) | Yes (Tauri) | **Yurucode** |
| Themes | VS Code themes | 30 custom | **Yurucode** |

**Grade vs Cline: B** (different integration model)

---

## Overall Competitive Position

```
                    Features
                       ^
                       |
    Cursor/Windsurf    |  (IDE territory)
         +++           |
                       |
    -------------------|-------------------
                       |
         Yurucode ★    |  Opcode
         (unique       |  (free but
          features)    |   basic)
                       |
    -------------------|-------------------
                       |
         Aider         |  CLI tools
         (power)       |
                       +--------------------> Price
                    Free               $200/mo
```

### Positioning Summary

| Segment | Grade | Notes |
|---------|-------|-------|
| vs IDE Tools | B | Different category, can't compete on tab completion |
| vs Direct Competitors | A | Opcode is only direct competitor, yurucode wins |
| vs CLI Tools | A- | Best GUI wrapper for Claude Code |
| vs Extensions | B | Standalone vs integrated tradeoffs |

---

## Unique Advantages (No Competitor Has)

1. **5h + 7-day Anthropic limit tracking** - Only yurucode shows actual subscription limits
2. **Yurucode Guard** - Built-in security hook blocking dangerous commands
3. **5 built-in agents** - architect, explorer, implementer, guardian, specialist
4. **@ mention system** - @r, @m, folder navigation with autocomplete
5. **Stream timers** - Live thinking/bash/compacting durations
6. **Ultrathink support** - Cmd+K insert + rainbow gradient highlighting
7. **30 themes** - Far more than any competitor
8. **9 hook events** - Most comprehensive hook system
9. **Auto-compaction** - 60%/65% threshold automation
10. **Crash recovery** - 24hr restoration window
11. **History/rollback panel** - Visual message history
12. **Bash mode (!/$)** - Direct terminal prefix

---

## Feature Gaps

| Missing Feature | Priority | Competitors Have |
|-----------------|----------|------------------|
| Light mode | Low | All |
| Command palette | Medium | Cursor, Windsurf |
| Memories (cross-session) | Medium | Cursor, Windsurf |
| CLAUDE.md editor | Low | Opcode |
| Multi-model support | Low | Cursor, Windsurf, Aider |
| Tab completion | N/A | IDE feature, different product |

---

## Final Grades

### Internal Quality
| Area | Grade |
|------|-------|
| Code Quality | C+ |
| Testing | F |
| Architecture | B+ |
| Features | A |
| UX | A- |
| **Internal Average** | **B-** |

### Competitive Position
| vs Competitor | Grade |
|---------------|-------|
| vs Claude Code CLI | A- |
| vs Cursor | B |
| vs Windsurf | B+ |
| vs Opcode | A |
| vs Aider | B |
| vs Cline | B |
| **Competitive Average** | **B+** |

### Overall
| Metric | Grade |
|--------|-------|
| Internal Quality | B- (78%) |
| Competitive Position | B+ (85%) |
| **Combined** | **B+ (82%)** |

---

## Recommendations

### Critical (Do First)
1. **Add tests** - At minimum, store logic and rust commands
2. **Split god store** - sessionStore, analyticsStore, uiStore, agentStore

### Important
3. Extract shared constants (context window, timeouts, etc.)
4. Consolidate token tracking to single source of truth
5. Add TypeScript strict types (eliminate `any`)

### Nice to Have
6. Add command palette
7. Add memories feature
8. Light mode for accessibility

---

## TL;DR

**Yurucode = technically superior Claude Code GUI with 12+ unique features, held back by internal code quality issues.**

Ship it, sell it, but refactor before major feature additions. Zero tests is unacceptable for production software.

| Aspect | Verdict |
|--------|---------|
| Would I use it? | Yes |
| Would I recommend it? | Yes, for Claude users |
| Would I maintain it? | Yes, with refactoring |
| Worth $21? | Absolutely |
