# PRD-07: Yurucode Feature Parity with Opcode (formerly Claudia)
## Comprehensive Implementation Guide
## ⚠️ CRITICAL: Opcode has NO embedded server - uses native Rust execution!

---

## Executive Summary

This document provides an exhaustive roadmap for achieving feature parity between yurucode and opcode (the renamed and evolved version of Claudia). After thorough analysis of both codebases, we've identified critical gaps and opportunities for improvement.

### Verification Results (Updated with Opcode Analysis)
After detailed codebase analysis of opcode v0.2.0:
- **yurucode ALREADY HAS**: ProcessRegistry (590+ lines), MCP UI, Agents UI, Hooks system, Analytics
- **opcode's architecture**: Native Rust with direct Claude CLI execution (NO embedded server!)
- **yurucode NEEDS**: Checkpoint system, Agent execution, Native CLI execution, Performance optimizations
- **Technical Debt**: 5,680 lines of embedded JavaScript server causing Windows/macOS split

### Current State
- **yurucode strengths**: MCP UI, Agent configuration, Hooks system, Analytics dashboard, Process Registry
- **yurucode gaps**: Checkpoint system, Agent execution, Native CLI spawning, Performance optimizations
- **Architectural debt**: 5,680+ lines of JavaScript embedded causing Windows/macOS split complexity

### Opcode's Superior Architecture
- **NO embedded server**: Direct Rust CLI execution via `commands/claude.rs`
- **Complete checkpoint system**: Full implementation with timeline, branching, file snapshots
- **Agent execution**: Real agent runs with monitoring, not just configuration
- **Performance**: Uses @tanstack/react-virtual, Tailwind v4, optimized rendering
- **Clean separation**: Frontend (React/TS) ↔ Backend (Rust) via Tauri commands

### Target State
- Migrate to native Rust process management (like opcode)
- Complete checkpoint/timeline system with branching
- Agent execution framework with process tracking
- Performance optimizations with virtualization
- Remove embedded server complexity

---

## Critical Discovery: Opcode's Clean Architecture

### Opcode Has SOLVED the Embedded Server Problem!
**Opcode's approach**: Direct Rust execution without any embedded JavaScript
- Uses `tokio::process::Command` to spawn Claude CLI directly
- Clean Tauri command handlers in `commands/claude.rs`
- No Socket.IO, no Node.js bridge, no embedded strings
- Cross-platform without separate Windows/macOS paths

## Priority 1: Critical Architecture Refactor

### 1.1 Adopt Opcode's Native Execution Pattern
**Problem**: yurucode has 5,680+ lines of JavaScript embedded, causing platform splits
**Solution**: Copy opcode's approach - direct Rust CLI spawning

#### Implementation Steps (Based on Opcode's Working Code):

1. **Copy Opcode's Command Structure** (`src-tauri/src/commands/claude.rs`)
```rust
// FROM OPCODE - PROVEN TO WORK:
use tokio::process::{Child, Command};
use std::process::Stdio;

pub struct ClaudeProcessState {
    pub current_process: Arc<Mutex<Option<Child>>>,
}

impl ClaudeExecutor {
    pub async fn execute(
        &mut self,
        args: Vec<String>,
        project_path: &str
    ) -> Result<(), String> {
        let mut cmd = Command::new("claude");
        cmd.args(args)
           .current_dir(project_path)
           .stdout(Stdio::piped())
           .stderr(Stdio::piped());
        
        self.process = Some(cmd.spawn()?);
        Ok(())
    }
    
    pub async fn stream_output(&mut self) -> Result<String, String> {
        // Parse stream-json output directly
    }
}
```

2. **Replace Socket.IO with Tauri Events**
```typescript
// Before: Socket.IO
socket.emit('claude-message', { sessionId, message });

// After: Tauri commands
await invoke('execute_claude', { sessionId, message });
listen('claude-output', (event) => {
    // Handle streaming output
});
```

3. **Migration Path**
- Phase 1: Create parallel native implementation
- Phase 2: Add feature flag to switch between implementations
- Phase 3: Deprecate and remove embedded server

### 1.2 Enhance Process Registry
**Current**: yurucode already has ProcessRegistry at `src-tauri/src/process/registry.rs` (590+ lines)
**Goal**: Enhance existing implementation with better monitoring and agent execution support

#### Enhancement:

1. **Enhance Existing Registry** (`src-tauri/src/process/registry.rs`)
```rust
// Current implementation already has:
// - Process tracking with PID management
// - Cleanup on drop
// - Output capture
// - Kill functionality

// Add new capabilities:
pub struct EnhancedProcessHandle {
    // Existing fields...
    pub process_type: ProcessType, // Add: Regular | Agent | Checkpoint
    pub metrics: ProcessMetrics,    // Add: Token usage, duration
    pub output_buffer: Vec<String>, // Add: Buffered output
}

pub enum ProcessType {
    Regular(SessionInfo),
    Agent(AgentRunInfo),
    Checkpoint(CheckpointInfo),
}

impl ProcessRegistry {
    // Enhance existing methods with:
    pub async fn get_metrics(&self, id: i64) -> Option<ProcessMetrics> {
        // Return real-time metrics
    }
    
    pub async fn get_agent_runs(&self) -> Vec<AgentRunInfo> {
        // Filter for agent processes
    }
    
    pub async fn monitor_health(&self) {
        // Health checks for all processes
    }
}
```

