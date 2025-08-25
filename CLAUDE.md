# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ CRITICAL RULES FOR CLAUDE

**NEVER START OR RESTART SERVERS** - The user manages all server processes. DO NOT run:
- `npm run start`, `npm run dev`, `npm run tauri:dev` or any start commands
- Server restart commands or process management commands
- Only provide code fixes, never execute server commands
- If the app isn't working, provide fixes but let the user restart

**NEVER BUILD THE APP** - DO NOT run build commands. ONLY THE USER BUILDS:
- `npm run build` - NEVER run this
- `npm run tauri:build` - NEVER run this
- `npx tauri build` - NEVER run this
- ANY build command - NEVER run any build commands
- Only fix code, the user will build and test

**NEVER REMOVE --print FLAG** - The Claude CLI MUST ALWAYS have the `--print` flag:
- `--print` is REQUIRED for yurucode to work properly
- NEVER remove or comment out `--print`
- It must be used with `--output-format stream-json`
- This is NON-NEGOTIABLE

## Project Overview

yurucode is a cross-platform desktop application providing a minimal UI for the Claude CLI. Built with Tauri v2 (Rust + React), it features an ultra-minimal black OLED theme with pastel cyan, magenta, and grey accents. The app spawns the Claude CLI binary directly and parses its stream-json output.

## Development Commands

```bash
# Install dependencies
npm install

# Development (user manages these)
npm run dev                    # Vite dev server (port 60748)
npm run tauri:dev              # Tauri development mode
npm run tauri:dev:mac          # macOS: concurrent Vite + Tauri
npm run tauri:dev:win          # Windows: concurrent Vite + Tauri
npm run dev:dynamic            # Dynamic port allocation mode

# Server commands (for debugging)
npm run server:macos           # Node.js server for Claude CLI (macOS)
npm run server:wsl             # Node.js server for Claude CLI (WSL)

# Build commands (only when explicitly requested)
npm run build                  # Build React app with version injection
npm run tauri:build            # Build for current platform with macOS bundling
npm run tauri:build:win        # Build specifically for Windows x64
npm run tauri:build:mac        # Build for macOS ARM64
npm run tauri:build:linux      # Build for Linux x64

# Testing
npm run test:session-loading   # Test session loading functionality

# Bundle server
npm run bundle:macos           # Bundle server for macOS distribution
```

## Critical Architecture

### Three-Process Architecture

1. **Tauri Main Process** (`src-tauri/`)
   - Window lifecycle management
   - Native system integration
   - Dynamic port allocation (35000-45000, 60000-61000 ranges)
   - Process spawning and management via Rust
   - Session registry and lifecycle

2. **Node.js Server** (EMBEDDED in `src-tauri/src/logged_server.rs`)
   - **⚠️ CRITICAL**: Server code is EMBEDDED as string constant starting at line ~124
   - Spawns Claude CLI binary directly (no SDK/API key)
   - Parses `--output-format stream-json --verbose` output
   - WebSocket communication via Socket.IO
   - Session resumption with `--resume` flag
   - Memory management with 10MB buffer limit
   - Health checks every 5 seconds during streaming

3. **React Frontend** (`src/renderer/`)
   - Socket.IO client with retry logic
   - Zustand store for state management
   - Multi-tab session management
   - Token analytics per conversation (use `+=` for accumulation)
   - Message deduplication and streaming state management

### Message Processing Flow

1. **User Input** → Frontend sends via Socket.IO
2. **Server Processing** → Spawns Claude CLI with message
3. **Stream Parsing** → Server parses stream-json output
4. **Message Types**:
   - `assistant` messages: Contains text/thinking blocks (tool_use blocks sent separately)
   - `tool_use` messages: Sent as separate messages immediately
   - `tool_result` messages: Results from tool executions
   - `result` messages: Final completion with token usage
5. **Frontend Rendering** → MessageRenderer handles each type differently

### Key Implementation Details

- **Session Management**: 
  - Each tab has unique `claudeSessionId`
  - Lazy reconnection on message send (not on tab switch)
  - Session mappings persist across app restarts
  
- **Streaming State**:
  - Per-session `streaming` flag
  - `lastAssistantMessageIds` tracking for proper cleanup
  - Thinking timer starts when user sends message
  
- **Token Tracking**:
  - Analytics use accumulation (`+=`) not assignment
  - Wrapper module provides authoritative token counts
  - Separate tracking by model (Opus/Sonnet)

- **Tool Messages**:
  - Tool_use blocks extracted from assistant messages
  - Sent as separate `tool_use` type messages
  - Enhanced with line numbers for Edit/MultiEdit tools
  - Diffs generated with context lines for better visibility

## ⚠️⚠️⚠️ CRITICAL: THE SERVER IS EMBEDDED IN logged_server.rs

The Node.js server code is EMBEDDED as a string constant `EMBEDDED_SERVER` in `src-tauri/src/logged_server.rs`:
- **YOU MUST EDIT THE JAVASCRIPT CODE INSIDE logged_server.rs** - editing .js/.cjs files has NO EFFECT
- The embedded server starts around line 124 with `const EMBEDDED_SERVER: &str = r#"`
- On Windows/Linux, extracted to `/tmp/yurucode-server/server.cjs` at runtime
- On macOS, uses `server-claude-macos.js` directly (not embedded)
- After editing embedded server, restart Tauri dev server for changes to take effect

