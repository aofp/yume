import React from 'react';
import ReactDOM from 'react-dom/client';

// Import theme config FIRST (before CSS) to use default values
import { DEFAULT_COLORS } from './config/themes';

// Apply theme colors synchronously BEFORE any CSS loads to prevent flash
(() => {
  const savedBackgroundColor = localStorage.getItem('backgroundColor') || DEFAULT_COLORS.background;

  // Note: --background-color is the theme color for UI elements (always the actual color)
  // --bg-color is the body background (transparent on Windows for WebView2, set in index.html)
  document.documentElement.style.setProperty('--background-color', savedBackgroundColor);

  const bgHex = savedBackgroundColor.replace('#', '');
  const bgR = parseInt(bgHex.substr(0, 2), 16) || 10;
  const bgG = parseInt(bgHex.substr(2, 2), 16) || 10;
  const bgB = parseInt(bgHex.substr(4, 2), 16) || 10;
  document.documentElement.style.setProperty('--background-rgb', `${bgR}, ${bgG}, ${bgB}`);

  const savedForegroundColor = localStorage.getItem('foregroundColor') || DEFAULT_COLORS.foreground;
  document.documentElement.style.setProperty('--foreground-color', savedForegroundColor);
  const fgHex = savedForegroundColor.replace('#', '');
  document.documentElement.style.setProperty('--foreground-rgb', `${parseInt(fgHex.substr(0, 2), 16) || 255}, ${parseInt(fgHex.substr(2, 2), 16) || 255}, ${parseInt(fgHex.substr(4, 2), 16) || 255}`);

  const savedAccentColor = localStorage.getItem('accentColor') || DEFAULT_COLORS.accent;
  document.documentElement.style.setProperty('--accent-color', savedAccentColor);
  const accentHex = savedAccentColor.replace('#', '');
  document.documentElement.style.setProperty('--accent-rgb', `${parseInt(accentHex.substr(0, 2), 16) || 187}, ${parseInt(accentHex.substr(2, 2), 16) || 153}, ${parseInt(accentHex.substr(4, 2), 16) || 255}`);
})();

import { App } from './App.minimal';
import { APP_ID, appStorageKey } from './config/app';
import { useClaudeCodeStore } from './stores/claudeCodeStore';
import ErrorBoundary from './components/common/ErrorBoundary';
import { log } from './utils/logger';
import './utils/consoleOverride'; // Initialize console override for production
import { perfMonitor } from './services/performanceMonitor'; // Initialize performance monitoring
import './styles/embedded-fonts.css'; // Embedded fonts for Windows release
import './styles/fonts.css';
import './styles/global.css';
import './App.minimal.css';

// Initialize platform bridge for Tauri/Electron compatibility
import './services/platformBridge';
import { claudeCodeClient } from './services/claudeCodeClient';
import { tauriClaudeClient } from './services/tauriClaudeClient';
import { agentExecutionService } from './services/agentExecutionService';
import './services/modalService';

// Try to import Tauri invoke for git lock cleanup
let tauriInvoke: ((cmd: string, args?: any) => Promise<any>) | null = null;
import('@tauri-apps/api/core').then(m => {
  tauriInvoke = m.invoke;
}).catch(() => {
  // Not in Tauri environment
});

// Import Tauri event listener for reliable window focus detection
import('@tauri-apps/api/event').then(({ listen }) => {
  // Listen for native window focus changes from Tauri
  // This is more reliable than web 'focus' event on macOS
  listen<boolean>('window-focus-change', (event) => {
    if (event.payload) {
      // Window gained focus - force hover state re-evaluation via synthetic mouse movement
      // Inject a tiny mouse move event to force browser to recalculate hover states
      const syntheticMove = new MouseEvent('mousemove', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: -1,
        clientY: -1
      });
      document.dispatchEvent(syntheticMove);
    }
  });
}).catch(() => {
  // Not in Tauri environment, fallback to web focus event
});

const mainLogger = log.setContext('Main');
const PROMISE_ERRORS_KEY = appStorageKey('promise_errors', '_');
const WINDOW_ERRORS_KEY = appStorageKey('window_errors', '_');
const SESSIONS_KEY = appStorageKey('sessions');
const SESSIONS_TIMESTAMP_KEY = appStorageKey('sessions-timestamp');
const SESSION_MAPPINGS_KEY = appStorageKey('session-mappings');
const CHECKPOINT_PREFIX = `${APP_ID}-checkpoint-`;
const RECENT_PROJECTS_KEY = appStorageKey('recent-projects');

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

