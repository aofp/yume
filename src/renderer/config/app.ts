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
const packageName = import.meta.env.VITE_APP_NAME || 'yurucode';
// @ts-ignore - injected by vite
const packageVersion = import.meta.env.VITE_APP_VERSION || '0.1.0';

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
 * App ID - FIXED internal identifier (always "yurucode")
 * Used for: file paths (~/.yurucode/), localStorage keys, database names
 * This NEVER changes to maintain backwards compatibility with existing installations
 */
export const APP_ID = 'yurucode';

/**
 * Agent prefix - uses APP_NAME for display (user-visible)
 * Shows as: {APP_NAME}-architect, {APP_NAME}-explorer, etc. in UI
 * Files still saved as: yurucode-architect.md (APP_ID)
 */
export const AGENT_PREFIX = packageName.toLowerCase();

/**
 * Plugin ID - FIXED (always "yurucode")
 * Used for the bundled core plugin in resources/yurucode-plugin/
 */
export const PLUGIN_ID = 'yurucode';

/**
 * Author info - update these in package.json or here
 */
export const APP_AUTHOR = 'yurufrog';
export const APP_WEBSITE = 'yuru.be';
