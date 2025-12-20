# Claude Code 2.0 - Unimplemented Features in Yurucode

## Overview
This document lists features available in Claude Code 2.0 that haven't been fully implemented in Yurucode GUI yet. These represent opportunities to make Yurucode the best UI for Claude Code.

## ✅ Implemented Features
- Model selection (now includes Sonnet 4.5)
- Session management (create, resume, continue)
- Message streaming
- Token analytics
- Cost tracking
- Auto-title generation
- Working directory management
- Interrupt functionality

## 🚀 Features to Implement

### 1. Advanced Model Features
- **Fallback Model** (`--fallback-model`)
  - Automatically switch to a backup model when the primary model is overloaded
  - Especially useful with `--print` mode for automation

### 2. Permission and Security Modes
- **Permission Modes** (`--permission-mode`)
  - `acceptEdits`: Auto-accept file edits
  - `bypassPermissions`: Skip all permission checks
  - `plan`: Plan-only mode
  - Currently only using `default` mode

- **Dangerously Skip Permissions** (`--dangerously-skip-permissions`)
  - Bypass all permission checks for sandboxed environments

### 3. Tool Control
- **Allowed Tools** (`--allowed-tools`)
  - Whitelist specific tools Claude can use
  - Pattern matching support (e.g., "Bash(git:*) Edit")

- **Disallowed Tools** (`--disallowed-tools`)
  - Blacklist specific tools
  - Pattern matching support

### 4. MCP (Model Context Protocol) Integration
- **MCP Config** (`--mcp-config`)
  - Load MCP servers from JSON files or strings
  - Support for multiple MCP server configurations

- **Strict MCP Config** (`--strict-mcp-config`)
  - Use only explicitly configured MCP servers

- **MCP Management** (`mcp` command)
  - Configure and manage MCP servers through UI

### 5. Session Features
- **Fork Session** (`--fork-session`)
  - Create a new session ID when resuming instead of reusing the original
  - Useful for creating conversation branches

- **Custom Session ID** (`--session-id`)
  - Specify exact UUID for session tracking
  - Better control over session management

### 6. System Prompt Customization
- **Append System Prompt** (`--append-system-prompt`)
  - Add custom instructions to the default system prompt
  - Allow users to customize Claude's behavior per session

### 7. Directory Management
- **Add Directories** (`--add-dir`)
  - Dynamically add directories to tool access scope
  - Multiple directory support

### 8. IDE Integration
- **Auto-connect to IDE** (`--ide`)
  - Automatically connect to IDE on startup
  - Support for multiple IDE types

### 9. Custom Agents
- **Agent Configuration** (`--agents`)
  - Define custom agents with specific prompts and descriptions
  - JSON-based agent configuration

### 10. Settings Management
- **Settings File** (`--settings`)
  - Load settings from JSON file or inline JSON
  - Override default configurations

- **Setting Sources** (`--setting-sources`)
  - Control which setting sources to load (user, project, local)
  - Granular configuration control

### 11. Output Formats
- **JSON Output** (`--output-format json`)
  - Structured JSON output for programmatic use

- **Stream JSON** (`--output-format stream-json`)
  - Real-time streaming JSON output

- **Input Format** (`--input-format stream-json`)
  - Accept streaming JSON input for automation

### 12. Debugging Features
- **Debug Mode** (`--debug [filter]`)
  - Category-based debug filtering
  - Exclude specific debug categories with `!`

- **Verbose Mode** (`--verbose`)
  - Override verbose settings from config

### 13. Utility Commands
- **Doctor Command** (`doctor`)
  - Check health of Claude Code auto-updater
  - Diagnostic information display

- **Update Command** (`update`)
  - Check for and install updates
  - Version management UI

- **Setup Token** (`setup-token`)
  - Configure long-lived authentication tokens
  - Better session persistence

### 14. Advanced Streaming Features
- **Include Partial Messages** (`--include-partial-messages`)
  - Show partial message chunks in real-time
  - Better streaming UX

- **Replay User Messages** (`--replay-user-messages`)
  - Re-emit user messages for acknowledgment
  - Better conversation flow control

## 🎯 Priority Recommendations

### High Priority (Core UX)
1. **Permission Modes UI** - Add dropdown for permission modes
2. **System Prompt Editor** - Allow custom system prompts
3. **Tool Allowlist/Denylist** - Security and control
4. **MCP Server Management** - Extend Claude's capabilities
5. **Fork Session** - Conversation branching

### Medium Priority (Advanced Features)
1. **Custom Agents** - Power user feature
2. **Settings Management** - Import/export configurations
3. **Debug Mode Toggle** - Developer features
4. **IDE Integration** - Connect to VS Code, etc.
5. **Directory Scope Management** - Dynamic directory access

### Low Priority (Nice to Have)
1. **JSON Output Mode** - For automation
2. **Doctor Command** - Health checks
3. **Update Management** - Auto-update UI
4. **Token Setup** - Long-lived auth
5. **Verbose Mode Toggle** - Extra logging

## Implementation Notes

### UI/UX Considerations
- Keep the interface clean despite adding features
- Use collapsible panels for advanced options
- Add tooltips explaining each feature
- Provide sensible defaults
- Save user preferences

### Technical Considerations
- Update `logged_server.rs` to pass additional CLI flags
- Extend Tauri commands to handle new parameters
- Update Zustand store for new settings
- Add persistent settings storage
- Ensure backward compatibility

## Conclusion
Implementing these features would make Yurucode a comprehensive GUI that exposes all of Claude Code 2.0's capabilities while maintaining an intuitive user experience. The priority should be on features that enhance the core coding workflow and provide better control over Claude's behavior.