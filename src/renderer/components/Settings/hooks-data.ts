// Yume built-in hooks
// The guard hook has been moved to the yume plugin
// Additional built-in hooks can be added here

export const YUME_HOOKS: Array<{
  id: string;
  name: string;
  icon?: React.ComponentType<{ size?: number }>;
  description: string;
  script: string;
}> = [
  // Guard hook is now provided by the yume plugin
  // Add other built-in hooks here if needed
];
