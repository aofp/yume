import React, { useState, useEffect, useRef } from 'react';
import { IconX, IconPlus, IconFolder, IconLoader2, IconFolderOpen, IconBolt, IconTrash } from '@tabler/icons-react';
import { useClaudeCodeStore } from '../../stores/claudeCodeStore';
import './SessionTabs.css';

export const SessionTabs: React.FC = () => {
  const { 
    sessions, 
    currentSessionId, 
    createSession, 
    deleteSession,
    deleteAllSessions,
    resumeSession,
    isStreaming
  } = useClaudeCodeStore();

  const [showNewMenu, setShowNewMenu] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; sessionId: string } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

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
  };

  return (
    <div className="session-tabs">
      <div className="tabs-container">
        {sessions.map((session) => (
          <div
            key={session.id}
            className={`session-tab ${currentSessionId === session.id ? 'active' : ''}`}
            onClick={() => resumeSession(session.id)}
            onMouseDown={handleRipple}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({ x: e.clientX, y: e.clientY, sessionId: session.id });
            }}
          >
            <div className="tab-content">
              <span className="tab-name">{session.name.replace('session ', '').substring(0, 3)}</span>
              {(session as any).workingDirectory && (
                <span className="tab-folder">
                  {getDisplayPath((session as any).workingDirectory)}
                </span>
              )}
            </div>
            {/* Show loading icon for pending sessions or streaming */}
            {(session.status === 'pending' || (currentSessionId === session.id && isStreaming)) ? (
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
        
        <button className="tab-new" onClick={handleOpenFolder} onMouseDown={handleRipple}>
          <IconPlus size={16} stroke={1.5} />
        </button>
      </div>
      
      {contextMenu && (
        <div 
          ref={contextMenuRef}
          className="tab-context-menu" 
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button onClick={() => {
            const session = sessions.find(s => s.id === contextMenu.sessionId);
            const workingDir = (session as any)?.workingDirectory;
            if (workingDir) {
              createSession(undefined, workingDir);
            }
            setContextMenu(null);
          }}>new session in same dir</button>
          
          <div className="separator" />
          
          <button onClick={() => {
            deleteAllSessions();
            setContextMenu(null);
          }}>close all</button>
          
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
          }}>close all but this</button>
          
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
        </div>
      )}
    </div>
  );
};