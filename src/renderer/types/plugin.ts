// Plugin System Types for Yurucode
// Supports Claude Code plugin format: https://github.com/anthropics/claude-code/tree/main/plugins

export interface PluginAuthor {
  name: string;
  email?: string;
}

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author?: PluginAuthor;
}

export interface PluginCommand {
  name: string;
  description: string;
  filePath: string;
  pluginId: string;
}

export interface PluginAgent {
  name: string;
  model: string;
  description?: string;
  filePath: string;
  pluginId: string;
}

export interface PluginHook {
  name: string;
  event: 'SessionStart' | 'PreToolUse' | 'PostToolUse' | 'Stop';
  description?: string;
  filePath: string;
  pluginId: string;
}

export interface PluginSkill {
  name: string;
  description: string;
  filePath: string;
  pluginId: string;
}

export interface PluginMCPServer {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  pluginId: string;
}

export interface PluginMCPConfig {
  servers: Record<string, PluginMCPServer>;
  pluginId: string;
}

export interface PluginComponents {
  commands: PluginCommand[];
  agents: PluginAgent[];
  hooks: PluginHook[];
  skills: PluginSkill[];
  mcp: PluginMCPConfig | null;
}

export interface InstalledPlugin {
  id: string;
  manifest: PluginManifest;
  installedAt: number;
  enabled: boolean;
  path: string;
  components: PluginComponents;
}

export interface PluginRegistry {
  version: string;
  plugins: Record<string, InstalledPlugin>;
  lastUpdated: number;
}

// Serializable version for Rust IPC
export interface PluginManifestRust {
  name: string;
  version: string;
  description: string;
  author_name?: string;
  author_email?: string;
}

export interface PluginCommandRust {
  name: string;
  description: string;
  file_path: string;
  plugin_id: string;
}

export interface PluginAgentRust {
  name: string;
  model: string;
  description: string;
  file_path: string;
  plugin_id: string;
}

export interface PluginHookRust {
  name: string;
  event: string;
  description: string;
  file_path: string;
  plugin_id: string;
}

export interface PluginSkillRust {
  name: string;
  description: string;
  file_path: string;
  plugin_id: string;
}

export interface PluginComponentsRust {
  commands: PluginCommandRust[];
  agents: PluginAgentRust[];
  hooks: PluginHookRust[];
  skills: PluginSkillRust[];
  mcp_servers: Record<string, any> | null;
}

export interface InstalledPluginRust {
  id: string;
  manifest: PluginManifestRust;
  installed_at: number;
  enabled: boolean;
  path: string;
  components: PluginComponentsRust;
}

// Conversion helpers
export function pluginFromRust(rust: InstalledPluginRust): InstalledPlugin {
  return {
    id: rust.id,
    manifest: {
      name: rust.manifest.name,
      version: rust.manifest.version,
      description: rust.manifest.description,
      author: rust.manifest.author_name ? {
        name: rust.manifest.author_name,
        email: rust.manifest.author_email
      } : undefined
    },
    installedAt: rust.installed_at,
    enabled: rust.enabled,
    path: rust.path,
    components: {
      commands: rust.components.commands.map(c => ({
        name: c.name,
        description: c.description,
        filePath: c.file_path,
        pluginId: c.plugin_id
      })),
      agents: rust.components.agents.map(a => ({
        name: a.name,
        model: a.model,
        description: a.description,
        filePath: a.file_path,
        pluginId: a.plugin_id
      })),
      hooks: rust.components.hooks.map(h => ({
        name: h.name,
        event: h.event as PluginHook['event'],
        description: h.description,
        filePath: h.file_path,
        pluginId: h.plugin_id
      })),
      skills: rust.components.skills.map(s => ({
        name: s.name,
        description: s.description,
        filePath: s.file_path,
        pluginId: s.plugin_id
      })),
      mcp: rust.components.mcp_servers ? {
        servers: rust.components.mcp_servers,
        pluginId: rust.id
      } : null
    }
  };
}
