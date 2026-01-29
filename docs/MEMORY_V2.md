# Memory V2 System

Per-project persistent memory with markdown storage and MCP integration.

## Overview

Memory V2 replaces the legacy MCP-based memory system with:
- **Per-project storage**: Organized by project path hash
- **Markdown format**: Human-readable, editable files
- **TTL support**: Automatic expiration based on importance
- **Custom MCP server**: Agent writes directly to V2 files

## Storage Structure

```
~/.yume/memory/
├── global/
│   ├── preferences.md    # User preferences across all projects
│   └── patterns.md       # Global coding patterns
└── projects/
    └── {hash}-{basename}/
        ├── brief.md      # Project overview (plain text, no entry format)
        ├── learnings.md  # Project-specific learnings
        ├── errors.md     # Error → solution mappings
        └── patterns.md   # Project patterns
```

**Project ID format**: `{8-char-hash}-{basename}`
- Hash: djb2 hash of full path (8 hex chars)
- Basename: Last path component (max 20 chars)

**Note:** The `context.md` file mentioned in code comments is not actually used. The context block is built dynamically via `memory_v2_build_context`.

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

Custom MCP server (`yume-mcp-memory.cjs`) replaces npm `@modelcontextprotocol/server-memory`.

### Registration

```bash
claude mcp add -s user memory -- node ~/.yume/yume-mcp-memory.cjs
```

### Tools

| Tool | Description |
|------|-------------|
| `add_observations` | Add memories to knowledge base |
| `search_nodes` | Search memories by query |
| `read_graph` | Read all memories |

### add_observations

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

### Initialization
- `memory_v2_init` - Initialize service, migrate V1

### Adding Entries
- `memory_v2_add_learning(project_path, content, importance)` - Add learning
- `memory_v2_add_error(project_path, error_desc, solution, importance)` - Add error fix
- `memory_v2_add_pattern(project_path, pattern_name, description, importance)` - Add pattern
- `memory_v2_set_brief(project_path, brief)` - Set project brief
- `memory_v2_add_preference(content, importance)` - Add global preference
- `memory_v2_add_global_pattern(pattern_name, description, importance)` - Add global pattern

### Reading
- `memory_v2_get_project(project_path)` - Get project memories
- `memory_v2_get_global()` - Get global memories
- `memory_v2_list_projects()` - List all projects
- `memory_v2_build_context(project_path, query, token_budget)` - Build context block

### Management
- `memory_v2_delete_entry(project_path, entry_id)` - Delete entry (project_path can be null for global)
- `memory_v2_prune_expired()` - Remove expired entries
- `memory_v2_clear_project(project_path)` - Clear project memories
- `memory_v2_get_base_path()` - Get base storage path

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

Settings → Memory tab shows:
- **Global section**: Preferences, patterns
- **Current project**: Learnings, errors, patterns, brief
- **All projects**: Expandable list

Features:
- Add entries with importance selection
- Delete entries
- Edit in place (future)
- View entry timestamps and TTL

## Architecture

```
Agent (Claude CLI)
    ↓ MCP protocol (JSON-RPC/stdio)
yume-mcp-memory.cjs
    ↓ Direct file I/O
~/.yume/memory/*.md

UI (MemoryTab) / memoryServiceV2.ts
    ↓ Tauri IPC (invoke)
memory_v2.rs (Rust)
    ↓ RwLock state, atomic writes
~/.yume/memory/*.md
    ↓ memory-updated event
UI (all tabs notified)
```

**Cross-tab sync**: `memory-updated` Tauri event broadcasts changes with project ID payload.

**Frontend service**: `memoryServiceV2.ts` wraps all Tauri commands and provides:
- Event subscription via `onMemoryUpdated(projectId, callback)`
- High-level operations (`extractLearnings`, `getRelevantMemories`, `remember`)
- Automatic pruning on startup

## File Atomicity

All writes use atomic rename:
1. Write to `{file}.tmp`
2. Rename to `{file}`

Prevents corruption on crash.

## Deprecation

V1 (`@modelcontextprotocol/server-memory`) is deprecated:
- No longer registered as MCP server
- `memory_add_observations` command returns success but no-ops
- Existing V1 data auto-migrates to V2
