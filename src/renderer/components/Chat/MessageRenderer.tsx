import React, { memo, useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Light as SyntaxHighlighter } from 'react-syntax-highlighter';
import { DiffViewer, DiffDisplay, DiffLine } from './DiffViewer';

// Register only commonly used languages for smaller bundle
import javascript from 'react-syntax-highlighter/dist/esm/languages/hljs/javascript';
import typescript from 'react-syntax-highlighter/dist/esm/languages/hljs/typescript';
import python from 'react-syntax-highlighter/dist/esm/languages/hljs/python';
import bash from 'react-syntax-highlighter/dist/esm/languages/hljs/bash';
import shell from 'react-syntax-highlighter/dist/esm/languages/hljs/shell';
import json from 'react-syntax-highlighter/dist/esm/languages/hljs/json';
import xml from 'react-syntax-highlighter/dist/esm/languages/hljs/xml';
import css from 'react-syntax-highlighter/dist/esm/languages/hljs/css';
import scss from 'react-syntax-highlighter/dist/esm/languages/hljs/scss';
import rust from 'react-syntax-highlighter/dist/esm/languages/hljs/rust';
import go from 'react-syntax-highlighter/dist/esm/languages/hljs/go';
import java from 'react-syntax-highlighter/dist/esm/languages/hljs/java';
import c from 'react-syntax-highlighter/dist/esm/languages/hljs/c';
import cpp from 'react-syntax-highlighter/dist/esm/languages/hljs/cpp';
import csharp from 'react-syntax-highlighter/dist/esm/languages/hljs/csharp';
import ruby from 'react-syntax-highlighter/dist/esm/languages/hljs/ruby';
import php from 'react-syntax-highlighter/dist/esm/languages/hljs/php';
import swift from 'react-syntax-highlighter/dist/esm/languages/hljs/swift';
import kotlin from 'react-syntax-highlighter/dist/esm/languages/hljs/kotlin';
import sql from 'react-syntax-highlighter/dist/esm/languages/hljs/sql';
import yaml from 'react-syntax-highlighter/dist/esm/languages/hljs/yaml';
import markdown from 'react-syntax-highlighter/dist/esm/languages/hljs/markdown';
import diff from 'react-syntax-highlighter/dist/esm/languages/hljs/diff';
import dockerfile from 'react-syntax-highlighter/dist/esm/languages/hljs/dockerfile';
import makefile from 'react-syntax-highlighter/dist/esm/languages/hljs/makefile';
import plaintext from 'react-syntax-highlighter/dist/esm/languages/hljs/plaintext';

// Register languages
SyntaxHighlighter.registerLanguage('javascript', javascript);
SyntaxHighlighter.registerLanguage('js', javascript);
SyntaxHighlighter.registerLanguage('typescript', typescript);
SyntaxHighlighter.registerLanguage('ts', typescript);
SyntaxHighlighter.registerLanguage('tsx', typescript);
SyntaxHighlighter.registerLanguage('jsx', javascript);
SyntaxHighlighter.registerLanguage('python', python);
SyntaxHighlighter.registerLanguage('py', python);
SyntaxHighlighter.registerLanguage('bash', bash);
SyntaxHighlighter.registerLanguage('sh', bash);
SyntaxHighlighter.registerLanguage('shell', shell);
SyntaxHighlighter.registerLanguage('zsh', bash);
SyntaxHighlighter.registerLanguage('json', json);
SyntaxHighlighter.registerLanguage('xml', xml);
SyntaxHighlighter.registerLanguage('html', xml);
SyntaxHighlighter.registerLanguage('htm', xml);
SyntaxHighlighter.registerLanguage('svg', xml);
SyntaxHighlighter.registerLanguage('css', css);
SyntaxHighlighter.registerLanguage('scss', scss);
SyntaxHighlighter.registerLanguage('sass', scss);
SyntaxHighlighter.registerLanguage('less', scss);
SyntaxHighlighter.registerLanguage('rust', rust);
SyntaxHighlighter.registerLanguage('rs', rust);
SyntaxHighlighter.registerLanguage('go', go);
SyntaxHighlighter.registerLanguage('golang', go);
SyntaxHighlighter.registerLanguage('java', java);
SyntaxHighlighter.registerLanguage('c', c);
SyntaxHighlighter.registerLanguage('cpp', cpp);
SyntaxHighlighter.registerLanguage('c++', cpp);
SyntaxHighlighter.registerLanguage('csharp', csharp);
SyntaxHighlighter.registerLanguage('cs', csharp);
SyntaxHighlighter.registerLanguage('c#', csharp);
SyntaxHighlighter.registerLanguage('ruby', ruby);
SyntaxHighlighter.registerLanguage('rb', ruby);
SyntaxHighlighter.registerLanguage('php', php);
SyntaxHighlighter.registerLanguage('swift', swift);
SyntaxHighlighter.registerLanguage('kotlin', kotlin);
SyntaxHighlighter.registerLanguage('kt', kotlin);
SyntaxHighlighter.registerLanguage('sql', sql);
SyntaxHighlighter.registerLanguage('yaml', yaml);
SyntaxHighlighter.registerLanguage('yml', yaml);
SyntaxHighlighter.registerLanguage('toml', yaml);
SyntaxHighlighter.registerLanguage('markdown', markdown);
SyntaxHighlighter.registerLanguage('md', markdown);
SyntaxHighlighter.registerLanguage('diff', diff);
SyntaxHighlighter.registerLanguage('patch', diff);
SyntaxHighlighter.registerLanguage('dockerfile', dockerfile);
SyntaxHighlighter.registerLanguage('docker', dockerfile);
SyntaxHighlighter.registerLanguage('makefile', makefile);
SyntaxHighlighter.registerLanguage('make', makefile);
SyntaxHighlighter.registerLanguage('plaintext', plaintext);
SyntaxHighlighter.registerLanguage('text', plaintext);
SyntaxHighlighter.registerLanguage('txt', plaintext);
import {
  IconBolt,
  IconAlertTriangle,
  IconCheck,
  IconX,
  IconChevronsRight,
  IconMinus,
  IconChecklist,
  IconCopy,
  IconFile,
  IconFileText,
  IconEdit,
  IconEditCircle,
  IconTerminal,
  IconSearch,
  IconWorld,
  IconDownload,
  IconFileSearch,
  IconFolderOpen,
  IconRobot,
  IconLogout,
  IconNotebook,
  IconServer,
  IconTerminal2,
  IconPlayerStop,
  IconPlayerPlay,
  IconDots,
} from '@tabler/icons-react';
import { useClaudeCodeStore } from '../../stores/claudeCodeStore';
import { isBashPrefix } from '../../utils/helpers';
import './MessageRenderer.css';

// Selection preservation utilities for streaming messages
interface SelectionState {
  startContainerPath: number[];
  startOffset: number;
  endContainerPath: number[];
  endOffset: number;
  selectedText: string;
}

// Get path from root to a node (array of child indices)
const getNodePath = (root: Node, node: Node): number[] | null => {
  const path: number[] = [];
  let current: Node | null = node;

  while (current && current !== root) {
    const parent: ParentNode | null = current.parentNode;
    if (!parent) return null;

    const children = Array.from(parent.childNodes);
    const index = children.indexOf(current as ChildNode);
    if (index === -1) return null;

    path.unshift(index);
    current = parent as Node;
  }

  return current === root ? path : null;
};

// Get node from path
const getNodeFromPath = (root: Node, path: number[]): Node | null => {
  let current: Node = root;

  for (const index of path) {
    const children = current.childNodes;
    if (index >= children.length) return null;
    current = children[index];
  }

  return current;
};

// Save current selection state relative to a container
const saveSelection = (container: HTMLElement): SelectionState | null => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

  const range = selection.getRangeAt(0);

  // Check if selection is within our container
  if (!container.contains(range.commonAncestorContainer)) return null;

  const startPath = getNodePath(container, range.startContainer);
  const endPath = getNodePath(container, range.endContainer);

  if (!startPath || !endPath) return null;

  return {
    startContainerPath: startPath,
    startOffset: range.startOffset,
    endContainerPath: endPath,
    endOffset: range.endOffset,
    selectedText: selection.toString()
  };
};

// Restore selection state
const restoreSelection = (container: HTMLElement, state: SelectionState): boolean => {
  try {
    const startNode = getNodeFromPath(container, state.startContainerPath);
    const endNode = getNodeFromPath(container, state.endContainerPath);

    if (!startNode || !endNode) return false;

    // Validate offsets
    const startLength = startNode.nodeType === Node.TEXT_NODE
      ? (startNode as Text).length
      : startNode.childNodes.length;
    const endLength = endNode.nodeType === Node.TEXT_NODE
      ? (endNode as Text).length
      : endNode.childNodes.length;

    if (state.startOffset > startLength || state.endOffset > endLength) return false;

    const selection = window.getSelection();
    if (!selection) return false;

    const range = document.createRange();
    range.setStart(startNode, Math.min(state.startOffset, startLength));
    range.setEnd(endNode, Math.min(state.endOffset, endLength));

    selection.removeAllRanges();
    selection.addRange(range);

    return true;
  } catch (e) {
    return false;
  }
};

