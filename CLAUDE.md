# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Yurucode is a Tauri desktop application that provides a GUI for Claude CLI. It consists of:
- **Frontend**: React/TypeScript with Vite
- **Backend**: Rust (Tauri)  
- **Server**: Compiled Node.js server binaries (or .cjs fallback) bundled in `src-tauri/resources/` that handle Claude CLI integration

## Essential Commands

### Development
```bash
# Install dependencies
npm install

# Run in development mode (opens Tauri window with hot reload)
npm run tauri:dev

# Run frontend only (for UI development)
npm run dev:frontend
```

### Building
```bash
# Build for current platform
npm run build

# Platform-specific builds
npm run tauri:build:win     # Windows (creates .msi and .exe installers)
npm run tauri:build:mac     # macOS (creates .dmg)
npm run tauri:build:linux   # Linux (creates .AppImage and .deb)
```

### Server Binaries
```bash
# Build server binary for specific platform
npm run build:server:macos     # Build macOS server binary
npm run build:server:windows   # Build Windows server binary
npm run build:server:linux     # Build Linux server binary
npm run build:server:all       # Build all platform binaries
```

### Utilities
```bash
# Kill any processes using development ports
npm run prestart
```

## Architecture

### Three-Process Model
1. **Tauri Process** (Rust) - Native window management, IPC, system integration
2. **Node.js Server** - Claude CLI process spawning and stream parsing (compiled binaries in `src-tauri/resources/`)
3. **React Frontend** - UI rendering and state management via Zustand

### Key Directories
- `src/renderer/` - React frontend components and services
- `src-tauri/src/` - Rust backend code
- `src-tauri/src/commands/` - Tauri IPC command handlers
- `src-tauri/resources/` - Server binaries and .cjs files
- `scripts/` - Build and utility scripts

### Critical Files
- `src-tauri/src/logged_server.rs` - Server process management (spawning, lifecycle, logging)
- `src-tauri/resources/server-macos-arm64` / `server-macos-x64` - Compiled macOS server binaries
- `src-tauri/resources/server-windows-x64.exe` - Compiled Windows server binary
- `src-tauri/resources/server-linux-x64` - Compiled Linux server binary
- `src-tauri/resources/server-claude-*.cjs` - Fallback .cjs server files
- `src/renderer/stores/claudeCodeStore.ts` - Main Zustand store for application state
- `src/renderer/services/tauriClaudeClient.ts` - Bridge between frontend and Claude CLI
- `src-tauri/src/commands/mod.rs` - All Tauri command implementations

## Important Implementation Details

### Server Architecture
The Node.js server is now distributed as compiled binaries (using @yao-pkg/pkg) for each platform:
- macOS: `server-macos-arm64` (Apple Silicon) and `server-macos-x64` (Intel)
- Windows: `server-windows-x64.exe`
- Linux: `server-linux-x64`

Fallback .cjs files exist for backwards compatibility. When editing server code:
1. Edit the source .js files in `src-tauri/resources/`
2. Run `npm run build:server:macos/windows/linux` to compile new binaries
3. The binaries hide source code and remove Node.js dependency for end users

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
- Window size/position saved in `AppData/Roaming/yurucode/window-state.json`
- Sessions recovered from `AppData/Roaming/yurucode/crash-recovery/`
- Claude projects stored in user's `.claude/projects/` directory

## Common Development Tasks

### Debugging Server Issues
Server logs are written to platform-specific locations:
- macOS: `~/Library/Logs/yurucode/server.log`
- Windows: `%LOCALAPPDATA%\yurucode\logs\server.log`
- Linux: `~/.yurucode/logs/server.log`

### Adding New Tauri Commands
1. Add command handler in `src-tauri/src/commands/mod.rs`
2. Register in `tauri::Builder` in `src-tauri/src/lib.rs`
3. Add TypeScript types in `src/renderer/services/tauriApi.ts`

### Modifying the Server
1. Edit the source .js/.cjs files in `src-tauri/resources/`
2. Test with `npm run tauri:dev` (uses .cjs fallback in development)
3. Run `npm run build:server:<platform>` to compile new binaries for production
4. Use `console.log()` for debugging (visible in server logs)

## Build Output Locations

After running build commands:
- Windows: `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/`
  - MSI: `msi/yurucode_[version]_x64_en-US.msi`
  - NSIS: `nsis/yurucode_[version]_x64-setup.exe`
- macOS: `src-tauri/target/release/bundle/dmg/`
- Linux: `src-tauri/target/release/bundle/`