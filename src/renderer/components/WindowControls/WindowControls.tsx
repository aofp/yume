import React from 'react';
import { IconX, IconMinus, IconSquare, IconSettingsFilled, IconHelp, IconFolders, IconTrendingUp, IconChevronLeft, IconChevronRight, IconRobot } from '@tabler/icons-react';
import { useLicenseStore } from '../../services/licenseManager';
import { useClaudeCodeStore } from '../../stores/claudeCodeStore';
import { isVSCode } from '../../services/tauriApi';
import './WindowControls.css';

interface WindowControlsProps {
  onSettingsClick?: () => void;
  onHelpClick?: () => void;
  onProjectsClick?: () => void;
  onAgentsClick?: () => void;
  onAnalyticsClick?: () => void;
}

export const WindowControls: React.FC<WindowControlsProps> = ({ onSettingsClick, onHelpClick, onProjectsClick, onAgentsClick, onAnalyticsClick }) => {
  // Show on all platforms when using frameless window
  const isMac = navigator.platform.toLowerCase().includes('mac');
  const isWindows = navigator.platform.toLowerCase().includes('win') ||
                   navigator.userAgent.toLowerCase().includes('windows');

  const { isLicensed } = useLicenseStore();
  const isDraggingTab = useClaudeCodeStore(state => state.isDraggingTab);
  const showProjectsMenu = useClaudeCodeStore(state => state.showProjectsMenu);
  const showAgentsMenu = useClaudeCodeStore(state => state.showAgentsMenu);
  const showAnalyticsMenu = useClaudeCodeStore(state => state.showAnalyticsMenu);
  const vscodeConnected = useClaudeCodeStore(state => state.vscodeConnected);
  
  // Removed spammy platform detection log
  
  // Track window focus state
  const [isWindowFocused, setIsWindowFocused] = React.useState(true);
  
  // Track expanded/collapsed state
  const [isExpanded, setIsExpanded] = React.useState(false);
  const [mousePosition, setMousePosition] = React.useState({ x: 0, y: 0 });
  
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
  
  // Track mouse position to detect when in trigger zone
  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const windowWidth = window.innerWidth;
      const x = e.clientX;
      const y = e.clientY;

      // Get current zoom level from body style (default to 1 if not set)
      const bodyZoom = document.body.style.zoom;
      const zoomLevel = bodyZoom ? parseFloat(bodyZoom) : 1;

      // Calculate trigger zone height adjusted for zoom
      // The title bar is visually 28px, and clientY is in zoomed coordinates
      // So we need to multiply by zoom level to get the correct threshold
      const triggerZoneHeight = 28 * zoomLevel;

      // Check if in trigger zone (top 28px height for title bar area, adjusted for zoom)
      // Don't open menu if dragging a tab
      if (y <= triggerZoneHeight && !isDraggingTab) {
        if (isMac) {
          // macOS: right 1/3 of window
          if (x >= windowWidth * 0.67) {
            setIsExpanded(true);
          } else {
            setIsExpanded(false);
          }
        } else {
          // Windows/Linux: left 1/3 of window
          if (x <= windowWidth * 0.33) {
            setIsExpanded(true);
          } else {
            setIsExpanded(false);
          }
        }
      } else {
        setIsExpanded(false);
      }
      
      setMousePosition({ x, y });
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [isMac, isDraggingTab]);
  
  // Hide all controls in VSCode mode - VSCode has its own window chrome
  if (isVSCode()) {
    return null;
  }

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
        <div className={`mac-controls ${!isWindowFocused ? 'inactive' : ''}`}>
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
        {/* Mac: Menu items to the right of title - projects, analytics, settings, keyboard shortcuts */}
        <div
          className="mac-right-controls"
        >
          {vscodeConnected && (
            <span className="vscode-indicator" title="vscode extension connected">
              [vscode connected]
            </span>
          )}
          {!isExpanded ? (
            <button
              className="window-control-toggle"
              title="expand menu"
            >
              <IconChevronLeft size={10} stroke={2} />
            </button>
          ) : (
            <>
              {showProjectsMenu && onProjectsClick && (
                <button className="window-control projects" onClick={onProjectsClick} title="projects (cmd+p)">
                  <IconFolders size={10} stroke={2} />
                </button>
              )}
              {showAgentsMenu && onAgentsClick && (
                <button className="window-control agents" onClick={onAgentsClick} title="agents (cmd+n)">
                  <IconRobot size={10} stroke={2} />
                </button>
              )}
              {showAnalyticsMenu && onAnalyticsClick && (
                <button className="window-control analytics" onClick={onAnalyticsClick} title="analytics (cmd+y)">
                  <IconTrendingUp size={10} stroke={2} />
                </button>
              )}
              {onSettingsClick && (
                <button className="window-control settings" onClick={onSettingsClick} title="settings (cmd+,)">
                  <IconSettingsFilled size={10} />
                </button>
              )}
              <button className="window-control help" onClick={onHelpClick} title="keyboard shortcuts (? or F1)">
                <span style={{ fontSize: '10px' }}>?</span>
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // Windows style controls
  return (
    <div className="window-controls">
      {/* Windows: Menu items on the left - projects, analytics, settings, keyboard shortcuts */}
      <div
        className="windows-left-controls"
      >
        {vscodeConnected && (
          <span className="vscode-indicator" title="vscode extension connected">
            [vscode connected]
          </span>
        )}
        {!isExpanded ? (
          <button
            className="window-control-toggle"
            title="expand menu"
          >
            <IconChevronRight size={10} stroke={2} />
          </button>
        ) : (
          <>
            {showProjectsMenu && onProjectsClick && (
              <button className="window-control projects" onClick={onProjectsClick} title="projects (ctrl+p)">
                <IconFolders size={10} stroke={2} />
              </button>
            )}
            {showAgentsMenu && onAgentsClick && (
              <button className="window-control agents" onClick={onAgentsClick} title="agents (ctrl+n)">
                <IconRobot size={10} stroke={2} />
              </button>
            )}
            {showAnalyticsMenu && onAnalyticsClick && (
              <button className="window-control analytics" onClick={onAnalyticsClick} title="analytics (ctrl+y)">
                <IconTrendingUp size={10} stroke={2} />
              </button>
            )}
            {onSettingsClick && (
              <button className="window-control settings" onClick={onSettingsClick} title="settings (ctrl+,)">
                <IconSettingsFilled size={10} />
              </button>
            )}
            <button className="window-control help" onClick={onHelpClick} title="keyboard shortcuts (? or F1)">
              <span style={{ fontSize: '10px' }}>?</span>
            </button>
          </>
        )}
      </div>
      {/* Spacer to push window controls to the right */}
      <div className="window-controls-spacer" />
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