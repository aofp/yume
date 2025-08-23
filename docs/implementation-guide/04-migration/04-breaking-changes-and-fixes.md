# Breaking Changes and Migration Fixes

## Critical Breaking Changes

### 1. Complete Removal of Socket.IO

**Breaking Change:**
All WebSocket communication via Socket.IO is removed.

**Impact:**
- Frontend can no longer connect to `ws://localhost:${port}`
- All `socket.emit()` and `socket.on()` calls will fail
- Reconnection logic no longer works

**Fix:**
```typescript
// OLD CODE TO REMOVE
import { io } from 'socket.io-client';
const socket = io(`ws://localhost:${port}`);
socket.emit('claude_message', data);
socket.on('claude_response', handler);

// NEW CODE TO ADD
import { invoke, listen } from '@tauri-apps/api';
await invoke('send_claude_message', data);
await listen('claude_stream', handler);
```

**Migration Steps:**
1. Uninstall socket.io-client: `npm uninstall socket.io-client`
2. Find all imports of 'socket.io-client' and replace
3. Replace all socket.emit() with invoke()
4. Replace all socket.on() with listen()

### 2. Server Port Configuration Removed

**Breaking Change:**
No more dynamic port allocation (60000-61000 range).

**Impact:**
- `CLAUDE_SERVER_PORT` environment variable ignored
- Port configuration in settings removed
- No port conflicts to manage

**Fix:**
```typescript
// OLD CODE
const port = await findAvailablePort(60000, 61000);
const client = new ClaudeClient(port);

// NEW CODE
const client = new ClaudeClient(); // No port needed
```

### 3. Health Check System Removed

**Breaking Change:**
No more periodic health checks via WebSocket.

**Impact:**
- 5-second health check intervals gone
- Server status monitoring different

**Fix:**
```rust
// NEW: Process monitoring via PID
impl ProcessRegistry {
    pub async fn is_alive(&self, session_id: &str) -> bool {
        if let Some(proc) = self.processes.read().await.get(session_id) {
            // Check if process is still running
            proc.child.id().is_some()
        } else {
            false
        }
    }
}
```

### 4. Message Format Changes

**Breaking Change:**
Message structure changed from Socket.IO format to Tauri event format.

**OLD Format:**
```javascript
{
    type: 'claude_message',
    data: {
        content: 'message',
        sessionId: 'abc123',
        timestamp: 1234567890
    }
}
```

**NEW Format:**
```rust
{
    prompt: "message",
    session_id: Some("abc123")
}
```

**Fix:**
```typescript
// Update all message constructors
// OLD
const message = {
    content: text,
    sessionId: id,
    timestamp: Date.now()
};

// NEW
const message = {
    prompt: text,
    sessionId: id  // Note: snake_case in Rust, camelCase in TS
};
```

### 5. Session Management Changes

**Breaking Change:**
Sessions now managed in Rust, not JavaScript.

**Impact:**
- Can't directly access session Map
- Session persistence different
- No session timeout logic

**Fix:**
```typescript
// OLD: Direct session access
const session = sessions.get(sessionId);
session.lastActivity = Date.now();

// NEW: Via Tauri commands
const sessionInfo = await invoke('get_session_info', { sessionId });
```

### 6. Embedded Server Removal

**Breaking Change:**
`EMBEDDED_SERVER` constant completely removed from logged_server.rs.

**Impact:**
- No temp file at `/tmp/yurucode-server/server.cjs`
- No Node.js process spawned
- Server logs different location

**Fix:**
```rust
// Remove all references to embedded server
// DELETE: src-tauri/src/logged_server.rs (entire file)
// ADD: src-tauri/src/claude_direct/*.rs (new modules)
```

### 7. Build Process Changes

**Breaking Change:**
Server bundling step removed from build.

**Impact:**
- `npm run bundle:server` command fails
- No `resources/server.cjs` in build output
- Build scripts need update

**Fix:**
```json
// package.json
{
  "scripts": {
    // REMOVE
    "bundle:server": "node scripts/bundle-macos-server.js",
    "prebuild": "npm run bundle:server",
    
    // KEEP
    "build": "tsc && vite build",
    "tauri:build": "tauri build"
  }
}
```

### 8. Environment Variable Changes

**Breaking Change:**
Several environment variables no longer used.

**Removed Variables:**
- `CLAUDE_SERVER_PORT`
- `CLAUDE_SERVER_HOST`
- `NODE_ENV` (for server)
- `SERVER_LOG_LEVEL`

**Fix:**
```bash
# Clean up .env files
# Remove unused variables
# Update CI/CD configurations
```

### 9. Error Event Changes

**Breaking Change:**
Error events now come through Tauri, not Socket.IO.

**OLD Error Handling:**
```javascript
socket.on('error', (error) => {
    console.error('Socket error:', error);
});

