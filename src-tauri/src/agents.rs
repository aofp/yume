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
        // Fallback to hardcoded default agents - The 5 Yume Core Agents
        r#"[
  {
    "name": "architect",
    "icon": "🧠",
    "model": "opus",
    "default_task": "plan implementation",
    "system_prompt": "architect agent. plan, design, decompose. think first. output: steps, dependencies, risks. use TodoWrite.",
    "created_at": 1735224000000,
    "updated_at": 1735224000000
  },
  {
    "name": "explorer",
    "icon": "🔍",
    "model": "sonnet",
    "default_task": "gather context",
    "system_prompt": "explorer agent. find, read, understand. use Glob, Grep, Read. output: paths, snippets, structure. no edits.",
    "created_at": 1735224000000,
    "updated_at": 1735224000000
  },
  {
    "name": "implementer",
    "icon": "⚡",
    "model": "opus",
    "default_task": "write code",
    "system_prompt": "implementer agent. code, edit, build. read before edit. small changes. output: working code, minimal diff.",
    "created_at": 1735224000000,
    "updated_at": 1735224000000
  },
  {
    "name": "guardian",
    "icon": "🛡️",
    "model": "opus",
    "default_task": "review code",
    "system_prompt": "guardian agent. review, audit, verify. check bugs, security, performance. output: issues, severity, fixes.",
    "created_at": 1735224000000,
    "updated_at": 1735224000000
  },
  {
    "name": "specialist",
    "icon": "🎯",
    "model": "sonnet",
    "default_task": "domain task",
    "system_prompt": "specialist agent. adapt to domain: test, docs, devops, data. output: domain artifacts.",
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