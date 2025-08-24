/**
 * Error Handler
 * Centralized error handling for the CLI application
 */

import { ERROR_CODES, COLORS } from './constants.js';
import chalk from 'chalk';

/**
 * Error class for CLI-specific errors
 */
export class CLIError extends Error {
  constructor(message, code = ERROR_CODES.UNKNOWN, details = null) {
    super(message);
    this.name = 'CLIError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Error class for API-related errors
 */
export class APIError extends CLIError {
  constructor(message, statusCode, response = null) {
    super(message, ERROR_CODES.SERVER_ERROR, { statusCode, response });
    this.name = 'APIError';
    this.statusCode = statusCode;
    this.response = response;
  }
}

/**
 * Error class for network-related errors
 */
export class NetworkError extends CLIError {
  constructor(message, originalError = null) {
    super(message, ERROR_CODES.NETWORK_ERROR, { originalError });
    this.name = 'NetworkError';
    this.originalError = originalError;
  }
}

/**
 * Error class for authentication errors
 */
export class AuthError extends CLIError {
  constructor(message) {
    super(message, ERROR_CODES.INVALID_API_KEY);
    this.name = 'AuthError';
  }
}

/**
 * Error class for rate limiting
 */
export class RateLimitError extends CLIError {
  constructor(message, retryAfter = null) {
    super(message, ERROR_CODES.RATE_LIMIT, { retryAfter });
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

/**
 * Error class for context length errors
 */
export class ContextLengthError extends CLIError {
  constructor(message, currentLength, maxLength) {
    super(message, ERROR_CODES.CONTEXT_LENGTH, { currentLength, maxLength });
    this.name = 'ContextLengthError';
    this.currentLength = currentLength;
    this.maxLength = maxLength;
  }
}

/**
 * Main error handler function
 */
export function handleError(error, options = {}) {
  const { debug = false, verbose = false, quiet = false } = options;
  
  if (quiet) {
    return; // Don't display errors in quiet mode
  }
  
  // Format error message based on error type
  let errorMessage = formatErrorMessage(error);
  
  // Add error code if available
  if (error.code) {
    errorMessage = `[${error.code}] ${errorMessage}`;
  }
  
  // Display main error message
  console.error(chalk[COLORS.error]('Error:'), errorMessage);
  
  // Display additional details based on error type
  if (error instanceof RateLimitError && error.retryAfter) {
    console.error(chalk[COLORS.warning](`  Retry after: ${error.retryAfter} seconds`));
  }
  
  if (error instanceof ContextLengthError) {
    console.error(chalk[COLORS.info](
      `  Context length: ${error.currentLength} / ${error.maxLength} tokens`
    ));
  }
  
  if (error instanceof APIError && verbose) {
    console.error(chalk[COLORS.muted](`  Status code: ${error.statusCode}`));
    if (error.response) {
      console.error(chalk[COLORS.muted]('  Response:'), error.response);
    }
  }
  
  // Display stack trace in debug mode
  if (debug && error.stack) {
    console.error(chalk[COLORS.muted]('\nStack trace:'));
    console.error(chalk[COLORS.muted](error.stack));
  }
  
  // Provide helpful suggestions
  const suggestion = getSuggestion(error);
  if (suggestion) {
    console.error(chalk[COLORS.info]('\nSuggestion:'), suggestion);
  }
  
  // Log to file if configured
  if (options.logFile) {
    logErrorToFile(error, options.logFile);
  }
}

/**
 * Format error message based on error type
 */
function formatErrorMessage(error) {
  if (error instanceof CLIError) {
    return error.message;
  }
  
  if (error instanceof Error) {
    return error.message;
  }
  
  if (typeof error === 'string') {
    return error;
  }
  
  return 'An unexpected error occurred';
}

/**
 * Get helpful suggestion based on error type
 */
function getSuggestion(error) {
  const suggestions = {
    [ERROR_CODES.NO_API_KEY]: 'Set your API key using: claude auth login --token YOUR_API_KEY',
    [ERROR_CODES.INVALID_API_KEY]: 'Check your API key and try logging in again',
    [ERROR_CODES.RATE_LIMIT]: 'Wait a moment before trying again or upgrade your plan',
    [ERROR_CODES.NETWORK_ERROR]: 'Check your internet connection and try again',
    [ERROR_CODES.INVALID_MODEL]: 'Use --model flag with a valid model name',
    [ERROR_CODES.CONTEXT_LENGTH]: 'Try reducing the input size or use a model with larger context',
    [ERROR_CODES.SERVER_ERROR]: 'The server is experiencing issues. Please try again later'
  };
  
  if (error.code && suggestions[error.code]) {
    return suggestions[error.code];
  }
  
  // Check for specific error messages
  if (error.message) {
    if (error.message.includes('ENOENT')) {
      return 'File or directory not found. Check the path and try again';
    }
    
    if (error.message.includes('EACCES')) {
      return 'Permission denied. Try running with appropriate permissions';
    }
    
    if (error.message.includes('ECONNREFUSED')) {
      return 'Connection refused. Check if the service is running';
    }
    
    if (error.message.includes('timeout')) {
      return 'Request timed out. Try again or increase timeout in configuration';
    }
  }
  
  return null;
}

/**
 * Log error to file
 */
async function logErrorToFile(error, logFile) {
  try {
    const { appendFile } = await import('node:fs/promises');
    const logEntry = {
      timestamp: new Date().toISOString(),
      type: error.name || 'Error',
      code: error.code,
      message: error.message,
      stack: error.stack,
      details: error.details
    };
    
    await appendFile(logFile, JSON.stringify(logEntry) + '\n');
  } catch (logError) {
    // Silently fail if logging fails
    if (process.env.DEBUG) {
      console.error('Failed to log error:', logError);
    }
  }
}

/**
 * Create user-friendly error message
 */
export function createUserMessage(error) {
  const messages = {
    [ERROR_CODES.NO_API_KEY]: 'No API key found. Please configure your API key first.',
    [ERROR_CODES.INVALID_API_KEY]: 'Invalid API key. Please check your credentials.',
    [ERROR_CODES.RATE_LIMIT]: 'Rate limit exceeded. Please wait before making more requests.',
    [ERROR_CODES.NETWORK_ERROR]: 'Network error. Please check your connection.',
    [ERROR_CODES.INVALID_MODEL]: 'Invalid model specified. Please use a supported model.',
    [ERROR_CODES.CONTEXT_LENGTH]: 'Input exceeds maximum context length.',
    [ERROR_CODES.SERVER_ERROR]: 'Server error. Please try again later.'
  };
  
  if (error.code && messages[error.code]) {
    return messages[error.code];
  }
  
  return error.message || 'An unexpected error occurred';
}

/**
 * Wrap async functions with error handling
 */
export function withErrorHandling(fn, options = {}) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      handleError(error, options);
      
      if (options.rethrow) {
        throw error;
      }
      
      if (options.exitOnError) {
        process.exit(1);
      }
    }
  };
}

/**
 * Create error from HTTP response
 */
export function createErrorFromResponse(response) {
  const statusCode = response.status || response.statusCode;
  const message = response.statusText || response.message || 'API request failed';
  
  if (statusCode === 401) {
    return new AuthError('Authentication failed');
  }
  
  if (statusCode === 429) {
    const retryAfter = response.headers?.['retry-after'];
    return new RateLimitError('Rate limit exceeded', retryAfter);
  }
  
  if (statusCode >= 500) {
    return new APIError('Server error', statusCode, response.data);
  }
  
  if (statusCode >= 400) {
    return new APIError(message, statusCode, response.data);
  }
  
  return new CLIError(message);
}

export default {
  CLIError,
  APIError,
  NetworkError,
  AuthError,
  RateLimitError,
  ContextLengthError,
  handleError,
  createUserMessage,
  withErrorHandling,
  createErrorFromResponse
};