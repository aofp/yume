/**
 * LocalStorageService - Type-safe localStorage abstraction with caching
 *
 * Benefits:
 * - Type-safe storage operations with TypeScript
 * - Built-in caching layer to reduce localStorage I/O
 * - Automatic JSON serialization/deserialization with error handling
 * - Centralized storage key management
 * - Easy migration if storage strategy changes
 */

export interface StorageOptions {
  useCache?: boolean;
  ttl?: number; // Time-to-live in milliseconds (0 = no expiration)
}

interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number;
}

class LocalStorageService {
  private cache = new Map<string, CacheEntry<any>>();
  private defaultOptions: StorageOptions = {
    useCache: true,
    ttl: 0, // No expiration by default
  };

  /**
   * Get a value from localStorage with optional caching
   */
  get<T>(key: string, defaultValue?: T, options?: StorageOptions): T | undefined {
    const opts = { ...this.defaultOptions, ...options };

    // Check cache first
    if (opts.useCache && this.cache.has(key)) {
      const entry = this.cache.get(key)!;

      // Check if cache is still valid
      if (entry.ttl === 0 || Date.now() - entry.timestamp < entry.ttl) {
        return entry.value as T;
      }

      // Cache expired, remove it
      this.cache.delete(key);
    }

    // Read from localStorage
    try {
      const item = localStorage.getItem(key);

      if (item === null) {
        return defaultValue;
      }

      const parsed = JSON.parse(item) as T;

      // Update cache
      if (opts.useCache) {
        this.cache.set(key, {
          value: parsed,
          timestamp: Date.now(),
          ttl: opts.ttl!,
        });
      }

      return parsed;
    } catch (error) {
      logger.error(`[LocalStorageService] Failed to get key "${key}":`, error);
      return defaultValue;
    }
  }

  /**
   * Set a value in localStorage with automatic JSON serialization
   */
  set<T>(key: string, value: T, options?: StorageOptions): boolean {
    const opts = { ...this.defaultOptions, ...options };

    try {
      const serialized = JSON.stringify(value);
      localStorage.setItem(key, serialized);

      // Update cache
      if (opts.useCache) {
        this.cache.set(key, {
          value,
          timestamp: Date.now(),
          ttl: opts.ttl!,
        });
      }

      return true;
    } catch (error) {
      logger.error(`[LocalStorageService] Failed to set key "${key}":`, error);
      return false;
    }
  }

  /**
   * Remove a value from localStorage and cache
   */
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
      this.cache.delete(key);
    } catch (error) {
      logger.error(`[LocalStorageService] Failed to remove key "${key}":`, error);
    }
  }

  /**
   * Check if a key exists in localStorage
   */
  has(key: string): boolean {
    return localStorage.getItem(key) !== null;
  }

  /**
   * Clear all localStorage data and cache
   */
  clear(): void {
    try {
      localStorage.clear();
      this.cache.clear();
    } catch (error) {
      logger.error('[LocalStorageService] Failed to clear storage:', error);
    }
  }

  /**
   * Get all keys in localStorage
   */
  keys(): string[] {
    const keys: string[] = [];

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          keys.push(key);
        }
      }
    } catch (error) {
      logger.error('[LocalStorageService] Failed to get keys:', error);
    }

    return keys;
  }

  /**
   * Clear cache only (not localStorage)
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache size for debugging
   */
  getCacheSize(): number {
    return this.cache.size;
  }

  /**
   * Get an item without caching (always reads from localStorage)
   */
  getUncached<T>(key: string, defaultValue?: T): T | undefined {
    return this.get<T>(key, defaultValue, { useCache: false });
  }

  /**
   * Set an item without caching (always writes to localStorage)
   */
  setUncached<T>(key: string, value: T): boolean {
    return this.set<T>(key, value, { useCache: false });
  }

  /**
   * Batch get multiple keys
   */
  getMany<T>(keys: string[], defaultValue?: T): Map<string, T | undefined> {
    const result = new Map<string, T | undefined>();

    for (const key of keys) {
      result.set(key, this.get<T>(key, defaultValue));
    }

    return result;
  }

  /**
   * Batch set multiple keys
   */
  setMany<T>(entries: Map<string, T>): boolean {
    let allSuccessful = true;

    for (const [key, value] of entries) {
      if (!this.set(key, value)) {
        allSuccessful = false;
      }
    }

    return allSuccessful;
  }
}

// Export singleton instance
export const localStorageService = new LocalStorageService();

// Export class for testing
export { LocalStorageService };
