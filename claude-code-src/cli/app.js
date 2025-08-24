/**
 * CLI Application Core
 * Main application logic for the Claude Code CLI
 */

import { EventEmitter } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';
import { stdin, stdout, stderr } from 'node:process';

import { AnthropicClient } from '../api/client.js';
import { ConversationManager } from './conversation.js';
import { OutputFormatter } from '../ui/formatter.js';
import { ProgressIndicator } from '../ui/progress.js';
import { Logger } from '../utils/logger.js';
import { validateApiKey } from '../utils/validation.js';

/**
 * Main CLI Application Class
 */
export class CLIApplication extends EventEmitter {
  constructor(config, options) {
    super();
    
    this.config = config;
    this.options = options;
    this.logger = new Logger(options.debug, options.verbose);
    this.formatter = new OutputFormatter(options);
    this.progress = new ProgressIndicator(options);
    
    // Initialize API client if API key is available
    this.client = null;
    this.initializeClient();
    
    // Initialize conversation manager
    this.conversation = new ConversationManager(config);
    
    // Setup readline interface for interactive mode
    this.rl = null;
  }
  
  /**
   * Initialize Anthropic API client
   */
  initializeClient() {
    const apiKey = this.options.apiKey || 
                   this.config.apiKey || 
                   process.env.ANTHROPIC_API_KEY;
    
    if (apiKey && validateApiKey(apiKey)) {
      this.client = new AnthropicClient({
        apiKey,
        model: this.options.model || this.config.model || 'claude-3-sonnet-20240229',
        maxTokens: this.options.maxTokens || this.config.maxTokens || 4096,
        temperature: this.options.temperature || this.config.temperature || 0.7,
        stream: this.options.stream || this.config.stream || false,
        baseUrl: this.config.baseUrl,
        timeout: this.config.timeout,
        maxRetries: this.config.maxRetries
      });
      
      this.logger.debug('API client initialized');
    } else {
      this.logger.warn('No valid API key found. Some features will be unavailable.');
    }
  }
  
  /**
   * Run interactive chat session
   */
  async runChat(initialMessage, options) {
    if (!this.client) {
      throw new Error('API key required for chat functionality');
    }
    
    this.logger.info('Starting chat session...');
    
    // Load previous conversation if continuing
    if (options.continue) {
      await this.conversation.loadPrevious();
    }
    
    // Set system prompt if provided
    if (options.system) {
      this.conversation.setSystemPrompt(options.system);
    }
    
    // Handle initial message if provided
    if (initialMessage) {
      const response = await this.sendMessage(initialMessage);
      this.formatter.displayMessage(response);
      
      if (!options.continue) {
        return; // Single message mode
      }
    }
    
    // Enter interactive mode
    await this.startInteractiveChat();
  }
  
  /**
   * Start interactive chat loop
   */
  async startInteractiveChat() {
    this.rl = createInterface({
      input: stdin,
      output: stdout,
      prompt: this.formatter.formatPrompt('You'),
      historySize: 100
    });
    
    this.formatter.displaySystemMessage('Interactive chat started. Type "exit" to quit.');
    
    this.rl.on('line', async (input) => {
      try {
        input = input.trim();
        
        // Check for special commands
        if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
          await this.endChat();
          return;
        }
        
        if (input.toLowerCase() === 'clear') {
          this.conversation.clear();
          this.formatter.displaySystemMessage('Conversation cleared.');
          this.rl.prompt();
          return;
        }
        
        if (input.toLowerCase() === 'save') {
          await this.conversation.save();
          this.formatter.displaySystemMessage('Conversation saved.');
          this.rl.prompt();
          return;
        }
        
        // Send message to Claude
        if (input) {
          this.progress.start('Thinking...');
          const response = await this.sendMessage(input);
          this.progress.stop();
          
          this.formatter.displayMessage(response, 'Claude');
        }
        
        this.rl.prompt();
        
      } catch (error) {
        this.progress.stop();
        this.logger.error('Chat error:', error);
        this.formatter.displayError(error.message);
        this.rl.prompt();
      }
    });
    
    this.rl.prompt();
    
