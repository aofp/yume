/**
 * Font loader utility for Tauri production builds
 * Handles font loading with proper paths for both dev and production
 */

export function loadFonts() {
  // In production, Tauri serves assets from the app's resources
  // We need to inject the font-face rules dynamically with proper paths
  
  const isDev = window.location.hostname === 'localhost';
  const basePath = isDev ? './fonts' : './fonts';
  
  // Create a style element for our font-face rules
  const styleElement = document.createElement('style');
  styleElement.id = 'dynamic-fonts';
  
  // Fira Code font-face definitions
  const firaCodeWeights = [
    { weight: 300, file: 'Light' },
    { weight: 400, file: 'Regular' },
    { weight: 500, file: 'Medium' },
    { weight: 600, file: 'SemiBold' },
    { weight: 700, file: 'Bold' }
  ];
  
  let fontFaceRules = '';
  
  // Add Fira Code font-face rules
  firaCodeWeights.forEach(({ weight, file }) => {
    fontFaceRules += `
      @font-face {
        font-family: 'Fira Code';
        font-style: normal;
        font-weight: ${weight};
        font-display: swap;
        src: url('${basePath}/woff2/FiraCode-${file}.woff2') format('woff2'),
             url('${basePath}/woff/FiraCode-${file}.woff') format('woff'),
             url('${basePath}/ttf/FiraCode-${file}.ttf') format('truetype');
      }
    `;
  });
  
  // Add Inter font-face rules
  const interWeights = [
    { weight: 400, file: 'Regular' },
    { weight: 500, file: 'Medium' },
    { weight: 600, file: 'SemiBold' },
    { weight: 700, file: 'Bold' }
  ];
  
  interWeights.forEach(({ weight, file }) => {
    fontFaceRules += `
      @font-face {
        font-family: 'Inter';
        font-style: normal;
        font-weight: ${weight};
        font-display: swap;
        src: url('${basePath}/Inter-${file}.ttf') format('truetype');
      }
    `;
  });
  
  // Add Inter Variable font
  fontFaceRules += `
    @font-face {
      font-family: 'Inter Variable';
      font-style: normal;
      font-weight: 100 900;
      font-display: swap;
      src: url('${basePath}/Inter-Variable.ttf') format('truetype-variations');
    }
  `;
  
  // Helvetica Neue fallbacks for Windows
  const helveticaWeights = [
    { weight: 300, names: ['Helvetica Neue Light', 'HelveticaNeue-Light', 'Segoe UI Light', 'Arial'] },
    { weight: 400, names: ['Helvetica Neue', 'HelveticaNeue', 'Segoe UI', 'Arial'] },
    { weight: 500, names: ['Helvetica Neue Medium', 'HelveticaNeue-Medium', 'Segoe UI Semibold', 'Arial'] },
    { weight: 700, names: ['Helvetica Neue Bold', 'HelveticaNeue-Bold', 'Segoe UI Bold', 'Arial Bold'] }
  ];
  
  helveticaWeights.forEach(({ weight, names }) => {
    const sources = names.map(name => `local('${name}')`).join(', ');
    fontFaceRules += `
      @font-face {
        font-family: 'Helvetica Neue';
        font-style: normal;
        font-weight: ${weight};
        font-display: swap;
        src: ${sources};
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
  
  console.log('[Font Loader] Fonts loaded dynamically');
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