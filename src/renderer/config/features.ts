// All features enabled for production use
export const FEATURE_FLAGS = {
  // Message virtualization for performance
  USE_VIRTUALIZATION: true,
  
  // Checkpoint system
  ENABLE_CHECKPOINTS: true,
  
  // Timeline UI
  SHOW_TIMELINE: true,
  
  // Agent execution
  ENABLE_AGENT_EXECUTION: true,
  
  // Native Rust execution (NEVER enable until fully tested)
  USE_NATIVE_RUST: false,
};

// Helper to check if a feature is enabled
export function isFeatureEnabled(feature: keyof typeof FEATURE_FLAGS): boolean {
  return FEATURE_FLAGS[feature];
}