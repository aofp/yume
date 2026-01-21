/**
 * Claude CLI Detection Service
 * Detects both native Windows and WSL Claude installations
 */

import { invoke } from '@tauri-apps/api/core';
import { isDev } from '../utils/helpers';
import { logger } from '../utils/structuredLogger';

export type ClaudeExecutionMode = 'native-windows' | 'wsl' | 'native' | 'auto';

export interface ClaudeInstallation {
  type: 'native-windows' | 'wsl';
  path: string;
  version?: string;
  isValid: boolean;
  wslUser?: string; // For WSL installations
  wslDistro?: string; // For WSL installations
}

export interface ClaudeDetectionResult {
  nativeWindows?: ClaudeInstallation;
  wsl?: ClaudeInstallation;
  recommended: 'native-windows' | 'wsl' | null;
  lastDetection: number;
}

export interface ClaudeSettings {
  executionMode: ClaudeExecutionMode;
  customPath?: string;
  preferredInstallation?: ClaudeInstallation;
  autoDetect: boolean;
}

// Interface for Windows paths from Tauri backend
interface WindowsPaths {
  userprofile?: string;
  appdata?: string;
  localappdata?: string;
  path_dirs?: string[];
  home?: string;
}

class ClaudeDetectorService {
  private detectionCache: ClaudeDetectionResult | null = null;
  private cacheTimeout = 30 * 60 * 1000; // 30 minutes cache (detection is expensive)
  private windowsPathsCache: WindowsPaths | null = null;
  private claudeVersionCache: string | null = null;

  constructor() {
    // Hydrate cache from localStorage on initialization
    this.hydrateFromLocalStorage();
  }

  /**
   * Hydrate caches from localStorage for instant access
   */
  private hydrateFromLocalStorage(): void {
    try {
      const cachedDetection = localStorage.getItem('claudeDetectionResult');
      if (cachedDetection) {
        const parsed = JSON.parse(cachedDetection) as ClaudeDetectionResult;
        // Only use cache if it's less than cacheTimeout old
        if (parsed.lastDetection && (Date.now() - parsed.lastDetection) < this.cacheTimeout) {
          this.detectionCache = parsed;
          if (isDev) logger.info('Hydrated Claude detection cache from localStorage');
        }
      }

      const cachedVersion = localStorage.getItem('claudeVersionCache');
      if (cachedVersion) {
        const parsed = JSON.parse(cachedVersion);
        // Cache version for 30 minutes
        if (parsed.timestamp && (Date.now() - parsed.timestamp) < 30 * 60 * 1000) {
          this.claudeVersionCache = parsed.version;
          if (isDev) logger.info('Hydrated Claude version cache', { version: parsed.version });
        }
      }
    } catch (error) {
      if (isDev) logger.warn('Failed to hydrate cache from localStorage', { error });
    }
  }

  /**
   * Get cached Claude version (for instant UI display)
   */
  getCachedVersion(): string | null {
    return this.claudeVersionCache;
  }

  /**
   * Set and persist Claude version cache
   */
  setCachedVersion(version: string): void {
    this.claudeVersionCache = version;
    localStorage.setItem('claudeVersionCache', JSON.stringify({
      version,
      timestamp: Date.now()
    }));
  }

  /**
   * Get cached detection results or perform new detection
   */
  async detectInstallations(force = false): Promise<ClaudeDetectionResult> {
    // Return cached result if available and not forced
    if (!force && this.detectionCache &&
        (Date.now() - this.detectionCache.lastDetection) < this.cacheTimeout) {
      return this.detectionCache;
    }

    if (isDev) logger.info('Starting Claude installation detection...');

    const result: ClaudeDetectionResult = {
      lastDetection: Date.now(),
      recommended: null
    };

    // Detect native Windows installation
    const nativeWindows = await this.detectNativeWindows();
    if (nativeWindows) {
      result.nativeWindows = nativeWindows;
      if (isDev) logger.info('Found native Windows Claude', { path: nativeWindows.path });
    }

    // Detect WSL installation
    const wsl = await this.detectWSL();
    if (wsl) {
      result.wsl = wsl;
      if (isDev) logger.info('Found WSL Claude', { path: wsl.path });
    }

    // Determine recommended mode
    if (result.nativeWindows && result.wsl) {
      // If both are available, prefer native Windows for better performance
      result.recommended = 'native-windows';
    } else if (result.nativeWindows) {
      result.recommended = 'native-windows';
    } else if (result.wsl) {
      result.recommended = 'wsl';
    }

    // Cache the result
    this.detectionCache = result;

    // Store in localStorage for persistence
    localStorage.setItem('claudeDetectionResult', JSON.stringify(result));

    return result;
  }

