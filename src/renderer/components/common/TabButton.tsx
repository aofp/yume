import React, { useState } from 'react';
import './TabButton.css';

interface TabButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  count?: number;
}

export const TabButton: React.FC<TabButtonProps> = ({
  label,
  active,
  onClick,
  disabled = false,
  count
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  // Build class: active gets base style, hovered/focused get highlight
  const isHighlighted = (isHovered || isFocused) && !disabled;

  return (
    <button
      className={`tab-btn ${active ? 'active' : ''} ${isHighlighted ? 'highlighted' : ''}`}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
    >
      {label}
      {count !== undefined && (
        <span className="tab-count">({count})</span>
      )}
    </button>
  );
};