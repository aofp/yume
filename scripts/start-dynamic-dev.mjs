#!/usr/bin/env node

/**
 * Start development with dynamic ports
 * 1. Allocate ports
 * 2. Update Tauri config
 * 3. Start Tauri dev
 */

import { spawn } from 'child_process';
import net from 'net';
import { writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port, '127.0.0.1');
  });
}

async function findAvailablePort(excludePorts = [], startPort = 60000, endPort = 61000) {
  const randomStart = startPort + Math.floor(Math.random() * (endPort - startPort + 1));
  
  if (!excludePorts.includes(randomStart) && await isPortAvailable(randomStart)) {
    return randomStart;
  }
  
  for (let offset = 1; offset <= (endPort - startPort); offset++) {
    const port = startPort + ((randomStart - startPort + offset) % (endPort - startPort + 1));
    if (!excludePorts.includes(port) && await isPortAvailable(port)) {
      return port;
    }
  }
  
  throw new Error(`No available port found in range ${startPort}-${endPort}`);
}

async function main() {
  console.log('🚀 Starting yurucode with dynamic ports...\n');
  
  const allocatedPorts = [];
  
  // Find Vite port
  const vitePort = await findAvailablePort(allocatedPorts);
  allocatedPorts.push(vitePort);
  console.log(`📡 Vite port: ${vitePort}`);
  
  // Find server port
  const serverPort = await findAvailablePort(allocatedPorts);
  console.log(`🖥️  Server port: ${serverPort}`);
  
  // Write to files
  writeFileSync(join(projectRoot, '.vite-port'), vitePort.toString());
  writeFileSync(join(projectRoot, '.server-port'), serverPort.toString());
  
  // Update Tauri config
  const tauriConfigPath = join(projectRoot, 'src-tauri', 'tauri.conf.json');
  const tauriConfig = JSON.parse(readFileSync(tauriConfigPath, 'utf8'));
  const originalDevUrl = tauriConfig.build.devUrl;
  tauriConfig.build.devUrl = `http://localhost:${vitePort}`;
  writeFileSync(tauriConfigPath, JSON.stringify(tauriConfig, null, 2));
  
  console.log(`✅ Updated Tauri config: ${originalDevUrl} → http://localhost:${vitePort}\n`);
  
  // Start Tauri dev with environment variables
  const tauri = spawn('npm', ['run', 'tauri:dev'], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_PORT: vitePort.toString(),
      SERVER_PORT: serverPort.toString(),
    },
    shell: true
  });
  
  // Restore original config on exit
  const cleanup = () => {
    console.log('\n🧹 Restoring original Tauri config...');
    tauriConfig.build.devUrl = originalDevUrl;
    writeFileSync(tauriConfigPath, JSON.stringify(tauriConfig, null, 2));
    process.exit(0);
  };
  
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  
  tauri.on('exit', (code) => {
    cleanup();
  });
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});