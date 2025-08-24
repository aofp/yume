/**
 * PATH Environment Variable Utilities
 * Cross-platform utilities for handling PATH environment variable
 */

/**
 * Get the correct PATH environment variable name
 * Windows can have PATH, Path, or path
 * 
 * @param {object} options - Options object
 * @param {object} options.env - Environment variables object
 * @param {string} options.platform - Platform name
 * @returns {string} The correct PATH variable name
 */
export function getPathKey(options = {}) {
  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  
  // Non-Windows platforms always use PATH
  if (platform !== 'win32') {
    return 'PATH';
  }
  
  // On Windows, find the correct case variant
  // Search in reverse order to find the most recent definition
  return Object.keys(env)
    .reverse()
    .find(key => key.toUpperCase() === 'PATH') || 'Path';
}

/**
 * Resolve command path
 * Finds the full path to an executable command
 * 
 * @param {string} command - Command to resolve
 * @param {object} options - Options
 * @returns {string|null} Full path to command or null
 */
export function resolveCommandPath(commandInfo, isWindowsExt) {
  const options = commandInfo.options;
  const env = options.env || process.env;
  const cwd = process.cwd();
  const hasCwd = options.cwd != null;
  const canChdir = hasCwd && process.chdir !== undefined && !process.chdir.disabled;
  
  // Change to specified directory if needed
  if (canChdir) {
    try {
      process.chdir(options.cwd);
    } catch (err) {
      // Ignore chdir errors
    }
  }
  
  let resolvedPath;
  
  try {
    // Use which to find the command
    const pathKey = getPathKey({ env });
    const which = require('./which.js').whichSync;
    
    resolvedPath = which(commandInfo.command, {
      path: env[pathKey],
      pathExt: isWindowsExt ? require('path').delimiter : undefined
    });
  } catch (err) {
    // Command not found
    resolvedPath = null;
  } finally {
    // Restore original directory
    if (canChdir) {
      process.chdir(cwd);
    }
  }
  
  // Resolve to absolute path if found
  if (resolvedPath) {
    resolvedPath = require('path').resolve(
      hasCwd ? options.cwd : '',
      resolvedPath
    );
  }
  
  return resolvedPath;
}

/**
 * Resolve command with fallback to Windows extensions
 * 
 * @param {object} commandInfo - Command information
 * @returns {string|null} Resolved command path
 */
export function resolveCommand(commandInfo) {
  return resolveCommandPath(commandInfo, false) || 
         resolveCommandPath(commandInfo, true);
}

export default {
  getPathKey,
  resolveCommandPath,
  resolveCommand
};