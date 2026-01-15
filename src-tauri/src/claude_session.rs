use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Child;
use tokio::time::timeout;
use tracing::{debug, error, info, warn};
use uuid::Uuid;

/// Claude session information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInfo {
    /// Session ID from Claude (26 characters)
    pub session_id: String,
    /// Project path where session is running
    pub project_path: String,
    /// Model being used
    pub model: String,
    /// Whether session is currently streaming
    pub streaming: bool,
    /// Run ID in ProcessRegistry
    pub run_id: Option<i64>,
}

/// Result of session ID extraction
#[derive(Debug)]
pub enum SessionIdResult {
    /// Successfully extracted Claude session ID
    Extracted(String),
    /// Failed to extract, generated synthetic ID
    Synthetic(String),
    /// Extraction timed out
    Timeout,
}

/// Validates a Claude session ID format
/// Claude session IDs are 26 characters, alphanumeric with underscores
pub fn validate_session_id(session_id: &str) -> bool {
    session_id.len() == 26
        && session_id
            .chars()
            .all(|c| c.is_alphanumeric() || c == '_' || c == '-')
}

/// Generates a synthetic session ID as fallback
/// Format: "synthetic_" + UUID (truncated to 26 chars total)
pub fn generate_synthetic_session_id() -> String {
    let uuid = Uuid::new_v4().to_string().replace("-", "");
    format!("syn_{}", &uuid[..22]) // "syn_" + 22 chars = 26 total
}

/// Extracts session ID from Claude's initial output
/// Uses a 3-second timeout to handle slow Claude startup
/// Logs warnings at 1s and 2s if still waiting
pub async fn extract_session_id_from_child(child: &mut Child) -> Result<SessionIdResult> {
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| anyhow!("No stdout available from child process"))?;

    let reader = BufReader::new(stdout);
    let mut lines = reader.lines();

    // Timeout increased from 500ms to 3000ms to handle slow Claude startup
    // This prevents synthetic ID fallback which breaks --resume functionality
    const EXTRACTION_TIMEOUT_MS: u64 = 3000;
    const WARNING_INTERVAL_MS: u64 = 1000;

    let start = std::time::Instant::now();

    let extraction_future = async {
        let mut last_warning = std::time::Instant::now();

        while let Ok(Some(line)) = lines.next_line().await {
            debug!("Claude output line: {}", line);

            // Log progress warnings if taking too long
            let elapsed = start.elapsed().as_millis() as u64;
            if last_warning.elapsed().as_millis() as u64 >= WARNING_INTERVAL_MS {
                warn!("Still waiting for session ID after {}ms...", elapsed);
                last_warning = std::time::Instant::now();
            }

            // Try to parse as JSON
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&line) {
                // Look for init message: {"type":"system","subtype":"init","session_id":"..."}
                if json["type"] == "system" && json["subtype"] == "init" {
                    if let Some(session_id) = json["session_id"].as_str() {
                        let elapsed = start.elapsed().as_millis();
                        info!(
                            "Extracted Claude session ID: {} (took {}ms)",
                            session_id, elapsed
                        );

                        // Validate the session ID
                        if validate_session_id(session_id) {
                            return Ok(SessionIdResult::Extracted(session_id.to_string()));
                        } else {
                            warn!("Invalid session ID format: {}", session_id);
                        }
                    }
                }
            }
        }

        warn!("No session ID found in Claude output after reading all lines");
        Ok(SessionIdResult::Synthetic(generate_synthetic_session_id()))
    };

    // Apply 3-second timeout (increased from 500ms)
    match timeout(
        Duration::from_millis(EXTRACTION_TIMEOUT_MS),
        extraction_future,
    )
    .await
    {
        Ok(result) => result,
        Err(_) => {
            error!(
                "Session ID extraction timed out after {}ms - Claude may be very slow to start",
                EXTRACTION_TIMEOUT_MS
            );
            warn!("Falling back to synthetic session ID - --resume may not work correctly");
            Ok(SessionIdResult::Timeout)
        }
    }
}

/// Gets the path to the ~/.claude directory
pub fn get_claude_home_dir() -> Result<PathBuf> {
    let home = dirs::home_dir().ok_or_else(|| anyhow!("Could not determine home directory"))?;
    Ok(home.join(".claude"))
}

/// Gets the path to a specific session file
pub fn get_session_file_path(session_id: &str) -> Result<PathBuf> {
    let claude_dir = get_claude_home_dir()?;
    let projects_dir = claude_dir.join("projects");

    // Note: In the actual Claude implementation, session files are stored
    // under encoded project paths. For now, we'll use a simplified structure
    Ok(projects_dir.join(format!("{}.jsonl", session_id)))
}

/// Checks if a session file exists and is valid
pub async fn validate_session_file(session_id: &str) -> Result<bool> {
    let session_path = get_session_file_path(session_id)?;

    if !session_path.exists() {
        debug!("Session file does not exist: {:?}", session_path);
        return Ok(false);
    }

    // Check if file is readable and not empty
    match tokio::fs::metadata(&session_path).await {
        Ok(metadata) => {
            if metadata.len() == 0 {
                warn!("Session file is empty: {:?}", session_path);
                Ok(false)
            } else {
                debug!(
                    "Valid session file found: {:?} ({} bytes)",
                    session_path,
                    metadata.len()
                );
                Ok(true)
            }
        }
        Err(e) => {
            error!("Failed to read session file metadata: {}", e);
            Ok(false)
        }
    }
}

