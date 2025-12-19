/**
 * Tauri client that connects to Claude via Tauri commands
 * Replaces Socket.IO with direct Tauri IPC
 */

console.log('🔥🔥🔥 TAURI CLIENT FILE LOADING 🔥🔥🔥');

import { invoke, type Event } from '@tauri-apps/api/core';
import { listen, emit, type UnlistenFn } from '@tauri-apps/api/event';
import { processWrapperMessage, mapSessionIds } from './wrapperIntegration';
import { resolveModelId, DEFAULT_MODEL_ID } from '../config/models';

// Force wrapper module to load
console.log('[TauriClient] Wrapper module imported, processWrapperMessage:', typeof processWrapperMessage);

// Keep track of active listeners for cleanup
const activeListeners = new Map<string, UnlistenFn>();

// Keep track of ALL assistant message IDs during streaming for each session
const streamingAssistantMessages = new Map<string, Set<string>>();

export class TauriClaudeClient {
  private connected = true; // Always connected with Tauri
  private messageHandlers = new Map<string, (message: any) => void>();
  public connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error' = 'connected';
  public connectionError: string | null = null;
  public connectionAttempts = 0;
  public debugLog: string[] = [];
  private sessionCreatedCallback: ((data: any) => void) | null = null;

  constructor() {
    console.log('[TauriClaudeClient] Initializing...');
    console.log('[TauriClaudeClient] Tauri IPC always available');
    // No connection needed - Tauri IPC is always available
    this.connectionStatus = 'connected';
    
    // Initialize global session store for tracking pending spawns
    if (!(window as any).__claudeSessionStore) {
      (window as any).__claudeSessionStore = {};
    }
  }

  isConnected(): boolean {
    return true; // Always connected with Tauri
  }

  getServerPort(): number | null {
    return null; // Not applicable for Tauri
  }

