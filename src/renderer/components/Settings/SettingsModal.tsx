import React, { useState, useEffect } from 'react';
import { IconX, IconPlus, IconMinus, IconRefresh, IconSettings, IconPalette } from '@tabler/icons-react';
import './SettingsModal.css';

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
    '#cccccc', '#ffffff'
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
    '#b3ccff', '#b3d9ff', '#b3e6ff', '#b3f2ff', '#b3ffff',
    '#b3fff2', '#b3ffe6', '#b3ffd9', '#b3ffcc', '#b3ffb3',
    '#ccffb3', '#e6ffb3', '#ffffb3', '#ffe6b3', '#ffccb3',
    '#ffb3b3', '#ffb3cc', '#ffb3e6', '#ffb3ff', '#e6b3ff',
    '#ccb3ff'
  ],
  
  // Row 4: Slightly greyer version of row 2 - 21 unique colors
  [
    '#b3c6d9', '#b3ccd9', '#b3d3d9', '#b3d9d9', '#b3d9d9',
    '#b3d9d3', '#b3d9cc', '#b3d9c6', '#b3d9bf', '#b3d9b3',
    '#c6d9b3', '#ccd9b3', '#d3d9b3', '#d9d9b3', '#d9ccb3',
    '#d9b3b3', '#d9b3c6', '#d9b3cc', '#d9b3d3', '#d3b3d9',
    '#c6b3d9'
  ]
];

const ALL_COLORS = COLOR_ROWS.flat();

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const [zoomLevel, setZoomLevel] = useState(0);
  const [accentColor, setAccentColor] = useState('#cccccc');
  const [showColorPicker, setShowColorPicker] = useState(false);

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

    // Get saved accent color
    const savedColor = localStorage.getItem('accentColor') || '#cccccc';
    setAccentColor(savedColor);

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

  const handleColorSelect = (color: string) => {
    setAccentColor(color);
    
    // Apply the color immediately
    document.documentElement.style.setProperty('--accent-color', color);
    
    // Convert hex to RGB for rgba() usage
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    document.documentElement.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
    
    // Save to localStorage
    localStorage.setItem('accentColor', color);
  };

  const getZoomPercentage = () => {
    // Convert zoom level to percentage (0 = 100%, 1 = 110%, -1 = 90%, etc.)
    return Math.round(100 * Math.pow(1.1, zoomLevel));
  };

  // Handle Escape key and Ctrl+,
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showColorPicker) {
          setShowColorPicker(false);
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
        if (!target.closest('.color-picker-container')) {
          setShowColorPicker(false);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showColorPicker]);


  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
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
            <h4>zoom</h4>
            <div className="zoom-controls">
              <button className="zoom-btn" onClick={handleZoomOut}>
                <IconMinus size={14} />
              </button>
              <span className="zoom-level">{getZoomPercentage()}%</span>
              <button className="zoom-btn" onClick={handleZoomIn}>
                <IconPlus size={14} />
              </button>
              <button 
                className="zoom-btn" 
                onClick={handleZoomReset}
                disabled={zoomLevel === 0}
                title={zoomLevel === 0 ? "already at 100%" : "reset zoom to 100%"}
              >
                <IconRefresh size={14} />
              </button>
            </div>
          </div>

          <div className="settings-section">
            <h4>accent color</h4>
            <div className="color-picker-container">
              <button 
                className="color-preview"
                onClick={() => setShowColorPicker(!showColorPicker)}
                title="click to select color"
              >
                <span className="color-square" style={{ backgroundColor: accentColor }} />
                <span className="color-value">{accentColor}</span>
              </button>
              
              {showColorPicker && (
                <div className="color-picker-dropdown">
                  <div className="color-picker-header">
                    <h4>
                      <IconPalette size={14} stroke={1.5} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                      choose accent color
                    </h4>
                    <button className="color-picker-close" onClick={() => setShowColorPicker(false)}>
                      <IconX size={14} />
                    </button>
                  </div>
                  <div className="color-picker-content">
                    {COLOR_ROWS.map((row, rowIndex) => (
                      <div key={rowIndex} className={`color-row color-row-${rowIndex + 1}`}>
                        {row.map((color) => (
                          <button
                            key={color}
                            className={`color-swatch ${accentColor === color ? 'active' : ''}`}
                            style={{ backgroundColor: color }}
                            onClick={() => {
                              handleColorSelect(color);
                              setShowColorPicker(false);
                            }}
                            title={color}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};