/**
 * Zustand store specifically for Claude Code SDK integration
 * Handles sessions, streaming messages, and all SDK features
 */

import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import { claudeCodeClient } from '../services/claudeCodeClient';
import { systemPromptService } from '../services/systemPromptService';
import { toastService } from '../services/toastService';
import { isBashPrefix } from '../utils/helpers';
import { appEventName, appStorageKey } from '../config/app';
import { loadEnabledTools, DEFAULT_ENABLED_TOOLS, ALL_TOOLS, expandMcpTools, getAllMcpToolIds } from '../config/tools';

const SESSIONS_KEY = appStorageKey('sessions');
const SESSIONS_TIMESTAMP_KEY = appStorageKey('sessions-timestamp');
const SESSION_MAPPINGS_KEY = appStorageKey('session-mappings');
const CURRENT_SESSION_KEY = appStorageKey('current-session');
const WORD_WRAP_KEY = appStorageKey('word-wrap');
const WORD_WRAP_CODE_KEY = appStorageKey('word-wrap-code');
const SOUND_ON_COMPLETE_KEY = appStorageKey('sound-on-complete');
const SHOW_RESULT_STATS_KEY = appStorageKey('show-result-stats');
const SHOW_CONFIRM_DIALOGS_KEY = appStorageKey('show-confirm-dialogs');
const AUTO_COMPACT_ENABLED_KEY = appStorageKey('auto-compact-enabled');
const MONO_FONT_KEY = appStorageKey('mono-font');
const SANS_FONT_KEY = appStorageKey('sans-font');
const FONT_SIZE_KEY = appStorageKey('font-size');
const LINE_HEIGHT_KEY = appStorageKey('line-height');
const BG_OPACITY_KEY = appStorageKey('bg-opacity');
const REMEMBER_TABS_KEY = appStorageKey('remember-tabs');
const SAVED_TABS_KEY = appStorageKey('saved-tabs');
const SAVED_TABS_ENHANCED_KEY = appStorageKey('saved-tabs-enhanced');
const AUTO_GENERATE_TITLE_KEY = appStorageKey('auto-generate-title');
const SHOW_PROJECTS_MENU_KEY = appStorageKey('show-projects-menu');
const SHOW_AGENTS_MENU_KEY = appStorageKey('show-agents-menu');
const SHOW_ANALYTICS_MENU_KEY = appStorageKey('show-analytics-menu');
const SHOW_COMMANDS_SETTINGS_KEY = appStorageKey('show-commands-settings');
const SHOW_MCP_SETTINGS_KEY = appStorageKey('show-mcp-settings');
const SHOW_HOOKS_SETTINGS_KEY = appStorageKey('show-hooks-settings');
const SHOW_PLUGINS_SETTINGS_KEY = appStorageKey('show-plugins-settings');
const SHOW_SKILLS_SETTINGS_KEY = appStorageKey('show-skills-settings');
const SHOW_DICTATION_KEY = appStorageKey('show-dictation');
const CONTEXT_BAR_VISIBILITY_KEY = appStorageKey('context-bar-visibility');
const MEMORY_ENABLED_KEY = appStorageKey('memory_enabled');
const MEMORY_RETENTION_DAYS_KEY = appStorageKey('memory_retention_days');
const VSCODE_EXTENSION_ENABLED_KEY = appStorageKey('vscode-extension-enabled');
const AGENTS_KEY = appStorageKey('agents');
const CURRENT_AGENT_KEY = appStorageKey('current-agent');

const RESTORE_INPUT_EVENT = appEventName('restore-input');
const CHECK_RESUMABLE_EVENT = appEventName('check-resumable');

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

// Streaming end debounce timers - prevent premature streaming=false when Claude continues working
// RACE CONDITION FIX: Maps "sessionId:source" -> timeoutId where source is "temp" or "main"
// This prevents timer leaks when both temp channel and main listener fire stream_end
// Previously: only one timer ID was stored, causing the other to leak
const streamingEndTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Completion sound debounce - prevent double-play when both result message and stream_end fire
// Also prevents sound playing for background tasks like title generation
let lastCompletionSoundTime = 0;
const COMPLETION_SOUND_DEBOUNCE_MS = 2000; // 2 seconds between sounds

// Platform-aware debounce: Windows has longer delays between Claude CLI turns
// macOS: 700ms is sufficient, Windows: needs 2s due to slower IPC/process timing
const IS_WINDOWS = navigator.platform.toLowerCase().includes('win');
const STREAMING_END_DEBOUNCE_MS = IS_WINDOWS ? 2000 : 700;

// Track active subagent parent tool IDs - prevents streaming=false while subagent is working
// Maps sessionId -> Set of parent_tool_use_ids that have active subagents
const activeSubagentParents = new Map<string, Set<string>>();

// Cancel any pending streaming end timers for a session (called when new work messages arrive)
// RACE CONDITION FIX: Cancel ALL timers for this session (both temp and main channel sources)
function cancelStreamingEndTimer(sessionId: string) {
  const sources = ['temp', 'main', '']; // Empty string for legacy keys without source
  let cancelled = 0;
  for (const source of sources) {
    const key = source ? `${sessionId}:${source}` : sessionId;
    const timerId = streamingEndTimers.get(key);
    if (timerId) {
      clearTimeout(timerId);
      streamingEndTimers.delete(key);
      cancelled++;
    }
  }
  if (cancelled > 0) {
    console.log(`🔄 [STREAMING-DEBOUNCE] Cancelled ${cancelled} streaming_end timer(s) for ${sessionId} - more work incoming`);
  }
}

// Set streaming end timer with source tracking to prevent leaks
// source: "temp" for temporary channel, "main" for main listener
function setStreamingEndTimer(sessionId: string, source: 'temp' | 'main', callback: () => void) {
  const key = `${sessionId}:${source}`;

  // Cancel existing timer for this specific source
  const existingTimer = streamingEndTimers.get(key);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const timerId = setTimeout(() => {
    streamingEndTimers.delete(key);
    callback();
  }, STREAMING_END_DEBOUNCE_MS);

  streamingEndTimers.set(key, timerId);
}

// Track subagent activity - keeps parent tool ID active while subagent messages arrive
function trackSubagentActivity(sessionId: string, parentToolUseId: string) {
  let parents = activeSubagentParents.get(sessionId);
  if (!parents) {
    parents = new Set();
    activeSubagentParents.set(sessionId, parents);
  }
  parents.add(parentToolUseId);
  console.log(`🤖 [SUBAGENT-TRACK] Session ${sessionId} has ${parents.size} active subagent parent(s)`);
}

// Check if session has active subagents
function hasActiveSubagents(sessionId: string): boolean {
  const parents = activeSubagentParents.get(sessionId);
  return parents ? parents.size > 0 : false;
}

// Clear subagent tracking for a session (called on error/interrupt/cleanup)
function clearSubagentTracking(sessionId: string) {
  if (activeSubagentParents.has(sessionId)) {
    activeSubagentParents.delete(sessionId);
    console.log(`🤖 [SUBAGENT-TRACK] Cleared subagent tracking for session ${sessionId}`);
  }
}

// Clear a specific subagent parent (called when tool_result received for a Task tool)
function clearSubagentParent(sessionId: string, parentToolUseId: string) {
  const parents = activeSubagentParents.get(sessionId);
  if (parents && parents.has(parentToolUseId)) {
    parents.delete(parentToolUseId);
    console.log(`🤖 [SUBAGENT-TRACK] Cleared parent ${parentToolUseId.substring(0, 20)}... - remaining: ${parents.size}`);
  }
}
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
import { DEFAULT_MODEL_ID, MODEL_ID_MAP, resolveModelId, getModelByFamily, getProviderForModel, type ProviderType } from '../config/models';
import { tauriClaudeClient } from '../services/tauriClaudeClient';

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
  startLine?: number; // 1-based line number where the edit starts (for accurate diff line numbers)
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
  provider?: 'claude' | 'gemini' | 'openai'; // Provider locked to this session (set on first message)
  model?: string; // Model ID locked to this session (set on first message)
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
  pendingToolInfo?: Map<string, { name: string; startTime: number }>; // Track pending tool names for context center
  pendingToolCounter?: number; // Counter to force React re-render when pending tools change
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
  lineChanges?: { added: number; removed: number }; // Track lines added/removed in this session
}

interface ClaudeCodeStore {
  // Sessions
  sessions: Session[];
  currentSessionId: string | null;
  persistedSessionId: string | null; // Track the sessionId for persistence
  sessionMappings: Record<string, any>; // Map yume sessionIds to Claude sessionIds

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
  fontSize: number; // Base font size in px (default 12)
  lineHeight: number; // Line height multiplier (default 1.2)

  // Tab persistence
  rememberTabs: boolean; // Whether to remember open tabs
  savedTabs: string[]; // Array of project paths to restore

  // Title generation
  autoGenerateTitle: boolean; // Whether to auto-generate titles for new sessions

  // Word wrap display
  wordWrap: boolean; // Whether to wrap long lines in all chat content

  // Sound notifications
  soundOnComplete: boolean; // Whether to play sound when Claude finishes responding

  // Result stats visibility
  showResultStats: boolean; // Whether to show result stats (tokens, cost, duration) after responses

  // Confirm dialogs
  showConfirmDialogs: boolean; // Whether to show confirm dialogs (close tabs, clear, compact, etc)

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
  showSkillsSettings: boolean; // Whether to show skills tab in settings

  // Features visibility
  showDictation: boolean; // Whether to show dictation button and enable keybind
  memoryEnabled: boolean; // Whether built-in MCP memory server is enabled
  memoryServerRunning: boolean; // Whether memory server process is currently running
  memoryRetentionDays: number; // Days to retain memories before pruning (default 30)

  // VSCode extension
  vscodeExtensionEnabled: boolean; // Whether vscode extension is enabled (auto-installs when on)
  vscodeConnected: boolean; // Whether vscode extension is connected
  vscodeConnectionCount: number; // Number of vscode connections
  isVscodeInstalled: boolean; // Whether VSCode is installed on the system
  claudeVersion: string | null; // Cached Claude CLI version

  // Version updates
  hasUpdateAvailable: boolean; // Whether a newer version is available
  latestVersion: string | null; // Latest version from GitHub

  // UI state
  isDraggingTab: boolean; // Whether a tab is currently being dragged

  // Context bar visibility
  contextBarVisibility: {
    showCommandPalette: boolean;
    showDictation: boolean;
    showFilesPanel: boolean;
    showHistory: boolean;
  };

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
  forkSessionToProvider: (sessionId: string, targetModelId: string) => Promise<string | undefined>;
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
  setFontSize: (size: number) => void;
  setLineHeight: (height: number) => void;

  // Background transparency
  backgroundOpacity: number;
  setBackgroundOpacity: (opacity: number) => void;

  // Tab persistence
  setRememberTabs: (remember: boolean) => void;
  saveTabs: () => void;
  restoreTabs: () => Promise<void>;

  // Title generation
  setAutoGenerateTitle: (autoGenerate: boolean) => void;

  // Word wrap display
  setWordWrap: (wrap: boolean) => void;

  // Sound notifications
  setSoundOnComplete: (enabled: boolean) => void;
  playCompletionSound: () => void;

  // Result stats visibility
  setShowResultStats: (show: boolean) => void;

  // Confirm dialogs
  setShowConfirmDialogs: (show: boolean) => void;

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
  setShowSkillsSettings: (show: boolean) => void;

  // Features visibility
  setShowDictation: (show: boolean) => void;
  setContextBarVisibility: (visibility: { showCommandPalette: boolean; showDictation: boolean; showFilesPanel: boolean; showHistory: boolean }) => void;
  setMemoryEnabled: (enabled: boolean) => void;
  setMemoryServerRunning: (running: boolean) => void;
  setMemoryRetentionDays: (days: number) => void;

  // VSCode extension
  setVscodeExtensionEnabled: (enabled: boolean) => void;
  setVscodeStatus: (connected: boolean, count: number) => void;
  checkVscodeInstallation: () => Promise<void>;
  fetchClaudeVersion: () => Promise<void>;

  // Version updates
  setUpdateAvailable: (hasUpdate: boolean, latestVersion: string | null) => void;
  checkForUpdates: () => Promise<void>;

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
      provider: s.provider, // Locked provider for this session
      model: s.model, // Locked model for this session
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
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessionData));
    localStorage.setItem(SESSIONS_TIMESTAMP_KEY, Date.now().toString()); // Add timestamp for validation
    console.log('[Store] Persisted', sessions.length, 'sessions to localStorage with',
      sessionData.reduce((acc, s) => acc + s.messages.length, 0), 'total messages');
  } catch (err) {
    console.error('[Store] Failed to persist sessions:', err);
  }
};

