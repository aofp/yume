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
  // Early return when not open to prevent any event listeners
  if (!isOpen) return null;

  const handleProjectClick = (project: RecentProject, index: number, e: React.KeyboardEvent | React.MouseEvent) => {
    // Handle keyboard shortcut (1-9)
    if ('key' in e && e.key >= '1' && e.key <= '9') {
      const keyIndex = parseInt(e.key) - 1;
      if (keyIndex === index) {
        onProjectSelect(project.path);
        onClose();
      }
      return;
    }
    
    // Handle mouse click
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
      
      // Force re-render by closing and reopening
      onClose();
      setTimeout(() => {
        // This will trigger parent to reopen if needed
        const event = new CustomEvent('recentProjectsUpdated');
        window.dispatchEvent(event);
      }, 0);
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
    // Only add listener when modal is actually open
    if (!isOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
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
        e.preventDefault();
        e.stopPropagation();
        const index = parseInt(e.key) - 1;
        const stored = localStorage.getItem('yurucode-recent-projects');
        if (stored) {
          try {
            const projects = JSON.parse(stored);
            if (index < projects.length) {
              console.log(`[RecentProjectsModal] Selecting project ${index + 1}: ${projects[index].path}`);
              onProjectSelect(projects[index].path);
              onClose();
            }
          } catch (err) {
            console.error('Failed to parse recent projects:', err);
          }
        }
      }
    };
    
    // Use capture phase to handle before other listeners
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, onClose, onProjectSelect]);

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