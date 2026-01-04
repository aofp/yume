/// Node.js server process management module
/// This module handles spawning and managing the Node.js backend server that bridges
/// between Tauri and the Claude CLI. The server:
/// - Spawns Claude CLI processes with proper arguments
/// - Parses Claude's stream-json output format
/// - Communicates with the frontend via Socket.IO WebSocket
/// - Manages multiple concurrent Claude sessions
/// - Handles platform-specific requirements (WSL on Windows, etc.)

use std::process::{Command, Child, Stdio};
use std::sync::{Arc, Mutex};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use tracing::info;
use std::sync::atomic::{AtomicBool, Ordering};
use std::collections::VecDeque;

// SIMPLE FLAG TO CONTROL CONSOLE VISIBILITY AND DEVTOOLS
// Set to true during development to see server console output and force DevTools open
pub const YURUCODE_SHOW_CONSOLE: bool = false;  // SET TO TRUE TO SEE CONSOLE AND FORCE DEVTOOLS

// Global handle to the server process and port
// We use Arc<Mutex<>> for thread-safe access to the child process
// This allows us to kill the specific server process on shutdown
static SERVER_PROCESS: Mutex<Option<Arc<ServerProcessGuard>>> = Mutex::new(None);
static SERVER_PORT: Mutex<Option<u16>> = Mutex::new(None);
static SERVER_RUNNING: AtomicBool = AtomicBool::new(false);

// Maximum buffer size for stdout/stderr (10MB)
const MAX_BUFFER_SIZE: usize = 10 * 1024 * 1024;

/// Process guard that ensures cleanup on drop
struct ServerProcessGuard {
    child: Mutex<Child>,
    pid: u32,
    stdout_buffer: Mutex<VecDeque<String>>,
    stderr_buffer: Mutex<VecDeque<String>>,
    shutdown_flag: AtomicBool,
}

impl ServerProcessGuard {
    fn new(child: Child) -> Self {
        let pid = child.id();
        info!("Creating ServerProcessGuard for PID: {}", pid);
        Self {
            child: Mutex::new(child),
            pid,
            stdout_buffer: Mutex::new(VecDeque::with_capacity(1000)),
            stderr_buffer: Mutex::new(VecDeque::with_capacity(1000)),
            shutdown_flag: AtomicBool::new(false),
        }
    }
    
    fn kill(&self) -> std::io::Result<()> {
        self.shutdown_flag.store(true, Ordering::Relaxed);
        if let Ok(mut child) = self.child.lock() {
            info!("Attempting to kill process PID: {}", self.pid);
            
            // Try normal kill first
            match child.kill() {
                Ok(()) => {
                    info!("Process killed successfully");
                    // Wait for process to exit
                    let _ = child.wait();
                    Ok(())
                }
                Err(e) => {
                    info!("Failed to kill process: {}", e);
                    // Try platform-specific force kill
                    Self::force_kill(self.pid);
                    Err(e)
                }
            }
        } else {
            Err(std::io::Error::new(std::io::ErrorKind::Other, "Failed to lock child process"))
        }
    }
    
    #[cfg(target_os = "windows")]
    fn force_kill(pid: u32) {
        info!("Force killing Windows process PID: {}", pid);
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let _ = Command::new("taskkill")
            .args(&["/F", "/PID", &pid.to_string()])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
    }
    
    #[cfg(not(target_os = "windows"))]
    fn force_kill(pid: u32) {
        info!("Force killing Unix process PID: {}", pid);
        let _ = Command::new("kill")
            .args(&["-9", &pid.to_string()])
            .output();
    }
    
    fn add_stdout_line(&self, line: String) {
        if let Ok(mut buffer) = self.stdout_buffer.lock() {
            // Limit buffer size
            while buffer.len() > 1000 {
                buffer.pop_front();
            }
            buffer.push_back(line);
        }
    }
    
    fn add_stderr_line(&self, line: String) {
        if let Ok(mut buffer) = self.stderr_buffer.lock() {
            // Limit buffer size
            while buffer.len() > 1000 {
                buffer.pop_front();
            }
            buffer.push_back(line);
        }
    }
}

impl Drop for ServerProcessGuard {
    fn drop(&mut self) {
        info!("ServerProcessGuard dropping for PID: {}", self.pid);
        // Ensure process is killed when guard is dropped
        let _ = self.kill();
    }
}

