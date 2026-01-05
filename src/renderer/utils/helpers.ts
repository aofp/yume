/**
 * Shared utility functions for the renderer
 */

// Check if we're in development mode
export const isDev = import.meta.env?.DEV || (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development');

/**
 * Check if text starts with bash mode prefix ($ or !)
 */
export const isBashPrefix = (text: string): boolean => {
  return text.startsWith('$') || text.startsWith('!');
};

/**
 * Debug logging helper - only logs when in development mode
 */
export const debugLog = (...args: unknown[]): void => {
  if (isDev) {
    console.log(...args);
  }
};

/**
 * Conditional debug logging with custom flag
 */
export const createDebugLogger = (enabled: boolean | (() => boolean)) => {
  return (...args: unknown[]): void => {
    const shouldLog = typeof enabled === 'function' ? enabled() : enabled;
    if (shouldLog) {
      console.log(...args);
    }
  };
};
