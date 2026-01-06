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
  {
    id: 'yurucode',
    name: 'yurucode',
    backgroundColor: '#0f0f0f',
    foregroundColor: '#ffffff',
    accentColor: '#bb99ff',
    positiveColor: '#99ff99',
    negativeColor: '#ff9999',
    opacity: 0.99,
    isBuiltIn: true
  },
  // === MINIMAL / PROFESSIONAL ===
  {
    id: 'graphene',
    name: 'graphene',
    backgroundColor: '#0c0c0c',
    foregroundColor: '#d2d2d2',
    accentColor: '#6699ff',
    positiveColor: '#66aa44',
    negativeColor: '#cc4444',
    opacity: 0.92,
    isBuiltIn: true
  },
  {
    id: 'obsidian',
    name: 'obsidian',
    backgroundColor: '#0c0606',
    foregroundColor: '#e0d0ba',
    accentColor: '#cc8844',
    positiveColor: '#88aa88',
    negativeColor: '#cc4444',
    opacity: 0.92,
    isBuiltIn: true
  },
  // === COOL TONES ===
  {
    id: 'cobalt',
    name: 'cobalt',
    backgroundColor: '#06060c',
    foregroundColor: '#ccd8f5',
    accentColor: '#4477cc',
    positiveColor: '#55aa44',
    negativeColor: '#cc4466',
    opacity: 0.92,
    isBuiltIn: true
  },
  {
    id: 'frostbite',
    name: 'frostbite',
    backgroundColor: '#0a0a10',
    foregroundColor: '#e0ebff',
    accentColor: '#99ccff',
    positiveColor: '#99ffdd',
    negativeColor: '#ff99bb',
    opacity: 0.89,
    isBuiltIn: true
  },
  // === WARM TONES ===
  {
    id: 'ember',
    name: 'ember',
    backgroundColor: '#0c0a08',
    foregroundColor: '#e0d0ba',
    accentColor: '#cc6644',
    positiveColor: '#88aa88',
    negativeColor: '#cc4444',
    opacity: 0.92,
    isBuiltIn: true
  },
  {
    id: 'bourbon',
    name: 'bourbon',
    backgroundColor: '#0a0806',
    foregroundColor: '#d6c8b2',
    accentColor: '#aa9988',
    positiveColor: '#88aa88',
    negativeColor: '#aa8888',
    opacity: 0.93,
    isBuiltIn: true
  },
  {
    id: 'sandstorm',
    name: 'sandstorm',
    backgroundColor: '#0c0a08',
    foregroundColor: '#e8e4e0',
    accentColor: '#ccaa44',
    positiveColor: '#88ff66',
    negativeColor: '#cc6644',
    opacity: 0.90,
    isBuiltIn: true
  },
  // === NATURE ===
  {
    id: 'evergreen',
    name: 'evergreen',
    backgroundColor: '#060c06',
    foregroundColor: '#c4d6cf',
    accentColor: '#4499bb',
    positiveColor: '#66ff99',
    negativeColor: '#cc4444',
    opacity: 0.92,
    isBuiltIn: true
  },
  {
    id: 'lagoon',
    name: 'lagoon',
    backgroundColor: '#060a0c',
    foregroundColor: '#c4d0eb',
    accentColor: '#7744cc',
    positiveColor: '#66ffdd',
    negativeColor: '#cc4488',
    opacity: 0.90,
    isBuiltIn: true
  },
  {
    id: 'twilight',
    name: 'twilight',
    backgroundColor: '#0a060c',
    foregroundColor: '#d8cceb',
    accentColor: '#9966ff',
    positiveColor: '#66aa44',
    negativeColor: '#cc4466',
    opacity: 0.92,
    isBuiltIn: true
  },
  // === PURPLE / PINK ===
  {
    id: 'amethyst',
    name: 'amethyst',
    backgroundColor: '#08060c',
    foregroundColor: '#e0d4f5',
    accentColor: '#aa44cc',
    positiveColor: '#99ffcc',
    negativeColor: '#ff99dd',
    opacity: 0.91,
    isBuiltIn: true
  },
  {
    id: 'sakura',
    name: 'sakura',
    backgroundColor: '#100a0e',
    foregroundColor: '#fff5f5',
    accentColor: '#cc66ff',
    positiveColor: '#99ffbb',
    negativeColor: '#ff6699',
    opacity: 0.89,
    isBuiltIn: true
  },
  {
    id: 'velvet',
    name: 'velvet',
    backgroundColor: '#0a0408',
    foregroundColor: '#ebc4cd',
    accentColor: '#9f88aa',
    positiveColor: '#66aa44',
    negativeColor: '#aa8894',
    opacity: 0.93,
    isBuiltIn: true
  },
  // === VIBRANT ===
  {
    id: 'synthwave',
    name: 'synthwave',
    backgroundColor: '#0c080e',
    foregroundColor: '#e6daff',
    accentColor: '#66ccff',
    positiveColor: '#66ffcc',
    negativeColor: '#ff6699',
    opacity: 0.88,
    isBuiltIn: true
  },
  {
    id: 'plasma',
    name: 'plasma',
    backgroundColor: '#0a060c',
    foregroundColor: '#efe6ff',
    accentColor: '#cc66ff',
    positiveColor: '#66ffdd',
    negativeColor: '#ff66cc',
    opacity: 0.90,
    isBuiltIn: true
  },
  {
    id: 'neon',
    name: 'neon',
    backgroundColor: '#060606',
    foregroundColor: '#f0f0f0',
    accentColor: '#00eeff',
    positiveColor: '#00ff66',
    negativeColor: '#ff0066',
    opacity: 0.88,
    isBuiltIn: true
  },
  // === RETRO / STYLIZED ===
  {
    id: 'mainframe',
    name: 'mainframe',
    backgroundColor: '#020202',
    foregroundColor: '#99ff99',
    accentColor: '#44bb99',
    positiveColor: '#66ff99',
    negativeColor: '#cc4444',
    opacity: 0.94,
    isBuiltIn: true
  },
  {
    id: 'amber',
    name: 'amber',
    backgroundColor: '#040404',
    foregroundColor: '#ffdd99',
    accentColor: '#cc8844',
    positiveColor: '#99aa88',
    negativeColor: '#cc4444',
    opacity: 0.94,
    isBuiltIn: true
  },
  {
    id: 'phosphor',
    name: 'phosphor',
    backgroundColor: '#020202',
    foregroundColor: '#99ffee',
    accentColor: '#44bbbb',
    positiveColor: '#66ffcc',
    negativeColor: '#cc4466',
    opacity: 0.93,
    isBuiltIn: true
  },
  // === SPECIAL ===
  {
    id: 'nord',
    name: 'nord',
    backgroundColor: '#1a1c20',
    foregroundColor: '#e0e4e8',
    accentColor: '#99ccff',
    positiveColor: '#99aa88',
    negativeColor: '#cc4466',
    opacity: 0.91,
    isBuiltIn: true
  },
  {
    id: 'zenburn',
    name: 'zenburn',
    backgroundColor: '#1a1a1a',
    foregroundColor: '#d6d5c2',
    accentColor: '#99ddff',
    positiveColor: '#88aa88',
    negativeColor: '#d9b3b3',
    opacity: 0.92,
    isBuiltIn: true
  },
  {
    id: 'solarized',
    name: 'solarized',
    backgroundColor: '#1a1816',
    foregroundColor: '#e0d0ba',
    accentColor: '#6699ff',
    positiveColor: '#99aa88',
    negativeColor: '#ff6666',
    opacity: 0.94,
    isBuiltIn: true
  },
  // === AI-INSPIRED ===
  {
    id: 'sonnet',
    name: 'sonnet',
    backgroundColor: '#0c0a08',
    foregroundColor: '#ffe9d6',
    accentColor: '#cc6644',
    positiveColor: '#88aa88',
    negativeColor: '#aa889f',
    opacity: 0.92,
    isBuiltIn: true
  },
  {
    id: 'nexus',
    name: 'nexus',
    backgroundColor: '#060a08',
    foregroundColor: '#e0e0e0',
    accentColor: '#44aabb',
    positiveColor: '#66ff99',
    negativeColor: '#cc4444',
    opacity: 0.92,
    isBuiltIn: true
  },
  {
    id: 'prism',
    name: 'prism',
    backgroundColor: '#0a0a10',
    foregroundColor: '#e0ebff',
    accentColor: '#4477cc',
    positiveColor: '#55aa44',
    negativeColor: '#cc4444',
    opacity: 0.91,
    isBuiltIn: true
  },
  // === ADDITIONAL ===
  {
    id: 'arctic',
    name: 'arctic',
    backgroundColor: '#08080e',
    foregroundColor: '#ccd2d6',
    accentColor: '#44bbbb',
    positiveColor: '#99ffcc',
    negativeColor: '#ff99bb',
    opacity: 0.92,
    isBuiltIn: true
  },
  {
    id: 'gilded',
    name: 'gilded',
    backgroundColor: '#0a0806',
    foregroundColor: '#e8e4e0',
    accentColor: '#ccaa44',
    positiveColor: '#88aa88',
    negativeColor: '#aa8888',
    opacity: 0.92,
    isBuiltIn: true
  },
  {
    id: 'void',
    name: 'void',
    backgroundColor: '#010101',
    foregroundColor: '#e6e6e6',
    accentColor: '#8899aa',
    positiveColor: '#88aa88',
    negativeColor: '#aa8888',
    opacity: 0.94,
    isBuiltIn: true
  },
  {
    id: 'moss',
    name: 'moss',
    backgroundColor: '#060c06',
    foregroundColor: '#c4d6cf',
    accentColor: '#8899aa',
    positiveColor: '#88ff66',
    negativeColor: '#cc4444',
    opacity: 0.91,
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
