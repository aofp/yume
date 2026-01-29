# Yume Master Documentation Index

**Created:** January 3, 2025
**Updated:** January 20, 2026
**Total Documentation:** 8 core guides + expansion plan suite + competitive research
**Coverage:** Core codebase + competitive analysis + multi-provider expansion + background agents + memory system documented

---

## 📚 Complete Documentation Suite

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
2. **Session Management**: 7 states, persistence layers, recovery
3. **Auto-Compaction**: Variable threshold (default 75%), user configurable or disable
4. **Token Tracking**: Real-time counting, accurate cost calculation
5. **Editor Features**: Syntax highlighting, diff viewer, file references
6. **Hook System**: 9 triggers, blocking/non-blocking, variables
7. **MCP Protocol**: Full implementation, server management
8. **Database**: SQLite schema, checkpoints, full-text search
9. **UI/UX**: Custom chrome, 12 themes, shortcuts, virtual scrolling
10. **Developer Features**: Debug mode, profiling, extension API
11. **Security**: CSP, isolation, validation, sanitization
12. **Performance**: Lazy loading, memory management, monitoring
13. **Platform Features**: Native integrations for each OS
14. **Memory MCP System**: Persistent knowledge graph, auto-learning
15. **Background Agents**: Async execution, git branch isolation (4 concurrent)

#### Exclusive Features:
- Memory MCP system with auto-learning from conversations
- Background agents with git branch isolation
- Only GUI with variable auto-compaction (default 75%, user can adjust or disable)
- Compiled server binaries (no Node.js dependency for end users)
- Crash recovery with session restoration
- True token cost tracking (accurate to cent)
- Zero telemetry/tracking

---

### 3. [API_REFERENCE.md](API_REFERENCE.md)
**Size:** ~7,500 words
**Depth:** Complete API documentation

#### API Categories:
1. **Tauri Commands** (152 commands)
   - Session management
   - File operations
   - Claude binary detection
   - Settings management
   - Database operations
   - Hook system
   - Compaction control
   - MCP protocol

2. **WebSocket API** (20+ events)
   - Client → Server events
   - Server → Client events
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
**Depth:** Complete competitive landscape analysis for v0.1.0

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
   - Sustainable pricing ($21 one-time)
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

### 8. [MASTER_DOCUMENTATION_INDEX.md](MASTER_DOCUMENTATION_INDEX.md) (This File)
**Purpose:** Documentation overview and navigation

---

## 🔮 Future Expansion Plans (Yume 2.0)

### 9. [Expansion Plan](expansion-plan/ARCHITECTURE_OVERVIEW.md)
**Status:** ~95% COMPLETE (macOS ready), Windows/Linux binaries pending
**Goal:** Multi-provider support via yume-cli shim (Claude, Gemini, OpenAI/Codex)

#### Key Documents:
- [**Architecture Overview**](expansion-plan/ARCHITECTURE_OVERVIEW.md): Adapter pattern design.
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

---

## Documentation Overview

### Core Components Documented
- Rust Backend modules
- React Frontend components
- Node.js Compiled Server Binaries
- Configuration files

---

## 🔬 Deep Technical Analysis

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

#### Variable Auto-Compaction

**User-Configurable Threshold**:
- Default: 75% (recommended balance of context retention and safety)
- Range: 50% to 90% (user adjustable via settings)
- Can be disabled entirely for manual control
- Prevents context overflow while maximizing usable context

**Implementation**:
```rust
if usage >= user_threshold {
    trigger_auto_compaction();
}
// If disabled, user must manually compact with Cmd/Ctrl+M
```

**Process**:
1. Monitor token usage continuously
2. Detect user-configured threshold (default 75%)
3. Set pending compaction flag
4. Send /compact command with next user message
5. Create new session with summary
6. Seamlessly continue conversation

#### Compiled Server Binary Architecture

**The Challenge**: External servers add complexity and require Node.js
**Our Solution**: Compile server to platform-specific binaries using @yao-pkg/pkg

Server binaries are stored in `src-tauri/resources/` for each platform using unified binary architecture:
- `yume-bin-macos-arm64` / `yume-bin-macos-x64` for macOS (combines server + yume-cli)
- `yume-cli-macos-arm64` / `yume-cli-macos-x64` shell wrappers that invoke `yume-bin-* cli`
- Windows/Linux binaries: Build scripts exist but binaries not yet compiled

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

**5 Built-in Agents** synced to `~/.claude/agents/yume-*.md`. All agents automatically use the **currently selected model** (opus or sonnet):

| Agent | Purpose |
|-------|---------|
| `yume-architect` | Plans, designs, decomposes tasks |
| `yume-explorer` | Codebase exploration (read-only) |
| `yume-implementer` | Focused code changes |
| `yume-guardian` | Code review and auditing |
| `yume-specialist` | Domain-specific tasks |

**Background Agents** (Async Execution):
- 4 concurrent agents max
- Git branch isolation (`yume-async-{type}-{id}`)
- 10 minute timeout per agent
- Output to `~/.yume/agent-output/`
- 13 Tauri commands for lifecycle management

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

---

## 🚀 Using This Documentation

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

## 📈 Documentation Maintenance

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
- Weekly: README updates
- Monthly: Feature documentation
- Quarterly: Architecture review
- Yearly: Complete overhaul

---

## Conclusion

This documentation suite covers the core aspects of Yume - architecture, features, API reference, deployment, and troubleshooting. For questions or clarifications, refer to the specific guides listed above.
