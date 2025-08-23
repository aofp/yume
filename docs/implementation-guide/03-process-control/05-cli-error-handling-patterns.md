# Claude CLI Error Handling Patterns

## Error Categories

### 1. Binary Not Found Errors
```javascript
// ENOENT - Binary doesn't exist
function handleBinaryNotFound(error) {
    if (error.code === 'ENOENT') {
        return {
            type: 'BINARY_NOT_FOUND',
            message: 'Claude CLI not found',
            suggestions: [
                'Install Claude CLI from https://claude.ai/cli',
                'Check PATH environment variable',
                'Verify installation with: which claude',
                'Try absolute path to binary'
            ],
            platforms: {
                darwin: 'brew install claude',
                linux: 'curl -sSL https://claude.ai/cli/install.sh | sh',
                win32: 'Download from https://claude.ai/cli/windows'
            }
        };
    }
}

// Comprehensive binary detection with fallbacks
async function findClaudeBinary() {
    const errors = [];
    
    // Try primary location
    try {
        const primary = await detectPrimaryBinary();
        await fs.access(primary, fs.constants.X_OK);
        return primary;
    } catch (error) {
        errors.push({ location: 'primary', error });
    }
    
    // Try PATH
    try {
        const inPath = await which('claude');
        return inPath;
    } catch (error) {
        errors.push({ location: 'PATH', error });
    }
    
    // Try common locations
    const commonPaths = getCommonPaths();
    for (const path of commonPaths) {
        try {
            await fs.access(path, fs.constants.X_OK);
            return path;
        } catch (error) {
            errors.push({ location: path, error });
        }
    }
    
    // All attempts failed
    throw new BinaryNotFoundError(errors);
}
```

### 2. Permission Errors
```javascript
// EACCES - No execute permission
function handlePermissionError(error, binaryPath) {
    if (error.code === 'EACCES') {
        return {
            type: 'PERMISSION_DENIED',
            message: `Cannot execute ${binaryPath}`,
            solutions: [
                `chmod +x ${binaryPath}`,
                `sudo chmod 755 ${binaryPath}`,
                'Check file ownership',
                'Run with appropriate user'
            ],
            autoFix: async () => {
                try {
                    await fs.chmod(binaryPath, 0o755);
                    return true;
                } catch {
                    return false;
                }
            }
        };
    }
}

// EPERM - Operation not permitted (Windows/SELinux)
function handleSystemPermissionError(error) {
    if (error.code === 'EPERM') {
        const platform = process.platform;
        
        if (platform === 'win32') {
            return {
                type: 'WINDOWS_PERMISSION',
                message: 'Windows security blocking execution',
                solutions: [
                    'Run as Administrator',
                    'Add to Windows Defender exclusions',
                    'Check Group Policy restrictions',
                    'Disable Windows SmartScreen temporarily'
                ]
            };
        } else if (platform === 'linux') {
            return {
                type: 'SELINUX_BLOCKING',
                message: 'SELinux may be blocking execution',
                solutions: [
                    'setenforce 0 (temporary)',
                    'restorecon -v ' + error.path,
                    'Check audit logs: ausearch -m avc',
                    'Create SELinux policy module'
                ]
            };
        }
    }
}
```

### 3. Working Directory Errors
```javascript
// ENOENT - Working directory doesn't exist
function handleWorkingDirectoryError(error, cwd) {
    if (error.code === 'ENOENT' && error.path === cwd) {
        return {
            type: 'CWD_NOT_FOUND',
            message: `Working directory not found: ${cwd}`,
            solutions: [
                'Create directory first',
                'Use existing directory',
                'Check for typos in path',
                'Use absolute path'
            ],
            autoFix: async () => {
                try {
                    await fs.mkdir(cwd, { recursive: true });
                    return true;
                } catch {
                    return false;
                }
            }
        };
    }
}

// ENOTDIR - Path exists but isn't directory
function handleNotDirectoryError(error, cwd) {
    if (error.code === 'ENOTDIR') {
        return {
            type: 'CWD_NOT_DIRECTORY',
            message: `Path is not a directory: ${cwd}`,
            solutions: [
                'Remove file at path',
                'Use different directory',
                'Check path resolution'
            ]
        };
    }
}
```

