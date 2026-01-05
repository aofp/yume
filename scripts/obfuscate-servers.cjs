/**
 * Obfuscates server files in src-tauri/resources/ for production builds.
 * Uses javascript-obfuscator with settings optimized for Node.js server code.
 *
 * Run with: node scripts/obfuscate-servers.cjs
 */

const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const RESOURCES_DIR = path.join(__dirname, '..', 'src-tauri', 'resources');
const BACKUP_DIR = path.join(RESOURCES_DIR, '.originals');

// Files to obfuscate (main server files only)
const SERVER_FILES = [
  'server-claude-macos.cjs',
  'server-claude-windows.cjs',
  'server-claude-linux.cjs',
  'server-claude-direct.cjs',
  'server.cjs',
];

// Obfuscation config optimized for Node.js (more aggressive than React)
const OBFUSCATOR_CONFIG = {
  // Core obfuscation
  compact: true,
  simplify: true,

  // String protection
  stringArray: true,
  stringArrayThreshold: 0.75,
  stringArrayEncoding: ['base64'],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 2,
  stringArrayWrappersType: 'function',
  splitStrings: true,
  splitStringsChunkLength: 10,

  // Control flow
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.5, // 50% - balanced
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.2,

  // Identifier protection
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false, // Don't rename globals (require, module, etc)
  renameProperties: false, // Don't rename object properties

  // Debug protection
  debugProtection: false, // Can cause issues with Node.js
  disableConsoleOutput: false, // We handle this separately

  // Self-defense (anti-debugging)
  selfDefending: true,

  // Misc
  numbersToExpressions: true,
  transformObjectKeys: true,
  unicodeEscapeSequence: false, // Keep ASCII for better compatibility

  // Target Node.js
  target: 'node',

  // Reserved names (don't mangle these)
  reservedNames: [
    '^require$',
    '^module$',
    '^exports$',
    '^__dirname$',
    '^__filename$',
    '^process$',
    '^Buffer$',
    '^console$',
  ],
  reservedStrings: [],
};

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    console.log(`Created backup directory: ${BACKUP_DIR}`);
  }
}

function backupFile(filename) {
  const srcPath = path.join(RESOURCES_DIR, filename);
  const backupPath = path.join(BACKUP_DIR, filename);

  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, backupPath);
    console.log(`  Backed up: ${filename}`);
    return true;
  }
  return false;
}

function obfuscateFile(filename) {
  const filePath = path.join(RESOURCES_DIR, filename);

  if (!fs.existsSync(filePath)) {
    console.log(`  Skipped (not found): ${filename}`);
    return false;
  }

  const originalCode = fs.readFileSync(filePath, 'utf8');
  const originalSize = Buffer.byteLength(originalCode, 'utf8');

  try {
    const obfuscationResult = JavaScriptObfuscator.obfuscate(originalCode, OBFUSCATOR_CONFIG);
    const obfuscatedCode = obfuscationResult.getObfuscatedCode();
    const newSize = Buffer.byteLength(obfuscatedCode, 'utf8');

    fs.writeFileSync(filePath, obfuscatedCode);

    const sizeChange = ((newSize / originalSize) * 100).toFixed(1);
    console.log(`  Obfuscated: ${filename} (${(originalSize/1024).toFixed(1)}KB -> ${(newSize/1024).toFixed(1)}KB, ${sizeChange}%)`);
    return true;
  } catch (error) {
    console.error(`  Error obfuscating ${filename}:`, error.message);
    return false;
  }
}

function restoreFromBackup(filename) {
  const backupPath = path.join(BACKUP_DIR, filename);
  const destPath = path.join(RESOURCES_DIR, filename);

  if (fs.existsSync(backupPath)) {
    fs.copyFileSync(backupPath, destPath);
    console.log(`  Restored: ${filename}`);
    return true;
  }
  return false;
}

// CLI handling
const args = process.argv.slice(2);
const command = args[0] || 'obfuscate';

console.log('\n🔒 Server Obfuscator\n');

if (command === 'restore') {
  console.log('Restoring original files...');
  SERVER_FILES.forEach(file => restoreFromBackup(file));
  console.log('\nRestore complete!\n');
} else if (command === 'obfuscate') {
  console.log('Backing up original files...');
  ensureBackupDir();
  SERVER_FILES.forEach(file => backupFile(file));

  console.log('\nObfuscating server files...');
  let successCount = 0;
  SERVER_FILES.forEach(file => {
    if (obfuscateFile(file)) successCount++;
  });

  console.log(`\nObfuscation complete! (${successCount}/${SERVER_FILES.length} files)\n`);
} else {
  console.log('Usage:');
  console.log('  node scripts/obfuscate-servers.cjs           # Obfuscate server files');
  console.log('  node scripts/obfuscate-servers.cjs restore   # Restore original files');
  console.log('');
}