2. **Integration with Tauri Commands**
```rust
#[tauri::command]
pub async fn list_processes(state: State<'_, ProcessRegistry>) -> Vec<ProcessInfo> {
    state.get_all_processes().await
}

#[tauri::command]
pub async fn kill_process(
    state: State<'_, ProcessRegistry>,
    process_id: i64
) -> Result<(), String> {
    state.kill(process_id).await
}
```

---

## Priority 2: Checkpoint & Timeline System

### 2.1 Checkpoint Storage Architecture
**Goal**: Enable session branching and time-travel debugging

#### Implementation:

1. **Core Data Structures** (`src-tauri/src/checkpoint/mod.rs`)
```rust
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct Checkpoint {
    pub id: String,
    pub session_id: String,
    pub parent_id: Option<String>,
    pub created_at: DateTime<Utc>,
    pub message_count: usize,
    pub metadata: CheckpointMetadata,
    pub file_snapshots: HashMap<PathBuf, FileSnapshot>,
}

#[derive(Serialize, Deserialize)]
pub struct FileSnapshot {
    pub path: PathBuf,
    pub content_hash: String,
    pub content: Vec<u8>, // Compressed with zstd
    pub modified_at: SystemTime,
}

#[derive(Serialize, Deserialize)]
pub struct SessionTimeline {
    pub root_checkpoint: String,
    pub current_checkpoint: String,
    pub checkpoints: HashMap<String, Checkpoint>,
    pub branches: Vec<TimelineBranch>,
}
```

2. **Checkpoint Manager** (`src-tauri/src/checkpoint/manager.rs`)
```rust
pub struct CheckpointManager {
    storage_path: PathBuf,
    compression_level: i32,
    file_tracker: Arc<RwLock<FileTracker>>,
}

impl CheckpointManager {
    pub async fn create_checkpoint(
        &self,
        session_id: &str,
        trigger: CheckpointTrigger
    ) -> Result<String, String> {
        // 1. Capture current session state
        let messages = self.get_session_messages(session_id).await?;
        
        // 2. Track modified files
        let file_snapshots = self.capture_file_snapshots().await?;
        
        // 3. Compress and store
        let checkpoint = Checkpoint {
            id: Uuid::new_v4().to_string(),
            session_id: session_id.to_string(),
            parent_id: self.get_current_checkpoint(session_id),
            created_at: Utc::now(),
            message_count: messages.len(),
            metadata: CheckpointMetadata {
                trigger,
                tokens_used: self.get_token_count(session_id),
                model: self.get_model(session_id),
            },
            file_snapshots,
        };
        
        // 4. Save to disk with compression
        self.save_checkpoint(&checkpoint).await?;
        
        Ok(checkpoint.id)
    }
    
    pub async fn restore_checkpoint(
        &self,
        checkpoint_id: &str
    ) -> Result<(), String> {
        // 1. Load checkpoint
        let checkpoint = self.load_checkpoint(checkpoint_id).await?;
        
        // 2. Restore file states
        for (path, snapshot) in checkpoint.file_snapshots {
            self.restore_file(&path, &snapshot).await?;
        }
        
        // 3. Update session state
        self.update_session_to_checkpoint(&checkpoint).await?;
        
        Ok(())
    }
    
    pub async fn fork_from_checkpoint(
        &self,
        checkpoint_id: &str
    ) -> Result<String, String> {
        // Create new session branch from checkpoint
        let checkpoint = self.load_checkpoint(checkpoint_id).await?;
        let new_session_id = Uuid::new_v4().to_string();
        
        // Clone session state
        self.clone_session(&checkpoint.session_id, &new_session_id).await?;
        
        // Create new branch in timeline
        self.create_branch(&checkpoint, &new_session_id).await?;
        
        Ok(new_session_id)
    }
}
```

3. **File Tracking System** (`src-tauri/src/checkpoint/file_tracker.rs`)
```rust
pub struct FileTracker {
    tracked_files: HashMap<PathBuf, FileState>,
    watch_patterns: Vec<String>,
    ignore_patterns: Vec<String>,
}

impl FileTracker {
    pub async fn track_changes(&mut self) -> Vec<FileChange> {
        let mut changes = Vec::new();
        
        for (path, state) in &self.tracked_files {
            if let Ok(metadata) = fs::metadata(path).await {
                if metadata.modified()? != state.last_modified {
                    changes.push(FileChange {
                        path: path.clone(),
                        change_type: ChangeType::Modified,
                        old_hash: state.content_hash.clone(),
                        new_hash: self.hash_file(path).await?,
                    });
                }
            }
        }
        
        changes
    }
}
```

### 2.2 Timeline UI Component
**Goal**: Visual navigation of checkpoint history

#### Implementation:

