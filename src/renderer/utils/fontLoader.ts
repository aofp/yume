/**
 * Font loader utility for Tauri production builds
 * Now using static CSS import for better cross-platform compatibility
 */

// Import the embedded fonts CSS - uses /fonts/ absolute path
// This works in both dev (Vite serves from public/) and production (Tauri serves from dist/renderer/)
import '../styles/embedded-fonts.css';

export function loadFonts() {
  // Fonts are now loaded via static CSS import above
  // This fixes Windows builds where dynamic convertFileSrc was failing
  console.log('[Font Loader] Agave fonts loaded via static CSS import');
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
