/**
 * Tauri client that connects to Claude via Tauri commands
 * Replaces Socket.IO with direct Tauri IPC
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn, type Event } from '@tauri-apps/api/event';
import { processWrapperMessage, mapSessionIds } from './wrapperIntegration';
import { resolveModelId, DEFAULT_MODEL_ID } from '../config/models';

// Keep track of active listeners for cleanup
const activeListeners = new Map<string, UnlistenFn>();

// Keep track of ALL assistant message IDs during streaming for each session
const streamingAssistantMessages = new Map<string, Set<string>>();

// Module-level session store for tracking pending spawns (replaces window global)
const claudeSessionStore = new Map<string, {
  sessionId: string;
  workingDirectory: string;
  model: string;
  pendingSpawn: boolean;
  claudeSessionId?: string;
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
}

export class TauriClaudeClient {
  private connected = true; // Always connected with Tauri
  private messageHandlers = new Map<string, (message: any) => void>();
  public connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error' = 'connected';
  public connectionError: string | null = null;
  public connectionAttempts = 0;
  public debugLog: string[] = [];
  private sessionCreatedCallback: ((data: any) => void) | null = null;

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

  async createSession(name: string, workingDirectory: string, options?: any): Promise<any> {
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
          pendingSpawn: true
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

      // Prepare request for Tauri command
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

  async getSessionHistory(sessionId: string): Promise<any> {
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

  async listSessions(): Promise<any[]> {
    try {
      const response = await invoke('list_active_sessions');
      return (response as any[]) || [];
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
      console.error(`[TauriClient] Failed to interrupt session ${sessionId}:`, error);
      throw error;
    }
  }

  async sendMessage(sessionId: string, content: string, model?: string): Promise<void> {
    try {
      // Check if this session needs to be spawned first
      // This happens when createSession was called without a prompt OR when resuming a past conversation
      const sessionData = claudeSessionStore.get(sessionId);
      if (sessionData?.pendingSpawn) {
        const mappedModel = model ? resolveModelId(model) : sessionData.model;

        // Check if this is a resume of a past conversation (has claudeSessionId)
        const isResuming = !!sessionData.claudeSessionId;
        console.log('[TauriClient] Spawning session:', {
          sessionId,
          isResuming,
          claudeSessionId: sessionData.claudeSessionId
        });

        // Spawn Claude with the first message as the prompt
        // If resuming, pass the claudeSessionId as resume_session_id
        const spawnRequest = {
          project_path: sessionData.workingDirectory,
          model: mappedModel,
          prompt: content, // Pass the message as the initial prompt
          resume_session_id: isResuming ? sessionData.claudeSessionId : null
        };

        const response = await invoke('spawn_claude_session', { request: spawnRequest });

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
        const request = {
          session_id: sessionId,
          message: content
        };

        await invoke('send_claude_message', { request });
      }
    } catch (error) {
      throw error;
    }
  }

  onError(sessionId: string, handler: (error: any) => void): () => void {
    const channel = `claude-error:${sessionId}`;
    let cleanupRequested = false;

    const errorHandler = (event: Event<any>) => {
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

  onMessage(sessionId: string, handler: (message: any) => void): () => void {
    let channel = `claude-message:${sessionId}`;
    const updateChannel = `claude-session-id-update:${sessionId}`;
    let currentSessionId = sessionId; // Track the current session ID for wrapper

    let currentUnlisten: UnlistenFn | null = null;

    // Wrap handler with streaming state management
    const messageHandler = (event: Event<any>) => {
      const payload = event.payload;
      
      // Parse the raw JSON string from backend
      let message: any;
      try {
        // Backend now sends raw JSON strings like Claudia does
        message = typeof payload === 'string' ? JSON.parse(payload) : payload;
      } catch (e) {
        console.error(`[TauriClient] Failed to parse message:`, { payload: String(payload).substring(0, 200), error: e });
        // Emit error to handler
        handler({
          type: 'error',
          message: `Failed to parse message: ${e instanceof Error ? e.message : String(e)}`
        });
        return;
      }

      // WRAPPER: Process message for token tracking and compaction detection
      message = processWrapperMessage(message, currentSessionId);

      // Transform message format to match expected format
      let transformedMessage: any = null;
      
      // Handle different message types from Claude's stream-json output
      if (message.type === 'text') {
        // Text content from Claude - streaming assistant message
        const messageId = `assistant-${Date.now()}-stream`;
        
        // Track this streaming message
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
          streaming: true
        };
      } else if (message.type === 'message_stop') {
        // Message complete - but DON'T clear streaming yet! Wait for result
        // Don't send any update here
      } else if (message.type === 'usage') {
        // Token usage information
        transformedMessage = {
          type: 'result',
          usage: {
            input_tokens: message.input_tokens,
            output_tokens: message.output_tokens,
            cache_creation_input_tokens: message.cache_creation_input_tokens || 0,
            cache_read_input_tokens: message.cache_read_input_tokens || 0
          }
        };
      } else if (message.type === 'error') {
        transformedMessage = {
          type: 'error',
          message: message.message
        };
      } else if (message.type === 'tool_use') {
        // Standalone tool_use message (shouldn't happen with Claude's current output)
        transformedMessage = {
          type: 'tool_use',
          id: message.id,
          message: {
            name: message.name,
            input: message.input
          }
        };
      } else if (message.type === 'tool_result') {
        // Tool result
        transformedMessage = {
          type: 'tool_result',
          tool_use_id: message.tool_use_id,
          message: {
            content: message.content,
            is_error: message.is_error
          }
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
            const toolMessage = {
              type: 'tool_use',
              id: toolUse.id || `tool-${Date.now()}-${Math.random()}`,
              message: {
                name: toolUse.name,
                input: toolUse.input,
                id: toolUse.id
              },
              timestamp: Date.now()
            };
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
        // System messages
        transformedMessage = {
          type: 'system',
          subtype: message.subtype,
          session_id: message.session_id,
          message: message.message,
          streaming: message.streaming // Pass through streaming state for system messages
        };
      } else if (message.type === 'interrupt') {
        // Interrupt signal
        transformedMessage = {
          type: 'interrupt'
        };
      } else if (message.type === 'result') {
        // Result message (completion) - THIS is when we clear streaming
        // Send a special streaming end message
        handler({
          type: 'streaming_end',
          sessionId: sessionId
        });

        // Clear tracking
        streamingAssistantMessages.delete(sessionId);
        
        transformedMessage = {
          type: 'result',
          subtype: message.subtype,
          status: message.status || (message.subtype === 'success' ? 'success' : 'error'),
          error: message.error || (message.is_error ? message.result : null),
          result: message.result,
          usage: message.usage,
          total_cost_usd: message.total_cost_usd,
          duration_ms: message.duration_ms,
          // CRITICAL: Include fields needed for compact detection
          num_turns: message.num_turns,
          session_id: message.session_id,
          is_error: message.is_error,
          // CRITICAL: Preserve wrapper metadata from processWrapperMessage
          wrapper: message.wrapper,
          wrapper_tokens: message.wrapper_tokens,
          wrapper_auto_compact: message.wrapper_auto_compact,
          wrapper_compact: message.wrapper_compact
        };
      }
      
      if (transformedMessage) {
        // ALWAYS preserve wrapper metadata if present
        if (message.wrapper) transformedMessage.wrapper = message.wrapper;
        if (message.wrapper_tokens) transformedMessage.wrapper_tokens = message.wrapper_tokens;
        if (message.wrapper_auto_compact) transformedMessage.wrapper_auto_compact = message.wrapper_auto_compact;
        if (message.wrapper_compact) transformedMessage.wrapper_compact = message.wrapper_compact;

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

    // Listen for session ID updates to switch channels
    // CRITICAL: Set up new listener BEFORE cleaning up old to prevent message loss
    listen(updateChannel, async (event: Event<any>) => {
      const { old_session_id, new_session_id } = event.payload;
      const oldChannel = channel;
      const oldUnlisten = currentUnlisten;

      // Set up new listener FIRST (before cleanup) to prevent gap
      channel = `claude-message:${new_session_id}`;

      // Map the temp session ID to the real session ID in the wrapper
      mapSessionIds(old_session_id, new_session_id);

      currentSessionId = new_session_id; // Update the current session ID for wrapper

      // Set up new listener before cleaning up old one
      const newUnlisten = await listen(channel, messageHandler);
      currentUnlisten = newUnlisten;
      activeListeners.set(channel, newUnlisten);

      // NOW clean up old listener (after new one is ready)
      // This ensures overlap rather than gap - no messages lost
      if (oldUnlisten) {
        oldUnlisten();
        activeListeners.delete(oldChannel);
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

      // Clean up all listeners for this session
      [channel, updateChannel].forEach(ch => {
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

  async setWorkingDirectory(sessionId: string, directory: string): Promise<void> {
    // Not needed with Tauri - working directory set at session creation
  }

  async updateSessionMetadata(sessionId: string, metadata: any): Promise<void> {
    // Could be implemented if needed
  }

  async getSessionMappings(): Promise<Record<string, any>> {
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

  onSessionCreated(handler: (data: any) => void): void {
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