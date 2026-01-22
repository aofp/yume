# System Prompt Strategy

This document defines how to construct system prompts for each provider, ensuring consistent behavior across Claude, Gemini, and OpenAI.

## Prompt Components

Every provider session needs these components:

1. **Identity & Role:** Define the assistant as a coding agent
2. **Tool Definitions:** Available tools with JSON schemas
3. **Working Directory Context:** Current project path
4. **Permission Mode Instructions:** Tool approval behavior
5. **Response Format Instructions:** Emit line-delimited JSON
6. **Project Context:** CLAUDE.md or similar project instructions

## Provider-Specific Formats

### Claude (Native CLI)

Claude CLI handles system prompts internally. Yume passes:
- Working directory via `--cwd`
- Permission mode via flags
- CLAUDE.md is auto-loaded by Claude CLI

No custom system prompt needed for native Claude.

### Gemini

Gemini requires explicit system prompt with tool definitions.

```
You are an AI coding assistant with access to the local filesystem and shell.

## Working Directory
{cwd}

## Permission Mode
{permissionMode}
- "auto": Execute tools immediately without confirmation
- "interactive": Pause and emit tool_use, wait for approval before executing
- "deny": Refuse tool execution, emit tool_result with is_error: true

## Available Tools
<tools>
{tool_definitions_json}
</tools>

## Response Format
You MUST respond with line-delimited JSON objects to stdout.
Each line is a complete JSON object with a "type" field.

Message types:
- {"type": "text", "text": "..."} - Text response chunks
- {"type": "tool_use", "id": "...", "name": "...", "input": {...}} - Tool invocation
- {"type": "thinking", "thinking": "..."} - Internal reasoning (optional)

When you need to use a tool, emit a tool_use message and STOP.
Wait for the tool_result before continuing.

## Project Instructions
{claude_md_content}
```

### OpenAI / Codex

OpenAI uses the `tools` parameter in API calls, not system prompt.
System prompt focuses on behavior and format:

```
You are an AI coding assistant with access to the local filesystem and shell.

Working directory: {cwd}
Permission mode: {permissionMode}

When using tools, call them via function calling. After each tool call, wait for the result before proceeding.

Respond conversationally for non-tool interactions.

{claude_md_content}
```

Tool definitions are passed via the `tools` API parameter with JSON schemas.

## Size Limits & Compression

| Provider | Max System Prompt | Strategy |
|----------|------------------|----------|
| Claude | ~200K tokens | Full CLAUDE.md included, no compression needed |
| Gemini | 32K characters | Compress tool defs, truncate CLAUDE.md if needed |
| OpenAI | 128K tokens | Tool defs separate, system prompt is smaller |

### Compression Strategies

When system prompt exceeds limits:

1. **Truncate CLAUDE.md:** Keep first 10K chars, add "[truncated]"
2. **Compress Tool Definitions:** Remove optional fields, use minimal descriptions
3. **Remove Examples:** Strip example usage from tool schemas
4. **Fallback:** Show warning, use minimal prompt

```typescript
function compressSystemPrompt(prompt: string, maxChars: number): string {
  if (prompt.length <= maxChars) return prompt;

  // Try truncating CLAUDE.md section first
  const claudeMdMatch = prompt.match(/## Project Instructions\n([\s\S]*)/);
  if (claudeMdMatch) {
    const before = prompt.slice(0, claudeMdMatch.index);
    const truncated = claudeMdMatch[1].slice(0, 10000) + '\n[truncated]';
    const result = before + '## Project Instructions\n' + truncated;
    if (result.length <= maxChars) return result;
  }

  // Hard truncate as last resort
  return prompt.slice(0, maxChars - 100) + '\n[system prompt truncated]';
}
```

## Tool Definition Format

All providers use Claude-compatible tool schemas for consistency.

```json
{
  "name": "Read",
  "description": "Read a file from the filesystem",
  "input_schema": {
    "type": "object",
    "properties": {
      "file_path": {
        "type": "string",
        "description": "Absolute path to the file to read"
      },
      "offset": {
        "type": "number",
        "description": "Line number to start reading from (optional)"
      },
      "limit": {
        "type": "number",
        "description": "Number of lines to read (optional)"
      }
    },
    "required": ["file_path"]
  }
}
```

### Provider-Specific Transformations

**Gemini:** Uses `functionDeclarations` format
```javascript
function toGeminiFunctionDeclaration(tool) {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.input_schema
  };
}
```

**OpenAI:** Uses `tools` format with `type: "function"`
```javascript
function toOpenAITool(tool) {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema
    }
  };
}
```

## CLAUDE.md Loading

For non-Claude providers, the shim must load project instructions manually:

```typescript
async function loadProjectContext(cwd: string): Promise<string> {
  const paths = [
    path.join(cwd, 'CLAUDE.md'),
    path.join(cwd, '.claude', 'CLAUDE.md'),
    path.join(cwd, 'claude.md'),
  ];

  for (const p of paths) {
    try {
      return await fs.readFile(p, 'utf-8');
    } catch {
      continue;
    }
  }

  return ''; // No project instructions found
}
```

## Dynamic Tool Advertising

Only advertise tools the shim can execute:

```typescript
const CORE_TOOLS = ['Read', 'Write', 'Edit', 'MultiEdit', 'Glob', 'Grep', 'LS', 'Bash'];
const EXTENDED_TOOLS = ['WebFetch', 'WebSearch', 'NotebookEdit'];
const TASK_TOOLS = ['Task', 'TaskOutput', 'TodoWrite'];

function getAdvertisedTools(capabilities: ShimCapabilities): Tool[] {
  const tools = [...CORE_TOOLS];

  if (capabilities.webAccess) {
    tools.push(...EXTENDED_TOOLS);
  }

  if (capabilities.subagents) {
    tools.push(...TASK_TOOLS);
  }

  return tools.map(name => TOOL_DEFINITIONS[name]);
}
```

## Permission Mode in Prompts

The system prompt must clearly explain permission behavior:

| Mode | Prompt Instruction |
|------|-------------------|
| `auto` | "Execute tools immediately. Do not wait for confirmation." |
| `interactive` | "Emit tool_use and pause. Wait for tool_result before continuing." |
| `deny` | "Do not execute tools. If a tool is needed, explain what you would do." |

## Testing System Prompts

Each provider prompt should be tested for:

1. **Tool invocation:** Model correctly emits tool_use
2. **Response format:** Output is valid line-delimited JSON
3. **Permission respect:** Model pauses in interactive mode
4. **Context awareness:** Model references project instructions
5. **Size limits:** Prompt fits within provider limits
