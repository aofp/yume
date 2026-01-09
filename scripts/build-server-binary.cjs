#!/usr/bin/env node
/**
 * Build script for compiling server files into standalone binaries
 * Uses esbuild to bundle, bytenode to compile to V8 bytecode, then pkg to create executables
 *
 * Bytecode provides code protection - source code is compiled to V8 bytecode format
 * which is much harder to reverse engineer than plain JavaScript.
 */

const { execSync, spawnSync } = require('child_process');
const { existsSync, mkdirSync, unlinkSync, copyFileSync, writeFileSync, readFileSync } = require('fs');
const { join, dirname } = require('path');
const os = require('os');

const ROOT = join(__dirname, '..');
const RESOURCES = join(ROOT, 'src-tauri', 'resources');
const DIST = join(ROOT, 'dist-server');
const NODE18_DIR = join(os.homedir(), '.yurucode-node18');

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
const skipBytecode = args.includes('--skip-bytecode');

/**
 * Get the path to Node 18 binary (required for bytecode compilation)
 * Bytecode must be compiled with the same Node version that pkg embeds
 */
function getNode18Path() {
  const platform = process.platform;

  if (platform === 'darwin') {
    return join(NODE18_DIR, 'bin', 'node');
  } else if (platform === 'linux') {
    return join(NODE18_DIR, 'bin', 'node');
  } else if (platform === 'win32') {
    return join(NODE18_DIR, 'node.exe');
  }
  return null;
}

/**
 * Download and install Node 18 if not present
 */
async function ensureNode18() {
  const node18Path = getNode18Path();

  if (node18Path && existsSync(node18Path)) {
    console.log(`   ✓ Node 18 found at ${node18Path}`);
    return node18Path;
  }

  console.log('   ⬇️  Downloading Node 18 (required for bytecode compilation)...');

  const platform = process.platform;
  const arch = process.arch;

  let url, extractCmd;

  if (platform === 'darwin') {
    const nodeArch = arch === 'arm64' ? 'arm64' : 'x64';
    url = `https://nodejs.org/dist/v18.20.5/node-v18.20.5-darwin-${nodeArch}.tar.gz`;

    mkdirSync(NODE18_DIR, { recursive: true });
    execSync(`curl -L "${url}" | tar -xz --strip-components=1 -C "${NODE18_DIR}"`, {
      stdio: 'inherit',
      shell: '/bin/bash'
    });
  } else if (platform === 'linux') {
    const nodeArch = arch === 'arm64' ? 'arm64' : 'x64';
    url = `https://nodejs.org/dist/v18.20.5/node-v18.20.5-linux-${nodeArch}.tar.xz`;

    mkdirSync(NODE18_DIR, { recursive: true });
    execSync(`curl -L "${url}" | tar -xJ --strip-components=1 -C "${NODE18_DIR}"`, {
      stdio: 'inherit',
      shell: '/bin/bash'
    });
  } else if (platform === 'win32') {
    url = `https://nodejs.org/dist/v18.20.5/node-v18.20.5-win-x64.zip`;
    const zipPath = join(os.tmpdir(), 'node18.zip');
    const extractedDir = join(NODE18_DIR, 'node-v18.20.5-win-x64');

    mkdirSync(NODE18_DIR, { recursive: true });
    execSync(`curl -L "${url}" -o "${zipPath}"`, { stdio: 'inherit' });

    // Use PowerShell with proper path escaping for Windows
    // Step 1: Extract the zip
    const escapedZipPath = zipPath.replace(/\\/g, '\\\\');
    const escapedNode18Dir = NODE18_DIR.replace(/\\/g, '\\\\');
    const escapedExtractedDir = extractedDir.replace(/\\/g, '\\\\');

    execSync(`powershell -Command "Expand-Archive -Path '${escapedZipPath}' -DestinationPath '${escapedNode18Dir}' -Force"`, { stdio: 'inherit' });

    // Step 2: Move files from nested directory to NODE18_DIR
    // Use Get-ChildItem with -Force to handle hidden files
    execSync(`powershell -Command "Get-ChildItem -Path '${escapedExtractedDir}' -Force | Move-Item -Destination '${escapedNode18Dir}' -Force"`, { stdio: 'inherit' });

    // Step 3: Remove the now-empty extracted directory
    execSync(`powershell -Command "Remove-Item -Path '${escapedExtractedDir}' -Force -Recurse -ErrorAction SilentlyContinue"`, { stdio: 'inherit' });

    unlinkSync(zipPath);
  }

  console.log(`   ✅ Node 18 installed at ${NODE18_DIR}`);
  return getNode18Path();
}

