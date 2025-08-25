import React, { useState, useEffect, useRef } from 'react';
import { IconX, IconPlus, IconMinus, IconSettings, IconPalette, IconPhoto, IconRotateClockwise, IconCrown, IconInfoCircle } from '@tabler/icons-react';
import './SettingsModal.css';
import { useClaudeCodeStore } from '../../stores/claudeCodeStore';
import { useLicenseStore } from '../../services/licenseManager';
import { FontPickerModal } from '../FontPicker/FontPickerModal';
import { AboutModal } from '../About/AboutModal';

// Access the electron API exposed by preload script
declare global {
  interface Window {
    electronAPI?: any;
  }
}

interface SettingsModalProps {
  onClose: () => void;
}

// Color swatches organized in 4 rows
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

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const { isLicensed } = useLicenseStore();
  const [zoomLevel, setZoomLevel] = useState(0);
  const [accentColor, setAccentColor] = useState('#99bbff');
  const [positiveColor, setPositiveColor] = useState('#99eeff'); // default cyan
  const [negativeColor, setNegativeColor] = useState('#ff99ff'); // default magenta
  const [showColorPicker, setShowColorPicker] = useState<'accent' | 'positive' | 'negative' | null>(null);
  const [showFontPicker, setShowFontPicker] = useState<'monospace' | 'sans-serif' | null>(null);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { globalWatermarkImage, setGlobalWatermark, monoFont, sansFont, setMonoFont, setSansFont, rememberTabs, setRememberTabs, autoGenerateTitle, setAutoGenerateTitle } = useClaudeCodeStore();
  const [selectedFont, setSelectedFont] = useState<string>('');

  useEffect(() => {
    // Get current zoom level
    const getZoom = async () => {
      if (window.electronAPI?.zoom?.getLevel) {
        try {
          const level = await window.electronAPI.zoom.getLevel();
          setZoomLevel(level);
          console.log('Got zoom level from electronAPI:', level);
        } catch (err) {
          console.error('Failed to get zoom level:', err);
          // Fallback to localStorage
          const saved = localStorage.getItem('zoomLevel');
          if (saved) {
            setZoomLevel(parseFloat(saved));
          }
        }
      } else {
        // Fallback to localStorage if electronAPI not available
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
    // Apply accent color
    document.documentElement.style.setProperty('--accent-color', savedAccentColor);
    const accentHex = savedAccentColor.replace('#', '');
    const accentR = parseInt(accentHex.substr(0, 2), 16);
    const accentG = parseInt(accentHex.substr(2, 2), 16);
    const accentB = parseInt(accentHex.substr(4, 2), 16);
    document.documentElement.style.setProperty('--accent-rgb', `${accentR}, ${accentG}, ${accentB}`);

    const savedPositiveColor = localStorage.getItem('positiveColor') || '#99eeff';
    setPositiveColor(savedPositiveColor);
    // Apply positive color
    document.documentElement.style.setProperty('--positive-color', savedPositiveColor);
    const positiveHex = savedPositiveColor.replace('#', '');
    const positiveR = parseInt(positiveHex.substr(0, 2), 16);
    const positiveG = parseInt(positiveHex.substr(2, 2), 16);
    const positiveB = parseInt(positiveHex.substr(4, 2), 16);
    document.documentElement.style.setProperty('--positive-rgb', `${positiveR}, ${positiveG}, ${positiveB}`);

    const savedNegativeColor = localStorage.getItem('negativeColor') || '#ff99ff';
    setNegativeColor(savedNegativeColor);
    // Apply negative color
    document.documentElement.style.setProperty('--negative-color', savedNegativeColor);
    const negativeHex = savedNegativeColor.replace('#', '');
    const negativeR = parseInt(negativeHex.substr(0, 2), 16);
    const negativeG = parseInt(negativeHex.substr(2, 2), 16);
    const negativeB = parseInt(negativeHex.substr(4, 2), 16);
    document.documentElement.style.setProperty('--negative-rgb', `${negativeR}, ${negativeG}, ${negativeB}`);

    // Listen for zoom changes from keyboard shortcuts
    const handleZoomChange = (e: any) => {
      setZoomLevel(e.detail);
    };
    window.addEventListener('zoom-changed', handleZoomChange);
    return () => window.removeEventListener('zoom-changed', handleZoomChange);
  }, []);

  const handleZoomIn = async () => {
    console.log('Zoom in clicked');

    if (window.electronAPI?.zoom?.in) {
      try {
        const newZoom = await window.electronAPI.zoom.in();
        console.log('Zoom in via electronAPI, result:', newZoom);
        if (newZoom !== null && newZoom !== undefined) {
          setZoomLevel(newZoom);
        }
      } catch (err) {
        console.error('Zoom in error:', err);
      }
    } else {
      console.error('electronAPI.zoom not available');
    }
  };

  const handleZoomOut = async () => {
    console.log('Zoom out clicked');

    if (window.electronAPI?.zoom?.out) {
      try {
        const newZoom = await window.electronAPI.zoom.out();
        console.log('Zoom out via electronAPI, result:', newZoom);
        if (newZoom !== null && newZoom !== undefined) {
          setZoomLevel(newZoom);
        }
      } catch (err) {
        console.error('Zoom out error:', err);
      }
    } else {
      console.error('electronAPI.zoom not available');
    }
  };

  const handleZoomReset = async () => {
    console.log('Zoom reset clicked');

    if (window.electronAPI?.zoom?.reset) {
      try {
        const newZoom = await window.electronAPI.zoom.reset();
        console.log('Zoom reset via electronAPI, result:', newZoom);
        if (newZoom !== null && newZoom !== undefined) {
          setZoomLevel(newZoom);
        }
      } catch (err) {
        console.error('Zoom reset error:', err);
      }
    } else {
      console.error('electronAPI.zoom not available');
    }
  };

  const handleColorSelect = (color: string, type: 'accent' | 'positive' | 'negative') => {
    // Convert hex to RGB for rgba() usage
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);

    if (type === 'accent') {
      setAccentColor(color);
      document.documentElement.style.setProperty('--accent-color', color);
      document.documentElement.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
      localStorage.setItem('accentColor', color);
    } else if (type === 'positive') {
      setPositiveColor(color);
      document.documentElement.style.setProperty('--positive-color', color);
      document.documentElement.style.setProperty('--positive-rgb', `${r}, ${g}, ${b}`);
      localStorage.setItem('positiveColor', color);
    } else if (type === 'negative') {
      setNegativeColor(color);
      document.documentElement.style.setProperty('--negative-color', color);
      document.documentElement.style.setProperty('--negative-rgb', `${r}, ${g}, ${b}`);
      localStorage.setItem('negativeColor', color);
    }
  };

  const handleWatermarkUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check if it's an image
    if (!file.type.startsWith('image/')) {
      console.error('selected file is not an image');
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


  const getZoomPercentage = () => {
    // Convert zoom level to percentage (0 = 100%, 1 = 110%, -1 = 90%, etc.)
    return 100 + (zoomLevel * 10);
  };

  // Handle Escape key and Ctrl+,
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showColorPicker) {
          setShowColorPicker(null);
        } else {
          onClose();
        }
      }
      // Also close on Ctrl+, or Cmd+,
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, showColorPicker]);

  // Handle click outside color picker dropdown
  useEffect(() => {
    if (showColorPicker) {
      const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (!target.closest('.color-picker-floating') && !target.closest('.color-preview')) {
          setShowColorPicker(null);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showColorPicker]);


  return (
    <>
      <div className="settings-modal-overlay" onClick={onClose}>
        <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
          <div className="settings-header" data-tauri-drag-region>
            <h3>
              <IconSettings size={16} stroke={1.5} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
              settings
            </h3>
            <button className="settings-close" onClick={onClose}>
              <IconX size={16} />
            </button>
          </div>

          <div className="settings-content">
            <div className="settings-section">
              <h4>preferences</h4>
              <label className="checkbox-setting">
                <span className="checkbox-label">remember tabs</span>
                <input
                  type="checkbox"
                  checked={rememberTabs}
                  onChange={(e) => {
                    e.stopPropagation();
                    setRememberTabs(e.target.checked);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="checkbox-input"
                />
              </label>
              <label className="checkbox-setting">
                <span className="checkbox-label">auto-generate titles</span>
                <input
                  type="checkbox"
                  checked={autoGenerateTitle}
                  onChange={(e) => {
                    e.stopPropagation();
                    setAutoGenerateTitle(e.target.checked);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="checkbox-input"
                />
              </label>
            </div>

            <div className="settings-section">
              <h4>colors</h4>
              <div className="color-settings-grid">
                <div className="color-setting">
                  <span className="color-label">accent</span>
                  <div className="color-controls">
                    <button
                      className="color-reset"
                      onClick={() => handleColorSelect('#99bbff', 'accent')}
                      title="reset to default blue"
                      disabled={accentColor === '#99bbff'}
                    >
                      <IconRotateClockwise size={12} />
                    </button>
                    <button
                      className="color-preview compact"
                      onClick={() => setShowColorPicker(showColorPicker === 'accent' ? null : 'accent')}
                      title="click to select accent color"
                    >
                      <span className="color-square" style={{ backgroundColor: accentColor }} />
                      <span className="color-value">{accentColor}</span>
                    </button>
                  </div>
                </div>

                <div className="color-setting">
                  <span className="color-label">positive</span>
                  <div className="color-controls">
                    <button
                      className="color-reset"
                      onClick={() => handleColorSelect('#99eeff', 'positive')}
                      title="reset to default cyan"
                      disabled={positiveColor === '#99eeff'}
                    >
                      <IconRotateClockwise size={12} />
                    </button>
                    <button
                      className="color-preview compact"
                      onClick={() => setShowColorPicker(showColorPicker === 'positive' ? null : 'positive')}
                      title="click to select positive color"
                    >
                      <span className="color-square" style={{ backgroundColor: positiveColor }} />
                      <span className="color-value">{positiveColor}</span>
                    </button>
                  </div>
                </div>

                <div className="color-setting">
                  <span className="color-label">negative</span>
                  <div className="color-controls">
                    <button
                      className="color-reset"
                      onClick={() => handleColorSelect('#ff99ff', 'negative')}
                      title="reset to default magenta"
                      disabled={negativeColor === '#ff99ff'}
                    >
                      <IconRotateClockwise size={12} />
                    </button>
                    <button
                      className="color-preview compact"
                      onClick={() => setShowColorPicker(showColorPicker === 'negative' ? null : 'negative')}
                      title="click to select negative color"
                    >
                      <span className="color-square" style={{ backgroundColor: negativeColor }} />
                      <span className="color-value">{negativeColor}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="settings-section">
              <h4>fonts</h4>
              <div className="font-settings">
                <div className="font-setting">
                  <span className="font-label">monospace</span>
                  <div className="font-controls">
                    <button
                      className="color-reset"
                      onClick={() => setMonoFont('Fira Code')}
                      title="reset to default"
                      disabled={!monoFont || monoFont === 'Fira Code'}
                    >
                      <IconRotateClockwise size={12} />
                    </button>
                    <button
                      className="font-input"
                      onClick={() => {
                        setSelectedFont(monoFont || 'Fira Code');
                        setShowFontPicker('monospace');
                      }}
                      style={{ fontFamily: monoFont || 'Fira Code' }}
                    >
                      {monoFont || 'Fira Code'}
                    </button>
                  </div>
                </div>
                <div className="font-setting">
                  <span className="font-label">sans-serif</span>
                  <div className="font-controls">
                    <button
                      className="color-reset"
                      onClick={() => setSansFont('Helvetica')}
                      title="reset to default"
                      disabled={!sansFont || sansFont === 'Helvetica'}
                    >
                      <IconRotateClockwise size={12} />
                    </button>
                    <button
                      className="font-input"
                      onClick={() => {
                        setSelectedFont(sansFont || 'Helvetica Neue');
                        setShowFontPicker('sans-serif');
                      }}
                      style={{ fontFamily: sansFont || 'Helvetica Neue' }}
                    >
                      {sansFont || 'Helvetica Neue'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="settings-actions">
              {!isLicensed && (
                <button
                  className="settings-action-btn"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('showUpgradeModal', { detail: { reason: 'feature' } }));
                  }}
                  title="upgrade to pro"
                >
                  <IconCrown size={10} />
                  <span>upgrade to pro</span>
                </button>
              )}
              <button
                className="settings-action-btn about"
                onClick={() => {
                  setShowAboutModal(true);
                }}
                title="about yurucode"
              >
                <IconInfoCircle size={10} />
                <span>about yurucode</span>
              </button>
            </div>

          </div>

          <div className="settings-bottom-controls">
            <div className="settings-bottom-left">
              <div>
                <h4>zoom</h4>
                <div className="zoom-controls compact">
                  <button className="zoom-btn small" onClick={handleZoomOut}>
                    <IconMinus size={12} />
                  </button>
                  <button className="zoom-btn small" onClick={handleZoomIn}>
                    <IconPlus size={12} />
                  </button>
                  <button
                    className="zoom-btn small"
                    onClick={handleZoomReset}
                    disabled={zoomLevel === 0}
                    title={zoomLevel === 0 ? "already at 100%" : "reset zoom to 100%"}
                  >
                    <IconRotateClockwise size={12} />
                  </button>
                  <span className="zoom-level compact">{getZoomPercentage()}%</span>
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
                    id="watermark-upload"
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
                      <label htmlFor="watermark-upload" className="watermark-upload-btn">
                        <IconPhoto size={14} />
                      </label>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showColorPicker && (
        <div className="color-picker-floating">
          <div className="color-picker-dropdown">
            <div className="color-picker-header">
              <h4>
                <IconPalette size={14} stroke={1.5} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                choose {showColorPicker} color
              </h4>
              <button className="color-picker-close" onClick={() => setShowColorPicker(null)}>
                <IconX size={14} />
              </button>
            </div>
            <div className="color-picker-content">
              {COLOR_ROWS.map((row, rowIndex) => (
                <div key={rowIndex} className={`color-row color-row-${rowIndex + 1}`}>
                  {row.map((color) => {
                    const currentColor = showColorPicker === 'accent' ? accentColor :
                      showColorPicker === 'positive' ? positiveColor :
                        negativeColor;
                    return (
                      <button
                        key={color}
                        className={`color-swatch ${currentColor === color ? 'active' : ''}`}
                        style={{ backgroundColor: color }}
                        onClick={() => {
                          handleColorSelect(color, showColorPicker);
                          setShowColorPicker(null);
                        }}
                        title={color}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showFontPicker && (
        <FontPickerModal
          fontType={showFontPicker}
          currentFont={selectedFont}
          onSelect={(font) => {
            if (showFontPicker === 'monospace') {
              setMonoFont(font);
            } else {
              setSansFont(font);
            }
            setShowFontPicker(null);
          }}
          onClose={() => setShowFontPicker(null)}
        />
      )}
      {showAboutModal && (
        <AboutModal isOpen={showAboutModal} onClose={() => setShowAboutModal(false)} />
      )}
    </>
  );
};