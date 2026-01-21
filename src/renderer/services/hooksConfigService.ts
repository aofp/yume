/**
 * Advanced Hooks Configuration Service
 * Provides centralized configuration, state management, and logging for hooks
 */

import { appStorageKey } from '../config/app';
import { isWindows } from './platformUtils';

export interface HookAdvancedConfig {
  enabled: boolean;
  level?: 'strict' | 'moderate' | 'permissive';
  whitelist?: string[];
  blacklist?: string[];
  patterns?: Record<string, string[]>;
  thresholds?: Record<string, number>;
  metadata?: Record<string, unknown>;
}

export interface HookState {
  sessionId: string;
  decisions: HookDecision[];
  patterns: {
    blockedCommands: string[];
    allowedPaths: string[];
    protectedFiles: string[];
  };
  metrics: {
    blocksToday: number;
    modifications: number;
    contextUsage: number[];
    lastCompaction?: Date;
  };
}

export interface HookDecision {
  timestamp: string;
  hook: string;
  action: 'allow' | 'block' | 'modify' | 'warn';
  reason: string;
  context?: unknown;
  riskScore?: number;
}

class HooksConfigService {
  private static instance: HooksConfigService;
  private config: Record<string, HookAdvancedConfig> = {};
  private state!: HookState;
  private readonly STATE_KEY = appStorageKey('hooks_state', '_');
  private readonly CONFIG_KEY = appStorageKey('hooks_config', '_');

  private constructor() {
    this.loadConfig();
    this.loadState();
    this.initializeDefaults();
  }

  static getInstance(): HooksConfigService {
    if (!HooksConfigService.instance) {
      HooksConfigService.instance = new HooksConfigService();
    }
    return HooksConfigService.instance;
  }

  private initializeDefaults() {
    // Determine platform-appropriate default paths using centralized utility
    const onWindows = isWindows();

    // Default whitelist: current working directory (if available) or user's home
    const defaultWhitelist: string[] = [];

    // Default blacklist: system directories that should never be modified
    const defaultBlacklist = onWindows
      ? ['C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)']
      : ['/System', '/etc', '/usr', '/bin', '/sbin'];

    const defaults: Record<string, HookAdvancedConfig> = {
      tool_shield: {
        enabled: true,
        level: 'strict',
        whitelist: defaultWhitelist,
        blacklist: defaultBlacklist,
        patterns: {
          dangerous_commands: [
            'rm -rf /',
            'rm -rf ~',
            'dd if=',
            'mkfs',
            ':(){ :|:& };:',
            'chmod 777 /',
            'chown -R',
            '> /dev/sd',
            'curl .* | bash',
            'wget .* | sh'
          ],
          suspicious_patterns: [
            'sudo rm',
            'sudo chmod',
            'sudo chown',
            'eval(',
            'exec(',
            'base64 -d',
            'nc -l'
          ],
          protected_files: [
            '.env',
            '.env.local',
            '.env.production',
            'secrets',
            'credentials',
            'private_key',
            'id_rsa',
            'passwd',
            'shadow'
          ]
        }
      },
      context_guard: {
        enabled: true,
        level: 'moderate',
        thresholds: {
          notice: 70,
          warning: 80,
          critical: 88,
          auto_compact: 85,
          force_compact: 90
        },
        metadata: {
          prediction_enabled: true,
          lookahead_minutes: 5
        }
      },
      discussion_enforcer: {
        enabled: false,
        level: 'strict',
        whitelist: ['Read', 'Grep', 'LS', 'Glob', 'WebSearch'],
        blacklist: ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'],
        metadata: {
          mode: 'DAIC', // Discussion, Approval, Implementation, Completion
          require_approval: true,
          auto_approve_after: 30 // seconds
        }
      },
      prompt_enhancer: {
        enabled: true,
        level: 'moderate',
        metadata: {
          inject_context: true,
          add_conventions: true,
          include_history: true,
          max_context_lines: 50
        }
      },
      response_analyzer: {
        enabled: true,
        level: 'moderate',
        patterns: {
          error_patterns: ['error', 'exception', 'failed', 'undefined', 'null'],
          warning_patterns: ['todo', 'fixme', 'hack', 'bug', 'deprecated'],
          security_patterns: ['api_key', 'password', 'secret', 'token', 'credential']
        },
        thresholds: {
          max_response_length: 10000,
          max_code_blocks: 20
        }
      }
    };

    // Merge with existing config
    for (const [key, value] of Object.entries(defaults)) {
      if (!this.config[key]) {
        this.config[key] = value;
      } else {
        // Deep merge
        this.config[key] = { ...value, ...this.config[key] };
      }
    }

    this.saveConfig();
  }

  private loadConfig() {
    const saved = localStorage.getItem(this.CONFIG_KEY);
    if (saved) {
      try {
        this.config = JSON.parse(saved);
      } catch (e) {
        logger.error('Failed to load hooks config:', e);
        this.config = {};
      }
    }
  }

  private saveConfig() {
    localStorage.setItem(this.CONFIG_KEY, JSON.stringify(this.config));
  }

  private loadState() {
    const saved = localStorage.getItem(this.STATE_KEY);
    if (saved) {
      try {
        this.state = JSON.parse(saved);
      } catch (e) {
        logger.error('Failed to load hooks state:', e);
        this.initializeState();
      }
    } else {
      this.initializeState();
    }
  }

  private initializeState() {
    this.state = {
      sessionId: '',
      decisions: [],
      patterns: {
        blockedCommands: [],
        allowedPaths: [],
        protectedFiles: []
      },
      metrics: {
        blocksToday: 0,
        modifications: 0,
        contextUsage: []
      }
    };
  }

