/**
 * LS tool implementation
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ToolDefinition, ToolExecutor, ToolResult } from '../types.js';

export const lsToolDefinition: ToolDefinition = {
  name: 'LS',
  description: 'List directory contents with file types and sizes.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The directory path to list. Defaults to current directory.',
      },
    },
    required: [],
  },
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}G`;
}

export const lsTool: ToolExecutor = {
  name: 'LS',
  async execute(
    input: Record<string, unknown>,
    cwd: string
  ): Promise<ToolResult> {
    const dirPath = (input.path as string) || cwd;

    // Resolve path relative to cwd if not absolute
    const resolvedPath = path.isAbsolute(dirPath)
      ? dirPath
      : path.resolve(cwd, dirPath);

    try {
      const entries = await fs.readdir(resolvedPath, { withFileTypes: true });

      // Get stats for each entry
      const entriesWithStats = await Promise.all(
        entries.map(async (entry) => {
          const fullPath = path.join(resolvedPath, entry.name);
          try {
            const stat = await fs.stat(fullPath);
            return {
              name: entry.name,
              isDir: entry.isDirectory(),
              size: stat.size,
              mtime: stat.mtime,
            };
          } catch {
            return {
              name: entry.name,
              isDir: entry.isDirectory(),
              size: 0,
              mtime: new Date(0),
            };
          }
        })
      );

      // Sort: directories first, then alphabetically
      entriesWithStats.sort((a, b) => {
        if (a.isDir && !b.isDir) return -1;
        if (!a.isDir && b.isDir) return 1;
        return a.name.localeCompare(b.name);
      });

      // Format output
      const lines = entriesWithStats.map((entry) => {
        const type = entry.isDir ? 'd' : '-';
        const size = entry.isDir ? '-' : formatSize(entry.size);
        return `${type} ${size.padStart(8)} ${entry.name}${entry.isDir ? '/' : ''}`;
      });

      if (lines.length === 0) {
        return {
          toolUseId: '',
          content: '(empty directory)',
        };
      }

      return {
        toolUseId: '',
        content: lines.join('\n'),
      };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return {
          toolUseId: '',
          content: `Directory not found: ${resolvedPath}`,
          isError: true,
        };
      }
      if (err.code === 'ENOTDIR') {
        return {
          toolUseId: '',
          content: `Not a directory: ${resolvedPath}`,
          isError: true,
        };
      }
      return {
        toolUseId: '',
        content: `Error listing directory: ${err.message}`,
        isError: true,
      };
    }
  },
};