/// Returns the platform-specific path for server log files
/// - macOS: ~/Library/Logs/yurucode/server.log
/// - Windows: %LOCALAPPDATA%\yurucode\logs\server.log
/// - Linux: ~/.yurucode/logs/server.log
pub fn get_log_path() -> PathBuf {
    let log_dir = if cfg!(target_os = "macos") {
        dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("/tmp"))
            .join("Library")
            .join("Logs")
            .join("yurucode")
    } else if cfg!(target_os = "windows") {
        dirs::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("C:\\temp"))
            .join("yurucode")
            .join("logs")
    } else {
        dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("/tmp"))
            .join(".yurucode")
            .join("logs")
    };
    
    // Create log directory if it doesn't exist
    let _ = fs::create_dir_all(&log_dir);
    log_dir.join("server.log")
}

/// Appends a timestamped message to the server log file
/// Used for debugging server startup and runtime issues
fn write_log(message: &str) {
    if let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(get_log_path())
    {
        let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
        let _ = writeln!(file, "[{}] {}", timestamp, message);
    }
}

/// Clears the log file and writes a header with current timestamp
/// Called at server startup to ensure fresh logs for each session
pub fn clear_log() {
    if let Ok(mut file) = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(get_log_path())
    {
        let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
        let _ = writeln!(file, "=== yurucode server log started at {} ===", timestamp);
    }
}

/// Returns the contents of the server log file (limited to last 800 lines)
/// Used by the frontend to display server logs for debugging
/// Creates a placeholder log file on Windows if it doesn't exist
pub fn get_server_logs() -> String {
    // On Windows with embedded server, create a log file if it doesn't exist
    #[cfg(target_os = "windows")]
    {
        let log_path = get_log_path();
        if !log_path.exists() {
            let _ = fs::create_dir_all(log_path.parent().unwrap());
            let _ = fs::write(&log_path, "=== yurucode server log ===\nEmbedded server running\nNote: Real-time logging not available in embedded mode\n");
        }
    }
    
    match fs::read_to_string(get_log_path()) {
        Ok(contents) => {
            let lines: Vec<&str> = contents.lines().collect();
            const MAX_LINES: usize = 800;
            
            if lines.len() > MAX_LINES {
                let start_index = lines.len() - MAX_LINES;
                let mut result = format!("... (showing last {} lines)\n", MAX_LINES);
                result.push_str(&lines[start_index..].join("\n"));
                result
            } else {
                contents
            }
        }
        Err(e) => format!("Failed to read logs: {}", e)
    }
}

// Embedded server removed - all platforms now use external files
// macOS: server-claude-macos.cjs
// Windows: server-claude-windows.cjs
// Linux: server-claude-linux.cjs  

/// Stops the Node.js server process for this specific Tauri instance
/// This is instance-specific to support multiple app windows
/// Uses normal kill first, then force kill if needed
pub fn stop_logged_server() {
    info!("Stopping server for THIS instance only...");
    
    // Set running flag to false first
    SERVER_RUNNING.store(false, Ordering::Relaxed);
    
    if let Ok(mut process_guard) = SERVER_PROCESS.try_lock() {
        if let Some(process_arc) = process_guard.take() {
            info!("Stopping server process...");
            // The ServerProcessGuard's Drop trait will handle killing the process
            match process_arc.kill() {
                Ok(()) => info!("Server process killed successfully"),
                Err(e) => info!("Error killing server process: {}", e),
            }
            // Drop the Arc to trigger cleanup
            drop(process_arc);
        } else {
            info!("No server process to stop");
        }
    } else {
        info!("Could not lock SERVER_PROCESS");
    }
    
    // Clear the port
    if let Ok(mut port_guard) = SERVER_PORT.lock() {
        *port_guard = None;
    }
}

/// Starts the Node.js backend server on the specified port
/// All platforms now use external server files:
/// - macOS: server-claude-macos.cjs
/// - Windows: server-claude-windows.cjs (with fallback error handling)
/// - Linux: server-claude-linux.cjs
/// The server is started as a detached process that survives parent crashes
pub fn start_logged_server(port: u16) {
    info!("Starting server on port {}", port);
    
    // Stop any existing server first to avoid port conflicts
    stop_logged_server();
    
    // Store the port
    if let Ok(mut port_guard) = SERVER_PORT.lock() {
        *port_guard = Some(port);
    }
    
    // Wait a bit for the port to be released
    std::thread::sleep(std::time::Duration::from_millis(500));
    
    // On macOS, use the bundled server file directly
    #[cfg(target_os = "macos")]
    {
        start_macos_server(port);
        return;
    }
    
    // Windows-specific server logic
    #[cfg(target_os = "windows")]
    {
        start_windows_server(port);
        return;
    }
    
    // Linux/other platforms use external server file
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        start_linux_server(port);
        return;
    }
}

