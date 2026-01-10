import React, { useEffect, useState, useRef, Suspense } from 'react';
import { ClaudeChat } from './components/Chat/ClaudeChat';
import { ClaudeNotDetected } from './components/ClaudeNotDetected/ClaudeNotDetected';
import { DEFAULT_COLORS } from './config/themes';

// Critical path components - loaded immediately (no lazy loading to prevent flash)
import { TitleBar } from './components/Layout/TitleBar';
import { SessionTabs } from './components/SessionTabs/SessionTabs';
import { WindowControls } from './components/WindowControls/WindowControls';
import { ConnectionStatus } from './components/ConnectionStatus/ConnectionStatus';

// PERFORMANCE: Lazy load modals - only loaded when user opens them
const SettingsModalTabbed = React.lazy(() => import('./components/Settings/SettingsModalTabbed').then(m => ({ default: m.SettingsModalTabbed })));
const AboutModal = React.lazy(() => import('./components/About/AboutModal').then(m => ({ default: m.AboutModal })));
const AnalyticsModal = React.lazy(() => import('./components/Analytics/AnalyticsModal').then(m => ({ default: m.AnalyticsModal })));
const KeyboardShortcuts = React.lazy(() => import('./components/KeyboardShortcuts/KeyboardShortcuts').then(m => ({ default: m.KeyboardShortcuts })));
const RecentProjectsModal = React.lazy(() => import('./components/RecentProjectsModal/RecentProjectsModal').then(m => ({ default: m.RecentProjectsModal })));
const ProjectsModal = React.lazy(() => import('./components/ProjectsModal/ProjectsModal').then(m => ({ default: m.ProjectsModal })));
const AgentsModal = React.lazy(() => import('./components/AgentsModal/AgentsModal').then(m => ({ default: m.AgentsModal })));
const UpgradeModal = React.lazy(() => import('./components/Upgrade/UpgradeModal').then(m => ({ default: m.UpgradeModal })));
import { useClaudeCodeStore } from './stores/claudeCodeStore';
import { useLicenseStore } from './services/licenseManager';
import { platformBridge } from './services/platformBridge';
import { claudeCodeClient } from './services/claudeCodeClient';
import { systemPromptService } from './services/systemPromptService';
import ErrorBoundary from './components/common/ErrorBoundary';
import './App.minimal.css';

