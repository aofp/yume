// Background Agents - Async agent execution with queue management
// Manages spawning, monitoring, and cleanup of background agent processes

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex, RwLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::Emitter;
use tracing::{error, info, warn};

/// Maximum concurrent background agents
pub const MAX_CONCURRENT_AGENTS: usize = 4;

/// Agent timeout in seconds (10 minutes)
pub const AGENT_TIMEOUT_SECS: u64 = 600;

/// Agent status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AgentStatus {
    Queued,
    Running,
    Completed,
    Failed,
    Cancelled,
}

/// Agent type (maps to yume core agents)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AgentType {
    Architect,
    Explorer,
    Implementer,
    Guardian,
    Specialist,
    Custom(String),
}

impl AgentType {
    pub fn as_str(&self) -> &str {
        match self {
            AgentType::Architect => "yume-architect",
            AgentType::Explorer => "yume-explorer",
            AgentType::Implementer => "yume-implementer",
            AgentType::Guardian => "yume-guardian",
            AgentType::Specialist => "yume-specialist",
            AgentType::Custom(name) => name.as_str(),
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "yume-architect" | "architect" => AgentType::Architect,
            "yume-explorer" | "explorer" => AgentType::Explorer,
            "yume-implementer" | "implementer" => AgentType::Implementer,
            "yume-guardian" | "guardian" => AgentType::Guardian,
            "yume-specialist" | "specialist" => AgentType::Specialist,
            other => AgentType::Custom(other.to_string()),
        }
    }
}

/// Progress information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentProgress {
    pub turn_count: u32,
    pub current_action: String,
    pub last_update: u64, // Unix timestamp
    pub tokens_used: u32,
}

impl Default for AgentProgress {
    fn default() -> Self {
        Self {
            turn_count: 0,
            current_action: "starting".to_string(),
            last_update: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
            tokens_used: 0,
        }
    }
}

/// Background agent instance
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackgroundAgent {
    pub id: String,
    pub agent_type: AgentType,
    pub prompt: String,
    pub cwd: String,
    pub model: String,
    pub status: AgentStatus,
    pub progress: AgentProgress,
    pub git_branch: Option<String>,
    pub output_file: Option<String>,
    pub created_at: u64,
    pub started_at: Option<u64>,
    pub completed_at: Option<u64>,
    pub error_message: Option<String>,
    #[serde(skip)]
    pub process_id: Option<u32>,
}

impl BackgroundAgent {
    pub fn new(
        agent_type: AgentType,
        prompt: String,
        cwd: String,
        model: String,
    ) -> Self {
        let id = generate_agent_id();
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        Self {
            id,
            agent_type,
            prompt,
            cwd,
            model,
            status: AgentStatus::Queued,
            progress: AgentProgress::default(),
            git_branch: None,
            output_file: None,
            created_at: now,
            started_at: None,
            completed_at: None,
            error_message: None,
            process_id: None,
        }
    }
}

/// Generate unique agent ID
fn generate_agent_id() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    format!("agent-{}-{:04x}", now.as_millis(), rand::random::<u16>())
}

/// Random number for ID generation
mod rand {
    use std::time::{SystemTime, UNIX_EPOCH};

    static mut SEED: u64 = 0;

    pub fn random<T: From<u16>>() -> T {
        unsafe {
            SEED = SEED.wrapping_add(
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_nanos() as u64
            );
            SEED = SEED.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            T::from((SEED >> 33) as u16)
        }
    }
}

/// Running process info
struct RunningProcess {
    child: Child,
    started_at: Instant,
}

/// Agent Queue Manager
/// Thread-safe manager for background agent lifecycle
pub struct AgentQueueManager {
    /// All agents (queued, running, completed)
    agents: RwLock<HashMap<String, BackgroundAgent>>,
    /// Currently running processes
    running_processes: Mutex<HashMap<String, RunningProcess>>,
    /// Output directory for agent sessions
    output_dir: PathBuf,
    /// App handle for emitting events
    app_handle: Option<Arc<Mutex<Option<tauri::AppHandle>>>>,
}