### 4. Spawn Errors
```javascript
// EAGAIN - Resource temporarily unavailable
function handleResourceError(error) {
    if (error.code === 'EAGAIN') {
        return {
            type: 'RESOURCE_LIMIT',
            message: 'System resource limit reached',
            solutions: [
                'Too many processes running',
                'Increase ulimit: ulimit -n 4096',
                'Check process limits: ulimit -a',
                'Kill unused processes'
            ],
            retry: {
                attempts: 3,
                delay: 1000,
                backoff: 2
            }
        };
    }
}

// EMFILE - Too many open files
function handleFileDescriptorLimit(error) {
    if (error.code === 'EMFILE') {
        return {
            type: 'FD_LIMIT',
            message: 'Too many open files',
            solutions: [
                'Increase file descriptor limit',
                'Close unused file handles',
                'Check for file descriptor leaks',
                process.platform === 'darwin' 
                    ? 'launchctl limit maxfiles 65536 200000'
                    : 'ulimit -n 65536'
            ],
            cleanup: () => {
                // Force garbage collection
                if (global.gc) {
                    global.gc();
                }
            }
        };
    }
}
```

### 5. Process Exit Errors
```javascript
// Non-zero exit codes
function handleExitCode(code, signal) {
    const exitCodes = {
        1: 'General error',
        2: 'Invalid arguments',
        3: 'Authentication failed',
        4: 'Network error',
        5: 'API limit reached',
        125: 'Binary not executable',
        126: 'Binary not found',
        127: 'Command not found',
        128: 'Invalid exit argument',
        130: 'Terminated by Ctrl+C (SIGINT)',
        137: 'Killed (SIGKILL)',
        139: 'Segmentation fault (SIGSEGV)',
        143: 'Terminated (SIGTERM)'
    };
    
    if (signal) {
        return {
            type: 'PROCESS_SIGNALED',
            message: `Process terminated by signal: ${signal}`,
            signal,
            recovery: signal === 'SIGTERM' || signal === 'SIGINT'
                ? 'Normal termination'
                : 'Abnormal termination - check logs'
        };
    }
    
    return {
        type: 'EXIT_CODE',
        code,
        message: exitCodes[code] || `Unknown exit code: ${code}`,
        isRecoverable: code < 128,
        suggestions: getExitCodeSuggestions(code)
    };
}

function getExitCodeSuggestions(code) {
    switch (code) {
        case 2:
            return [
                'Check command arguments',
                'Verify --output-format stream-json',
                'Ensure prompt is properly escaped'
            ];
        case 3:
            return [
                'Re-authenticate with Claude CLI',
                'Check API key configuration',
                'Verify network connectivity'
            ];
        case 5:
            return [
                'API rate limit reached',
                'Wait before retrying',
                'Check usage dashboard'
            ];
        default:
            return ['Check Claude CLI logs', 'Run with --verbose flag'];
    }
}
```

## Comprehensive Error Handler

