/// Claude-specific Tauri command handlers
/// These commands provide the bridge between the frontend and the direct CLI spawning backend
/// They replace the Socket.IO communication used in the embedded server architecture

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tracing::{debug, error, info};

use crate::claude_spawner::{ClaudeSpawner, SpawnOptions};
use crate::state::AppState;

/// Request structure for spawning a new Claude session
#[derive(Debug, Deserialize)]
pub struct SpawnSessionRequest {
    pub project_path: String,
    pub model: String,
    pub prompt: String,
}

/// Response structure for spawning a new Claude session
#[derive(Debug, Serialize)]
pub struct SpawnSessionResponse {
    pub session_id: String,
    pub run_id: i64,
    pub pid: u32,
    pub resumed: bool,
}

/// Request structure for sending a message to Claude
#[derive(Debug, Deserialize)]
pub struct SendMessageRequest {
    pub session_id: String,
    pub message: String,
}

/// Request structure for resuming a Claude session
#[derive(Debug, Deserialize)]
pub struct ResumeSessionRequest {
    pub session_id: String,
    pub project_path: String,
    pub model: String,
    pub prompt: Option<String>,
}

/// Response structure for session information
#[derive(Debug, Serialize)]
pub struct SessionInfoResponse {
    pub session_id: String,
    pub project_path: String,
    pub model: String,
    pub streaming: bool,
    pub run_id: Option<i64>,
}

/// Response structure for token statistics
#[derive(Debug, Serialize)]
pub struct TokenStatsResponse {
    pub input_tokens: usize,
    pub output_tokens: usize,
    pub cache_creation_tokens: usize,
    pub cache_read_tokens: usize,
    pub total_tokens: usize,
}

/// Response structure for listing active sessions
#[derive(Debug, Serialize)]
pub struct ActiveSessionsResponse {
    pub sessions: Vec<SessionInfoResponse>,
}

/// Spawns a new Claude session with the given options
#[tauri::command]
pub async fn spawn_claude_session(
    app: AppHandle,
    state: State<'_, AppState>,
    request: SpawnSessionRequest,
) -> Result<SpawnSessionResponse, String> {
    info!("spawn_claude_session command called with project_path: {}, model: {}", 
        request.project_path, request.model);
    
    // Get the ClaudeSpawner from AppState
    let registry = state.process_registry();
    let session_manager = state.session_manager();
    let spawner = Arc::new(ClaudeSpawner::new(registry, session_manager));
    
    // Create spawn options
    let options = SpawnOptions {
        project_path: request.project_path,
        model: request.model,
        prompt: request.prompt,
        resume_session_id: None,
        continue_conversation: false,
    };
    
    // Spawn the Claude process
    match spawner.spawn_claude(app, options).await {
        Ok(result) => {
            info!("Successfully spawned Claude session: {}", result.session_id);
            // Return the synthetic/temporary session ID that will be used for all operations
            // The real Claude session ID will be extracted later from the stream
            Ok(SpawnSessionResponse {
                session_id: result.session_id,
                run_id: result.run_id,
                pid: result.pid,
                resumed: result.resumed,
            })
        }
        Err(e) => {
            error!("Failed to spawn Claude session: {}", e);
            Err(format!("Failed to spawn Claude session: {}", e))
        }
    }
}

