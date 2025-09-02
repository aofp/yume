# Implementation Plan: Advanced Claude Flow Management

## Overview
Systematic implementation of advanced Claude flow features from PRD-05, maintaining yurucode's minimal aesthetic while adding powerful session control.

## Priority Order
1. **Critical**: Smart compaction control (96% auto-trigger)
2. **High**: Task persistence system
3. **Medium**: Context manifests
4. **Low**: Subagent patterns

## Phase 1: Smart Compaction Control (Day 1-2)

### 1.1 Backend Implementation
```
src-tauri/src/compaction/mod.rs
- CompactionManager struct
- Threshold configuration (96% auto, 98% force)
- Hook integration for auto-trigger
- Context usage tracking
```

### 1.2 Hook Enhancement
```
src/renderer/services/hooksService.ts
- Add compaction_trigger event
- Auto-trigger at 96%
- Force trigger at 98%
- Context preservation hook
```

### 1.3 UI Updates
```
src/renderer/components/Chat/ClaudeChat.tsx
- Context usage indicator
- Compaction warning notification
- Auto-compact at 96%
- Status bar integration
```

### 1.4 Store Integration
```
src/renderer/stores/claudeCodeStore.ts
- Track compaction state
- Monitor context percentage
- Auto-trigger at 96%
- Force at 98% if needed
```

## Phase 2: Task Persistence System (Day 3-5)

### 2.1 Database Schema
```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  branch TEXT,
  priority TEXT CHECK(priority IN ('high','medium','low','investigate')),
  status TEXT CHECK(status IN ('active','paused','completed')),
  manifest_json TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

CREATE TABLE task_messages (
  id TEXT PRIMARY KEY,
  task_id TEXT REFERENCES tasks(id),
  message_json TEXT,
  timestamp TIMESTAMP
);

CREATE TABLE task_decisions (
  id TEXT PRIMARY KEY,
  task_id TEXT REFERENCES tasks(id),
  decision TEXT,
  rationale TEXT,
  timestamp TIMESTAMP
);
```

### 2.2 Rust Commands
```
src-tauri/src/commands/tasks.rs
- create_task(title, priority)
- switch_task(task_id)
- complete_task(task_id)
- get_task_manifest(task_id)
- save_task_state(task_id, state)
```

### 2.3 Frontend Service
```
src/renderer/services/taskService.ts
- Task CRUD operations
- Manifest generation
- State serialization
- Auto-save logic
```

### 2.4 UI Components
```
src/renderer/components/TaskSwitcher/
- TaskSwitcher.tsx (Cmd+K style)
- TaskStatusBar.tsx
- TaskList.tsx
```

## Phase 3: Context Manifests (Day 6-7)

### 3.1 Manifest Generator
```
src/renderer/services/manifestService.ts
- Analyze current context
- Extract key files/functions
- Identify dependencies
- Generate JSON manifest
```

### 3.2 Manifest Structure
```typescript
{
  version: "1.0",
  task_id: "auth-refactor-123",
  timestamp: 1234567890,
  context: {
    files: ["src/auth.ts", "src/user.ts"],
    functions: ["authenticate", "validateToken"],
    dependencies: ["bcrypt", "jsonwebtoken"],
    decisions: [
      {
        decision: "Use JWT for auth",
        rationale: "Stateless, scalable"
      }
    ]
  },
  scope: "Refactor authentication to use JWT tokens",
  entry_points: ["src/auth.ts:authenticate"],
  test_files: ["src/auth.test.ts"]
}
```

### 3.3 Storage
```
~/.yurucode/tasks/{task-id}/
  manifest.json
  messages.json
  state.json
  decisions.log
```

## Phase 4: Session State Preservation (Day 8-9)

### 4.1 State Capture
```
src/renderer/services/stateService.ts
- Capture active files
- Save cursor positions
- Track recent edits
- Store hook configs
- Preserve analytics
```

### 4.2 Resumption Protocol
```
src/renderer/services/resumptionService.ts
- Load saved state
- Restore file context
- Replay recent activity
- Re-establish connections
- Apply hook configs
```

### 4.3 Auto-save Mechanism
```
- Debounced saves (30s)
- Change detection
- Atomic writes
- Compression option
```

## Phase 5: Enhanced Hooks (Day 10-11)

### 5.1 New Hook Events
```typescript
enum ExtendedHookEvents {
  CompactionRequest = 'compaction_request',
  TaskCreate = 'task_create',
  TaskSwitch = 'task_switch',
  TaskComplete = 'task_complete',
  ScopeViolation = 'scope_violation',
  BranchMismatch = 'branch_mismatch'
}
```

### 5.2 Built-in Hooks

#### Smart Compaction Trigger
```python
# Auto-trigger compact at 96%
if usage >= 96:
    save_manifest()
    return {"action": "trigger_compact", "message": f"Auto-compacting at {usage}%"}
```