/**
 * Generate the embedded loader code that contains the bytecode as base64
 * This loader uses the same CommonJS module wrapping that bytenode uses
 */
function generateEmbeddedLoader(bytecodeBuffer) {
  const bytecodeBase64 = bytecodeBuffer.toString('base64');

  return `'use strict';

const vm = require('vm');
const v8 = require('v8');
const Module = require('module');
const path = require('path');

// Set V8 flags for bytecode execution
v8.setFlagsFromString('--no-lazy');
v8.setFlagsFromString('--no-flush-bytecode');

// Embedded bytecode (base64)
const BYTECODE_BASE64 = '${bytecodeBase64}';

// Helper functions (from bytenode)
function readSourceHash(buf) {
  return buf.subarray(8, 12).reduce((sum, num, pow) => sum + num * Math.pow(256, pow), 0);
}

function compileCode(code) {
  const script = new vm.Script(code, { produceCachedData: true });
  return script.createCachedData ? script.createCachedData() : script.cachedData;
}

function fixBytecode(bytecodeBuffer) {
  const dummyBytecode = compileCode('"\\\\u0CA0_\\\\u0CA0"');
  dummyBytecode.subarray(12, 16).copy(bytecodeBuffer, 12);
}

// Decode and fix bytecode
const bytecodeBuffer = Buffer.from(BYTECODE_BASE64, 'base64');
fixBytecode(bytecodeBuffer);

// Create script
const length = readSourceHash(bytecodeBuffer);
const dummyCode = length > 1 ? '"' + '\\\\u200b'.repeat(length - 2) + '"' : '';

const script = new vm.Script(dummyCode, {
  cachedData: bytecodeBuffer,
  filename: 'server.jsc'
});

if (script.cachedDataRejected) {
  console.error('ERROR: Bytecode rejected - V8 version mismatch');
  process.exit(1);
}

// Run with proper CommonJS context (like bytenode does)
const fileModule = new Module(module.filename);
fileModule.filename = module.filename;
fileModule.paths = Module._nodeModulePaths(path.dirname(module.filename));

function require_(id) {
  return fileModule.require(id);
}
require_.resolve = function(request, options) {
  return Module._resolveFilename(request, fileModule, false, options);
};
require_.main = process.mainModule;
require_.extensions = Module._extensions;
require_.cache = Module._cache;

const dirname = path.dirname(module.filename);

const compiledWrapper = script.runInThisContext({
  filename: 'server.jsc',
  lineOffset: 0,
  columnOffset: 0,
  displayErrors: true
});

// Call with CommonJS module arguments
compiledWrapper.apply(fileModule.exports, [
  fileModule.exports,
  require_,
  fileModule,
  module.filename,
  dirname,
  process,
  global
]);
`;
}

