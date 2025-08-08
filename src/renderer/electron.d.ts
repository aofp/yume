declare global {
  interface Window {
    electronAPI?: {
      folder: {
        select: () => Promise<string | null>;
        getCurrent: () => Promise<string>;
      };
      window: {
        minimize: () => void;
        maximize: () => void;
        close: () => void;
        toggleDevTools: () => void;
      };
      on: (channel: string, callback: (...args: any[]) => void) => void;
      removeAllListeners: (channel: string) => void;
    };
  }
}

export {};