/// Application state management module
/// Centralizes all application state including:
/// - Claude session management
/// - Application settings
/// - Recent projects list
/// - Server configuration
/// 
/// Uses Arc<RwLock<>> for thread-safe concurrent access
/// Currently stores data in memory only - disk persistence is planned

use anyhow::Result;

#[allow(unused_imports)]
use parking_lot::RwLock;
use serde_json::Value;
use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::Arc;

use crate::claude::ClaudeManager;
use crate::claude_session::SessionManager;
use crate::commands::SessionInfo;
use crate::process::ProcessRegistry;
use crate::db::Database;
use crate::compaction::CompactionManager;
use tokio::sync::Mutex;

// Maximum number of recent projects to remember
const MAX_RECENT_PROJECTS: usize = 10;

/// Central application state container
/// Shared across all Tauri command handlers via Tauri's state management
pub struct AppState {
    claude_manager: Arc<ClaudeManager>,                       // Manages Claude CLI sessions (legacy)
    process_registry: Arc<ProcessRegistry>,                   // New: Process tracking and management
    session_manager: Arc<SessionManager>,                     // New: Session state management
    server_port: u16,                                         // Port where Node.js server is running
    settings: Arc<RwLock<serde_json::Map<String, Value>>>,   // Key-value settings storage
    recent_projects: Arc<RwLock<VecDeque<String>>>,          // Recently opened project paths
    database: Option<Arc<Database>>,                          // SQLite database for persistence
    pub compaction_manager: Arc<Mutex<CompactionManager>>,    // Manages context compaction and auto-trigger
    // Thread-safe tracker for /compact operations
    // Maps new_session_id -> original_session_id to route results to correct listeners
    compact_session_map: Arc<RwLock<HashMap<String, String>>>,
}

