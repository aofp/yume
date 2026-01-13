/**
 * Centralized model configuration for Yume
 *
 * Update this file when new Claude models are released.
 * The app uses these definitions for model selection, CLI arguments, and analytics.
 */

export interface ModelDefinition {
  id: string;           // Full model ID for API calls (e.g., 'claude-sonnet-4-5-20250929')
  shortName: string;    // Short name for display and shortcuts (e.g., 'sonnet')
  displayName: string;  // Display name in UI (e.g., 'sonnet 4.5')
  description: string;  // Brief description for UI
  family: 'opus' | 'sonnet' | 'haiku';  // Model family for grouping
  version: string;      // Version string (e.g., '4.5')
  releaseDate: string;  // Release date in model ID (e.g., '20250929')
}

/**
 * Latest available models - UPDATE THESE WHEN NEW MODELS RELEASE
 * Order: strongest first (for UI display)
 *
 * To update:
 * 1. Change the `id` to the new model's full ID
 * 2. Update `version` if the version number changes
 * 3. Update `releaseDate` to match the new model ID
 */
export const LATEST_MODELS: ModelDefinition[] = [
  {
    id: 'claude-sonnet-4-5-20250929',
    shortName: 'sonnet',
    displayName: 'sonnet 4.5',
    description: 'fast & smart',
    family: 'sonnet',
    version: '4.5',
    releaseDate: '20250929'
  },
  {
    id: 'claude-opus-4-5-20251101',
    shortName: 'opus',
    displayName: 'opus 4.5',
    description: 'most capable',
    family: 'opus',
    version: '4.5',
    releaseDate: '20251101'
  }
];

// Default model - Sonnet 4.5 (good balance of speed and capability)
export const DEFAULT_MODEL = LATEST_MODELS.find(m => m.family === 'sonnet')!;
export const DEFAULT_MODEL_ID = DEFAULT_MODEL.id;

// Quick lookup by family
export const getModelByFamily = (family: 'opus' | 'sonnet' | 'haiku'): ModelDefinition | undefined => {
  return LATEST_MODELS.find(m => m.family === family);
};

// Quick lookup by ID
export const getModelById = (id: string): ModelDefinition | undefined => {
  return LATEST_MODELS.find(m => m.id === id);
};

// Quick lookup by short name
export const getModelByShortName = (shortName: string): ModelDefinition | undefined => {
  return LATEST_MODELS.find(m => m.shortName === shortName);
};

// Map short names to full IDs (for CLI)
export const MODEL_ID_MAP: Record<string, string> = LATEST_MODELS.reduce((acc, model) => {
  acc[model.shortName] = model.id;
  acc[model.family] = model.id;  // Also map by family name
  return acc;
}, {} as Record<string, string>);

// Get full model ID from short name or return as-is if already full ID
export const resolveModelId = (modelIdOrShortName: string): string => {
  return MODEL_ID_MAP[modelIdOrShortName] || modelIdOrShortName;
};

// For UI dropdown display
export const getModelsForSelector = () => {
  return LATEST_MODELS.map(m => ({
    id: m.id,
    name: m.displayName,
    description: m.description
  }));
};