/// Sends a message to a Claude session by spawning a new process with --resume
/// Each message spawns a new process that resumes the previous session
#[tauri::command]
pub async fn send_claude_message(
    app: AppHandle,
    state: State<'_, AppState>,
    request: SendMessageRequest,
) -> Result<(), String> {
    info!("send_claude_message command called for session: {}", request.session_id);
    
    // Get the session info - handle both real and temp session IDs
    let session_manager = state.session_manager();
    
    // Get the most recent session to find the real Claude session ID
    let sessions = session_manager.list_sessions().await;
    let session = sessions.into_iter()
        .next()
        .ok_or_else(|| format!("No active sessions found"))?;
    
    // Get the actual Claude session ID to resume
    let claude_session_id = session.session_id.clone();
    
    info!("Found Claude session ID to resume: {}", claude_session_id);
    
    // Get the ClaudeSpawner from AppState
    let registry = state.process_registry();
    let spawner = Arc::new(ClaudeSpawner::new(registry, session_manager.clone()));
    
    // Store the original requesting session ID for /compact handling
    let original_session_id = request.session_id.clone();
    let is_compact = request.message.trim().starts_with("/compact");
    
    // Create spawn options - claudia uses --resume with session ID!
    // NOT -c flag! That creates a new session!
    let options = SpawnOptions {
        project_path: session.project_path.clone(),
        model: session.model.clone(),
        prompt: request.message.clone(),  // Pass the message as prompt (including slash commands)
        resume_session_id: Some(claude_session_id.clone()),  // Use --resume with session ID
        continue_conversation: false,  // Don't use -c flag
    };
    
    info!("Spawning new Claude process to resume session {} with prompt", claude_session_id);
    
    // Spawn a new Claude process with --resume flag
    match spawner.spawn_claude(app.clone(), options).await {
        Ok(result) => {
            info!("Successfully spawned Claude to resume session: {}", result.session_id);
            
            // For /compact, we need special handling because it creates a NEW session
            // The result will be emitted on the NEW session channel, but frontend is listening on OLD channel
            if is_compact {
                info!("Detected /compact command - storing original session for result relay");
                
                // Store the original session ID so spawner can emit compact result on it
                std::env::set_var("COMPACT_ORIGINAL_SESSION", &original_session_id);
                
                // Also emit the session update so frontend knows there's a new session
                let _ = app.emit(
                    &format!("claude-session-id-update:{}", original_session_id),
                    &serde_json::json!({
                        "old_session_id": original_session_id,
                        "new_session_id": result.session_id,
                        "real_claude_session_id": claude_session_id
                    })
                );
            }
            
            Ok(())
        }
        Err(e) => {
            error!("Failed to spawn Claude for session {}: {}", request.session_id, e);
            Err(format!("Failed to send message: {}", e))
        }
    }
}

/// Resumes an existing Claude session
#[tauri::command]
pub async fn resume_claude_session(
    app: AppHandle,
    state: State<'_, AppState>,
    request: ResumeSessionRequest,
) -> Result<SpawnSessionResponse, String> {
    info!("resume_claude_session command called for session: {}", request.session_id);
    
    // Get the ClaudeSpawner from AppState
    let registry = state.process_registry();
    let session_manager = state.session_manager();
    let spawner = Arc::new(ClaudeSpawner::new(registry, session_manager));
    
    // Create spawn options with resume session ID
    let options = SpawnOptions {
        project_path: request.project_path,
        model: request.model,
        prompt: request.prompt.unwrap_or_default(),
        resume_session_id: Some(request.session_id.clone()),
        continue_conversation: true,
    };
    
    // Resume the Claude session
    match spawner.spawn_claude(app, options).await {
        Ok(result) => {
            info!("Successfully resumed Claude session: {}", result.session_id);
            Ok(SpawnSessionResponse {
                session_id: result.session_id,
                run_id: result.run_id,
                pid: result.pid,
                resumed: result.resumed,
            })
        }
        Err(e) => {
            error!("Failed to resume Claude session: {}", e);
            Err(format!("Failed to resume Claude session: {}", e))
        }
    }
}

