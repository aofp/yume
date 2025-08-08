import React, { useState, useEffect } from 'react';
import { Cpu, DollarSign, Hash, Wifi, WifiOff, Server } from 'lucide-react';
import { useStore } from '../../stores/useStore';
import { claudeCodeClient } from '../../services/claudeCodeClient';
import './StatusBar.css';

export const StatusBar: React.FC = () => {
  const { currentSession, settings } = useStore();
  const [serverConnected, setServerConnected] = useState(false);

  useEffect(() => {
    // Check server connection
    const checkServer = async () => {
      const connected = await claudeCodeClient.checkHealth();
      setServerConnected(connected);
    };
    
    checkServer();
    const interval = setInterval(checkServer, 30000); // Check every 30 seconds instead of 2
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="statusbar">
      <div className="statusbar-section">
        <div className="statusbar-item">
          {serverConnected ? (
            <>
              <Server size={12} style={{color: '#10B981'}} />
              <span style={{color: '#10B981'}}>Claude Code Server Connected</span>
            </>
          ) : (
            <>
              <WifiOff size={12} style={{color: '#EF4444'}} />
              <span style={{color: '#EF4444'}}>Server Disconnected (run: npm run server)</span>
            </>
          )}
        </div>
      </div>

      <div className="statusbar-section">
        <div className="statusbar-item">
          <Cpu size={12} />
          <span>{settings.model}</span>
        </div>

        {currentSession && (
          <>
            <div className="statusbar-separator" />
            
            <div className="statusbar-item">
              <Hash size={12} />
              <span>{currentSession.tokenCount.toLocaleString()} tokens</span>
            </div>

            <div className="statusbar-separator" />

            <div className="statusbar-item">
              <DollarSign size={12} />
              <span>${currentSession.cost.toFixed(2)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};