# PRD-05: Advanced Claude Flow Management for yurucode

## Executive Summary
Implement advanced Claude flow management features inspired by cc-sessions, focusing on context preservation, task persistence, intelligent compaction, and workflow enforcement. All features will be native to yurucode, maintaining its minimal OLED aesthetic while providing powerful session control.

## Problem Statement
Current Claude interactions suffer from:
- Context loss during long sessions
- No persistent task management
- Inefficient compaction triggering
- Lack of session state preservation
- No intelligent context manifests
- Missing workflow enforcement patterns
- Uncontrolled scope creep

## Goals
1. **Primary**: Implement intelligent context management with 96% auto-compaction
2. **Secondary**: Create persistent task system with context manifests
3. **Tertiary**: Add session state preservation and resumption

## Non-Goals
- External dependency on cc-sessions
- Complex UI changes
- Breaking existing workflows
- Adding verbose logging

## Core Features

### 1. Intelligent Context Management

#### 1.1 Smart Compaction Control
```typescript
interface CompactionStrategy {
  autoTrigger: 96;     // Auto-trigger at 96%
  forceThreshold: 98;  // Force if not done by 98%
  preserveContext: boolean;
  generateManifest: boolean;
}
```

**Rationale**: Auto-compact at 96% to maintain optimal context usage while preserving critical information.

#### 1.2 Context Manifests
```typescript
interface ContextManifest {
  taskId: string;
  timestamp: number;
  files: string[];
  functions: string[];
  decisions: string[];
  dependencies: string[];
  scope: string;
}
```

**Purpose**: Preserve critical context across compactions.

### 2. Task Persistence System

#### 2.1 Task Structure
```typescript
interface Task {
  id: string;
  title: string;
  branch?: string;
  priority: 'high' | 'medium' | 'low' | 'investigate';
  manifest: ContextManifest;
  messages: Message[];
  status: 'active' | 'paused' | 'completed';
  createdAt: Date;
  updatedAt: Date;
}
```

#### 2.2 Task Files
Location: `~/.yurucode/tasks/{task-id}/`
- `manifest.json` - Context manifest
- `messages.json` - Conversation history
- `state.json` - Current state
- `decisions.log` - Key decisions made

### 3. Session State Preservation

#### 3.1 State Components
- Active files and positions
- Recent edits with restore points
- Token usage and analytics
- Hook configurations
- Active task context

#### 3.2 Resumption Protocol
```typescript
interface ResumptionData {
  lastActivity: Date;
  contextSummary: string;
  activeFiles: string[];
  pendingOperations: Operation[];
  taskManifest: ContextManifest;
}
```

### 4. Workflow Enforcement Hooks

#### 4.1 Discussion Enforcer (Enhanced)
```python
# Block writes without recent discussion
if tool in ['Write', 'Edit'] and not has_recent_discussion(session):
    return block("Discuss approach first")
```

#### 4.2 Scope Guard
```python
# Prevent scope creep
if not is_within_task_scope(operation, current_task):
    return block("Outside task scope. Create new task?")
```

#### 4.3 Branch Enforcer
```bash
# Ensure correct branch for task
if [ "$current_branch" != "$task_branch" ]; then
    echo '{"action":"block","message":"Wrong branch. Switch to task branch"}'
fi
```

### 5. Intelligent Subagent Integration

#### 5.1 Context Gatherer
Automatically collects relevant context before starting work:
- Scans related files
- Identifies dependencies
- Creates context manifest
- Preserves for future sessions

#### 5.2 Decision Logger
Tracks all significant decisions:
- Architecture choices
- Implementation approaches
- Rejected alternatives
- Rationale

#### 5.3 Checkpoint Creator
Creates restore points at key moments:
- Before major refactors
- After successful implementations
- Before risky operations

### 6. Enhanced Hook System

#### 6.1 Session Hooks
```typescript
interface SessionHooks {
  onSessionStart: (task?: Task) => void;
  onSessionEnd: (saveState: boolean) => void;
  onContextWarning: (percentage: number) => void;
  onCompactRequest: () => boolean; // Return false to block
}
```

#### 6.2 Task Hooks
```typescript
interface TaskHooks {
  onTaskCreate: (task: Task) => void;
  onTaskSwitch: (from: Task, to: Task) => void;
  onTaskComplete: (task: Task) => void;
}
```

