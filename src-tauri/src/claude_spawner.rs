use anyhow::{anyhow, Result};
use std::fs;
use std::path::Path;
use std::process::Stdio;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tracing::{debug, error, info, warn};

use crate::claude_binary::{create_command_with_env, find_claude_binary};
use crate::claude_session::{generate_synthetic_session_id, SessionInfo, SessionManager};
use crate::process::{ProcessRegistry, ProcessType};
use crate::state::AppState;
use crate::stream_parser::{ClaudeStreamMessage, StreamProcessor};

/// Helper to create a file snapshot for a given path
fn create_file_snapshot(
    file_path: &str,
    working_dir: &str,
    session_id: &str,
) -> Option<serde_json::Value> {
    // Resolve the path relative to working directory
    let full_path = if Path::new(file_path).is_absolute() {
        file_path.to_string()
    } else {
        Path::new(working_dir).join(file_path).to_string_lossy().to_string()
    };

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    if Path::new(&full_path).exists() {
        match fs::read_to_string(&full_path) {
            Ok(content) => {
                let mtime = fs::metadata(&full_path)
                    .and_then(|m| m.modified())
                    .ok()
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as f64);

                info!(
                    "📸 Captured file snapshot for {}: {} bytes, mtime={:?}",
                    file_path,
                    content.len(),
                    mtime
                );

                Some(serde_json::json!({
                    "path": full_path,
                    "originalContent": content,
                    "timestamp": now,
                    "mtime": mtime,
                    "sessionId": session_id,
                    "isNewFile": false
                }))
            }
            Err(e) => {
                warn!("Failed to read file for snapshot {}: {}", file_path, e);
                None
            }
        }
    } else {
        // New file being created
        info!("📸 File snapshot for new file: {}", file_path);
        Some(serde_json::json!({
            "path": full_path,
            "originalContent": serde_json::Value::Null,
            "timestamp": now,
            "mtime": serde_json::Value::Null,
            "sessionId": session_id,
            "isNewFile": true
        }))
    }
}

