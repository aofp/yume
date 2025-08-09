import React from 'react';
import { IconSettings } from '@tabler/icons-react';
import './TitleBar.css';

interface TitleBarProps {
  onSettingsClick: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({ onSettingsClick }) => {
  // Check if we're on Windows (where WindowControls already has the settings button)
  const isWindows = navigator.platform.toLowerCase().includes('win') || 
                   navigator.userAgent.toLowerCase().includes('windows');

  return (
    <div className="titlebar-wrapper">
      <div className="titlebar">
        <div className="titlebar-content">
          <span className="titlebar-text">
            <span style={{ color: 'rgba(255, 255, 255, 0.4)', fontWeight: 'bold' }}>yuru</span>
            <span style={{ color: 'var(--accent-color)', fontWeight: 'bold' }}>code</span>
          </span>
        </div>
        <button className="titlebar-settings" onClick={onSettingsClick}>
          <IconSettings size={14} stroke={1.5} />
        </button>
      </div>
    </div>
  );
};