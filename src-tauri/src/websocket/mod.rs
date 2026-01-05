/// WebSocket server module (alternative to Socket.IO)
/// This module provides a pure Rust WebSocket implementation for client-server communication
/// Currently not actively used - the application uses the Node.js Socket.IO server instead
/// Kept as a potential future alternative to eliminate Node.js dependency
/// 
/// Features:
/// - Native WebSocket server using tokio-tungstenite
/// - Direct integration with ClaudeManager
/// - Async message handling with tokio channels
/// - WSL path conversion for Windows compatibility

use anyhow::Result;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc;
use tokio_tungstenite::{accept_async, tungstenite::Message};
use tracing::{error, info};

use crate::claude::{ClaudeManager, ClaudeMessage};

/// WebSocket message types for client-server communication
/// Uses tagged JSON with "event" field for message routing
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "event")]
pub enum SocketMessage {
    #[serde(rename = "claude:message")]
    ClaudeMessage {
        session_id: String,
        message: String,
        working_dir: String,
        model: String,
    },
    #[serde(rename = "claude:interrupt")]
    ClaudeInterrupt { session_id: String },
    #[serde(rename = "claude:clear")]
    ClaudeClear { session_id: String },
    #[serde(rename = "claude:result")]
    ClaudeResult { data: ClaudeMessage },
    #[serde(rename = "claude:error")]
    ClaudeError { error: String },
    #[serde(rename = "connected")]
    Connected { port: u16 },
    #[serde(rename = "health")]
    Health,
    #[serde(rename = "healthResponse")]
    HealthResponse { status: String },
}

/// WebSocket server for handling real-time communication with the frontend
/// Manages WebSocket connections and routes messages to ClaudeManager
pub struct WebSocketServer {
    port: u16,                           // Port to listen on
    claude_manager: Arc<ClaudeManager>,   // Reference to Claude session manager
}

impl WebSocketServer {
    /// Creates a new WebSocket server instance
    pub fn new(port: u16, claude_manager: Arc<ClaudeManager>) -> Self {
        Self {
            port,
            claude_manager,
        }
    }

    /// Starts the WebSocket server and begins accepting connections
    /// Each connection is handled in a separate tokio task
    pub async fn start(&self) -> Result<()> {
        let addr = format!("127.0.0.1:{}", self.port);
        let listener = TcpListener::bind(&addr).await?;
        info!("WebSocket server listening on: {}", addr);

        while let Ok((stream, addr)) = listener.accept().await {
            let claude_manager = self.claude_manager.clone();
            tokio::spawn(async move {
                if let Err(e) = handle_connection(stream, addr, claude_manager).await {
                    error!("Error handling connection: {:?}", e);
                }
            });
        }

        Ok(())
    }

    /// Finds an available port in the range 3001-3005
    /// Returns 3001 as fallback if all ports are occupied
    pub fn find_available_port() -> u16 {
        for port in 3001..=3005 {
            if std::net::TcpListener::bind(format!("127.0.0.1:{}", port)).is_ok() {
                return port;
            }
        }
        3001
    }
}

/// Handles a single WebSocket connection
/// Sets up bidirectional communication channels and message routing
async fn handle_connection(
    stream: TcpStream,
    addr: SocketAddr,
    claude_manager: Arc<ClaudeManager>,
) -> Result<()> {
    info!("New WebSocket connection from: {}", addr);
    let ws_stream = accept_async(stream).await?;
    let (mut ws_sender, mut ws_receiver) = ws_stream.split();

    let (tx, mut rx) = mpsc::unbounded_channel::<SocketMessage>();

    tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if let Ok(json) = serde_json::to_string(&msg) {
                let _ = ws_sender.send(Message::Text(json.into())).await;
            }
        }
    });

    let _ = tx.send(SocketMessage::Connected {
        port: addr.port(),
    });

    while let Some(Ok(msg)) = ws_receiver.next().await {
        match msg {
            Message::Text(text) => {
                if let Ok(socket_msg) = serde_json::from_str::<SocketMessage>(&text) {
                    handle_socket_message(socket_msg, &claude_manager, &tx).await;
                }
            }
            Message::Close(_) => {
                info!("WebSocket connection closed");
                break;
            }
            _ => {}
        }
    }

    Ok(())
}

/// Routes incoming WebSocket messages to appropriate handlers
/// Manages Claude session lifecycle and message passing
#[allow(dead_code)]
async fn handle_socket_message(
    msg: SocketMessage,
    claude_manager: &Arc<ClaudeManager>,
    tx: &mpsc::UnboundedSender<SocketMessage>,
) {
    match msg {
        SocketMessage::ClaudeMessage {
            session_id,
            message,
            working_dir,
            model,
        } => {
            let working_dir = std::path::PathBuf::from(convert_wsl_path(&working_dir));
            
            let session_id = if session_id.is_empty() {
                match claude_manager.create_session(working_dir.clone(), model.clone()).await {
                    Ok(id) => id,
                    Err(e) => {
                        let _ = tx.send(SocketMessage::ClaudeError {
                            error: e.to_string(),
                        });
                        return;
                    }
                }
            } else {
                session_id
            };

            let (msg_tx, mut msg_rx) = mpsc::unbounded_channel::<ClaudeMessage>();
            
            let tx_clone = tx.clone();
            tokio::spawn(async move {
                while let Some(claude_msg) = msg_rx.recv().await {
                    let _ = tx_clone.send(SocketMessage::ClaudeResult { data: claude_msg });
                }
            });

            if let Err(e) = claude_manager
                .send_message(&session_id, message, msg_tx)
                .await
            {
                let _ = tx.send(SocketMessage::ClaudeError {
                    error: e.to_string(),
                });
            }
        }
        SocketMessage::ClaudeInterrupt { session_id } => {
            if let Err(e) = claude_manager.interrupt_session(&session_id).await {
                let _ = tx.send(SocketMessage::ClaudeError {
                    error: e.to_string(),
                });
            }
        }
        SocketMessage::ClaudeClear { session_id } => {
            if let Err(e) = claude_manager.clear_session(&session_id).await {
                let _ = tx.send(SocketMessage::ClaudeError {
                    error: e.to_string(),
                });
            }
        }
        SocketMessage::Health => {
            let _ = tx.send(SocketMessage::HealthResponse {
                status: "ok".to_string(),
            });
        }
        _ => {}
    }
}

/// Converts WSL paths to Windows paths
/// Example: /mnt/c/Users -> C:\Users
/// Required for Windows compatibility when paths come from WSL
#[allow(dead_code)]
fn convert_wsl_path(path: &str) -> String {
    if path.starts_with("/mnt/") && path.len() > 6 {
        let parts: Vec<&str> = path[5..].split('/').collect();
        if !parts.is_empty() && parts[0].len() == 1 {
            let drive = parts[0].to_uppercase();
            let rest = parts[1..].join("\\");
            return format!("{}:\\{}", drive, rest);
        }
    }
    path.to_string()
}