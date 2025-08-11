import React, { useState, useEffect } from 'react';
import { IconX, IconPlus, IconMinus, IconRefresh } from '@tabler/icons-react';
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

// Predefined color swatches - 32 colors organized in rainbow spectrum
const COLOR_SWATCHES = [
  '#bbbbbb', // default grey (first)
  // Reds
  '#ff9999', // pastel red
  '#ff8080', // coral
  '#ffb3b3', // light salmon
  '#ffcccc', // pale pink
  // Oranges
  '#ffb399', // light orange
  '#ffcc99', // pastel orange
  '#ffd4a3', // peach
  '#ffe0b3', // apricot
  // Yellows
  '#ffff99', // pastel yellow
  '#ffffb3', // light yellow
  '#ffffcc', // cream
  // Yellow-Greens
  '#e6ff99', // lime yellow
  '#ccff99', // pastel lime
  '#b3ff99', // light lime
  // Greens
  '#99ff99', // pastel green
  '#99ffb3', // mint green
  '#99ffcc', // pastel mint
  '#b3ffb3', // light green
  // Cyans
  '#99ffe6', // aqua mint
  '#99ffff', // pastel cyan
  '#b3ffff', // light cyan
  '#ccffff', // pale cyan
  // Blues
  '#99ddff', // sky blue
  '#99ccff', // pastel sky
  '#99b3ff', // light blue
  '#9999ff', // pastel blue
  // Purples
  '#b3b3ff', // periwinkle
  '#cc99ff', // pastel purple
  '#e6b3ff', // lavender
  '#ff99ff', // pastel magenta
  '#ff99cc', // pink/magenta
];

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const [zoomLevel, setZoomLevel] = useState(0);
  const [accentColor, setAccentColor] = useState('#bbbbbb');

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
    const savedColor = localStorage.getItem('accentColor') || '#bbbbbb';
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
        onClose();
      }
      // Also close on Ctrl+, or Cmd+,
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h3>settings</h3>
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
            <div className="color-swatches">
              {COLOR_SWATCHES.map((color) => (
                <button
                  key={color}
                  className={`color-swatch ${accentColor === color ? 'active' : ''}`}
                  style={{ backgroundColor: color }}
                  onClick={() => handleColorSelect(color)}
                  title={color}
                />
              ))}
            </div>
            <div className="color-info">
              <span className="color-value">{accentColor}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};