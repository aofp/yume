# Session Management PRD: Claudia vs Yurucode

## Executive Summary
This PRD analyzes the session management differences between Claudia (working implementation) and Yurucode (broken implementation), and provides a comprehensive fix to make Yurucode's session resumption work reliably on both macOS and Windows.

## 1. Architecture Comparison

### Claudia's Architecture
```
┌─────────────────────────────────────────────────────────┐
│                      Frontend (React)                    │
├─────────────────────────────────────────────────────────┤
│ • sessionStore (Zustand)                                 │
│ • tabPersistence (localStorage)                          │
│ • sessionPersistence (localStorage)                      │
│ • Direct API calls to Tauri backend                      │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                    Tauri Backend (Rust)                  │
├─────────────────────────────────────────────────────────┤
│ • Direct claude CLI spawning                             │
│ • resume_claude_code(session_id) → --resume <id>        │
│ • continue_claude_code() → -c flag                       │
│ • Session info from ~/.claude/projects                   │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                       Claude CLI                         │
├─────────────────────────────────────────────────────────┤
│ • ~/.claude/projects/<project_id>/<session_id>.jsonl    │
│ • Native session persistence                             │
└─────────────────────────────────────────────────────────┘
```

### Yurucode's Architecture (Current - Broken)
```
┌─────────────────────────────────────────────────────────┐
│                      Frontend (React)                    │
├─────────────────────────────────────────────────────────┤
│ • claudeCodeStore (Zustand)                              │
│ • sessionMappings (localStorage)                         │
│ • Socket.IO client                                       │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                  Node.js Server (Socket.IO)              │
├─────────────────────────────────────────────────────────┤
│ • In-memory session storage (Map)                        │
│ • Session lost on server restart                         │
│ • Complex claudeSessionId mapping                        │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                    Tauri Backend (Rust)                  │
├─────────────────────────────────────────────────────────┤
│ • Spawns Node.js server                                  │
│ • Embedded server code in logged_server.rs               │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                       Claude CLI                         │
├─────────────────────────────────────────────────────────┤
│ • ~/.claude/projects/<project_id>/<session_id>.jsonl    │
│ • Session exists but can't be resumed                    │
└─────────────────────────────────────────────────────────┘
```

## 2. Key Differences

### 2.1 Session Persistence

| Aspect | Claudia | Yurucode |
|--------|---------|----------|
| **Session Storage** | Direct file system (JSONL files) | In-memory Map + localStorage mappings |
| **Session ID** | Direct claude session ID | Custom session ID + claude session ID mapping |
| **Persistence** | Always persisted to disk | Lost on server restart |
| **Recovery** | Reads from ~/.claude/projects | Tries to recreate from memory |

### 2.2 Session Resumption

| Aspect | Claudia | Yurucode |
|--------|---------|----------|
| **Resume Method** | `claude --resume <session_id>` | Complex mapping and recovery |
| **Session Discovery** | Reads ~/.claude/projects directly | Relies on in-memory state |
| **Tab Restoration** | Persists tab state to localStorage | Loses session on restart |
| **Continue Conversation** | Uses `-c` flag | Uses `--resume` with stored ID |

### 2.3 Error Handling

| Aspect | Claudia | Yurucode |
|--------|---------|----------|
| **Resume Failure** | Falls back to new session | Tries to recreate, often fails |
| **Session Not Found** | Creates new with same project | Returns error |
| **Server Restart** | Sessions intact on disk | Sessions lost from memory |

## 3. Root Causes of Yurucode's Issues

1. **In-Memory Session Storage**: Sessions stored in Node.js server memory are lost on restart
2. **Complex ID Mapping**: Two-level ID system (custom + claude) causes sync issues
3. **No Direct File Access**: Server doesn't read ~/.claude/projects directly
4. **Nested Data Structures**: claudeSessionId sometimes nested in options object
5. **Race Conditions**: Session creation/resumption timing issues

## 4. Proposed Solution

### 4.1 Immediate Fixes (Already Implemented)
✅ Fixed server to extract claudeSessionId from both direct and nested locations
✅ Fixed client to pass claudeSessionId when resuming sessions
✅ Fixed store to check sessionMappings for stored claudeSessionId

### 4.2 Comprehensive Architecture Fix

#### Phase 1: Server-Side Session Persistence
```javascript
// Add file-based session persistence to server
const fs = require('fs');
const path = require('path');
const homedir = require('os').homedir();

class SessionPersistence {
  constructor() {
    this.sessionDir = path.join(homedir, '.yurucode', 'sessions');
    this.ensureDirectory();
  }
  
  ensureDirectory() {
    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true });
    }
  }
  
  saveSession(sessionId, sessionData) {
    const filePath = path.join(this.sessionDir, `${sessionId}.json`);
    fs.writeFileSync(filePath, JSON.stringify({
      ...sessionData,
      socket: undefined, // Don't save socket reference
      savedAt: Date.now()
    }));
  }
  
  loadSession(sessionId) {
    const filePath = path.join(this.sessionDir, `${sessionId}.json`);
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return data;
    }
    return null;
  }
  
  getAllSessions() {
    const files = fs.readdirSync(this.sessionDir);
    return files
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''));
  }
}
```

