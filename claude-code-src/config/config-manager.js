/**
 * Configuration Manager
 * Manages reading, writing, and updating configuration files
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import {
  DEFAULT_CONFIG,
  CONFIG_FILE_NAME,
  GLOBAL_CONFIG_DIR
} from '../cli/constants.js';

/**
 * Configuration manager class
 */
export class ConfigManager {
  constructor(options = {}) {
    this.options = {
      globalConfigDir: options.globalConfigDir || join(homedir(), GLOBAL_CONFIG_DIR),
      localConfigName: options.localConfigName || CONFIG_FILE_NAME,
      format: options.format || 'json', // json, yaml
      prettify: options.prettify !== false,
      createDirs: options.createDirs !== false
    };
  }
  
  /**
   * Get configuration file path
   */
  getConfigPath(isGlobal = false) {
    if (isGlobal) {
      return join(this.options.globalConfigDir, this.options.localConfigName);
    }
    
    return this.options.localConfigName;
  }
  
  /**
   * Read configuration file
   */
  async readConfig(isGlobal = false) {
    const configPath = this.getConfigPath(isGlobal);
    
    if (!existsSync(configPath)) {
      return null;
    }
    
    try {
      const content = await readFile(configPath, 'utf-8');
      
      // Detect format from content or extension
      const format = this.detectFormat(configPath, content);
      
      if (format === 'yaml' || format === 'yml') {
        return parseYaml(content);
      } else {
        return JSON.parse(content);
      }
    } catch (error) {
      throw new Error(`Failed to read config from ${configPath}: ${error.message}`);
    }
  }
  
  /**
   * Write configuration file
   */
  async writeConfig(config, isGlobal = false) {
    const configPath = this.getConfigPath(isGlobal);
    
    // Ensure directory exists if creating global config
    if (isGlobal && this.options.createDirs) {
      const dir = dirname(configPath);
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }
    }
    
