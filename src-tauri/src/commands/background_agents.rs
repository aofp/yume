// Background Agents Commands - Tauri IPC handlers for background agent operations

use crate::background_agents::{
    get_agent_manager, AgentProgress, AgentStatus, AgentType, BackgroundAgent,
};
use crate::git_manager;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::command;
use tracing::{error, info};

/// Response for agent operations
#[derive(Debug, Serialize)]
pub struct AgentResponse {
    pub success: bool,
    pub agent_id: Option<String>,
    pub error: Option<String>,
}

/// Agent info for frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentInfo {
    pub id: String,
    pub agent_type: String,
    pub prompt: String,
    pub cwd: String,
    pub model: String,
    pub status: String,
    pub progress: AgentProgress,
    pub git_branch: Option<String>,
    pub output_file: Option<String>,
    pub created_at: u64,
    pub started_at: Option<u64>,
    pub completed_at: Option<u64>,
    pub error_message: Option<String>,
}

impl From<BackgroundAgent> for AgentInfo {
    fn from(agent: BackgroundAgent) -> Self {
        Self {
            id: agent.id,
            agent_type: agent.agent_type.as_str().to_string(),
            prompt: agent.prompt,
            cwd: agent.cwd,
            model: agent.model,
            status: match agent.status {
                AgentStatus::Queued => "queued".to_string(),
                AgentStatus::Running => "running".to_string(),
                AgentStatus::Completed => "completed".to_string(),
                AgentStatus::Failed => "failed".to_string(),
                AgentStatus::Cancelled => "cancelled".to_string(),
            },
            progress: agent.progress,
            git_branch: agent.git_branch,
            output_file: agent.output_file,
            created_at: agent.created_at,
            started_at: agent.started_at,
            completed_at: agent.completed_at,
            error_message: agent.error_message,
        }
    }
}

/// Queue a new background agent
#[command]
pub fn queue_background_agent(
    agent_type: String,
    prompt: String,
    cwd: String,
    model: String,
    use_git_branch: bool,
) -> AgentResponse {
    let manager = get_agent_manager();
    let agent_type_enum = AgentType::from_str(&agent_type);

    let mut agent = BackgroundAgent::new(agent_type_enum.clone(), prompt, cwd.clone(), model);

    // Set up git branch if requested
    if use_git_branch {
        let cwd_path = PathBuf::from(&cwd);
        if git_manager::is_git_repo(&cwd_path) {
            let branch_name = git_manager::generate_agent_branch_name(
                agent_type_enum.as_str(),
                &agent.id,
            );
            agent.git_branch = Some(branch_name);
        }
    }

    match manager.queue_agent(agent) {
        Ok(id) => {
            info!("Queued background agent: {}", id);
            AgentResponse {
                success: true,
                agent_id: Some(id),
                error: None,
            }
        }
        Err(e) => {
            error!("Failed to queue agent: {}", e);
            AgentResponse {
                success: false,
                agent_id: None,
                error: Some(e),
            }
        }
    }
}

/// Get all background agents
#[command]
pub fn get_agent_queue() -> Vec<AgentInfo> {
    get_agent_manager()
        .get_all_agents()
        .into_iter()
        .map(AgentInfo::from)
        .collect()
}

/// Get a specific agent by ID
#[command]
pub fn get_background_agent(agent_id: String) -> Option<AgentInfo> {
    get_agent_manager()
        .get_agent(&agent_id)
        .map(AgentInfo::from)
}

/// Cancel a running or queued agent
#[command]
pub fn cancel_background_agent(agent_id: String) -> AgentResponse {
    let manager = get_agent_manager();

    match manager.cancel_agent(&agent_id) {
        Ok(_) => {
            info!("Cancelled agent: {}", agent_id);
            AgentResponse {
                success: true,
                agent_id: Some(agent_id),
                error: None,
            }
        }
        Err(e) => {
            error!("Failed to cancel agent: {}", e);
            AgentResponse {
                success: false,
                agent_id: Some(agent_id),
                error: Some(e),
            }
        }
    }
}

/// Remove a completed/failed/cancelled agent
#[command]
pub fn remove_background_agent(agent_id: String) -> AgentResponse {
    let manager = get_agent_manager();

    // Clean up git branch if exists
    if let Some(agent) = manager.get_agent(&agent_id) {
        if let Some(ref branch) = agent.git_branch {
            let cwd_path = PathBuf::from(&agent.cwd);
            let _ = git_manager::delete_agent_branch(&cwd_path, branch);
        }
    }

    match manager.remove_agent(&agent_id) {
        Ok(_) => {
            info!("Removed agent: {}", agent_id);
            AgentResponse {
                success: true,
                agent_id: Some(agent_id),
                error: None,
            }
        }
        Err(e) => {
            error!("Failed to remove agent: {}", e);
            AgentResponse {
                success: false,
                agent_id: Some(agent_id),
                error: Some(e),
            }
        }
    }
}

/// Get agent output (load session file)
#[command]
pub fn get_agent_output(agent_id: String) -> Result<String, String> {
    let manager = get_agent_manager();

    let agent = manager.get_agent(&agent_id).ok_or("Agent not found")?;
    let output_file = agent.output_file.ok_or("No output file")?;

    std::fs::read_to_string(&output_file)
        .map_err(|e| format!("Failed to read output: {}", e))
}

