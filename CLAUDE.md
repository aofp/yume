# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Yume is a Tauri 2.x desktop application that provides a minimal GUI for Claude CLI. It consists of:
- **Frontend**: React 19/TypeScript with Vite 7
- **Backend**: Rust (Tauri 2.9)
- **Server**: Compiled Node.js server binaries bundled in `src-tauri/resources/` that handle Claude CLI integration

### Key Features
- Multi-tab session management with persistence
- Intelligent context compaction (55% warning, 60% auto, 65% force)
- Real-time token tracking with cost analytics
- **License management** (Trial: 2 tabs, Pro: 99 tabs with encrypted validation)
- **Plugin system** for extending functionality (commands, agents, hooks, skills, MCP)
- **Skills system** for auto-injecting context based on triggers (with ReDoS protection)
- **Background agents** with queue management (4 concurrent, git branch isolation)
- **Memory system** via MCP server (persistent knowledge graph in `~/.yume/memory.jsonl`)
- Custom agent system with system prompts (5 core agents)
- Hooks system for intercepting Claude behavior
- MCP (Model Context Protocol) support
- **Performance monitoring** with real-time metrics (FPS, memory, render time)
- **Timeline & checkpoints** for conversation state management
- **Analytics dashboard** with per-project/model/date breakdowns
- **CLAUDE.md editor** for editing project documentation
- **Toast notifications** for user feedback (session ops, dictation, compaction)
- Crash recovery for sessions
- OLED black theme with pastel accents

### Multi-Provider Integration
Enable Yume to drive Google's Gemini and OpenAI's Codex models via a CLI-compatible shim (`yume-cli`) while preserving Claude-compatible stream-json.
- **Strategy:** Spawn official CLI binaries (`gemini`, `codex`) and translate their stream-json output.
- **Auth:** Handled by official CLIs - user must run `gemini auth login` or `codex login` separately.
- **Shim:** `yume-cli` in `src-yume-cli/` spawns official CLIs and normalizes output.
- **Status:** COMPLETE for release. All providers (Claude, Gemini, OpenAI) work end-to-end.
  - yume-cli binaries bundled for macOS (arm64/x64); Windows/Linux binaries need build before release
  - Tool call delta assembly implemented for streaming tool calls
  - Provider switch forks session (by design - no mid-conversation provider switching)

### Model Configuration (DO NOT CHANGE)
Model IDs in `src/renderer/config/models.ts` are intentionally set and MUST NOT be modified without explicit user approval:

**Claude models:**
- `claude-sonnet-4-5-20250929` (sonnet 4.5)
- `claude-opus-4-5-20251101` (opus 4.5)

**Gemini models:**
- `gemini-2.5-pro` (gemini 2.5 pro)
- `gemini-2.5-flash` (gemini 2.5 flash)

**OpenAI/Codex models:**
- `gpt-5.2-codex` (gpt-5.2 codex)
- `gpt-5.1-codex-mini` (gpt-5.1 codex mini)

These model IDs are configured by the user and may not match currently available API models. The yume-cli shim passes these IDs directly to the official CLIs.

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

### yume-cli Binaries
```bash
npm run build:yume-cli                 # Build yume-cli (TypeScript + esbuild bundle)
npm run build:yume-cli:binary:macos    # Build macOS binaries (arm64 + x64)
npm run build:yume-cli:binary:win      # Build Windows binary (x64)
npm run build:yume-cli:binary:linux    # Build Linux binary (x64)
npm run build:yume-cli:binary:all      # Build all platforms
```

### Utilities
```bash
npm run prestart               # Kill processes on dev ports
npm run prepare:resources      # Clean resources for target platform
npm run minify:servers         # Minify server code
npm run ensure:server          # Check if server binary exists, build if missing
```

### Build System Notes
- **45 npm scripts** total (see package.json)
- **30 utility scripts** in `scripts/` directory
- Server compilation: esbuild bundle → bytenode V8 bytecode → pkg binary
- V8 bytecode protection prevents source inspection
- **Unified binary architecture**: Server + yume-cli combined into single `yume-bin-*` binary

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
- `src-yume-cli/` - Multi-provider CLI shim (TypeScript)
- `scripts/` - Build and utility scripts
- `docs/` - Extended documentation (architecture, API, troubleshooting)
- Root level `server-claude-*.cjs` - Server source files

### Critical Rust Files
- `lib.rs` - Main entry, Tauri setup, command registration
- `app.rs` - Application constants (APP_NAME, APP_VERSION, APP_ID)
- `main.rs` - Executable entry point, panic handler
- `logged_server.rs` - Node.js server process management
- `stream_parser.rs` - Claude output stream parsing
- `claude_spawner.rs` - Claude CLI process spawning
- `yume_cli_spawner.rs` - Multi-provider CLI shim spawner (Gemini, OpenAI)
- `claude_binary.rs` - Claude binary detection
- `claude_session.rs` - Session management and ID extraction
- `crash_recovery.rs` - Session recovery
- `port_manager.rs` - Dynamic port allocation (20000-65000)
- `agents.rs` - Agent system management
- `config.rs` - Production configuration management
- `background_agents.rs` - Background agent queue manager
- `git_manager.rs` - Git branch operations for background agents
- `claude/mod.rs` - ClaudeManager for session lifecycle (legacy)
- `websocket/mod.rs` - WebSocket server (not currently used)
- `state/mod.rs` - Application state management
- `process/mod.rs` - Process tracking module
- `process/registry.rs` - ProcessRegistry for tracking spawned processes
- `db/mod.rs` - SQLite database implementation
- `compaction/mod.rs` - CompactionManager implementation
- `hooks/mod.rs` - Hook system implementation (9 event types)
- `mcp/mod.rs` - MCP server management
- `commands/mod.rs` - Main IPC commands
- `commands/hooks.rs` - Hooks system
- `commands/mcp.rs` - MCP integration
- `commands/compaction.rs` - Context compaction
- `commands/claude_commands.rs` - Direct Claude CLI commands
- `commands/claude_detector.rs` - Claude installation detection
- `commands/claude_info.rs` - Claude binary info and usage limits
- `commands/database.rs` - SQLite database operations
- `commands/custom_commands.rs` - Custom slash commands management
- `commands/plugins.rs` - Plugin system
- `commands/background_agents.rs` - Background agent operations
- `commands/memory.rs` - Memory MCP server management

### Critical Frontend Files
**Stores:**
- `stores/claudeCodeStore.ts` - Main Zustand store (monolith, consider splitting)

**Services:**
- `services/tauriClaudeClient.ts` - Primary bridge to Claude CLI via Tauri
- `services/claudeCodeClient.ts` - Socket.IO client for server communication
- `services/compactionService.ts` - Context compaction logic
- `services/licenseManager.ts` - License validation Zustand store
- `services/conversationStore.ts` - UCF conversation persistence
- `services/conversationTranslator.ts` - Multi-provider format translation
- `services/hooksConfigService.ts` - Hooks configuration
- `services/hooksService.ts` - Hook execution (9 events)
- `services/databaseService.ts` - Frontend database integration
- `services/mcpService.ts` - MCP server management
- `services/pluginService.ts` - Plugin management
- `services/checkpointService.ts` - Checkpoint management (partially disabled)
- `services/agentExecutionService.ts` - Agent execution
- `services/claudeDetector.ts` - Claude detection logic
- `services/wrapperIntegration.ts` - Token tracking
- `services/platformBridge.ts` - Platform-specific utilities
- `services/performanceMonitor.ts` - Real-time performance tracking
- `services/fileSearchService.ts` - File search with caching
- `services/modalService.ts` - Global alert/confirm dialogs
- `services/providersService.ts` - Multi-provider state management
- `services/providerPromptService.ts` - Provider-aware system prompt formatting
- `services/systemPromptService.ts` - System prompt generation
- `services/platformUtils.ts` - Platform detection utilities
- `services/tauriApi.ts` - TypeScript types for Tauri commands
- `services/backgroundAgentService.ts` - Background agent queue management
- `services/memoryService.ts` - Memory MCP server integration
- `services/toastService.ts` - Global toast notification singleton

