# Day 1 Implementation Plan - ProcessRegistry Foundation

## 🎯 Objective
Implement the ProcessRegistry system from claudia to manage Claude processes and prevent orphans.

## 📋 Pre-Implementation Checklist

### Environment Preparation
- [ ] Create git checkpoint before starting
- [ ] Verify Rust development environment
- [ ] Confirm yurucode builds successfully
- [ ] Document current memory usage baseline

### Code Analysis
- [x] Studied claudia's ProcessRegistry implementation
- [x] Identified critical patterns (immediate registration, Drop trait)
- [x] Understood thread-safety requirements (Arc<Mutex<>>)
- [ ] Located integration points in yurucode

## 🔨 Implementation Tasks

### Morning Session (4 hours)

#### Task 1: Create Module Structure (30 min)
1. Create `src-tauri/src/process/` directory
2. Create `src-tauri/src/process/mod.rs`
3. Create `src-tauri/src/process/registry.rs`
4. Add module declaration to `src-tauri/src/lib.rs` or `main.rs`

#### Task 2: Port Core Types (1 hour)
```rust
// Port from claudia with modifications:
- ProcessType enum (ClaudeSession only for now)
- ProcessInfo struct
- ProcessHandle struct
- ProcessRegistry struct
- ProcessRegistryState wrapper
```

#### Task 3: Implement Registration Methods (1.5 hours)
```rust
// Critical methods to implement:
- new() - Constructor
- generate_id() - Unique ID generation
- register_claude_session() - IMMEDIATE registration
- register_process_internal() - Internal helper
```

#### Task 4: Thread Safety Implementation (1 hour)
```rust
// Ensure proper Arc<Mutex<>> usage:
- processes: Arc<Mutex<HashMap<i64, ProcessHandle>>>
- next_id: Arc<Mutex<i64>>
- child: Arc<Mutex<Option<Child>>>
- live_output: Arc<Mutex<String>>
```

### Afternoon Session (4 hours)

#### Task 5: Implement Drop Trait (1 hour)
```rust
impl Drop for ProcessHandle {
    fn drop(&mut self) {
        // CRITICAL: Kill process on drop to prevent orphans
        if let Ok(mut child) = self.child.lock() {
            if let Some(mut c) = child.take() {
                let _ = c.kill();
                log::info!("Killed process {} on drop", self.pid);
            }
        }
    }
}
```

#### Task 6: Process Termination Methods (1.5 hours)
```rust
// Implement platform-specific kill logic:
- kill_process() - Graceful shutdown with timeout
- kill_process_by_pid() - System command fallback
- Windows: taskkill /F /PID
- Unix: SIGTERM → wait 2s → SIGKILL
```

#### Task 7: Utility Methods (1 hour)
```rust
// Support methods:
- get_running_claude_sessions()
- get_claude_session_by_id()
- unregister_process()
- is_process_running()
- append_live_output()
- get_live_output()
```

#### Task 8: Testing & Verification (30 min)
- Unit test for process registration
- Test Drop trait triggers on scope exit
- Verify no orphaned processes
- Check memory is freed

## 📊 Success Criteria

### Must Complete Today
- [x] ProcessRegistry compiles without errors
- [ ] Drop trait implemented and tested
- [ ] Platform-specific kill logic works
- [ ] Can register and track processes
- [ ] No orphaned processes on exit

### Nice to Have
- [ ] Full unit test coverage
- [ ] Integration with main.rs
- [ ] Live output tracking
- [ ] Cleanup task for finished processes

## 🚨 Critical Implementation Points

### 1. IMMEDIATE Registration Pattern
```rust
// CORRECT - Always registered
let child = spawn_claude()?;
registry.register(child); // IMMEDIATELY!
let session_id = extract_id(child).await?;

// WRONG - Can orphan process
let child = spawn_claude()?;
let session_id = extract_id(child).await?; // Could fail!
registry.register(child); // Too late!
```

### 2. Drop Trait is MANDATORY
Without Drop trait, processes become orphans when:
- App crashes
- Tab closes
- User exits app
- Panic occurs

### 3. Platform Kill Commands
```bash
# Windows
taskkill /F /PID [pid]

# macOS/Linux
kill -TERM [pid]  # Graceful
sleep 2
kill -KILL [pid]  # Force if still running
```

## 📝 Code Template

```rust
// src-tauri/src/process/registry.rs
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::process::Child;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ProcessType {
    ClaudeSession { session_id: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessInfo {
    pub run_id: i64,
    pub process_type: ProcessType,
    pub pid: u32,
    pub started_at: DateTime<Utc>,
    pub project_path: String,
    pub task: String,
    pub model: String,
}

pub struct ProcessHandle {
    pub info: ProcessInfo,
    pub child: Arc<Mutex<Option<Child>>>,
    pub live_output: Arc<Mutex<String>>,
}

impl Drop for ProcessHandle {
    fn drop(&mut self) {
        // CRITICAL: Implement process cleanup
    }
}

pub struct ProcessRegistry {
    processes: Arc<Mutex<HashMap<i64, ProcessHandle>>>,
    next_id: Arc<Mutex<i64>>,
}

impl ProcessRegistry {
    pub fn new() -> Self {
        Self {
            processes: Arc::new(Mutex::new(HashMap::new())),
            next_id: Arc::new(Mutex::new(1000000)),
        }
    }
    
    // Implement remaining methods...
}
```

## 🔍 Testing Plan

### Unit Tests
```rust
#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_process_registration() {
        let registry = ProcessRegistry::new();
        // Test registration
    }
    
    #[test]
    fn test_drop_kills_process() {
        // Verify Drop trait works
    }
    
    #[test]
    fn test_platform_kill_commands() {
        // Test kill logic
    }
}
```

### Manual Testing
1. Start yurucode
2. Send a message to Claude
3. Verify process registered in registry
4. Close tab → Verify process killed
5. Exit app → Verify all processes killed
6. Check `ps aux | grep claude` shows no orphans

## 📚 Reference Files
- Source: `/claudia/src-tauri/src/process/registry.rs`
- Integration: `src-tauri/src/main.rs`
- State Management: Add to Tauri state

## ⚠️ Common Pitfalls to Avoid

1. **Forgetting Drop trait** - Causes orphaned processes
2. **Late registration** - Process runs without tracking
3. **Wrong mutex usage** - Deadlocks or panics
4. **Platform assumptions** - Test both Windows and Unix
5. **Memory leaks** - Not clearing finished processes

## 📈 Progress Tracking

### Time Allocation
- Module setup: 30 min
- Core implementation: 3 hours
- Drop trait: 1 hour
- Kill logic: 1.5 hours
- Testing: 2 hours

### Completion Markers
- [ ] Module created and compiles
- [ ] Types match claudia pattern
- [ ] Registration works
- [ ] Drop trait tested
- [ ] Kill commands verified
- [ ] No orphaned processes
- [ ] Memory properly freed
- [ ] Git checkpoint created

## 🎯 Definition of Done

The ProcessRegistry is complete when:
1. ✅ All code compiles without warnings
2. ✅ Drop trait kills processes on cleanup
3. ✅ Platform-specific kill commands work
4. ✅ No orphaned processes after app exit
5. ✅ Unit tests pass
6. ✅ Manual testing successful
7. ✅ Documentation updated
8. ✅ Git commit with descriptive message

---

**Note**: This is the FOUNDATION. Without proper process management, everything else fails. Take time to get it right!