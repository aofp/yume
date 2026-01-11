# Yurucode Master Documentation Index

**Created:** January 3, 2025
**Updated:** January 9, 2026
**Total Documentation:** 6 comprehensive guides
**Coverage:** Core codebase documented

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
**Size:** ~9,000 words  
**Depth:** Every feature documented with implementation details

#### Core Feature Categories:
1. **Claude CLI Integration**: 4 models, streaming JSON, binary detection
2. **Session Management**: 7 states, persistence layers, recovery
3. **Auto-Compaction**: Unique 97% threshold, 6-step process
4. **Token Tracking**: Real-time counting, accurate cost calculation
5. **Editor Features**: Syntax highlighting, diff viewer, file references
6. **Hook System**: 9 triggers, blocking/non-blocking, variables
7. **MCP Protocol**: Full implementation, server management
8. **Database**: SQLite schema, checkpoints, full-text search
9. **UI/UX**: Custom chrome, themes, shortcuts, virtual scrolling
10. **Developer Features**: Debug mode, profiling, extension API
11. **Security**: CSP, isolation, validation, sanitization
12. **Performance**: Lazy loading, memory management, monitoring
13. **Platform Features**: Native integrations for each OS

#### Exclusive Features:
- Only GUI with conservative auto-compaction (60%/65% thresholds, 38% buffer)
- Compiled server binaries (no Node.js dependency for end users)
- Crash recovery with session restoration
- True token cost tracking (accurate to cent)
- Zero telemetry/tracking

---

### 3. [API_REFERENCE.md](API_REFERENCE.md)
**Size:** ~7,500 words  
**Depth:** Complete API documentation

#### API Categories:
1. **Tauri Commands** (45+ commands)
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

### 7. [MASTER_DOCUMENTATION_INDEX.md](MASTER_DOCUMENTATION_INDEX.md) (This File)
**Purpose:** Documentation overview and navigation

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

#### Auto-Compaction at 60%/65%

**Why 60%/65%?**
- Uses same 38% buffer as Claude Code for reliability
- 55%: Warning notification
- 60%: Auto-compact triggers (sets flag for next message)
- 65%: Force compact
- Prevents context overflow with comfortable margin

**Implementation**:
```rust
if usage >= 0.65 {
    trigger_force_compaction();
} else if usage >= 0.60 {
    trigger_auto_compaction();
}
```

**Process**:
1. Monitor token usage continuously
2. Detect 60% (auto) or 65% (force) threshold
3. Set pending compaction flag
4. Send /compact command with next user message
5. Create new session with summary
6. Seamlessly continue conversation

#### Compiled Server Binary Architecture

**The Challenge**: External servers add complexity and require Node.js
**Our Solution**: Compile server to platform-specific binaries using @yao-pkg/pkg

Server binaries are stored in `src-tauri/resources/` for each platform:
- `yurucode-server-macos-arm64` / `yurucode-server-macos-x64` for macOS
- `yurucode-server-windows-x64.exe` for Windows
- `yurucode-server-linux-x64` for Linux

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

#### Yurucode Agents System

**5 Built-in Agents** synced to `~/.claude/agents/yurucode-*.md`. All agents automatically use the **currently selected model** (opus or sonnet):

| Agent | Purpose |
|-------|---------|
| `yurucode-architect` | Plans, designs, decomposes tasks |
| `yurucode-explorer` | Codebase exploration (read-only) |
| `yurucode-implementer` | Focused code changes |
| `yurucode-guardian` | Code review and auditing |
| `yurucode-specialist` | Domain-specific tasks |

**Sync Mechanism**:
- PID tracking prevents multi-instance conflicts
- Agents removed on app exit (only if last instance)
- Agents re-synced on model change via `sync_yurucode_agents(enabled, model)`

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

This documentation suite covers the core aspects of Yurucode - architecture, features, API reference, deployment, and troubleshooting. For questions or clarifications, refer to the specific guides listed above.