import React, { useState, useEffect, useRef } from 'react';
import { 
  IconX, IconPlus, IconMinus, IconSettings, IconPalette, 
  IconPhoto, IconRotateClockwise, IconCrown, IconInfoCircle,
  IconWebhook, IconCommand, IconDatabase, IconBrain,
  IconTrash, IconDownload, IconUpload, IconAlertTriangle
} from '@tabler/icons-react';
import './SettingsModal.css';
import './SettingsModalTabbed.css';
import { useClaudeCodeStore } from '../../stores/claudeCodeStore';
import { useLicenseStore } from '../../services/licenseManager';
import { FontPickerModal } from '../FontPicker/FontPickerModal';
import { AboutModal } from '../About/AboutModal';
import { HooksTab } from './HooksTab';
import { ClaudeSelector } from './ClaudeSelector';
import { invoke } from '@tauri-apps/api/core';
import { hooksService, HookConfig } from '../../services/hooksService';

// Access the electron API exposed by preload script
declare global {
  interface Window {
    electronAPI?: any;
  }
}

interface SettingsModalProps {
  onClose: () => void;
}

// Tab type definition
type SettingsTab = 'general' | 'hooks' | 'commands';

// Color swatches organized in 4 rows (same as original)
const COLOR_ROWS = [
  // Row 1: Only 2 colors - grey and white
  [
    '#dddddd', '#ffffff'
  ],
  // Row 2: Full spectrum starting with blue - 21 unique colors
  [
    '#99bbff', '#99ccff', '#99ddff', '#99eeff', '#99ffff',
    '#99ffee', '#99ffdd', '#99ffcc', '#99ffbb', '#99ff99',
    '#bbff99', '#ddff99', '#ffff99', '#ffdd99', '#ffbb99',
    '#ff9999', '#ff99bb', '#ff99dd', '#ff99ff', '#dd99ff',
    '#bb99ff'
  ],
  // Row 3: Slightly lighter version of row 2 - 21 unique colors  
  [
    '#bfd4ff', '#bfddff', '#bfe8ff', '#bff4ff', '#bfffff',
    '#bffff4', '#bfffe8', '#bfffdd', '#bfffd4', '#bfffbf',
    '#d4ffbf', '#e8ffbf', '#ffffbf', '#ffe8bf', '#ffd4bf',
    '#ffbfbf', '#ffbfd4', '#ffbfe8', '#ffbfff', '#e8bfff',
    '#d4bfff'
  ],
  // Row 4: Slightly greyer version of row 2 - 21 unique colors
  [
    '#b3c6d9', '#b3ccd9', '#b3d3d9', '#b3d9d9', '#b3d9df',
    '#b3d9d3', '#b3d9cc', '#b3d9c6', '#b3d9bf', '#b3d9b3',
    '#c6d9b3', '#ccd9b3', '#d3d9b3', '#d9d9b3', '#d9ccb3',
    '#d9b3b3', '#d9b3c6', '#d9b3cc', '#d9b3d3', '#d3b3d9',
    '#c6b3d9'
  ]
];

const ALL_COLORS = COLOR_ROWS.flat();

