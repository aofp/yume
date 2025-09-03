import React, { useState, useEffect } from 'react';
import { IconX, IconCheck, IconAlertTriangle } from '@tabler/icons-react';
import { ClaudeDetectionResult } from '../../services/claudeDetector';
import { invoke } from '@tauri-apps/api/core';
import './ClaudeSelectorModal.css';

interface ClaudeSelectorModalProps {
  detection: ClaudeDetectionResult | null;
  currentMode: string;
  onSelect: (mode: 'native-windows' | 'wsl' | 'native') => void;
  onClose: () => void;
  onRefresh: () => void;
}

export const ClaudeSelectorModal: React.FC<ClaudeSelectorModalProps> = ({
  detection,
  currentMode,
  onSelect,
  onClose,
}) => {
  const [claudeVersion, setClaudeVersion] = useState<string>('checking...');
  const [claudePath, setClaudePath] = useState<string>('');
  const isWindows = navigator.platform.toLowerCase().includes('win');
  const isMac = navigator.platform.toLowerCase().includes('mac');

  useEffect(() => {
    // Get Claude CLI version and path
    getClaudeInfo();
  }, []);

  const getClaudeInfo = async () => {
    try {
      // Get version by running claude --version
      const version = await invoke<string>('get_claude_version');
      setClaudeVersion(version || 'unknown');
      
      // Get binary path
      const path = await invoke<string>('get_claude_path');
      setClaudePath(path || '/usr/local/bin/claude');
    } catch (error) {
      console.error('Failed to get Claude info:', error);
      setClaudeVersion('unknown');
      setClaudePath('/usr/local/bin/claude');
    }
  };

  const getCurrentInstallation = () => {
    if (!detection) return null;
    
    if (currentMode === 'native-windows' && detection.nativeWindows) {
      return detection.nativeWindows;
    } else if (currentMode === 'wsl' && detection.wsl) {
      return detection.wsl;
    }
    return null;
  };

  const currentInstall = getCurrentInstallation();

  return (
    <div className="claude-modal-overlay" onClick={onClose}>
      <div className="claude-modal" onClick={(e) => e.stopPropagation()}>
        <div className="claude-modal-header">
          <span className="modal-title">claude cli configuration</span>
          <button className="claude-modal-close" onClick={onClose}>
            <IconX size={14} />
          </button>
        </div>


        <div className="claude-modal-options">
          {/* Native installation (macOS/Linux) */}
          {!isWindows && (
            <div 
              className={`claude-option ${currentMode === 'native' ? 'active' : ''}`}
              onClick={() => onSelect('native')}
            >
              <div className="option-content">
                <span className="option-name">native</span>
                {isMac && (
                  <>
                    <span className="option-path">{claudePath}</span>
                    <span className="option-version">version: {claudeVersion}</span>
                  </>
                )}
              </div>
              {currentMode === 'native' && (
                <IconCheck size={12} className="option-check" />
              )}
            </div>
          )}

          {/* Windows options */}
          {isWindows && (
            <>
              <div 
                className={`claude-option ${currentMode === 'native-windows' ? 'active' : ''} ${!detection?.nativeWindows ? 'disabled' : ''}`}
                onClick={() => detection?.nativeWindows && onSelect('native-windows')}
              >
                <div className="option-content">
                  <span className="option-name">native windows</span>
                  {detection?.nativeWindows ? (
                    <>
                      <span className="option-path">{detection.nativeWindows.path}</span>
                      <span className="option-version">version: {detection.nativeWindows.version || 'unknown'}</span>
                    </>
                  ) : (
                    <span className="option-missing">not installed</span>
                  )}
                </div>
                {detection?.nativeWindows && currentMode === 'native-windows' && (
                  <IconCheck size={12} className="option-check" />
                )}
              </div>

              <div 
                className={`claude-option ${currentMode === 'wsl' ? 'active' : ''} ${!detection?.wsl ? 'disabled' : ''}`}
                onClick={() => detection?.wsl && onSelect('wsl')}
              >
                <div className="option-content">
                  <span className="option-name">wsl</span>
                  {detection?.wsl ? (
                    <>
                      <span className="option-path">{detection.wsl.path}</span>
                      <span className="option-version">version: {detection.wsl.version || 'unknown'}</span>
                    </>
                  ) : (
                    <span className="option-missing">not installed</span>
                  )}
                </div>
                {detection?.wsl && currentMode === 'wsl' && (
                  <IconCheck size={12} className="option-check" />
                )}
              </div>
            </>
          )}
        </div>

        {isWindows && !detection?.nativeWindows && !detection?.wsl && (
          <div className="claude-modal-warning">
            <IconAlertTriangle size={14} />
            <span>no claude installations found</span>
          </div>
        )}
      </div>
    </div>
  );
};