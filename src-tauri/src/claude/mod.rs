/// Claude CLI process management module (async/Tokio-based)
/// This module provides an alternative async implementation for managing Claude sessions
/// Currently not actively used - the application uses the Node.js server approach instead
/// Kept for potential future migration to pure Rust implementation
/// 
/// Key features:
/// - Async session management with Tokio
/// - Direct Claude CLI process spawning
/// - Stream-json parsing
/// - Multi-session support with DashMap for thread-safe access

use anyhow::{anyhow, Result};
use dashmap::DashMap;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::mpsc;
use uuid::Uuid;

/// Represents a Claude conversation session
/// Tracks state, metrics, and configuration for a single Claude CLI instance
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeSession {
    pub id: String,
    pub working_dir: PathBuf,
    pub model: String,
    pub streaming: bool,
    pub interrupted: bool,
    pub message_count: usize,
    pub token_count: usize,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

/// Represents different types of messages from Claude's stream-json output
/// Matches the format produced by `claude --output-format stream-json`
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ClaudeMessage {
    #[serde(rename = "text")]
    Text { content: String },
    #[serde(rename = "tool_use")]
    ToolUse {
        id: String,
        name: String,
        input: serde_json::Value,
    },
    #[serde(rename = "tool_result")]
    ToolResult {
        tool_use_id: String,
        content: String,
        is_error: bool,
    },
    #[serde(rename = "usage")]
    Usage {
        input_tokens: usize,
        output_tokens: usize,
        cache_creation_input_tokens: Option<usize>,
        cache_read_input_tokens: Option<usize>,
    },
    #[serde(rename = "error")]
    Error { message: String },
    #[serde(rename = "interrupt")]
    Interrupt,
    #[serde(rename = "message_stop")]
    MessageStop,
    #[serde(rename = "assistant_message")]
    AssistantMessage {
        id: String,
        role: String,
        content: Vec<serde_json::Value>,
        model: String,
    },
}

/// Manages multiple Claude CLI sessions concurrently
/// Uses DashMap for thread-safe concurrent access to sessions
/// Each session has its own process and message channel
pub struct ClaudeManager {
    sessions: Arc<DashMap<String, Arc<RwLock<ClaudeSession>>>>,         // Active sessions
    processes: Arc<DashMap<String, Child>>,                             // Running Claude processes
    message_senders: Arc<DashMap<String, mpsc::UnboundedSender<ClaudeMessage>>>, // Message channels
}

impl ClaudeManager {
    /// Creates a new ClaudeManager instance
    /// Initializes empty collections for sessions, processes, and message channels
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(DashMap::new()),
            processes: Arc::new(DashMap::new()),
            message_senders: Arc::new(DashMap::new()),
        }
    }

    /// Creates a new Claude session with specified working directory and model
    /// Returns a unique session ID for future operations
    pub async fn create_session(&self, working_dir: PathBuf, model: String) -> Result<String> {
        let session_id = Uuid::new_v4().to_string();
        let session = Arc::new(RwLock::new(ClaudeSession {
            id: session_id.clone(),
            working_dir: working_dir.clone(),
            model: model.clone(),
            streaming: false,
            interrupted: false,
            message_count: 0,
            token_count: 0,
            created_at: chrono::Utc::now(),
        }));

        self.sessions.insert(session_id.clone(), session.clone());
        Ok(session_id)
    }

    /// Sends a message to a Claude session and starts streaming the response
    /// Spawns a new Claude process or resumes an existing session
    /// Responses are sent through the provided channel
    pub async fn send_message(
        &self,
        session_id: &str,
        message: String,
        tx: mpsc::UnboundedSender<ClaudeMessage>,
    ) -> Result<()> {
        let session = self
            .sessions
            .get(session_id)
            .ok_or_else(|| anyhow!("Session not found"))?
            .clone();

        let (working_dir, model, message_count) = {
            let mut session_write = session.write();
            session_write.streaming = true;
            session_write.message_count += 1;
            let working_dir = session_write.working_dir.clone();
            let model = session_write.model.clone();
            let message_count = session_write.message_count;
            (working_dir, model, message_count)
        };

        self.message_senders
            .insert(session_id.to_string(), tx.clone());

        // Find Claude CLI binary in PATH
        let claude_path = which::which("claude").unwrap_or_else(|_| PathBuf::from("claude"));

        // Configure Claude process with stream-json output for real-time parsing
        let mut cmd = Command::new(&claude_path);

        // On Windows, hide the console window to prevent flashing
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        cmd.arg("--output-format")
            .arg("stream-json")
            .arg("--model")
            .arg(&model)
            .current_dir(&working_dir)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);  // Ensure process cleanup on drop

        // Resume existing conversation if this isn't the first message
        if message_count > 1 {
            cmd.arg("--resume");
        }

        let mut child = cmd.spawn()?;

        if let Some(mut stdin) = child.stdin.take() {
            stdin.write_all(message.as_bytes()).await?;
            stdin.write_all(b"\n").await?;
            stdin.flush().await?;
        }

        let stdout = child.stdout.take().ok_or_else(|| anyhow!("No stdout"))?;
        let stderr = child.stderr.take().ok_or_else(|| anyhow!("No stderr"))?;

        let session_clone = session.clone();
        let tx_clone = tx.clone();

        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();

            while let Ok(Some(line)) = lines.next_line().await {
                if line.is_empty() {
                    continue;
                }

                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&line) {
                    if let Some(msg) = parse_claude_json(&json) {
                        if matches!(msg, ClaudeMessage::Usage { .. }) {
                            if let ClaudeMessage::Usage {
                                input_tokens,
                                output_tokens,
                                ..
                            } = &msg
                            {
                                let mut session_write = session_clone.write();
                                session_write.token_count = input_tokens + output_tokens;
                            }
                        }

                        let is_stop = matches!(msg, ClaudeMessage::MessageStop);
                        let _ = tx_clone.send(msg);

                        if is_stop {
                            let mut session_write = session_clone.write();
                            session_write.streaming = false;
                            break;
                        }
                    }
                }
            }
        });

        tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if !line.is_empty() {
                    let _ = tx.send(ClaudeMessage::Error {
                        message: line.clone(),
                    });
                }
            }
        });

        self.processes.insert(session_id.to_string(), child);
        Ok(())
    }

    /// Interrupts an active Claude session (equivalent to Ctrl+C)
    /// Kills the process and marks the session as interrupted
    pub async fn interrupt_session(&self, session_id: &str) -> Result<()> {
        if let Some((_, mut child)) = self.processes.remove(session_id) {
            child.kill().await?;
        }

        if let Some(session) = self.sessions.get(session_id) {
            let mut session_write = session.write();
            session_write.interrupted = true;
            session_write.streaming = false;
        }

        if let Some((_, tx)) = self.message_senders.remove(session_id) {
            let _ = tx.send(ClaudeMessage::Interrupt);
        }

        Ok(())
    }

    /// Clears a session completely, removing it from memory
    /// First interrupts the session if active, then removes all references
    pub async fn clear_session(&self, session_id: &str) -> Result<()> {
        self.interrupt_session(session_id).await?;
        self.sessions.remove(session_id);
        Ok(())
    }

    /// Retrieves a copy of session data by ID
    /// Returns None if session doesn't exist
    pub fn get_session(&self, session_id: &str) -> Option<ClaudeSession> {
        self.sessions
            .get(session_id)
            .map(|s| s.read().clone())
    }

    /// Returns a list of all active sessions
    /// Creates copies to avoid holding locks
    pub fn list_sessions(&self) -> Vec<ClaudeSession> {
        self.sessions
            .iter()
            .map(|entry| entry.read().clone())
            .collect()
    }
}