impl AppState {
    /// Creates a new AppState instance
    /// Initializes with the provided ClaudeManager and server port
    /// Settings and recent projects start empty
    pub fn new(claude_manager: Arc<ClaudeManager>, server_port: u16) -> Self {
        // Create new process registry and session manager for direct CLI spawning
        let process_registry = Arc::new(ProcessRegistry::new());
        let session_manager = Arc::new(SessionManager::new());
        
        // Initialize database (optional - fallback to in-memory if fails)
        let database = match Database::new() {
            Ok(db) => {
                tracing::info!("SQLite database initialized successfully");
                Some(Arc::new(db))
            }
            Err(e) => {
                tracing::warn!("Failed to initialize database, using in-memory storage: {}", e);
                None
            }
        };
        
        Self {
            claude_manager,
            process_registry,
            session_manager,
            server_port,
            settings: Arc::new(RwLock::new(serde_json::Map::new())),
            recent_projects: Arc::new(RwLock::new(VecDeque::new())),
            database,
            compaction_manager: Arc::new(Mutex::new(CompactionManager::new())),
            compact_session_map: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Registers a compact session mapping (new_session -> original_session)
    /// Thread-safe: can be called from multiple /compact commands simultaneously
    pub fn register_compact_session(&self, new_session_id: &str, original_session_id: &str) {
        let mut map = self.compact_session_map.write();
        map.insert(new_session_id.to_string(), original_session_id.to_string());
        tracing::info!("Registered compact mapping: {} -> {}", new_session_id, original_session_id);
    }

    /// Gets and removes the original session ID for a compact operation
    /// Returns None if no mapping exists (not a compact result)
    pub fn take_compact_original_session(&self, new_session_id: &str) -> Option<String> {
        let mut map = self.compact_session_map.write();
        let result = map.remove(new_session_id);
        if result.is_some() {
            tracing::info!("Retrieved and removed compact mapping for: {}", new_session_id);
        }
        result
    }

    /// Gets the original session ID without removing (for peeking)
    pub fn get_compact_original_session(&self, new_session_id: &str) -> Option<String> {
        let map = self.compact_session_map.read();
        map.get(new_session_id).cloned()
    }

    /// Removes a compact session mapping without returning it (for error cleanup)
    pub fn remove_compact_session(&self, new_session_id: &str) {
        let mut map = self.compact_session_map.write();
        if map.remove(new_session_id).is_some() {
            tracing::info!("Cleaned up compact mapping for: {}", new_session_id);
        }
    }

    /// Clean up compact mappings older than the given duration
    /// Call this periodically to prevent memory leaks from failed compactions
    pub fn cleanup_stale_compact_sessions(&self, _max_age: std::time::Duration) {
        // For now just clear all - in future could track timestamps
        let mut map = self.compact_session_map.write();
        let count = map.len();
        if count > 100 { // Only clear if too many accumulated
            map.clear();
            tracing::warn!("Cleared {} stale compact session mappings", count);
        }
    }

    /// Returns the port number where the Node.js backend server is running
    pub fn server_port(&self) -> u16 {
        self.server_port
    }
    
    /// Returns a reference to the ProcessRegistry for direct CLI process management
    pub fn process_registry(&self) -> Arc<ProcessRegistry> {
        self.process_registry.clone()
    }
    
    /// Returns a reference to the SessionManager for session state tracking
    pub fn session_manager(&self) -> Arc<SessionManager> {
        self.session_manager.clone()
    }
    
    /// Returns a reference to the Database if initialized
    pub fn database(&self) -> Option<Arc<Database>> {
        self.database.clone()
    }

    /// Sends a message to a Claude session
    /// Creates a new session if session_id is empty
    /// Note: Currently delegates to ClaudeManager but actual implementation
    /// uses the Node.js server via WebSocket
    pub async fn send_message(
        &self,
        session_id: String,
        message: String,
        working_dir: String,
        model: String,
    ) -> Result<()> {
        let working_dir = PathBuf::from(working_dir);
        
        let session_id = if session_id.is_empty() {
            self.claude_manager.create_session(working_dir, model).await?
        } else {
            session_id
        };

        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
        
        tokio::spawn(async move {
            while let Some(_msg) = rx.recv().await {
                // Messages are handled by WebSocket
            }
        });

        self.claude_manager
            .send_message(&session_id, message, tx)
            .await
    }

    /// Interrupts an active Claude session (Ctrl+C equivalent)
    /// Delegates to ClaudeManager for process management
    pub async fn interrupt_session(&self, session_id: String) -> Result<()> {
        self.claude_manager.interrupt_session(&session_id).await
    }

    /// Clears a Claude session, removing it from memory
    /// Used when user clears context or closes a tab
    pub async fn clear_session(&self, session_id: String) -> Result<()> {
        self.claude_manager.clear_session(&session_id).await
    }

    /// Returns information about all active sessions
    /// Converts internal session format to SessionInfo for the frontend
    pub fn get_sessions(&self) -> Vec<SessionInfo> {
        self.claude_manager
            .list_sessions()
            .into_iter()
            .map(|s| SessionInfo {
                id: s.id,
                working_dir: s.working_dir.to_string_lossy().to_string(),
                model: s.model,
                message_count: s.message_count,
                token_count: s.token_count,
            })
            .collect()
    }

    /// Saves a setting value by key
    /// Settings are stored as JSON values for flexibility
    /// TODO: Implement disk persistence
    pub fn save_setting(&self, key: String, value: Value) -> Result<()> {
        let mut settings = self.settings.write();
        settings.insert(key, value);
        self.persist_settings()?;
        Ok(())
    }

    /// Loads a setting value by key
    /// Returns None if the setting doesn't exist
    pub fn load_setting(&self, key: String) -> Option<Value> {
        let settings = self.settings.read();
        settings.get(&key).cloned()
    }

    /// Returns the list of recently opened projects
    /// Used to populate the recent projects modal (Ctrl+R)
    pub fn get_recent_projects(&self) -> Vec<String> {
        let projects = self.recent_projects.read();
        projects.iter().cloned().collect()
    }

    /// Adds a project path to the recent projects list
    /// Moves existing entries to the front (MRU order)
    /// Maintains a maximum of MAX_RECENT_PROJECTS entries
    pub fn add_recent_project(&self, path: String) {
        let mut projects = self.recent_projects.write();
        
        // Remove if already exists (will re-add at front)
        projects.retain(|p| p != &path);
        
        // Add to front (most recent)
        projects.push_front(path);
        
        // Keep only max items
        while projects.len() > MAX_RECENT_PROJECTS {
            projects.pop_back();
        }
        
        let _ = self.persist_recent_projects();
    }

    /// Persists settings to disk
    /// TODO: Implement using tauri-plugin-store for proper persistence
    /// Currently only stores in memory
    fn persist_settings(&self) -> Result<()> {
        // In production, save to disk using tauri::api::path
        // For now, just keep in memory
        Ok(())
    }

    /// Persists recent projects list to disk
    /// TODO: Implement using tauri-plugin-store for proper persistence
    /// Currently only stores in memory
    fn persist_recent_projects(&self) -> Result<()> {
        // In production, save to disk using tauri::api::path
        // For now, just keep in memory
        Ok(())
    }

    /// Loads persisted settings and recent projects from disk
    /// Called during application startup to restore previous state
    /// TODO: Implement actual disk loading
    pub fn load_persisted_data(&self) -> Result<()> {
        // Load settings and recent projects from disk
        // This would be called on app startup
        Ok(())
    }
}