```javascript
class ClaudeCliErrorHandler {
    constructor(options = {}) {
        this.maxRetries = options.maxRetries || 3;
        this.retryDelay = options.retryDelay || 1000;
        this.autoRecover = options.autoRecover !== false;
        this.errorLog = [];
    }
    
    async handleSpawnError(error, context) {
        // Log error
        this.errorLog.push({
            timestamp: Date.now(),
            error: error.toString(),
            code: error.code,
            context
        });
        
        // Categorize error
        const errorInfo = this.categorizeError(error, context);
        
        // Attempt auto-recovery
        if (this.autoRecover && errorInfo.autoFix) {
            const fixed = await errorInfo.autoFix();
            if (fixed) {
                return { recovered: true, action: 'auto-fixed' };
            }
        }
        
        // Check if retriable
        if (errorInfo.retry && context.attempt < this.maxRetries) {
            const delay = this.calculateRetryDelay(context.attempt, errorInfo.retry);
            return {
                recovered: false,
                action: 'retry',
                delay,
                attempt: context.attempt + 1
            };
        }
        
        // Not recoverable
        return {
            recovered: false,
            action: 'fail',
            error: errorInfo,
            suggestions: errorInfo.suggestions || []
        };
    }
    
    categorizeError(error, context) {
        // Check each error type
        const handlers = [
            () => this.checkBinaryError(error, context),
            () => this.checkPermissionError(error, context),
            () => this.checkResourceError(error),
            () => this.checkNetworkError(error),
            () => this.checkArgumentError(error, context),
            () => this.checkMemoryError(error)
        ];
        
        for (const handler of handlers) {
            const result = handler();
            if (result) return result;
        }
        
        // Unknown error
        return {
            type: 'UNKNOWN',
            message: error.message,
            code: error.code,
            suggestions: ['Check system logs', 'Enable verbose mode']
        };
    }
    
    checkBinaryError(error, context) {
        if (error.code === 'ENOENT' && error.syscall === 'spawn') {
            return {
                type: 'BINARY_NOT_FOUND',
                message: `Claude binary not found: ${context.binary}`,
                suggestions: [
                    'Install Claude CLI',
                    `Check if file exists: ${context.binary}`,
                    'Verify PATH environment'
                ],
                autoFix: async () => {
                    // Try to find alternative binary
                    try {
                        const alternative = await this.findAlternativeBinary();
                        context.binary = alternative;
                        return true;
                    } catch {
                        return false;
                    }
                }
            };
        }
    }
    
    checkPermissionError(error, context) {
        if (error.code === 'EACCES') {
            return {
                type: 'PERMISSION_DENIED',
                message: 'Permission denied',
                path: context.binary || context.cwd,
                suggestions: [
                    `chmod +x ${context.binary}`,
                    'Check file ownership',
                    'Run with appropriate permissions'
                ],
                autoFix: async () => {
                    if (context.binary) {
                        try {
                            await fs.chmod(context.binary, 0o755);
                            return true;
                        } catch {
                            return false;
                        }
                    }
                }
            };
        }
    }
    
    checkResourceError(error) {
        if (error.code === 'EAGAIN' || error.code === 'EMFILE') {
            return {
                type: 'RESOURCE_EXHAUSTED',
                message: 'System resources exhausted',
                suggestions: [
                    'Close unused processes',
                    'Increase system limits',
                    'Wait and retry'
                ],
                retry: {
                    attempts: 5,
                    delay: 2000,
                    backoff: 2
                }
            };
        }
    }
    
    checkNetworkError(error) {
        const networkErrors = ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'];
        if (networkErrors.includes(error.code)) {
            return {
                type: 'NETWORK_ERROR',
                message: 'Network connectivity issue',
                code: error.code,
                suggestions: [
                    'Check internet connection',
                    'Verify API endpoint',
                    'Check firewall settings',
                    'Try using a proxy'
                ],
                retry: {
                    attempts: 3,
                    delay: 5000,
                    backoff: 1.5
                }
            };
        }
    }
    
    checkArgumentError(error, context) {
        // Check stderr for argument errors
        if (context.stderr && context.stderr.includes('invalid argument')) {
            return {
                type: 'INVALID_ARGUMENTS',
                message: 'Invalid command arguments',
                stderr: context.stderr,
                suggestions: [
                    'Check argument format',
                    'Verify flag compatibility',
                    'Escape special characters',
                    'Use --help to see valid options'
                ]
            };
        }
    }
    
    checkMemoryError(error) {
        if (error.code === 'ENOMEM' || error.message.includes('heap out of memory')) {
            return {
                type: 'OUT_OF_MEMORY',
                message: 'Out of memory',
                suggestions: [
                    'Increase Node.js heap size',
                    'Free system memory',
                    'Reduce concurrent sessions',
                    'Enable swap space'
                ],
                cleanup: () => {
                    if (global.gc) {
                        global.gc();
                    }
                }
            };
        }
    }
    
    calculateRetryDelay(attempt, retryConfig) {
        const baseDelay = retryConfig.delay || this.retryDelay;
        const backoff = retryConfig.backoff || 1;
        return Math.min(baseDelay * Math.pow(backoff, attempt), 30000);
    }
}
```