## Implementation Architecture

### Phase 1: Context Management (Week 1)
- [ ] Smart compaction control (96%+ blocking)
- [ ] Context manifest generation
- [ ] Context preservation hooks
- [ ] Usage monitoring improvements

### Phase 2: Task System (Week 1-2)
- [ ] Task creation/management UI
- [ ] Task file persistence
- [ ] Context manifest integration
- [ ] Task switching logic

### Phase 3: State Preservation (Week 2)
- [ ] Session state serialization
- [ ] Resumption protocol
- [ ] State restoration UI
- [ ] Auto-save mechanism

### Phase 4: Workflow Enforcement (Week 2-3)
- [ ] Enhanced discussion enforcer
- [ ] Scope guard implementation
- [ ] Branch enforcement
- [ ] Custom workflow rules

### Phase 5: Subagent Integration (Week 3)
- [ ] Context gatherer subagent
- [ ] Decision logger
- [ ] Checkpoint system
- [ ] Subagent UI controls

## UI/UX Enhancements

### Status Bar Addition
```
[Task: auth-refactor] [Context: 94%] [Branch: feat/auth] [Mode: Discussion]
```

### Task Switcher (Cmd+K style)
- Quick task switching
- Recent tasks list
- Task search
- Priority indicators

### Context Panel
- Current manifest view
- Key decisions log
- Active scope definition
- File dependencies

## Success Metrics
- Context preservation: >90% retention across compactions
- Task completion rate: >80%
- Scope creep reduction: <10% of tasks
- Session resumption success: >95%

## Technical Requirements

### Storage
- SQLite for task persistence
- JSON for manifests
- Local file system for task files

### Performance
- <100ms task switching
- <500ms manifest generation
- <1s session restoration

### Compatibility
- Works with existing hooks
- Preserves current workflows
- Backward compatible

## Migration Strategy
1. Feature flag rollout
2. Opt-in beta testing
3. Gradual enforcement
4. Full deployment

## Risk Analysis

### Risks
1. **Complexity**: May overwhelm users
   - Mitigation: Progressive disclosure, smart defaults
   
2. **Performance**: State management overhead
   - Mitigation: Async operations, caching
   
3. **Data Loss**: Task file corruption
   - Mitigation: Backups, atomic writes

## Example Workflows

### Starting New Task
1. Create task with scope
2. System generates manifest
3. Creates branch (optional)
4. Preserves context
5. Enforces scope

### Resuming Work
1. Select task
2. Load manifest
3. Restore context
4. Continue where left off
5. Preserve decisions

### Context Warning Flow
1. 75%: Gentle warning
2. 90%: Strong warning, prepare for compact
3. 96%: Auto-trigger compact with manifest save
4. 98%: Force compact if not already done

## Configuration Options
```typescript
interface FlowConfig {
  compaction: {
    autoThreshold: number;   // Default: 96
    forceThreshold: number;  // Default: 98
  };
  tasks: {
    autoCreate: boolean;     // Default: true
    requireBranch: boolean;  // Default: false
    persistMessages: boolean; // Default: true
  };
  enforcement: {
    discussionRequired: boolean; // Default: true
    scopeGuard: boolean;         // Default: true
    branchCheck: boolean;        // Default: false
  };
}
```

## Integration Points
- Existing hook system
- Current database
- Session management
- Socket.IO communication
- Tauri commands

## Testing Strategy
1. Unit tests for manifest generation
2. Integration tests for task system
3. E2E tests for workflows
4. Performance benchmarks
5. User acceptance testing

## Documentation Requirements
- Task system user guide
- Context management best practices
- Workflow configuration guide
- Migration guide
- API reference

## Timeline
- Week 1: Context management + Task system core
- Week 2: State preservation + Workflow enforcement
- Week 3: Subagent integration + Testing
- Week 4: Documentation + Release

## Acceptance Criteria
- [ ] Compact auto-triggers at 96% context usage
- [ ] Tasks persist across sessions
- [ ] Context manifests auto-generate
- [ ] Session state preserves and restores
- [ ] Workflow hooks enforce patterns
- [ ] Subagents integrate seamlessly
- [ ] Performance meets requirements
- [ ] UI remains minimal