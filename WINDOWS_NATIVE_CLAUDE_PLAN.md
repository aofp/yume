# Native Windows Claude Code Support - Implementation Plan

## Current State

### What Works Now
- WSL-based Claude Code execution works perfectly
- The app detects WSL installation dynamically
- Uses `wsl.exe` to execute claude commands
- Handles path translation between Windows and WSL formats
- Server embedded in `logged_server.rs` for Windows/Linux

### Key Findings
1. **Platform Detection**: Already exists via `platform() === 'win32'`
2. **WSL Execution**: All Windows execution currently goes through WSL via `createWslClaudeCommand()`
3. **Settings System**: Uses localStorage and Zustand store for preferences
4. **Server Architecture**: Embedded Node.js server in `logged_server.rs` (line ~124)

## Implementation Strategy

### 1. Detection Phase
**Goal**: Detect both WSL and native Windows Claude installations

#### Native Windows Claude Locations
```javascript
// Common native Windows installation paths
const NATIVE_WINDOWS_PATHS = [
  // User installation
  'C:\\Users\\%USERNAME%\\.claude\\local\\claude.exe',
  'C:\\Users\\%USERNAME%\\AppData\\Local\\Programs\\claude\\claude.exe',
  
  // Global installation
  'C:\\Program Files\\Claude\\claude.exe',
  'C:\\Program Files (x86)\\Claude\\claude.exe',
  
  // npm global installation
  'C:\\Users\\%USERNAME%\\AppData\\Roaming\\npm\\claude.cmd',
  'C:\\Users\\%USERNAME%\\AppData\\Roaming\\npm\\claude.exe',
  
  // Chocolatey/Scoop installations
  'C:\\ProgramData\\chocolatey\\bin\\claude.exe',
  'C:\\Users\\%USERNAME%\\scoop\\apps\\claude\\current\\claude.exe'
];
```

#### Detection Logic
1. Check native Windows paths first
2. Check WSL availability and Claude installation
3. Store both results for user selection
4. Cache detection results to avoid repeated filesystem checks

### 2. Settings UI Design
**Goal**: Allow users to select between native Windows and WSL Claude

#### UI Components
- Radio button group in General settings tab
- Auto-detection button to re-scan installations
- Display detected paths for transparency
- Test button to verify selected installation works

#### Settings Storage
```typescript
interface ClaudeSettings {
  executionMode: 'native-windows' | 'wsl' | 'auto';
  nativeWindowsPath?: string;
  wslPath?: string;
  wslUser?: string;
  lastDetection?: number; // timestamp
}
```

### 3. Server Modifications
**Goal**: Support both execution modes in embedded server

#### Key Changes Required
1. **Command Builder**: Create `createNativeWindowsClaudeCommand()` function
2. **Path Handling**: Keep Windows paths native (no translation needed)
3. **Process Spawning**: Use `spawn()` directly without wsl.exe wrapper
4. **Environment Variables**: Pass Windows environment directly

#### Code Structure
```javascript
function getClaudeCommand(args, workingDir, message) {
  const settings = getClaudeSettings();
  
  switch(settings.executionMode) {
    case 'native-windows':
      return createNativeWindowsClaudeCommand(args, workingDir, message);
    case 'wsl':
      return createWslClaudeCommand(args, workingDir, message);
    case 'auto':
      // Prefer native if available, fall back to WSL
      return settings.nativeWindowsPath 
        ? createNativeWindowsClaudeCommand(args, workingDir, message)
        : createWslClaudeCommand(args, workingDir, message);
  }
}
```

### 4. Path Translation Layer
**Goal**: Handle path differences between execution modes

#### Requirements
- Native Windows: Use Windows paths as-is (C:\Users\...)
- WSL: Convert to /mnt/c/Users/...
- Session storage: Handle both path formats

#### Implementation
```javascript
function translatePath(path, targetMode) {
  if (targetMode === 'wsl' && isWindowsPath(path)) {
    return windowsToWslPath(path);
  }
  if (targetMode === 'native-windows' && isWslPath(path)) {
    return wslToWindowsPath(path);
  }
  return path;
}
```

### 5. Testing Strategy
**Goal**: Ensure both modes work reliably

#### Test Cases
1. **Detection Tests**
   - Detect native Windows installation
   - Detect WSL installation
   - Handle missing installations gracefully

2. **Execution Tests**
   - Send message via native Windows
   - Send message via WSL
   - Resume sessions in both modes
   - Title generation in both modes

3. **Path Tests**
   - File operations with Windows paths
   - File operations with WSL paths
   - Session storage with mixed paths

4. **Edge Cases**
   - Switching between modes mid-session
   - Handling when selected mode becomes unavailable
   - Very long messages (temp file handling)

## Implementation Steps

### Phase 1: Detection & Settings (Priority)
1. ✅ Document implementation plan
2. Add Claude detection logic for native Windows
3. Create settings UI for mode selection
4. Implement settings storage in Zustand store

### Phase 2: Server Support
5. Modify embedded server to support native Windows execution
6. Create native Windows command builder
7. Update path handling for both modes
8. Test basic message sending

### Phase 3: Polish & Testing
9. Add auto-detection on startup
10. Implement mode switching safeguards
11. Add comprehensive error handling
12. Test all features in both modes

## Critical Considerations

### Security
- Validate detected executable paths
- Sanitize command arguments
- Handle untrusted paths safely

### Performance
- Cache detection results
- Minimize filesystem checks
- Lazy-load mode-specific code

### User Experience
- Clear error messages when Claude not found
- Helpful installation instructions
- Seamless mode switching

### Compatibility
- Support different Claude CLI versions
- Handle various installation methods
- Graceful degradation if features unavailable

## Files to Modify

### Core Changes
1. `src-tauri/src/logged_server.rs` - Embedded server with native Windows support
2. `src/renderer/stores/claudeCodeStore.ts` - Add Claude settings state
3. `src/renderer/components/Settings/SettingsModalTabbed.tsx` - Add mode selection UI

### New Files
4. `src/renderer/services/claudeDetector.ts` - Detection logic
5. `src/renderer/components/Settings/ClaudeSelector.tsx` - Selection UI component

### Configuration
6. `package.json` - Add detection/test scripts if needed

## Next Steps

1. Start with detection logic implementation
2. Test detection on actual Windows system
3. Build minimal UI for mode selection
4. Implement server changes incrementally
5. Thorough testing of both modes

## Success Criteria

- ✅ Native Windows Claude detected automatically
- ✅ Users can select between native and WSL modes
- ✅ Both modes work perfectly for all features
- ✅ Seamless switching between modes
- ✅ Clear error messages and recovery options
- ✅ No regression in WSL functionality