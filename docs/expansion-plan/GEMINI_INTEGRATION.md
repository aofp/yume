# Gemini CLI Integration Plan

## Objective
Enable Yume to drive Google's Gemini models via a CLI interface.

## The "Gemini CLI"
1.  **Google Cloud SDK (`gcloud gemini ...`)**: The primary target. Uses system-level authentication.
2.  **Community CLIs**: Any CLI that follows the standard I/O protocol.

## Authentication
Yume will **NOT** ask for API keys. It will rely on the user having run `gcloud auth login` or equivalent. The `GeminiAdapter` will check for a valid session before starting.

## Adapter Specification: `GeminiAdapter`

### 1. Process Spawning
```javascript
spawn(prompt, context) {
  // Example using a hypothetical CLI
  const args = ['chat', '--model', 'gemini-1.5-pro', '--format', 'json'];
  if (context.history) {
    // Pass history file or context
  }
  return spawn('gemini', args);
}
```

### 2. Output Parsing
Gemini APIs often return streamed JSON chunks. The adapter must:
- Detect `content` blocks.
- Detect `functionCall` (tool use) blocks.
- Normalize them to Yume's `assistant`, `tool_use`, `result` types.

### 3. Context Management
Gemini 1.5 Pro has a massive context window (1M+ tokens).
- **Strategy:** We might not need the aggressive "compaction" logic used for Claude.
- **Config:** Allow disabling `auto-compact` for Gemini profiles.

## Feature Parity Analysis

| Feature | Claude | Gemini | Implementation Notes |
|---------|--------|--------|----------------------|
| Streaming | ✅ | ✅ | Standardize stream parsing. |
| Tool Use | ✅ | ✅ | Map Gemini Function Calls to Yume Tool UI. |
| File Access | Native | ? | If CLI doesn't support local FS, the Wrapper must implement `fs` tools. |
| Cost Tracking | ✅ | ✅ | distinct pricing model; update `token-tracking-analysis`. |

## Action Items
1.  **Develop `yume-cli`:** The Universal Shim that implements the Agent Loop and local tool execution.
2.  **Implement Gemini Strategy:** Add a `GeminiStrategy` to `yume-cli` that calls the Google Generative AI API using the token from `gcloud auth print-access-token`.
3.  **Integrate:** Write `adapters/shim.js` in Yume to spawn `yume-cli --provider gemini`.
