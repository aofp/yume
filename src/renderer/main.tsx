import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.minimal';
import { useClaudeCodeStore } from './stores/claudeCodeStore';
import './styles/global.css';
import './App.minimal.css';

// Initialize platform bridge for Tauri/Electron compatibility
import './services/platformBridge';
import { claudeCodeClient } from './services/claudeCodeClient';

console.log('main.tsx loading...');

// Variables for sleep/wake detection and session persistence
let lastActiveTime = Date.now();
let persistenceInterval: NodeJS.Timer | null = null;

// Add platform class to body for platform-specific styling
const platform = navigator.platform.toLowerCase();
if (platform.includes('mac')) {
  document.body.classList.add('platform-darwin');
} else if (platform.includes('win')) {
  document.body.classList.add('platform-win32');
} else if (platform.includes('linux')) {
  document.body.classList.add('platform-linux');
}

// Restore sessions from localStorage on startup
const store = useClaudeCodeStore.getState();
// Load any persisted session mappings
store.loadSessionMappings();
console.log('Restored sessions from localStorage on startup');

// Set up listener for auto-created sessions from server
claudeCodeClient.onSessionCreated((data) => {
  console.log('[App] Server auto-created session:', data);
  // Update the session in the store to mark it as active
  const state = store;
  const sessions = state.sessions.map(s => {
    if (s.id === data.sessionId) {
      return {
        ...s,
        status: 'active' as const,
        claudeSessionId: data.claudeSessionId || null,
        workingDirectory: data.workingDirectory || s.workingDirectory
      };
    }
    return s;
  });
  // Update the store with the activated session
  useClaudeCodeStore.setState({ sessions });
});

// Auto-reconnect restored sessions after app starts
setTimeout(() => {
  const { sessions, currentSessionId } = store;
  console.log(`[App] Checking ${sessions.length} restored sessions for reconnection`);
  
  sessions.forEach(async (session) => {
    // Only reconnect sessions that have a claudeSessionId (were active before)
    if (session.claudeSessionId) {
      console.log(`[App] Reconnecting session ${session.id} with claudeSessionId ${session.claudeSessionId}`);
      try {
        // Reconnect the session - server will use --resume flag
        await store.createSession(session.name, session.workingDirectory, session.id);
        console.log(`[App] Successfully reconnected session ${session.id}`);
      } catch (err) {
        console.error(`[App] Failed to reconnect session ${session.id}:`, err);
      }
    } else {
      console.log(`[App] Session ${session.id} has no claudeSessionId, will create fresh on first message`);
    }
  });
  
  // Restore the current session if it exists
  if (currentSessionId && sessions.find(s => s.id === currentSessionId)) {
    console.log(`[App] Restoring current session: ${currentSessionId}`);
    store.setCurrentSession(currentSessionId);
  }
}, 2000); // Wait 2 seconds for socket connection to establish

// Set up periodic session persistence (every 30 seconds)
persistenceInterval = setInterval(() => {
  const store = useClaudeCodeStore.getState();
  const { sessions } = store;
  if (sessions.length > 0) {
    // Trigger persistence by updating timestamps
    sessions.forEach(s => {
      useClaudeCodeStore.setState(state => ({
        sessions: state.sessions.map(session => 
          session.id === s.id ? { ...session, updatedAt: new Date() } : session
        )
      }));
    });
    console.log('[App] Periodic session persistence triggered');
  }
}, 30000);

// Wait for DOM to be ready
function initApp() {
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
    // Try again in 100ms if root not found
    setTimeout(initApp, 100);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  // DOM is already ready
  initApp();
}

// Save sessions when window is about to close
window.addEventListener('beforeunload', () => {
  console.log('Window closing, persisting sessions...');
  const store = useClaudeCodeStore.getState();
  // Clear the persistence interval
  if (persistenceInterval) {
    clearInterval(persistenceInterval);
  }
  // Force persist all sessions one more time
  const { sessions } = store;
  if (sessions.length > 0) {
    sessions.forEach(s => {
      useClaudeCodeStore.setState(state => ({
        sessions: state.sessions.map(session => 
          session.id === s.id ? { ...session, updatedAt: new Date() } : session
        )
      }));
    });
  }
  // Save the mappings
  store.saveSessionMappings();
});

// Listen for app quit event from Electron main process
if (window.electronAPI && window.electronAPI.ipcRenderer) {
  window.electronAPI.ipcRenderer.on('app-before-quit', () => {
    console.log('App quitting, persisting sessions...');
    const store = useClaudeCodeStore.getState();
    // Clear the persistence interval
    if (persistenceInterval) {
      clearInterval(persistenceInterval);
    }
    // Force persist all sessions one more time
    const { sessions } = store;
    if (sessions.length > 0) {
      sessions.forEach(s => {
        useClaudeCodeStore.setState(state => ({
          sessions: state.sessions.map(session => 
            session.id === s.id ? { ...session, updatedAt: new Date() } : session
          )
        }));
      });
    }
    // Save the mappings
    store.saveSessionMappings();
  });
}

