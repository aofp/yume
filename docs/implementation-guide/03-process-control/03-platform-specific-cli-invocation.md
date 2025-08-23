# Platform-Specific Claude CLI Invocation Patterns

## macOS ARM64 (Apple Silicon)

### Binary Location
```bash
# Primary location (Homebrew)
/opt/homebrew/bin/claude

# Secondary location (manual install)
/usr/local/bin/claude

# User-specific location
~/bin/claude
```

### Spawn Command Construction
```javascript
// macOS-specific spawn with proper environment
const spawn = require('child_process').spawn;

const claudeProcess = spawn('/opt/homebrew/bin/claude', [
    '--resume', sessionId,  // Resume MUST be first if present
    '-p', prompt,
    '--model', 'claude-3-5-sonnet-20241022',
    '--output-format', 'stream-json',
    '--verbose',
    '--dangerously-skip-permissions'
], {
    cwd: projectPath,
    env: {
        ...process.env,
        PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin',
        HOME: process.env.HOME,
        USER: process.env.USER,
        SHELL: '/bin/zsh',
        TERM: 'xterm-256color',
        LC_ALL: 'en_US.UTF-8',
        LANG: 'en_US.UTF-8'
    },
    shell: false,  // CRITICAL: false for direct execution
    detached: false,
    stdio: ['pipe', 'pipe', 'pipe']
});
```

### Path Resolution
```javascript
// macOS path resolution with spaces
function resolveMacPath(path) {
    // Handle paths with spaces
    if (path.includes(' ')) {
        // Do NOT quote for spawn - it handles spaces
        return path;
    }
    
    // Expand home directory
    if (path.startsWith('~/')) {
        return path.replace('~', process.env.HOME);
    }
    
    // Handle /Volumes/ for external drives
    if (path.startsWith('/Volumes/')) {
        return path;  // Already absolute
    }
    
    return path;
}
```

### Common macOS Issues
```javascript
// Issue 1: Homebrew PATH not available
if (!fs.existsSync('/opt/homebrew/bin/claude')) {
    // Try alternative locations
    const alternatives = [
        '/usr/local/bin/claude',
        `${process.env.HOME}/bin/claude`,
        '/Applications/Claude.app/Contents/MacOS/claude'
    ];
    
    for (const alt of alternatives) {
        if (fs.existsSync(alt)) {
            claudeBinary = alt;
            break;
        }
    }
}

// Issue 2: Gatekeeper blocking unsigned binary
// Solution: User must run once manually or:
spawn('xattr', ['-d', 'com.apple.quarantine', claudeBinary]);

// Issue 3: File descriptor limits
// macOS has lower default ulimit
process.setMaxListeners(50);  // Increase for multiple sessions
```

## Windows x64

### Binary Location
```powershell
# Primary location (System-wide)
C:\Program Files\Claude\claude.exe

# User-specific location
%LOCALAPPDATA%\Claude\claude.exe
%USERPROFILE%\AppData\Local\Claude\claude.exe

# Scoop installation
%USERPROFILE%\scoop\apps\claude\current\claude.exe

# WSL translation required
\\wsl$\Ubuntu\usr/local/bin/claude
```

### Windows Direct Spawn
```javascript
// Windows native spawn WITHOUT WSL
const spawn = require('child_process').spawn;

const claudeProcess = spawn('C:\\Program Files\\Claude\\claude.exe', [
    '--resume', sessionId,
    '-p', prompt,
    '--model', 'claude-3-5-sonnet-20241022',
    '--output-format', 'stream-json',
    '--verbose',
    '--dangerously-skip-permissions'
], {
    cwd: 'C:\\Users\\Username\\Projects\\myproject',
    env: {
        ...process.env,
        PATH: process.env.PATH,
        USERPROFILE: process.env.USERPROFILE,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP
    },
    shell: false,  // false for .exe files
    windowsHide: true,  // Hide console window
    stdio: ['pipe', 'pipe', 'pipe']
});
```

### WSL Translation Pattern
```javascript
// Windows paths need WSL translation
function translateWindowsToWSL(windowsPath) {
    // C:\Users\Name\Project -> /mnt/c/Users/Name/Project
    let wslPath = windowsPath
        .replace(/\\/g, '/')  // Backslash to forward slash
        .replace(/^([A-Z]):/, (match, drive) => `/mnt/${drive.toLowerCase()}`);
    
    return wslPath;
}

// WSL spawn from Windows
const wslClaudeProcess = spawn('wsl.exe', [
    'claude',  // Assumes claude in WSL PATH
    '--resume', sessionId,
    '-p', prompt,
    '--cwd', translateWindowsToWSL(projectPath),  // CRITICAL: translate path
    '--model', 'claude-3-5-sonnet-20241022',
    '--output-format', 'stream-json',
    '--verbose',
    '--dangerously-skip-permissions'
], {
    cwd: projectPath,  // Windows path for spawn
    env: process.env,
    shell: false,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe']
});
```

