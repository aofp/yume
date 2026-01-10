/**
 * Claude CLI Tools Configuration
 * Used for tool selection modal and session creation
 */

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  dangerous?: boolean; // tools that can modify system
}

export type ToolCategory = 'file-read' | 'file-write' | 'terminal' | 'web' | 'agents' | 'other';

export const TOOL_CATEGORIES: Record<ToolCategory, { name: string; order: number }> = {
  'file-read': { name: 'read', order: 1 },
  'file-write': { name: 'write', order: 2 },
  terminal: { name: 'terminal', order: 3 },
  web: { name: 'web', order: 4 },
  agents: { name: 'agents', order: 5 },
  other: { name: 'other', order: 6 },
};

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
    other: [],
  };

  for (const tool of ALL_TOOLS) {
    grouped[tool.category].push(tool);
  }

  return grouped;
}

// localStorage key for tool settings
export const TOOLS_STORAGE_KEY = 'yurucode-enabled-tools';

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
