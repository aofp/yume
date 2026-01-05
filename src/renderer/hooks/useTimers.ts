/**
 * Consolidated timer hook with visibility-based pausing
 * Reduces multiple intervals into coordinated timers that pause when backgrounded
 */

import { useEffect, useRef, useCallback, useState } from 'react';

// Track document visibility globally
let isDocumentVisible = true;
const visibilityListeners = new Set<(visible: boolean) => void>();

// Initialize visibility tracking once
if (typeof document !== 'undefined') {
  isDocumentVisible = document.visibilityState === 'visible';
  document.addEventListener('visibilitychange', () => {
    isDocumentVisible = document.visibilityState === 'visible';
    visibilityListeners.forEach(listener => listener(isDocumentVisible));
  });
}

/**
 * Hook that provides visibility-aware interval management
 * Pauses intervals when document is hidden to save resources
 */
export function useVisibilityAwareInterval(
  callback: () => void,
  delay: number | null,
  options?: { runWhenHidden?: boolean }
) {
  const savedCallback = useRef(callback);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runWhenHidden = options?.runWhenHidden ?? false;

  // Remember the latest callback
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  // Set up the interval with visibility awareness
  useEffect(() => {
    if (delay === null) return;

    const tick = () => {
      if (isDocumentVisible || runWhenHidden) {
        savedCallback.current();
      }
    };

    const startInterval = () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(tick, delay);
    };

    const handleVisibilityChange = (visible: boolean) => {
      if (visible) {
        // Restart interval when becoming visible
        startInterval();
        // Immediately run callback to update state
        savedCallback.current();
      } else if (!runWhenHidden) {
        // Stop interval when hidden
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    };

    startInterval();
    visibilityListeners.add(handleVisibilityChange);

    return () => {
      visibilityListeners.delete(handleVisibilityChange);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [delay, runWhenHidden]);
}

/**
 * Hook for elapsed time tracking (used for thinking/bash timers)
 * Uses a single RAF-based loop for all timers
 */
export function useElapsedTimer(
  startTime: number | null,
  active: boolean
): number {
  const [elapsed, setElapsed] = useState(0);
  const rafRef = useRef<number | null>(null);
  const lastUpdateRef = useRef(0);

  useEffect(() => {
    if (!active || !startTime) {
      setElapsed(0);
      return;
    }

    const update = (timestamp: number) => {
      // Throttle updates to ~10fps to reduce re-renders
      if (timestamp - lastUpdateRef.current > 100) {
        lastUpdateRef.current = timestamp;
        setElapsed(Math.floor((Date.now() - startTime) / 1000));
      }
      if (isDocumentVisible) {
        rafRef.current = requestAnimationFrame(update);
      }
    };

    // Initial calculation
    setElapsed(Math.floor((Date.now() - startTime) / 1000));

    if (isDocumentVisible) {
      rafRef.current = requestAnimationFrame(update);
    }

    const handleVisibility = (visible: boolean) => {
      if (visible && active && startTime) {
        setElapsed(Math.floor((Date.now() - startTime) / 1000));
        rafRef.current = requestAnimationFrame(update);
      } else if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };

    visibilityListeners.add(handleVisibility);

    return () => {
      visibilityListeners.delete(handleVisibility);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [startTime, active]);

  return elapsed;
}

/**
 * Hook for dots animation (cycles 1-2-3)
 * Much lighter than a full interval
 */
export function useDotsAnimation(active: boolean): number {
  const [dots, setDots] = useState(1);

  useVisibilityAwareInterval(
    useCallback(() => {
      setDots(d => d >= 3 ? 1 : d + 1);
    }, []),
    active ? 500 : null
  );

  return dots;
}

/**
 * Combined hook for bash timer state
 */
export function useBashTimer(isRunning: boolean) {
  const startTimeRef = useRef<number | null>(null);

  // Track start time
  useEffect(() => {
    if (isRunning && !startTimeRef.current) {
      startTimeRef.current = Date.now();
    } else if (!isRunning) {
      startTimeRef.current = null;
    }
  }, [isRunning]);

  const elapsed = useElapsedTimer(startTimeRef.current, isRunning);
  const dots = useDotsAnimation(isRunning);

  return { elapsed, dots };
}

/**
 * Hook for checking if document is visible
 */
export function useDocumentVisibility(): boolean {
  const [visible, setVisible] = useState(isDocumentVisible);

  useEffect(() => {
    const handler = (v: boolean) => setVisible(v);
    visibilityListeners.add(handler);
    return () => { visibilityListeners.delete(handler); };
  }, []);

  return visible;
}
