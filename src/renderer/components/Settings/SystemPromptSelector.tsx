import React, { useState, useEffect } from 'react';
import { SystemPromptModal } from './SystemPromptModal';
import { systemPromptService, SystemPromptSettings } from '../../services/systemPromptService';
import './SystemPromptSelector.css';

interface SystemPromptSelectorProps {
  onSettingsChange?: (settings: SystemPromptSettings) => void;
}

export const SystemPromptSelector: React.FC<SystemPromptSelectorProps> = ({ onSettingsChange }) => {
  const [showModal, setShowModal] = useState(false);
  const [settings, setSettings] = useState<SystemPromptSettings>(() => 
    systemPromptService.getCurrent()
  );

  const updateSettings = (newSettings: SystemPromptSettings) => {
    setSettings(newSettings);
    systemPromptService.save(newSettings);
    if (onSettingsChange) {
      onSettingsChange(newSettings);
    }
  };

  const getCurrentModeDisplay = () => {
    if (!settings.enabled) {
      return 'disabled';
    }
    
    if (settings.mode === 'default') {
      return 'default';
    }

    if (settings.mode === 'custom') {
      // Show character count for custom prompts
      const charCount = settings.customPrompt.length;
      return `custom (${charCount})`;
    }
    
    return 'default';
  };

  const getTooltip = () => {
    if (!settings.enabled) {
      return 'System prompt disabled';
    }
    
    if (settings.mode === 'custom' && settings.customPrompt) {
      // Show first 100 chars of custom prompt
      const preview = settings.customPrompt.substring(0, 100);
      return preview + (settings.customPrompt.length > 100 ? '...' : '');
    }
    
    return 'Configure system prompt for Claude';
  };

  return (
    <>
      <div className="system-prompt-setting">
        <span className="system-prompt-label">system prompt append</span>
        <div className="system-prompt-button-container">
          <button 
            className="system-prompt-selector-button" 
            onClick={() => setShowModal(true)}
            title={getTooltip()}
          >
            {getCurrentModeDisplay()}
          </button>
        </div>
      </div>

      {showModal && (
        <SystemPromptModal
          settings={settings}
          onSave={updateSettings}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
};