    // Wait for chat to end
    return new Promise((resolve) => {
      this.rl.on('close', resolve);
    });
  }
  
  /**
   * Send message to Claude
   */
  async sendMessage(message) {
    // Add message to conversation
    this.conversation.addMessage('user', message);
    
    // Prepare messages for API
    const messages = this.conversation.getMessages();
    
    // Send to API
    const response = await this.client.sendMessage(messages, {
      system: this.conversation.getSystemPrompt(),
      stream: this.options.stream,
      onToken: this.options.stream ? (token) => {
        this.formatter.displayToken(token);
      } : undefined
    });
    
    // Add response to conversation
    this.conversation.addMessage('assistant', response.content);
    
    return response.content;
  }
  
  /**
   * End chat session
   */
  async endChat() {
    this.formatter.displaySystemMessage('Ending chat session...');
    
    // Save conversation if configured
    if (this.config.autoSave) {
      await this.conversation.save();
    }
    
    if (this.rl) {
      this.rl.close();
    }
  }
  
  /**
   * Run single completion
   */
  async runCompletion(prompt, options) {
    if (!this.client) {
      throw new Error('API key required for completion functionality');
    }
    
    this.logger.info('Generating completion...');
    
    // Read prompt from file if specified
    if (options.file) {
      prompt = await this.readInputFile(options.file);
    }
    
    // Prepare messages
    const messages = [{
      role: 'user',
      content: prompt
    }];
    
    // Send to API
    this.progress.start('Generating...');
    
    const response = await this.client.sendMessage(messages, {
      system: options.system,
      stream: this.options.stream,
      onToken: this.options.stream ? (token) => {
        this.formatter.displayToken(token);
      } : undefined
    });
    
    this.progress.stop();
    
    // Output response
    if (options.output) {
      await this.writeOutputFile(options.output, response.content);
      this.formatter.displaySystemMessage(`Output saved to ${options.output}`);
    } else {
      this.formatter.displayCompletion(response.content);
    }
    
    return response.content;
  }
  
  /**
   * Run code/document analysis
   */
  async runAnalysis(targetPath, options) {
    if (!this.client) {
      throw new Error('API key required for analysis functionality');
    }
    
    this.logger.info(`Analyzing ${targetPath}...`);
    
    // Check if path exists
    if (!existsSync(targetPath)) {
      throw new Error(`Path not found: ${targetPath}`);
    }
    
    // Read file or directory content
    const content = await this.readAnalysisTarget(targetPath);
    
    // Prepare analysis prompt
    const analysisType = options.type || 'general';
    const prompt = this.buildAnalysisPrompt(content, analysisType, targetPath);
    
    // Send to API
    this.progress.start('Analyzing...');
    
    const messages = [{
      role: 'user',
      content: prompt
    }];
    
    const response = await this.client.sendMessage(messages, {
      system: this.getAnalysisSystemPrompt(analysisType),
      stream: false
    });
    
    this.progress.stop();
    
    // Format and output analysis
    const formattedAnalysis = this.formatter.formatAnalysis(
      response.content,
      options.format || 'text'
    );
    
    if (options.output) {
      await this.writeOutputFile(options.output, formattedAnalysis);
      this.formatter.displaySystemMessage(`Analysis saved to ${options.output}`);
    } else {
      this.formatter.display(formattedAnalysis);
    }
    
    return response.content;
  }
  
  /**
   * Run translation
   */
  async runTranslation(text, options) {
    if (!this.client) {
      throw new Error('API key required for translation functionality');
    }
    
    if (!options.to) {
      throw new Error('Target language (--to) is required');
    }
    
    this.logger.info('Translating text...');
    
    // Read text from file if specified
    if (options.file) {
      text = await this.readInputFile(options.file);
    }
    
    // Prepare translation prompt
    const prompt = this.buildTranslationPrompt(text, options.from, options.to);
    
    // Send to API
    this.progress.start('Translating...');
    
    const messages = [{
      role: 'user',
      content: prompt
    }];
    
    const response = await this.client.sendMessage(messages, {
      system: 'You are a professional translator. Provide accurate and natural translations.',
      stream: false
    });
    
    this.progress.stop();
    
    // Output translation
    if (options.output) {
      await this.writeOutputFile(options.output, response.content);
      this.formatter.displaySystemMessage(`Translation saved to ${options.output}`);
    } else {
      this.formatter.displayTranslation(response.content, options.to);
    }
    
    return response.content;
  }
  
  /**
   * Run summarization
   */
  async runSummarization(input, options) {
    if (!this.client) {
      throw new Error('API key required for summarization functionality');
    }
    
    this.logger.info('Generating summary...');
    
    // Read input from file if specified
    if (options.file) {
      input = await this.readInputFile(options.file);
    }
    
    // Prepare summarization prompt
    const length = options.length || 'medium';
    const format = options.format || 'text';
    const prompt = this.buildSummarizationPrompt(input, length, format);
    
    // Send to API
    this.progress.start('Summarizing...');
    
    const messages = [{
      role: 'user',
      content: prompt
    }];
    
    const response = await this.client.sendMessage(messages, {
      system: 'You are an expert at creating clear, concise summaries.',
      stream: false
    });
    
    this.progress.stop();
    
    // Output summary
    if (options.output) {
      await this.writeOutputFile(options.output, response.content);
      this.formatter.displaySystemMessage(`Summary saved to ${options.output}`);
    } else {
      this.formatter.displaySummary(response.content, format);
    }
    
    return response.content;
  }
  
  /**
   * Manage configuration
   */
  async manageConfig(action, options) {
    const configManager = await import('../config/config-manager.js');
    
    switch (action) {
      case 'show':
        const config = await configManager.showConfig(options.global);
        this.formatter.displayConfig(config);
        break;
        
      case 'set':
        if (!options.key || !options.value) {
          throw new Error('Both --key and --value are required');
        }
        await configManager.setConfig(options.key, options.value, options.global);
        this.formatter.displaySystemMessage(`Configuration updated: ${options.key} = ${options.value}`);
        break;
        
      case 'reset':
        await configManager.resetConfig(options.global);
        this.formatter.displaySystemMessage('Configuration reset to defaults');
        break;
        
      default:
        throw new Error(`Unknown config action: ${action}`);
    }
  }
  
  /**
   * Manage authentication
   */
  async manageAuth(action, options) {
    const authManager = await import('../auth/auth-manager.js');
    
    switch (action) {
      case 'login':
        const token = options.token || await this.promptForToken();
        await authManager.login(token);
        this.formatter.displaySystemMessage('Authentication successful');
        break;
        
      case 'logout':
        await authManager.logout();
        this.formatter.displaySystemMessage('Logged out successfully');
        break;
        
      case 'status':
        const status = await authManager.getStatus();
        this.formatter.displayAuthStatus(status);
        break;
        
      default:
        throw new Error(`Unknown auth action: ${action}`);
    }
  }
  
  // Helper methods
  
  async readInputFile(filePath) {
    const resolvedPath = resolve(filePath);
    return await readFile(resolvedPath, 'utf-8');
  }
  
  async writeOutputFile(filePath, content) {
    const resolvedPath = resolve(filePath);
    await writeFile(resolvedPath, content, 'utf-8');
  }
  
  async readAnalysisTarget(targetPath) {
    // Implementation for reading files/directories for analysis
    // This would recursively read directory contents or single file
    const { statSync, readdirSync } = await import('node:fs');
    const stats = statSync(targetPath);
    
    if (stats.isFile()) {
      return await readFile(targetPath, 'utf-8');
    } else if (stats.isDirectory()) {
      // Read directory contents recursively
      return this.readDirectoryRecursive(targetPath);
    }
    
    throw new Error('Target must be a file or directory');
  }
  
  buildAnalysisPrompt(content, type, path) {
    const prompts = {
      code: `Analyze the following code from ${path}:\n\n${content}\n\nProvide insights on code quality, potential issues, and suggestions for improvement.`,
      security: `Perform a security analysis on the following code from ${path}:\n\n${content}\n\nIdentify potential vulnerabilities and security concerns.`,
      performance: `Analyze the performance characteristics of the following code from ${path}:\n\n${content}\n\nIdentify bottlenecks and optimization opportunities.`,
      general: `Analyze the following content from ${path}:\n\n${content}\n\nProvide comprehensive insights and observations.`
    };
    
    return prompts[type] || prompts.general;
  }
  
  getAnalysisSystemPrompt(type) {
    const prompts = {
      code: 'You are an expert code reviewer. Provide detailed, constructive analysis.',
      security: 'You are a security expert. Focus on identifying vulnerabilities and security best practices.',
      performance: 'You are a performance optimization expert. Focus on efficiency and scalability.',
      general: 'You are an expert analyst. Provide thorough and insightful analysis.'
    };
    
    return prompts[type] || prompts.general;
  }
  
  buildTranslationPrompt(text, fromLang, toLang) {
    if (fromLang) {
      return `Translate the following text from ${fromLang} to ${toLang}:\n\n${text}`;
    }
    return `Translate the following text to ${toLang}:\n\n${text}`;
  }
  
  buildSummarizationPrompt(text, length, format) {
    const lengthMap = {
      short: '2-3 sentences',
      medium: '1-2 paragraphs',
      long: '3-4 paragraphs'
    };
    
    const formatMap = {
      text: 'plain text',
      bullets: 'bullet points',
      json: 'JSON format with key points'
    };
    
    return `Summarize the following text in ${lengthMap[length]} using ${formatMap[format]}:\n\n${text}`;
  }
  
  async promptForToken() {
    return new Promise((resolve) => {
      const rl = createInterface({
        input: stdin,
        output: stdout
      });
      
      rl.question('Enter your API token: ', (token) => {
        rl.close();
        resolve(token);
      });
    });
  }
  
  async readDirectoryRecursive(dirPath) {
    // Implementation for recursive directory reading
    // Would return concatenated file contents with path markers
    const { readdirSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    
    let content = '';
    const items = readdirSync(dirPath);
    
    for (const item of items) {
      const fullPath = join(dirPath, item);
      const stats = statSync(fullPath);
      
      if (stats.isFile()) {
        const fileContent = await readFile(fullPath, 'utf-8');
        content += `\n--- File: ${fullPath} ---\n${fileContent}\n`;
      } else if (stats.isDirectory() && !item.startsWith('.')) {
        content += await this.readDirectoryRecursive(fullPath);
      }
    }
    
    return content;
  }
}

export default CLIApplication;