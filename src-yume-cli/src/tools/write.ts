/**
 * Write tool implementation
 * With path validation to prevent traversal attacks
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ToolDefinition, ToolExecutor, ToolResult } from '../types.js';
import { validatePathForWrite } from '../core/pathSecurity.js';

export const writeToolDefinition: ToolDefinition = {
  name: 'Write',
  description:
    'Writes content to a file. Creates the file if it does not exist, overwrites if it does.',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'The absolute path to the file to write',
      },
      content: {
        type: 'string',
        description: 'The content to write to the file',
      },
    },
    required: ['file_path', 'content'],
  },
};

export const writeTool: ToolExecutor = {
  name: 'Write',
  async execute(
    input: Record<string, unknown>,
    cwd: string
  ): Promise<ToolResult> {
    const filePath = input.file_path as string;
    const content = input.content as string;

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
      // Ensure parent directory exists
      const dir = path.dirname(resolvedPath);
      await fs.mkdir(dir, { recursive: true });

      // Write file
      await fs.writeFile(resolvedPath, content, 'utf-8');

      return {
        toolUseId: '',
        content: `Successfully wrote ${content.length} characters to ${resolvedPath}`,
      };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      return {
        toolUseId: '',
        content: `Error writing file: ${err.message}`,
        isError: true,
      };
    }
  },
};
