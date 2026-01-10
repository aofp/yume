// Plugin Service - manages plugin installation, enabling/disabling, and component tracking
// Singleton pattern for consistent state across the application

import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import {
  InstalledPlugin,
  InstalledPluginRust,
  PluginManifest,
  PluginManifestRust,
  PluginRegistry,
  pluginFromRust
} from '../types/plugin';

const REGISTRY_KEY = 'yurucode_plugin_registry';

class PluginService {
  private static instance: PluginService;
  private plugins: Map<string, InstalledPlugin> = new Map();
  private initialized = false;

  private constructor() {}

  static getInstance(): PluginService {
    if (!PluginService.instance) {
      PluginService.instance = new PluginService();
    }
    return PluginService.instance;
  }

  // ============================================================================
  // Core Operations
  // ============================================================================

  /**
   * Initialize the plugin service by loading plugins from backend
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const plugins = await this.listPlugins();
      this.plugins.clear();
      for (const plugin of plugins) {
        this.plugins.set(plugin.id, plugin);
      }
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize plugin service:', error);
    }
  }

  /**
   * List all installed plugins
   */
  async listPlugins(): Promise<InstalledPlugin[]> {
    try {
      const rustPlugins = await invoke<InstalledPluginRust[]>('plugin_list');
      return rustPlugins.map(pluginFromRust);
    } catch (error) {
      console.error('Failed to list plugins:', error);
      return [];
    }
  }

  /**
   * Get the plugins directory path
   */
  async getPluginsDirectory(): Promise<string> {
    return invoke<string>('plugin_get_directory');
  }

  /**
   * Validate a plugin source directory
   */
  async validatePlugin(sourcePath: string): Promise<PluginManifest> {
    const rustManifest = await invoke<PluginManifestRust>('plugin_validate', { sourcePath });
    return {
      name: rustManifest.name,
      version: rustManifest.version,
      description: rustManifest.description,
      author: rustManifest.author_name ? {
        name: rustManifest.author_name,
        email: rustManifest.author_email
      } : undefined
    };
  }

  /**
   * Install a plugin from a source directory
   */
  async installPlugin(sourcePath: string): Promise<InstalledPlugin> {
    const rustPlugin = await invoke<InstalledPluginRust>('plugin_install', { sourcePath });
    const plugin = pluginFromRust(rustPlugin);
    this.plugins.set(plugin.id, plugin);
    return plugin;
  }

