const { contextBridge, ipcRenderer } = require('electron');

// Simple logging
console.log('==========================================');
console.log('PRELOAD SCRIPT LOADED!');
console.log('==========================================');

try {
  contextBridge.exposeInMainWorld('electronAPI', {
    window: {
      close: () => {
        console.log('Preload: Sending window-close');
        ipcRenderer.send('window-close');
      },
      minimize: () => {
        console.log('Preload: Sending window-minimize');
        ipcRenderer.send('window-minimize');
      },
      maximize: () => {
        console.log('Preload: Sending window-maximize');
        ipcRenderer.send('window-maximize');
      },
      toggleDevTools: () => {
        console.log('Preload: Sending toggle-dev-tools');
        ipcRenderer.send('toggle-dev-tools');
      }
    },
    test: () => 'PRELOAD WORKS!'
  });
  
  console.log('electronAPI exposed successfully!');
} catch (error) {
  console.error('Failed to expose electronAPI:', error);
}

// Test that it's available
setTimeout(() => {
  console.log('Testing if electronAPI is available in window...');
}, 1000);