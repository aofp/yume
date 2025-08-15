# Working Directory Fix

## Problem
When the macOS app is released/bundled, Claude sessions were starting in the root directory `/` instead of the user's home directory. This happened because:
1. The bundled server runs from the app's resources folder
2. `process.cwd()` returns the app bundle location, not the user's directory
3. No directory was being passed when creating initial sessions

## Solution Applied

### 1. Added Tauri Commands (src-tauri/src/commands/mod.rs)
- `get_home_directory()` - Returns user's home directory path
- `get_current_directory()` - Returns current working directory

### 2. Updated Frontend Store (src/renderer/stores/claudeCodeStore.ts)
- Now calls `get_home_directory()` from Tauri when no directory is specified
- Falls back to platform-specific defaults:
  - Windows: `C:\Users\`
  - macOS/Linux: `/Users`
- Applied to both `createSession` and `loadPersistedSession`

### 3. Updated Server (server-claude-macos.js)
- Changed default from `process.cwd()` to `homedir()`
- Ensures bundled server doesn't use app bundle path

## Platform Compatibility
✅ **Windows**: Uses `C:\Users\` or gets home from Tauri
✅ **macOS**: Uses `/Users` or gets home from Tauri  
✅ **Linux**: Uses `/Users` or gets home from Tauri

## Testing
After rebuilding:
1. Open the app without selecting a folder
2. Run `pwd` in Claude - should show home directory (e.g., `/Users/username`)
3. Not root `/` anymore!

## Build Commands
```bash
# macOS
npm run tauri:build:mac

# Windows  
npm run tauri:build:win
```

The fix ensures both development and production builds use the correct user directory.