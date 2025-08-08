#!/usr/bin/env node

const { execSync } = require('child_process');
const os = require('os');

function killPort(port) {
  try {
    if (os.platform() === 'win32') {
      // Windows
      try {
        // Find process using the port
        const result = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
        const lines = result.split('\n');
        const pids = new Set();
        
        lines.forEach(line => {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && !isNaN(pid)) {
            pids.add(pid);
          }
        });
        
        // Kill each process
        pids.forEach(pid => {
          try {
            execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
            console.log(`✅ Killed process ${pid} on port ${port}`);
          } catch (e) {
            // Process might already be dead
          }
        });
      } catch (e) {
        // No process found on port
        console.log(`✅ Port ${port} is free`);
      }
    } else {
      // Unix/Linux/Mac
      try {
        execSync(`lsof -ti:${port} | xargs kill -9`, { stdio: 'ignore' });
        console.log(`✅ Killed process on port ${port}`);
      } catch (e) {
        // No process found on port
        console.log(`✅ Port ${port} is free`);
      }
    }
  } catch (error) {
    console.log(`⚠️  Could not kill port ${port}: ${error.message}`);
  }
}

// Kill ports used by the app
console.log('🧹 Cleaning up ports...');
killPort(3001); // Server port
killPort(5173); // Vite port

// Give a moment for ports to be released
setTimeout(() => {
  console.log('✨ Ports cleaned up, ready to start!');
  process.exit(0);
}, 100);