// Helper to restore sessions from localStorage
const restoreSessions = (): Session[] => {
  try {
    const stored = localStorage.getItem(SESSIONS_KEY);
    const timestamp = localStorage.getItem(SESSIONS_TIMESTAMP_KEY);

    if (stored) {
      // Check if sessions are stale (older than 24 hours)
      if (timestamp) {
        const age = Date.now() - parseInt(timestamp);
        if (age > 24 * 60 * 60 * 1000) {
          console.log('[Store] Sessions are older than 24 hours, clearing');
          localStorage.removeItem(SESSIONS_KEY);
          localStorage.removeItem(SESSIONS_TIMESTAMP_KEY);
          return [];
        }
      }

      const sessionData = JSON.parse(stored);
      const sessions = sessionData.map((s: any) => ({
        ...s,
        status: 'paused' as const, // Mark as paused until reconnected
        streaming: false,
        pendingToolIds: new Set(),
        pendingToolInfo: new Map(),
        modifiedFiles: new Set(s.modifiedFiles || []),
        createdAt: new Date(s.createdAt),
        updatedAt: new Date(s.updatedAt),
        // Preserve claudeSessionId for session resumption with --resume flag
        claudeSessionId: s.claudeSessionId, // KEEP this for --resume
        workingDirectory: s.workingDirectory,
        messages: s.messages || [],
        analytics: {
          ...(s.analytics || {
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
          }),
          // Clear compactPending on restore - we have token data, next message will refresh
          compactPending: false
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
      monoFont: 'Agave', // Default monospace font
      sansFont: 'Agave', // Default sans-serif font
      fontSize: 12, // Default base font size in px
      lineHeight: 1.2, // Default line height multiplier
      rememberTabs: false, // Default to not remembering tabs (disabled by default)
      savedTabs: [], // Empty array of saved tabs
      autoGenerateTitle: false, // Default to not auto-generating titles (disabled by default)
      wordWrap: (() => {
        // Check both old and new keys for backwards compatibility
        let stored = localStorage.getItem(WORD_WRAP_KEY);
        if (stored === null) {
          // Migrate from old key if present
          stored = localStorage.getItem(WORD_WRAP_CODE_KEY);
          if (stored !== null) {
            localStorage.setItem(WORD_WRAP_KEY, stored);
            localStorage.removeItem(WORD_WRAP_CODE_KEY);
          }
        }
        const enabled = stored !== null ? JSON.parse(stored) : true;
        // Apply CSS class immediately on init
        if (enabled) {
          document.documentElement.classList.add('word-wrap');
        }
        return enabled;
      })(), // Load from localStorage or default to true
      soundOnComplete: (() => {
        const stored = localStorage.getItem(SOUND_ON_COMPLETE_KEY);
        return stored ? JSON.parse(stored) : true;
      })(), // Load from localStorage or default to true
      showResultStats: (() => {
        const stored = localStorage.getItem(SHOW_RESULT_STATS_KEY);
        return stored ? JSON.parse(stored) : true;
      })(), // Load from localStorage or default to true
      showConfirmDialogs: (() => {
        const stored = localStorage.getItem(SHOW_CONFIRM_DIALOGS_KEY);
        return stored ? JSON.parse(stored) : true;
      })(), // Load from localStorage or default to true
      autoCompactEnabled: (() => {
        const stored = localStorage.getItem(AUTO_COMPACT_ENABLED_KEY);
        return stored ? JSON.parse(stored) : true;
      })(), // Load from localStorage or default to true
      showProjectsMenu: false, // Default to hidden
      showAgentsMenu: false, // Default to hidden
      showAnalyticsMenu: true, // Default to enabled
      showCommandsSettings: false, // Default to hidden
      showMcpSettings: false, // Default to hidden
      showHooksSettings: false, // Default to hidden
      showPluginsSettings: true, // Default to enabled
      showSkillsSettings: false, // Default to hidden
      showDictation: true, // Default to enabled
      memoryEnabled: (() => {
        const stored = localStorage.getItem(MEMORY_ENABLED_KEY);
        return stored !== null ? JSON.parse(stored) : true; // Default to enabled
      })(),
      memoryServerRunning: false, // Not running initially
      memoryRetentionDays: (() => {
        const stored = localStorage.getItem(MEMORY_RETENTION_DAYS_KEY);
        return stored !== null ? JSON.parse(stored) : 30; // Default 30 days
      })(),
      vscodeExtensionEnabled: false, // Default to disabled
      vscodeConnected: false, // Not connected initially
      vscodeConnectionCount: 0, // No connections initially
      isVscodeInstalled: false, // Assume not installed until checked
      claudeVersion: null, // Not checked initially
      hasUpdateAvailable: false, // No update initially
      latestVersion: null, // Not checked initially
      isDraggingTab: false, // No tab is being dragged initially
      contextBarVisibility: (() => {
        const stored = localStorage.getItem(CONTEXT_BAR_VISIBILITY_KEY);
        return stored ? JSON.parse(stored) : {
          showCommandPalette: true,
          showDictation: true,
          showFilesPanel: true,
          showHistory: true,
        };
      })(), // Load from localStorage or default to all visible
      agents: [], // No agents initially, will load from localStorage
      currentAgentId: null, // No agent selected initially
      backgroundOpacity: 100, // Default to 100% opacity
      streamingMessage: '',
      isLoadingHistory: false,
      availableSessions: [],

      setSelectedModel: (modelId: string) => {
        const state = get();
        const currentSession = state.sessions.find(s => s.id === state.currentSessionId);
        const currentSessionId = state.currentSessionId;

        // Also update current session's model if same provider (allows opus <-> sonnet switching)
        if (currentSession?.model) {
          const oldProvider = getProviderForModel(currentSession.model);
          const newProvider = getProviderForModel(modelId);
          if (oldProvider === newProvider) {
            // Update both global and session model in single set to avoid stale state
            set(state => ({
              selectedModel: modelId,
              sessions: state.sessions.map(s =>
                s.id === currentSessionId ? { ...s, model: modelId } : s
              )
            }));
            console.log(`Model changed to: ${modelId} (session updated)`);
          } else {
            // Different provider - only update global, session stays locked
            set({ selectedModel: modelId });
            console.log(`Model changed to: ${modelId} (session not updated - different provider)`);
          }
        } else {
          // No session model set yet - just update global
          set({ selectedModel: modelId });
          console.log('Model changed to:', modelId);
        }

        // Sync yume agents with new model
        const modelName = modelId.includes('opus') ? 'opus' : 'sonnet';
        systemPromptService.syncAgentsToFilesystem(modelName);
      },

      setEnabledTools: (tools: string[]) => {
        set({ enabledTools: tools });
      },

      createSession: async (name?: string, directory?: string, existingSessionId?: string) => {
        console.log('[Store] createSession called:', { name, directory, existingSessionId });
        console.trace('[Store] Stack trace for createSession');

        try {
          // License check: Enforce tab limit for demo users
          const currentState = get();

          // Check if existingSessionId is a Claude session ID (26 chars, alphanumeric with _/-)
          // Claude session IDs: exactly 26 characters, used for --resume flag
          // Yume session IDs: variable format like 'session-xxx' or 'temp-xxx'
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
            console.log('[Store] Tab limit reached for demo mode:', maxTabs);
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
          // Use the provided directory, or get home directory from Tauri/VSCode
          let workingDirectory = directory;

          // Check for VSCode mode first - use cwd from URL
          const urlParams = new URLSearchParams(window.location.search);
          const vscodeCwd = urlParams.get('cwd');
          const isVSCodeMode = urlParams.get('vscode') === '1';

          if (!workingDirectory && isVSCodeMode && vscodeCwd) {
            workingDirectory = vscodeCwd;
            console.log('[Store] Using working directory from VSCode:', workingDirectory);
          } else if (!workingDirectory && window.__TAURI__) {
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
            pendingToolInfo: new Map(),
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
            // 1. We're reconnecting an existing yume session (not compacted)
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
            // Expand MCP server toggles to actual tool IDs, then compute disallowed
            const enabledToolsList = get().enabledTools;
            const expandedEnabledTools = expandMcpTools(enabledToolsList);
            // Get all possible tool IDs (base tools + all MCP tools)
            const allToolIds = [...ALL_TOOLS.map(t => t.id), ...getAllMcpToolIds()];
            const disabledToolsList = allToolIds
              .filter(id => !expandedEnabledTools.includes(id))
              // Filter out MCP server toggle IDs (they're not real tools)
              .filter(id => !id.match(/^mcp__[^_]+$/));

            // Route session creation based on provider
            const resolvedModel = resolveModelId(selectedModel);
            const sessionProvider = getProviderForModel(resolvedModel);
            const useDirectTauriForSession = sessionProvider === 'gemini' || sessionProvider === 'openai';
            console.log('[Store] Creating session with provider:', sessionProvider, 'useDirectTauri:', useDirectTauriForSession);

            // For yume-cli providers (gemini/openai), set up message listener BEFORE spawning
            // This prevents race condition where backend emits messages before frontend listener is ready
            let earlyMessageCleanup: (() => void) | null = null;
            const preSpawnSessionId = actualExistingSessionId || tempSessionId;

            if (useDirectTauriForSession) {
              console.log('[Store] Setting up EARLY listener for yume-cli session:', preSpawnSessionId);

              // Listen for session ID updates to update the store's claudeSessionId
              // This is needed so subsequent sendMessage calls use the real ID
              const { listen } = await import('@tauri-apps/api/event');
              const sessionIdUpdateChannel = `claude-session-id-update:${preSpawnSessionId}`;
              const sessionIdUpdateUnlisten = await listen(sessionIdUpdateChannel, (event: any) => {
                const { old_session_id, new_session_id } = event.payload;
                console.log('[Store] 🔄 Session ID update received:', { old: old_session_id, new: new_session_id });
                // Update the store's session with the real claudeSessionId
                set(state => ({
                  sessions: state.sessions.map(s =>
                    s.id === preSpawnSessionId
                      ? { ...s, claudeSessionId: new_session_id }
                      : s
                  )
                }));
              });

              // Use async version that awaits listener setup before returning
              earlyMessageCleanup = await tauriClaudeClient.onMessageAsync(preSpawnSessionId, (message) => {
                console.log('[Store] 🎯 EARLY message received:', preSpawnSessionId, 'type:', message.type);
                // Update streaming state for assistant messages
                if (message.type === 'assistant') {
                  set(state => ({
                    sessions: state.sessions.map(s =>
                      s.id === preSpawnSessionId
                        ? { ...s, streaming: true, thinkingStartTime: s.thinkingStartTime || Date.now() }
                        : s
                    )
                  }));
                }
                // Clear streaming on result, streaming_end, or error
                if (message.type === 'result' || message.type === 'streaming_end' || message.type === 'error') {
                  set(state => ({
                    sessions: state.sessions.map(s =>
                      s.id === preSpawnSessionId
                        ? { ...s, streaming: false, thinkingStartTime: undefined }
                        : s
                    )
                  }));
                }
                // Add message to session
                get().addMessageToSession(preSpawnSessionId, message);
              });

              // Wrap cleanup to also cleanup session ID update listener
              const originalCleanup = earlyMessageCleanup;
              earlyMessageCleanup = () => {
                sessionIdUpdateUnlisten();
                originalCleanup();
              };

              console.log('[Store] EARLY listener ready for:', preSpawnSessionId);
            }

            const sessionOptions = {
              disallowedTools: disabledToolsList.length > 0 ? disabledToolsList : undefined,
              permissionMode: 'default',
              maxTurns: 30,
              model: resolvedModel,
              sessionId: actualExistingSessionId || tempSessionId,
              claudeSessionId: claudeSessionIdToResume,
              messages: actualExistingSessionId ? (existingSession?.messages || []) : []
            };

            // Use tauriClaudeClient for Gemini/OpenAI, claudeClient for Claude
            const result = useDirectTauriForSession
              ? await tauriClaudeClient.createSession(sessionName, workingDirectory, sessionOptions)
              : await claudeClient.createSession(sessionName, workingDirectory, sessionOptions);

            // Clean up early listener - the main listener will take over
            if (earlyMessageCleanup) {
              // Don't clean up immediately - keep it active as the main listener
              // It will be cleaned up when session is closed
            }

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
              pendingToolInfo: new Map(),
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
              // CRITICAL: Preserve messages that were added by early listener before session activated
              // The temp session may have received messages while createSession was awaiting
              const tempSession = state.sessions.find(s => s.id === tempSessionId);
              const earlyMessages = tempSession?.messages || [];

              // Merge early messages with existingMessages from result (avoid duplicates by ID)
              const existingIds = new Set(existingMessages.map((m: any) => m.id).filter(Boolean));
              const uniqueEarlyMessages = earlyMessages.filter(m => !m.id || !existingIds.has(m.id));
              const mergedMessages = [...existingMessages, ...uniqueEarlyMessages];

              console.log('[Store] Merging messages on session activate:', {
                existingMessages: existingMessages.length,
                earlyMessages: earlyMessages.length,
                merged: mergedMessages.length
              });

              // Update activeSession with merged messages
              const activeSessionWithMessages = {
                ...activeSession,
                messages: mergedMessages
              };

              const newSessions = existingSession ?
                // If reconnecting, update the existing session
                state.sessions.map(s =>
                  s.id === existingSessionId ? activeSessionWithMessages : s
                ) :
                // If new session, replace the temp session
                state.sessions.map(s =>
                  s.id === tempSessionId ? activeSessionWithMessages : s
                );
              persistSessions(newSessions); // Persist after update
              localStorage.setItem(CURRENT_SESSION_KEY, sessionId);

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

            // Select the appropriate client based on provider
            const sessionClient = useDirectTauriForSession ? tauriClaudeClient : claudeClient;

            // Listen for title updates
            const titleCleanup = sessionClient.onTitle(sessionId, (title: string) => {
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
            const errorCleanup = sessionClient.onError(sessionId, (error) => {
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
            let contextUpdateCleanup: (() => void) | null = null;

            // For yume-cli providers, we already set up the early listener above
            // Skip the temp listener to avoid duplicate message handling
            if (useDirectTauriForSession && earlyMessageCleanup) {
              console.log('[Store] Skipping temp listener for yume-cli - early listener already active');
              tempMessageCleanup = earlyMessageCleanup;
            } else {
              // ALSO listen on the temp session ID for compact results
              // Compact creates a new session but emits result on original temp channel
              console.log('[Store] Setting up listener for temp session (for compact results):', sessionId);
              tempMessageCleanup = sessionClient.onMessage(sessionId, (message) => {
              console.log('[Store] 🗜️ Message received on TEMP session channel:', sessionId, 'type:', message.type, 'result:', message.result?.substring?.(0, 50));

              // Process ALL messages through the main handler, not just result messages
              // The temp channel receives all messages for the session
              if (message.type !== 'result') {
                // Special handling for stream_end to clear streaming state - USE DEBOUNCE
                if (message.type === 'system' && message.subtype === 'stream_end') {
                  console.log(`⏱️ [STREAMING-DEBOUNCE] Stream end on temp channel - starting debounce for ${sessionId}`);

                  // Cancel any existing timers (from any source)
                  cancelStreamingEndTimer(sessionId);

                  // RACE CONDITION FIX: Use setStreamingEndTimer with source='temp' to prevent timer leaks
                  // Previously both temp and main channel would overwrite the same timer key
                  setStreamingEndTimer(sessionId, 'temp', () => {
                    const currentState = get();
                    const currentSession = currentState.sessions.find(s => s.id === sessionId);

                    if (!currentSession) return;

                    // Check if recent activity
                    const timeSinceLastMessage = currentSession.lastMessageTime
                      ? Date.now() - currentSession.lastMessageTime
                      : Infinity;

                    if (timeSinceLastMessage < STREAMING_END_DEBOUNCE_MS) {
                      console.log(`🔄 [STREAMING-DEBOUNCE] temp channel debounce cancelled - recent activity`);
                      return;
                    }

                    // Check for pending tools
                    if (currentSession.pendingToolIds && currentSession.pendingToolIds.size > 0) {
                      console.log(`🔄 [STREAMING-DEBOUNCE] temp channel debounce cancelled - pending tools`);
                      return;
                    }

                    // Check for active subagents
                    if (hasActiveSubagents(sessionId)) {
                      console.log(`🔄 [STREAMING-DEBOUNCE] temp channel debounce cancelled - active subagents`);
                      return;
                    }

                    // Clear subagent tracking since we're done
                    clearSubagentTracking(sessionId);

                    console.log(`🏁 [STREAMING-DEBOUNCE] temp channel debounce fired - clearing streaming for ${sessionId}`);
                    get().playCompletionSound();

                    set(state => ({
                      sessions: state.sessions.map(s => {
                        if (s.id === sessionId) {
                          return {
                            ...s,
                            streaming: false,
                            // DON'T clear thinkingStartTime here - we need it for the result message
                            pendingToolIds: new Set(),
                            pendingToolInfo: new Map()
                          };
                        }
                        return s;
                      })
                    }));
                  });
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
                // Secondary: result text mentions "compact" (Claude's compact response)
                // NOTE: Zero tokens alone is NOT sufficient - providers like Codex can legitimately return 0 tokens
                const isCompactResult = !!message.wrapper_compact ||
                  (message.result && typeof message.result === 'string' &&
                   message.result.toLowerCase().includes('compact'));

                // If it's not a compact result, it's a normal result - process through addMessageToSession
                // addMessageToSession has deduplication logic to prevent duplicate messages
                if (!isCompactResult) {
                  console.log('[Store] 📊 NORMAL RESULT on temp channel (not compact), processing via addMessageToSession:', {
                    sessionId,
                    hasWrapper: !!message.wrapper,
                    wrapperTokens: message.wrapper?.tokens,
                    usage: message.usage,
                    messageType: message.type,
                    messageId: message.id
                  });

                  // Process as normal message - addMessageToSession handles deduplication by message ID
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
                            pendingAutoCompact: false,
                            pendingAutoCompactMessage: undefined,
                            isCompacting: false
                          });
                        }, 500);
                      } else {
                        // No pending message - just clear compacting state
                        get().updateCompactionState(sessionId, {
                          pendingAutoCompact: false,
                          isCompacting: false
                        });
                      }
                    }).catch(err => {
                      console.error('[Store] Failed to import wrapperIntegration:', err);
                      // Clear compacting state on error
                      get().updateCompactionState(sessionId, {
                        pendingAutoCompact: false,
                        isCompacting: false
                      });
                    });

                    // Reset token analytics after compact - set to 0 with compactPending flag
                    // Actual tokens will be updated on next message result
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
                      },
                      compactPending: true // Next message will establish new baseline
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
            } // Close the else block for non-yume-cli providers

            if (claudeSessionId) {
              console.log('[Store] Setting up message listener for Claude session:', claudeSessionId);
              messageCleanup = sessionClient.onMessage(claudeSessionId, (message) => {
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
                    // Detection: wrapper_compact field (primary) or result text mentions "compact"
                    // NOTE: Zero tokens alone is NOT sufficient - providers like Codex can legitimately return 0 tokens
                    const isCompactResult = (message.type === 'system' && message.subtype === 'compact') ||
                      !!message.wrapper_compact ||
                      (message.type === 'result' && message.result &&
                       typeof message.result === 'string' &&
                       message.result.toLowerCase().includes('compact'));
                    const isResultWithNewSession = message.type === 'result' && message.session_id;

                    if (isCompactResult) {
                      // Compact result includes new session ID - update to it
                      const oldSessionId = s.claudeSessionId;
                      const newSessionId = message.session_id || null;
                      console.log(`🗜️ [Store] Compact result - updating session ID: ${oldSessionId} -> ${newSessionId}`);
                      s = {
                        ...s,
                        claudeSessionId: newSessionId,
                        wasCompacted: true,
                        streaming: false,  // Clear streaming state after compact
                        lastAssistantMessageIds: [], // Clear assistant message tracking
                        compactionState: { ...s.compactionState, isCompacting: false, pendingAutoCompact: false } // Clear compacting and pending flags
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

                      // CRITICAL: Always attach duration_ms to result message for elapsed time display
                      // Use server-provided value first, then calculate from thinkingStartTime
                      if (!message.duration_ms && s.thinkingStartTime) {
                        const calculatedDuration = Date.now() - s.thinkingStartTime;
                        (message as any).duration_ms = calculatedDuration;
                        console.log(`⏱️ [ELAPSED-TIME] Calculated duration_ms from thinkingStartTime: ${calculatedDuration}ms`);
                      } else if (!message.duration_ms) {
                        // Fallback: set to 0 if no thinkingStartTime - should never happen but prevents NaN
                        console.warn(`⏱️ [ELAPSED-TIME] No duration_ms and no thinkingStartTime for session ${s.id}`);
                        (message as any).duration_ms = 0;
                      }
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

                      // Clear compactPending if set - we now have valid token data
                      if (analytics.compactPending) {
                        console.log('🗜️ [COMPACT RECOVERY] Wrapper tokens received, clearing compactPending flag');
                        analytics.compactPending = false;
                      }
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
                        if (existingMessage.type === 'tool_use' || existingMessage.type === 'tool_result') {
                          console.log(`Skipping update for ${existingMessage.type} message - preserving original`);
                        } else if (existingMessage.type === 'result') {
                          // For result messages, merge to keep the most complete data
                          const merged = {
                            ...existingMessage,
                            ...message,
                            // Preserve existing data if new message lacks it
                            usage: message.usage || existingMessage.usage,
                            duration_ms: message.duration_ms || existingMessage.duration_ms,
                            total_cost_usd: message.total_cost_usd || existingMessage.total_cost_usd,
                            model: message.model || existingMessage.model,
                            wrapper: message.wrapper || existingMessage.wrapper
                          };
                          existingMessages[existingIndex] = merged;
                          console.log(`[Store] Merged result message - usage: ${!!merged.usage}, duration: ${merged.duration_ms}, model: ${merged.model}`);
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
                    } else if (message.type === 'result') {
                      // Special handling for result messages without IDs
                      // Only allow ONE result per turn - find and merge with any existing result
                      let lastUserIndex = -1;
                      for (let i = existingMessages.length - 1; i >= 0; i--) {
                        if (existingMessages[i].type === 'user') {
                          lastUserIndex = i;
                          break;
                        }
                      }
                      const existingResultIndex = existingMessages.findIndex((m, idx) =>
                        m.type === 'result' && idx > lastUserIndex
                      );
                      if (existingResultIndex >= 0) {
                        // Merge with existing result
                        const existing = existingMessages[existingResultIndex];
                        existingMessages[existingResultIndex] = {
                          ...existing,
                          ...message,
                          usage: message.usage || existing.usage,
                          duration_ms: message.duration_ms || (existing as any).duration_ms,
                          total_cost_usd: message.total_cost_usd || (existing as any).total_cost_usd,
                          model: message.model || (existing as any).model,
                          result: message.result || (existing as any).result
                        };
                        console.log(`[Store] Merged result message without ID (dedup)`);
                      } else {
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
                        isCompactResult: !!message.wrapper_compact || (message.result?.toLowerCase?.().includes('compact')),
                        fullMessage: message
                      });

                      if (message.usage) {
                        // Check if this is a /compact result
                        // Detection: wrapper_compact field (primary) or result text mentions "compact"
                        // NOTE: Zero tokens alone is NOT sufficient - providers like Codex can legitimately return 0 tokens
                        const isCompactResult = !!message.wrapper_compact ||
                          (message.result && typeof message.result === 'string' &&
                           message.result.toLowerCase().includes('compact'));

                        if (isCompactResult) {
                          console.log('🗜️ [COMPACT DETECTED] /compact result message received');
                          console.log('🗜️ [COMPACT] Ignoring usage from compact command itself');
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

                              // Use SNAPSHOT values for all token fields (consistent with wrapper path)
                              // The API reports the total context window size for THIS request
                              // Previous code accumulated input/output which caused inflation
                              analytics.tokens.input = regularInputTokens;
                              analytics.tokens.output = outputTokens;
                              analytics.tokens.cacheCreation = cacheCreationTokens;

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
                  // CRITICAL FIX: ANY message that indicates Claude is working should set streaming=true
                  // This fixes the bug where streaming_end arrives but Claude continues for minutes
                  if (message.type === 'assistant' || message.type === 'tool_use' || message.type === 'tool_result' || message.type === 'thinking') {
                    // Cancel any pending streaming_end timer - we're clearly still working!
                    cancelStreamingEndTimer(sessionId);

                    // SUBAGENT FIX: Track messages with parent_tool_use_id to keep streaming active
                    // When a subagent is working, messages have parent_tool_use_id indicating the parent Task tool
                    const parentToolUseId = (message as any).parent_tool_use_id;
                    if (parentToolUseId) {
                      trackSubagentActivity(sessionId, parentToolUseId);
                      console.log(`🤖 [SUBAGENT] Message from subagent (parent: ${parentToolUseId.substring(0, 20)}...) - keeping streaming active`);
                    }

                    // ALWAYS set streaming=true when we receive work messages (regardless of message.streaming flag)
                    // This ensures we show the streaming indicator whenever Claude is actively working
                    const session = sessions.find(s => s.id === sessionId);
                    const wasStreaming = session?.streaming;

                    console.log(`[STREAMING-FIX] ${message.type} message received - forcing streaming=true (was: ${wasStreaming}, message.streaming: ${message.streaming})`);

                    // If this is a subagent message, ensure the parent tool ID stays in pendingToolIds
                    sessions = sessions.map(s => {
                      if (s.id === sessionId) {
                        const pendingTools = new Set(s.pendingToolIds || []);
                        // Keep parent tool ID in pending while subagent is working
                        if (parentToolUseId && !pendingTools.has(parentToolUseId)) {
                          pendingTools.add(parentToolUseId);
                          console.log(`🤖 [SUBAGENT] Re-added parent tool ${parentToolUseId.substring(0, 20)}... to pendingToolIds (total: ${pendingTools.size})`);
                        }
                        return {
                          ...s,
                          streaming: true,
                          lastMessageTime: Date.now(),
                          thinkingStartTime: s.thinkingStartTime || Date.now(),
                          pendingToolIds: pendingTools
                        };
                      }
                      return s;
                    });

                    // If we just set streaming=true after it was false, log this correction
                    if (!wasStreaming) {
                      console.log(`🔄 [STREAMING-CORRECTION] Session ${sessionId} streaming was false but received ${message.type} - corrected to true`);
                    }
                  }
                  // tool_use messages also indicate work - handled above

                  if (message.type === 'error') {
                    // Handle error messages - ALWAYS clear streaming and show to user
                    console.log('[Store] Error message received:', message.error);
                    // Clear subagent tracking on error
                    clearSubagentTracking(sessionId);
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
                          pendingToolInfo: new Map(),
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
                    // CRITICAL FIX: Check if we still have pending tools (agents, subagents, etc.)
                    const session = sessions.find(s => s.id === sessionId);
                    const hasPendingTools = session?.pendingToolIds && session.pendingToolIds.size > 0;
                    const hasSubagents = hasActiveSubagents(sessionId);

                    if (hasPendingTools || hasSubagents) {
                      // Don't clear streaming - agent tools or subagents are still running
                      console.log(`🔄 [STREAMING-FIX] streaming_end received but work still pending - keeping streaming=true (pendingTools: ${session?.pendingToolIds?.size || 0}, activeSubagents: ${hasSubagents})`);
                      // Don't play sound yet - wait for all tools to complete
                      return { sessions };
                    }

                    // DEBOUNCE: Don't immediately clear streaming - wait to see if more messages arrive
                    // This fixes the bug where Claude continues working after streaming_end
                    console.log(`⏱️ [STREAMING-DEBOUNCE] streaming_end received - starting ${STREAMING_END_DEBOUNCE_MS}ms debounce timer for ${sessionId}`);

                    // Cancel any existing timers for this session (from any source)
                    cancelStreamingEndTimer(sessionId);

                    // RACE CONDITION FIX: Use setStreamingEndTimer with source='main' to prevent timer leaks
                    setStreamingEndTimer(sessionId, 'main', () => {
                      console.log(`🏁 [STREAMING-DEBOUNCE] Timer fired for ${sessionId} - now clearing streaming state`);

                      // Check again if we should clear (in case state changed during debounce)
                      const currentState = get();
                      const currentSession = currentState.sessions.find(s => s.id === sessionId);

                      if (!currentSession) {
                        console.log(`🔄 [STREAMING-DEBOUNCE] Session ${sessionId} no longer exists, skipping clear`);
                        return;
                      }

                      // If new messages arrived during debounce, don't clear
                      const timeSinceLastMessage = currentSession.lastMessageTime
                        ? Date.now() - currentSession.lastMessageTime
                        : Infinity;

                      if (timeSinceLastMessage < STREAMING_END_DEBOUNCE_MS) {
                        console.log(`🔄 [STREAMING-DEBOUNCE] Recent message activity (${timeSinceLastMessage}ms ago) - keeping streaming=true`);
                        return;
                      }

                      // If still has pending tools, don't clear
                      if (currentSession.pendingToolIds && currentSession.pendingToolIds.size > 0) {
                        console.log(`🔄 [STREAMING-DEBOUNCE] Still has ${currentSession.pendingToolIds.size} pending tools - keeping streaming=true`);
                        return;
                      }

                      // If still has active subagents, don't clear
                      if (hasActiveSubagents(sessionId)) {
                        console.log(`🔄 [STREAMING-DEBOUNCE] Still has active subagents - keeping streaming=true`);
                        return;
                      }

                      // Clear subagent tracking since we're actually done
                      clearSubagentTracking(sessionId);

                      // Play completion sound if enabled
                      get().playCompletionSound();

                      // Extract learnings from the completed conversation if memory is enabled
                      if (get().memoryEnabled && get().memoryServerRunning) {
                        const memSession = get().sessions.find(s => s.id === sessionId);
                        if (memSession && memSession.messages.length >= 2) {
                          // Get last user message and last assistant message
                          const lastUserMsg = [...memSession.messages].reverse().find(m => m.type === 'user');
                          const lastAssistantMsg = [...memSession.messages].reverse().find(m => m.type === 'assistant');
                          if (lastUserMsg?.content && lastAssistantMsg?.content) {
                            import('../services/memoryService').then(({ memoryService }) => {
                              memoryService.extractLearnings(
                                memSession.workingDirectory || '/',
                                lastUserMsg.content as string,
                                lastAssistantMsg.content as string
                              ).catch(e => console.warn('[Memory] Extract learnings failed:', e));
                            });
                          }
                        }
                      }

                      // NOTE: Focus restoration removed here - now handled by ClaudeChat.tsx focus guards
                      // Calling restore_window_focus here caused race conditions with the periodic
                      // focus guard and was disrupting WKWebView's internal focus state

                      // Actually clear streaming state
                      set(state => ({
                        sessions: state.sessions.map(s => {
                          if (s.id === sessionId) {
                            // Calculate thinking time before clearing
                            let updatedAnalytics = s.analytics;
                            if (s.thinkingStartTime && updatedAnalytics) {
                              const thinkingDuration = Math.floor((Date.now() - s.thinkingStartTime) / 1000);
                              updatedAnalytics = {
                                ...updatedAnalytics,
                                thinkingTime: (updatedAnalytics.thinkingTime || 0) + thinkingDuration
                              };
                              console.log(`📊 [THINKING TIME] Streaming end (debounced) - Added ${thinkingDuration}s, total: ${updatedAnalytics.thinkingTime}s`);
                            }
                            return {
                              ...s,
                              streaming: false,
                              thinkingStartTime: undefined,
                              analytics: updatedAnalytics
                            };
                          }
                          return s;
                        })
                      }));
                    });

                    // Don't modify sessions here - the timer callback will handle it
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
                            ? {
                              ...s, messages: (() => {
                                let updatedMessages = [...s.messages, infoMessage];
                                const MAX_MESSAGES = 500;
                                if (updatedMessages.length > MAX_MESSAGES) {
                                  const removeCount = updatedMessages.length - MAX_MESSAGES;
                                  updatedMessages = updatedMessages.slice(removeCount);
                                }
                                return updatedMessages;
                              })()
                            }
                            : s
                        );
                      }

                      return { sessions };
                    }

                    // Check if we still have pending tools
                    const session = sessions.find(s => s.id === sessionId);
                    // CRITICAL: If result has duration_ms, this is the FINAL authoritative signal
                    const hasDurationMs = typeof message.duration_ms === 'number' && message.duration_ms > 0;
                    const hasPendingTools = session?.pendingToolIds && session.pendingToolIds.size > 0;

                    if (hasPendingTools && !hasDurationMs) {
                      // Still have pending tools and no duration_ms - keep streaming active
                      console.log(`Result message received but ${session?.pendingToolIds?.size} tools still pending - keeping streaming state`);
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
                      // Normal result - clear streaming IMMEDIATELY (no debounce)
                      // Result message is the definitive signal that Claude is done
                      console.log('🎯 [STREAMING-FIX] Normal result received - clearing streaming immediately:', {
                        sessionId,
                        subtype: message.subtype,
                        is_error: message.is_error,
                        hasDurationMs,
                        result: message.result?.substring?.(0, 50),
                        sessionMessages: session?.messages.length || 0,
                        currentStreaming: session?.streaming
                      });

                      // Cancel any pending debounce timer - result is authoritative
                      cancelStreamingEndTimer(sessionId);

                      // Force-clear all pending state if we have duration_ms (authoritative end signal)
                      if (hasDurationMs && session?.pendingToolIds) {
                        session.pendingToolIds.clear();
                        session.pendingToolInfo?.clear();
                        console.log(`🧹 [STREAMING-FIX] Force-cleared pending tools due to duration_ms`);
                      }

                      // Clear subagent tracking since we're actually done
                      clearSubagentTracking(sessionId);

                      // Play completion sound if enabled
                      get().playCompletionSound();

                      // NOTE: Focus restoration removed here - now handled by ClaudeChat.tsx focus guards
                      // Calling restore_window_focus here caused race conditions with the periodic
                      // focus guard and was disrupting WKWebView's internal focus state

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
                            console.log(`📊 [THINKING TIME] Result - Added ${thinkingDuration}s, total: ${updatedAnalytics.thinkingTime}s`);
                          }
                          console.log(`✅ [STREAMING-FIX] Result processed for session ${sessionId} - streaming=false`);
                          return {
                            ...s,
                            streaming: false,
                            thinkingStartTime: undefined,
                            runningBash: false,
                            userBashRunning: false,
                            analytics: updatedAnalytics
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

                      // IMPORTANT: Still update context tokens even when keeping streaming for followup
                      // Otherwise interrupted agents don't update context usage
                      if (message.subtype === 'interrupted') {
                        // Process wrapper tokens from the interrupted message
                        if ((message as any).wrapper?.tokens) {
                          const wrapperTokens = (message as any).wrapper.tokens;
                          console.log('📊 [INTERRUPT-FOLLOWUP] Processing wrapper tokens:', wrapperTokens);

                          sessions = sessions.map(s => {
                            if (s.id !== sessionId) return s;

                            const baseAnalytics: SessionAnalytics = s.analytics || {
                              totalMessages: 0,
                              userMessages: 0,
                              assistantMessages: 0,
                              toolUses: 0,
                              tokens: { input: 0, output: 0, total: 0, cacheSize: 0, cacheCreation: 0, byModel: { opus: { input: 0, output: 0, total: 0 }, sonnet: { input: 0, output: 0, total: 0 } } },
                              cost: { total: 0, byModel: { opus: 0, sonnet: 0 } },
                              duration: 0,
                              lastActivity: new Date(),
                              contextWindow: { used: 0, limit: 200000, percentage: 0, remaining: 200000 },
                              thinkingTime: 0
                            };

                            const limit = baseAnalytics.contextWindow?.limit || 200000;
                            const used = wrapperTokens.total || 0;

                            return {
                              ...s,
                              analytics: {
                                ...baseAnalytics,
                                tokens: {
                                  ...baseAnalytics.tokens,
                                  total: wrapperTokens.total ?? baseAnalytics.tokens.total,
                                  input: wrapperTokens.input ?? baseAnalytics.tokens.input,
                                  output: wrapperTokens.output ?? baseAnalytics.tokens.output,
                                  cacheSize: wrapperTokens.cache_read ?? baseAnalytics.tokens.cacheSize ?? 0,
                                  cacheCreation: wrapperTokens.cache_creation ?? baseAnalytics.tokens.cacheCreation ?? 0
                                },
                                contextWindow: {
                                  used,
                                  limit,
                                  percentage: limit > 0 ? Math.round((used / limit) * 100) : 0,
                                  remaining: limit - used
                                }
                              }
                            };
                          });
                          console.log('📊 [INTERRUPT-FOLLOWUP] Updated context from wrapper tokens');
                        }

                        // Also try fallback fetch from session file (may not work if endpoint not implemented)
                        const session = sessions.find(s => s.id === sessionId);
                        if (session?.claudeSessionId && session?.workingDirectory) {
                          fetchSessionTokensFromFile(sessionId, session.claudeSessionId, session.workingDirectory).then(tokens => {
                            if (tokens) {
                              get().updateSessionAnalyticsFromFile(sessionId, tokens);
                            }
                          });
                        }
                      }

                      sessions = sessions.map(s =>
                        s.id === sessionId ? { ...s, runningBash: false, userBashRunning: false } : s
                      );
                    } else {
                      // Clear streaming and bash running on interruption, error, or stream_end
                      // BUT preserve streaming state if there are pending tools (subagent tasks still running)
                      const session = sessions.find(s => s.id === sessionId);
                      const hasPendingTools = session?.pendingToolIds && (session.pendingToolIds?.size ?? 0) > 0;
                      const hasSubagents = hasActiveSubagents(sessionId);

                      if ((hasPendingTools || hasSubagents) && message.subtype === 'stream_end') {
                        // CRITICAL FIX: Don't clear streaming if subagent tasks are still pending
                        console.log(`[Store] stream_end received but work still pending - keeping streaming=true (pendingTools: ${session?.pendingToolIds?.size ?? 0}, subagents: ${hasSubagents})`);
                        sessions = sessions.map(s =>
                          s.id === sessionId
                            ? { ...s, runningBash: false, userBashRunning: false }
                            : s
                        );
                      } else if (message.subtype === 'stream_end') {
                        // DEBOUNCE: For stream_end, use debounced approach to handle Claude continuing work
                        console.log(`⏱️ [STREAMING-DEBOUNCE] stream_end system message - starting debounce timer for ${sessionId}`);

                        // Cancel any existing timers (from any source)
                        cancelStreamingEndTimer(sessionId);

                        // Clear bash state immediately but debounce streaming state
                        sessions = sessions.map(s =>
                          s.id === sessionId ? { ...s, runningBash: false, userBashRunning: false } : s
                        );

                        // RACE CONDITION FIX: Use setStreamingEndTimer with source='main' to prevent timer leaks
                        setStreamingEndTimer(sessionId, 'main', () => {
                          const currentState = get();
                          const currentSession = currentState.sessions.find(s => s.id === sessionId);

                          if (!currentSession) return;

                          // Check if recent activity
                          const timeSinceLastMessage = currentSession.lastMessageTime
                            ? Date.now() - currentSession.lastMessageTime
                            : Infinity;

                          if (timeSinceLastMessage < STREAMING_END_DEBOUNCE_MS) {
                            console.log(`🔄 [STREAMING-DEBOUNCE] stream_end debounce cancelled - recent activity`);
                            return;
                          }

                          if (currentSession.pendingToolIds && currentSession.pendingToolIds.size > 0) {
                            console.log(`🔄 [STREAMING-DEBOUNCE] stream_end debounce cancelled - pending tools`);
                            return;
                          }

                          if (hasActiveSubagents(sessionId)) {
                            console.log(`🔄 [STREAMING-DEBOUNCE] stream_end debounce cancelled - active subagents`);
                            return;
                          }

                          // Clear subagent tracking since we're actually done
                          clearSubagentTracking(sessionId);

                          console.log(`🏁 [STREAMING-DEBOUNCE] stream_end debounce fired - clearing streaming for ${sessionId}`);
                          get().playCompletionSound();

                          set(state => ({
                            sessions: state.sessions.map(s => {
                              if (s.id === sessionId) {
                                let updatedAnalytics = s.analytics;
                                if (s.thinkingStartTime && updatedAnalytics) {
                                  const thinkingDuration = Math.floor((Date.now() - s.thinkingStartTime) / 1000);
                                  updatedAnalytics = {
                                    ...updatedAnalytics,
                                    thinkingTime: (updatedAnalytics.thinkingTime || 0) + thinkingDuration
                                  };
                                }

                                // Fetch tokens after stream end
                                const claudeSessId = s.claudeSessionId;
                                const workDir = s.workingDirectory;
                                fetchSessionTokensFromFile(sessionId, claudeSessId, workDir).then(tokens => {
                                  if (tokens) {
                                    get().updateSessionAnalyticsFromFile(sessionId, tokens);
                                  }
                                });

                                return {
                                  ...s,
                                  streaming: false,
                                  thinkingStartTime: undefined,
                                  analytics: updatedAnalytics
                                };
                              }
                              return s;
                            })
                          }));
                        });
                      } else {
                        // interrupted or error - immediately clear streaming (user action or error)
                        console.log(`System message (${message.subtype}) received, clearing streaming and bash state`);
                        // Clear subagent tracking on interrupt/error
                        clearSubagentTracking(sessionId);

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
                              console.log(`📊 [THINKING TIME] ${message.subtype} - Added ${thinkingDuration}s, total: ${updatedAnalytics.thinkingTime}s`);
                            }

                            // Process wrapper tokens on interrupt to update context usage
                            if (message.subtype === 'interrupted' && (message as any).wrapper?.tokens) {
                              const wrapperTokens = (message as any).wrapper.tokens;
                              console.log('📊 [INTERRUPT] Processing wrapper tokens:', wrapperTokens);

                              // Initialize analytics if not present (early interrupt on new conversation)
                              const baseAnalytics: SessionAnalytics = updatedAnalytics || {
                                totalMessages: 0,
                                userMessages: 0,
                                assistantMessages: 0,
                                toolUses: 0,
                                tokens: { input: 0, output: 0, total: 0, cacheSize: 0, cacheCreation: 0, byModel: { opus: { input: 0, output: 0, total: 0 }, sonnet: { input: 0, output: 0, total: 0 } } },
                                cost: { total: 0, byModel: { opus: 0, sonnet: 0 } },
                                duration: 0,
                                lastActivity: new Date(),
                                contextWindow: { used: 0, limit: 200000, percentage: 0, remaining: 200000 },
                                thinkingTime: 0
                              };

                              const limit = baseAnalytics.contextWindow?.limit || 200000;
                              const used = wrapperTokens.total || 0;

                              updatedAnalytics = {
                                ...baseAnalytics,
                                tokens: {
                                  ...baseAnalytics.tokens,
                                  total: wrapperTokens.total ?? baseAnalytics.tokens.total,
                                  input: wrapperTokens.input ?? baseAnalytics.tokens.input,
                                  output: wrapperTokens.output ?? baseAnalytics.tokens.output,
                                  cacheSize: wrapperTokens.cache_read ?? baseAnalytics.tokens.cacheSize ?? 0,
                                  cacheCreation: wrapperTokens.cache_creation ?? baseAnalytics.tokens.cacheCreation ?? 0
                                },
                                contextWindow: {
                                  used,
                                  limit,
                                  percentage: limit > 0 ? Math.round((used / limit) * 100) : 0,
                                  remaining: limit - used
                                }
                              };
                              console.log('📊 [INTERRUPT] Updated context:', updatedAnalytics.contextWindow);
                            }

                            // Trigger async fetch of session tokens from file (single source of truth)
                            if (message.subtype === 'interrupted') {
                              const claudeSessId = s.claudeSessionId;
                              const workDir = s.workingDirectory;
                              fetchSessionTokensFromFile(sessionId, claudeSessId, workDir).then(tokens => {
                                if (tokens) {
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
                              pendingToolIds: new Set(), // Clear pending tools on interrupt/error
                              pendingToolInfo: new Map()
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
                    console.log('[ContextCenter] 🔧 Tool use message received:', message.message?.name, message.message?.id);

                    // Track if this is a Bash command
                    const isBash = message.message?.name === 'Bash';
                    if (isBash) {
                      console.log('[Bash] Command started');
                    }

                    // Add tool ID to pending set
                    const toolId = message.message?.id;
                    const toolName = message.message?.name || 'unknown';
                    sessions = sessions.map(s => {
                      if (s.id === sessionId) {
                        const pendingTools = new Set(s.pendingToolIds || []);
                        const pendingToolInfo = new Map(s.pendingToolInfo || []);
                        if (toolId) {
                          pendingTools.add(toolId);
                          pendingToolInfo.set(toolId, { name: toolName, startTime: Date.now() });
                          console.log(`[ContextCenter] ✅ Added tool ${toolId} (${toolName}) to pendingToolInfo. Size: ${pendingToolInfo.size}`);
                        }

                        // Capture file snapshot for rollback if present
                        let restorePoints = [...(s.restorePoints || [])];
                        let modifiedFiles = new Set(s.modifiedFiles || []);
                        let lineChanges = { ...(s.lineChanges || { added: 0, removed: 0 }) };

                        if (message.fileSnapshot) {
                          const snapshot = message.fileSnapshot;
                          const toolName = message.message?.name || 'unknown';
                          const operation = toolName === 'Write' ? 'write' : toolName === 'MultiEdit' ? 'multiedit' : 'edit';
                          const editTimestamp = snapshot.timestamp || Date.now();
                          const editSessionId = snapshot.sessionId || s.id;

                          // Calculate line changes
                          const newContent = message.message?.input?.content || message.message?.input?.new_string || '';
                          const oldContent = snapshot.originalContent || '';
                          const newLines = newContent ? newContent.split('\n').length : 0;
                          const oldLines = oldContent ? oldContent.split('\n').length : 0;

                          // For edit operations, capture the snippet being replaced
                          let editOldStr = '';
                          let editStartLine: number | undefined;

                          if (snapshot.isNewFile) {
                            // New file: all lines are added
                            lineChanges.added += newLines;
                          } else if (operation === 'edit' || operation === 'multiedit') {
                            // Edit: use old_string/new_string from input
                            const oldStr = message.message?.input?.old_string || '';
                            const newStr = message.message?.input?.new_string || '';
                            editOldStr = oldStr;
                            const removedLines = oldStr ? oldStr.split('\n').length : 0;
                            const addedLines = newStr ? newStr.split('\n').length : 0;
                            lineChanges.added += addedLines;
                            lineChanges.removed += removedLines;

                            // Calculate start line by finding old_string in original content
                            if (oldStr && oldContent) {
                              const idx = oldContent.indexOf(oldStr);
                              if (idx !== -1) {
                                // Count newlines before the match to get 1-based line number
                                editStartLine = oldContent.substring(0, idx).split('\n').length;
                              }
                            }
                          } else {
                            // Write: diff the whole file
                            if (newLines > oldLines) {
                              lineChanges.added += (newLines - oldLines);
                            } else if (oldLines > newLines) {
                              lineChanges.removed += (oldLines - newLines);
                            }
                          }

                          const fileSnapshot: FileSnapshot = {
                            path: snapshot.path,
                            content: newContent,
                            operation,
                            timestamp: editTimestamp,
                            messageIndex: s.messages.length, // Current position
                            originalContent: snapshot.originalContent,
                            oldContent: editOldStr || undefined, // The snippet being replaced (for edit ops)
                            startLine: editStartLine, // 1-based line number where edit starts
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
                          console.log(`📸 [Store] Captured file snapshot for rollback: ${snapshot.path} (mtime=${snapshot.mtime}) lines: +${lineChanges.added} -${lineChanges.removed}`);

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
                          pendingToolInfo,
                          pendingToolCounter: (s.pendingToolCounter || 0) + 1,
                          restorePoints,
                          modifiedFiles,
                          lineChanges,
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
                    // Also clear from subagent tracking (in case this was a Task tool result)
                    if (toolUseId) {
                      clearSubagentParent(sessionId, toolUseId);
                    }
                    sessions = sessions.map(s => {
                      if (s.id === sessionId) {
                        const pendingTools = new Set(s.pendingToolIds || []);
                        const pendingToolInfo = new Map(s.pendingToolInfo || []);
                        if (toolUseId && pendingTools.has(toolUseId)) {
                          pendingTools.delete(toolUseId);
                          pendingToolInfo.delete(toolUseId);
                          console.log(`[Store] Removed tool ${toolUseId} from pending. Remaining: ${pendingTools.size}`);
                        }
                        return {
                          ...s,
                          runningBash: false,
                          pendingToolIds: pendingTools,
                          pendingToolInfo,
                          pendingToolCounter: (s.pendingToolCounter || 0) + 1
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
              // NOTE: macOS server no longer emits trigger:focus - frontend guards handle it
              // This listener is now primarily for Windows
              const isMac = navigator.platform.includes('Mac');
              console.log(`[Store] Setting up focus trigger listener (platform: ${navigator.platform})`);
              focusCleanup = claudeClient.onFocusTrigger(sessionId, () => {
                // On macOS, the frontend focus guards in ClaudeChat.tsx handle focus restoration
                // Calling restore_window_focus here would cause race conditions with the guards
                if (isMac) {
                  console.log('[Store] Focus trigger received on macOS - skipping (guards handle it)');
                  return;
                }

                console.log('[Store] 🎯 Focus trigger received, restoring window focus');
                // Use Tauri command to restore focus (Windows only now)
                if (window.__TAURI__) {
                  import('@tauri-apps/api/core').then(({ invoke }) => {
                    invoke('restore_window_focus').catch(console.warn);
                  });
                }
                // window.focus() and direct input focus for Windows
                window.focus();
                const inputElement = document.querySelector('textarea.chat-input') as HTMLTextAreaElement;
                if (inputElement) {
                  inputElement.focus();
                }
              });
            } else {
              console.log('[Store] No claudeSessionId yet - will set up listener after spawn');
            }

            // Set up mid-stream context update listener
            contextUpdateCleanup = sessionClient.onContextUpdate(sessionId, (usage) => {
              console.log('[Store] 📊 Mid-stream context update:', {
                sessionId,
                total: usage.totalContextTokens,
                percentage: Math.round(usage.totalContextTokens / 2000) + '%'
              });

              // Update session analytics with real-time context usage
              // Only update if new value >= current to prevent UI flickering
              // (first assistant message may have stale usage from previous turn)
              set(state => ({
                sessions: state.sessions.map(s => {
                  if (s.id !== sessionId) return s;

                  const analytics = { ...(s.analytics || {}) } as any;
                  const contextWindow = analytics.contextWindow || { used: 0, limit: 200000, percentage: 0, remaining: 200000 };

                  // Skip update if new total is lower than current (stale data)
                  if (usage.totalContextTokens < contextWindow.used) {
                    console.log('[Store] 📊 Skipping stale mid-stream update:', {
                      current: contextWindow.used,
                      incoming: usage.totalContextTokens
                    });
                    return s;
                  }

                  // Update context window with mid-stream data
                  const rawPercentage = (usage.totalContextTokens / 200000) * 100;
                  analytics.contextWindow = {
                    used: usage.totalContextTokens,
                    limit: 200000,
                    percentage: rawPercentage,
                    remaining: Math.max(0, 200000 - usage.totalContextTokens)
                  };

                  // Update token breakdown
                  analytics.tokens = {
                    ...(analytics.tokens || {}),
                    total: usage.totalContextTokens,
                    input: usage.inputTokens,
                    output: usage.outputTokens,
                    cacheRead: usage.cacheReadTokens,
                    cacheCreation: usage.cacheCreationTokens,
                    cacheSize: usage.cacheReadTokens
                  };

                  return { ...s, analytics };
                })
              }));
            });

            // Combined cleanup function
            const cleanup = () => {
              if (messageCleanup) messageCleanup();
              if (focusCleanup) focusCleanup();
              if (tempMessageCleanup) tempMessageCleanup();
              if (contextUpdateCleanup) contextUpdateCleanup();
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
        localStorage.setItem(CURRENT_SESSION_KEY, sessionId);
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

        // Cancel any pending streaming_end timer when user sends a message
        // This prevents race condition where old timer fires after new message is sent
        cancelStreamingEndTimer(currentSessionId);

        // Set streaming=true immediately when user sends a message
        // This ensures streaming indicator shows before first response arrives
        set(state => ({
          sessions: state.sessions.map(s =>
            s.id === currentSessionId
              ? { ...s, streaming: true, thinkingStartTime: Date.now() }
              : s
          )
        }));

        // Detect manual /compact command and set compacting state for UI indicator
        if (content.trim() === '/compact') {
          console.log('[Store] 🗜️ Manual /compact command detected - setting compacting state');
          get().setCompacting(currentSessionId, true);
        }

        // Check if this session has pending auto-compact (compact on next user message)
        const sessionForCompact = get().sessions.find(s => s.id === currentSessionId);
        if (sessionForCompact?.compactionState?.pendingAutoCompact && !content.startsWith('/compact')) {
          // Double-check auto-compact is still enabled before executing
          // Use !== true to be extra safe - only proceed if explicitly enabled
          const autoCompactEnabled = get().autoCompactEnabled;
          if (autoCompactEnabled !== true) {
            console.log(`[Store] 🗜️ Pending auto-compact detected but auto-compact not enabled (value: ${autoCompactEnabled}) - clearing flag`);
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

              // Lock provider and model on first user message
              const currentModel = get().selectedModel;
              const currentProvider = getProviderForModel(currentModel);

              const updates: any = {
                messages: (() => {
                  let updatedMessages = [...s.messages, userMessage];
                  const MAX_MESSAGES = 500;
                  if (updatedMessages.length > MAX_MESSAGES) {
                    const removeCount = updatedMessages.length - MAX_MESSAGES;
                    updatedMessages = updatedMessages.slice(removeCount);
                  }
                  return updatedMessages;
                })(),
                // Lock provider and model to session if not already set
                provider: s.provider || currentProvider,
                model: s.model || currentModel
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
          const { autoGenerateTitle } = get();
          // Get current session data to pass claudeSessionId and workingDirectory
          // This fixes issues after interrupt or page refresh where claudeSessionStore is empty
          const sessionForSend = get().sessions.find(s => s.id === sessionToUse);
          // Use session's locked model, falling back to global selectedModel for new sessions
          const modelToUse = sessionForSend?.model || get().selectedModel;
          console.log('[Store] About to call claudeClient.sendMessage...');
          console.log('[Store] Sending to Claude with model:', modelToUse, 'sessionId:', sessionToUse, 'claudeSessionId:', sessionForSend?.claudeSessionId, 'autoGenerateTitle:', autoGenerateTitle);

          // Route based on provider - use Tauri for Gemini/OpenAI, Socket.IO for Claude
          const provider = sessionForSend?.provider || getProviderForModel(modelToUse);
          const useDirectTauri = provider === 'gemini' || provider === 'openai';
          console.log('[Store] Provider:', provider, 'useDirectTauri:', useDirectTauri);

          // Inject relevant memory context if memory is enabled
          if (get().memoryEnabled && get().memoryServerRunning) {
            try {
              const { memoryService } = await import('../services/memoryService');
              const memoryContext = await memoryService.getRelevantMemories(content);
              if (memoryContext) {
                console.log('[Store] Injecting memory context into message');
                content = `${memoryContext}\n\n${content}`;
              }
            } catch (memErr) {
              console.warn('[Store] Memory injection failed:', memErr);
            }
          }

          try {
            if (useDirectTauri) {
              // Use Tauri IPC for Gemini/OpenAI - bypass Socket.IO server
              console.log('[Store] Using Tauri for', provider, 'model:', modelToUse);
              await tauriClaudeClient.sendMessage(
                sessionToUse,
                content,
                modelToUse,
                autoGenerateTitle,
                sessionForSend?.claudeSessionId,
                sessionForSend?.workingDirectory
              );
            } else {
              // Use Socket.IO for Claude - ensure session exists first
              // This is needed when switching from Gemini/OpenAI to Claude, where no socket session was created
              if (!sessionForSend?.claudeSessionId) {
                console.log('[Store] Creating socket session for Claude (no claudeSessionId)');
                try {
                  await claudeClient.createSession(
                    sessionForSend?.name || 'new session',
                    sessionForSend?.workingDirectory || '/',
                    {
                      sessionId: sessionToUse,
                      messages: sessionForSend?.messages || [],
                      hasGeneratedTitle: !!sessionForSend?.claudeTitle
                    }
                  );
                  console.log('[Store] Socket session created successfully');
                } catch (createError) {
                  console.error('[Store] Failed to create socket session:', createError);
                  throw createError;
                }
              }
              await claudeClient.sendMessage(
                sessionToUse,
                content,
                modelToUse,
                autoGenerateTitle
              );
            }
            console.log('[Store] sendMessage completed successfully');
          } catch (sendError) {
            console.error('[Store] sendMessage failed:', sendError);
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
        localStorage.setItem(CURRENT_SESSION_KEY, sessionId);

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

        // Determine provider from session's model to select correct client
        const reconnectSession = get().sessions.find(s => s.id === sessionId);
        const sessionModel = reconnectSession?.analytics?.model || get().selectedModel || DEFAULT_MODEL_ID;
        const reconnectProvider = getProviderForModel(sessionModel);
        const useDirectTauriReconnect = reconnectProvider === 'gemini' || reconnectProvider === 'openai';
        const reconnectClient = useDirectTauriReconnect ? tauriClaudeClient : claudeClient;
        console.log(`[Store] Reconnect using provider: ${reconnectProvider}, tauri: ${useDirectTauriReconnect}`);

        // Initialize cleanup functions
        let focusCleanup: (() => void) | null = null;

        // Listen for title updates
        const titleCleanup = reconnectClient.onTitle(sessionId, (title: string) => {
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
        const errorCleanup = reconnectClient.onError(sessionId, (error) => {
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
        const messageCleanup = reconnectClient.onMessage(sessionId, (message) => {
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
              // CRITICAL FIX: Check for pending tools before clearing streaming
              const session = sessions.find(s => s.id === sessionId);
              const hasPendingTools = session?.pendingToolIds && session.pendingToolIds.size > 0;
              const hasSubagents = hasActiveSubagents(sessionId);

              if ((hasPendingTools || hasSubagents) && message.subtype === 'stream_end') {
                // Don't clear streaming - agent tools or subagents are still running
                console.log(`🔄 [STREAMING-FIX] stream_end (reconnect) but work pending - keeping streaming=true (pendingTools: ${session?.pendingToolIds?.size || 0}, subagents: ${hasSubagents})`);
                sessions = sessions.map(s =>
                  s.id === sessionId ? { ...s, runningBash: false, userBashRunning: false } : s
                );
              } else {
                // Clear subagent tracking on error/interrupt
                if (message.subtype === 'interrupted' || message.subtype === 'error') {
                  clearSubagentTracking(sessionId);
                }
                sessions = sessions.map(s =>
                  s.id === sessionId ? { ...s, streaming: false, runningBash: false, userBashRunning: false } : s
                );
              }
            }

            persistSessions(sessions);
            return { sessions };
          });
        });

        // Set up focus trigger listener (restores focus after bash commands)
        // NOTE: macOS server no longer emits trigger:focus - frontend guards handle it
        // This listener is now primarily for Windows
        const isMac = navigator.platform.includes('Mac');
        console.log(`[Store] Setting up focus trigger listener, reconnect (platform: ${navigator.platform})`);
        focusCleanup = claudeClient.onFocusTrigger(sessionId, () => {
          // On macOS, the frontend focus guards in ClaudeChat.tsx handle focus restoration
          // Calling restore_window_focus here would cause race conditions with the guards
          if (isMac) {
            console.log('[Store] Focus trigger received on macOS - skipping (guards handle it)');
            return;
          }

          console.log('[Store] 🎯 Focus trigger received, restoring window focus');
          // Use Tauri command to restore focus (Windows only now)
          if (window.__TAURI__) {
            import('@tauri-apps/api/core').then(({ invoke }) => {
              invoke('restore_window_focus').catch(console.warn);
            });
          }
          // window.focus() and direct input focus for Windows
          window.focus();
          const inputElement = document.querySelector('textarea.chat-input') as HTMLTextAreaElement;
          if (inputElement) {
            inputElement.focus();
          }
        });

        // Store cleanup function
        const sessionForCleanup = get().sessions.find(s => s.id === sessionId);
        if (sessionForCleanup) {
          (sessionForCleanup as any).cleanup = () => {
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

          // Determine provider from selected model for session creation
          const persistedModel = get().selectedModel || DEFAULT_MODEL_ID;
          const persistedProvider = getProviderForModel(persistedModel);
          const useDirectTauriPersisted = persistedProvider === 'gemini' || persistedProvider === 'openai';
          const persistedClient = useDirectTauriPersisted ? tauriClaudeClient : claudeClient;

          // Create/resume session with existing ID and claudeSessionId
          const result = await persistedClient.createSession('resumed session', workingDirectory, {
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
          const titleCleanup = persistedClient.onTitle(sessionId, (title: string) => {
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
          const errorCleanup = persistedClient.onError(sessionId, (error) => {
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
          const messageCleanup = persistedClient.onMessage(sessionId, (message) => {
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
                } else if (message.type === 'result') {
                  // Special handling for result messages without IDs
                  // Only allow ONE result per turn - find and merge with any existing result
                  let lastUserIndex = -1;
                  for (let i = existingMessages.length - 1; i >= 0; i--) {
                    if (existingMessages[i].type === 'user') {
                      lastUserIndex = i;
                      break;
                    }
                  }
                  const existingResultIndex = existingMessages.findIndex((m, idx) =>
                    m.type === 'result' && idx > lastUserIndex
                  );
                  if (existingResultIndex >= 0) {
                    // Merge with existing result
                    const existing = existingMessages[existingResultIndex];
                    existingMessages[existingResultIndex] = {
                      ...existing,
                      ...message,
                      usage: message.usage || existing.usage,
                      duration_ms: message.duration_ms || (existing as any).duration_ms,
                      total_cost_usd: message.total_cost_usd || (existing as any).total_cost_usd,
                      model: message.model || (existing as any).model,
                      result: message.result || (existing as any).result
                    };
                    console.log(`[Store] Merged result message without ID (loadSessionHistory dedup)`);
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
                // CRITICAL FIX: Check for pending tools before clearing streaming
                const session = sessions.find(s => s.id === sessionId);
                const hasPendingTools = session?.pendingToolIds && session.pendingToolIds.size > 0;
                const hasSubagents = hasActiveSubagents(sessionId);

                if ((hasPendingTools || hasSubagents) && message.subtype === 'stream_end') {
                  // Don't clear streaming - agent tools or subagents are still running
                  console.log(`🔄 [STREAMING-FIX] stream_end (temp) but work pending - keeping streaming=true (pendingTools: ${session?.pendingToolIds?.size || 0}, subagents: ${hasSubagents})`);
                  sessions = sessions.map(s =>
                    s.id === sessionId ? { ...s, runningBash: false, userBashRunning: false } : s
                  );
                } else {
                  // Clear subagent tracking on error/interrupt
                  if (message.subtype === 'interrupted' || message.subtype === 'error') {
                    clearSubagentTracking(sessionId);
                  }
                  // Clear streaming on interrupted/error OR stream_end with no pending tools
                  sessions = sessions.map(s =>
                    s.id === sessionId ? { ...s, streaming: false, runningBash: false, userBashRunning: false } : s
                  );
                }
              }

              return { sessions };
            });
          });

          // Set up mid-stream context update listener for resumed session
          // Only update if new value >= current to prevent UI flickering
          const contextUpdateCleanup = persistedClient.onContextUpdate(sessionId, (usage) => {
            console.log('[Store] 📊 Mid-stream context update (resumed):', {
              sessionId,
              total: usage.totalContextTokens,
              percentage: Math.round(usage.totalContextTokens / 2000) + '%'
            });

            set(state => ({
              sessions: state.sessions.map(s => {
                if (s.id !== sessionId) return s;

                const analytics = { ...(s.analytics || {}) } as any;
                const contextWindow = analytics.contextWindow || { used: 0, limit: 200000, percentage: 0, remaining: 200000 };

                // Skip update if new total is lower than current (stale data)
                if (usage.totalContextTokens < contextWindow.used) {
                  console.log('[Store] 📊 Skipping stale mid-stream update (resumed):', {
                    current: contextWindow.used,
                    incoming: usage.totalContextTokens
                  });
                  return s;
                }

                const rawPercentage = (usage.totalContextTokens / 200000) * 100;

                analytics.contextWindow = {
                  used: usage.totalContextTokens,
                  limit: 200000,
                  percentage: rawPercentage,
                  remaining: Math.max(0, 200000 - usage.totalContextTokens)
                };

                analytics.tokens = {
                  ...(analytics.tokens || {}),
                  total: usage.totalContextTokens,
                  input: usage.inputTokens,
                  output: usage.outputTokens,
                  cacheRead: usage.cacheReadTokens,
                  cacheCreation: usage.cacheCreationTokens,
                  cacheSize: usage.cacheReadTokens
                };

                return { ...s, analytics };
              })
            }));
          });

          // Combined cleanup function
          const cleanup = () => {
            messageCleanup();
            titleCleanup();
            errorCleanup();
            contextUpdateCleanup();
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
            localStorage.setItem(CURRENT_SESSION_KEY, newCurrentId);
          } else {
            localStorage.removeItem(CURRENT_SESSION_KEY);
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
        localStorage.removeItem(SESSIONS_KEY);
        localStorage.removeItem(CURRENT_SESSION_KEY);

        // Clear saved tabs when deleting all sessions
        const storeState = get();
        if (storeState.rememberTabs) {
          localStorage.removeItem(SAVED_TABS_KEY);
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
            if (s.id === newSessionId && s.analytics) {
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
                  assistantMessages: messagesToCopy.filter(m => m.type === 'assistant').length,
                  toolUses: s.analytics.toolUses || 0,
                  // Copy token analytics so context % is preserved
                  tokens: sourceSession.analytics?.tokens ? { ...sourceSession.analytics.tokens } : s.analytics.tokens,
                  compactPending: false // Never inherit compactPending from source
                }
              };
            }
            return s;
          })
        }));

        console.log('[Store] Session forked successfully:', newSessionId);
        return newSessionId;
      },

      forkSessionToProvider: async (sessionId: string, targetModelId: string) => {
        const { sessions, createSession, selectedModel: currentGlobalModel } = get();
        const sourceSession = sessions.find(s => s.id === sessionId);

        if (!sourceSession) {
          console.error('[Store] Cannot fork to provider: session not found', sessionId);
          return undefined;
        }

        console.log(`[Store] Forking session ${sessionId} to model ${targetModelId}`);

        // 1. Export history to standard format
        const historyToExport = sourceSession.messages.map(msg => ({
          role: msg.type === 'assistant' ? 'assistant' : msg.type === 'user' ? 'user' : 'system',
          content: typeof msg.message === 'string' ? msg.message : msg.message?.content || '',
          // Add tool calls if present (mostly for shim providers)
          toolCalls: (msg as any).tool_uses?.map((tu: any) => ({
            id: tu.id,
            name: tu.name,
            input: tu.input
          }))
        })).filter(m => m.content || (m.toolCalls && m.toolCalls.length > 0));

        const targetProvider = getProviderForModel(resolveModelId(targetModelId));
        let historyFilePath: string | undefined;
        let initialPromptOverride = '';

        if (targetProvider === 'claude') {
          // Direction B: Inject via prompt for Claude
          const condensedHistory = historyToExport
            .map(m => `[${m.role.toUpperCase()}]: ${m.content.substring(0, 1000)}${m.content.length > 1000 ? '...' : ''}`)
            .join('\n\n');
          
          initialPromptOverride = `I am continuing a session from another agent (${sourceSession.analytics?.model || 'unknown'}). Here is the conversation history so far for context:\n\n${condensedHistory}\n\n--- END HISTORY ---\n\nPlease use this context for our next steps. How can I help you further?`;
        } else {
          // Direction A: Write history to a temporary file for yume-cli (Gemini/OpenAI)
          try {
            const { invoke } = await import('@tauri-apps/api/core');
            const homeDir = await invoke<string>('get_home_directory');
            const tmpDir = `${homeDir}/.yume/tmp`;
            const fileName = `history_fork_${Date.now()}.json`;
            historyFilePath = `${tmpDir}/${fileName}`;

            await invoke('write_file_content', { 
              path: historyFilePath, 
              content: JSON.stringify(historyToExport, null, 2) 
            });
            console.log('[Store] Exported history to:', historyFilePath);
          } catch (err) {
            console.error('[Store] Failed to export history for cross-agent resume:', err);
          }
        }

        // 3. Temporarily set global selectedModel so createSession uses it
        const previousModel = currentGlobalModel;
        set({ selectedModel: targetModelId });

        // 4. Create a new session in the same working directory
        const newSessionId = await createSession(undefined, sourceSession.workingDirectory);

        // 5. Restore global model
        set({ selectedModel: previousModel });

        if (!newSessionId) {
          console.error('[Store] Failed to create forked session');
          return undefined;
        }

        // 6. Spawn the session with history file or prompt via Tauri client
        setTimeout(async () => {
          try {
            const { tauriClaudeClient } = await import('../services/tauriClaudeClient');
            await (tauriClaudeClient as any).spawnSession(undefined, sourceSession.workingDirectory!, {
              sessionId: newSessionId,
              model: targetModelId,
              prompt: initialPromptOverride, // Used for Claude
              historyFilePath: historyFilePath // Used for yume-cli
            });
          } catch (err) {
            console.error('[Store] Failed to spawn cross-agent session:', err);
          }
        }, 100);

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
          window.dispatchEvent(new CustomEvent(RESTORE_INPUT_EVENT, {
            detail: { sessionId: sessionIdToInterrupt, message: pendingCompactMessage }
          }));
          // Also clear from wrapperIntegration to prevent followup being sent
          import('../services/wrapperIntegration').then(({ clearAutoCompactMessage }) => {
            clearAutoCompactMessage(sessionIdToInterrupt!);
          });
        }

        // Only interrupt if session exists and is actually streaming
        if (sessionIdToInterrupt && sessionToInterrupt?.streaming) {
          // Clear subagent tracking on interrupt
          clearSubagentTracking(sessionIdToInterrupt);
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
                  pendingToolInfo: new Map(),
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

            // Fetch tokens from session file as fallback
            // Server sends interrupted message with wrapper.tokens but also fetch from file
            // to ensure context usage is updated even if message listener misses it
            if (sessionToInterrupt?.claudeSessionId && sessionToInterrupt?.workingDirectory) {
              fetchSessionTokensFromFile(sessionIdToInterrupt, sessionToInterrupt.claudeSessionId, sessionToInterrupt.workingDirectory).then(tokens => {
                if (tokens) {
                  console.log(`📊 [INTERRUPT] Fetched tokens from file as fallback:`, tokens);
                  get().updateSessionAnalyticsFromFile(sessionIdToInterrupt, tokens);
                }
              });
            }
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

        // Clear subagent tracking for this session
        clearSubagentTracking(sessionId);

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
                  pendingToolInfo: new Map(),
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
                  lineChanges: { added: 0, removed: 0 }, // Reset line changes counter for new session
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
        window.dispatchEvent(new CustomEvent(CHECK_RESUMABLE_EVENT));

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
        // Use setSelectedModel to also update session model
        get().setSelectedModel(newModel);
        const modelName = newModel.includes('opus') ? 'opus' : 'sonnet';
        toastService.info(`switched to ${modelName}`);
        console.log(`🔄 Model toggled to: ${newModel.includes('opus') ? 'Opus' : 'Sonnet'}`);
      },

      addMessageToSession: (sessionId: string, message: SDKMessage) => {
        // Add client timestamp if not already present (for duration calculation)
        if (!(message as any).clientTimestamp && !(message as any).timestamp) {
          (message as any).clientTimestamp = Date.now();
        }

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

              // If this is an interrupted message and bash was running, append "bash stopped"
              let processedMessage = message;
              if (message.type === 'system' && (message as any).subtype === 'interrupted' && s.runningBash) {
                const originalMsg = typeof message.message === 'string'
                  ? message.message
                  : (message.message?.content || 'task interrupted');
                processedMessage = {
                  ...message,
                  message: `${originalMsg} (bash stopped)`
                };
                console.log('[Store] Appended "bash stopped" to interrupt message');
              }

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
              // Use processedMessage for adding to array (may have "bash stopped" appended)
              let updatedMessages: typeof s.messages;
              if (processedMessage.id) {
                const existingIndex = s.messages.findIndex(m => m.id === processedMessage.id);
                if (existingIndex >= 0) {
                  // Update existing message instead of adding duplicate
                  updatedMessages = [...s.messages];
                  updatedMessages[existingIndex] = processedMessage;
                  console.log(`[Store] Updated existing message ${processedMessage.id} (dedup)`);
                } else {
                  updatedMessages = [...s.messages, processedMessage];
                }
              } else if (processedMessage.type === 'result') {
                // Special handling for result messages without IDs
                // Only allow ONE result per turn - find and merge with any existing result
                const messages = [...s.messages];
                let lastUserIndex = -1;
                for (let i = messages.length - 1; i >= 0; i--) {
                  if (messages[i].type === 'user') {
                    lastUserIndex = i;
                    break;
                  }
                }
                const existingResultIndex = messages.findIndex((m, idx) =>
                  m.type === 'result' && idx > lastUserIndex
                );
                if (existingResultIndex >= 0) {
                  // Merge with existing result
                  const existing = messages[existingResultIndex];
                  messages[existingResultIndex] = {
                    ...existing,
                    ...processedMessage,
                    usage: processedMessage.usage || existing.usage,
                    duration_ms: processedMessage.duration_ms || (existing as any).duration_ms,
                    total_cost_usd: processedMessage.total_cost_usd || (existing as any).total_cost_usd,
                    model: processedMessage.model || (existing as any).model,
                    result: processedMessage.result || (existing as any).result
                  };
                  console.log(`[Store] Merged result message (dedup)`);
                  updatedMessages = messages;
                } else {
                  updatedMessages = [...s.messages, processedMessage];
                }
              } else {
                updatedMessages = [...s.messages, processedMessage];
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
                // CRITICAL: Calculate duration_ms from thinkingStartTime if not provided by server
                // This is needed for resumed sessions where messages flow through addMessageToSession
                // rather than the createSession handler which has this same logic
                if (!message.duration_ms && s.thinkingStartTime) {
                  const calculatedDuration = Date.now() - s.thinkingStartTime;
                  (message as any).duration_ms = calculatedDuration;
                  console.log(`⏱️ [ELAPSED-TIME] Calculated duration_ms from thinkingStartTime in addMessageToSession: ${calculatedDuration}ms`);
                } else if (!message.duration_ms) {
                  console.warn(`⏱️ [ELAPSED-TIME] No duration_ms and no thinkingStartTime for session ${sessionId} in addMessageToSession`);
                  (message as any).duration_ms = 0;
                }

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
                    // Check if auto-compact is enabled before triggering any compaction logic
                    // Use !== true for extra safety - only proceed if explicitly enabled
                    const autoCompactEnabled = get().autoCompactEnabled;
                    if (autoCompactEnabled !== true) {
                      console.log(`🗜️ [COMPACTION] Auto-compact not enabled (value: ${autoCompactEnabled}), skipping check at ${contextPercentage.toFixed(2)}%`);
                    } else {
                      console.log(`🗜️ [COMPACTION] Checking auto-compact in addMessageToSession: ${contextPercentage.toFixed(2)}% (${trackedContextTokens} tracked tokens)`);
                      import('../services/compactionService').then(({ compactionService }) => {
                        compactionService.updateContextUsage(sessionId, contextPercentage);
                      }).catch(err => console.error('[Compaction] Failed to import compactionService:', err));
                    }
                  }
                }
              }

              // Handle tool_use messages with fileSnapshot for line change tracking
              let lineChanges = { ...(s.lineChanges || { added: 0, removed: 0 }) };
              let restorePoints = [...(s.restorePoints || [])];
              let modifiedFiles = new Set(s.modifiedFiles || []);

              if (message.type === 'tool_use' && (message as any).fileSnapshot) {
                const snapshot = (message as any).fileSnapshot;
                const toolName = (message as any).message?.name || 'unknown';
                const msgInput = (message as any).message?.input;
                const operation = toolName === 'Write' ? 'write' : toolName === 'MultiEdit' ? 'multiedit' : 'edit';

                console.log('[Store] 📸 Processing fileSnapshot in addMessageToSession:', {
                  toolName,
                  operation,
                  hasOriginalContent: !!snapshot.originalContent,
                  isNewFile: snapshot.isNewFile,
                  path: snapshot.path
                });

                // Calculate line changes
                if (snapshot.isNewFile) {
                  const newContent = msgInput?.content || msgInput?.new_string || '';
                  const newLines = newContent ? newContent.split('\n').length : 0;
                  lineChanges.added += newLines;
                } else if (operation === 'edit') {
                  const oldStr = msgInput?.old_string || '';
                  const newStr = msgInput?.new_string || '';
                  const removedLines = oldStr ? oldStr.split('\n').length : 0;
                  const addedLines = newStr ? newStr.split('\n').length : 0;
                  lineChanges.added += addedLines;
                  lineChanges.removed += removedLines;
                } else if (operation === 'write') {
                  const newContent = msgInput?.content || '';
                  const oldContent = snapshot.originalContent || '';
                  const newLines = newContent ? newContent.split('\n').length : 0;
                  const oldLines = oldContent ? oldContent.split('\n').length : 0;
                  if (newLines > oldLines) {
                    lineChanges.added += (newLines - oldLines);
                  } else if (oldLines > newLines) {
                    lineChanges.removed += (oldLines - newLines);
                  }
                }

                console.log(`📸 [Store] Line changes updated: +${lineChanges.added} -${lineChanges.removed}`);

                // Track modified file
                if (snapshot.path) {
                  modifiedFiles.add(snapshot.path);

                  // Create restore point for session tab file list
                  const newContent = msgInput?.content || msgInput?.new_string || '';
                  const fileSnapshot: FileSnapshot = {
                    path: snapshot.path,
                    content: newContent,
                    operation,
                    timestamp: snapshot.timestamp || Date.now(),
                    messageIndex: updatedMessages.length - 1,
                    originalContent: snapshot.originalContent || '',
                    isNewFile: snapshot.isNewFile || false,
                    mtime: snapshot.mtime,
                    sessionId: s.id
                  };
                  restorePoints.push({
                    messageIndex: updatedMessages.length - 1,
                    timestamp: Date.now(),
                    fileSnapshots: [fileSnapshot],
                    description: `${operation} ${snapshot.path.split(/[/\\]/).pop()}`
                  });
                  // Limit restore points
                  if (restorePoints.length > MAX_RESTORE_POINTS_PER_SESSION) {
                    restorePoints = restorePoints.slice(-MAX_RESTORE_POINTS_PER_SESSION);
                  }
                  console.log(`📸 [Store] Created restore point for: ${snapshot.path}`);
                }
              }

              // Track pending tools for context center display (bash/agent indicators)
              let pendingToolIds = new Set(s.pendingToolIds || []);
              let pendingToolInfo = new Map(s.pendingToolInfo || []);
              let pendingToolCounter = s.pendingToolCounter || 0;

              if (message.type === 'tool_use') {
                const toolId = (message as any).message?.id;
                const toolName = (message as any).message?.name || 'unknown';
                if (toolId) {
                  pendingToolIds.add(toolId);
                  pendingToolInfo.set(toolId, { name: toolName, startTime: Date.now() });
                  pendingToolCounter++;
                  console.log(`[ContextCenter] ✅ Added tool ${toolId} (${toolName}) to pendingToolInfo. Size: ${pendingToolInfo.size}`);
                }
              } else if (message.type === 'tool_result') {
                const toolUseId = (message as any).message?.tool_use_id;
                // Clear from subagent tracking (in case this was a Task tool result)
                if (toolUseId) {
                  clearSubagentParent(sessionId, toolUseId);
                }
                if (toolUseId && pendingToolIds.has(toolUseId)) {
                  pendingToolIds.delete(toolUseId);
                  pendingToolInfo.delete(toolUseId);
                  pendingToolCounter++;
                  console.log(`[ContextCenter] ❌ Removed tool ${toolUseId} from pendingToolInfo. Size: ${pendingToolInfo.size}`);
                }
              }

              // CRITICAL FIX: When result message arrives, clear streaming state immediately
              // This fixes the Windows bug where streaming_end debounce timer doesn't clear streaming
              // because lastMessageTime was updated too recently (< 2000ms debounce window)
              let shouldClearStreaming = false;
              if (message.type === 'result' && !message.is_error) {
                // CRITICAL: If result has duration_ms, this is the FINAL authoritative signal
                // Force-clear streaming regardless of pending tools (they should be done)
                const hasDurationMs = typeof message.duration_ms === 'number' && message.duration_ms > 0;
                const hasPendingTools = pendingToolIds.size > 0;
                const hasSubagents = hasActiveSubagents(sessionId);

                if (hasDurationMs || (!hasPendingTools && !hasSubagents)) {
                  shouldClearStreaming = true;
                  // Cancel any pending streaming_end debounce timers - result is authoritative
                  cancelStreamingEndTimer(sessionId);
                  // Force-clear all pending state since result with duration is authoritative
                  if (hasDurationMs) {
                    pendingToolIds.clear();
                    pendingToolInfo.clear();
                  }
                  // Clear subagent tracking
                  clearSubagentTracking(sessionId);
                  // Play completion sound
                  get().playCompletionSound();
                  console.log(`🎯 [STREAMING-FIX] Result in addMessageToSession - clearing streaming for ${sessionId} (hasDurationMs: ${hasDurationMs})`);
                } else {
                  console.log(`🔄 [STREAMING-FIX] Result in addMessageToSession but work pending - keeping streaming (tools: ${pendingToolIds.size}, subagents: ${hasSubagents})`);
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
                lineChanges,
                restorePoints,
                modifiedFiles,
                pendingToolIds,
                pendingToolInfo,
                pendingToolCounter,
                // Force React re-render by updating a counter (fixes bash output not showing)
                messageUpdateCounter: newCounter,
                // Clear thinkingStartTime after we've used it for result
                ...(shouldClearThinkingTime ? { thinkingStartTime: undefined } : {}),
                // CRITICAL: Clear streaming state when result message arrives (fixes Windows streaming bug)
                ...(shouldClearStreaming ? { streaming: false, runningBash: false, userBashRunning: false } : {})
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

            // Find the last message with wrapper.tokens to restore context usage
            // Search backwards through kept messages for most recent token data
            let restoredTokens = {
              input: 0,
              output: 0,
              total: 0,
              cacheSize: 0,
              cacheCreation: 0,
              byModel: session.analytics?.tokens?.byModel || {
                opus: { input: 0, output: 0, total: 0 },
                sonnet: { input: 0, output: 0, total: 0 }
              }
            };

            for (let i = restoredMessages.length - 1; i >= 0; i--) {
              const msg = restoredMessages[i];
              if (msg.wrapper?.tokens) {
                restoredTokens = {
                  ...restoredTokens,
                  input: msg.wrapper.tokens.input ?? 0,
                  output: msg.wrapper.tokens.output ?? 0,
                  total: msg.wrapper.tokens.total ?? 0,
                  cacheSize: msg.wrapper.tokens.cache_read ?? 0,
                  cacheCreation: msg.wrapper.tokens.cache_creation ?? 0
                };
                console.log(`[restoreToMessage] Found token data at message ${i}:`, restoredTokens);
                break;
              }
            }

            // Calculate context window from restored tokens
            const contextPercentage = (restoredTokens.total / 200000) * 100;
            const restoredContextWindow = {
              used: restoredTokens.total,
              limit: 200000,
              percentage: contextPercentage,
              remaining: Math.max(0, 200000 - restoredTokens.total)
            };

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
                // Restore token counts to match the rollback point
                tokens: restoredTokens,
                // Restore context window to match the rollback point
                contextWindow: restoredContextWindow,
                cost: session.analytics?.cost || { total: 0, byModel: { opus: 0, sonnet: 0 } },
                lastActivity: new Date(),
                thinkingTime: session.analytics?.thinkingTime || 0,
                compactPending: false // Clear compactPending on restore
              }
            };

            // Notify server to clear the Claude session
            claudeClient.clearSession(sessionId);

            console.log(`Restored session ${sessionId} to message ${messageIndex}, kept ${filteredRestorePoints.length} restorePoints, context: ${contextPercentage.toFixed(2)}%`);
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
        localStorage.setItem(MONO_FONT_KEY, font);
        console.log('[Store] Set mono font:', font);
      },

      setSansFont: (font: string) => {
        set({ sansFont: font });
        // Apply to CSS variable with proper formatting
        document.documentElement.style.setProperty('--font-sans', `"${font}", sans-serif`);
        // Save to localStorage
        localStorage.setItem(SANS_FONT_KEY, font);
        console.log('[Store] Set sans font:', font);
      },

      setFontSize: (size: number) => {
        // Clamp size between 8 and 18
        const clampedSize = Math.max(8, Math.min(18, size));
        set({ fontSize: clampedSize });

        // Calculate all font size variables proportionally (more subtle differences)
        const xs = Math.round(clampedSize * 0.9);
        const sm = Math.round(clampedSize * 0.95);
        const base = clampedSize;
        const lg = Math.round(clampedSize * 1.05);
        const xl = Math.round(clampedSize * 1.1);
        const xxl = Math.round(clampedSize * 1.2);

        // Apply to CSS variables
        document.documentElement.style.setProperty('--text-xs', `${xs}px`);
        document.documentElement.style.setProperty('--text-sm', `${sm}px`);
        document.documentElement.style.setProperty('--text-base', `${base}px`);
        document.documentElement.style.setProperty('--text-lg', `${lg}px`);
        document.documentElement.style.setProperty('--text-xl', `${xl}px`);
        document.documentElement.style.setProperty('--text-2xl', `${xxl}px`);

        // Save to localStorage
        localStorage.setItem(FONT_SIZE_KEY, String(clampedSize));
        console.log('[Store] Set font size:', clampedSize, 'px');
      },

      setLineHeight: (height: number) => {
        // Clamp between 0.9 and 2.0
        const clampedHeight = Math.max(0.9, Math.min(2.0, height));
        set({ lineHeight: clampedHeight });

        // Calculate line height variations
        const tight = Math.max(0.9, clampedHeight - 0.3);
        const normal = clampedHeight;
        const relaxed = clampedHeight + 0.25;

        // Apply to CSS variables
        document.documentElement.style.setProperty('--leading-tight', String(tight));
        document.documentElement.style.setProperty('--leading-normal', String(normal));
        document.documentElement.style.setProperty('--leading-relaxed', String(relaxed));

        // Save to localStorage
        localStorage.setItem(LINE_HEIGHT_KEY, String(clampedHeight));
        console.log('[Store] Set line height:', clampedHeight);
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
        localStorage.setItem(BG_OPACITY_KEY, clampedOpacity.toString());
        console.log('[Store] Set background opacity:', clampedOpacity, 'alpha:', alpha, 'color:', bgColor);
      },

      // Tab persistence
      setRememberTabs: (remember: boolean) => {
        set({ rememberTabs: remember });
        localStorage.setItem(REMEMBER_TABS_KEY, JSON.stringify(remember));

        if (remember) {
          // Save current tabs immediately when enabled
          const state = get();
          state.saveTabs();
        } else {
          // Clear saved tabs when disabled
          localStorage.removeItem(SAVED_TABS_KEY);
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

        localStorage.setItem(SAVED_TABS_KEY, JSON.stringify(tabPaths));
        localStorage.setItem(SAVED_TABS_ENHANCED_KEY, JSON.stringify(tabData));
        console.log('[Store] Saved tab paths:', tabPaths);
      },

      restoreTabs: async () => {
        const state = get();
        if (!state.rememberTabs) return;

        // Try to load enhanced format first, fall back to legacy format
        const enhancedStored = localStorage.getItem(SAVED_TABS_ENHANCED_KEY);
        const legacyStored = localStorage.getItem(SAVED_TABS_KEY);

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
        localStorage.setItem(AUTO_GENERATE_TITLE_KEY, JSON.stringify(autoGenerate));
        console.log('[Store] Auto-generate title:', autoGenerate);
      },

      setWordWrap: (wrap: boolean) => {
        set({ wordWrap: wrap });
        localStorage.setItem(WORD_WRAP_KEY, JSON.stringify(wrap));
        // Apply CSS class to document for global content wrapping
        if (wrap) {
          document.documentElement.classList.add('word-wrap');
        } else {
          document.documentElement.classList.remove('word-wrap');
        }
        console.log('[Store] Word wrap:', wrap, 'Class list:', document.documentElement.classList.contains('word-wrap'));
      },

      setSoundOnComplete: (enabled: boolean) => {
        set({ soundOnComplete: enabled });
        localStorage.setItem(SOUND_ON_COMPLETE_KEY, JSON.stringify(enabled));
        console.log('[Store] Sound on complete:', enabled);
      },

      playCompletionSound: async () => {
        const { soundOnComplete } = get();
        if (!soundOnComplete) {
          console.log('[Store] Sound disabled, skipping');
          return;
        }

        // Debounce: prevent double-play when multiple completion signals fire close together
        const now = Date.now();
        if (now - lastCompletionSoundTime < COMPLETION_SOUND_DEBOUNCE_MS) {
          console.log('[Store] Sound debounced - too soon since last play');
          return;
        }
        lastCompletionSoundTime = now;

        console.log('[Store] Playing completion sound...');

        try {
          // Create a minimal, unobtrusive completion sound using Web Audio API
          const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

          // Resume context if suspended (required after page load without user gesture)
          if (audioContext.state === 'suspended') {
            console.log('[Store] Audio context suspended, resuming...');
            await audioContext.resume();
          }
          console.log('[Store] Audio context state:', audioContext.state);

          const now = audioContext.currentTime;

          // Create a soft, gentle two-tone chime
          const createTone = (frequency: number, startTime: number, duration: number, gain: number) => {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(frequency, startTime);

            // Soft attack and decay envelope
            gainNode.gain.setValueAtTime(0, startTime);
            gainNode.gain.linearRampToValueAtTime(gain, startTime + 0.02); // Quick attack
            gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration); // Gentle decay

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.start(startTime);
            oscillator.stop(startTime + duration);
          };

          // Create a subtle click using noise burst
          const createClick = (startTime: number, gain: number) => {
            const bufferSize = audioContext.sampleRate * 0.008; // 8ms click
            const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
            const data = buffer.getChannelData(0);

            // Short noise burst for click
            for (let i = 0; i < bufferSize; i++) {
              const envelope = Math.exp(-i / (bufferSize * 0.15)); // Sharp decay
              data[i] = (Math.random() * 2 - 1) * envelope;
            }

            const source = audioContext.createBufferSource();
            const gainNode = audioContext.createGain();
            const filter = audioContext.createBiquadFilter();

            filter.type = 'highpass';
            filter.frequency.value = 2000; // High pass for crisp click

            source.buffer = buffer;
            gainNode.gain.value = gain;

            source.connect(filter);
            filter.connect(gainNode);
            gainNode.connect(audioContext.destination);

            source.start(startTime);
          };

          // Click + first tone together, then second tone
          createClick(now, 0.15);                     // Subtle click
          createTone(880, now, 0.15, 0.25);           // A5 - first note (same time as click)
          createTone(1108.73, now + 0.05, 0.2, 0.2); // C#6 - second note (major third up)

          // Clean up audio context after sound completes
          setTimeout(() => {
            audioContext.close();
          }, 500);

          console.log('[Store] Sound played successfully');
        } catch (err) {
          console.warn('[Store] Could not play completion sound:', err);
        }
      },

      setShowResultStats: (show: boolean) => {
        set({ showResultStats: show });
        localStorage.setItem(SHOW_RESULT_STATS_KEY, JSON.stringify(show));
        console.log('[Store] Show result stats:', show);
      },

      setShowConfirmDialogs: (show: boolean) => {
        set({ showConfirmDialogs: show });
        localStorage.setItem(SHOW_CONFIRM_DIALOGS_KEY, JSON.stringify(show));
        console.log('[Store] Show confirm dialogs:', show);
      },

      setAutoCompactEnabled: (enabled: boolean) => {
        set({ autoCompactEnabled: enabled });
        localStorage.setItem(AUTO_COMPACT_ENABLED_KEY, JSON.stringify(enabled));
        console.log('[Store] Auto-compact enabled:', enabled);

        // When disabling auto-compact, clear all pending auto-compact flags
        // This prevents any queued compaction from triggering
        if (!enabled) {
          console.log('[Store] Clearing all pendingAutoCompact flags');
          set(state => ({
            sessions: state.sessions.map(s =>
              s.compactionState?.pendingAutoCompact
                ? { ...s, compactionState: { ...s.compactionState, pendingAutoCompact: false } }
                : s
            )
          }));
        }
      },

      setShowProjectsMenu: (show: boolean) => {
        set({ showProjectsMenu: show });
        localStorage.setItem(SHOW_PROJECTS_MENU_KEY, JSON.stringify(show));
      },

      setShowAgentsMenu: (show: boolean) => {
        set({ showAgentsMenu: show });
        localStorage.setItem(SHOW_AGENTS_MENU_KEY, JSON.stringify(show));
      },

      setShowAnalyticsMenu: (show: boolean) => {
        set({ showAnalyticsMenu: show });
        localStorage.setItem(SHOW_ANALYTICS_MENU_KEY, JSON.stringify(show));
      },

      setShowCommandsSettings: (show: boolean) => {
        set({ showCommandsSettings: show });
        localStorage.setItem(SHOW_COMMANDS_SETTINGS_KEY, JSON.stringify(show));
      },

      setShowMcpSettings: (show: boolean) => {
        set({ showMcpSettings: show });
        localStorage.setItem(SHOW_MCP_SETTINGS_KEY, JSON.stringify(show));
      },

      setShowHooksSettings: (show: boolean) => {
        set({ showHooksSettings: show });
        localStorage.setItem(SHOW_HOOKS_SETTINGS_KEY, JSON.stringify(show));
      },

      setShowPluginsSettings: (show: boolean) => {
        set({ showPluginsSettings: show });
        localStorage.setItem(SHOW_PLUGINS_SETTINGS_KEY, JSON.stringify(show));
      },

      setShowSkillsSettings: (show: boolean) => {
        set({ showSkillsSettings: show });
        localStorage.setItem(SHOW_SKILLS_SETTINGS_KEY, JSON.stringify(show));
      },

      setShowDictation: (show: boolean) => {
        set({ showDictation: show });
        localStorage.setItem(SHOW_DICTATION_KEY, JSON.stringify(show));
      },

      setContextBarVisibility: (visibility: { showCommandPalette: boolean; showDictation: boolean; showFilesPanel: boolean; showHistory: boolean }) => {
        set({ contextBarVisibility: visibility });
        localStorage.setItem(CONTEXT_BAR_VISIBILITY_KEY, JSON.stringify(visibility));
      },

      setMemoryEnabled: (enabled: boolean) => {
        set({ memoryEnabled: enabled });
        localStorage.setItem(MEMORY_ENABLED_KEY, JSON.stringify(enabled));
      },

      setMemoryServerRunning: (running: boolean) => {
        set({ memoryServerRunning: running });
      },

      setMemoryRetentionDays: (days: number) => {
        set({ memoryRetentionDays: days });
        localStorage.setItem(MEMORY_RETENTION_DAYS_KEY, JSON.stringify(days));
      },

      setVscodeExtensionEnabled: (enabled: boolean) => {
        set({ vscodeExtensionEnabled: enabled });
        localStorage.setItem(VSCODE_EXTENSION_ENABLED_KEY, JSON.stringify(enabled));
      },

      setVscodeStatus: (connected: boolean, count: number) => {
        set({ vscodeConnected: connected, vscodeConnectionCount: count });
      },

      setUpdateAvailable: (hasUpdate: boolean, latestVersion: string | null) => {
        set({ hasUpdateAvailable: hasUpdate, latestVersion });
      },

      checkForUpdates: async () => {
        console.log('[Store] checkForUpdates called');
        try {
          const { checkForUpdates: checkVersion } = await import('../services/versionCheck');
          const result = await checkVersion();
          console.log('[Store] Version check result:', result);
          set({ hasUpdateAvailable: result.hasUpdate, latestVersion: result.latestVersion });
          console.log('[Store] Update state set - hasUpdateAvailable:', result.hasUpdate, 'latestVersion:', result.latestVersion);
        } catch (err) {
          console.error('[Store] Failed to check for updates:', err);
        }
      },

      checkVscodeInstallation: async () => {
        try {
          const installed = await invoke<boolean>('is_vscode_installed');
          set({ isVscodeInstalled: installed });
          console.log('[Store] VSCode installation check:', installed);
        } catch (err) {
          console.error('[Store] Failed to check VSCode installation:', err);
          set({ isVscodeInstalled: false });
        }
      },

      fetchClaudeVersion: async () => {
        try {
          // Use get_claude_version command which is exported in commands/mod.rs
          // It's defined in commands/mod.rs but might call claude_binary functions
          const version = await invoke<string>('get_claude_version');
          
          // Clean up version string
          let cleanVersion = version;
          const versionMatch = version.match(/(\d+\.\d+\.\d+)/);
          if (versionMatch) {
            cleanVersion = versionMatch[1];
          } else if (version && version !== 'unknown') {
            cleanVersion = version.replace('claude', '').trim();
          }
          
          set({ claudeVersion: cleanVersion });
          console.log('[Store] Claude version check:', cleanVersion);
        } catch (err) {
          console.error('[Store] Failed to check Claude version:', err);
          set({ claudeVersion: null });
        }
      },

      setIsDraggingTab: (isDragging: boolean) => {
        set({ isDraggingTab: isDragging });
      },

      // Agent management
      addAgent: (agent: Agent) => {
        const agents = [...get().agents, agent];
        set({ agents });
        // Persist to localStorage
        localStorage.setItem(AGENTS_KEY, JSON.stringify(agents));
        console.log('[Store] Added agent:', agent.name);
      },

      updateAgent: (updatedAgent: Agent) => {
        const agents = get().agents.map(agent =>
          agent.id === updatedAgent.id ? updatedAgent : agent
        );
        set({ agents });
        // Persist to localStorage
        localStorage.setItem(AGENTS_KEY, JSON.stringify(agents));
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
        localStorage.setItem(AGENTS_KEY, JSON.stringify(agents));
        console.log('[Store] Deleted agent:', agentId);
      },

      selectAgent: (agentId: string | null) => {
        set({ currentAgentId: agentId });
        // Persist selection to localStorage
        if (agentId) {
          localStorage.setItem(CURRENT_AGENT_KEY, agentId);
        } else {
          localStorage.removeItem(CURRENT_AGENT_KEY);
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
        localStorage.setItem(AGENTS_KEY, JSON.stringify(mergedAgents));
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
        localStorage.setItem(SESSION_MAPPINGS_KEY, JSON.stringify(mappings));

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
          const stored = localStorage.getItem(SESSION_MAPPINGS_KEY);
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
        localStorage.setItem(SESSION_MAPPINGS_KEY, JSON.stringify(state.sessionMappings));
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

        // Determine provider from selected model for deferred spawn
        const deferredModel = get().selectedModel || DEFAULT_MODEL_ID;
        const deferredProvider = getProviderForModel(deferredModel);
        const useDirectTauriDeferred = deferredProvider === 'gemini' || deferredProvider === 'openai';
        const deferredClient = useDirectTauriDeferred ? tauriClaudeClient : claudeClient;

        // Set up the message listener with the real session ID
        console.log('[Store] 🎯 Setting up deferred message listener for:', realSessionId, 'provider:', deferredProvider);
        const messageCleanup = deferredClient.onMessage(realSessionId, (message) => {
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
              } else if (message.type === 'result') {
                // Special handling for result messages without IDs
                // Only allow ONE result per turn - find and merge with any existing result
                let lastUserIndex = -1;
                for (let i = messages.length - 1; i >= 0; i--) {
                  if (messages[i].type === 'user') {
                    lastUserIndex = i;
                    break;
                  }
                }
                const existingResultIndex = messages.findIndex((m, idx) =>
                  m.type === 'result' && idx > lastUserIndex
                );
                if (existingResultIndex >= 0) {
                  // Merge with existing result
                  const existing = messages[existingResultIndex];
                  messages[existingResultIndex] = {
                    ...existing,
                    ...message,
                    usage: message.usage || existing.usage,
                    duration_ms: message.duration_ms || (existing as any).duration_ms,
                    total_cost_usd: message.total_cost_usd || (existing as any).total_cost_usd,
                    model: message.model || (existing as any).model,
                    result: message.result || (existing as any).result
                  };
                  console.log('[Store] 🎯 Merged result message without ID');
                } else {
                  console.log('[Store] 🎯 Adding first result message');
                  messages.push(message);
                }
              } else {
                console.log('[Store] 🎯 Adding message without ID');
                messages.push(message);
              }

              // Only update streaming state for assistant messages or explicit stop signals
              // Don't turn off streaming for intermediate messages like usage/result partial
              let newStreaming = s.streaming;
              if (message.type === 'assistant') {
                newStreaming = message.streaming === true;
              } else if (message.type === 'result' || message.type === 'message_stop') {
                // Explicit end signals
                newStreaming = false;
              }
              // Keep streaming true for other message types (usage, tool_use, tool_result, etc)
              console.log('[Store] 🎯 Session streaming state:', s.streaming, '->', newStreaming, 'msgType:', message.type);

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
        fontSize: state.fontSize,
        lineHeight: state.lineHeight,
        rememberTabs: state.rememberTabs,
        autoGenerateTitle: state.autoGenerateTitle,
        wordWrap: state.wordWrap,
        soundOnComplete: state.soundOnComplete,
        showResultStats: state.showResultStats,
        showConfirmDialogs: state.showConfirmDialogs,
        autoCompactEnabled: state.autoCompactEnabled,
        showProjectsMenu: state.showProjectsMenu,
        showAgentsMenu: state.showAgentsMenu,
        showAnalyticsMenu: state.showAnalyticsMenu,
        showCommandsSettings: state.showCommandsSettings,
        showMcpSettings: state.showMcpSettings,
        showHooksSettings: state.showHooksSettings,
        showPluginsSettings: state.showPluginsSettings,
        showSkillsSettings: state.showSkillsSettings,
        showDictation: state.showDictation,
        contextBarVisibility: state.contextBarVisibility,
        memoryEnabled: state.memoryEnabled,
        memoryRetentionDays: state.memoryRetentionDays,
        vscodeExtensionEnabled: state.vscodeExtensionEnabled,
        agents: state.agents,
        currentAgentId: state.currentAgentId
        // Do NOT persist sessionId - sessions should not survive app restarts
      }),
      onRehydrateStorage: () => (state) => {
        // Apply word-wrap class on rehydration if setting is enabled
        if (state?.wordWrap) {
          document.documentElement.classList.add('word-wrap');
        }
      }
    }
  )
);
