# yurucode compact command PRD

## overview
implement `/compact` command to compress conversation context using claude cli's native compact feature, reducing token usage while preserving conversation continuity.

## problem statement
- long conversations hit token limits, causing "context full" warnings
- users lose conversation history when forced to clear context
- manual summarization is tedious and breaks flow
- current `/compact` implementation doesn't properly handle session transitions

## solution
leverage claude cli's built-in `/compact` command which:
1. summarizes conversation into compressed context
2. creates new session with reduced tokens
3. maintains conversation continuity

## technical requirements

### server-side (logged_server.rs)
1. **detect compact command**
   - check if message === '/compact'
   - force sonnet model for efficiency (already implemented)
   
2. **handle compact response**
   - claude cli returns new session id after compact
   - detect compact completion (empty result or "Compacted" in response)
   - update session mapping with new claude session id
   - emit compact event to frontend

3. **session transition**
   - preserve frontend session id (don't change tabs)
   - update internal claudeSessionId to new compacted session
   - ensure --resume uses new session id for next messages

### frontend (claudeCodeStore.ts)
1. **ui feedback**
   - show "compacting..." indicator during process
   - display success message when complete
   - update token count display with new reduced count

2. **session management**
   - keep same tab/session active
   - update internal claudeSessionId reference
   - preserve message history display

3. **error handling**
   - handle compact failures gracefully
   - show clear error messages
   - allow retry or manual clear

## user flow
1. user sees "context getting full" warning
2. clicks "compact" button or types `/compact`
3. system shows "compacting context..." indicator
4. claude cli processes compact command with sonnet
5. new compressed session created
6. token count updates to show reduction
7. user continues conversation seamlessly

## success metrics
- token usage reduced by 60-80% after compact
- zero session interruption (same tab, continuous chat)
- compact completes in < 10 seconds
- no message history lost visually

## implementation phases
1. fix server compact detection and session update
2. add proper compact result handling
3. update frontend token tracking
4. add ui indicators and feedback
5. test with various conversation lengths

## edge cases
- compact during streaming response
- multiple rapid compact commands
- compact with empty conversation
- network interruption during compact
- session not found errors post-compact