/**
 * Centralized model configuration for Yume
 *
 * Supports multiple providers: Claude, Gemini, OpenAI
 * Update this file when new models are released.
 */

// Provider types
export type ProviderType = 'claude' | 'gemini' | 'openai';

export interface ProviderDefinition {
  id: ProviderType;
  name: string;
  description: string;
  cliCommand: string;        // CLI binary name (e.g., 'claude', 'gemini', 'codex')
  cliInstall: string;        // Install command (e.g., 'npm install -g @openai/codex')
  authCommand: string;       // Auth command (e.g., 'codex login', 'gemini auth login')
  enabled: boolean;          // Whether provider is enabled by user
}

export interface ModelDefinition {
  id: string;                // Full model ID for API calls
  shortName: string;         // Short name for display and shortcuts
  displayName: string;       // Full display name (analytics, etc)
  shortDisplayName: string;  // Short display name (model selector)
  description: string;       // Brief description for UI
  provider: ProviderType;    // Provider this model belongs to
  family: string;            // Model family for grouping (e.g., 'opus', 'gemini-pro')
  version: string;           // Version string
  contextWindow: number;     // Context window size
  maxOutput: number;         // Max output tokens
  supportsTools: boolean;    // Whether model supports tool use
  supportsThinking?: boolean; // Whether model supports thinking/reasoning blocks
  reasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh';  // OpenAI reasoning effort
}

// Provider definitions (order: claude, codex, gemini)
export const PROVIDERS: ProviderDefinition[] = [
  {
    id: 'claude',
    name: 'Claude',
    description: 'anthropic models via claude cli',
    cliCommand: 'claude',
    cliInstall: 'npm install -g @anthropic-ai/claude-code',
    authCommand: 'claude',  // auth is automatic on first run
    enabled: true,
  },
  {
    id: 'openai',
    name: 'Codex',
    description: 'openai models via codex cli',
    cliCommand: 'codex',
    cliInstall: 'npm install -g @openai/codex',
    authCommand: 'codex login',
    enabled: false,
  },
  {
    id: 'gemini',
    name: 'Gemini',
    description: 'google models via gemini cli',
    cliCommand: 'gemini',
    cliInstall: 'npm install -g @anthropic-ai/gemini-cli',
    authCommand: 'gemini auth login',
    enabled: false,
  },
];

// Claude models
const CLAUDE_MODELS: ModelDefinition[] = [
  {
    id: 'claude-sonnet-4-5-20250929',
    shortName: 'sonnet',
    displayName: 'sonnet 4.5',
    shortDisplayName: 'sonnet 4.5',
    description: 'fast & smart',
    provider: 'claude',
    family: 'sonnet',
    version: '4.5',
    contextWindow: 200000,
    maxOutput: 8192,
    supportsTools: true,
    supportsThinking: true,
  },
  {
    id: 'claude-opus-4-5-20251101',
    shortName: 'opus',
    displayName: 'opus 4.5',
    shortDisplayName: 'opus 4.5',
    description: 'most capable',
    provider: 'claude',
    family: 'opus',
    version: '4.5',
    contextWindow: 200000,
    maxOutput: 8192,
    supportsTools: true,
    supportsThinking: true,
  },
];

// Gemini models
const GEMINI_MODELS: ModelDefinition[] = [
  {
    id: 'gemini-2.5-flash',
    shortName: 'gemini-flash',
    displayName: 'gemini 2.5 flash',
    shortDisplayName: 'gemini 2.5 fl',
    description: 'fast & efficient',
    provider: 'gemini',
    family: 'gemini-flash',
    version: '2.5',
    contextWindow: 1000000,
    maxOutput: 8192,
    supportsTools: true,
  },
  {
    id: 'gemini-2.5-pro',
    shortName: 'gemini-pro',
    displayName: 'gemini 2.5 pro',
    shortDisplayName: 'gemini 2.5 pr',
    description: 'most capable',
    provider: 'gemini',
    family: 'gemini-pro',
    version: '2.5',
    contextWindow: 1000000,
    maxOutput: 8192,
    supportsTools: true,
    supportsThinking: true,
  },
];

