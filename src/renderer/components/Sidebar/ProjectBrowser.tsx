import React, { useState, useEffect } from 'react';
import {
  IconFolder,
  IconFolderOpen,
  IconFile,
  IconSearch,
  IconClock,
  IconCode,
  IconRefresh,
  IconTrash
} from '@tabler/icons-react';
import { useClaudeCodeStore } from '../../stores/claudeCodeStore';
import './ProjectBrowser.css';

interface Project {
  id: string;
  name: string;
  path: string;
  lastModified: Date;
  sessionCount: number;
  totalTokens: number;
  description?: string;
}

export const ProjectBrowser: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  
  const { sessions, currentSessionId, setCurrentSession, createSession } = useClaudeCodeStore();

  // Group sessions by working directory to create projects
  useEffect(() => {
    const projectMap = new Map<string, Project>();
    
    sessions.forEach(session => {
      const workingDir = session.workingDirectory || 'default';
      
      if (!projectMap.has(workingDir)) {
        projectMap.set(workingDir, {
          id: workingDir,
          name: workingDir.split('/').pop() || 'untitled',
          path: workingDir,
          lastModified: session.updatedAt,
          sessionCount: 1,
          totalTokens: 0,
          description: `Project at ${workingDir}`
        });
      } else {
        const project = projectMap.get(workingDir)!;
        project.sessionCount++;
        if (session.updatedAt > project.lastModified) {
          project.lastModified = session.updatedAt;
        }
      }
    });

    setProjects(Array.from(projectMap.values()).sort((a, b) => 
      b.lastModified.getTime() - a.lastModified.getTime()
    ));
  }, [sessions]);

  const filteredProjects = projects.filter(project =>
    project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    project.path.toLowerCase().includes(searchQuery.toLowerCase())
  );

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

  const getProjectSessions = (projectPath: string) => {
    return sessions.filter(s => s.workingDirectory === projectPath);
  };

  const handleProjectClick = (project: Project) => {
    setSelectedProject(selectedProject === project.id ? null : project.id);
  };

  const handleSessionClick = (sessionId: string) => {
    setCurrentSession(sessionId);
  };

  const handleNewSession = async (projectPath: string) => {
    const projectName = projectPath.split('/').pop() || 'new';
    await createSession(`${projectName} session`, projectPath);
  };

  return (
    <div className="project-browser">
      <div className="browser-header">
        <div className="search-box">
          <IconSearch size={14} stroke={1.5} />
          <input
            type="text"
            placeholder="search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>
      </div>

      <div className="projects-list">
        {filteredProjects.length === 0 ? (
          <div className="empty-state">
            <IconFolder size={32} stroke={1} />
            <p>no projects yet</p>
            <span>start a new session to create a project</span>
          </div>
        ) : (
          filteredProjects.map(project => (
            <div key={project.id} className="project-item">
              <div 
                className="project-header"
                onClick={() => handleProjectClick(project)}
              >
                <div className="project-icon">
                  {selectedProject === project.id ? (
                    <IconFolderOpen size={16} stroke={1.5} />
                  ) : (
                    <IconFolder size={16} stroke={1.5} />
                  )}
                </div>
                <div className="project-info">
                  <div className="project-name">{project.name}</div>
                  <div className="project-meta">
                    <span className="meta-item">
                      <IconClock size={10} />
                      {formatDate(project.lastModified)}
                    </span>
                    <span className="meta-item">
                      <IconFile size={10} />
                      {project.sessionCount} {project.sessionCount === 1 ? 'session' : 'sessions'}
                    </span>
                  </div>
                </div>
              </div>

              {selectedProject === project.id && (
                <div className="project-sessions">
                  <div className="sessions-header">
                    <span>sessions</span>
                    <button
                      className="new-session-btn"
                      onClick={() => handleNewSession(project.path)}
                      title="new session"
                    >
                      +
                    </button>
                  </div>
                  {getProjectSessions(project.path).map(session => (
                    <div
                      key={session.id}
                      className={`session-item ${session.id === currentSessionId ? 'active' : ''}`}
                      onClick={() => handleSessionClick(session.id)}
                    >
                      <IconCode size={12} />
                      <span className="session-name">{session.name}</span>
                      <span className="session-status">{session.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="browser-footer">
        <button className="footer-action" title="refresh">
          <IconRefresh size={14} stroke={1.5} />
        </button>
        <span className="project-count">
          {projects.length} {projects.length === 1 ? 'project' : 'projects'}
        </span>
      </div>
    </div>
  );
};