## Recovery Strategies

### Automatic Binary Detection
```javascript
async function autoDetectBinary() {
    const strategies = [
        checkSystemPath,
        checkHomebrewPath,
        checkLocalBin,
        checkAppDirectory,
        checkRegistryPath,  // Windows
        downloadBinary       // Last resort
    ];
    
    for (const strategy of strategies) {
        try {
            const binary = await strategy();
            if (binary && await isExecutable(binary)) {
                return binary;
            }
        } catch (error) {
            console.warn(`Strategy ${strategy.name} failed:`, error);
        }
    }
    
    throw new Error('Could not locate Claude binary');
}

async function isExecutable(path) {
    try {
        await fs.access(path, fs.constants.X_OK);
        return true;
    } catch {
        return false;
    }
}
```

### Session Recovery
```javascript
class SessionRecovery {
    constructor() {
        this.orphanedSessions = new Map();
        this.recoveryAttempts = new Map();
    }
    
    async recoverSession(sessionId, error) {
        const attempts = this.recoveryAttempts.get(sessionId) || 0;
        
        if (attempts >= 3) {
            return { success: false, reason: 'max_attempts' };
        }
        
        this.recoveryAttempts.set(sessionId, attempts + 1);
        
        // Try different recovery strategies
        const strategies = [
            () => this.resumeSession(sessionId),
            () => this.recreateSession(sessionId),
            () => this.loadFromCheckpoint(sessionId)
        ];
        
        for (const strategy of strategies) {
            try {
                const result = await strategy();
                if (result.success) {
                    this.recoveryAttempts.delete(sessionId);
                    return result;
                }
            } catch (err) {
                console.warn('Recovery strategy failed:', err);
            }
        }
        
        return { success: false, reason: 'all_strategies_failed' };
    }
    
    async resumeSession(sessionId) {
        // Try to resume with --resume flag
        const process = spawn('claude', [
            '--resume', sessionId,
            '--output-format', 'stream-json',
            '--verbose'
        ]);
        
        return new Promise((resolve) => {
            let resumed = false;
            
            process.stdout.once('data', (chunk) => {
                const line = chunk.toString();
                if (line.includes('"type":"init"')) {
                    resumed = true;
                    resolve({ success: true, process });
                }
            });
            
            process.on('error', () => {
                resolve({ success: false });
            });
            
            setTimeout(() => {
                if (!resumed) {
                    process.kill();
                    resolve({ success: false });
                }
            }, 5000);
        });
    }
}
```

### Graceful Degradation
```javascript
class GracefulDegradation {
    constructor() {
        this.features = {
            streaming: true,
            verbose: true,
            resume: true,
            checkpoints: true
        };
    }
    
    async spawnWithFallback(args, options) {
        // Try with all features
        try {
            return await this.spawnFull(args, options);
        } catch (error) {
            console.warn('Full spawn failed, degrading features');
        }
        
        // Remove optional features
        if (this.features.verbose) {
            args = args.filter(arg => arg !== '--verbose');
            this.features.verbose = false;
        }
        
        // Try without resume
        if (this.features.resume && args.includes('--resume')) {
            args = args.filter(arg => arg !== '--resume')
                       .filter(arg => !arg.match(/^[0-9A-Z]{26}$/));
            this.features.resume = false;
        }
        
        // Last resort - basic spawn
        try {
            return await this.spawnBasic(args, options);
        } catch (error) {
            throw new Error('All spawn strategies failed');
        }
    }
    
    async spawnFull(args, options) {
        return spawn('claude', args, options);
    }
    
    async spawnBasic(args, options) {
        // Minimal arguments only
        const minimalArgs = [
            '-p', args[args.indexOf('-p') + 1],
            '--output-format', 'stream-json'
        ];
        return spawn('claude', minimalArgs, options);
    }
}
```

