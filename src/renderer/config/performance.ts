// Performance configuration and thresholds

export const PERFORMANCE_CONFIG = {
  // Message rendering
  VIRTUALIZATION_THRESHOLD: 20, // Use virtualization when messages exceed this count
  VIRTUAL_OVERSCAN: 5, // Number of items to render outside viewport
  MESSAGE_BATCH_SIZE: 10, // Process messages in batches
  
  // Debouncing delays (ms)
  SEARCH_DEBOUNCE: 300,
  TYPING_DEBOUNCE: 100,
  RESIZE_DEBOUNCE: 200,
  SCROLL_THROTTLE: 50,
  
  // Memory management
  MAX_MESSAGES_IN_MEMORY: 1000,
  MAX_CACHE_SIZE: 100, // MB
  CLEANUP_INTERVAL: 60000, // 1 minute
  
  // Auto-save and checkpoint
  AUTO_SAVE_INTERVAL: 30000, // 30 seconds
  AUTO_CHECKPOINT_MESSAGES: 10, // Create checkpoint every N messages
  AUTO_CHECKPOINT_TOKENS: 5000, // Create checkpoint every N tokens
  
  // Network and socket
  SOCKET_RECONNECT_DELAY: 1000,
  SOCKET_MAX_RECONNECT_ATTEMPTS: 5,
  REQUEST_TIMEOUT: 30000, // 30 seconds
  
  // UI responsiveness
  ANIMATION_DURATION: 200, // ms
  TRANSITION_DURATION: 150, // ms
  LOADER_DELAY: 100, // Show loader after N ms
  
  // Performance monitoring
  ENABLE_PERFORMANCE_MONITORING: false,
  LOG_SLOW_RENDERS: true,
  SLOW_RENDER_THRESHOLD: 100, // ms
  LOG_MEMORY_USAGE: true,
  MEMORY_WARNING_THRESHOLD: 200, // MB
  
  // Feature flags for performance
  USE_WEB_WORKERS: false,
  USE_INDEXED_DB: false,
  USE_SERVICE_WORKER: false,
  ENABLE_OFFLINE_MODE: false,
};

// Performance presets
export const PERFORMANCE_PRESETS = {
  low: {
    VIRTUALIZATION_THRESHOLD: 10,
    VIRTUAL_OVERSCAN: 3,
    MAX_MESSAGES_IN_MEMORY: 500,
    AUTO_CHECKPOINT_MESSAGES: 5,
    ANIMATION_DURATION: 0,
    TRANSITION_DURATION: 0,
  },
  medium: {
    VIRTUALIZATION_THRESHOLD: 20,
    VIRTUAL_OVERSCAN: 5,
    MAX_MESSAGES_IN_MEMORY: 1000,
    AUTO_CHECKPOINT_MESSAGES: 10,
    ANIMATION_DURATION: 150,
    TRANSITION_DURATION: 100,
  },
  high: {
    VIRTUALIZATION_THRESHOLD: 50,
    VIRTUAL_OVERSCAN: 10,
    MAX_MESSAGES_IN_MEMORY: 2000,
    AUTO_CHECKPOINT_MESSAGES: 20,
    ANIMATION_DURATION: 200,
    TRANSITION_DURATION: 150,
  },
};

// Device detection and auto-configuration
export function getOptimalPerformanceConfig() {
  // Check device capabilities
  const memory = (navigator as any).deviceMemory || 4; // GB
  const cores = navigator.hardwareConcurrency || 4;
  const connection = (navigator as any).connection;
  
  // Determine performance level
  let preset = 'medium';
  
  if (memory <= 2 || cores <= 2) {
    preset = 'low';
  } else if (memory >= 8 && cores >= 8) {
    preset = 'high';
  }
  
  // Check connection speed
  if (connection) {
    const effectiveType = connection.effectiveType;
    if (effectiveType === 'slow-2g' || effectiveType === '2g') {
      preset = 'low';
    }
  }
  
  // Check if running on battery
  if ((navigator as any).getBattery) {
    (navigator as any).getBattery().then((battery: any) => {
      if (!battery.charging && battery.level < 0.2) {
        preset = 'low';
      }
    });
  }
  
  console.log(`Performance preset: ${preset} (${memory}GB RAM, ${cores} cores)`);
  
  return {
    ...PERFORMANCE_CONFIG,
    ...PERFORMANCE_PRESETS[preset as keyof typeof PERFORMANCE_PRESETS],
  };
}

// Apply performance configuration
export function applyPerformanceConfig(config: Partial<typeof PERFORMANCE_CONFIG>) {
  Object.assign(PERFORMANCE_CONFIG, config);
  
  // Apply CSS performance optimizations
  if (config.ANIMATION_DURATION === 0) {
    document.documentElement.style.setProperty('--animation-duration', '0ms');
    document.documentElement.style.setProperty('--transition-duration', '0ms');
  } else {
    document.documentElement.style.setProperty('--animation-duration', `${config.ANIMATION_DURATION}ms`);
    document.documentElement.style.setProperty('--transition-duration', `${config.TRANSITION_DURATION}ms`);
  }
  
  // Enable/disable GPU acceleration
  if (config.ANIMATION_DURATION === 0) {
    document.documentElement.style.setProperty('--gpu-acceleration', 'none');
  } else {
    document.documentElement.style.setProperty('--gpu-acceleration', 'auto');
  }
}