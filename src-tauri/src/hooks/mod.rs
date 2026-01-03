use serde::{Deserialize, Serialize};
use std::process::{Command, Stdio};
use std::time::Duration;
use std::io::Write;
use tokio::time::timeout;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HookEvent {
    UserPromptSubmit,
    PreToolUse,
    PostToolUse,
    AssistantResponse,
    SessionStart,
    SessionEnd,
    ContextWarning,
    CompactionTrigger,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HookConfig {
    pub event: HookEvent,
    pub enabled: bool,
    pub script: String,
    #[serde(default = "default_timeout")]
    pub timeout_ms: u64,
    #[serde(default)]
    pub blocking: bool,
    pub matcher: Option<String>,
}

fn default_timeout() -> u64 {
    5000 // 5 seconds default
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HookInput {
    pub event: String,
    pub timestamp: i64,
    pub session_id: String,
    pub data: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HookResponse {
    pub action: String, // "continue", "block", "modify"
    pub message: Option<String>,
    pub modifications: Option<serde_json::Value>,
    pub exit_code: i32,
}

impl Default for HookResponse {
    fn default() -> Self {
        Self {
            action: "continue".to_string(),
            message: None,
            modifications: None,
            exit_code: 0,
        }
    }
}

pub struct HookExecutor;

impl HookExecutor {
    /// Execute a hook script with the given input data
    pub async fn execute(
        script_path: &str,
        input: &HookInput,
        timeout_ms: u64,
    ) -> Result<HookResponse, String> {
        // Serialize input to JSON
        let input_json = serde_json::to_string(input)
            .map_err(|e| format!("Failed to serialize input: {}", e))?;

        // Determine script interpreter based on extension
        let (interpreter, args) = Self::get_interpreter(script_path);

        // Create command
        let mut child = Command::new(interpreter)
            .args(args)
            .arg(script_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn hook process: {}", e))?;

        // Write input to stdin
        if let Some(mut stdin) = child.stdin.take() {
            stdin.write_all(input_json.as_bytes())
                .map_err(|e| format!("Failed to write to stdin: {}", e))?;
        }

        // Wait for completion with timeout
        let duration = Duration::from_millis(timeout_ms);
        let output = tokio::task::spawn_blocking(move || child.wait_with_output())
            .await
            .map_err(|e| format!("Failed to wait for process: {}", e))?;

        match timeout(duration, async { output }).await {
            Ok(Ok(output)) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let stderr = String::from_utf8_lossy(&output.stderr);

                // Try to parse JSON response from stdout
                if let Ok(response) = serde_json::from_str::<HookResponse>(&stdout) {
                    Ok(response)
                } else {
                    // Fallback: determine action based on exit code
                    let action = match output.status.code() {
                        Some(0) => "continue",
                        Some(2) => "block",
                        _ => "continue",
                    };

                    Ok(HookResponse {
                        action: action.to_string(),
                        message: if !stderr.is_empty() {
                            Some(stderr.to_string())
                        } else if !stdout.is_empty() {
                            Some(stdout.to_string())
                        } else {
                            None
                        },
                        modifications: None,
                        exit_code: output.status.code().unwrap_or(-1),
                    })
                }
            }
            Ok(Err(e)) => Err(format!("Hook execution failed: {}", e)),
            Err(_) => Err(format!("Hook execution timed out after {}ms", timeout_ms)),
        }
    }

    /// Execute a hook from inline script content
    pub async fn execute_inline(
        script_content: &str,
        input: &HookInput,
        timeout_ms: u64,
        script_type: &str, // "bash", "python", "node"
    ) -> Result<HookResponse, String> {
        // Create a temporary file with the script content
        let temp_dir = std::env::temp_dir();
        let script_extension = match script_type {
            "python" => "py",
            "node" | "javascript" => "js",
            _ => "sh",
        };
        
        let script_path = temp_dir.join(format!(
            "yurucode_hook_{}.{}",
            chrono::Utc::now().timestamp_millis(),
            script_extension
        ));

        // Write script to temp file
        std::fs::write(&script_path, script_content)
            .map_err(|e| format!("Failed to write temp script: {}", e))?;

        // Make executable on Unix
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = std::fs::metadata(&script_path)
                .map_err(|e| format!("Failed to get file metadata: {}", e))?
                .permissions();
            perms.set_mode(0o755);
            std::fs::set_permissions(&script_path, perms)
                .map_err(|e| format!("Failed to set permissions: {}", e))?;
        }

        // Execute the script
        let result = Self::execute(
            script_path.to_str().unwrap_or_default(),
            input,
            timeout_ms,
        ).await;

        // Clean up temp file
        let _ = std::fs::remove_file(script_path);

        result
    }

    /// Get interpreter and args based on script extension
    fn get_interpreter(script_path: &str) -> (&str, Vec<&str>) {
        if script_path.ends_with(".py") {
            ("python3", vec![])
        } else if script_path.ends_with(".js") {
            ("node", vec![])
        } else if script_path.ends_with(".ps1") {
            ("powershell", vec!["-ExecutionPolicy", "Bypass", "-File"])
        } else {
            // Default to bash/sh
            if cfg!(windows) {
                ("cmd", vec!["/C"])
            } else {
                ("bash", vec![])
            }
        }
    }

    /// Check if a tool name matches a hook's matcher pattern
    pub fn matches_tool(tool_name: &str, matcher: &Option<String>) -> bool {
        match matcher {
            Some(pattern) => {
                // Try regex matching
                if let Ok(re) = regex::Regex::new(pattern) {
                    re.is_match(tool_name)
                } else {
                    // Fallback to simple string matching
                    tool_name.contains(pattern)
                }
            }
            None => true, // No matcher means match all
        }
    }
}

/// Load hooks configuration from settings
pub fn load_hooks_config() -> Vec<HookConfig> {
    // For now, return empty vec - will be loaded from localStorage via IPC
    vec![]
}

/// Save hooks configuration to settings
pub fn save_hooks_config(_hooks: &[HookConfig]) -> Result<(), String> {
    // Will be saved to localStorage via IPC
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_hook_executor_basic() {
        let input = HookInput {
            event: "test".to_string(),
            timestamp: 1234567890,
            session_id: "test-session".to_string(),
            data: serde_json::json!({"test": "data"}),
        };

        let script = r#"#!/bin/bash
echo '{"action":"continue","message":"Test passed"}'
exit 0
"#;

        let result = HookExecutor::execute_inline(script, &input, 5000, "bash").await;
        assert!(result.is_ok());
        
        let response = result.unwrap();
        assert_eq!(response.action, "continue");
        assert_eq!(response.exit_code, 0);
    }

    #[test]
    fn test_matches_tool() {
        assert!(HookExecutor::matches_tool("Edit", &None));
        assert!(HookExecutor::matches_tool("Edit", &Some("Edit".to_string())));
        assert!(HookExecutor::matches_tool("Edit", &Some("Edit|Write".to_string())));
        assert!(!HookExecutor::matches_tool("Edit", &Some("Write".to_string())));
    }
}