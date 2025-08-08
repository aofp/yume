import React from 'react';
import './TitleBar.css';

interface TitleBarProps {
  onSettingsClick: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({ onSettingsClick }) => {
  return (
    <div className="titlebar-wrapper">
      <div className="titlebar">
        <div className="titlebar-content">
          <span className="titlebar-text">
            <span style={{ color: '#ff99cc' }}>yuru</span>
            <span style={{ color: 'rgba(255, 255, 255, 0.4)' }}>code</span>
          </span>
        </div>
      </div>
    </div>
  );
};