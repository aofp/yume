# Protocol Normalization Strategy

## Objective
To ensure Yume's GUI works seamlessly across providers (Claude, Gemini, OpenAI, Copilot), all CLI output must be normalized into the **Yume Protocol** before reaching the frontend.

## 1. The Yume Protocol (Target)
This is the strict JSON streaming format Yume's frontend expects.

### Message Types
1.  **Assistant (Text):** `{ "type": "assistant", "message": { "content": "Hello" }, "streaming": true }`
2.  **Tool Use (Request):** `{ "type": "tool_use", "message": { "name": "Edit", "input": {...}, "id": "call_1" } }`
3.  **Tool Result (Response):** `{ "type": "tool_result", "message": { "tool_use_id": "call_1", "content": "..." } }`
4.  **Result (Usage):** `{ "type": "result", "usage": { ... } }`

---

## 2. Gemini Normalization (Type A: Shim-as-Agent)

### Source
Google Generative AI API (REST/gRPC).

### Mapping
*   **Content:** Stream `parts.text` -> `assistant` chunks.
*   **Tools:** The API returns a `functionCall`.
    *   **Shim Action:** The Shim receives this, *pauses* the stream, emits `tool_use`, executes the function locally (e.g. `fs.writeFileSync`), and then emits `tool_result` once done. The GUI sees the standard flow.
*   **IDs:** Gemini might not provide unique IDs for every call. Shim generates synthetic IDs (`call_gemini_<timestamp>`) to satisfy Yume's strict ID requirement.

---

## 3. GitHub Copilot Normalization (Type B: Shim-as-Driver)

### Source
`gh copilot` CLI TUI (Terminal User Interface).

### Mapping Challenges
The output is unstructured text with ANSI color codes.
*   **"Suggestion":** Text asking "Shall I run this command?".
*   **"Action":** The command itself (e.g., `npm test`).

### Heuristic Mapping
*   **Detection:** Regex match prompt patterns like `? Execute command?` or `Suggested command:`.
*   **Transformation:** 
    1.  Shim detects a suggested command.
    2.  Shim constructs a synthetic `tool_use` event: `{ name: "Bash", input: { command: "npm test" } }`.
    3.  Shim pauses PTY, waits for Yume GUI "Approve".
    4.  Yume User clicks "Run".
    5.  Shim writes `\n` (Enter) or `y` to the PTY.
    6.  Shim captures the subsequent output as `tool_result`.

---

## 4. OpenAI Normalization (Type A: Shim-as-Agent)

### Source
OpenAI Chat Completions API (Streaming).

### Mapping
*   **Tool Calls:** OpenAI streams tool arguments as partial JSON strings (`delta.tool_calls[0].function.arguments = "{"`).
    *   **Shim Action:** Buffer these chunks invisibly. DO NOT emit `tool_use` until the full JSON object is valid. Yume's frontend expects complete input objects, not partial streams for arguments.
*   **Parallel Tools:** OpenAI supports multiple tool calls in one turn.
    *   **Shim Action:** Queue them. Emit multiple `tool_use` events in sequence.

## 5. Universal Shim Implementation

The `yume-cli` package will use a Strategy Pattern:

```typescript
interface AgentStrategy {
  start(): Promise<void>;
  sendMessage(content: string): Promise<void>;
}

class GeminiStrategy implements AgentStrategy { /* Type A logic */ }
class CopilotStrategy implements AgentStrategy { /* Type B logic (PTY) */ }
```

The specific adapter is chosen based on the `Provider` setting in Yume.

```