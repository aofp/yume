/**
 * Platform bridge that provides the API for Tauri
 * Mimics the Electron API structure so the UI code doesn't need changes
 */

import platformAPI, { isTauri } from './tauriApi';
import { isDev } from '../utils/helpers';
import { logger } from '../utils/structuredLogger';

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
        logger.info('PlatformBridge folder.select() called');
        logger.info('isTauri:', isTauri());
        logger.info('window.__TAURI__:', (window as Record<string, unknown>).__TAURI__);
      }
      if (isTauri()) {
        if (isDev) logger.info('Using Tauri API for folder selection');
        return await platformAPI.folder.select();
      }
      if (isDev) logger.info('No folder selection API available');
      return null;
    },
    getCurrent: async (): Promise<string> => {
      return '/';
    }
  };

  // Zoom helper functions
  private getScrollState() {
    const chatMessages = document.querySelector('.chat-messages') as HTMLElement;
    if (!chatMessages) return { wasAtBottom: false, savedScrollTop: 0, element: null };

    const threshold = 1;
    const savedScrollTop = chatMessages.scrollTop;
    const wasAtBottom = chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight < threshold;

    return { wasAtBottom, savedScrollTop, element: chatMessages };
  }

  private getCurrentZoom(): number {
    let currentZoom = parseInt(localStorage.getItem('zoomPercent') || '100');

    if (!localStorage.getItem('zoomPercent')) {
      const bodyZoom = parseFloat(getComputedStyle(document.body).zoom || '1');
      currentZoom = Math.round(bodyZoom * 100);
    }

    return currentZoom;
  }

  private applyZoom(newZoom: number, scrollState: ReturnType<typeof this.getScrollState>, currentZoom: number) {
    document.body.style.zoom = `${newZoom / 100}`;
    localStorage.setItem('zoomPercent', newZoom.toString());

    if (scrollState.element) {
      requestAnimationFrame(() => {
        if (scrollState.wasAtBottom) {
          scrollState.element!.scrollTop = scrollState.element!.scrollHeight;
        } else {
          const zoomRatio = newZoom / currentZoom;
          scrollState.element!.scrollTop = scrollState.savedScrollTop * zoomRatio;
        }
      });
    }

    const zoomLevel = (newZoom - 100) / 5;
    window.dispatchEvent(new CustomEvent('zoom-changed', { detail: zoomLevel }));
    return zoomLevel;
  }

  // Zoom controls using CSS transform
  zoom = {
    in: async (): Promise<number> => {
      if (isDev) logger.info('[PlatformBridge] zoom.in() called');

      const scrollState = this.getScrollState();
      const currentZoom = this.getCurrentZoom();
      const newZoom = Math.min(currentZoom + 5, 200);

      if (isDev) logger.info(`[PlatformBridge] Applying zoom: ${newZoom}% (${newZoom / 100})`);

      const zoomLevel = this.applyZoom(newZoom, scrollState, currentZoom);

      if (isDev) logger.info(`[PlatformBridge] Zoom applied successfully: ${newZoom}%`);
      return zoomLevel;
    },
    out: async (): Promise<number> => {
      if (isDev) logger.info('[PlatformBridge] zoom.out() called');

      const scrollState = this.getScrollState();
      const currentZoom = this.getCurrentZoom();
      const newZoom = Math.max(currentZoom - 5, 50);

      if (isDev) logger.info(`[PlatformBridge] Applying zoom: ${newZoom}% (${newZoom / 100})`);

      const zoomLevel = this.applyZoom(newZoom, scrollState, currentZoom);

      if (isDev) logger.info(`[PlatformBridge] Zoom applied successfully: ${newZoom}%`);
      return zoomLevel;
    },
    reset: async (): Promise<number> => {
      if (isDev) logger.info('[PlatformBridge] zoom.reset() called');

      const scrollState = this.getScrollState();
      const currentZoom = this.getCurrentZoom();
      const newZoom = 100;

      const zoomLevel = this.applyZoom(newZoom, scrollState, currentZoom);

      if (isDev) logger.info('[PlatformBridge] Zoom reset to 100%');
      return zoomLevel;
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
  emit = (event: string, ...args: unknown[]) => {
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
    if (isDev) logger.info('Platform Bridge: Setting up window.electronAPI for Tauri');
    (window as Record<string, unknown>).electronAPI = bridge;
    if (isDev) {
      logger.info('Platform Bridge: window.electronAPI is now:', window.electronAPI);
      logger.info('Platform Bridge: folder.select available:', !!window.electronAPI?.folder?.select);
    }
  } else {
    if (isDev) logger.info('Platform Bridge: Not setting up - isTauri:', isTauri(), 'window.electronAPI exists:', !!window.electronAPI);
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