# Finding Claude Binary - Complete Visual Guide

## Overview: The Binary Detection Challenge

Finding the Claude CLI binary is **THE FIRST CRITICAL STEP** that must work perfectly or nothing else matters. Different platforms, installation methods, and user configurations make this complex.

## Visual Flow: Complete Binary Detection Process

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLAUDE BINARY DETECTION FLOW                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  START                                                            │
│    │                                                              │
│    ▼                                                              │
│  ┌─────────────────────────┐                                     │
│  │ Check CLAUDE_PATH env    │ ──── Found ──→ ✅ USE IT          │
│  │ variable first           │                                     │
│  └────────┬─────────────────┘                                     │
│           │ Not Set                                               │
│           ▼                                                       │
│  ┌─────────────────────────┐                                     │
│  │ Detect Platform          │                                     │
│  └────────┬─────────────────┘                                     │
│           │                                                       │
│     ┌─────┼─────┬──────────┬────────────┐                       │
│     ▼     ▼     ▼          ▼            ▼                       │
│  macOS  Linux  Windows   Windows+WSL  Unknown                    │
│     │     │      │          │            │                       │
│     ▼     ▼      ▼          ▼            ▼                       │
│  [macOS] [Linux] [Win]    [WSL]     [Generic]                    │
│  Search  Search  Search   Search     Search                      │
│     │     │      │          │            │                       │
│     └─────┴──────┴──────────┴────────────┘                       │
│                    │                                              │
│                    ▼                                              │
│           ┌─────────────────┐                                     │
│           │ Found Binary?    │                                     │
│           └────┬────────┬───┘                                     │
│                │        │                                         │
│              Yes        No                                        │
│                │        │                                         │
│                ▼        ▼                                         │
│           ✅ SUCCESS  ❌ ERROR                                   │
│                      "Claude not installed"                       │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Platform-Specific Search Patterns

### macOS Search Order

```
┌──────────────────────────────────────────────────────────────┐
│                     macOS CLAUDE SEARCH                       │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  1. Environment Variable                                      │
│     $CLAUDE_PATH ─────────────→ /custom/path/claude          │
│           │                                                   │
│           ▼ (if not set)                                      │
│                                                               │
│  2. Which Command                                            │
│     `which claude` ───────────→ /usr/local/bin/claude        │
│           │                                                   │
│           ▼ (if not found)                                    │
│                                                               │
│  3. Homebrew Locations                                       │
│     ┌─────────────────────────┐                              │
│     │ Intel Mac:              │                              │
│     │ /usr/local/bin/claude   │                              │
│     └─────────────────────────┘                              │
│     ┌─────────────────────────┐                              │
│     │ M1/M2 Mac:              │                              │
│     │ /opt/homebrew/bin/claude│                              │
│     └─────────────────────────┘                              │
│           │                                                   │
│           ▼ (if not found)                                    │
│                                                               │
│  4. User Installation                                        │
│     ~/.local/bin/claude                                      │
│     ~/.claude/bin/claude                                     │
│           │                                                   │
│           ▼ (if not found)                                    │
│                                                               │
│  5. NPM Global Installation                                  │
│     ~/.npm-global/bin/claude                                 │
│     /usr/local/lib/node_modules/.bin/claude                  │
│           │                                                   │
│           ▼ (if not found)                                    │
│                                                               │
│  ❌ NOT FOUND - Show installation instructions               │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

### Windows Search Order

```
┌──────────────────────────────────────────────────────────────┐
│                   WINDOWS CLAUDE SEARCH                       │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  NATIVE WINDOWS (Check First!)                               │
│  ═══════════════════════════════                             │
│                                                               │
│  1. Environment Variable                                      │
│     %CLAUDE_PATH% ────────────→ D:\Tools\claude.exe          │
│           │                                                   │
│           ▼ (if not set)                                      │
│                                                               │
│  2. Local App Data                                           │
│     %LOCALAPPDATA%\Claude\claude.exe                         │
│     (C:\Users\{user}\AppData\Local\Claude\claude.exe)        │
│           │                                                   │
│           ▼ (if not found)                                    │
│                                                               │
│  3. Program Files                                            │
│     C:\Program Files\Claude\claude.exe                       │
│     C:\Program Files (x86)\Claude\claude.exe                 │
│           │                                                   │
│           ▼ (if not found)                                    │
│                                                               │
│  4. User Profile                                             │
│     %USERPROFILE%\.claude\claude.exe                         │
│     %USERPROFILE%\claude\claude.exe                          │
│           │                                                   │
│           ▼ (if not found)                                    │
│                                                               │
│  WSL FALLBACK (If Native Not Found)                          │
│  ═══════════════════════════════════                         │
│                                                               │
│  5. Check WSL Availability                                   │
│     wsl.exe --list ──────────→ Get default distro            │
│           │                                                   │
│           ▼ (if WSL exists)                                   │
│                                                               │
│  6. Find WSL User                                            │
│     wsl.exe -e whoami ───────→ username                      │
│           │                                                   │
│           ▼                                                   │
│                                                               │
│  7. Check WSL Paths                                          │
│     /home/{user}/.claude/local/node_modules/.bin/claude      │
│     /home/{user}/.npm-global/bin/claude                      │
│     /home/{user}/.local/bin/claude                           │
│     /usr/local/bin/claude                                    │
│     /usr/bin/claude                                          │
│           │                                                   │
│           ▼ (if not found)                                    │
│                                                               │
│  8. Try WSL 'which' Command                                  │
│     wsl.exe -e which claude                                  │
│           │                                                   │
│           ▼ (if not found)                                    │
│                                                               │
│  ❌ NOT FOUND - Show Windows + WSL installation guide        │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

