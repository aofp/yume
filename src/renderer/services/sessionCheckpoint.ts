/**
 * Session Checkpoint System
 * DISABLED: This feature is not currently used.
 *
 * Inspired by Claudia's checkpoint approach but adapted for localStorage
 * Maintains session-specific context that can be restored when Claude sessions fail
 */

// Compression can be added later as an optimization
// import { compress, decompress } from 'fflate';

export interface Message {
  type: 'user' | 'assistant' | 'system';
  message?: {
    content: string | Array<{ type: string; text?: string }>;
  };
}

export interface SessionCheckpoint {
  id: string;
  sessionId: string;
  claudeSessionId?: string;
  timestamp: number;
  messages: Message[];
  workingDirectory: string;
  metadata: {
    model?: string;
    totalTokens?: number;
    lastUserPrompt?: string;
  };
}

export interface CheckpointStorage {
  version: string;
  checkpoints: Record<string, SessionCheckpoint>;
  lastCheckpointId?: string;
}

class SessionCheckpointManager {
  private readonly STORAGE_KEY_PREFIX = 'yurucode-checkpoint-';
  private readonly MAX_CHECKPOINTS_PER_SESSION = 10;
  private readonly MAX_MESSAGES_PER_CHECKPOINT = 50;
  private readonly CHECKPOINT_VERSION = '1.0.0';
  private readonly MAX_STORAGE_SIZE = 5 * 1024 * 1024; // 5MB per session