impl AgentQueueManager {
    pub fn new() -> Self {
        let output_dir = dirs::data_dir()
            .or_else(dirs::home_dir)
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".yume")
            .join("agent-output");

        // Create output directory if it doesn't exist
        if let Err(e) = std::fs::create_dir_all(&output_dir) {
            warn!("Failed to create agent output directory: {}", e);
        }

        Self {
            agents: RwLock::new(HashMap::new()),
            running_processes: Mutex::new(HashMap::new()),
            output_dir,
            app_handle: Some(Arc::new(Mutex::new(None))),
        }
    }

    /// Set app handle for event emission
    pub fn set_app_handle(&self, handle: tauri::AppHandle) {
        if let Some(ref app_handle_mutex) = self.app_handle {
            if let Ok(mut guard) = app_handle_mutex.lock() {
                *guard = Some(handle);
            }
        }
    }

    /// Emit agent status change event
    fn emit_status_change(&self, agent: &BackgroundAgent) {
        if let Some(ref app_handle_mutex) = self.app_handle {
            if let Ok(guard) = app_handle_mutex.lock() {
                if let Some(ref app) = *guard {
                    let _ = app.emit("background-agent-status", agent.clone());
                }
            }
        }
    }

    /// Queue a new background agent
    pub fn queue_agent(&self, mut agent: BackgroundAgent) -> Result<String, String> {
        let id = agent.id.clone();

        // Set output file path
        let output_file = self.output_dir.join(format!("{}.json", &id));
        agent.output_file = Some(output_file.to_string_lossy().to_string());

        // Add to agents map and get clone for emission
        let agent_to_emit = {
            let mut agents = self.agents.write().map_err(|e| e.to_string())?;
            agents.insert(id.clone(), agent.clone());
            agent
        };

        // Emit event after releasing lock
        self.emit_status_change(&agent_to_emit);

        info!("Queued background agent: {}", id);
        Ok(id)
    }

    /// Get running agent count
    pub fn get_running_count(&self) -> usize {
        self.running_processes.lock().map(|p| p.len()).unwrap_or(0)
    }

    /// Get queued agent count
    pub fn get_queued_count(&self) -> usize {
        self.agents
            .read()
            .map(|a| a.values().filter(|a| a.status == AgentStatus::Queued).count())
            .unwrap_or(0)
    }

    /// Get all agents
    pub fn get_all_agents(&self) -> Vec<BackgroundAgent> {
        self.agents
            .read()
            .map(|a| a.values().cloned().collect())
            .unwrap_or_default()
    }

    /// Get agent by ID
    pub fn get_agent(&self, id: &str) -> Option<BackgroundAgent> {
        self.agents
            .read()
            .ok()
            .and_then(|a| a.get(id).cloned())
    }

    /// Update agent progress
    pub fn update_progress(&self, id: &str, progress: AgentProgress) {
        if let Ok(mut agents) = self.agents.write() {
            if let Some(agent) = agents.get_mut(id) {
                agent.progress = progress;
            }
        }
    }

    /// Update agent status
    pub fn update_status(&self, id: &str, status: AgentStatus, error: Option<String>) {
        let agent_to_emit = if let Ok(mut agents) = self.agents.write() {
            if let Some(agent) = agents.get_mut(id) {
                let now = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs();

                agent.status = status.clone();

                match status {
                    AgentStatus::Running => {
                        agent.started_at = Some(now);
                    }
                    AgentStatus::Completed | AgentStatus::Failed | AgentStatus::Cancelled => {
                        agent.completed_at = Some(now);
                        agent.error_message = error;
                    }
                    _ => {}
                }

                Some(agent.clone())
            } else {
                None
            }
        } else {
            None
        };

        // Emit event after releasing lock
        if let Some(agent) = agent_to_emit {
            self.emit_status_change(&agent);
        }
    }

    /// Cancel a running or queued agent
    pub fn cancel_agent(&self, id: &str) -> Result<(), String> {
        // Kill process if running
        if let Ok(mut processes) = self.running_processes.lock() {
            if let Some(mut process) = processes.remove(id) {
                let _ = process.child.kill();
                info!("Killed background agent process: {}", id);
            }
        }

        // Update status
        self.update_status(id, AgentStatus::Cancelled, Some("Cancelled by user".to_string()));

        Ok(())
    }

    /// Remove a completed/failed/cancelled agent
    pub fn remove_agent(&self, id: &str) -> Result<(), String> {
        // Don't remove running agents
        if let Some(agent) = self.get_agent(id) {
            if agent.status == AgentStatus::Running {
                return Err("Cannot remove running agent".to_string());
            }
        }

        // Remove from map
        if let Ok(mut agents) = self.agents.write() {
            agents.remove(id);
        }

        // Clean up output file
        let output_file = self.output_dir.join(format!("{}.json", id));
        let _ = std::fs::remove_file(output_file);

        info!("Removed background agent: {}", id);
        Ok(())
    }

    /// Start the next queued agent if capacity available
    ///
    /// RACE CONDITION FIX: Previously had a TOCTOU bug where:
    /// 1. Thread A checks running_count=3, finds agent-1, releases lock
    /// 2. Thread B checks running_count=3, finds agent-1, releases lock
    /// 3. Both start agent-1, exceeding MAX_CONCURRENT_AGENTS
    /// Now we atomically claim the agent by setting status=Running inside write lock.
    pub fn try_start_next(&self, yume_cli_path: &str) -> Option<String> {
        // Atomically find and claim next agent (prevents double-start race)
        let (agent_id, agent_data) = {
            let mut agents = self.agents.write().ok()?;
            let running_count = self.get_running_count();

            // Check capacity inside lock
            if running_count >= MAX_CONCURRENT_AGENTS {
                return None;
            }

            // Find next queued agent and atomically claim it
            let next = agents
                .values_mut()
                .filter(|a| a.status == AgentStatus::Queued)
                .min_by_key(|a| a.created_at)?;

            let id = next.id.clone();
            let data = next.clone();

            // Atomically mark as "claimed" to prevent other threads from starting it
            // We use Running status here - if start fails, we'll set it to Failed
            next.status = AgentStatus::Running;
            next.started_at = Some(
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs()
            );

            (id, data)
        }; // Write lock released here

        // Now start the agent (lock released, won't block other operations)
        if let Err(e) = self.start_agent_internal(&agent_id, yume_cli_path, &agent_data) {
            error!("Failed to start agent {}: {}", agent_id, e);
            self.update_status(&agent_id, AgentStatus::Failed, Some(e));
            return None;
        }

        Some(agent_id)
    }

    /// Internal helper: actually spawn the agent process (after it's been claimed)
    fn start_agent_internal(&self, id: &str, yume_cli_path: &str, agent: &BackgroundAgent) -> Result<(), String> {
        // Build command
        let mut cmd = Command::new(yume_cli_path);
        cmd.arg("--provider").arg("anthropic")
            .arg("--model").arg(&agent.model)
            .arg("--cwd").arg(&agent.cwd)
            .arg("--session-id").arg(&agent.id)
            .arg("--prompt").arg(&agent.prompt)
            .arg("--permission-mode").arg("auto");

        // Add agent type as system prompt context
        cmd.arg("--agent-type").arg(agent.agent_type.as_str());

        // Set output file
        if let Some(ref output_file) = agent.output_file {
            cmd.arg("--output-file").arg(output_file);
        }

        // Add async flag for background mode
        cmd.arg("--async");

        // Set git branch if configured
        if let Some(ref branch) = agent.git_branch {
            cmd.arg("--git-branch").arg(branch);
        }

        // Configure stdio
        cmd.stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        // Spawn process
        let child = cmd.spawn().map_err(|e| format!("Failed to spawn: {}", e))?;
        let pid = child.id();

        // Track process
        if let Ok(mut processes) = self.running_processes.lock() {
            processes.insert(id.to_string(), RunningProcess {
                child,
                started_at: Instant::now(),
            });
        }

        // Update agent with PID and emit event
        let agent_to_emit = if let Ok(mut agents) = self.agents.write() {
            if let Some(agent) = agents.get_mut(id) {
                agent.process_id = Some(pid);
                Some(agent.clone())
            } else {
                None
            }
        } else {
            None
        };

        if let Some(agent) = agent_to_emit {
            self.emit_status_change(&agent);
        }

        info!("Started background agent {} (PID: {})", id, pid);
        Ok(())
    }

    /// Check running agents for completion/timeout
    pub fn check_running_agents(&self) {
        let mut completed_ids = Vec::new();
        let mut timed_out_ids = Vec::new();

        // Check each running process
        if let Ok(mut processes) = self.running_processes.lock() {
            let ids: Vec<String> = processes.keys().cloned().collect();

            for id in ids {
                if let Some(process) = processes.get_mut(&id) {
                    // Check if process has exited
                    match process.child.try_wait() {
                        Ok(Some(status)) => {
                            if status.success() {
                                completed_ids.push((id, None));
                            } else {
                                completed_ids.push((id, Some(format!("Exit code: {:?}", status.code()))));
                            }
                        }
                        Ok(None) => {
                            // Still running - check timeout
                            if process.started_at.elapsed() > Duration::from_secs(AGENT_TIMEOUT_SECS) {
                                timed_out_ids.push(id);
                            }
                        }
                        Err(e) => {
                            completed_ids.push((id, Some(format!("Process error: {}", e))));
                        }
                    }
                }
            }

            // Remove completed processes
            for (id, _) in &completed_ids {
                processes.remove(id);
            }

            // Kill and remove timed out processes
            for id in &timed_out_ids {
                if let Some(mut process) = processes.remove(id) {
                    let _ = process.child.kill();
                }
            }
        }

        // Update statuses
        for (id, error) in completed_ids {
            let status = if error.is_some() {
                AgentStatus::Failed
            } else {
                AgentStatus::Completed
            };
            self.update_status(&id, status, error);
        }

        for id in timed_out_ids {
            self.update_status(
                &id,
                AgentStatus::Failed,
                Some("Agent timed out".to_string()),
            );
        }
    }

    /// Cleanup old completed agents (older than 24 hours)
    pub fn cleanup_old_agents(&self) {
        let cutoff = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
            .saturating_sub(24 * 60 * 60); // 24 hours ago

        let mut to_remove = Vec::new();

        if let Ok(agents) = self.agents.read() {
            for (id, agent) in agents.iter() {
                if let Some(completed_at) = agent.completed_at {
                    if completed_at < cutoff {
                        to_remove.push(id.clone());
                    }
                }
            }
        }

        for id in to_remove {
            let _ = self.remove_agent(&id);
        }
    }

    /// Kill all running agents (for cleanup)
    pub fn kill_all(&self) {
        if let Ok(mut processes) = self.running_processes.lock() {
            for (id, mut process) in processes.drain() {
                let _ = process.child.kill();
                info!("Killed background agent: {}", id);
            }
        }
    }
}

impl Default for AgentQueueManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Global agent manager (thread-safe)
static AGENT_MANAGER: std::sync::OnceLock<Arc<AgentQueueManager>> = std::sync::OnceLock::new();

pub fn get_agent_manager() -> &'static Arc<AgentQueueManager> {
    AGENT_MANAGER.get_or_init(|| Arc::new(AgentQueueManager::new()))
}

// Tauri commands will be in commands/background_agents.rs
