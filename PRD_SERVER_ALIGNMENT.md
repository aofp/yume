# Product Requirements Document: Server Flow Alignment

## Executive Summary
Align Windows and macOS server flows to ensure identical functionality while maintaining platform-specific optimizations. The macOS flow is currently working perfectly and should be the reference implementation.

## Current State Analysis

### macOS Server Flow (Reference Implementation)
1. **Server Type**: External file (`server-claude-macos.cjs`)
2. **Location**: 
   - Dev: Project root
   - Prod: `.app/Contents/Resources/resources/`
3. **Process Spawning**: Direct `node` command with proper NODE_PATH
4. **Console Handling**: Clean stdio piping
5. **Process Management**: Standard Unix signals
6. **Claude CLI**: Direct execution without wrapper

### Windows Server Flow (Needs Alignment)
1. **Server Type**: Embedded string in `logged_server.rs`
2. **Location**: Temp directory (`%TEMP%/yurucode-server/`)
3. **Process Spawning**: Complex with CREATE_NO_WINDOW flags
4. **Console Handling**: Special Windows process flags
5. **Process Management**: taskkill /F for termination
6. **Claude CLI**: WSL wrapper complexity

## Critical Differences Identified

### 1. Server Code Management
- **macOS**: External file, easy to debug/modify
- **Windows**: Embedded string literal, requires recompilation
- **Impact**: Development velocity, debugging capability

### 2. Process Creation Flags
- **macOS**: Standard spawn
- **Windows**: CREATE_NO_WINDOW | DETACHED_PROCESS
- **Impact**: Console visibility, process lifecycle

### 3. Claude CLI Execution
- **macOS**: Direct `claude` command
- **Windows**: WSL wrapping with PowerShell
- **Impact**: Performance, error handling

### 4. Path Resolution
- **macOS**: Simple relative paths
- **Windows**: Complex WSL path translation
- **Impact**: File access reliability

### 5. Session File Access
- **macOS**: Direct filesystem access
- **Windows**: WSL filesystem bridging
- **Impact**: Performance, error rates

## Server Functions Inventory

### Core Functions
1. **start_server(port)** - Initialize server process
2. **stop_server()** - Terminate server process
3. **check_health()** - Verify server responsiveness
4. **get_logs()** - Retrieve server logs
5. **clear_logs()** - Reset log files

### Claude CLI Functions
1. **execute_claude_command()** - Run Claude CLI
2. **parse_stream_json()** - Process Claude output
3. **handle_tool_use()** - Manage tool interactions
4. **track_tokens()** - Monitor usage statistics
5. **manage_sessions()** - Handle multiple sessions

### File System Functions
1. **list_projects()** - Enumerate Claude projects
2. **read_session()** - Load session data
3. **get_analytics()** - Extract usage metrics
4. **compact_conversation()** - Handle /compact command
5. **title_generation()** - Generate conversation titles

### WebSocket Functions
1. **handle_connection()** - New client connections
2. **emit_messages()** - Send data to frontend
3. **broadcast_updates()** - Multi-client sync
4. **manage_heartbeat()** - Connection keepalive
5. **cleanup_disconnected()** - Remove dead connections

## Implementation Plan

### Phase 1: Externalize Windows Server
1. Extract embedded server code to `server-claude-windows.cjs`
2. Update `logged_server.rs` to use external file
3. Implement same resource resolution as macOS
4. Test development and production builds

### Phase 2: Unify Process Management
1. Create platform-agnostic process spawning
2. Standardize stdout/stderr handling
3. Implement consistent logging across platforms
4. Align process termination methods

### Phase 3: Simplify Claude CLI Access
1. Detect native Windows Claude installation
2. Reduce WSL dependency where possible
3. Implement fallback chain: Native → WSL → Error
4. Optimize path resolution

### Phase 4: Harmonize File Access
1. Abstract filesystem operations
2. Handle WSL paths transparently
3. Implement caching for frequently accessed files
4. Standardize error handling

### Phase 5: Testing & Validation
1. Create platform-specific test suites
2. Verify all 20 server functions work identically
3. Performance benchmarking
4. Error recovery testing

## Success Metrics
- [ ] Both platforms use external server files
- [ ] Identical console output formatting
- [ ] Same error messages and codes
- [ ] Equal performance metrics (±10%)
- [ ] Unified debugging experience
- [ ] No platform-specific frontend code

## Risk Mitigation
1. **Backwards Compatibility**: Keep embedded server as fallback
2. **WSL Detection**: Graceful degradation if WSL unavailable
3. **Performance**: Cache WSL operations aggressively
4. **Security**: Maintain process isolation
5. **Updates**: Version lock server dependencies

## Timeline
- Phase 1: 2 hours (externalize server)
- Phase 2: 1 hour (process management)
- Phase 3: 2 hours (CLI access)
- Phase 4: 1 hour (file access)
- Phase 5: 1 hour (testing)
Total: ~7 hours

## Technical Decisions
1. Use `.cjs` extension for both platforms
2. Keep NODE_PATH resolution identical
3. Maintain platform-specific optimizations where beneficial
4. Prioritize correctness over micro-optimizations
5. Document all platform differences inline