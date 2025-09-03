import { useVirtualizer } from '@tanstack/react-virtual';
import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { MessageRenderer } from './MessageRenderer';

interface VirtualizedMessageListProps {
  messages: any[];
  sessionId: string;
  className?: string;
  isStreaming?: boolean;
  lastAssistantMessageIds?: string[];
}

export const VirtualizedMessageList: React.FC<VirtualizedMessageListProps> = ({
  messages,
  sessionId,
  className = '',
  isStreaming = false,
  lastAssistantMessageIds = []
}) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const scrollingRef = useRef(false);
  const lastMessageCountRef = useRef(messages.length);
  
  // Estimate message heights based on content
  const estimateSize = useCallback((index: number) => {
    const msg = messages[index];
    if (!msg) return 100;
    
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
  }, [messages]);
  
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize,
    overscan: 5, // Render 5 items outside viewport for smoother scrolling
    getItemKey: useCallback((index: number) => {
      const msg = messages[index];
      return msg?.id || `msg-${index}`;
    }, [messages]),
  });
  
  // Auto-scroll to bottom on new messages (only if user hasn't scrolled up)
  useEffect(() => {
    if (!scrollingRef.current && messages.length > 0) {
      // Only auto-scroll if a new message was added
      if (messages.length > lastMessageCountRef.current) {
        virtualizer.scrollToIndex(messages.length - 1, {
          behavior: 'smooth',
          align: 'end',
        });
      }
      lastMessageCountRef.current = messages.length;
    }
  }, [messages.length, virtualizer]);
  
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
      }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualItem) => {
          const message = messages[virtualItem.index];
          if (!message) return null;
          
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
                isLast={virtualItem.index === messages.length - 1}
                thinkingFor={0}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};