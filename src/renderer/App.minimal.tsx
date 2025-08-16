import React, { useEffect, useState, useRef } from 'react';
import { TitleBar } from './components/Layout/TitleBar';
import { SessionTabs } from './components/SessionTabs/SessionTabs';
import { ClaudeChat } from './components/Chat/ClaudeChat';
import { WindowControls } from './components/WindowControls/WindowControls';
import { SettingsModal } from './components/Settings/SettingsModal';
import { AboutModal } from './components/About/AboutModal';
import { KeyboardShortcuts } from './components/KeyboardShortcuts/KeyboardShortcuts';
import { ConnectionStatus } from './components/ConnectionStatus/ConnectionStatus';
import { ServerLogs } from './components/ServerLogs/ServerLogs';
import { RecentProjectsModal } from './components/RecentProjectsModal/RecentProjectsModal';
import { useClaudeCodeStore } from './stores/claudeCodeStore';
import { platformBridge } from './services/platformBridge';
import './App.minimal.css';

export const App: React.FC = () => {
  const { currentSessionId, sessions, createSession, setCurrentSession /* , restoreToMessage */ } = useClaudeCodeStore();
  const [showSettings, setShowSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showServerLogs, setShowServerLogs] = useState(false);
  const [showRecentModal, setShowRecentModal] = useState(false);
  // const [showFileChanges, setShowFileChanges] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; isTextInput?: boolean; target?: HTMLElement; isMessageBubble?: boolean; messageElement?: HTMLElement; hasSelection?: boolean; selectedText?: string } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  
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
  
  // Handle global folder drops (for non-Tauri environments)
  const handleGlobalDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    document.body.classList.remove('dragging');
    
    // In Tauri, drops are handled by onDragDropEvent listener
    if (window.__TAURI__) {
      return; // Let Tauri's native drag drop handler handle it
    }
    
    console.log('Global drop event (non-Tauri):', e.dataTransfer);
    
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
    // In Tauri, drag enter/leave is handled by onDragDropEvent
    if (window.__TAURI__) {
      return;
    }
    // Only show drag overlay for file/folder drops, not internal drags
    if (e.dataTransfer.types.includes('Files') && !isDragging) {
      setIsDragging(true);
      document.body.classList.add('dragging');
    }
  };
  
  const handleGlobalDragLeave = (e: React.DragEvent) => {
    // In Tauri, drag enter/leave is handled by onDragDropEvent
    if (window.__TAURI__) {
      return;
    }
    // Only set dragging to false if leaving the window entirely
    if (e.currentTarget === e.target) {
      setIsDragging(false);
      document.body.classList.remove('dragging');
    }
  };
  
  // Handle global event for opening recent projects modal
  useEffect(() => {
    const handleOpenRecentProjects = () => {
      console.log('[App] Received openRecentProjects event');
      setShowRecentModal(true);
    };

    window.addEventListener('openRecentProjects', handleOpenRecentProjects);
    return () => {
      window.removeEventListener('openRecentProjects', handleOpenRecentProjects);
    };
  }, []);

  useEffect(() => {
    console.log('App useEffect running');
    // Set page title
    document.title = 'yurucode';
    
    // Setup Tauri file drop handler
    let unlistenDragDrop: (() => void) | undefined;
    
    if (window.__TAURI__) {
      (async () => {
        try {
          const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
          const appWindow = getCurrentWebviewWindow();
          
          // Listen for drag and drop events
          unlistenDragDrop = await appWindow.onDragDropEvent(async (event) => {
            console.log('Tauri drag drop event:', event);
            
            if (event.payload.type === 'drop') {
              // Always hide overlay on drop, regardless of what was dropped
              setIsDragging(false);
              document.body.classList.remove('dragging');
              
              if (event.payload.paths && event.payload.paths.length > 0) {
                // Process dropped paths
                const filePaths: string[] = [];
                
                for (const path of event.payload.paths) {
                  try {
                    const { invoke } = await import('@tauri-apps/api/core');
                    const isDir = await invoke<boolean>('check_is_directory', { path });
                    
                    if (isDir) {
                      // Folder: create new session
                      console.log('Creating session for dropped folder:', path);
                      const sessionName = path.split(/[/\\]/).pop() || 'new session';
                      await createSession(sessionName, path);
                      return; // Only handle the first folder
                    } else {
                      // File: collect path to insert into textarea
                      filePaths.push(path);
                    }
                  } catch (err) {
                    console.error('Error checking if path is directory:', err);
                  }
                }
                
                // If we have file paths, insert them into the textarea
                if (filePaths.length > 0) {
                  const textarea = document.querySelector('.chat-input') as HTMLTextAreaElement;
                  if (textarea) {
                    const pathsToInsert = filePaths.join('\n');
                    
                    // Insert at cursor position or append
                    const start = textarea.selectionStart;
                    const end = textarea.selectionEnd;
                    const currentValue = textarea.value;
                    
                    const newValue = currentValue.substring(0, start) + 
                                   pathsToInsert + 
                                   currentValue.substring(end);
                    
                    // Use React's native setter to properly update the value
                    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
                    if (nativeInputValueSetter) {
                      nativeInputValueSetter.call(textarea, newValue);
                    }
                    
                    // Trigger React's synthetic event
                    const event = new Event('input', { bubbles: true });
                    textarea.dispatchEvent(event);
                    
                    // Also trigger change event for good measure
                    const changeEvent = new Event('change', { bubbles: true });
                    textarea.dispatchEvent(changeEvent);
                    
                    // Set cursor position after inserted text
                    const newCursorPos = start + pathsToInsert.length;
                    textarea.setSelectionRange(newCursorPos, newCursorPos);
                    
                    // Focus the textarea
                    textarea.focus();
                    
                    console.log('Inserted file paths into textarea:', filePaths);
                  } else {
                    console.error('Could not find textarea with class .chat-input');
                  }
                }
              }
            } else if (event.payload.type === 'enter') {
              setIsDragging(true);
              document.body.classList.add('dragging');
            } else if (event.payload.type === 'leave' || event.payload.type === 'cancel') {
              setIsDragging(false);
              document.body.classList.remove('dragging');
            }
          });
          
          console.log('Tauri drag drop listener registered');
        } catch (err) {
          console.error('Error setting up Tauri drag drop listener:', err);
        }
      })();
    }
    
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
    }
    
    // Cleanup listeners
    return () => {
      // Cleanup Tauri drag drop listener
      if (unlistenDragDrop) {
        unlistenDragDrop();
      }
      
      // Cleanup Electron listeners
      if (window.electronAPI?.off) {
        window.electronAPI.off('initial-directory', handleInitialDirectory);
        window.electronAPI.off('folder-changed', handleFolderChanged);
        window.electronAPI.off('show-help-modal', () => setShowHelpModal(true));
      }
    };
  }, [createSession, setIsDragging]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // F12 for DevTools
      if (e.key === 'F12') {
        e.preventDefault();
        console.log('F12 pressed - attempting to open DevTools');
        
        // In Tauri, invoke the toggle_devtools command
        if (window.__TAURI__) {
          import('@tauri-apps/api/core').then(({ invoke }) => {
            invoke('toggle_devtools').then(() => {
              console.log('DevTools toggled');
            }).catch(err => {
              console.error('Failed to toggle devtools:', err);
            });
          });
        }
      }
      
      // Ctrl+Shift+C to toggle console visibility (debug builds only)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        console.log('Toggle console visibility requested');
        
        if (window.__TAURI__) {
          import('@tauri-apps/api/core').then(({ invoke }) => {
            invoke('toggle_console_visibility').then((message: string) => {
              console.log('Console visibility toggled:', message);
              // Could show a toast notification here
            }).catch(err => {
              console.error('Failed to toggle console:', err);
            });
          });
        }
      }
      
      // Ctrl+1/2/3... for tab switching
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        const tabNumber = parseInt(e.key);
        if (tabNumber >= 1 && tabNumber <= 9 && sessions.length >= tabNumber) {
          e.preventDefault();
          const targetSession = sessions[tabNumber - 1];
          if (targetSession) {
            setCurrentSession(targetSession.id);
          }
        }
      }
      
      // Ctrl+R for recent projects
      if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
        e.preventDefault();
        const stored = localStorage.getItem('yurucode-recent-projects');
        if (stored) {
          try {
            const projects = JSON.parse(stored);
            if (projects && projects.length > 0) {
              setShowRecentModal(true);
            }
          } catch (err) {
            console.error('Failed to parse recent projects:', err);
          }
        }
      }
      
      // Ctrl+, for settings
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setShowSettings(true);
      }
      
      // Ctrl+Shift+L for server logs
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'L') {
        e.preventDefault();
        setShowServerLogs(prev => !prev);
      }
      
      // ? for keyboard shortcuts (not in input fields)
      if (e.key === '?' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        setShowHelpModal(prev => !prev);
      }
      // Escape to close help modal or server logs
      if (e.key === 'Escape') {
        if (showHelpModal) {
          e.preventDefault();
          setShowHelpModal(false);
        }
        if (showServerLogs) {
          e.preventDefault();
          setShowServerLogs(false);
        }
      }
      
      // Zoom controls
      if (e.ctrlKey || e.metaKey) {
        // Debug log
        console.log('Zoom key detected:', e.key, 'ctrlKey:', e.ctrlKey, 'metaKey:', e.metaKey);
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          console.log('Zooming in...');
          await platformBridge.zoom.in();
        } else if (e.key === '-' || e.key === '_') {
          e.preventDefault();
          console.log('Zooming out...');
          await platformBridge.zoom.out();
        } else if (e.key === '0') {
          e.preventDefault();
          console.log('Resetting zoom...');
          await platformBridge.zoom.reset();
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
  }, [showHelpModal, showServerLogs, sessions, setCurrentSession]);

  // Apply accent color, zoom level, and window state from localStorage on mount
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
    
    // Restore window size and position if in Tauri
    if ((window as any).__TAURI__) {
      const restoreWindowState = async () => {
        try {
          const tauriWindow = await import('@tauri-apps/api/window');
          const appWindow = tauriWindow.getCurrentWindow();
          
          // Restore size
          const savedWidth = localStorage.getItem('windowWidth');
          const savedHeight = localStorage.getItem('windowHeight');
          if (savedWidth && savedHeight) {
            await appWindow.setSize({
              type: 'Physical',
              width: parseInt(savedWidth),
              height: parseInt(savedHeight)
            });
          }
          
          // Restore position
          const savedX = localStorage.getItem('windowX');
          const savedY = localStorage.getItem('windowY');
          if (savedX && savedY) {
            await appWindow.setPosition({
              type: 'Physical',
              x: parseInt(savedX),
              y: parseInt(savedY)
            });
          }
          
          // Listen for window events to save state
          appWindow.onResized(({ payload: size }) => {
            localStorage.setItem('windowWidth', size.width.toString());
            localStorage.setItem('windowHeight', size.height.toString());
          });
          
          appWindow.onMoved(({ payload: position }) => {
            localStorage.setItem('windowX', position.x.toString());
            localStorage.setItem('windowY', position.y.toString());
          });
        } catch (err) {
          console.error('Failed to restore window state:', err);
        }
      };
      
      restoreWindowState();
    }
  }, []);

  return (
    <div 
      className={`app-minimal ${isDragging ? 'dragging' : ''}`}
      onDrop={handleGlobalDrop}
      onDragOver={handleGlobalDragOver}
      onDragLeave={handleGlobalDragLeave}
      onContextMenu={handleGlobalContextMenu}
    >
      <WindowControls onSettingsClick={() => setShowSettings(true)} onHelpClick={() => setShowHelpModal(true)} />
      <TitleBar onSettingsClick={() => setShowSettings(true)} />
      <SessionTabs />
      <ConnectionStatus />
      {isDragging && (
        <div className="drag-overlay">
          <div className="drag-overlay-content">
            <div className="drag-icon">📁</div>
            <div className="drag-text">drop files to insert paths • folders to create session</div>
          </div>
        </div>
      )}
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
      <ServerLogs isOpen={showServerLogs} onClose={() => setShowServerLogs(false)} />
      <RecentProjectsModal
        isOpen={showRecentModal}
        onClose={() => setShowRecentModal(false)}
        onProjectSelect={(path) => {
          const name = path.split(/[/\\]/).pop() || path;
          createSession(name, path);
        }}
      />
    </div>
  );
};