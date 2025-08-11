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

  const handleOpenFolder = async () => {
    setShowNewMenu(false);
    let directory = null;
    
    // Debug log
    console.log('electronAPI available?', !!window.electronAPI);
    console.log('electronAPI.folder?', !!window.electronAPI?.folder);
    console.log('electronAPI.folder.select?', !!window.electronAPI?.folder?.select);
    
    if (window.electronAPI?.folder?.select) {
      console.log('Calling folder.select()...');
      try {
        directory = await window.electronAPI.folder.select();
        console.log('Folder select returned:', directory);
        if (!directory) {
          // User cancelled folder selection
          console.log('User cancelled folder selection');
          return;
        }
      } catch (error) {
        console.log('Folder selection failed:', error);
        // Fall back to current directory
        directory = await window.electronAPI?.folder?.getCurrent?.() || '/';
        console.log('Using fallback directory:', directory);
      }
    } else {
      // Just use root directory as fallback
      console.log('electronAPI not available, using root directory');
      directory = '/';
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
    
    // Remove the class after animation completes
    setTimeout(() => {
      target.classList.remove('ripple-active');
    }, 400);
  };

  return (
    <div className="session-tabs">
      <div className="tabs-wrapper">
        <div className="tabs-scrollable" ref={tabsContainerRef}>
          {sessions.map((session) => (
          <div
            key={session.id}
            className={`session-tab ${currentSessionId === session.id ? 'active' : ''} ${draggedTab === session.id ? 'dragging' : ''} ${dragOverTab === session.id ? 'drag-over' : ''}`}
            onClick={() => resumeSession(session.id)}
            onMouseDown={handleRipple}
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
              <span className="tab-name">{
                // Generate a consistent 3-char ID from the session ID
                session.id.split('-').pop()?.substring(0, 3) || 
                Math.random().toString(36).substring(2, 5)
              }</span>
              {(session as any).workingDirectory && (
                <span className="tab-folder">
                  {getDisplayPath((session as any).workingDirectory)}
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
              // Add held class if mouse is held down
              const target = e.currentTarget;
              const timeout = setTimeout(() => {
                target.classList.add('ripple-held');
              }, 200);
              target.setAttribute('data-timeout', timeout.toString());
            }}
            onMouseUp={(e) => {
              const target = e.currentTarget;
              const timeout = target.getAttribute('data-timeout');
              if (timeout) clearTimeout(parseInt(timeout));
              target.classList.remove('ripple-held');
            }}
            onMouseLeave={(e) => {
              const target = e.currentTarget;
              const timeout = target.getAttribute('data-timeout');
              if (timeout) clearTimeout(parseInt(timeout));
              target.classList.remove('ripple-held');
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
              onMouseDown={handleRipple}
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