import React, { useState, useEffect } from 'react';
import { IconX, IconPlus, IconMinus, IconRefresh } from '@tabler/icons-react';
import './SettingsModal.css';

interface SettingsModalProps {
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const [zoomLevel, setZoomLevel] = useState(0);
  const [accentColor, setAccentColor] = useState('#ff99cc');

  useEffect(() => {
    // Get current zoom level
    const getZoom = async () => {
      if (window.electronAPI?.zoom?.getLevel) {
        const level = await window.electronAPI.zoom.getLevel();
        setZoomLevel(level);
      } else {
        // Try to get from localStorage as fallback
        const saved = localStorage.getItem('zoomLevel');
        if (saved) setZoomLevel(parseFloat(saved));
      }
    };
    getZoom();

    // Get saved accent color
    const savedColor = localStorage.getItem('accentColor') || '#ff99cc';
    setAccentColor(savedColor);
  }, []);

  const handleZoomIn = async () => {
    if (window.electronAPI?.zoom?.in) {
      const newZoom = await window.electronAPI.zoom.in();
      setZoomLevel(newZoom);
    } else {
      // Fallback - just update localStorage
      const newZoom = zoomLevel + 0.5;
      setZoomLevel(newZoom);
      localStorage.setItem('zoomLevel', newZoom.toString());
    }
  };

  const handleZoomOut = async () => {
    if (window.electronAPI?.zoom?.out) {
      const newZoom = await window.electronAPI.zoom.out();
      setZoomLevel(newZoom);
    } else {
      // Fallback - just update localStorage
      const newZoom = zoomLevel - 0.5;
      setZoomLevel(newZoom);
      localStorage.setItem('zoomLevel', newZoom.toString());
    }
  };

  const handleZoomReset = async () => {
    if (window.electronAPI?.zoom?.reset) {
      const newZoom = await window.electronAPI.zoom.reset();
      setZoomLevel(newZoom);
    } else {
      // Fallback - just update localStorage
      setZoomLevel(0);
      localStorage.setItem('zoomLevel', '0');
    }
  };

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newColor = e.target.value;
    setAccentColor(newColor);
    
    // Apply the color immediately
    document.documentElement.style.setProperty('--accent-color', newColor);
    
    // Convert hex to RGB for rgba() usage
    const hex = newColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    document.documentElement.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
    
    // Save to localStorage
    localStorage.setItem('accentColor', newColor);
  };

  const getZoomPercentage = () => {
    // Convert zoom level to percentage (0 = 100%, 1 = 110%, -1 = 90%, etc.)
    return Math.round(100 * Math.pow(1.1, zoomLevel));
  };

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
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
              <button className="zoom-btn" onClick={handleZoomReset}>
                <IconRefresh size={14} />
              </button>
            </div>
          </div>

          <div className="settings-section">
            <h4>accent color</h4>
            <div className="color-controls">
              <input
                type="color"
                className="color-picker"
                value={accentColor}
                onChange={handleColorChange}
              />
              <span className="color-value">{accentColor}</span>
              <button 
                className="color-reset"
                onClick={() => handleColorChange({ target: { value: '#ff99cc' } } as any)}
              >
                reset
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};