# Token Tracking Fix Summary

## Problem
The UI was showing "0 tokens" despite tokens being used. The issue was that Rust wasn't properly extracting token data from Claude's JSON output.

## Root Cause
Claude sends token usage data nested inside `result` and `assistant` messages like this:
```json
{
  "type": "result",
  "result": "...",
  "usage": {
    "input_tokens": 6,
    "output_tokens": 4,
    "cache_creation_input_tokens": 87,
    "cache_read_input_tokens": 14523
  }
}
```

But the Rust parser was looking for messages with `"type": "usage"` which don't exist.

## Solution
1. **Fixed Rust token extraction** (`src-tauri/src/stream_parser.rs`):
   - Modified `process_line()` to extract usage data from ANY message that contains a `usage` field
   - Accumulate tokens directly when found
   - Added comprehensive logging

2. **Added token emission** (`src-tauri/src/claude_spawner.rs`):
   - Emit `claude-tokens` events when usage data is found
   - Emit both during streaming and at session completion
   - Include all token types (input, output, cache_creation, cache_read)

3. **Updated frontend listener** (`src/renderer/services/tauriClaudeClient.ts`):
   - Listen for `claude-tokens` events from Rust
   - Transform token data to match expected format
   - Process through wrapper for UI updates

## Testing
After rebuilding and restarting the app, the token tracking should now work:
1. Send a message to Claude
2. Check the console for "Token usage" and "Emitting token update" logs
3. UI should show actual token percentages instead of 0%

## Files Modified
- `src-tauri/src/stream_parser.rs` - Fixed token extraction from nested usage field
- `src-tauri/src/claude_spawner.rs` - Added token event emission
- `src/renderer/services/tauriClaudeClient.ts` - Added listener for Rust token events