// pre-compiled regex patterns (avoid re-creation in render)
const CODE_BLOCK_REGEX = /```([\w]*)?[\r\n]+([\s\S]*?)```/g;
const INLINE_CODE_REGEX = /`([^`]+)`/g;
const THINKING_TAG_REGEX = /<thinking>([\s\S]*?)<\/thinking>/g;

// PERFORMANCE: Pre-create remarkPlugins array to avoid allocation on every render
const REMARK_PLUGINS = [remarkGfm];

// Convert <thinking>...</thinking> tags to italic markdown
const processThinkingTags = (text: string): string => {
  return text.replace(THINKING_TAG_REGEX, (_match, content) => `*${content.trim()}*`);
};

// static style objects (avoid re-creation in render)
const ERROR_MESSAGE_STYLE: React.CSSProperties = {
  color: '#ff6b6b',
  backgroundColor: 'rgba(255, 107, 107, 0.1)',
  padding: '12px',
  borderRadius: '8px',
  border: '1px solid rgba(255, 107, 107, 0.2)',
  fontFamily: 'monospace',
  fontSize: '12px',
  whiteSpace: 'pre-wrap'
};
const FLEX_ROW_STYLE: React.CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: '8px' };
const FLEX_1_STYLE: React.CSSProperties = { flex: 1 };
const ICON_STYLE: React.CSSProperties = { fontSize: '14px' };
const BOLD_MARGIN_STYLE: React.CSSProperties = { marginBottom: '8px', fontWeight: 'bold' };

// Complete Claude Code SDK message types
export interface ClaudeMessage {
  type: 'system' | 'user' | 'assistant' | 'result' | 'error' | 'permission' | 'tool_approval' | 'tool_use' | 'tool_result';
  subtype?: 'init' | 'success' | 'error_max_turns' | 'error_during_execution' | 'permission_request' | 'permission_response' | 'compact' | 'rate_limit' | 'interrupted' | 'error';
  content?: string;
  errorType?: string;
  message?: {
    role?: string;
    content?: string | ContentBlock[];
    name?: string;
    input?: any;
    output?: any;
    tool_use_id?: string;
  };
  session_id?: string;
  timestamp?: number;
  
  // System init fields
  apiKeySource?: string;
  cwd?: string;
  tools?: string[];
  mcp_servers?: any[];
  model?: string;
  permissionMode?: string;
  
  // Result fields
  duration_ms?: number;
  duration_api_ms?: number;
  duration?: number;
  is_error?: boolean;
  success?: boolean;
  num_turns?: number;
  result?: string;
  total_cost_usd?: number;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  
  // Permission fields
  tool?: string;
  parameters?: any;
  granted?: boolean;
  
  // UI fields
  id?: string;
  streaming?: boolean;

  // Subagent tracking
  parent_tool_use_id?: string;  // ID of the parent Task tool use (for subagent messages)

  // Wrapper compact metadata
  wrapper_compact?: {
    savedTokens?: number;
    totalSaved?: number;
    compactCount?: number;
  };
}

interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking' | 'image';
  text?: string;
  thinking?: string;  // For thinking blocks
  name?: string;
  input?: any;
  output?: any;
  content?: any;
  tool_use_id?: string;
  is_error?: boolean;
}


// Truncate text to max length (default 256)
const truncateText = (text: string, maxLen = 256): string => {
  if (!text || text.length <= maxLen) return text || '';
  return text.substring(0, maxLen) + '...';
};

// PRE-CREATED ICONS - avoid JSX creation on every render (performance optimization)
const TOOL_ICONS = {
  Read: <IconFileText size={14} stroke={1.5} className="tool-icon" />,
  Write: <IconFile size={14} stroke={1.5} className="tool-icon" />,
  Edit: <IconEdit size={14} stroke={1.5} className="tool-icon" />,
  MultiEdit: <IconEditCircle size={14} stroke={1.5} className="tool-icon" />,
  Bash: <IconTerminal size={14} stroke={1.5} className="tool-icon" />,
  TodoWrite: <IconChecklist size={14} stroke={1.5} className="tool-icon" />,
  WebSearch: <IconWorld size={14} stroke={1.5} className="tool-icon" />,
  WebFetch: <IconDownload size={14} stroke={1.5} className="tool-icon" />,
  Grep: <IconSearch size={14} stroke={1.5} className="tool-icon" />,
  Glob: <IconFileSearch size={14} stroke={1.5} className="tool-icon" />,
  LS: <IconFolderOpen size={14} stroke={1.5} className="tool-icon" />,
  Task: <IconRobot size={14} stroke={1.5} className="tool-icon" />,
  ExitPlanMode: <IconLogout size={14} stroke={1.5} className="tool-icon" />,
  NotebookEdit: <IconNotebook size={14} stroke={1.5} className="tool-icon" />,
  BashOutput: <IconTerminal2 size={14} stroke={1.5} className="tool-icon" />,
  KillBash: <IconPlayerStop size={14} stroke={1.5} className="tool-icon" />,
  default: <IconServer size={14} stroke={1.5} className="tool-icon" />,
} as const;

// Tool display configurations - uses pre-created icons for performance
const TOOL_DISPLAYS: Record<string, (input: any) => { icon: React.ReactNode; action: string; detail: string; todos?: any[] }> = {
  'Read': (i) => ({ icon: TOOL_ICONS.Read, action: 'reading', detail: formatPath(i?.file_path) }),
  'Write': (i) => ({ icon: TOOL_ICONS.Write, action: 'writing', detail: formatPath(i?.file_path) }),
  'Edit': (i) => ({ icon: TOOL_ICONS.Edit, action: 'editing', detail: formatPath(i?.file_path) }),
  'MultiEdit': (i) => ({ icon: TOOL_ICONS.MultiEdit, action: 'editing', detail: formatPath(i?.file_path) }),
  'Bash': (i) => ({ icon: TOOL_ICONS.Bash, action: 'running', detail: formatCommand(i?.command) }),
  'TodoWrite': (i) => ({ icon: TOOL_ICONS.TodoWrite, action: 'updating todos', detail: formatTodos(i?.todos), todos: i?.todos }),
  'WebSearch': (i) => ({ icon: TOOL_ICONS.WebSearch, action: 'searching web', detail: truncateText(`"${i?.query || ''}"`, 256) }),
  'WebFetch': (i) => ({ icon: TOOL_ICONS.WebFetch, action: 'fetching', detail: formatUrl(i?.url) }),
  'Grep': (i) => ({ icon: TOOL_ICONS.Grep, action: 'searching', detail: truncateText(`"${i?.pattern || ''}" in ${formatPath(i?.path || '.')}`, 256) }),
  'Glob': (i) => ({ icon: TOOL_ICONS.Glob, action: 'finding', detail: i?.pattern || 'files' }),
  'LS': (i) => ({ icon: TOOL_ICONS.LS, action: 'listing', detail: formatPath(i?.path) }),
  'Task': (i) => ({ icon: TOOL_ICONS.Task, action: truncateText(i?.description || 'running task', 256), detail: i?.subagent_type || 'agent' }),
  'ExitPlanMode': () => ({ icon: TOOL_ICONS.ExitPlanMode, action: 'plan complete', detail: 'ready to execute' }),
  'NotebookEdit': (i) => ({ icon: TOOL_ICONS.NotebookEdit, action: 'editing notebook', detail: formatPath(i?.notebook_path) }),
  'BashOutput': (i) => ({ icon: TOOL_ICONS.BashOutput, action: 'reading output', detail: `bash ${i?.bash_id || 'session'}` }),
  'KillBash': (i) => ({ icon: TOOL_ICONS.KillBash, action: 'stopping', detail: `bash ${i?.shell_id || 'session'}` })
};

// Helper function to detect and format MCP tools
// Note: formatToolInput is defined below with other helper functions
const getMCPToolDisplay = (toolName: string, input: any) => {
  // MCP tools follow pattern: mcp__<server>__<tool>
  if (toolName.startsWith('mcp__')) {
    const parts = toolName.split('__');
    const server = parts[1] || 'server';
    const tool = parts[2] || 'tool';
    
    // Use simplified formatting here since formatToolInput isn't defined yet
    let detail = server;
    if (input) {
      if (typeof input === 'string') {
        detail += ` • ${input.substring(0, 50)}`;
      } else if (typeof input === 'object') {
        const keys = Object.keys(input);
        if (keys.length > 0) {
          detail += ` • ${keys.slice(0, 2).join(', ')}`;
        }
      }
    }
    
    return {
      icon: TOOL_ICONS.default,
      action: `mcp: ${tool.replace(/_/g, ' ')}`,
      detail
    };
  }
  return null;
};

// Custom syntax highlighter style (vs2015-like dark theme)
const customVs2015: { [key: string]: React.CSSProperties } = {
  'hljs': {
    'display': 'block',
    'overflowX': 'auto' as const,
    'padding': '0.5em',
    'background': '#0f0f0f',
    'color': '#DCDCDC'
  },
  'hljs-keyword': { 'color': '#569CD6' },
  'hljs-literal': { 'color': '#569CD6' },
  'hljs-symbol': { 'color': '#569CD6' },
  'hljs-name': { 'color': '#569CD6' },
  'hljs-link': { 'color': '#569CD6', 'textDecoration': 'underline' },
  'hljs-built_in': { 'color': '#4EC9B0' },
  'hljs-type': { 'color': '#4EC9B0' },
  'hljs-number': { 'color': '#B8D7A3' },
  'hljs-class': { 'color': '#B8D7A3' },
  'hljs-string': { 'color': '#D69D85' },
  'hljs-meta-string': { 'color': '#D69D85' },
  'hljs-regexp': { 'color': '#9A5334' },
  'hljs-template-tag': { 'color': '#9A5334' },
  'hljs-subst': { 'color': '#DCDCDC' },
  'hljs-function': { 'color': '#DCDCDC' },
  'hljs-title': { 'color': '#DCDCDC' },
  'hljs-params': { 'color': '#DCDCDC' },
  'hljs-formula': { 'color': '#DCDCDC' },
  'hljs-comment': { 'color': '#57A64A', 'fontStyle': 'italic' },
  'hljs-quote': { 'color': '#57A64A', 'fontStyle': 'italic' },
  'hljs-doctag': { 'color': '#608B4E' },
  'hljs-meta': { 'color': '#9B9B9B' },
  'hljs-meta-keyword': { 'color': '#9B9B9B' },
  'hljs-tag': { 'color': '#9B9B9B' },
  'hljs-variable': { 'color': '#BD63C5' },
  'hljs-template-variable': { 'color': '#BD63C5' },
  'hljs-attr': { 'color': '#9CDCFE' },
  'hljs-attribute': { 'color': '#9CDCFE' },
  'hljs-builtin-name': { 'color': '#9CDCFE' },
  'hljs-section': { 'color': '#gold' },
  'hljs-emphasis': { 'fontStyle': 'italic' },
  'hljs-strong': { 'fontWeight': 'bold' },
  'hljs-bullet': { 'color': '#D7BA7D' },
  'hljs-selector-tag': { 'color': '#D7BA7D' },
  'hljs-selector-id': { 'color': '#D7BA7D' },
  'hljs-selector-class': { 'color': '#D7BA7D' },
  'hljs-selector-attr': { 'color': '#D7BA7D' },
  'hljs-selector-pseudo': { 'color': '#D7BA7D' },
  'hljs-addition': { 'backgroundColor': '#144212', 'display': 'inline-block', 'width': '100%' },
  'hljs-deletion': { 'backgroundColor': '#600', 'display': 'inline-block', 'width': '100%' }
};

// Helper function to copy code to clipboard
const handleCopyCode = (code: string) => {
  navigator.clipboard.writeText(code).catch(err => {
    console.error('Failed to copy code:', err);
  });
};

// Cache for formatPath results to avoid repeated computations
const formatPathCache = new Map<string, string>();

// Helper function to format paths - memoized with cache
const formatPathWithWorkingDir = (path: string, workingDir?: string): string => {
  // Convert Windows paths to Unix format
  let unixPath = path.replace(/\\/g, '/');

  if (workingDir) {
    // Convert working directory to Unix format too
    const unixWorkingDir = workingDir.replace(/\\/g, '/');

    // 1. Direct match - path starts with working directory
    if (unixPath.toLowerCase().startsWith(unixWorkingDir.toLowerCase())) {
      unixPath = unixPath.slice(unixWorkingDir.length);
      // Remove leading slash if present
      if (unixPath.startsWith('/')) {
        unixPath = unixPath.slice(1);
      }
      // If empty, it's the current directory
      if (!unixPath) {
        unixPath = '.';
      }
    }
    // 2. Handle macOS/Unix absolute paths - check if path contains project name
    else if (unixPath.startsWith('/')) {
      const projectName = unixWorkingDir.split('/').pop() || '';
      const projectIdx = unixPath.toLowerCase().indexOf('/' + projectName.toLowerCase() + '/');
      if (projectIdx !== -1) {
        unixPath = unixPath.slice(projectIdx + projectName.length + 2);
      }
    }
    // 3. Handle Windows absolute paths (C:\, D:\, etc)
    else if (/^[A-Z]:/i.test(unixPath)) {
      const projectName = unixWorkingDir.split('/').pop() || '';
      const projectIdx = unixPath.toLowerCase().indexOf('/' + projectName.toLowerCase() + '/');
      if (projectIdx !== -1) {
        unixPath = unixPath.slice(projectIdx + projectName.length + 2);
      }
    }
    // 4. Handle WSL paths
    else if (unixPath.startsWith('/mnt/')) {
      const projectName = unixWorkingDir.split('/').pop() || '';
      const projectIdx = unixPath.toLowerCase().indexOf('/' + projectName.toLowerCase() + '/');
      if (projectIdx !== -1) {
        unixPath = unixPath.slice(projectIdx + projectName.length + 2);
      }
    }
  }

  // Remove any remaining absolute path prefixes
  if (unixPath.startsWith('/mnt/c/')) {
    const parts = unixPath.split('/');
    // Find project folder (yurucode or testproject)
    const projectIdx = parts.findIndex(p => p === 'yurucode' || p === 'testproject');
    if (projectIdx !== -1) {
      unixPath = parts.slice(projectIdx + 1).join('/');
    }
  }

  // If still absolute, try to make it relative
  if (unixPath.startsWith('/')) {
    const parts = unixPath.split('/');
    if (parts.length > 3) {
      return '.../' + parts.slice(-2).join('/');
    }
  }

  return unixPath || '.';
};

// Helper functions - memoized
const formatPath = (path?: string) => {
  if (!path) return '';

  // Get the current session's working directory from the store
  const store = useClaudeCodeStore.getState();
  const currentSession = store.sessions.find(s => s.id === store.currentSessionId);
  const workingDir = currentSession?.workingDirectory;

  // Create cache key
  const cacheKey = `${path}|${workingDir || ''}`;
  const cached = formatPathCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const result = formatPathWithWorkingDir(path, workingDir);

  // Keep cache size manageable
  if (formatPathCache.size > 1000) {
    const firstKey = formatPathCache.keys().next().value;
    if (firstKey) formatPathCache.delete(firstKey);
  }

  formatPathCache.set(cacheKey, result);
  return result;
};

const formatCommand = (cmd?: string) => {
  if (!cmd) return '';
  return truncateText(cmd, 256);
};

const formatUrl = (url?: string) => {
  if (!url) return '';
  try {
    const u = new URL(url);
    return u.hostname + (u.pathname !== '/' ? u.pathname : '');
  } catch {
    return url;
  }
};

const formatTodos = (todos?: any[]) => {
  if (!todos || !Array.isArray(todos)) return '0 items';
  // single pass counting instead of 3 separate filters
  let pending = 0, in_progress = 0, completed = 0;
  for (const t of todos) {
    if (t.status === 'pending') pending++;
    else if (t.status === 'in_progress') in_progress++;
    else if (t.status === 'completed') completed++;
  }
  const parts = [];
  if (in_progress > 0) parts.push(`${in_progress} active`);
  if (pending > 0) parts.push(`${pending} pending`);
  if (completed > 0) parts.push(`${completed} done`);
  return parts.length > 0 ? parts.join(', ') : 'No tasks';
};

// single pass text extraction - avoids filter+map+filter chain
const extractTextFromBlocks = (blocks: any[]): string => {
  const result: string[] = [];
  for (const block of blocks) {
    if (block.type !== 'text' || !block.text) continue;
    const text = block.text;
    // includes() covers both startsWith cases - no need for both
    if (text.includes('[Attached text]:') || text.includes('[Attached image')) continue;
    const trimmed = text.trim();
    if (trimmed) result.push(text);
  }
  return result.join('\n');
};

const getChangePreview = (oldStr?: string, newStr?: string) => {
  if (!oldStr || !newStr) return '';
  const oldPreview = oldStr.length > 20 ? oldStr.substring(0, 20) + '...' : oldStr;
  return `Replacing "${oldPreview}"`;
};

const formatToolInput = (input: any): string => {
  if (!input) return '';
  
  // For simple values
  if (typeof input === 'string') return input.length > 50 ? input.substring(0, 50) + '...' : input;
  if (typeof input === 'number' || typeof input === 'boolean') return String(input);
  
  // For objects/arrays, extract meaningful info
  if (typeof input === 'object') {
    // Check for common patterns
    if (input.file_path) return formatPath(input.file_path);
    if (input.path) return formatPath(input.path);
    if (input.command) return formatCommand(input.command);
    if (input.url) return formatUrl(input.url);
    if (input.query) return `"${input.query}"`;
    if (input.pattern) return `"${input.pattern}"`;
    if (input.prompt) return input.prompt.substring(0, 50) + '...';
    
    // For arrays, show count
    if (Array.isArray(input)) return `${input.length} items`;
    
    // For other objects, show key count
    const keys = Object.keys(input);
    if (keys.length > 0) {
      const preview = keys.slice(0, 2).map(k => `${k}: ${String(input[k]).substring(0, 20)}`).join(', ');
      return preview + (keys.length > 2 ? '...' : '');
    }
  }
  
  return '';
};

// Render content blocks
// Custom code block component with copy button
const CodeBlock = ({ children, className, ...props }: any) => {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';
  const codeString = String(children).replace(/\n$/, '');
  
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(codeString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [codeString]);
  
  // If code is short (under 256 chars), render as inline code
  if (codeString.length < 256 && !codeString.includes('\n')) {
    return <code className={className} {...props}>{codeString}</code>;
  }
  
  return (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        <span className="code-language">{language || 'code'}</span>
        <button onClick={handleCopy} className="code-copy-btn" title={copied ? 'copied!' : 'copy'}>
          {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
        </button>
      </div>
      <SyntaxHighlighter
        language={language || 'text'}
        style={customVs2015}
        customStyle={{
          margin: 0,
          padding: '2px',
          border: 'none',
          borderRadius: '2px',
          fontSize: language === 'bash' ? '8px' : '12px',
          backgroundColor: '#000000'
        }}
        {...props}
      >
        {codeString}
      </SyntaxHighlighter>
    </div>
  );
};

const renderContent = (content: string | ContentBlock[] | undefined, message?: any, searchQuery?: string, isCurrentMatch?: boolean) => {
  if (!content) return null;
  
  if (typeof content === 'string') {
    // Check if this is raw JSON that needs to be processed
    const trimmedContent = content.trim();
    if ((trimmedContent.startsWith('[') && trimmedContent.endsWith(']')) ||
        (trimmedContent.startsWith('{') && trimmedContent.endsWith('}'))) {
      try {
        const parsed = JSON.parse(trimmedContent);
        // If it's an array of content blocks, process them properly
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].type) {
          return renderContent(parsed, message, searchQuery, isCurrentMatch);
        }
        // If it's a single content block, wrap in array and process
        if (parsed.type && (parsed.text || parsed.name)) {
          return renderContent([parsed], message, searchQuery, isCurrentMatch);
        }
        // If it's a plain object with a text field, extract and display it
        if (parsed.text && typeof parsed.text === 'string') {
          return (
            <div className="markdown-content"><ReactMarkdown
              remarkPlugins={REMARK_PLUGINS}
              components={{
                code({ className, children, ...props }) {
                  // In react-markdown v9+, inline is determined by whether there's a language class
                  const isInline = !className?.startsWith('language-');
                  if (isInline) {
                    return <code className={className} {...props}>{children}</code>;
                  }
                  return <CodeBlock className={className} {...props}>{children}</CodeBlock>;
                },
                p({ children, ...props }) {
                  if (
                    children &&
                    Array.isArray(children) &&
                    children.length === 1 &&
                    children[0] &&
                    typeof children[0] === 'object' &&
                    'type' in children[0] &&
                    children[0].type === CodeBlock
                  ) {
                    return <>{children}</>;
                  }
                  return <p {...props}>{children}</p>;
                },
                a({ children }) {
                  return <>{children}</>;
                },
                table({ node, children, ...props }) {
                  return (
                    <div className="table-wrapper">
                      <table className="markdown-table" {...props}>{children}</table>
                    </div>
                  );
                }
              }}
            >
              {processThinkingTags(parsed.text)}
            </ReactMarkdown></div>
          );
        }
        // Otherwise it's raw JSON data - show it as formatted JSON in a code block
        return (
          <div className="code-block-wrapper">
            <div className="code-block-header">
              <span className="code-language">json</span>
            </div>
            <SyntaxHighlighter
              language="json"
              style={customVs2015}
              customStyle={{
                margin: 0,
                padding: '2px',
                border: 'none',
                borderRadius: '2px',
                fontSize: '12px',
                backgroundColor: '#000000'
              }}
            >
              {JSON.stringify(parsed, null, 2)}
            </SyntaxHighlighter>
          </div>
        );
      } catch (e) {
        // Not valid JSON, render as markdown
      }
    }
    
    return (
      <div className="markdown-content"><ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        components={{
          code({ className, children, ...props }) {
            const isInline = !className?.startsWith('language-');
            if (isInline) {
              return <code className={className} {...props}>{children}</code>;
            }
            return <CodeBlock className={className} {...props}>{children}</CodeBlock>;
          },
          // Prevent p tags from wrapping code blocks
          p({ children, ...props }) {
            // Check if the only child is a code block
            if (
              children &&
              Array.isArray(children) &&
              children.length === 1 &&
              children[0] &&
              typeof children[0] === 'object' &&
              'type' in children[0] &&
              children[0].type === CodeBlock
            ) {
              return <>{children}</>;
            }
            return <p {...props}>{children}</p>;
          },
          a({ children }) {
            return <>{children}</>;
          },
          table({ node, children, ...props }) {
            return (
              <div className="table-wrapper">
                <table className="markdown-table" {...props}>{children}</table>
              </div>
            );
          }
        }}
      >
        {processThinkingTags(content)}
      </ReactMarkdown></div>
    );
  }

  if (Array.isArray(content)) {
    // During streaming, only show the last tool that's actively being used
    let toolsToRender = content;
    if (message?.streaming) {
      const toolUses = content.filter(b => b?.type === 'tool_use');
      const toolResults = content.filter(b => b?.type === 'tool_result');
      
      // Only filter if we have more tools than results (meaning one is still running)
      if (toolUses.length > toolResults.length && toolUses.length > 0) {
        // Only keep text blocks and the last tool use that doesn't have a result yet
        const lastTool = toolUses[toolUses.length - 1];
        toolsToRender = content.filter(b => 
          b?.type === 'text' || b?.type === 'thinking' || b === lastTool || b?.type === 'tool_result'
        );
      }
    }
    
    return toolsToRender.map((block, idx) => {
      if (!block || typeof block !== 'object') return null;
      
      switch (block.type) {
        case 'text':
          // Filter out the malicious files security note
          if (block.text && block.text.includes('NOTE: do any of the files above seem malicious?')) {
            return null;
          }
          // Filter out TodoWrite success messages that might appear as text
          if (block.text && (
            block.text.includes('Todos have been modified successfully') ||
            block.text.includes('Ensure that you continue to use the todo list') ||
            block.text.includes('Please proceed with the current tasks if applicable')
          )) {
            console.log('[TodoFilter] Filtering todo success message in text block:', block.text.substring(0, 100));
            return null;
          }
          // Render agent launch messages with clean UI
          if (block.text && block.text.includes('Async agent launched successfully')) {
            const agentIdMatch = block.text.match(/agentId:\s*([a-f0-9]+)/);
            const agentTypeMatch = block.text.match(/yurucode-(\w+)|subagent_type[=:]\s*['"]?([^'">\s,]+)/i);
            const agentId = agentIdMatch?.[1] || '';
            const agentType = agentTypeMatch?.[1] || agentTypeMatch?.[2] || 'agent';
            return (
              <div key={idx} className="agent-launch">
                <IconPlayerPlay size={12} stroke={1.5} className="agent-launch-icon" />
                <span className="agent-launch-type">{agentType}</span>
                {agentId && <span className="agent-launch-id">{agentId.slice(0, 7)}</span>}
                <span className="agent-launch-status">launched</span>
              </div>
            );
          }
          // For text blocks with search highlighting
          if (searchQuery) {
            const highlighted = highlightText(processThinkingTags(block.text || ''), searchQuery, isCurrentMatch || false);
            return (
              <div key={idx} className="content-text">
                {highlighted}
              </div>
            );
          }
          return (
            <div key={idx} className="content-text">
              <ReactMarkdown
                remarkPlugins={REMARK_PLUGINS}
                components={{
                  a({ children }) {
                    return <>{children}</>;
                  },
                  table({ node, children, ...props }) {
                    return (
                      <div className="table-wrapper">
                        <table className="markdown-table" {...props}>{children}</table>
                      </div>
                    );
                  }
                }}
              >{processThinkingTags(block.text || '')}</ReactMarkdown>
            </div>
          );
          
        case 'thinking':
          // Render thinking blocks with enhanced styling - always fully visible
          const thinkingContent = (block.thinking || block.text || '').trim();
          const lines = thinkingContent.split('\n');
          const lineCount = lines.length;
          const charCount = thinkingContent.length;
          const isStreaming = message?.streaming || false;

          if (!thinkingContent) {
            return null;
          }

          return (
            <div key={idx} className={`thinking-block ${isStreaming ? 'streaming' : ''}`}>
              <div className="thinking-header">
                <IconDots size={14} stroke={1.5} className="thinking-icon" style={{ color: 'var(--accent-color)' }} />
              </div>
              <div className="thinking-content">
                <div className="thinking-markdown"><ReactMarkdown
                  remarkPlugins={REMARK_PLUGINS}
                  components={{
                    a({ children }) {
                      return <>{children}</>;
                    },
                    code({ node, className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || '');
                      const isInline = !match && !String(children).includes('\n');

                      if (isInline) {
                        return <code className="thinking-inline-code" {...props}>{children}</code>;
                      }

                      return (
                        <div className="thinking-code-block">
                          {match && <div className="thinking-code-lang">{match[1]}</div>}
                          <pre className="thinking-code-pre">
                            <code className="thinking-code" {...props}>{children}</code>
                          </pre>
                        </div>
                      );
                    },
                    pre({ children }) {
                      return <>{children}</>;
                    },
                    table({ node, children, ...props }) {
                      return (
                        <div className="table-wrapper">
                          <table className="markdown-table" {...props}>{children}</table>
                        </div>
                      );
                    }
                  }}
                >
                  {thinkingContent}
                </ReactMarkdown></div>
              </div>
            </div>
          );

        case 'tool_use':
          // Tool uses are now rendered separately outside message bubbles
          // Return null here to prevent them from appearing inside bubbles
          return null;
          
        case 'tool_result':
          // Handle tool results
          let resultContent = typeof block.content === 'string' 
            ? block.content 
            : typeof block.content === 'object' && block.content !== null
              ? JSON.stringify(block.content, null, 2)
              : '';
          
          // Check if content is empty or just whitespace and display placeholder
          if (!resultContent || resultContent.trim() === '' || resultContent.trim() === '""') {
            resultContent = '(no content)';
          }
          
          // Trim trailing newlines from tool results
          resultContent = resultContent.replace(/\n+$/, '');
          
          // Replace absolute paths with relative paths in result content
          const store = useClaudeCodeStore.getState();
          const currentSession = store.sessions.find(s => s.id === store.currentSessionId);
          const workingDir = currentSession?.workingDirectory;
          
          if (workingDir && resultContent) {
            // Convert working directory to Unix format
            const unixWorkingDir = workingDir.replace(/\\/g, '/');
            // Escape special regex characters in the path
            const escapedPath = unixWorkingDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // Replace all occurrences of the absolute path with relative path
            const pathRegex = new RegExp(escapedPath + '(/[^\\s]*)?', 'gi');
            resultContent = resultContent.replace(pathRegex, (match, rest) => {
              if (rest) {
                return '.' + rest;
              }
              return '.';
            });
          }
          
          // Check if this is a file operation result (Edit, MultiEdit, Write, NotebookEdit)
          const prevBlock = content[idx - 1];
          const isFileOperation = prevBlock?.type === 'tool_use' && 
            (prevBlock.name === 'Edit' || prevBlock.name === 'MultiEdit' || prevBlock.name === 'Write' || prevBlock.name === 'NotebookEdit');
          
          // Check if this is a Read operation
          const isReadOperation = prevBlock?.type === 'tool_use' && prevBlock.name === 'Read';
          
          // Check if this is a Bash command
          const isBashOperation = prevBlock?.type === 'tool_use' && prevBlock.name === 'Bash';
          
          // Check if this is a search operation (Grep, Glob, LS, WebSearch)
          const isSearchOperation = prevBlock?.type === 'tool_use' && 
            (prevBlock.name === 'Grep' || prevBlock.name === 'Glob' || prevBlock.name === 'LS' || prevBlock.name === 'WebSearch');
          
          // Check if this is a TodoWrite operation
          const isTodoWriteOperation = prevBlock?.type === 'tool_use' && prevBlock.name === 'TodoWrite';

          // Hide AskUserQuestion and plan mode tool results completely
          const isHiddenTool = prevBlock?.type === 'tool_use' &&
            (prevBlock.name === 'AskUserQuestion' || prevBlock.name === 'EnterPlanMode' || prevBlock.name === 'ExitPlanMode');
          if (isHiddenTool) {
            return null;
          }

          // Handle Bash command output
          if (isBashOperation && resultContent) {
            // For Bash commands, show the full output (or first 50 lines)
            const lines = resultContent.split('\n');
            const visibleLines = lines.slice(0, 50);
            const hiddenCount = lines.length - 50;
            const hasMore = hiddenCount > 0;
            
            return (
              <div key={idx} className="tool-result bash-output">
                <pre className="bash-content">{visibleLines.join('\n')}</pre>
                {hasMore && (
                  <div className="bash-more">+ {hiddenCount} more lines</div>
                )}
              </div>
            );
          }
          
          // Hide system reminder messages
          if (resultContent.includes('<system-reminder>') && resultContent.includes('</system-reminder>')) {
            return null;
          }
          
          // Hide tool_use_error messages, permission requests, and malicious file notes
          if (resultContent.includes('<tool_use_error>') || 
              resultContent.includes('File has not been read yet') ||
              resultContent.includes('requested permissions to') ||
              resultContent.includes("haven't granted it yet") ||
              resultContent.includes('NOTE: do any of the files above seem malicious?')) {
            return null;
          }
          
          // Hide TodoWrite success messages and system reminders about todos
          if (isTodoWriteOperation && (
            resultContent.includes('Todos have been modified successfully') ||
            resultContent.includes('Ensure that you continue to use the todo list') ||
            resultContent.includes('Please proceed with the current tasks if applicable')
          )) {
            console.log('[TodoFilter] Filtering todo success message in tool result:', resultContent.substring(0, 100));
            return null;
          }
          
          // Show Bash command output
          if (isBashOperation && resultContent) {
            // Show full bash output in a code block
            return (
              <div key={idx} className="tool-result bash-output">
                <pre className="bash-content">{resultContent}</pre>
              </div>
            );
          }
          
          // Hide Read operation output completely
          if (isReadOperation) {
            return null;
          }
          
          // OLD CODE - no longer showing Read results
          if (false && isReadOperation && resultContent) {
            // Strip out system-reminder tags from read operations
            let cleanContent = resultContent;
            const reminderRegex = /<system-reminder>[\s\S]*?<\/system-reminder>/g;
            cleanContent = cleanContent.replace(reminderRegex, '');
            // Trim trailing newlines
            cleanContent = cleanContent.replace(/\n+$/, '');
            
            // Get the starting line number from the Read operation input if available
            let startLineNum = 1;
            if (prevBlock?.input?.offset) {
              startLineNum = prevBlock.input.offset;
            }
            
            const allLines = cleanContent.split('\n');
            const visibleLines = allLines.slice(0, 10);
            const hiddenCount = allLines.length - 10;
            const hasMore = hiddenCount > 0;
            
            return (
              <div key={idx} className="tool-result read-output">
                <pre className="read-content">
                  {visibleLines.map((line, i) => (
                    <div key={i} className="read-line">
                      <span className="line-number">{(startLineNum + i).toString().padStart(4, ' ')}</span>
                      <span className="line-text">{line}</span>
                    </div>
                  ))}
                </pre>
                {hasMore && (
                  <div className="read-more">+ {hiddenCount} more lines</div>
                )}
              </div>
            );
          }
          
          // Limit search operation outputs to 10 lines
          if (isSearchOperation && resultContent) {
            // Process search results to convert absolute paths to relative
            const processedContent = (() => {
              // Get the current working directory
              const store = useClaudeCodeStore.getState();
              const currentSession = store.sessions.find(s => s.id === store.currentSessionId);
              const workingDir = currentSession?.workingDirectory;
              
              if (!workingDir) return resultContent;
              
              // Process each line to convert paths
              const lines = resultContent.split('\n');
              return lines.map(line => {
                // Search results typically have format: /absolute/path/file.ext:linenum:content
                // or: /absolute/path/file.ext-content
                const colonIndex = line.indexOf(':');
                const dashIndex = line.indexOf('-');
                const separatorIndex = colonIndex > 0 && (dashIndex < 0 || colonIndex < dashIndex) ? colonIndex : dashIndex;
                
                if (separatorIndex > 0) {
                  const pathPart = line.substring(0, separatorIndex);
                  // Check if this looks like a path
                  if (pathPart.startsWith('/') || pathPart.match(/^[A-Z]:/)) {
                    const relativePath = formatPath(pathPart);
                    return relativePath + line.substring(separatorIndex);
                  }
                }
                return line;
              }).join('\n');
            })();
            
            // Don't trim search results to preserve formatting
            const allLines = processedContent.split('\n');
            const visibleLines = allLines.slice(0, 10);
            const hiddenCount = allLines.length - 10;
            const hasMore = hiddenCount > 0;
            
            return (
              <div key={idx} className="tool-result search-output">
                <pre className="search-content">
                  {visibleLines.map((line, i) => (
                    <div key={i} className="search-line">
                      <span className="line-number">{(i + 1).toString().padStart(4, ' ')}</span>
                      <span className="line-text">{line}</span>
                    </div>
                  ))}
                </pre>
                {hasMore && (
                  <div className="search-more">+ {hiddenCount} more lines</div>
                )}
              </div>
            );
          }
          
          // Show formatted diff for file operations
          if (isFileOperation && resultContent) {
            // Check if this is an Edit/MultiEdit result - be more lenient with detection
            const isEditResult = prevBlock?.name === 'Edit' || prevBlock?.name === 'MultiEdit' || prevBlock?.name === 'NotebookEdit' ||
                                (resultContent.includes('has been updated')) ||
                                (resultContent.includes('Applied') && resultContent.includes('edit')) ||
                                (resultContent.includes('→')) ||
                                (resultContent.includes('successfully'));
            
            if (isEditResult && (prevBlock?.name === 'Edit' || prevBlock?.name === 'MultiEdit' || prevBlock?.name === 'NotebookEdit')) {
              // Extract file path from Edit output
              let filePathMatch = resultContent.match(/The file (.+?) has been updated/) || 
                                 resultContent.match(/Applied \d+ edits? to (.+?)(?::|$)/);
              let filePath = filePathMatch ? filePathMatch[1] : 'file';
              
              // Convert to relative path
              filePath = formatPath(filePath);
              
              // Parse the Edit/MultiEdit result to create a diff
              const lines = resultContent.split('\n');
              // Find where the actual diff starts
              let diffStartIdx = lines.findIndex(line => line.includes("Here's the result of running"));
              const diffLines = diffStartIdx >= 0 ? lines.slice(diffStartIdx + 1) : lines.slice(1);
              
              // Parse Edit/MultiEdit tool input to get old and new strings
              const toolInput = prevBlock?.input;
              const oldString = toolInput?.old_string || '';
              const newString = toolInput?.new_string || '';
              
              // Debug logging
              console.log('[DiffViewer] Processing file operation:', {
                prevBlockType: prevBlock?.type,
                prevBlockName: prevBlock?.name,
                hasToolInput: !!toolInput,
                hasOldString: !!oldString,
                hasNewString: !!newString,
                oldStringLength: oldString?.length,
                newStringLength: newString?.length,
                toolInput
              });
              
              // For MultiEdit, combine all edits
              const edits = toolInput?.edits || [];
              
              // Create diff display
              const diffDisplay: DiffDisplay = {
                file: filePath,
                hunks: []
              };
              
              // If we have old and new strings from Edit tool
              if (oldString && newString) {
                const oldLines = oldString.split('\n');
                const newLines = newString.split('\n');

                // Extract the starting line number from the result output
                // The format is like "     7→CHANGED line 7!"
                let extractedLineNum = 1;
                for (const line of diffLines) {
                  const match = line.match(/^\s*(\d+)[→ ]/);
                  if (match) {
                    extractedLineNum = parseInt(match[1], 10);
                    break;
                  }
                }

                // Create a hunk showing the change
                const hunk = {
                  startLine: extractedLineNum,
                  endLine: extractedLineNum + Math.max(oldLines.length, newLines.length),
                  lines: [] as DiffLine[]
                };

                // Add removed lines
                oldLines.forEach((line: string, i: number) => {
                  hunk.lines.push({
                    type: 'remove' as const,
                    content: line,
                    lineNumber: extractedLineNum + i
                  });
                });

                // Add added lines
                newLines.forEach((line: string, i: number) => {
                  hunk.lines.push({
                    type: 'add' as const,
                    content: line,
                    lineNumber: extractedLineNum + i
                  });
                });

                diffDisplay.hunks.push(hunk);
              } else if (edits.length > 0) {
                // Handle MultiEdit - extract line numbers from diffLines output
                const lineNumMatches: number[] = [];
                for (const line of diffLines) {
                  const match = line.match(/^\s*(\d+)[→ ]/);
                  if (match) {
                    const num = parseInt(match[1], 10);
                    if (!lineNumMatches.includes(num)) {
                      lineNumMatches.push(num);
                    }
                  }
                }

                edits.forEach((edit: any, editIdx: number) => {
                  const oldLines = (edit.old_string || '').split('\n');
                  const newLines = (edit.new_string || '').split('\n');

                  // Use extracted line number if available
                  const startLine = lineNumMatches[editIdx] || (editIdx * 10 + 1);

                  const hunk = {
                    startLine: startLine,
                    endLine: startLine + Math.max(oldLines.length, newLines.length),
                    lines: [] as DiffLine[]
                  };

                  // Add removed lines
                  oldLines.forEach((line: string, i: number) => {
                    hunk.lines.push({
                      type: 'remove' as const,
                      content: line,
                      lineNumber: startLine + i
                    });
                  });

                  // Add added lines
                  newLines.forEach((line: string, i: number) => {
                    hunk.lines.push({
                      type: 'add' as const,
                      content: line,
                      lineNumber: startLine + i
                    });
                  });

                  diffDisplay.hunks.push(hunk);
                });
              } else {
                // Fallback: parse the output to show line numbers
                const parsedLines: DiffLine[] = [];
                diffLines.forEach(line => {
                  // Check if line has format "123→  content" (preserving whitespace)
                  const match = line.match(/^\s*(\d+)→(.*)$/);
                  if (match) {
                    parsedLines.push({
                      type: 'context' as const,
                      content: match[2],
                      lineNumber: parseInt(match[1])
                    });
                  } else if (line.trim()) {
                    parsedLines.push({
                      type: 'context' as const,
                      content: line
                    });
                  }
                });
                
                if (parsedLines.length > 0) {
                  diffDisplay.hunks.push({
                    startLine: parsedLines[0]?.lineNumber || 1,
                    endLine: parsedLines[parsedLines.length - 1]?.lineNumber || parsedLines.length,
                    lines: parsedLines
                  });
                }
              }
              
              // Debug logging for diff display
              console.log('[DiffViewer] Final diff display:', {
                file: diffDisplay.file,
                hunksCount: diffDisplay.hunks.length,
                hasHunks: diffDisplay.hunks.length > 0,
                hunks: diffDisplay.hunks
              });
              
              // Use DiffViewer if we have hunks, otherwise fallback
              if (diffDisplay.hunks.length > 0) {
                return (
                  <div key={idx} className="tool-result file-edit">
                    <DiffViewer diff={diffDisplay} />
                  </div>
                );
              } else {
                // Fallback to simple display
                return (
                  <div key={idx} className="tool-result file-edit">
                    <div className="edit-header">{filePath}</div>
                    <pre className="edit-diff">{diffLines.join('\n')}</pre>
                  </div>
                );
              }
            }
            
            // For Write operations, show content as all additions (new file creation)
            if (prevBlock?.name === 'Write') {
              const filePath = formatPath(prevBlock?.input?.file_path || 'file');
              const writtenContent = prevBlock?.input?.content || '';
              const allLines = writtenContent.split('\n');

              // Create diff display with all lines as additions
              const diffDisplay: DiffDisplay = {
                file: filePath,
                hunks: [{
                  startLine: 1,
                  endLine: allLines.length,
                  lines: allLines.map((line: string, i: number) => ({
                    type: 'add' as const,
                    content: line,
                    lineNumber: i + 1
                  }))
                }]
              };

              return (
                <div key={idx} className="tool-result file-edit">
                  <DiffViewer diff={diffDisplay} />
                </div>
              );
            }
          }
          
          // If we've handled edit operations above, don't show them again
          if (prevBlock?.name === 'Edit' || prevBlock?.name === 'MultiEdit' || prevBlock?.name === 'NotebookEdit') {
            return null;
          }
          
          // Filter out verbose outputs for non-file/non-read operations
          if (!isReadOperation && !isSearchOperation && resultContent.length > 1000) {
            return (
              <div key={idx} className="tool-result collapsed">
                <span className="result-text">output hidden ({resultContent.length} chars)</span>
              </div>
            );
          }
          
          // Check for actual errors - but ignore is_error flag for successful Edit/Write operations
          // Claude CLI sometimes incorrectly sets is_error:true for successful operations
          const looksLikeSuccess = resultContent.includes('has been updated') ||
                                   resultContent.includes('successfully') ||
                                   resultContent.includes('Applied') ||
                                   resultContent.includes('→') ||
                                   resultContent.includes('created');

          if (block.is_error && !looksLikeSuccess) {
            const handleErrorContextMenu = (e: React.MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();

              // Copy error to clipboard
              navigator.clipboard.writeText(resultContent).then(() => {
              }).catch(err => {
                console.error('Failed to copy error:', err);
              });
            };

            return (
              <div
                key={idx}
                className="tool-result error"
                onContextMenu={handleErrorContextMenu}
                title="right-click to copy error"
              >
                <span className="result-text">{resultContent}</span>
              </div>
            );
          }
          
          if (resultContent.includes('successfully') || resultContent.includes('created') || resultContent.includes('updated')) {
            return (
              <div key={idx} className="tool-result success">
                <span className="result-text">{resultContent}</span>
              </div>
            );
          }
          
          // Show other tool results in a minimal way
          if (resultContent && (isSearchOperation ? resultContent.replace(/\n+$/, '') : resultContent.trim())) {
            // For search operations: only remove trailing newlines, preserve leading spaces
            // For other operations: trim all whitespace
            const trimmedContent = isSearchOperation ? resultContent.replace(/\n+$/, '') : resultContent.replace(/\n+$/, '').trim();
            return (
              <div key={idx} className="tool-result minimal">
                <span className="result-text">{trimmedContent.substring(0, 100)}{trimmedContent.length > 100 ? '...' : ''}</span>
              </div>
            );
          }
          
          return null;
          
        default:
          // Never show raw JSON or unknown block types
          return null;
      }
    });
  }
  
  return null;
};

// Helper function to highlight search matches
const highlightText = (text: string, searchQuery: string, isCurrentMatch: boolean) => {
  if (!searchQuery || !text) return text;
  
  const parts = text.split(new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  
  return parts.map((part, i) => {
    if (part.toLowerCase() === searchQuery.toLowerCase()) {
      return (
        <span key={i} className={`search-highlight ${isCurrentMatch ? 'current' : ''}`}>
          {part}
        </span>
      );
    }
    return part;
  });
};

// Main message renderer component - memoized for performance
const MessageRendererBase: React.FC<{
  message: ClaudeMessage;
  index: number;
  isLast?: boolean;
  searchQuery?: string;
  isCurrentMatch?: boolean;
  sessionId?: string;
  isStreaming?: boolean;
  thinkingFor?: number;
}> = ({ message, index, isLast = false, searchQuery = '', isCurrentMatch = false, isStreaming = false }) => {
  // Get the current session to access previous messages for context
  const store = useClaudeCodeStore.getState();
  const currentSession = store.sessions.find(s => s.id === store.currentSessionId);
  const sessionMessages = currentSession?.messages || [];

  // Ref for selection preservation during streaming
  const containerRef = useRef<HTMLDivElement>(null);
  const selectionStateRef = useRef<SelectionState | null>(null);
  const wasStreamingRef = useRef(false);
  const restoreRafRef = useRef<number | null>(null);

  // Track streaming state transitions and capture selection
  useLayoutEffect(() => {
    // When streaming starts, begin tracking selection
    if (isStreaming && !wasStreamingRef.current) {
      wasStreamingRef.current = true;
    }

    // While streaming, save selection if user has one
    if (isStreaming && containerRef.current) {
      const saved = saveSelection(containerRef.current);
      if (saved) {
        selectionStateRef.current = saved;
      }
    }

    // When streaming ends, clear saved state
    if (!isStreaming && wasStreamingRef.current) {
      wasStreamingRef.current = false;
      selectionStateRef.current = null;
    }
  });

  // Restore selection after render (during streaming) - use double-RAF for reliability
  useEffect(() => {
    if (!isStreaming || !containerRef.current || !selectionStateRef.current) return;

    // Cancel any pending restore
    if (restoreRafRef.current) {
      cancelAnimationFrame(restoreRafRef.current);
    }

    // Double requestAnimationFrame for more reliable DOM settling
    // First RAF: scheduled after current paint
    // Second RAF: scheduled after next paint (DOM is definitely settled)
    restoreRafRef.current = requestAnimationFrame(() => {
      restoreRafRef.current = requestAnimationFrame(() => {
        if (containerRef.current && selectionStateRef.current) {
          restoreSelection(containerRef.current, selectionStateRef.current);
        }
        restoreRafRef.current = null;
      });
    });

    return () => {
      if (restoreRafRef.current) {
        cancelAnimationFrame(restoreRafRef.current);
        restoreRafRef.current = null;
      }
    };
  });

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };
  
  
  const getMessageText = (content: any): string => {
    if (typeof content === 'string') {
      // Check if this is a JSON string (from attachments)
      if (content.startsWith('[') && content.endsWith(']')) {
        try {
          const parsedContent = JSON.parse(content);
          if (Array.isArray(parsedContent)) {
            return extractTextFromBlocks(parsedContent);
          }
        } catch (e) {
          // If JSON parsing fails, return as regular string
        }
      }
      return content;
    }
    if (Array.isArray(content)) {
      return extractTextFromBlocks(content);
    }
    return '';
  };
  switch (message.type) {
    case 'error':
      // Handle error messages from Claude not being installed
      const errorContent = message.content || (typeof message.message === 'string' ? message.message : message.message?.content) || 'An error occurred';
      const isInstallError = message.errorType === 'claude_not_installed';
      
      return (
        <div className="message system-error">
          <div className="message-content">
            <div className="error-message" style={ERROR_MESSAGE_STYLE}>
              <div style={FLEX_ROW_STYLE}>
                <span style={ICON_STYLE}>❌</span>
                <div style={FLEX_1_STYLE}>
                  {isInstallError ? (
                    <div>
                      <div style={BOLD_MARGIN_STYLE}>
                        Claude CLI Not Installed
                      </div>
                      <div>{String(errorContent)}</div>
                    </div>
                  ) : (
                    <div>{String(errorContent)}</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    case 'system':
      // Handle compact notification
      if (message.subtype === 'compact') {
        const compactText = typeof message.message === 'string' 
          ? message.message 
          : (typeof message.message === 'object' && message.message?.content) 
            ? message.message.content 
            : 'context compacted to save tokens';
        
        return (
          <div className="message system-compact">
            <div className="message-content">
              <div className="compact-message">
                <span className="compact-icon">🗜️</span>
                <span>{String(compactText)}</span>
              </div>
            </div>
          </div>
        );
      }
      
      // Handle rate limit notification
      if (message.subtype === 'rate_limit') {
        const rateLimitText = typeof message.message === 'string' 
          ? message.message 
          : (typeof message.message === 'object' && message.message?.content) 
            ? message.message.content 
            : 'rate limited';
        
        return (
          <div className="message system-rate-limit">
            <div className="message-content">
              <div className="rate-limit-message">
                <IconAlertTriangle size={14} stroke={1.5} />
                <span>{String(rateLimitText)}</span>
              </div>
            </div>
          </div>
        );
      }
      
      // Show error messages and interruption messages
      if (message.subtype === 'error') {
        const errorText = typeof message.message === 'string'
          ? message.message
          : (typeof message.message === 'object' && (message.message as any)?.message)
            ? (message.message as any).message
            : 'An error occurred';
            
        const handleContextMenu = (e: React.MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          
          // Copy error to clipboard
          navigator.clipboard.writeText(errorText).then(() => {
          }).catch(err => {
            console.error('Failed to copy error:', err);
          });
        };
        
        return (
          <div 
            className="message system-error" 
            onContextMenu={handleContextMenu}
            title="right-click to copy error"
          >
            <div className="message-content">
              <div className="error-message">
                <IconAlertTriangle size={14} stroke={1.5} />
                <span>{errorText}</span>
              </div>
            </div>
          </div>
        );
      }
      
      if (message.subtype === 'interrupted') {
        return (
          <div className="message system-interrupted">
            <div className="message-content">
              <div className="interrupted-message">
                <IconPlayerStop size={12} stroke={1.5} />
                <span>{typeof message.message === 'string' ? message.message : (typeof message.message?.content === 'string' ? message.message.content : '')}</span>
              </div>
            </div>
          </div>
        );
      }
      
      // Hide other system messages like session started
      return null;
      
    case 'user':
      const userContent = message.message?.content || '';
      let displayText: any = '';
      let pastedCount = 0;
      let attachmentTypes: string[] = [];
      
      if (typeof userContent === 'string') {
        // Check if this is a JSON string (from attachments)
        if (userContent.startsWith('[{') && userContent.endsWith('}]')) {
          try {
            const parsedContent = JSON.parse(userContent);
            if (Array.isArray(parsedContent)) {
              // Handle JSON-parsed content blocks
              let userTexts: string[] = [];
              
              parsedContent.forEach((item: any) => {
                if (item && typeof item === 'object') {
                  if (item.type === 'text' && item.text) {
                    const text = item.text;
                    
                    // Check if this is an attachment
                    if (text.startsWith('[Attached text]:') || text.includes('[Attached text]:')) {
                      pastedCount++;
                      attachmentTypes.push('text');
                      // Don't add to userTexts - we only show in attachment indicator
                    } else if (text.startsWith('[Attached image') || text.includes('[Attached image')) {
                      pastedCount++;
                      attachmentTypes.push('image');
                      // Don't add to userTexts - we only show in attachment indicator
                    } else {
                      // This is regular user text
                      userTexts.push(text);
                    }
                  } else if (item.type === 'image') {
                    // Count image attachments
                    pastedCount++;
                    attachmentTypes.push('image');
                  }
                }
              });
              
              // Join all regular user texts (usually just one at the end)
              displayText = userTexts.join(' ').trim();
            } else {
              // Not an array, treat as regular string
              displayText = userContent;
            }
          } catch (e) {
            // If JSON parsing fails, treat as regular string
            displayText = userContent;
          }
        } else {
          // Regular string content
          displayText = userContent;
        }
      } else if (Array.isArray(userContent)) {
        // Handle array content directly (shouldn't happen with proper JSON string storage)
        let userTexts: string[] = [];
        
        userContent.forEach((item) => {
          if (item && typeof item === 'object') {
            if (item.type === 'text' && item.text) {
              const text = item.text;
              
              // Check if this is an attachment
              if (text.startsWith('[Attached text]:') || text.includes('[Attached text]:')) {
                pastedCount++;
                attachmentTypes.push('text');
              } else if (text.startsWith('[Attached image') || text.includes('[Attached image')) {
                pastedCount++;
                attachmentTypes.push('image');
              } else {
                // This is regular user text
                userTexts.push(text);
              }
            } else if (item.type === 'image') {
              // Count image attachments
              pastedCount++;
              attachmentTypes.push('image');
            }
          } else if (typeof item === 'string') {
            // Direct string item - assume it's regular text
            userTexts.push(item);
          }
        });
        
        // Join all regular user texts
        displayText = userTexts.join(' ').trim();
      }
      
      // Skip rendering if there's no content and no attachments
      if (!displayText && pastedCount === 0) {
        return null;
      }
      
      // Add attachment indicator if present with cleaner formatting
      if (pastedCount > 0) {
        // Extract text content to count lines and bytes
        let totalLines = 0;
        let totalBytes = 0;
        const imageCount = attachmentTypes.filter(t => t === 'image').length;
        const textCount = attachmentTypes.filter(t => t === 'text').length;
        
        // Parse content again to get actual attachment data
        if (typeof userContent === 'string' && userContent.startsWith('[{')) {
          try {
            const parsedContent = JSON.parse(userContent);
            parsedContent.forEach((item: any) => {
              if (item?.type === 'text' && item?.text) {
                const text = item.text;
                if (text.startsWith('[Attached text]:')) {
                  const attachedText = text.substring('[Attached text]:'.length);
                  totalLines += attachedText.split('\n').length;
                  totalBytes += new Blob([attachedText]).size;
                }
              }
            });
          } catch (e) {
            // Ignore parsing errors
          }
        }
        
        let attachmentText = '';
        if (textCount > 0 && totalLines > 0) {
          // Format bytes nicely
          const formatBytes = (bytes: number) => {
            if (bytes < 1024) return `${bytes} bytes`;
            if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}kb`;
            return `${(bytes / (1024 * 1024)).toFixed(1)}mb`;
          };
          attachmentText = `${totalLines} lines, ${formatBytes(totalBytes)}`;
        } else if (imageCount > 0) {
          attachmentText = `${imageCount} image${imageCount > 1 ? 's' : ''}`;
        } else {
          attachmentText = `${pastedCount} attachment${pastedCount > 1 ? 's' : ''}`;
        }
        
        const attachmentPreview = (
          <div className="message-attachment-preview">
            <span className="attachment-text">[attached: {attachmentText}]</span>
          </div>
        );
        // Store original text for ultrathink processing, then wrap with attachment
        const originalText = displayText;
        displayText = { originalText, attachmentPreview } as any;
      }

      // Check if this is a bash command
      const isBashCommand = typeof displayText === 'string' && isBashPrefix(displayText);

      // Helper to render text with ultrathink rainbow animation
      const renderWithUltrathink = (text: string): React.ReactNode => {
        if (!/ultrathink/i.test(text)) {
          return highlightText(text, searchQuery, isCurrentMatch);
        }
        const parts = text.split(/(ultrathink)/gi);
        return parts.map((part, i) =>
          /ultrathink/i.test(part)
            ? <span key={i} className="ultrathink-text">{part}</span>
            : part
        );
      };

      // Helper to render multiline text with ultrathink rainbow animation
      const renderMultilineWithUltrathink = (text: string): React.ReactNode => {
        const lines = text.split('\n');
        return lines.map((line, lineIdx) => (
          <React.Fragment key={lineIdx}>
            {lineIdx > 0 && <br />}
            {renderWithUltrathink(line)}
          </React.Fragment>
        ));
      };

      return (
        <div className="message user">
          <div className="message-actions user-actions">
            <button
              onClick={() => handleCopy(getMessageText(message.message?.content))}
              className="action-btn"
              title="copy"
            >
              <IconCopy size={12} stroke={1.5} />
            </button>
          </div>
          <div className={`message-bubble ${isBashCommand ? 'font-mono bash-mode' : ''}`}>
            {typeof displayText === 'string' ? (
              displayText.includes('\n') ? (
                <span>{renderMultilineWithUltrathink(displayText)}</span>
              ) : (
                <span>{renderWithUltrathink(displayText)}</span>
              )
            ) : displayText && typeof displayText === 'object' && 'originalText' in displayText ? (
              // Handle attachment case - apply ultrathink to text part
              <>
                {displayText.originalText && (
                  <div>
                    {displayText.originalText.includes('\n')
                      ? <span>{renderMultilineWithUltrathink(displayText.originalText)}</span>
                      : <span>{renderWithUltrathink(displayText.originalText)}</span>
                    }
                  </div>
                )}
                {displayText.attachmentPreview}
              </>
            ) : (
              displayText
            )}
          </div>
        </div>
      );
      
    case 'assistant':
      const assistantContent = message.message?.content;
      
      const isEmpty = !assistantContent || 
        (typeof assistantContent === 'string' && !assistantContent.trim()) ||
        (Array.isArray(assistantContent) && assistantContent.filter(b => b.type === 'text' && b.text).length === 0);
      
      
      // Always show buttons for non-streaming assistant messages
      const showButtons = message.streaming !== true;
      
      // Process content that might be JSON
      let contentToRender = message.message?.content;
      if (typeof contentToRender === 'string') {
        // Check if it's a JSON string that needs processing
        if ((contentToRender.startsWith('{') && contentToRender.endsWith('}')) ||
            (contentToRender.startsWith('[') && contentToRender.endsWith(']'))) {
          try {
            const parsed = JSON.parse(contentToRender);
            // If it successfully parses as JSON and has type/text structure, convert to proper content blocks
            if (Array.isArray(parsed) && parsed.some(item => item.type)) {
              contentToRender = parsed;
            } else if (parsed.type && parsed.text) {
              contentToRender = [parsed];
            } else if (parsed.text && typeof parsed.text === 'string') {
              // Plain object with text field - convert to text content block
              contentToRender = [{type: 'text', text: parsed.text}];
            } else if (Array.isArray(parsed) && parsed.length === 1 && parsed[0].text) {
              // Array with single object containing text
              contentToRender = [{type: 'text', text: parsed[0].text}];
            } else {
              // It's other JSON data - keep as is to be rendered as JSON
              // contentToRender stays as string, will be rendered by renderContent
            }
          } catch (e) {
            // Not JSON, treat as regular text
          }
        }
      }
      
      // Separate text content, thinking blocks, and tool uses
      let textContent = contentToRender;
      let thinkingBlocks: ContentBlock[] = [];
      let toolUses: ContentBlock[] = [];
      
      if (Array.isArray(contentToRender)) {
        textContent = contentToRender.filter(b => b.type === 'text');
        thinkingBlocks = contentToRender.filter(b => b.type === 'thinking');
        toolUses = contentToRender.filter(b => b.type === 'tool_use');
        
        // Debug logging for thinking blocks
        if (thinkingBlocks.length > 0) {
          console.log('[MessageRenderer] Found thinking blocks:', {
            count: thinkingBlocks.length,
            content: thinkingBlocks.map(b => ({ 
              type: b.type, 
              text: b.thinking?.substring(0, 100) || b.text?.substring(0, 100) 
            })),
            messageId: message.id,
            messageType: message.type
          });
        }
      } else if (typeof contentToRender === 'string') {
        // If it's a string, treat it as text content
        textContent = contentToRender;
        thinkingBlocks = [];
        toolUses = [];
      } else {
        console.log('[MessageRenderer] contentToRender is neither array nor string:', {
          type: typeof contentToRender,
          value: contentToRender,
          messageId: message.id
        });
      }
      
      const shouldRenderText = textContent && ((Array.isArray(textContent) && textContent.length > 0) || (typeof textContent === 'string' && textContent.trim()));


      // During streaming, if there's no content yet, don't render anything
      // The thinking indicator is shown separately in ClaudeChat
      const hasTextContent = textContent && ((Array.isArray(textContent) && textContent.length > 0) || (typeof textContent === 'string' && textContent.trim()));

      // Debug logging for bash output issue
      if (message.id?.startsWith('bash-')) {
        console.log('[MessageRenderer] BASH MESSAGE DEBUG:', {
          messageId: message.id,
          contentToRender: JSON.stringify(contentToRender),
          textContent: JSON.stringify(textContent),
          hasTextContent,
          isArray: Array.isArray(textContent),
          arrayLength: Array.isArray(textContent) ? textContent.length : 'N/A',
          streaming: message.streaming
        });
      }

      // Show empty assistant message with (no content) if it's not streaming and has no text
      const showEmptyMessage = !message.streaming && !hasTextContent && message.type === 'assistant';
      
      return (
        <div ref={containerRef}>
          {/* Render thinking blocks first, outside any message bubble */}
          {thinkingBlocks && thinkingBlocks.length > 0 && (
            <div className="message thinking-message">
              {thinkingBlocks.map((block, idx) =>
                renderContent([block], message, searchQuery, isCurrentMatch)
              )}
            </div>
          )}

          {/* Render text content in message bubble if there is any, or show (no content) */}
          {(hasTextContent || showEmptyMessage) && (
            <div className="message assistant">
              <div className="message-content">
                <div className="message-bubble">
                  {hasTextContent ?
                    renderContent(textContent, message, searchQuery, isCurrentMatch) :
                    <span style={{ color: '#666', fontStyle: 'italic' }}>(no content)</span>
                  }
                </div>
              </div>
              {showButtons && (
                <div className="message-actions">
                  <button
                    onClick={() => handleCopy(getMessageText(message.message?.content))}
                    className="action-btn"
                    title="copy"
                  >
                    <IconCopy size={12} stroke={1.5} />
                  </button>
                </div>
              )}
            </div>
          )}
          
          {/* Render tool uses separately outside the message bubble */}
          {toolUses && toolUses.map((toolBlock, idx) => {
            // Hide Read, AskUserQuestion, and plan mode tool displays completely
            if (toolBlock.name === 'Read' || toolBlock.name === 'AskUserQuestion' ||
                toolBlock.name === 'EnterPlanMode' || toolBlock.name === 'ExitPlanMode') {
              return null;
            }
            
            const tool = TOOL_DISPLAYS[toolBlock.name || ''];
            const mcpDisplay = !tool ? getMCPToolDisplay(toolBlock.name || '', toolBlock.input) : null;
            const display = tool ? tool(toolBlock.input) : mcpDisplay || {
              icon: <IconBolt size={14} stroke={1.5} className="tool-icon" />,
              action: toolBlock.name?.toLowerCase() || 'tool',
              detail: toolBlock.input ? formatToolInput(toolBlock.input) : '',
              todos: null
            };
            
            // Special rendering for TodoWrite
            if (toolBlock.name === 'TodoWrite' && toolBlock.input?.todos) {
              const todos = toolBlock.input.todos || [];
              return (
                <div key={`tool-${idx}`} className="message tool-message">
                  <div className="tool-use todo-write standalone">
                    <div className="todo-header">
                      <IconChecklist size={14} stroke={1.5} className="todo-header-icon" />
                      <span className="tool-action">{display.action}</span>
                      <span className="tool-detail">{display.detail}</span>
                    </div>
                    <div className="todo-list">
                      {todos.map((todo: any, todoIdx: number) => (
                        <div key={todoIdx} className={`todo-item ${todo.status}`}>
                          {todo.status === 'completed' ? (
                            <IconCheck size={12} stroke={2} className="todo-icon completed" />
                          ) : todo.status === 'in_progress' ? (
                            <IconChevronsRight size={12} stroke={2} className="todo-icon progress" />
                          ) : (
                            <IconMinus size={12} stroke={2} className="todo-icon pending" />
                          )}
                          <span className="todo-content">{todo.content}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            }
            
            // Regular tool use rendering
            return (
              <div key={`tool-${idx}`} className="message tool-message">
                <div className="tool-use standalone">
                  {display.icon && <span className="tool-icon">{display.icon}</span>}
                  <span className="tool-action">{display.action}</span>
                  {display.detail && <span className="tool-detail">{display.detail}</span>}
                </div>
              </div>
            );
          })}
        </div>
      );

    case 'tool_use':
      // Standalone tool use message
      const toolName = message.message?.name || 'unknown tool';
      const toolInput = message.message?.input || {};
      const isSubagentMessage = !!(message as any).parent_tool_use_id;

      // Hide Read tool displays completely (for both main agent and subagent)
      if (toolName === 'Read') {
        return null;
      }

      // Hide noisy tools from subagent (Glob, TodoWrite - but show main agent versions)
      if (isSubagentMessage && (toolName === 'Glob' || toolName === 'TodoWrite')) {
        return null;
      }

      const tool = TOOL_DISPLAYS[toolName];
      const mcpDisplay = !tool ? getMCPToolDisplay(toolName, toolInput) : null;
      const display = tool ? tool(toolInput) : mcpDisplay || {
        icon: <IconBolt size={14} stroke={1.5} />,
        action: toolName.toLowerCase(),
        detail: formatToolInput(toolInput)
      };
      
      // For TodoWrite tool, show the full todo list
      if (toolName === 'TodoWrite' && toolInput.todos) {
        const todos = toolInput.todos || [];
        return (
          <div className="message tool-message">
            <div className="tool-use todo-write standalone">
              <div className="todo-header">
                <IconChecklist size={14} stroke={1.5} className="todo-header-icon" />
                <span className="tool-action">updating todos</span>
                <span className="tool-detail">{formatTodos(todos)}</span>
              </div>
              <div className="todo-list">
                {todos.map((todo: any, todoIdx: number) => (
                  <div key={todoIdx} className={`todo-item ${todo.status}`}>
                    {todo.status === 'completed' ? (
                      <IconCheck size={12} stroke={2} className="todo-icon completed" />
                    ) : todo.status === 'in_progress' ? (
                      <IconChevronsRight size={12} stroke={2} className="todo-icon progress" />
                    ) : (
                      <IconMinus size={12} stroke={2} className="todo-icon pending" />
                    )}
                    <span className="todo-content">{todo.content}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      }
      
      // For Edit tool, just show the action (diff will appear in tool_result)
      if (toolName === 'Edit') {
        const filePath = formatPath(toolInput.file_path || 'file');
        return (
          <div className={`message tool-message${isSubagentMessage ? ' subagent' : ''}`}>
            <div className={`tool-use standalone${isSubagentMessage ? ' subagent-tool' : ''}`}>
              {isSubagentMessage && <span className="subagent-indicator">↳</span>}
              <IconEdit size={14} stroke={1.5} className="tool-icon" />
              <span className="tool-action">editing</span>
              <span className="tool-detail">{filePath}</span>
            </div>
          </div>
        );
      }
      
      // For MultiEdit tool, just show the action (diff will appear in tool_result)
      if (toolName === 'MultiEdit') {
        const filePath = formatPath(toolInput.file_path || 'file');
        const edits = toolInput.edits || [];
        return (
          <div className={`message tool-message${isSubagentMessage ? ' subagent' : ''}`}>
            <div className={`tool-use standalone${isSubagentMessage ? ' subagent-tool' : ''}`}>
              {isSubagentMessage && <span className="subagent-indicator">↳</span>}
              <IconEditCircle size={14} stroke={1.5} className="tool-icon" />
              <span className="tool-action">editing</span>
              <span className="tool-detail">{filePath} ({edits.length} edits)</span>
            </div>
          </div>
        );
      }
      
      // For NotebookEdit tool, just show the action (diff will appear in tool_result)
      if (toolName === 'NotebookEdit') {
        const filePath = formatPath(toolInput.notebook_path || 'notebook');
        const editMode = toolInput.edit_mode || 'replace';
        return (
          <div className={`message tool-message${isSubagentMessage ? ' subagent' : ''}`}>
            <div className={`tool-use standalone${isSubagentMessage ? ' subagent-tool' : ''}`}>
              {isSubagentMessage && <span className="subagent-indicator">↳</span>}
              <IconNotebook size={14} stroke={1.5} className="tool-icon" />
              <span className="tool-action">editing notebook</span>
              <span className="tool-detail">{filePath} ({editMode})</span>
            </div>
          </div>
        );
      }
      
      // Subagent tool_use: show with a nested visual indicator
      if (isSubagentMessage) {
        return (
          <div className="message tool-message subagent">
            <div className="tool-use standalone subagent-tool">
              <span className="subagent-indicator">↳</span>
              {display.icon && <span className="tool-icon">{display.icon}</span>}
              <span className="tool-action">{display.action}</span>
              {display.detail && <span className="tool-detail">{display.detail}</span>}
            </div>
          </div>
        );
      }

      return (
        <div className="message tool-message">
          <div className="tool-use standalone">
            {display.icon && <span className="tool-icon">{display.icon}</span>}
            <span className="tool-action">{display.action}</span>
            {display.detail && <span className="tool-detail">{display.detail}</span>}
          </div>
        </div>
      );

    case 'tool_result':
      // Standalone tool result message
      const resultContent = message.message?.content || message.message || '';
      
      
      // Extract plain text from JSON if it's a tool result with output
      let contentStr = '';
      if (typeof resultContent === 'string') {
        // Check if it's JSON with tool_use_id and output
        if (resultContent.includes('tool_use_id') && resultContent.includes('"content"')) {
          try {
            const parsed = JSON.parse(resultContent);
            // Check for content field (not output)
            if (parsed.content !== undefined) {
              contentStr = parsed.content;
            } else {
              contentStr = resultContent;
            }
          } catch (e) {
            contentStr = resultContent;
          }
        } else if (resultContent.includes('tool_use_id') && resultContent.includes('"output"')) {
          try {
            const parsed = JSON.parse(resultContent);
            if (parsed.output) {
              contentStr = parsed.output;
            } else {
              contentStr = resultContent;
            }
          } catch (e) {
            contentStr = resultContent;
          }
        } else {
          contentStr = resultContent;
        }
      } else if (typeof resultContent === 'object' && !Array.isArray(resultContent) && (resultContent as any).output) {
        contentStr = (resultContent as any).output;
      } else if (typeof resultContent === 'object' && !Array.isArray(resultContent) && (resultContent as any).content !== undefined) {
        contentStr = (resultContent as any).content;
      } else if (Array.isArray(resultContent)) {
        // Handle array of content blocks (e.g., from Task tool)
        const textBlocks = resultContent.filter(block => block?.type === 'text' && block?.text);
        if (textBlocks.length > 0) {
          // Join all text blocks with newlines
          contentStr = textBlocks.map(block => block.text).join('\n\n');
        } else {
          // No text blocks found, stringify as fallback
          contentStr = JSON.stringify(resultContent, null, 2);
        }
      } else {
        contentStr = typeof resultContent === 'string' ? resultContent : JSON.stringify(resultContent, null, 2);
      }
      
      
      // Check if content is empty and display placeholder
      if (contentStr === '' || contentStr === null || contentStr === undefined || 
          (typeof contentStr === 'string' && contentStr.trim() === '')) {
        contentStr = '(no content)';
      }
      
      // Replace absolute paths with relative paths in result content
      const store = useClaudeCodeStore.getState();
      const currentSession = store.sessions.find(s => s.id === store.currentSessionId);
      const workingDir = currentSession?.workingDirectory;
      
      if (workingDir && contentStr) {
        // Convert working directory to Unix format
        const unixWorkingDir = workingDir.replace(/\\/g, '/');
        // Escape special regex characters in the path
        const escapedPath = unixWorkingDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Replace all occurrences of the absolute path with relative path
        const pathRegex = new RegExp(escapedPath + '(/[^\\s]*)?', 'gi');
        contentStr = contentStr.replace(pathRegex, (match, rest) => {
          if (rest) {
            return '.' + rest;
          }
          return '.';
        });
      }
      
      // Hide tool_use_error messages like "File has not been read yet"
      if (contentStr.includes('<tool_use_error>') || 
          contentStr.includes('File has not been read yet')) {
        return null;
      }
      
      // Strip out system-reminder tags from all tool results
      const reminderRegex = /<system-reminder>[\s\S]*?<\/system-reminder>/g;
      contentStr = contentStr.replace(reminderRegex, '');
      
      // Trim trailing newlines from tool results  
      contentStr = contentStr.replace(/\n+$/, '');
      
      // Check if we should preserve formatting (for Read and Search operations)
      // Look for the associated tool_use message for this tool_result
      let associatedToolUse = null;

      // First try to find by tool_use_id (most reliable)
      const toolUseId = message.message?.tool_use_id;
      if (toolUseId) {
        associatedToolUse = sessionMessages.find(m =>
          m.type === 'tool_use' &&
          (m.message?.id === toolUseId || m.id === toolUseId)
        );
        if (!associatedToolUse) {
          console.log('[tool_result] Could not find tool_use by id:', toolUseId,
            'Available tool_use ids:', sessionMessages.filter(m => m.type === 'tool_use').map(m => ({ msgId: m.id, toolId: m.message?.id })));
        }
      }

      // Fallback: look for the most recent tool_use message before this tool_result
      if (!associatedToolUse) {
        const currentIndex = sessionMessages.findIndex(m => m.id === message.id);
        const searchIndex = currentIndex >= 0 ? currentIndex : (index ?? sessionMessages.length);
        for (let i = searchIndex - 1; i >= 0; i--) {
          if (sessionMessages[i]?.type === 'tool_use') {
            associatedToolUse = sessionMessages[i];
            break;
          }
        }
        if (!associatedToolUse) {
          console.log('[tool_result] Fallback search also failed, no tool_use found before index', searchIndex);
        }
      }
      
      const isReadOperation = associatedToolUse?.message?.name === 'Read';
      const isSearchOperation = associatedToolUse?.message?.name === 'Grep' || 
         associatedToolUse?.message?.name === 'Glob' ||
         associatedToolUse?.message?.name === 'LS' ||
         associatedToolUse?.message?.name === 'WebSearch';
      const isBashOperation = associatedToolUse?.message?.name === 'Bash';
      
      // Never trim for Read, Search, Bash, or Edit operations to preserve formatting
      const isEditOperation = associatedToolUse?.message?.name === 'Edit' || 
                              associatedToolUse?.message?.name === 'MultiEdit' ||
                              associatedToolUse?.message?.name === 'NotebookEdit';
      if (!isReadOperation && !isSearchOperation && !isBashOperation && !isEditOperation) {
        contentStr = contentStr.trim();
      }
      
      // Check if this is an Edit result - detect by associated tool name (more reliable)
      // Note: replace_all edits say "were successfully replaced" without line numbers
      const isEditResultByContent = contentStr.includes('has been updated') ||
                          (contentStr.includes('Applied') && (contentStr.includes('edit to') || contentStr.includes('edits to')));
      // Use tool name detection as primary, content detection as fallback
      const isEditResult = isEditOperation || isEditResultByContent;
      
      // Check if this is a Read operation result (already have associatedToolUse from above)
      const isReadResult = isReadOperation;
      
      // Hide Read tool results completely
      if (isReadResult) {
        return null;
      }
      
      // Enhanced display for Edit/MultiEdit results
      if (isEditResult) {
        // Parse the edit result to extract the diff information
        const lines = contentStr.split('\n');
        
        // Extract file path from the result message
        let filePath = '';
        const isMultiEdit = contentStr.includes('Applied') && (contentStr.includes('edit to') || contentStr.includes('edits to'));
        const filePathMatch = contentStr.match(/The file (.+?) has been updated/) || 
                              contentStr.match(/Applied \d+ edits? to (.+?)(?::|$)/);
        if (filePathMatch) {
          filePath = formatPath(filePathMatch[1]);
        }
        
        // For MultiEdit, generate diff from tool input
        if (isMultiEdit && associatedToolUse?.message?.input?.edits) {
          const edits = associatedToolUse.message.input.edits || [];

          // Extract line numbers from the output content
          // The format shows lines like "     7→content"
          const lineNumMatches: number[] = [];
          const lineNumRegex = /^\s*(\d+)[→ ]/gm;
          let match;
          while ((match = lineNumRegex.exec(contentStr)) !== null) {
            const num = parseInt(match[1], 10);
            if (!lineNumMatches.includes(num)) {
              lineNumMatches.push(num);
            }
          }

          // Create diff display using the edits
          const diffDisplay: DiffDisplay = {
            file: filePath,
            hunks: []
          };

          // Generate hunks from edits
          edits.forEach((edit: any, editIdx: number) => {
            const oldLines = (edit.old_string || '').split('\n');
            const newLines = (edit.new_string || '').split('\n');

            // Use extracted line number if available, otherwise use a sequential fallback
            const startLine = lineNumMatches[editIdx] || (editIdx * 10 + 1);

            const hunk = {
              startLine: startLine,
              endLine: startLine + Math.max(oldLines.length, newLines.length),
              lines: [] as DiffLine[]
            };

            // Add removed lines
            oldLines.forEach((line: string, i: number) => {
              hunk.lines.push({
                type: 'remove' as const,
                content: line,
                lineNumber: startLine + i
              });
            });

            // Add added lines
            newLines.forEach((line: string, i: number) => {
              hunk.lines.push({
                type: 'add' as const,
                content: line,
                lineNumber: startLine + i
              });
            });

            diffDisplay.hunks.push(hunk);
          });
          
          // Use DiffViewer component
          if (diffDisplay.hunks.length > 0) {
            return (
              <div className="message tool-result-message">
                <div className="tool-result file-edit">
                  <DiffViewer diff={diffDisplay} />
                </div>
              </div>
            );
          }
        }
        
        // For single Edit, also generate diff from tool input
        if (!isMultiEdit && associatedToolUse?.message?.input) {
          const oldString = associatedToolUse.message.input.old_string || '';
          const newString = associatedToolUse.message.input.new_string || '';

          console.log('[Edit] associatedToolUse found:', associatedToolUse.message?.name,
            'has old_string:', !!oldString, 'has new_string:', !!newString,
            'filePath:', filePath || associatedToolUse.message?.input?.file_path);

          if (oldString && newString) {
            // Try to extract the starting line number from the result output
            // The output format is like "     7→CHANGED line 7!"
            let startLineNum = 1;
            const lineNumMatch = contentStr.match(/^\s*(\d+)[→ ]/m);
            if (lineNumMatch) {
              startLineNum = parseInt(lineNumMatch[1], 10);
            }

            // Create diff display using the edits
            const diffDisplay: DiffDisplay = {
              file: filePath,
              hunks: []
            };

            const oldLines = oldString.split('\n');
            const newLines = newString.split('\n');

            const hunk = {
              startLine: startLineNum,
              endLine: startLineNum + Math.max(oldLines.length, newLines.length),
              lines: [] as DiffLine[]
            };

            // Add removed lines
            oldLines.forEach((line: string, i: number) => {
              hunk.lines.push({
                type: 'remove' as const,
                content: line,
                lineNumber: startLineNum + i
              });
            });

            // Add added lines
            newLines.forEach((line: string, i: number) => {
              hunk.lines.push({
                type: 'add' as const,
                content: line,
                lineNumber: startLineNum + i
              });
            });

            diffDisplay.hunks.push(hunk);

            // Use DiffViewer component
            return (
              <div className="message tool-result-message">
                <div className="tool-result file-edit">
                  <DiffViewer diff={diffDisplay} />
                </div>
              </div>
            );
          }
        }
        
        // Fallback: For Edit results, show the updated lines with highlighting
        if (!isMultiEdit && lines.some(line => line.match(/^\s*\d+[→ ]/))) {
          // Extract the lines with line numbers
          const displayLines: Array<{ lineNumber: number; isChanged: boolean; content: string }> = [];
          
          lines.forEach(line => {
            const lineMatch = line.match(/^\s*(\d+)([→ ])(.*)/);
            if (lineMatch) {
              const actualLineNumber = parseInt(lineMatch[1]);
              const isChanged = lineMatch[2] === '→';
              const content = lineMatch[3];
              
              displayLines.push({
                lineNumber: actualLineNumber,
                isChanged,
                content
              });
            }
          });
          
          // Simple display with highlighted changed lines
          return (
            <div className="message tool-result-message">
              <div className="tool-result file-edit">
                <div className="edit-header">{filePath}</div>
                <pre className="edit-content">
                  {displayLines.map((line, idx) => (
                    <div key={idx} className={`edit-line ${line.isChanged ? 'changed' : ''}`}>
                      <span className="line-number">{line.lineNumber.toString().padStart(4, ' ')}</span>
                      <span className="line-marker">{line.isChanged ? '→' : ' '}</span>
                      <span className="line-text">{line.content}</span>
                    </div>
                  ))}
                </pre>
              </div>
            </div>
          );
        }
        
        // For MultiEdit, show each edit section
        if (isMultiEdit) {
          const editSections: Array<{ editNum: number; lines: string[] }> = [];
          let currentEditNum = 0;
          let currentLines: string[] = [];
          
          lines.forEach(line => {
            if (line.match(/^Edit \d+ of \d+/)) {
              if (currentLines.length > 0) {
                editSections.push({ editNum: currentEditNum, lines: currentLines });
              }
              const editMatch = line.match(/^Edit (\d+) of \d+/);
              currentEditNum = editMatch ? parseInt(editMatch[1]) : 0;
              currentLines = [];
            } else if (line.match(/^\s*\d+[→ ]/)) {
              currentLines.push(line);
            }
          });
          
          if (currentLines.length > 0) {
            editSections.push({ editNum: currentEditNum, lines: currentLines });
          }
          
          return (
            <div className="message tool-result-message">
              <div className="tool-result file-edit">
                <div className="edit-header">{filePath}</div>
                {editSections.map((section, idx) => {
                  const sectionLines = section.lines.map(line => {
                    const lineMatch = line.match(/^\s*(\d+)([→ ])(.*)/);
                    if (lineMatch) {
                      return {
                        lineNumber: parseInt(lineMatch[1]),
                        isChanged: lineMatch[2] === '→',
                        content: lineMatch[3]
                      };
                    }
                    return null;
                  }).filter(Boolean) as any[];
                  
                  return (
                    <div key={idx} style={{ marginTop: idx > 0 ? '12px' : 0 }}>
                      {editSections.length > 1 && (
                        <div style={{ fontSize: '10px', color: '#666', marginBottom: '4px' }}>
                          edit {section.editNum} of {editSections.length}
                        </div>
                      )}
                      <pre className="edit-content">
                        {sectionLines.map((line, lineIdx) => (
                          <div key={lineIdx} className={`edit-line ${line.isChanged ? 'changed' : ''}`}>
                            <span className="line-number">{line.lineNumber.toString().padStart(4, ' ')}</span>
                            <span className="line-marker">{line.isChanged ? '→' : ' '}</span>
                            <span className="line-text">{line.content}</span>
                          </div>
                        ))}
                      </pre>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        }
        
        // Fallback to simple display if no line numbers found
        console.log('[Edit] FALLBACK - no associatedToolUse or missing input',
          'hasAssociatedToolUse:', !!associatedToolUse,
          'toolName:', associatedToolUse?.message?.name,
          'hasInput:', !!associatedToolUse?.message?.input,
          'contentPreview:', contentStr.substring(0, 100));
        return (
          <div className="message tool-result-message">
            <div className="tool-result standalone edit-output">
              <pre className="result-content">{contentStr}</pre>
            </div>
          </div>
        );
      }
      
      // Also check for fallback edit results without tool association
      if (isEditResult && !isEditOperation) {
        // Try to show as simple text if we couldn't parse it
        return (
          <div className="message tool-result-message">
            <div className="tool-result file-edit">
              <pre className="edit-content">{contentStr}</pre>
            </div>
          </div>
        );
      }

      // Get associated tool name for specific handling
      const resultToolName = associatedToolUse?.message?.name;

      // ===== WRITE TOOL =====
      if (resultToolName === 'Write') {
        const filePath = formatPath(associatedToolUse?.message?.input?.file_path || 'file');
        const writtenContent = associatedToolUse?.message?.input?.content || '';
        const allLines = writtenContent.split('\n');

        // Create diff display with all lines as additions (file creation)
        const diffDisplay: DiffDisplay = {
          file: filePath,
          hunks: [{
            startLine: 1,
            endLine: allLines.length,
            lines: allLines.map((line: string, i: number) => ({
              type: 'add' as const,
              content: line,
              lineNumber: i + 1
            }))
          }]
        };

        return (
          <div className="message tool-result-message">
            <div className="tool-result file-edit">
              <DiffViewer diff={diffDisplay} />
            </div>
          </div>
        );
      }

      // ===== BASH TOOL =====
      if (resultToolName === 'Bash' || resultToolName === 'BashOutput') {
        const command = associatedToolUse?.message?.input?.command || '';
        const allLines = contentStr.split('\n');
        const MAX_LINES = 15;
        const visibleLines = allLines.slice(0, MAX_LINES);
        const hiddenCount = allLines.length - MAX_LINES;
        const hasMore = hiddenCount > 0;

        return (
          <div className="message tool-result-message">
            <div className="tool-result standalone bash-output">
              {command && (
                <div className="bash-command">
                  <span className="bash-prompt">$</span>
                  <span className="bash-cmd">{formatCommand(command)}</span>
                </div>
              )}
              <pre className="bash-content">
                {visibleLines.map((line, i) => (
                  <div key={i} className="bash-line">{line}</div>
                ))}
              </pre>
              {hasMore && (
                <div className="result-more">+ {hiddenCount} more lines</div>
              )}
            </div>
          </div>
        );
      }

      // ===== TODOWRITE TOOL - Hide success messages =====
      if (resultToolName === 'TodoWrite') {
        if (contentStr.includes('Todos have been modified successfully') ||
            contentStr.includes('Ensure that you continue to use the todo list') ||
            contentStr.includes('Please proceed with the current tasks if applicable')) {
          return null;
        }
      }

      // ===== GREP TOOL =====
      if (resultToolName === 'Grep') {
        const pattern = associatedToolUse?.message?.input?.pattern || '';
        const allLines = contentStr.split('\n').map(line => {
          // Convert absolute paths to relative
          const colonIndex = line.indexOf(':');
          if (colonIndex > 0) {
            const pathPart = line.substring(0, colonIndex);
            if (pathPart.startsWith('/') || pathPart.match(/^[A-Z]:/)) {
              return formatPath(pathPart) + line.substring(colonIndex);
            }
          }
          return line;
        });
        const MAX_LINES = 12;
        const visibleLines = allLines.slice(0, MAX_LINES);
        const hiddenCount = allLines.length - MAX_LINES;
        const hasMore = hiddenCount > 0;

        return (
          <div className="message tool-result-message">
            <div className="tool-result standalone search-output">
              <div className="search-header">
                <IconSearch size={12} stroke={1.5} />
                <span className="search-pattern">"{pattern}"</span>
              </div>
              <pre className="search-content">
                {visibleLines.map((line, i) => (
                  <div key={i} className="search-line">{line}</div>
                ))}
              </pre>
              {hasMore && (
                <div className="result-more">+ {hiddenCount} more matches</div>
              )}
            </div>
          </div>
        );
      }

      // ===== GLOB TOOL =====
      if (resultToolName === 'Glob') {
        const pattern = associatedToolUse?.message?.input?.pattern || '';
        const allLines = contentStr.split('\n').filter(l => l.trim()).map(line => formatPath(line));
        const MAX_LINES = 12;
        const visibleLines = allLines.slice(0, MAX_LINES);
        const hiddenCount = allLines.length - MAX_LINES;
        const hasMore = hiddenCount > 0;

        return (
          <div className="message tool-result-message">
            <div className="tool-result standalone file-list">
              <div className="file-list-header">
                <IconFileSearch size={12} stroke={1.5} />
                <span className="file-pattern">{pattern}</span>
              </div>
              <pre className="file-list-content">
                {visibleLines.map((line, i) => (
                  <div key={i} className="file-item">{line}</div>
                ))}
              </pre>
              {hasMore && (
                <div className="result-more">+ {hiddenCount} more files</div>
              )}
            </div>
          </div>
        );
      }

      // ===== LS TOOL =====
      if (resultToolName === 'LS') {
        const path = formatPath(associatedToolUse?.message?.input?.path || '.');
        const allLines = contentStr.split('\n').filter(l => l.trim());
        const MAX_LINES = 15;
        const visibleLines = allLines.slice(0, MAX_LINES);
        const hiddenCount = allLines.length - MAX_LINES;
        const hasMore = hiddenCount > 0;

        return (
          <div className="message tool-result-message">
            <div className="tool-result standalone dir-listing">
              <div className="dir-header">
                <IconFolderOpen size={12} stroke={1.5} />
                <span className="dir-path">{path}</span>
              </div>
              <pre className="dir-content">
                {visibleLines.map((line, i) => (
                  <div key={i} className="dir-item">{line}</div>
                ))}
              </pre>
              {hasMore && (
                <div className="result-more">+ {hiddenCount} more items</div>
              )}
            </div>
          </div>
        );
      }

      // ===== WEBSEARCH TOOL =====
      if (resultToolName === 'WebSearch') {
        const query = associatedToolUse?.message?.input?.query || '';
        const allLines = contentStr.split('\n').filter(l => l.trim());
        const MAX_LINES = 10;
        const visibleLines = allLines.slice(0, MAX_LINES);
        const hiddenCount = allLines.length - MAX_LINES;
        const hasMore = hiddenCount > 0;

        return (
          <div className="message tool-result-message">
            <div className="tool-result standalone web-search">
              <div className="web-search-header">
                <IconWorld size={12} stroke={1.5} />
                <span className="web-query">"{query}"</span>
              </div>
              <pre className="web-search-content">
                {visibleLines.map((line, i) => (
                  <div key={i} className="web-result-line">{line}</div>
                ))}
              </pre>
              {hasMore && (
                <div className="result-more">+ {hiddenCount} more results</div>
              )}
            </div>
          </div>
        );
      }

      // ===== WEBFETCH TOOL =====
      if (resultToolName === 'WebFetch') {
        const url = formatUrl(associatedToolUse?.message?.input?.url || '');
        const allLines = contentStr.split('\n');
        const MAX_LINES = 10;
        const visibleLines = allLines.slice(0, MAX_LINES);
        const hiddenCount = allLines.length - MAX_LINES;
        const hasMore = hiddenCount > 0;

        return (
          <div className="message tool-result-message">
            <div className="tool-result standalone web-fetch">
              <div className="web-fetch-header">
                <IconDownload size={12} stroke={1.5} />
                <span className="web-url">{url}</span>
              </div>
              <pre className="web-fetch-content">
                {visibleLines.map((line, i) => (
                  <div key={i} className="web-line">{line}</div>
                ))}
              </pre>
              {hasMore && (
                <div className="result-more">+ {hiddenCount} more lines</div>
              )}
            </div>
          </div>
        );
      }

      // ===== TASK TOOL =====
      if (resultToolName === 'Task') {
        const description = associatedToolUse?.message?.input?.description || 'task';
        const subagentType = associatedToolUse?.message?.input?.subagent_type || 'agent';

        // Check if this is an async agent launch - hide the internal instructions
        if (contentStr.includes('Async agent launched successfully')) {
          const agentIdMatch = contentStr.match(/agentId:\s*([a-f0-9]+)/);
          const agentId = agentIdMatch?.[1] || '';
          return (
            <div className="message tool-result-message">
              <div className="tool-result standalone task-result background-agent">
                <div className="task-header">
                  <IconPlayerPlay size={12} stroke={1.5} />
                  <span className="task-desc">{description}</span>
                  <span className="task-type">{subagentType}</span>
                  {agentId && <span className="agent-id">{agentId.slice(0, 7)}</span>}
                </div>
                <div className="task-status">running in background</div>
              </div>
            </div>
          );
        }

        const allLines = contentStr.split('\n');
        const MAX_LINES = 15;
        const visibleLines = allLines.slice(0, MAX_LINES);
        const hiddenCount = allLines.length - MAX_LINES;
        const hasMore = hiddenCount > 0;

        return (
          <div className="message tool-result-message">
            <div className="tool-result standalone task-result">
              <div className="task-header">
                <IconRobot size={12} stroke={1.5} />
                <span className="task-desc">{description}</span>
                <span className="task-type">{subagentType}</span>
              </div>
              <pre className="task-content">
                {visibleLines.map((line, i) => (
                  <div key={i} className="task-line">{line}</div>
                ))}
              </pre>
              {hasMore && (
                <div className="result-more">+ {hiddenCount} more lines</div>
              )}
            </div>
          </div>
        );
      }

      // ===== TASKOUTPUT TOOL (agent progress) =====
      if (resultToolName === 'TaskOutput') {
        // Parse the xml-like structure from TaskOutput
        const statusMatch = contentStr.match(/<retrieval_status>(\w+)<\/retrieval_status>/);
        const taskIdMatch = contentStr.match(/<task_id>([^<]+)<\/task_id>/);
        const taskStatusMatch = contentStr.match(/<status>(\w+)<\/status>/);
        const outputMatch = contentStr.match(/<output>([\s\S]*?)<\/output>/);

        const retrievalStatus = statusMatch?.[1] || 'unknown';
        const taskId = taskIdMatch?.[1] || '';
        const taskStatus = taskStatusMatch?.[1] || retrievalStatus;
        const rawOutput = outputMatch?.[1]?.trim() || '';

        // Parse tool calls from the output
        const toolCalls = rawOutput.split('\n').filter(line => line.startsWith('[Tool:'));
        const displayCalls = toolCalls.slice(-8); // show last 8 tool calls
        const hiddenCalls = toolCalls.length - displayCalls.length;

        // Status icon and color
        const isRunning = taskStatus === 'running' || retrievalStatus === 'timeout';
        const isComplete = taskStatus === 'completed';
        const StatusIcon = isRunning ? IconDots : (isComplete ? IconCheck : IconX);
        const statusClass = isRunning ? 'running' : (isComplete ? 'complete' : 'error');

        return (
          <div className="message tool-result-message">
            <div className={`tool-result standalone taskoutput-result ${statusClass}`}>
              <div className="taskoutput-header">
                <StatusIcon size={12} stroke={1.5} className={`status-icon ${statusClass}`} />
                <span className="taskoutput-status">{isRunning ? 'agent working' : taskStatus}</span>
                {taskId && <span className="taskoutput-id">{taskId.slice(0, 7)}</span>}
              </div>
              {displayCalls.length > 0 && (
                <div className="taskoutput-tools">
                  {hiddenCalls > 0 && (
                    <div className="taskoutput-hidden">+ {hiddenCalls} earlier calls</div>
                  )}
                  {displayCalls.map((call, i) => {
                    // Parse [Tool: Name] {input}
                    const toolMatch = call.match(/\[Tool: (\w+)\] ({.*})?/);
                    if (!toolMatch) return null;
                    const toolName = toolMatch[1];
                    const toolInput = toolMatch[2];

                    // Parse input json for display
                    let detail = '';
                    try {
                      if (toolInput) {
                        const parsed = JSON.parse(toolInput);
                        // Show relevant detail based on tool type
                        if (parsed.pattern) detail = parsed.pattern;
                        else if (parsed.file_path) detail = formatPath(parsed.file_path);
                        else if (parsed.query) detail = parsed.query.slice(0, 40) + (parsed.query.length > 40 ? '...' : '');
                        else if (parsed.command) detail = parsed.command.slice(0, 40) + (parsed.command.length > 40 ? '...' : '');
                      }
                    } catch {}

                    return (
                      <div key={i} className="taskoutput-tool-call">
                        <span className="tool-name">{toolName}</span>
                        {detail && <span className="tool-detail">{detail}</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      }

      // ===== EXITPLANMODE / KILLBASH - Simple confirmation =====
      if (resultToolName === 'ExitPlanMode') {
        return (
          <div className="message tool-result-message">
            <div className="tool-result standalone simple-confirm">
              <IconCheck size={12} stroke={2} className="result-icon success" />
              <span className="result-text">plan mode exited</span>
            </div>
          </div>
        );
      }

      if (resultToolName === 'KillBash') {
        const shellId = associatedToolUse?.message?.input?.shell_id || 'session';
        return (
          <div className="message tool-result-message">
            <div className="tool-result standalone simple-confirm">
              <IconPlayerStop size={12} stroke={1.5} className="result-icon" />
              <span className="result-text">bash {shellId} stopped</span>
            </div>
          </div>
        );
      }

      // ===== GENERIC FALLBACK - Clean display without line numbers =====
      if (contentStr) {
        const allLines = contentStr.split('\n');
        const MAX_LINES = 10;
        const visibleLines = allLines.slice(0, MAX_LINES);
        const hiddenCount = allLines.length - MAX_LINES;
        const hasMore = hiddenCount > 0;

        // Hide TodoWrite success messages in generic fallback too
        if (contentStr.includes('Todos have been modified successfully') ||
            contentStr.includes('Ensure that you continue to use the todo list')) {
          return null;
        }

        return (
          <div className="message tool-result-message">
            <div className="tool-result standalone generic-output">
              <pre className="result-content">
                {visibleLines.map((line, i) => (
                  <div key={i} className="result-line">{line}</div>
                ))}
              </pre>
              {hasMore && (
                <div className="result-more">+ {hiddenCount} more lines</div>
              )}
            </div>
          </div>
        );
      }

      // If we get here and still have no content, return null
      return null;
      
    case 'result':
      console.log('[MessageRenderer] RENDERING RESULT MESSAGE:', {
        id: message.id,
        type: message.type,
        subtype: message.subtype,
        is_error: message.is_error,
        success: message.success,
        hasUsage: !!message.usage,
        hasDuration: !!message.duration_ms
      });
      
      // Check if this is actually a success
      // Claude CLI uses is_error:false for success - this is the primary indicator
      // Also check explicit success subtype or success field
      // Additionally, check result content for success patterns (like edit completions)
      // IMPORTANT: looksLikeSuccess should OVERRIDE is_error since Claude sometimes sets it incorrectly
      const resultText = message.result || '';
      const looksLikeSuccess = resultText.includes('has been updated') ||
                               resultText.includes('successfully') ||
                               resultText.includes('Applied') ||
                               resultText.includes('created') ||
                               resultText.includes('→');
      // FIX: Use !message.is_error (falsy check) instead of === false (strict equality)
      // This handles undefined/null/false all as success
      const isSuccess = !message.is_error ||
                       message.subtype === 'success' ||
                       message.success === true ||
                       looksLikeSuccess;  // looksLikeSuccess overrides is_error
      
      if (isSuccess) {
        // Debug log to see what fields we have
        console.log('[MessageRenderer] Result SUCCESS - showing stats:', {
          duration_ms: message.duration_ms,
          usage: message.usage,
          model: message.model,
          total_cost_usd: message.total_cost_usd,
          fullMessage: message
        });
        
        // Show elapsed time for successful completion
        const elapsedMs = message.duration_ms || (message.message as any)?.duration_ms || message.duration || 0;
        const elapsedSeconds = (elapsedMs / 1000).toFixed(1);
        const totalTokens = message.usage ? (message.usage.input_tokens + message.usage.output_tokens) : 0;
        
        
        // Count tool uses in the current conversation turn only
        // Look back through messages to count tool_use messages since the last user message
        const currentIndex = sessionMessages.findIndex(m => m === message);
        let toolCount = 0;
        let hasAssistantMessage = false;
        if (currentIndex > 0) {
          // Go backwards from result to find tool uses in this turn
          for (let i = currentIndex - 1; i >= 0; i--) {
            const msg = sessionMessages[i];
            if (msg.type === 'user') {
              // Stop at the user message that triggered this response
              break;
            }
            // Check if there's an assistant message with text content
            if (msg.type === 'assistant' && msg.message?.content) {
              const content = msg.message.content;
              if (typeof content === 'string' && content.trim()) {
                hasAssistantMessage = true;
              } else if (Array.isArray(content)) {
                const hasText = content.some(block => block.type === 'text' && block.text?.trim());
                if (hasText) {
                  hasAssistantMessage = true;
                }
                toolCount += content.filter(block => block.type === 'tool_use').length;
              }
            }
            if (msg.type === 'tool_use') {
              toolCount++;
            }
          }
        }
        
        // Only show result text if there's no assistant message with text content
        let resultText = message.result || '';
        
        // Parse JSON content blocks if present
        if (resultText && typeof resultText === 'string' && resultText.startsWith('[')) {
          try {
            const parsed = JSON.parse(resultText);
            if (Array.isArray(parsed)) {
              // Extract text from content blocks
              const textContent = parsed
                .filter(block => block.type === 'text')
                .map(block => block.text)
                .join('\n')
                .trim();
              if (textContent) {
                resultText = textContent;
              }
            }
          } catch (e) {
            // Not JSON or parsing failed, use as-is
          }
        }
        
        // Always show compact results, otherwise only show if no assistant message
        const isCompactResult = message.wrapper_compact || resultText.includes('Conversation compacted');
        const showResultText = resultText && (isCompactResult || !hasAssistantMessage);

        // Render beautiful compact summary card for compaction results
        if (isCompactResult && message.wrapper_compact) {
          const compactData = message.wrapper_compact;
          const savedTokens = compactData.savedTokens || 0;
          const totalSaved = compactData.totalSaved || savedTokens;
          const compactCount = compactData.compactCount || 1;

          // Format token count nicely
          const formatTokens = (tokens: number) => {
            if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
            if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`;
            return tokens.toLocaleString();
          };

          return (
            <div className="message result-success">
              <div className="compact-summary-card">
                <div className="compact-summary-header">
                  <IconChevronsRight size={14} className="compact-summary-icon" />
                  <div className="compact-summary-title">context compacted</div>
                </div>

                <div className="compact-stats">
                  <div className="compact-stat">
                    <div className="compact-stat-value">{formatTokens(savedTokens)}</div>
                    <div className="compact-stat-label">freed</div>
                  </div>
                  <div className="compact-stat">
                    <div className="compact-stat-value">{formatTokens(totalSaved)}</div>
                    <div className="compact-stat-label">total</div>
                  </div>
                  <div className="compact-stat">
                    <div className="compact-stat-value">{compactCount}x</div>
                  </div>
                </div>

                {resultText && (
                  <div className="compact-summary-content">
                    <div className="compact-summary-text">
                      <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>
                        {resultText}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>
              <div className="elapsed-time">
                {elapsedSeconds}s
                {message.model && ` • ${
                  message.model.includes('opus') ? 'opus 4.5' :
                  message.model.includes('sonnet') ? 'sonnet 4.5' :
                  message.model
                }`}
              </div>
            </div>
          );
        }

        return (
          <div className="message result-success">
            {showResultText && (
              <div className="assistant-bubble">
                <div className="message-content">
                  <div className="markdown-content"><ReactMarkdown
                    remarkPlugins={REMARK_PLUGINS}
                    components={{
                      code: ({className, children, ...props}) => {
                        const match = /language-(\w+)/.exec(className || '');
                        const isInline = !className?.startsWith('language-');
                        return !isInline && match ? (
                          <div className="code-block-wrapper">
                            <div className="code-header">
                              <span className="code-language">{match[1]}</span>
                              <button
                                className="copy-button"
                                onClick={() => handleCopyCode(String(children).replace(/\n$/, ''))}
                                title="copy code"
                              >
                                <IconCopy size={12} />
                              </button>
                            </div>
                            <SyntaxHighlighter
                              style={customVs2015 as any}
                              language={match[1]}
                              PreTag="div"
                              customStyle={{
                                margin: 0,
                                borderRadius: 0,
                                background: '#0f0f0f',
                                fontSize: '10px',
                              }}
                            >
                              {String(children).replace(/\n$/, '')}
                            </SyntaxHighlighter>
                          </div>
                        ) : (
                          <code className={className} {...props}>
                            {children}
                          </code>
                        );
                      },
                      a: ({children}) => (
                        <>{children}</>
                      ),
                      blockquote: ({node, children, ...props}) => (
                        <blockquote className="markdown-blockquote" {...props}>
                          {children}
                        </blockquote>
                      ),
                      ul: ({node, children, ...props}) => (
                        <ul className="markdown-list" {...props}>
                          {children}
                        </ul>
                      ),
                      ol: ({node, children, ...props}) => (
                        <ol className="markdown-list" {...props}>
                          {children}
                        </ol>
                      ),
                      table: ({node, children, ...props}) => (
                        <div className="table-wrapper">
                          <table className="markdown-table" {...props}>
                            {children}
                          </table>
                        </div>
                      ),
                    }}
                  >
                    {resultText}
                  </ReactMarkdown></div>
                </div>
              </div>
            )}
            <div className="elapsed-time">
              {elapsedSeconds}s
              {totalTokens > 0 && ` • ${totalTokens.toLocaleString()} tokens`}
              {toolCount > 0 && ` • ${toolCount} tool${toolCount !== 1 ? 's' : ''}`}
              {message.total_cost_usd && message.total_cost_usd > 0 && ` • $${message.total_cost_usd.toFixed(4)}`}
              {message.model && ` • ${
                message.model.includes('opus') ? 'opus 4.5' :
                message.model.includes('sonnet') ? 'sonnet 4.5' :
                message.model
              }`}
            </div>
          </div>
        );
      } else if (message.is_error && !looksLikeSuccess) {
        // Only show error if is_error is true AND result doesn't look like success
        return (
          <div className="message result-error">
            <IconAlertTriangle size={14} stroke={1.5} className="error-icon" />
            <span className="error-text">
              {message.subtype === 'error_max_turns' ? 'max turns reached' : 'error during execution'}
            </span>
          </div>
        );
      }
      return null;
      
    case 'permission':
      // Hide permission request messages
      return null;
      
    case 'tool_approval':
      return (
        <div className="message tool-approval">
          {message.granted ? (
            <IconCheck size={14} stroke={1.5} className="approval-icon approved" />
          ) : (
            <IconX size={14} stroke={1.5} className="approval-icon denied" />
          )}
          <span className="approval-text">
            tool {message.tool} {message.granted ? 'approved' : 'denied'}
          </span>
        </div>
      );
      
    default:
      return null;
  }
};

// Efficient content comparison without JSON.stringify
const areContentsEqual = (prevContent: any, nextContent: any): boolean => {
  // Same reference = same content
  if (prevContent === nextContent) return true;

  // Different types = different content
  if (typeof prevContent !== typeof nextContent) return false;

  // String comparison
  if (typeof prevContent === 'string') {
    return prevContent === nextContent;
  }

  // Array comparison (for ContentBlock[])
  if (Array.isArray(prevContent) && Array.isArray(nextContent)) {
    // Different lengths = different content
    if (prevContent.length !== nextContent.length) return false;

    // Empty arrays are equal
    if (prevContent.length === 0) return true;

    // For streaming, the last block changes most frequently
    // Check last block first for early bailout
    const lastPrev = prevContent[prevContent.length - 1];
    const lastNext = nextContent[nextContent.length - 1];

    // Compare text content of last blocks (most common case during streaming)
    if (lastPrev?.type !== lastNext?.type) return false;
    if (lastPrev?.text !== lastNext?.text) return false;

    // For short arrays, do full comparison
    if (prevContent.length <= 3) {
      for (let i = 0; i < prevContent.length - 1; i++) {
        if (prevContent[i]?.type !== nextContent[i]?.type) return false;
        if (prevContent[i]?.text !== nextContent[i]?.text) return false;
      }
    }

    return true;
  }

  // Fallback: assume different (will trigger re-render to be safe)
  return false;
};

// Export memoized version for performance
export const MessageRenderer = memo(MessageRendererBase, (prevProps, nextProps) => {
  // Custom comparison - only re-render if message content or streaming state changes
  const idEqual = prevProps.message.id === nextProps.message.id;
  const streamingEqual = prevProps.message.streaming === nextProps.message.streaming;
  const isStreamingEqual = prevProps.isStreaming === nextProps.isStreaming;
  const contentsEqual = areContentsEqual(prevProps.message.message?.content, nextProps.message.message?.content);

  // Debug bash messages
  if (nextProps.message.id?.startsWith('bash-')) {
    console.log('[MEMO] Bash message comparison:', {
      id: nextProps.message.id,
      idEqual,
      streamingEqual,
      isStreamingEqual,
      contentsEqual,
      prevContent: JSON.stringify(prevProps.message.message?.content)?.substring(0, 50),
      nextContent: JSON.stringify(nextProps.message.message?.content)?.substring(0, 50),
      willSkipRender: idEqual && streamingEqual && isStreamingEqual && contentsEqual
    });
  }

  return (
    idEqual &&
    streamingEqual &&
    prevProps.isStreaming === nextProps.isStreaming &&
    areContentsEqual(prevProps.message.message?.content, nextProps.message.message?.content)
  );
});