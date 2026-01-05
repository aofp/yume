import React, { useState, useEffect, useRef } from 'react';
import {
  IconX, IconPlus, IconMinus, IconSettings, IconPalette,
  IconPhoto, IconRotateClockwise, IconCrown, IconInfoCircle,
  IconWebhook, IconCommand, IconDatabase, IconBrain,
  IconTrash, IconDownload, IconUpload, IconAlertTriangle,
  IconCheck, IconEdit, IconSparkles
} from '@tabler/icons-react';
import './SettingsModal.css';
import './SettingsModalTabbed.css';
import { useClaudeCodeStore } from '../../stores/claudeCodeStore';
import { useLicenseStore } from '../../services/licenseManager';
import { FontPickerModal } from '../FontPicker/FontPickerModal';
import { AboutModal } from '../About/AboutModal';
import { HooksTab } from './HooksTab';
import { MCPTab } from './MCPTab';
import { ClaudeSelector } from './ClaudeSelector';
import { SystemPromptSelector } from './SystemPromptSelector';
import { invoke } from '@tauri-apps/api/core';
import { hooksService, HookScriptConfig } from '../../services/hooksService';
import { TabButton } from '../common/TabButton';

// electronAPI type is declared globally elsewhere

interface SettingsModalProps {
  onClose: () => void;
}

// Tab type definition
type SettingsTab = 'general' | 'theme' | 'hooks' | 'commands' | 'mcp';

// Color type with name for tooltips
type NamedColor = { hex: string; name: string };

// Helper function to blend two hex colors 50/50
const blendColors = (color1: string, color2: string): string => {
  const hex1 = color1.replace('#', '');
  const hex2 = color2.replace('#', '');
  const r1 = parseInt(hex1.substr(0, 2), 16);
  const g1 = parseInt(hex1.substr(2, 2), 16);
  const b1 = parseInt(hex1.substr(4, 2), 16);
  const r2 = parseInt(hex2.substr(0, 2), 16);
  const g2 = parseInt(hex2.substr(2, 2), 16);
  const b2 = parseInt(hex2.substr(4, 2), 16);
  const r = Math.round((r1 + r2) / 2);
  const g = Math.round((g1 + g2) / 2);
  const b = Math.round((b1 + b2) / 2);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
};

// Color swatches - 9 rows × 21 columns for accent/positive/negative
const COLOR_ROWS: NamedColor[][] = [
  // Row 1: Defaults only (accent violet, positive green, negative red)
  [
    { hex: '#bb99ff', name: 'default accent' }, { hex: '#99ff99', name: 'default positive' }, { hex: '#ff9999', name: 'default negative' }
  ],
  // Row 2: Vivid spectrum (21)
  [
    { hex: '#99bbff', name: 'sky' }, { hex: '#99ccff', name: 'azure' }, { hex: '#99ddff', name: 'ice' },
    { hex: '#99eeff', name: 'frost' }, { hex: '#99ffff', name: 'cyan' }, { hex: '#99ffee', name: 'aqua' },
    { hex: '#99ffdd', name: 'mint' }, { hex: '#99ffcc', name: 'seafoam' }, { hex: '#99ffbb', name: 'spring' },
    { hex: '#99ff99', name: 'lime' }, { hex: '#bbff99', name: 'chartreuse' }, { hex: '#ddff99', name: 'pear' },
    { hex: '#ffff99', name: 'lemon' }, { hex: '#ffdd99', name: 'peach' }, { hex: '#ffbb99', name: 'apricot' },
    { hex: '#ff9999', name: 'salmon' }, { hex: '#ff99bb', name: 'rose' }, { hex: '#ff99dd', name: 'pink' },
    { hex: '#ff99ff', name: 'fuchsia' }, { hex: '#dd99ff', name: 'lavender' }, { hex: '#bb99ff', name: 'violet' }
  ],
  // Row 3: Pale spectrum (21)
  [
    { hex: '#bfd4ff', name: 'pale sky' }, { hex: '#bfddff', name: 'pale azure' }, { hex: '#bfe8ff', name: 'pale ice' },
    { hex: '#bff4ff', name: 'pale frost' }, { hex: '#bfffff', name: 'pale cyan' }, { hex: '#bffff4', name: 'pale aqua' },
    { hex: '#bfffe8', name: 'pale mint' }, { hex: '#bfffdd', name: 'pale seafoam' }, { hex: '#bfffd4', name: 'pale spring' },
    { hex: '#bfffbf', name: 'pale lime' }, { hex: '#d4ffbf', name: 'pale chartreuse' }, { hex: '#e8ffbf', name: 'pale pear' },
    { hex: '#ffffbf', name: 'pale lemon' }, { hex: '#ffe8bf', name: 'pale peach' }, { hex: '#ffd4bf', name: 'pale apricot' },
    { hex: '#ffbfbf', name: 'pale salmon' }, { hex: '#ffbfd4', name: 'pale rose' }, { hex: '#ffbfe8', name: 'pale pink' },
    { hex: '#ffbfff', name: 'pale fuchsia' }, { hex: '#e8bfff', name: 'pale lavender' }, { hex: '#d4bfff', name: 'pale violet' }
  ],
  // Row 4: Saturated/bright spectrum (21)
  [
    { hex: '#6699ff', name: 'bright sky' }, { hex: '#66aaff', name: 'bright azure' }, { hex: '#66ccff', name: 'bright ice' },
    { hex: '#66ddff', name: 'bright frost' }, { hex: '#66ffff', name: 'bright cyan' }, { hex: '#66ffdd', name: 'bright aqua' },
    { hex: '#66ffbb', name: 'bright mint' }, { hex: '#66ff99', name: 'bright seafoam' }, { hex: '#88ff66', name: 'bright spring' },
    { hex: '#aaff66', name: 'bright lime' }, { hex: '#ccff66', name: 'bright chartreuse' }, { hex: '#eeff66', name: 'bright pear' },
    { hex: '#ffff66', name: 'bright lemon' }, { hex: '#ffcc66', name: 'bright peach' }, { hex: '#ff9966', name: 'bright apricot' },
    { hex: '#ff6666', name: 'bright salmon' }, { hex: '#ff6699', name: 'bright rose' }, { hex: '#ff66cc', name: 'bright pink' },
    { hex: '#ff66ff', name: 'bright fuchsia' }, { hex: '#cc66ff', name: 'bright lavender' }, { hex: '#9966ff', name: 'bright violet' }
  ],
  // Row 5: Deep/rich spectrum (21)
  [
    { hex: '#4477cc', name: 'deep sky' }, { hex: '#4488cc', name: 'deep azure' }, { hex: '#4499bb', name: 'deep ice' },
    { hex: '#44aabb', name: 'deep frost' }, { hex: '#44bbbb', name: 'deep cyan' }, { hex: '#44bb99', name: 'deep aqua' },
    { hex: '#44bb77', name: 'deep mint' }, { hex: '#44aa66', name: 'deep seafoam' }, { hex: '#55aa44', name: 'deep spring' },
    { hex: '#66aa44', name: 'deep lime' }, { hex: '#88aa44', name: 'deep chartreuse' }, { hex: '#aaaa44', name: 'deep pear' },
    { hex: '#ccaa44', name: 'deep lemon' }, { hex: '#cc8844', name: 'deep peach' }, { hex: '#cc6644', name: 'deep apricot' },
    { hex: '#cc4444', name: 'deep salmon' }, { hex: '#cc4466', name: 'deep rose' }, { hex: '#cc4488', name: 'deep pink' },
    { hex: '#cc44aa', name: 'deep fuchsia' }, { hex: '#aa44cc', name: 'deep lavender' }, { hex: '#7744cc', name: 'deep violet' }
  ],
  // Row 6: Neon/electric spectrum (21)
  [
    { hex: '#00aaff', name: 'neon sky' }, { hex: '#00ccff', name: 'neon azure' }, { hex: '#00eeff', name: 'neon ice' },
    { hex: '#00ffee', name: 'neon frost' }, { hex: '#00ffff', name: 'neon cyan' }, { hex: '#00ffcc', name: 'neon aqua' },
    { hex: '#00ffaa', name: 'neon mint' }, { hex: '#00ff88', name: 'neon seafoam' }, { hex: '#00ff66', name: 'neon spring' },
    { hex: '#44ff00', name: 'neon lime' }, { hex: '#88ff00', name: 'neon chartreuse' }, { hex: '#ccff00', name: 'neon pear' },
    { hex: '#ffff00', name: 'neon lemon' }, { hex: '#ffcc00', name: 'neon peach' }, { hex: '#ff9900', name: 'neon apricot' },
    { hex: '#ff5500', name: 'neon salmon' }, { hex: '#ff0066', name: 'neon rose' }, { hex: '#ff00aa', name: 'neon pink' },
    { hex: '#ff00ff', name: 'neon fuchsia' }, { hex: '#cc00ff', name: 'neon lavender' }, { hex: '#8800ff', name: 'neon violet' }
  ],
  // Row 7: Muted spectrum (21)
  [
    { hex: '#b3c6d9', name: 'muted sky' }, { hex: '#b3ccd9', name: 'muted azure' }, { hex: '#b3d3d9', name: 'muted ice' },
    { hex: '#b3d9d9', name: 'muted frost' }, { hex: '#b3d9df', name: 'muted cyan' }, { hex: '#b3d9d3', name: 'muted aqua' },
    { hex: '#b3d9cc', name: 'muted mint' }, { hex: '#b3d9c6', name: 'muted seafoam' }, { hex: '#b3d9bf', name: 'muted spring' },
    { hex: '#b3d9b3', name: 'muted lime' }, { hex: '#c6d9b3', name: 'muted chartreuse' }, { hex: '#ccd9b3', name: 'muted pear' },
    { hex: '#d3d9b3', name: 'muted lemon' }, { hex: '#d9d9b3', name: 'muted tan' }, { hex: '#d9ccb3', name: 'muted peach' },
    { hex: '#d9b3b3', name: 'muted salmon' }, { hex: '#d9b3c6', name: 'muted rose' }, { hex: '#d9b3cc', name: 'muted pink' },
    { hex: '#d9b3d3', name: 'muted fuchsia' }, { hex: '#d3b3d9', name: 'muted lavender' }, { hex: '#c6b3d9', name: 'muted violet' }
  ],
  // Row 8: Dusty/earthy spectrum (21)
  [
    { hex: '#8899aa', name: 'dusty sky' }, { hex: '#889faa', name: 'dusty azure' }, { hex: '#88a5aa', name: 'dusty ice' },
    { hex: '#88abaa', name: 'dusty frost' }, { hex: '#88aaaa', name: 'dusty cyan' }, { hex: '#88aa9f', name: 'dusty aqua' },
    { hex: '#88aa94', name: 'dusty mint' }, { hex: '#88aa88', name: 'dusty seafoam' }, { hex: '#8faa88', name: 'dusty spring' },
    { hex: '#99aa88', name: 'dusty lime' }, { hex: '#a3aa88', name: 'dusty chartreuse' }, { hex: '#adaa88', name: 'dusty pear' },
    { hex: '#b8aa88', name: 'dusty lemon' }, { hex: '#aa9988', name: 'dusty peach' }, { hex: '#aa8f88', name: 'dusty apricot' },
    { hex: '#aa8888', name: 'dusty salmon' }, { hex: '#aa8894', name: 'dusty rose' }, { hex: '#aa889f', name: 'dusty pink' },
    { hex: '#aa88aa', name: 'dusty fuchsia' }, { hex: '#9f88aa', name: 'dusty lavender' }, { hex: '#9488aa', name: 'dusty violet' }
  ],
  // Row 9: Neutrals - white to grey spectrum (21)
  [
    { hex: '#ffffff', name: 'white' }, { hex: '#f5f5f5', name: 'snow' }, { hex: '#ebebeb', name: 'pearl' },
    { hex: '#e0e0e0', name: 'platinum' }, { hex: '#d6d6d6', name: 'silver' }, { hex: '#cccccc', name: 'chrome' },
    { hex: '#c2c2c2', name: 'grey' }, { hex: '#b8b8b8', name: 'steel' }, { hex: '#adadad', name: 'iron' },
    { hex: '#a3a3a3', name: 'pewter' }, { hex: '#999999', name: 'slate' }, { hex: '#8f8f8f', name: 'stone' },
    { hex: '#858585', name: 'cement' }, { hex: '#7a7a7a', name: 'ash' }, { hex: '#707070', name: 'graphite' },
    { hex: '#666666', name: 'charcoal' }, { hex: '#5c5c5c', name: 'lead' }, { hex: '#525252', name: 'smoke' },
    { hex: '#474747', name: 'shadow' }, { hex: '#3d3d3d', name: 'onyx' }, { hex: '#333333', name: 'jet' }
  ]
];

