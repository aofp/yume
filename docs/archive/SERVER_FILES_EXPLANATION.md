# YURUCODE SERVER FILES EXPLANATION

## Overview
yurucode has multiple server files that may confuse AI agents. Only ONE is actually used depending on the platform.

## ⚠️ CRITICAL: THE ACTUAL SERVER

### Windows/Linux: EMBEDDED in `logged_server.rs`
- **Location**: `src-tauri/src/logged_server.rs` starting at line ~124
- **Identifier**: Look for `const EMBEDDED_SERVER: &str = r#"`
- **How it works**: The JavaScript server code is embedded as a string constant in Rust
- **Runtime**: Extracted to `/tmp/yurucode-server/server.cjs` at runtime
- **To edit**: Edit the JavaScript code INSIDE `logged_server.rs`, NOT standalone .js files

### macOS: `server-claude-macos.js`
- **Location**: Root directory `server-claude-macos.js`
- **How it works**: Runs directly as a separate file
- **Not embedded**: This is the only platform that uses a standalone .js file

## ❌ DECOY FILES (NOT USED)

These files exist but are NOT the actual running server:

1. **`server.js`** - Old server file, not used anymore
2. **`server-claude-windows.js`** - Old Windows server, replaced by embedded version
3. **`server-claude-direct.cjs`** - Experimental version, not in use
4. **`server-simple.cjs`** - Test version, not in use
5. **Files in `src-tauri/resources/`** - Build artifacts, not source files
6. **Files in `src-tauri/target/`** - Build outputs, not source files

## How to Identify Which Server is Running

The embedded server now logs clear identification:
```
════════════════════════════════════════════════════════════════════
🔴 YURUCODE SERVER: EMBEDDED IN logged_server.rs (Windows/Linux)
🔴 This is NOT server-claude-macos.js or server.js
🔴 Edit code at: src-tauri/src/logged_server.rs line ~124
🔴 After editing: Restart Tauri dev server for changes to take effect
════════════════════════════════════════════════════════════════════
```

## Platform Detection

### Windows
```
════════════════════════════════════════════════════════════════════
🔍 PLATFORM: Windows detected
🔍 CLAUDE EXECUTION: Will run through WSL (Windows Subsystem for Linux)
🔍 PATH DETECTION: Automatic WSL user and Claude path detection enabled
════════════════════════════════════════════════════════════════════
```

- Claude CLI runs through WSL
- Automatic path conversion: Windows paths → WSL paths
- Example: `C:\Users\muuko\Desktop\yurucode` → `/mnt/c/Users/muuko/Desktop/yurucode`

### macOS
- Uses `server-claude-macos.js` directly
- No embedded server
- Native Claude CLI execution

## Common Confusion Points

1. **"Why are my changes not working?"**
   - You're probably editing the wrong file
   - On Windows/Linux: Edit code in `logged_server.rs`, not .js files
   - After editing: Restart Tauri dev server

2. **"Which server.js should I edit?"**
   - None of them! Edit `logged_server.rs` for Windows/Linux

3. **"Why does WSL keep appearing in logs?"**
   - Windows can only run Claude CLI through WSL
   - The server automatically detects WSL users and paths

4. **"Why are there so many server files?"**
   - Historical reasons and different platform requirements
   - Only the embedded server (Windows/Linux) or server-claude-macos.js (macOS) are actually used

## Development Workflow

### To modify the server on Windows/Linux:
1. Open `src-tauri/src/logged_server.rs`
2. Find `const EMBEDDED_SERVER: &str = r#"` (around line 124)
3. Edit the JavaScript code within the string
4. Save the file
5. Restart the Tauri dev server for changes to take effect

### To modify the server on macOS:
1. Open `server-claude-macos.js`
2. Edit the code directly
3. Save the file
4. The changes take effect immediately (hot reload)

## Token Calculation Corrected

The embedded server now correctly:
- Counts ALL tokens (input, output, cache_creation, cache_read) towards the 200k context limit
- This matches how Claude actually enforces context limits
- Cache tokens represent the conversation history and DO count towards the total context in use
- Example: 4 input + 4 output + 6149 cache_creation + 11459 cache_read = 17,616 total tokens in context