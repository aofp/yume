// Chat constants extracted from ClaudeChat.tsx
import {
  IconBook,
  IconPencil,
  IconScissors,
  IconTerminal,
  IconChecklist,
  IconSearch,
  IconWorld,
  IconFileSearch,
  IconFolder,
  IconFolderOpen as IconFolderOpen2,
  IconRobot,
  IconCheck,
  IconNotebook,
  IconTool,
} from '@tabler/icons-react';
import { APP_ID } from '../config/app';

// PRE-CREATED ICONS - avoid JSX creation on every render (performance optimization)
export const TOOL_ICONS = {
  Read: <IconBook size={14} stroke={1.5} />,
  Write: <IconPencil size={14} stroke={1.5} />,
  Edit: <IconScissors size={14} stroke={1.5} />,
  MultiEdit: <IconScissors size={14} stroke={1.5} />,
  Bash: <IconTerminal size={14} stroke={1.5} />,
  TodoWrite: <IconChecklist size={14} stroke={1.5} />,
  WebSearch: <IconSearch size={14} stroke={1.5} />,
  WebFetch: <IconWorld size={14} stroke={1.5} />,
  Grep: <IconFileSearch size={14} stroke={1.5} />,
  Glob: <IconFolder size={14} stroke={1.5} />,
  LS: <IconFolderOpen2 size={14} stroke={1.5} />,
  Task: <IconRobot size={14} stroke={1.5} />,
  ExitPlanMode: <IconCheck size={14} stroke={1.5} />,
  NotebookEdit: <IconNotebook size={14} stroke={1.5} />,
  default: <IconTool size={14} stroke={1.5} />,
} as const;

// Pre-compiled regex for path stripping (avoid regex compilation in hot path)
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const PATH_STRIP_REGEX = new RegExp(`^/mnt/c/Users/[^/]+/Desktop/${escapeRegExp(APP_ID)}/`);

// Image extensions that can be previewed
export const imageExtensions = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'webp', 'svg', 'tiff', 'tif', 'heic', 'heif'
]);

// Binary/non-text file extensions that shouldn't be previewed
export const binaryExtensions = new Set([
  // Images (non-previewable: psd, raw)
  'psd', 'raw',
  // Videos
  'mp4', 'mov', 'avi', 'mkv', 'wmv', 'flv', 'webm', 'm4v', 'mpeg', 'mpg', '3gp',
  // Audio
  'mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma', 'aiff',
  // Archives
  'zip', 'tar', 'gz', 'rar', '7z', 'bz2', 'xz', 'dmg', 'iso',
  // Binaries
  'exe', 'dll', 'so', 'dylib', 'bin', 'app', 'msi', 'deb', 'rpm',
  // Documents (binary formats)
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp',
  // Fonts
  'ttf', 'otf', 'woff', 'woff2', 'eot',
  // Other binary
  'pyc', 'pyo', 'class', 'o', 'obj', 'lib', 'a', 'node', 'wasm'
]);
