// Plugin management commands for Yume
// Supports Claude Code plugin format: https://github.com/anthropics/claude-code/tree/main/plugins

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

use crate::app::{
    APP_ID,
    PLUGIN_ID,
    PLUGIN_DIR_NAME,
    VSCODE_DIR_NAME,
    VSCODE_EXTENSION_ID,
    VSCODE_EXTENSION_DIR_PREFIX,
};

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PluginManifest {
    pub name: String,
    pub version: String,
    pub description: String,
    pub author_name: Option<String>,
    pub author_email: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PluginCommand {
    pub name: String,
    pub description: String,
    pub file_path: String,
    pub plugin_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PluginAgent {
    pub name: String,
    pub model: String,
    pub description: String,
    pub file_path: String,
    pub plugin_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PluginHook {
    pub name: String,
    pub event: String,
    pub description: String,
    pub file_path: String,
    pub plugin_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PluginSkill {
    pub name: String,
    pub description: String,
    pub file_path: String,
    pub plugin_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PluginComponents {
    pub commands: Vec<PluginCommand>,
    pub agents: Vec<PluginAgent>,
    pub hooks: Vec<PluginHook>,
    pub skills: Vec<PluginSkill>,
    pub mcp_servers: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct InstalledPlugin {
    pub id: String,
    pub manifest: PluginManifest,
    pub installed_at: u64,
    pub enabled: bool,
    pub path: String,
    pub components: PluginComponents,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PluginRegistry {
    pub version: String,
    pub plugins: std::collections::HashMap<String, InstalledPlugin>,
    pub last_updated: u64,
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Get the plugins directory path based on platform
fn get_plugins_dir() -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    {
        if let Some(app_data) = dirs::data_dir() {
            return Ok(app_data.join(APP_ID).join("plugins"));
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Some(app_support) = dirs::data_dir() {
            return Ok(app_support.join(APP_ID).join("plugins"));
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Some(config) = dirs::config_dir() {
            return Ok(config.join(APP_ID).join("plugins"));
        }
    }

    Err("Could not determine plugins directory".to_string())
}

/// Get the Claude config directory (~/.claude/)
fn get_claude_dir() -> Result<PathBuf, String> {
    dirs::home_dir()
        .map(|h| h.join(".claude"))
        .ok_or_else(|| "Could not determine home directory".to_string())
}

/// Get current unix timestamp
fn now_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Load the plugin registry from disk
fn load_registry() -> Result<PluginRegistry, String> {
    let plugins_dir = get_plugins_dir()?;
    let registry_path = plugins_dir.join("plugin-registry.json");

    if !registry_path.exists() {
        return Ok(PluginRegistry {
            version: "1.0".to_string(),
            plugins: std::collections::HashMap::new(),
            last_updated: now_timestamp(),
        });
    }

    let content = fs::read_to_string(&registry_path)
        .map_err(|e| format!("Failed to read registry: {}", e))?;

    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse registry: {}", e))
}

/// Save the plugin registry to disk
fn save_registry(registry: &PluginRegistry) -> Result<(), String> {
    let plugins_dir = get_plugins_dir()?;
    fs::create_dir_all(&plugins_dir)
        .map_err(|e| format!("Failed to create plugins directory: {}", e))?;

    let registry_path = plugins_dir.join("plugin-registry.json");
    let content = serde_json::to_string_pretty(registry)
        .map_err(|e| format!("Failed to serialize registry: {}", e))?;

    fs::write(&registry_path, content)
        .map_err(|e| format!("Failed to write registry: {}", e))
}

/// Parse plugin.json manifest from a plugin directory
fn parse_plugin_manifest(plugin_dir: &Path) -> Result<PluginManifest, String> {
    let manifest_path = plugin_dir.join(".claude-plugin").join("plugin.json");

    if !manifest_path.exists() {
        return Err("Plugin manifest not found at .claude-plugin/plugin.json".to_string());
    }

    let content = fs::read_to_string(&manifest_path)
        .map_err(|e| format!("Failed to read manifest: {}", e))?;

    let json: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse manifest JSON: {}", e))?;

    let name = json.get("name")
        .and_then(|v| v.as_str())
        .ok_or("Missing 'name' in plugin.json")?
        .to_string();

    let version = json.get("version")
        .and_then(|v| v.as_str())
        .unwrap_or("1.0.0")
        .to_string();

    let description = json.get("description")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let (author_name, author_email) = if let Some(author) = json.get("author") {
        if let Some(author_obj) = author.as_object() {
            (
                author_obj.get("name").and_then(|v| v.as_str()).map(|s| s.to_string()),
                author_obj.get("email").and_then(|v| v.as_str()).map(|s| s.to_string()),
            )
        } else if let Some(author_str) = author.as_str() {
            (Some(author_str.to_string()), None)
        } else {
            (None, None)
        }
    } else {
        (None, None)
    };

    Ok(PluginManifest {
        name,
        version,
        description,
        author_name,
        author_email,
    })
}

/// Parse YAML frontmatter from a markdown file
fn parse_md_frontmatter(content: &str) -> Option<serde_json::Value> {
    let content = content.trim();
    if !content.starts_with("---") {
        return None;
    }

    let rest = &content[3..];
    let end_idx = rest.find("---")?;
    let yaml_content = &rest[..end_idx].trim();

    // Simple YAML parsing for common fields
    let mut map = serde_json::Map::new();
    for line in yaml_content.lines() {
        if let Some(idx) = line.find(':') {
            let key = line[..idx].trim().to_string();
            let value = line[idx + 1..].trim();
            // Remove quotes if present
            let value = value.trim_matches('"').trim_matches('\'');
            map.insert(key, serde_json::Value::String(value.to_string()));
        }
    }

    Some(serde_json::Value::Object(map))
}

/// Discover all components in a plugin directory
fn discover_components(plugin_dir: &Path, plugin_id: &str) -> Result<PluginComponents, String> {
    let mut components = PluginComponents {
        commands: Vec::new(),
        agents: Vec::new(),
        hooks: Vec::new(),
        skills: Vec::new(),
        mcp_servers: None,
    };

    println!("[plugins] discover_components: plugin_dir={}", plugin_dir.display());

    // Scan commands directory
    let commands_dir = plugin_dir.join("commands");
    println!("[plugins] commands_dir={}, exists={}", commands_dir.display(), commands_dir.exists());
    if commands_dir.exists() && commands_dir.is_dir() {
        if let Ok(entries) = fs::read_dir(&commands_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                println!("[plugins] found file: {}", path.display());
                if path.extension().map_or(false, |e| e == "md") {
                    if let Ok(content) = fs::read_to_string(&path) {
                        let name = path.file_stem()
                            .map(|s| s.to_string_lossy().to_string())
                            .unwrap_or_default();

                        let description = parse_md_frontmatter(&content)
                            .and_then(|fm| fm.get("description").and_then(|v| v.as_str()).map(|s| s.to_string()))
                            .unwrap_or_default();

                        println!("[plugins] adding command: name={}, desc={}", name, description);
                        components.commands.push(PluginCommand {
                            name,
                            description,
                            file_path: path.to_string_lossy().to_string(),
                            plugin_id: plugin_id.to_string(),
                        });
                    }
                }
            }
        }
    } else {
        println!("[plugins] commands_dir does not exist or is not a directory");
    }

    // Scan agents directory
    let agents_dir = plugin_dir.join("agents");
    if agents_dir.exists() && agents_dir.is_dir() {
        if let Ok(entries) = fs::read_dir(&agents_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().map_or(false, |e| e == "md") {
                    if let Ok(content) = fs::read_to_string(&path) {
                        let name = path.file_stem()
                            .map(|s| s.to_string_lossy().to_string())
                            .unwrap_or_default();

                        let frontmatter = parse_md_frontmatter(&content);
                        let model = frontmatter.as_ref()
                            .and_then(|fm| fm.get("model").and_then(|v| v.as_str()))
                            .unwrap_or("sonnet")
                            .to_string();
                        let description = frontmatter.as_ref()
                            .and_then(|fm| fm.get("description").and_then(|v| v.as_str()))
                            .unwrap_or("")
                            .to_string();

                        components.agents.push(PluginAgent {
                            name,
                            model,
                            description,
                            file_path: path.to_string_lossy().to_string(),
                            plugin_id: plugin_id.to_string(),
                        });
                    }
                }
            }
        }
    }

    // Scan hooks directory
    let hooks_dir = plugin_dir.join("hooks");
    if hooks_dir.exists() && hooks_dir.is_dir() {
        if let Ok(entries) = fs::read_dir(&hooks_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().map_or(false, |e| e == "md") {
                    if let Ok(content) = fs::read_to_string(&path) {
                        let name = path.file_stem()
                            .map(|s| s.to_string_lossy().to_string())
                            .unwrap_or_default();

                        let frontmatter = parse_md_frontmatter(&content);
                        let event = frontmatter.as_ref()
                            .and_then(|fm| fm.get("event").and_then(|v| v.as_str()))
                            .or_else(|| frontmatter.as_ref().and_then(|fm| fm.get("hook_type").and_then(|v| v.as_str())))
                            .unwrap_or("PreToolUse")
                            .to_string();
                        let description = frontmatter.as_ref()
                            .and_then(|fm| fm.get("description").and_then(|v| v.as_str()))
                            .unwrap_or("")
                            .to_string();

                        components.hooks.push(PluginHook {
                            name,
                            event,
                            description,
                            file_path: path.to_string_lossy().to_string(),
                            plugin_id: plugin_id.to_string(),
                        });
                    }
                }
            }
        }
    }

    // Scan skills directory
    let skills_dir = plugin_dir.join("skills");
    if skills_dir.exists() && skills_dir.is_dir() {
        if let Ok(entries) = fs::read_dir(&skills_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().map_or(false, |e| e == "md") {
                    if let Ok(content) = fs::read_to_string(&path) {
                        let name = path.file_stem()
                            .map(|s| s.to_string_lossy().to_string())
                            .unwrap_or_default();

                        let description = parse_md_frontmatter(&content)
                            .and_then(|fm| fm.get("description").and_then(|v| v.as_str()).map(|s| s.to_string()))
                            .unwrap_or_default();

                        components.skills.push(PluginSkill {
                            name,
                            description,
                            file_path: path.to_string_lossy().to_string(),
                            plugin_id: plugin_id.to_string(),
                        });
                    }
                }
            }
        }
    }

    // Check for .mcp.json
    let mcp_path = plugin_dir.join(".mcp.json");
    if mcp_path.exists() {
        if let Ok(content) = fs::read_to_string(&mcp_path) {
            if let Ok(mcp_config) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(servers) = mcp_config.get("mcpServers") {
                    if servers.as_object().map_or(false, |o| !o.is_empty()) {
                        components.mcp_servers = Some(servers.clone());
                    }
                }
            }
        }
    }

    Ok(components)
}

/// Sync plugin commands to ~/.claude/commands/
fn sync_plugin_commands(plugin: &InstalledPlugin, enabled: bool) -> Result<(), String> {
    let claude_dir = get_claude_dir()?;
    let commands_dir = claude_dir.join("commands");

    if enabled {
        fs::create_dir_all(&commands_dir)
            .map_err(|e| format!("Failed to create commands directory: {}", e))?;
    }

    for cmd in &plugin.components.commands {
        // Create namespaced version (plugin--command.md)
        let dest_name = format!("{}--{}.md", plugin.id, cmd.name);
        let dest_path = commands_dir.join(&dest_name);

        // Also create shortcut without prefix (command.md) for core plugin
        let shortcut_name = format!("{}.md", cmd.name);
        let shortcut_path = commands_dir.join(&shortcut_name);

        if enabled {
            // Copy command file (namespaced version)
            fs::copy(&cmd.file_path, &dest_path)
                .map_err(|e| format!("Failed to copy command {}: {}", cmd.name, e))?;

            // For core plugin, also create shortcut version
            if plugin.id == PLUGIN_ID {
                fs::copy(&cmd.file_path, &shortcut_path)
                    .map_err(|e| format!("Failed to copy command shortcut {}: {}", cmd.name, e))?;
            }
        } else {
            // Remove command file
            if dest_path.exists() {
                let _ = fs::remove_file(&dest_path);
            }
            // Also remove shortcut for core plugin
            if plugin.id == PLUGIN_ID && shortcut_path.exists() {
                let _ = fs::remove_file(&shortcut_path);
            }
        }
    }

    Ok(())
}

/// Sync plugin agents to ~/.claude/agents/
/// If model is provided, replaces the model in the agent frontmatter
fn sync_plugin_agents(plugin: &InstalledPlugin, enabled: bool, model: Option<&str>) -> Result<(), String> {
    let claude_dir = get_claude_dir()?;
    let agents_dir = claude_dir.join("agents");

    if enabled {
        fs::create_dir_all(&agents_dir)
            .map_err(|e| format!("Failed to create agents directory: {}", e))?;
    }

    for agent in &plugin.components.agents {
        let dest_name = format!("{}--{}.md", plugin.id, agent.name);
        let dest_path = agents_dir.join(&dest_name);

        if enabled {
            if let Some(new_model) = model {
                // Read the file and replace the model in frontmatter
                let content = fs::read_to_string(&agent.file_path)
                    .map_err(|e| format!("Failed to read agent {}: {}", agent.name, e))?;

                // Replace model in frontmatter using regex-like approach
                let updated_content = replace_model_in_frontmatter(&content, new_model);

                fs::write(&dest_path, updated_content)
                    .map_err(|e| format!("Failed to write agent {}: {}", agent.name, e))?;
            } else {
                // Just copy the file as-is
                fs::copy(&agent.file_path, &dest_path)
                    .map_err(|e| format!("Failed to copy agent {}: {}", agent.name, e))?;
            }
        } else {
            // Remove agent file
            if dest_path.exists() {
                let _ = fs::remove_file(&dest_path);
            }
        }
    }

    Ok(())
}

/// Replace the model field in YAML frontmatter
fn replace_model_in_frontmatter(content: &str, new_model: &str) -> String {
    let content = content.trim();
    if !content.starts_with("---") {
        return content.to_string();
    }

    // Find the end of frontmatter
    let rest = &content[3..];
    if let Some(end_idx) = rest.find("---") {
        let frontmatter = &rest[..end_idx];
        let body = &rest[end_idx..];

        // Replace model line in frontmatter
        let mut new_frontmatter = String::new();
        for line in frontmatter.lines() {
            if line.trim().starts_with("model:") {
                new_frontmatter.push_str(&format!("model: {}", new_model));
            } else {
                new_frontmatter.push_str(line);
            }
            new_frontmatter.push('\n');
        }

        format!("---{}{}", new_frontmatter.trim_end(), body)
    } else {
        content.to_string()
    }
}

/// Sync plugin skills to ~/.claude/skills/
fn sync_plugin_skills(plugin: &InstalledPlugin, enabled: bool) -> Result<(), String> {
    let claude_dir = get_claude_dir()?;
    let skills_dir = claude_dir.join("skills");

    if enabled {
        fs::create_dir_all(&skills_dir)
            .map_err(|e| format!("Failed to create skills directory: {}", e))?;
    }

    for skill in &plugin.components.skills {
        let dest_name = format!("{}--{}.md", plugin.id, skill.name);
        let dest_path = skills_dir.join(&dest_name);

        if enabled {
            // Copy skill file
            fs::copy(&skill.file_path, &dest_path)
                .map_err(|e| format!("Failed to copy skill {}: {}", skill.name, e))?;
        } else {
            // Remove skill file
            if dest_path.exists() {
                let _ = fs::remove_file(&dest_path);
            }
        }
    }

    Ok(())
}

// ============================================================================
// Tauri Commands
// ============================================================================

/// List all installed plugins
#[tauri::command]
pub fn plugin_list() -> Result<Vec<InstalledPlugin>, String> {
    let registry = load_registry()?;
    let plugins: Vec<InstalledPlugin> = registry.plugins.values().cloned().collect();
    println!("[plugins] plugin_list: returning {} plugins", plugins.len());
    for p in &plugins {
        println!("[plugins]   - {} (enabled={}, commands={}, agents={})",
            p.id, p.enabled, p.components.commands.len(), p.components.agents.len());
    }
    Ok(plugins)
}

/// Get the plugins directory path
#[tauri::command]
pub fn plugin_get_directory() -> Result<String, String> {
    get_plugins_dir().map(|p| p.to_string_lossy().to_string())
}

/// Validate a plugin source directory
#[tauri::command]
pub fn plugin_validate(source_path: String) -> Result<PluginManifest, String> {
    let source = Path::new(&source_path);

    if !source.exists() {
        return Err("Source path does not exist".to_string());
    }

    if !source.is_dir() {
        return Err("Source path is not a directory".to_string());
    }

    parse_plugin_manifest(source)
}

/// Install a plugin from a source directory
#[tauri::command]
pub fn plugin_install(source_path: String) -> Result<InstalledPlugin, String> {
    let source = Path::new(&source_path);

    // Validate the plugin
    let manifest = parse_plugin_manifest(source)?;
    let plugin_id = manifest.name.clone();

    // Check if already installed
    let mut registry = load_registry()?;
    if registry.plugins.contains_key(&plugin_id) {
        return Err(format!("Plugin '{}' is already installed", plugin_id));
    }

    // Create plugins directory
    let plugins_dir = get_plugins_dir()?;
    fs::create_dir_all(&plugins_dir)
        .map_err(|e| format!("Failed to create plugins directory: {}", e))?;

    // Copy plugin to plugins directory
    let dest_dir = plugins_dir.join(&plugin_id);
    if dest_dir.exists() {
        fs::remove_dir_all(&dest_dir)
            .map_err(|e| format!("Failed to clean existing plugin directory: {}", e))?;
    }

    copy_dir_recursive(source, &dest_dir)?;

    // Discover components
    let components = discover_components(&dest_dir, &plugin_id)?;

    // Create installed plugin entry
    let plugin = InstalledPlugin {
        id: plugin_id.clone(),
        manifest,
        installed_at: now_timestamp(),
        enabled: false, // Disabled by default
        path: dest_dir.to_string_lossy().to_string(),
        components,
    };

    // Save to registry
    registry.plugins.insert(plugin_id, plugin.clone());
    registry.last_updated = now_timestamp();
    save_registry(&registry)?;

    Ok(plugin)
}

/// Recursive directory copy helper
fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    fs::create_dir_all(dst)
        .map_err(|e| format!("Failed to create directory: {}", e))?;

    for entry in fs::read_dir(src).map_err(|e| format!("Failed to read directory: {}", e))? {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();
        let dest_path = dst.join(entry.file_name());

        if path.is_dir() {
            copy_dir_recursive(&path, &dest_path)?;
        } else {
            fs::copy(&path, &dest_path)
                .map_err(|e| format!("Failed to copy file: {}", e))?;
        }
    }

    Ok(())
}

/// Uninstall a plugin
#[tauri::command]
pub fn plugin_uninstall(plugin_id: String) -> Result<(), String> {
    let mut registry = load_registry()?;

    // Check if plugin exists
    let plugin = registry.plugins.get(&plugin_id)
        .ok_or_else(|| format!("Plugin '{}' not found", plugin_id))?
        .clone();

    // Disable first if enabled (removes synced components)
    if plugin.enabled {
        plugin_disable(plugin_id.clone())?;
    }

    // Remove plugin directory
    let plugin_path = Path::new(&plugin.path);
    if plugin_path.exists() {
        fs::remove_dir_all(plugin_path)
            .map_err(|e| format!("Failed to remove plugin directory: {}", e))?;
    }

    // Remove from registry
    registry.plugins.remove(&plugin_id);
    registry.last_updated = now_timestamp();
    save_registry(&registry)?;

    Ok(())
}

/// Enable a plugin (syncs components to their target locations)
#[tauri::command]
pub fn plugin_enable(plugin_id: String) -> Result<(), String> {
    let mut registry = load_registry()?;

    let plugin = registry.plugins.get(&plugin_id)
        .ok_or_else(|| format!("Plugin '{}' not found", plugin_id))?
        .clone();

    if plugin.enabled {
        return Ok(()); // Already enabled
    }

    // Sync all components
    sync_plugin_commands(&plugin, true)?;
    sync_plugin_agents(&plugin, true, None)?;
    sync_plugin_skills(&plugin, true)?;
    // Note: Hooks and MCP are handled by frontend services

    // Update registry
    if let Some(p) = registry.plugins.get_mut(&plugin_id) {
        p.enabled = true;
    }
    registry.last_updated = now_timestamp();
    save_registry(&registry)?;

    Ok(())
}

/// Disable a plugin (removes synced components)
#[tauri::command]
pub fn plugin_disable(plugin_id: String) -> Result<(), String> {
    let mut registry = load_registry()?;

    let plugin = registry.plugins.get(&plugin_id)
        .ok_or_else(|| format!("Plugin '{}' not found", plugin_id))?
        .clone();

    if !plugin.enabled {
        return Ok(()); // Already disabled
    }

    // Remove all synced components
    sync_plugin_commands(&plugin, false)?;
    sync_plugin_agents(&plugin, false, None)?;
    sync_plugin_skills(&plugin, false)?;
    // Note: Hooks and MCP are handled by frontend services

    // Update registry
    if let Some(p) = registry.plugins.get_mut(&plugin_id) {
        p.enabled = false;
    }
    registry.last_updated = now_timestamp();
    save_registry(&registry)?;

    Ok(())
}

/// Get detailed information about a specific plugin
#[tauri::command]
pub fn plugin_get_details(plugin_id: String) -> Result<InstalledPlugin, String> {
    let registry = load_registry()?;

    registry.plugins.get(&plugin_id)
        .cloned()
        .ok_or_else(|| format!("Plugin '{}' not found", plugin_id))
}

/// Re-scan a plugin's components (useful after plugin update)
#[tauri::command]
pub fn plugin_rescan(plugin_id: String) -> Result<InstalledPlugin, String> {
    let mut registry = load_registry()?;

    let plugin = registry.plugins.get(&plugin_id)
        .ok_or_else(|| format!("Plugin '{}' not found", plugin_id))?
        .clone();

    let plugin_path = Path::new(&plugin.path);
    let components = discover_components(plugin_path, &plugin_id)?;

    // Update registry
    if let Some(p) = registry.plugins.get_mut(&plugin_id) {
        p.components = components;
    }
    registry.last_updated = now_timestamp();
    save_registry(&registry)?;

    registry.plugins.get(&plugin_id)
        .cloned()
        .ok_or_else(|| "Failed to update plugin".to_string())
}

/// Find the bundled core plugin path
fn find_bundled_plugin_path(app_handle: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    let mut candidate_paths = Vec::new();

    // 1. Try resource_dir (production)
    // Tauri 2.x bundles resources in Contents/Resources/resources/ on macOS
    if let Ok(resource_dir) = app_handle.path().resource_dir() {
        // Try nested resources folder first (Tauri 2.x structure)
        candidate_paths.push(resource_dir.join("resources").join(PLUGIN_DIR_NAME));
        // Also try direct path (in case structure changes)
        candidate_paths.push(resource_dir.join(PLUGIN_DIR_NAME));
    }

    // 2. Try current_dir/src-tauri/resources (dev mode from project root)
    if let Ok(cwd) = std::env::current_dir() {
        candidate_paths.push(cwd.join("src-tauri").join("resources").join(PLUGIN_DIR_NAME));
        candidate_paths.push(cwd.join("resources").join(PLUGIN_DIR_NAME));
    }

    // 3. Try relative to executable
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            candidate_paths.push(exe_dir.join("resources").join(PLUGIN_DIR_NAME));
            candidate_paths.push(exe_dir.join(PLUGIN_DIR_NAME));
        }
    }

    for path in &candidate_paths {
        println!("[plugins] checking candidate path: {}", path.display());
    }

    for path in candidate_paths {
        if path.join(".claude-plugin").join("plugin.json").exists() {
            println!("[plugins] found plugin at: {}", path.display());
            return Some(path);
        }
    }

    println!("[plugins] bundled plugin not found in any candidate path");
    None
}

/// Initialize bundled core plugin if not already installed
/// Called on app startup to ensure the core plugin is available
#[tauri::command]
pub fn plugin_init_bundled(app_handle: tauri::AppHandle) -> Result<Option<InstalledPlugin>, String> {
    println!("[plugins] plugin_init_bundled called");
    let mut registry = load_registry()?;
    println!("[plugins] registry loaded, plugins count: {}", registry.plugins.len());

    // Find bundled plugin source path first
    let bundled_path = find_bundled_plugin_path(&app_handle);
    println!("[plugins] bundled plugin path: {:?}", bundled_path);

    // Check if core plugin already installed
    if let Some(existing) = registry.plugins.get(PLUGIN_ID).cloned() {
        println!("[plugins] core plugin exists: enabled={}, commands={}, agents={}",
            existing.enabled, existing.components.commands.len(), existing.components.agents.len());

        let plugin_path = std::path::Path::new(&existing.path);

        // Check if bundled has more/different components than installed
        let mut needs_reinstall = !plugin_path.exists();

        if !needs_reinstall {
            if let Some(ref bundled) = bundled_path {
                if let Ok(bundled_components) = discover_components(bundled, PLUGIN_ID) {
                    let installed_components = discover_components(plugin_path, PLUGIN_ID).ok();

                    let bundled_cmd_count = bundled_components.commands.len();
                    let bundled_agent_count = bundled_components.agents.len();
                    let installed_cmd_count = installed_components.as_ref().map(|c| c.commands.len()).unwrap_or(0);
                    let installed_agent_count = installed_components.as_ref().map(|c| c.agents.len()).unwrap_or(0);

                    println!("[plugins] bundled: cmds={}, agents={} | installed: cmds={}, agents={}",
                        bundled_cmd_count, bundled_agent_count, installed_cmd_count, installed_agent_count);

                    // Reinstall if bundled has different component counts
                    if bundled_cmd_count != installed_cmd_count || bundled_agent_count != installed_agent_count {
                        println!("[plugins] bundled plugin updated, reinstalling");
                        needs_reinstall = true;
                    }
                }
            }
        }

        if needs_reinstall {
            println!("[plugins] removing stale core entry for reinstall");
            registry.plugins.remove(PLUGIN_ID);
            save_registry(&registry)?;
            // Fall through to reinstall
        } else {
            // Update components but preserve user's enabled state
            let components = discover_components(plugin_path, PLUGIN_ID)?;
            let was_enabled = registry.plugins.get(PLUGIN_ID).map(|p| p.enabled).unwrap_or(true);

            if let Some(p) = registry.plugins.get_mut(PLUGIN_ID) {
                p.components = components;
                // Don't force enabled = true, preserve user's choice
            }
            save_registry(&registry)?;

            let final_plugin = registry.plugins.get(PLUGIN_ID).cloned().unwrap();
            println!("[plugins] core plugin: enabled={}, commands={}, agents={}",
                was_enabled, final_plugin.components.commands.len(), final_plugin.components.agents.len());

            // Only sync components if plugin is enabled
            if was_enabled {
                sync_plugin_commands(&final_plugin, true).ok();
                sync_plugin_agents(&final_plugin, true, None).ok();
                sync_plugin_skills(&final_plugin, true).ok();
            }
            return Ok(Some(final_plugin));
        }
    }

    println!("[plugins] core plugin not found or outdated, installing from bundled");

    // Use the bundled path we found earlier
    if let Some(path) = bundled_path {
        return install_bundled_plugin(&path);
    }

    Err("Bundled core plugin not found".to_string())
}

/// Cleanup core plugin on exit
/// Removes synced commands from ~/.claude/commands/
#[tauri::command]
pub fn plugin_cleanup_on_exit() -> Result<(), String> {
    let registry = load_registry()?;

    // Only clean up core plugin
    if let Some(plugin) = registry.plugins.get(PLUGIN_ID) {
        if plugin.enabled {
            // Remove synced commands
            sync_plugin_commands(plugin, false).ok();
            // Remove synced agents
            sync_plugin_agents(plugin, false, None).ok();
            // Remove synced skills
            sync_plugin_skills(plugin, false).ok();
        }
    }

    Ok(())
}

/// Helper to install the bundled core plugin
fn install_bundled_plugin(source: &Path) -> Result<Option<InstalledPlugin>, String> {
    // Validate the plugin
    let manifest = parse_plugin_manifest(source)?;
    let plugin_id = manifest.name.clone();

    // Create plugins directory
    let plugins_dir = get_plugins_dir()?;
    fs::create_dir_all(&plugins_dir)
        .map_err(|e| format!("Failed to create plugins directory: {}", e))?;

    // Copy plugin to plugins directory
    let dest_dir = plugins_dir.join(&plugin_id);
    if dest_dir.exists() {
        fs::remove_dir_all(&dest_dir)
            .map_err(|e| format!("Failed to clean existing plugin directory: {}", e))?;
    }

    copy_dir_recursive(source, &dest_dir)?;

    // Discover components
    let components = discover_components(&dest_dir, &plugin_id)?;

    // Create installed plugin entry - enabled by default for core plugin
    let plugin = InstalledPlugin {
        id: plugin_id.clone(),
        manifest,
        installed_at: now_timestamp(),
        enabled: true, // core plugin is enabled by default
        path: dest_dir.to_string_lossy().to_string(),
        components,
    };

    // Save to registry
    let mut registry = load_registry()?;
    registry.plugins.insert(plugin_id.clone(), plugin.clone());
    registry.last_updated = now_timestamp();
    save_registry(&registry)?;

    // Sync components since it's enabled
    sync_plugin_commands(&plugin, true)?;
    sync_plugin_agents(&plugin, true, None)?;
    sync_plugin_skills(&plugin, true)?;

    Ok(Some(plugin))
}

/// Sync app agents with a specific model
/// Called when user changes the selected model to update all app agents
#[tauri::command]
pub fn sync_yume_agents(enabled: bool, model: String) -> Result<(), String> {
    let registry = load_registry()?;

    if let Some(plugin) = registry.plugins.get(PLUGIN_ID) {
        println!("[plugins] sync_yume_agents: enabled={}, model={}", enabled, model);
        sync_plugin_agents(plugin, enabled, Some(&model))?;
    }

    Ok(())
}

/// Check if app agents are currently synced
#[tauri::command]
pub fn are_yume_agents_synced() -> Result<bool, String> {
    let claude_dir = get_claude_dir()?;
    let agents_dir = claude_dir.join("agents");

    // Check if any app agent file exists
    if agents_dir.exists() {
        if let Ok(entries) = fs::read_dir(&agents_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with(&format!("{}--", PLUGIN_ID)) && name.ends_with(".md") {
                    return Ok(true);
                }
            }
        }
    }

    Ok(false)
}

