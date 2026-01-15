/**
 * Base provider interface and utilities
 */

import type {
  Provider,
  ProviderType,
  ProviderChunk,
  HistoryMessage,
  ToolDefinition,
  ModelInfo,
} from '../types.js';

/**
 * Abstract base class for providers
 */
export abstract class BaseProvider implements Provider {
  abstract name: ProviderType;
  abstract generate(
    history: HistoryMessage[],
    tools: ToolDefinition[]
  ): AsyncGenerator<ProviderChunk>;
  abstract getModels(): ModelInfo[];

  /**
   * Convert history to provider-specific format
   */
  protected abstract formatHistory(
    history: HistoryMessage[]
  ): unknown[];

  /**
   * Convert tool definitions to provider-specific format
   */
  protected abstract formatTools(tools: ToolDefinition[]): unknown[];
}

/**
 * Provider configuration from environment
 */
export interface ProviderConfig {
  apiKey?: string;
  apiBase?: string;
  model: string;
}

/**
 * Get provider config from environment
 */
export function getProviderConfig(
  provider: ProviderType,
  model: string,
  apiBase?: string
): ProviderConfig {
  switch (provider) {
    case 'gemini':
      return {
        apiKey: process.env.GOOGLE_API_KEY,
        apiBase: apiBase || 'https://generativelanguage.googleapis.com',
        model,
      };
    case 'openai':
      return {
        apiKey: process.env.OPENAI_API_KEY,
        apiBase: apiBase || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        model,
      };
    case 'anthropic':
      return {
        apiKey: process.env.ANTHROPIC_API_KEY,
        apiBase: apiBase || 'https://api.anthropic.com',
        model,
      };
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Sleep utility for retries
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  initialDelay = 1000
): Promise<T> {
  let delay = initialDelay;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries - 1) {
        await sleep(delay);
        delay *= 2;
      }
    }
  }

  throw lastError;
}
