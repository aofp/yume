/**
 * Platform bridge that provides the API for Tauri
 * Mimics the Electron API structure so the UI code doesn't need changes
 */

import platformAPI, { isTauri } from './tauriApi';
import { isDev } from '../utils/helpers';

// Create a unified interface that matches the existing Electron API structure
class PlatformBridge {
  private listeners: Map<string, Set<Function>> = new Map();

  // Window controls
  window = {
    minimize: async () => {
      if (isTauri()) {
        await platformAPI.window.minimize();
      }
    },
    maximize: async () => {
      if (isTauri()) {
        await platformAPI.window.maximize();
      }
    },
    close: async () => {
      if (isTauri()) {
        await platformAPI.window.close();
      }
    }
  };

  // Folder operations
  folder = {
    select: async (): Promise<string | null> => {
      if (isDev) {
        console.log('PlatformBridge folder.select() called');
        console.log('isTauri:', isTauri());
        console.log('window.__TAURI__:', (window as any).__TAURI__);
      }
      if (isTauri()) {
        if (isDev) console.log('Using Tauri API for folder selection');
        return await platformAPI.folder.select();
      }
      if (isDev) console.log('No folder selection API available');
      return null;
    },
    getCurrent: async (): Promise<string> => {
      return '/';
    }
  };

  // Zoom controls using CSS transform
  zoom = {
    in: async (): Promise<number> => {
      if (isDev) console.log('[PlatformBridge] zoom.in() called');
      
      // Check if user is scrolled to bottom before zoom
      const chatMessages = document.querySelector('.chat-messages') as HTMLElement;
      let wasAtBottom = false;
      let savedScrollTop = 0;
      if (chatMessages) {
        const threshold = 1; // Match the main scroll logic threshold
        savedScrollTop = chatMessages.scrollTop;
        wasAtBottom = chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight < threshold;
      }
      
      // Get current zoom percentage from localStorage (100 = 100%)
      let currentZoom = parseInt(localStorage.getItem('zoomPercent') || '100');
      
      // If no saved value, get from current body zoom
      if (!localStorage.getItem('zoomPercent')) {
        const bodyZoom = parseFloat(getComputedStyle(document.body).zoom || '1');
        currentZoom = Math.round(bodyZoom * 100);
      }
      
      const newZoom = Math.min(currentZoom + 5, 200);
      if (isDev) console.log(`[PlatformBridge] Applying zoom: ${newZoom}% (${newZoom / 100})`);
      
      // Apply CSS zoom (1.0 = 100%, 1.1 = 110%, etc)
      document.body.style.zoom = `${newZoom / 100}`;
      
      // Save to localStorage
      localStorage.setItem('zoomPercent', newZoom.toString());
      
      // Restore scroll position after zoom
      if (chatMessages) {
        requestAnimationFrame(() => {
          if (wasAtBottom) {
            // If was at bottom, scroll back to bottom
            chatMessages.scrollTop = chatMessages.scrollHeight;
          } else {
            // Otherwise, try to maintain relative position
            const zoomRatio = newZoom / currentZoom;
            chatMessages.scrollTop = savedScrollTop * zoomRatio;
          }
        });
      }
      
      // Calculate zoom level for display (-10 to +20, where 0 = 100%)
      const zoomLevel = (newZoom - 100) / 5;
      window.dispatchEvent(new CustomEvent('zoom-changed', { detail: zoomLevel }));
      if (isDev) console.log(`[PlatformBridge] Zoom applied successfully: ${newZoom}%`);
      return zoomLevel;
    },
    out: async (): Promise<number> => {
      if (isDev) console.log('[PlatformBridge] zoom.out() called');
      
      // Check if user is scrolled to bottom before zoom
      const chatMessages = document.querySelector('.chat-messages') as HTMLElement;
      let wasAtBottom = false;
      let savedScrollTop = 0;
      if (chatMessages) {
        const threshold = 1; // Match the main scroll logic threshold
        savedScrollTop = chatMessages.scrollTop;
        wasAtBottom = chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight < threshold;
      }
      
      // Get current zoom percentage from localStorage
      let currentZoom = parseInt(localStorage.getItem('zoomPercent') || '100');
      
      // If no saved value, get from current body zoom
      if (!localStorage.getItem('zoomPercent')) {
        const bodyZoom = parseFloat(getComputedStyle(document.body).zoom || '1');
        currentZoom = Math.round(bodyZoom * 100);
      }
      
      const newZoom = Math.max(currentZoom - 5, 50);
      if (isDev) console.log(`[PlatformBridge] Applying zoom: ${newZoom}% (${newZoom / 100})`);
      
      // Apply CSS zoom
      document.body.style.zoom = `${newZoom / 100}`;
      
      // Save to localStorage
      localStorage.setItem('zoomPercent', newZoom.toString());
      
      // Restore scroll position after zoom
      if (chatMessages) {
        requestAnimationFrame(() => {
          if (wasAtBottom) {
            // If was at bottom, scroll back to bottom
            chatMessages.scrollTop = chatMessages.scrollHeight;
          } else {
            // Otherwise, try to maintain relative position
            const zoomRatio = newZoom / currentZoom;
            chatMessages.scrollTop = savedScrollTop * zoomRatio;
          }
        });
      }
      
      // Calculate zoom level for display
      const zoomLevel = (newZoom - 100) / 5;
      window.dispatchEvent(new CustomEvent('zoom-changed', { detail: zoomLevel }));
      if (isDev) console.log(`[PlatformBridge] Zoom applied successfully: ${newZoom}%`);
      return zoomLevel;
    },
    reset: async (): Promise<number> => {
      if (isDev) console.log('[PlatformBridge] zoom.reset() called');
      
      // Check if user is scrolled to bottom before zoom
      const chatMessages = document.querySelector('.chat-messages') as HTMLElement;
      let wasAtBottom = false;
      if (chatMessages) {
        const threshold = 1; // Match the main scroll logic threshold
        wasAtBottom = chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight < threshold;
      }
      
      // Reset zoom to 100%
      document.body.style.zoom = '1';
      
      // Save to localStorage
      localStorage.setItem('zoomPercent', '100');
      
      // Restore scroll position after zoom
      if (chatMessages) {
        requestAnimationFrame(() => {
          if (wasAtBottom) {
            // If was at bottom, scroll back to bottom
            chatMessages.scrollTop = chatMessages.scrollHeight;
          }
        });
      }
      
      window.dispatchEvent(new CustomEvent('zoom-changed', { detail: 0 }));
      if (isDev) console.log('[PlatformBridge] Zoom reset to 100%');
      return 0;
    },
    getLevel: async (): Promise<number> => {
      const currentZoom = parseInt(localStorage.getItem('zoomPercent') || '100');
      return (currentZoom - 100) / 5;
    },
    setLevel: async (level: number): Promise<void> => {
      const zoomPercent = 100 + (level * 5);
      
      // Apply CSS zoom
      document.body.style.zoom = `${zoomPercent / 100}`;
      
      // Save to localStorage
      localStorage.setItem('zoomPercent', zoomPercent.toString());
      
      window.dispatchEvent(new CustomEvent('zoom-changed', { detail: level }));
    }
  };