/// Checks if a session is locked by another process
pub async fn is_session_locked(session_id: &str) -> Result<bool> {
    let claude_dir = get_claude_home_dir()?;
    let lock_file = claude_dir
        .join("locks")
        .join(format!("{}.lock", session_id));

    Ok(lock_file.exists())
}

/// Session manager for tracking active sessions
#[derive(Debug, Clone)]
pub struct SessionManager {
    sessions: std::sync::Arc<tokio::sync::RwLock<std::collections::HashMap<String, SessionInfo>>>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self {
            sessions: std::sync::Arc::new(tokio::sync::RwLock::new(
                std::collections::HashMap::new(),
            )),
        }
    }

    /// Registers a new session
    pub async fn register_session(&self, session_info: SessionInfo) -> Result<()> {
        let mut sessions = self.sessions.write().await;
        let session_id = session_info.session_id.clone();
        sessions.insert(session_id.clone(), session_info);
        info!("Registered session: {}", session_id);
        Ok(())
    }

    /// Gets session info by ID
    pub async fn get_session(&self, session_id: &str) -> Option<SessionInfo> {
        let sessions = self.sessions.read().await;
        sessions.get(session_id).cloned()
    }

    /// Updates session streaming state
    pub async fn set_streaming(&self, session_id: &str, streaming: bool) -> Result<()> {
        let mut sessions = self.sessions.write().await;
        if let Some(session) = sessions.get_mut(session_id) {
            session.streaming = streaming;
            debug!("Set session {} streaming to {}", session_id, streaming);
            Ok(())
        } else {
            Err(anyhow!("Session not found: {}", session_id))
        }
    }

    /// Updates session run ID
    pub async fn set_run_id(&self, session_id: &str, run_id: i64) -> Result<()> {
        let mut sessions = self.sessions.write().await;
        if let Some(session) = sessions.get_mut(session_id) {
            session.run_id = Some(run_id);
            debug!("Set session {} run_id to {}", session_id, run_id);
            Ok(())
        } else {
            Err(anyhow!("Session not found: {}", session_id))
        }
    }

    /// Removes a session
    pub async fn remove_session(&self, session_id: &str) -> Option<SessionInfo> {
        let mut sessions = self.sessions.write().await;
        let removed = sessions.remove(session_id);
        if removed.is_some() {
            info!("Removed session: {}", session_id);
        }
        removed
    }

    /// Lists all active sessions
    pub async fn list_sessions(&self) -> Vec<SessionInfo> {
        let sessions = self.sessions.read().await;
        sessions.values().cloned().collect()
    }

    /// Gets the count of active sessions
    pub async fn session_count(&self) -> usize {
        let sessions = self.sessions.read().await;
        sessions.len()
    }

    /// Updates the session ID for a session (when real ID is extracted from Claude)
    pub async fn update_session_id(&self, old_id: &str, new_id: &str) -> Result<()> {
        let mut sessions = self.sessions.write().await;
        if let Some(mut session) = sessions.remove(old_id) {
            session.session_id = new_id.to_string();
            sessions.insert(new_id.to_string(), session);
            info!("Updated session ID from {} to {}", old_id, new_id);
        }
        Ok(())
    }
}

impl Default for SessionManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_session_id() {
        // Valid session IDs
        assert!(validate_session_id("01234567890123456789012345"));
        assert!(validate_session_id("abcdef_123456_ABCDEF_12345"));
        assert!(validate_session_id("test-session-id-26-chars-x"));

        // Invalid session IDs
        assert!(!validate_session_id("too_short"));
        assert!(!validate_session_id(
            "this_is_way_too_long_for_a_session_id"
        ));
        assert!(!validate_session_id("invalid@characters#here!!"));
    }

    #[test]
    fn test_generate_synthetic_session_id() {
        let id = generate_synthetic_session_id();
        assert_eq!(id.len(), 26);
        assert!(id.starts_with("syn_"));
        assert!(validate_session_id(&id));
    }

    #[tokio::test]
    async fn test_session_manager() {
        let manager = SessionManager::new();

        let session = SessionInfo {
            session_id: "test_session_123456789012".to_string(),
            project_path: "/test/path".to_string(),
            model: "claude-3-opus".to_string(),
            streaming: false,
            run_id: None,
        };

        // Register session
        manager.register_session(session.clone()).await.unwrap();
        assert_eq!(manager.session_count().await, 1);

        // Get session
        let retrieved = manager.get_session(&session.session_id).await.unwrap();
        assert_eq!(retrieved.session_id, session.session_id);

        // Update streaming
        manager
            .set_streaming(&session.session_id, true)
            .await
            .unwrap();
        let updated = manager.get_session(&session.session_id).await.unwrap();
        assert!(updated.streaming);

        // Update run ID
        manager
            .set_run_id(&session.session_id, 12345)
            .await
            .unwrap();
        let updated = manager.get_session(&session.session_id).await.unwrap();
        assert_eq!(updated.run_id, Some(12345));

        // Remove session
        let removed = manager.remove_session(&session.session_id).await.unwrap();
        assert_eq!(removed.session_id, session.session_id);
        assert_eq!(manager.session_count().await, 0);
    }
}
