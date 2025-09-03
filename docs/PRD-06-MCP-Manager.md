# PRD-06: MCP Manager for yurucode

## Overview
Implement a Model Context Protocol (MCP) server manager in yurucode settings, enabling users to add, configure, and manage MCP servers that extend Claude's capabilities with custom tools and resources.

## Background
MCP (Model Context Protocol) allows Claude to interact with external services and tools through standardized server interfaces. Claudia already has a comprehensive MCP manager implementation that we'll adapt to yurucode's minimal design philosophy.

## Objectives
1. Provide a clean, minimal UI for managing MCP servers
2. Support both stdio and SSE transport protocols
3. Enable server testing and validation
4. Support different configuration scopes (local, project, user)
5. Allow import/export of MCP configurations
6. Maintain yurucode's ultra-minimal black OLED aesthetic

## Functional Requirements

### 1. MCP Tab in Settings Modal
- Add new "mcp" tab after "commands" tab
- Use existing TabButton component for consistency
- Label: "mcp" (lowercase to match style)

### 2. Server List View
Display configured MCP servers with:
- Server name
- Transport type indicator (stdio/sse)
- Scope indicator (local/project/user)
- Connection status (connected/disconnected/unknown)
- Actions: test connection, remove

UI Design:
```
mcp servers
[+ add server]                                    [import/export]

local servers
───────────────────────────────────────────────────────────────
○ filesystem     stdio    [test] [remove]
  command: npx @modelcontextprotocol/server-filesystem
  
○ github         sse      [test] [remove]  
  url: https://api.github.com/mcp

project servers  
───────────────────────────────────────────────────────────────
○ database       stdio    [test] [remove]
  command: python db_server.py
```

### 3. Add Server Interface
Support two transport types with different configuration:

#### STDIO Transport
- Server name (required)
- Command (required)
- Arguments (optional, space-separated)
- Environment variables (key-value pairs)
- Scope selection (local/project/user)

#### SSE Transport  
- Server name (required)
- URL (required)
- Environment variables (key-value pairs)
- Scope selection (local/project/user)

### 4. Import/Export Functionality
- Import from Claude Desktop configuration
- Import from JSON file
- Export current configuration to JSON
- Support bulk operations

### 5. Server Testing
- Test connection button for each server
- Show success/failure status
- Display available tools/resources when connected
- Error messages for failed connections

## Technical Implementation

### Backend (Tauri)

#### New Commands in `src-tauri/src/commands/mcp.rs`:
```rust
#[tauri::command]
pub async fn mcp_list() -> Result<Vec<MCPServer>, String>

#[tauri::command]
pub async fn mcp_add(
    name: String,
    transport: String,
    command: Option<String>,
    args: Vec<String>,
    env: HashMap<String, String>,
    url: Option<String>,
    scope: String
) -> Result<AddServerResult, String>

#[tauri::command]
pub async fn mcp_remove(name: String) -> Result<String, String>

#[tauri::command]
pub async fn mcp_test_connection(name: String) -> Result<String, String>

#[tauri::command]
pub async fn mcp_import_claude_desktop() -> Result<ImportResult, String>

#[tauri::command]
pub async fn mcp_export_config() -> Result<String, String>
```

#### Data Structures:
```rust
pub struct MCPServer {
    name: String,
    transport: String,  // "stdio" or "sse"
    command: Option<String>,
    args: Vec<String>,
    env: HashMap<String, String>,
    url: Option<String>,
    scope: String,  // "local", "project", "user"
    connected: bool,
}
```

#### Storage:
- Local scope: Store in app data directory
- Project scope: Store in `.mcp.json` in project root
- User scope: Store in user's home directory config

### Frontend Components

#### `/src/renderer/components/Settings/MCPTab.tsx`
Main tab component containing:
- Server list
- Add/edit forms
- Import/export buttons

#### `/src/renderer/services/mcpService.ts`
Service layer for MCP operations:
```typescript
interface MCPServer {
  name: string;
  transport: 'stdio' | 'sse';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  scope: 'local' | 'project' | 'user';
  connected?: boolean;
}

class MCPService {
  async listServers(): Promise<MCPServer[]>
  async addServer(server: MCPServer): Promise<void>
  async removeServer(name: string): Promise<void>
  async testConnection(name: string): Promise<boolean>
  async importFromClaudeDesktop(): Promise<number>
  async exportConfig(): Promise<string>
}
```

## UI/UX Design Principles

### Visual Style
- Match existing yurucode minimal aesthetic
- Black (#0a0a0a) background
- White/grey text hierarchy
- Accent color (#99bbff) for interactive elements
- Subtle borders (rgba(255, 255, 255, 0.1))
- Small, consistent spacing (4px, 8px, 12px)

### Component Styling
```css
/* Server item */
.mcp-server-item {
  padding: 8px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  margin-bottom: 4px;
}

/* Transport badge */
.mcp-transport-badge {
  font-size: 9px;
  padding: 2px 4px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 2px;
  color: var(--accent-color);
}

/* Action buttons */
.mcp-action-btn {
  background: transparent;
  border: none;
  color: #666;
  font-size: 10px;
  cursor: default;
  transition: color 0.2s;
}

.mcp-action-btn:hover {
  color: var(--accent-color);
}
```

### Interaction Patterns
- Default cursor for all buttons (not pointer)
- Hover states with color transitions
- Confirmation dialogs for destructive actions
- Inline error messages with red accent
- Success feedback with green accent

## Implementation Phases

### Phase 1: Core Infrastructure (Week 1)
1. Create backend Rust commands
2. Implement MCP configuration storage
3. Set up service layer in frontend
4. Create basic MCPTab component

### Phase 2: Server Management (Week 1-2)
1. Implement server list view
2. Add server creation forms (stdio/sse)
3. Implement remove functionality
4. Add scope selection

### Phase 3: Advanced Features (Week 2)
1. Connection testing
2. Import from Claude Desktop
3. Export configuration
4. Environment variable management

### Phase 4: Polish & Testing (Week 2-3)
1. Error handling and validation
2. Loading states and feedback
3. Integration testing
4. Documentation

## Success Metrics
1. Users can successfully add and connect to MCP servers
2. Connection testing provides clear feedback
3. Import/export functionality works seamlessly
4. UI maintains consistent yurucode aesthetic
5. No performance degradation in settings modal

## Risk Mitigation
1. **Compatibility**: Test with common MCP servers (filesystem, github, etc.)
2. **Security**: Validate commands and URLs before execution
3. **Performance**: Lazy load MCP tab content
4. **Error Handling**: Graceful fallbacks for connection failures

## Future Enhancements
1. Auto-discovery of available MCP servers
2. Server templates/presets for common configurations
3. Visual indication of active servers in main chat UI
4. Server health monitoring and auto-reconnect
5. Tool/resource preview for connected servers

## Acceptance Criteria
- [ ] MCP tab appears in settings modal after commands tab
- [ ] Users can add stdio and SSE servers
- [ ] Server list shows all configured servers grouped by scope
- [ ] Test connection provides clear success/failure feedback
- [ ] Import from Claude Desktop works if config exists
- [ ] Export generates valid JSON configuration
- [ ] Remove server shows confirmation and works correctly
- [ ] UI matches yurucode's minimal aesthetic
- [ ] All text is lowercase except where grammatically required
- [ ] Default cursor used throughout (no pointer cursor)