# Shim Architecture: The "Yume Agent" (`yume-cli`)

## Strategic Decision: Build vs. Buy
We have evaluated existing CLI agents (`aider`, `open-interpreter`, `gh copilot`) as potential backends.
*   **Existing Tools:** Great for standalone use, but lack a strict, machine-readable streaming protocol. Wrapping them leads to "screen scraping" fragility (breaking on UI updates).
*   **Decision:** We will build a **Custom Universal Shim (`yume-cli`)**.
*   **Inspiration:** We borrow the *architecture* of `open-interpreter` (local tool loop) but implement the *protocol* of `claude-code`.

## The Yume Agent (`yume-cli`)
A lightweight Node.js binary bundled with Yume. It is **NOT** an SDK, but a standalone CLI that drives other models.

### Core Responsibilities
1.  **Protocol Compliance:** Outputs the exact Claude stream-json format Yume expects (`system`, `text`, `tool_use`, `tool_result`, `usage`, `result`).
2.  **The "Agent Loop":** Implements the *Think → Act → Observe* loop that stateless CLIs (`gcloud`) lack.
3.  **Authentication Bridge:** Uses system CLIs for auth (e.g., `gcloud auth print-access-token`), ensuring no API keys are stored in Yume.
4.  **Translation Layer:** Normalizes provider output into Claude-compatible stream-json (line-delimited JSON objects with a `type` field).
    - Required types: `system`, `text`, `tool_use`, `tool_result`, `usage`, `result`.
    - Output to stdout only; debug logs to stderr.

## Protocol Contract (Non-Negotiable)
Yume's backend already parses Claude stream-json. The shim must **match that protocol** so the rest of the stack stays unchanged. See `docs/expansion-plan/PROTOCOL_NORMALIZATION.md` for the canonical schema and message examples.

## Tool Execution & Approval Flow
- Current sessions use `permissionMode: "default"`.
- `permissionMode` governs whether tools run automatically or require approval (planned for shim).
- In interactive mode, the shim must pause tool execution until the UI approves.
- If a tool is denied, emit `tool_result` with `is_error: true` and a clear message.
- Tool names should align with UI expectations (see `src/renderer/config/tools.ts` and `src/renderer/components/Chat/MessageRenderer.tsx`).

## Architecture

```
[ Yume GUI ]
    ^
    | (JSON Stream via stdout)
    v
[ Yume Agent (yume-cli) ]
    |
    +--- [ 1. Auth Strategy ]
    |      |
    |      +--- Gemini: exec(`gcloud auth print-access-token`)
    |      +--- OpenAI: env($OPENAI_API_KEY)
    |      +--- Copilot: exec(`gh auth token`)
    |
    +--- [ 2. Tool Strategy ]
    |      |
    |      +--- Core tools: `Read`, `Write`, `Edit`, `MultiEdit`, `Glob`, `Grep`, `LS`, `Bash`
    |      +--- Optional: `WebFetch`, `WebSearch`, `NotebookEdit`, `Task`, `TaskOutput`, `TodoWrite`, `Skill`, `LSP`, `KillShell`
    |      +--- Executes them locally (fs.*, child_process)
    |
    +--- [ 3. Model Strategy ] (Pluggable)
           |
           +--- Gemini Adapter (Rest API)
           +--- OpenAI Adapter (Rest API)
           +--- Anthropic Adapter (Rest API - fallback if native CLI missing)
```

## "Type A" Implementation (Gemini/OpenAI)
**The Gold Standard.** We treat the provider as a raw intelligence engine. `yume-cli` handles the body.

1.  **Input:** User prompts "Refactor app.tsx".
2.  **Prompt Engineering:** `yume-cli` constructs a system prompt defining tools (`<tool_definition>...`).
3.  **Loop:**
    *   **Call 1:** Model returns `{"tool": "Edit", "input": {"file_path": "app.tsx", "old_string": "foo", "new_string": "bar"}}`.
    *   **Shim:**
        1.  Emits `tool_use` event to GUI.
        2.  Executes file write.
        3.  Emits `tool_result` event to GUI.
        4.  Sends result back to Model.
    *   **Call 2:** Model returns "Refactor complete."
    *   **Shim:** Emits `text` event chunks.

## "Type B" Implementation (Copilot/Closed Sources)
**The Fallback.** Used only when raw API access is impossible (e.g., `gh copilot` CLI features not in API).
*   We will **avoid** this if possible due to fragility.
*   *Correction:* Recent research suggests `gh copilot` is too limited (no file editing). We will likely prioritize a "Type A" integration using generic OpenAI/Azure endpoints if available, or omit Copilot "Agent" features in favor of a generic "OpenAI" provider that users can point to any compatible endpoint (including local LLMs).

## Why this is the Best Approach
1.  **Stability:** We own the "Agent Loop." We aren't relying on `gcloud`'s beta agent features changing.
2.  **Speed:** No PTY overhead. Direct HTTP/stdio streaming.
3.  **Security:** We respect the "No API Key" rule by leveraging the user's authenticated environment.
4.  **Compatibility:** Claude-compatible stream-json keeps Tauri + frontend code intact across providers.

## Cross-Platform Notes
- Use native path separators when executing tools.
- Avoid shell-specific quoting; pass argv arrays when possible.
- Emit UTF-8 JSON only (sanitize invalid bytes).
