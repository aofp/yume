// API abstraction layer that works in both browser and Electron contexts
import { claudeCodeSDK } from './claudeCodeSDKComplete';

interface ElectronAPI {
  folder?: {
    select: () => Promise<string | null>;
    getCurrent: () => Promise<string>;
  };
  claude: {
    query: (prompt: string, options?: any) => Promise<any>;
    session: {
      create: (options?: any) => Promise<any>;
      resume: (sessionId: string) => Promise<any>;
      list: () => Promise<any>;
      pause: (sessionId: string) => Promise<any>;
      delete: (sessionId: string) => Promise<any>;
    };
  };
  settings: {
    get: (key: string) => Promise<any>;
    set: (key: string, value: any) => Promise<any>;
    getAll: () => Promise<any>;
  };
  file: {
    read: (filepath: string) => Promise<any>;
    write: (filepath: string, content: string) => Promise<any>;
    select: (options?: any) => Promise<any>;
  };
  permission: {
    request: (tool: string, params: any) => Promise<any>;
    getAll: () => Promise<any>;
    set: (tool: string, permission: string) => Promise<any>;
  };
  system: {
    openExternal: (url: string) => Promise<any>;
    getVersion: () => Promise<any>;
    checkForUpdates: () => Promise<any>;
  };
  on?: (channel: string, callback: Function) => void;
  removeListener?: (channel: string, callback: Function) => void;
}

// Mock API for browser development
const mockAPI: ElectronAPI = {
  folder: {
    select: async () => {
      return prompt('Enter folder path:');
    },
    getCurrent: async () => {
      return process.cwd ? process.cwd() : '/';
    },
  },
  claude: {
    query: async (prompt: string, options?: any) => {
      // Use Claude Code SDK for real responses
      try {
        const result = await claudeCodeSDK.runQuery(prompt, options);
        return { 
          success: result.success, 
          data: result.result
        };
      } catch (error: any) {
        // Fallback to mock if Claude Code not available
        console.warn('Claude Code SDK not available, using mock:', error);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return { 
          success: true, 
          data: `Mock response to: "${prompt}"\n\nInstall Claude Code CLI to get real responses:\nnpm install -g @anthropic-ai/claude-code` 
        };
      }
    },
    session: {
      create: async (options?: any) => {
        try {
          const sessionId = await claudeCodeSDK.createSession(
            options?.name || 'New Session',
            options
          );
          return { 
            success: true, 
            sessionId 
          };
        } catch (error) {
          console.error('Failed to create session:', error);
          return { 
            success: true, 
            sessionId: `mock-session-${Date.now()}` 
          };
        }
      },
      resume: async (sessionId: string) => {
        const success = await claudeCodeSDK.resumeSession(sessionId);
        return { success, session: { id: sessionId } };
      },
      list: async () => {
        const sessions = claudeCodeSDK.getAllSessions();
        return { success: true, sessions };
      },
      pause: async (sessionId: string) => {
        const success = claudeCodeSDK.pauseSession(sessionId);
        return { success };
      },
      delete: async (sessionId: string) => {
        const success = claudeCodeSDK.deleteSession(sessionId);
        return { success };
      },
    },
  },
  settings: {
    get: async (key: string) => {
      const settings = JSON.parse(localStorage.getItem('settings') || '{}');
      return { success: true, value: settings[key] };
    },
    set: async (key: string, value: any) => {
      const settings = JSON.parse(localStorage.getItem('settings') || '{}');
      settings[key] = value;
      localStorage.setItem('settings', JSON.stringify(settings));
      return { success: true };
    },
    getAll: async () => {
      const settings = JSON.parse(localStorage.getItem('settings') || '{}');
      return { success: true, settings };
    },
  },
  file: {
    read: async (filepath: string) => {
      return { success: true, content: '// Mock file content' };
    },
    write: async (filepath: string, content: string) => {
      return { success: true };
    },
    select: async (options?: any) => {
      return { success: true, path: '/mock/path/file.txt' };
    },
  },
  permission: {
    request: async (tool: string, params: any) => {
      return { success: true, granted: true };
    },
    getAll: async () => {
      return { success: true, permissions: {} };
    },
    set: async (tool: string, permission: string) => {
      return { success: true };
    },
  },
  system: {
    openExternal: async (url: string) => {
      window.open(url, '_blank');
      return { success: true };
    },
    getVersion: async () => {
      return { success: true, version: '1.0.0' };
    },
    checkForUpdates: async () => {
      return { success: true, updateAvailable: false };
    },
  },
  on: (channel: string, callback: Function) => {
    // Mock event listener
  },
  removeListener: (channel: string, callback: Function) => {
    // Mock event listener removal
  },
};

// Export the API - use Electron API if available, otherwise use mock
export const api: ElectronAPI = (window as any).electronAPI || mockAPI;

// Helper to check if we're running in Electron
export const isElectron = () => !!(window as any).electronAPI;