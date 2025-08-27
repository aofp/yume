import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  IconMessageCircle,
  IconX,
  IconAlertTriangle,
  IconFileText,
  IconFile,
  IconChartBar,
  IconChartBubbleFilled,
  IconArtboardFilled,
  IconCoin,
  IconChevronUp,
  IconChevronDown,
  IconArrowUp,
  IconArrowDown,
  IconArrowsUpDown,
  IconBrain,
  IconChartDots,
  IconClock,
  IconMessage,
  IconDatabase,
  IconCirclePlus,
  IconMicrophone,
  IconMicrophoneOff
} from '@tabler/icons-react';
import { MessageRenderer } from './MessageRenderer';
import { useClaudeCodeStore } from '../../stores/claudeCodeStore';
import { ModelSelector } from '../ModelSelector/ModelSelector';
import { WelcomeScreen } from '../Welcome/WelcomeScreen';
import { MentionAutocomplete } from '../MentionAutocomplete/MentionAutocomplete';
import { CommandAutocomplete } from '../CommandAutocomplete/CommandAutocomplete';
import { LoadingIndicator } from '../LoadingIndicator/LoadingIndicator';
import { KeyboardShortcuts } from '../KeyboardShortcuts/KeyboardShortcuts';
import { Watermark } from '../Watermark/Watermark';
import './ClaudeChat.css';

