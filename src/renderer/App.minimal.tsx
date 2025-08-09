import React, { useEffect, useState } from 'react';
import { TitleBar } from './components/Layout/TitleBar';
import { SessionTabs } from './components/SessionTabs/SessionTabs';
import { ClaudeChat } from './components/Chat/ClaudeChat';
import { WindowControls } from './components/WindowControls/WindowControls';
import { SettingsModal } from './components/Settings/SettingsModal';
// Sidebar removed for cleaner UI
import { useClaudeCodeStore } from './stores/claudeCodeStore';
import './App.minimal.css';

export const App: React.FC = () => {
  const { currentSessionId, sessions, createSession } = useClaudeCodeStore();
  const [showSettings, setShowSettings] = useState(false);
  
  console.log('App component rendering, sessions:', sessions, 'currentSessionId:', currentSessionId);
  
  // Handle global folder drops
  const handleGlobalDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    console.log('Global drop event:', e.dataTransfer);
    
    // Try to detect folders using webkitGetAsEntry
    const items = Array.from(e.dataTransfer.items);
    for (const item of items) {
      if (item.kind === 'file') {
        const entry = (item as any).webkitGetAsEntry?.();
        if (entry) {
          console.log('Entry:', entry.name, 'isDirectory:', entry.isDirectory);
          
          if (entry.isDirectory) {
            const file = item.getAsFile();
            const path = (file as any)?.path;
            if (path) {
              console.log('Creating session for folder:', path);
              const sessionName = path.split(/[/\\]/).pop() || 'new session';
              await createSession(sessionName, path);
              return;
            }
          }
        }
      }
    }
    
    // Fallback: Check files array  
    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      console.log('File:', file.name, 'Type:', file.type, 'Size:', file.size, 'Path:', (file as any).path);
      
      const path = (file as any).path;
      if (path && window.electronAPI?.isDirectory) {
        const isDir = window.electronAPI.isDirectory(path);
        if (isDir) {
          console.log('Creating session for folder:', path);
          const sessionName = path.split(/[/\\]/).pop() || 'new session';
          await createSession(sessionName, path);
          return;
        }
      }
    }
  };
  
  const handleGlobalDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };
  
  useEffect(() => {
    console.log('App useEffect running');
    // Set page title
    document.title = 'yurucode';
    
    // Listen for initial directory from command line (only once)
    const handleInitialDirectory = async (directory: string) => {
      console.log('Received initial directory:', directory);
      // DO NOT auto-create sessions - user must click + button
      // Just log the directory for now
      console.log('User can create a session in this directory using the + button');
    };
    
    const handleFolderChanged = (directory: string) => {
      console.log('Folder changed to:', directory);
      // Could update current session's directory here
    };
    
    if (window.electronAPI?.on) {
      window.electronAPI.on('initial-directory', handleInitialDirectory);
      window.electronAPI.on('folder-changed', handleFolderChanged);
      
      // Cleanup listeners
      return () => {
        if (window.electronAPI?.off) {
          window.electronAPI.off('initial-directory', handleInitialDirectory);
          window.electronAPI.off('folder-changed', handleFolderChanged);
        }
      };
    }
  }, [createSession]);

  // Handle Ctrl+, for settings
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setShowSettings(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Apply accent color from localStorage on mount
  useEffect(() => {
    const savedColor = localStorage.getItem('accentColor') || '#ff99cc';
    document.documentElement.style.setProperty('--accent-color', savedColor);
    
    // Convert hex to RGB for rgba() usage
    const hex = savedColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    document.documentElement.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
  }, []);

  return (
    <div 
      className="app-minimal"
      onDrop={handleGlobalDrop}
      onDragOver={handleGlobalDragOver}
    >
      <WindowControls onSettingsClick={() => setShowSettings(true)} />
      <TitleBar onSettingsClick={() => setShowSettings(true)} />
      <SessionTabs />
      <div className="app-content">
        <div className="main-chat-area">
          <ClaudeChat />
        </div>
      </div>
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
};