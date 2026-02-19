# Yume Roadmap

**Last Updated:** February 2, 2026
**Version:** 0.8.5

---

## Current State: What Makes Yume Unique

### Complete Feature Summary (v0.8.5)

| Category | Feature | Competitor Comparison |
|----------|---------|----------------------|
| **Background Agents** | 4 concurrent with git branch isolation (30-min timeout) | UNIQUE - no competitor has auto git branch isolation |
| **MCP Support** | User-installable MCP servers via settings | Full Claude CLI ecosystem compatibility |
| **Multi-Provider** | Claude + Gemini + OpenAI via yume-cli (feature-flagged off) | UNIQUE architecture - no other Claude wrapper |
| **4 Core Agents** | yume-architect, yume-explorer, yume-implementer, yume-guardian | More focused than Cursor's generic agents |
| **Plugin System** | 5 components (commands/agents/hooks/skills/mcp) | UNIQUE - most comprehensive |
| **Skills** | ReDoS-protected regex triggers, context injection | UNIQUE - no competitor validates regex safety |
| **UCF** | Unified Conversation Format for portability | UNIQUE |
| **Analytics** | Per-project/model/date breakdowns | Better than competitors |
| **Context** | 70/75/80% thresholds, 5h/7d rate limits | More proactive than Claude Code's 80%/95% |
| **Pricing** | freeware | 79-96% cheaper than annual subscriptions |

---

## RECENTLY COMPLETED (January 2026)

### ✅ Background/Async Agents (COMPLETE)
**Status:** FULLY IMPLEMENTED AND DOCUMENTED

**Implementation:**
- `background_agents.rs` - Agent queue manager (MAX_CONCURRENT_AGENTS=4, 30-min timeout)
- `git_manager.rs` - Git branch operations for isolated agent work
- `commands/background_agents.rs` - 14 Tauri commands for agent lifecycle
- `backgroundAgentService.ts` - Event-driven service with Tauri listeners
- Streaming isolation: background agents do NOT control main CLI streaming state
- Uses Claude CLI directly with `--dangerously-skip-permissions`
- Status flow: `Queued` -> `Running` -> `Completed`/`Failed`/`Cancelled`

**Unique Feature:** Auto git branch isolation (`yume-async-{agent}-{id}`) - no competitor has this

---

### ✅ MCP Support (COMPLETE)
**Status:** FULLY IMPLEMENTED

**Implementation:**
- User-installable MCP servers via settings UI
- Full Claude CLI MCP ecosystem compatibility
- Servers stored in `~/.claude.json`

---

### ✅ Skills UI Completion (COMPLETE)
**Status:** FULLY IMPLEMENTED AND DOCUMENTED

**Implementation:**
- `TriggerEditor.tsx` (287 lines) - Tag-based trigger config (extensions, keywords, regex)
- `ContentEditor.tsx` (178 lines) - Markdown editor with preview toggle
- `regexValidator.ts` (268 lines) - ReDoS detection utility
- `types/skill.ts` (308 lines) - Enhanced types with YAML frontmatter parsing
- `SkillsTab.tsx` - Tabbed modal (general, triggers, content)
- YAML frontmatter sync for skill files

**Unique Feature:** ReDoS protection for regex triggers - no competitor validates this

---

## HIGH PRIORITY: Cursor/Windsurf Parity

### 1. Automated Code Review (PR Review)
**Why:** BugBot reviews 2M+ PRs/month with 70%+ resolution rate

**Competitor Reference:**
- Cursor BugBot: Logic bugs, performance issues, security vulnerabilities
- GitHub Copilot: AI-powered PR reviews

**Implementation:**
- Leverage yume-guardian agent for pre-commit review
- Add git diff analysis before commit
- Show issues inline with suggestions
- Optional pre-commit hook integration

**Priority:** HIGH
**Effort:** Medium (2-3 weeks)

---

### 2. Inline Code Suggestions
**Why:** Table stakes for modern IDE - all major competitors have this

**Competitor Reference:**
- Cursor: Full-line and multi-line completions
- Windsurf: Tab/Supercomplete
- Zed: Zeta edit prediction (200ms p50)

**Implementation Options:**
1. **LSP Integration**: Use existing LSP tool for suggestions
2. **Provider Autocomplete**: Call Claude/Gemini for inline suggestions
3. **Local Model**: Integrate Ollama for offline suggestions

**Priority:** HIGH
**Effort:** Medium-High (3-4 weeks)

---

## MEDIUM PRIORITY: Modern IDE Features

### 5. Git Commit/Push UI
**Why:** Currently view-only (status/diff), can't take action

**Implementation:**
- Stage/unstage files
- Commit with message
- Push to remote
- Branch switching
- Merge/rebase UI

**Priority:** MEDIUM
**Effort:** Medium (2-3 weeks)

---

### 6. Code Navigation
**Why:** Go-to-definition, find references expected in IDEs

**Current State:** LSP tools exist but no UI integration

**Implementation:**
- Clickable symbols in code blocks
- Find references panel
- Breadcrumb navigation
- Symbol outline view

**Priority:** MEDIUM
**Effort:** Medium (2-3 weeks)