/// macOS-specific server startup
/// Uses an external server file (server-claude-macos.cjs) rather than embedded code
/// This allows for easier debugging and avoids code signing issues
/// Handles both development (project root) and production (.app bundle) scenarios
#[cfg(target_os = "macos")]
fn start_macos_server(port: u16) {
    info!("Starting macOS server on port {}", port);
    clear_log(); // Clear logs from previous run
    write_log("=== Starting macOS server ===");
    
    // Get the executable path for debugging
    let exe_path = std::env::current_exe().unwrap_or_default();
    info!("Executable path: {:?}", exe_path);
    write_log(&format!("Executable path: {:?}", exe_path));
    
    // Find the server file
    let server_path = if cfg!(debug_assertions) {
        // In development, use project root
        info!("Development mode - looking for server in project root");
        write_log("Development mode - looking for server in project root");
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent()?.parent()?.parent()?.parent().map(|p| p.to_path_buf()))
            .map(|p| p.join("server-claude-macos.cjs"))
    } else {
        // In production, try both .js and .cjs versions
        info!("Production mode - looking for server in .app bundle");
        write_log("Production mode - looking for server in .app bundle");
        
        let result = std::env::current_exe()
            .ok()
            .and_then(|p| {
                write_log(&format!("Exe: {:?}", p));
                let macos_dir = p.parent()?;
                write_log(&format!("MacOS dir: {:?}", macos_dir));
                let contents_dir = macos_dir.parent()?;
                write_log(&format!("Contents dir: {:?}", contents_dir));
                let resources_dir = contents_dir.join("Resources").join("resources");
                write_log(&format!("Resources dir: {:?}", resources_dir));
                
                // Try .cjs first (current bundled file)
                let server_cjs = resources_dir.join("server-claude-macos.cjs");
                if server_cjs.exists() {
                    write_log(&format!("Found server.js at: {:?}", server_cjs));
                    return Some(server_cjs);
                }
                
                // Fall back to .js (legacy)
                let server_js = resources_dir.join("server-claude-macos.js");
                write_log(&format!("Looking for server.js at: {:?}", server_js));
                Some(server_js)
            });
        
        if result.is_none() {
            write_log("Failed to construct production server path");
        }
        
        result
    };
    
    if let Some(server_file) = server_path {
        if !server_file.exists() {
            info!("Server file not found at: {:?}", server_file);
            return;
        }
        
        info!("Using server file: {:?}", server_file);
        
        // Get node_modules path
        let node_modules = if cfg!(debug_assertions) {
            // In development
            server_file.parent().map(|p| p.join("node_modules"))
        } else {
            // In production, node_modules are in the same resources directory
            server_file.parent().map(|p| p.join("node_modules"))
        };
        
        // Also check if node_modules exists
        if let Some(ref modules) = node_modules {
            if !modules.exists() {
                write_log(&format!("Warning: node_modules not found at: {:?}", modules));
            } else {
                write_log(&format!("node_modules found at: {:?}", modules));
            }
        }
        
        write_log(&format!("Attempting to spawn Node.js server on port {}...", port));
        let mut cmd = Command::new("node");
        cmd.arg(&server_file)
           .env_clear()
           .envs(std::env::vars())
           .env("PORT", port.to_string());

        if let Some(ref modules) = node_modules {
            write_log(&format!("Setting NODE_PATH to: {:?}", modules));
            cmd.env("NODE_PATH", modules);
        }

        // Always capture output for logging
        cmd.stdout(Stdio::piped())
           .stderr(Stdio::piped());

        // Set working directory to resources folder for relative requires
        if let Some(working_dir) = server_file.parent() {
            cmd.current_dir(working_dir);
            write_log(&format!("Working directory: {:?}", working_dir));
        }

        write_log(&format!("Spawn command: node {:?}", &server_file));
        match cmd.spawn() {
            Ok(mut child) => {
                let pid = child.id();
                write_log(&format!("✅ macOS server spawned with PID: {}", pid));
                info!("✅ macOS server spawned with PID: {}", pid);
                
                // Take stdout and stderr for monitoring
                let stdout = child.stdout.take();
                let stderr = child.stderr.take();
                
                // Create the process guard
                let guard = Arc::new(ServerProcessGuard::new(child));
                let guard_clone1 = Arc::clone(&guard);
                let guard_clone2 = Arc::clone(&guard);
                
                // Spawn threads to log stdout and stderr with bounded buffers
                if let Some(stdout) = stdout {
                    std::thread::spawn(move || {
                        use std::io::{BufRead, BufReader};
                        let reader = BufReader::new(stdout);
                        let mut total_bytes = 0;
                        
                        for line in reader.lines() {
                            // Check if we should stop
                            if guard_clone1.shutdown_flag.load(Ordering::Relaxed) {
                                break;
                            }
                            
                            if let Ok(line) = line {
                                total_bytes += line.len();
                                
                                // Limit total buffer size
                                if total_bytes < MAX_BUFFER_SIZE {
                                    guard_clone1.add_stdout_line(line.clone());
                                    write_log(&format!("[SERVER OUT] {}", line));
                                    info!("[SERVER OUT] {}", line);
                                }
                            }
                        }
                    });
                }
                
                if let Some(stderr) = stderr {
                    std::thread::spawn(move || {
                        use std::io::{BufRead, BufReader};
                        let reader = BufReader::new(stderr);
                        let mut total_bytes = 0;
                        
                        for line in reader.lines() {
                            // Check if we should stop
                            if guard_clone2.shutdown_flag.load(Ordering::Relaxed) {
                                break;
                            }
                            
                            if let Ok(line) = line {
                                total_bytes += line.len();
                                
                                // Limit total buffer size
                                if total_bytes < MAX_BUFFER_SIZE {
                                    guard_clone2.add_stderr_line(line.clone());
                                    write_log(&format!("[SERVER ERR] {}", line));
                                    info!("[SERVER ERR] {}", line);
                                }
                            }
                        }
                    });
                }
                
                // Store the guarded process
                if let Ok(mut process_guard) = SERVER_PROCESS.lock() {
                    *process_guard = Some(guard);
                    SERVER_RUNNING.store(true, Ordering::Relaxed);
                }
                
                info!("✅ macOS server process tracking set up");
            }
            Err(e) => {
                write_log(&format!("❌ Failed to start macOS server: {}", e));
                write_log(&format!("Error kind: {:?}", e.kind()));
                write_log(&format!("Current dir: {:?}", std::env::current_dir()));
                info!("❌ Failed to start macOS server: {}", e);
                
                // Try to check if node exists
                write_log("Checking for Node.js installation...");
                match Command::new("which").arg("node").output() {
                    Ok(output) => {
                        let node_path = String::from_utf8_lossy(&output.stdout);
                        if node_path.trim().is_empty() {
                            write_log("Node.js not found in PATH!");
                        } else {
                            write_log(&format!("Node location: {}", node_path));
                        }
                    }
                    Err(e) => {
                        write_log(&format!("Could not run 'which node': {}", e));
                    }
                }
                
                // Try common node locations on macOS
                let common_paths = vec![
                    "/usr/local/bin/node",
                    "/opt/homebrew/bin/node",
                    "/usr/bin/node",
                ];
                
                for path in common_paths {
                    if std::path::Path::new(path).exists() {
                        write_log(&format!("Found node at: {}", path));
                        // Try to spawn with absolute path
                        write_log(&format!("Retrying with absolute path: {} on port {}", path, port));
                        let mut retry_cmd = Command::new(path);
                        retry_cmd.arg(&server_file)
                                 .env_clear()
                                 .envs(std::env::vars())
                                 .env("PORT", port.to_string());

                        if let Some(ref modules) = node_modules {
                            retry_cmd.env("NODE_PATH", modules);
                        }
                        
                        if let Some(working_dir) = server_file.parent() {
                            retry_cmd.current_dir(working_dir);
                        }
                        
                        retry_cmd.stdout(Stdio::piped())
                                 .stderr(Stdio::piped());
                        
                        match retry_cmd.spawn() {
                            Ok(mut child) => {
                                write_log(&format!("✅ Retry successful with {}, PID: {}", path, child.id()));
                                
                                // Handle stdout
                                if let Some(stdout) = child.stdout.take() {
                                    std::thread::spawn(move || {
                                        use std::io::{BufRead, BufReader};
                                        let reader = BufReader::new(stdout);
                                        for line in reader.lines() {
                                            if let Ok(line) = line {
                                                write_log(&format!("[SERVER OUT] {}", line));
                                            }
                                        }
                                    });
                                }
                                
                                // Handle stderr
                                if let Some(stderr) = child.stderr.take() {
                                    std::thread::spawn(move || {
                                        use std::io::{BufRead, BufReader};
                                        let reader = BufReader::new(stderr);
                                        for line in reader.lines() {
                                            if let Ok(line) = line {
                                                write_log(&format!("[SERVER ERR] {}", line));
                                            }
                                        }
                                    });
                                }
                                
                                // Store process handle
                                let guard = Arc::new(ServerProcessGuard::new(child));
                                if let Ok(mut process_guard) = SERVER_PROCESS.lock() {
                                    *process_guard = Some(guard);
                                }
                                
                                return;
                            }
                            Err(e) => {
                                write_log(&format!("Retry with {} failed: {}", path, e));
                            }
                        }
                    }
                }
            }
        }
    } else {
        write_log("ERROR: Could not determine server path");
        info!("Could not determine server path");
    }
}

