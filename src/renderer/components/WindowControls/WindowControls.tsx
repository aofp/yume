import React from 'react';
import { IconX, IconMinus, IconSquare, IconSettingsFilled, IconHelp } from '@tabler/icons-react';
import './WindowControls.css';

interface WindowControlsProps {
  onSettingsClick?: () => void;
  onHelpClick?: () => void;
}

export const WindowControls: React.FC<WindowControlsProps> = ({ onSettingsClick, onHelpClick }) => {
  // Show on all platforms when using frameless window
  const isMac = navigator.platform.toLowerCase().includes('mac');
  const isWindows = navigator.platform.toLowerCase().includes('win') || 
                   navigator.userAgent.toLowerCase().includes('windows');
  
  console.log('WindowControls platform detection:', {
    platform: navigator.platform,
    userAgent: navigator.userAgent,
    isMac,
    isWindows,
    onHelpClick: !!onHelpClick,
    onSettingsClick: !!onSettingsClick,
    onHelpClickFunc: onHelpClick
  });
  
  // Track window focus state
  const [isWindowFocused, setIsWindowFocused] = React.useState(true);
  
  React.useEffect(() => {
    const handleFocus = () => setIsWindowFocused(true);
    const handleBlur = () => setIsWindowFocused(false);
    
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);
  
  // Always show controls for frameless window
  // if (!isWindows) return null;

  const handleMinimize = async () => {
    try {
      if ((window as any).__TAURI__) {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('minimize_window');
      } else {
        console.error('Tauri API not available for minimize');
      }
    } catch (error) {
      console.error('Failed to minimize window:', error);
    }
  };

  const handleMaximize = async () => {
    try {
      if ((window as any).__TAURI__) {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('maximize_window');
      } else {
        console.error('Tauri API not available for maximize');
      }
    } catch (error) {
      console.error('Failed to maximize window:', error);
    }
  };

  const handleClose = async () => {
    console.log('Close button clicked');
    
    // Use Tauri API to close window
    try {
      if ((window as any).__TAURI__) {
        const { invoke } = await import('@tauri-apps/api/core');
        console.log('Invoking close_window command...');
        await invoke('close_window');
      } else {
        console.error('Tauri API not available');
        // Fallback: try to close the window directly
        window.close();
      }
    } catch (error) {
      console.error('Failed to close window:', error);
      window.close();
    }
  };

  // macOS style traffic lights
  if (isMac) {
    return (
      <div className="mac-window-controls-wrapper">
        <div className={`window-controls mac-controls ${!isWindowFocused ? 'inactive' : ''}`}>
          <button className="mac-control close" onClick={handleClose}>
            <span className="mac-control-icon">×</span>
          </button>
          <button className="mac-control minimize" onClick={handleMinimize}>
            <span className="mac-control-icon">−</span>
          </button>
          <button className="mac-control maximize" onClick={handleMaximize}>
            <span className="mac-control-icon">+</span>
          </button>
        </div>
        <div className="window-controls mac-right-controls">
          <button className="window-control help" onClick={onHelpClick} title="keyboard shortcuts (?)">
            <span style={{ fontSize: '10px' }}>?</span>
          </button>
          {onSettingsClick && (
            <button className="window-control settings" onClick={onSettingsClick} title="settings (cmd+,)">
              <IconSettingsFilled size={10} />
            </button>
          )}
        </div>
      </div>
    );
  }

  // Windows style controls
  return (
    <div className="window-controls">
      <button className="window-control help" onClick={onHelpClick} title="keyboard shortcuts (?)">
        <span style={{ fontSize: '10px' }}>?</span>
      </button>
      {onSettingsClick && (
        <button className="window-control settings" onClick={onSettingsClick} title="settings (ctrl+,)">
          <IconSettingsFilled size={10} />
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