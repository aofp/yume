import React from 'react';
import { appStorageKey } from '../../config/app';
import { IconFolderOpen, IconTrash, IconX } from '@tabler/icons-react';
import { ConfirmModal } from '../ConfirmModal/ConfirmModal';

interface RecentProject {
  path: string;
  name: string;
  lastOpened: number; // timestamp for sorting
}

interface RecentProjectsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectSelect: (path: string) => void;
}

export const RecentProjectsModal: React.FC<RecentProjectsModalProps> = ({
  isOpen,
  onClose,
  onProjectSelect,
}) => {
  const RECENT_PROJECTS_KEY = appStorageKey('recent-projects');
  // State to prevent duplicate selections
  const [isSelecting, setIsSelecting] = React.useState(false);
  const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [showClearConfirm, setShowClearConfirm] = React.useState(false);
  // Track if using keyboard navigation (ignore mouse hover until mouse moves)
  const [isKeyboardMode, setIsKeyboardMode] = React.useState(false);
  const lastMousePos = React.useRef<{ x: number; y: number } | null>(null);
  // Ref to track current open state in event handlers
  const isOpenRef = React.useRef(isOpen);
  
  // Update ref whenever isOpen changes
  React.useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  const selectProject = React.useCallback((project: RecentProject) => {
    if (isSelecting) return;
    
    setIsSelecting(true);
    
    // update last opened and access count
    const stored = localStorage.getItem(RECENT_PROJECTS_KEY);
    if (stored) {
      try {
        const projects = JSON.parse(stored);
        const updated = projects.map((p: any) => {
          if (p.path === project.path) {
            return {
              ...p,
              lastOpened: Date.now(),
              accessCount: (p.accessCount || 0) + 1
            };
          }
          return p;
        });
        // sort by last opened (most recent first)
        updated.sort((a: RecentProject, b: RecentProject) => 
          (b.lastOpened || 0) - (a.lastOpened || 0)
        );
        localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(updated));
      } catch (err) {
        console.error('Failed to update project timestamps:', err);
      }
    }
    
    onProjectSelect(project.path);
    onClose();
  }, [isSelecting, onProjectSelect, onClose]);
  
  const handleProjectClick = (project: RecentProject, index: number, e: React.MouseEvent) => {
    e.preventDefault();
    selectProject(project);
  };

  const removeProject = (projectPath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const stored = localStorage.getItem(RECENT_PROJECTS_KEY);
    if (!stored) return;
    
    try {
      const projects = JSON.parse(stored);
      const updated = projects.filter((p: any) => p.path !== projectPath);
      
      if (updated.length > 0) {
        localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(updated));
      } else {
        localStorage.removeItem(RECENT_PROJECTS_KEY);
        onClose();
      }
      
      // Just close the modal and trigger update event for UI refresh
      onClose();
      // Dispatch event to update the project list display
      const event = new CustomEvent('recentProjectsUpdated');
      window.dispatchEvent(event);
    } catch (err) {
      console.error('Failed to update recent projects:', err);
    }
  };

  const clearAllProjects = () => {
    setShowClearConfirm(true);
  };

  const handleConfirmClear = () => {
    localStorage.removeItem(RECENT_PROJECTS_KEY);
    setShowClearConfirm(false);
    // Notify listeners that recent projects were updated
    window.dispatchEvent(new CustomEvent('recentProjectsUpdated'));
    onClose();
  };

  const formatFolderPath = React.useCallback((fullPath: string): string => {
    // normalize path separators
    const normalizedPath = fullPath.replace(/\\/g, '/');
    
    // handle special cases
    if (normalizedPath === '.' || normalizedPath === './' || normalizedPath === '') {
      return './';
    }
    
    // extract parent directory
    const lastSlash = normalizedPath.lastIndexOf('/');
    if (lastSlash === -1) return './';
    
    const parentPath = normalizedPath.substring(0, lastSlash + 1);
    
    // smart truncation with priority on end of path
    const maxLength = 60;
    if (parentPath.length <= maxLength) return parentPath;
    
    // keep more of the end (more relevant)
    const startLength = Math.floor(maxLength * 0.3);
    const endLength = maxLength - startLength - 3; // 3 for ellipsis
    
    return parentPath.substring(0, startLength) + '...' + 
           parentPath.substring(parentPath.length - endLength);
  }, []);
  
  const formatTimestamp = React.useCallback((timestamp: number): string => {
    if (!timestamp || isNaN(timestamp)) return 'unknown';

    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    const timeStr = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).toLowerCase();

    if (isToday) {
      return `today ${timeStr}`;
    } else if (isYesterday) {
      return `yesterday ${timeStr}`;
    } else {
      const dateStr = date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      }).toLowerCase();
      return `${dateStr} ${timeStr}`;
    }
  }, []);

  const renderProjects = () => {
    const stored = localStorage.getItem(RECENT_PROJECTS_KEY);
    if (!stored) {
      return <div className="no-recent">no recent projects</div>;
    }
    
    try {
      const projects = JSON.parse(stored);
      if (!projects || projects.length === 0) {
        return <div className="no-recent">no recent projects</div>;
      }
      
      return projects.slice(0, 10).map((project: RecentProject, idx: number) => (
        <div
          key={project.path}
          className={`recent-item-container ${
            hoveredIndex === idx && !isKeyboardMode ? 'hovered' : ''
          } ${selectedIndex === idx && isKeyboardMode ? 'selected' : ''} ${
            (hoveredIndex === idx && !isKeyboardMode) || (selectedIndex === idx && isKeyboardMode) ? 'focused' : ''
          }`}
          onMouseMove={(e) => {
            // Only respond to actual mouse movement
            const pos = { x: e.clientX, y: e.clientY };
            if (lastMousePos.current &&
                lastMousePos.current.x === pos.x &&
                lastMousePos.current.y === pos.y) {
              return;
            }
            lastMousePos.current = pos;
            if (isKeyboardMode) {
              setIsKeyboardMode(false);
            }
            if (hoveredIndex !== idx) {
              setHoveredIndex(idx);
            }
          }}
          onMouseLeave={() => {
            if (!isKeyboardMode) {
              setHoveredIndex(null);
            }
          }}
        >
          <button
            className="recent-item"
            onClick={(e) => handleProjectClick(project, idx, e)}
          >
            <span className="recent-item-number">{idx < 9 ? idx + 1 : ''}</span>
            <div className="recent-item-info">
              <div className="recent-item-name">
                <div className="recent-item-name-row">
                  <span>{project.name}</span>
                  {project.lastOpened && (
                    <span className="recent-item-time">{formatTimestamp(project.lastOpened)}</span>
                  )}
                </div>
                <span className="recent-item-path">
                  {formatFolderPath(project.path)}
                </span>
              </div>
            </div>
          </button>
          <button
            className="recent-item-remove"
            onClick={(e) => removeProject(project.path, e)}
            title="remove from recent"
          >
            <IconX size={12} />
          </button>
        </div>
      ));
    } catch (err) {
      console.error('Failed to parse recent projects:', err);
      return <div className="no-recent">no recent projects</div>;
    }
  };

  React.useEffect(() => {
    // Track global modal state to prevent duplicates
    if (isOpen) {
      // @ts-ignore - adding global flag
      window.__recentModalOpen = true;
      setSelectedIndex(0); // reset selection
      setHoveredIndex(null);
      setIsKeyboardMode(false);
      lastMousePos.current = null;
    } else {
      // @ts-ignore - adding global flag
      window.__recentModalOpen = false;
      setIsSelecting(false);
    }
    
    // Clean up on unmount
    return () => {
      // @ts-ignore - adding global flag
      window.__recentModalOpen = false;
    };
  }, [isOpen]);
  
  React.useEffect(() => {
    // Reset selection state when modal opens/closes
    if (!isOpen) {
      setIsSelecting(false);
      return;
    }
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // CRITICAL: Only handle events when modal is actually open
      if (!isOpenRef.current) {
        return;
      }
      
      // Ignore if typing in an input field
      const target = e.target as HTMLElement;
      const isInputField = target.tagName === 'INPUT' || 
                           target.tagName === 'TEXTAREA' || 
                           target.contentEditable === 'true';
      if (isInputField) return;
      
      // Handle ESC to close
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      
      const stored = localStorage.getItem(RECENT_PROJECTS_KEY);
      if (!stored) return;
      
      let projects: RecentProject[];
      try {
        projects = JSON.parse(stored);
      } catch (err) {
        console.error('Failed to parse recent projects:', err);
        return;
      }
      
      // arrow key navigation - switch to keyboard mode
      // If first entering keyboard mode with no hover, start at first item
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setIsKeyboardMode(true);
        setHoveredIndex(null);
        if (!isKeyboardMode && hoveredIndex === null) {
          // First arrow press with nothing selected - start at first item
          setSelectedIndex(0);
        } else {
          const startIdx = hoveredIndex !== null ? hoveredIndex : selectedIndex;
          setSelectedIndex(Math.min(startIdx + 1, Math.min(projects.length - 1, 9)));
        }
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setIsKeyboardMode(true);
        setHoveredIndex(null);
        if (!isKeyboardMode && hoveredIndex === null) {
          // First arrow press with nothing selected - start at first item
          setSelectedIndex(0);
        } else {
          const startIdx = hoveredIndex !== null ? hoveredIndex : selectedIndex;
          setSelectedIndex(Math.max(startIdx - 1, 0));
        }
        return;
      }
      
      // enter to select current (use hovered if in mouse mode, selected if in keyboard mode)
      if (e.key === 'Enter') {
        e.preventDefault();
        const activeIdx = isKeyboardMode ? selectedIndex : (hoveredIndex ?? selectedIndex);
        if (activeIdx >= 0 && activeIdx < projects.length) {
          selectProject(projects[activeIdx]);
        }
        return;
      }
      
      // Handle number keys (1-9) for project selection - only when no modifiers
      if (e.key >= '1' && e.key <= '9' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        // Double-check modal is still open
        if (!isOpenRef.current) {
          return;
        }

        // Prevent duplicate selections
        if (isSelecting) {
          return;
        }
        
        e.preventDefault();
        e.stopPropagation();
        const index = parseInt(e.key) - 1;
        if (index < projects.length) {
          selectProject(projects[index]);
        }
      }
    };
    
    // Use capture phase to handle events before other handlers
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, onClose, isSelecting, selectProject, hoveredIndex, isKeyboardMode, selectedIndex]);

  // Early return when not open to prevent rendering
  if (!isOpen) return null;

  return (
    <div 
      className="recent-modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div 
        className="recent-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-header" onContextMenu={(e) => e.preventDefault()}>
          <div className="modal-title-group">
            <span className="modal-title">
              <IconFolderOpen size={14} stroke={1.5} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
              recent projects
            </span>
            <span className="modal-hint">1-9 to open</span>
          </div>
          <div className="modal-header-actions">
            <button
              className="clear-all-icon"
              onClick={clearAllProjects}
              title="clear all"
              disabled={(() => {
                const stored = localStorage.getItem(RECENT_PROJECTS_KEY);
                if (!stored) return true;
                try {
                  const projects = JSON.parse(stored);
                  return !projects || projects.length === 0;
                } catch { return true; }
              })()}
            >
              <IconTrash size={14} />
            </button>
            <button
              className="modal-close-btn"
              onClick={onClose}
              title="close (esc)"
            >
              <IconX size={14} />
            </button>
          </div>
        </div>

        <div className="modal-content">
          {renderProjects()}
        </div>
      </div>

      <ConfirmModal
        isOpen={showClearConfirm}
        title="clear recent projects"
        message="this will remove all projects from the recent list. this cannot be undone."
        confirmText="clear all"
        cancelText="cancel"
        isDangerous={true}
        onConfirm={handleConfirmClear}
        onCancel={() => setShowClearConfirm(false)}
      />
    </div>
  );
};
