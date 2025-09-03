import React, { useState, useEffect } from 'react';
import { claudeDetector, ClaudeDetectionResult, ClaudeSettings } from '../../services/claudeDetector';
import { ClaudeSelectorModal } from './ClaudeSelectorModal';
import { invoke } from '@tauri-apps/api/core';
import './ClaudeSelector.css';

interface ClaudeSelectorProps {
  onSettingsChange?: (settings: ClaudeSettings) => void;
}

export const ClaudeSelector: React.FC<ClaudeSelectorProps> = ({ onSettingsChange }) => {
  const [showModal, setShowModal] = useState(false);
  const [detection, setDetection] = useState<ClaudeDetectionResult | null>(null);
  const [claudeVersion, setClaudeVersion] = useState<string>('');
  const [settings, setSettings] = useState<ClaudeSettings>(() => {
    const saved = claudeDetector.loadSettings();
    // Default to native-windows if not set
    if (!saved.executionMode || saved.executionMode === 'auto') {
      const isWindows = navigator.platform.toLowerCase().includes('win');
      saved.executionMode = isWindows ? 'native-windows' : 'native';
    }
    return saved;
  });

  useEffect(() => {
    // Initial detection on mount
    detectInstallations();
    fetchClaudeVersion();
  }, []);

  const fetchClaudeVersion = async () => {
    try {
      const version = await invoke<string>('get_claude_version');
      // Extract just the version number if it includes "claude" prefix
      const versionMatch = version.match(/(\d+\.\d+\.\d+)/);
      if (versionMatch) {
        setClaudeVersion(versionMatch[1]);
      } else if (version && version !== 'unknown') {
        setClaudeVersion(version.replace('claude', '').trim());
      }
    } catch (error) {
      console.error('Failed to get Claude version:', error);
    }
  };

  const detectInstallations = async () => {
    try {
      const result = await claudeDetector.detectInstallations(true);
      setDetection(result);
      
      // Set preferred installation based on current mode
      const newSettings = { ...settings };
      if (settings.executionMode === 'native-windows' && result.nativeWindows) {
        newSettings.preferredInstallation = result.nativeWindows;
      } else if (settings.executionMode === 'wsl' && result.wsl) {
        newSettings.preferredInstallation = result.wsl;
      }
      updateSettings(newSettings);
    } catch (error) {
      console.error('Detection failed:', error);
    }
  };

  const updateSettings = (newSettings: ClaudeSettings) => {
    setSettings(newSettings);
    claudeDetector.saveSettings(newSettings);
    if (onSettingsChange) {
      onSettingsChange(newSettings);
    }
  };

  const handleModeSelect = (mode: 'native-windows' | 'wsl' | 'native') => {
    const newSettings = { ...settings, executionMode: mode };
    
    // Set preferred installation based on mode
    if (mode === 'native-windows' && detection?.nativeWindows) {
      newSettings.preferredInstallation = detection.nativeWindows;
    } else if (mode === 'wsl' && detection?.wsl) {
      newSettings.preferredInstallation = detection.wsl;
    }
    
    updateSettings(newSettings);
    setShowModal(false);
  };

  const getCurrentModeDisplay = () => {
    const isWindows = navigator.platform.toLowerCase().includes('win');
    const isMac = navigator.platform.toLowerCase().includes('mac');
    
    let mode = '';
    if (isMac) {
      mode = 'native';
    } else if (isWindows) {
      mode = settings.executionMode === 'wsl' ? 'wsl' : 'native windows';
    } else {
      mode = 'native';
    }
    
    // Add version if available
    if (claudeVersion) {
      return `${mode} v${claudeVersion}`;
    }
    return mode;
  };

  return (
    <>
      <div className="claude-setting">
        <span className="claude-label">claude cli</span>
        <div className="claude-button-container">
          <button 
            className="claude-selector-button" 
            onClick={() => setShowModal(true)}
            title={claudeVersion ? `Claude CLI v${claudeVersion}` : 'Claude CLI configuration'}
          >
            {getCurrentModeDisplay()}
          </button>
        </div>
      </div>

      {showModal && (
        <ClaudeSelectorModal
          detection={detection}
          currentMode={settings.executionMode}
          onSelect={handleModeSelect}
          onClose={() => setShowModal(false)}
          onRefresh={detectInstallations}
        />
      )}
    </>
  );
};