/// Cleanup app agents on app exit (called from frontend)
#[tauri::command]
pub fn cleanup_yume_agents_on_exit() -> Result<(), String> {
    let registry = load_registry()?;

    if let Some(plugin) = registry.plugins.get(PLUGIN_ID) {
        if plugin.enabled {
            sync_plugin_agents(plugin, false, None)?;
        }
    }

    Ok(())
}

// ============================================================================
// VSCode Extension Commands
// ============================================================================

/// Find the VSCode CLI path (handles GUI apps without shell PATH)
fn find_vscode_cli() -> Option<String> {
    // Try 'code' directly first (works in dev mode or if PATH is set)
    if std::process::Command::new("code")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
    {
        return Some("code".to_string());
    }

    // macOS: check known VSCode locations
    #[cfg(target_os = "macos")]
    {
        let macos_paths = [
            "/usr/local/bin/code",
            "/opt/homebrew/bin/code",
            "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
            "/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code",
        ];
        for path in &macos_paths {
            if std::path::Path::new(path).exists() {
                if std::process::Command::new(path)
                    .arg("--version")
                    .output()
                    .map(|o| o.status.success())
                    .unwrap_or(false)
                {
                    return Some(path.to_string());
                }
            }
        }
    }

    // Linux: check common locations
    #[cfg(target_os = "linux")]
    {
        let linux_paths = [
            "/usr/bin/code",
            "/usr/local/bin/code",
            "/snap/bin/code",
        ];
        for path in &linux_paths {
            if std::path::Path::new(path).exists() {
                if std::process::Command::new(path)
                    .arg("--version")
                    .output()
                    .map(|o| o.status.success())
                    .unwrap_or(false)
                {
                    return Some(path.to_string());
                }
            }
        }
    }

    // Windows: check common locations
    #[cfg(target_os = "windows")]
    {
        if let Some(local_app_data) = std::env::var_os("LOCALAPPDATA") {
            let vscode_cmd = std::path::PathBuf::from(local_app_data)
                .join("Programs")
                .join("Microsoft VS Code")
                .join("bin")
                .join("code.cmd");
            if vscode_cmd.exists() {
                if std::process::Command::new(&vscode_cmd)
                    .arg("--version")
                    .output()
                    .map(|o| o.status.success())
                    .unwrap_or(false)
                {
                    return Some(vscode_cmd.to_string_lossy().to_string());
                }
            }
        }
        // Also try Program Files
        let program_files_paths = [
            r"C:\Program Files\Microsoft VS Code\bin\code.cmd",
            r"C:\Program Files (x86)\Microsoft VS Code\bin\code.cmd",
        ];
        for path in &program_files_paths {
            if std::path::Path::new(path).exists() {
                if std::process::Command::new(path)
                    .arg("--version")
                    .output()
                    .map(|o| o.status.success())
                    .unwrap_or(false)
                {
                    return Some(path.to_string());
                }
            }
        }
    }

    None
}

