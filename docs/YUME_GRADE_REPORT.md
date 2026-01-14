# Yume Grade Report

*Updated Analysis - January 14, 2026*

## Executive Summary

**Overall Grade: B+ (82%)**

Yume is a feature-rich, polished Claude Code GUI with excellent UX and unique capabilities. Native Rust/Tauri architecture outperforms Electron competitors. Gemini integration is actively being worked on via a translation layer (`yume-cli`). Code quality is functional but has accumulated technical debt. Zero tests is the biggest risk.

**Recent Market Changes:**
- Claude Code 2.1.0 (Jan 7, 2026) adds session teleportation, skill hot reload, enhanced hooks
- Windsurf now has context window usage meter (reduces one unique advantage)
- Opcode at 15K+ GitHub stars, claims CLI feature parity
- Cursor at $1B+ ARR with improved hooks and instant grep

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

### vs Claude Code CLI 2.1.0

| Aspect | CLI 2.1.0 | Yume | Winner |
|--------|-----------|----------|--------|
| Flickering/Lag | React Ink issues | Native, smooth | **Yume** |
| IME Support | Broken | Native OS handling | **Yume** |
| Quota Tracking | None | 5h + 7-day bars | **Yume** |
| Stream Timers | None | Live durations | **Yume** |
| File Mentions | Type paths | @ autocomplete | **Yume** |
| Config UX | JSON editing | Visual forms | **Yume** |
| Session Teleportation | Yes (/teleport) | No | CLI |
| Skill Hot Reload | Yes | No | CLI |
| Agent/Skill Hooks | Enhanced | Via wrapper | CLI |
| Power Features | Native | Wrapped | CLI |
| Bleeding Edge | First | Delayed | CLI |

