use crate::hooks::{HookConfig, HookExecutor, HookInput, HookResponse};
use serde_json::Value;
use tauri::State;

/// Execute a hook with the given configuration and input
#[tauri::command]
pub async fn execute_hook(
    event: String,
    script: String,
    data: Value,
    session_id: String,
    timeout_ms: Option<u64>,
) -> Result<HookResponse, String> {
    let input = HookInput {
        event: event.clone(),
        timestamp: chrono::Utc::now().timestamp(),
        session_id,
        data,
    };

    let timeout = timeout_ms.unwrap_or(5000);

    // Determine script type from content
    let script_type = if script.contains("#!/usr/bin/env python") || script.contains("#!/usr/bin/python") {
        "python"
    } else if script.contains("#!/usr/bin/env node") || script.starts_with("const ") || script.starts_with("let ") {
        "node"
    } else {
        "bash"
    };

    HookExecutor::execute_inline(&script, &input, timeout, script_type).await
}

/// Test a hook script with sample data
#[tauri::command]
pub async fn test_hook(
    script: String,
    event: String,
) -> Result<String, String> {
    // Create sample input based on event type
    let sample_data = match event.as_str() {
        "pre_tool_use" => serde_json::json!({
            "tool": "Edit",
            "input": {
                "file_path": "/example/file.ts",
                "old_string": "const foo = 1",
                "new_string": "const foo = 2"
            }
        }),
        "post_tool_use" => serde_json::json!({
            "tool": "Edit",
            "result": "File edited successfully"
        }),
        "user_prompt_submit" => serde_json::json!({
            "prompt": "Please help me fix this bug"
        }),
        "assistant_response" => serde_json::json!({
            "message": "I'll help you fix that bug",
            "tool_uses": []
        }),
        "context_warning" => serde_json::json!({
            "usage_percentage": 75,
            "tokens_used": 75000,
            "tokens_max": 100000
        }),
        "compaction_trigger" => serde_json::json!({
            "sessionId": "test-session",
            "usage_percentage": 96,
            "action_type": "AutoTrigger"
        }),
        _ => serde_json::json!({
            "event": event.clone()
        }),
    };

    let input = HookInput {
        event: event.clone(),
        timestamp: chrono::Utc::now().timestamp(),
        session_id: "test-session".to_string(),
        data: sample_data,
    };

    // Determine script type
    let script_type = if script.contains("python") {
        "python"
    } else if script.contains("node") || script.contains("javascript") {
        "node"
    } else {
        "bash"
    };

    match HookExecutor::execute_inline(&script, &input, 5000, script_type).await {
        Ok(response) => {
            Ok(format!(
                "Hook executed successfully!\n\nAction: {}\nMessage: {}\nExit Code: {}",
                response.action,
                response.message.unwrap_or_else(|| "No message".to_string()),
                response.exit_code
            ))
        }
        Err(e) => Err(format!("Hook execution failed: {}", e)),
    }
}

/// Get available hook events
#[tauri::command]
pub fn get_hook_events() -> Vec<String> {
    vec![
        "user_prompt_submit".to_string(),
        "pre_tool_use".to_string(),
        "post_tool_use".to_string(),
        "assistant_response".to_string(),
        "session_start".to_string(),
        "session_end".to_string(),
        "context_warning".to_string(),
        "compaction_trigger".to_string(),
        "error".to_string(),
    ]
}

/// Get sample yurucode hook scripts
#[tauri::command]
pub fn get_sample_hooks() -> Vec<(String, String, String)> {
    vec![
        (
            "Shield".to_string(),
            "pre_tool_use".to_string(),
            r#"#!/bin/bash
# Block dangerous commands
input=$(cat)
tool=$(echo "$input" | jq -r '.data.tool')

if [ "$tool" = "Bash" ]; then
    command=$(echo "$input" | jq -r '.data.input.command')
    if echo "$command" | grep -qE "(rm -rf|:(){:|dd if=|mkfs|format)"; then
        echo '{"action":"block","message":"Dangerous command blocked"}'
        exit 2
    fi
fi

echo '{"action":"continue"}'
"#.to_string(),
        ),
        (
            "Context Guard".to_string(),
            "context_warning".to_string(),
            r#"#!/usr/bin/env python3
import json
import sys

input_data = json.loads(sys.stdin.read())
usage = input_data['data']['usage_percentage']

if usage >= 90:
    response = {
        "action": "block",
        "message": f"Context at {usage}%. Use /compact now"
    }
    print(json.dumps(response))
    sys.exit(2)
elif usage >= 75:
    response = {
        "action": "continue",
        "message": f"Context at {usage}%"
    }
    print(json.dumps(response))
else:
    print('{"action":"continue"}')
"#.to_string(),
        ),
        (
            "Smart Compaction".to_string(),
            "compaction_trigger".to_string(),
            r#"#!/usr/bin/env python3
import json
import sys

input_data = json.loads(sys.stdin.read())
usage = input_data['data']['usage_percentage']
action_type = input_data['data']['action_type']

if action_type == 'AutoTrigger':
    response = {
        "action": "continue",
        "message": f"Auto-compacting at {usage}%"
    }
    print(json.dumps(response))
elif action_type == 'Force':
    response = {
        "action": "continue",
        "message": f"Force-compacting at {usage}%"
    }
    print(json.dumps(response))
else:
    print('{"action":"continue"}')
"#.to_string(),
        ),
        (
            "Prompt Enhancer".to_string(),
            "user_prompt_submit".to_string(),
            r#"#!/usr/bin/env node
const input = JSON.parse(require('fs').readFileSync(0, 'utf-8'));
const prompt = input.data.prompt;

if (prompt.includes('fix') || prompt.includes('debug')) {
    console.log(JSON.stringify({
        action: 'modify',
        message: 'Enhanced for debugging',
        modifications: {
            prompt: prompt + '\n\n[Hook: Provide detailed explanations and verify fixes]'
        }
    }));
} else if (prompt.includes('implement') || prompt.includes('create')) {
    console.log(JSON.stringify({
        action: 'modify',
        message: 'Enhanced for implementation',
        modifications: {
            prompt: prompt + '\n\n[Hook: Follow existing patterns and add error handling]'
        }
    }));
} else {
    console.log(JSON.stringify({ action: 'continue' }));
}
"#.to_string(),
        ),
        (
            "Discussion Enforcer".to_string(),
            "pre_tool_use".to_string(),
            r#"#!/usr/bin/env python3
import json
import sys

input_data = json.loads(sys.stdin.read())
tool = input_data['data']['tool']

if tool in ['Write', 'Edit', 'MultiEdit']:
    response = {
        "action": "block",
        "message": "Discuss changes before implementing"
    }
    print(json.dumps(response))
    sys.exit(2)

print('{"action":"continue"}')
"#.to_string(),
        ),
    ]
}