import React, { useState, useEffect, useRef, DragEvent } from 'react';
import { IconX, IconPlus, IconFolder, IconFolderOpen, IconBolt, IconTrash, IconChevronDown, IconClock, IconChartBar } from '@tabler/icons-react';
import { useClaudeCodeStore } from '../../stores/claudeCodeStore';
import { AboutModal } from '../About/AboutModal';
import { AnalyticsModal } from '../Analytics/AnalyticsModal';
import { LoadingIndicator } from '../LoadingIndicator/LoadingIndicator';
// RecentProjectsModal removed - handled by ClaudeChat component instead
import './SessionTabs.css';

export const SessionTabs: React.FC = () => {
  const { 
    sessions, 
    currentSessionId, 
    createSession, 
    deleteSession,
    deleteAllSessions,
    resumeSession,
    reorderSessions,
    renameSession,
    clearContext,
    interruptSession
  } = useClaudeCodeStore();

  const [showNewMenu, setShowNewMenu] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; sessionId: string } | null>(null);
  // Recent modal state removed - handled by ClaudeChat component
  const [recentProjects, setRecentProjects] = useState<any[]>([]);
  const [showAbout, setShowAbout] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [hasRecentProjects, setHasRecentProjects] = useState(false);
  const [renamingTab, setRenamingTab] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameInputWidth, setRenameInputWidth] = useState(16);
  
  // Helper function to measure text width
  const measureTextWidth = (text: string): number => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return text.length * 5.2;
    
    // Match the input's font style (9px now)
    context.font = '9px Helvetica, "Helvetica Neue", Arial, sans-serif';
    const metrics = context.measureText(text);
    
    // Add minimal width for cursor visibility
    return Math.ceil(metrics.width) + 2;
  };
  const [draggedTab, setDraggedTab] = useState<string | null>(null);
  const [dragOverTab, setDragOverTab] = useState<string | null>(null);
  const [dragOverNewTab, setDragOverNewTab] = useState(false);
  const [dragOverRecent, setDragOverRecent] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  // Close context menu on click outside
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

  // Setup window dragging for tabs area
  useEffect(() => {
    const setupDrag = async () => {
      if ((window as any).__TAURI__) {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        
        // Get the current window instance
        const appWindow = getCurrentWindow();
        
        if (appWindow) {
          const tabsArea = document.querySelector('.session-tabs') as HTMLElement;
          if (tabsArea) {
            tabsArea.addEventListener('mousedown', async (e) => {
              // Don't drag if clicking on interactive elements
              const target = e.target as HTMLElement;
              if (target.closest('.session-tab') || 
                  target.closest('button') || 
                  target.closest('input') ||
                  target.closest('.tabs-actions')) {
                return;
              }
              await appWindow.startDragging();
            });
          }
        }
      }
    };
    
    setupDrag();
  }, []);

  // Check if there are recent projects
  useEffect(() => {
    const checkRecentProjects = () => {
      const stored = localStorage.getItem('yurucode-recent-projects');
      if (stored) {
        try {
          const projects = JSON.parse(stored);
          setHasRecentProjects(projects && projects.length > 0);
          setRecentProjects(projects || []);
        } catch {
          setHasRecentProjects(false);
          setRecentProjects([]);
        }
      } else {
        setHasRecentProjects(false);
        setRecentProjects([]);
      }
    };
    
    checkRecentProjects();
  }, [sessions.length]);

  // Keyboard handling moved to RecentProjectsModal component to avoid conflicts

  // Handle vertical scroll as horizontal scroll on tabs container
  useEffect(() => {
    const container = tabsContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      // Prevent default vertical scroll
      e.preventDefault();
      // Apply both vertical and horizontal scroll deltas as horizontal scroll
      // Use whichever delta is larger for better UX
      const scrollAmount = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      container.scrollLeft += scrollAmount;
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  // Check for overflow and apply class
  useEffect(() => {
    const container = tabsContainerRef.current;
    if (!container) return;

    const checkOverflow = () => {
      const hasOverflow = container.scrollWidth > container.clientWidth;
      if (hasOverflow) {
        container.classList.add('has-overflow');
      } else {
        container.classList.remove('has-overflow');
      }
    };

    // Check on mount and when sessions change
    checkOverflow();
    
    // Also check on window resize
    window.addEventListener('resize', checkOverflow);
    
    // Create a ResizeObserver to watch for container size changes
    const resizeObserver = new ResizeObserver(checkOverflow);
    resizeObserver.observe(container);

    return () => {
      window.removeEventListener('resize', checkOverflow);
      resizeObserver.disconnect();
    };
  }, [sessions]);

  // Handle close tab event from Electron menu (Cmd+W on macOS)
  useEffect(() => {
    const handleCloseTab = () => {
      // Don't close if the current tab is streaming
      const currentSession = sessions.find(s => s.id === currentSessionId);
      if (currentSession?.streaming) {
        console.log('Cannot close tab while Claude is streaming');
        return;
      }
      
      // Close the current active tab
      if (currentSessionId) {
        deleteSession(currentSessionId);
      }
    };

    // Listen for IPC event from electron menu
    if (window.electronAPI && window.electronAPI.on) {
      window.electronAPI.on('close-current-tab', handleCloseTab);
      return () => {
        // Use off if available, otherwise use removeAllListeners
        if (window.electronAPI.off) {
          window.electronAPI.off('close-current-tab', handleCloseTab);
        } else if (window.electronAPI.removeAllListeners) {
          window.electronAPI.removeAllListeners('close-current-tab');
        }
      };
    }
  }, [currentSessionId, deleteSession, sessions]);

  // Note: Ctrl+W is handled via IPC from electron menu in the effect above
  // We don't add a duplicate keyboard handler here to avoid closing tabs twice

  const handleOpenFolder = async () => {
    setShowNewMenu(false);
    
    // Wrap in a setTimeout to ensure UI updates before the blocking dialog
    setTimeout(async () => {
      let directory = null;
      
      // Debug log
      console.log('handleOpenFolder called');
      console.log('window.__TAURI__:', !!(window as any).__TAURI__);
      console.log('electronAPI available?', !!window.electronAPI);
      console.log('electronAPI.folder?', !!window.electronAPI?.folder);
      console.log('electronAPI.folder.select?', !!window.electronAPI?.folder?.select);
      
      // Try using the platform bridge
      if (window.electronAPI?.folder?.select) {
        console.log('Calling folder.select() via electronAPI...');
        try {
          directory = await window.electronAPI.folder.select();
          console.log('Folder select returned:', directory);
          if (!directory) {
            // User cancelled folder selection
            console.log('User cancelled folder selection');
            return;
          }
        } catch (error) {
          console.error('Folder selection failed:', error);
          // Don't fall back to /, just return
          return;
        }
      } 
      
      if (!directory) {
        // No folder selection method available, don't create a session
        console.log('No folder selection method available');
        return;
      }
      
      // Save to recent projects if it's not the root directory
      if (directory && directory !== '/') {
        const name = directory.split(/[/\\]/).pop() || directory;
        const newProject = { path: directory, name, lastOpened: Date.now() };
        
        // Get existing recent projects
        const stored = localStorage.getItem('yurucode-recent-projects');
        let recentProjects = [];
        try {
          if (stored) {
            recentProjects = JSON.parse(stored);
          }
        } catch (err) {
          console.error('Failed to parse recent projects:', err);
        }
        
        // Update recent projects list
        const updated = [
          newProject,
          ...recentProjects.filter((p: any) => p.path !== directory)
        ].slice(0, 8);
        
        localStorage.setItem('yurucode-recent-projects', JSON.stringify(updated));
        
        // Update hasRecentProjects state
        setHasRecentProjects(true);
      }
      
      // Always create a new session when clicking the new tab button
      // This ensures sessions are properly persisted to disk
      console.log('Creating new session with directory:', directory);
      await createSession(undefined, directory);
    }, 0);
  };


  const getDisplayPath = (path?: string) => {
    if (!path) return '';
    // Show only the last directory name
    // Handle both Windows and Unix paths
    const parts = path.split(/[\\/]/).filter(p => p);
    return parts[parts.length - 1] || '';
  };


  return (
    <div className="session-tabs">
      <div className="tabs-wrapper">
        <div className="tabs-scrollable" ref={tabsContainerRef}>
          {sessions.map((session) => (
          <div
            key={session.id}
            data-session-id={session.id}
            className={`session-tab ${currentSessionId === session.id ? 'active' : ''} ${draggedTab === session.id ? 'dragging' : ''} ${dragOverTab === session.id ? 'drag-over' : ''}`}
            onClick={(e) => {
              if (!isDragging) {
                resumeSession(session.id);
              }
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              const title = (session as any).claudeTitle || 'new session';
              setRenameValue(title);
              setRenameInputWidth(measureTextWidth(title));
              setRenamingTab(session.id);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              // Adjust for zoom level
              const zoomLevel = parseFloat(document.body.style.zoom || '1');
              const adjustedX = e.clientX / zoomLevel;
              const adjustedY = e.clientY / zoomLevel;
              setContextMenu({ x: adjustedX, y: adjustedY, sessionId: session.id });
            }}
            onMouseDown={(e) => {
              // Prevent dragging when renaming
              if (renamingTab === session.id) {
                return;
              }
              
              // ALWAYS add ripple effect on mousedown for left click
              if (e.button === 0) { // Left click only
                // Add ripple effect immediately on mousedown
                const target = e.currentTarget;
                const rect = target.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                
                // Create ripple element directly in DOM to avoid React re-render interruption
                const ripple = document.createElement('div');
                ripple.style.cssText = `
                  position: absolute;
                  top: ${y}px;
                  left: ${x}px;
                  width: 0;
                  height: 0;
                  border-radius: 50%;
                  background: rgba(var(--accent-rgb), 0.4);
                  transform: translate(-50%, -50%);
                  pointer-events: none;
                  z-index: 100;
                  animation: ripple-expand 1s ease-out forwards;
                `;
                target.appendChild(ripple);
                
                // Remove ripple after animation completes
                setTimeout(() => {
                  if (ripple.parentNode) {
                    ripple.parentNode.removeChild(ripple);
                  }
                }, 1000);
              }
              
              if (e.button === 0) { // Left click only
                const startX = e.clientX;
                const startY = e.clientY;
                let moved = false;
                let currentDragOver: string | null = null;
                
                // Create drag preview - clone the actual tab
                const createDragPreview = () => {
                  const tabElement = document.querySelector(`[data-session-id="${session.id}"]`) as HTMLElement;
                  if (!tabElement) return null;
                  
                  const preview = tabElement.cloneNode(true) as HTMLElement;
                  preview.style.cssText = `
                    position: fixed;
                    pointer-events: none !important;
                    z-index: 9999;
                    opacity: 1;
                    transform: rotate(2deg);
                    transition: none;
                    cursor: grabbing !important;
                    user-select: none;
                  `;
                  
                  // Copy computed styles from original
                  const computedStyle = window.getComputedStyle(tabElement);
                  preview.style.width = computedStyle.width;
                  preview.style.height = computedStyle.height;
                  preview.style.background = computedStyle.background;
                  preview.style.border = computedStyle.border;
                  preview.style.borderRadius = computedStyle.borderRadius;
                  preview.style.padding = computedStyle.padding;
                  preview.style.display = 'flex';
                  preview.style.alignItems = 'center';
                  preview.style.gap = '6px';
                  preview.style.fontFamily = computedStyle.fontFamily;
                  preview.style.fontSize = computedStyle.fontSize;
                  
                  // Remove close button from preview
                  const closeBtn = preview.querySelector('.tab-close');
                  if (closeBtn) closeBtn.remove();
                  
                  document.body.appendChild(preview);
                  return preview;
                };
                
                let dragPreview: HTMLElement | null = null;
                
                const handleMouseMove = (moveEvent: MouseEvent) => {
                  const dx = Math.abs(moveEvent.clientX - startX);
                  const dy = Math.abs(moveEvent.clientY - startY);
                  
                  if (!moved && (dx > 5 || dy > 5)) {
                    // Start dragging after 5px movement
                    moved = true;
                    setIsDragging(true);
                    setDraggedTab(session.id);
                    dragPreview = createDragPreview();
                    document.body.classList.add('tab-dragging');
                    // Force cursor change immediately
                    document.body.style.cursor = 'grabbing';
                    console.log('Started dragging:', session.id);
                  }
                  
                  if (moved) {
                    // Update drag preview position - offset more to avoid cursor interference
                    if (dragPreview) {
                      // Account for zoom level by calculating zoom from viewport dimensions
                      const zoomFactor = window.outerWidth / window.innerWidth;
                      const offsetX = 15 / zoomFactor;
                      const offsetY = 15 / zoomFactor;
                      dragPreview.style.left = `${moveEvent.clientX + offsetX}px`;
                      dragPreview.style.top = `${moveEvent.clientY + offsetY}px`;
                    }
                    
                    // Ensure cursor stays as grabbing
                    if (document.body.style.cursor !== 'grabbing') {
                      document.body.style.cursor = 'grabbing';
                    }
                    
                    // Find which tab we're over
                    const elements = document.elementsFromPoint(moveEvent.clientX, moveEvent.clientY);
                    const tabElement = elements.find(el => el.classList.contains('session-tab')) as HTMLElement;
                    const newTabButton = elements.find(el => el.classList.contains('tab-new'));
                    
                    if (tabElement) {
                      const targetSessionId = tabElement.getAttribute('data-session-id');
                      if (targetSessionId && targetSessionId !== session.id) {
                        console.log('Over tab:', targetSessionId);
                        currentDragOver = targetSessionId;
                        setDragOverTab(targetSessionId);
                      } else if (targetSessionId === session.id) {
                        // Dragged back to original position - clear drag over
                        console.log('Back to original tab');
                        currentDragOver = null;
                        setDragOverTab(null);
                      }
                    } else if (newTabButton) {
                      // Over the new tab button - mark for moving to end
                      currentDragOver = 'move-to-end';
                      setDragOverTab(null);
                      setDragOverNewTab(true);
                    } else {
                      // Check if we're past the new tab button (to the right of it)
                      const newTabRect = document.querySelector('.tab-new')?.getBoundingClientRect();
                      if (newTabRect && moveEvent.clientX > newTabRect.right) {
                        currentDragOver = 'move-to-end';
                        setDragOverTab(null);
                      } else {
                        currentDragOver = null;
                        setDragOverTab(null);
                        setDragOverNewTab(false);
                      }
                    }
                  }
                };
                
                const cleanupDrag = () => {
                  // Remove drag class and cursor from body
                  document.body.classList.remove('tab-dragging');
                  document.body.style.cursor = '';
                  
                  // Also remove cursor from all elements to fix stuck cursor bug
                  const allElements = document.querySelectorAll('*');
                  allElements.forEach(el => {
                    if (el instanceof HTMLElement) {
                      el.style.cursor = '';
                    }
                  });
                  
                  // Remove drag preview
                  if (dragPreview && document.body.contains(dragPreview)) {
                    document.body.removeChild(dragPreview);
                    dragPreview = null;
                  }
                  
                  // Reset all drag states
                  setIsDragging(false);
                  setDraggedTab(null);
                  setDragOverTab(null);
                  setDragOverNewTab(false);
                  setDragOverRecent(false);
                };
                
                const handleMouseLeave = (e: MouseEvent) => {
                  // Only cleanup if mouse leaves the window entirely
                  if (e.clientY <= 0 || e.clientX <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
                    cleanupDrag();
                    document.removeEventListener('mousemove', handleMouseMove);
                    document.removeEventListener('mouseup', handleMouseUp);
                    document.removeEventListener('mouseleave', handleMouseLeave);
                  }
                };
                
                const handleMouseUp = (upEvent: MouseEvent) => {
                  document.removeEventListener('mousemove', handleMouseMove);
                  document.removeEventListener('mouseup', handleMouseUp);
                  document.removeEventListener('mouseleave', handleMouseLeave);
                  
                  console.log('Mouse up, moved:', moved, 'currentDragOver:', currentDragOver);
                  
                  if (moved) {
                    // Check if we're over the new tab button
                    const newTabButton = document.querySelector('.tab-new');
                    if (newTabButton && newTabButton.contains(upEvent.target as Node)) {
                      // Don't create session here - it's handled by the button's onMouseUp
                      console.log('Dropped on new tab button - handled by button');
                    } else if (currentDragOver === 'move-to-end') {
                      // Move the tab to the end of the list
                      const fromIndex = sessions.findIndex(s => s.id === session.id);
                      const toIndex = sessions.length - 1;
                      if (fromIndex !== -1 && fromIndex !== toIndex) {
                        console.log('Moving tab to end from', fromIndex, 'to', toIndex);
                        reorderSessions(fromIndex, toIndex);
                      }
                    } else if (currentDragOver) {
                      // Perform the reorder between tabs
                      const fromIndex = sessions.findIndex(s => s.id === session.id);
                      const toIndex = sessions.findIndex(s => s.id === currentDragOver);
                      if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
                        console.log('Reordering from', fromIndex, 'to', toIndex);
                        reorderSessions(fromIndex, toIndex);
                      }
                    }
                  }
                  
                  // Use cleanup function to reset state
                  cleanupDrag();
                };
                
                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
                document.addEventListener('mouseleave', handleMouseLeave);
              }
            }}
          >
            <div className="tab-content">
              {(session as any).workingDirectory && (
                <span className="tab-folder">
                  {getDisplayPath((session as any).workingDirectory)}
                </span>
              )}
              <div className="tab-context-bar">
                {(() => {
                  const tokens = (session as any).analytics?.tokens?.total || 0;
                  const contextMax = 200000; // 200k context window
                  const percentage = Math.min((tokens / contextMax) * 100, 100);
                  
                  // Color gradient: grey until 70%, then yellow -> orange -> red
                  const getColor = (pct: number) => {
                    if (pct < 70) return 'rgba(150, 150, 150, 0.8)'; // Grey
                    if (pct < 80) return 'rgba(255, 255, 100, 0.8)'; // Yellow
                    if (pct < 90) return 'rgba(255, 200, 100, 0.8)'; // Orange
                    return 'rgba(255, 100, 100, 0.8)'; // Red
                  };
                  
                  return (
                    <>
                      <div 
                        className="context-bar-fill" 
                        style={{ 
                          height: `${percentage}%`,
                          background: getColor(percentage)
                        }}
                      />
                      <div className="context-bar-text">{Math.round(percentage)}%</div>
                    </>
                  );
                })()}
              </div>
              {renamingTab === session.id ? (
                <input
                  type="text"
                  className="tab-rename-input"
                  value={renameValue}
                  onChange={(e) => {
                    setRenameValue(e.target.value);
                    setRenameInputWidth(measureTextWidth(e.target.value));
                  }}
                  onFocus={(e) => e.target.select()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (renameValue.trim()) {
                        renameSession(session.id, renameValue);
                      }
                      setRenamingTab(null);
                    } else if (e.key === 'Escape') {
                      setRenamingTab(null);
                    }
                  }}
                  onBlur={() => {
                    if (renameValue.trim()) {
                      renameSession(session.id, renameValue);
                    }
                    setRenamingTab(null);
                  }}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                  style={{ width: `${renameInputWidth}px` }}
                />
              ) : (
                (session as any).claudeTitle && (
                  <span className="tab-title">
                    {(session as any).claudeTitle}
                  </span>
                )
              )}
            </div>
            {/* Show loading icon for pending sessions, streaming, or bash running */}
            {(session.status === 'pending' || session.streaming || (session as any).runningBash || (session as any).userBashRunning) ? (
              <div className="tab-progress">
                <LoadingIndicator size="small" color="red" />
              </div>
            ) : (
              <button
                className="tab-close"
                onClick={async (e) => {
                  e.stopPropagation();
                  // If streaming, interrupt first then close
                  if (session.streaming) {
                    await interruptSession();
                  }
                  deleteSession(session.id);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation(); // Prevent rename on double-click close button
                }}
                onMouseDown={(e) => {
                  e.stopPropagation(); // Prevent tab drag when clicking close
                }}
              >
                <IconX size={14} stroke={1.5} />
              </button>
            )}
          </div>
        ))}
        </div>
        
        <div className={`tabs-actions ${sessions.length === 0 ? 'no-tabs' : ''}`}>
          <button 
            className={`tab-new ${dragOverNewTab ? 'drag-over-duplicate' : ''}`}
            onClick={handleOpenFolder} 
            onMouseDown={(e) => {
              if (e.button === 0) { // Left click only
                const target = e.currentTarget;
                const rect = target.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                
                // Create ripple element directly in DOM to avoid React re-render interruption
                const ripple = document.createElement('div');
                ripple.style.cssText = `
                  position: absolute;
                  top: ${y}px;
                  left: ${x}px;
                  width: 0;
                  height: 0;
                  border-radius: 50%;
                  background: rgba(var(--accent-rgb), 0.2);
                  transform: translate(-50%, -50%);
                  pointer-events: none;
                  z-index: 100;
                  animation: ripple-expand 0.8s ease-out forwards;
                `;
                target.appendChild(ripple);
                
                // Remove ripple after animation completes
                setTimeout(() => {
                  if (ripple.parentNode) {
                    ripple.parentNode.removeChild(ripple);
                  }
                }, 800);
              }
              e.currentTarget.classList.add('ripple-held');
            }}
            onMouseUp={(e) => {
              e.currentTarget.classList.remove('ripple-held');
              
              if (isDragging && draggedTab) {
                // Prevent the onClick from firing when dropping a tab
                e.preventDefault();
                e.stopPropagation();
                
                // Find the dragged session and duplicate it
                const sessionToDuplicate = sessions.find(s => s.id === draggedTab);
                if (sessionToDuplicate) {
                  const workingDir = (sessionToDuplicate as any)?.workingDirectory;
                  createSession(undefined, workingDir || '/');
                }
                
                // Clean up all drag state and remove cursor styles
                document.body.classList.remove('tab-dragging');
                document.body.style.cursor = '';
                
                // Remove cursor from all elements to fix stuck cursor bug
                const allElements = document.querySelectorAll('*');
                allElements.forEach(el => {
                  if (el instanceof HTMLElement) {
                    el.style.cursor = '';
                  }
                });
                
                // Remove any drag preview that might be lingering
                const dragPreviews = document.querySelectorAll('[style*="z-index: 9999"]');
                dragPreviews.forEach(preview => {
                  if (preview.parentNode) {
                    preview.parentNode.removeChild(preview);
                  }
                });
                
                setIsDragging(false);
                setDraggedTab(null);
                setDragOverNewTab(false);
                setDragOverRecent(false);
                setDragOverTab(null);
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.classList.remove('ripple-held');
              
              if (isDragging) {
                setDragOverNewTab(false);
              }
            }}
            title={draggedTab ? "drop to duplicate" : "new tab (ctrl+t)"}
            onMouseEnter={() => {
              if (isDragging && draggedTab) {
                setDragOverNewTab(true);
              }
            }}
          >
            <IconPlus size={16} stroke={1.5} />
          </button>
          
          {hasRecentProjects && (
            <button 
              className={`tab-recent ${dragOverRecent ? 'drag-over-save' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                // Emit event to open recent modal in ClaudeChat
                console.log('[SessionTabs] Recent button clicked, dispatching openRecentProjects event');
                const event = new CustomEvent('openRecentProjects');
                window.dispatchEvent(event);
                console.log('[SessionTabs] Event dispatched');
              }}
              onMouseDown={(e) => {
                if (e.button === 0) { // Left click only
                  const target = e.currentTarget;
                  const rect = target.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const y = e.clientY - rect.top;
                  
                  // Create ripple element directly in DOM to avoid React re-render interruption
                  const ripple = document.createElement('div');
                  ripple.style.cssText = `
                    position: absolute;
                    top: ${y}px;
                    left: ${x}px;
                    width: 0;
                    height: 0;
                    border-radius: 50%;
                    background: rgba(255, 255, 255, 0.2);
                    transform: translate(-50%, -50%);
                    pointer-events: none;
                    z-index: 100;
                    animation: ripple-expand 0.8s ease-out forwards;
                  `;
                  target.appendChild(ripple);
                  
                  // Remove ripple after animation completes
                  setTimeout(() => {
                    if (ripple.parentNode) {
                      ripple.parentNode.removeChild(ripple);
                    }
                  }, 800);
                }
                e.currentTarget.classList.add('ripple-held');
              }}
              onMouseUp={(e) => {
                e.currentTarget.classList.remove('ripple-held');
                
                if (isDragging && draggedTab) {
                  // Save the dragged tab to recent projects
                  const sessionToSave = sessions.find(s => s.id === draggedTab);
                  if (sessionToSave) {
                    const workingDir = (sessionToSave as any)?.workingDirectory;
                    // Only save if it's a full path (contains directory separators)
                    if (workingDir && workingDir !== '/' && workingDir !== '.' && (workingDir.includes('/') || workingDir.includes('\\'))) {
                      const name = workingDir.split(/[/\\]/).pop() || workingDir;
                      const newProject = { path: workingDir, name, lastOpened: Date.now(), accessCount: 1 };
                      
                      // Get existing recent projects
                      const stored = localStorage.getItem('yurucode-recent-projects');
                      let recentProjects = [];
                      try {
                        if (stored) {
                          recentProjects = JSON.parse(stored);
                        }
                      } catch (err) {
                        console.error('Failed to parse recent projects:', err);
                      }
                      
                      // Update recent projects list
                      const updated = [
                        newProject,
                        ...recentProjects.filter((p: any) => p.path !== workingDir)
                      ].slice(0, 8);
                      
                      localStorage.setItem('yurucode-recent-projects', JSON.stringify(updated));
                      setHasRecentProjects(true);
                      
                      // Optionally create a new tab with this project
                      createSession(undefined, workingDir);
                    }
                  }
                  
                  // Clean up all drag state and remove cursor styles
                  document.body.classList.remove('tab-dragging');
                  document.body.style.cursor = '';
                  
                  // Remove cursor from all elements to fix stuck cursor bug
                  const allElements = document.querySelectorAll('*');
                  allElements.forEach(el => {
                    if (el instanceof HTMLElement) {
                      el.style.cursor = '';
                    }
                  });
                  
                  // Remove any drag preview that might be lingering
                  const dragPreviews = document.querySelectorAll('[style*="z-index: 9999"]');
                  dragPreviews.forEach(preview => {
                    if (preview.parentNode) {
                      preview.parentNode.removeChild(preview);
                    }
                  });
                  
                  setIsDragging(false);
                  setDraggedTab(null);
                  setDragOverNewTab(false);
                  setDragOverRecent(false);
                  setDragOverTab(null);
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.classList.remove('ripple-held');
                
                if (isDragging) {
                  setDragOverRecent(false);
                }
              }}
              onMouseEnter={() => {
                if (isDragging && draggedTab) {
                  setDragOverRecent(true);
                }
              }}
              title={draggedTab ? "drop to save as recent" : "recent projects (ctrl+r)"}
            >
              <IconChevronDown size={16} stroke={1.5} />
            </button>
          )}
        </div>
      </div>
      
      {contextMenu && (
        <div 
          ref={contextMenuRef}
          className="tab-context-menu" 
          style={{ 
            left: (() => {
              const zoomLevel = parseFloat(document.body.style.zoom || '1');
              const adjustedInnerWidth = window.innerWidth / zoomLevel;
              return contextMenu.x > adjustedInnerWidth - 200 ? contextMenu.x - 150 : contextMenu.x;
            })(),
            top: (() => {
              const zoomLevel = parseFloat(document.body.style.zoom || '1');
              const adjustedInnerHeight = window.innerHeight / zoomLevel;
              return contextMenu.y > adjustedInnerHeight - 250 ? contextMenu.y - 200 : contextMenu.y;
            })()
          }}
        >
          <button onClick={() => {
            const session = sessions.find(s => s.id === contextMenu.sessionId);
            const workingDir = (session as any)?.workingDirectory;
            if (workingDir) {
              // Save to recent projects if it's not the root directory
              if (workingDir !== '/') {
                const name = workingDir.split(/[/\\]/).pop() || workingDir;
                const newProject = { path: workingDir, name, lastOpened: Date.now(), accessCount: 1 };
                
                // Get existing recent projects
                const stored = localStorage.getItem('yurucode-recent-projects');
                let recentProjects = [];
                try {
                  if (stored) {
                    recentProjects = JSON.parse(stored);
                  }
                } catch (err) {
                  console.error('Failed to parse recent projects:', err);
                }
                
                // Update recent projects list
                const updated = [
                  newProject,
                  ...recentProjects.filter((p: any) => p.path !== workingDir)
                ].slice(0, 8);
                
                localStorage.setItem('yurucode-recent-projects', JSON.stringify(updated));
                setHasRecentProjects(true);
              }
              
              createSession(undefined, workingDir);
            }
            setContextMenu(null);
          }}>new session in same dir</button>
          
          <button onClick={() => {
            const session = sessions.find(s => s.id === contextMenu.sessionId);
            if (session) {
              const title = (session as any).claudeTitle || 'new session';
              setRenameValue(title);
              setRenameInputWidth(measureTextWidth(title));
              setRenamingTab(contextMenu.sessionId);
              setContextMenu(null);
            }
          }}>rename tab</button>
          
          <div className="separator" />
          
          {(() => {
            const sessionIndex = sessions.findIndex(s => s.id === contextMenu.sessionId);
            const targetSession = sessions.find(s => s.id === contextMenu.sessionId);
            const hasMessages = targetSession && targetSession.messages.some(m => 
              m.type === 'user' || m.type === 'assistant' || m.type === 'tool_use' || m.type === 'tool_result'
            );
            const isAtStart = sessionIndex === 0;
            const isAtEnd = sessionIndex === sessions.length - 1;
            
            return (
              <>
                <button 
                  onClick={() => {
                    if (!isAtStart) {
                      reorderSessions(sessionIndex, 0);
                      setContextMenu(null);
                    }
                  }}
                  disabled={isAtStart}
                  style={{
                    opacity: isAtStart ? 0.3 : 1,
                    cursor: 'default'
                  }}
                >move to start</button>
                
                <button 
                  onClick={() => {
                    if (!isAtEnd) {
                      reorderSessions(sessionIndex, sessions.length - 1);
                      setContextMenu(null);
                    }
                  }}
                  disabled={isAtEnd}
                  style={{
                    opacity: isAtEnd ? 0.3 : 1,
                    cursor: 'default'
                  }}
                >move to end</button>
                
                <div className="separator" />
                
                <button 
                  onClick={() => {
                    if (hasMessages) {
                      clearContext(contextMenu.sessionId);
                      setContextMenu(null);
                    }
                  }}
                  disabled={!hasMessages}
                  style={{
                    opacity: hasMessages ? 1 : 0.3,
                    cursor: 'default'
                  }}
                >clear session</button>
              </>
            );
          })()}
          
          <div className="separator" />
          
          <button onClick={async () => {
            const targetSession = sessions.find(s => s.id === contextMenu.sessionId);
            if (targetSession?.streaming) {
              await interruptSession();
            }
            deleteSession(contextMenu.sessionId);
            setContextMenu(null);
          }}>close</button>
          
          <button onClick={async () => {
            const targetSession = sessions.find(s => s.id === contextMenu.sessionId);
            if (targetSession) {
              // First switch to the target session
              resumeSession(targetSession.id);
              // Then delete all others (interrupt streaming ones first)
              for (const s of sessions) {
                if (s.id !== targetSession.id) {
                  if (s.streaming) {
                    // Switch to the streaming session to interrupt it
                    resumeSession(s.id);
                    await interruptSession();
                  }
                  deleteSession(s.id);
                }
              }
            }
            setContextMenu(null);
          }}>close others</button>
          
          <button onClick={async () => {
            const sessionIndex = sessions.findIndex(s => s.id === contextMenu.sessionId);
            for (let idx = 0; idx < sessions.length; idx++) {
              if (idx > sessionIndex) {
                const s = sessions[idx];
                if (s.streaming) {
                  resumeSession(s.id);
                  await interruptSession();
                }
                deleteSession(s.id);
              }
            }
            setContextMenu(null);
          }}>close all to right</button>
          
          <button onClick={async () => {
            const sessionIndex = sessions.findIndex(s => s.id === contextMenu.sessionId);
            for (let idx = 0; idx < sessions.length; idx++) {
              if (idx < sessionIndex) {
                const s = sessions[idx];
                if (s.streaming) {
                  resumeSession(s.id);
                  await interruptSession();
                }
                deleteSession(s.id);
              }
            }
            setContextMenu(null);
          }}>close all to left</button>
          
          <button onClick={async () => {
            // Interrupt any streaming sessions first
            for (const s of sessions) {
              if (s.streaming) {
                resumeSession(s.id);
                await interruptSession();
              }
            }
            deleteAllSessions();
            setContextMenu(null);
          }}>close all</button>
          
          <div className="separator" />
          
          <button onClick={() => {
            setShowAbout(true);
            setContextMenu(null);
          }}>about</button>
        </div>
      )}
      
      {/* RecentProjectsModal removed - handled by ClaudeChat component */}
      
      {showAbout && <AboutModal isOpen={showAbout} onClose={() => setShowAbout(false)} />}
    </div>
  );
};