/// Check if VSCode CLI is available
fn is_vscode_cli_available() -> bool {
    find_vscode_cli().is_some()
}

/// Check if VSCode is installed (public command)
#[tauri::command]
pub fn is_vscode_installed() -> bool {
    is_vscode_cli_available()
}

/// Get VSCode extensions directory
fn get_vscode_extensions_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".vscode").join("extensions"))
}

/// Check if app VSCode extension is installed
#[tauri::command]
pub fn check_vscode_extension_installed() -> Result<bool, String> {
    // Check if .vscode/extensions/<app-id>.* exists
    if let Some(ext_dir) = get_vscode_extensions_dir() {
        if ext_dir.exists() {
            if let Ok(entries) = fs::read_dir(&ext_dir) {
                for entry in entries.flatten() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if name.starts_with(VSCODE_EXTENSION_DIR_PREFIX) {
                        return Ok(true);
                    }
                }
            }
        }
    }

    // Also check using vscode cli
    if let Some(code_cli) = find_vscode_cli() {
        let output = std::process::Command::new(&code_cli)
            .args(["--list-extensions"])
            .output();

        if let Ok(out) = output {
            let extensions = String::from_utf8_lossy(&out.stdout);
            if extensions.lines().any(|l| l.trim() == VSCODE_EXTENSION_ID) {
                return Ok(true);
            }
        }
    }

    Ok(false)
}

