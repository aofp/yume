/**
 * Zustand store specifically for Claude Code SDK integration
 * Handles sessions, streaming messages, and all SDK features
 */

import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import { claudeCodeClient } from '../services/claudeCodeClient';
import { systemPromptService } from '../services/systemPromptService';
import { isBashPrefix } from '../utils/helpers';
import { loadEnabledTools, DEFAULT_ENABLED_TOOLS, ALL_TOOLS } from '../config/tools';

// Fast message hash for deduplication - much faster than JSON.stringify comparison
// Uses message id + type + content signature
function getMessageHash(message: any): string {
  if (message.id) return `id:${message.id}`;

  const type = message.type || '';
  const content = message.message;

  // For simple string content, use it directly
  if (typeof content === 'string') {
    return `${type}:${content.length}:${content.slice(0, 100)}`;
  }

  // For object content, create a signature from key fields
  if (content && typeof content === 'object') {
    const contentStr = content.content;
    if (typeof contentStr === 'string') {
      return `${type}:${contentStr.length}:${contentStr.slice(0, 100)}`;
    }
    if (Array.isArray(content.content)) {
      // For array content (thinking blocks etc), hash first item
      const first = content.content[0];
      const sig = first?.type || first?.text?.slice(0, 50) || '';
      return `${type}:arr:${content.content.length}:${sig}`;
    }
  }

  // Fallback to type + timestamp for unique signature
  return `${type}:${message.timestamp || Date.now()}`;
}

// Cache for message hashes to avoid recomputing
const messageHashCache = new WeakMap<any, string>();
function getCachedHash(message: any): string {
  let hash = messageHashCache.get(message);
  if (!hash) {
    hash = getMessageHash(message);
    messageHashCache.set(message, hash);
  }
  return hash;
}

// Debounced storage to prevent UI freezes when toggling settings
// Writes are batched and done asynchronously after 100ms of inactivity
const createDebouncedStorage = (): StateStorage => {
  let writeTimeout: ReturnType<typeof setTimeout> | null = null;
  let pendingValue: string | null = null;
  let pendingKey: string | null = null;

  // Flush pending writes immediately (prevents data loss on app close)
  const flushPending = () => {
    if (writeTimeout) {
      clearTimeout(writeTimeout);
      writeTimeout = null;
    }
    if (pendingKey && pendingValue !== null) {
      try {
        localStorage.setItem(pendingKey, pendingValue);
      } catch (e) {
        console.error('[DebouncedStorage] Failed to flush:', e);
      }
      pendingKey = null;
      pendingValue = null;
    }
  };

  // Register beforeunload to flush pending writes before app closes
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', flushPending);
  }

  return {
    getItem: (name: string): string | null => {
      return localStorage.getItem(name);
    },
    setItem: (name: string, value: string): void => {
      pendingKey = name;
      pendingValue = value;

      if (writeTimeout) {
        clearTimeout(writeTimeout);
      }

      // Debounce writes by 100ms and do them async
      writeTimeout = setTimeout(() => {
        if (pendingKey && pendingValue !== null) {
          localStorage.setItem(pendingKey, pendingValue);
        }
        writeTimeout = null;
        pendingKey = null;
        pendingValue = null;
      }, 100);
    },
    removeItem: (name: string): void => {
      flushPending(); // Flush before removing
      localStorage.removeItem(name);
    },
  };
};
// tauriClaudeClient is kept but not currently used (Socket.IO handles everything)
import { useLicenseStore } from '../services/licenseManager';
import { DEFAULT_MODEL_ID, MODEL_ID_MAP, resolveModelId, getModelByFamily } from '../config/models';

// Always use Socket.IO client since server handles everything
const claudeClient = claudeCodeClient;

// Configuration for pending session timeout
// When a session is in 'pending' status, we wait for it to become 'active' before sending messages.
// This happens when a temporary session is being replaced with a real Claude session.
const PENDING_SESSION_TIMEOUT_MS = 5000;
const PENDING_SESSION_CHECK_INTERVAL_MS = 100;

// Maximum number of restore points per session to prevent unbounded memory growth
// Each restore point contains file snapshots with full file content
const MAX_RESTORE_POINTS_PER_SESSION = 50;

// Fetch session tokens from session file - single source of truth
// Called after stream_end to get accurate token counts
async function fetchSessionTokensFromFile(
  sessionId: string,
  claudeSessionId: string | undefined,
  workingDirectory: string | undefined
): Promise<{
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
  total_context: number;
  context_percentage: number;
} | null> {
  try {
    if (!claudeSessionId || !workingDirectory) {
      console.log('[SESSION-TOKENS] Missing claudeSessionId or workingDirectory, skipping fetch');
      return null;
    }

    const serverPort = claudeCodeClient.getServerPort();
    if (!serverPort) {
      console.log('[SESSION-TOKENS] No server port, skipping fetch');
      return null;
    }

    const url = `http://localhost:${serverPort}/session-tokens/${encodeURIComponent(claudeSessionId)}?workingDirectory=${encodeURIComponent(workingDirectory)}`;
    console.log('[SESSION-TOKENS] Fetching from:', url);

    const response = await fetch(url);
    if (!response.ok) {
      console.log('[SESSION-TOKENS] Fetch failed:', response.status);
      return null;
    }

    const data = await response.json();
    if (!data.found || !data.usage) {
      console.log('[SESSION-TOKENS] No usage data in response');
      return null;
    }

    console.log('[SESSION-TOKENS] Got tokens from session file:', data.usage);
    return data.usage;
  } catch (error) {
    console.error('[SESSION-TOKENS] Error fetching session tokens:', error);
    return null;
  }
}

export type SDKMessage = any; // Type from Claude Code SDK

// Agent structure
export interface Agent {
  id: string;
  name: string;
  icon: string;
  model: 'opus' | 'sonnet' | 'haiku';
  default_task: string;
  system_prompt: string;
  created_at: number;
  updated_at: number;
}

export interface FileSnapshot {
  path: string;
  content: string;
  operation: 'edit' | 'write' | 'create' | 'delete' | 'multiedit';
  timestamp: number;
  messageIndex: number;
  oldContent?: string; // For diffs (snippet only)
  originalContent?: string | null; // Full file content before edit (null = new file)
  isNewFile?: boolean; // True if file didn't exist before this operation
  mtime?: number; // File modification time when snapshot was taken (for conflict detection)
  sessionId?: string; // Session that made this edit (for cross-session conflict detection)
}

export interface RestorePoint {
  messageIndex: number;
  timestamp: number;
  fileSnapshots: FileSnapshot[];
  description: string; // e.g., "edited 3 files", "created new file"
}

export interface SessionAnalytics {
  // Message counts - matches Claude Code
  totalMessages: number;
  userMessages: number;
  assistantMessages: number;
  toolUses: number;
  systemMessages?: number;
  
  // Token tracking - matches Claude Code exactly
  tokens: {
    input: number;
    output: number;
    total: number;
    cacheSize?: number; // Size of cached context
    cacheCreation?: number; // Tokens used to create cache
    cacheRead?: number; // Tokens read from cache
    conversationTokens?: number; // Active conversation context
    systemTokens?: number; // System prompt tokens
    average?: number; // Average tokens per message
    byModel: {
      opus: { input: number; output: number; total: number; };
      sonnet: { input: number; output: number; total: number; };
    };
    breakdown?: {
      user: number; // Total user tokens
      assistant: number; // Total assistant tokens
    };
  };
  
  // Cost tracking
  cost?: {
    total: number;
    byModel: {
      opus: number;
      sonnet: number;
    };
  };
  
  // Performance metrics
  duration: number; // Total session duration in ms
  lastActivity: Date;
  thinkingTime: number; // Total thinking time in seconds
  responseTime?: number; // Average response time in ms
  
  // Rate limiting info
  rateLimit?: {
    requestsPerMinute?: number;
    tokensPerMinute?: number;
    requestsPerDay?: number;
  };
  
  // Context window usage - like Claude Code
  contextWindow?: {
    used: number; // Tokens used
    limit: number; // Max tokens (200000)
    percentage: number; // Usage percentage
    remaining: number; // Tokens remaining
  };
  
  // Additional metadata
  model?: string; // Current model being used
  temperature?: number; // Temperature setting
  maxTokens?: number; // Max tokens setting
  stopReason?: string; // Last stop reason

  // Compaction tracking
  compactPending?: boolean; // Flag set after /compact to reset tokens on next message
}

export interface Session {
  id: string;
  name: string;
  status: 'pending' | 'active' | 'paused' | 'completed' | 'error';
  messages: SDKMessage[];
  workingDirectory?: string;
  createdAt: Date;
  updatedAt: Date;
  claudeSessionId?: string; // Track the Claude SDK session ID
  claudeTitle?: string; // Title generated by Claude for the task
  userRenamed?: boolean; // Track if user manually renamed the tab (skip auto title)
  originalTabNumber?: number; // Track the original tab number for restoring after clear
  analytics?: SessionAnalytics; // Per-session analytics
  draftInput?: string; // Store draft input text
  draftAttachments?: any[]; // Store draft attachments
  streaming?: boolean; // Track if this session is currently streaming
  restorePoints?: RestorePoint[]; // Track file changes at each message
  modifiedFiles?: Set<string>; // Track all files touched in this session
  runningBash?: boolean; // Track if bash command is currently running
  userBashRunning?: boolean; // Track if user's bash command ($) is running
  bashProcessId?: string; // Current bash process ID for cancellation
  watermarkImage?: string; // Base64 or URL for watermark image
  pendingToolIds?: Set<string>; // Track pending tool operations by ID
  thinkingStartTime?: number; // Track when thinking started for this session
  lastMessageTime?: number; // Track last message received time (for streaming state protection)
  readOnly?: boolean; // Mark sessions loaded from projects as read-only
  initialized?: boolean; // Track if session has received first message from Claude (safe to interrupt)
  wasCompacted?: boolean; // Track if session was compacted to prevent old ID restoration
  messageUpdateCounter?: number; // Counter to force React re-render on message updates
  compactionState?: { // Track compaction state
    isCompacting?: boolean;
    lastCompacted?: Date;
    manifestSaved?: boolean;
    autoTriggered?: boolean;
    pendingAutoCompact?: boolean; // Flag: needs compaction on next user message
    pendingAutoCompactMessage?: string; // User message queued to send after compaction
  };
  cleanup?: () => void; // Cleanup function for event listeners
  lastAssistantMessageIds?: string[]; // Track last assistant message IDs for virtualization
  todos?: { content: string; status: 'pending' | 'in_progress' | 'completed'; activeForm?: string }[]; // Track current todo list
}

interface ClaudeCodeStore {
  // Sessions
  sessions: Session[];
  currentSessionId: string | null;
  persistedSessionId: string | null; // Track the sessionId for persistence
  sessionMappings: Record<string, any>; // Map yurucode sessionIds to Claude sessionIds
  
  // Model
  selectedModel: string;
  enabledTools: string[]; // Tools enabled for CLI sessions
  
  // Context tracking
  claudeMdTokens: number; // Token count for CLAUDE.md file
  
  // Watermark
  globalWatermarkImage: string | null; // Global watermark for all sessions
  
  // Font customization
  monoFont: string; // Monospace font for code
  sansFont: string; // Sans-serif font for UI
  
  // Tab persistence
  rememberTabs: boolean; // Whether to remember open tabs
  savedTabs: string[]; // Array of project paths to restore
  
  // Title generation
  autoGenerateTitle: boolean; // Whether to auto-generate titles for new sessions

  // Auto-compact
  autoCompactEnabled: boolean; // Whether to auto-compact at 60% threshold

  // Menu visibility
  showProjectsMenu: boolean; // Whether to show projects button in menu
  showAgentsMenu: boolean; // Whether to show agents button in menu
  showAnalyticsMenu: boolean; // Whether to show analytics button in menu
  showCommandsSettings: boolean; // Whether to show commands tab in settings
  showMcpSettings: boolean; // Whether to show mcp tab in settings
  showHooksSettings: boolean; // Whether to show hooks tab in settings
  showPluginsSettings: boolean; // Whether to show plugins tab in settings

  // UI state
  isDraggingTab: boolean; // Whether a tab is currently being dragged
  
  // Agents
  agents: Agent[]; // List of available agents
  currentAgentId: string | null; // Currently selected agent for new sessions
  
  // Streaming (deprecated - now per-session)
  streamingMessage: string;
  
  // Session management
  isLoadingHistory: boolean;
  availableSessions: any[]; // List of available persisted sessions
  
  // Actions
  setSelectedModel: (modelId: string) => void;
  setEnabledTools: (tools: string[]) => void;
  createSession: (name?: string, directory?: string, existingSessionId?: string) => Promise<string>;
  setCurrentSession: (sessionId: string) => void;
  sendMessage: (content: string, bashMode?: boolean) => Promise<void>;
  resumeSession: (sessionId: string) => Promise<void>;
  reconnectSession: (sessionId: string, claudeSessionId: string) => void;
  pauseSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;
  deleteAllSessions: () => void;
  reorderSessions: (fromIndex: number, toIndex: number) => void;
  renameSession: (sessionId: string, newTitle: string) => void;
  forkSession: (sessionId: string) => Promise<string | undefined>;
  interruptSession: (sessionId?: string) => Promise<void>;
  clearContext: (sessionId: string) => void;
  updateSessionDraft: (sessionId: string, input: string, attachments: any[]) => void;
  restoreToMessage: (sessionId: string, messageIndex: number) => void;
  addMessageToSession: (sessionId: string, message: SDKMessage) => void;
  setSessionStreaming: (sessionId: string, streaming: boolean) => void;
  updateSessionAnalyticsFromFile: (sessionId: string, tokens: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens: number;
    cache_creation_input_tokens: number;
    total_context: number;
    context_percentage: number;
  }) => void;
  updateCompactionState: (sessionId: string, compactionState: Partial<Session['compactionState']>) => void;
  setCompacting: (sessionId: string, isCompacting: boolean) => void;
  
  // Session persistence
  loadSessionHistory: (sessionId: string) => Promise<void>;
  listAvailableSessions: () => Promise<void>;
  loadPersistedSession: (sessionId: string) => Promise<void>;
  updateSessionMapping: (sessionId: string, claudeSessionId: string, metadata?: any) => void;
  loadSessionMappings: () => void;
  saveSessionMappings: () => void;
  handleDeferredSpawn: (tempSessionId: string, realSessionId: string) => void;
  
  // Model management
  toggleModel: () => void;
  
  // MCP & Tools
  configureMcpServers: (servers: any) => Promise<void>;
  setPermissionMode: (mode: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan') => void;
  updateAllowedTools: (tools: string[]) => void;
  
  // Watermark
  setGlobalWatermark: (image: string | null) => void;
  
  // Context
  calculateClaudeMdTokens: () => Promise<void>;
  
  // Font customization
  setMonoFont: (font: string) => void;
  setSansFont: (font: string) => void;
  
  // Background transparency
  backgroundOpacity: number;
  setBackgroundOpacity: (opacity: number) => void;
  
  // Tab persistence
  setRememberTabs: (remember: boolean) => void;
  saveTabs: () => void;
  restoreTabs: () => Promise<void>;
  
  // Title generation
  setAutoGenerateTitle: (autoGenerate: boolean) => void;

  // Auto-compact
  setAutoCompactEnabled: (enabled: boolean) => void;

  // Menu visibility
  setShowProjectsMenu: (show: boolean) => void;
  setShowAgentsMenu: (show: boolean) => void;
  setShowAnalyticsMenu: (show: boolean) => void;
  setShowCommandsSettings: (show: boolean) => void;
  setShowMcpSettings: (show: boolean) => void;
  setShowHooksSettings: (show: boolean) => void;
  setShowPluginsSettings: (show: boolean) => void;

  // UI state
  setIsDraggingTab: (isDragging: boolean) => void;
  
  // Agent management
  addAgent: (agent: Agent) => void;
  updateAgent: (agent: Agent) => void;
  deleteAgent: (agentId: string) => void;
  selectAgent: (agentId: string | null) => void;
  importAgents: (agents: Agent[]) => void;
  exportAgents: () => Agent[];
}

// Helper function to track file changes from tool operations
const trackFileChange = (session: Session, message: any, messageIndex: number): RestorePoint | null => {
  if (!message || message.type !== 'assistant') return null;
  
  const content = message.message?.content;
  if (!content || !Array.isArray(content)) return null;
  
  const fileSnapshots: FileSnapshot[] = [];
  const modifiedFiles = new Set(session.modifiedFiles || []);
  
  // Look for tool_use blocks in the content
  content.forEach((block: any) => {
    if (block.type === 'tool_use') {
      const toolName = block.name;
      const input = block.input;
      
      if (!input) return;
      
      // Track file operations
      switch (toolName) {
        case 'Edit':
        case 'MultiEdit':
          if (input.file_path) {
            const snapshot: FileSnapshot = {
              path: input.file_path,
              content: input.new_string || '',
              oldContent: input.old_string || '',
              operation: toolName === 'MultiEdit' ? 'multiedit' : 'edit',
              timestamp: Date.now(),
              messageIndex
            };
            fileSnapshots.push(snapshot);
            modifiedFiles.add(input.file_path);
          }
          break;
          
        case 'Write':
          if (input.file_path) {
            const snapshot: FileSnapshot = {
              path: input.file_path,
              content: input.content || '',
              operation: 'write',
              timestamp: Date.now(),
              messageIndex
            };
            fileSnapshots.push(snapshot);
            modifiedFiles.add(input.file_path);
          }
          break;
      }
    }
  });
  
  if (fileSnapshots.length > 0) {
    // Create description
    const fileCount = fileSnapshots.length;
    const operations = fileSnapshots.map(s => s.operation);
    const uniqueOps = [...new Set(operations)];
    const description = uniqueOps.length === 1 
      ? `${uniqueOps[0]} ${fileCount} file${fileCount !== 1 ? 's' : ''}`
      : `modified ${fileCount} file${fileCount !== 1 ? 's' : ''}`;
    
    return {
      messageIndex,
      timestamp: Date.now(),
      fileSnapshots,
      description
    };
  }
  
  return null;
};

// Helper to persist sessions to localStorage
const persistSessions = (sessions: Session[]) => {
  try {
    // Store essential session data for recovery
    const sessionData = sessions.map(s => ({
      id: s.id,
      name: s.name,
      claudeTitle: s.claudeTitle,
      claudeSessionId: s.claudeSessionId,
      workingDirectory: s.workingDirectory,
      messages: s.messages, // Keep messages for context
      analytics: s.analytics,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      userRenamed: s.userRenamed,
      originalTabNumber: s.originalTabNumber, // Preserve original tab number for clear
      draftInput: s.draftInput, // Preserve draft input
      draftAttachments: s.draftAttachments, // Preserve draft attachments
      restorePoints: s.restorePoints,
      modifiedFiles: s.modifiedFiles ? Array.from(s.modifiedFiles) : [], // Convert Set to Array for storage
      wasCompacted: s.wasCompacted // Preserve compacted state
    }));
    localStorage.setItem('yurucode-sessions', JSON.stringify(sessionData));
    localStorage.setItem('yurucode-sessions-timestamp', Date.now().toString()); // Add timestamp for validation
    console.log('[Store] Persisted', sessions.length, 'sessions to localStorage with', 
      sessionData.reduce((acc, s) => acc + s.messages.length, 0), 'total messages');
  } catch (err) {
    console.error('[Store] Failed to persist sessions:', err);
  }
};

// Helper to restore sessions from localStorage
const restoreSessions = (): Session[] => {
  try {
    const stored = localStorage.getItem('yurucode-sessions');
    const timestamp = localStorage.getItem('yurucode-sessions-timestamp');
    
    if (stored) {
      // Check if sessions are stale (older than 24 hours)
      if (timestamp) {
        const age = Date.now() - parseInt(timestamp);
        if (age > 24 * 60 * 60 * 1000) {
          console.log('[Store] Sessions are older than 24 hours, clearing');
          localStorage.removeItem('yurucode-sessions');
          localStorage.removeItem('yurucode-sessions-timestamp');
          return [];
        }
      }
      
      const sessionData = JSON.parse(stored);
      const sessions = sessionData.map((s: any) => ({
        ...s,
        status: 'paused' as const, // Mark as paused until reconnected
        streaming: false,
        pendingToolIds: new Set(),
        modifiedFiles: new Set(s.modifiedFiles || []),
        createdAt: new Date(s.createdAt),
        updatedAt: new Date(s.updatedAt),
        // Preserve claudeSessionId for session resumption with --resume flag
        claudeSessionId: s.claudeSessionId, // KEEP this for --resume
        workingDirectory: s.workingDirectory,
        messages: s.messages || [],
        analytics: s.analytics || {
          totalMessages: 0,
          userMessages: 0,
          assistantMessages: 0,
          toolUses: 0,
          tokens: { 
            input: 0, 
            output: 0, 
            total: 0,
            byModel: {
              opus: { input: 0, output: 0, total: 0 },
              sonnet: { input: 0, output: 0, total: 0 }
            }
          },
          duration: 0,
          lastActivity: new Date(),
          thinkingTime: 0
        },
        claudeTitle: s.claudeTitle,
        userRenamed: s.userRenamed,
        originalTabNumber: s.originalTabNumber, // Restore original tab number for clear
        draftInput: s.draftInput,
        draftAttachments: s.draftAttachments,
        restorePoints: s.restorePoints || [],
        wasCompacted: s.wasCompacted, // Preserve compacted state
        // Mark that we need to reconnect this session
        needsReconnect: !!s.claudeSessionId
      }));
      
      console.log('[Store] Restored', sessions.length, 'sessions from localStorage with',
        sessions.reduce((acc: number, s: any) => acc + s.messages.length, 0), 'total messages');

      // Sessions with claudeSessionId will be reconnected from main.tsx after socket is ready
      sessions.forEach((s: any) => {
        if (s.claudeSessionId) {
          console.log(`[Store] Session ${s.id} has claudeSessionId ${s.claudeSessionId} - will reconnect with --resume`);
        } else {
          console.log(`[Store] Session ${s.id} has no claudeSessionId - will create fresh on first message`);
        }
      });
      
      return sessions;
    }
  } catch (err) {
    console.error('[Store] Failed to restore sessions:', err);
  }
  return [];
};

