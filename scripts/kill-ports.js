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

// Kill zombie server processes by name pattern (for this project only)
function killZombieServers() {
  try {
    if (os.platform() === 'win32') {
      // Windows
      execSync('taskkill /F /IM server-windows-x64.exe 2>nul', { stdio: 'ignore' });
    } else if (os.platform() === 'darwin') {
      // macOS - only kill servers from THIS project's directory
      const projectDir = path.join(__dirname, '..');
      const resourcesDir = path.join(projectDir, 'src-tauri', 'resources');

      // Kill servers running from our resources directory
      try {
        execSync(`pkill -9 -f "${resourcesDir}/server-macos"`, { stdio: 'ignore' });
        console.log('🔪 Killed zombie server processes from dev resources');
      } catch (e) {
        // No matching processes
      }

      // Also kill any node processes running our server source
      try {
        execSync(`pkill -9 -f "node.*server-claude-macos.cjs"`, { stdio: 'ignore' });
      } catch (e) {
        // No matching processes
      }
    } else {
      // Linux
      try {
        execSync('pkill -9 -f "server-linux-x64"', { stdio: 'ignore' });
      } catch (e) {
        // No matching processes
      }
    }
  } catch (error) {
    // Ignore errors - processes might not exist
  }
}

// Remove stale git lock files
function removeGitLock() {
  const gitLockPath = path.join(__dirname, '..', '.git', 'index.lock');
  try {
    if (fs.existsSync(gitLockPath)) {
      fs.unlinkSync(gitLockPath);
      console.log('🔓 Removed stale git lock file');
    }
  } catch (error) {
    console.log(`⚠️ Could not remove git lock: ${error.message}`);
  }
}

// Kill ports used by the app
console.log('🧹 Cleaning up ports and zombies...');
killZombieServers(); // Kill zombie servers first
removeGitLock(); // Remove stale git locks
killServerByPidFile(); // Kill server by PID file
killPort(3001); // Server port
killPort(5173); // Vite port

// Give a moment for ports to be released
setTimeout(() => {
  console.log('✨ Cleanup complete, ready to start!');
  process.exit(0);
}, 100);