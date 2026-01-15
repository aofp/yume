/**
 * Yume CLI Types
 * Types for Claude-compatible stream-json protocol
 */

// Provider types
export type ProviderType = 'gemini' | 'openai' | 'anthropic';

// CLI arguments
export interface CLIArgs {
  provider: ProviderType;
  model: string;
  cwd: string;
  sessionId: string;
  prompt?: string;
  resume?: string;
  historyFile?: string;
  outputFormat: 'stream-json';
  apiBase?: string;
  permissionMode: PermissionMode;
  verbose: boolean;
}

// Permission modes
export type PermissionMode = 'default' | 'interactive' | 'auto' | 'deny';

// Session state
export interface Session {
  id: string;
  provider: ProviderType;
  model: string;
  cwd: string;
  created: string;
  updated: string;
  history: HistoryMessage[];
  usage: TokenUsage;
  metadata: SessionMetadata;
}

export interface SessionMetadata {
  title?: string;
  compactionCount: number;
}

// History message types
export interface HistoryMessage {
  role: 'user' | 'assistant' | 'tool' | 'system';
  content?: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

// Tool call types
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  toolUseId: string;
  content: string;
  isError?: boolean;
}

// Token usage tracking
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

// Stream message types (Claude-compatible)
export type StreamMessage =
  | SystemMessage
  | StreamingTextMessage
  | StreamingThinkingMessage
  | StreamingToolUseMessage
  | StreamingToolResultMessage
  | TextMessage
  | ToolUseMessage
  | ToolResultMessage
  | UsageMessage
  | ResultMessage
  | ErrorMessage
  | MessageStopMessage
  | ThinkingMessage;

// Streaming text chunk (Claude format)
export interface StreamingTextMessage {
  type: 'text';
  content: string;
}

// Streaming thinking indicator (Claude format)
export interface StreamingThinkingMessage {
  type: 'thinking';
  is_thinking: boolean;
  thought: string;
}

// Streaming tool use (Claude format)
export interface StreamingToolUseMessage {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

// Streaming tool result (Claude format)
export interface StreamingToolResultMessage {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export interface SystemMessage {
  type: 'system';
  subtype: 'init' | 'session_id' | 'error';
  session_id?: string;
  model?: string;
  cwd?: string;
  permissionMode?: PermissionMode;
  tools?: string[];
  message?: string;
  streaming?: boolean;
}

export interface TextMessage {
  type: 'assistant';
  message: {
    type: 'text';
    text: string;
  };
}

export interface ThinkingMessage {
  type: 'assistant';
  message: {
    type: 'thinking';
    thinking: string;
  };
}

export interface ToolUseMessage {
  type: 'assistant';
  message: {
    type: 'tool_use';
    id: string;
    name: string;
    input: Record<string, unknown>;
  };
}

export interface ToolResultMessage {
  type: 'user';
  message: {
    type: 'tool_result';
    tool_use_id: string;
    content: string;
    is_error?: boolean;
  };
}

export interface UsageMessage {
  type: 'usage';
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

export interface ResultMessage {
  type: 'result';
  subtype: 'success' | 'error';
  is_error: boolean;
  costUSD?: number;
  duration_ms?: number;
  duration_api_ms?: number;
  num_turns?: number;
  result?: string;
  session_id?: string;
  model?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

export interface ErrorMessage {
  type: 'error';
  error: {
    type: string;
    message: string;
  };
}

export interface MessageStopMessage {
  type: 'message_stop';
}

// Provider interface
export interface Provider {
  name: ProviderType;
  generate(history: HistoryMessage[], tools: ToolDefinition[]): AsyncGenerator<ProviderChunk>;
  getModels(): ModelInfo[];
}

export interface ProviderChunk {
  type: 'text' | 'tool_call' | 'tool_call_delta' | 'tool_result' | 'usage' | 'done' | 'thinking';
  text?: string;
  toolCall?: {
    id: string;
    name: string;
    arguments: string;
  };
  toolCallDelta?: {
    id: string;
    arguments: string;
  };
  toolResult?: {
    id: string;
    status: string;
    output: string;
    isError: boolean;
  };
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
  };
  thinking?: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: ProviderType;
  contextWindow: number;
  maxOutput: number;
  supportsTools: boolean;
  supportsStreaming: boolean;
}

// Tool definition
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// Tool executor interface
export interface ToolExecutor {
  name: string;
  execute(input: Record<string, unknown>, cwd: string): Promise<ToolResult>;
}
