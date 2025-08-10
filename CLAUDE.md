# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

yurucode is a minimal Electron/React desktop application that provides a lightweight UI for the Claude CLI (not SDK). The app features an ultra-minimal black OLED theme with pastel red (#ff9999) and magenta (#ff99cc) accents. It directly spawns the Claude CLI binary and parses its stream-json output.

## Development Commands

```bash
# Install dependencies
npm install

# Development modes
npm run start:win     # Windows with WSL (single instance)
npm run start:multi   # Multi-instance mode with dynamic port allocation
npm run electron:dev  # Cross-platform development

# Individual services
npm run server:wsl    # WSL server running Claude CLI directly (port 3001)
npm run server:multi  # Multi-instance server with dynamic ports
npm run dev           # Vite dev server for React app (port 5173)
npm run electron      # Electron app only

# Build commands
npm run build         # Build React app for production
npm run dist:win      # Build Windows installer (.exe)
npm run dist:mac      # Build macOS app (.dmg)
npm run dist:linux    # Build Linux package

# Utilities
npm run prestart      # Kill stuck ports (3001, 5173)
build-win.bat         # Windows build script with icon fix
fix-icon.bat          # Fix exe icon after build
```

## Critical Architecture

### Three-Process Architecture

1. **Node.js Server** (`server-claude-direct.js` or `server-claude-multi.js`)
   - Spawns Claude CLI binary directly (no SDK, no API key)
   - Parses `--output-format stream-json` output
   - WebSocket communication via Socket.IO
   - Session resumption with `--resume` flag
   - Process interruption support (SIGINT)
   - Multi-instance: Dynamic port allocation using `portfinder`

2. **Electron Main Process** (`electron/main.js`)
   - Window lifecycle management
   - Zoom persistence in electron-store
   - IPC for folder selection and system operations
   - Dynamic port discovery for multi-instance
   - Server spawning in production builds

3. **React Renderer** (`src/renderer/`)
   - Socket.IO client with retry logic
   - Zustand store for per-session state
   - Token analytics tracking per conversation (not cumulative)
   - Multi-tab session management

### Key Implementation Details

- **Message Flow**: User input → Socket.IO → Server spawns `claude` → Parse stream-json → Stream back
- **Session Management**: Each tab has unique session with own `claudeSessionId`
- **Token Tracking**: Analytics track per-conversation tokens (using `=` not `+=`)
- **Streaming State**: Per-session `streaming` flag, thinking indicator shows when `streaming === true`
- **Clear Context**: Resets `claudeSessionId` and analytics to start fresh
- **Multi-Instance**: Each instance finds available ports automatically

### UI Design Philosophy

- Everything lowercase (no capitalization)
- No pointer cursors (`cursor: default` everywhere)
- Black background (#000000) for OLED
- Pastel accents: red (#ff9999), magenta (#ff99cc)
- Tabler icons (no emojis in UI)
- Sans-serif for thinking indicator
- Animated dots for thinking state
- Right-click context menu with copy for selected text

### Important Files & Patterns

- `server-claude-direct.js` - Main server, tracks `lastAssistantMessageIds` for streaming
- `server-claude-multi.js` - Multi-instance server with port discovery
- `src/renderer/stores/claudeCodeStore.ts` - Use `let sessions` not `const sessions` in setState
- `src/renderer/services/claudeCodeClient.ts` - Port discovery logic, health checks
- `src/renderer/components/Chat/MessageRenderer.tsx` - No thinking indicator inside bubbles
- `scripts/start-multi.js` - Dynamic port allocation for Vite and server

### Keyboard Shortcuts

- `Ctrl+T` - New tab/session
- `Ctrl+D` - Duplicate tab (same directory)
- `Ctrl+W` - Close tab
- `Ctrl+Tab` / `Ctrl+Shift+Tab` - Navigate tabs
- `Ctrl+L` - Clear context
- `Ctrl+O` - Toggle model (Opus/Sonnet)
- `Ctrl+R` - Recent projects modal
- `Ctrl+F` - Search in messages
- `Ctrl+0/+/-` - Zoom controls
- `?` - Show help
- `Escape` - Close modals/stop streaming

### Common Issues & Solutions

1. **Token accumulation**: Ensure using `=` not `+=` in analytics, restart app after store changes
2. **Thinking indicator stuck**: Check `message.streaming` flag is properly cleared on result
3. **Multi-instance ports**: Each instance needs unique ports, use `npm run start:multi`
4. **Icon not showing**: Run `fix-icon.bat` after build, clear Windows icon cache
5. **WSL paths**: Server auto-converts Windows paths to `/mnt/c/...`
6. **Hot reload**: Zustand store changes need full restart, components hot-reload

### Testing Changes

When modifying:
1. React components hot-reload automatically (HMR)
2. Server changes hot-reload with nodemon
3. Zustand store changes require app restart
4. Electron main process needs manual restart
5. Check browser console for Socket.IO errors
6. Check terminal for Claude spawn errors