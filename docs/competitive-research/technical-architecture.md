# Technical Architecture Analysis

*Deep dive into frameworks, performance, and implementation patterns*

## Desktop Framework Comparison

### Tauri vs Electron

| Aspect | Tauri | Electron |
|--------|-------|----------|
| **Language** | Rust + Web | Node.js + Chromium |
| **Bundle Size** | 3-10 MB | 100+ MB |
| **Memory (Idle)** | 30-50 MB | 150-300 MB |
| **Startup Time** | <500ms | 1-2s |
| **Market Share** | 35% YoY growth | 60% (declining) |
| **GPU Rendering** | Via system WebView | Chromium |

### Why Tauri Wins for Yume

1. **Performance**
   - 2x lower memory than Electron
   - Faster startup
   - Native feel

2. **Security**
   - Capability-based permissions
   - Everything disabled by default
   - Rust memory safety

3. **Size**
   - Users download <10MB vs 100MB+
   - Faster updates
   - Lower CDN costs

4. **Future**
   - Tauri 2.x: iOS/Android support
   - Growing community (17,700+ Discord)
   - Active development

### Tauri Considerations

**Challenges**:
- WebView inconsistency across OS
- Smaller ecosystem than Electron
- Rust learning curve for backend

**Mitigations**:
- Stick to standard web APIs
- Most logic in frontend (React)
- Rust only for native features

---

## TUI Framework Analysis (What We're Avoiding)

### React Ink Issues (Claude Code CLI)

> "Frameworks like Ink running on single-threaded environments suffer from massive performance degradation when history grows"

**Root causes**:
1. Full screen redraw on each update
2. Diff calculation scales with history
3. Terminal not designed for reactive UIs
4. Single-threaded Node.js bottleneck

**Symptoms**:
- 10+ second input delays
- Flickering
- Terminal state corruption
- IME input broken

### Why Desktop UI is Better

| Aspect | Terminal (Ink) | Desktop (React) |
|--------|----------------|-----------------|
| Rendering | ANSI escape codes | Native/GPU |
| Updates | Full redraw | Virtual DOM diff |
| Input | Stdin parsing | Native events |
| IME | Broken | Native OS support |
| Scrolling | Terminal buffer | Smooth scroll |

---

## Context Engine Approaches

### VectorDB/Embeddings (Cursor, Windsurf)

```
Code → Chunk → Embed → Vector Store → Semantic Search → Context
```

**Pros**:
- Semantic understanding
- Natural language queries
- Works across file types

**Cons**:
- Pre-indexing required
- Storage overhead
- Can miss exact matches

### Tree-sitter + ripgrep (Aider)

```
Code → Parse (Tree-sitter) → AST → Function/Class extraction
Query → ripgrep (exact) + fuzzy match → Relevant code
```

**Pros**:
- "Easily the best of the bunch"
- No pre-indexing
- Precise matches
- Faster for exact searches

**Cons**:
- Single-file context only
- No cross-file semantics
- Requires parser per language

### Hybrid Approach (Emerging)

```
Tree-sitter (structure) + Embeddings (semantics) + ripgrep (exact)
```

Best of all worlds, but complex to implement.

---

## Claude Code CLI Architecture

```
┌─────────────────────────────────────────────────┐
│                   Terminal                       │
├─────────────────────────────────────────────────┤
│              React Ink (TUI)                    │ ← Problem layer
├─────────────────────────────────────────────────┤
│              Node.js Runtime                     │
├─────────────────────────────────────────────────┤
│         Claude Agent SDK (TypeScript)           │
├─────────────────────────────────────────────────┤
│              Anthropic API                       │
└─────────────────────────────────────────────────┘
```

**Pain points**:
- React Ink: Rendering issues
- Terminal: Not designed for rich UI
- Single-threaded: Blocks on heavy operations

---

## Yume Architecture

