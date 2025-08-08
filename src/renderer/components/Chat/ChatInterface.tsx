import React, { useState, useRef, useEffect } from 'react';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { useStore } from '../../stores/useStore';
import './ChatInterface.css';

export const ChatInterface: React.FC = () => {
  const { currentSession, sendMessage } = useStore();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [currentSession?.messages]);

  const handleSend = async () => {
    if (!input.trim()) return;
    
    const message = input;
    setInput('');
    await sendMessage(message);
  };

  if (!currentSession) {
    return (
      <div className="chat-empty">
        <div className="chat-empty-content">
          <h2>Welcome to Claude Code Studio</h2>
          <p>Create or select a session to start chatting</p>
          <button 
            className="btn-primary"
            onClick={() => useStore.getState().createSession('New Session')}
          >
            Create New Session
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-interface">
      <div className="chat-messages">
        <MessageList messages={currentSession.messages} />
        <div ref={messagesEndRef} />
      </div>
      
      <MessageInput
        value={input}
        onChange={setInput}
        onSend={handleSend}
        disabled={false}
      />
    </div>
  );
};