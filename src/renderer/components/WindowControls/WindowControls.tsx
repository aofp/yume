import React from 'react';
import { IconX, IconMinus, IconSquare, IconSettingsFilled, IconHelp, IconFolder, IconTrendingUp, IconChevronLeft, IconChevronRight, IconRobot } from '@tabler/icons-react';
import { useLicenseStore } from '../../services/licenseManager';
import { useClaudeCodeStore } from '../../stores/claudeCodeStore';
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
      
      // Check if in trigger zone (top 28px height for title bar area)
      // Don't open menu if dragging a tab
      if (y <= 28 && !isDraggingTab) {
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
          {!isExpanded ? (
            <button 
              className="window-control-toggle" 
              title="expand menu"
            >
              <IconChevronLeft size={10} stroke={2} />
            </button>
          ) : (
            <>
              {!isLicensed && (
                <button 
                  className="trial-indicator" 
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('showUpgradeModal', { 
                      detail: { reason: 'trial' } 
                    }));
                  }}
                  style={{ 
                    color: '#666666', 
                    fontSize: '10px',
                    fontWeight: 'normal',
                    padding: '0 6px',
                    opacity: 0.8,
                    background: 'transparent',
                    border: 'none',
                    cursor: 'default',
                    transition: 'color 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-color)'}
                  onMouseLeave={(e) => e.currentTarget.style.color = '#666666'}
                  title="click to upgrade"
                >
                  trial
                </button>
              )}
              {onProjectsClick && (
                <button className="window-control projects" onClick={onProjectsClick} title="projects (cmd+p)">
                  <IconFolder size={10} stroke={2} />
                </button>
              )}
              {onAgentsClick && (
                <button className="window-control agents" onClick={onAgentsClick} title="agents (cmd+g)">
                  <IconRobot size={10} stroke={2} />
                </button>
              )}
              {onAnalyticsClick && (
                <button className="window-control analytics" onClick={onAnalyticsClick} title="analytics (cmd+y)">
                  <IconTrendingUp size={10} stroke={2} />
                </button>
              )}
              {onSettingsClick && (
                <button className="window-control settings" onClick={onSettingsClick} title="settings (cmd+,)">
                  <IconSettingsFilled size={10} />
                </button>
              )}
              <button className="window-control help" onClick={onHelpClick} title="keyboard shortcuts (?)">
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
        {!isExpanded ? (
          <button 
            className="window-control-toggle" 
            title="expand menu"
          >
            <IconChevronRight size={10} stroke={2} />
          </button>
        ) : (
          <>
            {onProjectsClick && (
              <button className="window-control projects" onClick={onProjectsClick} title="projects (ctrl+p)">
                <IconFolder size={10} stroke={2} />
              </button>
            )}
            {onAgentsClick && (
              <button className="window-control agents" onClick={onAgentsClick} title="agents (ctrl+g)">
                <IconRobot size={10} stroke={2} />
              </button>
            )}
            {onAnalyticsClick && (
              <button className="window-control analytics" onClick={onAnalyticsClick} title="analytics (ctrl+y)">
                <IconTrendingUp size={10} stroke={2} />
              </button>
            )}
            {onSettingsClick && (
              <button className="window-control settings" onClick={onSettingsClick} title="settings (ctrl+,)">
                <IconSettingsFilled size={10} />
              </button>
            )}
            <button className="window-control help" onClick={onHelpClick} title="keyboard shortcuts (?)">
              <span style={{ fontSize: '10px' }}>?</span>
            </button>
            {!isLicensed && (
              <button 
                className="trial-indicator" 
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('showUpgradeModal', { 
                    detail: { reason: 'trial' } 
                  }));
                }}
                style={{ 
                  color: '#666666', 
                  fontSize: '10px',
                  fontWeight: 'normal',
                  padding: '0 6px',
                  opacity: 1,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'default',
                  transition: 'color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-color)'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#666666'}
                title="click to upgrade"
              >
                trial
              </button>
            )}
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