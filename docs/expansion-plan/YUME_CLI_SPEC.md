# Yume CLI (`yume-cli`) Technical Specification

## Overview
`yume-cli` is a standalone Node.js executable that acts as a **universal agent shim**. It bridges the gap between Yume's GUI (which expects a specific JSON streaming protocol) and various LLM providers (Gemini, OpenAI, Local LLMs) that lack native, stateful CLI agents.

## Architecture

### 1. Core Loop (The "Brain")
The CLI runs a continuous **Think-Act-Observe** loop until the model indicates completion.

```typescript
while (true) {
  // 1. THINK: Send history + tools to Model
  const response = await model.generate(history, tools);
  
  // 2. PARSE: Stream response to stdout (Yume GUI)
  // If text: emit 'assistant' event
  // If tool_call: emit 'tool_use' event
  
  if (response.isText) {
    history.push({ role: 'assistant', content: response.text });
    break; // Done
  }
  
  if (response.isToolCall) {
    // 3. ACT: Execute tool locally
    const result = await tools.execute(response.toolName, response.args);
    
    // 4. OBSERVE: Stream result to stdout (Yume GUI)
    emit('tool_result', result);
    
    // 5. UPDATE: Add to history
    history.push({ role: 'assistant', tool_calls: ... });
    history.push({ role: 'tool', content: result });
    
    // Loop continues...
  }
}
```

### 2. Tool Definitions
To match Claude Code features, `yume-cli` must implement these exact schemas.

#### `Edit` (File Modification)
*   **Description:** "Replace a string in a file with a new string."
*   **Schema:**
    *   `path` (string): Relative path to file.
    *   `old_string` (string): Exact content to replace.
    *   `new_string` (string): New content.
*   **Implementation:** Read file, `content.replace(old, new)`, write file. **Critical:** Must support fuzzy matching if the model is slightly off (optional advanced feature).

#### `Write` (File Creation/Overwrite)
*   **Description:** "Write full content to a file."
*   **Schema:**
    *   `path` (string): Relative path.
    *   `content` (string): Full file content.

#### `Bash` (Command Execution)
*   **Description:** "Run a shell command."
*   **Schema:**
    *   `command` (string): The command to run.
*   **Implementation:** `child_process.spawn`. Must capture `stdout` and `stderr`.
*   **Safety:** Check for "yume-guard" or user approval config.

#### `Glob` (File Search)
*   **Description:** "Find files matching a pattern."
*   **Schema:**
    *   `pattern` (string): Glob pattern (e.g., `src/**/*.ts`).

### 3. Provider Strategies
The CLI accepts a `--provider` flag to switch strategies.

#### Gemini Strategy
*   **Auth:** `exec('gcloud auth print-access-token')`.
*   **API:** `https://generativelanguage.googleapis.com/v1beta/models/...:generateContent`
*   **Quirks:** Handles `functionCall` vs `functionResponse`.

#### OpenAI Strategy
*   **Auth:** `process.env.OPENAI_API_KEY`.
*   **API:** `https://api.openai.com/v1/chat/completions`
*   **Quirks:** Buffers `tool_calls` chunks until valid JSON.

### 4. Output Protocol (Stdout)
Strict adherence to `claude-code` stream format.

*   `{"type": "assistant", "message": { "content": "..." }, "streaming": true}`
*   `{"type": "tool_use", "message": { "name": "Edit", "input": {...}, "id": "..." }}`
*   `{"type": "tool_result", "message": { "tool_use_id": "...", "content": "..." }}`
*   `{"type": "result", "usage": { ... }}`

## CLI Interface

```bash
yume-cli start \
  --provider <gemini|openai|anthropic> \
  --model <model_name> \
  --cwd <working_directory> \
  [--verbose]
```

## Error Handling
*   **Auth Failure:** Emit `{"type": "system", "subtype": "error", "message": "Auth failed..."}`.
*   **Tool Error:** Emit `tool_result` with `is_error: true`.
