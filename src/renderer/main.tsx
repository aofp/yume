import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.minimal';
import { useClaudeCodeStore } from './stores/claudeCodeStore';
import './App.minimal.css';

console.log('main.tsx loading...');

// Add platform class to body for platform-specific styling
const platform = navigator.platform.toLowerCase();
if (platform.includes('mac')) {
  document.body.classList.add('platform-darwin');
} else if (platform.includes('win')) {
  document.body.classList.add('platform-win32');
} else if (platform.includes('linux')) {
  document.body.classList.add('platform-linux');
}

// Clear all sessions on startup
const store = useClaudeCodeStore.getState();
store.deleteAllSessions();
console.log('Cleared all sessions on startup');

const rootElement = document.getElementById('root');
console.log('Root element:', rootElement);

if (rootElement) {
  console.log('Creating React root...');
  ReactDOM.createRoot(rootElement).render(
    <App />
  );
  console.log('React app rendered');
} else {
  console.error('Root element not found!');
}

// Clean up sessions when window is about to close
window.addEventListener('beforeunload', () => {
  console.log('Window closing, clearing all sessions...');
  const store = useClaudeCodeStore.getState();
  store.deleteAllSessions();
});

// Listen for app quit event from Electron main process
if (window.electronAPI && window.electronAPI.ipcRenderer) {
  window.electronAPI.ipcRenderer.on('app-before-quit', () => {
    console.log('App quitting, clearing all sessions...');
    const store = useClaudeCodeStore.getState();
    store.deleteAllSessions();
  });
}

// Add keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Don't intercept keyboard shortcuts when typing in input fields
  const target = e.target as HTMLElement;
  const isInputField = target.tagName === 'INPUT' || 
                       target.tagName === 'TEXTAREA' || 
                       target.contentEditable === 'true';
  
  if (isInputField) {
    return;
  }
  
  // Escape - Stop streaming response
  if (e.key === 'Escape') {
    const { sessions, currentSessionId, interruptSession } = useClaudeCodeStore.getState();
    const currentSession = sessions.find(s => s.id === currentSessionId);
    if (currentSession?.streaming) {
      e.preventDefault();
      console.log('Keyboard shortcut: Interrupting stream');
      interruptSession();
    }
  }
  
  // Cmd/Ctrl + T - New tab (session)
  if ((e.metaKey || e.ctrlKey) && e.key === 't') {
    e.preventDefault();
    console.log('Keyboard shortcut: Creating new tab');
    const { createSession } = useClaudeCodeStore.getState();
    // Open folder selector if in Electron, otherwise use root
    if (window.electronAPI?.folder?.select) {
      window.electronAPI.folder.select().then((folder: string) => {
        if (folder) {
          createSession(undefined, folder);
        }
      });
    } else {
      createSession(undefined, '/');
    }
  }
  
  // Cmd/Ctrl + W - Close current tab
  if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
    e.preventDefault();
    console.log('Keyboard shortcut: Closing current tab');
    const { currentSessionId, deleteSession } = useClaudeCodeStore.getState();
    if (currentSessionId) {
      deleteSession(currentSessionId);
    }
  }
  
  // Cmd/Ctrl + Q - Quit application
  if ((e.metaKey || e.ctrlKey) && e.key === 'q') {
    e.preventDefault();
    console.log('Keyboard shortcut: Quitting application');
    if (window.electronAPI?.window?.close) {
      window.electronAPI.window.close();
    } else {
      // For web version, just close the window
      window.close();
    }
  }
  
  // Ctrl + Tab - Next tab
  if (e.ctrlKey && e.key === 'Tab' && !e.shiftKey) {
    e.preventDefault();
    console.log('Keyboard shortcut: Next tab');
    const { sessions, currentSessionId, setCurrentSession } = useClaudeCodeStore.getState();
    if (sessions.length > 1) {
      const currentIndex = sessions.findIndex(s => s.id === currentSessionId);
      const nextIndex = (currentIndex + 1) % sessions.length;
      setCurrentSession(sessions[nextIndex].id);
    }
  }
  
  // Ctrl + Shift + Tab - Previous tab
  if (e.ctrlKey && e.shiftKey && e.key === 'Tab') {
    e.preventDefault();
    console.log('Keyboard shortcut: Previous tab');
    const { sessions, currentSessionId, setCurrentSession } = useClaudeCodeStore.getState();
    if (sessions.length > 1) {
      const currentIndex = sessions.findIndex(s => s.id === currentSessionId);
      const prevIndex = currentIndex === 0 ? sessions.length - 1 : currentIndex - 1;
      setCurrentSession(sessions[prevIndex].id);
    }
  }
  
  // Cmd/Ctrl + 1-9 - Switch to specific tab
  if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '9') {
    e.preventDefault();
    const tabIndex = parseInt(e.key) - 1;
    console.log(`Keyboard shortcut: Switch to tab ${tabIndex + 1}`);
    const { sessions, setCurrentSession } = useClaudeCodeStore.getState();
    if (tabIndex < sessions.length) {
      setCurrentSession(sessions[tabIndex].id);
    }
  }
  
  // Help shortcuts are now handled in ClaudeChat component
});

