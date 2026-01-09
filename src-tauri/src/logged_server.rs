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

/// Returns the platform-specific path for the server PID file
/// Uses a unique filename based on executable path hash to allow multiple
/// instances (dev + release) to coexist without killing each other
fn get_pid_file_path() -> PathBuf {
    let data_dir = if cfg!(target_os = "macos") {
        dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("/tmp"))
            .join("Library")
            .join("Application Support")
            .join("yurucode")
    } else if cfg!(target_os = "windows") {
        dirs::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("C:\\temp"))
            .join("yurucode")
    } else {
        dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("/tmp"))
            .join(".yurucode")
    };

    let _ = fs::create_dir_all(&data_dir);

    // Use executable path to create unique PID file per instance (dev vs release)
    let exe_path = std::env::current_exe().unwrap_or_default();
    let exe_hash = {
        use std::hash::{Hash, Hasher};
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        exe_path.hash(&mut hasher);
        format!("{:x}", hasher.finish())
    };

    data_dir.join(format!("server-{}.pid", &exe_hash[..8]))
}

/// Saves the server process PID to a file for orphan detection
fn save_server_pid(pid: u32) {
    let pid_path = get_pid_file_path();
    if let Ok(mut file) = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&pid_path)
    {
        let _ = writeln!(file, "{}", pid);
        info!("Saved server PID {} to {:?}", pid, pid_path);
    }
}

/// Removes the PID file on clean shutdown
fn remove_pid_file() {
    let pid_path = get_pid_file_path();
    if pid_path.exists() {
        let _ = fs::remove_file(&pid_path);
        info!("Removed PID file {:?}", pid_path);
    }
}

/// Kills any orphaned server processes from crashed sessions
/// Called on startup before spawning a new server
/// Kills servers from the SAME installation path (dev or production) to prevent zombies
/// while still allowing dev+release instances to coexist
pub fn kill_orphaned_servers() {
    info!("Checking for orphaned server processes from previous session...");

    // First, try to kill from PID file (specific process)
    let pid_path = get_pid_file_path();
    if pid_path.exists() {
        if let Ok(contents) = fs::read_to_string(&pid_path) {
            if let Ok(old_pid) = contents.trim().parse::<u32>() {
                info!("Found old PID file with PID: {}", old_pid);
                kill_process_by_pid(old_pid);
            }
        }
        let _ = fs::remove_file(&pid_path);
    }

    // Also kill any zombie servers from the SAME installation path
    // This prevents zombie accumulation from crashed instances
    kill_servers_from_same_install();
}

/// Kill a specific process by PID
fn kill_process_by_pid(pid: u32) {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let _ = Command::new("taskkill")
            .args(&["/F", "/PID", &pid.to_string()])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
        info!("Attempted to kill Windows process PID: {}", pid);
    }

    #[cfg(not(target_os = "windows"))]
    {
        // Check if process exists first
        let check = Command::new("kill")
            .args(&["-0", &pid.to_string()])
            .output();

        if check.is_ok() && check.unwrap().status.success() {
            let _ = Command::new("kill")
                .args(&["-9", &pid.to_string()])
                .output();
            info!("Killed orphaned process PID: {}", pid);
        }
    }
}

