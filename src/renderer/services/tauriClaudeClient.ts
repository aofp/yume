/**
 * Tauri client that connects to Claude via Tauri commands
 * Replaces Socket.IO with direct Tauri IPC
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn, type Event } from '@tauri-apps/api/event';
import { processWrapperMessage, mapSessionIds } from './wrapperIntegration';
import { resolveModelId, DEFAULT_MODEL_ID, getProviderForModel, getModelById, type ProviderType } from '../config/models';
import { isDev } from '../utils/helpers';
import { logger } from '../utils/structuredLogger';

// =============================================================================
// Type Definitions
// =============================================================================

interface SessionCreatedData {
  tempSessionId: string;
  realSessionId: string;
}

interface CreateSessionOptions {
  model?: string;
  claudeSessionId?: string;
  prompt?: string;
  sessionId?: string;
  historyFilePath?: string;
}

interface CreateSessionResponse {
  sessionId: string;
  messages: unknown[];
  workingDirectory: string;
  claudeSessionId: string | null;
  pendingSpawn?: boolean;
  model?: string;
  provider?: ProviderType;
}

interface TauriSpawnResponse {
  session_id: string;
}

interface GetSessionHistoryResponse {
  messages: unknown[];
  workingDirectory: string;
}

interface SessionInfo {
  id: string;
  [key: string]: unknown;
}

/**
 * Check if a provider uses yume-cli (non-Claude providers)
 */
function isYumeCliProvider(provider: ProviderType): boolean {
  return provider === 'gemini' || provider === 'openai';
}

// Keep track of active listeners for cleanup
const activeListeners = new Map<string, UnlistenFn>();

// Keep track of ALL assistant message IDs during streaming for each session
const streamingAssistantMessages = new Map<string, Set<string>>();

// Track the current streaming assistant message per session for text aggregation
// Maps sessionId -> { id: messageId, content: accumulated text }
const currentStreamingMessage = new Map<string, { id: string; content: string }>();

// Module-level session store for tracking pending spawns (replaces window global)
const claudeSessionStore = new Map<string, {
  sessionId: string;
  workingDirectory: string;
  model: string;
  pendingSpawn: boolean;
  claudeSessionId?: string;
  historyFilePath?: string;
}>();

// Clean up all listeners for a session prefix
function cleanupSessionListeners(sessionId: string) {
  const prefixes = [`claude-message:${sessionId}`, `claude-error:${sessionId}`,
                    `claude-tokens:${sessionId}`, `claude-session-id-update:${sessionId}`,
                    `claude-title:${sessionId}`, `claude-complete:${sessionId}`];
  prefixes.forEach(prefix => {
    const unlisten = activeListeners.get(prefix);
    if (unlisten) {
      unlisten();
      activeListeners.delete(prefix);
    }
  });
  streamingAssistantMessages.delete(sessionId);
  currentStreamingMessage.delete(sessionId);
}

export class TauriClaudeClient {
  private connected = true; // Always connected with Tauri
  private messageHandlers = new Map<string, (message: any) => void>(); // TODO: Define StreamMessage interface
  public connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error' = 'connected';
  public connectionError: string | null = null;
  public connectionAttempts = 0;
  public debugLog: string[] = [];
  private sessionCreatedCallback: ((data: SessionCreatedData) => void) | null = null;

  constructor() {
    // No connection needed - Tauri IPC is always available
    this.connectionStatus = 'connected';
  }

  isConnected(): boolean {
    return true; // Always connected with Tauri
  }

  getServerPort(): number | null {
    return null; // Not applicable for Tauri
  }

  async createSession(name: string, workingDirectory: string, options?: CreateSessionOptions): Promise<CreateSessionResponse> {
    try {
      // Resolve model ID using centralized config
      const model = options?.model || DEFAULT_MODEL_ID;
      const mappedModel = resolveModelId(model);

      // If we're creating a new session without a prompt, don't spawn Claude yet
      // The session will be spawned when the first message is sent
      const isNewSession = !options?.claudeSessionId;
      const hasPrompt = options?.prompt && options.prompt.trim().length > 0;
      
      if (isNewSession && !hasPrompt) {
        // Return a placeholder session that will be properly initialized on first message
        const tempSessionId = options?.sessionId || `session-${Date.now()}`;
        
        // Store session data for deferred spawn
        claudeSessionStore.set(tempSessionId, {
          sessionId: tempSessionId,
          workingDirectory: workingDirectory,
          model: mappedModel,
          pendingSpawn: true,
          historyFilePath: options?.historyFilePath
        });
        
        return {
          sessionId: tempSessionId,
          messages: [],
          workingDirectory: workingDirectory,
          claudeSessionId: null, // Will be set when first message is sent
          pendingSpawn: true, // Flag to indicate spawn is pending
          model: mappedModel // Store model for later spawn
        };
      }

      // Detect provider from model
      const provider = getProviderForModel(mappedModel);
      const useYumeCli = isYumeCliProvider(provider);

      if (useYumeCli) {
        // Use yume-cli for Gemini/OpenAI providers
        const modelDef = getModelById(mappedModel);
        const request = {
          provider: provider, // 'gemini' or 'openai'
          project_path: workingDirectory,
          model: mappedModel,
          prompt: options?.prompt || '',
          resume_session_id: options?.claudeSessionId || null,
          reasoning_effort: modelDef?.reasoningEffort || null,
          history_file_path: options?.historyFilePath || null,
          // CRITICAL: Pass the frontend temp session ID so backend emits on the channel we're listening on
          frontend_session_id: options?.sessionId || null,
        };

        if (isDev) logger.info('[TauriClient] Spawning yume-cli session:', request);
        const response = await invoke('spawn_yume_cli_session', { request });

        const sessionId = (response as any).session_id || options?.sessionId || `session-${Date.now()}`;
        return {
          sessionId: sessionId,
          messages: [],
          workingDirectory: workingDirectory,
          claudeSessionId: (response as any).session_id,
          provider: provider
        };
      }

      // Prepare request for Tauri command (Claude)
      const request = {
        project_path: workingDirectory,
        model: mappedModel,
        prompt: options?.prompt || '',
        // Pass session ID if resuming
        resume_session_id: options?.claudeSessionId || null,
        continue_conversation: !!options?.claudeSessionId
      };

      // Call Tauri command to spawn Claude session
      const response = await invoke('spawn_claude_session', { request });

      // Start listening for messages from this session
      const sessionId = (response as any).session_id || options?.sessionId || `session-${Date.now()}`;
      
      // Return response matching expected format
      return {
        sessionId: sessionId,
        messages: [],
        workingDirectory: workingDirectory,
        claudeSessionId: (response as any).session_id
      };
    } catch (error) {
      throw error;
    }
  }

