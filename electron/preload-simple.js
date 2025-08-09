const { ipcRenderer } = require('electron');

console.log('=== PRELOAD SCRIPT LOADED (Simple) ===');

// Since contextIsolation is false, we can directly expose to window
window.electronAPI = {
  // Folder operations
  folder: {
    select: () => ipcRenderer.invoke('select-folder'),
    getCurrent: () => ipcRenderer.invoke('get-working-directory'),
  },
  
  // Server operations
  getServerPort: () => ipcRenderer.invoke('get-server-port'),
  
  // File system operations
  isDirectory: (path) => ipcRenderer.invoke('is-directory', path),
  
  // Window operations
  window: {
    minimize: () => {
      console.log('Preload: minimize called');
      ipcRenderer.send('window-minimize');
    },
    maximize: () => {
      console.log('Preload: maximize called');
      ipcRenderer.send('window-maximize');
    },
    close: () => {
      console.log('Preload: close called');
      ipcRenderer.send('window-close');
    },
    toggleDevTools: () => {
      console.log('Preload: toggleDevTools called');
      ipcRenderer.send('toggle-dev-tools');
    },
  },
  
  // Listen to events from main process
  on: (channel, callback) => {
    const validChannels = ['folder-changed', 'new-session', 'initial-directory', 'server-port-changed', 'show-help-modal'];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => callback(...args));
    }
  },
  
  // Remove specific listener
  off: (channel, callback) => {
    const validChannels = ['folder-changed', 'new-session', 'initial-directory', 'server-port-changed', 'show-help-modal'];
    if (validChannels.includes(channel)) {
      ipcRenderer.removeListener(channel, callback);
    }
  },
  
  // Remove all listeners
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
};