/**
 * Bash tool implementation
 * With command validation to prevent injection attacks
 */

import { spawn } from 'node:child_process';
import * as path from 'node:path';
import type { ToolDefinition, ToolExecutor, ToolResult } from '../types.js';

export const bashToolDefinition: ToolDefinition = {
  name: 'Bash',
  description:
    'Executes a bash command. Use for git, npm, and other terminal operations.',
  inputSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The command to execute',
      },
      timeout: {
        type: 'number',
        description: 'Optional timeout in milliseconds (max 600000, default 120000)',
      },
    },
    required: ['command'],
  },
};

const DEFAULT_TIMEOUT = 120000; // 2 minutes
const MAX_TIMEOUT = 600000; // 10 minutes
const MAX_OUTPUT = 100000; // 100KB

// Allowed command prefixes for safety
// These are common development commands that are safe to run
const ALLOWED_COMMANDS = [
  'git', 'npm', 'npx', 'yarn', 'pnpm', 'node', 'python', 'python3',
  'pip', 'pip3', 'cargo', 'rustc', 'go', 'make', 'cmake',
  'ls', 'pwd', 'cd', 'mkdir', 'cp', 'mv', 'touch', 'chmod',
  'cat', 'head', 'tail', 'grep', 'find', 'which', 'whereis',
  'echo', 'printf', 'true', 'false', 'test', '[',
  'sort', 'uniq', 'wc', 'diff', 'patch',
  'curl', 'wget', 'tar', 'gzip', 'gunzip', 'zip', 'unzip',
  'docker', 'docker-compose', 'kubectl',
  'tsc', 'esbuild', 'vite', 'webpack', 'rollup', 'babel',
  'jest', 'vitest', 'mocha', 'pytest', 'cargo test',
  'eslint', 'prettier', 'rustfmt', 'black', 'ruff',
  'brew', 'apt', 'apt-get', 'yum', 'pacman', // package managers (read ops)
];

// Blocked patterns - commands that should never run
const BLOCKED_PATTERNS = [
  /\brm\s+-rf\s+[\/~]/, // rm -rf / or ~
  /\b(sudo|su)\b/, // privilege escalation
  />\s*\/dev\/sd/, // write to disk devices
  /\bdd\s+.*of=\/dev/, // dd to devices
  /\bmkfs\b/, // format filesystems
  /\bfdisk\b/, // partition tools
  /\bshutdown\b/, // shutdown
  /\breboot\b/, // reboot
  /\b(curl|wget).*\|\s*(ba)?sh/, // curl pipe to shell
  /\beval\b/, // eval dangerous input
  /\$\(.*\)/, // command substitution (potential injection)
  /`[^`]+`/, // backtick substitution
  /;\s*(rm|dd|mkfs|shutdown)/, // chained dangerous commands
  /&&\s*(rm|dd|mkfs|shutdown)/, // chained dangerous commands
  /\|\s*(rm|dd|mkfs|shutdown)/, // piped dangerous commands
  /env\s*\|/, // env piped (credential leak)
  /printenv/, // print environment (credential leak)
  /\bexport\s+.*KEY/, // exporting keys
  /\bexport\s+.*SECRET/, // exporting secrets
  /\bexport\s+.*TOKEN/, // exporting tokens
  /\bexport\s+.*PASSWORD/, // exporting passwords
];

/**
 * Validate command is safe to execute
 */
function validateCommand(command: string): { valid: boolean; error?: string } {
  const trimmed = command.trim();

  // Check for blocked patterns
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        valid: false,
        error: `Command blocked for security: matches dangerous pattern`,
      };
    }
  }

  // Extract first word (the command)
  const firstWord = trimmed.split(/\s+/)[0];

  // Allow if command starts with an allowed prefix
  const isAllowed = ALLOWED_COMMANDS.some(
    (allowed) => firstWord === allowed || firstWord.endsWith('/' + allowed)
  );

  if (!isAllowed) {
    // Also allow commands that are clearly paths to executables in cwd
    if (firstWord.startsWith('./') || firstWord.startsWith('../')) {
      return { valid: true };
    }

    return {
      valid: false,
      error: `Command '${firstWord}' not in allowed list. Allowed: ${ALLOWED_COMMANDS.slice(0, 10).join(', ')}...`,
    };
  }

  return { valid: true };
}

export const bashTool: ToolExecutor = {
  name: 'Bash',
  async execute(
    input: Record<string, unknown>,
    cwd: string
  ): Promise<ToolResult> {
    const command = input.command as string;
    const timeoutMs = Math.min(
      (input.timeout as number) || DEFAULT_TIMEOUT,
      MAX_TIMEOUT
    );

    // Validate command before execution
    const validation = validateCommand(command);
    if (!validation.valid) {
      return {
        toolUseId: '',
        content: validation.error || 'Command validation failed',
        isError: true,
      };
    }

    return new Promise((resolve) => {
      const isWindows = process.platform === 'win32';
      const shell = isWindows ? 'cmd.exe' : '/bin/bash';
      const shellArgs = isWindows ? ['/c', command] : ['-c', command];

      const proc = spawn(shell, shellArgs, {
        cwd,
        env: {
          ...process.env,
          // Ensure consistent output
          TERM: 'dumb',
          NO_COLOR: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let killed = false;

      // Set timeout
      const timeout = setTimeout(() => {
        killed = true;
        proc.kill('SIGKILL');
      }, timeoutMs);

      proc.stdout?.on('data', (data) => {
        const chunk = data.toString();
        if (stdout.length + chunk.length <= MAX_OUTPUT) {
          stdout += chunk;
        }
      });

      proc.stderr?.on('data', (data) => {
        const chunk = data.toString();
        if (stderr.length + chunk.length <= MAX_OUTPUT) {
          stderr += chunk;
        }
      });

      proc.on('close', (code) => {
        clearTimeout(timeout);

        let output = stdout;
        if (stderr) {
          output += stderr ? `\n[stderr]\n${stderr}` : '';
        }

        // Truncate if too long
        if (output.length > MAX_OUTPUT) {
          output = output.slice(0, MAX_OUTPUT) + '\n... (output truncated)';
        }

        if (killed) {
          resolve({
            toolUseId: '',
            content: `Command timed out after ${timeoutMs}ms\n${output}`,
            isError: true,
          });
        } else if (code !== 0) {
          resolve({
            toolUseId: '',
            content: `Command exited with code ${code}\n${output}`,
            isError: true,
          });
        } else {
          resolve({
            toolUseId: '',
            content: output || '(no output)',
          });
        }
      });

      proc.on('error', (error) => {
        clearTimeout(timeout);
        resolve({
          toolUseId: '',
          content: `Failed to execute command: ${error.message}`,
          isError: true,
        });
      });
    });
  },
};