### Linux Search Order

```
┌──────────────────────────────────────────────────────────────┐
│                     LINUX CLAUDE SEARCH                       │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  1. Environment Variable                                      │
│     $CLAUDE_PATH ─────────────→ /opt/claude/bin/claude       │
│           │                                                   │
│           ▼ (if not set)                                      │
│                                                               │
│  2. Which Command                                            │
│     `which claude` ───────────→ /usr/bin/claude              │
│           │                                                   │
│           ▼ (if not found)                                    │
│                                                               │
│  3. Standard System Paths                                    │
│     /usr/local/bin/claude                                    │
│     /usr/bin/claude                                          │
│     /bin/claude                                              │
│           │                                                   │
│           ▼ (if not found)                                    │
│                                                               │
│  4. User Paths                                               │
│     ~/.local/bin/claude                                      │
│     ~/bin/claude                                             │
│     ~/.claude/bin/claude                                     │
│           │                                                   │
│           ▼ (if not found)                                    │
│                                                               │
│  5. Snap/Flatpak/AppImage                                    │
│     /snap/bin/claude                                         │
│     ~/.local/share/flatpak/exports/bin/claude                │
│     ~/Applications/claude.AppImage                           │
│           │                                                   │
│           ▼ (if not found)                                    │
│                                                               │
│  6. NPM/Node Paths                                           │
│     ~/.npm-global/bin/claude                                 │
│     /usr/local/lib/node_modules/.bin/claude                  │
│           │                                                   │
│           ▼ (if not found)                                    │
│                                                               │
│  ❌ NOT FOUND - Check package manager installation           │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

## Implementation Code with Visual Comments

### Rust Implementation (Claudia's Approach)

```rust
/// Visual representation of search priority:
/// 
///     [ENV VAR] ──→ [WHICH] ──→ [PLATFORM PATHS] ──→ [ERROR]
///         ↓           ↓              ↓                   ↓
///      (fastest)  (reliable)    (fallback)          (helpful)
///
pub fn find_claude_binary() -> Result<PathBuf, String> {
    // ┌─────────────────────────────────────┐
    // │ STEP 1: Environment Variable        │
    // │ Highest priority - user override    │
    // └─────────────────────────────────────┘
    if let Ok(path) = env::var("CLAUDE_PATH") {
        let path = PathBuf::from(path);
        if path.exists() && path.is_file() {
            log::info!("✅ Found Claude via CLAUDE_PATH: {:?}", path);
            return Ok(path);
        }
    }
    
    // ┌─────────────────────────────────────┐
    // │ STEP 2: Which Command               │
    // │ Searches system PATH                │
    // └─────────────────────────────────────┘
    if let Ok(path) = which::which("claude") {
        log::info!("✅ Found Claude via 'which': {:?}", path);
        return Ok(path);
    }
    
    // ┌─────────────────────────────────────┐
    // │ STEP 3: Platform-Specific Paths     │
    // │ Known installation locations        │
    // └─────────────────────────────────────┘
    let platform_paths = get_platform_search_paths();
    
    for search_path in platform_paths {
        if search_path.exists() && search_path.is_file() {
            log::info!("✅ Found Claude at: {:?}", search_path);
            return Ok(search_path);
        }
    }
    
    // ┌─────────────────────────────────────┐
    // │ STEP 4: Error with Instructions     │
    // │ Help user install Claude            │
    // └─────────────────────────────────────┘
    Err(format!(
        "❌ Claude CLI not found!\n\n\
        Please install Claude CLI using one of these methods:\n\n\
        {}",
        get_installation_instructions()
    ))
}

