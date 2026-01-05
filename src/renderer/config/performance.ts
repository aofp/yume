// Performance configuration - optimized for snappy responsiveness

export const PERFORMANCE_CONFIG = {
  // Message rendering
  VIRTUALIZATION_THRESHOLD: 50, // Use virtualization when messages exceed this count
  VIRTUAL_OVERSCAN: 25, // Number of items to render outside viewport (aggressive to eliminate flicker)
  MESSAGE_BATCH_SIZE: 10, // Process messages in batches

  // Debouncing delays (ms)
  SEARCH_DEBOUNCE: 250,
  TYPING_DEBOUNCE: 50,
  RESIZE_DEBOUNCE: 150,
  SCROLL_THROTTLE: 32, // ~30fps for smooth scroll handling

  // Memory management
  MAX_MESSAGES_IN_MEMORY: 2000,
  MAX_CACHE_SIZE: 100, // MB
  CLEANUP_INTERVAL: 60000, // 1 minute

  // Auto-save and checkpoint
  AUTO_SAVE_INTERVAL: 30000, // 30 seconds
  AUTO_CHECKPOINT_MESSAGES: 20,
  AUTO_CHECKPOINT_TOKENS: 5000,

  // Network and socket
  SOCKET_RECONNECT_DELAY: 1000,
  SOCKET_MAX_RECONNECT_ATTEMPTS: 5,
  REQUEST_TIMEOUT: 30000, // 30 seconds

  // UI responsiveness - snappy 100ms transitions
  ANIMATION_DURATION: 100,
  TRANSITION_DURATION: 100,
  LOADER_DELAY: 80,

  // Performance monitoring
  ENABLE_PERFORMANCE_MONITORING: false,
  LOG_SLOW_RENDERS: true,
  SLOW_RENDER_THRESHOLD: 100, // ms
  LOG_MEMORY_USAGE: true,
  MEMORY_WARNING_THRESHOLD: 200, // MB

  // Feature flags
  USE_WEB_WORKERS: false,
  USE_INDEXED_DB: false,
  USE_SERVICE_WORKER: false,
  ENABLE_OFFLINE_MODE: false,
};

// Apply performance configuration to CSS variables
export function applyPerformanceConfig(config: Partial<typeof PERFORMANCE_CONFIG>) {
  Object.assign(PERFORMANCE_CONFIG, config);

  document.documentElement.style.setProperty('--animation-duration', `${config.ANIMATION_DURATION ?? PERFORMANCE_CONFIG.ANIMATION_DURATION}ms`);
  document.documentElement.style.setProperty('--transition-duration', `${config.TRANSITION_DURATION ?? PERFORMANCE_CONFIG.TRANSITION_DURATION}ms`);
  document.documentElement.style.setProperty('--gpu-acceleration', 'auto');
}