#### Scope Guard
```python
# Check if operation is within task scope
if not within_scope(operation, task.scope):
    return {"action": "block", "message": "Outside task scope"}
```

#### Discussion Enforcer V2
```python
# Require discussion with context
if tool in ['Write', 'Edit']:
    messages = get_recent_messages(5)
    if not has_discussion(messages):
        return {"action": "block", "message": "Discuss first"}
```

## Phase 6: Workflow Integration (Day 12-13)

### 6.1 Git Integration
```
src/renderer/services/gitService.ts
- Branch creation for tasks
- Auto-commit checkpoints
- Branch enforcement
- Conflict detection
```

### 6.2 Status Bar
```
src/renderer/components/StatusBar/StatusBar.tsx
[auth-refactor] [94%] [feat/auth] [Discussion Mode]
```

### 6.3 Settings Integration
```
- Task preferences
- Compaction thresholds
- Workflow rules
- Hook configurations
```

## Testing Strategy

### Unit Tests
```
- Manifest generation
- State serialization
- Hook execution
- Threshold calculations
```

### Integration Tests
```
- Task switching
- State restoration
- Compaction blocking
- Workflow enforcement
```

### E2E Tests
```
- Complete task workflow
- Session resumption
- Context preservation
- Hook chain execution
```

## Migration Path

### 1. Feature Flags
```typescript
const FEATURES = {
  smartCompaction: true,
  taskSystem: false,
  contextManifests: false,
  statePreservation: false
};
```

### 2. Gradual Rollout
- Week 1: Smart compaction only
- Week 2: Add task system
- Week 3: Enable manifests
- Week 4: Full features

### 3. Data Migration
```sql
-- Migrate existing sessions to tasks
INSERT INTO tasks (id, title, created_at)
SELECT session_id, 'Migrated: ' || substr(session_id, 1, 8), created_at
FROM sessions;
```

## Performance Targets

### Metrics
- Task switch: <100ms
- Manifest generation: <500ms
- State save: <200ms
- State restore: <1s
- Hook execution: <50ms

### Optimizations
- Lazy loading
- Incremental saves
- Manifest caching
- Async operations
- Worker threads

## File Structure
```
src-tauri/
  src/
    compaction/
      mod.rs          # Compaction manager
    tasks/
      mod.rs          # Task system
      manifest.rs     # Manifest generator
    state/
      preservation.rs # State capture
      restoration.rs  # State restore
    commands/
      tasks.rs        # Task commands
      compaction.rs   # Compaction commands

src/renderer/
  services/
    taskService.ts       # Task management
    manifestService.ts   # Manifest generation
    stateService.ts      # State preservation
    resumptionService.ts # Session resumption
  components/
    TaskSwitcher/       # Task UI
    StatusBar/          # Enhanced status
    ContextPanel/       # Context view
  hooks/
    useTask.ts          # Task hook
    useManifest.ts      # Manifest hook
    useCompaction.ts    # Compaction hook
```

## Configuration Schema
```typescript
interface AdvancedFlowConfig {
  compaction: {
    autoThreshold: number;        // 96
    forceThreshold: number;       // 98
    preserveOnCompact: boolean;   // true
  };
  tasks: {
    enabled: boolean;             // true
    autoCreate: boolean;          // true
    requireBranch: boolean;       // false
    persistInterval: number;      // 30000
  };
  manifests: {
    autoGenerate: boolean;        // true
    includeTests: boolean;        // true
    maxDepth: number;            // 3
  };
  state: {
    autoSave: boolean;           // true
    saveInterval: number;        // 30000
    compressionEnabled: boolean; // false
  };
  enforcement: {
    discussionRequired: boolean; // true
    scopeGuard: boolean;         // true
    branchCheck: boolean;        // false
  };
}
```

## Success Criteria Checklist

### Week 1
- [ ] Auto-compact at 96%
- [ ] Force-trigger at 98%
- [ ] Context preserved via manifests
- [ ] UI shows usage indicator

### Week 2
- [ ] Tasks persist
- [ ] Manifests generate
- [ ] State saves/restores
- [ ] Quick switcher works

### Week 3
- [ ] Hooks enforce workflow
- [ ] Git integration works
- [ ] Status bar complete
- [ ] Settings functional

### Week 4
- [ ] All tests pass
- [ ] Performance targets met
- [ ] Documentation complete
- [ ] Ready for release

## Notes

### Critical Paths
1. Compaction control is highest priority
2. Task system depends on database
3. Manifests require task system
4. State preservation needs manifests

### Risk Mitigations
- Feature flags for safe rollout
- Backup before migrations
- Graceful degradation
- Error recovery paths

### Dependencies
- Existing hook system
- Current database schema
- Socket.IO infrastructure
- Tauri command system