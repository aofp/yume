import React, { useState, useEffect, useRef, useCallback } from 'react';
import { IconMessages, IconX, IconRefresh } from '@tabler/icons-react';
import { claudeCodeClient } from '../../services/claudeCodeClient';
import './RecentConversationsModal.css';

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
}

export const RecentConversationsModal: React.FC<RecentConversationsModalProps> = ({
  isOpen,
  onClose,
  onConversationSelect,
}) => {
  const [conversations, setConversations] = useState<RecentConversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
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
      console.log('[ResumeModal] Fetching conversations from port:', port);
      const response = await fetch(`http://localhost:${port}/claude-recent-conversations`);

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
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadConversations();
      setSelectedIndex(0);
      setHoveredIndex(null);
      setIsSelecting(false);
    }
  }, [isOpen, loadConversations]);

  const selectConversation = useCallback((conversation: RecentConversation) => {
    if (isSelecting) return;
    setIsSelecting(true);
    onConversationSelect(conversation);
    onClose();
  }, [isSelecting, onConversationSelect, onClose]);

  const formatTimeAgo = useCallback((timestamp: number): string => {
    if (!timestamp || isNaN(timestamp)) return 'unknown';

    const seconds = Math.floor((Date.now() - timestamp) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return `${Math.floor(seconds / 604800)}w ago`;
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

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, conversations.length - 1));
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (selectedIndex < conversations.length) {
          selectConversation(conversations[selectedIndex]);
        }
        return;
      }

      // Handle number keys (1-5)
      if (e.key >= '1' && e.key <= '5' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        if (!isOpenRef.current || isSelecting) return;

        e.preventDefault();
        e.stopPropagation();
        const index = parseInt(e.key) - 1;
        if (index < conversations.length) {
          selectConversation(conversations[index]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, isSelecting, selectConversation, conversations, selectedIndex]);

  if (!isOpen) return null;

  return (
    <div
      className="recent-conversations-modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="recent-conversations-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <span className="modal-title">
            <IconMessages size={14} stroke={1.5} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            resume conversation
          </span>
          <button
            className="refresh-icon"
            onClick={loadConversations}
            disabled={loading}
            title="refresh"
          >
            <IconRefresh size={14} className={loading ? 'spinning' : ''} />
          </button>
        </div>

        <div className="modal-content">
          {loading && <div className="loading-message">loading conversations...</div>}
          {error && <div className="error-message">{error}</div>}
          {!loading && !error && conversations.length === 0 && (
            <div className="no-conversations">no recent conversations found</div>
          )}
          {!loading && !error && conversations.map((conv, idx) => (
            <div
              key={conv.id}
              className={`conversation-item-container ${
                hoveredIndex === idx || selectedIndex === idx ? 'hovered' : ''
              }`}
              onMouseEnter={() => setHoveredIndex(idx)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <button
                className="conversation-item"
                onClick={() => selectConversation(conv)}
              >
                <span className="conversation-item-number">{idx + 1}</span>
                <div className="conversation-item-info">
                  <div className="conversation-item-title">
                    <span className="title-text">{conv.title}</span>
                    <span className="conversation-item-time">{formatTimeAgo(conv.timestamp)}</span>
                  </div>
                  <div className="conversation-item-meta">
                    <span className="project-name">{conv.projectName}</span>
                    <span className="message-count">{conv.messageCount} msgs</span>
                  </div>
                </div>
              </button>
              <button
                className="conversation-item-close"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                title="close"
              >
                <IconX size={12} />
              </button>
            </div>
          ))}
        </div>

        <div className="modal-footer">
          <span className="hint">press 1-5 or enter to resume</span>
        </div>
      </div>
    </div>
  );
};
