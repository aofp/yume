/**
 * Path security utilities
 * Prevents path traversal attacks and validates paths stay within cwd
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';

export interface PathValidationResult {
  valid: boolean;
  resolvedPath: string;
  error?: string;
}

/**
 * Validate a path is within the allowed directory (cwd)
 * Prevents path traversal attacks (e.g., ../../../etc/passwd)
 */
export function validatePath(
  inputPath: string,
  cwd: string
): PathValidationResult {
  // Resolve to absolute path
  const resolvedPath = path.isAbsolute(inputPath)
    ? path.normalize(inputPath)
    : path.resolve(cwd, inputPath);

  // Normalize both paths for comparison
  const normalizedCwd = path.normalize(cwd);
  const normalizedResolved = path.normalize(resolvedPath);

  // Check if resolved path is within cwd (or is cwd itself)
  // Using startsWith after normalization prevents traversal attacks
  const isWithinCwd =
    normalizedResolved === normalizedCwd ||
    normalizedResolved.startsWith(normalizedCwd + path.sep);

  // Also allow absolute paths that are explicitly requested
  // but block obvious sensitive paths
  const blockedPaths = [
    '/etc',
    '/var',
    '/usr',
    '/bin',
    '/sbin',
    '/root',
    '/home',
    '/private',
    '/System',
    '/Library',
    '/Applications',
    'C:\\Windows',
    'C:\\Program Files',
    'C:\\Users',
  ];

  const isBlockedPath = blockedPaths.some(
    (blocked) =>
      normalizedResolved === blocked ||
      normalizedResolved.startsWith(blocked + path.sep)
  );

  // Allow paths within cwd, or absolute paths outside cwd that aren't blocked
  // This matches Claude CLI behavior - can access files outside cwd but not system dirs
  if (isWithinCwd) {
    return { valid: true, resolvedPath: normalizedResolved };
  }

  if (isBlockedPath) {
    return {
      valid: false,
      resolvedPath: normalizedResolved,
      error: `Access denied: cannot access system path ${normalizedResolved}`,
    };
  }

  // Check for traversal attempts (.. in path leading outside cwd)
  if (inputPath.includes('..')) {
    // If it's an absolute path after resolution and not blocked, allow it
    // But if it was a relative path with .., check if it stays within cwd
    const segments = inputPath.split(path.sep);
    if (segments.includes('..') && !isWithinCwd) {
      return {
        valid: false,
        resolvedPath: normalizedResolved,
        error: `Path traversal detected: ${inputPath} resolves outside working directory`,
      };
    }
  }

  // Allow other absolute paths (user explicitly requested them)
  return { valid: true, resolvedPath: normalizedResolved };
}

/**
 * Validate path for read operations
 * More permissive - allows reading files outside cwd
 */
export function validatePathForRead(
  inputPath: string,
  cwd: string
): PathValidationResult {
  const result = validatePath(inputPath, cwd);
  if (!result.valid) {
    return result;
  }

  // Additional check: prevent reading sensitive files
  const sensitiveFiles = [
    '.env',
    '.env.local',
    '.env.production',
    'credentials.json',
    'secrets.json',
    '.aws/credentials',
    '.ssh/id_rsa',
    '.ssh/id_ed25519',
    '.gnupg',
    'id_rsa',
    'id_ed25519',
  ];

  const basename = path.basename(result.resolvedPath);
  const relativePath = result.resolvedPath.replace(/\\/g, '/');

  const isSensitive = sensitiveFiles.some(
    (sensitive) =>
      basename === sensitive || relativePath.includes(`/${sensitive}`)
  );

  if (isSensitive) {
    return {
      valid: false,
      resolvedPath: result.resolvedPath,
      error: `Access denied: cannot read sensitive file ${basename}`,
    };
  }

  return result;
}

/**
 * Validate path for write operations
 * More restrictive - must stay within cwd
 */
export function validatePathForWrite(
  inputPath: string,
  cwd: string
): PathValidationResult {
  const result = validatePath(inputPath, cwd);
  if (!result.valid) {
    return result;
  }

  // For writes, must be within cwd
  const normalizedCwd = path.normalize(cwd);
  const isWithinCwd =
    result.resolvedPath === normalizedCwd ||
    result.resolvedPath.startsWith(normalizedCwd + path.sep);

  if (!isWithinCwd) {
    return {
      valid: false,
      resolvedPath: result.resolvedPath,
      error: `Write access denied: path must be within working directory`,
    };
  }

  return result;
}

/**
 * Sanitize filename to prevent injection
 */
export function sanitizeFilename(filename: string): string {
  // Remove null bytes and other dangerous characters
  return filename
    .replace(/\0/g, '') // null bytes
    .replace(/[<>:"|?*]/g, '') // Windows forbidden chars
    .replace(/\.\./g, '.'); // double dots
}