## Important Files & Patterns

### Core Files
- `src-tauri/src/logged_server.rs` - **CONTAINS THE ACTUAL SERVER CODE AS EMBEDDED STRING**
- `src/renderer/stores/claudeCodeStore.ts` - Main state management
- `src/renderer/components/Chat/MessageRenderer.tsx` - Message rendering logic
- `src/renderer/components/Chat/ClaudeChat.tsx` - Main chat interface
- `src/renderer/services/claudeCodeClient.ts` - Socket.IO connection

### Configuration
- `src-tauri/tauri.conf.json` - Main Tauri config
- `src-tauri/tauri.dev.conf.json` - Development overrides
- `vite.config.mjs` - Vite configuration with port handling

### Build Scripts
- `scripts/inject-version.cjs` - Version injection during build
- `scripts/bundle-macos-server.js` - Bundle server for macOS
- `scripts/integrate-wrapper-macos.js` - Integrate wrapper module

## Process Wrapper Architecture

### Claude Wrapper Module (`wrapper-module.js`)
- **Token Truth Source**: Authoritative source for token counting
- **Session Management**: Tracks multiple sessions with complete history
- **Compact Detection**: Monitors for `/compact` commands
- **API Capture**: Intercepts all Claude CLI communication

The wrapper provides:
1. Exact token usage tracking (input, output, cache)
2. Compact detection and summary generation
3. Session state maintenance across compacts
4. Debug logging when `WRAPPER_DEBUG=true`

## Common Issues & Solutions

### Performance Issues
1. **Tab switching slow (3+ seconds)**: Lazy reconnection implemented - server calls only on message send
2. **Memory leaks**: Message history trimmed to MAX_MESSAGE_HISTORY (default 1000)
3. **Streaming stuck**: Check `lastAssistantMessageIds` cleared properly

### Message Display Issues
1. **Tool messages not showing**: Ensure tool_use blocks sent as separate messages
2. **Diffs not showing**: Check Edit output enhancement logic in embedded server
3. **Thinking indicator missing**: Verify streaming state set when sending message
4. **Duplicate messages**: Check message deduplication by ID and content

### Session Issues
1. **After /compact command**: Session resets with `wasCompacted` flag
2. **Session not found**: Lazy reconnection handles resumption
3. **Token counts wrong**: Use `+=` for accumulation, check wrapper integration

### Development Issues
1. **Changes not taking effect**: Remember server is EMBEDDED in logged_server.rs
2. **Zustand store changes**: Require full app restart
3. **Port conflicts**: Dynamic allocation prevents conflicts
4. **Hot reload not working**: Components hot-reload, server needs restart

## Testing Changes

When modifying:
1. **Embedded server** (`logged_server.rs`): Restart Tauri dev server
2. **React components**: Hot-reload automatically (HMR)
3. **Zustand store**: Full app restart required
4. **Message rendering**: Check browser console for errors
5. **Token tracking**: Enable `WRAPPER_DEBUG=true` for detailed logs
6. **Tool messages**: Check network tab for Socket.IO messages

## Debugging

### Enable Debug Logging
```bash
# Wrapper debug mode
WRAPPER_DEBUG=true npm run tauri:dev

# Check server logs
tail -f server-*.pid  # Find server PID file

# Browser console for frontend issues
# Terminal for Claude spawn errors
```

### Common Log Patterns
- `🧠 [sessionId]` - Thinking block processing
- `📝 [sessionId]` - Assistant message emission
- `📍 [sessionId]` - Line number calculation for edits
- `🔧🔧🔧 TOOL MESSAGE` - Tool message received
- `🎯 WRAPPER` - Wrapper module logs (when debug enabled)

## Recent Fixes

### Tab Switching Performance (2024-12-24)
- **Problem**: 3-second delays when switching tabs due to unnecessary server reconnections
- **Solution**: Implement lazy reconnection - only reconnect when sending messages
- **Files Changed**: `claudeCodeStore.ts` - `resumeSession` and `setCurrentSession`

### Tool Messages Not Displaying (2024-12-24)
- **Problem**: Tool_use messages not showing in UI
- **Solution**: Send tool_use blocks as separate messages, fix assistant message content
- **Files Changed**: `logged_server.rs` - line ~3449

### Compact Command Fix (2024-12-23)
- **Problem**: After `/compact`, users couldn't send messages
- **Solution**: Track compacted sessions with `wasCompacted` flag
- **Implementation**: Server rejects old session IDs after compact
- **Files Changed**: `src-tauri/src/logged_server.rs` (embedded server)

## Special Commands

### `/compact` Command
- Native Claude CLI command (server-side)
- Compresses conversation context
- Returns new non-resumable session ID
- Tracked with `wasCompacted` flag

### `clear` Command  
- Client-side command in CLI wrapper
- Wipes local conversation history
- Does not affect server-side context

## Future Improvements

See `YURUCODE_TODO.md` for comprehensive list including:
- Session persistence improvements (SQLite storage)
- Checkpoint system (like Claudia)
- Token optimization and auto-compact triggers
- Better error recovery and retry mechanisms
- Performance profiling and debugging tools
- don't run dmg - npm run tauri:build:mac automatically runs dmg