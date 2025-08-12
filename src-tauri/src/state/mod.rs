use anyhow::Result;

#[allow(unused_imports)]
use parking_lot::RwLock;
use serde_json::Value;
use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::Arc;

use crate::claude::ClaudeManager;
use crate::commands::SessionInfo;

const MAX_RECENT_PROJECTS: usize = 10;

pub struct AppState {
    claude_manager: Arc<ClaudeManager>,
    server_port: u16,
    settings: Arc<RwLock<serde_json::Map<String, Value>>>,
    recent_projects: Arc<RwLock<VecDeque<String>>>,
}

impl AppState {
    pub fn new(claude_manager: Arc<ClaudeManager>, server_port: u16) -> Self {
        Self {
            claude_manager,
            server_port,
            settings: Arc::new(RwLock::new(serde_json::Map::new())),
            recent_projects: Arc::new(RwLock::new(VecDeque::new())),
        }
    }

    pub fn server_port(&self) -> u16 {
        self.server_port
    }

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

    pub async fn interrupt_session(&self, session_id: String) -> Result<()> {
        self.claude_manager.interrupt_session(&session_id).await
    }

    pub async fn clear_session(&self, session_id: String) -> Result<()> {
        self.claude_manager.clear_session(&session_id).await
    }

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

    pub fn save_setting(&self, key: String, value: Value) -> Result<()> {
        let mut settings = self.settings.write();
        settings.insert(key, value);
        self.persist_settings()?;
        Ok(())
    }

    pub fn load_setting(&self, key: String) -> Option<Value> {
        let settings = self.settings.read();
        settings.get(&key).cloned()
    }

    pub fn get_recent_projects(&self) -> Vec<String> {
        let projects = self.recent_projects.read();
        projects.iter().cloned().collect()
    }

    pub fn add_recent_project(&self, path: String) {
        let mut projects = self.recent_projects.write();
        
        // Remove if already exists
        projects.retain(|p| p != &path);
        
        // Add to front
        projects.push_front(path);
        
        // Keep only max items
        while projects.len() > MAX_RECENT_PROJECTS {
            projects.pop_back();
        }
        
        let _ = self.persist_recent_projects();
    }

    fn persist_settings(&self) -> Result<()> {
        // In production, save to disk using tauri::api::path
        // For now, just keep in memory
        Ok(())
    }

    fn persist_recent_projects(&self) -> Result<()> {
        // In production, save to disk using tauri::api::path
        // For now, just keep in memory
        Ok(())
    }

    pub fn load_persisted_data(&self) -> Result<()> {
        // Load settings and recent projects from disk
        // This would be called on app startup
        Ok(())
    }
}