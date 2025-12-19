import { useVirtualizer } from '@tanstack/react-virtual';
import React, { useRef, useEffect, useCallback, useMemo, useImperativeHandle, forwardRef } from 'react';
import { MessageRenderer } from './MessageRenderer';
import { LoadingIndicator } from '../LoadingIndicator/LoadingIndicator';

interface VirtualizedMessageListProps {
  messages: any[];
  sessionId: string;
  className?: string;
  isStreaming?: boolean;
  lastAssistantMessageIds?: string[];
  showThinking?: boolean;
  thinkingElapsed?: number;
  onScrollStateChange?: (isAtBottom: boolean) => void;
}

export interface VirtualizedMessageListRef {
  scrollToBottom: (behavior?: 'auto' | 'smooth') => void;
  isAtBottom: () => boolean;
  forceScrollToBottom: (behavior?: 'auto' | 'smooth') => void;
}

export const VirtualizedMessageList = forwardRef<VirtualizedMessageListRef, VirtualizedMessageListProps>(({
  messages,
  sessionId,
  className = '',
  isStreaming = false,
  lastAssistantMessageIds = [],
  showThinking = false,
  thinkingElapsed = 0,
  onScrollStateChange
}, ref) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const lastContentHashRef = useRef('');
  const userHasScrolledRef = useRef(false); // Track if user has manually scrolled
  const userScrolledAtRef = useRef(0); // Timestamp when user scrolled up
  const previousMessageCountRef = useRef(0);
  const scrollToBottomRequestedRef = useRef(false);

  // Cooldown period after user scrolls up (don't auto-scroll for this long)
  const SCROLL_COOLDOWN_MS = 3000;

  // Add thinking message if streaming
  const displayMessages = useMemo(() => {
    if (showThinking) {
      return [...messages, { type: 'thinking', id: 'thinking-indicator' }];
    }
    return messages;
  }, [messages, showThinking]);

  // Create a hash of message content to detect changes
  const contentHash = useMemo(() => {
    return JSON.stringify(displayMessages.map(m => ({
      id: m.id,
      len: m.content?.length || m.text?.length || 0,
      type: m.type
    })));
  }, [displayMessages]);

  // Estimate message heights based on content
  const estimateSize = useCallback((index: number) => {
    const msg = displayMessages[index];
    if (!msg) return 100;

    // Thinking indicator has fixed height
    if (msg.type === 'thinking') {
      return 60;
    }

    // Tool messages are typically taller
    if (msg.type === 'tool_use' || msg.tool_name) {
      return 250;
    }

    // Tool results with diffs are even taller
    if (msg.type === 'tool_result' && msg.output?.includes('@@')) {
      return 400;
    }

    // Estimate based on content length
    const contentLength = msg.content?.length || msg.text?.length || 0;
    if (contentLength > 5000) return 600;
    if (contentLength > 2000) return 400;
    if (contentLength > 1000) return 300;
    if (contentLength > 500) return 200;
    return 150;
  }, [displayMessages]);

  const virtualizer = useVirtualizer({
    count: displayMessages.length,
    getScrollElement: () => parentRef.current,
    estimateSize,
    overscan: 5, // Render 5 items outside viewport for smoother scrolling
    getItemKey: useCallback((index: number) => {
      const msg = displayMessages[index];
      return msg?.id || `msg-${index}`;
    }, [displayMessages]),
  });

  // Check if we're at bottom
  const checkIfAtBottom = useCallback(() => {
    if (!parentRef.current) return false;
    const { scrollTop, scrollHeight, clientHeight } = parentRef.current;
    // Use 50px threshold for more reliable detection
    return scrollHeight - scrollTop - clientHeight < 50;
  }, []);

  // Check if we're in cooldown period after user scroll
  const isInScrollCooldown = useCallback(() => {
    if (!userHasScrolledRef.current) return false;
    const elapsed = Date.now() - userScrolledAtRef.current;
    return elapsed < SCROLL_COOLDOWN_MS;
  }, [SCROLL_COOLDOWN_MS]);

  // Scroll to bottom function using virtualizer API
  const scrollToBottom = useCallback((behavior: 'auto' | 'smooth' = 'auto') => {
    if (!parentRef.current || displayMessages.length === 0) return;

    // Don't force scroll if user has manually scrolled up (with cooldown)
    if (userHasScrolledRef.current && isInScrollCooldown()) return;

    const lastIndex = displayMessages.length - 1;

    // Use the virtualizer's scrollToIndex for proper virtual scrolling
    virtualizer.scrollToIndex(lastIndex, {
      align: 'end',
      behavior: behavior === 'smooth' ? 'smooth' : 'auto',
    });
  }, [displayMessages.length, virtualizer, isInScrollCooldown]);

  // Track last scroll position to detect scroll direction
  const lastScrollTopRef = useRef(0);

  // Update isAtBottom on scroll and detect user scrolling
  const handleScroll = useCallback(() => {
    if (!parentRef.current) return;

    const currentScrollTop = parentRef.current.scrollTop;
    const scrollingUp = currentScrollTop < lastScrollTopRef.current;
    lastScrollTopRef.current = currentScrollTop;

    const atBottom = checkIfAtBottom();
    isAtBottomRef.current = atBottom;

    // If user is scrolling UP, always mark as manually scrolled
    if (scrollingUp && !atBottom) {
      userHasScrolledRef.current = true;
      userScrolledAtRef.current = Date.now();
      console.log('[VirtualizedList] User scrolling UP - blocking auto-scroll');
      onScrollStateChange?.(false);
    }

    // If user scrolls back to bottom, clear the manual scroll flag
    if (atBottom) {
      userHasScrolledRef.current = false;
      userScrolledAtRef.current = 0;
      onScrollStateChange?.(true);
    }
  }, [checkIfAtBottom, onScrollStateChange]);

  // Expose scroll methods to parent components
  useImperativeHandle(ref, () => ({
    scrollToBottom: (behavior: 'auto' | 'smooth' = 'auto') => {
      // DON'T scroll if user has manually scrolled up (with cooldown)
      if (userHasScrolledRef.current) {
        const elapsed = Date.now() - userScrolledAtRef.current;
        if (elapsed < SCROLL_COOLDOWN_MS) return;
      }

      if (!parentRef.current || displayMessages.length === 0) return;
      const lastIndex = displayMessages.length - 1;
      virtualizer.scrollToIndex(lastIndex, {
        align: 'end',
        behavior: behavior === 'smooth' ? 'smooth' : 'auto',
      });
    },
    isAtBottom: () => checkIfAtBottom(),
    forceScrollToBottom: (behavior: 'auto' | 'smooth' = 'auto') => {
      // Force scroll and reset user scroll flag (for user-initiated actions like sending a message)
      userHasScrolledRef.current = false;
      userScrolledAtRef.current = 0;
      if (!parentRef.current || displayMessages.length === 0) return;
      const lastIndex = displayMessages.length - 1;
      virtualizer.scrollToIndex(lastIndex, {
        align: 'end',
        behavior: behavior === 'smooth' ? 'smooth' : 'auto',
      });
    },
  }), [displayMessages.length, virtualizer, checkIfAtBottom, SCROLL_COOLDOWN_MS]);

  // Reset user scroll flag when starting a new chat or message count increases from 0
  useEffect(() => {
    const messageCount = displayMessages.length;

    // If this is a new chat (going from 0 to >0 messages), reset scroll tracking
    if (previousMessageCountRef.current === 0 && messageCount > 0) {
      userHasScrolledRef.current = false;
      isAtBottomRef.current = true;
    }

    previousMessageCountRef.current = messageCount;
  }, [displayMessages.length]);

  // Auto-scroll to bottom when content changes - ONLY if user hasn't manually scrolled up
  useEffect(() => {
    const contentChanged = contentHash !== lastContentHashRef.current;
    lastContentHashRef.current = contentHash;

    if (!contentChanged || displayMessages.length === 0) return;

    // Only auto-scroll if user hasn't manually scrolled up (ignore isAtBottom check)
    if (!userHasScrolledRef.current) {
      const doScroll = () => {
        if (!parentRef.current) return;
        const lastIndex = displayMessages.length - 1;
        virtualizer.scrollToIndex(lastIndex, { align: 'end', behavior: 'auto' });
      };

      // Multiple scroll attempts to ensure we catch virtualizer updates
      requestAnimationFrame(doScroll);
      setTimeout(doScroll, 50);
      setTimeout(doScroll, 150);
    }
  }, [contentHash, displayMessages.length, virtualizer]);

  // Continuous auto-scroll during streaming/thinking
  useEffect(() => {
    if (!isStreaming && !showThinking) return;
    if (userHasScrolledRef.current) return;

    const scrollInterval = setInterval(() => {
      if (userHasScrolledRef.current) {
        clearInterval(scrollInterval);
        return;
      }
      if (!parentRef.current || displayMessages.length === 0) return;

      const lastIndex = displayMessages.length - 1;
      virtualizer.scrollToIndex(lastIndex, { align: 'end', behavior: 'auto' });
    }, 200);

    return () => clearInterval(scrollInterval);
  }, [isStreaming, showThinking, displayMessages.length, virtualizer]);
  
  // Memoize virtual items to prevent re-renders
  const virtualItems = virtualizer.getVirtualItems();
  
  return (
    <div
      ref={parentRef}
      className={`messages-virtualized ${className}`}
      onScroll={handleScroll}
      style={{
        height: '100%',
        overflowY: 'scroll',
        overflowX: 'hidden',
        overscrollBehavior: 'contain',
        position: 'relative',
        flex: 1,
        paddingLeft: '4px',
        paddingRight: 0,
        maxWidth: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          maxWidth: '100%', // Ensure child doesn't exceed parent
          position: 'relative',
          paddingRight: '8px',
          boxSizing: 'border-box',
          overflowX: 'hidden', // Prevent child overflow
        }}
      >
        {virtualItems.map((virtualItem) => {
          const message = displayMessages[virtualItem.index];
          if (!message) return null;
          
          // Render thinking indicator
          if (message.type === 'thinking') {
            return (
              <div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  maxWidth: '100%',
                  transform: `translateY(${virtualItem.start}px)`,
                  boxSizing: 'border-box',
                }}
              >
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
                        {thinkingElapsed > 0 && (
                          <span className="thinking-timer">{thinkingElapsed}s</span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          }
          
          const isLastStreaming = isStreaming && 
            lastAssistantMessageIds.includes(message.id);
          
          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                maxWidth: '100%',
                transform: `translateY(${virtualItem.start}px)`,
                boxSizing: 'border-box',
              }}
            >
              <MessageRenderer
                message={message}
                sessionId={sessionId}
                isStreaming={isLastStreaming}
                isLast={virtualItem.index === displayMessages.length - 1 && !showThinking}
                thinkingFor={0}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
});

VirtualizedMessageList.displayName = 'VirtualizedMessageList';