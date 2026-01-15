/**
 * Gemini provider implementation
 * Spawns the official gemini CLI and translates output to Claude-compatible format
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

// Tool name translation: Gemini CLI -> Claude format
const GEMINI_TO_CLAUDE_TOOLS: Record<string, string> = {
  'run_shell_command': 'Bash',
  'read_file': 'Read',
  'write_file': 'Write',
  'edit_file': 'Edit',
  'list_directory': 'LS',
  'find_files': 'Glob',
  'search_files': 'Grep',
  'glob': 'Glob',
  'grep': 'Grep',
  'ls': 'LS',
  'bash': 'Bash',
  'read': 'Read',
  'write': 'Write',
  'edit': 'Edit',
};

// Translate gemini tool name to claude format
function translateToolName(geminiName: string): string {
  return GEMINI_TO_CLAUDE_TOOLS[geminiName] || GEMINI_TO_CLAUDE_TOOLS[geminiName.toLowerCase()] || geminiName;
}

// Timeout for process operations (5 minutes)
const PROCESS_TIMEOUT_MS = 5 * 60 * 1000;

// Gemini models
const GEMINI_MODELS: ModelInfo[] = [
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    provider: 'gemini',
    contextWindow: 1000000,
    maxOutput: 8192,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'gemini',
    contextWindow: 1000000,
    maxOutput: 65536,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'gemini',
    contextWindow: 1000000,
    maxOutput: 65536,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'gemini-3-flash',
    name: 'Gemini 3 Flash',
    provider: 'gemini',
    contextWindow: 1000000,
    maxOutput: 65536,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'gemini-2.0-flash-thinking-exp',
    name: 'Gemini 2.0 Flash Thinking',
    provider: 'gemini',
    contextWindow: 32767,
    maxOutput: 8192,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    provider: 'gemini',
    contextWindow: 1000000,
    maxOutput: 8192,
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: 'gemini-1.5-flash',
    name: 'Gemini 1.5 Flash',
    provider: 'gemini',
    contextWindow: 1000000,
    maxOutput: 8192,
    supportsTools: true,
    supportsStreaming: true,
  },
];

export class GeminiProvider extends BaseProvider {
  name: ProviderType = 'gemini';
  private model: string;
  private cwd: string;
  private geminiProcess: ChildProcess | null = null;

  constructor(model: string, _apiBase?: string) {
    super();
    this.model = model;
    this.cwd = process.cwd();
  }

  setCwd(cwd: string): void {
    this.cwd = cwd;
  }

  getModels(): ModelInfo[] {
    return GEMINI_MODELS;
  }

  protected formatHistory(_history: HistoryMessage[]): unknown[] {
    // Not used - we delegate to gemini CLI
    return [];
  }

  protected formatTools(_tools: ToolDefinition[]): unknown[] {
    // Not used - we delegate to gemini CLI
    return [];
  }

  async *generate(
    history: HistoryMessage[],
    _tools: ToolDefinition[]
  ): AsyncGenerator<ProviderChunk> {
    // Get the last user message as the prompt
    const lastUserMsg = [...history].reverse().find((m) => m.role === 'user');
    const prompt = lastUserMsg?.content || '';

    if (!prompt) {
      yield { type: 'text', text: 'Error: No prompt provided' };
      yield { type: 'done' };
      return;
    }

    logVerbose(`Spawning gemini CLI with model: ${this.model}`);

    // Spawn gemini CLI with stream-json output
    const args = [
      '--model',
      this.model,
      '--output-format',
      'stream-json',
      '--yolo', // auto-approve tools
      prompt,
    ];

    logVerbose(`gemini args: ${args.join(' ')}`);

    let spawnError: Error | null = null;

    this.geminiProcess = spawn('gemini', args, {
      cwd: this.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    const proc = this.geminiProcess;

    // Handle spawn errors - capture for later
    proc.on('error', (err) => {
      logVerbose(`gemini spawn error: ${err.message}`);
      spawnError = err;
    });

    // Collect stderr for debugging
    let stderrData = '';
    let hasEmittedText = false;
    proc.stderr?.on('data', (data) => {
      stderrData += data.toString();
      logVerbose(`gemini stderr: ${data.toString().trim()}`);
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

      // Create readline interface for stdout
      const rl = createInterface({
        input: proc.stdout!,
        crlfDelay: Infinity,
      });

      // Process each line of JSON output
      for await (const line of rl) {
        // Check if spawn failed after starting
        if (spawnError !== null) {
          yield { type: 'text', text: `Error: ${(spawnError as Error).message}` };
          break;
        }

        if (!line.trim()) continue;

        try {
          const event = JSON.parse(line);

          // Translate gemini CLI stream-json format to ProviderChunk
          // Gemini CLI format (actual output from gemini cli):
          //   {"type":"init","session_id":"...","model":"..."}
          //   {"type":"message","role":"assistant","content":"text","delta":true}
          //   {"type":"tool_use","tool_name":"...","tool_id":"...","parameters":{...}}
          //   {"type":"tool_result","tool_id":"...","status":"success|error","output":"..."}
          //   {"type":"result","status":"success","stats":{...}}

          if (event.type === 'message' && event.role === 'assistant') {
            // Assistant message - text delta
            if (typeof event.content === 'string') {
              hasEmittedText = true;
              yield { type: 'text', text: event.content };
            } else if (Array.isArray(event.content)) {
              // Content blocks (legacy format)
              for (const block of event.content) {
                if (block.type === 'text') {
                  hasEmittedText = true;
                  yield { type: 'text', text: block.text };
                }
              }
            }
          } else if (event.type === 'tool_use') {
            // Standalone tool_use event from gemini cli
            // Gemini CLI uses: id, name, input
            // Translate tool name to Claude format
            const geminiToolName = event.name || event.tool_name || 'unknown';
            const claudeToolName = translateToolName(geminiToolName);
            const toolId = event.id || event.tool_id || `tool_${Date.now()}`;
            const toolInput = event.input || event.parameters || {};

            logVerbose(`Tool call: ${geminiToolName} -> ${claudeToolName}`);

            yield {
              type: 'tool_call',
              toolCall: {
                id: toolId,
                name: claudeToolName,
                arguments: JSON.stringify(toolInput),
              },
            };
          } else if (event.type === 'tool_result') {
            // Tool result event from gemini cli
            // Gemini CLI uses: tool_use_id, content, is_error
            const resultId = event.tool_use_id || event.tool_id || event.id;
            const resultContent = event.content || event.output || '';
            const isError = event.is_error === true || event.status === 'error';

            yield {
              type: 'tool_result',
              toolResult: {
                id: resultId,
                status: isError ? 'error' : 'success',
                output: resultContent,
                isError: isError,
              },
            };
          } else if (event.type === 'result') {
            // End of response with stats
            if (event.stats) {
              yield {
                type: 'usage',
                usage: {
                  inputTokens: event.stats.input_tokens || event.stats.input || 0,
                  outputTokens: event.stats.output_tokens || event.stats.output || 0,
                  cacheReadTokens: event.stats.cached || 0,
                },
              };
            }
          } else if (event.type === 'error') {
            yield { type: 'text', text: `Error: ${event.message || event.error || 'Unknown error'}` };
          }
          // Ignore 'init' and 'message' with role='user' (echo of input)
        } catch (parseError) {
          logVerbose(`Failed to parse gemini output: ${line}`);
        }
      }

      // Wait for process to exit with timeout
      const exitCode = await new Promise<number | null>((resolve) => {
        const timeout = setTimeout(() => {
          logVerbose('gemini process timeout - killing');
          proc.kill();
          resolve(null);
        }, PROCESS_TIMEOUT_MS);

        proc.on('close', (code) => {
          clearTimeout(timeout);
          logVerbose(`gemini CLI exited with code: ${code}`);
          if (code !== 0 && stderrData) {
            logVerbose(`gemini stderr: ${stderrData}`);
          }
          resolve(code);
        });

        // Handle case where process already exited
        if (proc.exitCode !== null) {
          clearTimeout(timeout);
          resolve(proc.exitCode);
        }
      });

      // Emit error if CLI failed without emitting any text
      if (exitCode !== 0 && !hasEmittedText) {
        // Extract error message from stderr
        let errorMsg = 'Gemini CLI failed';
        if (stderrData.includes('ModelNotFoundError')) {
          errorMsg = `Model "${this.model}" not found. Please use a valid Gemini model (e.g., gemini-2.0-flash, gemini-2.5-pro).`;
        } else if (stderrData.includes('Error')) {
          // Try to extract the error message
          const errorMatch = stderrData.match(/Error[:\s]+([^\n]+)/i);
          if (errorMatch) {
            errorMsg = errorMatch[1].trim();
          }
        }
        yield { type: 'text', text: `Error: ${errorMsg}` };
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logVerbose(`gemini generate error: ${errMsg}`);
      yield { type: 'text', text: `Error: ${errMsg}` };
    } finally {
      // Always cleanup process
      this.kill();
    }

    yield { type: 'done' };
  }

  /**
   * Kill the gemini process if running
   */
  kill(): void {
    if (this.geminiProcess && !this.geminiProcess.killed) {
      this.geminiProcess.kill();
      this.geminiProcess = null;
    }
  }
}
