import { useVirtualizer, VirtualItem } from '@tanstack/react-virtual';
import React, { useRef, useEffect, useLayoutEffect, useCallback, useMemo, useImperativeHandle, forwardRef, memo } from 'react';
import { MessageRenderer } from './MessageRenderer';
import { LoadingIndicator } from '../LoadingIndicator/LoadingIndicator';

// Self-updating timer component - manages its own interval to bypass parent memo
// Exported for use in ClaudeChat bottom bar
export const ThinkingTimer = ({ startTime }: { startTime: number }) => {
  const [elapsed, setElapsed] = React.useState(() =>
    Math.floor((Date.now() - startTime) / 1000)
  );

  React.useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  if (elapsed <= 0) return null;

  return (
    <span className="thinking-timer">
      {elapsed >= 60
        ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
        : `${elapsed}s`}
    </span>
  );
};

// Self-updating bash timer component
export const BashTimer = ({ startTime }: { startTime: number }) => {
  const [elapsed, setElapsed] = React.useState(() =>
    Math.floor((Date.now() - startTime) / 1000)
  );

  React.useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  if (elapsed <= 0) return null;

  return (
    <span className="bash-timer">
      {elapsed >= 60
        ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
        : `${elapsed}s`}
    </span>
  );
};

// Self-updating compacting timer component
export const CompactingTimer = ({ startTime }: { startTime: number }) => {
  const [elapsed, setElapsed] = React.useState(() =>
    Math.floor((Date.now() - startTime) / 1000)
  );

  React.useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  if (elapsed <= 0) return null;

  return (
    <span className="compacting-timer">
      {elapsed >= 60
        ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
        : `${elapsed}s`}
    </span>
  );
};

// Tool action labels for the thinking indicator
const TOOL_ACTION_LABELS: Record<string, string> = {
  'Read': 'reading',
  'Write': 'writing',
  'Edit': 'editing',
  'MultiEdit': 'editing',
  'Bash': 'running',
  'Grep': 'searching',
  'Glob': 'finding',
  'LS': 'listing',
  'WebSearch': 'searching',
  'WebFetch': 'fetching',
  'Task': 'delegating',
  'TodoWrite': 'planning',
  'NotebookEdit': 'editing',
};

// Pre-computed thinking characters to avoid splitting on every render
const THINKING_CHARS = 'thinking'.split('');
const COMPACTING_CHARS = 'compacting'.split('');
const BASH_RUNNING_CHARS = 'bash running'.split('');

// Memoized virtual item wrapper to prevent DOM recreation during streaming
// This is CRITICAL for maintaining text selection during updates
const VirtualItemWrapper = memo(({
  virtualItem,
  children,
  measureElement
}: {
  virtualItem: VirtualItem;
  children: React.ReactNode;
  measureElement: (el: HTMLElement | null) => void;
}) => {
  return (
    <div
      data-index={virtualItem.index}
      ref={measureElement}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        maxWidth: '100%',
        // Use translate3d for GPU acceleration - prevents flicker during scroll
        transform: `translate3d(0, ${virtualItem.start}px, 0)`,
        boxSizing: 'border-box',
        // GPU compositing hints - critical for smooth scrolling
        willChange: 'transform',
        backfaceVisibility: 'hidden',
        // Isolate paint to prevent affecting siblings
        contain: 'layout paint',
      }}
    >
      {children}
    </div>
  );
}, (prev, next) => {
  // Only re-render wrapper if position changes
  // Children re-render is handled by their own memo
  return prev.virtualItem.index === next.virtualItem.index &&
    prev.virtualItem.start === next.virtualItem.start &&
    prev.virtualItem.size === next.virtualItem.size;
});