**Key Components:**
- `Chat/ClaudeChat.tsx` - Main chat orchestrator
- `Chat/MessageRenderer.tsx` - Message rendering
- `Chat/ContextBar.tsx` - Context usage visualization
- `Chat/InputArea.tsx` - Input with ultrathink highlighting
- `CommandPalette/CommandPalette.tsx` - VS Code-style command palette
- `Settings/SettingsModalTabbed.tsx` - Settings (9 tabs: General, Appearance, Providers, Hooks, Commands, MCP, Plugins, Skills, Memory)
- `Settings/SkillsTab.tsx` - Skills management with triggers/content editor
- `Settings/MemoryTab.tsx` - Memory MCP server configuration
- `ModelSelector/ModelToolsModal.tsx` - Model & tools selector
- `ProjectsModal/ProjectsModal.tsx` - Projects and sessions browser
- `BackgroundAgents/AgentQueuePanel.tsx` - Background agent queue panel
- `Toast/Toast.tsx` - Toast notification component

**Type Definitions:**
- `types/ucf.ts` - Unified Conversation Format types
- `types/backgroundAgents.ts` - Background agent types
- `types/skill.ts` - Skill types with YAML parsing

**Utilities:**
- `utils/regexValidator.ts` - ReDoS pattern detection for skill triggers
- `utils/helpers.ts` - Common utility functions
- `utils/logger.ts` - Logging utilities
- `utils/chatHelpers.ts` - Chat-specific helpers
- `utils/fontLoader.ts` - Font loading utilities

### Server Binaries (in resources/)
Uses unified binary architecture - server and CLI combined into single binary:
- `yume-bin-macos-arm64` / `yume-bin-macos-x64` - macOS unified binaries
- `yume-cli-macos-arm64` / `yume-cli-macos-x64` - Shell wrappers that invoke `yume-bin-* cli`
- `yume-vscode/yume-*.vsix` - Bundled VSCode extension for optional installation
- Windows/Linux binaries: Not currently bundled (build scripts exist)

### yume-cli (Multi-Provider Shim)
**Location**: `src-yume-cli/`
**Status**: COMPLETE - embedded in unified binary for macOS (arm64/x64)

TypeScript CLI that spawns official provider CLIs (gemini, codex) and translates output to Claude-compatible stream-json format. **Architecture**: yume-cli is embedded inside `yume-bin-*` unified binary and invoked via `yume-bin-* cli` subcommand. Shell wrapper scripts (`yume-cli-*`) provide the CLI interface.

**Key Files:**
- `src/index.ts` - CLI entry point, argument parsing
- `src/types.ts` - Type definitions
- `src/core/agent-loop.ts` - Main Think→Act→Observe loop with tool delta assembly
- `src/core/plugins.ts` - Plugin loader (agents, skills from `~/.yume/plugins/`)
- `src/core/emit.ts` - Stream-json message emitters
- `src/core/session.ts` - Session persistence to `~/.yume/sessions/{provider}/`
- `src/core/pathSecurity.ts` - Path validation, traversal prevention
- `src/providers/gemini.ts` - Gemini CLI spawner with tool translation
- `src/providers/openai.ts` - Codex CLI spawner with tool detection
- `src/providers/base.ts` - Base provider class
- `src/tools/` - 7 tools: bash, read, write, edit, glob, grep, ls

**Safety Limits**:
- MAX_TURNS: 50, MAX_DURATION_MS: 10 min, MAX_HISTORY_MESSAGES: 100
- Tool execution timeout: 2 min (bash), 5 min (provider process)
- Bash command whitelist (~50 commands) and blacklist (dangerous patterns)

**Provider Naming**:
- yume-cli uses `'anthropic'` internally (matching official CLI naming)
- Frontend uses `'claude'` as the provider type
- Both refer to the same provider, normalized at integration boundaries

**Tool Translation** (codex → claude format):
- `command_execution` → Detected from command pattern:
  - `cat`, `head`, `tail`, `less`, `more` → Read
  - `find`, `fd`, `*.` (glob patterns) → Glob
  - `grep`, `rg`, `ag`, `ack` → Grep
  - `ls`, `tree` → LS
  - `sed`, `awk` → Edit
  - `touch`, `>`, `>>` → Write
  - `curl`, `wget`, `fetch` → WebFetch
  - `git`, other commands → Bash
- `file_read` → Read
- `file_edit` / `file_write` → Edit / Write
- `file_search` / `glob` → Glob
- `content_search` / `grep` → Grep
- `list_directory` / `ls` → LS

**Plugin Injection**:
Plugins from `~/.yume/plugins/` are loaded at startup. Agent system prompts and skill-matched content are prepended to user messages via `<system-context>` and `<skill-context>` tags.

**Security**:
- Regex patterns from skills are validated for ReDoS patterns before execution
- Cross-platform path handling via `path.basename()`

## Important Implementation Details

### Server Architecture
The Node.js server is distributed as compiled binaries (using @yao-pkg/pkg):
- macOS: `yume-server-macos-arm64` (Apple Silicon) and `yume-server-macos-x64` (Intel)
- Windows: `yume-server-windows-x64.exe`
- Linux: `yume-server-linux-x64`

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
Analytics deduplicates by `requestId` to avoid overcounting streaming chunks. Multiple `assistant` messages can share the same `requestId` (streaming chunks), so only unique `requestId` values are counted. Both `assistant` and `result` message types are deduplicated. If `costUSD` is available from `result` messages, use it directly; otherwise calculate from token breakdowns using pricing rates.

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
- App data: `~/Library/Application Support/yume/`
- Window state: `~/Library/Application Support/yume/window-state.json`
- Crash recovery: `~/Library/Application Support/yume/recovery/`
- Server logs: `~/Library/Logs/yume/server.log`
- Database: `~/.yume/yume.db` (note: stored in home dir, not Application Support)