// Global error handlers
window.addEventListener('unhandledrejection', (event) => {
  mainLogger.error('Unhandled promise rejection', {
    reason: event.reason?.message || String(event.reason),
    stack: event.reason?.stack
  });
  
  // Log to localStorage for debugging
  try {
    const errors = JSON.parse(localStorage.getItem(PROMISE_ERRORS_KEY) || '[]');
    errors.push({
      type: 'unhandled_rejection',
      reason: event.reason?.message || String(event.reason),
      stack: event.reason?.stack,
      timestamp: new Date().toISOString()
    });
    // Keep only last 10 errors
    if (errors.length > 10) {
      errors.shift();
    }
    localStorage.setItem(PROMISE_ERRORS_KEY, JSON.stringify(errors));
  } catch (e) {
    mainLogger.error('Failed to store promise rejection', { error: e });
  }
  
  // Prevent default behavior (console error)
  event.preventDefault();
});

window.addEventListener('error', (event) => {
  mainLogger.error('Uncaught window error', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error?.message || String(event.error),
    stack: event.error?.stack
  });
  
  // Log to localStorage for debugging  
  try {
    const errors = JSON.parse(localStorage.getItem(WINDOW_ERRORS_KEY) || '[]');
    errors.push({
      type: 'window_error',
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error?.message || String(event.error),
      stack: event.error?.stack,
      timestamp: new Date().toISOString()
    });
    // Keep only last 10 errors
    if (errors.length > 10) {
      errors.shift();
    }
    localStorage.setItem(WINDOW_ERRORS_KEY, JSON.stringify(errors));
  } catch (e) {
    mainLogger.error('Failed to store window error', { error: e });
  }
  
  // Don't prevent default to allow React error boundaries to work
});

// Clear any persisted sessions from localStorage on startup
const store = useClaudeCodeStore.getState();
// Clear all sessions from localStorage to ensure clean start
localStorage.removeItem(SESSIONS_KEY);
localStorage.removeItem(SESSIONS_TIMESTAMP_KEY);
localStorage.removeItem(SESSION_MAPPINGS_KEY);
// Clear all session checkpoints  
const keysToRemove = [];
for (let i = 0; i < localStorage.length; i++) {
  const key = localStorage.key(i);
  if (key && key.startsWith(CHECKPOINT_PREFIX)) {
    keysToRemove.push(key);
  }
}
keysToRemove.forEach(key => localStorage.removeItem(key));

// Set up listener for auto-created sessions from server and Tauri client
const sessionCreatedHandler = (data: any) => {
  // Handle deferred spawn case (when tempSessionId and realSessionId are provided)
  if (data.tempSessionId && data.realSessionId) {
    // Call the store method to handle the deferred spawn
    store.handleDeferredSpawn(data.tempSessionId, data.realSessionId);
    return;
  }

  // Original logic for server auto-created sessions
  
  // Update the session in the store to mark it as active and restore messages
  const state = store;
  const existingSession = state.sessions.find(s => s.id === data.sessionId);
  
  if (existingSession) {
    // Update existing session
    const sessions = state.sessions.map(s => {
      if (s.id === data.sessionId) {
        return {
          ...s,
          status: 'active' as const,
          claudeSessionId: data.claudeSessionId || null,
          workingDirectory: data.workingDirectory || s.workingDirectory,
          messages: data.messages || s.messages || []  // Restore messages from server
        };
      }
      return s;
    });
    useClaudeCodeStore.setState({ sessions });
  } else {
    // Create new session if it doesn't exist
    const newSession = {
      id: data.sessionId,
      name: 'restored session',
      status: 'active' as const,
      claudeSessionId: data.claudeSessionId || null,
      workingDirectory: data.workingDirectory || '/Users/yuru',
      messages: data.messages || [],
      createdAt: new Date(),
      updatedAt: new Date(),
      streaming: false,
      modifiedFiles: new Set(),
      analytics: {
        totalMessages: data.messages?.length || 0,
        userMessages: 0,
        assistantMessages: 0,
        toolUses: 0,
        tokens: {
          input: 0,
          output: 0,
          total: 0,
          byModel: { opus: { input: 0, output: 0, total: 0 }, sonnet: { input: 0, output: 0, total: 0 } }
        },
        duration: 0,
        lastActivity: new Date(),
        thinkingTime: 0
      },
      pendingToolIds: new Set()
    } as any;

    useClaudeCodeStore.setState({
      sessions: [...state.sessions, newSession],
      currentSessionId: data.sessionId
    });
  }
};