// Handle window focus/blur for better session management
window.addEventListener('focus', () => {
  console.log('[App] Window focused');
  const store = useClaudeCodeStore.getState();
  const { sessions, currentSessionId } = store;
  
  // Check if current session needs refresh
  const currentSession = sessions.find(s => s.id === currentSessionId);
  if (currentSession && currentSession.status === 'paused') {
    console.log('[App] Current session is paused, attempting to reactivate');
    if (currentSession.claudeSessionId) {
      store.createSession(currentSession.name, currentSession.workingDirectory, currentSession.id)
        .then(() => console.log('[App] Reactivated current session'))
        .catch(err => console.log('[App] Session already active or reconnection not needed'));
    }
  }
});

window.addEventListener('blur', () => {
  console.log('[App] Window blurred, persisting sessions');
  const store = useClaudeCodeStore.getState();
  const { sessions } = store;
  
  // Persist sessions when window loses focus
  if (sessions.length > 0) {
    sessions.forEach(s => {
      useClaudeCodeStore.setState(state => ({
        sessions: state.sessions.map(session => 
          session.id === s.id ? { ...session, updatedAt: new Date() } : session
        )
      }));
    });
  }
  store.saveSessionMappings();
});

// Detect system wake from sleep and recover
// Also handle session persistence when window becomes inactive
document.addEventListener('visibilitychange', () => {
  const now = Date.now();
  const store = useClaudeCodeStore.getState();
  
  if (document.hidden) {
    // Page is being hidden, record the time and persist sessions
    lastActiveTime = now;
    console.log('[App] Window hidden, persisting sessions');
    // Force persist sessions when window becomes hidden
    const { sessions } = store;
    if (sessions.length > 0) {
      // Trigger persistence by updating a dummy field
      sessions.forEach(s => {
        useClaudeCodeStore.setState(state => ({
          sessions: state.sessions.map(session => 
            session.id === s.id ? { ...session, updatedAt: new Date() } : session
          )
        }));
      });
    }
    store.saveSessionMappings();
  } else {
    // Page is becoming visible, check if we need to restore
    const timeDiff = now - lastActiveTime;
    
    if (timeDiff > 600000) { // 10 minutes
      console.log(`⚠️ Page visible after ${Math.round(timeDiff/1000)}s gap, restoring sessions`);
      
      // Restore sessions from localStorage instead of reloading
      const restoredSessions = localStorage.getItem('yurucode-sessions');
      if (restoredSessions) {
        try {
          const sessionData = JSON.parse(restoredSessions);
          const { currentSessionId } = store;
          
          // Update existing sessions with restored data
          sessionData.forEach(async (restoredSession: any) => {
            const existingSession = store.sessions.find(s => s.id === restoredSession.id);
            
            if (!existingSession || existingSession.messages.length === 0) {
              // Session was cleared or doesn't exist, restore it
              console.log(`[App] Restoring session ${restoredSession.id}`);
              
              // Restore the session with its messages and state
              useClaudeCodeStore.setState(state => ({
                sessions: state.sessions.map(s => 
                  s.id === restoredSession.id ? {
                    ...s,
                    messages: restoredSession.messages || [],
                    claudeTitle: restoredSession.claudeTitle || s.claudeTitle,
                    analytics: restoredSession.analytics || s.analytics,
                    draftInput: restoredSession.draftInput || '',
                    draftAttachments: restoredSession.draftAttachments || [],
                    claudeSessionId: restoredSession.claudeSessionId,
                    status: 'paused' as const
                  } : s
                )
              }));
              
              // Reconnect if it had a claudeSessionId
              if (restoredSession.claudeSessionId) {
                try {
                  await store.createSession(
                    restoredSession.name, 
                    restoredSession.workingDirectory, 
                    restoredSession.id
                  );
                  console.log(`[App] Reconnected session ${restoredSession.id}`);
                } catch (err) {
                  console.error(`[App] Failed to reconnect session ${restoredSession.id}:`, err);
                }
              }
            }
          });
          
          // Restore current session
          if (currentSessionId && store.sessions.find(s => s.id === currentSessionId)) {
            store.setCurrentSession(currentSessionId);
          }
        } catch (err) {
          console.error('[App] Failed to restore sessions:', err);
        }
      }
    } else if (timeDiff > 60000) { // 1 minute - just refresh connections
      console.log(`[App] Page visible after ${Math.round(timeDiff/1000)}s, refreshing connections`);
      
      // Just ensure sessions are still connected
      store.sessions.forEach(async (session) => {
        if (session.claudeSessionId && session.status === 'paused') {
          try {
            await store.createSession(session.name, session.workingDirectory, session.id);
            console.log(`[App] Refreshed connection for session ${session.id}`);
          } catch (err) {
            console.log(`[App] Session ${session.id} connection refresh not needed`);
          }
        }
      });
    }
  }
});


