import React, { useEffect, useState } from 'react';
import { useClaudeCodeStore } from '../../stores/claudeCodeStore';
import { claudeCodeClient } from '../../services/claudeCodeClient';
import './DebugPanel.css';

export const DebugPanel: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [streamHealth, setStreamHealth] = useState<any>({});
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  
  const currentSessionId = useClaudeCodeStore(state => state.currentSessionId);
  const sessions = useClaudeCodeStore(state => state.sessions);
  const currentSession = sessions.find(s => s.id === currentSessionId);
  
  // Toggle with Ctrl+D
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'd') {
        e.preventDefault();
        setIsVisible(prev => !prev);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  
  // Update health every second
  useEffect(() => {
    const interval = setInterval(() => {
      setLastUpdate(new Date());
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);
  
  if (!isVisible) return null;
  
  const messageCount = currentSession?.messages.length || 0;
  const lastMessage = currentSession?.messages[messageCount - 1];
  const timeSinceLastMessage = lastMessage?.timestamp 
    ? Date.now() - lastMessage.timestamp 
    : null;
  
  const assistantMessages = currentSession?.messages.filter(m => m.type === 'assistant') || [];
  const streamingAssistants = assistantMessages.filter(m => m.streaming === true);
  const nonStreamingAssistants = assistantMessages.filter(m => m.streaming === false);
  
  return (
    <div className="debug-panel">
      <div className="debug-header">
        <span>debug panel (ctrl+d to toggle)</span>
        <span className="debug-time">{lastUpdate.toLocaleTimeString()}</span>
      </div>
      
      <div className="debug-section">
        <div className="debug-label">connection</div>
        <div className="debug-value">
          {claudeCodeClient.isConnected() ? '🟢 connected' : '🔴 disconnected'}
        </div>
      </div>
      
      <div className="debug-section">
        <div className="debug-label">session</div>
        <div className="debug-value">{currentSessionId || 'none'}</div>
      </div>
      
      <div className="debug-section">
        <div className="debug-label">streaming</div>
        <div className="debug-value">
          {currentSession?.streaming ? '🟢 active' : '⚫ inactive'}
        </div>
      </div>
      
      <div className="debug-section">
        <div className="debug-label">messages</div>
        <div className="debug-value">
          total: {messageCount}
          <br />
          assistant: {assistantMessages.length}
          <br />
          streaming: {streamingAssistants.length}
          <br />
          completed: {nonStreamingAssistants.length}
        </div>
      </div>
      
      <div className="debug-section">
        <div className="debug-label">last message</div>
        <div className="debug-value">
          {lastMessage ? (
            <>
              type: {lastMessage.type}
              <br />
              id: {lastMessage.id?.substring(0, 8)}...
              <br />
              streaming: {lastMessage.streaming?.toString() || 'n/a'}
              <br />
              age: {timeSinceLastMessage ? `${Math.floor(timeSinceLastMessage / 1000)}s` : 'n/a'}
            </>
          ) : 'none'}
        </div>
      </div>
      
      <div className="debug-section">
        <div className="debug-label">stuck streams</div>
        <div className="debug-value">
          {streamingAssistants.map(msg => (
            <div key={msg.id} className="stuck-stream">
              {msg.id?.substring(0, 8)}... - {Math.floor((Date.now() - (msg.timestamp || 0)) / 1000)}s ago
            </div>
          ))}
          {streamingAssistants.length === 0 && 'none'}
        </div>
      </div>
    </div>
  );
};