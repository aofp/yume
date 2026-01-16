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
  // === SORTED BY ACCENT HUE: violet → blue → cyan → green → yellow → orange → pink ===

  // yume - signature theme (violet ~255°)
  {
    id: 'yume',
    name: 'yume',
    backgroundColor: '#0f0f0f',
    foregroundColor: '#ffffff',
    accentColor: '#c4b5ff',
    positiveColor: '#99ff99',
    negativeColor: '#ff9999',
    opacity: 1,
    isBuiltIn: true
  },

  // void - minimal (gray-blue ~240°)
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

  // cobalt - Night Owl inspired (blue ~225°)
  {
    id: 'cobalt',
    name: 'cobalt',
    backgroundColor: '#080A0f',
    foregroundColor: '#d6deeb',
    accentColor: '#82aaff',
    positiveColor: '#addb67',
    negativeColor: '#ef5350',
    opacity: 1.0,
    isBuiltIn: true
  },

  // slate - Atom One Dark inspired (blue ~210°)
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

  // arctic - Iceberg inspired (cyan ~195°)
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

  // synth - Synthwave inspired (cyan ~185°)
  {
    id: 'synth',
    name: 'synth',
    backgroundColor: '#050505',
    foregroundColor: '#f0f0f0',
    accentColor: '#36d7e6',
    positiveColor: '#72f1b8',
    negativeColor: '#f25d7a',
    opacity: 1.0,
    isBuiltIn: true
  },

  // mint - mint accent (~145°)
  {
    id: 'mint',
    name: 'mint',
    backgroundColor: '#0d0c0e',
    foregroundColor: '#ffffff',
    accentColor: '#9df5bd',
    positiveColor: '#06b6d4',
    negativeColor: '#ff74b9',
    opacity: 1.0,
    isBuiltIn: true
  },

  // grove - Everforest inspired (lime ~95°)
  {
    id: 'grove',
    name: 'grove',
    backgroundColor: '#0a0a08',
    foregroundColor: '#bacebe',
    accentColor: '#afff76',
    positiveColor: '#5affa9',
    negativeColor: '#e79f62',
    opacity: 1.0,
    isBuiltIn: true
  },

  // ochre - Gruvbox inspired (gold ~40°)
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

  // bourbon - Zenburn inspired (cream ~40°)
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

  // burnt - warm coral (~15°)
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

  // rose - Dracula inspired (pink ~350°)
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
  }
];

// Default theme is the first one (yume)
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
