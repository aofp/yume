/**
 * Console Override for Production
 * Automatically routes console statements through our logger in production
 * Preserves console behavior in development
 */

import { appStorageKey } from '../config/app';
import { log, LogLevel } from './logger';

const DEBUG_MODE_KEY = appStorageKey('debug_mode', '_');

// Store original console methods
const originalConsole = {
  log: console.log,
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error,
  trace: console.trace,
  group: console.group,
  groupCollapsed: console.groupCollapsed,
  groupEnd: console.groupEnd,
  time: console.time,
  timeEnd: console.timeEnd,
  clear: console.clear,
  table: console.table,
  count: console.count,
  assert: console.assert
};

// Export for restoring if needed
export const restoreConsole = () => {
  Object.assign(console, originalConsole);
};

// Initialize console override
export const initConsoleOverride = () => {
  const isProduction = import.meta.env.PROD;
  const debugMode = localStorage.getItem(DEBUG_MODE_KEY) === 'true';
  
  // In development or debug mode, keep original console
  if (!isProduction || debugMode) {
    // Still track console usage for migration purposes
    if (!isProduction) {
      trackConsoleUsage();
    }
    return;
  }

  // Override console methods in production
  console.log = (...args: any[]) => {
    const message = formatConsoleArgs(args);
    log.info(message);
  };

  console.debug = (...args: any[]) => {
    const message = formatConsoleArgs(args);
    log.debug(message);
  };

  console.info = (...args: any[]) => {
    const message = formatConsoleArgs(args);
    log.info(message);
  };

  console.warn = (...args: any[]) => {
    const message = formatConsoleArgs(args);
    log.warn(message);
  };

  console.error = (...args: any[]) => {
    const message = formatConsoleArgs(args);
    const errorData = extractErrorData(args);
    log.error(message, errorData);
  };

  console.trace = (...args: any[]) => {
    const message = formatConsoleArgs(args);
    const stack = new Error().stack;
    log.debug(`[TRACE] ${message}`, { stack });
  };

  // Group methods - just log the group name
  console.group = (...args: any[]) => {
    const message = formatConsoleArgs(args);
    log.info(`[GROUP START] ${message}`);
  };

  console.groupCollapsed = (...args: any[]) => {
    const message = formatConsoleArgs(args);
    log.info(`[GROUP START] ${message}`);
  };

  console.groupEnd = () => {
    log.debug('[GROUP END]');
  };

  // Timing methods
  const timers = new Map<string, number>();
  
  console.time = (label: string = 'default') => {
    timers.set(label, Date.now());
    log.debug(`[TIMER START] ${label}`);
  };

  console.timeEnd = (label: string = 'default') => {
    const start = timers.get(label);
    if (start) {
      const duration = Date.now() - start;
      timers.delete(label);
      log.info(`[TIMER END] ${label}: ${duration}ms`);
    }
  };

  // Count method
  const counters = new Map<string, number>();
  
  console.count = (label: string = 'default') => {
    const count = (counters.get(label) || 0) + 1;
    counters.set(label, count);
    log.debug(`[COUNT] ${label}: ${count}`);
  };

  // Assert method
  console.assert = (condition: boolean, ...args: any[]) => {
    if (!condition) {
      const message = formatConsoleArgs(args);
      log.error(`[ASSERTION FAILED] ${message}`);
    }
  };

  // Table method - convert to structured log
  console.table = (data: any) => {
    log.info('[TABLE DATA]', { table: data });
  };

  // Clear method - just log that it was called
  console.clear = () => {
    log.debug('[CONSOLE CLEAR]');
  };
};

// Format console arguments into a string
function formatConsoleArgs(args: any[]): string {
  return args.map(arg => {
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg, null, 2);
      } catch (e) {
        return String(arg);
      }
    }
    return String(arg);
  }).join(' ');
}

// Extract error data from console arguments
function extractErrorData(args: any[]): any {
  const errorObjects = args.filter(arg => 
    arg instanceof Error || 
    (typeof arg === 'object' && arg && 'stack' in arg)
  );
  
  if (errorObjects.length > 0) {
    return {
      errors: errorObjects.map(err => ({
        message: err.message || String(err),
        stack: err.stack,
        name: err.name
      }))
    };
  }
  
  return undefined;
}

// Track console usage in development for migration purposes
function trackConsoleUsage() {
  const usageMap = new Map<string, number>();
  const stackTraces = new Map<string, Set<string>>();
  
  const trackUsage = (method: string, stack: string) => {
    usageMap.set(method, (usageMap.get(method) || 0) + 1);
    
    // Extract file location from stack
    const match = stack.match(/at\s+.*?\s+\((.*?:\d+:\d+)\)/);
    if (match) {
      const location = match[1];
      if (!stackTraces.has(method)) {
        stackTraces.set(method, new Set());
      }
      stackTraces.get(method)!.add(location);
    }
  };
  
  // Wrap console methods to track usage
  ['log', 'debug', 'info', 'warn', 'error'].forEach(method => {
    const original = (console as any)[method];
    (console as any)[method] = (...args: any[]) => {
      const stack = new Error().stack || '';
      trackUsage(method, stack);
      original.apply(console, args);
    };
  });
  
  // Report usage statistics every 30 seconds in development
  if (!import.meta.env.PROD) {
    setInterval(() => {
      if (usageMap.size > 0) {
        const report = {
          totalCalls: Array.from(usageMap.values()).reduce((a, b) => a + b, 0),
          byMethod: Object.fromEntries(usageMap),
          locations: Object.fromEntries(
            Array.from(stackTraces.entries()).map(([method, locations]) => [
              method,
              Array.from(locations).slice(0, 5) // Top 5 locations
            ])
          )
        };
        
        // Use original console to avoid recursion
        originalConsole.debug('[Console Usage Report]', report);
      }
    }, 30000);
  }
}

// Auto-initialize on import
if (typeof window !== 'undefined') {
  // Initialize after a small delay to ensure logger is ready
  setTimeout(() => {
    initConsoleOverride();
  }, 0);
}
