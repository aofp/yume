/**
 * Read tool implementation
 * With path validation to prevent traversal attacks
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ToolDefinition, ToolExecutor, ToolResult } from '../types.js';
import { validatePathForRead } from '../core/pathSecurity.js';

export const readToolDefinition: ToolDefinition = {
  name: 'Read',
  description:
    'Reads a file from the local filesystem. Returns the file contents with line numbers.',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'The absolute path to the file to read',
      },
      offset: {
        type: 'number',
        description: 'The line number to start reading from (1-indexed)',
      },
      limit: {
        type: 'number',
        description: 'The number of lines to read',
      },
    },
    required: ['file_path'],
  },
};

export const readTool: ToolExecutor = {
  name: 'Read',
  async execute(
    input: Record<string, unknown>,
    cwd: string
  ): Promise<ToolResult> {
    const filePath = input.file_path as string;
    const offset = (input.offset as number) || 1;
    const limit = (input.limit as number) || 2000;

    // Validate path for security
    const validation = validatePathForRead(filePath, cwd);
    if (!validation.valid) {
      return {
        toolUseId: '',
        content: validation.error || 'Path validation failed',
        isError: true,
      };
    }
    const resolvedPath = validation.resolvedPath;

    try {
      const content = await fs.readFile(resolvedPath, 'utf-8');
      const lines = content.split('\n');

      // Apply offset and limit
      const startLine = Math.max(0, offset - 1);
      const endLine = Math.min(lines.length, startLine + limit);
      const selectedLines = lines.slice(startLine, endLine);

      // Format with line numbers (cat -n style)
      const formatted = selectedLines
        .map((line, idx) => {
          const lineNum = startLine + idx + 1;
          // Truncate long lines
          const truncatedLine =
            line.length > 2000 ? line.slice(0, 2000) + '...' : line;
          return `${String(lineNum).padStart(6)}\t${truncatedLine}`;
        })
        .join('\n');

      return {
        toolUseId: '',
        content: formatted,
      };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return {
          toolUseId: '',
          content: `File not found: ${resolvedPath}`,
          isError: true,
        };
      }
      if (err.code === 'EISDIR') {
        return {
          toolUseId: '',
          content: `Path is a directory, not a file: ${resolvedPath}`,
          isError: true,
        };
      }
      return {
        toolUseId: '',
        content: `Error reading file: ${err.message}`,
        isError: true,
      };
    }
  },
};
