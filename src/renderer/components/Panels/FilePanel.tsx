import React from 'react';
import { Folder, File, Search } from 'lucide-react';
import './FilePanel.css';

export const FilePanel: React.FC = () => {
  return (
    <div className="file-panel">
      <div className="file-search">
        <Search size={16} />
        <input type="text" placeholder="Search files..." />
      </div>
      
      <div className="file-tree">
        <div className="file-item">
          <Folder size={16} />
          <span>src</span>
        </div>
        <div className="file-item indented">
          <File size={16} />
          <span>main.ts</span>
        </div>
      </div>
    </div>
  );
};