import { useVirtualizer } from '@tanstack/react-virtual';
import React, { useRef, useEffect, useCallback, useMemo } from 'react';
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

export const VirtualizedMessageList: React.FC<VirtualizedMessageListProps> = ({
  messages,
  sessionId,
  className = '',
  isStreaming = false,
  lastAssistantMessageIds = [],
  showThinking = false,
  thinkingElapsed = 0
}) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const scrollingRef = useRef(false);
  const lastMessageCountRef = useRef(messages.length);
  
  // Add thinking message if streaming
  const displayMessages = useMemo(() => {
    if (showThinking) {
      return [...messages, { type: 'thinking', id: 'thinking-indicator' }];
    }
    return messages;
  }, [messages, showThinking]);
  
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
  
  // Auto-scroll to bottom on new messages (only if user hasn't scrolled up)
  useEffect(() => {
    if (!scrollingRef.current && displayMessages.length > 0) {
      // Only auto-scroll if a new message was added
      if (displayMessages.length > lastMessageCountRef.current) {
        virtualizer.scrollToIndex(displayMessages.length - 1, {
          behavior: 'smooth',
          align: 'end',
        });
      }
      lastMessageCountRef.current = displayMessages.length;
    }
  }, [displayMessages.length, virtualizer]);
  
  // Detect manual scrolling
  const handleScroll = useCallback(() => {
    if (!parentRef.current) return;
    
    const { scrollTop, scrollHeight, clientHeight } = parentRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    
    // User is scrolling if not near bottom
    scrollingRef.current = !isNearBottom;
  }, []);
  
  // Reset scroll lock when user scrolls to bottom manually
  useEffect(() => {
    const handleScrollToBottom = () => {
      if (!parentRef.current) return;
      const { scrollTop, scrollHeight, clientHeight } = parentRef.current;
      if (scrollHeight - scrollTop - clientHeight < 10) {
        scrollingRef.current = false;
      }
    };
    
    const element = parentRef.current;
    element?.addEventListener('scroll', handleScrollToBottom);
    return () => element?.removeEventListener('scroll', handleScrollToBottom);
  }, []);
  
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
        position: 'relative',
        flex: 1,
        paddingRight: 0,
      }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
          paddingRight: '8px',
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
                  transform: `translateY(${virtualItem.start}px)`,
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
                transform: `translateY(${virtualItem.start}px)`,
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
};