use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::process::{Child, ChildStdin};
use tracing::{info, warn, error};

/// Type of process being tracked
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ProcessType {
    ClaudeSession {
        session_id: String,
    },
}

/// Information about a running Claude process
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessInfo {
    pub run_id: i64,
    pub process_type: ProcessType,
    pub pid: u32,
    pub started_at: DateTime<Utc>,
    pub project_path: String,
    pub task: String,
    pub model: String,
}

/// Information about a running process with handle
pub struct ProcessHandle {
    pub info: ProcessInfo,
    pub child: Arc<Mutex<Option<Child>>>,
    pub stdin: Arc<Mutex<Option<ChildStdin>>>,
    pub live_output: Arc<Mutex<String>>,
}

/// CRITICAL: Drop trait ensures process cleanup on any exit
impl Drop for ProcessHandle {
    fn drop(&mut self) {
        // Kill the process when the handle is dropped
        if let Ok(mut child_guard) = self.child.lock() {
            if let Some(mut child) = child_guard.take() {
                // Try to kill the process
                match child.start_kill() {
                    Ok(_) => {
                        info!("Killed process {} (PID: {}) on drop", self.info.run_id, self.info.pid);
                    }
                    Err(e) => {
                        // Process might already be dead, which is fine
                        warn!("Failed to kill process {} on drop: {}", self.info.run_id, e);
                    }
                }
            }
        }
    }
}

/// Registry for tracking active Claude processes
pub struct ProcessRegistry {
    processes: Arc<Mutex<HashMap<i64, ProcessHandle>>>, // run_id -> ProcessHandle
    next_id: Arc<Mutex<i64>>, // Auto-incrementing ID for processes
}

impl ProcessRegistry {
    pub fn new() -> Self {
        Self {
            processes: Arc::new(Mutex::new(HashMap::new())),
            next_id: Arc::new(Mutex::new(1000000)), // Start at high number to avoid conflicts
        }
    }

    /// Generate a unique ID for processes
    pub fn generate_id(&self) -> Result<i64, String> {
        let mut next_id = self.next_id.lock().map_err(|e| e.to_string())?;
        let id = *next_id;
        *next_id += 1;
        Ok(id)
    }

    /// Register a new Claude session (without child process - handled separately)
    /// CRITICAL: This should be called IMMEDIATELY after spawning
    pub fn register_claude_session(
        &self,
        session_id: String,
        pid: u32,
        project_path: String,
        task: String,
        model: String,
    ) -> Result<i64, String> {
        let run_id = self.generate_id()?;
        
        let process_info = ProcessInfo {
            run_id,
            process_type: ProcessType::ClaudeSession { session_id: session_id.clone() },
            pid,
            started_at: Utc::now(),
            project_path,
            task,
            model,
        };

        // Register without child - Claude sessions will have process added later
        let mut processes = self.processes.lock().map_err(|e| e.to_string())?;
        
        let process_handle = ProcessHandle {
            info: process_info,
            child: Arc::new(Mutex::new(None)), // No child handle initially
            stdin: Arc::new(Mutex::new(None)), // No stdin initially
            live_output: Arc::new(Mutex::new(String::new())),
        };

        processes.insert(run_id, process_handle);
        info!("Registered Claude session {} with run_id {}", session_id, run_id);
        Ok(run_id)
    }

    /// Register a Claude process with its Child handle
    /// Used when we have the actual process handle
    pub fn register_claude_process(
        &self,
        session_id: String,
        pid: u32,
        project_path: String,
        task: String,
        model: String,
        mut child: Child,
    ) -> Result<i64, String> {
        let run_id = self.generate_id()?;
        
        let process_info = ProcessInfo {
            run_id,
            process_type: ProcessType::ClaudeSession { session_id: session_id.clone() },
            pid,
            started_at: Utc::now(),
            project_path,
            task,
            model,
        };

        // Take stdin from the child for later use
        let stdin = child.stdin.take();

        let mut processes = self.processes.lock().map_err(|e| e.to_string())?;
        
        let process_handle = ProcessHandle {
            info: process_info,
            child: Arc::new(Mutex::new(Some(child))),
            stdin: Arc::new(Mutex::new(stdin)),
            live_output: Arc::new(Mutex::new(String::new())),
        };

        processes.insert(run_id, process_handle);
        info!("Registered Claude process {} (PID: {}) with run_id {}", session_id, pid, run_id);
        Ok(run_id)
    }

    /// Update an existing registration with the Child handle
    pub fn update_with_child(&self, run_id: i64, child: Child) -> Result<(), String> {
        let processes = self.processes.lock().map_err(|e| e.to_string())?;
        if let Some(handle) = processes.get(&run_id) {
            let mut child_guard = handle.child.lock().map_err(|e| e.to_string())?;
            *child_guard = Some(child);
            info!("Updated process {} with child handle", run_id);
            Ok(())
        } else {
            Err(format!("Process {} not found in registry", run_id))
        }
    }

