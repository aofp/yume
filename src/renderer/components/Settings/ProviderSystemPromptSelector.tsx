import React, { useState } from 'react';
import { ProviderSystemPromptModal } from './ProviderSystemPromptModal';
import { providerPromptService, ProviderPromptSettings } from '../../services/providerPromptService';
import './ProviderSystemPromptSelector.css';

type ProviderType = 'gemini' | 'openai';

interface ProviderSystemPromptSelectorProps {
  provider: ProviderType;
  onSettingsChange?: (settings: ProviderPromptSettings) => void;
}

export const ProviderSystemPromptSelector: React.FC<ProviderSystemPromptSelectorProps> = ({
  provider,
  onSettingsChange,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [settings, setSettings] = useState<ProviderPromptSettings>(() =>
    providerPromptService.getCurrent(provider)
  );

  const updateSettings = (newSettings: ProviderPromptSettings) => {
    setSettings(newSettings);
    providerPromptService.save(provider, newSettings);
    onSettingsChange?.(newSettings);
  };

  const getCurrentModeDisplay = () => {
    if (!settings.enabled || settings.mode === 'none') {
      return 'disabled';
    }

    if (settings.mode === 'default') {
      return 'default';
    }

    if (settings.mode === 'custom') {
      const charCount = settings.customPrompt.length;
      return `custom (${charCount})`;
    }

    return 'default';
  };

  const getTooltip = () => {
    if (!settings.enabled || settings.mode === 'none') {
      return 'system prompt disabled';
    }

    if (settings.mode === 'custom' && settings.customPrompt) {
      const preview = settings.customPrompt.substring(0, 100);
      return preview + (settings.customPrompt.length > 100 ? '...' : '');
    }

    return `configure system prompt for ${provider === 'openai' ? 'codex' : provider}`;
  };

  return (
    <>
      <div className="provider-prompt-setting">
        <span className="provider-prompt-label">system prompt append</span>
        <div className="provider-prompt-button-container">
          <button
            className="provider-prompt-selector-button"
            onClick={() => setShowModal(true)}
            title={getTooltip()}
          >
            {getCurrentModeDisplay()}
          </button>
        </div>
      </div>

      {showModal && (
        <ProviderSystemPromptModal
          provider={provider}
          settings={settings}
          onSave={updateSettings}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
};
