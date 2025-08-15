import React, { useState, useEffect, useRef } from 'react';
import { IconSettings } from '@tabler/icons-react';
import { AboutModal } from '../About/AboutModal';
import './TitleBar.css';

interface TitleBarProps {
  onSettingsClick: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({ onSettingsClick }) => {
  const [showAboutModal, setShowAboutModal] = useState(false);
  const titlebarRef = useRef<HTMLDivElement>(null);
  
  // Check if we're on Windows (where WindowControls already has the settings button)
  const isWindows = navigator.platform.toLowerCase().includes('win') || 
                   navigator.userAgent.toLowerCase().includes('windows');

  useEffect(() => {
    // Simple drag implementation using onMouseDown
    const handleMouseDown = async (e: MouseEvent) => {
      // Don't drag if clicking on interactive elements
      const target = e.target as HTMLElement;
      if (target.closest('button') || target.closest('input')) {
        return;
      }

      console.log('TitleBar: Mouse down, attempting to drag...');
      
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

    // Add event listener to the element
    const element = titlebarRef.current;
    if (element) {
      element.addEventListener('mousedown', handleMouseDown);
      return () => {
        element.removeEventListener('mousedown', handleMouseDown);
      };
    }
  }, []);

  return (
    <div className="titlebar-wrapper" ref={titlebarRef}>
      <div className="titlebar">
        <div className="titlebar-content">
          <div 
            className="titlebar-logo" 
            onContextMenu={(e) => {
              e.preventDefault();
              setShowAboutModal(true);
            }}
          >
            <span className="titlebar-text" onContextMenu={(e) => e.preventDefault()}>
              yuru&gt;code
            </span>
          </div>
        </div>
        {/* Settings button removed - now in WindowControls */}
      </div>
      <AboutModal isOpen={showAboutModal} onClose={() => setShowAboutModal(false)} />
    </div>
  );
};