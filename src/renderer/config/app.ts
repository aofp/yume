/**
 * Central app configuration - sourced from package.json at build time
 * Change the app name in package.json and it will update everywhere automatically
 *
 * IMPORTANT: To change the app name:
 * 1. Edit package.json "name" field
 * 2. Edit src-tauri/tauri.conf.json "productName" field (must match)
 * 3. Rebuild: npm run build or npm run tauri:dev
 */

// These are injected at build time by vite
// @ts-ignore - injected by vite
const packageName = import.meta.env.VITE_APP_NAME || 'yume';
// @ts-ignore - injected by vite
const packageVersion = import.meta.env.VITE_APP_VERSION || '0.1.0';
// @ts-ignore - injected by vite
const packageId = import.meta.env.VITE_APP_ID
  || packageName.toLowerCase().replace(/[^a-z0-9-]/g, '');

/**
 * App display name - used in UI (window title, about modal, etc.)
 * Sourced from package.json "name" field
 */
export const APP_NAME = packageName;

/**
 * App version - shown in about modal and welcome screen
 * Sourced from package.json "version" field
 */
export const APP_VERSION = packageVersion;

/**
 * App ID - internal identifier derived from package.json name
 * Used for: file paths (~/.{appId}/), localStorage keys, database names
 */
export const APP_ID = packageId;

/**
 * Agent prefix - uses APP_NAME for display (user-visible)
 * Shows as: {APP_NAME}-architect, {APP_NAME}-explorer, etc. in UI
 */
export const AGENT_PREFIX = packageName.toLowerCase();

/**
 * Plugin ID - internal identifier (defaults to APP_ID)
 * Used for the bundled core plugin in resources/{appId}-plugin/
 */
export const PLUGIN_ID = APP_ID;

/**
 * Helper to build app-scoped storage keys and event names.
 */
export const appStorageKey = (suffix: string, separator: '-' | '_' = '-') =>
  `${APP_ID}${separator}${suffix}`;

export const appEventName = (suffix: string) => `${APP_ID}-${suffix}`;

export const APP_AGENT_PREFIX = `${PLUGIN_ID}-`;
export const APP_COMMAND_PREFIX = `${PLUGIN_ID}--`;

/**
 * Author info - update these in package.json or here
 */
export const APP_AUTHOR = 'yurufrog';
export const APP_WEBSITE = 'yuru.be';
