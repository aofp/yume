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
  const vscodeExtensionEnabled = useClaudeCodeStore(state => state.vscodeExtensionEnabled);
  const hasUpdateAvailable = useClaudeCodeStore(state => state.hasUpdateAvailable);
  const latestVersion = useClaudeCodeStore(state => state.latestVersion);

  console.log('[WindowControls] Render - hasUpdateAvailable:', hasUpdateAvailable, 'latestVersion:', latestVersion);

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

  const handleUpdateClick = async () => {
    const url = 'https://github.com/aofp/yume/releases';
    try {
      if ((window as any).__TAURI__) {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('open_external', { url }).catch(() => {
          window.open(url, '_blank');
        });
      } else {
        window.open(url, '_blank');
      }
    } catch (error) {
      console.error('Failed to open releases page:', error);
      window.open(url, '_blank');
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
        {/* VSCode indicator right after traffic lights on mac (left side) */}
        {vscodeExtensionEnabled && vscodeConnected && (
          <span
            className="vscode-indicator clickable"
            title="vscode extension connected (click to open settings)"
            onClick={onSettingsClick}
          >
            [vscode connected]
          </span>
        )}
        {/* Update indicator */}
        {hasUpdateAvailable && (
          <span
            className="vscode-indicator update-indicator clickable"
            title={`update available: ${latestVersion || 'unknown'} (click to download)`}
            onClick={handleUpdateClick}
          >
            [update available]
          </span>
        )}
        {/* Mac: Menu items to the right of title - projects, analytics, settings, keyboard shortcuts */}
        <div
          className="mac-right-controls"
        >
          {!isExpanded ? (
            <button
              className="window-control-toggle"
              title="expand menu"
            >
              <span className="icon-opacity-50"><IconChevronLeft size={10} stroke={2} /></span>
            </button>
          ) : (
            <>
              {showProjectsMenu && onProjectsClick && (
                <button className="window-control projects" onClick={onProjectsClick} title="projects (cmd+p)">
                  <span className="icon-opacity-50"><IconFolders size={10} stroke={2} /></span>
                </button>
              )}
              {showAgentsMenu && onAgentsClick && (
                <button className="window-control agents" onClick={onAgentsClick} title="agents (cmd+n)">
                  <span className="icon-opacity-50"><IconRobot size={10} stroke={2} /></span>
                </button>
              )}
              {showAnalyticsMenu && onAnalyticsClick && (
                <button className="window-control analytics" onClick={onAnalyticsClick} title="analytics (cmd+y)">
                  <span className="icon-opacity-50"><IconTrendingUp size={10} stroke={2} /></span>
                </button>
              )}
              {onSettingsClick && (
                <button className="window-control settings" onClick={onSettingsClick} title="settings (cmd+,)">
                  <span className="icon-opacity-50"><IconSettingsFilled size={10} /></span>
                </button>
              )}
              <button className="window-control help" onClick={onHelpClick} title="keyboard shortcuts (? or F1)">
                <span className="icon-opacity-50" style={{ fontSize: '10px' }}>?</span>
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // Windows style controls (macOS-style traffic lights on right, menu on left)
  return (
    <div className="windows-window-controls-wrapper">
      {/* Windows: Menu items on the left - projects, analytics, settings, keyboard shortcuts */}
      <div className="windows-left-controls">
        {!isExpanded ? (
          <button
            className="window-control-toggle"
            title="expand menu"
          >
            <span className="icon-opacity-50"><IconChevronRight size={10} stroke={2} /></span>
          </button>
        ) : (
          <>
            {showProjectsMenu && onProjectsClick && (
              <button className="window-control projects" onClick={onProjectsClick} title="projects (ctrl+p)">
                <span className="icon-opacity-50"><IconFolders size={10} stroke={2} /></span>
              </button>
            )}
            {showAgentsMenu && onAgentsClick && (
              <button className="window-control agents" onClick={onAgentsClick} title="agents (ctrl+n)">
                <span className="icon-opacity-50"><IconRobot size={10} stroke={2} /></span>
              </button>
            )}
            {showAnalyticsMenu && onAnalyticsClick && (
              <button className="window-control analytics" onClick={onAnalyticsClick} title="analytics (ctrl+y)">
                <span className="icon-opacity-50"><IconTrendingUp size={10} stroke={2} /></span>
              </button>
            )}
            {onSettingsClick && (
              <button className="window-control settings" onClick={onSettingsClick} title="settings (ctrl+,)">
                <span className="icon-opacity-50"><IconSettingsFilled size={10} /></span>
              </button>
            )}
            <button className="window-control help" onClick={onHelpClick} title="keyboard shortcuts (? or F1)">
              <span className="icon-opacity-50" style={{ fontSize: '10px' }}>?</span>
            </button>
          </>
        )}
      </div>
      {/* Windows traffic light controls on the right (minimize, maximize, close order) */}
      <div className={`windows-controls ${!isWindowFocused ? 'inactive' : ''}`}>
        <button className="windows-control minimize" onClick={handleMinimize}>
          <span className="windows-control-icon">−</span>
        </button>
        <button className="windows-control maximize" onClick={handleMaximize}>
          <span className="windows-control-icon">+</span>
        </button>
        <button className="windows-control close" onClick={handleClose}>
          <span className="windows-control-icon">×</span>
        </button>
      </div>
      {/* VSCode indicator after traffic lights on windows (right side) */}
      {vscodeExtensionEnabled && vscodeConnected && (
        <span
          className="vscode-indicator clickable"
          title="vscode extension connected (click to open settings)"
          onClick={onSettingsClick}
        >
          [vscode connected]
        </span>
      )}
      {/* Update indicator */}
      {hasUpdateAvailable && (
        <span
          className="vscode-indicator update-indicator clickable"
          title={`update available: ${latestVersion || 'unknown'} (click to download)`}
          onClick={handleUpdateClick}
        >
          [update available]
        </span>
      )}
    </div>
  );
};