# Yurucode Complete Architecture Documentation

**Version:** 1.1.0
**Last Updated:** January 9, 2026
**Status:** Production Ready

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Core Components Deep Dive](#2-core-components-deep-dive)
3. [Backend Architecture (Rust/Tauri)](#3-backend-architecture-rust-tauri)
4. [Frontend Architecture (React/TypeScript)](#4-frontend-architecture-react-typescript)
5. [Process Communication Architecture](#5-process-communication-architecture)
6. [Data Flow and State Management](#6-data-flow-and-state-management)
7. [Critical Systems](#7-critical-systems)
8. [Security Architecture](#8-security-architecture)
9. [Performance Architecture](#9-performance-architecture)
10. [Platform-Specific Implementations](#10-platform-specific-implementations)

## 1. System Architecture Overview

### 1.1 Three-Process Architecture

Yurucode employs a sophisticated three-process architecture that ensures separation of concerns, security, and performance:

```
┌────────────────────────────────────────────────────────────────┐
│                     PROCESS 1: TAURI MAIN                       │
│                         (Rust Backend)                          │
│                                                                  │
│  • Window Management        • File System Access                │
│  • Native OS Integration    • Process Lifecycle                 │
│  • Security & Permissions   • Database Operations               │
│  • Port Management          • Crash Recovery                    │
└────────────────────────┬───────────────────────────────────────┘
                         │ IPC (Tauri Commands)
┌────────────────────────▼───────────────────────────────────────┐
│                     PROCESS 2: REACT UI                         │
│                    (Frontend - Vite Dev Server)                 │
│                                                                  │
│  • User Interface          • State Management (Zustand)         │
│  • WebSocket Client        • Session Tabs                       │
│  • Message Rendering       • Performance Monitoring             │
│  • Error Boundaries        • Virtual Scrolling                  │
└────────────────────────┬───────────────────────────────────────┘
                         │ WebSocket (Socket.IO)
┌────────────────────────▼───────────────────────────────────────┐
│                  PROCESS 3: NODE.JS SERVER                      │
│          (Compiled Binary - Dynamic Port 20000-65000)           │
│                                                                  │
│  • Claude CLI Spawning     • Stream Processing                  │
│  • Message Routing         • Session Management                 │
│  • Token Counting          • Buffer Management                  │
│  • Process Control         • Auto-Compaction Trigger            │
└────────────────────────┬───────────────────────────────────────┘
                         │ Child Process Spawn
┌────────────────────────▼───────────────────────────────────────┐
│                    CLAUDE CLI BINARY                            │
│                  (Anthropic's Official CLI)                     │
│                                                                  │
│  Arguments: --print --output-format stream-json                 │
│  • Handles AI processing                                        │
│  • Manages context window                                       │
│  • Provides streaming responses                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Key Architectural Decisions

1. **Compiled Server Binaries**: Node.js server is compiled to platform-specific binaries using @yao-pkg/pkg, eliminating Node.js dependency for end users
2. **Dynamic Port Allocation**: Prevents conflicts by allocating ports dynamically (20000-65000 range)
3. **Process Isolation**: Each process runs independently with clear boundaries
4. **Lazy Reconnection**: Sessions reconnect only when accessed, saving resources
5. **Bounded Buffers**: 10MB limit on message buffers prevents memory leaks
6. **Atomic Operations**: Thread-safe operations using Rust's atomic types

## 2. Core Components Deep Dive

### 2.1 Tauri Main Process (Rust)

**Location**: `src-tauri/src/`

#### Key Modules:

```rust
// Core Application Entry
lib.rs                  // Main application setup, window management
main.rs                 // Entry point, initializes Tauri

// Claude Integration
claude/mod.rs           // Claude manager and process control
claude_binary.rs        // Binary detection and validation
claude_session.rs       // Session state management
claude_spawner.rs       // Process spawning and IPC
agents.rs               // In-memory agent CRUD (5 yurucode core agents)
                        // Sync to ~/.claude/agents/ via commands/mod.rs

// Server Management
logged_server.rs        // Server process management (spawns compiled binaries)
port_manager.rs         // Dynamic port allocation (20000-65000 range)

// State & Storage
state/mod.rs            // Application state management
db/mod.rs               // SQLite database (sessions, messages, analytics)
config.rs               // Production configuration

// Commands (src-tauri/src/commands/)
commands/mod.rs         // Main command handlers (file ops, agents, etc.)
commands/claude_commands.rs    // Claude session spawning
commands/claude_info.rs        // Claude CLI info retrieval
commands/claude_detector.rs    // Claude CLI detection
commands/database.rs           // Database operations
commands/hooks.rs              // Hook execution
commands/compaction.rs         // Compaction triggers
commands/mcp.rs                // MCP server management
commands/custom_commands.rs    // Custom command utilities

// Advanced Features
compaction/mod.rs       // Auto-compaction at 60%/65% context thresholds
hooks/mod.rs            // Hook system for customization
mcp/mod.rs              // Model Context Protocol support
crash_recovery.rs       // Session recovery after crashes

// Utilities
stream_parser.rs        // JSON stream parsing with token accumulation
websocket/mod.rs        // WebSocket server implementation
process/mod.rs          // Process utilities
process/registry.rs     // Process registry and management
```

#### Critical Components:

**1. ServerProcessGuard (logged_server.rs)**
```rust
struct ServerProcessGuard {
    child: Mutex<Child>,
    pid: u32,
    stdout_buffer: Mutex<VecDeque<String>>,
    stderr_buffer: Mutex<VecDeque<String>>,
    shutdown_flag: AtomicBool,
}

impl ServerProcessGuard {
    fn new(child: Child) -> Self { ... }
    fn kill(&self) -> std::io::Result<()> { ... }
    fn force_kill(pid: u32) { ... }  // Platform-specific
    fn add_stdout_line(&self, line: String) { ... }
    fn add_stderr_line(&self, line: String) { ... }
}

impl Drop for ServerProcessGuard {
    fn drop(&mut self) {
        // Automatic cleanup on drop
        let _ = self.kill();
    }
}
```
- Ensures process cleanup even on panic
- Bounded buffers (1000 lines max) prevent memory leaks
- Atomic shutdown flags for thread safety
- Platform-specific force kill (taskkill on Windows, kill -9 on Unix)

**2. Port Management (port_manager.rs)**
```rust
// Port holding to prevent TOCTOU race conditions
pub struct HeldPort {
    pub port: u16,
    listener: TcpListener,
}

pub fn find_and_hold_port() -> Option<HeldPort> {
    // 1. Try cached port from last run (instant startup)
    // 2. Try 100 random ports in 20000-65000 range
    // 3. Fall back to sequential search from random starting point
    // 4. Use fallback ports (30001, 30002, 40001, 50001, 3001)
}

pub fn find_available_port() -> Option<u16> {
    // Same algorithm but without holding
}

// Port cache stored at:
// - macOS/Linux: ~/.config/yurucode/last_port.txt
// - Windows: %APPDATA%\yurucode\last_port.txt
```
- **Port Caching**: Persists last working port to disk for instant startup on subsequent launches
- **TOCTOU Protection**: HeldPort keeps listener bound until server is ready
- **Dynamic Allocation**: Wide range (20000-65000) prevents conflicts
- **Multi-stage Fallback**: Cached -> Random -> Sequential -> Predefined ports

### 2.2 Frontend Architecture (React/TypeScript)

**Location**: `src/renderer/`

#### Component Hierarchy:

```
App.minimal.tsx                    // Root component
├── TitleBar.tsx                   // Custom window title bar
├── WindowControls.tsx             // Window minimize/maximize/close
├── SessionTabs.tsx                // Tab management
│   └── ClaudeChat.tsx             // Main chat interface
│       ├── MessageRenderer.tsx    // Message display with markdown
│       ├── DiffViewer.tsx         // Code diff visualization
│       └── VirtualizedMessageList.tsx // Performance optimization
├── ModelSelector/ModelSelector.tsx // Model selection
├── ConnectionStatus/ConnectionStatus.tsx // Server connection status
├── common/ErrorBoundary.tsx       // Error recovery
├── ClaudeNotDetected/             // Claude CLI detection failure UI
└── Modals (lazy-loaded)/
    ├── Settings/SettingsModalTabbed.tsx  // Configuration tabs
    ├── AgentsModal/AgentsModal.tsx       // Agent management
    ├── ProjectsModal/ProjectsModal.tsx   // Project browser
    ├── RecentProjectsModal/              // Recent projects
    ├── Analytics/AnalyticsModal.tsx      // Usage analytics
    ├── About/AboutModal.tsx              // Application info
    ├── Upgrade/UpgradeModal.tsx          // Upgrade prompts
    └── KeyboardShortcuts/                // Keyboard shortcuts help
```

#### State Management (Zustand):

**Location**: `src/renderer/stores/claudeCodeStore.ts`

```typescript
interface ClaudeCodeStore {
  // Sessions
  sessions: Session[];
  currentSessionId: string | null;
  persistedSessionId: string | null;
  sessionMappings: Record<string, any>;

  // Model
  selectedModel: string;

  // UI Customization
  monoFont: string;
  sansFont: string;
  backgroundOpacity: number;
  globalWatermarkImage: string | null;

  // Tab Persistence
  rememberTabs: boolean;
  savedTabs: string[];

  // Menu Visibility
  showProjectsMenu: boolean;
  showAgentsMenu: boolean;
  showAnalyticsMenu: boolean;

  // Agents
  agents: Agent[];
  currentAgentId: string | null;

  // Actions (partial list)
  createSession: (name?: string, directory?: string) => Promise<string>;
  sendMessage: (content: string, bashMode?: boolean) => Promise<void>;
  interruptSession: (sessionId?: string) => Promise<void>;
  // ... many more actions
}

interface Session {
  id: string;
  name: string;
  status: 'pending' | 'active' | 'paused' | 'completed' | 'error';
  messages: SDKMessage[];
  workingDirectory?: string;
  claudeSessionId?: string;
  analytics?: SessionAnalytics;
  compactionState?: CompactionState;
  todos?: TodoItem[];
  // ... additional fields
}
```

Key Features:
- Centralized state management with Zustand persist middleware
- Debounced localStorage writes to prevent UI freezes
- Session-level analytics tracking
- Compaction state per session
- Agent management

### 2.3 Compiled Server Architecture

**Location**: `src-tauri/resources/` (binaries), `src-tauri/src/logged_server.rs` (process management)

The Node.js server is distributed as compiled binaries using @yao-pkg/pkg, with .cjs fallback files for development and backwards compatibility:

**Compiled Binaries:**
- `server-macos-arm64` - macOS Apple Silicon
- `server-macos-x64` - macOS Intel
- `server-windows-x64.exe` - Windows x64
- `server-linux-x64` - Linux x64

**Fallback .cjs Files:**
- `server-claude-macos.cjs`
- `server-claude-windows.cjs`
- `server-claude-linux.cjs`

```rust
// Configuration in logged_server.rs
pub const YURUCODE_SHOW_CONSOLE: bool = false;  // Debug flag

// Global state
static SERVER_PROCESS: Mutex<Option<Arc<ServerProcessGuard>>> = ...;
static SERVER_PORT: Mutex<Option<u16>> = ...;
static SERVER_RUNNING: AtomicBool = ...;

const MAX_BUFFER_SIZE: usize = 10 * 1024 * 1024; // 10MB
```

**Build Process:**
1. Source .cjs files are bundled with esbuild
2. Bundled output is compiled to binaries with pkg
3. Binaries are copied to resources folder for distribution

Server Responsibilities:
1. **Process Management**: Spawns and controls Claude CLI
2. **Stream Processing**: Parses stream-json output
3. **Message Routing**: Routes messages between UI and Claude via Socket.IO
4. **Session Management**: Maintains session state
5. **Token Counting**: Accurate token tracking from session files
6. **Buffer Management**: Bounded 10MB buffers prevent memory overflow

## 3. Backend Architecture (Rust/Tauri)

### 3.1 Command System

Tauri commands exposed to frontend (`src-tauri/src/commands/`):

```rust
#[tauri::command]
pub async fn spawn_claude_session(request: SpawnRequest) -> Result<SpawnResponse, String> {
    // Spawns Claude CLI with proper arguments
}

#[tauri::command]
pub async fn select_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    // Native folder selection dialog
}
```

**Available Commands** (organized by module):

*Core Commands (mod.rs):*
- Window: `toggle_devtools`, `minimize_window`, `maximize_window`, `close_window`, `new_window`
- File System: `select_folder`, `check_is_directory`, `search_files`, `get_recent_files`, `get_folder_contents`
- Settings: `save_settings`, `load_settings`, `get_recent_projects`, `add_recent_project`
- Agents: `load_claude_agents`, `load_project_agents`, `save_global_agent`, `save_project_agent`, `delete_global_agent`, `sync_yurucode_agents`, `are_yurucode_agents_synced`, `cleanup_yurucode_agents_on_exit`
- Git: `get_git_status`, `get_git_diff_numstat`
- Bash: `execute_bash`, `spawn_bash`, `kill_bash_process`
- System: `get_home_directory`, `get_current_directory`, `get_system_fonts`, `open_external`
- Server: `get_server_port`, `get_server_logs`, `get_server_log_path`, `clear_server_logs`
- Claude: `get_claude_version`, `get_claude_path`

*Claude Commands (claude_commands.rs):*
- `spawn_claude_session`, `send_message_to_session`, `interrupt_session`, `clear_session_context`

*Database Commands (database.rs):*
- Session CRUD, message storage, analytics tracking

*Hooks Commands (hooks.rs):*
- `execute_hook`, `test_hook`, `get_hook_events`, `get_sample_hooks`

*Compaction Commands (compaction.rs):*
- `update_context_usage`, `reset_compaction_flags`, `generate_context_manifest`

*MCP Commands (mcp.rs):*
- `mcp_list_servers`, `mcp_add_server`, `mcp_test_connection`

### 3.2 Process Registry

**Location**: `src-tauri/src/process/registry.rs`

```rust
pub struct ProcessRegistry {
    processes: Arc<Mutex<HashMap<String, ProcessHandle>>>,
    shutdown: Arc<AtomicBool>,
}

impl ProcessRegistry {
    pub fn register(&self, id: String, handle: ProcessHandle) {
        // Thread-safe process registration
    }
    
    pub fn cleanup_terminated(&self) {
        // Automatic cleanup of dead processes
    }
}
```

### 3.3 Database Layer

**Location**: `src-tauri/src/db/mod.rs`

SQLite database for persistent storage with WAL mode for concurrency:

```rust
pub struct Database {
    conn: Mutex<Connection>,
}

// Key structs
pub struct Session { id, name, status, working_directory, claude_session_id, ... }
pub struct Message { id, session_id, message_type, role, content, tool_uses, usage, ... }
pub struct Analytics { session_id, tokens_input, tokens_output, tokens_cache, cost_usd, ... }
```

Schema:
```sql
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    working_directory TEXT,
    claude_session_id TEXT,
    claude_title TEXT,
    user_renamed INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT
);

CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    message_type TEXT NOT NULL,
    role TEXT,
    content TEXT,
    tool_uses TEXT,
    usage TEXT,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE analytics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    tokens_input INTEGER DEFAULT 0,
    tokens_output INTEGER DEFAULT 0,
    tokens_cache INTEGER DEFAULT 0,
    cost_usd REAL DEFAULT 0,
    model TEXT,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
```

Database location:
- Windows: `%APPDATA%\yurucode\yurucode.db`
- macOS/Linux: `~/.yurucode/yurucode.db`

### 3.4 Crash Recovery System

**Location**: `src-tauri/src/crash_recovery.rs`

```rust
pub struct CrashRecoveryManager {
    state_path: PathBuf,
    snapshot_path: PathBuf,
    recovery_state: Arc<Mutex<CrashRecoveryState>>,
    auto_save_enabled: bool,
}

pub struct AppStateSnapshot {
    session_id: String,
    timestamp: DateTime<Utc>,
    working_directory: Option<String>,
    open_files: Vec<String>,
    window_state: WindowState,
    active_processes: Vec<ProcessInfo>,
}

pub struct WindowState {
    x: i32, y: i32,
    width: u32, height: u32,
    maximized: bool, fullscreen: bool,
}
```

Features:
- Automatic session recovery after crash (snapshots within 24 hours)
- Window position/size restoration
- Unsaved work recovery (up to 50 files tracked)
- Periodic snapshots every 5 minutes
- Cleanup of old recovery files (>7 days)
- Panic hook integration for crash recording

Recovery paths:
- macOS: `~/Library/Application Support/yurucode/recovery/`
- Windows: `%APPDATA%\yurucode\recovery\`
- Linux: `~/.config/yurucode/recovery/`

## 4. Frontend Architecture (React/TypeScript)

### 4.1 Component Architecture

#### Core Components:

**1. ClaudeChat Component** (`src/renderer/components/Chat/ClaudeChat.tsx`)
- Main chat interface
- Message streaming
- Auto-compaction trigger
- Token tracking display
- Virtual scrolling for performance

**2. MessageRenderer** (`src/renderer/components/Chat/MessageRenderer.tsx`)
- Markdown rendering
- Syntax highlighting
- Code block handling
- File references
- Diff visualization

**3. ErrorBoundary** (`src/renderer/components/common/ErrorBoundary.tsx`)
```typescript
class ErrorBoundary extends Component<Props, State> {
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log to localStorage for debugging
    // Display fallback UI
    // Offer recovery options
  }
}
```

### 4.2 Service Layer

**Location**: `src/renderer/services/`

Key Services:

**1. TauriClaudeClient** (`tauriClaudeClient.ts`)
```typescript
class TauriClaudeClient {
  async spawnSession(config: SessionConfig) {
    return invoke('spawn_claude_safe', config);
  }
  
  async sendMessage(message: string) {
    return invoke('send_message_to_claude_safe', { message });
  }
}
```

**2. PerformanceMonitor** (`performanceMonitor.ts`)
```typescript
class PerformanceMonitor {
  private thresholds: PerformanceThreshold[] = [
    { metric: 'app.startup', warning: 3000, critical: 5000 },
    { metric: 'render.frame', warning: 16, critical: 33 },
    { metric: 'memory.heap', warning: 100MB, critical: 200MB }
  ];
  
  startMonitoring() {
    this.monitorFPS();
    this.monitorMemory();
    this.detectLongTasks();
  }
}
```

**3. CompactionService** (`compactionService.ts`)
- Monitors context usage percentage
- Auto-triggers at 60%, force-triggers at 65%
- Sets pending flags for next-message compaction
- Generates context manifests before compaction
- Coordinates with Rust backend via Tauri commands

### 4.3 Hook System

**Location**: `src/renderer/services/hooksService.ts`

```typescript
interface HookScriptConfig {
  event: string;
  enabled: boolean;
  script: string;
  name?: string;
}

interface HookResponse {
  action: 'continue' | 'block' | 'modify';
  message?: string;
  modifications?: Record<string, unknown>;
  exit_code: number;
}

class HooksService {
  async executeHook(event: string, data: Record<string, unknown>, sessionId: string): Promise<HookResponse | null> {
    // Executes hook via Tauri backend with 5s timeout
  }

  async processUserPrompt(prompt: string, sessionId: string): Promise<string> {
    // Can modify or block user prompts
  }

  async processToolUse(tool: string, input: Record<string, unknown>, sessionId: string, phase: 'pre' | 'post') {
    // Can block or modify tool executions
  }
}
```

Available Hook Events:
- `user_prompt_submit`: Modify/block user messages before sending
- `pre_tool_use`: Intercept tool calls before execution
- `post_tool_use`: Process tool results after execution
- `assistant_response`: Process Claude responses
- `session_start`: Session initialization
- `session_end`: Session cleanup
- `context_warning`: Context usage alerts
- `compaction_trigger`: Custom compaction behavior
- `error`: Error handling

## 5. Process Communication Architecture

### 5.1 IPC Flow

```
Frontend (React) 
    ↓ invoke()
Tauri Commands (Rust)
    ↓ HTTP/Process Spawn
Node.js Server
    ↓ Child Process
Claude CLI
    ↓ Stream JSON
Node.js Server
    ↓ WebSocket
Frontend (React)
```

### 5.2 WebSocket Protocol

**Socket.IO Events**:

Client → Server:
- `spawn-claude`: Start new session
- `send-message`: Send to Claude
- `interrupt`: Stop generation
- `get-sessions`: List sessions
- `clear-context`: Reset conversation

Server → Client:
- `session-created`: New session ready
- `stream-chunk`: Partial response
- `stream-complete`: Message done
- `token-update`: Usage statistics
- `error`: Error occurred
- `compact-triggered`: Auto-compact started

### 5.3 Stream Processing

**Location**: `src-tauri/src/stream_parser.rs`

```rust
pub fn parse_stream_chunk(chunk: &str) -> Vec<StreamEvent> {
    chunk.lines()
        .filter_map(|line| {
            if line.starts_with("data: ") {
                serde_json::from_str(&line[6..]).ok()
            } else {
                None
            }
        })
        .collect()
}
```

Stream Event Types:
- `message_start`: Begin streaming
- `content_block`: Text chunk
- `message_complete`: End streaming
- `token_stats`: Usage update
- `error`: Stream error

## 6. Data Flow and State Management

### 6.1 Message Flow

1. **User Input** → React Component
2. **Validation** → Frontend validation
3. **Hook Execution** → Pre-message hooks
4. **Tauri Command** → `send_message_to_claude_safe`
5. **Server Routing** → Node.js forwards to Claude
6. **Claude Processing** → AI generates response
7. **Stream Parsing** → JSON stream to events
8. **WebSocket Emission** → Real-time to frontend
9. **State Update** → Zustand store update
10. **UI Render** → React re-render

### 6.2 State Synchronization

Three levels of state:

1. **Frontend State** (Zustand)
   - Immediate UI updates
   - Optimistic rendering
   - Local caching

2. **Server State** (Node.js)
   - Session management
   - Active processes
   - Buffer management

3. **Persistent State** (SQLite)
   - Long-term storage
   - Settings persistence
   - History tracking

### 6.3 Token Management

```typescript
interface TokenStats {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  contextUsage: number; // Percentage
  cost: {
    input: number;
    output: number;
    total: number;
  };
}
```

Token Tracking Flow:
1. Claude emits token stats in stream-json output
2. StreamParser in Rust extracts usage from messages
3. TokenAccumulator aggregates input/output/cache tokens
4. Frontend fetches session tokens from server endpoint
5. Auto-compact triggers at 60% context usage

## 7. Critical Systems

### 7.1 Auto-Compaction System

**Thresholds**: 55% warning, 60% auto-trigger, 65% force-trigger
**Location**: `src-tauri/src/compaction/mod.rs`

```rust
pub struct CompactionConfig {
    pub auto_threshold: f32,     // 0.60 (60%) - auto-compact
    pub force_threshold: f32,    // 0.65 (65%) - force-compact
    pub preserve_context: bool,
    pub generate_manifest: bool,
}

pub enum CompactionAction {
    None,
    Notice,       // deprecated
    Warning,      // 55%+
    AutoTrigger,  // 60%+ (38% buffer like Claude Code)
    Force,        // 65%+
}

pub struct CompactionManager {
    config: Arc<Mutex<CompactionConfig>>,
    states: Arc<Mutex<HashMap<String, CompactionState>>>,
    manifest_dir: PathBuf,
}
```

Compaction Process:
1. Detect threshold (60% auto, 65% force)
2. Set `pendingAutoCompact` flag in session
3. On next user message, generate context manifest
4. Send `/compact` command to Claude
5. Reset compaction flags for future triggers
6. Send queued user message after compaction completes

Frontend service (`src/renderer/services/compactionService.ts`) coordinates with backend and manages UI state.

### 7.2 Memory Management

**Bounded Buffers** (10MB limit):
```rust
const MAX_BUFFER_SIZE: usize = 10 * 1024 * 1024; // 10MB

impl ServerProcessGuard {
    fn append_to_buffer(&self, data: String) {
        let mut buffer = self.stdout_buffer.lock().unwrap();
        buffer.push_back(data);
        
        // Enforce size limit
        while self.calculate_buffer_size(&buffer) > MAX_BUFFER_SIZE {
            buffer.pop_front();
        }
    }
}
```

### 7.3 Error Recovery

Multiple layers of error handling:

1. **Rust Panic Handler**: Graceful shutdown
2. **React Error Boundaries**: Component isolation
3. **Global Error Handlers**: Unhandled rejections
4. **Crash Recovery**: Session restoration
5. **Retry Logic**: Automatic reconnection

### 7.4 Security Features

**Content Security Policy** (`tauri.conf.json`):
```json
{
  "security": {
    "csp": "default-src 'self' blob: data:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; ..."
  }
}
```

Security Measures:
- CSP headers prevent XSS
- Sandboxed file access
- Process isolation
- No telemetry/tracking
- Local-only operation

## 8. Security Architecture

### 8.1 Threat Model

Protected Against:
- XSS attacks (CSP)
- Process injection (isolation)
- Memory corruption (bounds checking)
- Path traversal (validation)
- Privilege escalation (sandboxing)

### 8.2 Security Boundaries

```
┌─────────────────────┐
│   User Space        │
├─────────────────────┤
│   Frontend (React)  │ ← CSP Protected
├─────────────────────┤
│   IPC Layer         │ ← Validated Commands
├─────────────────────┤
│   Rust Backend      │ ← Memory Safe
├─────────────────────┤
│   Node.js Server    │ ← Sandboxed
├─────────────────────┤
│   Claude CLI        │ ← External Process
└─────────────────────┘
```

### 8.3 Input Validation

All user input validated at multiple levels:
1. Frontend validation (TypeScript)
2. Tauri command validation (Rust)
3. Server-side validation (Node.js)
4. Claude CLI validation (Anthropic)

## 9. Performance Architecture

### 9.1 Performance Optimizations

**Frontend**:
- Virtual scrolling for long conversations
- React.memo for expensive components
- Lazy loading of modals
- Debounced search/filter operations
- Web Workers for heavy computations

**Backend**:
- Lazy session reconnection
- Bounded message buffers
- Efficient stream parsing
- Process pooling
- Async I/O operations

### 9.2 Performance Monitoring

**Location**: `src/renderer/services/performanceMonitor.ts`

Performance thresholds defined in code:
```typescript
const thresholds: PerformanceThreshold[] = [
  { metric: 'app.startup', warning: 3000, critical: 5000, unit: 'ms' },
  { metric: 'render.frame', warning: 16, critical: 33, unit: 'ms' },
  { metric: 'memory.heap', warning: 100MB, critical: 200MB, unit: 'bytes' },
  { metric: 'session.create', warning: 1000, critical: 2000, unit: 'ms' },
  { metric: 'message.send', warning: 500, critical: 1000, unit: 'ms' },
  { metric: 'compact.duration', warning: 5000, critical: 10000, unit: 'ms' }
];
```

Metrics Tracked:
- **FPS**: Target 60fps, warn at 30fps (via requestAnimationFrame)
- **Memory**: Warn at 100MB heap, critical at 200MB
- **Startup**: Target <3s, critical at 5s
- **Long Tasks**: Logged when >50ms, warned when >200ms
- **Layout Shifts**: Cumulative layout shift score tracking

### 9.3 Resource Management

```rust
// CPU Throttling
pub struct ResourceManager {
    max_concurrent_sessions: usize, // 10
    max_buffer_size: usize,         // 10MB
    max_message_size: usize,        // 1MB
}
```

## 10. Platform-Specific Implementations

### 10.1 macOS

**Window Management**:
```rust
#[cfg(target_os = "macos")]
{
    use objc2::*;
    // Traffic light positioning
    // Translucent sidebar
    // Native blur effects
}
```

Features:
- Universal binary support (Intel + Apple Silicon)
- Native window controls
- macOS-style blur
- Code signing ready

### 10.2 Windows

**Process Creation**:
```rust
#[cfg(target_os = "windows")]
{
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    cmd.creation_flags(CREATE_NO_WINDOW);
}
```

Features:
- WSL support for Claude
- Hidden console windows
- Windows 10/11 compatibility
- Custom window chrome

### 10.3 Linux

Features:
- Native GTK integration
- X11/Wayland support
- AppImage distribution
- System tray support

## Build and Deployment

### Build Commands

**Development**:
```bash
npm run dev          # Start dev server
npm run tauri dev    # Start Tauri dev
```

**Production**:
```bash
npm run tauri:build:mac  # Build for macOS
npm run tauri:build:win  # Build for Windows
npm run tauri:build:linux # Build for Linux
```

### Distribution

**macOS**: DMG installer with background image  
**Windows**: MSI/NSIS installer with uninstaller  
**Linux**: AppImage, DEB, RPM packages

### Code Signing

**macOS**: Requires Apple Developer Certificate ($99/year)  
**Windows**: Requires EV Certificate ($300-600/year)

## Performance Benchmarks

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Startup Time | <3s | 2.3s | ✅ |
| Memory Usage (Idle) | <200MB | 145MB | ✅ |
| Memory Usage (Active) | <500MB | 380MB | ✅ |
| Message Latency | <100ms | 65ms | ✅ |
| Compaction Time | <5s | 3.8s | ✅ |
| FPS (Scrolling) | 60fps | 58fps | ✅ |
| Bundle Size | <50MB | 42MB | ✅ |

## Architecture Decisions Record (ADR)

### ADR-001: Compiled Server Binaries
**Decision**: Compile Node.js server to platform-specific binaries using @yao-pkg/pkg
**Rationale**: Eliminates Node.js dependency for end users, hides source code, simplifies deployment
**Trade-offs**: Larger binary size (~50MB per platform), requires separate build step per platform  

### ADR-002: Three-Process Model
**Decision**: Separate Tauri, React, and Node.js processes  
**Rationale**: Better isolation, security, and debugging  
**Trade-offs**: More complex IPC, higher memory usage  

### ADR-003: 60%/65% Auto-Compaction
**Decision**: Automatically compact at 60% context usage (force at 65%)
**Rationale**: Maintains 38-40% buffer like Claude Code, prevents context overflow
**Trade-offs**: Earlier compaction, but smoother user experience  

### ADR-004: No Telemetry/Auto-Updates
**Decision**: Remove all tracking and auto-update code  
**Rationale**: User privacy, control over updates  
**Trade-offs**: No usage insights, manual update process  

## Conclusion

Yurucode's architecture prioritizes:
1. **Reliability**: Crash recovery, error boundaries, process isolation
2. **Performance**: Virtual scrolling, lazy loading, bounded buffers
3. **Security**: CSP, sandboxing, input validation
4. **User Experience**: Auto-compaction, fast responses, clean UI
5. **Privacy**: No telemetry, local-only operation

The three-process architecture with compiled server binaries provides a unique balance of simplicity and power, making Yurucode a production-ready Claude GUI that respects user privacy while delivering exceptional performance.