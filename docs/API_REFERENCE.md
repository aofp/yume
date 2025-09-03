# Yurucode API Reference

**Version:** 1.0.0  
**Last Updated:** January 3, 2025

## Table of Contents

1. [Tauri Commands API](#tauri-commands-api)
2. [WebSocket API](#websocket-api)
3. [Frontend Services API](#frontend-services-api)
4. [Store API](#store-api)
5. [Hook System API](#hook-system-api)
6. [Database API](#database-api)
7. [MCP Protocol API](#mcp-protocol-api)
8. [Type Definitions](#type-definitions)

---

## Tauri Commands API

Tauri commands are invoked from the frontend using the `invoke` function. All commands return Promises.

### Session Management

#### `spawn_claude_safe`
Spawns a new Claude session.

```typescript
invoke('spawn_claude_safe', {
  session_id: string,
  working_dir?: string,
  model?: string,
  env?: Record<string, string>
}) => Promise<SessionInfo>
```

**Returns:**
```typescript
interface SessionInfo {
  session_id: string;
  pid: number;
  status: 'active' | 'idle' | 'terminated';
  created_at: number;
  working_directory: string;
}
```

#### `send_message_to_claude_safe`
Sends a message to an active Claude session.

```typescript
invoke('send_message_to_claude_safe', {
  session_id: string,
  message: string,
  attachments?: string[]
}) => Promise<MessageResult>
```

**Returns:**
```typescript
interface MessageResult {
  success: boolean;
  message_id: string;
  timestamp: number;
}
```

#### `kill_claude_safe`
Terminates a Claude session.

```typescript
invoke('kill_claude_safe', {
  session_id: string,
  force?: boolean
}) => Promise<void>
```

#### `get_all_sessions_safe`
Retrieves all active sessions.

```typescript
invoke('get_all_sessions_safe') => Promise<SessionInfo[]>
```

#### `restart_claude_safe`
Restarts a Claude session.

```typescript
invoke('restart_claude_safe', {
  session_id: string,
  preserve_context?: boolean
}) => Promise<SessionInfo>
```

#### `clear_session_history_safe`
Clears the message history of a session.

```typescript
invoke('clear_session_history_safe', {
  session_id: string
}) => Promise<void>
```

#### `get_session_messages_safe`
Retrieves messages for a session.

```typescript
invoke('get_session_messages_safe', {
  session_id: string,
  limit?: number,
  offset?: number
}) => Promise<Message[]>
```

### File Operations

#### `open_in_editor`
Opens a file in the system's default editor.

```typescript
invoke('open_in_editor', {
  path: string
}) => Promise<void>
```

#### `open_file_in_system`
Opens a file with the system's default application.

```typescript
invoke('open_file_in_system', {
  path: string
}) => Promise<void>
```

#### `get_available_fonts`
Retrieves available system fonts.

```typescript
invoke('get_available_fonts') => Promise<string[]>
```

### Claude Binary Detection

#### `check_claude_binary_sync`
Synchronously checks if Claude binary exists.

```typescript
invoke('check_claude_binary_sync', {
  path?: string
}) => Promise<boolean>
```

#### `get_claude_installations`
Finds all Claude installations on the system.

```typescript
invoke('get_claude_installations') => Promise<ClaudeInstallation[]>
```

**Returns:**
```typescript
interface ClaudeInstallation {
  path: string;
  version: string;
  location: 'system' | 'user' | 'wsl';
  is_valid: boolean;
}
```

#### `test_claude_binary_with_version`
Tests a Claude binary and retrieves its version.

```typescript
invoke('test_claude_binary_with_version', {
  path: string
}) => Promise<ClaudeVersion>
```

#### `detect_claude_system`
Detects the Claude installation method.

```typescript
invoke('detect_claude_system') => Promise<ClaudeSystem>
```

**Returns:**
```typescript
interface ClaudeSystem {
  method: 'native' | 'wsl' | 'docker' | 'none';
  binary_path?: string;
  version?: string;
}
```

### Settings Management

#### `save_claude_settings`
Saves Claude configuration settings.

```typescript
invoke('save_claude_settings', {
  settings: ClaudeSettings
}) => Promise<void>
```

**Settings Structure:**
```typescript
interface ClaudeSettings {
  binary_path: string;
  default_model: string;
  api_key?: string;
  max_tokens: number;
  temperature: number;
  stream: boolean;
}
```

#### `get_saved_claude_settings`
Retrieves saved Claude settings.

```typescript
invoke('get_saved_claude_settings') => Promise<ClaudeSettings>
```

### Project Management

#### `get_recent_projects`
Retrieves the list of recent projects.

```typescript
invoke('get_recent_projects') => Promise<Project[]>
```

**Returns:**
```typescript
interface Project {
  path: string;
  name: string;
  last_accessed: number;
  session_count: number;
}
```

#### `add_recent_project`
Adds a project to the recent list.

```typescript
invoke('add_recent_project', {
  path: string,
  name?: string
}) => Promise<void>
```

#### `remove_recent_project`
Removes a project from the recent list.

```typescript
invoke('remove_recent_project', {
  path: string
}) => Promise<void>
```

#### `clear_recent_projects`
Clears all recent projects.

```typescript
invoke('clear_recent_projects') => Promise<void>
```

### Database Operations

#### `init_database_command`
Initializes the database.

```typescript
invoke('init_database_command') => Promise<void>
```

#### `save_checkpoint`
Saves a conversation checkpoint.

```typescript
invoke('save_checkpoint', {
  session_id: string,
  title: string,
  messages: Message[],
  metadata?: Record<string, any>
}) => Promise<number> // checkpoint_id
```

#### `load_checkpoint`
Loads a checkpoint.

```typescript
invoke('load_checkpoint', {
  checkpoint_id: number
}) => Promise<Checkpoint>
```

#### `list_checkpoints`
Lists all checkpoints.

```typescript
invoke('list_checkpoints', {
  session_id?: string,
  limit?: number,
  offset?: number
}) => Promise<Checkpoint[]>
```

#### `delete_checkpoint`
Deletes a checkpoint.

```typescript
invoke('delete_checkpoint', {
  checkpoint_id: number
}) => Promise<void>
```

#### `search_checkpoints`
Searches checkpoints by content.

```typescript
invoke('search_checkpoints', {
  query: string,
  limit?: number
}) => Promise<Checkpoint[]>
```

#### `search_history`
Searches message history.

```typescript
invoke('search_history', {
  query: string,
  session_id?: string,
  limit?: number
}) => Promise<Message[]>
```

### Hook System

#### `get_hooks_config`
Retrieves hook configurations.

```typescript
invoke('get_hooks_config') => Promise<HookConfig[]>
```

#### `save_hooks_config_command`
Saves hook configurations.

```typescript
invoke('save_hooks_config_command', {
  hooks: HookConfig[]
}) => Promise<void>
```

#### `validate_hook_command`
Validates a hook command.

```typescript
invoke('validate_hook_command', {
  command: string,
  args: string[]
}) => Promise<ValidationResult>
```

#### `execute_hook_command`
Executes a hook.

```typescript
invoke('execute_hook_command', {
  hook: HookConfig,
  data: any
}) => Promise<HookResult>
```

#### `test_hook_command`
Tests a hook configuration.

```typescript
invoke('test_hook_command', {
  hook: HookConfig
}) => Promise<TestResult>
```

### Compaction

#### `detect_compaction`
Detects if compaction is needed.

```typescript
invoke('detect_compaction', {
  session_id: string
}) => Promise<CompactionStatus>
```

**Returns:**
```typescript
interface CompactionStatus {
  needed: boolean;
  usage: number; // percentage
  threshold: number;
}
```

#### `trigger_compaction`
Manually triggers compaction.

```typescript
invoke('trigger_compaction', {
  session_id: string,
  preserve_count?: number
}) => Promise<CompactionResult>
```

#### `get_compaction_status`
Gets current compaction status.

```typescript
invoke('get_compaction_status', {
  session_id: string
}) => Promise<CompactionProgress>
```

#### `cancel_compaction`
Cancels ongoing compaction.

```typescript
invoke('cancel_compaction', {
  session_id: string
}) => Promise<void>
```

#### `get_compaction_history`
Retrieves compaction history.

```typescript
invoke('get_compaction_history', {
  session_id?: string,
  limit?: number
}) => Promise<CompactionEvent[]>
```

### MCP (Model Context Protocol)

#### `mcp_list`
Lists MCP servers.

```typescript
invoke('mcp_list') => Promise<McpServer[]>
```

#### `mcp_add`
Adds an MCP server.

```typescript
invoke('mcp_add', {
  server: McpServer
}) => Promise<void>
```

#### `mcp_remove`
Removes an MCP server.

```typescript
invoke('mcp_remove', {
  name: string
}) => Promise<void>
```

#### `mcp_test_connection`
Tests MCP server connection.

```typescript
invoke('mcp_test_connection', {
  name: string
}) => Promise<ConnectionResult>
```

### System Commands

#### `get_machine_id`
Gets unique machine identifier.

```typescript
invoke('get_machine_id') => Promise<string>
```

#### `open_external`
Opens URL in default browser.

```typescript
invoke('open_external', {
  url: string
}) => Promise<void>
```

#### `run_bash`
Executes a bash command.

```typescript
invoke('run_bash', {
  command: string,
  cwd?: string,
  env?: Record<string, string>
}) => Promise<BashResult>
```

**Returns:**
```typescript
interface BashResult {
  stdout: string;
  stderr: string;
  exit_code: number;
}
```

#### `get_git_status`
Gets git repository status.

```typescript
invoke('get_git_status', {
  directory: string
}) => Promise<GitStatus>
```

---

## WebSocket API

WebSocket communication between frontend and embedded Node.js server.

### Client → Server Events

#### `spawn-claude`
Spawns a new Claude session.

```javascript
socket.emit('spawn-claude', {
  sessionId: string,
  workingDir: string,
  model?: string,
  env?: object
}, callback)
```

#### `send-message`
Sends a message to Claude.

```javascript
socket.emit('send-message', {
  sessionId: string,
  message: string
}, callback)
```

#### `interrupt`
Interrupts Claude's response.

```javascript
socket.emit('interrupt', {
  sessionId: string
})
```

#### `clear-context`
Clears session context.

```javascript
socket.emit('clear-context', {
  sessionId: string
})
```

#### `get-sessions`
Retrieves all sessions.

```javascript
socket.emit('get-sessions', {}, callback)
```

#### `get-session-info`
Gets session information.

```javascript
socket.emit('get-session-info', {
  sessionId: string
}, callback)
```

#### `kill-session`
Terminates a session.

```javascript
socket.emit('kill-session', {
  sessionId: string
})
```

### Server → Client Events

#### `session-created`
Emitted when session is created.

```javascript
socket.on('session-created', (data: {
  sessionId: string,
  pid: number,
  workingDir: string
}) => {})
```

#### `stream-start`
Emitted when streaming begins.

```javascript
socket.on('stream-start', (data: {
  sessionId: string,
  messageId: string
}) => {})
```

#### `stream-chunk`
Emitted for each stream chunk.

```javascript
socket.on('stream-chunk', (data: {
  sessionId: string,
  messageId: string,
  content: string,
  delta: string
}) => {})
```

#### `stream-complete`
Emitted when streaming completes.

```javascript
socket.on('stream-complete', (data: {
  sessionId: string,
  messageId: string,
  content: string,
  tokens: TokenStats
}) => {})
```

#### `token-update`
Emitted with token statistics.

```javascript
socket.on('token-update', (data: {
  sessionId: string,
  stats: TokenStats
}) => {})
```

#### `error`
Emitted on error.

```javascript
socket.on('error', (data: {
  sessionId?: string,
  error: string,
  code?: string
}) => {})
```

#### `session-terminated`
Emitted when session ends.

```javascript
socket.on('session-terminated', (data: {
  sessionId: string,
  reason: string
}) => {})
```

#### `compact-triggered`
Emitted when auto-compact triggers.

```javascript
socket.on('compact-triggered', (data: {
  sessionId: string,
  usage: number
}) => {})
```

#### `compact-complete`
Emitted when compaction completes.

```javascript
socket.on('compact-complete', (data: {
  sessionId: string,
  newSessionId: string,
  summary: string
}) => {})
```

---

## Frontend Services API

### TauriClaudeClient

**Location:** `src/renderer/services/tauriClaudeClient.ts`

```typescript
class TauriClaudeClient {
  // Session Management
  spawnSession(config: SessionConfig): Promise<SessionInfo>
  sendMessage(sessionId: string, message: string): Promise<void>
  killSession(sessionId: string): Promise<void>
  getSessions(): Promise<SessionInfo[]>
  
  // File Operations
  openFile(path: string): Promise<void>
  openInEditor(path: string): Promise<void>
  
  // Settings
  saveSettings(settings: AppSettings): Promise<void>
  loadSettings(): Promise<AppSettings>
}
```

### PerformanceMonitor

**Location:** `src/renderer/services/performanceMonitor.ts`

```typescript
class PerformanceMonitor {
  // Monitoring
  startMonitoring(): void
  stopMonitoring(): void
  
  // Metrics
  recordMetric(name: string, value: number, unit: string): void
  getMetric(name: string): PerformanceMetric
  getAllMetrics(): PerformanceMetric[]
  
  // Thresholds
  setThreshold(metric: string, warning: number, critical: number): void
  checkThresholds(): ThresholdViolation[]
  
  // Reporting
  generateReport(): PerformanceReport
  exportMetrics(): string
}
```

### CompactionService

**Location:** `src/renderer/services/compactionService.ts`

```typescript
class CompactionService {
  // Monitoring
  monitorUsage(sessionId: string): void
  stopMonitoring(sessionId: string): void
  
  // Compaction
  triggerCompaction(sessionId: string): Promise<CompactionResult>
  getCompactionStatus(sessionId: string): CompactionStatus
  
  // Settings
  setThreshold(threshold: number): void
  setAutoTrigger(enabled: boolean): void
}
```

### HooksService

**Location:** `src/renderer/services/hooksService.ts`

```typescript
class HooksService {
  // Configuration
  getHooks(): Promise<HookConfig[]>
  saveHooks(hooks: HookConfig[]): Promise<void>
  
  // Execution
  executeHook(trigger: HookTrigger, data: any): Promise<HookResult>
  executeHooksForTrigger(trigger: HookTrigger, data: any): Promise<HookResult[]>
  
  // Validation
  validateHook(hook: HookConfig): Promise<ValidationResult>
  testHook(hook: HookConfig): Promise<TestResult>
}
```

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
  | 'before-message'
  | 'after-message'
  | 'on-error'
  | 'session-start'
  | 'session-end'
  | 'session-compact'
  | 'file-change'
  | 'app-start'
  | 'app-shutdown'
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

// Git Status
interface GitStatus {
  branch: string
  ahead: number
  behind: number
  staged: string[]
  modified: string[]
  untracked: string[]
  conflicts: string[]
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
import { invoke } from '@tauri-apps/api';
import { useClaudeCodeStore } from './stores/claudeCodeStore';

async function createNewSession() {
  const store = useClaudeCodeStore.getState();
  
  // Create session via Tauri
  const sessionInfo = await invoke('spawn_claude_safe', {
    session_id: crypto.randomUUID(),
    working_dir: '/path/to/project',
    model: 'claude-3-sonnet'
  });
  
  // Update store
  store.createSession({
    id: sessionInfo.session_id,
    workingDirectory: sessionInfo.working_directory
  });
  
  // Connect via WebSocket
  socket.emit('spawn-claude', {
    sessionId: sessionInfo.session_id,
    workingDir: sessionInfo.working_directory
  });
}
```

### Sending a Message

```typescript
async function sendMessage(message: string) {
  const { activeSessionId } = useClaudeCodeStore.getState();
  
  // Send via WebSocket
  socket.emit('send-message', {
    sessionId: activeSessionId,
    message
  }, (response) => {
    if (response.error) {
      console.error('Failed to send message:', response.error);
    }
  });
  
  // Listen for response
  socket.on('stream-chunk', (data) => {
    if (data.sessionId === activeSessionId) {
      // Update UI with streaming content
      updateMessage(data.content);
    }
  });
}
```

### Implementing a Hook

```typescript
// Define hook configuration
const formatCodeHook: HookConfig = {
  name: 'format-code',
  trigger: 'before-message',
  command: 'prettier',
  args: ['--write', '${file}'],
  blocking: true,
  timeout: 5000,
  enabled: true
};

// Save hook
await invoke('save_hooks_config_command', {
  hooks: [formatCodeHook]
});

// Hook will automatically execute before messages are sent
```

### Monitoring Performance

```typescript
import { perfMonitor } from './services/performanceMonitor';

// Start monitoring
perfMonitor.startMonitoring();

// Record custom metric
perfMonitor.recordMetric('custom.operation', 150, 'ms');

// Check for violations
const violations = perfMonitor.checkThresholds();
if (violations.length > 0) {
  console.warn('Performance issues detected:', violations);
}

// Generate report
const report = perfMonitor.generateReport();
console.log('Performance Report:', report);
```

### Database Operations

```typescript
// Save checkpoint
const checkpointId = await invoke('save_checkpoint', {
  session_id: sessionId,
  title: 'Important milestone',
  messages: currentMessages,
  metadata: {
    model: 'claude-3-sonnet',
    timestamp: Date.now()
  }
});

// Search history
const results = await invoke('search_history', {
  query: 'implement feature',
  limit: 10
});

// Load checkpoint
const checkpoint = await invoke('load_checkpoint', {
  checkpoint_id: checkpointId
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

## Rate Limits

| Operation | Limit | Window |
|-----------|-------|--------|
| Session creation | 10 | 1 minute |
| Message sending | 60 | 1 minute |
| Database queries | 100 | 1 minute |
| Hook executions | 30 | 1 minute |
| File operations | 50 | 1 minute |

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
2. **Import checkpoints** using database API
3. **Configure hooks** to match workflow
4. **Set up MCP servers** if using
5. **Adjust settings** to preference

---

This API reference covers all public APIs in Yurucode. For internal implementation details, refer to the source code.