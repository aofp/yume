import React, { useEffect } from 'react';
import { TitleBar } from './components/Layout/TitleBar';
import { SessionTabs } from './components/SessionTabs/SessionTabs';
import { ClaudeChat } from './components/Chat/ClaudeChat';
import { WindowControls } from './components/WindowControls/WindowControls';
import { useClaudeCodeStore } from './stores/claudeCodeStore';
import './App.minimal.css';

export const App: React.FC = () => {
  const { currentSessionId, sessions, createSession } = useClaudeCodeStore();
  
  console.log('App component rendering, sessions:', sessions, 'currentSessionId:', currentSessionId);
  
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

  return (
    <div className="app-minimal">
      <WindowControls />
      <TitleBar onSettingsClick={() => {}} />
      <SessionTabs />
      <div className="app-content">
        <ClaudeChat />
      </div>
    </div>
  );
};