import React from 'react';

/**
 * Wrapper component that applies opacity to icons without causing
 * overlapping stroke transparency issues.
 *
 * Instead of using rgba colors on SVG icons (which causes strokes to
 * show through each other where they overlap), wrap the icon in this
 * component and apply opacity to the container.
 *
 * Usage:
 *   <IconOpacity opacity={0.5}>
 *     <IconSettings size={16} />
 *   </IconOpacity>
 */
interface IconOpacityProps {
  children: React.ReactNode;
  opacity: number;
  className?: string;
  style?: React.CSSProperties;
}

export const IconOpacity: React.FC<IconOpacityProps> = ({
  children,
  opacity,
  className,
  style,
}) => {
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity,
        ...style,
      }}
    >
      {children}
    </span>
  );
};

export default IconOpacity;