  async getSessionHistory(sessionId: string): Promise<GetSessionHistoryResponse> {
    try {
      const response = await invoke('get_session_output', { session_id: sessionId });
      return {
        messages: [], // Parse output into messages if needed
        workingDirectory: ''
      };
    } catch (error) {
      throw error;
    }
  }

  async listSessions(): Promise<SessionInfo[]> {
    try {
      const response = await invoke('list_active_sessions');
      return (response as SessionInfo[]) || [];
    } catch (error) {
      throw error;
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    // Clean up listeners for this session
    cleanupSessionListeners(sessionId);
    // Clean up session store
    claudeSessionStore.delete(sessionId);
    // Sessions are cleaned up automatically in Tauri backend
  }

  async interrupt(sessionId: string): Promise<void> {
    try {
      await invoke('interrupt_claude_session', { session_id: sessionId });
    } catch (error) {
      logger.error(`[TauriClient] Failed to interrupt session ${sessionId}`, { error });
      throw error;
    }
  }

  async sendMessage(
    sessionId: string,
    content: string,
    model?: string,
    _autoGenerateTitle?: boolean,
    claudeSessionId?: string,
    workingDirectory?: string
  ): Promise<void> {
    try {
      // Check if this session needs to be spawned first
      // This happens when createSession was called without a prompt OR when resuming a past conversation
      const sessionData = claudeSessionStore.get(sessionId);

      // Use passed claudeSessionId/workingDirectory if not in sessionStore (happens after page refresh)
      const effectiveClaudeSessionId = sessionData?.claudeSessionId || claudeSessionId;
      const effectiveWorkingDirectory = sessionData?.workingDirectory || workingDirectory;
      const effectiveModel = model ? resolveModelId(model) : sessionData?.model;

      if (sessionData?.pendingSpawn) {
        const mappedModel = model ? resolveModelId(model) : sessionData.model;

        // Check if this is a resume of a past conversation (has claudeSessionId)
        const isResuming = !!sessionData.claudeSessionId;
        if (isDev) logger.info('[TauriClient] Spawning session:', {
          sessionId,
          isResuming,
          claudeSessionId: sessionData.claudeSessionId
        });

        // Detect provider from model
        const provider = getProviderForModel(mappedModel);
        const useYumeCli = isYumeCliProvider(provider);

        let response: any;

        if (useYumeCli) {
          // Spawn yume-cli with the first message as the prompt
          const modelDef = getModelById(mappedModel);
          const spawnRequest = {
            provider: provider,
            project_path: sessionData.workingDirectory,
            model: mappedModel,
            prompt: content,
            resume_session_id: isResuming ? sessionData.claudeSessionId : null,
            reasoning_effort: modelDef?.reasoningEffort || null,
            history_file_path: sessionData.historyFilePath || null,
            // CRITICAL: Pass frontend session ID so backend emits on the channel we're listening on
            frontend_session_id: sessionId
          };

          if (isDev) logger.info('[TauriClient] Spawning yume-cli session:', spawnRequest);
          response = await invoke('spawn_yume_cli_session', { request: spawnRequest });
        } else {
          // Spawn Claude with the first message as the prompt
          // If resuming, pass the claudeSessionId as resume_session_id
          const spawnRequest = {
            project_path: sessionData.workingDirectory,
            model: mappedModel,
            prompt: content, // Pass the message as the initial prompt
            resume_session_id: isResuming ? sessionData.claudeSessionId : null
          };

          response = await invoke('spawn_claude_session', { request: spawnRequest });
        }

        // Update session store with the real Claude session ID
        const realSessionId = (response as any).session_id;
        claudeSessionStore.set(sessionId, {
          ...sessionData,
          claudeSessionId: realSessionId,
          pendingSpawn: false
        });

        // Emit a session created event so the store can update the mapping
        if (this.sessionCreatedCallback) {
          this.sessionCreatedCallback({
            tempSessionId: sessionId,
            realSessionId: realSessionId
          });
        }
      } else {
        // Normal message send for already-spawned sessions
        // Route by provider - gemini/openai need to spawn new yume-cli process for each message
        const provider = effectiveModel ? getProviderForModel(effectiveModel) : 'claude';
        const useYumeCli = isYumeCliProvider(provider);

        if (useYumeCli) {
          // Gemini/OpenAI: spawn new yume-cli process with --resume
          const modelDef = effectiveModel ? getModelById(effectiveModel) : null;
          const spawnRequest = {
            provider: provider,
            project_path: effectiveWorkingDirectory || '.',
            model: effectiveModel || '',
            prompt: content,
            resume_session_id: effectiveClaudeSessionId || null,
            reasoning_effort: modelDef?.reasoningEffort || null,
            history_file_path: null,
            frontend_session_id: sessionId
          };

          if (isDev) logger.info('[TauriClient] Spawning yume-cli for followup message:', spawnRequest);
          await invoke('spawn_yume_cli_session', { request: spawnRequest });
        } else {
          // Claude: use send_claude_message (resumes existing session)
          const request = {
            session_id: sessionId,
            message: content,
            claude_session_id: effectiveClaudeSessionId || null,
            project_path: effectiveWorkingDirectory || null,
            model: effectiveModel || null
          };

          if (isDev) logger.info('[TauriClient] Sending message with claude_session_id', { claudeSessionId: effectiveClaudeSessionId });
          await invoke('send_claude_message', { request });
        }
      }
    } catch (error) {
      throw error;
    }
  }

  onError(sessionId: string, handler: (error: any) => void): () => void { // TODO: Define error type
    const channel = `claude-error:${sessionId}`;
    let cleanupRequested = false;

    const errorHandler = (event: Event<unknown>) => {
      const error = event.payload;
      handler(error);
    };

    // Set up Tauri event listener
    listen(channel, errorHandler).then(unlisten => {
      if (cleanupRequested) {
        // Cleanup was requested before listener was ready
        unlisten();
      } else {
        activeListeners.set(channel, unlisten);
      }
    });

    return () => {
      cleanupRequested = true;
      const unlisten = activeListeners.get(channel);
      if (unlisten) {
        unlisten();
        activeListeners.delete(channel);
      }
    };
  }

  onMessage(sessionId: string, handler: (message: any) => void): () => void { // TODO: Define StreamMessage interface
    let channel = `claude-message:${sessionId}`;
    const updateChannel = `claude-session-id-update:${sessionId}`;
    let currentSessionId = sessionId; // Track the current session ID for wrapper

    let currentUnlisten: UnlistenFn | null = null;

    // Dedup set for messages received on multiple channels (backend emits on original + real channels)
    const seenMessages = new Set<string>();

    // Wrap handler with streaming state management
    const messageHandler = (event: Event<any>) => {
      const payload = event.payload;

      // Parse the raw JSON string from backend
      let message: any;
      try {
        // Backend now sends raw JSON strings like Claudia does
        message = typeof payload === 'string' ? JSON.parse(payload) : payload;
      } catch (e) {
        logger.error(`[TauriClient] Failed to parse message:`, { payload: String(payload).substring(0, 200), error: e });
        // Emit error to handler
        handler({
          type: 'error',
          message: `Failed to parse message: ${e instanceof Error ? e.message : String(e)}`
        });
        return;
      }

      // Dedup: Skip if we've seen this exact message before
      // Use stringified payload as key since backend sends same JSON on multiple channels
      const rawPayload = typeof payload === 'string' ? payload : JSON.stringify(payload);
      if (seenMessages.has(rawPayload)) {
        return; // Skip duplicate
      }
      seenMessages.add(rawPayload);
      // Limit set size to prevent memory leak
      if (seenMessages.size > 1000) {
        const toDelete = Array.from(seenMessages).slice(0, 500);
        toDelete.forEach(k => seenMessages.delete(k));
      }

      // WRAPPER: Process message for token tracking and compaction detection
      message = processWrapperMessage(message, currentSessionId);

      // Transform message format to match expected format
      let transformedMessage: any = null;
      
      // Handle different message types from Claude's stream-json output
      // Also handle Codex (OpenAI) event types

      // === CODEX EVENT HANDLERS ===
      if (message.type === 'thread.started') {
        // Codex session init - emit system init
        transformedMessage = {
          type: 'system',
          subtype: 'init',
          session_id: message.thread_id,
          streaming: true
        };
      } else if (message.type === 'turn.started') {
        // Codex turn start - emit thinking state
        transformedMessage = {
          type: 'thinking',
          is_thinking: true,
          thought: '',
          streaming: true
        };
      } else if (message.type === 'turn.completed') {
        // Codex turn complete - emit result with usage
        const usage = message.usage || {};

        // Clear streaming state
        streamingAssistantMessages.delete(sessionId);

        // Send streaming_end first
        queueMicrotask(() => {
          handler({
            type: 'streaming_end',
            sessionId: sessionId
          });
        });

        transformedMessage = {
          type: 'result',
          subtype: 'success',
          status: 'success',
          usage: {
            input_tokens: usage.input_tokens || 0,
            output_tokens: usage.output_tokens || 0,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: usage.cached_input_tokens || 0
          }
        };
      } else if (message.type === 'turn.failed') {
        // Codex turn failed - emit error
        streamingAssistantMessages.delete(sessionId);

        queueMicrotask(() => {
          handler({
            type: 'streaming_end',
            sessionId: sessionId
          });
        });

        transformedMessage = {
          type: 'error',
          message: message.error?.message || 'Turn failed'
        };
      } else if (message.type === 'item.started' && message.item?.type === 'command_execution') {
        // Codex command start - emit as tool_use
        const item = message.item;
        transformedMessage = {
          type: 'tool_use',
          id: item.id || `tool-${Date.now()}`,
          message: {
            name: 'Bash',
            input: { command: item.command },
            id: item.id
          }
        };
      } else if (message.type === 'item.completed' && message.item?.type === 'command_execution') {
        // Codex command complete - emit as tool_result
        const item = message.item;
        transformedMessage = {
          type: 'tool_result',
          tool_use_id: item.id,
          message: {
            content: item.aggregated_output || '',
            is_error: item.exit_code !== 0
          }
        };
      } else if (message.type === 'item.completed' && message.item?.type === 'reasoning') {
        // Codex reasoning - emit as thinking
        const item = message.item;
        transformedMessage = {
          type: 'thinking',
          is_thinking: false,
          thought: item.text || '',
          streaming: false
        };
      } else if (message.type === 'item.completed' && message.item?.type === 'agent_message') {
        // Codex agent message - emit as assistant
        const item = message.item;
        const messageId = `assistant-${Date.now()}-codex`;

        if (!streamingAssistantMessages.has(sessionId)) {
          streamingAssistantMessages.set(sessionId, new Set());
        }
        streamingAssistantMessages.get(sessionId)?.add(messageId);

        transformedMessage = {
          id: messageId,
          type: 'assistant',
          message: {
            content: item.text || '',
            role: 'assistant'
          },
          streaming: false  // Codex sends complete messages, not streaming chunks
        };
      } else if (message.type === 'error') {
        // Error message - emit streaming_end to clear UI state
        currentStreamingMessage.delete(sessionId);
        streamingAssistantMessages.delete(sessionId);
        queueMicrotask(() => {
          handler({ type: 'streaming_end', sessionId });
        });
        transformedMessage = {
          type: 'error',
          message: message.message || message.error?.message || 'Unknown error'
        };
      }
      // === END CODEX EVENT HANDLERS ===

      // === CLAUDE/GEMINI EVENT HANDLERS ===
      else if (message.type === 'text') {
        // Text content from Claude/Gemini - streaming assistant message
        // Aggregate text chunks into a single message per session
        let current = currentStreamingMessage.get(sessionId);
        if (!current) {
          // Create new streaming message
          const messageId = `assistant-${Date.now()}-stream`;
          current = { id: messageId, content: '' };
          currentStreamingMessage.set(sessionId, current);

          // Track this streaming message
          if (!streamingAssistantMessages.has(sessionId)) {
            streamingAssistantMessages.set(sessionId, new Set());
          }
          streamingAssistantMessages.get(sessionId)?.add(messageId);
        }

        // Append new content
        current.content += message.content || '';

        logger.info('[TauriClient] TEXT message aggregated:', {
          totalLength: current.content.length,
          chunkLength: (message.content || '').length,
          messageId: current.id
        });

        transformedMessage = {
          id: current.id,
          type: 'assistant',
          message: {
            content: current.content,
            role: 'assistant'
          },
          streaming: true
        };
      } else if (message.type === 'message_stop') {
        // Message complete - but DON'T clear streaming yet! Wait for result
        // Don't send any update here
      } else if (message.type === 'usage') {
        // Token usage information - CRITICAL for live context % updates
        // processWrapperMessage already added wrapper.tokens to message (line 402)
        // We emit this as a 'usage' type so store can sync wrapper.tokens to analytics
        // This enables live context bar updates during streaming, not just at turn end
        transformedMessage = {
          type: 'usage',
          usage: {
            input_tokens: message.input_tokens || 0,
            output_tokens: message.output_tokens || 0,
            cache_creation_input_tokens: message.cache_creation_input_tokens || 0,
            cache_read_input_tokens: message.cache_read_input_tokens || 0
          },
          // CRITICAL: preserve wrapper metadata for store to sync tokens
          wrapper: message.wrapper,
          wrapper_tokens: message.wrapper_tokens
        };
      } else if (message.type === 'tool_use') {
        // Standalone tool_use message
        // Support both Claude format (name, input) and Gemini format (tool_name, parameters)
        // Clear streaming text buffer when tool use starts (text message complete)
        currentStreamingMessage.delete(sessionId);

        transformedMessage = {
          type: 'tool_use',
          id: message.id || message.tool_id || `tool-${Date.now()}`,
          message: {
            name: message.name || message.tool_name,
            input: message.input || message.parameters,
            id: message.id || message.tool_id
          }
        };
        // Preserve file snapshot for line change tracking (added by rust backend)
        if (message.fileSnapshot) {
          (transformedMessage as any).fileSnapshot = message.fileSnapshot;
        }
      } else if (message.type === 'tool_result') {
        // Tool result
        // Support both Claude format (tool_use_id, content) and Gemini format (tool_id, output)
        transformedMessage = {
          type: 'tool_result',
          tool_use_id: message.tool_use_id || message.tool_id,
          message: {
            content: message.content || message.output,
            is_error: message.is_error || message.status === 'error'
          }
        };
      } else if (message.type === 'message' && message.role === 'assistant') {
        // Gemini format: {"type":"message","role":"assistant","content":"...","delta":true}
        const messageId = `assistant-${Date.now()}-${Math.random()}`;

        if (!streamingAssistantMessages.has(sessionId)) {
          streamingAssistantMessages.set(sessionId, new Set());
        }
        streamingAssistantMessages.get(sessionId)?.add(messageId);

        transformedMessage = {
          id: messageId,
          type: 'assistant',
          message: {
            content: message.content || '',
            role: 'assistant'
          },
          streaming: message.delta === true
        };
      } else if (message.type === 'result') {
        // Result message - unified handler for both yume-cli (gemini/openai) and Claude
        // Supports: yume-cli format (top-level fields), legacy gemini format (nested in stats), Claude format
        // Clear streaming text buffer on result (turn complete)
        currentStreamingMessage.delete(sessionId);

        // CRITICAL: Emit streaming_end BEFORE result so UI clears streaming state
        queueMicrotask(() => {
          handler({
            type: 'streaming_end',
            sessionId: sessionId
          });
        });

        // Clear tracking
        streamingAssistantMessages.delete(sessionId);

        // DEBUG: Log raw result message to see what fields we're getting
        logger.info('[TauriClient] RAW RESULT MESSAGE:', {
          type: message.type,
          subtype: message.subtype,
          duration_ms: message.duration_ms,
          total_cost_usd: message.total_cost_usd,
          usage: message.usage,
          modelUsage: message.modelUsage,
          is_error: message.is_error,
          allKeys: Object.keys(message)
        });

        // Extract model - Claude uses modelUsage object, yume-cli uses direct model field
        let model: string | undefined = message.model;
        if (!model && message.modelUsage && typeof message.modelUsage === 'object') {
          const modelKeys = Object.keys(message.modelUsage);
          if (modelKeys.length > 0) {
            model = modelKeys[0];
          }
        }

        // Usage can come from: message.usage (yume-cli/claude), message.stats (legacy gemini)
        const stats = message.stats || {};
        const usage = message.usage || stats;

        transformedMessage = {
          type: 'result',
          id: `result-${sessionId || 'temp'}-${Date.now()}`,
          subtype: message.subtype || 'success',
          is_error: message.is_error || false,
          status: message.status || (message.subtype === 'success' ? 'success' : 'error'),
          error: message.error || (message.is_error ? message.result : null),
          result: message.result,
          usage: {
            input_tokens: usage.input_tokens || stats.input || 0,
            output_tokens: usage.output_tokens || 0,
            cache_creation_input_tokens: usage.cache_creation_input_tokens || 0,
            cache_read_input_tokens: usage.cache_read_input_tokens || stats.cached || 0
          },
          total_cost_usd: message.total_cost_usd,
          duration_ms: message.duration_ms || stats.duration_ms,
          num_turns: message.num_turns,
          model: model,
          session_id: message.session_id,
          timestamp: Date.now(), // CRITICAL: needed for elapsed time fallback calculation
          // CRITICAL: Preserve wrapper metadata from processWrapperMessage
          wrapper: message.wrapper,
          wrapper_tokens: message.wrapper_tokens,
          wrapper_auto_compact: message.wrapper_auto_compact,
          wrapper_compact: message.wrapper_compact
        };
      } else if (message.type === 'thinking') {
        // Thinking indicator
        transformedMessage = {
          type: 'thinking',
          is_thinking: message.is_thinking,
          thought: message.thought,
          streaming: true // Set streaming state for thinking indicator
        };
      } else if (message.type === 'assistant') {
        // Full assistant message from Claude
        // Claude sends: {"type":"assistant","message":{...},"session_id":"..."}
        const messageData = message.message || {};
        // Check if this is a bash command result (has bash- prefixed ID)
        const isBashResult = message.id && String(message.id).startsWith('bash-');
        // Preserve bash IDs, generate new IDs for other messages
        const messageId = isBashResult ? message.id : `assistant-${Date.now()}-${Math.random()}`;
        
        // Process content blocks
        let processedContent = messageData.content;
        let textBlocks: any[] = [];
        let toolUseBlocks: any[] = [];
        
        if (Array.isArray(messageData.content)) {
          // Separate text/thinking blocks from tool_use blocks
          textBlocks = messageData.content.filter((c: any) => 
            c.type === 'text' || c.type === 'thinking'
          );
          toolUseBlocks = messageData.content.filter((c: any) => 
            c.type === 'tool_use'
          );
          
          // Send tool_use blocks as separate messages
          for (const toolUse of toolUseBlocks) {
            const toolMessage: any = {
              type: 'tool_use',
              id: toolUse.id || `tool-${Date.now()}-${Math.random()}`,
              message: {
                name: toolUse.name,
                input: toolUse.input,
                id: toolUse.id
              },
              timestamp: Date.now()
            };
            // Include file snapshot for line change tracking (added by rust backend)
            if (toolUse.fileSnapshot) {
              toolMessage.fileSnapshot = toolUse.fileSnapshot;
            }
            // Emit tool_use message immediately
            handler(toolMessage);
          }
          
          // Keep only text/thinking blocks for the assistant message
          processedContent = textBlocks;
        }
        
        // ALWAYS send assistant messages, even if empty (to maintain context)
        // Track assistant messages during streaming (skip bash results - they're already complete)
        if (!isBashResult) {
          if (!streamingAssistantMessages.has(sessionId)) {
            streamingAssistantMessages.set(sessionId, new Set());
          }
          streamingAssistantMessages.get(sessionId)?.add(messageId);
        }
        
        // If we have text/thinking blocks, use them. Otherwise, send empty content
        // This ensures every assistant message is displayed, maintaining conversation flow
        const contentToSend = textBlocks.length > 0 ? processedContent : 
                            typeof processedContent === 'string' ? processedContent : '';
        
        transformedMessage = {
          id: messageId, // Unique ID for each message
          type: 'assistant',
          message: {
            ...messageData,
            content: contentToSend,  // Empty string if no text/thinking
            role: 'assistant'
          },
          model: messageData.model,
          // For bash results, preserve original streaming value (false = complete)
          // For Claude messages, always true to let result clear it
          streaming: isBashResult ? (message.streaming ?? false) : true
        };
      } else if (message.type === 'user') {
        // User message echo from Claude
        const messageData = message.message || {};
        
        // Check if this is a tool_result message
        if (Array.isArray(messageData.content)) {
          for (const block of messageData.content) {
            if (block.type === 'tool_result') {
              // Send tool_result as separate message
              const toolResultMessage = {
                type: 'tool_result',
                id: `toolresult-${Date.now()}-${Math.random()}`,
                message: {
                  tool_use_id: block.tool_use_id,
                  content: block.content,
                  is_error: block.is_error
                },
                timestamp: Date.now()
              };
              handler(toolResultMessage);
            }
          }
        }

        // ALWAYS send the user message (including tool_result ones)
        // The store will filter out non-tool-result user messages
        transformedMessage = {
          id: `user-${Date.now()}`,
          type: 'user',
          message: {
            ...messageData,
            content: messageData.content,
            role: 'user'
          }
        };
      } else if (message.type === 'system') {
        // System messages - check for error subtype
        if (message.subtype === 'error') {
          // System error - emit streaming_end to clear UI state
          currentStreamingMessage.delete(sessionId);
          streamingAssistantMessages.delete(sessionId);
          queueMicrotask(() => {
            handler({ type: 'streaming_end', sessionId });
          });
          transformedMessage = {
            type: 'error',
            message: message.message || 'System error'
          };
        } else {
          transformedMessage = {
            type: 'system',
            subtype: message.subtype,
            session_id: message.session_id,
            message: message.message,
            streaming: message.streaming // Pass through streaming state for system messages
          };
        }
      } else if (message.type === 'interrupt') {
        // Interrupt signal
        transformedMessage = {
          type: 'interrupt'
        };
      }
      // NOTE: 'result' type is handled above (unified handler for yume-cli and Claude)
      
      if (transformedMessage) {
        // ALWAYS preserve wrapper metadata if present
        if (message.wrapper) transformedMessage.wrapper = message.wrapper;
        if (message.wrapper_tokens) transformedMessage.wrapper_tokens = message.wrapper_tokens;
        if (message.wrapper_auto_compact) transformedMessage.wrapper_auto_compact = message.wrapper_auto_compact;
        if (message.wrapper_compact) transformedMessage.wrapper_compact = message.wrapper_compact;
        // Preserve file snapshot for line change tracking
        if (message.fileSnapshot) transformedMessage.fileSnapshot = message.fileSnapshot;

        handler(transformedMessage);
      }
    };

    // Track cleanup state to handle race conditions with async listener setup
    let cleanupRequested = false;
    let updateChannelUnlisten: UnlistenFn | null = null;

    // Set up Tauri event listener
    listen(channel, messageHandler).then(unlisten => {
      if (cleanupRequested) {
        unlisten();
      } else {
        currentUnlisten = unlisten;
        activeListeners.set(channel, unlisten);
      }
    });

    // CRITICAL: Listen for claude-complete events (process exit)
    // This handles cases where yume-cli crashes or exits without sending result message
    const completeChannel = `claude-complete:${sessionId}`;
    listen(completeChannel, () => {
      logger.info('[TauriClient] claude-complete received for session', { sessionId });
      streamingAssistantMessages.delete(sessionId);
      // Emit streaming_end to clear UI streaming state
      handler({
        type: 'streaming_end',
        sessionId: sessionId
      });
    }).then(unlisten => {
      if (cleanupRequested) {
        unlisten();
      } else {
        activeListeners.set(completeChannel, unlisten);
      }
    });

    // Listen for session ID updates to ADD new channel listeners
    // CRITICAL: Keep the original frontend session ID listener active because
    // subsequent messages (multi-turn) spawn new yume-cli processes that emit
    // on the original frontend session ID channel
    const originalChannel = channel; // Keep reference to original frontend channel
    const additionalChannels: string[] = []; // Track additional channels for cleanup
    listen(updateChannel, async (event: Event<any>) => {
      const { old_session_id, new_session_id } = event.payload;

      // Map the temp session ID to the real session ID in the wrapper
      mapSessionIds(old_session_id, new_session_id);

      currentSessionId = new_session_id; // Update the current session ID for wrapper

      // CRITICAL: Update claudeSessionStore with the real session ID
      // This is needed so subsequent messages use the real ID for --resume
      const existingData = claudeSessionStore.get(sessionId);
      if (existingData) {
        logger.info('[TauriClient] Updating claudeSessionStore with real session ID:', {
          oldId: old_session_id,
          newId: new_session_id
        });
        claudeSessionStore.set(sessionId, {
          ...existingData,
          claudeSessionId: new_session_id
        });
      }

      // Add listener for the new real session ID channel (for direct emissions)
      // BUT keep the original frontend channel listener active!
      const newChannel = `claude-message:${new_session_id}`;
      if (newChannel !== originalChannel && !activeListeners.has(newChannel)) {
        logger.info('[TauriClient] Adding listener for new channel', { newChannel, originalChannel });
        const newUnlisten = await listen(newChannel, messageHandler);
        activeListeners.set(newChannel, newUnlisten);
        additionalChannels.push(newChannel); // Track for cleanup
      }

    }).then(unlisten => {
      if (cleanupRequested) {
        unlisten();
      } else {
        updateChannelUnlisten = unlisten;
        activeListeners.set(updateChannel, unlisten);
      }
    });

    // Return cleanup function
    return () => {
      cleanupRequested = true;

      // Clean up all listeners for this session (original + additional channels)
      [channel, updateChannel, completeChannel, ...additionalChannels].forEach(ch => {
        const unlisten = activeListeners.get(ch);
        if (unlisten) {
          unlisten();
          activeListeners.delete(ch);
        }
      });

      // Clear assistant message ID tracking
      streamingAssistantMessages.delete(sessionId);
    };
  }

  /**
   * Async version of onMessage that awaits listener setup before returning.
   * Use this when you need to ensure the listener is ready before spawning a process.
   */
  async onMessageAsync(sessionId: string, handler: (message: unknown) => void): Promise<() => void> {
    const channel = `claude-message:${sessionId}`;
    const updateChannel = `claude-session-id-update:${sessionId}`;
    let currentSessionId = sessionId;

    // Dedup set for messages received on multiple channels (backend emits on original + real channels)
    const seenMessages = new Set<string>();

    // Wrap handler with streaming state management (same as onMessage)
    const messageHandler = (event: Event<any>) => {
      const payload = event.payload;

      let message: any;
      try {
        message = typeof payload === 'string' ? JSON.parse(payload) : payload;
      } catch (e) {
        logger.error(`[TauriClient] Failed to parse message:`, { payload: String(payload).substring(0, 200), error: e });
        handler({
          type: 'error',
          message: `Failed to parse message: ${e instanceof Error ? e.message : String(e)}`
        });
        return;
      }

      // Dedup: Skip if we've seen this exact message before
      const rawPayload = typeof payload === 'string' ? payload : JSON.stringify(payload);
      if (seenMessages.has(rawPayload)) {
        return;
      }
      seenMessages.add(rawPayload);
      if (seenMessages.size > 1000) {
        const toDelete = Array.from(seenMessages).slice(0, 500);
        toDelete.forEach(k => seenMessages.delete(k));
      }

      message = processWrapperMessage(message, currentSessionId);

      // Transform message based on type (simplified version - use onMessage for full handling)
      let transformedMessage: any = null;

      if (message.type === 'text') {
        const messageId = `assistant-${Date.now()}-stream`;
        if (!streamingAssistantMessages.has(sessionId)) {
          streamingAssistantMessages.set(sessionId, new Set());
        }
        streamingAssistantMessages.get(sessionId)?.add(messageId);
        transformedMessage = {
          id: messageId,
          type: 'assistant',
          message: { content: message.content || '', role: 'assistant' },
          streaming: true
        };
      } else if (message.type === 'message' && message.role === 'assistant') {
        // Gemini format
        const messageId = `assistant-${Date.now()}-${Math.random()}`;
        if (!streamingAssistantMessages.has(sessionId)) {
          streamingAssistantMessages.set(sessionId, new Set());
        }
        streamingAssistantMessages.get(sessionId)?.add(messageId);
        transformedMessage = {
          id: messageId,
          type: 'assistant',
          message: { content: message.content || '', role: 'assistant' },
          streaming: message.delta === true
        };
      } else if (message.type === 'result') {
        // Result message - unified handler matching onMessage
        // CRITICAL: Emit streaming_end BEFORE result
        queueMicrotask(() => {
          handler({
            type: 'streaming_end',
            sessionId: sessionId
          });
        });

        streamingAssistantMessages.delete(sessionId);

        // Extract model
        let model: string | undefined = message.model;
        if (!model && message.modelUsage && typeof message.modelUsage === 'object') {
          const modelKeys = Object.keys(message.modelUsage);
          if (modelKeys.length > 0) {
            model = modelKeys[0];
          }
        }

        const stats = message.stats || {};
        const usage = message.usage || stats;

        transformedMessage = {
          type: 'result',
          id: `result-${sessionId || 'temp'}-${Date.now()}`,
          subtype: message.subtype || 'success',
          is_error: message.is_error || false,
          status: message.status || (message.subtype === 'success' ? 'success' : 'error'),
          error: message.error || (message.is_error ? message.result : null),
          result: message.result,
          usage: {
            input_tokens: usage.input_tokens || stats.input || 0,
            output_tokens: usage.output_tokens || 0,
            cache_creation_input_tokens: usage.cache_creation_input_tokens || 0,
            cache_read_input_tokens: usage.cache_read_input_tokens || stats.cached || 0
          },
          total_cost_usd: message.total_cost_usd,
          duration_ms: message.duration_ms || stats.duration_ms,
          num_turns: message.num_turns,
          model: model,
          session_id: message.session_id,
          wrapper: message.wrapper,
          wrapper_tokens: message.wrapper_tokens,
          wrapper_auto_compact: message.wrapper_auto_compact,
          wrapper_compact: message.wrapper_compact
        };
      } else if (message.type === 'tool_use') {
        transformedMessage = {
          type: 'tool_use',
          id: message.id || message.tool_id,
          message: {
            name: message.name || message.tool_name,
            input: message.input || message.parameters,
            id: message.id || message.tool_id
          }
        };
        // Preserve file snapshot for line change tracking (added by rust backend)
        if (message.fileSnapshot) {
          (transformedMessage as any).fileSnapshot = message.fileSnapshot;
        }
      } else if (message.type === 'tool_result') {
        transformedMessage = {
          type: 'tool_result',
          tool_use_id: message.tool_use_id || message.tool_id,
          message: {
            content: message.content || message.output,
            is_error: message.is_error || message.status === 'error'
          }
        };
      } else if (message.type === 'error') {
        // Error message - emit streaming_end to clear UI state
        streamingAssistantMessages.delete(sessionId);
        queueMicrotask(() => {
          handler({ type: 'streaming_end', sessionId });
        });
        transformedMessage = {
          type: 'error',
          message: message.message || message.error?.message || 'Unknown error'
        };
      } else if (message.type === 'system' && message.subtype === 'error') {
        // System error - emit streaming_end to clear UI state
        streamingAssistantMessages.delete(sessionId);
        queueMicrotask(() => {
          handler({ type: 'streaming_end', sessionId });
        });
        transformedMessage = {
          type: 'error',
          message: message.message || 'System error'
        };
      } else if (message.type === 'system') {
        // Other system messages (init, etc.)
        transformedMessage = {
          type: 'system',
          subtype: message.subtype,
          session_id: message.session_id,
          message: message.message,
          streaming: message.streaming
        };
      }

      if (transformedMessage) {
        if (message.wrapper) transformedMessage.wrapper = message.wrapper;
        if (message.wrapper_tokens) transformedMessage.wrapper_tokens = message.wrapper_tokens;
        if (message.fileSnapshot) transformedMessage.fileSnapshot = message.fileSnapshot;
        handler(transformedMessage);
      }
    };

    // Await listener setup - this is the key difference from onMessage
    const unlisten = await listen(channel, messageHandler);
    activeListeners.set(channel, unlisten);

    // CRITICAL: Listen for claude-complete events (process exit)
    // This handles cases where yume-cli crashes or exits without sending result message
    const completeChannel = `claude-complete:${sessionId}`;
    const completeUnlisten = await listen(completeChannel, () => {
      logger.info('[TauriClient Async] claude-complete received for session', { sessionId });
      streamingAssistantMessages.delete(sessionId);
      // Emit streaming_end to clear UI streaming state
      handler({
        type: 'streaming_end',
        sessionId: sessionId
      });
    });
    activeListeners.set(completeChannel, completeUnlisten);

    // Track additional channels for cleanup
    const originalChannel = channel;
    const additionalChannels: string[] = [];

    // Also listen for session ID updates - ADD listeners, don't replace
    const updateUnlisten = await listen(updateChannel, async (event: Event<any>) => {
      const { old_session_id, new_session_id } = event.payload;

      currentSessionId = new_session_id;
      mapSessionIds(old_session_id, new_session_id);

      // CRITICAL: Update claudeSessionStore with the real session ID
      // This is needed so subsequent messages use the real ID for --resume
      const existingData = claudeSessionStore.get(sessionId);
      if (existingData) {
        logger.info('[TauriClient] Updating claudeSessionStore with real session ID:', {
          oldId: old_session_id,
          newId: new_session_id
        });
        claudeSessionStore.set(sessionId, {
          ...existingData,
          claudeSessionId: new_session_id
        });
      }

      // Add listener for new channel but keep original - multi-turn support
      const newChannel = `claude-message:${new_session_id}`;
      if (newChannel !== originalChannel && !activeListeners.has(newChannel)) {
        logger.info('[TauriClient Async] Adding listener for new channel', { newChannel, originalChannel });
        const newUnlisten = await listen(newChannel, messageHandler);
        activeListeners.set(newChannel, newUnlisten);
        additionalChannels.push(newChannel);
      }
    });
    activeListeners.set(updateChannel, updateUnlisten);

    // Return cleanup function
    return () => {
      [channel, updateChannel, completeChannel, ...additionalChannels].forEach(ch => {
        const unlistenFn = activeListeners.get(ch);
        if (unlistenFn) {
          unlistenFn();
          activeListeners.delete(ch);
        }
      });
      streamingAssistantMessages.delete(sessionId);
    };
  }

  /**
   * Listen for mid-stream context usage updates (Tauri path)
   * Note: For Tauri/yume-cli path, context updates are emitted via result messages
   * This is a no-op for now - yume-cli doesn't emit mid-stream context updates yet
   */
  onContextUpdate(sessionId: string, handler: (usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    totalContextTokens: number;
    timestamp: number;
  }) => void): () => void {
    // TODO: Implement Tauri event listener for context-update if yume-cli adds support
    // For now, context updates come through result messages
    return () => {};
  }