    /// Takes the child process from the registry for external use
    /// This is used when we need to extract the session ID from stdout
    pub fn take_child(&self, run_id: i64) -> Result<Option<Child>, String> {
        let processes = self.processes.lock().map_err(|e| e.to_string())?;
        if let Some(handle) = processes.get(&run_id) {
            let mut child_guard = handle.child.lock().map_err(|e| e.to_string())?;
            let child = child_guard.take();
            if child.is_some() {
                info!("Took child process from registry for run_id {}", run_id);
            } else {
                warn!("No child process available for run_id {}", run_id);
            }
            Ok(child)
        } else {
            Err(format!("Process {} not found in registry", run_id))
        }
    }

    /// Returns the child process to the registry after use
    pub fn return_child(&self, run_id: i64, child: Child) -> Result<(), String> {
        let processes = self.processes.lock().map_err(|e| e.to_string())?;
        if let Some(handle) = processes.get(&run_id) {
            let mut child_guard = handle.child.lock().map_err(|e| e.to_string())?;
            *child_guard = Some(child);
            info!("Returned child process to registry for run_id {}", run_id);
            Ok(())
        } else {
            Err(format!("Process {} not found in registry", run_id))
        }
    }

    /// Get all running Claude sessions
    pub fn get_running_claude_sessions(&self) -> Result<Vec<ProcessInfo>, String> {
        let processes = self.processes.lock().map_err(|e| e.to_string())?;
        Ok(processes
            .values()
            .filter_map(|handle| {
                match &handle.info.process_type {
                    ProcessType::ClaudeSession { .. } => Some(handle.info.clone()),
                }
            })
            .collect())
    }

    /// Get a specific Claude session by session ID
    pub fn get_claude_session_by_id(&self, session_id: &str) -> Result<Option<ProcessInfo>, String> {
        let processes = self.processes.lock().map_err(|e| e.to_string())?;
        Ok(processes
            .values()
            .find(|handle| {
                match &handle.info.process_type {
                    ProcessType::ClaudeSession { session_id: sid } => sid == session_id,
                }
            })
            .map(|handle| handle.info.clone()))
    }

    /// Unregister a process (called when it completes)
    pub fn unregister_process(&self, run_id: i64) -> Result<(), String> {
        let mut processes = self.processes.lock().map_err(|e| e.to_string())?;
        if processes.remove(&run_id).is_some() {
            info!("Unregistered process {}", run_id);
            Ok(())
        } else {
            warn!("Tried to unregister non-existent process {}", run_id);
            Ok(())
        }
    }

    /// Get all running processes
    pub fn get_running_processes(&self) -> Result<Vec<ProcessInfo>, String> {
        let processes = self.processes.lock().map_err(|e| e.to_string())?;
        Ok(processes
            .values()
            .map(|handle| handle.info.clone())
            .collect())
    }

    /// Kill a running process with proper cleanup
    pub async fn kill_process(&self, run_id: i64) -> Result<bool, String> {
        // First check if the process exists and get its PID
        let (pid, child_arc) = {
            let processes = self.processes.lock().map_err(|e| e.to_string())?;
            if let Some(handle) = processes.get(&run_id) {
                (handle.info.pid, handle.child.clone())
            } else {
                warn!("Process {} not found in registry", run_id);
                return Ok(false); // Process not found
            }
        };

        info!("Attempting graceful shutdown of process {} (PID: {})", run_id, pid);

        // Send kill signal to the process
        let kill_sent = {
            let mut child_guard = child_arc.lock().map_err(|e| e.to_string())?;
            if let Some(child) = child_guard.as_mut() {
                match child.start_kill() {
                    Ok(_) => {
                        info!("Successfully sent kill signal to process {}", run_id);
                        true
                    }
                    Err(e) => {
                        error!("Failed to send kill signal to process {}: {}", run_id, e);
                        false
                    }
                }
            } else {
                warn!("No child handle available for process {} (PID: {}), attempting system kill", run_id, pid);
                false
            }
        };

        // If direct kill didn't work, try system command as fallback
        if !kill_sent {
            info!("Attempting fallback kill for process {} (PID: {})", run_id, pid);
            match self.kill_process_by_pid(run_id, pid) {
                Ok(true) => return Ok(true),
                Ok(false) => warn!("Fallback kill also failed for process {} (PID: {})", run_id, pid),
                Err(e) => error!("Error during fallback kill: {}", e),
            }
        }

        // Wait for the process to exit (with timeout)
        let wait_result = tokio::time::timeout(tokio::time::Duration::from_secs(5), async {
            loop {
                // Check if process has exited
                let status = {
                    let mut child_guard = child_arc.lock().map_err(|e| e.to_string())?;
                    if let Some(child) = child_guard.as_mut() {
                        match child.try_wait() {
                            Ok(Some(status)) => {
                                info!("Process {} exited with status: {:?}", run_id, status);
                                *child_guard = None; // Clear the child handle
                                Some(Ok::<(), String>(()))
                            }
                            Ok(None) => {
                                // Still running
                                None
                            }
                            Err(e) => {
                                error!("Error checking process status: {}", e);
                                Some(Err(e.to_string()))
                            }
                        }
                    } else {
                        // Process already gone
                        Some(Ok(()))
                    }
                };

                match status {
                    Some(result) => return result,
                    None => {
                        // Still running, wait a bit
                        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                    }
                }
            }
        })
        .await;

        match wait_result {
            Ok(Ok(_)) => {
                info!("Process {} exited gracefully", run_id);
            }
            Ok(Err(e)) => {
                error!("Error waiting for process {}: {}", run_id, e);
            }
            Err(_) => {
                warn!("Process {} didn't exit within 5 seconds after kill", run_id);
                // Force clear the handle
                if let Ok(mut child_guard) = child_arc.lock() {
                    *child_guard = None;
                }
                // One more attempt with system kill
                let _ = self.kill_process_by_pid(run_id, pid);
            }
        }

        // Remove from registry after killing
        self.unregister_process(run_id)?;
        Ok(true)
    }