  /**
   * Get Windows paths from Tauri backend (cached)
   */
  private async getWindowsPaths(): Promise<WindowsPaths> {
    if (this.windowsPathsCache) {
      return this.windowsPathsCache;
    }

    try {
      const paths = await invoke<WindowsPaths>('get_windows_paths');
      this.windowsPathsCache = paths;
      return paths;
    } catch (error) {
      if (isDev) logger.warn('Failed to get Windows paths from backend', { error });
      return {};
    }
  }

  /**
   * Detect native Windows Claude installation
   */
  private async detectNativeWindows(): Promise<ClaudeInstallation | null> {
    // Get Windows paths from Tauri backend
    const winPaths = await this.getWindowsPaths();
    const userProfile = winPaths.userprofile;
    const appData = winPaths.appdata;
    const pathDirs = winPaths.path_dirs || [];

    // Common Windows installation paths
    const possiblePaths: string[] = [];

    // User-specific installations (only if userProfile is available)
    if (userProfile) {
      possiblePaths.push(
        `${userProfile}\\.claude\\local\\claude.exe`,
        `${userProfile}\\AppData\\Local\\Programs\\claude\\claude.exe`,
        `${userProfile}\\AppData\\Local\\Claude\\claude.exe`,
        // Scoop
        `${userProfile}\\scoop\\apps\\claude\\current\\claude.exe`,
        `${userProfile}\\scoop\\shims\\claude.exe`
      );
    }

    // npm global installations (only if appData is available)
    if (appData) {
      possiblePaths.push(
        `${appData}\\npm\\claude.cmd`,
        `${appData}\\npm\\claude.exe`,
        `${appData}\\npm\\node_modules\\@anthropic-ai\\claude-cli\\bin\\claude.js`
      );
    }

    // Program Files installations
    possiblePaths.push(
      'C:\\Program Files\\Claude\\claude.exe',
      'C:\\Program Files (x86)\\Claude\\claude.exe',
      // Chocolatey
      'C:\\ProgramData\\chocolatey\\bin\\claude.exe'
    );

    // Check PATH directories
    for (const dir of pathDirs) {
      possiblePaths.push(`${dir}\\claude.exe`);
      possiblePaths.push(`${dir}\\claude.cmd`);
    }

    // Remove duplicates and undefined values
    const uniquePaths = [...new Set(possiblePaths.filter(p => p))];

    if (isDev) logger.info('Checking native Windows paths', { count: uniquePaths.length, unit: 'locations' });

    for (const path of uniquePaths) {
      try {
        // Use Tauri command to check if file exists
        const exists = await invoke<boolean>('check_file_exists', { path });

        if (exists) {
          if (isDev) logger.info('Found potential Claude at', { path });
          
          // Try to get version
          const version = await this.getClaudeVersion(path, 'native-windows');
          
          return {
            type: 'native-windows',
            path,
            version,
            isValid: true
          };
        }
      } catch (error) {
        // Path doesn't exist or can't be accessed
        continue;
      }
    }

    // Try to find claude in PATH using 'where' command
    try {
      const whereResult = await invoke<string>('execute_command', {
        command: 'where',
        args: ['claude']
      });
      
      if (whereResult && whereResult.trim()) {
        const paths = whereResult.trim().split('\n');
        for (const path of paths) {
          const trimmedPath = path.trim();
          if (trimmedPath && (trimmedPath.endsWith('.exe') || trimmedPath.endsWith('.cmd'))) {
            const version = await this.getClaudeVersion(trimmedPath, 'native-windows');
            return {
              type: 'native-windows',
              path: trimmedPath,
              version,
              isValid: true
            };
          }
        }
      }
    } catch (error) {
      if (isDev) logger.info('"where claude" command failed', { error });
    }

    return null;
  }

