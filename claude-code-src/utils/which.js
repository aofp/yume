/**
 * Command/Executable Finder Utility
 * Cross-platform implementation of Unix 'which' command
 * Finds executable files in system PATH
 */

import path from 'path';
import { isExecutable, isExecutableSync } from './file-permissions.js';

// Platform detection
const isWindows = process.platform === 'win32' || 
                  process.env.OSTYPE === 'cygwin' || 
                  process.env.OSTYPE === 'msys';

const PATH_SEPARATOR = isWindows ? ';' : ':';

/**
 * Create ENOENT error for command not found
 * 
 * @param {string} command - Command that wasn't found
 * @returns {Error} Error object with ENOENT code
 */
function createNotFoundError(command) {
  return Object.assign(
    new Error(`not found: ${command}`), 
    { code: 'ENOENT' }
  );
}

/**
 * Parse search paths and extensions
 * 
 * @param {string} command - Command to search for
 * @param {object} options - Search options
 * @returns {object} Parsed paths and extensions
 */
function parseSearchOptions(command, options) {
  const pathSeparator = options.colon || PATH_SEPARATOR;
  
  // Build search paths
  const searchPaths = (command.match(/\//) || (isWindows && command.match(/\\/))) 
    ? ['']  // Absolute path, search in current location only
    : [
        ...(isWindows ? [process.cwd()] : []),
        ...(options.path || process.env.PATH || '').split(pathSeparator)
      ];
  
  // Get executable extensions for Windows
  const pathExtValue = isWindows 
    ? (options.pathExt || process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM')
    : '';
    
  const pathExtensions = isWindows 
    ? pathExtValue.split(pathSeparator)
    : [''];
  
  // On Windows, if command has extension and first pathExt is not empty, prepend empty
  if (isWindows && command.indexOf('.') !== -1 && pathExtensions[0] !== '') {
    pathExtensions.unshift('');
  }
  
  return {
    pathEnv: searchPaths,
    pathExt: pathExtensions,
    pathExtExe: pathExtValue
  };
}

/**
 * Find executable in PATH (async)
 * 
 * @param {string} command - Command to find
 * @param {object|Function} options - Options or callback
 * @param {Function} callback - Callback function
 * @returns {Promise} Promise if no callback provided
 */
export function which(command, options, callback) {
  // Handle optional options parameter
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  
  if (!options) {
    options = {};
  }
  
  const { pathEnv, pathExt, pathExtExe } = parseSearchOptions(command, options);
  const foundPaths = [];
  
  /**
   * Search through directories
   */
  const searchDirectory = (dirIndex) => {
    return new Promise((resolve, reject) => {
      if (dirIndex === pathEnv.length) {
        // End of search
        return options.all && foundPaths.length 
          ? resolve(foundPaths)
          : reject(createNotFoundError(command));
      }
      
      const dir = pathEnv[dirIndex];
      const cleanDir = /^".*"$/.test(dir) ? dir.slice(1, -1) : dir;
      const fullPath = path.join(cleanDir, command);
      
      // Handle relative paths
      const searchPath = !cleanDir && /^\.[\\\/]/.test(command)
        ? command.slice(0, 2) + fullPath
        : fullPath;
      
      resolve(searchExtensions(searchPath, dirIndex, 0));
    });
  };
  
  /**
   * Search through extensions for a path
   */
  const searchExtensions = (basePath, dirIndex, extIndex) => {
    return new Promise((resolve, reject) => {
      if (extIndex === pathExt.length) {
        // Move to next directory
        return resolve(searchDirectory(dirIndex + 1));
      }
      
      const ext = pathExt[extIndex];
      const fullPath = basePath + ext;
      
      isExecutable(fullPath, { pathExt: pathExtExe }, (err, isExec) => {
        if (!err && isExec) {
          if (options.all) {
            foundPaths.push(fullPath);
          } else {
            return resolve(fullPath);
          }
        }
        
        resolve(searchExtensions(basePath, dirIndex, extIndex + 1));
      });
    });
  };
  
  // Start search
  const searchPromise = searchDirectory(0);
  
  if (callback) {
    searchPromise.then(
      result => callback(null, result),
      err => callback(err)
    );
  } else {
    return searchPromise;
  }
}

/**
 * Find executable in PATH (sync)
 * 
 * @param {string} command - Command to find
 * @param {object} options - Options
 * @returns {string|array|null} Path(s) to executable or null
 * @throws {Error} If not found and nothrow is false
 */
export function whichSync(command, options) {
  options = options || {};
  
  const { pathEnv, pathExt, pathExtExe } = parseSearchOptions(command, options);
  const foundPaths = [];
  
  // Search through all directories
  for (let dirIndex = 0; dirIndex < pathEnv.length; dirIndex++) {
    const dir = pathEnv[dirIndex];
    const cleanDir = /^".*"$/.test(dir) ? dir.slice(1, -1) : dir;
    const fullPath = path.join(cleanDir, command);
    
    // Handle relative paths
    const searchPath = !cleanDir && /^\.[\\\/]/.test(command)
      ? command.slice(0, 2) + fullPath
      : fullPath;
    
    // Search through all extensions
    for (let extIndex = 0; extIndex < pathExt.length; extIndex++) {
      const ext = pathExt[extIndex];
      const pathWithExt = searchPath + ext;
      
      try {
        if (isExecutableSync(pathWithExt, { pathExt: pathExtExe })) {
          if (options.all) {
            foundPaths.push(pathWithExt);
          } else {
            return pathWithExt;
          }
        }
      } catch (err) {
        // Ignore errors and continue searching
      }
    }
  }
  
  // Return results based on options
  if (options.all && foundPaths.length) {
    return foundPaths;
  }
  
  if (options.nothrow) {
    return null;
  }
  
  throw createNotFoundError(command);
}

// Set sync version as property
which.sync = whichSync;

export default which;