#### Phase 2: Direct Claude Project Integration
```javascript
// Read Claude's native session files directly
class ClaudeProjectReader {
  constructor() {
    this.projectsDir = path.join(homedir, '.claude', 'projects');
  }
  
  findSessionFile(sessionId) {
    // Search all projects for session file
    const projects = fs.readdirSync(this.projectsDir);
    for (const project of projects) {
      const sessionFile = path.join(this.projectsDir, project, `${sessionId}.jsonl`);
      if (fs.existsSync(sessionFile)) {
        return { projectId: project, sessionFile };
      }
    }
    return null;
  }
  
  getSessionMetadata(sessionId) {
    const location = this.findSessionFile(sessionId);
    if (!location) return null;
    
    // Read first and last lines for metadata
    const content = fs.readFileSync(location.sessionFile, 'utf8');
    const lines = content.trim().split('\n');
    
    if (lines.length > 0) {
      const firstLine = JSON.parse(lines[0]);
      const lastLine = JSON.parse(lines[lines.length - 1]);
      
      return {
        sessionId,
        projectId: location.projectId,
        claudeSessionId: firstLine.session_id || sessionId,
        messageCount: lines.length,
        firstMessage: firstLine,
        lastMessage: lastLine
      };
    }
    
    return null;
  }
}
```

#### Phase 3: Simplified Session Management
```javascript
// Simplified session manager that works with Claude's native format
socket.on('createSession', async (data, callback) => {
  const sessionPersistence = new SessionPersistence();
  const claudeReader = new ClaudeProjectReader();
  
  // Check if resuming existing session
  if (data.sessionId && data.claudeSessionId) {
    // Try to load from disk first
    let sessionData = sessionPersistence.loadSession(data.sessionId);
    
    if (!sessionData) {
      // Try to find in Claude's projects
      const claudeSession = claudeReader.getSessionMetadata(data.claudeSessionId);
      if (claudeSession) {
        sessionData = {
          id: data.sessionId,
          claudeSessionId: claudeSession.claudeSessionId,
          workingDirectory: data.workingDirectory,
          messages: [],
          hasGeneratedTitle: false
        };
      }
    }
    
    if (sessionData) {
      // Update with current socket
      sessionData.socket = socket;
      sessions.set(data.sessionId, sessionData);
      
      callback({
        success: true,
        sessionId: data.sessionId,
        claudeSessionId: sessionData.claudeSessionId,
        workingDirectory: sessionData.workingDirectory,
        messages: sessionData.messages
      });
      return;
    }
  }
  
  // Create new session
  const sessionId = data.sessionId || `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const sessionData = {
    id: sessionId,
    socket,
    workingDirectory: data.workingDirectory || homedir(),
    messages: [],
    claudeSessionId: null,
    hasGeneratedTitle: false
  };
  
  sessions.set(sessionId, sessionData);
  sessionPersistence.saveSession(sessionId, sessionData);
  
  callback({
    success: true,
    sessionId,
    workingDirectory: sessionData.workingDirectory
  });
});
```

## 5. Implementation Plan

### Step 1: Add Session Persistence (Priority 1)
- [x] Fix claudeSessionId extraction in server
- [x] Fix claudeSessionId passing from client
- [ ] Add file-based session persistence
- [ ] Load sessions on server startup

### Step 2: Integrate with Claude Projects (Priority 2)
- [ ] Add ClaudeProjectReader class
- [ ] Search for existing sessions in ~/.claude/projects
- [ ] Map yurucode sessions to claude sessions

### Step 3: Simplify Session Management (Priority 3)
- [ ] Remove complex ID mapping
- [ ] Use claude session ID directly when possible
- [ ] Simplify resume logic

### Step 4: Cross-Platform Testing (Priority 1)
- [ ] Test on macOS with existing sessions
- [ ] Test on Windows with path handling
- [ ] Test server restart scenarios

## 6. Success Metrics

1. **Session Resume Success Rate**: 100% for valid sessions
2. **Server Restart Recovery**: All sessions recoverable
3. **Cross-Platform**: Works on macOS and Windows
4. **Performance**: Session resume < 100ms
5. **User Experience**: No lost conversations

## 7. Testing Scenarios

### Scenario 1: Basic Resume
1. Start conversation
2. Close app
3. Reopen app
4. Click on old session
5. Continue conversation
✅ Expected: Conversation continues with full context

### Scenario 2: Server Crash Recovery
1. Start conversation
2. Kill server process
3. Server auto-restarts
4. Continue conversation
✅ Expected: Session recovered from disk

### Scenario 3: Cross-Tab Resume
1. Open session in Tab 1
2. Switch to Tab 2
3. Switch back to Tab 1
4. Send message
✅ Expected: Context maintained

### Scenario 4: Long Session Resume
1. Have 100+ message conversation
2. Close app
3. Reopen next day
4. Continue conversation
✅ Expected: Full history available

## 8. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| File system permissions | Graceful fallback to in-memory |
| Disk space | Rotate old session files |
| Corrupted session files | Validation and recovery |
| Performance with many sessions | Index and cache |

## 9. Conclusion

Claudia's approach is simpler and more reliable because it:
1. Relies on Claude CLI's native persistence
2. Doesn't maintain complex in-memory state
3. Reads directly from disk when needed
4. Uses simple session ID mapping

Yurucode needs to adopt this approach for reliable session management.