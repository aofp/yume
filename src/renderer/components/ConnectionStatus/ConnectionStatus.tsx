import React, { useEffect, useState } from 'react';
import { IconLoader2 } from '@tabler/icons-react';
import './ConnectionStatus.css';

export const ConnectionStatus: React.FC = () => {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [details, setDetails] = useState('Starting server...');

  useEffect(() => {
    // Don't reset details if already set
    if (!details) {
      setDetails('Starting server...');
    }
    
    // Listen for console logs to determine connection status
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    console.log = (...args) => {
      originalLog(...args);
      const message = args.join(' ');
      
      if (message.includes('Successfully connected to Claude Code server')) {
        setStatus('connected');
        setDetails('Connected to server');
      } else if (message.includes('Disconnected from Claude Code server')) {
        setStatus('disconnected');
        setDetails('Server disconnected');
      } else if (message.includes('Connection attempt')) {
        setStatus('connecting');
        const match = message.match(/\((\d+)\/10\)/);
        if (match) {
          setDetails(`Connecting... (attempt ${match[1]}/10)`);
        }
      } else if (message.includes('Health check passed')) {
        setStatus('connecting');
        setDetails('Server ready, connecting...');
      }
    };

    console.error = (...args) => {
      originalError(...args);
      const message = args.join(' ');
      
      if (message.includes('Socket connection error')) {
        setStatus('disconnected');
        setDetails('Connection failed');
      } else if (message.includes('No server port available')) {
        setStatus('disconnected');
        setDetails('Server not available');
      }
    };

    console.warn = (...args) => {
      originalWarn(...args);
      const message = args.join(' ');
      
      if (message.includes('Max retries reached')) {
        setStatus('disconnected');
        setDetails('Server not responding');
      }
    };

    return () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    };
  }, []);

  if (status === 'connected') {
    return null; // Don't show when connected
  }

  return (
    <>
      {/* Loading overlay to prevent interactions */}
      <div className="connection-overlay">
        <IconLoader2 size={32} stroke={1.5} className="connection-spinner" />
      </div>
      <div className={`connection-status connection-status-${status}`}>
        <div className="connection-status-dot"></div>
        <span className="connection-status-text">{details || 'Checking connection...'}</span>
      </div>
    </>
  );
};