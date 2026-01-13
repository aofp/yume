import React, { useState, useEffect } from 'react';
import { IconX, IconSearch } from '@tabler/icons-react';
import { APP_NAME } from '../../config/app';
import './FontPickerModal.css';

// Access Tauri API if available
declare global {
  interface Window {
    __TAURI__?: any;
  }
}

interface FontPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (font: string) => void;
  currentFont: string;
  fontType: 'monospace' | 'sans-serif';
}

// Yurucode bundled fonts - always available (downloaded with app)
const YURUCODE_FONTS = ['Agave'];

export const FontPickerModal: React.FC<FontPickerModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  currentFont,
  fontType
}) => {
  if (!isOpen) return null;
  const [searchTerm, setSearchTerm] = useState('');
  const [systemFonts, setSystemFonts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Load system fonts on mount
  useEffect(() => {
    const loadSystemFonts = async () => {
      try {
        if (window.__TAURI__) {
          const { invoke } = window.__TAURI__.core;
          const fonts = await (invoke as any)('get_system_fonts') as string[];
          console.log('[FontPicker] Loaded system fonts:', fonts.length);
          setSystemFonts(fonts);
        }
      } catch (error) {
        console.error('[FontPicker] Failed to load system fonts:', error);
      } finally {
        setLoading(false);
      }
    };
    
    loadSystemFonts();
  }, []);
  
  // Get yurucode bundled fonts
  const getYurucodeFonts = () => {
    return YURUCODE_FONTS;
  };

  // Get system-detected fonts (excluding yurucode bundled fonts)
  const getDetectedSystemFonts = () => {
    if (systemFonts.length === 0) return [];

    const yurucodeFontNames = YURUCODE_FONTS.map(f => f.toLowerCase());

    // Show all fonts, no type filtering - exclude yurucode bundled fonts
    const filtered = systemFonts.filter(font => {
      const lower = font.toLowerCase();
      // Skip if it's a yurucode bundled font
      return !yurucodeFontNames.some(yf => lower.includes(yf.toLowerCase()));
    });

    return filtered.sort();
  };

  const yurucodeFonts = getYurucodeFonts();
  const otherFonts = getDetectedSystemFonts();

  const filteredYurucodeFonts = yurucodeFonts.filter(font =>
    font.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const filteredOtherFonts = otherFonts.filter(font =>
    font.toLowerCase().includes(searchTerm.toLowerCase())
  );

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleFontSelect = (font: string) => {
    onSelect(font);
    onClose();
  };

  return (
    <div className="font-picker-overlay" onClick={onClose}>
      <div className="font-picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="font-picker-header" onContextMenu={(e) => e.preventDefault()}>
          <h3>{fontType === 'monospace' ? 'monospace' : 'sans-serif'} fonts</h3>
          <button className="font-picker-close" onClick={onClose} title="close (esc)">
            <IconX size={16} />
          </button>
        </div>

        <div className="font-picker-search">
          <IconSearch size={14} stroke={1.5} />
          <input
            type="text"
            placeholder="search fonts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="font-search-input"
            autoFocus
          />
        </div>

        <div className="font-picker-list">
          {filteredYurucodeFonts.length > 0 && (
            <>
              <div className="font-section-header">{APP_NAME}</div>
              {filteredYurucodeFonts.map(font => (
                <button
                  key={font}
                  className={`font-option ${currentFont === font ? 'selected' : ''}`}
                  onClick={() => handleFontSelect(font)}
                  style={{ fontFamily: `"${font}"` }}
                >
                  <span className="font-name">{font}</span>
                  <span className="font-preview" style={{ fontFamily: `"${font}"` }}>
                    {fontType === 'monospace' ? 'const x = 42;' : 'Hello World'}
                  </span>
                </button>
              ))}
            </>
          )}
          {filteredOtherFonts.length > 0 && (
            <>
              <div className="font-section-header">system</div>
              {filteredOtherFonts.map(font => (
                <button
                  key={font}
                  className={`font-option ${currentFont === font ? 'selected' : ''}`}
                  onClick={() => handleFontSelect(font)}
                  style={{ fontFamily: `"${font}"` }}
                >
                  <span className="font-name">{font}</span>
                  <span className="font-preview" style={{ fontFamily: `"${font}"` }}>
                    {fontType === 'monospace' ? 'const x = 42;' : 'Hello World'}
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
};