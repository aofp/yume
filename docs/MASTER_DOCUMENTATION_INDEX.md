# Yume Master Documentation Index

**Created:** January 2026
**Updated:** February 18, 2026
**Version:** 0.14.0
**Total Documentation:** 48 docs (11 core guides + 19 expansion-plan + 18 competitive-research)
**Coverage:** Core codebase, competitive analysis, multi-provider expansion, background agents, split panes, light theme, background bash, file preview, thinking streaming, MCP support, test infrastructure, auth login, stream event dots, Windows ARM64, file drop attachment

---

## Complete Documentation Suite

### 1. [COMPLETE_ARCHITECTURE.md](COMPLETE_ARCHITECTURE.md)
**Size:** ~8,500 words  
**Depth:** Extreme detail on system design

#### Key Sections:
- **Three-Process Architecture**: Detailed process isolation model with IPC flow
- **Component Deep Dive**: Every module explained with code examples
- **Backend Architecture**: All 24 Rust modules documented
- **Frontend Architecture**: Complete React component hierarchy
- **Communication Architecture**: WebSocket protocol, stream processing
- **Critical Systems**: Auto-compaction, memory management, error recovery
- **Security Architecture**: Threat model, boundaries, validation layers
- **Performance Architecture**: Optimizations, monitoring, benchmarks
- **Platform-Specific**: macOS, Windows, Linux implementations
- **Architecture Decision Records**: 4 key decisions documented

#### Unique Insights:
- Compiled server binaries (no Node.js dependency for end users)
- Dynamic port allocation algorithm (20000-65000 range)
- ServerProcessGuard with automatic cleanup via Drop trait
- Bounded buffers preventing memory leaks
- Auto-compaction threshold

---

### 2. [FEATURES_COMPLETE.md](FEATURES_COMPLETE.md)
**Size:** ~11,000 words
**Depth:** Every feature documented with implementation details

#### Core Feature Categories:
1. **Claude CLI Integration**: 6 models across 3 providers, streaming JSON, binary detection
2. **Session Management**: 7 states, persistence layers, recovery, tab keep-alive
3. **Auto-Compaction**: Dynamic thresholds (default T=85%: 80% warn, 85% auto, 90% force)
4. **Token Tracking**: Real-time counting, accurate cost calculation, 5h/7d limits
5. **Editor Features**: Syntax highlighting, diff viewer, file references, text selection
6. **Hook System**: 9 triggers, blocking/non-blocking, variables
7. **MCP Protocol**: Full implementation, server management
8. **Database**: SQLite schema, checkpoints, full-text search
9. **UI/UX**: Custom chrome, 18 themes (12 dark + 6 light), shortcuts, virtual scrolling, split panes
10. **Developer Features**: Debug mode, profiling, extension API
11. **Security**: CSP, isolation, validation, sanitization, sandbox
12. **Performance**: Lazy loading, memory management, monitoring
13. **Platform Features**: Native integrations for each OS, native macOS menu
14. **MCP Support**: User-installable MCP servers via settings UI
15. **Background Agents**: Async execution, git branch isolation (4 concurrent, 30-min timeout, streaming isolation)
16. **Split Panes**: 2-pane and 3-pane layouts for parallel workflows
17. **Light Theme**: Luminance detection, color-scheme support
18. **Background Bash Processes**: Detached cross-platform execution with auto-inject
19. **File Preview**: In-app preview (images, audio, video, PDF, code)
20. **Thinking Streaming**: Live extended thinking display (unique to Yume)
21. **Auth Login**: OAuth login modal for Claude authentication
22. **Stream Event Dots**: Live tool activity visualization with gradient blending
23. **File Drop Attachment**: Drag-and-drop text/code files as attachments
24. **Windows ARM64**: Native ARM64 builds for Windows on ARM

#### Exclusive Features:
- Thinking streaming (live extended thinking - unique, not even CLI has this)
- Split panes (2-pane and 3-pane layouts)
- Background bash processes (detached, cross-platform, auto-inject)
- File preview (images, audio, video, PDF, code with syntax highlighting)
- Light + dark themes (18 themes: 12 OLED dark + 6 light with luminance detection)
- Background agents with git branch isolation and streaming isolation
- Stream event dots (live tool activity visualization with gradient blending)
- Auth login modal (OAuth authentication flow)
- File drop attachment (drag-and-drop text/code files)
- Only GUI with configurable auto-compaction (default T=85%: 80% warn, 85% auto, 90% force)
- Compiled server binaries (no Node.js dependency for end users)
- Crash recovery with session restoration
- True token cost tracking (accurate to cent)
- Zero telemetry/tracking
- Native macOS menu integration
- Text selection in chat messages

