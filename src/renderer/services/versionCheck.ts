/**
 * Version check service - checks for updates on app start
 * Fetches version.txt from github repo (aofp/yume)
 */

import { APP_VERSION } from '../config/app';

const VERSION_CHECK_URL = 'https://raw.githubusercontent.com/aofp/yume/main/version.txt';
const STORAGE_KEY = 'yume-version-check';

interface VersionCheckState {
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
  return { latestVersion: null, hasUpdate: false };
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
 * Check for updates - fetches on every call (app start)
 */
export async function checkForUpdates(): Promise<VersionCheckState> {
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
      latestVersion,
      hasUpdate
    };

    saveState(newState);
    return newState;
  } catch (error) {
    // On error, return stored state
    return getStoredState();
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
