# compact command fix v2

## the real issue
the `/compact` command in claude cli returns a new session id, but that session id is **not resumable**. trying to use `--resume` with the compact session id fails with "No conversation found".

## root cause
claude cli's `/compact` command:
1. summarizes the current conversation
2. returns a new session id in the result
3. but this session id is just metadata, not an actual resumable session

## the fix

### server (logged_server.rs)

1. **don't store compact session ids** (line 3100-3111)
   - detect if result is from `/compact` command
   - ignore the session_id from compact results
   - log that we're ignoring it

2. **clear session on compact** (line 3481-3489)
   - when compact completes, clear `session.claudeSessionId`
   - next message will start fresh conversation
   - compact summary is preserved in conversation context

3. **exclude session id from compact results** (line 3555-3570)
   - don't include session_id in result messages for compact
   - prevents frontend from trying to use invalid session id

### frontend (claudeCodeStore.ts)

1. **clear session on compact** (line 693-697)
   - when receiving compact system message
   - clear the claudeSessionId
   - maintains same tab/conversation visually

## how it works now

1. user types `/compact`
2. claude cli processes and returns summary
3. server detects compact result, ignores the session id
4. server clears session id, sends compact notification
5. frontend clears its session id reference
6. next message starts fresh with compacted context
7. no "session not found" errors

## key insight
`/compact` doesn't create a resumable session - it just summarizes. the next message after compact should start a new session, not try to resume.

## testing
1. send messages to build context
2. type `/compact`
3. see "context compacted" message
4. send another message
5. should work without errors
6. check logs for "Starting fresh conversation" after compact