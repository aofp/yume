import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { api } from '../services/api';

export interface Session {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  messages: Message[];
  status: 'active' | 'paused' | 'completed';
  workingDirectory?: string;
  model?: string;
  tokenCount: number;
  cost: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  tools?: ToolCall[];
  streaming?: boolean;
}

export interface ToolCall {
  tool: string;
  parameters: any;
  result?: any;
  status: 'pending' | 'running' | 'completed' | 'failed';
}

export interface Todo {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  createdAt: Date;
  completedAt?: Date;
}

export interface PermissionRequest {
  id: string;
  tool: string;
  parameters: any;
  timestamp: Date;
}

interface StoreState {
  // Sessions
  sessions: Session[];
  currentSessionId: string | null;
  currentSession: Session | null;
  
  // Messages
  streamingMessage: Message | null;
  
  // Todos
  todos: Todo[];
  
  // Permissions
  permissions: Record<string, 'allow' | 'deny' | 'ask'>;
  permissionRequest: PermissionRequest | null;
  
  // UI State
  sidebarExpanded: boolean;
  sidePanelOpen: boolean;
  activeView: string;
  theme: 'dark';
  
  // Settings
  settings: {
    model: string;
    temperature: number;
    maxTokens: number;
    streamResponses: boolean;
    autoSave: boolean;
    soundNotifications: boolean;
  };
  
  // Actions
  createSession: (name?: string) => Promise<void>;
  resumeSession: (sessionId: string) => void;
  pauseSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;
  
  sendMessage: (content: string) => Promise<void>;
  cancelGeneration: () => void;
  
  addTodo: (content: string) => void;
  updateTodoStatus: (id: string, status: Todo['status']) => void;
  deleteTodo: (id: string) => void;
  
  setPermission: (tool: string, permission: 'allow' | 'deny' | 'ask') => void;
  handlePermissionResponse: (response: 'allow' | 'deny' | 'always') => void;
  
  setSidebarExpanded: (expanded: boolean) => void;
  setSidePanelOpen: (open: boolean) => void;
  setActiveView: (view: string) => void;
  
  updateSettings: (settings: Partial<StoreState['settings']>) => void;
}

export const useStore = create<StoreState>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        sessions: [],
        currentSessionId: null,
        currentSession: null,
        streamingMessage: null,
        todos: [],
        permissions: {},
        permissionRequest: null,
        sidebarExpanded: false,
        sidePanelOpen: true,
        activeView: 'chat',
        theme: 'dark',
        settings: {
          model: 'claude-3-5-sonnet',
          temperature: 0.7,
          maxTokens: 4096,
          streamResponses: true,
          autoSave: true,
          soundNotifications: false,
        },
        
        // Session actions
        createSession: async (name?: string) => {
          const hexId = Math.random().toString(16).substr(2, 6);
          const sessionName = name || `session ${hexId}`;
          const response = await api.claude.session.create({ name: sessionName });
          if (response.success) {
            const newSession: Session = {
              id: response.sessionId,
              name: sessionName,
              createdAt: new Date(),
              updatedAt: new Date(),
              messages: [],
              status: 'active',
              tokenCount: 0,
              cost: 0,
            };
            
            set((state) => ({
              sessions: [...state.sessions, newSession],
              currentSessionId: newSession.id,
              currentSession: newSession,
            }));
          }
        },
        
        resumeSession: (sessionId: string) => {
          const session = get().sessions.find(s => s.id === sessionId);
          if (session) {
            set({
              currentSessionId: sessionId,
              currentSession: session,
            });
          }
        },
        
        pauseSession: (sessionId: string) => {
          set((state) => ({
            sessions: state.sessions.map(s => 
              s.id === sessionId ? { ...s, status: 'paused' as const } : s
            ),
          }));
        },
        
        deleteSession: (sessionId: string) => {
          set((state) => ({
            sessions: state.sessions.filter(s => s.id !== sessionId),
            currentSessionId: state.currentSessionId === sessionId ? null : state.currentSessionId,
            currentSession: state.currentSessionId === sessionId ? null : state.currentSession,
          }));
        },
        
        // Message actions
        sendMessage: async (content: string) => {
          const { currentSession, settings } = get();
          if (!currentSession) return;
          
          const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content,
            timestamp: new Date(),
          };
          
          set((state) => ({
            currentSession: state.currentSession ? {
              ...state.currentSession,
              messages: [...state.currentSession.messages, userMessage],
            } : null,
          }));
          
          // Create streaming message
          const assistantMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: '',
            timestamp: new Date(),
            streaming: true,
          };
          
          set({ streamingMessage: assistantMessage });
          
          // Call Claude API
          const response = await api.claude.query(content, {
            model: settings.model,
            temperature: settings.temperature,
            maxTokens: settings.maxTokens,
          });
          
          // Update with final message
          set((state) => ({
            streamingMessage: null,
            currentSession: state.currentSession ? {
              ...state.currentSession,
              messages: [...state.currentSession.messages, {
                ...assistantMessage,
                content: response.data,
                streaming: false,
              }],
            } : null,
          }));
        },
        
        cancelGeneration: () => {
          set({ streamingMessage: null });
        },
        
        // Todo actions
        addTodo: (content: string) => {
          const newTodo: Todo = {
            id: Date.now().toString(),
            content,
            status: 'pending',
            createdAt: new Date(),
          };
          
          set((state) => ({
            todos: [...state.todos, newTodo],
          }));
        },
        
        updateTodoStatus: (id: string, status: Todo['status']) => {
          set((state) => ({
            todos: state.todos.map(todo => 
              todo.id === id 
                ? { 
                    ...todo, 
                    status,
                    completedAt: status === 'completed' ? new Date() : undefined,
                  }
                : todo
            ),
          }));
        },
        
        deleteTodo: (id: string) => {
          set((state) => ({
            todos: state.todos.filter(todo => todo.id !== id),
          }));
        },
        
        // Permission actions
        setPermission: (tool: string, permission: 'allow' | 'deny' | 'ask') => {
          set((state) => ({
            permissions: {
              ...state.permissions,
              [tool]: permission,
            },
          }));
        },
        
        handlePermissionResponse: (response: 'allow' | 'deny' | 'always') => {
          const { permissionRequest } = get();
          if (!permissionRequest) return;
          
          if (response === 'always') {
            set((state) => ({
              permissions: {
                ...state.permissions,
                [permissionRequest.tool]: 'allow',
              },
              permissionRequest: null,
            }));
          } else {
            set({ permissionRequest: null });
          }
        },
        
        // UI actions
        setSidebarExpanded: (expanded: boolean) => {
          set({ sidebarExpanded: expanded });
        },
        
        setSidePanelOpen: (open: boolean) => {
          set({ sidePanelOpen: open });
        },
        
        setActiveView: (view: string) => {
          set({ activeView: view });
        },
        
        // Settings actions
        updateSettings: (settings: Partial<StoreState['settings']>) => {
          set((state) => ({
            settings: {
              ...state.settings,
              ...settings,
            },
          }));
        },
      }),
      {
        name: 'claude-studio-store',
        partialize: (state) => ({
          sessions: state.sessions,
          permissions: state.permissions,
          settings: state.settings,
        }),
      }
    )
  )
);