// Background colors - 9 rows × 21 columns of dark colors
const BACKGROUND_COLOR_ROWS: NamedColor[][] = [
  // Row 1: Default only
  [
    { hex: '#000000', name: 'black' }
  ],
  // Row 2: Near-blacks (21)
  [
    { hex: '#010101', name: 'void' }, { hex: '#020202', name: 'abyss' }, { hex: '#030303', name: 'obsidian' },
    { hex: '#040404', name: 'onyx' }, { hex: '#050505', name: 'pitch' }, { hex: '#060606', name: 'coal' },
    { hex: '#070707', name: 'soot' }, { hex: '#080808', name: 'tar' }, { hex: '#090909', name: 'ink' },
    { hex: '#0a0a0a', name: 'night' }, { hex: '#0b0b0b', name: 'raven' }, { hex: '#0c0c0c', name: 'crow' },
    { hex: '#0d0d0d', name: 'shadow' }, { hex: '#0e0e0e', name: 'dark' }, { hex: '#0f0f0f', name: 'deep' },
    { hex: '#101010', name: 'cave' }, { hex: '#111111', name: 'mine' }, { hex: '#121212', name: 'tunnel' },
    { hex: '#131313', name: 'cellar' }, { hex: '#141414', name: 'vault' }, { hex: '#151515', name: 'crypt' }
  ],
  // Row 3: Very dark greys (21)
  [
    { hex: '#161616', name: 'jet' }, { hex: '#171717', name: 'charcoal' }, { hex: '#181818', name: 'smoke' },
    { hex: '#191919', name: 'ash' }, { hex: '#1a1a1a', name: 'carbon' }, { hex: '#1b1b1b', name: 'ebony' },
    { hex: '#1c1c1c', name: 'eclipse' }, { hex: '#1d1d1d', name: 'graphite' }, { hex: '#1e1e1e', name: 'slate' },
    { hex: '#1f1f1f', name: 'iron' }, { hex: '#202020', name: 'steel' }, { hex: '#212121', name: 'gunmetal' },
    { hex: '#222222', name: 'pewter' }, { hex: '#232323', name: 'thunder' }, { hex: '#242424', name: 'flint' },
    { hex: '#252525', name: 'granite' }, { hex: '#262626', name: 'basalt' }, { hex: '#272727', name: 'shale' },
    { hex: '#282828', name: 'rock' }, { hex: '#292929', name: 'stone' }, { hex: '#2a2a2a', name: 'boulder' }
  ],
  // Row 4: Cool blue tints (21)
  [
    { hex: '#04040a', name: 'midnight' }, { hex: '#06060c', name: 'deep navy' }, { hex: '#08080e', name: 'night sea' },
    { hex: '#0a0a10', name: 'ocean floor' }, { hex: '#0c0c12', name: 'abyss blue' }, { hex: '#0e0e14', name: 'twilight' },
    { hex: '#101016', name: 'ink blue' }, { hex: '#121218', name: 'dark azure' }, { hex: '#14141a', name: 'cobalt' },
    { hex: '#16161c', name: 'sapphire' }, { hex: '#18181e', name: 'indigo' }, { hex: '#1a1a20', name: 'navy' },
    { hex: '#0a0c10', name: 'storm blue' }, { hex: '#0c0e12', name: 'slate blue' }, { hex: '#0e1014', name: 'steel blue' },
    { hex: '#101216', name: 'iron blue' }, { hex: '#121418', name: 'gun blue' }, { hex: '#14161a', name: 'denim' },
    { hex: '#16181c', name: 'jean' }, { hex: '#181a1e', name: 'uniform' }, { hex: '#1a1c20', name: 'officer' }
  ],
  // Row 5: Warm red/brown tints (21)
  [
    { hex: '#0a0404', name: 'blood' }, { hex: '#0c0606', name: 'maroon' }, { hex: '#0e0808', name: 'burgundy' },
    { hex: '#100a0a', name: 'wine' }, { hex: '#120c0c', name: 'crimson' }, { hex: '#140e0e', name: 'ruby' },
    { hex: '#161010', name: 'garnet' }, { hex: '#181212', name: 'cherry' }, { hex: '#1a1414', name: 'berry' },
    { hex: '#1c1616', name: 'plum' }, { hex: '#0a0806', name: 'espresso' }, { hex: '#0c0a08', name: 'coffee' },
    { hex: '#0e0c0a', name: 'mocha' }, { hex: '#100e0c', name: 'cocoa' }, { hex: '#12100e', name: 'chocolate' },
    { hex: '#141210', name: 'umber' }, { hex: '#161412', name: 'sienna' }, { hex: '#181614', name: 'rust' },
    { hex: '#1a1816', name: 'copper' }, { hex: '#1c1a18', name: 'bronze' }, { hex: '#1e1c1a', name: 'brass' }
  ],
  // Row 6: Green/teal tints (21)
  [
    { hex: '#04080a', name: 'deep sea' }, { hex: '#060a0c', name: 'ocean' }, { hex: '#080c0e', name: 'marine' },
    { hex: '#0a0e10', name: 'teal' }, { hex: '#0c1012', name: 'lagoon' }, { hex: '#0e1214', name: 'reef' },
    { hex: '#101416', name: 'kelp' }, { hex: '#121618', name: 'seaweed' }, { hex: '#14181a', name: 'algae' },
    { hex: '#040a04', name: 'forest' }, { hex: '#060c06', name: 'pine' }, { hex: '#080e08', name: 'spruce' },
    { hex: '#0a100a', name: 'fir' }, { hex: '#0c120c', name: 'cedar' }, { hex: '#0e140e', name: 'juniper' },
    { hex: '#101610', name: 'moss' }, { hex: '#121812', name: 'fern' }, { hex: '#141a14', name: 'ivy' },
    { hex: '#161c16', name: 'sage' }, { hex: '#181e18', name: 'herb' }, { hex: '#1a201a', name: 'olive' }
  ],
  // Row 7: Purple/magenta tints (21)
  [
    { hex: '#08040a', name: 'grape' }, { hex: '#0a060c', name: 'plum' }, { hex: '#0c080e', name: 'eggplant' },
    { hex: '#0e0a10', name: 'aubergine' }, { hex: '#100c12', name: 'mulberry' }, { hex: '#120e14', name: 'blackberry' },
    { hex: '#141016', name: 'boysen' }, { hex: '#161218', name: 'jam' }, { hex: '#18141a', name: 'preserve' },
    { hex: '#0a0408', name: 'violet' }, { hex: '#0c060a', name: 'orchid' }, { hex: '#0e080c', name: 'lilac' },
    { hex: '#100a0e', name: 'wisteria' }, { hex: '#120c10', name: 'heather' }, { hex: '#140e12', name: 'thistle' },
    { hex: '#161014', name: 'mauve' }, { hex: '#181216', name: 'dusty rose' }, { hex: '#1a1418', name: 'blush' },
    { hex: '#1c161a', name: 'rouge' }, { hex: '#1e181c', name: 'burgundy rose' }, { hex: '#201a1e', name: 'wine rose' }
  ],
  // Row 8: Mixed tints (21)
  [
    { hex: '#0a0a08', name: 'olive black' }, { hex: '#0c0c0a', name: 'army' }, { hex: '#0e0e0c', name: 'military' },
    { hex: '#101010', name: 'camo' }, { hex: '#0a080a', name: 'plum shadow' }, { hex: '#0c0a0c', name: 'grape shadow' },
    { hex: '#08080c', name: 'ink violet' }, { hex: '#0a0a0e', name: 'deep violet' }, { hex: '#080a0a', name: 'dark teal' },
    { hex: '#0a0c0c', name: 'sea shadow' }, { hex: '#060808', name: 'charcoal blue' }, { hex: '#080a0a', name: 'slate teal' },
    { hex: '#0a0806', name: 'brown black' }, { hex: '#0c0a08', name: 'sepia' }, { hex: '#08060a', name: 'prune' },
    { hex: '#0a080c', name: 'raisin' }, { hex: '#060a08', name: 'hunter' }, { hex: '#080c0a', name: 'woodland' },
    { hex: '#0c0808', name: 'brick' }, { hex: '#0e0a0a', name: 'tile' }, { hex: '#100c0c', name: 'terra' }
  ],
  // Row 9: Warm neutrals (21)
  [
    { hex: '#141210', name: 'warm black' }, { hex: '#161412', name: 'warm char' }, { hex: '#181614', name: 'warm grey' },
    { hex: '#1a1816', name: 'taupe dark' }, { hex: '#1c1a18', name: 'mushroom' }, { hex: '#1e1c1a', name: 'truffle' },
    { hex: '#201e1c', name: 'earth' }, { hex: '#22201e', name: 'soil' }, { hex: '#242220', name: 'loam' },
    { hex: '#121410', name: 'moss black' }, { hex: '#141612', name: 'herb dark' }, { hex: '#161814', name: 'sage dark' },
    { hex: '#101214', name: 'cool char' }, { hex: '#121416', name: 'cool grey' }, { hex: '#141618', name: 'cool slate' },
    { hex: '#14121a', name: 'violet char' }, { hex: '#16141c', name: 'purple grey' }, { hex: '#18161e', name: 'plum grey' },
    { hex: '#1a1210', name: 'rust dark' }, { hex: '#1c1412', name: 'copper dark' }, { hex: '#1e1614', name: 'bronze dark' }
  ]
];

