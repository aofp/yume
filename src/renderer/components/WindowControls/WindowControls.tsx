import React from 'react';
import { IconX, IconMinus, IconSquare } from '@tabler/icons-react';
import './WindowControls.css';

export const WindowControls: React.FC = () => {
  // Only show on Windows - check multiple methods
  const isWindows = navigator.platform.toLowerCase().includes('win') || 
                   navigator.userAgent.toLowerCase().includes('windows');
  
  if (!isWindows) return null;

  const handleMinimize = () => {
    window.electronAPI?.window?.minimize();
  };

  const handleMaximize = () => {
    window.electronAPI?.window?.maximize();
  };

  const handleClose = () => {
    window.electronAPI?.window?.close();
  };

  return (
    <div className="window-controls">
      <button className="window-control minimize" onClick={handleMinimize}>
        <IconMinus size={14} stroke={1.5} />
      </button>
      <button className="window-control maximize" onClick={handleMaximize}>
        <IconSquare size={12} stroke={1.5} />
      </button>
      <button className="window-control close" onClick={handleClose}>
        <IconX size={16} stroke={1.5} />
      </button>
    </div>
  );
};