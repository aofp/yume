import React, { useState, useEffect } from 'react';
import { IconX, IconSearch } from '@tabler/icons-react';
import './FontPickerModal.css';

// Access Tauri API if available
declare global {
  interface Window {
    __TAURI__?: any;
  }
}

interface FontPickerModalProps {
  onClose: () => void;
  onSelect: (font: string) => void;
  currentFont: string;
  fontType: 'monospace' | 'sans-serif';
}

const DEFAULT_MONOSPACE_FONTS = [
  'Fira Code',
  'JetBrains Mono',
  'Monaco',
  'Menlo',
  'SF Mono',
  'Consolas',
  'Source Code Pro',
  'Inconsolata',
  'Hack',
  'Courier New',
  'monospace'
];

const DEFAULT_SANS_SERIF_FONTS = [
  'Helvetica',
  'Arial',
  'Segoe UI',
  'System UI',
  '-apple-system',
  'sans-serif'
];

export const FontPickerModal: React.FC<FontPickerModalProps> = ({
  onClose,
  onSelect,
  currentFont,
  fontType
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [systemFonts, setSystemFonts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Load system fonts on mount
  useEffect(() => {
    const loadSystemFonts = async () => {
      try {
        if (window.__TAURI__) {
          const { invoke } = window.__TAURI__.core;
          const fonts = await invoke<string[]>('get_system_fonts');
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
  
  // Filter fonts based on type and availability
  const getAvailableFonts = () => {
    const defaults = fontType === 'monospace' ? DEFAULT_MONOSPACE_FONTS : DEFAULT_SANS_SERIF_FONTS;
    
    if (systemFonts.length > 0) {
      // For monospace, filter for known monospace keywords
      // For sans-serif, show all fonts except monospace ones
      const monoKeywords = ['mono', 'code', 'courier', 'consolas', 'menlo', 'monaco', 'hack', 'inconsolata', 'jetbrains', 'fira'];
      
      let relevant: string[];
      if (fontType === 'monospace') {
        // Show fonts that contain monospace keywords
        relevant = systemFonts.filter(f => 
          monoKeywords.some(keyword => f.toLowerCase().includes(keyword))
        );
      } else {
        // Show all fonts that don't contain monospace keywords
        relevant = systemFonts.filter(f => 
          !monoKeywords.some(keyword => f.toLowerCase().includes(keyword))
        );
      }
      
      // Add generic fallbacks at the end
      const genericFallbacks = fontType === 'monospace' ? ['monospace'] : ['sans-serif', '-apple-system', 'system-ui'];
      const combined = [...new Set([...relevant, ...genericFallbacks])];
      return combined.sort((a, b) => {
        // Put generic fallbacks at the end
        if (genericFallbacks.includes(a)) return 1;
        if (genericFallbacks.includes(b)) return -1;
        return a.localeCompare(b);
      });
    }
    
    return defaults;
  };
  
  const fonts = getAvailableFonts();
  const filteredFonts = fonts.filter(font => 
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
        <div className="font-picker-header">
          <h3>{fontType === 'monospace' ? 'monospace' : 'sans-serif'} fonts</h3>
          <button className="font-picker-close" onClick={onClose}>
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
          {filteredFonts.map(font => (
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
        </div>
      </div>
    </div>
  );
};