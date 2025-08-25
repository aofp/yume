/**
 * Validation Utilities
 * Input validation and sanitization functions
 */

import { AVAILABLE_MODELS, SUPPORTED_LANGUAGES, ANALYSIS_TYPES, OUTPUT_FORMATS } from '../cli/constants.js';

/**
 * Validate API key format
 */
export function validateApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') {
    return false;
  }
  
  // Check for basic format (starts with sk- and has reasonable length)
  if (apiKey.startsWith('sk-') && apiKey.length > 20 && apiKey.length < 200) {
    return true;
  }
  
  // Also accept bearer tokens
  if (apiKey.startsWith('Bearer ') && apiKey.length > 30) {
    return true;
  }
  
  return false;
}

/**
 * Validate model name
 */
export function validateModel(model) {
  if (!model || typeof model !== 'string') {
    return false;
  }
  
  // Check against known models
  if (AVAILABLE_MODELS.includes(model)) {
    return true;
  }
  
  // Check for custom model patterns
  if (model.startsWith('claude-') || model.includes('anthropic')) {
    return true;
  }
  
  return false;
}

/**
 * Validate temperature value
 */
export function validateTemperature(temperature) {
  const temp = parseFloat(temperature);
  
  if (isNaN(temp)) {
    return false;
  }
  
  return temp >= 0 && temp <= 1;
}

/**
 * Validate max tokens
 */
export function validateMaxTokens(maxTokens) {
  const tokens = parseInt(maxTokens, 10);
  
  if (isNaN(tokens)) {
    return false;
  }
  
  return tokens > 0 && tokens <= 200000; // Claude's max context
}

/**
 * Validate language code
 */
export function validateLanguage(language) {
  if (!language || typeof language !== 'string') {
    return false;
  }
  
  const normalized = language.toLowerCase();
  return SUPPORTED_LANGUAGES.includes(normalized);
}

/**
 * Validate analysis type
 */
export function validateAnalysisType(type) {
  if (!type || typeof type !== 'string') {
    return false;
  }
  
  const normalized = type.toLowerCase();
  return ANALYSIS_TYPES.includes(normalized);
}

/**
 * Validate output format
 */
export function validateOutputFormat(format) {
  if (!format || typeof format !== 'string') {
    return false;
  }
  
  const normalized = format.toLowerCase();
  return OUTPUT_FORMATS.includes(normalized);
}

/**
 * Validate URL
 */
export function validateUrl(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }
  
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Validate file path
 */
