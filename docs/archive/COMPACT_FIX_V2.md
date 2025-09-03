# Compact Command Fix V2 - Complete Analysis and Solution

## Problem Summary
After executing `/compact` command in yurucode, users couldn't send new messages. The app would show "session not found" error when trying to continue the conversation after compacting.

## Root Cause Analysis

### The Issue Flow
1. User sends `/compact` command to compress conversation context
2. Claude CLI returns a new session ID that is **NOT resumable**
3. Server correctly clears `claudeSessionId = null` after compact
4. Frontend also clears it in the store
5. **BUT** when session is restored from localStorage (after app restart/tab switch), the old invalid `claudeSessionId` is sent back to server
6. Server accepts this old ID and tries to `--resume` with it
7. Claude CLI fails with "No conversation found with session ID" error

### Key Discovery
The embedded server in `logged_server.rs` was blindly trusting `claudeSessionId` values sent from the frontend, even after compacts made them invalid.

## The Fix

### Server-Side Changes (logged_server.rs)

#### 1. Track Compacted Sessions
Added `wasCompacted` flag to session state to track when a session has been compacted:

```javascript
// When compact completes
if (session) {
  session.claudeSessionId = null;
  session.wasCompacted = true;  // NEW: Mark session as compacted
  console.log('🗜️ Marked session as compacted to prevent old ID restoration');
}
```

#### 2. Reject Old IDs on Session Load
When loading an existing session, check if it was compacted and reject old IDs:

```javascript
if (data.existingSessionId && data.messages) {
  const existingSession = sessions.get(sessionId);
  if (existingSession?.wasCompacted) {
    // Don't restore old claudeSessionId if session was compacted
    existingClaudeSessionId = null;
    console.log('📂 Loading compacted session - ignoring old Claude ID');
  } else {
    existingClaudeSessionId = data.claudeSessionId || null;
  }
}
```

#### 3. Better Error Handling
Enhanced error detection when resume fails after compact:

```javascript
if (error.includes('No conversation found with session ID')) {
  console.log('🔄 Resume failed - session not found in Claude storage');
  if (session?.wasCompacted) {
    console.log('🔄 This was expected - session was compacted and old ID is no longer valid');
  }
  session.claudeSessionId = null;
}
```

#### 4. Clear Compacted Flag on Clear Context
When user explicitly clears context (Ctrl+L), reset the compacted flag:

```javascript
session.wasCompacted = false;  // Reset compacted flag
```

### Frontend Changes (claudeCodeStore.ts)

#### 1. Track Compacted State in Session
Added `wasCompacted` flag to Session interface to persist across app restarts:

```typescript
interface Session {
  // ... other fields
  wasCompacted?: boolean; // Track if session was compacted to prevent old ID restoration
}
```

#### 2. Set Flag on Compact
When receiving compact system message:

```typescript
if (isCompactResult) {
  s = { ...s, claudeSessionId: null, wasCompacted: true };
}
```

#### 3. Check Flag Before Resume
Don't send invalid claudeSessionId if session was compacted:

```typescript
const claudeSessionIdToResume = existingSessionId && !existingSession?.wasCompacted 
  ? existingSession?.claudeSessionId 
  : undefined;

if (existingSessionId && existingSession?.wasCompacted) {
  console.log(`🗜️ [Store] Session was compacted - ignoring old Claude ID`);
}
```

## Testing Scenarios Covered

### Scenario 1: Basic Compact Flow
✅ Send messages → `/compact` → Continue conversation
- Server clears session ID after compact
- Next message starts fresh conversation with compacted context

### Scenario 2: Compact + App Restart
✅ Send messages → `/compact` → Restart app → Open same tab → Send message
- Server detects compacted session on load
- Ignores old claudeSessionId from localStorage
- Starts fresh with compacted context

