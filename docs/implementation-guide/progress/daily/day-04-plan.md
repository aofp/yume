# Day 4 Plan - Frontend Migration

## 📅 Date: 2025-08-23 (Day 4)

## 🎯 Primary Goal

Complete the frontend migration from Socket.IO to Tauri events, enabling the UI to communicate with our new direct CLI spawning backend.

## ✅ Starting Position

### What We Have
- **Backend 100% Complete**: All Rust components working
- **Tauri Commands Ready**: 9 commands exposing backend functionality
- **Socket.IO Mapping**: Complete analysis of all 15 events
- **Clear Migration Path**: Know exactly what needs to change

### Current State
- Frontend still using Socket.IO client
- Store expecting Socket.IO events
- Components listening to wrong event format
- readOnly flag still present in session browser

## 📋 Today's Tasks

### 1. Create tauriClaudeClient.ts (Priority: P0)
**Goal**: Replace Socket.IO client with Tauri invoke/listen

**Implementation Steps**:
```typescript
// Core structure needed
class TauriClaudeClient {
  // Replace socket.emit with invoke
  async startSession(): Promise<string> {
    return await invoke('start_claude_session');
  }
  
  // Replace socket.on with listen
  async listenForMessages() {
    await listen('claude:stream', (event) => {
      // Handle stream events
    });
  }
}
```

**Key Mappings**:
- `socket.emit('claude:start')` → `invoke('start_claude_session')`
- `socket.emit('claude:message')` → `invoke('send_message')`
- `socket.on('claude:stream')` → `listen('claude:stream')`
- `socket.on('analytics:update')` → `listen('analytics:update')`

### 2. Update claudeCodeStore.ts (Priority: P0)
**Goal**: Refactor store to use Tauri client instead of Socket.IO

**Critical Changes**:
- Remove all Socket.IO references
- Use new TauriClaudeClient
- Ensure token accumulation uses += (CRITICAL)
- Remove readOnly flag from session browser
- Update message handling for new event format

**Token Accumulation Pattern** (MUST MAINTAIN):
```typescript
// CORRECT - Must keep this pattern
analytics.inputTokens += event.data.inputTokens;
analytics.outputTokens += event.data.outputTokens;

// WRONG - Never do this
analytics.inputTokens = event.data.inputTokens;
```

### 3. Update MessageRenderer.tsx (Priority: P1)
**Goal**: Update component to handle new event format

**Changes Needed**:
- Update event listener registration
- Handle new message format from Tauri
- Fix streaming indicator logic
- Ensure proper cleanup on unmount

### 4. Remove Socket.IO Dependencies (Priority: P1)
**Goal**: Clean removal of Socket.IO

