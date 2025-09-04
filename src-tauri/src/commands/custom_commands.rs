/// Custom commands handling for ~/.claude/commands
/// These commands provide storage and retrieval for user-defined slash commands

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

/// Represents a custom Claude command
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomCommand {
    pub id: String,
    pub name: String,
    pub description: String,
    pub template: String,
    pub category: String,
    pub has_params: bool,
    pub enabled: bool,
    pub created_at: u64,
    pub updated_at: u64,
}

/// Load custom commands from ~/.claude/commands directory (global commands)
#[tauri::command]
pub fn load_custom_commands() -> Result<Vec<CustomCommand>, String> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Could not determine home directory".to_string())?;
    
    let commands_dir = home_dir.join(".claude").join("commands");
    load_commands_from_directory(&commands_dir)
}

/// Load project-specific custom commands from a directory's .claude/commands
#[tauri::command]
pub fn load_project_commands(directory: String) -> Result<Vec<CustomCommand>, String> {
    let project_dir = PathBuf::from(directory);
    let commands_dir = project_dir.join(".claude").join("commands");
    load_commands_from_directory(&commands_dir)
}

/// Save a custom command to ~/.claude/commands directory (global commands)
#[tauri::command]
pub fn save_custom_command(command: CustomCommand) -> Result<(), String> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Could not determine home directory".to_string())?;
    
    let commands_dir = home_dir.join(".claude").join("commands");
    save_command_to_directory(&command, &commands_dir)
}

/// Save a custom command to a project's .claude/commands directory
#[tauri::command]
pub fn save_project_command(command: CustomCommand, directory: String) -> Result<(), String> {
    let project_dir = PathBuf::from(directory);
    let commands_dir = project_dir.join(".claude").join("commands");
    save_command_to_directory(&command, &commands_dir)
}

/// Delete a custom command from ~/.claude/commands directory
#[tauri::command]
pub fn delete_custom_command(command_name: String) -> Result<(), String> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Could not determine home directory".to_string())?;
    
    let commands_dir = home_dir.join(".claude").join("commands");
    let file_path = commands_dir.join(format!("{}.md", command_name));
    
    if file_path.exists() {
        fs::remove_file(&file_path)
            .map_err(|e| format!("Failed to delete command file: {}", e))?;
    }
    
    Ok(())
}

/// Delete a project command
#[tauri::command]
pub fn delete_project_command(command_name: String, directory: String) -> Result<(), String> {
    let project_dir = PathBuf::from(directory);
    let commands_dir = project_dir.join(".claude").join("commands");
    let file_path = commands_dir.join(format!("{}.md", command_name));
    
    if file_path.exists() {
        fs::remove_file(&file_path)
            .map_err(|e| format!("Failed to delete command file: {}", e))?;
    }
    
    Ok(())
}

/// Helper function to load commands from a specific directory
fn load_commands_from_directory(commands_dir: &Path) -> Result<Vec<CustomCommand>, String> {
    if !commands_dir.exists() {
        return Ok(Vec::new());
    }
    
    let mut commands = Vec::new();
    
    // Read all .md files in the commands directory
    for entry in fs::read_dir(&commands_dir).map_err(|e| format!("Failed to read commands directory: {}", e))? {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();
        
        if path.extension().and_then(|s| s.to_str()) == Some("md") {
            // Read the file
            let content = fs::read_to_string(&path)
                .map_err(|e| format!("Failed to read command file: {}", e))?;
            
            // Parse the frontmatter
            let (frontmatter, body) = parse_frontmatter(&content);
            
            // Extract metadata from frontmatter or use defaults
            let description = extract_yaml_field(&frontmatter, "description")
                .unwrap_or_else(|| "Custom command".to_string());
            let category = extract_yaml_field(&frontmatter, "category")
                .unwrap_or_else(|| "custom".to_string());
            let has_params = extract_yaml_field(&frontmatter, "argument-hint").is_some() || 
                             body.contains("$ARGUMENTS") || 
                             body.contains("$1");
            let enabled = extract_yaml_field(&frontmatter, "enabled")
                .map(|s| s == "true")
                .unwrap_or(true);
            
            // Get the command name from filename
            let name = path.file_stem()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();
            
            if !name.is_empty() && !body.trim().is_empty() {
                let file_metadata = fs::metadata(&path).ok();
                let created_at = file_metadata.as_ref()
                    .and_then(|m| m.created().ok())
                    .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                let updated_at = file_metadata.as_ref()
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                
                commands.push(CustomCommand {
                    id: format!("custom-cmd-{}", name),
                    name,
                    description,
                    template: body.trim().to_string(),
                    category,
                    has_params,
                    enabled,
                    created_at,
                    updated_at,
                });
            }
        }
    }
    
    Ok(commands)
}

