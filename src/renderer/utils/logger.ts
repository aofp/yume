/**
 * Structured logging system for production-ready logging
 * Replaces console.log statements with controlled, leveled logging
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4
}

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: string;
  data?: any;
  stack?: string;
}

class Logger {
  private static instance: Logger;
  private logLevel: LogLevel = LogLevel.INFO;
  private isProduction: boolean = import.meta.env.PROD;
  private maxLogEntries: number = 1000;
  private logBuffer: LogEntry[] = [];
  private logToConsole: boolean = !this.isProduction;
  private logToLocalStorage: boolean = true;
  private context?: string;

  private constructor() {
    // Load log level from localStorage or environment
    const savedLevel = localStorage.getItem('yurucode_log_level');
    if (savedLevel) {
      this.logLevel = parseInt(savedLevel);
    } else if (import.meta.env.DEV) {
      this.logLevel = LogLevel.DEBUG;
    } else {
      this.logLevel = LogLevel.WARN;
    }

    // Check if we should show console in production (debug mode)
    const debugMode = localStorage.getItem('yurucode_debug_mode') === 'true';
    if (debugMode) {
      this.logToConsole = true;
    }
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  public setContext(context: string): Logger {
    const contextLogger = Object.create(this);
    contextLogger.context = context;
    return contextLogger;
  }

  public setLogLevel(level: LogLevel): void {
    this.logLevel = level;
    localStorage.setItem('yurucode_log_level', level.toString());
  }

  public enableConsoleLogging(enable: boolean): void {
    this.logToConsole = enable;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.logLevel;
  }

  private formatMessage(level: LogLevel, message: string, data?: any): string {
    const levelName = LogLevel[level];
    const context = this.context ? `[${this.context}]` : '';
    const dataStr = data ? ` ${JSON.stringify(data, null, 2)}` : '';
    return `[${levelName}]${context} ${message}${dataStr}`;
  }

  private saveToBuffer(entry: LogEntry): void {
    this.logBuffer.push(entry);
    
    // Keep buffer size limited
    if (this.logBuffer.length > this.maxLogEntries) {
      this.logBuffer = this.logBuffer.slice(-this.maxLogEntries);
    }

    // Save to localStorage periodically
    if (this.logToLocalStorage && this.logBuffer.length % 10 === 0) {
      this.flushToLocalStorage();
    }
  }

  private flushToLocalStorage(): void {
    try {
      const logs = JSON.stringify(this.logBuffer.slice(-100)); // Keep last 100 entries
      localStorage.setItem('yurucode_logs', logs);
    } catch (e) {
      // Silently fail if localStorage is full
    }
  }

  private log(level: LogLevel, message: string, data?: any): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context: this.context,
      data
    };

    // Capture stack trace for errors
    if (level >= LogLevel.ERROR) {
      entry.stack = new Error().stack;
    }

    // Save to buffer
    this.saveToBuffer(entry);

    // Console output
    if (this.logToConsole) {
      const formattedMessage = this.formatMessage(level, message, data);
      
      switch (level) {
        case LogLevel.DEBUG:
          console.debug(formattedMessage);
          break;
        case LogLevel.INFO:
          console.info(formattedMessage);
          break;
        case LogLevel.WARN:
          console.warn(formattedMessage);
          break;
        case LogLevel.ERROR:
        case LogLevel.FATAL:
          console.error(formattedMessage);
          if (entry.stack) {
            console.error(entry.stack);
          }
          break;
      }
    }

    // Send to remote logging service (when implemented)
    if (level >= LogLevel.ERROR && this.isProduction) {
      this.sendToRemote(entry);
    }
  }

  private sendToRemote(entry: LogEntry): void {
    // TODO: Integrate with Sentry or other logging service
    // For now, just store critical errors
    try {
      const criticalErrors = JSON.parse(
        localStorage.getItem('yurucode_critical_errors') || '[]'
      );
      criticalErrors.push(entry);
      // Keep only last 20 critical errors
      if (criticalErrors.length > 20) {
        criticalErrors.shift();
      }
      localStorage.setItem('yurucode_critical_errors', JSON.stringify(criticalErrors));
    } catch (e) {
      // Silently fail
    }
  }

  public debug(message: string, data?: any): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  public info(message: string, data?: any): void {
    this.log(LogLevel.INFO, message, data);
  }

  public warn(message: string, data?: any): void {
    this.log(LogLevel.WARN, message, data);
  }

  public error(message: string, data?: any): void {
    this.log(LogLevel.ERROR, message, data);
  }

  public fatal(message: string, data?: any): void {
    this.log(LogLevel.FATAL, message, data);
  }

  public getLogs(): LogEntry[] {
    return [...this.logBuffer];
  }

  public clearLogs(): void {
    this.logBuffer = [];
    localStorage.removeItem('yurucode_logs');
    localStorage.removeItem('yurucode_critical_errors');
  }

  public exportLogs(): string {
    return JSON.stringify(this.logBuffer, null, 2);
  }
}

// Export singleton instance
export const logger = Logger.getInstance();

// Export convenience functions
export const log = {
  debug: (message: string, data?: any) => logger.debug(message, data),
  info: (message: string, data?: any) => logger.info(message, data),
  warn: (message: string, data?: any) => logger.warn(message, data),
  error: (message: string, data?: any) => logger.error(message, data),
  fatal: (message: string, data?: any) => logger.fatal(message, data),
  setContext: (context: string) => logger.setContext(context),
  setLevel: (level: LogLevel) => logger.setLogLevel(level),
  getLogs: () => logger.getLogs(),
  clearLogs: () => logger.clearLogs(),
  exportLogs: () => logger.exportLogs()
};

// In development, expose logger to window for debugging
if (import.meta.env.DEV) {
  (window as any).yuruLogger = logger;
  (window as any).LogLevel = LogLevel;
}