---

### 3. [API_REFERENCE.md](API_REFERENCE.md)
**Size:** ~7,500 words
**Depth:** Complete API documentation

#### API Categories:
1. **Tauri Commands** (~227 commands across 16 modules)
   - Session management
   - File operations
   - Claude binary detection
   - Settings management
   - Database operations
   - Hook system
   - Compaction control
   - MCP protocol

2. **Tauri IPC API** (20+ events)
   - Frontend → Backend commands
   - Backend → Frontend events
   - Stream processing
   - Error handling

3. **Frontend Services**
   - TauriClaudeClient
   - PerformanceMonitor
   - CompactionService
   - HooksService

4. **Store API**
   - Zustand state management
   - Actions and computed values
   - Persistence layer

5. **Type Definitions**
   - 30+ TypeScript interfaces
   - Error codes and types
   - Usage examples

#### Implementation Examples:
- Creating sessions
- Sending messages
- Implementing hooks
- Performance monitoring
- Database operations

---

### 4. [PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md)
**Size:** ~6,500 words  
**Depth:** Step-by-step production guide

#### Deployment Sections:
1. **Pre-Deployment Checklist**
   - Code quality checks
   - Testing requirements
   - Performance validation
   - Documentation status
   - Legal requirements

2. **Build Process**
   - Environment setup
   - Build configuration
   - Platform-specific builds
   - Optimization settings

3. **Code Signing**
   - macOS: Developer ID, notarization
   - Windows: EV certificates, SmartScreen
   - Linux: Package signing

4. **Platform Deployment**
   - DMG creation (macOS)
   - MSI/NSIS configuration (Windows)
   - AppImage/DEB/RPM (Linux)

5. **Distribution**
   - Direct downloads
   - GitHub releases
   - Package managers
   - CDN setup

6. **Post-Deployment**
   - Version management
   - Release notes
   - User communication
   - Monitoring

#### Security Considerations:
- Binary signing
- HTTPS downloads
- Checksum verification
- GPG signatures
- Vulnerability scanning

---

### 5. [TROUBLESHOOTING_GUIDE.md](TROUBLESHOOTING_GUIDE.md)
**Size:** ~10,000 words  
**Depth:** Comprehensive problem-solving guide

#### Problem Categories (100+ solutions):
1. **Installation Issues**
   - Platform-specific problems
   - Dependency resolution
   - Permission errors

2. **Startup Problems**
   - Diagnostic processes
   - Window issues
   - Crash debugging

3. **Claude CLI Issues**
   - Binary detection
   - Version mismatches
   - Authentication
   - WSL configuration

4. **Session Problems**
   - Connection failures
   - Message routing
   - Disconnections

5. **Performance Issues**
   - Profiling techniques
   - CPU optimization
   - Memory leak detection

6. **UI/Display Problems**
   - Rendering issues
   - Styling problems
   - Scrolling bugs

7. **Network Issues**
   - WebSocket debugging
   - Port conflicts
   - Firewall configuration

8. **Database Issues**
   - Corruption recovery
   - Storage quotas
   - Query optimization

9. **Resource Issues**
   - Memory limits
   - Process limits
   - System tuning

10. **Platform-Specific**
    - macOS quirks
    - Windows peculiarities
    - Linux variations

#### Advanced Debugging:
- Debug mode activation
- Remote debugging
- Core dump analysis
- System call tracing
- Error code reference

---

### 6. [README.md](../README.md)
**Size:** ~500 words
**Depth:** Quick project overview

#### Sections:
- Features overview
- Development commands
- Requirements
- Architecture overview

---

### 7. [COMPETITIVE_ANALYSIS.md](COMPETITIVE_ANALYSIS.md)
**Size:** ~10,000 words
**Depth:** Complete competitive landscape analysis for v0.5.5

#### Key Sections:
1. **Competitive Landscape**
   - IDE Extensions (Cursor, Windsurf, Continue.dev, Cody, Copilot)
   - Cloud-Based Tools (Replit Agent, Bolt.new)
   - Claude CLI Wrappers (Opcode, Claude Canvas, Official App)

