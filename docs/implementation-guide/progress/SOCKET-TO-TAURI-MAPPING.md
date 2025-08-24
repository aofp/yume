# Socket.IO to Tauri Event Migration Mapping

## Overview
This document maps all Socket.IO events and commands to their Tauri equivalents for the frontend migration.

## Socket.IO Events to Replace

### 1. Socket Methods (claudeCodeClient.ts)

#### Connection Management
```typescript
// OLD: Socket.IO
socket = io(serverUrl, { ... })
socket.on('connect', handler)
socket.on('disconnect', handler)
socket.on('connect_error', handler)

// NEW: Tauri (No direct equivalent - Rust backend always available)
// Connection is implicit through Tauri IPC
```

#### Session Operations
```typescript
// OLD: Socket.IO
socket.emit('createSession', data, callback)
socket.emit('deleteSession', { sessionId }, callback)
socket.emit('getSessionHistory', { sessionId }, callback)
socket.emit('listSessions', callback)
socket.emit('clearSession', { sessionId }, callback)

// NEW: Tauri Commands
await invoke('spawn_claude_session', { 
  request: {
    project_path: workingDirectory,
    model: selectedModel,
    prompt: initialPrompt
  }
})
await invoke('clear_claude_context', { sessionId })
await invoke('list_active_sessions')
await invoke('get_session_info', { sessionId })
```

#### Message Operations
```typescript
// OLD: Socket.IO
socket.emit('sendMessage', { sessionId, content, model }, callback)
socket.emit('interrupt', { sessionId }, callback)

// NEW: Tauri Commands
await invoke('send_claude_message', {
  request: {
    session_id: sessionId,
    message: content
  }
})
await invoke('interrupt_claude_session', { sessionId })
```

#### Event Listeners
```typescript
// OLD: Socket.IO
socket.on(`message:${sessionId}`, handler)
socket.on(`error:${sessionId}`, handler)
socket.on(`title:${sessionId}`, handler)
socket.on('sessionCreated', handler)

// NEW: Tauri Events
await listen(`claude-message:${sessionId}`, handler)
await listen(`claude-error:${sessionId}`, handler)
await listen(`claude-title:${sessionId}`, handler)
await listen(`claude-tokens:${sessionId}`, handler)
await listen(`claude-complete:${sessionId}`, handler)
```

### 2. Store Methods (claudeCodeStore.ts)

#### Core Operations Used
- `claudeCodeClient.createSession()` → `invoke('spawn_claude_session')`
- `claudeCodeClient.sendMessage()` → `invoke('send_claude_message')`
- `claudeCodeClient.interrupt()` → `invoke('interrupt_claude_session')`
- `claudeCodeClient.clearSession()` → `invoke('clear_claude_context')`
- `claudeCodeClient.onMessage()` → `listen('claude-message:${sessionId}')`
- `claudeCodeClient.onError()` → `listen('claude-error:${sessionId}')`
- `claudeCodeClient.onTitle()` → `listen('claude-title:${sessionId}')`

## Event Flow Comparison

### OLD: Socket.IO Flow
```
Frontend → Socket.emit → Node.js Server → Spawn Claude → Parse output → Socket.emit → Frontend
```

### NEW: Tauri Flow
```
Frontend → invoke() → Rust Commands → ClaudeSpawner → StreamParser → emit() → Frontend
```

## Key Differences

### 1. Connection Management
- **Socket.IO**: Requires connection establishment, reconnection logic
- **Tauri**: Always available, no connection needed

### 2. Event Names
- **Socket.IO**: `message:sessionId`, `error:sessionId`
- **Tauri**: `claude-message:sessionId`, `claude-error:sessionId`

### 3. Response Handling
- **Socket.IO**: Callbacks in emit()
- **Tauri**: Promise-based with async/await

### 4. Session IDs
- **Socket.IO**: Server generates session IDs
- **Tauri**: Backend extracts from Claude CLI or generates synthetic IDs

## Migration Steps

### Phase 1: Create Tauri Client Wrapper
```typescript
// New file: src/renderer/services/tauriClaudeClient.ts
export class TauriClaudeClient {
  async createSession(name: string, workingDirectory: string, options?: any) {
    const response = await invoke('spawn_claude_session', {
      request: {
        project_path: workingDirectory,
        model: options.model || 'claude-3-opus-20240229',
        prompt: options.prompt || ''
      }
    });
    return response;
  }
  
  async sendMessage(sessionId: string, content: string) {
    await invoke('send_claude_message', {
      request: {
        session_id: sessionId,
        message: content
      }
    });
  }
  
  onMessage(sessionId: string, handler: Function) {
    return listen(`claude-message:${sessionId}`, handler);
  }
  
  // ... other methods
}
```

### Phase 2: Update Store
1. Replace `claudeCodeClient` imports with `tauriClaudeClient`
2. Update all method calls to use new signatures
3. Update event listener setup

### Phase 3: Remove Socket.IO Dependencies
1. Remove `socket.io-client` from package.json
2. Remove claudeCodeClient.ts
3. Remove Socket.IO connection logic

## Event Data Format Changes

### Message Events
```typescript
// OLD: Socket.IO format
{
  type: 'assistant',
  message: { content: '...', role: 'assistant' },
  streaming: true/false,
  usage: { ... }
}

// NEW: Tauri format (from StreamParser)
{
  type: 'ContentBlockDelta',
  delta: { text: '...' },
  // Or
  type: 'MessageStop',
  // Or
  type: 'Usage',
  input_tokens: 100,
  output_tokens: 200
}
```

### Error Events
```typescript
// OLD: Socket.IO
{ type: 'error', message: '...', timestamp: '...' }

// NEW: Tauri
{ type: 'Error', message: '...' }
```

## Critical Changes Required

### 1. Token Accumulation
- Frontend must handle += pattern for tokens
- Never use assignment (=) for token updates

### 2. Streaming State
- Track `lastAssistantMessageIds` properly
- Clear on message completion

### 3. Session Management
- Store both `sessionId` and `run_id`
- Use `sessionId` for Claude operations
- Use `run_id` for process management

### 4. readOnly Flag
- Remove completely from session browser
- No longer needed with direct CLI spawning

## Testing Checklist

- [ ] Session creation works
- [ ] Message sending works
- [ ] Streaming updates display correctly
- [ ] Token accumulation correct (use +=)
- [ ] Interruption works
- [ ] Clear context works
- [ ] Session resume works
- [ ] Title generation works
- [ ] Error handling works
- [ ] Multiple tabs work independently

## Risk Areas

1. **Event Format Changes**: Frontend expects different message structure
2. **Connection Logic**: No need for reconnection handling
3. **Session ID Management**: Different ID generation approach
4. **Token Tracking**: Critical to use += pattern

## Benefits of Migration

1. **No 2-hour timeout** - Direct spawning eliminates freeze bug
2. **Better performance** - No Socket.IO overhead
3. **More reliable** - No connection issues
4. **Cleaner architecture** - Direct IPC communication
5. **Platform native** - Uses Tauri's built-in event system