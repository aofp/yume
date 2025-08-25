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
    // ALWAYS start with our essential fonts - no matter what
    let fontList: string[] = [];
    
    if (fontType === 'monospace') {
      // ALWAYS include Fira Code first for monospace
      fontList = [
        'Fira Code',
        'Consolas', 
        'Courier New',
        'JetBrains Mono',
        'Monaco',
        'Menlo',
        'SF Mono',
        'Source Code Pro',
        'Inconsolata',
        'Hack',
        'monospace'
      ];
    } else {
      // ALWAYS include Helvetica first for sans-serif
      fontList = [
        'Helvetica',
        'Helvetica Neue',
        'Arial',
        'Segoe UI',
        'Inter',
        'System UI',
        '-apple-system',
        'sans-serif'
      ];
    }
    
    // If we have system fonts, add them (but don't replace our list)
    if (systemFonts.length > 0) {
      const monoKeywords = ['mono', 'code', 'courier', 'consolas', 'menlo', 'monaco', 'hack', 'inconsolata', 'jetbrains', 'fira'];
      
      let additionalFonts: string[];
      if (fontType === 'monospace') {
        additionalFonts = systemFonts.filter(f => 
          monoKeywords.some(keyword => f.toLowerCase().includes(keyword))
        );
      } else {
        additionalFonts = systemFonts.filter(f => 
          !monoKeywords.some(keyword => f.toLowerCase().includes(keyword))
        );
      }
      
      // Add system fonts that aren't already in our list
      additionalFonts.forEach(font => {
        if (!fontList.some(f => f.toLowerCase() === font.toLowerCase())) {
          fontList.push(font);
        }
      });
    }
    
    console.log(`[FontPicker] Returning ${fontList.length} fonts for ${fontType}:`, fontList);
    return fontList;
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