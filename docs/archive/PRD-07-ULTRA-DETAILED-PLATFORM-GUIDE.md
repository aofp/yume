# Ultra-Detailed Platform Implementation Guide
## Exhaustive Steps for Windows, WSL, and macOS Compatibility

---

## Table of Contents
1. [Platform Detection Logic](#platform-detection-logic)
2. [Windows Native Implementation](#windows-native-implementation)
3. [WSL Implementation](#wsl-implementation)
4. [macOS Implementation](#macos-implementation)
5. [Path Translation Matrix](#path-translation-matrix)
6. [Testing Procedures](#testing-procedures)
7. [Verification Checklists](#verification-checklists)
8. [Platform-Specific Gotchas](#platform-specific-gotchas)
9. [Emergency Recovery](#emergency-recovery)

---

## Platform Detection Logic

### Step 1: Comprehensive Platform Detection
```rust
// src-tauri/src/platform_detector.rs
use std::process::Command;
use std::env;
use std::path::PathBuf;

#[derive(Debug, Clone)]
pub enum Platform {
    WindowsNative {
        node_path: PathBuf,
        claude_path: PathBuf,
        has_wsl: bool,
    },
    WindowsWSL {
        wsl_distro: String,
        wsl_user: String,
        node_path: String,  // WSL path format
        claude_path: String, // WSL path format
    },
    MacOS {
        arch: MacArch,
        node_path: PathBuf,
        claude_path: PathBuf,
        homebrew_prefix: PathBuf,
    },
    Linux {
        distro: String,
        node_path: PathBuf,
        claude_path: PathBuf,
    },
}

#[derive(Debug, Clone)]
pub enum MacArch {
    Intel,
    AppleSilicon,
}

pub struct PlatformDetector;

impl PlatformDetector {
    pub async fn detect() -> Result<Platform, String> {
        #[cfg(target_os = "windows")]
        {
            self::detect_windows().await
        }
        
        #[cfg(target_os = "macos")]
        {
            self::detect_macos().await
        }
        
        #[cfg(target_os = "linux")]
        {
            self::detect_linux().await
        }
    }
    
    #[cfg(target_os = "windows")]
    async fn detect_windows() -> Result<Platform, String> {
        // Step 1: Check if WSL is available and preferred
        let wsl_available = self::check_wsl_available().await;
        let prefer_wsl = env::var("YURUCODE_PREFER_WSL")
            .map(|v| v == "true")
            .unwrap_or(false);
        
        // Step 2: Try native Windows first (unless WSL is preferred)
        if !prefer_wsl {
            if let Ok(native) = self::detect_windows_native().await {
                return Ok(native);
            }
        }
        
        // Step 3: Try WSL if available
        if wsl_available {
            if let Ok(wsl) = self::detect_windows_wsl().await {
                return Ok(wsl);
            }
        }
        
        // Step 4: Fallback to native if WSL failed
        if prefer_wsl {
            if let Ok(native) = self::detect_windows_native().await {
                return Ok(native);
            }
        }
        
        Err("Could not detect valid Windows environment".to_string())
    }
    
    async fn check_wsl_available() -> bool {
        Command::new("wsl.exe")
            .args(&["--status"])
            .output()
            .await
            .map(|output| output.status.success())
            .unwrap_or(false)
    }
    
    async fn detect_windows_native() -> Result<Platform, String> {
        // Find Node.js
        let node_paths = vec![
            PathBuf::from(r"C:\Program Files\nodejs\node.exe"),
            PathBuf::from(r"C:\Program Files (x86)\nodejs\node.exe"),
            PathBuf::from(format!(r"{}\.nvm\nodejs\node.exe", env::var("USERPROFILE").unwrap_or_default())),
            PathBuf::from(format!(r"{}\scoop\apps\nodejs\current\node.exe", env::var("USERPROFILE").unwrap_or_default())),
        ];
        
        let mut node_path = None;
        for path in node_paths {
            if path.exists() {
                // Verify it actually works
                let test = Command::new(&path)
                    .arg("--version")
                    .output()
                    .await;
                
                if test.is_ok() && test.unwrap().status.success() {
                    node_path = Some(path);
                    break;
                }
            }
        }
        
        let node_path = node_path.ok_or("Node.js not found in Windows")?;
        
        // Find Claude
        let claude_paths = vec![
            PathBuf::from(format!(r"{}\AppData\Roaming\npm\claude.cmd", env::var("USERPROFILE").unwrap_or_default())),
            PathBuf::from(format!(r"{}\AppData\Roaming\npm\node_modules\@anthropic\claude-cli\bin\claude", env::var("USERPROFILE").unwrap_or_default())),
            PathBuf::from(r"C:\Program Files\Claude\claude.exe"),
        ];
        
        let mut claude_path = None;
        for path in claude_paths {
            if path.exists() {
                claude_path = Some(path);
                break;
            }
        }
        
        // If not found, try using where command
        if claude_path.is_none() {
            let where_result = Command::new("where")
                .arg("claude")
                .output()
                .await;
            
            if let Ok(output) = where_result {
                if output.status.success() {
                    let path_str = String::from_utf8_lossy(&output.stdout);
                    if let Some(first_line) = path_str.lines().next() {
                        claude_path = Some(PathBuf::from(first_line.trim()));
                    }
                }
            }
        }
        
        let claude_path = claude_path.ok_or("Claude not found in Windows")?;
        
        // Check if WSL is available (for information)
        let has_wsl = self::check_wsl_available().await;
        
        Ok(Platform::WindowsNative {
            node_path,
            claude_path,
            has_wsl,
        })
    }
    
    async fn detect_windows_wsl() -> Result<Platform, String> {
        // Get default WSL distro
        let distro_output = Command::new("wsl.exe")
            .args(&["--list", "--verbose"])
            .output()
            .await
            .map_err(|e| format!("Failed to list WSL distros: {}", e))?;
        
        let distro_str = String::from_utf8_lossy(&distro_output.stdout);
        let default_distro = distro_str
            .lines()
            .find(|line| line.contains("*"))
            .and_then(|line| line.split_whitespace().nth(1))
            .unwrap_or("Ubuntu")
            .to_string();
        
        // Get WSL username
        let user_output = Command::new("wsl.exe")
            .args(&["-d", &default_distro, "-e", "whoami"])
            .output()
            .await
            .map_err(|e| format!("Failed to get WSL user: {}", e))?;
        
        let wsl_user = String::from_utf8_lossy(&user_output.stdout)
            .trim()
            .to_string();
        
        // Find Node.js in WSL
        let node_check = Command::new("wsl.exe")
            .args(&["-d", &default_distro, "-e", "which", "node"])
            .output()
            .await;
        
        let node_path = if let Ok(output) = node_check {
            if output.status.success() {
                String::from_utf8_lossy(&output.stdout).trim().to_string()
            } else {
                // Try common locations
                let paths = vec![
                    "/usr/bin/node",
                    "/usr/local/bin/node",
                    format!("/home/{}/.nvm/versions/node/*/bin/node", wsl_user),
                ];
                
                let mut found = None;
                for path in paths {
                    let test = Command::new("wsl.exe")
                        .args(&["-d", &default_distro, "-e", "test", "-f", &path])
                        .output()
                        .await;
                    
                    if test.is_ok() && test.unwrap().status.success() {
                        found = Some(path);
                        break;
                    }
                }
                
                found.ok_or("Node.js not found in WSL")?
            }
        } else {
            return Err("Failed to check for Node.js in WSL".to_string());
        };
        
        // Find Claude in WSL
        let claude_paths = vec![
            format!("/home/{}/.claude/local/node_modules/.bin/claude", wsl_user),
            format!("/home/{}/.npm-global/bin/claude", wsl_user),
            format!("/home/{}/node_modules/.bin/claude", wsl_user),
            "/usr/local/bin/claude".to_string(),
            "/usr/bin/claude".to_string(),
        ];
        
        let mut claude_path = None;
        for path in claude_paths {
            let test = Command::new("wsl.exe")
                .args(&["-d", &default_distro, "-e", "test", "-f", &path])
                .output()
                .await;
            
            if test.is_ok() && test.unwrap().status.success() {
                // Verify it's executable
                let exec_test = Command::new("wsl.exe")
                    .args(&["-d", &default_distro, "-e", "test", "-x", &path])
                    .output()
                    .await;
                
                if exec_test.is_ok() && exec_test.unwrap().status.success() {
                    claude_path = Some(path);
                    break;
                }
            }
        }
        
        let claude_path = claude_path.ok_or("Claude not found in WSL")?;
        
        Ok(Platform::WindowsWSL {
            wsl_distro: default_distro,
            wsl_user,
            node_path,
            claude_path,
        })
    }
    
    #[cfg(target_os = "macos")]
    async fn detect_macos() -> Result<Platform, String> {
        // Detect architecture
        let arch_output = Command::new("uname")
            .arg("-m")
            .output()
            .await
            .map_err(|e| format!("Failed to detect architecture: {}", e))?;
        
        let arch_str = String::from_utf8_lossy(&arch_output.stdout).trim().to_string();
        let arch = match arch_str.as_str() {
            "arm64" => MacArch::AppleSilicon,
            "x86_64" => MacArch::Intel,
            _ => return Err(format!("Unknown architecture: {}", arch_str)),
        };
        
        // Determine Homebrew prefix based on architecture
        let homebrew_prefix = match arch {
            MacArch::AppleSilicon => PathBuf::from("/opt/homebrew"),
            MacArch::Intel => PathBuf::from("/usr/local"),
        };
        
        // Find Node.js
        let node_paths = vec![
            homebrew_prefix.join("bin/node"),
            PathBuf::from("/usr/local/bin/node"),
            PathBuf::from("/opt/homebrew/bin/node"),
            PathBuf::from(format!("{}/.nvm/versions/node/*/bin/node", env::var("HOME").unwrap_or_default())),
            PathBuf::from(format!("{}/.volta/bin/node", env::var("HOME").unwrap_or_default())),
        ];
        
        let mut node_path = None;
        for path in node_paths {
            if path.exists() {
                // Verify it works
                let test = Command::new(&path)
                    .arg("--version")
                    .output()
                    .await;
                
                if test.is_ok() && test.unwrap().status.success() {
                    node_path = Some(path);
                    break;
                }
            }
        }
        
        let node_path = node_path.ok_or("Node.js not found on macOS")?;
        
        // Find Claude
        let claude_paths = vec![
            homebrew_prefix.join("bin/claude"),
            PathBuf::from("/usr/local/bin/claude"),
            PathBuf::from("/opt/homebrew/bin/claude"),
            PathBuf::from(format!("{}/.npm-global/bin/claude", env::var("HOME").unwrap_or_default())),
            PathBuf::from(format!("{}/node_modules/.bin/claude", env::var("HOME").unwrap_or_default())),
            PathBuf::from(format!("{}/.claude/local/node_modules/.bin/claude", env::var("HOME").unwrap_or_default())),
        ];
        
        let mut claude_path = None;
        for path in claude_paths {
            if path.exists() {
                // Check if it's a symlink and resolve it
                let real_path = fs::canonicalize(&path).unwrap_or(path.clone());
                
                // Verify it's executable
                let metadata = fs::metadata(&real_path);
                if metadata.is_ok() {
                    claude_path = Some(real_path);
                    break;
                }
            }
        }
        
        // If not found, try using which
        if claude_path.is_none() {
            let which_result = Command::new("which")
                .arg("claude")
                .output()
                .await;
            
            if let Ok(output) = which_result {
                if output.status.success() {
                    let path_str = String::from_utf8_lossy(&output.stdout);
                    if let Some(first_line) = path_str.lines().next() {
                        claude_path = Some(PathBuf::from(first_line.trim()));
                    }
                }
            }
        }
        
        let claude_path = claude_path.ok_or("Claude not found on macOS")?;
        
        Ok(Platform::MacOS {
            arch,
            node_path,
            claude_path,
            homebrew_prefix,
        })
    }
}
```

---

## Windows Native Implementation

### Step 2.1: Windows-Specific Claude Executor
```rust
// src-tauri/src/windows_executor.rs
use std::process::Stdio;
use tokio::process::{Command, Child};
use std::path::PathBuf;
use std::env;

pub struct WindowsNativeExecutor {
    node_path: PathBuf,
    claude_path: PathBuf,
    process: Option<Child>,
}

impl WindowsNativeExecutor {
    pub fn new(node_path: PathBuf, claude_path: PathBuf) -> Self {
        Self {
            node_path,
            claude_path,
            process: None,
        }
    }
    
    pub async fn execute_claude(
        &mut self,
        args: Vec<String>,
        working_dir: &str,
        message: Option<String>,
    ) -> Result<(), String> {
        // Step 1: Validate working directory
        let work_dir = PathBuf::from(working_dir);
        if !work_dir.exists() {
            return Err(format!("Working directory does not exist: {}", working_dir));
        }
        
        // Step 2: Determine if we're running a .cmd file
        let is_cmd = self.claude_path.extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext == "cmd" || ext == "bat")
            .unwrap_or(false);
        
        // Step 3: Build command based on file type
        let mut cmd = if is_cmd {
            // For .cmd files, we need to use cmd.exe
            let mut c = Command::new("cmd.exe");
            c.args(&["/C", self.claude_path.to_str().unwrap()]);
            c.args(args);
            c
        } else if self.claude_path.to_str().unwrap().ends_with(".js") {
            // For .js files, use Node.js directly
            let mut c = Command::new(&self.node_path);
            c.arg(self.claude_path.to_str().unwrap());
            c.args(args);
            c
        } else {
            // For .exe or other executables
            let mut c = Command::new(&self.claude_path);
            c.args(args);
            c
        };
        
        // Step 4: Set up environment
        cmd.current_dir(working_dir);
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());
        cmd.stdin(Stdio::piped());
        
        // Add Node.js to PATH for .cmd execution
        let mut path_var = env::var("PATH").unwrap_or_default();
        if let Some(node_dir) = self.node_path.parent() {
            path_var = format!("{};{}", node_dir.to_str().unwrap(), path_var);
        }
        cmd.env("PATH", path_var);
        
        // Hide console window on Windows
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        
        // Step 5: Spawn the process
        let mut child = cmd.spawn()
            .map_err(|e| format!("Failed to spawn Claude process: {}", e))?;
        
        // Step 6: Send input if provided
        if let Some(msg) = message {
            if let Some(mut stdin) = child.stdin.take() {
                use tokio::io::AsyncWriteExt;
                stdin.write_all(msg.as_bytes()).await
                    .map_err(|e| format!("Failed to write to stdin: {}", e))?;
                stdin.shutdown().await
                    .map_err(|e| format!("Failed to close stdin: {}", e))?;
            }
        }
        
        self.process = Some(child);
        Ok(())
    }
    
    pub async fn read_output(&mut self) -> Result<Vec<String>, String> {
        let process = self.process.as_mut()
            .ok_or("No process running")?;
        
        let stdout = process.stdout.as_mut()
            .ok_or("No stdout available")?;
        
        use tokio::io::{AsyncBufReadExt, BufReader};
        let mut reader = BufReader::new(stdout);
        let mut lines = Vec::new();
        let mut line = String::new();
        
        // Read with timeout to prevent hanging
        let timeout = tokio::time::Duration::from_secs(30);
        let read_future = async {
            while reader.read_line(&mut line).await? > 0 {
                lines.push(line.trim().to_string());
                line.clear();
                
                // Break if we see a completion signal
                if lines.last().map(|l| l.contains("\"type\":\"message_stop\"")).unwrap_or(false) {
                    break;
                }
            }
            Ok::<_, std::io::Error>(())
        };
        
        tokio::time::timeout(timeout, read_future).await
            .map_err(|_| "Read timeout".to_string())?
            .map_err(|e| format!("Read error: {}", e))?;
        
        Ok(lines)
    }
    
    pub async fn kill_process(&mut self) -> Result<(), String> {
        if let Some(mut process) = self.process.take() {
            // Try graceful shutdown first
            process.kill().await
                .map_err(|e| format!("Failed to kill process: {}", e))?;
        }
        Ok(())
    }
}

// Windows-specific path utilities
pub fn normalize_windows_path(path: &str) -> String {
    // Handle various path formats
    let mut normalized = path.replace('/', '\\');
    
    // Handle UNC paths
    if normalized.starts_with("\\\\") {
        return normalized;
    }
    
    // Handle relative paths
    if !normalized.contains(':') && !normalized.starts_with('\\') {
        // It's a relative path, keep as is
        return normalized;
    }
    
    // Ensure drive letter is uppercase
    if normalized.len() >= 2 && normalized.chars().nth(1) == Some(':') {
        let drive = normalized.chars().next().unwrap().to_uppercase().to_string();
        normalized = format!("{}{}", drive, &normalized[1..]);
    }
    
    normalized
}

// Validate Windows path
pub fn validate_windows_path(path: &str) -> Result<(), String> {
    // Check for invalid characters
    const INVALID_CHARS: &[char] = &['<', '>', '|', '"', '?', '*'];
    for c in INVALID_CHARS {
        if path.contains(*c) && !path.starts_with("\\\\?\\") {
            return Err(format!("Path contains invalid character: {}", c));
        }
    }
    
    // Check for reserved names
    const RESERVED_NAMES: &[&str] = &[
        "CON", "PRN", "AUX", "NUL",
        "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
        "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ];
    
    let path_upper = path.to_uppercase();
    for reserved in RESERVED_NAMES {
        if path_upper.contains(reserved) {
            return Err(format!("Path contains reserved name: {}", reserved));
        }
    }
    
    Ok(())
}
```

---

## WSL Implementation

### Step 3.1: WSL-Specific Claude Executor
```rust
// src-tauri/src/wsl_executor.rs
use tokio::process::{Command, Child};
use std::path::PathBuf;

pub struct WSLExecutor {
    wsl_distro: String,
    wsl_user: String,
    node_path: String,      // WSL path format
    claude_path: String,    // WSL path format
    process: Option<Child>,
}

impl WSLExecutor {
    pub fn new(wsl_distro: String, wsl_user: String, node_path: String, claude_path: String) -> Self {
        Self {
            wsl_distro,
            wsl_user,
            node_path,
            claude_path,
            process: None,
        }
    }
    
    pub async fn execute_claude(
        &mut self,
        args: Vec<String>,
        working_dir: &str,
        message: Option<String>,
    ) -> Result<(), String> {
        // Step 1: Convert Windows path to WSL path
        let wsl_working_dir = self.windows_to_wsl_path(working_dir)?;
        
        // Step 2: Validate the path exists in WSL
        let path_check = Command::new("wsl.exe")
            .args(&[
                "-d", &self.wsl_distro,
                "-e", "test", "-d", &wsl_working_dir
            ])
            .output()
            .await
            .map_err(|e| format!("Failed to check WSL path: {}", e))?;
        
        if !path_check.status.success() {
            // Try to create the directory
            let mkdir_result = Command::new("wsl.exe")
                .args(&[
                    "-d", &self.wsl_distro,
                    "-e", "mkdir", "-p", &wsl_working_dir
                ])
                .output()
                .await;
            
            if mkdir_result.is_err() || !mkdir_result.unwrap().status.success() {
                return Err(format!("Working directory not accessible in WSL: {}", wsl_working_dir));
            }
        }
        
        // Step 3: Build the command for WSL execution
        let mut wsl_args = vec![
            "-d".to_string(),
            self.wsl_distro.clone(),
            "-e".to_string(),
            "bash".to_string(),
            "-c".to_string(),
        ];
        
        // Step 4: Construct the bash command
        let mut bash_command = format!("cd '{}' && ", wsl_working_dir);
        
        // Set up environment
        bash_command.push_str(&format!(
            "export PATH='{}:$PATH' && ",
            self.node_path.parent().unwrap_or(&self.node_path)
        ));
        
        // Add the Claude execution
        if let Some(msg) = message {
            // Escape the message for bash
            let escaped_msg = msg
                .replace('\\', "\\\\")
                .replace('\'', "\\'")
                .replace('\n', "\\n");
            
            bash_command.push_str(&format!(
                "echo '{}' | '{}' {}",
                escaped_msg,
                self.claude_path,
                args.join(" ")
            ));
        } else {
            bash_command.push_str(&format!(
                "'{}' {}",
                self.claude_path,
                args.join(" ")
            ));
        }
        
        // Add output formatting
        bash_command.push_str(" 2>&1");
        
        wsl_args.push(bash_command);
        
        // Step 5: Create and spawn the command
        let mut cmd = Command::new("wsl.exe");
        cmd.args(&wsl_args);
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());
        
        // Hide console window
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        
        let child = cmd.spawn()
            .map_err(|e| format!("Failed to spawn WSL process: {}", e))?;
        
        self.process = Some(child);
        Ok(())
    }
    
    pub fn windows_to_wsl_path(&self, windows_path: &str) -> Result<String, String> {
        // Handle empty path
        if windows_path.is_empty() {
            return Ok(format!("/home/{}", self.wsl_user));
        }
        
        let mut path = windows_path.replace('\\', "/");
        
        // Handle drive letters
        if path.len() >= 2 && path.chars().nth(1) == Some(':') {
            let drive = path.chars().next().unwrap().to_lowercase();
            path = format!("/mnt/{}/{}", drive, &path[3..]);
        }
        
        // Handle UNC paths
        else if path.starts_with("//") {
            // Convert UNC to WSL format
            // \\server\share -> /mnt/unc/server/share
            path = path.replacen("//", "/mnt/unc/", 1);
        }
        
        // Clean up multiple slashes
        while path.contains("//") {
            path = path.replace("//", "/");
        }
        
        // Remove trailing slash unless it's root
        if path.len() > 1 && path.ends_with('/') {
            path.pop();
        }
        
        Ok(path)
    }
    
    pub fn wsl_to_windows_path(&self, wsl_path: &str) -> Result<String, String> {
        // Handle /mnt/x/ format
        if wsl_path.starts_with("/mnt/") && wsl_path.len() > 6 {
            let parts: Vec<&str> = wsl_path[5..].split('/').collect();
            if !parts.is_empty() && parts[0].len() == 1 {
                let drive = parts[0].to_uppercase();
                let rest = parts[1..].join("\\");
                return Ok(format!("{}:\\{}", drive, rest));
            }
        }
        
        // Handle home directory
        if wsl_path.starts_with(&format!("/home/{}", self.wsl_user)) {
            // Convert to Windows user profile
            if let Ok(profile) = env::var("USERPROFILE") {
                let relative = &wsl_path[format!("/home/{}", self.wsl_user).len()..];
                return Ok(format!("{}\\WSL{}", profile, relative.replace('/', "\\")));
            }
        }
        
        // Return as-is if can't convert
        Ok(wsl_path.to_string())
    }
    
    pub async fn validate_wsl_setup(&self) -> Result<(), String> {
        // Check WSL distro exists
        let distro_check = Command::new("wsl.exe")
            .args(&["--list", "--verbose"])
            .output()
            .await
            .map_err(|e| format!("Failed to list WSL distros: {}", e))?;
        
        let output = String::from_utf8_lossy(&distro_check.stdout);
        if !output.contains(&self.wsl_distro) {
            return Err(format!("WSL distro '{}' not found", self.wsl_distro));
        }
        
        // Check Node.js in WSL
        let node_check = Command::new("wsl.exe")
            .args(&[
                "-d", &self.wsl_distro,
                "-e", "test", "-f", &self.node_path
            ])
            .output()
            .await
            .map_err(|e| format!("Failed to check Node.js: {}", e))?;
        
        if !node_check.status.success() {
            return Err(format!("Node.js not found at: {}", self.node_path));
        }
        
        // Check Claude in WSL
        let claude_check = Command::new("wsl.exe")
            .args(&[
                "-d", &self.wsl_distro,
                "-e", "test", "-x", &self.claude_path
            ])
            .output()
            .await
            .map_err(|e| format!("Failed to check Claude: {}", e))?;
        
        if !claude_check.status.success() {
            return Err(format!("Claude not executable at: {}", self.claude_path));
        }
        
        Ok(())
    }
}

// Test WSL functionality
pub async fn test_wsl_execution() -> Result<(), String> {
    println!("Testing WSL execution...");
    
    // Test 1: Basic command
    let output = Command::new("wsl.exe")
        .args(&["-e", "echo", "Hello from WSL"])
        .output()
        .await
        .map_err(|e| format!("WSL test failed: {}", e))?;
    
    if !output.status.success() {
        return Err("WSL echo test failed".to_string());
    }
    
    println!("✓ Basic WSL command works");
    
    // Test 2: Path translation
    let test_paths = vec![
        ("C:\\Users\\Test", "/mnt/c/Users/Test"),
        ("D:\\Projects\\My Project", "/mnt/d/Projects/My Project"),
        ("\\\\server\\share", "/mnt/unc/server/share"),
    ];
    
    for (windows, expected_wsl) in test_paths {
        let executor = WSLExecutor::new(
            "Ubuntu".to_string(),
            "user".to_string(),
            "/usr/bin/node".to_string(),
            "/usr/bin/claude".to_string(),
        );
        
        let converted = executor.windows_to_wsl_path(windows)?;
        if converted != expected_wsl {
            return Err(format!(
                "Path conversion failed: {} -> {} (expected {})",
                windows, converted, expected_wsl
            ));
        }
    }
    
    println!("✓ Path translation works");
    
    Ok(())
}
```

---

## macOS Implementation

### Step 4.1: macOS-Specific Claude Executor
```rust
// src-tauri/src/macos_executor.rs
use tokio::process::{Command, Child};
use std::path::PathBuf;
use std::env;

pub struct MacOSExecutor {
    arch: MacArch,
    node_path: PathBuf,
    claude_path: PathBuf,
    homebrew_prefix: PathBuf,
    process: Option<Child>,
}

impl MacOSExecutor {
    pub fn new(
        arch: MacArch,
        node_path: PathBuf,
        claude_path: PathBuf,
        homebrew_prefix: PathBuf,
    ) -> Self {
        Self {
            arch,
            node_path,
            claude_path,
            homebrew_prefix,
            process: None,
        }
    }
    
    pub async fn execute_claude(
        &mut self,
        args: Vec<String>,
        working_dir: &str,
        message: Option<String>,
    ) -> Result<(), String> {
        // Step 1: Resolve symlinks and validate paths
        let resolved_claude = std::fs::canonicalize(&self.claude_path)
            .map_err(|e| format!("Failed to resolve Claude path: {}", e))?;
        
        let resolved_node = std::fs::canonicalize(&self.node_path)
            .map_err(|e| format!("Failed to resolve Node path: {}", e))?;
        
        // Step 2: Check if Claude is a script or binary
        let is_script = resolved_claude
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext == "js" || ext == "mjs" || ext == "cjs")
            .unwrap_or(false);
        
        // Step 3: Build command
        let mut cmd = if is_script {
            // Use Node.js to run the script
            let mut c = Command::new(&resolved_node);
            c.arg(&resolved_claude);
            c.args(args);
            c
        } else {
            // Direct execution
            let mut c = Command::new(&resolved_claude);
            c.args(args);
            c
        };
        
        // Step 4: Set up environment
        cmd.current_dir(working_dir);
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());
        cmd.stdin(Stdio::piped());
        
        // Build comprehensive PATH
        let mut path_components = vec![];
        
        // Add Homebrew paths based on architecture
        match self.arch {
            MacArch::AppleSilicon => {
                path_components.push("/opt/homebrew/bin");
                path_components.push("/opt/homebrew/sbin");
            }
            MacArch::Intel => {
                path_components.push("/usr/local/bin");
                path_components.push("/usr/local/sbin");
            }
        }
        
        // Add common paths
        path_components.extend(&[
            "/usr/bin",
            "/bin",
            "/usr/sbin",
            "/sbin",
        ]);
        
        // Add Node.js directory
        if let Some(node_dir) = resolved_node.parent() {
            path_components.insert(0, node_dir.to_str().unwrap());
        }
        
        // Add npm global directory
        if let Ok(home) = env::var("HOME") {
            path_components.push(&format!("{}/.npm-global/bin", home));
        }
        
        let path_var = path_components.join(":");
        cmd.env("PATH", path_var);
        
        // Set other important environment variables
        cmd.env("NODE_ENV", "production");
        cmd.env("LANG", "en_US.UTF-8");
        
        // For Apple Silicon, ensure correct architecture
        if matches!(self.arch, MacArch::AppleSilicon) {
            cmd.env("ARCHFLAGS", "-arch arm64");
        }
        
        // Step 5: Handle sandboxing and permissions
        // Remove quarantine flag if present
        let _ = Command::new("xattr")
            .args(&["-cr", resolved_claude.to_str().unwrap()])
            .output()
            .await;
        
        // Step 6: Spawn process
        let mut child = cmd.spawn()
            .map_err(|e| format!("Failed to spawn Claude process: {}", e))?;
        
        // Step 7: Send input if provided
        if let Some(msg) = message {
            if let Some(mut stdin) = child.stdin.take() {
                use tokio::io::AsyncWriteExt;
                stdin.write_all(msg.as_bytes()).await
                    .map_err(|e| format!("Failed to write to stdin: {}", e))?;
                stdin.shutdown().await
                    .map_err(|e| format!("Failed to close stdin: {}", e))?;
            }
        }
        
        self.process = Some(child);
        Ok(())
    }
    
    pub async fn validate_macos_setup(&self) -> Result<(), String> {
        // Check Node.js version
        let node_version = Command::new(&self.node_path)
            .arg("--version")
            .output()
            .await
            .map_err(|e| format!("Failed to check Node.js version: {}", e))?;
        
        if !node_version.status.success() {
            return Err("Node.js not working properly".to_string());
        }
        
        let version_str = String::from_utf8_lossy(&node_version.stdout);
        println!("Node.js version: {}", version_str.trim());
        
        // Check Claude accessibility
        let claude_test = Command::new(&self.claude_path)
            .arg("--version")
            .output()
            .await;
        
        if let Err(e) = claude_test {
            return Err(format!("Claude not accessible: {}", e));
        }
        
        // Check Homebrew (for package management)
        let brew_check = Command::new("brew")
            .arg("--version")
            .output()
            .await;
        
        if brew_check.is_ok() {
            println!("Homebrew is installed");
        } else {
            println!("Warning: Homebrew not found (optional)");
        }
        
        Ok(())
    }
    
    pub async fn fix_permissions(&self) -> Result<(), String> {
        // Remove quarantine attributes
        let paths = vec![
            self.claude_path.to_str().unwrap(),
            self.node_path.to_str().unwrap(),
        ];
        
        for path in paths {
            let _ = Command::new("xattr")
                .args(&["-cr", path])
                .output()
                .await;
            
            // Make executable
            let _ = Command::new("chmod")
                .args(&["+x", path])
                .output()
                .await;
        }
        
        Ok(())
    }
}

// macOS-specific utilities
pub fn expand_tilde_path(path: &str) -> String {
    if path.starts_with('~') {
        if let Ok(home) = env::var("HOME") {
            return path.replacen('~', &home, 1);
        }
    }
    path.to_string()
}

pub fn resolve_macos_alias(path: &PathBuf) -> PathBuf {
    // Try to resolve as symlink
    if let Ok(resolved) = std::fs::canonicalize(path) {
        return resolved;
    }
    
    // Check if it's a macOS alias (using Finder aliases)
    // This requires additional implementation for .alias files
    
    path.clone()
}
```

---

## Path Translation Matrix

### Step 5: Comprehensive Path Translation
```rust
// src-tauri/src/path_translator.rs

pub struct PathTranslator;

impl PathTranslator {
    pub fn translate(from_platform: &Platform, to_platform: &Platform, path: &str) -> Result<String, String> {
        match (from_platform, to_platform) {
            // Windows Native to WSL
            (Platform::WindowsNative { .. }, Platform::WindowsWSL { wsl_user, .. }) => {
                Self::windows_to_wsl(path, wsl_user)
            }
            
            // WSL to Windows Native
            (Platform::WindowsWSL { wsl_user, .. }, Platform::WindowsNative { .. }) => {
                Self::wsl_to_windows(path, wsl_user)
            }
            
            // Same platform - no translation needed
            _ => Ok(path.to_string()),
        }
    }
    
    fn windows_to_wsl(path: &str, wsl_user: &str) -> Result<String, String> {
        let test_cases = vec![
            // Standard paths
            ("C:\\Users\\John\\Documents", "/mnt/c/Users/John/Documents"),
            ("D:\\Projects", "/mnt/d/Projects"),
            
            // Paths with spaces
            ("C:\\Program Files\\App", "/mnt/c/Program Files/App"),
            ("C:\\My Documents\\My File.txt", "/mnt/c/My Documents/My File.txt"),
            
            // UNC paths
            ("\\\\server\\share\\file", "/mnt/unc/server/share/file"),
            
            // Relative paths
            (".\\folder\\file.txt", "./folder/file.txt"),
            ("..\\parent\\file.txt", "../parent/file.txt"),
            
            // Special characters
            ("C:\\Path (with) [brackets]", "/mnt/c/Path (with) [brackets]"),
            ("C:\\Path & special @ chars", "/mnt/c/Path & special @ chars"),
            
            // Unicode paths
            ("C:\\文档\\文件.txt", "/mnt/c/文档/文件.txt"),
            ("C:\\Путь\\файл.txt", "/mnt/c/Путь/файл.txt"),
        ];
        
        // Implement conversion logic here
        let mut result = path.replace('\\', "/");
        
        // Handle drive letters
        if result.len() >= 2 && result.chars().nth(1) == Some(':') {
            let drive = result.chars().next().unwrap().to_lowercase();
            result = format!("/mnt/{}/{}", drive, &result[3..]);
        }
        
        // Handle UNC paths
        else if result.starts_with("//") {
            result = result.replacen("//", "/mnt/unc/", 1);
        }
        
        Ok(result)
    }
    
    fn wsl_to_windows(path: &str, wsl_user: &str) -> Result<String, String> {
        // Reverse translation
        if path.starts_with("/mnt/") && path.len() > 6 {
            let parts: Vec<&str> = path[5..].split('/').collect();
            if !parts.is_empty() && parts[0].len() == 1 {
                let drive = parts[0].to_uppercase();
                let rest = parts[1..].join("\\");
                return Ok(format!("{}:\\{}", drive, rest));
            }
        }
        
        // Handle UNC paths
        if path.starts_with("/mnt/unc/") {
            let rest = &path[9..].replace('/', "\\");
            return Ok(format!("\\\\{}", rest));
        }
        
        Ok(path.to_string())
    }
}

// Path validation for each platform
pub struct PathValidator;

impl PathValidator {
    pub fn validate(platform: &Platform, path: &str) -> Result<(), String> {
        match platform {
            Platform::WindowsNative { .. } => Self::validate_windows(path),
            Platform::WindowsWSL { .. } => Self::validate_wsl(path),
            Platform::MacOS { .. } => Self::validate_macos(path),
            Platform::Linux { .. } => Self::validate_linux(path),
        }
    }
    
    fn validate_windows(path: &str) -> Result<(), String> {
        // Check path length (260 char limit unless extended paths)
        if !path.starts_with("\\\\?\\") && path.len() > 260 {
            return Err("Path exceeds 260 character limit".to_string());
        }
        
        // Check for invalid characters
        const INVALID: &[char] = &['<', '>', '|', '"', '?', '*', '\0'];
        for c in INVALID {
            if path.contains(*c) {
                return Err(format!("Invalid character in path: {:?}", c));
            }
        }
        
        Ok(())
    }
    
    fn validate_wsl(path: &str) -> Result<(), String> {
        // Check for null bytes
        if path.contains('\0') {
            return Err("Path contains null byte".to_string());
        }
        
        // Check path length (4096 typical Linux limit)
        if path.len() > 4096 {
            return Err("Path exceeds 4096 character limit".to_string());
        }
        
        Ok(())
    }
    
    fn validate_macos(path: &str) -> Result<(), String> {
        // Check for null bytes
        if path.contains('\0') {
            return Err("Path contains null byte".to_string());
        }
        
        // Check path length (1024 typical macOS limit)
        if path.len() > 1024 {
            return Err("Path exceeds 1024 character limit".to_string());
        }
        
        // Check for colon (legacy Mac path separator)
        if path.contains(':') && !path.starts_with("http") {
            return Err("Path contains colon (:) which is not allowed".to_string());
        }
        
        Ok(())
    }
    
    fn validate_linux(path: &str) -> Result<(), String> {
        // Similar to WSL validation
        Self::validate_wsl(path)
    }
}
```

---

## Testing Procedures

### Step 6: Exhaustive Platform Testing

#### 6.1: Windows Native Testing Script
```powershell
# test-windows-native.ps1
Write-Host "Windows Native Claude Testing" -ForegroundColor Cyan
Write-Host "=============================" -ForegroundColor Cyan

# Test 1: Path detection
Write-Host "`nTest 1: Detecting Claude and Node.js..." -ForegroundColor Yellow

$nodePaths = @(
    "$env:ProgramFiles\nodejs\node.exe",
    "$env:ProgramFiles(x86)\nodejs\node.exe",
    "$env:USERPROFILE\.nvm\nodejs\node.exe"
)

$claudePaths = @(
    "$env:APPDATA\npm\claude.cmd",
    "$env:APPDATA\npm\node_modules\@anthropic\claude-cli\bin\claude"
)

$nodeFound = $false
$claudeFound = $false

foreach ($path in $nodePaths) {
    if (Test-Path $path) {
        Write-Host "  ✓ Found Node.js: $path" -ForegroundColor Green
        & $path --version
        $nodeFound = $true
        break
    }
}

if (-not $nodeFound) {
    Write-Host "  ✗ Node.js not found" -ForegroundColor Red
}

foreach ($path in $claudePaths) {
    if (Test-Path $path) {
        Write-Host "  ✓ Found Claude: $path" -ForegroundColor Green
        $claudeFound = $true
        break
    }
}

if (-not $claudeFound) {
    Write-Host "  ✗ Claude not found" -ForegroundColor Red
}

# Test 2: Path with spaces
Write-Host "`nTest 2: Testing paths with spaces..." -ForegroundColor Yellow
$testPath = "C:\Test Directory With Spaces"
New-Item -ItemType Directory -Path $testPath -Force | Out-Null
Write-Host "  Created: $testPath" -ForegroundColor Gray

# Test 3: Unicode paths
Write-Host "`nTest 3: Testing Unicode paths..." -ForegroundColor Yellow
$unicodePath = "C:\测试文件夹\テスト"
New-Item -ItemType Directory -Path $unicodePath -Force | Out-Null
Write-Host "  Created: $unicodePath" -ForegroundColor Gray

# Test 4: Long paths
Write-Host "`nTest 4: Testing long paths..." -ForegroundColor Yellow
$longPath = "C:\Very\" + ("Long" * 50) + "\Path"
if ($longPath.Length -gt 260) {
    Write-Host "  Path length: $($longPath.Length) characters" -ForegroundColor Gray
    Write-Host "  Warning: Exceeds 260 char limit" -ForegroundColor Yellow
}

# Test 5: Reserved names
Write-Host "`nTest 5: Testing reserved names..." -ForegroundColor Yellow
$reservedNames = @("CON", "PRN", "AUX", "NUL", "COM1", "LPT1")
foreach ($name in $reservedNames) {
    $testPath = "C:\$name"
    try {
        New-Item -ItemType Directory -Path $testPath -Force -ErrorAction Stop | Out-Null
        Write-Host "  ✗ Created reserved name: $name (should fail)" -ForegroundColor Red
    } catch {
        Write-Host "  ✓ Correctly rejected reserved name: $name" -ForegroundColor Green
    }
}

# Test 6: Claude execution
Write-Host "`nTest 6: Testing Claude execution..." -ForegroundColor Yellow
if ($claudeFound) {
    $testProject = "$env:TEMP\test_project"
    New-Item -ItemType Directory -Path $testProject -Force | Out-Null
    
    Push-Location $testProject
    try {
        echo "test" | claude --version
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✓ Claude execution successful" -ForegroundColor Green
        } else {
            Write-Host "  ✗ Claude execution failed with code: $LASTEXITCODE" -ForegroundColor Red
        }
    } finally {
        Pop-Location
    }
}

Write-Host "`nWindows Native Testing Complete" -ForegroundColor Cyan
```

#### 6.2: WSL Testing Script
```bash
#!/bin/bash
# test-wsl.sh

echo -e "\033[36mWSL Claude Testing\033[0m"
echo -e "\033[36m==================\033[0m"

# Color codes
RED='\033[31m'
GREEN='\033[32m'
YELLOW='\033[33m'
NC='\033[0m'

# Test 1: Environment detection
echo -e "\n${YELLOW}Test 1: Detecting WSL environment...${NC}"
if grep -qi microsoft /proc/version; then
    echo -e "  ${GREEN}✓ Running in WSL${NC}"
    
    # Get WSL version
    if [ -f /proc/sys/fs/binfmt_misc/WSLInterop ]; then
        echo -e "  ${GREEN}✓ WSL2 detected${NC}"
    else
        echo -e "  ${YELLOW}⚠ WSL1 detected (WSL2 recommended)${NC}"
    fi
else
    echo -e "  ${RED}✗ Not running in WSL${NC}"
    exit 1
fi

# Test 2: Node.js detection
echo -e "\n${YELLOW}Test 2: Detecting Node.js...${NC}"
node_paths=(
    "/usr/bin/node"
    "/usr/local/bin/node"
    "$HOME/.nvm/versions/node/*/bin/node"
    "$HOME/.volta/bin/node"
)

node_found=false
for path in "${node_paths[@]}"; do
    if [ -f "$path" ] || [ -f $(echo $path) ]; then
        echo -e "  ${GREEN}✓ Found Node.js: $path${NC}"
        $path --version
        node_found=true
        break
    fi
done

if [ "$node_found" = false ]; then
    echo -e "  ${RED}✗ Node.js not found${NC}"
fi

# Test 3: Claude detection
echo -e "\n${YELLOW}Test 3: Detecting Claude...${NC}"
claude_paths=(
    "$HOME/.claude/local/node_modules/.bin/claude"
    "$HOME/.npm-global/bin/claude"
    "/usr/local/bin/claude"
    "$HOME/node_modules/.bin/claude"
)

claude_found=false
for path in "${claude_paths[@]}"; do
    if [ -f "$path" ]; then
        echo -e "  ${GREEN}✓ Found Claude: $path${NC}"
        if [ -x "$path" ]; then
            echo -e "  ${GREEN}✓ Claude is executable${NC}"
        else
            echo -e "  ${RED}✗ Claude is not executable${NC}"
            chmod +x "$path"
            echo -e "  ${GREEN}✓ Made Claude executable${NC}"
        fi
        claude_found=true
        break
    fi
done

if [ "$claude_found" = false ]; then
    echo -e "  ${RED}✗ Claude not found${NC}"
fi

# Test 4: Path translation
echo -e "\n${YELLOW}Test 4: Testing path translation...${NC}"
test_paths=(
    "/mnt/c/Users/Test|C:\Users\Test"
    "/mnt/d/Projects|D:\Projects"
    "/mnt/c/Program Files|C:\Program Files"
)

for test_case in "${test_paths[@]}"; do
    IFS='|' read -r wsl_path windows_path <<< "$test_case"
    echo -e "  WSL: $wsl_path <-> Windows: $windows_path"
    
    # Test if /mnt/c exists
    if [ -d "/mnt/c" ]; then
        echo -e "  ${GREEN}✓ Windows C: drive mounted${NC}"
    else
        echo -e "  ${RED}✗ Windows C: drive not mounted${NC}"
    fi
done

# Test 5: File operations
echo -e "\n${YELLOW}Test 5: Testing file operations...${NC}"
test_dir="/mnt/c/Users/$USER/test_wsl_$(date +%s)"
if mkdir -p "$test_dir" 2>/dev/null; then
    echo -e "  ${GREEN}✓ Created directory: $test_dir${NC}"
    
    # Test file creation
    test_file="$test_dir/test.txt"
    if echo "Test content" > "$test_file"; then
        echo -e "  ${GREEN}✓ Created file: $test_file${NC}"
    else
        echo -e "  ${RED}✗ Failed to create file${NC}"
    fi
    
    # Clean up
    rm -rf "$test_dir"
    echo -e "  ${GREEN}✓ Cleaned up test files${NC}"
else
    echo -e "  ${RED}✗ Failed to create directory in Windows filesystem${NC}"
fi

# Test 6: Claude execution
echo -e "\n${YELLOW}Test 6: Testing Claude execution...${NC}"
if [ "$claude_found" = true ]; then
    test_project="/tmp/test_project_$(date +%s)"
    mkdir -p "$test_project"
    cd "$test_project"
    
    echo "test" | claude --version &>/dev/null
    if [ $? -eq 0 ]; then
        echo -e "  ${GREEN}✓ Claude execution successful${NC}"
    else
        echo -e "  ${RED}✗ Claude execution failed${NC}"
    fi
    
    cd - >/dev/null
    rm -rf "$test_project"
fi

# Test 7: WSL-Windows interop
echo -e "\n${YELLOW}Test 7: Testing WSL-Windows interop...${NC}"
if command -v powershell.exe &>/dev/null; then
    echo -e "  ${GREEN}✓ Can execute Windows programs from WSL${NC}"
    
    # Test running Windows command
    if powershell.exe -Command "Write-Host 'Hello from Windows'" &>/dev/null; then
        echo -e "  ${GREEN}✓ Windows command execution works${NC}"
    else
        echo -e "  ${RED}✗ Windows command execution failed${NC}"
    fi
else
    echo -e "  ${YELLOW}⚠ Windows interop not available${NC}"
fi

echo -e "\n${GREEN}WSL Testing Complete${NC}"
```

#### 6.3: macOS Testing Script
```bash
#!/bin/bash
# test-macos.sh

echo -e "\033[36mmacOS Claude Testing\033[0m"
echo -e "\033[36m====================\033[0m"

# Detect architecture
arch=$(uname -m)
echo -e "\n\033[33mTest 1: Detecting architecture...\033[0m"
if [ "$arch" = "arm64" ]; then
    echo -e "  \033[32m✓ Apple Silicon (M1/M2/M3) detected\033[0m"
    homebrew_prefix="/opt/homebrew"
elif [ "$arch" = "x86_64" ]; then
    echo -e "  \033[32m✓ Intel Mac detected\033[0m"
    homebrew_prefix="/usr/local"
else
    echo -e "  \033[31m✗ Unknown architecture: $arch\033[0m"
    exit 1
fi

# Test 2: Homebrew detection
echo -e "\n\033[33mTest 2: Detecting Homebrew...\033[0m"
if [ -d "$homebrew_prefix" ]; then
    echo -e "  \033[32m✓ Homebrew found at: $homebrew_prefix\033[0m"
    
    if command -v brew &>/dev/null; then
        echo -e "  \033[32m✓ brew command available\033[0m"
        brew --version
    else
        echo -e "  \033[33m⚠ brew command not in PATH\033[0m"
        export PATH="$homebrew_prefix/bin:$PATH"
    fi
else
    echo -e "  \033[33m⚠ Homebrew not found (optional)\033[0m"
fi

# Test 3: Node.js detection
echo -e "\n\033[33mTest 3: Detecting Node.js...\033[0m"
node_paths=(
    "$homebrew_prefix/bin/node"
    "/usr/local/bin/node"
    "/opt/homebrew/bin/node"
    "$HOME/.nvm/versions/node/*/bin/node"
    "$HOME/.volta/bin/node"
)

node_found=false
for path in "${node_paths[@]}"; do
    # Handle glob patterns
    for expanded_path in $path; do
        if [ -f "$expanded_path" ]; then
            echo -e "  \033[32m✓ Found Node.js: $expanded_path\033[0m"
            $expanded_path --version
            node_found=true
            break 2
        fi
    done
done

if [ "$node_found" = false ]; then
    echo -e "  \033[31m✗ Node.js not found\033[0m"
fi

# Test 4: Claude detection
echo -e "\n\033[33mTest 4: Detecting Claude...\033[0m"
claude_paths=(
    "$homebrew_prefix/bin/claude"
    "/usr/local/bin/claude"
    "$HOME/.npm-global/bin/claude"
    "$HOME/node_modules/.bin/claude"
    "$HOME/.claude/local/node_modules/.bin/claude"
)

claude_found=false
claude_path=""
for path in "${claude_paths[@]}"; do
    if [ -f "$path" ] || [ -L "$path" ]; then
        echo -e "  \033[32m✓ Found Claude: $path\033[0m"
        
        # Resolve symlink
        if [ -L "$path" ]; then
            resolved=$(readlink -f "$path" 2>/dev/null || readlink "$path")
            echo -e "  \033[32m✓ Symlink resolves to: $resolved\033[0m"
        fi
        
        # Check if executable
        if [ -x "$path" ]; then
            echo -e "  \033[32m✓ Claude is executable\033[0m"
        else
            echo -e "  \033[31m✗ Claude is not executable\033[0m"
            chmod +x "$path"
            echo -e "  \033[32m✓ Made Claude executable\033[0m"
        fi
        
        claude_found=true
        claude_path="$path"
        break
    fi
done

if [ "$claude_found" = false ]; then
    echo -e "  \033[31m✗ Claude not found\033[0m"
fi

# Test 5: Quarantine check
echo -e "\n\033[33mTest 5: Checking quarantine attributes...\033[0m"
if [ "$claude_found" = true ]; then
    if xattr "$claude_path" 2>/dev/null | grep -q "com.apple.quarantine"; then
        echo -e "  \033[33m⚠ Claude has quarantine attribute\033[0m"
        xattr -cr "$claude_path"
        echo -e "  \033[32m✓ Removed quarantine attribute\033[0m"
    else
        echo -e "  \033[32m✓ No quarantine attributes\033[0m"
    fi
fi

# Test 6: PATH configuration
echo -e "\n\033[33mTest 6: Testing PATH configuration...\033[0m"
echo "Current PATH:"
echo "$PATH" | tr ':' '\n' | head -10

# Test 7: Claude execution
echo -e "\n\033[33mTest 7: Testing Claude execution...\033[0m"
if [ "$claude_found" = true ]; then
    test_project="$HOME/test_project_$(date +%s)"
    mkdir -p "$test_project"
    cd "$test_project"
    
    echo "test" | "$claude_path" --version &>/dev/null
    exit_code=$?
    
    if [ $exit_code -eq 0 ]; then
        echo -e "  \033[32m✓ Claude execution successful\033[0m"
    else
        echo -e "  \033[31m✗ Claude execution failed with code: $exit_code\033[0m"
        
        # Try with full path
        echo -e "  Trying with absolute path..."
        echo "test" | /usr/bin/env node "$claude_path" --version &>/dev/null
        if [ $? -eq 0 ]; then
            echo -e "  \033[32m✓ Works with node prefix\033[0m"
        fi
    fi
    
    cd - >/dev/null
    rm -rf "$test_project"
fi

# Test 8: File system case sensitivity
echo -e "\n\033[33mTest 8: Testing file system case sensitivity...\033[0m"
test_dir="$HOME/CaseSensitiveTest"
mkdir -p "$test_dir"
touch "$test_dir/test.txt"
if [ -f "$test_dir/TEST.TXT" ]; then
    echo -e "  \033[33m⚠ File system is case-insensitive\033[0m"
else
    echo -e "  \033[32m✓ File system is case-sensitive\033[0m"
fi
rm -rf "$test_dir"

echo -e "\n\033[32mmacOS Testing Complete\033[0m"
```

---

## Verification Checklists

### Step 7: Platform Verification

#### 7.1: Windows Verification Checklist
```yaml
Windows Native Verification:
  Prerequisites:
    - [ ] Windows 10/11 version 1903 or later
    - [ ] Node.js 16+ installed
    - [ ] Claude CLI installed via npm
    - [ ] Visual C++ Redistributables installed
    - [ ] .NET Framework 4.7.2+
  
  Path Verification:
    - [ ] Node.js in PATH or detected at known location
    - [ ] Claude in PATH or at %APPDATA%\npm
    - [ ] Can execute node --version
    - [ ] Can execute claude --version
    - [ ] Paths with spaces work
    - [ ] Unicode paths work
    - [ ] Long paths (>260 chars) handled
  
  Execution Verification:
    - [ ] Can spawn Claude process
    - [ ] Can send input via stdin
    - [ ] Can read output from stdout
    - [ ] Error messages captured from stderr
    - [ ] Process cleanup on exit
    - [ ] No orphaned processes
  
  Special Cases:
    - [ ] Works with antivirus software
    - [ ] Works with Windows Defender
    - [ ] Works in corporate environments
    - [ ] Works with restricted permissions
    - [ ] Works with network drives

WSL Verification:
  Prerequisites:
    - [ ] WSL2 installed and configured
    - [ ] Default distro set
    - [ ] Node.js installed in WSL
    - [ ] Claude installed in WSL
  
  Path Translation:
    - [ ] C:\ converts to /mnt/c/
    - [ ] D:\ converts to /mnt/d/
    - [ ] UNC paths handled
    - [ ] Spaces in paths preserved
    - [ ] Special characters handled
  
  Execution:
    - [ ] Can execute commands in WSL
    - [ ] Can access Windows files from WSL
    - [ ] Can write to Windows filesystem
    - [ ] Permissions preserved
    - [ ] Line endings handled (CRLF/LF)
```

#### 7.2: macOS Verification Checklist
```yaml
macOS Verification:
  Prerequisites:
    - [ ] macOS 11.0+ (Big Sur or later)
    - [ ] Xcode Command Line Tools installed
    - [ ] Node.js 16+ installed
    - [ ] Claude CLI installed
  
  Architecture Specific:
    Apple Silicon (M1/M2/M3):
      - [ ] Homebrew at /opt/homebrew
      - [ ] Native ARM64 binaries used
      - [ ] Rosetta 2 not required
    
    Intel:
      - [ ] Homebrew at /usr/local
      - [ ] x86_64 binaries used
  
  Path Verification:
    - [ ] Homebrew paths detected
    - [ ] npm global paths detected
    - [ ] Symlinks resolved correctly
    - [ ] Hidden files accessible
  
  Permissions:
    - [ ] Quarantine attributes removed
    - [ ] Execute permissions set
    - [ ] No code signing issues
    - [ ] No notarization issues
  
  Execution:
    - [ ] Can spawn Claude process
    - [ ] PATH environment correct
    - [ ] No sandbox violations
    - [ ] Works with SIP enabled
```

---

## Platform-Specific Gotchas

### Step 8: Common Issues and Solutions

#### 8.1: Windows Gotchas
```typescript
// Windows-specific issues and solutions

// GOTCHA 1: Backslash in JSON strings
// Problem: Windows paths have backslashes that break JSON
// Solution:
function escapeWindowsPath(path: string): string {
  return path.replace(/\\/g, '\\\\');
}

// GOTCHA 2: Drive letter case
// Problem: Windows is case-insensitive but some tools expect lowercase
// Solution:
function normalizeDriveLetter(path: string): string {
  if (path.length >= 2 && path[1] === ':') {
    return path[0].toLowerCase() + path.slice(1);
  }
  return path;
}

// GOTCHA 3: MAX_PATH limitation
// Problem: Windows has 260 character path limit
// Solution:
function handleLongPath(path: string): string {
  if (path.length > 260 && !path.startsWith('\\\\?\\')) {
    return '\\\\?\\' + path;
  }
  return path;
}

// GOTCHA 4: Reserved filenames
// Problem: CON, PRN, AUX, etc. are reserved
// Solution:
const RESERVED_NAMES = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'LPT1'];
function isReservedName(filename: string): boolean {
  const name = filename.toUpperCase().split('.')[0];
  return RESERVED_NAMES.includes(name);
}

// GOTCHA 5: Windows Defender blocking
// Problem: Defender may block Claude execution
// Solution: Add to exclusions or sign the binary
```

#### 8.2: WSL Gotchas
```bash
# WSL-specific issues and solutions

# GOTCHA 1: WSL1 vs WSL2 differences
# WSL1: File system performance better for Windows files
# WSL2: Better Linux compatibility but slower Windows file access
# Solution: Detect and optimize for each
if [ -f /proc/sys/fs/binfmt_misc/WSLInterop ]; then
    echo "WSL2 detected - use Linux filesystem for better performance"
else
    echo "WSL1 detected - Windows filesystem access is fast"
fi

# GOTCHA 2: Line ending conversion
# Problem: CRLF vs LF issues
# Solution: Configure git and editors
git config --global core.autocrlf input

# GOTCHA 3: Permission mismatches
# Problem: Windows permissions don't map to Linux
# Solution: Use metadata mounting
# In /etc/wsl.conf:
# [automount]
# options = "metadata,umask=22,fmask=11"

# GOTCHA 4: PATH differences
# Problem: Windows PATH not available in WSL
# Solution: Explicitly set PATH
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

# GOTCHA 5: Clock sync issues
# Problem: WSL clock can drift from Windows
# Solution: Sync clocks
sudo hwclock -s
```

#### 8.3: macOS Gotchas
```bash
# macOS-specific issues and solutions

# GOTCHA 1: SIP (System Integrity Protection)
# Problem: Can't modify system directories
# Solution: Use user directories
INSTALL_DIR="$HOME/.local/bin"
mkdir -p "$INSTALL_DIR"

# GOTCHA 2: Quarantine attributes
# Problem: macOS quarantines downloaded files
# Solution: Remove quarantine
xattr -cr /path/to/claude

# GOTCHA 3: Different Homebrew locations
# Problem: Intel vs ARM64 have different prefixes
# Solution: Detect architecture
if [ "$(uname -m)" = "arm64" ]; then
    HOMEBREW_PREFIX="/opt/homebrew"
else
    HOMEBREW_PREFIX="/usr/local"
fi

# GOTCHA 4: Code signing
# Problem: Unsigned binaries may not run
# Solution: Ad-hoc sign
codesign --force --deep --sign - /path/to/claude

# GOTCHA 5: Spotlight indexing
# Problem: Spotlight may slow down file operations
# Solution: Exclude development directories
sudo mdutil -i off /path/to/project
```

---

## Emergency Recovery

### Step 9: Platform-Specific Recovery

#### 9.1: Windows Recovery
```powershell
# Windows Emergency Recovery Script
# recover-windows-emergency.ps1

param(
    [switch]$Force,
    [switch]$ResetAll,
    [switch]$WSLOnly,
    [switch]$NativeOnly
)

Write-Host "🚨 WINDOWS EMERGENCY RECOVERY" -ForegroundColor Red
Write-Host "==============================" -ForegroundColor Red

# Step 1: Kill all Claude processes
Write-Host "`nStep 1: Killing all Claude processes..." -ForegroundColor Yellow
Get-Process | Where-Object { $_.Name -like "*claude*" } | Stop-Process -Force
Get-Process | Where-Object { $_.Name -like "*node*" } | Stop-Process -Force

# Step 2: Clear temporary files
Write-Host "Step 2: Clearing temporary files..." -ForegroundColor Yellow
Remove-Item "$env:TEMP\yurucode*" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "$env:LOCALAPPDATA\yurucode\cache" -Recurse -Force -ErrorAction SilentlyContinue

# Step 3: Reset Node.js
if ($ResetAll) {
    Write-Host "Step 3: Resetting Node.js..." -ForegroundColor Yellow
    
    # Clear npm cache
    npm cache clean --force
    
    # Reinstall Claude
    npm uninstall -g @anthropic/claude-cli
    npm install -g @anthropic/claude-cli
}

# Step 4: Fix WSL if needed
if (-not $NativeOnly) {
    Write-Host "Step 4: Checking WSL..." -ForegroundColor Yellow
    
    $wslStatus = wsl --status 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  WSL not available or broken" -ForegroundColor Red
        
        if ($Force) {
            Write-Host "  Attempting WSL reset..." -ForegroundColor Yellow
            wsl --shutdown
            wsl --unregister Ubuntu
            wsl --install Ubuntu
        }
    } else {
        Write-Host "  WSL is operational" -ForegroundColor Green
        
        # Fix WSL Claude
        wsl -e bash -c "npm cache clean --force && npm install -g @anthropic/claude-cli"
    }
}

# Step 5: Restore settings
Write-Host "Step 5: Restoring settings..." -ForegroundColor Yellow
$settings = @{
    USE_NATIVE_EXECUTION = $false
    FALLBACK_TO_EMBEDDED = $true
    PREFER_WSL = $false
}

$settings | ConvertTo-Json | Out-File "$env:LOCALAPPDATA\yurucode\emergency-settings.json"

Write-Host "`n✅ Recovery complete!" -ForegroundColor Green
Write-Host "Settings saved to: $env:LOCALAPPDATA\yurucode\emergency-settings.json" -ForegroundColor Gray
```

#### 9.2: macOS Recovery
```bash
#!/bin/bash
# recover-macos-emergency.sh

echo "🚨 MACOS EMERGENCY RECOVERY"
echo "==========================="

# Step 1: Kill all processes
echo -e "\nStep 1: Killing all Claude processes..."
pkill -f claude
pkill -f node

# Step 2: Clear caches
echo "Step 2: Clearing caches..."
rm -rf ~/Library/Caches/yurucode
rm -rf ~/.yurucode/cache

# Step 3: Fix permissions
echo "Step 3: Fixing permissions..."
chmod -R u+rwX ~/.yurucode
chmod -R u+rwX ~/.claude

# Step 4: Remove quarantine
echo "Step 4: Removing quarantine attributes..."
find ~/.npm -name "*claude*" -exec xattr -cr {} \;
find /opt/homebrew -name "*claude*" -exec xattr -cr {} \; 2>/dev/null
find /usr/local -name "*claude*" -exec xattr -cr {} \; 2>/dev/null

# Step 5: Reinstall if needed
if [ "$1" = "--reinstall" ]; then
    echo "Step 5: Reinstalling Claude..."
    npm uninstall -g @anthropic/claude-cli
    npm cache clean --force
    npm install -g @anthropic/claude-cli
fi

# Step 6: Create recovery config
echo "Step 6: Creating recovery configuration..."
cat > ~/.yurucode/recovery.json << EOF
{
  "USE_NATIVE_EXECUTION": false,
  "FALLBACK_TO_EMBEDDED": true,
  "PLATFORM": "macos",
  "ARCH": "$(uname -m)"
}
EOF

echo -e "\n✅ Recovery complete!"
echo "Configuration saved to: ~/.yurucode/recovery.json"
```

---

## Final Testing Matrix

### Comprehensive Test Scenarios

```yaml
Test Matrix:
  Windows Native:
    Basic:
      - [ ] Fresh install works
      - [ ] Upgrade from previous version works
      - [ ] Starts without errors
      - [ ] Can create new session
      - [ ] Can send messages
      - [ ] Can use tools (Edit, Write, Bash)
    
    Advanced:
      - [ ] 100+ message session works
      - [ ] Multiple concurrent sessions work
      - [ ] Session resume after restart works
      - [ ] Handles /compact command
      - [ ] Works with non-ASCII paths
      - [ ] Works with network drives
      - [ ] Works offline
    
    Edge Cases:
      - [ ] Path with 260+ characters
      - [ ] Reserved filename handling
      - [ ] Antivirus doesn't block
      - [ ] Works without admin rights
      - [ ] Handles process crashes gracefully
  
  WSL:
    Basic:
      - [ ] Detects WSL correctly
      - [ ] Finds Claude in WSL
      - [ ] Path translation works
      - [ ] Can read Windows files
      - [ ] Can write Windows files
    
    Advanced:
      - [ ] Line ending conversion works
      - [ ] Permission preservation works
      - [ ] Symlinks handled correctly
      - [ ] Large file operations work
      - [ ] Network paths accessible
    
    Edge Cases:
      - [ ] WSL1 compatibility
      - [ ] Multiple distros handled
      - [ ] Clock sync issues handled
      - [ ] Memory limits respected
      - [ ] Filesystem case sensitivity handled
  
  macOS:
    Basic:
      - [ ] Detects architecture correctly
      - [ ] Finds Homebrew paths
      - [ ] Claude execution works
      - [ ] No quarantine issues
      - [ ] No permission issues
    
    Advanced:
      - [ ] Works with SIP enabled
      - [ ] Handles app translocation
      - [ ] Symlinks resolved correctly
      - [ ] Hidden files accessible
      - [ ] iCloud Drive paths work
    
    Edge Cases:
      - [ ] Works on external drives
      - [ ] Case-sensitive filesystem support
      - [ ] Different shell environments (zsh, bash, fish)
      - [ ] Spotlight doesn't interfere
      - [ ] Time Machine doesn't interfere
```

---

## Conclusion

This ultra-detailed guide provides exhaustive coverage of platform-specific implementation details. Key points:

1. **Platform Detection**: Comprehensive detection logic for all scenarios
2. **Path Translation**: Complete matrix of path conversions
3. **Testing Scripts**: Automated tests for each platform
4. **Recovery Procedures**: Emergency recovery for when things go wrong
5. **Verification Checklists**: Detailed checklists for each platform

Follow these steps carefully and test thoroughly on each platform before deployment. Remember:
- **Windows**: Handle both native and WSL scenarios
- **WSL**: Careful path translation and permission handling
- **macOS**: Architecture-specific paths and permission management

Always maintain fallback options and recovery procedures for production deployments.