### Scenario 3: Compact + Tab Switch
✅ Send messages → `/compact` → Switch tabs → Return to tab → Send message
- wasCompacted flag persists across tab switches
- Old ID is rejected when tab is restored

### Scenario 4: Compact + Clear Context
✅ Send messages → `/compact` → Ctrl+L (clear) → Send message
- Clear context resets both claudeSessionId and wasCompacted flag
- Clean slate for new conversation

### Scenario 5: Multiple Compacts
✅ Send messages → `/compact` → More messages → `/compact` again
- Each compact properly clears session ID
- wasCompacted flag prevents any old ID restoration

## Previous Bugs Fixed Along the Way

### 1. Session Creation Callback Registration (from previous fix)
- TauriClient wasn't registering sessionCreatedCallback
- Fixed in main.tsx to register for both Socket.IO and Tauri clients

### 2. Restored Tabs Session Registration (from previous fix)
- Restored tabs weren't being registered in __claudeSessionStore
- Fixed in restoreTabs() to register with pendingSpawn flag

### 3. Duplicate Catch Blocks Syntax Error
- Removed duplicate catch blocks that prevented compilation

## Technical Details

### How Compact Works in Claude CLI
1. `/compact` command summarizes the conversation
2. Returns a new session ID in the result
3. This new ID is **NOT resumable** - it's just metadata
4. Next message must start fresh (no `--resume` flag)
5. But the compacted context is preserved in Claude's internal state

### Session ID Lifecycle
1. **Creation**: Claude assigns ID on first message
2. **Resume**: Use `--resume <id>` to continue conversation
3. **Compact**: ID becomes invalid, must start fresh
4. **Clear**: Explicitly resets to no session

### Frontend-Backend Contract
- Frontend sends `claudeSessionId` when creating/resuming sessions
- Server now validates this ID against session state
- Server is source of truth for session validity
- Frontend reacts to server's session state changes

## Monitoring & Logging

### Key Log Messages to Watch
```
🗜️ Cleared session ID (was xxx) - next message will start fresh after compact
🗜️ Marked session as compacted to prevent old ID restoration
📂 Loading compacted session: xxx - ignoring old Claude ID
🔄 Resume failed - session not found in Claude storage
🔄 This was expected - session was compacted and old ID is no longer valid
```

## Implementation Files Changed

1. **src-tauri/src/logged_server.rs** (embedded server):
   - Added wasCompacted flag to session state
   - Check compacted state when loading sessions
   - Enhanced error handling for resume failures
   - Clear compacted flag on explicit clear context

2. **src/renderer/stores/claudeCodeStore.ts** (frontend store):
   - Added `wasCompacted` flag to Session interface
   - Set flag when receiving compact system message
   - Persist flag to localStorage for app restarts
   - Check flag before sending claudeSessionId for resume
   - Clear flag on clearContext (Ctrl+L)

## Comparison with Claudia Implementation

Claudia uses a more sophisticated checkpoint system:
- Has dedicated checkpoint manager for session state
- Clears checkpoint managers when sessions end
- More robust session state management

Yurucode's simpler approach:
- Single wasCompacted flag
- Server-side validation of session IDs
- Works well for the compact use case

## Edge Cases Handled

1. **Race Conditions**: Queue system prevents concurrent spawns
2. **Multiple Compacts**: Each compact properly resets state
3. **Interrupted + Compact**: Both flags tracked independently
4. **Network Issues**: Error results trigger checkpoint restore
5. **Invalid Sessions**: Server rejects and clears invalid IDs

## Success Metrics

✅ Users can continue conversations after `/compact`
✅ No "session not found" errors after compact
✅ Tab restoration works correctly
✅ App restart doesn't break compacted sessions
✅ Clear context still works as expected

## Future Improvements (see YURUCODE_TODO.md)
- Implement checkpoint system like Claudia
- Add visual indicator for compacted sessions
- Show token savings from compact
- Auto-compact when approaching limits
- Persist wasCompacted flag to disk