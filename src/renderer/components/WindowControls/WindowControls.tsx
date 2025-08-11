import React from 'react';
import { IconX, IconMinus, IconSquare, IconSettings, IconHelp } from '@tabler/icons-react';
import './WindowControls.css';

interface WindowControlsProps {
  onSettingsClick?: () => void;
  onHelpClick?: () => void;
}

export const WindowControls: React.FC<WindowControlsProps> = ({ onSettingsClick, onHelpClick }) => {
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
    console.log('Close button clicked');
    console.log('electronAPI available:', !!window.electronAPI);
    console.log('window.close available:', !!window.electronAPI?.window?.close);
    
    if (window.electronAPI?.window?.close) {
      window.electronAPI.window.close();
    } else {
      console.error('electronAPI.window.close not available');
      // Fallback: try to close the window directly
      window.close();
    }
  };

  return (
    <div className="window-controls">
      {onHelpClick && (
        <button className="window-control help" onClick={onHelpClick} title="keyboard shortcuts (?)">
          <IconHelp size={14} stroke={1.5} />
        </button>
      )}
      {onSettingsClick && (
        <button className="window-control settings" onClick={onSettingsClick}>
          <IconSettings size={14} stroke={1.5} />
        </button>
      )}
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