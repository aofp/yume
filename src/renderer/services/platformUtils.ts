/**
 * Platform detection utilities
 */

export function isMacOS(): boolean {
  return navigator.platform.toLowerCase().includes('mac');
}

export function isWindows(): boolean {
  return navigator.platform.toLowerCase().includes('win');
}

export function isLinux(): boolean {
  const platform = navigator.platform.toLowerCase();
  return platform.includes('linux') || platform.includes('x11');
}
