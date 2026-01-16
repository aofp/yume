use anyhow::{anyhow, Result};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tracing::{error, info, warn};

use crate::claude_binary::create_command_with_env;
use crate::claude_session::{generate_synthetic_session_id, SessionInfo, SessionManager};
use crate::process::ProcessRegistry;

/// Provider types supported by yume-cli
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Provider {
    Gemini,
    OpenAI,
}

impl Provider {
    pub fn as_str(&self) -> &'static str {
        match self {
            Provider::Gemini => "gemini",
            Provider::OpenAI => "openai",
        }
    }
}

/// Options for spawning a yume-cli process
#[derive(Debug, Clone)]
pub struct YumeCliSpawnOptions {
    /// Provider to use
    pub provider: Provider,
    /// Working directory
    pub project_path: String,
    /// Model to use (e.g., "gemini-2.0-flash", "gpt-4o")
    pub model: String,
    /// Initial prompt to send
    pub prompt: String,
    /// Session ID to resume (optional)
    pub resume_session_id: Option<String>,
    /// Reasoning effort for OpenAI models (low, medium, high, xhigh)
    pub reasoning_effort: Option<String>,
    /// Path to a JSON file containing conversation history to inject
    pub history_file_path: Option<String>,
    /// Original frontend session ID to also emit messages on (for send_message routing)
    pub original_session_id: Option<String>,
}

/// Result from spawning a yume-cli process
#[derive(Debug)]
pub struct YumeCliSpawnResult {
    /// Session ID
    pub session_id: String,
    /// Run ID in the ProcessRegistry
    pub run_id: i64,
    /// Process ID
    pub pid: u32,
    /// Whether this is a resumed session
    pub resumed: bool,
}

/// yume-cli spawner that handles Gemini and OpenAI providers
pub struct YumeCliSpawner {
    registry: Arc<ProcessRegistry>,
    session_manager: Arc<SessionManager>,
}

