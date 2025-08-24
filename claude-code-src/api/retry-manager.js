/**
 * Retry Manager
 * Handles retry logic for API requests
 */

/**
 * Retry manager implementation
 */
export class RetryManager {
  constructor(config = {}) {
    this.config = {
      maxRetries: config.maxRetries || 3,
      initialDelay: config.initialDelay || 1000,
      maxDelay: config.maxDelay || 10000,
      backoffFactor: config.backoffFactor || 2,
      jitter: config.jitter !== false,
      retryableErrors: config.retryableErrors || [
        'ECONNRESET',
        'ETIMEDOUT',
        'ENOTFOUND',
        'ECONNREFUSED',
        'NetworkError'
      ],
      retryableStatusCodes: config.retryableStatusCodes || [
        408, // Request Timeout
        429, // Too Many Requests
        500, // Internal Server Error
        502, // Bad Gateway
        503, // Service Unavailable
        504  // Gateway Timeout
      ]
    };
  }
  
  /**
   * Execute function with retry logic
   */
  async retry(fn, options = {}) {
    const maxRetries = options.maxRetries ?? this.config.maxRetries;
    const onRetry = options.onRetry;
    
    let lastError;
    let delay = this.config.initialDelay;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Execute the function
        const result = await fn();
        
        // Success - return result
        return result;
        
      } catch (error) {
        lastError = error;
        
        // Check if error is retryable
        if (!this.isRetryable(error)) {
          throw error;
        }
        
        // Check if we've exceeded max retries
        if (attempt === maxRetries) {
          throw this.wrapError(error, attempt + 1);
        }
        
        // Calculate delay for next attempt
        delay = this.calculateDelay(delay, attempt, error);
        
        // Call retry callback if provided
        if (onRetry) {
          onRetry(error, attempt + 1, delay);
        }
        
        // Wait before retrying
        await this.sleep(delay);
        
        // Increase delay for next iteration
        delay = Math.min(delay * this.config.backoffFactor, this.config.maxDelay);
      }
    }
    
    // Should not reach here, but throw last error just in case
    throw lastError;
  }
  
  /**
   * Check if error is retryable
   */
  isRetryable(error) {
    // Check error code
    if (error.code && this.config.retryableErrors.includes(error.code)) {
      return true;
    }
    
    // Check error name
    if (error.name && this.config.retryableErrors.includes(error.name)) {
      return true;
    }
    
    // Check HTTP status code
    if (error.statusCode && this.config.retryableStatusCodes.includes(error.statusCode)) {
      return true;
    }
    
    // Check for rate limit errors (special handling)
    if (error.name === 'RateLimitError') {
      return true;
    }
    
    // Check for timeout errors
    if (error.message && error.message.toLowerCase().includes('timeout')) {
      return true;
    }
    
    // Check for network errors
    if (error.message && error.message.toLowerCase().includes('network')) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Calculate delay for next retry
   */
  calculateDelay(baseDelay, attempt, error) {
    let delay = baseDelay;
    
    // Check for rate limit retry-after header
    if (error.retryAfter) {
      // retryAfter is in seconds, convert to milliseconds
      delay = error.retryAfter * 1000;
    }
    
    // Add jitter to prevent thundering herd
    if (this.config.jitter) {
      const jitter = Math.random() * 0.3 * delay; // Up to 30% jitter
      delay = delay + jitter;
    }
    
    // Ensure delay doesn't exceed max
    delay = Math.min(delay, this.config.maxDelay);
    
    return Math.round(delay);
  }
  
  /**
   * Wrap error with retry information
   */
  wrapError(error, attempts) {
    const wrappedError = new Error(
      `Failed after ${attempts} attempt${attempts > 1 ? 's' : ''}: ${error.message}`
    );
    
    wrappedError.name = 'RetryError';
    wrappedError.originalError = error;
    wrappedError.attempts = attempts;
    wrappedError.code = error.code;
    wrappedError.statusCode = error.statusCode;
    
    return wrappedError;
  }
  
  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Create retryable function
   */
  createRetryable(fn, options = {}) {
    return async (...args) => {
      return await this.retry(() => fn(...args), options);
    };
  }
  
  /**
   * Exponential backoff helper
   */
  static exponentialBackoff(attempt, base = 1000, max = 30000) {
    const delay = Math.min(base * Math.pow(2, attempt), max);
    const jitter = Math.random() * 0.3 * delay;
    return Math.round(delay + jitter);
  }
  
  /**
   * Linear backoff helper
   */
  static linearBackoff(attempt, increment = 1000, max = 10000) {
    const delay = Math.min(increment * (attempt + 1), max);
    const jitter = Math.random() * 0.3 * delay;
    return Math.round(delay + jitter);
  }
}

/**
 * Circuit breaker implementation
 */
export class CircuitBreaker {
  constructor(options = {}) {
    this.options = {
      threshold: options.threshold || 5,        // Failures before opening
      timeout: options.timeout || 60000,        // Time before half-open
      resetTimeout: options.resetTimeout || 120000, // Time to fully reset
      ...options
    };
    
    this.state = 'closed'; // closed, open, half-open
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
  }
  
  /**
   * Execute function with circuit breaker
   */
  async execute(fn) {
    // Check circuit state
    if (this.state === 'open') {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error('Circuit breaker is open');
      }
      // Move to half-open state
      this.state = 'half-open';
    }
    
    try {
      const result = await fn();
      
      // Record success
      this.onSuccess();
      
      return result;
      
    } catch (error) {
      // Record failure
      this.onFailure();
      
      throw error;
    }
  }
  
  /**
   * Handle successful execution
   */
  onSuccess() {
    this.failures = 0;
    
    if (this.state === 'half-open') {
      this.successes++;
      
      // Close circuit after enough successes
      if (this.successes >= 3) {
        this.state = 'closed';
        this.successes = 0;
      }
    }
  }
  
  /**
   * Handle failed execution
   */
  onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.state === 'half-open') {
      // Immediately open on failure in half-open state
      this.open();
    } else if (this.failures >= this.options.threshold) {
      // Open circuit after threshold
      this.open();
    }
  }
  
  /**
   * Open the circuit
   */
  open() {
    this.state = 'open';
    this.nextAttemptTime = Date.now() + this.options.timeout;
    this.successes = 0;
  }
  
  /**
   * Reset the circuit
   */
  reset() {
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
  }
  
  /**
   * Get circuit status
   */
  getStatus() {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
      canAttempt: this.state !== 'open' || Date.now() >= this.nextAttemptTime
    };
  }
}

/**
 * Combine retry manager with circuit breaker
 */
export class ResilientClient {
  constructor(options = {}) {
    this.retryManager = new RetryManager(options.retry);
    this.circuitBreaker = new CircuitBreaker(options.circuitBreaker);
  }
  
  /**
   * Execute with both retry and circuit breaker
   */
  async execute(fn, options = {}) {
    return await this.retryManager.retry(
      () => this.circuitBreaker.execute(fn),
      options
    );
  }
  
  /**
   * Get status
   */
  getStatus() {
    return {
      circuitBreaker: this.circuitBreaker.getStatus()
    };
  }
  
  /**
   * Reset
   */
  reset() {
    this.circuitBreaker.reset();
  }
}

export default {
  RetryManager,
  CircuitBreaker,
  ResilientClient
};