/// Find the vscode extension directory using multiple candidate paths
fn find_vscode_extension_dir(app_handle: &tauri::AppHandle) -> Option<PathBuf> {
    let mut candidate_paths = Vec::new();

    // 1. Try resource_dir (production)
    if let Ok(resource_dir) = app_handle.path().resource_dir() {
        // Try direct path first (Tauri 2.x macOS bundles resources directly in Resources/)
        candidate_paths.push(resource_dir.join(VSCODE_DIR_NAME));
        // Also try nested resources folder
        candidate_paths.push(resource_dir.join("resources").join(VSCODE_DIR_NAME));
    }

    // 2. Try macOS .app bundle structure (production)
    if let Ok(exe) = std::env::current_exe() {
        // exe is at <app>.app/Contents/MacOS/<app>
        // resources are at <app>.app/Contents/Resources/<app>-vscode
        if let Some(exe_dir) = exe.parent() {
            // exe_dir is Contents/MacOS
            if let Some(contents_dir) = exe_dir.parent() {
                // contents_dir is Contents
                candidate_paths.push(contents_dir.join("Resources").join(VSCODE_DIR_NAME));
            }
        }
    }

    // 3. Try current_dir/src-tauri/resources (dev mode from project root)
    if let Ok(cwd) = std::env::current_dir() {
        candidate_paths.push(cwd.join("src-tauri").join("resources").join(VSCODE_DIR_NAME));
        candidate_paths.push(cwd.join("resources").join(VSCODE_DIR_NAME));
    }

    // 4. Try relative to executable (other platforms)
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            candidate_paths.push(exe_dir.join("resources").join(VSCODE_DIR_NAME));
            candidate_paths.push(exe_dir.join(VSCODE_DIR_NAME));
        }
    }

    for path in &candidate_paths {
        println!("[vscode] checking candidate path: {}", path.display());
        if path.exists() {
            println!("[vscode] found extension at: {}", path.display());
            return Some(path.clone());
        }
    }

    None
}

