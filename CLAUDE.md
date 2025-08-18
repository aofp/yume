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
```

## Critical Architecture

### Three-Process Architecture

1. **Tauri Main Process** (`src-tauri/`)
   - Window lifecycle management
   - Native system integration
   - WebSocket support via Rust
   - Bundled server resource management
   - Dynamic port allocation (60000-61000 range)

2. **Node.js Server** (`server-claude-macos.js`)
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

### Important Files & Patterns

- `server-claude-macos.js` - Server tracking `lastAssistantMessageIds` for streaming
- `src/renderer/stores/claudeCodeStore.ts` - Use `let sessions` not `const sessions` in setState
- `src/renderer/services/claudeCodeClient.ts` - Socket.IO connection management
- `src/renderer/components/Chat/MessageRenderer.tsx` - Message rendering logic
- `src-tauri/tauri.conf.json` - Tauri configuration and window settings
- `src-tauri/src/logged_server.rs` - Server process management in Rust
- `scripts/inject-version.cjs` - Version injection during build
- `scripts/bundle-macos-server.js` - Bundle server for macOS distribution

### Keyboard Shortcuts

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

### Common Issues & Solutions

1. **Token accumulation**: Use `+=` for analytics accumulation, restart app after store changes
2. **Thinking indicator stuck**: Check `message.streaming` flag and `lastAssistantMessageIds` properly cleared
3. **Zustand store changes**: Require full app restart
4. **Hot reload**: Components hot-reload, server uses nodemon, store needs restart
5. **macOS paths**: Server handles path conversion for Claude CLI
6. **Port conflicts**: Dynamic allocation (60000-61000) prevents conflicts
7. **Version mismatch**: Check `scripts/inject-version.cjs` runs during build
8. **Memory issues**: Server has 2GB heap limit with GC exposed

### Testing Changes

When modifying:
1. React components hot-reload automatically (HMR)
2. Server changes reload with nodemon (if using dev server)
3. Zustand store changes require app restart
4. Tauri main process needs manual restart
5. Check browser console for Socket.IO errors
6. Check terminal for Claude spawn errors
7. Verify bundled resources after build in `src-tauri/resources/`