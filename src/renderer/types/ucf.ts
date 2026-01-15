/**
 * Unified Conversation Format (UCF) v1.0
 *
 * Provider-agnostic format for storing and translating conversations
 * between Claude, Gemini, and OpenAI.
 *
 * See docs/expansion-plan/CONVERSATION_PORTABILITY.md for full spec.
 */

// =============================================================================
// Provider Types
// =============================================================================

export type ProviderType = 'claude' | 'gemini' | 'openai';

export interface ProviderUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  cost: number;
}

// =============================================================================
// Content Types
// =============================================================================

export type UnifiedContentType =
  | 'text'
  | 'thinking'
  | 'code'
  | 'image'
  | 'artifact'
  | 'error'
  | 'file';

export interface UnifiedTextContent {
  type: 'text';
  text: string;
}

export interface UnifiedThinkingContent {
  type: 'thinking';
  text: string;
  provider: ProviderType;
  model?: string;
  hidden?: boolean; // For O1/O3 where reasoning is billed but not shown
}

export interface UnifiedCodeContent {
  type: 'code';
  language: string;
  code: string;
  filename?: string;
}

export interface UnifiedImageContent {
  type: 'image';
  mimeType: string;
  data?: string; // Base64
  url?: string;
  alt?: string;
}

export interface UnifiedArtifactContent {
  type: 'artifact';
  artifactId: string;
  artifactType: 'code' | 'document' | 'react' | 'svg' | 'mermaid' | 'html';
  title?: string;
  content: string;
  language?: string;
}

export interface UnifiedErrorContent {
  type: 'error';
  text: string;
  code?: string;
}

export interface UnifiedFileContent {
  type: 'file';
  path: string;
  mimeType?: string;
  content?: string; // For text files
  data?: string; // For binary (base64)
}

export type UnifiedContent =
  | UnifiedTextContent
  | UnifiedThinkingContent
  | UnifiedCodeContent
  | UnifiedImageContent
  | UnifiedArtifactContent
  | UnifiedErrorContent
  | UnifiedFileContent;

// =============================================================================
// Tool Types
// =============================================================================

export type ToolStatus = 'pending' | 'completed' | 'error';

export interface UnifiedToolCall {
  id: string; // Normalized ID (provider-agnostic)
  originalId: string; // Original provider ID
  name: string;
  input: Record<string, unknown>;
  status: ToolStatus;
  startTime?: string; // ISO timestamp
  endTime?: string; // ISO timestamp
}

export interface UnifiedToolResult {
  toolCallId: string;
  originalToolCallId: string;
  name: string;
  content: string;
  isError: boolean;
  truncated?: boolean;
}

// =============================================================================
// Message Types
// =============================================================================

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool_result';

export interface MessageUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  cost?: number;
}

export interface UnifiedMessage {
  id: string;
  timestamp: string; // ISO timestamp

  // Who created this message
  role: MessageRole;
  provider: ProviderType | 'user' | 'system';
  model?: string;

  // Content in normalized format
  content: UnifiedContent[];

  // Tool interactions
  toolCalls?: UnifiedToolCall[];
  toolResults?: UnifiedToolResult[];

  // Usage for this specific message
  usage?: MessageUsage;

  // Provider-specific data (preserved for round-tripping)
  _providerData?: Record<string, unknown>;
}

// =============================================================================
// Provider Switch Types
// =============================================================================

export interface ProviderSwitch {
  timestamp: string;
  fromProvider: ProviderType;
  toProvider: ProviderType;
  fromModel: string;
  toModel: string;
  messageIndex: number; // Index in messages array where switch occurred
  reason?: string; // User-provided reason
  warnings?: string[]; // Any warnings shown to user
  contextSummarized?: boolean; // If context was summarized during switch
  originalTokenCount?: number;
  summarizedTokenCount?: number;
}

// =============================================================================
// Session/Conversation Types
// =============================================================================

export interface ProviderState {
  claude?: {
    sessionId: string;
    sessionFile: string; // Path to JSONL
    lastSyncedAt?: string;
  };
  gemini?: {
    sessionId: string;
    lastSyncedAt?: string;
  };
  openai?: {
    threadId?: string;
    assistantId?: string;
    lastSyncedAt?: string;
  };
}

export interface ConversationUsage {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
  totalCost: number;
  byProvider: Partial<Record<ProviderType, ProviderUsage>>;
}

export interface UnifiedConversation {
  // Metadata
  id: string; // Yume session ID
  version: '1.0';
  created: string; // ISO timestamp
  updated: string; // ISO timestamp

  // Context
  cwd: string; // Working directory
  title?: string; // Session title

  // Current provider/model
  currentProvider: ProviderType;
  currentModel: string;

  // Messages in provider-agnostic format
  messages: UnifiedMessage[];

  // Cumulative usage
  usage: ConversationUsage;

  // Provider-specific state for session resumption
  providerState: ProviderState;

  // Switch history
  switches: ProviderSwitch[];

  // Optional metadata
  tags?: string[];
  summary?: string; // AI-generated summary
}

// =============================================================================
// Translation Types
// =============================================================================

export type TranslationType = 'preserve' | 'convert' | 'drop' | 'prompt_user';

export interface TranslationResult {
  type: TranslationType;
  content?: UnifiedContent;
  warning?: string;
  options?: string[]; // For prompt_user
}

