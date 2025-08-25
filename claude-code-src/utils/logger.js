/**
 * Logger Utility
 * Provides structured logging with levels and formatting
 */

import { appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import chalk from 'chalk';
import { LOG_DIR, COLORS } from '../cli/constants.js';

/**
 * Log levels
 */
export const LogLevel = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  TRACE: 4
};

/**
 * Logger class
 */
export class Logger {
  constructor(debug = false, verbose = false, options = {}) {
    this.level = this.getLogLevel(debug, verbose);
    this.options = {
      color: options.color !== false,
      timestamp: options.timestamp !== false,
      logFile: options.logFile || null,
      prefix: options.prefix || '',
      maxFileSize: options.maxFileSize || 10 * 1024 * 1024, // 10MB
      console: options.console !== false,
      structured: options.structured || false
    };
    
    this.chalk = new chalk.Instance({ level: this.options.color ? 3 : 0 });
    
    // Create log file path if needed
    if (this.options.logFile === true) {
      const timestamp = new Date().toISOString().split('T')[0];
      this.options.logFile = join(homedir(), LOG_DIR, `claude-${timestamp}.log`);
    }
  }
  
  /**
   * Get log level from flags
   */
  getLogLevel(debug, verbose) {
    if (debug) return LogLevel.DEBUG;
    if (verbose) return LogLevel.INFO;
    return LogLevel.WARN;
  }
  
  /**
   * Log message at specified level
   */
  log(level, message, ...args) {
    if (level > this.level) return;
    
    const timestamp = new Date().toISOString();
    const levelName = this.getLevelName(level);
    const formattedMessage = this.formatMessage(message, args);
    
    // Console output
    if (this.options.console) {
      this.consoleLog(level, levelName, formattedMessage, timestamp);
    }
    
    // File output
    if (this.options.logFile) {
      this.fileLog(level, levelName, formattedMessage, timestamp);
    }
  }
  
  /**
   * Console logging
   */
  consoleLog(level, levelName, message, timestamp) {
    if (this.options.structured) {
      // Structured JSON output
      const logEntry = {
        timestamp,
        level: levelName,
        message,
        prefix: this.options.prefix
      };
      console.log(JSON.stringify(logEntry));
    } else {
      // Formatted console output
      const prefix = this.options.prefix ? `[${this.options.prefix}] ` : '';
      const time = this.options.timestamp ? 
        this.chalk.gray(`[${timestamp.split('T')[1].split('.')[0]}] `) : '';
      const levelTag = this.formatLevelTag(level, levelName);
      
      const output = `${time}${levelTag} ${prefix}${message}`;
      
      if (level === LogLevel.ERROR) {
        console.error(output);
      } else {
        console.log(output);
      }
    }
  }
  
  /**
   * File logging
   */
  async fileLog(level, levelName, message, timestamp) {
    const logEntry = {
      timestamp,
      level: levelName,
      message,
      prefix: this.options.prefix
    };
    
    const line = JSON.stringify(logEntry) + '\n';
    
    try {
      await appendFile(this.options.logFile, line);
      
      // Check file size and rotate if needed
      await this.checkRotation();
    } catch (error) {
      // Silently fail file logging
      if (this.level >= LogLevel.DEBUG) {
        console.error('Failed to write to log file:', error.message);
      }
    }
  }
  
  /**
   * Format message with arguments
   */
  formatMessage(message, args) {
    if (args.length === 0) return message;
    
    // Handle error objects
    const formattedArgs = args.map(arg => {
      if (arg instanceof Error) {
        return this.level >= LogLevel.DEBUG ? arg.stack : arg.message;
      }
      if (typeof arg === 'object') {
        return JSON.stringify(arg, null, 2);
      }
      return arg;
    });
    
    // Simple string formatting
    let formatted = message;
    for (const arg of formattedArgs) {
      formatted += ' ' + arg;
    }
    
    return formatted;
  }
  
  /**
   * Format level tag for console
   */
  formatLevelTag(level, levelName) {
    const colors = {
      [LogLevel.ERROR]: COLORS.error,
      [LogLevel.WARN]: COLORS.warning,
      [LogLevel.INFO]: COLORS.info,
      [LogLevel.DEBUG]: COLORS.muted,
      [LogLevel.TRACE]: COLORS.muted
    };
    
    const icons = {
      [LogLevel.ERROR]: '✗',
      [LogLevel.WARN]: '⚠',
      [LogLevel.INFO]: 'ℹ',
      [LogLevel.DEBUG]: '●',
      [LogLevel.TRACE]: '○'
    };
    
    const color = colors[level] || COLORS.muted;
    const icon = icons[level] || '•';
    
    return this.chalk[color](`${icon} ${levelName.padEnd(5)}`);
  }
  