/// Captures file snapshot for Edit/Write tools and augments the JSON message
/// Returns the augmented JSON string if a snapshot was captured, otherwise the original
/// Handles two formats:
/// 1. Standalone tool_use: {"type":"tool_use","name":"Edit","input":{...}}
/// 2. Assistant with content blocks: {"type":"assistant","message":{"content":[{"type":"tool_use",...}]}}
fn augment_with_file_snapshot(
    line: &str,
    working_dir: &str,
    session_id: &str,
) -> String {
    // Try to parse as JSON
    let Ok(mut json) = serde_json::from_str::<serde_json::Value>(line) else {
        return line.to_string();
    };

    let msg_type = json.get("type").and_then(|v| v.as_str()).unwrap_or("");

    // Handle standalone tool_use message: {"type":"tool_use","name":"Edit","input":{...}}
    if msg_type == "tool_use" {
        let tool_name = json.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
        if !matches!(tool_name.as_str(), "Edit" | "Write" | "MultiEdit") {
            return line.to_string();
        }

        let file_path = json.get("input")
            .and_then(|i| i.get("file_path"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let Some(file_path) = file_path else {
            return line.to_string();
        };

        if let Some(snapshot) = create_file_snapshot(&file_path, working_dir, session_id) {
            if let Some(obj) = json.as_object_mut() {
                obj.insert("fileSnapshot".to_string(), snapshot);
                info!("📸 Augmented standalone tool_use with fileSnapshot: {}", tool_name);
            }
        }

        return serde_json::to_string(&json).unwrap_or_else(|_| line.to_string());
    }

    // Handle assistant message with tool_use content blocks
    if msg_type == "assistant" {
        let Some(content) = json.get_mut("message").and_then(|m| m.get_mut("content")) else {
            return line.to_string();
        };

        let Some(content_array) = content.as_array_mut() else {
            return line.to_string();
        };

        for block in content_array.iter_mut() {
            if block.get("type").and_then(|v| v.as_str()) != Some("tool_use") {
                continue;
            }

            let tool_name = block.get("name").and_then(|v| v.as_str()).unwrap_or("");
            if !matches!(tool_name, "Edit" | "Write" | "MultiEdit") {
                continue;
            }

            let Some(input) = block.get("input") else {
                continue;
            };

            let Some(file_path) = input.get("file_path").and_then(|v| v.as_str()) else {
                continue;
            };

            if let Some(snapshot) = create_file_snapshot(file_path, working_dir, session_id) {
                if let Some(obj) = block.as_object_mut() {
                    obj.insert("fileSnapshot".to_string(), snapshot);
                }
            }
        }

        return serde_json::to_string(&json).unwrap_or_else(|_| line.to_string());
    }

    // Not a tool_use or assistant message, return unchanged
    line.to_string()
}

/// Options for spawning a Claude process
#[derive(Debug, Clone)]
pub struct SpawnOptions {
    /// Working directory for the Claude process
    pub project_path: String,
    /// Model to use (e.g., "claude-3-opus-20240229")
    pub model: String,
    /// Initial prompt to send
    pub prompt: String,
    /// Session ID to resume (optional)
    pub resume_session_id: Option<String>,
    /// Whether to continue a conversation
    pub continue_conversation: bool,
}

/// Result from spawning a Claude process
#[derive(Debug)]
pub struct SpawnResult {
    /// Session ID (either extracted or synthetic)
    pub session_id: String,
    /// Run ID in the ProcessRegistry
    pub run_id: i64,
    /// Process ID
    pub pid: u32,
    /// Whether this is a resumed session
    pub resumed: bool,
}

/// Main Claude spawner that coordinates all components
pub struct ClaudeSpawner {
    registry: Arc<ProcessRegistry>,
    session_manager: Arc<SessionManager>,
}

impl ClaudeSpawner {
    pub fn new(registry: Arc<ProcessRegistry>, session_manager: Arc<SessionManager>) -> Self {
        Self {
            registry,
            session_manager,
        }
    }

    /// Spawns a new Claude process with the given options
    pub async fn spawn_claude(&self, app: AppHandle, options: SpawnOptions) -> Result<SpawnResult> {
        info!("Spawning Claude process with options: {:?}", options);

        // Find Claude binary
        let claude_path =
            find_claude_binary().map_err(|e| anyhow!("Failed to find Claude binary: {}", e))?;
        info!("Using Claude binary at: {}", claude_path);

        // Build command with proper argument order
        let mut cmd = self.build_claude_command(&claude_path, &options)?;

        // Log the full command for debugging
        info!("Spawning Claude with command: {:?}", cmd);

        // Spawn the process
        let child = cmd
            .spawn()
            .map_err(|e| anyhow!("Failed to spawn Claude process: {}", e))?;

        // Get PID immediately
        let pid = child
            .id()
            .ok_or_else(|| anyhow!("Failed to get process PID"))?;
        info!("Spawned Claude process with PID: {}", pid);

        // CRITICAL: Register process IMMEDIATELY to prevent orphans
        let temp_session_id = generate_synthetic_session_id();
        let run_id = self
            .registry
            .register_claude_process(
                temp_session_id.clone(),
                pid,
                options.project_path.clone(),
                options.prompt.clone(),
                options.model.clone(),
                child,
            )
            .map_err(|e| anyhow!(e))?;
        info!(
            "Registered process with temporary session ID: {} and run_id: {}",
            temp_session_id, run_id
        );

        // Get the child back from registry for session ID extraction
        let mut child = match self.take_child_for_extraction(run_id).await {
            Ok(child) => child,
            Err(e) => {
                // Cleanup: kill the process by PID as fallback since we lost the handle
                error!(
                    "Failed to take child for extraction, attempting PID kill: {}",
                    e
                );
                let _ = self.registry.kill_process_by_pid(run_id, pid);
                let _ = self.registry.unregister_process(run_id);
                return Err(e);
            }
        };

        // Take stdout and stderr immediately before they're consumed
        // On failure, return child and cleanup to prevent orphans
        let stdout = match child.stdout.take() {
            Some(stdout) => stdout,
            None => {
                error!("No stdout available, returning child and cleaning up");
                let _ = self.registry.return_child(run_id, child);
                let _ = self.registry.kill_process(run_id).await;
                return Err(anyhow!("No stdout available"));
            }
        };
        let stderr = match child.stderr.take() {
            Some(stderr) => stderr,
            None => {
                error!("No stderr available, returning child and cleaning up");
                let _ = self.registry.return_child(run_id, child);
                let _ = self.registry.kill_process(run_id).await;
                return Err(anyhow!("No stderr available"));
            }
        };

        // Return the child to registry after taking streams
        if let Err(e) = self.registry.return_child(run_id, child) {
            error!("Failed to return child to registry: {}", e);
            // Kill the process to prevent orphan
            let _ = self.registry.kill_process(run_id).await;
            return Err(anyhow!("Failed to return child to registry: {}", e));
        }

        // We'll extract session ID from the stream handler itself
        // For now, use the temporary session ID
        let session_id = temp_session_id.clone();

        // Register session in SessionManager
        let session_info = SessionInfo {
            session_id: session_id.clone(),
            project_path: options.project_path.clone(),
            model: options.model.clone(),
            provider: Some("claude".to_string()),
            streaming: true,
            run_id: Some(run_id),
        };
        self.session_manager.register_session(session_info).await?;

        // Start streaming handlers with the streams we already took
        self.start_stream_handlers_with_streams(
            app,
            stdout,
            stderr,
            session_id.clone(),
            run_id,
            options.project_path.clone(),
        )
        .await?;

        // DO NOT send initial prompt via stdin - it's already passed with -p flag
        // The prompt is included in the command arguments when spawning

        Ok(SpawnResult {
            session_id,
            run_id,
            pid,
            resumed: options.resume_session_id.is_some(),
        })
    }

    /// Builds the Claude command with proper argument ordering
    fn build_claude_command(&self, claude_path: &str, options: &SpawnOptions) -> Result<Command> {
        let mut cmd = tokio::process::Command::from(create_command_with_env(claude_path));

        // CRITICAL: Argument order matters! Following claudia's working implementation
        // 1. Resume session (if applicable)
        if let Some(session_id) = &options.resume_session_id {
            cmd.arg("--resume").arg(session_id);
            debug!("Added resume argument for session: {}", session_id);
        }

        // 2. Continue conversation (if applicable)
        if options.continue_conversation {
            cmd.arg("-c"); // Use -c instead of --continue
            debug!("Added continue argument");
        }

        // 3. Prompt (if provided and not just whitespace)
        // Use -p flag instead of --prompt, as per claudia's working implementation
        if !options.prompt.trim().is_empty() {
            cmd.arg("-p").arg(&options.prompt);
            debug!("Added prompt argument: {}", options.prompt);
        }

        // 4. Model
        cmd.arg("--model").arg(&options.model);
        debug!("Using model: {}", options.model);

        // 5. Output format
        cmd.arg("--output-format").arg("stream-json");

        // CRITICAL: --print flag is ONLY for NEW sessions
        // NEVER use --print with -c (continue) or --resume flags
        // Claudia NEVER uses --print flag at all
        if options.resume_session_id.is_none() && !options.continue_conversation {
            cmd.arg("--print");
            debug!("Added --print flag (new session only)");
        } else {
            debug!("Skipping --print flag (resuming or continuing)");
        }

        // 6. --verbose for extra debugging info
        cmd.arg("--verbose");

        // 7. Yume default settings: disable co-authored-by, enable extended thinking
        cmd.arg("--settings")
            .arg(r#"{"attribution":{"commit":"","pr":""},"alwaysThinkingEnabled":true}"#);

        // 7. Platform-specific flags
        #[cfg(target_os = "macos")]
        {
            // macOS may need special permissions flag
            cmd.arg("--dangerously-skip-permissions");
        }

        // Set working directory
        cmd.current_dir(&options.project_path);

        // Configure stdio - Following claudia's implementation exactly
        // Claudia NEVER pipes stdin - prompts are always passed via -p flag
        // Only pipe stdout and stderr for reading output
        cmd.stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);

        Ok(cmd)
    }

    /// Takes the child process from registry for session ID extraction
    async fn take_child_for_extraction(&self, run_id: i64) -> Result<Child> {
        self.registry
            .take_child(run_id)
            .map_err(|e| anyhow!(e))?
            .ok_or_else(|| anyhow!("No child process available for run_id {}", run_id))
    }

    /// Starts the stream handlers with already-taken stdout and stderr
    async fn start_stream_handlers_with_streams(
        &self,
        app: AppHandle,
        stdout: tokio::process::ChildStdout,
        stderr: tokio::process::ChildStderr,
        session_id: String,
        run_id: i64,
        working_dir: String,
    ) -> Result<()> {
        let registry = self.registry.clone();
        let session_manager = self.session_manager.clone();

        // Spawn stdout handler with StreamProcessor
        let app_stdout = app.clone();
        let session_id_stdout = session_id.clone();
        let registry_stdout = registry.clone();
        let session_manager_stdout = session_manager.clone();
        let working_dir_stdout = working_dir.clone();

        tokio::spawn(async move {
            info!("Starting stdout handler for session {}", session_id_stdout);
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            let mut stream_processor = StreamProcessor::new();
            stream_processor.start_streaming();
            let mut real_session_id = session_id_stdout.clone();
            let mut session_id_extracted = false;

            while let Ok(Some(line)) = lines.next_line().await {
                info!("Claude stdout: {}", line);

                // Store raw output in registry
                let _ = registry_stdout.append_live_output(run_id, &line);

                // Try to extract session ID from early messages if not yet done
                if !session_id_extracted {
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&line) {
                        if json["type"] == "system" && json["subtype"] == "init" {
                            if let Some(sid) = json["session_id"].as_str() {
                                info!("Extracted real Claude session ID: {}", sid);
                                real_session_id = sid.to_string();
                                session_id_extracted = true;
                                // Update session manager with real ID
                                let _ = session_manager_stdout
                                    .update_session_id(&session_id_stdout, &real_session_id)
                                    .await;

                                // Emit a session ID update event so frontend can update its listener
                                let _ = app_stdout.emit(
                                    &format!("claude-session-id-update:{}", session_id_stdout),
                                    &serde_json::json!({
                                        "old_session_id": &session_id_stdout,
                                        "new_session_id": &real_session_id
                                    }),
                                );
                                info!(
                                    "Emitted session ID update: {} -> {}",
                                    session_id_stdout, real_session_id
                                );
                            }
                        }
                    }
                }

                // Augment line with file snapshot for Edit/Write/MultiEdit tools
                // This enables line change tracking in the frontend
                let augmented_line = augment_with_file_snapshot(
                    &line,
                    &working_dir_stdout,
                    &real_session_id,
                );

                // CRITICAL: Emit the (potentially augmented) line to frontend for parsing
                // Use the real session ID if we have it, otherwise use the synthetic one
                let emit_session_id = if session_id_extracted {
                    &real_session_id
                } else {
                    &session_id_stdout
                };
                let channel = format!("claude-message:{}", emit_session_id);
                info!("Emitting message on channel: {}", channel);
                let emit_result = app_stdout.emit(&channel, &augmented_line);
                if let Err(e) = emit_result {
                    error!("Failed to emit message: {:?}", e);
                    // Emit error on generic channel so frontend knows
                    let _ = app_stdout.emit(
                        "claude-emit-error",
                        &serde_json::json!({
                            "session_id": &session_id_stdout,
                            "error": format!("{:?}", e)
                        }),
                    );
                }

                // SPECIAL HANDLING FOR /compact: Also emit on original session channel
                // This is because /compact creates a NEW session but frontend is still on OLD channel
                if line.contains("\"subtype\":\"success\"") && line.contains("\"num_turns\"") {
                    // This looks like a compact result - check if we have an original session to emit to
                    // Use thread-safe state instead of global env vars (fixes race condition)
                    if let Some(state) = app_stdout.try_state::<AppState>() {
                        if let Some(original_session) =
                            state.take_compact_original_session(&real_session_id)
                        {
                            let original_channel = format!("claude-message:{}", original_session);
                            info!(
                                "Detected compact result - also emitting on original channel: {}",
                                original_channel
                            );
                            let _ = app_stdout.emit(&original_channel, &augmented_line);
                        }
                    }
                }

                // ALSO emit on the original session channel for /compact results
                // /compact creates a new session, but frontend is listening on old channel
                if session_id_stdout != real_session_id && session_id_extracted {
                    let original_channel = format!("claude-message:{}", session_id_stdout);
                    debug!(
                        "Also emitting on original channel for session transition: {}",
                        original_channel
                    );
                    let _ = app_stdout.emit(&original_channel, &augmented_line);
                }

                // Still process for session ID extraction and token tracking
                match stream_processor.process_line(&line).await {
                    Ok(Some(message)) => {
                        // After processing, check if we have tokens to emit
                        let tokens = stream_processor.tokens();
                        let total = tokens.total_tokens();
                        if total > 0 {
                            let token_data = serde_json::json!({
                                "type": "token_update",
                                "session_id": &real_session_id,
                                "tokens": {
                                    "input": tokens.total_input_tokens,
                                    "output": tokens.total_output_tokens,
                                    "cache_creation": tokens.total_cache_creation_tokens,
                                    "cache_read": tokens.total_cache_read_tokens,
                                    "total": total
                                }
                            });

                            info!("Emitting token update during stream: total={}", total);
                            let _ = app_stdout
                                .emit(&format!("claude-tokens:{}", real_session_id), &token_data);
                            let _ = app_stdout.emit("claude-tokens", &token_data);
                        }

                        // Handle specific message types for internal tracking
                        match &message {
                            ClaudeStreamMessage::Usage { .. } => {
                                // This case shouldn't happen anymore since we extract usage in process_line
                                // But keeping for safety
                                info!(
                                    "Got Usage message type (shouldn't happen with new extraction)"
                                );
                            }
                            ClaudeStreamMessage::MessageStop => {
                                let _ = session_manager_stdout
                                    .set_streaming(&session_id_stdout, false)
                                    .await;
                                info!("Message complete for session {}", session_id_stdout);
                                // Emit completion event using the real session ID
                                let emit_sid = if session_id_extracted {
                                    &real_session_id
                                } else {
                                    &session_id_stdout
                                };
                                let _ =
                                    app_stdout.emit(&format!("claude-complete:{}", emit_sid), true);
                            }
                            ClaudeStreamMessage::Error {
                                message: err_msg, ..
                            } => {
                                error!(
                                    "Claude error in session {}: {}",
                                    session_id_stdout, err_msg
                                );
                                // Emit error event using the real session ID
                                let emit_sid = if session_id_extracted {
                                    &real_session_id
                                } else {
                                    &session_id_stdout
                                };
                                let _ =
                                    app_stdout.emit(&format!("claude-error:{}", emit_sid), err_msg);
                            }
                            _ => {
                                // Other message types are handled by the raw line emission above
                            }
                        }
                    }
                    Ok(None) => {
                        // Incomplete JSON, waiting for more
                        debug!("Buffering incomplete JSON");
                    }
                    Err(e) => {
                        warn!("Failed to parse line: {}", e);
                    }
                }

                // Also emit raw output for backward compatibility
                let _ = app_stdout.emit(&format!("claude-output:{}", real_session_id), &line);
                let _ = app_stdout.emit("claude-output", &line);

                // Check if streaming stopped
                if !stream_processor.is_streaming() {
                    break;
                }
            }

            // Final token update and emit to frontend
            let tokens = stream_processor.tokens();
            let total = tokens.total_tokens();
            info!(
                "Session {} complete. Total tokens: {}",
                session_id_stdout, total
            );

            // Emit final token data to frontend
            if total > 0 {
                let token_data = serde_json::json!({
                    "type": "token_update",
                    "session_id": &real_session_id,
                    "tokens": {
                        "input": tokens.total_input_tokens,
                        "output": tokens.total_output_tokens,
                        "cache_creation": tokens.total_cache_creation_tokens,
                        "cache_read": tokens.total_cache_read_tokens,
                        "total": total
                    }
                });

                info!("Emitting final token update: {:?}", token_data);
                let _ = app_stdout.emit(&format!("claude-tokens:{}", real_session_id), &token_data);
                let _ = app_stdout.emit("claude-tokens", &token_data);
            }
        });

        // Spawn stderr handler
        let app_stderr = app.clone();
        let session_id_stderr = session_id.clone();

        tokio::spawn(async move {
            info!("Starting stderr handler for session {}", session_id_stderr);
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();

            while let Ok(Some(line)) = lines.next_line().await {
                error!("Claude stderr: {}", line);

                // Emit error with session-specific event
                let _ = app_stderr.emit(&format!("claude-error:{}", session_id_stderr), &line);

                // Also emit generic event
                let _ = app_stderr.emit("claude-error", &line);
            }
        });

        // Spawn process completion handler
        let app_complete = app.clone();
        let session_id_complete = session_id.clone();
        let registry_complete = registry.clone();
        let session_manager_complete = session_manager.clone();

        tokio::spawn(async move {
            // Monitor process status
            loop {
                // Use 100ms polling for faster process exit detection
                tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

                // Check if process is still running
                match registry_complete.is_process_running(run_id).await {
                    Ok(false) => {
                        // Process has exited
                        info!("Process {} has completed", run_id);
                        let _ = session_manager_complete
                            .set_streaming(&session_id_complete, false)
                            .await;

                        // Emit completion event
                        let _ = app_complete
                            .emit(&format!("claude-complete:{}", session_id_complete), true);
                        let _ = app_complete.emit("claude-complete", true);
                        break;
                    }
                    Ok(true) => {
                        // Still running, continue monitoring
                    }
                    Err(e) => {
                        error!("Error checking process status: {}", e);
                        break;
                    }
                }
            }
        });

        Ok(())
    }

    /// Sends a prompt to an active Claude session
    pub async fn send_prompt(&self, session_id: &str, prompt: &str) -> Result<()> {
        // Get the session info to find the run_id
        // First try exact match, then check all sessions for temporary IDs
        let session = if let Some(s) = self.session_manager.get_session(session_id).await {
            Some(s)
        } else {
            // Check if this is a temporary session ID that's been replaced
            let all_sessions = self.session_manager.list_sessions().await;
            all_sessions.into_iter().find(|_s| {
                // Check if session_id starts with "temp-" and matches pattern
                session_id.starts_with("temp-") || session_id.starts_with("syn_")
            })
        };

        if let Some(session) = session {
            if let Some(run_id) = session.run_id {
                info!(
                    "Sending prompt to session {} (run_id {}): {}",
                    session.session_id, run_id, prompt
                );

                // Write the prompt to stdin through the registry
                // Add a newline to ensure the prompt is sent
                let prompt_with_newline = if prompt.ends_with('\n') {
                    prompt.to_string()
                } else {
                    format!("{}\n", prompt)
                };

                self.registry
                    .write_to_stdin(run_id, &prompt_with_newline)
                    .await
                    .map_err(|e| anyhow!("Failed to write prompt: {}", e))?;

                info!(
                    "Successfully sent prompt to session {} (wrote {} bytes)",
                    session.session_id,
                    prompt_with_newline.len()
                );
                Ok(())
            } else {
                Err(anyhow!("Session {} has no associated process", session_id))
            }
        } else {
            // If not found, try to find by run_id in process registry
            // This handles cases where the session was just spawned
            if let Ok(processes) = self.registry.get_running_claude_sessions() {
                for process in processes {
                    let ProcessType::ClaudeSession {
                        session_id: proc_session_id,
                    } = &process.process_type;
                    if proc_session_id == session_id {
                        info!(
                            "Found process by registry lookup, sending prompt to run_id {}",
                            process.run_id
                        );
                        let prompt_with_newline = if prompt.ends_with('\n') {
                            prompt.to_string()
                        } else {
                            format!("{}\n", prompt)
                        };
                        self.registry
                            .write_to_stdin(process.run_id, &prompt_with_newline)
                            .await
                            .map_err(|e| anyhow!("Failed to write prompt: {}", e))?;
                        return Ok(());
                    }
                }
            }
            Err(anyhow!(
                "Session {} not found in session manager or process registry",
                session_id
            ))
        }
    }

    /// Interrupts a Claude session
    ///
    /// Tries multiple strategies to find and kill the process:
    /// 1. Look up by session ID in session_manager
    /// 2. Look up in process registry by session ID
    /// 3. Kill ALL running Claude processes (fallback for session ID mismatches)
    pub async fn interrupt_session(&self, session_id: &str) -> Result<()> {
        info!("Attempting to interrupt session: {}", session_id);

        // Strategy 1: Try session manager first (ideal case)
        if let Some(session) = self.session_manager.get_session(session_id).await {
            if let Some(run_id) = session.run_id {
                info!("Found session in session_manager, killing run_id {}", run_id);
                self.registry
                    .kill_process(run_id)
                    .await
                    .map_err(|e| anyhow!(e))?;
                let _ = self.session_manager.set_streaming(session_id, false).await;
                info!("Successfully interrupted session {} via session_manager", session_id);
                return Ok(());
            }
        }

        // Strategy 2: Search process registry directly by session ID
        if let Ok(Some(process)) = self.registry.get_claude_session_by_id(session_id) {
            info!("Found session in process registry, killing run_id {}", process.run_id);
            self.registry
                .kill_process(process.run_id)
                .await
                .map_err(|e| anyhow!(e))?;
            info!("Successfully interrupted session {} via registry lookup", session_id);
            return Ok(());
        }

        // Strategy 3: Kill ALL running Claude processes
        // This handles session ID mismatches between frontend and backend
        // Frontend uses temp IDs like "session-123", backend uses synthetic IDs like "syn_abc"
        let running = self.registry.get_running_claude_sessions().map_err(|e| anyhow!(e))?;
        if !running.is_empty() {
            info!(
                "Session {} not found directly, killing {} running process(es) as fallback",
                session_id,
                running.len()
            );
            let mut killed_count = 0;
            for process in running {
                match self.registry.kill_process(process.run_id).await {
                    Ok(true) => {
                        info!("Killed process run_id={} (PID {})", process.run_id, process.pid);
                        killed_count += 1;
                    }
                    Ok(false) => {
                        warn!("Process run_id={} already dead", process.run_id);
                    }
                    Err(e) => {
                        error!("Failed to kill process run_id={}: {}", process.run_id, e);
                    }
                }
            }

            // Also clear streaming state for all sessions
            for session in self.session_manager.list_sessions().await {
                let _ = self.session_manager.set_streaming(&session.session_id, false).await;
            }

            if killed_count > 0 {
                info!("Successfully killed {} process(es) via fallback strategy", killed_count);
                return Ok(());
            }
        }

        warn!("No running processes found to interrupt for session {}", session_id);
        // Return Ok instead of Err - no process to kill is not an error
        Ok(())
    }

    /// Clears a session completely
    pub async fn clear_session(&self, session_id: &str) -> Result<()> {
        // First interrupt if running
        let _ = self.interrupt_session(session_id).await;

        // Remove from session manager
        self.session_manager.remove_session(session_id).await;

        info!("Cleared session {}", session_id);
        Ok(())
    }
}

/// Creates a title generation prompt
pub fn create_title_prompt(first_message: &str) -> String {
    format!(
        "Generate a concise title (max 50 characters) for a conversation that starts with: {}",
        first_message
    )
}

/// Spawns a separate Claude process for title generation
pub async fn spawn_claude_for_title(
    _app: AppHandle,
    first_message: &str,
    project_path: &str,
) -> Result<String> {
    info!("Spawning Claude for title generation");

    let claude_path =
        find_claude_binary().map_err(|e| anyhow!("Failed to find Claude binary: {}", e))?;

    let mut cmd = tokio::process::Command::from(create_command_with_env(&claude_path));

    // Use Sonnet for title generation (faster and cheaper)
    cmd.arg("--model").arg("claude-3-5-sonnet-20241022");
    cmd.arg("--prompt").arg(create_title_prompt(first_message));
    cmd.arg("--output-format").arg("stream-json");
    cmd.arg("--print");
    cmd.current_dir(project_path);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let _output = cmd.output().await?;

    // Parse the output to extract the title
    // For now, return a placeholder
    Ok("New Conversation".to_string())
}
