# Day 3 Quick Action Plan - Tauri Commands & Frontend Bridge

## 🎯 Primary Objectives

### Morning: Create Tauri Commands (4 hours)
1. **Core Commands**
   ```rust
   #[tauri::command]
   async fn spawn_claude_session(project_path, model, prompt)
   async fn send_claude_message(session_id, message)
   async fn resume_claude_session(session_id, prompt)
   async fn interrupt_claude_session(session_id)
   async fn clear_claude_context(session_id)
   ```

2. **Query Commands**
   ```rust
   async fn get_session_info(session_id)
   async fn get_token_stats(session_id)
   async fn list_active_sessions()
   ```

### Afternoon: Frontend Analysis & Planning (4 hours)
1. **Socket.IO Usage Audit**
   - Find all `socket.emit()` calls
   - Find all `socket.on()` handlers
   - Document data flow
   - Plan Tauri replacements

2. **Store Analysis**
   - Review `claudeCodeStore.ts`
   - Identify Socket.IO dependencies
   - Plan event handler updates

## 📋 Quick Checklist

### Tauri Commands
- [ ] Create `commands/claude_commands.rs`
- [ ] Implement spawn command
- [ ] Implement send message command
- [ ] Implement resume command
- [ ] Implement interrupt command
- [ ] Register commands in main.rs
- [ ] Test with Tauri IPC

### Frontend Preparation
- [ ] List all Socket.IO events
- [ ] Map to Tauri events
- [ ] Find readOnly flag usage
- [ ] Check token accumulation in store
- [ ] Document required changes

### Integration
- [ ] Connect commands to ClaudeSpawner
- [ ] Wire up ProcessRegistry
- [ ] Test full flow
- [ ] Verify event emission

## 🔧 Code Templates

### Tauri Command Template
```rust
#[tauri::command]
pub async fn spawn_claude_session(
    app: AppHandle,
    state: State<'_, AppState>,
    project_path: String,
    model: String,
    prompt: String,
) -> Result<SpawnResult, String> {
    let spawner = state.claude_spawner.clone();
    
    let options = SpawnOptions {
        project_path,
        model,
        prompt,
        resume_session_id: None,
        continue_conversation: false,
    };
    
    spawner.spawn_claude(app, options)
        .await
        .map_err(|e| e.to_string())
}
```

### Frontend Event Template
```typescript
// Before (Socket.IO)
socket.emit('send-message', { sessionId, message });
socket.on('claude-output', (data) => { ... });

// After (Tauri)
await invoke('send_claude_message', { sessionId, message });
await listen(`claude-output:${sessionId}`, (event) => { ... });
```

## ⚡ Quick Wins

1. Start with spawn command - most complex
2. Test with simple prompt
3. Verify events reach frontend
4. Check token accumulation

## 🚨 Watch Out For

1. **State Management** - Need AppState with spawner
2. **Error Handling** - Convert anyhow to String
3. **Async Commands** - All must be async
4. **Event Names** - Must match frontend expectations

## 📊 Success Metrics

- [ ] Can spawn Claude session from frontend
- [ ] Can send messages
- [ ] Tokens accumulate correctly
- [ ] Events reach UI
- [ ] No Socket.IO errors

## 🔄 End of Day Goal

**Have working Tauri commands that can spawn Claude and handle basic messaging, with clear plan for frontend migration.**

---

**Time Allocation**:
- Commands: 4 hours
- Frontend Analysis: 2 hours
- Testing: 1 hour
- Documentation: 1 hour

**Risk**: Frontend complexity might be higher than expected. Be prepared to extend timeline.

**Backup Plan**: If frontend is too complex, focus on getting commands 100% working with tests.