/// Install VSCode extension
/// This command installs the pre-built app vscode extension
#[tauri::command]
pub fn install_vscode_extension(app_handle: tauri::AppHandle) -> Result<(), String> {
    // Check if vscode cli is available and get its path
    let code_cli = find_vscode_cli()
        .ok_or_else(|| "vscode cli not found. install vscode and ensure 'code' command is available".to_string())?;

    println!("[vscode] using cli at: {}", code_cli);

    // Find the extension directory
    let ext_source = find_vscode_extension_dir(&app_handle)
        .ok_or_else(|| "vscode extension not found in any expected location".to_string())?;

    println!("[vscode] extension source dir: {:?}", ext_source);

    // Find the pre-built vsix file
    let vsix_path = ext_source.join(format!("{}-0.1.2.vsix", APP_ID));

    let vsix_file = if vsix_path.exists() {
        vsix_path
    } else {
        // Try to find any .vsix file in the extension directory
        let entries = fs::read_dir(&ext_source)
            .map_err(|e| format!("failed to read extension dir: {}", e))?;

        entries
            .filter_map(|e| e.ok())
            .find(|e| e.path().extension().map(|ext| ext == "vsix").unwrap_or(false))
            .map(|e| e.path())
            .ok_or_else(|| format!("vsix file not found in {:?}. the extension may not be bundled properly.", ext_source))?
    };

    // Install the extension using vscode cli
    println!("[vscode] installing extension from {:?}", vsix_file);

    let install = std::process::Command::new(&code_cli)
        .args(["--install-extension", &vsix_file.to_string_lossy(), "--force"])
        .output()
        .map_err(|e| format!("failed to install extension: {}", e))?;

    if !install.status.success() {
        let stderr = String::from_utf8_lossy(&install.stderr);
        let stdout = String::from_utf8_lossy(&install.stdout);
        return Err(format!("extension installation failed: {} {}", stderr, stdout));
    }

    println!("[vscode] extension installed successfully");
    Ok(())
}

