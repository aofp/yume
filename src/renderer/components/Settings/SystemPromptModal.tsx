import React, { useState, useEffect } from 'react';
import { IconX, IconRotateClockwise, IconCheck, IconAlertTriangle } from '@tabler/icons-react';
import { SystemPromptSettings } from '../../services/systemPromptService';
import { APP_NAME } from '../../config/app';
import './SystemPromptModal.css';

interface SystemPromptModalProps {
  settings: SystemPromptSettings;
  onSave: (settings: SystemPromptSettings) => void;
  onClose: () => void;
}

const DEFAULT_PROMPT = `${APP_NAME} coding agent. lowercase, concise. read before edit. plan with think/todo, break into small steps, incremental edits.`;

export const SystemPromptModal: React.FC<SystemPromptModalProps> = ({ 
  settings, 
  onSave, 
  onClose 
}) => {
  const [localSettings, setLocalSettings] = useState<SystemPromptSettings>(settings);
  const [promptText, setPromptText] = useState(() => {
    if (settings.mode === 'custom') return settings.customPrompt;
    if (settings.mode === 'none' || !settings.enabled) return '';
    return DEFAULT_PROMPT;
  });
  
  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleModeChange = (mode: 'default' | 'custom' | 'none') => {
    const newSettings = { 
      ...localSettings, 
      mode,
      enabled: mode !== 'none'
    };
    setLocalSettings(newSettings);
    
    if (mode === 'default') {
      setPromptText(DEFAULT_PROMPT);
    } else if (mode === 'none') {
      setPromptText('');
    }
  };

  const handleSave = () => {
    const finalSettings: SystemPromptSettings = {
      ...localSettings,
      customPrompt: localSettings.mode === 'custom' ? promptText : localSettings.customPrompt
    };
    onSave(finalSettings);
    onClose();
  };

  const handleReset = () => {
    const newSettings = {
      enabled: true,
      mode: 'default' as const,
      customPrompt: '',
      agentsEnabled: true
    };
    setLocalSettings(newSettings);
    setPromptText(DEFAULT_PROMPT);
  };

  const charCount = promptText.length;
  const charLimit = 2000;
  const isOverLimit = charCount > charLimit;

  return (
    <div className="system-prompt-modal-overlay" onContextMenu={(e) => e.preventDefault()}>
      <div className="system-prompt-modal">
        <div className="system-prompt-header" style={{ WebkitAppRegion: 'drag', webkitAppRegion: 'drag' } as React.CSSProperties} onContextMenu={(e) => e.preventDefault()}>
          <h3 style={{ WebkitAppRegion: 'drag', webkitAppRegion: 'drag' } as React.CSSProperties}>system prompt append configuration</h3>
          <button className="close-button" onClick={onClose} title="close (esc)" style={{ WebkitAppRegion: 'no-drag', webkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <IconX size={16} stroke={1.5} />
          </button>
        </div>

        <div className="system-prompt-content">
          {/* Mode Selection */}
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

          {/* Prompt Editor - only show if not 'none' */}
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
                  // Remove all newlines and carriage returns
                  const cleanedValue = e.target.value.replace(/[\r\n]+/g, ' ');
                  if (localSettings.mode !== 'custom') {
                    setLocalSettings({ ...localSettings, mode: 'custom', enabled: true });
                  }
                  setPromptText(cleanedValue);
                }}
                onKeyDown={(e) => {
                  // Prevent Enter key from creating newlines
                  if (e.key === 'Enter') {
                    e.preventDefault();
                  }
                }}
                onPaste={(e) => {
                  // Clean pasted content to remove newlines
                  e.preventDefault();
                  const pastedText = e.clipboardData.getData('text');
                  const cleanedText = pastedText.replace(/[\r\n]+/g, ' ');
                  const newValue = promptText.slice(0, (e.target as HTMLTextAreaElement).selectionStart) + 
                                   cleanedText + 
                                   promptText.slice((e.target as HTMLTextAreaElement).selectionEnd);
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

        <div className="system-prompt-footer">
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
            <button 
              className="save-button" 
              onClick={handleSave}
              disabled={isOverLimit}
            >
              <IconCheck size={12} />
              save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};