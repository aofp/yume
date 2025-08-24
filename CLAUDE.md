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
- `REBUILD-WIN.bat` - NEVER run this
- `BUILD-WIN.bat` - NEVER run this
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
npm run dev                    # Vite dev server (port 5173)
npm run tauri:dev              # Tauri development mode
npm run tauri:dev:win          # Windows: concurrent Vite + Tauri
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
```

## Critical Architecture

### Three-Process Architecture

1. **Tauri Main Process** (`src-tauri/`)
   - Window lifecycle management
   - Native system integration
   - WebSocket support via Rust
   - Bundled server resource management
   - Dynamic port allocation (60000-61000 range)

2. **Node.js Server** (EMBEDDED in `src-tauri/src/logged_server.rs`)
   - Spawns Claude CLI binary directly (no SDK/API key)
   - Parses `--output-format stream-json --verbose` output
   - WebSocket communication via Socket.IO
   - Session resumption with `--resume` flag
   - Multi-platform Claude path detection
   - Title generation with separate Sonnet process
   - Memory management with 10MB buffer limit
   - Health checks every 5 seconds during streaming

3. **React Frontend** (`src/renderer/`)
   - Socket.IO client with retry logic
   - Zustand store for state management
   - Multi-tab session management
   - Token analytics per conversation (use `+=` for accumulation)
   - Compact detection for context compression

### Key Implementation Details

- **Message Flow**: User input → Socket.IO → Server spawns `claude` → Parse stream-json → Stream back
- **Session Management**: Each tab has unique `claudeSessionId`
- **Token Tracking**: Analytics use accumulation (`+=`) not assignment - CRITICAL for correct counting
- **Streaming State**: Per-session `streaming` flag with `lastAssistantMessageIds` tracking
- **Clear Context**: Resets `claudeSessionId` and analytics
- **Resource Bundling**: Server gets bundled into `src-tauri/resources/` for distribution

### UI Design Philosophy

- Everything lowercase (no capitalization)
- No pointer cursors (`cursor: default` everywhere)
- Black background (#000000) for OLED
- Pastel accents: cyan, magenta, grey
- Tabler icons (no emojis in UI)
- Right-click context menu with copy functionality
- Transparent window with custom decorations
- Window size: 516x509 pixels

## ⚠️⚠️⚠️ CRITICAL: THE SERVER IS EMBEDDED IN logged_server.rs

The Node.js server code is EMBEDDED as a string constant `EMBEDDED_SERVER` in `src-tauri/src/logged_server.rs`:
- On Windows/Linux, this embedded code is extracted to `/tmp/yurucode-server/server.cjs` at runtime
- **YOU MUST EDIT THE JAVASCRIPT CODE INSIDE logged_server.rs** - editing other .cjs files has NO EFFECT
- The embedded server starts around line 124 with `const EMBEDDED_SERVER: &str = r#"`
- This is why changes to .cjs files don't work - the REAL server is embedded in the Rust file!

## Important Files & Patterns

- `src-tauri/src/logged_server.rs` - **CONTAINS THE ACTUAL SERVER CODE AS EMBEDDED STRING**
- `server-claude-macos.cjs` - Server tracking `lastAssistantMessageIds` for streaming (macOS only)
- `src/renderer/stores/claudeCodeStore.ts` - Use `let sessions` not `const sessions` in setState
- `src/renderer/services/claudeCodeClient.ts` - Socket.IO connection management
- `src/renderer/components/Chat/MessageRenderer.tsx` - Message rendering logic
- `src-tauri/tauri.conf.json` - Tauri configuration and window settings
- `scripts/inject-version.cjs` - Version injection during build
- `scripts/bundle-macos-server.js` - Bundle server for macOS distribution

## Process Wrapper Architecture

yurucode uses a sophisticated process wrapper system for extending Claude CLI functionality:

### Claude Compact Wrapper (`scripts/claude-compact-wrapper-v2.js`)
- **Token Truth Source**: Authoritative source for token counting and accumulation
- **Session Management**: Tracks multiple sessions with complete token history
- **Compact Detection**: Monitors for `/compact` commands and tracks results
- **Summary Generation**: Creates compact summaries when context is compressed
- **Platform Support**: Handles Windows, macOS, Linux, and WSL paths

The wrapper intercepts all Claude CLI communication to:
1. Track exact token usage (input, output, cache)
2. Detect when compaction happens
3. Generate summaries of compressed content
4. Maintain session state across compacts

## Keyboard Shortcuts

- `Ctrl+T` - New tab/session
- `Ctrl+W` - Close tab
- `Ctrl+Tab` / `Ctrl+Shift+Tab` - Navigate tabs
- `Ctrl+L` - Clear context
- `Ctrl+O` - Toggle model (Opus/Sonnet)
- `Ctrl+R` - Recent projects modal
  - `1-9` - Open project by number (when modal is open)
- `Ctrl+F` - Search in messages
- `Ctrl+0/+/-` - Zoom controls
- `F12` - DevTools
- `?` - Show help
- `Escape` - Close modals/stop streaming

## Special Commands

### `/compact` Command
- **Native Claude CLI command** - NOT implemented in yurucode source
- Compresses conversation context server-side
- Returns empty result with new (non-resumable) session ID
- Server detects completion and clears session ID
- Tracked with `wasCompacted` flag to prevent invalid ID restoration

### `clear` Command  
- **Client-side command** - Implemented in CLI wrapper
- Wipes local conversation history
- Does not affect server-side context

## Common Issues & Solutions

1. **After /compact command**: Session properly resets with `wasCompacted` flag
2. **Token accumulation**: Use `+=` for analytics accumulation, restart app after store changes
3. **Thinking indicator stuck**: Check `message.streaming` flag and `lastAssistantMessageIds` properly cleared
4. **Zustand store changes**: Require full app restart
5. **Hot reload**: Components hot-reload, server uses nodemon, store needs restart
6. **macOS paths**: Server handles path conversion for Claude CLI
7. **Port conflicts**: Dynamic allocation (60000-61000) prevents conflicts
8. **Version mismatch**: Check `scripts/inject-version.cjs` runs during build
9. **Memory issues**: Server has 2GB heap limit with GC exposed

## Testing Changes

When modifying:
1. React components hot-reload automatically (HMR)
2. Server changes reload with nodemon (if using dev server)
3. **Zustand store changes require app restart**
4. Tauri main process needs manual restart
5. Check browser console for Socket.IO errors
6. Check terminal for Claude spawn errors
7. Verify bundled resources after build in `src-tauri/resources/`

## Recent Fixes

### Compact Command Fix (2024-12-23)
- **Problem**: After `/compact`, users couldn't send messages (session not found error)
- **Solution**: Track compacted sessions with `wasCompacted` flag in server
- **Implementation**: Server rejects old session IDs after compact, forces fresh start
- **Files Changed**: `src-tauri/src/logged_server.rs` (embedded server)
- **Details**: See `COMPACT_FIX_V2.md` for complete analysis

### Session Persistence Fixes
1. **TauriClient callback registration** - Fixed in main.tsx
2. **Restored tabs deferred spawn** - Fixed in claudeCodeStore.ts
3. **Syntax errors** - Removed duplicate catch blocks

## Claude Code Source Analysis

The `claude-code-src/` directory contains the de-minified Claude CLI source:
- **No `/compact` implementation** - It's a server-side Claude API feature
- **`clear` command** - Local implementation in `cli/app.js:128`
- **Message flow**: `app.js` → `client.js` → Claude API
- **Commands sent as regular messages** - Special commands handled by API

## Future Improvements

See `YURUCODE_TODO.md` for comprehensive list including:
- Session persistence improvements (SQLite storage)
- Checkpoint system (like Claudia)
- Token optimization and auto-compact triggers
- Better error recovery and retry mechanisms
- Performance profiling and debugging tools