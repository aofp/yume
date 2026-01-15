/**
 * Grep tool implementation
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ToolDefinition, ToolExecutor, ToolResult } from '../types.js';

export const grepToolDefinition: ToolDefinition = {
  name: 'Grep',
  description:
    'Search for patterns in files. Supports regex patterns.',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'The regular expression pattern to search for',
      },
      path: {
        type: 'string',
        description: 'File or directory to search in. Defaults to current directory.',
      },
      glob: {
        type: 'string',
        description: 'Glob pattern to filter files (e.g., "*.js", "*.{ts,tsx}")',
      },
    },
    required: ['pattern'],
  },
};

/**
 * Simple glob matcher for file filtering
 */
function matchGlob(pattern: string, filename: string): boolean {
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '.')
    .replace(/\{\{GLOBSTAR\}\}/g, '.*')
    .replace(/\{([^}]+)\}/g, (_, group) => `(${group.replace(/,/g, '|')})`);

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(filename);
}

/**
 * Recursively list all files in a directory
 */
async function listFilesRecursive(dir: string): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

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
        const subFiles = await listFilesRecursive(fullPath);
        files.push(...subFiles);
      } else {
        files.push(fullPath);
      }
    }
  } catch {
    // Ignore permission errors
  }

  return files;
}

interface GrepMatch {
  file: string;
  line: number;
  content: string;
}

export const grepTool: ToolExecutor = {
  name: 'Grep',
  async execute(
    input: Record<string, unknown>,
    cwd: string
  ): Promise<ToolResult> {
    const pattern = input.pattern as string;
    const searchPath = (input.path as string) || cwd;
    const globPattern = input.glob as string | undefined;

    // Resolve path relative to cwd if not absolute
    const resolvedPath = path.isAbsolute(searchPath)
      ? searchPath
      : path.resolve(cwd, searchPath);

    try {
      // Create regex
      let regex: RegExp;
      try {
        regex = new RegExp(pattern, 'gi');
      } catch {
        return {
          toolUseId: '',
          content: `Invalid regex pattern: ${pattern}`,
          isError: true,
        };
      }

      // Get files to search
      let filesToSearch: string[];
      const stat = await fs.stat(resolvedPath);

      if (stat.isFile()) {
        filesToSearch = [resolvedPath];
      } else {
        filesToSearch = await listFilesRecursive(resolvedPath);
      }

      // Filter by glob pattern if provided
      if (globPattern) {
        filesToSearch = filesToSearch.filter((f) =>
          matchGlob(globPattern, path.basename(f))
        );
      }

      // Search files
      const matches: GrepMatch[] = [];
      const MAX_MATCHES = 100;

      for (const file of filesToSearch) {
        if (matches.length >= MAX_MATCHES) break;

        try {
          const content = await fs.readFile(file, 'utf-8');
          const lines = content.split('\n');

          for (let i = 0; i < lines.length; i++) {
            if (matches.length >= MAX_MATCHES) break;

            if (regex.test(lines[i])) {
              matches.push({
                file: path.relative(cwd, file),
                line: i + 1,
                content: lines[i].slice(0, 200),
              });
            }
            // Reset regex state for global flag
            regex.lastIndex = 0;
          }
        } catch {
          // Skip binary or unreadable files
        }
      }

      if (matches.length === 0) {
        return {
          toolUseId: '',
          content: `No matches found for pattern: ${pattern}`,
        };
      }

      // Format results
      const result = matches
        .map((m) => `${m.file}:${m.line}: ${m.content}`)
        .join('\n');

      return {
        toolUseId: '',
        content:
          result +
          (matches.length >= MAX_MATCHES
            ? `\n... (truncated at ${MAX_MATCHES} matches)`
            : ''),
      };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return {
          toolUseId: '',
          content: `Path not found: ${resolvedPath}`,
          isError: true,
        };
      }
      return {
        toolUseId: '',
        content: `Error searching: ${err.message}`,
        isError: true,
      };
    }
  },
};
