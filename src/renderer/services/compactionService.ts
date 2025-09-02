/**
 * Compaction Service
 * Handles context compaction and auto-trigger at 96%
 */

import { invoke } from '@tauri-apps/api/core';
import { useClaudeCodeStore } from '../stores/claudeCodeStore';
import { hooksService } from './hooksService';

export interface CompactionConfig {
  autoThreshold: number;  // 0.96 (96%)
  forceThreshold: number; // 0.98 (98%)
  preserveContext: boolean;
  generateManifest: boolean;
}

export interface CompactionAction {
  type: 'None' | 'Notice' | 'Warning' | 'AutoTrigger' | 'Force';
  message?: string;
  shouldTriggerCompact: boolean;
}

export interface ContextManifest {
  version: string;
  taskId?: string;
  sessionId: string;
  timestamp: string;
  context: {
    files: string[];
    functions: string[];
    dependencies: string[];
    decisions: Array<{
      decision: string;
      rationale: string;
      timestamp: string;
    }>;
  };
  scope?: string;
  entryPoints: string[];
  testFiles: string[];
}

class CompactionService {
  private config: CompactionConfig = {
    autoThreshold: 0.96,
    forceThreshold: 0.98,
    preserveContext: true,
    generateManifest: true
  };

  private compactingSessionIds = new Set<string>();
  private lastCompactionTime: Record<string, number> = {};

  /**
   * Update context usage and check for auto-compaction
   */
  async updateContextUsage(sessionId: string, usagePercentage: number): Promise<void> {
    // Don't process if already compacting
    if (this.compactingSessionIds.has(sessionId)) {
      return;
    }

    try {
      // Update backend with context usage
      const actionStr = await invoke<string>('update_context_usage', {
        sessionId,
        usage: usagePercentage / 100 // Convert percentage to decimal
      });

      const action: CompactionAction = JSON.parse(actionStr);

      // Handle different action types
      switch (action.type) {
        case 'Notice':
          console.log(`[Compaction] ${action.message}`);
          break;

        case 'Warning':
          console.warn(`[Compaction] ${action.message}`);
          // Show warning in UI
          this.showCompactionWarning(sessionId, action.message || '');
          break;

        case 'AutoTrigger':
          console.log(`[Compaction] Auto-triggering compact at ${usagePercentage}%`);
          await this.triggerAutoCompaction(sessionId);
          break;

        case 'Force':
          console.warn(`[Compaction] Force-triggering compact at ${usagePercentage}%`);
          await this.triggerForceCompaction(sessionId);
          break;
      }

      // Execute compaction_trigger hook if needed
      if (action.shouldTriggerCompact) {
        await hooksService.executeHook('compaction_trigger', {
          sessionId,
          usage_percentage: usagePercentage,
          action_type: action.type
        }, sessionId);
      }
    } catch (error) {
      console.error('[Compaction] Failed to update context usage:', error);
    }
  }

  /**
   * Trigger auto-compaction at 96%
   */
  async triggerAutoCompaction(sessionId: string): Promise<void> {
    // Prevent multiple compactions
    if (this.compactingSessionIds.has(sessionId)) {
      return;
    }

    // Rate limiting - don't compact more than once per minute
    const lastTime = this.lastCompactionTime[sessionId] || 0;
    if (Date.now() - lastTime < 60000) {
      console.log('[Compaction] Skipping auto-compact (rate limited)');
      return;
    }

    this.compactingSessionIds.add(sessionId);
    this.lastCompactionTime[sessionId] = Date.now();

    const store = useClaudeCodeStore.getState();
    
    // Update compaction state
    store.setCompacting(sessionId, true);

    try {
      // Generate and save context manifest before compaction
      if (this.config.generateManifest) {
        await this.generateAndSaveManifest(sessionId);
        store.updateCompactionState(sessionId, { manifestSaved: true });
      }

      // Send /compact command
      await store.sendMessage('/compact', false);

      console.log('[Compaction] Auto-compact triggered successfully');
    } catch (error) {
      console.error('[Compaction] Auto-compact failed:', error);
    } finally {
      this.compactingSessionIds.delete(sessionId);
      store.setCompacting(sessionId, false);
    }
  }

  /**
   * Force compaction at 98%
   */
  async triggerForceCompaction(sessionId: string): Promise<void> {
    this.compactingSessionIds.add(sessionId);
    
    const store = useClaudeCodeStore.getState();
    store.setCompacting(sessionId, true);

    try {
      // Generate and save context manifest
      await this.generateAndSaveManifest(sessionId);
      store.updateCompactionState(sessionId, { manifestSaved: true });

      // Force compact
      await store.sendMessage('/compact', false);

      console.log('[Compaction] Force-compact completed');
    } catch (error) {
      console.error('[Compaction] Force-compact failed:', error);
    } finally {
      this.compactingSessionIds.delete(sessionId);
      store.setCompacting(sessionId, false);
    }
  }

  /**
   * Generate and save context manifest
   */
  async generateAndSaveManifest(sessionId: string): Promise<void> {
    try {
      const store = useClaudeCodeStore.getState();
      const session = store.sessions.find(s => s.id === sessionId);
      
      if (!session) {
        return;
      }

      // Extract context from messages
      const files = new Set<string>();
      const functions = new Set<string>();
      
      session.messages?.forEach(msg => {
        // Extract file paths from tool use messages
        if (msg.type === 'tool_use' && msg.name) {
          if (msg.name === 'Read' && msg.input?.file_path) {
            files.add(msg.input.file_path);
          } else if ((msg.name === 'Edit' || msg.name === 'Write') && msg.input?.file_path) {
            files.add(msg.input.file_path);
          } else if (msg.name === 'MultiEdit' && msg.input?.file_path) {
            files.add(msg.input.file_path);
          }
        }
      });

      // Generate manifest
      const manifest = await invoke<ContextManifest>('generate_context_manifest', {
        sessionId,
        taskId: session.name,
        scope: session.claudeTitle,
        files: Array.from(files),
        functions: Array.from(functions),
        dependencies: [],
        decisions: []
      });

      console.log('[Compaction] Context manifest saved:', manifest);
    } catch (error) {
      console.error('[Compaction] Failed to generate manifest:', error);
    }
  }

  /**
   * Show compaction warning in UI
   */
  private showCompactionWarning(sessionId: string, message: string): void {
    // This could trigger a toast notification or update UI state
    console.warn(`[Compaction Warning] ${message}`);
  }

  /**
   * Load context manifest
   */
  async loadManifest(sessionId: string): Promise<ContextManifest | null> {
    try {
      return await invoke<ContextManifest>('load_context_manifest', { sessionId });
    } catch (error) {
      console.error('[Compaction] Failed to load manifest:', error);
      return null;
    }
  }

  /**
   * Update compaction configuration
   */
  async updateConfig(config: Partial<CompactionConfig>): Promise<void> {
    this.config = { ...this.config, ...config };
    
    try {
      await invoke('update_compaction_config', { config: this.config });
    } catch (error) {
      console.error('[Compaction] Failed to update config:', error);
    }
  }

  /**
   * Get current configuration
   */
  async getConfig(): Promise<CompactionConfig> {
    try {
      const config = await invoke<CompactionConfig>('get_compaction_config');
      this.config = config;
      return config;
    } catch (error) {
      console.error('[Compaction] Failed to get config:', error);
      return this.config;
    }
  }

  /**
   * Check if session is currently compacting
   */
  isCompacting(sessionId: string): boolean {
    return this.compactingSessionIds.has(sessionId);
  }
}

export const compactionService = new CompactionService();