### PowerShell Wrapper Pattern
```javascript
// Some Windows setups require PowerShell wrapper
const psCommand = `
    & 'C:\\Program Files\\Claude\\claude.exe' @(
        '--resume', '${sessionId}',
        '-p', '${prompt.replace(/'/g, "''")}',
        '--model', 'claude-3-5-sonnet-20241022',
        '--output-format', 'stream-json',
        '--verbose',
        '--dangerously-skip-permissions'
    )
`;

const claudeProcess = spawn('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command', psCommand
], {
    cwd: projectPath,
    shell: false,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe']
});
```

### Windows-Specific Issues
```javascript
// Issue 1: Spaces in paths
const quotedPath = `"${pathWithSpaces}"`;  // Only for shell:true
// For shell:false, pass unquoted

// Issue 2: Long path support (>260 chars)
// Enable long paths in Windows or use \\?\C:\very\long\path

// Issue 3: Antivirus blocking
// Add claude.exe to exclusions

// Issue 4: WSL not installed
try {
    execSync('wsl --status', { stdio: 'ignore' });
} catch {
    console.error('WSL not installed, using native Windows binary');
    useNativeBinary = true;
}

// Issue 5: Different line endings
output = output.replace(/\r\n/g, '\n');  // Normalize to Unix
```

## Linux x64

### Binary Location
```bash
# System-wide installation
/usr/local/bin/claude
/usr/bin/claude

# User-specific
~/.local/bin/claude
~/bin/claude

# Snap package
/snap/bin/claude

# AppImage
~/Applications/claude.AppImage
```

### Linux Spawn Pattern
```javascript
const claudeProcess = spawn('/usr/local/bin/claude', [
    '--resume', sessionId,
    '-p', prompt,
    '--model', 'claude-3-5-sonnet-20241022',
    '--output-format', 'stream-json',
    '--verbose',
    '--dangerously-skip-permissions'
], {
    cwd: projectPath,
    env: {
        ...process.env,
        PATH: '/usr/local/bin:/usr/bin:/bin',
        HOME: process.env.HOME,
        USER: process.env.USER,
        SHELL: '/bin/bash',
        TERM: 'xterm-256color',
        LC_ALL: 'C.UTF-8',
        LANG: 'C.UTF-8'
    },
    shell: false,
    detached: false,
    stdio: ['pipe', 'pipe', 'pipe']
});
```

### AppImage Execution
```javascript
// AppImage requires special handling
const appImagePath = `${process.env.HOME}/Applications/claude.AppImage`;

// Make executable first
fs.chmodSync(appImagePath, '755');

const claudeProcess = spawn(appImagePath, [
    '--resume', sessionId,
    // ... rest of args
], {
    cwd: projectPath,
    env: {
        ...process.env,
        APPIMAGE: appImagePath,  // Required for AppImage
        APPDIR: path.dirname(appImagePath)
    }
});
```

### Linux Permission Issues
```javascript
// Issue 1: Binary not executable
if (!fs.statSync(claudeBinary).mode & 0o111) {
    fs.chmodSync(claudeBinary, '755');
}

// Issue 2: SELinux blocking
// Check with: getenforce
// Solution: semanage fcontext or disable for testing

// Issue 3: File descriptor limits
// Check: ulimit -n
// Increase: ulimit -n 4096

// Issue 4: Different distro paths
const distroSpecificPaths = {
    'ubuntu': '/usr/bin/claude',
    'fedora': '/usr/local/bin/claude',
    'arch': '/usr/bin/claude',
    'nixos': '/run/current-system/sw/bin/claude'
};
```

## Cross-Platform Detection

