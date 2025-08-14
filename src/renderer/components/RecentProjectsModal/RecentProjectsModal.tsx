import React from 'react';
import { IconFolderOpen, IconTrash, IconX, IconChevronDown } from '@tabler/icons-react';

interface RecentProject {
  path: string;
  name: string;
  lastOpened?: Date;
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
  // State to prevent duplicate selections
  const [isSelecting, setIsSelecting] = React.useState(false);
  // Ref to track current open state in event handlers
  const isOpenRef = React.useRef(isOpen);
  
  // Update ref whenever isOpen changes
  React.useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  const handleProjectClick = (project: RecentProject, index: number, e: React.KeyboardEvent | React.MouseEvent) => {
    // Prevent duplicate selections
    if (isSelecting) {
      console.log('[RecentProjectsModal] Already selecting a project, ignoring click');
      return;
    }
    
    // Handle keyboard shortcut (1-9)
    if ('key' in e && e.key >= '1' && e.key <= '9') {
      const keyIndex = parseInt(e.key) - 1;
      if (keyIndex === index) {
        setIsSelecting(true);
        onProjectSelect(project.path);
        onClose();
      }
      return;
    }
    
    // Handle mouse click
    setIsSelecting(true);
    onProjectSelect(project.path);
    onClose();
  };

  const removeProject = (projectPath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const stored = localStorage.getItem('yurucode-recent-projects');
    if (!stored) return;
    
    try {
      const projects = JSON.parse(stored);
      const updated = projects.filter((p: any) => p.path !== projectPath);
      
      if (updated.length > 0) {
        localStorage.setItem('yurucode-recent-projects', JSON.stringify(updated));
      } else {
        localStorage.removeItem('yurucode-recent-projects');
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
    if (confirm('clear all recent projects?')) {
      localStorage.removeItem('yurucode-recent-projects');
      onClose();
    }
  };

  const renderProjects = () => {
    const stored = localStorage.getItem('yurucode-recent-projects');
    if (!stored) {
      return <div className="no-recent">no recent projects</div>;
    }
    
    try {
      const projects = JSON.parse(stored);
      if (!projects || projects.length === 0) {
        return <div className="no-recent">no recent projects</div>;
      }
      
      return projects.slice(0, 10).map((project: RecentProject, idx: number) => (
        <div key={project.path} className="recent-item-container">
          <button
            className="recent-item"
            onClick={(e) => handleProjectClick(project, idx, e)}
          >
            <span className="recent-item-number">{idx < 9 ? idx + 1 : ''}</span>
            <IconFolderOpen size={14} />
            <div className="recent-item-info">
              <div className="recent-item-name">
                {project.name}
                <span className="recent-item-path">{project.path}</span>
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
        console.log('[RecentProjectsModal] Modal is closed, ignoring key press');
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
      
      // Handle number keys (1-9) for project selection - only when no modifiers
      if (e.key >= '1' && e.key <= '9' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        // Double-check modal is still open
        if (!isOpenRef.current) {
          console.log('[RecentProjectsModal] Modal closed during key handling, aborting');
          return;
        }
        
        // Prevent duplicate selections
        if (isSelecting) {
          console.log('[RecentProjectsModal] Already selecting a project, ignoring key press');
          return;
        }
        
        e.preventDefault();
        e.stopPropagation();
        const index = parseInt(e.key) - 1;
        const stored = localStorage.getItem('yurucode-recent-projects');
        if (stored) {
          try {
            const projects = JSON.parse(stored);
            if (index < projects.length) {
              console.log(`[RecentProjectsModal] Selecting project ${index + 1}: ${projects[index].path}`);
              setIsSelecting(true);
              // Close modal BEFORE calling onProjectSelect to prevent any race conditions
              onClose();
              // Small delay to ensure modal is fully closed
              setTimeout(() => {
                onProjectSelect(projects[index].path);
              }, 0);
            }
          } catch (err) {
            console.error('Failed to parse recent projects:', err);
          }
        }
      }
    };
    
    // Add listener without capture phase to avoid conflicts
    console.log('[RecentProjectsModal] Adding keydown listener');
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      console.log('[RecentProjectsModal] Removing keydown listener');
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, onProjectSelect, isSelecting]);

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
        <div className="modal-header">
          <span className="modal-title">
            <IconChevronDown size={14} stroke={1.5} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            recent projects
          </span>
          <button 
            className="clear-all-icon"
            onClick={clearAllProjects}
            title="clear all"
          >
            <IconTrash size={14} />
          </button>
        </div>
        
        <div className="modal-content">
          {renderProjects()}
        </div>
      </div>
    </div>
  );
};