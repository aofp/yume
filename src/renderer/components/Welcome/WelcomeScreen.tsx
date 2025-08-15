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
  const [showHelpModal, setShowHelpModal] = useState(false);

  useEffect(() => {
    // Load recent projects from localStorage
    const loadRecentProjects = () => {
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
      } else {
        setRecentProjects([]);
      }
    };

    loadRecentProjects();

    // Listen for updates to recent projects
    const handleRecentProjectsUpdate = () => {
      loadRecentProjects();
      // Don't automatically open modal when projects are updated
    };


    window.addEventListener('recentProjectsUpdated', handleRecentProjectsUpdate);
    return () => {
      window.removeEventListener('recentProjectsUpdated', handleRecentProjectsUpdate);
    };
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
        if (showHelpModal) {
          setShowHelpModal(false);
        }
        return;
      }
      
      // Number key handling moved to RecentProjectsModal component to avoid conflicts
      
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
          const event = new CustomEvent('openRecentProjects');
          window.dispatchEvent(event);
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
  }, [showHelpModal, recentProjects, handleNewSession]);

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
            onClick={() => {
              const event = new CustomEvent('openRecentProjects');
              window.dispatchEvent(event);
            }}
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

      
      {/* Help Modal - using shared component */}
      {showHelpModal && <KeyboardShortcuts onClose={() => setShowHelpModal(false)} />}
      
      {/* Model Selector - bottom left */}
      <div className="model-selector-container">
        <ModelSelector value={selectedModel} onChange={setSelectedModel} />
      </div>
    </div>
  );
};