// Helper function to format tool displays
const getToolDisplay = (name: string, input: any) => {
  const displays: Record<string, (input: any) => { icon: React.ReactNode; name: string; detail: string }> = {
    'Read': (i) => ({ 
      icon: <IconBook size={14} stroke={1.5} />, 
      name: 'reading', 
      detail: i?.file_path?.replace(/^\/mnt\/c\/Users\/[^\/]+\/Desktop\/yurucode\//, '') || 'file' 
    }),
    'Write': (i) => ({ 
      icon: <IconPencil size={14} stroke={1.5} />, 
      name: 'writing', 
      detail: i?.file_path?.replace(/^\/mnt\/c\/Users\/[^\/]+\/Desktop\/yurucode\//, '') || 'file' 
    }),
    'Edit': (i) => ({ 
      icon: <IconScissors size={14} stroke={1.5} />, 
      name: 'editing', 
      detail: `${i?.file_path?.replace(/^\/mnt\/c\/Users\/[^\/]+\/Desktop\/yurucode\//, '') || 'file'}${i?.old_string ? ` (${i.old_string.substring(0, 20)}...)` : ''}` 
    }),
    'MultiEdit': (i) => ({ 
      icon: <IconScissors size={14} stroke={1.5} />, 
      name: 'multi-edit', 
      detail: `${i?.file_path?.replace(/^\/mnt\/c\/Users\/[^\/]+\/Desktop\/yurucode\//, '') || 'file'} (${i?.edits?.length || 0} changes)` 
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
      detail: `"${i?.pattern || ''}" in ${i?.path?.replace(/^\/mnt\/c\/Users\/[^\/]+\/Desktop\/yurucode\//, '') || '.'}` 
    }),
    'Glob': (i) => ({ 
      icon: <IconFolder size={14} stroke={1.5} />, 
      name: 'finding', 
      detail: i?.pattern || 'files' 
    }),
    'LS': (i) => ({ 
      icon: <IconFolderOpen2 size={14} stroke={1.5} />, 
      name: 'listing', 
      detail: i?.path?.replace(/^\/mnt\/c\/Users\/[^\/]+\/Desktop\/yurucode\//, '') || 'directory' 
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
  const [isTextareaFocused, setIsTextareaFocused] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [isDictating, setIsDictating] = useState(false);
  const recognitionRef = useRef<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchIndex, setSearchIndex] = useState(0);
  const [searchMatches, setSearchMatches] = useState<number[]>([]);
  const [messageHistory, setMessageHistory] = useState<{ [sessionId: string]: string[] }>({});
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [thinkingStartTimes, setThinkingStartTimes] = useState<{ [sessionId: string]: number }>({});
  const [thinkingElapsed, setThinkingElapsed] = useState<{ [sessionId: string]: number }>({});
  const [scrollPositions, setScrollPositions] = useState<{ [sessionId: string]: number }>({});
  const [inputContainerHeight, setInputContainerHeight] = useState(120);
  const [viewportHeight, setViewportHeight] = useState(window.innerHeight);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [mentionTrigger, setMentionTrigger] = useState<string | null>(null);
  const [mentionCursorPos, setMentionCursorPos] = useState(0);
  const [commandTrigger, setCommandTrigger] = useState<string | null>(null);
  const [commandCursorPos, setCommandCursorPos] = useState(0);
  const [bashCommandMode, setBashCommandMode] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState<{ [sessionId: string]: boolean }>({});
  const [pendingFollowupMessage, setPendingFollowupMessage] = useState<string | null>(null);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [bashStartTimes, setBashStartTimes] = useState<{ [sessionId: string]: number }>({});
  const [bashElapsedTimes, setBashElapsedTimes] = useState<{ [sessionId: string]: number }>({});
  const [bashDotCounts, setBashDotCounts] = useState<{ [sessionId: string]: number }>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const inputContainerRef = useRef<HTMLDivElement>(null);
  const previousSessionIdRef = useRef<string | null>(null);
  const isTabSwitchingRef = useRef(false);
  const streamingStartTimeRef = useRef<{ [sessionId: string]: number }>({});
  const pendingFollowupRef = useRef<{ sessionId: string; content: string; attachments: Attachment[]; timeoutId?: NodeJS.Timeout } | null>(null);
  
  const {
    sessions,
    currentSessionId,
    persistedSessionId,
    createSession,
    deleteSession,
    sendMessage,
    resumeSession,
    interruptSession,
    clearContext,
    selectedModel,
    setSelectedModel,
    toggleModel,
    loadPersistedSession,
    updateSessionDraft,
    addMessageToSession
  } = useClaudeCodeStore();

  const currentSession = sessions.find(s => s.id === currentSessionId);
  
  // DEBUG: Log current session messages length
  React.useEffect(() => {
    console.log(`[DEBUG] Current session ${currentSessionId} has ${currentSession?.messages?.length || 0} messages`);
  }, [currentSessionId, currentSession?.messages?.length]);

  // NO AUTO-CREATION and NO AUTO-RESUME
  // Sessions are ephemeral - they don't survive app restarts
  // User must manually create sessions with the + button

  // NO auto-selection - user must explicitly choose or create a session
  
  // Removed bash warmup - it was causing the focus issue it was trying to prevent
  
  // Bash warmup removed - it was causing focus issues
  
  // Track viewport and input container changes for zoom
  useEffect(() => {
    const handleResize = () => {
      setViewportHeight(window.innerHeight);
      
      // Get the current zoom level from body style
      const bodyZoom = document.body.style.zoom;
      const currentZoom = bodyZoom ? parseFloat(bodyZoom) : 1;
      setZoomLevel(currentZoom);
      
      if (inputContainerRef.current) {
        // Get actual rendered height
        const rect = inputContainerRef.current.getBoundingClientRect();
        setInputContainerHeight(rect.height);
      }
    };
    
    window.addEventListener('resize', handleResize);
    handleResize(); // Initial measurement
    
    // Watch for zoom changes via MutationObserver
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
          const bodyZoom = document.body.style.zoom;
          const currentZoom = bodyZoom ? parseFloat(bodyZoom) : 1;
          setZoomLevel(currentZoom);
          handleResize();
        }
      });
    });
    
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['style']
    });
    
    // Use ResizeObserver for input container
    const resizeObserver = new ResizeObserver(() => {
      if (inputContainerRef.current) {
        const height = inputContainerRef.current.getBoundingClientRect().height;
        setInputContainerHeight(height);
      }
    });
    
    if (inputContainerRef.current) {
      resizeObserver.observe(inputContainerRef.current);
    }
    
    return () => {
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
      resizeObserver.disconnect();
    };
  }, []);

  // Track scroll position and whether we're at bottom
  useEffect(() => {
    const handleScroll = () => {
      if (chatContainerRef.current && currentSessionId) {
        const container = chatContainerRef.current;
        
        // More reliable bottom detection
        const scrollTop = container.scrollTop;
        const scrollHeight = container.scrollHeight;
        const clientHeight = container.clientHeight;
        const atBottom = scrollHeight - scrollTop - clientHeight < 1;
        
        // Update isAtBottom state for this session
        setIsAtBottom(prev => ({
          ...prev,
          [currentSessionId]: atBottom
        }));
        
        // Save scroll position
        if (atBottom) {
          setScrollPositions(prev => ({
            ...prev,
            [currentSessionId]: -1 // Special value meaning "stick to bottom"
          }));
        } else {
          setScrollPositions(prev => ({
            ...prev,
            [currentSessionId]: scrollTop
          }));
        }
      }
    };

    const container = chatContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll, { passive: true });
      // Initial check
      handleScroll();
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
              if (savedPosition === -1) {
                // Special value: user was at bottom, scroll to bottom
                chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
              } else {
                // Restore exact saved position
                chatContainerRef.current.scrollTop = savedPosition;
              }
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

  // AUTO-SCROLL - only scroll if user is at bottom
  useEffect(() => {
    if (!chatContainerRef.current || !currentSession || !currentSessionId) return;
    
    // Skip auto-scroll if we're switching tabs
    if (isTabSwitchingRef.current) return;
    
    // Check if we should auto-scroll (only if already at bottom)
    const shouldScroll = isAtBottom[currentSessionId] !== false; // Default to true for new sessions
    
    if (shouldScroll) {
      // Force scroll to bottom
      requestAnimationFrame(() => {
        if (chatContainerRef.current && !isTabSwitchingRef.current) {
          chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
      });
    }
  }, [currentSession?.messages, currentSession?.streaming, currentSessionId, isAtBottom]);
  
  // Force scroll to bottom when user sends a message
  useEffect(() => {
    if (!currentSession || !currentSessionId) return;
    
    // Skip if we're switching tabs
    if (isTabSwitchingRef.current) return;
    
    const lastMessage = currentSession.messages[currentSession.messages.length - 1];
    
    // If the last message is from the user, force scroll to bottom and set isAtBottom
    if (lastMessage?.type === 'user') {
      // Mark as at bottom
      setIsAtBottom(prev => ({
        ...prev,
        [currentSessionId]: true
      }));
      
      // Force scroll
      requestAnimationFrame(() => {
        if (chatContainerRef.current && !isTabSwitchingRef.current) {
          chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
      });
    }
  }, [currentSession?.messages?.length, currentSessionId]);

  // MutationObserver for more reliable autoscroll during streaming
  useEffect(() => {
    if (!chatContainerRef.current || !currentSessionId) return;
    
    const container = chatContainerRef.current;
    
    const observer = new MutationObserver(() => {
      // Skip if switching tabs
      if (isTabSwitchingRef.current) return;
      
      // Only scroll if we're at bottom
      if (isAtBottom[currentSessionId] !== false) {
        container.scrollTop = container.scrollHeight;
      }
    });
    
    observer.observe(container, {
      childList: true,
      subtree: true,
      characterData: true
    });
    
    return () => observer.disconnect();
  }, [currentSessionId, isAtBottom]);

  // Track thinking time per session and clean up streaming start times
  useEffect(() => {
    if (currentSession?.streaming && currentSessionId) {
      // Start timing when streaming begins
      if (!thinkingStartTimes[currentSessionId]) {
        setThinkingStartTimes(prev => ({
          ...prev,
          [currentSessionId]: Date.now()
        }));
        setThinkingElapsed(prev => ({
          ...prev,
          [currentSessionId]: 0
        }));
      }
    } else if (currentSessionId && !currentSession?.streaming) {
      // When streaming stops, keep the final elapsed time for display
      // Don't delete it immediately - let it persist
      setThinkingStartTimes(prev => {
        const newTimes = { ...prev };
        delete newTimes[currentSessionId];
        return newTimes;
      });
      
      // Clean up streaming start time after streaming ends
      // (but only after a delay to ensure followups work correctly)
      setTimeout(() => {
        // Only clean up if streaming is still false (not restarted)
        const session = sessions.find(s => s.id === currentSessionId);
        if (!session?.streaming && streamingStartTimeRef.current[currentSessionId]) {
          console.log('[ClaudeChat] Cleaning up streaming start time for session:', currentSessionId);
          delete streamingStartTimeRef.current[currentSessionId];
        }
      }, 10000); // Clean up after 10 seconds
    }
  }, [currentSession?.streaming, currentSessionId, sessions]);

  // Update elapsed time every 100ms for smooth display
  useEffect(() => {
    if (currentSession?.streaming && currentSessionId && thinkingStartTimes[currentSessionId]) {
      const interval = setInterval(() => {
        const startTime = thinkingStartTimes[currentSessionId];
        if (startTime) {
          setThinkingElapsed(prev => ({
            ...prev,
            [currentSessionId]: Math.floor((Date.now() - startTime) / 1000)
          }));
        }
      }, 100);
      return () => clearInterval(interval);
    }
  }, [currentSession?.streaming, currentSessionId, thinkingStartTimes[currentSessionId]]);

  // Handle bash running timer and dots animation per session
  useEffect(() => {
    if (!currentSessionId) return;
    
    if (currentSession?.runningBash || currentSession?.userBashRunning) {
      // Start timer for this session
      if (!bashStartTimes[currentSessionId]) {
        setBashStartTimes(prev => ({ ...prev, [currentSessionId]: Date.now() }));
        setBashDotCounts(prev => ({ ...prev, [currentSessionId]: 1 }));
      }
      
      // Update elapsed time every second for this session
      const timerInterval = setInterval(() => {
        const startTime = bashStartTimes[currentSessionId];
        if (startTime) {
          setBashElapsedTimes(prev => ({
            ...prev,
            [currentSessionId]: Math.floor((Date.now() - startTime) / 1000)
          }));
        }
      }, 1000);
      
      // Animate dots every 500ms for this session
      const dotsInterval = setInterval(() => {
        setBashDotCounts(prev => ({
          ...prev,
          [currentSessionId]: (prev[currentSessionId] || 1) >= 3 ? 1 : (prev[currentSessionId] || 1) + 1
        }));
      }, 500);
      
      return () => {
        clearInterval(timerInterval);
        clearInterval(dotsInterval);
      };
    } else {
      // Clean up when bash stops for this session
      setBashStartTimes(prev => {
        const newTimes = { ...prev };
        delete newTimes[currentSessionId];
        return newTimes;
      });
      setBashElapsedTimes(prev => {
        const newElapsed = { ...prev };
        delete newElapsed[currentSessionId];
        return newElapsed;
      });
      setBashDotCounts(prev => {
        const newCounts = { ...prev };
        delete newCounts[currentSessionId];
        return newCounts;
      });
    }
  }, [currentSession?.runningBash, currentSession?.userBashRunning, currentSessionId, bashStartTimes[currentSessionId]]);

  // Speech recognition for dictation
  const startDictation = useCallback(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      console.error('[Dictation] Speech recognition not supported');
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    
    recognition.onstart = () => {
      console.log('[Dictation] Started');
      setIsDictating(true);
    };
    
    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      let interimTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      
      if (finalTranscript) {
        // Append final transcript to input
        setInput(prev => {
          const newText = prev + (prev && !prev.endsWith(' ') ? ' ' : '') + finalTranscript;
          return newText;
        });
      }
    };
    
    recognition.onerror = (event: any) => {
      console.error('[Dictation] Error:', event.error);
      setIsDictating(false);
      recognitionRef.current = null;
    };
    
    recognition.onend = () => {
      console.log('[Dictation] Ended');
      setIsDictating(false);
      recognitionRef.current = null;
    };
    
    recognitionRef.current = recognition;
    recognition.start();
  }, []);
  
  const stopDictation = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
      setIsDictating(false);
    }
  }, []);
  
  const toggleDictation = useCallback(() => {
    if (isDictating) {
      stopDictation();
    } else {
      startDictation();
    }
  }, [isDictating, startDictation, stopDictation]);

  // Handle Ctrl+F for search, Ctrl+L for clear, and ? for help
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input fields (except for Ctrl+W and Ctrl+T)
      const target = e.target as HTMLElement;
      const isInputField = target.tagName === 'INPUT' || 
                           target.tagName === 'TEXTAREA' || 
                           target.contentEditable === 'true';
      
      // Ctrl+W handled in main.tsx to avoid duplicate handlers
      if ((e.ctrlKey || e.metaKey) && e.key === 't') {
        // Ctrl+T for new tab (works even in input fields)
        e.preventDefault();
        createSession();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setSearchVisible(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
        e.preventDefault();
        if (currentSessionId && !currentSession?.readOnly) {
          clearContext(currentSessionId);
          // Reset to stick to bottom for this session
          setIsAtBottom(prev => ({
            ...prev,
            [currentSessionId]: true
          }));
          setScrollPositions(prev => ({
            ...prev,
            [currentSessionId]: -1
          }));
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault();
        // Toggle dictation
        toggleDictation();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
        e.preventDefault();
        // Dispatch event to open recent modal in App
        const event = new CustomEvent('openRecentProjects');
        window.dispatchEvent(event);
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        // Create new session in same directory (fresh start, same working dir)
        if (currentSession?.workingDirectory) {
          createSession(undefined, currentSession.workingDirectory);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === '.') {
        e.preventDefault();
        // Toggle stats modal
        setShowStatsModal(prev => !prev);
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        // Toggle model between opus and sonnet
        toggleModel();
      } else if (e.key === 'Escape') {
        // First check if we're streaming or bash is running
        if (currentSession?.streaming || currentSession?.userBashRunning) {
          e.preventDefault();
          console.log('[ClaudeChat] ESC pressed - interrupting');
          
          // Kill bash process if running
          if (currentSession?.bashProcessId) {
            import('@tauri-apps/api/core').then(({ invoke }) => {
              invoke('kill_bash_process', { 
                processId: currentSession.bashProcessId 
              }).then(() => {
                // Add cancelled message with elapsed time
                const elapsedTime = bashElapsedTimes[currentSessionId || ''] || 0;
                const cancelMessage = {
                  id: `bash-cancel-${Date.now()}`,
                  type: 'system' as const,
                  subtype: 'interrupted' as const,
                  message: `bash command cancelled (${elapsedTime}s)`,
                  timestamp: Date.now()
                };
                
                if (currentSessionId) {
                  addMessageToSession(currentSessionId, cancelMessage);
                }
                
                // Clear flags immediately
                useClaudeCodeStore.setState(state => ({
                  sessions: state.sessions.map(s => 
                    s.id === currentSessionId 
                      ? { ...s, userBashRunning: false, bashProcessId: undefined } 
                      : s
                  )
                }));
              }).catch(error => {
                console.error('Failed to kill bash process:', error);
              });
            });
          } else {
            interruptSession();
          }
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
  }, [searchVisible, currentSessionId, clearContext, currentSession, setShowStatsModal, interruptSession, setIsAtBottom, setScrollPositions, deleteSession, createSession, sessions.length, toggleDictation]);



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

  // Track the previous session ID to know when we're actually switching sessions
  const prevSessionIdRef = useRef<string | null>(null);
  
  // Add effect to handle Ctrl+Arrow shortcuts at capture phase
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Only handle if textarea is focused
      if (document.activeElement !== inputRef.current) return;
      
      if (e.ctrlKey && !e.shiftKey && !e.altKey) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          e.stopPropagation();
          if (inputRef.current) {
            inputRef.current.selectionStart = 0;
            inputRef.current.selectionEnd = 0;
          }
          return false;
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          e.stopPropagation();
          if (inputRef.current) {
            const length = inputRef.current.value.length;
            inputRef.current.selectionStart = length;
            inputRef.current.selectionEnd = length;
          }
          return false;
        }
      }
    };
    
    // Use capture phase to intercept before browser default
    document.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown, true);
  }, []);
  
  // Stop dictation when component unmounts or session changes
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    };
  }, [currentSessionId]);
  
  // Clean up pending followup if session changes
  useEffect(() => {
    if (pendingFollowupRef.current && pendingFollowupRef.current.sessionId !== currentSessionId) {
      console.log('[ClaudeChat] Cancelling pending followup due to session change');
      if (pendingFollowupRef.current.timeoutId) {
        clearTimeout(pendingFollowupRef.current.timeoutId);
      }
      pendingFollowupRef.current = null;
      setPendingFollowupMessage(null);
    }
  }, [currentSessionId]);

  // Cancel pending followup countdown when streaming ends or messages are received
  useEffect(() => {
    if (pendingFollowupRef.current && pendingFollowupRef.current.sessionId === currentSessionId) {
      const session = sessions.find(s => s.id === currentSessionId);
      
      // Check if streaming has ended or if we have received messages/results
      const hasAssistantResponse = session?.messages?.some(m => m.type === 'assistant') || false;
      const isStreamingEnded = !session?.streaming;
      const hasRecentResult = session?.messages?.some(m => 
        m.type === 'result' && 
        Date.now() - (m.timestamp || 0) < 5000 // Result received within last 5 seconds
      ) || false;
      
      if (isStreamingEnded || hasAssistantResponse || hasRecentResult) {
        console.log('[ClaudeChat] Streaming ended or messages received - cancelling waiting countdown and sending immediately');
        console.log(`[ClaudeChat] Debug: isStreamingEnded=${isStreamingEnded}, hasAssistantResponse=${hasAssistantResponse}, hasRecentResult=${hasRecentResult}`);
        
        // Cancel the timeout
        if (pendingFollowupRef.current.timeoutId) {
          clearTimeout(pendingFollowupRef.current.timeoutId);
        }
        
        // Send the message immediately
        const pendingMessage = pendingFollowupRef.current;
        pendingFollowupRef.current = null;
        setPendingFollowupMessage(null);
        
        // Send the delayed message now
        handleDelayedSend(
          pendingMessage.content, 
          pendingMessage.attachments, 
          pendingMessage.sessionId
        ).catch(error => {
          console.error('[ClaudeChat] Failed to send message immediately after streaming ended:', error);
        });
      }
    }
  }, [currentSessionId, currentSession?.streaming, currentSession?.messages?.length, sessions]);
  
  useEffect(() => {
    // Only load draft when actually switching to a different session
    // Don't reload if it's the same session (prevents losing typed text)
    if (prevSessionIdRef.current !== currentSessionId) {
      console.log('[ClaudeChat] Session changed:', { 
        from: prevSessionIdRef.current,
        to: currentSessionId,
        hasDraft: !!(currentSession?.draftInput),
        workingDir: currentSession?.workingDirectory 
      });
      
      prevSessionIdRef.current = currentSessionId;
      inputRef.current?.focus();
      
      if (currentSession) {
        setInput(currentSession.draftInput || '');
        setAttachments(currentSession.draftAttachments || []);
      } else {
        setInput('');
        setAttachments([]);
      }
    }
  }, [currentSessionId, currentSession?.draftInput, currentSession?.draftAttachments]); // Include draft values to ensure proper loading

  // Save drafts when input or attachments change
  useEffect(() => {
    if (currentSessionId && prevSessionIdRef.current === currentSessionId) {
      // Only save if we're still on the same session (not switching)
      const timeoutId = setTimeout(() => {
        updateSessionDraft(currentSessionId, input, attachments);
      }, 300); // Reduced debounce for faster saving
      return () => clearTimeout(timeoutId);
    }
  }, [input, attachments, currentSessionId, updateSessionDraft]);

  // Set initial textarea height to prevent jump
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = '44px';
    }
  }, [currentSessionId]);

  // Helper function to handle delayed sends
  const handleDelayedSend = async (content: string, attachments: Attachment[], sessionId: string) => {
    try {
      // Check if session is read-only before sending
      const targetSession = sessions.find(s => s.id === sessionId);
      if (targetSession?.readOnly) {
        console.log('[ClaudeChat] Cannot send delayed message - session is read-only');
        setPendingFollowupMessage(null);
        return;
      }
      
      // Build message content with attachments
      let messageContent = content;
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
        if (content.trim()) {
          contentBlocks.push({ type: 'text', text: content });
        }
        
        messageContent = JSON.stringify(contentBlocks);
      }
      
      // Clear drafts after sending
      updateSessionDraft(sessionId, '', []);
      
      // Track when streaming starts for this session
      // Don't clear if already streaming - preserve the tracking
      const session = sessions.find(s => s.id === sessionId);
      const isFirstMessage = !session?.messages?.some(m => m.type === 'user');
      if ((isFirstMessage || !streamingStartTimeRef.current[sessionId]) && !session?.streaming) {
        streamingStartTimeRef.current[sessionId] = Date.now();
        console.log('[ClaudeChat] Recording streaming start time for delayed send (first message):', sessionId);
      }
      
      await sendMessage(messageContent, false);
      
      // Clear pending message on success
      setPendingFollowupMessage(null);
      
      // Mark as at bottom and force scroll after sending message
      setIsAtBottom(prev => ({
        ...prev,
        [sessionId]: true
      }));
      
      // Force scroll to bottom
      requestAnimationFrame(() => {
        if (chatContainerRef.current) {
          chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
      });
    } catch (error) {
      console.error('[ClaudeChat] Failed to send delayed message:', error);
      setPendingFollowupMessage(null);
      
      // Restore the input on error
      setInput(content);
      setAttachments(attachments);
    }
  };

  const handleSend = async () => {
    console.log('[ClaudeChat] handleSend called', { 
      input: input.slice(0, 50), 
      attachments: attachments.length,
      streaming: currentSession?.streaming,
      sessionId: currentSessionId,
      bashCommandMode,
      streamingStartTime: streamingStartTimeRef.current[currentSessionId || ''],
      readOnly: currentSession?.readOnly
    });
    
    // Prevent sending messages if session is read-only
    if (currentSession?.readOnly) {
      console.log('[ClaudeChat] Cannot send message - session is read-only');
      return;
    }
    
    // Allow sending messages during streaming (they'll be queued)
    if (!input.trim() && attachments.length === 0) return;
    
    // Check if we need to delay this message (followup sent too soon after streaming started)
    // This prevents session crashes when sending followup messages too quickly
    if (currentSession?.streaming && currentSessionId) {
      // Check if we have at least one assistant message with content - if not, we can't safely interrupt
      // The session isn't established until Claude sends at least some response
      const hasAssistantResponse = currentSession.messages.some(m => 
        m.type === 'assistant' && m.content && m.content.length > 0
      );
      const streamingStartTime = streamingStartTimeRef.current[currentSessionId];
      
      // If we already have an assistant response, we can send immediately - no need to wait
      if (!hasAssistantResponse) {
        // No assistant response yet - must wait for Claude to establish session
        const effectiveStartTime = streamingStartTime || Date.now();
        const timeSinceStart = Date.now() - effectiveStartTime;
        const SAFE_DELAY = 10000; // 10 seconds - wait for Claude to establish session and respond
        
        if (timeSinceStart < SAFE_DELAY) {
          const remainingDelay = SAFE_DELAY - timeSinceStart;
          console.log(`[ClaudeChat] Waiting for Claude to establish session - delaying ${remainingDelay}ms`);
          
          // Clear any existing pending followup
          if (pendingFollowupRef.current?.timeoutId) {
            clearTimeout(pendingFollowupRef.current.timeoutId);
          }
          
          // Store the message to send later
          const messageToSend = input;
          const attachmentsToSend = [...attachments];
          
          // Clear input immediately to show user we got their message
          setInput('');
          setAttachments([]);
          if (inputRef.current) {
            inputRef.current.style.height = '44px';
            inputRef.current.style.overflow = 'hidden';
          }
          
          // Show pending indicator
          setPendingFollowupMessage(`waiting for claude to respond (${Math.ceil(remainingDelay / 1000)}s)...`)
          
          // Add to message history
          if (input.trim() && currentSessionId) {
            setMessageHistory(prev => ({
              ...prev,
              [currentSessionId]: [...(prev[currentSessionId] || []).filter(m => m !== input), input].slice(-50)
            }));
            setHistoryIndex(-1);
          }
          
          // Schedule the actual send with countdown
          let countdownActive = true;
          const updateCountdown = () => {
            if (!countdownActive) return; // Stop if countdown was cancelled
            const remaining = SAFE_DELAY - (Date.now() - effectiveStartTime);
            if (remaining > 0 && pendingFollowupRef.current) {
              setPendingFollowupMessage(`waiting for claude to respond (${Math.ceil(remaining / 1000)}s)...`);
              setTimeout(updateCountdown, 500);
            } else {
              setPendingFollowupMessage(null);
            }
          };
          
          // Start countdown updates
          setTimeout(updateCountdown, 500);
          
          // Schedule the actual send
          const timeoutId = setTimeout(() => {
            console.log('[ClaudeChat] Sending delayed followup message now');
            countdownActive = false; // Stop countdown updates
            pendingFollowupRef.current = null;
            setPendingFollowupMessage(null); // Clear immediately before sending
            // Call handleDelayedSend - it will also clear the pending message
            handleDelayedSend(messageToSend, attachmentsToSend, currentSessionId);
          }, remainingDelay);
          
          pendingFollowupRef.current = {
            sessionId: currentSessionId,
            content: messageToSend,
            attachments: attachmentsToSend,
            timeoutId
          };
          
          return;
        }
      } else if (hasAssistantResponse) {
        // We have an assistant response - safe to interrupt and send immediately
        console.log('[ClaudeChat] Interrupting stream to send new message (session established)');
        
        // Store the message content before clearing
        const messageToSend = input;
        const attachmentsToSend = [...attachments];
        const bashMode = bashCommandMode;
        
        // Store the pending message in ref to preserve it during interrupt
        pendingFollowupRef.current = {
          sessionId: currentSessionId,
          content: messageToSend,
          attachments: attachmentsToSend
        };
        setPendingFollowupMessage('sending followup after interrupt...');
        
        // Clear input immediately
        setInput('');
        setAttachments([]);
        setBashCommandMode(false);
        if (inputRef.current) {
          inputRef.current.style.height = '44px';
          inputRef.current.style.overflow = 'hidden';
        }
        
        // Immediately set streaming state to show thinking indicator
        useClaudeCodeStore.setState(state => ({
          sessions: state.sessions.map(s => 
            s.id === currentSessionId 
              ? { ...s, streaming: true, thinkingStartTime: Date.now() } 
              : s
          )
        }))
        
        // Add to message history
        if (messageToSend.trim() && currentSessionId) {
          setMessageHistory(prev => ({
            ...prev,
            [currentSessionId]: [...(prev[currentSessionId] || []).filter(m => m !== messageToSend), messageToSend].slice(-50)
          }));
          setHistoryIndex(-1);
        }
        
        // Interrupt and then send
        interruptSession().then(async () => {
          // Small delay to ensure interrupt is processed
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Check if we still have the pending message for this session
          if (pendingFollowupRef.current && pendingFollowupRef.current.sessionId === currentSessionId) {
            try {
              await handleDelayedSend(
                pendingFollowupRef.current.content, 
                pendingFollowupRef.current.attachments, 
                currentSessionId,
                bashMode
              );
              pendingFollowupRef.current = null;
              setPendingFollowupMessage(null);
            } catch (error) {
              console.error('[ClaudeChat] Failed to send followup after interrupt:', error);
              setPendingFollowupMessage(null);
              pendingFollowupRef.current = null;
              
              // Restore the input if send failed
              setInput(messageToSend);
              setAttachments(attachmentsToSend);
              setBashCommandMode(bashMode);
            }
          } else {
            setPendingFollowupMessage(null);
          }
        }).catch(error => {
          console.error('[ClaudeChat] Failed to interrupt:', error);
          setPendingFollowupMessage(null);
          pendingFollowupRef.current = null;
          
          // Restore the input if interrupt failed
          setInput(messageToSend);
          setAttachments(attachmentsToSend);
          setBashCommandMode(bashMode);
        });
        
        return;
      }
    }
    
    // Check for bash mode command (starts with !)
    if (bashCommandMode && input.startsWith('!')) {
      let bashCommand = input.slice(1).trim(); // Remove the ! prefix
      const originalCommand = bashCommand; // Store original for display
      
      // Set userBashRunning to true when executing user bash command
      useClaudeCodeStore.setState(state => ({
        sessions: state.sessions.map(s => 
          s.id === currentSessionId ? { ...s, userBashRunning: true } : s
        )
      }));
      
      // Windows CMD alias conversion
      if (bashCommand.startsWith('!')) {
        const cmdCommand = bashCommand.slice(1).trim(); // Remove '!' prefix
        bashCommand = `cmd.exe /c "${cmdCommand}"`;
      }
      
      if (bashCommand) {
        console.log('[ClaudeChat] Executing bash command:', bashCommand);
        
        // Add the command to the messages as a user message with proper structure
        const commandMessage = {
          id: `bash-cmd-${Date.now()}`,
          type: 'user' as const,
          message: { content: `!${originalCommand}` }, // Show original input
          timestamp: Date.now()
        };
        
        // Add to session messages
        if (currentSessionId) {
          addMessageToSession(currentSessionId, commandMessage);
        }
        
        // Add to message history for up/down navigation
        if (input.trim() && currentSessionId) {
          setMessageHistory(prev => ({
            ...prev,
            [currentSessionId]: [...(prev[currentSessionId] || []).filter(m => m !== input), input].slice(-50) // Keep last 50 messages
          }));
          setHistoryIndex(-1); // Reset history navigation
        }
        
        // Clear input and reset bash mode
        setInput('');
        setBashCommandMode(false);
        if (inputRef.current) {
          inputRef.current.style.height = '44px';
          inputRef.current.style.overflow = 'hidden';
        }
        
        try {
          // Send bash command through the server (which handles it properly)
          // The server will execute through WSL and send back results via socket
          console.log('[ClaudeChat] Sending bash command to server:', `!${originalCommand}`);
          
          // Use the store's sendMessage which already has the socket connection
          // The ! prefix tells the server this is a bash command
          await sendMessage(`!${originalCommand}`, true);
          
          // Focus restoration after sending to server
          if (navigator.platform.includes('Win') && inputRef.current) {
            // Simple focus restoration since server handles execution
            setTimeout(() => {
              inputRef.current?.focus();
            }, 100);
          }
          
          // Clear userBashRunning flag after sending to server
          setTimeout(() => {
            useClaudeCodeStore.setState(state => ({
              sessions: state.sessions.map(s => 
                s.id === currentSessionId 
                  ? { ...s, userBashRunning: false } 
                  : s
              )
            }));
          }, 1000);
          
        } catch (error) {
          // This should rarely happen since bash commands now always return success
          // The actual command output (including errors) is sent as a message
          console.error('[ClaudeChat] Unexpected error sending bash command:', error);
          
          // Clear userBashRunning flag even on error
          useClaudeCodeStore.setState(state => ({
            sessions: state.sessions.map(s => 
              s.id === currentSessionId ? { ...s, userBashRunning: false, bashProcessId: undefined } : s
            )
          }));
        }
        
        return;
      }
    }
    
    // Check for slash commands and special inputs
    const trimmedInput = input.trim();
    if (trimmedInput === '/clear') {
      console.log('[ClaudeChat] Clearing context for session:', currentSessionId);
      if (currentSessionId && !currentSession?.readOnly) {
        clearContext(currentSessionId);
        setInput('');
        // Reset textarea height when clearing context
        if (inputRef.current) {
          inputRef.current.style.height = '44px'; // Reset to min-height
          inputRef.current.style.overflow = 'hidden';
        }
        // Reset scroll position to "stick to bottom" for this session
        setScrollPositions(prev => ({
          ...prev,
          [currentSessionId]: -1
        }));
        return;
      }
    } else if (trimmedInput === '/model' || trimmedInput.startsWith('/model ')) {
      console.log('[ClaudeChat] Toggling model');
      toggleModel();
      setInput('');
      // Reset textarea height
      if (inputRef.current) {
        inputRef.current.style.height = '44px';
        inputRef.current.style.overflow = 'hidden';
      }
      return;
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
        inputRef.current.style.height = '44px'; // Reset to min-height
        inputRef.current.style.overflow = 'hidden';
      }
      // Clear drafts after sending
      updateSessionDraft(currentSessionId, '', []);
      // Track when streaming starts for this session (for first message of a fresh session)
      // This helps prevent followup crashes when session is just starting
      // Don't clear if already streaming - preserve the tracking
      const isFirstMessage = !currentSession?.messages?.some(m => m.type === 'user');
      if ((isFirstMessage || !streamingStartTimeRef.current[currentSessionId]) && !currentSession?.streaming) {
        streamingStartTimeRef.current[currentSessionId] = Date.now();
        console.log('[ClaudeChat] Recording streaming start time for session (first message):', currentSessionId);
      }
      
      await sendMessage(messageContent, bashCommandMode);
      
      // Mark as at bottom and force scroll after sending message
      if (currentSessionId) {
        setIsAtBottom(prev => ({
          ...prev,
          [currentSessionId]: true
        }));
      }
      
      // Force scroll to bottom
      requestAnimationFrame(() => {
        if (chatContainerRef.current) {
          chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
      });
    } catch (error) {
      console.error('[ClaudeChat] Failed to send message:', error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget;
    const cursorPos = textarea.selectionStart;
    
    // Handle Ctrl+W to close current tab (with interrupt if streaming)
    if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
      e.preventDefault();
      e.stopPropagation();
      
      if (currentSessionId) {
        // If streaming, interrupt first then close
        if (currentSession?.streaming) {
          console.log('[ClaudeChat] Interrupting stream before closing tab');
          interruptSession().then(() => {
            deleteSession(currentSessionId);
          });
        } else {
          deleteSession(currentSessionId);
        }
      }
      return;
    }
    
    // If mention or command autocomplete is open, let it handle arrow keys and tab
    if ((mentionTrigger !== null || commandTrigger) && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Tab')) {
      return; // Let the autocomplete component handle these
    }
    
    if (e.key === 'Escape' && (mentionTrigger !== null || commandTrigger)) {
      e.preventDefault();
      setMentionTrigger(null);
      setCommandTrigger(null);
      return;
    }
    
    if (e.key === 'Enter' && !e.shiftKey) {
      // Don't send if autocomplete is open - let autocomplete handle it
      if (mentionTrigger !== null || commandTrigger !== null) {
        return;
      }
      e.preventDefault();
      handleSend();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
      // Clear entire input when textarea is focused
      e.preventDefault();
      setInput('');
    } else if (e.ctrlKey && e.key === 'ArrowLeft') {
      // Override default word navigation - go to start
      e.preventDefault();
      textarea.selectionStart = 0;
      textarea.selectionEnd = 0;
      return false;
    } else if (e.ctrlKey && e.key === 'ArrowRight') {
      // Override default word navigation - go to end
      e.preventDefault();
      textarea.selectionStart = textarea.value.length;
      textarea.selectionEnd = textarea.value.length;
      return false;
    } else if (e.key === 'ArrowUp') {
      // Only navigate history if cursor is at the beginning of the text
      if (cursorPos === 0 && textarea.selectionEnd === 0 && currentSessionId) {
        e.preventDefault();
        
        const sessionHistory = messageHistory[currentSessionId] || [];
        
        // Navigate up in history
        if (historyIndex < sessionHistory.length - 1) {
          const newIndex = historyIndex + 1;
          setHistoryIndex(newIndex);
          const historyValue = sessionHistory[sessionHistory.length - 1 - newIndex];
          setInput(historyValue);
          // Update bash mode if retrieved command starts with !
          setBashCommandMode(historyValue.startsWith('!'));
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
            const historyValue = sessionHistory[sessionHistory.length - 1 - newIndex];
            setInput(historyValue);
            // Update bash mode if retrieved command starts with !
            setBashCommandMode(historyValue.startsWith('!'));
          } else if (historyIndex === 0) {
            // Return to the original input
            setHistoryIndex(-1);
            setInput('');
            setBashCommandMode(false);
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
    // Only show drag state for actual file drops
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
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
    
    // Helper function to convert Windows path to WSL path
    const convertToWSLPath = (path: string): string => {
      if (path.match(/^[A-Z]:\\/)) {
        const driveLetter = path[0].toLowerCase();
        const pathWithoutDrive = path.substring(2).replace(/\\/g, '/');
        return `/mnt/${driveLetter}${pathWithoutDrive}`;
      }
      return path;
    };
    
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
              const wslPath = convertToWSLPath(path);
              console.log('Creating session for folder:', path, '->', wslPath);
              const sessionName = path.split(/[/\\]/).pop() || 'new session';
              await createSession(sessionName, wslPath);
              return;
            }
          } else {
            // It's a file - insert path into input
            const file = item.getAsFile();
            const path = (file as any)?.path;
            if (path) {
              const wslPath = convertToWSLPath(path);
              console.log('Inserting file path:', path, '->', wslPath);
              setInput(prev => prev + (prev ? ' ' : '') + wslPath);
              return;
            }
          }
        }
      }
    }
    
    // Fallback: Check files array (for browsers that don't support webkitGetAsEntry)
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 1) {
      const file = files[0];
      const path = (file as any).path;
      
      if (path) {
        // Check if it's likely a folder (no extension, or type is empty)
        const hasExtension = file.name.includes('.') && file.name.lastIndexOf('.') > 0;
        const isLikelyFolder = !hasExtension && file.type === '';
        
        if (isLikelyFolder) {
          const wslPath = convertToWSLPath(path);
          console.log('Creating session for folder (fallback):', path, '->', wslPath);
          const sessionName = path.split(/[/\\]/).pop() || 'new session';
          await createSession(sessionName, wslPath);
          return;
        } else {
          // It's a file - insert path into input
          const wslPath = convertToWSLPath(path);
          console.log('Inserting file path (fallback):', path, '->', wslPath);
          setInput(prev => prev + (prev ? ' ' : '') + wslPath);
          return;
        }
      }
    }
    
    // Handle multiple file drops - insert all paths
    if (files.length > 1) {
      const paths = files
        .map(file => (file as any).path)
        .filter(Boolean)
        .map(convertToWSLPath);
      
      if (paths.length > 0) {
        console.log('Inserting multiple file paths:', paths);
        setInput(prev => prev + (prev ? ' ' : '') + paths.join(' '));
        return;
      }
    }
    
    // If no path available, handle as attachment (images/text files)
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

  // Handle mention selection
  const handleMentionSelect = (replacement: string, start: number, end: number) => {
    const newValue = input.substring(0, start) + replacement + input.substring(end);
    setInput(newValue);
    setMentionTrigger(null);
    
    // Focus back on the input and set cursor after the replacement
    if (inputRef.current) {
      inputRef.current.focus();
      const newCursorPos = start + replacement.length;
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.selectionStart = inputRef.current.selectionEnd = newCursorPos;
        }
      }, 0);
    }
  };

  // Handle command selection
  const handleCommandSelect = (replacement: string, start: number, end: number) => {
    // Check if this is a command we handle locally
    const command = replacement.trim();
    
    if (command === '/clear') {
      // Handle clear command locally
      setInput('');
      setCommandTrigger(null);
      if (currentSessionId && !currentSession?.readOnly) {
        clearContext(currentSessionId);
        // Reset to stick to bottom for this session
        setIsAtBottom(prev => ({
          ...prev,
          [currentSessionId]: true
        }));
        setScrollPositions(prev => ({
          ...prev,
          [currentSessionId]: -1
        }));
      }
    } else if (command === '/model') {
      // Handle model command locally - toggle between opus and sonnet
      setInput('');
      setCommandTrigger(null);
      toggleModel();
    } else {
      // For other commands like /compact and /init, insert into input and optionally send
      const newValue = input.substring(0, start) + replacement + input.substring(end);
      setInput(newValue);
      setCommandTrigger(null);
      
      // For /init command, automatically send it
      if (command === '/init') {
        // Set the input then immediately send
        setTimeout(() => {
          handleSend();
        }, 0);
      } else {
        // Focus back on the input and set cursor after the replacement
        if (inputRef.current) {
          inputRef.current.focus();
          const newCursorPos = start + replacement.length;
          setTimeout(() => {
            if (inputRef.current) {
              inputRef.current.selectionStart = inputRef.current.selectionEnd = newCursorPos;
            }
          }, 0);
        }
      }
    }
  };

  // Auto-resize textarea and detect @mentions
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPosition = e.target.selectionStart;
    
    // Check if ? is typed as first character when input was empty
    if (input === '' && newValue === '?') {
      // Prevent the ? from being typed and show help
      e.preventDefault();
      setInput('');
      setShowHelpModal(true);
      return;
    }
    
    setInput(newValue);
    
    // Check for bash mode (starts with !)
    const wasInBashMode = bashCommandMode;
    const isNowBashMode = newValue.startsWith('!');
    
    if (wasInBashMode !== isNowBashMode) {
      setBashCommandMode(isNowBashMode);
      // Preserve focus when entering/exiting bash mode on Windows
      if (navigator.platform.includes('Win')) {
        requestAnimationFrame(() => {
          inputRef.current?.focus();
        });
      }
    }
    
    // Only check for triggers if textarea is focused
    const isTextareaFocused = document.activeElement === e.target;
    
    if (isTextareaFocused) {
      // Check for @mention and /command triggers
      const beforeCursor = newValue.substring(0, cursorPosition);
      const lastAtIndex = beforeCursor.lastIndexOf('@');
      const lastSlashIndex = beforeCursor.lastIndexOf('/');
      
      // If no @ found and mention was open, close it (handles backspace deletion of @)
      if (lastAtIndex === -1 && mentionTrigger !== null) {
        setMentionTrigger(null);
        setCommandTrigger(null);
        return;
      }
      
      // Determine which trigger is more recent
      if (lastAtIndex >= 0 && lastAtIndex > lastSlashIndex) {
        // Check if @ is at the start or preceded by whitespace
        const charBefore = lastAtIndex > 0 ? beforeCursor[lastAtIndex - 1] : ' ';
        if (charBefore === ' ' || charBefore === '\n' || lastAtIndex === 0) {
          // Get the text after @ until cursor (excluding the @ itself)
          const mentionText = beforeCursor.substring(lastAtIndex + 1);
          
          // Check if there's no space in the mention text (still typing the mention)
          if (!mentionText.includes(' ') && !mentionText.includes('\n')) {
            // Pass empty string for just @ to show root directory
            setMentionTrigger(mentionText);
            setMentionCursorPos(cursorPosition);
            setCommandTrigger(null);
          } else {
            setMentionTrigger(null);
          }
        } else {
          setMentionTrigger(null);
        }
      } else if (lastSlashIndex === 0 && lastSlashIndex > lastAtIndex) {
        // Only trigger if / is at the very beginning of the message
        // Get the text after / until cursor
        const commandText = beforeCursor.substring(lastSlashIndex);
        
        // Check if there's no space in the command text (still typing the command)
        if (!commandText.includes(' ') && !commandText.includes('\n')) {
          setCommandTrigger(commandText);
          setCommandCursorPos(cursorPosition);
          setMentionTrigger(null);
        } else {
          setCommandTrigger(null);
        }
      } else {
        setMentionTrigger(null);
        setCommandTrigger(null);
      }
    } else {
      // Clear triggers if textarea is not focused
      setMentionTrigger(null);
      setCommandTrigger(null);
    }
    
    // Simple auto-resize without jumps
    const textarea = e.target;
    const minHeight = 44; // Match CSS min-height exactly
    const maxHeight = 90; // 5 lines * 18px
    
    // Check if we're at bottom before resizing
    const container = chatContainerRef.current;
    const wasAtBottom = container && currentSessionId &&
      (isAtBottom[currentSessionId] !== false || 
       (container.scrollHeight - container.scrollTop - container.clientHeight < 1));
    
    // Store the current height before resetting
    const currentHeight = textarea.offsetHeight;
    
    // Reset height to auto to force recalculation
    textarea.style.height = 'auto';
    
    // Calculate new height based on scrollHeight
    const scrollHeight = textarea.scrollHeight;
    const newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);
    
    // Only update if height actually changed to prevent unnecessary reflows
    if (newHeight !== currentHeight) {
      textarea.style.height = newHeight + 'px';
    } else {
      // Restore the original height if no change needed
      textarea.style.height = currentHeight + 'px';
    }
    
    // Show scrollbar only when content exceeds max height
    textarea.style.overflow = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
    
    // If we were at bottom, maintain scroll position at bottom
    if (wasAtBottom && container) {
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
    }
  };

  // Update input container height when it changes
  useEffect(() => {
    if (!inputContainerRef.current) return;
    
    const observer = new ResizeObserver(() => {
      const height = inputContainerRef.current?.offsetHeight || 120;
      setInputContainerHeight(height);
    });
    
    observer.observe(inputContainerRef.current);
    
    return () => observer.disconnect();
  }, []);







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
      <div 
        className="chat-messages" 
        ref={chatContainerRef}
      >
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
        {/* Show thinking indicator only when actually streaming */}
        {(() => {
          // Removed spammy thinking indicator log
          return currentSession?.streaming;
        })() && (
          <div className="message assistant">
            <div className="message-content">
              <div className="thinking-indicator-bottom">
                <LoadingIndicator size="small" color="red" />
                <span className="thinking-text-wrapper">
                  <span className="thinking-text">
                    {'thinking'.split('').map((char, i) => (
                      <span 
                        key={i} 
                        className="thinking-char" 
                        style={{ 
                          animationDelay: `${i * 0.05}s`
                        }}
                      >
                        {char}
                      </span>
                    ))}
                    <span className="thinking-dots"></span>
                  </span>
                  {currentSessionId && thinkingElapsed[currentSessionId] > 0 && (
                    <span className="thinking-timer">{thinkingElapsed[currentSessionId]}s</span>
                  )}
                </span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      
      {/* Pending followup indicator */}
      {pendingFollowupMessage && (
        <div className="pending-followup-indicator">
          <span className="pending-followup-text">{pendingFollowupMessage}</span>
        </div>
      )}
      
      {/* Bash running indicator - shows for both user bash commands and Claude's bash tool */}
      {(currentSession?.runningBash || currentSession?.userBashRunning) && (
        <div className="bash-running-indicator">
          <span className="bash-running-text">
            bash running<span className="bash-running-dots">{'.'.repeat(bashDotCounts[currentSessionId || ''] || 1)}</span>
            <span className="bash-running-time">{bashElapsedTimes[currentSessionId || ''] || 0}s</span>
          </span>
          <button 
            className="bash-cancel-btn"
            onClick={async () => {
              // Kill bash process if it exists
              if (currentSession?.bashProcessId) {
                try {
                  const { invoke } = await import('@tauri-apps/api/core');
                  await invoke('kill_bash_process', { 
                    processId: currentSession.bashProcessId 
                  });
                  
                  // Add cancelled message with elapsed time
                  const elapsedTime = bashElapsedTimes[currentSessionId || ''] || 0;
                  const cancelMessage = {
                    id: `bash-cancel-${Date.now()}`,
                    type: 'system' as const,
                    subtype: 'interrupted' as const,
                    message: `bash command cancelled (${elapsedTime}s)`,
                    timestamp: Date.now()
                  };
                  
                  if (currentSessionId) {
                    addMessageToSession(currentSessionId, cancelMessage);
                  }
                  
                  // Clear flags immediately
                  useClaudeCodeStore.setState(state => ({
                    sessions: state.sessions.map(s => 
                      s.id === currentSessionId 
                        ? { ...s, userBashRunning: false, bashProcessId: undefined } 
                        : s
                    )
                  }));
                } catch (error) {
                  console.error('Failed to kill bash process:', error);
                }
              } else {
                // Also interrupt Claude session if needed
                interruptSession();
              }
            }}
            title="cancel bash (esc)"
          >
            cancel
          </button>
        </div>
      )}
      
      <div 
        className={`chat-input-container ${isDragging ? 'dragging' : ''}`}
        ref={inputContainerRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{ display: currentSession?.readOnly ? 'none' : 'block' }}
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
          {bashCommandMode && (
            <div className="bash-indicator">
              <IconTerminal size={14} stroke={1.5} />
            </div>
          )}
          {/* Calculate if context is almost full */}
          {(() => {
            const conversationTokens = currentSession?.analytics?.tokens?.conversationTokens || 0;
            // cache tokens are system prompts, not part of conversation context
            const totalContextTokens = conversationTokens;
            const contextWindowTokens = 200000;
            const percentageNum = (totalContextTokens / contextWindowTokens * 100);
            const isContextFull = percentageNum > 95;
            
            return (
              <>
                <textarea
                  ref={inputRef}
                  className={`chat-input ${bashCommandMode ? 'bash-mode' : ''} ${isContextFull ? 'context-full' : ''}`}
                  placeholder={(() => {
                    const projectName = currentSession?.workingDirectory?.split(/[/\\]/).pop() || 'project';
                    if (isContextFull) return "context full - compact or clear required";
                    if (currentSession?.readOnly) return "read-only session";
                    if (bashCommandMode) return "bash command...";
                    if (currentSession?.streaming) return `append message for ${projectName}...`;
                    return `code prompt for ${projectName}...`;
                  })()}
                  value={currentSession?.readOnly || isContextFull ? '' : input}
                  onChange={handleTextareaChange}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  style={{ 
                    height: '44px',
                    paddingRight: currentSession?.streaming ? '48px' : undefined
                  }}
                  disabled={currentSession?.readOnly || isContextFull}
                  onFocus={() => setIsTextareaFocused(true)}
                  onBlur={() => {
                    // Close autocomplete when textarea loses focus
                    setMentionTrigger(null);
                    setCommandTrigger(null);
                    setIsTextareaFocused(false);
                  }}
                  onContextMenu={(e) => {
                    // Allow default context menu for right-click paste
                    e.stopPropagation();
                  }}
                />
                {isContextFull && (
                  <div className="context-full-overlay">
                    <div className="context-full-message">
                      context {percentageNum.toFixed(0)}% full
                    </div>
                    <div className="context-full-actions">
                      <button 
                        className="btn-compact"
                        onClick={() => {
                          setInput('/compact');
                          handleSend();
                        }}
                        title="compress context to continue"
                      >
                        compact
                      </button>
                      <button 
                        className="btn-clear"
                        onClick={() => {
                          if (currentSessionId) {
                            clearContext(currentSessionId);
                            setInput('');
                          }
                        }}
                        title="clear all messages"
                      >
                        clear
                      </button>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
          <Watermark inputLength={input.length} isFocused={isTextareaFocused} isStreaming={currentSession?.streaming} />
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
          
          {/* Dictation button */}
          <button
            className={`btn-dictation ${isDictating ? 'active' : ''}`}
            onClick={toggleDictation}
            title={isDictating ? "stop dictation (ctrl+e)" : "start dictation (ctrl+e)"}
            disabled={currentSession?.readOnly}
          >
            {isDictating ? <IconMicrophone size={14} /> : <IconMicrophoneOff size={14} />}
          </button>
          
          <div className="context-info">
            {(() => {
              // tokens.total already includes all tokens (input + output + cache)
              const totalContextTokens = currentSession?.analytics?.tokens?.total || 0;
              const cacheTokens = currentSession?.analytics?.tokens?.cacheSize || 0;
              
              // Disabled spammy token indicator log
              
              // Opus 4.1 has 200k context window
              // Sonnet 4.0 has 200k context window 
              // Both models have the same 200k context window
              const contextWindowTokens = 200000;
              
              // Calculate percentage using total context tokens
              const rawPercentage = (totalContextTokens / contextWindowTokens * 100);
              const percentageNum = Math.min(100, rawPercentage);
              // Format: always show 2 decimal places
              const percentage = percentageNum.toFixed(2);
              
              // Log warning if tokens exceed context window
              if (rawPercentage > 100) {
                console.warn(`[TOKEN WARNING] Tokens (${totalContextTokens}) exceed context window (${contextWindowTokens}) - ${rawPercentage}%`);
              }
              // Color classes: grey until 90%, then custom negative color
              const usageClass = percentageNum >= 90 ? 'high' : 'low';
              
              const hasActivity = currentSession.messages.some(m => 
                m.type === 'assistant' || m.type === 'tool_use' || m.type === 'tool_result'
              );
              
              return (
                <>
                  <button 
                    className="btn-clear-context" 
                    onClick={() => {
                      // Clear messages but keep session
                      if (currentSessionId && hasActivity && !currentSession?.readOnly) {
                        clearContext(currentSessionId);
                        // Reset to stick to bottom for this session
                        setIsAtBottom(prev => ({
                          ...prev,
                          [currentSessionId]: true
                        }));
                        setScrollPositions(prev => {
                          const newPositions = { ...prev };
                          delete newPositions[currentSessionId];
                          return newPositions;
                        });
                      }
                    }}
                    disabled={currentSession?.readOnly}
                    title={hasActivity ? "clear context (ctrl+l)" : "clear context (ctrl+l)"}
                    style={{
                      opacity: 1,
                      cursor: 'default'
                    }}
                  >
                    clear
                  </button>
                  <button 
                    className={`btn-stats ${usageClass}`} 
                    onClick={() => setShowStatsModal(true)}
                    disabled={false}
                    title={hasActivity ? 
                      `${totalContextTokens.toLocaleString()} / ${contextWindowTokens.toLocaleString()} tokens (cached: ${cacheTokens.toLocaleString()}) - click for details (ctrl+.)` : 
                      `0 / ${contextWindowTokens.toLocaleString()} tokens - click for details (ctrl+.)`}
                  >
                    {percentage}% used
                  </button>
                </>
              );
            })()}
          </div>
        </div>
      </div>
      
      {/* Mention Autocomplete */}
      {mentionTrigger !== null && (
        <MentionAutocomplete
          trigger={mentionTrigger}
          cursorPosition={mentionCursorPos}
          inputRef={inputRef}
          onSelect={handleMentionSelect}
          onClose={() => setMentionTrigger(null)}
          workingDirectory={currentSession?.workingDirectory}
        />
      )}
      
      {/* Command Autocomplete */}
      {commandTrigger && (
        <CommandAutocomplete
          trigger={commandTrigger}
          cursorPosition={commandCursorPos}
          inputRef={inputRef}
          onSelect={handleCommandSelect}
          onClose={() => setCommandTrigger(null)}
        />
      )}
      

      
      {showStatsModal && (
        <div className="stats-modal-overlay" onClick={() => setShowStatsModal(false)}>
          <div className="stats-modal" onClick={(e) => e.stopPropagation()}>
            <div className="stats-header">
              <h3>
                <IconChartDots size={16} stroke={1.5} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                context usage
              </h3>
              <button className="stats-close" onClick={() => setShowStatsModal(false)}>
                <IconX size={16} />
              </button>
            </div>
            <div className="stats-content">
              {(() => {
                // Calculate total context usage - only conversation tokens count
                if (currentSession?.analytics?.tokens?.total || currentSession?.analytics?.tokens?.total === 0) {
                  console.log('📱 [UI-ANALYTICS] Session analytics in UI:', {
                    sessionId: currentSession?.id,
                    totalTokens: currentSession?.analytics?.tokens?.total,
                    hasAnalytics: !!currentSession?.analytics,
                    analyticsKeys: currentSession?.analytics ? Object.keys(currentSession.analytics) : []
                  });
                }
                // tokens.total already includes all tokens
                const totalContextTokens = currentSession?.analytics?.tokens?.total || 0;
                const contextWindowTokens = 200000;
                const rawPercentage = (totalContextTokens / contextWindowTokens * 100);
                const percentageNum = Math.min(100, rawPercentage);
                const percentage = percentageNum.toFixed(2);
                
                return (
                  <>
                    <div className="stats-column" style={{ gridColumn: 'span 2' }}>
                      <div className="stats-section">
                        <div className="stat-row">
                          <div className="stat-keys">
                            <IconChartBubbleFilled size={14} />
                            <span className="stat-name">total context</span>
                          </div>
                          <span className="stat-dots"></span>
                          <span className="stat-desc" style={{ fontWeight: 600, color: 'var(--accent-color)' }}>
                            {(currentSession?.analytics?.tokens?.total || 0).toLocaleString()} / 200k ({Math.min(100, ((currentSession?.analytics?.tokens?.total || 0) / 200000 * 100)).toFixed(1)}%)
                          </span>
                        </div>
                        <div className="stat-row">
                          <div className="stat-keys">
                            <IconMessage size={14} />
                            <span className="stat-name">actual tokens</span>
                          </div>
                          <span className="stat-dots"></span>
                          <span className="stat-desc">
                            {((currentSession?.analytics?.tokens?.input || 0) + (currentSession?.analytics?.tokens?.output || 0)).toLocaleString()} (in: {(currentSession?.analytics?.tokens?.input || 0).toLocaleString()}, out: {(currentSession?.analytics?.tokens?.output || 0).toLocaleString()})
                          </span>
                        </div>
                        <div className="stat-row">
                          <div className="stat-keys">
                            <IconArtboardFilled size={14} />
                            <span className="stat-name">cache tokens</span>
                          </div>
                          <span className="stat-dots"></span>
                          <span className="stat-desc">
                            {((currentSession?.analytics?.tokens?.cacheSize || 0) + (currentSession?.analytics?.tokens?.cacheCreation || 0)).toLocaleString()} (read: {(currentSession?.analytics?.tokens?.cacheSize || 0).toLocaleString()}, new: {(currentSession?.analytics?.tokens?.cacheCreation || 0).toLocaleString()})
                          </span>
                        </div>
                      </div>
                    </div>
              <div className="stats-column">
                <div className="stats-section">
                  <h4>usage</h4>
                  <div className="stat-row">
                    <div className="stat-keys">
                      <IconSend size={14} />
                      <span className="stat-name">messages</span>
                    </div>
                    <span className="stat-dots"></span>
                    <span className="stat-desc">
                      {(() => {
                        const messageCount = currentSession?.analytics?.totalMessages || 0;
                        console.log(`📊 [UI MESSAGES] Displaying message count:`, { 
                          sessionId: currentSession?.id,
                          totalMessages: messageCount,
                          hasAnalytics: !!currentSession?.analytics,
                          analytics: currentSession?.analytics
                        });
                        return messageCount;
                      })()}
                    </span>
                  </div>
                  <div className="stat-row">
                    <div className="stat-keys">
                      <IconTool size={14} />
                      <span className="stat-name">tool uses</span>
                    </div>
                    <span className="stat-dots"></span>
                    <span className="stat-desc">
                      {(() => {
                        const toolCount = currentSession?.analytics?.toolUses || 0;
                        console.log(`📊 [UI TOOLS] Displaying tool count:`, { 
                          sessionId: currentSession?.id,
                          toolUses: toolCount,
                          hasAnalytics: !!currentSession?.analytics
                        });
                        return toolCount;
                      })()}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="stats-column">
                <div className="stats-section">
                  <h4>cost</h4>
                  <div className="stat-row">
                    <div className="stat-keys">
                      <IconBrain size={14} />
                      <span className="stat-name">opus %</span>
                    </div>
                    <span className="stat-dots"></span>
                    <span className="stat-desc">
                      {(() => {
                        const opusTokens = currentSession?.analytics?.tokens?.byModel?.opus?.total || 0;
                        const totalTokens = currentSession?.analytics?.tokens?.total || 1;
                        return `${Math.round((opusTokens / totalTokens) * 100)}%`;
                      })()}
                    </span>
                  </div>
                  <div className="stat-row">
                    <div className="stat-keys">
                      <IconCoin size={14} />
                      <span className="stat-name">total</span>
                    </div>
                    <span className="stat-dots"></span>
                    <span className="stat-desc">
                      ${(() => {
                        // Use actual cost from Claude if available
                        if (currentSession?.analytics?.cost?.total) {
                          // Format cost to 2 decimal places for display
                          return currentSession.analytics.cost.total.toFixed(2);
                        }
                        
                        // Otherwise calculate based on token usage
                        const opusInput = currentSession?.analytics?.tokens?.byModel?.opus?.input || 0;
                        const opusOutput = currentSession?.analytics?.tokens?.byModel?.opus?.output || 0;
                        const sonnetInput = currentSession?.analytics?.tokens?.byModel?.sonnet?.input || 0;
                        const sonnetOutput = currentSession?.analytics?.tokens?.byModel?.sonnet?.output || 0;
                        
                        const opusCost = (opusInput / 1000000) * 3.00 + (opusOutput / 1000000) * 15.00;
                        const sonnetCost = (sonnetInput / 1000000) * 2.50 + (sonnetOutput / 1000000) * 12.50;
                        
                        return (opusCost + sonnetCost).toFixed(2);
                      })()}
                    </span>
                  </div>
                </div>
              </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
      {showHelpModal && <KeyboardShortcuts onClose={() => setShowHelpModal(false)} />}
    </div>
  );
};