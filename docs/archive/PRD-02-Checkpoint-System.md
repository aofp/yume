# PRD: Checkpoint & Timeline System

## Overview
Implement a checkpoint system that allows users to save and restore file states at any point in their conversation, with visual timeline navigation.

## Goals
- Save/restore complete file states
- Visual timeline with branching support
- Diff viewer between checkpoints
- Fork sessions from any checkpoint
- Minimal UI that fits yurucode aesthetic

## Technical Architecture

### Database Schema
```sql
CREATE TABLE checkpoints (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  name TEXT,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  message_index INTEGER NOT NULL,
  auto_created BOOLEAN DEFAULT 0,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE file_snapshots (
  id TEXT PRIMARY KEY,
  checkpoint_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  content TEXT,
  content_hash TEXT,
  operation TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (checkpoint_id) REFERENCES checkpoints(id)
);

CREATE INDEX idx_checkpoints_session ON checkpoints(session_id);
CREATE INDEX idx_snapshots_checkpoint ON file_snapshots(checkpoint_id);
```

### Checkpoint Strategies
1. **Manual**: User clicks checkpoint button
2. **Auto on Tool Use**: After Edit, Write, MultiEdit tools
3. **Smart**: Based on significance of changes
4. **Periodic**: Every N messages (configurable)

### UI Components

#### Timeline Navigator
- Horizontal timeline at bottom of chat
- Visual dots for each checkpoint
- Hover shows preview of changes
- Click to restore checkpoint
- Branch indicator for forked sessions

#### Checkpoint Controls
- "Create Checkpoint" button in toolbar
- Checkpoint name/description dialog
- Auto-checkpoint toggle in settings
- Checkpoint cleanup settings

#### Diff Viewer
- Side-by-side diff between checkpoints
- Syntax highlighting
- File tree showing all changes
- Restore individual files or all

### Implementation Plan

#### Phase 1: Backend
1. Add checkpoint tables to database
2. Implement file snapshot storage
3. Create checkpoint commands
4. Add content-addressable storage

#### Phase 2: Auto-Checkpoint Logic
1. Hook into tool execution
2. Implement smart detection
3. Add periodic checkpointing
4. Handle cleanup/rotation

#### Phase 3: UI Components
1. Build timeline navigator
2. Create checkpoint dialog
3. Implement diff viewer
4. Add restore functionality

#### Phase 4: Advanced Features
1. Session forking
2. Checkpoint merging
3. Export/import checkpoints
4. Checkpoint templates

### Storage Strategy
- Content-addressable storage for deduplication
- Compress large files with zlib
- Store diffs for minor changes
- Cleanup checkpoints >30 days old
- Max 100 checkpoints per session

### Performance Targets
- <100ms checkpoint creation
- <500ms checkpoint restoration
- <50MB storage per session
- Instant timeline navigation

## Success Metrics
- 95% successful restorations
- <2s average recovery time
- <100MB storage overhead
- 90% user satisfaction

## Risks & Mitigations
- **Risk**: Storage bloat
  - **Mitigation**: Content deduplication, compression, cleanup

- **Risk**: Complex UI
  - **Mitigation**: Progressive disclosure, sensible defaults

- **Risk**: Performance impact
  - **Mitigation**: Background processing, lazy loading