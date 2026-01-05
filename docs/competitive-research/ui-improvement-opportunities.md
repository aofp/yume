# UI Improvement Opportunities

*Last Updated: January 2026*

*Actionable improvements yurucode can make over Claude Code CLI*

## The Core Problem (Still Unfixed)

Claude Code CLI's terminal UI issues remain the #1 user complaint after 9+ months:

```
Root Cause: Full terminal redraw on every streaming chunk
Result: 4,000-6,700 scroll events/second
Impact: Crashes, data loss, accessibility hazard
```

**Anthropic's fix attempts (v2.0.72-74)**: "Reduced terminal flickering" but fundamental architecture unchanged.

## What Yurucode Solves Immediately

### 1. No Terminal Rendering Layer

| Issue | Claude CLI | Yurucode |
|-------|------------|----------|
| Flickering | 4,000+ events/sec | 0 (native rendering) |
| VS Code crashes | 10-20 min to crash | Never |
| Scrollback corruption | Common | Impossible |
| WCAG accessibility | Violates (>3 flashes/sec) | Compliant |

**How**: Tauri + WebView = proper rendering engine, not terminal emulation.

### 2. Input Handling

| Issue | Claude CLI | Yurucode |
|-------|------------|----------|
| Input delay | 100ms-10s+ | <50ms target |
| Paste freeze (#16335) | Jan 2026: Still broken | Native paste |
| Korean panic (#16327) | Crashes on Korean | Unicode-safe |
| IME support | Fixed in v2.0.68 but still issues | Native OS IME |

### 3. Session Stability

| Issue | Claude CLI | Yurucode |
|-------|------------|----------|
| Long session degradation | Documented | No history accumulation issues |
| Process spawning (7x) | Reported | Single process |
| Terminal state corruption | Persists after exit | Self-contained |

---

## Improvement Categories

### P0: Stability (Must Have) ✅ COMPLETE

These are table stakes - without them, we can't claim to be better:

1. ✅ **Zero flickering** (by architecture)
2. ✅ **Zero crashes** - Graceful error handling + crash recovery
3. ✅ **Instant input** - Native rendering
4. ✅ **Proper Unicode** - All languages work
5. ✅ **Session persistence** - Auto-save + 24hr crash recovery

### P1: Visual Enhancements ✅ COMPLETE

Things CLI fundamentally cannot do well - **all implemented**:

#### File Tree Integration ✅
- Full recursive FileTreeNode component
- Click to add files to context
- Drag-drop support
- Visual git status (M/A/D badges)
- Keyboard navigation

#### Visual Diff Preview ✅
- DiffViewer component
- Unified diff with add/remove/context coloring
- Line numbers and hunk support
- Syntax highlighted

#### Rich Message Display ✅
- Syntax highlighting in code blocks (Prism)
- Collapsible long outputs
- Image previews/paste
- Markdown rendering

### P2: Power Features ✅ MOSTLY COMPLETE

Things that add significant value:

#### Usage Dashboard ✅ (AnalyticsModal)
- Full token breakdown (input/output/cache)
- Cost tracking by model (Opus/Sonnet)
- Daily usage charts
- Per-project analytics
- Time range filtering

#### Project Management ✅ (RecentProjectsModal)
- Recent projects list (up to 10)
- Keyboard navigation (1-9, arrows)
- Last opened timestamps
- One-click switching

#### Conversation Search ✅
- Full-text search with debouncing
- Match highlighting
- Navigation (prev/next)
- Keyboard shortcut: Cmd/Ctrl+F

### P3: Differentiators ⚠️ PARTIAL

Unique features competitors don't have:

#### Checkpoint Timeline ⚠️ (Code exists, disabled)
- CheckpointButton.tsx, TimelineNavigator.tsx exist
- checkpointService.ts has listeners disabled
- Feature flags enabled but UI commented out
- **Action**: Enable and test

#### Agent Activity View ⚠️ (Partial)
- AgentsModal exists with 5 built-in yurucode agents
- Custom agent creation (global/project scoped)
- Agent enable/disable toggle
- Relies on Claude's native Task tool for execution

#### MCP Visual Manager ✅ (MCPTab)
- Add/remove MCP servers
- stdio and SSE transport support
- Server scopes (local/project/user)
- Environment variable configuration
- Connection testing

---

## Quick Wins (Implement First)

Low effort, high impact:

| Feature | Effort | Impact | Status |
|---------|--------|--------|--------|
| Smooth input | Built-in | Critical | ✅ Done |
| Session persistence | Low | High | ✅ Done |
| Theme toggle | Low | Medium | ⚠️ Dark only |
| Window state save | Low | Medium | ✅ Done |
| Copy code blocks | Low | Medium | ✅ Done |
| Keyboard shortcuts | Low | High | ✅ Done |

### Remaining Quick Wins
| Feature | Effort | Impact |
|---------|--------|--------|
| Light mode | Low | Medium |
| System notifications | Low | Medium |
| Command palette | Medium | High |
| Enable checkpoints | Low | High |

---

## Implementation Priority

### Phase 1: Foundation (P0) ✅ COMPLETE
*Goal: Prove we're better than CLI*

- [x] Native desktop window
- [x] No terminal rendering
- [x] <50ms input response
- [x] Crash-free operation (+ recovery)
- [x] Session auto-save
- [x] Proper Unicode/IME

### Phase 2: Visual (P1) ✅ COMPLETE
*Goal: Things CLI can't do*

- [x] File tree sidebar (with git status indicators)
- [x] Visual diff preview (DiffViewer component)
- [x] Syntax highlighting
- [x] Collapsible outputs
- [x] Image preview/paste

### Phase 3: Power (P2) ✅ MOSTLY COMPLETE
*Goal: Power user features*

- [x] Usage dashboard (AnalyticsModal)
- [x] Project management (RecentProjectsModal)
- [x] Conversation search (with highlighting)
- [x] Keyboard shortcuts (full system)
- [x] Theme system (dark + color customization)

### Phase 4: Differentiate (P3) ⚠️ PARTIAL
*Goal: Unique value*

- [~] Checkpoint timeline (code exists, disabled)
- [~] Agent activity view (AgentsModal exists)
- [x] MCP visual manager (MCPTab)
- [ ] Split views

---

## Measuring Success

### Quantitative
- Input latency: <50ms (vs CLI's 100ms-10s)
- Crash rate: 0% (vs CLI's frequent crashes)
- Memory: <150MB (vs CLI's 200-500MB)
- Startup: <500ms

### Qualitative
- "No more flickering" - user feedback
- "Finally works in VS Code" - user feedback
- "Proper Japanese input" - intl users

### Adoption
- Downloads
- GitHub stars
- "Switched from CLI" testimonials

---

## Sources

- [GitHub Issue #1913](https://github.com/anthropics/claude-code/issues/1913) - Terminal Flickering (700+ upvotes)
- [GitHub Issue #10794](https://github.com/anthropics/claude-code/issues/10794) - VS Code Crashes
- [GitHub Issue #16335](https://github.com/anthropics/claude-code/issues/16335) - Paste Freeze (Jan 2026)
- [GitHub Issue #16327](https://github.com/anthropics/claude-code/issues/16327) - Korean Panic (Jan 2026)
- [Namiru.ai Analysis](https://namiru.ai/blog/claude-code-s-terminal-flickering-700-upvotes-9-months-still-broken)
- [Claude Code Changelog](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)
