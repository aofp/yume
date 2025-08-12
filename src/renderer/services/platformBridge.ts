/**
 * Platform bridge that provides the API for Tauri
 * Mimics the Electron API structure so the UI code doesn't need changes
 */

import platformAPI, { isTauri } from './tauriApi';

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
      console.log('PlatformBridge folder.select() called');
      console.log('isTauri:', isTauri());
      console.log('window.__TAURI__:', (window as any).__TAURI__);
      if (isTauri()) {
        console.log('Using Tauri API for folder selection');
        return await platformAPI.folder.select();
      }
      console.log('No folder selection API available');
      return null;
    },
    getCurrent: async (): Promise<string> => {
      return '/';
    }
  };

  // Zoom controls
  zoom = {
    in: async (): Promise<number> => {
      const currentLevel = await this.zoom.getLevel();
      const newLevel = Math.min(currentLevel + 0.1, 3);
      await this.zoom.setLevel(newLevel);
      return newLevel;
    },
    out: async (): Promise<number> => {
      const currentLevel = await this.zoom.getLevel();
      const newLevel = Math.max(currentLevel - 0.1, 0.5);
      await this.zoom.setLevel(newLevel);
      return newLevel;
    },
    reset: async (): Promise<number> => {
      await this.zoom.setLevel(1);
      return 1;
    },
    getLevel: async (): Promise<number> => {
      if (isTauri()) {
        const level = await platformAPI.settings.load('zoomLevel');
        return level || 1;
      }
      return 1;
    },
    setLevel: async (level: number): Promise<void> => {
      if (isTauri()) {
        await platformAPI.window.setZoomLevel(level);
        await platformAPI.settings.save('zoomLevel', level);
      }
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
    console.log('Platform Bridge: Setting up window.electronAPI for Tauri');
    (window as any).electronAPI = bridge;
    console.log('Platform Bridge: window.electronAPI is now:', window.electronAPI);
    console.log('Platform Bridge: folder.select available:', !!window.electronAPI?.folder?.select);
  } else {
    console.log('Platform Bridge: Not setting up - isTauri:', isTauri(), 'window.electronAPI exists:', !!window.electronAPI);
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