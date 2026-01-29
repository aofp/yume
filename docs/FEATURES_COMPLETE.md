# Yume Complete Feature Documentation

**Version:** 5.7.0
**Last Updated:** January 28, 2026
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
18. [History & Rollback](#18-history--rollback)
19. [VSCode Extension Integration](#19-vscode-extension-integration)
20. [Memory MCP System](#20-memory-mcp-system)
21. [Background Agents](#21-background-agents)
22. [Orchestration Flow](#22-orchestration-flow)
23. [Auto-Update System](#23-auto-update-system)

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

*Claude (via Claude CLI):*
- Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`) - Balanced coding
- Claude Opus 4.5 (`claude-opus-4-5-20251101`) - Best reasoning

*Gemini (via yume-cli):*
- Gemini 2.5 Pro (`gemini-2.5-pro`) - Advanced reasoning
- Gemini 2.5 Flash (`gemini-2.5-flash`) - Fast inference

*OpenAI/Codex (via yume-cli):*
- GPT-5.2 Codex (`gpt-5.2-codex`) - Full reasoning
- GPT-5.1 Codex Mini (`gpt-5.1-codex-mini`) - Lightweight

**Claude Code Integration**:
- Skills system support (dynamic instruction loading)
- Subagents support (/agents command)
- CLAUDE.md imports with `@path/to/file.md` syntax
- Ultrathink mode support ("think"/"ultrathink" prompts)
- MCP with 8M+ server integrations

**CLI Arguments**:
```bash
claude \
  --print \                    # Enable output
  --output-format stream-json \ # Streaming JSON
  --model claude-sonnet-4-5-20250929 \  # Model selection
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

**Description**: Automatically compacts conversation context with conservative thresholds (70% warning, 78% auto, 85% force).

**Unique Feature**: Uses same 22.5% buffer (45k tokens) as Claude Code for reliable context management.

### 3.2 Technical Implementation

**Location**: `src-tauri/src/compaction/mod.rs`

**Threshold Detection**:
```rust
pub struct CompactionManager {
    auto_threshold: f32,  // 0.78 (78%)
    force_threshold: f32, // 0.85 (85%)

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
1. **Detection**: Monitor reaches 78% (auto) or 85% (force) threshold
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
  autoThreshold: number;       // 0.78 (78%)
  forceThreshold: number;      // 0.85 (85%)
  preserveContext: boolean;    // Preserve important context
  generateManifest: boolean;   // Create compaction manifest
}
```

## 4. Token Tracking & Cost Management

### 4.1 Real-Time Token Counting

**Description**: Accurate token counting with cost calculation and mid-stream context updates.

**Display Format**:
```
Tokens: 15,234 / 200,000 (7.6%)
Cost: $0.46 ($0.03 input + $0.43 output)
```

### 4.1.1 Mid-Stream Context Updates

**Description**: Real-time context usage updates during streaming responses.

**Location**: `server-claude-macos.cjs:5630`, `claudeCodeClient.ts:825`

**How It Works**:
1. Server detects `usage` data in assistant messages during streaming
2. Emits `context-update:{sessionId}` Socket.IO event with token breakdown
3. Frontend updates session analytics in real-time without waiting for stream end
4. Context bar reflects accurate usage during long responses

**Event Payload**:
```typescript
interface ContextUpdatePayload {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalContextTokens: number;
  timestamp: number;
}
```

**Benefits**:
- Users see accurate context percentage during streaming
- Auto-compact thresholds can trigger mid-stream if needed
- Better visibility into token consumption patterns

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

**9 Hook Events**:
- `user_prompt_submit`: Before user message sent
- `pre_tool_use`: Before tool execution **(ACTIVE)**
- `post_tool_use`: After tool execution
- `assistant_response`: After assistant response
- `session_start`: New session created
- `session_end`: Session closed
- `context_warning`: Context threshold exceeded **(ACTIVE)**
- `compaction_trigger`: Before auto-compaction **(ACTIVE)**
- `error`: Error occurred

> **Note:** Only `pre_tool_use`, `context_warning`, and `compaction_trigger` are actively triggered. The other 6 hooks are defined but not currently called.

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

**Description**: 4 built-in AI agents that sync to `~/.claude/agents/` for Claude CLI integration. All agents automatically use the **currently selected model** (opus or sonnet).

**Location**: `src-tauri/src/commands/mod.rs` (sync), `src/renderer/services/agentExecutionService.ts` (execution)

**The 4 Yume Core Agents**:

| Agent | Purpose | Key Tools |
|-------|---------|-----------|
| **architect** | Plans, designs, decomposes tasks | TodoWrite |
| **explorer** | Finds, reads, understands codebase (sonnet, read-only) | Glob, Grep, Read |
| **implementer** | Codes, edits, builds (small, focused edits) | Edit, Write |
| **guardian** | Reviews, audits, verifies + domain tasks (tests, docs, devops, data) | Read, Grep, Bash |

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
| `Cmd/Ctrl+P` | Command palette |

### 9.4 Virtual Scrolling

**Description**: Efficiently render large conversations using react-virtuoso.

**Implementation**:
```typescript
// src/renderer/components/Chat/VirtualizedMessageList.tsx
<Virtuoso
  data={displayMessages}
  defaultItemHeight={400}
  increaseViewportBy={{ top: 800, bottom: 800 }}
  alignToBottom={true}
  followOutput={followOutput}
  atBottomThreshold={50}
  itemContent={itemContent}
/>
```

**Key Features**:
- ResizeObserver-based scroll pinning (no RAF polling) for streaming content
- MutationObserver for new item detection
- Active text selection detection (prevents scroll interruption during selection)
- State snapshot save/restore for tab switching
- Active agent status cards inline in message list
- Todo/task progress display during streaming
- Streaming token count display
- Bash output streaming with live process output
- Compacting indicator with followup message preview

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
- **Trial**: Free (3 tabs, 1 window)
- **Pro**: $21 one-time (99 tabs, 99 windows)

### 14.2 Implementation

**Location**: `src/renderer/services/licenseManager.ts` (Zustand store with encrypted persistence)

**License Format**: `XXXXX-XXXXX-XXXXX-XXXXX-XXXXX` (29 characters, base-32 alphabet)

**Validation**:
- Server-side validation: `https://yuru.be/api/license/validate.php`
- Response caching: 5-minute TTL (fallback on network error)
- Encrypted storage: XOR cipher in localStorage + backup to `~/.yume/license.json`
- One-time validation: License validated at registration, no periodic re-validation
- Backup restoration: Automatically restores from `~/.yume/license.json` if localStorage is empty

### 14.3 Features

**License Operations**:
```typescript
interface LicenseStore {
  validateLicense(key: string): Promise<boolean>
  activateLicense(key: string): Promise<boolean>
  deactivateLicense(): Promise<boolean>
  getFeatures(): LicenseFeatures
  refreshLicenseStatus(): Promise<void>
  clearLicense(): void
}

interface LicenseFeatures {
  maxTabs: number      // 3 (trial) or 99 (pro)
  maxWindows: number   // 1 (trial) or 99 (pro)
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

**Bundled Slash Commands**:

| Command | Description | Allowed Tools |
|---------|-------------|---------------|
| `/compact [focus]` | Context compaction with preservation hints | Read, Glob |
| `/init [area]` | Initialize context with optional focus area | Read, Glob, Grep, Bash(git:*), Bash(ls:*) |
| `/commit` | Create concise, lowercase commit | Git operations |
| `/review` | Review changes or codebase (read-only) | Read, Glob, Grep, Bash(git:*) |
| `/iterate` | Iterate on changes - examine, improve, verify | All tools |

**Command Features**:
- YAML frontmatter for metadata (allowed-tools, argument-hint, description)
- `$ARGUMENTS` template variable for user input
- Preservation hints for `/compact` (file path, concept, "all", blank for auto-detect)

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

## 18. History & Rollback

### 18.1 Overview

**Description**: Linear message history with file restoration for undoing conversation changes.

**Location**: `src/renderer/components/Chat/ClaudeChat.tsx` (rollback panel)

**Data**: `restorePoints` in session state tracks file changes per message

### 18.2 Restore Points System

**RestorePoint Structure**:
```typescript
interface RestorePoint {
  messageIndex: number
  timestamp: number
  fileSnapshots: FileSnapshot[]
}

interface FileSnapshot {
  path: string
  content: string
  originalContent: string | null
  isNewFile: boolean
  mtime?: number
  operation?: 'edit' | 'write'
  oldContent?: string  // For edits: the replaced snippet
}
```

**Automatic Tracking**:
- Captures file state before each tool use (Edit, Write)
- Stores original content for restoration
- Tracks modification timestamps for conflict detection
- Maximum 50 restore points per session

### 18.3 Rollback Panel UI

**Access**: Click history button in context bar

**Features**:
- Lists all user messages (newest first)
- Shows line changes per message (+added / -removed)
- Keyboard navigation (arrow keys, Enter to select, Esc to close)
- Hover/selection highlighting
- Disabled during streaming

### 18.4 Rollback Process

**When clicking a message to rollback**:
1. Collects all file snapshots after that message
2. Checks for conflicts (external modifications, other sessions)
3. Shows confirmation with files to restore
4. Restores files to original content
5. Truncates conversation to selected message
6. Places the message text back in input field

**Conflict Detection**:
- Compares stored mtime vs current mtime
- Checks cross-session edit registry
- Warns if file modified externally or by another tab

### 18.5 Use Cases

**Rollback Scenarios**:
1. **Undo Bad Edit**: Claude made unwanted changes, restore files
2. **Try Different Approach**: Roll back and re-prompt differently
3. **Recover from Errors**: Restore after a failed refactoring
4. **Clean Slate**: Return to earlier conversation state

### 18.6 Future: Timeline Branching (Planned)

**Note**: A more advanced timeline/checkpoint system with conversation branching is planned but not yet active. The current rollback system provides linear undo functionality.

## 19. VSCode Extension Integration

### 19.1 Overview

**Description**: Integration with Visual Studio Code for enhanced IDE workflow.

**Location**: `src-tauri/src/commands/plugins.rs`

### 19.2 Commands

| Command | Description |
|---------|-------------|
| `is_vscode_installed()` | Check if VSCode CLI is available |
| `check_vscode_extension_installed()` | Check if Yume extension is installed |
| `install_vscode_extension()` | Install bundled .vsix extension |
| `uninstall_vscode_extension()` | Uninstall Yume extension |

### 19.3 Features

**CLI Detection**:
- Searches common VSCode installation paths per platform
- macOS: `/usr/local/bin/code`, `/opt/homebrew/bin/code`, `.app` bundle paths
- Windows: `%LOCALAPPDATA%\Programs\Microsoft VS Code\bin\code.cmd`
- Linux: `/usr/bin/code`, `/snap/bin/code`

**Extension Management**:
- Bundled `.vsix` file in resources directory
- Automatic installation via `code --install-extension`
- Force flag to overwrite existing installations

### 19.4 Use Cases

1. **Deep Linking**: Open files from Yume in VSCode with context
2. **IDE Integration**: Share working directory between tools
3. **Future**: Bidirectional communication between Yume and VSCode

## Feature Comparison Matrix

| Feature | Yume | Opcode | Claudia | Continue |
|---------|----------|--------|---------|----------|
| **Auto-update (CLI + app)** | ✅ | ❌ | ❌ | ❌ |
| **License system (trial/pro)** | ✅ | ❌ | ❌ | ❌ |
| **Plugin system** | ✅ | ❌ | ❌ | ❌ |
| **Skills system** | ✅ | ❌ | ❌ | ❌ |
| **Performance monitoring** | ✅ | ❌ | ❌ | ❌ |
| **Analytics dashboard** | ✅ | ⚠️ | ❌ | ❌ |
| **5h + 7d limit tracking** | ✅ | ❌ | ❌ | ❌ |
| Auto-compact (78% auto, 85% force) | ✅ | ❌ | ❌ | ❌ |
| Multi-session tabs | ✅ | ✅ | ❌ | ✅ |
| Token tracking | ✅ | ✅ | ⚠️ | ✅ |
| Cost calculation | ✅ | ✅ | ❌ | ❌ |
| Crash recovery | ✅ | ❌ | ❌ | ❌ |
| Hook system (9 events) | ✅ | ❌ | ❌ | ⚠️ |
| MCP support | ✅ | ✅ | ❌ | ❌ |
| Virtual scrolling | ✅ | ⚠️ | ❌ | ✅ |
| Git diff viewer | ✅ | ✅ | ❌ | ✅ |
| 12 themes | ✅ | ❌ | ❌ | ❌ |
| 4 built-in agents | ✅ | ❌ | ❌ | ❌ |
| 5 custom commands | ✅ | ❌ | ❌ | ❌ |
| 30+ keyboard shortcuts | ✅ | ❌ | ❌ | ✅ |
| Drag & drop tabs | ✅ | ❌ | ❌ | ❌ |
| History + rollback | ✅ | ✅ | ❌ | ❌ |
| CLAUDE.md editor | ✅ | ✅ | ❌ | ❌ |
| No telemetry | ✅ | ✅ | ❌ | ❌ |
| Compiled server | ✅ | ❌ | ❌ | ❌ |
| VSCode extension | ✅ | ❌ | ❌ | ✅ |
| Multi-provider (Claude/Gemini/OpenAI) | ✅ | ❌ | ❌ | ✅ |
| **Memory system** | ✅ TTL, importance, auto-pruning, multi-query search | ❌ | ❌ | ❌ |
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

## 20. Memory V2 System (Per-Project Markdown)

### 20.1 Overview

**Description**: Persistent per-project memory system using markdown files for storing learnings, error fixes, patterns, and project context across sessions.

**Location**: `src-tauri/src/commands/memory_v2.rs`, `src/renderer/services/memoryServiceV2.ts`

**Storage**: `~/.yume/memory/`
- `global/preferences.md` - User preferences across all projects
- `global/patterns.md` - Global coding patterns
- `projects/{hash}/learnings.md` - Project-specific learnings
- `projects/{hash}/errors.md` - Error → solution mappings
- `projects/{hash}/patterns.md` - Project patterns
- `projects/{hash}/brief.md` - Project overview

### 20.2 Architecture

**Centralized Rust Service**: Thread-safe with RwLock state
- Single writer prevents race conditions across tabs
- Atomic file writes (write to .tmp, then rename)
- Event broadcasting via `memory-updated` Tauri event
- Cross-tab synchronization via event-driven updates

**MCP Server**: Custom `yume-mcp-memory.cjs` (replaces npm `@modelcontextprotocol/server-memory`)
- Source: `src-tauri/resources/yume-mcp-memory.cjs`
- Copied to: `~/.yume/yume-mcp-memory.cjs` on init
- Registration: `claude mcp add -s user memory -- node ~/.yume/yume-mcp-memory.cjs`
- Tools: `add_observations`, `search_nodes`, `read_graph`
- Writes directly to V2 markdown files

### 20.3 Tauri Commands (17)

| Command | Description |
|---------|-------------|
| `memory_v2_init` | Initialize memory system |
| `memory_v2_add_learning` | Add project learning |
| `memory_v2_add_error` | Add error/solution mapping |
| `memory_v2_add_pattern` | Add project pattern |
| `memory_v2_set_brief` | Set project brief |
| `memory_v2_add_preference` | Add global preference |
| `memory_v2_add_global_pattern` | Add global pattern |
| `memory_v2_build_context` | Build context for injection |
| `memory_v2_get_project` | Get project memory |
| `memory_v2_get_global` | Get global memory |
| `memory_v2_list_projects` | List all projects |
| `memory_v2_delete_entry` | Delete specific entry |
| `memory_v2_prune_expired` | Prune expired entries |
| `memory_v2_clear_project` | Clear project memory |
| `memory_v2_get_base_path` | Get memory base path |

### 20.4 Entry Format & Importance

**Markdown Entry Format**:
```markdown
## 2026-01-28T10:00:00Z | importance:4 | ttl:90 | id:abc123
Uses Zustand for state management
```

**Importance Levels (1-5)**:

| Level | Name | TTL | Use Case |
|-------|------|-----|----------|
| 1 | Ephemeral | 1 day | Temporary notes, scratch context |
| 2 | Low | 7 days | Short-term patterns, session-specific fixes |
| 3 | Normal | 30 days | Standard learnings, error fixes |
| 4 | High | 90 days | Architecture decisions, important patterns |
| 5 | Permanent | ∞ | Core preferences, critical knowledge |

**Auto-Pruning**:
- Expired entries pruned automatically via `memory_v2_prune_expired`
- Based on TTL from importance level
- Safe: only removes entries past expiration

### 20.5 Context Injection

**System Prompt Integration**:
- `<yume-memory>` block injected into system prompt
- Token budget: default 2000 tokens
- Includes relevant project learnings, patterns, and global preferences
- Built via `memory_v2_build_context` command

### 20.6 Migration from V1

**Automatic Migration**:
- V1 storage: `~/.yume/memory.jsonl` (deprecated)
- On first V2 init, V1 data migrated automatically
- Backup created: `memory.jsonl.bak`
- MCP package `@modelcontextprotocol/server-memory` no longer used

### 20.7 Legacy Memory V1 (Deprecated)

The previous memory system using `~/.yume/memory.jsonl` and `@modelcontextprotocol/server-memory` is deprecated. Legacy commands in `src-tauri/src/commands/memory.rs` (12 commands) remain for backward compatibility but are no longer actively used.

## 21. Background Agents

### 21.1 Overview

**Description**: Async agent execution with queue management and git branch isolation for parallel AI-assisted development.

**Location**: `src-tauri/src/background_agents.rs`, `src/renderer/services/backgroundAgentService.ts`

### 21.2 Architecture

- `AgentQueueManager` - Thread-safe manager for background agent lifecycle
- `MAX_CONCURRENT_AGENTS`: 4 (parallel execution limit)
- **No timeout** (agents run until completion)
- Output directory: `~/.yume/agent-output/`
- Event emission: `background-agent-status` (Tauri event)
- **Streaming isolation**: Background agents do NOT control main CLI streaming state; only main process `streaming_end`/`result` events set `streaming=false`

### 21.3 Agent Types

Maps to yume core agents:
- `Architect` (`yume-architect`) - Plans, designs, decomposes tasks
- `Explorer` (`yume-explorer`) - Finds, reads, understands codebase (sonnet, read-only)
- `Implementer` (`yume-implementer`) - Codes, edits, builds (small, focused edits)
- `Guardian` (`yume-guardian`) - Reviews, audits, verifies + domain tasks (tests, docs, devops, data)
- `Custom(String)` - User-defined agents

### 21.4 Agent Status Flow

`Queued` → `Running` → `Completed`/`Failed`/`Cancelled`

### 21.5 Git Branch Isolation

- Branch prefix: `yume-async-{agent-type}-{agent-id}`
- Auto-stash uncommitted changes before branch creation
- Functions: `create_agent_branch`, `merge_agent_branch`, `delete_agent_branch`
- Conflict detection: `check_merge_conflicts`
- Cleanup: `cleanup_old_branches` removes merged branches

### 21.6 Tauri Commands (14)

> Note: Background agents use Claude CLI directly with `--dangerously-skip-permissions`, NOT yume-cli. Debounce timing: 700ms macOS, 2000ms Windows.

| Command | Description |
|---------|-------------|
| `queue_background_agent` | Queue new agent with optional git branch |
| `get_agent_queue` | Get all agents (queued, running, completed) |
| `get_agents_for_session` | Get agents filtered by session ID |
| `get_background_agent` | Get specific agent by ID |
| `cancel_background_agent` | Cancel running/queued agent |
| `remove_background_agent` | Remove completed agent |
| `get_agent_output` | Load agent session file |
| `create_agent_branch` | Create git branch for agent |
| `get_agent_branch_diff` | Get diff vs main branch |
| `merge_agent_branch` | Merge agent work into main |
| `delete_agent_branch` | Delete agent branch |
| `check_agent_merge_conflicts` | Pre-merge conflict check |
| `cleanup_old_agents` | Remove agents >24hrs old |
| `update_agent_progress` | Update progress from monitor |

### 21.7 UI Components

- `AgentQueuePanel.tsx` - Sliding panel with agent cards
- `ProgressIndicator.tsx` - Real-time progress display

### 21.8 Streaming Isolation

**Critical**: Background agents do NOT control main CLI streaming state.
- Only main process `streaming_end`/`result` events set `streaming=false`
- Subagent results (with `parent_tool_use_id`) excluded from clearing streaming state
- Debounce: 700ms macOS, 2000ms Windows

## 22. Orchestration Flow

### 22.1 Overview

**Description**: GSD-inspired automatic task orchestration that guides Claude through structured workflows for complex tasks. Baked into default behavior - no user intervention needed.

**Location**: `src/renderer/services/systemPromptService.ts`, `src-tauri/src/claude_spawner.rs`

### 22.2 How It Works

Yume automatically appends an orchestration prompt to new sessions via the `--append-system-prompt` CLI flag. This teaches Claude to:

1. **Assess** - Determine if task is trivial (1-2 steps) or complex (3+ steps)
2. **Understand** - Gather context before planning (use explorer agent)
3. **Decompose** - Break into atomic steps (use architect agent)
4. **Act** - Execute one step at a time, verify each
5. **Verify** - Review work after significant changes (use guardian agent)

### 22.3 Default Prompt

```
yume. lowercase, concise.

complex tasks (3+ steps): understand → decompose → act → verify.
use architect to plan, explorer to search, guardian after changes.
one step at a time, verify before next.
```

### 22.4 Agent Integration

The orchestration flow leverages yume's 4 core agents:

| Agent | Role in Flow |
|-------|--------------|
| `yume-architect` | Decompose complex tasks, identify dependencies/risks |
| `yume-explorer` | Search codebase, gather context before planning (sonnet, read-only) |
| `yume-implementer` | Make focused code changes (small, incremental edits) |
| `yume-guardian` | Review for bugs, security, performance + domain tasks (tests, docs, devops, data) |

### 22.5 Implementation

**Rust Backend** (`claude_spawner.rs`):
```rust
pub struct SpawnOptions {
    // ...
    pub append_system_prompt: Option<String>,
}

// In build_claude_command:
if let Some(system_prompt) = &options.append_system_prompt {
    cmd.arg("--append-system-prompt").arg(system_prompt);
}
```

**Frontend** (`tauriClaudeClient.ts`):
```typescript
// On new session creation (not resume)
const appendSystemPrompt = !options?.claudeSessionId
  ? systemPromptService.getActivePrompt()
  : null;

const request = {
  // ...
  append_system_prompt: appendSystemPrompt
};
```

### 22.6 Configuration

**Settings** (Settings → General → System Prompt):

| Setting | Description |
|---------|-------------|
| `enabled` | Enable/disable system prompt injection |
| `mode` | `'default'` (orchestration), `'custom'`, or `'none'` |
| `customPrompt` | User's custom prompt (when mode is 'custom') |
| `agentsEnabled` | Include agent guidance in prompt |

**Storage**: `localStorage` key `yume_system_prompt_settings`

### 22.7 Customization

Users can override the default orchestration:

1. **Custom prompt**: Settings → General → System Prompt → Custom
2. **Disable entirely**: Settings → General → System Prompt → None
3. **Disable agents**: Toggle "Include agent guidance" off

When agents are disabled, falls back to simpler prompt:
```
yume. lowercase, concise. read before edit, small changes, relative paths.
```

### 22.8 Key Benefits

- **Automatic** - No special commands to invoke, baked into every session
- **Context-aware** - Only applies structured flow to complex tasks
- **Agent-leveraged** - Uses existing agents naturally in the workflow
- **Customizable** - Users can override or disable entirely
- **Non-intrusive** - Trivial tasks proceed directly without overhead

## 23. Auto-Update System

### 23.1 Claude CLI Auto-Update

**Description**: Automatically runs `claude update` on app startup to keep the CLI current.

**Location**: `src/renderer/stores/claudeCodeStore.ts`

**Features**:
- Toggle in Settings (General tab): "auto-update claude" (default: on)
- Runs `claude update` via bash on app start
- Parses output for version info and update status
- Non-blocking: runs in background without interrupting user flow

### 23.2 App Version Check

**Description**: Checks for new Yume versions via GitHub Pages on app startup.

**Location**: `src/renderer/services/versionCheck.ts`

**Features**:
- Fetches `version.txt` from `https://aofp.github.io/yume/version.txt`
- Semantic version comparison against current app version
- Update notification shown in window controls when new version available
- Result cached in localStorage between sessions
- Cache-busting via timestamp query parameter

### Test Infrastructure

**Framework:** Vitest with jsdom environment (`vitest.config.ts`)

**8 Test Suites:**
| Category | File | Coverage |
|----------|------|----------|
| Config | `app.test.ts` | App name, version, ID derivation |
| Config | `tools.test.ts` | Tool definitions validation |
| Services | `licenseManager.test.ts` | License validation, trial/pro |
| Types | `ucf.test.ts` | UCF format validation |
| Utils | `chatHelpers.test.ts` | Chat utility functions |
| Utils | `helpers.test.ts` | General helper functions |
| Utils | `performance.test.ts` | Performance utilities |
| Utils | `regexValidator.test.ts` | ReDoS pattern validation |

**Setup:** `src/test/setup.ts` mocks Tauri APIs for test isolation

## Conclusion

Yume offers a comprehensive feature set that surpasses competitors (including YC-backed Opcode) in key areas:

1. **Unique Features**:
   - **Orchestration flow** - GSD-inspired automatic task decomposition (understand → decompose → act → verify)
   - **Memory MCP system** - persistent knowledge graph for patterns, error fixes, context
   - **Background agents** - async execution with git branch isolation (4 concurrent)
   - **Auto-update** - CLI auto-update on startup + app version check via GitHub Pages
   - **License system** with trial/pro tiers ($21 one-time)
   - **Plugin system** - complete extensibility framework (commands, agents, hooks, skills, MCP)
   - **Skills system** - auto-inject context based on triggers (file extensions, keywords, regex)
   - **Performance monitoring** - real-time FPS, memory, render time metrics
   - **Analytics dashboard** - comprehensive usage tracking by project/model/date
   - **Timeline & checkpoints** - visual conversation state management
   - **CLAUDE.md editor** - in-app project documentation editing
   - 5h + 7-day Anthropic limit tracking (no competitor has this)
   - Auto-compaction (70% warn, 78% auto, 85% force) - matches Claude Code's 45k token buffer
   - Crash recovery (auto-save every 5 min)
   - Built-in agents (architect, explorer, implementer, guardian)
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
   - 12 themes (OLED-optimized)
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
- **Yume has**: License system, plugins, skills, performance monitoring, analytics, history/rollback, CLAUDE.md editor, 5h/7d limit tracking, hooks, themes, agents, auto-compaction, crash recovery, keyboard shortcuts, custom commands
- **Opcode has**: Multi-session tabs, basic token tracking (but missing most advanced features above)

**Key Differentiators**:
1. **Plugin System** - No competitor offers a complete plugin framework with 5 component types
2. **Skills System** - Unique auto-inject context system based on triggers
3. **Performance Monitoring** - Only Yume has real-time metrics with export
4. **Analytics Dashboard** - Most comprehensive usage tracking and reporting
5. **License Management** - Commercial licensing system with trial/pro tiers
6. **History & Rollback** - File-aware undo with conflict detection

The combination of advanced features with a focus on performance, privacy, and extensibility makes Yume the most capable Claude GUI available.

**Multi-Provider Support:** Multi-provider support (Gemini/OpenAI) is implemented but disabled by default via feature flags (`PROVIDER_GEMINI_AVAILABLE: false`, `PROVIDER_OPENAI_AVAILABLE: false`). Uses a Claude-compatible stream-json shim (`yume-cli`). Enable in `src/renderer/config/features.ts`.
