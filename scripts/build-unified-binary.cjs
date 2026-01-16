#!/usr/bin/env node
/**
 * Build script for unified yume-bin binary
 *
 * Combines server and CLI into one binary with:
 * - V8 bytecode protection
 * - Subcommand dispatch (serve/cli)
 * - Symlink detection (yume-server/yume-cli -> yume-bin)
 *
 * Output: yume-bin-{platform}-{arch} (single binary per platform)
 */

const { execSync } = require('child_process');
const { existsSync, mkdirSync, unlinkSync, copyFileSync, writeFileSync, readFileSync, chmodSync } = require('fs');
const { join } = require('path');
const os = require('os');

const ROOT = join(__dirname, '..');
const RESOURCES = join(ROOT, 'src-tauri', 'resources');
const DIST = join(ROOT, 'dist-yume-bin');
const CLI_SRC = join(ROOT, 'src-yume-cli');
const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const APP_ID = packageJson.name.toLowerCase().replace(/[^a-z0-9-]/g, '');
const NODE18_DIR = join(os.homedir(), `.${APP_ID}-node18`);

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
 * Get path to Node 18 binary
 */
function getNode18Path() {
  const platform = process.platform;
  if (platform === 'darwin' || platform === 'linux') {
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

  console.log('   ⬇️  Downloading Node 18...');
  const platform = process.platform;
  const arch = process.arch;

  if (platform === 'darwin') {
    const nodeArch = arch === 'arm64' ? 'arm64' : 'x64';
    const url = `https://nodejs.org/dist/v18.20.5/node-v18.20.5-darwin-${nodeArch}.tar.gz`;
    mkdirSync(NODE18_DIR, { recursive: true });
    execSync(`curl -L "${url}" | tar -xz --strip-components=1 -C "${NODE18_DIR}"`, {
      stdio: 'inherit', shell: '/bin/bash'
    });
  } else if (platform === 'linux') {
    const nodeArch = arch === 'arm64' ? 'arm64' : 'x64';
    const url = `https://nodejs.org/dist/v18.20.5/node-v18.20.5-linux-${nodeArch}.tar.xz`;
    mkdirSync(NODE18_DIR, { recursive: true });
    execSync(`curl -L "${url}" | tar -xJ --strip-components=1 -C "${NODE18_DIR}"`, {
      stdio: 'inherit', shell: '/bin/bash'
    });
  } else if (platform === 'win32') {
    const url = `https://nodejs.org/dist/v18.20.5/node-v18.20.5-win-x64.zip`;
    const zipPath = join(os.tmpdir(), 'node18.zip');
    mkdirSync(NODE18_DIR, { recursive: true });
    execSync(`curl -L "${url}" -o "${zipPath}"`, { stdio: 'inherit' });
    const escapedZipPath = zipPath.replace(/\\/g, '\\\\');
    const escapedNode18Dir = NODE18_DIR.replace(/\\/g, '\\\\');
    execSync(`powershell -Command "Expand-Archive -Path '${escapedZipPath}' -DestinationPath '${escapedNode18Dir}' -Force"`, { stdio: 'inherit' });
    const extractedDir = join(NODE18_DIR, 'node-v18.20.5-win-x64').replace(/\\/g, '\\\\');
    execSync(`powershell -Command "Get-ChildItem -Path '${extractedDir}' -Force | Move-Item -Destination '${escapedNode18Dir}' -Force"`, { stdio: 'inherit' });
    execSync(`powershell -Command "Remove-Item -Path '${extractedDir}' -Force -Recurse -ErrorAction SilentlyContinue"`, { stdio: 'inherit' });
    unlinkSync(zipPath);
  }

  console.log(`   ✅ Node 18 installed`);
  return getNode18Path();
}

/**
 * Generate bytecode loader with embedded base64 bytecode
 */
function generateEmbeddedLoader(bytecodeBuffer) {
  const bytecodeBase64 = bytecodeBuffer.toString('base64');
  return `'use strict';
const vm = require('vm');
const v8 = require('v8');
const Module = require('module');
const path = require('path');

v8.setFlagsFromString('--no-lazy');
v8.setFlagsFromString('--no-flush-bytecode');

const BYTECODE_BASE64 = '${bytecodeBase64}';

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

const bytecodeBuffer = Buffer.from(BYTECODE_BASE64, 'base64');
fixBytecode(bytecodeBuffer);

const length = readSourceHash(bytecodeBuffer);
const dummyCode = length > 1 ? '"' + '\\\\u200b'.repeat(length - 2) + '"' : '';

const script = new vm.Script(dummyCode, {
  cachedData: bytecodeBuffer,
  filename: 'yume-bin.jsc'
});

if (script.cachedDataRejected) {
  console.error('ERROR: Bytecode rejected - V8 version mismatch');
  process.exit(1);
}

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
  filename: 'yume-bin.jsc',
  lineOffset: 0,
  columnOffset: 0,
  displayErrors: true
});

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

/**
 * Generate unified entry point that dispatches to server or CLI
 * NOTE: No shebang - bytenode compilation doesn't support it
 */
function generateUnifiedEntry(serverBundlePath, cliBundlePath) {
  let serverCode = readFileSync(serverBundlePath, 'utf8');
  let cliCode = readFileSync(cliBundlePath, 'utf8');

  // Strip any shebangs from bundled code (they cause bytenode compilation errors)
  serverCode = serverCode.replace(/^#!.*\n/, '');
  cliCode = cliCode.replace(/^#!.*\n/, '');

  return `'use strict';

// Mark as unified entry to prevent auto-execution in CLI module
globalThis.__YUME_UNIFIED_ENTRY__ = true;

// Detect mode in IIFE to avoid variable conflicts with bundled code
const __yume_mode__ = (function() {
  const _path = require('path');

  // NOTE: In pkg binaries, argv[1] is a snapshot path, use execPath instead
  const execName = _path.basename(process.execPath || '').replace(/\\.exe$/i, '').toLowerCase();
  const argvName = _path.basename(process.argv[1] || '').replace(/\\.exe$/i, '').toLowerCase();
  const basename = execName.includes('yume') ? execName : argvName;

  // Check basename first (for symlink invocation)
  if (basename.includes('yume-cli') || basename === 'cli') {
    return 'cli';
  }
  if (basename.includes('yume-server') || basename.includes('yume-bin') || basename === 'server') {
    // Default yume-bin to serve mode (primary use case)
    const firstArg = process.argv[2]?.toLowerCase();
    if (firstArg === 'cli') {
      process.argv.splice(2, 1);
      return 'cli';
    }
    // Remove 'serve' arg if present
    if (firstArg === 'serve' || firstArg === 'server') {
      process.argv.splice(2, 1);
    }
    return 'serve';
  }

  // Check first argument
  const firstArg = process.argv[2]?.toLowerCase();
  if (firstArg === 'serve' || firstArg === 'server') {
    process.argv.splice(2, 1);
    return 'serve';
  }
  if (firstArg === 'cli') {
    process.argv.splice(2, 1);
    return 'cli';
  }

  // Default to serve (main use case for Tauri)
  return 'serve';
})();

if (__yume_mode__ === 'serve') {
  // ============ SERVER CODE ============
  // Server auto-starts when evaluated
${serverCode}
} else if (__yume_mode__ === 'cli') {
  // ============ CLI CODE ============
  // CLI code sets module.exports.main via esbuild bundling
  // After code runs, we call main() since __YUME_UNIFIED_ENTRY__ prevents auto-run
${cliCode}
  // Now call main() - esbuild sets this on module.exports
  const cliMain = module.exports && module.exports.main;
  if (typeof cliMain === 'function') {
    cliMain().catch(e => {
      console.error('CLI error:', e.message || e);
      process.exit(1);
    });
  } else {
    console.error('CLI main function not found');
    process.exit(1);
  }
}
`;
}

async function build() {
  console.log('🔨 Building unified yume-bin binaries...\n');

  // Ensure bytenode is installed
  const bytenodePath = join(ROOT, 'node_modules', 'bytenode', 'lib', 'cli.js');
  if (!existsSync(bytenodePath)) {
    console.log('📦 Installing bytenode...');
    execSync('npm install bytenode --save-dev', { cwd: ROOT, stdio: 'inherit' });
  }

  // Build yume-cli TypeScript first
  console.log('📦 Building yume-cli TypeScript...');
  execSync('npm run build', { cwd: CLI_SRC, stdio: 'inherit' });

  // Bundle yume-cli to CJS
  console.log('📦 Bundling yume-cli to CJS...');
  const cliBundlePath = join(DIST, 'cli-bundle.cjs');
  execSync(
    `npx esbuild "${join(CLI_SRC, 'dist', 'index.js')}" --bundle --platform=node --target=node18 --outfile="${cliBundlePath}" --format=cjs --minify-whitespace --minify-syntax --keep-names`,
    { cwd: ROOT, stdio: 'inherit' }
  );

  // Ensure Node 18 for bytecode
  let node18Path = null;
  if (!skipBytecode) {
    node18Path = await ensureNode18();
    if (!node18Path) {
      console.error('❌ Could not find or install Node 18');
      process.exit(1);
    }
  }

  for (const target of targets) {
    if (targetPlatform && target.platform !== targetPlatform) {
      continue;
    }

    const serverPath = join(ROOT, target.serverFile);
    if (!existsSync(serverPath)) {
      console.log(`⚠️  Skipping ${target.platform}-${target.arch}: ${target.serverFile} not found`);
      continue;
    }

    console.log(`\n📦 Building ${target.platform}-${target.arch}...`);

    // Step 1: Bundle server with esbuild
    const serverBundlePath = join(DIST, `server-bundle-${target.platform}-${target.arch}.cjs`);
    console.log(`   1/5 Bundling server...`);
    execSync(
      `npx esbuild "${serverPath}" --bundle --platform=node --target=node18 --outfile="${serverBundlePath}" --format=cjs --minify-whitespace --minify-syntax --keep-names`,
      { cwd: ROOT, stdio: 'inherit' }
    );

    // Step 2: Generate unified entry
    console.log(`   2/5 Generating unified entry...`);
    const unifiedPath = join(DIST, `yume-bin-unified-${target.platform}-${target.arch}.cjs`);
    const unifiedCode = generateUnifiedEntry(serverBundlePath, cliBundlePath);
    writeFileSync(unifiedPath, unifiedCode);
    console.log(`      Unified size: ${(unifiedCode.length / 1024 / 1024).toFixed(2)} MB`);

    let loaderPath;

    if (skipBytecode) {
      loaderPath = unifiedPath;
      console.log(`   3/5 Skipping bytecode (--skip-bytecode)`);
      console.log(`   4/5 Skipping loader generation`);
    } else {
      // Step 3: Compile to bytecode
      const bytecodePath = unifiedPath.replace('.cjs', '.jsc');
      console.log(`   3/5 Compiling to V8 bytecode...`);
      execSync(
        `"${node18Path}" "${bytenodePath}" --compile "${unifiedPath}"`,
        { cwd: ROOT, stdio: 'inherit' }
      );

      // Step 4: Generate embedded loader
      console.log(`   4/5 Generating embedded loader...`);
      const bytecodeBuffer = readFileSync(bytecodePath);
      const loaderCode = generateEmbeddedLoader(bytecodeBuffer);
      loaderPath = join(DIST, `yume-bin-loader-${target.platform}-${target.arch}.cjs`);
      writeFileSync(loaderPath, loaderCode);
      console.log(`      Loader size: ${(loaderCode.length / 1024 / 1024).toFixed(2)} MB`);

      // Cleanup intermediate files
      try {
        unlinkSync(bytecodePath);
        unlinkSync(unifiedPath);
        unlinkSync(serverBundlePath);
      } catch (e) {}
    }

    // Step 5: Package with pkg
    const isWindows = target.platform === 'windows';
    const outputName = `yume-bin-${target.platform}-${target.arch}${isWindows ? '.exe' : ''}`;
    const outputPath = join(DIST, outputName);
    console.log(`   5/5 Packaging binary with pkg...`);

    execSync(
      `npx pkg "${loaderPath}" --target ${target.pkgTarget} --output "${outputPath}" --compress GZip`,
      { cwd: ROOT, stdio: 'inherit' }
    );
    console.log(`   ✅ Created: ${outputName}`);

    // Re-sign macOS binaries
    if (target.platform === 'macos' && process.platform === 'darwin') {
      console.log(`   🔏 Re-signing macOS binary...`);
      try {
        execSync(`codesign --remove-signature "${outputPath}"`, { stdio: 'pipe' });
        execSync(`codesign -s - --force --deep "${outputPath}"`, { stdio: 'pipe' });
        console.log(`   ✅ Binary re-signed`);
      } catch (e) {
        console.warn(`   ⚠️  Codesigning failed: ${e.message}`);
      }
    }

    // Clean up old files in resources (important: remove symlinks BEFORE copying)
    const cliWrapperName = `yume-cli-${target.platform}-${target.arch}${isWindows ? '.cmd' : ''}`;
    const cliWrapperPath = join(RESOURCES, cliWrapperName);
    const resourcePath = join(RESOURCES, outputName);

    // Remove old symlink/file first (prevents writing through symlink to binary)
    try { unlinkSync(cliWrapperPath); } catch (e) {}
    try { unlinkSync(resourcePath); } catch (e) {}

    // Copy binary to resources
    copyFileSync(outputPath, resourcePath);
    console.log(`   📁 Copied to resources: ${outputName}`);

    // Create yume-cli wrapper script in resources (for provider CLI spawning)
    // We can't use symlinks because the resolved path loses the invoked name
    if (isWindows) {
      // Windows batch wrapper
      const batchScript = `@echo off\r\n"%~dp0${outputName}" cli %*\r\n`;
      writeFileSync(cliWrapperPath, batchScript);
      console.log(`   📝 Created CLI wrapper: ${cliWrapperName}`);
    } else {
      // Unix shell wrapper
      const shellScript = `#!/bin/sh\nexec "$(dirname "$0")/${outputName}" cli "$@"\n`;
      writeFileSync(cliWrapperPath, shellScript);
      chmodSync(cliWrapperPath, 0o755);
      console.log(`   📝 Created CLI wrapper: ${cliWrapperName}`);
    }

    // Cleanup loader
    if (!skipBytecode && loaderPath !== unifiedPath) {
      try { unlinkSync(loaderPath); } catch (e) {}
    }
  }

  // Cleanup shared CLI bundle
  try { unlinkSync(cliBundlePath); } catch (e) {}

  console.log('\n✅ Unified build complete!');
  console.log(`   Output: ${DIST}`);
  console.log('   Binaries contain V8 bytecode protection.');
  console.log('\n   Resources now have:');
  console.log('   - yume-bin-{platform}-{arch}  (unified binary)');
  console.log('   - yume-cli-{platform}-{arch}  (symlink/copy for CLI mode)');
}

build().catch(console.error);
