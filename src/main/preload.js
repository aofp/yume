const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process
// to communicate with the main process
contextBridge.exposeInMainWorld('electronAPI', {
  // Claude Code SDK operations (runs in main process)
  claudeCode: {
    createSession: (name, options) => 
      ipcRenderer.invoke('claudeCode:createSession', name, options),
    sendMessage: (sessionId, content) => 
      ipcRenderer.invoke('claudeCode:sendMessage', sessionId, content),
    getSession: (sessionId) => 
      ipcRenderer.invoke('claudeCode:getSession', sessionId),
    getAllSessions: () => 
      ipcRenderer.invoke('claudeCode:getAllSessions'),
    pauseSession: (sessionId) => 
      ipcRenderer.invoke('claudeCode:pauseSession', sessionId),
    resumeSession: (sessionId) => 
      ipcRenderer.invoke('claudeCode:resumeSession', sessionId),
    deleteSession: (sessionId) => 
      ipcRenderer.invoke('claudeCode:deleteSession', sessionId),
    onMessage: (sessionId, callback) => {
      const channel = `claudeCode:message:${sessionId}`;
      ipcRenderer.on(channel, (event, message) => callback(message));
      return () => ipcRenderer.removeAllListeners(channel);
    }
  },
  
  // Claude SDK operations
  claude: {
    query: (prompt, options) => 
      ipcRenderer.invoke('claude:query', prompt, options),
    
    session: {
      create: (options) => 
        ipcRenderer.invoke('claude:session:create', options),
      resume: (sessionId) => 
        ipcRenderer.invoke('claude:session:resume', sessionId),
      list: () => 
        ipcRenderer.invoke('claude:session:list'),
      pause: (sessionId) => 
        ipcRenderer.invoke('claude:session:pause', sessionId),
      delete: (sessionId) => 
        ipcRenderer.invoke('claude:session:delete', sessionId),
    },
  },

  // Settings management
  settings: {
    get: (key) => 
      ipcRenderer.invoke('settings:get', key),
    set: (key, value) => 
      ipcRenderer.invoke('settings:set', key, value),
    getAll: () => 
      ipcRenderer.invoke('settings:getAll'),
  },

  // File operations
  file: {
    read: (filepath) => 
      ipcRenderer.invoke('file:read', filepath),
    write: (filepath, content) => 
      ipcRenderer.invoke('file:write', filepath, content),
    select: (options) => 
      ipcRenderer.invoke('file:select', options),
  },

  // Tool permissions
  permission: {
    request: (tool, params) => 
      ipcRenderer.invoke('permission:request', tool, params),
    getAll: () => 
      ipcRenderer.invoke('permission:getAll'),
    set: (tool, permission) => 
      ipcRenderer.invoke('permission:set', tool, permission),
  },

  // System operations
  system: {
    openExternal: (url) => 
      ipcRenderer.invoke('system:openExternal', url),
    getVersion: () => 
      ipcRenderer.invoke('system:getVersion'),
    checkForUpdates: () => 
      ipcRenderer.invoke('system:checkForUpdates'),
  },

  // Folder operations
  folder: {
    select: () => ipcRenderer.invoke('select-folder'),
    getCurrent: () => ipcRenderer.invoke('get-working-directory'),
  },
  
  // Event listeners
  on: (channel, callback) => {
    const validChannels = [
      'fullscreen-status',
      'session-update',
      'permission-request',
      'tool-execution',
      'message-stream',
      'folder-changed',
      'new-session',
    ];
    
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => callback(...args));
    }
  },

  removeListener: (channel, callback) => {
    ipcRenderer.removeListener(channel, callback);
  },
});