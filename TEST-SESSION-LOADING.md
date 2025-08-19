# Test: Session Loading "Thinking..." Issue

## Problem
When loading an old session that Claude no longer has in storage, the UI gets stuck showing "thinking..." forever after sending a message.

## Expected Behavior
1. Load old session from ProjectsModal
2. Send a message
3. Claude returns "No conversation found with session ID"
4. Server sends a `result` message with `is_error: true`
5. Frontend receives the result message and clears the streaming/thinking state
6. User sees error message and can send another message

## Actual Behavior
Steps 1-4 work, but the frontend stays stuck in "thinking..." state.

## Test Script
The `test-session-loading.js` script simulates the exact flow:

### To Run the Test:

1. First, make sure yurucode is running (the app should be open)

2. Check the server port in the logs (look for "yurucode server running on port XXXXX")

3. Run the test with the port number:
   ```bash
   node test-session-loading.js 25336
   # or use npm script
   npm run test:session-loading 25336
   ```

4. The test will:
   - Connect to the server
   - Create a session with an old Claude session ID
   - Set up message listeners
   - Send a message (triggering resume attempt)
   - Wait for the error result message
   - Report if the message was received

## Interpreting Results

### ✅ Test PASSES (result message received)
- Server is correctly sending the error result message
- Issue is in frontend state management
- Check the store's message handler for `type: 'result'` with `is_error: true`

### ❌ Test FAILS (no result message)
- Server is not emitting the message properly
- Check socket.emit calls in logged_server.rs
- Verify channel names match

## Current Findings

From the server logs, we can see:
1. Server detects "No conversation found" ✅
2. Server emits error result message ✅
3. Socket is connected ✅
4. Channel name is correct ✅

But the frontend doesn't receive or process the message properly.

## Debugging Steps

1. **Check Browser Console**
   - Look for: `[Client] ✅ RESULT message received, stream complete`
   - If missing, message isn't reaching the client
   - If present, check store processing

2. **Check Store Logs**
   - Look for: `Received result message, clearing streaming state`
   - If missing, store isn't processing the message
   - Check conditions that might prevent processing

3. **Check Network Tab**
   - In browser DevTools, go to Network → WS
   - Find the Socket.IO connection
   - Look for messages on the `message:session-xxx` channel
   - Verify the result message is being sent

## Solution Attempts

1. ✅ Added unique IDs to error messages
2. ✅ Fixed stderr handling to send result messages
3. ✅ Fixed exit code 1 handling to send result messages
4. ✅ Added detailed logging to socket.emit calls
5. ⏳ Need to verify frontend message processing

## Next Steps

If the test script shows the message IS being sent but frontend still shows "thinking...":
1. Add console.log to frontend message handler
2. Check if there are conditions preventing the result message from clearing streaming
3. Verify the session ID matches between server and client
4. Check if message listener cleanup is being called prematurely