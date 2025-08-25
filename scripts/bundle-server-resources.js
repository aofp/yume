#!/usr/bin/env node

import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function bundleServer() {
  console.log('📦 Bundling server with dependencies...');
  
  const serverPath = path.join(__dirname, '../src-tauri/resources/server-claude-macos.cjs');
  const outputPath = path.join(__dirname, '../src-tauri/resources/server-bundled.cjs');
  
  try {
    // Bundle the server with all dependencies
    await build({
      entryPoints: [serverPath],
      bundle: true,
      platform: 'node',
      target: 'node18',
      format: 'cjs',
      outfile: outputPath,
      minify: true,
      treeShaking: true,
      external: ['child_process', 'fs', 'path', 'os', 'util', 'stream', 'events', 'crypto', 'buffer', 'net', 'http', 'https', 'tls', 'dns', 'url', 'querystring', 'zlib'],
      define: {
        'process.env.NODE_ENV': '"production"'
      },
      loader: {
        '.node': 'file'
      }
    });
    
    // Get file sizes
    const originalSize = fs.statSync(serverPath).size;
    const bundledSize = fs.statSync(outputPath).size;
    
    console.log(`✅ Server bundled successfully!`);
    console.log(`   Original: ${(originalSize / 1024).toFixed(2)} KB`);
    console.log(`   Bundled:  ${(bundledSize / 1024).toFixed(2)} KB`);
    
    // Backup original
    const backupPath = serverPath + '.pre-bundle';
    if (!fs.existsSync(backupPath)) {
      fs.copyFileSync(serverPath, backupPath);
      console.log(`📋 Original backed up to: ${path.basename(backupPath)}`);
    }
    
    // Replace original with bundled
    fs.renameSync(outputPath, serverPath);
    console.log(`✨ Replaced server with bundled version`);
    
    // Check if we can remove node_modules
    const nodeModulesPath = path.join(__dirname, '../src-tauri/resources/node_modules');
    if (fs.existsSync(nodeModulesPath)) {
      const nodeModulesSize = getDirectorySize(nodeModulesPath);
      console.log(`\n🗑️  Removing node_modules (${(nodeModulesSize / 1024 / 1024).toFixed(2)} MB)...`);
      fs.rmSync(nodeModulesPath, { recursive: true, force: true });
      console.log(`✅ node_modules removed!`);
    }
    
    console.log('\n🎉 Server bundling complete!');
    
  } catch (error) {
    console.error('❌ Error bundling server:', error);
    process.exit(1);
  }
}

function getDirectorySize(dirPath) {
  let size = 0;
  const files = fs.readdirSync(dirPath);
  
  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      size += getDirectorySize(filePath);
    } else {
      size += stat.size;
    }
  }
  
  return size;
}

bundleServer();