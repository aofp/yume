import React, { useState, useEffect } from 'react';
import { Folder, FolderOpen } from 'lucide-react';
import './FolderSelector.css';

export const FolderSelector: React.FC = () => {
  const [currentFolder, setCurrentFolder] = useState<string>('');
  
  useEffect(() => {
    // Get initial folder
    const getFolder = async () => {
      if (window.electronAPI?.folder?.getCurrent) {
        const folder = await window.electronAPI.folder.getCurrent();
        setCurrentFolder(folder || process.cwd());
      } else {
        setCurrentFolder(process.cwd());
      }
    };
    
    getFolder();
    
    // Listen for folder changes
    if (window.electronAPI?.on) {
      window.electronAPI.on('folder-changed', (newFolder: string) => {
        setCurrentFolder(newFolder);
      });
    }
  }, []);
  
  const handleSelectFolder = async () => {
    if (window.electronAPI?.folder?.select) {
      const newFolder = await window.electronAPI.folder.select();
      if (newFolder) {
        setCurrentFolder(newFolder);
      }
    } else {
      alert('Folder selection requires Electron. Run the app with: npm run electron:dev');
    }
  };
  
  const getFolderName = (path: string) => {
    if (!path) return 'No folder selected';
    const parts = path.split(/[/\\]/);
    return parts[parts.length - 1] || path;
  };
  
  return (
    <div className="folder-selector">
      <button 
        className="folder-selector-button"
        onClick={handleSelectFolder}
        title={currentFolder || 'Select a folder'}
      >
        <FolderOpen size={16} />
        <span className="folder-path">
          {getFolderName(currentFolder)}
        </span>
      </button>
    </div>
  );
};