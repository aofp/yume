# Token Tracking Analysis

## Problem
The context % indicator in the UI shows only the tokens from the last request, not accumulating all messages from the conversation.

## Code Flow

### 1. Wrapper Integration (`wrapperIntegration.ts`)
Lines 143-159 show token accumulation:
```typescript
// Accumulate only NEW tokens
session.inputTokens += input;  // Line 143
session.outputTokens += output; // Line 144
...
session.totalTokens = session.inputTokens + session.outputTokens; // Line 159
```

The wrapper then attaches this to every message (line 205-230):
```typescript
processed.wrapper = {
  tokens: {
    total: session.totalTokens,  // CUMULATIVE value
    ...
  }
}
```

### 2. Store Processing (`claudeCodeStore.ts`)
Line 1197-1212 processes wrapper tokens:
```typescript
if (message.wrapper?.tokens) {
  analytics.tokens.total = message.wrapper.tokens.total; // ASSIGNMENT, not +=
}
```

Line 1487-1510 also does assignment:
```typescript
if (message.wrapper?.tokens) {
  analytics.tokens.total = message.wrapper.tokens.total; // ASSIGNMENT
}
```

Line 1563-1576 does accumulation (but only if NO wrapper):
```typescript
} else {
  analytics.tokens.total += (regularInputTokens + outputTokens); // ACCUMULATION
}
```

## Root Cause Hypothesis

The flow should work correctly IF:
1. Wrapper properly accumulates tokens ✅ (verified in wrapperIntegration.ts lines 143-159)
2. Wrapper state persists across messages ❓ (needs verification)
3. Store correctly uses wrapper's cumulative values ✅ (line 1800 saves analytics back)

**FOUND THE ISSUE**:

Line 159 in `wrapperIntegration.ts` calculates:
```typescript
session.totalTokens = session.inputTokens + session.outputTokens;
```

This is WRONG because it excludes `cacheReadTokens`.

However, the comment says `input_tokens` excludes cached content. So when prompt caching is active:
- `input_tokens` = only NEW input (not the cached conversation history)
- `cache_read_input_tokens` = the SIZE of cached history

The actual context window usage should be:
```
total = cacheRead + accumulated_new_input + accumulated_new_output
```

BUT the current code does:
```
total = accumulated_new_input + accumulated_new_output
```

This means we're MISSING the cached conversation history from the total!

## Fix Required

Line 159 in `wrapperIntegration.ts` should be:
```typescript
session.totalTokens = session.cacheReadTokens + session.inputTokens + session.outputTokens;
```

This will include:
- `cacheReadTokens`: The conversation history being reused
- `inputTokens`: New input tokens added (excluding cache)
- `outputTokens`: New output tokens generated

