/**
 * Rate Limiter
 * Manages API rate limiting
 */

/**
 * Rate limiter implementation
 */
export class RateLimiter {
  constructor(limits = {}) {
    this.limits = {
      requestsPerMinute: limits.requestsPerMinute || 50,
      tokensPerMinute: limits.tokensPerMinute || 100000,
      requestsPerDay: limits.requestsPerDay || 5000,
      ...limits
    };
    
    // Usage tracking
    this.usage = {
      messages: [],
      tokens: [],
      daily: []
    };
    
    // Window sizes in milliseconds
    this.windows = {
      minute: 60 * 1000,
      day: 24 * 60 * 60 * 1000
    };
  }
  
  /**
   * Check if request is within rate limits
   */
  async checkLimit(type = 'messages', count = 1) {
    const now = Date.now();
    
    // Clean old entries
    this.cleanOldEntries(now);
    
    // Check minute limit for requests
    if (type === 'messages') {
      const recentRequests = this.getRecentCount('messages', this.windows.minute, now);
      
      if (recentRequests + count > this.limits.requestsPerMinute) {
        const waitTime = this.getWaitTime('messages', this.windows.minute, now);
        throw new RateLimitError(
          `Rate limit exceeded: ${recentRequests}/${this.limits.requestsPerMinute} requests per minute`,
          waitTime
        );
      }
      
      // Check daily limit
      const dailyRequests = this.getRecentCount('daily', this.windows.day, now);
      
      if (dailyRequests + count > this.limits.requestsPerDay) {
        const waitTime = this.getWaitTime('daily', this.windows.day, now);
        throw new RateLimitError(
          `Daily limit exceeded: ${dailyRequests}/${this.limits.requestsPerDay} requests per day`,
          waitTime
        );
      }
    }
    
    // Check token limit
    if (type === 'tokens') {
      const recentTokens = this.getRecentCount('tokens', this.windows.minute, now);
      
      if (recentTokens + count > this.limits.tokensPerMinute) {
        const waitTime = this.getWaitTime('tokens', this.windows.minute, now);
        throw new RateLimitError(
          `Token limit exceeded: ${recentTokens}/${this.limits.tokensPerMinute} tokens per minute`,
          waitTime
        );
      }
    }
    
    return true;
  }
  
  /**
   * Record usage
   */
  recordUsage(type, count = 1) {
    const now = Date.now();
    
    if (type === 'messages') {
      this.usage.messages.push({ time: now, count });
      this.usage.daily.push({ time: now, count });
    } else if (type === 'tokens') {
      this.usage.tokens.push({ time: now, count });
    }
    
    // Keep arrays manageable
    this.cleanOldEntries(now);
  }
  
  /**
   * Get recent usage count
   */
  getRecentCount(type, window, now = Date.now()) {
    const cutoff = now - window;
    const entries = this.usage[type] || [];
    
    return entries
      .filter(entry => entry.time > cutoff)
      .reduce((sum, entry) => sum + entry.count, 0);
  }
  
  /**
   * Get wait time until rate limit resets
   */
  getWaitTime(type, window, now = Date.now()) {
    const entries = this.usage[type] || [];
    
    if (entries.length === 0) {
      return 0;
    }
    
    // Find oldest entry within window
    const cutoff = now - window;
    const oldestEntry = entries.find(entry => entry.time > cutoff);
    
    if (!oldestEntry) {
      return 0;
    }
    
    // Calculate wait time (when oldest entry expires)
    const waitTime = (oldestEntry.time + window - now) / 1000;
    return Math.ceil(waitTime);
  }
  
  /**
   * Clean old entries from usage tracking
   */
  cleanOldEntries(now = Date.now()) {
    const minuteCutoff = now - this.windows.minute;
    const dayCutoff = now - this.windows.day;
    
    this.usage.messages = this.usage.messages.filter(
      entry => entry.time > minuteCutoff
    );
    
    this.usage.tokens = this.usage.tokens.filter(
      entry => entry.time > minuteCutoff
    );
    
    this.usage.daily = this.usage.daily.filter(
      entry => entry.time > dayCutoff
    );
  }
  
  /**
   * Get current usage statistics
   */
  getUsage(type = null) {
    const now = Date.now();
    this.cleanOldEntries(now);
    
    if (type === 'messages') {
      return this.getRecentCount('messages', this.windows.minute, now);
    } else if (type === 'tokens') {
      return this.getRecentCount('tokens', this.windows.minute, now);
    } else if (type === 'daily') {
      return this.getRecentCount('daily', this.windows.day, now);
    }
    
    // Return all usage stats
    return {
      messages: this.getRecentCount('messages', this.windows.minute, now),
      tokens: this.getRecentCount('tokens', this.windows.minute, now),
      daily: this.getRecentCount('daily', this.windows.day, now)
    };
  }
  
  /**
   * Get usage as percentage of limits
   */
  getUsagePercentage() {
    const usage = this.getUsage();
    
    return {
      messages: (usage.messages / this.limits.requestsPerMinute * 100).toFixed(1),
      tokens: (usage.tokens / this.limits.tokensPerMinute * 100).toFixed(1),
      daily: (usage.daily / this.limits.requestsPerDay * 100).toFixed(1)
    };
  }
  