  /**
   * Get level name
   */
  getLevelName(level) {
    const names = {
      [LogLevel.ERROR]: 'ERROR',
      [LogLevel.WARN]: 'WARN',
      [LogLevel.INFO]: 'INFO',
      [LogLevel.DEBUG]: 'DEBUG',
      [LogLevel.TRACE]: 'TRACE'
    };
    
    return names[level] || 'UNKNOWN';
  }
  
  /**
   * Check and perform log rotation
   */
  async checkRotation() {
    if (!this.options.logFile || !existsSync(this.options.logFile)) return;
    
    try {
      const { stat, rename } = await import('node:fs/promises');
      const stats = await stat(this.options.logFile);
      
      if (stats.size > this.options.maxFileSize) {
        // Rotate log file
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const rotatedPath = this.options.logFile.replace('.log', `-${timestamp}.log`);
        await rename(this.options.logFile, rotatedPath);
      }
    } catch (error) {
      // Ignore rotation errors
    }
  }
  
  // Convenience methods
  
  error(message, ...args) {
    this.log(LogLevel.ERROR, message, ...args);
  }
  
  warn(message, ...args) {
    this.log(LogLevel.WARN, message, ...args);
  }
  
  info(message, ...args) {
    this.log(LogLevel.INFO, message, ...args);
  }
  
  debug(message, ...args) {
    this.log(LogLevel.DEBUG, message, ...args);
  }
  
  trace(message, ...args) {
    this.log(LogLevel.TRACE, message, ...args);
  }
  
  /**
   * Create child logger with prefix
   */
  child(prefix) {
    return new Logger(
      this.level >= LogLevel.DEBUG,
      this.level >= LogLevel.INFO,
      {
        ...this.options,
        prefix: this.options.prefix ? `${this.options.prefix}:${prefix}` : prefix
      }
    );
  }
  
  /**
   * Set log level
   */
  setLevel(level) {
    this.level = level;
  }
  
  /**
   * Time a function execution
   */
  async time(label, fn) {
    const start = Date.now();
    this.debug(`${label} started`);
    
    try {
      const result = await fn();
      const duration = Date.now() - start;
      this.debug(`${label} completed in ${duration}ms`);
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.error(`${label} failed after ${duration}ms:`, error);
      throw error;
    }
  }
  
  /**
   * Create a progress logger
   */
  progress(total, label = 'Progress') {
    let current = 0;
    
    return {
      increment: (amount = 1) => {
        current += amount;
        const percentage = Math.round((current / total) * 100);
        this.info(`${label}: ${current}/${total} (${percentage}%)`);
      },
      
      complete: () => {
        current = total;
        this.info(`${label}: Complete`);
      }
    };
  }
  
  /**
   * Group related log messages
   */
  group(label) {
    this.info(`┌─ ${label}`);
    
    return {
      log: (message, ...args) => {
        this.log(this.level, `│  ${message}`, ...args);
      },
      
      end: () => {
        this.info('└─ End');
      }
    };
  }
  
  /**
   * Table logging
   */
  table(data, columns) {
    if (!Array.isArray(data) || data.length === 0) {
      this.info('(empty table)');
      return;
    }
    
    // Auto-detect columns if not provided
    if (!columns) {
      columns = Object.keys(data[0]);
    }
    
    // Calculate column widths
    const widths = {};
    for (const col of columns) {
      widths[col] = col.length;
      for (const row of data) {
        const value = String(row[col] || '');
        widths[col] = Math.max(widths[col], value.length);
      }
    }
    
    // Print header
    const header = columns.map(col => col.padEnd(widths[col])).join(' | ');
    const separator = columns.map(col => '-'.repeat(widths[col])).join('-+-');
    
    this.info(header);
    this.info(separator);
    
    // Print rows
    for (const row of data) {
      const rowStr = columns.map(col => 
        String(row[col] || '').padEnd(widths[col])
      ).join(' | ');
      this.info(rowStr);
    }
  }
}

// Global logger instance
let globalLogger = null;

/**
 * Get global logger instance
 */
export function getLogger() {
  if (!globalLogger) {
    globalLogger = new Logger(
      process.env.DEBUG === 'true',
      process.env.VERBOSE === 'true'
    );
  }
  return globalLogger;
}

/**
 * Set global logger
 */
export function setLogger(logger) {
  globalLogger = logger;
}

/**
 * Create logger
 */
export function createLogger(options) {
  return new Logger(
    options.debug,
    options.verbose,
    options
  );
}

// Export convenience functions using global logger
export const error = (message, ...args) => getLogger().error(message, ...args);
export const warn = (message, ...args) => getLogger().warn(message, ...args);
export const info = (message, ...args) => getLogger().info(message, ...args);
export const debug = (message, ...args) => getLogger().debug(message, ...args);
export const trace = (message, ...args) => getLogger().trace(message, ...args);

export default {
  Logger,
  LogLevel,
  getLogger,
  setLogger,
  createLogger,
  error,
  warn,
  info,
  debug,
  trace
};