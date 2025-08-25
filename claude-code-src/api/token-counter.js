/**
 * Token Counter
 * Utilities for counting tokens in messages
 */

/**
 * Simple token counter implementation
 * This is a simplified version - actual token counting would use
 * the proper tokenizer for the model
 */
export class TokenCounter {
  constructor() {
    // Average characters per token (approximate)
    this.avgCharsPerToken = 4;
    
    // Token overhead for message structure
    this.messageOverhead = 4; // Tokens for role and formatting
  }
  
  /**
   * Count tokens in a string
   * This is a simplified estimation
   */
  countString(text) {
    if (!text) return 0;
    
    // Simple estimation based on character count and word boundaries
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const chars = text.length;
    
    // Estimate based on both word count and character count
    const wordEstimate = words.length * 1.3; // Most words ≈ 1.3 tokens
    const charEstimate = chars / this.avgCharsPerToken;
    
    // Use average of both estimates
    return Math.ceil((wordEstimate + charEstimate) / 2);
  }
  
  /**
   * Count tokens in a message
   */
  countMessage(message) {
    let tokens = this.messageOverhead;
    
    if (typeof message === 'string') {
      tokens += this.countString(message);
    } else if (message.content) {
      tokens += this.countString(message.content);
      
      // Add tokens for role
      if (message.role) {
        tokens += 1;
      }
      
      // Add tokens for any metadata
      if (message.name) {
        tokens += this.countString(message.name) + 1;
      }
    }
    
    return tokens;
  }
  
  /**
   * Count tokens in multiple messages
   */
  countMessages(messages) {
    if (!Array.isArray(messages)) {
      return this.countMessage(messages);
    }
    
    let totalTokens = 3; // Start/end tokens for conversation
    
    for (const message of messages) {
      totalTokens += this.countMessage(message);
    }
    
    return totalTokens;
  }
  
  /**
   * Count tokens with system prompt
   */
  countWithSystem(messages, systemPrompt) {
    let tokens = this.countMessages(messages);
    
    if (systemPrompt) {
      tokens += this.countString(systemPrompt) + this.messageOverhead;
    }
    
    return tokens;
  }
  
  /**
   * Estimate if content will fit within token limit
   */
  fitsWithinLimit(messages, limit, systemPrompt = null) {
    const tokens = this.countWithSystem(messages, systemPrompt);
    return {
      fits: tokens <= limit,
      tokens: tokens,
      limit: limit,
      remaining: limit - tokens
    };
  }
  
  /**
   * Truncate messages to fit within token limit
   */
  truncateMessages(messages, limit, systemPrompt = null) {
    const systemTokens = systemPrompt 
      ? this.countString(systemPrompt) + this.messageOverhead 
      : 0;
    
    const availableTokens = limit - systemTokens - 3; // Reserve for structure
    
    const truncated = [];
    let currentTokens = 0;
    
    // Process messages in reverse (keep most recent)
    for (let i = messages.length - 1; i >= 0; i--) {
      const messageTokens = this.countMessage(messages[i]);
      
      if (currentTokens + messageTokens <= availableTokens) {
        truncated.unshift(messages[i]);
        currentTokens += messageTokens;
      } else {
        // Can't fit more messages
        break;
      }
    }
    
    return truncated;
  }
  
  /**
   * Truncate text to approximate token count
   */
  truncateText(text, maxTokens) {
    const estimatedChars = maxTokens * this.avgCharsPerToken;
    
    if (text.length <= estimatedChars) {
      return text;
    }
    
    // Find a good break point (word boundary)
    let truncateAt = estimatedChars;
    
    // Look for last space before limit
    const lastSpace = text.lastIndexOf(' ', truncateAt);
    if (lastSpace > estimatedChars * 0.8) {
      truncateAt = lastSpace;
    }
    
    return text.substring(0, truncateAt) + '...';
  }
  
  /**
   * Split text into chunks that fit within token limit
   */
  splitIntoChunks(text, maxTokensPerChunk) {
    const chunks = [];
    const estimatedCharsPerChunk = maxTokensPerChunk * this.avgCharsPerToken;
    
    let currentPosition = 0;
    
    while (currentPosition < text.length) {
      let chunkEnd = Math.min(
        currentPosition + estimatedCharsPerChunk,
        text.length
      );
      
      // Find a good break point if not at end
      if (chunkEnd < text.length) {
        // Try to break at paragraph
        const paragraphBreak = text.lastIndexOf('\n\n', chunkEnd);
        if (paragraphBreak > currentPosition + estimatedCharsPerChunk * 0.5) {
          chunkEnd = paragraphBreak;
        } else {
          // Try to break at sentence
          const sentenceBreak = text.lastIndexOf('. ', chunkEnd);
          if (sentenceBreak > currentPosition + estimatedCharsPerChunk * 0.7) {
            chunkEnd = sentenceBreak + 1;
          } else {
            // Break at word
            const wordBreak = text.lastIndexOf(' ', chunkEnd);
            if (wordBreak > currentPosition + estimatedCharsPerChunk * 0.8) {
              chunkEnd = wordBreak;
            }
          }
        }
      }
      
      chunks.push(text.substring(currentPosition, chunkEnd).trim());
      currentPosition = chunkEnd;
      
      // Skip whitespace
      while (currentPosition < text.length && /\s/.test(text[currentPosition])) {
        currentPosition++;
      }
    }
    
    return chunks;
  }
  
  /**
   * Get token statistics for messages
   */
  getStatistics(messages, systemPrompt = null) {
    const messageTokens = messages.map(m => ({
      role: m.role,
      tokens: this.countMessage(m),
      percentage: 0
    }));
    
    const systemTokens = systemPrompt 
      ? this.countString(systemPrompt) + this.messageOverhead 
      : 0;
    
    const totalTokens = messageTokens.reduce((sum, m) => sum + m.tokens, 0) + systemTokens;
    
    // Calculate percentages
    messageTokens.forEach(m => {
      m.percentage = (m.tokens / totalTokens * 100).toFixed(1);
    });
    
    return {
      total: totalTokens,
      system: systemTokens,
      messages: messageTokens,
      average: Math.ceil(totalTokens / (messages.length || 1)),
      breakdown: {
        user: messageTokens.filter(m => m.role === 'user').reduce((sum, m) => sum + m.tokens, 0),
        assistant: messageTokens.filter(m => m.role === 'assistant').reduce((sum, m) => sum + m.tokens, 0)
      }
    };
  }
}

/**
 * Singleton instance
 */
let defaultCounter = null;

/**
 * Get default token counter instance
 */
export function getTokenCounter() {
  if (!defaultCounter) {
    defaultCounter = new TokenCounter();
  }
  return defaultCounter;
}

/**
 * Helper functions
 */
export function countTokens(text) {
  return getTokenCounter().countString(text);
}

export function countMessageTokens(messages, systemPrompt = null) {
  return getTokenCounter().countWithSystem(messages, systemPrompt);
}

export function truncateToTokens(text, maxTokens) {
  return getTokenCounter().truncateText(text, maxTokens);
}

export function splitTextIntoChunks(text, maxTokensPerChunk) {
  return getTokenCounter().splitIntoChunks(text, maxTokensPerChunk);
}

export default {
  TokenCounter,
  getTokenCounter,
  countTokens,
  countMessageTokens,
  truncateToTokens,
  splitTextIntoChunks
};