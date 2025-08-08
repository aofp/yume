import React, { useState, useRef, useEffect } from 'react';
import { 
  IconSend, 
  IconPlayerStop, 
  IconFolderOpen,
  IconBook,
  IconPencil,
  IconScissors,
  IconTerminal,
  IconChecklist,
  IconSearch,
  IconWorld,
  IconFileSearch,
  IconFolder,
  IconFolderOpen as IconFolderOpen2,
  IconRobot,
  IconCheck,
  IconNotebook,
  IconTool,
  IconX,
  IconAlertTriangle,
  IconFileText,
  IconFile
} from '@tabler/icons-react';
import { MessageRenderer } from './MessageRenderer';
import { useClaudeCodeStore } from '../../stores/claudeCodeStore';
import { ModelSelector } from '../ModelSelector/ModelSelector';
import { WelcomeScreen } from '../Welcome/WelcomeScreen';
import './ClaudeChat.css';

// Helper function to format tool displays
const getToolDisplay = (name: string, input: any) => {
  const displays: Record<string, (input: any) => { icon: React.ReactNode; name: string; detail: string }> = {
    'Read': (i) => ({ 
      icon: <IconBook size={14} stroke={1.5} />, 
      name: 'reading', 
      detail: i?.file_path || 'file' 
    }),
    'Write': (i) => ({ 
      icon: <IconPencil size={14} stroke={1.5} />, 
      name: 'writing', 
      detail: i?.file_path || 'file' 
    }),
    'Edit': (i) => ({ 
      icon: <IconScissors size={14} stroke={1.5} />, 
      name: 'editing', 
      detail: `${i?.file_path || 'file'}${i?.old_string ? ` (${i.old_string.substring(0, 20)}...)` : ''}` 
    }),
    'MultiEdit': (i) => ({ 
      icon: <IconScissors size={14} stroke={1.5} />, 
      name: 'multi-edit', 
      detail: `${i?.file_path || 'file'} (${i?.edits?.length || 0} changes)` 
    }),
    'Bash': (i) => ({ 
      icon: <IconTerminal size={14} stroke={1.5} />, 
      name: 'running', 
      detail: i?.command || 'command' 
    }),
    'TodoWrite': (i) => ({ 
      icon: <IconChecklist size={14} stroke={1.5} />, 
      name: 'todos', 
      detail: `${i?.todos?.length || 0} items` 
    }),
    'WebSearch': (i) => ({ 
      icon: <IconSearch size={14} stroke={1.5} />, 
      name: 'searching', 
      detail: i?.query || 'web' 
    }),
    'WebFetch': (i) => ({ 
      icon: <IconWorld size={14} stroke={1.5} />, 
      name: 'fetching', 
      detail: i?.url ? new URL(i.url).hostname : 'webpage' 
    }),
    'Grep': (i) => ({ 
      icon: <IconFileSearch size={14} stroke={1.5} />, 
      name: 'searching', 
      detail: `"${i?.pattern || ''}" in ${i?.path || '.'}` 
    }),
    'Glob': (i) => ({ 
      icon: <IconFolder size={14} stroke={1.5} />, 
      name: 'finding', 
      detail: i?.pattern || 'files' 
    }),
    'LS': (i) => ({ 
      icon: <IconFolderOpen2 size={14} stroke={1.5} />, 
      name: 'listing', 
      detail: i?.path || 'directory' 
    }),
    'Task': (i) => ({ 
      icon: <IconRobot size={14} stroke={1.5} />, 
      name: 'task', 
      detail: i?.description || 'running agent' 
    }),
    'ExitPlanMode': (i) => ({ 
      icon: <IconCheck size={14} stroke={1.5} />, 
      name: 'plan ready', 
      detail: 'exiting plan mode' 
    }),
    'NotebookEdit': (i) => ({ 
      icon: <IconNotebook size={14} stroke={1.5} />, 
      name: 'notebook', 
      detail: i?.notebook_path || 'jupyter notebook' 
    })
  };
  
  const defaultDisplay = { 
    icon: <IconTool size={14} stroke={1.5} />, 
    name: name || 'tool', 
    detail: input ? JSON.stringify(input).substring(0, 50) + '...' : '' 
  };
  
  return displays[name || ''] ? displays[name || ''](input) : defaultDisplay;
};