  /**
   * Get remaining capacity
   */
  getRemaining() {
    const usage = this.getUsage();
    
    return {
      messages: Math.max(0, this.limits.requestsPerMinute - usage.messages),
      tokens: Math.max(0, this.limits.tokensPerMinute - usage.tokens),
      daily: Math.max(0, this.limits.requestsPerDay - usage.daily)
    };
  }
  
  /**
   * Check if near limit (>80% usage)
   */
  isNearLimit() {
    const percentages = this.getUsagePercentage();
    
    return {
      messages: parseFloat(percentages.messages) > 80,
      tokens: parseFloat(percentages.tokens) > 80,
      daily: parseFloat(percentages.daily) > 80,
      any: parseFloat(percentages.messages) > 80 || 
           parseFloat(percentages.tokens) > 80 || 
           parseFloat(percentages.daily) > 80
    };
  }
  
  /**
   * Wait until rate limit resets if needed
   */
  async waitIfNeeded(type = 'messages') {
    try {
      await this.checkLimit(type);
    } catch (error) {
      if (error instanceof RateLimitError && error.retryAfter) {
        // Wait for the specified time
        await this.sleep(error.retryAfter * 1000);
        
        // Check again
        await this.checkLimit(type);
      } else {
        throw error;
      }
    }
  }
  
  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Reset all usage tracking
   */
  reset() {
    this.usage = {
      messages: [],
      tokens: [],
      daily: []
    };
  }
  
  /**
   * Get rate limits
   */
  getLimits() {
    return { ...this.limits };
  }
  
  /**
   * Update rate limits
   */
  updateLimits(newLimits) {
    this.limits = {
      ...this.limits,
      ...newLimits
    };
  }
  
  /**
   * Get status summary
   */
  getStatus() {
    const usage = this.getUsage();
    const remaining = this.getRemaining();
    const percentages = this.getUsagePercentage();
    const nearLimit = this.isNearLimit();
    
    return {
      limits: this.limits,
      usage,
      remaining,
      percentages,
      nearLimit,
      healthy: !nearLimit.any
    };
  }
}

/**
 * Sliding window rate limiter
 */
export class SlidingWindowRateLimiter extends RateLimiter {
  constructor(limits = {}) {
    super(limits);
    
    // Use more granular buckets for sliding window
    this.buckets = {
      messages: new Map(),
      tokens: new Map(),
      daily: new Map()
    };
    
    this.bucketSize = 1000; // 1 second buckets
  }
  
  /**
   * Record usage in buckets
   */
  recordUsage(type, count = 1) {
    const now = Date.now();
    const bucket = Math.floor(now / this.bucketSize);
    
    if (!this.buckets[type]) {
      this.buckets[type] = new Map();
    }
    
    const currentCount = this.buckets[type].get(bucket) || 0;
    this.buckets[type].set(bucket, currentCount + count);
    
    // Also record in daily if messages
    if (type === 'messages') {
      const dailyCount = this.buckets.daily.get(bucket) || 0;
      this.buckets.daily.set(bucket, dailyCount + count);
    }
    
    // Clean old buckets
    this.cleanOldBuckets(now);
  }
  
  /**
   * Get usage from buckets
   */
  getRecentCount(type, window, now = Date.now()) {
    const cutoffBucket = Math.floor((now - window) / this.bucketSize);
    const buckets = this.buckets[type] || new Map();
    
    let total = 0;
    for (const [bucket, count] of buckets.entries()) {
      if (bucket > cutoffBucket) {
        total += count;
      }
    }
    
    return total;
  }
  
  /**
   * Clean old buckets
   */
  cleanOldBuckets(now = Date.now()) {
    const minuteCutoff = Math.floor((now - this.windows.minute) / this.bucketSize);
    const dayCutoff = Math.floor((now - this.windows.day) / this.bucketSize);
    
    // Clean minute-based buckets
    for (const [bucket] of this.buckets.messages.entries()) {
      if (bucket <= minuteCutoff) {
        this.buckets.messages.delete(bucket);
      }
    }
    
    for (const [bucket] of this.buckets.tokens.entries()) {
      if (bucket <= minuteCutoff) {
        this.buckets.tokens.delete(bucket);
      }
    }
    
    // Clean daily buckets
    for (const [bucket] of this.buckets.daily.entries()) {
      if (bucket <= dayCutoff) {
        this.buckets.daily.delete(bucket);
      }
    }
  }
}

/**
 * Create appropriate rate limiter
 */
export function createRateLimiter(limits, useSlidingWindow = true) {
  if (useSlidingWindow) {
    return new SlidingWindowRateLimiter(limits);
  }
  return new RateLimiter(limits);
}

// Import error class
class RateLimitError extends Error {
  constructor(message, retryAfter = null) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

export default {
  RateLimiter,
  SlidingWindowRateLimiter,
  createRateLimiter
};