1. **Timeline Component** (`src/renderer/components/Timeline/Timeline.tsx`)
```typescript
interface TimelineProps {
    sessionId: string;
    checkpoints: Checkpoint[];
    currentCheckpoint: string;
    onRestore: (checkpointId: string) => void;
    onFork: (checkpointId: string) => void;
}

export const Timeline: React.FC<TimelineProps> = ({
    sessionId,
    checkpoints,
    currentCheckpoint,
    onRestore,
    onFork
}) => {
    const [selectedCheckpoint, setSelectedCheckpoint] = useState<string | null>(null);
    const [showDiff, setShowDiff] = useState(false);
    
    // Build tree structure from checkpoints
    const tree = useMemo(() => buildCheckpointTree(checkpoints), [checkpoints]);
    
    return (
        <div className="timeline-container">
            <div className="timeline-header">
                <h3>Session Timeline</h3>
                <div className="timeline-controls">
                    <button onClick={() => createCheckpoint('manual')}>
                        <IconCamera /> Checkpoint
                    </button>
                    <select onChange={(e) => setCheckpointStrategy(e.target.value)}>
                        <option value="manual">Manual</option>
                        <option value="per_prompt">Per Prompt</option>
                        <option value="per_tool">Per Tool Use</option>
                        <option value="smart">Smart</option>
                    </select>
                </div>
            </div>
            
            <div className="timeline-tree">
                {renderTree(tree, {
                    onSelect: setSelectedCheckpoint,
                    onRestore,
                    onFork,
                    currentCheckpoint
                })}
            </div>
            
            {selectedCheckpoint && (
                <CheckpointDetails
                    checkpoint={getCheckpoint(selectedCheckpoint)}
                    onRestore={() => onRestore(selectedCheckpoint)}
                    onFork={() => onFork(selectedCheckpoint)}
                    showDiff={showDiff}
                />
            )}
        </div>
    );
};
```

2. **Checkpoint Service** (`src/renderer/services/checkpointService.ts`)
```typescript
class CheckpointService {
    async createCheckpoint(
        sessionId: string,
        trigger: 'manual' | 'auto' | 'tool_use'
    ): Promise<string> {
        return await invoke('create_checkpoint', { sessionId, trigger });
    }
    
    async restoreCheckpoint(checkpointId: string): Promise<void> {
        await invoke('restore_checkpoint', { checkpointId });
        // Refresh UI state
        await this.refreshSession();
    }
    
    async forkFromCheckpoint(checkpointId: string): Promise<string> {
        const newSessionId = await invoke('fork_checkpoint', { checkpointId });
        // Switch to new session
        await this.switchToSession(newSessionId);
        return newSessionId;
    }
    
    async getTimeline(sessionId: string): Promise<Timeline> {
        return await invoke('get_timeline', { sessionId });
    }
    
    async getDiff(
        checkpointId1: string,
        checkpointId2: string
    ): Promise<CheckpointDiff> {
        return await invoke('get_checkpoint_diff', { 
            checkpoint1: checkpointId1,
            checkpoint2: checkpointId2
        });
    }
}
```

---

## Priority 3: Agent Execution Framework

### 3.1 Agent Runner Implementation
**Current**: Agents are just templates  
**Target**: Full agent execution with monitoring

#### Implementation:

1. **Agent Executor** (`src-tauri/src/agents/executor.rs`)
```rust
pub struct AgentExecutor {
    registry: Arc<ProcessRegistry>,
    storage: Arc<AgentStorage>,
}

impl AgentExecutor {
    pub async fn execute_agent(
        &self,
        agent_id: &str,
        project_path: &str,
        initial_prompt: &str
    ) -> Result<AgentRun, String> {
        // 1. Load agent configuration
        let agent = self.storage.get_agent(agent_id).await?;
        
        // 2. Prepare execution environment
        let run_id = Uuid::new_v4().to_string();
        let run = AgentRun {
            id: run_id.clone(),
            agent_id: agent_id.to_string(),
            project_path: project_path.to_string(),
            started_at: Utc::now(),
            status: RunStatus::Running,
            metrics: RunMetrics::default(),
        };
        
        // 3. Spawn Claude with agent's system prompt
        let args = vec![
            "--system".to_string(),
            agent.system_prompt,
            "--model".to_string(),
            agent.model.to_string(),
            "-p".to_string(),
            initial_prompt.to_string(),
        ];
        
        let process = ClaudeExecutor::new();
        process.execute(args, project_path).await?;
        
        // 4. Register process
        let handle = ProcessHandle {
            id: self.registry.next_id().await,
            session_id: run_id.clone(),
            pid: process.pid(),
            started_at: Utc::now(),
            project_path: project_path.to_string(),
            model: agent.model.to_string(),
            child: process,
        };
        
        self.registry.register(handle).await;
        
        // 5. Start monitoring
        self.monitor_agent_run(run_id).await;
        
        Ok(run)
    }
    
    async fn monitor_agent_run(&self, run_id: String) {
        tokio::spawn(async move {
            loop {
                // Update metrics
                // Check completion
                // Handle errors
                tokio::time::sleep(Duration::from_secs(1)).await;
            }
        });
    }
}
```