// Register the handler for both clients
claudeCodeClient.onSessionCreated(sessionCreatedHandler);
tauriClaudeClient.onSessionCreated(sessionCreatedHandler);

// Auto-reconnect restored sessions after app starts
setTimeout(() => {
  // Only reconnect if socket is connected
  if (claudeCodeClient.connectionStatus !== 'connected' && !claudeCodeClient.isConnected()) {
    return; // Skip reconnection if not connected yet
  }

  const { sessions, currentSessionId } = store;

  sessions.forEach(async (session) => {
    // Only reconnect sessions that have a claudeSessionId (were active before)
    if (session.claudeSessionId) {
      try {
        // Reconnect the session - server will use --resume flag
        await store.createSession(session.name, session.workingDirectory, session.id);
      } catch (err) {
        // Failed to reconnect, will create fresh on first message
      }
    }
  });

  // Restore the current session if it exists
  if (currentSessionId && sessions.find(s => s.id === currentSessionId)) {
    store.setCurrentSession(currentSessionId);
  }
}, 500); // Reduced from 2000ms - adaptive connection makes this faster

// Wait for DOM to be ready
function initApp() {
  const rootElement = document.getElementById('root');

  if (rootElement) {
    ReactDOM.createRoot(rootElement).render(
      <ErrorBoundary name="RootBoundary">
        <App />
      </ErrorBoundary>
    );
  } else {
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

// Clear all sessions when window is about to close
window.addEventListener('beforeunload', () => {
  // Clear the persistence interval
  if (persistenceInterval) {
    clearInterval(persistenceInterval);
  }

  // Clean up agent execution service (stops its interval)
  agentExecutionService.destroy();

  // Cleanup git lock files for all open sessions (fire and forget)
  if (tauriInvoke) {
    const store = useClaudeCodeStore.getState();
    const sessions = store.sessions;
    for (const session of Object.values(sessions)) {
      if (session.workingDirectory) {
        tauriInvoke('cleanup_git_lock', { directory: session.workingDirectory }).catch(() => {});
      }
    }
  }

  // Clear all sessions from localStorage
  localStorage.removeItem(SESSIONS_KEY);
  localStorage.removeItem(SESSIONS_TIMESTAMP_KEY);
  localStorage.removeItem(SESSION_MAPPINGS_KEY);
  // Clear all session checkpoints
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(CHECKPOINT_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => localStorage.removeItem(key));
});

// Listen for app quit event from Electron main process
if (window.electronAPI && window.electronAPI.ipcRenderer) {
  window.electronAPI.ipcRenderer.on('app-before-quit', () => {
    // Clear the persistence interval
    if (persistenceInterval) {
      clearInterval(persistenceInterval);
    }
    // Clear all sessions from localStorage
    localStorage.removeItem(SESSIONS_KEY);
    localStorage.removeItem(SESSIONS_TIMESTAMP_KEY);
    localStorage.removeItem(SESSION_MAPPINGS_KEY);
    // Clear all session checkpoints
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CHECKPOINT_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
  });
}

// Track last reconnection attempt to prevent rapid reconnects
let lastReconnectAttempt = 0;
const RECONNECT_DEBOUNCE_MS = 5000; // Minimum 5 seconds between reconnect attempts

// Focus preservation helper - saves and restores focus across async operations
const preserveFocus = async (asyncOperation: () => Promise<void>) => {
  const activeElement = document.activeElement as HTMLElement | null;
  const wasTextareaFocused = activeElement?.classList.contains('chat-input');

  try {
    await asyncOperation();
  } finally {
    // Restore focus after async operation completes
    if (wasTextareaFocused && document.hasFocus()) {
      requestAnimationFrame(() => {
        const textarea = document.querySelector('textarea.chat-input') as HTMLTextAreaElement;
        if (textarea && !document.querySelector('.modal-overlay')) {
          textarea.focus();
        }
      });
    }
  }
};

// Handle window focus/blur for better session management
// NOTE: Hover fix is now handled by tauri 'window-focus-change' event (more reliable)
// This web 'focus' event is kept for session reconnection logic
window.addEventListener('focus', () => {
  const store = useClaudeCodeStore.getState();
  const { sessions, currentSessionId } = store;

  // Check if current session needs refresh (with debouncing)
  const now = Date.now();
  if (now - lastReconnectAttempt < RECONNECT_DEBOUNCE_MS) {
    return; // Skip reconnection if we recently attempted one
  }

  const currentSession = sessions.find(s => s.id === currentSessionId);
  if (currentSession && currentSession.status === 'paused') {
    if (currentSession.claudeSessionId) {
      lastReconnectAttempt = now;
      preserveFocus(async () => {
        await store.createSession(currentSession.name, currentSession.workingDirectory, currentSession.id)
          .catch(() => { /* Session already active or reconnection not needed */ });
      });
    }
  }
});

window.addEventListener('blur', () => {
  // Don't persist sessions anymore - they should be ephemeral
});

// Detect system wake from sleep and recover
document.addEventListener('visibilitychange', () => {
  const now = Date.now();

  if (document.hidden) {
    // Page is being hidden, record the time
    lastActiveTime = now;
  } else {
    // Page is becoming visible, check if we need to restore
    const timeDiff = now - lastActiveTime;

    // Check debounce before attempting reconnection
    if (now - lastReconnectAttempt < RECONNECT_DEBOUNCE_MS) {
      return; // Skip if we recently attempted reconnection
    }

    if (timeDiff > 60000) { // 1 minute - just refresh connections
      lastReconnectAttempt = now;
      // Just ensure sessions are still connected - use sequential processing
      const refreshSessions = async () => {
        for (const session of store.sessions) {
          if (session.claudeSessionId && session.status === 'paused') {
            try {
              await store.createSession(session.name, session.workingDirectory, session.id);
            } catch (err) {
              // Connection refresh not needed
            }
          }
        }
        // Focus restoration removed - typing auto-focuses via handleGlobalTyping
      };
      refreshSessions();
    }
  }
});


// Keyboard shortcut handler
const keyboardHandler = (e: KeyboardEvent) => {
  // F12 - Toggle DevTools (works regardless of input field)
  if (e.key === 'F12') {
    e.preventDefault();
    return;
  }

  // Ctrl + Tab - Next tab (works regardless of input field)
  if (e.ctrlKey && e.key === 'Tab' && !e.shiftKey) {
    e.preventDefault();
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
        interruptSession();
      }
    }
  }

  // Cmd/Ctrl + T - New tab (session) with folder dialog
  if ((e.metaKey || e.ctrlKey) && e.key === 't') {
    e.preventDefault();
    const { createSession } = useClaudeCodeStore.getState();

    // Use setTimeout to ensure UI updates before blocking dialog
    setTimeout(async () => {
      if (window.electronAPI?.folder?.select) {
        try {
          const folder = await window.electronAPI.folder.select();
          if (folder) {
            // Save to recent projects
            const name = folder.split(/[/\\]/).pop() || folder;
            const newProject = { path: folder, name, lastOpened: Date.now() };
            const stored = localStorage.getItem(RECENT_PROJECTS_KEY);
            let recentProjects = [];
            try {
              if (stored) recentProjects = JSON.parse(stored);
            } catch {}
            const updated = [newProject, ...recentProjects.filter((p: any) => p.path !== folder)].slice(0, 10);
            localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(updated));

            await createSession(undefined, folder);
          }
          // User cancelled - do nothing
        } catch (err) {
          console.error('Folder selection failed:', err);
        }
      }
      // No fallback - require folder selection
    }, 0);
  }
  
  // Cmd/Ctrl + W - Close current tab
  if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
    e.preventDefault();
    const { currentSessionId, deleteSession } = useClaudeCodeStore.getState();
    if (currentSessionId) {
      deleteSession(currentSessionId);
    }
  }

  // Cmd/Ctrl + Q - Quit application
  if ((e.metaKey || e.ctrlKey) && e.key === 'q') {
    e.preventDefault();
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
    const { sessions, setCurrentSession } = useClaudeCodeStore.getState();
    if (tabIndex < sessions.length) {
      setCurrentSession(sessions[tabIndex].id);
    }
  }

  // Help shortcuts are now handled in ClaudeChat component
};

// Add the keyboard listener
document.addEventListener('keydown', keyboardHandler);

// Cleanup on unload (for hot reload in dev mode)
window.addEventListener('unload', () => {
  document.removeEventListener('keydown', keyboardHandler);
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
    background: rgba(0, 0, 0, 0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
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
