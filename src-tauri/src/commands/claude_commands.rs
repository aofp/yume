/// Claude-specific Tauri command handlers
/// These commands provide the bridge between the frontend and the direct CLI spawning backend
/// They replace the Socket.IO communication used in the embedded server architecture
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tracing::{debug, error, info, warn};

use crate::claude_spawner::{ClaudeSpawner, SpawnOptions};
use crate::state::AppState;
use crate::yume_cli_spawner::{Provider, YumeCliSpawnOptions, YumeCliSpawner};

/// Request structure for spawning a new Claude session
#[derive(Debug, Deserialize)]
pub struct SpawnSessionRequest {
    pub project_path: String,
    pub model: String,
    pub prompt: String,
    /// Optional session ID to resume an existing conversation
    pub resume_session_id: Option<String>,
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
    /// The actual Claude session ID to resume (from frontend claudeSessionStore)
    pub claude_session_id: Option<String>,
    /// Project path for the session
    pub project_path: Option<String>,
    /// Model to use
    pub model: Option<String>,
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
    info!(
        "spawn_claude_session command called with project_path: {}, model: {}",
        request.project_path, request.model
    );

    // Get the ClaudeSpawner from AppState
    let registry = state.process_registry();
    let session_manager = state.session_manager();
    let spawner = Arc::new(ClaudeSpawner::new(registry, session_manager));

