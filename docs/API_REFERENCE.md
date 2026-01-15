# Yume API Reference

**Version:** 0.1.0
**Last Updated:** January 15, 2026

## Table of Contents

1. [Tauri Commands API](#tauri-commands-api)
   - [Session Management](#session-management)
   - [Window Management](#window-management)
   - [Claude Binary Detection](#claude-binary-detection)
   - [Settings Management](#settings-management)
   - [Project Management](#project-management)
   - [File Operations](#file-operations)
   - [Bash Execution](#bash-execution)
   - [System Commands](#system-commands)
   - [Database Operations](#database-operations)
   - [Hook Operations](#hook-operations)
   - [Compaction Operations](#compaction-operations)
   - [MCP Operations](#mcp-operations)
   - [Agent Management](#agent-management-in-memory)
   - [Claude Agents](#claude-agents-file-based)
   - [Yume Agents Sync](#yume-agents-sync)
   - [Custom Commands](#custom-commands)
   - [VSCode Extension Management](#vscode-extension-management)
   - [App Instance Management](#app-instance-management)
2. [Tauri Events API](#tauri-events-api)
3. [Frontend Services API](#frontend-services-api)
4. [Store API](#store-api)
5. [Hook System API](#hook-system-api)
6. [Database API](#database-api)
7. [MCP Protocol API](#mcp-protocol-api)
8. [Type Definitions](#type-definitions)

---

## Tauri Commands API

Tauri commands are invoked from the frontend using the `invoke` function from `@tauri-apps/api/core`. All commands return Promises.

### Session Management

#### `spawn_claude_session`
Spawns a new Claude session with the given options.

```typescript
invoke('spawn_claude_session', {
  request: {
    project_path: string,
    model: string,
    prompt: string,
    resume_session_id?: string | null
  }
}) => Promise<SpawnSessionResponse>
```

**Returns:**
```typescript
interface SpawnSessionResponse {
  session_id: string;
  run_id: number;  // i64 from Rust
  pid: number;     // u32 from Rust
  resumed: boolean;
}
```

#### `send_claude_message`
Sends a message to a Claude session by spawning a new process with --resume.

```typescript
invoke('send_claude_message', {
  request: {
    session_id: string,
    message: string
  }
}) => Promise<void>
```

#### `resume_claude_session`
Resumes an existing Claude session.

```typescript
invoke('resume_claude_session', {
  request: {
    session_id: string,
    project_path: string,
    model: string,
    prompt?: string | null
  }
}) => Promise<SpawnSessionResponse>
```

#### `interrupt_claude_session`
Interrupts an active Claude session (equivalent to Ctrl+C).

```typescript
invoke('interrupt_claude_session', {
  sessionId: string
}) => Promise<void>
```

#### `clear_claude_context`
Clears the context for a Claude session (ends the session).

```typescript
invoke('clear_claude_context', {
  sessionId: string
}) => Promise<void>
```

#### `get_session_info`
Gets information about a specific Claude session.

```typescript
invoke('get_session_info', {
  sessionId: string
}) => Promise<SessionInfoResponse>
```

**Returns:**
```typescript
interface SessionInfoResponse {
  session_id: string;
  project_path: string;
  model: string;
  streaming: boolean;
  run_id?: number | null;  // i64 from Rust
}
```

#### `get_token_stats`
Gets token statistics for a Claude session.

```typescript
invoke('get_token_stats', {
  sessionId: string
}) => Promise<TokenStatsResponse>
```

**Returns:**
```typescript
interface TokenStatsResponse {
  input_tokens: number;   // usize from Rust
  output_tokens: number;  // usize from Rust
  cache_creation_tokens: number;
  cache_read_tokens: number;
  total_tokens: number;
}
```

#### `list_active_sessions`
Lists all active Claude sessions.

```typescript
invoke('list_active_sessions') => Promise<ActiveSessionsResponse>
```

**Returns:**
```typescript
interface ActiveSessionsResponse {
  sessions: SessionInfoResponse[];
}
```

#### `get_session_output`
Gets the buffered output for a specific Claude session.

```typescript
invoke('get_session_output', {
  sessionId: string
}) => Promise<string>
```

#### `get_sessions` (Legacy)
Returns information about all active sessions. Legacy command maintained for compatibility.

```typescript
invoke('get_sessions') => Promise<SessionInfo[]>
```

**Returns:**
```typescript
interface SessionInfo {
  id: string;
  working_dir: string;
  model: string;
  message_count: number;
  token_count: number;
}
```

#### `send_message` (Legacy)
Placeholder command for legacy compatibility. Actual implementation uses `send_claude_message`.

```typescript
invoke('send_message', {
  sessionId: string,
  message: string,
  workingDir: string,
  model: string
}) => Promise<void>
```

#### `interrupt_session` (Legacy)
Placeholder command for legacy compatibility. Use `interrupt_claude_session` instead.

```typescript
invoke('interrupt_session', {
  sessionId: string
}) => Promise<void>
```

#### `clear_session` (Legacy)
Placeholder command for legacy compatibility. Use `clear_claude_context` instead.

```typescript
invoke('clear_session', {
  sessionId: string
}) => Promise<void>
```

### Window Management

#### `toggle_devtools`
Toggles the Chrome DevTools window (debug builds only). Triggered by F12 key in the frontend.

```typescript
invoke('toggle_devtools') => Promise<void>
```

#### `select_folder`
Opens a native folder selection dialog using Tauri's dialog plugin.

```typescript
invoke('select_folder') => Promise<string | null>
```

#### `new_window`
Creates a new application window with unique ID for multi-window support.

```typescript
invoke('new_window') => Promise<void>
```

#### `minimize_window`
Minimizes the application window to the taskbar/dock.

```typescript
invoke('minimize_window') => Promise<void>
```

#### `maximize_window`
Toggles window maximization state. If maximized, restores to previous size.

```typescript
invoke('maximize_window') => Promise<void>
```

#### `close_window`
Closes the current window. Server cleanup happens when last window closes.

```typescript
invoke('close_window') => Promise<void>
```

#### `set_zoom_level`
Sets the zoom level for the webview. Currently handled via frontend CSS transforms.

```typescript
invoke('set_zoom_level', {
  level: number
}) => Promise<void>
```

#### `set_window_opacity`
Sets the window opacity (0.65 to 1.0). On Windows, uses SetLayeredWindowAttributes. On macOS/Linux, handled by CSS.

```typescript
invoke('set_window_opacity', {
  opacity: number
}) => Promise<void>
```

#### `restore_window_focus`
Restores focus to the application window. Primarily used on Windows after bash command execution to prevent focus loss.

```typescript
invoke('restore_window_focus') => Promise<void>
```

#### `show_context_menu`
Shows a context menu at the specified coordinates. Placeholder for future implementation with Tauri's menu API.

```typescript
invoke('show_context_menu', {
  x: number,
  y: number,
  hasSelection: boolean
}) => Promise<void>
```

### Claude Binary Detection

#### `get_claude_binary_info`
Gets information about available Claude binaries. Discovers all Claude installations on the system.

```typescript
invoke('get_claude_binary_info') => Promise<ClaudeBinaryInfo>
```

**Returns:**
```typescript
interface ClaudeBinaryInfo {
  installations: ClaudeInstallation[];
  selected?: ClaudeInstallation | null;
  platform: string;  // "windows" | "macos" | "linux"
  wsl_available: boolean;
}

interface ClaudeInstallation {
  path: string;
  version: string;
  source: string;
  is_wsl: boolean;
}
```

#### `get_claude_version`
Gets the Claude CLI version by running `claude --version`.

```typescript
invoke('get_claude_version') => Promise<string>
```

#### `get_claude_path`
Gets the Claude CLI binary path using `which` (Unix) or `where` (Windows).

```typescript
invoke('get_claude_path') => Promise<string>
```

#### `get_claude_weekly_usage`
Gets weekly usage statistics from `~/.claude/stats-cache.json`. Returns data for the last 7 days.

```typescript
invoke('get_claude_weekly_usage') => Promise<WeeklyUsageSummary>
```

**Returns:**
```typescript
interface DailyModelTokens {
  date: string;
  tokensByModel: Record<string, number>;  // Map of model name to token count
}

interface WeeklyUsageSummary {
  total_tokens: number;  // u64 from Rust
  opus_tokens: number;
  sonnet_tokens: number;
  haiku_tokens: number;
  days_with_data: number;
  daily_breakdown: DailyModelTokens[];
}
```

#### `get_claude_usage_limits`
Gets Claude usage limits from the Anthropic API. Requires valid OAuth credentials.

```typescript
invoke('get_claude_usage_limits') => Promise<ClaudeUsageLimits>
```

**Returns:**
```typescript
interface UsageLimit {
  utilization?: number | null;  // f64, percentage 0.0-1.0
  resets_at?: string | null;    // ISO 8601 timestamp
}

interface ClaudeUsageLimits {
  five_hour?: UsageLimit | null;
  seven_day?: UsageLimit | null;
  seven_day_opus?: UsageLimit | null;
  seven_day_sonnet?: UsageLimit | null;
  subscription_type?: string | null;
  rate_limit_tier?: string | null;
}
```

#### `check_file_exists`
Checks if a file exists on the filesystem.

```typescript
invoke('check_file_exists', {
  path: string
}) => Promise<boolean>
```

#### `check_wsl_available`
Checks if WSL is available on the system (Windows only). Returns false on non-Windows platforms.

```typescript
invoke('check_wsl_available') => Promise<boolean>
```

#### `get_wsl_username`
Gets the WSL username by running `whoami` in WSL (Windows only). Returns error on non-Windows platforms.

```typescript
invoke('get_wsl_username') => Promise<string>
```

#### `check_wsl_file_exists`
Checks if a file exists in WSL (Windows only). Returns error on non-Windows platforms.

```typescript
invoke('check_wsl_file_exists', {
  path: string
}) => Promise<boolean>
```

#### `execute_wsl_command`
Executes a command in WSL via `wsl -e bash -c` (Windows only). Returns error on non-Windows platforms.

```typescript
invoke('execute_wsl_command', {
  command: string
}) => Promise<string>
```

#### `execute_command`
Executes a system command with arguments. On Windows, uses CREATE_NO_WINDOW flag.

```typescript
invoke('execute_command', {
  command: string,
  args: string[]
}) => Promise<string>
```

### Settings Management

#### `save_claude_settings`
Saves Claude configuration settings to `<config_dir>/yume/claude_settings.json`.

```typescript
invoke('save_claude_settings', {
  settings: any  // serde_json::Value - any valid JSON
}) => Promise<void>
```

#### `load_claude_settings`
Loads Claude configuration settings from persistent storage. Returns null if file doesn't exist.

```typescript
invoke('load_claude_settings') => Promise<any | null>
```

#### `save_settings`
Saves a setting value to persistent storage. Settings are stored as JSON.

```typescript
invoke('save_settings', {
  key: string,
  value: any  // serde_json::Value - any valid JSON
}) => Promise<void>
```

#### `load_settings`
Loads a setting value from persistent storage. Returns null if key doesn't exist.

```typescript
invoke('load_settings', {
  key: string
}) => Promise<any | null>
```

#### `get_env_var`
Gets an environment variable value. Returns null if not set.

```typescript
invoke('get_env_var', {
  name: string
}) => Promise<string | null>
```

#### `get_windows_paths`
Gets Windows-specific paths for Claude detection. Returns object with common Windows paths.

```typescript
invoke('get_windows_paths') => Promise<WindowsPaths>
```

**Returns:**
```typescript
interface WindowsPaths {
  userprofile?: string;
  appdata?: string;
  localappdata?: string;
  path_dirs?: string[];
  home?: string;
}
```

### Project Management

#### `get_recent_projects`
Retrieves the list of recent project directories.

```typescript
invoke('get_recent_projects') => Promise<string[]>
```

#### `add_recent_project`
Adds a project directory to the recent list.

```typescript
invoke('add_recent_project', {
  path: string
}) => Promise<void>
```

### File Operations

#### `search_files`
Searches for files and directories matching a query string.

```typescript
invoke('search_files', {
  query: string,
  directory: string,
  include_hidden: boolean,
  max_results: number
}) => Promise<FileSearchResult[]>
```

**Returns:**
```typescript
interface FileSearchResult {
  type: string;  // "file" or "directory"
  path: string;
  name: string;
  relativePath: string;
  lastModified?: number;
}
```

#### `get_recent_files`
Returns the most recently modified files in a directory.

```typescript
invoke('get_recent_files', {
  directory: string,
  limit: number
}) => Promise<FileSearchResult[]>
```

#### `get_folder_contents`
Returns the immediate contents of a folder (non-recursive).

```typescript
invoke('get_folder_contents', {
  folder_path: string,
  max_results: number
}) => Promise<FileSearchResult[]>
```

#### `check_is_directory`
Checks if a given path is a directory.

```typescript
invoke('check_is_directory', {
  path: string
}) => Promise<boolean>
```

### Git Operations

#### `get_git_status`
Returns the Git status for a repository.

```typescript
invoke('get_git_status', {
  directory: string
}) => Promise<GitStatus>
```

**Returns:**
```typescript
interface GitStatus {
  modified: string[];
  added: string[];
  deleted: string[];
  renamed: string[];
}
```

#### `get_git_diff_numstat`
Returns git diff numstat for line additions/deletions per file.

```typescript
invoke('get_git_diff_numstat', {
  directory: string
}) => Promise<string>
```

### Bash Execution

#### `execute_bash`
Executes a bash command and returns the output. Platform-specific implementation:
- **Windows**: Tries WSL, then Git Bash, then cmd
- **macOS/Linux**: Uses native bash

Has a 30-second timeout.

```typescript
invoke('execute_bash', {
  command: string,
  workingDir?: string | null
}) => Promise<string>
```

#### `spawn_bash`
Spawns a bash command and streams output in real-time via Tauri events. Emits:
- `bash-output-{process_id}` - stdout lines
- `bash-error-{process_id}` - stderr lines
- `bash-complete-{process_id}` - exit code when done

```typescript
invoke('spawn_bash', {
  command: string,
  workingDir?: string | null
}) => Promise<string>  // Returns process_id (UUID)
```

#### `kill_bash_process`
Kills a specific bash process by its process ID.

```typescript
invoke('kill_bash_process', {
  processId: string
}) => Promise<void>
```

### System Commands

#### `open_external`
Opens a URL in the system's default browser. Platform-specific:
- **Windows**: `cmd /C start`
- **macOS**: `open`
- **Linux**: `xdg-open`

```typescript
invoke('open_external', {
  url: string
}) => Promise<void>
```

#### `get_system_fonts`
Returns a list of available system fonts by scanning font directories:
- **macOS**: `/System/Library/Fonts`, `/Library/Fonts`, `~/Library/Fonts`
- **Windows**: `C:\Windows\Fonts`
- **Linux**: `/usr/share/fonts`, `/usr/local/share/fonts`, `~/.fonts`, `~/.local/share/fonts`

```typescript
invoke('get_system_fonts') => Promise<string[]>
```

#### `toggle_console_visibility`
Toggles the YUME_SHOW_CONSOLE environment variable. Changes take effect on next server restart.

```typescript
invoke('toggle_console_visibility') => Promise<string>
```

**Returns:** Status message ("Console will be visible/hidden on next server restart")

#### `get_server_port`
Returns the port number where the Node.js backend server is running. Dynamically allocated at startup.

```typescript
invoke('get_server_port') => Promise<number>
```

#### `read_port_file`
Reads the port number from the `~/.yume/current-port.txt` file.

```typescript
invoke('read_port_file') => Promise<number>
```

#### `get_server_logs`
Returns the current Node.js server logs from memory.

```typescript
invoke('get_server_logs') => Promise<string>
```

#### `get_server_log_path`
Returns the file path where server logs are stored:
- **macOS**: `~/Library/Logs/yume/server.log`
- **Windows**: `%LOCALAPPDATA%\yume\logs\server.log`
- **Linux**: `~/.yume/logs/server.log`

```typescript
invoke('get_server_log_path') => Promise<string>
```

#### `clear_server_logs`
Clears the server logs file.

```typescript
invoke('clear_server_logs') => Promise<void>
```

#### `get_home_directory`
Gets the user's home directory path.

```typescript
invoke('get_home_directory') => Promise<string>
```

#### `get_current_directory`
Gets the current working directory.

```typescript
invoke('get_current_directory') => Promise<string>
```

### Database Operations

#### `db_save_session`
Saves or updates a session in the database.

```typescript
invoke('db_save_session', {
  session: Session
}) => Promise<void>
```

**Session Structure:**
```typescript
interface Session {
  id: string;
  title?: string;
  project_path?: string;
  model?: string;
  created_at: number;
  updated_at: number;
  metadata?: object;
}
```

#### `db_load_session`
Loads a specific session from the database.

```typescript
invoke('db_load_session', {
  session_id: string
}) => Promise<Session | null>
```

#### `db_load_all_sessions`
Loads all sessions from the database.

```typescript
invoke('db_load_all_sessions') => Promise<Session[]>
```

#### `db_delete_session`
Deletes a session from the database.

```typescript
invoke('db_delete_session', {
  session_id: string
}) => Promise<void>
```

#### `db_save_message`
Saves a message to the database.

```typescript
invoke('db_save_message', {
  message: Message
}) => Promise<void>
```

**Message Structure:**
```typescript
interface Message {
  id: string;
  session_id: string;
  role: string;
  content: string;
  timestamp: number;
  tokens?: number;
}
```

#### `db_load_messages`
Loads all messages for a session.

```typescript
invoke('db_load_messages', {
  session_id: string
}) => Promise<Message[]>
```

#### `db_save_analytics`
Saves analytics data to the database.

```typescript
invoke('db_save_analytics', {
  analytics: Analytics
}) => Promise<void>
```

#### `db_load_analytics`
Loads analytics for a session.

```typescript
invoke('db_load_analytics', {
  session_id: string
}) => Promise<Analytics[]>
```

#### `db_get_statistics`
Gets database statistics.

```typescript
invoke('db_get_statistics') => Promise<object>
```

#### `db_clear_all_data`
Clears all data from the database (requires confirmation).

```typescript
invoke('db_clear_all_data', {
  confirm: boolean
}) => Promise<void>
```

#### `db_export_data`
Exports all database data as JSON.

```typescript
invoke('db_export_data') => Promise<object>
```

#### `db_import_data`
Imports database data from JSON.

```typescript
invoke('db_import_data', {
  data: object
}) => Promise<void>
```

### Hook Operations

#### `execute_hook`
Executes a hook script with the given input. Script type is auto-detected from content (python, node, bash).

```typescript
invoke('execute_hook', {
  event: string,
  script: string,
  data: any,  // serde_json::Value
  sessionId: string,
  timeoutMs?: number | null  // Defaults to 5000ms
}) => Promise<HookResponse>
```

**Returns:**
```typescript
interface HookResponse {
  action: string;      // "continue", "block", "modify"
  message?: string | null;
  exit_code: number;   // i32 from Rust
  modifications?: any | null;
}
```

#### `test_hook`
Tests a hook script with sample data appropriate for the event type.

```typescript
invoke('test_hook', {
  script: string,
  event: string
}) => Promise<string>  // Formatted result string
```

#### `get_hook_events`
Gets available hook event types. Returns a Vec of strings.

```typescript
invoke('get_hook_events') => Promise<string[]>
```

**Available Events:**
- `user_prompt_submit`
- `pre_tool_use`
- `post_tool_use`
- `assistant_response`
- `session_start`
- `session_end`
- `context_warning`
- `compaction_trigger`
- `error`

#### `get_sample_hooks`
Gets sample yume hook scripts.

```typescript
invoke('get_sample_hooks') => Promise<[string, string, string][]>
// Returns array of [name, event, script] tuples
```

### Compaction Operations

#### `update_context_usage`
Updates context usage for a session and returns the action to take.

```typescript
invoke('update_context_usage', {
  sessionId: string,
  usage: number  // f32, 0.0 to 1.0 (percentage as decimal)
}) => Promise<string>  // JSON-serialized CompactionActionType
```

**Action Types:**
- `"None"` - No action needed
- `"Notice"` - Notice level (deprecated)
- `"Warning"` - Warning at 55%
- `"AutoTrigger"` - Auto-compact at 60%
- `"Force"` - Force compact at 65%

#### `save_context_manifest`
Saves a context manifest for a session.

```typescript
invoke('save_context_manifest', {
  sessionId: string,
  manifestData: ContextManifest  // serde_json::Value
}) => Promise<string>
```

#### `load_context_manifest`
Loads a context manifest for a session.

```typescript
invoke('load_context_manifest', {
  sessionId: string
}) => Promise<ContextManifest>
```

**Returns:**
```typescript
interface ContextManifest {
  version: string;
  task_id?: string | null;
  session_id: string;
  timestamp: string;  // ISO 8601
  context: {
    files: string[];
    functions: string[];
    dependencies: string[];
    decisions: Array<{
      decision: string;
      rationale: string;
      timestamp: string;
    }>;
  };
  scope?: string | null;
  entry_points: string[];
  test_files: string[];
}
```

#### `get_compaction_state`
Gets the compaction state for a session.

```typescript
invoke('get_compaction_state', {
  sessionId: string
}) => Promise<CompactionState | null>
```

**Returns:**
```typescript
interface CompactionState {
  session_id: string;
  current_usage: number;  // f32
  last_action: string;
  auto_triggered: boolean;
  force_triggered: boolean;
  last_update: string;  // ISO 8601
}
```

#### `reset_compaction_state`
Resets the compaction state for a session (removes from state map).

```typescript
invoke('reset_compaction_state', {
  sessionId: string
}) => Promise<void>
```

#### `reset_compaction_flags`
Resets compaction trigger flags (auto_triggered, force_triggered) for a session without removing state.

```typescript
invoke('reset_compaction_flags', {
  sessionId: string
}) => Promise<void>
```

#### `update_compaction_config`
Updates the compaction configuration.

```typescript
invoke('update_compaction_config', {
  config: CompactionConfig
}) => Promise<void>
```

**Config:**
```typescript
interface CompactionConfig {
  auto_threshold: number;  // f32, default 0.60
  force_threshold: number; // f32, default 0.65
  preserve_context: boolean;
  generate_manifest: boolean;
}
```

#### `get_compaction_config`
Gets the current compaction configuration.

```typescript
invoke('get_compaction_config') => Promise<CompactionConfig>
```

#### `generate_context_manifest`
Generates and saves a context manifest for a session.

```typescript
invoke('generate_context_manifest', {
  sessionId: string,
  taskId?: string | null,
  scope?: string | null,
  files: string[],
  functions: string[],
  dependencies: string[],
  decisions: object[]
}) => Promise<ContextManifest>
```

### MCP Operations (Model Context Protocol)

These commands manage MCP servers that extend Claude's capabilities.

#### `mcp_list`
Lists all configured MCP servers from `~/.claude/settings.json`.

```typescript
invoke('mcp_list') => Promise<MCPServer[]>
```

**Returns:**
```typescript
interface MCPServer {
  name: string;
  transport: string;  // "stdio" | "sse"
  command?: string | null;  // For stdio transport
  args: string[];
  env: Record<string, string>;  // HashMap<String, String>
  url?: string | null;  // For SSE transport
  scope: string;  // "user" | "project"
  connected: boolean;  // Always false (connection state not tracked)
}
```

#### `mcp_add`
Adds an MCP server to Claude's settings.

```typescript
invoke('mcp_add', {
  name: string,
  transport: string,
  command?: string | null,
  args: string[],
  env: Record<string, string>,
  url?: string | null,
  scope: string
}) => Promise<AddServerResult>
```

**Returns:**
```typescript
interface AddServerResult {
  success: boolean;
  message: string;
}
```

#### `mcp_remove`
Removes an MCP server from Claude's settings.

```typescript
invoke('mcp_remove', {
  name: string
}) => Promise<string>  // Success/error message
```

#### `mcp_test_connection`
Tests MCP server connection by attempting to start and communicate with it.

```typescript
invoke('mcp_test_connection', {
  name: string
}) => Promise<string>  // Connection status message
```

#### `mcp_import_claude_desktop`
Imports MCP servers from Claude Desktop configuration (`claude_desktop_config.json`).

```typescript
invoke('mcp_import_claude_desktop') => Promise<ImportResult>
```

**Returns:**
```typescript
interface ImportResult {
  imported: number;
  skipped: number;
  servers: string[];
}
```

#### `mcp_export_config`
Exports MCP configuration as JSON string.

```typescript
invoke('mcp_export_config') => Promise<string>  // JSON string
```

### Agent Management (In-Memory)

These commands manage agents stored in memory for the current session.

#### `list_agents`
Lists all in-memory agents.

```typescript
invoke('list_agents') => Promise<Agent[]>
```

**Returns:**
```typescript
interface Agent {
  id?: number | null;  // i32 from Rust
  name: string;
  icon: string;
  system_prompt: string;
  default_task?: string | null;
  model: string;
  created_at: number;  // i64 timestamp
  updated_at: number;  // i64 timestamp
}
```

#### `load_default_agents`
Loads the 5 Yume Core Agents from `default-agents.json` resource or hardcoded fallback:
- **architect** - Plans, designs, decomposes tasks
- **explorer** - Finds, reads, understands codebase
- **implementer** - Codes, edits, builds
- **guardian** - Reviews, audits, verifies
- **specialist** - Domain-specific tasks

```typescript
invoke('load_default_agents') => Promise<Agent[]>
```

#### `create_agent`
Creates a new in-memory agent with auto-assigned ID.

```typescript
invoke('create_agent', {
  agent: Agent
}) => Promise<Agent>
```

#### `delete_agent`
Deletes an in-memory agent by ID.

```typescript
invoke('delete_agent', {
  id: number
}) => Promise<void>
```

### Claude Agents (File-based)

These commands manage agents stored as `.md` files in the filesystem with YAML frontmatter.

#### `load_claude_agents`
Loads Claude agents from `~/.claude/agents` directory (global agents). Does NOT include yume built-in agents.

```typescript
invoke('load_claude_agents') => Promise<ClaudeAgent[]>
```

**Returns:**
```typescript
interface ClaudeAgent {
  id: string;           // Format: "claude-agent-{name}"
  name: string;         // From YAML frontmatter
  model: string;        // From YAML frontmatter, defaults to "opus"
  system_prompt: string; // Markdown body after frontmatter
  created_at: number;   // u64 Unix timestamp
  updated_at: number;   // u64 Unix timestamp
}
```

**File Format:**
```yaml
---
name: agent-name
model: opus
description: Agent description
---

System prompt content here...
```

#### `load_project_agents`
Loads project-specific Claude agents from `<directory>/.claude/agents`.

```typescript
invoke('load_project_agents', {
  directory: string
}) => Promise<ClaudeAgent[]>
```

#### `save_global_agent`
Saves a Claude agent to `~/.claude/agents/{name}.md`.

```typescript
invoke('save_global_agent', {
  agent: ClaudeAgent
}) => Promise<void>
```

#### `save_project_agent`
Saves a Claude agent to `<directory>/.claude/agents/{name}.md`.

```typescript
invoke('save_project_agent', {
  agent: ClaudeAgent,
  directory: string
}) => Promise<void>
```

#### `delete_global_agent`
Deletes a Claude agent file from `~/.claude/agents`.

```typescript
invoke('delete_global_agent', {
  agentName: string
}) => Promise<void>
```

#### `delete_project_agent`
Deletes a project agent file.

```typescript
invoke('delete_project_agent', {
  agentName: string,
  directory: string
}) => Promise<void>
```

### Yume Agents Sync

These commands manage syncing the 5 Yume Core Agents to `~/.claude/agents/` for Claude CLI integration.

#### `sync_yume_agents`
Writes or removes yume agent files (`yume-*.md`) to `~/.claude/agents/` based on enabled state. Uses PID tracking to support multiple instances.

```typescript
invoke('sync_yume_agents', {
  enabled: boolean,
  model?: string | null  // Defaults to "opus"
}) => Promise<void>
```

#### `cleanup_yume_agents_on_exit`
Cleans up yume agents on app exit. Only removes agent files if no other yume instances are running.

```typescript
invoke('cleanup_yume_agents_on_exit') => Promise<void>
```

#### `are_yume_agents_synced`
Checks if all 5 yume agent files exist in `~/.claude/agents/`.

```typescript
invoke('are_yume_agents_synced') => Promise<boolean>
```

### Custom Commands

These commands manage custom slash commands stored as `.md` files in `~/.claude/commands`.

#### `load_custom_commands`
Loads custom commands from `~/.claude/commands` directory (global commands).

```typescript
invoke('load_custom_commands') => Promise<CustomCommand[]>
```

**Returns:**
```typescript
interface CustomCommand {
  id: string;          // Format: "custom-cmd-{name}"
  name: string;        // From filename (without .md)
  description: string; // From YAML frontmatter
  template: string;    // Markdown body after frontmatter
  category: string;    // From YAML frontmatter, defaults to "custom"
  has_params: boolean; // True if template contains $ARGUMENTS or $1
  enabled: boolean;    // From YAML frontmatter, defaults to true
  created_at: number;  // u64 Unix timestamp
  updated_at: number;  // u64 Unix timestamp
}
```

**File Format:**
```yaml
---
description: "Command description"
category: custom
argument-hint: "Enter parameters"
enabled: true
---

Command template with $ARGUMENTS placeholder...
```

#### `load_project_commands`
Loads project-specific custom commands from `<directory>/.claude/commands`.

```typescript
invoke('load_project_commands', {
  directory: string
}) => Promise<CustomCommand[]>
```

#### `save_custom_command`
Saves a custom command to `~/.claude/commands/{name}.md`.

```typescript
invoke('save_custom_command', {
  command: CustomCommand
}) => Promise<void>
```

#### `save_project_command`
Saves a custom command to `<directory>/.claude/commands/{name}.md`.

```typescript
invoke('save_project_command', {
  command: CustomCommand,
  directory: string
}) => Promise<void>
```

#### `delete_custom_command`
Deletes a custom command from `~/.claude/commands`.

```typescript
invoke('delete_custom_command', {
  commandName: string
}) => Promise<void>
```

#### `delete_project_command`
Deletes a project command file.

```typescript
invoke('delete_project_command', {
  commandName: string,
  directory: string
}) => Promise<void>
```

#### `load_all_commands`
Loads all commands, merging file system commands with cached commands. File commands take precedence.

```typescript
invoke('load_all_commands', {
  cachedCommands?: CustomCommand[] | null
}) => Promise<CustomCommand[]>
```

### Plugin Management

These commands manage the plugin system for extending Yume functionality.

#### `plugin_list`
Lists all installed plugins from `~/.yume/plugins/`.

```typescript
invoke('plugin_list') => Promise<InstalledPlugin[]>
```

**Returns:**
```typescript
interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author_name?: string;
  author_email?: string;
}

interface PluginCommand {
  name: string;
  description: string;
  file_path: string;
  plugin_id: string;
}

interface PluginAgent {
  name: string;
  model: string;
  description: string;
  file_path: string;
  plugin_id: string;
}

interface PluginHook {
  name: string;
  event: string;  // "PreToolUse" | "PostToolUse" | "SessionStart" | "Stop"
  description: string;
  file_path: string;
  plugin_id: string;
}

interface PluginSkill {
  name: string;
  description: string;
  file_path: string;
  plugin_id: string;
}

interface PluginComponents {
  commands: PluginCommand[];
  agents: PluginAgent[];
  hooks: PluginHook[];
  skills: PluginSkill[];
  mcp_servers?: object;  // MCP server configuration JSON
}

interface InstalledPlugin {
  id: string;
  manifest: PluginManifest;
  installed_at: number;  // Unix timestamp
  enabled: boolean;
  path: string;  // Installation path
  components: PluginComponents;
}
```

#### `plugin_get_directory`
Gets the plugin directory path (`~/.yume/plugins/`).

```typescript
invoke('plugin_get_directory') => Promise<string>
```

#### `plugin_validate`
Validates a plugin directory structure and manifest before installation.

```typescript
invoke('plugin_validate', {
  sourcePath: string
}) => Promise<PluginManifest>
```

**Returns:**
```typescript
interface PluginManifest {
  id: string;
  name: string;
  version: string;
  author?: string;
  description?: string;
  components?: string[];  // ["commands", "agents", "hooks", "skills", "mcp"]
}
```

#### `plugin_install`
Installs a plugin by copying from source directory to `~/.yume/plugins/{id}/`.

```typescript
invoke('plugin_install', {
  sourcePath: string
}) => Promise<InstalledPlugin>
```

**Validation**:
- Checks for valid `plugin.json` manifest
- Ensures plugin ID doesn't already exist
- Copies all plugin files to plugin directory

#### `plugin_uninstall`
Uninstalls a plugin by removing its directory.

```typescript
invoke('plugin_uninstall', {
  pluginId: string
}) => Promise<void>
```

**Notes**:
- Disables plugin before uninstalling
- Removes all plugin files
- Cannot uninstall bundled "yume" plugin

#### `plugin_enable`
Enables a plugin and syncs its components to active use.

```typescript
invoke('plugin_enable', {
  pluginId: string
}) => Promise<void>
```

**Component Sync**:
- Commands → `~/.claude/commands/`
- Agents → `~/.claude/agents/`
- Hooks → Active hooks registry
- Skills → localStorage
- MCP → Claude settings

#### `plugin_disable`
Disables a plugin and removes its components from active use.

```typescript
invoke('plugin_disable', {
  pluginId: string
}) => Promise<void>
```

**Component Cleanup**:
- Removes synced commands
- Removes synced agents
- Deregisters hooks
- Disables skills
- Removes MCP servers

#### `plugin_get_details`
Gets detailed information about a specific plugin.

```typescript
invoke('plugin_get_details', {
  pluginId: string
}) => Promise<InstalledPlugin>
```

#### `plugin_rescan`
Rescans a plugin directory to update component counts.

```typescript
invoke('plugin_rescan', {
  pluginId: string
}) => Promise<InstalledPlugin>
```

**Use Case**: Call after manually adding/removing component files

#### `plugin_init_bundled`
Initializes the bundled "yume" plugin on first launch.

```typescript
invoke('plugin_init_bundled', {
  appHandle: AppHandle
}) => Promise<InstalledPlugin | null>
```

**Notes**:
- Called automatically during app initialization
- Creates bundled plugin with default components
- Returns null if already initialized

#### `plugin_cleanup_on_exit`
Cleans up plugin state on app exit.

```typescript
invoke('plugin_cleanup_on_exit') => Promise<void>
```

**Cleanup Tasks**:
- Saves plugin registry state
- Removes temporary files
- Ensures all components properly deregistered

### VSCode Extension Management

These commands manage the bundled VSCode extension integration.

#### `is_vscode_installed`
Checks if VSCode CLI is available on the system. Searches common installation paths for each platform.

```typescript
invoke('is_vscode_installed') => Promise<boolean>
```

**Platform Search Paths**:
- **macOS**: `/usr/local/bin/code`, `/opt/homebrew/bin/code`, `/Applications/Visual Studio Code.app/...`
- **Linux**: `/usr/bin/code`, `/usr/local/bin/code`, `/snap/bin/code`
- **Windows**: `%LOCALAPPDATA%\Programs\Microsoft VS Code\bin\code.cmd`, `C:\Program Files\Microsoft VS Code\...`

#### `check_vscode_extension_installed`
Checks if the Yume VSCode extension is installed.

```typescript
invoke('check_vscode_extension_installed') => Promise<boolean>
```

**Detection Methods**:
1. Checks `~/.vscode/extensions/` for directories starting with `yume.`
2. Falls back to `code --list-extensions` CLI command

#### `install_vscode_extension`
Installs the bundled Yume VSCode extension (.vsix file).

```typescript
invoke('install_vscode_extension', {
  appHandle: AppHandle
}) => Promise<void>
```

**Process**:
1. Locates bundled `.vsix` file in app resources
2. Runs `code --install-extension <vsix> --force`
3. Returns error if VSCode CLI not found

**Error Conditions**:
- VSCode CLI not available
- Extension file not found in resources
- Installation command fails

#### `uninstall_vscode_extension`
Uninstalls the Yume VSCode extension.

```typescript
invoke('uninstall_vscode_extension') => Promise<void>
```

**Process**:
1. Runs `code --uninstall-extension yume.yume-vscode`
2. Silently succeeds if extension wasn't installed

### App Instance Management

These commands manage multi-instance tracking to prevent conflicts during plugin sync/cleanup operations.

#### `register_app_instance`
Registers this app instance's PID for multi-instance tracking. Called on app startup.

```typescript
invoke('register_app_instance') => Promise<void>
```

**Process**:
1. Creates PID file in `~/.yume/pids/{pid}.lock`
2. Used to track running Yume instances

#### `unregister_app_instance`
Unregisters this app instance from PID tracking. Called on app exit.

```typescript
invoke('unregister_app_instance') => Promise<void>
```

#### `get_running_instance_count`
Returns the count of currently running Yume instances.

```typescript
invoke('get_running_instance_count') => Promise<number>
```

**Use Cases**:
- Skip plugin cleanup if other instances are running
- Acquire plugin sync lock safely
- Prevent multi-instance conflicts

---

## Tauri Events API

Tauri events are used for real-time communication between the Rust backend and the frontend. Events are emitted via `app.emit()` and listened to via `listen()` from `@tauri-apps/api/event`.

### Claude Session Events

Events are namespaced by session ID for multiplexing multiple sessions.

#### `claude-message:{sessionId}`
Emitted for each message from Claude. Payload is raw JSON string that needs parsing.

**Compatibility Note:** For planned multi-provider support, non-Claude providers will emit the same Claude-compatible stream-json payloads on this event name (or an `agent-message` alias during migration).
See `docs/expansion-plan/STREAM_JSON_REFERENCE.md` for the canonical message shapes.

```typescript
import { listen } from '@tauri-apps/api/event';

listen(`claude-message:${sessionId}`, (event) => {
  const message = JSON.parse(event.payload as string);
  // message types: text, assistant, user, tool_use, tool_result, result, error, etc.
});
```

**Message Types:**
- `text` - Streaming text content
- `assistant` - Complete assistant message with content blocks
- `user` - User message echo
- `tool_use` - Tool invocation
- `tool_result` - Tool result
- `result` - Completion with usage stats
- `error` - Error message
- `system` - System messages (subtype: session_id, etc.)
- `thinking` - Thinking indicator

#### `claude-error:{sessionId}`
Emitted on session errors.

```typescript
listen(`claude-error:${sessionId}`, (event) => {
  const error = event.payload;
  // { message: string, code?: string }
});
```

#### `claude-title:{sessionId}`
Emitted when Claude suggests a conversation title.

```typescript
listen(`claude-title:${sessionId}`, (event) => {
  const title = event.payload;  // string or { title: string }
});
```

#### `claude-session-id-update:{sessionId}`
Emitted when the Claude session ID changes (e.g., after /compact creates a new session).

```typescript
listen(`claude-session-id-update:${sessionId}`, (event) => {
  const { old_session_id, new_session_id, real_claude_session_id } = event.payload;
  // Update listeners to new channel
});
```

#### `claude-complete:{sessionId}`
Emitted when a Claude response is complete.

```typescript
listen(`claude-complete:${sessionId}`, (event) => {
  const data = event.payload;
});
```

### Bash Process Events

Events for streaming bash command output.

#### `bash-output-{processId}`
Emitted for each stdout line from a spawned bash process.

```typescript
listen(`bash-output-${processId}`, (event) => {
  const line = event.payload as string;
});
```

#### `bash-error-{processId}`
Emitted for each stderr line from a spawned bash process.

```typescript
listen(`bash-error-${processId}`, (event) => {
  const line = event.payload as string;
});
```

#### `bash-complete-{processId}`
Emitted when a bash process exits.

```typescript
listen(`bash-complete-${processId}`, (event) => {
  const exitCode = event.payload as number | null;
});
```

### Legacy WebSocket API (Deprecated)

The WebSocket API via embedded Node.js server is maintained for backwards compatibility but is being phased out in favor of direct Tauri commands. New code should use Tauri commands and events instead.

---

## Frontend Services API

### TauriClaudeClient

**Location:** `src/renderer/services/tauriClaudeClient.ts`

Main client for communicating with Claude via Tauri IPC commands. Replaces Socket.IO with direct Tauri invoke calls.

```typescript
class TauriClaudeClient {
  // Connection (always connected with Tauri)
  isConnected(): boolean
  getServerPort(): number | null

  // Session Management
  createSession(name: string, workingDirectory: string, options?: {
    model?: string;
    prompt?: string;
    claudeSessionId?: string;
    sessionId?: string;
  }): Promise<{
    sessionId: string;
    messages: any[];
    workingDirectory: string;
    claudeSessionId?: string;
    pendingSpawn?: boolean;
    model?: string;
  }>

  sendMessage(sessionId: string, content: string, model?: string): Promise<void>
  interrupt(sessionId: string): Promise<void>
  clearSession(sessionId: string): Promise<void>
  deleteSession(sessionId: string): Promise<void>
  listSessions(): Promise<any[]>
  getSessionHistory(sessionId: string): Promise<any>

  // Event Listeners (return cleanup functions)
  onMessage(sessionId: string, handler: (message: any) => void): () => void
  onError(sessionId: string, handler: (error: any) => void): () => void
  onTitle(sessionId: string, handler: (title: string) => void): () => void
  onSessionCreated(handler: (data: any) => void): void

  // Lifecycle
  disconnect(): void
  checkHealth(): Promise<boolean>
}
```

### TauriAPI

**Location:** `src/renderer/services/tauriApi.ts`

High-level wrapper for Tauri commands.

```typescript
interface TauriAPI {
  folder: {
    select: () => Promise<string | null>;
  };
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    setZoomLevel: (level: number) => Promise<void>;
    setOpacity: (opacity: number) => Promise<void>;
  };
  claude: {
    sendMessage: (sessionId: string, message: string, workingDir: string, model: string) => Promise<void>;
    interruptSession: (sessionId: string) => Promise<void>;
    clearSession: (sessionId: string) => Promise<void>;
    getSessions: () => Promise<any[]>;
    getServerPort: () => Promise<number>;
    readPortFile: () => Promise<number>;
  };
  settings: {
    save: (key: string, value: any) => Promise<void>;
    load: (key: string) => Promise<any>;
  };
  projects: {
    getRecent: () => Promise<string[]>;
    addRecent: (path: string) => Promise<void>;
  };
  contextMenu: {
    show: (x: number, y: number, hasSelection: boolean) => Promise<void>;
  };
}

// Helper function
export const isTauri = (): boolean  // Returns true if running in Tauri
```

### CompactionService

**Location:** `src/renderer/services/compactionService.ts`

Handles context compaction with auto-trigger at 60% (with 38% buffer like Claude Code).

```typescript
class CompactionService {
  // Context Monitoring
  updateContextUsage(sessionId: string, usagePercentage: number): Promise<void>

  // Compaction Triggers
  triggerAutoCompaction(sessionId: string): Promise<void>  // Flags for compact on next message
  triggerForceCompaction(sessionId: string): Promise<void>
  executeAutoCompaction(sessionId: string, pendingUserMessage: string): Promise<void>

  // Manifest Management
  generateAndSaveManifest(sessionId: string): Promise<void>
  loadManifest(sessionId: string): Promise<ContextManifest | null>

  // Configuration
  updateConfig(config: Partial<CompactionConfig>): Promise<void>
  getConfig(): Promise<CompactionConfig>

  // Status
  isCompacting(sessionId: string): boolean
}

interface CompactionConfig {
  autoThreshold: number;   // 0.60 (60%)
  forceThreshold: number;  // 0.65 (65%)
  preserveContext: boolean;
  generateManifest: boolean;
}

type CompactionActionType = 'None' | 'Notice' | 'Warning' | 'AutoTrigger' | 'Force';
```

### HooksService

**Location:** `src/renderer/services/hooksService.ts`

Executes hook scripts at various trigger points.

```typescript
class HooksService {
  // Execution
  executeHook(trigger: HookTrigger, data: any, sessionId: string): Promise<HookResponse>

  // Sample Hooks
  getSampleHooks(): Promise<[string, string, string][]>  // [name, event, script]
}
```

### PluginService

**Location:** `src/renderer/services/pluginService.ts`

Manages plugin installation, enabling, and component syncing.

```typescript
class PluginService {
  // Singleton instance
  static getInstance(): PluginService

  // Initialization
  initialize(): Promise<void>

  // Plugin Management
  listPlugins(): Promise<Plugin[]>
  installPlugin(sourcePath: string): Promise<void>
  installPluginFromDialog(): Promise<void>
  uninstallPlugin(pluginId: string): Promise<void>
  enablePlugin(pluginId: string): Promise<void>
  disablePlugin(pluginId: string): Promise<void>
  refresh(): Promise<void>
}

interface Plugin {
  id: string
  name: string
  version: string
  author?: string
  description?: string
  enabled: boolean
  components: {
    commands: number
    agents: number
    hooks: number
    skills: number
    mcp: number
  }
}
```

### PerformanceMonitor

**Location:** `src/renderer/services/performanceMonitor.ts`

Real-time performance monitoring with metrics collection and export.

```typescript
class PerformanceMonitor {
  // Singleton instance
  static getInstance(): PerformanceMonitor

  // Measurements
  mark(name: string): void
  measure(name: string): void
  recordMetric(name: string, value: number, unit: string): void

  // Retrieval
  getMetricsSummary(): MetricsSummary
  exportMetrics(): PerformanceMetric[]

  // Control
  setEnabled(enabled: boolean): void
  isEnabled(): boolean
  reset(): void
}

interface PerformanceMetric {
  name: string
  value: number
  unit: string
  timestamp: number
  tags?: Record<string, string>
}

interface MetricsSummary {
  [metricName: string]: {
    avg: number
    min: number
    max: number
    p50: number
    p90: number
    p99: number
    count: number
  }
}
```

**Monitored Metrics**:
- **FPS**: Frame rate (target 60fps, warn <30fps)
- **Memory**: Heap usage (warn 100MB, critical 200MB)
- **Startup Time**: App initialization (warn 3s, critical 5s)
- **Message Send**: Message send latency (warn 500ms, critical 1s)
- **Compaction**: Compaction duration (warn 5s, critical 10s)
- **Long Tasks**: Main thread blocking >50ms
- **Layout Shift**: CLS score tracking

### FileSearchService

**Location:** `src/renderer/services/fileSearchService.ts`

Fast file search with caching and multiple search strategies.

```typescript
class FileSearchService {
  // Search Operations
  searchFiles(
    query: string,
    workingDirectory: string,
    options?: SearchOptions
  ): Promise<FileSearchResult[]>

  getRecentFiles(
    workingDirectory: string,
    limit: number
  ): Promise<FileSearchResult[]>

  getFolderContents(
    folderPath: string,
    maxResults: number
  ): Promise<FileSearchResult[]>

  getGitChangedFiles(
    workingDirectory: string
  ): Promise<FileSearchResult[]>
}

interface SearchOptions {
  includeHidden?: boolean
  maxResults?: number
  searchType?: 'fuzzy' | 'glob' | 'substring'
}

interface FileSearchResult {
  type: 'file' | 'directory'
  path: string
  name: string
  relativePath: string
  lastModified?: number
}
```

**Search Strategies**:
- **Fuzzy**: Sequential character matching with relevance scoring
- **Glob**: Wildcard patterns (*.ts, **/*.tsx)
- **Substring**: Simple substring matching

**Caching**: 5-second TTL cache to prevent excessive searches

### ModalService

**Location:** `src/renderer/services/modalService.ts`

Global alert and confirm dialog system.

```typescript
class ModalService {
  // Singleton instance
  static getInstance(): ModalService

  // Dialog Methods
  alert(message: string): Promise<void>
  confirm(message: string): Promise<boolean>
}
```

**Features**:
- Overrides global `window.alert()` and `window.confirm()`
- React-based modal rendering
- Single container with lazy initialization

### ConsoleOverride

**Location:** `src/renderer/services/consoleOverride.ts`

Production console routing and debug mode support.

```typescript
// Setup (called during app initialization)
setupConsoleOverride(): void

// Restore
restoreConsole(): void

// Debug mode toggle via localStorage
localStorage.setItem('yume_debug_mode', 'true')
```

**Features**:
- Routes all console methods in production
- Tracks console usage statistics
- Preserves original console functionality
- Can be enabled/disabled dynamically

---

## Store API

### ClaudeCodeStore

**Location:** `src/renderer/stores/claudeCodeStore.ts`

```typescript
interface ClaudeCodeStore {
  // State
  sessions: Map<string, SessionState>
  activeSessionId: string | null
  tabs: TabState[]
  activeTabId: string | null
  isConnected: boolean
  settings: AppSettings
  
  // Actions
  createSession(config: SessionConfig): Promise<string>
  setActiveSession(sessionId: string): void
  updateSession(sessionId: string, updates: Partial<SessionState>): void
  deleteSession(sessionId: string): void
  
  addMessage(sessionId: string, message: Message): void
  updateTokenStats(sessionId: string, stats: TokenStats): void
  
  createTab(sessionId?: string): string
  closeTab(tabId: string): void
  setActiveTab(tabId: string): void
  
  updateSettings(settings: Partial<AppSettings>): void
  
  // Computed
  getActiveSession(): SessionState | null
  getSessionMessages(sessionId: string): Message[]
  getTotalCost(): number
  
  // Persistence
  persist(): void
  hydrate(): void
}
```

---

## Hook System API

### Hook Configuration

```typescript
interface HookConfig {
  // Identity
  name: string
  description?: string
  
  // Trigger
  trigger: HookTrigger
  pattern?: string // Optional regex pattern
  
  // Command
  command: string
  args: string[]
  working_dir?: string
  env?: Record<string, string>
  
  // Behavior
  blocking: boolean
  timeout: number // milliseconds
  enabled: boolean
  
  // Options
  stdin_mode?: 'none' | 'data' | 'message'
  output_mode?: 'ignore' | 'append' | 'replace'
}
```

### Hook Triggers

```typescript
type HookTrigger =
  | 'user_prompt_submit'
  | 'pre_tool_use'
  | 'post_tool_use'
  | 'assistant_response'
  | 'session_start'
  | 'session_end'
  | 'context_warning'
  | 'compaction_trigger'
  | 'error'
```

### Hook Variables

Available variables in hook commands:

```typescript
interface HookVariables {
  // Session
  '${session_id}': string
  '${working_dir}': string
  '${model}': string
  
  // Message
  '${message}': string
  '${role}': 'user' | 'assistant'
  '${timestamp}': number
  
  // File
  '${file}': string
  '${file_path}': string
  '${file_name}': string
  '${file_ext}': string
  
  // System
  '${app_version}': string
  '${platform}': string
  '${home_dir}': string
  '${temp_dir}': string
}
```

---

## Database API

### Schema

```sql
-- Checkpoints
CREATE TABLE checkpoints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    title TEXT,
    messages TEXT NOT NULL,
    token_stats TEXT,
    metadata TEXT,
    
    INDEX idx_session (session_id),
    INDEX idx_timestamp (timestamp)
);

-- Settings
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER
);

-- Messages
CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    tokens INTEGER,
    
    INDEX idx_session_timestamp (session_id, timestamp)
);

-- Sessions
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    title TEXT,
    working_directory TEXT,
    model TEXT,
    created_at INTEGER,
    updated_at INTEGER,
    metadata TEXT
);

-- Compaction History
CREATE TABLE compaction_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    before_tokens INTEGER,
    after_tokens INTEGER,
    summary TEXT,
    
    INDEX idx_session (session_id)
);
```

### Database Operations

```typescript
interface DatabaseOperations {
  // Initialization
  init(): Promise<void>
  migrate(): Promise<void>
  
  // Checkpoints
  saveCheckpoint(checkpoint: Checkpoint): Promise<number>
  loadCheckpoint(id: number): Promise<Checkpoint>
  listCheckpoints(filter?: CheckpointFilter): Promise<Checkpoint[]>
  deleteCheckpoint(id: number): Promise<void>
  
  // Messages
  saveMessage(message: Message): Promise<number>
  getMessages(sessionId: string, limit?: number): Promise<Message[]>
  searchMessages(query: string): Promise<Message[]>
  
  // Settings
  getSetting(key: string): Promise<string | null>
  setSetting(key: string, value: string): Promise<void>
  
  // Maintenance
  vacuum(): Promise<void>
  analyze(): Promise<void>
  backup(path: string): Promise<void>
}
```

---

## MCP Protocol API

### MCP Server Configuration

```typescript
interface McpServer {
  // Identity
  name: string
  description?: string
  
  // Connection
  command: string
  args: string[]
  env?: Record<string, string>
  working_dir?: string
  
  // Options
  auto_start: boolean
  restart_on_failure: boolean
  max_retries: number
  
  // Protocol
  protocol_version: string
  capabilities: string[]
}
```

### MCP Messages

```typescript
// Request
interface McpRequest {
  jsonrpc: '2.0'
  id: string | number
  method: string
  params?: any
}

// Response
interface McpResponse {
  jsonrpc: '2.0'
  id: string | number
  result?: any
  error?: McpError
}

// Error
interface McpError {
  code: number
  message: string
  data?: any
}

// Notification
interface McpNotification {
  jsonrpc: '2.0'
  method: string
  params?: any
}
```

### MCP Methods

```typescript
// Standard Methods
type McpMethod = 
  | 'initialize'
  | 'initialized'
  | 'shutdown'
  | 'exit'
  | 'tools/list'
  | 'tools/call'
  | 'resources/list'
  | 'resources/read'
  | 'prompts/list'
  | 'prompts/get'
  | 'logging/setLevel'
```

---

## Type Definitions

### Core Types

```typescript
// Message
interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  tokens?: number
  attachments?: string[]
  metadata?: Record<string, any>
}

// Session
interface SessionState {
  id: string
  title: string
  messages: Message[]
  tokenStats: TokenStats
  isActive: boolean
  isStreaming: boolean
  workingDirectory: string
  model: string
  createdAt: number
  updatedAt: number
}

// Token Statistics
interface TokenStats {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  maxTokens: number
  contextUsage: number // percentage
  inputCost: number
  outputCost: number
  totalCost: number
}

// Tab
interface TabState {
  id: string
  sessionId: string | null
  title: string
  isActive: boolean
  order: number
}

// Settings
interface AppSettings {
  theme: 'dark' | 'light'
  fontSize: number
  fontFamily: string
  autoCompact: boolean
  compactThreshold: number
  autoSave: boolean
  saveInterval: number
  defaultModel: string
  defaultWorkingDir: string
  keyboardShortcuts: Record<string, string>
}

// Checkpoint
interface Checkpoint {
  id: number
  sessionId: string
  title: string
  timestamp: number
  messages: Message[]
  tokenStats: TokenStats
  metadata?: Record<string, any>
  tags?: string[]
}

// Compaction
interface CompactionResult {
  success: boolean
  oldSessionId: string
  newSessionId: string
  summary: string
  tokensSaved: number
  duration: number
}

// Performance
interface PerformanceMetric {
  name: string
  value: number
  unit: string
  timestamp: number
  tags?: Record<string, string>
}

// Git Status (from get_git_status command)
interface GitStatus {
  modified: string[]
  added: string[]
  deleted: string[]
  renamed: string[]
}
```

### Error Types

```typescript
// Application Error
class AppError extends Error {
  code: string
  details?: any
  recoverable: boolean
}

// Error Codes
enum ErrorCode {
  // Session Errors
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  SESSION_ALREADY_EXISTS = 'SESSION_ALREADY_EXISTS',
  SESSION_SPAWN_FAILED = 'SESSION_SPAWN_FAILED',
  
  // Claude Errors
  CLAUDE_NOT_FOUND = 'CLAUDE_NOT_FOUND',
  CLAUDE_SPAWN_FAILED = 'CLAUDE_SPAWN_FAILED',
  CLAUDE_COMMUNICATION_ERROR = 'CLAUDE_COMMUNICATION_ERROR',
  
  // Network Errors
  CONNECTION_LOST = 'CONNECTION_LOST',
  WEBSOCKET_ERROR = 'WEBSOCKET_ERROR',
  
  // Database Errors
  DATABASE_ERROR = 'DATABASE_ERROR',
  CHECKPOINT_NOT_FOUND = 'CHECKPOINT_NOT_FOUND',
  
  // Hook Errors
  HOOK_EXECUTION_FAILED = 'HOOK_EXECUTION_FAILED',
  HOOK_TIMEOUT = 'HOOK_TIMEOUT',
  
  // System Errors
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  OUT_OF_MEMORY = 'OUT_OF_MEMORY'
}
```

---

## Usage Examples

### Creating a Session

```typescript
// Frontend
import { invoke } from '@tauri-apps/api/core';
import { useClaudeCodeStore } from './stores/claudeCodeStore';

async function createNewSession() {
  const store = useClaudeCodeStore.getState();

  // Create session via Tauri
  const response = await invoke('spawn_claude_session', {
    request: {
      project_path: '/path/to/project',
      model: 'opus',
      prompt: 'Hello, Claude!'
    }
  });

  // Update store with session info
  store.createSession({
    id: response.session_id,
    workingDirectory: '/path/to/project'
  });

  console.log('Session created:', response.session_id);
}
```

### Sending a Message

```typescript
import { invoke } from '@tauri-apps/api/core';

async function sendMessage(sessionId: string, message: string) {
  try {
    // Send message to Claude session
    await invoke('send_claude_message', {
      request: {
        session_id: sessionId,
        message: message
      }
    });

    console.log('Message sent successfully');
  } catch (error) {
    console.error('Failed to send message:', error);
  }
}

// Listen for Claude events via Tauri event system
import { listen } from '@tauri-apps/api/event';

// Listen for streaming chunks
const unlisten = await listen(`claude-stream:${sessionId}`, (event) => {
  const { content } = event.payload;
  // Update UI with streaming content
  updateMessage(content);
});
```

### Executing a Hook

```typescript
import { invoke } from '@tauri-apps/api/core';

// Execute a hook with custom script
const response = await invoke('execute_hook', {
  event: 'pre_tool_use',
  script: `#!/bin/bash
    input=$(cat)
    tool=$(echo "$input" | jq -r '.data.tool')
    echo '{"action":"continue"}'
  `,
  data: { tool: 'Edit', input: { file_path: '/path/to/file.ts' } },
  session_id: sessionId,
  timeout_ms: 5000
});

console.log('Hook result:', response);
```

### Database Operations

```typescript
import { invoke } from '@tauri-apps/api/core';

// Save a session to the database
await invoke('db_save_session', {
  session: {
    id: sessionId,
    title: 'My Session',
    project_path: '/path/to/project',
    model: 'opus',
    created_at: Date.now(),
    updated_at: Date.now()
  }
});

// Load all sessions
const sessions = await invoke('db_load_all_sessions');

// Save a message
await invoke('db_save_message', {
  message: {
    id: messageId,
    session_id: sessionId,
    role: 'user',
    content: 'Hello, Claude!',
    timestamp: Date.now()
  }
});

// Export all data for backup
const exportData = await invoke('db_export_data');
console.log('Exported data:', exportData);
```

### Managing Custom Commands

```typescript
import { invoke } from '@tauri-apps/api/core';

// Load all custom commands
const commands = await invoke('load_custom_commands');

// Save a new custom command
await invoke('save_custom_command', {
  command: {
    id: 'custom-cmd-review',
    name: 'review',
    description: 'Review the current code changes',
    template: 'Please review the following changes and provide feedback:\n$ARGUMENTS',
    category: 'code',
    has_params: true,
    enabled: true,
    created_at: Date.now(),
    updated_at: Date.now()
  }
});

// Delete a command
await invoke('delete_custom_command', {
  command_name: 'review'
});
```

### Compaction Management

```typescript
import { invoke } from '@tauri-apps/api/core';

// Update context usage (triggers auto-compaction at 60%)
const action = await invoke('update_context_usage', {
  session_id: sessionId,
  usage: 0.55  // 55% - warning threshold
});

// Get compaction configuration
const config = await invoke('get_compaction_config');
console.log('Auto threshold:', config.auto_threshold);  // 0.60
console.log('Force threshold:', config.force_threshold);  // 0.65

// Update compaction configuration
await invoke('update_compaction_config', {
  config: {
    auto_threshold: 0.60,       // Auto-compact at 60%
    force_threshold: 0.65,      // Force compact at 65%
    preserve_context: true,
    generate_manifest: true
  }
});
```

### MCP Server Management

```typescript
import { invoke } from '@tauri-apps/api/core';

// List all MCP servers
const servers = await invoke('mcp_list');

// Add a new MCP server
await invoke('mcp_add', {
  name: 'my-mcp-server',
  transport: 'stdio',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/dir'],
  env: {},
  scope: 'global'
});

// Test connection
const result = await invoke('mcp_test_connection', {
  name: 'my-mcp-server'
});

// Import from Claude Desktop
const importResult = await invoke('mcp_import_claude_desktop');
console.log('Imported servers:', importResult);
```

### Plugin Management

```typescript
import { invoke } from '@tauri-apps/api/core';

// List installed plugins
const plugins = await invoke('plugin_list');
console.log('Installed plugins:', plugins);

// Validate plugin before installation
const manifest = await invoke('plugin_validate', {
  sourcePath: '/path/to/plugin-directory'
});
console.log('Plugin manifest:', manifest);

// Install plugin
const installedPlugin = await invoke('plugin_install', {
  sourcePath: '/path/to/plugin-directory'
});
console.log('Installed:', installedPlugin);

// Enable plugin (syncs components)
await invoke('plugin_enable', {
  pluginId: 'my-plugin'
});

// Get plugin details
const details = await invoke('plugin_get_details', {
  pluginId: 'my-plugin'
});
console.log('Components:', details.components);

// Disable plugin
await invoke('plugin_disable', {
  pluginId: 'my-plugin'
});

// Uninstall plugin
await invoke('plugin_uninstall', {
  pluginId: 'my-plugin'
});
```

### Using Performance Monitor

```typescript
import { PerformanceMonitor } from '@/services/performanceMonitor';

// Get singleton instance
const perfMonitor = PerformanceMonitor.getInstance();

// Enable monitoring
perfMonitor.setEnabled(true);

// Mark start of operation
perfMonitor.mark('message-send');

// ... perform operation ...

// Measure duration
perfMonitor.measure('message-send');

// Record custom metric
perfMonitor.recordMetric('custom-operation', 123.45, 'ms');

// Get statistical summary
const summary = perfMonitor.getMetricsSummary();
console.log('Message send avg:', summary['message-send']?.avg);
console.log('Message send p99:', summary['message-send']?.p99);

// Export all metrics for analysis
const allMetrics = perfMonitor.exportMetrics();
console.log(JSON.stringify(allMetrics, null, 2));

// Disable monitoring
perfMonitor.setEnabled(false);
```

### Using File Search Service

```typescript
import { FileSearchService } from '@/services/fileSearchService';

const fileSearch = new FileSearchService();

// Fuzzy search for files
const results = await fileSearch.searchFiles(
  'componentts',  // Fuzzy matches "Component.ts"
  '/path/to/project',
  {
    searchType: 'fuzzy',
    maxResults: 20,
    includeHidden: false
  }
);

// Glob pattern search
const tsxFiles = await fileSearch.searchFiles(
  '**/*.tsx',
  '/path/to/project',
  { searchType: 'glob' }
);

// Get recently modified files
const recentFiles = await fileSearch.getRecentFiles(
  '/path/to/project',
  10
);

// Get Git changed files
const changedFiles = await fileSearch.getGitChangedFiles(
  '/path/to/project'
);

// Get folder contents
const folderContents = await fileSearch.getFolderContents(
  '/path/to/project/src',
  100
);
```

### Using Plugin Service

```typescript
import { PluginService } from '@/services/pluginService';

// Get singleton instance
const pluginService = PluginService.getInstance();

// Initialize (loads plugin registry)
await pluginService.initialize();

// List all plugins
const plugins = await pluginService.listPlugins();
console.log('Found plugins:', plugins.length);

// Install plugin with file picker dialog
await pluginService.installPluginFromDialog();

// Install plugin from path
await pluginService.installPlugin('/path/to/plugin');

// Enable plugin
await pluginService.enablePlugin('my-plugin');

// Disable plugin
await pluginService.disablePlugin('my-plugin');

// Uninstall plugin
await pluginService.uninstallPlugin('my-plugin');

// Refresh plugin list
await pluginService.refresh();
```

### Using Skills System

```typescript
// Skills are managed via localStorage and Settings UI

// Create custom skill
const skill = {
  id: 'react-best-practices',
  name: 'React Best Practices',
  description: 'Injects React coding standards',
  triggers: ['*.tsx', '*.jsx', 'react', '/^import.*from [\'"]react[\'"]/'],
  content: 'When working with React...',
  enabled: true,
  source: 'custom'
};

// Save to localStorage
const existingSkills = JSON.parse(
  localStorage.getItem('yume_custom_skills') || '[]'
);
existingSkills.push(skill);
localStorage.setItem(
  'yume_custom_skills',
  JSON.stringify(existingSkills)
);

// Load custom skills
const customSkills = JSON.parse(
  localStorage.getItem('yume_custom_skills') || '[]'
);

// Skills from plugins are loaded automatically when plugin is enabled
```

### Using Modal Service

```typescript
import { ModalService } from '@/services/modalService';

// Get singleton instance
const modalService = ModalService.getInstance();

// Show alert
await modalService.alert('Operation completed successfully!');

// Show confirmation dialog
const confirmed = await modalService.confirm(
  'Are you sure you want to delete this session?'
);

if (confirmed) {
  // User clicked OK
  console.log('Deleting session...');
} else {
  // User clicked Cancel
  console.log('Cancelled');
}

// These also work via global overrides
await alert('Global alert');
const result = await confirm('Global confirm');
```

### License Management

```typescript
import { useLicenseStore } from '@/stores/licenseManager';

// Get store instance
const licenseStore = useLicenseStore.getState();

// Validate license key
const isValid = await licenseStore.validateLicense(
  'XXXXX-XXXXX-XXXXX-XXXXX-XXXXX'
);

if (isValid) {
  // Activate license
  await licenseStore.activateLicense(
    'XXXXX-XXXXX-XXXXX-XXXXX-XXXXX'
  );
  console.log('License activated!');
}

// Get current features
const features = licenseStore.getFeatures();
console.log('Max tabs:', features.maxTabs);       // 2 (trial) or 99 (pro)
console.log('Max windows:', features.maxWindows); // 1 (trial) or 99 (pro)
console.log('Is trial:', features.isTrial);
console.log('Is licensed:', features.isLicensed);

// Manually refresh license status
await licenseStore.refreshLicenseStatus();

// Deactivate license
licenseStore.deactivateLicense();
```

### Analytics Dashboard

```typescript
// Analytics are accessed via server endpoint

const port = await invoke('get_server_port');

// Fetch analytics data
const response = await fetch(
  `http://localhost:${port}/analytics?timeRange=30d&projectPath=/path/to/project`
);

const analytics = await response.json();

console.log('Total sessions:', analytics.totalSessions);
console.log('Total tokens:', analytics.totalTokens);
console.log('Total cost:', analytics.totalCost);

// Breakdown by project
analytics.byProject.forEach(project => {
  console.log(`${project.projectPath}: ${project.sessionCount} sessions`);
});

// Breakdown by model
analytics.byModel.forEach(model => {
  console.log(`${model.model}: ${model.tokenCount} tokens`);
});

// Daily breakdown
analytics.byDate.forEach(day => {
  console.log(`${day.date}: ${day.tokenCount} tokens`);
});
```

---

## Best Practices

1. **Error Handling**: Always wrap API calls in try-catch blocks
2. **Type Safety**: Use TypeScript interfaces for all API calls
3. **Performance**: Batch operations when possible
4. **Security**: Validate all user input before API calls
5. **State Management**: Keep store and server state synchronized
6. **WebSocket**: Implement reconnection logic for reliability
7. **Database**: Use transactions for multi-step operations
8. **Hooks**: Test hooks thoroughly before enabling
9. **MCP**: Validate server configurations before connecting
10. **Monitoring**: Track performance metrics in production

---

## Error Handling

All API calls can throw errors. Handle them appropriately:

```typescript
try {
  const result = await invoke('command_name', params);
  // Handle success
} catch (error) {
  if (error.code === 'SESSION_NOT_FOUND') {
    // Handle specific error
  } else {
    // Handle generic error
    console.error('API call failed:', error);
  }
}
```

---

## Migration Guide

For migrating from other Claude GUIs:

1. **Export data** from previous application
2. **Import sessions** using `db_import_data` command
3. **Configure hooks** using `execute_hook` and `test_hook` commands
4. **Set up MCP servers** using `mcp_add` and `mcp_import_claude_desktop`
5. **Adjust settings** using `save_settings` and `save_claude_settings`

---

This API reference covers all public Tauri commands in Yume. For internal implementation details, refer to the source code in `src-tauri/src/commands/`.