    /// Kill a process by PID using system commands (fallback method)
    pub fn kill_process_by_pid(&self, run_id: i64, pid: u32) -> Result<bool, String> {
        info!("Attempting to kill process {} by PID {}", run_id, pid);

        let kill_result = if cfg!(target_os = "windows") {
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                const CREATE_NO_WINDOW: u32 = 0x08000000;
                std::process::Command::new("taskkill")
                    .args(["/F", "/PID", &pid.to_string()])
                    .creation_flags(CREATE_NO_WINDOW)
                    .output()
            }
            #[cfg(not(target_os = "windows"))]
            {
                unreachable!()
            }
        } else {
            // First try SIGTERM
            let term_result = std::process::Command::new("kill")
                .args(["-TERM", &pid.to_string()])
                .output();

            match &term_result {
                Ok(output) if output.status.success() => {
                    info!("Sent SIGTERM to PID {}", pid);
                    // Give it 2 seconds to exit gracefully
                    std::thread::sleep(std::time::Duration::from_secs(2));

                    // Check if still running
                    let check_result = std::process::Command::new("kill")
                        .args(["-0", &pid.to_string()])
                        .output();

                    if let Ok(output) = check_result {
                        if output.status.success() {
                            // Still running, send SIGKILL
                            warn!("Process {} still running after SIGTERM, sending SIGKILL", pid);
                            std::process::Command::new("kill")
                                .args(["-KILL", &pid.to_string()])
                                .output()
                        } else {
                            term_result
                        }
                    } else {
                        term_result
                    }
                }
                _ => {
                    // SIGTERM failed, try SIGKILL directly
                    warn!("SIGTERM failed for PID {}, trying SIGKILL", pid);
                    std::process::Command::new("kill")
                        .args(["-KILL", &pid.to_string()])
                        .output()
                }
            }
        };

