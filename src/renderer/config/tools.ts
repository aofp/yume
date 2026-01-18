/**
 * Claude CLI Tools Configuration
 * Used for tool selection modal and session creation
 */

import { appStorageKey } from './app';

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  dangerous?: boolean; // tools that can modify system
}

export type ToolCategory = 'file-read' | 'file-write' | 'terminal' | 'web' | 'agents' | 'mcp' | 'other';

export const TOOL_CATEGORIES = {
  'file-read': { name: 'read', order: 1 },
  'file-write': { name: 'write', order: 2 },
  terminal: { name: 'terminal', order: 3 },
  web: { name: 'web', order: 4 },
  agents: { name: 'agents', order: 5 },
  mcp: { name: 'mcp', order: 6 },
  other: { name: 'other', order: 7 },
} as const satisfies Record<ToolCategory, { name: string; order: number }>;

export const ALL_TOOLS: ToolDefinition[] = [
  // File Read Operations
  { id: 'Read', name: 'read', description: 'read files', category: 'file-read' },
  { id: 'Glob', name: 'glob', description: 'find files', category: 'file-read' },
  { id: 'Grep', name: 'grep', description: 'search content', category: 'file-read' },
  // File Write Operations
  { id: 'Write', name: 'write', description: 'create files', category: 'file-write', dangerous: true },
  { id: 'Edit', name: 'edit', description: 'modify files', category: 'file-write', dangerous: true },
  { id: 'NotebookEdit', name: 'notebook', description: 'edit jupyter', category: 'file-write', dangerous: true },

  // Terminal
  { id: 'Bash', name: 'bash', description: 'run commands', category: 'terminal', dangerous: true },
  { id: 'KillShell', name: 'killshell', description: 'stop shells', category: 'terminal' },

  // Web
  { id: 'WebFetch', name: 'webfetch', description: 'fetch urls', category: 'web' },
  { id: 'WebSearch', name: 'websearch', description: 'search web', category: 'web' },

  // Agents
  { id: 'Task', name: 'task', description: 'spawn agents', category: 'agents' },
  { id: 'TaskOutput', name: 'taskoutput', description: 'read agent output', category: 'agents' },

  // MCP (Model Context Protocol) - One toggle per server
  { id: 'mcp__memory', name: 'memory', description: 'knowledge graph server', category: 'mcp' },

  // Other
  { id: 'TodoWrite', name: 'todowrite', description: 'manage todos', category: 'other' },
  { id: 'Skill', name: 'skill', description: 'invoke skills', category: 'other' },
  { id: 'LSP', name: 'lsp', description: 'code intel', category: 'other' },
];

// Default enabled tools (all tools)
export const DEFAULT_ENABLED_TOOLS = ALL_TOOLS.map(t => t.id);

// Get tools grouped by category
export function getToolsByCategory(): Record<ToolCategory, ToolDefinition[]> {
  const grouped: Record<ToolCategory, ToolDefinition[]> = {
    'file-read': [],
    'file-write': [],
    terminal: [],
    web: [],
    agents: [],
    mcp: [],
    other: [],
  };

  for (const tool of ALL_TOOLS) {
    grouped[tool.category].push(tool);
  }

  return grouped;
}

// localStorage key for tool settings
export const TOOLS_STORAGE_KEY = appStorageKey('enabled-tools');

// Load enabled tools from localStorage
export function loadEnabledTools(): string[] {
  try {
    const stored = localStorage.getItem(TOOLS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Validate that all stored tools still exist
      return parsed.filter((id: string) => ALL_TOOLS.some(t => t.id === id));
    }
  } catch (e) {
    console.warn('Failed to load tool settings:', e);
  }
  return DEFAULT_ENABLED_TOOLS;
}

// Save enabled tools to localStorage
export function saveEnabledTools(tools: string[]): void {
  try {
    localStorage.setItem(TOOLS_STORAGE_KEY, JSON.stringify(tools));
  } catch (e) {
    console.warn('Failed to save tool settings:', e);
  }
}

// MCP server tool mappings - each server toggle expands to these actual tool IDs
export const MCP_SERVER_TOOLS: Record<string, string[]> = {
  'mcp__memory': [
    'mcp__memory__create_entities',
    'mcp__memory__create_relations',
    'mcp__memory__add_observations',
    'mcp__memory__delete_entities',
    'mcp__memory__search_nodes',
    'mcp__memory__open_nodes',
    'mcp__memory__read_graph',
  ],
};

// Expand MCP server toggles to actual tool IDs for CLI
export function expandMcpTools(enabledTools: string[]): string[] {
  const expanded: string[] = [];
  for (const toolId of enabledTools) {
    if (MCP_SERVER_TOOLS[toolId]) {
      // MCP server toggle - expand to all its tools
      expanded.push(...MCP_SERVER_TOOLS[toolId]);
    } else {
      expanded.push(toolId);
    }
  }
  return expanded;
}

// Get all MCP tool IDs (for computing disabled tools)
export function getAllMcpToolIds(): string[] {
  return Object.values(MCP_SERVER_TOOLS).flat();
}