/// Kill server processes from the SAME installation path as current executable
/// Dev instances only kill dev servers, production only kills production servers
fn kill_servers_from_same_install() {
    // Get our server path to determine if we're dev or production
    let our_server_path = get_our_server_path();

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        if let Some(path) = our_server_path {
            // Use WMIC to find processes by path
            let path_escaped = path.replace("\\", "\\\\");
            if let Ok(output) = Command::new("wmic")
                .args(&["process", "where", &format!("ExecutablePath like '%{}%'", path_escaped), "get", "ProcessId"])
                .creation_flags(CREATE_NO_WINDOW)
                .output()
            {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for line in stdout.lines().skip(1) {
                    if let Ok(pid) = line.trim().parse::<u32>() {
                        let _ = Command::new("taskkill")
                            .args(&["/F", "/PID", &pid.to_string()])
                            .creation_flags(CREATE_NO_WINDOW)
                            .output();
                        info!("Killed zombie server process PID: {} from same install", pid);
                    }
                }
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Some(path) = our_server_path {
            // Use pkill with exact path pattern to only kill servers from our install
            // This allows dev and production to coexist
            let escaped_path = path.replace("/", "\\/");
            if let Ok(output) = Command::new("pgrep")
                .args(&["-f", &escaped_path])
                .output()
            {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for line in stdout.lines() {
                    if let Ok(pid) = line.trim().parse::<u32>() {
                        let _ = Command::new("kill")
                            .args(&["-9", &pid.to_string()])
                            .output();
                        info!("Killed zombie server PID: {} from path: {}", pid, path);
                    }
                }
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Some(path) = our_server_path {
            let escaped_path = path.replace("/", "\\/");
            if let Ok(output) = Command::new("pgrep")
                .args(&["-f", &escaped_path])
                .output()
            {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for line in stdout.lines() {
                    if let Ok(pid) = line.trim().parse::<u32>() {
                        let _ = Command::new("kill")
                            .args(&["-9", &pid.to_string()])
                            .output();
                        info!("Killed zombie server PID: {} from path: {}", pid, path);
                    }
                }
            }
        }
    }
}

/// Get the server path for our installation (dev or production)
fn get_our_server_path() -> Option<String> {
    let exe_path = std::env::current_exe().ok()?;

    #[cfg(target_os = "macos")]
    {
        let arch = if cfg!(target_arch = "aarch64") { "arm64" } else { "x64" };
        let binary_name = format!("server-macos-{}", arch);

        if cfg!(debug_assertions) {
            // Dev mode - server is in project's src-tauri/resources/
            exe_path.parent()?.parent()?.parent()?.parent()
                .map(|p| p.join("src-tauri").join("resources").join(&binary_name))
                .map(|p| p.to_string_lossy().to_string())
        } else {
            // Production - server is in .app bundle
            let macos_dir = exe_path.parent()?;
            let contents_dir = macos_dir.parent()?;
            Some(contents_dir.join("Resources").join("resources").join(&binary_name)
                .to_string_lossy().to_string())
        }
    }

    #[cfg(target_os = "windows")]
    {
        let binary_name = "server-windows-x64.exe";
        if cfg!(debug_assertions) {
            exe_path.parent()?.parent()?.parent()?.parent()
                .map(|p| p.join("src-tauri").join("resources").join(binary_name))
                .map(|p| p.to_string_lossy().to_string())
        } else {
            exe_path.parent()
                .map(|p| p.join("resources").join(binary_name))
                .map(|p| p.to_string_lossy().to_string())
        }
    }

    #[cfg(target_os = "linux")]
    {
        let binary_name = "server-linux-x64";
        if cfg!(debug_assertions) {
            exe_path.parent()?.parent()?.parent()?.parent()
                .map(|p| p.join("src-tauri").join("resources").join(binary_name))
                .map(|p| p.to_string_lossy().to_string())
        } else {
            exe_path.parent()
                .map(|p| p.join("resources").join(binary_name))
                .map(|p| p.to_string_lossy().to_string())
        }
    }
}

/// Kill all server processes by name pattern
fn kill_server_processes_by_name() {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        // Kill any server-windows processes
        let _ = Command::new("taskkill")
            .args(&["/F", "/IM", "server-windows-x64.exe"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
    }

    #[cfg(target_os = "macos")]
    {
        // Use pkill to kill by process name pattern
        let _ = Command::new("pkill")
            .args(&["-9", "-f", "server-macos-arm64|server-macos-x64|server-claude-macos"])
            .output();
        info!("Attempted to kill orphaned macOS server processes by name");
    }

    #[cfg(target_os = "linux")]
    {
        let _ = Command::new("pkill")
            .args(&["-9", "-f", "server-linux-x64|server-claude-linux"])
            .output();
        info!("Attempted to kill orphaned Linux server processes by name");
    }
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

    // Remove PID file on clean shutdown
    remove_pid_file();

    // Note: Claude processes spawned by Yurucode are cleaned up via ProcessRegistry's
    // Drop trait, which only kills processes we spawned (not external Claude instances)
}


/// Starts the Node.js backend server with a held port (TOCTOU-safe)
/// The held port is released right before spawning the server process
/// to minimize the race condition window
pub fn start_logged_server_with_held_port(held_port: crate::port_manager::HeldPort) {
    let port = held_port.port;
    info!("Starting server on port {} (releasing held port)", port);

    // Stop any existing server first to avoid port conflicts
    stop_logged_server();

    // Store the port
    if let Ok(mut port_guard) = SERVER_PORT.lock() {
        *port_guard = Some(port);
    }

    // Release the held port RIGHT BEFORE spawning the server
    // This minimizes the TOCTOU race window
    held_port.release();

    // Small sleep to ensure OS registers port release (typically < 10ms needed)
    std::thread::sleep(std::time::Duration::from_millis(50));

    start_server_internal(port);
}

/// Starts the Node.js backend server on the specified port
/// All platforms now use external server files:
/// - macOS: server-claude-macos.cjs
/// - Windows: server-claude-windows.cjs (with fallback error handling)
/// - Linux: server-claude-linux.cjs
/// The server is started as a detached process that survives parent crashes
pub fn start_logged_server(port: u16) {
    info!("Starting server on port {} (legacy mode)", port);

    // Stop any existing server first to avoid port conflicts
    stop_logged_server();

    // Store the port
    if let Ok(mut port_guard) = SERVER_PORT.lock() {
        *port_guard = Some(port);
    }

    // Platform-specific wait times for port release
    // Windows has slower port release due to TIME_WAIT state handling
    #[cfg(target_os = "windows")]
    let wait_ms = 1000u64; // Windows needs longer wait
    #[cfg(not(target_os = "windows"))]
    let wait_ms = 300u64; // macOS/Linux are faster

    info!("Waiting {}ms for port release (platform-specific)", wait_ms);
    std::thread::sleep(std::time::Duration::from_millis(wait_ms));

    start_server_internal(port);
}

/// Internal function that actually starts the server
fn start_server_internal(port: u16) {
    // Kill any orphaned server processes from previous crashed sessions
    kill_orphaned_servers();

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
/// Uses compiled binary (server-macos-arm64 or server-macos-x64) instead of Node.js
/// This hides source code and removes Node.js dependency for end users
#[cfg(target_os = "macos")]
fn start_macos_server(port: u16) {
    info!("Starting macOS server on port {}", port);
    clear_log();
    write_log("=== Starting macOS server (binary mode) ===");

    let exe_path = std::env::current_exe().unwrap_or_default();
    info!("Executable path: {:?}", exe_path);
    write_log(&format!("Executable path: {:?}", exe_path));

    // Detect architecture
    let arch = if cfg!(target_arch = "aarch64") { "arm64" } else { "x64" };
    let binary_name = format!("server-macos-{}", arch);
    write_log(&format!("Architecture: {}, binary: {}", arch, binary_name));

    // Find the server binary
    let server_path = if cfg!(debug_assertions) {
        // In development, use project root resources
        info!("Development mode - looking for binary in project root");
        write_log("Development mode - looking for binary in project root");
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent()?.parent()?.parent()?.parent().map(|p| p.to_path_buf()))
            .map(|p| p.join("src-tauri").join("resources").join(&binary_name))
    } else {
        // In production, look in .app bundle
        info!("Production mode - looking for binary in .app bundle");
        write_log("Production mode - looking for binary in .app bundle");

        std::env::current_exe()
            .ok()
            .and_then(|p| {
                write_log(&format!("Exe: {:?}", p));
                let macos_dir = p.parent()?;
                let contents_dir = macos_dir.parent()?;
                let resources_dir = contents_dir.join("Resources").join("resources");
                write_log(&format!("Resources dir: {:?}", resources_dir));

                let binary_path = resources_dir.join(&binary_name);
                if binary_path.exists() {
                    write_log(&format!("Found binary at: {:?}", binary_path));
                    return Some(binary_path);
                }

                // Fallback to .cjs file for backwards compatibility
                let cjs_path = resources_dir.join("server-claude-macos.cjs");
                if cjs_path.exists() {
                    write_log(&format!("Fallback to .cjs at: {:?}", cjs_path));
                    return Some(cjs_path);
                }

                write_log("No server binary or .cjs found");
                None
            })
    };

    if let Some(server_file) = server_path {
        if !server_file.exists() {
            info!("Server not found at: {:?}", server_file);
            write_log(&format!("ERROR: Server not found at: {:?}", server_file));
            return;
        }

        info!("Using server: {:?}", server_file);
        write_log(&format!("Using server: {:?}", server_file));

        // Check if this is a binary or .cjs file
        let is_binary = !server_file.extension().map_or(false, |e| e == "cjs" || e == "js");

        let mut cmd = if is_binary {
            // Direct binary execution
            write_log("Spawning compiled binary directly");
            Command::new(&server_file)
        } else {
            // Fallback: run with node
            write_log("Fallback: spawning with node");
            let mut c = Command::new("node");
            c.arg(&server_file);
            c
        };

        cmd.env_clear()
           .envs(std::env::vars())
           .env("PORT", port.to_string())
           .stdout(Stdio::piped())
           .stderr(Stdio::piped());

        if let Some(working_dir) = server_file.parent() {
            cmd.current_dir(working_dir);
            write_log(&format!("Working directory: {:?}", working_dir));
        }

        write_log(&format!("Spawn command on port {}", port));
        match cmd.spawn() {
            Ok(mut child) => {
                let pid = child.id();
                write_log(&format!("✅ macOS server spawned with PID: {}", pid));
                info!("✅ macOS server spawned with PID: {}", pid);

                // Save PID for orphan detection on next startup
                save_server_pid(pid);

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

                info!("✅ macOS server process tracking set up");
            }
            Err(e) => {
                write_log(&format!("❌ Failed to start macOS server: {}", e));
                info!("❌ Failed to start macOS server: {}", e);
            }
        }
    } else {
        write_log("ERROR: Could not determine server path");
        info!("Could not determine server path");
    }
}

/// Windows-specific server startup
/// Uses compiled binary (server-windows-x64.exe) instead of Node.js
/// This hides source code and removes Node.js dependency for end users
#[cfg(target_os = "windows")]
fn start_windows_server(port: u16) {
    info!("Starting Windows server on port {}", port);
    clear_log();
    write_log("=== Starting Windows server (binary mode) ===");

    let exe_path = std::env::current_exe().unwrap_or_default();
    info!("Executable path: {:?}", exe_path);
    write_log(&format!("Executable path: {:?}", exe_path));

    // Windows binary name
    let binary_name = "server-windows-x64.exe";
    write_log(&format!("Binary: {}", binary_name));

    // Find the server binary
    let server_path = if cfg!(debug_assertions) {
        // In development, use project root resources
        info!("Development mode - looking for binary in project root");
        write_log("Development mode - looking for binary in project root");
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent()?.parent()?.parent()?.parent().map(|p| p.to_path_buf()))
            .map(|p| p.join("src-tauri").join("resources").join(binary_name))
    } else {
        // In production, look in resources directory
        info!("Production mode - looking for binary in resources");
        write_log("Production mode - looking for binary in resources");

        std::env::current_exe()
            .ok()
            .and_then(|p| {
                let parent = p.parent()?;
                let resources_dir = parent.join("resources");
                write_log(&format!("Resources dir: {:?}", resources_dir));

                let binary_path = resources_dir.join(binary_name);
                if binary_path.exists() {
                    write_log(&format!("Found binary at: {:?}", binary_path));
                    return Some(binary_path);
                }

                // Fallback to .cjs file for backwards compatibility
                let cjs_path = resources_dir.join("server-claude-windows.cjs");
                if cjs_path.exists() {
                    write_log(&format!("Fallback to .cjs at: {:?}", cjs_path));
                    return Some(cjs_path);
                }

                write_log("No server binary or .cjs found");
                None
            })
    };

    if let Some(server_file) = server_path {
        if !server_file.exists() {
            info!("Server not found at: {:?}", server_file);
            write_log(&format!("ERROR: Server not found at: {:?}", server_file));
            start_embedded_windows_server(port);
            return;
        }

        info!("Using server: {:?}", server_file);
        write_log(&format!("Using server: {:?}", server_file));

        // Check if this is a binary (.exe) or .cjs file
        let is_binary = server_file.extension().map_or(false, |e| e == "exe");

        let mut cmd = if is_binary {
            // Direct binary execution
            write_log("Spawning compiled binary directly");
            Command::new(&server_file)
        } else {
            // Fallback: run with node
            write_log("Fallback: spawning with node");
            let mut c = Command::new("node");
            c.arg(&server_file);
            c
        };

        cmd.env_clear()
           .envs(std::env::vars())
           .env("PORT", port.to_string());

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

        if let Some(working_dir) = server_file.parent() {
            cmd.current_dir(working_dir);
            write_log(&format!("Working directory: {:?}", working_dir));
        }

        write_log(&format!("Spawn command on port {}", port));
        match cmd.spawn() {
            Ok(mut child) => {
                let pid = child.id();
                info!("✅ Server started with PID: {}", pid);
                write_log(&format!("✅ Server started with PID: {}", pid));

                // Save PID for orphan detection on next startup
                save_server_pid(pid);

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

                if let Ok(mut process_guard) = SERVER_PROCESS.lock() {
                    *process_guard = Some(guard);
                    SERVER_RUNNING.store(true, Ordering::Relaxed);
                }

                info!("✅ Windows server process tracking set up");
            }
            Err(e) => {
                write_log(&format!("❌ Failed to start Windows server: {}", e));
                info!("❌ Failed to start Windows server: {}", e);
                start_embedded_windows_server(port);
            }
        }
    } else {
        write_log("ERROR: Could not determine server path");
        info!("Could not determine server path");
        start_embedded_windows_server(port);
    }
}

/// Linux-specific server startup
/// Uses compiled binary (server-linux-x64) instead of Node.js
/// This hides source code and removes Node.js dependency for end users
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn start_linux_server(port: u16) {
    info!("Starting Linux server on port {}", port);
    clear_log();
    write_log("=== Starting Linux server (binary mode) ===");

    let exe_path = std::env::current_exe().unwrap_or_default();
    info!("Executable path: {:?}", exe_path);
    write_log(&format!("Executable path: {:?}", exe_path));

    // Linux binary name (currently only x64 supported)
    let binary_name = "server-linux-x64";
    write_log(&format!("Binary: {}", binary_name));

    // Find the server binary
    let server_path = if cfg!(debug_assertions) {
        // In development, use project root resources
        info!("Development mode - looking for binary in project root");
        write_log("Development mode - looking for binary in project root");
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent()?.parent()?.parent()?.parent().map(|p| p.to_path_buf()))
            .map(|p| p.join("src-tauri").join("resources").join(binary_name))
    } else {
        // In production, look in resources directory
        info!("Production mode - looking for binary in resources");
        write_log("Production mode - looking for binary in resources");

        std::env::current_exe()
            .ok()
            .and_then(|p| {
                let parent = p.parent()?;
                let resources_dir = parent.join("resources");
                write_log(&format!("Resources dir: {:?}", resources_dir));

                let binary_path = resources_dir.join(binary_name);
                if binary_path.exists() {
                    write_log(&format!("Found binary at: {:?}", binary_path));
                    return Some(binary_path);
                }

                // Fallback to .cjs file for backwards compatibility
                let cjs_path = resources_dir.join("server-claude-linux.cjs");
                if cjs_path.exists() {
                    write_log(&format!("Fallback to .cjs at: {:?}", cjs_path));
                    return Some(cjs_path);
                }

                write_log("No server binary or .cjs found");
                None
            })
    };

    if let Some(server_file) = server_path {
        if !server_file.exists() {
            info!("Server not found at: {:?}", server_file);
            write_log(&format!("ERROR: Server not found at: {:?}", server_file));
            return;
        }

        info!("Using server: {:?}", server_file);
        write_log(&format!("Using server: {:?}", server_file));

        // Check if this is a binary or .cjs file
        let is_binary = !server_file.extension().map_or(false, |e| e == "cjs" || e == "js");

        let mut cmd = if is_binary {
            // Direct binary execution
            write_log("Spawning compiled binary directly");
            Command::new(&server_file)
        } else {
            // Fallback: run with node
            write_log("Fallback: spawning with node");
            let mut c = Command::new("node");
            c.arg(&server_file);
            c
        };

        cmd.env_clear()
           .envs(std::env::vars())
           .env("PORT", port.to_string())
           .stdout(Stdio::piped())
           .stderr(Stdio::piped());

        if let Some(working_dir) = server_file.parent() {
            cmd.current_dir(working_dir);
            write_log(&format!("Working directory: {:?}", working_dir));
        }

        write_log(&format!("Spawn command on port {}", port));
        match cmd.spawn() {
            Ok(mut child) => {
                let pid = child.id();
                info!("✅ Server started with PID: {}", pid);
                write_log(&format!("✅ Server started with PID: {}", pid));

                // Save PID for orphan detection on next startup
                save_server_pid(pid);

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
