/**
 * Stream emitter for Claude-compatible JSON output
 * Emits line-delimited JSON to stdout in Claude CLI format
 */

import type {
  StreamMessage,
  SystemMessage,
  UsageMessage,
  ResultMessage,
  ErrorMessage,
  MessageStopMessage,
  PermissionMode,
  TokenUsage,
} from '../types.js';

// Internal session tracking for message IDs
let currentSessionId = '';
let messageCounter = 0;

/**
 * Generate a unique message ID
 */
function generateMessageId(): string {
  messageCounter++;
  return `msg_${Date.now()}_${messageCounter}`;
}

/**
 * Generate a unique UUID
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Emit a single JSON line to stdout
 * Flushes immediately for streaming responsiveness
 */
export function emit(message: StreamMessage | Record<string, unknown>): void {
  const line = JSON.stringify(message);
  process.stdout.write(line + '\n');
}

/**
 * Emit system init message
 */
export function emitSystemInit(
  sessionId: string,
  model: string,
  cwd: string,
  permissionMode: PermissionMode,
  tools: string[]
): void {
  currentSessionId = sessionId;
  messageCounter = 0;

  const message: SystemMessage = {
    type: 'system',
    subtype: 'init',
    session_id: sessionId,
    model,
    cwd,
    permissionMode,
    tools,
    streaming: true,
  };
  emit(message);
}

/**
 * Emit system error
 */
export function emitSystemError(errorMessage: string): void {
  const message: SystemMessage = {
    type: 'system',
    subtype: 'error',
    message: errorMessage,
  };
  emit(message);
}

/**
 * Emit session ID change (e.g., after compaction)
 */
export function emitSessionIdChange(newSessionId: string): void {
  currentSessionId = newSessionId;
  const message: SystemMessage = {
    type: 'system',
    subtype: 'session_id',
    session_id: newSessionId,
  };
  emit(message);
}

/**
 * Emit text content chunk - Claude CLI compatible format
 * Wraps text in assistant message with content array
 */
export function emitText(text: string): void {
  emit({
    type: 'assistant',
    message: {
      model: 'yume-cli',
      id: generateMessageId(),
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text }],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 },
    },
    parent_tool_use_id: null,
    session_id: currentSessionId,
    uuid: generateUUID(),
  });
}

/**
 * Emit thinking content - Claude CLI compatible format
 */
export function emitThinking(thinking: string): void {
  emit({
    type: 'assistant',
    message: {
      model: 'yume-cli',
      id: generateMessageId(),
      type: 'message',
      role: 'assistant',
      content: [{ type: 'thinking', thinking }],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 },
    },
    parent_tool_use_id: null,
    session_id: currentSessionId,
    uuid: generateUUID(),
  });
}

/**
 * Emit tool use (when model requests a tool) - Claude CLI compatible format
 */
export function emitToolUse(
  id: string,
  name: string,
  input: Record<string, unknown>
): void {
  emit({
    type: 'assistant',
    message: {
      model: 'yume-cli',
      id: generateMessageId(),
      type: 'message',
      role: 'assistant',
      content: [{ type: 'tool_use', id, name, input }],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 },
    },
    parent_tool_use_id: null,
    session_id: currentSessionId,
    uuid: generateUUID(),
  });
}

/**
 * Emit tool result (after tool execution) - Claude CLI compatible format
 */
export function emitToolResult(
  toolUseId: string,
  content: string,
  isError = false
): void {
  // Claude CLI format for tool results
  const msg = {
    type: 'user',
    message: {
      role: 'user',
      content: [{
        tool_use_id: toolUseId,
        type: 'tool_result',
        content,
        is_error: isError
      }],
    },
    parent_tool_use_id: null,
    session_id: currentSessionId,
    uuid: generateUUID(),
    tool_use_result: {
      stdout: content,
      stderr: '',
      interrupted: false,
      isImage: false,
    },
  };
  // Emit as raw object to bypass type checking
  process.stdout.write(JSON.stringify(msg) + '\n');
}

/**
 * Emit usage statistics
 */
export function emitUsage(usage: TokenUsage): void {
  const message: UsageMessage = {
    type: 'usage',
    usage: {
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      cache_read_input_tokens: usage.cacheReadTokens,
      cache_creation_input_tokens: usage.cacheCreationTokens,
    },
  };
  emit(message);
}

/**
 * Emit successful result
 */
export function emitResult(options: {
  sessionId: string;
  usage: TokenUsage;
  costUSD?: number;
  durationMs?: number;
  numTurns?: number;
  result?: string;
  model?: string;
}): void {
  const message: ResultMessage = {
    type: 'result',
    subtype: 'success',
    is_error: false,
    session_id: options.sessionId,
    costUSD: options.costUSD,
    duration_ms: options.durationMs,
    num_turns: options.numTurns,
    result: options.result,
    model: options.model,
    usage: {
      input_tokens: options.usage.inputTokens,
      output_tokens: options.usage.outputTokens,
      cache_read_input_tokens: options.usage.cacheReadTokens,
      cache_creation_input_tokens: options.usage.cacheCreationTokens,
    },
  };
  emit(message);
}

/**
 * Emit error result
 */
export function emitErrorResult(
  sessionId: string,
  errorMessage: string,
  usage?: TokenUsage
): void {
  const message: ResultMessage = {
    type: 'result',
    subtype: 'error',
    is_error: true,
    session_id: sessionId,
    result: errorMessage,
    usage: usage
      ? {
          input_tokens: usage.inputTokens,
          output_tokens: usage.outputTokens,
          cache_read_input_tokens: usage.cacheReadTokens,
          cache_creation_input_tokens: usage.cacheCreationTokens,
        }
      : undefined,
  };
  emit(message);
}

/**
 * Emit error
 */
export function emitError(type: string, message: string): void {
  const errorMessage: ErrorMessage = {
    type: 'error',
    error: {
      type,
      message,
    },
  };
  emit(errorMessage);
}

/**
 * Emit message stop (end of response)
 */
export function emitMessageStop(): void {
  const message: MessageStopMessage = {
    type: 'message_stop',
  };
  emit(message);
}

/**
 * Log to stderr (for debugging, won't interfere with JSON stream)
 */
export function log(message: string): void {
  process.stderr.write(`[yume-cli] ${message}\n`);
}

/**
 * Log verbose message (only if verbose mode enabled)
 */
let verboseEnabled = false;

export function setVerbose(enabled: boolean): void {
  verboseEnabled = enabled;
}

export function logVerbose(message: string): void {
  if (verboseEnabled) {
    log(message);
  }
}
