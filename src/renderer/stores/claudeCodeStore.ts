/**
 * Zustand store specifically for Claude Code SDK integration
 * Handles sessions, streaming messages, and all SDK features
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { claudeCodeClient } from '../services/claudeCodeClient';

export type SDKMessage = any; // Type from Claude Code SDK

export interface Session {
  id: string;
  name: string;
  status: 'pending' | 'active' | 'paused' | 'completed' | 'error';
  messages: SDKMessage[];
  workingDirectory?: string;
  createdAt: Date;
  updatedAt: Date;
  claudeSessionId?: string; // Track the Claude SDK session ID
}

interface ClaudeCodeStore {
  // Sessions
  sessions: Session[];
  currentSessionId: string | null;
  persistedSessionId: string | null; // Track the sessionId for persistence
  
  // Model
  selectedModel: string;
  
  // Streaming
  isStreaming: boolean;
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
  interruptSession: () => Promise<void>;
  clearContext: (sessionId: string) => void;
  
  // Session persistence
  loadSessionHistory: (sessionId: string) => Promise<void>;
  listAvailableSessions: () => Promise<void>;
  loadPersistedSession: (sessionId: string) => Promise<void>;
  
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
  selectedModel: 'opus',
  isStreaming: false,
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
        updatedAt: new Date()
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
            const sessions = state.sessions.map(s => {
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
                  console.log(`[CLIENT] Updating message ${message.id} at index ${existingIndex}, streaming: ${message.streaming}`);
                  existingMessages[existingIndex] = message;
                } else {
                  // Add new message only if it doesn't exist
                  console.log(`[CLIENT] Adding new message ${message.id} (type: ${message.type}, streaming: ${message.streaming})`);
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
              
              return { ...s, messages: existingMessages, updatedAt: new Date() };
            });
            
            // Update streaming state based on message type
            if (message.type === 'assistant') {
              // Update streaming state based on the message's streaming flag
              if (message.streaming === true) {
                return { sessions, isStreaming: true };
              } else if (message.streaming === false) {
                // Assistant message explicitly marked as not streaming
                console.log('Assistant message finished, clearing streaming state');
                return { sessions, isStreaming: false };
              }
              // If streaming is undefined, don't change the state
            } else if (message.type === 'result') {
              // Always clear streaming when we get a result message
              console.log('Received result message, clearing streaming state');
              return { sessions, isStreaming: false };
            } else if (message.type === 'system' && (message.subtype === 'interrupted' || message.subtype === 'error')) {
              // Clear streaming on interruption or error
              console.log('System message received, clearing streaming state');
              return { sessions, isStreaming: false };
            } else if (message.type === 'tool_use' || message.type === 'tool_result') {
              // Don't change streaming state for tool messages
              // The streaming state should be controlled by assistant messages
            }
            
            return { sessions };
          });
      });
      
      // Store cleanup function (could be used later)
      (session as any).cleanup = cleanup;
      
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
          ? { ...s, messages: [...s.messages, userMessage] }
          : s
      ),
      isStreaming: true
    }));
    
    try {
      // Send message to Claude Code Server (REAL SDK)
      await claudeCodeClient.sendMessage(currentSessionId, content);
      
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
        ),
        isStreaming: false
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
          const sessions = state.sessions.map(s => {
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
            return { sessions, isStreaming: true };
          } else if (message.type === 'result' || 
                     (message.type === 'system' && (message.subtype === 'interrupted' || message.subtype === 'error'))) {
            return { sessions, isStreaming: false };
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
      isStreaming: false,
      streamingMessage: ''
    });
  },
  
  interruptSession: async () => {
    const { currentSessionId } = get();
    if (currentSessionId) {
      try {
        await claudeCodeClient.interrupt(currentSessionId);
        set({ isStreaming: false, streamingMessage: '' });
      } catch (error) {
        console.error('Failed to interrupt session:', error);
        // Still stop streaming indicator even if interrupt fails
        set({ isStreaming: false, streamingMessage: '' });
      }
    }
  },
  
  clearContext: (sessionId: string) => {
    set(state => ({
      sessions: state.sessions.map(s => 
        s.id === sessionId 
          ? { 
              ...s, 
              messages: [
                // Keep only the initial system message
                ...s.messages.filter(m => m.type === 'system' && m.subtype === 'init').slice(0, 1)
              ],
              updatedAt: new Date()
            }
          : s
      )
    }));
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