export const SettingsModalTabbed: React.FC<SettingsModalProps> = ({ onClose }) => {
  const { isLicensed } = useLicenseStore();
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [zoomLevel, setZoomLevel] = useState(0);
  const [accentColor, setAccentColor] = useState('#99bbff');
  const [positiveColor, setPositiveColor] = useState('#99ff99');
  const [negativeColor, setNegativeColor] = useState('#ff9999');
  const [showColorPicker, setShowColorPicker] = useState<'accent' | 'positive' | 'negative' | null>(null);
  const [showFontPicker, setShowFontPicker] = useState<'monospace' | 'sans-serif' | null>(null);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { 
    globalWatermarkImage, setGlobalWatermark, 
    monoFont, sansFont, setMonoFont, setSansFont, 
    rememberTabs, setRememberTabs, 
    autoGenerateTitle, setAutoGenerateTitle 
  } = useClaudeCodeStore();
  
  
  // Hooks tab state
  const [hooks, setHooks] = useState<HookConfig[]>([]);
  const [selectedHooks, setSelectedHooks] = useState<Record<string, boolean>>({});
  const [hookScripts, setHookScripts] = useState<Record<string, string>>({});
  
  // Commands tab state
  const [commands, setCommands] = useState<any[]>([]);

  useEffect(() => {
    // Load hooks when hooks tab is active
    if (activeTab === 'hooks') {
      loadHooks();
    }
  }, [activeTab]);

  const loadHooks = () => {
    const allHooks = hooksService.getAllHooks();
    setHooks(allHooks);
  };

  useEffect(() => {
    // Get current zoom level
    const getZoom = async () => {
      if (window.electronAPI?.zoom?.getLevel) {
        try {
          const level = await window.electronAPI.zoom.getLevel();
          setZoomLevel(level);
        } catch (err) {
          console.error('Failed to get zoom level:', err);
          const saved = localStorage.getItem('zoomLevel');
          if (saved) {
            setZoomLevel(parseFloat(saved));
          }
        }
      } else {
        const saved = localStorage.getItem('zoomLevel');
        if (saved) {
          setZoomLevel(parseFloat(saved));
        }
      }
    };
    getZoom();

    // Get saved colors and apply them
    const savedAccentColor = localStorage.getItem('accentColor') || '#99bbff';
    setAccentColor(savedAccentColor);
    document.documentElement.style.setProperty('--accent-color', savedAccentColor);
    const accentHex = savedAccentColor.replace('#', '');
    const accentR = parseInt(accentHex.substr(0, 2), 16);
    const accentG = parseInt(accentHex.substr(2, 2), 16);
    const accentB = parseInt(accentHex.substr(4, 2), 16);
    document.documentElement.style.setProperty('--accent-rgb', `${accentR}, ${accentG}, ${accentB}`);

    const savedPositiveColor = localStorage.getItem('positiveColor') || '#99ff99';
    setPositiveColor(savedPositiveColor);
    document.documentElement.style.setProperty('--positive-color', savedPositiveColor);
    const positiveHex = savedPositiveColor.replace('#', '');
    const positiveR = parseInt(positiveHex.substr(0, 2), 16);
    const positiveG = parseInt(positiveHex.substr(2, 2), 16);
    const positiveB = parseInt(positiveHex.substr(4, 2), 16);
    document.documentElement.style.setProperty('--positive-rgb', `${positiveR}, ${positiveG}, ${positiveB}`);

    const savedNegativeColor = localStorage.getItem('negativeColor') || '#ff9999';
    setNegativeColor(savedNegativeColor);
    document.documentElement.style.setProperty('--negative-color', savedNegativeColor);
    const negativeHex = savedNegativeColor.replace('#', '');
    const negativeR = parseInt(negativeHex.substr(0, 2), 16);
    const negativeG = parseInt(negativeHex.substr(2, 2), 16);
    const negativeB = parseInt(negativeHex.substr(4, 2), 16);
    document.documentElement.style.setProperty('--negative-rgb', `${negativeR}, ${negativeG}, ${negativeB}`);

    // Listen for zoom changes
    const handleZoomChange = (e: any) => {
      setZoomLevel(e.detail);
    };
    window.addEventListener('zoom-changed', handleZoomChange);
    return () => window.removeEventListener('zoom-changed', handleZoomChange);
  }, []);


  const handleWatermarkUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file size (limit to 1MB)
    if (file.size > 1024 * 1024) {
      alert('Image must be less than 1MB');
      return;
    }

    // Convert to base64
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setGlobalWatermark(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveWatermark = () => {
    setGlobalWatermark(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };


  const handleZoomIn = async () => {
    if (window.electronAPI?.zoom?.in) {
      try {
        const newZoom = await window.electronAPI.zoom.in();
        if (newZoom !== null && newZoom !== undefined) {
          setZoomLevel(newZoom);
        }
      } catch (err) {
        console.error('Zoom in error:', err);
      }
    }
  };

  const handleZoomOut = async () => {
    if (window.electronAPI?.zoom?.out) {
      try {
        const newZoom = await window.electronAPI.zoom.out();
        if (newZoom !== null && newZoom !== undefined) {
          setZoomLevel(newZoom);
        }
      } catch (err) {
        console.error('Zoom out error:', err);
      }
    }
  };

  const handleResetZoom = async () => {
    if (window.electronAPI?.zoom?.reset) {
      try {
        const newZoom = await window.electronAPI.zoom.reset();
        if (newZoom !== null && newZoom !== undefined) {
          setZoomLevel(0);
        }
      } catch (err) {
        console.error('Reset zoom error:', err);
      }
    }
  };

  const handleAccentColorChange = (color: string) => {
    setAccentColor(color);
    localStorage.setItem('accentColor', color);
    document.documentElement.style.setProperty('--accent-color', color);
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    document.documentElement.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
  };

  const handlePositiveColorChange = (color: string) => {
    setPositiveColor(color);
    localStorage.setItem('positiveColor', color);
    document.documentElement.style.setProperty('--positive-color', color);
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    document.documentElement.style.setProperty('--positive-rgb', `${r}, ${g}, ${b}`);
  };

  const handleNegativeColorChange = (color: string) => {
    setNegativeColor(color);
    localStorage.setItem('negativeColor', color);
    document.documentElement.style.setProperty('--negative-color', color);
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    document.documentElement.style.setProperty('--negative-rgb', `${r}, ${g}, ${b}`);
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'general':
        return (
          <>
            {/* Color controls */}
            <div className="settings-section">
              <h4>theme colors</h4>
              <div className="color-settings-grid">
              <div className="color-setting">
                <span className="color-label">accent</span>
                <div className="color-controls">
                  <button
                    className="color-reset"
                    onClick={() => handleAccentColorChange('#99bbff')}
                    disabled={accentColor === '#99bbff'}
                  >
                    <IconRotateClockwise size={12} />
                  </button>
                  <div className="color-picker-container">
                    <button
                      className="color-preview"
                      onClick={() => setShowColorPicker('accent')}
                    >
                      <span className="color-square" style={{ backgroundColor: accentColor }} />
                      <span className="color-value">{accentColor}</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="color-setting">
                <span className="color-label">positive</span>
                <div className="color-controls">
                  <button
                    className="color-reset"
                    onClick={() => handlePositiveColorChange('#99ff99')}
                    disabled={positiveColor === '#99ff99'}
                  >
                    <IconRotateClockwise size={12} />
                  </button>
                  <div className="color-picker-container">
                    <button
                      className="color-preview"
                      onClick={() => setShowColorPicker('positive')}
                    >
                      <span className="color-square" style={{ backgroundColor: positiveColor }} />
                      <span className="color-value">{positiveColor}</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="color-setting">
                <span className="color-label">negative</span>
                <div className="color-controls">
                  <button
                    className="color-reset"
                    onClick={() => handleNegativeColorChange('#ff9999')}
                    disabled={negativeColor === '#ff9999'}
                  >
                    <IconRotateClockwise size={12} />
                  </button>
                  <div className="color-picker-container">
                    <button
                      className="color-preview"
                      onClick={() => setShowColorPicker('negative')}
                    >
                      <span className="color-square" style={{ backgroundColor: negativeColor }} />
                      <span className="color-value">{negativeColor}</span>
                    </button>
                  </div>
                </div>
              </div>
              </div>
            </div>


            {/* Font controls */}
            <div className="settings-section">
              <h4>fonts</h4>
              <div className="font-settings">
              <div className="font-setting">
                <span className="font-label">monospace</span>
                <div className="font-controls">
                  <button
                    className="color-reset"
                    onClick={() => setMonoFont('Fira Code')}
                    disabled={monoFont === 'Fira Code'}
                  >
                    <IconRotateClockwise size={12} />
                  </button>
                  <div 
                    className="font-input" 
                    onClick={() => setShowFontPicker('monospace')}
                    style={{ fontFamily: monoFont || 'Fira Code' }}
                  >
                    {monoFont || 'Fira Code'}
                  </div>
                </div>
              </div>

              <div className="font-setting">
                <span className="font-label">sans-serif</span>
                <div className="font-controls">
                  <button
                    className="color-reset"
                    onClick={() => setSansFont('Helvetica Neue')}
                    disabled={sansFont === 'Helvetica Neue'}
                  >
                    <IconRotateClockwise size={12} />
                  </button>
                  <div 
                    className="font-input" 
                    onClick={() => setShowFontPicker('sans-serif')}
                    style={{ fontFamily: sansFont || 'Helvetica Neue' }}
                  >
                    {sansFont || 'Helvetica Neue'}
                  </div>
                </div>
              </div>
              </div>
            </div>

            {/* Options */}
            <div className="settings-section">
              <h4>options</h4>
              
              <div className="checkbox-setting">
                <span className="checkbox-label">remember tabs on restart</span>
                <input 
                  type="checkbox" 
                  className="checkbox-input"
                  id="rememberTabs"
                  checked={rememberTabs}
                  onChange={(e) => setRememberTabs(e.target.checked)}
                />
                <div className="toggle-switch-container">
                  <label htmlFor="rememberTabs" className={`toggle-switch ${rememberTabs ? 'active' : ''}`}>
                    <span className="toggle-switch-slider" />
                    <span className="toggle-switch-label off">OFF</span>
                    <span className="toggle-switch-label on">ON</span>
                  </label>
                </div>
              </div>

              <div className="checkbox-setting">
                <span className="checkbox-label">auto-generate tab titles</span>
                <input 
                  type="checkbox" 
                  className="checkbox-input"
                  id="autoGenerateTitle"
                  checked={autoGenerateTitle}
                  onChange={(e) => setAutoGenerateTitle(e.target.checked)}
                />
                <div className="toggle-switch-container">
                  <label htmlFor="autoGenerateTitle" className={`toggle-switch ${autoGenerateTitle ? 'active' : ''}`}>
                    <span className="toggle-switch-slider" />
                    <span className="toggle-switch-label off">OFF</span>
                    <span className="toggle-switch-label on">ON</span>
                  </label>
                </div>
              </div>

              {/* Claude CLI Configuration */}
              <ClaudeSelector onSettingsChange={(settings) => {
                console.log('Claude settings updated:', settings);
              }} />
            </div>

            {/* About */}
            <div className="settings-actions">
              <button className="settings-action-btn about" onClick={() => setShowAboutModal(true)}>
                <IconInfoCircle size={12} />
                <span>about</span>
              </button>
            </div>
          </>
        );

      case 'hooks':
        return (
          <HooksTab 
            selectedHooks={selectedHooks}
            setSelectedHooks={setSelectedHooks}
            hookScripts={hookScripts}
            setHookScripts={setHookScripts}
          />
        );

      case 'commands':
        return (
          <div className="settings-section">
            <div className="settings-section-title">custom commands</div>
            <div className="commands-list">
              <p className="settings-placeholder">
                define custom slash commands for quick actions
              </p>
              <button className="add-command-btn">
                <IconPlus size={14} />
                add command
              </button>
              <div className="command-item">
                <input type="text" placeholder="/command" className="command-trigger" />
                <input type="text" placeholder="description" className="command-desc" />
                <textarea 
                  placeholder="action script..."
                  className="command-script"
                  rows={2}
                />
              </div>
            </div>
          </div>
        );

      case 'storage':
        return (
          <div className="settings-section">
            <div className="settings-section-title">storage management</div>
            
            {loadingStats ? (
              <div className="loading">loading statistics...</div>
            ) : dbStats ? (
              <div className="storage-stats">
                <div className="stat-item">
                  <label>database size</label>
                  <span>{formatBytes(dbStats.database_size || 0)}</span>
                </div>
                <div className="stat-item">
                  <label>sessions</label>
                  <span>{dbStats.sessions || 0}</span>
                </div>
                <div className="stat-item">
                  <label>messages</label>
                  <span>{dbStats.messages || 0}</span>
                </div>
                <div className="stat-item">
                  <label>total cost</label>
                  <span>${(dbStats.total_cost || 0).toFixed(2)}</span>
                </div>
              </div>
            ) : null}

            <div className="storage-actions">
              <button className="storage-btn export" onClick={handleExportData}>
                <IconDownload size={14} />
                export data
              </button>
              <button className="storage-btn import" onClick={handleImportData}>
                <IconUpload size={14} />
                import data
              </button>
              <button className="storage-btn danger" onClick={handleClearDatabase}>
                <IconTrash size={14} />
                clear all data
              </button>
            </div>

            <div className="storage-info">
              <p className="info-text">
                <IconAlertTriangle size={12} />
                clearing data will permanently delete all sessions and cannot be undone
              </p>
            </div>
          </div>
        );

      case 'advanced':
        return (
          <div className="settings-section">
            <div className="settings-section-title">advanced settings</div>
            <div className="advanced-list">
              <div className="advanced-item">
                <label>debug logging</label>
                <input type="checkbox" />
              </div>
              <div className="advanced-item">
                <label>performance monitoring</label>
                <input type="checkbox" />
              </div>
              <div className="advanced-item">
                <label>experimental features</label>
                <input type="checkbox" />
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <div className="settings-modal-overlay" onClick={onClose}>
        <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
          <div className="settings-header">
            <div className="settings-header-left">
              <h3>settings</h3>
              {/* Tab navigation in header */}
              <div className="settings-tabs-inline">
                <button 
                  className={`settings-tab-inline ${activeTab === 'general' ? 'active' : ''}`}
                  onClick={() => setActiveTab('general')}
                >
                  general
                </button>
                <button 
                  className={`settings-tab-inline ${activeTab === 'hooks' ? 'active' : ''}`}
                  onClick={() => setActiveTab('hooks')}
                >
                  hooks
                </button>
                <button 
                  className={`settings-tab-inline ${activeTab === 'commands' ? 'active' : ''}`}
                  onClick={() => setActiveTab('commands')}
                >
                  commands
                </button>
              </div>
            </div>
            <button className="settings-close" onClick={onClose}>
              <IconX size={16} />
            </button>
          </div>

          {/* Tab content */}
          <div className="settings-content">
            {renderTabContent()}
          </div>

          {/* Bottom controls - only show on general tab */}
          {activeTab === 'general' && (
            <div className="settings-bottom-controls">
              <div className="settings-bottom-left">
                <div>
                  <h4>zoom</h4>
                  <div className="zoom-controls compact">
                    <button 
                      className="zoom-btn small"
                      onClick={handleZoomOut}
                      disabled={zoomLevel <= -50}
                    >
                      <IconMinus size={12} />
                    </button>
                    <span className="zoom-level compact">{Math.round(zoomLevel)}%</span>
                    <button 
                      className="zoom-btn small"
                      onClick={handleZoomIn}
                      disabled={zoomLevel >= 200}
                    >
                      <IconPlus size={12} />
                    </button>
                    <button 
                      className="zoom-btn small"
                      onClick={handleResetZoom}
                      disabled={zoomLevel === 0}
                    >
                      <IconRotateClockwise size={12} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="settings-bottom-right">
                <div>
                  <h4>watermark image</h4>
                  <div className="watermark-controls">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleWatermarkUpload}
                      style={{ display: 'none' }}
                      id="watermark-upload-bottom"
                    />
                    {globalWatermarkImage ? (
                      <>
                        <button
                          className="color-reset"
                          onClick={handleRemoveWatermark}
                          title="remove watermark"
                        >
                          <IconRotateClockwise size={12} />
                        </button>
                        <img
                          src={globalWatermarkImage}
                          alt="watermark preview"
                          className="watermark-thumb"
                        />
                      </>
                    ) : (
                      <>
                        <button
                          className="color-reset"
                          onClick={handleRemoveWatermark}
                          title="remove watermark"
                          style={{ visibility: 'hidden' }}
                        >
                          <IconRotateClockwise size={12} />
                        </button>
                        <label htmlFor="watermark-upload-bottom" className="watermark-upload-btn">
                          <IconPhoto size={14} />
                        </label>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Color picker modal */}
      {showColorPicker && (
        <div className="color-picker-floating">
          <div className="color-picker-dropdown">
            <div className="color-picker-header">
              <h4>choose {showColorPicker} color</h4>
              <button className="color-picker-close" onClick={() => setShowColorPicker(null)}>
                <IconX size={14} />
              </button>
            </div>
            <div className="color-picker-content">
              {COLOR_ROWS.map((row, rowIndex) => (
                <div key={rowIndex} className="color-row">
                  {row.map(color => (
                    <button
                      key={color}
                      className={`color-swatch ${
                        (showColorPicker === 'accent' && color === accentColor) ||
                        (showColorPicker === 'positive' && color === positiveColor) ||
                        (showColorPicker === 'negative' && color === negativeColor)
                          ? 'active' : ''
                      }`}
                      style={{ backgroundColor: color }}
                      onClick={() => {
                        if (showColorPicker === 'accent') {
                          handleAccentColorChange(color);
                        } else if (showColorPicker === 'positive') {
                          handlePositiveColorChange(color);
                        } else if (showColorPicker === 'negative') {
                          handleNegativeColorChange(color);
                        }
                        setShowColorPicker(null);
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Font picker modal */}
      {showFontPicker && (
        <FontPickerModal
          isOpen={true}
          onClose={() => setShowFontPicker(null)}
          onSelect={(font) => {
            if (showFontPicker === 'monospace') {
              setMonoFont(font);
            } else {
              setSansFont(font);
            }
            setShowFontPicker(null);
          }}
          currentFont={showFontPicker === 'monospace' ? monoFont : sansFont}
          fontType={showFontPicker}
        />
      )}

      {/* About modal */}
      {showAboutModal && (
        <AboutModal 
          isOpen={true} 
          onClose={() => setShowAboutModal(false)} 
        />
      )}
    </>
  );
};