interface Attachment {
  id: string;
  type: 'image' | 'text' | 'file';
  name: string;
  size?: number;
  content: string; // dataUrl for images, text content for text, file path for files
  preview?: string; // short preview for display
}

export const ClaudeChat: React.FC = () => {
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  
  const {
    sessions,
    currentSessionId,
    persistedSessionId,
    isStreaming,
    createSession,
    sendMessage,
    resumeSession,
    interruptSession,
    clearContext,
    selectedModel,
    setSelectedModel,
    loadPersistedSession
  } = useClaudeCodeStore();

  const currentSession = sessions.find(s => s.id === currentSessionId);

  // NO AUTO-CREATION and NO AUTO-RESUME
  // Sessions are ephemeral - they don't survive app restarts
  // User must manually create sessions with the + button

  // NO auto-selection - user must explicitly choose or create a session

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentSession?.messages]);

  useEffect(() => {
    // Focus input and clear state when session changes
    inputRef.current?.focus();
    setInput('');
    setAttachments([]);
  }, [currentSessionId]);

  const handleSend = async () => {
    if ((!input.trim() && attachments.length === 0) || isStreaming) return;
    
    try {
      // Don't create a new session here - sessions should only be created via the new tab button
      if (!currentSessionId) {
        console.error('No active session - please create a new session first');
        return;
      }
      
      // Build message content with attachments
      let messageContent = input;
      if (attachments.length > 0) {
        const contentBlocks = [];
        
        // Add all attachments as content blocks
        for (const attachment of attachments) {
          if (attachment.type === 'image') {
            contentBlocks.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: attachment.content.startsWith('data:image/png') ? 'image/png' : 'image/jpeg',
                data: attachment.content.split(',')[1]
              }
            });
          } else if (attachment.type === 'text') {
            // Include text attachments as part of the message
            contentBlocks.push({
              type: 'text',
              text: `[Attached text]:\n${attachment.content}`
            });
          }
        }
        
        // Add the main message text
        if (input.trim()) {
          contentBlocks.push({ type: 'text', text: input });
        }
        
        messageContent = JSON.stringify(contentBlocks);
      }
      
      setInput('');
      setAttachments([]);
      await sendMessage(messageContent);
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    // Let all other key combinations work naturally (including Cmd+A)
  };

  // Handle paste event for images
  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const text = e.clipboardData.getData('text/plain');
    
    // Handle text paste - only create attachment if it's substantial text (not just a few chars)
    if (text && text.length > 50 && !text.startsWith('http')) {
      e.preventDefault();
      const newAttachment: Attachment = {
        id: Math.random().toString(36).substr(2, 9),
        type: 'text',
        name: `text_${Date.now()}.txt`,
        content: text,
        preview: text.substring(0, 100) + (text.length > 100 ? '...' : '')
      };
      setAttachments(prev => [...prev, newAttachment]);
      return;
    }
    
    // Handle image paste
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf('image') !== -1) {
        const blob = item.getAsFile();
        if (blob && attachments.length < 10) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const dataUrl = event.target?.result as string;
            const newAttachment: Attachment = {
              id: Math.random().toString(36).substr(2, 9),
              type: 'image',
              name: blob.name || `image_${Date.now()}.png`,
              size: blob.size,
              content: dataUrl,
              preview: 'Image'
            };
            setAttachments(prev => [...prev, newAttachment]);
          };
          reader.readAsDataURL(blob);
        }
      }
    }
  };

  // Handle drag and drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    
    for (const file of files) {
      if (attachments.length >= 10) break;
      
      if (file.type.startsWith('image/')) {
        // Handle image files
        const reader = new FileReader();
        reader.onload = (event) => {
          const dataUrl = event.target?.result as string;
          const newAttachment: Attachment = {
            id: Math.random().toString(36).substr(2, 9),
            type: 'image',
            name: file.name,
            size: file.size,
            content: dataUrl,
            preview: 'Image'
          };
          setAttachments(prev => [...prev, newAttachment]);
        };
        reader.readAsDataURL(file);
      } else if (file.type.startsWith('text/')) {
        // Handle text files
        const reader = new FileReader();
        reader.onload = (event) => {
          const text = event.target?.result as string;
          const newAttachment: Attachment = {
            id: Math.random().toString(36).substr(2, 9),
            type: 'text',
            name: file.name,
            size: file.size,
            content: text,
            preview: text.substring(0, 100) + (text.length > 100 ? '...' : '')
          };
          setAttachments(prev => [...prev, newAttachment]);
        };
        reader.readAsText(file);
      }
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(att => att.id !== id));
  };

  // Auto-resize textarea
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    
    // Auto-resize logic
    const textarea = e.target;
    const lineHeight = 18;
    const minLines = 3;
    const maxLines = 8;
    const minHeight = lineHeight * minLines;
    const maxHeight = lineHeight * maxLines;
    
    textarea.style.height = 'auto';
    const scrollHeight = textarea.scrollHeight;
    
    if (scrollHeight <= maxHeight) {
      textarea.style.height = Math.max(scrollHeight, minHeight) + 'px';
      textarea.style.overflow = 'hidden';
    } else {
      textarea.style.height = maxHeight + 'px';
      textarea.style.overflow = 'auto';
    }
  };

  // Handle right-click context menu
  const handleContextMenu = (e: React.MouseEvent) => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY });
    }
  };

  const handleCopySelection = () => {
    const selection = window.getSelection();
    if (selection) {
      const text = selection.toString();
      navigator.clipboard.writeText(text);
    }
    setContextMenu(null);
  };

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu]);




  if (!currentSession) {
    return <WelcomeScreen />;
  }

  return (
    <div 
      className="chat-container" 
      key={currentSessionId}
      ref={chatContainerRef}
      onContextMenu={handleContextMenu}
    >
      <div className="chat-messages">
        {currentSession.messages
          .reduce((acc, message, index, array) => {
            // Group messages by type and only show final versions
            
            // Always show user messages (but deduplicate)
            if (message.type === 'user') {
              // Skip empty messages
              const content = message.message?.content;
              if (!content || (typeof content === 'string' && !content.trim())) {
                return acc;
              }
              
              // Check if this exact user message already exists in accumulator
              const exists = acc.some(m => 
                m.type === 'user' && 
                m.id === message.id
              );
              
              if (!exists) {
                // Also check if there's a very recent duplicate (within 1 second)
                const recentDuplicate = acc.some(m => 
                  m.type === 'user' && 
                  m.message?.content === message.message?.content &&
                  Math.abs((m.timestamp || 0) - (message.timestamp || 0)) < 1000
                );
                
                if (!recentDuplicate) {
                  acc.push(message);
                }
              }
              return acc;
            }
            
            // For assistant messages, always show them
            if (message.type === 'assistant') {
              // Check if we already have this message
              const existingIndex = acc.findIndex(m => 
                m.type === 'assistant' && 
                m.id === message.id
              );
              
              if (existingIndex >= 0) {
                // Update existing message
                acc[existingIndex] = message;
              } else {
                // Add new message
                acc.push(message);
              }
              return acc;
            }
            
            // Skip tool messages during streaming - they'll be in the assistant message
            if ((message.type === 'tool_use' || message.type === 'tool_result') && isStreaming) {
              return acc;
            }
            
            // For system messages (session started, errors, etc)
            if (message.type === 'system') {
              acc.push(message);
              return acc;
            }
            
            // For result messages (completion)
            if (message.type === 'result') {
              // Only keep the last result message
              const resultIndex = acc.findIndex(m => m.type === 'result');
              if (resultIndex >= 0) {
                acc[resultIndex] = message;
              } else {
                acc.push(message);
              }
              return acc;
            }
            
            return acc;
          }, [] as typeof currentSession.messages)
          .map((message, idx) => (
            <MessageRenderer key={`${message.id || message.type}-${idx}`} message={message} index={idx} />
          ))}
        <div ref={messagesEndRef} />
      </div>
      
      <div 
        className={`chat-input-container ${isDragging ? 'dragging' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Attachment preview area */}
        {attachments.length > 0 && (
          <div className="attachments-container">
            {attachments.map(att => (
              <div key={att.id} className="attachment-item">
                <div className="attachment-content">
                  {att.type === 'image' ? (
                    <>
                      <img src={att.content} alt={att.name} className="attachment-preview-img" />
                      <span className="attachment-label">image</span>
                    </>
                  ) : att.type === 'text' ? (
                    <>
                      <div className="attachment-preview-text">
                        <IconFileText size={20} stroke={1.5} />
                      </div>
                      <span className="attachment-label">text</span>
                    </>
                  ) : (
                    <>
                      <div className="attachment-preview-file">
                        <IconFile size={20} stroke={1.5} />
                      </div>
                      <span className="attachment-label">file</span>
                    </>
                  )}
                </div>
                <button 
                  className="attachment-remove" 
                  onClick={() => removeAttachment(att.id)}
                  title="remove"
                >
                  <IconX size={12} stroke={2} />
                </button>
                <span className="image-name">{att.name.substring(0, 10)}...</span>
              </div>
            ))}
          </div>
        )}
        <div className="input-row">
          <textarea
            ref={inputRef}
            className="chat-input"
            placeholder="code prompt..."
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            disabled={false}
            rows={3}
            style={{ minHeight: '54px', maxHeight: '144px', overflow: 'hidden' }}
          />
          
          <div className="input-buttons">
            <button 
              className={`btn-stop ${!isStreaming ? 'disabled' : ''}`}
              onClick={interruptSession}
              disabled={!isStreaming}
              title={isStreaming ? "stop generation" : "no active task"}
            >
                <IconPlayerStop size={18} stroke={1.5} />
            </button>
            <button 
              className="btn-send"
              onClick={handleSend}
              disabled={!input.trim() && attachments.length === 0}
              title="send message"
            >
                <IconSend size={20} stroke={1.5} />
            </button>
          </div>
        </div>
        
        {/* Context info bar */}
        <div className="context-bar">
          <ModelSelector value={selectedModel} onChange={setSelectedModel} />
          <div className="context-info">
            {(() => {
              const tokens = currentSession.messages.reduce((acc, msg) => {
                const content = msg.message?.content || '';
                const chars = typeof content === 'string' ? content.length : JSON.stringify(content).length;
                return acc + Math.ceil(chars / 4);
              }, 0);
              
              const percentage = Math.min(100, Math.round(tokens / 50000 * 100)); // 200k context = ~50k tokens
              const usageClass = percentage >= 90 ? 'high' : percentage >= 80 ? 'medium' : 'low';
              
              return (
                <>
                  <button className="btn-clear-context" onClick={() => {
                    // Clear messages but keep session
                    if (currentSessionId) {
                      clearContext(currentSessionId);
                    }
                  }}>
                    clear
                  </button>
                  <span className="context-tokens">
                    {tokens.toLocaleString()} tokens
                  </span>
                  <span className={`context-usage ${usageClass}`}>
                    {percentage}% used
                  </span>
                </>
              );
            })()}
          </div>
        </div>
      </div>
      
      {/* Context Menu */}
      {contextMenu && (
        <div 
          className="context-menu"
          style={{ 
            position: 'fixed', 
            left: contextMenu.x, 
            top: contextMenu.y,
            zIndex: 1000
          }}
        >
          <button 
            className="context-menu-item"
            onClick={handleCopySelection}
          >
            <IconScissors size={14} stroke={1.5} />
            <span>copy</span>
          </button>
        </div>
      )}
    </div>
  );
};