/// Parses a JSON line from Claude's stream-json output into a typed message
/// Returns None if the JSON doesn't match a known message type
/// Handles all message types from Claude's streaming format
fn parse_claude_json(json: &serde_json::Value) -> Option<ClaudeMessage> {
    let msg_type = json.get("type")?.as_str()?;

    match msg_type {
        "text" => {
            let content = json.get("text")?.as_str()?.to_string();
            Some(ClaudeMessage::Text { content })
        }
        "tool_use" => Some(ClaudeMessage::ToolUse {
            id: json.get("id")?.as_str()?.to_string(),
            name: json.get("name")?.as_str()?.to_string(),
            input: json.get("input")?.clone(),
        }),
        "tool_result" => Some(ClaudeMessage::ToolResult {
            tool_use_id: json.get("tool_use_id")?.as_str()?.to_string(),
            content: json.get("content")?.as_str()?.to_string(),
            is_error: json.get("is_error").and_then(|v| v.as_bool()).unwrap_or(false),
        }),
        "usage" => Some(ClaudeMessage::Usage {
            input_tokens: json.get("input_tokens")?.as_u64()? as usize,
            output_tokens: json.get("output_tokens")?.as_u64()? as usize,
            cache_creation_input_tokens: json
                .get("cache_creation_input_tokens")
                .and_then(|v| v.as_u64())
                .map(|v| v as usize),
            cache_read_input_tokens: json
                .get("cache_read_input_tokens")
                .and_then(|v| v.as_u64())
                .map(|v| v as usize),
        }),
        "error" => {
            let message = json.get("message")?.as_str()?.to_string();
            Some(ClaudeMessage::Error { message })
        }
        "message_stop" => Some(ClaudeMessage::MessageStop),
        "assistant_message" => Some(ClaudeMessage::AssistantMessage {
            id: json.get("id")?.as_str()?.to_string(),
            role: json.get("role")?.as_str()?.to_string(),
            content: json.get("content")?.as_array()?.clone(),
            model: json.get("model")?.as_str()?.to_string(),
        }),
        _ => None,
    }
}