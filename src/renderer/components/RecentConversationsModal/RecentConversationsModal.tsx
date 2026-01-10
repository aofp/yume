import React, { useState, useEffect, useRef, useCallback } from 'react';
import { IconMessages, IconX, IconRefresh } from '@tabler/icons-react';
import { claudeCodeClient } from '../../services/claudeCodeClient';

interface RecentConversation {
  id: string;
  title: string;
  summary: string;
  projectPath: string;
  projectName: string;
  timestamp: number;
  messageCount: number;
  filePath: string;
}

interface RecentConversationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConversationSelect: (conversation: RecentConversation) => void;
  workingDirectory?: string;
}

export const RecentConversationsModal: React.FC<RecentConversationsModalProps> = ({
  isOpen,
  onClose,
  onConversationSelect,
  workingDirectory,
}) => {
  const [conversations, setConversations] = useState<RecentConversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [isSelecting, setIsSelecting] = useState(false);
  // Track which input type last set the focus (keyboard wins over stale mouse hover)
  const [inputMode, setInputMode] = useState<'keyboard' | 'mouse'>('keyboard');
  const lastMousePos = useRef<{ x: number; y: number } | null>(null);
  const isOpenRef = useRef(isOpen);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  const loadConversations = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Get port from the client (same as rest of app)
      const port = claudeCodeClient.getServerPort() || 3001;
      // Filter by current project if workingDirectory is provided
      const projectParam = workingDirectory ? `?project=${encodeURIComponent(workingDirectory)}` : '';
      console.log('[ResumeModal] Fetching conversations from port:', port, 'project:', workingDirectory || 'all');
      const response = await fetch(`http://localhost:${port}/claude-recent-conversations${projectParam}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch conversations: ${response.status}`);
      }

      const data = await response.json();
      console.log('[ResumeModal] Loaded conversations:', data.conversations?.length || 0);
      setConversations(data.conversations || []);
    } catch (err) {
      console.error('[ResumeModal] Error loading recent conversations:', err);
      setError('Failed to load conversations');
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, [workingDirectory]);

  useEffect(() => {
    if (isOpen) {
      loadConversations();
      setFocusedIndex(0);
      setIsSelecting(false);
      setInputMode('keyboard');
      lastMousePos.current = null;
    }
  }, [isOpen, loadConversations]);

  const selectConversation = useCallback((conversation: RecentConversation) => {
    if (isSelecting) return;
    setIsSelecting(true);
    onConversationSelect(conversation);
    onClose();
  }, [isSelecting, onConversationSelect, onClose]);

  const formatTimestamp = useCallback((timestamp: number): string => {
    if (!timestamp || isNaN(timestamp)) return 'unknown';

    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    const timeStr = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).toLowerCase();

    if (isToday) {
      return `today ${timeStr}`;
    } else if (isYesterday) {
      return `yesterday ${timeStr}`;
    } else {
      const dateStr = date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      }).toLowerCase();
      return `${dateStr} ${timeStr}`;
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setIsSelecting(false);
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpenRef.current) return;

      const target = e.target as HTMLElement;
      const isInputField = target.tagName === 'INPUT' ||
                           target.tagName === 'TEXTAREA' ||
                           target.contentEditable === 'true';
      if (isInputField) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      // arrow key navigation - keyboard takes over focus
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setInputMode('keyboard');
        setFocusedIndex(prev => Math.min(prev + 1, conversations.length - 1));
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setInputMode('keyboard');
        setFocusedIndex(prev => Math.max(prev - 1, 0));
        return;
      }

      // enter to select currently focused item
      if (e.key === 'Enter') {
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < conversations.length) {
          selectConversation(conversations[focusedIndex]);
        }
        return;
      }

      // Handle number keys (1-9, 0 for 10th)
      if ((e.key >= '1' && e.key <= '9' || e.key === '0') && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        if (!isOpenRef.current || isSelecting) return;

        e.preventDefault();
        e.stopPropagation();
        const index = e.key === '0' ? 9 : parseInt(e.key) - 1;
        if (index < conversations.length) {
          selectConversation(conversations[index]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, isSelecting, selectConversation, conversations, focusedIndex]);

  if (!isOpen) return null;

  return (
    <div
      className="recent-modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="recent-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-title-group">
            <span className="modal-title">
              <IconMessages size={14} stroke={1.5} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
              resume {workingDirectory?.split(/[/\\]/).pop() || 'conversation'}
            </span>
            <span className="modal-hint">1-9 to open</span>
          </div>
          <div className="modal-header-actions">
            <button
              className="modal-refresh-btn"
              onClick={loadConversations}
              disabled={loading}
              title="refresh"
            >
              <IconRefresh size={14} className={loading ? 'spinning' : ''} />
            </button>
            <button
              className="modal-close-btn"
              onClick={onClose}
              title="close (esc)"
            >
              <IconX size={14} />
            </button>
          </div>
        </div>

        <div className="modal-content">
          {loading && <div className="no-recent">loading...</div>}
          {error && <div className="no-recent" style={{ color: 'var(--negative-color)' }}>{error}</div>}
          {!loading && !error && conversations.length === 0 && (
            <div className="no-recent">no recent conversations</div>
          )}
          {!loading && !error && conversations.slice(0, 9).map((conv, idx) => (
            <div
              key={conv.id}
              className={`recent-item-container ${focusedIndex === idx ? 'focused' : ''}`}
              onMouseMove={(e) => {
                // Only respond to actual mouse movement (ignore synthetic events from scroll)
                const pos = { x: e.clientX, y: e.clientY };
                if (lastMousePos.current &&
                    lastMousePos.current.x === pos.x &&
                    lastMousePos.current.y === pos.y) {
                  return;
                }
                lastMousePos.current = pos;
                // Mouse takes over focus - set index to hovered item
                setInputMode('mouse');
                setFocusedIndex(idx);
              }}
            >
              <button
                className="recent-item"
                onClick={() => selectConversation(conv)}
              >
                <span className="recent-item-number">{idx < 9 ? idx + 1 : ''}</span>
                <div className="recent-item-info">
                  <div className="recent-item-name">
                    <span className="recent-item-title">{conv.title}</span>
                    <span className="recent-item-time">{formatTimestamp(conv.timestamp)} · {conv.messageCount} msgs</span>
                  </div>
                </div>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