  /**
   * Install plugin via folder picker dialog
   */
  async installPluginFromDialog(): Promise<InstalledPlugin | null> {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Select Plugin Folder'
    });

    if (!selected) return null;

    // Validate first
    await this.validatePlugin(selected as string);

    // Install
    return this.installPlugin(selected as string);
  }

  /**
   * Uninstall a plugin
   */
  async uninstallPlugin(pluginId: string): Promise<void> {
    await invoke('plugin_uninstall', { pluginId });
    this.plugins.delete(pluginId);
  }

  /**
   * Enable a plugin (syncs components to target locations)
   */
  async enablePlugin(pluginId: string): Promise<void> {
    await invoke('plugin_enable', { pluginId });

    // Update local cache
    const plugin = this.plugins.get(pluginId);
    if (plugin) {
      plugin.enabled = true;
    }
  }

  /**
   * Disable a plugin (removes synced components)
   */
  async disablePlugin(pluginId: string): Promise<void> {
    await invoke('plugin_disable', { pluginId });

    // Update local cache
    const plugin = this.plugins.get(pluginId);
    if (plugin) {
      plugin.enabled = false;
    }
  }

  /**
   * Get details of a specific plugin
   */
  async getPluginDetails(pluginId: string): Promise<InstalledPlugin | null> {
    try {
      const rustPlugin = await invoke<InstalledPluginRust>('plugin_get_details', { pluginId });
      const plugin = pluginFromRust(rustPlugin);
      this.plugins.set(plugin.id, plugin);
      return plugin;
    } catch {
      return null;
    }
  }

  /**
   * Re-scan a plugin's components
   */
  async rescanPlugin(pluginId: string): Promise<InstalledPlugin | null> {
    try {
      const rustPlugin = await invoke<InstalledPluginRust>('plugin_rescan', { pluginId });
      const plugin = pluginFromRust(rustPlugin);
      this.plugins.set(plugin.id, plugin);
      return plugin;
    } catch {
      return null;
    }
  }

  // ============================================================================
  // Plugin Source Detection (for badges)
  // ============================================================================

  /**
   * Check if a command is from a plugin
   * Commands from plugins have format: {pluginId}--{commandName}
   */
  getPluginForCommand(commandName: string): string | null {
    const match = commandName.match(/^(.+?)--(.+)$/);
    if (!match) return null;

    const pluginId = match[1];
    const plugin = this.plugins.get(pluginId);

    if (plugin && plugin.enabled) {
      return plugin.manifest.name;
    }
    return null;
  }

  /**
   * Check if an agent is from a plugin
   * Agents from plugins have format: {pluginId}--{agentName}
   */
  getPluginForAgent(agentName: string): string | null {
    const match = agentName.match(/^(.+?)--(.+)$/);
    if (!match) return null;

    const pluginId = match[1];
    const plugin = this.plugins.get(pluginId);

    if (plugin && plugin.enabled) {
      return plugin.manifest.name;
    }
    return null;
  }

  /**
   * Check if a hook is from a plugin (by pluginId field)
   */
  getPluginForHook(pluginId: string | undefined): string | null {
    if (!pluginId) return null;

    const plugin = this.plugins.get(pluginId);
    if (plugin && plugin.enabled) {
      return plugin.manifest.name;
    }
    return null;
  }

  /**
   * Check if an MCP server is from a plugin (by _pluginId field)
   */
  getPluginForMCPServer(pluginId: string | undefined): string | null {
    if (!pluginId) return null;

    const plugin = this.plugins.get(pluginId);
    if (plugin && plugin.enabled) {
      return plugin.manifest.name;
    }
    return null;
  }

  // ============================================================================
  // Plugin Component Lists (for other services)
  // ============================================================================

  /**
   * Get all commands from enabled plugins
   */
  getEnabledPluginCommands(): Array<{
    name: string;
    description: string;
    pluginId: string;
    pluginName: string;
  }> {
    const commands: Array<{
      name: string;
      description: string;
      pluginId: string;
      pluginName: string;
    }> = [];

    for (const plugin of Array.from(this.plugins.values())) {
      if (!plugin.enabled) continue;

      for (const cmd of plugin.components.commands) {
        commands.push({
          name: `${plugin.id}--${cmd.name}`,
          description: cmd.description,
          pluginId: plugin.id,
          pluginName: plugin.manifest.name
        });
      }
    }

    return commands;
  }

  /**
   * Get all agents from enabled plugins
   */
  getEnabledPluginAgents(): Array<{
    name: string;
    model: string;
    description: string;
    pluginId: string;
    pluginName: string;
  }> {
    const agents: Array<{
      name: string;
      model: string;
      description: string;
      pluginId: string;
      pluginName: string;
    }> = [];

    for (const plugin of Array.from(this.plugins.values())) {
      if (!plugin.enabled) continue;

      for (const agent of plugin.components.agents) {
        agents.push({
          name: `${plugin.id}--${agent.name}`,
          model: agent.model || 'sonnet',
          description: agent.description || '',
          pluginId: plugin.id,
          pluginName: plugin.manifest.name
        });
      }
    }

    return agents;
  }

  /**
   * Get all hooks from enabled plugins
   */
  getEnabledPluginHooks(): Array<{
    name: string;
    event: string;
    description: string;
    pluginId: string;
    pluginName: string;
    filePath: string;
  }> {
    const hooks: Array<{
      name: string;
      event: string;
      description: string;
      pluginId: string;
      pluginName: string;
      filePath: string;
    }> = [];

    for (const plugin of Array.from(this.plugins.values())) {
      if (!plugin.enabled) continue;

      for (const hook of plugin.components.hooks) {
        hooks.push({
          name: hook.name,
          event: hook.event,
          description: hook.description || '',
          pluginId: plugin.id,
          pluginName: plugin.manifest.name,
          filePath: hook.filePath
        });
      }
    }

    return hooks;
  }

  /**
   * Get cached plugin by ID
   */
  getPlugin(pluginId: string): InstalledPlugin | undefined {
    return this.plugins.get(pluginId);
  }

  /**
   * Get all cached plugins
   */
  getAllPlugins(): InstalledPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get enabled plugins only
   */
  getEnabledPlugins(): InstalledPlugin[] {
    return Array.from(this.plugins.values()).filter(p => p.enabled);
  }

  /**
   * Refresh plugin list from backend
   */
  async refresh(): Promise<InstalledPlugin[]> {
    const plugins = await this.listPlugins();
    this.plugins.clear();
    for (const plugin of plugins) {
      this.plugins.set(plugin.id, plugin);
    }
    return plugins;
  }
}

// Export singleton instance
export const pluginService = PluginService.getInstance();

// Also export the class for testing
export { PluginService };