```javascript
function detectClaudeBinary() {
    const platform = process.platform;
    const candidates = [];
    
    switch (platform) {
        case 'darwin':  // macOS
            candidates.push(
                '/opt/homebrew/bin/claude',
                '/usr/local/bin/claude',
                `${process.env.HOME}/bin/claude`
            );
            break;
            
        case 'win32':  // Windows
            candidates.push(
                'C:\\Program Files\\Claude\\claude.exe',
                `${process.env.LOCALAPPDATA}\\Claude\\claude.exe`,
                `${process.env.USERPROFILE}\\scoop\\apps\\claude\\current\\claude.exe`
            );
            break;
            
        case 'linux':
            candidates.push(
                '/usr/local/bin/claude',
                '/usr/bin/claude',
                `${process.env.HOME}/.local/bin/claude`,
                '/snap/bin/claude'
            );
            break;
    }
    
    // Check each candidate
    for (const candidate of candidates) {
        try {
            if (fs.existsSync(candidate)) {
                // Verify it's executable
                fs.accessSync(candidate, fs.constants.X_OK);
                return candidate;
            }
        } catch {
            continue;
        }
    }
    
    // Try which command as fallback
    try {
        const which = execSync('which claude', { encoding: 'utf8' }).trim();
        if (which) return which;
    } catch {}
    
    throw new Error(`Claude binary not found on ${platform}`);
}
```

## Environment Variable Requirements

### All Platforms
```javascript
const baseEnv = {
    // Required for Claude
    HOME: process.env.HOME || process.env.USERPROFILE,
    USER: process.env.USER || process.env.USERNAME,
    
    // Terminal settings
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    
    // Locale settings
    LC_ALL: 'en_US.UTF-8',
    LANG: 'en_US.UTF-8',
    
    // Node.js settings
    NODE_ENV: 'production',
    
    // Disable telemetry
    DO_NOT_TRACK: '1',
    CLAUDE_TELEMETRY_DISABLED: '1'
};
```

### Platform-Specific Additions
```javascript
// macOS additions
if (process.platform === 'darwin') {
    baseEnv.PATH = '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin';
    baseEnv.SHELL = '/bin/zsh';
}

// Windows additions  
if (process.platform === 'win32') {
    baseEnv.TEMP = process.env.TEMP;
    baseEnv.TMP = process.env.TMP;
    baseEnv.USERPROFILE = process.env.USERPROFILE;
    baseEnv.APPDATA = process.env.APPDATA;
    baseEnv.LOCALAPPDATA = process.env.LOCALAPPDATA;
}

// Linux additions
if (process.platform === 'linux') {
    baseEnv.PATH = '/usr/local/bin:/usr/bin:/bin';
    baseEnv.SHELL = '/bin/bash';
    baseEnv.XDG_CONFIG_HOME = `${process.env.HOME}/.config`;
    baseEnv.XDG_DATA_HOME = `${process.env.HOME}/.local/share`;
}
```

## Spawn Options by Platform

```javascript
function getSpawnOptions(platform, projectPath) {
    const base = {
        cwd: projectPath,
        env: { ...process.env, ...baseEnv },
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,  // CRITICAL: false for all platforms
        detached: false
    };
    
    if (platform === 'win32') {
        base.windowsHide = true;
        base.windowsVerbatimArguments = true;
    }
    
    if (platform === 'linux') {
        base.uid = process.getuid?.();
        base.gid = process.getgid?.();
    }
    
    return base;
}
```

## Testing Commands

### macOS Test
```bash
# Direct test
/opt/homebrew/bin/claude \
    -p "test" \
    --model claude-3-5-sonnet-20241022 \
    --output-format stream-json \
    --verbose

# With environment
env PATH=/opt/homebrew/bin:/usr/bin \
    HOME=$HOME \
    claude -p "test" --output-format stream-json
```

### Windows Test
```powershell
# PowerShell test
& "C:\Program Files\Claude\claude.exe" `
    -p "test" `
    --model claude-3-5-sonnet-20241022 `
    --output-format stream-json `
    --verbose

# CMD test  
"C:\Program Files\Claude\claude.exe" ^
    -p "test" ^
    --output-format stream-json
```

### Linux Test
```bash
# Direct test
/usr/local/bin/claude \
    -p "test" \
    --model claude-3-5-sonnet-20241022 \
    --output-format stream-json \
    --verbose

# With strace to debug
strace -f -e execve,fork,clone \
    claude -p "test" --output-format stream-json
```

## Critical Platform Differences

| Aspect | macOS | Windows | Linux |
|--------|-------|---------|-------|
| Binary Extension | none | .exe | none |
| Path Separator | / | \\ | / |
| Shell Required | No | No (unless WSL) | No |
| Default Shell | /bin/zsh | cmd.exe | /bin/bash |
| Temp Directory | /tmp | %TEMP% | /tmp |
| Process Groups | Yes | No | Yes |
| Signals | SIGTERM | TerminateProcess | SIGTERM |
| File Descriptors | 256 default | 2048 default | 1024 default |
| Line Endings | LF | CRLF | LF |
| Case Sensitive | Yes* | No | Yes |

*macOS is case-insensitive by default but can be case-sensitive