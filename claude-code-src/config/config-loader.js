/**
 * Configuration Loader
 * Loads and merges configuration from multiple sources
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { parse as parseYaml } from 'yaml';
import { 
  DEFAULT_CONFIG, 
  CONFIG_FILE_NAME, 
  GLOBAL_CONFIG_DIR 
} from '../cli/constants.js';

/**
 * Configuration sources in priority order (highest to lowest)
 */
const CONFIG_SOURCES = [
  'command-line',
  'environment',
  'local-file',
  'global-file',
  'defaults'
];

/**
 * Configuration loader class
 */
export class ConfigLoader {
  constructor(options = {}) {
    this.options = {
      configPath: options.configPath,
      globalConfigDir: options.globalConfigDir || join(homedir(), GLOBAL_CONFIG_DIR),
      localConfigName: options.localConfigName || CONFIG_FILE_NAME,
      envPrefix: options.envPrefix || 'CLAUDE_',
      allowedFormats: options.allowedFormats || ['json', 'yaml', 'yml', 'js'],
      throwOnError: options.throwOnError || false
    };
    
    this.config = {};
    this.sources = new Map();
  }
  
  /**
   * Load configuration from all sources
   */
  async load(commandLineOptions = {}) {
    // Start with defaults
    this.config = { ...DEFAULT_CONFIG };
    this.sources.set('defaults', { ...DEFAULT_CONFIG });
    
    // Load global config file
    const globalConfig = await this.loadGlobalConfig();
    if (globalConfig) {
      this.mergeConfig(globalConfig, 'global-file');
    }
    
    // Load local config file
    const localConfig = await this.loadLocalConfig();
    if (localConfig) {
      this.mergeConfig(localConfig, 'local-file');
    }
    
    // Load environment variables
    const envConfig = this.loadEnvironmentConfig();
    if (envConfig) {
      this.mergeConfig(envConfig, 'environment');
    }
    
    // Apply command-line options (highest priority)
    if (commandLineOptions && Object.keys(commandLineOptions).length > 0) {
      this.mergeConfig(commandLineOptions, 'command-line');
    }
    
    // Validate final configuration
    this.validateConfig();
    
    return this.config;
  }
  
  /**
   * Load global configuration file
   */
  async loadGlobalConfig() {
    const configPath = join(this.options.globalConfigDir, this.options.localConfigName);
    return await this.loadConfigFile(configPath);
  }
  
  /**
   * Load local configuration file
   */
  async loadLocalConfig() {
    // Check for config in current directory
    let configPath = this.options.configPath || this.options.localConfigName;
    
    if (!existsSync(configPath)) {
      // Try with different extensions
      for (const ext of this.options.allowedFormats) {
        const pathWithExt = `${configPath}.${ext}`;
        if (existsSync(pathWithExt)) {
          configPath = pathWithExt;
          break;
        }
      }
    }
    
    if (existsSync(configPath)) {
      return await this.loadConfigFile(configPath);
    }
    
    // Look for config in parent directories
    const parentConfig = await this.findConfigInParents();
    if (parentConfig) {
      return await this.loadConfigFile(parentConfig);
    }
    
    return null;
  }
  
