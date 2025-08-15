import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { appWindow } from '@tauri-apps/api/window';

export interface TauriAPI {
  folder: {
    select: () => Promise<string | null>;
  };
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    setZoomLevel: (level: number) => Promise<void>;
  };
  claude: {
    sendMessage: (sessionId: string, message: string, workingDir: string, model: string) => Promise<void>;
    interruptSession: (sessionId: string) => Promise<void>;
    clearSession: (sessionId: string) => Promise<void>;
    getSessions: () => Promise<any[]>;
    getServerPort: () => Promise<number>;
  };
  settings: {
    save: (key: string, value: any) => Promise<void>;
    load: (key: string) => Promise<any>;
  };
  projects: {
    getRecent: () => Promise<string[]>;
    addRecent: (path: string) => Promise<void>;
  };
  contextMenu: {
    show: (x: number, y: number, hasSelection: boolean) => Promise<void>;
  };
}

class TauriAPIBridge implements TauriAPI {
  folder = {
    select: async (): Promise<string | null> => {
      try {
        console.log('Tauri folder.select() called - using invoke command');
        console.log('About to invoke select_folder command...');
        const result = await invoke<string | null>('select_folder');
        console.log('Select folder invoke returned:', result);
        return result;
      } catch (error) {
        console.error('Error invoking select_folder:', error);
        throw error; // Re-throw to see the actual error
      }
    }
  };

  window = {
    minimize: async (): Promise<void> => {
      await invoke('minimize_window');
    },
    maximize: async (): Promise<void> => {
      await invoke('maximize_window');
    },
    close: async (): Promise<void> => {
      await invoke('close_window');
    },
    setZoomLevel: async (level: number): Promise<void> => {
      await invoke('set_zoom_level', { level });
    }
  };

  claude = {
    sendMessage: async (sessionId: string, message: string, workingDir: string, model: string): Promise<void> => {
      await invoke('send_message', { sessionId, message, workingDir, model });
    },
    interruptSession: async (sessionId: string): Promise<void> => {
      await invoke('interrupt_session', { sessionId });
    },
    clearSession: async (sessionId: string): Promise<void> => {
      await invoke('clear_session', { sessionId });
    },
    getSessions: async (): Promise<any[]> => {
      return await invoke('get_sessions');
    },
    getServerPort: async (): Promise<number> => {
      return await invoke('get_server_port');
    }
  };

  settings = {
    save: async (key: string, value: any): Promise<void> => {
      await invoke('save_settings', { key, value });
    },
    load: async (key: string): Promise<any> => {
      const result = await invoke('load_settings', { key });
      return result;
    }
  };

  projects = {
    getRecent: async (): Promise<string[]> => {
      return await invoke('get_recent_projects');
    },
    addRecent: async (path: string): Promise<void> => {
      await invoke('add_recent_project', { path });
    }
  };

  contextMenu = {
    show: async (x: number, y: number, hasSelection: boolean): Promise<void> => {
      await invoke('show_context_menu', { x, y, hasSelection });
    }
  };
}

// Create singleton instance
const tauriAPI = new TauriAPIBridge();

// Helper to detect if running in Tauri
export const isTauri = (): boolean => {
  const result = typeof window !== 'undefined' && '__TAURI__' in window;
  // Only log once to avoid spam
  if (!window.__tauriCheckLogged) {
    console.log('isTauri check: window defined:', typeof window !== 'undefined', '__TAURI__ in window:', typeof window !== 'undefined' && '__TAURI__' in window, 'result:', result);
    window.__tauriCheckLogged = true;
  }
  return result;
};

// Export the Tauri API directly
export const platformAPI: TauriAPI = tauriAPI;

// Export for direct usage
export default platformAPI;