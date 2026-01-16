#!/usr/bin/env node

/**
 * Prepare the resources directory for production builds.
 *
 * This script cleans up unnecessary files and ensures only the required
 * server binary for the target platform is included.
 *
 * Usage:
 *   node scripts/prepare-resources.cjs --platform=macos
 *   node scripts/prepare-resources.cjs --platform=windows
 *   node scripts/prepare-resources.cjs --platform=linux
 *
 * Without --platform, it auto-detects from the current OS.
 */

const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const resourcesDir = path.join(projectRoot, 'src-tauri', 'resources');

// Parse command line arguments
const args = process.argv.slice(2);
let targetPlatform = null;

for (const arg of args) {
  if (arg.startsWith('--platform=')) {
    targetPlatform = arg.split('=')[1].toLowerCase();
  }
}

// Auto-detect platform if not specified
if (!targetPlatform) {
  switch (process.platform) {
    case 'darwin':
      targetPlatform = 'macos';
      break;
    case 'win32':
      targetPlatform = 'windows';
      break;
    case 'linux':
      targetPlatform = 'linux';
      break;
    default:
      console.error(`Unknown platform: ${process.platform}`);
      process.exit(1);
  }
}

console.log(`\n🧹 Preparing resources for ${targetPlatform} build...\n`);

// Define what files to KEEP for each platform (unified binary + CLI wrapper)
const platformFiles = {
  macos: [
    'yume-bin-macos-arm64',
    'yume-bin-macos-x64',
    'yume-cli-macos-arm64',  // Shell wrapper script
    'yume-cli-macos-x64',    // Shell wrapper script
  ],
  windows: [
    'yume-bin-windows-x64.exe',
    'yume-cli-windows-x64.cmd',  // Batch wrapper script
  ],
  linux: [
    'yume-bin-linux-x64',
    'yume-cli-linux-x64',  // Shell wrapper script
  ],
};

// Files to always REMOVE (they're not needed in production builds)
const filesToRemove = [
  // .cjs files - not needed when binaries exist
  'server-claude-direct.cjs',
  'server-claude-linux.cjs',
  'server-claude-macos.cjs',
  'server-claude-windows.cjs',
  'server-claude-macos.cjs.backup',
  'server-claude-macos.cjs.backup2',
  'server-simple.cjs',
  'server.cjs',
  // JS source files
  'server-claude-macos.js',
  'wrapper-module.js',
  // Package files - not needed when using binaries
  'package.json',
  'package-lock.json',
];

// Directories to always REMOVE
const dirsToRemove = [
  'node_modules',
  '.originals',
];

// Clean up vscode extension - keep only .vsix and out/
function cleanVscodeExtension() {
  const vscodeDir = path.join(resourcesDir, 'yume-vscode');
  if (!fs.existsSync(vscodeDir)) return 0;

  let cleanedSize = 0;
  const filesToRemoveFromVscode = [
    'node_modules',
    'src',
    '.vscodeignore',
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'out/extension.js.map',
  ];

  for (const item of filesToRemoveFromVscode) {
    const itemPath = path.join(vscodeDir, item);
    if (fs.existsSync(itemPath)) {
      const stats = fs.statSync(itemPath);
      const itemSize = stats.isDirectory() ? getDirSize(itemPath) : stats.size;
      cleanedSize += itemSize;

      if (stats.isDirectory()) {
        fs.rmSync(itemPath, { recursive: true });
      } else {
        fs.rmSync(itemPath);
      }
      console.log(`  ❌ Removed from vscode: ${item} (${formatSize(itemSize)})`);
    }
  }

  return cleanedSize;
}

// Get list of files to keep for this platform
const filesToKeep = platformFiles[targetPlatform] || [];