fn get_platform_search_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    
    // ┌──────────────┐
    // │ Common Paths │
    // └──────────────┘
    if let Some(home) = dirs::home_dir() {
        paths.push(home.join(".local/bin/claude"));
        paths.push(home.join(".claude/bin/claude"));
        paths.push(home.join("bin/claude"));
    }
    
    // ┌────────────────────┐
    // │ Platform-Specific  │
    // └────────────────────┘
    #[cfg(target_os = "macos")]
    {
        paths.push(PathBuf::from("/opt/homebrew/bin/claude")); // M1/M2
        paths.push(PathBuf::from("/usr/local/bin/claude"));    // Intel
    }
    
    #[cfg(target_os = "windows")]
    {
        if let Ok(local_app) = env::var("LOCALAPPDATA") {
            paths.push(PathBuf::from(local_app).join("Claude/claude.exe"));
        }
        paths.push(PathBuf::from(r"C:\Program Files\Claude\claude.exe"));
    }
    
    #[cfg(target_os = "linux")]
    {
        paths.push(PathBuf::from("/usr/local/bin/claude"));
        paths.push(PathBuf::from("/usr/bin/claude"));
        paths.push(PathBuf::from("/snap/bin/claude"));
    }
    
    paths
}
```

### JavaScript Implementation (Current Yurucode Pattern)

```javascript
/**
 * Visual Binary Search Flow:
 * 
 *                    START
 *                      │
 *          ┌───────────┴───────────┐
 *          │ Platform Detection     │
 *          └───────────┬───────────┘
 *                      │
 *        ┌─────────────┼─────────────┐
 *        ▼             ▼             ▼
 *     Windows       macOS         Linux
 *        │             │             │
 *   Check Native   Direct Path   System Path
 *        │             │             │
 *   If Not Found   If Not Found  If Not Found
 *        │             │             │
 *     Try WSL      Try Homebrew  Try Snap
 *        │             │             │
 *        └─────────────┼─────────────┘
 *                      ▼
 *                 Final Result
 */
function findClaudeBinary() {
    console.log('🔍 Starting Claude binary search...');
    
    // ╔═══════════════════════════════════╗
    // ║ Priority 1: Environment Variable  ║
    // ╚═══════════════════════════════════╝
    if (process.env.CLAUDE_PATH) {
        console.log(`📍 Checking CLAUDE_PATH: ${process.env.CLAUDE_PATH}`);
        if (fs.existsSync(process.env.CLAUDE_PATH)) {
            console.log('✅ Found via CLAUDE_PATH');
            return process.env.CLAUDE_PATH;
        }
    }
    
    // ╔═══════════════════════════════════╗
    // ║ Priority 2: Platform Detection    ║
    // ╚═══════════════════════════════════╝
    const platform = process.platform;
    console.log(`🖥️ Platform: ${platform}`);
    
    switch (platform) {
        case 'darwin':
            return findClaudeMacOS();
        case 'win32':
            return findClaudeWindows();
        case 'linux':
            return findClaudeLinux();
        default:
            return findClaudeGeneric();
    }
}

/**
 * macOS Search Visualization:
 * 
 *     which ──→ Homebrew ──→ User Dir ──→ NPM
 *       ↓          ↓           ↓          ↓
 *    (fast)    (common)    (manual)   (node)
 */
