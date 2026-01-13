import React, { useState, useRef, useEffect, useCallback } from 'react';
import { IconX } from '@tabler/icons-react';

interface ColorPickerProps {
  color: string;
  colorType: 'background' | 'foreground' | 'accent' | 'positive' | 'negative';
  onChange: (color: string) => void;
  onClose: () => void;
  onPreview?: (color: string) => void;
  onPreviewEnd?: () => void;
}

// Background presets (from themes + similar subtle dark colors)
const BG_PRESETS = [
  // Row 1: Theme backgrounds (yurucode, slate, arctic, pulse, iota, bourbon, burnt, rose, cobalt, ochre)
  ['#0f0f0f', '#0a0a0a', '#0a0a0d', '#050505', '#0d0c0e', '#100f0f', '#0a0808', '#080a0a', '#060810', '#0a0908'],
  // Row 2: More theme backgrounds + subtle variations (void, grove, warm tints, cool tints)
  ['#000000', '#0a0a08', '#0c0a0a', '#0a0c0c', '#0a0a0c', '#080808', '#0c0c0c', '#0e0e0e', '#101010', '#121212']
];

// Foreground presets (from themes + similar light colors)
const FG_PRESETS = [
  // Row 1: Theme foregrounds (yurucode, slate, arctic, pulse, iota, bourbon, burnt, rose, cobalt, ochre)
  ['#ffffff', '#c0c5ce', '#c6c8d1', '#f0f0f0', '#e7e7da', '#e8dcd0', '#c9d1d9', '#d6deeb', '#faf0d6', '#d4d4d4'],
  // Row 2: More theme foregrounds + variations (void, grove, warm/cool tints)
  ['#bacebe', '#e0e0e0', '#f5f5f5', '#fafafa', '#eeeeee', '#d0d0d0', '#c8c8c8', '#b8b8b8', '#a8a8a8', '#989898']
];

// Accent presets (from themes + similar vibrant colors)
const ACCENT_PRESETS = [
  // Row 1: Theme accents (yurucode, slate, arctic, pulse, iota, bourbon, burnt, rose, cobalt, ochre)
  ['#c4b5ff', '#61afef', '#8fb8c8', '#36d7e6', '#9df5bd', '#e4d9bd', '#d57b60', '#e890a0', '#82aaff', '#e9a828'],
  // Row 2: More theme accents + variations (void, grove, similar pastels)
  ['#a0a0b0', '#83c092', '#a78bfa', '#60a5fa', '#f472b6', '#4ade80', '#22d3ee', '#facc15', '#e879f9', '#fb923c']
];

// Positive presets (from themes + similar greens/teals)
const POSITIVE_PRESETS = [
  // Row 1: Theme positives (yurucode, slate, arctic, pulse, iota, bourbon, burnt, rose, cobalt, ochre)
  ['#99ff99', '#98c379', '#b4be82', '#72f1b8', '#06b6d4', '#7cc07c', '#8fbc8f', '#56d364', '#addb67', '#87bb26'],
  // Row 2: More theme positives + variations (void, grove, similar greens)
  ['#e0f5e4', '#74d1d8', '#4ade80', '#34d399', '#2dd4bf', '#22d3ee', '#a3e635', '#10b981', '#14b8a6', '#84cc16']
];

// Negative presets (from themes + similar reds/pinks)
const NEGATIVE_PRESETS = [
  // Row 1: Theme negatives (yurucode, slate, arctic, pulse, iota, bourbon, burnt, rose, cobalt, ochre)
  ['#ff9999', '#e06c75', '#e27878', '#f25d7a', '#ec4899', '#df8383', '#fd8b8b', '#f47676', '#ef5350', '#cc241d'],
  // Row 2: More theme negatives + variations (void, grove, similar reds)
  ['#d09b9b', '#e67e80', '#f87171', '#fb7185', '#f472b6', '#ef4444', '#df2d53', '#dc2626', '#f43f5e', '#be123c']
];

