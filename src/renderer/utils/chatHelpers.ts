// Chat helper functions extracted from ClaudeChat.tsx

import { appStorageKey } from '../config/app';

const COMMANDS_KEY = appStorageKey('commands', '_');

// Cached custom commands to avoid parsing localStorage on every command execution
let cachedCustomCommands: any[] | null = null;
let cachedCommandsTimestamp = 0;

export const getCachedCustomCommands = () => {
  // Refresh cache every 5 seconds or on first access
  const now = Date.now();
  if (!cachedCustomCommands || now - cachedCommandsTimestamp > 5000) {
    try {
      cachedCustomCommands = JSON.parse(localStorage.getItem(COMMANDS_KEY) || '[]');
      cachedCommandsTimestamp = now;
    } catch {
      cachedCustomCommands = [];
    }
  }
  return cachedCustomCommands;
};

// Call this when commands are updated to invalidate cache
export const invalidateCommandsCache = () => {
  cachedCustomCommands = null;
  cachedCommandsTimestamp = 0;
};

// Format reset time as relative time string
export const formatResetTime = (resetAt: string | undefined): string => {
  if (!resetAt) return '';
  const resetDate = new Date(resetAt);
  const now = new Date();
  const diffMs = resetDate.getTime() - now.getTime();
  if (diffMs <= 0) return 'now';
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (diffHours > 24) {
    const days = Math.floor(diffHours / 24);
    const hrs = diffHours % 24;
    return hrs > 0 ? `${days}d ${hrs}h` : `${days}d`;
  }
  if (diffHours > 0) return `${diffHours}h ${diffMins}m`;
  return `${diffMins}m`;
};

// Format bytes helper
export const formatBytes = (b: number): string => {
  if (b < 1024) return `${b} bytes`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)}kb`;
  return `${(b / (1024 * 1024)).toFixed(1)}mb`;
};