function findClaudeMacOS() {
    const searchPaths = [
        // System PATH
        { method: 'which', check: () => {
            try {
                const result = execSync('which claude', { encoding: 'utf8' }).trim();
                return result || null;
            } catch { return null; }
        }},
        
        // Homebrew Intel
        { path: '/usr/local/bin/claude', label: 'Homebrew (Intel)' },
        
        // Homebrew Apple Silicon
        { path: '/opt/homebrew/bin/claude', label: 'Homebrew (M1/M2)' },
        
        // User installation
        { path: `${os.homedir()}/.local/bin/claude`, label: 'User Local' },
        
        // NPM global
        { path: `${os.homedir()}/.npm-global/bin/claude`, label: 'NPM Global' }
    ];
    
    return searchWithVisualization(searchPaths, 'macOS');
}

/**
 * Windows Search Visualization:
 * 
 *   Native Check ──→ WSL Check ──→ Error
 *        ↓              ↓           ↓
 *    (preferred)   (fallback)   (guide)
 */
function findClaudeWindows() {
    console.log('🪟 Searching Windows paths...');
    
    // ┌─────────────────────────┐
    // │ Try Native Windows First│
    // └─────────────────────────┘
    const nativePaths = [
        process.env.LOCALAPPDATA + '\\Claude\\claude.exe',
        'C:\\Program Files\\Claude\\claude.exe',
        'C:\\Program Files (x86)\\Claude\\claude.exe',
        process.env.USERPROFILE + '\\.claude\\claude.exe'
    ];
    
    for (const path of nativePaths) {
        console.log(`  Checking: ${path}`);
        if (fs.existsSync(path)) {
            console.log(`  ✅ Found native: ${path}`);
            return path;
        }
    }
    
    // ┌─────────────────────────┐
    // │ Fallback to WSL         │
    // └─────────────────────────┘
    console.log('📦 Native not found, checking WSL...');
    return findClaudeInWSL();
}

/**
 * WSL Search Visualization:
 * 
 *   Get User ──→ Check Paths ──→ Try 'which'
 *      ↓            ↓               ↓
 *   (whoami)    (iterate)       (fallback)
 */
function findClaudeInWSL() {
    const wslPath = 'C:\\Windows\\System32\\wsl.exe';
    
    if (!fs.existsSync(wslPath)) {
        console.log('❌ WSL not installed');
        return null;
    }
    
    // Get WSL username
    let wslUser = 'user';
    try {
        wslUser = execSync(`${wslPath} -e whoami`, {
            encoding: 'utf8',
            windowsHide: true
        }).trim();
        console.log(`👤 WSL User: ${wslUser}`);
    } catch (e) {
        console.warn('⚠️ Could not get WSL user');
    }
    
    // WSL search paths with visual indicators
    const wslSearchPaths = [
        `/home/${wslUser}/.claude/local/node_modules/.bin/claude`,
        `/home/${wslUser}/.npm-global/bin/claude`,
        `/home/${wslUser}/.local/bin/claude`,
        `/usr/local/bin/claude`,
        `/usr/bin/claude`
    ];
    
    for (const path of wslSearchPaths) {
        console.log(`  🔍 WSL: ${path}`);
        try {
            const exists = execSync(
                `${wslPath} -e test -f "${path}" && echo "1"`,
                { encoding: 'utf8', windowsHide: true }
            ).trim();
            
            if (exists === '1') {
                console.log(`  ✅ Found in WSL: ${path}`);
                return { wsl: true, path };
            }
        } catch {
            // Path doesn't exist
        }
    }
    
    // Last resort: try 'which' in WSL
    try {
        const whichResult = execSync(
            `${wslPath} -e which claude`,
            { encoding: 'utf8', windowsHide: true }
        ).trim();
        
        if (whichResult) {
            console.log(`  ✅ Found via WSL which: ${whichResult}`);
            return { wsl: true, path: whichResult };
        }
    } catch {
        // Not found
    }
    
    return null;
}

/**
 * Helper function with visual progress
 */