  async setWorkingDirectory(sessionId: string, directory: string): Promise<void> {
    // Not needed with Tauri - working directory set at session creation
  }

  async updateSessionMetadata(sessionId: string, metadata: Record<string, unknown>): Promise<void> {
    // Could be implemented if needed
  }

  async getSessionMappings(): Promise<Record<string, unknown>> {
    // Use session manager if needed
    return {};
  }

  async clearSession(sessionId: string): Promise<void> {
    try {
      // Clean up listeners for this session
      cleanupSessionListeners(sessionId);
      await invoke('clear_claude_context', { session_id: sessionId });
    } catch (error) {
      throw error;
    }
  }

  async checkHealth(): Promise<boolean> {
    // Always healthy with Tauri
    return true;
  }

  disconnect() {
    // Clean up all listeners
    activeListeners.forEach(unlisten => unlisten());
    activeListeners.clear();
  }

  onSessionCreated(handler: (data: SessionCreatedData) => void): void {
    this.sessionCreatedCallback = handler;
  }

  onTitle(sessionId: string, handler: (title: string) => void): () => void {
    const eventName = `claude-title:${sessionId}`;
    let cleanupRequested = false;

    // Set up Tauri event listener
    listen(eventName, (event: Event<any>) => {
      const data = event.payload;
      if (data?.title) {
        handler(data.title);
      } else if (typeof data === 'string') {
        // Handle if title is sent directly as string
        handler(data);
      }
    }).then(unlisten => {
      if (cleanupRequested) {
        // Cleanup was requested before listener was ready
        unlisten();
      } else {
        activeListeners.set(eventName, unlisten);
      }
    });

    // Return cleanup function
    return () => {
      cleanupRequested = true;
      const unlisten = activeListeners.get(eventName);
      if (unlisten) {
        unlisten();
        activeListeners.delete(eventName);
      }
    };
  }
}

// Singleton instance
export const tauriClaudeClient = new TauriClaudeClient();