socket.on('claude_error', (data) => {
    handleClaudeError(data);
});
```

**NEW Error Handling:**
```typescript
try {
    await invoke('send_claude_message', data);
} catch (error) {
    // Error is thrown directly
    handleError(error);
}

// Also listen for error events
await listen('claude_error', (event) => {
    handleClaudeError(event.payload);
});
```

### 10. Store State Shape Changes

**Breaking Change:**
Zustand store structure changed.

**OLD State:**
```typescript
interface StoreState {
    socket: Socket | null;
    serverPort: number;
    serverStatus: 'connecting' | 'connected' | 'disconnected';
    reconnectAttempts: number;
}
```

**NEW State:**
```typescript
interface StoreState {
    // socket removed
    // serverPort removed
    // serverStatus removed
    // reconnectAttempts removed
    streaming: boolean;
    currentSessionId: string | null;
}
```

**Fix:**
```typescript
// Update all store accessors
// OLD
const { socket, serverPort } = useStore();

// NEW
const { streaming, currentSessionId } = useStore();
```

## Component-Level Breaking Changes

### ChatInput Component

**Breaking Change:**
Send mechanism completely different.

**Fix:**
```tsx
// OLD
const handleSend = () => {
    socket.emit('claude_message', {
        content: input,
        sessionId
    });
    setInput('');
};

// NEW
const handleSend = async () => {
    try {
        await invoke('send_claude_message', {
            prompt: input,
            sessionId
        });
        setInput('');
    } catch (error) {
        console.error('Send failed:', error);
    }
};
```

### MessageList Component

**Breaking Change:**
Message listening mechanism changed.

**Fix:**
```tsx
// OLD
useEffect(() => {
    socket.on('claude_response', handleMessage);
    return () => socket.off('claude_response', handleMessage);
}, []);

// NEW
useEffect(() => {
    let unlisten: (() => void) | undefined;
    
    const setupListener = async () => {
        unlisten = await listen('claude_stream', handleMessage);
    };
    
    setupListener();
    
    return () => unlisten?.();
}, []);
```

### SessionManager Component

**Breaking Change:**
Session lifecycle management changed.

**Fix:**
```tsx
// OLD
const stopSession = (id: string) => {
    socket.emit('claude_stop', { sessionId: id });
};

// NEW
const stopSession = async (id: string) => {
    await invoke('stop_claude_session', { sessionId: id });
};
```

## API Breaking Changes

### Tauri Commands (New API)

**New Commands to Implement:**
```rust
#[tauri::command]
async fn send_claude_message(
    prompt: String,
    session_id: Option<String>
) -> Result<String, String>

#[tauri::command]
async fn stop_claude_session(
    session_id: String
) -> Result<(), String>

#[tauri::command]
async fn get_session_info(
    session_id: String
) -> Result<SessionInfo, String>