  // Server port discovery
  getServerPort = async (): Promise<number | null> => {
    if (isTauri()) {
      return await platformAPI.claude.getServerPort();
    }
    return null;
  };

  // File system checks - Tauri can't do sync file checks
  isDirectory = (path: string): boolean => {
    return false;
  };

  // Event handling (compatible with Electron's event system)
  on = (event: string, handler: Function) => {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  };

  off = (event: string, handler: Function) => {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  };

  removeAllListeners = (event: string) => {
    this.listeners.delete(event);
  };

  // IPC renderer compatibility
  ipcRenderer = {
    on: (channel: string, listener: Function) => {
      this.on(channel, listener);
    }
  };

  // Emit events internally
  emit = (event: string, ...args: any[]) => {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(...args));
    }
  };
}

// Create singleton instance
const bridge = new PlatformBridge();

// Function to setup the bridge
function setupBridge() {
  if (isTauri() && !window.electronAPI) {
    if (isDev) console.log('Platform Bridge: Setting up window.electronAPI for Tauri');
    (window as any).electronAPI = bridge;
    if (isDev) {
      console.log('Platform Bridge: window.electronAPI is now:', window.electronAPI);
      console.log('Platform Bridge: folder.select available:', !!window.electronAPI?.folder?.select);
    }
  } else {
    if (isDev) console.log('Platform Bridge: Not setting up - isTauri:', isTauri(), 'window.electronAPI exists:', !!window.electronAPI);
  }
}

// Try to setup immediately
setupBridge();

// Also setup when DOM is ready (in case Tauri isn't ready yet)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupBridge);
} else {
  // DOM is already loaded, try again after a small delay
  setTimeout(setupBridge, 100);
}

export default bridge;
export { bridge as platformBridge };