2. **Feature Comparison Matrix**
   - 9 tools compared across 20+ features
   - Pricing comparison
   - Open source vs commercial analysis

3. **Yume's Unique Advantages**
   - Desktop-first Claude CLI wrapper
   - Advanced analytics & token tracking
   - Complete plugin ecosystem
   - Performance monitoring
   - History & rollback
   - Sustainable pricing (freeware (Pro $29))
   - OLED black theme

4. **Strategic Gaps & Opportunities**
   - Single LLM support (Claude only)
   - Not open source (vs Opcode, Continue.dev)
   - No IDE integration
   - MCP protocol leadership opportunity
   - Plugin marketplace potential
   - Team collaboration features

5. **Competitive Positioning**
   - Target market definition
   - Key messaging for launch
   - Pre-launch checklist
   - Risk assessment

6. **Launch Recommendations**
   - Critical actions for differentiation
   - 4-week timeline
   - Success metrics
   - Post-launch priorities

---

### 8. [PROJECT_STATUS.md](PROJECT_STATUS.md)
**Purpose:** Current project status, version, platform readiness

#### Key Sections:
- Version and release status
- Platform build readiness (macOS, Windows, Linux)
- Feature completion tracking

---

### 9. [YUME_GRADE_REPORT.md](YUME_GRADE_REPORT.md)
**Purpose:** Quality assessment and grading of the codebase

#### Key Sections:
- Executive summary of codebase quality
- Category-by-category grading
- Improvement recommendations

---

### 10. [DOCUMENTATION_UPDATE_SUMMARY.md](DOCUMENTATION_UPDATE_SUMMARY.md)
**Purpose:** Changelog of documentation updates for each version

---

### 11. [MASTER_DOCUMENTATION_INDEX.md](MASTER_DOCUMENTATION_INDEX.md) (This File)
**Purpose:** Documentation overview and navigation

---

## Future Expansion Plans (Yume 2.0)

### [Expansion Plan](expansion-plan/ARCHITECTURE_OVERVIEW.md)
**Status:** ~95% COMPLETE (macOS ready, Windows/Linux build scripts exist)
**Goal:** Multi-provider support via yume-cli shim (Claude, Gemini, OpenAI/Codex)

#### Key Documents:
- [**Architecture Overview**](expansion-plan/ARCHITECTURE_OVERVIEW.md): Adapter pattern design.
- [**Architecture Update**](expansion-plan/ARCHITECTURE_UPDATE.md): Official CLI integration strategy update.
- [**Shim Architecture**](expansion-plan/SHIM_ARCHITECTURE.md): The "Yume Agent" design for stateless providers.
- [**Yume CLI Spec**](expansion-plan/YUME_CLI_SPEC.md): Technical specification for the `yume-cli` binary.
- [**Protocol Normalization**](expansion-plan/PROTOCOL_NORMALIZATION.md): Canonical mapping into Claude-compatible stream-json.
- [**Stream JSON Reference**](expansion-plan/STREAM_JSON_REFERENCE.md): Field-level message shapes for shims/adapters.
- [**Tool Schema Reference**](expansion-plan/TOOL_SCHEMA_REFERENCE.md): UI-required tool input fields.
- [**Edge Cases & Compatibility**](expansion-plan/EDGE_CASES_AND_COMPATIBILITY.md): Scenario coverage and cross-platform constraints.
- [**Technical Approach**](expansion-plan/TECHNICAL_APPROACH.md): Recommended architecture and best practices.
- [**Gemini Integration**](expansion-plan/GEMINI_INTEGRATION.md): Strategy for Gemini via shim.
- [**Codex Integration**](expansion-plan/CODEX_INTEGRATION.md): Strategy for OpenAI/Codex via shim.
- [**Roadmap**](expansion-plan/ROADMAP.md): Multi-provider execution plan.
- [**System Prompt Strategy**](expansion-plan/SYSTEM_PROMPT_STRATEGY.md): Cross-provider system prompt construction.
- [**UI/UX Design**](expansion-plan/UI_UX_DESIGN.md): Multi-provider UI design plan.
- [**VSCode Integration**](expansion-plan/VSCODE_INTEGRATION.md): VSCode extension architecture.
- [**Conversation Portability**](expansion-plan/CONVERSATION_PORTABILITY.md): Mid-session model switching and UCF translation.
- [**Universal Session Architecture**](expansion-plan/UNIVERSAL_SESSION_ARCHITECTURE.md): Cross-provider session storage foundation.
- [**Provider Reference**](expansion-plan/PROVIDER_REFERENCE.md): Model and feature matrix (single source of truth).
- [**Multi-Provider Resume**](expansion-plan/MULTI_PROVIDER_RESUME_ARCHITECTURE.md): Conversation resume across providers.

