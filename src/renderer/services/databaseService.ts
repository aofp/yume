/**
 * Database Service for yume
 * Provides frontend interface to SQLite backend via Tauri commands
 */

import { invoke } from '@tauri-apps/api/core';

// Types matching backend structures
export interface DbSession {
  id: string;
  name: string;
  status: string;
  working_directory?: string;
  claude_session_id?: string;
  claude_title?: string;
  user_renamed: boolean;
  created_at: string;
  updated_at: string;
  metadata?: string;
}

export interface DbMessage {
  id: string;
  session_id: string;
  message_type: string;
  role?: string;
  content?: string;
  tool_uses?: string;
  usage?: string;
  timestamp: string;
}

export interface DbAnalytics {
  id?: number;
  session_id: string;
  tokens_input: number;
  tokens_output: number;
  tokens_cache: number;
  cost_usd: number;
  model?: string;
  timestamp: string;
}

export interface DbStatistics {
  sessions: number;
  messages: number;
  total_cost: number;
  database_size: number;
}

class DatabaseService {
  private enabled: boolean = true;
  private cache: Map<string, any> = new Map();
  private pendingOperations: Map<string, Promise<any>> = new Map();

  /**
   * Enable or disable database operations
   * When disabled, operations will be no-ops (for fallback to in-memory)
   */
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) {
      this.cache.clear();
      this.pendingOperations.clear();
    }
  }

  /**
   * Save or update a session
   */
  async saveSession(session: DbSession): Promise<void> {
    if (!this.enabled) return;
    
    const key = `session:${session.id}`;
    this.cache.set(key, session);
    
    try {
      await invoke('db_save_session', { session });
    } catch (error) {
      console.error('Failed to save session to database:', error);
      // Don't throw - allow app to continue with in-memory storage
    }
  }

  /**
   * Load a specific session
   */
  async loadSession(sessionId: string): Promise<DbSession | null> {
    if (!this.enabled) return null;
    
    const key = `session:${sessionId}`;
    
    // Check cache first
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }
    
    // Check if we already have a pending operation
    const pendingKey = `loadSession:${sessionId}`;
    if (this.pendingOperations.has(pendingKey)) {
      return this.pendingOperations.get(pendingKey);
    }
    
    // Create new operation
    const operation = invoke<DbSession | null>('db_load_session', { sessionId })
      .then(session => {
        if (session) {
          this.cache.set(key, session);
        }
        this.pendingOperations.delete(pendingKey);
        return session;
      })
      .catch(error => {
        console.error('Failed to load session from database:', error);
        this.pendingOperations.delete(pendingKey);
        return null;
      });
    
    this.pendingOperations.set(pendingKey, operation);
    return operation;
  }

  /**
   * Load all sessions
   */
  async loadAllSessions(): Promise<DbSession[]> {
    if (!this.enabled) return [];
    
    try {
      const sessions = await invoke<DbSession[]>('db_load_all_sessions');
      
      // Update cache
      sessions.forEach(session => {
        this.cache.set(`session:${session.id}`, session);
      });
      
      return sessions;
    } catch (error) {
      console.error('Failed to load sessions from database:', error);
      return [];
    }
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<void> {
    if (!this.enabled) return;
    
    const key = `session:${sessionId}`;
    this.cache.delete(key);
    
    try {
      await invoke('db_delete_session', { sessionId });
    } catch (error) {
      console.error('Failed to delete session from database:', error);
    }
  }

  /**
   * Save a message
   */
  async saveMessage(message: DbMessage): Promise<void> {
    if (!this.enabled) return;
    
    try {
      await invoke('db_save_message', { message });
    } catch (error) {
      console.error('Failed to save message to database:', error);
    }
  }

  /**
   * Batch save multiple messages (for performance)
   */
  async saveMessages(messages: DbMessage[]): Promise<void> {
    if (!this.enabled) return;
    
    // Save in parallel with limited concurrency
    const batchSize = 10;
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      await Promise.all(batch.map(msg => this.saveMessage(msg)));
    }
  }

  /**
   * Load all messages for a session
   */
  async loadMessages(sessionId: string): Promise<DbMessage[]> {
    if (!this.enabled) return [];
    
    try {
      return await invoke<DbMessage[]>('db_load_messages', { sessionId });
    } catch (error) {
      console.error('Failed to load messages from database:', error);
      return [];
    }
  }

  /**
   * Save analytics data
   */
  async saveAnalytics(analytics: DbAnalytics): Promise<void> {
    if (!this.enabled) return;
    
    try {
      await invoke('db_save_analytics', { analytics });
    } catch (error) {
      console.error('Failed to save analytics to database:', error);
    }
  }

  /**
   * Load analytics for a session
   */
  async loadAnalytics(sessionId: string): Promise<DbAnalytics[]> {
    if (!this.enabled) return [];
    
    try {
      return await invoke<DbAnalytics[]>('db_load_analytics', { sessionId });
    } catch (error) {
      console.error('Failed to load analytics from database:', error);
      return [];
    }
  }

  /**
   * Get database statistics
   */
  async getStatistics(): Promise<DbStatistics> {
    if (!this.enabled) {
      return {
        sessions: 0,
        messages: 0,
        total_cost: 0,
        database_size: 0
      };
    }
    
    try {
      return await invoke<DbStatistics>('db_get_statistics');
    } catch (error) {
      console.error('Failed to get database statistics:', error);
      return {
        sessions: 0,
        messages: 0,
        total_cost: 0,
        database_size: 0
      };
    }
  }

  /**
   * Clear all data (with confirmation)
   */
  async clearAllData(confirm: boolean = false): Promise<void> {
    if (!this.enabled) return;
    if (!confirm) {
      throw new Error('Confirmation required to clear database');
    }
    
    this.cache.clear();
    this.pendingOperations.clear();
    
    try {
      await invoke('db_clear_all_data', { confirm });
    } catch (error) {
      console.error('Failed to clear database:', error);
      throw error;
    }
  }

  /**
   * Export all data as JSON
   */
  async exportData(): Promise<any> {
    if (!this.enabled) return null;
    
    try {
      return await invoke('db_export_data');
    } catch (error) {
      console.error('Failed to export data:', error);
      throw error;
    }
  }

  /**
   * Import data from JSON
   */
  async importData(data: any): Promise<void> {
    if (!this.enabled) return;
    
    this.cache.clear();
    
    try {
      await invoke('db_import_data', { data });
    } catch (error) {
      console.error('Failed to import data:', error);
      throw error;
    }
  }

  /**
   * Convert frontend session to database format
   */
  sessionToDb(session: any): DbSession {
    return {
      id: session.id,
      name: session.name,
      status: session.status || 'pending',
      working_directory: session.workingDirectory,
      claude_session_id: session.claudeSessionId,
      claude_title: session.claudeTitle,
      user_renamed: session.userRenamed || false,
      created_at: session.createdAt?.toISOString() || new Date().toISOString(),
      updated_at: session.updatedAt?.toISOString() || new Date().toISOString(),
      metadata: session.metadata ? JSON.stringify(session.metadata) : undefined
    };
  }

  /**
   * Convert database session to frontend format
   */
  sessionFromDb(dbSession: DbSession): any {
    return {
      id: dbSession.id,
      name: dbSession.name,
      status: dbSession.status,
      workingDirectory: dbSession.working_directory,
      claudeSessionId: dbSession.claude_session_id,
      claudeTitle: dbSession.claude_title,
      userRenamed: dbSession.user_renamed,
      createdAt: new Date(dbSession.created_at),
      updatedAt: new Date(dbSession.updated_at),
      metadata: dbSession.metadata ? JSON.parse(dbSession.metadata) : undefined,
      messages: [], // Will be loaded separately
      analytics: undefined // Will be loaded separately
    };
  }

  /**
   * Convert frontend message to database format
   */
  messageToDb(message: any, sessionId: string): DbMessage {
    return {
      id: message.id || `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      session_id: sessionId,
      message_type: message.type || 'message',
      role: message.role,
      content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
      tool_uses: message.tool_uses ? JSON.stringify(message.tool_uses) : undefined,
      usage: message.usage ? JSON.stringify(message.usage) : undefined,
      timestamp: message.timestamp?.toISOString() || new Date().toISOString()
    };
  }

  /**
   * Convert database message to frontend format
   */
  messageFromDb(dbMessage: DbMessage): any {
    return {
      id: dbMessage.id,
      type: dbMessage.message_type,
      role: dbMessage.role,
      content: dbMessage.content ? 
        (dbMessage.content.startsWith('{') || dbMessage.content.startsWith('[') ? 
          JSON.parse(dbMessage.content) : dbMessage.content) : undefined,
      tool_uses: dbMessage.tool_uses ? JSON.parse(dbMessage.tool_uses) : undefined,
      usage: dbMessage.usage ? JSON.parse(dbMessage.usage) : undefined,
      timestamp: new Date(dbMessage.timestamp)
    };
  }
}

// Export singleton instance
export const databaseService = new DatabaseService();

// Auto-save helper with debouncing
export class AutoSave {
  private saveTimer: NodeJS.Timeout | null = null;
  private pendingSaves: Map<string, any> = new Map();
  
  /**
   * Schedule a save operation with debouncing
   */
  scheduleSave(key: string, data: any, saveFunc: () => Promise<void>, delay: number = 1000) {
    this.pendingSaves.set(key, { data, saveFunc });
    
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    
    this.saveTimer = setTimeout(() => {
      this.executePendingSaves();
    }, delay);
  }
  
  /**
   * Execute all pending saves
   */
  private async executePendingSaves() {
    const saves = Array.from(this.pendingSaves.values());
    this.pendingSaves.clear();
    
    // Execute saves in parallel
    await Promise.all(saves.map(({ saveFunc }) => 
      saveFunc().catch((error: any) => {
        console.error('Auto-save failed:', error);
      })
    ));
  }
  
  /**
   * Force immediate save of pending operations
   */
  async flush() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    
    if (this.pendingSaves.size > 0) {
      await this.executePendingSaves();
    }
  }
}

export const autoSave = new AutoSave();