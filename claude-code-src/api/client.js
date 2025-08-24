/**
 * Anthropic API Client
 * Core client for interacting with Claude API
 */

import https from 'node:https';
import { EventEmitter } from 'node:events';
import { URL } from 'node:url';
import { API_ENDPOINTS, RETRY_CONFIG, RATE_LIMITS } from '../cli/constants.js';
import { 
  APIError, 
  NetworkError, 
  RateLimitError,
  AuthError,
  ContextLengthError,
  createErrorFromResponse 
} from '../cli/error-handler.js';
import { TokenCounter } from './token-counter.js';
import { RateLimiter } from './rate-limiter.js';
import { RetryManager } from './retry-manager.js';

/**
 * HTTP client for making API requests
 */
class HTTPClient {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || 'https://api.anthropic.com';
    this.timeout = options.timeout || 30000;
    this.headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Anthropic-Version': '2023-06-01',
      'User-Agent': `claude-code-cli/${process.env.npm_package_version || '1.0.0'}`,
      ...options.headers
    };
  }
  
  /**
   * Make HTTP request
   */
  async request(method, path, data = null, options = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      
      const requestOptions = {
        method,
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        headers: {
          ...this.headers,
          ...options.headers
        },
        timeout: options.timeout || this.timeout
      };
      
      // Add content length for POST/PUT requests
      if (data) {
        const jsonData = JSON.stringify(data);
        requestOptions.headers['Content-Length'] = Buffer.byteLength(jsonData);
      }
      
      const req = https.request(requestOptions, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          try {
            const response = {
              status: res.statusCode,
              statusText: res.statusMessage,
              headers: res.headers,
              data: responseData ? JSON.parse(responseData) : null
            };
            
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(response);
            } else {
              reject(createErrorFromResponse(response));
            }
          } catch (error) {
            reject(new NetworkError('Failed to parse response', error));
          }
        });
      });
      
      req.on('error', (error) => {
        reject(new NetworkError('Request failed', error));
      });
      
      req.on('timeout', () => {
        req.destroy();
        reject(new NetworkError('Request timeout'));
      });
      
      // Send request data
      if (data) {
        req.write(JSON.stringify(data));
      }
      
      req.end();
    });
  }
  
  /**
   * Stream response data
   */
  async stream(method, path, data = null, options = {}, onData) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      
      const requestOptions = {
        method,
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        headers: {
          ...this.headers,
          ...options.headers,
          'Accept': 'text/event-stream'
        },
        timeout: options.timeout || this.timeout * 2 // Longer timeout for streams
      };
      
      if (data) {
        const jsonData = JSON.stringify(data);
        requestOptions.headers['Content-Length'] = Buffer.byteLength(jsonData);
      }
      
      const req = https.request(requestOptions, (res) => {
        if (res.statusCode !== 200) {
          let errorData = '';
          res.on('data', chunk => errorData += chunk);
          res.on('end', () => {
            try {
              const errorResponse = {
                status: res.statusCode,
                statusText: res.statusMessage,
                headers: res.headers,
                data: errorData ? JSON.parse(errorData) : null
              };
              reject(createErrorFromResponse(errorResponse));
            } catch (error) {
              reject(new NetworkError('Stream error', error));
            }
          });
          return;
        }
        
        let buffer = '';
        
        res.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop(); // Keep incomplete line in buffer
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              
              if (data === '[DONE]') {
                resolve();
                return;
              }
              
              try {
                const parsed = JSON.parse(data);
                onData(parsed);
              } catch (error) {
                // Ignore parsing errors for incomplete chunks
              }
            }
          }
        });
        
        res.on('end', () => {
          resolve();
        });
      });
      
      req.on('error', (error) => {
        reject(new NetworkError('Stream request failed', error));
      });
      
      req.on('timeout', () => {
        req.destroy();
        reject(new NetworkError('Stream timeout'));
      });
      
      if (data) {
        req.write(JSON.stringify(data));
      }
      
      req.end();
    });
  }
}

