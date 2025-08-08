const { ipcRenderer } = require('electron');

console.log('=== PRELOAD DEBUG SCRIPT ===');

// Expose electronAPI for compatibility
window.electronAPI = {
  folder: {
    select: () => {
      console.log('DEBUG: Invoking select-folder');
      return ipcRenderer.invoke('select-folder');
    },
    getCurrent: () => {
      console.log('DEBUG: Invoking get-working-directory');
      return ipcRenderer.invoke('get-working-directory');
    }
  },
  window: {
    close: () => {
      console.log('DEBUG: Sending window-close');
      ipcRenderer.send('window-close');
    },
    minimize: () => {
      console.log('DEBUG: Sending window-minimize');
      ipcRenderer.send('window-minimize');
    },
    maximize: () => {
      console.log('DEBUG: Sending window-maximize');
      ipcRenderer.send('window-maximize');
    },
    toggleDevTools: () => {
      console.log('DEBUG: Sending toggle-dev-tools');
      ipcRenderer.send('toggle-dev-tools');
    }
  }
};

// Also keep debug functions for direct testing
window.debugClose = () => {
  console.log('DEBUG: Sending close IPC');
  ipcRenderer.send('window-close');
};

window.debugMinimize = () => {
  console.log('DEBUG: Sending minimize IPC');
  ipcRenderer.send('window-minimize');
};

window.debugMaximize = () => {
  console.log('DEBUG: Sending maximize IPC');
  ipcRenderer.send('window-maximize');
};

window.debugDevTools = () => {
  console.log('DEBUG: Sending toggle-dev-tools IPC');
  ipcRenderer.send('toggle-dev-tools');
};

console.log('Debug functions added to window:');
console.log('- window.debugClose()');
console.log('- window.debugMinimize()');
console.log('- window.debugMaximize()');
console.log('- window.debugDevTools()');

// Log what's available
console.log('electronAPI exposed:', !!window.electronAPI);
console.log('electronAPI.folder:', !!window.electronAPI?.folder);
console.log('electronAPI.window:', !!window.electronAPI?.window);

// Test in browser console
window.testAPI = () => {
  console.log('electronAPI:', window.electronAPI);
  if (window.electronAPI) {
    console.log('folder methods:', Object.keys(window.electronAPI.folder || {}));
    console.log('window methods:', Object.keys(window.electronAPI.window || {}));
  }
};