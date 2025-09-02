# PRD: SQLite Session Persistence

## Overview
Implement SQLite-based session persistence to ensure data is never lost and sessions can be restored across app restarts.

## Goals
- Zero data loss - all sessions and messages persisted
- Fast session recovery (<100ms)
- Cross-platform compatibility (macOS, Windows, Linux)
- Backward compatibility with existing in-memory sessions
- Maintain minimal UI and performance

## Technical Architecture

### Database Location
- macOS/Linux: `~/.yurucode/yurucode.db`
- Windows: `%APPDATA%\yurucode\yurucode.db`

### Schema
```sql
-- Core tables
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  working_directory TEXT,
  claude_session_id TEXT,
  claude_title TEXT,
  user_renamed BOOLEAN DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  metadata JSON
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL,
  role TEXT,
  content TEXT,
  tool_uses JSON,
  usage JSON,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE analytics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  tokens_input INTEGER DEFAULT 0,
  tokens_output INTEGER DEFAULT 0,
  tokens_cache INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,
  model TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- Indexes for performance
CREATE INDEX idx_sessions_updated ON sessions(updated_at);
CREATE INDEX idx_messages_session ON messages(session_id);
CREATE INDEX idx_analytics_session ON analytics(session_id);
```

### Implementation Plan

#### Phase 1: Backend Setup
1. Add rusqlite dependency to Cargo.toml
2. Create database module in src-tauri/src/db/
3. Implement migrations system
4. Add database initialization on app start

#### Phase 2: Session CRUD
1. Create session persistence commands
2. Implement auto-save on every message
3. Add session recovery on startup
4. Handle database errors gracefully

#### Phase 3: Frontend Integration
1. Update claudeCodeStore to use database
2. Add loading states during recovery
3. Implement retry logic for failed saves
4. Maintain backward compatibility

### Performance Considerations
- Use WAL mode for concurrent reads/writes
- Batch message inserts when possible
- Implement connection pooling
- Cache frequently accessed data
- Limit message history to 10,000 per session

### Error Handling
- Fallback to in-memory if database fails
- Show non-intrusive error notifications
- Auto-retry failed operations
- Provide manual recovery options

### Testing Requirements
- Unit tests for all database operations
- Integration tests for session lifecycle
- Performance tests with 1000+ sessions
- Cross-platform compatibility tests
- Migration tests from in-memory

## Success Metrics
- 100% session recovery rate
- <100ms session load time
- <50ms message save time
- <100MB database size for typical usage
- Zero data corruption reports

## Risks & Mitigations
- **Risk**: Database corruption
  - **Mitigation**: WAL mode, regular backups, integrity checks

- **Risk**: Performance degradation
  - **Mitigation**: Indexes, query optimization, caching

- **Risk**: Migration failures
  - **Mitigation**: Versioned migrations, rollback support

## Timeline
- Day 1: Backend setup and migrations
- Day 2: Session CRUD operations
- Day 3: Frontend integration
- Day 4: Testing and optimization
- Day 5: Documentation and release