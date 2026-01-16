/**
 * OpenAI provider implementation
 * Spawns codex CLI binary and parses JSONL output
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import type {
  ProviderType,
  ProviderChunk,
  HistoryMessage,
  ToolDefinition,
  ModelInfo,
} from '../types.js';
import { BaseProvider } from './base.js';
import { logVerbose } from '../core/emit.js';

// Timeout for process operations (5 minutes)
const PROCESS_TIMEOUT_MS = 5 * 60 * 1000;

// Counter for unique ID generation within same millisecond
let toolIdCounter = 0;

/**
 * Generate a unique tool ID to prevent collisions
 */
function generateToolId(itemId?: string): string {
  if (itemId) return itemId;
  toolIdCounter = (toolIdCounter + 1) % 10000;
  return `tool-${Date.now()}-${toolIdCounter.toString().padStart(4, '0')}`;
}

/**
 * Detect the most appropriate tool type from a command string
 * This helps the UI show the correct icon for codex operations
 */
function detectToolFromCommand(command: string): string {
  const cmd = command.trim().toLowerCase();

  // File reading patterns
  if (
    cmd.startsWith('cat ') ||
    cmd.startsWith('head ') ||
    cmd.startsWith('tail ') ||
    cmd.startsWith('less ') ||
    cmd.startsWith('more ')
  ) {
    return 'Read';
  }

  // File search patterns (glob)
  if (
    cmd.startsWith('find ') ||
    cmd.startsWith('fd ') ||
    cmd.includes('*.') // glob pattern
  ) {
    return 'Glob';
  }

  // Content search patterns (grep)
  if (
    cmd.startsWith('grep ') ||
    cmd.startsWith('rg ') ||
    cmd.startsWith('ag ') ||
    cmd.startsWith('ack ')
  ) {
    return 'Grep';
  }

  // Directory listing
  if (cmd.startsWith('ls ') || cmd === 'ls' || cmd.startsWith('tree ')) {
    return 'LS';
  }

  // File editing with sed/awk
  if (cmd.startsWith('sed ') || cmd.startsWith('awk ')) {
    return 'Edit';
  }

  // File creation
  if (cmd.startsWith('touch ') || cmd.includes(' > ') || cmd.includes(' >> ')) {
    return 'Write';
  }

  // Git operations
  if (cmd.startsWith('git ')) {
    return 'Bash';
  }

  // Web fetch
  if (cmd.startsWith('curl ') || cmd.startsWith('wget ') || cmd.startsWith('fetch ')) {
    return 'WebFetch';
  }

  // Default to Bash
  return 'Bash';
}

// OpenAI models
const OPENAI_MODELS: ModelInfo[] = [
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    contextWindow: 128000,
    maxOutput: 16384,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    contextWindow: 128000,
    maxOutput: 16384,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'o1',
    name: 'O1',
    provider: 'openai',
    contextWindow: 200000,
    maxOutput: 100000,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'o1-mini',
    name: 'O1 Mini',
    provider: 'openai',
    contextWindow: 128000,
    maxOutput: 65536,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'o3-mini',
    name: 'O3 Mini',
    provider: 'openai',
    contextWindow: 200000,
    maxOutput: 100000,
    supportsTools: true,
    supportsStreaming: true,
  },
];

export class OpenAIProvider extends BaseProvider {
  name: ProviderType = 'openai';
  private model: string;
  private cwd: string;
  private codexProcess: ChildProcess | null = null;

  constructor(model: string, cwd: string = process.cwd()) {
    super();
    this.model = model;
    this.cwd = cwd;
  }

  setCwd(cwd: string): void {
    this.cwd = cwd;
  }

  getModels(): ModelInfo[] {
    return OPENAI_MODELS;
  }

  protected formatHistory(_history: HistoryMessage[]): unknown[] {
    // Not used - we delegate to codex CLI
    return [];
  }

  protected formatTools(_tools: ToolDefinition[]): unknown[] {
    // Not used - we delegate to codex CLI
    return [];
  }

  async *generate(
    history: HistoryMessage[],
    _tools: ToolDefinition[]
  ): AsyncGenerator<ProviderChunk> {
    // Build the prompt from the last user message
    const lastUserMsg = [...history].reverse().find((m) => m.role === 'user');
    const prompt = lastUserMsg?.content || '';

    if (!prompt) {
      yield { type: 'text', text: 'Error: No prompt provided' };
      yield { type: 'done' };
      return;
    }

    // Build codex CLI arguments
    // Note: --full-auto enables auto-approval with workspace-write sandbox
    // This is safer than --dangerously-bypass-approvals-and-sandbox
    const args: string[] = [
      'exec',
      '--json',
      '-C',
      this.cwd,
      '--full-auto',
    ];

    // Only pass model if explicitly specified (not 'default' or empty)
    // ChatGPT accounts don't support custom models
    if (this.model && this.model !== 'default' && this.model !== 'auto') {
      args.push('-m', this.model);

      // Override reasoning effort for mini models (they don't support xhigh)
      // This overrides any global config setting in ~/.codex/config.toml
      if (this.model.includes('mini')) {
        args.push('-c', 'model_reasoning_effort="low"');
      }
    }

    args.push(prompt);

    logVerbose(`Spawning codex CLI: codex ${args.join(' ')}`);

    let spawnError: Error | null = null;

    this.codexProcess = spawn('codex', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: this.cwd,
      env: { ...process.env },
    });

    const proc = this.codexProcess;

    // Handle spawn errors - capture for later
    proc.on('error', (err) => {
      logVerbose(`codex spawn error: ${err.message}`);
      spawnError = err;
    });