// Track if help is open
let helpOverlayOpen = false;

// Function to show keyboard shortcuts help
function showKeyboardShortcutsHelp() {
  // If help is already open, close it
  if (helpOverlayOpen) {
    const existingOverlay = document.getElementById('keyboard-help-overlay');
    if (existingOverlay) {
      document.body.removeChild(existingOverlay);
      helpOverlayOpen = false;
    }
    return;
  }
  
  // Create a simple modal overlay
  const overlay = document.createElement('div');
  overlay.id = 'keyboard-help-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.05);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    backdrop-filter: blur(4px);
  `;
  
  const modal = document.createElement('div');
  modal.style.cssText = `
    background: #000;
    border: 1px solid rgba(255, 153, 204, 0.2);
    border-radius: 8px;
    padding: 32px 40px;
    width: 500px;
    max-width: 90vw;
    color: rgba(255, 255, 255, 0.9);
    font-family: monospace;
    font-size: 13px;
    line-height: 1.6;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8);
  `;
  
  // Create structured content with better formatting
  modal.innerHTML = `
    <div style="margin-bottom: 24px;">
      <div style="color: #ff99cc; font-size: 11px; letter-spacing: 1px; margin-bottom: 16px;">KEYBOARD SHORTCUTS</div>
      
      <div style="margin-bottom: 16px;">
        <div style="color: rgba(255, 255, 255, 0.4); font-size: 11px; margin-bottom: 8px;">tabs</div>
        <div style="display: flex; align-items: center; margin-bottom: 4px;">
          <span style="color: rgba(255, 255, 255, 0.6);">new tab</span>
          <span style="flex: 1; border-bottom: 1px dotted rgba(255, 255, 255, 0.15); margin: 0 8px 2px 8px;"></span>
          <span>ctrl+t</span>
        </div>
        <div style="display: flex; align-items: center; margin-bottom: 4px;">
          <span style="color: rgba(255, 255, 255, 0.6);">close tab</span>
          <span style="flex: 1; border-bottom: 1px dotted rgba(255, 255, 255, 0.15); margin: 0 8px 2px 8px;"></span>
          <span>ctrl+w</span>
        </div>
        <div style="display: flex; align-items: center; margin-bottom: 4px;">
          <span style="color: rgba(255, 255, 255, 0.6);">next tab</span>
          <span style="flex: 1; border-bottom: 1px dotted rgba(255, 255, 255, 0.15); margin: 0 8px 2px 8px;"></span>
          <span>ctrl+tab</span>
        </div>
        <div style="display: flex; align-items: center; margin-bottom: 4px;">
          <span style="color: rgba(255, 255, 255, 0.6);">prev tab</span>
          <span style="flex: 1; border-bottom: 1px dotted rgba(255, 255, 255, 0.15); margin: 0 8px 2px 8px;"></span>
          <span>ctrl+shift+tab</span>
        </div>
        <div style="display: flex; align-items: center;">
          <span style="color: rgba(255, 255, 255, 0.6);">jump to tab</span>
          <span style="flex: 1; border-bottom: 1px dotted rgba(255, 255, 255, 0.15); margin: 0 8px 2px 8px;"></span>
          <span>ctrl+1-9</span>
        </div>
      </div>
      
      <div style="margin-bottom: 16px;">
        <div style="color: rgba(255, 255, 255, 0.4); font-size: 11px; margin-bottom: 8px;">chat</div>
        <div style="display: flex; align-items: center; margin-bottom: 4px;">
          <span style="color: rgba(255, 255, 255, 0.6);">send</span>
          <span style="flex: 1; border-bottom: 1px dotted rgba(255, 255, 255, 0.15); margin: 0 8px 2px 8px;"></span>
          <span>enter</span>
        </div>
        <div style="display: flex; align-items: center; margin-bottom: 4px;">
          <span style="color: rgba(255, 255, 255, 0.6);">new line</span>
          <span style="flex: 1; border-bottom: 1px dotted rgba(255, 255, 255, 0.15); margin: 0 8px 2px 8px;"></span>
          <span>shift+enter</span>
        </div>
        <div style="display: flex; align-items: center; margin-bottom: 4px;">
          <span style="color: rgba(255, 255, 255, 0.6);">stop</span>
          <span style="flex: 1; border-bottom: 1px dotted rgba(255, 255, 255, 0.15); margin: 0 8px 2px 8px;"></span>
          <span>esc</span>
        </div>
        <div style="display: flex; align-items: center; margin-bottom: 4px;">
          <span style="color: rgba(255, 255, 255, 0.6);">clear context</span>
          <span style="flex: 1; border-bottom: 1px dotted rgba(255, 255, 255, 0.15); margin: 0 8px 2px 8px;"></span>
          <span>ctrl+l</span>
        </div>
        <div style="display: flex; align-items: center;">
          <span style="color: rgba(255, 255, 255, 0.6);">search</span>
          <span style="flex: 1; border-bottom: 1px dotted rgba(255, 255, 255, 0.15); margin: 0 8px 2px 8px;"></span>
          <span>ctrl+f</span>
        </div>
      </div>
      
      <div>
        <div style="color: rgba(255, 255, 255, 0.4); font-size: 11px; margin-bottom: 8px;">app</div>
        <div style="display: flex; align-items: center; margin-bottom: 4px;">
          <span style="color: rgba(255, 255, 255, 0.6);">quit</span>
          <span style="flex: 1; border-bottom: 1px dotted rgba(255, 255, 255, 0.15); margin: 0 8px 2px 8px;"></span>
          <span>ctrl+q</span>
        </div>
        <div style="display: flex; align-items: center;">
          <span style="color: rgba(255, 255, 255, 0.6);">help</span>
          <span style="flex: 1; border-bottom: 1px dotted rgba(255, 255, 255, 0.15); margin: 0 8px 2px 8px;"></span>
          <span>?</span>
        </div>
      </div>
    </div>
    <div style="text-align: center; color: rgba(255, 255, 255, 0.3); font-size: 11px; margin-top: 20px;">
      press ? or click to close
    </div>
  `;
  
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  helpOverlayOpen = true;
  
  // Close on click, Esc, or ?
  const close = () => {
    if (document.body.contains(overlay)) {
      document.body.removeChild(overlay);
      helpOverlayOpen = false;
    }
  };
  
  overlay.addEventListener('click', close);
  
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === '?') {
      e.preventDefault();
      close();
      document.removeEventListener('keydown', onKey);
    }
  };
  
  document.addEventListener('keydown', onKey);
}