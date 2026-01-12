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
