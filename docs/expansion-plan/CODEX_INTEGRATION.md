# Codex / Copilot CLI Integration Plan

## Objective
Enable Yume to interface with GitHub Copilot CLI (`gh copilot`).

## Authentication
Authentication is managed via `gh auth login`. Yume relies on the GitHub CLI being authenticated on the host machine.

## Integration Strategy

### Option A: `gh copilot` (Primary)
- Wrap `gh copilot` directly. 
- Use the adapter to parse the output.

## Recommendation: Option B (Yume Agent Shim)
Since `gh copilot` is a closed TUI, the most robust path is to use **`yume-cli`** with an OpenAI-compatible strategy.
1.  **Auth:** Use `gh auth token` or `$OPENAI_API_KEY`.
2.  **Engine:** Call GPT-4o / O1 via standard REST endpoints.
3.  **Agent:** `yume-cli` handles the file I/O and Bash execution.

This ensures Codex/OpenAI models behave exactly like Claude Code within Yume.

## Roadmap

1.  **Build `yume-cli`:** The core Shim binary.
2.  **Implement OpenAI Strategy:** Connect `yume-cli` to OpenAI/Azure endpoints.
3.  **Yume Adapter:** `adapters/shim.js` spawns `yume-cli --provider openai`.

## UI Considerations
- **Codex/Copilot** branding usually implies "Assistant" vs "Agent".
- If using `gh copilot`, it's more Q&A.
- The goal is to make it feel like a first-class agent within Yume's UI.
