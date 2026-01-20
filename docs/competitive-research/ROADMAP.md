# Yume Roadmap

**Last Updated:** January 17, 2026
**Version:** 2.0 (Post-Competitive Analysis)

---

## Current State: What Makes Yume Unique

### Complete Feature Summary (v1.1)

| Category | Feature | Competitor Comparison |
|----------|---------|----------------------|
| **Background Agents** | 4 concurrent with git branch isolation | UNIQUE - no competitor has auto git branch isolation |
| **Memory System** | MCP knowledge graph with auto-learning | UNIQUE APPROACH - competitors don't use MCP-based graph |
| **Multi-Provider** | Claude + Gemini + OpenAI via yume-cli | UNIQUE - no other Claude wrapper |
| **Agents** | 5 specialized agents (architect/explorer/implementer/guardian/specialist) | More focused than Cursor's generic agents |
| **Plugin System** | 5 components (commands/agents/hooks/skills/mcp) | UNIQUE - most comprehensive |
| **Skills** | ReDoS-protected regex triggers, context injection | UNIQUE - no competitor validates regex safety |
| **UCF** | Unified Conversation Format for portability | UNIQUE |
| **Analytics** | Per-project/model/date breakdowns | Better than competitors |
| **Context** | 55/60/65% thresholds, 5h/7d rate limits | Matches Claude Code |
| **Pricing** | $21 one-time | 79-96% cheaper than annual subscriptions |

---

## RECENTLY COMPLETED (January 2026)

### ✅ Background/Async Agents (COMPLETE)
**Status:** FULLY IMPLEMENTED AND DOCUMENTED

**Implementation:**
- `background_agents.rs` (580 lines) - Agent queue manager (MAX_CONCURRENT=4, 10min timeout)
- `git_manager.rs` (329 lines) - Git branch operations for isolated agent work
- `commands/background_agents.rs` (397 lines) - 13 Tauri commands for agent lifecycle
- yume-cli extended with `--async`, `--output-file`, `--git-branch` flags
- `AgentQueuePanel.tsx` (347 lines) - Sliding panel UI with agent cards
- `ProgressIndicator.tsx` (55 lines) - Real-time progress display
- `backgroundAgentService.ts` (340 lines) - Event-driven service with Tauri listeners

**Unique Feature:** Auto git branch isolation (`yume-async-{agent}-{id}`) - no competitor has this

---

### ✅ Memory MCP Server System (COMPLETE)
**Status:** FULLY IMPLEMENTED AND DOCUMENTED

**Implementation:**
- `commands/memory.rs` (486 lines) - 10 Tauri commands for MCP server
- `memoryService.ts` (433 lines) - Frontend service with auto-learning
- Storage: `~/.yume/memory.jsonl` (persistent knowledge graph)
- Auto-extracts patterns from conversations (errors, decisions)
- Context injection for relevant memories

**Unique Feature:** MCP-based knowledge graph with auto-learning - unique approach

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

### v1.0 Launch (Current)
- ✅ Multi-provider support complete
- ✅ 5 agents implemented
- ✅ Plugin system with 5 components
- ✅ Analytics dashboard
- ✅ Context compaction

### v1.1 Target (Background Agents) ✅ COMPLETE
- [x] Async agent execution (4 concurrent, 10min timeout)
- [x] Agent progress UI (AgentQueuePanel, ProgressIndicator)
- [x] Git branch integration (auto-branch isolation)
- [x] Memory MCP server system
- [x] Skills UI complete (TriggerEditor, ContentEditor, ReDoS)
- [ ] PR review via guardian agent

### v1.2 Target (IDE Parity)
- [ ] Inline code suggestions
- [ ] Git commit/push
- [ ] Checkpoint system active

### v2.0 Target (Local Models)
- [ ] Ollama integration
- [ ] ACP protocol support
- [ ] Full Windows/Linux support

---

## Competitive Position Summary

| Metric | Yume | Cursor | Windsurf |
|--------|------|--------|----------|
| **Background Agents** | ✅ 4 concurrent | ✅ 8 parallel | ✅ Cascade |
| **Git Branch Isolation** | ✅ UNIQUE | ❌ | ❌ |
| **Memory System** | ✅ MCP graph | ✅ | ✅ |
| **Skills/Context Inject** | ✅ ReDoS-safe | ❌ | ❌ |
| **PR Review** | ❌ (roadmap) | ✅ BugBot | ❌ |
| **Inline Suggestions** | ❌ (roadmap) | ✅ | ✅ |
| **Multi-Provider** | ✅ | ✅ | ✅ |
| **5 Specialized Agents** | ✅ | ❌ | ❌ |
| **Plugin System** | ✅ 5 types | ❌ | ❌ |
| **One-Time Price** | ✅ $21 | ❌ $240/yr | ❌ $180/yr |

**Yume's UNIQUE advantages (competitors lack):**
1. ✅ Git branch isolation for async agents
2. ✅ MCP-based persistent knowledge graph with auto-learning
3. ✅ Skills with ReDoS protection
4. ✅ 5 specialized agents (not generic)
5. ✅ Plugin system with 5 component types
6. ✅ UCF (Unified Conversation Format)
7. ✅ One-time $21 pricing

**Remaining gaps:**
1. PR review (leverage guardian agent)
2. Inline suggestions (table stakes)
3. Full git commit/push UI
