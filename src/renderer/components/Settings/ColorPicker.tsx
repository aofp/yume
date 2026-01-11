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

// Background presets (dark colors)
const BG_PRESETS = [
  ['#000000', '#0a0a0a', '#0f0f0f', '#141414', '#1a1a1a', '#0a0a0f', '#0f0a0f', '#0a0f0a', '#0f0a0a', '#050510'],
  ['#1e1e2e', '#11111b', '#181825', '#1a1b26', '#16161e', '#0d1117', '#161b22', '#0e0e16', '#1c1c28', '#0c0c14']
];

// Foreground presets (light colors - all visible on dark bg)
const FG_PRESETS = [
  ['#ffffff', '#f8f8f2', '#e4e4e7', '#d4d4d8', '#cdd6f4', '#c9d1d9', '#abb2bf', '#b4befe', '#a6adc8', '#9ca0b0'],
  ['#f0f0ff', '#fff0f0', '#f0fff0', '#fffff0', '#f0ffff', '#ffd0d0', '#d0ffd0', '#d0d0ff', '#ffd0ff', '#d0ffff']
];

// Accent presets (vibrant, visible colors - no dark)
const ACCENT_PRESETS = [
  ['#bb99ff', '#99bbff', '#ff99bb', '#ffbb99', '#99ffbb', '#bbff99', '#ff99ff', '#99ffff', '#ffff99', '#ffffff'],
  ['#a78bfa', '#60a5fa', '#f472b6', '#fb923c', '#4ade80', '#a3e635', '#e879f9', '#22d3ee', '#facc15', '#f9a8d4']
];

// Positive presets (cool colors - greens, blues, teals)
const POSITIVE_PRESETS = [
  ['#99ff99', '#99ffbb', '#99ffdd', '#99ffff', '#99ddff', '#bbff99', '#ddff99', '#aaffaa', '#88ffaa', '#77ffbb'],
  ['#4ade80', '#34d399', '#2dd4bf', '#22d3ee', '#38bdf8', '#a3e635', '#84cc16', '#10b981', '#06b6d4', '#14b8a6']
];

// Negative presets (warm colors - reds, oranges, pinks)
const NEGATIVE_PRESETS = [
  ['#ff9999', '#ffaa99', '#ffbb99', '#ffcc99', '#ff99aa', '#ff99bb', '#ff99cc', '#ffaaaa', '#ff8888', '#ff7799'],
  ['#f87171', '#fb923c', '#fbbf24', '#f472b6', '#fb7185', '#ef4444', '#f97316', '#eab308', '#ec4899', '#e11d48']
];

// HSL utilities
const hexToHsl = (hex: string): { h: number; s: number; l: number } => {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
};

const hslToHex = (h: number, s: number, l: number): string => {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};

export const ColorPicker: React.FC<ColorPickerProps> = ({
  color,
  colorType,
  onChange,
  onClose,
  onPreview,
  onPreviewEnd
}) => {
  const [hsl, setHsl] = useState(() => hexToHsl(color));
  const [hexInput, setHexInput] = useState(color.toUpperCase());
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
    setHexInput(color.toUpperCase());
    setHsl(hexToHsl(color));
  }, [color]);

  // Preview current HSL color
  const previewCurrentColor = useCallback(() => {
    const hex = hslToHex(hsl.h, hsl.s, hsl.l);
    onPreview?.(hex);
    setHexInput(hex.toUpperCase());
  }, [hsl, onPreview]);

  useEffect(() => {
    previewCurrentColor();
  }, [hsl, previewCurrentColor]);

  // Handle square (saturation/lightness) interaction
  const handleSquareInteraction = useCallback((e: MouseEvent | React.MouseEvent) => {
    if (!squareRef.current) return;
    const rect = squareRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    // x = saturation (0-100), y = lightness (100-0, inverted)
    setHsl(prev => ({ ...prev, s: x * 100, l: (1 - y) * 100 }));
  }, []);

  // Handle hue slider interaction
  const handleHueInteraction = useCallback((e: MouseEvent | React.MouseEvent) => {
    if (!hueRef.current) return;
    const rect = hueRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHsl(prev => ({ ...prev, h: x * 360 }));
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
    setHexInput(value.toUpperCase());
    if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
      setHsl(hexToHsl(value));
    }
  };

  // Apply color on click
  const applyColor = () => {
    const hex = hslToHex(hsl.h, hsl.s, hsl.l);
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

  const currentHex = hslToHex(hsl.h, hsl.s, hsl.l);

  return (
    <div className="color-picker-floating" onClick={(e) => e.target === e.currentTarget && handleClose()}>
      <div className="color-picker-dropdown color-picker-enhanced">
        <div className="color-picker-header">
          <h4>{colorType}</h4>
          <div className="color-picker-header-preview">
            <span className="preview-swatch" style={{ backgroundColor: currentHex }} />
            <span className="preview-hex">{currentHex}</span>
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

          {/* Color picker square (saturation/lightness) */}
          <div
            ref={squareRef}
            className="color-picker-square"
            style={{
              background: `linear-gradient(to bottom, transparent, #000),
                           linear-gradient(to right, #fff, hsl(${hsl.h}, 100%, 50%))`
            }}
            onMouseDown={(e) => {
              setIsDragging('square');
              handleSquareInteraction(e);
            }}
          >
            <div
              className="color-picker-cursor"
              style={{
                left: `${hsl.s}%`,
                top: `${100 - hsl.l}%`,
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
              style={{ left: `${(hsl.h / 360) * 100}%` }}
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