/// Windows-specific server startup
/// Uses an external server file (server-claude-windows.cjs) similar to macOS
/// This aligns Windows behavior with macOS for consistency
#[cfg(target_os = "windows")]
fn start_windows_server(port: u16) {
    info!("Starting Windows server on port {}", port);
    clear_log();
    write_log("=== Starting Windows server ===");
    
    let exe_path = std::env::current_exe().unwrap_or_default();
    info!("Executable path: {:?}", exe_path);
    write_log(&format!("Executable path: {:?}", exe_path));
    
    // Find the server file
    let server_path = if cfg!(debug_assertions) {
        // In development, use project root
        info!("Development mode - looking for server in project root");
        write_log("Development mode - looking for server in project root");
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent()?.parent()?.parent()?.parent().map(|p| p.to_path_buf()))
            .map(|p| p.join("server-claude-windows.cjs"))
    } else {
        // In production, look in Resources directory
        info!("Production mode - looking for server in Resources");
        write_log("Production mode - looking for server in Resources");
        
        std::env::current_exe()
            .ok()
            .and_then(|p| {
                let parent = p.parent()?;
                let resources_dir = parent.join("resources");
                write_log(&format!("Resources dir: {:?}", resources_dir));
                
                let server_file = resources_dir.join("server-claude-windows.cjs");
                if server_file.exists() {
                    write_log(&format!("Found server at: {:?}", server_file));
                    return Some(server_file);
                }
                
                // Fallback to embedded server location
                write_log("Server not found in resources, falling back to temp");
                None
            })
    };
    
    if let Some(server_file) = server_path {
        if !server_file.exists() {
            info!("Server file not found at: {:?}", server_file);
            write_log(&format!("Server file not found at: {:?}", server_file));
            // Fall back to embedded server
            start_embedded_windows_server(port);
            return;
        }
        
        info!("Using server file: {:?}", server_file);
        write_log(&format!("Using server file: {:?}", server_file));
        
        // Get node_modules path - same logic as macOS
        let node_modules = if cfg!(debug_assertions) {
            // In development
            server_file.parent().map(|p| p.join("node_modules"))
        } else {
            // In production
            server_file.parent().map(|p| p.join("node_modules"))
        };
        
        if let Some(ref modules) = node_modules {
            if !modules.exists() {
                write_log(&format!("Warning: node_modules not found at: {:?}", modules));
            } else {
                write_log(&format!("node_modules found at: {:?}", modules));
            }
        }

        // Try to start server with Node.js
        let mut cmd = Command::new("node");
        cmd.arg(&server_file)
           .env_clear()
           .envs(std::env::vars())
           .env("PORT", port.to_string());

        if let Some(ref modules) = node_modules {
            write_log(&format!("Setting NODE_PATH to: {:?}", modules));
            cmd.env("NODE_PATH", modules);
        }

        // Windows-specific process flags
        use std::os::windows::process::CommandExt;
        const CREATE_NEW_CONSOLE: u32 = 0x00000010;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        const DETACHED_PROCESS: u32 = 0x00000008;
        
        let flags = if YURUCODE_SHOW_CONSOLE {
            info!("Console VISIBLE + DETACHED");
            CREATE_NEW_CONSOLE | DETACHED_PROCESS
        } else {
            info!("Console HIDDEN + DETACHED");
            CREATE_NO_WINDOW | DETACHED_PROCESS
        };
        
        cmd.creation_flags(flags);
        cmd.stdout(Stdio::piped())
           .stderr(Stdio::piped());
        
        match cmd.spawn() {
            Ok(mut child) => {
                let pid = child.id();
                info!("✅ Server started with PID: {}", pid);
                write_log(&format!("✅ Server started with PID: {}", pid));
                
                // Take stdout and stderr for monitoring
                let stdout = child.stdout.take();
                let stderr = child.stderr.take();
                
                // Create the process guard
                let guard = Arc::new(ServerProcessGuard::new(child));
                let guard_clone1 = Arc::clone(&guard);
                let guard_clone2 = Arc::clone(&guard);
                
                // Spawn threads to capture output
                if let Some(stdout) = stdout {
                    std::thread::spawn(move || {
                        use std::io::{BufRead, BufReader};
                        let reader = BufReader::new(stdout);
                        let mut total_bytes = 0;
                        
                        for line in reader.lines() {
                            if guard_clone1.shutdown_flag.load(Ordering::Relaxed) {
                                break;
                            }
                            
                            if let Ok(line) = line {
                                total_bytes += line.len();
                                if total_bytes < MAX_BUFFER_SIZE {
                                    guard_clone1.add_stdout_line(line.clone());
                                    write_log(&format!("[SERVER OUT] {}", line));
                                    info!("[SERVER OUT] {}", line);
                                    if YURUCODE_SHOW_CONSOLE {
                                        println!("[SERVER OUT] {}", line);
                                    }
                                }
                            }
                        }
                    });
                }
                
                if let Some(stderr) = stderr {
                    std::thread::spawn(move || {
                        use std::io::{BufRead, BufReader};
                        let reader = BufReader::new(stderr);
                        let mut total_bytes = 0;
                        
                        for line in reader.lines() {
                            if guard_clone2.shutdown_flag.load(Ordering::Relaxed) {
                                break;
                            }
                            
                            if let Ok(line) = line {
                                total_bytes += line.len();
                                if total_bytes < MAX_BUFFER_SIZE {
                                    guard_clone2.add_stderr_line(line.clone());
                                    write_log(&format!("[SERVER ERR] {}", line));
                                    info!("[SERVER ERR] {}", line);
                                    if YURUCODE_SHOW_CONSOLE {
                                        eprintln!("[SERVER ERR] {}", line);
                                    }
                                }
                            }
                        }
                    });
                }
                
                // Store the guarded process
                if let Ok(mut process_guard) = SERVER_PROCESS.lock() {
                    *process_guard = Some(guard);
                    SERVER_RUNNING.store(true, Ordering::Relaxed);
                }
                
                return;
            }
            Err(e) => {
                info!("Failed to start server: {}", e);
                write_log(&format!("Failed to start server: {}", e));
                // Fall back to embedded server
                start_embedded_windows_server(port);
            }
        }
    } else {
        // No external server found, use embedded
        start_embedded_windows_server(port);
    }
}

