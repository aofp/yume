import { useEffect, useRef } from 'react';

interface PerformanceMetrics {
  renderCount: number;
  avgRenderTime: number;
  lastRenderTime: number;
  totalTime: number;
}

export function usePerformanceMonitor(componentName: string, enabled: boolean = false): PerformanceMetrics {
  const renderCount = useRef(0);
  const renderTimes = useRef<number[]>([]);
  const startTime = useRef<number>(0);
  const metrics = useRef<PerformanceMetrics>({
    renderCount: 0,
    avgRenderTime: 0,
    lastRenderTime: 0,
    totalTime: 0,
  });

  useEffect(() => {
    if (!enabled) return;
    
    startTime.current = performance.now();
    renderCount.current++;
    
    return () => {
      const endTime = performance.now();
      const duration = endTime - startTime.current;
      renderTimes.current.push(duration);
      
      // Keep only last 100 render times
      if (renderTimes.current.length > 100) {
        renderTimes.current.shift();
      }
      
      // Update metrics
      metrics.current.renderCount = renderCount.current;
      metrics.current.lastRenderTime = duration;
      metrics.current.totalTime = renderTimes.current.reduce((a, b) => a + b, 0);
      metrics.current.avgRenderTime = metrics.current.totalTime / renderTimes.current.length;
      
      // Log performance warnings
      if (duration > 100) {
        console.warn(`[PERF] ${componentName}: Slow render detected - ${duration.toFixed(2)}ms`);
      }
      
      // Log every 50 renders
      if (renderCount.current % 50 === 0) {
        console.log(`[PERF] ${componentName} Metrics:`, {
          renders: renderCount.current,
          avgTime: `${metrics.current.avgRenderTime.toFixed(2)}ms`,
          lastTime: `${duration.toFixed(2)}ms`,
        });
      }
    };
  });
  
  return metrics.current;
}

// Memory usage monitor
export function useMemoryMonitor(threshold: number = 200) {
  const checkInterval = useRef<NodeJS.Timer | null>(null);
  
  useEffect(() => {
    if (!('memory' in performance)) return;
    
    const checkMemory = () => {
      const memoryInfo = (performance as any).memory;
      const usedMB = memoryInfo.usedJSHeapSize / (1024 * 1024);
      const limitMB = memoryInfo.jsHeapSizeLimit / (1024 * 1024);
      const percentage = (usedMB / limitMB) * 100;
      
      if (usedMB > threshold) {
        console.warn(`[MEMORY] High memory usage: ${usedMB.toFixed(2)}MB (${percentage.toFixed(1)}% of limit)`);
      }
    };
    
    // Check every 30 seconds
    checkInterval.current = setInterval(checkMemory, 30000);
    
    // Initial check
    checkMemory();
    
    return () => {
      if (checkInterval.current) {
        clearInterval(checkInterval.current);
      }
    };
  }, [threshold]);
}