2. **Agent Execution UI** (`src/renderer/components/AgentExecution/AgentExecution.tsx`)
```typescript
interface AgentExecutionProps {
    agent: Agent;
    onClose: () => void;
}

export const AgentExecution: React.FC<AgentExecutionProps> = ({ agent, onClose }) => {
    const [projectPath, setProjectPath] = useState('');
    const [initialPrompt, setInitialPrompt] = useState('');
    const [isRunning, setIsRunning] = useState(false);
    const [run, setRun] = useState<AgentRun | null>(null);
    const [output, setOutput] = useState<string[]>([]);
    const [metrics, setMetrics] = useState<RunMetrics | null>(null);
    
    const startExecution = async () => {
        setIsRunning(true);
        
        try {
            // Start agent execution
            const runId = await invoke('execute_agent', {
                agentId: agent.id,
                projectPath,
                initialPrompt
            });
            
            // Subscribe to updates
            const unlisten = await listen(`agent-run-${runId}`, (event) => {
                const update = event.payload as AgentUpdate;
                
                switch (update.type) {
                    case 'output':
                        setOutput(prev => [...prev, update.data]);
                        break;
                    case 'metrics':
                        setMetrics(update.metrics);
                        break;
                    case 'completed':
                        setIsRunning(false);
                        break;
                    case 'error':
                        handleError(update.error);
                        setIsRunning(false);
                        break;
                }
            });
            
            setRun({ id: runId, agentId: agent.id, status: 'running' });
        } catch (error) {
            console.error('Failed to start agent:', error);
            setIsRunning(false);
        }
    };
    
    return (
        <div className="agent-execution">
            <div className="execution-header">
                <h2>Execute Agent: {agent.name}</h2>
                <button onClick={onClose}>×</button>
            </div>
            
            {!isRunning && !run && (
                <div className="execution-setup">
                    <div className="form-group">
                        <label>Project Directory</label>
                        <div className="path-input">
                            <input
                                type="text"
                                value={projectPath}
                                onChange={(e) => setProjectPath(e.target.value)}
                                placeholder="/path/to/project"
                            />
                            <button onClick={selectDirectory}>Browse</button>
                        </div>
                    </div>
                    
                    <div className="form-group">
                        <label>Initial Prompt</label>
                        <textarea
                            value={initialPrompt}
                            onChange={(e) => setInitialPrompt(e.target.value)}
                            placeholder="What should the agent do?"
                            rows={4}
                        />
                    </div>
                    
                    <button 
                        className="start-button"
                        onClick={startExecution}
                        disabled={!projectPath || !initialPrompt}
                    >
                        <IconRocket /> Start Agent
                    </button>
                </div>
            )}
            
            {isRunning && (
                <div className="execution-monitor">
                    <div className="status-bar">
                        <span className="status-indicator running">Running</span>
                        <span className="runtime">
                            {formatDuration(run?.startedAt)}
                        </span>
                    </div>
                    
                    {metrics && (
                        <div className="metrics-panel">
                            <div className="metric">
                                <label>Tokens Used</label>
                                <value>{metrics.tokensUsed}</value>
                            </div>
                            <div className="metric">
                                <label>Tools Called</label>
                                <value>{metrics.toolsCalled}</value>
                            </div>
                            <div className="metric">
                                <label>Files Modified</label>
                                <value>{metrics.filesModified}</value>
                            </div>
                        </div>
                    )}
                    
                    <div className="output-panel">
                        <h3>Output</h3>
                        <div className="output-scroll">
                            {output.map((line, i) => (
                                <div key={i} className="output-line">
                                    {line}
                                </div>
                            ))}
                        </div>
                    </div>
                    
                    <div className="execution-controls">
                        <button onClick={pauseExecution}>
                            <IconPlayerPause /> Pause
                        </button>
                        <button onClick={stopExecution} className="stop-button">
                            <IconX /> Stop
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
```

---

## Priority 4: Performance Optimizations

### 4.1 Message Virtualization
**Problem**: Rendering 1000+ messages causes lag

#### Implementation:

1. **Install Dependencies**
```bash
npm install @tanstack/react-virtual
```

2. **Virtualized Message List** (`src/renderer/components/Chat/VirtualizedMessages.tsx`)
```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

interface VirtualizedMessagesProps {
    messages: Message[];
    sessionId: string;
}

export const VirtualizedMessages: React.FC<VirtualizedMessagesProps> = ({
    messages,
    sessionId
}) => {
    const parentRef = useRef<HTMLDivElement>(null);
    const [autoScroll, setAutoScroll] = useState(true);
    
    const virtualizer = useVirtualizer({
        count: messages.length,
        getScrollElement: () => parentRef.current,
        estimateSize: useCallback((index) => {
            // Estimate based on message type
            const msg = messages[index];
            if (msg.type === 'tool_use') return 150;
            if (msg.content?.length > 1000) return 400;
            return 100;
        }, [messages]),
        overscan: 5,
        getItemKey: useCallback((index) => messages[index].id, [messages]),
    });
    
    // Auto-scroll to bottom on new messages
    useEffect(() => {
        if (autoScroll && messages.length > 0) {
            virtualizer.scrollToIndex(messages.length - 1, {
                behavior: 'smooth',
                align: 'end',
            });
        }
    }, [messages.length, autoScroll]);
    
    // Detect manual scroll
    const handleScroll = () => {
        if (!parentRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = parentRef.current;
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
        setAutoScroll(isAtBottom);
    };
    
    return (
        <div 
            ref={parentRef} 
            className="messages-container"
            onScroll={handleScroll}
        >
            <div
                style={{
                    height: `${virtualizer.getTotalSize()}px`,
                    width: '100%',
                    position: 'relative',
                }}
            >
                {virtualizer.getVirtualItems().map((virtualItem) => {
                    const message = messages[virtualItem.index];
                    return (
                        <div
                            key={virtualItem.key}
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: `${virtualItem.size}px`,
                                transform: `translateY(${virtualItem.start}px)`,
                            }}
                        >
                            <MessageRenderer
                                message={message}
                                sessionId={sessionId}
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
```