```
┌─────────────────────────────────────────────────┐
│              Desktop Window (Native)             │
├─────────────────────────────────────────────────┤
│           React Frontend (WebView)               │ ← Proper rendering
├─────────────────────────────────────────────────┤
│            Tauri IPC Bridge (Rust)               │
├─────────────────────────────────────────────────┤
│         Embedded Node.js Server                  │
├─────────────────────────────────────────────────┤
│              Claude CLI Process                  │
├─────────────────────────────────────────────────┤
│              Anthropic API                       │
└─────────────────────────────────────────────────┘
```

**Advantages**:
- Native window: No terminal issues
- React in WebView: Proper rendering engine
- Tauri: Performance + security
- Compiled server binaries: Full CLI compatibility, no Node.js dependency

---

## Performance Benchmarks

### Response Time

| Tool | UI Response | Notes |
|------|-------------|-------|
| Zed | 58ms | Rust + GPU, gold standard |
| VS Code | 97ms | Electron, acceptable |
| Cursor | <100ms | Optimized Electron |
| Claude Code CLI | 100ms-10s | Degrades with history |
| **Yume Target** | <50ms | Tauri + optimized React |

### Memory Usage

| Tool | Idle | Active |
|------|------|--------|
| Zed | ~100 MB | 150-200 MB |
| VS Code | ~200 MB | 400+ MB |
| Cursor | ~250 MB | 500+ MB |
| Claude Code CLI | ~150 MB | 200-500 MB |
| **Yume Target** | <100 MB | <150 MB |

### Startup Time

| Tool | Cold Start | Warm Start |
|------|------------|------------|
| Zed | <500ms | <200ms |
| VS Code | 2-3s | 1s |
| Cursor | 2-4s | 1-2s |
| **Yume Target** | <500ms | <200ms |

---

## Implementation Recommendations

### Priority Optimizations

1. **Virtualized Lists**
   - Don't render all messages
   - Only visible + buffer
   - Critical for long sessions

2. **Debounced Input**
   - Batch rapid keystrokes
   - Prevent UI thrashing
   - Smooth typing experience

3. **Lazy Loading**
   - Load history on demand
   - Don't parse all sessions at startup
   - Progressive enhancement

4. **Web Workers**
   - Offload heavy computation
   - Keep UI thread free
   - Syntax highlighting, etc.

### Architecture Decisions

1. **Keep Claude CLI as subprocess**
   - Full compatibility
   - Easy updates
   - Proven stability

2. **Use Zustand for state**
   - Already in project
   - Fast, minimal
   - Easy debugging

3. **WebSocket for streaming**
   - Real-time updates
   - Low latency
   - Already implemented

4. **SQLite for persistence**
   - Fast local storage
   - Good for sessions
   - Tauri has bindings

---

## Future Technical Opportunities

### Tree-sitter Integration

```rust
// Rust (Tauri) side
use tree_sitter::Parser;

fn parse_file(path: &str) -> SyntaxTree {
    // Native parsing, fast
}
```

Benefits:
- Native performance
- Better context extraction
- Matches Aider's approach

### MCP Server

```javascript
// Embed MCP server
const server = new MCPServer({
  tools: [/* yume-specific tools */],
  resources: [/* file access, etc. */]
});
```

Benefits:
- Extensibility
- Integration with ecosystem
- Plugin system foundation

### GPU-Accelerated Rendering

If WebView not enough:
- Consider GPUI (Zed's framework)
- Direct GPU rendering
- 120 FPS possible

---

## Sources

- [Tauri vs Electron Comparison](https://www.raftlabs.com/blog/tauri-vs-electron-pros-cons/)
- [DoltHub - Electron vs Tauri](https://www.dolthub.com/blog/2025-11-13-electron-vs-tauri/)
- [Zed - Syntax-Aware Editing](https://zed.dev/blog/syntax-aware-editing)
- [CocoIndex - Tree-sitter Codebase Indexing](https://cocoindexio.substack.com/p/index-codebase-with-tree-sitter-and)
- [Peter Steinberger - The Signature Flicker](https://steipete.me/posts/2025/signature-flicker)
