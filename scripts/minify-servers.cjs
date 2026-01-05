/**
 * Minifies server files in src-tauri/resources/ for production builds.
 * Uses terser for simple minification (no obfuscation).
 *
 * Run with: node scripts/minify-servers.cjs
 */

const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

const RESOURCES_DIR = path.join(__dirname, '..', 'src-tauri', 'resources');

// Files to minify
const SERVER_FILES = [
  'server-claude-macos.cjs',
  'server-claude-windows.cjs',
  'server-claude-linux.cjs',
  'server-claude-direct.cjs',
  'server.cjs',
];

// Terser config - simple minification only
const TERSER_CONFIG = {
  compress: {
    dead_code: true,
    drop_debugger: true,
    unused: true,
  },
  mangle: {
    reserved: ['require', 'module', 'exports', '__dirname', '__filename', 'process', 'Buffer', 'console'],
  },
  format: {
    comments: false,
  },
};

async function minifyFile(filename) {
  const filePath = path.join(RESOURCES_DIR, filename);

  if (!fs.existsSync(filePath)) {
    console.log(`  Skipped (not found): ${filename}`);
    return false;
  }

  const originalCode = fs.readFileSync(filePath, 'utf8');
  const originalSize = Buffer.byteLength(originalCode, 'utf8');

  try {
    const result = await minify(originalCode, TERSER_CONFIG);
    if (!result.code) {
      console.error(`  Error: No output for ${filename}`);
      return false;
    }

    const newSize = Buffer.byteLength(result.code, 'utf8');
    fs.writeFileSync(filePath, result.code);

    const reduction = (100 - (newSize / originalSize) * 100).toFixed(1);
    console.log(`  Minified: ${filename} (${(originalSize/1024).toFixed(1)}KB -> ${(newSize/1024).toFixed(1)}KB, -${reduction}%)`);
    return true;
  } catch (error) {
    console.error(`  Error minifying ${filename}:`, error.message);
    return false;
  }
}

async function main() {
  console.log('\n📦 Server Minifier\n');
  console.log('Minifying server files...');

  let successCount = 0;
  for (const file of SERVER_FILES) {
    if (await minifyFile(file)) successCount++;
  }

  console.log(`\nMinification complete! (${successCount}/${SERVER_FILES.length} files)\n`);
}

main().catch(console.error);