---

### 7. Checkpoint System Activation
**Why:** Feature flag enabled but socket listeners disabled

**Current State:**
- checkpointService.ts: Socket listeners disabled (line 54-118)
- Feature flag ENABLE_CHECKPOINTS: true
- UI visible but non-functional

**Implementation:**
- Re-enable socket listeners
- Test checkpoint creation/restoration
- Add auto-checkpoint configuration

**Priority:** MEDIUM
**Effort:** Low (1 week)

---

## LOWER PRIORITY: Platform & Polish

### 8. Windows/Linux Unified Binaries
**Why:** yume-bin-* only built for macOS (arm64/x64)

**Current State:**
- Build scripts exist
- macOS binaries bundled
- Windows/Linux need compilation

**Implementation:**
- CI/CD for cross-platform builds
- Test on Windows/Linux VMs
- Package for each platform

**Priority:** LOW-MEDIUM
**Effort:** Medium (2 weeks)

---

### 9. Local Model Support (Ollama)
**Why:** Privacy trend - Continue.dev, Zed both support Ollama

**Competitor Reference:**
- Continue.dev: Full Ollama support, 100% air-gapped
- Zed: Zeta local model with 200ms p50 latency

**Implementation:**
- Add Ollama provider to yume-cli
- Model selection in provider settings
- Offline indicator in UI

**Priority:** LOW
**Effort:** Medium (2-3 weeks)

---

### 10. ACP Protocol Support
**Why:** Zed's open standard, JetBrains adopting

**What it enables:**
- Connect yume to any ACP-compatible agent
- Future-proof against protocol changes
- Editor interoperability

**Priority:** LOW
**Effort:** High (4+ weeks)

---

## NOT ON ROADMAP

| Feature | Reason |
|---------|--------|
| **Collaborative Editing** | High complexity (CRDTs), niche use case for CLI wrapper |
| **Full IDE Features** | Yume is a focused CLI wrapper, not VS Code competitor |
| **Debugger Integration** | Out of scope for current positioning |
| **Extension Marketplace** | Plugin system works, marketplace adds overhead |

---

## Success Metrics

### v0.8.5 (Current)
- ✅ Multi-provider architecture complete (Claude active; Gemini + OpenAI via yume-cli feature-flagged off)
- ✅ 4 core agents (yume-architect, yume-explorer, yume-implementer, yume-guardian)
- ✅ Plugin system with 5 components (commands/agents/hooks/skills/mcp)
- ✅ Analytics dashboard with cost tracking (hourly stats, activity streaks)
- ✅ Context compaction (70% warn, 75% auto, 80% force)
- ✅ MCP support (user-installable servers)
- ✅ Background agents (4 concurrent, 30-min timeout)
- ✅ Skills UI with ReDoS protection
- ✅ Crash recovery (24hr window)
- ✅ Command palette (Cmd+P)
- ✅ 32+ keyboard shortcuts
- ✅ Tab detach to new window (Ctrl+N shortcut)
- ✅ Thinking streaming (live extended thinking display - UNIQUE)
- ✅ ACP support (Agent Client Protocol) - 14 commands
- ✅ Sandbox security - 7 commands

### v0.8+ Target
- [ ] PR review via guardian agent
- [ ] Inline code suggestions
- [ ] Full git commit/push UI

### v0.8+ Target (Local Models)
- [ ] Ollama integration
- [ ] ACP protocol support
- [ ] Full Windows/Linux unified binary support

---

## Competitive Position Summary

| Metric | Yume | Cursor | Windsurf |
|--------|------|--------|----------|
| **Background Agents** | ✅ 4 concurrent (30-min timeout) | ✅ 8 parallel | ✅ Cascade |
| **Git Branch Isolation** | ✅ UNIQUE | ❌ | ❌ |
| **MCP Support** | ✅ User-installable | ✅ | ✅ |
| **Skills/Context Inject** | ✅ ReDoS-protected | ❌ | ❌ |
| **PR Review** | ❌ (roadmap) | ✅ BugBot | ❌ |
| **Inline Suggestions** | ❌ (roadmap) | ✅ | ✅ |
| **Multi-Provider** | ✅ (arch ready, flagged off) | ✅ | ✅ |
| **4 Core Agents** | ✅ | ❌ | ❌ |
| **Plugin System** | ✅ 5 types | ❌ | ❌ |
| **One-Time Price** | ✅ $29 | ❌ $240/yr | ❌ $180/yr |

**Yume's UNIQUE advantages (competitors lack):**
1. ✅ Git branch isolation for async agents
2. ✅ Skills with ReDoS protection
3. ✅ 4 core agents (architect, explorer, implementer, guardian)
4. ✅ Plugin system with 5 component types
5. ✅ UCF (Unified Conversation Format)
6. ✅ One-time $29 pricing
7. ✅ 5h/7d Anthropic limit tracking
8. ✅ Crash recovery (24hr window)

**Remaining gaps:**
1. PR review (leverage guardian agent)
2. Inline suggestions (table stakes)
3. Full git commit/push UI
4. Light mode (accessibility)
