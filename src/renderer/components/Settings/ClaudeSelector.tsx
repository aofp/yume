import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  const [isDetecting, setIsDetecting] = useState(false);
  const [claudeVersion, setClaudeVersion] = useState<string>(() => {
    // Initialize with cached version for instant display
    return claudeDetector.getCachedVersion() || '';
  });
  const [settings, setSettings] = useState<ClaudeSettings>(() => {
    const saved = claudeDetector.loadSettings();
    // Default to native-windows if not set
    if (!saved.executionMode || saved.executionMode === 'auto') {
      const isWindows = navigator.platform.toLowerCase().includes('win');
      saved.executionMode = isWindows ? 'native-windows' : 'native';
    }
    return saved;
  });

  // Track if detection has been done this session
  const hasDetectedRef = useRef(false);

  // Lazy version fetch - only if not cached and modal is open
  useEffect(() => {
    if (showModal && !claudeVersion) {
      fetchClaudeVersion();
    }
  }, [showModal, claudeVersion]);

  const fetchClaudeVersion = async () => {
    try {
      const version = await invoke<string>('get_claude_version');
      // Extract just the version number if it includes "claude" prefix
      const versionMatch = version.match(/(\d+\.\d+\.\d+)/);
      let extractedVersion = '';
      if (versionMatch) {
        extractedVersion = versionMatch[1];
      } else if (version && version !== 'unknown') {
        extractedVersion = version.replace('claude', '').trim();
      }
      if (extractedVersion) {
        setClaudeVersion(extractedVersion);
        // Cache the version for future instant access
        claudeDetector.setCachedVersion(extractedVersion);
      }
    } catch (error) {
      console.error('Failed to get Claude version:', error);
    }
  };

  const detectInstallations = useCallback(async (force = false) => {
    // Avoid redundant detection within same session unless forced
    if (!force && hasDetectedRef.current && detection) {
      return;
    }

    setIsDetecting(true);
    try {
      const result = await claudeDetector.detectInstallations(force);
      setDetection(result);
      hasDetectedRef.current = true;

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
    } finally {
      setIsDetecting(false);
    }
  }, [detection, settings]);

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

  // Open modal and trigger lazy detection
  const handleOpenModal = useCallback(() => {
    setShowModal(true);
    // Trigger detection lazily when modal opens (uses cache if available)
    detectInstallations(false);
  }, [detectInstallations]);

  return (
    <>
      <div className="claude-setting">
        <span className="claude-label">claude cli</span>
        <div className="claude-button-container">
          <button
            className="claude-selector-button"
            onClick={handleOpenModal}
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
          onRefresh={() => detectInstallations(true)}
          isLoading={isDetecting}
        />
      )}
    </>
  );
};