    try {
      let content;
      
      if (this.options.format === 'yaml' || this.options.format === 'yml') {
        content = stringifyYaml(config, {
          indent: 2,
          lineWidth: 0 // No line wrapping
        });
      } else {
        content = JSON.stringify(
          config, 
          null, 
          this.options.prettify ? 2 : 0
        );
      }
      
      await writeFile(configPath, content, 'utf-8');
      
      return configPath;
    } catch (error) {
      throw new Error(`Failed to write config to ${configPath}: ${error.message}`);
    }
  }
  
  /**
   * Update configuration value
   */
  async updateConfig(key, value, isGlobal = false) {
    // Read existing config or use defaults
    let config = await this.readConfig(isGlobal);
    
    if (!config) {
      config = isGlobal ? {} : { ...DEFAULT_CONFIG };
    }
    
    // Set value using dot notation
    this.setValueByPath(config, key, value);
    
    // Write updated config
    await this.writeConfig(config, isGlobal);
    
    return config;
  }
  
  /**
   * Delete configuration value
   */
  async deleteConfig(key, isGlobal = false) {
    const config = await this.readConfig(isGlobal);
    
    if (!config) {
      return null;
    }
    
    // Delete value using dot notation
    this.deleteValueByPath(config, key);
    
    // Write updated config
    await this.writeConfig(config, isGlobal);
    
    return config;
  }
  
  /**
   * Reset configuration to defaults
   */
  async resetConfig(isGlobal = false) {
    const config = isGlobal ? {} : { ...DEFAULT_CONFIG };
    await this.writeConfig(config, isGlobal);
    return config;
  }
  
  /**
   * Merge configuration
   */
  async mergeConfig(updates, isGlobal = false) {
    const config = await this.readConfig(isGlobal) || {};
    const merged = this.deepMerge(config, updates);
    await this.writeConfig(merged, isGlobal);
    return merged;
  }
  
  /**
   * Set value by dot notation path
   */
  setValueByPath(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    let target = obj;
    
    for (const key of keys) {
      if (!(key in target) || typeof target[key] !== 'object') {
        target[key] = {};
      }
      target = target[key];
    }
    
    // Parse value if it's a string representation
    if (typeof value === 'string') {
      value = this.parseValue(value);
    }
    
    target[lastKey] = value;
  }
  
  /**
   * Delete value by dot notation path
   */
  deleteValueByPath(obj, path) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    let target = obj;
    
    for (const key of keys) {
      if (!(key in target)) {
        return;
      }
      target = target[key];
    }
    
    delete target[lastKey];
  }
  
  /**
   * Parse string value to appropriate type
   */
  parseValue(value) {
    // Boolean
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
    
    // Null
    if (value.toLowerCase() === 'null') return null;
    
    // Number
    if (/^-?\d+$/.test(value)) {
      return parseInt(value, 10);
    }
    if (/^-?\d*\.\d+$/.test(value)) {
      return parseFloat(value);
    }
    
    // Array (simple comma-separated)
    if (value.startsWith('[') && value.endsWith(']')) {
      const items = value.slice(1, -1).split(',');
      return items.map(item => this.parseValue(item.trim()));
    }
    
    // Object (try JSON)
    if (value.startsWith('{') && value.endsWith('}')) {
      try {
        return JSON.parse(value);
      } catch {
        // Not valid JSON, return as string
      }
    }
    
    // String (remove quotes if present)
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }
    
    return value;
  }
  
  /**
   * Deep merge objects
   */
  deepMerge(target, source) {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] !== undefined) {
        if (typeof source[key] === 'object' && 
            !Array.isArray(source[key]) && 
            source[key] !== null) {
          result[key] = this.deepMerge(result[key] || {}, source[key]);
        } else {
          result[key] = source[key];
        }
      }
    }
    
    return result;
  }
  
  /**
   * Detect configuration format
   */
  detectFormat(filePath, content = null) {
    // Check file extension
    const ext = filePath.split('.').pop().toLowerCase();
    if (['yaml', 'yml'].includes(ext)) {
      return 'yaml';
    }
    if (ext === 'json') {
      return 'json';
    }
    
    // Try to detect from content
    if (content) {
      // Simple heuristic: JSON starts with { or [
      if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
        return 'json';
      }
      
      // Check for YAML indicators
      if (content.includes('---') || content.includes(':')) {
        return 'yaml';
      }
    }
    
    // Default to JSON
    return 'json';
  }
  
  /**
   * List all configuration keys
   */
  async listKeys(isGlobal = false) {
    const config = await this.readConfig(isGlobal);
    
    if (!config) {
      return [];
    }
    
    return this.flattenKeys(config);
  }
  
  /**
   * Flatten object keys to dot notation
   */
  flattenKeys(obj, prefix = '') {
    const keys = [];
    
    for (const key in obj) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      
      if (typeof obj[key] === 'object' && 
          !Array.isArray(obj[key]) && 
          obj[key] !== null) {
        keys.push(...this.flattenKeys(obj[key], fullKey));
      } else {
        keys.push(fullKey);
      }
    }
    
    return keys;
  }
  
  /**
   * Validate configuration
   */
  validateConfig(config) {
    const errors = [];
    
    // Check for required fields
    // Note: API key is not strictly required as it can come from env
    
    // Validate types
    if (config.temperature !== undefined) {
      if (typeof config.temperature !== 'number' || 
          config.temperature < 0 || 
          config.temperature > 1) {
        errors.push('temperature must be a number between 0 and 1');
      }
    }
    
    if (config.maxTokens !== undefined) {
      if (typeof config.maxTokens !== 'number' || config.maxTokens < 1) {
        errors.push('maxTokens must be a positive number');
      }
    }
    
    if (config.timeout !== undefined) {
      if (typeof config.timeout !== 'number' || config.timeout < 0) {
        errors.push('timeout must be a non-negative number');
      }
    }
    
    if (config.maxRetries !== undefined) {
      if (typeof config.maxRetries !== 'number' || config.maxRetries < 0) {
        errors.push('maxRetries must be a non-negative number');
      }
    }
    
    return errors;
  }
}

// Singleton instance for convenience functions
let defaultManager = null;

/**
 * Get default config manager
 */
function getDefaultManager() {
  if (!defaultManager) {
    defaultManager = new ConfigManager();
  }
  return defaultManager;
}

/**
 * Show configuration
 */
export async function showConfig(isGlobal = false) {
  const manager = getDefaultManager();
  const config = await manager.readConfig(isGlobal);
  return config || (isGlobal ? {} : DEFAULT_CONFIG);
}

/**
 * Set configuration value
 */
export async function setConfig(key, value, isGlobal = false) {
  const manager = getDefaultManager();
  return await manager.updateConfig(key, value, isGlobal);
}

/**
 * Delete configuration value
 */
export async function deleteConfig(key, isGlobal = false) {
  const manager = getDefaultManager();
  return await manager.deleteConfig(key, isGlobal);
}

/**
 * Reset configuration
 */
export async function resetConfig(isGlobal = false) {
  const manager = getDefaultManager();
  return await manager.resetConfig(isGlobal);
}

/**
 * Merge configuration
 */
export async function mergeConfig(updates, isGlobal = false) {
  const manager = getDefaultManager();
  return await manager.mergeConfig(updates, isGlobal);
}

/**
 * List configuration keys
 */
export async function listConfigKeys(isGlobal = false) {
  const manager = getDefaultManager();
  return await manager.listKeys(isGlobal);
}

export default {
  ConfigManager,
  showConfig,
  setConfig,
  deleteConfig,
  resetConfig,
  mergeConfig,
  listConfigKeys
};