export function validateFilePath(path) {
  if (!path || typeof path !== 'string') {
    return false;
  }
  
  // Check for dangerous patterns
  const dangerous = [
    '..',  // Directory traversal
    '~',   // Home directory expansion
    '$',   // Variable expansion
    '`',   // Command substitution
    '|',   // Pipe
    '>',   // Redirect
    '<',   // Redirect
    '&',   // Background
    ';',   // Command separator
    '\n',  // Newline
    '\r',  // Carriage return
    '\0'   // Null byte
  ];
  
  for (const pattern of dangerous) {
    if (path.includes(pattern)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Validate email address
 */
export function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return false;
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate JSON string
 */
export function validateJson(jsonString) {
  if (!jsonString || typeof jsonString !== 'string') {
    return false;
  }
  
  try {
    JSON.parse(jsonString);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate port number
 */
export function validatePort(port) {
  const portNum = parseInt(port, 10);
  
  if (isNaN(portNum)) {
    return false;
  }
  
  return portNum > 0 && portNum <= 65535;
}

/**
 * Validate timeout value
 */
export function validateTimeout(timeout) {
  const timeoutMs = parseInt(timeout, 10);
  
  if (isNaN(timeoutMs)) {
    return false;
  }
  
  return timeoutMs >= 0 && timeoutMs <= 600000; // Max 10 minutes
}

/**
 * Sanitize string input
 */
export function sanitizeString(input, maxLength = 1000) {
  if (!input || typeof input !== 'string') {
    return '';
  }
  
  // Remove control characters except newline and tab
  let sanitized = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  
  // Trim and limit length
  sanitized = sanitized.trim().substring(0, maxLength);
  
  return sanitized;
}

/**
 * Sanitize file path
 */
export function sanitizeFilePath(path) {
  if (!path || typeof path !== 'string') {
    return '';
  }
  
  // Remove dangerous characters
  let sanitized = path.replace(/[<>:"|?*\x00-\x1F]/g, '');
  
  // Remove directory traversal attempts
  sanitized = sanitized.replace(/\.\./g, '');
  
  // Remove leading/trailing dots and spaces
  sanitized = sanitized.replace(/^[\s.]+|[\s.]+$/g, '');
  
  return sanitized;
}

/**
 * Sanitize command arguments
 */
export function sanitizeCommandArgs(args) {
  if (!Array.isArray(args)) {
    return [];
  }
  
  return args.map(arg => {
    if (typeof arg !== 'string') {
      return String(arg);
    }
    
    // Quote arguments with spaces or special characters
    if (/[\s'"\\;|<>&$`]/.test(arg)) {
      return `"${arg.replace(/["\\]/g, '\\$&')}"`;
    }
    
    return arg;
  });
}

/**
 * Validate and parse integer
 */
export function parseInteger(value, defaultValue = 0, min = null, max = null) {
  const parsed = parseInt(value, 10);
  
  if (isNaN(parsed)) {
    return defaultValue;
  }
  
  if (min !== null && parsed < min) {
    return min;
  }
  
  if (max !== null && parsed > max) {
    return max;
  }
  
  return parsed;
}

/**
 * Validate and parse float
 */
export function parseFloat(value, defaultValue = 0, min = null, max = null) {
  const parsed = globalThis.parseFloat(value);
  
  if (isNaN(parsed)) {
    return defaultValue;
  }
  
  if (min !== null && parsed < min) {
    return min;
  }
  
  if (max !== null && parsed > max) {
    return max;
  }
  
  return parsed;
}

/**
 * Validate and parse boolean
 */
export function parseBoolean(value, defaultValue = false) {
  if (typeof value === 'boolean') {
    return value;
  }
  
  if (typeof value === 'string') {
    const normalized = value.toLowerCase().trim();
    
    if (['true', 'yes', 'on', '1'].includes(normalized)) {
      return true;
    }
    
    if (['false', 'no', 'off', '0'].includes(normalized)) {
      return false;
    }
  }
  
  return defaultValue;
}

/**
 * Validate object schema
 */
export function validateSchema(obj, schema) {
  const errors = [];
  
  for (const [key, rules] of Object.entries(schema)) {
    const value = obj[key];
    
    // Check required
    if (rules.required && (value === undefined || value === null)) {
      errors.push(`${key} is required`);
      continue;
    }
    
    // Skip optional undefined values
    if (value === undefined && !rules.required) {
      continue;
    }
    
    // Check type
    if (rules.type) {
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      if (actualType !== rules.type) {
        errors.push(`${key} must be of type ${rules.type}`);
        continue;
      }
    }
    
    // Check enum values
    if (rules.enum && !rules.enum.includes(value)) {
      errors.push(`${key} must be one of: ${rules.enum.join(', ')}`);
    }
    
    // Check string patterns
    if (rules.pattern && typeof value === 'string') {
      const regex = new RegExp(rules.pattern);
      if (!regex.test(value)) {
        errors.push(`${key} does not match required pattern`);
      }
    }
    
    // Check numeric ranges
    if (typeof value === 'number') {
      if (rules.min !== undefined && value < rules.min) {
        errors.push(`${key} must be at least ${rules.min}`);
      }
      if (rules.max !== undefined && value > rules.max) {
        errors.push(`${key} must be at most ${rules.max}`);
      }
    }
    
    // Check string length
    if (typeof value === 'string') {
      if (rules.minLength !== undefined && value.length < rules.minLength) {
        errors.push(`${key} must be at least ${rules.minLength} characters`);
      }
      if (rules.maxLength !== undefined && value.length > rules.maxLength) {
        errors.push(`${key} must be at most ${rules.maxLength} characters`);
      }
    }
    
    // Check array length
    if (Array.isArray(value)) {
      if (rules.minItems !== undefined && value.length < rules.minItems) {
        errors.push(`${key} must have at least ${rules.minItems} items`);
      }
      if (rules.maxItems !== undefined && value.length > rules.maxItems) {
        errors.push(`${key} must have at most ${rules.maxItems} items`);
      }
    }
    
    // Custom validator
    if (rules.validate && typeof rules.validate === 'function') {
      const result = rules.validate(value);
      if (result !== true) {
        errors.push(result || `${key} is invalid`);
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

export default {
  validateApiKey,
  validateModel,
  validateTemperature,
  validateMaxTokens,
  validateLanguage,
  validateAnalysisType,
  validateOutputFormat,
  validateUrl,
  validateFilePath,
  validateEmail,
  validateJson,
  validatePort,
  validateTimeout,
  sanitizeString,
  sanitizeFilePath,
  sanitizeCommandArgs,
  parseInteger,
  parseFloat,
  parseBoolean,
  validateSchema
};