import { appStorageKey } from '../config/app';
import { logger } from '../utils/structuredLogger';

export interface ProviderPromptSettings {
  enabled: boolean;
  mode: 'default' | 'custom' | 'none';
  customPrompt: string;
}

type ProviderType = 'gemini' | 'openai';

const DEFAULT_PROMPTS: Record<ProviderType, string> = {
  gemini: 'yume. lowercase, concise. read before edit, small changes, relative paths.',
  openai: 'yume. lowercase, concise. read before edit, small changes, relative paths.',
};

class ProviderPromptService {
  private cache: Map<ProviderType, ProviderPromptSettings> = new Map();

  private getStorageKey(provider: ProviderType): string {
    return appStorageKey(`${provider}_system_prompt_settings`, '_');
  }

  private loadSettings(provider: ProviderType): ProviderPromptSettings {
    const cached = this.cache.get(provider);
    if (cached) return cached;

    try {
      const stored = localStorage.getItem(this.getStorageKey(provider));
      if (stored) {
        const parsed = JSON.parse(stored);
        this.cache.set(provider, parsed);
        return parsed;
      }
    } catch (error) {
      logger.error(`Failed to load ${provider} prompt settings`, { error });
    }

    const defaults: ProviderPromptSettings = {
      enabled: true,
      mode: 'default',
      customPrompt: '',
    };
    this.cache.set(provider, defaults);
    return defaults;
  }

  getCurrent(provider: ProviderType): ProviderPromptSettings {
    return this.loadSettings(provider);
  }

  save(provider: ProviderType, settings: ProviderPromptSettings): void {
    this.cache.set(provider, settings);
    try {
      localStorage.setItem(this.getStorageKey(provider), JSON.stringify(settings));
    } catch (error) {
      logger.error(`Failed to save ${provider} prompt settings`, { error });
    }
  }

  getDefault(provider: ProviderType): string {
    return DEFAULT_PROMPTS[provider];
  }

  getActivePrompt(provider: ProviderType): string | null {
    const settings = this.getCurrent(provider);

    if (!settings.enabled || settings.mode === 'none') {
      return null;
    }

    if (settings.mode === 'custom' && settings.customPrompt) {
      return settings.customPrompt;
    }

    return DEFAULT_PROMPTS[provider];
  }

  reset(provider: ProviderType): void {
    const defaults: ProviderPromptSettings = {
      enabled: true,
      mode: 'default',
      customPrompt: '',
    };
    this.save(provider, defaults);
  }
}

export const providerPromptService = new ProviderPromptService();