// Add keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // F12 - Toggle DevTools (works regardless of input field)
  if (e.key === 'F12') {
    e.preventDefault();
    // Try to toggle devtools if available
    if ((window as any).__TAURI__) {
      import('@tauri-apps/api/window').then(({ appWindow }) => {
        // There's no direct toggle method, but we can try to emit an event
        console.log('F12 pressed - DevTools should be open automatically in dev mode');
      });
    }
    return;
  }
  
  // Ctrl + Tab - Next tab (works regardless of input field)
  if (e.ctrlKey && e.key === 'Tab' && !e.shiftKey) {
    e.preventDefault();
    console.log('Keyboard shortcut: Next tab');
    const { sessions, currentSessionId, setCurrentSession } = useClaudeCodeStore.getState();
    if (sessions.length > 1) {
      const currentIndex = sessions.findIndex(s => s.id === currentSessionId);
      const nextIndex = (currentIndex + 1) % sessions.length;
      setCurrentSession(sessions[nextIndex].id);
    }
    return;
  }
  
  // Ctrl + Shift + Tab - Previous tab (works regardless of input field)
  if (e.ctrlKey && e.shiftKey && e.key === 'Tab') {
    e.preventDefault();
    console.log('Keyboard shortcut: Previous tab');
    const { sessions, currentSessionId, setCurrentSession } = useClaudeCodeStore.getState();
    if (sessions.length > 1) {
      const currentIndex = sessions.findIndex(s => s.id === currentSessionId);
      const prevIndex = currentIndex === 0 ? sessions.length - 1 : currentIndex - 1;
      setCurrentSession(sessions[prevIndex].id);
    }
    return;
  }
  
  // Don't intercept keyboard shortcuts when typing in input fields
  const target = e.target as HTMLElement;
  const isInputField = target.tagName === 'INPUT' || 
                       target.tagName === 'TEXTAREA' || 
                       target.contentEditable === 'true';
  
  if (isInputField) {
    return;
  }
  
  // Escape - Stop streaming response (only if no modals are open)
  if (e.key === 'Escape') {
    // Check if any modals are open first - they have priority
    const hasOpenModal = 
      document.querySelector('.modal-overlay') || 
      document.querySelector('.projects-modal') ||
      document.querySelector('.recent-projects-modal') ||
      document.querySelector('.settings-modal') ||
      document.querySelector('.about-modal') ||
      document.querySelector('.keyboard-shortcuts') ||
      document.querySelector('.server-logs') ||
      document.querySelector('.autocomplete-popup') ||
      document.querySelector('.mention-autocomplete');
    
    // Only handle streaming interruption if no modals are open
    if (!hasOpenModal) {
      const { sessions, currentSessionId, interruptSession } = useClaudeCodeStore.getState();
      const currentSession = sessions.find(s => s.id === currentSessionId);
      if (currentSession?.streaming) {
        e.preventDefault();
        console.log('Keyboard shortcut: Interrupting stream');
        interruptSession();
      }
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
          const folderName = folder.split(/[/\\]/).pop() || 'new session';
          createSession(folderName, folder);
        }
      });
    } else {
      createSession('new session', '/Users/yuru/yurucode');
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
    font-size: 13pt;
    line-height: 1.6;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8);
  `;
  
  // Create structured content with better formatting
  modal.innerHTML = `
    <div style="margin-bottom: 24px;">
      <div style="color: #ff99cc; font-size: 11pt; letter-spacing: 1px; margin-bottom: 16px;">KEYBOARD SHORTCUTS</div>
      
      <div style="margin-bottom: 16px;">
        <div style="color: rgba(255, 255, 255, 0.4); font-size: 11pt; margin-bottom: 8px;">tabs</div>
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
        <div style="color: rgba(255, 255, 255, 0.4); font-size: 11pt; margin-bottom: 8px;">chat</div>
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
        <div style="color: rgba(255, 255, 255, 0.4); font-size: 11pt; margin-bottom: 8px;">app</div>
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
    <div style="text-align: center; color: rgba(255, 255, 255, 0.3); font-size: 11pt; margin-top: 20px;">
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