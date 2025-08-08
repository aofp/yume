import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process
// to communicate with the main process
contextBridge.exposeInMainWorld('electronAPI', {
  // Claude SDK operations
  claude: {
    query: (prompt: string, options?: any) => 
      ipcRenderer.invoke('claude:query', prompt, options),
    
    session: {
      create: (options?: any) => 
        ipcRenderer.invoke('claude:session:create', options),
      resume: (sessionId: string) => 
        ipcRenderer.invoke('claude:session:resume', sessionId),
      list: () => 
        ipcRenderer.invoke('claude:session:list'),
      pause: (sessionId: string) => 
        ipcRenderer.invoke('claude:session:pause', sessionId),
      delete: (sessionId: string) => 
        ipcRenderer.invoke('claude:session:delete', sessionId),
    },
  },

  // Settings management
  settings: {
    get: (key: string) => 
      ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: any) => 
      ipcRenderer.invoke('settings:set', key, value),
    getAll: () => 
      ipcRenderer.invoke('settings:getAll'),
  },

  // File operations
  file: {
    read: (filepath: string) => 
      ipcRenderer.invoke('file:read', filepath),
    write: (filepath: string, content: string) => 
      ipcRenderer.invoke('file:write', filepath, content),
    select: (options?: any) => 
      ipcRenderer.invoke('file:select', options),
  },

  // Tool permissions
  permission: {
    request: (tool: string, params: any) => 
      ipcRenderer.invoke('permission:request', tool, params),
    getAll: () => 
      ipcRenderer.invoke('permission:getAll'),
    set: (tool: string, permission: string) => 
      ipcRenderer.invoke('permission:set', tool, permission),
  },

  // System operations
  system: {
    openExternal: (url: string) => 
      ipcRenderer.invoke('system:openExternal', url),
    getVersion: () => 
      ipcRenderer.invoke('system:getVersion'),
    checkForUpdates: () => 
      ipcRenderer.invoke('system:checkForUpdates'),
  },

  // Event listeners
  on: (channel: string, callback: Function) => {
    const validChannels = [
      'fullscreen-status',
      'session-update',
      'permission-request',
      'tool-execution',
      'message-stream',
    ];
    
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args));
    }
  },

  removeListener: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.removeListener(channel, callback as any);
  },
});

// Type definitions for TypeScript
export interface ElectronAPI {
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
  on: (channel: string, callback: Function) => void;
  removeListener: (channel: string, callback: Function) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}