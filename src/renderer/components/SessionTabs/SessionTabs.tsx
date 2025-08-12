import React, { useState, useEffect, useRef, DragEvent } from 'react';
import { IconX, IconPlus, IconFolder, IconLoader2, IconFolderOpen, IconBolt, IconTrash, IconChevronDown } from '@tabler/icons-react';
import { useClaudeCodeStore } from '../../stores/claudeCodeStore';
import { AboutModal } from '../About/AboutModal';
import './SessionTabs.css';

export const SessionTabs: React.FC = () => {
  const { 
    sessions, 
    currentSessionId, 
    createSession, 
    deleteSession,
    deleteAllSessions,
    resumeSession,
    reorderSessions
  } = useClaudeCodeStore();

  const [showNewMenu, setShowNewMenu] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; sessionId: string } | null>(null);
  const [showRecentModal, setShowRecentModal] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [hasRecentProjects, setHasRecentProjects] = useState(false);
  const [draggedTab, setDraggedTab] = useState<string | null>(null);
  const [dragOverTab, setDragOverTab] = useState<string | null>(null);
  const [dragOverNewTab, setDragOverNewTab] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const tabsContainerRef = useRef<HTMLDivElement>(null);

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
        const windowApi = await import('@tauri-apps/api/window');
        
        // Try to get appWindow from various possible exports
        let appWindow;
        if (windowApi.getCurrent) {
          appWindow = windowApi.getCurrent();
        } else if (windowApi.appWindow) {
          appWindow = windowApi.appWindow;
        } else if ((windowApi as any).default?.getCurrent) {
          appWindow = (windowApi as any).default.getCurrent();
        } else if ((windowApi as any).default?.appWindow) {
          appWindow = (windowApi as any).default.appWindow;
        }
        
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
        } catch {
          setHasRecentProjects(false);
        }
      } else {
        setHasRecentProjects(false);
      }
    };
    
    checkRecentProjects();
    // Check again when modal closes
    if (!showRecentModal) {
      checkRecentProjects();
    }
  }, [showRecentModal]);

  // Handle vertical scroll as horizontal scroll on tabs container
  useEffect(() => {
    const container = tabsContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      // Prevent default vertical scroll
      e.preventDefault();
      // Apply vertical scroll delta as horizontal scroll
      container.scrollLeft += e.deltaY;
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

  // Also handle keyboard shortcut directly
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Handle Cmd+W (Mac) or Ctrl+W (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
        e.preventDefault(); // Prevent default browser behavior
        
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
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentSessionId, deleteSession, sessions]);

  const handleOpenFolder = async () => {
    setShowNewMenu(false);
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
        // Fall back to current directory
        directory = await window.electronAPI?.folder?.getCurrent?.() || '/';
        console.log('Using fallback directory:', directory);
      }
    } 
    
    if (!directory) {
      // Just use root directory as fallback
      console.log('No folder selection method available, using /Users');
      directory = '/Users';
    }
    
    // Save to recent projects if it's not the root directory
    if (directory && directory !== '/') {
      const name = directory.split(/[/\\]/).pop() || directory;
      const newProject = { path: directory, name, lastOpened: new Date() };
      
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
  };


  const getDisplayPath = (path?: string) => {
    if (!path) return '';
    // Show only the last directory name
    // Handle both Windows and Unix paths
    const parts = path.split(/[\\/]/).filter(p => p);
    return parts[parts.length - 1] || '';
  };

  const handleRipple = (e: React.MouseEvent<HTMLElement>) => {
    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    target.style.setProperty('--ripple-x', `${x}%`);
    target.style.setProperty('--ripple-y', `${y}%`);
    
    // Add a class to trigger the ripple animation
    target.classList.add('ripple-active');
    
    // Remove the class after animation completes (increased duration)
    setTimeout(() => {
      target.classList.remove('ripple-active');
    }, 1200);
  };

  return (
    <div className="session-tabs" data-tauri-drag-region>
      <div className="tabs-wrapper">
        <div className="tabs-scrollable" ref={tabsContainerRef}>
          {sessions.map((session) => (
          <div
            key={session.id}
            className={`session-tab ${currentSessionId === session.id ? 'active' : ''} ${draggedTab === session.id ? 'dragging' : ''} ${dragOverTab === session.id ? 'drag-over' : ''}`}
            onClick={() => resumeSession(session.id)}
            onMouseDown={(e) => {
              handleRipple(e);
              e.currentTarget.classList.add('ripple-held');
            }}
            onMouseUp={(e) => e.currentTarget.classList.remove('ripple-held')}
            onMouseLeave={(e) => e.currentTarget.classList.remove('ripple-held')}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({ x: e.clientX, y: e.clientY, sessionId: session.id });
            }}
            draggable
            onDragStart={(e: DragEvent<HTMLDivElement>) => {
              setDraggedTab(session.id);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragEnd={() => {
              setDraggedTab(null);
              setDragOverTab(null);
              setDragOverNewTab(false);
            }}
            onDragOver={(e: DragEvent<HTMLDivElement>) => {
              e.preventDefault();
              if (draggedTab && draggedTab !== session.id) {
                setDragOverTab(session.id);
              }
            }}
            onDragLeave={() => {
              setDragOverTab(null);
            }}
            onDrop={(e: DragEvent<HTMLDivElement>) => {
              e.preventDefault();
              if (draggedTab && draggedTab !== session.id) {
                const fromIndex = sessions.findIndex(s => s.id === draggedTab);
                const toIndex = sessions.findIndex(s => s.id === session.id);
                if (fromIndex !== -1 && toIndex !== -1) {
                  reorderSessions(fromIndex, toIndex);
                }
              }
              setDraggedTab(null);
              setDragOverTab(null);
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
              {(session as any).claudeTitle && (
                <span className="tab-title">
                  {(session as any).claudeTitle}
                </span>
              )}
            </div>
            {/* Show loading icon for pending sessions or streaming */}
            {(session.status === 'pending' || session.streaming) ? (
              <div className="tab-progress">
                <IconLoader2 className="tab-streaming-icon" size={14} />
              </div>
            ) : (
              <button
                className="tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteSession(session.id);
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
              handleRipple(e);
              e.currentTarget.classList.add('ripple-held');
            }}
            onMouseUp={(e) => {
              e.currentTarget.classList.remove('ripple-held');
            }}
            onMouseLeave={(e) => {
              e.currentTarget.classList.remove('ripple-held');
            }}
            title={draggedTab ? "drop to duplicate" : "new tab (ctrl+t)"}
            onDragOver={(e: DragEvent<HTMLButtonElement>) => {
              if (draggedTab) {
                e.preventDefault();
                setDragOverNewTab(true);
              }
            }}
            onDragLeave={() => {
              setDragOverNewTab(false);
            }}
            onDrop={(e: DragEvent<HTMLButtonElement>) => {
              e.preventDefault();
              if (draggedTab) {
                // Find the dragged session and duplicate it
                const sessionToDuplicate = sessions.find(s => s.id === draggedTab);
                if (sessionToDuplicate) {
                  const workingDir = (sessionToDuplicate as any)?.workingDirectory;
                  createSession(undefined, workingDir || '/');
                }
              }
              setDraggedTab(null);
              setDragOverNewTab(false);
            }}
          >
            <IconPlus size={16} stroke={1.5} />
          </button>
          
          {hasRecentProjects && (
            <button 
              className="tab-recent" 
              onClick={() => setShowRecentModal(true)}
              onMouseDown={(e) => {
                handleRipple(e);
                e.currentTarget.classList.add('ripple-held');
              }}
              onMouseUp={(e) => e.currentTarget.classList.remove('ripple-held')}
              onMouseLeave={(e) => e.currentTarget.classList.remove('ripple-held')}
              title="recent projects (ctrl+r)"
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
            left: contextMenu.x > window.innerWidth - 200 ? contextMenu.x - 150 : contextMenu.x, 
            top: contextMenu.y > window.innerHeight - 250 ? contextMenu.y - 200 : contextMenu.y 
          }}
        >
          <button onClick={() => {
            const session = sessions.find(s => s.id === contextMenu.sessionId);
            const workingDir = (session as any)?.workingDirectory;
            if (workingDir) {
              // Save to recent projects if it's not the root directory
              if (workingDir !== '/') {
                const name = workingDir.split(/[/\\]/).pop() || workingDir;
                const newProject = { path: workingDir, name, lastOpened: new Date() };
                
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
          
          <div className="separator" />
          
          <button onClick={() => {
            const targetSession = sessions.find(s => s.id === contextMenu.sessionId);
            if (targetSession) {
              // First switch to the target session
              resumeSession(targetSession.id);
              // Then delete all others
              sessions.forEach(s => {
                if (s.id !== targetSession.id) deleteSession(s.id);
              });
            }
            setContextMenu(null);
          }}>close others</button>
          
          <button onClick={() => {
            const sessionIndex = sessions.findIndex(s => s.id === contextMenu.sessionId);
            sessions.forEach((s, idx) => {
              if (idx > sessionIndex) deleteSession(s.id);
            });
            setContextMenu(null);
          }}>close all to right</button>
          
          <button onClick={() => {
            const sessionIndex = sessions.findIndex(s => s.id === contextMenu.sessionId);
            sessions.forEach((s, idx) => {
              if (idx < sessionIndex) deleteSession(s.id);
            });
            setContextMenu(null);
          }}>close all to left</button>
          
          <button onClick={() => {
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
      
      {showRecentModal && (
        <div 
          className="recent-modal-overlay"
          onClick={() => setShowRecentModal(false)}
        >
          <div 
            className="recent-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <span className="modal-title">recent projects</span>
              <button 
                className="clear-all-icon"
                onClick={() => {
                  if (confirm('clear all recent projects?')) {
                    localStorage.removeItem('yurucode-recent-projects');
                    setShowRecentModal(false);
                  }
                }}
                title="clear all"
              >
                <IconTrash size={14} />
              </button>
            </div>
            
            <div className="modal-content">
              {(() => {
                const stored = localStorage.getItem('yurucode-recent-projects');
                if (!stored) {
                  return <div className="no-recent">no recent projects</div>;
                }
                
                try {
                  const projects = JSON.parse(stored);
                  if (!projects || projects.length === 0) {
                    return <div className="no-recent">no recent projects</div>;
                  }
                  
                  return projects.map((project: any, idx: number) => (
                    <div key={idx} className="recent-item-container">
                      <button
                        className="recent-item"
                        onClick={async () => {
                          await createSession(undefined, project.path);
                          setShowRecentModal(false);
                        }}
                      >
                        <IconFolder size={14} />
                        <div className="recent-item-info">
                          <div className="recent-item-name">{project.name}</div>
                          <div className="recent-item-path">{project.path}</div>
                        </div>
                      </button>
                      <button
                        className="recent-item-remove"
                        onClick={() => {
                          const updated = projects.filter((_: any, i: number) => i !== idx);
                          if (updated.length > 0) {
                            localStorage.setItem('yurucode-recent-projects', JSON.stringify(updated));
                          } else {
                            localStorage.removeItem('yurucode-recent-projects');
                          }
                          // Force re-render
                          setShowRecentModal(false);
                          setTimeout(() => setShowRecentModal(true), 0);
                        }}
                        title="remove"
                      >
                        <IconX size={12} />
                      </button>
                    </div>
                  ));
                } catch (err) {
                  console.error('Failed to parse recent projects:', err);
                  return <div className="no-recent">no recent projects</div>;
                }
              })()}
            </div>
          </div>
        </div>
      )}
      
      {showAbout && <AboutModal isOpen={showAbout} onClose={() => setShowAbout(false)} />}
    </div>
  );
};