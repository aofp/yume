import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Window } from '@tauri-apps/api/window';
import { logger } from '../utils/structuredLogger';
const appWindow = new Window('main');

export interface TauriAPI {
  folder: {
    select: () => Promise<string | null>;
  };
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    setZoomLevel: (level: number) => Promise<void>;
    setOpacity: (opacity: number) => Promise<void>;
  };
  claude: {
    sendMessage: (sessionId: string, message: string, workingDir: string, model: string) => Promise<void>;
    interruptSession: (sessionId: string) => Promise<void>;
    clearSession: (sessionId: string) => Promise<void>;
    getSessions: () => Promise<any[]>;
    getServerPort: () => Promise<number>;
    readPortFile: () => Promise<number>;
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
  files: {
    writeContent: (path: string, content: string) => Promise<void>;
    deleteFile: (path: string) => Promise<void>;
  };
  rollback: {
    getFileMtime: (path: string) => Promise<number | null>;
    checkFileConflicts: (files: Array<[string, number | null, boolean]>) => Promise<FileConflict[]>;
    registerFileEdit: (path: string, sessionId: string, timestamp: number, operation: string) => Promise<void>;
    getConflictingEdits: (paths: string[], currentSessionId: string, afterTimestamp: number) => Promise<FileEditRecord[]>;
    clearSessionEdits: (sessionId: string) => Promise<void>;
  };
}

// Types for rollback conflict detection
export interface FileConflict {
  path: string;
  snapshot_mtime: number | null;
  current_mtime: number | null;
  exists: boolean;
  conflict_type: 'modified' | 'deleted' | 'created' | 'unknown' | 'none';
}

export interface FileEditRecord {
  path: string;
  session_id: string;
  timestamp: number;
  operation: string;
}

class TauriAPIBridge implements TauriAPI {
  folder = {
    select: async (): Promise<string | null> => {
      try {
        logger.info('Tauri folder.select() called - using invoke command');
        logger.info('About to invoke select_folder command...');
        const result = await invoke<string | null>('select_folder');
        logger.info('Select folder invoke returned', { result });
        return result;
      } catch (error) {
        logger.error('Error invoking select_folder', { error });
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
    },
    setOpacity: async (opacity: number): Promise<void> => {
      await invoke('set_window_opacity', { opacity });
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
    },
    readPortFile: async (): Promise<number> => {
      return await invoke('read_port_file');
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

  files = {
    writeContent: async (path: string, content: string): Promise<void> => {
      await invoke('write_file_content', { path, content });
    },
    deleteFile: async (path: string): Promise<void> => {
      await invoke('delete_file', { path });
    }
  };

  rollback = {
    getFileMtime: async (path: string): Promise<number | null> => {
      return await invoke('get_file_mtime', { path });
    },
    checkFileConflicts: async (files: Array<[string, number | null, boolean]>): Promise<FileConflict[]> => {
      return await invoke('check_file_conflicts', { files });
    },
    registerFileEdit: async (path: string, sessionId: string, timestamp: number, operation: string): Promise<void> => {
      await invoke('register_file_edit', { path, sessionId, timestamp, operation });
    },
    getConflictingEdits: async (paths: string[], currentSessionId: string, afterTimestamp: number): Promise<FileEditRecord[]> => {
      return await invoke('get_conflicting_edits', { paths, currentSessionId, afterTimestamp });
    },
    clearSessionEdits: async (sessionId: string): Promise<void> => {
      await invoke('clear_session_edits', { sessionId });
    }
  };
}

// Create singleton instance
const tauriAPI = new TauriAPIBridge();

// Helper to detect if running in VSCode webview (iframe with ?vscode=1)
export const isVSCode = (): boolean => {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('vscode') === '1';
};

// Get port from URL when in vscode mode
export const getVSCodePort = (): number | null => {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const port = params.get('port');
  return port ? parseInt(port, 10) : null;
};

// Get cwd from URL when in vscode mode
export const getVSCodeCwd = (): string | null => {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  return params.get('cwd') || null;
};

// Helper to detect if running in Tauri
export const isTauri = (): boolean => {
  // VSCode mode overrides Tauri detection
  if (isVSCode()) return false;

  const result = typeof window !== 'undefined' && '__TAURI__' in window;
  // Only log once to avoid spam
  if (!window.__tauriCheckLogged) {
    logger.info('isTauri check', {
      windowDefined: typeof window !== 'undefined',
      hasTauri: typeof window !== 'undefined' && '__TAURI__' in window,
      vscodeMode: isVSCode(),
      result
    });
    window.__tauriCheckLogged = true;
  }
  return result;
};

// Export the Tauri API directly
export const platformAPI: TauriAPI = tauriAPI;

// Re-export invoke for convenience
export { invoke };

// Export for direct usage
export default platformAPI;