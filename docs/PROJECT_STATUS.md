# Yume Project Status

**Date:** February 18, 2026
**Version:** 0.14.0
**Status:** Beta (macOS + Windows release-ready, Linux binaries pending)
**Tauri Commands:** ~231 registered across 16 modules

## Executive Summary

Yume is a GUI for Claude CLI with intelligent context management that auto-compacts at configurable thresholds (default 85% auto, 90% force; auto-compact off by default — CLI handles it). Beta quality with major systems implemented: plugin architecture, skills, error boundaries, CSP, crash recovery, analytics, and compiled server binaries.

**Multi-Provider:** Backend complete, UI 75%, disabled by default. `yume-cli` shim supports Gemini/OpenAI with Claude-compatible output. macOS unified binaries ready; Windows/Linux pending.

## Current State

### Working Features
- **Auto-compact at 85%** - Dynamic thresholds (80% warn, 85% auto, 90% force; off by default)
- **Thinking streaming** - Live extended thinking display (UNIQUE - not even CLI has this)
- **Split panes** - 2-pane and 3-pane layouts for parallel workflows
- **Light + dark themes** - 18 themes (12 dark + 6 light) with luminance detection
- **Background bash processes** - Detached cross-platform execution with auto-inject results
- **File preview** - In-app preview for images, audio, video, PDF, code with syntax highlighting
- **Native macOS menu** - Full native menu integration
- **App auto-updater** - Version check via GitHub Pages + optional Claude CLI update
- **Text selection** - Select and copy text from chat messages
- **Token tracking** - Accurate cost calculation with 5h/7d limit display
- **Session management** - Lazy reconnection, tab persistence, tab keep-alive, crash recovery
- **Multi-platform** - macOS, Windows, Linux
- **License system** - Payment and validation functional
- **Plugin system** - Commands, agents, hooks, skills, MCP
- **Skills system** - Auto-inject context with ReDoS-protected triggers
- **Error boundaries** - All major components wrapped
- **CSP security** - Content Security Policy enabled
- **Performance monitoring** - Real-time FPS/memory tracking
- **Analytics dashboard** - Usage analytics with hourly stats and activity streaks
- **Compiled binaries** - No Node.js dependency for users
- **MCP support** - User-installable MCP servers via settings UI
- **Background agents** - 4 concurrent, 30-min timeout, git branch isolation
- **Hooks** - 9 defined, 4 active (`pre_tool_use`, `context_warning`, `compaction_trigger`, `user_prompt_submit`)
- **yume-cli** - Multi-provider shim (Gemini, OpenAI)
- **Orchestration** - 4 core agents (architect, explorer, implementer, guardian)
- **Test infrastructure** - Vitest 3.x, 81 test suites, 2966 tests
- **ACP support** - Agent Client Protocol for external agents (14 commands)
- **Sandbox security** - Process isolation for secure execution (7 commands)
- **Auth login modal** - In-app OAuth authentication
- **Stream event dots** - Live tool activity visualization with gradient blending
- **Windows ARM64** - Native ARM64 Windows builds
- **File drop attachment** - Drop files to attach instead of inserting paths
- **Credentials caching** - Prevent Keychain/Credential Manager dialog spam
- **OAuth token refresh** - Automatic token refresh on 401
- **Image compression** - Improved image handling for attachments

### Remaining Issues
1. **Code signing** - Certificates needed for macOS/Windows
2. **Linux binaries** - Build scripts exist, builds untested (Windows ARM64 now supported)
3. **Platform testing** - More WSL/Linux testing required
4. **Hooks incomplete** - 5/9 events defined but not triggered
5. **Checkpoint listeners** - Feature flag enabled, socket listeners disabled
6. **Provider flags** - Gemini/OpenAI disabled by default

### Code Metrics
- **Lines of Code:** ~85,000+ (63k+ TypeScript/TSX + 22k+ Rust)
- **Tauri Commands:** ~231 across 16 modules
- **Test Suites:** 81 (2966 tests)

## Architecture

**Three-Process Design:**
1. **Tauri** (Rust) - Window management, native APIs
2. **Node.js Server** (compiled binaries) - Claude CLI control
3. **React Frontend** - UI with Zustand

**Key Innovation:** Server compiled via @yao-pkg/pkg eliminates Node.js dependency.

### vs Competition
| Feature | Yume | Opcode | Claudia |
|---------|------|--------|---------|
| Auto-compact | 85% | No | Manual |
| Compiled server | Yes | No | No |
| Token accuracy | Yes | Yes | Unknown |

### Completed Since v0.10.0
- Auth login modal (inline OAuth authentication)
- Stream event dots visualization (live tool activity with gradient blending)
- Windows ARM64 support (native ARM64 builds)
- macOS Sequoia install fix
- OAuth token refresh (automatic on 401)
- Credentials caching (prevent Keychain/Credential Manager spam)
- File drop attachment (drop files to attach instead of inserting paths)
- Image compression (improved image handling)
- Usage limits on welcome screen (5h/7d stats display)

## Path to Production (2-3 Weeks)

**Week 1 - Polish (Current):**
- [x] Error boundaries
- [x] CSP security
- [x] Crash recovery
- [ ] Console.log cleanup
- [ ] Code signing prep

**Week 2 - Distribution:**
- Code signing ($99 macOS + $300-600 Windows)
- Build signed releases
- Beta testing (20-50 users)

**Week 3 - Launch:**
- Public beta release
- Marketing and support

## Financial

**Costs:** ~$500/year essential (certificates, hosting)

**Revenue:** Freeware with Pro license $29, target 1,000 Pro upgrades Year 1 ($29,000)

**Competition:**
- Opcode: Free - we match and offer more features
- Claudia: $20 - we are free with Pro at $29
- Cursor/Windsurf: $240-2400/year - we are free

## Risk Assessment

**High:** Memory crashes, security vulnerabilities, competition

**Medium:** API changes, signing delays, poor reviews

**Mitigation:** Beta testing, "Beta" label at launch, quick iteration, strong support

## Recommendations

**Immediate:**
1. [x] Error boundaries
2. [ ] Remove console.log statements
3. [ ] Code signing setup

**Pre-Launch:**
1. Complete TODO.md "Critical Blockers"
2. Beta test (20+ users)
3. Video demos

**Launch Strategy:**
- Soft launch with "Beta" badge
- Freeware (Pro $29 for extended limits)
- Market auto-compact and plugin system
- Target: Claude Discord, AI developers

## Success Criteria

**Technical:** Crash rate <0.1%, memory <500MB, startup <3s, auto-compact >99.9%

**Business:** 100 sales/month, 4.5+ stars, <5% refunds, 70% 30-day retention

## Conclusion

Strong technical foundation with unique auto-compact feature. Requires 2-3 weeks of polish before release. Primary risks are technical (memory, security).

**Recommendation:** Production hardening sprint, Q1 2026 beta release.

---

**Next Steps:**
1. Review TODO.md
2. Begin Week 1 fixes
3. Recruit beta testers

**Decisions Pending:**
- Certificate budget ($400-700)
- [x] Crash reporting: Not needed (intentionally removed per user request)
- [x] Pricing: Freeware (Pro $29)
