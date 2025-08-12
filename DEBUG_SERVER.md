# Debug Info for Server Not Starting

## Check These Files After Running app.exe:

1. **`%TEMP%\yurucode-server-started.txt`**
   - If this exists, server DID start
   - Contains the PID

2. **`%TEMP%\yurucode-server.log`** 
   - Server spawner logs
   - Shows what paths were tried

3. **`%TEMP%\yurucode-fallback\`**
   - Fallback server location
   - Check if minimal-server.js exists

## What the exe SHOULD do:

1. `simple_server.rs` tries these paths:
   - `server-claude-direct.cjs`
   - `src-tauri/resources/server-simple.cjs`
   - `resources/server-simple.cjs`
   - `../server-claude-direct.cjs`
   - `../../server-claude-direct.cjs`

2. If all fail, creates minimal server in temp

## Quick Test:

Run this from where app.exe is located:
```
node ..\..\..\..\server-claude-direct.cjs
```

If that works, the server exists but exe can't find it.

## The Fix:

The exe needs to look for the server relative to where IT is located, not where it was built.