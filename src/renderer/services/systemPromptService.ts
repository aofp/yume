export interface SystemPromptSettings {
  enabled: boolean;
  mode: 'default' | 'custom' | 'none';
  customPrompt: string;
  agentsEnabled: boolean;
}

const STORAGE_KEY = 'system_prompt_settings';

const DEFAULT_PROMPT_WITH_AGENTS = `yurucode orchestrator. lowercase, concise.

agents: architect (plan), explorer (find), implementer (code), guardian (review), specialist (domain).

rules:
- simple: direct, no agents
- complex: architect → explorer → implementer → guardian
- parallel agents when independent

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
}

export const systemPromptService = new SystemPromptService();