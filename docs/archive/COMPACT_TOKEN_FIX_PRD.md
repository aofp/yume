# PRD: Fix Token Count Not Resetting After /compact

## Problem Statement

When users run the `/compact` command to compress conversation context, the token usage percentage displayed in the UI doesn't go back down. The conversation is successfully compacted (saves tokens), but the UI continues showing the pre-compact token count, making it appear that the compact didn't work.

## Current Behavior

1. User has conversation that accumulates tokens (e.g., 18,305 / 200,000 = 9%)
2. User runs `/compact` command
3. Backend successfully compacts the conversation and resets context
4. UI still shows 18,305 tokens (9%) instead of resetting to a lower number
5. Token count continues accumulating from the old high value

## Root Cause Analysis

The issue occurs because:

1. **Server Side**: When `/compact` is executed, Claude returns a result with `usage: { input_tokens: 0, output_tokens: 0 }` indicating the command itself used no tokens. The server incorrectly uses these zeros as the "new compacted token count" and sends them to the frontend.

2. **Wrapper Module**: The wrapper correctly detects compaction and resets its internal session tokens to 0, but this isn't properly communicated.

3. **Frontend Store**: Receives the compact system message with `compactedTokens: { input: 0, output: 0, total: 0 }` and resets to 0, but then subsequent messages don't properly calculate the new baseline.

4. **Missing Data**: After compact, we don't actually know the new compressed token count until the next message is sent to Claude.

## Expected Behavior

1. User runs `/compact` command
2. Token count in UI immediately resets to 0 or shows "~0" (pending)
3. On next message, token count updates to show actual compressed context size
4. Token percentage shows correct reduced value (e.g., from 9% down to 1%)

## Technical Solution

### 1. Server Changes (logged_server.rs)

- After compact, properly reset session token tracking
- Don't send misleading zero tokens as the "compacted count"
- Track that compact occurred and reset on next message

### 2. Frontend Changes (claudeCodeStore.ts)

- When compact system message received, reset tokens to 0
- Mark session as "post-compact" state
- On next result message, use the token count as the new baseline

### 3. All Server Types

- Ensure macOS, Windows, and Linux servers all handle compact consistently
- Test wrapper module integration across all platforms

## Implementation Steps

1. Fix server compact token emission
2. Update frontend token reset logic
3. Add proper post-compact token tracking
4. Test on all platforms

## Success Criteria

- Token count resets to 0 immediately after `/compact`
- Next message shows correct new baseline tokens
- Token percentage accurately reflects compressed context
- Works consistently across all server types (WSL, macOS, Linux)