### 4.2 State Management Optimization
**Problem**: Single store causes unnecessary re-renders

#### Implementation:

1. **Split Stores** (`src/renderer/stores/`)
```typescript
// sessionStore.ts - Session-specific data
export const useSessionStore = create(
    subscribeWithSelector(
        persist(
            (set, get) => ({
                sessions: new Map<string, Session>(),
                currentSessionId: null,
                
                // Granular updates
                updateMessage: (sessionId: string, messageId: string, update: Partial<Message>) => {
                    set(state => {
                        const session = state.sessions.get(sessionId);
                        if (!session) return state;
                        
                        const messageIndex = session.messages.findIndex(m => m.id === messageId);
                        if (messageIndex === -1) return state;
                        
                        const newMessages = [...session.messages];
                        newMessages[messageIndex] = {
                            ...newMessages[messageIndex],
                            ...update
                        };
                        
                        const newSession = { ...session, messages: newMessages };
                        const newSessions = new Map(state.sessions);
                        newSessions.set(sessionId, newSession);
                        
                        return { sessions: newSessions };
                    });
                },
            }),
            {
                name: 'session-store',
                partialize: (state) => ({
                    sessions: Array.from(state.sessions.entries()),
                    currentSessionId: state.currentSessionId,
                }),
            }
        )
    )
);

// uiStore.ts - UI-only state (not persisted)
export const useUIStore = create((set, get) => ({
    selectedTab: 0,
    sidebarOpen: true,
    searchQuery: '',
    activeModals: new Set<string>(),
    
    toggleModal: (modalId: string) => {
        set(state => {
            const newModals = new Set(state.activeModals);
            if (newModals.has(modalId)) {
                newModals.delete(modalId);
            } else {
                newModals.add(modalId);
            }
            return { activeModals: newModals };
        });
    },
}));

// analyticsStore.ts - Analytics data
export const useAnalyticsStore = create(
    persist(
        (set, get) => ({
            tokenUsage: new Map<string, TokenUsage>(),
            dailyStats: [],
            
            addTokenUsage: (sessionId: string, usage: TokenUsage) => {
                set(state => {
                    const current = state.tokenUsage.get(sessionId) || {
                        input: 0,
                        output: 0,
                        cache_creation: 0,
                        cache_read: 0,
                    };
                    
                    const updated = {
                        input: current.input + usage.input,
                        output: current.output + usage.output,
                        cache_creation: current.cache_creation + usage.cache_creation,
                        cache_read: current.cache_read + usage.cache_read,
                    };
                    
                    const newUsage = new Map(state.tokenUsage);
                    newUsage.set(sessionId, updated);
                    
                    return { tokenUsage: newUsage };
                });
            },
        }),
        {
            name: 'analytics-store',
        }
    )
);
```

2. **Selective Subscriptions**
```typescript
// Only re-render when specific data changes
const messages = useSessionStore(
    useCallback(state => state.sessions.get(sessionId)?.messages || [], [sessionId])
);

const currentSession = useSessionStore(
    state => state.sessions.get(state.currentSessionId),
    shallow // Use shallow equality check
);
```

### 4.3 Compression & Storage
**Goal**: Reduce storage size and improve load times

#### Implementation:

1. **Compression Module** (`src-tauri/src/compression/mod.rs`)
```rust
use zstd::stream::{encode_all, decode_all};

pub struct CompressionService {
    level: i32, // 1-22, default 3
}

impl CompressionService {
    pub fn compress(&self, data: &[u8]) -> Result<Vec<u8>, String> {
        encode_all(data, self.level)
            .map_err(|e| format!("Compression failed: {}", e))
    }
    
    pub fn decompress(&self, data: &[u8]) -> Result<Vec<u8>, String> {
        decode_all(data)
            .map_err(|e| format!("Decompression failed: {}", e))
    }
    
    pub async fn compress_file(&self, path: &Path) -> Result<Vec<u8>, String> {
        let content = tokio::fs::read(path).await?;
        self.compress(&content)
    }
}
```