        match kill_result {
            Ok(output) => {
                if output.status.success() {
                    info!("Successfully killed process with PID {}", pid);
                    // Remove from registry
                    self.unregister_process(run_id)?;
                    Ok(true)
                } else {
                    let error_msg = String::from_utf8_lossy(&output.stderr);
                    warn!("Failed to kill PID {}: {}", pid, error_msg);
                    Ok(false)
                }
            }
            Err(e) => {
                error!("Failed to execute kill command for PID {}: {}", pid, e);
                Err(format!("Failed to execute kill command: {}", e))
            }
        }
    }

    /// Check if a process is still running
    pub async fn is_process_running(&self, run_id: i64) -> Result<bool, String> {
        let processes = self.processes.lock().map_err(|e| e.to_string())?;

        if let Some(handle) = processes.get(&run_id) {
            let child_arc = handle.child.clone();
            drop(processes); // Release the lock before async operation

            let mut child_guard = child_arc.lock().map_err(|e| e.to_string())?;
            if let Some(ref mut child) = child_guard.as_mut() {
                match child.try_wait() {
                    Ok(Some(_)) => {
                        // Process has exited
                        *child_guard = None;
                        Ok(false)
                    }
                    Ok(None) => {
                        // Process is still running
                        Ok(true)
                    }
                    Err(_) => {
                        // Error checking status, assume not running
                        *child_guard = None;
                        Ok(false)
                    }
                }
            } else {
                Ok(false) // No child handle
            }
        } else {
            Ok(false) // Process not found in registry
        }
    }

    /// Append to live output for a process
    pub fn append_live_output(&self, run_id: i64, output: &str) -> Result<(), String> {
        let processes = self.processes.lock().map_err(|e| e.to_string())?;
        if let Some(handle) = processes.get(&run_id) {
            let mut live_output = handle.live_output.lock().map_err(|e| e.to_string())?;
            live_output.push_str(output);
            live_output.push('\n');
        }
        Ok(())
    }

    /// Get live output for a process
    pub fn get_live_output(&self, run_id: i64) -> Result<String, String> {
        let processes = self.processes.lock().map_err(|e| e.to_string())?;
        if let Some(handle) = processes.get(&run_id) {
            let live_output = handle.live_output.lock().map_err(|e| e.to_string())?;
            Ok(live_output.clone())
        } else {
            Ok(String::new())
        }
    }

    /// Clear live output for a process
    pub fn clear_live_output(&self, run_id: i64) -> Result<(), String> {
        let processes = self.processes.lock().map_err(|e| e.to_string())?;
        if let Some(handle) = processes.get(&run_id) {
            let mut live_output = handle.live_output.lock().map_err(|e| e.to_string())?;
            live_output.clear();
        }
        Ok(())
    }

    /// Write to stdin of a process
    pub async fn write_to_stdin(&self, run_id: i64, data: &str) -> Result<(), String> {
        use tokio::io::AsyncWriteExt;
        
        // First, get the stdin handle in a non-async block to avoid holding guards across await
        let stdin_option = {
            let processes = self.processes.lock().map_err(|e| e.to_string())?;
            if let Some(handle) = processes.get(&run_id) {
                let mut stdin_guard = handle.stdin.lock().map_err(|e| e.to_string())?;
                stdin_guard.take()
            } else {
                return Err(format!("Process {} not found in registry", run_id));
            }
        };
        
        // Now do the async write operation without holding any locks
        if let Some(mut stdin) = stdin_option {
            let write_result = async {
                stdin.write_all(data.as_bytes()).await
                    .map_err(|e| format!("Failed to write to stdin: {}", e))?;
                stdin.write_all(b"\n").await
                    .map_err(|e| format!("Failed to write newline: {}", e))?;
                stdin.flush().await
                    .map_err(|e| format!("Failed to flush stdin: {}", e))?;
                Ok::<_, String>(stdin)
            }.await;
            
            // Put the stdin back
            match write_result {
                Ok(stdin) => {
                    let processes = self.processes.lock().map_err(|e| e.to_string())?;
                    if let Some(handle) = processes.get(&run_id) {
                        let mut stdin_guard = handle.stdin.lock().map_err(|e| e.to_string())?;
                        *stdin_guard = Some(stdin);
                    }
                    info!("Wrote {} bytes to stdin of process {}", data.len(), run_id);
                    Ok(())
                }
                Err(e) => Err(e)
            }
        } else {
            Err(format!("No stdin available for process {}", run_id))
        }
    }

    /// Cleanup finished processes
    pub async fn cleanup_finished_processes(&self) -> Result<Vec<i64>, String> {
        let mut finished_runs = Vec::new();
        let processes_lock = self.processes.clone();

        // First, identify finished processes
        {
            let processes = processes_lock.lock().map_err(|e| e.to_string())?;
            let run_ids: Vec<i64> = processes.keys().cloned().collect();
            drop(processes);

            for run_id in run_ids {
                if !self.is_process_running(run_id).await? {
                    finished_runs.push(run_id);
                }
            }
        }

        // Then remove them from the registry
        {
            let mut processes = processes_lock.lock().map_err(|e| e.to_string())?;
            for run_id in &finished_runs {
                processes.remove(run_id);
                info!("Cleaned up finished process {}", run_id);
            }
        }

        Ok(finished_runs)
    }

    /// Kill all processes (used on app shutdown)
    pub async fn kill_all_processes(&self) -> Result<(), String> {
        let run_ids: Vec<i64> = {
            let processes = self.processes.lock().map_err(|e| e.to_string())?;
            processes.keys().cloned().collect()
        };

        info!("Killing {} processes on shutdown", run_ids.len());
        
        for run_id in run_ids {
            match self.kill_process(run_id).await {
                Ok(_) => info!("Killed process {}", run_id),
                Err(e) => error!("Failed to kill process {}: {}", run_id, e),
            }
        }

        Ok(())
    }
}

impl Default for ProcessRegistry {
    fn default() -> Self {
        Self::new()
    }
}

/// Global process registry state wrapper for Tauri state management
pub struct ProcessRegistryState(pub Arc<ProcessRegistry>);

impl Default for ProcessRegistryState {
    fn default() -> Self {
        Self(Arc::new(ProcessRegistry::new()))
    }
}