    // Create spawn options - use resume_session_id if provided
    let is_resuming = request.resume_session_id.is_some();
    let options = SpawnOptions {
        project_path: request.project_path,
        model: request.model,
        prompt: request.prompt,
        resume_session_id: request.resume_session_id,
        continue_conversation: is_resuming,
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

/// Helper to detect provider from model name
fn detect_provider_from_model(model: &str) -> &'static str {
    if model.starts_with("gemini") {
        "gemini"
    } else if model.starts_with("gpt") || model.contains("codex") {
        "openai"
    } else {
        "claude"
    }
}

/// Sends a message to a session by spawning a new process with --resume
/// Routes to appropriate CLI based on model (Claude, Gemini, or Codex)
#[tauri::command]
pub async fn send_claude_message(
    app: AppHandle,
    state: State<'_, AppState>,
    request: SendMessageRequest,
) -> Result<(), String> {
    info!(
        "send_claude_message command called for session: {}",
        request.session_id
    );

    // Get the session info - prefer values passed from frontend, fallback to session_manager
    let session_manager = state.session_manager();

    // Use claude_session_id from request if provided (preferred - fixes multi-tab and interrupt issues)
    // Otherwise fallback to session_manager lookup (legacy behavior)
    let (claude_session_id, project_path, model) =
        if let Some(ref csid) = request.claude_session_id {
            info!("Using claude_session_id from request: {}", csid);
            (
                csid.clone(),
                request
                    .project_path
                    .clone()
                    .unwrap_or_else(|| ".".to_string()),
                request
                    .model
                    .clone()
                    .unwrap_or_else(|| "claude-sonnet-4-20250514".to_string()),
            )
        } else {
            // Fallback: Get from session_manager (legacy behavior, less reliable)
            warn!("No claude_session_id in request, falling back to session_manager lookup");
            let sessions = session_manager.list_sessions().await;
            let session = sessions.into_iter().next().ok_or_else(|| {
                format!("No active sessions found and no claude_session_id provided")
            })?;
            (
                session.session_id.clone(),
                session.project_path.clone(),
                session.model.clone(),
            )
        };

    info!(
        "Found session ID to resume: {}, model: {}",
        claude_session_id, model
    );

    // Detect provider from model name
    let provider = detect_provider_from_model(&model);
    info!("Detected provider: {}", provider);

    // Get the registry
    let registry = state.process_registry();

    // Store the original requesting session ID for /compact handling
    let original_session_id = request.session_id.clone();
    let is_compact = request.message.trim().starts_with("/compact");

    // Route to appropriate spawner based on provider
    match provider {
        "gemini" | "openai" => {
            // Use YumeCliSpawner for Gemini/OpenAI
            let yume_provider = if provider == "gemini" {
                crate::yume_cli_spawner::Provider::Gemini
            } else {
                crate::yume_cli_spawner::Provider::OpenAI
            };

            let spawner = Arc::new(crate::yume_cli_spawner::YumeCliSpawner::new(
                registry,
                session_manager.clone(),
            ));

            let options = crate::yume_cli_spawner::YumeCliSpawnOptions {
                provider: yume_provider,
                project_path: project_path,
                model: model.clone(),
                prompt: request.message.clone(),
                resume_session_id: Some(claude_session_id.clone()),
                reasoning_effort: None, // TODO: pass from request if needed
                history_file_path: None,
                // CRITICAL: Pass the original frontend session ID so messages are emitted on that channel
                original_session_id: Some(original_session_id.clone()),
            };

            info!(
                "Spawning {} CLI process to resume session {}",
                provider, claude_session_id
            );

            match spawner.spawn(app.clone(), options).await {
                Ok(result) => {
                    info!(
                        "Successfully spawned {} CLI for session: {}",
                        provider, result.session_id
                    );

                    // CRITICAL: Emit session-id-update on the ORIGINAL session ID so frontend
                    // listener can switch to the new session. The spawner emits on the new
                    // synthetic ID, but frontend is listening on the old one.
                    if original_session_id != result.session_id {
                        info!(
                            "Emitting session-id-update: {} -> {}",
                            original_session_id, result.session_id
                        );
                        let _ = app.emit(
                            &format!("claude-session-id-update:{}", original_session_id),
                            &serde_json::json!({
                                "old_session_id": original_session_id,
                                "new_session_id": result.session_id
                            }),
                        );
                    }

                    Ok(())
                }
                Err(e) => {
                    error!(
                        "Failed to spawn {} CLI for session {}: {}",
                        provider, request.session_id, e
                    );
                    Err(format!("Failed to send message: {}", e))
                }
            }
        }
        _ => {
            // Use ClaudeSpawner for Claude models
            let spawner = Arc::new(ClaudeSpawner::new(registry, session_manager.clone()));

            // Create spawn options - claudia uses --resume with session ID!
            // NOT -c flag! That creates a new session!
            let options = SpawnOptions {
                project_path: project_path,
                model: model,
                prompt: request.message.clone(), // Pass the message as prompt (including slash commands)
                resume_session_id: Some(claude_session_id.clone()), // Use --resume with session ID
                continue_conversation: false,    // Don't use -c flag
            };

            info!(
                "Spawning Claude process to resume session {} with prompt",
                claude_session_id
            );

            // Spawn a new Claude process with --resume flag
            match spawner.spawn_claude(app.clone(), options).await {
                Ok(result) => {
                    info!(
                        "Successfully spawned Claude to resume session: {}",
                        result.session_id
                    );

                    // For /compact, we need special handling because it creates a NEW session
                    // The result will be emitted on the NEW session channel, but frontend is listening on OLD channel
                    if is_compact {
                        info!(
                            "Detected /compact command - storing original session for result relay"
                        );

                        // Store the mapping in thread-safe state (not global env vars)
                        // This allows multiple simultaneous /compact commands without race conditions
                        state.register_compact_session(&result.session_id, &original_session_id);

                        // Also emit the session update so frontend knows there's a new session
                        let _ = app.emit(
                            &format!("claude-session-id-update:{}", original_session_id),
                            &serde_json::json!({
                                "old_session_id": original_session_id,
                                "new_session_id": result.session_id,
                                "real_claude_session_id": claude_session_id
                            }),
                        );
                    }

                    Ok(())
                }
                Err(e) => {
                    error!(
                        "Failed to spawn Claude for session {}: {}",
                        request.session_id, e
                    );
                    Err(format!("Failed to send message: {}", e))
                }
            }
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
    info!(
        "resume_claude_session command called for session: {}",
        request.session_id
    );

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
    info!(
        "interrupt_claude_session command called for session: {}",
        session_id
    );

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
    info!(
        "clear_claude_context command called for session: {}",
        session_id
    );

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
    debug!(
        "get_session_info command called for session: {}",
        session_id
    );

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
    let _registry = state.process_registry();

    // Get the session info first to get the run_id
    let session_manager = state.session_manager();
    if let Some(session) = session_manager.get_session(&session_id).await {
        if let Some(_run_id) = session.run_id {
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
    debug!(
        "get_session_output command called for session: {}",
        session_id
    );

    // Get the session manager to find the run_id
    let session_manager = state.session_manager();
    if let Some(session) = session_manager.get_session(&session_id).await {
        if let Some(run_id) = session.run_id {
            // Get the process registry
            let registry = state.process_registry();

            // Get buffered output from the registry
            match registry.get_live_output(run_id) {
                Ok(output) => Ok(output),
                Err(e) => Err(format!("Failed to get output: {}", e)),
            }
        } else {
            Err(format!("Session {} has no associated process", session_id))
        }
    } else {
        Err(format!("Session {} not found", session_id))
    }
}

/// Request structure for spawning a new yume-cli session
#[derive(Debug, Deserialize)]
pub struct SpawnYumeCliRequest {
    pub provider: String,
    pub project_path: String,
    pub model: String,
    pub prompt: String,
    pub resume_session_id: Option<String>,
    pub reasoning_effort: Option<String>, // OpenAI reasoning effort: low, medium, high, xhigh
    pub history_file_path: Option<String>,
    /// Frontend temp session ID to emit messages on (for listener routing)
    pub frontend_session_id: Option<String>,
}

/// Spawns a new yume-cli session with the given options
#[tauri::command]
pub async fn spawn_yume_cli_session(
    app: AppHandle,
    state: State<'_, AppState>,
    request: SpawnYumeCliRequest,
) -> Result<SpawnSessionResponse, String> {
    info!(
        "spawn_yume_cli_session command called with provider: {}, project_path: {}, model: {}",
        request.provider, request.project_path, request.model
    );

    // Convert provider string to Provider enum
    let provider = match request.provider.to_lowercase().as_str() {
        "gemini" => Provider::Gemini,
        "openai" => Provider::OpenAI,
        _ => {
            return Err(format!(
                "Invalid provider: {}. Must be 'gemini' or 'openai'",
                request.provider
            ))
        }
    };

    // Get the YumeCliSpawner from AppState
    let registry = state.process_registry();
    let session_manager = state.session_manager();
    let spawner = Arc::new(YumeCliSpawner::new(registry, session_manager));

    // Create spawn options
    let options = YumeCliSpawnOptions {
        provider,
        project_path: request.project_path,
        model: request.model,
        prompt: request.prompt,
        resume_session_id: request.resume_session_id,
        reasoning_effort: request.reasoning_effort,
        history_file_path: request.history_file_path,
        // Use frontend_session_id so messages are emitted on the channel frontend is listening on
        original_session_id: request.frontend_session_id,
    };

    // Spawn the yume-cli process
    match spawner.spawn(app, options).await {
        Ok(result) => {
            info!(
                "Successfully spawned yume-cli session: {}",
                result.session_id
            );
            Ok(SpawnSessionResponse {
                session_id: result.session_id,
                run_id: result.run_id,
                pid: result.pid,
                resumed: result.resumed,
            })
        }
        Err(e) => {
            error!("Failed to spawn yume-cli session: {}", e);
            Err(format!("Failed to spawn yume-cli session: {}", e))
        }
    }
}
