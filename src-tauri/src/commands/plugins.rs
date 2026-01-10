// Plugin management commands for Yurucode
// Supports Claude Code plugin format: https://github.com/anthropics/claude-code/tree/main/plugins

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

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
            return Ok(app_data.join("yurucode").join("plugins"));
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Some(app_support) = dirs::data_dir() {
            return Ok(app_support.join("yurucode").join("plugins"));
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Some(config) = dirs::config_dir() {
            return Ok(config.join("yurucode").join("plugins"));
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
        let dest_name = format!("{}--{}.md", plugin.id, cmd.name);
        let dest_path = commands_dir.join(&dest_name);

        if enabled {
            // Copy command file
            fs::copy(&cmd.file_path, &dest_path)
                .map_err(|e| format!("Failed to copy command {}: {}", cmd.name, e))?;
        } else {
            // Remove command file
            if dest_path.exists() {
                let _ = fs::remove_file(&dest_path);
            }
        }
    }

    Ok(())
}

/// Sync plugin agents to ~/.claude/agents/
fn sync_plugin_agents(plugin: &InstalledPlugin, enabled: bool) -> Result<(), String> {
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
            // Copy agent file
            fs::copy(&agent.file_path, &dest_path)
                .map_err(|e| format!("Failed to copy agent {}: {}", agent.name, e))?;
        } else {
            // Remove agent file
            if dest_path.exists() {
                let _ = fs::remove_file(&dest_path);
            }
        }
    }

    Ok(())
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
    sync_plugin_agents(&plugin, true)?;
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
    sync_plugin_agents(&plugin, false)?;
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

/// Find the bundled yurucode plugin path
fn find_bundled_plugin_path(app_handle: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    let mut candidate_paths = Vec::new();

    // 1. Try resource_dir (production)
    if let Ok(resource_dir) = app_handle.path().resource_dir() {
        candidate_paths.push(resource_dir.join("yurucode-plugin"));
    }

    // 2. Try current_dir/src-tauri/resources (dev mode from project root)
    if let Ok(cwd) = std::env::current_dir() {
        candidate_paths.push(cwd.join("src-tauri").join("resources").join("yurucode-plugin"));
        candidate_paths.push(cwd.join("resources").join("yurucode-plugin"));
    }

    // 3. Try relative to executable
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            candidate_paths.push(exe_dir.join("resources").join("yurucode-plugin"));
            candidate_paths.push(exe_dir.join("yurucode-plugin"));
        }
    }

    for path in candidate_paths {
        if path.join(".claude-plugin").join("plugin.json").exists() {
            return Some(path);
        }
    }

    None
}

/// Initialize bundled yurucode plugin if not already installed
/// Called on app startup to ensure the core plugin is available
#[tauri::command]
pub fn plugin_init_bundled(app_handle: tauri::AppHandle) -> Result<Option<InstalledPlugin>, String> {
    println!("[plugins] plugin_init_bundled called");
    let mut registry = load_registry()?;
    println!("[plugins] registry loaded, plugins count: {}", registry.plugins.len());

    // Find bundled plugin source path first
    let bundled_path = find_bundled_plugin_path(&app_handle);
    println!("[plugins] bundled plugin path: {:?}", bundled_path);

    // Check if yurucode plugin already installed
    if let Some(existing) = registry.plugins.get("yurucode").cloned() {
        println!("[plugins] yurucode plugin exists: enabled={}, commands={}, agents={}",
            existing.enabled, existing.components.commands.len(), existing.components.agents.len());

        let plugin_path = std::path::Path::new(&existing.path);

        // Check if bundled has more/different components than installed
        let mut needs_reinstall = !plugin_path.exists();

        if !needs_reinstall {
            if let Some(ref bundled) = bundled_path {
                if let Ok(bundled_components) = discover_components(bundled, "yurucode") {
                    let installed_components = discover_components(plugin_path, "yurucode").ok();

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
            println!("[plugins] removing stale yurucode entry for reinstall");
            registry.plugins.remove("yurucode");
            save_registry(&registry)?;
            // Fall through to reinstall
        } else {
            // Just ensure enabled and synced
            let components = discover_components(plugin_path, "yurucode")?;

            if let Some(p) = registry.plugins.get_mut("yurucode") {
                p.components = components;
                p.enabled = true;
            }
            save_registry(&registry)?;

            let final_plugin = registry.plugins.get("yurucode").cloned().unwrap();
            println!("[plugins] syncing yurucode: commands={}, agents={}",
                final_plugin.components.commands.len(), final_plugin.components.agents.len());
            sync_plugin_commands(&final_plugin, true).ok();
            sync_plugin_agents(&final_plugin, true).ok();
            sync_plugin_skills(&final_plugin, true).ok();
            return Ok(Some(final_plugin));
        }
    }

    println!("[plugins] yurucode plugin not found or outdated, installing from bundled");

    // Use the bundled path we found earlier
    if let Some(path) = bundled_path {
        return install_bundled_plugin(&path);
    }

    Err("Bundled yurucode plugin not found".to_string())
}

/// Cleanup yurucode plugin on exit
/// Removes synced commands from ~/.claude/commands/
#[tauri::command]
pub fn plugin_cleanup_on_exit() -> Result<(), String> {
    let registry = load_registry()?;

    // Only clean up yurucode plugin
    if let Some(plugin) = registry.plugins.get("yurucode") {
        if plugin.enabled {
            // Remove synced commands
            sync_plugin_commands(plugin, false).ok();
            // Remove synced agents
            sync_plugin_agents(plugin, false).ok();
            // Remove synced skills
            sync_plugin_skills(plugin, false).ok();
        }
    }

    Ok(())
}

/// Helper to install the bundled yurucode plugin
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

    // Create installed plugin entry - ENABLED by default for yurucode plugin
    let plugin = InstalledPlugin {
        id: plugin_id.clone(),
        manifest,
        installed_at: now_timestamp(),
        enabled: true, // yurucode plugin is enabled by default
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
    sync_plugin_agents(&plugin, true)?;
    sync_plugin_skills(&plugin, true)?;

    Ok(Some(plugin))
}
