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
- `main.rs` - Executable entry point, panic handler
- `logged_server.rs` - Node.js server process management
- `stream_parser.rs` - Claude output stream parsing
- `claude_spawner.rs` - Claude CLI process spawning
- `claude_binary.rs` - Claude binary detection
- `claude_session.rs` - Session management and ID extraction
- `crash_recovery.rs` - Session recovery
- `port_manager.rs` - Dynamic port allocation (20000-65000)
- `agents.rs` - Agent system management
- `config.rs` - Production configuration management
- `claude/mod.rs` - ClaudeManager for session lifecycle
- `websocket/mod.rs` - WebSocket server for real-time communication
- `state/mod.rs` - Application state management
- `process/mod.rs` - Process tracking module
- `process/registry.rs` - ProcessRegistry for tracking Claude processes
- `db/mod.rs` - SQLite database implementation
- `compaction/mod.rs` - CompactionManager implementation
- `hooks/mod.rs` - Hook system implementation
- `mcp/mod.rs` - MCP server management
- `commands/mod.rs` - Main IPC commands
- `commands/hooks.rs` - Hooks system
- `commands/mcp.rs` - MCP integration
- `commands/compaction.rs` - Context compaction
- `commands/claude_commands.rs` - Direct Claude CLI commands (spawn, send, etc.)
- `commands/claude_detector.rs` - Claude installation detection and WSL support
- `commands/claude_info.rs` - Claude binary info and usage limits
- `commands/database.rs` - SQLite database operations
- `commands/custom_commands.rs` - Custom slash commands management

### Critical Frontend Files
- `stores/claudeCodeStore.ts` - Main Zustand store (204KB, central state)
- `services/tauriClaudeClient.ts` - Bridge to Claude CLI via Tauri
- `services/claudeCodeClient.ts` - Socket.IO client for server communication
- `services/compactionService.ts` - Context compaction logic
- `services/hooksConfigService.ts` - Hooks configuration
- `services/databaseService.ts` - Frontend database integration
- `services/mcpService.ts` - MCP server management
- `services/checkpointService.ts` - Checkpoint and session state management
- `services/agentExecutionService.ts` - Agent execution
- `services/claudeDetector.ts` - Claude detection logic
- `services/wrapperIntegration.ts` - Wrapper message processing
- `services/platformBridge.ts` - Platform-specific utilities
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
3. Restart `npm run tauri:dev` to use the new binary
4. **Important**: Dev mode uses binaries from `src-tauri/resources/`, NOT source files directly. You must rebuild after source changes.

### Token Analytics
Analytics uses `result` message's cumulative totals (not summing per-turn `assistant` messages which would overcount). The `result` messages in Claude session files contain accurate cumulative `usage` data. If `costUSD` is available, use it directly; otherwise calculate from token breakdowns.

### Platform-Specific Paths
- Windows native: `C:\Users\[username]\.claude\projects`
- WSL on Windows: `\\wsl$\Ubuntu\home\[username]\.claude\projects`
- macOS/Linux: `~/.claude/projects`

### Session File Format
Claude stores sessions as `.jsonl` files in `~/.claude/projects/-[escaped-path]/`:
- Main sessions: UUID format like `ebfdc520-63b3-4e07-af41-6b72deb80ecb.jsonl`
- Subagent sessions: `agent-*.jsonl` (filtered out from resume conversation list)
- Empty files (0 bytes) are common and should be skipped when listing conversations
- Path escaping: `/Users/yuru/project` becomes `-Users-yuru-project`

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
- Crash recovery: `~/Library/Application Support/yurucode/recovery/`
- Server logs: `~/Library/Logs/yurucode/server.log`
- Database: `~/Library/Application Support/yurucode/yurucode.db`

**Windows:**
- App data: `%APPDATA%\yurucode\`
- Window state: `%APPDATA%\yurucode\window-state.json`
- Crash recovery: `%APPDATA%\yurucode\recovery\`
- Server logs: `%LOCALAPPDATA%\yurucode\logs\server.log`
- Database: `%APPDATA%\yurucode\yurucode.db`

**Linux:**
- App data: `~/.config/yurucode/`
- Crash recovery: `~/.config/yurucode/recovery/`
- Server logs: `~/.yurucode/logs/server.log`
- Database: `~/.yurucode/yurucode.db`

**Claude projects:** `~/.claude/projects/` (all platforms)
**Custom commands:** `~/.claude/commands/*.md` (global) and `.claude/commands/*.md` (project)
**Agents:** `~/.claude/agents/` (global) and `.claude/agents/` (project)

### Yurucode Core Agents
5 built-in agents sync to `~/.claude/agents/yurucode-*.md` when enabled. **All agents automatically use the currently selected model** (opus or sonnet) - when you switch models, agents are re-synced with the new model:
- `yurucode-architect` - Plans, designs, decomposes tasks
- `yurucode-explorer` - Finds, reads, understands codebase (read-only)
- `yurucode-implementer` - Codes, edits, builds
- `yurucode-guardian` - Reviews, audits, verifies
- `yurucode-specialist` - Domain-specific tasks

Sync commands: `sync_yurucode_agents(enabled, model)`, `are_yurucode_agents_synced`, `cleanup_yurucode_agents_on_exit`
PID tracking in `.yurucode-pids/` prevents multi-instance conflicts.

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