2. **SQLite Storage** (`src-tauri/src/storage/sqlite.rs`)
```rust
use sqlx::{SqlitePool, migrate::MigrateDatabase};

pub struct SqliteStorage {
    pool: SqlitePool,
}

impl SqliteStorage {
    pub async fn new(db_path: &str) -> Result<Self, String> {
        if !Sqlite::database_exists(db_path).await? {
            Sqlite::create_database(db_path).await?;
        }
        
        let pool = SqlitePool::connect(db_path).await?;
        
        // Run migrations
        sqlx::migrate!("./migrations")
            .run(&pool)
            .await?;
        
        Ok(Self { pool })
    }
    
    pub async fn save_session(&self, session: &Session) -> Result<(), String> {
        let compressed = self.compress_session(session)?;
        
        sqlx::query!(
            "INSERT OR REPLACE INTO sessions (id, data, updated_at) VALUES (?, ?, ?)",
            session.id,
            compressed,
            Utc::now()
        )
        .execute(&self.pool)
        .await?;
        
        Ok(())
    }
    
    pub async fn load_session(&self, id: &str) -> Result<Session, String> {
        let row = sqlx::query!(
            "SELECT data FROM sessions WHERE id = ?",
            id
        )
        .fetch_one(&self.pool)
        .await?;
        
        self.decompress_session(&row.data)
    }
}
```

---

## Priority 5: Enhanced Error Recovery

### 5.1 Retry Mechanism
**Goal**: Automatic recovery from transient failures

#### Implementation:

1. **Retry Service** (`src-tauri/src/retry/mod.rs`)
```rust
use backoff::{ExponentialBackoff, future::retry};

pub struct RetryService {
    max_retries: u32,
    base_delay_ms: u64,
}

impl RetryService {
    pub async fn execute_with_retry<F, T, E>(
        &self,
        operation: F,
    ) -> Result<T, E>
    where
        F: Fn() -> Future<Output = Result<T, E>>,
        E: std::fmt::Debug,
    {
        let backoff = ExponentialBackoff {
            initial_interval: Duration::from_millis(self.base_delay_ms),
            max_interval: Duration::from_secs(30),
            max_elapsed_time: Some(Duration::from_secs(300)),
            ..Default::default()
        };
        
        retry(backoff, || async {
            match operation().await {
                Ok(result) => Ok(result),
                Err(e) if self.is_retryable(&e) => {
                    log::warn!("Retryable error: {:?}", e);
                    Err(backoff::Error::transient(e))
                }
                Err(e) => {
                    log::error!("Non-retryable error: {:?}", e);
                    Err(backoff::Error::permanent(e))
                }
            }
        }).await
    }
    
    fn is_retryable<E>(&self, error: &E) -> bool {
        // Check if error is retryable
        // Network errors, timeouts, rate limits, etc.
        true
    }
}
```

### 5.2 Session Recovery
**Goal**: Graceful recovery from session failures

#### Implementation:

```typescript
class SessionRecoveryService {
    private retryAttempts = new Map<string, number>();
    private maxRetries = 3;
    
    async recoverSession(sessionId: string, error: Error): Promise<boolean> {
        const attempts = this.retryAttempts.get(sessionId) || 0;
        
        if (attempts >= this.maxRetries) {
            // Max retries reached, offer manual recovery
            return this.offerManualRecovery(sessionId, error);
        }
        
        this.retryAttempts.set(sessionId, attempts + 1);
        
        try {
            // Attempt automatic recovery based on error type
            if (error.message.includes('Session not found')) {
                return await this.recreateSession(sessionId);
            } else if (error.message.includes('Network')) {
                await this.delay(Math.pow(2, attempts) * 1000);
                return await this.retryConnection(sessionId);
            } else if (error.message.includes('Token limit')) {
                return await this.handleTokenLimit(sessionId);
            }
            
            return false;
        } catch (recoveryError) {
            console.error('Recovery failed:', recoveryError);
            return false;
        }
    }
    
    private async recreateSession(sessionId: string): Promise<boolean> {
        // Get session history
        const history = await this.getSessionHistory(sessionId);
        
        // Create new session with history
        const newSessionId = await invoke('create_session_with_history', {
            history: history.slice(-10), // Last 10 messages for context
        });
        
        // Update session mapping
        await this.updateSessionMapping(sessionId, newSessionId);
        
        return true;
    }
    
    private async handleTokenLimit(sessionId: string): Promise<boolean> {
        // Auto-compact if possible
        const canCompact = await invoke('can_compact_session', { sessionId });
        
        if (canCompact) {
            await invoke('compact_session', { sessionId });
            return true;
        }
        
        // Offer checkpoint and restart
        const checkpoint = await invoke('create_checkpoint', {
            sessionId,
            trigger: 'token_limit'
        });
        
        // Start fresh session from checkpoint
        const newSessionId = await invoke('fork_checkpoint', {
            checkpointId: checkpoint
        });
        
        return true;
    }
}
```

---

## Priority 6: Advanced Hooks System

### 6.1 Pattern-Based Hooks
**Current**: Simple event-based hooks  
**Target**: Sophisticated pattern matching

#### Implementation:

