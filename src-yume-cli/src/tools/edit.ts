/**
 * Edit tool implementation
 * With path validation to prevent traversal attacks
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ToolDefinition, ToolExecutor, ToolResult } from '../types.js';
import { validatePathForWrite } from '../core/pathSecurity.js';

export const editToolDefinition: ToolDefinition = {
  name: 'Edit',
  description:
    'Performs exact string replacement in a file. The old_string must match exactly.',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'The absolute path to the file to modify',
      },
      old_string: {
        type: 'string',
        description: 'The exact string to find and replace',
      },
      new_string: {
        type: 'string',
        description: 'The string to replace old_string with',
      },
      replace_all: {
        type: 'boolean',
        description: 'Replace all occurrences (default: false)',
      },
    },
    required: ['file_path', 'old_string', 'new_string'],
  },
};

export const editTool: ToolExecutor = {
  name: 'Edit',
  async execute(
    input: Record<string, unknown>,
    cwd: string
  ): Promise<ToolResult> {
    const filePath = input.file_path as string;
    const oldString = input.old_string as string;
    const newString = input.new_string as string;
    const replaceAll = (input.replace_all as boolean) || false;

    // Validate path for security (writes must stay within cwd)
    const validation = validatePathForWrite(filePath, cwd);
    if (!validation.valid) {
      return {
        toolUseId: '',
        content: validation.error || 'Path validation failed',
        isError: true,
      };
    }
    const resolvedPath = validation.resolvedPath;

    try {
      // Read existing content
      const content = await fs.readFile(resolvedPath, 'utf-8');

      // Check if old_string exists
      if (!content.includes(oldString)) {
        return {
          toolUseId: '',
          content: `String not found in file: "${oldString.slice(0, 100)}${oldString.length > 100 ? '...' : ''}"`,
          isError: true,
        };
      }

      // Check for uniqueness if not replacing all
      if (!replaceAll) {
        const occurrences = content.split(oldString).length - 1;
        if (occurrences > 1) {
          return {
            toolUseId: '',
            content: `String appears ${occurrences} times in file. Use replace_all=true or provide more context to make it unique.`,
            isError: true,
          };
        }
      }

      // Perform replacement
      let newContent: string;
      let replacementCount: number;

      if (replaceAll) {
        const parts = content.split(oldString);
        replacementCount = parts.length - 1;
        newContent = parts.join(newString);
      } else {
        newContent = content.replace(oldString, newString);
        replacementCount = 1;
      }

      // Write back
      await fs.writeFile(resolvedPath, newContent, 'utf-8');

      return {
        toolUseId: '',
        content: `Successfully replaced ${replacementCount} occurrence(s) in ${resolvedPath}`,
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
      return {
        toolUseId: '',
        content: `Error editing file: ${err.message}`,
        isError: true,
      };
    }
  },
};
