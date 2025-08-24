/**
 * Update Checker
 * Checks for available updates to the CLI
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import https from 'node:https';
import { VERSION, UPDATE_CHECK_INTERVAL, CACHE_DIR } from './constants.js';
import chalk from 'chalk';
import semver from 'semver';

/**
 * Update information class
 */
export class UpdateInfo {
  constructor(data) {
    this.currentVersion = data.currentVersion;
    this.latestVersion = data.latestVersion;
    this.updateAvailable = data.updateAvailable;
    this.releaseNotes = data.releaseNotes || '';
    this.publishedAt = data.publishedAt;
    this.downloadUrl = data.downloadUrl;
    this.breaking = data.breaking || false;
  }
  
  isBreaking() {
    if (this.breaking) return true;
    
    // Check if major version changed
    const current = semver.parse(this.currentVersion);
    const latest = semver.parse(this.latestVersion);
    
    if (!current || !latest) return false;
    
    return latest.major > current.major;
  }
  
  getUpdateType() {
    const current = semver.parse(this.currentVersion);
    const latest = semver.parse(this.latestVersion);
    
    if (!current || !latest) return 'unknown';
    
    if (latest.major > current.major) return 'major';
    if (latest.minor > current.minor) return 'minor';
    if (latest.patch > current.patch) return 'patch';
    
    return 'none';
  }
  
  formatMessage() {
    if (!this.updateAvailable) {
      return null;
    }
    
    const updateType = this.getUpdateType();
    const typeColor = {
      major: 'red',
      minor: 'yellow',
      patch: 'green',
      unknown: 'gray'
    }[updateType];
    
    let message = chalk.bold(`Update available: ${this.currentVersion} → ${this.latestVersion}`);
    message += '\n';
    
    if (this.isBreaking()) {
      message += chalk.red('⚠️  This is a breaking change. Please review the release notes.\n');
    }
    
    message += chalk.gray(`Run 'npm install -g @anthropic-ai/claude-code' to update\n`);
    
    if (this.releaseNotes) {
      message += chalk.gray('\nRelease notes:\n');
      message += chalk.gray(this.releaseNotes);
    }
    
    return chalk[typeColor](message);
  }
}

/**
 * Update Checker class
 */
export class UpdateChecker {
  constructor(options = {}) {
    this.options = {
      registryUrl: options.registryUrl || 'https://registry.npmjs.org',
      packageName: options.packageName || '@anthropic-ai/claude-code',
      cacheDir: options.cacheDir || join(homedir(), CACHE_DIR),
      checkInterval: options.checkInterval || UPDATE_CHECK_INTERVAL,
      enabled: options.enabled !== false,
      silent: options.silent || false
    };
    
    this.cacheFile = join(this.options.cacheDir, 'update-check.json');
  }
  
  /**
   * Check for updates
   */
  async check() {
    if (!this.options.enabled) {
      return null;
    }
    
    try {
      // Check cache first
      const cached = await this.getCachedUpdate();
      if (cached && !this.isCacheExpired(cached)) {
        return cached.updateInfo;
      }
      
      // Fetch latest version from registry
      const latestVersion = await this.fetchLatestVersion();
      
      // Compare versions
      const updateInfo = new UpdateInfo({
        currentVersion: VERSION,
        latestVersion: latestVersion.version,
        updateAvailable: semver.gt(latestVersion.version, VERSION),
        releaseNotes: latestVersion.releaseNotes,
        publishedAt: latestVersion.publishedAt,
        downloadUrl: latestVersion.downloadUrl
      });
      
      // Cache the result
      await this.cacheUpdate(updateInfo);
      
      return updateInfo;
      
    } catch (error) {
      // Silently fail if update check fails
      if (!this.options.silent) {
        console.error(chalk.gray('Failed to check for updates:', error.message));
      }
      return null;
    }
  }
  