**Windows:**
- App data: `%APPDATA%\yume\`
- Window state: `%APPDATA%\yume\window-state.json`
- Crash recovery: `%APPDATA%\yume\recovery\`
- Server logs: `%LOCALAPPDATA%\yume\logs\server.log`
- Database: `%APPDATA%\yume\yume.db`

**Linux:**
- App data: `~/.config/yume/`
- Crash recovery: `~/.config/yume/recovery/`
- Server logs: `~/.yume/logs/server.log`
- Database: `~/.yume/yume.db`

**Claude projects:** `~/.claude/projects/` (all platforms)
**Custom commands:** `~/.claude/commands/*.md` (global) and `.claude/commands/*.md` (project)
**Agents:** `~/.claude/agents/` (global) and `.claude/agents/` (project)

### Yume Core Agents
5 built-in agents sync to `~/.claude/agents/yume-*.md` when enabled. **All agents automatically use the currently selected model** (opus or sonnet) - when you switch models, agents are re-synced with the new model:
- `yume-architect` - Plans, designs, decomposes tasks
- `yume-explorer` - Finds, reads, understands codebase (read-only)
- `yume-implementer` - Codes, edits, builds
- `yume-guardian` - Reviews, audits, verifies
- `yume-specialist` - Domain-specific tasks

Sync commands: `sync_yume_agents(enabled, model)`, `are_yume_agents_synced`, `cleanup_yume_agents_on_exit`
PID tracking in `~/.yume/pids/` prevents multi-instance conflicts.

### Background Agents System
**Async agent execution** with queue management and git branch isolation.

**Architecture**:
- `AgentQueueManager` - Thread-safe manager for background agent lifecycle
- `MAX_CONCURRENT_AGENTS`: 4 (parallel execution limit)
- `AGENT_TIMEOUT_SECS`: 600 (10 minute timeout)
- Output directory: `~/.yume/agent-output/`
- Event emission: `background-agent-status` (Tauri event)

**Agent Status Flow**: `Queued` → `Running` → `Completed`/`Failed`/`Cancelled`

**Agent Types** (maps to yume core agents):
- `Architect` - Plans, designs, decomposes tasks
- `Explorer` - Finds, reads, understands codebase
- `Implementer` - Codes, edits, builds
- `Guardian` - Reviews, audits, verifies
- `Specialist` - Domain-specific tasks
- `Custom(String)` - User-defined agents

**Rust Backend** (`src-tauri/src/`):
- `background_agents.rs` - Queue manager, process spawning, timeout handling
- `git_manager.rs` - Git branch operations for isolated agent work
- `commands/background_agents.rs` - 13 Tauri IPC commands

**Git Branch Isolation**:
- Branch prefix: `yume-async-{agent-type}-{agent-id}`
- Auto-stash uncommitted changes before branch creation
- Functions: `create_agent_branch`, `merge_agent_branch`, `delete_agent_branch`
- Conflict detection: `check_merge_conflicts`
- Cleanup: `cleanup_old_branches` removes merged branches

**Tauri Commands (13)**:
1. `queue_background_agent` - Queue new agent with optional git branch
2. `get_agent_queue` - Get all agents (queued, running, completed)
3. `get_background_agent` - Get specific agent by ID
4. `cancel_background_agent` - Cancel running/queued agent
5. `remove_background_agent` - Remove completed agent (cleans up branch)
6. `get_agent_output` - Load agent session file
7. `create_agent_branch` - Create git branch for agent
8. `get_agent_branch_diff` - Get diff vs main branch
9. `merge_agent_branch` - Merge agent work into main
10. `delete_agent_branch` - Delete agent branch
11. `check_agent_merge_conflicts` - Pre-merge conflict check
12. `cleanup_old_agents` - Remove agents >24hrs old
13. `update_agent_progress` - Update progress (from monitor)

**Frontend Service** (`backgroundAgentService.ts`):
- Event-driven architecture with Tauri event listeners
- Subscribe/unsubscribe pattern for UI updates
- Methods: `queueAgent`, `cancelAgent`, `removeAgent`, `mergeAgentBranch`
- Real-time status synchronization

**UI Components**:
- `AgentQueuePanel.tsx` - Sliding panel with agent cards
- `ProgressIndicator.tsx` - Real-time progress display

**yume-cli Integration**:
Supports `--async`, `--output-file`, `--git-branch` flags for background execution.

### Memory MCP Server System
**Persistent knowledge graph** using @modelcontextprotocol/server-memory.

**Architecture**:
- Storage: `~/.yume/memory.jsonl` (JSONL format)
- MCP server: Spawned via `npx -y @modelcontextprotocol/server-memory`
- Communication: JSON-RPC 2.0 over stdin/stdout
- Auto-start: When `memoryEnabled` is true on app startup
- Cleanup: `cleanup_memory_server()` called on app exit

**MCP Protocol Details**:
- Protocol version: `2024-11-05`
- Handshake: `initialize` request → response → `notifications/initialized`
- Request IDs: Atomic counter for concurrent requests
- 500ms startup delay before handshake to ensure server readiness

**Knowledge Graph Model**:
- **Entities**: Named nodes with type and observations
- **Relations**: Connections between entities with relation type
- **Observations**: Facts attached to entities

**Entity Naming Conventions**:
- Projects: `project:{path-with-dashes}` (e.g., `project:Users-yuru-myapp`)
- Patterns: `pattern:{name-slug}` (max 50 chars)
- Errors: `error:{first-30-chars-slug}`
- System: `yume:startup-test` (initialization marker)

**Rust Backend** (`commands/memory.rs`):
- Global `MEMORY_SERVER` state with Mutex for thread safety
- Process management with stdin/stdout handles
- JSON-RPC request/response handling with error propagation
- Enhanced PATH resolution for npx (homebrew, nvm, pnpm paths)
- Cross-platform: Uses `npx.cmd` on Windows, `npx` elsewhere

**Tauri Commands (10)**:
1. `start_memory_server` - Start MCP server process with handshake
2. `stop_memory_server` - Stop server process (kills child)
3. `check_memory_server` - Check if running (uses try_wait)
4. `get_memory_file_path` - Get storage path
5. `memory_create_entities` - Create entities via `tools/call`
6. `memory_create_relations` - Create relations via `tools/call`
7. `memory_add_observations` - Add observations to entity
8. `memory_search_nodes` - Search knowledge graph
9. `memory_read_graph` - Read entire graph
10. `memory_delete_entity` - Delete entity and relations

**Frontend Service** (`memoryService.ts`):
- Singleton service with `isStarting`/`isStopping` guards
- Initialization writes startup test entity to verify system works
- High-level methods:
  - `remember(projectPath, fact, category)` - Store project fact
  - `rememberPattern(pattern, context)` - Store coding pattern
  - `rememberErrorFix(error, solution)` - Store error/fix pair
  - `getRelevantMemories(context, maxResults)` - Get memories for prompt injection
  - `extractLearnings(projectPath, userMessage, response)` - Auto-extract patterns
- Low-level methods: `createEntities()`, `createRelations()`, `addObservations()`, `searchNodes()`, `readGraph()`, `deleteEntity()`

**Store Integration**:
- `memoryEnabled` - Enable/disable memory system
- `memoryServerRunning` - Server status tracking
- Actions: `setMemoryEnabled()`, `setMemoryServerRunning()`

**Auto-Learning Triggers**:
- Error/fix patterns: Detects `/error|bug|fix|issue|problem|crash|fail/i` in messages
- Architecture decisions: Detects `/should (use|prefer|avoid)|best practice|pattern|architecture|design/i`
- Stores first 200-500 chars as summary

**Search Algorithm**:
- Extracts words >3 chars from context
- Takes first 5 terms as search query
- Returns formatted `<memory-context>` block for prompt injection

### License Management System
**Demo vs Pro**: Demo users limited to 2 tabs and 1 window. Pro license ($21) unlocks 99 tabs and 99 windows.

**Implementation**:
- Location: `src/renderer/services/licenseManager.ts` (Zustand store in services dir)
- Server-side validation with 5-minute cache: `https://yuru.be/api/license/validate.php`
- Encrypted storage using XOR cipher with base64 encoding in localStorage
- Auto-revalidation every 30 minutes
- Storage key: `yume-license-v3` (derived from APP_ID via `appStorageKey()`)

**License Format**: `XXXXX-XXXXX-XXXXX-XXXXX-XXXXX` (29 characters, Base32-like charset: `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` - excludes 0, 1, I, O for readability)

**Commands**:
- `validateLicense(key)` - Server-side validation
- `activateLicense(key)` - Activate license and update feature limits
- `deactivateLicense()` - Deactivate and return to demo
- `getFeatures()` - Get current feature limits (maxTabs, maxWindows)
- `refreshLicenseStatus()` - Manual revalidation

**UI**: `UpgradeModal.tsx` - Shows upgrade prompts with reasons (tabLimit, feature, demo)

### Plugin System
**Complete extensibility framework** for adding custom functionality without modifying code.

**Location**: `src-tauri/src/commands/plugins.rs` (backend), `src/renderer/services/pluginService.ts` (frontend)

**Plugin Components**:
- **Commands**: Custom slash commands (`.md` files)
- **Agents**: Custom agent definitions (`.md` files with YAML frontmatter)
- **Hooks**: Event-based hooks (9 Rust events, 8 TS events):
  - Rust: UserPromptSubmit, PreToolUse, PostToolUse, AssistantResponse, SessionStart, SessionEnd, ContextWarning, CompactionTrigger, Error
  - TS: user_prompt_submit, pre_tool_use, post_tool_use, assistant_response, session_start, session_end, context_warning, error
- **Skills**: Auto-injected context based on triggers (NOTE: Skills UI limited - no trigger config)
- **MCP Servers**: Model Context Protocol server configurations

**Plugin Directory**: `~/.yume/plugins/`

**Plugin Structure**:
```
~/.yume/plugins/{plugin-id}/
  .claude-plugin/
    plugin.json       # Metadata (id, name, version, author, components)
  commands/           # Custom commands (.md files)
  agents/             # Custom agents (.md files with YAML frontmatter)
  hooks/              # Custom hooks (.md files)
  skills/             # Custom skills (.md files, optional)
  .mcp.json           # MCP server config (optional, at plugin root)
```

**Frontend Service**:
- `initialize()` - Initialize bundled "yume" plugin
- `listPlugins()` - List all installed plugins
- `installPlugin(sourcePath)` - Install from directory
- `installPluginFromDialog()` - File picker dialog
- `uninstallPlugin(pluginId)` - Remove plugin
- `enablePlugin(pluginId)` - Enable and sync components
- `disablePlugin(pluginId)` - Disable plugin
- `refresh()` - Reload plugin registry

**UI**: `PluginsTab.tsx` - Enable/disable plugins, view component counts, install from folder

### Skills System
**Auto-inject context/knowledge** into conversations based on triggers (file extensions, keywords, regex).

**Location**: `src/renderer/components/Settings/SkillsTab.tsx`

**Status**: COMPLETE
- Tabbed modal with General, Triggers, and Content tabs
- `TriggerEditor.tsx` - Tag-based trigger configuration (extensions, keywords, regex)
- `ContentEditor.tsx` - Markdown editor with preview toggle
- `regexValidator.ts` - ReDoS detection for regex patterns
- Rust commands `write_skill_file`, `remove_skill_file` for persistence
- YAML frontmatter sync for skill files

**Skill Types**:
- **Custom Skills**: User-created, stored in localStorage (`yume_custom_skills`)
- **Plugin Skills**: Sourced from enabled plugins (read from `.md` files in `skills/`)

**Skill File Structure** (in `~/.yume/plugins/{id}/skills/*.md`):
```markdown
---
id: skill-id
name: Skill Name
description: What this skill does
triggers:
  extensions: ["*.py", "*.pyw"]
  keywords: ["python", "django"]
  patterns: ["/^def /", "/import .* from/"]
  matchMode: any
enabled: true
---
Context to inject when triggered
```

**UI Components**:

**TriggerEditor.tsx**:
- Tag-based UI for file patterns, keywords, regex
- Real-time ReDoS validation with risk indicators
- Match mode toggle: ANY (OR logic) vs ALL (AND logic)

**ContentEditor.tsx**:
- Markdown editor with live preview toggle
- Token estimation with performance warnings

**regexValidator.ts**:
- ReDoS detection with risk levels: safe, low, medium, high
- Detects nested quantifiers, overlapping alternations, catastrophic backtracking

**types/skill.ts**:
- YAML frontmatter parsing/generation
- Trigger evaluation: `skillMatchesContext()`
- Glob pattern to regex conversion

**Features**:
- Toggle enable/disable status
- View plugin skill source attribution
- Combined view of all available skills
- Name/description/triggers/content editing
- ReDoS validation with performance warnings
- Match mode: any (default) or all triggers must match

### Performance Monitoring
**Real-time performance metrics** for debugging and optimization.

**Location**: `src/renderer/services/performanceMonitor.ts` (Singleton)

**Metrics Tracked**:
- **FPS**: Target 60fps, warn at <30fps (via requestAnimationFrame)
- **Memory**: Warn at 100MB heap, critical at 200MB
- **Startup Time**: Target <3s, critical at 5s
- **Message Send**: Warning at 500ms, critical at 1s
- **Compaction**: Warning at 5s, critical at 10s
- **Long Tasks**: Logged when >50ms, warned when >200ms
- **Layout Shift**: Cumulative layout shift score tracking

**API**:
- `mark(name)` - Start measurement
- `measure(name)` - End measurement
- `recordMetric(name, value, unit)` - Record custom metric
- `getMetricsSummary()` - Get statistical summary (avg, min, max, p50, p90, p99)
- `exportMetrics()` - Export as JSON
- `setEnabled(enabled)` - Toggle monitoring

**Enable**: Set localStorage flag `yume_perf_monitor` or access `window.perfMonitor` in dev mode

### CLAUDE.md Editor
**In-app editor** for project-specific CLAUDE.md files.

**Location**: `src/renderer/components/ClaudeMdEditor/ClaudeMdEditorModal.tsx`

**Features**:
- Auto-load project-specific CLAUDE.md from working directory
- File existence detection with create option
- Unsaved changes confirmation
- Save with status toast notification
- Keyboard shortcut: Cmd/Ctrl+S to save, ESC to close
- Token count calculation

### Timeline & Checkpoints
**Visual timeline** of conversation checkpoints for state management.

**Location**: `src/renderer/components/Timeline/TimelineNavigator.tsx`

**Features**:
- `getTimeline(sessionId)` - Load timeline data
- `restoreCheckpoint(sessionId, checkpointId)` - Jump to checkpoint
- Custom events: `checkpoint-created`, `checkpoint-restored`
- Collapse/expand UI
- Hovering and selection state
- Feature flag: `FEATURE_FLAGS.SHOW_TIMELINE`

### Analytics Dashboard
**Comprehensive usage analytics** with breakdowns by project, model, and date.

**Location**: `src/renderer/components/Analytics/AnalyticsModal.tsx`

**Metrics**:
- Total sessions, messages, tokens, cost
- Token breakdown (input, output, cache read, cache creation)
- Breakdown by model (Opus vs Sonnet)
- Breakdown by date
- Breakdown by project with last-used timestamp

**Time Ranges**: 7d, 14d, 30d, all-time

**View Modes**: All sessions vs specific project

**Requires**: Socket.IO connection to server for data retrieval

### Command Palette
**VS Code-style command palette** with fuzzy search and keyboard navigation.

**Location**: `src/renderer/components/CommandPalette/CommandPalette.tsx`
**Keyboard Shortcut**: `Cmd+P` / `Ctrl+P`

**Features**:
- 56 commands across 10 categories (tabs, panels, session, model, input, zoom, appearance, settings, menu, settings tabs)
- Fuzzy search with scoring (exact > starts with > contains > category > fuzzy)
- Submenu navigation for themes, font size, line height, opacity, plugins
- Live theme preview (can cancel with Esc to restore)
- Toggle commands with on/off state display
- Keyboard navigation (Arrow keys, Enter, Tab, Escape)
- Direct navigation to specific settings tabs
- Mouse-move detection to prevent accidental hover selection

**Key Commands**:
- `new tab` (Cmd+T) - Open new session with folder picker
- `close tab` (Cmd+W) - Close current tab
- `files panel` (Cmd+E) - Toggle files browser
- `git panel` (Cmd+G) - Toggle git changes
- `search messages` (Cmd+F) - Search in conversation
- `insert ultrathink` (Cmd+K) - Insert thinking prompt
- `session stats` (Cmd+.) - View session statistics
- `model & tools` (Cmd+O) - Open model/tools selector
- `toggle model` (Cmd+Shift+O) - Switch between opus/sonnet

### Keyboard Shortcuts
**Global shortcuts** available throughout the app.

**Tab Navigation**:
- `Ctrl+Tab` - Next tab (works regardless of input field focus)
- `Ctrl+Shift+Tab` - Previous tab
- `Cmd/Ctrl+1-9` - Jump to specific tab by number

**Panels & Modals**:
- `Cmd/Ctrl+P` - Command Palette
- `Cmd/Ctrl+E` - Files Panel
- `Cmd/Ctrl+G` - Git Panel
- `Cmd/Ctrl+S` - Session Changes Panel
- `Cmd/Ctrl+O` - Model & Tools
- `Cmd/Ctrl+.` - Session Stats

**Input**:
- `Cmd/Ctrl+K` - Insert ultrathink prompt
- `Cmd/Ctrl+L` - Clear context
- `F5` - Toggle voice dictation
- `?` - Toggle keyboard shortcuts help overlay

**Help Overlay**:
- Press `?` or `Esc` to toggle
- Formatted with dotted leaders, organized by category

### Command Autocomplete
**Intelligent slash command autocomplete** triggered by `/` in the input field.

**Location**: `src/renderer/components/CommandAutocomplete/CommandAutocomplete.tsx`
**Trigger**: Type `/` at the start of input

**Features**:
- 3 command sources: built-in, custom (user-defined), plugin commands
- Fuzzy filtering with starts-with matching
- Plugin badges showing command origin
- Full plugin prefix preservation (e.g., `yume--commit`)
- Invalid command blocking (won't submit unmatched commands)

**Built-in Commands**:
- `/clear` - Clear context (local action)
- `/model` - Select model & tools (local action)
- `/title` - Set tab title (local action)
- `/init` - Create/update CLAUDE.md (sends to Claude)
- `/compact` - Compress context (sends to Claude)

**Navigation**:
- Arrow up/down to select
- Tab to fill command
- Enter to send command
- Escape to close

### File Mention Autocomplete
**Intelligent file picker** with fuzzy search and folder navigation.

**Location**: `src/renderer/components/MentionAutocomplete/MentionAutocomplete.tsx`
**Trigger**: Type `@` in the input field

**Features**:
- Fuzzy matching by file name
- Path-based navigation (e.g., `@src/components/`)
- Folder expansion with arrow right
- File icons based on type (folder, code, test, config, docs)
- Sorted: folders first, then configs, then alphabetical

**Special Collections**:
- `@r` - Recently edited files (10 most recent)
- `@m` - Git modified files (only if git repo)

**Navigation**:
- Arrow up/down to select
- Arrow left to go back to parent folder
- Arrow right to expand folders or select files
- Tab/Enter to insert file path
- Backspace at `@` removes autocomplete
- Escape to close

### Files/Git Panel
**Unified panel** with three tabs for browsing project files, git changes, and session changes.

**Files Tab** (Cmd+E):
- Tree view of project files
- File preview with syntax highlighting
- Diff viewer for modified files
- Click file to show preview, click again to insert as @mention
- Edit CLAUDE.md button in header

**Git Tab** (Cmd+G):
- Shows modified, added, deleted files with icons
- Line count statistics (additions/deletions)
- Diff viewer for git changes
- Auto-refresh every 30s when panel is open
- Only shows when working directory is a git repo
- **Git count badge** on tab button showing total changed files (modified + added + deleted)

**Session Changes Tab** (Cmd+S):
- Shows files modified during current session (aggregated from restore points)
- Status indicators: A (added), D (deleted), M (modified), W (write)
- Line change statistics badge: `+added -removed`
- Click file to view inline diff (before/after comparison)
- Tab disabled when no session changes exist
- Files sorted alphabetically with color-coded status

**Rollback Panel**:
- History navigation view
- Click messages to rollback conversation state
- Shows all user/assistant message pairs

### Session Stats Modal
**Detailed session statistics** with context usage visualization.

**Keyboard Shortcut**: `Cmd+.`

**Features**:
- **Context Usage**: Current tokens / 200k, percentage bar with 10% ticks
- **Token Breakdown**: Actual (in/out), Cache (read/new)
- **Session Metrics**: Message count, tool use count, Opus %, total cost
- **Claude Rate Limits** (Claude provider only):
  - 5-hour limit with reset timer and utilization %
  - 7-day limit with reset timer and utilization %
  - Visual bars with 20-min/1-day tick marks
  - Warning color when >90% utilized
- **Provider Awareness**: Shows "rate limits not available for {provider}" for Gemini/OpenAI

### Model & Tools Modal
**Modal for selecting models and enabling/disabling tools**.

**Keyboard Shortcut**: `Cmd+O`

**Features**:
- Provider grouping (Claude, Gemini, OpenAI) with collapse support
- Only shows enabled providers (filtered by feature flags)
- Provider lock when session has messages
- **Tool Management**:
  - 6 categories: File Read, File Write, Web, Terminal, Other, Agents
  - Click category label to toggle all tools in category
  - "all/none" toggle for global enable/disable
  - Individual tool buttons with descriptions on hover

**Keyboard Navigation**:
- Arrow keys for model selection (left/right)
- Tab/Shift+Tab for sequential navigation
- Arrow up/down for tool grid navigation
- Enter/Space to select
- Escape to close

### Stream Indicator
**Real-time activity indicator** showing Claude's current state.

**States**:
- **Thinking**: Red spinner, shows elapsed time
- **Bash Running**: Negative color, with stop button, shows elapsed time
- **Compacting**: Positive color, shows elapsed time
- **Queued Followup**: Shows pending message after current action
- **Pending Auto-Compact**: Shows message that will be sent after compaction

### Welcome Screen
**Landing screen** when no sessions are open.

**Features**:
- Large "+" button to create new session (with ripple effect)
- Recent projects dropdown (shows count)
- Quick navigation: Press 1/2/3 to open first 3 recent projects
- Model selector in toolbar
- Version badge with demo/pro indicator (click to upgrade)
- Context usage stats button with auto-compact toggle
- Command palette button

### Configuration Files
**Location**: `src/renderer/config/`

**themes.ts** (12 built-in themes):
- yume (violet), void (gray-blue), cobalt (night owl), slate (atom one), arctic (iceberg), synth (synthwave)
- mint, grove (everforest), ochre (gruvbox), bourbon (zenburn), burnt (coral), rose (dracula)

**features.ts** (7 feature flags):
- `USE_VIRTUALIZATION`: true
- `ENABLE_CHECKPOINTS`: true
- `SHOW_TIMELINE`: true
- `ENABLE_AGENT_EXECUTION`: true
- `USE_NATIVE_RUST`: false (never enable)
- `PROVIDER_GEMINI_AVAILABLE`: false
- `PROVIDER_OPENAI_AVAILABLE`: false

**performance.ts** (40+ tuning parameters):
- `VIRTUALIZATION_THRESHOLD`: 50 messages
- `VIRTUAL_OVERSCAN`: 25 items
- `MAX_MESSAGES_IN_MEMORY`: 2000
- `AUTO_SAVE_INTERVAL`: 30s
- `ANIMATION_DURATION`: 100ms (snappy UI)

**tools.ts** (16 Claude CLI tools):
- Categories: file-read (3), file-write (3), terminal (2), web (2), agents (2), mcp (1), other (3)
- MCP: One toggle per server (e.g., `mcp__memory` expands to 7 actual tools via `expandMcpTools()`)
- MCP Memory tools: `create_entities`, `create_relations`, `add_observations`, `delete_entities`, `search_nodes`, `open_nodes`, `read_graph`
- All enabled by default
- Dangerous tools: Write, Edit, NotebookEdit, Bash

**app.ts** (app-level constants):
- `APP_NAME`, `APP_VERSION`, `APP_ID`, `AGENT_PREFIX`, `PLUGIN_ID`
- Helper functions: `appStorageKey()`, `appEventName()`

### Projects Modal
**Comprehensive project and session browser** with advanced navigation features.

**Location**: `src/renderer/components/ProjectsModal/ProjectsModal.tsx`

**Features**:
- **Infinite scroll pagination**: 20 projects / 10 sessions per page
- **Server-side streaming (SSE)**: Progressive session loading with real-time updates
- **Dual-view navigation**: Projects list → Sessions view with back navigation
- **Context menu**: Right-click for actions (new session, browse, delete, fork)
- **Search**: Ctrl/Cmd+F for filtering projects and sessions
- **Session count badges**: Pre-calculated server-side for fast display
- **Git changes count**: Shows modified file count per project
- **Session title persistence**: Custom titles stored in localStorage
- **Time-based sorting**: Most recent first

**Server Endpoints**:
- `/claude-projects-quick` - Initial project list with pagination
- `/claude-project-sessions/{path}` - SSE stream for session loading

**Keyboard Navigation**:
- Arrow up/down to navigate list
- Enter to select project/session
- Backspace to go back to projects
- Home/End for first/last item
- Delete to remove session
- Escape to close

### Confirm Modal
**Reusable confirmation dialog** for destructive actions.

**Location**: `src/renderer/components/ConfirmModal/ConfirmModal.tsx`

**Features**:
- Keyboard shortcuts: Enter to confirm, Escape to cancel
- Danger mode with red styling for destructive actions
- Customizable title, message, and button labels
- 100ms debounce to prevent accidental double-clicks
- Event capture phase to prevent streaming interruption

### Additional UI Features

**Recent Conversations Modal** (`RecentConversationsModal.tsx`):
- Server endpoint: `http://localhost:{port}/claude-recent-conversations`
- Filtering by project (workingDirectory parameter)
- Keyboard navigation (arrow keys, Enter, ESC)
- Metadata: ID, title, summary, projectPath, messageCount, filePath

**Recent Projects Modal** (`RecentProjectsModal.tsx`):
- Storage: localStorage `yume-recent-projects`
- Track last opened timestamp and access count
- Sort by most recent first
- Remove individual projects or clear all

**Context Bar** (`Chat/ContextBar.tsx`):
- Visual representation of context usage
- Token counting with cache awareness
- Warning thresholds (55%, 60%, 65%)
- **Provider-aware rate limits**: 5h/7d limit bars only shown for Claude provider
- Stats modal shows "claude 5h/7d" labels or "rate limits not available for {provider}" for Gemini/OpenAI
- **Button visibility customization**: Right-click context bar to toggle button visibility
  - Customizable: Command Palette, Dictation, Files Panel, History buttons
  - Persisted in localStorage (`yume_context-bar-visibility`)
  - Context menu shows checkmarks for visible buttons
- **Line changes badge**: Shows `+added -removed` lines on files button

**Diff Viewer** (`DiffViewer.tsx`):
- Line-by-line file diffs
- Context lines preservation
- Line numbering and hunk-based organization
- `generateDiff()` helper function

**Window Controls** (`WindowControls.tsx`):
- Adaptive menu (expands in right 1/3 on macOS, left 1/3 on Windows/Linux)
- Menu items: Settings, Help, Projects, Agents, Analytics
- Window buttons: Minimize, Maximize, Close (frameless window)
- Tab drag detection with menu hide

**Voice Dictation** (`ClaudeChat.tsx:1041`):
- Native speech-to-text using Web Speech API
- Toggle with F5 key or mic button in input bar
- Continuous recognition mode with real-time transcription
- Visual indicator (pulsing mic) when active
- Preserves existing input text

**Toast Notification System** (`services/toastService.ts`, `components/Toast/`):
- Global singleton service for app-wide notifications
- Positioned 64px from top, centered horizontally
- Single toast at a time, no stacking
- 3 types: `success` (green), `error` (red), `info` (accent color)
- Default duration: 2000ms (2 seconds)
- API: `toastService.success(msg)`, `toastService.error(msg)`, `toastService.info(msg)`, `toastService.dismiss()`
- Used for: session operations, dictation toggle, context clearing, compaction, interruptions

**Message Rollback** (History Panel):
- Visual message history with undo capability
- Roll back to any previous message state
- Branching conversation support
- Accessible via history button in context bar

**Focus Preservation System** (`main.tsx`, `App.minimal.tsx`):
- Non-aggressive focus restoration (only restores if textarea was focused before modal)
- Window focus change detection via Tauri events (`window-focus-change`)
- Tracks `textareaFocusedOnBlur` state to prevent focus fighting
- macOS-specific WKWebView settling delay (50ms)
- Skips restoration when modals are open or other inputs are focused
- Functions: `saveFocusState()`, `restoreFocusToChat()`

### Configuration Options

**UI Toggles** (in `claudeCodeStore.ts`):
- `showProjectsMenu` - Show projects button
- `showAgentsMenu` - Show agents button
- `showAnalyticsMenu` - Show analytics button
- `showCommandsSettings` - Show commands tab in settings
- `showMcpSettings` - Show MCP tab
- `showHooksSettings` - Show hooks tab
- `showPluginsSettings` - Show plugins tab
- `showSkillsSettings` - Show skills tab
- `rememberTabs` - Persist tabs on startup
- `autoGenerateTitle` - Auto-generate session titles
- `wordWrap` - Wrap all chat content (code, console output, etc.)
- `soundOnComplete` - Play sound when Claude finishes
- `showResultStats` - Show token/cost stats after responses
- `backgroundOpacity` - Window transparency (50-100%)
- `monoFont` - Monospace font selection
- `sansFont` - Sans-serif font selection
- `globalWatermarkImage` - Global watermark for all sessions
- `contextBarVisibility` - Context bar button visibility (persisted separately)

**Feature Flags** (`config/features.ts`):
- `USE_VIRTUALIZATION` - Message virtualization (enabled)
- `ENABLE_CHECKPOINTS` - Checkpoint system (enabled)
- `SHOW_TIMELINE` - Timeline UI visibility (enabled)
- `ENABLE_AGENT_EXECUTION` - Agent execution feature (enabled)
- `USE_NATIVE_RUST` - Experimental native Rust execution (disabled)
- `PROVIDER_GEMINI_AVAILABLE` - Enable Gemini provider (disabled by default)
- `PROVIDER_OPENAI_AVAILABLE` - Enable OpenAI/Codex provider (disabled by default)

**Provider Configuration** (`config/models.ts`):
- `ProviderType`: `'claude' | 'gemini' | 'openai'`
- `PROVIDERS[]` - Provider definitions with CLI commands and auth info
- `ALL_MODELS[]` - All models across providers (order: claude, openai, gemini)
- `getProviderForModel(modelId)` - Get provider for a model ID
- `getModelsForProvider(provider)` - Get models for a provider
- Sessions lock to their initial provider - switching providers forks the session

**Model Properties**:
- `contextWindow`: 200k tokens (Claude/OpenAI), 1M tokens (Gemini)
- `maxOutput`: 8192 (Claude/Gemini), 100k (OpenAI)
- `supportsThinking`: Opus, Sonnet, Gemini Pro, Codex 5.2
- `reasoningEffort`: OpenAI only ('low' for mini, 'xhigh' for 5.2)

### File Operations
**Safe file management** with conflict detection.

**Tauri Commands**:
- `read_file_content(path)` - Read file with content
- `write_file_content(path, content)` - Write file content
- `atomic_file_delete(path)` - Safe deletion with restore support
- `atomic_file_restore(path)` - Restore deleted files
- `delete_file(path)` - Delete file
- `get_file_mtime(path)` - Get file modification time
- `check_file_conflicts(paths)` - Check for edit conflicts
- `register_file_edit(filePath, editType)` - Track file edits

**File Search Service** (`fileSearchService.ts`):
- `searchFiles(query, workingDirectory, options)` - Fuzzy/glob pattern search
- `getRecentFiles(workingDirectory, limit)` - Recently modified files
- `getFolderContents(folderPath, maxResults)` - Directory listing
- `getGitChangedFiles(workingDirectory)` - Git status integration
- Search types: Fuzzy matching, glob patterns, substring matching
- Relevance sorting (exact match > starts with > path length)
- 5-second TTL cache to prevent excessive searches

## Quick Start Guides

### Using Plugins

**Installing a Plugin**:
1. Obtain plugin source (directory with `.claude-plugin/plugin.json`)
2. Open Settings → Plugins tab
3. Click "Install from Folder"
4. Select plugin directory
5. Enable the plugin to activate its components

**Creating a Custom Plugin**:
```
my-plugin/
  .claude-plugin/
    plugin.json        # Plugin metadata
  commands/
    mycommand.md       # Custom slash command
  agents/
    myagent.md         # Custom agent with YAML frontmatter
  hooks/
    prehook.md         # Hook definition (.md file)
  skills/
    myskill.md         # Skill definition (.md with YAML frontmatter)
  .mcp.json            # MCP server config (optional, at root)
```

**Example .claude-plugin/plugin.json**:
```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "author": "Your Name",
  "description": "Plugin description",
  "components": ["commands", "agents", "hooks", "skills", "mcp"]
}
```

### Using Skills

**Creating a Custom Skill**:
1. Open Settings → Skills tab
2. Click "Create Skill"
3. Define triggers (file extensions, keywords, regex)
4. Write context/knowledge to inject
5. Enable the skill

**Example Skill**:
- **Name**: React Best Practices
- **Triggers**: `*.tsx`, `*.jsx`, `react`, `/^import.*from ['"]react['"]/`
- **Content**: "When working with React, prefer functional components with hooks. Use TypeScript for type safety..."

### Using Performance Monitor

**Enable Monitoring**:
```javascript
// In browser console or app
localStorage.setItem('yume_perf_monitor', 'true');
// Reload app

// Access via window
window.perfMonitor.getMetricsSummary();
window.perfMonitor.exportMetrics();
```

**View Metrics**:
- FPS tracking (real-time in dev tools)
- Memory usage warnings in console
- Export metrics as JSON for analysis

### Using Analytics Dashboard

**Access Analytics**:
1. Click Analytics button in window controls (top bar)
2. Select time range (7d, 14d, 30d, all-time)
3. Filter by project (optional)
4. View breakdowns by model, date, project
5. Export data as CSV/JSON

**Metrics Available**:
- Total tokens (input, output, cache read, cache creation)
- Cost tracking per model
- Session count per project
- Daily usage trends

### Using Background Agents

**Queue an Agent**:
1. Open Command Palette (Cmd+P)
2. Search for "queue agent" or use programmatic API
3. Select agent type (Architect, Explorer, Implementer, Guardian, Specialist)
4. Enter prompt/task description
5. Optionally enable git branch isolation

**Monitor Progress**:
- View agent queue panel (sliding panel on right)
- See real-time progress: turn count, current action, tokens used
- Agents show status: Queued, Running, Completed, Failed, Cancelled

**Review Agent Work**:
1. Click completed agent to expand
2. View output file contents
3. If git branch enabled, review diff vs main
4. Merge changes or discard

**Git Branch Workflow**:
- Agents can work in isolated branches: `yume-async-{type}-{id}`
- Review changes before merging: `get_agent_branch_diff`
- Check for conflicts: `check_agent_merge_conflicts`
- Merge when ready: `merge_agent_branch` (auto-deletes branch)

### Using Memory System

**Enable Memory**:
1. Open Settings → General tab
2. Enable "Memory System" toggle
3. Server auto-starts on next app launch

**How It Works**:
- Memory is stored in `~/.yume/memory.jsonl`
- Knowledge graph with entities, relations, observations
- Auto-learns from conversations (errors, patterns, decisions)

**Manual Memory Operations**:
```javascript
// Store a fact about current project
await memoryService.remember('/path/to/project', 'Prefers functional components', 'preference');

// Store a coding pattern
await memoryService.rememberPattern('Error Handling', 'Always use try-catch with specific error types');

// Store error/solution pair
await memoryService.rememberErrorFix('Module not found', 'Check import paths and tsconfig paths');

// Search memories
const { entities, relations } = await memoryService.searchNodes('react patterns');

// Get relevant memories for prompt injection
const context = await memoryService.getRelevantMemories('How should I handle errors?');
```

**View Memory Data**:
- File location: `~/.yume/memory.jsonl`
- Format: JSONL with entities and relations
- Can be edited manually if needed

### Using Timeline & Checkpoints

**Create Checkpoint**:
- Manual: Click checkpoint button in UI
- Auto: Created every N messages (configurable)
- Pre-compaction: Auto-saved before context compaction

**Restore from Checkpoint**:
1. Open timeline view
2. Hover over checkpoint to preview
3. Click to restore conversation state
4. Confirm restoration

**Use Cases**:
- Save state before refactoring
- Branch to explore alternative approaches
- Undo unwanted conversation turns
- Mark project milestones

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
- Enable debug console: `localStorage.setItem('yume_debug_mode', 'true')`
- Enable performance monitoring: `localStorage.setItem('yume_perf_monitor', 'true')`

## Best Practices

### Plugin Development

**Plugin Structure**:
- Use semantic versioning (1.0.0, 1.1.0, 2.0.0)
- Include comprehensive `plugin.json` with author and description
- Test components individually before packaging
- Document plugin functionality in README
- Use meaningful component names (avoid generic names like "command1")

**Component Guidelines**:
- **Commands**: Use clear, action-oriented names (`/review-code`, not `/rc`)
- **Agents**: Provide specific, focused system prompts (avoid overly broad agents)
- **Hooks**: Keep hook scripts lightweight (<5s execution time)
- **Skills**: Use specific triggers (avoid overly broad patterns that match everything)
- **MCP**: Test server connectivity before distribution

### Skills System

**Trigger Design**:
- Be specific: `*.tsx` better than `*`
- Combine triggers with OR logic: `["*.py", "python", "/def /"]`
- Test regex patterns before deploying: Use regex testers
- Avoid overlapping skills (multiple skills with same triggers)

**Content Guidelines**:
- Keep injected content concise (<500 words)
- Focus on essential context/knowledge
- Use markdown formatting for readability
- Include examples where helpful
- Update content as practices evolve

### Performance Optimization

**Message Virtualization**:
- Enabled automatically for sessions with >50 messages
- Configure threshold in `config/performance.ts`
- Overscan value (25 items) balances smooth scrolling vs memory

**Memory Management**:
- Auto-cleanup runs every 5 minutes
- Max messages per session: 1000 (configurable)
- Cache size limit: 100MB (configurable)
- Monitor heap usage via performance monitor

**Context Compaction**:
- Warning at 55% context usage
- Auto-trigger at 60% (saves 38% buffer like Claude Code)
- Force-trigger at 65%
- Review compaction manifests to preserve important context

**Store Optimizations** (`claudeCodeStore.ts`):
- Debounced storage writes (100ms) - prevents UI freezes when toggling settings
- Flush on app close prevents data loss
- Streaming end debounce (1.5s) - prevents premature state changes
- Subagent tracking prevents streaming end while subagents active
- Message hash caching (WeakMap) - fast deduplication using signatures
- Avoids expensive JSON.stringify comparisons

### Security

**License Keys**:
- Stored encrypted in localStorage using XOR cipher
- Server-side validation prevents tampering
- Auto-revalidation every 30 minutes
- Never commit license keys to version control

**Hooks Security**:
- Review hook scripts before enabling
- Avoid executing untrusted code
- Use timeout limits (default 5s) to prevent hanging
- Test hooks in isolated environment first

**Plugin Security**:
- Review plugin source before installation
- Only install plugins from trusted sources
- Check component counts match expectations
- Disable suspicious plugins immediately

## Troubleshooting

### Common Issues

**Plugin Won't Install**:
- Verify `plugin.json` exists and is valid JSON
- Check plugin ID doesn't conflict with existing plugin
- Ensure plugin directory structure is correct
- Review console for validation errors

**Skill Not Triggering**:
- Verify skill is enabled in Settings → Skills
- Check trigger patterns match your files/content
- Test regex patterns for syntax errors
- Review console for skill evaluation logs

**Performance Issues**:
- Enable performance monitor to identify bottlenecks
- Check memory usage (warn at 100MB, critical at 200MB)
- Reduce message history via compaction
- Disable unused plugins to reduce overhead
- Clear browser cache and restart app

**License Validation Fails**:
- Check internet connection (requires online validation)
- Verify license key format (XXXXX-XXXXX-XXXXX-XXXXX-XXXXX)
- Wait for validation retry (auto-retries every 30 min)
- Contact support if persistent failures

**Compaction Not Working**:
- Verify context usage above threshold (60% for auto)
- Check compaction config in Settings
- Review session file exists in `~/.claude/projects/`
- Ensure sufficient disk space for manifest generation

**Analytics Not Loading**:
- Verify server connection (check port in Settings)
- Check database file exists at documented path
- Review server logs for database errors
- Try clearing analytics cache and refreshing

### Debug Commands

**Enable Debug Mode**:
```javascript
localStorage.setItem('yume_debug_mode', 'true');
```

**Enable Performance Monitoring**:
```javascript
localStorage.setItem('yume_perf_monitor', 'true');
window.perfMonitor.getMetricsSummary();
```

**Clear Plugin Cache**:
```javascript
localStorage.removeItem('yume_plugins');
// Restart app
```

**Clear Skill Cache**:
```javascript
localStorage.removeItem('yume_custom_skills');
// Restart app
```

**Export Performance Metrics**:
```javascript
const metrics = window.perfMonitor.exportMetrics();
console.log(JSON.stringify(metrics, null, 2));
```

## Build Output Locations

After running build commands:
- macOS ARM64: `src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/`
- macOS Universal: `src-tauri/target/universal-apple-darwin/release/bundle/dmg/`
- Windows: `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/`
  - MSI: `msi/yume_[version]_x64_en-US.msi`
  - NSIS: `nsis/yume_[version]_x64-setup.exe`
- Linux: `src-tauri/target/x86_64-unknown-linux-gnu/release/bundle/`

## Known Issues & Incomplete Features

### Multi-Provider Integration (Gemini/Codex)
**Status**: COMPLETE - Code ready, disabled in production via feature flags
- **yume-cli bundled**: Shell wrappers + unified binaries for macOS (arm64/x64)
- **Feature flags**: `PROVIDER_GEMINI_AVAILABLE` and `PROVIDER_OPENAI_AVAILABLE` set to `false` by default
- **Tool call delta assembly**: Implemented in `agent-loop.ts:252-275`
- **Provider lock-in**: Sessions lock to initial provider, switching forks session (by design)
- **History format mismatch**: yume-cli uses JSON in `~/.yume/sessions/`, Claude uses JSONL in `~/.claude/projects/`
- **No mid-conversation switching**: Must fork session to change providers (by design)

### Skills System
**Status**: COMPLETE
- Tabbed modal with General, Triggers, and Content tabs
- TriggerEditor for extensions/keywords/regex patterns
- ContentEditor with markdown preview
- ReDoS validation for regex patterns
- Full CRUD operations via Rust commands

### Checkpoint System
**Status**: ENABLED (feature flag true, but socket listeners disabled)
- `checkpointService.ts` has socket listeners disabled (line 54-118)
- Feature flag `ENABLE_CHECKPOINTS` is true but socket events not handled
- UI visible but functionality limited

### Component Architecture Issues
- **ClaudeChat.tsx** - Large but manageable monolith
- **MessageRenderer.tsx** - Large but manageable
- **claudeCodeStore.ts** - Monolith, consider splitting
- **Unified binary only on macOS** - Windows/Linux binaries not yet built

### Hook Event Naming
- Rust defines 9 events (PascalCase): UserPromptSubmit, PreToolUse, PostToolUse, AssistantResponse, SessionStart, SessionEnd, ContextWarning, CompactionTrigger, Error
- TypeScript defines 8 events (snake_case): user_prompt_submit, pre_tool_use, post_tool_use, assistant_response, session_start, session_end, context_warning, error
- Mismatch: Rust has `CompactionTrigger` not exposed to TypeScript

### Build System
- **dist-server cleanup needed**: 965MB with test/intermediate builds
- **Windows/Linux binaries**: Build scripts exist but binaries not yet compiled
- Binary naming convention migrated to `yume-bin-*` (unified) and `yume-cli-*` (wrapper)

### Unified Conversation Format (UCF)
**Provider-agnostic type system** for multi-provider conversation portability.

**Location**: `src/renderer/types/ucf.ts`

**Key Interfaces**:
- `UnifiedConversation` - Provider-agnostic session format
- `ConversationTranslator` - Import/export between providers
- `SwitchAnalysis` - Pre-flight checks before provider switch
- `PreparedConversation` - Ready-to-send provider-specific format

**Content Types** (7 types):
- text, thinking, code, image, artifact, error, file

**Features**:
- Tool translation with status tracking and results
- Provider switching analysis with warnings
- History translation: Claude JSONL ↔ Gemini ↔ OpenAI formats
- Per-provider token/cost usage breakdowns
- Core tools (15 tools) and Claude-only tools (LSP, Task) constants

### Line Changes Tracking
**Session-level tracking** of code changes with line-by-line statistics.

**Storage**: `currentSession?.lineChanges` in claudeCodeStore

**Tracked Operations**:
- Edit operations: Captures old_string → new_string, calculates removed vs added lines
- Write operations: Tracks new content line counts

**UI Integration**:
- **Context Bar**: Files button shows badge with `+added -removed` lines
- **Files Panel**: Session Changes tab badge displays line change summary
- **Session Tab**: Enables/disables Session Changes tab based on changes
- Reset to `{ added: 0, removed: 0 }` on new session creation

**Data Source**: Aggregated from `session.restorePoints` for historical changes

## Competitive Analysis (January 2026)

### Market Landscape

| Tool | Type | Pricing | Valuation/Status | Key Strength |
|------|------|---------|------------------|--------------|
| **Cursor** | Full IDE (VS Code fork) | $20-200/mo | $29B, $1B ARR | Background agents, BugBot PR review |
| **Windsurf** | Full IDE | $15-60/mo | Acquired by OpenAI $3B | Cascade agent, SWE-1 models |
| **GitHub Copilot** | IDE Extension | $10-39/mo | Microsoft | Ecosystem integration, agent mode |
| **Continue.dev** | Open Source Extension | Free/$10 teams | 26k GitHub stars | Model-agnostic, 100% air-gapped |
| **Aider** | Terminal CLI | Free (BYOK) | Open source | Deep git integration, architect mode |
| **Zed** | Rust IDE | Free/$10 pro | $32M funding | 10x startup speed, ACP protocol |
| **Sourcegraph Cody** | Enterprise | $59/user/mo | Enterprise only now | Multi-repo context, codebase indexing |
| **Yume** | Claude CLI GUI | $21 one-time | Independent | Multi-provider, plugin system, 5 agents |

### Yume's Competitive Advantages

**Unique Features (competitors lack):**
1. **Multi-Provider CLI Shim** - Transparent Claude/Gemini/OpenAI support via unified interface
2. **Background Agents with Git Isolation** - 4 concurrent agents with automatic branch management
3. **Persistent Memory System** - Knowledge graph via MCP server (auto-learns patterns)
4. **5 Specialized Core Agents** - Architect/Explorer/Implementer/Guardian/Specialist workflow
5. **Plugin System with 5 Components** - Commands/Agents/Hooks/Skills/MCP in single framework
6. **Skills with ReDoS Protection** - Safe regex-based context injection
7. **Unified Conversation Format (UCF)** - Provider-agnostic conversation portability
8. **Voice Dictation** - Native Web Speech API integration
9. **Line Changes Tracking** - Per-session code modification statistics
10. **One-Time Pricing** - $21 vs $20-200/month subscriptions

**Strong Features (competitive parity):**
- Analytics dashboard with project/model/date breakdowns
- Timeline & checkpoints for conversation branching
- Performance monitoring with FPS/memory/metrics export
- CLAUDE.md in-app editor
- 12 built-in themes with OLED support
- Context compaction with intelligent thresholds

### Next Features to Implement

**RECENTLY COMPLETED (January 2026):**
1. **Background/Async Agents** - FULLY DOCUMENTED
   - `background_agents.rs` - Agent queue manager (MAX_CONCURRENT=4, 10min timeout)
   - `git_manager.rs` - Git branch operations for isolated agent work
   - `commands/background_agents.rs` - 13 Tauri commands for agent lifecycle
   - yume-cli extended with `--async`, `--output-file`, `--git-branch` flags
   - `AgentQueuePanel.tsx` - Sliding panel UI with agent cards
   - `ProgressIndicator.tsx` - Real-time progress display
   - `backgroundAgentService.ts` - Event-driven service with Tauri listeners
2. **Memory MCP Server System** - FULLY DOCUMENTED
   - `commands/memory.rs` - 10 Tauri commands for MCP memory server
   - `memoryService.ts` - Frontend service with auto-learning from conversations
   - Storage: `~/.yume/memory.jsonl` (persistent knowledge graph)
3. **Skills UI Completion** - FULLY DOCUMENTED
   - `TriggerEditor.tsx` - Tag-based trigger config (extensions, keywords, regex)
   - `ContentEditor.tsx` - Markdown editor with preview toggle
   - `regexValidator.ts` - ReDoS detection utility
   - `types/skill.ts` - Enhanced types with YAML frontmatter parsing
   - YAML frontmatter sync for skill files

### Future Feature Gaps

**HIGH PRIORITY:**
- **Automated PR Review** - BugBot equivalent: catch bugs before merge
- **Inline Code Suggestions** - Autocomplete beyond @mentions and /commands

**MEDIUM PRIORITY:**
- **Git Commit/Push UI** - Currently view-only (status/diff)
- **Code Navigation** - Go-to-definition, find references (beyond LSP tools)

**LOWER PRIORITY:**
- **Windows/Linux Unified Binaries** - Build scripts exist, need compilation
- **Checkpoint System Activation** - Socket listeners disabled, feature flag true

### Technology Trends to Monitor

**Multi-Agent Systems** (Gartner: 1,445% inquiry surge):
- Cursor: Up to 8 parallel agents, multi-agent judging
- Yume: 5 specialized agents (needs parallel execution)

**Protocol Standardization**:
- MCP (Model Context Protocol): Yume supports via plugins
- ACP (Agent Client Protocol): Zed's open standard, JetBrains adopting
- A2A (Agent-to-Agent): Cross-vendor agent communication

**Local Models** (Privacy trend):
- Continue.dev: Full Ollama support
- Zed: Zeta local model (200ms p50 latency)
- Yume: Consider local model support via yume-cli

**Security Concerns** (45% AI code has flaws):
- Automated code review before commit
- Hallucination detection for dependencies
- Shadow AI detection for enterprise

### Pricing Strategy Analysis

| Competitor | Monthly | Annual | Yume Advantage |
|------------|---------|--------|----------------|
| Cursor Pro | $20 | $240 | 91% savings |
| Windsurf Pro | $15 | $180 | 88% savings |
| Copilot Pro | $10 | $100 | 79% savings |
| Copilot Pro+ | $39 | $468 | 96% savings |
| **Yume Pro** | - | **$21 once** | **Lifetime access** |

Yume's one-time pricing is significant competitive advantage as competitors move to credit-based models with unpredictable costs.

