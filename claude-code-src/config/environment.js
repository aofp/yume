/**
 * Environment Setup and Detection
 * Handles environment configuration and platform detection
 */

import { homedir, platform, arch, release, tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import {
  GLOBAL_CONFIG_DIR,
  CONVERSATION_DIR,
  CACHE_DIR,
  LOG_DIR
} from '../cli/constants.js';

/**
 * Environment information class
 */
export class Environment {
  constructor() {
    this.platform = platform();
    this.arch = arch();
    this.release = release();
    this.nodeVersion = process.version;
    this.npmVersion = process.env.npm_version || null;
    this.homeDir = homedir();
    this.tempDir = tmpdir();
    this.cwd = process.cwd();
    this.isWindows = this.platform === 'win32';
    this.isMac = this.platform === 'darwin';
    this.isLinux = this.platform === 'linux';
    this.isTTY = process.stdout.isTTY;
    this.isCI = this.detectCI();
    this.isDocker = this.detectDocker();
    this.isWSL = this.detectWSL();
    this.shell = this.detectShell();
    this.editor = this.detectEditor();
    this.terminal = this.detectTerminal();
  }
  
  /**
   * Detect if running in CI environment
   */
  detectCI() {
    const ciEnvVars = [
      'CI',
      'CONTINUOUS_INTEGRATION',
      'GITHUB_ACTIONS',
      'GITLAB_CI',
      'CIRCLECI',
      'TRAVIS',
      'JENKINS',
      'BUILDKITE',
      'DRONE'
    ];
    
    return ciEnvVars.some(envVar => process.env[envVar] === 'true' || process.env[envVar] === '1');
  }
  
  /**
   * Detect if running in Docker
   */
  detectDocker() {
    // Check for .dockerenv file
    if (existsSync('/.dockerenv')) {
      return true;
    }
    
    // Check cgroup for docker
    if (existsSync('/proc/self/cgroup')) {
      try {
        const { readFileSync } = require('fs');
        const cgroup = readFileSync('/proc/self/cgroup', 'utf8');
        return cgroup.includes('docker') || cgroup.includes('kubepods');
      } catch {
        // Ignore errors
      }
    }
    
    return false;
  }
  
  /**
   * Detect if running in WSL
   */
  detectWSL() {
    if (this.platform !== 'linux') {
      return false;
    }
    
    // Check for WSL-specific environment variables
    if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) {
      return true;
    }
    
    // Check /proc/version for Microsoft/WSL
    if (existsSync('/proc/version')) {
      try {
        const { readFileSync } = require('fs');
        const version = readFileSync('/proc/version', 'utf8');
        return version.toLowerCase().includes('microsoft') || 
               version.toLowerCase().includes('wsl');
      } catch {
        // Ignore errors
      }
    }
    
    return false;
  }
  
  /**
   * Detect shell environment
   */
  detectShell() {
    // Check SHELL environment variable
    if (process.env.SHELL) {
      const shellPath = process.env.SHELL;
      const shellName = shellPath.split('/').pop();
      return {
        path: shellPath,
        name: shellName,
        type: this.getShellType(shellName)
      };
    }
    
    // Windows default
    if (this.isWindows) {
      const comspec = process.env.COMSPEC || 'cmd.exe';
      return {
        path: comspec,
        name: comspec.split('\\').pop(),
        type: comspec.includes('powershell') ? 'powershell' : 'cmd'
      };
    }
    
    // Default to bash
    return {
      path: '/bin/bash',
      name: 'bash',
      type: 'bash'
    };
  }
  
  /**
   * Get shell type from name
   */
  getShellType(shellName) {
    const shellTypes = {
      bash: 'bash',
      zsh: 'zsh',
      fish: 'fish',
      sh: 'sh',
      ksh: 'ksh',
      tcsh: 'tcsh',
      csh: 'csh',
      powershell: 'powershell',
      pwsh: 'powershell',
      cmd: 'cmd'
    };
    
    return shellTypes[shellName.toLowerCase()] || 'unknown';
  }
  
  /**
   * Detect default editor
   */
  detectEditor() {
    // Check environment variables
    const editor = process.env.EDITOR || 
                  process.env.VISUAL || 
                  process.env.GIT_EDITOR;
    
    if (editor) {
      return editor;
    }
    
    // Platform defaults
    if (this.isWindows) {
      return 'notepad';
    } else if (this.isMac) {
      return 'nano';
    } else {
      return 'vi';
    }
  }
  
  /**
   * Detect terminal emulator
   */
  detectTerminal() {
    // Check terminal-specific environment variables
    const termProgram = process.env.TERM_PROGRAM;
    const terminalEmulator = process.env.TERMINAL_EMULATOR;
    const term = process.env.TERM;
    
    if (termProgram) {
      return {
        name: termProgram,
        version: process.env.TERM_PROGRAM_VERSION,
        type: term
      };
    }
    
    if (terminalEmulator) {
      return {
        name: terminalEmulator,
        type: term
      };
    }
    
    // Check for specific terminal indicators
    if (process.env.VSCODE_GIT_IPC_HANDLE) {
      return {
        name: 'vscode',
        type: 'integrated'
      };
    }
    
    if (process.env.WT_SESSION) {
      return {
        name: 'windows-terminal',
        type: 'modern'
      };
    }
    
    return {
      name: 'unknown',
      type: term || 'unknown'
    };
  }
  
  /**
   * Get environment summary
   */
  getSummary() {
    return {
      platform: this.platform,
      arch: this.arch,
      release: this.release,
      nodeVersion: this.nodeVersion,
      npmVersion: this.npmVersion,
      isWindows: this.isWindows,
      isMac: this.isMac,
      isLinux: this.isLinux,
      isTTY: this.isTTY,
      isCI: this.isCI,
      isDocker: this.isDocker,
      isWSL: this.isWSL,
      shell: this.shell,
      editor: this.editor,
      terminal: this.terminal
    };
  }
  
  /**
   * Check if environment supports color
   */
  supportsColor() {
    // Disable color in CI unless explicitly enabled
    if (this.isCI) {
      return process.env.FORCE_COLOR === '1' || process.env.FORCE_COLOR === 'true';
    }
    
    // Check NO_COLOR environment variable
    if (process.env.NO_COLOR) {
      return false;
    }
    
    // Check FORCE_COLOR environment variable
    if (process.env.FORCE_COLOR === '1' || process.env.FORCE_COLOR === 'true') {
      return true;
    }
    
    // Check if TTY
    if (!this.isTTY) {
      return false;
    }
    
    // Windows 10+ supports color
    if (this.isWindows) {
      const osRelease = parseInt(this.release.split('.')[0], 10);
      return osRelease >= 10;
    }
    
    // Check TERM environment variable
    const term = process.env.TERM;
    if (!term || term === 'dumb') {
      return false;
    }
    
    return true;
  }
  
  /**
   * Check if environment supports Unicode
   */
  supportsUnicode() {
    // Windows console has limited Unicode support
    if (this.isWindows && !process.env.WT_SESSION) {
      return false;
    }
    
    // Check locale
    const locale = process.env.LC_ALL || process.env.LC_CTYPE || process.env.LANG || '';
    return locale.includes('UTF-8') || locale.includes('UTF8');
  }
  
  /**
   * Get terminal width
   */
  getTerminalWidth() {
    return process.stdout.columns || 80;
  }
  
  /**
   * Get terminal height
   */
  getTerminalHeight() {
    return process.stdout.rows || 24;
  }
}

