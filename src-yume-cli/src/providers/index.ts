/**
 * Provider registry
 */

import type { Provider, ProviderType } from '../types.js';
import { GeminiProvider } from './gemini.js';
import { OpenAIProvider } from './openai.js';

/**
 * Create a provider instance
 */
export function createProvider(
  providerType: ProviderType,
  model: string,
  apiBase?: string
): Provider {
  switch (providerType) {
    case 'gemini':
      return new GeminiProvider(model, apiBase);
    case 'openai':
      return new OpenAIProvider(model, apiBase);
    default:
      throw new Error(`Unknown provider: ${providerType}`);
  }
}

/**
 * Get default model for a provider
 */
export function getDefaultModel(providerType: ProviderType): string {
  switch (providerType) {
    case 'gemini':
      return 'gemini-2.0-flash';
    case 'openai':
      return 'gpt-4o';
    case 'anthropic':
      return 'claude-sonnet-4-5-20250929';
    default:
      throw new Error(`Unknown provider: ${providerType}`);
  }
}

export { GeminiProvider } from './gemini.js';
export { OpenAIProvider } from './openai.js';
