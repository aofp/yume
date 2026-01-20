/**
 * Font loader utility for Tauri production builds
 * Handles font loading with proper paths for both dev and production
 */

import { convertFileSrc } from '@tauri-apps/api/core';

export function loadFonts() {
  // In production, Tauri serves assets from the app's resources
  // We need to inject the font-face rules dynamically with proper paths

  const isDev = window.location.hostname === 'localhost';

  // Use Tauri's convertFileSrc for production builds to get proper tauri:// protocol
  // In dev, use relative path
  const getAssetPath = (fontFile: string) => {
    const relativePath = `./fonts/${fontFile}`;
    if (isDev) {
      return relativePath;
    }
    // In production, convert to Tauri asset protocol (tauri://localhost/)
    return convertFileSrc(relativePath);
  };

  // Create a style element for our font-face rules
  const styleElement = document.createElement('style');
  styleElement.id = 'dynamic-fonts';

  let fontFaceRules = '';

  // Add Agave font-face rules - Regular and Bold
  const agaveWeights = [
    { weight: 400, file: 'Regular' },
    { weight: 700, file: 'Bold' }
  ];

  agaveWeights.forEach(({ weight, file }) => {
    const fontPath = getAssetPath(`Agave-${file}.ttf`);
    fontFaceRules += `
      @font-face {
        font-family: 'Agave';
        font-style: normal;
        font-weight: ${weight};
        font-display: swap;
        src: url('${fontPath}') format('truetype');
      }
    `;
  });

  // Apply the font face rules
  styleElement.textContent = fontFaceRules;

  // Remove existing dynamic fonts if present
  const existing = document.getElementById('dynamic-fonts');
  if (existing) {
    existing.remove();
  }

  // Add to head
  document.head.appendChild(styleElement);

  console.log('[Font Loader] Agave fonts loaded dynamically');
}

// Auto-load fonts on module import
if (typeof window !== 'undefined') {
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadFonts);
  } else {
    loadFonts();
  }
}