// HSV utilities (color picker uses HSV model, not HSL)
const hexToHsv = (hex: string): { h: number; s: number; v: number } => {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;

  if (max !== min) {
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return { h: h * 360, s: s * 100, v: v * 100 };
};

const hsvToHex = (h: number, s: number, v: number): string => {
  s /= 100;
  v /= 100;

  const i = Math.floor(h / 60) % 6;
  const f = h / 60 - Math.floor(h / 60);
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);

  let r = 0, g = 0, b = 0;
  switch (i) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }

  const toHex = (c: number) => Math.round(c * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

export const ColorPicker: React.FC<ColorPickerProps> = ({
  color,
  colorType,
  onChange,
  onClose,
  onPreview,
  onPreviewEnd
}) => {
  const [hsv, setHsv] = useState(() => hexToHsv(color));
  const [hexInput, setHexInput] = useState(color.toLowerCase());
  const [isDragging, setIsDragging] = useState<'square' | 'hue' | null>(null);

  const squareRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);

  // Get presets based on color type
  const presets = colorType === 'background' ? BG_PRESETS :
                  colorType === 'foreground' ? FG_PRESETS :
                  colorType === 'accent' ? ACCENT_PRESETS :
                  colorType === 'positive' ? POSITIVE_PRESETS :
                  colorType === 'negative' ? NEGATIVE_PRESETS :
                  ACCENT_PRESETS;

  // Update hex input when color changes externally
  useEffect(() => {
    setHexInput(color.toLowerCase());
    setHsv(hexToHsv(color));
  }, [color]);

  // Preview current HSV color
  const previewCurrentColor = useCallback(() => {
    const hex = hsvToHex(hsv.h, hsv.s, hsv.v);
    onPreview?.(hex);
    setHexInput(hex.toLowerCase());
  }, [hsv, onPreview]);

  useEffect(() => {
    previewCurrentColor();
  }, [hsv, previewCurrentColor]);

  // Handle square (saturation/value) interaction
  const handleSquareInteraction = useCallback((e: MouseEvent | React.MouseEvent) => {
    if (!squareRef.current) return;
    const rect = squareRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    // x = saturation (0-100), y = value/brightness (100-0, inverted)
    setHsv(prev => ({ ...prev, s: x * 100, v: (1 - y) * 100 }));
  }, []);

  // Handle hue slider interaction
  const handleHueInteraction = useCallback((e: MouseEvent | React.MouseEvent) => {
    if (!hueRef.current) return;
    const rect = hueRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHsv(prev => ({ ...prev, h: x * 360 }));
  }, []);

  // Mouse move/up handlers
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging === 'square') handleSquareInteraction(e);
      else if (isDragging === 'hue') handleHueInteraction(e);
    };

    const handleMouseUp = () => {
      setIsDragging(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleSquareInteraction, handleHueInteraction]);

  // Handle hex input change
  const handleHexInputChange = (value: string) => {
    setHexInput(value.toLowerCase());
    if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
      setHsv(hexToHsv(value));
    }
  };

  // Apply color on click
  const applyColor = () => {
    const hex = hsvToHex(hsv.h, hsv.s, hsv.v);
    onChange(hex);
    onClose();
  };

  // Handle preset click
  const handlePresetClick = (presetColor: string) => {
    onChange(presetColor);
    onClose();
  };

  // Handle close
  const handleClose = () => {
    onPreviewEnd?.();
    onClose();
  };

  const currentHex = hsvToHex(hsv.h, hsv.s, hsv.v);

  return (
    <div className="color-picker-floating" onClick={(e) => e.target === e.currentTarget && handleClose()}>
      <div className="color-picker-dropdown color-picker-enhanced">
        <div className="color-picker-header">
          <h4>{colorType}</h4>
          <div className="color-picker-header-preview">
            <span className="preview-swatch" style={{ backgroundColor: currentHex }} />
            <span className="preview-hex">{currentHex.toLowerCase()}</span>
          </div>
          <button className="color-picker-close" onClick={handleClose}>
            <IconX size={14} />
          </button>
        </div>

        <div className="color-picker-content">
          {/* Preset rows */}
          <div className="color-picker-presets">
            {presets.map((row, rowIndex) => (
              <div key={rowIndex} className="color-row">
                {row.map((presetColor, i) => (
                  <button
                    key={i}
                    className={`color-swatch ${presetColor === color ? 'active' : ''} ${colorType === 'background' ? 'bg-swatch' : ''}`}
                    style={{ backgroundColor: presetColor }}
                    onClick={() => handlePresetClick(presetColor)}
                    onMouseEnter={() => onPreview?.(presetColor)}
                    onMouseLeave={previewCurrentColor}
                  />
                ))}
              </div>
            ))}
          </div>

          {/* Divider */}
          <div className="color-picker-divider" />

          {/* Color picker square (saturation/value) */}
          <div
            ref={squareRef}
            className="color-picker-square"
            style={{
              background: `linear-gradient(to bottom, transparent, #000),
                           linear-gradient(to right, #fff, hsl(${hsv.h}, 100%, 50%))`
            }}
            onMouseDown={(e) => {
              setIsDragging('square');
              handleSquareInteraction(e);
            }}
          >
            <div
              className="color-picker-cursor"
              style={{
                left: `${hsv.s}%`,
                top: `${100 - hsv.v}%`,
                backgroundColor: currentHex
              }}
            />
          </div>

          {/* Hue slider */}
          <div
            ref={hueRef}
            className="color-picker-hue"
            onMouseDown={(e) => {
              setIsDragging('hue');
              handleHueInteraction(e);
            }}
          >
            <div
              className="color-picker-hue-cursor"
              style={{ left: `${(hsv.h / 360) * 100}%` }}
            />
          </div>

          {/* Hex input + Apply button */}
          <div className="color-picker-input-row">
            <input
              type="text"
              value={hexInput}
              onChange={(e) => handleHexInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyColor();
                if (e.key === 'Escape') handleClose();
              }}
              className="color-picker-hex-input"
              placeholder="#000000"
              maxLength={7}
            />
            <button className="color-picker-apply" onClick={applyColor}>
              apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
