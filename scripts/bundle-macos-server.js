#!/usr/bin/env node

/**
 * Bundle the macOS server with all its dependencies for production
 */

import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

console.log('📦 Bundling macOS server for production...');

// Ensure resources directory exists
const resourcesDir = join(projectRoot, 'src-tauri', 'resources');
mkdirSync(resourcesDir, { recursive: true });

// Copy the original server file AS IS (it works!)
const serverSource = readFileSync(join(projectRoot, 'server-claude-macos.js'), 'utf8');
writeFileSync(join(resourcesDir, 'server-claude-macos.js'), serverSource);

// Also create a CommonJS version as backup
let serverCJS = serverSource
  .replace(/^import\s+{([^}]+)}\s+from\s+['"]([^'"]+)['"]/gm, 'const {$1} = require("$2")')
  .replace(/^import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/gm, 'const $1 = require("$2")');

// Remove fileURLToPath import and usage since we're in CommonJS
serverCJS = serverCJS
  .replace(/const\s+{\s*fileURLToPath\s*}\s*=\s*require\(["']url["']\);?\s*\n/g, '')
  .replace(/import\s+{\s*fileURLToPath\s*}\s+from\s+['"]url['"]\s*;?\s*\n/g, '')
  .replace(/const\s+__filename\s*=\s*fileURLToPath\(import\.meta\.url\);?\s*\n/g, '')
  .replace(/const\s+__dirname\s*=\s*dirname\(__filename\);?\s*\n/g, '// __dirname is already defined in CommonJS\n');

writeFileSync(join(resourcesDir, 'server-claude-macos.cjs'), serverCJS);

// Create a minimal package.json for the resources
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

if (existsSync(nodeModulesSource)) {
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
}

console.log('✅ Server bundling complete!');
console.log('📁 Resources directory:', resourcesDir);