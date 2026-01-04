import React, { useState, useEffect, useRef } from 'react';
import { IconSettings } from '@tabler/icons-react';
import { AboutModal } from '../About/AboutModal';
import './TitleBar.css';

interface TitleBarProps {
  onSettingsClick: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({ onSettingsClick }) => {
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [isWindowActive, setIsWindowActive] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const titlebarRef = useRef<HTMLDivElement>(null);
  
  // Platform detection
  const isWindows = navigator.platform.toLowerCase().includes('win') || 
                   navigator.userAgent.toLowerCase().includes('windows');
  const isMac = navigator.platform.toLowerCase().includes('mac');

  useEffect(() => {
    // Simple drag implementation using onMouseDown
    const handleMouseDown = async (e: MouseEvent) => {
      // Don't drag if clicking on interactive elements
      const target = e.target as HTMLElement;
      if (target.closest('button') || target.closest('input')) {
        return;
      }

      console.log('TitleBar: Mouse down, attempting to drag...');
      setIsDragging(true);

      try {
        if ((window as any).__TAURI__) {
          // Import the window module and check what's available
          const windowApi = await import('@tauri-apps/api/window');
          console.log('TitleBar: Window API exports:', Object.keys(windowApi));
          
          // Try different approaches based on what's available
          let appWindow;
          if (windowApi.getCurrent) {
            appWindow = windowApi.getCurrent();
          } else if (windowApi.appWindow) {
            appWindow = windowApi.appWindow;
          } else if (windowApi.Window?.getCurrent) {
            appWindow = windowApi.Window.getCurrent();
          } else {
            // Try the default export
            const defaultExport = (windowApi as any).default;
            if (defaultExport?.getCurrent) {
              appWindow = defaultExport.getCurrent();
            } else if (defaultExport?.appWindow) {
              appWindow = defaultExport.appWindow;
            }
          }
          
          if (appWindow) {
            console.log('TitleBar: Got appWindow:', appWindow);
            await appWindow.startDragging();
            console.log('TitleBar: Drag started successfully');
          } else {
            console.error('TitleBar: Could not get app window from API');
          }
        } else {
          console.log('TitleBar: Tauri not available');
        }
      } catch (error) {
        console.error('TitleBar: Error starting drag:', error);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    // Add event listener to the element
    const element = titlebarRef.current;
    if (element) {
      element.addEventListener('mousedown', handleMouseDown);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        element.removeEventListener('mousedown', handleMouseDown);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, []);

  // Track window focus state
  useEffect(() => {
    const handleFocus = () => setIsWindowActive(true);
    const handleBlur = () => setIsWindowActive(false);
    
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    
    // Check if window is currently focused
    setIsWindowActive(document.hasFocus());
    
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  return (
    <div className={`titlebar-wrapper${isDragging ? ' is-dragging' : ''}`} ref={titlebarRef}>
      <div className="titlebar">
        <div className="titlebar-content">
          {/* Center the title */}
          <div 
            className="titlebar-logo centered" 
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!showAboutModal) {
                setShowAboutModal(true);
              }
            }}
          >
            <span className="titlebar-text">
              y<span style={{ color: isWindowActive ? 'var(--accent-color)' : undefined }}>&gt;</span>
            </span>
          </div>
        </div>
      </div>
      <AboutModal 
        isOpen={showAboutModal} 
        onClose={() => setShowAboutModal(false)} 
        onShowUpgrade={() => {
          // Close AboutModal first, then show UpgradeModal
          setShowAboutModal(false);
          // Small delay to ensure AboutModal closes before UpgradeModal opens
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('showUpgradeModal', { 
              detail: { reason: 'trial' } 
            }));
          }, 100);
        }}
      />
    </div>
  );
};