    // Collect stderr for debugging
    let stderrData = '';
    proc.stderr?.on('data', (data) => {
      stderrData += data.toString();
      logVerbose(`codex stderr: ${data.toString().trim()}`);
    });

    try {
      // Check for immediate spawn failure
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => resolve(), 100);
        proc.on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
        proc.on('spawn', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      // Create readline interface for line-by-line JSONL parsing
      const rl = createInterface({
        input: proc.stdout!,
        crlfDelay: Infinity,
      });

      // Process each JSONL line
      for await (const line of rl) {
        // Check if spawn failed after starting
        if (spawnError !== null) {
          yield { type: 'text', text: `Error: ${(spawnError as Error).message}` };
          break;
        }

        if (!line.trim()) continue;

        try {
          const json = JSON.parse(line);

          // Handle codex CLI event types
          // Codex uses: thread.started, turn.started, item.completed, turn.completed

          // item.completed - contains actual content (text, reasoning, tool calls)
          if (json.type === 'item.completed' && json.item) {
            const item = json.item;

            // Agent message (text response)
            if (item.type === 'agent_message' && item.text) {
              yield { type: 'text', text: item.text };
            }

            // Reasoning (thinking)
            if (item.type === 'reasoning' && item.text) {
              yield { type: 'thinking', thinking: item.text };
            }

            // Tool use (command execution)
            if (item.type === 'command_execution') {
              const command = item.command || '';
              const toolId = generateToolId(item.id);
              // Detect tool type from command pattern
              const toolName = detectToolFromCommand(command);
              yield {
                type: 'tool_call',
                toolCall: {
                  id: toolId,
                  name: toolName,
                  arguments: JSON.stringify({ command }),
                },
              };
              // If there's output, emit tool result
              if (item.aggregated_output) {
                yield {
                  type: 'tool_result',
                  toolResult: {
                    id: toolId,
                    status: item.exit_code === 0 ? 'success' : 'error',
                    output: item.aggregated_output,
                    isError: item.exit_code !== 0,
                  },
                };
              }
            }

            // File read operations
            if (item.type === 'file_read') {
              const toolId = generateToolId(item.id);
              yield {
                type: 'tool_call',
                toolCall: {
                  id: toolId,
                  name: 'Read',
                  arguments: JSON.stringify({ file_path: item.path || '' }),
                },
              };
              // If there's content, emit tool result
              if (item.content !== undefined) {
                yield {
                  type: 'tool_result',
                  toolResult: {
                    id: toolId,
                    status: 'success',
                    output: typeof item.content === 'string' ? item.content : JSON.stringify(item.content),
                    isError: false,
                  },
                };
              }
            }

            // File operations (edit/write)
            if (item.type === 'file_edit' || item.type === 'file_write') {
              yield {
                type: 'tool_call',
                toolCall: {
                  id: generateToolId(item.id),
                  name: item.type === 'file_edit' ? 'Edit' : 'Write',
                  arguments: JSON.stringify({ file_path: item.path || '' }),
                },
              };
            }

            // Glob/file search
            if (item.type === 'file_search' || item.type === 'glob') {
              yield {
                type: 'tool_call',
                toolCall: {
                  id: generateToolId(item.id),
                  name: 'Glob',
                  arguments: JSON.stringify({ pattern: item.pattern || item.query || '' }),
                },
              };
            }

            // Grep/content search
            if (item.type === 'content_search' || item.type === 'grep') {
              yield {
                type: 'tool_call',
                toolCall: {
                  id: generateToolId(item.id),
                  name: 'Grep',
                  arguments: JSON.stringify({ pattern: item.pattern || item.query || '' }),
                },
              };
            }

            // Directory listing
            if (item.type === 'list_directory' || item.type === 'ls') {
              yield {
                type: 'tool_call',
                toolCall: {
                  id: generateToolId(item.id),
                  name: 'LS',
                  arguments: JSON.stringify({ path: item.path || '' }),
                },
              };
            }
          }

          // turn.completed - contains usage info
          if (json.type === 'turn.completed' && json.usage) {
            yield {
              type: 'usage',
              usage: {
                inputTokens: json.usage.input_tokens || 0,
                outputTokens: json.usage.output_tokens || 0,
                cacheReadTokens: json.usage.cached_input_tokens || 0,
              },
            };
          }

          // Error messages
          if (json.type === 'error') {
            yield { type: 'text', text: `Error: ${json.error?.message || 'Unknown error'}` };
          }
        } catch (parseError) {
          logVerbose(`Failed to parse codex JSONL: ${line}`);
        }
      }

      // Wait for process to exit with timeout
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          logVerbose('codex process timeout - killing');
          proc.kill();
          resolve();
        }, PROCESS_TIMEOUT_MS);

        proc.on('close', (code) => {
          clearTimeout(timeout);
          logVerbose(`codex CLI exited with code: ${code}`);
          if (code !== 0 && stderrData) {
            logVerbose(`codex stderr: ${stderrData}`);
          }
          resolve();
        });

        // Handle case where process already exited
        if (proc.exitCode !== null) {
          clearTimeout(timeout);
          resolve();
        }
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logVerbose(`codex generate error: ${errMsg}`);
      yield { type: 'text', text: `Error: ${errMsg}` };
    } finally {
      // Always cleanup process
      this.kill();
    }

    yield { type: 'done' };
  }

  /**
   * Kill the codex process if running
   */
  kill(): void {
    if (this.codexProcess && !this.codexProcess.killed) {
      this.codexProcess.kill();
      this.codexProcess = null;
    }
  }
}