```typescript
interface AdvancedHook {
    id: string;
    name: string;
    patterns: HookPattern[];
    actions: HookAction[];
    scope: 'global' | 'project' | 'session';
    priority: number;
}

interface HookPattern {
    type: 'tool' | 'message' | 'error' | 'token';
    matcher: string; // Regex or glob pattern
    conditions?: HookCondition[];
}

interface HookCondition {
    field: string;
    operator: 'eq' | 'ne' | 'gt' | 'lt' | 'contains' | 'matches';
    value: any;
}

interface HookAction {
    type: 'block' | 'modify' | 'notify' | 'execute' | 'checkpoint';
    config: any;
}

class AdvancedHooksService {
    private hooks: Map<string, AdvancedHook> = new Map();
    
    async evaluateHooks(event: HookEvent): Promise<HookResult> {
        const matchingHooks = this.findMatchingHooks(event);
        
        // Sort by priority
        matchingHooks.sort((a, b) => b.priority - a.priority);
        
        let result: HookResult = { continue: true };
        
        for (const hook of matchingHooks) {
            const hookResult = await this.executeHook(hook, event);
            
            if (hookResult.block) {
                result.continue = false;
                result.reason = hookResult.reason;
                break;
            }
            
            if (hookResult.modify) {
                event = { ...event, ...hookResult.modifications };
            }
        }
        
        return result;
    }
    
    private findMatchingHooks(event: HookEvent): AdvancedHook[] {
        const matching: AdvancedHook[] = [];
        
        for (const hook of this.hooks.values()) {
            for (const pattern of hook.patterns) {
                if (this.matchesPattern(event, pattern)) {
                    matching.push(hook);
                    break;
                }
            }
        }
        
        return matching;
    }
    
    private matchesPattern(event: HookEvent, pattern: HookPattern): boolean {
        // Check type
        if (pattern.type !== event.type) return false;
        
        // Check regex/glob matcher
        const regex = new RegExp(pattern.matcher);
        if (!regex.test(event.data)) return false;
        
        // Check conditions
        if (pattern.conditions) {
            for (const condition of pattern.conditions) {
                if (!this.evaluateCondition(event, condition)) {
                    return false;
                }
            }
        }
        
        return true;
    }
}
```

---

## Implementation Timeline

### Week 1-2: Architecture Refactor
- [ ] Remove embedded Node.js server
- [ ] Implement native Rust CLI execution
- [ ] Create ProcessRegistry
- [ ] Replace Socket.IO with Tauri events

### Week 3-4: Checkpoint System
- [ ] Implement checkpoint storage
- [ ] Create file tracking system
- [ ] Build timeline data structures
- [ ] Add checkpoint UI components

### Week 5-6: Agent Execution
- [ ] Create agent executor
- [ ] Build execution monitoring
- [ ] Add agent run UI
- [ ] Implement metrics tracking

### Week 7-8: Performance
- [ ] Add message virtualization
- [ ] Split state stores
- [ ] Implement compression
- [ ] Add SQLite storage

### Week 9-10: Error Recovery
- [ ] Implement retry service
- [ ] Add session recovery
- [ ] Create recovery UI
- [ ] Add error reporting

### Week 11-12: Polish
- [ ] Advanced hooks system
- [ ] Testing and debugging
- [ ] Documentation
- [ ] Performance profiling

---

## Success Metrics

1. **Performance**
   - Message rendering: <50ms for 1000 messages
   - Session switch: <100ms
   - Memory usage: <100MB for large sessions

2. **Reliability**
   - Session resume success: >95%
   - Automatic error recovery: >80%
   - Zero orphaned processes

3. **Features**
   - Full checkpoint system with branching
   - Agent execution with monitoring
   - Advanced hooks with patterns

4. **User Experience**
   - Smooth scrolling at 60fps
   - Instant checkpoint restore
   - Clear error messages with recovery options

---

## Migration Strategy

### Phase 1: Parallel Implementation
1. Create feature flags for new architecture
2. Implement new features alongside existing
3. Allow users to opt-in to new features

### Phase 2: Gradual Migration
1. Make new architecture default for new users
2. Provide migration tool for existing users
3. Maintain backwards compatibility

### Phase 3: Deprecation
1. Remove old embedded server code
2. Clean up legacy implementations
3. Full migration to new architecture

---

## Risk Mitigation

1. **Breaking Changes**
   - Maintain backwards compatibility during migration
   - Provide clear migration guides
   - Offer rollback options

2. **Performance Regression**
   - Profile before and after each change
   - Set up performance benchmarks
   - Monitor production metrics

3. **Data Loss**
   - Implement comprehensive backup system
   - Test recovery procedures
   - Provide export/import tools

---

## Conclusion

This roadmap transforms yurucode from a functional Claude UI into a production-grade development environment. By implementing these features, yurucode will:

1. Match Claudia's advanced features
2. Exceed performance benchmarks
3. Provide superior reliability
4. Offer unique advantages (MCP UI, better analytics)

The key is systematic implementation with careful testing at each phase. Focus on architecture refactor first, then build features on solid foundation.

---

## Why We MUST Remove the Embedded Server

