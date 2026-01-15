/**
 * Stream emitter for Claude-compatible JSON output
 * Emits line-delimited JSON to stdout
 */

import type {
  StreamMessage,
  SystemMessage,
  StreamingTextMessage,
  StreamingThinkingMessage,
  StreamingToolUseMessage,
  StreamingToolResultMessage,
  TextMessage,
  ToolUseMessage,
  ToolResultMessage,
  UsageMessage,
  ResultMessage,
  ErrorMessage,
  MessageStopMessage,
  ThinkingMessage,
  PermissionMode,
  TokenUsage,
} from '../types.js';

/**
 * Emit a single JSON line to stdout
 * Flushes immediately for streaming responsiveness
 */
export function emit(message: StreamMessage): void {
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
  const message: SystemMessage = {
    type: 'system',
    subtype: 'session_id',
    session_id: newSessionId,
  };
  emit(message);
}

/**
 * Emit text content chunk (streaming format)
 */
export function emitText(text: string): void {
  const message: StreamingTextMessage = {
    type: 'text',
    content: text,
  };
  emit(message);
}

/**
 * Emit thinking content (streaming format)
 */
export function emitThinking(thinking: string): void {
  const message: StreamingThinkingMessage = {
    type: 'thinking',
    is_thinking: true,
    thought: thinking,
  };
  emit(message);
}

/**
 * Emit tool use (when model requests a tool) - streaming format
 */
export function emitToolUse(
  id: string,
  name: string,
  input: Record<string, unknown>
): void {
  const message: StreamingToolUseMessage = {
    type: 'tool_use',
    id,
    name,
    input,
  };
  emit(message);
}

/**
 * Emit tool result (after tool execution) - streaming format
 */
export function emitToolResult(
  toolUseId: string,
  content: string,
  isError = false
): void {
  const message: StreamingToolResultMessage = {
    type: 'tool_result',
    tool_use_id: toolUseId,
    content,
    is_error: isError,
  };
  emit(message);
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
