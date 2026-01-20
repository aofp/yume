#!/usr/bin/env node
/**
 * Post-build script for macOS - fixes adhoc signatures
 * Automatically runs after Tauri build completes
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const arch = process.env.BUILD_ARCH || 'aarch64';
const targetMap = {
  'aarch64': 'aarch64-apple-darwin',
  'x64': 'x86_64-apple-darwin',
};

const target = targetMap[arch];
if (!target) {
  console.error(`Unknown architecture: ${arch}`);
  process.exit(1);
}

const appPath = path.join(__dirname, '..', 'src-tauri', 'target', target, 'release', 'bundle', 'macos', 'yume.app');

if (!fs.existsSync(appPath)) {
  console.warn(`App bundle not found at ${appPath}, skipping signature fix`);
  process.exit(0);
}

console.log(`\n🔧 Fixing adhoc signature for ${arch}...`);

try {
  // Strip broken signature
  execSync(`codesign --remove-signature "${appPath}"`, { stdio: 'inherit' });

  // Re-sign properly (adhoc signing doesn't support --options runtime)
  const entitlementsPath = path.join(__dirname, '..', 'src-tauri', 'entitlements.plist');
  execSync(
    `codesign --sign - --deep --force "${appPath}"`,
    { stdio: 'inherit' }
  );

  console.log('✅ Signature fixed!\n');

  // Verify
  console.log('Verification:');
  execSync(`codesign -dvv "${appPath}" 2>&1 | head -10`, { stdio: 'inherit', shell: '/bin/bash' });

} catch (error) {
  console.error('❌ Failed to fix signature:', error.message);
  process.exit(1);
}
