/**
 * Glob tool implementation
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ToolDefinition, ToolExecutor, ToolResult } from '../types.js';

export const globToolDefinition: ToolDefinition = {
  name: 'Glob',
  description:
    'Fast file pattern matching tool. Supports glob patterns like "**/*.js" or "src/**/*.ts".',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'The glob pattern to match files against',
      },
      path: {
        type: 'string',
        description:
          'The directory to search in. Defaults to current working directory.',
      },
    },
    required: ['pattern'],
  },
};

/**
 * Simple glob matcher
 * Supports: *, **, ?
 */
function matchGlob(pattern: string, filePath: string): boolean {
  // Convert glob pattern to regex
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '.')
    .replace(/\{\{GLOBSTAR\}\}/g, '.*');

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(filePath);
}

/**
 * Recursively list all files in a directory
 */
async function listFilesRecursive(
  dir: string,
  baseDir: string
): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(baseDir, fullPath);

      // Skip hidden files and common ignore patterns
      if (
        entry.name.startsWith('.') ||
        entry.name === 'node_modules' ||
        entry.name === 'dist' ||
        entry.name === 'build' ||
        entry.name === 'target'
      ) {
        continue;
      }

      if (entry.isDirectory()) {
        const subFiles = await listFilesRecursive(fullPath, baseDir);
        files.push(...subFiles);
      } else {
        files.push(relativePath);
      }
    }
  } catch {
    // Ignore permission errors
  }

  return files;
}

export const globTool: ToolExecutor = {
  name: 'Glob',
  async execute(
    input: Record<string, unknown>,
    cwd: string
  ): Promise<ToolResult> {
    const pattern = input.pattern as string;
    const searchPath = (input.path as string) || cwd;

    // Resolve path relative to cwd if not absolute
    const resolvedPath = path.isAbsolute(searchPath)
      ? searchPath
      : path.resolve(cwd, searchPath);

    try {
      // Check if directory exists
      const stat = await fs.stat(resolvedPath);
      if (!stat.isDirectory()) {
        return {
          toolUseId: '',
          content: `Path is not a directory: ${resolvedPath}`,
          isError: true,
        };
      }

      // List all files recursively
      const allFiles = await listFilesRecursive(resolvedPath, resolvedPath);

      // Filter by pattern
      const matchedFiles = allFiles.filter((file) => matchGlob(pattern, file));

      // Sort by modification time (newest first)
      const filesWithStats = await Promise.all(
        matchedFiles.map(async (file) => {
          const fullPath = path.join(resolvedPath, file);
          try {
            const stat = await fs.stat(fullPath);
            return { file, mtime: stat.mtime.getTime() };
          } catch {
            return { file, mtime: 0 };
          }
        })
      );

      filesWithStats.sort((a, b) => b.mtime - a.mtime);

      // Limit results
      const limitedFiles = filesWithStats.slice(0, 100);

      if (limitedFiles.length === 0) {
        return {
          toolUseId: '',
          content: `No files found matching pattern: ${pattern}`,
        };
      }

      const result = limitedFiles.map((f) => f.file).join('\n');
      return {
        toolUseId: '',
        content:
          result +
          (matchedFiles.length > 100
            ? `\n... and ${matchedFiles.length - 100} more files`
            : ''),
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
      return {
        toolUseId: '',
        content: `Error searching files: ${err.message}`,
        isError: true,
      };
    }
  },
};
