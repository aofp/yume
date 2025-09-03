import React from 'react';
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
  return (
    <button 
      className={`tab-btn ${active ? 'active' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {label}
      {count !== undefined && (
        <span className="tab-count">({count})</span>
      )}
    </button>
  );
};