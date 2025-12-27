import { invoke } from '@tauri-apps/api/core';

export interface HookScriptConfig {
  event: string;
  enabled: boolean;
  script: string;
  name?: string;
}

export interface HookResponse {
  action: 'continue' | 'block' | 'modify';
  message?: string;
  modifications?: Record<string, unknown>;
  exit_code: number;
}

export class HooksService {
  private static instance: HooksService;
  private hooks: Map<string, HookScriptConfig> = new Map();

  private constructor() {
    this.loadHooks();
  }

  static getInstance(): HooksService {
    if (!HooksService.instance) {
      HooksService.instance = new HooksService();
    }
    return HooksService.instance;
  }

  /**
   * Load hooks from localStorage
   */
  private loadHooks() {
    const hookEvents = [
      'user_prompt_submit',
      'pre_tool_use',
      'post_tool_use',
      'assistant_response',
      'session_start',
      'session_end',
      'context_warning',
      'error'
    ];

    hookEvents.forEach(event => {
      const enabled = localStorage.getItem(`hook_${event}_enabled`) === 'true';
      const script = localStorage.getItem(`hook_${event}`) || '';
      const name = localStorage.getItem(`hook_${event}_name`) || this.getDefaultName(event);
      
      this.hooks.set(event, {
        event,
        enabled,
        script,
        name
      });
    });
  }

  /**
   * Get default hook name for an event
   */
  private getDefaultName(event: string): string {
    const names: Record<string, string> = {
      'user_prompt_submit': 'Prompt Enhancer',
      'pre_tool_use': 'Shield',
      'post_tool_use': 'Post Processor',
      'assistant_response': 'Response Analyzer',
      'session_start': 'Session Init',
      'session_end': 'Session Cleanup',
      'context_warning': 'Context Guard',
      'error': 'Error Handler'
    };
    return names[event] || 'Hook';
  }

  /**
   * Save a hook configuration
   */
  saveHook(event: string, config: Partial<HookScriptConfig>) {
    const existing = this.hooks.get(event) || { event, enabled: false, script: '' };
    const updated = { ...existing, ...config };
    
    this.hooks.set(event, updated);
    
    // Save to localStorage
    if (config.enabled !== undefined) {
      localStorage.setItem(`hook_${event}_enabled`, config.enabled ? 'true' : 'false');
    }
    if (config.script !== undefined) {
      localStorage.setItem(`hook_${event}`, config.script);
    }
    if (config.name !== undefined) {
      localStorage.setItem(`hook_${event}_name`, config.name);
    }
  }

  /**
   * Get a hook configuration
   */
  getHook(event: string): HookScriptConfig | undefined {
    return this.hooks.get(event);
  }

  /**
   * Get all hooks
   */
  getAllHooks(): HookScriptConfig[] {
    return Array.from(this.hooks.values());
  }

  /**
   * Execute a hook
   */
  async executeHook(
    event: string,
    data: Record<string, unknown>,
    sessionId: string
  ): Promise<HookResponse | null> {
    const hook = this.hooks.get(event);
    
    if (!hook || !hook.enabled || !hook.script) {
      return null;
    }

    try {
      const response = await invoke<HookResponse>('execute_hook', {
        event,
        script: hook.script,
        data,
        sessionId,
        timeoutMs: 5000
      });

      if (response.message) {
        console.log(`[Hook] ${response.message}`);
      }

      return response;
    } catch (error) {
      console.error(`Hook failed: ${event}`, error);
      return null;
    }
  }

  /**
   * Test a hook script
   */
  async testHook(event: string, script: string): Promise<string> {
    try {
      return await invoke<string>('test_hook', {
        script,
        event
      });
    } catch (error) {
      throw new Error(`Hook test failed: ${error}`);
    }
  }

  /**
   * Get available hook events
   */
  async getHookEvents(): Promise<string[]> {
    try {
      return await invoke<string[]>('get_hook_events');
    } catch (error) {
      console.error('Failed to get hook events:', error);
      return [
        'user_prompt_submit',
        'pre_tool_use',
        'post_tool_use',
        'assistant_response',
        'session_start',
        'session_end',
        'context_warning',
        'compaction_trigger',
        'error'
      ];
    }
  }

  /**
   * Get sample hook scripts
   */
  async getSampleHooks(): Promise<Array<{ name: string; event: string; script: string }>> {
    try {
      const samples = await invoke<Array<[string, string, string]>>('get_sample_hooks');
      return samples.map(([name, event, script]) => ({ name, event, script }));
    } catch (error) {
      console.error('Failed to get sample hooks:', error);
      return [];
    }
  }

  /**
   * Import a sample hook
   */
  importSampleHook(sample: { name: string; event: string; script: string }) {
    this.saveHook(sample.event, {
      script: sample.script,
      name: sample.name,
      enabled: false // Don't auto-enable imported hooks
    });
  }

  /**
   * Process a message through hooks (for integration with Claude)
   */
  async processUserPrompt(prompt: string, sessionId: string): Promise<string> {
    const response = await this.executeHook('user_prompt_submit', { prompt }, sessionId);
    
    if (response?.action === 'block') {
      throw new Error(response.message || 'Hook blocked the prompt');
    }
    
    if (response?.action === 'modify' && response.modifications?.prompt) {
      return response.modifications.prompt as string;
    }
    
    return prompt;
  }

  /**
   * Process a tool use through hooks
   */
  async processToolUse(
    tool: string,
    input: Record<string, unknown>,
    sessionId: string,
    phase: 'pre' | 'post' = 'pre'
  ): Promise<{ allowed: boolean; message?: string; modifiedInput?: Record<string, unknown> }> {
    const event = phase === 'pre' ? 'pre_tool_use' : 'post_tool_use';
    const response = await this.executeHook(event, { tool, input }, sessionId);
    
    if (response?.action === 'block') {
      return {
        allowed: false,
        message: response.message || `Hook blocked ${tool} execution`
      };
    }
    
    if (response?.action === 'modify' && response.modifications) {
      return {
        allowed: true,
        modifiedInput: (response.modifications.input as Record<string, unknown>) || input
      };
    }
    
    return { allowed: true };
  }

  /**
   * Process context warning
   */
  async processContextWarning(
    usagePercentage: number, 
    tokensUsed: number, 
    tokensMax: number,
    sessionId: string
  ): Promise<void> {
    const response = await this.executeHook('context_warning', {
      usage_percentage: usagePercentage,
      tokens_used: tokensUsed,
      tokens_max: tokensMax
    }, sessionId);
    
    if (response?.action === 'block') {
      const message = response.message || `Context at ${usagePercentage}%. Use /compact`;
      console.warn(`[Context] ${message}`);
    }
  }
}

// Export singleton instance
export const hooksService = HooksService.getInstance();