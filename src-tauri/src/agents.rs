use serde::{Deserialize, Serialize};
use std::fs;
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Agent {
    pub id: Option<i32>,
    pub name: String,
    pub icon: String,
    pub system_prompt: String,
    pub default_task: Option<String>,
    pub model: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize)]
struct DefaultAgents(Vec<Agent>);

// In-memory storage for agents (for simplicity)
use std::sync::Mutex;
use once_cell::sync::Lazy;

static AGENTS: Lazy<Mutex<Vec<Agent>>> = Lazy::new(|| Mutex::new(Vec::new()));

#[tauri::command]
pub async fn list_agents() -> Result<Vec<Agent>, String> {
    Ok(AGENTS.lock().unwrap().clone())
}

#[tauri::command]
pub async fn load_default_agents(app: AppHandle) -> Result<Vec<Agent>, String> {
    // Try to load from default-agents.json in the app's resource directory
    let resource_path = app.path()
        .resource_dir()
        .map_err(|e| format!("Failed to get resource directory: {}", e))?;
    
    let default_agents_path = resource_path.join("default-agents.json");
    
    // If resource file doesn't exist, try project root
    let agents_json = if default_agents_path.exists() {
        fs::read_to_string(&default_agents_path)
            .map_err(|e| format!("Failed to read default agents file: {}", e))?
    } else {
        // Fallback to hardcoded default agents
        r#"[
  {
    "name": "Git Commit Bot",
    "icon": "🔧",
    "model": "sonnet",
    "default_task": "Commit all changes with a descriptive message",
    "system_prompt": "You are a Git commit assistant. Analyze the git diff and status, write a clear commit message following conventional commits format (feat/fix/docs/style/refactor/test/chore), and commit the changes. Always check git status and diff first, then create an appropriate commit message.",
    "created_at": 1735224000000,
    "updated_at": 1735224000000
  },
  {
    "name": "Code Reviewer",
    "icon": "🛡️",
    "model": "opus",
    "default_task": "Review the recent changes for bugs and improvements",
    "system_prompt": "You are a senior code reviewer. Analyze code for bugs, security issues, performance problems, and suggest improvements. Focus on code quality, maintainability, and best practices. Be constructive and specific in your feedback.",
    "created_at": 1735224000000,
    "updated_at": 1735224000000
  },
  {
    "name": "Bug Hunter",
    "icon": "🐛",
    "model": "sonnet",
    "default_task": "Find and fix bugs in the codebase",
    "system_prompt": "You are a debugging specialist. Analyze error messages, stack traces, and code to identify root causes of bugs. Use systematic debugging techniques, add logging where needed, and provide clear fixes with explanations.",
    "created_at": 1735224000000,
    "updated_at": 1735224000000
  },
  {
    "name": "Test Writer",
    "icon": "🧪",
    "model": "sonnet",
    "default_task": "Write comprehensive tests for the code",
    "system_prompt": "You are a test automation expert. Write comprehensive unit tests, integration tests, and edge case tests. Ensure high code coverage and test important functionality. Use the project's existing testing framework and patterns.",
    "created_at": 1735224000000,
    "updated_at": 1735224000000
  },
  {
    "name": "Refactoring Expert",
    "icon": "✨",
    "model": "opus",
    "default_task": "Refactor code for better structure and performance",
    "system_prompt": "You are a refactoring specialist. Identify code smells, duplicate code, and opportunities for improvement. Apply design patterns appropriately, improve naming, extract methods/components, and enhance code organization while maintaining functionality.",
    "created_at": 1735224000000,
    "updated_at": 1735224000000
  }
]"#.to_string()
    };
    
    let mut loaded_agents: Vec<Agent> = serde_json::from_str(&agents_json)
        .map_err(|e| format!("Failed to parse agents JSON: {}", e))?;
    
    // Assign IDs
    for (i, agent) in loaded_agents.iter_mut().enumerate() {
        agent.id = Some((i + 1) as i32);
    }
    
    // Store in memory
    *AGENTS.lock().unwrap() = loaded_agents.clone();
    
    Ok(loaded_agents)
}

#[tauri::command]
pub async fn create_agent(agent: Agent) -> Result<Agent, String> {
    let mut agents = AGENTS.lock().unwrap();
    
    // Assign new ID
    let new_id = agents.len() as i32 + 1;
    let mut new_agent = agent;
    new_agent.id = Some(new_id);
    
    agents.push(new_agent.clone());
    
    Ok(new_agent)
}

#[tauri::command]
pub async fn delete_agent(id: i32) -> Result<(), String> {
    let mut agents = AGENTS.lock().unwrap();
    agents.retain(|a| a.id != Some(id));
    Ok(())
}