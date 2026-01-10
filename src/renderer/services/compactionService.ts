/**
 * Compaction Service
 * Handles context compaction with 55% warning, 60% auto, 65% force thresholds
 */

import { invoke } from '@tauri-apps/api/core';
import { useClaudeCodeStore } from '../stores/claudeCodeStore';
import { hooksService } from './hooksService';
import { setAutoCompactMessage } from './wrapperIntegration';

export interface CompactionConfig {
  autoThreshold: number;  // 0.60 (60%) - auto-compact threshold
  forceThreshold: number; // 0.65 (65%) - force-compact threshold
  preserveContext: boolean;
  generateManifest: boolean;
}

export type CompactionActionType = 'None' | 'Notice' | 'Warning' | 'AutoTrigger' | 'Force';

export interface CompactionAction {
  type: CompactionActionType;
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
    autoThreshold: 0.60,  // 60% - conservative auto-compact (38% buffer like Claude Code)
    forceThreshold: 0.65, // 65% - force compact
    preserveContext: true,
    generateManifest: true
  };

  private compactingSessionIds = new Set<string>();
  private lastCompactionTime: Record<string, number> = {};

  /**
   * Get message for action type
   */
  private getActionMessage(actionType: CompactionActionType): string {
    switch (actionType) {
      case 'None':
        return '';
      case 'Notice':
        return ''; // Notice level deprecated
      case 'Warning':
        return 'Context usage at 55%. Auto-compact will trigger at 60%.';
      case 'AutoTrigger':
        return 'Context usage at 60%. Auto-compacting (38% buffer reserved like Claude Code).';
      case 'Force':
        return 'Context usage at 65%. Force-compacting to prevent context overflow.';
      default:
        return '';
    }
  }

  /**
   * Update context usage and check for auto-compaction
   */
  async updateContextUsage(sessionId: string, usagePercentage: number): Promise<void> {
    console.log(`[Compaction] 📊 updateContextUsage called: ${usagePercentage.toFixed(2)}% for session ${sessionId}`);

    // Check if auto-compact is enabled (defaults to true if undefined)
    const store = useClaudeCodeStore.getState();
    if (store.autoCompactEnabled === false) {
      console.log('[Compaction] ⚠️ Auto-compact disabled, skipping');
      return;
    }

    // Don't process if already compacting
    if (this.compactingSessionIds.has(sessionId)) {
      console.log('[Compaction] ⚠️ Already compacting, skipping update');
      return;
    }

    // Guard: Sanity check - if percentage is impossibly high (>200%), it's likely wrong calculation
    if (usagePercentage > 200) {
      console.warn(`[Compaction] ⚠️ Ignoring impossibly high usage: ${usagePercentage.toFixed(2)}% - likely cumulative API values, not actual context`);
      return;
    }

    // Guard: Don't trigger on negative or zero values
    if (usagePercentage <= 0) {
      console.log('[Compaction] ⚠️ Ignoring zero/negative usage');
      return;
    }

    try {
      // Update backend with context usage
      const usageDecimal = usagePercentage / 100; // Convert percentage to decimal
      console.log(`[Compaction] 📡 Calling backend with usage: ${usageDecimal} (${usagePercentage}%)`);
      
      const actionStr = await invoke<string>('update_context_usage', {
        sessionId,
        usage: usageDecimal
      });

      // Backend returns just the enum variant as a string (e.g., "AutoTrigger")
      const actionType = JSON.parse(actionStr) as CompactionActionType;
      console.log(`[Compaction] 🎬 Backend returned action type: "${actionType}"`);
      
      // Convert to our CompactionAction interface
      const action: CompactionAction = {
        type: actionType,
        message: this.getActionMessage(actionType),
        shouldTriggerCompact: actionType === 'AutoTrigger' || actionType === 'Force'
      };
      console.log(`[Compaction] 📦 Parsed action:`, action);

      // Handle different action types
      switch (action.type) {
        case 'Notice':
          // Notice level removed - do nothing at 75%
          break;

        case 'Warning':
          console.warn(`[Compaction] ⚠️ Warning: ${action.message}`);
          // Show warning in UI
          this.showCompactionWarning(sessionId, action.message || '');
          break;

        case 'AutoTrigger':
          console.log(`[Compaction] 🔄 AUTO-TRIGGER ACTION at ${usagePercentage}%!`);
          await this.triggerAutoCompaction(sessionId);
          break;

        case 'Force':
          console.warn(`[Compaction] 🚨 FORCE-TRIGGER ACTION at ${usagePercentage}%!`);
          await this.triggerForceCompaction(sessionId);
          break;
          
        default:
          console.log(`[Compaction] No action needed at ${usagePercentage}%`);
      }

      // Execute compaction_trigger hook if needed
      if (action.shouldTriggerCompact) {
        console.log(`[Compaction] 🪝 Executing compaction_trigger hook`);
        await hooksService.executeHook('compaction_trigger', {
          sessionId,
          usage_percentage: usagePercentage,
          action_type: action.type
        }, sessionId);
      }
    } catch (error) {
      console.error('[Compaction] ❌ Failed to update context usage:', error);
    }
  }

  /**
   * Mark session for auto-compaction on next user message
   * (Instead of immediately compacting, we wait for user to send a followup)
   */
  async triggerAutoCompaction(sessionId: string): Promise<void> {
    console.log('[Compaction] 🎯 triggerAutoCompaction called for session:', sessionId);

    const store = useClaudeCodeStore.getState();

    // Guard: Don't trigger if auto-compact is disabled
    if (store.autoCompactEnabled === false) {
      console.log('[Compaction] ⚠️ Auto-compact disabled, not setting pending flag');
      await invoke('reset_compaction_flags', { sessionId });
      return;
    }

    const session = store.sessions.find(s => s.id === sessionId);

    // Guard: Don't flag if already pending or compacting
    if (session?.compactionState?.pendingAutoCompact) {
      console.log('[Compaction] ⚠️ Already pending auto-compact, skipping');
      return;
    }
    if (this.compactingSessionIds.has(sessionId)) {
      console.log('[Compaction] ⚠️ Already compacting, skipping');
      return;
    }

    // Guard: Don't compact sessions with no messages or very few messages
    const messageCount = session?.messages?.length || 0;
    if (messageCount < 3) {
      console.log(`[Compaction] ⚠️ Skipping auto-compact flag - session has too few messages (${messageCount})`);
      await invoke('reset_compaction_flags', { sessionId });
      return;
    }

    // Guard: Don't compact if token tracking shows low usage (prevents spurious triggers)
    const tokenTotal = session?.analytics?.tokens?.total || 0;
    if (tokenTotal < 50000) { // Less than 25% of 200k
      console.log(`[Compaction] ⚠️ Skipping auto-compact flag - token count too low (${tokenTotal})`);
      await invoke('reset_compaction_flags', { sessionId });
      return;
    }

    // Set the pending flag - compaction will happen when user sends next message
    console.log('[Compaction] 🚩 Setting pendingAutoCompact flag - will compact on next user message');
    store.updateCompactionState(sessionId, { pendingAutoCompact: true });

    // Reset backend flags
    await invoke('reset_compaction_flags', { sessionId });
  }

  /**
   * Execute the actual compaction (called from sendMessage when pending)
   */
  async executeAutoCompaction(sessionId: string, pendingUserMessage: string): Promise<void> {
    console.log('[Compaction] 🔄 executeAutoCompaction called for session:', sessionId);

    // Check if auto-compact is enabled
    const store = useClaudeCodeStore.getState();
    if (store.autoCompactEnabled === false) {
      console.log('[Compaction] ⚠️ Auto-compact disabled, clearing pending flag and skipping');
      store.updateCompactionState(sessionId, { pendingAutoCompact: false });
      return;
    }

    // Prevent multiple compactions
    if (this.compactingSessionIds.has(sessionId)) {
      console.log('[Compaction] ⚠️ Already compacting, skipping');
      return;
    }

    // Rate limiting - don't compact more than once per minute
    const lastTime = this.lastCompactionTime[sessionId] || 0;
    const timeSinceLastCompact = Date.now() - lastTime;
    if (timeSinceLastCompact < 60000) {
      console.log(`[Compaction] ⏱️ Rate limited (${timeSinceLastCompact}ms since last), skipping compact`);
      return;
    }

    console.log('[Compaction] ✅ Proceeding with auto-compact');
    this.compactingSessionIds.add(sessionId);
    this.lastCompactionTime[sessionId] = Date.now();

    // Save the user's pending message for send after compact completes
    setAutoCompactMessage(sessionId, pendingUserMessage);
    console.log('[Compaction] 💾 Saved pending user message for send after compact');

    // Update compaction state - include the pending message for UI visibility
    console.log('[Compaction] 📝 Setting compacting state');
    store.setCompacting(sessionId, true);
    store.updateCompactionState(sessionId, {
      pendingAutoCompact: false,
      pendingAutoCompactMessage: pendingUserMessage // Store for UI display
    });

    try {
      // Generate and save context manifest before compaction
      if (this.config.generateManifest) {
        console.log('[Compaction] 📋 Generating context manifest');
        await this.generateAndSaveManifest(sessionId);
        store.updateCompactionState(sessionId, { manifestSaved: true });
      }

      // Send /compact command
      console.log('[Compaction] 🚀 Sending /compact command to Claude');
      await store.sendMessage('/compact', false);

      // Reset backend flags so compaction can trigger again later
      console.log('[Compaction] 🔄 Resetting backend compaction flags');
      await invoke('reset_compaction_flags', { sessionId });

      console.log('[Compaction] ✅ Auto-compact triggered successfully');
      // The compact result handler will send the pending user message
    } catch (error) {
      console.error('[Compaction] ❌ Auto-compact failed:', error);
      // Clear the pending message on failure from both stores
      import('./wrapperIntegration').then(({ clearAutoCompactMessage }) => {
        clearAutoCompactMessage(sessionId);
      });
      store.updateCompactionState(sessionId, { pendingAutoCompactMessage: undefined });
      // Only clear isCompacting on error - success case is handled by compact result handler
      store.setCompacting(sessionId, false);
    } finally {
      this.compactingSessionIds.delete(sessionId);
      // NOTE: Don't set isCompacting=false here - the compact result handler does that
      // after sending the followup message. Setting it here would kill the indicator prematurely.
      console.log('[Compaction] 🏁 Auto-compact command sent, waiting for result');
    }
  }

  /**
   * Force compaction at 65% - sets flag to compact on next user message
   * (Same as auto, but triggered at higher threshold)
   */
  async triggerForceCompaction(sessionId: string): Promise<void> {
    console.log('[Compaction] 🎯 triggerForceCompaction called for session:', sessionId);

    // Force uses same flag mechanism as auto - only compact when user submits a message
    // This prevents /compact from being sent when user isn't actively chatting
    await this.triggerAutoCompaction(sessionId);
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