---

### [Competitive Research](competitive-research/overview.md)
**Status:** Complete market analysis
**Goal:** Inform product strategy and positioning

#### Key Documents:
- [**Overview**](competitive-research/overview.md): Market landscape summary.
- [**Executive Summary**](competitive-research/executive-summary.md): Presentation-ready overview.
- [**Competitors**](competitive-research/competitors.md): Detailed competitor profiles.
- [**Feature Gaps**](competitive-research/feature-gaps.md): Missing features and opportunities.
- [**Yume Advantages**](competitive-research/yume-advantages.md): Competitive differentiators.
- [**Pricing Analysis**](competitive-research/pricing-analysis.md): Pricing model comparison.
- [**Strategic Recommendations**](competitive-research/strategic-recommendations.md): Action items.
- [**Emerging Trends**](competitive-research/emerging-trends.md): Market direction.
- [**UI Improvement Opportunities**](competitive-research/ui-improvement-opportunities.md): UX gaps.
- [**Claude Code CLI**](competitive-research/claude-code-cli.md): Claude CLI analysis.
- [**Claude Code Appreciation**](competitive-research/claude-code-appreciation.md): Claude Code strengths.
- [**Technical Architecture**](competitive-research/technical-architecture.md): Technical comparison.
- [**Marketing Strategy**](competitive-research/marketing-strategy.md): Go-to-market plan.
- [**Enterprise Features**](competitive-research/enterprise-features.md): Enterprise requirements.
- [**User Sentiment**](competitive-research/user-sentiment.md): User feedback analysis.
- [**Roadmap**](competitive-research/ROADMAP.md): Competitive response roadmap.

---

## Documentation Overview

### Core Components Documented
- Rust Backend modules
- React Frontend components
- Node.js Compiled Server Binaries
- Configuration files

---

## Deep Technical Analysis

### Architectural Innovations

1. **Compiled Server Binaries**
   - Eliminates Node.js dependency for end users
   - Platform-specific binaries (macOS ARM64/x64, Windows, Linux)
   - Hidden source code for distribution
   - Fallback .cjs files for development
   - Simplified deployment

2. **Three-Process Isolation**
   - Security through separation
   - Failure isolation
   - Resource management
   - Clean interfaces
   - Debugging clarity

3. **Dynamic Port Allocation**
   - Prevents conflicts
   - Multiple instances
   - Fallback mechanisms
   - Wide port range
   - Automatic recovery

4. **Crash Recovery System**
   - Periodic snapshots
   - State preservation
   - Window restoration
   - Unsaved work recovery
   - Automatic cleanup

### Performance Optimizations

1. **Memory Management**
   - Bounded buffers (10MB)
   - Circular queues
   - Reference counting
   - Garbage collection
   - Leak prevention

2. **Virtual Scrolling**
   - Handles 10,000+ messages
   - 60fps scrolling
   - Dynamic item heights
   - Viewport optimization
   - Memory efficiency

3. **Lazy Loading**
   - On-demand components
   - Route-based splitting
   - Modal deferral
   - Image lazy loading
   - Code splitting

4. **Stream Processing**
   - Incremental parsing
   - Chunk aggregation
   - Buffer management
   - Backpressure handling
   - Error recovery

### Security Implementation

1. **Content Security Policy**
   - XSS prevention
   - Injection blocking
   - Resource validation
   - Origin restrictions
   - Script controls

2. **Process Sandboxing**
   - Limited permissions
   - File system isolation
   - Network restrictions
   - IPC validation
   - Resource limits

3. **Input Validation**
   - Type checking
   - Sanitization
   - Path validation
   - Command validation
   - SQL prevention

### Unique Features Deep Dive

#### Auto-Compaction with Dynamic Thresholds

**Why Dynamic Thresholds?**
- Configurable threshold T (default 85%) allows tuning
- Warning at T-5% (80%), auto at T (85%), force at T+5% (90%)
- Prevents context overflow with comfortable margin
- Auto-compact is off by default — CLI handles it