  /**
   * Fetch latest version from npm registry
   */
  async fetchLatestVersion() {
    return new Promise((resolve, reject) => {
      const url = `${this.options.registryUrl}/${this.options.packageName}/latest`;
      
      https.get(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': `claude-code/${VERSION}`
        }
      }, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const packageInfo = JSON.parse(data);
            resolve({
              version: packageInfo.version,
              releaseNotes: packageInfo.description || '',
              publishedAt: packageInfo.time?.modified || new Date().toISOString(),
              downloadUrl: `https://www.npmjs.com/package/${this.options.packageName}`
            });
          } catch (error) {
            reject(new Error('Failed to parse registry response'));
          }
        });
      }).on('error', reject);
    });
  }
  
  /**
   * Get cached update info
   */
  async getCachedUpdate() {
    if (!existsSync(this.cacheFile)) {
      return null;
    }
    
    try {
      const data = await readFile(this.cacheFile, 'utf-8');
      const cached = JSON.parse(data);
      
      return {
        updateInfo: new UpdateInfo(cached.updateInfo),
        timestamp: cached.timestamp
      };
    } catch (error) {
      // Invalid cache file
      return null;
    }
  }
  
  /**
   * Cache update info
   */
  async cacheUpdate(updateInfo) {
    try {
      // Ensure cache directory exists
      const { mkdir } = await import('node:fs/promises');
      const cacheDir = join(homedir(), CACHE_DIR);
      
      if (!existsSync(cacheDir)) {
        await mkdir(cacheDir, { recursive: true });
      }
      
      const cacheData = {
        updateInfo: {
          currentVersion: updateInfo.currentVersion,
          latestVersion: updateInfo.latestVersion,
          updateAvailable: updateInfo.updateAvailable,
          releaseNotes: updateInfo.releaseNotes,
          publishedAt: updateInfo.publishedAt,
          downloadUrl: updateInfo.downloadUrl,
          breaking: updateInfo.breaking
        },
        timestamp: Date.now()
      };
      
      await writeFile(this.cacheFile, JSON.stringify(cacheData, null, 2));
    } catch (error) {
      // Silently fail if caching fails
      if (!this.options.silent) {
        console.error(chalk.gray('Failed to cache update info:', error.message));
      }
    }
  }
  
  /**
   * Check if cache is expired
   */
  isCacheExpired(cached) {
    const now = Date.now();
    const age = now - cached.timestamp;
    return age > this.options.checkInterval;
  }
  
  /**
   * Display update notification
   */
  displayNotification(updateInfo) {
    if (!updateInfo || !updateInfo.updateAvailable) {
      return;
    }
    
    const message = updateInfo.formatMessage();
    if (message) {
      console.log('\n' + message + '\n');
    }
  }
  
  /**
   * Check and notify
   */
  async checkAndNotify() {
    const updateInfo = await this.check();
    
    if (updateInfo && updateInfo.updateAvailable && !this.options.silent) {
      this.displayNotification(updateInfo);
    }
    
    return updateInfo;
  }
  
  /**
   * Force check (bypass cache)
   */
  async forceCheck() {
    try {
      // Clear cache first
      if (existsSync(this.cacheFile)) {
        const { unlink } = await import('node:fs/promises');
        await unlink(this.cacheFile);
      }
      
      return await this.check();
    } catch (error) {
      if (!this.options.silent) {
        console.error(chalk.gray('Failed to force check updates:', error.message));
      }
      return null;
    }
  }
}

/**
 * Helper function to check for updates
 */
export async function checkForUpdates(options = {}) {
  const checker = new UpdateChecker(options);
  return await checker.checkAndNotify();
}

/**
 * Helper function to get update info without displaying
 */
export async function getUpdateInfo(options = {}) {
  const checker = new UpdateChecker({ ...options, silent: true });
  return await checker.check();
}

export default {
  UpdateChecker,
  UpdateInfo,
  checkForUpdates,
  getUpdateInfo
};