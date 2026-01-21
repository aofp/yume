/**
 * Structured Logger - Production-ready logging with context and levels
 *
 * Replaces console.log calls with structured logging that:
 * - Provides log levels (debug, info, warn, error)
 * - Includes context objects for better debugging
 * - Can be easily integrated with external logging services (Sentry, LogRocket, etc.)
 * - Supports filtering by level in production
 * - Preserves file/line information for debugging
 *
 * Usage:
 *   logger.debug('Component rendered', { component: 'ClaudeChat', props: {...} });
 *   logger.info('Session created', { sessionId: 'abc123', workingDirectory: '/path' });
 *   logger.warn('Context usage high', { percentage: 95, threshold: 90 });
 *   logger.error('Failed to load session', { error: err.message, stack: err.stack });
 */

export interface LogContext {
  [key: string]: any;
}

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

export interface LoggerConfig {
  level: LogLevel;
  enableTimestamps: boolean;
  enableColors: boolean;
  enableContext: boolean;
}

class Logger {
  private config: LoggerConfig = {
    level: import.meta.env.DEV ? LogLevel.DEBUG : LogLevel.INFO,
    enableTimestamps: true,
    enableColors: true,
    enableContext: true,
  };

  private readonly colors = {
    debug: '#888888', // Gray
    info: '#0ea5e9', // Sky blue
    warn: '#f59e0b', // Amber
    error: '#ef4444', // Red
    reset: '#ffffff',
  };

  /**
   * Configure the logger
   */
  configure(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Set the minimum log level
   */
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  /**
   * Get the current log level
   */
  getLevel(): LogLevel {
    return this.config.level;
  }

  /**
   * Debug-level logging (verbose, development only)
   */
  debug(message: string, context?: LogContext): void {
    if (this.config.level <= LogLevel.DEBUG) {
      this.log('debug', message, context);
    }
  }

  /**
   * Info-level logging (normal operation)
   */
  info(message: string, context?: LogContext): void {
    if (this.config.level <= LogLevel.INFO) {
      this.log('info', message, context);
    }
  }

  /**
   * Warning-level logging (potential issues)
   */
  warn(message: string, context?: LogContext): void {
    if (this.config.level <= LogLevel.WARN) {
      this.log('warn', message, context);
    }
  }

  /**
   * Error-level logging (failures)
   */
  error(message: string, context?: LogContext): void {
    if (this.config.level <= LogLevel.ERROR) {
      this.log('error', message, context);
    }
  }

  /**
   * Internal logging method
   */
  private log(
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    context?: LogContext
  ): void {
    const timestamp = this.config.enableTimestamps ? this.getTimestamp() : '';
    const levelTag = level.toUpperCase().padEnd(5);
    const color = this.config.enableColors ? this.colors[level] : undefined;

    // Build log prefix
    const prefix = timestamp ? `[${timestamp}] [${levelTag}]` : `[${levelTag}]`;

    // Build log message
    const fullMessage = `${prefix} ${message}`;

    // Select console method
    const consoleMethod = level === 'debug' ? console.log : console[level];

    // Log with optional styling and context
    if (color && this.config.enableColors) {
      if (context && this.config.enableContext) {
        consoleMethod(`%c${fullMessage}`, `color: ${color}`, context);
      } else {
        consoleMethod(`%c${fullMessage}`, `color: ${color}`);
      }
    } else {
      if (context && this.config.enableContext) {
        consoleMethod(fullMessage, context);
      } else {
        consoleMethod(fullMessage);
      }
    }

    // TODO: Send to external logging service (Sentry, LogRocket, etc.)
    // this.sendToExternalService(level, message, context);
  }

  /**
   * Get current timestamp in HH:MM:SS.mmm format
   */
  private getTimestamp(): string {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const ms = String(now.getMilliseconds()).padStart(3, '0');
    return `${hours}:${minutes}:${seconds}.${ms}`;
  }

  /**
   * Group logs together (useful for related operations)
   */
  group(label: string): void {
    if (this.config.level <= LogLevel.DEBUG) {
      console.group(label);
    }
  }

  /**
   * End a log group
   */
  groupEnd(): void {
    if (this.config.level <= LogLevel.DEBUG) {
      console.groupEnd();
    }
  }

  /**
   * Time an operation
   */
  time(label: string): void {
    if (this.config.level <= LogLevel.DEBUG) {
      console.time(label);
    }
  }

  /**
   * End timing an operation
   */
  timeEnd(label: string): void {
    if (this.config.level <= LogLevel.DEBUG) {
      console.timeEnd(label);
    }
  }

  /**
   * Log a table (useful for arrays of objects)
   */
  table(data: any): void {
    if (this.config.level <= LogLevel.DEBUG) {
      console.table(data);
    }
  }
}

// Export singleton instance
export const logger = new Logger();

// Export class for testing
export { Logger };

// Export LogLevel for external configuration
export { LogLevel as LoggerLevel };
