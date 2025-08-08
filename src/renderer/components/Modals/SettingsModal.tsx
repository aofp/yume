import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Settings, Key, Shield, Palette, Keyboard } from 'lucide-react';
import { useStore } from '../../stores/useStore';
import { claudeService } from '../../services/claudeApi';
import './SettingsModal.css';

interface SettingsModalProps {
  onClose: () => void;
}

type SettingsTab = 'general' | 'api' | 'tools' | 'theme' | 'shortcuts';

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const { settings, updateSettings } = useStore();
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [localSettings, setLocalSettings] = useState(settings);
  const [apiKey, setApiKey] = useState(localStorage.getItem('anthropic_api_key') || '');
  const [showApiKey, setShowApiKey] = useState(false);

  const handleSave = () => {
    updateSettings(localSettings);
    
    // Save API key if provided
    if (apiKey) {
      localStorage.setItem('anthropic_api_key', apiKey);
      claudeService.setApiKey(apiKey);
    }
    
    onClose();
  };

  const tabs = [
    { id: 'general' as SettingsTab, label: 'General', icon: <Settings size={16} /> },
    { id: 'api' as SettingsTab, label: 'API', icon: <Key size={16} /> },
    { id: 'tools' as SettingsTab, label: 'Tools', icon: <Shield size={16} /> },
    { id: 'theme' as SettingsTab, label: 'Theme', icon: <Palette size={16} /> },
    { id: 'shortcuts' as SettingsTab, label: 'Shortcuts', icon: <Keyboard size={16} /> },
  ];

  return (
    <motion.div 
      className="modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div 
        className="settings-modal"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
      >
        <div className="modal-header">
          <h3>Settings</h3>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="settings-content">
          <div className="settings-tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          <div className="settings-panel">
            {activeTab === 'general' && (
              <div className="settings-section">
                <h4>General Settings</h4>
                
                <div className="setting-item">
                  <label>Model</label>
                  <select 
                    value={localSettings.model}
                    onChange={(e) => setLocalSettings({...localSettings, model: e.target.value})}
                  >
                    <option value="claude-3-5-sonnet">Claude 3.5 Sonnet</option>
                    <option value="claude-3-opus">Claude 3 Opus</option>
                    <option value="claude-3-haiku">Claude 3 Haiku</option>
                  </select>
                </div>

                <div className="setting-item">
                  <label>Temperature</label>
                  <div className="slider-container">
                    <input 
                      type="range" 
                      min="0" 
                      max="1" 
                      step="0.1"
                      value={localSettings.temperature}
                      onChange={(e) => setLocalSettings({...localSettings, temperature: parseFloat(e.target.value)})}
                    />
                    <span>{localSettings.temperature}</span>
                  </div>
                </div>

                <div className="setting-item">
                  <label>Max Tokens</label>
                  <input 
                    type="number" 
                    value={localSettings.maxTokens}
                    onChange={(e) => setLocalSettings({...localSettings, maxTokens: parseInt(e.target.value)})}
                  />
                </div>

                <div className="setting-item checkbox">
                  <label>
                    <input 
                      type="checkbox" 
                      checked={localSettings.streamResponses}
                      onChange={(e) => setLocalSettings({...localSettings, streamResponses: e.target.checked})}
                    />
                    Stream responses
                  </label>
                </div>

                <div className="setting-item checkbox">
                  <label>
                    <input 
                      type="checkbox" 
                      checked={localSettings.autoSave}
                      onChange={(e) => setLocalSettings({...localSettings, autoSave: e.target.checked})}
                    />
                    Auto-save sessions
                  </label>
                </div>

                <div className="setting-item checkbox">
                  <label>
                    <input 
                      type="checkbox" 
                      checked={localSettings.soundNotifications}
                      onChange={(e) => setLocalSettings({...localSettings, soundNotifications: e.target.checked})}
                    />
                    Sound notifications
                  </label>
                </div>
              </div>
            )}

            {activeTab === 'api' && (
              <div className="settings-section">
                <h4>API Configuration</h4>
                <p className="settings-description">
                  Enter your Anthropic API key to use real Claude responses instead of mock data.
                  Get your API key from: <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer" style={{color: '#3B82F6'}}>console.anthropic.com</a>
                </p>
                
                <div className="setting-item">
                  <label>Anthropic API Key</label>
                  <div style={{display: 'flex', gap: '8px'}}>
                    <input 
                      type={showApiKey ? "text" : "password"}
                      placeholder="sk-ant-..."
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      style={{flex: 1}}
                    />
                    <button 
                      onClick={() => setShowApiKey(!showApiKey)}
                      style={{
                        padding: '8px 12px',
                        background: '#1A1A1A',
                        border: '1px solid #2A2A2A',
                        borderRadius: '6px',
                        color: '#A0A0A0',
                        cursor: 'pointer'
                      }}
                    >
                      {showApiKey ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  {apiKey && (
                    <small style={{color: '#10B981', marginTop: '4px', display: 'block'}}>
                      ✓ API key is set
                    </small>
                  )}
                </div>

                <div className="setting-item">
                  <label>Test Connection</label>
                  <button 
                    onClick={async () => {
                      if (apiKey) {
                        claudeService.setApiKey(apiKey);
                        const result = await claudeService.query('Hello, please respond with "Connection successful!"', {
                          maxTokens: 50
                        });
                        if (result.success) {
                          alert('Connection successful! Claude responded: ' + result.data);
                        } else {
                          alert('Connection failed: ' + result.error);
                        }
                      } else {
                        alert('Please enter an API key first');
                      }
                    }}
                    style={{
                      padding: '8px 16px',
                      background: '#3B82F6',
                      border: 'none',
                      borderRadius: '6px',
                      color: 'white',
                      cursor: 'pointer',
                      fontWeight: 500
                    }}
                  >
                    Test API Connection
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'tools' && (
              <div className="settings-section">
                <h4>Tool Settings</h4>
                <p className="settings-description">
                  Configure default permissions for tools. You can override these on a per-session basis.
                </p>
              </div>
            )}

            {activeTab === 'theme' && (
              <div className="settings-section">
                <h4>Theme Settings</h4>
                <p className="settings-description">
                  Theme customization options will be available in a future update.
                </p>
              </div>
            )}

            {activeTab === 'shortcuts' && (
              <div className="settings-section">
                <h4>Keyboard Shortcuts</h4>
                
                <div className="shortcut-list">
                  <div className="shortcut-item">
                    <span>New Session</span>
                    <kbd>Cmd/Ctrl + N</kbd>
                  </div>
                  <div className="shortcut-item">
                    <span>Switch Session</span>
                    <kbd>Cmd/Ctrl + Tab</kbd>
                  </div>
                  <div className="shortcut-item">
                    <span>Command Palette</span>
                    <kbd>Cmd/Ctrl + K</kbd>
                  </div>
                  <div className="shortcut-item">
                    <span>Settings</span>
                    <kbd>Cmd/Ctrl + ,</kbd>
                  </div>
                  <div className="shortcut-item">
                    <span>Send Message</span>
                    <kbd>Cmd/Ctrl + Enter</kbd>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-save" onClick={handleSave}>
            Save Changes
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};