### The Problem with yurucode's Current Approach:
1. **Platform Complexity**: Separate code paths for Windows (WSL) vs macOS
2. **Maintenance Nightmare**: 5,680 lines of JS as a string literal
3. **Debugging Hell**: Can't debug JavaScript inside Rust string
4. **Performance Overhead**: Extra Node.js process layer
5. **Error Propagation**: Errors must pass through 3 layers

### Opcode's Solution (What We Should Copy):
1. **Direct Execution**: Rust spawns Claude CLI directly
2. **Clean Architecture**: Proper Tauri commands
3. **Platform Unity**: Same code for all platforms
4. **Maintainable**: Real TypeScript/Rust files
5. **Performant**: No intermediate processes

---

## Features Opcode Has That Yurucode Needs

### 1. Complete Checkpoint System
```rust
// Opcode has full implementation:
- checkpoint/manager.rs - Complete checkpoint management
- checkpoint/storage.rs - Persistent storage with compression
- checkpoint/state.rs - State tracking
- TimelineNavigator.tsx - Visual UI component
```

### 2. Agent Execution (Not Just Config)
```rust
// Opcode's agent execution:
- commands/agents.rs - Full agent run system
- AgentExecution.tsx - Execution UI
- AgentRunView.tsx - Monitoring UI
- Background agent runs with process isolation
```

### 3. Native CLI Execution
```rust
// Opcode's clean approach:
- No embedded server
- Direct tokio::process::Command
- Clean error handling
- Platform-agnostic
```

### 4. Performance Optimizations
```json
// Opcode's dependencies:
"@tanstack/react-virtual": "^3.13.10" // Virtualization
"tailwindcss": "^4.1.8" // Latest Tailwind
"framer-motion": "^12.0.0" // Smooth animations
```

---

## Prioritized Feature List (What to Build)

### 🔴 Critical (Must Have - Based on Opcode)
1. **Migrate to Native Rust Execution** - Copy opcode's `commands/claude.rs` pattern
2. **Checkpoint System** - Port opcode's checkpoint module entirely
3. **Timeline Navigator** - Copy opcode's TimelineNavigator component
4. **Agent Execution** - Port opcode's agent run system
5. **Message Virtualization** - Use @tanstack/react-virtual like opcode

### 🟡 Important (Should Have)
6. **Timeline UI** - Visual checkpoint navigation
7. **Performance Optimizations** - SQLite storage, compression
8. **Enhanced Error Recovery** - Automatic retry and session recovery
9. **Advanced Hooks** - Pattern matching and conditions
10. **Token Analytics** - Cache token tracking and cost calculation

### 🟢 Nice to Have (Could Have)
11. **GitHub Agent Import** - Community agent marketplace
12. **Session Export/Import** - Share conversations
13. **Multi-model Support** - Switch models mid-conversation
14. **Collaboration Features** - Shared sessions
15. **Advanced Search** - Full-text search across sessions

### ✅ Already Implemented (Don't Need)
- ProcessRegistry (590+ lines already in yurucode)
- MCP UI (full implementation)
- Agents UI (configuration system)
- Hooks System (event-based)
- Analytics Dashboard (token tracking)
- System Prompts (configurable)

---

## SAFER APPROACH: Add Features WITHOUT Breaking Current Architecture

### The Reality Check
- **Removing the embedded server is RISKY** - It works now, breaking it could be catastrophic
- **Windows/macOS split exists for a reason** - WSL complexity, path handling, etc.
- **Current approach is battle-tested** - Users rely on it working

### Safe Feature Additions (Without Architecture Change)

#### 1. Port Opcode's Checkpoint System (Keep Current Server)
```typescript
// Add checkpoint commands to embedded server
socket.on('create-checkpoint', async (data) => {
  // Save current session state
  // Track file modifications
  // Create timeline entry
});
```

#### 2. Add Agent Execution (Through Current Bridge)
```javascript
// Extend embedded server with agent runs
function executeAgent(agentId, projectPath, prompt) {
  // Use existing Claude spawning mechanism
  // Track as agent run vs regular session
}
```

#### 3. Add Virtualization (Frontend Only)
```bash
npm install @tanstack/react-virtual
# Update MessageRenderer with virtualization
# No backend changes needed
```

#### 4. Timeline UI (Frontend Component)
- Copy opcode's TimelineNavigator.tsx
- Adapt to yurucode's store structure
- Use existing session management

### Gradual Migration Strategy

**Phase 1: Feature Parity (Safe)**
- Add checkpoints through embedded server
- Add agent execution through existing bridge
- Add virtualization to frontend
- Add timeline UI component

**Phase 2: Parallel Implementation (Testing)**
- Create new Rust commands alongside embedded server
- Feature flag to switch between implementations
- Test with small group of users

**Phase 3: Migration (When Stable)**
- Gradually move users to native implementation
- Keep embedded server as fallback
- Remove only when 100% stable

## Quick Wins (Can Do Today Without Risk)

1. **Add Message Virtualization** - Frontend only, no backend changes
2. **Basic Checkpoint Saving** - Add to embedded server
3. **Timeline UI Component** - Copy from opcode, adapt to yurucode
4. **Agent Run Tracking** - Extend current ProcessRegistry
5. **Performance Monitoring** - Add metrics to existing code