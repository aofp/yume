# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ CRITICAL RULES FOR CLAUDE

**NEVER START OR RESTART SERVERS** - The user manages all server processes. DO NOT run:
- `npm run start`, `npm run dev`, `npm run tauri:dev` or any start commands
- Server restart commands or process management commands
- Only provide code fixes, never execute server commands
- If the app isn't working, provide fixes but let the user restart

**NEVER BUILD THE APP** - DO NOT run build commands unless explicitly asked:
- `npm run build` - NEVER run this unless user explicitly asks
- `npm run tauri:build` - NEVER run distribution builds unless requested
- Only fix code, don't test builds unless specifically requested

## Project Overview

yurucode is a cross-platform desktop application providing a minimal UI for the Claude CLI. Built with Tauri v2 (Rust + React), it features an ultra-minimal black OLED theme with pastel red (#ff9999) and magenta (#ff99cc) accents. The app spawns the Claude CLI binary directly and parses its stream-json output.

## Development Commands

```bash
# Install dependencies
npm install

# Development (user manages these)
npm run dev           # Vite dev server (port 5173)
npm run tauri:dev     # Tauri development mode
npm run server:macos  # Node.js server for Claude CLI

# Build commands (only when explicitly requested)
npm run build         # Build React app
npm run tauri:build   # Build for current platform
```

## Critical Architecture

### Three-Process Architecture

1. **Tauri Main Process** (`src-tauri/`)
   - Window lifecycle management
   - Native system integration
   - WebSocket support via Rust

2. **Node.js Server** (`server-claude-macos.js`)
   - Spawns Claude CLI binary directly (no SDK/API key)
   - Parses `--output-format stream-json` output
   - WebSocket communication via Socket.IO
   - Session resumption with `--resume` flag

3. **React Frontend** (`src/renderer/`)
   - Socket.IO client with retry logic
   - Zustand store for state management
   - Multi-tab session management
   - Token analytics per conversation

### Key Implementation Details

- **Message Flow**: User input → Socket.IO → Server spawns `claude` → Parse stream-json → Stream back
- **Session Management**: Each tab has unique `claudeSessionId`
- **Token Tracking**: Analytics track per-conversation tokens (use `=` not `+=`)
- **Streaming State**: Per-session `streaming` flag in Zustand store
- **Clear Context**: Resets `claudeSessionId` and analytics

### UI Design Philosophy

- Everything lowercase (no capitalization)
- No pointer cursors (`cursor: default` everywhere)
- Black background (#000000) for OLED
- Pastel accents: red (#ff9999), magenta (#ff99cc)
- Tabler icons (no emojis in UI)
- Right-click context menu with copy functionality

### Important Files & Patterns

- `server-claude-macos.js` - Server tracking `lastAssistantMessageIds` for streaming
- `src/renderer/stores/claudeCodeStore.ts` - Use `let sessions` not `const sessions` in setState
- `src/renderer/services/claudeCodeClient.ts` - Socket.IO connection management
- `src/renderer/components/Chat/MessageRenderer.tsx` - Message rendering logic
- `src-tauri/tauri.conf.json` - Tauri configuration

### Keyboard Shortcuts

- `Ctrl+T` - New tab/session
- `Ctrl+W` - Close tab
- `Ctrl+Tab` / `Ctrl+Shift+Tab` - Navigate tabs
- `Ctrl+L` - Clear context
- `Ctrl+O` - Toggle model (Opus/Sonnet)
- `Ctrl+R` - Recent projects modal
- `Ctrl+F` - Search in messages
- `Ctrl+0/+/-` - Zoom controls
- `F12` - DevTools
- `?` - Show help
- `Escape` - Close modals/stop streaming

### Common Issues & Solutions

1. **Token accumulation**: Use `=` not `+=` in analytics, restart app after store changes
2. **Thinking indicator stuck**: Check `message.streaming` flag properly cleared
3. **Zustand store changes**: Require full app restart
4. **Hot reload**: Components hot-reload, server uses nodemon, store needs restart
5. **macOS paths**: Server handles path conversion for Claude CLI

### Testing Changes

When modifying:
1. React components hot-reload automatically (HMR)
2. Server changes reload with nodemon
3. Zustand store changes require app restart
4. Tauri main process needs manual restart
5. Check browser console for Socket.IO errors
6. Check terminal for Claude spawn errors