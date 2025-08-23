# Windows/WSL Critical Implementation Patterns

## The Most Critical Issue: WSL Path Translation

Windows paths and WSL paths are **completely different** and must be translated correctly or Claude will fail silently.

## Path Translation Patterns

### Windows → WSL
```javascript
// Windows path
C:\Users\name\project\file.txt

// WSL path
/mnt/c/Users/name/project/file.txt

// Translation function
function windowsToWslPath(winPath) {
    // Handle drive letter
    const match = winPath.match(/^([A-Z]):(.*)/);
    if (match) {
        const drive = match[1].toLowerCase();
        const path = match[2].replace(/\\/g, '/');
        return `/mnt/${drive}${path}`;
    }
    return winPath;
}
```

### WSL → Windows
```javascript
// WSL path
/mnt/c/Users/name/project/file.txt

// Windows path
C:\Users\name\project\file.txt

// Translation function
function wslToWindowsPath(wslPath) {
    const match = wslPath.match(/^\/mnt\/([a-z])\/(.*)/);
    if (match) {
        const drive = match[1].toUpperCase();
        const path = match[2].replace(/\//g, '\\');
        return `${drive}:\\${path}`;
    }
    return wslPath;
}
```

## Critical WSL Command Patterns

### Pattern 1: Direct WSL Invocation (Current Yurucode)
```javascript
// PROBLEM: Complex escaping, prone to failure
const wslPath = 'C:\\Windows\\System32\\wsl.exe';
const claudePath = '/home/user/.claude/local/node_modules/.bin/claude';

const args = [
    wslPath,
    '-e', 'bash', '-c',
    `cd "${wslWorkingDir}" && ${claudePath} --print --output-format stream-json`
];

spawn(args[0], args.slice(1));
```

### Pattern 2: Script Piping (Better)
```javascript
// Use script to handle complex commands
const script = `
    cd "${wslWorkingDir}"
    ${claudePath} \\
        --prompt "${prompt}" \\
        --output-format stream-json \\
        --verbose \\
        --print
`;

const args = ['wsl.exe', '-e', 'bash', '-c', script];
```

### Pattern 3: Direct Binary Invocation (Best - Claudia's Approach)
```rust
// Find Windows-native Claude binary, no WSL needed!
fn find_claude_binary_windows() -> Option<PathBuf> {
    // Check native Windows locations FIRST
    let locations = vec![
        // User AppData
        env::var("LOCALAPPDATA").ok()
            .map(|p| PathBuf::from(p).join("Claude").join("claude.exe")),
        
        // Program Files
        Some(PathBuf::from(r"C:\Program Files\Claude\claude.exe")),
        
        // User's local installation
        dirs::home_dir()
            .map(|h| h.join(".claude").join("claude.exe")),
    ];
    
    for path in locations.into_iter().flatten() {
        if path.exists() {
            return Some(path);
        }
    }
    
    None
}
```

## WSL Claude Detection

### Finding Claude in WSL
```javascript
function findClaudeInWsl() {
    const wslPath = 'C:\\Windows\\System32\\wsl.exe';
    
    // Dynamic user detection
    const wslUser = execSync(`${wslPath} -e bash -c whoami`, {
        encoding: 'utf8',
        windowsHide: true
    }).trim();
    
    // Possible Claude locations in WSL
    const possiblePaths = [
        `/home/${wslUser}/.claude/local/node_modules/.bin/claude`,
        `/home/${wslUser}/.npm-global/bin/claude`,
        `/home/${wslUser}/node_modules/.bin/claude`,
        `/usr/local/bin/claude`,
        `/usr/bin/claude`,
        `/home/${wslUser}/.local/bin/claude`
    ];
    
    // Check each path
    for (const path of possiblePaths) {
        try {
            const checkCmd = `[ -f "${path}" ] && echo "exists"`;
            const result = execSync(
                `${wslPath} -e bash -c '${checkCmd}'`,
                { encoding: 'utf8', windowsHide: true }
            ).trim();
            
            if (result === 'exists') {
                console.log(`Found Claude at: ${path}`);
                return path;
            }
        } catch (e) {
            // Path doesn't exist, continue
        }
    }
    
    // Try 'which' as last resort
    try {
        const whichResult = execSync(
            `${wslPath} -e bash -c 'which claude'`,
            { encoding: 'utf8', windowsHide: true }
        ).trim();
        
        if (whichResult) {
            return whichResult;
        }
    } catch (e) {
        // Claude not in PATH
    }
    
    return null;
}
```

## Critical Windows-Specific Issues

### Issue 1: Command Line Length Limit
```javascript
// Windows command line limit: 8191 characters (cmd.exe)
// Safe limit: 8000 characters

function isPromptTooLong(prompt) {
    // Calculate full command length
    const baseCommand = 'wsl.exe -e bash -c "claude --prompt ""';
    const totalLength = baseCommand.length + prompt.length;
    
    return totalLength > 8000;
}

// If too long, use stdin instead
if (isPromptTooLong(prompt)) {
    // Use piping instead of --prompt
    const child = spawn('wsl.exe', [
        '-e', 'bash', '-c',
        `claude --output-format stream-json --print`
    ]);
    child.stdin.write(prompt);
    child.stdin.end();
} else {
    // Safe to use --prompt
    spawn('wsl.exe', [
        '-e', 'bash', '-c',
        `claude --prompt "${prompt}" --output-format stream-json --print`
    ]);
}
```

