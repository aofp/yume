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

  return (
    <button
      className={`tab-btn ${active ? 'active' : ''} ${isHovered && !active && !disabled ? 'hovered' : ''}`}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {label}
      {count !== undefined && (
        <span className="tab-count">({count})</span>
      )}
    </button>
  );
};