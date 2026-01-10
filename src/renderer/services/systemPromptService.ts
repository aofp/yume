import { invoke } from '@tauri-apps/api/core';

export interface SystemPromptSettings {
  enabled: boolean;
  mode: 'default' | 'custom' | 'none';
  customPrompt: string;
  agentsEnabled: boolean;
}

const STORAGE_KEY = 'system_prompt_settings';

const DEFAULT_PROMPT_WITH_AGENTS = `yurucode orchestrator. lowercase, concise.

agents available:
- architect: plan complex tasks (3+ steps), identify risks
- explorer: search codebase, gather context (use for broad searches)
- implementer: make focused code changes
- guardian: review for bugs, security, performance
- specialist: tests, docs, devops, data tasks

when to use agents:
- 1-2 step task → do directly, no agents
- 3+ steps or multi-file → architect first, then others
- broad codebase search → explorer (faster than manual glob/grep)
- after significant changes → guardian review
- parallel agents only when subtasks are independent

cost awareness:
- each agent = extra api call, use sparingly
- haiku agents for quick exploration
- don't retry failed agent tasks (non-deterministic)

always: read before edit, small changes, relative paths.`;

const DEFAULT_PROMPT_NO_AGENTS = `yurucode. lowercase, concise. read before edit, small changes, relative paths.`;

class SystemPromptService {
  private settings: SystemPromptSettings | null = null;

  constructor() {
    this.loadSettings();
  }

  private loadSettings(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Ensure agentsEnabled has a default value
        this.settings = {
          ...parsed,
          agentsEnabled: parsed.agentsEnabled ?? true
        };
      } else {
        // Default settings
        this.settings = {
          enabled: true,
          mode: 'default',
          customPrompt: '',
          agentsEnabled: true
        };
      }
    } catch (error) {
      console.error('Failed to load system prompt settings:', error);
      this.settings = {
        enabled: true,
        mode: 'default',
        customPrompt: '',
        agentsEnabled: true
      };
    }
  }

  getCurrent(): SystemPromptSettings {
    if (!this.settings) {
      this.loadSettings();
    }
    return this.settings || {
      enabled: true,
      mode: 'default',
      customPrompt: '',
      agentsEnabled: true
    };
  }

  save(settings: SystemPromptSettings): void {
    this.settings = settings;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('Failed to save system prompt settings:', error);
    }
  }

  getDefault(withAgents?: boolean): string {
    const useAgents = withAgents ?? this.getCurrent().agentsEnabled;
    return useAgents ? DEFAULT_PROMPT_WITH_AGENTS : DEFAULT_PROMPT_NO_AGENTS;
  }

  getActivePrompt(): string | null {
    const settings = this.getCurrent();

    if (!settings.enabled) {
      return null;
    }

    const defaultPrompt = settings.agentsEnabled
      ? DEFAULT_PROMPT_WITH_AGENTS
      : DEFAULT_PROMPT_NO_AGENTS;

    if (settings.mode === 'default') {
      return defaultPrompt;
    }

    if (settings.mode === 'custom' && settings.customPrompt) {
      return settings.customPrompt;
    }

    return defaultPrompt;
  }

  reset(): void {
    this.settings = {
      enabled: true,
      mode: 'default',
      customPrompt: '',
      agentsEnabled: true
    };
    this.save(this.settings);
  }

  // ============================================================================
  // YURUCODE AGENTS SYNC - Write/Remove agent files to ~/.claude/agents/
  // ============================================================================

  /**
   * Sync yurucode agents to ~/.claude/agents/ based on enabled state.
   * Now handled by the plugin system - agents are part of the yurucode plugin.
   * This is kept for backwards compatibility but is a no-op.
   * @param model - The model to use for all agents (ignored, plugin handles this)
   */
  async syncAgentsToFilesystem(model?: string): Promise<void> {
    // Agents are now managed by the yurucode plugin system
    // The plugin_init_bundled command handles syncing agents to ~/.claude/agents/
    console.log('[SystemPrompt] Agent sync handled by plugin system');
  }

  /**
   * Cleanup yurucode agents on app exit.
   * Now handled by the plugin system.
   */
  async cleanupAgentsOnExit(): Promise<void> {
    // Agents cleanup is now handled by plugin_cleanup_on_exit
    console.log('[SystemPrompt] Agent cleanup handled by plugin system');
  }

  /**
   * Check if yurucode agents are currently synced to filesystem.
   * Now checks via the plugin system - yurucode plugin enabled = agents synced.
   */
  async areAgentsSynced(): Promise<boolean> {
    try {
      // Import dynamically to avoid circular dependency
      const { pluginService } = await import('./pluginService');
      await pluginService.initialize();
      const plugin = pluginService.getPlugin('yurucode');
      return plugin?.enabled ?? false;
    } catch (error) {
      console.error('[SystemPrompt] Failed to check agents sync status:', error);
      return false;
    }
  }

  /**
   * Save settings and sync agents to filesystem if agentsEnabled changed.
   * @param model - The current model to use for agents
   */
  async saveAndSync(settings: SystemPromptSettings, model?: string): Promise<void> {
    const previousEnabled = this.settings?.agentsEnabled;
    this.save(settings);

    // Sync to filesystem if agentsEnabled changed
    if (previousEnabled !== settings.agentsEnabled) {
      await this.syncAgentsToFilesystem(model);
    }
  }
}

export const systemPromptService = new SystemPromptService();