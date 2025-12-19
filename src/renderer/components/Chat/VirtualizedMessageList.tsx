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
}

export interface VirtualizedMessageListRef {
  scrollToBottom: (behavior?: 'auto' | 'smooth') => void;
  isAtBottom: () => boolean;
}

export const VirtualizedMessageList = forwardRef<VirtualizedMessageListRef, VirtualizedMessageListProps>(({
  messages,
  sessionId,
  className = '',
  isStreaming = false,
  lastAssistantMessageIds = [],
  showThinking = false,
  thinkingElapsed = 0
}, ref) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const lastContentHashRef = useRef('');
  const userHasScrolledRef = useRef(false); // Track if user has manually scrolled
  const previousMessageCountRef = useRef(0);
  const scrollToBottomRequestedRef = useRef(false);

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

  // Check if we're at bottom - more reliable with smaller threshold
  const checkIfAtBottom = useCallback(() => {
    if (!parentRef.current) return false;
    const { scrollTop, scrollHeight, clientHeight } = parentRef.current;
    // Use 10px threshold for more reliable detection
    return scrollHeight - scrollTop - clientHeight < 10;
  }, []);

  // Scroll to bottom function using virtualizer API
  const scrollToBottom = useCallback((behavior: 'auto' | 'smooth' = 'auto') => {
    if (!parentRef.current || displayMessages.length === 0) return;

    const lastIndex = displayMessages.length - 1;

    // Use the virtualizer's scrollToIndex for proper virtual scrolling
    virtualizer.scrollToIndex(lastIndex, {
      align: 'end',
      behavior: behavior === 'smooth' ? 'smooth' : 'auto',
    });

    // Mark that we requested scroll to bottom
    scrollToBottomRequestedRef.current = true;

    // Fallback: directly set scrollTop as well to ensure we're at bottom
    // This helps in edge cases where scrollToIndex might not fully scroll
    requestAnimationFrame(() => {
      if (parentRef.current) {
        parentRef.current.scrollTop = parentRef.current.scrollHeight;

        // Double-check after virtualizer has time to measure
        setTimeout(() => {
          if (parentRef.current && scrollToBottomRequestedRef.current) {
            parentRef.current.scrollTop = parentRef.current.scrollHeight;
            scrollToBottomRequestedRef.current = false;
          }
        }, 100);
      }
    });
  }, [displayMessages.length, virtualizer]);

  // Update isAtBottom on scroll and detect user scrolling
  const handleScroll = useCallback(() => {
    const atBottom = checkIfAtBottom();
    const wasAtBottom = isAtBottomRef.current;
    isAtBottomRef.current = atBottom;

    // If user scrolls up from bottom, mark that they've manually scrolled
    if (wasAtBottom && !atBottom) {
      userHasScrolledRef.current = true;
    }

    // If user scrolls back to bottom, clear the manual scroll flag
    if (atBottom) {
      userHasScrolledRef.current = false;
    }
  }, [checkIfAtBottom]);

  // Expose scroll methods to parent components
  useImperativeHandle(ref, () => ({
    scrollToBottom: (behavior: 'auto' | 'smooth' = 'auto') => {
      scrollToBottom(behavior);
    },
    isAtBottom: () => checkIfAtBottom(),
  }), [scrollToBottom, checkIfAtBottom]);

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

  // Auto-scroll to bottom when content changes
  useEffect(() => {
    const contentChanged = contentHash !== lastContentHashRef.current;
    lastContentHashRef.current = contentHash;

    if (!contentChanged || displayMessages.length === 0) return;

    // Always scroll if user hasn't manually scrolled up, OR if we're at bottom
    const shouldAutoScroll = !userHasScrolledRef.current || isAtBottomRef.current;

    if (shouldAutoScroll) {
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        scrollToBottom('auto');
      });
    }
  }, [contentHash, displayMessages.length, scrollToBottom]);
  
  // Memoize virtual items to prevent re-renders
  const virtualItems = virtualizer.getVirtualItems();
  
  return (
    <div
      ref={parentRef}
      className={`messages-virtualized ${className}`}
      onScroll={handleScroll}
      style={{
        height: '100%',
        overflow: 'auto',
        overflowX: 'hidden', // Prevent horizontal scroll
        position: 'relative',
        flex: 1,
        paddingLeft: '4px', // Match parent's padding
        paddingRight: 0,
        maxWidth: '100%', // Constrain to container width
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
                  overflowX: 'hidden',
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
                overflowX: 'hidden',
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