// Foreground colors - 9 rows × 21 columns of light colors for text/borders
const FOREGROUND_COLOR_ROWS: NamedColor[][] = [
  // Row 1: Default only
  [
    { hex: '#ffffff', name: 'white' }
  ],
  // Row 2: Pure whites to light greys (21)
  [
    { hex: '#fafafa', name: 'snow' }, { hex: '#f5f5f5', name: 'cloud' }, { hex: '#f0f0f0', name: 'mist' },
    { hex: '#ebebeb', name: 'silver' }, { hex: '#e6e6e6', name: 'pearl' }, { hex: '#e0e0e0', name: 'platinum' },
    { hex: '#d9d9d9', name: 'chrome' }, { hex: '#d2d2d2', name: 'steel' }, { hex: '#cbcbcb', name: 'pewter' },
    { hex: '#c4c4c4', name: 'nickel' }, { hex: '#bdbdbd', name: 'grey' }, { hex: '#b6b6b6', name: 'stone' },
    { hex: '#afafaf', name: 'slate' }, { hex: '#a8a8a8', name: 'ash' }, { hex: '#a1a1a1', name: 'cement' },
    { hex: '#9a9a9a', name: 'iron' }, { hex: '#939393', name: 'lead' }, { hex: '#8c8c8c', name: 'anchor' },
    { hex: '#858585', name: 'shadow' }, { hex: '#7e7e7e', name: 'charcoal' }, { hex: '#777777', name: 'graphite' }
  ],
  // Row 3: Warm tints - cream to peach (21)
  [
    { hex: '#fff8f0', name: 'cream' }, { hex: '#fff5eb', name: 'ivory' }, { hex: '#fff2e6', name: 'linen' },
    { hex: '#ffefe0', name: 'vanilla' }, { hex: '#ffecdb', name: 'bisque' }, { hex: '#ffe9d6', name: 'peach' },
    { hex: '#ffe5cf', name: 'apricot' }, { hex: '#f5e0ca', name: 'sand' }, { hex: '#ebd8c2', name: 'wheat' },
    { hex: '#e0d0ba', name: 'oat' }, { hex: '#d6c8b2', name: 'tan' }, { hex: '#ccc0aa', name: 'camel' },
    { hex: '#c2b8a2', name: 'khaki' }, { hex: '#b8b09a', name: 'driftwood' }, { hex: '#aea892', name: 'hemp' },
    { hex: '#a4a08a', name: 'clay' }, { hex: '#9a9882', name: 'olive grey' }, { hex: '#90907a', name: 'sage grey' },
    { hex: '#868872', name: 'moss grey' }, { hex: '#7c806a', name: 'lichen' }, { hex: '#727862', name: 'fern grey' }
  ],
  // Row 4: Pink tints - blush to rose (21)
  [
    { hex: '#fff5f5', name: 'blush' }, { hex: '#fff0f2', name: 'petal' }, { hex: '#ffebef', name: 'rose white' },
    { hex: '#ffe6eb', name: 'ballet' }, { hex: '#ffe0e6', name: 'carnation' }, { hex: '#ffdae2', name: 'peony' },
    { hex: '#ffd4dd', name: 'coral pink' }, { hex: '#f5ccd5', name: 'dusty rose' }, { hex: '#ebc4cd', name: 'mauve' },
    { hex: '#e0bcc5', name: 'rose grey' }, { hex: '#d6b4bd', name: 'antique rose' }, { hex: '#ccacb5', name: 'plum grey' },
    { hex: '#c2a4ad', name: 'thistle' }, { hex: '#b89ca5', name: 'heather' }, { hex: '#ae949d', name: 'wisteria' },
    { hex: '#a48c95', name: 'orchid grey' }, { hex: '#9a848d', name: 'violet grey' }, { hex: '#907c85', name: 'wine grey' },
    { hex: '#86747d', name: 'wine' }, { hex: '#7c6c75', name: 'plum' }, { hex: '#72646d', name: 'raisin' }
  ],
  // Row 5: Blue tints - ice to steel (21)
  [
    { hex: '#f5f8ff', name: 'ice' }, { hex: '#f0f5ff', name: 'frost' }, { hex: '#ebf2ff', name: 'arctic' },
    { hex: '#e6efff', name: 'sky' }, { hex: '#e0ebff', name: 'cloud blue' }, { hex: '#dae6ff', name: 'powder' },
    { hex: '#d4e0ff', name: 'periwinkle' }, { hex: '#ccd8f5', name: 'cornflower' }, { hex: '#c4d0eb', name: 'lavender' },
    { hex: '#bcc8e0', name: 'blue grey' }, { hex: '#b4c0d6', name: 'steel blue' }, { hex: '#acb8cc', name: 'slate blue' },
    { hex: '#a4b0c2', name: 'cadet' }, { hex: '#9ca8b8', name: 'horizon' }, { hex: '#94a0ae', name: 'storm' },
    { hex: '#8c98a4', name: 'dusk' }, { hex: '#84909a', name: 'twilight' }, { hex: '#7c8890', name: 'harbour' },
    { hex: '#748086', name: 'ocean grey' }, { hex: '#6c787c', name: 'marine' }, { hex: '#647072', name: 'deep sea' }
  ],
  // Row 6: Green tints - mint to sage (21)
  [
    { hex: '#f5fff8', name: 'mint cream' }, { hex: '#f0fff5', name: 'honeydew' }, { hex: '#ebfff2', name: 'seafoam' },
    { hex: '#e6ffef', name: 'spring' }, { hex: '#e0ffeb', name: 'pale mint' }, { hex: '#daf5e5', name: 'celadon' },
    { hex: '#d4ebdf', name: 'jade white' }, { hex: '#cce0d7', name: 'eucalyptus' }, { hex: '#c4d6cf', name: 'sage' },
    { hex: '#bcccc7', name: 'moss' }, { hex: '#b4c2bf', name: 'lichen' }, { hex: '#acb8b5', name: 'fern' },
    { hex: '#a4aeab', name: 'green grey' }, { hex: '#9ca4a1', name: 'olive' }, { hex: '#949a97', name: 'bay leaf' },
    { hex: '#8c908d', name: 'herb' }, { hex: '#848683', name: 'forest grey' }, { hex: '#7c7c79', name: 'pine grey' },
    { hex: '#74726f', name: 'spruce' }, { hex: '#6c6865', name: 'fir' }, { hex: '#645e5b', name: 'bark' }
  ],
  // Row 7: Purple tints - lavender to violet (21)
  [
    { hex: '#f8f5ff', name: 'lavender white' }, { hex: '#f5f0ff', name: 'wisteria' }, { hex: '#f2ebff', name: 'lilac' },
    { hex: '#efe6ff', name: 'orchid' }, { hex: '#ebe0ff', name: 'thistle' }, { hex: '#e6daff', name: 'heather' },
    { hex: '#e0d4f5', name: 'amethyst' }, { hex: '#d8cceb', name: 'iris' }, { hex: '#d0c4e0', name: 'violet grey' },
    { hex: '#c8bcd6', name: 'grape' }, { hex: '#c0b4cc', name: 'plum' }, { hex: '#b8acc2', name: 'mauve' },
    { hex: '#b0a4b8', name: 'dusk violet' }, { hex: '#a89cae', name: 'twilight' }, { hex: '#a094a4', name: 'storm' },
    { hex: '#988c9a', name: 'ash violet' }, { hex: '#908490', name: 'cloudy' }, { hex: '#887c86', name: 'shadow' },
    { hex: '#80747c', name: 'dusty' }, { hex: '#786c72', name: 'fog' }, { hex: '#706468', name: 'charcoal' }
  ],
  // Row 8: Yellow/gold tints - butter to amber (21)
  [
    { hex: '#fffef5', name: 'butter' }, { hex: '#fffcf0', name: 'cream' }, { hex: '#fff9eb', name: 'champagne' },
    { hex: '#fff6e6', name: 'ecru' }, { hex: '#fff3e0', name: 'parchment' }, { hex: '#fff0da', name: 'papyrus' },
    { hex: '#f5ecd4', name: 'bone' }, { hex: '#ebe5ce', name: 'antique' }, { hex: '#e0ddc8', name: 'linen' },
    { hex: '#d6d5c2', name: 'flax' }, { hex: '#cccdbc', name: 'straw' }, { hex: '#c2c5b6', name: 'reed' },
    { hex: '#b8bdb0', name: 'willow' }, { hex: '#aeb5aa', name: 'celery' }, { hex: '#a4ada4', name: 'pale olive' },
    { hex: '#9aa59e', name: 'laurel' }, { hex: '#909d98', name: 'seafoam grey' }, { hex: '#869592', name: 'tide' },
    { hex: '#7c8d8c', name: 'seaglass' }, { hex: '#728586', name: 'foam' }, { hex: '#687d80', name: 'teal grey' }
  ],
  // Row 9: Warm greys and cool greys (21)
  [
    { hex: '#e8e4e0', name: 'warm white' }, { hex: '#dedbd6', name: 'sandstone' }, { hex: '#d4d2cc', name: 'limestone' },
    { hex: '#cac9c2', name: 'travertine' }, { hex: '#c0c0b8', name: 'shale' }, { hex: '#b6b7ae', name: 'granite' },
    { hex: '#acaea4', name: 'quarry' }, { hex: '#e0e4e8', name: 'cool white' }, { hex: '#d6dbe0', name: 'glacier' },
    { hex: '#ccd2d6', name: 'winter' }, { hex: '#c2c9cc', name: 'silver blue' }, { hex: '#b8c0c2', name: 'smoke' },
    { hex: '#aeb7b8', name: 'overcast' }, { hex: '#a4aeae', name: 'nimbus' }, { hex: '#9aa5a4', name: 'storm cloud' },
    { hex: '#909c9a', name: 'thunder' }, { hex: '#869390', name: 'rain' }, { hex: '#7c8a86', name: 'mist' },
    { hex: '#72817c', name: 'fog' }, { hex: '#687872', name: 'slate' }, { hex: '#5e6f68', name: 'dark sage' }
  ]
];

const ALL_COLORS = COLOR_ROWS.flat().map(c => c.hex);

// CSS variable mapping for each color type
const COLOR_VARIABLE_INFO: Record<string, { vars: string[]; desc: string }> = {
  foreground: {
    vars: ['--foreground-color', '--foreground-rgb', '--fg-100 → --fg-02'],
    desc: 'text, borders, icons'
  },
  background: {
    vars: ['--background-color', '--background-rgb', '--bg-100 → --bg-30'],
    desc: 'app background, overlays'
  },
  accent: {
    vars: ['--accent-color', '--accent-rgb'],
    desc: 'highlights, selections, links'
  },
  positive: {
    vars: ['--positive-color', '--positive-rgb'],
    desc: 'success, additions, green'
  },
  negative: {
    vars: ['--negative-color', '--negative-rgb'],
    desc: 'errors, deletions, red'
  }
};