/// Helper function to save a command to a specific directory
fn save_command_to_directory(command: &CustomCommand, commands_dir: &Path) -> Result<(), String> {
    // Create directory if it doesn't exist
    if !commands_dir.exists() {
        fs::create_dir_all(commands_dir)
            .map_err(|e| format!("Failed to create commands directory: {}", e))?;
    }
    
    // Create the markdown content with YAML frontmatter
    let mut frontmatter = String::new();
    frontmatter.push_str("---\n");
    frontmatter.push_str(&format!("description: \"{}\"\n", command.description));
    frontmatter.push_str(&format!("category: {}\n", command.category));
    if command.has_params {
        frontmatter.push_str("argument-hint: \"Enter parameters\"\n");
    }
    frontmatter.push_str(&format!("enabled: {}\n", command.enabled));
    frontmatter.push_str("---\n\n");
    
    let content = format!("{}{}", frontmatter, command.template);
    
    // Write to file (name.md)
    let file_path = commands_dir.join(format!("{}.md", command.name));
    fs::write(&file_path, content)
        .map_err(|e| format!("Failed to write command file: {}", e))?;
    
    Ok(())
}

/// Helper function to parse YAML frontmatter
fn parse_frontmatter(content: &str) -> (String, String) {
    if content.starts_with("---\n") {
        let parts: Vec<&str> = content.splitn(3, "---\n").collect();
        if parts.len() >= 3 {
            return (parts[1].to_string(), parts[2].to_string());
        }
    }
    // No frontmatter, return empty frontmatter and full content as body
    (String::new(), content.to_string())
}

/// Helper function to extract a field from YAML frontmatter
fn extract_yaml_field(yaml: &str, field: &str) -> Option<String> {
    for line in yaml.lines() {
        if line.starts_with(&format!("{}:", field)) {
            let value = line.split(':').nth(1)?.trim();
            // Remove quotes if present
            let value = value.trim_matches('"').trim_matches('\'');
            return Some(value.to_string());
        }
    }
    None
}

/// Load all commands (both localStorage cache and file system)
/// This merges commands from localStorage with those from ~/.claude/commands
#[tauri::command]
pub fn load_all_commands(cached_commands: Option<Vec<CustomCommand>>) -> Result<Vec<CustomCommand>, String> {
    // Load commands from file system
    let file_commands = load_custom_commands()?;
    
    // If we have cached commands, merge them with file commands
    if let Some(mut cached) = cached_commands {
        // Create a set of file command names for deduplication
        let file_names: std::collections::HashSet<String> = file_commands
            .iter()
            .map(|c| c.name.clone())
            .collect();
        
        // Add cached commands that aren't in the file system
        for cmd in cached.iter_mut() {
            if !file_names.contains(&cmd.name) {
                // Mark these as needing to be saved to file system
                cmd.id = format!("cached-{}", cmd.name);
            }
        }
        
        // Combine both lists, file commands take precedence
        let mut all_commands = file_commands;
        for cmd in cached {
            if !file_names.contains(&cmd.name) {
                all_commands.push(cmd);
            }
        }
        
        Ok(all_commands)
    } else {
        Ok(file_commands)
    }
}

/// Migrate commands from localStorage to file system
/// This is called when we detect commands in localStorage that aren't in the file system
#[tauri::command]
pub fn migrate_commands_to_filesystem(commands: Vec<CustomCommand>) -> Result<(), String> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Could not determine home directory".to_string())?;
    
    let commands_dir = home_dir.join(".claude").join("commands");
    
    // Save each command to the file system
    for command in commands {
        // Skip if it's already from the file system
        if !command.id.starts_with("cached-") {
            continue;
        }
        
        save_command_to_directory(&command, &commands_dir)?;
    }
    
    Ok(())
}