# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Yurucode is a Tauri desktop application that provides a GUI for Claude CLI. It consists of:
- **Frontend**: React/TypeScript with Vite
- **Backend**: Rust (Tauri)  
- **Embedded Server**: Node.js server embedded in `src-tauri/src/logged_server.rs` that handles Claude CLI integration

## Essential Commands

### Development
```bash
# Install dependencies
npm install

# Run in development mode (opens Tauri window with hot reload)
npm run tauri:dev

# Run frontend only (for UI development)
npm run dev
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

### Testing & Validation
```bash
# Run TypeScript type checking
npm run typecheck

# Kill any processes using development ports
npm run prestart
```

## Architecture

### Three-Process Model
1. **Tauri Process** (Rust) - Native window management, IPC, system integration
2. **Embedded Node.js Server** - Claude CLI process spawning and stream parsing (embedded directly in `logged_server.rs`)
3. **React Frontend** - UI rendering and state management via Zustand

### Key Directories
- `src/renderer/` - React frontend components and services
- `src-tauri/src/` - Rust backend code
- `src-tauri/src/commands/` - Tauri IPC command handlers
- `src-tauri/resources/` - Embedded server resources
- `scripts/` - Build and utility scripts

### Critical Files
- `src-tauri/src/logged_server.rs` - Contains the entire embedded Node.js server code as a string literal
- `src/renderer/stores/claudeCodeStore.ts` - Main Zustand store for application state
- `src/renderer/services/tauriClaudeClient.ts` - Bridge between frontend and Claude CLI
- `src-tauri/src/commands/mod.rs` - All Tauri command implementations

## Important Implementation Details

### Server Embedding
The Node.js server is **not** a separate file - it's embedded as a string literal (`const EMBEDDED_SERVER: &str`) in `src-tauri/src/logged_server.rs`. When editing server code:
1. Edit the JavaScript code within the Rust string literal
2. Be careful with escaping - template literals in the embedded JS need proper handling
3. After editing, rebuild the application for changes to take effect

### Token Analytics Fix
Analytics parsing looks for `data.type === 'assistant'` and `data.message.usage` in Claude session files, not `data.type === 'result'`.

### Platform-Specific Paths
- Windows native: `C:\Users\[username]\.claude\projects`
- WSL on Windows: `\\wsl$\Ubuntu\home\[username]\.claude\projects`
- macOS/Linux: `~/.claude/projects`

### Port Management
The application uses dynamic port allocation starting from port 20223 to avoid conflicts. Check `src-tauri/src/port_manager.rs` for the implementation.

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

### Fixing Template Literal Escaping Issues
If you see syntax errors about escaped backticks (`\``), check `src-tauri/src/logged_server.rs` for improperly escaped template literals in the embedded server string.

### Debugging Server Issues
Server logs are written to temp directory. Check:
- Windows: `C:\Users\[username]\AppData\Local\Temp\yurucode-server\`
- The server.cjs file is extracted here at runtime

### Adding New Tauri Commands
1. Add command handler in `src-tauri/src/commands/mod.rs`
2. Register in `tauri::Builder` in `src-tauri/src/lib.rs`
3. Add TypeScript types in `src/renderer/services/tauriApi.ts`

### Modifying the Embedded Server
1. Edit the JavaScript within `const EMBEDDED_SERVER: &str` in `logged_server.rs`
2. Test carefully - syntax errors will prevent the app from starting
3. Use `console.log()` for debugging (visible in server logs)

## Build Output Locations

After running build commands:
- Windows: `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/`
  - MSI: `msi/yurucode_[version]_x64_en-US.msi`
  - NSIS: `nsis/yurucode_[version]_x64-setup.exe`
- macOS: `src-tauri/target/release/bundle/dmg/`
- Linux: `src-tauri/target/release/bundle/`