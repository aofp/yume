# Memory V2 System

Per-project persistent memory with markdown storage and MCP integration.

## Overview

Memory V2 replaces the legacy MCP-based memory system with:
- **Per-project storage**: Organized by project path hash
- **Markdown format**: Human-readable, editable files
- **TTL support**: Automatic expiration based on importance
- **Custom MCP server**: Agent writes directly to V2 files
- **Cross-tab sync**: Event broadcasting via Tauri events

## Storage Structure

```
~/.yume/memory/
├── global/
│   ├── preferences.md    # User preferences across all projects
│   └── patterns.md       # Global coding patterns
└── projects/
    └── {hash}-{basename}/
        ├── meta.json     # Project path metadata (for recovery)
        ├── brief.md      # Project overview (plain text, no entry format)
        ├── learnings.md  # Project-specific learnings
        ├── errors.md     # Error → solution mappings
        └── patterns.md   # Project patterns
```

**Project ID format**: `{8-char-hash}-{basename}`
- Hash: djb2 hash of full path (8 hex chars)
- Basename: Last path component (max 20 chars)

Context is built dynamically via `memory_v2_build_context` (no `context.md` file).

## Entry Format

```markdown
# Learnings

## 2026-01-28T10:00:00Z | importance:4 | ttl:90 | id:abc123
Uses Zustand for state management with persist middleware.

## 2026-01-28T09:00:00Z | importance:3 | ttl:30 | id:def456
Prefer functional components over class components.
```

### Importance Levels

| Level | TTL (days) | Use Case |
|-------|------------|----------|
| 1     | 1          | Ephemeral notes |
| 2     | 7          | Short-term context |
| 3     | 30         | Normal learnings |
| 4     | 90         | Important patterns |
| 5     | permanent  | Critical knowledge |

## MCP Server

Custom MCP server replaces npm `@modelcontextprotocol/server-memory`.

- **Source**: `src-tauri/resources/yume-mcp-memory.cjs`
- **Runtime**: Copied to `~/.yume/yume-mcp-memory.cjs` on init
- **Registration**: `claude mcp add -s user memory -- node ~/.yume/yume-mcp-memory.cjs`

### Tools

| Tool | Description |
|------|-------------|
| `add_observations` | Add memories to knowledge base |
| `search_nodes` | Search memories by query |
| `read_graph` | Read all memories |

### add_observations Example

```json
{
  "observations": [
    {
      "entityName": "project:current",
      "contents": ["Uses TypeScript with strict mode"]
    }
  ]
}
```

**Entity routing**:
- `project:*` or path → Project-specific file
- Contains "error" → `errors.md`
- Contains "pattern" → `patterns.md`
- Default → `learnings.md` (project) or `preferences.md` (global)

## Tauri Commands (15)

| Command | Description |
|---------|-------------|
| `memory_v2_init` | Initialize service, migrate V1 |
| `memory_v2_add_learning` | Add learning (project_path, content, importance) |
| `memory_v2_add_error` | Add error fix (project_path, error_desc, solution, importance) |
| `memory_v2_add_pattern` | Add pattern (project_path, pattern_name, description, importance) |
| `memory_v2_set_brief` | Set project brief (project_path, brief) |
| `memory_v2_add_preference` | Add global preference (content, importance) |
| `memory_v2_add_global_pattern` | Add global pattern (pattern_name, description, importance) |
| `memory_v2_get_project` | Get project memories (project_path) |
| `memory_v2_get_global` | Get global memories |
| `memory_v2_list_projects` | List all projects with memory |
| `memory_v2_build_context` | Build context block (project_path, query, token_budget) |
| `memory_v2_delete_entry` | Delete entry (project_path or null for global, entry_id) |
| `memory_v2_prune_expired` | Remove expired entries |
| `memory_v2_clear_project` | Clear project memories (project_path) |
| `memory_v2_get_base_path` | Get base storage path

## Context Injection

Memories are injected into system prompt via `<yume-memory>` block. The `build_context` command takes a `query` parameter to filter relevant memories:

```
<yume-memory project="7e2aaa07-yume">
## brief
This project uses Tauri 2.x with React 19...

## learnings
- Uses Zustand for state management
- Prefers functional components

## recent errors
- Error: X → Solution: Y

## preferences
- Prefers TypeScript strict mode
</yume-memory>
```

**Token budget**: Default 2000 tokens, configurable via `token_budget` parameter.

The context includes:
1. **Project brief** (always, up to 200 tokens)
2. **Relevant learnings** (filtered by query, sorted by importance, max 5)
3. **Recent errors** (if query matches error keywords, max 3)
4. **Global preferences** (sorted by importance, max 3)

## Migration from V1

On first `memory_v2_init`:
1. Check for `~/.yume/memory.jsonl`
2. Parse JSON lines format
3. Convert to V2 markdown entries
4. Write to appropriate files
5. Backup original to `memory.jsonl.bak`

## UI (MemoryTab)

Settings → Memory tab displays:
- **Global**: Preferences and patterns
- **Current project**: Brief, learnings, errors, patterns
- **All projects**: Expandable list with entry counts

Features: Add entries (with importance), delete entries, view timestamps/TTL. Edit in place is planned.

## Architecture

Two write paths, one storage:

```
┌─────────────────────────────────────────────────────────────┐
│  Agent (Claude CLI)          UI (MemoryTab)                 │
│         ↓                          ↓                        │
│  MCP (JSON-RPC/stdio)      Tauri IPC (invoke)               │
│         ↓                          ↓                        │
│  yume-mcp-memory.cjs       memory_v2.rs (Rust)              │
│         ↓                          ↓                        │
│         └──────────┬───────────────┘                        │
│                    ↓                                        │
│         ~/.yume/memory/*.md (atomic writes)                 │
│                    ↓                                        │
│         memory-updated event → all tabs                     │
└─────────────────────────────────────────────────────────────┘
```

**Cross-tab sync**: `memory-updated` Tauri event broadcasts changes with project ID payload.

**Rust service** (`memory_v2.rs`): Centralized state with RwLock, atomic file writes (write to `.tmp`, then rename).

**Frontend service** (`memoryServiceV2.ts`):
- Event subscription via `onMemoryUpdated(projectId, callback)`
- High-level operations (`extractLearnings`, `getRelevantMemories`, `remember`)
- Automatic pruning on startup

## File Atomicity

All writes use atomic rename: write to `{file}.md.tmp`, then rename to `{file}.md`. Prevents corruption on crash.

## V1 Deprecation

V1 (`@modelcontextprotocol/server-memory`) is fully deprecated:
- Existing data (`~/.yume/memory.jsonl`) auto-migrates to V2 on first init
- Backup created at `memory.jsonl.bak`
- Legacy `memory_add_observations` command no-ops (returns success for compatibility)