### Issue 2: Line Ending Conversion
```javascript
// Windows uses CRLF (\r\n), WSL/Linux uses LF (\n)

function normalizeLineEndings(text) {
    // Convert Windows CRLF to Unix LF
    return text.replace(/\r\n/g, '\n');
}

function denormalizeLineEndings(text) {
    // Convert Unix LF to Windows CRLF
    return text.replace(/(?<!\r)\n/g, '\r\n');
}

// When sending to Claude via WSL
const normalizedPrompt = normalizeLineEndings(windowsPrompt);

// When receiving from Claude via WSL
const windowsOutput = denormalizeLineEndings(wslOutput);
```

### Issue 3: Process Termination
```javascript
// Windows process termination is different

function killClaudeWindows(pid) {
    if (isWslProcess) {
        // Kill WSL process
        execSync(`wsl.exe -e bash -c 'kill -9 ${pid}'`);
    } else {
        // Kill Windows process
        execSync(`taskkill /F /PID ${pid}`);
        
        // Also kill children
        execSync(`taskkill /F /T /PID ${pid}`);
    }
}
```

### Issue 4: Environment Variables
```javascript
// WSL doesn't inherit Windows environment variables

function spawnClaudeWithEnv() {
    // Get Windows env vars
    const winPath = process.env.PATH;
    const winHome = process.env.USERPROFILE;
    
    // Convert to WSL format
    const wslHome = `/mnt/c/Users/${process.env.USERNAME}`;
    
    // Set WSL environment
    const wslEnv = {
        PATH: '/usr/local/bin:/usr/bin:/bin',
        HOME: wslHome,
        USER: process.env.USERNAME,
        // Important: Set Claude-specific vars
        CLAUDE_HOME: `${wslHome}/.claude`,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY // If needed
    };
    
    // Spawn with environment
    spawn('wsl.exe', [
        '-e', 'bash', '-c',
        `export HOME="${wslHome}" && claude --print`
    ], { env: { ...process.env, ...wslEnv } });
}
```

## Complete Windows Implementation Pattern

```javascript
class WindowsClaudeManager {
    constructor() {
        this.isWindows = process.platform === 'win32';
        this.wslPath = 'C:\\Windows\\System32\\wsl.exe';
        this.claudePath = null;
        this.useWsl = false;
    }
    
    async initialize() {
        // Try native Windows Claude first
        this.claudePath = this.findNativeWindowsClaude();
        
        if (!this.claudePath) {
            // Fall back to WSL
            this.claudePath = this.findWslClaude();
            this.useWsl = true;
        }
        
        if (!this.claudePath) {
            throw new Error('Claude CLI not found on Windows or in WSL');
        }
    }
    
    findNativeWindowsClaude() {
        const paths = [
            process.env.LOCALAPPDATA + '\\Claude\\claude.exe',
            'C:\\Program Files\\Claude\\claude.exe',
            process.env.USERPROFILE + '\\.claude\\claude.exe'
        ];
        
        for (const path of paths) {
            if (fs.existsSync(path)) {
                console.log(`Found native Claude at: ${path}`);
                return path;
            }
        }
        
        return null;
    }
    
    findWslClaude() {
        try {
            const wslUser = execSync(
                `${this.wslPath} -e bash -c whoami`,
                { encoding: 'utf8', windowsHide: true }
            ).trim();
            
            const paths = [
                `/home/${wslUser}/.claude/local/node_modules/.bin/claude`,
                `/usr/local/bin/claude`,
                `/home/${wslUser}/.local/bin/claude`
            ];
            
            for (const path of paths) {
                const exists = execSync(
                    `${this.wslPath} -e bash -c '[ -f "${path}" ] && echo "1"'`,
                    { encoding: 'utf8', windowsHide: true }
                ).trim();
                
                if (exists === '1') {
                    console.log(`Found WSL Claude at: ${path}`);
                    return path;
                }
            }
        } catch (e) {
            console.error('WSL not available or Claude not found');
        }
        
        return null;
    }
    
    spawnClaude(prompt, workingDir, sessionId) {
        if (this.useWsl) {
            return this.spawnWslClaude(prompt, workingDir, sessionId);
        } else {
            return this.spawnNativeClaude(prompt, workingDir, sessionId);
        }
    }
    
    spawnNativeClaude(prompt, workingDir, sessionId) {
        const args = [];
        
        if (sessionId) {
            args.push('--resume', sessionId);
        }
        
        args.push(
            '--prompt', prompt,
            '--output-format', 'stream-json',
            '--verbose',
            '--print'
        );
        
        return spawn(this.claudePath, args, {
            cwd: workingDir,
            windowsHide: true
        });
    }
    
    spawnWslClaude(prompt, workingDir, sessionId) {
        // Convert Windows path to WSL path
        const wslWorkingDir = this.toWslPath(workingDir);
        
        // Build command
        let command = `cd "${wslWorkingDir}" && ${this.claudePath}`;
        
        if (sessionId) {
            command += ` --resume ${sessionId}`;
        }
        
        // Check prompt length
        if (prompt.length > 7000) {
            // Use stdin for long prompts
            command += ' --output-format stream-json --verbose --print';
            
            const child = spawn(this.wslPath, [
                '-e', 'bash', '-c', command
            ], { windowsHide: true });
            
            child.stdin.write(prompt);
            child.stdin.end();
            
            return child;
        } else {
            // Use --prompt for short prompts
            command += ` --prompt "${prompt.replace(/"/g, '\\"')}"`;
            command += ' --output-format stream-json --verbose --print';
            
            return spawn(this.wslPath, [
                '-e', 'bash', '-c', command
            ], { windowsHide: true });
        }
    }
    
    toWslPath(winPath) {
        const match = winPath.match(/^([A-Z]):(.*)/);
        if (match) {
            const drive = match[1].toLowerCase();
            const path = match[2].replace(/\\/g, '/');
            return `/mnt/${drive}${path}`;
        }
        return winPath;
    }
    
    toWindowsPath(wslPath) {
        const match = wslPath.match(/^\/mnt\/([a-z])\/(.*)/);
        if (match) {
            const drive = match[1].toUpperCase();
            const path = match[2].replace(/\//g, '\\');
            return `${drive}:\\${path}`;
        }
        return wslPath;
    }
}
```

## Critical Gotchas

### 1. WSL Version Matters
```javascript
// WSL 1 vs WSL 2 have different behaviors