interface VirtualizedMessageListProps {
  messages: any[];
  sessionId: string;
  className?: string;
  isStreaming?: boolean;
  lastAssistantMessageIds?: string[];
  showThinking?: boolean;
  thinkingStartTime?: number;
  activityLabel?: string; // Dynamic label for thinking indicator (e.g., "thinking", "reading", "editing")
  showBash?: boolean;
  showUserBash?: boolean;
  bashStartTime?: number;
  showCompacting?: boolean;
  compactingStartTime?: number;
  compactingFollowupMessage?: string;
  pendingFollowup?: { content: string } | null;
  onScrollStateChange?: (isAtBottom: boolean) => void;
  searchQuery?: string;
  searchMatches?: number[];
  searchIndex?: number;
}

export interface VirtualizedMessageListRef {
  scrollToBottom: (behavior?: 'auto' | 'smooth') => void;
  isAtBottom: () => boolean;
  forceScrollToBottom: (behavior?: 'auto' | 'smooth') => void;
  scrollToIndex: (index: number, behavior?: 'auto' | 'smooth') => void;
}

export const VirtualizedMessageList = forwardRef<VirtualizedMessageListRef, VirtualizedMessageListProps>(({
  messages,
  sessionId,
  className = '',
  isStreaming = false,
  lastAssistantMessageIds = [],
  showThinking = false,
  thinkingStartTime,
  activityLabel = 'thinking',
  showBash = false,
  showUserBash = false,
  bashStartTime,
  showCompacting = false,
  compactingStartTime,
  compactingFollowupMessage,
  pendingFollowup = null,
  onScrollStateChange,
  searchQuery = '',
  searchMatches = [],
  searchIndex = 0
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
  const followUpScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Scroll anchoring refs - used to maintain position when user has scrolled up
  const scrollAnchorRef = useRef<{ index: number; offset: number } | null>(null);

  // CRITICAL: Store messages in ref for stable callbacks - prevents virtualizer recreation
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Cooldown period after user scrolls up (don't auto-scroll for this long)
  // Set to 0 to disable cooldown - always auto-scroll when assistant is responding
  const SCROLL_COOLDOWN_MS = 0;

  // Detect if user has active text selection within our container
  // This prevents scroll actions from disrupting text selection
  const hasActiveSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return false;

    try {
      const range = selection.getRangeAt(0);
      return parentRef.current?.contains(range.commonAncestorContainer) ?? false;
    } catch {
      return false;
    }
  }, []);

  // Add thinking/bash/compacting/followup indicator message if streaming
  const displayMessages = useMemo(() => {
    const result = [...messages];
    // Show compacting indicator (takes priority)
    if (showCompacting) {
      result.push({ type: 'compacting-indicator', id: 'compacting-indicator', followupMessage: compactingFollowupMessage });
    } else if (showBash || showUserBash) {
      // Show bash indicator if running bash (takes priority over thinking)
      result.push({ type: 'bash-indicator', id: 'bash-indicator' });
    } else if (showThinking) {
      result.push({ type: 'thinking', id: 'thinking-indicator' });
    }
    // Add followup indicator if there's a pending followup
    if (pendingFollowup) {
      result.push({ type: 'followup-indicator', id: 'followup-indicator', content: pendingFollowup.content });
    }
    return result;
  }, [messages, showThinking, showBash, showUserBash, showCompacting, compactingFollowupMessage, pendingFollowup]);

  // Create a simple hash of message content to detect changes
  // Uses count + last message ID + streaming state instead of JSON.stringify for performance
  const contentHash = useMemo(() => {
    const lastMsg = displayMessages[displayMessages.length - 1];
    const lastId = lastMsg?.id || '';
    const lastLen = lastMsg?.content?.length || lastMsg?.text?.length || 0;
    const isStreaming = lastMsg?.streaming ? 1 : 0;
    const thinkingState = showThinking ? 1 : 0;
    const bashState = (showBash || showUserBash) ? 1 : 0;
    const compactingState = showCompacting ? 1 : 0;
    const followupState = pendingFollowup ? 1 : 0;
    return `${displayMessages.length}:${lastId}:${lastLen}:${isStreaming}:${thinkingState}:${bashState}:${compactingState}:${followupState}`;
  }, [displayMessages, showThinking, showBash, showUserBash, showCompacting, pendingFollowup]);

  // CRITICAL: Stable estimateSize using ref - prevents virtualizer recreation during streaming
  // Using ref instead of displayMessages in dependency array avoids callback recreation
  const estimateSize = useCallback((index: number) => {
    // Access via ref for stable reference
    const result = [...messagesRef.current];
    if (showCompacting) {
      result.push({ type: 'compacting-indicator', id: 'compacting-indicator' });
    } else if (showBash || showUserBash) {
      result.push({ type: 'bash-indicator', id: 'bash-indicator' });
    } else if (showThinking) {
      result.push({ type: 'thinking', id: 'thinking-indicator' });
    }
    if (pendingFollowup) {
      result.push({ type: 'followup-indicator', id: 'followup-indicator' });
    }
    const msg = result[index];
    if (!msg) return 100;

    // Thinking/bash/compacting/followup indicator has fixed height
    if (msg.type === 'thinking' || msg.type === 'bash-indicator' || msg.type === 'compacting-indicator' || msg.type === 'followup-indicator') {
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
  }, [showThinking, showBash, showUserBash, pendingFollowup]); // Depends on indicator states

  const virtualizer = useVirtualizer({
    count: displayMessages.length,
    getScrollElement: () => parentRef.current,
    estimateSize,
    overscan: 12, // Render 12 items outside viewport - balanced buffering
    // Stable getItemKey using ref - prevents recreation during streaming
    getItemKey: useCallback((index: number) => {
      const result = [...messagesRef.current];
      if (showBash || showUserBash) {
        result.push({ type: 'bash-indicator', id: 'bash-indicator' });
      } else if (showThinking) {
        result.push({ type: 'thinking', id: 'thinking-indicator' });
      }
      if (pendingFollowup) {
        result.push({ type: 'followup-indicator', id: 'followup-indicator' });
      }
      const msg = result[index];
      return msg?.id || `msg-${index}`;
    }, [showThinking, showBash, showUserBash, pendingFollowup]),
  });

  // Check if we're at bottom - uses different thresholds for different purposes
  const checkIfAtBottom = useCallback((threshold = 50) => {
    if (!parentRef.current) return false;
    const { scrollTop, scrollHeight, clientHeight } = parentRef.current;
    return scrollHeight - scrollTop - clientHeight < threshold;
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

  // Capture scroll anchor - which item is at the top of the viewport
  const captureScrollAnchor = useCallback(() => {
    if (!parentRef.current) return;
    const virtualItems = virtualizer.getVirtualItems();
    if (virtualItems.length === 0) return;

    const scrollTop = parentRef.current.scrollTop;

    // Find the first visible item
    for (const item of virtualItems) {
      if (item.start + item.size > scrollTop) {
        // This item is at least partially visible at the top
        scrollAnchorRef.current = {
          index: item.index,
          offset: scrollTop - item.start, // how far into this item we've scrolled
        };
        break;
      }
    }
  }, [virtualizer]);

  // Update isAtBottom on scroll and detect user scrolling
  const handleScroll = useCallback(() => {
    if (!parentRef.current) return;

    const currentScrollTop = parentRef.current.scrollTop;
    const scrollingUp = currentScrollTop < lastScrollTopRef.current;
    const scrollDelta = Math.abs(currentScrollTop - lastScrollTopRef.current);
    lastScrollTopRef.current = currentScrollTop;

    // CRITICAL: Detect user scroll BEFORE checking isAutoScrollingRef
    // This ensures any scroll up is detected even during auto-scroll periods
    // Use 1px threshold for unstick - ANY scroll up should unstick immediately
    const atBottomForUnstick = checkIfAtBottom(1);

    // If scrolling UP by any amount and not at very bottom, mark as user scroll
    // This takes priority over auto-scroll detection
    if (scrollingUp && scrollDelta > 0 && !atBottomForUnstick) {
      userHasScrolledRef.current = true;
      userScrolledAtRef.current = Date.now();
      // Capture which item we're looking at for scroll anchoring
      captureScrollAnchor();
      onScrollStateChange?.(false);
      return; // Don't process further - user has taken control
    }

    // Keep anchor updated while user is scrolled up (for any scroll movement)
    if (userHasScrolledRef.current && scrollDelta > 0) {
      captureScrollAnchor();
    }

    // For auto-scroll events, skip the rest of processing
    if (isAutoScrollingRef.current) return;

    // Use larger threshold (50px) for "at bottom" state reporting
    const atBottomForState = checkIfAtBottom(50);
    isAtBottomRef.current = atBottomForState;

    // If user scrolls back to bottom, clear the manual scroll flag and anchor
    if (atBottomForState) {
      userHasScrolledRef.current = false;
      userScrolledAtRef.current = 0;
      scrollAnchorRef.current = null;
      onScrollStateChange?.(true);
    }
  }, [checkIfAtBottom, onScrollStateChange, captureScrollAnchor]);

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
      scrollAnchorRef.current = null;
      isAutoScrollingRef.current = true;
      if (!parentRef.current || displayMessages.length === 0) return;
      scrollToTrueBottom(behavior);
      setTimeout(() => { isAutoScrollingRef.current = false; }, 100);
    },
    scrollToIndex: (index: number, behavior: 'auto' | 'smooth' = 'smooth') => {
      if (index < 0 || index >= displayMessages.length) return;
      // Use virtualizer's scrollToIndex for proper virtualized scrolling
      virtualizer.scrollToIndex(index, { align: 'center', behavior });
    },
  }), [displayMessages.length, checkIfAtBottom, SCROLL_COOLDOWN_MS, scrollToTrueBottom, virtualizer]);

  // Reset user scroll flag when starting a new chat or message count increases from 0
  useEffect(() => {
    const messageCount = displayMessages.length;

    // If this is a new chat (going from 0 to >0 messages), reset scroll tracking
    if (previousMessageCountRef.current === 0 && messageCount > 0) {
      userHasScrolledRef.current = false;
      isAtBottomRef.current = true;
      scrollAnchorRef.current = null;
    }

    previousMessageCountRef.current = messageCount;
  }, [displayMessages.length]);

  // Robust auto-scroll function that sets the flag to prevent handleScroll interference
  const performAutoScroll = useCallback(() => {
    if (!parentRef.current || displayMessages.length === 0 || userHasScrolledRef.current) return;

    // CRITICAL: Don't auto-scroll if user is selecting text
    if (hasActiveSelection()) return;

    isAutoScrollingRef.current = true;
    scrollToTrueBottom('auto');

    // Reset the flag after scroll completes
    setTimeout(() => {
      isAutoScrollingRef.current = false;
    }, 100);
  }, [displayMessages.length, scrollToTrueBottom, hasActiveSelection]);

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

  // Track last content hash for scroll anchoring - only anchor on actual content changes
  const lastAnchorContentHashRef = useRef('');

  // CRITICAL: Scroll anchoring - maintain position when user has scrolled up
  // Only restore anchor when NEW CONTENT arrives (contentHash changes), not during normal remeasurement
  useLayoutEffect(() => {
    if (!parentRef.current || !userHasScrolledRef.current || !scrollAnchorRef.current) return;

    // Only process if content actually changed (new message, not just remeasurement)
    if (contentHash === lastAnchorContentHashRef.current) return;
    lastAnchorContentHashRef.current = contentHash;

    const anchor = scrollAnchorRef.current;

    // Use requestAnimationFrame to batch with browser paint cycle - prevents flicker
    requestAnimationFrame(() => {
      if (!parentRef.current || !scrollAnchorRef.current) return;

      // Re-check anchor is still valid (user might have scrolled back to bottom)
      if (!userHasScrolledRef.current) return;

      // Find the current position of the anchored item
      const virtualItems = virtualizer.getVirtualItems();
      const anchorItem = virtualItems.find(item => item.index === anchor.index);

      if (anchorItem) {
        // Restore scroll to keep the same item at the same position
        const newScrollTop = anchorItem.start + anchor.offset;
        const currentScrollTop = parentRef.current!.scrollTop;

        // Only adjust if there's a meaningful difference (> 2px) to avoid micro-jitters
        if (Math.abs(newScrollTop - currentScrollTop) > 2) {
          isAutoScrollingRef.current = true;
          parentRef.current!.scrollTop = newScrollTop;
          setTimeout(() => { isAutoScrollingRef.current = false; }, 50);
        }
      }
    });
  }, [virtualizer, contentHash]);

  // RAF-based scroll during streaming/thinking - syncs with browser paint cycle for zero flicker
  // Uses requestAnimationFrame instead of setInterval for smoother operation
  const rafIdRef = useRef<number | null>(null);
  const lastRafScrollTimeRef = useRef(0);

  useEffect(() => {
    if (isStreaming || showThinking) {
      const scrollLoop = () => {
        // Check if we should continue
        if (!parentRef.current) {
          rafIdRef.current = requestAnimationFrame(scrollLoop);
          return;
        }

        // Skip if user has manually scrolled up
        if (userHasScrolledRef.current) {
          rafIdRef.current = requestAnimationFrame(scrollLoop);
          return;
        }

        // Skip if user is selecting text
        if (hasActiveSelection()) {
          rafIdRef.current = requestAnimationFrame(scrollLoop);
          return;
        }

        // Throttle to ~30fps (every 33ms) to avoid excessive scroll operations
        const now = performance.now();
        if (now - lastRafScrollTimeRef.current < 33) {
          rafIdRef.current = requestAnimationFrame(scrollLoop);
          return;
        }
        lastRafScrollTimeRef.current = now;

        const { scrollHeight, clientHeight, scrollTop } = parentRef.current;
        const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

        // Only scroll if not already at bottom (5px threshold)
        if (distanceFromBottom > 5) {
          isAutoScrollingRef.current = true;
          parentRef.current.scrollTop = scrollHeight - clientHeight;
          // Reset flag on next frame
          requestAnimationFrame(() => {
            isAutoScrollingRef.current = false;
          });
        }

        // Continue the loop while streaming
        rafIdRef.current = requestAnimationFrame(scrollLoop);
      };

      // Start the RAF loop
      rafIdRef.current = requestAnimationFrame(scrollLoop);
    }

    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [isStreaming, showThinking, hasActiveSelection]);

  // Cleanup pending scroll on unmount
  useEffect(() => {
    return () => {
      if (pendingScrollTimeoutRef.current) {
        clearTimeout(pendingScrollTimeoutRef.current);
      }
      if (followUpScrollTimeoutRef.current) {
        clearTimeout(followUpScrollTimeoutRef.current);
      }
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
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
          // Use minHeight instead of height to prevent shrinking during remeasurement
          // This eliminates flicker when item sizes change
          minHeight: `${virtualizer.getTotalSize()}px`,
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          maxWidth: '100%', // Ensure child doesn't exceed parent
          position: 'relative',
          paddingRight: '8px',
          boxSizing: 'border-box',
          overflowX: 'hidden', // Prevent child overflow
          // Use 'paint' containment instead of 'layout style' to preserve text selection
          contain: 'paint',
        }}
      >
        {virtualItems.map((virtualItem) => {
          const message = displayMessages[virtualItem.index];
          if (!message) return null;

          // Render compacting indicator
          if (message.type === 'compacting-indicator') {
            return (
              <VirtualItemWrapper
                key={virtualItem.key}
                virtualItem={virtualItem}
                measureElement={virtualizer.measureElement}
              >
                <div className="message assistant">
                  <div className="message-content">
                    <div className="compacting-indicator-bottom">
                      <LoadingIndicator size="small" color="positive" />
                      <span className="compacting-text-wrapper">
                        <span className="compacting-text">
                          {COMPACTING_CHARS.map((char, i) => (
                            <span
                              key={i}
                              className="compacting-char"
                              style={{
                                animationDelay: `${i * 0.05}s`
                              }}
                            >
                              {char}
                            </span>
                          ))}
                          <span className="compacting-dots"></span>
                        </span>
                        {compactingStartTime && <CompactingTimer startTime={compactingStartTime} />}
                      </span>
                      {message.followupMessage && (
                        <span className="compacting-followup">
                          <span className="compacting-followup-label">then:</span>
                          <span className="compacting-followup-message">
                            {message.followupMessage.slice(0, 50)}
                            {message.followupMessage.length > 50 ? '...' : ''}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </VirtualItemWrapper>
            );
          }

          // Render bash indicator
          if (message.type === 'bash-indicator') {
            return (
              <VirtualItemWrapper
                key={virtualItem.key}
                virtualItem={virtualItem}
                measureElement={virtualizer.measureElement}
              >
                <div className="message assistant">
                  <div className="message-content">
                    <div className="bash-indicator-bottom">
                      <LoadingIndicator size="small" color="negative" />
                      <span className="bash-text-wrapper">
                        <span className="bash-text">
                          {BASH_RUNNING_CHARS.map((char, i) => (
                            <span
                              key={i}
                              className="bash-char"
                              style={{
                                animationDelay: `${i * 0.05}s`
                              }}
                            >
                              {char}
                            </span>
                          ))}
                          <span className="bash-dots"></span>
                        </span>
                        {bashStartTime && <BashTimer startTime={bashStartTime} />}
                      </span>
                    </div>
                  </div>
                </div>
              </VirtualItemWrapper>
            );
          }

          // Render thinking indicator
          if (message.type === 'thinking') {
            return (
              <VirtualItemWrapper
                key={virtualItem.key}
                virtualItem={virtualItem}
                measureElement={virtualizer.measureElement}
              >
                <div className="message assistant">
                  <div className="message-content">
                    <div className="thinking-indicator-bottom">
                      <LoadingIndicator size="small" color="red" />
                      <span className="thinking-text-wrapper">
                        <span className="thinking-text">
                          {activityLabel.split('').map((char, i) => (
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
                        {thinkingStartTime && <ThinkingTimer startTime={thinkingStartTime} />}
                      </span>
                    </div>
                  </div>
                </div>
              </VirtualItemWrapper>
            );
          }

          // Render followup indicator
          if (message.type === 'followup-indicator') {
            return (
              <VirtualItemWrapper
                key={virtualItem.key}
                virtualItem={virtualItem}
                measureElement={virtualizer.measureElement}
              >
                <div className="message assistant">
                  <div className="message-content">
                    <div className="status-indicators">
                      <div className="inline-activity-indicator followup">
                        <span className="activity-label">queued:</span>
                        <span className="activity-preview">
                          {message.content?.slice(0, 40)}
                          {message.content?.length > 40 ? '...' : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </VirtualItemWrapper>
            );
          }

          const isLastStreaming = isStreaming &&
            lastAssistantMessageIds.includes(message.id);

          // Check if this message is the current search match
          const isCurrentSearchMatch = searchMatches.length > 0 && searchMatches[searchIndex] === virtualItem.index;

          return (
            <VirtualItemWrapper
              key={virtualItem.key}
              virtualItem={virtualItem}
              measureElement={virtualizer.measureElement}
            >
              <MessageRenderer
                message={message}
                index={virtualItem.index}
                sessionId={sessionId}
                isStreaming={isLastStreaming}
                isLast={virtualItem.index === displayMessages.length - 1 && !showThinking && !showBash && !showUserBash && !pendingFollowup}
                thinkingFor={0}
                searchQuery={searchQuery}
                isCurrentMatch={isCurrentSearchMatch}
              />
            </VirtualItemWrapper>
          );
        })}
      </div>
    </div>
  );
});

VirtualizedMessageList.displayName = 'VirtualizedMessageList';