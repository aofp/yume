#!/usr/bin/env node

const { execSync } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

// PID file path for server tracking
const SERVER_PID_FILE = path.join(__dirname, '..', '.server.pid');

function killServerByPidFile() {
  try {
    if (!fs.existsSync(SERVER_PID_FILE)) {
      console.log('✅ No server PID file found (server not running)');
      return;
    }

    const pidStr = fs.readFileSync(SERVER_PID_FILE, 'utf8').trim();
    const pid = parseInt(pidStr, 10);
    
    if (!pid || isNaN(pid)) {
      console.log('⚠️ Invalid PID in server PID file:', pidStr);
      // Clean up invalid PID file
      fs.unlinkSync(SERVER_PID_FILE);
      return;
    }

    console.log(`🔍 Found server PID: ${pid}`);
    
    // Check if process exists and kill it
    try {
      if (os.platform() === 'win32') {
        // Windows
        try {
          execSync(`tasklist /FI "PID eq ${pid}"`, { encoding: 'utf8' });
          console.log(`🔪 Killing server process ${pid} (Windows)`);
          execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
          console.log(`✅ Server process ${pid} killed`);
        } catch (e) {
          console.log(`✅ Server process ${pid} was already terminated`);
        }
      } else {
        // Unix/Linux/Mac
        try {
          process.kill(pid, 0); // Check if process exists
          console.log(`🔪 Killing server process ${pid} (Unix)`);
          process.kill(pid, 'SIGTERM');
          
          // Give it a moment to cleanup, then force kill if needed
          setTimeout(() => {
            try {
              process.kill(pid, 'SIGKILL');
            } catch (e) {
              // Process already dead
            }
          }, 1000);
          
          console.log(`✅ Server process ${pid} killed`);
        } catch (e) {
          if (e.code === 'ESRCH') {
            console.log(`✅ Server process ${pid} was already terminated`);
          } else {
            throw e;
          }
        }
      }
    } catch (error) {
      console.log(`⚠️ Could not kill server process ${pid}: ${error.message}`);
    }
    
    // Clean up PID file
    fs.unlinkSync(SERVER_PID_FILE);
    console.log('🗑️ Server PID file cleaned up');
    
  } catch (error) {
    console.log(`⚠️ Error killing server by PID file: ${error.message}`);
  }
}

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
killServerByPidFile(); // Kill server by PID file first
killPort(3001); // Server port
killPort(5173); // Vite port

// Give a moment for ports to be released
setTimeout(() => {
  console.log('✨ Ports cleaned up, ready to start!');
  process.exit(0);
}, 100);