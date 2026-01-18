import React, { useState, useEffect } from 'react';
import { IconX, IconRotateClockwise, IconCheck, IconAlertTriangle } from '@tabler/icons-react';
import { ProviderPromptSettings, providerPromptService } from '../../services/providerPromptService';
import { APP_NAME } from '../../config/app';
import './ProviderSystemPromptModal.css';

type ProviderType = 'gemini' | 'openai';

interface ProviderSystemPromptModalProps {
  provider: ProviderType;
  settings: ProviderPromptSettings;
  onSave: (settings: ProviderPromptSettings) => void;
  onClose: () => void;
}

export const ProviderSystemPromptModal: React.FC<ProviderSystemPromptModalProps> = ({
  provider,
  settings,
  onSave,
  onClose,
}) => {
  const defaultPrompt = providerPromptService.getDefault(provider);

  const [localSettings, setLocalSettings] = useState<ProviderPromptSettings>(settings);
  const [promptText, setPromptText] = useState(() => {
    if (settings.mode === 'custom') return settings.customPrompt;
    if (settings.mode === 'none' || !settings.enabled) return '';
    return defaultPrompt;
  });

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleModeChange = (mode: 'default' | 'custom' | 'none') => {
    const newSettings = {
      ...localSettings,
      mode,
      enabled: mode !== 'none',
    };
    setLocalSettings(newSettings);

    if (mode === 'default') {
      setPromptText(defaultPrompt);
    } else if (mode === 'none') {
      setPromptText('');
    }
  };

  const handleSave = () => {
    const finalSettings: ProviderPromptSettings = {
      ...localSettings,
      customPrompt: localSettings.mode === 'custom' ? promptText : localSettings.customPrompt,
    };
    onSave(finalSettings);
    onClose();
  };

  const handleReset = () => {
    const newSettings: ProviderPromptSettings = {
      enabled: true,
      mode: 'default',
      customPrompt: '',
    };
    setLocalSettings(newSettings);
    setPromptText(defaultPrompt);
  };

  const getTitle = () => {
    return provider === 'openai' ? 'codex' : provider;
  };

  const charCount = promptText.length;
  const charLimit = 2000;
  const isOverLimit = charCount > charLimit;

  return (
    <div className="provider-prompt-modal-overlay" onContextMenu={(e) => e.preventDefault()}>
      <div className="provider-prompt-modal">
        <div
          className="provider-prompt-header"
          style={{ WebkitAppRegion: 'drag', webkitAppRegion: 'drag' } as React.CSSProperties}
          onContextMenu={(e) => e.preventDefault()}
        >
          <h3 style={{ WebkitAppRegion: 'drag', webkitAppRegion: 'drag' } as React.CSSProperties}>
            {getTitle()} system prompt append
          </h3>
          <button
            className="close-button"
            onClick={onClose}
            title="close (esc)"
            style={{ WebkitAppRegion: 'no-drag', webkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <IconX size={16} stroke={1.5} />
          </button>
        </div>

        <div className="provider-prompt-content">
          <div className="prompt-mode-section">
            <div className="mode-buttons">
              <button
                className={`mode-button ${localSettings.mode === 'default' && localSettings.enabled ? 'active' : ''}`}
                onClick={() => handleModeChange('default')}
              >
                {APP_NAME}
              </button>
              <button
                className={`mode-button ${localSettings.mode === 'custom' ? 'active' : ''}`}
                onClick={() => handleModeChange('custom')}
              >
                custom
              </button>
              <button
                className={`mode-button ${localSettings.mode === 'none' || !localSettings.enabled ? 'active' : ''}`}
                onClick={() => handleModeChange('none')}
              >
                none
              </button>
            </div>
          </div>

          {localSettings.mode !== 'none' && localSettings.enabled && (
            <div className="prompt-editor-section">
              <div className="editor-header">
                <span className="editor-label">prompt</span>
                <span className={`char-count ${isOverLimit ? 'over-limit' : ''}`}>
                  {charCount}/{charLimit}
                </span>
              </div>
              <textarea
                className="prompt-editor"
                value={promptText}
                onChange={(e) => {
                  const cleanedValue = e.target.value.replace(/[\r\n]+/g, ' ');
                  if (localSettings.mode !== 'custom') {
                    setLocalSettings({ ...localSettings, mode: 'custom', enabled: true });
                  }
                  setPromptText(cleanedValue);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.preventDefault();
                }}
                onPaste={(e) => {
                  e.preventDefault();
                  const pastedText = e.clipboardData.getData('text');
                  const cleanedText = pastedText.replace(/[\r\n]+/g, ' ');
                  const target = e.target as HTMLTextAreaElement;
                  const newValue =
                    promptText.slice(0, target.selectionStart) +
                    cleanedText +
                    promptText.slice(target.selectionEnd);
                  if (localSettings.mode !== 'custom') {
                    setLocalSettings({ ...localSettings, mode: 'custom', enabled: true });
                  }
                  setPromptText(newValue);
                }}
                placeholder="enter your system prompt..."
                spellCheck={false}
                readOnly={localSettings.mode === 'default'}
                style={localSettings.mode === 'default' ? { pointerEvents: 'none' } : {}}
              />
              {isOverLimit && (
                <div className="warning-message">
                  <IconAlertTriangle size={12} />
                  <span>exceeds limit</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="provider-prompt-footer">
          {localSettings.mode !== 'default' && (
            <button className="reset-button" onClick={handleReset}>
              <IconRotateClockwise size={12} />
              reset to default
            </button>
          )}
          <div className="action-buttons">
            <button className="cancel-button" onClick={onClose}>
              cancel
            </button>
            <button className="save-button" onClick={handleSave} disabled={isOverLimit}>
              <IconCheck size={12} />
              save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
