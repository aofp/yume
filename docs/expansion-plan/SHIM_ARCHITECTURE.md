# Shim Architecture: The "Yume Agent" (`yume-cli`)

## Strategic Decision: Build vs. Buy
We have evaluated existing CLI agents (`aider`, `open-interpreter`, `gh copilot`) as potential backends.
*   **Existing Tools:** Great for standalone use, but lack a strict, machine-readable streaming protocol. Wrapping them leads to "screen scraping" fragility (breaking on UI updates).
*   **Decision:** We will build a **Custom Universal Shim (`yume-cli`)**.
*   **Inspiration:** We borrow the *architecture* of `open-interpreter` (local tool loop) but implement the *protocol* of `claude-code`.

## The Yume Agent (`yume-cli`)
A lightweight Node.js binary bundled with Yume. It is **NOT** an SDK, but a standalone CLI that drives other models.

### Core Responsibilities
1.  **Protocol Compliance:** Outputs the exact `stream-json` format Yume expects (Assistant, ToolUse, ToolResult, Result).
2.  **The "Agent Loop":** Implements the *Think → Act → Observe* loop that stateless CLIs (`gcloud`) lack.
3.  **Authentication Bridge:** Uses system CLIs for auth (e.g., `gcloud auth print-access-token`), ensuring no API keys are stored in Yume.

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
    |      +--- Defines standard tools: `Edit`, `Bash`, `Glob`
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
    *   **Call 1:** Model returns `{"tool": "Edit", "path": "app.tsx"}`.
    *   **Shim:**
        1.  Emits `tool_use` event to GUI.
        2.  Executes file write.
        3.  Emits `tool_result` event to GUI.
        4.  Sends result back to Model.
    *   **Call 2:** Model returns "Refactor complete."
    *   **Shim:** Emits `assistant` text event.

## "Type B" Implementation (Copilot/Closed Sources)
**The Fallback.** Used only when raw API access is impossible (e.g., `gh copilot` CLI features not in API).
*   We will **avoid** this if possible due to fragility.
*   *Correction:* Recent research suggests `gh copilot` is too limited (no file editing). We will likely prioritize a "Type A" integration using generic OpenAI/Azure endpoints if available, or omit Copilot "Agent" features in favor of a generic "OpenAI" provider that users can point to any compatible endpoint (including local LLMs).

## Why this is the Best Approach
1.  **Stability:** We own the "Agent Loop." We aren't relying on `gcloud`'s beta agent features changing.
2.  **Speed:** No PTY overhead. Direct HTTP/stdio streaming.
3.  **Security:** We respect the "No API Key" rule by leveraging the user's authenticated environment.