## Error Monitoring

```javascript
class ErrorMonitor {
    constructor() {
        this.errors = [];
        this.patterns = new Map();
        this.thresholds = {
            total: 100,
            perType: 10,
            timeWindow: 60000  // 1 minute
        };
    }
    
    recordError(error, context) {
        const entry = {
            timestamp: Date.now(),
            type: error.code || error.type,
            message: error.message,
            context,
            stack: error.stack
        };
        
        this.errors.push(entry);
        this.updatePatterns(entry);
        this.checkThresholds();
        this.cleanup();
    }
    
    updatePatterns(entry) {
        const pattern = `${entry.type}:${entry.context.action}`;
        const count = this.patterns.get(pattern) || 0;
        this.patterns.set(pattern, count + 1);
    }
    
    checkThresholds() {
        const recentErrors = this.getRecentErrors();
        
        if (recentErrors.length > this.thresholds.total) {
            this.emit('threshold_exceeded', {
                type: 'total',
                count: recentErrors.length
            });
        }
        
        for (const [pattern, count] of this.patterns) {
            if (count > this.thresholds.perType) {
                this.emit('pattern_detected', {
                    pattern,
                    count
                });
            }
        }
    }
    
    getRecentErrors() {
        const cutoff = Date.now() - this.thresholds.timeWindow;
        return this.errors.filter(e => e.timestamp > cutoff);
    }
    
    cleanup() {
        // Remove old errors
        const cutoff = Date.now() - 3600000;  // 1 hour
        this.errors = this.errors.filter(e => e.timestamp > cutoff);
    }
    
    getReport() {
        return {
            total: this.errors.length,
            recent: this.getRecentErrors().length,
            patterns: Array.from(this.patterns.entries()),
            mostCommon: this.getMostCommonError(),
            suggestions: this.generateSuggestions()
        };
    }
    
    getMostCommonError() {
        const counts = {};
        for (const error of this.errors) {
            counts[error.type] = (counts[error.type] || 0) + 1;
        }
        return Object.entries(counts)
            .sort(([,a], [,b]) => b - a)[0];
    }
    
    generateSuggestions() {
        const suggestions = [];
        
        if (this.patterns.get('ENOENT:spawn') > 5) {
            suggestions.push('Binary not found - check installation');
        }
        
        if (this.patterns.get('EAGAIN:spawn') > 3) {
            suggestions.push('Resource limits - increase ulimits');
        }
        
        if (this.patterns.get('EACCES:spawn') > 2) {
            suggestions.push('Permission issues - check file permissions');
        }
        
        return suggestions;
    }
}
```

## User-Friendly Error Messages

```javascript
function formatErrorForUser(error, technical = false) {
    const userMessages = {
        BINARY_NOT_FOUND: 'Claude CLI is not installed. Please install it first.',
        PERMISSION_DENIED: 'Cannot run Claude CLI. Please check file permissions.',
        RESOURCE_EXHAUSTED: 'Too many processes running. Please try again.',
        NETWORK_ERROR: 'Cannot connect to Claude API. Check your internet connection.',
        INVALID_ARGUMENTS: 'Invalid command. Please check your input.',
        OUT_OF_MEMORY: 'Out of memory. Please close other applications.',
        CWD_NOT_FOUND: 'Project folder not found. Please check the path.',
        API_LIMIT: 'API rate limit reached. Please wait before trying again.',
        AUTH_FAILED: 'Authentication failed. Please check your credentials.',
        UNKNOWN: 'An unexpected error occurred. Please try again.'
    };
    
    const message = userMessages[error.type] || userMessages.UNKNOWN;
    
    if (technical) {
        return {
            message,
            details: error.message,
            code: error.code,
            suggestions: error.suggestions
        };
    }
    
    return message;
}
```