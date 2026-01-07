# Yurucode Architecture Overview

Last Updated: 2026-01-07

## Table of Contents
1. [System Overview](#system-overview)
2. [Three-Process Architecture](#three-process-architecture)
3. [Component Deep Dive](#component-deep-dive)
4. [Data Flow](#data-flow)
5. [Critical Systems](#critical-systems)
6. [Platform-Specific Implementation](#platform-specific-implementation)
7. [Security Architecture](#security-architecture)
8. [Performance Optimizations](#performance-optimizations)

## System Overview

Yurucode is a cross-platform desktop application built with Tauri 2.0, providing a GUI for Claude CLI with intelligent context management. The application uses a unique three-process architecture to maintain separation of concerns and maximize performance.

```
┌─────────────────────────────────────────────────────────┐
│                    User Interface (React)                │
│                         Port 60642                       │
└─────────────────────┬───────────────────────────────────┘
                      │ WebSocket (Socket.IO)
┌─────────────────────▼───────────────────────────────────┐
│           Node.js Server (Compiled Binary)               │
│                  Dynamic Port 20000-65000                │
└─────────────────────┬───────────────────────────────────┘
                      │ Spawns & Controls
┌─────────────────────▼───────────────────────────────────┐
│                    Claude CLI Binary                     │
│            --print --output-format stream-json           │
└─────────────────────────────────────────────────────────┘
```

## Three-Process Architecture

### 1. Tauri Main Process (Rust)
**Location:** `src-tauri/`

**Responsibilities:**
- Window lifecycle management
- Native OS integration
- Process spawning and management
- File system access
- Port allocation (20000-65000 range with TOCTOU protection)
- SQLite database operations
- License validation
- Crash recovery

**Key Files:**
- `src/main.rs` - Entry point
- `src/lib.rs` - Core application logic, plugin setup, window configuration
- `src/logged_server.rs` - **CRITICAL: Server process management (spawns compiled binaries or .cjs fallback)**
- `src/port_manager.rs` - Dynamic port allocation with caching
- `src/claude_binary.rs` - Claude CLI detection
- `src/claude_spawner.rs` - Claude process spawning and coordination
- `src/stream_parser.rs` - Stream JSON parsing for Claude output
- `src/compaction/mod.rs` - Context management and auto-compaction
- `src/crash_recovery.rs` - Session recovery after crashes
- `src/mcp/mod.rs` - Model Context Protocol (MCP) server management
- `src/agents.rs` - Agent management for AI assistants
- `src/config.rs` - Production configuration management
- `src/db/mod.rs` - SQLite database for persistent storage
- `src/commands/mod.rs` - All Tauri IPC command handlers
  - `claude_commands.rs` - Direct Claude CLI commands
  - `claude_info.rs` - Claude version and usage info
  - `claude_detector.rs` - Claude installation detection
  - `database.rs` - Database operations
  - `hooks.rs` - Hook execution commands
  - `compaction.rs` - Compaction operations
  - `mcp.rs` - MCP server operations
  - `custom_commands.rs` - User-defined commands

### 2. Node.js Server (Compiled Binaries)
**Location:** `src-tauri/resources/`

**Server Distribution:**
The Node.js server is now distributed as compiled binaries (using @yao-pkg/pkg) for each platform, eliminating Node.js dependency for end users:
- **macOS ARM64:** `server-macos-arm64` (Apple Silicon)
- **macOS x64:** `server-macos-x64` (Intel)
- **Windows x64:** `server-windows-x64.exe`
- **Linux x64:** `server-linux-x64`

**Fallback Files:**
For backwards compatibility and development, .cjs files are available:
- `server-claude-macos.cjs`
- `server-claude-windows.cjs`
- `server-claude-linux.cjs`

**Responsibilities:**
- Spawns Claude CLI with correct arguments
- Parses `stream-json` output from Claude
- WebSocket communication with frontend via Socket.IO
- Session management and resumption
- Token tracking and analytics
- Memory buffering (10MB limit)
- Health checks every 5 seconds

**Key Features:**
- Direct Claude CLI spawning (no SDK required)
- Session resumption with `--resume` flag
- Wrapper module integration for token tracking
- Edit/MultiEdit output enhancement with line numbers
- Diff generation with context lines
- Source code hidden in compiled binaries

### 3. React Frontend
**Location:** `src/renderer/`

**Responsibilities:**
- User interface rendering
- State management (Zustand)
- Socket.IO client connection
- Message rendering and formatting
- Tab management
- Settings and configuration UI

**Key Components:**
- `stores/claudeCodeStore.ts` - Global state management with Zustand persist
- `components/Chat/ClaudeChat.tsx` - Main chat interface
- `components/Chat/MessageRenderer.tsx` - Message display logic
- `components/Chat/VirtualizedMessageList.tsx` - Efficient message rendering
- `services/claudeCodeClient.ts` - Socket.IO WebSocket connection
- `services/tauriClaudeClient.ts` - Bridge between frontend and Claude CLI
- `services/compactionService.ts` - Auto-compact at 60%
- `services/hooksService.ts` - Hook system integration
- `services/mcpService.ts` - MCP server management
- `services/checkpointService.ts` - Session checkpointing
- `services/platformBridge.ts` - Platform abstraction layer

## Component Deep Dive

### State Management (Zustand)
```typescript
// claudeCodeStore.ts structure
{
  sessions: Session[]           // All chat sessions
  currentSessionId: string      // Active session
  messages: Message[]           // Current session messages
  streaming: boolean            // Is Claude responding
  connectionStatus: string      // WebSocket status
  tokenUsage: TokenStats        // Token tracking
  compactionState: {...}        // Compaction status
}
```

### Message Types
```typescript
interface Message {
  id: string
  type: 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'result'
  content?: string
  thinking?: string             // For assistant messages
  name?: string                  // For tool_use
  input?: any                    // Tool parameters
  output?: string                // Tool results
  usage?: TokenUsage            // Token counts (result messages)
}
```

### Session Management
```typescript
interface Session {
  id: string                    // Unique session ID
  claudeSessionId?: string      // Claude's session ID
  name: string                  // User-friendly name
  messages: Message[]           // Conversation history
  createdAt: Date
  wasCompacted?: boolean        // Track compaction state
  tokenCount: number
  projectPath?: string          // Associated project
}
```

## Data Flow

### 1. User Message Flow
```
User Input → Frontend Validation → Socket.IO Emit → 
Server Receives → Spawn Claude CLI → Parse Stream → 
Send Updates → Frontend Updates → Render Messages
```

### 2. Token Tracking Flow
```
Claude Response → Extract Usage from 'result' → 
Update Session Tokens → Calculate Costs → 
Check Thresholds → Trigger Compaction if needed
```

### 3. Compaction Flow (at 60%)
```
Token Usage 60% → CompactionService.triggerAutoCompaction() →
Generate Context Manifest → Send '/compact' →
Claude Compresses → New Session ID → Update UI
```

## Critical Systems

### 1. Auto-Compaction System
**Thresholds:**
- 55%: Warning - "Auto-compact will trigger at 60%"
- 60%: Auto-trigger - Automatic `/compact` (38% buffer reserved like Claude Code)
- 65%: Force - Emergency compact

**Implementation:**
- Service: `compactionService.ts`
- Backend: `src-tauri/src/compaction/mod.rs`
- Rate limiting to prevent rapid re-triggers
- Manifest generation before compaction
- Session continuity after compaction

### 2. Token Analytics System
**Tracking:**
- Input tokens: User messages
- Output tokens: Claude responses
- Cache creation: First-time context
- Cache read: Reused context
- Total context usage percentage

**Data Source:**
- Analytics parsing looks for `data.type === 'assistant'` and `data.message.usage` in Claude session files
- Session tokens fetched via server endpoint after stream_end

### 3. Session Recovery System
**Features:**
- Lazy reconnection (only on message send)
- Session persistence across restarts
- Tab state preservation
- Automatic resume after crashes
- Crash recovery module (`crash_recovery.rs`) tracks:
  - Last session ID
  - Crash timestamps and counts
  - Recovered sessions with working directories
  - Unsaved work snapshots

### 4. MCP (Model Context Protocol) System
**Purpose:** Manage external tool servers that extend Claude's capabilities

**Components:**
- Backend: `src-tauri/src/mcp/mod.rs` - Server configuration and management
- Commands: `src-tauri/src/commands/mcp.rs` - Tauri IPC handlers
- Frontend: `src/renderer/services/mcpService.ts` - UI integration
- Settings UI: `src/renderer/components/Settings/MCPTab.tsx`

**Features:**
- List, add, remove MCP servers
- Import from Claude Desktop config
- Test server connections
- Support for stdio and SSE transports
- Scoped servers (local, project, user)

### 5. Agents System
**Purpose:** Pre-configured AI personas with specialized system prompts

**Components:**
- Backend: `src-tauri/src/agents.rs` - Agent CRUD operations
- Frontend: `src/renderer/components/AgentsModal/AgentsModal.tsx`
- Storage: `~/.claude/agents/` (global) and `.claude/agents/` (project)

**Built-in Yurucode Agents:**
- `yurucode-architect` - Task planning and decomposition
- `yurucode-explorer` - Codebase exploration (read-only)
- `yurucode-implementer` - Focused code changes
- `yurucode-guardian` - Code review and auditing
- `yurucode-specialist` - Domain-specific tasks

**Agent File Format:**
```markdown
---
name: agent-name
model: opus
description: Agent description
---

System prompt content here
```

### 6. Hooks System
**Purpose:** Intercept and modify Claude behavior at key points

**Components:**
- Backend: `src-tauri/src/hooks/mod.rs` - Hook execution
- Commands: `src-tauri/src/commands/hooks.rs` - Tauri handlers
- Frontend: `src/renderer/services/hooksService.ts`
- Settings UI: `src/renderer/components/Settings/HooksTab.tsx`

## Platform-Specific Implementation

### Windows
**Challenges:**
- WSL integration for Claude CLI
- Path handling (forward vs backslash)
- Process spawning complexity
- Console window visibility control

**Solutions:**
- Compiled server binary (`server-windows-x64.exe`) with .cjs fallback
- WSL path detection and conversion
- Dynamic user detection
- Robust error handling for WSL
- CREATE_NO_WINDOW flag for hidden server process

### macOS
**Challenges:**
- Code signing requirements
- Notarization for distribution
- Sandbox restrictions
- Native Claude installation

**Solutions:**
- Compiled server binary (`server-macos-arm64` or `server-macos-x64`) with .cjs fallback
- Proper entitlements configuration
- DMG packaging with signing
- Architecture-specific binary selection at runtime

### Linux
**Challenges:**
- Distribution variety
- Desktop environment integration
- Package management
- Permission handling

**Solutions:**
- Compiled server binary (`server-linux-x64`) with .cjs fallback
- AppImage packaging
- XDG compliance
- Standard FHS paths
- Minimal dependencies

## Security Architecture

### Current Security Measures
1. **Process Isolation:** Three-process architecture
2. **Input Validation:** Message sanitization
3. **License System:** RSA-signed licenses
4. **Secure WebSocket:** Local-only communication
5. **Content Security Policy:** Full CSP configured in tauri.conf.json
   - Restricts script/style sources
   - Limits connect-src to localhost and specific domains
   - Blocks object/frame sources

### Security Gaps (TO BE FIXED)
1. **No Code Signing:** macOS/Windows unsigned
2. **Plain Text Storage:** Sessions in localStorage (debounced writes)
3. **Missing Encryption:** IPC communication unencrypted

## Performance Optimizations

### Implemented Optimizations
1. **Lazy Reconnection:** No delays on tab switch
2. **Message Deduplication:** Fast hash-based message dedup using WeakMap cache
3. **Smart Buffering:** 10MB buffer limit in server
4. **Virtual Scrolling:** VirtualizedMessageList component for efficient rendering
5. **Debounced Updates:** Reduced re-renders
6. **Debounced Storage:** 100ms batched localStorage writes to prevent UI freezes
7. **Port Caching:** Cached last working port to disk for faster startup

### Performance Issues (TO BE FIXED)
1. **Memory Leaks:** Unbounded buffer growth
2. **Synchronous I/O:** Blocking file operations
3. **No Message Pagination:** Full history loaded
4. **Process Cleanup:** Zombie processes possible

## Build System

### Development
```bash
npm run dev              # Full Tauri app with Vite hot reload
npm run dev:frontend     # Vite dev server only (for UI development)
npm run tauri:dev        # Full app development (alternative)
npm run tauri:dev:mac    # macOS with concurrent frontend
npm run tauri:dev:win    # Windows with concurrent frontend
```

### Production Build
```bash
npm run build                    # Build frontend only
npm run tauri:build:mac          # macOS ARM64 build + DMG
npm run tauri:build:mac:universal # macOS Universal build
npm run tauri:build:win          # Windows MSI
npm run tauri:build:linux        # Linux AppImage
```

### Server Binary Build
```bash
npm run build:server:macos   # Build macOS server binary
npm run build:server:windows # Build Windows server binary
npm run build:server:linux   # Build Linux server binary
npm run build:server:all     # Build all platform binaries
```

### Key Build Steps
1. Version injection (`scripts/inject-version.cjs`)
2. Server binary build (`scripts/build-server-binary.cjs`):
   - Bundles .cjs source with esbuild
   - Compiles to binary with @yao-pkg/pkg (node18 target)
   - Copies binaries to `src-tauri/resources/`
3. Server minification (`scripts/minify-servers.cjs`)
4. Vendor patching (`scripts/patch-vendor.cjs`)
5. Package generation (DMG/MSI/AppImage)

## Configuration Files

### Tauri Configuration
- `tauri.conf.json` - Main configuration
- `tauri.dev.conf.json` - Development overrides

### Key Settings
```json
{
  "productName": "yurucode",
  "version": "0.1.0",
  "identifier": "be.yuru.yurucode",
  "build": {
    "beforeBuildCommand": "npm run build",
    "devUrl": "http://localhost:60642",
    "frontendDist": "../dist/renderer"
  }
}
```

## Future Architecture Improvements

### Phase 1: Stability
- Implement proper error boundaries (ErrorBoundary component exists)
- Add crash reporting (Sentry)
- Fix memory leaks
- Add process cleanup

### Phase 2: Security
- Implement code signing for macOS/Windows
- Add update mechanism
- Encrypt sensitive data in localStorage

### Phase 3: Performance
- Implement message pagination
- Add worker threads
- Optimize bundle size
- Improve caching layer

### Phase 4: Features
- Enhanced checkpoint system
- Plugin architecture
- Team collaboration

## Monitoring & Debugging

### Debug Points
1. **Server Logs:** Platform-specific locations:
   - macOS: `~/Library/Logs/yurucode/server.log`
   - Windows: `%LOCALAPPDATA%\yurucode\logs\server.log`
   - Linux: `~/.yurucode/logs/server.log`
2. **Browser Console:** Frontend errors
3. **Tauri Console:** Rust panics
4. **Wrapper Debug:** `WRAPPER_DEBUG=true`
5. **Console Visibility:** Set `YURUCODE_SHOW_CONSOLE = true` in `logged_server.rs` for debug output

### Log Patterns
- 🧠 `[sessionId]` - Thinking blocks
- 📝 `[sessionId]` - Assistant messages
- 📍 `[sessionId]` - Line numbers for edits
- 🔧 `TOOL MESSAGE` - Tool execution
- 🎯 `WRAPPER` - Token tracking

## Deployment Architecture

### Distribution Channels
1. **Direct Download:** DMG/MSI from website
2. **Auto-Update:** Tauri updater (planned)
3. **App Stores:** Mac App Store (future)

### Update Mechanism (Planned)
```
Check for Updates → Download Delta → 
Verify Signature → Apply Update → 
Restart Application
```

---

This architecture document represents the complete technical foundation of Yurucode. The three-process design with compiled server binaries provides a unique balance of performance, security, and maintainability, though several production-hardening tasks remain before commercial release.