#[tauri::command]
async fn clear_all_sessions() -> Result<(), String>
```

### Event Names (Changed)

| Old Event | New Event | Notes |
|-----------|-----------|-------|
| `claude_message` | (command) `send_claude_message` | Now a command, not event |
| `claude_response` | `claude_stream` | Emitted from Rust |
| `claude_error` | `claude_error` | Same name, different source |
| `claude_stop` | (command) `stop_claude_session` | Now a command |
| `health_check` | (removed) | No longer needed |
| `server_ready` | (removed) | No server to wait for |

## Configuration Breaking Changes

### Tauri Configuration

**File:** `src-tauri/tauri.conf.json`

**Remove:**
```json
{
  "bundle": {
    "resources": ["resources/server.cjs"]
  }
}
```

**Add:**
```json
{
  "tauri": {
    "allowlist": {
      "all": false,
      "event": {
        "all": true
      }
    }
  }
}
```

### TypeScript Configuration

**File:** `tsconfig.json`

**Update paths:**
```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      // REMOVE: "@server/*": ["./server/*"]
    }
  }
}
```

## Testing Breaking Changes

### Unit Tests

**OLD Test Pattern:**
```javascript
describe('Socket communication', () => {
    let mockSocket;
    
    beforeEach(() => {
        mockSocket = new MockSocket();
    });
    
    test('sends message', () => {
        mockSocket.emit('claude_message', data);
        expect(mockSocket.sent).toContain('claude_message');
    });
});
```

**NEW Test Pattern:**
```typescript
describe('Tauri communication', () => {
    beforeEach(() => {
        vi.mock('@tauri-apps/api', () => ({
            invoke: vi.fn(),
            listen: vi.fn()
        }));
    });
    
    test('sends message', async () => {
        await invoke('send_claude_message', data);
        expect(invoke).toHaveBeenCalledWith('send_claude_message', data);
    });
});
```

### E2E Tests

**Breaking Change:**
Can't mock WebSocket server anymore.

**Fix:**
```typescript
// Use Tauri's mock capabilities
import { mockIPC } from '@tauri-apps/api/mocks';

mockIPC((cmd, args) => {
    if (cmd === 'send_claude_message') {
        return 'mock-session-id';
    }
});
```

## Migration Checklist

### Phase 1: Preparation
- [ ] Create feature branch
- [ ] Backup current codebase
- [ ] Document current API usage
- [ ] List all Socket.IO event handlers
- [ ] Identify all server dependencies

### Phase 2: Backend Migration
- [ ] Remove embedded server from logged_server.rs
- [ ] Implement claude_direct modules
- [ ] Add Tauri commands
- [ ] Set up event emitters
- [ ] Test Rust compilation

### Phase 3: Frontend Migration
- [ ] Remove socket.io-client dependency
- [ ] Update all imports
- [ ] Replace socket.emit() calls
- [ ] Replace socket.on() listeners
- [ ] Update store implementation
- [ ] Fix TypeScript types

### Phase 4: Testing
- [ ] Update unit tests
- [ ] Update integration tests
- [ ] Update E2E tests
- [ ] Manual testing on all platforms
- [ ] Performance benchmarking

### Phase 5: Cleanup
- [ ] Remove old server files
- [ ] Update documentation
- [ ] Clean up package.json
- [ ] Update CI/CD pipelines
- [ ] Remove unused environment variables

## Rollback Strategy

If migration fails, use feature flags:

```rust
// Cargo.toml
[features]
default = ["direct-cli"]
legacy-server = []
direct-cli = []

// main.rs
#[cfg(feature = "legacy-server")]
mod logged_server;

#[cfg(feature = "direct-cli")]
mod claude_direct;
```

Build with legacy:
```bash
cargo build --features legacy-server
```

## Common Migration Errors

### Error 1: "Cannot find module 'socket.io-client'"
**Fix:** Complete frontend migration, remove all Socket.IO imports

### Error 2: "invoke is not defined"
**Fix:** Import from '@tauri-apps/api': `import { invoke } from '@tauri-apps/api';`

### Error 3: "Session not found"
**Fix:** Ensure session ID is properly passed and stored

### Error 4: "Command send_claude_message not found"
**Fix:** Register command in main.rs: `.invoke_handler(tauri::generate_handler![send_claude_message])`

### Error 5: "Cannot spawn Claude process"
**Fix:** Check Claude CLI is installed and in PATH

## Support Resources

- Migration guide: `/docs/implementation-guide/04-migration/`
- Rust async book: https://rust-lang.github.io/async-book/
- Tauri docs: https://tauri.app/v1/guides/
- Example implementation: `/docs/implementation-guide/03-process-control/07-complete-implementation-example.md`