/**
 * Type definitions for Claude Code integration
 * These types define the structures used for Claude CLI communication and session management
 */

// ============ Message Types ============

export interface TextContentBlock {
  type: 'text';
  text: string;
}

export interface ThinkingContentBlock {
  type: 'thinking';
  thinking?: string;
  text?: string;
}

export interface ToolUseContentBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultContentBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string | Array<{ type: string; text?: string }>;
  is_error?: boolean;
}

export type ContentBlock = TextContentBlock | ThinkingContentBlock | ToolUseContentBlock | ToolResultContentBlock;

export interface MessageContent {
  content: string | ContentBlock[];
  role?: 'user' | 'assistant' | 'system';
  model?: string;
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export interface WrapperTokens {
  input: number;
  output: number;
  total: number;
  cache_read?: number;
  cache_creation?: number;
}

export interface WrapperMetadata {
  tokens?: WrapperTokens;
}

export interface AutoCompactMetadata {
  triggered?: boolean;
}

export interface CompactMetadata {
  oldSessionId?: string;
  newSessionId?: string;
  savedTokens?: number;
  totalSaved?: number;
  compactCount?: number;
}

// Base message interface
export interface BaseMessage {
  id?: string;
  type: string;
  timestamp?: string | number;
}

export interface UserMessage extends BaseMessage {
  type: 'user';
  message: MessageContent;
}

export interface AssistantMessage extends BaseMessage {
  type: 'assistant';
  message: MessageContent;
  model?: string;
  streaming?: boolean;
}

export interface ToolUseMessage extends BaseMessage {
  type: 'tool_use';
  message: {
    name: string;
    input: Record<string, unknown>;
    id?: string;
  };
}

export interface ToolResultMessage extends BaseMessage {
  type: 'tool_result';
  tool_use_id?: string;
  message: {
    tool_use_id?: string;
    content: string | Array<{ type: string; text?: string }>;
    is_error?: boolean;
  };
}

export interface SystemMessage extends BaseMessage {
  type: 'system';
  subtype?: 'init' | 'compact' | 'error' | 'info' | 'stream_end' | 'streaming_resumed';
  session_id?: string;
  message?: MessageContent | { content: string; tokensSaved?: number };
  streaming?: boolean;
}

export interface ThinkingMessage extends BaseMessage {
  type: 'thinking';
  is_thinking?: boolean;
  thought?: string;
  streaming?: boolean;
}

export interface ResultMessage extends BaseMessage {
  type: 'result';
  subtype?: 'success' | 'error_max_turns' | 'error';
  status?: string;
  result?: string;
  error?: string;
  is_error?: boolean;
  usage?: TokenUsage;
  total_cost_usd?: number;
  duration_ms?: number;
  num_turns?: number;
  session_id?: string;
  model?: string;
  wrapper?: WrapperMetadata;
  wrapper_tokens?: WrapperTokens;
  wrapper_auto_compact?: AutoCompactMetadata;
  wrapper_compact?: CompactMetadata;
}

export interface ErrorMessage extends BaseMessage {
  type: 'error';
  message?: string;
  error?: string;
  errorType?: string;
}

export interface InterruptMessage extends BaseMessage {
  type: 'interrupt';
}

export interface StreamingEndMessage extends BaseMessage {
  type: 'streaming_end';
  sessionId?: string;
}

// Union type for all message types
export type SDKMessage =
  | UserMessage
  | AssistantMessage
  | ToolUseMessage
  | ToolResultMessage
  | SystemMessage
  | ThinkingMessage
  | ResultMessage
  | ErrorMessage
  | InterruptMessage
  | StreamingEndMessage;

// ============ Session Types ============

export interface SessionCreateOptions {
  allowedTools?: string[];
  permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';
  maxTurns?: number;
  model?: string;
  sessionId?: string;
  claudeSessionId?: string;
  prompt?: string;
  messages?: SDKMessage[];
}

export interface SessionCreateResult {
  sessionId: string;
  messages: SDKMessage[];
  workingDirectory: string;
  claudeSessionId?: string;
  pendingSpawn?: boolean;
  model?: string;
}

export interface SessionHistoryResult {
  messages: SDKMessage[];
  workingDirectory: string;
}

export interface SessionInfo {
  sessionId: string;
  name?: string;
  workingDirectory?: string;
  claudeSessionId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// ============ Event Payload Types ============

export interface TitlePayload {
  title?: string;
}

export interface SessionIdUpdatePayload {
  old_session_id: string;
  new_session_id: string;
}

export interface SessionCreatedPayload {
  tempSessionId: string;
  realSessionId: string;
}

export interface ErrorPayload {
  message?: string;
  type?: string;
  timestamp?: number;
}

// ============ Hook Types ============

export interface HookDefinition {
  id: string;
  name: string;
  description: string;
  event?: string;
  enabled?: boolean;
  script: string;
  icon?: React.ComponentType<{ size?: number }>;
}

export interface CustomHook extends HookDefinition {
  event: string;
  enabled: boolean;
}

export interface HookState {
  [hookId: string]: boolean;
}

export interface HookScripts {
  [hookId: string]: string;
}

// ============ Window Extension Types ============

export interface ClaudeSessionStore {
  [sessionId: string]: {
    sessionId: string;
    workingDirectory: string;
    model: string;
    pendingSpawn: boolean;
    claudeSessionId?: string;
  };
}

// Extend Window interface for Claude session store
declare global {
  interface Window {
    __claudeSessionStore?: ClaudeSessionStore;
    debugTokens?: boolean;
  }
}

// ============ Tauri Event Types ============

export interface TauriEvent<T> {
  payload: T;
}

// ============ Recent Project Types ============

export interface RecentProject {
  path: string;
  name: string;
  lastOpened: number;
  accessCount?: number;
}

// ============ Type Guards ============

export function isUserMessage(msg: SDKMessage): msg is UserMessage {
  return msg.type === 'user';
}

export function isAssistantMessage(msg: SDKMessage): msg is AssistantMessage {
  return msg.type === 'assistant';
}

export function isToolUseMessage(msg: SDKMessage): msg is ToolUseMessage {
  return msg.type === 'tool_use';
}

export function isToolResultMessage(msg: SDKMessage): msg is ToolResultMessage {
  return msg.type === 'tool_result';
}

export function isResultMessage(msg: SDKMessage): msg is ResultMessage {
  return msg.type === 'result';
}

export function isSystemMessage(msg: SDKMessage): msg is SystemMessage {
  return msg.type === 'system';
}

export function isErrorMessage(msg: SDKMessage): msg is ErrorMessage {
  return msg.type === 'error';
}

export function isThinkingMessage(msg: SDKMessage): msg is ThinkingMessage {
  return msg.type === 'thinking';
}

// Helper to check if error is an Error object
export function isError(error: unknown): error is Error {
  return error instanceof Error;
}

// Helper to get error message from unknown error
export function getErrorMessage(error: unknown): string {
  if (isError(error)) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return String(error);
}