/// Locate the yume-cli binary for the current environment.
pub fn locate_yume_cli_binary() -> Result<String> {
    let mut search_paths: Vec<PathBuf> = Vec::new();

    if let Ok(cwd) = std::env::current_dir() {
        search_paths.push(cwd.clone());
        if let Some(parent) = cwd.parent() {
            search_paths.push(parent.to_path_buf());
        }
    }

    for base in search_paths {
        let candidate = base.join("src-yume-cli/dist/index.js");
        if candidate.exists() {
            return Ok(format!("node {}", candidate.display()));
        }
    }

    if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
        let manifest_path = Path::new(&manifest_dir).join("../src-yume-cli/dist/index.js");
        if manifest_path.exists() {
            return Ok(format!("node {}", manifest_path.display()));
        }
    }

    if let Ok(env_path) = std::env::var("YUME_CLI_BINARY") {
        let path = Path::new(&env_path);
        if path.exists() {
            return Ok(path.to_string_lossy().to_string());
        }
    }

    // Check bundled binary in resources
    #[cfg(target_os = "macos")]
    {
        let arch = if cfg!(target_arch = "aarch64") {
            "arm64"
        } else {
            "x64"
        };
        let binary_name = format!("yume-cli-macos-{}", arch);

        if let Ok(exe_path) = std::env::current_exe() {
            // Tauri bundles resources to Contents/Resources/resources/
            let resources_path = exe_path
                .parent()
                .and_then(|p| p.parent())
                .map(|p| p.join("Resources").join("resources").join(&binary_name));

            if let Some(path) = resources_path {
                if path.exists() {
                    return Ok(path.to_string_lossy().to_string());
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(exe_path) = std::env::current_exe() {
            // Tauri bundles resources to {exe_dir}/resources/
            let resources_path = exe_path
                .parent()
                .map(|p| p.join("resources").join("yume-cli-windows-x64.exe"));

            if let Some(path) = resources_path {
                if path.exists() {
                    return Ok(path.to_string_lossy().to_string());
                }
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Ok(exe_path) = std::env::current_exe() {
            // Tauri bundles resources to {exe_dir}/resources/
            let resources_path = exe_path
                .parent()
                .map(|p| p.join("resources").join("yume-cli-linux-x64"));

            if let Some(path) = resources_path {
                if path.exists() {
                    return Ok(path.to_string_lossy().to_string());
                }
            }
        }
    }

    Err(anyhow!("yume-cli binary not found"))
}

impl YumeCliSpawner {
    pub fn new(registry: Arc<ProcessRegistry>, session_manager: Arc<SessionManager>) -> Self {
        Self {
            registry,
            session_manager,
        }
    }

    /// Find the yume-cli binary path
    fn find_yume_cli_binary() -> Result<String> {
        locate_yume_cli_binary()
    }

    /// Spawns a new yume-cli process
    pub async fn spawn(
        &self,
        app: AppHandle,
        options: YumeCliSpawnOptions,
    ) -> Result<YumeCliSpawnResult> {
        info!("Spawning yume-cli process with options: {:?}", options);

        let binary_path = Self::find_yume_cli_binary()?;
        info!("Using yume-cli binary at: {}", binary_path);

        // Build command with proper env inheritance (PATH, gcloud, API keys, etc.)
        let mut cmd = if binary_path.starts_with("node ") {
            let script_path = binary_path.strip_prefix("node ").unwrap();
            let mut cmd = Command::from(create_command_with_env("node"));
            cmd.arg(script_path);
            cmd
        } else {
            Command::from(create_command_with_env(&binary_path))
        };

        // Add arguments
        cmd.arg("--provider").arg(options.provider.as_str());
        cmd.arg("--model").arg(&options.model);
        cmd.arg("--cwd").arg(&options.project_path);

        if let Some(resume_id) = &options.resume_session_id {
            cmd.arg("--resume").arg(resume_id);
        }

        if let Some(history_path) = &options.history_file_path {
            cmd.arg("--history-file").arg(history_path);
        }

        if !options.prompt.trim().is_empty() {
            cmd.arg("--prompt").arg(&options.prompt);
        }

        cmd.arg("--output-format").arg("stream-json");
        cmd.arg("--verbose");

        // Set working directory
        cmd.current_dir(&options.project_path);

        // Configure stdio
        cmd.stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);

        // Spawn the process
        let child = cmd
            .spawn()
            .map_err(|e| anyhow!("Failed to spawn yume-cli process: {}", e))?;

        let pid = child
            .id()
            .ok_or_else(|| anyhow!("Failed to get process PID"))?;
        info!("Spawned yume-cli process with PID: {}", pid);

        // Generate session ID
        let session_id = generate_synthetic_session_id();

        // Register process
        let run_id = self
            .registry
            .register_claude_process(
                session_id.clone(),
                pid,
                options.project_path.clone(),
                options.prompt.clone(),
                options.model.clone(),
                child,
            )
            .map_err(|e| anyhow!(e))?;
        info!(
            "Registered process with session ID: {} and run_id: {}",
            session_id, run_id
        );

        // Get child back for stream handling
        let mut child = self
            .registry
            .take_child(run_id)
            .map_err(|e| anyhow!(e))?
            .ok_or_else(|| anyhow!("No child process available"))?;

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| anyhow!("No stdout available"))?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| anyhow!("No stderr available"))?;

        // Return child to registry
        self.registry
            .return_child(run_id, child)
            .map_err(|e| anyhow!("Failed to return child: {}", e))?;

        // Register session
        let session_info = SessionInfo {
            session_id: session_id.clone(),
            project_path: options.project_path.clone(),
            model: options.model.clone(),
            provider: Some(options.provider.as_str().to_string()),
            streaming: true,
            run_id: Some(run_id),
        };
        self.session_manager.register_session(session_info).await?;

        // Start stream handlers
        self.start_stream_handlers(
            app,
            stdout,
            stderr,
            session_id.clone(),
            run_id,
            options.original_session_id.clone(),
        )
        .await?;

        Ok(YumeCliSpawnResult {
            session_id,
            run_id,
            pid,
            resumed: options.resume_session_id.is_some(),
        })
    }

    async fn start_stream_handlers(
        &self,
        app: AppHandle,
        stdout: tokio::process::ChildStdout,
        stderr: tokio::process::ChildStderr,
        session_id: String,
        run_id: i64,
        original_session_id: Option<String>,
    ) -> Result<()> {
        let registry = self.registry.clone();
        let session_manager = self.session_manager.clone();

        // Spawn stdout handler
        let app_stdout = app.clone();
        let session_id_stdout = session_id.clone();
        let registry_stdout = registry.clone();
        let session_manager_stdout = session_manager.clone();
        let original_session_id_stdout = original_session_id.clone();

        tokio::spawn(async move {
            info!(
                "Starting yume-cli stdout handler for session {}",
                session_id_stdout
            );
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            let mut real_session_id = session_id_stdout.clone();
            let mut session_id_extracted = false;

            while let Ok(Some(line)) = lines.next_line().await {
                info!("yume-cli stdout: {}", line);

                // Store raw output
                if let Err(e) = registry_stdout.append_live_output(run_id, &line) {
                    warn!("Failed to append live output for run {}: {}", run_id, e);
                }

                // Try to extract session ID from init message
                if !session_id_extracted {
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&line) {
                        let is_init = (json["type"] == "system" && json["subtype"] == "init")
                            || json["type"] == "init";

                        if is_init {
                            if let Some(sid) = json["session_id"].as_str() {
                                info!("Extracted yume-cli session ID: {}", sid);
                                real_session_id = sid.to_string();
                                session_id_extracted = true;
                                if let Err(e) = session_manager_stdout
                                    .update_session_id(&session_id_stdout, &real_session_id)
                                    .await
                                {
                                    warn!("Failed to update session ID: {}", e);
                                }

                                // Emit session ID update
                                if let Err(e) = app_stdout.emit(
                                    &format!("claude-session-id-update:{}", session_id_stdout),
                                    &serde_json::json!({
                                        "old_session_id": &session_id_stdout,
                                        "new_session_id": &real_session_id
                                    }),
                                ) {
                                    warn!("Failed to emit session ID update: {}", e);
                                }
                            }
                        }
                    }
                }

                // Emit message on ALL relevant channels for compatibility
                let synthetic_channel = format!("claude-message:{}", session_id_stdout);
                let _ = app_stdout.emit(&synthetic_channel, &line);

                if session_id_extracted && real_session_id != session_id_stdout {
                    let real_channel = format!("claude-message:{}", real_session_id);
                    let _ = app_stdout.emit(&real_channel, &line);
                }

                // CRITICAL: Also emit on original frontend session ID for send_message routing
                // This ensures the frontend receives messages even before session-id-update is processed
                if let Some(ref orig_id) = original_session_id_stdout {
                    if orig_id != &session_id_stdout && (!session_id_extracted || orig_id != &real_session_id) {
                        let orig_channel = format!("claude-message:{}", orig_id);
                        let _ = app_stdout.emit(&orig_channel, &line);
                    }
                }

                // Check for completion
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&line) {
                    let is_complete = json["type"] == "message_stop" || json["type"] == "result";
                    if is_complete {
                        let _ = session_manager_stdout
                            .set_streaming(&session_id_stdout, false)
                            .await;
                        if session_id_extracted {
                            let _ = session_manager_stdout
                                .set_streaming(&real_session_id, false)
                                .await;
                        }

                        let _ = app_stdout
                            .emit(&format!("claude-complete:{}", session_id_stdout), true);
                        if session_id_extracted && real_session_id != session_id_stdout {
                            let _ = app_stdout
                                .emit(&format!("claude-complete:{}", real_session_id), true);
                        }
                    }
                }

                // Emit raw output
                let _ = app_stdout.emit(&format!("claude-output:{}", real_session_id), &line);
            }

            info!(
                "yume-cli stdout handler complete for session {}",
                session_id_stdout
            );
        });

        // Spawn stderr handler
        let app_stderr = app.clone();
        let session_id_stderr = session_id.clone();

        tokio::spawn(async move {
            info!(
                "Starting yume-cli stderr handler for session {}",
                session_id_stderr
            );
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();

            while let Ok(Some(line)) = lines.next_line().await {
                warn!("yume-cli stderr: {}", line);
                let _ = app_stderr.emit(&format!("claude-error:{}", session_id_stderr), &line);
            }
        });

        // Spawn process completion handler
        let app_complete = app.clone();
        let session_id_complete = session_id.clone();
        let registry_complete = registry.clone();
        let session_manager_complete = session_manager.clone();

        tokio::spawn(async move {
            loop {
                tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

                match registry_complete.is_process_running(run_id).await {
                    Ok(false) => {
                        info!("yume-cli process {} has completed", run_id);
                        let _ = session_manager_complete
                            .set_streaming(&session_id_complete, false)
                            .await;
                        let _ = app_complete
                            .emit(&format!("claude-complete:{}", session_id_complete), true);
                        break;
                    }
                    Ok(true) => {}
                    Err(e) => {
                        error!("Error checking yume-cli process status: {}", e);
                        break;
                    }
                }
            }
        });

        Ok(())
    }
}
