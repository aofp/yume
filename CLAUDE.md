# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

yurucode is a minimal Electron/React desktop application that provides a lightweight UI for the Claude Code SDK (@anthropic-ai/claude-code npm package). The app features an ultra-minimal black OLED theme with pastel red (#ff9999) and magenta (#ff99cc) accents.

## Development Commands

```bash
# Install dependencies
npm install

# Development (starts all services concurrently)
npm run start
# OR
npm run electron:dev

# Individual services
npm run server    # Node.js server running Claude Code SDK (port 3001)
npm run dev       # Vite dev server for React app (port 5173)
npm run electron  # Electron app

# Build commands
npm run build          # Build React app
npm run dist           # Build and package for current platform
npm run dist:mac       # macOS build
npm run dist:win       # Windows build  
npm run dist:linux     # Linux build
```

## Critical Architecture

### Three-Process Architecture

1. **Node.js Server (server.js)** - Port 3001
   - Runs the actual Claude Code SDK (@anthropic-ai/claude-code)
   - Cannot run in browser/Electron renderer due to SDK limitations
   - Handles WebSocket connections via Socket.IO
   - Manages sessions and message streaming
   - Tracks active queries for interruption support

2. **Electron Main Process (electron/main.js)**
   - Manages window creation and lifecycle
   - Provides IPC bridge for folder selection
   - Handles platform-specific integrations

3. **React Renderer (src/renderer/)**
   - Connects to server via Socket.IO client
   - Uses Zustand for state management (claudeCodeStore.ts)
   - All UI components in lowercase, no pointer cursors

### Key Implementation Details

- **Message Flow**: User input → React → Socket.IO → Server → Claude Code SDK → Stream back
- **Session Management**: Sessions are created on server with unique IDs, tracked in both server Map and Zustand store
- **Message Deduplication**: Messages have unique IDs, store prevents duplicates and never accepts user messages from server
- **Streaming**: Assistant messages stream with `streaming: true` flag, cleared when result message received

### UI Design Philosophy

- Everything lowercase (no capitalization)
- No pointer cursors anywhere (cursor: default)
- Minimal animations only when meaningful
- Black background (#000000) for OLED
- Pastel accents: red (#ff9999), magenta (#ff99cc)
- Tabler icons throughout (no emojis in UI)
- Border radius: 8px (reduced from default)
- Subtle borders: rgba(255, 255, 255, 0.1)

### Important Files

- `server.js` - Express server running Claude Code SDK, WebSocket handling
- `src/renderer/stores/claudeCodeStore.ts` - Main state management
- `src/renderer/services/claudeCodeClient.ts` - Socket.IO client
- `src/renderer/components/Chat/ClaudeChat.tsx` - Main chat component
- `src/renderer/components/Chat/MessageRenderer.tsx` - Message display logic

### Environment Variables

```bash
ANTHROPIC_API_KEY=your_api_key  # Required for Claude Code SDK
CLAUDE_CODE_CWD=/path/to/work   # Optional working directory
```

### Common Issues & Solutions

1. **Blank user messages appearing**: Check server.js isn't sending user messages (should be filtered)
2. **Streaming indicators stuck**: Ensure result messages are always sent from server
3. **Session not updating**: Verify Socket.IO connection and session ID matching
4. **Port conflicts**: Kill existing processes on ports 3001 (server) and 5173 (Vite)

### Testing Changes

When modifying the app:
1. Both server.js and React app auto-reload on changes
2. Check browser console for React/Socket.IO errors
3. Check terminal for server-side errors
4. Electron requires manual restart for main process changes

### Message Types

The app handles these Claude Code SDK message types:
- `user` - User inputs (created locally only)
- `assistant` - Claude responses (with streaming support)
- `system` - Session init, errors, interruptions
- `result` - Completion with stats (clears streaming)
- `tool_use` - Tool invocations
- `tool_result` - Tool outputs
- `permission` - Permission requests
- `tool_approval` - Permission responses