**Implementation**:
```rust
// Dynamic thresholds from configurable T (default 0.85)
let warning_threshold = threshold - 0.05;  // 80%
let auto_threshold = threshold;            // 85%
let force_threshold = threshold + 0.05;    // 90%
```

**Process**:
1. Monitor token usage continuously
2. Detect 85% (auto) or 90% (force) threshold (default values)
3. Set pending compaction flag
4. Send /compact command with next user message
5. Create new session with summary
6. Seamlessly continue conversation

#### Compiled Server Binary Architecture

**The Challenge**: External servers add complexity and require Node.js
**Our Solution**: Compile server to platform-specific binaries using @yao-pkg/pkg

Server binaries are stored in `src-tauri/resources/`:
- `yume-bin-macos-arm64` / `yume-bin-macos-x64` (macOS, combines server + yume-cli)
- `yume-cli-macos-arm64` / `yume-cli-macos-x64` shell wrappers
- Windows/Linux: Build scripts exist but binaries not yet compiled

**Benefits**:
- No Node.js required for end users
- Hidden source code
- Platform-specific optimization
- Fallback .cjs files for development
- Simplified distribution

#### Crash Recovery Implementation

**Components**:
1. State snapshots
2. Window position tracking
3. Session state preservation
4. Unsaved work backup
5. Automatic restoration

#### Yume Agents System

**4 Built-in Agents** synced to `~/.claude/agents/yume-*.md`:

| Agent | Purpose |
|-------|---------|
| `yume-architect` | Plans, designs, decomposes tasks |
| `yume-explorer` | Codebase exploration (sonnet, read-only) |
| `yume-implementer` | Small, focused code changes |
| `yume-guardian` | Review, verify + domain tasks (tests, docs, devops) |

**Background Agents** (Async Execution):
- 4 concurrent agents max
- Git branch isolation (`yume-async-{type}-{id}`)
- 30-min timeout per agent
- Uses Claude CLI with `--dangerously-skip-permissions`
- Output to `~/.yume/agent-output/`
- 14 Tauri commands for lifecycle management
- Streaming isolation: does NOT control main CLI streaming state

#### MCP Support
- User-installable MCP servers via settings UI
- Full Claude CLI MCP ecosystem compatibility
- Servers stored in `~/.claude.json`

**Sync Mechanism**:
- PID tracking prevents multi-instance conflicts
- Agents removed on app exit (only if last instance)
- Agents re-synced on model change via `sync_yume_agents(enabled, model)`

---

## Documentation Completeness

### Areas Covered
- System architecture
- Feature documentation
- API reference
- Production deployment
- Troubleshooting guide
- Security analysis
- Performance optimization
- Platform specifics
- Development workflow
- Test infrastructure (Vitest)
- Competitive research
- Multi-provider expansion plan

---

## Using This Documentation

### For Developers
1. Start with [COMPLETE_ARCHITECTURE.md](COMPLETE_ARCHITECTURE.md)
2. Review [API_REFERENCE.md](API_REFERENCE.md)
3. Study code examples throughout

### For DevOps
1. Follow [PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md)
2. Reference [TROUBLESHOOTING_GUIDE.md](TROUBLESHOOTING_GUIDE.md)
3. Implement monitoring from guides

### For Users
1. Begin with [README_COMPREHENSIVE.md](../README_COMPREHENSIVE.md)
2. Explore [FEATURES_COMPLETE.md](FEATURES_COMPLETE.md)
3. Use [TROUBLESHOOTING_GUIDE.md](TROUBLESHOOTING_GUIDE.md) for issues

### For Contributors
1. Understand [COMPLETE_ARCHITECTURE.md](COMPLETE_ARCHITECTURE.md)
2. Follow patterns in [API_REFERENCE.md](API_REFERENCE.md)
3. Maintain documentation standards

---

## Documentation Maintenance

### Update Triggers
- New feature additions
- API changes
- Bug fixes
- Performance improvements
- Security updates
- Platform changes

### Documentation Standards
- Clear section headers
- Code examples for concepts
- Tables for comparisons
- Diagrams for architecture
- Cross-references
- Version tracking
- Update dates

### Review Schedule
- Monthly: Feature documentation
- Quarterly: Architecture review
- As needed: README updates

---

## Conclusion

This documentation suite covers the core aspects of Yume: architecture, features, API reference, deployment, and troubleshooting. Refer to the specific guides listed above for detailed information.