function searchWithVisualization(searchPaths, platform) {
    console.log(`\n┌─ Searching ${platform} Paths ─┐`);
    
    for (const item of searchPaths) {
        if (item.method) {
            // Dynamic check (like 'which')
            const result = item.check();
            if (result) {
                console.log(`│ ✅ ${item.method}: ${result}`);
                console.log('└─────────────────────────┘');
                return result;
            }
            console.log(`│ ❌ ${item.method}: not found`);
        } else if (item.path) {
            // Static path check
            console.log(`│ 🔍 ${item.label || item.path}`);
            if (fs.existsSync(item.path)) {
                console.log(`│ ✅ Found!`);
                console.log('└─────────────────────────┘');
                return item.path;
            }
        }
    }
    
    console.log('│ ❌ Not found on this platform');
    console.log('└─────────────────────────┘');
    return null;
}
```

## Error Messages and Recovery

### Visual Error Flow

```
┌──────────────────────────────────────────────────────────┐
│                  CLAUDE NOT FOUND ERROR                   │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  ❌ Claude CLI not found!                                │
│                                                           │
│  We searched these locations:                            │
│  ┌─────────────────────────────────────┐                 │
│  │ ❌ $CLAUDE_PATH (not set)           │                 │
│  │ ❌ which claude (not in PATH)       │                 │
│  │ ❌ /usr/local/bin/claude            │                 │
│  │ ❌ ~/.local/bin/claude              │                 │
│  │ ❌ /opt/homebrew/bin/claude         │                 │
│  └─────────────────────────────────────┘                 │
│                                                           │
│  📦 Installation Instructions:                           │
│  ┌─────────────────────────────────────┐                 │
│  │ macOS:                              │                 │
│  │   brew install claude-cli           │                 │
│  │   OR                                │                 │
│  │   npm install -g @anthropic/claude  │                 │
│  │                                     │                 │
│  │ Windows:                            │                 │
│  │   Download from:                    │                 │
│  │   https://claude.ai/download        │                 │
│  │   OR (in WSL):                      │                 │
│  │   npm install -g @anthropic/claude  │                 │
│  │                                     │                 │
│  │ Linux:                              │                 │
│  │   npm install -g @anthropic/claude  │                 │
│  │   OR                                │                 │
│  │   snap install claude               │                 │
│  └─────────────────────────────────────┘                 │
│                                                           │
│  💡 After installation:                                  │
│     - Restart this application                           │
│     - OR set CLAUDE_PATH=/path/to/claude                 │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

## Testing Binary Detection

### Visual Test Coverage

```
┌────────────────────────────────────────────────┐
│            BINARY DETECTION TESTS              │
├────────────────────────────────────────────────┤
│                                                │
│  ✅ Test 1: Environment Variable              │
│     Set CLAUDE_PATH → Verify found            │
│                                                │
│  ✅ Test 2: System PATH                       │
│     Add to PATH → Verify 'which' works        │
│                                                │
│  ✅ Test 3: Platform Paths                    │
│     Place in /usr/local/bin → Verify found    │
│                                                │
│  ✅ Test 4: Missing Binary                    │
│     Remove all → Verify error message         │
│                                                │
│  ✅ Test 5: Wrong Permissions                 │
│     chmod 000 → Verify permission error       │
│                                                │
│  ✅ Test 6: Symlink                          │
│     Create symlink → Verify follows link      │
│                                                │
│  ✅ Test 7: WSL Integration                   │
│     Windows + WSL → Verify WSL detection      │
│                                                │
│  ✅ Test 8: Multiple Versions                 │
│     Install multiple → Verify precedence      │
│                                                │
└────────────────────────────────────────────────┘
```

## Performance Optimization

### Search Time Visualization

```
Search Performance by Method:
━━━━━━━━━━━━━━━━━━━━━━━━━━━

Environment Variable  ▓░░░░░░░░░  < 1ms     ⚡ Instant
Which Command        ▓▓▓░░░░░░░  5-10ms    🚀 Fast
File System Check    ▓▓▓▓▓░░░░░  10-20ms   ✓ Acceptable
WSL Check           ▓▓▓▓▓▓▓▓▓░  50-100ms  ⚠️ Slow

Optimization: Cache result after first successful find
```

## Summary

The Claude binary detection process is critical and must:
1. **Check environment variables first** (fastest)
2. **Use platform-appropriate search paths**
3. **Provide clear error messages with installation instructions**
4. **Handle WSL on Windows as fallback**
5. **Cache the result to avoid repeated searches**

The visual flows show exactly how the search progresses and where failures can occur, making debugging and implementation straightforward.