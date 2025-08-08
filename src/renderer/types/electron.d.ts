export interface ElectronAPI {
  folder?: {
    select: () => Promise<string | null>;
    getCurrent: () => Promise<string>;
  };
  window?: {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
  };
  claude?: {
    query: (prompt: string, options?: any) => Promise<any>;
    session: {
      create: (options?: any) => Promise<any>;
      resume: (sessionId: string) => Promise<any>;
      list: () => Promise<any>;
      pause: (sessionId: string) => Promise<any>;
      delete: (sessionId: string) => Promise<any>;
    };
  };
  settings?: {
    get: (key: string) => Promise<any>;
    set: (key: string, value: any) => Promise<any>;
    getAll: () => Promise<any>;
  };
  file?: {
    read: (filepath: string) => Promise<any>;
    write: (filepath: string, content: string) => Promise<any>;
    select: (options?: any) => Promise<any>;
  };
  permission?: {
    request: (tool: string, params: any) => Promise<any>;
    getAll: () => Promise<any>;
    set: (tool: string, permission: string) => Promise<any>;
  };
  system?: {
    openExternal: (url: string) => Promise<any>;
    getVersion: () => Promise<any>;
    checkForUpdates: () => Promise<any>;
  };
  on?: (channel: string, callback: Function) => void;
  removeListener?: (channel: string, callback: Function) => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}