import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { IconFolder, IconFolderOpen, IconClock, IconHash, IconChevronRight, IconSearch, IconX, IconRefresh, IconArrowLeft, IconMessages } from '@tabler/icons-react';
import { claudeCodeClient } from '../../services/claudeCodeClient';
import { LoadingIndicator } from '../LoadingIndicator/LoadingIndicator';
import './ProjectsModal.css';

interface ClaudeSession {
  id: string;
  summary: string;
  title?: string; // Added title field
  timestamp: number;
  path: string;
  messageCount?: number;
}

interface ClaudeProject {
  path: string;
  name: string;
  sessions: ClaudeSession[];
  lastModified: number;
  sessionCount: number;
}

interface ProjectsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSession: (projectPath: string, sessionId: string, title?: string) => void;
}

export const ProjectsModal: React.FC<ProjectsModalProps> = ({ isOpen, onClose, onSelectSession }) => {
  const [projects, setProjects] = useState<ClaudeProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [projectCount, setProjectCount] = useState<number | null>(null);
  const [quickLoaded, setQuickLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [sessionSearchQuery, setSessionSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [lastLoadTime, setLastLoadTime] = useState<number>(0);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    type: 'project' | 'session';
    path: string;
    sessionId?: string;
  } | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [sessionsByProject, setSessionsByProject] = useState<{ [key: string]: ClaudeSession[] }>({});
  
  // Pagination state
  const [projectsOffset, setProjectsOffset] = useState(0);
  const [hasMoreProjects, setHasMoreProjects] = useState(true);
  const [loadingMoreProjects, setLoadingMoreProjects] = useState(false);
  const [sessionsOffset, setSessionsOffset] = useState<Record<string, number>>({});
  const [hasMoreSessions, setHasMoreSessions] = useState<Record<string, boolean>>({});
  const [loadingMoreSessions, setLoadingMoreSessions] = useState(false);
  
  // Refs for scroll containers
  const projectsListRef = useRef<HTMLDivElement>(null);
  const sessionsListRef = useRef<HTMLDivElement>(null);

  // load projects function  
  const loadProjects = useCallback(async (forceRefresh = false) => {
    // prevent loading if already loading or recently loaded (within 1 second)
    const now = Date.now();
    if (loading || (!forceRefresh && hasLoaded && now - lastLoadTime < 1000)) return;
    
    setError(null);
    setProjectCount(null);
    setQuickLoaded(false);
    // Clear sessions cache on refresh
    if (forceRefresh) {
      setSessionsByProject({});
    }
    try {
      const serverPort = claudeCodeClient.getServerPort();
      if (!serverPort) {
        throw new Error('server port not available');
      }
      
      // Load quick data IMMEDIATELY without waiting
      setLoading(true);
      fetch(`http://localhost:${serverPort}/claude-projects-quick?limit=20&offset=0`)
        .then(quickResponse => {
          if (quickResponse.ok) {
            return quickResponse.json();
          }
          throw new Error('Quick load failed');
        })
        .then(quickData => {
          setProjectCount(quickData.count);
          setProjects(quickData.projects || []);
          setProjectsOffset(20);
          setHasMoreProjects((quickData.projects || []).length === 20 && quickData.count > 20);
          setQuickLoaded(true);
          setLoading(false); // Stop showing loading IMMEDIATELY
          setHasLoaded(true);
          setLastLoadTime(Date.now());
          
          // Now load session counts and dates progressively for each project
          if (quickData.projects && quickData.projects.length > 0) {
            quickData.projects.forEach(async (project: ClaudeProject) => {
              try {
                // Load session count
                const countResponse = await fetch(`http://localhost:${serverPort}/claude-project-session-count/${encodeURIComponent(project.path)}`);
                if (countResponse.ok) {
                  const countData = await countResponse.json();
                  // Update the specific project's session count
                  setProjects(prev => prev.map(p => 
                    p.path === countData.projectName 
                      ? { ...p, sessionCount: countData.sessionCount }
                      : p
                  ));
                }
                
                // No need to load dates anymore - we get them immediately from the server!
              } catch (err) {
                console.error(`Failed to load data for ${project.name}:`, err);
              }
            });
          }
        })
        .catch(quickErr => {
          console.log('Quick load failed:', quickErr);
          setLoading(false);
          setError('Failed to load projects');
        });
      
      // Don't await, return immediately
      return;
    } catch (err) {
      console.error('error loading projects:', err);
      setError('failed to load projects');
      setProjects([]);
      setLoading(false);
    }
  }, [loading, hasLoaded, lastLoadTime]);

  // Load more projects when scrolling to bottom
  const loadMoreProjects = useCallback(async () => {
    if (loadingMoreProjects || !hasMoreProjects) return;
    
    try {
      const serverPort = claudeCodeClient.getServerPort();
      if (!serverPort) return;
      
      setLoadingMoreProjects(true);
      const response = await fetch(`http://localhost:${serverPort}/claude-projects-quick?limit=20&offset=${projectsOffset}`);
      
      if (response.ok) {
        const data = await response.json();
        const newProjects = data.projects || [];
        
        setProjects(prev => [...prev, ...newProjects]);
        setProjectsOffset(prev => prev + newProjects.length);
        setHasMoreProjects(newProjects.length === 20);
        
        // Load session counts for new projects
        newProjects.forEach(async (project: ClaudeProject) => {
          try {
            const countResponse = await fetch(`http://localhost:${serverPort}/claude-project-session-count/${encodeURIComponent(project.path)}`);
            if (countResponse.ok) {
              const countData = await countResponse.json();
              setProjects(prev => prev.map(p => 
                p.path === countData.projectName 
                  ? { ...p, sessionCount: countData.sessionCount }
                  : p
              ));
            }
          } catch (err) {
            console.error(`Failed to load data for ${project.name}:`, err);
          }
        });
      }
    } catch (err) {
      console.error('Error loading more projects:', err);
    } finally {
      setLoadingMoreProjects(false);
    }
  }, [loadingMoreProjects, hasMoreProjects, projectsOffset]);

  // load sessions for a specific project - stream them one by one
  const loadProjectSessions = useCallback(async (projectPath: string) => {
    console.log('🔍 [FRONTEND] Loading sessions for project:', projectPath);
    
    // Check if already loaded
    if (sessionsByProject[projectPath]) {
      console.log('✅ [FRONTEND] Sessions already loaded for:', projectPath);
      return;
    }
    
    setLoadingSessions(true);
    const sessions: ClaudeSession[] = [];
    
    try {
      const serverPort = claudeCodeClient.getServerPort();
      console.log('🔌 [FRONTEND] Server port:', serverPort);
      
      if (!serverPort) {
        throw new Error('server port not available');
      }
      
      const url = `http://localhost:${serverPort}/claude-project-sessions/${encodeURIComponent(projectPath)}`;
      console.log('📡 [FRONTEND] Streaming sessions from:', url);
      
      const response = await fetch(url);
      if (!response.ok) {
        console.error('❌ [FRONTEND] Failed response:', response.status, response.statusText);
        throw new Error('failed to load sessions');
      }
      
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      if (!reader) {
        throw new Error('No response body');
      }
      
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            if (dataStr.trim()) {
              try {
                const data = JSON.parse(dataStr);
                if (data.session) {
                  sessions.push(data.session);
                  console.log(`📄 [FRONTEND] Received session ${data.index + 1}/${data.total}`);
                  // Update immediately as each session arrives
                  setSessionsByProject(prev => ({
                    ...prev,
                    [projectPath]: [...sessions]
                  }));
                } else if (data.done) {
                  console.log('✅ [FRONTEND] All sessions loaded');
                } else if (data.error) {
                  console.error('❌ [FRONTEND] Server error:', data.message);
                }
              } catch (e) {
                console.error('Failed to parse SSE data:', e);
              }
            }
          }
        }
      }
      
      console.log(`✅ [FRONTEND] Got ${sessions.length} sessions for project`);
      
    } catch (err) {
      console.error('❌ [FRONTEND] Error loading project sessions:', err);
      setSessionsByProject(prev => ({
        ...prev,
        [projectPath]: []
      }));
    } finally {
      setLoadingSessions(false);
    }
  }, [sessionsByProject]);

  // load projects from server only when opened and not already loaded
  useEffect(() => {
    if (!isOpen || hasLoaded) return;
    loadProjects();
  }, [isOpen, hasLoaded, loadProjects]);

  // Auto-focus first item when modal opens or view changes
  useEffect(() => {
    if (isOpen && focusedIndex === -1) {
      setFocusedIndex(0);
    }
  }, [isOpen, selectedProject]);

  // filter projects based on search and sort by most recent first
  const filteredProjects = useMemo(() => {
    let filtered = projects;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = projects.filter(p => 
        p.name.toLowerCase().includes(query) ||
        p.sessions.some(s => s.summary?.toLowerCase().includes(query))
      );
    }
    // Sort by lastModified date (most recent first)
    return [...filtered].sort((a, b) => b.lastModified - a.lastModified);
  }, [projects, searchQuery]);

  // get sessions for selected project
  const selectedProjectData = useMemo(() => {
    if (!selectedProject) return null;
    return filteredProjects.find(p => p.path === selectedProject);
  }, [filteredProjects, selectedProject]);

  // Load sessions when project is selected
  useEffect(() => {
    console.log('🎯 [FRONTEND] useEffect triggered - selectedProject:', selectedProject);
    console.log('🎯 [FRONTEND] Sessions already loaded?', !!sessionsByProject[selectedProject]);
    
    if (selectedProject && !sessionsByProject[selectedProject]) {
      console.log('🚀 [FRONTEND] Loading sessions for selected project:', selectedProject);
      loadProjectSessions(selectedProject);
    }
  }, [selectedProject, sessionsByProject, loadProjectSessions]);

  // filter sessions based on search
  const filteredSessions = useMemo(() => {
    console.log('📋 [FRONTEND] Computing filtered sessions');
    console.log('  - selectedProject:', selectedProject);
    console.log('  - selectedProjectData:', selectedProjectData);
    console.log('  - sessionsByProject[selectedProject]:', sessionsByProject[selectedProject]);
    
    if (!selectedProjectData) return [];
    const sessions = sessionsByProject[selectedProject] || selectedProjectData.sessions || [];
    console.log('  - Final sessions array:', sessions);
    
    if (!sessionSearchQuery) return sessions;
    const query = sessionSearchQuery.toLowerCase();
    return sessions.filter(s => 
      s.summary?.toLowerCase().includes(query) ||
      s.id?.toLowerCase().includes(query)
    );
  }, [selectedProjectData, selectedProject, sessionsByProject, sessionSearchQuery]);

  const handleSelectSession = useCallback((projectPath: string, sessionId: string, title?: string) => {
    // Store title in localStorage
    if (title) {
      localStorage.setItem(`session-title-${sessionId}`, title);
    }
    onSelectSession(projectPath, sessionId, title);
    onClose();
  }, [onSelectSession, onClose]);

  const handleContextMenu = useCallback((e: React.MouseEvent, type: 'project' | 'session', path: string, sessionId?: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    // If ANY context menu is open, close it immediately!
    if (contextMenu) {
      setContextMenu(null);
      return;
    }
    
    // Otherwise open a new context menu
    const newMenu = {
      x: e.clientX,
      y: e.clientY,
      type,
      path,
      sessionId
    };
    setContextMenu(newMenu);
  }, [contextMenu]);

  // keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't navigate if search input is focused
      const isSearchFocused = document.activeElement === searchInputRef.current;
      
      if (e.key === 'Escape') {
        if (isSearchFocused) {
          setShowSearch(false);
          setSearchQuery('');
          setSessionSearchQuery('');
        } else if (selectedProject) {
          setSelectedProject(null);
          setFocusedIndex(-1);
        } else {
          onClose();
        }
      }
      
      // Ctrl+P to close modal
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        onClose();
      }
      
      // Ctrl+F to show/focus search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setShowSearch(true);
        // Clear appropriate search based on current view
        if (selectedProject) {
          setSessionSearchQuery('');
        } else {
          setSearchQuery('');
        }
        setTimeout(() => searchInputRef.current?.focus(), 10);
      }
      
      // F5 or Ctrl/Cmd+R to refresh
      if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.key === 'r')) {
        e.preventDefault();
        loadProjects(true);
      }
      
      // Arrow navigation (when search is not focused)
      if (!isSearchFocused) {
        const items = selectedProject ? filteredSessions : filteredProjects;
        const maxIndex = items.length - 1;
        
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (focusedIndex < maxIndex) {
            setFocusedIndex(focusedIndex + 1);
          } else {
            setFocusedIndex(0); // Wrap to start
          }
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (focusedIndex > 0) {
            setFocusedIndex(focusedIndex - 1);
          } else if (focusedIndex === -1) {
            setFocusedIndex(maxIndex); // Start from end if not focused
          } else {
            setFocusedIndex(maxIndex); // Wrap to end
          }
        } else if (e.key === 'Enter' || e.key === 'ArrowRight') {
          if (focusedIndex >= 0 && focusedIndex <= maxIndex) {
            e.preventDefault();
            if (selectedProject) {
              // In sessions view - select the session
              const session = filteredSessions[focusedIndex];
              if (session) {
                // Get title from localStorage or use session title/summary
                const storedTitle = localStorage.getItem(`session-title-${session.id}`);
                const title = storedTitle || session.title || session.summary;
                handleSelectSession(selectedProject, session.id, title);
              }
            } else {
              // In projects view - enter the project
              const project = filteredProjects[focusedIndex];
              if (project) {
                setSelectedProject(project.path);
                setFocusedIndex(0); // Reset focus for sessions list
              }
            }
          }
        } else if (e.key === 'ArrowLeft' || e.key === 'Backspace') {
          if (selectedProject && !isSearchFocused) {
            e.preventDefault();
            setSelectedProject(null);
            setSessionSearchQuery('');
            setShowSearch(false);
            setFocusedIndex(0); // Reset focus for projects list
          }
        } else if (e.key === 'Home') {
          e.preventDefault();
          setFocusedIndex(0);
        } else if (e.key === 'End') {
          e.preventDefault();
          setFocusedIndex(maxIndex);
        } else if (e.key === 'Delete' && focusedIndex >= 0) {
          // Open context menu for focused item
          e.preventDefault();
          const item = items[focusedIndex];
          if (item) {
            if (selectedProject) {
              // Session item
              const session = item as ClaudeSession;
              handleContextMenu(
                { preventDefault: () => {}, stopPropagation: () => {}, clientX: 100, clientY: 100 } as React.MouseEvent,
                'session',
                selectedProject,
                session.id
              );
            } else {
              // Project item
              const project = item as ClaudeProject;
              handleContextMenu(
                { preventDefault: () => {}, stopPropagation: () => {}, clientX: 100, clientY: 100 } as React.MouseEvent,
                'project',
                project.path
              );
            }
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedProject, onClose, loadProjects, focusedIndex, filteredProjects, filteredSessions, handleSelectSession, handleContextMenu]);

  const handleClearHistory = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    if (!contextMenu) return;
    
    // Store context info before clearing
    const contextType = contextMenu.type;
    const contextPath = contextMenu.path;
    const contextSessionId = contextMenu.sessionId;
    // Format project name inline to avoid dependency issues
    const projectName = contextPath
      .replace(/^-/, '/')
      .replace(/-/g, '/')
      .split('/')
      .pop() || contextPath;
    
    // Close context menu FIRST
    setContextMenu(null);
    
    // Show confirmation dialog
    const confirmMessage = contextType === 'project' 
      ? `clear all history for "${projectName}"?`
      : `clear this session history?`;
    
    // Use setTimeout to ensure dialog shows after context menu is closed
    setTimeout(async () => {
      const userConfirmed = window.confirm(confirmMessage);
      
      // Only proceed if user confirmed
      if (!userConfirmed) {
        return;
      }

      try {
        const serverPort = claudeCodeClient.getServerPort();
      if (!serverPort) {
        throw new Error('server port not available');
      }

        const endpoint = contextType === 'project'
          ? `/claude-project/${encodeURIComponent(contextPath)}`
          : `/claude-session/${encodeURIComponent(contextPath)}/${encodeURIComponent(contextSessionId!)}`;

        const response = await fetch(`http://localhost:${serverPort}${endpoint}`, {
          method: 'DELETE'
        });

        if (!response.ok) throw new Error('failed to clear history');

        // Refresh the projects list
        await loadProjects(true);
        
        // If we cleared the currently selected project, clear selection
        if (contextType === 'project' && contextPath === selectedProject) {
          setSelectedProject(null);
        }
      } catch (error) {
        console.error('failed to clear history:', error);
        alert('failed to clear history');
      }
    }, 0);
  }, [contextMenu, loadProjects, selectedProject]);

  // Close context menu on any click or scroll
  useEffect(() => {
    if (!contextMenu) return;
    
    const handleClick = (e: MouseEvent) => {
      // Don't close if clicking inside the context menu itself
      const target = e.target as HTMLElement;
      if (target.closest('.projects-context-menu')) {
        return;
      }
      setContextMenu(null);
    };
    
    const handleScroll = () => {
      setContextMenu(null);
    };
    
    // Use setTimeout to avoid immediately closing on the same click that opened it
    setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
      // Add scroll listener to window and any scrollable element
      window.addEventListener('scroll', handleScroll, true); // true for capture phase to catch all scroll events
    }, 0);
    
    return () => {
      document.removeEventListener('mousedown', handleClick);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [contextMenu]);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days === 0) {
      if (hours === 0) {
        if (minutes === 0) {
          return 'just now';
        } else if (minutes === 1) {
          return '1 minute ago';
        } else {
          return `${minutes} minutes ago`;
        }
      } else if (hours === 1) {
        return '1 hour ago';
      } else {
        return `${hours} hours ago`;
      }
    } else if (days === 1) {
      return 'yesterday';
    } else if (days < 7) {
      return `${days} days ago`;
    } else if (days < 14) {
      return '1 week ago';
    } else if (days < 30) {
      const weeks = Math.floor(days / 7);
      return `${weeks} weeks ago`;
    } else if (days < 365) {
      const months = Math.floor(days / 30);
      if (months === 1) {
        return '1 month ago';
      } else {
        return `${months} months ago`;
      }
    } else {
      const years = Math.floor(days / 365);
      if (years === 1) {
        return '1 year ago';
      } else {
        return `${years} years ago`;
      }
    }
  };

  const formatProjectName = (path: string) => {
    // convert escaped path back to readable format - just the folder name
    return path
      .replace(/^-/, '/')
      .replace(/-/g, '/')
      .split('/')
      .pop() || path;
  };

  const formatProjectPath = (path: string) => {
    // convert escaped path back to full readable format
    return path
      .replace(/^-/, '/')
      .replace(/-/g, '/');
  };

  if (!isOpen) return null;

  return (
    <div className="projects-modal-overlay" onClick={onClose}>
      <div className="projects-modal" onClick={e => e.stopPropagation()}>
        <div className="projects-header" data-tauri-drag-region>
          <div className="projects-title" data-tauri-drag-region>
            {selectedProject && selectedProjectData ? (
              <>
                <button 
                  className="sessions-back-btn"
                  onClick={() => {
                    setSelectedProject(null);
                    setSessionSearchQuery('');
                    setShowSearch(false);
                  }}
                  title="back to projects"
                >
                  <IconArrowLeft size={14} />
                  <span>back</span>
                </button>
                <IconFolderOpen size={16} />
                <span>{formatProjectName(selectedProjectData.name)}</span>
                <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '12px', marginLeft: '8px' }}>
                  {sessionsByProject[selectedProject]?.length || selectedProjectData.sessionCount || 0} sessions
                </span>
              </>
            ) : (
              <>
                <IconFolder size={16} />
                <span>claude projects</span>
              </>
            )}
          </div>
          <div className="projects-header-actions">
            <button 
              className="projects-refresh" 
              onClick={() => loadProjects(true)}
              disabled={loading}
              title="refresh (F5)"
            >
              {loading ? <LoadingIndicator size="small" /> : <IconRefresh size={16} />}
            </button>
            <button className="projects-close" onClick={onClose}>
              <IconX size={16} />
            </button>
          </div>
        </div>

        {showSearch && (
          <div className="projects-search">
            <IconSearch size={14} />
            <input
              ref={searchInputRef}
              type="text"
              placeholder={selectedProject ? "search sessions..." : "search projects..."}
              value={selectedProject ? sessionSearchQuery : searchQuery}
              onChange={e => selectedProject ? setSessionSearchQuery(e.target.value) : setSearchQuery(e.target.value)}
              autoFocus
            />
          </div>
        )}

        <div className="projects-content">
          {loading && !quickLoaded && (
            <div className="projects-loading">
              <LoadingIndicator size="medium" />
              <span>loading {projectCount !== null ? `${projectCount} ` : ''}projects...</span>
            </div>
          )}

          {error && (
            <div className="projects-error">{error}</div>
          )}

          {!loading && !error && filteredProjects.length === 0 && (
            <div className="projects-empty">
              {searchQuery ? 'no projects match your search' : 'no projects found'}
            </div>
          )}

          {!loading && !error && !selectedProject && filteredProjects.length > 0 && (
            <div className="projects-list">
              {filteredProjects.map((project, index) => (
                <div
                  key={project.path}
                  className={`project-item ${focusedIndex === index ? 'focused' : ''}`}
                  onClick={() => {
                    console.log('👆 [FRONTEND] Project clicked:', project.path);
                    setSelectedProject(project.path);
                    setFocusedIndex(0);
                  }}
                  onContextMenu={(e) => handleContextMenu(e, 'project', project.path)}
                  onMouseEnter={() => setFocusedIndex(index)}
                >
                  <div className="project-main">
                    <div className="project-name">
                      <div className="project-name-text">
                        <span className="project-folder-name">{formatProjectName(project.name)}</span>
                        <span className="project-full-path">{formatProjectPath(project.path)}</span>
                      </div>
                    </div>
                    <IconChevronRight size={14} className="project-arrow" />
                  </div>
                  <div className="project-meta">
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <IconHash size={12} />
                      {project.sessionCount !== null ? (
                        <>{project.sessionCount} {typeof project.sessionCount === 'string' || project.sessionCount !== 1 ? 'sessions' : 'session'}</>
                      ) : (
                        <LoadingIndicator size="small" />
                      )}
                    </span>
                    <span>
                      <IconClock size={12} />
                      {formatDate(project.lastModified)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && !error && selectedProject && selectedProjectData && (
            <div className="sessions-view">
              {loadingSessions ? (
                <div className="projects-loading">
                  <LoadingIndicator size="medium" />
                  <span>loading sessions...</span>
                </div>
              ) : (
              <div className="sessions-list">
                {filteredSessions.length === 0 && sessionSearchQuery && (
                  <div className="sessions-empty">no sessions match your search</div>
                )}
                {filteredSessions.length === 0 && !sessionSearchQuery && !loadingSessions && (
                  <div className="sessions-empty">no sessions found</div>
                )}
                {filteredSessions.map((session, index) => (
                  <div
                    key={session.id}
                    className={`session-item ${focusedIndex === index ? 'focused' : ''}`}
                    onClick={() => {
                      // Get title from localStorage or use session title/summary
                      const storedTitle = localStorage.getItem(`session-title-${session.id}`);
                      const title = storedTitle || session.title || session.summary;
                      handleSelectSession(selectedProjectData.path, session.id, title);
                    }}
                    onContextMenu={(e) => handleContextMenu(e, 'session', selectedProjectData.path, session.id)}
                    onMouseEnter={() => setFocusedIndex(index)}
                  >
                    <div className="session-main">
                      <span className="session-summary">
                        {localStorage.getItem(`session-title-${session.id}`) || session.title || session.summary || 'untitled session'}
                      </span>
                    </div>
                    <div className="session-meta">
                      {session.messageCount && (
                        <span>
                          <IconMessages size={12} />
                          {session.messageCount}
                        </span>
                      )}
                      <span>
                        <IconClock size={12} />
                        {formatDate(session.timestamp)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              )}
            </div>
          )}
        </div>

        {/* Context Menu */}
        {contextMenu && (
          <div 
            className="projects-context-menu" 
            style={{ 
              left: (() => {
                const menuWidth = 180; // Approximate width of context menu
                const rightEdge = contextMenu.x + menuWidth;
                if (rightEdge > window.innerWidth) {
                  return window.innerWidth - menuWidth - 10;
                }
                return contextMenu.x;
              })(),
              top: (() => {
                const menuHeight = 80; // Approximate height for 2-item context menu
                const bottomEdge = contextMenu.y + menuHeight;
                if (bottomEdge > window.innerHeight) {
                  return window.innerHeight - menuHeight - 10;
                }
                return contextMenu.y;
              })()
            }}
          >
            <button onClick={handleClearHistory}>
              clear {contextMenu.type === 'project' ? 'project history' : 'session'}
            </button>
            <button onClick={() => setContextMenu(null)}>
              nevermind
            </button>
          </div>
        )}
      </div>
    </div>
  );
};