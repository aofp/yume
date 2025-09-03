# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ CRITICAL RULES

**NEVER START OR RESTART SERVERS** - The user manages all server processes. DO NOT run:
- `npm run dev`, `npm run tauri:dev`, `npm run server:*` or any start commands
- Only provide code fixes, never execute server commands

**NEVER BUILD THE APP** - DO NOT run build commands:
- `npm run build`, `npm run tauri:build*`, `npx tauri build` 
- Only fix code, the user will build and test

**NEVER REMOVE --print FLAG** - Required for yurucode to work:
- `--print` must be used with `--output-format stream-json`
- This is NON-NEGOTIABLE

## Project Overview

yurucode is a cross-platform desktop application providing a minimal UI for the Claude CLI. Built with Tauri v2 (Rust + React), featuring an ultra-minimal black OLED theme with pastel cyan, magenta, and grey accents.

## Critical Architecture

### Three-Process Architecture

1. **Tauri Main Process** (`src-tauri/`)
   - Dynamic port allocation (35000-45000, 60000-61000 ranges)
   - Process spawning and management via Rust
   - Session registry and lifecycle

2. **Node.js Server** (EMBEDDED in `src-tauri/src/logged_server.rs`)
   - **⚠️ CRITICAL**: Server code is EMBEDDED as string constant starting at line ~124
   - **YOU MUST EDIT THE JAVASCRIPT CODE INSIDE logged_server.rs** - editing .js/.cjs files has NO EFFECT
   - On Windows/Linux: extracted to `/tmp/yurucode-server/server.cjs` at runtime
   - On macOS: uses `server-claude-macos.js` directly (not embedded)
   - After editing embedded server, restart Tauri dev server for changes to take effect

3. **React Frontend** (`src/renderer/`)
   - Zustand store for state management (`claudeCodeStore.ts`)
   - Socket.IO client with retry logic
   - Multi-tab session management

### Message Processing Flow

1. User Input → Frontend sends via Socket.IO
2. Server spawns Claude CLI with `--print --output-format stream-json --verbose`
3. Server parses stream-json output
4. Message types:
   - `result` messages: Contains token usage data (not `assistant` messages!)
   - `assistant` messages: Contains text/thinking blocks
   - `tool_use` messages: Sent as separate messages
   - `tool_result` messages: Results from tool executions

### Key Implementation Details

- **Token Tracking**: 
  - Analytics look for `type: "result"` messages with `usage` data
  - Always use `+=` for accumulation
  - Pricing: Opus 4 ($15/$75 per million), Sonnet ($3/$15 per million)
  - Cache rates: Write ($18.75/$3.75), Read ($1.50/$0.30)

- **Session Management**:
  - Lazy reconnection on message send (not on tab switch)
  - Session IDs tracked with `wasCompacted` flag after `/compact`

- **Tool Messages**:
  - Tool_use blocks extracted from assistant messages
  - Enhanced with line numbers for Edit/MultiEdit tools
  - Diffs generated with context lines

## Development Commands

```bash
# Development (user manages these)
npm run dev                    # Vite dev server (dynamic port from Tauri config)
npm run tauri:dev              # Tauri development mode
npm run tauri:dev:mac          # macOS: concurrent Vite + Tauri
npm run tauri:dev:win          # Windows: concurrent Vite + Tauri

# Testing
npm run test:session-loading   # Test session loading functionality

# Build (only when explicitly requested)
npm run build                  # Build React app with version injection
npm run tauri:build:mac        # Build for macOS (includes DMG creation automatically)
npm run tauri:build:win        # Build for Windows x64
```

## Common Issues & Solutions

### Changes not taking effect
- Embedded server (`logged_server.rs`): Restart Tauri dev server
- Zustand store changes: Full app restart required
- React components: Should hot-reload (HMR)

### Analytics/Cost Calculation Issues
- Analytics parse `type: "result"` messages (not `type: "assistant"`)
- Token usage in `data.usage` directly (not `data.message.usage`)
- Model detection from `data.model` (not `data.message.model`)

### Message Display Issues
- Tool messages not showing: Check tool_use blocks sent as separate messages
- Thinking indicator missing: Verify streaming state set when sending message
- Duplicate messages: Check message deduplication by ID and content

### Session Issues
- After `/compact`: Session resets with `wasCompacted` flag
- Token counts wrong: Use `+=` for accumulation

## Debugging

```bash
# Enable wrapper debug mode
WRAPPER_DEBUG=true npm run tauri:dev

# Check server logs
tail -f server-*.pid

# Common log patterns
🧠 [sessionId] - Thinking block processing
📝 [sessionId] - Assistant message emission
📍 [sessionId] - Line number calculation for edits
🔧🔧🔧 TOOL MESSAGE - Tool message received
🎯 WRAPPER - Wrapper module logs
```

## Important Files

- `src-tauri/src/logged_server.rs` - **CONTAINS EMBEDDED SERVER CODE**
- `src/renderer/stores/claudeCodeStore.ts` - Main state management
- `src/renderer/components/Chat/MessageRenderer.tsx` - Message rendering
- `src/renderer/components/Chat/ClaudeChat.tsx` - Main chat interface
- `wrapper-module.js` - Token truth source and session management