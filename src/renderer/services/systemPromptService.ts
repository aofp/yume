export interface SystemPromptSettings {
  enabled: boolean;
  mode: 'default' | 'custom' | 'none';
  customPrompt: string;
}

const STORAGE_KEY = 'system_prompt_settings';

const DEFAULT_PROMPT = `you are in yurucode ui. prefer lowercase, be extremely concise, never use formal language, no greetings or pleasantries, straight to the point. you must plan first - use think and todo as much as possible to break down everything, including planning into multiple steps and do edits in small chunks`;

class SystemPromptService {
  private settings: SystemPromptSettings | null = null;

  constructor() {
    this.loadSettings();
  }

  private loadSettings(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.settings = JSON.parse(stored);
      } else {
        // Default settings
        this.settings = {
          enabled: true,
          mode: 'default',
          customPrompt: ''
        };
      }
    } catch (error) {
      console.error('Failed to load system prompt settings:', error);
      this.settings = {
        enabled: true,
        mode: 'default',
        customPrompt: ''
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
      customPrompt: ''
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

  getDefault(): string {
    return DEFAULT_PROMPT;
  }

  getActivePrompt(): string | null {
    const settings = this.getCurrent();
    
    if (!settings.enabled) {
      return null;
    }

    if (settings.mode === 'default') {
      return DEFAULT_PROMPT;
    }

    if (settings.mode === 'custom' && settings.customPrompt) {
      return settings.customPrompt;
    }

    if (settings.mode === 'preset' && settings.selectedPreset) {
      // This would need to match the presets in the modal
      // For now, return default
      return DEFAULT_PROMPT;
    }

    return DEFAULT_PROMPT;
  }

  reset(): void {
    this.settings = {
      enabled: true,
      mode: 'default',
      customPrompt: '',
      selectedPreset: undefined
    };
    this.save(this.settings);
  }
}

export const systemPromptService = new SystemPromptService();