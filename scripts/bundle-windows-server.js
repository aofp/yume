#!/usr/bin/env node

/**
 * Bundle the Windows server with all its dependencies for production
 */

import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

console.log('📦 Bundling Windows server for production...');

// Ensure resources directory exists
const resourcesDir = join(projectRoot, 'src-tauri', 'resources');
mkdirSync(resourcesDir, { recursive: true });

// Copy Windows server file
const windowsServerSource = join(projectRoot, 'server-claude-windows.cjs');
const windowsServerDest = join(resourcesDir, 'server-claude-windows.cjs');

if (existsSync(windowsServerSource)) {
  console.log('📋 Copying Windows server file...');
  cpSync(windowsServerSource, windowsServerDest);
  console.log('  ✓ server-claude-windows.cjs');
} else {
  console.error('❌ Windows server file not found:', windowsServerSource);
  process.exit(1);
}

// Also copy Linux server if it exists (for WSL scenarios)
const linuxServerSource = join(projectRoot, 'server-claude-linux.cjs');
const linuxServerDest = join(resourcesDir, 'server-claude-linux.cjs');

if (existsSync(linuxServerSource)) {
  console.log('📋 Copying Linux server file (for WSL)...');
  cpSync(linuxServerSource, linuxServerDest);
  console.log('  ✓ server-claude-linux.cjs');
}

// Copy wrapper-module.js to resources if it exists
const wrapperSource = join(projectRoot, 'wrapper-module.js');
const wrapperDest = join(resourcesDir, 'wrapper-module.js');
if (existsSync(wrapperSource)) {
  console.log('📋 Copying wrapper-module.js...');
  cpSync(wrapperSource, wrapperDest);
  console.log('  ✓ wrapper-module.js');
}

// Ensure package.json exists in resources (for node_modules)
const resourcePackage = {
  name: "yurucode-server",
  version: "1.0.0",
  type: "module", // Support ES modules
  private: true,
  dependencies: {
    "socket.io": "^4.8.1",
    "express": "^4.18.2",
    "cors": "^2.8.5"
  }
};

writeFileSync(
  join(resourcesDir, 'package.json'),
  JSON.stringify(resourcePackage, null, 2)
);

// Copy node_modules (only socket.io and its dependencies)
const nodeModulesSource = join(projectRoot, 'node_modules');
const nodeModulesDest = join(resourcesDir, 'node_modules');

if (existsSync(nodeModulesSource) && !existsSync(nodeModulesDest)) {
  console.log('📋 Copying Socket.IO dependencies...');
  
  // Complete list of all dependencies (found recursively)
  const requiredModules = [
    '@socket.io',
    'accepts',
    'base64id',
    'body-parser',
    'bytes',
    'call-bind',
    'call-bind-apply-helpers',
    'call-bound',
    'content-disposition',
    'content-type',
    'cookie',
    'cookie-signature',
    'cors',
    'debug',
    'depd',
    'dunder-proto',
    'ee-first',
    'encodeurl',
    'engine.io',
    'engine.io-parser',
    'es-define-property',
    'es-errors',
    'es-object-atoms',
    'escape-html',
    'etag',
    'express',
    'finalhandler',
    'forwarded',
    'fresh',
    'function-bind',
    'get-intrinsic',
    'get-proto',
    'gopd',
    'has',
    'has-proto',
    'has-symbols',
    'hasown',
    'http-errors',
    'iconv-lite',
    'inherits',
    'ipaddr.js',
    'is-promise',
    'math-intrinsics',
    'media-typer',
    'merge-descriptors',
    'methods',
    'mime',
    'mime-db',
    'mime-types',
    'ms',
    'negotiator',
    'object-assign',
    'object-inspect',
    'on-finished',
    'once',
    'parseurl',
    'path-to-regexp',
    'proxy-addr',
    'qs',
    'range-parser',
    'raw-body',
    'router',
    'safe-buffer',
    'safer-buffer',
    'send',
    'serve-static',
    'setprototypeof',
    'side-channel',
    'side-channel-list',
    'side-channel-map',
    'side-channel-weakmap',
    'socket.io',
    'socket.io-adapter',
    'socket.io-parser',
    'statuses',
    'toidentifier',
    'type-is',
    'unpipe',
    'utils-merge',
    'vary',
    'wrappy',
    'ws'
  ];
  
  mkdirSync(nodeModulesDest, { recursive: true });
  
  for (const module of requiredModules) {
    const sourcePath = join(nodeModulesSource, module);
    const destPath = join(nodeModulesDest, module);
    
    if (existsSync(sourcePath)) {
      console.log(`  ✓ ${module}`);
      cpSync(sourcePath, destPath, { recursive: true });
    }
  }
} else if (existsSync(nodeModulesDest)) {
  console.log('✓ node_modules already exist in resources');
}

console.log('✅ Windows server bundling complete!');
console.log('📁 Resources directory:', resourcesDir);