export const App: React.FC = () => {
  const { currentSessionId, sessions, createSession, setCurrentSession, loadSessionMappings, monoFont, sansFont, rememberTabs, restoreTabs, backgroundOpacity, setBackgroundOpacity /* , restoreToMessage */ } = useClaudeCodeStore();
  const [showSettings, setShowSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showRecentModal, setShowRecentModal] = useState(false);
  const [showProjectsModal, setShowProjectsModal] = useState(false);
  const [showAgentsModal, setShowAgentsModal] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [analyticsProject, setAnalyticsProject] = useState<string | undefined>(undefined);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<'tabLimit' | 'feature' | 'trial'>('tabLimit');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; isTextInput?: boolean; target?: HTMLElement; isMessageBubble?: boolean; messageElement?: HTMLElement; hasSelection?: boolean; selectedText?: string } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [claudeNotDetected, setClaudeNotDetected] = useState(false);
  const [connectionCheckDone, setConnectionCheckDone] = useState(false);
  const [appReady, setAppReady] = useState(false);

  console.log('App component rendering, sessions:', sessions, 'currentSessionId:', currentSessionId);
  
  // Load session mappings and initialize fonts on startup
  useEffect(() => {
    loadSessionMappings();

    // Sync yurucode agents to ~/.claude/agents/ based on settings
    systemPromptService.syncAgentsToFilesystem();

    // Check Claude CLI connection with adaptive polling
    // Minimum 300ms delay ensures CSS is loaded and prevents flash
    const startTime = Date.now();
    const minLoadTime = 300;
    let connectionAttempts = 0;
    const maxAttempts = 30;

    const showApp = () => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, minLoadTime - elapsed);

      // Ensure minimum load time to prevent flash
      setTimeout(() => {
        setConnectionCheckDone(true);
        setAppReady(true);
      }, remaining);
    };

    const checkConnection = () => {
      connectionAttempts++;
      if (claudeCodeClient.isConnected()) {
        console.log('[App] Server connected after', connectionAttempts, 'attempts');
        showApp();
        return;
      }

      if (connectionAttempts >= maxAttempts) {
        console.error('Claude CLI not detected - unable to connect to server');
        setClaudeNotDetected(true);
        showApp(); // Still show app, just with error
        return;
      }

      // Adaptive delay: start fast, slow down if not connecting
      const delay = connectionAttempts < 10 ? 100 : connectionAttempts < 20 ? 200 : 300;
      setTimeout(checkConnection, delay);
    };

    // Start connection checking after a brief initial delay
    const initialCheck = setTimeout(checkConnection, 50);
    
    // Apply saved fonts from store (store loads from localStorage)
    if (monoFont) {
      document.documentElement.style.setProperty('--font-mono', `"${monoFont}", monospace`);
    }
    if (sansFont) {
      document.documentElement.style.setProperty('--font-sans', `"${sansFont}", sans-serif`);
    }
    
    // Apply saved background opacity and signal app is loaded
    const savedOpacity = localStorage.getItem('yurucode-bg-opacity');
    if (savedOpacity) {
      const opacity = Number(savedOpacity);
      if (!isNaN(opacity) && opacity >= 50 && opacity <= 100) {
        setBackgroundOpacity(opacity);
      }
    } else {
      // Initialize with default
      setBackgroundOpacity(100);
    }

    // Signal that app is fully loaded - stops the loading animation
    // and applies the user's saved opacity setting
    (window as any).__YURUCODE_LOADED__ = true;

    // Apply the target opacity now that app is loaded
    // Use document.documentElement.style.opacity for actual transparency effect
    // This works on both Windows and macOS
    const targetOpacity = (window as any).__YURUCODE_TARGET_OPACITY__ || 0.8;
    document.documentElement.style.opacity = String(targetOpacity);
    console.log('[App] Loaded - applied target opacity:', targetOpacity);
    
    return () => clearTimeout(initialCheck);
  }, [loadSessionMappings, monoFont, sansFont, setBackgroundOpacity]);

  // Cleanup yurucode agents from ~/.claude/agents/ on app exit
  // Only removes files if no other yurucode instances are running
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Fire and forget - we can't await in beforeunload
      systemPromptService.cleanupAgentsOnExit();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Also call cleanup when component unmounts
      systemPromptService.cleanupAgentsOnExit();
    };
  }, []);

  // Restore tabs after store is hydrated from persistence
  useEffect(() => {
    // Small delay to ensure store is fully hydrated from persistence
    const timer = setTimeout(() => {
      if (rememberTabs) {
        console.log('[App] Remember tabs is enabled, restoring tabs...');
        restoreTabs();
      }
    }, 100);
    return () => clearTimeout(timer);
    // Only run on mount, not when rememberTabs changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  // Listen for upgrade modal events
  useEffect(() => {
    const handleShowUpgrade = (e: CustomEvent) => {
      setUpgradeReason(e.detail?.reason || 'tabLimit');
      setShowUpgradeModal(true);
    };

    window.addEventListener('showUpgradeModal', handleShowUpgrade as EventListener);
    return () => {
      window.removeEventListener('showUpgradeModal', handleShowUpgrade as EventListener);
    };
  }, []);

  // Listen for help modal events (from ClaudeChat ? key)
  useEffect(() => {
    const handleShowHelp = () => setShowHelpModal(true);
    window.addEventListener('showHelpModal', handleShowHelp);
    return () => window.removeEventListener('showHelpModal', handleShowHelp);
  }, []);

  // Listen for trial instance blocked event from Rust backend
  useEffect(() => {
    if (!window.__TAURI__) return;

    let unlisten: (() => void) | undefined;

    (async () => {
      const { listen } = await import('@tauri-apps/api/event');
      unlisten = await listen('trial-instance-blocked', () => {
        // Show toast notification that trial mode only allows one instance
        const toast = document.createElement('div');
        toast.className = 'trial-blocked-toast';
        toast.innerHTML = `
          <div class="trial-blocked-toast-content">
            <span>yurucode trial permits only one window</span>
          </div>
        `;
        document.body.appendChild(toast);

        // Auto-remove after 5 seconds
        setTimeout(() => {
          toast.classList.add('fade-out');
          setTimeout(() => toast.remove(), 300);
        }, 5000);
      });
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);
  
  // Handle global right-click for context menu
  const handleGlobalContextMenu = (e: React.MouseEvent) => {
    // Don't show if right-clicking on certain elements that have their own context menus
    const target = e.target as HTMLElement;
    if (target.closest('.session-tab') || target.closest('.tab-context-menu') || target.closest('.model-selector')) {
      return;
    }
    
    // Don't show context menu if About modal is open
    if (showAbout) {
      e.preventDefault();
      return;
    }
    
    e.preventDefault();
    
    // Check if there's selected text
    const selection = window.getSelection();
    const hasSelection = !!(selection && selection.toString().trim().length > 0);
    const selectedText = hasSelection ? selection!.toString() : '';
    
    // Check if target is a textarea or input to show copy/paste options
    const isTextInput = target.tagName === 'TEXTAREA' || target.tagName === 'INPUT';
    
    // Check if target is a message bubble
    const messageBubble = target.closest('.message.user, .message.assistant');
    const isMessageBubble = !!messageBubble;
    const messageElement = messageBubble as HTMLElement;
    
    // Adjust for zoom level
    const zoomLevel = parseFloat(document.body.style.zoom || '1');
    const adjustedX = e.clientX / zoomLevel;
    const adjustedY = e.clientY / zoomLevel;
    
    setContextMenu({ x: adjustedX, y: adjustedY, isTextInput, target, isMessageBubble, messageElement, hasSelection, selectedText });
  };
  
  // Close context menu when clicking outside or scrolling
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    
    const handleScroll = () => {
      setContextMenu(null);
    };

    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      // Add scroll listener to catch all scroll events anywhere
      window.addEventListener('scroll', handleScroll, true); // true for capture phase
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        window.removeEventListener('scroll', handleScroll, true);
      };
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

                      // Add to recent projects
                      const newProject = { path, name: sessionName, lastOpened: Date.now(), accessCount: 1 };
                      const stored = localStorage.getItem('yurucode-recent-projects');
                      let recentProjects = [];
                      try {
                        if (stored) {
                          recentProjects = JSON.parse(stored);
                        }
                      } catch (e) {
                        console.error('Failed to parse recent projects:', e);
                      }
                      const updated = [
                        newProject,
                        ...recentProjects.filter((p: any) => p.path !== path)
                      ].slice(0, 10);
                      localStorage.setItem('yurucode-recent-projects', JSON.stringify(updated));

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
            } else {
              // leave, cancel, over - hide overlay
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

    // Stable reference for help modal handler to ensure proper cleanup
    const handleShowHelpModal = () => setShowHelpModal(true);

    if (window.electronAPI?.on) {
      window.electronAPI.on('initial-directory', handleInitialDirectory);
      window.electronAPI.on('folder-changed', handleFolderChanged);
      window.electronAPI.on('show-help-modal', handleShowHelpModal);
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
        window.electronAPI.off('show-help-modal', handleShowHelpModal);
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
            invoke<string>('toggle_console_visibility').then((message) => {
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
      
      // Ctrl+Shift+R for resume conversation (when no chats in current session)
      // Must be checked BEFORE Ctrl+R to ensure shift variant is caught first
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        // Dispatch custom event for ClaudeChat to handle
        window.dispatchEvent(new CustomEvent('yurucode-trigger-resume'));
        return;
      }

      // Ctrl+R for recent projects
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r' && !e.shiftKey) {
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
      
      // Ctrl+J for claude sessions browser
      if ((e.ctrlKey || e.metaKey) && e.key === 'j') {
        e.preventDefault();
        setShowProjectsModal(true);
      }

      // Ctrl+P for command palette (TODO: implement)
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        // TODO: setShowCommandPalette(true);
        console.log('Command palette - coming soon');
      }
      
      // Ctrl+N for agents modal
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        setShowAgentsModal(true);
      }
      
      // Ctrl+, for settings (toggle)
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setShowSettings(prev => !prev);
      }
      
      // Ctrl+Y for analytics
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        setAnalyticsProject(undefined); // Reset to all analytics
        setShowAnalytics(true);
      }
      
      // ? for keyboard shortcuts (not in input fields)
      if (e.key === '?' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        setShowHelpModal(prev => !prev);
      }
      // Escape or Backspace to close modals (when not typing)
      if (e.key === 'Escape' || (e.key === 'Backspace' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName))) {
        // Close modals in priority order
        if (showHelpModal) {
          e.preventDefault();
          setShowHelpModal(false);
        } else if (showAbout) {
          e.preventDefault();
          setShowAbout(false);
        } else if (showSettings) {
          e.preventDefault();
          setShowSettings(false);
        } else if (showRecentModal) {
          e.preventDefault();
          setShowRecentModal(false);
        } else if (showProjectsModal) {
          e.preventDefault();
          setShowProjectsModal(false);
        } else if (showAgentsModal) {
          e.preventDefault();
          setShowAgentsModal(false);
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
  }, [showHelpModal, showAbout, showSettings, showRecentModal, showProjectsModal, sessions, setCurrentSession]);

  // Apply theme colors, zoom level, and window state from localStorage on mount
  useEffect(() => {
    // Apply background color
    // Note: --background-color is the theme color for UI elements (always the actual color)
    // --bg-color is the body background (transparent on Windows for WebView2, set in index.html)
    const savedBackgroundColor = localStorage.getItem('backgroundColor') || DEFAULT_COLORS.background;
    document.documentElement.style.setProperty('--background-color', savedBackgroundColor);

    // Still set the RGB values for use in rgba() calculations
    const bgHex = savedBackgroundColor.replace('#', '');
    const bgR = parseInt(bgHex.substr(0, 2), 16);
    const bgG = parseInt(bgHex.substr(2, 2), 16);
    const bgB = parseInt(bgHex.substr(4, 2), 16);
    document.documentElement.style.setProperty('--background-rgb', `${bgR}, ${bgG}, ${bgB}`);

    // Apply foreground color
    const savedForegroundColor = localStorage.getItem('foregroundColor') || DEFAULT_COLORS.foreground;
    document.documentElement.style.setProperty('--foreground-color', savedForegroundColor);
    const fgHex = savedForegroundColor.replace('#', '');
    const fgR = parseInt(fgHex.substr(0, 2), 16);
    const fgG = parseInt(fgHex.substr(2, 2), 16);
    const fgB = parseInt(fgHex.substr(4, 2), 16);
    document.documentElement.style.setProperty('--foreground-rgb', `${fgR}, ${fgG}, ${fgB}`);

    // Apply accent color
    const savedAccentColor = localStorage.getItem('accentColor') || DEFAULT_COLORS.accent;
    document.documentElement.style.setProperty('--accent-color', savedAccentColor);
    const accentHex = savedAccentColor.replace('#', '');
    const accentR = parseInt(accentHex.substr(0, 2), 16);
    const accentG = parseInt(accentHex.substr(2, 2), 16);
    const accentB = parseInt(accentHex.substr(4, 2), 16);
    document.documentElement.style.setProperty('--accent-rgb', `${accentR}, ${accentG}, ${accentB}`);

    // Apply positive color
    const savedPositiveColor = localStorage.getItem('positiveColor') || DEFAULT_COLORS.positive;
    document.documentElement.style.setProperty('--positive-color', savedPositiveColor);
    const positiveHex = savedPositiveColor.replace('#', '');
    const positiveR = parseInt(positiveHex.substr(0, 2), 16);
    const positiveG = parseInt(positiveHex.substr(2, 2), 16);
    const positiveB = parseInt(positiveHex.substr(4, 2), 16);
    document.documentElement.style.setProperty('--positive-rgb', `${positiveR}, ${positiveG}, ${positiveB}`);

    // Apply negative color
    const savedNegativeColor = localStorage.getItem('negativeColor') || DEFAULT_COLORS.negative;
    document.documentElement.style.setProperty('--negative-color', savedNegativeColor);
    const negativeHex = savedNegativeColor.replace('#', '');
    const negativeR = parseInt(negativeHex.substr(0, 2), 16);
    const negativeG = parseInt(negativeHex.substr(2, 2), 16);
    const negativeB = parseInt(negativeHex.substr(4, 2), 16);
    document.documentElement.style.setProperty('--negative-rgb', `${negativeR}, ${negativeG}, ${negativeB}`);

    // Apply html opacity (theme setting)
    const savedHtmlOpacity = localStorage.getItem('htmlOpacity');
    const opacityValue = savedHtmlOpacity ? parseFloat(savedHtmlOpacity) : 0.92;
    document.documentElement.style.opacity = opacityValue.toString();

    // Apply saved zoom level
    const savedZoomPercent = localStorage.getItem('zoomPercent') || '100';
    document.body.style.zoom = `${parseInt(savedZoomPercent) / 100}`;
    
    // Restore window size and position if in Tauri
    if ((window as any).__TAURI__) {
      const restoreWindowState = async () => {
        try {
          const tauriWindow = await import('@tauri-apps/api/window');
          const { PhysicalSize, PhysicalPosition } = await import('@tauri-apps/api/dpi');
          const appWindow = tauriWindow.getCurrentWindow();

          // Restore size
          const savedWidth = localStorage.getItem('windowWidth');
          const savedHeight = localStorage.getItem('windowHeight');
          if (savedWidth && savedHeight) {
            await appWindow.setSize(new PhysicalSize(parseInt(savedWidth), parseInt(savedHeight)));
          }

          // Restore position
          const savedX = localStorage.getItem('windowX');
          const savedY = localStorage.getItem('windowY');
          if (savedX && savedY) {
            await appWindow.setPosition(new PhysicalPosition(parseInt(savedX), parseInt(savedY)));
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

  // Show loading until server is connected
  if (!appReady) {
    return (
      <div className="app-loading">
        <div className="app-loading-spinner">
          <div className="app-loading-dot" />
          <div className="app-loading-dot" />
          <div className="app-loading-dot" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`app-minimal ${isDragging ? 'dragging' : ''}`}
      onDrop={handleGlobalDrop}
      onDragOver={handleGlobalDragOver}
      onDragLeave={handleGlobalDragLeave}
      onContextMenu={handleGlobalContextMenu}
    >
      <ErrorBoundary name="WindowControls">
        <WindowControls onSettingsClick={() => setShowSettings(true)} onHelpClick={() => setShowHelpModal(true)} onProjectsClick={() => setShowProjectsModal(true)} onAgentsClick={() => setShowAgentsModal(true)} onAnalyticsClick={() => {
          setAnalyticsProject(undefined);
          setShowAnalytics(true);
        }} />
      </ErrorBoundary>
      <ErrorBoundary name="TitleBar">
        <TitleBar onSettingsClick={() => setShowSettings(true)} />
      </ErrorBoundary>
      <ErrorBoundary name="SessionTabs">
        <SessionTabs />
      </ErrorBoundary>
      <ErrorBoundary name="ConnectionStatus">
        <ConnectionStatus />
      </ErrorBoundary>
      {isDragging && (
        <div className="drag-overlay">
          <div className="drag-overlay-content">
            <svg className="drag-icon" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 2h-8c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-10"/>
              <path d="M13 2v9h9"/>
              <circle cx="12" cy="17" r="1" fill="currentColor"/>
            </svg>
            <div className="drag-text">drop files to insert paths • folders to create session</div>
          </div>
        </div>
      )}
      <div className="app-content">
        <div className="main-chat-area">
          <ErrorBoundary name="ClaudeChat">
            <ClaudeChat />
          </ErrorBoundary>
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
            left: (() => {
              const zoomLevel = parseFloat(document.body.style.zoom || '1');
              const adjustedInnerWidth = window.innerWidth / zoomLevel;
              const menuWidth = 180;
              return contextMenu.x > adjustedInnerWidth - menuWidth ? adjustedInnerWidth - menuWidth : contextMenu.x;
            })(),
            top: (() => {
              const zoomLevel = parseFloat(document.body.style.zoom || '1');
              const adjustedInnerHeight = window.innerHeight / zoomLevel;
              // Calculate menu height based on items
              const hasSelection = contextMenu.hasSelection;
              const hasTextInput = contextMenu.isTextInput;
              const hasMessageBubble = contextMenu.isMessageBubble;
              const itemCount = (hasSelection ? 1 : 0) + (hasTextInput ? 3 : 0) + (hasMessageBubble ? 2 : 0) + 1; // +1 for about
              const menuHeight = itemCount * 32 + 20; // Approximate height
              
              if (contextMenu.y > adjustedInnerHeight - menuHeight) {
                return adjustedInnerHeight - menuHeight - 10;
              }
              return contextMenu.y;
            })(),
            zIndex: 200000 // Above all modals including upgrade modal
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
                onClick={async () => {
                  const textarea = contextMenu.target as HTMLTextAreaElement | HTMLInputElement;
                  if (textarea) {
                    try {
                      const start = textarea.selectionStart || 0;
                      const end = textarea.selectionEnd || 0;
                      const selectedText = textarea.value.substring(start, end) || textarea.value;
                      await navigator.clipboard.writeText(selectedText);
                    } catch (err) {
                      console.error('Failed to copy:', err);
                    }
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
                    try {
                      const text = await navigator.clipboard.readText();
                      textarea.focus();
                      
                      // Insert at current position or replace selection
                      const start = textarea.selectionStart || 0;
                      const end = textarea.selectionEnd || 0;
                      const currentValue = textarea.value;
                      
                      textarea.value = currentValue.substring(0, start) + text + currentValue.substring(end);
                      
                      // Set cursor position after pasted text
                      const newPos = start + text.length;
                      textarea.setSelectionRange(newPos, newPos);
                      
                      // Trigger input event for React
                      const event = new Event('input', { bubbles: true });
                      textarea.dispatchEvent(event);
                    } catch (err) {
                      console.error('Failed to paste:', err);
                    }
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
      
      {showSettings && (
        <ErrorBoundary name="SettingsModal">
          <Suspense fallback={null}>
            <SettingsModalTabbed onClose={() => setShowSettings(false)} />
          </Suspense>
        </ErrorBoundary>
      )}
      {showAbout && (
        <ErrorBoundary name="AboutModal">
          <Suspense fallback={null}>
            <AboutModal isOpen={showAbout} onClose={() => setShowAbout(false)} onShowUpgrade={() => {
              setShowAbout(false);
              setUpgradeReason('trial');
              setShowUpgradeModal(true);
            }} />
          </Suspense>
        </ErrorBoundary>
      )}
      {showHelpModal && (
        <ErrorBoundary name="KeyboardShortcuts">
          <Suspense fallback={null}>
            <KeyboardShortcuts onClose={() => setShowHelpModal(false)} />
          </Suspense>
        </ErrorBoundary>
      )}
      {showRecentModal && (
        <ErrorBoundary name="RecentProjectsModal">
          <Suspense fallback={null}>
            <RecentProjectsModal
              isOpen={showRecentModal}
              onClose={() => setShowRecentModal(false)}
              onProjectSelect={(path) => {
                const name = path.split(/[/\\]/).pop() || path;
                createSession(name, path);
              }}
            />
          </Suspense>
        </ErrorBoundary>
      )}
      {showProjectsModal && (
        <ErrorBoundary name="ProjectsModal">
          <Suspense fallback={null}>
            <ProjectsModal
              isOpen={showProjectsModal}
              onClose={() => setShowProjectsModal(false)}
        onSelectSession={async (projectPath: string, sessionId: string | null, sessionTitle?: string, sessionMessageCount?: number) => {
          // If no sessionId, create a new session in the project
          if (!sessionId) {
            // Format project name from path
            const projectName = projectPath
              .replace(/^-/, '/')
              .replace(/-/g, '/')
              .split('/')
              .pop() || projectPath;
            // Create new session with project path
            const fullPath = projectPath.replace(/^-/, '/').replace(/-/g, '/');
            createSession(projectName, fullPath);
            setShowProjectsModal(false);
            return;
          }
          
          // load the session from server
          try {
            console.log('Loading session:', projectPath, sessionId, 'with title:', sessionTitle);
            const serverPort = claudeCodeClient.getServerPort();
            if (!serverPort) {
              throw new Error('server port not available');
            }
            const response = await fetch(`http://localhost:${serverPort}/claude-session/${encodeURIComponent(projectPath)}/${encodeURIComponent(sessionId)}`);
            if (!response.ok) throw new Error('failed to load session');
            const data = await response.json();
            console.log('Session data loaded:', data);
            
            // Use the store's method to create a restored session
            const store = useClaudeCodeStore.getState();
            
            // Use the provided title from modal, or the title from server response, or extract from messages as fallback
            let sessionName = sessionTitle || data.title || 'resumed session';
            
            // Store title in localStorage if provided
            if (sessionTitle || data.title) {
              localStorage.setItem(`session-title-${sessionId}`, sessionTitle || data.title);
            }
            
            // Only extract from messages if no title was provided from either source
            if (!sessionTitle && !data.title && data.messages && data.messages.length > 0) {
              // Find the first user message
              const firstUserMessage = data.messages.find((m: any) => m.role === 'user');
              if (firstUserMessage && firstUserMessage.content) {
                let content = '';
                if (typeof firstUserMessage.content === 'string') {
                  content = firstUserMessage.content;
                } else if (Array.isArray(firstUserMessage.content)) {
                  // Find text content in array
                  const textBlock = firstUserMessage.content.find((c: any) => c.type === 'text');
                  if (textBlock && textBlock.text) {
                    content = textBlock.text;
                  }
                }
                
                // Extract first 2 words for the tab name
                if (content) {
                  const words = content.trim().split(/\s+/);
                  if (words.length >= 2) {
                    sessionName = words.slice(0, 2).join(' ').toLowerCase();
                  } else if (words.length === 1) {
                    sessionName = words[0].toLowerCase();
                  }
                  // Limit length to prevent overly long tab names
                  if (sessionName.length > 20) {
                    sessionName = sessionName.substring(0, 20) + '...';
                  }
                }
              }
            }
            
            // Generate a new session ID for the tab
            const newSessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
            
            // Filter out completely empty user messages
            const allMessages = data.messages || [];
            const filteredMessages = allMessages.filter((msg: any) => {
              // Keep all assistant messages
              if (msg.role === 'assistant') return true;
              
              // For user messages, check if they have actual content
              if (msg.role === 'user') {
                // Check for string content
                if (typeof msg.content === 'string' && msg.content.trim()) return true;
                
                // Check for array content with text
                if (Array.isArray(msg.content)) {
                  const hasContent = msg.content.some((item: any) => 
                    (item.type === 'text' && item.text && item.text.trim()) ||
                    item.type === 'image'
                  );
                  if (hasContent) return true;
                }
                
                // Skip empty user messages
                return false;
              }
              
              return true; // Keep any other message types
            });
            
            // Load all messages - no limit since we have infinite scrolling now
            const messagesToLoad = filteredMessages;
            console.log(`Loading ${messagesToLoad.length} messages (from ${allMessages.length} total after filtering blanks)`);
            
            // Create the session with filtered messages - mark as read-only
            const newSession = {
              id: newSessionId,
              name: sessionName,
              claudeTitle: sessionName, // Set claudeTitle so it shows in the tab
              status: 'active' as const,
              messages: messagesToLoad,
              workingDirectory: data.projectPath,
              createdAt: new Date(),
              updatedAt: new Date(),
              claudeSessionId: sessionId, // Store the original Claude session ID for resumption
              readOnly: true, // Mark as read-only since loaded from projects
              analytics: {
                totalMessages: data.messages?.length || 0,
                userMessages: 0,
                assistantMessages: 0,
                toolUses: 0,
                tokens: { input: 0, output: 0, total: 0, byModel: { opus: { input: 0, output: 0, total: 0 }, sonnet: { input: 0, output: 0, total: 0 } } },
                cost: { total: 0, byModel: { opus: 0, sonnet: 0 } },
                modelUsage: {},
                duration: 0,
                lastActivity: new Date(),
                thinkingTime: 0
              },
              draft: { input: '', attachments: [] },
              permissionMode: 'default' as const,
              allowedTools: ['Read', 'Write', 'Edit', 'MultiEdit', 'LS', 'Glob', 'Grep', 'Bash', 'WebFetch', 'WebSearch', 'TodoWrite'],
              restorePoints: [],
              modifiedFiles: new Set<string>()
            };
            
            // Add session to store and set as current
            store.sessions.push(newSession);
            store.currentSessionId = newSessionId;
            useClaudeCodeStore.setState({ 
              sessions: [...store.sessions],
              currentSessionId: newSessionId
            });
            
            // Register the session with the server for resumption - pass all loaded data
            await claudeCodeClient.createSession(sessionName, data.projectPath, {
              sessionId: newSessionId,
              existingSessionId: newSessionId,  // Tell server this is a loaded session
              claudeSessionId: sessionId,       // Pass the original Claude session ID
              messages: messagesToLoad           // Pass the loaded messages
            });
            
            console.log('Session restored with', messagesToLoad.length, 'messages (total in session:', data.messages?.length || 0, ')');
          } catch (error) {
            console.error('failed to load session:', error);
          }
        }}
        onProjectAnalytics={(projectPath) => {
          // Convert project path to readable format for analytics
          const projectName = projectPath
            .replace(/^-/, '/')
            .replace(/-/g, '/');
          // setAnalyticsProject(projectName);
          // setShowAnalytics(true);
        }}
            />
          </Suspense>
        </ErrorBoundary>
      )}
      {showAgentsModal && (
        <ErrorBoundary name="AgentsModal">
          <Suspense fallback={null}>
            <AgentsModal
              isOpen={showAgentsModal}
              onClose={() => setShowAgentsModal(false)}
              onSelectAgent={(agent) => {
                // Apply selected agent to the store
                const store = useClaudeCodeStore.getState();
                store.selectAgent(agent.id);
                console.log('[App] Selected agent:', agent.name);
                setShowAgentsModal(false);
              }}
            />
          </Suspense>
        </ErrorBoundary>
      )}
      {showAnalytics && (
        <ErrorBoundary name="AnalyticsModal">
          <Suspense fallback={null}>
            <AnalyticsModal
              isOpen={showAnalytics}
              onClose={() => {
                setShowAnalytics(false);
                setAnalyticsProject(undefined);
              }}
              initialProject={analyticsProject}
            />
          </Suspense>
        </ErrorBoundary>
      )}
      {showUpgradeModal && (
        <ErrorBoundary name="UpgradeModal">
          <Suspense fallback={null}>
            <UpgradeModal
              isOpen={showUpgradeModal}
              onClose={() => setShowUpgradeModal(false)}
              reason={upgradeReason}
            />
          </Suspense>
        </ErrorBoundary>
      )}
      {claudeNotDetected && connectionCheckDone && (
        <ErrorBoundary name="ClaudeNotDetected">
          <ClaudeNotDetected />
        </ErrorBoundary>
      )}
    </div>
  );
};