// Theme system
type Theme = {
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

const BUILT_IN_THEMES: Theme[] = [
  // === SIGNATURE ===
  {
    id: 'yurucode',
    name: 'yurucode',
    backgroundColor: '#0a0a0a',
    foregroundColor: '#ffffff',
    accentColor: '#bb99ff',
    positiveColor: '#99ff99',
    negativeColor: '#ff9999',
    opacity: 0.97,
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

export const SettingsModalTabbed: React.FC<SettingsModalProps> = ({ onClose }) => {
  const { isLicensed } = useLicenseStore();
  const [activeTab, setActiveTab] = useState<SettingsTab>('theme');
  const [isDragging, setIsDragging] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);
  const [zoomLevel, setZoomLevel] = useState(0);
  const [backgroundColor, setBackgroundColor] = useState('#0a0a0a');
  const [foregroundColor, setForegroundColor] = useState('#ffffff');
  const [accentColor, setAccentColor] = useState('#bb99ff');
  const [positiveColor, setPositiveColor] = useState('#99ff99');
  const [negativeColor, setNegativeColor] = useState('#ff9999');
  const [htmlOpacity, setHtmlOpacity] = useState(0.92);
  const [showColorPicker, setShowColorPicker] = useState<'background' | 'foreground' | 'accent' | 'positive' | 'negative' | null>(null);
  const [hoveredColorType, setHoveredColorType] = useState<string | null>(null);
  const [previewColor, setPreviewColor] = useState<string | null>(null);
  const [showFontPicker, setShowFontPicker] = useState<'monospace' | 'sans-serif' | null>(null);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Theme system state
  const [customThemes, setCustomThemes] = useState<Theme[]>([]);
  const [currentThemeId, setCurrentThemeId] = useState<string>('default');
  const [showThemeDropdown, setShowThemeDropdown] = useState(false);
  const [editingThemeName, setEditingThemeName] = useState<string | null>(null);
  const [hoveredThemeId, setHoveredThemeId] = useState<string | null>(null);
  const [newThemeName, setNewThemeName] = useState('');
  const [showNewThemeInput, setShowNewThemeInput] = useState(false);
  const themeDropdownRef = useRef<HTMLDivElement>(null);
  const newThemeInputRef = useRef<HTMLInputElement>(null);
  const {
    globalWatermarkImage, setGlobalWatermark,
    monoFont, sansFont, setMonoFont, setSansFont,
    rememberTabs, setRememberTabs,
    autoGenerateTitle, setAutoGenerateTitle,
    showProjectsMenu, setShowProjectsMenu,
    showAgentsMenu, setShowAgentsMenu,
    showAnalyticsMenu, setShowAnalyticsMenu,
    showCommandsSettings, setShowCommandsSettings,
    showMcpSettings, setShowMcpSettings,
    showHooksSettings, setShowHooksSettings,
    backgroundOpacity, setBackgroundOpacity
  } = useClaudeCodeStore();

  // Handle escape key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Close any sub-modals first
        if (showColorPicker) {
          setShowColorPicker(null);
        } else if (showFontPicker) {
          setShowFontPicker(null);
        } else if (showAboutModal) {
          setShowAboutModal(false);
        } else {
          onClose();
        }
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose, showColorPicker, showFontPicker, showAboutModal]);

  // Handle drag cursor on settings header
  useEffect(() => {
    const handleMouseDown = async (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('button') || target.closest('input')) {
        return;
      }
      setIsDragging(true);
      try {
        if ((window as any).__TAURI__) {
          const windowApi = await import('@tauri-apps/api/window') as any;
          let appWindow;
          if (windowApi.getCurrent) {
            appWindow = windowApi.getCurrent();
          } else if (windowApi.appWindow) {
            appWindow = windowApi.appWindow;
          } else if (windowApi.Window?.getCurrent) {
            appWindow = windowApi.Window.getCurrent();
          }
          if (appWindow) {
            await appWindow.startDragging();
          }
        }
      } catch (error) {
        console.error('Settings: Error starting drag:', error);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    const element = headerRef.current;
    if (element) {
      element.addEventListener('mousedown', handleMouseDown);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        element.removeEventListener('mousedown', handleMouseDown);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, []);

  // Hooks tab state
  const [hooks, setHooks] = useState<HookScriptConfig[]>([]);
  const [selectedHooks, setSelectedHooks] = useState<Record<string, boolean>>({});
  const [hookScripts, setHookScripts] = useState<Record<string, string>>({});

  // Commands tab state
  const [commands, setCommands] = useState<any[]>([]);
  const [showAddCommand, setShowAddCommand] = useState(false);
  const [editingCommandIndex, setEditingCommandIndex] = useState<number | null>(null);
  const [newCommand, setNewCommand] = useState({ trigger: '', description: '', script: '' });
  const [editingCommand, setEditingCommand] = useState({ trigger: '', description: '', script: '' });

  useEffect(() => {
    // Load hooks when hooks tab is active
    if (activeTab === 'hooks') {
      loadHooks();
    }
    // Load commands when commands tab is active
    if (activeTab === 'commands') {
      const saved = localStorage.getItem('custom_commands');
      if (saved) {
        try {
          setCommands(JSON.parse(saved));
        } catch (error) {
          console.error('Failed to load commands:', error);
        }
      }
    }
  }, [activeTab]);

  const loadHooks = () => {
    const allHooks = hooksService.getAllHooks();
    setHooks(allHooks);
  };

  useEffect(() => {
    // Get current zoom level
    const getZoom = async () => {
      if (window.electronAPI?.zoom?.getLevel) {
        try {
          const level = await window.electronAPI.zoom.getLevel();
          setZoomLevel(level);
        } catch (err) {
          console.error('Failed to get zoom level:', err);
          const saved = localStorage.getItem('zoomLevel');
          if (saved) {
            setZoomLevel(parseFloat(saved));
          }
        }
      } else {
        const saved = localStorage.getItem('zoomLevel');
        if (saved) {
          setZoomLevel(parseFloat(saved));
        }
      }
    };
    getZoom();

    // Get saved colors and apply them
    const savedBackgroundColor = localStorage.getItem('backgroundColor') || '#0a0a0a';
    setBackgroundColor(savedBackgroundColor);
    document.documentElement.style.setProperty('--background-color', savedBackgroundColor);
    const bgHex = savedBackgroundColor.replace('#', '');
    const bgR = parseInt(bgHex.substr(0, 2), 16);
    const bgG = parseInt(bgHex.substr(2, 2), 16);
    const bgB = parseInt(bgHex.substr(4, 2), 16);
    document.documentElement.style.setProperty('--background-rgb', `${bgR}, ${bgG}, ${bgB}`);

    const savedForegroundColor = localStorage.getItem('foregroundColor') || '#ffffff';
    setForegroundColor(savedForegroundColor);
    document.documentElement.style.setProperty('--foreground-color', savedForegroundColor);
    const fgHex = savedForegroundColor.replace('#', '');
    const fgR = parseInt(fgHex.substr(0, 2), 16);
    const fgG = parseInt(fgHex.substr(2, 2), 16);
    const fgB = parseInt(fgHex.substr(4, 2), 16);
    document.documentElement.style.setProperty('--foreground-rgb', `${fgR}, ${fgG}, ${fgB}`);

    const savedAccentColor = localStorage.getItem('accentColor') || '#bb99ff';
    setAccentColor(savedAccentColor);
    document.documentElement.style.setProperty('--accent-color', savedAccentColor);
    const accentHex = savedAccentColor.replace('#', '');
    const accentR = parseInt(accentHex.substr(0, 2), 16);
    const accentG = parseInt(accentHex.substr(2, 2), 16);
    const accentB = parseInt(accentHex.substr(4, 2), 16);
    document.documentElement.style.setProperty('--accent-rgb', `${accentR}, ${accentG}, ${accentB}`);

    const savedPositiveColor = localStorage.getItem('positiveColor') || '#99ff99';
    setPositiveColor(savedPositiveColor);
    document.documentElement.style.setProperty('--positive-color', savedPositiveColor);
    const positiveHex = savedPositiveColor.replace('#', '');
    const positiveR = parseInt(positiveHex.substr(0, 2), 16);
    const positiveG = parseInt(positiveHex.substr(2, 2), 16);
    const positiveB = parseInt(positiveHex.substr(4, 2), 16);
    document.documentElement.style.setProperty('--positive-rgb', `${positiveR}, ${positiveG}, ${positiveB}`);

    const savedNegativeColor = localStorage.getItem('negativeColor') || '#ff9999';
    setNegativeColor(savedNegativeColor);
    document.documentElement.style.setProperty('--negative-color', savedNegativeColor);
    const negativeHex = savedNegativeColor.replace('#', '');
    const negativeR = parseInt(negativeHex.substr(0, 2), 16);
    const negativeG = parseInt(negativeHex.substr(2, 2), 16);
    const negativeB = parseInt(negativeHex.substr(4, 2), 16);
    document.documentElement.style.setProperty('--negative-rgb', `${negativeR}, ${negativeG}, ${negativeB}`);

    // Load html opacity (user setting, not theme)
    const savedHtmlOpacity = localStorage.getItem('htmlOpacity');
    const opacityValue = savedHtmlOpacity ? parseFloat(savedHtmlOpacity) : 0.92;
    setHtmlOpacity(opacityValue);
    document.documentElement.style.opacity = opacityValue.toString();

    // Listen for zoom changes
    const handleZoomChange = (e: any) => {
      setZoomLevel(e.detail);
    };
    window.addEventListener('zoom-changed', handleZoomChange);
    return () => window.removeEventListener('zoom-changed', handleZoomChange);
  }, []);

  // Load custom themes and current theme from localStorage
  useEffect(() => {
    const savedCustomThemes = localStorage.getItem('customThemes');
    if (savedCustomThemes) {
      try {
        setCustomThemes(JSON.parse(savedCustomThemes));
      } catch (e) {
        console.error('Failed to parse custom themes:', e);
      }
    }
    const savedCurrentTheme = localStorage.getItem('currentThemeId');
    if (savedCurrentTheme) {
      setCurrentThemeId(savedCurrentTheme);
    }
  }, []);

  // Close theme dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (themeDropdownRef.current && !themeDropdownRef.current.contains(e.target as Node)) {
        setShowThemeDropdown(false);
        setEditingThemeName(null);
      }
    };
    if (showThemeDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showThemeDropdown]);

  // Get all themes (built-in + custom)
  const allThemes = [...BUILT_IN_THEMES, ...customThemes];

  // Find current theme object
  const getCurrentTheme = (): Theme | null => {
    return allThemes.find(t => t.id === currentThemeId) || null;
  };

  // Check if current colors match a theme
  const findMatchingTheme = (): Theme | null => {
    return allThemes.find(t =>
      t.backgroundColor === backgroundColor &&
      t.foregroundColor === foregroundColor &&
      t.accentColor === accentColor &&
      t.positiveColor === positiveColor &&
      t.negativeColor === negativeColor
    ) || null;
  };

  // Detect if colors have been modified from any theme
  useEffect(() => {
    const matchingTheme = findMatchingTheme();
    if (matchingTheme) {
      setCurrentThemeId(matchingTheme.id);
      localStorage.setItem('currentThemeId', matchingTheme.id);
    } else if (currentThemeId !== 'custom') {
      // Colors don't match any theme - switch to custom
      setCurrentThemeId('custom');
      localStorage.setItem('currentThemeId', 'custom');
    }
  }, [backgroundColor, foregroundColor, accentColor, positiveColor, negativeColor]);

  // Apply a theme (fonts are independent of themes)
  const applyTheme = (theme: Theme) => {
    handleBackgroundColorChange(theme.backgroundColor);
    handleForegroundColorChange(theme.foregroundColor);
    handleAccentColorChange(theme.accentColor);
    handlePositiveColorChange(theme.positiveColor);
    handleNegativeColorChange(theme.negativeColor);
    setCurrentThemeId(theme.id);
    localStorage.setItem('currentThemeId', theme.id);
    setShowThemeDropdown(false);
  };

  // Save current colors as a new custom theme (or update existing by name)
  const saveAsCustomTheme = (name: string) => {
    const existingTheme = customThemes.find(t => t.name.toLowerCase() === name.toLowerCase());

    if (existingTheme) {
      // Update existing theme with current colors (fonts are independent of themes)
      const updatedThemes = customThemes.map(t =>
        t.id === existingTheme.id
          ? { ...t, backgroundColor, foregroundColor, accentColor, positiveColor, negativeColor }
          : t
      );
      setCustomThemes(updatedThemes);
      localStorage.setItem('customThemes', JSON.stringify(updatedThemes));
      setCurrentThemeId(existingTheme.id);
      localStorage.setItem('currentThemeId', existingTheme.id);
    } else {
      // Create new theme (fonts are independent of themes)
      const newTheme: Theme = {
        id: `custom-${Date.now()}`,
        name: name,
        backgroundColor,
        foregroundColor,
        accentColor,
        positiveColor,
        negativeColor,
        isBuiltIn: false
      };
      const updatedThemes = [...customThemes, newTheme];
      setCustomThemes(updatedThemes);
      localStorage.setItem('customThemes', JSON.stringify(updatedThemes));
      setCurrentThemeId(newTheme.id);
      localStorage.setItem('currentThemeId', newTheme.id);
    }
  };

  // Rename a custom theme
  const renameTheme = (themeId: string, newName: string) => {
    const updatedThemes = customThemes.map(t =>
      t.id === themeId ? { ...t, name: newName } : t
    );
    setCustomThemes(updatedThemes);
    localStorage.setItem('customThemes', JSON.stringify(updatedThemes));
    setEditingThemeName(null);
  };

  // Delete a custom theme
  const deleteTheme = (themeId: string) => {
    const updatedThemes = customThemes.filter(t => t.id !== themeId);
    setCustomThemes(updatedThemes);
    localStorage.setItem('customThemes', JSON.stringify(updatedThemes));
    if (currentThemeId === themeId) {
      // Switch back to default theme
      const defaultTheme = BUILT_IN_THEMES[0];
      applyTheme(defaultTheme);
    }
  };

  // Check if current colors differ from the selected theme
  const hasThemeChanges = (): boolean => {
    if (currentThemeId === 'custom') return false;
    const theme = getCurrentTheme();
    if (!theme) return false;
    return (
      theme.backgroundColor !== backgroundColor ||
      theme.foregroundColor !== foregroundColor ||
      theme.accentColor !== accentColor ||
      theme.positiveColor !== positiveColor ||
      theme.negativeColor !== negativeColor
    );
  };

  // Reset to current theme's original colors
  const resetToCurrentTheme = () => {
    const theme = getCurrentTheme();
    if (theme) {
      handleBackgroundColorChange(theme.backgroundColor);
      handleForegroundColorChange(theme.foregroundColor);
      handleAccentColorChange(theme.accentColor);
      handlePositiveColorChange(theme.positiveColor);
      handleNegativeColorChange(theme.negativeColor);
    }
  };

  // Get display name for current theme
  const getCurrentThemeDisplayName = (): string => {
    if (currentThemeId === 'custom') return 'custom';
    const theme = getCurrentTheme();
    const name = theme?.name || 'custom';
    return hasThemeChanges() ? `${name}*` : name;
  };

  // Get current theme's default value for a specific color type
  const getThemeDefault = (colorType: 'foreground' | 'accent' | 'positive' | 'negative' | 'background'): string => {
    const theme = getCurrentTheme();
    if (!theme) {
      // Fallback to default theme values
      const defaults = { foreground: '#ffffff', accent: '#bb99ff', positive: '#99ff99', negative: '#ff9999', background: '#0a0a0a' };
      return defaults[colorType];
    }
    const map = {
      foreground: theme.foregroundColor,
      accent: theme.accentColor,
      positive: theme.positiveColor,
      negative: theme.negativeColor,
      background: theme.backgroundColor
    };
    return map[colorType];
  };

  // Get default yurucode font (fonts are independent of themes)
  const getThemeFontDefault = (fontType: 'mono' | 'sans'): string => {
    return fontType === 'mono' ? 'Comic Mono' : 'Comic Neue';
  };

  // Preview theme on hover (apply temporarily)
  const previewTheme = (theme: Theme) => {
    document.documentElement.style.setProperty('--background-color', theme.backgroundColor);
    const bgHex = theme.backgroundColor.replace('#', '');
    document.documentElement.style.setProperty('--background-rgb', `${parseInt(bgHex.substr(0, 2), 16)}, ${parseInt(bgHex.substr(2, 2), 16)}, ${parseInt(bgHex.substr(4, 2), 16)}`);

    document.documentElement.style.setProperty('--foreground-color', theme.foregroundColor);
    const fgHex = theme.foregroundColor.replace('#', '');
    document.documentElement.style.setProperty('--foreground-rgb', `${parseInt(fgHex.substr(0, 2), 16)}, ${parseInt(fgHex.substr(2, 2), 16)}, ${parseInt(fgHex.substr(4, 2), 16)}`);

    document.documentElement.style.setProperty('--accent-color', theme.accentColor);
    const accentHex = theme.accentColor.replace('#', '');
    document.documentElement.style.setProperty('--accent-rgb', `${parseInt(accentHex.substr(0, 2), 16)}, ${parseInt(accentHex.substr(2, 2), 16)}, ${parseInt(accentHex.substr(4, 2), 16)}`);

    document.documentElement.style.setProperty('--positive-color', theme.positiveColor);
    document.documentElement.style.setProperty('--negative-color', theme.negativeColor);
    // Fonts are not previewed with themes - they are independent
  };

  // Restore current theme after preview
  const restoreCurrentTheme = () => {
    document.documentElement.style.setProperty('--background-color', backgroundColor);
    const bgHex = backgroundColor.replace('#', '');
    document.documentElement.style.setProperty('--background-rgb', `${parseInt(bgHex.substr(0, 2), 16)}, ${parseInt(bgHex.substr(2, 2), 16)}, ${parseInt(bgHex.substr(4, 2), 16)}`);

    document.documentElement.style.setProperty('--foreground-color', foregroundColor);
    const fgHex = foregroundColor.replace('#', '');
    document.documentElement.style.setProperty('--foreground-rgb', `${parseInt(fgHex.substr(0, 2), 16)}, ${parseInt(fgHex.substr(2, 2), 16)}, ${parseInt(fgHex.substr(4, 2), 16)}`);

    document.documentElement.style.setProperty('--accent-color', accentColor);
    const accentHex = accentColor.replace('#', '');
    document.documentElement.style.setProperty('--accent-rgb', `${parseInt(accentHex.substr(0, 2), 16)}, ${parseInt(accentHex.substr(2, 2), 16)}, ${parseInt(accentHex.substr(4, 2), 16)}`);

    document.documentElement.style.setProperty('--positive-color', positiveColor);
    document.documentElement.style.setProperty('--negative-color', negativeColor);
    // Fonts are not restored since they weren't changed during preview
  };


  const handleWatermarkUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file size (limit to 1MB)
    if (file.size > 1024 * 1024) {
      alert('Image must be less than 1MB');
      return;
    }

    // Convert to base64
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setGlobalWatermark(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveWatermark = () => {
    setGlobalWatermark(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };


  const handleZoomIn = async () => {
    if (window.electronAPI?.zoom?.in) {
      try {
        const newZoom = await window.electronAPI.zoom.in();
        if (newZoom !== null && newZoom !== undefined) {
          setZoomLevel(newZoom);
        }
      } catch (err) {
        console.error('Zoom in error:', err);
      }
    }
  };

  const handleZoomOut = async () => {
    if (window.electronAPI?.zoom?.out) {
      try {
        const newZoom = await window.electronAPI.zoom.out();
        if (newZoom !== null && newZoom !== undefined) {
          setZoomLevel(newZoom);
        }
      } catch (err) {
        console.error('Zoom out error:', err);
      }
    }
  };

  const handleResetZoom = async () => {
    if (window.electronAPI?.zoom?.reset) {
      try {
        const newZoom = await window.electronAPI.zoom.reset();
        if (newZoom !== null && newZoom !== undefined) {
          setZoomLevel(0);
        }
      } catch (err) {
        console.error('Reset zoom error:', err);
      }
    }
  };

  const handleBackgroundColorChange = (color: string) => {
    setBackgroundColor(color);
    localStorage.setItem('backgroundColor', color);
    document.documentElement.style.setProperty('--background-color', color);
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    document.documentElement.style.setProperty('--background-rgb', `${r}, ${g}, ${b}`);
  };

  const handleForegroundColorChange = (color: string) => {
    setForegroundColor(color);
    localStorage.setItem('foregroundColor', color);
    document.documentElement.style.setProperty('--foreground-color', color);
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    document.documentElement.style.setProperty('--foreground-rgb', `${r}, ${g}, ${b}`);
  };

  const handleAccentColorChange = (color: string) => {
    setAccentColor(color);
    localStorage.setItem('accentColor', color);
    document.documentElement.style.setProperty('--accent-color', color);
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    document.documentElement.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
  };

  const handlePositiveColorChange = (color: string) => {
    setPositiveColor(color);
    localStorage.setItem('positiveColor', color);
    document.documentElement.style.setProperty('--positive-color', color);
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    document.documentElement.style.setProperty('--positive-rgb', `${r}, ${g}, ${b}`);
  };

  const handleNegativeColorChange = (color: string) => {
    setNegativeColor(color);
    localStorage.setItem('negativeColor', color);
    document.documentElement.style.setProperty('--negative-color', color);
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    document.documentElement.style.setProperty('--negative-rgb', `${r}, ${g}, ${b}`);
  };

  const handleHtmlOpacityChange = (value: number) => {
    const clamped = Math.max(0.70, Math.min(1.00, value));
    const rounded = Math.round(clamped * 100) / 100;
    setHtmlOpacity(rounded);
    localStorage.setItem('htmlOpacity', rounded.toString());
    document.documentElement.style.opacity = rounded.toString();
  };

  // Preview color on hover (temporary, not saved)
  const handleColorPreview = (color: string) => {
    setPreviewColor(color);
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);

    if (showColorPicker === 'background') {
      document.documentElement.style.setProperty('--background-color', color);
      document.documentElement.style.setProperty('--background-rgb', `${r}, ${g}, ${b}`);
    } else if (showColorPicker === 'foreground') {
      document.documentElement.style.setProperty('--foreground-color', color);
      document.documentElement.style.setProperty('--foreground-rgb', `${r}, ${g}, ${b}`);
    } else if (showColorPicker === 'accent') {
      document.documentElement.style.setProperty('--accent-color', color);
      document.documentElement.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
    } else if (showColorPicker === 'positive') {
      document.documentElement.style.setProperty('--positive-color', color);
      document.documentElement.style.setProperty('--positive-rgb', `${r}, ${g}, ${b}`);
    } else if (showColorPicker === 'negative') {
      document.documentElement.style.setProperty('--negative-color', color);
      document.documentElement.style.setProperty('--negative-rgb', `${r}, ${g}, ${b}`);
    }
  };

  // Restore original color when hover ends
  const handleColorPreviewEnd = () => {
    setPreviewColor(null);

    // Restore the actual saved colors
    const restoreColor = (color: string, varName: string, rgbVarName: string) => {
      document.documentElement.style.setProperty(varName, color);
      const hex = color.replace('#', '');
      const r = parseInt(hex.substr(0, 2), 16);
      const g = parseInt(hex.substr(2, 2), 16);
      const b = parseInt(hex.substr(4, 2), 16);
      document.documentElement.style.setProperty(rgbVarName, `${r}, ${g}, ${b}`);
    };

    if (showColorPicker === 'background') {
      restoreColor(backgroundColor, '--background-color', '--background-rgb');
    } else if (showColorPicker === 'foreground') {
      restoreColor(foregroundColor, '--foreground-color', '--foreground-rgb');
    } else if (showColorPicker === 'accent') {
      restoreColor(accentColor, '--accent-color', '--accent-rgb');
    } else if (showColorPicker === 'positive') {
      restoreColor(positiveColor, '--positive-color', '--positive-rgb');
    } else if (showColorPicker === 'negative') {
      restoreColor(negativeColor, '--negative-color', '--negative-rgb');
    }
  };

  const handleResetAllTheme = () => {
    handleBackgroundColorChange('#0a0a0a');
    handleForegroundColorChange('#ffffff');
    handleAccentColorChange('#bb99ff');
    handlePositiveColorChange('#99ff99');
    handleNegativeColorChange('#ff9999');
  };

  const isDefaultTheme = backgroundColor === '#0a0a0a' &&
    foregroundColor === '#ffffff' &&
    accentColor === '#bb99ff' &&
    positiveColor === '#99ff99' &&
    negativeColor === '#ff9999';

  const handleResetAllFonts = () => {
    setMonoFont('Comic Mono');
    setSansFont('Comic Neue');
  };

  const isDefaultFonts = monoFont === 'Comic Mono' && sansFont === 'Comic Neue';

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'general':
        return (
          <>
            {/* Options */}
            <div className="settings-section">
              <h4>options</h4>

              <div className="checkbox-setting">
                <span className="checkbox-label">remember tabs on restart</span>
                <input
                  type="checkbox"
                  className="checkbox-input"
                  id="rememberTabs"
                  checked={rememberTabs}
                  onChange={(e) => setRememberTabs(e.target.checked)}
                />
                <div className="toggle-switch-container">
                  <label htmlFor="rememberTabs" className={`toggle-switch ${rememberTabs ? 'active' : ''}`}>
                    <span className="toggle-switch-slider" />
                    <span className="toggle-switch-label off">OFF</span>
                    <span className="toggle-switch-label on">ON</span>
                  </label>
                </div>
              </div>

              <div className="checkbox-setting">
                <span className="checkbox-label">auto-generate tab titles</span>
                <input
                  type="checkbox"
                  className="checkbox-input"
                  id="autoGenerateTitle"
                  checked={autoGenerateTitle}
                  onChange={(e) => setAutoGenerateTitle(e.target.checked)}
                />
                <div className="toggle-switch-container">
                  <label htmlFor="autoGenerateTitle" className={`toggle-switch ${autoGenerateTitle ? 'active' : ''}`}>
                    <span className="toggle-switch-slider" />
                    <span className="toggle-switch-label off">OFF</span>
                    <span className="toggle-switch-label on">ON</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Menu visibility */}
            <div className="settings-section">
              <h4>menu</h4>

              <div className="checkbox-setting">
                <span className="checkbox-label">projects</span>
                <input
                  type="checkbox"
                  className="checkbox-input"
                  id="showProjectsMenu"
                  checked={showProjectsMenu}
                  onChange={(e) => setShowProjectsMenu(e.target.checked)}
                />
                <div className="toggle-switch-container">
                  <label htmlFor="showProjectsMenu" className={`toggle-switch ${showProjectsMenu ? 'active' : ''}`}>
                    <span className="toggle-switch-slider" />
                    <span className="toggle-switch-label off">OFF</span>
                    <span className="toggle-switch-label on">ON</span>
                  </label>
                </div>
              </div>

              <div className="checkbox-setting">
                <span className="checkbox-label">agents</span>
                <input
                  type="checkbox"
                  className="checkbox-input"
                  id="showAgentsMenu"
                  checked={showAgentsMenu}
                  onChange={(e) => setShowAgentsMenu(e.target.checked)}
                />
                <div className="toggle-switch-container">
                  <label htmlFor="showAgentsMenu" className={`toggle-switch ${showAgentsMenu ? 'active' : ''}`}>
                    <span className="toggle-switch-slider" />
                    <span className="toggle-switch-label off">OFF</span>
                    <span className="toggle-switch-label on">ON</span>
                  </label>
                </div>
              </div>

              <div className="checkbox-setting">
                <span className="checkbox-label">analytics</span>
                <input
                  type="checkbox"
                  className="checkbox-input"
                  id="showAnalyticsMenu"
                  checked={showAnalyticsMenu}
                  onChange={(e) => setShowAnalyticsMenu(e.target.checked)}
                />
                <div className="toggle-switch-container">
                  <label htmlFor="showAnalyticsMenu" className={`toggle-switch ${showAnalyticsMenu ? 'active' : ''}`}>
                    <span className="toggle-switch-slider" />
                    <span className="toggle-switch-label off">OFF</span>
                    <span className="toggle-switch-label on">ON</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Settings visibility */}
            <div className="settings-section">
              <h4>settings</h4>

              <div className="checkbox-setting">
                <span className="checkbox-label">commands</span>
                <input
                  type="checkbox"
                  className="checkbox-input"
                  id="showCommandsSettings"
                  checked={showCommandsSettings}
                  onChange={(e) => setShowCommandsSettings(e.target.checked)}
                />
                <div className="toggle-switch-container">
                  <label htmlFor="showCommandsSettings" className={`toggle-switch ${showCommandsSettings ? 'active' : ''}`}>
                    <span className="toggle-switch-slider" />
                    <span className="toggle-switch-label off">OFF</span>
                    <span className="toggle-switch-label on">ON</span>
                  </label>
                </div>
              </div>

              <div className="checkbox-setting">
                <span className="checkbox-label">mcp</span>
                <input
                  type="checkbox"
                  className="checkbox-input"
                  id="showMcpSettings"
                  checked={showMcpSettings}
                  onChange={(e) => setShowMcpSettings(e.target.checked)}
                />
                <div className="toggle-switch-container">
                  <label htmlFor="showMcpSettings" className={`toggle-switch ${showMcpSettings ? 'active' : ''}`}>
                    <span className="toggle-switch-slider" />
                    <span className="toggle-switch-label off">OFF</span>
                    <span className="toggle-switch-label on">ON</span>
                  </label>
                </div>
              </div>

              <div className="checkbox-setting">
                <span className="checkbox-label">hooks</span>
                <input
                  type="checkbox"
                  className="checkbox-input"
                  id="showHooksSettings"
                  checked={showHooksSettings}
                  onChange={(e) => setShowHooksSettings(e.target.checked)}
                />
                <div className="toggle-switch-container">
                  <label htmlFor="showHooksSettings" className={`toggle-switch ${showHooksSettings ? 'active' : ''}`}>
                    <span className="toggle-switch-slider" />
                    <span className="toggle-switch-label off">OFF</span>
                    <span className="toggle-switch-label on">ON</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Claude Code Configuration */}
            <div className="settings-section">
              <h4>claude code</h4>
              <ClaudeSelector onSettingsChange={(settings) => {
                console.log('Claude settings updated:', settings);
              }} />
              <SystemPromptSelector onSettingsChange={(settings) => {
                console.log('System prompt settings updated:', settings);
              }} />
            </div>

            {/* Actions removed from general tab - now in bottom controls */}
          </>
        );

      case 'hooks':
        return (
          <HooksTab
            selectedHooks={selectedHooks}
            setSelectedHooks={setSelectedHooks}
            hookScripts={hookScripts}
            setHookScripts={setHookScripts}
          />
        );

      case 'theme':
        return (
          <>
            {/* Theme selector at top */}
            <div className="settings-section" style={{ marginBottom: '12px' }}>
              <h4 style={{ textAlign: 'left' }}>theme</h4>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                <button
                  onClick={() => setShowThemeDropdown(true)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 10px',
                    background: 'transparent',
                    border: '1px solid var(--fg-15)',
                    borderRadius: '4px',
                    cursor: 'default',
                    width: '200px',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(var(--accent-rgb), 0.5)';
                    e.currentTarget.style.background = 'var(--fg-05)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--fg-15)';
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <div style={{ display: 'flex', gap: '2px' }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: foregroundColor, border: '1px solid var(--fg-10)' }} />
                    <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: accentColor }} />
                    <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: positiveColor }} />
                    <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: negativeColor }} />
                    <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: backgroundColor, border: '1px solid var(--fg-20)' }} />
                  </div>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 'bold',
                    color: blendColors(foregroundColor, accentColor)
                  }}>
                    {getCurrentThemeDisplayName()}
                  </span>
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '200px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--fg-50)' }}>opacity</span>
                  <input
                    type="range"
                    min="0.70"
                    max="1.00"
                    step="0.01"
                    value={htmlOpacity}
                    onChange={(e) => handleHtmlOpacityChange(parseFloat(e.target.value))}
                    className="opacity-slider"
                  />
                  <span style={{ fontSize: '11px', color: 'var(--fg-50)', minWidth: '28px' }}>
                    {htmlOpacity.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Color controls */}
            <div className="settings-section">
              <h4>theme colors</h4>
              <div className="color-settings-grid">
                <div className="color-setting">
                  <span className="color-label">foreground</span>
                  <div className="color-controls">
                    <button
                      className="color-reset"
                      onClick={() => handleForegroundColorChange(getThemeDefault('foreground'))}
                      disabled={foregroundColor === getThemeDefault('foreground')}
                    >
                      <IconRotateClockwise size={12} />
                    </button>
                    <div className="color-picker-container">
                      <button
                        className="color-preview"
                        onClick={() => setShowColorPicker('foreground')}
                        onMouseEnter={() => setHoveredColorType('foreground')}
                        onMouseLeave={() => setHoveredColorType(null)}
                      >
                        <span className="color-square" style={{ backgroundColor: foregroundColor }} />
                        <span className="color-value">{foregroundColor}</span>
                      </button>
                      {hoveredColorType === 'foreground' && (
                        <div className="color-var-tooltip">
                          <div className="color-var-desc">{COLOR_VARIABLE_INFO.foreground.desc}</div>
                          <div className="color-var-list">
                            {COLOR_VARIABLE_INFO.foreground.vars.map(v => <code key={v}>{v}</code>)}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="color-setting">
                  <span className="color-label">accent</span>
                  <div className="color-controls">
                    <button
                      className="color-reset"
                      onClick={() => handleAccentColorChange(getThemeDefault('accent'))}
                      disabled={accentColor === getThemeDefault('accent')}
                    >
                      <IconRotateClockwise size={12} />
                    </button>
                    <div className="color-picker-container">
                      <button
                        className="color-preview"
                        onClick={() => setShowColorPicker('accent')}
                        onMouseEnter={() => setHoveredColorType('accent')}
                        onMouseLeave={() => setHoveredColorType(null)}
                      >
                        <span className="color-square" style={{ backgroundColor: accentColor }} />
                        <span className="color-value">{accentColor}</span>
                      </button>
                      {hoveredColorType === 'accent' && (
                        <div className="color-var-tooltip">
                          <div className="color-var-desc">{COLOR_VARIABLE_INFO.accent.desc}</div>
                          <div className="color-var-list">
                            {COLOR_VARIABLE_INFO.accent.vars.map(v => <code key={v}>{v}</code>)}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="color-setting">
                  <span className="color-label">positive</span>
                  <div className="color-controls">
                    <button
                      className="color-reset"
                      onClick={() => handlePositiveColorChange(getThemeDefault('positive'))}
                      disabled={positiveColor === getThemeDefault('positive')}
                    >
                      <IconRotateClockwise size={12} />
                    </button>
                    <div className="color-picker-container">
                      <button
                        className="color-preview"
                        onClick={() => setShowColorPicker('positive')}
                        onMouseEnter={() => setHoveredColorType('positive')}
                        onMouseLeave={() => setHoveredColorType(null)}
                      >
                        <span className="color-square" style={{ backgroundColor: positiveColor }} />
                        <span className="color-value">{positiveColor}</span>
                      </button>
                      {hoveredColorType === 'positive' && (
                        <div className="color-var-tooltip">
                          <div className="color-var-desc">{COLOR_VARIABLE_INFO.positive.desc}</div>
                          <div className="color-var-list">
                            {COLOR_VARIABLE_INFO.positive.vars.map(v => <code key={v}>{v}</code>)}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="color-setting">
                  <span className="color-label">negative</span>
                  <div className="color-controls">
                    <button
                      className="color-reset"
                      onClick={() => handleNegativeColorChange(getThemeDefault('negative'))}
                      disabled={negativeColor === getThemeDefault('negative')}
                    >
                      <IconRotateClockwise size={12} />
                    </button>
                    <div className="color-picker-container">
                      <button
                        className="color-preview"
                        onClick={() => setShowColorPicker('negative')}
                        onMouseEnter={() => setHoveredColorType('negative')}
                        onMouseLeave={() => setHoveredColorType(null)}
                      >
                        <span className="color-square" style={{ backgroundColor: negativeColor }} />
                        <span className="color-value">{negativeColor}</span>
                      </button>
                      {hoveredColorType === 'negative' && (
                        <div className="color-var-tooltip">
                          <div className="color-var-desc">{COLOR_VARIABLE_INFO.negative.desc}</div>
                          <div className="color-var-list">
                            {COLOR_VARIABLE_INFO.negative.vars.map(v => <code key={v}>{v}</code>)}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="color-setting">
                  <span className="color-label">background</span>
                  <div className="color-controls">
                    <button
                      className="color-reset"
                      onClick={() => handleBackgroundColorChange(getThemeDefault('background'))}
                      disabled={backgroundColor === getThemeDefault('background')}
                    >
                      <IconRotateClockwise size={12} />
                    </button>
                    <div className="color-picker-container">
                      <button
                        className="color-preview"
                        onClick={() => setShowColorPicker('background')}
                        onMouseEnter={() => setHoveredColorType('background')}
                        onMouseLeave={() => setHoveredColorType(null)}
                      >
                        <span className="color-square" style={{ backgroundColor: backgroundColor, border: '1px solid var(--fg-20)' }} />
                        <span className="color-value">{backgroundColor}</span>
                      </button>
                      {hoveredColorType === 'background' && (
                        <div className="color-var-tooltip">
                          <div className="color-var-desc">{COLOR_VARIABLE_INFO.background.desc}</div>
                          <div className="color-var-list">
                            {COLOR_VARIABLE_INFO.background.vars.map(v => <code key={v}>{v}</code>)}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Font controls */}
            <div className="settings-section">
              <h4>fonts</h4>
              <div className="font-settings">
                <div className="font-setting">
                  <span className="font-label">monospace</span>
                  <div className="font-controls">
                    <button
                      className="color-reset"
                      onClick={() => setMonoFont(getThemeFontDefault('mono'))}
                      disabled={monoFont === getThemeFontDefault('mono')}
                    >
                      <IconRotateClockwise size={12} />
                    </button>
                    <div
                      className="font-input"
                      onClick={() => setShowFontPicker('monospace')}
                      style={{ fontFamily: monoFont || getThemeFontDefault('mono') }}
                    >
                      {monoFont || getThemeFontDefault('mono')}
                    </div>
                  </div>
                </div>

                <div className="font-setting">
                  <span className="font-label">sans-serif</span>
                  <div className="font-controls">
                    <button
                      className="color-reset"
                      onClick={() => setSansFont(getThemeFontDefault('sans'))}
                      disabled={sansFont === getThemeFontDefault('sans')}
                    >
                      <IconRotateClockwise size={12} />
                    </button>
                    <div
                      className="font-input"
                      onClick={() => setShowFontPicker('sans-serif')}
                      style={{ fontFamily: sansFont || getThemeFontDefault('sans') }}
                    >
                      {sansFont || getThemeFontDefault('sans')}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Reset buttons */}

            {/* Theme Modal */}
            {showThemeDropdown && (
              <div
                className="theme-modal-overlay"
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: 'rgba(0, 0, 0, 0.6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 10000
                }}
                onMouseDown={(e) => {
                  if (e.target === e.currentTarget) {
                    setShowThemeDropdown(false);
                    restoreCurrentTheme();
                  }
                }}
              >
                <div
                  style={{
                    background: 'var(--background-color)',
                    border: 'none',
                    borderRadius: '0',
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden'
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div
                    className="theme-modal-header"
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 12px',
                      borderBottom: '1px solid var(--fg-15)',
                      flexShrink: 0
                    }}>
                    <span style={{ fontSize: '11px', color: 'var(--accent-color)', fontWeight: 500 }}>
                      <IconPalette size={12} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                      select theme
                    </span>
                    <button
                      className="theme-modal-close"
                      onClick={() => {
                        setShowThemeDropdown(false);
                        restoreCurrentTheme();
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--fg-40)',
                        cursor: 'default',
                        padding: '2px',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                    >
                      <IconX size={16} />
                    </button>
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
                    {/* Built-in themes - 5 column grid */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr',
                      gap: '4px'
                    }}>
                      {BUILT_IN_THEMES.map(theme => (
                        <div
                          key={theme.id}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                            padding: '6px 8px',
                            borderRadius: '4px',
                            cursor: 'default',
                            background: currentThemeId === theme.id ? 'rgba(var(--accent-rgb), 0.15)' : 'transparent',
                            border: currentThemeId === theme.id ? '1px solid rgba(var(--accent-rgb), 0.3)' : '1px solid transparent',
                            transition: 'all 0.15s ease'
                          }}
                          onMouseEnter={(e) => {
                            if (currentThemeId !== theme.id) {
                              e.currentTarget.style.background = 'rgba(var(--accent-rgb), 0.08)';
                              e.currentTarget.style.borderColor = 'rgba(var(--accent-rgb), 0.15)';
                            }
                            setHoveredThemeId(theme.id);
                            previewTheme(theme);
                          }}
                          onMouseLeave={(e) => {
                            if (currentThemeId !== theme.id) {
                              e.currentTarget.style.background = 'transparent';
                              e.currentTarget.style.borderColor = 'transparent';
                            }
                            setHoveredThemeId(null);
                            restoreCurrentTheme();
                          }}
                          onClick={() => applyTheme(theme)}
                        >
                          {/* Color preview swatches - all 5 colors */}
                          <div style={{ display: 'flex', gap: '2px' }}>
                            <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: theme.foregroundColor, border: '1px solid var(--fg-10)' }} title="foreground" />
                            <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: theme.accentColor }} title="accent" />
                            <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: theme.positiveColor }} title="positive" />
                            <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: theme.negativeColor }} title="negative" />
                            <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: theme.backgroundColor, border: '1px solid var(--fg-20)' }} title="background" />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{
                              flex: 1,
                              fontSize: '10px',
                              fontWeight: 'bold',
                              color: blendColors(theme.foregroundColor, theme.accentColor),
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}>
                              {theme.name}
                            </span>
                            {currentThemeId === theme.id && (
                              <IconCheck size={10} style={{ color: theme.accentColor, flexShrink: 0 }} />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Custom themes */}
                    {customThemes.length > 0 && (
                      <>
                        <div style={{ height: '1px', background: 'var(--fg-10)', margin: '8px 0' }} />
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr',
                          gap: '4px'
                        }}>
                          {customThemes.map(theme => (
                            <div
                              key={theme.id}
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '4px',
                                padding: '6px 8px',
                                borderRadius: '4px',
                                cursor: 'default',
                                background: currentThemeId === theme.id ? 'rgba(var(--accent-rgb), 0.15)' : 'transparent',
                                border: currentThemeId === theme.id ? '1px solid rgba(var(--accent-rgb), 0.3)' : '1px solid transparent',
                                transition: 'all 0.15s ease'
                              }}
                              onMouseEnter={(e) => {
                                if (currentThemeId !== theme.id) {
                                  e.currentTarget.style.background = 'rgba(var(--accent-rgb), 0.08)';
                                  e.currentTarget.style.borderColor = 'rgba(var(--accent-rgb), 0.15)';
                                }
                                setHoveredThemeId(theme.id);
                                previewTheme(theme);
                              }}
                              onMouseLeave={(e) => {
                                if (currentThemeId !== theme.id) {
                                  e.currentTarget.style.background = 'transparent';
                                  e.currentTarget.style.borderColor = 'transparent';
                                }
                                setHoveredThemeId(null);
                                restoreCurrentTheme();
                              }}
                              onClick={() => {
                                if (editingThemeName !== theme.id) {
                                  applyTheme(theme);
                                }
                              }}
                            >
                              {/* Color preview swatches - all 5 colors */}
                              <div style={{ display: 'flex', gap: '2px' }}>
                                <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: theme.foregroundColor, border: '1px solid var(--fg-10)' }} title="foreground" />
                                <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: theme.accentColor }} title="accent" />
                                <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: theme.positiveColor }} title="positive" />
                                <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: theme.negativeColor }} title="negative" />
                                <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: theme.backgroundColor, border: '1px solid var(--fg-20)' }} title="background" />
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{
                                  flex: 1,
                                  fontSize: '10px',
                                  fontWeight: 'bold',
                                  color: blendColors(theme.foregroundColor, theme.accentColor),
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap'
                                }}>
                                  {theme.name}
                                </span>
                                {currentThemeId === theme.id && (
                                  <IconCheck size={10} style={{ color: theme.accentColor, flexShrink: 0 }} />
                                )}
                                {/* Delete button */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteTheme(theme.id);
                                  }}
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    padding: '2px',
                                    cursor: 'default',
                                    color: 'var(--fg-30)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    borderRadius: '2px',
                                    transition: 'all 0.15s ease',
                                    flexShrink: 0
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.color = 'var(--negative-color)';
                                    e.currentTarget.style.background = 'rgba(var(--negative-rgb), 0.1)';
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.color = 'var(--fg-30)';
                                    e.currentTarget.style.background = 'transparent';
                                  }}
                                >
                                  <IconTrash size={10} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    {/* Save current as new theme (show when in custom mode OR when theme has changes) */}
                    {(currentThemeId === 'custom' || hasThemeChanges()) && (
                      <>
                        <div style={{ height: '1px', background: 'var(--fg-10)', margin: '4px 0' }} />
                        {showNewThemeInput ? (
                          <div style={{ display: 'flex', gap: '4px', padding: '4px 8px' }}>
                            <input
                              ref={newThemeInputRef}
                              type="text"
                              value={newThemeName}
                              onChange={(e) => setNewThemeName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && newThemeName.trim()) {
                                  saveAsCustomTheme(newThemeName.trim());
                                  setNewThemeName('');
                                  setShowNewThemeInput(false);
                                } else if (e.key === 'Escape') {
                                  setNewThemeName('');
                                  setShowNewThemeInput(false);
                                }
                              }}
                              placeholder="theme name..."
                              autoFocus
                              style={{
                                flex: 1,
                                padding: '4px 6px',
                                fontSize: '10px',
                                background: 'var(--bg-50)',
                                border: '1px solid var(--fg-15)',
                                borderRadius: '3px',
                                color: 'var(--foreground-color)',
                                outline: 'none'
                              }}
                            />
                            <button
                              onClick={() => {
                                if (newThemeName.trim()) {
                                  saveAsCustomTheme(newThemeName.trim());
                                  setNewThemeName('');
                                  setShowNewThemeInput(false);
                                }
                              }}
                              disabled={!newThemeName.trim()}
                              style={{
                                padding: '4px 8px',
                                fontSize: '10px',
                                background: newThemeName.trim() ? 'var(--accent-color)' : 'var(--fg-10)',
                                border: 'none',
                                borderRadius: '3px',
                                color: newThemeName.trim() ? 'var(--background-color)' : 'var(--fg-30)',
                                cursor: newThemeName.trim() ? 'pointer' : 'default'
                              }}
                            >
                              save
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setShowNewThemeInput(true)}
                            style={{
                              width: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              padding: '6px 8px',
                              borderRadius: '4px',
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              color: 'var(--fg-50)',
                              fontSize: '10px',
                              transition: 'all 0.15s ease'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'rgba(var(--accent-rgb), 0.08)';
                              e.currentTarget.style.color = 'var(--accent-color)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'transparent';
                              e.currentTarget.style.color = 'var(--fg-50)';
                            }}
                          >
                            <IconPlus size={10} />
                            save current as theme
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        );

      case 'commands':
        return (
          <div className="settings-section">
            {/* Header with add button */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h4 style={{ fontSize: '11px', color: 'var(--accent-color)', margin: 0, fontWeight: 500, textTransform: 'lowercase' }}>custom commands</h4>
              {!showAddCommand && !editingCommandIndex && (
                <button
                  onClick={() => setShowAddCommand(true)}
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    color: 'rgba(255, 255, 255, 0.4)',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    cursor: 'default',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--accent-color)';
                    e.currentTarget.style.color = 'var(--accent-color)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                    e.currentTarget.style.color = 'rgba(255, 255, 255, 0.4)';
                  }}
                >
                  + add command
                </button>
              )}
            </div>

            <div className="commands-list">
              {commands.length === 0 && !showAddCommand && (
                <p style={{ fontSize: '10px', color: '#666' }}>
                  no custom commands yet
                </p>
              )}

              {/* Existing commands */}
              {commands.map((cmd, index) => (
                <div key={index} style={{ marginBottom: '12px' }}>
                  {editingCommandIndex === index ? (
                    // Edit mode
                    <div className="command-edit-form" style={{
                      padding: '8px',
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '4px'
                    }}>
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                        <input
                          type="text"
                          placeholder="/command"
                          className="command-trigger"
                          style={{ flex: '0 0 120px' }}
                          value={editingCommand.trigger}
                          onChange={(e) => setEditingCommand({ ...editingCommand, trigger: e.target.value })}
                        />
                        <input
                          type="text"
                          placeholder="description"
                          className="command-desc"
                          style={{ flex: '1' }}
                          value={editingCommand.description}
                          onChange={(e) => setEditingCommand({ ...editingCommand, description: e.target.value })}
                        />
                      </div>
                      <textarea
                        placeholder="action script..."
                        className="command-script"
                        rows={3}
                        value={editingCommand.script}
                        onChange={(e) => setEditingCommand({ ...editingCommand, script: e.target.value })}
                        style={{ marginBottom: '8px' }}
                      />
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => {
                            if (editingCommand.trigger && editingCommand.script) {
                              const updated = [...commands];
                              updated[index] = editingCommand;
                              setCommands(updated);
                              localStorage.setItem('custom_commands', JSON.stringify(updated));
                              setEditingCommandIndex(null);
                            }
                          }}
                          disabled={!editingCommand.trigger || !editingCommand.script}
                          style={{
                            flex: 1,
                            background: 'rgba(153, 187, 255, 0.1)',
                            border: '1px solid rgba(153, 187, 255, 0.3)',
                            color: '#99bbff',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            cursor: editingCommand.trigger && editingCommand.script ? 'default' : 'not-allowed',
                            opacity: editingCommand.trigger && editingCommand.script ? 1 : 0.5
                          }}
                        >
                          <IconCheck size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                          save
                        </button>
                        <button
                          onClick={() => setEditingCommandIndex(null)}
                          style={{
                            flex: 1,
                            background: 'transparent',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            color: 'rgba(255, 255, 255, 0.4)',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            cursor: 'default'
                          }}
                        >
                          <IconX size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                          cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    // View mode
                    <div className="command-view" style={{
                      padding: '6px 8px',
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '4px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{
                            color: 'var(--accent-color)',
                            fontSize: '11px',
                            fontFamily: 'var(--mono-font)'
                          }}>
                            {cmd.trigger}
                          </span>
                          {cmd.description && (
                            <span style={{
                              color: '#666',
                              fontSize: '10px',
                              marginLeft: '8px'
                            }}>
                              — {cmd.description}
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            onClick={() => {
                              setEditingCommand({ ...cmd });
                              setEditingCommandIndex(index);
                            }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#666',
                              cursor: 'default',
                              padding: '2px',
                              fontSize: '10px',
                              transition: 'color 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = 'var(--accent-color)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = '#666';
                            }}
                          >
                            <IconEdit size={10} />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Delete command "${cmd.trigger}"?`)) {
                                const updated = commands.filter((_, i) => i !== index);
                                setCommands(updated);
                                localStorage.setItem('custom_commands', JSON.stringify(updated));
                              }
                            }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#666',
                              cursor: 'default',
                              padding: '2px',
                              fontSize: '10px',
                              transition: 'color 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = '#ff9999';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = '#666';
                            }}
                          >
                            <IconTrash size={10} />
                          </button>
                        </div>
                      </div>
                      {cmd.script && (
                        <pre style={{
                          margin: '4px 0 0 0',
                          padding: '4px',
                          background: 'rgba(0, 0, 0, 0.3)',
                          borderRadius: '2px',
                          fontSize: '9px',
                          color: '#888',
                          fontFamily: 'var(--mono-font)',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-all',
                          maxHeight: '60px',
                          overflow: 'auto'
                        }}>
                          {cmd.script}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {/* Add new command form */}
              {showAddCommand && (
                <div className="command-edit-form" style={{
                  padding: '8px',
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '4px'
                }}>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                    <input
                      type="text"
                      placeholder="/command"
                      className="command-trigger"
                      style={{ flex: '0 0 120px' }}
                      value={newCommand.trigger}
                      onChange={(e) => setNewCommand({ ...newCommand, trigger: e.target.value })}
                    />
                    <input
                      type="text"
                      placeholder="description"
                      className="command-desc"
                      style={{ flex: '1' }}
                      value={newCommand.description}
                      onChange={(e) => setNewCommand({ ...newCommand, description: e.target.value })}
                    />
                  </div>
                  <textarea
                    placeholder="action script..."
                    className="command-script"
                    rows={3}
                    value={newCommand.script}
                    onChange={(e) => setNewCommand({ ...newCommand, script: e.target.value })}
                    style={{ marginBottom: '8px' }}
                  />
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => {
                        if (newCommand.trigger && newCommand.script) {
                          const updated = [...commands, newCommand];
                          setCommands(updated);
                          localStorage.setItem('custom_commands', JSON.stringify(updated));
                          setNewCommand({ trigger: '', description: '', script: '' });
                          setShowAddCommand(false);
                        }
                      }}
                      disabled={!newCommand.trigger || !newCommand.script}
                      style={{
                        flex: 1,
                        background: 'rgba(153, 187, 255, 0.1)',
                        border: '1px solid rgba(153, 187, 255, 0.3)',
                        color: '#99bbff',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        cursor: newCommand.trigger && newCommand.script ? 'default' : 'not-allowed',
                        opacity: newCommand.trigger && newCommand.script ? 1 : 0.5
                      }}
                    >
                      <IconCheck size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                      save
                    </button>
                    <button
                      onClick={() => {
                        setShowAddCommand(false);
                        setNewCommand({ trigger: '', description: '', script: '' });
                      }}
                      style={{
                        flex: 1,
                        background: 'transparent',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        color: 'rgba(255, 255, 255, 0.4)',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        cursor: 'default'
                      }}
                    >
                      <IconX size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                      cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );

      case 'mcp':
        return <MCPTab />;

      default:
        return null;
    }
  };

  return (
    <>
      <div className="settings-modal-overlay">
        <div className="settings-modal">
          <div className={`settings-header${isDragging ? ' is-dragging' : ''}`} ref={headerRef} data-tauri-drag-region onContextMenu={(e) => e.preventDefault()}>
            <div className="settings-header-left" data-tauri-drag-region>
              <IconSettings size={16} stroke={1.5} style={{ color: 'var(--accent-color)', pointerEvents: 'none', userSelect: 'none' }} />
              {/* Tab navigation in header */}
              <div className="header-tabs">
                <TabButton
                  label="theme"
                  active={activeTab === 'theme'}
                  onClick={() => setActiveTab('theme')}
                />
                <TabButton
                  label="general"
                  active={activeTab === 'general'}
                  onClick={() => setActiveTab('general')}
                />
                {showHooksSettings && (
                  <TabButton
                    label="hooks"
                    active={activeTab === 'hooks'}
                    onClick={() => setActiveTab('hooks')}
                  />
                )}
                {showCommandsSettings && (
                  <TabButton
                    label="commands"
                    active={activeTab === 'commands'}
                    onClick={() => setActiveTab('commands')}
                  />
                )}
                {showMcpSettings && (
                  <TabButton
                    label="mcp"
                    active={activeTab === 'mcp'}
                    onClick={() => setActiveTab('mcp')}
                  />
                )}
              </div>
            </div>
            <button className="settings-close" onClick={onClose}>
              <IconX size={16} />
            </button>
          </div>

          {/* Tab content */}
          <div className="settings-content">
            {renderTabContent()}
          </div>

          {/* Bottom controls - show upgrade/about on general, zoom/watermark on theme */}
          {(activeTab === 'general' || activeTab === 'theme') && (
            <div className="settings-bottom-controls">
              <div className="settings-bottom-left">
                {activeTab === 'theme' && (
                  <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
                    <div>
                      <h4>zoom</h4>
                      <div className="zoom-controls compact">
                        <button
                          className="zoom-btn small"
                          onClick={handleZoomOut}
                          disabled={zoomLevel <= -50}
                        >
                          <IconMinus size={12} />
                        </button>
                        <button
                          className="zoom-btn small"
                          onClick={handleZoomIn}
                          disabled={zoomLevel >= 200}
                        >
                          <IconPlus size={12} />
                        </button>
                        <button
                          className="zoom-btn small"
                          onClick={handleResetZoom}
                          disabled={zoomLevel === 0}
                        >
                          <IconRotateClockwise size={12} />
                        </button>
                        <span className="zoom-level compact">{zoomLevel > 0 ? `+${Math.round(zoomLevel * 10)}%` : zoomLevel === 0 ? '±0%' : `${Math.round(zoomLevel * 10)}%`}</span>
                      </div>
                    </div>

                    {/* Transparency feature hidden until Tauri v2 supports it */}
                    {/* <div>
                      <h4>transparency</h4>
                      <div className="opacity-controls" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={backgroundOpacity}
                          onChange={(e) => {
                            const value = Number(e.target.value);
                            setBackgroundOpacity(value);
                            // Also immediately apply for testing
                            const alpha = value / 100;
                            document.body.style.backgroundColor = `rgba(0, 0, 0, ${alpha})`;
                            console.log('Set body background to:', `rgba(0, 0, 0, ${alpha})`);
                          }}
                          style={{
                            width: '100px',
                            height: '20px',
                            background: 'transparent',
                            outline: 'none',
                            cursor: 'pointer'
                          }}
                        />
                        <span style={{ 
                          fontSize: '10px', 
                          color: '#666',
                          minWidth: '35px',
                          textAlign: 'right'
                        }}>
                          {backgroundOpacity}%
                        </span>
                      </div>
                    </div> */}
                  </div>
                )}
              </div>

              <div className="settings-bottom-right">
                {activeTab === 'general' && (
                  <button
                    className="settings-action-btn about"
                    onClick={() => setShowAboutModal(true)}
                    style={{
                      background: 'transparent',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#666',
                      padding: '4px 12px',
                      fontSize: '11px',
                      borderRadius: '2px',
                      cursor: 'default',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--accent-color)';
                      e.currentTarget.style.color = 'var(--accent-color)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                      e.currentTarget.style.color = '#666';
                    }}
                  >
                    <IconInfoCircle size={12} />
                    <span>about</span>
                  </button>
                )}
                {activeTab === 'theme' && (
                  <div>
                    <h4>watermark image</h4>
                    <div className="watermark-controls">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleWatermarkUpload}
                        style={{ display: 'none' }}
                        id="watermark-upload-bottom"
                      />
                      {globalWatermarkImage ? (
                        <>
                          <button
                            className="color-reset"
                            onClick={handleRemoveWatermark}
                            title="remove watermark"
                          >
                            <IconRotateClockwise size={12} />
                          </button>
                          <img
                            src={globalWatermarkImage}
                            alt="watermark preview"
                            className="watermark-thumb"
                          />
                        </>
                      ) : (
                        <>
                          <button
                            className="color-reset"
                            onClick={handleRemoveWatermark}
                            title="remove watermark"
                            style={{ visibility: 'hidden' }}
                          >
                            <IconRotateClockwise size={12} />
                          </button>
                          <label htmlFor="watermark-upload-bottom" className="watermark-upload-btn">
                            <IconPhoto size={14} />
                          </label>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Color picker modal */}
      {showColorPicker && (
        <div className="color-picker-floating">
          <div className="color-picker-dropdown">
            <div className="color-picker-header">
              <h4>choose {showColorPicker} color</h4>
              {previewColor && (
                <span className="color-preview-indicator">
                  <span className="preview-swatch" style={{ backgroundColor: previewColor }} />
                  <span className="preview-hex">{previewColor}</span>
                </span>
              )}
              <button className="color-picker-close" onClick={() => setShowColorPicker(null)}>
                <IconX size={14} />
              </button>
            </div>
            <div className="color-picker-content">
              {(showColorPicker === 'background' ? BACKGROUND_COLOR_ROWS :
                showColorPicker === 'foreground' ? FOREGROUND_COLOR_ROWS :
                  COLOR_ROWS
              ).map((row, rowIndex) => (
                <div key={rowIndex} className="color-row">
                  {row.map(colorObj => (
                    <button
                      key={colorObj.hex}
                      className={`color-swatch ${showColorPicker === 'background' ? 'bg-swatch' : ''} ${(showColorPicker === 'background' && colorObj.hex === backgroundColor) ||
                          (showColorPicker === 'foreground' && colorObj.hex === foregroundColor) ||
                          (showColorPicker === 'accent' && colorObj.hex === accentColor) ||
                          (showColorPicker === 'positive' && colorObj.hex === positiveColor) ||
                          (showColorPicker === 'negative' && colorObj.hex === negativeColor)
                          ? 'active' : ''
                        }`}
                      style={{
                        backgroundColor: colorObj.hex,
                        border: showColorPicker === 'background' ? '1px solid rgba(255, 255, 255, 0.3)' : 'none'
                      }}
                      title={colorObj.name}
                      onMouseEnter={() => handleColorPreview(colorObj.hex)}
                      onMouseLeave={handleColorPreviewEnd}
                      onClick={() => {
                        if (showColorPicker === 'background') {
                          handleBackgroundColorChange(colorObj.hex);
                        } else if (showColorPicker === 'foreground') {
                          handleForegroundColorChange(colorObj.hex);
                        } else if (showColorPicker === 'accent') {
                          handleAccentColorChange(colorObj.hex);
                        } else if (showColorPicker === 'positive') {
                          handlePositiveColorChange(colorObj.hex);
                        } else if (showColorPicker === 'negative') {
                          handleNegativeColorChange(colorObj.hex);
                        }
                        setShowColorPicker(null);
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Font picker modal */}
      {showFontPicker && (
        <FontPickerModal
          isOpen={true}
          onClose={() => setShowFontPicker(null)}
          onSelect={(font) => {
            if (showFontPicker === 'monospace') {
              setMonoFont(font);
            } else {
              setSansFont(font);
            }
            setShowFontPicker(null);
          }}
          currentFont={showFontPicker === 'monospace' ? monoFont : sansFont}
          fontType={showFontPicker}
        />
      )}

      {/* About modal */}
      {showAboutModal && (
        <AboutModal
          isOpen={true}
          onClose={() => setShowAboutModal(false)}
          onShowUpgrade={() => {
            // Close AboutModal first, then show UpgradeModal
            setShowAboutModal(false);
            // Small delay to ensure AboutModal closes before UpgradeModal opens
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent('showUpgradeModal', {
                detail: { reason: 'trial' }
              }));
            }, 100);
          }}
        />
      )}
    </>
  );
};