export const useClaudeCodeStore = create<ClaudeCodeStore>()(
  persist(
    (set, get) => ({
  sessions: [], // Don't restore sessions on startup - start fresh
  currentSessionId: null, // No current session on startup
  persistedSessionId: null,
  sessionMappings: {},
  selectedModel: DEFAULT_MODEL_ID, // Default to Sonnet 4.5 (see config/models.ts)
  enabledTools: loadEnabledTools(), // Load from localStorage or use defaults
  claudeMdTokens: 0, // Will be calculated on first use
  globalWatermarkImage: null,
  monoFont: 'Comic Mono', // Default monospace font
  sansFont: 'Comic Neue', // Default sans-serif font
  rememberTabs: false, // Default to not remembering tabs (disabled by default)
  savedTabs: [], // Empty array of saved tabs
  autoGenerateTitle: false, // Default to not auto-generating titles (disabled by default)
  autoCompactEnabled: true, // Default to enabled (auto-compact at 60%)
  showProjectsMenu: false, // Default to hidden
  showAgentsMenu: false, // Default to hidden
  showAnalyticsMenu: false, // Default to hidden
  showCommandsSettings: false, // Default to hidden
  showMcpSettings: false, // Default to hidden
  showHooksSettings: false, // Default to hidden
  showPluginsSettings: false, // Default to hidden
  isDraggingTab: false, // No tab is being dragged initially
  agents: [], // No agents initially, will load from localStorage
  currentAgentId: null, // No agent selected initially
  backgroundOpacity: 97, // Default to 97% opacity
  streamingMessage: '',
  isLoadingHistory: false,
  availableSessions: [],
  
  setSelectedModel: (modelId: string) => {
    set({ selectedModel: modelId });
    // Sync yurucode agents with new model
    const modelName = modelId.includes('opus') ? 'opus' : 'sonnet';
    systemPromptService.syncAgentsToFilesystem(modelName);
    console.log('Model changed to:', modelId);
  },

  setEnabledTools: (tools: string[]) => {
    set({ enabledTools: tools });
  },
  
  createSession: async (name?: string, directory?: string, existingSessionId?: string) => {
    console.log('[Store] createSession called:', { name, directory, existingSessionId });
    console.trace('[Store] Stack trace for createSession');

    try {
      // License check: Enforce tab limit for trial users
      const currentState = get();

      // Check if existingSessionId is a Claude session ID (26 chars, alphanumeric with _/-)
      // Claude session IDs: exactly 26 characters, used for --resume flag
      // Yurucode session IDs: variable format like 'session-xxx' or 'temp-xxx'
      const isClaudeSessionId = existingSessionId &&
        existingSessionId.length === 26 &&
        /^[a-zA-Z0-9_-]+$/.test(existingSessionId);

      // If it's a Claude session ID, we're doing a direct resume from .claude/projects
      const directResumeClaudeId = isClaudeSessionId ? existingSessionId : undefined;
      const actualExistingSessionId = isClaudeSessionId ? undefined : existingSessionId;

      const existingSession = actualExistingSessionId ?
        currentState.sessions.find(s => s.id === actualExistingSessionId) :
        null;
      
      const licenseStore = useLicenseStore.getState();
      const features = licenseStore.getFeatures();
      const maxTabs = features.maxTabs;
      
      // Only enforce for new sessions, not existing ones (direct resume counts as new)
      if (!existingSession && !directResumeClaudeId && currentState.sessions.length >= maxTabs) {
        console.log('[Store] Tab limit reached for trial mode:', maxTabs);
        // Dispatch event to show upgrade modal
        window.dispatchEvent(new CustomEvent('showUpgradeModal', {
          detail: { reason: 'tabLimit', currentTabs: currentState.sessions.length, maxTabs }
        }));
        return; // Don't create the session
      }
      
      // Generate more entropic session ID with timestamp and random components
      const timestamp = Date.now().toString(36);
      const random1 = Math.random().toString(36).substring(2, 8);
      const random2 = Math.random().toString(36).substring(2, 8);
      const hexId = `${timestamp}-${random1}-${random2}`;
      // ALWAYS use unique session name to prevent duplicate sessions
      const sessionName = `session-${hexId}`;
      // Use the provided directory, or get home directory from Tauri
      let workingDirectory = directory;
      
      if (!workingDirectory && window.__TAURI__) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          // Try to get home directory from Tauri
          workingDirectory = await invoke<string>('get_home_directory');
          console.log('[Store] Using home directory from Tauri:', workingDirectory);
        } catch (err) {
          console.error('[Store] Failed to get home directory:', err);
          // Platform-specific fallbacks
          const isWindows = navigator.platform.toLowerCase().includes('win');
          workingDirectory = isWindows ? 'C:\\Users\\' : '/Users';
        }
      } else if (!workingDirectory) {
        // Fallback for non-Tauri environments
        const isWindows = navigator.platform.toLowerCase().includes('win');
        workingDirectory = isWindows ? 'C:\\Users\\' : '/Users';
      }
      
      // STEP 1: Create tab immediately with pending status (or update existing)
      const tempSessionId = existingSessionId || `temp-${hexId}`;
      // Get the current number of sessions to determine tab number
      const tabNumber = existingSession ? 
        currentState.sessions.findIndex(s => s.id === existingSessionId) + 1 :
        (() => {
          // If no sessions exist, start fresh at tab 1
          if (currentState.sessions.length === 0) {
            return 1;
          }
          
          // Find the maximum tab number and add 1
          const tabNumbers = currentState.sessions
            .map(s => {
              const match = s.claudeTitle?.match(/^tab (\d+)$/);
              return match ? parseInt(match[1]) : 0;
            })
            .filter(n => n > 0);
          
          // If no numbered tabs exist (all renamed), start at 1
          return tabNumbers.length > 0 ? Math.max(...tabNumbers) + 1 : 1;
        })();
      
      const pendingSession: Session = existingSession || {
        id: tempSessionId,
        name: sessionName,
        status: 'pending' as const,
        messages: [],
        workingDirectory,
        createdAt: new Date(),
        updatedAt: new Date(),
        claudeTitle: `tab ${tabNumber}`, // Default title as 'tab x'
        originalTabNumber: tabNumber, // Store original tab number for restoring after clear
        pendingToolIds: new Set(),
        analytics: {
          totalMessages: 0,
          userMessages: 0,
          assistantMessages: 0,
          toolUses: 0,
          systemMessages: 0,
          tokens: { 
            input: 0, 
            output: 0, 
            total: 0,
            cacheSize: 0,
            cacheCreation: 0,
            cacheRead: 0,
            conversationTokens: 0,
            systemTokens: 0,
            average: 0,
            byModel: {
              opus: { input: 0, output: 0, total: 0 },
              sonnet: { input: 0, output: 0, total: 0 }
            },
            breakdown: { user: 0, assistant: 0 }
          },
          cost: { total: 0, byModel: { opus: 0, sonnet: 0 } },
          duration: 0,
          lastActivity: new Date(),
          thinkingTime: 0,
          responseTime: 0,
          contextWindow: {
            used: 0,
            limit: 200000,
            percentage: 0,
            remaining: 200000
          },
          model: get().selectedModel || DEFAULT_MODEL_ID
        }
      };

      // Add pending session to store immediately so tab appears (or update existing)
      console.log('[Store] Adding/updating session:', tempSessionId);
      if (existingSession) {
        // Update existing session to pending while reconnecting
        set(state => ({
          sessions: state.sessions.map(s => 
            s.id === existingSessionId ? { ...s, status: 'pending' as const } : s
          ),
          currentSessionId: existingSessionId
        }));
      } else {
        // Add new pending session
        set(state => ({
          sessions: [...state.sessions, pendingSession],
          currentSessionId: tempSessionId
        }));
      }
      
      // STEP 2: Initialize Claude SDK session in background
      try {
        // Get the selected model and resolve to full ID if needed
        const { selectedModel } = get();

        // Create or resume session using Claude Code Client
        // Pass claudeSessionId if:
        // 1. We're reconnecting an existing yurucode session (not compacted)
        // 2. OR we're doing a direct resume from .claude/projects
        const claudeSessionIdToResume = directResumeClaudeId ||
          (actualExistingSessionId && !existingSession?.wasCompacted
            ? existingSession?.claudeSessionId
            : undefined);

        if (actualExistingSessionId && existingSession?.wasCompacted) {
          console.log(`🗜️ [Store] Session ${actualExistingSessionId} was compacted - ignoring old Claude ID`);
        }

        if (directResumeClaudeId) {
          console.log(`📂 [Store] Direct resume from Claude session: ${directResumeClaudeId}`);
        }

        // Use enabled tools from store (user-configurable via Cmd+O modal)
        // Compute disallowed tools = ALL_TOOLS - enabledTools
        const enabledToolsList = get().enabledTools;
        const disabledToolsList = ALL_TOOLS
          .map(t => t.id)
          .filter(id => !enabledToolsList.includes(id));

        const result = await claudeClient.createSession(sessionName, workingDirectory, {
          disallowedTools: disabledToolsList.length > 0 ? disabledToolsList : undefined,
          permissionMode: 'default',
          maxTurns: 30,
          model: resolveModelId(selectedModel),
          sessionId: actualExistingSessionId || tempSessionId, // Pass the sessionId for consistency
          claudeSessionId: claudeSessionIdToResume, // Pass claudeSessionId for resuming
          messages: actualExistingSessionId ? (existingSession?.messages || []) : [] // Pass messages only if resuming yurucode session
        });
        
        const sessionId = result.sessionId || tempSessionId;
        const existingMessages = result.messages || [];
        // Store claudeSessionId from server response - server decides if this is a resume
        // The server returns claudeSessionId when resuming, undefined when starting fresh
        const claudeSessionId = result.claudeSessionId;
        
        console.log(`[Store] Session ${sessionId}:`);
        console.log(`  - Existing messages: ${existingMessages.length}`);
        console.log(`  - Working directory: ${result.workingDirectory || workingDirectory}`);
        console.log(`  - Claude session ID: ${claudeSessionId || 'none (new session)'}`);
        const existingResultsWithUsage = existingMessages.filter((m: any) => m.type === 'result' && m.usage);
        console.log(`  - Result messages with usage: ${existingResultsWithUsage.length}`);
        
        // STEP 3: Update tab to active status with real session ID
        const activeSession: Session = {
          id: sessionId,
          name: sessionName,
          status: 'active' as const,
          messages: existingMessages,
          workingDirectory: result.workingDirectory || workingDirectory,
          createdAt: pendingSession.createdAt,
          updatedAt: new Date(),
          claudeSessionId,
          claudeTitle: pendingSession.claudeTitle, // Keep the 'tab x' title
          pendingToolIds: new Set(),
          // Initialize fresh analytics for new session (even if resuming)
          analytics: {
            totalMessages: 0,
            userMessages: 0,
            assistantMessages: 0,
            toolUses: 0,
            tokens: { 
              input: 0, 
              output: 0, 
              total: 0,
              byModel: {
                opus: { input: 0, output: 0, total: 0 },
                sonnet: { input: 0, output: 0, total: 0 }
              }
            },
            cost: { total: 0, byModel: { opus: 0, sonnet: 0 } },
            duration: 0,
            lastActivity: new Date(),
            thinkingTime: 0
          }
        };
        
        // Replace pending session with active one (handle both new and reconnected sessions)
        console.log('[Store] Updating session to active:', { 
          tempSessionId, 
          sessionId, 
          existingSessionId,
          isReconnecting: !!existingSession 
        });
        set(state => {
          const newSessions = existingSession ?
            // If reconnecting, update the existing session
            state.sessions.map(s => 
              s.id === existingSessionId ? activeSession : s
            ) :
            // If new session, replace the temp session
            state.sessions.map(s => 
              s.id === tempSessionId ? activeSession : s
            );
          persistSessions(newSessions); // Persist after update
          localStorage.setItem('yurucode-current-session', sessionId);
          
          // Save tabs if remember tabs is enabled
          const storeState = get();
          if (storeState.rememberTabs) {
            setTimeout(() => storeState.saveTabs(), 100); // Small delay to ensure state is updated
          }
          
          return {
            sessions: newSessions,
            currentSessionId: sessionId
          };
        });
      
      // Don't add initial system message here - Claude Code SDK sends it automatically
      
      // Set up message listener for REAL responses
      console.log('[Store] Setting up message listener for session:', sessionId);
      
      // Listen for title updates
      const titleCleanup = claudeClient.onTitle(sessionId, (title: string) => {
        console.log('[Store] Received title for session:', sessionId, title);
        set(state => ({
          sessions: state.sessions.map(s => {
            // Only update title if:
            // 1. This is the right session
            // 2. User hasn't manually renamed
            const isTabTitle = s.claudeTitle?.match(/^tab \d+$/);
            if (s.id === sessionId && !s.userRenamed && isTabTitle) {
              return { ...s, claudeTitle: title };
            }
            return s;
          })
        }));
      });
      
      // Set up error handler for this session
      const errorCleanup = claudeClient.onError(sessionId, (error) => {
        console.error('[Store] Error received for session:', sessionId, error);
        
        // Add error message to the session
        set(state => ({
          ...state,
          sessions: state.sessions.map(s => 
            s.id === sessionId 
              ? {
                  ...s,
                  messages: (() => {
                    const newMessage = {
                    id: `error-${Date.now()}`,
                    type: 'error',
                    content: error.message,
                    timestamp: error.timestamp || Date.now(),
                    errorType: error.type
                  };
                    let updatedMessages = [...s.messages, newMessage];
                    const MAX_MESSAGES = 500;
                    if (updatedMessages.length > MAX_MESSAGES) {
                      const removeCount = updatedMessages.length - MAX_MESSAGES;
                      updatedMessages = updatedMessages.slice(removeCount);
                    }
                    return updatedMessages;
                  })(),
                  streaming: false
                }
              : s
          )
        }));
      });
      
      // IMPORTANT: Only set up message listener if we have a claudeSessionId
      // For deferred spawns (new tabs without prompt), this will be null until first message
      let messageCleanup: (() => void) | null = null;
      let tempMessageCleanup: (() => void) | null = null;
      let focusCleanup: (() => void) | null = null;
      
      // ALSO listen on the temp session ID for compact results
      // Compact creates a new session but emits result on original temp channel
      console.log('[Store] Setting up listener for temp session (for compact results):', sessionId);
      tempMessageCleanup = claudeClient.onMessage(sessionId, (message) => {
        console.log('[Store] 🗜️ Message received on TEMP session channel:', sessionId, 'type:', message.type, 'result:', message.result?.substring?.(0, 50));
        
        // Process ALL messages through the main handler, not just result messages
        // The temp channel receives all messages for the session
        if (message.type !== 'result') {
          // Special handling for stream_end to clear streaming state
          if (message.type === 'system' && message.subtype === 'stream_end') {
            console.log('[Store] 🔚 Stream end on temp channel - clearing streaming state (but keeping thinkingStartTime for result)');
            set(state => ({
              sessions: state.sessions.map(s => {
                if (s.id === sessionId) {
                  return { 
                    ...s, 
                    streaming: false, 
                    // DON'T clear thinkingStartTime here - we need it for the result message
                    // It will be cleared when the result is processed
                    pendingToolIds: new Set()
                  };
                }
                return s;
              })
            }));
          }
          // Special handling for streaming_resumed to set streaming state after interruption
          else if (message.type === 'system' && message.subtype === 'streaming_resumed') {
            console.log('[Store] 🔄 Streaming resumed after interruption - setting streaming state to true');
            set(state => ({
              sessions: state.sessions.map(s => {
                if (s.id === sessionId) {
                  return {
                    ...s,
                    streaming: true,
                    // Ensure thinkingStartTime is set if not already (safeguard for timer display)
                    thinkingStartTime: s.thinkingStartTime || Date.now(),
                  };
                }
                return s;
              })
            }));
          }
          
          // Extract TodoWrite todos and store in session
          if (message.type === 'tool_use' && message.message?.name === 'TodoWrite' && message.message.input?.todos) {
            console.log('[Store] 📋 TodoWrite detected on temp channel, updating session todos');
            set(state => ({
              sessions: state.sessions.map(s =>
                s.id === sessionId
                  ? { ...s, todos: message.message.input.todos }
                  : s
              )
            }));
          }

          // Non-result messages should go through the main handler
          get().addMessageToSession(sessionId, message);
          return;
        }
        
        // Only special handling for result messages (to check if compact)
        if (message.type === 'result') {
          const currentState = get();
          const isCurrentSession = currentState.currentSessionId === sessionId;
          
          // Check if this is actually a compact result
          // Primary: has wrapper_compact field (added by wrapperIntegration.ts)
          // Fallback: zero usage tokens (definitive indicator of compact)
          const isCompactResult = !!message.wrapper_compact ||
                                 (message.usage?.input_tokens === 0 &&
                                  message.usage?.output_tokens === 0);
          
          // If it's not a compact result, it's a normal result - process through main handler
          if (!isCompactResult) {
            console.log('[Store] 📊 NORMAL RESULT on temp channel (not compact), forwarding to main handler:', {
              sessionId,
              hasWrapper: !!message.wrapper,
              wrapperTokens: message.wrapper?.tokens,
              usage: message.usage,
              messageType: message.type
            });
            
            // NOTE: Don't clear streaming here - wait for streaming_end message
            // Result messages come BEFORE streaming_end, so clearing here causes UI to show idle prematurely
            console.log('[Store] 📊 Result received on temp channel - NOT clearing streaming (wait for streaming_end)');
            
            // Process as normal message through the main handler
            // Ensure all fields are preserved for display
            console.log('[Store] 📊 Result message fields:', {
              duration_ms: message.duration_ms,
              usage: message.usage,
              model: message.model,
              total_cost_usd: message.total_cost_usd
            });
            
            // Add the complete result message with all fields
            get().addMessageToSession(sessionId, message);
            return;
          }
          
          console.log('[Store] 🗜️ COMPACT RESULT detected on temp channel!', {
            sessionId,
            isCurrentSession,
            result: message.result
          });
          
          // Process the compact result message
          set(state => {
            let sessions = state.sessions.map(s => {
              if (s.id !== sessionId) return s;
              
              // Add the compact result to the session
              const existingMessages = [...s.messages];
              existingMessages.push({
                ...message,
                id: message.id || `result-${Date.now()}`,
                timestamp: new Date().toISOString()
              });
              
              // IMPORTANT: After compaction, the old session is gone
              // Clear the claudeSessionId so next message creates a new session
              console.log('[Store] 🗜️ Compaction complete - clearing claudeSessionId to force new session');
              
              // Check if this was an auto-compact and we need to resend the user's message
              import('../services/wrapperIntegration').then(({ getAutoCompactMessage, clearAutoCompactMessage }) => {
                const pendingMessage = getAutoCompactMessage(sessionId);
                if (pendingMessage) {
                  console.log('[Store] 🔄 AUTO-COMPACT COMPLETE - Resending user message with summary');
                  clearAutoCompactMessage(sessionId);
                  // NOTE: Don't clear pendingAutoCompactMessage yet - keep showing indicator until message is sent

                  // Wait a bit for state to settle, then send the message with summary
                  setTimeout(() => {
                    // CRITICAL: Switch to the correct session before sending
                    // User may have switched tabs during compact
                    const currentState = get();
                    if (currentState.currentSessionId !== sessionId) {
                      console.log('[Store] 🔄 Switching back to compacted session before sending followup:', sessionId);
                      get().setCurrentSession(sessionId);
                    }
                    // The sendMessage function will automatically prepend the summary
                    // since wasCompacted is true
                    get().sendMessage(pendingMessage);
                    // NOW clear the pending message indicator after message is sent
                    get().updateCompactionState(sessionId, {
                      pendingAutoCompactMessage: undefined,
                      isCompacting: false
                    });
                  }, 500);
                } else {
                  // No pending message - just clear compacting state
                  get().updateCompactionState(sessionId, { isCompacting: false });
                }
              }).catch(err => {
                console.error('[Store] Failed to import wrapperIntegration:', err);
                // Clear compacting state on error
                get().updateCompactionState(sessionId, { isCompacting: false });
              });

              // Reset token analytics after compact - fresh context window
              const resetAnalytics = {
                ...s.analytics,
                tokens: {
                  input: 0,
                  output: 0,
                  total: 0,
                  cacheRead: 0,
                  cacheCreation: 0,
                  byModel: s.analytics?.tokens?.byModel || {
                    opus: { input: 0, output: 0, total: 0 },
                    sonnet: { input: 0, output: 0, total: 0 }
                  }
                },
                contextWindow: {
                  used: 0,
                  limit: 200000,
                  percentage: 0,
                  remaining: 200000
                }
              };

              return {
                ...s,
                messages: existingMessages,
                streaming: false,
                claudeSessionId: null, // Clear the session ID - it's no longer valid
                wasCompacted: true, // Mark that this session was compacted
                analytics: resetAnalytics
              };
            });
            return { sessions: sessions as Session[] };
          });
        }
      });
      
      if (claudeSessionId) {
        console.log('[Store] Setting up message listener for Claude session:', claudeSessionId);
        messageCleanup = claudeClient.onMessage(claudeSessionId, (message) => {
          // CRITICAL: Check if this session is still the current one
          const currentState = get();
          const isCurrentSession = currentState.currentSessionId === sessionId;
          
          // ALWAYS process ALL messages for ALL sessions to maintain correct state
          // This ensures that when you switch tabs, all messages are already there
          // We're not filtering any messages - all sessions get all their messages
          console.log('[Store] Message received for session:', {
            sessionId,
            isCurrentSession,
            messageType: message.type,
            messageSubtype: message.subtype,
            streaming: message.streaming,
            id: message.id
          });
          
          console.log('[Store] Processing message:', {
            sessionId,
            type: message.type,
            id: message.id,
            streaming: message.streaming,
            name: message.message?.name,
            hasContent: !!message.message?.content,
            hasInput: !!message.message?.input
          });
          
          // CRITICAL LOG FOR TOOL MESSAGES
          if (message.type === 'tool_use' || message.type === 'tool_result') {
            console.log('[Tool] Message received:', {
              type: message.type,
              name: message.message?.name,
              id: message.id
            });
            
            // Process tool_use through hooks
            if (message.type === 'tool_use' && message.message?.name) {
              // Extract TodoWrite todos and store in session
              if (message.message.name === 'TodoWrite' && message.message.input?.todos) {
                set(state => ({
                  sessions: state.sessions.map(s =>
                    s.id === sessionId
                      ? { ...s, todos: message.message.input.todos }
                      : s
                  )
                }));
              }

              import('../services/hooksService').then(({ hooksService }) => {
                hooksService.processToolUse(
                  message.message.name,
                  message.message.input || {},
                  sessionId,
                  'pre'
                ).then(result => {
                  if (!result.allowed) {
                    console.warn('[Hook] Tool blocked:', result.message);
                    // Add a message to show the block in the session's messages
                    const blockMessage = {
                      id: `blocked-${Date.now()}`,
                      type: 'system' as const,
                      message: { content: `Hook blocked: ${result.message}` },
                      timestamp: new Date().toISOString()
                    };
                    set(state => ({
                      sessions: state.sessions.map(s =>
                        s.id === sessionId
                          ? { ...s, messages: [...(s.messages || []), blockMessage] }
                          : s
                      )
                    }));
                  }
                }).catch(err => console.error('[Hook] processToolUse failed:', err));
              }).catch(err => console.error('[Hook] Failed to import hooksService:', err));
            }
          }
          
          // Handle streaming messages by updating existing message or adding new
          set(state => {
            // ALWAYS process ALL messages for ALL sessions
            // This ensures that when you switch tabs, all messages are already there
            // We're not skipping any messages anymore - all sessions get all their messages
            console.log('[Store] Processing message in set state:', {
              sessionId,
              messageType: message.type,
              isCurrentSession: state.currentSessionId === sessionId
            });
            
            let sessions = state.sessions.map(s => {
              if (s.id !== sessionId) return s;
              
              // Update claudeSessionId if present in message
              // IMPORTANT: For compact results, we clear the session ID to start fresh
              // /compact returns type:"result" with new session_id, not system message
              // Detection: wrapper_compact field (primary) or zero usage tokens (fallback)
              const isCompactResult = (message.type === 'system' && message.subtype === 'compact') ||
                                    !!message.wrapper_compact ||
                                    (message.type === 'result' &&
                                     message.usage?.input_tokens === 0 &&
                                     message.usage?.output_tokens === 0);
              const isResultWithNewSession = message.type === 'result' && message.session_id;
              
              if (isCompactResult) {
                // Compact result includes new session ID - update to it
                const oldSessionId = s.claudeSessionId;
                const newSessionId = message.session_id || null;
                console.log(`🗜️ [Store] Compact result - updating session ID: ${oldSessionId} -> ${newSessionId}`);
                s = { ...s,
                  claudeSessionId: newSessionId,
                  wasCompacted: true,
                  streaming: false,  // Clear streaming state after compact
                  lastAssistantMessageIds: [], // Clear assistant message tracking
                  compactionState: { ...s.compactionState, isCompacting: false } // Clear compacting indicator
                };
              } else if (message.session_id && (!s.claudeSessionId || isResultWithNewSession)) {
                const oldSessionId = s.claudeSessionId;
                console.log(`[Store] Updating claudeSessionId for session ${sessionId}: ${oldSessionId} -> ${message.session_id}`);
                s = { ...s, claudeSessionId: message.session_id };
                
                // Also update the session mapping
                get().updateSessionMapping(sessionId, message.session_id, {
                  name: s.claudeTitle || s.name,
                  projectPath: s.workingDirectory
                });
              }
              
              // Mark session as initialized when we receive the first message from Claude
              // This could be a system init message or any assistant message
              if (!s.initialized && (message.type === 'system' || message.type === 'assistant')) {
                console.log(`[Store] Session ${sessionId} initialized - received first message (${message.type})`);
                s = { ...s, initialized: true };
              }
              
              const existingMessages = [...s.messages];
              
              // CRITICAL: Only accept tool_result user messages from server
              // Regular user messages should only come from sendMessage
              if (message.type === 'user') {
                // Check if this is a tool_result message (these come from Claude)
                const isToolResult = message.message?.content?.some?.((c: any) => 
                  c.type === 'tool_result'
                ) || message.message?.tool_use_id;
                
                if (!isToolResult) {
                  console.warn('[Store] Ignoring non-tool-result user message from server - regular user messages should only be created locally');
                  return s;
                }
                console.log('[Store] 🔧 Accepting tool_result user message from server');
              }
              
              // Initialize analytics object early so we can update it with wrapper tokens
              // Use type assertion to avoid union type issues when accessing optional properties
              const analytics: SessionAnalytics = s.analytics || {
                totalMessages: 0,
                userMessages: 0,
                assistantMessages: 0,
                toolUses: 0,
                systemMessages: 0,
                tokens: {
                  input: 0,
                  output: 0,
                  total: 0,
                  cacheSize: 0,
                  cacheCreation: 0,
                  cacheRead: 0,
                  conversationTokens: 0,
                  systemTokens: 0,
                  average: 0,
                  byModel: {
                    opus: { input: 0, output: 0, total: 0 },
                    sonnet: { input: 0, output: 0, total: 0 }
                  },
                  breakdown: { user: 0, assistant: 0 }
                },
                duration: 0,
                lastActivity: new Date(),
                thinkingTime: 0,
                cost: { total: 0, byModel: { opus: 0, sonnet: 0 } },
                contextWindow: {
                  used: 0,
                  limit: 200000,
                  percentage: 0,
                  remaining: 200000
                }
              };
              
              // Debug log incoming message
              if (message.type === 'result') {
                console.log('🔍 [STORE-RESULT-DEBUG] Received result message:', {
                  sessionId: s.id,
                  messageKeys: Object.keys(message),
                  hasWrapper: !!message.wrapper,
                  wrapperStructure: message.wrapper ? Object.keys(message.wrapper) : null,
                  wrapperTokens: message.wrapper?.tokens,
                  hasUsage: !!message.usage,
                  usage: message.usage
                });
              }
              
              // Sync wrapper tokens to analytics if available
              if (message.wrapper?.tokens) {
                console.log('✅✅✅ [STORE-TOKENS] WRAPPER TOKENS FOUND! Syncing to analytics:', {
                  sessionId: s.id,
                  wrapperTokens: message.wrapper.tokens,
                  beforeTotal: analytics.tokens.total,
                  afterTotal: message.wrapper.tokens.total
                });

                // wrapper.tokens.total now includes ALL tokens (including cache)
                // This is the actual context size in use
                // IMPORTANT: Use ?? (nullish coalescing) not || to allow 0 values (e.g., after compact)
                analytics.tokens.total = message.wrapper.tokens.total ?? analytics.tokens.total;
                analytics.tokens.input = message.wrapper.tokens.input ?? analytics.tokens.input;
                analytics.tokens.output = message.wrapper.tokens.output ?? analytics.tokens.output;
                // cache_read is the SIZE of cached context, not incremental
                analytics.tokens.cacheSize = message.wrapper.tokens.cache_read ?? 0;
                analytics.tokens.cacheCreation = message.wrapper.tokens.cache_creation ?? 0;

                // Also update contextWindow to reflect current token state (especially after compact)
                const currentTotal = analytics.tokens.total;
                const percentage = (currentTotal / 200000) * 100;
                analytics.contextWindow = {
                  used: currentTotal,
                  limit: 200000,
                  percentage: percentage,
                  remaining: Math.max(0, 200000 - currentTotal)
                };
              } else if (message.type === 'result') {
                // Only log missing wrapper for result messages (where we expect tokens)
                console.log('❌ [STORE-TOKENS] Result message WITHOUT wrapper tokens:', {
                  sessionId: s.id,
                  messageType: message.type,
                  hasWrapper: !!message.wrapper,
                  wrapperKeys: message.wrapper ? Object.keys(message.wrapper) : [],
                  hasUsage: !!message.usage,
                  fullMessage: message
                });
              }
              
              // NOTE: wrapper_auto_compact is now DISABLED in wrapperIntegration.ts
              // The frontend wrapper's token calculation was incorrect (used cumulative API values
              // instead of actual context size). Auto-compaction is now handled only by
              // compactionService.updateContextUsage() using the correctly tracked analytics.tokens.total
              // This code block is kept for backwards compatibility but should never trigger.
              if (message.wrapper_auto_compact?.triggered) {
                console.warn('⚠️ [Store] wrapper_auto_compact.triggered received (unexpected - this path is deprecated)');
                // Don't trigger compaction from this path - it was based on wrong calculations
              }
              
              // Handle messages with proper deduplication
              // BASH DEBUG: Log when bash message is being added to session
              const isBashMessage = message.id && String(message.id).startsWith('bash-');
              if (isBashMessage) {
                console.log(`[Store] 🐚 BASH MESSAGE IN SET STATE - adding to session ${sessionId}:`, {
                  messageId: message.id,
                  existingMessagesCount: existingMessages.length,
                  streaming: message.streaming
                });
              }

              if (message.id) {
                const existingIndex = existingMessages.findIndex(m => m.id === message.id);
                if (existingIndex >= 0) {
                  // Update existing message (for streaming updates)
                  // IMPORTANT: Merge content to avoid erasing messages
                  console.log(`[Store] Updating message ${message.id} at index ${existingIndex}, streaming: ${message.streaming}`);
                  const existingMessage = existingMessages[existingIndex];
                  
                  // Special handling for result messages - ensure we don't lose final assistant messages
                  if (message.type === 'result' && (message.subtype === 'error_max_turns' || message.is_error)) {
                    console.log('[Store] Processing error result - ensuring final assistant message is preserved');
                    // Look for recent assistant messages that should be preserved
                    const recentAssistantMessages = existingMessages.filter(m => 
                      m.type === 'assistant' && 
                      m.timestamp && 
                      Date.now() - m.timestamp < 5000 // Within last 5 seconds
                    );
                    if (recentAssistantMessages.length > 0) {
                      console.log(`[CLIENT] Found ${recentAssistantMessages.length} recent assistant messages to preserve`);
                    }
                  }
                  
                  // Never update tool_use or tool_result messages - they should be immutable
                  // Result messages should also be immutable - they only come once with final tokens
                  if (existingMessage.type === 'tool_use' || existingMessage.type === 'tool_result' || existingMessage.type === 'result') {
                    console.log(`Skipping update for ${existingMessage.type} message - preserving original`);
                  } else if (message.type === 'assistant') {
                    // For assistant messages during streaming, handle array or string content
                    const existingContent = existingMessage.message?.content || '';
                    const newContent = message.message?.content || '';
                    
                    // Convert to string if needed for comparison
                    const existingStr = typeof existingContent === 'string' ? existingContent : JSON.stringify(existingContent);
                    const newStr = typeof newContent === 'string' ? newContent : JSON.stringify(newContent);
                    
                    // Just use the new content directly - Claude Code SDK sends full updates
                    let finalContent = message.message?.content || existingMessage.message?.content;
                    
                    // Enhanced logging to debug thinking blocks
                    if (Array.isArray(finalContent)) {
                      const blockTypes = finalContent.map(b => b?.type || 'unknown');
                      const hasThinking = blockTypes.includes('thinking');
                      console.log(`[CLIENT] Assistant message update - streaming: ${message.streaming}, blocks: [${blockTypes.join(', ')}], hasThinking: ${hasThinking}`);
                      if (hasThinking) {
                        console.log('[CLIENT] Thinking blocks found in content:', finalContent.filter(b => b?.type === 'thinking'));
                      }
                    } else {
                      console.log(`[CLIENT] Assistant message update - streaming: ${message.streaming}, content length: ${typeof finalContent === 'string' ? finalContent.length : JSON.stringify(finalContent).length}`);
                    }
                    
                    existingMessages[existingIndex] = {
                      ...message,
                      message: {
                        ...message.message,
                        content: finalContent
                      },
                      streaming: message.streaming // Explicitly preserve streaming flag
                    };
                    
                    // NOTE: Don't clear session streaming here on assistant message streaming=false
                    // Session streaming should only be cleared by streaming_end message

                  } else {
                    existingMessages[existingIndex] = message;
                    // NOTE: Don't clear session streaming here - wait for streaming_end message

                  }
                } else {
                  // Add new message only if it doesn't exist
                  console.log(`[CLIENT] Adding new message ${message.id} (type: ${message.type}, streaming: ${message.streaming}, model: ${message.model})`);
                  
                  // Special handling for result messages with error_max_turns
                  if (message.type === 'result' && message.subtype === 'error_max_turns') {
                    console.log('[CLIENT] Adding error_max_turns result - verifying final assistant message exists');
                    // Check if we have a recent assistant message, if not, there might be a timing issue
                    const hasRecentAssistant = existingMessages.some(m => 
                      m.type === 'assistant' && 
                      m.timestamp && 
                      Date.now() - m.timestamp < 10000 && // Within last 10 seconds
                      !m.streaming // Non-streaming (finalized)
                    );
                    if (!hasRecentAssistant) {
                      console.warn('[CLIENT] No recent finalized assistant message found before error_max_turns result');
                    }
                  }
                  
                  existingMessages.push(message);
                }
              } else {
                // Messages without ID - check for duplicate using fast hash comparison
                const newHash = getCachedHash(message);
                const isDuplicate = existingMessages.some(m =>
                  m.type === message.type && getCachedHash(m) === newHash
                );
                if (!isDuplicate) {
                  existingMessages.push(message);
                }
              }
              
              // Analytics object was already initialized earlier before wrapper token sync
              // Just update the existing analytics object
              
              console.log(`🔍 [ANALYTICS DEBUG] Session ${s.id}: Before processing, analytics tokens: ${analytics.tokens.total}`);
              
              // Update message counts - matches Claude Code
              // Exclude bash commands (messages starting with $) from user message count
              const nonBashUserMessages = existingMessages.filter(m => {
                if (m.type !== 'user') return false;
                const content = typeof m.message === 'object' ? m.message?.content : m.message;
                return !(typeof content === 'string' && isBashPrefix(content));
              });
              const bashCommands = existingMessages.filter(m => {
                if (m.type !== 'user') return false;
                const content = typeof m.message === 'object' ? m.message?.content : m.message;
                return typeof content === 'string' && isBashPrefix(content);
              });

              // Also exclude assistant messages that are bash responses (id starts with 'bash-')
              const nonBashAssistantMessages = existingMessages.filter(m =>
                m.type === 'assistant' &&
                !m.id?.startsWith?.('bash-')
              );
              const bashResponses = existingMessages.filter(m =>
                m.type === 'assistant' &&
                m.id?.startsWith?.('bash-')
              );

              analytics.totalMessages = existingMessages.length - bashCommands.length - bashResponses.length;
              analytics.userMessages = nonBashUserMessages.length;
              analytics.assistantMessages = nonBashAssistantMessages.length;
              analytics.toolUses = existingMessages.filter(m => m.type === 'tool_use').length;
              analytics.systemMessages = existingMessages.filter(m => m.type === 'system').length;
              
              // Debug log to see what's being calculated
              console.log(`📊 [ANALYTICS COUNTS] Session ${s.id}:`, {
                totalMessages: analytics.totalMessages,
                userMessages: analytics.userMessages,
                assistantMessages: analytics.assistantMessages,
                toolUses: analytics.toolUses,
                systemMessages: analytics.systemMessages,
                messageTypes: existingMessages.map(m => m.type)
              });
              
              // Initialize byModel if it doesn't exist (for backward compatibility)
              if (!analytics.tokens.byModel) {
                analytics.tokens.byModel = {
                  opus: { input: 0, output: 0, total: 0 },
                  sonnet: { input: 0, output: 0, total: 0 }
                };
              }
              
              // Initialize cache tracking if it doesn't exist (for backward compatibility)
              if (analytics.tokens.cacheSize === undefined) {
                analytics.tokens.cacheSize = 0;
              }
              
              // Handle compact system message with token reset
              if (message.type === 'system' && message.subtype === 'compact') {
                console.log('🗜️ [COMPACT] Received compact system message');
                const tokensSaved = message.message?.tokensSaved || 0;
                console.log(`🗜️ [COMPACT] Compact saved ${tokensSaved} tokens`);
                
                // Always reset tokens to 0 after compact
                // The next message will establish the new baseline
                console.log('🗜️ [COMPACT] Resetting all token counts to 0');
                
                // Reset conversation tokens completely
                analytics.tokens.input = 0;
                analytics.tokens.output = 0;
                analytics.tokens.total = 0;
                analytics.tokens.cacheSize = 0;
                analytics.tokens.conversationTokens = 0;
                analytics.tokens.cacheCreation = 0;

                // Reset context window display
                analytics.contextWindow = {
                  used: 0,
                  limit: 200000,
                  percentage: 0,
                  remaining: 200000
                };

                // Reset model-specific counts
                analytics.tokens.byModel = {
                  opus: { input: 0, output: 0, total: 0 },
                  sonnet: { input: 0, output: 0, total: 0 }
                };

                // Set compactPending flag so next message knows to use new baseline
                analytics.compactPending = true;
                console.log('🗜️ [COMPACT] Set compactPending flag for next message');

                console.log('🗜️ [COMPACT] Token count reset complete. New totals:', analytics.tokens);
              }
              
              // Update tokens if result message - Claude CLI sends cumulative values for this conversation
              if (message.type === 'result') {
                console.log('📊 [TOKEN DEBUG] Received result message:', {
                  id: message.id,
                  type: message.type,
                  subtype: message.subtype,
                  hasUsage: !!message.usage,
                  usage: message.usage,
                  hasCost: !!message.total_cost_usd,
                  cost: message.total_cost_usd,
                  claudeSessionId: s.claudeSessionId,
                  isCompactResult: message.usage?.input_tokens === 0 && message.usage?.output_tokens === 0,
                  fullMessage: message
                });
                
                if (message.usage) {
                  // Check if this is a /compact result (all zeros)
                  const isCompactResult = message.usage.input_tokens === 0 && 
                                         message.usage.output_tokens === 0 && 
                                         message.usage.cache_creation_input_tokens === 0 && 
                                         message.usage.cache_read_input_tokens === 0;
                  
                  if (isCompactResult) {
                    console.log('🗜️ [COMPACT DETECTED] /compact result message received (all zeros)');
                    console.log('🗜️ [COMPACT] Ignoring zero usage from compact command itself');
                    // The system compact message will handle the actual token reset
                    // Don't process this result message's usage
                    return {
                      ...s,
                      messages: existingMessages,
                      analytics,
                      updatedAt: new Date(),
                      // Force React re-render by updating a counter
                      messageUpdateCounter: (s.messageUpdateCounter || 0) + 1
                    };
                  }
                  
                  // Check if we've already processed tokens for a result with this ID
                  // Important: We need to check the messages BEFORE this one was added
                  // Find all result messages except the current one
                  const previousResultMessages = existingMessages.filter((m, idx) => {
                    // Skip the current message if it was just added
                    if (m === message) return false;
                    return m.type === 'result' && m.id;
                  });
                  
                  // Check if we already have a result message with this ID that had usage data
                  const wasAlreadyProcessed = previousResultMessages.some(m => 
                    m.id === message.id && m.usage
                  );
                  
                  console.log(`🔍 [TOKEN DEBUG] Processing result message ${message.id}`);
                  console.log(`🔍 [TOKEN DEBUG]   wasAlreadyProcessed: ${wasAlreadyProcessed}`);
                  console.log(`🔍 [TOKEN DEBUG]   current analytics tokens: ${analytics.tokens.total}`);
                  console.log(`🔍 [TOKEN DEBUG]   Session ${s.id} claudeSessionId: ${s.claudeSessionId}`);
                  console.log(`🔍 [TOKEN DEBUG]   Previous result messages:`, previousResultMessages.map(m => ({ id: m.id, hasUsage: !!m.usage })));
                  console.log(`🔍 [TOKEN DEBUG]   Is compact result: ${isCompactResult}`);
                  
                  // Process tokens if this is the first time we're seeing this result message with usage data
                  if (!wasAlreadyProcessed) {
                    // Check for wrapper tokens first (more accurate)
                    if (message.wrapper?.tokens) {
                      console.log('📊 [Store] Using wrapper tokens from result message:', message.wrapper.tokens);
                      analytics.tokens.total = message.wrapper.tokens.total;
                      analytics.tokens.input = message.wrapper.tokens.input;
                      analytics.tokens.output = message.wrapper.tokens.output;
                      // cache_read is the SIZE of cached context
                      analytics.tokens.cacheSize = message.wrapper.tokens.cache_read || 0;
                      analytics.tokens.cacheCreation = message.wrapper.tokens.cache_creation || 0;
                      
                      // Update model-specific tracking
                      const currentModel = get().selectedModel;
                      const modelKey = currentModel?.includes('opus') ? 'opus' : 'sonnet';
                      analytics.tokens.byModel[modelKey] = {
                        input: message.wrapper.tokens.input,
                        output: message.wrapper.tokens.output,
                        total: message.wrapper.tokens.total
                      };
                      
                      console.log('✅ [Store] Wrapper tokens applied to analytics:', {
                        total: analytics.tokens.total,
                        input: analytics.tokens.input,
                        output: analytics.tokens.output,
                        cacheSize: analytics.tokens.cacheSize
                      });
                    } else if (message.usage) {
                      // Only process message.usage if no wrapper tokens available
                      console.log('📊 [DIRECT-USAGE] Processing result message with direct usage (Windows-style):', {
                        usage: message.usage,
                        input_tokens: message.usage.input_tokens,
                        output_tokens: message.usage.output_tokens,
                        cache_creation_input_tokens: message.usage.cache_creation_input_tokens,
                        cache_read_input_tokens: message.usage.cache_read_input_tokens
                      });
                      if (message.cost) {
                        console.log('💰 Result message with cost:', message.cost);
                      }
                    
                      // Parse token usage from Claude CLI
                      // IMPORTANT: Cache tokens ARE part of the context window!
                      const regularInputTokens = message.usage.input_tokens || 0;
                      const cacheCreationTokens = message.usage.cache_creation_input_tokens || 0;
                      const cacheReadTokens = message.usage.cache_read_input_tokens || 0;
                      const outputTokens = message.usage.output_tokens || 0;
                      
                      // Context formula per Claude Code: cache_read + cache_creation + input
                      // Output tokens are NOT part of input context (generated by model)
                      const totalContextTokens = cacheReadTokens + cacheCreationTokens + regularInputTokens;
                      const cacheTotal = cacheCreationTokens + cacheReadTokens;
                      
                      console.log(`🔍 [TOKEN DEBUG] Token breakdown:`);
                      console.log(`   cache_read: ${cacheReadTokens}, cache_creation: ${cacheCreationTokens}, input: ${regularInputTokens}`);
                      console.log(`   output: ${outputTokens} (not counted in context)`);
                      console.log(`   CONTEXT TOTAL: ${totalContextTokens} / 200000`);

                      // Check if compactPending flag is set - if so, reset tokens
                      if (analytics.compactPending) {
                        console.log('🗜️ [COMPACT RECOVERY] Post-compact message received, resetting token count');
                        console.log('🗜️ [COMPACT RECOVERY] Old total:', analytics.tokens.total);
                        // Reset conversation tokens after compact
                        analytics.tokens.input = regularInputTokens;
                        analytics.tokens.output = outputTokens;
                        analytics.tokens.total = totalContextTokens;
                        // Cache read is the size of cached context after compact
                        analytics.tokens.cacheSize = cacheReadTokens;
                        analytics.compactPending = false; // Clear the flag
                        console.log('🗜️ [COMPACT RECOVERY] New conversation total:', analytics.tokens.total);
                        console.log('🗜️ [COMPACT RECOVERY] New cache size:', analytics.tokens.cacheSize);
                      } else {
                        // CORRECT CALCULATION per Claude Code / Anthropic API:
                        // Context = cache_read + cache_creation + input
                        // - cache_read_input_tokens = cached conversation history
                        // - cache_creation_input_tokens = new content being cached
                        // - input_tokens = new input not in cache
                        // NOTE: output tokens are NOT part of input context (generated by model)
                        const previousTotal = analytics.tokens.total;

                        // Track accumulated input/output for analytics (separate from context calculation)
                        analytics.tokens.input += regularInputTokens;
                        analytics.tokens.output += outputTokens;
                        analytics.tokens.cacheCreation = (analytics.tokens.cacheCreation || 0) + cacheCreationTokens;

                        // CONTEXT WINDOW = cache_read + cache_creation + input
                        // Matches wrapper formula and Claude Code calculation
                        analytics.tokens.total = cacheReadTokens + cacheCreationTokens + regularInputTokens;

                        // Cache size is a snapshot of conversation history
                        analytics.tokens.cacheSize = cacheReadTokens;

                        console.log(`📊 [TOKEN UPDATE] Context usage (SNAPSHOT):`);
                        console.log(`   cache_read: ${cacheReadTokens}, cache_creation: ${cacheCreationTokens}, input: ${regularInputTokens}`);
                        console.log(`   TOTAL CONTEXT: ${analytics.tokens.total} / 200000 (${(analytics.tokens.total / 200000 * 100).toFixed(2)}%)`);
                        console.log(`   (output: ${outputTokens} - not counted in context)`);
                      }
                      
                      // Update new analytics fields to match Claude Code
                      // Context window shows ALL tokens (including cache) as they all count towards the limit
                      // NOTE: Do NOT cap percentage at 100% - we need real value for auto-compaction
                      const rawPercentage = (analytics.tokens.total / 200000 * 100);
                      analytics.contextWindow = {
                        used: analytics.tokens.total,
                        limit: 200000,
                        percentage: rawPercentage, // Real percentage, can exceed 100%
                        remaining: Math.max(0, 200000 - analytics.tokens.total)
                      };

                      // Check for context warnings at 90%
                      if (rawPercentage >= 90 && analytics.contextWindow) {
                        const cw = analytics.contextWindow; // Capture for TypeScript
                        import('../services/hooksService').then(({ hooksService }) => {
                          hooksService.processContextWarning(
                            cw.percentage,
                            cw.used,
                            cw.limit,
                            sessionId
                          );
                        });
                      }

                      // NOTE: Auto-compaction is DISABLED in this path (no wrapper tokens)
                      // The formula above (cache_read + cache_creation + input) uses CUMULATIVE
                      // API values which don't represent actual context size.
                      // Auto-compaction should only trigger when we have accurate token tracking
                      // from the server wrapper (message.wrapper.tokens).
                      //
                      // On Windows/non-wrapper systems, manual /compact is still available.
                      if (rawPercentage >= 55) {
                        console.log(`⚠️ [COMPACTION] Skipping auto-compact check - no wrapper tokens (unreliable calculation)`);
                        console.log(`   Reported ${rawPercentage.toFixed(2)}% but this uses cumulative API values, not actual context size`);
                      }
                      
                      // Update conversation tokens (guard against negative if cacheSize > total somehow)
                      analytics.tokens.conversationTokens = Math.max(0, analytics.tokens.total - (analytics.tokens.cacheSize || 0));
                      
                      // Update token breakdown
                      analytics.tokens.breakdown = {
                        user: existingMessages.filter(m => m.type === 'user').reduce((sum, m) => {
                          // Estimate user message tokens (rough calculation)
                          const content = typeof m.message === 'string' ? m.message : JSON.stringify(m.message);
                          return sum + Math.ceil(content.length / 4); // Rough estimate
                        }, 0),
                        assistant: analytics.tokens.output // Assistant tokens = output tokens
                      };
                      
                      // Update average tokens per message
                      if (analytics.totalMessages > 0) {
                        analytics.tokens.average = Math.ceil(analytics.tokens.total / analytics.totalMessages);
                      }
                      
                      console.log(`📊 [TOKEN UPDATE] Session ${s.id}:`);
                      console.log(`   New tokens accumulated: Input=${analytics.tokens.input}, Output=${analytics.tokens.output}`);
                      console.log(`   Current context size: ${analytics.tokens.total} tokens`);
                      console.log(`   Context usage: ${(analytics.tokens.total / 200000 * 100).toFixed(2)}% of 200k limit`);
                      
                      // Determine which model was used (check message.model or use current selectedModel)
                      const modelUsed = message.model || get().selectedModel;
                      const isOpus = modelUsed?.toLowerCase()?.includes('opus');
                      const modelKey = isOpus ? 'opus' : 'sonnet';
                      
                      console.log('🔍 [MODEL DETECTION] Token update:', {
                        messageModel: message.model,
                        selectedModel: get().selectedModel,
                        modelUsed,
                        isOpus,
                        modelKey,
                        regularInputTokens,
                        outputTokens
                      });
                      
                      // Update model-specific tokens (accumulate NEW tokens only, not cache)
                      // Both models can be used in the same conversation if user switches
                      if (isOpus) {
                        analytics.tokens.byModel.opus.input += regularInputTokens; // Only new input
                        analytics.tokens.byModel.opus.output += outputTokens;
                        analytics.tokens.byModel.opus.total += (regularInputTokens + outputTokens);
                      } else {
                        analytics.tokens.byModel.sonnet.input += regularInputTokens; // Only new input
                        analytics.tokens.byModel.sonnet.output += outputTokens;
                        analytics.tokens.byModel.sonnet.total += (regularInputTokens + outputTokens);
                      }
                      
                      // Store cost information (accumulate per message)
                      if (message.total_cost_usd !== undefined) {
                        if (!analytics.cost) {
                          analytics.cost = { total: 0, byModel: { opus: 0, sonnet: 0 } };
                        }
                        // Accumulate cost for each message
                        analytics.cost.total += message.total_cost_usd;
                        if (isOpus) {
                          analytics.cost.byModel.opus += message.total_cost_usd;
                        } else {
                          analytics.cost.byModel.sonnet += message.total_cost_usd;
                        }
                        console.log('💵 Updated cost:', analytics.cost);
                      }
                    } // End of else if (message.usage)
                  } // End of if (!wasAlreadyProcessed)
                } else {
                  // No usage data in result message - estimate based on messages
                  console.log('⚠️ [TOKEN DEBUG] No usage data in result message, estimating from messages');
                  
                  // Count tokens from all messages in this conversation
                  let estimatedInput = 0;
                  let estimatedOutput = 0;
                  
                  s.messages.forEach(msg => {
                    if (msg.type === 'user' && msg.message?.content) {
                      // Rough estimate: 1 token per 4 characters for input
                      const content = typeof msg.message.content === 'string' 
                        ? msg.message.content 
                        : JSON.stringify(msg.message.content);
                      estimatedInput += Math.ceil(content.length / 4);
                    } else if (msg.type === 'assistant' && msg.message?.content) {
                      // Count assistant message tokens
                      const content = typeof msg.message.content === 'string'
                        ? msg.message.content
                        : JSON.stringify(msg.message.content);
                      estimatedOutput += Math.ceil(content.length / 4);
                    }
                  });
                  
                  // Update analytics with estimates
                  analytics.tokens.input = estimatedInput;
                  analytics.tokens.output = estimatedOutput;
                  analytics.tokens.total = estimatedInput + estimatedOutput;
                  
                  // Update model-specific tokens
                  const modelUsed = message.model || get().selectedModel;
                  const isOpus = modelUsed.includes('opus');
                  
                  if (isOpus) {
                    analytics.tokens.byModel.opus = {
                      input: estimatedInput,
                      output: estimatedOutput,
                      total: estimatedInput + estimatedOutput
                    };
                    analytics.tokens.byModel.sonnet = { input: 0, output: 0, total: 0 };
                  } else {
                    analytics.tokens.byModel.sonnet = {
                      input: estimatedInput,
                      output: estimatedOutput,
                      total: estimatedInput + estimatedOutput
                    };
                    analytics.tokens.byModel.opus = { input: 0, output: 0, total: 0 };
                  }
                  
                  // Estimate cost (rough pricing)
                  const costPerMillionInput = isOpus ? 15 : 3;  // $15/$3 per million
                  const costPerMillionOutput = isOpus ? 75 : 15; // $75/$15 per million
                  const estimatedCost = (estimatedInput * costPerMillionInput / 1000000) + 
                                       (estimatedOutput * costPerMillionOutput / 1000000);
                  
                  if (!analytics.cost) {
                    analytics.cost = { total: 0, byModel: { opus: 0, sonnet: 0 } };
                  }
                  analytics.cost.total = estimatedCost;
                  analytics.cost.byModel.opus = isOpus ? estimatedCost : 0;
                  analytics.cost.byModel.sonnet = !isOpus ? estimatedCost : 0;
                  
                  console.log('📊 [TOKEN DEBUG] Estimated tokens:', {
                    input: estimatedInput,
                    output: estimatedOutput,
                    total: estimatedInput + estimatedOutput,
                    cost: estimatedCost
                  });
                }
              }
              
              // Calculate thinking time when result message is received
              if (message.type === 'result' && s.thinkingStartTime) {
                const thinkingDuration = Math.floor((Date.now() - s.thinkingStartTime) / 1000);
                analytics.thinkingTime = (analytics.thinkingTime || 0) + thinkingDuration;
                console.log(`📊 [THINKING TIME] Result received - added ${thinkingDuration}s, total: ${analytics.thinkingTime}s`);
              } else if (message.type === 'result') {
                console.log(`📊 [THINKING TIME] Result received but no thinkingStartTime set for session ${s.id}`);
              }
              
              // Update duration and last activity
              analytics.duration = new Date().getTime() - s.createdAt.getTime();
              analytics.lastActivity = new Date();
              
              // Track file changes for assistant messages with tool_use blocks
              let restorePoints = [...(s.restorePoints || [])];
              let modifiedFiles = new Set(s.modifiedFiles || []);

              if (message.type === 'assistant' && !message.streaming) {
                const restorePoint = trackFileChange(s, message, existingMessages.length - 1);
                if (restorePoint) {
                  restorePoints.push(restorePoint);
                  // Limit restore points to prevent unbounded memory growth
                  // Keep most recent points, discard oldest
                  if (restorePoints.length > MAX_RESTORE_POINTS_PER_SESSION) {
                    restorePoints = restorePoints.slice(-MAX_RESTORE_POINTS_PER_SESSION);
                  }
                  // Update modified files set
                  restorePoint.fileSnapshots.forEach(snapshot => {
                    modifiedFiles.add(snapshot.path);
                  });
                }
              }
              
              // Always log final state to debug token tracking
              console.log('📊 [STORE-FINAL] Returning session with analytics:', {
                sessionId: s.id,
                tokenTotal: analytics.tokens.total,
                tokenInput: analytics.tokens.input,
                tokenOutput: analytics.tokens.output,
                cacheSize: analytics.tokens.cacheSize,
                hasWrapper: !!message.wrapper,
                wrapperTokens: message.wrapper?.tokens
              });
              
              return {
                ...s,
                messages: existingMessages,
                updatedAt: new Date(),
                analytics,
                restorePoints,
                modifiedFiles,
                lastMessageTime: Date.now(), // Track when last message was received
                // Force React re-render by updating a counter (fixes bash output not showing)
                messageUpdateCounter: (s.messageUpdateCounter || 0) + 1
              };
            });

            // Update streaming state based on message type
            if (message.type === 'assistant' || message.type === 'tool_result' || message.type === 'thinking') {
              // Update streaming state based on the message's streaming flag
              console.log(`[THINKING TIME DEBUG] ${message.type} message - streaming: ${message.streaming}, sessionId: ${sessionId}`);
              if (message.streaming === true) {
                // Ensure thinkingStartTime is set if not already (safeguard for timer display)
                console.log(`[THINKING TIME DEBUG] ${message.type} streaming started, ensuring thinkingStartTime exists`);
                sessions = sessions.map(s =>
                  s.id === sessionId ? { ...s, streaming: true, lastMessageTime: Date.now(), thinkingStartTime: s.thinkingStartTime || Date.now() } : s
                );
              } else if (message.streaming === false) {
                // CRITICAL FIX: Don't clear streaming when individual messages complete!
                // Individual messages can finish (streaming=false) while the overall response is still active.
                // For example: assistant message completes -> tool_use starts -> tool_result -> more text
                // Only streaming_end (from result message) should clear streaming state.
                // This prevents the race condition where assistant message completes before tool_use arrives.
                console.log(`🔄 [STREAMING-FIX] ${message.type} message ${message.id} streaming=false - NOT clearing session streaming (wait for streaming_end)`);
                // Just update lastMessageTime to track activity, but keep streaming=true
                sessions = sessions.map(s =>
                  s.id === sessionId ? { ...s, lastMessageTime: Date.now() } : s
                );
              }
            }
            // If streaming is undefined, don't change the state
          
        if (message.type === 'error') {
              // Handle error messages - ALWAYS clear streaming and show to user
              console.log('[Store] Error message received:', message.error);
              sessions = sessions.map(s => {
                if (s.id === sessionId) {
                  // Calculate thinking time on error
                  let updatedAnalytics = s.analytics;
                  if (s.thinkingStartTime && updatedAnalytics) {
                    const thinkingDuration = Math.floor((Date.now() - s.thinkingStartTime) / 1000);
                    updatedAnalytics = {
                      ...updatedAnalytics,
                      thinkingTime: (updatedAnalytics.thinkingTime || 0) + thinkingDuration
                    };
                  }
                  // Add error as a system message so user sees it
                  const errorMessage = {
                    id: `error-${Date.now()}`,
                    type: 'system' as const,
                    subtype: 'error' as const,
                    message: { content: message.error || 'an error occurred' },
                    timestamp: Date.now()
                  };
                  return { 
                    ...s, 
                    streaming: false,
                    thinkingStartTime: undefined,
                    pendingToolIds: new Set(), // Clear pending tools on error
                    messages: (() => {
                      let updatedMessages = [...s.messages, errorMessage];
                      const MAX_MESSAGES = 500;
                      if (updatedMessages.length > MAX_MESSAGES) {
                        const removeCount = updatedMessages.length - MAX_MESSAGES;
                        updatedMessages = updatedMessages.slice(removeCount);
                      }
                      return updatedMessages;
                    })(),
                    analytics: updatedAnalytics
                  };
                }
                return s;
              });
              return { sessions };
            } else if (message.type === 'streaming_end') {
              // Special message to clear streaming state
              console.log('🏁 [Store] STREAMING_END received - clearing streaming state');
              sessions = sessions.map(s => {
                if (s.id === sessionId) {
                  // Calculate thinking time before clearing
                  let updatedAnalytics = s.analytics;
                  if (s.thinkingStartTime && updatedAnalytics) {
                    const thinkingDuration = Math.floor((Date.now() - s.thinkingStartTime) / 1000);
                    updatedAnalytics = {
                      ...updatedAnalytics,
                      thinkingTime: (updatedAnalytics.thinkingTime || 0) + thinkingDuration
                    };
                    console.log(`📊 [THINKING TIME] Streaming end - Added ${thinkingDuration}s, total: ${updatedAnalytics.thinkingTime}s`);
                  }
                  return {
                    ...s,
                    streaming: false,
                    thinkingStartTime: undefined,
                    analytics: updatedAnalytics
                  };
                }
                return s;
              });
              return { sessions };
            } else if (message.type === 'result') {
              console.log('📊 [STREAMING-FIX] Result message received:', {
                sessionId,
                messageType: message.type,
                isError: message.is_error,
                requiresCheckpointRestore: message.requiresCheckpointRestore,
                currentStreaming: sessions.find(s => s.id === sessionId)?.streaming
              });
              // CRITICAL: Check for error result FIRST - handle session resume failures
              if (message.is_error || message.requiresCheckpointRestore) {
                console.log('[Store] ❌ ERROR RESULT - Session resume failed, clearing streaming state', {
                  is_error: message.is_error,
                  requiresCheckpointRestore: message.requiresCheckpointRestore,
                  error: message.error
                });
                
                sessions = sessions.map(s => {
                  if (s.id === sessionId) {
                    return {
                      ...s,
                      streaming: false,
                      thinkingStartTime: undefined,
                      runningBash: false,
                      userBashRunning: false,
                      claudeSessionId: undefined // Clear invalid session ID so next message creates new session
                    };
                  }
                  return s;
                });
                
                // Add info message about the error
                if (message.error) {
                  const infoMessage = {
                    id: `info-${Date.now()}`,
                    type: 'system' as const,
                    subtype: 'info' as const,
                    message: { content: 'session not found - will create new session' },
                    timestamp: Date.now()
                  };
                  sessions = sessions.map(s => 
                    s.id === sessionId 
                      ? { ...s, messages: (() => {
                          let updatedMessages = [...s.messages, infoMessage];
                          const MAX_MESSAGES = 500;
                          if (updatedMessages.length > MAX_MESSAGES) {
                            const removeCount = updatedMessages.length - MAX_MESSAGES;
                            updatedMessages = updatedMessages.slice(removeCount);
                          }
                          return updatedMessages;
                        })() }
                      : s
                  );
                }
                
                return { sessions };
              }
              
              // Check if we still have pending tools
              const session = sessions.find(s => s.id === sessionId);
              
              if (session?.pendingToolIds && session.pendingToolIds.size > 0) {
                // Still have pending tools - keep streaming active
                console.log(`Result message received but ${session.pendingToolIds.size} tools still pending - keeping streaming state`);
                sessions = sessions.map(s => 
                  s.id === sessionId 
                    ? { 
                        ...s, 
                        // Keep streaming true while tools pending
                        runningBash: false,
                        userBashRunning: false
                      } 
                    : s
                );
              } else {
                // Normal result - streaming already cleared by streaming_end message
                console.log('🎯 [STREAMING-FIX] Normal result received (streaming already cleared):', {
                  sessionId,
                  subtype: message.subtype,
                  is_error: message.is_error,
                  result: message.result?.substring?.(0, 50),
                  sessionMessages: session?.messages.length || 0,
                  currentStreaming: session?.streaming
                });
                
                // Never clear claudeSessionId - keep it for session resumption
                // Claude CLI handles session management, we just track the ID
                // Don't clear streaming here - it's handled by streaming_end message
                // DON'T clear pendingToolIds here - let tool_result messages clear them
                // This fixes the bug where subagent tasks would lose their streaming state
                sessions = sessions.map(s => {
                  if (s.id === sessionId) {
                    console.log(`✅ [STREAMING-FIX] Result processed for session ${sessionId}, pendingTools: ${s.pendingToolIds?.size || 0}`);
                    return {
                      ...s,
                      // Don't clear streaming - handled by streaming_end
                      runningBash: false,
                      userBashRunning: false
                      // DON'T clear pendingToolIds - tool_result handles that
                      // Keep claudeSessionId for resumption
                    };
                  }
                  return s;
                });
              }
              
              return { sessions };
            } else if (message.type === 'system' && (message.subtype === 'interrupted' || message.subtype === 'error' || message.subtype === 'stream_end')) {
              // Check if we have a recent user message (within last 3 seconds)
              // If so, this is likely a followup during streaming, so keep streaming state
              const session = sessions.find(s => s.id === sessionId);
              const recentUserMessage = session?.messages
                .filter((m: any) =>
                  m.type === 'user' &&
                  m.timestamp &&
                  Date.now() - m.timestamp < 3000
                ).pop();
              
              if (recentUserMessage && message.subtype !== 'stream_end') {
                // Only keep streaming for interruptions when there's a recent user message
                // But always clear on stream_end
                console.log('Interruption detected with recent user message - keeping streaming state for followup');
                sessions = sessions.map(s => 
                  s.id === sessionId ? { ...s, runningBash: false, userBashRunning: false } : s
                );
              } else {
                // Clear streaming and bash running on interruption, error, or stream_end
                // BUT preserve streaming state if there are pending tools (subagent tasks still running)
                const session = sessions.find(s => s.id === sessionId);
                const hasPendingTools = session?.pendingToolIds && (session.pendingToolIds?.size ?? 0) > 0;

                if (hasPendingTools && message.subtype === 'stream_end') {
                  // CRITICAL FIX: Don't clear streaming if subagent tasks are still pending
                  console.log(`[Store] stream_end received but ${session?.pendingToolIds?.size ?? 0} tools still pending - keeping streaming=true`);
                  sessions = sessions.map(s =>
                    s.id === sessionId
                      ? { ...s, runningBash: false, userBashRunning: false }
                      : s
                  );
                } else {
                  console.log(`System message (${message.subtype}) received, clearing streaming and bash state`);
                  sessions = sessions.map(s => {
                    if (s.id === sessionId) {
                      // Calculate thinking time on stream end
                      let updatedAnalytics = s.analytics;
                      if (s.thinkingStartTime && updatedAnalytics) {
                        const thinkingDuration = Math.floor((Date.now() - s.thinkingStartTime) / 1000);
                        updatedAnalytics = {
                          ...updatedAnalytics,
                          thinkingTime: (updatedAnalytics.thinkingTime || 0) + thinkingDuration
                        };
                        console.log(`📊 [THINKING TIME] Stream end - Added ${thinkingDuration}s, total: ${updatedAnalytics.thinkingTime}s`);
                      }

                      // DON'T clear pendingToolIds on stream_end - let tool_result clear them
                      // Only clear on interrupted/error since user explicitly stopped
                      const shouldClearPendingTools = message.subtype === 'interrupted' || message.subtype === 'error';

                      // Process wrapper tokens on interrupt to update context usage
                      if (message.subtype === 'interrupted' && (message as any).wrapper?.tokens) {
                        const wrapperTokens = (message as any).wrapper.tokens;
                        console.log('📊 [INTERRUPT] Processing wrapper tokens:', wrapperTokens);

                        // Initialize analytics if not present (early interrupt on new conversation)
                        if (!updatedAnalytics) {
                          updatedAnalytics = {
                            tokens: { input: 0, output: 0, total: 0, cacheSize: 0, cacheCreation: 0, byModel: { opus: { input: 0, output: 0, total: 0 }, sonnet: { input: 0, output: 0, total: 0 } } },
                            cost: { total: 0, byModel: { opus: 0, sonnet: 0 } },
                            timing: { avgResponseTime: 0, totalTime: 0 },
                            contextWindow: { used: 0, limit: 200000, percentage: 0, remaining: 200000 },
                            requestCount: 0,
                            thinkingTime: 0
                          };
                        }

                        updatedAnalytics = {
                          ...updatedAnalytics,
                          tokens: {
                            ...updatedAnalytics.tokens,
                            total: wrapperTokens.total ?? updatedAnalytics.tokens.total,
                            input: wrapperTokens.input ?? updatedAnalytics.tokens.input,
                            output: wrapperTokens.output ?? updatedAnalytics.tokens.output,
                            cacheSize: wrapperTokens.cache_read ?? updatedAnalytics.tokens.cacheSize ?? 0,
                            cacheCreation: wrapperTokens.cache_creation ?? updatedAnalytics.tokens.cacheCreation ?? 0
                          }
                        };

                        // Update context window percentage
                        const limit = updatedAnalytics.contextWindow?.limit || 200000;
                        const used = wrapperTokens.total || 0;
                        updatedAnalytics.contextWindow = {
                          ...updatedAnalytics.contextWindow,
                          used,
                          limit,
                          percentage: limit > 0 ? Math.round((used / limit) * 100) : 0,
                          remaining: limit - used
                        };
                        console.log('📊 [INTERRUPT] Updated context:', updatedAnalytics.contextWindow);
                      }

                      // Trigger async fetch of session tokens from file (single source of truth)
                      // Also fetch on interrupt to get accurate context % from session file
                      if (message.subtype === 'stream_end' || message.subtype === 'interrupted') {
                        const claudeSessId = s.claudeSessionId;
                        const workDir = s.workingDirectory;
                        // Fire and forget - will update analytics when complete
                        fetchSessionTokensFromFile(sessionId, claudeSessId, workDir).then(tokens => {
                          if (tokens) {
                            // Update analytics with authoritative token data from session file
                            get().updateSessionAnalyticsFromFile(sessionId, tokens);
                          }
                        });
                      }

                      return {
                        ...s,
                        streaming: false,
                        thinkingStartTime: undefined,
                        runningBash: false,
                        userBashRunning: false,
                        analytics: updatedAnalytics,
                        pendingToolIds: shouldClearPendingTools ? new Set() : s.pendingToolIds
                      };
                    }
                    return s;
                  });
                }
              }
              return { sessions };
            } else if (message.type === 'tool_use') {
              // When we get a tool_use message, ensure streaming is active
              // This handles cases where tools are running (especially Task/agent tools)
              console.log('Tool use message received, ensuring streaming state is active');

              // Track if this is a Bash command
              const isBash = message.message?.name === 'Bash';
              if (isBash) {
                console.log('[Bash] Command started');
              }

              // Add tool ID to pending set
              const toolId = message.message?.id;
              sessions = sessions.map(s => {
                if (s.id === sessionId) {
                  const pendingTools = new Set(s.pendingToolIds || []);
                  if (toolId) {
                    pendingTools.add(toolId);
                    console.log(`[Store] Added tool ${toolId} to pending. Total pending: ${pendingTools.size}`);
                  }

                  // Capture file snapshot for rollback if present
                  let restorePoints = [...(s.restorePoints || [])];
                  let modifiedFiles = new Set(s.modifiedFiles || []);

                  if (message.fileSnapshot) {
                    const snapshot = message.fileSnapshot;
                    const toolName = message.message?.name || 'unknown';
                    const operation = toolName === 'Write' ? 'write' : toolName === 'MultiEdit' ? 'multiedit' : 'edit';
                    const editTimestamp = snapshot.timestamp || Date.now();
                    const editSessionId = snapshot.sessionId || s.id;

                    const fileSnapshot: FileSnapshot = {
                      path: snapshot.path,
                      content: message.message?.input?.content || message.message?.input?.new_string || '',
                      operation,
                      timestamp: editTimestamp,
                      messageIndex: s.messages.length, // Current position
                      originalContent: snapshot.originalContent,
                      isNewFile: snapshot.isNewFile || false,
                      mtime: snapshot.mtime, // For conflict detection
                      sessionId: editSessionId // Session that made this edit
                    };

                    // Create restore point for this file change
                    restorePoints.push({
                      messageIndex: s.messages.length,
                      timestamp: Date.now(),
                      fileSnapshots: [fileSnapshot],
                      description: `${operation} ${snapshot.path.split(/[/\\]/).pop()}`
                    });
                    // Limit restore points to prevent unbounded memory growth
                    if (restorePoints.length > MAX_RESTORE_POINTS_PER_SESSION) {
                      restorePoints = restorePoints.slice(-MAX_RESTORE_POINTS_PER_SESSION);
                    }
                    modifiedFiles.add(snapshot.path);
                    console.log(`📸 [Store] Captured file snapshot for rollback: ${snapshot.path} (mtime=${snapshot.mtime})`);

                    // Register file edit in global registry for cross-session conflict detection
                    // Do this async and don't block state update
                    if (window.__TAURI__) {
                      import('@tauri-apps/api/core').then(({ invoke }) => {
                        invoke('register_file_edit', {
                          path: snapshot.path,
                          sessionId: editSessionId,
                          timestamp: editTimestamp,
                          operation
                        }).catch(err => {
                          console.warn('[Store] Failed to register file edit:', err);
                        });
                      });
                    }
                  }

                  return {
                    ...s,
                    streaming: true,
                    runningBash: isBash ? true : s.runningBash,
                    pendingToolIds: pendingTools,
                    restorePoints,
                    modifiedFiles,
                    // Ensure thinkingStartTime is set if not already (safeguard for timer display)
                    thinkingStartTime: s.thinkingStartTime || Date.now(),
                  };
                }
                return s;
              });
            } else if (message.type === 'tool_result') {
              // Remove tool ID from pending set
              // streaming will be managed by assistant/result/stream_end messages
              const toolUseId = message.message?.tool_use_id;
              sessions = sessions.map(s => {
                if (s.id === sessionId) {
                  const pendingTools = new Set(s.pendingToolIds || []);
                  if (toolUseId && pendingTools.has(toolUseId)) {
                    pendingTools.delete(toolUseId);
                    console.log(`[Store] Removed tool ${toolUseId} from pending. Remaining: ${pendingTools.size}`);
                  }
                  return {
                    ...s,
                    runningBash: false,
                    pendingToolIds: pendingTools
                  };
                }
                return s;
              });
            }
            
            persistSessions(sessions); // Persist after any message update
            return { sessions };
          });
        });
        
        // Set up focus trigger listener (restores focus after bash commands)
        // Only enable for Windows - macOS handles focus better without intervention
        // CRITICAL: window.focus() on macOS disrupts webview's internal focus state
        // causing random focus loss even when the window appears focused
        if (navigator.platform.includes('Win')) {
          console.log('[Store] Setting up focus trigger listener (Windows only)');
          focusCleanup = claudeClient.onFocusTrigger(sessionId, () => {
            console.log('[Store] 🎯 Focus trigger received, restoring window focus');
            // Use Tauri command to restore focus
            if (window.__TAURI__) {
              import('@tauri-apps/api/core').then(({ invoke }) => {
                invoke('restore_window_focus').catch(console.warn);
              });
            }
            // Also try web-based focus restoration (Windows only)
            window.focus();
            // Focus the input if we have a reference (correct class name)
            const inputElement = document.querySelector('textarea.chat-input') as HTMLTextAreaElement;
            if (inputElement) {
              inputElement.focus();
            }
          });
        }
      } else {
        console.log('[Store] No claudeSessionId yet - will set up listener after spawn');
      }
      
      // Combined cleanup function
      const cleanup = () => {
        if (messageCleanup) messageCleanup();
        if (focusCleanup) focusCleanup();
        if (tempMessageCleanup) tempMessageCleanup();
        titleCleanup();
        errorCleanup();
      };
      
      // Store cleanup function (could be used later)
      activeSession.cleanup = cleanup;
      
      return sessionId;
    } catch (error) {
      // If Claude SDK initialization fails, update tab to error status
      console.error('Failed to initialize Claude SDK session:', error);
      set(state => ({
        sessions: state.sessions.map(s => 
          s.id === tempSessionId 
            ? { ...s, status: 'error' as const, updatedAt: new Date() }
            : s
        )
      }));
      throw error;
    }
    } catch (error) {
      console.error('Failed to create session:', error);
      throw error;
    }
  },
  
  setCurrentSession: async (sessionId: string) => {
    const state = get();
    const { currentSessionId: oldSessionId } = state;
    
    // Don't do anything if we're already on this session
    if (oldSessionId === sessionId) {
      console.log('[Store] Already on session:', sessionId);
      return;
    }
    
    console.log('[Store] Switching session from', oldSessionId, 'to', sessionId);
    
    // Simply update the current session ID without making server calls
    // Server reconnection will happen lazily when actually sending a message
    set({ currentSessionId: sessionId });
    localStorage.setItem('yurucode-current-session', sessionId);
  },
  
  sendMessage: async (content: string, bashMode?: boolean) => {
    const { currentSessionId } = get();
    console.log('[Store] sendMessage called:', { 
      sessionId: currentSessionId,
      contentLength: content?.length,
      contentType: typeof content
    });
    
    if (!currentSessionId) {
      console.error('[Store] Cannot send message: No active session');
      return;
    }
    
    // Don't add empty messages
    if (!content || (typeof content === 'string' && !content.trim())) {
      console.warn('[Store] Cannot send empty message');
      return;
    }

    // Detect manual /compact command and set compacting state for UI indicator
    if (content.trim() === '/compact') {
      console.log('[Store] 🗜️ Manual /compact command detected - setting compacting state');
      get().setCompacting(currentSessionId, true);
    }

    // Check if this session has pending auto-compact (compact on next user message)
    const sessionForCompact = get().sessions.find(s => s.id === currentSessionId);
    if (sessionForCompact?.compactionState?.pendingAutoCompact && !content.startsWith('/compact')) {
      // Double-check auto-compact is still enabled before executing
      if (get().autoCompactEnabled === false) {
        console.log('[Store] 🗜️ Pending auto-compact detected but auto-compact disabled - clearing flag');
        get().updateCompactionState(currentSessionId, { pendingAutoCompact: false });
      } else {
        console.log('[Store] 🗜️ Pending auto-compact detected - compacting before sending user message');
        // Import and execute auto compaction with the user's message
        const { compactionService } = await import('../services/compactionService');
        await compactionService.executeAutoCompaction(currentSessionId, content);
        // The compact result handler will send the user's message after completion
        return;
      }
    }

    // Check if this session was compacted and needs the summary prepended
    const session = get().sessions.find(s => s.id === currentSessionId);
    if (session?.wasCompacted && !session.claudeSessionId) {
      // Find the last compact result message
      const compactResult = [...session.messages].reverse().find(m => 
        m.type === 'result' && m.result?.includes('Conversation compacted successfully')
      );
      
      if (compactResult?.result) {
        console.log('[Store] 🗜️ Session was compacted - prepending summary to message');
        // Prepend the compact summary to the user's message
        content = `[Previous conversation context was compressed. Summary:]
${compactResult.result}

[Continuing with new message:]
${content}`;
        
        // Clear the wasCompacted flag after using it
        set(state => ({
          sessions: state.sessions.map(s => 
            s.id === currentSessionId ? { ...s, wasCompacted: false } : s
          )
        }));
      }
    }
    
    // Check if we need to reconnect to server (lazy reconnection)
    // Note: currentSessionId is guaranteed non-null here due to early return above
    let sessionToUse: string = currentSessionId!;
    const currentSession = get().sessions.find(s => s.id === currentSessionId);
    
    // Handle lazy reconnection for existing sessions
    if (currentSession && currentSession.status === 'active') {
      const state = get();
      const mapping = state.sessionMappings[currentSessionId];
      const claudeSessionId = currentSession.claudeSessionId || mapping?.claudeSessionId;
      
      // If we have a claudeSessionId but haven't connected to server yet, do it now
      if (claudeSessionId && !currentSession.claudeSessionId) {
        console.log(`[Store] Lazy reconnection: Session ${currentSessionId} has claudeSessionId ${claudeSessionId}, reconnecting...`);
        
        try {
          const result = await claudeClient.createSession(
            currentSession.name,
            currentSession.workingDirectory || '/',
            {
              sessionId: currentSessionId,
              claudeSessionId: claudeSessionId,
              messages: currentSession.messages || [],
              hasGeneratedTitle: currentSession.claudeTitle ? true : false
            }
          );
          
          console.log(`[Store] Session ${currentSessionId} reconnected successfully`);
          
          // Update session with claudeSessionId
          set(state => ({
            sessions: state.sessions.map(s => 
              s.id === currentSessionId 
                ? { ...s, claudeSessionId: claudeSessionId }
                : s
            )
          }));
        } catch (error) {
          console.error(`[Store] Failed to reconnect session ${currentSessionId}:`, error);
          // Continue anyway, will create new session
        }
      }
    }
    
    // Wait for session to be active if it's pending
    // This polling loop waits for a pending/temporary session to transition to 'active' status
    // before allowing messages to be sent. This occurs when the UI creates a temporary session
    // that gets replaced with a real Claude session from the backend.
    if (currentSession?.status === 'pending') {
      console.log('[Store] Session is pending, waiting for activation...');
      const maxRetries = Math.ceil(PENDING_SESSION_TIMEOUT_MS / PENDING_SESSION_CHECK_INTERVAL_MS);
      let retries = maxRetries;
      while (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, PENDING_SESSION_CHECK_INTERVAL_MS));
        // Check if currentSessionId has been updated (temp replaced with real)
        const newSessionId = get().currentSessionId;
        const session = get().sessions.find(s => s.id === newSessionId);
        if (session?.status === 'active' && newSessionId) {
          console.log('[Store] Session is now active, proceeding with message');
          sessionToUse = newSessionId;
          break;
        }
        retries--;
      }
      const finalSessionId = get().currentSessionId;
      const finalSession = get().sessions.find(s => s.id === finalSessionId);
      if (finalSession?.status !== 'active' || !finalSessionId) {
        console.error(`[Store] Session failed to activate after waiting ${PENDING_SESSION_TIMEOUT_MS}ms`);
        return;
      }
      sessionToUse = finalSessionId;
    }
    
    // Add user message immediately with unique ID
    const userMessage = {
      id: `user-${Date.now()}-${Math.random()}`,
      type: 'user',
      message: { content },
      timestamp: Date.now(),
      bashMode: bashMode || false
    };
    
    console.log('[Store] Adding user message to session:', userMessage.id);
    
    // Only set streaming to true if it's not already streaming
    // This prevents the thinking indicator from disappearing when sending followup messages
    // START THINKING TIME when user sends a message
    const now = Date.now();
    set(state => ({
      sessions: state.sessions.map(s => {
        if (s.id === sessionToUse) {
          // When already streaming (followup during active response), keep streaming true
          // When not streaming (new conversation), set streaming to true
          const wasStreaming = s.streaming;
          console.log('[Store] Current streaming state:', wasStreaming, 'Will set streaming to true for followup');
          console.log(`[THINKING TIME] Starting thinking timer at ${now} when user sends message`);
          
          const updates: any = { 
            messages: (() => {
              let updatedMessages = [...s.messages, userMessage];
              const MAX_MESSAGES = 500;
              if (updatedMessages.length > MAX_MESSAGES) {
                const removeCount = updatedMessages.length - MAX_MESSAGES;
                updatedMessages = updatedMessages.slice(removeCount);
              }
              return updatedMessages;
            })()
          };
          
          // Handle thinking time accumulation
          let updatedAnalytics = s.analytics;
          if (wasStreaming && s.thinkingStartTime && updatedAnalytics) {
            // If already streaming, accumulate the previous thinking time before starting new timer
            const previousThinkingDuration = Math.floor((now - s.thinkingStartTime) / 1000);
            updatedAnalytics = {
              ...updatedAnalytics,
              thinkingTime: (updatedAnalytics.thinkingTime || 0) + previousThinkingDuration
            };
            console.log(`📊 [THINKING TIME] Accumulated ${previousThinkingDuration}s from followup, total: ${updatedAnalytics.thinkingTime}s`);
          }
          
          // Always start new thinking timer when user sends message
          updates.thinkingStartTime = now;
          updates.analytics = updatedAnalytics;
          console.log(`📊 [THINKING TIME] Starting thinking timer for session ${s.id} at ${now}`);
          
          // ALWAYS set streaming to true when sending a message (even during followup)
          // This ensures the UI shows streaming state after interrupting and sending a new message
          // Only skip for bash commands which don't need thinking indicator
          const isBashCommand = isBashPrefix(content);
          updates.streaming = !isBashCommand;
          if (!isBashCommand && !updates.streaming) {
            console.warn('[Store] BUG: streaming should be true after sending message!');
            updates.streaming = true;
          }
          
          return { ...s, ...updates };
        }
        return s;
      })
    }));
    
    try {
      console.log('[Store] About to send message, checking connection state...');
      console.log('[Store] claudeClient isConnected:', claudeClient.isConnected());
      console.log('[Store] sessionToUse:', sessionToUse);
      console.log('[Store] content length:', content.length);
      
      // CRITICAL: Ensure claudeClient is connected before proceeding
      if (!claudeClient.isConnected()) {
        console.error('[Store] Client not connected! Waiting for auto-reconnection...');
        // Wait for auto-reconnection (client handles this internally)
        let retries = 10;
        while (retries > 0 && !claudeClient.isConnected()) {
          await new Promise(resolve => setTimeout(resolve, 500));
          retries--;
        }
        if (!claudeClient.isConnected()) {
          throw new Error('Unable to connect to server');
        }
      }
      
      // Send message to Claude Code Server (REAL SDK) with selected model and auto-generate title setting
      const { selectedModel, autoGenerateTitle } = get();
      console.log('[Store] About to call claudeClient.sendMessage...');
      console.log('[Store] Sending to Claude with model:', selectedModel, 'sessionId:', sessionToUse, 'autoGenerateTitle:', autoGenerateTitle);
      
      try {
        await claudeClient.sendMessage(sessionToUse, content, selectedModel, autoGenerateTitle);
        console.log('[Store] claudeClient.sendMessage completed successfully');
      } catch (sendError) {
        console.error('[Store] claudeClient.sendMessage failed:', sendError);
        throw sendError;
      }
      
      // Messages are handled by the onMessage listener
      // The streaming state will be cleared when we receive the result message
      console.log('[Store] Message sent successfully, waiting for response...');
    } catch (error: unknown) {
      const err = error as Error;
      console.error('[Store] Error sending message:', error);
      console.error('[Store] Error stack:', err?.stack);

      // Add error message to chat and reset streaming state
      set(state => ({
        sessions: state.sessions.map(s =>
          s.id === sessionToUse
            ? {
                ...s,
                streaming: false,
                thinkingStartTime: undefined,
                messages: (() => {
                  const newMessage = {
                    type: 'system',
                    subtype: 'error',
                    message: `Failed to send message: ${err?.message || 'Unknown error'}`,
                    timestamp: Date.now()
                  };
                  let updatedMessages = [...s.messages, newMessage];
                  const MAX_MESSAGES = 500;
                  if (updatedMessages.length > MAX_MESSAGES) {
                    const removeCount = updatedMessages.length - MAX_MESSAGES;
                    updatedMessages = updatedMessages.slice(removeCount);
                  }
                  return updatedMessages;
                })()
              }
            : s
        )
      }));
    }
  },
  
  resumeSession: async (sessionId: string) => {
    const state = get();
    const session = state.sessions.find(s => s.id === sessionId);
    if (!session) {
      // Try to load from server if not in local state
      await get().loadPersistedSession(sessionId);
      return;
    }
    
    // Simply switch to the session without making server calls
    // Server reconnection will happen lazily when actually sending a message
    set({ currentSessionId: sessionId });
    set({ persistedSessionId: sessionId });
    localStorage.setItem('yurucode-current-session', sessionId);
    
    // Save tabs if remember tabs is enabled (to track active tab)
    if (state.rememberTabs) {
      state.saveTabs();
    }
    
    // Notify server of directory change if needed
    if (session.workingDirectory) {
      await claudeClient.setWorkingDirectory(sessionId, session.workingDirectory);
    }
  },
  
  reconnectSession: (sessionId: string, claudeSessionId: string) => {
    // Set up message listeners for a restored session
    // This doesn't create a new claude process, just reconnects the message handlers
    console.log(`[Store] Reconnecting session ${sessionId} with claudeSessionId ${claudeSessionId}`);
    
    // Initialize cleanup functions
    let focusCleanup: (() => void) | null = null;
    
    // Listen for title updates
    const titleCleanup = claudeClient.onTitle(sessionId, (title: string) => {
      console.log('[Store] Received title for reconnected session:', sessionId, title);
      set(state => ({
        sessions: state.sessions.map(s => {
          const isTabTitle = s.claudeTitle?.match(/^tab \d+$/);
          if (s.id === sessionId && !s.userRenamed && isTabTitle) {
            return { ...s, claudeTitle: title };
          }
          return s;
        })
      }));
    });

    // Set up error handler for resumed session
    const errorCleanup = claudeClient.onError(sessionId, (error) => {
      console.error('[Store] Error received for resumed session:', sessionId, error);
      
      set(state => ({
        ...state,
        sessions: state.sessions.map(s => 
          s.id === sessionId 
            ? {
                ...s,
                messages: [...s.messages, {
                  id: `error-${Date.now()}`,
                  type: 'error',
                  content: error.message,
                  timestamp: error.timestamp || Date.now(),
                  errorType: error.type
                }],
                streaming: false,
                status: 'active' as const
              }
            : s
        )
      }));
    });
    
    // Listen for messages
    const messageCleanup = claudeClient.onMessage(sessionId, (message) => {
      console.log('[Store] Message received on resumed session:', sessionId, 'type:', message.type, 'result:', message.result?.substring?.(0, 50));

      // Skip user messages from server - they should only be created locally
      if (message.type === 'user') {
        console.warn('[Store] Ignoring user message from server (resumed session)');
        return;
      }

      // Update status to active if paused
      const currentSession = get().sessions.find(s => s.id === sessionId);
      if (currentSession?.status === 'paused') {
        set(state => ({
          sessions: state.sessions.map(s =>
            s.id === sessionId ? { ...s, status: 'active' as const } : s
          )
        }));
      }

      // CRITICAL FIX: Route through addMessageToSession to handle analytics, tokens, cost, duration_ms
      // Previously bypassed, causing metadata (duration, tokens, cost, model) not to display for new messages
      get().addMessageToSession(sessionId, message);

      // Handle streaming state separately
      // CRITICAL: Don't clear streaming when individual messages complete!
      // Only set streaming=true for assistant, only clear on stream_end/interrupted/error (NOT result).
      set(state => {
        let sessions = state.sessions;

        if (message.type === 'assistant' && message.streaming === true) {
          sessions = sessions.map(s =>
            s.id === sessionId ? { ...s, streaming: true } : s
          );
        } else if (message.type === 'system' && (message.subtype === 'interrupted' || message.subtype === 'error' || message.subtype === 'stream_end')) {
          sessions = sessions.map(s =>
            s.id === sessionId ? { ...s, streaming: false, runningBash: false, userBashRunning: false } : s
          );
        }

        persistSessions(sessions);
        return { sessions };
      });
    });
    
    // Set up focus trigger listener (restores focus after bash commands)
    // Only enable for Windows - macOS handles focus better without intervention
    // CRITICAL: window.focus() on macOS disrupts webview's internal focus state
    // causing random focus loss even when the window appears focused
    if (navigator.platform.includes('Win')) {
      console.log('[Store] Setting up focus trigger listener (Windows only, reconnect)');
      focusCleanup = claudeClient.onFocusTrigger(sessionId, () => {
        console.log('[Store] 🎯 Focus trigger received, restoring window focus');
        // Use Tauri command to restore focus
        if (window.__TAURI__) {
          import('@tauri-apps/api/core').then(({ invoke }) => {
            invoke('restore_window_focus').catch(console.warn);
          });
        }
        // Also try web-based focus restoration (Windows only)
        window.focus();
        // Focus the input if we have a reference (correct class name)
        const inputElement = document.querySelector('textarea.chat-input') as HTMLTextAreaElement;
        if (inputElement) {
          inputElement.focus();
        }
      });
    }

    // Store cleanup function
    const session = get().sessions.find(s => s.id === sessionId);
    if (session) {
      (session as any).cleanup = () => {
        if (messageCleanup) messageCleanup();
        if (focusCleanup) focusCleanup();
        titleCleanup();
        errorCleanup();
      };
    }
  },
  
  loadSessionHistory: async (sessionId: string) => {
    set({ isLoadingHistory: true });
    try {
      const history = await claudeClient.getSessionHistory(sessionId);
      if (history.messages) {
        set(state => ({
          sessions: state.sessions.map(s => 
            s.id === sessionId 
              ? { ...s, messages: history.messages, updatedAt: new Date() }
              : s
          ),
          isLoadingHistory: false
        }));
      }
    } catch (error) {
      console.error('Failed to load session history:', error);
      set({ isLoadingHistory: false });
    }
  },
  
  listAvailableSessions: async () => {
    try {
      const sessions = await claudeClient.listSessions();
      set({ availableSessions: sessions });
    } catch (error) {
      console.error('Failed to list sessions:', error);
    }
  },
  
  loadPersistedSession: async (sessionId: string) => {
    set({ isLoadingHistory: true });
    try {
      // Get home directory for resumed session
      let workingDirectory = '/';
      if (window.__TAURI__) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          workingDirectory = await invoke<string>('get_home_directory');
        } catch (err) {
          const isWindows = navigator.platform.toLowerCase().includes('win');
          workingDirectory = isWindows ? 'C:\\Users\\' : '/Users';
        }
      }
      
      // CRITICAL FIX: Check for stored claudeSessionId in mappings
      const state = get();
      const mapping = state.sessionMappings[sessionId];
      const claudeSessionId = mapping?.claudeSessionId || null;
      
      if (claudeSessionId) {
        console.log(`[Store] Resuming session ${sessionId} with stored claudeSessionId: ${claudeSessionId}`);
      }
      
      // Create/resume session with existing ID and claudeSessionId
      const result = await claudeClient.createSession('resumed session', workingDirectory, {
        sessionId,
        claudeSessionId,
        messages: [] // Will be populated from server if session exists
      });
      
      const messages = result.messages || [];
      workingDirectory = result.workingDirectory || workingDirectory;

      // Extract usage data from server response (context snapshot, not accumulated)
      const serverUsage = result.usage || {};
      const contextTokens = serverUsage.totalContextTokens || 0;
      const inputTokens = serverUsage.inputTokens || 0;
      const outputTokens = serverUsage.outputTokens || 0;
      const cacheReadTokens = serverUsage.cacheReadTokens || 0;
      const cacheCreationTokens = serverUsage.cacheCreationTokens || 0;
      const contextPercentage = (contextTokens / 200000) * 100;

      console.log('[Store] Resume session usage from server:', {
        contextTokens,
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheCreationTokens,
        contextPercentage: contextPercentage.toFixed(2) + '%'
      });

      const session: Session = {
        id: sessionId,
        name: `resumed session`,
        status: 'active' as const,
        messages,
        workingDirectory,
        createdAt: new Date(),
        updatedAt: new Date(),
        // Initialize analytics with context data from server
        analytics: {
          totalMessages: messages.length,
          userMessages: messages.filter((m: { type?: string }) => m.type === 'user').length,
          assistantMessages: messages.filter((m: { type?: string }) => m.type === 'assistant').length,
          toolUses: messages.filter((m: { type?: string }) => m.type === 'tool_use').length,
          systemMessages: messages.filter((m: { type?: string }) => m.type === 'system').length,
          tokens: {
            input: inputTokens,
            output: outputTokens,
            total: contextTokens,
            cacheSize: cacheReadTokens,
            cacheCreation: cacheCreationTokens,
            cacheRead: cacheReadTokens,
            conversationTokens: contextTokens - cacheReadTokens,
            systemTokens: 0,
            average: messages.length > 0 ? Math.ceil(contextTokens / messages.length) : 0,
            byModel: {
              opus: { input: 0, output: 0, total: 0 },
              sonnet: { input: 0, output: 0, total: 0 }
            },
            breakdown: { user: 0, assistant: outputTokens }
          },
          cost: { total: 0, byModel: { opus: 0, sonnet: 0 } },
          duration: 0,
          lastActivity: new Date(),
          thinkingTime: 0,
          responseTime: 0,
          contextWindow: {
            used: contextTokens,
            limit: 200000,
            percentage: contextPercentage,
            remaining: Math.max(0, 200000 - contextTokens)
          },
          model: get().selectedModel || DEFAULT_MODEL_ID
        }
      };

      // Listen for title updates
      const titleCleanup = claudeClient.onTitle(sessionId, (title: string) => {
        console.log('[Store] Received title for resumed session:', sessionId, title);
        set(state => ({
          sessions: state.sessions.map(s => {
            const isTabTitle = s.claudeTitle?.match(/^tab \d+$/);
            if (s.id === sessionId && !s.userRenamed && isTabTitle) {
              return { ...s, claudeTitle: title };
            }
            return s;
          })
        }));
      });

      // Set up error handler for loaded session
      const errorCleanup = claudeClient.onError(sessionId, (error) => {
        console.error('[Store] Error received for loaded session:', sessionId, error);
        
        set(state => ({
          ...state,
          sessions: state.sessions.map(s => 
            s.id === sessionId 
              ? {
                  ...s,
                  messages: (() => {
                    const newMessage = {
                    id: `error-${Date.now()}`,
                    type: 'error',
                    content: error.message,
                    timestamp: error.timestamp || Date.now(),
                    errorType: error.type
                  };
                    let updatedMessages = [...s.messages, newMessage];
                    const MAX_MESSAGES = 500;
                    if (updatedMessages.length > MAX_MESSAGES) {
                      const removeCount = updatedMessages.length - MAX_MESSAGES;
                      updatedMessages = updatedMessages.slice(removeCount);
                    }
                    return updatedMessages;
                  })(),
                  streaming: false
                }
              : s
          )
        }));
      });
      
      // Set up message listener
      const messageCleanup = claudeClient.onMessage(sessionId, (message) => {
        set(state => {
          let sessions = state.sessions.map(s => {
            if (s.id !== sessionId) return s;
            
            const existingMessages = [...s.messages];
            
            if (message.type === 'user') {
              console.warn('Ignoring user message from server');
              return s;
            }
            
            if (message.id) {
              const existingIndex = existingMessages.findIndex(m => m.id === message.id);
              if (existingIndex >= 0) {
                existingMessages[existingIndex] = message;
              } else {
                existingMessages.push(message);
              }
            } else {
              // Fast hash-based duplicate check
              const newHash = getCachedHash(message);
              const isDuplicate = existingMessages.some(m =>
                m.type === message.type && getCachedHash(m) === newHash
              );
              if (!isDuplicate) {
                existingMessages.push(message);
              }
            }

            // Extract title from first assistant message
            if (message.type === 'assistant' && s.claudeTitle === 'new session' && message.message?.content) {
              const content = typeof message.message.content === 'string' 
                ? message.message.content 
                : '';
              console.log('[Title] Assistant message received, extracting title from:', content.substring(0, 100));
              
              if (content && content.length > 3) {
                // Take first line, remove emojis, max 50 chars
                let title = content.split('\n')[0]
                  .replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '')
                  .replace(/^\W+/, '')
                  .replace(/\s+/g, ' ')
                  .trim()
                  .substring(0, 50);
                
                if (title && title.length > 3) {
                  s.claudeTitle = title.toLowerCase();
                  console.log('[Title] Updated session title to:', s.claudeTitle);
                }
              }
            }
            
            return {
              ...s,
              messages: existingMessages,
              updatedAt: new Date(),
              // Force React re-render by updating a counter (fixes bash output not showing)
              messageUpdateCounter: (s.messageUpdateCounter || 0) + 1
            };
          });

          if (message.type === 'assistant') {
            // Extract title from first assistant message if not already set
            sessions = sessions.map(s => {
              if (s.id === sessionId) {
                // CRITICAL: Only set streaming=true, don't clear on false (wait for stream_end/result)
                let updates: any = message.streaming === true ? { streaming: true } : {};

                // Extract title from first assistant message
                if (!s.claudeTitle && message.message?.content) {
                  const content = typeof message.message.content === 'string' 
                    ? message.message.content 
                    : '';
                  console.log('[Title] Checking for title extraction:', { 
                    hasContent: !!content, 
                    contentPreview: content.substring(0, 100),
                    sessionId 
                  });
                  if (content) {
                    // Extract first line or sentence as title (max 60 chars)
                    const firstLine = content.split('\n')[0].trim();
                    let title = firstLine;
                    
                    // Find end of first sentence
                    const periodIndex = firstLine.indexOf('.');
                    const exclamIndex = firstLine.indexOf('!');
                    const colonIndex = firstLine.indexOf(':');
                    
                    const endIndex = Math.min(
                      ...[periodIndex, exclamIndex, colonIndex, 60].filter(i => i > 0)
                    );
                    
                    if (endIndex < firstLine.length) {
                      title = firstLine.substring(0, endIndex);
                    }
                    
                    // Remove emojis and special characters
                    title = title
                      .replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '')
                      .replace(/^\W+/, '') // Remove leading non-word chars
                      .replace(/\s+/g, ' ')
                      .trim()
                      .substring(0, 50); // Max 50 chars for tab
                    
                    if (title && title.length > 3) {
                      updates.claudeTitle = title.toLowerCase(); // Keep lowercase
                      console.log('[Title] Extracted title:', updates.claudeTitle);
                    }
                  }
                }
                
                return { ...s, ...updates };
              }
              return s;
            });
          } else if (message.type === 'system' && (message.subtype === 'interrupted' || message.subtype === 'error' || message.subtype === 'stream_end')) {
            // Don't clear streaming on result - wait for streaming_end
            sessions = sessions.map(s =>
              s.id === sessionId ? { ...s, streaming: false, runningBash: false, userBashRunning: false } : s
            );
          }

          return { sessions };
        });
      });

      // Combined cleanup function
      const cleanup = () => {
        messageCleanup();
        titleCleanup();
        errorCleanup();
      };
      
      session.cleanup = cleanup;
      
      set(state => ({
        sessions: [...state.sessions.filter(s => s.id !== sessionId), session],
        currentSessionId: sessionId,
        persistedSessionId: sessionId,
        isLoadingHistory: false
      }));
    } catch (error) {
      console.error('Failed to load persisted session:', error);
      set({ isLoadingHistory: false });
    }
  },
  
  pauseSession: (sessionId: string) => {
    // Update local state
    set(state => ({
      sessions: state.sessions.map(s => 
        s.id === sessionId ? { ...s, status: 'paused' as const } : s
      )
    }));
  },
  
  deleteSession: (sessionId: string) => {
    // Clean up any listeners
    const session = get().sessions.find(s => s.id === sessionId);
    if ((session as any)?.cleanup) {
      (session as any).cleanup();
    }
    // Clean up deferred spawn cleanup if it exists
    if ((session as any)?._deferredCleanup) {
      (session as any)._deferredCleanup();
    }

    // Clear session edits from global registry to prevent orphan entries
    invoke('clear_session_edits', { sessionId }).catch(error => {
      console.error('Failed to clear session edits from registry:', error);
    });

    set(state => {
      const newSessions = state.sessions.filter(s => s.id !== sessionId);
      let newCurrentId = state.currentSessionId;

      // Clean up session mappings to prevent memory leak
      const newSessionMappings = { ...state.sessionMappings };
      delete newSessionMappings[sessionId];

      // If we're deleting the current session, switch to another one
      if (state.currentSessionId === sessionId) {
        if (newSessions.length > 0) {
          // Find the index of the deleted session
          const deletedIndex = state.sessions.findIndex(s => s.id === sessionId);
          // Try to switch to the session at the same index, or the last one
          const newIndex = Math.min(deletedIndex, newSessions.length - 1);
          newCurrentId = newSessions[newIndex]?.id || null;
        } else {
          newCurrentId = null;
        }
      }

      persistSessions(newSessions); // Persist after deletion

      // Save tabs if remember tabs is enabled
      const storeState = get();
      if (storeState.rememberTabs) {
        storeState.saveTabs();
      }

      if (newCurrentId) {
        localStorage.setItem('yurucode-current-session', newCurrentId);
      } else {
        localStorage.removeItem('yurucode-current-session');
      }
      return {
        sessions: newSessions,
        currentSessionId: newCurrentId,
        sessionMappings: newSessionMappings
      };
    });
  },
  
  deleteAllSessions: () => {
    // Clean up all listeners
    const sessions = get().sessions;
    sessions.forEach(session => {
      if ((session as any)?.cleanup) {
        (session as any).cleanup();
      }
    });
    set({
      sessions: [],
      currentSessionId: null,
      streamingMessage: ''
    });
    localStorage.removeItem('yurucode-sessions');
    localStorage.removeItem('yurucode-current-session');
    
    // Clear saved tabs when deleting all sessions
    const storeState = get();
    if (storeState.rememberTabs) {
      localStorage.removeItem('yurucode-saved-tabs');
      set({ savedTabs: [] });
    }
  },
  
  reorderSessions: (fromIndex: number, toIndex: number) => {
    set(state => {
      const newSessions = [...state.sessions];
      const [movedSession] = newSessions.splice(fromIndex, 1);
      newSessions.splice(toIndex, 0, movedSession);
      return { sessions: newSessions };
    });
    
    // Save tabs if remember tabs is enabled
    const storeState = get();
    if (storeState.rememberTabs) {
      storeState.saveTabs();
    }
  },
  
  renameSession: (sessionId: string, newTitle: string) => {
    set(state => ({
      sessions: state.sessions.map(s =>
        s.id === sessionId
          ? {
              ...s,
              claudeTitle: newTitle.trim().toLowerCase(),
              userRenamed: true // Mark as user renamed to skip auto title
            }
          : s
      )
    }));

    // Save title to localStorage for persistence
    const state = get();
    const session = state.sessions.find(s => s.id === sessionId);

    // Save tabs if remember tabs is enabled
    if (state.rememberTabs) {
      state.saveTabs();
    }
    if (session && session.claudeSessionId) {
      localStorage.setItem(`session-title-${session.claudeSessionId}`, newTitle.trim().toLowerCase());
    }

    // Update the session mapping with new name
    if (session && session.claudeSessionId) {
      state.updateSessionMapping(sessionId, session.claudeSessionId, {
        name: newTitle.trim().toLowerCase(),
        projectPath: session.workingDirectory
      });
    }

    console.log('[Store] Session renamed:', sessionId, newTitle);
  },

  forkSession: async (sessionId: string) => {
    const { sessions, createSession } = get();
    const sourceSession = sessions.find(s => s.id === sessionId);

    if (!sourceSession) {
      console.error('[Store] Cannot fork: session not found', sessionId);
      return undefined;
    }

    console.log('[Store] Forking session:', sessionId);

    // Create a new session in the same working directory
    const newSessionId = await createSession(undefined, sourceSession.workingDirectory);

    if (!newSessionId) {
      console.error('[Store] Failed to create forked session');
      return undefined;
    }

    // Copy messages from source session to new session
    const messagesToCopy = sourceSession.messages.map(msg => ({ ...msg }));

    // Update the new session with copied messages and metadata
    set(state => ({
      sessions: state.sessions.map(s => {
        if (s.id === newSessionId) {
          const forkedTitle = sourceSession.claudeTitle
            ? `${sourceSession.claudeTitle} (fork)`
            : 'forked session';
          return {
            ...s,
            messages: messagesToCopy,
            claudeTitle: forkedTitle,
            analytics: {
              ...s.analytics,
              totalMessages: messagesToCopy.length,
              userMessages: messagesToCopy.filter(m => m.type === 'user').length,
              assistantMessages: messagesToCopy.filter(m => m.type === 'assistant').length
            }
          };
        }
        return s;
      })
    }));

    console.log('[Store] Session forked successfully:', newSessionId);
    return newSessionId;
  },

  interruptSession: async (targetSessionId?: string) => {
    const { currentSessionId, sessions } = get();
    // Use explicit sessionId if provided, otherwise use currentSessionId
    // This fixes the race condition when closing tabs - we need to interrupt the specific session
    const sessionIdToInterrupt = targetSessionId || currentSessionId;
    const sessionToInterrupt = sessions.find(s => s.id === sessionIdToInterrupt);

    console.log(`⛔ [Store] interruptSession called for ${sessionIdToInterrupt} (explicit: ${!!targetSessionId})`);

    // Capture pending compact message before clearing state (to restore to input)
    const pendingCompactMessage = sessionToInterrupt?.compactionState?.pendingAutoCompactMessage;
    if (pendingCompactMessage) {
      console.log(`⛔ [Store] Compaction interrupted - will restore message to input: "${pendingCompactMessage.slice(0, 50)}..."`);
      // Emit event so UI can restore message to input
      window.dispatchEvent(new CustomEvent('yurucode-restore-input', {
        detail: { sessionId: sessionIdToInterrupt, message: pendingCompactMessage }
      }));
      // Also clear from wrapperIntegration to prevent followup being sent
      import('../services/wrapperIntegration').then(({ clearAutoCompactMessage }) => {
        clearAutoCompactMessage(sessionIdToInterrupt!);
      });
    }

    // Only interrupt if session exists and is actually streaming
    if (sessionIdToInterrupt && sessionToInterrupt?.streaming) {
      // Immediately set streaming and runningBash to false to prevent double calls
      set(state => ({
        sessions: state.sessions.map(s => {
          if (s.id === sessionIdToInterrupt) {
            // Calculate thinking time before clearing streaming state
            let updatedAnalytics = s.analytics;
            if (s.thinkingStartTime && updatedAnalytics) {
              const thinkingDuration = Math.floor((Date.now() - s.thinkingStartTime) / 1000);
              updatedAnalytics = {
                ...updatedAnalytics,
                thinkingTime: (updatedAnalytics.thinkingTime || 0) + thinkingDuration
              };
              console.log(`📊 [THINKING TIME] Interrupt - Added ${thinkingDuration}s, total: ${updatedAnalytics.thinkingTime}s`);
            }

            return {
              ...s,
              streaming: false,
              runningBash: false,
              userBashRunning: false,
              thinkingStartTime: undefined,
              pendingToolIds: new Set(), // Clear pending tools on interrupt
              analytics: updatedAnalytics,
              // Clear compaction state on interrupt (message already captured above)
              // Always clear isCompacting on interrupt - handles both auto and manual /compact
              compactionState: {
                ...s.compactionState,
                isCompacting: false,
                pendingAutoCompact: false,
                pendingAutoCompactMessage: undefined
              }
              // Keep claudeSessionId to maintain conversation context
            };
          }
          return s;
        })
      }));

      try {
        await claudeClient.interrupt(sessionIdToInterrupt);
        console.log(`✅ [Store] Session ${sessionIdToInterrupt} interrupted successfully`);

        // Don't add interrupt message here - server already sends it
        // IMPORTANT: Keep claudeSessionId intact to allow resume after interrupt
        set(state => ({
          sessions: state.sessions,  // Don't modify sessions here - keep claudeSessionId for resume
          streamingMessage: ''
        }));
      } catch (error) {
        console.error(`❌ [Store] Failed to interrupt session ${sessionIdToInterrupt}:`, error);
        // Still stop streaming indicator even if interrupt fails
        set(state => ({
          sessions: state.sessions.map(s => {
            if (s.id === sessionIdToInterrupt) {
              // Calculate thinking time even if interrupt fails
              let updatedAnalytics = s.analytics;
              if (s.thinkingStartTime && updatedAnalytics) {
                const thinkingDuration = Math.floor((Date.now() - s.thinkingStartTime) / 1000);
                updatedAnalytics = {
                  ...updatedAnalytics,
                  thinkingTime: (updatedAnalytics.thinkingTime || 0) + thinkingDuration
                };
                console.log(`📊 [THINKING TIME] Interrupt failed - Added ${thinkingDuration}s, total: ${updatedAnalytics.thinkingTime}s`);
              }
              return {
                ...s,
                streaming: false,
                thinkingStartTime: undefined,
                analytics: updatedAnalytics
              };
            }
            return s;
          }),
          streamingMessage: ''
        }));
      }
    } else {
      console.log(`⚠️ [Store] Session ${sessionIdToInterrupt} not streaming or not found, skipping interrupt`);
    }
  },
  
  clearContext: async (sessionId: string) => {
    console.log(`🧹 [Store] clearContext called for session ${sessionId}`);

    // First interrupt streaming if active
    const state = get();
    const session = state.sessions.find(s => s.id === sessionId);
    if (session?.streaming) {
      console.log(`🧹 [Store] Session is streaming, interrupting first`);
      await state.interruptSession(sessionId);  // Pass explicit session ID
    }
    
    // Clear local messages and reset analytics
    set(state => {
      const session = state.sessions.find(s => s.id === sessionId);
      if (session) {
        console.log(`🧹 [Store] Current analytics before clear:`, session.analytics);
        console.log(`🧹 [Store] Current messages count: ${session.messages.length}`);
        console.log(`🧹 [Store] Current claudeSessionId: ${session.claudeSessionId}`);
      }
      
      // Get the next tab number (like creating a new tab)
      const tabNumber = (() => {
        // Find the maximum tab number and add 1
        const tabNumbers = state.sessions
          .map(s => {
            const match = s.claudeTitle?.match(/^tab (\d+)$/);
            return match ? parseInt(match[1]) : 0;
          })
          .filter(n => n > 0);

        // If no numbered tabs exist (all renamed), start at 1
        return tabNumbers.length > 0 ? Math.max(...tabNumbers) + 1 : 1;
      })();
      
      return {
        sessions: state.sessions.map(s => 
          s.id === sessionId 
            ? {
                ...s,
                messages: [], // Clear ALL messages - don't keep any
                claudeSessionId: undefined, // Clear Claude session to start fresh
                claudeTitle: s.userRenamed ? s.claudeTitle : `tab ${tabNumber}`, // Keep custom titles, reset default ones
                originalTabNumber: tabNumber, // Update original tab number for future clears
                pendingToolIds: new Set(), // Clear pending tools
                streaming: false, // Stop streaming
                wasCompacted: false, // Reset compacted flag
                compactionState: undefined, // Reset compaction state (clears pendingAutoCompact flag)
              analytics: {
                totalMessages: 0,
                userMessages: 0,
                assistantMessages: 0,
                toolUses: 0,
                systemMessages: 0,
                tokens: { 
                  input: 0, 
                  output: 0, 
                  total: 0,
                  cacheSize: 0,
                  cacheCreation: 0,
                  cacheRead: 0,
                  conversationTokens: 0,
                  systemTokens: 0,
                  average: 0,
                  byModel: {
                    opus: { input: 0, output: 0, total: 0 },
                    sonnet: { input: 0, output: 0, total: 0 }
                  },
                  breakdown: { user: 0, assistant: 0 }
                },
                cost: { total: 0, byModel: { opus: 0, sonnet: 0 } },
                duration: 0,
                lastActivity: new Date(),
                thinkingTime: 0,
                responseTime: 0,
                contextWindow: {
                  used: 0,
                  limit: 200000,
                  percentage: 0,
                  remaining: 200000
                },
                model: get().selectedModel || DEFAULT_MODEL_ID
              },
              restorePoints: [], // Clear restore points to prevent stale rollback data
              modifiedFiles: new Set(), // Clear modified files tracking
              updatedAt: new Date()
            }
          : s
        )
      };
    });

    // Clear session edits from global registry to prevent orphan entries
    invoke('clear_session_edits', { sessionId }).catch(error => {
      console.error('Failed to clear session edits from registry:', error);
    });

    // Log the result
    const clearedSession = get().sessions.find(s => s.id === sessionId);
    if (clearedSession) {
      console.log(`🧹 [Store] After clear - claudeTitle: ${clearedSession.claudeTitle}`);
      console.log(`🧹 [Store] After clear - analytics:`, clearedSession.analytics);
      console.log(`🧹 [Store] After clear - messages count: ${clearedSession.messages.length}`);
      console.log(`🧹 [Store] After clear - claudeSessionId: ${clearedSession.claudeSessionId}`);
    }

    // Persist sessions after clearing context
    persistSessions(get().sessions);

    // Notify server to clear the Claude session - use the imported singleton
    claudeClient.clearSession(sessionId).catch(error => {
      console.error('Failed to clear server session:', error);
    });

    // Trigger resume button check by dispatching event
    window.dispatchEvent(new CustomEvent('yurucode-check-resumable'));

    // Reset backend compaction flags to prevent stale auto-compact triggers
    invoke('reset_compaction_flags', { sessionId }).catch(error => {
      console.error('Failed to reset compaction flags:', error);
    });
  },
  
  updateSessionDraft: (sessionId: string, input: string, attachments: any[]) => {
    set(state => ({
      sessions: state.sessions.map(s => 
        s.id === sessionId 
          ? { 
              ...s, 
              draftInput: input,
              draftAttachments: attachments
            }
          : s
      )
    }));
  },
  
  updateCompactionState: (sessionId: string, compactionState: Partial<Session['compactionState']>) => {
    set(state => ({
      sessions: state.sessions.map(s => 
        s.id === sessionId 
          ? { 
              ...s, 
              compactionState: {
                ...s.compactionState,
                ...compactionState
              }
            }
          : s
      )
    }));
  },
  
  setCompacting: (sessionId: string, isCompacting: boolean) => {
    set(state => ({
      sessions: state.sessions.map(s => 
        s.id === sessionId 
          ? { 
              ...s, 
              compactionState: {
                ...s.compactionState,
                isCompacting,
                autoTriggered: isCompacting ? true : s.compactionState?.autoTriggered
              }
            }
          : s
      )
    }));
    
    // If compaction finished, update the lastCompacted timestamp
    if (!isCompacting) {
      set(state => ({
        sessions: state.sessions.map(s => 
          s.id === sessionId 
            ? { 
                ...s, 
                compactionState: {
                  ...s.compactionState,
                  isCompacting: false,
                  lastCompacted: new Date()
                }
              }
            : s
        )
      }));
    }
  },
  
  toggleModel: () => {
    const currentModel = get().selectedModel;
    // Toggle between opus and sonnet using centralized config
    const opusModel = getModelByFamily('opus');
    const sonnetModel = getModelByFamily('sonnet');
    const newModel = currentModel.includes('opus')
      ? (sonnetModel?.id || DEFAULT_MODEL_ID)
      : (opusModel?.id || DEFAULT_MODEL_ID);
    set({ selectedModel: newModel });
    // Sync yurucode agents with new model
    const modelName = newModel.includes('opus') ? 'opus' : 'sonnet';
    systemPromptService.syncAgentsToFilesystem(modelName);
    console.log(`🔄 Model toggled to: ${newModel.includes('opus') ? 'Opus' : 'Sonnet'}`);
  },

  addMessageToSession: (sessionId: string, message: SDKMessage) => {
    // DEBUG: Log bash messages specifically
    const isBash = message.id?.startsWith?.('bash-');
    if (isBash) {
      console.log(`🐚 [BASH DEBUG] addMessageToSession called:`, { sessionId, messageId: message.id, type: message.type, streaming: message.streaming });
    }
    set(state => {
      // Log the current thinking state for debugging
      const currentSession = state.sessions.find(s => s.id === sessionId);
      if (message.type === 'result') {
        console.log(`📊 [THINKING TIME PRE-CHECK] Before processing result:`, {
          sessionId,
          hasSession: !!currentSession,
          hasThinkingStartTime: !!currentSession?.thinkingStartTime,
          thinkingStartTime: currentSession?.thinkingStartTime,
          streaming: currentSession?.streaming
        });
      }
      
      return {
        sessions: state.sessions.map(s => {
          if (s.id !== sessionId) return s;
          
          // Initialize analytics if we need to update tokens
          let analytics = s.analytics;
        
        // Special handling for token update messages (synthetic result messages from token listener)
        if (message.type === 'result' && message.wrapper?.tokens) {
          console.log('📊 [Store] Processing TOKEN UPDATE message:', {
            sessionId,
            wrapperTokens: message.wrapper.tokens,
            source: (message as any).source
          });
          
          // Initialize analytics if needed
          analytics = analytics || {
            totalMessages: 0,
            userMessages: 0,
            assistantMessages: 0,
            toolUses: 0,
            tokens: {
              input: 0,
              output: 0,
              total: 0,
              cacheSize: 0,
              byModel: {
                opus: { input: 0, output: 0, total: 0 },
                sonnet: { input: 0, output: 0, total: 0 }
              }
            },
            duration: 0,
            lastActivity: new Date(),
            thinkingTime: 0
          };
          
          // Update with wrapper tokens
          if (message.wrapper.tokens) {
            analytics.tokens.total = message.wrapper.tokens.total || 0;
            analytics.tokens.input = message.wrapper.tokens.input || 0;
            analytics.tokens.output = message.wrapper.tokens.output || 0;
            // cache_read is the SIZE of cached context, not incremental
            analytics.tokens.cacheSize = message.wrapper.tokens.cache_read || 0;
            analytics.tokens.cacheCreation = message.wrapper.tokens.cache_creation || 0;
            
            // Update model-specific tracking
            const modelUsed = message.model || get().selectedModel;
            const isOpus = modelUsed?.toLowerCase()?.includes('opus');
            
            if (isOpus) {
              analytics.tokens.byModel.opus = {
                input: analytics.tokens.input,
                output: analytics.tokens.output,
                total: analytics.tokens.input + analytics.tokens.output
              };
            } else {
              analytics.tokens.byModel.sonnet = {
                input: analytics.tokens.input,
                output: analytics.tokens.output,
                total: analytics.tokens.input + analytics.tokens.output
              };
            }
            
            console.log('✅ [Store] TOKEN UPDATE applied to analytics:', {
              sessionId,
              total: analytics.tokens.total,
              percentage: message.wrapper.tokens.percentage,
              modelUsed,
              isOpus,
              byModel: analytics.tokens.byModel
            });
          }
          
          // IMPORTANT: Still add the result message to the message list for display!
          // Continue to add the message below
        }
        
        // Normal message handling - with deduplication
        // Check if message with same ID already exists (race condition prevention)
        let updatedMessages: typeof s.messages;
        if (message.id) {
          const existingIndex = s.messages.findIndex(m => m.id === message.id);
          if (existingIndex >= 0) {
            // Update existing message instead of adding duplicate
            updatedMessages = [...s.messages];
            updatedMessages[existingIndex] = message;
            console.log(`[Store] Updated existing message ${message.id} (dedup)`);
          } else {
            updatedMessages = [...s.messages, message];
          }
        } else {
          updatedMessages = [...s.messages, message];
        }
        const MAX_MESSAGES = 500;
        
        if (updatedMessages.length > MAX_MESSAGES) {
          // Remove oldest messages to keep under limit
          const removeCount = updatedMessages.length - MAX_MESSAGES;
          updatedMessages = updatedMessages.slice(removeCount);
          console.log(`[Store] Session ${sessionId} exceeded ${MAX_MESSAGES} messages, removed ${removeCount} oldest messages`);
        }
        
        // Always update message counts in analytics
        if (!analytics) {
          analytics = s.analytics || {
            totalMessages: 0,
            userMessages: 0,
            assistantMessages: 0,
            toolUses: 0,
            systemMessages: 0,
            tokens: {
              input: 0,
              output: 0,
              total: 0,
              cacheSize: 0,
              byModel: {
                opus: { input: 0, output: 0, total: 0 },
                sonnet: { input: 0, output: 0, total: 0 }
              }
            },
            duration: 0,
            lastActivity: new Date(),
            thinkingTime: 0,
            cost: { total: 0, byModel: { opus: 0, sonnet: 0 } }
          };
        }
        
        // Create a new analytics object to ensure React detects the change
        // Exclude bash commands (messages starting with $) from user message count
        const nonBashUserMessages = updatedMessages.filter(m => {
          if (m.type !== 'user') return false;
          const content = typeof m.message === 'object' ? m.message?.content : m.message;
          return !(typeof content === 'string' && isBashPrefix(content));
        });
        const bashCommands = updatedMessages.filter(m => {
          if (m.type !== 'user') return false;
          const content = typeof m.message === 'object' ? m.message?.content : m.message;
          return typeof content === 'string' && isBashPrefix(content);
        });
        
        // Also exclude assistant messages that are bash responses (id starts with 'bash-')
        const nonBashAssistantMessages = updatedMessages.filter(m => 
          m.type === 'assistant' && 
          !m.id?.startsWith?.('bash-')
        );
        const bashResponses = updatedMessages.filter(m => 
          m.type === 'assistant' && 
          m.id?.startsWith?.('bash-')
        );
        
        analytics = {
          ...analytics,
          totalMessages: updatedMessages.length - bashCommands.length - bashResponses.length,
          userMessages: nonBashUserMessages.length,
          assistantMessages: nonBashAssistantMessages.length,
          toolUses: updatedMessages.filter(m => m.type === 'tool_use').length,
          systemMessages: updatedMessages.filter(m => m.type === 'system').length
        };
        
        console.log(`📊 [ANALYTICS COUNTS] Session ${sessionId} in addMessageToSession:`, {
          totalMessages: analytics.totalMessages,
          userMessages: analytics.userMessages,
          assistantMessages: analytics.assistantMessages,
          toolUses: analytics.toolUses,
          systemMessages: analytics.systemMessages,
          messageTypes: updatedMessages.map(m => m.type)
        });
        
        // Use duration_ms from result message for thinking time
        let shouldClearThinkingTime = false;
        if (message.type === 'result') {
          console.log(`📊 [THINKING TIME DEBUG] Result message in addMessageToSession:`, {
            sessionId,
            duration_ms: message.duration_ms,
            existingThinkingTime: analytics.thinkingTime || 0
          });
          
          // Use duration_ms from the result message - this is the actual elapsed time from the server
          if (message.duration_ms) {
            const thinkingDuration = Math.round(message.duration_ms / 1000); // Convert ms to seconds
            analytics = {
              ...analytics,
              thinkingTime: (analytics.thinkingTime || 0) + thinkingDuration
            };
            console.log(`📊 [THINKING TIME] Using duration_ms from result - added ${thinkingDuration}s, total: ${analytics.thinkingTime}s`);
            shouldClearThinkingTime = true;
          } else {
            console.log(`📊 [THINKING TIME] Result received but no duration_ms in message`);
          }
        }
        
        // Calculate cost from usage data in result messages
        if (message.type === 'result' && message.usage) {
          // Get the model from the message or use the global selectedModel
          const currentModel = message.model || get().selectedModel;
          const isOpus = currentModel?.toLowerCase()?.includes('opus');
          const inputTokens = message.usage.input_tokens || 0;
          const outputTokens = message.usage.output_tokens || 0;
          
          // Calculate cost based on model pricing
          let messageCost = 0;
          if (isOpus) {
            // Opus: $15/1M input, $75/1M output
            messageCost = (inputTokens / 1000000) * 15.00 + (outputTokens / 1000000) * 75.00;
          } else {
            // Sonnet 3.5: $3/1M input, $15/1M output  
            messageCost = (inputTokens / 1000000) * 3.00 + (outputTokens / 1000000) * 15.00;
          }
          
          // Use total_cost_usd if provided, otherwise use calculated cost
          if (message.total_cost_usd !== undefined) {
            messageCost = message.total_cost_usd;
          }
          
          // Initialize cost if needed and capture for type safety
          const currentCost = analytics.cost || { total: 0, byModel: { opus: 0, sonnet: 0 } };

          // Update cost
          analytics = {
            ...analytics,
            cost: {
              total: currentCost.total + messageCost,
              byModel: {
                opus: currentCost.byModel.opus + (isOpus ? messageCost : 0),
                sonnet: currentCost.byModel.sonnet + (!isOpus ? messageCost : 0)
              }
            }
          };
          
          console.log(`💵 [COST] Updated cost in addMessageToSession:`, {
            messageCost,
            totalCost: analytics.cost?.total ?? 0,
            model: isOpus ? 'opus' : 'sonnet'
          });

          // AUTO-COMPACTION CHECK: Use analytics.tokens.total (tracked correctly)
          // NOT the raw API values (cache_read_input_tokens is cumulative, not context size)
          // analytics.tokens.total comes from wrapper.tokens.total which tracks correctly
          // Skip compaction check for bash mode commands - only real chats should trigger it
          const isBashMessage = message.id && String(message.id).startsWith('bash-');
          if (!isBashMessage) {
            const trackedContextTokens = analytics?.tokens?.total || 0;
            const contextPercentage = (trackedContextTokens / 200000) * 100;

            // Only trigger compaction check at 55%+ (thresholds: 55% warning, 60% auto, 65% force)
            // Use the tracked tokens, not the cumulative API values
            if (contextPercentage >= 55 && trackedContextTokens > 0) {
              console.log(`🗜️ [COMPACTION] Checking auto-compact in addMessageToSession: ${contextPercentage.toFixed(2)}% (${trackedContextTokens} tracked tokens)`);
              import('../services/compactionService').then(({ compactionService }) => {
                compactionService.updateContextUsage(sessionId, contextPercentage);
              }).catch(err => console.error('[Compaction] Failed to import compactionService:', err));
            }
          }
        }

        const newCounter = (s.messageUpdateCounter || 0) + 1;
        // DEBUG: Log bash message update
        if (message.id?.startsWith?.('bash-')) {
          console.log(`🐚 [BASH DEBUG] Session updated:`, { sessionId, newMsgCount: updatedMessages.length, newCounter });
        }
        return {
          ...s,
          messages: updatedMessages,
          updatedAt: new Date(),
          analytics,
          // Force React re-render by updating a counter (fixes bash output not showing)
          messageUpdateCounter: newCounter,
          // Clear thinkingStartTime after we've used it for result
          ...(shouldClearThinkingTime ? { thinkingStartTime: undefined } : {})
        };
      })
    };
    });
  },

  setSessionStreaming: (sessionId: string, streaming: boolean) => {
    console.log(`[Store] Setting session ${sessionId} streaming to ${streaming}`);
    set(state => ({
      sessions: state.sessions.map(s =>
        s.id === sessionId
          ? { ...s, streaming, thinkingStartTime: streaming ? Date.now() : undefined }
          : s
      )
    }));
  },

  updateSessionAnalyticsFromFile: (sessionId: string, tokens: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens: number;
    cache_creation_input_tokens: number;
    total_context: number;
    context_percentage: number;
  }) => {
    console.log('[Store] Updating session analytics from file:', { sessionId, tokens });
    set(state => ({
      sessions: state.sessions.map(s => {
        if (s.id !== sessionId) return s;

        const analytics = s.analytics || {
          totalMessages: 0,
          userMessages: 0,
          assistantMessages: 0,
          toolUses: 0,
          tokens: {
            input: 0,
            output: 0,
            total: 0,
            byModel: {
              opus: { input: 0, output: 0, total: 0 },
              sonnet: { input: 0, output: 0, total: 0 }
            }
          },
          duration: 0,
          lastActivity: new Date(),
          thinkingTime: 0
        };

        return {
          ...s,
          analytics: {
            ...analytics,
            tokens: {
              ...analytics.tokens,
              input: tokens.input_tokens,
              output: tokens.output_tokens,
              total: tokens.total_context,
              cacheSize: tokens.cache_read_input_tokens,
              cacheCreation: tokens.cache_creation_input_tokens
            },
            contextWindow: {
              used: tokens.total_context,
              limit: 200000,
              percentage: tokens.context_percentage,
              remaining: Math.max(0, 200000 - tokens.total_context)
            },
            lastActivity: new Date()
          }
        };
      })
    }));
  },

  restoreToMessage: (sessionId: string, messageIndex: number) => {
    set(state => {
      let sessions = [...state.sessions];
      const sessionIdx = sessions.findIndex(s => s.id === sessionId);
      if (sessionIdx !== -1) {
        const session = sessions[sessionIdx];
        // Keep only messages up to and including the specified index
        const restoredMessages = session.messages.slice(0, messageIndex + 1);

        // Filter restorePoints to only keep those with messageIndex <= target
        // This prevents stale restorePoints referencing non-existent messages
        const filteredRestorePoints = (session.restorePoints || []).filter(
          rp => rp.messageIndex <= messageIndex
        );

        // Rebuild modifiedFiles set from remaining restorePoints
        const newModifiedFiles = new Set<string>();
        filteredRestorePoints.forEach(rp => {
          rp.fileSnapshots.forEach(snap => newModifiedFiles.add(snap.path));
        });

        // Reset session to continue from this point
        sessions[sessionIdx] = {
          ...session,
          messages: restoredMessages,
          restorePoints: filteredRestorePoints,
          modifiedFiles: newModifiedFiles,
          claudeSessionId: undefined, // Clear Claude session to start fresh
          streaming: false,
          updatedAt: new Date(),
          // Reset analytics to reflect only the kept messages
          analytics: {
            ...session.analytics,
            totalMessages: restoredMessages.length,
            userMessages: restoredMessages.filter(m => m.type === 'user').length,
            assistantMessages: restoredMessages.filter(m => m.type === 'assistant').length,
            toolUses: restoredMessages.filter(m => m.type === 'tool_use').length,
            duration: session.analytics?.duration || 0,
            // Keep existing token counts as they reflect actual usage
            tokens: session.analytics?.tokens || {
              input: 0,
              output: 0,
              total: 0,
              byModel: {
                opus: { input: 0, output: 0, total: 0 },
                sonnet: { input: 0, output: 0, total: 0 }
              }
            },
            cost: session.analytics?.cost || { total: 0, byModel: { opus: 0, sonnet: 0 } },
            lastActivity: new Date(),
            thinkingTime: session.analytics?.thinkingTime || 0
          }
        };

        // Notify server to clear the Claude session
        claudeClient.clearSession(sessionId);

        console.log(`Restored session ${sessionId} to message ${messageIndex}, kept ${filteredRestorePoints.length} restorePoints`);
      }
      return { sessions };
    });
  },
  
  configureMcpServers: async (servers: any) => {
    // MCP configuration would go here
    console.log('MCP servers:', servers);
  },
  
  setPermissionMode: (mode) => {
    // Permission mode would be set here
    console.log('Permission mode:', mode);
  },
  
  updateAllowedTools: (tools) => {
    // Tool allowlist would be updated here
    console.log('Allowed tools:', tools);
  },
  
  setGlobalWatermark: (image: string | null) => {
    set({ globalWatermarkImage: image });
  },
  
  calculateClaudeMdTokens: async () => {
    // CLAUDE.md is 7059 characters
    // Rough estimate: 1 token ≈ 3.75 characters (typical for code/markdown)
    const claudeMdChars = 7059;
    const tokenEstimate = Math.ceil(claudeMdChars / 3.75);
    set({ claudeMdTokens: tokenEstimate });
    console.log(`[CLAUDE.md] Token count: ${tokenEstimate} (${claudeMdChars} chars)`);
  },
  
  // Font customization
  setMonoFont: (font: string) => {
    set({ monoFont: font });
    // Apply to CSS variable with proper formatting
    document.documentElement.style.setProperty('--font-mono', `"${font}", monospace`);
    // Save to localStorage
    localStorage.setItem('yurucode-mono-font', font);
    console.log('[Store] Set mono font:', font);
  },

  setSansFont: (font: string) => {
    set({ sansFont: font });
    // Apply to CSS variable with proper formatting
    document.documentElement.style.setProperty('--font-sans', `"${font}", sans-serif`);
    // Save to localStorage
    localStorage.setItem('yurucode-sans-font', font);
    console.log('[Store] Set sans font:', font);
  },
  
  setBackgroundOpacity: (opacity: number) => {
    // Clamp opacity between 50 and 100
    const clampedOpacity = Math.max(50, Math.min(100, opacity));
    set({ backgroundOpacity: clampedOpacity });

    // Calculate alpha from opacity percentage
    const alpha = clampedOpacity / 100;
    document.documentElement.style.setProperty('--bg-opacity', alpha.toString());

    // For OLED black background, use dynamic alpha
    const bgColor = `rgba(0, 0, 0, ${alpha})`;
    document.documentElement.style.setProperty('--bg-color', bgColor);

    // Apply directly to body for immediate effect
    document.body.style.backgroundColor = bgColor;

    // Also ensure html element is transparent for see-through effect
    if (alpha < 1) {
      document.documentElement.style.backgroundColor = 'transparent';
    }

    // Save to localStorage
    localStorage.setItem('yurucode-bg-opacity', clampedOpacity.toString());
    console.log('[Store] Set background opacity:', clampedOpacity, 'alpha:', alpha, 'color:', bgColor);
  },
  
  // Tab persistence
  setRememberTabs: (remember: boolean) => {
    set({ rememberTabs: remember });
    localStorage.setItem('yurucode-remember-tabs', JSON.stringify(remember));
    
    if (remember) {
      // Save current tabs immediately when enabled
      const state = get();
      state.saveTabs();
    } else {
      // Clear saved tabs when disabled
      localStorage.removeItem('yurucode-saved-tabs');
      set({ savedTabs: [] });
    }
    console.log('[Store] Remember tabs:', remember);
  },
  
  saveTabs: () => {
    const state = get();
    if (!state.rememberTabs) return;

    // Save only project paths (no titles since these are new conversations)
    const tabData = state.sessions
      .filter(s => s.workingDirectory)
      .map((s, index) => ({
        path: s.workingDirectory!,
        isActive: s.id === state.currentSessionId,
        order: index
      }));

    const tabPaths = tabData.map(t => t.path);
    set({ savedTabs: tabPaths });

    localStorage.setItem('yurucode-saved-tabs', JSON.stringify(tabPaths));
    localStorage.setItem('yurucode-saved-tabs-enhanced', JSON.stringify(tabData));
    console.log('[Store] Saved tab paths:', tabPaths);
  },
  
  restoreTabs: async () => {
    const state = get();
    if (!state.rememberTabs) return;
    
    // Try to load enhanced format first, fall back to legacy format
    const enhancedStored = localStorage.getItem('yurucode-saved-tabs-enhanced');
    const legacyStored = localStorage.getItem('yurucode-saved-tabs');
    
    if (!enhancedStored && !legacyStored) return;
    
    try {
      let tabData: Array<{ path: string; title?: string; isActive?: boolean; order?: number; userRenamed?: boolean }>;
      
      if (enhancedStored) {
        // Use enhanced format with full tab information
        tabData = JSON.parse(enhancedStored);
        console.log('[Store] Restoring enhanced tabs:', tabData);
      } else if (legacyStored) {
        // Fall back to legacy format (just paths)
        const tabPaths = JSON.parse(legacyStored) as string[];
        tabData = tabPaths.map((path, index) => ({ path, order: index }));
        console.log('[Store] Restoring legacy tabs:', tabPaths);
      } else {
        // Shouldn't happen due to early return, but satisfies TypeScript
        return;
      }
      
      // Wait for socket connection before creating sessions
      const maxAttempts = 30; // 3 seconds
      let attempts = 0;
      while (!claudeClient.isConnected() && attempts < maxAttempts) {
        console.log('[Store] Waiting for socket connection before restoring tabs...');
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      if (!claudeClient.isConnected()) {
        console.error('[Store] Failed to connect to server, cannot restore tabs');
        return;
      }
      
      console.log('[Store] Socket connected, restoring tabs now');
      
      // Sort tabs by order if available
      tabData.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      
      let activeSessionId: string | null = null;
      
      // Create sessions (fresh conversations, no titles restored)
      for (let i = 0; i < tabData.length; i++) {
        const tab = tabData[i];
        // Create a fresh session
        const sessionId = await get().createSession(undefined, tab.path);

        // Track which session should be active
        if (tab.isActive && sessionId) {
          activeSessionId = sessionId;
        }

        console.log('[Store] Restored tab for project:', tab.path);
      }
      
      // Set the active tab after all tabs are created
      if (activeSessionId) {
        set({ currentSessionId: activeSessionId });
        console.log('[Store] Restored active tab:', activeSessionId);
      }
    } catch (err) {
      console.error('[Store] Failed to restore tabs:', err);
    }
  },
  
  setAutoGenerateTitle: (autoGenerate: boolean) => {
    set({ autoGenerateTitle: autoGenerate });
    localStorage.setItem('yurucode-auto-generate-title', JSON.stringify(autoGenerate));
    console.log('[Store] Auto-generate title:', autoGenerate);
  },

  setAutoCompactEnabled: (enabled: boolean) => {
    set({ autoCompactEnabled: enabled });
    localStorage.setItem('yurucode-auto-compact-enabled', JSON.stringify(enabled));
    console.log('[Store] Auto-compact enabled:', enabled);
  },

  setShowProjectsMenu: (show: boolean) => {
    set({ showProjectsMenu: show });
    localStorage.setItem('yurucode-show-projects-menu', JSON.stringify(show));
  },

  setShowAgentsMenu: (show: boolean) => {
    set({ showAgentsMenu: show });
    localStorage.setItem('yurucode-show-agents-menu', JSON.stringify(show));
  },

  setShowAnalyticsMenu: (show: boolean) => {
    set({ showAnalyticsMenu: show });
    localStorage.setItem('yurucode-show-analytics-menu', JSON.stringify(show));
  },

  setShowCommandsSettings: (show: boolean) => {
    set({ showCommandsSettings: show });
    localStorage.setItem('yurucode-show-commands-settings', JSON.stringify(show));
  },

  setShowMcpSettings: (show: boolean) => {
    set({ showMcpSettings: show });
    localStorage.setItem('yurucode-show-mcp-settings', JSON.stringify(show));
  },

  setShowHooksSettings: (show: boolean) => {
    set({ showHooksSettings: show });
    localStorage.setItem('yurucode-show-hooks-settings', JSON.stringify(show));
  },

  setShowPluginsSettings: (show: boolean) => {
    set({ showPluginsSettings: show });
    localStorage.setItem('yurucode-show-plugins-settings', JSON.stringify(show));
  },

  setIsDraggingTab: (isDragging: boolean) => {
    set({ isDraggingTab: isDragging });
  },
  
  // Agent management
  addAgent: (agent: Agent) => {
    const agents = [...get().agents, agent];
    set({ agents });
    // Persist to localStorage
    localStorage.setItem('yurucode-agents', JSON.stringify(agents));
    console.log('[Store] Added agent:', agent.name);
  },
  
  updateAgent: (updatedAgent: Agent) => {
    const agents = get().agents.map(agent => 
      agent.id === updatedAgent.id ? updatedAgent : agent
    );
    set({ agents });
    // Persist to localStorage
    localStorage.setItem('yurucode-agents', JSON.stringify(agents));
    console.log('[Store] Updated agent:', updatedAgent.name);
  },
  
  deleteAgent: (agentId: string) => {
    const agents = get().agents.filter(agent => agent.id !== agentId);
    set({ agents });
    // If the deleted agent was selected, clear the selection
    if (get().currentAgentId === agentId) {
      set({ currentAgentId: null });
    }
    // Persist to localStorage
    localStorage.setItem('yurucode-agents', JSON.stringify(agents));
    console.log('[Store] Deleted agent:', agentId);
  },
  
  selectAgent: (agentId: string | null) => {
    set({ currentAgentId: agentId });
    // Persist selection to localStorage
    if (agentId) {
      localStorage.setItem('yurucode-current-agent', agentId);
    } else {
      localStorage.removeItem('yurucode-current-agent');
    }
    console.log('[Store] Selected agent:', agentId);
  },
  
  importAgents: (newAgents: Agent[]) => {
    const existingAgents = get().agents;
    // Merge agents, avoiding duplicates by ID
    const mergedAgents = [...existingAgents];
    newAgents.forEach(newAgent => {
      const existingIndex = mergedAgents.findIndex(a => a.id === newAgent.id);
      if (existingIndex >= 0) {
        // Update existing agent
        mergedAgents[existingIndex] = newAgent;
      } else {
        // Add new agent
        mergedAgents.push(newAgent);
      }
    });
    set({ agents: mergedAgents });
    // Persist to localStorage
    localStorage.setItem('yurucode-agents', JSON.stringify(mergedAgents));
    console.log('[Store] Imported', newAgents.length, 'agents');
  },
  
  exportAgents: () => {
    return get().agents;
  },

  updateSessionMapping: (sessionId: string, claudeSessionId: string, metadata?: any) => {
    const state = get();
    const mappings = { ...state.sessionMappings };
    
    mappings[sessionId] = {
      claudeSessionId,
      ...metadata,
      updatedAt: Date.now()
    };
    
    set({ sessionMappings: mappings });
    
    // Save to localStorage
    localStorage.setItem('yurucode-session-mappings', JSON.stringify(mappings));
    
    // Update server with the mapping
    claudeClient.updateSessionMetadata(sessionId, { 
      claudeSessionId,
      ...metadata 
    }).catch(err => {
      console.error('Failed to update session metadata on server:', err);
    });
    
    console.log('[Store] Updated session mapping:', sessionId, '->', claudeSessionId);
  },

  loadSessionMappings: () => {
    try {
      const stored = localStorage.getItem('yurucode-session-mappings');
      if (stored) {
        const mappings = JSON.parse(stored);
        set({ sessionMappings: mappings });
        console.log('[Store] Loaded session mappings:', Object.keys(mappings).length);
      }
    } catch (err) {
      console.error('Failed to load session mappings:', err);
    }
  },

  saveSessionMappings: () => {
    const state = get();
    localStorage.setItem('yurucode-session-mappings', JSON.stringify(state.sessionMappings));
    console.log('[Store] Saved session mappings:', Object.keys(state.sessionMappings).length);
  },

  handleDeferredSpawn: (tempSessionId: string, realSessionId: string) => {
    console.log('[Store] 🎯 Handling deferred spawn:', tempSessionId, '->', realSessionId);
    
    // Update the session with the real Claude session ID
    set(state => {
      const sessions = state.sessions.map(s => {
        if (s.id === tempSessionId) {
          console.log('[Store] 🎯 Updating session', s.id, 'with claudeSessionId:', realSessionId);
          return {
            ...s,
            claudeSessionId: realSessionId
          };
        }
        return s;
      });
      return { sessions };
    });
    
    // Set up the message listener with the real session ID
    console.log('[Store] 🎯 Setting up deferred message listener for:', realSessionId);
    const messageCleanup = claudeClient.onMessage(realSessionId, (message) => {
      // Forward to the existing message processing logic
      const state = get();
      const isCurrentSession = state.currentSessionId === tempSessionId;
      
      console.log('[Store] 🎯 Deferred session message received:', {
        tempSessionId,
        realSessionId,
        messageType: message.type,
        messageId: message.id,
        isCurrentSession,
        streaming: message.streaming
      });
      
      // Process message - simplified version
      set(state => {
        const sessions = state.sessions.map(s => {
          if (s.id !== tempSessionId) return s;
          
          console.log('[Store] 🎯 Processing message for session:', s.id);
          const messages = [...s.messages];
          if (message.id) {
            const idx = messages.findIndex(m => m.id === message.id);
            if (idx >= 0) {
              console.log('[Store] 🎯 Updating existing message at index:', idx);
              messages[idx] = message;
            } else {
              console.log('[Store] 🎯 Adding new message to session');
              messages.push(message);
            }
          } else {
            console.log('[Store] 🎯 Adding message without ID');
            messages.push(message);
          }
          
          const newStreaming = message.type === 'assistant' && message.streaming;
          console.log('[Store] 🎯 Session streaming state:', s.streaming, '->', newStreaming);
          
          return {
            ...s,
            messages,
            streaming: newStreaming
          };
        });
        return { sessions };
      });
    });
    
    // Store cleanup function
    const session = get().sessions.find(s => s.id === tempSessionId);
    if (session) {
      (session as any)._deferredCleanup = messageCleanup;
    }
  }
}),
    {
      name: 'claude-code-storage',
      storage: createJSONStorage(() => createDebouncedStorage()),
      partialize: (state) => ({
        // Only persist model selection and watermark - sessions should be ephemeral
        selectedModel: state.selectedModel,
        globalWatermarkImage: state.globalWatermarkImage,
        monoFont: state.monoFont,
        sansFont: state.sansFont,
        rememberTabs: state.rememberTabs,
        autoGenerateTitle: state.autoGenerateTitle,
        autoCompactEnabled: state.autoCompactEnabled,
        showProjectsMenu: state.showProjectsMenu,
        showAgentsMenu: state.showAgentsMenu,
        showAnalyticsMenu: state.showAnalyticsMenu,
        showCommandsSettings: state.showCommandsSettings,
        showMcpSettings: state.showMcpSettings,
        showHooksSettings: state.showHooksSettings,
        showPluginsSettings: state.showPluginsSettings,
        agents: state.agents,
        currentAgentId: state.currentAgentId
        // Do NOT persist sessionId - sessions should not survive app restarts
      })
    }
  )
);