function getWslVersion() {
    try {
        const output = execSync('wsl.exe -l -v', {
            encoding: 'utf8',
            windowsHide: true
        });
        
        // Parse output to find default distro version
        const lines = output.split('\n');
        for (const line of lines) {
            if (line.includes('*')) {  // Default distro
                const version = line.includes('2') ? 2 : 1;
                console.log(`WSL version: ${version}`);
                return version;
            }
        }
    } catch (e) {
        console.error('Could not determine WSL version');
    }
    return 1;  // Assume WSL 1
}

// WSL 2 specific handling
if (getWslVersion() === 2) {
    // WSL 2 has different networking
    // May need special handling for localhost
}
```

### 2. Hidden Console Windows
```javascript
// Always use windowsHide to prevent console flashing

spawn('wsl.exe', args, {
    windowsHide: true,  // CRITICAL on Windows!
    windowsVerbatimArguments: true  // Preserve argument formatting
});
```

### 3. Antivirus Interference
```javascript
// Some antivirus software blocks WSL execution

function testWslAccess() {
    try {
        execSync('wsl.exe -e echo "test"', {
            timeout: 5000,
            windowsHide: true
        });
        return true;
    } catch (e) {
        console.error('WSL blocked by antivirus or policy');
        return false;
    }
}
```

### 4. File Permissions
```javascript
// Windows files accessed from WSL have 777 permissions by default
// This can cause issues with some tools

// Fix permissions in WSL
const fixPermissions = `
    chmod 644 "${wslFilePath}"
    chown $USER:$USER "${wslFilePath}"
`;

execSync(`wsl.exe -e bash -c '${fixPermissions}'`);
```

## Testing Windows Implementation

```javascript
// Test suite for Windows/WSL
describe('Windows Claude Implementation', () => {
    test('Path translation', () => {
        expect(toWslPath('C:\\Users\\test')).toBe('/mnt/c/Users/test');
        expect(toWindowsPath('/mnt/c/Users/test')).toBe('C:\\Users\\test');
    });
    
    test('Find Claude binary', () => {
        const manager = new WindowsClaudeManager();
        manager.initialize();
        expect(manager.claudePath).toBeTruthy();
    });
    
    test('Spawn with long prompt', () => {
        const longPrompt = 'x'.repeat(10000);
        const child = manager.spawnClaude(longPrompt, 'C:\\Users\\test', null);
        expect(child).toBeTruthy();
        child.kill();
    });
    
    test('WSL process cleanup', () => {
        const child = manager.spawnWslClaude('test', 'C:\\test', null);
        const pid = child.pid;
        child.kill();
        
        // Verify process is gone
        const running = execSync(`tasklist /FI "PID eq ${pid}"`);
        expect(running).not.toContain(pid.toString());
    });
});
```

## Summary

**Key Points for Windows/WSL:**
1. **Always try native Windows Claude first** - Faster and more reliable
2. **Path translation is critical** - Get it wrong and Claude silently fails
3. **Command length limits are real** - Use stdin for long prompts
4. **WSL adds complexity** - Extra process layer, permissions, line endings
5. **Use windowsHide always** - Prevents console window flashing
6. **Test both WSL 1 and WSL 2** - Different behaviors
7. **Handle antivirus blocking** - Common in enterprise environments

The best approach is to avoid WSL entirely by using a native Windows Claude binary when possible.