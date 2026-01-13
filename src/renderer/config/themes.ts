// Theme system - shared configuration
// This file is the single source of truth for theme definitions

export type Theme = {
  id: string;
  name: string;
  backgroundColor: string;
  foregroundColor: string;
  accentColor: string;
  positiveColor: string;
  negativeColor: string;
  opacity?: number;
  monoFont?: string;
  sansFont?: string;
  isBuiltIn?: boolean;
};

export const BUILT_IN_THEMES: Theme[] = [
  // === SIGNATURE ===
  // yurucode - the original, kept exactly as-is
  {
    id: 'yurucode',
    name: 'yurucode',
    backgroundColor: '#0f0f0f',
    foregroundColor: '#ffffff',
    accentColor: '#c4b5ff',
    positiveColor: '#99ff99',
    negativeColor: '#ff9999',
    opacity: 1,
    isBuiltIn: true
  },

  // === INSPIRED BY POPULAR CODING THEMES ===

  // slate - inspired by Atom One Dark / Material Darker
  // Clean, professional, muted blue accent
  {
    id: 'slate',
    name: 'slate',
    backgroundColor: '#0a0a0a',
    foregroundColor: '#c0c5ce',
    accentColor: '#61afef',
    positiveColor: '#98c379',
    negativeColor: '#e06c75',
    opacity: 1.0,
    isBuiltIn: true
  },

  // arctic - inspired by Iceberg / Winter is Coming
  // Cool icy blues, soft contrast
  {
    id: 'arctic',
    name: 'arctic',
    backgroundColor: '#0a0a0d',
    foregroundColor: '#c6c8d1',
    accentColor: '#8fb8c8',
    positiveColor: '#b4be82',
    negativeColor: '#e27878',
    opacity: 1.0,
    isBuiltIn: true
  },

  // pulse - inspired by Synthwave '84 / Cyberpunk
  // High contrast, vibrant neons (softened for comfort)
  {
    id: 'pulse',
    name: 'pulse',
    backgroundColor: '#050505',
    foregroundColor: '#f0f0f0',
    accentColor: '#36d7e6',
    positiveColor: '#72f1b8',
    negativeColor: '#f25d7a',
    opacity: 1.0,
    isBuiltIn: true
  },

  // 
  {
    id: 'iota',
    name: 'iota',
    backgroundColor: '#0d0c0e',
    foregroundColor: '#ffffff',
    accentColor: '#9df5bd',
    positiveColor: '#06b6d4',
    negativeColor: '#ec4899',
    opacity: 1.0,
    isBuiltIn: true
  },

  // dusk - authentic Zenburn adaptation for OLED
  // Warm, low-contrast, easy on eyes
  {
    id: 'bourbon',
    name: 'bourbon',
    backgroundColor: '#100f0f',
    foregroundColor: '#e7e7da',
    accentColor: '#e4d9bd',
    positiveColor: '#7cc07c',
    negativeColor: '#df8383',
    opacity: 1.0,
    isBuiltIn: true
  },

  // ember - inspired by Anthropic's warm tones
  // Warm coral/terracotta accent
  {
    id: 'burnt',
    name: 'burnt',
    backgroundColor: '#0a0808',
    foregroundColor: '#e8dcd0',
    accentColor: '#d57b60',
    positiveColor: '#8fbc8f',
    negativeColor: '#fd8b8b',
    opacity: 1.0,
    isBuiltIn: true
  },

  // rose - inspired by Dracula / Rose Pine
  // Modern, clean, rose/pink accent
  {
    id: 'rose',
    name: 'rose',
    backgroundColor: '#080a0a',
    foregroundColor: '#c9d1d9',
    accentColor: '#e890a0',
    positiveColor: '#56d364',
    negativeColor: '#df2d53',
    opacity: 1.0,
    isBuiltIn: true
  },

  // cobalt - inspired by Night Owl / Cobalt2
  // Deep blue, coding-focused
  {
    id: 'cobalt',
    name: 'cobalt',
    backgroundColor: '#060810',
    foregroundColor: '#d6deeb',
    accentColor: '#82aaff',
    positiveColor: '#addb67',
    negativeColor: '#ef5350',
    opacity: 1.0,
    isBuiltIn: true
  },

  // ochre - inspired by Gruvbox Dark
  // Warm retro, golden/amber tones
  {
    id: 'ochre',
    name: 'ochre',
    backgroundColor: '#0a0908',
    foregroundColor: '#faf0d6',
    accentColor: '#e9a828',
    positiveColor: '#87bb26',
    negativeColor: '#cc241d',
    opacity: 1.0,
    isBuiltIn: true
  },

  // void - inspired by Pitch Black / Minimal
  // True black, subtle gray accent
  {
    id: 'void',
    name: 'void',
    backgroundColor: '#000000',
    foregroundColor: '#d4d4d4',
    accentColor: '#a0a0b0',
    positiveColor: '#e0f5e4',
    negativeColor: '#d09b9b',
    opacity: 1.0,
    isBuiltIn: true
  },

  // grove - inspired by Everforest / Forest Night
  // Nature tones, aqua accent
  {
    id: 'grove',
    name: 'grove',
    backgroundColor: '#0a0a08',
    foregroundColor: '#bacebe',
    accentColor: '#83c092',
    positiveColor: '#74d1d8',
    negativeColor: '#e67e80',
    opacity: 1.0,
    isBuiltIn: true
  }
];

// Default theme is the first one (yurucode)
export const DEFAULT_THEME = BUILT_IN_THEMES[0];

// Helper to get theme by ID
export function getThemeById(id: string): Theme | undefined {
  return BUILT_IN_THEMES.find(t => t.id === id);
}

// Default theme colors for init scripts (before React loads)
export const DEFAULT_COLORS = {
  background: DEFAULT_THEME.backgroundColor,
  foreground: DEFAULT_THEME.foregroundColor,
  accent: DEFAULT_THEME.accentColor,
  positive: DEFAULT_THEME.positiveColor,
  negative: DEFAULT_THEME.negativeColor
};
