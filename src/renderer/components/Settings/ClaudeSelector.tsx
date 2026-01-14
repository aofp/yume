import React, { useState, useEffect, useCallback, useRef } from 'react';
import { claudeDetector, ClaudeDetectionResult, ClaudeSettings } from '../../services/claudeDetector';
import { ClaudeSelectorModal } from './ClaudeSelectorModal';
import { useClaudeCodeStore } from '../../stores/claudeCodeStore';
import './ClaudeSelector.css';

interface ClaudeSelectorProps {
  onSettingsChange?: (settings: ClaudeSettings) => void;
}

export const ClaudeSelector: React.FC<ClaudeSelectorProps> = ({ onSettingsChange }) => {
  const { claudeVersion: cachedVersion, fetchClaudeVersion } = useClaudeCodeStore();
  const [showModal, setShowModal] = useState(false);
  const [detection, setDetection] = useState<ClaudeDetectionResult | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  
  // Use cached version from store, or fallback to detector cache
  const claudeVersion = cachedVersion || claudeDetector.getCachedVersion() || '';
  
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

  // Refresh version if not available when modal opens
  useEffect(() => {
    if (showModal && !claudeVersion) {
      fetchClaudeVersion();
    }
  }, [showModal, claudeVersion, fetchClaudeVersion]);

  // Removed local fetchClaudeVersion implementation as it's now in the store

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