/**
 * Performance Monitoring Service
 * Tracks critical performance metrics for production optimization
 */

import { log } from '../utils/logger';

interface PerformanceMetric {
  name: string;
  value: number;
  unit: 'ms' | 'bytes' | 'percent' | 'count';
  timestamp: number;
  tags?: Record<string, string>;
}

interface PerformanceThreshold {
  metric: string;
  warning: number;
  critical: number;
  unit: 'ms' | 'bytes' | 'percent' | 'count';
}

class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: Map<string, PerformanceMetric[]> = new Map();
  private marks: Map<string, number> = new Map();
  private measures: Map<string, number[]> = new Map();
  private observer: PerformanceObserver | null = null;
  private rafHandle: number | null = null;
  private lastFrameTime: number = 0;
  private frameCount: number = 0;
  private enabled: boolean = !import.meta.env.PROD || localStorage.getItem('yurucode_perf_monitor') === 'true';
  
  // Performance thresholds
  private thresholds: PerformanceThreshold[] = [
    { metric: 'app.startup', warning: 3000, critical: 5000, unit: 'ms' },
    { metric: 'render.frame', warning: 16, critical: 33, unit: 'ms' },
    { metric: 'memory.heap', warning: 100 * 1024 * 1024, critical: 200 * 1024 * 1024, unit: 'bytes' },
    { metric: 'session.create', warning: 1000, critical: 2000, unit: 'ms' },
    { metric: 'message.send', warning: 500, critical: 1000, unit: 'ms' },
    { metric: 'compact.duration', warning: 5000, critical: 10000, unit: 'ms' }
  ];

  private constructor() {
    if (this.enabled) {
      this.initializeObserver();
      this.startMemoryMonitoring();
      this.startFPSMonitoring();
    }
  }

  public static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  private initializeObserver(): void {
    if (typeof PerformanceObserver === 'undefined') {
      return;
    }

    try {
      // Observe navigation timing
      const navObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'navigation') {
            const nav = entry as PerformanceNavigationTiming;
            this.recordMetric('app.startup', nav.loadEventEnd - nav.fetchStart, 'ms');
            this.recordMetric('dom.interactive', nav.domInteractive - nav.fetchStart, 'ms');
            this.recordMetric('dom.complete', nav.domComplete - nav.fetchStart, 'ms');
          }
        }
      });
      navObserver.observe({ entryTypes: ['navigation'] });

      // Observe long tasks (blocking main thread)
      if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
        const taskObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.duration > 50) { // Tasks longer than 50ms
              this.recordMetric('main.blocked', entry.duration, 'ms', {
                taskName: entry.name
              });
              
              // Log if task is too long
              if (entry.duration > 200) {
                log.warn(`Long task detected: ${entry.name} (${entry.duration}ms)`);
              }
            }
          }
        });
        taskObserver.observe({ entryTypes: ['longtask'] });
      }

      // Observe layout shifts (for UI stability)
      if (PerformanceObserver.supportedEntryTypes.includes('layout-shift')) {
        let cumulativeScore = 0;
        const layoutObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const layoutShift = entry as any;
            if (!layoutShift.hadRecentInput) {
              cumulativeScore += layoutShift.value;
              this.recordMetric('ui.layout_shift', cumulativeScore, 'count');
            }
          }
        });
        layoutObserver.observe({ entryTypes: ['layout-shift'] });
      }
    } catch (error) {
      log.error('Failed to initialize performance observer', { error });
    }
  }

  private startMemoryMonitoring(): void {
    if (!(performance as any).memory) {
      return;
    }

    // Monitor memory every 30 seconds
    setInterval(() => {
      const memory = (performance as any).memory;
      this.recordMetric('memory.heap', memory.usedJSHeapSize, 'bytes');
      this.recordMetric('memory.heap_limit', memory.jsHeapSizeLimit, 'bytes');
      
      // Calculate heap usage percentage
      const heapUsagePercent = (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100;
      this.recordMetric('memory.heap_usage', heapUsagePercent, 'percent');
      
      // Warn if memory usage is high
      if (heapUsagePercent > 80) {
        log.warn('High memory usage detected', {
          used: memory.usedJSHeapSize,
          limit: memory.jsHeapSizeLimit,
          percent: heapUsagePercent
        });
      }
    }, 30000);
  }

  private startFPSMonitoring(): void {
    let frameCount = 0;
    let lastTime = performance.now();
    let fpsHistory: number[] = [];

    const measureFPS = () => {
      const currentTime = performance.now();
      frameCount++;

      // Calculate FPS every second
      if (currentTime >= lastTime + 1000) {
        const fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
        frameCount = 0;
        lastTime = currentTime;
        
        fpsHistory.push(fps);
        if (fpsHistory.length > 10) {
          fpsHistory.shift();
        }

        // Calculate average FPS
        const avgFPS = fpsHistory.reduce((a, b) => a + b, 0) / fpsHistory.length;
        this.recordMetric('render.fps', avgFPS, 'count');

        // Warn if FPS is low
        if (avgFPS < 30) {
          log.warn('Low FPS detected', { fps: avgFPS });
        }
      }

      this.rafHandle = requestAnimationFrame(measureFPS);
    };

    measureFPS();
  }

  /**
   * Start a performance measurement
   */
  public mark(name: string): void {
    if (!this.enabled) return;
    
    this.marks.set(name, performance.now());
    performance.mark(`yurucode-${name}-start`);
  }

  /**
   * End a performance measurement
   */
  public measure(name: string, startMark?: string): number | null {
    if (!this.enabled) return null;

    const endTime = performance.now();
    const startTime = startMark 
      ? this.marks.get(startMark) 
      : this.marks.get(name);

    if (!startTime) {
      log.warn(`No start mark found for ${name}`);
      return null;
    }

    const duration = endTime - startTime;
    
    // Store measure
    if (!this.measures.has(name)) {
      this.measures.set(name, []);
    }
    this.measures.get(name)!.push(duration);

    // Use Performance API if available
    try {
      performance.mark(`yurucode-${name}-end`);
      performance.measure(
        `yurucode-${name}`,
        `yurucode-${startMark || name}-start`,
        `yurucode-${name}-end`
      );
    } catch (e) {
      // Ignore if marks don't exist
    }

    // Record metric
    this.recordMetric(name, duration, 'ms');

    // Clean up mark
    this.marks.delete(startMark || name);

    return duration;
  }

  /**
   * Record a performance metric
   */
  public recordMetric(
    name: string, 
    value: number, 
    unit: 'ms' | 'bytes' | 'percent' | 'count' = 'ms',
    tags?: Record<string, string>
  ): void {
    if (!this.enabled) return;

    const metric: PerformanceMetric = {
      name,
      value,
      unit,
      timestamp: Date.now(),
      tags
    };

    // Store metric
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    const metricList = this.metrics.get(name)!;
    metricList.push(metric);

    // Keep only last 100 metrics per name
    if (metricList.length > 100) {
      metricList.shift();
    }

    // Check thresholds
    this.checkThreshold(metric);

    // Log in development
    if (!import.meta.env.PROD) {
      log.debug(`Performance metric: ${name}`, { value, unit, tags });
    }
  }

  private checkThreshold(metric: PerformanceMetric): void {
    const threshold = this.thresholds.find(t => t.metric === metric.name);
    if (!threshold) return;

    if (metric.value >= threshold.critical) {
      log.error(`Performance critical: ${metric.name}`, {
        value: metric.value,
        threshold: threshold.critical,
        unit: metric.unit
      });
      
    } else if (metric.value >= threshold.warning) {
      log.warn(`Performance warning: ${metric.name}`, {
        value: metric.value,
        threshold: threshold.warning,
        unit: metric.unit
      });
    }
  }

  /**
   * Get metrics summary
   */
  public getMetricsSummary(): Record<string, any> {
    const summary: Record<string, any> = {};

    for (const [name, metrics] of this.metrics.entries()) {
      if (metrics.length === 0) continue;

      const values = metrics.map(m => m.value);
      const sum = values.reduce((a, b) => a + b, 0);
      const avg = sum / values.length;
      const min = Math.min(...values);
      const max = Math.max(...values);

      // Calculate percentiles
      const sorted = [...values].sort((a, b) => a - b);
      const p50 = sorted[Math.floor(sorted.length * 0.5)];
      const p90 = sorted[Math.floor(sorted.length * 0.9)];
      const p99 = sorted[Math.floor(sorted.length * 0.99)];

      summary[name] = {
        count: values.length,
        avg: Math.round(avg * 100) / 100,
        min: Math.round(min * 100) / 100,
        max: Math.round(max * 100) / 100,
        p50: Math.round(p50 * 100) / 100,
        p90: Math.round(p90 * 100) / 100,
        p99: Math.round(p99 * 100) / 100,
        unit: metrics[0].unit
      };
    }

    return summary;
  }

  /**
   * Clear all metrics
   */
  public clear(): void {
    this.metrics.clear();
    this.marks.clear();
    this.measures.clear();
  }

  /**
   * Export metrics for analysis
   */
  public exportMetrics(): string {
    const data = {
      timestamp: new Date().toISOString(),
      summary: this.getMetricsSummary(),
      raw: Array.from(this.metrics.entries()).map(([name, metrics]) => ({
        name,
        metrics: metrics.slice(-20) // Last 20 entries
      }))
    };
    
    return JSON.stringify(data, null, 2);
  }

  /**
   * Enable/disable monitoring
   */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    localStorage.setItem('yurucode_perf_monitor', enabled ? 'true' : 'false');
    
    if (enabled && !this.observer) {
      this.initializeObserver();
      this.startMemoryMonitoring();
      this.startFPSMonitoring();
    } else if (!enabled) {
      if (this.rafHandle) {
        cancelAnimationFrame(this.rafHandle);
        this.rafHandle = null;
      }
    }
  }

  /**
   * Destroy the monitor
   */
  public destroy(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    
    if (this.rafHandle) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
    
    this.clear();
  }
}

// Export singleton instance
export const perfMonitor = PerformanceMonitor.getInstance();

// Track initial page load
if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    perfMonitor.recordMetric('page.load', performance.now(), 'ms');
  });
}

// Expose to window for debugging in development
if (import.meta.env.DEV) {
  (window as any).perfMonitor = perfMonitor;
}