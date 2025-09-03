# yurucode performance optimization prd

## executive summary
yurucode has significant synchronous bottlenecks throughout startup, chat messaging, and project management pipelines. the architecture can be optimized for 2-5x performance gains without breaking existing functionality.

## identified bottlenecks

### 1. startup flow (macos)
- **5s blocking delay** in debug mode (src-tauri/src/lib.rs:83)
- **300ms blocking sleep** before window show (lib.rs:118)
- **synchronous port discovery** - checks ports sequentially instead of parallel
- **blocking window state restore** - uses block_on for async operations (lib.rs:104)
- **synchronous server spawn** - waits for server process instead of async monitoring
- **sequential health checks** - 10 retries at 1s intervals = up to 10s delay

### 2. chat pipeline
- **synchronous title generation** - blocks on separate claude process spawn
- **sequential tool execution** - tools run one at a time in embedded server
- **blocking file operations** - uses sync fs operations in nodejs server
- **synchronous message parsing** - claude session file parsing blocks event loop
- **process spawn mutex** - queues claude spawns instead of parallel execution
- **200ms artificial delay** between claude spawns (logged_server.rs:2184)

### 3. project management
- **synchronous directory scanning** - projects/sessions loaded sequentially
- **blocking localStorage operations** - ui freezes during project list updates
- **synchronous file stats** - each session file stat'd individually
- **sequential session loading** - loads sessions one by one

### 4. redundant operations
- **duplicate wsl user detection** - executes `whoami` multiple times per operation
- **repeated claude path discovery** - searches for claude binary on every spawn
- **multiple health checks** - both rust and js sides perform health checks
- **redundant port allocation** - both rust and js try to find ports

## optimization strategy

### phase 1: quick wins (1-2 days)
1. **remove artificial delays**
   - eliminate 5s debug wait
   - reduce window show delay to 50ms
   - remove 200ms claude spawn delay
   
2. **parallelize startup**
   - concurrent port discovery & health checks
   - async window state restore
   - parallel server spawn monitoring

3. **cache static data**
   - cache wsl username (changes rarely)
   - cache claude binary path
   - cache project directory stats

### phase 2: async refactor (3-5 days)
1. **async server operations**
   - convert all fs operations to async
   - use worker threads for heavy parsing
   - implement streaming session file reader
   
2. **parallel tool execution**
   - remove process spawn mutex
   - enable concurrent claude processes
   - implement proper process pool

3. **batch operations**
   - batch localStorage updates
   - combine multiple file stats into single operation
   - batch session loading

### phase 3: architecture improvements (1 week)
1. **connection pooling**
   - maintain warm claude process pool
   - reuse claude sessions where possible
   - implement process recycling

2. **lazy loading**
   - defer non-critical startup tasks
   - load projects on-demand
   - progressive session history loading

3. **caching layer**
   - implement lru cache for sessions
   - cache parsed claude responses
   - index session files for quick access

## implementation plan

### immediate optimizations (no breaking changes)
```typescript
// before: sequential port check
for (const port of ports) {
  if (await checkPort(port)) return port;
}

// after: parallel port check
const results = await Promise.all(
  ports.map(port => checkPort(port).then(ok => ({ port, ok })))
);
return results.find(r => r.ok)?.port;
```

```rust
// before: blocking window restore
tauri::async_runtime::block_on(async move {
    restore_window_state(&window_clone, &app_handle).await;
});

// after: async window restore
tauri::async_runtime::spawn(async move {
    restore_window_state(&window_clone, &app_handle).await;
});
```

### title generation optimization
```javascript
// before: blocking title generation
async function generateTitle(sessionId, userMessage, socket) {
  const child = spawn(CLAUDE_PATH, titleArgs);
  // blocks until complete
}

// after: fire-and-forget with callback
function generateTitleAsync(sessionId, userMessage, socket) {
  setImmediate(() => {
    const child = spawn(CLAUDE_PATH, titleArgs);
    // non-blocking
  });
}
```

## performance targets
- **startup time**: 5s → 1s (80% reduction)
- **first message latency**: 2s → 500ms (75% reduction)
- **project load time**: 1s → 200ms (80% reduction)
- **concurrent sessions**: 1 → 5+ (5x improvement)
- **title generation**: blocking → non-blocking (100ms perceived latency)

## risk mitigation
- all changes maintain backward compatibility
- phased rollout with feature flags
- comprehensive testing for race conditions
- fallback to sync operations if async fails
- maintain existing api contracts

## success metrics
- time to first interactive (ttfi)
- message round-trip time (rtt)
- concurrent session handling
- memory usage reduction
- cpu utilization optimization

## timeline
- **week 1**: implement phase 1 quick wins
- **week 2**: async refactor core operations
- **week 3**: architecture improvements
- **week 4**: testing & optimization