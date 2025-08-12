import React, { useState, useRef, useEffect } from 'react';
import { 
  IconSend, 
  IconPlayerStop, 
  IconFolderOpen,
  IconTrash,
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
  IconChartBar,
  IconCoin,
  IconChevronUp,
  IconChevronDown,
  IconArrowUp,
  IconArrowDown,
  IconBrain,
  IconChartDots
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
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showRecentModal, setShowRecentModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchIndex, setSearchIndex] = useState(0);
  const [searchMatches, setSearchMatches] = useState<number[]>([]);
  const [messageHistory, setMessageHistory] = useState<{ [sessionId: string]: string[] }>({});
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [thinkingStartTime, setThinkingStartTime] = useState<number | null>(null);
  const [thinkingElapsed, setThinkingElapsed] = useState(0);
  const [scrollPositions, setScrollPositions] = useState<{ [sessionId: string]: number }>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const previousSessionIdRef = useRef<string | null>(null);
  const isTabSwitchingRef = useRef(false);
  
  const {
    sessions,
    currentSessionId,
    persistedSessionId,
    createSession,
    sendMessage,
    resumeSession,
    interruptSession,
    clearContext,
    selectedModel,
    setSelectedModel,
    toggleModel,
    loadPersistedSession,
    updateSessionDraft
  } = useClaudeCodeStore();

  const currentSession = sessions.find(s => s.id === currentSessionId);

  // NO AUTO-CREATION and NO AUTO-RESUME
  // Sessions are ephemeral - they don't survive app restarts
  // User must manually create sessions with the + button

  // NO auto-selection - user must explicitly choose or create a session

  // Save scroll position when scrolling
  useEffect(() => {
    const handleScroll = () => {
      if (chatContainerRef.current && currentSessionId) {
        setScrollPositions(prev => ({
          ...prev,
          [currentSessionId]: chatContainerRef.current!.scrollTop
        }));
      }
    };

    const container = chatContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [currentSessionId]);

  // Restore scroll position when switching tabs
  useEffect(() => {
    if (currentSessionId) {
      if (currentSessionId !== previousSessionIdRef.current) {
        // Mark that we're switching tabs
        isTabSwitchingRef.current = true;
        
        // Tab switched - restore position immediately without animation
        // Use requestAnimationFrame to ensure DOM is ready
        requestAnimationFrame(() => {
          if (chatContainerRef.current) {
            const savedPosition = scrollPositions[currentSessionId];
            if (savedPosition !== undefined) {
              // Restore saved position instantly
              chatContainerRef.current.scrollTop = savedPosition;
            } else {
              // New session, check if has messages
              if (currentSession?.messages?.length > 0) {
                // Has messages, scroll to bottom instantly
                chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
              }
              // No messages, stay at top
            }
          }
          
          // Clear the tab switching flag after a short delay
          setTimeout(() => {
            isTabSwitchingRef.current = false;
          }, 100);
        });
      }
      // Always update the previous session ID ref
      previousSessionIdRef.current = currentSessionId;
    }
  }, [currentSessionId, scrollPositions, currentSession?.messages?.length]);

  // SIMPLE AUTO-SCROLL - always scroll to bottom when messages change
  useEffect(() => {
    if (!chatContainerRef.current || !currentSession) return;
    
    // Skip auto-scroll if we're switching tabs
    if (isTabSwitchingRef.current) return;
    
    const container = chatContainerRef.current;
    // Check if near bottom (within 200px)
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 200;
    
    // Scroll if near bottom OR if streaming
    if (isNearBottom || currentSession?.streaming) {
      // Small delay to ensure DOM is updated
      setTimeout(() => {
        if (!isTabSwitchingRef.current && chatContainerRef.current) {
          chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
      }, 10);
    }
  }, [currentSession?.messages, currentSession?.streaming]);
  
  // Force scroll to bottom when user sends a message
  useEffect(() => {
    if (!currentSession) return;
    
    // Skip if we're switching tabs
    if (isTabSwitchingRef.current) return;
    
    const lastMessage = currentSession.messages[currentSession.messages.length - 1];
    
    // If the last message is from the user, force scroll to bottom
    if (lastMessage?.type === 'user') {
      setTimeout(() => {
        if (!isTabSwitchingRef.current && chatContainerRef.current) {
          chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
      }, 50);
    }
  }, [currentSession?.messages?.length]);

  // Track thinking time
  useEffect(() => {
    if (currentSession?.streaming) {
      // Start timing when streaming begins
      if (!thinkingStartTime) {
        setThinkingStartTime(Date.now());
        setThinkingElapsed(0);
      }
    } else {
      // Reset when streaming stops
      setThinkingStartTime(null);
      setThinkingElapsed(0);
    }
  }, [currentSession?.streaming, thinkingStartTime]);

  // Update elapsed time every 100ms for smooth display
  useEffect(() => {
    if (currentSession?.streaming && thinkingStartTime) {
      const interval = setInterval(() => {
        setThinkingElapsed(Math.floor((Date.now() - thinkingStartTime) / 1000));
      }, 100);
      return () => clearInterval(interval);
    }
  }, [currentSession?.streaming, thinkingStartTime]);

  // Handle Ctrl+F for search, Ctrl+L for clear, and ? for help
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input fields
      const target = e.target as HTMLElement;
      const isInputField = target.tagName === 'INPUT' || 
                           target.tagName === 'TEXTAREA' || 
                           target.contentEditable === 'true';
      
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setSearchVisible(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
        e.preventDefault();
        if (currentSessionId) {
          clearContext(currentSessionId);
          // Clear scroll position for this session
          setScrollPositions(prev => {
            const newPositions = { ...prev };
            delete newPositions[currentSessionId];
            return newPositions;
          });
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
        e.preventDefault();
        setShowRecentModal(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        // Duplicate current tab with same directory
        if (currentSession?.workingDirectory) {
          const projectName = currentSession.workingDirectory.split(/[/\\]/).pop() || 'project';
          createSession(projectName, currentSession.workingDirectory);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === '.') {
        e.preventDefault();
        // Show stats modal
        const hasActivity = currentSession && currentSession.messages.some(m => 
          m.type === 'user' || m.type === 'assistant' || m.type === 'result'
        );
        if (hasActivity) {
          setShowStatsModal(true);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        // Toggle model between opus and sonnet
        toggleModel();
      } else if (e.key === 'Escape') {
        // First check if we're streaming and should stop
        if (currentSession?.streaming) {
          e.preventDefault();
          console.log('[ClaudeChat] ESC pressed - interrupting stream');
          interruptSession();
        } else if (showRecentModal) {
          setShowRecentModal(false);
        } else if (searchVisible) {
          setSearchVisible(false);
          setSearchQuery('');
          setSearchMatches([]);
          setSearchIndex(0);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchVisible, currentSessionId, clearContext, showRecentModal, currentSession, setShowStatsModal, interruptSession, setScrollPositions]);


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
      element?.scrollIntoView({ behavior: 'instant', block: 'center' });
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
    console.log('[ClaudeChat] Session changed:', { 
      sessionId: currentSessionId,
      hasDraft: !!(currentSession?.draftInput),
      workingDir: currentSession?.workingDirectory 
    });
    
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
    console.log('[ClaudeChat] handleSend called', { 
      input: input.slice(0, 50), 
      attachments: attachments.length,
      streaming: currentSession?.streaming,
      sessionId: currentSessionId 
    });
    
    // Allow sending messages during streaming (they'll be queued)
    if (!input.trim() && attachments.length === 0) return;
    
    // Check for slash commands and special inputs
    const trimmedInput = input.trim();
    if (trimmedInput === '/clear') {
      console.log('[ClaudeChat] Clearing context for session:', currentSessionId);
      if (currentSessionId) {
        clearContext(currentSessionId);
        setInput('');
        // Reset textarea height when clearing context
        if (inputRef.current) {
          inputRef.current.style.height = '54px'; // Reset to 3 lines
          inputRef.current.style.overflow = 'hidden';
        }
        // Clear scroll position for this session
        setScrollPositions(prev => {
          const newPositions = { ...prev };
          delete newPositions[currentSessionId];
          return newPositions;
        });
        return;
      }
    }
    
    try {
      // Don't create a new session here - sessions should only be created via the new tab button
      if (!currentSessionId) {
        console.error('[ClaudeChat] No active session - please create a new session first');
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
      
      // Add to message history for this session (only text, not attachments)
      if (input.trim() && currentSessionId) {
        setMessageHistory(prev => ({
          ...prev,
          [currentSessionId]: [...(prev[currentSessionId] || []).filter(m => m !== input), input].slice(-50) // Keep last 50 messages
        }));
        setHistoryIndex(-1); // Reset history navigation
      }
      
      console.log('[ClaudeChat] Sending message:', { 
        sessionId: currentSessionId,
        messageLength: messageContent.length,
        hasAttachments: attachments.length > 0
      });
      
      setInput('');
      setAttachments([]);
      // Reset textarea height to minimum after sending
      if (inputRef.current) {
        inputRef.current.style.height = '54px'; // Reset to 3 lines
        inputRef.current.style.overflow = 'hidden';
      }
      // Clear drafts after sending
      updateSessionDraft(currentSessionId, '', []);
      await sendMessage(messageContent);
      
      // Force scroll to bottom after sending message
      setTimeout(() => {
        if (chatContainerRef.current) {
          chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
      }, 50);
    } catch (error) {
      console.error('[ClaudeChat] Failed to send message:', error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget;
    const cursorPos = textarea.selectionStart;
    
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
      // Delete everything before cursor (like terminal)
      e.preventDefault();
      const afterCursor = input.substring(cursorPos);
      setInput(afterCursor);
      // Set cursor to beginning after React re-renders
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.selectionStart = inputRef.current.selectionEnd = 0;
        }
      }, 0);
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      // Delete everything after cursor (like terminal)
      e.preventDefault();
      const beforeCursor = input.substring(0, cursorPos);
      setInput(beforeCursor);
    } else if (e.key === 'ArrowUp') {
      // Only navigate history if cursor is at the beginning of the text
      if (cursorPos === 0 && textarea.selectionEnd === 0 && currentSessionId) {
        e.preventDefault();
        
        const sessionHistory = messageHistory[currentSessionId] || [];
        
        // Navigate up in history
        if (historyIndex < sessionHistory.length - 1) {
          const newIndex = historyIndex + 1;
          setHistoryIndex(newIndex);
          setInput(sessionHistory[sessionHistory.length - 1 - newIndex]);
        }
      }
    } else if (e.key === 'ArrowDown') {
      // Only navigate history if we're in history navigation mode
      if (historyIndex >= 0 && currentSessionId) {
        const lines = input.split('\n');
        const currentLine = input.substring(0, cursorPos).split('\n').length - 1;
        const isOnLastLine = currentLine === lines.length - 1;
        
        // Only navigate if cursor is on the last line
        if (isOnLastLine) {
          e.preventDefault();
          
          const sessionHistory = messageHistory[currentSessionId] || [];
          
          if (historyIndex > 0) {
            const newIndex = historyIndex - 1;
            setHistoryIndex(newIndex);
            setInput(sessionHistory[sessionHistory.length - 1 - newIndex]);
          } else if (historyIndex === 0) {
            // Return to the original input
            setHistoryIndex(-1);
            setInput('');
          }
        }
      }
    }
  };

  // Format bytes helper
  const formatBytes = (b: number) => {
    if (b < 1024) return `${b} bytes`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)}kb`;
    return `${(b / (1024 * 1024)).toFixed(1)}mb`;
  };

  // Handle paste event for images
  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const text = e.clipboardData.getData('text/plain');
    
    // Handle text paste - only create attachment if it's substantial text (5+ lines AND 512+ bytes)
    const lines = text.split('\n').length;
    const bytes = new Blob([text]).size;
    if (text && lines >= 5 && bytes > 512 && !text.startsWith('http')) {
      e.preventDefault();
      const newAttachment: Attachment = {
        id: Math.random().toString(36).substr(2, 9),
        type: 'text',
        name: `text_${Date.now()}.txt`,
        content: text,
        preview: `${lines} lines, ${formatBytes(bytes)}`
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
          const lines = text.split('\n').length;
          const bytes = file.size;
          const newAttachment: Attachment = {
            id: Math.random().toString(36).substr(2, 9),
            type: 'text',
            name: file.name,
            size: file.size,
            content: text,
            preview: `${lines} lines, ${formatBytes(bytes)}`
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
    
    // Simple auto-resize without jumps
    const textarea = e.target;
    const minHeight = 54; // 3 lines * 18px
    const maxHeight = 144; // 8 lines * 18px
    
    // Just use scrollHeight directly - it works fine when min-height is set in CSS
    const newHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);
    
    // Only update height if it actually changed
    const currentHeight = parseInt(textarea.style.height) || minHeight;
    if (newHeight !== currentHeight) {
      textarea.style.height = newHeight + 'px';
    }
    
    // Show scrollbar only when content exceeds max height
    textarea.style.overflow = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
  };







  if (!currentSession) {
    return <WelcomeScreen />;
  }

  return (
    <div 
      className="chat-container"
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
              <IconChevronUp size={14} />
            </button>
            <button 
              className="search-btn" 
              onClick={() => navigateSearch('next')}
              disabled={searchMatches.length === 0}
            >
              <IconChevronDown size={14} />
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
              <IconX size={14} />
            </button>
          </div>
        </div>
      )}
      <div className="chat-messages" ref={chatContainerRef}>
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
          
          // Find the index of the last user or assistant message for restore button logic
          let lastRestorableIndex = -1;
          for (let i = filteredMessages.length - 1; i >= 0; i--) {
            if (filteredMessages[i].type === 'user' || filteredMessages[i].type === 'assistant') {
              lastRestorableIndex = i;
              break;
            }
          }
          
          return filteredMessages.map((message, idx) => {
            const isHighlighted = searchMatches.includes(idx) && searchMatches[searchIndex] === idx;
            // Only mark as last if it's the last user/assistant message
            const isLastRestorable = idx === lastRestorableIndex;
            
            return (
              <div 
                key={`${message.id || message.type}-${idx}`}
                data-message-index={idx}
                className={isHighlighted ? 'message-highlighted' : ''}
              >
                <MessageRenderer 
                  message={message} 
                  index={idx}
                  isLast={isLastRestorable}
                  searchQuery={searchQuery}
                  isCurrentMatch={searchMatches[searchIndex] === idx}
                />
              </div>
            );
          });
        })()}
        {/* ALWAYS show thinking indicator when streaming */}
        {currentSession?.streaming && (
          <div className="message assistant">
            <div className="message-content">
              <div className="thinking-indicator-bottom">
                <IconLoader2 size={14} stroke={1.5} className="spinning-loader" />
                <span className="thinking-text-wrapper">
                  <span className="thinking-text">thinking<span className="thinking-dots"></span></span>
                  {thinkingElapsed > 0 && (
                    <span className="thinking-timer">{thinkingElapsed}s</span>
                  )}
                </span>
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
            {attachments.map((att, index) => (
              <div key={att.id} className="attachment-item">
                <span className="attachment-text">
                  {att.type === 'image' ? `image: ${formatBytes(att.size || 0)}` : `text: ${att.preview}`}
                </span>
                <button 
                  className="attachment-remove" 
                  onClick={() => removeAttachment(att.id)}
                  title="remove"
                >
                  <IconX size={10} stroke={2} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="input-row">
          <textarea
            ref={inputRef}
            className="chat-input"
            placeholder={currentSession?.streaming ? "append message..." : "code prompt..."}
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            disabled={false}
            style={{ height: '54px' }}
          />
          {currentSession?.streaming && (
            <button 
              className="stop-streaming-btn"
              onClick={() => interruptSession()}
              title="stop streaming (esc)"
            >
              <IconPlayerStop size={16} stroke={1.5} />
            </button>
          )}
        </div>
        
        {/* Context info bar */}
        <div className="context-bar">
          <ModelSelector value={selectedModel} onChange={setSelectedModel} />
          <div className="context-info">
            {(() => {
              // Use the session's analytics tokens instead of recalculating from messages
              const tokens = currentSession.analytics?.tokens?.total || 0;
              
              // Debug log to see actual token values
              console.log('[TOKEN INDICATOR] Current tokens:', tokens, 'Analytics:', currentSession.analytics?.tokens);
              
              // Opus 4.1 has 200k context window
              // Sonnet 4.0 has 200k context window 
              // Both models have the same 200k context window
              const contextWindowTokens = 200000;
              
              // Calculate percentage but show warning if over 100%
              const rawPercentage = (tokens / contextWindowTokens * 100);
              const percentageNum = Math.min(100, rawPercentage);
              // Format: show decimal only if not a whole number
              const percentage = percentageNum % 1 === 0 ? percentageNum.toFixed(0) : percentageNum.toFixed(1);
              
              // Log warning if tokens exceed context window
              if (rawPercentage > 100) {
                console.warn(`[TOKEN WARNING] Tokens (${tokens}) exceed context window (${contextWindowTokens}) - ${rawPercentage}%`);
              }
              // Color classes: grey until 70%, then yellow/orange/red
              const usageClass = percentageNum >= 90 ? 'high' : 
                                percentageNum >= 80 ? 'orange' : 
                                percentageNum >= 70 ? 'medium' : 'low';
              
              const hasActivity = currentSession.messages.some(m => 
                m.type === 'assistant' || m.type === 'tool_use' || m.type === 'tool_result'
              );
              
              return (
                <>
                  <button 
                    className="btn-clear-context" 
                    onClick={() => {
                      // Clear messages but keep session
                      if (currentSessionId && hasActivity) {
                        clearContext(currentSessionId);
                        // Clear scroll position for this session
                        setScrollPositions(prev => {
                          const newPositions = { ...prev };
                          delete newPositions[currentSessionId];
                          return newPositions;
                        });
                      }
                    }}
                    disabled={!hasActivity}
                    title={hasActivity ? "clear context (ctrl+l)" : "no messages to clear"}
                    style={{
                      opacity: hasActivity ? 1 : 0.3,
                      cursor: 'default'
                    }}
                  >
                    clear
                  </button>
                  <button 
                    className={`btn-stats ${!hasActivity ? 'disabled' : ''} ${usageClass}`} 
                    onClick={() => hasActivity && setShowStatsModal(true)}
                    disabled={!hasActivity}
                    title={hasActivity ? `${tokens.toLocaleString()} / ${contextWindowTokens.toLocaleString()} tokens - click for details (ctrl+.)` : "no activity yet"}
                  >
                    {percentage}% used
                  </button>
                </>
              );
            })()}
          </div>
        </div>
      </div>
      
      
      {/* Recent Projects Modal */}
      {showRecentModal && (
        <div 
          className="recent-modal-overlay"
          onClick={() => setShowRecentModal(false)}
        >
          <div 
            className="recent-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <span className="modal-title">recent projects</span>
              <button 
                className="clear-all-icon"
                onClick={() => {
                  if (confirm('clear all recent projects?')) {
                    localStorage.removeItem('yurucode-recent-projects');
                    setShowRecentModal(false);
                  }
                }}
                title="clear all"
              >
                <IconTrash size={14} />
              </button>
            </div>
            
            <div className="modal-content">
              {(() => {
                const stored = localStorage.getItem('yurucode-recent-projects');
                if (!stored) {
                  return <div className="no-recent">no recent projects</div>;
                }
                try {
                  const projects = JSON.parse(stored).map((p: any) => ({
                    ...p,
                    lastOpened: new Date(p.lastOpened)
                  }));
                  
                  if (projects.length === 0) {
                    return <div className="no-recent">no recent projects</div>;
                  }
                  
                  return projects.slice(0, 10).map((project: any) => (
                    <div key={project.path} className="recent-item-container">
                      <button
                        className="recent-item"
                        onClick={() => {
                          createSession(project.name, project.path);
                          setShowRecentModal(false);
                        }}
                      >
                        <IconFolderOpen size={14} />
                        <div className="recent-item-info">
                          <div className="recent-item-name">{project.name}</div>
                          <div className="recent-item-path">{project.path}</div>
                        </div>
                      </button>
                      <button
                        className="recent-item-remove"
                        onClick={(e) => {
                          e.stopPropagation();
                          const updated = projects.filter((p: any) => p.path !== project.path);
                          localStorage.setItem('yurucode-recent-projects', JSON.stringify(updated));
                          if (updated.length === 0) {
                            setShowRecentModal(false);
                          }
                          // Force re-render by closing and reopening
                          setShowRecentModal(false);
                          setTimeout(() => setShowRecentModal(true), 0);
                        }}
                        title="remove from recent"
                      >
                        <IconX size={12} />
                      </button>
                    </div>
                  ));
                } catch (e) {
                  return <div className="no-recent">no recent projects</div>;
                }
              })()}
            </div>
          </div>
        </div>
      )}

      
      {showStatsModal && currentSession?.analytics && (
        <div className="stats-modal-overlay" onClick={() => setShowStatsModal(false)}>
          <div className="stats-modal" onClick={(e) => e.stopPropagation()}>
            <div className="stats-header">
              <h3>
                <IconChartDots size={16} stroke={1.5} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                session analytics
              </h3>
              <button className="stats-close" onClick={() => setShowStatsModal(false)}>
                <IconX size={16} />
              </button>
            </div>
            <div className="stats-content">
              <div className="stats-column">
                <div className="stats-section">
                  <h4>usage & cost</h4>
                  <div className="stat-row">
                    <div className="stat-keys">
                      <IconSend size={14} />
                      <span className="stat-name">messages</span>
                    </div>
                    <span className="stat-dots"></span>
                    <span className="stat-desc">{currentSession.analytics.totalMessages}</span>
                  </div>
                  <div className="stat-row">
                    <div className="stat-keys">
                      <IconTool size={14} />
                      <span className="stat-name">tool uses</span>
                    </div>
                    <span className="stat-dots"></span>
                    <span className="stat-desc">{currentSession.analytics.toolUses}</span>
                  </div>
                  <div className="stat-row">
                    <div className="stat-keys">
                      <IconChartBar size={14} />
                      <span className="stat-name">total tokens</span>
                    </div>
                    <span className="stat-dots"></span>
                    <span className="stat-desc">{currentSession.analytics.tokens.total.toLocaleString()}</span>
                  </div>
                  <div className="stat-row">
                    <div className="stat-keys">
                      <IconCoin size={14} />
                      <span className="stat-name">cost</span>
                    </div>
                    <span className="stat-dots"></span>
                    <span className="stat-desc">
                      ${(() => {
                        // Use actual cost from Claude if available
                        if (currentSession.analytics.cost?.total) {
                          // Format cost to 2 decimal places for display
                          return currentSession.analytics.cost.total.toFixed(2);
                        }
                        
                        // Otherwise calculate based on token usage
                        const opusInput = currentSession.analytics.tokens.byModel?.opus?.input || 0;
                        const opusOutput = currentSession.analytics.tokens.byModel?.opus?.output || 0;
                        const sonnetInput = currentSession.analytics.tokens.byModel?.sonnet?.input || 0;
                        const sonnetOutput = currentSession.analytics.tokens.byModel?.sonnet?.output || 0;
                        
                        const opusCost = (opusInput / 1000000) * 3.00 + (opusOutput / 1000000) * 15.00;
                        const sonnetCost = (sonnetInput / 1000000) * 2.50 + (sonnetOutput / 1000000) * 12.50;
                        
                        return (opusCost + sonnetCost).toFixed(2);
                      })()}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="stats-column">
                <div className="stats-section">
                  <h4>token breakdown</h4>
                  <div className="stat-row">
                    <div className="stat-keys">
                      <IconArrowUp size={14} />
                      <span className="stat-name">input</span>
                    </div>
                    <span className="stat-dots"></span>
                    <span className="stat-desc">
                      {currentSession.analytics.tokens.input.toLocaleString()} ({currentSession.analytics.tokens.total > 0 ? Math.round((currentSession.analytics.tokens.input / currentSession.analytics.tokens.total) * 100) : 0}%)
                    </span>
                  </div>
                  <div className="stat-row">
                    <div className="stat-keys">
                      <IconArrowDown size={14} />
                      <span className="stat-name">output</span>
                    </div>
                    <span className="stat-dots"></span>
                    <span className="stat-desc">
                      {currentSession.analytics.tokens.output.toLocaleString()} ({currentSession.analytics.tokens.total > 0 ? Math.round((currentSession.analytics.tokens.output / currentSession.analytics.tokens.total) * 100) : 0}%)
                    </span>
                  </div>
                  <div className="breakdown-bar">
                    <div 
                      className="input-bar" 
                      style={{ width: `${currentSession.analytics.tokens.total > 0 ? (currentSession.analytics.tokens.input / currentSession.analytics.tokens.total) * 100 : 0}%` }}
                    />
                  </div>
                  <div className="stat-row" style={{ marginTop: '5px' }}>
                    <div className="stat-keys">
                      <IconBrain size={14} />
                      <span className="stat-name">opus %</span>
                    </div>
                    <span className="stat-dots"></span>
                    <span className="stat-desc">
                      {(() => {
                        const opusTokens = currentSession.analytics.tokens.byModel?.opus?.total || 0;
                        const totalTokens = currentSession.analytics.tokens.total || 1;
                        return `${Math.round((opusTokens / totalTokens) * 100)}%`;
                      })()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};