  /**
   * Load configuration file
   */
  async loadConfigFile(filePath) {
    if (!existsSync(filePath)) {
      return null;
    }
    
    try {
      const ext = filePath.split('.').pop().toLowerCase();
      const content = await readFile(filePath, 'utf-8');
      
      switch (ext) {
        case 'json':
          return JSON.parse(content);
        
        case 'yaml':
        case 'yml':
          return parseYaml(content);
        
        case 'js':
        case 'mjs':
          // Dynamic import for JavaScript config
          const module = await import(filePath);
          return module.default || module.config || module;
        
        default:
          // Try to parse as JSON first, then YAML
          try {
            return JSON.parse(content);
          } catch {
            return parseYaml(content);
          }
      }
    } catch (error) {
      if (this.options.throwOnError) {
        throw new Error(`Failed to load config from ${filePath}: ${error.message}`);
      }
      console.error(`Warning: Failed to load config from ${filePath}: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Find configuration file in parent directories
   */
  async findConfigInParents(startPath = process.cwd()) {
    const { dirname } = await import('node:path');
    let currentPath = startPath;
    
    while (currentPath !== dirname(currentPath)) {
      // Check for config file
      for (const name of [this.options.localConfigName]) {
        const configPath = join(currentPath, name);
        if (existsSync(configPath)) {
          return configPath;
        }
        
        // Check with extensions
        for (const ext of this.options.allowedFormats) {
          const pathWithExt = `${configPath}.${ext}`;
          if (existsSync(pathWithExt)) {
            return pathWithExt;
          }
        }
      }
      
      // Move to parent directory
      currentPath = dirname(currentPath);
    }
    
    return null;
  }
  
  /**
   * Load configuration from environment variables
   */
  loadEnvironmentConfig() {
    const config = {};
    const prefix = this.options.envPrefix;
    
    // Map of environment variable names to config keys
    const envMap = {
      [`${prefix}API_KEY`]: 'apiKey',
      [`${prefix}MODEL`]: 'model',
      [`${prefix}MAX_TOKENS`]: 'maxTokens',
      [`${prefix}TEMPERATURE`]: 'temperature',
      [`${prefix}STREAM`]: 'stream',
      [`${prefix}BASE_URL`]: 'baseUrl',
      [`${prefix}TIMEOUT`]: 'timeout',
      [`${prefix}MAX_RETRIES`]: 'maxRetries',
      [`${prefix}AUTO_SAVE`]: 'autoSave',
      [`${prefix}CHECK_UPDATES`]: 'checkUpdates',
      [`${prefix}COLOR_OUTPUT`]: 'colorOutput',
      [`${prefix}VERBOSE_ERRORS`]: 'verboseErrors',
      [`${prefix}HISTORY_SIZE`]: 'historySize',
      [`${prefix}CONTEXT_WINDOW`]: 'contextWindow'
    };
    
    for (const [envKey, configKey] of Object.entries(envMap)) {
      if (process.env[envKey] !== undefined) {
        const value = process.env[envKey];
        
        // Parse value based on expected type
        if (configKey === 'maxTokens' || configKey === 'timeout' || 
            configKey === 'maxRetries' || configKey === 'historySize' || 
            configKey === 'contextWindow') {
          config[configKey] = parseInt(value, 10);
        } else if (configKey === 'temperature') {
          config[configKey] = parseFloat(value);
        } else if (configKey === 'stream' || configKey === 'autoSave' || 
                   configKey === 'checkUpdates' || configKey === 'colorOutput' || 
                   configKey === 'verboseErrors') {
          config[configKey] = value.toLowerCase() === 'true';
        } else {
          config[configKey] = value;
        }
      }
    }
    
    return Object.keys(config).length > 0 ? config : null;
  }
  
  /**
   * Merge configuration from a source
   */
  mergeConfig(sourceConfig, sourceName) {
    if (!sourceConfig) return;
    
    // Deep merge configuration
    this.config = this.deepMerge(this.config, sourceConfig);
    
    // Track source
    this.sources.set(sourceName, sourceConfig);
  }
  
  /**
   * Deep merge two objects
   */
  deepMerge(target, source) {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] !== undefined && source[key] !== null) {
        if (typeof source[key] === 'object' && !Array.isArray(source[key])) {
          result[key] = this.deepMerge(result[key] || {}, source[key]);
        } else {
          result[key] = source[key];
        }
      }
    }
    
    return result;
  }
  
  /**
   * Validate configuration
   */
  validateConfig() {
    const errors = [];
    
    // Validate required fields
    if (!this.config.apiKey && !process.env.ANTHROPIC_API_KEY) {
      // Not an error, but worth noting
      this.config.apiKey = null;
    }
    
    // Validate temperature range
    if (this.config.temperature < 0 || this.config.temperature > 1) {
      errors.push(`Invalid temperature: ${this.config.temperature} (must be 0-1)`);
    }
    
    // Validate max tokens
    if (this.config.maxTokens < 1) {
      errors.push(`Invalid maxTokens: ${this.config.maxTokens} (must be positive)`);
    }
    
    // Validate timeout
    if (this.config.timeout < 0) {
      errors.push(`Invalid timeout: ${this.config.timeout} (must be non-negative)`);
    }
    
    if (errors.length > 0 && this.options.throwOnError) {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }
    
    return errors.length === 0;
  }
  
  /**
   * Get configuration value
   */
  get(key, defaultValue = undefined) {
    return this.getPath(key) ?? defaultValue;
  }
  
  /**
   * Get configuration value by path (dot notation)
   */
  getPath(path) {
    const keys = path.split('.');
    let value = this.config;
    
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return undefined;
      }
    }
    
    return value;
  }
  
  /**
   * Set configuration value
   */
  set(key, value) {
    this.setPath(key, value);
  }
  
  /**
   * Set configuration value by path
   */
  setPath(path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    let target = this.config;
    
    for (const key of keys) {
      if (!(key in target) || typeof target[key] !== 'object') {
        target[key] = {};
      }
      target = target[key];
    }
    
    target[lastKey] = value;
  }
  
  /**
   * Get all configuration
   */
  getAll() {
    return { ...this.config };
  }
  
  /**
   * Get configuration source for a key
   */
  getSource(key) {
    // Check sources in priority order
    for (const source of CONFIG_SOURCES) {
      const sourceConfig = this.sources.get(source);
      if (sourceConfig && key in sourceConfig) {
        return source;
      }
    }
    
    return null;
  }
  
  /**
   * Get all configuration sources
   */
  getSources() {
    const sources = {};
    
    for (const [name, config] of this.sources.entries()) {
      sources[name] = { ...config };
    }
    
    return sources;
  }
}

/**
 * Load configuration (convenience function)
 */
export async function loadConfig(options = {}) {
  const loader = new ConfigLoader(options);
  return await loader.load(options.commandLineOptions);
}

/**
 * Find configuration file
 */
export async function findConfigFile(startPath = process.cwd()) {
  const loader = new ConfigLoader();
  return await loader.findConfigInParents(startPath);
}

export default {
  ConfigLoader,
  loadConfig,
  findConfigFile
};