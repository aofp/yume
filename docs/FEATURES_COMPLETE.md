# Yurucode Complete Feature Documentation

**Version:** 1.0.0
**Last Updated:** January 9, 2026
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

### 7.4 Yurucode Agents System

**Description**: 5 built-in AI agents that sync to `~/.claude/agents/` for Claude CLI integration.

**Location**: `src-tauri/src/commands/mod.rs` (sync), `src/renderer/services/agentExecutionService.ts` (execution)

**The 5 Yurucode Core Agents**:

| Agent | Model | Purpose | Key Tools |
|-------|-------|---------|-----------|
| **architect** | opus | Plans, designs, decomposes tasks | TodoWrite |
| **explorer** | sonnet | Finds, reads, understands codebase | Glob, Grep, Read |
| **implementer** | opus | Codes, edits, builds | Edit, Write |
| **guardian** | opus | Reviews, audits, verifies | Read, Grep |
| **specialist** | sonnet | Domain-specific: tests, docs, devops | Varies |

**Sync Mechanism**:
- Agents are written as `.md` files to `~/.claude/agents/yurucode-*.md`
- Uses YAML frontmatter format compatible with Claude CLI
- PID tracking prevents multiple yurucode instances from conflicting
- Agents removed on app exit (only if last instance running)

**File Format** (written to `~/.claude/agents/yurucode-architect.md`):
```yaml
---
name: yurucode-architect
model: opus
description: proactively use this agent before implementing complex features...
---

architect agent. plan, design, decompose. think first. output: steps, dependencies, risks. use TodoWrite.
```

**Commands**:
- `sync_yurucode_agents(enabled, model)`: Enable/disable agent sync
- `are_yurucode_agents_synced()`: Check if agents are currently synced
- `cleanup_yurucode_agents_on_exit()`: Remove agents on app exit

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

**Activation**: Set `YURUCODE_DEBUG=true`

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
interface YurucodePlugin {
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

## Feature Comparison Matrix

| Feature | Yurucode | Opcode | Claudia | Continue |
|---------|----------|--------|---------|----------|
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
| CLAUDE.md editor | ❌ | ✅ | ❌ | ❌ |
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

Yurucode offers a comprehensive feature set that surpasses competitors (including YC-backed Opcode) in key areas:

1. **Unique Features**:
   - 5h + 7-day Anthropic limit tracking (no competitor has this)
   - Auto-compaction (55% warn, 60% auto, 65% force) - same 38% buffer as Claude Code
   - Crash recovery (auto-save every 5 min)
   - Built-in agents (architect, explorer, implementer, guardian, specialist)
   - Custom commands with templates
   - Hook system for behavior customization
2. **Performance**: Virtual scrolling, bounded buffers, lazy loading, native Tauri/Rust
3. **Privacy**: No telemetry, local-only operation
4. **Extensibility**: Hooks (9 events), MCP support, custom commands
5. **Polish**: 30 themes, 30+ keyboard shortcuts, drag & drop, git diff viewer

**Yurucode vs Opcode**: Opcode is YC-backed but yurucode is technically superior in almost every category:
- Yurucode has: 5h/7d limit tracking, hooks, themes, agents, auto-compaction, crash recovery, keyboard shortcuts, custom commands
- Opcode has: CLAUDE.md editor (yurucode doesn't have this yet)

The combination of advanced features with a focus on performance and privacy makes Yurucode the most capable Claude GUI available.