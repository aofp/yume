import React, { useState, useEffect } from 'react';
import { IconFolderOpen, IconPlus, IconX, IconTrash } from '@tabler/icons-react';
import { useClaudeCodeStore } from '../../stores/claudeCodeStore';
import './WelcomeScreen.css';

interface RecentProject {
  path: string;
  name: string;
  lastOpened: Date;
}

export const WelcomeScreen: React.FC = () => {
  const { createSession } = useClaudeCodeStore();
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [showRecentModal, setShowRecentModal] = useState(false);

  useEffect(() => {
    // Load recent projects from localStorage
    const stored = localStorage.getItem('yurucode-recent-projects');
    if (stored) {
      try {
        const projects = JSON.parse(stored).map((p: any) => ({
          ...p,
          lastOpened: new Date(p.lastOpened)
        }));
        setRecentProjects(projects.slice(0, 8)); // Show max 8 recent projects
      } catch (e) {
        console.error('Failed to load recent projects:', e);
      }
    }
  }, []);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showRecentModal) {
        setShowRecentModal(false);
      }
    };
    
    if (showRecentModal) {
      document.addEventListener('keydown', handleEsc);
      return () => document.removeEventListener('keydown', handleEsc);
    }
  }, [showRecentModal]);

  const handleSelectFolder = async () => {
    if (window.electronAPI?.selectFolder) {
      const folderPath = await window.electronAPI.selectFolder();
      if (folderPath) {
        openProject(folderPath);
      }
    }
  };

  const handleNewSession = async () => {
    let directory = null;
    
    if (window.electronAPI?.folder?.select) {
      try {
        directory = await window.electronAPI.folder.select();
        if (!directory) {
          // User cancelled folder selection
          return;
        }
      } catch (error) {
        // Fall back to current directory
        directory = await window.electronAPI?.folder?.getCurrent?.() || '/';
      }
    } else {
      // Just use root directory as fallback
      directory = '/';
    }
    
    // Create session with selected directory
    openProject(directory);
  };

  const openProject = (path: string) => {
    // Update recent projects
    const name = path.split(/[/\\]/).pop() || path;
    const newProject = { path, name, lastOpened: new Date() };
    
    const updated = [
      newProject,
      ...recentProjects.filter(p => p.path !== path)
    ].slice(0, 8);
    
    setRecentProjects(updated);
    localStorage.setItem('yurucode-recent-projects', JSON.stringify(updated));
    
    // Create new session with this folder
    createSession(name, path);
  };

  return (
    <div className="welcome-screen">
      <div className="welcome-header">
        <span className="welcome-title">
          <span className="yuru">y</span><span className="code">&gt;</span>
        </span>
        <button 
          className="welcome-new-button"
          onClick={handleNewSession}
          title="new session"
        >
          <IconPlus size={20} />
        </button>
      </div>

      <div className="welcome-actions">
        <button 
          className="action-button"
          onClick={() => setShowRecentModal(true)}
          disabled={recentProjects.length === 0}
        >
          <span>recent: {Math.min(recentProjects.length, 10)}</span>
        </button>
      </div>

      
      {/* Recent Projects Modal */}
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
                  setRecentProjects([]);
                  localStorage.removeItem('yurucode-recent-projects');
                  setShowRecentModal(false);
                }}
                title="clear all"
              >
                <IconTrash size={14} />
              </button>
            </div>
            
            <div className="modal-content">
              {recentProjects.length > 0 ? (
                <>
                  {recentProjects.slice(0, 10).map((project) => (
                    <div key={project.path} className="recent-item-container">
                      <button
                        className="recent-item"
                        onClick={() => {
                          openProject(project.path);
                          setShowRecentModal(false);
                        }}
                      >
                        <IconFolderOpen size={14} />
                        <div className="recent-item-info">
                          <div className="recent-item-name">{project.name}</div>
                          <div className="recent-item-path">{project.path}</div>
                        </div>
                      </button>
                      <button
                        className="recent-item-remove"
                        onClick={(e) => {
                          e.stopPropagation();
                          const updated = recentProjects.filter(p => p.path !== project.path);
                          setRecentProjects(updated);
                          localStorage.setItem('yurucode-recent-projects', JSON.stringify(updated));
                          if (updated.length === 0) {
                            setShowRecentModal(false);
                          }
                        }}
                        title="remove from recent"
                      >
                        <IconX size={12} />
                      </button>
                    </div>
                  ))}
                </>
              ) : (
                <div className="no-recent">no recent projects</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};