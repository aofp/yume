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
  IconFile,
  IconLoader2,
  IconChartBar
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
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchIndex, setSearchIndex] = useState(0);
  const [searchMatches, setSearchMatches] = useState<number[]>([]);
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
    loadPersistedSession,
    updateSessionDraft
  } = useClaudeCodeStore();

  const currentSession = sessions.find(s => s.id === currentSessionId);

  // NO AUTO-CREATION and NO AUTO-RESUME
  // Sessions are ephemeral - they don't survive app restarts
  // User must manually create sessions with the + button

  // NO auto-selection - user must explicitly choose or create a session

  useEffect(() => {
    // Only autoscroll if user is already at the bottom
    if (chatContainerRef.current) {
      const container = chatContainerRef.current;
      const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      
      if (isAtBottom) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [currentSession?.messages]);

  // Handle Ctrl+F for search and Ctrl+L for clear
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setSearchVisible(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
        e.preventDefault();
        if (currentSessionId) {
          clearContext(currentSessionId);
        }
      } else if (e.key === 'Escape' && searchVisible) {
        setSearchVisible(false);
        setSearchQuery('');
        setSearchMatches([]);
        setSearchIndex(0);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchVisible, currentSessionId, clearContext]);

  // Search functionality
  useEffect(() => {
    if (!searchQuery || !currentSession) {
      setSearchMatches([]);
      setSearchIndex(0);
      return;
    }

    const matches: number[] = [];
    currentSession.messages.forEach((msg, idx) => {
      let content = '';
      if (msg.message?.content) {
        if (typeof msg.message.content === 'string') {
          content = msg.message.content;
        } else if (Array.isArray(msg.message.content)) {
          content = msg.message.content
            .filter((b: any) => b.type === 'text' && b.text)
            .map((b: any) => b.text)
            .join(' ');
        }
      }
      if (content.toLowerCase().includes(searchQuery.toLowerCase())) {
        matches.push(idx);
      }
    });
    setSearchMatches(matches);
    setSearchIndex(0);

    // Scroll to first match
    if (matches.length > 0) {
      const element = document.querySelector(`[data-message-index="${matches[0]}"]`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [searchQuery, currentSession]);

  const navigateSearch = (direction: 'next' | 'prev') => {
    if (searchMatches.length === 0) return;
    
    let newIndex = searchIndex;
    if (direction === 'next') {
      newIndex = (searchIndex + 1) % searchMatches.length;
    } else {
      newIndex = searchIndex === 0 ? searchMatches.length - 1 : searchIndex - 1;
    }
    
    setSearchIndex(newIndex);
    const element = document.querySelector(`[data-message-index="${searchMatches[newIndex]}"]`);
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  useEffect(() => {
    // Load draft input and attachments when session changes
    // Only trigger on sessionId change, not on session updates (to avoid losing text during streaming)
    inputRef.current?.focus();
    if (currentSession) {
      setInput(currentSession.draftInput || '');
      setAttachments(currentSession.draftAttachments || []);
    } else {
      setInput('');
      setAttachments([]);
    }
  }, [currentSessionId]); // Removed currentSession to prevent resets during streaming

  // Save drafts when input or attachments change
  useEffect(() => {
    if (currentSessionId) {
      const timeoutId = setTimeout(() => {
        updateSessionDraft(currentSessionId, input, attachments);
      }, 500); // Debounce saving
      return () => clearTimeout(timeoutId);
    }
  }, [input, attachments, currentSessionId, updateSessionDraft]);

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
      // Clear drafts after sending
      updateSessionDraft(currentSessionId, '', []);
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
    e.stopPropagation();
    setIsDragging(false);
    
    console.log('Chat drop event:', e.dataTransfer);
    
    // Try to detect folders using webkitGetAsEntry
    const items = Array.from(e.dataTransfer.items);
    for (const item of items) {
      if (item.kind === 'file') {
        const entry = (item as any).webkitGetAsEntry?.();
        if (entry) {
          console.log('Entry:', entry.name, 'isDirectory:', entry.isDirectory, 'fullPath:', entry.fullPath);
          
          // If it's a directory, get the file to access its path
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
        // Use Electron's fs to check if it's a directory
        const isDir = window.electronAPI.isDirectory(path);
        if (isDir) {
          console.log('Creating session for folder:', path);
          const sessionName = path.split(/[/\\]/).pop() || 'new session';
          await createSession(sessionName, path);
          return;
        }
      }
    }
    
    // Handle regular file drops for attachments
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
      {/* Search bar */}
      {searchVisible && (
        <div className="search-bar">
          <input
            type="text"
            className="search-input"
            placeholder="search messages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
          <div className="search-controls">
            {searchMatches.length > 0 && (
              <span className="search-count">
                {searchIndex + 1} / {searchMatches.length}
              </span>
            )}
            <button 
              className="search-btn" 
              onClick={() => navigateSearch('prev')}
              disabled={searchMatches.length === 0}
            >
              ↑
            </button>
            <button 
              className="search-btn" 
              onClick={() => navigateSearch('next')}
              disabled={searchMatches.length === 0}
            >
              ↓
            </button>
            <button 
              className="search-btn close" 
              onClick={() => {
                setSearchVisible(false);
                setSearchQuery('');
                setSearchMatches([]);
                setSearchIndex(0);
              }}
            >
              ×
            </button>
          </div>
        </div>
      )}
      <div className="chat-messages">
        {(() => {
          const processedMessages = currentSession.messages
            .reduce((acc, message, index, array) => {
            // Group messages by type and only show final versions
            
            // Always show user messages (but deduplicate)
            if (message.type === 'user') {
              // Skip empty messages
              const content = message.message?.content;
              if (!content || (typeof content === 'string' && !content.trim())) {
                return acc;
              }
              
              // Check if this exact user message already exists by ID
              const existsById = acc.some(m => 
                m.type === 'user' && 
                m.id && 
                message.id &&
                m.id === message.id
              );
              
              if (existsById) {
                return acc; // Skip if ID already exists
              }
              
              // Also check for duplicate content within 2 seconds
              const contentDuplicate = acc.some(m => 
                m.type === 'user' && 
                JSON.stringify(m.message?.content) === JSON.stringify(message.message?.content) &&
                Math.abs((m.timestamp || 0) - (message.timestamp || 0)) < 2000
              );
              
              if (!contentDuplicate) {
                acc.push(message);
              }
              return acc;
            }
            
            // For assistant messages, deduplicate properly
            if (message.type === 'assistant') {
              // First check by ID if both have IDs
              if (message.id) {
                const existingIndex = acc.findIndex(m => 
                  m.type === 'assistant' && 
                  m.id && 
                  m.id === message.id
                );
                
                if (existingIndex >= 0) {
                  // Update existing message (for streaming updates)
                  acc[existingIndex] = message;
                  return acc;
                }
              }
              
              // Check for duplicate content within a short time window
              const contentDuplicate = acc.some(m => 
                m.type === 'assistant' && 
                JSON.stringify(m.message?.content) === JSON.stringify(message.message?.content) &&
                Math.abs((m.timestamp || 0) - (message.timestamp || 0)) < 2000
              );
              
              if (!contentDuplicate) {
                acc.push(message);
              }
              return acc;
            }
            
            // Always show tool messages - users need to see what's happening
            // Don't skip them even during streaming
            if (message.type === 'tool_use' || message.type === 'tool_result') {
              acc.push(message);
              return acc;
            }
            
            // For system messages (session started, errors, etc)
            if (message.type === 'system') {
              acc.push(message);
              return acc;
            }
            
            // For result messages (completion)
            if (message.type === 'result') {
              // Keep all result messages to show timing for each query
              acc.push(message);
              return acc;
            }
            
            return acc;
            }, [] as typeof currentSession.messages);
          
          const filteredMessages = processedMessages;
          return filteredMessages.map((message, idx) => {
            const isHighlighted = searchMatches.includes(idx) && searchMatches[searchIndex] === idx;
            return (
              <div 
                key={`${message.id || message.type}-${idx}`}
                data-message-index={idx}
                className={isHighlighted ? 'message-highlighted' : ''}
              >
                <MessageRenderer 
                  message={message} 
                  index={idx}
                  isLast={idx === filteredMessages.length - 1}
                />
              </div>
            );
          });
        })()}
        {/* Show thinking indicator immediately when streaming starts */}
        {isStreaming && currentSession.messages.filter(m => m.type === 'assistant' && m.streaming).length === 0 && (
          <div className="message assistant">
            <div className="message-content">
              <div className="thinking-indicator-bottom">
                <IconLoader2 size={14} stroke={1.5} className="spinning-loader" />
                <span>thinking...</span>
              </div>
            </div>
          </div>
        )}
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
                        <div className="text-preview">
                          {att.content.substring(0, 20)}{att.content.length > 20 ? '...' : ''}
                        </div>
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
                {att.type !== 'text' && <span className="image-name">{att.name.substring(0, 10)}...</span>}
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
                  <button className="btn-stats" onClick={() => setShowStatsModal(true)}>
                    stats
                  </button>
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
      
      {showStatsModal && currentSession?.analytics && (
        <div className="stats-modal-overlay" onClick={() => setShowStatsModal(false)}>
          <div className="stats-modal" onClick={(e) => e.stopPropagation()}>
            <div className="stats-header">
              <h3>session analytics</h3>
              <button className="stats-close" onClick={() => setShowStatsModal(false)}>
                <IconX size={16} />
              </button>
            </div>
            <div className="stats-content">
              <div className="stats-grid">
                <div className="stat-item">
                  <IconChartBar size={16} />
                  <div className="stat-label">total tokens</div>
                  <div className="stat-value">{currentSession.analytics.tokens.total.toLocaleString()}</div>
                </div>
                <div className="stat-item">
                  <IconChartBar size={16} />
                  <div className="stat-label">messages</div>
                  <div className="stat-value">{currentSession.analytics.totalMessages}</div>
                </div>
                <div className="stat-item">
                  <IconChartBar size={16} />
                  <div className="stat-label">tool uses</div>
                  <div className="stat-value">{currentSession.analytics.toolUses}</div>
                </div>
                <div className="stat-item">
                  <IconChartBar size={16} />
                  <div className="stat-label">cost estimate</div>
                  <div className="stat-value">${((currentSession.analytics.tokens.total / 1000) * 0.01).toFixed(2)}</div>
                </div>
              </div>
              <div className="token-breakdown">
                <div className="breakdown-label">token breakdown</div>
                <div className="breakdown-bar">
                  <div 
                    className="input-bar" 
                    style={{ width: `${(currentSession.analytics.tokens.input / currentSession.analytics.tokens.total) * 100}%` }}
                  />
                </div>
                <div className="breakdown-legend">
                  <span>input: {currentSession.analytics.tokens.input.toLocaleString()}</span>
                  <span>output: {currentSession.analytics.tokens.output.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};