import { useVirtualizer } from '@tanstack/react-virtual';
import React, { useRef, useEffect, useLayoutEffect, useCallback, useMemo, useImperativeHandle, forwardRef } from 'react';
import { MessageRenderer } from './MessageRenderer';
import { LoadingIndicator } from '../LoadingIndicator/LoadingIndicator';

// Pre-computed thinking characters to avoid splitting on every render
const THINKING_CHARS = 'thinking'.split('');

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
  const pendingScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAutoScrollingRef = useRef(false); // Track when we're auto-scrolling (to ignore in handleScroll)
  const streamingScrollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const followUpScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cooldown period after user scrolls up (don't auto-scroll for this long)
  // Set to 0 to disable cooldown - always auto-scroll when assistant is responding
  const SCROLL_COOLDOWN_MS = 0;

  // Add thinking message if streaming
  const displayMessages = useMemo(() => {
    if (showThinking) {
      return [...messages, { type: 'thinking', id: 'thinking-indicator' }];
    }
    return messages;
  }, [messages, showThinking]);

  // Create a simple hash of message content to detect changes
  // Uses count + last message ID + streaming state instead of JSON.stringify for performance
  const contentHash = useMemo(() => {
    const lastMsg = displayMessages[displayMessages.length - 1];
    const lastId = lastMsg?.id || '';
    const lastLen = lastMsg?.content?.length || lastMsg?.text?.length || 0;
    const isStreaming = lastMsg?.streaming ? 1 : 0;
    const thinkingState = showThinking ? 1 : 0;
    return `${displayMessages.length}:${lastId}:${lastLen}:${isStreaming}:${thinkingState}`;
  }, [displayMessages, showThinking]);

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

  // Scroll to true bottom with follow-up to catch late-rendering content
  // Uses a delayed second scroll to handle virtualizer remeasurement
  const scrollToTrueBottom = useCallback((behavior: 'auto' | 'smooth' = 'auto') => {
    if (!parentRef.current || displayMessages.length === 0) return;

    const doScroll = () => {
      if (!parentRef.current) return;
      const { scrollHeight, clientHeight } = parentRef.current;
      parentRef.current.scrollTop = scrollHeight - clientHeight;
    };

    // Scroll immediately
    doScroll();

    // Clear any pending follow-up scroll
    if (followUpScrollTimeoutRef.current) {
      clearTimeout(followUpScrollTimeoutRef.current);
    }

    // Follow-up scroll after virtualizer has had time to remeasure
    // This catches content that rendered after the initial scroll
    followUpScrollTimeoutRef.current = setTimeout(() => {
      doScroll();
      followUpScrollTimeoutRef.current = null;
    }, 50);
  }, [displayMessages.length]);

  // Check if we're in cooldown period after user scroll
  const isInScrollCooldown = useCallback(() => {
    if (!userHasScrolledRef.current) return false;
    const elapsed = Date.now() - userScrolledAtRef.current;
    return elapsed < SCROLL_COOLDOWN_MS;
  }, [SCROLL_COOLDOWN_MS]);

  // Scroll to bottom function - respects user scroll cooldown
  const scrollToBottom = useCallback((behavior: 'auto' | 'smooth' = 'auto') => {
    if (!parentRef.current || displayMessages.length === 0) return;

    // Don't force scroll if user has manually scrolled up (with cooldown)
    if (userHasScrolledRef.current && isInScrollCooldown()) return;

    scrollToTrueBottom(behavior);
  }, [displayMessages.length, isInScrollCooldown, scrollToTrueBottom]);

  // Track last scroll position to detect scroll direction
  const lastScrollTopRef = useRef(0);

  // Update isAtBottom on scroll and detect user scrolling
  const handleScroll = useCallback(() => {
    if (!parentRef.current) return;

    // Ignore scroll events triggered by our auto-scroll
    if (isAutoScrollingRef.current) return;

    const currentScrollTop = parentRef.current.scrollTop;
    const scrollingUp = currentScrollTop < lastScrollTopRef.current;
    const scrollDelta = Math.abs(currentScrollTop - lastScrollTopRef.current);
    lastScrollTopRef.current = currentScrollTop;

    const atBottom = checkIfAtBottom();
    isAtBottomRef.current = atBottom;

    // Mark as user scroll if scrolling UP at all and we're not at the bottom
    // Even 1px upward scroll should stop auto-scroll immediately
    if (scrollingUp && !atBottom) {
      userHasScrolledRef.current = true;
      userScrolledAtRef.current = Date.now();
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
      isAutoScrollingRef.current = true;
      scrollToTrueBottom(behavior);
      setTimeout(() => { isAutoScrollingRef.current = false; }, 100);
    },
    isAtBottom: () => checkIfAtBottom(),
    forceScrollToBottom: (behavior: 'auto' | 'smooth' = 'auto') => {
      // Force scroll and reset user scroll flag (for user-initiated actions like sending a message)
      userHasScrolledRef.current = false;
      userScrolledAtRef.current = 0;
      isAutoScrollingRef.current = true;
      if (!parentRef.current || displayMessages.length === 0) return;
      scrollToTrueBottom(behavior);
      setTimeout(() => { isAutoScrollingRef.current = false; }, 100);
    },
  }), [displayMessages.length, checkIfAtBottom, SCROLL_COOLDOWN_MS, scrollToTrueBottom]);

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

  // Robust auto-scroll function that sets the flag to prevent handleScroll interference
  const performAutoScroll = useCallback(() => {
    if (!parentRef.current || displayMessages.length === 0 || userHasScrolledRef.current) return;

    isAutoScrollingRef.current = true;
    scrollToTrueBottom('auto');

    // Reset the flag after scroll completes
    setTimeout(() => {
      isAutoScrollingRef.current = false;
    }, 100);
  }, [displayMessages.length, scrollToTrueBottom]);

  // Track previous showThinking state to detect when it becomes true
  const prevShowThinkingRef = useRef(showThinking);
  useLayoutEffect(() => {
    const wasNotThinking = !prevShowThinkingRef.current;
    const isNowThinking = showThinking;
    prevShowThinkingRef.current = showThinking;

    // When thinking indicator appears and user was at bottom, ensure we scroll to it
    if (wasNotThinking && isNowThinking && !userHasScrolledRef.current && displayMessages.length > 0) {
      performAutoScroll();
    }
  }, [showThinking, displayMessages.length, performAutoScroll]);

  // Auto-scroll to bottom when content changes - ONLY if user hasn't manually scrolled up
  // Single scroll call - no retries to prevent flicker
  useLayoutEffect(() => {
    const contentChanged = contentHash !== lastContentHashRef.current;
    lastContentHashRef.current = contentHash;

    if (!contentChanged || displayMessages.length === 0) return;

    // Only auto-scroll if user hasn't manually scrolled up
    if (!userHasScrolledRef.current) {
      performAutoScroll();
    }
  }, [contentHash, displayMessages.length, performAutoScroll]);

  // Interval-based scroll during streaming/thinking - SMART bottom sticking
  // Only scrolls when significantly away from bottom to prevent flicker
  useEffect(() => {
    const shouldPoll = (isStreaming || showThinking) && !userHasScrolledRef.current;

    if (shouldPoll) {
      // Start interval for continuous scroll during streaming
      streamingScrollIntervalRef.current = setInterval(() => {
        if (!parentRef.current || userHasScrolledRef.current) return;

        const { scrollHeight, clientHeight, scrollTop } = parentRef.current;
        const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

        // Always scroll to bottom when streaming (aggressive auto-scroll for better UX)
        // Reduced threshold to 5px for immediate scrolling
        if (distanceFromBottom > 5) {
          isAutoScrollingRef.current = true;
          parentRef.current.scrollTop = scrollHeight - clientHeight;
          isAutoScrollingRef.current = false;
        }
      }, 100); // 100ms for faster, more responsive scrolling
    }

    return () => {
      if (streamingScrollIntervalRef.current) {
        clearInterval(streamingScrollIntervalRef.current);
        streamingScrollIntervalRef.current = null;
      }
    };
  }, [isStreaming, showThinking]);

  // Cleanup pending scroll on unmount
  useEffect(() => {
    return () => {
      if (pendingScrollTimeoutRef.current) {
        clearTimeout(pendingScrollTimeoutRef.current);
      }
      if (streamingScrollIntervalRef.current) {
        clearInterval(streamingScrollIntervalRef.current);
      }
      if (followUpScrollTimeoutRef.current) {
        clearTimeout(followUpScrollTimeoutRef.current);
      }
    };
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
        overflowY: 'scroll',
        overflowX: 'hidden',
        overscrollBehavior: 'contain',
        position: 'relative',
        flex: 1,
        paddingLeft: '4px',
        paddingRight: 0,
        maxWidth: '100%',
        boxSizing: 'border-box',
        // Isolation from external layout - rely on CSS for containment
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
          // GPU acceleration and containment to prevent layout thrashing
          contain: 'layout style',
          willChange: 'contents',
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
                          {THINKING_CHARS.map((char, i) => (
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