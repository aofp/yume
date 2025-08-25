/**
 * CLI Constants and Configuration
 * Central location for CLI constants and default values
 */

export const VERSION = '1.0.89';

export const DESCRIPTION = "Use Claude, Anthropic's AI assistant, right from your terminal. Claude can understand your codebase, edit files, run terminal commands, and handle entire workflows for you.";

export const DEFAULT_MODEL = 'claude-3-sonnet-20240229';

export const AVAILABLE_MODELS = [
  'claude-3-opus-20240229',
  'claude-3-sonnet-20240229',
  'claude-3-haiku-20240307',
  'claude-2.1',
  'claude-2.0',
  'claude-instant-1.2'
];

export const DEFAULT_MAX_TOKENS = 4096;

export const DEFAULT_TEMPERATURE = 0.7;

export const DEFAULT_CONFIG = {
  apiKey: null,
  model: DEFAULT_MODEL,
  maxTokens: DEFAULT_MAX_TOKENS,
  temperature: DEFAULT_TEMPERATURE,
  stream: false,
  autoSave: true,
  checkUpdates: true,
  colorOutput: true,
  verboseErrors: false,
  timeout: 30000,
  maxRetries: 3,
  baseUrl: 'https://api.anthropic.com',
  historySize: 100,
  contextWindow: 100000
};

export const CONFIG_FILE_NAME = '.clauderc';

export const GLOBAL_CONFIG_DIR = '.claude';

export const CONVERSATION_DIR = '.claude-conversations';

export const CACHE_DIR = '.claude-cache';

export const LOG_DIR = '.claude-logs';

export const API_ENDPOINTS = {
  messages: '/v1/messages',
  complete: '/v1/complete',
  models: '/v1/models'
};

export const ERROR_CODES = {
  NO_API_KEY: 'ERR_NO_API_KEY',
  INVALID_API_KEY: 'ERR_INVALID_API_KEY',
  RATE_LIMIT: 'ERR_RATE_LIMIT',
  NETWORK_ERROR: 'ERR_NETWORK',
  INVALID_MODEL: 'ERR_INVALID_MODEL',
  CONTEXT_LENGTH: 'ERR_CONTEXT_LENGTH',
  SERVER_ERROR: 'ERR_SERVER',
  UNKNOWN: 'ERR_UNKNOWN'
};

export const COLORS = {
  primary: 'cyan',
  success: 'green',
  warning: 'yellow',
  error: 'red',
  info: 'blue',
  muted: 'gray',
  highlight: 'magenta'
};

export const ICONS = {
  success: '✓',
  error: '✗',
  warning: '⚠',
  info: 'ℹ',
  thinking: '🤔',
  robot: '🤖',
  user: '👤',
  document: '📄',
  folder: '📁',
  code: '💻',
  translate: '🌐',
  summary: '📝'
};

export const SPINNERS = {
  dots: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
  line: ['-', '\\', '|', '/'],
  circle: ['◐', '◓', '◑', '◒'],
  bounce: ['⠁', '⠂', '⠄', '⠂']
};

export const FILE_SIZE_LIMITS = {
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxTotalSize: 50 * 1024 * 1024, // 50MB
  maxFiles: 100
};

export const SUPPORTED_LANGUAGES = [
  'english', 'spanish', 'french', 'german', 'italian',
  'portuguese', 'dutch', 'russian', 'chinese', 'japanese',
  'korean', 'arabic', 'hindi', 'turkish', 'polish',
  'swedish', 'norwegian', 'danish', 'finnish', 'greek'
];

export const ANALYSIS_TYPES = [
  'code',
  'security',
  'performance',
  'documentation',
  'testing',
  'architecture',
  'dependencies',
  'complexity',
  'style',
  'general'
];

export const OUTPUT_FORMATS = [
  'text',
  'json',
  'markdown',
  'html',
  'csv',
  'yaml'
];

export const SUMMARY_LENGTHS = {
  short: { min: 50, max: 150 },
  medium: { min: 150, max: 500 },
  long: { min: 500, max: 1500 }
};

export const RATE_LIMITS = {
  requestsPerMinute: 50,
  tokensPerMinute: 100000,
  requestsPerDay: 5000
};

export const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffFactor: 2
};

export const UPDATE_CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

export const TELEMETRY_EVENTS = {
  COMMAND_RUN: 'command_run',
  API_CALL: 'api_call',
  ERROR: 'error',
  SUCCESS: 'success',
  FEATURE_USE: 'feature_use'
};

export default {
  VERSION,
  DESCRIPTION,
  DEFAULT_MODEL,
  AVAILABLE_MODELS,
  DEFAULT_MAX_TOKENS,
  DEFAULT_TEMPERATURE,
  DEFAULT_CONFIG,
  CONFIG_FILE_NAME,
  GLOBAL_CONFIG_DIR,
  CONVERSATION_DIR,
  CACHE_DIR,
  LOG_DIR,
  API_ENDPOINTS,
  ERROR_CODES,
  COLORS,
  ICONS,
  SPINNERS,
  FILE_SIZE_LIMITS,
  SUPPORTED_LANGUAGES,
  ANALYSIS_TYPES,
  OUTPUT_FORMATS,
  SUMMARY_LENGTHS,
  RATE_LIMITS,
  RETRY_CONFIG,
  UPDATE_CHECK_INTERVAL,
  TELEMETRY_EVENTS
};