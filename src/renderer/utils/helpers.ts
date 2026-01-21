/**
 * Shared utility functions for the renderer
 */

// Check if we're in development mode
export const isDev = import.meta.env?.DEV || (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development');

/**
 * Check if text starts with bash mode prefix ($ or !)
 */
export const isBashPrefix = (text: string): boolean => {
  return text.startsWith('$') || text.startsWith('!');
};

/**
 * Debug logging helper - only logs when in development mode
 */
export const debugLog = (...args: unknown[]): void => {
  if (isDev) {
    console.log(...args);
  }
};

/**
 * Conditional debug logging with custom flag
 */
export const createDebugLogger = (enabled: boolean | (() => boolean)) => {
  return (...args: unknown[]): void => {
    const shouldLog = typeof enabled === 'function' ? enabled() : enabled;
    if (shouldLog) {
      console.log(...args);
    }
  };
};

/**
 * Decode Claude's escaped project path to actual filesystem path.
 *
 * Claude encodes paths by replacing '/' with '-':
 *   /Users/yuru/yume-io -> -Users-yuru-yume-io
 *
 * The problem is this encoding is LOSSY - we can't tell if a '-' was
 * originally a '/' or a literal '-' in the path name.
 *
 * This function tries smart decoding by:
 * 1. Trying the naive decode (all - to /)
 * 2. If we have a checkPath function, trying variations to find existing path
 *
 * @param encodedPath - The encoded path from Claude (e.g., "-Users-yuru-yume-io")
 * @param checkPath - Optional async function to check if a path exists
 * @returns The decoded filesystem path
 */
export async function decodeClaudeProjectPath(
  encodedPath: string,
  checkPath?: (path: string) => Promise<boolean>
): Promise<string> {
  // Handle empty/null
  if (!encodedPath) return '';

  // Naive decode: replace leading - with /, then all - with /
  const naiveDecoded = encodedPath.replace(/^-/, '/').replace(/-/g, '/');

  // If no checkPath function, return naive decode
  if (!checkPath) {
    return naiveDecoded;
  }

  // Try naive decode first
  if (await checkPath(naiveDecoded)) {
    return naiveDecoded;
  }

  // Smart decode: try to find the path by preserving some dashes
  // Strategy: split into parts and try combining adjacent parts with '-'
  const parts = encodedPath.replace(/^-/, '').split('-');

  // Generate candidate paths by trying different dash placements
  // We'll try combining parts from right to left (since project names
  // with dashes are more likely at the end of the path)
  const candidates = generatePathCandidates(parts);

  for (const candidate of candidates) {
    if (await checkPath(candidate)) {
      return candidate;
    }
  }

  // Fallback to naive decode
  return naiveDecoded;
}

/**
 * Generate candidate paths by trying different dash placements.
 * Focuses on the last few path components where project names typically have dashes.
 */
function generatePathCandidates(parts: string[]): string[] {
  const candidates: string[] = [];

  if (parts.length <= 1) {
    return ['/' + parts.join('/')];
  }

  // Most common case: project name is last 2 parts joined with dash
  // e.g., ['Users', 'yuru', 'yume', 'io'] -> /Users/yuru/yume-io
  if (parts.length >= 2) {
    const lastTwo = [...parts.slice(0, -2), parts.slice(-2).join('-')];
    candidates.push('/' + lastTwo.join('/'));
  }

  // Try last 3 parts joined with dashes
  // e.g., ['Users', 'yuru', 'my', 'cool', 'project'] -> /Users/yuru/my-cool-project
  if (parts.length >= 3) {
    const lastThree = [...parts.slice(0, -3), parts.slice(-3).join('-')];
    candidates.push('/' + lastThree.join('/'));
  }

  // Try second-to-last part being the project name with dash
  // e.g., ['Users', 'yuru', 'yume', 'io', 'src'] -> /Users/yuru/yume-io/src
  if (parts.length >= 3) {
    const secondLastTwo = [...parts.slice(0, -3), parts.slice(-3, -1).join('-'), parts[parts.length - 1]];
    candidates.push('/' + secondLastTwo.join('/'));
  }

  return candidates;
}

/**
 * Synchronous version of decodeClaudeProjectPath for display purposes.
 * Uses heuristics without filesystem checks.
 *
 * @param encodedPath - The encoded path from Claude
 * @returns The best-guess decoded path
 */
export function decodeClaudeProjectPathSync(encodedPath: string): string {
  if (!encodedPath) return '';
  return encodedPath.replace(/^-/, '/').replace(/-/g, '/');
}

/**
 * Get the project name from an encoded Claude path.
 * This extracts just the folder name, not the full path.
 *
 * @param encodedPath - The encoded path from Claude
 * @returns The project folder name
 */
export function getProjectNameFromEncodedPath(encodedPath: string): string {
  if (!encodedPath) return '';

  // The encoded path is the full path with / replaced by -
  // We need to return the last component, but it might contain dashes
  // Since we can't reliably know which dashes are path separators,
  // we'll return the last "word" after the last likely path separator

  // Common pattern: -Users-username-projectname
  // Split and take the last part
  const parts = encodedPath.replace(/^-/, '').split('-');
  return parts[parts.length - 1] || encodedPath;
}
