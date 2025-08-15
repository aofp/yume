declare global {
  interface Window {
    __TAURI__?: any;
    __tauriCheckLogged?: boolean;
    electronAPI?: any;
  }
}

export {};