/// Interrupts an active Claude session (equivalent to Ctrl+C)
#[tauri::command]
pub async fn interrupt_claude_session(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<(), String> {
    info!("interrupt_claude_session command called for session: {}", session_id);
    
    // Get the ClaudeSpawner from AppState
    let registry = state.process_registry();
    let session_manager = state.session_manager();
    let spawner = Arc::new(ClaudeSpawner::new(registry, session_manager));
    
    // Interrupt the session
    match spawner.interrupt_session(&session_id).await {
        Ok(_) => {
            info!("Successfully interrupted session {}", session_id);
            Ok(())
        }
        Err(e) => {
            error!("Failed to interrupt session {}: {}", session_id, e);
            Err(format!("Failed to interrupt session: {}", e))
        }
    }
}

/// Clears the context for a Claude session (ends the session)
#[tauri::command]
pub async fn clear_claude_context(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<(), String> {
    info!("clear_claude_context command called for session: {}", session_id);
    
    // Get the ClaudeSpawner from AppState
    let registry = state.process_registry();
    let session_manager = state.session_manager();
    let spawner = Arc::new(ClaudeSpawner::new(registry, session_manager));
    
    // Clear the session
    match spawner.clear_session(&session_id).await {
        Ok(_) => {
            info!("Successfully cleared session {}", session_id);
            Ok(())
        }
        Err(e) => {
            error!("Failed to clear session {}: {}", session_id, e);
            Err(format!("Failed to clear session: {}", e))
        }
    }
}

/// Gets information about a specific Claude session
#[tauri::command]
pub async fn get_session_info(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<SessionInfoResponse, String> {
    debug!("get_session_info command called for session: {}", session_id);
    
    // Get the session manager from AppState
    let session_manager = state.session_manager();
    
    // Get session info
    if let Some(session) = session_manager.get_session(&session_id).await {
        Ok(SessionInfoResponse {
            session_id: session.session_id,
            project_path: session.project_path,
            model: session.model,
            streaming: session.streaming,
            run_id: session.run_id,
        })
    } else {
        Err(format!("Session {} not found", session_id))
    }
}

/// Gets token statistics for a Claude session
/// Note: This will need to be extended once we have token tracking in the registry
#[tauri::command]
pub async fn get_token_stats(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<TokenStatsResponse, String> {
    debug!("get_token_stats command called for session: {}", session_id);
    
    // Get the process registry from AppState
    let registry = state.process_registry();
    
    // Get the session info first to get the run_id
    let session_manager = state.session_manager();
    if let Some(session) = session_manager.get_session(&session_id).await {
        if let Some(run_id) = session.run_id {
            // Get token stats from registry (this functionality may need to be added)
            // For now, return placeholder values
            // In production, this would query the ProcessRegistry for accumulated tokens
            Ok(TokenStatsResponse {
                input_tokens: 0,
                output_tokens: 0,
                cache_creation_tokens: 0,
                cache_read_tokens: 0,
                total_tokens: 0,
            })
        } else {
            Err(format!("Session {} has no associated process", session_id))
        }
    } else {
        Err(format!("Session {} not found", session_id))
    }
}

/// Lists all active Claude sessions
#[tauri::command]
pub async fn list_active_sessions(
    state: State<'_, AppState>,
) -> Result<ActiveSessionsResponse, String> {
    debug!("list_active_sessions command called");
    
    // Get the session manager from AppState
    let session_manager = state.session_manager();
    
    // Get all sessions
    let sessions = session_manager.list_sessions().await;
    
    // Convert to response format
    let session_responses: Vec<SessionInfoResponse> = sessions
        .into_iter()
        .map(|session| SessionInfoResponse {
            session_id: session.session_id,
            project_path: session.project_path,
            model: session.model,
            streaming: session.streaming,
            run_id: session.run_id,
        })
        .collect();
    
    info!("Found {} active sessions", session_responses.len());
    
    Ok(ActiveSessionsResponse {
        sessions: session_responses,
    })
}

/// Gets the output for a specific Claude session
/// This is used for retrieving buffered output from a session
#[tauri::command]
pub async fn get_session_output(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<String, String> {
    debug!("get_session_output command called for session: {}", session_id);
    
    // Get the session manager to find the run_id
    let session_manager = state.session_manager();
    if let Some(session) = session_manager.get_session(&session_id).await {
        if let Some(run_id) = session.run_id {
            // Get the process registry
            let registry = state.process_registry();
            
            // Get buffered output from the registry
            match registry.get_live_output(run_id) {
                Ok(output) => Ok(output),
                Err(e) => Err(format!("Failed to get output: {}", e))
            }
        } else {
            Err(format!("Session {} has no associated process", session_id))
        }
    } else {
        Err(format!("Session {} not found", session_id))
    }
}