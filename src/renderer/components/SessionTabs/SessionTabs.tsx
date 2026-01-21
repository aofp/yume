import React, { useState, useEffect, useRef, DragEvent } from 'react';
import { IconX, IconPlus, IconFolder, IconFolderOpen, IconBolt, IconTrash, IconChevronDown, IconClock, IconChartBar } from '@tabler/icons-react';
import { useClaudeCodeStore } from '../../stores/claudeCodeStore';
import { AnalyticsModal } from '../Analytics/AnalyticsModal';
import { LoadingIndicator } from '../LoadingIndicator/LoadingIndicator';
import { isVSCode } from '../../services/tauriApi';
import { APP_NAME, appStorageKey } from '../../config/app';
import { toastService } from '../../services/toastService';
// RecentProjectsModal removed - handled by ClaudeChat component instead
import './SessionTabs.css';

// Format streaming time for tab display - single line only
const formatTabTime = (seconds: number): string => {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const mins = Math.floor(seconds / 60);
  return `${mins}m`;
};

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
    interruptSession,
    forkSession,
    claudeMdTokens,
    calculateClaudeMdTokens,
    vscodeConnected
  } = useClaudeCodeStore();

  // Platform detection for keyboard shortcuts
  const isMac = navigator.platform.toLowerCase().includes('mac');
  const modKey = isMac ? 'cmd' : 'ctrl';

  const [showNewMenu, setShowNewMenu] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; sessionId: string } | null>(null);
  // Recent modal state removed - handled by ClaudeChat component
  const [recentProjects, setRecentProjects] = useState<any[]>([]);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [hasRecentProjects, setHasRecentProjects] = useState(false);
  const [renamingTab, setRenamingTab] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameInputWidth, setRenameInputWidth] = useState(16);
  const RECENT_PROJECTS_KEY = appStorageKey('recent-projects');
  
  // Helper function to measure text width
  const measureTextWidth = (text: string): number => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return text.length * 6 + 5;
    context.font = '9px "Agave", "Fira Code", monospace';
    return Math.ceil(context.measureText(text).width) + 5;
  };
  const [draggedTab, setDraggedTab] = useState<string | null>(null);

  // Helper to get fallback title for a session (used when claudeTitle is empty)
  const getFallbackTitle = (session: any) => {
    // If session has a valid title (not empty, not "new session"), use it
    if (session.claudeTitle && session.claudeTitle !== 'new session') return session.claudeTitle;
    // If session has originalTabNumber, use that
    if (session.originalTabNumber) return `tab ${session.originalTabNumber}`;
    // Otherwise calculate next available tab number
    const tabNumbers = sessions
      .map(s => {
        const match = (s as any).claudeTitle?.match(/^tab (\d+)$/);
        return match ? parseInt(match[1]) : 0;
      })
      .filter(n => n > 0);
    const tabNumber = tabNumbers.length > 0 ? Math.max(...tabNumbers) + 1 : 1;
    return `tab ${tabNumber}`;
  };
  const [dragOverTab, setDragOverTab] = useState<string | null>(null);
  const [dragOverNewTab, setDragOverNewTab] = useState(false);
  
  // Calculate CLAUDE.md tokens on mount if not already done
  useEffect(() => {
    if (claudeMdTokens === 0) {
      calculateClaudeMdTokens();
    }
  }, [claudeMdTokens, calculateClaudeMdTokens]);
  const [dragOverRecent, setDragOverRecent] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number } | null>(null);
  const [streamingTimes, setStreamingTimes] = useState<{ [sessionId: string]: number }>({});
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  // Timer effect for streaming sessions
  useEffect(() => {
    const hasStreamingSessions = sessions.some(s => s.streaming && (s as any).thinkingStartTime);
    if (!hasStreamingSessions) {
      setStreamingTimes({});
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now();
      const times: { [sessionId: string]: number } = {};
      sessions.forEach(s => {
        if (s.streaming && (s as any).thinkingStartTime) {
          times[s.id] = Math.floor((now - (s as any).thinkingStartTime) / 1000);
        }
      });
      setStreamingTimes(times);
    }, 1000);

    // Initial calculation
    const now = Date.now();
    const initialTimes: { [sessionId: string]: number } = {};
    sessions.forEach(s => {
      if (s.streaming && (s as any).thinkingStartTime) {
        initialTimes[s.id] = Math.floor((now - (s as any).thinkingStartTime) / 1000);
      }
    });
    setStreamingTimes(initialTimes);

    return () => clearInterval(interval);
  }, [sessions.map(s => `${s.id}-${s.streaming}-${(s as any).thinkingStartTime}`).join(',')]);

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
      const stored = localStorage.getItem(RECENT_PROJECTS_KEY);
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

  // Custom scrollbar refs
  const scrollbarTrackRef = useRef<HTMLDivElement>(null);
  const scrollbarThumbRef = useRef<HTMLDivElement>(null);
  const [hasOverflow, setHasOverflow] = useState(false);

  // Custom scrollbar logic
  useEffect(() => {
    const container = tabsContainerRef.current;
    const track = scrollbarTrackRef.current;
    const thumb = scrollbarThumbRef.current;
    if (!container || !track || !thumb) return;

    const updateScrollbar = () => {
      const overflow = container.scrollWidth > container.clientWidth;
      setHasOverflow(overflow);

      if (overflow) {
        container.classList.add('has-overflow');
        // Calculate thumb width and position
        const scrollRatio = container.clientWidth / container.scrollWidth;
        const thumbWidth = Math.max(container.clientWidth * scrollRatio, 20); // min 20px
        const maxScroll = container.scrollWidth - container.clientWidth;
        const scrollProgress = maxScroll > 0 ? container.scrollLeft / maxScroll : 0;
        const thumbPosition = scrollProgress * (container.clientWidth - thumbWidth);

        thumb.style.width = `${thumbWidth}px`;
        thumb.style.left = `${thumbPosition}px`;
      } else {
        container.classList.remove('has-overflow');
      }
    };

    // Update on scroll
    container.addEventListener('scroll', updateScrollbar);
    updateScrollbar();

    // Also check on window resize
    window.addEventListener('resize', updateScrollbar);

    // Watch for container size changes
    const resizeObserver = new ResizeObserver(updateScrollbar);
    resizeObserver.observe(container);

    // Drag scrollbar thumb
    let isDraggingThumb = false;
    let startX = 0;
    let startScrollLeft = 0;

    const handleThumbMouseDown = (e: MouseEvent) => {
      isDraggingThumb = true;
      startX = e.clientX;
      startScrollLeft = container.scrollLeft;
      track.classList.add('visible');
      e.preventDefault();
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingThumb) return;
      const scrollRatio = container.scrollWidth / container.clientWidth;
      const dx = e.clientX - startX;
      container.scrollLeft = startScrollLeft + dx * scrollRatio;
    };

    const handleMouseUp = () => {
      if (isDraggingThumb) {
        isDraggingThumb = false;
        track.classList.remove('visible');
      }
    };

    thumb.addEventListener('mousedown', handleThumbMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      container.removeEventListener('scroll', updateScrollbar);
      window.removeEventListener('resize', updateScrollbar);
      resizeObserver.disconnect();
      thumb.removeEventListener('mousedown', handleThumbMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [sessions]);

  // Scroll active tab into view when it changes
  useEffect(() => {
    if (!currentSessionId) return;
    
    const tabElement = tabRefs.current[currentSessionId];
    const container = tabsContainerRef.current;
    
    if (tabElement && container) {
      // Small delay to ensure DOM is updated
      setTimeout(() => {
        const tabRect = tabElement.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        
        // Check if tab is not fully visible
        const isFullyVisible = 
          tabRect.left >= containerRect.left && 
          tabRect.right <= containerRect.right;
        
        if (!isFullyVisible) {
          // Scroll the tab into view smoothly
          tabElement.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'center'
          });
        }
      }, 100);
    }
  }, [currentSessionId]);

  // Handle close tab event from Electron menu (Cmd+W on macOS)
  useEffect(() => {
    const handleCloseTab = () => {
      // Request close through the confirmation system
      if (currentSessionId) {
        requestCloseTabs([currentSessionId], 'single');
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
  }, [currentSessionId]);

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
        const stored = localStorage.getItem(RECENT_PROJECTS_KEY);
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
        ].slice(0, 10);

        localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(updated));

        // Update hasRecentProjects state
        setHasRecentProjects(true);

        // Create a new session with the selected directory
        console.log('Creating new session with directory:', directory);
        await createSession(undefined, directory);
      }
    }, 0);
  };


  // Helper to request tab close with confirmation dialog if needed
  const requestCloseTabs = (sessionIds: string[], action: 'single' | 'others' | 'all' | 'left' | 'right') => {
    const event = new CustomEvent('request-close-tabs', {
      detail: { sessionIds, action }
    });
    window.dispatchEvent(event);
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
        <div className={`tabs-scroll-container ${hasOverflow ? 'has-overflow' : ''}`}>
          <div className="tabs-scrollable" ref={tabsContainerRef}>
          {sessions.map((session) => (
          <div
            key={session.id}
            ref={(el) => { tabRefs.current[session.id] = el; }}
            data-session-id={session.id}
            className={`session-tab ${currentSessionId === session.id ? 'active' : ''} ${draggedTab === session.id ? 'dragging' : ''} ${dragOverTab === session.id ? 'drag-over' : ''}`}
            onClick={(e) => {
              if (!isDragging) {
                // Always switch to the clicked tab (removed rename on single click)
                if (currentSessionId !== session.id) {
                  resumeSession(session.id);
                  
                  // Scroll tab into view if partially visible
                  const tabElement = tabRefs.current[session.id];
                  const container = tabsContainerRef.current;
                  if (tabElement && container) {
                    const tabRect = tabElement.getBoundingClientRect();
                    const containerRect = container.getBoundingClientRect();
                    
                    // Check if tab is not fully visible
                    const isFullyVisible = 
                      tabRect.left >= containerRect.left && 
                      tabRect.right <= containerRect.right;
                    
                    if (!isFullyVisible) {
                      // Scroll the tab into view smoothly
                      tabElement.scrollIntoView({
                        behavior: 'smooth',
                        block: 'nearest',
                        inline: 'center'
                      });
                    }
                  }
                }
              }
            }}
            onDoubleClick={(e) => {
              // Double-click to rename any tab
              e.stopPropagation();
              const title = getFallbackTitle(session);
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
                const zoomLevel = parseFloat(document.body.style.zoom || '1');
                // Adjust for zoom: rect is in screen coords, clientX/Y need to be scaled
                const x = (e.clientX - rect.left) / zoomLevel;
                const y = (e.clientY - rect.top) / zoomLevel;
                
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

                // Calculate offset from click to tab's top-left corner for natural dragging
                const tabElement = document.querySelector(`[data-session-id="${session.id}"]`) as HTMLElement;
                const tabRect = tabElement?.getBoundingClientRect();
                const zoomLevel = parseFloat(document.body.style.zoom || '1');
                const clickOffsetX = tabRect ? (e.clientX - tabRect.left) / zoomLevel : 0;
                const clickOffsetY = tabRect ? (e.clientY - tabRect.top) / zoomLevel : 0;

                // Track velocity for physics-based rotation
                let lastX = startX;
                let lastY = startY;
                let velocityX = 0;
                let velocityY = 0;
                let currentRotation = 0;
                let targetRotation = 0;
                let animationFrame: number | null = null;

                // Create drag preview - clone the actual tab
                const createDragPreview = () => {
                  const tabElement = document.querySelector(`[data-session-id="${session.id}"]`) as HTMLElement;
                  if (!tabElement) return null;

                  const preview = tabElement.cloneNode(true) as HTMLElement;
                  preview.style.cssText = `
                    position: fixed;
                    pointer-events: none !important;
                    z-index: 10001;
                    opacity: 1;
                    transform: rotate(0deg);
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
                    useClaudeCodeStore.getState().setIsDraggingTab(true);
                    dragPreview = createDragPreview();
                    document.body.classList.add('tab-dragging');
                    // Force cursor change immediately
                    document.body.style.cursor = 'grabbing';
                    console.log('Started dragging:', session.id);
                  }
                  
                  if (moved) {
                    // Update drag preview position - use click offset for natural dragging
                    if (dragPreview) {
                      // Get zoom level from body style or default to 1
                      const currentZoom = parseFloat(document.body.style.zoom || '1');
                      const newX = moveEvent.clientX / currentZoom - clickOffsetX;
                      const newY = moveEvent.clientY / currentZoom - clickOffsetY;

                      // Calculate velocity (smoothed)
                      const rawVelocityX = moveEvent.clientX - lastX;
                      const rawVelocityY = moveEvent.clientY - lastY;
                      velocityX = velocityX * 0.7 + rawVelocityX * 0.3;
                      velocityY = velocityY * 0.7 + rawVelocityY * 0.3;
                      lastX = moveEvent.clientX;
                      lastY = moveEvent.clientY;

                      // Calculate target rotation based on horizontal velocity
                      // Max rotation of ~8 degrees, scaled by velocity
                      targetRotation = Math.max(-8, Math.min(8, velocityX * 0.5));

                      // Smoothly interpolate current rotation toward target
                      if (animationFrame === null) {
                        const animate = () => {
                          // Ease toward target rotation
                          currentRotation += (targetRotation - currentRotation) * 0.15;

                          // Apply damping when velocity is low (spring back to 0)
                          if (Math.abs(velocityX) < 0.5) {
                            targetRotation *= 0.9;
                          }

                          if (dragPreview) {
                            dragPreview.style.transform = `rotate(${currentRotation}deg)`;
                          }

                          // Continue animation while dragging
                          if (dragPreview) {
                            animationFrame = requestAnimationFrame(animate);
                          }
                        };
                        animationFrame = requestAnimationFrame(animate);
                      }

                      dragPreview.style.left = `${newX}px`;
                      dragPreview.style.top = `${newY}px`;
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
                  // Cancel rotation animation
                  if (animationFrame !== null) {
                    cancelAnimationFrame(animationFrame);
                    animationFrame = null;
                  }

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
                  useClaudeCodeStore.getState().setIsDraggingTab(false);
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
                  // tokens.total already includes all tokens (input + output + cache)
                  const totalTokens = (session as any).analytics?.tokens?.total || 0;
                  const contextMax = 200000; // 200k context window
                  // Calculate real percentage (can exceed 100%)
                  const rawPercentage = (totalTokens / contextMax) * 100;
                  // For visual bar, cap at 100%
                  const barPercentage = Math.min(rawPercentage, 100);


                  // Check if pending auto-compact (will compact on next message)
                  const isPendingCompact = (session as any).compactionState?.pendingAutoCompact;

                  // Color: accent color with opacity based on thresholds
                  const getColor = (pct: number) => {
                    if (isPendingCompact) return 'rgba(var(--negative-rgb), 1.0)'; // Full negative - pending compact
                    if (pct >= 50) return 'rgba(var(--accent-rgb), 1.0)'; // Full accent at 50%+
                    if (pct >= 40) return 'rgba(var(--accent-rgb), 0.8)'; // Medium accent at 40%+
                    return 'rgba(var(--accent-rgb), 0.6)'; // Faint accent below 40%
                  };

                  return (
                    <div
                      className="context-bar-fill"
                      style={{
                        height: `${barPercentage}%`,
                        background: getColor(rawPercentage)
                      }}
                    />
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
                <span className="tab-title">
                  {getFallbackTitle(session)}
                </span>
              )}
            </div>
            {/* Streaming timer - fixed width, only shows text when streaming */}
            <div className={`tab-streaming-timer ${renamingTab === session.id ? 'renaming' : ''}`}>
              {session.streaming && streamingTimes[session.id] !== undefined && formatTabTime(streamingTimes[session.id])}
            </div>
            {/* Show loading icon for pending sessions, streaming, or bash running */}
            {(session.status === 'pending' || session.streaming || (session as any).runningBash || (session as any).userBashRunning) ? (
              <div className="tab-progress">
                <LoadingIndicator size="small" color="red" />
              </div>
            ) : (
              // Hide close button in vscode mode
              !isVSCode() && (
                <button
                  className="tab-close"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    requestCloseTabs([session.id], 'single');
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation(); // Prevent tab drag when clicking close
                  }}
                >
                  <IconX size={14} stroke={1.5} />
                </button>
              )
            )}
            {/* Todo progress bar at bottom of tab */}
            {(() => {
              const todos = (session as any).todos;
              if (!todos || !Array.isArray(todos) || todos.length === 0) return null;
              const completed = todos.filter((t: any) => t.status === 'completed').length;
              const inProgress = todos.filter((t: any) => t.status === 'in_progress').length;
              const total = todos.length;
              const completedPct = (completed / total) * 100;
              const inProgressPct = (inProgress / total) * 100;
              // Hide when 100% complete and not streaming
              if (completedPct === 100 && !session.streaming) return null;
              // Hide if nothing to show
              if (completedPct === 0 && inProgressPct === 0) return null;
              return (
                <>
                  {completedPct > 0 && (
                    <div
                      className="tab-todo-progress"
                      style={{ width: `${completedPct}%` }}
                    />
                  )}
                  {inProgressPct > 0 && (
                    <div
                      className="tab-todo-progress in-progress"
                      style={{ width: `${inProgressPct}%`, left: `${completedPct}%` }}
                    />
                  )}
                </>
              );
            })()}
          </div>
        ))}
          </div>
          {hasOverflow && (
            <div className="custom-scrollbar-track" ref={scrollbarTrackRef}>
              <div className="custom-scrollbar-thumb" ref={scrollbarThumbRef} />
            </div>
          )}
        </div>

        {/* Action buttons - always visible outside scroll container */}
        {/* Hide new tab and recent projects buttons in vscode mode */}
        {!isVSCode() && (
        <div className={`tabs-actions ${hasOverflow ? 'sticky' : ''} ${sessions.length === 0 ? 'no-tabs' : ''}`}>
          <button
            className={`tab-new ${dragOverNewTab ? 'drag-over-duplicate' : ''}`}
            onClick={handleOpenFolder}
            onMouseDown={(e) => {
              if (e.button === 0) { // Left click only
                const target = e.currentTarget;
                const rect = target.getBoundingClientRect();
                const zoomLevel = parseFloat(document.body.style.zoom || '1');
                const x = (e.clientX - rect.left) / zoomLevel;
                const y = (e.clientY - rect.top) / zoomLevel;

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
                  const workingDir = (sessionToDuplicate as any).workingDirectory;
                  // Only duplicate with a working directory if one exists
                  if (workingDir) {
                    createSession(undefined, workingDir);
                  } else {
                    // Create a new empty session if no working directory
                    createSession();
                  }
                }
                
                // Trigger mouseup on document to ensure global handlers clean up
                // This is needed because we prevented propagation above
                setTimeout(() => {
                  const mouseUpEvent = new MouseEvent('mouseup', {
                    bubbles: true,
                    cancelable: true,
                    clientX: e.clientX,
                    clientY: e.clientY,
                    button: e.button
                  });
                  document.dispatchEvent(mouseUpEvent);
                }, 0);
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.classList.remove('ripple-held');
              
              if (isDragging) {
                setDragOverNewTab(false);
              }
            }}
            title={draggedTab ? "drop to duplicate" : `new tab (${modKey}+t)`}
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
                  const zoomLevel = parseFloat(document.body.style.zoom || '1');
                  const x = (e.clientX - rect.left) / zoomLevel;
                  const y = (e.clientY - rect.top) / zoomLevel;

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
                      const stored = localStorage.getItem(RECENT_PROJECTS_KEY);
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
                      ].slice(0, 10);

                      localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(updated));
                      setHasRecentProjects(true);

                      // Optionally create a new tab with this project
                      createSession(undefined, workingDir);
                    }
                  }
                  
                  // Trigger mouseup on document to ensure global handlers clean up
                  const mouseUpEvent = new MouseEvent('mouseup', {
                    bubbles: true,
                    cancelable: true,
                    clientX: e.clientX,
                    clientY: e.clientY,
                    button: e.button
                  });
                  document.dispatchEvent(mouseUpEvent);
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
              title={`recent projects (${modKey}+r)`}
            >
              <IconChevronDown size={16} stroke={1.5} />
            </button>
          )}
        </div>
        )}
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
                const stored = localStorage.getItem(RECENT_PROJECTS_KEY);
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
                ].slice(0, 10);

                localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(updated));
                setHasRecentProjects(true);
              }

              createSession(undefined, workingDir);
              toastService.info('tab duplicated');
            }
            setContextMenu(null);
          }}>duplicate tab ({modKey}+d)</button>

          <button onClick={async () => {
            const targetSession = sessions.find(s => s.id === contextMenu.sessionId);
            if (targetSession && targetSession.messages.length > 0) {
              await forkSession(contextMenu.sessionId);
              toastService.info('session forked');
            }
            setContextMenu(null);
          }} disabled={!sessions.find(s => s.id === contextMenu.sessionId)?.messages.length} style={{
            opacity: sessions.find(s => s.id === contextMenu.sessionId)?.messages.length ? 1 : 0.3
          }}>fork session ({modKey}+shift+d)</button>

          <button onClick={() => {
            const session = sessions.find(s => s.id === contextMenu.sessionId);
            if (session) {
              const title = getFallbackTitle(session);
              setRenameValue(title);
              setRenameInputWidth(measureTextWidth(title));
              setRenamingTab(contextMenu.sessionId);
              setContextMenu(null);
            }
          }}>rename tab (double click)</button>
          
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
                      toastService.info('context cleared');
                      setContextMenu(null);
                    }
                  }}
                  disabled={!hasMessages}
                  style={{
                    opacity: hasMessages ? 1 : 0.3,
                    cursor: 'default'
                  }}
                >clear session ({modKey}+l)</button>
              </>
            );
          })()}
          
          <div className="separator" />
          
          <button onClick={() => {
            requestCloseTabs([contextMenu.sessionId], 'single');
            setContextMenu(null);
          }}>close ({modKey}+w)</button>

          <button onClick={() => {
            const targetSession = sessions.find(s => s.id === contextMenu.sessionId);
            if (targetSession) {
              // First switch to the target session
              resumeSession(targetSession.id);
              // Then request close all others
              const otherIds = sessions.filter(s => s.id !== targetSession.id).map(s => s.id);
              if (otherIds.length > 0) {
                requestCloseTabs(otherIds, 'others');
              }
            }
            setContextMenu(null);
          }}>close others</button>

          <button onClick={() => {
            const sessionIndex = sessions.findIndex(s => s.id === contextMenu.sessionId);
            const idsToClose = sessions.filter((_, idx) => idx > sessionIndex).map(s => s.id);
            if (idsToClose.length > 0) {
              requestCloseTabs(idsToClose, 'right');
            }
            setContextMenu(null);
          }}>close all to right</button>

          <button onClick={() => {
            const sessionIndex = sessions.findIndex(s => s.id === contextMenu.sessionId);
            const idsToClose = sessions.filter((_, idx) => idx < sessionIndex).map(s => s.id);
            if (idsToClose.length > 0) {
              requestCloseTabs(idsToClose, 'left');
            }
            setContextMenu(null);
          }}>close all to left</button>

          <button onClick={() => {
            const allIds = sessions.map(s => s.id);
            requestCloseTabs(allIds, 'all');
            setContextMenu(null);
          }}>close all</button>
          
          <div className="separator" />
          
          <button onClick={() => {
            window.dispatchEvent(new CustomEvent('showAboutModal'));
            setContextMenu(null);
          }}>about</button>
        </div>
      )}

      {/* RecentProjectsModal removed - handled by ClaudeChat component */}
    </div>
  );
};