// OpenAI/Codex models
const OPENAI_MODELS: ModelDefinition[] = [
  {
    id: 'gpt-5.1-codex-mini',
    shortName: 'codex-mini',
    displayName: 'codex 5.1 mini',
    shortDisplayName: 'codex 5.1 mi',
    description: 'fast & efficient',
    provider: 'openai',
    family: 'codex',
    version: '5.1-mini',
    contextWindow: 200000,
    maxOutput: 100000,
    supportsTools: true,
    reasoningEffort: 'low',
  },
  {
    id: 'gpt-5.2-codex',
    shortName: 'codex',
    displayName: 'codex 5.2',
    shortDisplayName: 'codex 5.2',
    description: 'most capable',
    provider: 'openai',
    family: 'codex',
    version: '5.2',
    contextWindow: 200000,
    maxOutput: 100000,
    supportsTools: true,
    supportsThinking: true,
    reasoningEffort: 'xhigh',
  },
];

// All models combined (order: claude, codex, gemini)
export const ALL_MODELS: ModelDefinition[] = [
  ...CLAUDE_MODELS,
  ...OPENAI_MODELS,
  ...GEMINI_MODELS,
];

// Legacy: LATEST_MODELS for backward compatibility (Claude only)
export const LATEST_MODELS = CLAUDE_MODELS;

// Default model - Sonnet 4.5
export const DEFAULT_MODEL = CLAUDE_MODELS.find((m) => m.family === 'sonnet')!;
export const DEFAULT_MODEL_ID = DEFAULT_MODEL.id;
export const DEFAULT_PROVIDER: ProviderType = 'claude';

// Get models for a specific provider
export const getModelsForProvider = (provider: ProviderType): ModelDefinition[] => {
  return ALL_MODELS.filter((m) => m.provider === provider);
};

// Get default model for a provider
export const getDefaultModelForProvider = (provider: ProviderType): ModelDefinition => {
  const models = getModelsForProvider(provider);
  return models[0] || DEFAULT_MODEL;
};

// Quick lookup by ID
export const getModelById = (id: string): ModelDefinition | undefined => {
  return ALL_MODELS.find((m) => m.id === id);
};

// Quick lookup by short name
export const getModelByShortName = (shortName: string): ModelDefinition | undefined => {
  return ALL_MODELS.find((m) => m.shortName === shortName);
};

// Quick lookup by family (legacy)
export const getModelByFamily = (
  family: 'opus' | 'sonnet' | 'haiku'
): ModelDefinition | undefined => {
  return CLAUDE_MODELS.find((m) => m.family === family);
};

// Map short names to full IDs (for CLI)
export const MODEL_ID_MAP: Record<string, string> = ALL_MODELS.reduce(
  (acc, model) => {
    acc[model.shortName] = model.id;
    return acc;
  },
  {} as Record<string, string>
);

// Get full model ID from short name or return as-is if already full ID
export const resolveModelId = (modelIdOrShortName: string): string => {
  return MODEL_ID_MAP[modelIdOrShortName] || modelIdOrShortName;
};

// Get provider by ID
export const getProviderById = (id: ProviderType): ProviderDefinition | undefined => {
  return PROVIDERS.find((p) => p.id === id);
};

// Get provider for a model
export const getProviderForModel = (modelId: string): ProviderType => {
  const model = getModelById(modelId);
  return model?.provider || 'claude';
};

// For UI dropdown display (legacy - Claude only)
export const getModelsForSelector = () => {
  return CLAUDE_MODELS.map((m) => ({
    id: m.id,
    name: m.displayName,
    description: m.description,
  }));
};

// For UI dropdown display (with provider filter)
export const getModelsForSelectorByProvider = (provider: ProviderType) => {
  return getModelsForProvider(provider).map((m) => ({
    id: m.id,
    name: m.displayName,
    description: m.description,
  }));
};

// Get CLI command for a provider
export const getCliCommand = (provider: ProviderType): string => {
  const p = getProviderById(provider);
  return p?.cliCommand || 'claude';
};