async function build() {
  console.log('🔨 Building server binaries with bytecode protection...\n');

  // Ensure bytenode is installed
  const bytenodePath = join(ROOT, 'node_modules', 'bytenode', 'lib', 'cli.js');
  if (!existsSync(bytenodePath)) {
    console.log('📦 Installing bytenode...');
    execSync('npm install bytenode --save-dev', { cwd: ROOT, stdio: 'inherit' });
  }

  // Ensure Node 18 is available for bytecode compilation
  let node18Path = null;
  if (!skipBytecode) {
    node18Path = await ensureNode18();
    if (!node18Path) {
      console.error('❌ Could not find or install Node 18');
      process.exit(1);
    }
  }

  for (const target of targets) {
    // Skip if platform filter specified and doesn't match
    if (targetPlatform && target.platform !== targetPlatform) {
      continue;
    }

    // Source files are at project root
    const serverPath = join(ROOT, target.serverFile);
    if (!existsSync(serverPath)) {
      console.log(`⚠️  Skipping ${target.platform}-${target.arch}: ${target.serverFile} not found at ${serverPath}`);
      continue;
    }

    console.log(`📦 Building ${target.platform}-${target.arch}...`);

    // Step 1: Bundle with esbuild (with safe minification)
    const bundledPath = join(DIST, `server-bundled-${target.platform}-${target.arch}.cjs`);
    console.log(`   1/4 Bundling with esbuild...`);

    try {
      // Use safe minification flags that preserve function names
      execSync(
        `npx esbuild "${serverPath}" --bundle --platform=node --target=node18 --outfile="${bundledPath}" --format=cjs --minify-whitespace --minify-syntax --keep-names`,
        { cwd: ROOT, stdio: 'inherit' }
      );
    } catch (e) {
      console.error(`   ❌ esbuild failed for ${target.platform}-${target.arch}`);
      continue;
    }

    let loaderPath;

    if (skipBytecode) {
      // Skip bytecode, use bundled JS directly
      loaderPath = bundledPath;
      console.log(`   2/4 Skipping bytecode (--skip-bytecode flag)`);
      console.log(`   3/4 Skipping loader generation`);
    } else {
      // Step 2: Compile to bytecode with Node 18
      const bytecodePath = bundledPath.replace('.cjs', '.jsc');
      console.log(`   2/4 Compiling to V8 bytecode...`);

      try {
        execSync(
          `"${node18Path}" "${bytenodePath}" --compile "${bundledPath}"`,
          { cwd: ROOT, stdio: 'inherit' }
        );
      } catch (e) {
        console.error(`   ❌ bytenode compilation failed for ${target.platform}-${target.arch}`);
        continue;
      }

      // Step 3: Generate embedded loader with base64 bytecode
      console.log(`   3/4 Generating embedded loader...`);

      const bytecodeBuffer = readFileSync(bytecodePath);
      const loaderCode = generateEmbeddedLoader(bytecodeBuffer);
      loaderPath = join(DIST, `server-loader-${target.platform}-${target.arch}.cjs`);
      writeFileSync(loaderPath, loaderCode);

      const loaderSizeMB = (loaderCode.length / 1024 / 1024).toFixed(2);
      console.log(`      Loader size: ${loaderSizeMB} MB`);

      // Clean up intermediate files
      try {
        unlinkSync(bytecodePath);
        unlinkSync(bundledPath);
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    // Step 4: Compile with pkg
    const isWindows = target.platform === 'windows';
    const outputName = `server-${target.platform}-${target.arch}${isWindows ? '.exe' : ''}`;
    const outputPath = join(DIST, outputName);
    console.log(`   4/4 Packaging binary with pkg...`);

    try {
      execSync(
        `npx pkg "${loaderPath}" --target ${target.pkgTarget} --output "${outputPath}" --compress GZip`,
        { cwd: ROOT, stdio: 'inherit' }
      );
      console.log(`   ✅ Created: ${outputName}`);
    } catch (e) {
      console.error(`   ❌ pkg failed for ${target.platform}-${target.arch}`);
      continue;
    }

    // Re-sign macOS binaries (pkg's ad-hoc signature can cause issues)
    if (target.platform === 'macos' && process.platform === 'darwin') {
      console.log(`   🔏 Re-signing macOS binary...`);
      try {
        execSync(`codesign --remove-signature "${outputPath}"`, { stdio: 'pipe' });
        execSync(`codesign -s - --force --deep "${outputPath}"`, { stdio: 'pipe' });
        console.log(`   ✅ Binary re-signed`);
      } catch (e) {
        console.warn(`   ⚠️  Codesigning failed (may still work): ${e.message}`);
      }
    }

    // Copy to resources folder for bundling
    const finalPath = join(RESOURCES, outputName);
    copyFileSync(outputPath, finalPath);
    console.log(`   📁 Copied to resources: ${outputName}\n`);

    // Clean up loader file
    if (!skipBytecode && loaderPath !== bundledPath) {
      try {
        unlinkSync(loaderPath);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }

  console.log('✅ Build complete!');
  console.log(`   Output directory: ${DIST}`);
  console.log('   Binaries contain V8 bytecode for code protection.');
}

build().catch(console.error);
