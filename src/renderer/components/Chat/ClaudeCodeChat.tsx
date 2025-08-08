/**
 * Chat Interface specifically for Claude Code SDK
 * Handles streaming, tool usage, and all SDK features
 */

import React, { useState, useRef, useEffect } from 'react';
import { Send, StopCircle, Zap, Shield, Server } from 'lucide-react';
import { useClaudeCodeStore } from '../../stores/claudeCodeStore';
// SDK Message types from Claude Code
export interface SDKMessage {
  id?: string;
  type: 'user' | 'assistant' | 'result' | 'system' | 'error';
  subtype?: 'init' | 'success' | 'error_max_turns' | 'error_during_execution';
  message?: {
    role?: string;
    content?: string | Array<{
      type: 'text' | 'tool_use' | 'tool_result';
      text?: string;
      name?: string;
      input?: any;
      output?: any;
      tool_use_id?: string;
      content?: any;
      is_error?: boolean;
    }>;
  };
  result?: any;
  num_turns?: number;
  duration_ms?: number;
  duration_api_ms?: number;
  total_cost_usd?: number;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  model?: string;
  permissionMode?: string;
  cwd?: string;
  tools?: string[];
  mcp_servers?: any[];
  session_id?: string;
  apiKeySource?: string;
  streaming?: boolean;
  timestamp?: number;
  is_error?: boolean;
}
import './ClaudeCodeChat.css';