/// Create a git branch for an agent
#[command]
pub fn create_agent_branch(agent_id: String) -> AgentResponse {
    let manager = get_agent_manager();

    let agent = match manager.get_agent(&agent_id) {
        Some(a) => a,
        None => {
            return AgentResponse {
                success: false,
                agent_id: Some(agent_id),
                error: Some("Agent not found".to_string()),
            }
        }
    };

    let cwd_path = PathBuf::from(&agent.cwd);
    let branch_name = git_manager::generate_agent_branch_name(
        agent.agent_type.as_str(),
        &agent.id,
    );

    match git_manager::create_agent_branch(&cwd_path, &branch_name) {
        Ok(_) => AgentResponse {
            success: true,
            agent_id: Some(agent_id),
            error: None,
        },
        Err(e) => AgentResponse {
            success: false,
            agent_id: Some(agent_id),
            error: Some(e),
        },
    }
}

/// Get diff between agent branch and main branch
#[command]
pub fn get_agent_branch_diff(agent_id: String) -> Result<String, String> {
    let manager = get_agent_manager();

    let agent = manager.get_agent(&agent_id).ok_or("Agent not found")?;
    let branch = agent.git_branch.ok_or("Agent has no git branch")?;
    let cwd_path = PathBuf::from(&agent.cwd);

    let main_branch = git_manager::get_main_branch(&cwd_path)?;
    git_manager::get_branch_diff(&cwd_path, &branch, &main_branch)
}

/// Merge agent branch into main
#[command]
pub fn merge_agent_branch(agent_id: String, commit_message: Option<String>) -> AgentResponse {
    let manager = get_agent_manager();

    let agent = match manager.get_agent(&agent_id) {
        Some(a) => a,
        None => {
            return AgentResponse {
                success: false,
                agent_id: Some(agent_id),
                error: Some("Agent not found".to_string()),
            }
        }
    };

    let branch = match agent.git_branch {
        Some(b) => b,
        None => {
            return AgentResponse {
                success: false,
                agent_id: Some(agent_id),
                error: Some("Agent has no git branch".to_string()),
            }
        }
    };

    let cwd_path = PathBuf::from(&agent.cwd);
    let main_branch = match git_manager::get_main_branch(&cwd_path) {
        Ok(b) => b,
        Err(e) => {
            return AgentResponse {
                success: false,
                agent_id: Some(agent_id),
                error: Some(e),
            }
        }
    };

    let message = commit_message.unwrap_or_else(|| {
        format!("Merge {} agent work ({})", agent.agent_type.as_str(), agent.id)
    });

    match git_manager::merge_agent_branch(&cwd_path, &branch, &main_branch, &message) {
        Ok(_) => {
            // Delete the agent branch after successful merge
            let _ = git_manager::delete_agent_branch(&cwd_path, &branch);
            AgentResponse {
                success: true,
                agent_id: Some(agent_id),
                error: None,
            }
        }
        Err(e) => AgentResponse {
            success: false,
            agent_id: Some(agent_id),
            error: Some(e),
        },
    }
}

/// Delete an agent's git branch
#[command]
pub fn delete_agent_branch(agent_id: String) -> AgentResponse {
    let manager = get_agent_manager();

    let agent = match manager.get_agent(&agent_id) {
        Some(a) => a,
        None => {
            return AgentResponse {
                success: false,
                agent_id: Some(agent_id),
                error: Some("Agent not found".to_string()),
            }
        }
    };

    let branch = match agent.git_branch {
        Some(b) => b,
        None => {
            return AgentResponse {
                success: false,
                agent_id: Some(agent_id),
                error: Some("Agent has no git branch".to_string()),
            }
        }
    };

    let cwd_path = PathBuf::from(&agent.cwd);

    match git_manager::delete_agent_branch(&cwd_path, &branch) {
        Ok(_) => AgentResponse {
            success: true,
            agent_id: Some(agent_id),
            error: None,
        },
        Err(e) => AgentResponse {
            success: false,
            agent_id: Some(agent_id),
            error: Some(e),
        },
    }
}

/// Check if merge would have conflicts
#[command]
pub fn check_agent_merge_conflicts(agent_id: String) -> Result<bool, String> {
    let manager = get_agent_manager();

    let agent = manager.get_agent(&agent_id).ok_or("Agent not found")?;
    let branch = agent.git_branch.ok_or("Agent has no git branch")?;
    let cwd_path = PathBuf::from(&agent.cwd);

    let main_branch = git_manager::get_main_branch(&cwd_path)?;
    git_manager::check_merge_conflicts(&cwd_path, &branch, &main_branch)
}

/// Cleanup old completed agents
#[command]
pub fn cleanup_old_agents() -> u32 {
    let manager = get_agent_manager();
    manager.cleanup_old_agents();

    // Also cleanup old git branches
    // This would require iterating all agent cwds which we don't track globally
    // So we skip this for now

    0
}

/// Update agent progress (called from monitor thread)
#[command]
pub fn update_agent_progress(
    agent_id: String,
    turn_count: u32,
    current_action: String,
    tokens_used: u32,
) {
    let manager = get_agent_manager();
    let progress = AgentProgress {
        turn_count,
        current_action,
        last_update: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs(),
        tokens_used,
    };
    manager.update_progress(&agent_id, progress);
}
