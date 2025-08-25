/**
 * File Permission and Executable Checking Utilities
 * Cross-platform utilities for checking file permissions and executable status
 */

import fs from 'fs';
import { promisify } from 'util';

const statAsync = promisify(fs.stat);

/**
 * Check if file has executable extension on Windows
 * 
 * @param {string} filePath - Path to check
 * @param {object} options - Options with pathExt property
 * @returns {boolean} True if file has executable extension
 */
function hasExecutableExtension(filePath, options) {
  const pathExt = options.pathExt !== undefined 
    ? options.pathExt 
    : process.env.PATHEXT;
  
  if (!pathExt) {
    return true;
  }
  
  const extensions = pathExt.split(';');
  
  // Empty extension means all files are executable
  if (extensions.indexOf('') !== -1) {
    return true;
  }
  
  // Check if file ends with any executable extension
  for (let i = 0; i < extensions.length; i++) {
    const ext = extensions[i].toLowerCase();
    if (ext && filePath.substr(-ext.length).toLowerCase() === ext) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if file stats indicate an executable file (Windows)
 * 
 * @param {fs.Stats} stats - File stats
 * @param {string} filePath - File path
 * @param {object} options - Options
 * @returns {boolean} True if file is executable
 */
function isExecutableFileWindows(stats, filePath, options) {
  if (!stats.isSymbolicLink() && !stats.isFile()) {
    return false;
  }
  return hasExecutableExtension(filePath, options);
}

/**
 * Check if file is executable on Windows (async)
 * 
 * @param {string} filePath - File path to check
 * @param {object} options - Options
 * @param {Function} callback - Callback function
 */
export function checkExecutableWindows(filePath, options, callback) {
  fs.stat(filePath, (err, stats) => {
    callback(err, err ? false : isExecutableFileWindows(stats, filePath, options));
  });
}

/**
 * Check if file is executable on Windows (sync)
 * 
 * @param {string} filePath - File path to check
 * @param {object} options - Options
 * @returns {boolean} True if executable
 */
export function checkExecutableWindowsSync(filePath, options) {
  return isExecutableFileWindows(fs.statSync(filePath), filePath, options);
}

/**
 * Check Unix file permissions
 * 
 * @param {fs.Stats} stats - File stats
 * @param {object} options - Options with uid/gid
 * @returns {boolean} True if file has execute permissions
 */
function checkUnixPermissions(stats, options) {
  const { mode, uid: fileUid, gid: fileGid } = stats;
  
  const uid = options.uid !== undefined 
    ? options.uid 
    : process.getuid && process.getuid();
    
  const gid = options.gid !== undefined 
    ? options.gid 
    : process.getgid && process.getgid();
  
  // Permission masks
  const OWNER_EXEC = parseInt('100', 8);  // Owner execute
  const GROUP_EXEC = parseInt('010', 8);  // Group execute  
  const OTHER_EXEC = parseInt('001', 8);  // Other execute
  const OWNER_GROUP = OWNER_EXEC | GROUP_EXEC;
  
  // Check permissions based on user/group
  const hasPermission = 
    (mode & OTHER_EXEC) ||                    // Other has execute
    (mode & GROUP_EXEC && fileGid === gid) || // Group has execute and matches
    (mode & OWNER_EXEC && fileUid === uid) || // Owner has execute and matches
    (mode & OWNER_GROUP && uid === 0);        // Root user
  
  return hasPermission;
}

/**
 * Check if file is executable (Unix)
 * 
 * @param {fs.Stats} stats - File stats
 * @param {object} options - Options
 * @returns {boolean} True if executable
 */
function isExecutableFileUnix(stats, options) {
  return stats.isFile() && checkUnixPermissions(stats, options);
}

/**
 * Check if file is executable on Unix (async)
 * 
 * @param {string} filePath - File path to check
 * @param {object} options - Options
 * @param {Function} callback - Callback function
 */
export function checkExecutableUnix(filePath, options, callback) {
  fs.stat(filePath, (err, stats) => {
    callback(err, err ? false : isExecutableFileUnix(stats, options));
  });
}

/**
 * Check if file is executable on Unix (sync)
 * 
 * @param {string} filePath - File path to check
 * @param {object} options - Options
 * @returns {boolean} True if executable
 */
export function checkExecutableUnixSync(filePath, options) {
  return isExecutableFileUnix(fs.statSync(filePath), options);
}

/**
 * Cross-platform executable check
 * Automatically selects Windows or Unix implementation
 */
const isWindows = process.platform === 'win32' || global.TESTING_WINDOWS;
const checkExecutableImpl = isWindows ? checkExecutableWindows : checkExecutableUnix;
const checkExecutableImplSync = isWindows ? checkExecutableWindowsSync : checkExecutableUnixSync;

/**
 * Check if file is executable (async)
 * 
 * @param {string} filePath - File path to check
 * @param {object|Function} options - Options or callback
 * @param {Function} callback - Callback function
 * @returns {Promise} Promise if no callback provided
 */
export function isExecutable(filePath, options, callback) {
  // Handle optional options parameter
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  
  // Return promise if no callback
  if (!callback) {
    if (typeof Promise !== 'function') {
      throw new TypeError('callback not provided');
    }
    
    return new Promise((resolve, reject) => {
      isExecutable(filePath, options || {}, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  }
  
  // Check executable with error handling
  checkExecutableImpl(filePath, options || {}, (err, result) => {
    if (err) {
      // Ignore permission errors if requested
      if (err.code === 'EACCES' || (options && options.ignoreErrors)) {
        err = null;
        result = false;
      }
    }
    callback(err, result);
  });
}

/**
 * Check if file is executable (sync)
 * 
 * @param {string} filePath - File path to check
 * @param {object} options - Options
 * @returns {boolean} True if executable
 */
export function isExecutableSync(filePath, options) {
  try {
    return checkExecutableImplSync(filePath, options || {});
  } catch (err) {
    // Ignore permission errors if requested
    if ((options && options.ignoreErrors) || err.code === 'EACCES') {
      return false;
    }
    throw err;
  }
}

export default {
  isExecutable,
  isExecutableSync
};