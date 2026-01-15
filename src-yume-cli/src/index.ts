#!/usr/bin/env node
/**
 * yume-cli - Universal agent shim for Yume
 *
 * Emits Claude-compatible stream-json for any supported provider.
 *
 * Usage:
 *   yume-cli --provider gemini --model gemini-2.0-flash --cwd /path/to/project --prompt "Hello"
 *   yume-cli --provider openai --model gpt-4o --cwd /path/to/project --resume sess-abc123
 */

import type { CLIArgs, ProviderType, PermissionMode } from './types.js';
import { runAgentLoop } from './core/agent-loop.js';
import {
  emitSystemError,
  emitError,
  emitErrorResult,
  emitMessageStop,
  setVerbose,
  log,
} from './core/emit.js';
import { generateSessionId } from './core/session.js';
import { createProvider, getDefaultModel } from './providers/index.js';
import { toolExecutors, toolDefinitions } from './tools/index.js';

/**
 * Parse command line arguments
 */
function parseArgs(): CLIArgs {
  const args = process.argv.slice(2);
  const result: Partial<CLIArgs> = {
    outputFormat: 'stream-json',
    permissionMode: 'default',
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--provider':
      case '-P':
        result.provider = nextArg as ProviderType;
        i++;
        break;
      case '--model':
      case '-m':
        result.model = nextArg;
        i++;
        break;
      case '--cwd':
      case '-d':
        result.cwd = nextArg;
        i++;
        break;
      case '--session-id':
      case '-s':
        result.sessionId = nextArg;
        i++;
        break;
      case '--prompt':
      case '-p':
        result.prompt = nextArg;
        i++;
        break;
      case '--resume':
      case '-r':
        result.resume = nextArg;
        i++;
        break;
      case '--history-file':
        result.historyFile = nextArg;
        i++;
        break;
      case '--output-format':
        result.outputFormat = nextArg as 'stream-json';
        i++;
        break;
      case '--api-base':
        result.apiBase = nextArg;
        i++;
        break;
      case '--permission-mode':
        result.permissionMode = nextArg as PermissionMode;
        i++;
        break;
      case '--verbose':
      case '-v':
        result.verbose = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
      case '--version':
        console.log('yume-cli 1.0.0');
        process.exit(0);
    }
  }

  // Read prompt from stdin if not provided
  if (!result.prompt && !result.resume) {
    // Check if there's piped input
    if (!process.stdin.isTTY) {
      // Will read from stdin in main()
    }
  }

  return result as CLIArgs;
}

function printHelp(): void {
  console.log(`
yume-cli - Universal agent shim for Yume

USAGE:
  yume-cli --provider <provider> [OPTIONS]

OPTIONS:
  -P, --provider <provider>    Provider: gemini, openai (required)
  -m, --model <model>          Model name (default: provider default)
  -d, --cwd <path>             Working directory (default: current)
  -s, --session-id <id>        Session ID (default: generated)
  -p, --prompt <text>          User prompt
  -r, --resume <id>            Resume existing session
  --history-file <path>        Path to JSON file with conversation history
  --api-base <url>             Override API base URL
  --permission-mode <mode>     Permission mode: default, interactive, auto, deny
  -v, --verbose                Enable verbose logging
  -h, --help                   Show this help
  --version                    Show version

EXAMPLES:
  # New Gemini session
  yume-cli -P gemini -m gemini-2.0-flash -d /my/project -p "Hello"

  # Resume OpenAI session
  yume-cli -P openai -m gpt-4o -r sess-abc123

  # Use custom endpoint
  yume-cli -P openai --api-base http://localhost:11434/v1 -m llama3

ENVIRONMENT:
  GOOGLE_API_KEY       Gemini API key
  OPENAI_API_KEY       OpenAI API key
  OPENAI_BASE_URL      OpenAI base URL override
  AZURE_OPENAI_API_KEY Azure OpenAI key
  AZURE_OPENAI_ENDPOINT Azure OpenAI endpoint
`);
}

/**
 * Read prompt from stdin
 */
async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';

    if (process.stdin.isTTY) {
      resolve('');
      return;
    }

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      resolve(data.trim());
    });

    // Timeout after 100ms if no data
    setTimeout(() => {
      resolve(data.trim());
    }, 100);
  });
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  try {
    const args = parseArgs();

    // Enable verbose if requested
    if (args.verbose) {
      setVerbose(true);
    }

    // Validate provider
    if (!args.provider) {
      emitSystemError('Provider is required. Use --provider gemini or --provider openai');
      emitMessageStop();
      process.exit(1);
    }

    // Set defaults
    if (!args.model) {
      args.model = getDefaultModel(args.provider);
    }
    if (!args.cwd) {
      args.cwd = process.cwd();
    }
    if (!args.sessionId) {
      args.sessionId = generateSessionId();
    }

    // Read prompt from stdin if not provided
    if (!args.prompt && !args.resume) {
      args.prompt = await readStdin();
    }

    // Require prompt or resume
    if (!args.prompt && !args.resume) {
      emitSystemError('Prompt is required. Use --prompt or --resume');
      emitMessageStop();
      process.exit(1);
    }

    // Create provider
    const provider = createProvider(args.provider, args.model, args.apiBase);

    // Run agent loop
    await runAgentLoop({
      args,
      provider,
      tools: toolExecutors,
      toolDefinitions,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`Fatal error: ${message}`);
    emitError('fatal', message);
    emitErrorResult('unknown', message);
    emitMessageStop();
    process.exit(1);
  }
}

main();
