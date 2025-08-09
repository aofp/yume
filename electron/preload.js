const { contextBridge, ipcRenderer } = require('electron');

console.log('=== PRELOAD SCRIPT LOADED ===');

// Test immediate IPC
ipcRenderer.send('preload-test', 'Preload script initialized');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Folder operations
  folder: {
    select: () => ipcRenderer.invoke('select-folder'),
    getCurrent: () => ipcRenderer.invoke('get-working-directory'),
  },
  
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
  
  // Zoom operations
  zoom: {
    in: () => ipcRenderer.invoke('zoom-in'),
    out: () => ipcRenderer.invoke('zoom-out'),
    reset: () => ipcRenderer.invoke('zoom-reset'),
    getLevel: () => ipcRenderer.invoke('get-zoom-level'),
  },
  
  // Listen to events from main process
  on: (channel, callback) => {
    const validChannels = ['folder-changed', 'new-session', 'initial-directory'];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => callback(...args));
    }
  },
  
  // Remove listeners
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
});