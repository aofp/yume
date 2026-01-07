# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Yurucode is a Tauri 2.x desktop application that provides a minimal GUI for Claude CLI. It consists of:
- **Frontend**: React 19/TypeScript with Vite 7
- **Backend**: Rust (Tauri 2.9)
- **Server**: Compiled Node.js server binaries bundled in `src-tauri/resources/` that handle Claude CLI integration

### Key Features
- Multi-tab session management with persistence
- Intelligent context compaction (55% warning, 60% auto, 65% force)
- Real-time token tracking with cost analytics
- Custom agent system with system prompts
- Hooks system for intercepting Claude behavior
- MCP (Model Context Protocol) support
- Crash recovery for sessions
- OLED black theme with pastel accents

## Essential Commands

### Development
```bash
npm install                    # Install dependencies
npm run tauri:dev              # Dev mode with hot reload
npm run dev:frontend           # Frontend only (for UI work)
npm run dev:dynamic            # Allocate port dynamically then run
```

### Building
```bash
npm run tauri:build:mac        # macOS .dmg (ARM64)
npm run tauri:build:mac:release # Skip server rebuild
npm run tauri:build:win        # Windows .msi/.exe
npm run tauri:build:linux      # Linux .AppImage/.deb
npm run open:dmg               # Open built .dmg file
```

### Server Binaries
```bash
npm run build:server:macos     # Build macOS binary
npm run build:server:windows   # Build Windows binary
npm run build:server:linux     # Build Linux binary
npm run build:server:all       # Build all platforms
```

### Utilities
```bash
npm run prestart               # Kill processes on dev ports
npm run prepare:resources      # Clean resources for target platform
npm run minify:servers         # Minify server code
```

## Architecture

### Three-Process Model
1. **Tauri Process** (Rust) - Native window management, IPC, system integration
2. **Node.js Server** - Claude CLI process spawning and stream parsing (compiled binaries in `src-tauri/resources/`)
3. **React Frontend** - UI rendering and state management via Zustand

### Key Directories
- `src/renderer/` - React frontend (components, services, stores)
- `src-tauri/src/` - Rust backend code
- `src-tauri/src/commands/` - Tauri IPC command handlers
- `src-tauri/resources/` - Compiled server binaries (production)
- `scripts/` - Build and utility scripts
- `docs/` - Extended documentation (architecture, API, troubleshooting)
- Root level `server-claude-*.cjs` - Server source files

### Critical Rust Files
- `lib.rs` - Main entry, Tauri setup
- `logged_server.rs` - Node.js server process management
- `stream_parser.rs` - Claude output stream parsing
- `claude_spawner.rs` - Claude CLI process spawning
- `claude_binary.rs` - Claude binary detection
- `crash_recovery.rs` - Session recovery
- `port_manager.rs` - Dynamic port allocation (20000-65000)
- `agents.rs` - Agent system management
- `commands/mod.rs` - Main IPC commands
- `commands/hooks.rs` - Hooks system
- `commands/mcp.rs` - MCP integration
- `commands/compaction.rs` - Context compaction

### Critical Frontend Files
- `stores/claudeCodeStore.ts` - Main Zustand store (195KB, central state)
- `services/tauriClaudeClient.ts` - Bridge to Claude CLI
- `services/compactionService.ts` - Context compaction logic
- `services/hooksConfigService.ts` - Hooks configuration
- `App.minimal.tsx` - Main app component

### Server Binaries (in resources/)
- `server-macos-arm64` / `server-macos-x64` - macOS binaries
- `server-windows-x64.exe` - Windows binary
- `server-linux-x64` - Linux binary

## Important Implementation Details

### Server Architecture
The Node.js server is distributed as compiled binaries (using @yao-pkg/pkg):
- macOS: `server-macos-arm64` (Apple Silicon) and `server-macos-x64` (Intel)
- Windows: `server-windows-x64.exe`
- Linux: `server-linux-x64`

**Source files are at root level**, not in resources/:
- `server-claude-macos.cjs` - macOS server source
- `server-claude-windows.cjs` - Windows server source
- `server-claude-linux.cjs` - Linux server source
- `server-claude-direct.cjs` - WSL/direct fallback

When editing server code:
1. Edit source `.cjs` files at **project root**
2. Run `npm run build:server:<platform>` to compile
3. Test with `npm run tauri:dev` (uses source files in dev mode)
4. Binaries in `src-tauri/resources/` are for production only

### Token Analytics Fix
Analytics parsing looks for `data.type === 'assistant'` and `data.message.usage` in Claude session files, not `data.type === 'result'`.

### Platform-Specific Paths
- Windows native: `C:\Users\[username]\.claude\projects`
- WSL on Windows: `\\wsl$\Ubuntu\home\[username]\.claude\projects`
- macOS/Linux: `~/.claude/projects`

### Port Management
The application uses dynamic port allocation in the 20000-65000 range to avoid conflicts:
- First tries cached last-working port for faster startup
- Then tries random ports for better distribution
- Falls back to sequential search if random fails
- Check `src-tauri/src/port_manager.rs` for the implementation.

### Cross-Platform Compilation
When building on Windows for Windows, ensure:
1. Rust toolchain is installed with MSVC target
2. Visual Studio Build Tools are available
3. Use PowerShell, not WSL, for building Windows binaries

### State Persistence
**macOS:**
- App data: `~/Library/Application Support/yurucode/`
- Window state: `~/Library/Application Support/yurucode/window-state.json`
- Crash recovery: `~/Library/Application Support/yurucode/crash-recovery/`
- Server logs: `~/Library/Logs/yurucode/server.log`

**Windows:**
- App data: `%APPDATA%\yurucode\`
- Window state: `%APPDATA%\yurucode\window-state.json`
- Crash recovery: `%APPDATA%\yurucode\crash-recovery\`
- Server logs: `%LOCALAPPDATA%\yurucode\logs\server.log`

**Linux:**
- App data: `~/.yurucode/`
- Server logs: `~/.yurucode/logs/server.log`

**Claude projects:** `~/.claude/projects/` (all platforms)

## Common Development Tasks

### Adding New Tauri Commands
1. Add command handler in `src-tauri/src/commands/mod.rs`
2. Register in `tauri::Builder` in `src-tauri/src/lib.rs`
3. Add TypeScript types in `src/renderer/services/tauriApi.ts`

### Modifying the Server
1. Edit source `.cjs` files at **project root** (not in resources/)
2. Test with `npm run tauri:dev` (uses source files directly)
3. Run `npm run build:server:<platform>` for production binaries
4. Use `console.log()` for debugging (visible in server logs)

### Debugging
- Check server logs at paths listed in State Persistence above
- Frontend devtools: `Cmd+Option+I` (macOS) / `Ctrl+Shift+I` (Win/Linux)
- Rust backend logs visible in terminal during `npm run tauri:dev`

## Build Output Locations

After running build commands:
- macOS ARM64: `src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/`
- macOS Universal: `src-tauri/target/universal-apple-darwin/release/bundle/dmg/`
- Windows: `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/`
  - MSI: `msi/yurucode_[version]_x64_en-US.msi`
  - NSIS: `nsis/yurucode_[version]_x64-setup.exe`
- Linux: `src-tauri/target/x86_64-unknown-linux-gnu/release/bundle/`