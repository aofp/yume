# Yume Complete Feature Documentation

**Version:** 0.17.0
**Last Updated:** February 26, 2026
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
20. [Background Agents](#20-background-agents)
21. [Orchestration Flow](#21-orchestration-flow)
22. [Auto-Update System](#22-auto-update-system)
23. [ACP (Agent Client Protocol)](#23-acp-agent-client-protocol)
24. [Sandbox Security](#24-sandbox-security)
25. [Analytics Enhancements](#25-analytics-enhancements)
26. [Split Panes](#26-split-panes)
27. [Light Theme](#27-light-theme)
28. [Background Bash Processes](#28-background-bash-processes)
29. [File Preview](#29-file-preview)
30. [Thinking Streaming](#30-thinking-streaming)
31. [Memory System V2](#31-memory-system-v2)
32. [CLAUDE.md Editor](#32-claudemd-editor)
33. [Bash Mode](#33-bash-mode)
34. [Performance Flags](#34-performance-flags)
35. [Font Customization](#35-font-customization)
36. [Auth Login Modal](#36-auth-login-modal)
37. [Stream Event Dots](#37-stream-event-dots)
38. [File Drop Attachment](#38-file-drop-attachment)
39. [Windows ARM64 Support](#39-windows-arm64-support)
40. [Row Split Panels](#40-row-split-panels)
41. [Vim Mode](#41-vim-mode)
42. [Flatpak Support](#42-flatpak-support)
43. [Favorite Projects](#43-favorite-projects)

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
- Claude Sonnet 4.6 (`claude-sonnet-4-6`) - Balanced coding
- Claude Opus 4.6 (`claude-opus-4-6`) - Best reasoning

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
- **Thinking streaming** - Live extended thinking display (UNIQUE - not even CLI has this)
- MCP with 8M+ server integrations

**CLI Arguments**:
```bash
claude \
  --print \                    # Enable output
  --output-format stream-json \ # Streaming JSON
  --model claude-sonnet-4-6 \  # Model selection
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

**Description**: Automatically compacts conversation context with dynamic thresholds (default T=85%: 80% warning, 85% auto, 90% force). Auto-compact is off by default -- CLI handles it.

**Unique Feature**: Variable threshold system with 5% warning buffer and 5% force buffer around the configurable auto-compact threshold.

### 3.2 Technical Implementation

**Location**: `src-tauri/src/compaction/mod.rs`

**Threshold Detection**:
```rust
pub struct CompactionConfig {
    pub auto_threshold: f32,  // default 0.85 (85%)
    pub force_threshold: f32, // default 0.90 (auto + 5%)
}

// Dynamic thresholds: warning = threshold - 5%, auto = threshold, force = threshold + 5%
pub fn check_compaction_action(&self, usage: f32) -> CompactionAction {
    let warning_threshold = threshold - 0.05;  // 80%
    let auto_threshold = threshold;            // 85%
    let force_threshold = threshold + 0.05;    // 90%

    if usage >= force_threshold { Force }
    else if usage >= auto_threshold { AutoTrigger }
    else if usage >= warning_threshold { Warning }
    else { None }
}
```

### 3.3 Compaction Process

**Steps**:
1. **Detection**: Monitor reaches 85% (auto) or 90% (force) threshold (default values)
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
  autoThreshold: number;       // 0.85 (85%) default
  forceThreshold: number;      // 0.90 (90%) default (auto + 5%)
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
| Claude Opus 4.6 | $15 | $75 |
| Claude Sonnet 4.6 | $3 | $15 |

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

### 6.2 Available Triggers

**9 Hook Events (4 active)**:

*Active hooks (wired to execution paths):*
- `user_prompt_submit`: Before user message sent **(ACTIVE)**
- `pre_tool_use`: Before tool execution **(ACTIVE)**
- `context_warning`: Context threshold exceeded **(ACTIVE)**
- `compaction_trigger`: Before auto-compaction **(ACTIVE)**

*Defined but not currently called:*
- `post_tool_use`: After tool execution
- `assistant_response`: After assistant response
- `session_start`: New session created
- `session_end`: Session closed
- `error`: Error occurred

> **Note:** Only 4 of 9 hooks are actively triggered. The other 5 are defined but not wired to any execution path.

### 6.3 Hook Examples

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

**18 Themes (12 dark + 6 light)**:

*Dark themes (OLED optimized):*
- yume, void, cobalt, slate, arctic, synth, mint, grove, ochre, bourbon, burnt, rose

*Light themes:*
- paper, olive, ivory, classic, cloud, luna

**Default Theme (yume - dark)**:
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

**OLED Optimized (dark themes)**:
- Pure black backgrounds
- High contrast text
- Minimal gray usage
- Power efficiency

### 9.3 Stream Event Dots

Live visualization of tool activity during streaming in `StreamIndicator.tsx`.
- **12 event types:** `search`, `read`, `edit`, `bash`, `bash_result`, `thinking`, `message`, `agent`, `web`, `todo`, `tool_call`, `tool_result`
- **Sliding window:** 5s window, max 10 dots visible, last dot persists permanently
- **Gradient blending:** Tool-color weight scales with dot count (30% at 1 dot → 70% at 10+), blended with accent color
- **Event rate tracking:** 60s window drives gradient opacity (0 events → 0%, 30+ events → 50%)
- **Icons:** Tabler icons per type (`IconSearch`, `IconEye`, `IconPencil`, `IconTerminal2`, `IconBrain`, etc.)
- **CSS color resolution:** Cached probe element resolves `var()` colors to RGB for blending (50-entry LRU, 5s TTL for theme changes)

### 9.4 Keyboard Shortcuts (40+)

**Tabs**: `Cmd/Ctrl+T` New tab | `Cmd/Ctrl+W` Close tab | `Cmd/Ctrl+D` Duplicate | `Cmd/Ctrl+Shift+D` Fork | `Ctrl+Tab` Next | `Cmd/Ctrl+1-9` Switch | `F2` Rename

**Panels**: `Cmd/Ctrl+P` Palette | `Cmd/Ctrl+E` Files | `Cmd/Ctrl+G` Git | `Cmd/Ctrl+J` Sessions | `Cmd/Ctrl+R` Recent | `Cmd/Ctrl+N` New pane | `Cmd/Ctrl+Shift+N` New window | `Cmd/Ctrl+Shift+A` Agents | `Cmd/Ctrl+B` BG processes | `Cmd/Ctrl+,` Settings

**Session**: `Cmd/Ctrl+.` Stats | `Cmd/Ctrl+K` Model & tools | `Cmd/Ctrl+Shift+K` Toggle model | `Cmd/Ctrl+O` Open project | `Cmd/Ctrl+L` Clear | `Cmd/Ctrl+M` Compact | `Cmd/Ctrl+Shift+R` Resume | `Cmd/Ctrl+Shift+E` Edit CLAUDE.md | `Cmd/Ctrl+Y` Analytics | `Cmd/Ctrl+H` Rollback

**Input**: `Cmd/Ctrl+F` Search | `Cmd/Ctrl+U` Clear input | `Cmd/Ctrl+/` Focus | `Cmd/Ctrl+Shift+V` Direct paste | `Shift+Enter` New line | `Ctrl+S` Auto-scroll | `F5` Dictate | `Escape` Cancel | `?`/`F1` Help

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

**Description**: Freeware with optional Pro license for extended limits.

**Pricing**:
- **Free**: All features (3 tabs total)
- **Pro**: $29 (99 tabs, 99 windows)

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
  maxTabs: number      // 2 (trial) or 99 (pro)
  maxWindows: number   // 1 (trial) or 99 (pro)
}
```

**Cross-Window Enforcement:**
- `GLOBAL_TAB_COUNT` (AtomicU32) in Rust tracks total panes across all windows
- Single-instance plugin enforces 1-window limit for trial users
- Cross-window enforcement prevents circumventing limits by opening multiple windows

**UI Component**: `UpgradeModal.tsx`
- Shows upgrade prompts with reasons: `tabLimit`, `paneLimit`, `windowLimit`, `feature`, `demo`
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

**Claude Code Plugin Compatibility:**
- Plugins with `source: 'claude-code'` flag are supported
- Separate `enableCCPlugin()`/`disableCCPlugin()` methods in `pluginService.ts`
- Yume-specific overrides applied on top of CC plugin structure

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

| Feature | Yume |
|---------|------|
| Thinking streaming (live) | Yes (unique) |
| Split panes (2/3-pane) | Yes |
| 18 themes (12 dark + 6 light) | Yes |
| Memory system (per-project) | Yes |
| CLAUDE.md editor | Yes |
| Bash mode (!/$ prefix) | Yes |
| Performance flags | Yes |
| Font customization | Yes |
| Background bash processes | Yes |
| File preview (images/audio/video/PDF/code) | Yes |
| Native macOS menu | Yes |
| Text selection | Yes |
| Auto-update (CLI + app) | Yes |
| License system (trial/pro) | Yes |
| Plugin system | Yes |
| Skills system | Yes |
| Performance monitoring | Yes |
| Analytics dashboard | Yes |
| 5h + 7d limit tracking | Yes |
| Auto-compact (configurable thresholds) | Yes |
| Multi-session tabs | Yes |
| Token tracking | Yes |
| Cost calculation | Yes |
| Crash recovery | Yes |
| Hook system (9 events, 4 active) | Yes |
| MCP support | Yes |
| Virtual scrolling | Yes |
| Git diff viewer | Yes |
| 4 built-in agents | Yes |
| Custom commands | Yes |
| 32+ keyboard shortcuts | Yes |
| History + rollback | Yes |
| ACP (Agent Client Protocol) | Yes |
| Sandbox security | Yes |
| Multi-provider (feature-flagged) | Yes |
| Stream event dots | Yes |
| Auth login modal | Yes |
| Windows ARM64 | Yes |
| File drop attachment | Yes |
| No telemetry | Yes |
| Platform support | macOS, Windows, Linux |

## Performance Benchmarks

| Operation | Target | Typical |
|-----------|--------|---------|
| Startup | <3s | ~2.3s |
| New session | <200ms | ~180ms |
| Send message | <100ms | ~65ms |
| Compaction | <5s | ~3.8s |
| Memory (idle) | <200MB | ~145MB |

## 20. Background Agents

### 21.1 Overview

**Description**: Async agent execution with queue management and git branch isolation for parallel AI-assisted development.

**Location**: `src-tauri/src/background_agents.rs`, `src/renderer/services/backgroundAgentService.ts`

### 21.2 Architecture

- `AgentQueueManager` - Thread-safe manager for background agent lifecycle
- `MAX_CONCURRENT_AGENTS`: 4 (parallel execution limit)
- **30-min timeout** (configurable per agent)
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

> **Note:** Background agents use Claude CLI directly with `--dangerously-skip-permissions`, NOT yume-cli. Subagent results (with `parent_tool_use_id`) are excluded from clearing main streaming state. Debounce timing: 700ms macOS, 2000ms Windows.

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
- Subagent results (with `parent_tool_use_id`) are also excluded from clearing streaming state
- Debounce timing: 700ms macOS, 2000ms Windows (accounts for platform event timing differences)

## 21. Orchestration Flow

### 21.1 Overview

**Description**: GSD-inspired automatic task orchestration that guides Claude through structured workflows for complex tasks. Baked into default behavior - no user intervention needed.

**Location**: `src/renderer/services/systemPromptService.ts`, `src-tauri/src/claude_spawner.rs`

### 21.2 How It Works

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

## 22. Auto-Update System

### 22.1 Claude CLI Smart Update

**Description**: Automatically checks for Claude CLI updates on startup, only updating if a new version is available.

**Location**: `src-tauri/src/commands/claude_info.rs`

**Features**:
- Toggle in Settings (General tab): "auto-update claude" (default: off, `autoUpdateClaude: false`)
- Smart version check via npm registry API (no npm CLI required)
- Compares local version against `https://registry.npmjs.org/@anthropic-ai/claude-code/latest`
- Only runs update if version mismatch detected
- Non-blocking: runs in background without interrupting user flow
- Supports npm, yarn, pnpm, bun installs

### 22.2 App Version Check

**Description**: Checks for new Yume versions via GitHub Pages on app startup.

**Location**: `src/renderer/services/versionCheck.ts`

**Features**:
- Fetches `version.txt` from `https://aofp.github.io/yume/version.txt`
- Semantic version comparison against current app version
- Update notification shown in window controls when new version available
- Result cached in localStorage between sessions
- Cache-busting via timestamp query parameter

### Test Infrastructure

**Framework:** Vitest 3.x with jsdom environment (`vitest.config.ts`)

**81 Test Suites, 2966 tests:**
| Category | Count | Examples |
|----------|-------|----------|
| Config | 5 | app, features, models, themes, tools |
| Services | 21 | licenseManager, versionCheck, hooksService, pluginService, etc. |
| Types | 3 | backgroundAgents, skill, ucf |
| Stores | 1 | claudeCodeStore |
| Utils | 5 | chatHelpers, helpers, performance, regexValidator, structuredLogger |

**Setup:** `src/test/setup.ts` mocks Tauri APIs for test isolation

## 23. ACP (Agent Client Protocol)

**Description**: External agent connections via standardized protocol for connecting third-party AI agents.

**Location**: `src-tauri/src/acp/` (module), `src-tauri/src/commands/acp.rs` (commands)

**14 Commands**:
| Command | Description |
|---------|-------------|
| `acp_init` | Initialize ACP client |
| `acp_list_agents` | List available agents |
| `acp_connect_agent` | Connect to an agent |
| `acp_disconnect_agent` | Disconnect from an agent |
| `acp_create_session` | Create agent session |
| `acp_send_prompt` | Send prompt to agent |
| `acp_cancel` | Cancel running request |
| `acp_get_status` | Get agent status |
| `acp_get_session` | Get session info |
| `acp_list_sessions` | List all sessions |
| `acp_add_agent` | Add agent to config |
| `acp_remove_agent` | Remove agent |
| `acp_set_agent_enabled` | Enable/disable agent |
| `acp_get_config_path` | Get config file path |

**Cleanup**: `cleanup_acp()` called on app exit to close all connections.

## 24. Sandbox Security

**Description**: Process isolation for secure execution of CLI commands and tools.

**Location**: `src-tauri/src/sandbox/` (module), `src-tauri/src/commands/sandbox.rs` (commands)

**State Management**:
- `SandboxSettings` stored in `AppState` with RwLock for thread-safe access
- Settings include: enabled flag, allowed paths, protected credential paths

**7 Commands**:
| Command | Description |
|---------|-------------|
| `get_sandbox_status` | Check if sandbox is active |
| `get_sandbox_settings` | Get current settings |
| `set_sandbox_enabled` | Toggle sandbox on/off |
| `set_sandbox_settings` | Update full settings |
| `get_sandbox_config` | Get config object |
| `get_protected_credential_paths` | List protected paths |
| `test_sandbox_path_access` | Test if path is accessible |

## 25. Analytics Enhancements

### 26.1 Hourly Statistics

**Description**: Track usage patterns by hour of day (00-23).

**Location**: `server-claude-*.cjs` (analytics endpoint)

**Data Structure**:
```javascript
byHour: {
  "00": { sessions: 0, messages: 0, tokens: 0 },
  "01": { sessions: 0, messages: 0, tokens: 0 },
  // ... through "23"
}
```

### 26.2 Activity Streaks

**Description**: Track consecutive days of usage for gamification/motivation.

**Data Structure**:
```javascript
streaks: {
  current: 5,      // Current consecutive days
  longest: 12,     // Longest streak ever
  lastActiveDate: "2026-01-30"
}
```

**Calculation**: Analyzes `byDate` to find consecutive days with tokens > 0.

## 26. Split Panes

### 26.1 Overview

**Description**: Multi-pane layout system for parallel workflows within a single window.

**Features**:
- 2-pane layout (side-by-side sessions)
- 3-pane layout (three sessions visible simultaneously)
- Drag-to-resize pane borders
- Focus tracking across panes
- Titlebar dragging preserved in split-pane mode
- Windows AV hardening for split pane views
- Independent scroll per pane

### 26.2 Implementation

- Layout state managed in session store
- Each pane runs an independent session
- Keyboard shortcuts work in focused pane
- Tab operations scoped to active pane

## 27. Light Theme

### 27.1 Overview

**Description**: Full light theme support with automatic luminance detection and proper color-scheme integration.

**Features**:
- Luminance-based detection for system theme matching
- `color-scheme` CSS property support
- High contrast text for readability
- Proper highlighting in light mode
- Turn-scoped message IDs for consistent styling
- All 12 existing themes + light theme variant

### 27.2 Implementation

- CSS custom properties for theme switching
- `prefers-color-scheme` media query support
- Darkened light theme text for better contrast
- Color blending adjustments for bash output backgrounds

## 28. Background Bash Processes

### 28.1 Overview

**Description**: Detached bash process execution with automatic result injection into conversations.

### 28.2 Features

- **Cross-platform**: nohup/setsid on macOS/Linux, Task Scheduler + VBScript on Windows
- **Persistent tracking**: State in `~/.yume/bg-processes.json` with PID, command, cwd, session, status
- **Auto-injection**: Frontend polls every 3s, backend checks for completion, injects output into originating session
- **Deduplication**: Prevents duplicate spawns via command+cwd+session fingerprinting
- **MCP integration**: `yume-mcp-bash` server provides `RunBash` tool with `run_in_background` parameter
- **UI indicator**: `BackgroundProcessIndicator` shows running count, click to view list
- **Output capture**: To `~/.yume/bg-output/{process-id}.txt`, auto-cleared after injection
- **Persistence**: Survives MCP server restarts, tracked independently from session lifecycle

### 28.3 Commands (8)

| Command | Description |
|---------|-------------|
| `spawn_bg_bash` | Spawn detached background process |
| `list_bg_processes` | List all background processes |
| `kill_bg_process` | Kill a running process |
| `read_bg_output` | Read process output |
| `clear_bg_output` | Clear output file |
| `cleanup_old_bg_processes` | Remove old processes |
| `check_newly_completed_bg_processes` | Check for completions |
| `inject_bg_completion` | Inject output into session |

## 29. File Preview

### 29.1 Overview

**Description**: In-app file preview modal with support for multiple file types.

### 29.2 Supported Formats

| Type | Formats | Method |
|------|---------|--------|
| Images | PNG, JPG, GIF, WebP, SVG, TIFF, HEIC/HEIF | Base64 data URLs |
| Audio | MP3, WAV, FLAC, AAC, OGG, M4A | HTML5 audio player |
| Video | MP4, MOV, AVI, MKV, WebM | HTML5 video player |
| Code | All text files | Syntax highlighting (max 2000 lines) |
| PDF | .pdf | External viewer integration |

### 29.3 Features

- Compact UI (60px top margin for title bar, reduced padding)
- Line numbers for code (dynamic width based on total lines)
- "Open in Finder/Explorer" and "Open in Browser" actions
- Escape to close, keyboard navigation
- Path resolution (absolute/relative with working directory)
- Truncation notice for large files
- Triggered by clicking file paths in messages, @ mentions, or preview button

## 30. Thinking Streaming

### 30.1 Overview

**Description**: Live display of Claude's extended thinking process as it streams. This is a **unique feature** - not even the official Claude CLI shows thinking in real-time.

### 30.2 Features

- Real-time thinking block rendering during streaming
- Unique blockId per API response to prevent duplicates
- Global dedup for thinking deltas across multiple listeners
- Single listener handles `message_start` to prevent duplicate blocks
- Delta content hash for dedup key
- Thinking blocks visually distinguished from regular output

### 30.3 Technical Details

- Thinking blocks extracted from `content_block_start` and `content_block_delta` events
- Deduplication via content hash instead of length-based comparison
- Only one Socket.IO listener processes `message_start` events
- Assistant messages with only thinking content are filtered from `onMessage`

## 31. Memory System V2

### 31.1 Overview
**Description**: Per-project markdown-based memory with importance levels and automatic TTL-based pruning.

**Storage**: `~/.yume/memory/` with global + per-project folders.

### 31.2 Features
- **5 importance levels**: ephemeral (1d TTL), low (7d), normal (30d), high (90d), permanent (no expiry)
- **Auto-learning**: Extracts error fixes, architecture decisions, user preferences from conversations
- **Context injection**: `<yume-memory>` block injected into system prompt with configurable token budget
- **Auto-pruning**: Expired entries pruned automatically based on TTL on startup
- **Per-project isolation**: Separate memory files per working directory

### 31.3 Implementation
- **Backend**: 15 Tauri commands for memory_v2 operations
- **MCP server**: `yume-mcp-memory.cjs` for memory read/write/search
- **Storage format**: Markdown files (migrated from V1 JSONL format)

## 32. CLAUDE.md Editor

### 32.1 Overview
**Description**: In-app editor for project-level CLAUDE.md files, accessible via keyboard shortcut.

**Shortcut**: `Cmd+Shift+E`

**Component**: `ClaudeMdEditorModal.tsx`

### 32.2 Features
- Edit CLAUDE.md for the current project directory
- Create new CLAUDE.md if one doesn't exist
- Syntax-aware editing with save/cancel actions
- Changes persist to disk immediately

## 33. Bash Mode

### 33.1 Overview
**Description**: Direct terminal command execution via `!` or `$` prefix in the chat input.

### 33.2 Usage
- Type `!command` or `$command` in the input field to run a bash command directly
- Output displayed inline in the conversation
- Useful for quick file checks, git status, etc. without asking Claude

## 34. Performance Flags

### 34.1 Overview
**Description**: Runtime-configurable performance flags for tuning streaming, rendering, and platform-specific behavior.

**Location**: `src/renderer/config/performanceFlags.ts`

### 34.2 Available Flags
| Flag | Default | Description |
|------|---------|-------------|
| `IPC_BATCHING` | true | Reduces setState calls during streaming from 100+/sec to ~60/sec |
| `SINGLE_RAF_SCROLL` | false | Simplified single-RAF scroll correction |
| `CAFFEINATE` | true | Prevents macOS App Nap during streaming |
| `AGGRESSIVE_GPU` | true | GPU composite layers for smooth scrolling |
| `CACHE_TODOS` | true | Memoizes buildTaskListFromMessages for performance |

### 34.3 Configuration
```javascript
// Via localStorage
localStorage.setItem('yume_perf_IPC_BATCHING', 'false');

// Via window API (debug)
window.perfFlags.set('CAFFEINATE', false);
window.perfFlags.all();  // Show all flags
window.perfFlags.log();  // Log current state
```

## 35. Font Customization

### 35.1 Overview
**Description**: Customizable fonts for monospace and sans-serif text in the UI.

**Component**: `FontPickerModal.tsx`

### 35.2 Settings
- **Monospace font**: Used for code blocks and terminal output (`yume_mono-font`)
- **Sans-serif font**: Used for UI text (`yume_sans-font`)
- **Font size**: Configurable (`yume_font-size`)
- **Line height**: Configurable (`yume_line-height`)

## 36. Auth Login Modal

### 36.1 Overview
**Description**: In-app OAuth authentication for Claude CLI, allowing users to log in without leaving the application.

**Location**: `src/renderer/components/AuthLoginModal/AuthLoginModal.tsx`

### 36.2 Features
- Inline OAuth login flow within the app
- Proactive auth checking on startup
- OAuth token refresh on 401 errors
- Seamless re-authentication without restarting

## 37. Stream Event Dots

### 37.1 Overview
**Description**: Live visualization of tool activity during streaming, providing real-time feedback on what Claude is doing.

**Location**: `src/renderer/components/Chat/StreamIndicator.tsx`

### 37.2 Features
- **12 event types**: `search`, `read`, `edit`, `bash`, `bash_result`, `thinking`, `message`, `agent`, `web`, `todo`, `tool_call`, `tool_result`
- **Sliding window**: 5s window, max 10 dots visible, last dot persists permanently
- **Gradient blending**: Tool-color weight scales with dot count (30% at 1 dot to 70% at 10+), blended with accent color
- **Event rate tracking**: 60s window drives gradient opacity (0 events = 0%, 30+ events = 50%)
- **Icons**: Tabler icons per type (`IconSearch`, `IconEye`, `IconPencil`, `IconTerminal2`, `IconBrain`, etc.)
- **CSS color resolution**: Cached probe element resolves `var()` colors to RGB for blending (50-entry LRU, 5s TTL for theme changes)

## 38. File Drop Attachment

### 38.1 Overview
**Description**: Drag-and-drop file attachment support. Dropped text and code files are attached to the conversation instead of inserting file paths.

### 38.2 Features
- Dropped text/code files are attached as context rather than inserting paths
- Supports drag-and-drop workflow for quick file sharing
- File content is included in the conversation for Claude to reference

## 39. Windows ARM64 Support

### 39.1 Overview
**Description**: Native ARM64 builds for Windows, supporting Qualcomm Snapdragon and other ARM-based Windows devices.

### 39.2 Features
- Separate Tauri config: `tauri.win-arm64.conf.json`
- Native ARM64 binary compilation
- Full feature parity with x64 Windows builds

---

## Conclusion

Yume offers a comprehensive feature set with unique capabilities:

**Key Differentiators:**
- **Thinking streaming** - Live extended thinking display (unique, not even CLI has this)
- **Split panes** - 2-pane and 3-pane layouts for parallel workflows
- **Background bash processes** - Detached execution with auto-inject results
- **File preview** - In-app preview for images, audio, video, PDF, code
- **Orchestration flow** - Automatic task decomposition (understand, decompose, act, verify)
- **MCP support** - User-installable memory servers and tools
- **Background agents** - Async execution with git branch isolation (4 concurrent)
- **Plugin system** - Complete extensibility (commands, agents, hooks, skills, MCP)
- **Auto-compaction** - Dynamic thresholds (80% warn, 85% auto, 90% force; off by default)
- **Stream event dots** - Live tool activity visualization with gradient blending
- **Auth login modal** - In-app OAuth authentication for Claude CLI
- **File drop attachment** - Drag-and-drop files as context attachments
- **Row split panels** - Up to 6 panels in 3x2 grid layout
- **Vim mode** - Normal/insert/visual/command modes for chat input
- **Flatpak support** - Native Linux Flatpak packaging with flatpak-spawn
- **Favorite projects** - Hotkey bindings (a-z) for quick project access
- **Windows ARM64** - Native ARM64 builds for Windows
- **18 themes** - 12 OLED dark themes + 6 light themes with luminance detection
- **Memory system** - Per-project markdown memory with importance levels and TTL pruning
- **CLAUDE.md editor** - In-app editor for project instructions (Cmd+Shift+E)
- **Bash mode** - Direct terminal execution via !/$ prefix in chat input
- **Performance flags** - Runtime-configurable flags for streaming, rendering, platform tuning
- **Font customization** - Configurable monospace/sans-serif fonts, size, and line height
- **Performance monitoring** - Real-time FPS, memory, render metrics
- **Analytics dashboard** - Usage tracking by project/model/date

**Technical Strengths:**
- Virtual scrolling for 1000+ message sessions
- Bounded buffers and lazy loading
- Native Tauri/Rust backend
- Native macOS menu integration
- Text selection in chat messages
- No telemetry, local-only operation
- 4 built-in agents with Claude CLI integration
- Cross-platform background bash (nohup/setsid macOS/Linux, Task Scheduler Windows)

**Multi-Provider Support:** Gemini/OpenAI support is implemented but disabled by default via feature flags. Uses `yume-cli` shim with Claude-compatible stream-json output.

## 40. Row Split Panels

Split panes vertically into rows, supporting up to 6 panels in a 3-column x 2-row grid.

### Features
- Split any column into top/bottom rows
- Independent sessions per panel
- Keyboard shortcuts: `Cmd+Shift+1/2/3` to switch panes
- Drag-to-resize between rows
- Panels persist across restarts

## 41. Vim Mode

Full vim-style keybinding support for the chat input area.

### Modes
| Mode | Description |
|------|-------------|
| Normal | Navigation and commands (`h/j/k/l`, `w/b/e`, `0/$`) |
| Insert | Text editing (`i/a/o/A/I/O`) |
| Visual | Text selection (`v`, shift+arrows) |
| Command | Ex commands (`:w` to send, `:q` to clear) |

### Features
- Mode indicator in input area
- `Escape` to return to normal mode
- Standard vim motions and operators
- Toggle via settings or command palette

## 42. Flatpak Support

Native Linux Flatpak packaging for sandboxed distribution.

### Implementation
- `flatpak-spawn --host` for CLI execution from sandbox
- Environment variable forwarding
- Desktop file and AppStream metadata
- Build script: `scripts/build-flatpak.sh`

### Files
- `flatpak/io.github.aofp.yume.yml` - Flatpak manifest
- `flatpak/io.github.aofp.yume.desktop` - Desktop entry
- `flatpak/io.github.aofp.yume.metainfo.xml` - AppStream metadata

## 43. Favorite Projects

Pin frequently used projects with keyboard hotkey bindings.

### Features
- Assign hotkeys (a-z) to favorite projects
- Quick-access from projects modal
- Persistent across sessions
- Visual indicators for favorited projects
