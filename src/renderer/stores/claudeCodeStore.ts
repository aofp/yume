/**
 * Zustand store specifically for Claude Code SDK integration
 * Handles sessions, streaming messages, and all SDK features
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { claudeCodeClient } from '../services/claudeCodeClient';

export type SDKMessage = any; // Type from Claude Code SDK

export interface SessionAnalytics {
  totalMessages: number;
  userMessages: number;
  assistantMessages: number;
  toolUses: number;
  tokens: {
    input: number;
    output: number;
    total: number;
    byModel: {
      opus: { input: number; output: number; total: number; };
      sonnet: { input: number; output: number; total: number; };
    };
  };
  cost?: {
    total: number;
    byModel: {
      opus: number;
      sonnet: number;
    };
  };
  duration: number; // in milliseconds
  lastActivity: Date;
}

export interface Session {
  id: string;
  name: string;
  status: 'pending' | 'active' | 'paused' | 'completed' | 'error';
  messages: SDKMessage[];
  workingDirectory?: string;
  createdAt: Date;
  updatedAt: Date;
  claudeSessionId?: string; // Track the Claude SDK session ID
  analytics?: SessionAnalytics; // Per-session analytics
  draftInput?: string; // Store draft input text
  draftAttachments?: any[]; // Store draft attachments
  streaming?: boolean; // Track if this session is currently streaming
}

interface ClaudeCodeStore {
  // Sessions
  sessions: Session[];
  currentSessionId: string | null;
  persistedSessionId: string | null; // Track the sessionId for persistence
  
  // Model
  selectedModel: string;
  
  // Streaming (deprecated - now per-session)
  streamingMessage: string;
  
  // Session management
  isLoadingHistory: boolean;
  availableSessions: any[]; // List of available persisted sessions
  
  // Actions
  setSelectedModel: (modelId: string) => void;
  createSession: (name?: string, directory?: string, existingSessionId?: string) => Promise<string>;
  setCurrentSession: (sessionId: string) => void;
  sendMessage: (content: string) => Promise<void>;
  resumeSession: (sessionId: string) => Promise<void>;
  pauseSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;
  deleteAllSessions: () => void;
  reorderSessions: (fromIndex: number, toIndex: number) => void;
  interruptSession: () => Promise<void>;
  clearContext: (sessionId: string) => void;
  updateSessionDraft: (sessionId: string, input: string, attachments: any[]) => void;
  
  // Session persistence
  loadSessionHistory: (sessionId: string) => Promise<void>;
  listAvailableSessions: () => Promise<void>;
  loadPersistedSession: (sessionId: string) => Promise<void>;
  
  // Model management
  toggleModel: () => void;
  
  // MCP & Tools
  configureMcpServers: (servers: any) => Promise<void>;
  setPermissionMode: (mode: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan') => void;
  updateAllowedTools: (tools: string[]) => void;
}

export const useClaudeCodeStore = create<ClaudeCodeStore>()(
  persist(
    (set, get) => ({
  sessions: [],
  currentSessionId: null,
  persistedSessionId: null,
  selectedModel: 'claude-opus-4-1-20250805',
  streamingMessage: '',
  isLoadingHistory: false,
  availableSessions: [],
  
  setSelectedModel: (modelId: string) => {
    set({ selectedModel: modelId });
    // Could notify the server about model change here if needed
    console.log('Model changed to:', modelId);
  },
  
  createSession: async (name?: string, directory?: string, existingSessionId?: string) => {
    console.log('createSession called with:', { name, directory, existingSessionId });
    console.trace('Stack trace for createSession');
    
    try {
      // Generate more entropic session ID with timestamp and random components
      const timestamp = Date.now().toString(36).substring(5);
      const random1 = Math.random().toString(36).substring(2, 5);
      const random2 = (Math.random() * 1000000).toString(36).substring(0, 3);
      const hexId = `${random1}${timestamp}${random2}`.substring(0, 8);
      const sessionName = name || `session ${hexId}`;
      const workingDirectory = directory || '/';
      
      // STEP 1: Create tab immediately with pending status
      const tempSessionId = `temp-${hexId}`;
      const pendingSession: Session = {
        id: tempSessionId,
        name: sessionName,
        status: 'pending' as const,
        messages: [],
        workingDirectory,
        createdAt: new Date(),
        updatedAt: new Date(),
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
          lastActivity: new Date()
        }
      };
      
      // Add pending session to store immediately so tab appears
      set(state => ({
        sessions: [...state.sessions, pendingSession],
        currentSessionId: tempSessionId
      }));
      
      // STEP 2: Initialize Claude SDK session in background
      try {
        // Map our model IDs to Claude Code SDK model names
        const { selectedModel } = get();
        const modelMap: Record<string, string> = {
          'opus': 'claude-opus-4-1-20250805',
          'sonnet': 'claude-sonnet-4-20250514'
        };
        
        // Create or resume session using Claude Code Client
        const result = await claudeCodeClient.createSession(sessionName, workingDirectory, {
          allowedTools: [
            'Read', 'Write', 'Edit', 'MultiEdit',
            'LS', 'Glob', 'Grep',
            'Bash',
            'WebFetch', 'WebSearch',
            'TodoWrite'
          ],
          permissionMode: 'default',
          maxTurns: 30,
          model: modelMap[selectedModel] || 'claude-opus-4-1-20250805',
          sessionId: existingSessionId // Pass existing sessionId if resuming
        });
        
        const sessionId = result.sessionId || result;
        const existingMessages = result.messages || [];
        const claudeSessionId = result.claudeSessionId;
        
        // STEP 3: Update tab to active status with real session ID
        const activeSession: Session = {
          id: sessionId,
          name: sessionName,
          status: 'active' as const,
          messages: existingMessages,
          workingDirectory: result.workingDirectory || workingDirectory,
          createdAt: pendingSession.createdAt,
          updatedAt: new Date(),
          claudeSessionId
        };
        
        // Replace pending session with active one
        set(state => ({
          sessions: state.sessions.map(s => 
            s.id === tempSessionId ? activeSession : s
          ),
          currentSessionId: sessionId
        }));
      
      // Don't add initial system message here - Claude Code SDK sends it automatically
      
      // Set up message listener for REAL responses
      const cleanup = claudeCodeClient.onMessage(sessionId, (message) => {
          // Handle streaming messages by updating existing message or adding new
          set(state => {
            let sessions = state.sessions.map(s => {
              if (s.id !== sessionId) return s;
              
              const existingMessages = [...s.messages];
              
              // CRITICAL: Never accept user messages from server - they should only come from sendMessage
              if (message.type === 'user') {
                console.warn('Ignoring user message from server - user messages should only be created locally');
                return s;
              }
              
              // Handle messages with proper deduplication
              if (message.id) {
                const existingIndex = existingMessages.findIndex(m => m.id === message.id);
                if (existingIndex >= 0) {
                  // Update existing message (for streaming updates)
                  // IMPORTANT: Merge content to avoid erasing messages
                  console.log(`[CLIENT] Updating message ${message.id} at index ${existingIndex}, streaming: ${message.streaming}`);
                  const existingMessage = existingMessages[existingIndex];
                  
                  // Special handling for result messages - ensure we don't lose final assistant messages
                  if (message.type === 'result' && (message.subtype === 'error_max_turns' || message.is_error)) {
                    console.log('[CLIENT] Processing error result - ensuring final assistant message is preserved');
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
                  } else if (message.type === 'assistant') {
                    // For assistant messages during streaming, handle array or string content
                    const existingContent = existingMessage.message?.content || '';
                    const newContent = message.message?.content || '';
                    
                    // Convert to string if needed for comparison
                    const existingStr = typeof existingContent === 'string' ? existingContent : JSON.stringify(existingContent);
                    const newStr = typeof newContent === 'string' ? newContent : JSON.stringify(newContent);
                    
                    // Just use the new content directly - Claude Code SDK sends full updates
                    let finalContent = message.message?.content || existingMessage.message?.content;
                    
                    console.log(`[CLIENT] Assistant message update - streaming: ${message.streaming}, content length: ${typeof finalContent === 'string' ? finalContent.length : JSON.stringify(finalContent).length}`);
                    
                    existingMessages[existingIndex] = {
                      ...message,
                      message: {
                        ...message.message,
                        content: finalContent
                      }
                    };
                  } else {
                    existingMessages[existingIndex] = message;
                  }
                } else {
                  // Add new message only if it doesn't exist
                  console.log(`[CLIENT] Adding new message ${message.id} (type: ${message.type}, streaming: ${message.streaming})`);
                  
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
              } else {
                // Messages without ID - check for duplicate content
                const isDuplicate = existingMessages.some(m => 
                  m.type === message.type && 
                  JSON.stringify(m.message) === JSON.stringify(message.message)
                );
                if (!isDuplicate) {
                  console.log(`Adding message without ID (type: ${message.type})`);
                  existingMessages.push(message);
                } else {
                  console.log(`Skipping duplicate message without ID (type: ${message.type})`);
                }
              }
              
              // Update analytics - preserve existing data
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
                lastActivity: new Date()
              };
              
              // Update message counts
              analytics.totalMessages = existingMessages.length;
              analytics.userMessages = existingMessages.filter(m => m.type === 'user').length;
              analytics.assistantMessages = existingMessages.filter(m => m.type === 'assistant').length;
              analytics.toolUses = existingMessages.filter(m => m.type === 'tool_use').length;
              
              // Initialize byModel if it doesn't exist (for backward compatibility)
              if (!analytics.tokens.byModel) {
                analytics.tokens.byModel = {
                  opus: { input: 0, output: 0, total: 0 },
                  sonnet: { input: 0, output: 0, total: 0 }
                };
              }
              
              // Update tokens if result message - accumulate, don't reset
              if (message.type === 'result' && message.usage) {
                // Only add new tokens if this is a new result message
                const isNewResult = !s.messages.find(m => m.id === message.id && m.type === 'result');
                if (isNewResult) {
                  console.log('📊 Result message with usage:', message.usage);
                  if (message.cost) {
                    console.log('💰 Result message with cost:', message.cost);
                  }
                  
                  // Include all input token types
                  const inputTokens = (message.usage.input_tokens || 0) + 
                                      (message.usage.cache_creation_input_tokens || 0) + 
                                      (message.usage.cache_read_input_tokens || 0);
                  const outputTokens = message.usage.output_tokens || 0;
                  
                  // Track ONLY this conversation's tokens (not cumulative)
                  analytics.tokens.input = inputTokens;
                  analytics.tokens.output = outputTokens;
                  analytics.tokens.total = inputTokens + outputTokens;
                  
                  // Determine which model was used (check message.model or use current selectedModel)
                  const modelUsed = message.model || get().selectedModel;
                  const isOpus = modelUsed.includes('opus');
                  const modelKey = isOpus ? 'opus' : 'sonnet';
                  
                  // Update model-specific tokens for THIS conversation only
                  // Reset the other model since only one model is used per conversation
                  if (isOpus) {
                    analytics.tokens.byModel.opus.input = inputTokens;
                    analytics.tokens.byModel.opus.output = outputTokens;
                    analytics.tokens.byModel.opus.total = inputTokens + outputTokens;
                    analytics.tokens.byModel.sonnet = { input: 0, output: 0, total: 0 };
                  } else {
                    analytics.tokens.byModel.sonnet.input = inputTokens;
                    analytics.tokens.byModel.sonnet.output = outputTokens;
                    analytics.tokens.byModel.sonnet.total = inputTokens + outputTokens;
                    analytics.tokens.byModel.opus = { input: 0, output: 0, total: 0 };
                  }
                  
                  // Store cost information for THIS conversation only
                  if (message.total_cost_usd !== undefined) {
                    if (!analytics.cost) {
                      analytics.cost = { total: 0, byModel: { opus: 0, sonnet: 0 } };
                    }
                    // Set cost for this conversation (not cumulative)
                    analytics.cost.total = message.total_cost_usd;
                    analytics.cost.byModel.opus = isOpus ? message.total_cost_usd : 0;
                    analytics.cost.byModel.sonnet = !isOpus ? message.total_cost_usd : 0;
                    console.log('💵 Updated cost:', analytics.cost);
                  }
                }
              }
              
              // Update duration and last activity
              analytics.duration = new Date().getTime() - s.createdAt.getTime();
              analytics.lastActivity = new Date();
              
              return { ...s, messages: existingMessages, updatedAt: new Date(), analytics };
            });
            
            // Update streaming state based on message type
            if (message.type === 'assistant') {
              // Update streaming state based on the message's streaming flag
              if (message.streaming === true) {
                sessions = sessions.map(s => 
                  s.id === sessionId ? { ...s, streaming: true } : s
                );
              } else if (message.streaming === false) {
                // Check if this assistant message contains tool_use blocks
                let hasToolUse = false;
                if (message.message?.content && Array.isArray(message.message.content)) {
                  hasToolUse = message.message.content.some(block => block.type === 'tool_use');
                }
                
                if (hasToolUse) {
                  // Keep streaming active while waiting for tool results
                  console.log('Assistant message has tool_use, keeping streaming state active');
                } else {
                  // Assistant message explicitly marked as not streaming and no tools
                  console.log('Assistant message finished, clearing streaming state');
                  sessions = sessions.map(s => 
                    s.id === sessionId ? { ...s, streaming: false } : s
                  );
                }
              }
              // If streaming is undefined, don't change the state
            } else if (message.type === 'result') {
              // Always clear streaming when we get a result message
              console.log('Received result message, clearing streaming state. Result details:', {
                subtype: message.subtype,
                is_error: message.is_error,
                result: message.result,
                sessionMessages: sessions.find(s => s.id === sessionId)?.messages.length || 0
              });
              sessions = sessions.map(s => 
                s.id === sessionId ? { ...s, streaming: false } : s
              );
              return { sessions };
            } else if (message.type === 'system' && (message.subtype === 'interrupted' || message.subtype === 'error')) {
              // Clear streaming on interruption or error
              console.log('System message received, clearing streaming state');
              sessions = sessions.map(s => 
                s.id === sessionId ? { ...s, streaming: false } : s
              );
              return { sessions };
            } else if (message.type === 'tool_use') {
              // When we get a tool_use message, ensure streaming is active
              // This handles cases where tools are running (especially Task/agent tools)
              console.log('Tool use message received, ensuring streaming state is active');
              sessions = sessions.map(s => 
                s.id === sessionId ? { ...s, streaming: true } : s
              );
            } else if (message.type === 'tool_result') {
              // Keep streaming active for tool results as more tools may follow
              // The streaming state will be cleared by the result message
            }
            
            return { sessions };
          });
      });
      
      // Store cleanup function (could be used later)
      (activeSession as any).cleanup = cleanup;
      
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
  
  setCurrentSession: (sessionId: string) => {
    set({ currentSessionId: sessionId });
  },
  
  sendMessage: async (content: string) => {
    const { currentSessionId } = get();
    if (!currentSessionId) {
      console.error('Cannot send message: No active session');
      return;
    }
    
    // Don't add empty messages
    if (!content || (typeof content === 'string' && !content.trim())) {
      console.warn('Cannot send empty message');
      return;
    }
    
    // Add user message immediately with unique ID
    const userMessage = {
      id: `user-${Date.now()}-${Math.random()}`,
      type: 'user',
      message: { content },
      timestamp: Date.now()
    };
    
    set(state => ({
      sessions: state.sessions.map(s => 
        s.id === currentSessionId 
          ? { ...s, messages: [...s.messages, userMessage], streaming: true }
          : s
      )
    }));
    
    try {
      // Send message to Claude Code Server (REAL SDK) with selected model
      const { selectedModel } = get();
      await claudeCodeClient.sendMessage(currentSessionId, content, selectedModel);
      
      // Messages are handled by the onMessage listener
      // The streaming state will be cleared when we receive the result message
    } catch (error) {
      console.error('Error sending message:', error);
      
      // Add error message to chat
      set(state => ({
        sessions: state.sessions.map(s => 
          s.id === currentSessionId 
            ? { 
                ...s, 
                messages: [...s.messages, {
                  type: 'system',
                  subtype: 'error',
                  message: `Failed to send message: ${error.message}`,
                  timestamp: Date.now()
                }]
              }
            : s
        )
      }));
    }
  },
  
  resumeSession: async (sessionId: string) => {
    const session = get().sessions.find(s => s.id === sessionId);
    if (!session) {
      // Try to load from server if not in local state
      await get().loadPersistedSession(sessionId);
      return;
    }
    
    // Update current session
    set({ currentSessionId: sessionId, persistedSessionId: sessionId });
    
    // Notify server of directory change if needed
    if (session.workingDirectory) {
      await claudeCodeClient.setWorkingDirectory(sessionId, session.workingDirectory);
    }
  },
  
  loadSessionHistory: async (sessionId: string) => {
    set({ isLoadingHistory: true });
    try {
      const history = await claudeCodeClient.getSessionHistory(sessionId);
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
      const sessions = await claudeCodeClient.listSessions();
      set({ availableSessions: sessions });
    } catch (error) {
      console.error('Failed to list sessions:', error);
    }
  },
  
  loadPersistedSession: async (sessionId: string) => {
    set({ isLoadingHistory: true });
    try {
      // Create/resume session with existing ID
      const result = await claudeCodeClient.createSession('resumed session', '/', {
        sessionId
      });
      
      const messages = result.messages || [];
      const workingDirectory = result.workingDirectory || '/';
      
      const session: Session = {
        id: sessionId,
        name: `resumed session`,
        status: 'active' as const,
        messages,
        workingDirectory,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      // Set up message listener
      const cleanup = claudeCodeClient.onMessage(sessionId, (message) => {
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
            } else {
              const isDuplicate = existingMessages.some(m => 
                m.type === message.type && 
                JSON.stringify(m.message) === JSON.stringify(message.message)
              );
              if (!isDuplicate) {
                existingMessages.push(message);
              }
            }
            
            return { ...s, messages: existingMessages, updatedAt: new Date() };
          });
          
          if (message.type === 'assistant' && message.streaming) {
            sessions = sessions.map(s => 
              s.id === sessionId ? { ...s, streaming: true } : s
            );
          } else if (message.type === 'result' || 
                     (message.type === 'system' && (message.subtype === 'interrupted' || message.subtype === 'error'))) {
            sessions = sessions.map(s => 
              s.id === sessionId ? { ...s, streaming: false } : s
            );
          }
          
          return { sessions };
        });
      });
      
      (session as any).cleanup = cleanup;
      
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
    set(state => {
      const newSessions = state.sessions.filter(s => s.id !== sessionId);
      let newCurrentId = state.currentSessionId;
      
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
      
      return {
        sessions: newSessions,
        currentSessionId: newCurrentId
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
  },
  
  reorderSessions: (fromIndex: number, toIndex: number) => {
    set(state => {
      const newSessions = [...state.sessions];
      const [movedSession] = newSessions.splice(fromIndex, 1);
      newSessions.splice(toIndex, 0, movedSession);
      return { sessions: newSessions };
    });
  },
  
  interruptSession: async () => {
    const { currentSessionId } = get();
    if (currentSessionId) {
      try {
        await claudeCodeClient.interrupt(currentSessionId);
        set(state => ({
          sessions: state.sessions.map(s => 
            s.id === currentSessionId ? { ...s, streaming: false } : s
          ),
          streamingMessage: ''
        }));
      } catch (error) {
        console.error('Failed to interrupt session:', error);
        // Still stop streaming indicator even if interrupt fails
        set(state => ({
          sessions: state.sessions.map(s => 
            s.id === currentSessionId ? { ...s, streaming: false } : s
          ),
          streamingMessage: ''
        }));
      }
    }
  },
  
  clearContext: (sessionId: string) => {
    // Clear local messages and reset analytics
    set(state => ({
      sessions: state.sessions.map(s => 
        s.id === sessionId 
          ? { 
              ...s, 
              messages: [
                // Keep only the initial system message
                ...s.messages.filter(m => m.type === 'system' && m.subtype === 'init').slice(0, 1)
              ],
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
                lastActivity: new Date()
              },
              updatedAt: new Date()
            }
          : s
      )
    }));
    
    // Notify server to clear the Claude session - use the imported singleton
    claudeCodeClient.clearSession(sessionId).catch(error => {
      console.error('Failed to clear server session:', error);
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
  
  toggleModel: () => {
    const currentModel = get().selectedModel;
    const newModel = currentModel.includes('opus') ? 
      'claude-sonnet-4-20250514' : 
      'claude-opus-4-1-20250805';
    set({ selectedModel: newModel });
    console.log(`🔄 Model toggled to: ${newModel.includes('opus') ? 'Opus 4.1' : 'Sonnet 4.0'}`);
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
  }
}),
    {
      name: 'claude-code-storage',
      partialize: (state) => ({
        // Only persist model selection - sessions should be ephemeral
        selectedModel: state.selectedModel
        // Do NOT persist sessionId - sessions should not survive app restarts
      })
    }
  )
);