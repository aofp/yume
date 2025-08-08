import React, { useState, useEffect } from 'react';
import { IconFolder, IconFolderOpen, IconPlus, IconClock, IconChevronDown } from '@tabler/icons-react';
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
  const [showFolderDropdown, setShowFolderDropdown] = useState(false);

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

  const handleSelectFolder = async () => {
    if (window.electronAPI?.selectFolder) {
      const folderPath = await window.electronAPI.selectFolder();
      if (folderPath) {
        openProject(folderPath);
      }
    }
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

  const formatDate = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    return `${Math.floor(days / 30)} months ago`;
  };

  return (
    <div className="welcome-screen">
      <div className="welcome-header">
        <h1>yurucode</h1>
        <button 
          className="welcome-new-button"
          onClick={() => createSession('new session')}
          title="new session"
        >
          <IconPlus size={28} />
        </button>
      </div>

      <div className="welcome-actions">
        <button 
          className="action-button primary"
          onClick={handleSelectFolder}
        >
          <IconFolderOpen size={20} />
          <span>open folder</span>
        </button>

        <div className="folder-dropdown-container">
          <button 
            className="action-button"
            onClick={() => setShowFolderDropdown(!showFolderDropdown)}
          >
            <IconFolder size={20} />
            <span>quick open</span>
            <IconChevronDown size={16} className={`dropdown-arrow ${showFolderDropdown ? 'open' : ''}`} />
          </button>
          
          {showFolderDropdown && (
            <div className="folder-dropdown">
              <div className="dropdown-header">common folders</div>
              <button 
                className="dropdown-item"
                onClick={() => {
                  openProject(process.env.HOME || process.env.USERPROFILE || '~');
                  setShowFolderDropdown(false);
                }}
              >
                <IconFolder size={16} />
                <span>home</span>
              </button>
              <button 
                className="dropdown-item"
                onClick={() => {
                  openProject(process.env.HOME + '/Desktop' || process.env.USERPROFILE + '\\Desktop');
                  setShowFolderDropdown(false);
                }}
              >
                <IconFolder size={16} />
                <span>desktop</span>
              </button>
              <button 
                className="dropdown-item"
                onClick={() => {
                  openProject(process.env.HOME + '/Documents' || process.env.USERPROFILE + '\\Documents');
                  setShowFolderDropdown(false);
                }}
              >
                <IconFolder size={16} />
                <span>documents</span>
              </button>
            </div>
          )}
        </div>

      </div>

      {recentProjects.length > 0 && (
        <div className="recent-projects">
          <h2>recent projects</h2>
          <div className="project-grid">
            {recentProjects.map((project, index) => (
              <button
                key={project.path}
                className="project-card"
                onClick={() => openProject(project.path)}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="project-icon">
                  <IconFolder size={24} />
                </div>
                <div className="project-info">
                  <div className="project-name">{project.name}</div>
                  <div className="project-path">{project.path}</div>
                  <div className="project-time">
                    <IconClock size={12} />
                    <span>{formatDate(project.lastOpened)}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};