**Grade vs CLI: A-** (core UX wins intact, but CLI 2.1.0 adds power features yume doesn't expose)

---

### vs Cursor ($20-200/mo)

| Aspect | Cursor | Yume | Winner |
|--------|--------|----------|--------|
| Market Position | $29B, 50% F500 | Indie | Cursor |
| Performance | Electron memory issues | Native Rust | **Yume** |
| Tab Completion | 250 tok/s | N/A (different product) | Cursor |
| Price | $240-2400/yr | $21 one-time | **Yume** |
| Extensions | VS Code ecosystem | None | Cursor |
| Multi-Model | GPT, Claude, Gemini | Claude (Gemini in progress) | Cursor |
| Themes | ~5 | 30 | **Yume** |
| Quota Tracking | None | 5h + 7-day | **Yume** |
| Enterprise | SOC2, SSO | None | Cursor |
| Debug Mode | Visual debugger | None | Cursor |

**Grade vs Cursor: B** (different product category, price advantage, no IDE features)

---

### vs Windsurf ($15/mo) - Wave 13

| Aspect | Windsurf | Yume | Winner |
|--------|----------|----------|--------|
| UX Polish | Excellent | Excellent | Tie |
| Auto-Context | Best in class | Manual | Windsurf |
| Performance | Electron | Native Rust | **Yume** |
| Price | $180/yr | $21 one-time | **Yume** |
| Themes | ~3 | 30 | **Yume** |
| Multi-Agent | Wave 13 git worktrees | 5 built-in agents | Tie |
| Context Meter | Yes (Wave 13) | Yes | Tie |
| Quota Tracking | None | 5h + 7-day | **Yume** |
| Previews | Website preview in IDE | N/A | Windsurf |
| Memories | Yes | No | Windsurf |
| Enterprise | SOC2 coming | None | Windsurf |

**Grade vs Windsurf: B** (downgraded from B+ - Windsurf added context meter, wave 13 improvements)

---

### vs Opcode (Free, Direct Competitor) - 15K+ Stars

| Aspect | Opcode | Yume | Winner |
|--------|--------|----------|--------|
| Price | Free | $21 | Opcode |
| GitHub Stars | 15K+ | Private | Opcode |
| CLI Feature Parity | Claims yes | Via wrapper | Opcode |
| 5h/7d Limits | No | Yes | **Yume** |
| Built-in Agents | 0 | 5 | **Yume** |
| Themes | 0 | 30 | **Yume** |
| Hook Events | 0 | 9 | **Yume** |
| Yume Guard | No | Yes | **Yume** |
| @ Mentions | No | Yes | **Yume** |
| Stream Timers | No | Yes | **Yume** |
| Ultrathink | No | Yes | **Yume** |
| Crash Recovery | No | Yes | **Yume** |
| Keyboard Shortcuts | Few | 32+ | **Yume** |
| Custom Commands | No | 12 defaults | **Yume** |
| Bash Mode | No | Yes | **Yume** |
| CLAUDE.md Editor | Yes | Yes | Tie |
| Session Forking | Yes | No | Opcode |
| MCP Support | Yes | Yes | Tie |
| Checkpoints | Yes | Yes | Tie |

**Grade vs Opcode: A-** (Opcode improved with 15K+ community, but still lacks 12+ core unique features)

---

### vs Aider (CLI + Browser + VS Code)

| Aspect | Aider | Yume | Winner |
|--------|-------|----------|--------|
| Context Fetching | Best (treesitter+AST) | Via Claude | Aider |
| Git Integration | Native auto-commit | Via Claude | Aider |
| Multi-Model | Any LLM (DeepSeek, GPT-5, etc.) | Claude only | Aider |
| Interface Options | CLI, Browser, VS Code | Desktop app | Aider |
| Architect/Editor | Yes (SOTA approach) | Via Claude agents | Aider |
| Learning Curve | Steeper | Easier | **Yume** |
| Visual Polish | Basic | Full GUI with themes | **Yume** |
| Quota Tracking | None | 5h + 7-day | **Yume** |
| Native Desktop | No | Yes (Tauri) | **Yume** |

**Grade vs Aider: B** (Aider added browser/VS Code modes, but still different philosophies)

---

### vs Cline (VS Code Extension, Free)

| Aspect | Cline | Yume | Winner |
|--------|-------|----------|--------|
| Price | API costs only | $21 + API | Cline |
| IDE Integration | Full VS Code | Standalone | Cline |
| Cost Transparency | Per-request | Session totals | Tie |
| MCP | Can create tools | Uses tools | Cline |
| Desktop Native | No (extension) | Yes (Tauri) | **Yume** |
| Themes | VS Code themes | 30 custom | **Yume** |

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
         Yume ★    |  Opcode
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

### Positioning Summary (Revised)

| Segment | Grade | Notes |
|---------|-------|-------|
| vs IDE Tools | B | Different category, can't compete on tab completion |
| vs Direct Competitors | A- | Opcode improved but yume still leads on features |
| vs CLI Tools | A- | Best GUI wrapper, but CLI 2.1.0 has power features we don't expose |
| vs Extensions | B | Standalone vs integrated tradeoffs |

---

## Unique Advantages (No Competitor Has)

1. **5h + 7-day Anthropic limit tracking** - Only yume shows actual subscription limits
2. **Yume Guard** - Built-in security hook blocking dangerous commands
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
| Session forking | Low | Opcode |
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

### Competitive Position (Revised January 10, 2026)
| vs Competitor | Grade | Change |
|---------------|-------|--------|
| vs Claude Code CLI 2.1.0 | A- | — |
| vs Cursor | B | — |
| vs Windsurf (Wave 13) | B | ↓ from B+ |
| vs Opcode (15K+ stars) | A- | ↓ from A |
| vs Aider (browser mode) | B | — |
| vs Cline | B | — |
| **Competitive Average** | **B** | ↓ from B+ |

### Overall
| Metric | Grade |
|--------|-------|
| Internal Quality | B- (78%) |
| Competitive Position | B (83%) |
| **Combined** | **B+ (81%)** |

### Grade Change Summary
- **Windsurf B+ → B**: Added context window meter, Wave 13 multi-agent improvements
- **Opcode A → A-**: 15K+ GitHub stars, improved CLI feature parity, stronger community
- **Overall**: Market is catching up, but core unique features remain (5h/7d, guard, agents, themes)

---

## Recommendations

### Critical (Do First)
1. **Add tests** - At minimum, store logic and rust commands
2. **Split god store** - sessionStore, analyticsStore, uiStore, agentStore

### Important (Market Parity)
3. **Add command palette** - Standard UX, Cursor/Windsurf have it
4. **Add light mode** - Accessibility requirement
5. Extract shared constants (context window, timeouts, etc.)
6. Consolidate token tracking to single source of truth
7. Add TypeScript strict types (eliminate `any`)

### Consider (CLI 2.1.0 Feature Parity)
8. **Session teleportation UI** - /teleport support for claude.ai/code
9. **Skill hot reload** - Visual indicator when skills change
10. **Enhanced hooks UI** - Support for agent/skill-scoped hooks

### Nice to Have
11. Add memories feature (cross-session preferences)
12. Session forking from checkpoints (match Opcode)

---

## TL;DR

**Yume = technically superior Claude Code GUI with 12+ unique features, held back by internal code quality issues.**

Ship it, sell it, but refactor before major feature additions. Zero tests is unacceptable for production software.

| Aspect | Verdict |
|--------|---------|
| Would I use it? | Yes |
| Would I recommend it? | Yes, for Claude users |
| Would I maintain it? | Yes, with refactoring |
| Worth $21? | Absolutely |