export const ClaudeCodeChat: React.FC = () => {
  const [input, setInput] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [tempInput, setTempInput] = useState(''); // Store current input when navigating history
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  
  const {
    sessions,
    currentSessionId,
    isStreaming,
    streamingMessage,
    createSession,
    setCurrentSession,
    sendMessage,
    interruptSession,
    setPermissionMode
  } = useClaudeCodeStore();

  // Use current session from store
  const currentSession = sessions.find(s => s.id === currentSessionId);

  // Don't create a session on mount - let user start fresh
  
  // Load command history from session messages
  useEffect(() => {
    if (currentSession) {
      const userMessages = currentSession.messages
        .filter(m => m.type === 'user' && m.message?.content)
        .map(m => String(m.message.content));
      setCommandHistory(userMessages);
      setHistoryIndex(-1); // Reset to newest
    }
  }, [currentSession?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentSession?.messages, streamingMessage]);

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;
    
    try {
      // Ensure we have a current session
      if (!currentSessionId) {
        // Don't create automatically - user should create a session first
        return;
      }
      
      const message = input;
      
      // Add to command history (avoid duplicates of the last command)
      if (commandHistory.length === 0 || commandHistory[commandHistory.length - 1] !== message) {
        setCommandHistory([...commandHistory, message]);
      }
      setHistoryIndex(-1); // Reset history position
      setTempInput(''); // Clear temp input
      
      setInput('');
      await sendMessage(message);
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else if (e.key === 'ArrowUp') {
      // Navigate to previous command in history
      if (commandHistory.length > 0) {
        e.preventDefault();
        
        let newIndex = historyIndex;
        
        // If we're at the current input (-1), save it and move to last command
        if (historyIndex === -1) {
          setTempInput(input);
          newIndex = commandHistory.length - 1;
        } else if (historyIndex > 0) {
          // Move to older command
          newIndex = historyIndex - 1;
        }
        
        setHistoryIndex(newIndex);
        setInput(commandHistory[newIndex]);
        
        // Move cursor to end of text
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.selectionStart = inputRef.current.value.length;
            inputRef.current.selectionEnd = inputRef.current.value.length;
          }
        }, 0);
      }
    } else if (e.key === 'ArrowDown') {
      // Navigate to next command in history
      if (historyIndex >= 0) {
        e.preventDefault();
        
        let newIndex = historyIndex;
        let newInput = '';
        
        if (historyIndex < commandHistory.length - 1) {
          // Move to newer command
          newIndex = historyIndex + 1;
          newInput = commandHistory[newIndex];
        } else {
          // Return to current input
          newIndex = -1;
          newInput = tempInput;
        }
        
        setHistoryIndex(newIndex);
        setInput(newInput);
        
        // Move cursor to end of text
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.selectionStart = inputRef.current.value.length;
            inputRef.current.selectionEnd = inputRef.current.value.length;
          }
        }, 0);
      }
    } else if (e.key === 'Escape') {
      // Clear input and reset history navigation
      setInput('');
      setHistoryIndex(-1);
      setTempInput('');
    }
  };

  const renderMessage = (message: SDKMessage, index: number) => {
    // Skip rendering if this is not the latest version of a message with this ID
    if (message.id) {
      const lastIndex = currentSession?.messages.findLastIndex(m => m.id === message.id);
      if (lastIndex !== index) {
        return null;
      }
    }
    
    switch (message.type) {
      case 'user':
        return (
          <div key={message.id || `user-${index}`} className="claude-message user">
            <div className="message-header">
              <span className="message-role">You</span>
            </div>
            <div className="message-content">
              {typeof message.message?.content === 'string' 
                ? message.message.content.split('\n').map((line, i) => (
                    <React.Fragment key={i}>
                      {i > 0 && <br />}
                      {line}
                    </React.Fragment>
                  ))
                : 'Message sent'}
            </div>
          </div>
        );
        
      case 'assistant':
        const content = message.message?.content || [];
        const contentArray = Array.isArray(content) ? content : [];
        
        return (
          <div key={message.id || `assistant-${index}`} className="claude-message assistant">
            <div className="message-header">
              <span className="message-role">Claude Code</span>
              {message.streaming && !message.message?.content?.length && (
                <span className="streaming-indicator">●</span>
              )}
            </div>
            <div className="message-content">
              {contentArray.map((item: any, idx: number) => {
                if (!item || typeof item !== 'object') {
                  return null;
                }
                
                if (item.type === 'text') {
                  const text = item.text || '';
                  // Convert newlines to <br> tags
                  const formattedText = text.split('\n').map((line, i) => (
                    <React.Fragment key={i}>
                      {i > 0 && <br />}
                      {line}
                    </React.Fragment>
                  ));
                  return <div key={`text-${idx}`} className="text-content">{formattedText}</div>;
                } else if (item.type === 'tool_use') {
                  // Display tool use minimally
                  const toolIcons: Record<string, string> = {
                    'Read': '📖',
                    'Write': '✏️',
                    'Edit': '✂️',
                    'MultiEdit': '✂️',
                    'Bash': '💻',
                    'TodoWrite': '📝',
                    'WebSearch': '🔍',
                    'WebFetch': '🌐',
                    'Grep': '🔎',
                    'Glob': '📁',
                    'LS': '📂'
                  };
                  
                  // Special handling for Edit/MultiEdit to show diff
                  if (item.name === 'Edit' || item.name === 'MultiEdit') {
                    const filePath = item.input?.file_path || '';
                    const fileName = filePath.split('/').pop() || filePath;
                    
                    // For MultiEdit, show first edit summary
                    if (item.name === 'MultiEdit' && item.input?.edits?.length > 0) {
                      const editCount = item.input.edits.length;
                      const firstEdit = item.input.edits[0];
                      const preview = firstEdit.old_string?.substring(0, 30).replace(/\n/g, '↵').replace(/\s+/g, ' ').trim() || '';
                      return (
                        <div key={`tool-${idx}`} className="tool-use editing">
                          <span className="tool-icon">{toolIcons[item.name]}</span>
                          <span className="tool-action">Editing</span>
                          <span className="tool-file">{fileName}</span>
                          <span className="tool-edit-info">• {editCount} change{editCount > 1 ? 's' : ''}</span>
                        </div>
                      );
                    }
                    
                    // For single Edit
                    const oldStr = item.input?.old_string || '';
                    const newStr = item.input?.new_string || '';
                    // Clean up preview text
                    const oldPreview = oldStr.substring(0, 30).replace(/\n/g, '↵').replace(/\s+/g, ' ').trim();
                    const newPreview = newStr.substring(0, 30).replace(/\n/g, '↵').replace(/\s+/g, ' ').trim();
                    return (
                      <div key={`tool-${idx}`} className="tool-use editing">
                        <span className="tool-icon">{toolIcons[item.name]}</span>
                        <span className="tool-action">Editing</span>
                        <span className="tool-file">{fileName}</span>
                        {oldPreview && (
                          <span className="tool-preview">
                            • <span className="old-text">"{oldPreview}{oldStr.length > 30 ? '...' : ''}"</span>
                            → <span className="new-text">"{newPreview}{newStr.length > 30 ? '...' : ''}"</span>
                          </span>
                        )}
                      </div>
                    );
                  }
                  
                  // Default tool display
                  const toolName = item.name || 'Tool';
                  const icon = toolIcons[toolName] || '🔧';
                  
                  // Format different tool inputs
                  let detail = '';
                  if (item.input?.file_path) {
                    const parts = item.input.file_path.split('/');
                    detail = parts.length > 3 ? '.../' + parts.slice(-2).join('/') : item.input.file_path;
                  } else if (item.input?.pattern) {
                    detail = `"${item.input.pattern}"`;
                  } else if (item.input?.command) {
                    detail = item.input.command.length > 50 
                      ? item.input.command.substring(0, 50) + '...' 
                      : item.input.command;
                  } else if (item.input?.query) {
                    detail = `"${item.input.query}"`;
                  } else if (item.input?.path) {
                    detail = item.input.path;
                  }
                  
                  return (
                    <div key={`tool-${idx}`} className="tool-use">
                      <span className="tool-icon">{icon}</span>
                      <span className="tool-action">{toolName}</span>
                      {detail && <span className="tool-detail">{detail}</span>}
                    </div>
                  );
                } else if (item.type === 'tool_result') {
                  // Display tool results properly
                  if (item.is_error) {
                    const errorContent = typeof item.content === 'string' 
                      ? item.content.split('\n').map((line, i) => (
                        <React.Fragment key={i}>
                          {i > 0 && <br />}
                          {line}
                        </React.Fragment>
                      ))
                      : 'Tool execution failed';
                    return (
                      <div key={`result-${idx}`} className="tool-result error">
                        ❌ Error: {errorContent}
                      </div>
                    );
                  }
                  
                  // For file operations, show success briefly
                  if (typeof item.content === 'string' && item.content.includes('successfully')) {
                    const successContent = item.content.split('\n').map((line, i) => (
                      <React.Fragment key={i}>
                        {i > 0 && <br />}
                        {line}
                      </React.Fragment>
                    ));
                    return (
                      <div key={`result-${idx}`} className="tool-result success">
                        ✅ {successContent}
                      </div>
                    );
                  }
                  
                  // For todo updates, show in chat
                  if (item.content?.includes && item.content.includes('Todos')) {
                    return (
                      <div key={`result-${idx}`} className="tool-result todos">
                        📝 {item.content}
                      </div>
                    );
                  }
                  
                  // Skip verbose file contents
                  return null;
                }
                return null;
              })}
              {contentArray.length === 0 && message.streaming && (
                <div className="text-content thinking">
                  <span className="thinking-dot">●</span>
                  <span className="thinking-dot">●</span>
                  <span className="thinking-dot">●</span>
                </div>
              )}
            </div>
          </div>
        );
        
      case 'result':
        // Display result minimally
        if (message.subtype === 'success') {
          return (
            <div key={message.id || `result-${index}`} className="claude-message result-success">
              <div className="result-summary">
                ✨ Completed in {message.num_turns} turn{message.num_turns !== 1 ? 's' : ''} • 
                {message.duration_ms}ms • 
                ${message.total_cost_usd?.toFixed(4) || '0.0000'}
              </div>
              {message.result && (
                <div className="result-text">{message.result}</div>
              )}
            </div>
          );
        } else if (message.is_error) {
          return (
            <div key={message.id || `result-${index}`} className="claude-message result-error">
              ⚠️ {message.subtype?.replace('_', ' ')}
            </div>
          );
        }
        return null;
        
      case 'system':
        // Only show system init briefly
        if (message.subtype === 'init') {
          return (
            <div key={message.id || `system-${index}`} className="claude-message system-init">
              <span className="system-icon">⚡</span>
              <span className="system-text">Session initialized in {message.cwd || '/'}</span>
            </div>
          );
        }
        return null;
        
      case 'error':
        return (
          <div key={message.id || `error-${index}`} className="claude-message error">
            <div className="message-header">
              <span className="message-role">⚠️ Error</span>
            </div>
            <div className="message-content">
              {message.message?.content || 'An error occurred'}
            </div>
          </div>
        );
        
      default:
        console.log('Unknown message type:', message.type, message);
        return null;
    }
  };

  // Don't show empty state while initializing
  if (!currentSession) {
    return (
      <div className="claude-chat-empty">
        <div className="empty-content">
          <Zap size={48} />
          <h2>Claude Code SDK Studio</h2>
          <p>Initializing session...</p>
        </div>
      </div>
    );
  }
  
  if (!currentSession) {
    return (
      <div className="claude-chat-empty">
        <div className="empty-content">
          <Zap size={48} />
          <h2>Claude Code SDK Studio</h2>
          <p>Full Claude Code SDK integration with sessions, streaming, and tools</p>
          <button 
            className="btn-create-session"
            onClick={async () => {
              await createSession('Claude Code Session');
            }}
          >
            Start Claude Code Session
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="claude-chat">
      <div className="chat-header">
        <h3>{currentSession.name}</h3>
        <div className="header-actions">
          <button 
            onClick={() => setPermissionMode('default')}
            title="Default permissions"
          >
            <Shield size={16} />
          </button>
          <button 
            onClick={() => setPermissionMode('plan')}
            title="Plan mode"
          >
            📋
          </button>
          <button 
            onClick={() => setPermissionMode('acceptEdits')}
            title="Auto-accept edits"
          >
            ✅
          </button>
        </div>
      </div>
      
      <div className="chat-messages">
        {currentSession.messages.map((message, idx) => renderMessage(message, idx))}
        
        {/* No separate streaming message - handled within messages */}
        
        <div ref={messagesEndRef} />
      </div>
      
      <div className="chat-input-container">
        <textarea
          ref={inputRef}
          className={`chat-input ${historyIndex !== -1 ? 'history-mode' : ''}`}
          placeholder="Ask Claude Code to help with your project... (↑/↓ for history, ESC to clear)"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            // Reset history navigation when user types
            if (historyIndex !== -1) {
              setHistoryIndex(-1);
              setTempInput('');
            }
          }}
          onKeyDown={handleKeyDown}
          disabled={isStreaming}
          rows={3}
        />
        
        <div className="input-actions">
          {isStreaming ? (
            <button 
              className="btn-interrupt"
              onClick={interruptSession}
            >
              <StopCircle size={20} />
              <span>Stop</span>
            </button>
          ) : (
            <button 
              className="btn-send"
              onClick={handleSend}
              disabled={!input.trim()}
            >
              <Send size={20} />
              <span>Send</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};