  saveState() {
    localStorage.setItem(this.STATE_KEY, JSON.stringify(this.state));
  }

  // Public API
  getConfig(hookName: string): HookAdvancedConfig | undefined {
    return this.config[hookName];
  }

  updateConfig(hookName: string, config: Partial<HookAdvancedConfig>) {
    if (!this.config[hookName]) {
      this.config[hookName] = { enabled: false };
    }
    this.config[hookName] = { ...this.config[hookName], ...config };
    this.saveConfig();
  }

  getState(): HookState {
    return this.state;
  }

  addDecision(decision: HookDecision) {
    this.state.decisions.push(decision);
    
    // Keep only last 1000 decisions
    if (this.state.decisions.length > 1000) {
      this.state.decisions = this.state.decisions.slice(-1000);
    }

    // Update metrics
    if (decision.action === 'block') {
      this.state.metrics.blocksToday++;
    } else if (decision.action === 'modify') {
      this.state.metrics.modifications++;
    }

    this.saveState();
  }

  updateContextUsage(usage: number) {
    this.state.metrics.contextUsage.push(usage);
    
    // Keep only last 100 measurements
    if (this.state.metrics.contextUsage.length > 100) {
      this.state.metrics.contextUsage = this.state.metrics.contextUsage.slice(-100);
    }

    this.saveState();
  }

  // Risk scoring system
  calculateRiskScore(hookName: string, context: { command?: string; path?: string }): number {
    let score = 0;
    const config = this.getConfig(hookName);
    
    if (!config) return 0;

    // Check blacklist patterns
    if (config.blacklist) {
      for (const pattern of config.blacklist) {
        if (context.command?.includes(pattern) || context.path?.includes(pattern)) {
          score += 30;
        }
      }
    }

    // Check dangerous patterns
    if (config.patterns?.dangerous_commands) {
      for (const pattern of config.patterns.dangerous_commands) {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(context.command || '') || regex.test(context.path || '')) {
          score += 50;
        }
      }
    }

    // Check suspicious patterns
    if (config.patterns?.suspicious_patterns) {
      for (const pattern of config.patterns.suspicious_patterns) {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(context.command || '') || regex.test(context.path || '')) {
          score += 20;
        }
      }
    }

    // Check protected files
    if (config.patterns?.protected_files) {
      for (const file of config.patterns.protected_files) {
        if (context.path?.toLowerCase().includes(file.toLowerCase())) {
          score += 40;
        }
      }
    }

    // Time-based risk (after hours)
    const hour = new Date().getHours();
    if (hour < 8 || hour > 20) {
      score += 10; // Higher risk outside business hours
    }

    // Frequency-based risk
    const recentBlocks = this.state.decisions
      .filter(d => d.action === 'block')
      .filter(d => new Date(d.timestamp).getTime() > Date.now() - 3600000) // Last hour
      .length;
    
    if (recentBlocks > 5) {
      score += 20; // Pattern of suspicious activity
    }

    return Math.min(100, score);
  }

  // Pattern learning
  learnPattern(pattern: string, type: 'blocked' | 'allowed' | 'protected') {
    switch (type) {
      case 'blocked':
        if (!this.state.patterns.blockedCommands.includes(pattern)) {
          this.state.patterns.blockedCommands.push(pattern);
        }
        break;
      case 'allowed':
        if (!this.state.patterns.allowedPaths.includes(pattern)) {
          this.state.patterns.allowedPaths.push(pattern);
        }
        break;
      case 'protected':
        if (!this.state.patterns.protectedFiles.includes(pattern)) {
          this.state.patterns.protectedFiles.push(pattern);
        }
        break;
    }
    this.saveState();
  }

  // Context prediction
  predictContextOverflow(): { willOverflow: boolean; timeRemaining: number } {
    const usage = this.state.metrics.contextUsage;
    if (usage.length < 2) {
      return { willOverflow: false, timeRemaining: Infinity };
    }

    // Calculate growth rate (simple linear regression)
    const recentUsage = usage.slice(-10);
    const growthRate = (recentUsage[recentUsage.length - 1] - recentUsage[0]) / recentUsage.length;
    
    const currentUsage = usage[usage.length - 1];
    const threshold = this.config.context_guard?.thresholds?.auto_compact || 85;
    
    if (growthRate <= 0) {
      return { willOverflow: false, timeRemaining: Infinity };
    }

    const remainingCapacity = threshold - currentUsage;
    const timeToOverflow = remainingCapacity / growthRate;

    return {
      willOverflow: timeToOverflow < 10, // Less than 10 interactions
      timeRemaining: timeToOverflow
    };
  }

  // Export/Import configuration
  exportConfig(): string {
    return JSON.stringify({
      config: this.config,
      state: this.state,
      version: '1.0.0',
      timestamp: new Date().toISOString()
    }, null, 2);
  }

  importConfig(data: string): boolean {
    try {
      const imported = JSON.parse(data);
      if (imported.config) {
        this.config = imported.config;
        this.saveConfig();
      }
      if (imported.state) {
        this.state = imported.state;
        this.saveState();
      }
      return true;
    } catch (e) {
      logger.error('Failed to import config:', e);
      return false;
    }
  }

  // Reset functions
  resetConfig() {
    this.config = {};
    this.initializeDefaults();
  }

  resetState() {
    this.initializeState();
    this.saveState();
  }

  resetMetrics() {
    this.state.metrics = {
      blocksToday: 0,
      modifications: 0,
      contextUsage: []
    };
    this.saveState();
  }
}

export const hooksConfigService = HooksConfigService.getInstance();
