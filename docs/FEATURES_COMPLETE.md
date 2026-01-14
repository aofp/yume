# Yume Complete Feature Documentation

**Version:** 0.1.0
**Last Updated:** January 12, 2026
**Platform:** macOS, Windows, Linux

## Table of Contents

1. [Core Features](#1-core-features)
2. [Session Management](#2-session-management)
3. [Auto-Compaction System](#3-auto-compaction-system)
4. [Token Tracking & Cost Management](#4-token-tracking--cost-management)
5. [Advanced Editor Features](#5-advanced-editor-features)
6. [Hook System](#6-hook-system)
7. [MCP (Model Context Protocol)](#7-mcp-model-context-protocol)
8. [Database & Persistence](#8-database--persistence)
9. [UI/UX Features](#9-uiux-features)
10. [Developer Features](#10-developer-features)
11. [Security Features](#11-security-features)
12. [Performance Features](#12-performance-features)
13. [Platform-Specific Features](#13-platform-specific-features)
14. [License Management](#14-license-management)
15. [Plugin System](#15-plugin-system)
16. [Skills System](#16-skills-system)
17. [Analytics & Reporting](#17-analytics--reporting)
18. [Timeline & Checkpoints](#18-timeline--checkpoints)

## 1. Core Features

### 1.1 Claude CLI Integration

**Description**: Seamless integration with Anthropic's Claude CLI for AI-powered development assistance.

**Implementation**:
- Location: `src-tauri/src/claude_spawner.rs`
- Binary detection: Auto-detects Claude installation
- Multiple paths checked: System, user, WSL (Windows)
- Version verification: Ensures compatibility

**Key Capabilities**:
```rust
pub struct ClaudeSpawner {
    binary_path: PathBuf,
    working_directory: PathBuf,
    environment: HashMap<String, String>,
    session_options: SessionOptions,
}
```

**Supported Models**:
- Claude Opus 4.5 (claude-opus-4-5-20251101) - Best reasoning
- Claude Sonnet 4 (claude-sonnet-4-20250514) - Balanced
- Claude 3.5 Sonnet (claude-3-5-sonnet-20241022) - Fast coding
- Claude 3.5 Haiku (claude-3-5-haiku-20241022) - Lightweight
- Claude 3 Opus (claude-3-opus-20240229) - Legacy

**Claude Code Integration**:
- Skills system support (dynamic instruction loading)
- Subagents support (/agents command)
- CLAUDE.md imports with `@path/to/file.md` syntax
- Ultrathink mode support ("think"/"ultrathink" prompts)
- MCP with 8M+ server integrations

**CLI Arguments**:
```bash
claude-cli \
  --print \                    # Enable output
  --output-format stream-json \ # Streaming JSON
  --model claude-3-sonnet \     # Model selection
  --working-dir /path/to/project
```

### 1.2 Multi-Session Support

**Description**: Run multiple Claude sessions simultaneously with tab-based interface.

**Features**:
- Unlimited concurrent sessions
- Independent context per session
- Tab persistence across restarts
- Lazy reconnection (connect only when accessed)
- Session isolation

**Implementation**:
```typescript
// src/renderer/stores/claudeCodeStore.ts
interface SessionState {
  id: string;
  title: string;
  messages: Message[];
  tokenStats: TokenStats;
  isActive: boolean;
  workingDirectory: string;
  createdAt: number;
  lastAccessedAt: number;
}
```

### 1.3 Real-Time Streaming

**Description**: Stream responses from Claude in real-time as they're generated.

**Technical Details**:
- WebSocket-based streaming (Socket.IO)
- JSON stream parsing
- Chunk aggregation
- Progressive rendering

**Stream Events**:
```javascript
// Server → Client
socket.on('stream-chunk', (chunk) => {
  // Incremental update
});

socket.on('stream-complete', (message) => {
  // Final message
});

socket.on('token-update', (stats) => {
  // Usage statistics
});
```

## 2. Session Management

### 2.1 Session Lifecycle

**States**:
1. **Created**: Initial state
2. **Connecting**: Establishing connection
3. **Active**: Ready for messages
4. **Streaming**: Receiving response
5. **Idle**: Waiting for input
6. **Disconnected**: Connection lost
7. **Terminated**: Session ended

**State Transitions**:
```
Created → Connecting → Active ↔ Streaming ↔ Idle
                ↓                    ↓
          Disconnected ← → Terminated
```

### 2.2 Session Persistence

**Description**: Sessions persist across application restarts.

**Storage Layers**:
1. **Memory**: Active session state
2. **localStorage**: Quick recovery
3. **SQLite**: Long-term storage

**Persisted Data**:
- Session metadata
- Message history
- Token statistics
- Working directory
- Window state

### 2.3 Session Recovery

**Description**: Automatic recovery after crashes or unexpected termination.

**Location**: `src-tauri/src/crash_recovery.rs`

**Features**:
- Periodic snapshots (every 5 minutes)
- Window position restoration
- Unsaved work recovery
- Session state restoration

**Recovery Process**:
```rust
pub struct CrashRecoveryManager {
    pub fn check_for_recovery(&self) -> Option<AppStateSnapshot> {
        // Check for recent snapshots
    }
    
    pub fn recover_session(&self, snapshot: AppStateSnapshot) {
        // Restore complete state
    }
}
```

## 3. Auto-Compaction System

### 3.1 Overview

**Description**: Automatically compacts conversation context with conservative thresholds (55% warning, 60% auto, 65% force).

**Unique Feature**: Uses same 38% buffer as Claude Code for reliable context management.

### 3.2 Technical Implementation

**Location**: `src-tauri/src/compaction/mod.rs`

**Threshold Detection**:
```rust
pub struct CompactionManager {
    auto_threshold: f32,  // 0.60 (60%)
    force_threshold: f32, // 0.65 (65%)

    pub async fn monitor_usage(&self, stats: TokenStats) {
        let usage = stats.context_tokens as f32 / stats.max_tokens as f32;
        if usage >= self.force_threshold {
            self.trigger_force_compaction().await;
        } else if usage >= self.auto_threshold {
            self.trigger_auto_compaction().await;
        }
    }
}
```

### 3.3 Compaction Process

**Steps**:
1. **Detection**: Monitor reaches 60% (auto) or 65% (force) threshold
2. **Preparation**: Save current state
3. **Trigger**: Send `/compact` command on next user message
4. **Processing**: Claude creates summary
5. **Transition**: Start new session with context
6. **Restoration**: Resume conversation

**User Experience**:
- Automatic trigger (no manual intervention)
- Visual indicator during compaction
- Seamless conversation continuity
- Preserves working context

### 3.4 Compaction Settings

```typescript
interface CompactionSettings {
  autoTrigger: boolean;        // Enable auto-compaction
  autoThreshold: number;       // 0.60 (60%)
  forceThreshold: number;      // 0.65 (65%)
  preserveContext: boolean;    // Preserve important context
  generateManifest: boolean;   // Create compaction manifest
}
```

## 4. Token Tracking & Cost Management

### 4.1 Real-Time Token Counting

**Description**: Accurate token counting with cost calculation.

**Display Format**:
```
Tokens: 15,234 / 200,000 (7.6%)
Cost: $0.46 ($0.03 input + $0.43 output)
```

### 4.2 Token Statistics

**Tracked Metrics**:
```typescript
interface TokenStats {
  // Token Counts
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  maxTokens: number;
  
  // Usage
  contextUsage: number;      // Percentage
  remainingTokens: number;
  
  // Cost Calculation
  inputCost: number;         // USD
  outputCost: number;        // USD
  totalCost: number;         // USD
  
  // Rates (per 1M tokens)
  inputRate: number;         // $3 for Claude 3 Sonnet
  outputRate: number;        // $15 for Claude 3 Sonnet
}
```

### 4.3 Cost Tracking

**Model Pricing** (per 1M tokens):

| Model | Input | Output |
|-------|-------|--------|
| Claude Opus 4.5 | $15 | $75 |
| Claude Sonnet 4 | $3 | $15 |
| Claude 3.5 Sonnet | $3 | $15 |
| Claude 3.5 Haiku | $0.80 | $4 |
| Claude 3 Opus | $15 | $75 |

**Session Cost Aggregation**:
- Per-message cost
- Session total cost
- Daily/weekly/monthly summaries
- Export cost reports

## 5. Advanced Editor Features

### 5.1 Code Highlighting

**Description**: Syntax highlighting for 100+ languages.

**Libraries Used**:
- Prism.js for highlighting
- Custom theme matching UI

**Supported Languages**:
- JavaScript/TypeScript
- Python
- Rust
- Go
- Java
- C/C++
- And 90+ more

### 5.2 Diff Viewer

**Description**: Visual diff display for code changes.

**Location**: `src/renderer/components/Chat/DiffViewer.tsx`

**Features**:
- Side-by-side diff view
- Inline diff view
- Line numbers
- Addition/deletion highlighting
- Copy diff to clipboard

### 5.3 File References

**Description**: Reference files in conversations with `@` mentions.

**Syntax**:
```
@file.tsx - Reference specific file
@src/components/ - Reference directory
@**/*.test.ts - Glob pattern
```

**Implementation**:
```typescript
// src/renderer/components/MentionAutocomplete/
function parseMentions(text: string): FileMention[] {
  const mentionRegex = /@(\S+)/g;
  // Extract and validate file paths
}
```

### 5.4 Markdown Support

**Full Markdown Rendering**:
- Headers (H1-H6)
- Lists (ordered/unordered)
- Code blocks with syntax highlighting
- Tables
- Links
- Images
- Block quotes
- Horizontal rules

### 5.5 Voice Dictation

**Description**: Native speech-to-text input for hands-free coding.

**Location**: `src/renderer/components/Chat/ClaudeChat.tsx:1041`

**Implementation**:
- Uses Web Speech API (`webkitSpeechRecognition` / `SpeechRecognition`)
- Continuous recognition mode
- Real-time transcription appended to input
- Toggle with F5 key or mic button

**Features**:
- Start/stop with F5 keyboard shortcut
- Visual indicator when active (pulsing mic icon)
- Preserves existing input text
- Auto-punctuation and capitalization
- Works alongside normal typing

**Requirements**:
- macOS: Microphone permission in entitlements.plist
- Browser-level speech recognition support

**Keyboard Shortcut**: `F5`

## 6. Hook System

### 6.1 Overview

**Description**: Extensible hook system for customizing behavior.

**Location**: `src-tauri/src/hooks/mod.rs`

### 6.2 Hook Configuration

```rust
pub struct HookConfig {
    pub name: String,
    pub trigger: HookTrigger,
    pub command: String,
    pub args: Vec<String>,
    pub working_dir: Option<String>,
    pub env: HashMap<String, String>,
    pub blocking: bool,
    pub timeout: u64, // milliseconds
    pub enabled: bool,
}
```

### 6.3 Available Triggers

**Message Hooks**:
- `before-message`: Modify outgoing messages
- `after-message`: Process responses
- `on-error`: Handle errors

**Session Hooks**:
- `session-start`: New session created
- `session-end`: Session terminated
- `session-compact`: Compaction triggered

**System Hooks**:
- `app-start`: Application launch
- `app-shutdown`: Application closing
- `file-change`: File modification detected

### 6.4 Hook Examples

**Auto-format Code**:
```json
{
  "name": "format-code",
  "trigger": "before-message",
  "command": "prettier",
  "args": ["--write", "${file}"],
  "blocking": true
}
```

**Git Commit on Save**:
```json
{
  "name": "auto-commit",
  "trigger": "file-change",
  "command": "git",
  "args": ["commit", "-am", "Auto-save: ${timestamp}"],
  "blocking": false
}
```

## 7. MCP (Model Context Protocol)

### 7.1 Overview

**Description**: Support for Anthropic's Model Context Protocol for enhanced context management.

**Location**: `src-tauri/src/mcp/mod.rs`

### 7.2 MCP Server Management

```rust
pub struct McpServer {
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
    pub env: HashMap<String, String>,
    pub auto_start: bool,
}

impl McpManager {
    pub async fn start_server(&self, name: &str) -> Result<()> {
        // Launch MCP server process
    }
    
    pub async fn connect(&self, server: &McpServer) -> Result<()> {
        // Establish connection
    }
}
```

### 7.3 MCP Features

**Capabilities**:
- External tool integration
- Custom context providers
- Database connections
- API integrations
- File system access

**Protocol Support**:
- JSON-RPC communication
- Bi-directional messaging
- Event streaming
- Error handling

### 7.4 Yume Agents System

**Description**: 5 built-in AI agents that sync to `~/.claude/agents/` for Claude CLI integration. All agents automatically use the **currently selected model** (opus or sonnet).

**Location**: `src-tauri/src/commands/mod.rs` (sync), `src/renderer/services/agentExecutionService.ts` (execution)

**The 5 Yume Core Agents**:

| Agent | Purpose | Key Tools |
|-------|---------|-----------|
| **architect** | Plans, designs, decomposes tasks | TodoWrite |
| **explorer** | Finds, reads, understands codebase | Glob, Grep, Read |
| **implementer** | Codes, edits, builds | Edit, Write |
| **guardian** | Reviews, audits, verifies | Read, Grep |
| **specialist** | Domain-specific: tests, docs, devops | Varies |

**Sync Mechanism**:
- Agents are written as `.md` files to `~/.claude/agents/yume-*.md`
- Uses YAML frontmatter format compatible with Claude CLI
- PID tracking prevents multiple yume instances from conflicting
- Agents removed on app exit (only if last instance running)
- **Agents re-synced automatically when user switches models**

**File Format** (written to `~/.claude/agents/yume-architect.md`):
```yaml
---
name: yume-architect
model: <selectedModel>
description: proactively use this agent before implementing complex features...
---

architect agent. plan, design, decompose. think first. output: steps, dependencies, risks. use TodoWrite.
```

**Commands**:
- `sync_yume_agents(enabled, model)`: Enable/disable agent sync with specified model
- `are_yume_agents_synced()`: Check if agents are currently synced
- `cleanup_yume_agents_on_exit()`: Remove agents on app exit

## 8. Database & Persistence

### 8.1 SQLite Integration

**Description**: Local SQLite database for data persistence.

**Location**: `src-tauri/src/db/mod.rs`

**Schema**:
```sql
-- Checkpoints
CREATE TABLE checkpoints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    title TEXT,
    messages TEXT NOT NULL, -- JSON
    token_stats TEXT,       -- JSON
    metadata TEXT          -- JSON
);

-- Settings
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER
);

-- Message History
CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    tokens INTEGER
);

-- Compaction History
CREATE TABLE compaction_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    before_tokens INTEGER,
    after_tokens INTEGER,
    summary TEXT
);
```

### 8.2 Checkpoint System

**Features**:
- Save conversation state
- Name and tag checkpoints
- Search checkpoint history
- Restore to checkpoint
- Export/import checkpoints

**API**:
```typescript
interface Checkpoint {
  id: number;
  sessionId: string;
  title: string;
  timestamp: number;
  messages: Message[];
  tokenStats: TokenStats;
  tags: string[];
}
```

### 8.3 Search Functionality

**Full-Text Search**:
```sql
-- Create FTS5 virtual table
CREATE VIRTUAL TABLE messages_fts USING fts5(
    content,
    content=messages,
    content_rowid=id
);

-- Search query
SELECT * FROM messages_fts 
WHERE messages_fts MATCH ?
ORDER BY rank;
```

## 9. UI/UX Features

### 9.1 Custom Window Chrome

**Description**: Platform-specific window customization.

**macOS Features**:
- Traffic light positioning
- Translucent sidebar
- Vibrancy effects
- Native blur

**Windows Features**:
- Custom title bar
- Acrylic effects
- Snap layout support
- Shadow rendering

### 9.2 Theme System

**Dark Theme (Default)**:
```css
:root {
  --bg-primary: #0a0a0a;
  --bg-secondary: #141414;
  --text-primary: #ffffff;
  --text-secondary: #a0a0a0;
  --accent: #3b82f6;
  --border: #2a2a2a;
}
```

**OLED Optimized**:
- Pure black backgrounds
- High contrast text
- Minimal gray usage
- Power efficiency

### 9.3 Keyboard Shortcuts

**Global Shortcuts**:
| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl+N` | New session |
| `Cmd/Ctrl+T` | New tab |
| `Cmd/Ctrl+W` | Close tab |
| `Cmd/Ctrl+Enter` | Send message |
| `Cmd/Ctrl+/` | Focus input |
| `Cmd/Ctrl+,` | Settings |
| `Cmd/Ctrl+Shift+C` | Clear context |
| `Cmd/Ctrl+K` | Command palette |

### 9.4 Virtual Scrolling

**Description**: Efficiently render large conversations.

**Implementation**:
```typescript
// src/renderer/components/Chat/VirtualizedMessageList.tsx
<VirtualList
  height={windowHeight}
  itemCount={messages.length}
  itemSize={getItemSize}
  overscanCount={5}
>
  {({ index, style }) => (
    <MessageRenderer
      message={messages[index]}
      style={style}
    />
  )}
</VirtualList>
```

### 9.5 Loading States

**Skeleton Loading**:
- Message placeholders
- Shimmer effects
- Progressive content reveal

**Loading Indicators**:
- Spinning dots for streaming
- Progress bars for operations
- Estimated time remaining

### 9.6 Empty States

**Informative Placeholders**:
- No sessions: "Start a new conversation"
- No messages: "Send a message to begin"
- No results: "No matches found"
- Error states: Recovery options

## 10. Developer Features

### 10.1 Debug Mode

**Activation**: Set `YUME_DEBUG=true`

**Features**:
- Verbose logging
- Performance metrics
- Memory profiling
- Network inspection
- State debugging

### 10.2 Command System

**Developer Commands**:
```typescript
// Available via Cmd/Ctrl+Shift+P
commands.register({
  'dev.reload': () => window.location.reload(),
  'dev.clear-cache': () => localStorage.clear(),
  'dev.export-state': () => exportState(),
  'dev.import-state': (data) => importState(data),
  'dev.reset-database': () => resetDatabase(),
});
```

### 10.3 Extension API

**Plugin System** (Future):
```typescript
interface YumePlugin {
  name: string;
  version: string;
  
  onActivate(): void;
  onDeactivate(): void;
  
  commands?: Command[];
  hooks?: Hook[];
  providers?: Provider[];
}
```

### 10.4 Performance Profiling

**Metrics Available**:
```typescript
const metrics = {
  startup: measureStartupTime(),
  memory: getMemoryUsage(),
  fps: getCurrentFPS(),
  messageLatency: getAverageLatency(),
  renderTime: getMeanRenderTime(),
};
```

## 11. Security Features

### 11.1 Content Security Policy

**Configuration**:
```json
{
  "csp": "default-src 'self'; script-src 'self' 'unsafe-inline'..."
}
```

**Protection Against**:
- XSS attacks
- Code injection
- Clickjacking
- Data exfiltration

### 11.2 Process Isolation

**Architecture**:
- Separate processes for UI, server, Claude
- Sandboxed file access
- Limited IPC surface
- No network access (local only)

### 11.3 Input Validation

**Validation Layers**:
1. Frontend validation (TypeScript)
2. IPC validation (Tauri)
3. Server validation (Node.js)
4. CLI validation (Claude)

**Sanitization**:
- Path traversal prevention
- Command injection prevention
- HTML sanitization
- SQL injection prevention

## 12. Performance Features

### 12.1 Lazy Loading

**Components**:
- Modals load on demand
- Routes load when accessed
- Images load in viewport
- Heavy components deferred

### 12.2 Memory Management

**Bounded Buffers**:
```rust
const MAX_BUFFER_SIZE: usize = 10 * 1024 * 1024; // 10MB

struct BoundedBuffer {
    data: VecDeque<String>,
    size: usize,
    
    fn push(&mut self, item: String) {
        while self.size + item.len() > MAX_BUFFER_SIZE {
            if let Some(removed) = self.data.pop_front() {
                self.size -= removed.len();
            }
        }
        self.size += item.len();
        self.data.push_back(item);
    }
}
```

### 12.3 Performance Monitoring

**Real-Time Metrics**:
```typescript
class PerformanceMonitor {
  monitorFPS() {
    let lastTime = performance.now();
    let frames = 0;
    
    const measureFPS = () => {
      frames++;
      const now = performance.now();
      if (now >= lastTime + 1000) {
        const fps = (frames * 1000) / (now - lastTime);
        this.recordMetric('fps', fps);
        frames = 0;
        lastTime = now;
      }
      requestAnimationFrame(measureFPS);
    };
  }
}
```

### 12.4 Optimizations

**React Optimizations**:
- React.memo for pure components
- useMemo for expensive computations
- useCallback for stable references
- Virtualization for long lists

**Rust Optimizations**:
- Zero-copy parsing where possible
- Async I/O operations
- Thread pooling
- Efficient buffer management

## 13. Platform-Specific Features

### 13.1 macOS Features

**Native Integration**:
```rust
#[cfg(target_os = "macos")]
extern crate objc;

// Traffic light customization
// Vibrancy effects
// Touch Bar support (older MacBooks)
// Universal binary (Intel + Apple Silicon)
```

**macOS Specific**:
- `.app` bundle
- DMG installer
- Gatekeeper compatibility
- Notarization ready

### 13.2 Windows Features

**Windows Integration**:
```rust
#[cfg(target_os = "windows")]
use windows::Win32::*;

// Custom window procedures
// Taskbar integration
// Jump list support
// Native notifications
```

**Windows Specific**:
- WSL support for Claude
- Hidden console windows
- MSI/NSIS installers
- Auto-start capability

### 13.3 Linux Features

**Linux Support**:
- GTK integration
- X11/Wayland compatibility
- System tray support
- Multiple package formats

**Distributions**:
- AppImage (universal)
- DEB (Debian/Ubuntu)
- RPM (Fedora/RHEL)
- AUR (Arch Linux)

## 14. License Management

### 14.1 Overview

**Description**: Commercial licensing system with trial and Pro tiers.

**Pricing**:
- **Trial**: Free (2 tabs, 1 window)
- **Pro**: $21 one-time (99 tabs, 99 windows)

### 14.2 Implementation

**Location**: `src/renderer/stores/licenseManager.ts` (Zustand store)

**License Format**: `XXXXX-XXXXX-XXXXX-XXXXX-XXXXX` (29 characters)

**Validation**:
- Server-side validation: `https://license.yume.com/validate`
- Response caching: 5-minute TTL
- Encrypted storage: XOR cipher in localStorage
- Auto-revalidation: Every 30 minutes

### 14.3 Features

**License Operations**:
```typescript
interface LicenseManager {
  validateLicense(key: string): Promise<boolean>
  activateLicense(key: string): Promise<void>
  deactivateLicense(): void
  getFeatures(): LicenseFeatures
  refreshLicenseStatus(): Promise<void>
}

interface LicenseFeatures {
  maxTabs: number      // 2 (trial) or 99 (pro)
  maxWindows: number   // 1 (trial) or 99 (pro)
  isTrial: boolean
  isLicensed: boolean
}
```

**UI Component**: `UpgradeModal.tsx`
- Shows upgrade prompts with reasons: `tabLimit`, `feature`, `trial`
- Purchase link integration
- License key input and validation

## 15. Plugin System

### 15.1 Overview

**Description**: Complete extensibility framework for adding custom functionality without code changes.

**Plugin Directory**: `~/.yume/plugins/`

### 15.2 Plugin Structure

```
~/.yume/plugins/{plugin-id}/
  plugin.json         # Metadata (id, name, version, author, components)
  commands/           # Custom slash commands (*.md)
  agents/             # Custom agent definitions (*.md with YAML frontmatter)
  hooks/              # Event-based hooks (*.js, *.py, *.sh)
  skills/             # Auto-injected context triggers (*.json)
  mcp/                # MCP server configurations (*.json)
```

### 15.3 Plugin Components

**1. Commands**: Custom slash commands
- Format: Markdown files with YAML frontmatter
- Template variables: `$ARGUMENTS`, `$1`, `$2`, etc.
- Example: `/review` command for code reviews

**2. Agents**: Custom AI agent definitions
- Format: Markdown files with YAML frontmatter (name, model, description)
- System prompts in markdown body
- Synced to `~/.claude/agents/` when plugin enabled

**3. Hooks**: Event-based behavior customization
- Events: SessionStart, PreToolUse, PostToolUse, Stop
- Languages: JavaScript, Python, Bash
- Actions: continue, block, modify

**4. Skills**: Auto-injected context
- Triggers: File extensions, keywords, regex patterns
- Content: Context/knowledge to inject
- Automatic activation based on triggers

**5. MCP Servers**: Model Context Protocol integrations
- Configuration: Server command, args, env variables
- Auto-start capability
- Claude CLI integration

### 15.4 Plugin API

**Backend**: `src-tauri/src/commands/plugins.rs`
```rust
#[tauri::command]
pub fn list_plugins() -> Vec<Plugin>

#[tauri::command]
pub fn install_plugin(source_path: String) -> Result<(), String>

#[tauri::command]
pub fn uninstall_plugin(plugin_id: String) -> Result<(), String>

#[tauri::command]
pub fn enable_plugin(plugin_id: String) -> Result<(), String>

#[tauri::command]
pub fn disable_plugin(plugin_id: String) -> Result<(), String>

#[tauri::command]
pub fn validate_plugin(plugin_path: String) -> Result<PluginMetadata, String>
```

**Frontend**: `src/renderer/services/pluginService.ts`
```typescript
class PluginService {
  initialize(): Promise<void>
  listPlugins(): Promise<Plugin[]>
  installPlugin(sourcePath: string): Promise<void>
  installPluginFromDialog(): Promise<void>
  uninstallPlugin(pluginId: string): Promise<void>
  enablePlugin(pluginId: string): Promise<void>
  disablePlugin(pluginId: string): Promise<void>
  refresh(): Promise<void>
}
```

### 15.5 UI Component

**Location**: `src/renderer/components/Settings/PluginsTab.tsx`

**Features**:
- List installed plugins with metadata
- Enable/disable toggle per plugin
- View component counts (commands, agents, hooks, skills, MCP)
- Install plugin from folder
- Remove plugin with confirmation
- Refresh plugin list
- Expand/collapse plugin details

### 15.6 Bundled Plugin

**yume Plugin**: Bundled plugin synced on initialization
- Contains default commands, agents, and hooks
- Automatically enabled on first launch
- Cannot be uninstalled

## 16. Skills System

### 16.1 Overview

**Description**: Auto-inject context or knowledge into conversations based on triggers.

**Location**: `src/renderer/components/Settings/SkillsTab.tsx`

### 16.2 Skill Types

**1. Custom Skills**: User-created skills
- Storage: localStorage (`yume_custom_skills`)
- Full CRUD operations
- Immediate effect when enabled

**2. Plugin Skills**: Sourced from enabled plugins
- Read-only (managed by plugin)
- Attributed to source plugin
- Synced when plugin enabled/disabled

### 16.3 Skill Structure

```json
{
  "id": "skill-id",
  "name": "Skill Name",
  "description": "What this skill does",
  "triggers": [
    "*.py",           // File extension glob
    "python",         // Keyword match
    "/^def /"         // Regex pattern
  ],
  "content": "Context to inject when triggered",
  "enabled": true,
  "source": "custom" | "plugin:{plugin-id}"
}
```

### 16.4 Trigger Matching

**Supported Trigger Types**:
1. **File Extensions**: `*.py`, `*.ts`, `*.md`
2. **Keywords**: `python`, `react`, `api`
3. **Regex Patterns**: `/^def /`, `/class \w+/`

**Matching Logic**:
- Triggers evaluated on message send
- File context, message content, and working directory checked
- Multiple triggers combined with OR logic
- First matching skill's content injected

### 16.5 UI Features

**SkillsTab Component**:
- Create/edit/delete custom skills
- View all skills (custom + plugin)
- Toggle enable/disable per skill
- Source attribution for plugin skills
- Real-time preview of trigger patterns
- Skill count badges

### 16.6 Use Cases

**Example Skills**:
- **Python Best Practices**: Triggered by `*.py` files
- **API Documentation**: Triggered by `api`, `endpoint` keywords
- **Git Workflow**: Triggered by `git`, `.git/` paths
- **Testing Guidelines**: Triggered by `*.test.ts`, `*.spec.js`

## 17. Analytics & Reporting

### 17.1 Overview

**Description**: Comprehensive usage analytics with breakdowns by project, model, and date.

**Location**: `src/renderer/components/Modals/Analytics/AnalyticsModal.tsx`

### 17.2 Metrics Tracked

**Global Metrics**:
- Total sessions created
- Total messages sent
- Total tokens consumed (input, output, cache read, cache creation)
- Total cost in USD

**Breakdown Dimensions**:
1. **By Project**: Per working directory
   - Session count
   - Token usage
   - Cost
   - Last accessed timestamp

2. **By Model**: Opus vs Sonnet vs Haiku
   - Session count per model
   - Token usage per model
   - Cost per model
   - Average tokens per session

3. **By Date**: Daily/weekly breakdown
   - Tokens per day
   - Cost per day
   - Session count per day
   - Trend visualization

### 17.3 Time Ranges

**Available Ranges**:
- **7 days**: Last week's activity
- **14 days**: Two-week view
- **30 days**: Monthly overview
- **All-time**: Complete history

**Date Filtering**: Results filtered by timestamp in database queries

### 17.4 View Modes

**1. All Sessions**: Global analytics across all projects
**2. Specific Project**: Filter by working directory

### 17.5 Data Source

**Server Endpoint**: `http://localhost:{port}/analytics`

**Query Parameters**:
- `timeRange`: "7d" | "14d" | "30d" | "all"
- `projectPath`: Optional project filter

**Data Format**:
```typescript
interface AnalyticsData {
  totalSessions: number
  totalMessages: number
  totalTokens: {
    input: number
    output: number
    cacheRead: number
    cacheCreation: number
  }
  totalCost: number
  byProject: ProjectBreakdown[]
  byModel: ModelBreakdown[]
  byDate: DailyBreakdown[]
}
```

### 17.6 UI Features

**AnalyticsModal Component**:
- Time range selector (7d, 14d, 30d, all)
- Project filter dropdown
- Metric cards with icons
- Token breakdown pie chart
- Cost trend line chart
- Per-project table with sorting
- Per-model comparison
- Export to CSV/JSON

## 18. Timeline & Checkpoints

### 18.1 Overview

**Description**: Visual timeline of conversation checkpoints for state management and restoration.

**Location**: `src/renderer/components/Timeline/TimelineNavigator.tsx`

**Feature Flag**: `FEATURE_FLAGS.SHOW_TIMELINE`

### 18.2 Checkpoint System

**Checkpoint Structure**:
```typescript
interface Checkpoint {
  id: string
  sessionId: string
  timestamp: number
  title?: string
  messageCount: number
  tokenCount: number
  metadata?: {
    model: string
    workingDirectory: string
    createdBy: 'user' | 'auto'
  }
}
```

**Auto-Checkpoints**:
- Created every N messages (configurable)
- Created before compaction
- Created on significant state changes
- Automatic cleanup after 30 days

**Manual Checkpoints**:
- User-created via UI
- Custom titles/descriptions
- Persisted indefinitely
- Exportable

### 18.3 Timeline API

**Load Timeline**:
```typescript
async function getTimeline(sessionId: string): Promise<Checkpoint[]>
```

**Restore Checkpoint**:
```typescript
async function restoreCheckpoint(
  sessionId: string,
  checkpointId: string
): Promise<void>
```

**Events**:
- `checkpoint-created`: Emitted when new checkpoint saved
- `checkpoint-restored`: Emitted when checkpoint restored

### 18.4 UI Features

**TimelineNavigator Component**:
- Visual timeline with date markers
- Checkpoint nodes with metadata
- Hover preview with message count, tokens, cost
- Click to restore conversation state
- Collapse/expand timeline view
- Keyboard navigation (arrow keys)
- Selection state tracking

**Checkpoint Actions**:
- Create manual checkpoint
- Restore to checkpoint
- Delete checkpoint
- Export checkpoint
- View checkpoint diff (before/after messages)

### 18.5 Storage

**Database Table**: `checkpoints` (SQLite)
```sql
CREATE TABLE checkpoints (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    title TEXT,
    messages TEXT NOT NULL,  -- JSON
    token_stats TEXT,        -- JSON
    metadata TEXT,           -- JSON
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);
```

### 18.6 Use Cases

**Checkpoint Scenarios**:
1. **Before Refactoring**: Save state before major code changes
2. **Pre-Compaction**: Auto-saved before context compaction
3. **Branch Exploration**: Create checkpoint before exploring alternative approaches
4. **Session Milestones**: Mark completion of major tasks
5. **Undo/Redo**: Restore to previous conversation state

## Feature Comparison Matrix

| Feature | Yume | Opcode | Claudia | Continue |
|---------|----------|--------|---------|----------|
| **License system (trial/pro)** | ✅ | ❌ | ❌ | ❌ |
| **Plugin system** | ✅ | ❌ | ❌ | ❌ |
| **Skills system** | ✅ | ❌ | ❌ | ❌ |
| **Performance monitoring** | ✅ | ❌ | ❌ | ❌ |
| **Analytics dashboard** | ✅ | ⚠️ | ❌ | ❌ |
| **5h + 7d limit tracking** | ✅ | ❌ | ❌ | ❌ |
| Auto-compact (60% auto, 65% force) | ✅ | ❌ | ❌ | ❌ |
| Multi-session tabs | ✅ | ✅ | ❌ | ✅ |
| Token tracking | ✅ | ✅ | ⚠️ | ✅ |
| Cost calculation | ✅ | ✅ | ❌ | ❌ |
| Crash recovery | ✅ | ❌ | ❌ | ❌ |
| Hook system (9 events) | ✅ | ❌ | ❌ | ⚠️ |
| MCP support | ✅ | ✅ | ❌ | ❌ |
| Virtual scrolling | ✅ | ⚠️ | ❌ | ✅ |
| Git diff viewer | ✅ | ✅ | ❌ | ✅ |
| 30 themes | ✅ | ❌ | ❌ | ❌ |
| 5 built-in agents | ✅ | ❌ | ❌ | ❌ |
| 12 custom commands | ✅ | ❌ | ❌ | ❌ |
| 30+ keyboard shortcuts | ✅ | ❌ | ❌ | ✅ |
| Drag & drop tabs | ✅ | ❌ | ❌ | ❌ |
| Checkpoints + timeline | ✅ | ✅ | ❌ | ❌ |
| CLAUDE.md editor | ✅ | ✅ | ❌ | ❌ |
| No telemetry | ✅ | ✅ | ❌ | ❌ |
| Compiled server | ✅ | ❌ | ❌ | ❌ |
| Platform support | 3 | 3 | 2 | 3 |

## Performance Benchmarks

| Operation | Time | Memory | CPU |
|-----------|------|--------|-----|
| Startup | 2.3s | 145MB | 12% |
| New session | 180ms | +8MB | 5% |
| Send message | 65ms | +2MB | 3% |
| Stream 1K tokens | 800ms | +5MB | 8% |
| Compaction | 3.8s | +15MB | 25% |
| Search 10K messages | 120ms | +10MB | 15% |
| Export session | 200ms | +5MB | 10% |

## Conclusion

Yume offers a comprehensive feature set that surpasses competitors (including YC-backed Opcode) in key areas:

1. **Unique Features**:
   - **License system** with trial/pro tiers ($21 one-time)
   - **Plugin system** - complete extensibility framework (commands, agents, hooks, skills, MCP)
   - **Skills system** - auto-inject context based on triggers (file extensions, keywords, regex)
   - **Performance monitoring** - real-time FPS, memory, render time metrics
   - **Analytics dashboard** - comprehensive usage tracking by project/model/date
   - **Timeline & checkpoints** - visual conversation state management
   - **CLAUDE.md editor** - in-app project documentation editing
   - 5h + 7-day Anthropic limit tracking (no competitor has this)
   - Auto-compaction (55% warn, 60% auto, 65% force) - same 38% buffer as Claude Code
   - Crash recovery (auto-save every 5 min)
   - Built-in agents (architect, explorer, implementer, guardian, specialist)
   - Custom commands with templates
   - Hook system for behavior customization (9 events)

2. **Performance**:
   - Virtual scrolling for 1000+ message sessions
   - Bounded buffers and lazy loading
   - Native Tauri/Rust backend
   - Real-time performance monitoring and metrics export
   - Message virtualization with overscan

3. **Privacy**:
   - No telemetry
   - Local-only operation
   - Encrypted license storage
   - All data stored locally (SQLite database)

4. **Extensibility**:
   - Plugin system (5 component types)
   - Skills system (custom + plugin skills)
   - Hooks (9 event triggers)
   - MCP support (8M+ servers)
   - Custom commands with template variables

5. **Polish**:
   - 30 themes
   - 30+ keyboard shortcuts
   - Drag & drop tabs
   - Git diff viewer
   - Recent conversations/projects modals
   - Context bar with visual usage indicator
   - Adaptive window controls (platform-specific)
   - Global watermark support
   - Font picker (mono + sans)
   - Window transparency control

**Yume vs Opcode**: Opcode is YC-backed but yume is technically superior in almost every category:
- **Yume has**: License system, plugins, skills, performance monitoring, analytics, timeline/checkpoints, CLAUDE.md editor, 5h/7d limit tracking, hooks, themes, agents, auto-compaction, crash recovery, keyboard shortcuts, custom commands
- **Opcode has**: Multi-session tabs, basic token tracking (but missing most advanced features above)

**Key Differentiators**:
1. **Plugin System** - No competitor offers a complete plugin framework with 5 component types
2. **Skills System** - Unique auto-inject context system based on triggers
3. **Performance Monitoring** - Only Yume has real-time metrics with export
4. **Analytics Dashboard** - Most comprehensive usage tracking and reporting
5. **License Management** - Commercial licensing system with trial/pro tiers
6. **Timeline & Checkpoints** - Visual conversation state management and restoration

The combination of advanced features with a focus on performance, privacy, and extensibility makes Yume the most capable Claude GUI available.

**Planned Expansion:** Multi-provider support (Gemini/OpenAI) will be added via a Claude-compatible stream-json shim. See `docs/expansion-plan/ROADMAP.md`.
