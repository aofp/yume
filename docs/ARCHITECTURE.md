# Yurucode Architecture Overview

Last Updated: 2025-01-03

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
│                         Port 60946                       │
└─────────────────────┬───────────────────────────────────┘
                      │ WebSocket (Socket.IO)
┌─────────────────────▼───────────────────────────────────┐
│              Node.js Server (Embedded)                   │
│                  Dynamic Port 35000-45000                │
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
- Port allocation (35000-45000, 60000-61000)
- Database operations (future: SQLite)
- License validation

**Key Files:**
- `src/main.rs` - Entry point and window setup
- `src/lib.rs` - Core application logic
- `src/logged_server.rs` - **CRITICAL: Contains embedded Node.js server as string**
- `src/port_manager.rs` - Dynamic port allocation
- `src/claude_binary.rs` - Claude CLI detection
- `src/compaction/mod.rs` - Context management logic

### 2. Node.js Server (Embedded)
**Location:** Embedded in `src-tauri/src/logged_server.rs` (line ~124)

**Critical Note:** The server is NOT in separate .js files - it's embedded as a string constant `EMBEDDED_SERVER` in the Rust code.

**Responsibilities:**
- Spawns Claude CLI with correct arguments
- Parses `stream-json` output from Claude
- WebSocket communication with frontend
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
- `stores/claudeCodeStore.ts` - Global state management
- `components/Chat/ClaudeChat.tsx` - Main chat interface
- `components/Chat/MessageRenderer.tsx` - Message display logic
- `services/claudeCodeClient.ts` - WebSocket connection
- `services/compactionService.ts` - Auto-compact at 97%

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

### 3. Compaction Flow (at 97%)
```
Token Usage 97% → CompactionService.triggerAutoCompaction() →
Generate Context Manifest → Send '/compact' → 
Claude Compresses → New Session ID → Update UI
```

## Critical Systems

### 1. Auto-Compaction System
**Thresholds:**
- 75%: Notice - "Consider organizing"
- 90%: Warning - "Preparing for compact"
- 97%: Auto-trigger - Automatic `/compact`
- 98%: Force - Emergency compact

**Implementation:**
- Service: `compactionService.ts`
- Rate limiting: Once per minute max
- Manifest generation before compaction
- Session continuity after compaction

### 2. Token Analytics System
**Tracking:**
- Input tokens: User messages
- Output tokens: Claude responses
- Cache creation: First-time context
- Cache read: Reused context

**Pricing (per million tokens):**
- Opus 4: $15 input, $75 output
- Sonnet: $3 input, $15 output
- Cache write: $18.75 (Opus), $3.75 (Sonnet)
- Cache read: $1.50 (Opus), $0.30 (Sonnet)

### 3. Session Recovery System
**Features:**
- Lazy reconnection (only on message send)
- Session persistence across restarts
- Tab state preservation
- Automatic resume after crashes

## Platform-Specific Implementation

### Windows
**Challenges:**
- WSL integration for Claude CLI
- Path handling (forward vs backslash)
- Process spawning complexity
- Embedded server extraction to temp

**Solutions:**
- WSL path detection and conversion
- Dynamic user detection
- Robust error handling for WSL
- Temp directory management

### macOS
**Challenges:**
- Code signing requirements
- Notarization for distribution
- Sandbox restrictions
- Native Claude installation

**Solutions:**
- Direct server file usage (not embedded)
- Proper entitlements configuration
- DMG packaging with signing
- Universal binary support

### Linux
**Challenges:**
- Distribution variety
- Desktop environment integration
- Package management
- Permission handling

**Solutions:**
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

### Security Gaps (TO BE FIXED)
1. **CSP Disabled:** Content Security Policy null
2. **No Code Signing:** macOS/Windows unsigned
3. **Plain Text Storage:** Sessions in localStorage
4. **Missing Encryption:** IPC communication unencrypted

## Performance Optimizations

### Implemented Optimizations
1. **Lazy Reconnection:** No delays on tab switch
2. **Message Deduplication:** Clean message handling
3. **Smart Buffering:** 10MB buffer limit
4. **Virtual Scrolling:** Efficient message rendering
5. **Debounced Updates:** Reduced re-renders

### Performance Issues (TO BE FIXED)
1. **Memory Leaks:** Unbounded buffer growth
2. **Synchronous I/O:** Blocking file operations
3. **No Message Pagination:** Full history loaded
4. **Process Cleanup:** Zombie processes possible

## Build System

### Development
```bash
npm run dev              # Vite dev server
npm run tauri:dev        # Full app development
```

### Production Build
```bash
npm run build           # Build frontend
npm run tauri:build:mac # macOS build + DMG
npm run tauri:build:win # Windows MSI
```

### Key Build Steps
1. Version injection (`inject-version.cjs`)
2. Font embedding (`embed-fonts.cjs`)
3. Server bundling (`bundle-macos-server.js`)
4. Code signing (manual currently)
5. Package generation (DMG/MSI)

## Configuration Files

### Tauri Configuration
- `tauri.conf.json` - Main configuration
- `tauri.dev.conf.json` - Development overrides

### Key Settings
```json
{
  "productName": "yurucode",
  "version": "0.1.0",
  "identifier": "com.yurucode.app",
  "build": {
    "beforeBuildCommand": "npm run build",
    "devUrl": "http://localhost:60946",
    "frontendDist": "../dist"
  }
}
```

## Future Architecture Improvements

### Phase 1: Stability
- Implement proper error boundaries
- Add crash reporting (Sentry)
- Fix memory leaks
- Add process cleanup

### Phase 2: Security
- Enable CSP headers
- Implement code signing
- Add update mechanism
- Encrypt sensitive data

### Phase 3: Performance
- Implement message pagination
- Add worker threads
- Optimize bundle size
- Add caching layer

### Phase 4: Features
- SQLite for persistence
- Checkpoint system
- Plugin architecture
- Team collaboration

## Monitoring & Debugging

### Debug Points
1. **Server Logs:** `server-*.pid` files
2. **Browser Console:** Frontend errors
3. **Tauri Console:** Rust panics
4. **Wrapper Debug:** `WRAPPER_DEBUG=true`

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

This architecture document represents the complete technical foundation of Yurucode. The three-process design with embedded server provides a unique balance of performance, security, and maintainability, though several production-hardening tasks remain before commercial release.