  /**
   * Create a checkpoint for the current session state
   */
  async createCheckpoint(
    sessionId: string,
    messages: Message[],
    claudeSessionId?: string,
    workingDirectory?: string,
    metadata?: { model?: string; totalTokens?: number }
  ): Promise<string> {
    try {
      const checkpointId = `cp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      
      // Limit messages to prevent excessive storage
      const messagesToStore = messages.slice(-this.MAX_MESSAGES_PER_CHECKPOINT);
      
      const checkpoint: SessionCheckpoint = {
        id: checkpointId,
        sessionId,
        claudeSessionId,
        timestamp: Date.now(),
        messages: messagesToStore,
        workingDirectory: workingDirectory || '',
        metadata: {
          model: metadata?.model,
          totalTokens: metadata?.totalTokens,
          lastUserPrompt: this.extractLastUserPrompt(messagesToStore)
        }
      };

      // Save checkpoint
      await this.saveCheckpoint(sessionId, checkpoint);
      
      console.log(`[SessionCheckpoint] Created ${checkpointId} for session ${sessionId}`);
      return checkpointId;
    } catch (error) {
      console.error('[SessionCheckpoint] Failed to create:', error);
      throw error;
    }
  }

  /**
   * Save checkpoint to localStorage (simplified without compression for now)
   */
  private async saveCheckpoint(sessionId: string, checkpoint: SessionCheckpoint): Promise<void> {
    const storageKey = `${this.STORAGE_KEY_PREFIX}${sessionId}`;
    
    try {
      // Get existing storage or create new
      let storage: CheckpointStorage = this.getStorage(sessionId) || {
        version: this.CHECKPOINT_VERSION,
        checkpoints: {}
      };

      // Add new checkpoint
      storage.checkpoints[checkpoint.id] = checkpoint;
      storage.lastCheckpointId = checkpoint.id;

      // Cleanup old checkpoints if exceeded limit
      const checkpointIds = Object.keys(storage.checkpoints)
        .sort((a, b) => storage.checkpoints[b].timestamp - storage.checkpoints[a].timestamp);
      
      if (checkpointIds.length > this.MAX_CHECKPOINTS_PER_SESSION) {
        const toRemove = checkpointIds.slice(this.MAX_CHECKPOINTS_PER_SESSION);
        toRemove.forEach(id => delete storage.checkpoints[id]);
        console.log(`[SessionCheckpoint] Removed ${toRemove.length} old checkpoints`);
      }

      // Save as JSON (compression can be added later as optimization)
      const jsonStr = JSON.stringify(storage);
      
      // Check size limit
      if (jsonStr.length > this.MAX_STORAGE_SIZE) {
        // Remove oldest checkpoints until under limit
        while (jsonStr.length > this.MAX_STORAGE_SIZE && checkpointIds.length > 1) {
          const oldestId = checkpointIds.pop();
          if (oldestId) {
            delete storage.checkpoints[oldestId];
            console.log(`[SessionCheckpoint] Removed ${oldestId} to stay under storage limit`);
          }
        }
      }

      localStorage.setItem(storageKey, jsonStr);
    } catch (error) {
      console.error('[SessionCheckpoint] Failed to save:', error);
      throw error;
    }
  }

  /**
   * Restore the latest checkpoint for a session
   */
  async restoreLatestCheckpoint(sessionId: string): Promise<SessionCheckpoint | null> {
    try {
      const storage = this.getStorage(sessionId);
      if (!storage || !storage.lastCheckpointId) {
        console.log(`[SessionCheckpoint] No checkpoints found for session ${sessionId}`);
        return null;
      }

      const checkpoint = storage.checkpoints[storage.lastCheckpointId];
      if (!checkpoint) {
        console.log(`[SessionCheckpoint] Last checkpoint ${storage.lastCheckpointId} not found`);
        return null;
      }

      console.log(`[SessionCheckpoint] Restored ${checkpoint.id} for session ${sessionId}`);
      return checkpoint;
    } catch (error) {
      console.error('[SessionCheckpoint] Failed to restore:', error);
      return null;
    }
  }

  /**
   * Get all checkpoints for a session
   */
  getSessionCheckpoints(sessionId: string): SessionCheckpoint[] {
    const storage = this.getStorage(sessionId);
    if (!storage) return [];
    
    return Object.values(storage.checkpoints)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Delete all checkpoints for a session
   */
  clearSessionCheckpoints(sessionId: string): void {
    const storageKey = `${this.STORAGE_KEY_PREFIX}${sessionId}`;
    localStorage.removeItem(storageKey);
    console.log(`[SessionCheckpoint] Cleared all checkpoints for session ${sessionId}`);
  }

  /**
   * Get storage for a session
   */
  private getStorage(sessionId: string): CheckpointStorage | null {
    const storageKey = `${this.STORAGE_KEY_PREFIX}${sessionId}`;
    const data = localStorage.getItem(storageKey);
    
    if (!data) return null;

    try {
      return JSON.parse(data);
    } catch (error) {
      console.error('[SessionCheckpoint] Failed to parse storage:', error);
      return null;
    }
  }

  // Compression methods removed for simplicity
  // Can be re-added later as an optimization

  /**
   * Extract last user prompt from messages
   */
  private extractLastUserPrompt(messages: Message[]): string {
    const lastUserMessage = messages
      .filter(m => m.type === 'user')
      .pop();
    
    if (!lastUserMessage) return '';
    
    const content = lastUserMessage.message?.content;
    if (typeof content === 'string') {
      return content.substring(0, 100);
    } else if (Array.isArray(content)) {
      const textContent = content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join(' ');
      return textContent.substring(0, 100);
    }
    
    return '';
  }

  /**
   * Get total storage size used
   */
  getStorageSize(): number {
    let totalSize = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.STORAGE_KEY_PREFIX)) {
        const value = localStorage.getItem(key);
        if (value) {
          totalSize += value.length;
        }
      }
    }
    return totalSize;
  }

  /**
   * Clean up old checkpoints across all sessions
   */
  cleanupOldCheckpoints(daysToKeep: number = 7): void {
    const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
    let removedCount = 0;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.STORAGE_KEY_PREFIX)) {
        const storage = this.getStorage(key.replace(this.STORAGE_KEY_PREFIX, ''));
        if (storage) {
          const checkpointIds = Object.keys(storage.checkpoints);
          checkpointIds.forEach(id => {
            if (storage.checkpoints[id].timestamp < cutoffTime) {
              delete storage.checkpoints[id];
              removedCount++;
            }
          });
          
          // Save updated storage or remove if empty
          if (Object.keys(storage.checkpoints).length === 0) {
            localStorage.removeItem(key);
          } else {
            this.saveCheckpoint(
              key.replace(this.STORAGE_KEY_PREFIX, ''),
              Object.values(storage.checkpoints)[0]
            );
          }
        }
      }
    }
    
    console.log(`[SessionCheckpoint] Cleaned up ${removedCount} old checkpoints`);
  }
}

// Export singleton instance
export const checkpointManager = new SessionCheckpointManager();