/// Linux-specific server startup
/// Uses an external server file (server-claude-linux.cjs)
/// Aligned with macOS and Windows for consistency
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn start_linux_server(port: u16) {
    info!("Starting Linux server on port {}", port);
    clear_log();
    write_log("=== Starting Linux server ===");
    
    let exe_path = std::env::current_exe().unwrap_or_default();
    info!("Executable path: {:?}", exe_path);
    write_log(&format!("Executable path: {:?}", exe_path));
    
    // Find the server file
    let server_path = if cfg!(debug_assertions) {
        // In development, use project root
        info!("Development mode - looking for server in project root");
        write_log("Development mode - looking for server in project root");
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent()?.parent()?.parent()?.parent().map(|p| p.to_path_buf()))
            .map(|p| p.join("server-claude-linux.cjs"))
    } else {
        // In production, look in Resources directory
        info!("Production mode - looking for server in Resources");
        write_log("Production mode - looking for server in Resources");
        
        std::env::current_exe()
            .ok()
            .and_then(|p| {
                let parent = p.parent()?;
                let resources_dir = parent.join("resources");
                write_log(&format!("Resources dir: {:?}", resources_dir));
                
                let server_file = resources_dir.join("server-claude-linux.cjs");
                if server_file.exists() {
                    write_log(&format!("Found server at: {:?}", server_file));
                    Some(server_file)
                } else {
                    write_log("Server file not found");
                    None
                }
            })
    };
    
    if let Some(server_file) = server_path {
        if !server_file.exists() {
            info!("Server file not found at: {:?}", server_file);
            write_log(&format!("ERROR: Server file not found at: {:?}", server_file));
            write_log("Please ensure server-claude-linux.cjs is in the correct location");
            return;
        }
        
        info!("Using server file: {:?}", server_file);
        write_log(&format!("Using server file: {:?}", server_file));
        
        // Get node_modules path
        let node_modules = if cfg!(debug_assertions) {
            server_file.parent().map(|p| p.join("node_modules"))
        } else {
            server_file.parent().map(|p| p.join("node_modules"))
        };
        
        if let Some(ref modules) = node_modules {
            if !modules.exists() {
                write_log(&format!("Warning: node_modules not found at: {:?}", modules));
            } else {
                write_log(&format!("node_modules found at: {:?}", modules));
            }
        }
        
        // Try to start server with Node.js
        let mut cmd = Command::new("node");
        cmd.arg(&server_file)
           .env("PORT", port.to_string());
        
        if let Some(ref modules) = node_modules {
            write_log(&format!("Setting NODE_PATH to: {:?}", modules));
            cmd.env("NODE_PATH", modules);
        }
        
        // Linux doesn't need special process flags
        cmd.stdout(Stdio::piped())
           .stderr(Stdio::piped());
        
        match cmd.spawn() {
            Ok(mut child) => {
                let pid = child.id();
                info!("✅ Server started with PID: {}", pid);
                write_log(&format!("✅ Server started with PID: {}", pid));
                
                let stdout = child.stdout.take();
                let stderr = child.stderr.take();
                
                let guard = Arc::new(ServerProcessGuard::new(child));
                let guard_clone1 = Arc::clone(&guard);
                let guard_clone2 = Arc::clone(&guard);
                
                if let Some(stdout) = stdout {
                    std::thread::spawn(move || {
                        use std::io::{BufRead, BufReader};
                        let reader = BufReader::new(stdout);
                        let mut total_bytes = 0;
                        
                        for line in reader.lines() {
                            if guard_clone1.shutdown_flag.load(Ordering::Relaxed) {
                                break;
                            }
                            
                            if let Ok(line) = line {
                                total_bytes += line.len();
                                if total_bytes < MAX_BUFFER_SIZE {
                                    guard_clone1.add_stdout_line(line.clone());
                                    write_log(&format!("[SERVER OUT] {}", line));
                                    info!("[SERVER OUT] {}", line);
                                }
                            }
                        }
                    });
                }
                
                if let Some(stderr) = stderr {
                    std::thread::spawn(move || {
                        use std::io::{BufRead, BufReader};
                        let reader = BufReader::new(stderr);
                        let mut total_bytes = 0;
                        
                        for line in reader.lines() {
                            if guard_clone2.shutdown_flag.load(Ordering::Relaxed) {
                                break;
                            }
                            
                            if let Ok(line) = line {
                                total_bytes += line.len();
                                if total_bytes < MAX_BUFFER_SIZE {
                                    guard_clone2.add_stderr_line(line.clone());
                                    write_log(&format!("[SERVER ERR] {}", line));
                                    info!("[SERVER ERR] {}", line);
                                }
                            }
                        }
                    });
                }
                
                if let Ok(mut process_guard) = SERVER_PROCESS.lock() {
                    *process_guard = Some(guard);
                    SERVER_RUNNING.store(true, Ordering::Relaxed);
                }
            }
            Err(e) => {
                info!("Failed to start server: {}", e);
                write_log(&format!("ERROR: Failed to start server: {}", e));
            }
        }
    } else {
        write_log("ERROR: Could not determine server path");
        info!("Could not determine server path");
    }
}

/// Simplified fallback for Windows when external server is not found
/// Just logs an error instead of trying to use non-existent embedded server
#[cfg(target_os = "windows")]
fn start_embedded_windows_server(port: u16) {
    info!("ERROR: External server file not found and embedded server has been removed");
    write_log("=== Server startup failed ===");
    write_log("External server file 'server-claude-windows.cjs' not found.");
    write_log("Please ensure the server file is in the correct location:");
    write_log("- Development: project root directory");
    write_log("- Production: resources directory next to executable");
    info!("Cannot start server on port {} - external file missing", port);
}
