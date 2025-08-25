#!/usr/bin/env node

/**
 * Claude Code CLI Entry Point
 * Main entry point for the Claude Code command-line interface
 * 
 * (c) Anthropic PBC. All rights reserved.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { program } from 'commander';
import { CLIApplication } from './app.js';
import { loadConfig } from '../config/config-loader.js';
import { setupEnvironment } from '../config/environment.js';
import { checkForUpdates } from './update-checker.js';
import { displayBanner } from '../ui/banner.js';
import { handleError } from './error-handler.js';
import { VERSION, DESCRIPTION } from './constants.js';

// Create require for CommonJS modules
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Initialize and run the CLI application
 */
async function main() {
  try {
    // Setup environment
    await setupEnvironment();
    
    // Load configuration
    const config = await loadConfig();
    
    // Check for updates if enabled
    if (config.checkUpdates !== false) {
      await checkForUpdates();
    }
    
    // Configure CLI program
    program
      .name('claude')
      .description(DESCRIPTION)
      .version(VERSION, '-v, --version', 'Display version information')
      .option('-d, --debug', 'Enable debug output')
      .option('--no-color', 'Disable colored output')
      .option('--config <path>', 'Path to configuration file')
      .option('--api-key <key>', 'Anthropic API key')
      .option('--model <model>', 'Model to use (default: claude-3-sonnet)')
      .option('--max-tokens <tokens>', 'Maximum tokens for response', parseInt)
      .option('--temperature <temp>', 'Temperature for response (0-1)', parseFloat)
      .option('--stream', 'Enable streaming responses')
      .option('--json', 'Output responses as JSON')
      .option('--quiet', 'Suppress non-essential output')
      .option('--verbose', 'Enable verbose output');
    
    // Add commands
    program
      .command('chat [message]')
      .description('Start an interactive chat session or send a single message')
      .option('-c, --continue', 'Continue previous conversation')
      .option('-s, --system <prompt>', 'System prompt to use')
      .option('-f, --file <path>', 'Read input from file')
      .option('-o, --output <path>', 'Save output to file')
      .action(async (message, options) => {
        const app = new CLIApplication(config, program.opts());
        await app.runChat(message, options);
      });
    
    program
      .command('complete <prompt>')
      .description('Generate a completion for the given prompt')
      .option('-s, --system <prompt>', 'System prompt to use')
      .option('-f, --file <path>', 'Read prompt from file')
      .option('-o, --output <path>', 'Save output to file')
      .action(async (prompt, options) => {
        const app = new CLIApplication(config, program.opts());
        await app.runCompletion(prompt, options);
      });
    
    program
      .command('analyze <path>')
      .description('Analyze code or documents')
      .option('-t, --type <type>', 'Analysis type (code, security, performance)')
      .option('-o, --output <path>', 'Save analysis to file')
      .option('--format <format>', 'Output format (text, json, markdown)')
      .action(async (path, options) => {
        const app = new CLIApplication(config, program.opts());
        await app.runAnalysis(path, options);
      });
    
    program
      .command('translate <text>')
      .description('Translate text between languages')
      .option('-f, --from <lang>', 'Source language')
      .option('-t, --to <lang>', 'Target language (required)')
      .option('--file <path>', 'Read text from file')
      .option('-o, --output <path>', 'Save translation to file')
      .action(async (text, options) => {
        const app = new CLIApplication(config, program.opts());
        await app.runTranslation(text, options);
      });
    
    program
      .command('summarize <input>')
      .description('Summarize text or documents')
      .option('-l, --length <length>', 'Summary length (short, medium, long)')
      .option('-f, --format <format>', 'Output format (text, bullets, json)')
      .option('--file <path>', 'Read input from file')
      .option('-o, --output <path>', 'Save summary to file')
      .action(async (input, options) => {
        const app = new CLIApplication(config, program.opts());
        await app.runSummarization(input, options);
      });
    
    program
      .command('config [action]')
      .description('Manage configuration (show, set, reset)')
      .option('-k, --key <key>', 'Configuration key')
      .option('-v, --value <value>', 'Configuration value')
      .option('--global', 'Use global configuration')
      .action(async (action = 'show', options) => {
        const app = new CLIApplication(config, program.opts());
        await app.manageConfig(action, options);
      });
    
    program
      .command('auth [action]')
      .description('Manage authentication (login, logout, status)')
      .option('--token <token>', 'API token')
      .action(async (action = 'status', options) => {
        const app = new CLIApplication(config, program.opts());
        await app.manageAuth(action, options);
      });
    
    // Add help customization
    program.addHelpText('before', () => {
      if (!program.opts().quiet) {
        return displayBanner();
      }
      return '';
    });
    
    program.addHelpText('after', `
Examples:
  $ claude chat "Hello, Claude!"
  $ claude complete "Write a Python function that"
  $ claude analyze ./src --type code
  $ claude summarize document.pdf --length short
  $ claude translate "Hello world" --to french
  
For more information, visit: https://github.com/anthropics/claude-code
    `);
    
    // Parse command line arguments
    await program.parseAsync(process.argv);
    
    // If no command specified, show help
    if (process.argv.length === 2) {
      program.outputHelp();
    }
    
  } catch (error) {
    handleError(error, program.opts());
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  handleError(error, { debug: true });
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  handleError(error, { debug: true });
  process.exit(1);
});

// Run the application
main().catch((error) => {
  handleError(error, { debug: true });
  process.exit(1);
});