**Steps**:
- Comment out Socket.IO imports (don't delete yet)
- Remove socket.io-client from active code
- Keep as fallback until testing complete
- Full removal after verification

## 🔄 Migration Strategy

### Phase 1: Parallel Implementation (Morning)
1. Create tauriClaudeClient.ts alongside existing client
2. Don't break existing functionality yet
3. Test new client in isolation

### Phase 2: Store Integration (Afternoon)
1. Create store branch/copy for testing
2. Integrate Tauri client
3. Verify token accumulation
4. Test state management

### Phase 3: Component Updates (Late Afternoon)
1. Update MessageRenderer
2. Fix event listeners
3. Test UI updates
4. Verify streaming works

### Phase 4: Cleanup & Testing (Evening)
1. Remove Socket.IO code
2. Test full flow
3. Document issues
4. Plan Day 5 testing

## ⚠️ Critical Patterns to Maintain

### 1. Token Accumulation
```typescript
// Analytics MUST accumulate, not replace
updateAnalytics(newData) {
  analytics.inputTokens += newData.inputTokens;  // +=
  analytics.outputTokens += newData.outputTokens; // +=
  analytics.cacheRead += newData.cacheRead;      // +=
  analytics.cacheWrite += newData.cacheWrite;    // +=
}
```

### 2. Session ID Management
```typescript
// Session ID comes from backend now
const sessionId = await invoke('start_claude_session');
// Store it immediately
setSessionId(sessionId);
```

### 3. Message Format Adaptation
```typescript
// Socket.IO format
{
  claudeSessionId: "xxx",
  text: "message",
  analytics: { ... }
}

// Tauri format (needs adapter)
{
  sessionId: "xxx",
  content: "message",
  tokens: { ... }
}
```

## 🎯 Success Criteria

### Must Complete Today
- [ ] tauriClaudeClient.ts created and working
- [ ] Basic message send/receive working
- [ ] Store updated to use Tauri client
- [ ] Token accumulation verified (+=)

### Nice to Have
- [ ] All components updated
- [ ] Socket.IO fully removed
- [ ] readOnly flag removed
- [ ] Full flow tested

### Minimum Viable Progress
- At least get basic messaging working
- Can polish tomorrow if needed
- Focus on core functionality first

## 📊 Progress Tracking

### Morning (9 AM - 12 PM)
- [ ] tauriClaudeClient.ts skeleton
- [ ] Basic invoke commands
- [ ] Event listeners setup
- [ ] Initial testing

### Afternoon (12 PM - 3 PM)
- [ ] Store integration started
- [ ] Token accumulation verified
- [ ] Basic flow working
- [ ] Debug any issues

### Late Afternoon (3 PM - 6 PM)
- [ ] Component updates
- [ ] UI responding to events
- [ ] Streaming indicator working
- [ ] Error handling

### Evening (6 PM - 8 PM)
- [ ] Integration testing
- [ ] Bug fixes
- [ ] Documentation
- [ ] Day 5 planning

## 🚨 Potential Challenges

### 1. Message Format Differences
**Risk**: Tauri and Socket.IO have different formats
**Mitigation**: Create adapter functions
**Fallback**: Keep both formats temporarily

### 2. Event Listener Lifecycle
**Risk**: Memory leaks from improper cleanup
**Mitigation**: Careful unlisten management
**Fallback**: Use effect cleanup properly

### 3. Store State Management
**Risk**: State updates might not trigger renders
**Mitigation**: Verify Zustand updates
**Fallback**: Force re-renders if needed

### 4. Streaming Complexity
**Risk**: Stream events might not flow correctly
**Mitigation**: Debug with console logs
**Fallback**: Simplified streaming first

## 💡 Implementation Notes

### Tauri Event Pattern
```typescript
import { invoke, listen } from '@tauri-apps/api';

// Commands (request/response)
const result = await invoke('command_name', { param: value });

// Events (streaming)
const unlisten = await listen('event_name', (event) => {
  console.log(event.payload);
});

// Cleanup
unlisten();
```

### Store Update Pattern
```typescript
const useClaudeStore = create((set, get) => ({
  // State
  sessions: new Map(),
  
  // Actions using Tauri
  startSession: async () => {
    const sessionId = await invoke('start_claude_session');
    set(state => ({
      sessions: new Map(state.sessions).set(sessionId, { ... })
    }));
  }
}));
```

## 📝 Documentation Requirements

### Must Document
1. All breaking changes
2. Migration steps taken
3. Issues encountered
4. Solutions found
5. Remaining work

### Code Comments
- Mark all CRITICAL patterns
- Note any workarounds
- Document adapter functions
- Explain format conversions

## 🎉 Expected Outcomes

By end of Day 4, we should have:
1. **Working Frontend**: Basic messaging functional
2. **Tauri Integration**: Commands and events connected
3. **Clean Architecture**: Socket.IO removed or isolated
4. **Test Ready**: Can begin integration testing Day 5

## 🚀 Next Steps (Day 5 Preview)

1. **Integration Testing**: Full flow validation
2. **Duration Tests**: 5-min, 30-min tasks
3. **Bug Fixes**: Address any Day 4 issues
4. **Performance**: Initial measurements
5. **2-Hour Test Prep**: The ultimate validation

---

**Confidence Level**: HIGH - Clear path, no blockers
**Estimated Completion**: 80% by end of day
**Risk Level**: LOW - Can fall back if needed

*Let's complete this migration and fix the freeze bug once and for all!*