#!/usr/bin/env node
/**
 * Build script for compiling server files into standalone binaries
 * Uses esbuild to bundle dependencies, then pkg to create executables
 */

const { execSync } = require('child_process');
const { existsSync, mkdirSync, unlinkSync, copyFileSync } = require('fs');
const { join } = require('path');

const ROOT = join(__dirname, '..');
const RESOURCES = join(ROOT, 'src-tauri', 'resources');
const DIST = join(ROOT, 'dist-server');

// Ensure dist directory exists
if (!existsSync(DIST)) {
  mkdirSync(DIST, { recursive: true });
}

const targets = [
  { platform: 'macos', arch: 'x64', pkgTarget: 'node18-macos-x64', serverFile: 'server-claude-macos.cjs' },
  { platform: 'macos', arch: 'arm64', pkgTarget: 'node18-macos-arm64', serverFile: 'server-claude-macos.cjs' },
  { platform: 'linux', arch: 'x64', pkgTarget: 'node18-linux-x64', serverFile: 'server-claude-linux.cjs' },
  { platform: 'windows', arch: 'x64', pkgTarget: 'node18-win-x64', serverFile: 'server-claude-windows.cjs' },
];

// Parse CLI args
const args = process.argv.slice(2);
const targetPlatform = args.find(a => a.startsWith('--platform='))?.split('=')[1];

async function build() {
  console.log('🔨 Building server binaries...\n');

  for (const target of targets) {
    // Skip if platform filter specified and doesn't match
    if (targetPlatform && target.platform !== targetPlatform) {
      continue;
    }

    const serverPath = join(RESOURCES, target.serverFile);
    if (!existsSync(serverPath)) {
      console.log(`⚠️  Skipping ${target.platform}-${target.arch}: ${target.serverFile} not found`);
      continue;
    }

    console.log(`📦 Building ${target.platform}-${target.arch}...`);

    // Step 1: Bundle with esbuild
    const bundledPath = join(DIST, `server-bundled-${target.platform}.cjs`);
    console.log(`   Bundling dependencies with esbuild...`);

    try {
      execSync(
        `npx esbuild "${serverPath}" --bundle --platform=node --target=node18 --outfile="${bundledPath}" --format=cjs`,
        { cwd: ROOT, stdio: 'inherit' }
      );
    } catch (e) {
      console.error(`   ❌ esbuild failed for ${target.platform}-${target.arch}`);
      continue;
    }

    // Step 2: Compile with pkg
    const isWindows = target.platform === 'windows';
    const outputName = `server-${target.platform}-${target.arch}${isWindows ? '.exe' : ''}`;
    const outputPath = join(DIST, outputName);
    console.log(`   Compiling to binary with pkg...`);

    try {
      execSync(
        `npx pkg "${bundledPath}" --target ${target.pkgTarget} --output "${outputPath}" --compress GZip`,
        { cwd: ROOT, stdio: 'inherit' }
      );
      console.log(`   ✅ Created: ${outputName}`);
    } catch (e) {
      console.error(`   ❌ pkg failed for ${target.platform}-${target.arch}`);
      continue;
    }

    // Copy to resources folder for bundling
    const finalPath = join(RESOURCES, outputName);
    copyFileSync(outputPath, finalPath);
    console.log(`   📁 Copied to resources: ${outputName}\n`);
  }

  console.log('✅ Build complete!');
  console.log(`   Output directory: ${DIST}`);
}

build().catch(console.error);
