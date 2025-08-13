import React, { useState, useEffect } from 'react';
import { IconFolderOpen, IconPlus, IconX, IconTrash, IconChevronDown } from '@tabler/icons-react';
import { useClaudeCodeStore } from '../../stores/claudeCodeStore';
import { KeyboardShortcuts } from '../KeyboardShortcuts/KeyboardShortcuts';
import { ModelSelector } from '../ModelSelector/ModelSelector';
import { tauriApi } from '../../services/tauriApi';
import './WelcomeScreen.css';

interface RecentProject {
  path: string;
  name: string;
  lastOpened: Date;
}

export const WelcomeScreen: React.FC = () => {
  const { createSession, selectedModel, setSelectedModel } = useClaudeCodeStore();
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [showRecentModal, setShowRecentModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);

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

  // Handle keyboard shortcuts (moved after function definitions)
  // Will be set up after all functions are defined

  const handleSelectFolder = async () => {
    // Import the Tauri API dynamically
    if (window.__TAURI__) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const folderPath = await invoke<string | null>('select_folder');
        if (folderPath) {
          openProject(folderPath);
        }
      } catch (error) {
        console.error('Failed to select folder:', error);
      }
    }
  };

  const handleNewSession = async () => {
    let directory = null;
    
    // Check if we're in Tauri environment
    if (window.__TAURI__) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        directory = await invoke<string | null>('select_folder');
        if (!directory) {
          // User cancelled folder selection
          return;
        }
      } catch (error) {
        console.error('Folder selection failed:', error);
        // Don't fall back, just return
        return;
      }
    } else {
      // No folder selection available
      console.error('No folder selection method available - not in Tauri environment');
      return;
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

  // Set up keyboard shortcuts after function definitions
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input fields
      const target = e.target as HTMLElement;
      const isInputField = target.tagName === 'INPUT' || 
                           target.tagName === 'TEXTAREA' || 
                           target.contentEditable === 'true';
      
      // Handle ESC to close modals
      if (e.key === 'Escape') {
        if (showRecentModal) {
          setShowRecentModal(false);
        }
        if (showHelpModal) {
          setShowHelpModal(false);
        }
        return;
      }
      
      // Don't process other shortcuts if in input field
      if (isInputField) return;
      
      // Handle ? for help
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setShowHelpModal(true);
      }
      
      // Handle Ctrl+R for recent projects
      if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
        e.preventDefault();
        if (recentProjects.length > 0) {
          setShowRecentModal(true);
        }
      }
      
      // Handle Ctrl+T for new tab
      if ((e.ctrlKey || e.metaKey) && e.key === 't') {
        e.preventDefault();
        handleNewSession();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showRecentModal, showHelpModal, recentProjects.length, handleNewSession]);

  return (
    <div className="welcome-screen">
      <div className="welcome-content">
        <div className="welcome-header">
          <span className="welcome-title">
            <span className="yuru">y</span><span className="code">&gt;</span>
          </span>
        </div>
        
        <div className="welcome-buttons">
          <button 
            className="welcome-new-button"
            onClick={handleNewSession}
            title="new tab (ctrl+t)"
          >
            <IconPlus size={20} />
          </button>

          <button 
            className="action-button"
            onClick={() => setShowRecentModal(true)}
            disabled={recentProjects.length === 0}
            title={`recent projects (ctrl+r)`}
          >
            <span>{recentProjects.length}</span>
            <IconChevronDown size={16} stroke={1.5} />
          </button>
        </div>
      </div>
      
      {/* Help button - same position as in chat */}
      <div className="welcome-help-container">
        <button 
          className="btn-help" 
          onClick={() => setShowHelpModal(true)}
          title="keyboard shortcuts (?)"
        >
          ?
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
              <span className="modal-title">
                <IconChevronDown size={14} stroke={1.5} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                recent projects
              </span>
              <button 
                className="clear-all-icon"
                onClick={() => {
                  if (confirm('clear all recent projects?')) {
                    setRecentProjects([]);
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
      
      {/* Help Modal - using shared component */}
      {showHelpModal && <KeyboardShortcuts onClose={() => setShowHelpModal(false)} />}
      
      {/* Model Selector - bottom left */}
      <div className="model-selector-container">
        <ModelSelector value={selectedModel} onChange={setSelectedModel} />
      </div>
    </div>
  );
};