/**
 * Setup environment directories
 */
export async function setupEnvironment() {
  const dirs = [
    join(homedir(), GLOBAL_CONFIG_DIR),
    join(homedir(), CONVERSATION_DIR),
    join(homedir(), CACHE_DIR),
    join(homedir(), LOG_DIR)
  ];
  
  for (const dir of dirs) {
    if (!existsSync(dir)) {
      try {
        await mkdir(dir, { recursive: true });
      } catch (error) {
        console.error(`Failed to create directory ${dir}:`, error.message);
      }
    }
  }
}

/**
 * Get application directories
 */
export function getAppDirectories() {
  return {
    config: join(homedir(), GLOBAL_CONFIG_DIR),
    conversations: join(homedir(), CONVERSATION_DIR),
    cache: join(homedir(), CACHE_DIR),
    logs: join(homedir(), LOG_DIR),
    temp: tmpdir()
  };
}

/**
 * Check system requirements
 */
export function checkSystemRequirements() {
  const requirements = {
    node: {
      required: '18.0.0',
      current: process.version.substring(1),
      satisfied: false
    },
    memory: {
      required: 512 * 1024 * 1024, // 512MB
      current: require('os').freemem(),
      satisfied: false
    },
    disk: {
      required: 100 * 1024 * 1024, // 100MB
      current: null,
      satisfied: true // Assume satisfied if we can't check
    }
  };
  
  // Check Node.js version
  const [reqMajor, reqMinor] = requirements.node.required.split('.').map(Number);
  const [curMajor, curMinor] = requirements.node.current.split('.').map(Number);
  requirements.node.satisfied = curMajor > reqMajor || 
                                (curMajor === reqMajor && curMinor >= reqMinor);
  
  // Check memory
  requirements.memory.satisfied = requirements.memory.current >= requirements.memory.required;
  
  return requirements;
}

/**
 * Get platform-specific paths
 */
export function getPlatformPaths() {
  const env = new Environment();
  
  if (env.isWindows) {
    return {
      config: process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'),
      data: process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'),
      cache: process.env.TEMP || tmpdir(),
      desktop: join(homedir(), 'Desktop'),
      documents: join(homedir(), 'Documents')
    };
  } else if (env.isMac) {
    return {
      config: join(homedir(), 'Library', 'Application Support'),
      data: join(homedir(), 'Library', 'Application Support'),
      cache: join(homedir(), 'Library', 'Caches'),
      desktop: join(homedir(), 'Desktop'),
      documents: join(homedir(), 'Documents')
    };
  } else {
    // Linux/Unix
    return {
      config: process.env.XDG_CONFIG_HOME || join(homedir(), '.config'),
      data: process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'),
      cache: process.env.XDG_CACHE_HOME || join(homedir(), '.cache'),
      desktop: join(homedir(), 'Desktop'),
      documents: join(homedir(), 'Documents')
    };
  }
}

// Singleton instance
let environmentInstance = null;

/**
 * Get environment instance
 */
export function getEnvironment() {
  if (!environmentInstance) {
    environmentInstance = new Environment();
  }
  return environmentInstance;
}

export default {
  Environment,
  setupEnvironment,
  getAppDirectories,
  checkSystemRequirements,
  getPlatformPaths,
  getEnvironment
};