// Also remove OTHER platform binaries (unified binary + CLI wrappers)
const allPlatformBinaries = [
  'yume-bin-macos-arm64',
  'yume-bin-macos-x64',
  'yume-bin-windows-x64.exe',
  'yume-bin-linux-x64',
  'yume-cli-macos-arm64',
  'yume-cli-macos-x64',
  'yume-cli-windows-x64.cmd',
  'yume-cli-linux-x64',
  // Legacy names (can be removed from old builds)
  'yume-server-macos-arm64',
  'yume-server-macos-x64',
  'yume-server-windows-x64.exe',
  'yume-server-linux-x64',
  'yume-cli-windows-x64.exe',  // Old naming
];

const otherPlatformBinaries = allPlatformBinaries.filter(
  bin => !filesToKeep.includes(bin)
);

// Check if resources directory exists
if (!fs.existsSync(resourcesDir)) {
  console.log('Resources directory does not exist, creating it...');
  fs.mkdirSync(resourcesDir, { recursive: true });
}

// Remove files that should be removed
let removedCount = 0;
let removedSize = 0;

for (const file of [...filesToRemove, ...otherPlatformBinaries]) {
  const filePath = path.join(resourcesDir, file);
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    removedSize += stats.size;
    fs.rmSync(filePath);
    console.log(`  ❌ Removed: ${file} (${formatSize(stats.size)})`);
    removedCount++;
  }
}

// Remove directories
for (const dir of dirsToRemove) {
  const dirPath = path.join(resourcesDir, dir);
  if (fs.existsSync(dirPath)) {
    const dirSize = getDirSize(dirPath);
    removedSize += dirSize;
    fs.rmSync(dirPath, { recursive: true });
    console.log(`  ❌ Removed: ${dir}/ (${formatSize(dirSize)})`);
    removedCount++;
  }
}

// Clean up vscode extension
console.log('\n🧹 Cleaning vscode extension...');
const vscodeCleanedSize = cleanVscodeExtension();
if (vscodeCleanedSize > 0) {
  removedSize += vscodeCleanedSize;
  console.log(`  Cleaned: ${formatSize(vscodeCleanedSize)} from vscode extension`);
}

// Verify required files exist
console.log('\n📦 Verifying required files...');
let missingFiles = [];

for (const file of filesToKeep) {
  const filePath = path.join(resourcesDir, file);
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    console.log(`  ✅ Found: ${file} (${formatSize(stats.size)})`);
  } else {
    console.log(`  ⚠️  Missing: ${file}`);
    missingFiles.push(file);
  }
}

// Summary
console.log('\n📊 Summary:');
console.log(`  Platform: ${targetPlatform}`);
console.log(`  Removed: ${removedCount} items (${formatSize(removedSize)})`);
console.log(`  Required files: ${filesToKeep.length}`);
console.log(`  Missing files: ${missingFiles.length}`);

if (missingFiles.length > 0) {
  console.log('\n⚠️  Warning: Some required files are missing!');
  console.log('   Run the appropriate build command first:');
  if (targetPlatform === 'macos') {
    console.log('   npm run build:server:macos');
  } else if (targetPlatform === 'windows') {
    console.log('   npm run build:server:windows');
  } else if (targetPlatform === 'linux') {
    console.log('   npm run build:server:linux');
  }
}

// List remaining files in resources
console.log('\n📁 Final resources directory contents:');
const remainingFiles = fs.readdirSync(resourcesDir);
if (remainingFiles.length === 0) {
  console.log('  (empty)');
} else {
  for (const file of remainingFiles) {
    const filePath = path.join(resourcesDir, file);
    const stats = fs.statSync(filePath);
    const isDir = stats.isDirectory();
    console.log(`  ${isDir ? '📂' : '📄'} ${file}${isDir ? '/' : ''} (${formatSize(stats.size)})`);
  }
}

console.log('\n✅ Resources prepared for ' + targetPlatform + ' build!\n');

// Helper functions
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function getDirSize(dirPath) {
  let size = 0;
  try {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        size += getDirSize(filePath);
      } else {
        size += stats.size;
      }
    }
  } catch (e) {
    // Ignore errors
  }
  return size;
}
