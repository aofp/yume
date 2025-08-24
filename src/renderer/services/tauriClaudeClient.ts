/**
 * Tauri client that connects to Claude via Tauri commands
 * Replaces Socket.IO with direct Tauri IPC
 */

console.log('🔥🔥🔥 TAURI CLIENT FILE LOADING 🔥🔥🔥');

import { invoke, type Event } from '@tauri-apps/api/core';
import { listen, emit, type UnlistenFn } from '@tauri-apps/api/event';
import { processWrapperMessage } from './wrapperIntegration';

// Force wrapper module to load
console.log('[TauriClient] Wrapper module imported, processWrapperMessage:', typeof processWrapperMessage);

// Keep track of active listeners for cleanup
const activeListeners = new Map<string, UnlistenFn>();

// Keep track of last assistant message IDs for streaming state management
const lastAssistantMessageIds = new Map<string, string>();

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
      // Map our model IDs to Claude model names
      const modelMap: Record<string, string> = {
        'opus': 'claude-opus-4-1-20250805',
        'sonnet': 'claude-sonnet-4-20250514'
      };
      const model = options?.model || 'claude-opus-4-1-20250805';
      const mappedModel = modelMap[model] || model;

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
        const modelMap: Record<string, string> = {
          'opus': 'claude-opus-4-1-20250805',
          'sonnet': 'claude-sonnet-4-20250514'
        };
        const mappedModel = model ? (modelMap[model] || model) : sessionData.model;
        
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
      
      // Handle different message types from Claude's stream-json output
      if (message.type === 'text') {
        // Text content from Claude - streaming assistant message
        const messageId = lastAssistantMessageIds.get(sessionId) || `assistant-${Date.now()}`;
        lastAssistantMessageIds.set(sessionId, messageId);
        
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
        // Message complete - clear streaming
        const messageId = lastAssistantMessageIds.get(sessionId);
        if (messageId) {
          transformedMessage = {
            id: messageId,
            type: 'assistant',
            streaming: false
          };
          lastAssistantMessageIds.delete(sessionId);
        }
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
        // Tool use request from Claude - might be nested in assistant message
        // Check if it's in the content array of an assistant message
        if (message.message && Array.isArray(message.message.content)) {
          const toolUse = message.message.content.find((c: any) => c.type === 'tool_use');
          if (toolUse) {
            transformedMessage = {
              type: 'tool_use',
              id: toolUse.id,
              message: {
                name: toolUse.name,
                input: toolUse.input
              }
            };
          }
        } else {
          transformedMessage = {
            type: 'tool_use',
            id: message.id,
            message: {
              name: message.name,
              input: message.input
            }
          };
        }
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
          thought: message.thought
        };
      } else if (message.type === 'assistant') {
        // Full assistant message from Claude
        // Claude sends: {"type":"assistant","message":{...},"session_id":"..."}
        const messageData = message.message || {};
        const messageId = messageData.id || `assistant-${Date.now()}`;
        
        // Extract text content from the content array
        let content = '';
        if (Array.isArray(messageData.content)) {
          // Extract text from content array
          content = messageData.content
            .filter((c: any) => c.type === 'text')
            .map((c: any) => c.text || '')
            .join('');
        } else if (typeof messageData.content === 'string') {
          content = messageData.content;
        }
        
        // Check if this assistant message contains tool_use
        const hasToolUse = Array.isArray(messageData.content) && 
          messageData.content.some((c: any) => c.type === 'tool_use');
        
        if (hasToolUse) {
          // Extract tool_use from content
          const toolUse = messageData.content.find((c: any) => c.type === 'tool_use');
          transformedMessage = {
            type: 'tool_use',
            id: toolUse.id,
            message: {
              name: toolUse.name,
              input: toolUse.input
            }
          };
        } else {
          // Regular text assistant message
          transformedMessage = {
            id: messageId,
            type: 'assistant',
            message: {
              ...messageData,
              content: content,  // Use extracted text content
              role: 'assistant'
            },
            model: messageData.model,
            streaming: false // Complete message
          };
        }
      } else if (message.type === 'user') {
        // User message echo from Claude
        const messageData = message.message || {};
        
        // Extract content properly
        let content = messageData.content;
        if (Array.isArray(content)) {
          // Handle tool results and text content
          content = messageData.content;
        }
        
        transformedMessage = {
          id: `user-${Date.now()}`,
          type: 'user',
          message: {
            ...messageData,
            content: content,
            role: 'user'
          }
        };
      } else if (message.type === 'system') {
        // System messages
        transformedMessage = {
          type: 'system',
          subtype: message.subtype,
          session_id: message.session_id,
          message: message.message
        };
      } else if (message.type === 'interrupt') {
        // Interrupt signal
        transformedMessage = {
          type: 'interrupt'
        };
      } else if (message.type === 'result') {
        // Result message (completion)
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
      currentSessionId = new_session_id; // Update the current session ID for wrapper
      console.log(`[TauriClient] Switching to new channel: ${channel}, wrapper session: ${currentSessionId}`);
      
      const newUnlisten = await listen(channel, messageHandler);
      currentUnlisten = newUnlisten;
      activeListeners.set(channel, newUnlisten);
    }).then(unlisten => {
      activeListeners.set(updateChannel, unlisten);
    });
    
    // Also listen for token events
    const tokenChannel = `claude-tokens:${sessionId}`;
    listen(tokenChannel, (event: Event<any>) => {
      const usage = event.payload;
      const usageMessage = {
        type: 'result',
        usage: usage
      };
      handler(usageMessage);
    }).then(unlisten => {
      activeListeners.set(tokenChannel, unlisten);
    });
    
    // Listen for completion events
    const completeChannel = `claude-complete:${sessionId}`;
    listen(completeChannel, (event: Event<any>) => {
      // Clear streaming state on completion
      const messageId = lastAssistantMessageIds.get(sessionId);
      if (messageId) {
        const completeMessage = {
          id: messageId,
          type: 'assistant',
          streaming: false
        };
        handler(completeMessage);
        lastAssistantMessageIds.delete(sessionId);
      }
    }).then(unlisten => {
      activeListeners.set(completeChannel, unlisten);
    });
    
    console.log(`[TauriClient] 👂 Listening for messages on ${channel}`);
    
    // Return cleanup function
    return () => {
      // Clean up all listeners for this session
      [channel, tokenChannel, completeChannel, updateChannel].forEach(ch => {
        const unlisten = activeListeners.get(ch);
        if (unlisten) {
          unlisten();
          activeListeners.delete(ch);
          console.log(`[TauriClient] 🔇 Stopped listening on ${ch}`);
        }
      });
      
      // Clear assistant message ID tracking
      lastAssistantMessageIds.delete(sessionId);
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