/**
 * Claude CLI Detection Service
 * Detects both native Windows and WSL Claude installations
 */

import { invoke } from '@tauri-apps/api/core';

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

class ClaudeDetectorService {
  private detectionCache: ClaudeDetectionResult | null = null;
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes cache

  /**
   * Get cached detection results or perform new detection
   */
  async detectInstallations(force = false): Promise<ClaudeDetectionResult> {
    // Return cached result if available and not forced
    if (!force && this.detectionCache && 
        (Date.now() - this.detectionCache.lastDetection) < this.cacheTimeout) {
      return this.detectionCache;
    }

    console.log('🔍 Starting Claude installation detection...');
    
    const result: ClaudeDetectionResult = {
      lastDetection: Date.now(),
      recommended: null
    };

    // Detect native Windows installation
    const nativeWindows = await this.detectNativeWindows();
    if (nativeWindows) {
      result.nativeWindows = nativeWindows;
      console.log('✅ Found native Windows Claude:', nativeWindows.path);
    }

    // Detect WSL installation
    const wsl = await this.detectWSL();
    if (wsl) {
      result.wsl = wsl;
      console.log('✅ Found WSL Claude:', wsl.path);
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
   * Detect native Windows Claude installation
   */
  private async detectNativeWindows(): Promise<ClaudeInstallation | null> {
    // Common Windows installation paths
    const possiblePaths = [
      // User-specific installations
      `${process.env.USERPROFILE}\\.claude\\local\\claude.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\claude\\claude.exe`,
      `${process.env.USERPROFILE}\\AppData\\Local\\Claude\\claude.exe`,
      
      // npm global installations
      `${process.env.APPDATA}\\npm\\claude.cmd`,
      `${process.env.APPDATA}\\npm\\claude.exe`,
      `${process.env.APPDATA}\\npm\\node_modules\\@anthropic-ai\\claude-cli\\bin\\claude.js`,
      
      // Program Files installations
      'C:\\Program Files\\Claude\\claude.exe',
      'C:\\Program Files (x86)\\Claude\\claude.exe',
      
      // Chocolatey
      'C:\\ProgramData\\chocolatey\\bin\\claude.exe',
      
      // Scoop
      `${process.env.USERPROFILE}\\scoop\\apps\\claude\\current\\claude.exe`,
      `${process.env.USERPROFILE}\\scoop\\shims\\claude.exe`,
      
      // Check PATH environment variable
      ...this.getPathDirectories().map(dir => `${dir}\\claude.exe`),
      ...this.getPathDirectories().map(dir => `${dir}\\claude.cmd`)
    ];

    // Remove duplicates and undefined values
    const uniquePaths = [...new Set(possiblePaths.filter(p => p))];
    
    console.log('🔍 Checking native Windows paths:', uniquePaths.length, 'locations');

    for (const path of uniquePaths) {
      try {
        // Use Tauri command to check if file exists
        const exists = await invoke<boolean>('check_file_exists', { path });
        
        if (exists) {
          console.log('📍 Found potential Claude at:', path);
          
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
      console.log('⚠️ "where claude" command failed:', error);
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
        console.log('⚠️ WSL not available on this system');
        return null;
      }

      // Get WSL username
      const wslUser = await invoke<string>('get_wsl_username');
      if (!wslUser) {
        console.log('⚠️ Could not determine WSL username');
        return null;
      }

      console.log('🔍 WSL user detected:', wslUser);

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
            console.log('📍 Found WSL Claude at:', path);
            
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
        console.log('⚠️ "which claude" in WSL failed:', error);
      }

    } catch (error) {
      console.error('❌ WSL detection failed:', error);
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
      console.log('⚠️ Could not get version for:', path);
    }
    return undefined;
  }

  /**
   * Get directories from PATH environment variable
   */
  private getPathDirectories(): string[] {
    const pathEnv = process.env.PATH || '';
    // Use correct separator based on platform (Windows uses ;, Unix/macOS uses :)
    const separator = navigator.platform.toLowerCase().includes('win') ? ';' : ':';
    return pathEnv.split(separator).filter(dir => dir.trim());
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
        console.log('📡 Sent Claude settings to server via Socket.IO');
      }
      
      // Also store in Tauri app data for persistence
      await invoke('save_claude_settings', { settings: payload });
    } catch (error) {
      console.error('Failed to notify server of settings:', error);
    }
  }

  /**
   * Test a specific Claude installation
   */
  async testInstallation(installation: ClaudeInstallation): Promise<boolean> {
    try {
      console.log('🧪 Testing Claude installation:', installation.path);
      
      const testCommand = installation.type === 'wsl'
        ? await invoke<string>('execute_wsl_command', {
            command: `echo "test" | ${installation.path} --version`
          })
        : await invoke<string>('execute_command', {
            command: installation.path,
            args: ['--version']
          });
      
      const success = !!testCommand && testCommand.includes('claude');
      console.log(success ? '✅ Test passed' : '❌ Test failed');
      
      return success;
    } catch (error) {
      console.error('❌ Installation test failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const claudeDetector = new ClaudeDetectorService();