/**
 * Main Anthropic API Client
 */
export class AnthropicClient extends EventEmitter {
  constructor(options = {}) {
    super();
    
    if (!options.apiKey) {
      throw new AuthError('API key is required');
    }
    
    this.apiKey = options.apiKey;
    this.model = options.model || 'claude-3-sonnet-20240229';
    this.maxTokens = options.maxTokens || 4096;
    this.temperature = options.temperature || 0.7;
    this.stream = options.stream || false;
    
    // Initialize HTTP client
    this.http = new HTTPClient({
      baseUrl: options.baseUrl,
      timeout: options.timeout,
      headers: {
        'x-api-key': this.apiKey
      }
    });
    
    // Initialize helpers
    this.tokenCounter = new TokenCounter();
    this.rateLimiter = new RateLimiter(RATE_LIMITS);
    this.retryManager = new RetryManager(RETRY_CONFIG);
  }
  
  /**
   * Send a message to Claude
   */
  async sendMessage(messages, options = {}) {
    // Validate and prepare messages
    const preparedMessages = this.prepareMessages(messages);
    
    // Count tokens
    const tokenCount = this.tokenCounter.countMessages(preparedMessages);
    this.emit('token-count', tokenCount);
    
    // Check rate limits
    await this.rateLimiter.checkLimit('messages');
    
    // Prepare request body
    const requestBody = {
      model: options.model || this.model,
      messages: preparedMessages,
      max_tokens: options.maxTokens || this.maxTokens,
      temperature: options.temperature || this.temperature,
      stream: options.stream || this.stream
    };
    
    // Add system prompt if provided
    if (options.system) {
      requestBody.system = options.system;
    }
    
    // Add additional parameters
    if (options.topP !== undefined) {
      requestBody.top_p = options.topP;
    }
    
    if (options.topK !== undefined) {
      requestBody.top_k = options.topK;
    }
    
    if (options.stopSequences) {
      requestBody.stop_sequences = options.stopSequences;
    }
    
    // Make request with retry
    const makeRequest = async () => {
      if (options.stream || requestBody.stream) {
        return await this.streamMessage(requestBody, options.onToken);
      } else {
        return await this.http.request('POST', API_ENDPOINTS.messages, requestBody);
      }
    };
    
    try {
      const response = await this.retryManager.retry(makeRequest);
      
      // Update rate limiter
      this.rateLimiter.recordUsage('messages', 1);
      this.rateLimiter.recordUsage('tokens', tokenCount);
      
      // Process response
      if (options.stream || requestBody.stream) {
        return response; // Stream response is already processed
      } else {
        return this.processResponse(response.data);
      }
      
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }
  
  /**
   * Stream message response
   */
  async streamMessage(requestBody, onToken) {
    let fullContent = '';
    let messageId = null;
    let model = null;
    let stopReason = null;
    let usage = null;
    
    await this.http.stream(
      'POST',
      API_ENDPOINTS.messages,
      { ...requestBody, stream: true },
      {},
      (chunk) => {
        if (chunk.type === 'message_start') {
          messageId = chunk.message.id;
          model = chunk.message.model;
          usage = chunk.message.usage;
        } else if (chunk.type === 'content_block_delta') {
          const text = chunk.delta.text;
          if (text) {
            fullContent += text;
            if (onToken) {
              onToken(text);
            }
            this.emit('token', text);
          }
        } else if (chunk.type === 'message_delta') {
          if (chunk.delta.stop_reason) {
            stopReason = chunk.delta.stop_reason;
          }
          if (chunk.usage) {
            usage = chunk.usage;
          }
        }
      }
    );
    
    return {
      id: messageId,
      model: model,
      content: fullContent,
      stop_reason: stopReason,
      usage: usage
    };
  }
  
  /**
   * Prepare messages for API
   */
  prepareMessages(messages) {
    if (!Array.isArray(messages)) {
      throw new Error('Messages must be an array');
    }
    
    const prepared = [];
    
    for (const message of messages) {
      if (typeof message === 'string') {
        // Convert string to message object
        prepared.push({
          role: 'user',
          content: message
        });
      } else if (message.role && message.content) {
        // Validate role
        if (!['user', 'assistant', 'system'].includes(message.role)) {
          throw new Error(`Invalid message role: ${message.role}`);
        }
        
        // System messages are handled separately in Claude API
        if (message.role !== 'system') {
          prepared.push({
            role: message.role,
            content: message.content
          });
        }
      } else {
        throw new Error('Invalid message format');
      }
    }
    
    // Ensure messages alternate between user and assistant
    for (let i = 1; i < prepared.length; i++) {
      if (prepared[i].role === prepared[i - 1].role) {
        throw new Error('Messages must alternate between user and assistant');
      }
    }
    
    // Ensure first message is from user
    if (prepared.length > 0 && prepared[0].role !== 'user') {
      throw new Error('First message must be from user');
    }
    
    return prepared;
  }
  
  /**
   * Process API response
   */
  processResponse(data) {
    if (!data) {
      throw new APIError('Empty response from API');
    }
    
    // Extract content from response
    let content = '';
    
    if (data.content && Array.isArray(data.content)) {
      for (const block of data.content) {
        if (block.type === 'text') {
          content += block.text;
        }
      }
    } else if (typeof data.content === 'string') {
      content = data.content;
    }
    
    return {
      id: data.id,
      model: data.model,
      content: content,
      stop_reason: data.stop_reason,
      usage: data.usage
    };
  }
  
  /**
   * Complete text (legacy endpoint)
   */
  async complete(prompt, options = {}) {
    const requestBody = {
      model: options.model || this.model,
      prompt: `\n\nHuman: ${prompt}\n\nAssistant:`,
      max_tokens_to_sample: options.maxTokens || this.maxTokens,
      temperature: options.temperature || this.temperature
    };
    
    if (options.stopSequences) {
      requestBody.stop_sequences = options.stopSequences;
    }
    
    const response = await this.http.request('POST', API_ENDPOINTS.complete, requestBody);
    
    return {
      completion: response.data.completion,
      stop_reason: response.data.stop_reason
    };
  }
  
  /**
   * List available models
   */
  async listModels() {
    const response = await this.http.request('GET', API_ENDPOINTS.models);
    return response.data.models || [];
  }
  
  /**
   * Validate API key
   */
  async validateApiKey() {
    try {
      // Make a minimal request to validate the key
      await this.sendMessage([
        { role: 'user', content: 'Hi' }
      ], {
        maxTokens: 1,
        stream: false
      });
      
      return true;
    } catch (error) {
      if (error instanceof AuthError) {
        return false;
      }
      throw error;
    }
  }
  
  /**
   * Get usage statistics
   */
  getUsageStats() {
    return {
      requests: this.rateLimiter.getUsage('messages'),
      tokens: this.rateLimiter.getUsage('tokens'),
      limits: this.rateLimiter.getLimits()
    };
  }
  
  /**
   * Reset rate limiter
   */
  resetRateLimiter() {
    this.rateLimiter.reset();
  }
  
  /**
   * Set model
   */
  setModel(model) {
    this.model = model;
    this.emit('model-changed', model);
  }
  
  /**
   * Set temperature
   */
  setTemperature(temperature) {
    if (temperature < 0 || temperature > 1) {
      throw new Error('Temperature must be between 0 and 1');
    }
    this.temperature = temperature;
    this.emit('temperature-changed', temperature);
  }
  
  /**
   * Set max tokens
   */
  setMaxTokens(maxTokens) {
    if (maxTokens < 1) {
      throw new Error('Max tokens must be positive');
    }
    this.maxTokens = maxTokens;
    this.emit('max-tokens-changed', maxTokens);
  }
}

export default AnthropicClient;