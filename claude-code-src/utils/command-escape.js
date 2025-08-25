/**
 * Command Line Escaping Utilities
 * Utilities for properly escaping command line arguments on Windows
 */

// Special characters that need escaping on Windows
const WINDOWS_SPECIAL_CHARS = /([()\][%!^"`<>&|;, *?])/g;

/**
 * Escape command for Windows shell
 * 
 * @param {string} command - Command to escape
 * @returns {string} Escaped command
 */
export function escapeCommand(command) {
  // Escape special characters with ^
  return command.replace(WINDOWS_SPECIAL_CHARS, '^$1');
}

/**
 * Escape argument for Windows shell
 * 
 * @param {string} arg - Argument to escape
 * @param {boolean} doubleEscape - Whether to double escape for cmd.exe
 * @returns {string} Escaped argument
 */
export function escapeArgument(arg, doubleEscape) {
  // Convert to string
  arg = `${arg}`;
  
  // Escape backslashes before quotes
  arg = arg.replace(/(?=(\\+?)?)\1"/g, '$1$1\\"');
  
  // Escape trailing backslashes
  arg = arg.replace(/(?=(\\+?)?)\1$/, '$1$1');
  
  // Wrap in quotes
  arg = `"${arg}"`;
  
  // Escape special characters
  arg = arg.replace(WINDOWS_SPECIAL_CHARS, '^$1');
  
  // Double escape if needed (for cmd.exe)
  if (doubleEscape) {
    arg = arg.replace(WINDOWS_SPECIAL_CHARS, '^$1');
  }
  
  return arg;
}

/**
 * Parse shebang line from script
 * 
 * @param {string} content - Script content
 * @returns {string|null} Parsed shebang interpreter
 */
export function parseShebang(content = '') {
  const shebangPattern = /^#!(.*)/;
  const match = content.match(shebangPattern);
  
  if (!match) {
    return null;
  }
  
  // Extract interpreter and arguments
  const [command, args] = match[0]
    .replace(/#! ?/, '')
    .split(' ');
  
  // Get the base command name
  const interpreter = command.split('/').pop();
  
  // Handle 'env' shebang
  if (interpreter === 'env') {
    return args;
  }
  
  // Return full command with args if present
  return args ? `${interpreter} ${args}` : interpreter;
}

/**
 * Read shebang from file
 * 
 * @param {string} filePath - Path to file
 * @returns {string|null} Shebang interpreter or null
 */
export function readShebang(filePath) {
  const fs = require('fs');
  
  try {
    // Read first 150 bytes (enough for shebang line)
    const buffer = Buffer.alloc(150);
    const fd = fs.openSync(filePath, 'r');
    
    let bytesRead;
    try {
      bytesRead = fs.readSync(fd, buffer, 0, 150, 0);
    } finally {
      fs.closeSync(fd);
    }
    
    // Convert buffer to string and parse shebang
    const content = buffer.slice(0, bytesRead).toString();
    return parseShebang(content);
  } catch (err) {
    return null;
  }
}

/**
 * Quote path for shell execution
 * 
 * @param {string} filePath - File path to quote
 * @returns {string} Quoted path
 */
export function quotePath(filePath) {
  // Check if path needs quoting
  if (!/\s/.test(filePath)) {
    return filePath;
  }
  
  // Use appropriate quoting based on platform
  if (process.platform === 'win32') {
    return `"${filePath.replace(/"/g, '\\"')}"`;
  } else {
    return `'${filePath.replace(/'/g, "'\\''")}'`;
  }
}

/**
 * Build command line from parts
 * 
 * @param {string} command - Base command
 * @param {array} args - Command arguments
 * @param {object} options - Options
 * @returns {string} Complete command line
 */
export function buildCommandLine(command, args = [], options = {}) {
  const isWindows = process.platform === 'win32';
  
  // Quote command if needed
  let cmdLine = quotePath(command);
  
  // Add arguments
  for (const arg of args) {
    if (isWindows && options.windowsVerbatim !== true) {
      cmdLine += ' ' + escapeArgument(arg, false);
    } else {
      cmdLine += ' ' + quotePath(arg);
    }
  }
  
  return cmdLine;
}

export default {
  escapeCommand,
  escapeArgument,
  parseShebang,
  readShebang,
  quotePath,
  buildCommandLine
};