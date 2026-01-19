/**
 * Version check service - checks for updates once every 24 hours
 * Fetches version.txt from github repo (aofp/yume)
 */

import { APP_VERSION } from '../config/app';

const VERSION_CHECK_URL = 'https://raw.githubusercontent.com/aofp/yume/main/version.txt';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const STORAGE_KEY = 'yume-version-check';

interface VersionCheckState {
  lastCheck: number;
  latestVersion: string | null;
  hasUpdate: boolean;
}

function getStoredState(): VersionCheckState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // ignore parse errors
  }
  return { lastCheck: 0, latestVersion: null, hasUpdate: false };
}

function saveState(state: VersionCheckState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage errors
  }
}

/**
 * Compare semantic versions
 * Returns: 1 if a > b, -1 if a < b, 0 if equal
 */
function compareVersions(a: string, b: string): number {
  const partsA = a.replace(/^v/, '').split('.').map(Number);
  const partsB = b.replace(/^v/, '').split('.').map(Number);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }
  return 0;
}

/**
 * Check for updates - only fetches if 24h+ since last check
 */
export async function checkForUpdates(force = false): Promise<VersionCheckState> {
  const state = getStoredState();
  const now = Date.now();

  // Skip if checked recently (unless forced)
  if (!force && state.lastCheck > 0 && (now - state.lastCheck) < CHECK_INTERVAL_MS) {
    return state;
  }

  try {
    const response = await fetch(VERSION_CHECK_URL, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const latestVersion = (await response.text()).trim();
    const hasUpdate = compareVersions(latestVersion, APP_VERSION) > 0;

    const newState: VersionCheckState = {
      lastCheck: now,
      latestVersion,
      hasUpdate
    };

    saveState(newState);
    return newState;
  } catch (error) {
    // On error, just update lastCheck to avoid hammering the server
    const errorState: VersionCheckState = {
      ...state,
      lastCheck: now
    };
    saveState(errorState);
    return errorState;
  }
}

/**
 * Get current version info without fetching
 */
export function getVersionInfo(): { current: string; latest: string | null; hasUpdate: boolean } {
  const state = getStoredState();
  return {
    current: APP_VERSION,
    latest: state.latestVersion,
    hasUpdate: state.hasUpdate
  };
}

/**
 * Get current app version
 */
export function getCurrentVersion(): string {
  return APP_VERSION;
}