  async createSession(name: string, workingDirectory: string, options?: any): Promise<any> {
    console.log('[TauriClient] Creating/resuming session:', { 
      name, 
      workingDirectory, 
      options 
    });

    try {
      // Resolve model ID using centralized config
      const model = options?.model || DEFAULT_MODEL_ID;
      const mappedModel = resolveModelId(model);

      // If we're creating a new session without a prompt, don't spawn Claude yet
      // The session will be spawned when the first message is sent
      const isNewSession = !options?.claudeSessionId;
      const hasPrompt = options?.prompt && options.prompt.trim().length > 0;
      
      if (isNewSession && !hasPrompt) {
        console.log('[TauriClient] New session without prompt - deferring Claude spawn until first message');
        // Return a placeholder session that will be properly initialized on first message
        const tempSessionId = options?.sessionId || `session-${Date.now()}`;
        
        // Store session data for deferred spawn
        (window as any).__claudeSessionStore[tempSessionId] = {
          sessionId: tempSessionId,
          workingDirectory: workingDirectory,
          model: mappedModel,
          pendingSpawn: true
        };
        
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
      
      console.log('[TauriClient] Session creation response:', response);
      
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
      console.error('[TauriClient] Session creation failed:', error);
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
      console.error('[TauriClient] Failed to get session history:', error);
      throw error;
    }
  }

  async listSessions(): Promise<any[]> {
    try {
      const response = await invoke('list_active_sessions');
      return (response as any[]) || [];
    } catch (error) {
      console.error('[TauriClient] Failed to list sessions:', error);
      throw error;
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    // Not implemented in Tauri backend yet
    // Sessions are cleaned up automatically
    console.log('[TauriClient] deleteSession not implemented, sessions auto-cleanup');
  }

  async interrupt(sessionId: string): Promise<void> {
    console.log(`⛔ [TauriClient] Interrupting session ${sessionId}`);
    try {
      await invoke('interrupt_claude_session', { session_id: sessionId });
      console.log(`✅ [TauriClient] Interrupted session ${sessionId}`);
    } catch (error) {
      console.error(`[TauriClient] Failed to interrupt: ${error}`);
      // Still resolve to allow UI to update
    }
  }
  
  async sendMessage(sessionId: string, content: string, model?: string): Promise<void> {
    console.log(`[TauriClient] 📤 Sending message:`, {
      sessionId,
      contentLength: content.length,
      contentPreview: content.substring(0, 100),
      model
    });

    try {
      // Check if this session needs to be spawned first
      // This happens when createSession was called without a prompt
      const sessionStore = (window as any).__claudeSessionStore;
      if (sessionStore && sessionStore[sessionId]?.pendingSpawn) {
        console.log('[TauriClient] Session needs spawn - including prompt with spawn command');
        
        const sessionData = sessionStore[sessionId];
        const mappedModel = model ? resolveModelId(model) : sessionData.model;
        
        // Spawn Claude with the first message as the prompt
        const spawnRequest = {
          project_path: sessionData.workingDirectory,
          model: mappedModel,
          prompt: content, // Pass the message as the initial prompt
          resume_session_id: null,
          continue_conversation: false
        };
        
        const response = await invoke('spawn_claude_session', { request: spawnRequest });
        console.log('[TauriClient] Spawned Claude with first message, response:', response);
        
        // Update session store with the real Claude session ID
        const realSessionId = (response as any).session_id;
        sessionStore[sessionId] = {
          ...sessionData,
          claudeSessionId: realSessionId,
          pendingSpawn: false
        };
        
        // Emit a session created event so the store can update the mapping
        console.log('[TauriClient] Checking sessionCreatedCallback...', !!this.sessionCreatedCallback);
        if (this.sessionCreatedCallback) {
          console.log('[TauriClient] Calling sessionCreatedCallback with:', { sessionId, realSessionId });
          this.sessionCreatedCallback({
            tempSessionId: sessionId,
            realSessionId: realSessionId
          });
          console.log('[TauriClient] sessionCreatedCallback called successfully');
        } else {
          console.error('[TauriClient] ⚠️ sessionCreatedCallback is not registered!');
        }
        
        // Don't update sessionId here - keep using the original for this message
        // The store will handle the mapping
      } else {
        // Normal message send for already-spawned sessions
        const request = {
          session_id: sessionId,
          message: content
        };
        
        await invoke('send_claude_message', { request });
      }
      
      console.log('[TauriClient] ✅ Message sent successfully');
    } catch (error) {
      console.error('[TauriClient] Failed to send message:', error);
      throw error;
    }
  }

  onError(sessionId: string, handler: (error: any) => void): () => void {
    const channel = `claude-error:${sessionId}`;
    
    const errorHandler = (event: Event<any>) => {
      const error = event.payload;
      const timestamp = new Date().toISOString();
      console.error(`[TauriClient] ❌ [${timestamp}] Received error:`, {
        channel,
        type: error.type,
        message: error.message,
        timestamp: error.timestamp
      });
      handler(error);
    };
    
    // Set up Tauri event listener
    listen(channel, errorHandler).then(unlisten => {
      activeListeners.set(channel, unlisten);
    });
    
    console.log(`[TauriClient] 👂 Listening for errors on ${channel}`);
    
    return () => {
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
    console.log(`[TauriClient] 📡 Setting up listeners:`, {
      messageChannel: channel,
      updateChannel: updateChannel,
      sessionId: sessionId
    });
    
    let currentUnlisten: UnlistenFn | null = null;
    
    // Wrap handler with streaming state management
    const messageHandler = (event: Event<any>) => {
      console.log(`[TauriClient] 🎯 Received event on ${channel}:`, {
        channel,
        payloadType: typeof event.payload,
        payloadLength: typeof event.payload === 'string' ? event.payload.length : 'not string',
        payload: event.payload
      });
      const payload = event.payload;
      const timestamp = new Date().toISOString();
      
      // Parse the raw JSON string from backend
      let message: any;
      try {
        // Backend now sends raw JSON strings like Claudia does
        message = typeof payload === 'string' ? JSON.parse(payload) : payload;
      } catch (e) {
        console.error('[TauriClient] Failed to parse message:', payload);
        return;
      }
      
      // WRAPPER: Process message for token tracking and compaction detection
      console.log('[TauriClient] BEFORE wrapper:', message.type, currentSessionId);
      message = processWrapperMessage(message, currentSessionId);
      console.log('[TauriClient] AFTER wrapper:', message.type, 'has wrapper:', !!message.wrapper);
      
      // Transform message format to match expected format
      let transformedMessage: any = null;
      
      // Debug log the exact message structure
      console.log('[TauriClient] 🔍 Raw message structure:', {
        type: message.type,
        hasMessage: !!message.message,
        messageKeys: message.message ? Object.keys(message.message) : [],
        contentType: message.message?.content ? typeof message.message.content : 'no content',
        contentArray: Array.isArray(message.message?.content),
        contentBlocks: Array.isArray(message.message?.content) ? 
          message.message.content.map((c: any) => ({ type: c.type, hasName: !!c.name, hasInput: !!c.input })) : 
          []
      });
      
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
        console.log('[TauriClient] 📍 Message stop received but keeping streaming active until result');
        // Don't send any update here - just log it
      } else if (message.type === 'usage') {
        // Token usage information
        console.log('🎯 [TauriClient] Main channel USAGE message:', {
          input: message.input_tokens,
          output: message.output_tokens,
          cache_creation: message.cache_creation_input_tokens,
          cache_read: message.cache_read_input_tokens,
          sessionId: currentSessionId
        });
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
        // ALWAYS generate a unique ID for each message - no updates!
        const messageId = `assistant-${Date.now()}-${Math.random()}`;
        
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
          
          // Log thinking blocks specifically
          const thinkingBlocks = messageData.content.filter((c: any) => c.type === 'thinking');
          if (thinkingBlocks.length > 0) {
            console.log('[TauriClient] 🧠 Found thinking blocks:', thinkingBlocks);
          }
          
          // Send tool_use blocks as separate messages
          for (const toolUse of toolUseBlocks) {
            console.log('[TauriClient] 🔧 Extracting tool_use from assistant message:', toolUse);
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
            console.log('[TauriClient] 🔧 Emitting tool_use message:', toolMessage);
            handler(toolMessage);
          }
          
          // Keep only text/thinking blocks for the assistant message
          processedContent = textBlocks;
        }
        
        // ALWAYS send assistant messages, even if empty (to maintain context)
        // Track ALL assistant messages during streaming
        if (!streamingAssistantMessages.has(sessionId)) {
          streamingAssistantMessages.set(sessionId, new Set());
        }
        streamingAssistantMessages.get(sessionId)?.add(messageId);
        
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
          streaming: true // ALWAYS true for assistant messages - let result clear it
        };
        
        console.log(`[TauriClient] 📝 Assistant message NEW:`, {
          id: messageId,
          hasText: textBlocks.length > 0,
          hasTools: toolUseBlocks.length > 0,
          isEmpty: processedContent.length === 0,
          streaming: true,
          stopReason: messageData.stop_reason
        });
      } else if (message.type === 'user') {
        // User message echo from Claude
        const messageData = message.message || {};
        console.log('[TauriClient] 📥 Processing user message:', messageData);
        
        // Check if this is a tool_result message
        let hasToolResult = false;
        if (Array.isArray(messageData.content)) {
          for (const block of messageData.content) {
            if (block.type === 'tool_result') {
              hasToolResult = true;
              console.log('[TauriClient] 📥 Extracting tool_result from user message:', block);
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
              console.log('[TauriClient] 📥 Emitting tool_result message:', toolResultMessage);
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
        console.log('[TauriClient] 📥 Sending user message (has tool_result: ' + hasToolResult + ')');
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
        console.log('[TauriClient] 🏁 RESULT received - clearing streaming state NOW');
        
        // Send streaming_end for ALL assistant messages from this session
        const assistantMessages = streamingAssistantMessages.get(sessionId);
        if (assistantMessages && assistantMessages.size > 0) {
          console.log(`[TauriClient] 🏁 Clearing streaming for ${assistantMessages.size} assistant messages`);
        }
        
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
        console.log(`[TauriClient] 📨 [${timestamp}] Received message:`, {
          channel,
          originalType: message.type,
          transformedType: transformedMessage.type,
          hasWrapper: !!transformedMessage.wrapper,
          wrapperTokens: transformedMessage.wrapper?.tokens?.total || 0,
          streaming: transformedMessage.streaming,
          id: transformedMessage.id
        });
        
        handler(transformedMessage);
      }
    };
    
    // Set up Tauri event listener
    listen(channel, messageHandler).then(unlisten => {
      currentUnlisten = unlisten;
      activeListeners.set(channel, unlisten);
    });
    
    // Listen for session ID updates to switch channels
    listen(updateChannel, async (event: Event<any>) => {
      const { old_session_id, new_session_id } = event.payload;
      console.log(`[TauriClient] 🔄 Session ID update received:`, {
        updateChannel,
        old_session_id,
        new_session_id,
        payload: event.payload
      });
      
      // Clean up old listener
      if (currentUnlisten) {
        currentUnlisten();
        activeListeners.delete(channel);
      }
      
      // Set up new listener on the new channel
      channel = `claude-message:${new_session_id}`;
      
      // Map the temp session ID to the real session ID in the wrapper
      mapSessionIds(old_session_id, new_session_id);
      
      currentSessionId = new_session_id; // Update the current session ID for wrapper
      console.log(`[TauriClient] Switching to new channel: ${channel}, wrapper session: ${currentSessionId}`);
      
      const newUnlisten = await listen(channel, messageHandler);
      currentUnlisten = newUnlisten;
      activeListeners.set(channel, newUnlisten);
      
      // Also update token listener to new session ID
      setupTokenListener(new_session_id);
    }).then(unlisten => {
      activeListeners.set(updateChannel, unlisten);
    });
    
    // Token listener - will be updated when session ID changes
    let tokenChannel = `claude-tokens:${sessionId}`;
    let tokenUnlisten: UnlistenFn | null = null;
    
    const setupTokenListener = (newSessionId: string) => {
      // Clean up old token listener if exists
      if (tokenUnlisten) {
        tokenUnlisten();
        activeListeners.delete(tokenChannel);
      }
      
      // Set up new token listener
      tokenChannel = `claude-tokens:${newSessionId}`;
      console.log(`[TauriClient] 📊 Setting up token listener on ${tokenChannel}`);
      
      listen(tokenChannel, (event: Event<any>) => {
        // DEBUG ONLY - tokens are already processed via the main message channel
        // The raw JSON with usage data goes through processWrapperMessage which accumulates tokens
        // This listener is for debugging/monitoring only to avoid double-counting
        console.log('[TauriClient] 📊 Token update (debug only):', {
          sessionId: currentSessionId,
          tokens: event.payload?.tokens
        });
      }).then(unlisten => {
        tokenUnlisten = unlisten;
        activeListeners.set(tokenChannel, unlisten);
      });
    };
    
    // Set up initial token listener
    setupTokenListener(sessionId);
    
    // Global token listener - DEBUG ONLY, does not call handler to avoid double-counting
    // The session-specific listener above handles actual token processing
    listen('claude-tokens', (event: Event<any>) => {
      // Debug logging only - don't process to avoid double-counting with session-specific listener
      console.log('[TauriClient] 📊 GLOBAL token event (debug only):', {
        sessionId: event.payload?.session_id,
        tokens: event.payload?.tokens,
        currentSessionId
      });
    }).then(unlisten => {
      activeListeners.set('claude-tokens-global', unlisten);
    });
    
    // NO COMPLETE LISTENER - streaming is cleared ONLY by result message
    // This prevents premature clearing of the thinking indicator
    
    console.log(`[TauriClient] 👂 Listening for messages on ${channel}`);
    
    // Return cleanup function
    return () => {
      // Clean up all listeners for this session
      [channel, tokenChannel, updateChannel].forEach(ch => {
        const unlisten = activeListeners.get(ch);
        if (unlisten) {
          unlisten();
          activeListeners.delete(ch);
          console.log(`[TauriClient] 🔇 Stopped listening on ${ch}`);
        }
      });
      
      // Clear assistant message ID tracking
      streamingAssistantMessages.delete(sessionId);
    };
  }

  async setWorkingDirectory(sessionId: string, directory: string): Promise<void> {
    // Not needed with Tauri - working directory set at session creation
    console.log('[TauriClient] setWorkingDirectory not needed with Tauri');
  }

  async updateSessionMetadata(sessionId: string, metadata: any): Promise<void> {
    // Could be implemented if needed
    console.log('[TauriClient] updateSessionMetadata not implemented');
  }

  async getSessionMappings(): Promise<Record<string, any>> {
    // Use session manager if needed
    return {};
  }

  async clearSession(sessionId: string): Promise<void> {
    console.log(`🧹 [TauriClient] Sending clearSession for session ${sessionId}`);
    try {
      await invoke('clear_claude_context', { session_id: sessionId });
      console.log(`🧹 [TauriClient] clearSession success`);
    } catch (error) {
      console.error(`🧹 [TauriClient] clearSession failed:`, error);
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
    console.log('[TauriClient] Registering sessionCreatedCallback');
    this.sessionCreatedCallback = handler;
    console.log('[TauriClient] sessionCreatedCallback registered:', !!this.sessionCreatedCallback);
  }
  
  onTitle(sessionId: string, handler: (title: string) => void): () => void {
    const eventName = `claude-title:${sessionId}`;
    console.log(`[TauriClient] 🏷️ Setting up title listener for ${eventName}`);
    
    // Set up Tauri event listener
    listen(eventName, (event: Event<any>) => {
      const data = event.payload;
      console.log(`[TauriClient] 🏷️ Received title event:`, eventName, data);
      if (data?.title) {
        console.log(`[TauriClient] 🏷️ Calling handler with title: "${data.title}"`);
        handler(data.title);
      } else if (typeof data === 'string') {
        // Handle if title is sent directly as string
        handler(data);
      }
    }).then(unlisten => {
      activeListeners.set(eventName, unlisten);
    });
    
    // Return cleanup function
    return () => {
      const unlisten = activeListeners.get(eventName);
      if (unlisten) {
        unlisten();
        activeListeners.delete(eventName);
      }
    };
  }
}

// Singleton instance
console.log('🔴 [CREATING TAURI CLIENT INSTANCE]');
export const tauriClaudeClient = new TauriClaudeClient();
console.log('🔴 [TAURI CLIENT CREATED]', tauriClaudeClient);