export type SwitchWarningType = 'info' | 'warning' | 'error';

export interface SwitchWarning {
  type: SwitchWarningType;
  code: string;
  message: string;
  affectedMessages?: number[]; // Indices of affected messages
}

export interface SwitchAnalysis {
  canSwitch: boolean;
  warnings: SwitchWarning[];
  requiresSummarization: boolean;
  estimatedTokens: number;
  targetContextLimit: number;
  lossyFeatures: string[]; // Features that won't translate
  thinkingBlockCount: number;
  artifactCount: number;
  mcpToolCount: number;
}

export type SummarizationStrategy = 'truncate' | 'summarize' | 'hybrid';
export type ThinkingTranslationStrategy = 'drop' | 'convert' | 'ask';

export interface SwitchOptions {
  summarizationStrategy: SummarizationStrategy;
  thinkingTranslation: ThinkingTranslationStrategy;
  preserveSystemPrompt: boolean;
  includeToolHistory: boolean;
}

export interface PreparedConversation {
  history: ProviderHistory; // Provider-specific format
  systemPrompt?: string;
  warnings: SwitchWarning[];
  summarized: boolean;
  originalMessageCount: number;
  preservedMessageCount: number;
}

// =============================================================================
// Provider-Specific History Types
// =============================================================================

// Claude JSONL format
export interface ClaudeHistoryMessage {
  role: 'user' | 'assistant';
  content: ClaudeContentBlock[];
}

export type ClaudeContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

export type ClaudeHistory = ClaudeHistoryMessage[];

// Gemini format
export interface GeminiHistoryMessage {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

export type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: { result: string } } }
  | { inlineData: { mimeType: string; data: string } };

export type GeminiHistory = GeminiHistoryMessage[];

// OpenAI format
export interface OpenAIHistoryMessage {
  role: 'user' | 'assistant' | 'tool' | 'system';
  content?: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export type OpenAIHistory = OpenAIHistoryMessage[];

// Union type for any provider history
export type ProviderHistory = ClaudeHistory | GeminiHistory | OpenAIHistory;

// =============================================================================
// Service Interfaces
// =============================================================================

export interface ConversationTranslator {
  // Import from provider-specific format to UCF
  importFromClaude(jsonlPath: string): Promise<UnifiedConversation>;
  importFromGemini(sessionData: GeminiHistory): Promise<UnifiedConversation>;
  importFromOpenAI(thread: OpenAIHistory): Promise<UnifiedConversation>;

  // Export from UCF to provider-specific format
  exportToClaude(conv: UnifiedConversation): ClaudeHistory;
  exportToGemini(conv: UnifiedConversation): GeminiHistory;
  exportToOpenAI(conv: UnifiedConversation): OpenAIHistory;

  // Analyze switch feasibility
  analyzeSwitch(
    conv: UnifiedConversation,
    toProvider: ProviderType,
    toModel: string
  ): SwitchAnalysis;

  // Prepare conversation for new provider
  prepareForSwitch(
    conv: UnifiedConversation,
    toProvider: ProviderType,
    toModel: string,
    options?: Partial<SwitchOptions>
  ): PreparedConversation;
}

export interface ConversationStore {
  save(sessionId: string, conv: UnifiedConversation): Promise<void>;
  load(sessionId: string): Promise<UnifiedConversation | null>;
  list(): Promise<{ id: string; title?: string; updated: string }[]>;
  delete(sessionId: string): Promise<void>;
  importFromClaude(jsonlPath: string): Promise<UnifiedConversation>;
  sync(sessionId: string): Promise<void>;
}

// =============================================================================
// Utility Types
// =============================================================================

export interface TokenEstimate {
  total: number;
  byRole: {
    user: number;
    assistant: number;
    system: number;
    tool: number;
  };
}

export interface ContextStatus {
  used: number;
  limit: number;
  percentage: number;
  requiresSummarization: boolean;
}

// Model capabilities for feature checking
export interface ModelCapabilities {
  supportsThinking: boolean;
  supportsArtifacts: boolean;
  supportsMCP: boolean;
  supportsImageInput: boolean;
  supportsImageOutput: boolean;
  supportsPdfInput: boolean;
  supportsCodeExecution: boolean;
  supportsWebSearch: boolean;
  contextWindow: number;
  maxOutput: number;
}

// =============================================================================
// Constants
// =============================================================================

export const UCF_VERSION = '1.0' as const;

export const DEFAULT_SWITCH_OPTIONS: SwitchOptions = {
  summarizationStrategy: 'hybrid',
  thinkingTranslation: 'drop',
  preserveSystemPrompt: true,
  includeToolHistory: true,
};

// MCP tool prefixes - used to detect MCP tools
export const MCP_TOOL_PREFIXES = ['mcp:', 'server:'] as const;

// Core tools available on all providers
export const CORE_TOOLS = [
  'Read',
  'Write',
  'Edit',
  'MultiEdit',
  'Glob',
  'Grep',
  'LS',
  'Bash',
  'WebFetch',
  'WebSearch',
  'NotebookEdit',
  'TodoWrite',
  'Skill',
  'KillShell',
] as const;

// Claude-only tools
export const CLAUDE_ONLY_TOOLS = ['LSP', 'Task'] as const;
