#!/usr/bin/env node
/**
 * Ensures the unified binary (yume-bin) exists for the current platform.
 * Builds it if missing.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const platform = process.platform;
const resourcesDir = path.join(__dirname, '..', 'src-tauri', 'resources');
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const APP_ID = packageJson.name.toLowerCase().replace(/[^a-z0-9-]/g, '');

// Determine expected binary name (unified yume-bin)
let binaryName;
let buildScript;

if (platform === 'darwin') {
  // Check architecture for macOS
  const arch = process.arch;
  binaryName = arch === 'arm64'
    ? `${APP_ID}-bin-macos-arm64`
    : `${APP_ID}-bin-macos-x64`;
  buildScript = 'build:unified:macos';
} else if (platform === 'win32') {
  binaryName = `${APP_ID}-bin-windows-x64.exe`;
  buildScript = 'build:unified:windows';
} else {
  binaryName = `${APP_ID}-bin-linux-x64`;
  buildScript = 'build:unified:linux';
}

const binaryPath = path.join(resourcesDir, binaryName);

// Check if binary exists
if (fs.existsSync(binaryPath)) {
  console.log(`✓ Unified binary exists: ${binaryName}`);
  process.exit(0);
}

console.log(`Unified binary not found: ${binaryName}`);
console.log(`Building unified binary for ${platform}...`);

try {
  execSync(`npm run ${buildScript}`, {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..')
  });
  console.log(`✓ Unified binary built successfully`);
} catch (error) {
  console.error(`✗ Failed to build unified binary`);
  process.exit(1);
}
