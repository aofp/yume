/**
 * Conversation Manager
 * Manages chat conversations, history, and persistence
 */

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { CONVERSATION_DIR } from './constants.js';

/**
 * Message class representing a single message in conversation
 */
export class Message {
  constructor(role, content, metadata = {}) {
    this.role = role;
    this.content = content;
    this.timestamp = new Date().toISOString();
    this.metadata = metadata;
    this.id = this.generateId();
  }
  
  generateId() {
    const hash = createHash('sha256');
    hash.update(`${this.role}-${this.content}-${this.timestamp}`);
    return hash.digest('hex').substring(0, 8);
  }
  
  toJSON() {
    return {
      id: this.id,
      role: this.role,
      content: this.content,
      timestamp: this.timestamp,
      metadata: this.metadata
    };
  }
  
  static fromJSON(data) {
    const message = new Message(data.role, data.content, data.metadata);
    message.id = data.id;
    message.timestamp = data.timestamp;
    return message;
  }
}

/**
 * Conversation class managing a single conversation
 */
export class Conversation {
  constructor(id = null) {
    this.id = id || this.generateId();
    this.messages = [];
    this.systemPrompt = null;
    this.metadata = {
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      title: null,
      tags: [],
      model: null
    };
  }
  
  generateId() {
    return `conv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
  
  addMessage(role, content, metadata = {}) {
    const message = new Message(role, content, metadata);
    this.messages.push(message);
    this.metadata.updated = new Date().toISOString();
    
    // Auto-generate title from first user message if not set
    if (!this.metadata.title && role === 'user' && this.messages.length === 1) {
      this.metadata.title = this.generateTitle(content);
    }
    
    return message;
  }
  
  generateTitle(content) {
    // Generate a title from the first message
    const maxLength = 50;
    let title = content.trim().split('\n')[0];
    
    if (title.length > maxLength) {
      title = title.substring(0, maxLength) + '...';
    }
    
    return title;
  }
  
  setSystemPrompt(prompt) {
    this.systemPrompt = prompt;
    this.metadata.updated = new Date().toISOString();
  }
  
  getMessages(includeSystem = false) {
    const messages = [...this.messages];
    
    if (includeSystem && this.systemPrompt) {
      messages.unshift(new Message('system', this.systemPrompt));
    }
    
    return messages;
  }
  
  getLastMessage() {
    return this.messages[this.messages.length - 1] || null;
  }
  
  getMessageById(id) {
    return this.messages.find(msg => msg.id === id) || null;
  }
  
  removeMessage(id) {
    const index = this.messages.findIndex(msg => msg.id === id);
    if (index !== -1) {
      this.messages.splice(index, 1);
      this.metadata.updated = new Date().toISOString();
      return true;
    }
    return false;
  }
  
  clear() {
    this.messages = [];
    this.systemPrompt = null;
    this.metadata.updated = new Date().toISOString();
  }
  
  toJSON() {
    return {
      id: this.id,
      messages: this.messages.map(msg => msg.toJSON()),
      systemPrompt: this.systemPrompt,
      metadata: this.metadata
    };
  }
  
  static fromJSON(data) {
    const conversation = new Conversation(data.id);
    conversation.messages = data.messages.map(msg => Message.fromJSON(msg));
    conversation.systemPrompt = data.systemPrompt;
    conversation.metadata = data.metadata;
    return conversation;
  }
  
  getSummary() {
    return {
      id: this.id,
      title: this.metadata.title || 'Untitled Conversation',
      created: this.metadata.created,
      updated: this.metadata.updated,
      messageCount: this.messages.length,
      tags: this.metadata.tags
    };
  }
}

/**
 * ConversationManager class for managing multiple conversations
 */
export class ConversationManager {
  constructor(config = {}) {
    this.config = config;
    this.currentConversation = null;
    this.conversations = new Map();
    this.storageDir = this.getStorageDir();
    this.autoSave = config.autoSave !== false;
    this.maxConversations = config.maxConversations || 100;
  }
  
  getStorageDir() {
    return this.config.storageDir || join(homedir(), CONVERSATION_DIR);
  }
  
  async ensureStorageDir() {
    if (!existsSync(this.storageDir)) {
      await mkdir(this.storageDir, { recursive: true });
    }
  }
  
  /**
   * Create a new conversation
   */
  createConversation() {
    this.currentConversation = new Conversation();
    this.conversations.set(this.currentConversation.id, this.currentConversation);
    return this.currentConversation;
  }
  
  /**
   * Load a conversation by ID
   */
  async loadConversation(id) {
    // Check if already in memory
    if (this.conversations.has(id)) {
      this.currentConversation = this.conversations.get(id);
      return this.currentConversation;
    }
    
    // Load from disk
    await this.ensureStorageDir();
    const filePath = join(this.storageDir, `${id}.json`);
    
    if (existsSync(filePath)) {
      const data = await readFile(filePath, 'utf-8');
      const conversation = Conversation.fromJSON(JSON.parse(data));
      this.conversations.set(id, conversation);
      this.currentConversation = conversation;
      return conversation;
    }
    
    throw new Error(`Conversation ${id} not found`);
  }
  
  /**
   * Save current conversation to disk
   */
  async save() {
    if (!this.currentConversation) {
      throw new Error('No active conversation to save');
    }
    
    await this.saveConversation(this.currentConversation);
  }
  
  /**
   * Save a specific conversation
   */
  async saveConversation(conversation) {
    await this.ensureStorageDir();
    const filePath = join(this.storageDir, `${conversation.id}.json`);
    const data = JSON.stringify(conversation.toJSON(), null, 2);
    await writeFile(filePath, data, 'utf-8');
  }
  
  /**
   * Load the most recent conversation
   */
  async loadPrevious() {
    const conversations = await this.listConversations();
    
    if (conversations.length > 0) {
      const mostRecent = conversations[0]; // Already sorted by date
      await this.loadConversation(mostRecent.id);
      return this.currentConversation;
    }
    
    // No previous conversation, create new one
    return this.createConversation();
  }
  
  /**
   * List all saved conversations
   */
  async listConversations() {
    await this.ensureStorageDir();
    const files = await readdir(this.storageDir);
    const conversations = [];
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const filePath = join(this.storageDir, file);
          const data = await readFile(filePath, 'utf-8');
          const conv = Conversation.fromJSON(JSON.parse(data));
          conversations.push(conv.getSummary());
        } catch (error) {
          // Skip corrupted files
          console.error(`Failed to load conversation ${file}:`, error.message);
        }
      }
    }
    
    // Sort by updated date (newest first)
    conversations.sort((a, b) => 
      new Date(b.updated).getTime() - new Date(a.updated).getTime()
    );
    
    return conversations;
  }
  
  /**
   * Delete a conversation
   */
  async deleteConversation(id) {
    const filePath = join(this.storageDir, `${id}.json`);
    
    if (existsSync(filePath)) {
      const { unlink } = await import('node:fs/promises');
      await unlink(filePath);
      this.conversations.delete(id);
      
      if (this.currentConversation?.id === id) {
        this.currentConversation = null;
      }
      
      return true;
    }
    
    return false;
  }
  
  /**
   * Search conversations
   */
  async searchConversations(query) {
    const conversations = await this.listConversations();
    const results = [];
    
    for (const summary of conversations) {
      // Load full conversation for searching
      const conversation = await this.loadConversation(summary.id);
      
      // Search in messages and metadata
      const found = conversation.messages.some(msg => 
        msg.content.toLowerCase().includes(query.toLowerCase())
      ) || 
      summary.title?.toLowerCase().includes(query.toLowerCase()) ||
      summary.tags?.some(tag => 
        tag.toLowerCase().includes(query.toLowerCase())
      );
      
      if (found) {
        results.push(summary);
      }
    }
    
    return results;
  }
  
  /**
   * Export conversation to different formats
   */
  async exportConversation(id, format = 'json') {
    const conversation = await this.loadConversation(id);
    
    switch (format) {
      case 'json':
        return JSON.stringify(conversation.toJSON(), null, 2);
        
      case 'markdown':
        return this.exportToMarkdown(conversation);
        
      case 'text':
        return this.exportToText(conversation);
        
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }
  
  exportToMarkdown(conversation) {
    let markdown = `# ${conversation.metadata.title || 'Conversation'}\n\n`;
    markdown += `**Created:** ${conversation.metadata.created}\n`;
    markdown += `**Updated:** ${conversation.metadata.updated}\n\n`;
    
    if (conversation.systemPrompt) {
      markdown += `## System Prompt\n\n${conversation.systemPrompt}\n\n`;
    }
    
    markdown += `## Messages\n\n`;
    
    for (const message of conversation.messages) {
      const role = message.role.charAt(0).toUpperCase() + message.role.slice(1);
      markdown += `### ${role} (${message.timestamp})\n\n`;
      markdown += `${message.content}\n\n`;
    }
    
    return markdown;
  }
  
