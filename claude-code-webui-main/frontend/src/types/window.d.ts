// File System Access API type definitions
declare global {
  interface Window {
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
  }

  interface FileSystemDirectoryHandle {
    readonly kind: "directory";
    readonly name: string;
  }
}

export {};
