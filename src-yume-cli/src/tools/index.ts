/**
 * Tool registry for yume-cli
 * Provides Claude-compatible tool definitions and executors
 */

import type { ToolDefinition, ToolExecutor } from '../types.js';
import { readTool, readToolDefinition } from './file.js';
import { writeTool, writeToolDefinition } from './write.js';
import { editTool, editToolDefinition } from './edit.js';
import { globTool, globToolDefinition } from './glob.js';
import { grepTool, grepToolDefinition } from './grep.js';
import { bashTool, bashToolDefinition } from './bash.js';
import { lsTool, lsToolDefinition } from './ls.js';

// All available tools
export const toolExecutors: ToolExecutor[] = [
  readTool,
  writeTool,
  editTool,
  globTool,
  grepTool,
  bashTool,
  lsTool,
];

export const toolDefinitions: ToolDefinition[] = [
  readToolDefinition,
  writeToolDefinition,
  editToolDefinition,
  globToolDefinition,
  grepToolDefinition,
  bashToolDefinition,
  lsToolDefinition,
];

/**
 * Get a tool executor by name
 */
export function getToolExecutor(name: string): ToolExecutor | undefined {
  return toolExecutors.find((t) => t.name === name);
}

/**
 * Get a tool definition by name
 */
export function getToolDefinition(name: string): ToolDefinition | undefined {
  return toolDefinitions.find((t) => t.name === name);
}

/**
 * Get tool names for system init message
 */
export function getToolNames(): string[] {
  return toolDefinitions.map((t) => t.name);
}
