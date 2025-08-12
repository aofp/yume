import React, { useEffect, useState, useRef } from 'react';
// import { IconDiff } from '@tabler/icons-react';
import { TitleBar } from './components/Layout/TitleBar';
import { SessionTabs } from './components/SessionTabs/SessionTabs';
import { ClaudeChat } from './components/Chat/ClaudeChat';
import { WindowControls } from './components/WindowControls/WindowControls';
import { SettingsModal } from './components/Settings/SettingsModal';
import { AboutModal } from './components/About/AboutModal';
import { KeyboardShortcuts } from './components/KeyboardShortcuts/KeyboardShortcuts';
// import { FileChangesSidebar } from './components/FileChanges/FileChangesSidebar';
import { useClaudeCodeStore } from './stores/claudeCodeStore';
import './App.minimal.css';

export const App: React.FC = () => {
  const { currentSessionId, sessions, createSession /* , restoreToMessage */ } = useClaudeCodeStore();
  const [showSettings, setShowSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  // const [showFileChanges, setShowFileChanges] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; isTextInput?: boolean; target?: HTMLElement; isMessageBubble?: boolean; messageElement?: HTMLElement; hasSelection?: boolean; selectedText?: string } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  
  console.log('App component rendering, sessions:', sessions, 'currentSessionId:', currentSessionId);
  
  // Handle global right-click for context menu
  const handleGlobalContextMenu = (e: React.MouseEvent) => {
    // Don't show if right-clicking on certain elements that have their own context menus
    const target = e.target as HTMLElement;
    if (target.closest('.session-tab') || target.closest('.tab-context-menu')) {
      return;
    }
    
    e.preventDefault();
    
    // Check if there's selected text
    const selection = window.getSelection();
    const hasSelection = selection && selection.toString().trim().length > 0;
    const selectedText = hasSelection ? selection.toString() : '';
    
    // Check if target is a textarea or input to show copy/paste options
    const isTextInput = target.tagName === 'TEXTAREA' || target.tagName === 'INPUT';
    
    // Check if target is a message bubble
    const messageBubble = target.closest('.message.user, .message.assistant');
    const isMessageBubble = !!messageBubble;
    const messageElement = messageBubble as HTMLElement;
    
    setContextMenu({ x: e.clientX, y: e.clientY, isTextInput, target, isMessageBubble, messageElement, hasSelection, selectedText });
  };
  
  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };

    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [contextMenu]);
  
  // Handle global folder drops
  const handleGlobalDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    console.log('Global drop event:', e.dataTransfer);
    
    // Try to detect folders using webkitGetAsEntry
    const items = Array.from(e.dataTransfer.items);
    for (const item of items) {
      if (item.kind === 'file') {
        const entry = (item as any).webkitGetAsEntry?.();
        if (entry) {
          console.log('Entry:', entry.name, 'isDirectory:', entry.isDirectory);
          
          if (entry.isDirectory) {
            const file = item.getAsFile();
            const path = (file as any)?.path;
            if (path) {
              console.log('Creating session for folder:', path);
              const sessionName = path.split(/[/\\]/).pop() || 'new session';
              await createSession(sessionName, path);
              return;
            }
          }
        }
      }
    }
    
    // Fallback: Check files array  
    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      console.log('File:', file.name, 'Type:', file.type, 'Size:', file.size, 'Path:', (file as any).path);
      
      const path = (file as any).path;
      if (path && window.electronAPI?.isDirectory) {
        const isDir = window.electronAPI.isDirectory(path);
        if (isDir) {
          console.log('Creating session for folder:', path);
          const sessionName = path.split(/[/\\]/).pop() || 'new session';
          await createSession(sessionName, path);
          return;
        }
      }
    }
  };
  
  const handleGlobalDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };
  
  useEffect(() => {
    console.log('App useEffect running');
    // Set page title
    document.title = 'yurucode';
    
    // Listen for initial directory from command line (only once)
    const handleInitialDirectory = async (directory: string) => {
      console.log('Received initial directory:', directory);
      // DO NOT auto-create sessions - user must click + button
      // Just log the directory for now
      console.log('User can create a session in this directory using the + button');
    };
    
    const handleFolderChanged = (directory: string) => {
      console.log('Folder changed to:', directory);
      // Could update current session's directory here
    };
    
    if (window.electronAPI?.on) {
      window.electronAPI.on('initial-directory', handleInitialDirectory);
      window.electronAPI.on('folder-changed', handleFolderChanged);
      window.electronAPI.on('show-help-modal', () => setShowHelpModal(true));
      
      // Cleanup listeners
      return () => {
        if (window.electronAPI?.off) {
          window.electronAPI.off('initial-directory', handleInitialDirectory);
          window.electronAPI.off('folder-changed', handleFolderChanged);
          window.electronAPI.off('show-help-modal', () => setShowHelpModal(true));
        }
      };
    }
  }, [createSession]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // F12 for DevTools (development mode only)
      if (e.key === 'F12') {
        e.preventDefault();
        // Check if we're in Tauri and in development mode
        if ((window as any).__TAURI__ && import.meta.env.DEV) {
          try {
            const { invoke } = await import('@tauri-apps/api/core');
            // Try to toggle devtools via Tauri command
            await invoke('toggle_devtools').catch(() => {
              // If command doesn't exist, try the window API
              console.log('DevTools toggle not available');
            });
          } catch (err) {
            console.log('F12 pressed but DevTools not available:', err);
          }
        }
      }
      
      // Ctrl+, for settings
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setShowSettings(true);
      }
      // ? for keyboard shortcuts (not in input fields)
      if (e.key === '?' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        setShowHelpModal(prev => !prev);
      }
      // Escape to close help modal
      if (e.key === 'Escape' && showHelpModal) {
        e.preventDefault();
        setShowHelpModal(false);
      }
      
      // Zoom controls
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          if (window.electronAPI?.zoom?.in) {
            await window.electronAPI.zoom.in();
          }
        } else if (e.key === '-' || e.key === '_') {
          e.preventDefault();
          if (window.electronAPI?.zoom?.out) {
            await window.electronAPI.zoom.out();
          }
        } else if (e.key === '0') {
          e.preventDefault();
          if (window.electronAPI?.zoom?.reset) {
            await window.electronAPI.zoom.reset();
          }
        }
      }
      
      // Ctrl+Shift+F for file changes sidebar - DISABLED
      // if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
      //   e.preventDefault();
      //   setShowFileChanges(prev => !prev);
      // }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showHelpModal]);

  // Apply accent color and zoom level from localStorage on mount
  useEffect(() => {
    const savedColor = localStorage.getItem('accentColor') || '#cccccc';
    document.documentElement.style.setProperty('--accent-color', savedColor);
    
    // Convert hex to RGB for rgba() usage
    const hex = savedColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    document.documentElement.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
    
    // Apply saved zoom level
    const savedZoomPercent = localStorage.getItem('zoomPercent') || '100';
    document.body.style.zoom = `${parseInt(savedZoomPercent) / 100}`;
  }, []);

  return (
    <div 
      className="app-minimal"
      onDrop={handleGlobalDrop}
      onDragOver={handleGlobalDragOver}
      onContextMenu={handleGlobalContextMenu}
    >
      <WindowControls onSettingsClick={() => setShowSettings(true)} onHelpClick={() => setShowHelpModal(true)} />
      <TitleBar onSettingsClick={() => setShowSettings(true)} />
      <SessionTabs />
      <div className="app-content">
        <div className="main-chat-area">
          <ClaudeChat />
        </div>
        {/* File changes sidebar - DISABLED
        {showFileChanges && (
          <FileChangesSidebar 
            isOpen={showFileChanges} 
            onToggle={() => setShowFileChanges(!showFileChanges)} 
          />
        )} */}
      </div>
      {/* Floating button - DISABLED
      {!showFileChanges && (
        <button className="floating-file-changes-toggle" onClick={() => setShowFileChanges(true)} title="show file changes">
          <IconDiff size={16} stroke={1.5} />
        </button>
      )} */}
      
      {/* Global Context Menu */}
      {contextMenu && (
        <div 
          ref={contextMenuRef}
          className="global-context-menu"
          style={{ 
            position: 'fixed',
            left: contextMenu.x > window.innerWidth - 180 ? window.innerWidth - 180 : contextMenu.x,
            top: (() => {
              // Calculate menu height based on items
              const hasSelection = contextMenu.hasSelection;
              const hasTextInput = contextMenu.isTextInput;
              const hasMessageBubble = contextMenu.isMessageBubble;
              const itemCount = (hasSelection ? 1 : 0) + (hasTextInput ? 3 : 0) + (hasMessageBubble ? 2 : 0) + 1; // +1 for about
              const menuHeight = itemCount * 32 + 20; // Approximate height
              
              if (contextMenu.y > window.innerHeight - menuHeight) {
                return window.innerHeight - menuHeight - 10;
              }
              return contextMenu.y;
            })(),
            zIndex: 10001
          }}
        >
          {/* Show copy option if text is selected */}
          {contextMenu.hasSelection && (
            <>
              <button 
                className="context-menu-item"
                onClick={() => {
                  if (contextMenu.selectedText) {
                    navigator.clipboard.writeText(contextMenu.selectedText);
                  }
                  setContextMenu(null);
                }}
              >
                copy
              </button>
              {(contextMenu.isTextInput || contextMenu.isMessageBubble) && (
                <div className="context-menu-separator" />
              )}
            </>
          )}
          {contextMenu.isTextInput && (
            <>
              <button 
                className="context-menu-item"
                onClick={() => {
                  const textarea = contextMenu.target as HTMLTextAreaElement | HTMLInputElement;
                  if (textarea && textarea.select) {
                    textarea.focus();
                    document.execCommand('copy');
                  }
                  setContextMenu(null);
                }}
              >
                copy
              </button>
              <button 
                className="context-menu-item"
                onClick={async () => {
                  const textarea = contextMenu.target as HTMLTextAreaElement | HTMLInputElement;
                  if (textarea) {
                    textarea.focus();
                    document.execCommand('paste');
                  }
                  setContextMenu(null);
                }}
              >
                paste
              </button>
              <button 
                className="context-menu-item"
                onClick={() => {
                  const textarea = contextMenu.target as HTMLTextAreaElement | HTMLInputElement;
                  if (textarea && textarea.select) {
                    textarea.focus();
                    textarea.select();
                  }
                  setContextMenu(null);
                }}
              >
                select all
              </button>
            </>
          )}
          {contextMenu.isMessageBubble && (
            <>
              <button 
                className="context-menu-item"
                onClick={() => {
                  // Copy message content
                  if (contextMenu.messageElement) {
                    const messageContent = contextMenu.messageElement.querySelector('.message-content');
                    if (messageContent) {
                      const text = (messageContent as HTMLElement).innerText;
                      navigator.clipboard.writeText(text);
                    }
                  }
                  setContextMenu(null);
                }}
              >
                copy message
              </button>
              {/* Restore functionality - DISABLED
              <button 
                className="context-menu-item"
                onClick={() => {
                  // Restore to this message
                  if (contextMenu.messageElement && currentSessionId) {
                    const messageIndex = contextMenu.messageElement.getAttribute('data-message-index');
                    if (messageIndex) {
                      restoreToMessage(currentSessionId, parseInt(messageIndex));
                    }
                  }
                  setContextMenu(null);
                }}
              >
                restore to here
              </button> */}
            </>
          )}
          {(contextMenu.isTextInput || contextMenu.isMessageBubble) && (
            <div className="context-menu-separator" />
          )}
          <button 
            className="context-menu-item"
            onClick={() => {
              setShowAbout(true);
              setContextMenu(null);
            }}
          >
            about
          </button>
        </div>
      )}
      
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showAbout && <AboutModal isOpen={showAbout} onClose={() => setShowAbout(false)} />}
      {showHelpModal && <KeyboardShortcuts onClose={() => setShowHelpModal(false)} />}
    </div>
  );
};