  /**
   * Detect WSL Claude installation
   */
  private async detectWSL(): Promise<ClaudeInstallation | null> {
    try {
      // Check if WSL is available
      const wslAvailable = await invoke<boolean>('check_wsl_available');
      if (!wslAvailable) {
        if (isDev) logger.info('WSL not available on this system');
        return null;
      }

      // Get WSL username
      const wslUser = await invoke<string>('get_wsl_username');
      if (!wslUser) {
        if (isDev) logger.info('Could not determine WSL username');
        return null;
      }

      if (isDev) logger.info('WSL user detected', { wslUser });

      // Common WSL Claude paths
      const wslPaths = [
        `/home/${wslUser}/.claude/local/claude`,
        `/home/${wslUser}/.claude/local/node_modules/.bin/claude`,
        `/home/${wslUser}/.npm-global/bin/claude`,
        `/home/${wslUser}/node_modules/.bin/claude`,
        `/usr/local/bin/claude`,
        `/usr/bin/claude`
      ];

      // Check each path in WSL
      for (const path of wslPaths) {
        try {
          const exists = await invoke<boolean>('check_wsl_file_exists', { path });

          if (exists) {
            if (isDev) logger.info('Found WSL Claude at', { path });
            
            // Get version
            const version = await this.getClaudeVersion(path, 'wsl');
            
            return {
              type: 'wsl',
              path,
              version,
              isValid: true,
              wslUser
            };
          }
        } catch (error) {
          continue;
        }
      }

      // Try 'which claude' in WSL
      try {
        const whichResult = await invoke<string>('execute_wsl_command', {
          command: 'which claude'
        });

        if (whichResult && whichResult.trim()) {
          const path = whichResult.trim();
          const version = await this.getClaudeVersion(path, 'wsl');

          return {
            type: 'wsl',
            path,
            version,
            isValid: true,
            wslUser
          };
        }
      } catch (error) {
        if (isDev) logger.info('"which claude" in WSL failed', { error });
      }

    } catch (error) {
      if (isDev) logger.error('WSL detection failed', { error });
    }

    return null;
  }

  /**
   * Get Claude CLI version
   */
  private async getClaudeVersion(path: string, type: 'native-windows' | 'wsl'): Promise<string | undefined> {
    try {
      const versionCommand = type === 'wsl' 
        ? await invoke<string>('execute_wsl_command', {
            command: `${path} --version`
          })
        : await invoke<string>('execute_command', {
            command: path,
            args: ['--version']
          });
      
      if (versionCommand) {
        // Parse version from output (e.g., "claude version 0.1.0")
        const match = versionCommand.match(/(\d+\.\d+\.\d+)/);
        return match ? match[1] : undefined;
      }
    } catch (error) {
      if (isDev) logger.info('Could not get version for', { path });
    }
    return undefined;
  }

  /**
   * Save Claude settings
   */
  saveSettings(settings: ClaudeSettings): void {
    localStorage.setItem('claudeSettings', JSON.stringify(settings));
    
    // Notify the embedded server about the settings change
    this.notifyServerOfSettings(settings);
  }

  /**
   * Load Claude settings
   */
  loadSettings(): ClaudeSettings {
    const stored = localStorage.getItem('claudeSettings');
    if (stored) {
      return JSON.parse(stored);
    }
    
    // Default settings - prefer native-windows on Windows
    const isWindows = typeof window !== 'undefined' && 
                      window.navigator.platform.toLowerCase().includes('win');
    return {
      executionMode: isWindows ? 'native-windows' : 'native',
      autoDetect: true
    };
  }

  /**
   * Notify the embedded server about settings changes
   */
  private async notifyServerOfSettings(settings: ClaudeSettings): Promise<void> {
    try {
      // Send settings to the server via Socket.IO or Tauri IPC
      const detection = this.detectionCache || await this.detectInstallations();
      const payload = {
        settings,
        detection
      };
      
      // Emit settings update event via Socket.IO if available
      // The socket client is exposed via claudeCodeClient service
      const socket = (window as any).claudeSocket;
      if (socket && socket.connected) {
        socket.emit('claude-settings-update', payload);
        if (isDev) logger.info('Sent Claude settings to server via Socket.IO');
      }

      // Also store in Tauri app data for persistence
      await invoke('save_claude_settings', { settings: payload });
    } catch (error) {
      if (isDev) logger.error('Failed to notify server of settings', { error });
    }
  }

  /**
   * Test a specific Claude installation
   */
  async testInstallation(installation: ClaudeInstallation): Promise<boolean> {
    try {
      if (isDev) logger.info('Testing Claude installation', { path: installation.path });

      const testCommand = installation.type === 'wsl'
        ? await invoke<string>('execute_wsl_command', {
            command: `echo "test" | ${installation.path} --version`
          })
        : await invoke<string>('execute_command', {
            command: installation.path,
            args: ['--version']
          });

      const success = !!testCommand && testCommand.includes('claude');
      if (isDev) logger.info(success ? 'Test passed' : 'Test failed');

      return success;
    } catch (error) {
      if (isDev) logger.error('Installation test failed', { error });
      return false;
    }
  }
}

// Export singleton instance
export const claudeDetector = new ClaudeDetectorService();