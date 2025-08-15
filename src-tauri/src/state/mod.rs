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
use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::Arc;

use crate::claude::ClaudeManager;
use crate::commands::SessionInfo;

// Maximum number of recent projects to remember
const MAX_RECENT_PROJECTS: usize = 10;

/// Central application state container
/// Shared across all Tauri command handlers via Tauri's state management
pub struct AppState {
    claude_manager: Arc<ClaudeManager>,                       // Manages Claude CLI sessions
    server_port: u16,                                         // Port where Node.js server is running
    settings: Arc<RwLock<serde_json::Map<String, Value>>>,   // Key-value settings storage
    recent_projects: Arc<RwLock<VecDeque<String>>>,          // Recently opened project paths
}

impl AppState {
    /// Creates a new AppState instance
    /// Initializes with the provided ClaudeManager and server port
    /// Settings and recent projects start empty
    pub fn new(claude_manager: Arc<ClaudeManager>, server_port: u16) -> Self {
        Self {
            claude_manager,
            server_port,
            settings: Arc::new(RwLock::new(serde_json::Map::new())),
            recent_projects: Arc::new(RwLock::new(VecDeque::new())),
        }
    }

    /// Returns the port number where the Node.js backend server is running
    pub fn server_port(&self) -> u16 {
        self.server_port
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