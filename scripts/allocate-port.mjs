#!/usr/bin/env node

/**
 * Allocate a port and update config BEFORE anything starts
 */

import net from 'net';
import { writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

function findAvailablePortSync(startPort = 60000, endPort = 61000, excludePorts = []) {
  const randomStart = startPort + Math.floor(Math.random() * (endPort - startPort + 1));
  
  for (let offset = 0; offset <= (endPort - startPort); offset++) {
    const port = startPort + ((randomStart - startPort + offset) % (endPort - startPort + 1));
    if (excludePorts.includes(port)) continue;
    
    const server = net.createServer();
    try {
      // Explicitly bind to IPv4 localhost
      server.listen(port, '127.0.0.1');
      server.close();
      return port;
    } catch (e) {
      // Port in use, try next
    }
  }
  
  return 5173; // Fallback
}

// Find available ports
const vitePort = findAvailablePortSync();
const serverPort = findAvailablePortSync(60000, 61000, [vitePort]);

console.log(`Allocating ports: Vite=${vitePort}, Server=${serverPort}`);

// Write port files
writeFileSync(join(projectRoot, '.vite-port'), vitePort.toString());
writeFileSync(join(projectRoot, '.server-port'), serverPort.toString());

// Update Tauri config
const tauriConfigPath = join(projectRoot, 'src-tauri', 'tauri.conf.json');
const tauriConfig = JSON.parse(readFileSync(tauriConfigPath, 'utf8'));
tauriConfig.build.devUrl = `http://localhost:${vitePort}`;
writeFileSync(tauriConfigPath, JSON.stringify(tauriConfig, null, 2));

console.log(`Updated Tauri config to use port ${vitePort}`);