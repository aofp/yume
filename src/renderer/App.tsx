import React, { useState, useEffect } from 'react';
import { SessionManager } from './components/SessionManager/SessionManager';
import { SessionTabs } from './components/SessionTabs/SessionTabs';
import { ClaudeCodeChat } from './components/Chat/ClaudeCodeChat';
import { Sidebar } from './components/Layout/Sidebar';
import { SidePanel } from './components/Layout/SidePanel';
import { TitleBar } from './components/Layout/TitleBar';
import { StatusBar } from './components/Layout/StatusBar';
import { PermissionModal } from './components/Modals/PermissionModal';
import { SettingsModal } from './components/Modals/SettingsModal';
import { useStore } from './stores/useStore';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from './services/api';

export const App: React.FC = () => {
  const [activeView, setActiveView] = useState<string>('chat');
  const [sidePanelOpen, setSidePanelOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  
  const { 
    currentSession, 
    permissionRequest,
    handlePermissionResponse 
  } = useStore();

  useEffect(() => {
    // Add platform class to body for platform-specific styling
    const platform = navigator.platform.toLowerCase();
    if (platform.includes('win')) {
      document.body.classList.add('platform-win32');
    } else if (platform.includes('mac')) {
      document.body.classList.add('platform-darwin');
    } else {
      document.body.classList.add('platform-linux');
    }
    
    // Check if electronAPI is available
    console.log('electronAPI available:', !!window.electronAPI);
    if (window.electronAPI) {
      console.log('electronAPI.window:', window.electronAPI.window);
    }
    
    // Initialize app
    // TODO: api.system doesn't exist - need to implement or remove
    // api.system.getVersion().then((result) => {
    //   if (result.success) {
    //     console.log('Claude Code Studio v' + result.version);
    //   }
    // });

    // Listen for events
    // TODO: api.on doesn't exist - need to implement or remove  
    // api.on('permission-request', (request: any) => {
    //   // Handle permission request
    // });

    return () => {
      // Cleanup
    };
  }, []);

  return (
    <div className="app">
      <TitleBar onSettingsClick={() => setSettingsOpen(true)} />
      <SessionTabs />
      
      <div className="app-body">
        <Sidebar 
          activeView={activeView} 
          onViewChange={setActiveView} 
        />
        
        <main className="main-content">
          <AnimatePresence mode="wait">
            {activeView === 'sessions' && (
              <motion.div
                key="sessions"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
              >
                <SessionManager />
              </motion.div>
            )}
            
            {activeView === 'chat' && (
              <motion.div
                key="chat"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
                className="chat-container"
              >
                <ClaudeCodeChat />
              </motion.div>
            )}
          </AnimatePresence>
        </main>
        
        <SidePanel 
          isOpen={sidePanelOpen} 
          onToggle={() => setSidePanelOpen(!sidePanelOpen)} 
        />
      </div>
      
      <StatusBar />
      
      {/* Modals */}
      <AnimatePresence>
        {permissionRequest && (
          <PermissionModal
            request={permissionRequest}
            onResponse={handlePermissionResponse}
          />
        )}
        
        {settingsOpen && (
          <SettingsModal onClose={() => setSettingsOpen(false)} />
        )}
      </AnimatePresence>
    </div>
  );
};