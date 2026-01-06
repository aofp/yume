import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * useHover - JS-controlled hover state for Tauri webview compatibility
 *
 * Tauri's webview sometimes doesn't update CSS :hover state correctly
 * until the window is refocused. This hook provides reliable hover
 * tracking via onMouseEnter/onMouseLeave events.
 *
 * Usage:
 * ```tsx
 * const { isHovered, hoverProps } = useHover();
 * return <button className={isHovered ? 'hovered' : ''} {...hoverProps}>Click</button>;
 * ```
 */
export function useHover() {
  const [isHovered, setIsHovered] = useState(false);
  const elementRef = useRef<HTMLElement | null>(null);

  // Reset hover on window blur (user switched to another app)
  useEffect(() => {
    const handleBlur = () => setIsHovered(false);
    window.addEventListener('blur', handleBlur);
    return () => window.removeEventListener('blur', handleBlur);
  }, []);

  const onMouseEnter = useCallback(() => setIsHovered(true), []);
  const onMouseLeave = useCallback(() => setIsHovered(false), []);

  const hoverProps = {
    onMouseEnter,
    onMouseLeave,
    ref: (el: HTMLElement | null) => { elementRef.current = el; },
  };

  return { isHovered, hoverProps, setIsHovered };
}

/**
 * Simple version without ref - for components that don't need ref access
 */
export function useHoverSimple() {
  const [isHovered, setIsHovered] = useState(false);

  const onMouseEnter = useCallback(() => setIsHovered(true), []);
  const onMouseLeave = useCallback(() => setIsHovered(false), []);

  return { isHovered, onMouseEnter, onMouseLeave };
}
