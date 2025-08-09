# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

yurucode is a minimal Electron/React desktop application that provides a lightweight UI for the Claude CLI (not SDK). The app features an ultra-minimal black OLED theme with pastel red (#ff9999) and magenta (#ff99cc) accents. It directly spawns the Claude CLI binary and parses its stream-json output.

## Development Commands

```bash
# Install dependencies
npm install

# Development (starts all services concurrently)
npm run start:win     # Windows with WSL
npm run electron:dev  # Cross-platform

# Individual services
npm run server:wsl    # WSL server running Claude CLI directly (port 3001)
npm run dev           # Vite dev server for React app (port 5173)
npm run electron      # Electron app

# Build commands
npm run build          # Build React app
npm run dist           # Build and package for current platform
npm run dist:mac       # macOS build
npm run dist:win       # Windows build  
npm run dist:linux     # Linux build

# Kill stuck ports (before starting)
npm run prestart
```

## Critical Architecture

### Three-Process Architecture

1. **Node.js Server (server-claude-direct.js)** - Port 3001
   - Spawns Claude CLI binary directly (no SDK, no API key needed)
   - Parses `--output-format stream-json` output from Claude
   - Handles WebSocket connections via Socket.IO
   - Manages Claude session resumption with `--resume` flag
   - Tracks active processes for interruption support

2. **Electron Main Process (electron/main.js)**
   - Manages window creation and lifecycle
   - Handles zoom persistence via localStorage
   - Provides IPC bridge for folder selection
   - Custom keyboard shortcuts

3. **React Renderer (src/renderer/)**
   - Connects to server via Socket.IO client
   - Uses Zustand for per-session state management
   - All UI components in lowercase, no pointer cursors

### Key Implementation Details

- **Message Flow**: User input → Socket.IO → Server spawns `claude` → Parse stream-json → Stream back
- **Session Management**: Each session tracks its own `claudeSessionId` for `--resume` support
- **Streaming State**: Per-session `streaming` flag (not global) allows multiple concurrent sessions
- **Clear Context**: `/clear` command or Ctrl+L resets `claudeSessionId` to start fresh
- **Recent Projects**: Stored in localStorage, accessible via Ctrl+R modal

### UI Design Philosophy

- Everything lowercase (no capitalization)
- No pointer cursors anywhere (cursor: default)
- Minimal animations only when meaningful
- Black background (#000000) for OLED
- Pastel accents: red (#ff9999), magenta (#ff99cc)
- Tabler icons throughout (no emojis in UI)
- Border radius: 8px (reduced from default)
- Subtle borders: rgba(255, 255, 255, 0.1)
- Thinking indicator: animated dots (...) with spinning icon at full opacity
- Code blocks: 2px margin-bottom between pre elements

### Important Files

- `server-claude-direct.js` - Spawns Claude CLI, parses stream-json
- `src/renderer/stores/claudeCodeStore.ts` - Per-session state management (use `let` not `const` for sessions in setState)
- `src/renderer/services/claudeCodeClient.ts` - Socket.IO client (emits `clearSession` not `clearContext`)
- `src/renderer/components/Chat/ClaudeChat.tsx` - Main chat with modals
- `src/renderer/components/Chat/MessageRenderer.tsx` - Message display with collapsible Read output

### Keyboard Shortcuts

- `Ctrl+T` - New tab/session
- `Ctrl+D` - Duplicate current tab (same directory)
- `Ctrl+W` - Close current tab
- `Ctrl+Tab` - Next tab
- `Ctrl+Shift+Tab` - Previous tab
- `Ctrl+F` - Search in messages
- `Ctrl+L` - Clear context
- `Ctrl+R` - Recent projects modal
- `Ctrl+0` - Reset zoom to 100%
- `Ctrl++` - Zoom in
- `Ctrl+-` - Zoom out
- `/clear` - Clear context (in chat)
- `?` - Show help (in chat or standalone)
- `Escape` - Close modals/stop streaming

### Common Issues & Solutions

1. **Claude CLI not found**: Check `~/.claude/local/claude` exists
2. **Session not resuming**: Server resets `claudeSessionId` on `/clear`
3. **Multiple sessions blocking**: Each session has own `streaming` flag
4. **Port conflicts**: `npm run prestart` kills ports 3001 and 5173
5. **WSL path conversion**: Server converts Windows paths to `/mnt/c/...`
6. **Assignment to const**: Use `let sessions` not `const sessions` in setState callbacks

### Testing Changes

When modifying the app:
1. Server and React hot-reload on changes (HMR)
2. Check browser console for Socket.IO errors
3. Check terminal for Claude spawn errors
4. Electron main process requires manual restart
5. Zoom level persists via localStorage
6. Recent projects modal shows confirmation for clear all