  exportToText(conversation) {
    let text = `${conversation.metadata.title || 'Conversation'}\n`;
    text += `${'='.repeat(50)}\n\n`;
    
    if (conversation.systemPrompt) {
      text += `System: ${conversation.systemPrompt}\n\n`;
    }
    
    for (const message of conversation.messages) {
      text += `${message.role.toUpperCase()}: ${message.content}\n\n`;
    }
    
    return text;
  }
  
  /**
   * Clean up old conversations
   */
  async cleanup(daysToKeep = 30) {
    const conversations = await this.listConversations();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    let deletedCount = 0;
    
    for (const summary of conversations) {
      if (new Date(summary.updated) < cutoffDate) {
        await this.deleteConversation(summary.id);
        deletedCount++;
      }
    }
    
    return deletedCount;
  }
  
  // Proxy methods for current conversation
  
  addMessage(role, content, metadata) {
    if (!this.currentConversation) {
      this.createConversation();
    }
    
    const message = this.currentConversation.addMessage(role, content, metadata);
    
    if (this.autoSave) {
      // Auto-save in background (don't await)
      this.save().catch(error => {
        console.error('Auto-save failed:', error.message);
      });
    }
    
    return message;
  }
  
  setSystemPrompt(prompt) {
    if (!this.currentConversation) {
      this.createConversation();
    }
    
    this.currentConversation.setSystemPrompt(prompt);
  }
  
  getSystemPrompt() {
    return this.currentConversation?.systemPrompt || null;
  }
  
  getMessages() {
    return this.currentConversation?.getMessages() || [];
  }
  
  clear() {
    if (this.currentConversation) {
      this.currentConversation.clear();
    }
  }
  
  getCurrentConversation() {
    return this.currentConversation;
  }
}

export default ConversationManager;