/// Uninstall VSCode extension
/// This command uninstalls the app vscode extension
#[tauri::command]
pub fn uninstall_vscode_extension() -> Result<(), String> {
    // Check if vscode cli is available and get its path
    let code_cli = find_vscode_cli()
        .ok_or_else(|| "vscode cli not found".to_string())?;

    println!("[vscode] uninstalling extension using cli at: {}", code_cli);

    // Uninstall the extension using vscode cli
    let uninstall = std::process::Command::new(&code_cli)
        .args(["--uninstall-extension", VSCODE_EXTENSION_ID])
        .output()
        .map_err(|e| format!("failed to uninstall extension: {}", e))?;

    if !uninstall.status.success() {
        let stderr = String::from_utf8_lossy(&uninstall.stderr);
        let stdout = String::from_utf8_lossy(&uninstall.stdout);
        // Don't fail if extension wasn't installed
        if !stderr.contains("not installed") && !stdout.contains("not installed") {
            return Err(format!("extension uninstall failed: {} {}", stderr, stdout));
        }
    }

    println!("[vscode] extension uninstalled successfully");

    // Reload vscode window to remove the extension
    let _ = std::process::Command::new(&code_cli)
        .args(["--command", "workbench.action.reloadWindow"])
        .spawn();

    Ok(())
}
