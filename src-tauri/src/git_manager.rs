// Git Manager - Branch operations for background agents
// Provides cross-platform git branch management for isolated agent work

use std::path::Path;
use std::process::{Command, Output};
use tracing::{info, warn};

/// Git branch prefix for agent branches
const AGENT_BRANCH_PREFIX: &str = "yume-async";

/// Git command result
#[derive(Debug)]
pub struct GitResult {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
}

impl From<Output> for GitResult {
    fn from(output: Output) -> Self {
        Self {
            success: output.status.success(),
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        }
    }
}

/// Execute a git command in a directory
fn git_command(args: &[&str], cwd: &Path) -> Result<GitResult, String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|e| format!("Failed to execute git: {}", e))?;

    Ok(GitResult::from(output))
}

/// Check if git is available
pub fn is_git_available() -> bool {
    Command::new("git")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Check if directory is a git repository
pub fn is_git_repo(cwd: &Path) -> bool {
    git_command(&["rev-parse", "--git-dir"], cwd)
        .map(|r| r.success)
        .unwrap_or(false)
}

/// Get the current branch name
pub fn get_current_branch(cwd: &Path) -> Result<String, String> {
    let result = git_command(&["rev-parse", "--abbrev-ref", "HEAD"], cwd)?;
    if result.success {
        Ok(result.stdout.trim().to_string())
    } else {
        Err(result.stderr)
    }
}

/// Get the main/master branch name
pub fn get_main_branch(cwd: &Path) -> Result<String, String> {
    // Try common main branch names
    for name in &["main", "master"] {
        let result = git_command(&["rev-parse", "--verify", name], cwd)?;
        if result.success {
            return Ok(name.to_string());
        }
    }

    // Fall back to current branch's upstream
    let result = git_command(&["rev-parse", "--abbrev-ref", "origin/HEAD"], cwd)?;
    if result.success {
        let branch = result.stdout.trim().replace("origin/", "");
        return Ok(branch);
    }

    Err("Could not determine main branch".to_string())
}

/// Generate agent branch name
pub fn generate_agent_branch_name(agent_type: &str, agent_id: &str) -> String {
    format!("{}-{}-{}", AGENT_BRANCH_PREFIX, agent_type, agent_id)
}

/// Create a new branch for an agent
pub fn create_agent_branch(cwd: &Path, branch_name: &str) -> Result<(), String> {
    // Check for uncommitted changes
    let status = git_command(&["status", "--porcelain"], cwd)?;
    if !status.stdout.is_empty() {
        warn!("Uncommitted changes detected, stashing before branch creation");
        let stash_result = git_command(&["stash", "push", "-m", "yume-agent-auto-stash"], cwd)?;
        if !stash_result.success {
            warn!("Failed to stash changes: {}", stash_result.stderr);
        }
    }

    // Create branch from current HEAD
    let result = git_command(&["checkout", "-b", branch_name], cwd)?;
    if result.success {
        info!("Created agent branch: {}", branch_name);
        Ok(())
    } else {
        Err(format!("Failed to create branch: {}", result.stderr))
    }
}

/// Switch to a branch
pub fn switch_to_branch(cwd: &Path, branch_name: &str) -> Result<(), String> {
    let result = git_command(&["checkout", branch_name], cwd)?;
    if result.success {
        info!("Switched to branch: {}", branch_name);
        Ok(())
    } else {
        Err(format!("Failed to switch branch: {}", result.stderr))
    }
}

/// Get the diff between agent branch and main branch
pub fn get_branch_diff(cwd: &Path, agent_branch: &str, main_branch: &str) -> Result<String, String> {
    let result = git_command(
        &["diff", &format!("{}...{}", main_branch, agent_branch), "--stat"],
        cwd,
    )?;

    if result.success {
        Ok(result.stdout)
    } else {
        Err(result.stderr)
    }
}

/// Get detailed diff (for file changes)
pub fn get_detailed_diff(cwd: &Path, agent_branch: &str, main_branch: &str) -> Result<String, String> {
    let result = git_command(
        &["diff", &format!("{}...{}", main_branch, agent_branch)],
        cwd,
    )?;

    if result.success {
        Ok(result.stdout)
    } else {
        Err(result.stderr)
    }
}

/// Check if merge would have conflicts
pub fn check_merge_conflicts(cwd: &Path, agent_branch: &str, main_branch: &str) -> Result<bool, String> {
    // Save current branch
    let current_branch = get_current_branch(cwd)?;

    // Switch to main branch
    switch_to_branch(cwd, main_branch)?;

    // Try a dry-run merge
    let result = git_command(&["merge", "--no-commit", "--no-ff", agent_branch], cwd);

    // Abort the merge
    let _ = git_command(&["merge", "--abort"], cwd);

    // Switch back to original branch
    let _ = switch_to_branch(cwd, &current_branch);

    match result {
        Ok(r) => Ok(!r.success || r.stderr.contains("CONFLICT")),
        Err(e) => Err(e),
    }
}

/// Merge agent branch into main branch
pub fn merge_agent_branch(
    cwd: &Path,
    agent_branch: &str,
    main_branch: &str,
    commit_message: &str,
) -> Result<(), String> {
    // Save current branch
    let current_branch = get_current_branch(cwd)?;

    // Switch to main branch
    switch_to_branch(cwd, main_branch)?;

    // Merge agent branch
    let result = git_command(&["merge", "--no-ff", "-m", commit_message, agent_branch], cwd)?;

    if result.success {
        info!("Merged {} into {}", agent_branch, main_branch);

        // Switch back if we were on a different branch
        if current_branch != main_branch && current_branch != agent_branch {
            let _ = switch_to_branch(cwd, &current_branch);
        }

        Ok(())
    } else {
        // Abort on failure
        let _ = git_command(&["merge", "--abort"], cwd);
        let _ = switch_to_branch(cwd, &current_branch);
        Err(format!("Merge failed: {}", result.stderr))
    }
}

/// Delete an agent branch
pub fn delete_agent_branch(cwd: &Path, branch_name: &str) -> Result<(), String> {
    // Make sure we're not on the branch we're deleting
    let current_branch = get_current_branch(cwd)?;
    if current_branch == branch_name {
        let main_branch = get_main_branch(cwd)?;
        switch_to_branch(cwd, &main_branch)?;
    }

    // Force delete the branch
    let result = git_command(&["branch", "-D", branch_name], cwd)?;
    if result.success {
        info!("Deleted agent branch: {}", branch_name);
        Ok(())
    } else {
        Err(format!("Failed to delete branch: {}", result.stderr))
    }
}

/// List all agent branches
pub fn list_agent_branches(cwd: &Path) -> Result<Vec<String>, String> {
    let result = git_command(&["branch", "--list", &format!("{}*", AGENT_BRANCH_PREFIX)], cwd)?;

    if result.success {
        Ok(result
            .stdout
            .lines()
            .map(|l| l.trim().trim_start_matches("* ").to_string())
            .filter(|l| !l.is_empty())
            .collect())
    } else {
        Err(result.stderr)
    }
}

/// Clean up old agent branches (merged or orphaned)
pub fn cleanup_old_branches(cwd: &Path) -> Result<usize, String> {
    let agent_branches = list_agent_branches(cwd)?;
    let main_branch = get_main_branch(cwd)?;
    let mut deleted_count = 0;

    for branch in agent_branches {
        // Check if branch is merged into main
        let result = git_command(
            &["branch", "--merged", &main_branch],
            cwd,
        )?;

        if result.stdout.contains(&branch) {
            // Branch is merged, safe to delete
            if delete_agent_branch(cwd, &branch).is_ok() {
                deleted_count += 1;
            }
        }
    }

    info!("Cleaned up {} old agent branches", deleted_count);
    Ok(deleted_count)
}

/// Restore stashed changes (if any)
pub fn restore_stash(cwd: &Path) -> Result<bool, String> {
    // Check if there's a yume stash
    let result = git_command(&["stash", "list"], cwd)?;
    if result.stdout.contains("yume-agent-auto-stash") {
        let pop_result = git_command(&["stash", "pop"], cwd)?;
        if pop_result.success {
            info!("Restored stashed changes");
            return Ok(true);
        } else {
            warn!("Failed to restore stash: {}", pop_result.stderr);
        }
    }
    Ok(false)
}

/// Get files changed in agent branch
pub fn get_changed_files(cwd: &Path, agent_branch: &str, main_branch: &str) -> Result<Vec<String>, String> {
    let result = git_command(
        &["diff", "--name-only", &format!("{}...{}", main_branch, agent_branch)],
        cwd,
    )?;

    if result.success {
        Ok(result
            .stdout
            .lines()
            .map(|l| l.trim().to_string())
            .filter(|l| !l.is_empty())
            .collect())
    } else {
        Err(result.stderr)
    }
}

/// Get commit count in agent branch
pub fn get_commit_count(cwd: &Path, agent_branch: &str, main_branch: &str) -> Result<u32, String> {
    let result = git_command(
        &["rev-list", "--count", &format!("{}..{}", main_branch, agent_branch)],
        cwd,
    )?;

    if result.success {
        result.stdout.trim().parse().map_err(|e| format!("Parse error: {}", e))
    } else {
        Err(result.stderr)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_branch_name() {
        let name = generate_agent_branch_name("architect", "agent-123");
        assert!(name.starts_with("yume-async-"));
        assert!(name.contains("architect"));
        assert!(name.contains("agent-123"));
    }
}
