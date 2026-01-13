use std::fs;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use tracing::{error, info, warn};
use tauri::{AppHandle, Manager, Runtime, Emitter};
use std::sync::{Arc, Mutex};
use chrono::{DateTime, Utc};
use crate::app::APP_ID;

/// Crash recovery state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrashRecoveryState {
    pub last_session_id: Option<String>,
    pub last_crash_time: Option<DateTime<Utc>>,
    pub crash_count: u32,
    pub recovered_sessions: Vec<RecoveredSession>,
    pub unsaved_work: Vec<UnsavedWork>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecoveredSession {
    pub session_id: String,
    pub timestamp: DateTime<Utc>,
    pub working_directory: Option<String>,
    pub open_files: Vec<String>,
    pub unsaved_changes: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnsavedWork {
    pub file_path: String,
    pub content: String,
    pub timestamp: DateTime<Utc>,
}

/// Application state snapshot for recovery
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppStateSnapshot {
    pub session_id: String,
    pub timestamp: DateTime<Utc>,
    pub working_directory: Option<String>,
    pub open_files: Vec<String>,
    pub window_state: WindowState,
    pub active_processes: Vec<ProcessInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowState {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub maximized: bool,
    pub fullscreen: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessInfo {
    pub pid: u32,
    pub command: String,
    pub working_dir: String,
}

pub struct CrashRecoveryManager {
    state_path: PathBuf,
    snapshot_path: PathBuf,
    recovery_state: Arc<Mutex<CrashRecoveryState>>,
    auto_save_enabled: bool,
}

impl CrashRecoveryManager {
    pub fn new() -> Self {
        let base_path = Self::get_recovery_dir();
        
        // Ensure recovery directory exists
        let _ = fs::create_dir_all(&base_path);
        
        let state_path = base_path.join("crash_recovery.json");
        let snapshot_path = base_path.join("app_snapshot.json");
        
        // Load existing recovery state if available
        let recovery_state = Self::load_recovery_state(&state_path)
            .unwrap_or_else(|_| CrashRecoveryState {
                last_session_id: None,
                last_crash_time: None,
                crash_count: 0,
                recovered_sessions: Vec::new(),
                unsaved_work: Vec::new(),
            });
        
        Self {
            state_path,
            snapshot_path,
            recovery_state: Arc::new(Mutex::new(recovery_state)),
            auto_save_enabled: true,
        }
    }
    
    /// Get the recovery directory path
    fn get_recovery_dir() -> PathBuf {
        #[cfg(target_os = "macos")]
        {
            let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
            PathBuf::from(home)
                .join("Library")
                .join("Application Support")
                .join(APP_ID)
                .join("recovery")
        }

        #[cfg(target_os = "windows")]
        {
            let appdata = std::env::var("APPDATA")
                .unwrap_or_else(|_| {
                    std::env::var("USERPROFILE")
                        .map(|p| {
                            PathBuf::from(p)
                                .join("AppData")
                                .join("Roaming")
                                .to_string_lossy()
                                .to_string()
                        })
                        .unwrap_or_else(|_| ".".to_string())
                });
            PathBuf::from(appdata)
                .join(APP_ID)
                .join("recovery")
        }

        #[cfg(target_os = "linux")]
        {
            let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
            PathBuf::from(home)
                .join(".config")
                .join(APP_ID)
                .join("recovery")
        }
    }
    
    /// Load recovery state from disk
    fn load_recovery_state(path: &PathBuf) -> Result<CrashRecoveryState, String> {
        let contents = fs::read_to_string(path)
            .map_err(|e| format!("Failed to read recovery state: {}", e))?;
        
        serde_json::from_str(&contents)
            .map_err(|e| format!("Failed to parse recovery state: {}", e))
    }
    
    /// Save recovery state to disk
    pub fn save_recovery_state(&self) -> Result<(), String> {
        let state = self.recovery_state.lock().unwrap();
        let contents = serde_json::to_string_pretty(&*state)
            .map_err(|e| format!("Failed to serialize recovery state: {}", e))?;
        
        fs::write(&self.state_path, contents)
            .map_err(|e| format!("Failed to write recovery state: {}", e))?;
        
        Ok(())
    }
    
    /// Create a snapshot of the current application state
    pub fn create_snapshot<R: Runtime>(
        &self,
        app_handle: &AppHandle<R>,
        session_id: String,
        working_directory: Option<String>,
        open_files: Vec<String>,
    ) -> Result<(), String> {
        let window = app_handle.get_webview_window("main")
            .ok_or("Failed to get main window")?;
        
        // Get window state
        let position = window.outer_position()
            .map_err(|e| format!("Failed to get window position: {}", e))?;
        let size = window.outer_size()
            .map_err(|e| format!("Failed to get window size: {}", e))?;
        
        let window_state = WindowState {
            x: position.x,
            y: position.y,
            width: size.width,
            height: size.height,
            maximized: window.is_maximized().unwrap_or(false),
            fullscreen: window.is_fullscreen().unwrap_or(false),
        };
        
        // Get active processes (from app state)
        let active_processes = Vec::new(); // Would be populated from actual app state
        
        let snapshot = AppStateSnapshot {
            session_id,
            timestamp: Utc::now(),
            working_directory,
            open_files,
            window_state,
            active_processes,
        };
        
        let contents = serde_json::to_string_pretty(&snapshot)
            .map_err(|e| format!("Failed to serialize snapshot: {}", e))?;
        
        fs::write(&self.snapshot_path, contents)
            .map_err(|e| format!("Failed to write snapshot: {}", e))?;
        
        info!("Created application state snapshot");
        Ok(())
    }
    
    /// Check if there's a recoverable session
    pub fn check_for_recovery(&self) -> Option<AppStateSnapshot> {
        // Check if snapshot file exists
        if !self.snapshot_path.exists() {
            return None;
        }
        
        // Try to load the snapshot
        match fs::read_to_string(&self.snapshot_path) {
            Ok(contents) => {
                match serde_json::from_str::<AppStateSnapshot>(&contents) {
                    Ok(snapshot) => {
                        // Check if the snapshot is recent (within last 24 hours)
                        let age = Utc::now() - snapshot.timestamp;
                        if age.num_hours() < 24 {
                            info!("Found recoverable session from {}", snapshot.timestamp);
                            Some(snapshot)
                        } else {
                            info!("Snapshot too old, ignoring");
                            None
                        }
                    }
                    Err(e) => {
                        warn!("Failed to parse snapshot: {}", e);
                        None
                    }
                }
            }
            Err(e) => {
                warn!("Failed to read snapshot: {}", e);
                None
            }
        }
    }
    
    /// Recover from a crash
    pub fn recover_session<R: Runtime>(
        &self,
        app_handle: &AppHandle<R>,
        snapshot: AppStateSnapshot,
    ) -> Result<(), String> {
        info!("Recovering session {}", snapshot.session_id);
        
        // Restore window state
        let window = app_handle.get_webview_window("main")
            .ok_or("Failed to get main window")?;
        
        // Set window position and size
        window.set_position(tauri::PhysicalPosition::new(
            snapshot.window_state.x,
            snapshot.window_state.y
        )).map_err(|e| format!("Failed to restore window position: {}", e))?;
        
        window.set_size(tauri::PhysicalSize::new(
            snapshot.window_state.width,
            snapshot.window_state.height
        )).map_err(|e| format!("Failed to restore window size: {}", e))?;
        
        if snapshot.window_state.maximized {
            window.maximize()
                .map_err(|e| format!("Failed to maximize window: {}", e))?;
        }
        
        if snapshot.window_state.fullscreen {
            window.set_fullscreen(true)
                .map_err(|e| format!("Failed to set fullscreen: {}", e))?;
        }
        
        // Emit recovery event to frontend
        app_handle.emit("session-recovered", &snapshot)
            .map_err(|e| format!("Failed to emit recovery event: {}", e))?;
        
        // Update recovery state
        {
            let mut state = self.recovery_state.lock().unwrap();
            state.recovered_sessions.push(RecoveredSession {
                session_id: snapshot.session_id,
                timestamp: Utc::now(),
                working_directory: snapshot.working_directory,
                open_files: snapshot.open_files,
                unsaved_changes: false,
            });
            
            // Keep only last 10 recovered sessions
            if state.recovered_sessions.len() > 10 {
                let drain_count = state.recovered_sessions.len() - 10;
                state.recovered_sessions.drain(0..drain_count);
            }
        }
        
        self.save_recovery_state()?;
        
        // Clean up snapshot after successful recovery
        let _ = fs::remove_file(&self.snapshot_path);
        
        info!("Session recovery completed");
        Ok(())
    }
    
    /// Record a crash event
    pub fn record_crash(&self, session_id: Option<String>) {
        let mut state = self.recovery_state.lock().unwrap();
        state.last_crash_time = Some(Utc::now());
        state.last_session_id = session_id;
        state.crash_count += 1;
        
        // Log crash for analysis
        error!("Application crash recorded. Total crashes: {}", state.crash_count);
        
        let _ = self.save_recovery_state();
    }
    
    /// Save unsaved work for recovery
    pub fn save_unsaved_work(&self, file_path: String, content: String) -> Result<(), String> {
        let mut state = self.recovery_state.lock().unwrap();
        
        // Check if this file already has unsaved work
        if let Some(work) = state.unsaved_work.iter_mut()
            .find(|w| w.file_path == file_path) {
            // Update existing entry
            work.content = content;
            work.timestamp = Utc::now();
        } else {
            // Add new entry
            state.unsaved_work.push(UnsavedWork {
                file_path,
                content,
                timestamp: Utc::now(),
            });
        }
        
        // Keep only last 50 unsaved files
        if state.unsaved_work.len() > 50 {
            let drain_count = state.unsaved_work.len() - 50;
            state.unsaved_work.drain(0..drain_count);
        }
        
        drop(state); // Release lock before saving
        self.save_recovery_state()
    }
    
    /// Clean up old recovery files
    pub fn cleanup_old_files(&self) -> Result<(), String> {
        let recovery_dir = Self::get_recovery_dir();
        
        if !recovery_dir.exists() {
            return Ok(());
        }
        
        let entries = fs::read_dir(&recovery_dir)
            .map_err(|e| format!("Failed to read recovery directory: {}", e))?;
        
        for entry in entries {
            if let Ok(entry) = entry {
                let path = entry.path();
                if let Ok(metadata) = entry.metadata() {
                    if let Ok(modified) = metadata.modified() {
                        let age = std::time::SystemTime::now()
                            .duration_since(modified)
                            .unwrap_or_default();
                        
                        // Remove files older than 7 days
                        if age.as_secs() > 7 * 24 * 60 * 60 {
                            let _ = fs::remove_file(&path);
                            info!("Cleaned up old recovery file: {:?}", path);
                        }
                    }
                }
            }
        }
        
        Ok(())
    }
}

/// Initialize crash recovery system
pub fn init_crash_recovery<R: Runtime>(app: &AppHandle<R>) -> Arc<CrashRecoveryManager> {
    let manager = Arc::new(CrashRecoveryManager::new());
    
    // Check for previous crash and attempt recovery
    if let Some(snapshot) = manager.check_for_recovery() {
        info!("Previous session found, attempting recovery...");
        if let Err(e) = manager.recover_session(app, snapshot) {
            error!("Failed to recover session: {}", e);
        }
    }
    
    // Clean up old recovery files
    if let Err(e) = manager.cleanup_old_files() {
        warn!("Failed to cleanup old recovery files: {}", e);
    }
    
    // Set up panic hook to record crashes
    let crash_manager = manager.clone();
    std::panic::set_hook(Box::new(move |panic_info| {
        error!("Application panic: {:?}", panic_info);
        crash_manager.record_crash(None);
    }));
    
    // Set up periodic snapshots (every 5 minutes)
    let snapshot_manager = manager.clone();
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(5 * 60));
        loop {
            interval.tick().await;
            
            // Get current state from app (would need to be implemented)
            let session_id = format!("session_{}", chrono::Utc::now().timestamp());
            let working_directory = None; // Would get from app state
            let open_files = Vec::new(); // Would get from app state
            
            if let Err(e) = snapshot_manager.create_snapshot(
                &app_handle,
                session_id,
                working_directory,
                open_files
            ) {
                warn!("Failed to create periodic snapshot: {}", e);
            }
        }
    });
    
    info!("Crash recovery system initialized");
    manager
}
