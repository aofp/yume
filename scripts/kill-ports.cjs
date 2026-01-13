#!/usr/bin/env node

/**
 * Aggressive zombie process killer for yume dev mode
 * Kills ALL processes that could block dev startup
 */

const { execSync, spawnSync } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

const PROJECT_DIR = path.join(__dirname, '..');
const RESOURCES_DIR = path.join(PROJECT_DIR, 'src-tauri', 'resources');

// PID files
const SERVER_PID_FILE = path.join(PROJECT_DIR, '.server.pid');
const VITE_PID_FILE = path.join(PROJECT_DIR, '.vite.pid');

// Get dev port from tauri config
function getDevPort() {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(PROJECT_DIR, 'src-tauri', 'tauri.conf.json'), 'utf8'));
    const match = (config.build?.devUrl || '').match(/:(\d+)/);
    return match ? parseInt(match[1], 10) : 5173;
  } catch {
    return 5173;
  }
}

// Kill process by PID
function killPid(pid, name = 'process') {
  if (!pid || isNaN(pid)) return false;
  try {
    process.kill(pid, 0); // Check if exists
    process.kill(pid, 'SIGKILL');
    console.log(`🔪 Killed ${name} (PID: ${pid})`);
    return true;
  } catch (e) {
    if (e.code !== 'ESRCH') console.log(`⚠️ Could not kill ${name} (${pid}): ${e.message}`);
    return false;
  }
}

// Kill by PID file
function killByPidFile(pidFile, name) {
  try {
    if (!fs.existsSync(pidFile)) return;
    const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
    killPid(pid, name);
    fs.unlinkSync(pidFile);
  } catch (e) {
    // Ignore
  }
}

// Kill processes on a specific port (macOS/Linux)
function killPort(port) {
  if (os.platform() === 'win32') {
    try {
      const result = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
      const pids = new Set();
      result.split('\n').forEach(line => {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && !isNaN(pid)) pids.add(pid);
      });
      pids.forEach(pid => {
        try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' }); } catch {}
      });
      if (pids.size > 0) console.log(`🔪 Killed ${pids.size} process(es) on port ${port}`);
    } catch {}
  } else {
    try {
      execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null`, { stdio: 'ignore' });
      console.log(`🔪 Killed process on port ${port}`);
    } catch {}
  }
}

// Kill processes matching pattern (macOS/Linux only)
function killPattern(pattern, description) {
  if (os.platform() === 'win32') return;
  try {
    // Use pgrep to find PIDs, then kill them
    const result = spawnSync('pgrep', ['-f', pattern], { encoding: 'utf8' });
    if (result.stdout) {
      const pids = result.stdout.trim().split('\n').filter(p => p);
      pids.forEach(pid => {
        try {
          process.kill(parseInt(pid, 10), 'SIGKILL');
        } catch {}
      });
      if (pids.length > 0) console.log(`🔪 Killed ${pids.length} ${description}`);
    }
  } catch {}
}

// Main cleanup
console.log('🧹 Aggressive zombie cleanup starting...\n');

// 1. Kill by PID files first (most reliable)
killByPidFile(SERVER_PID_FILE, 'server');
killByPidFile(VITE_PID_FILE, 'vite');

// 2. Kill by port
const devPort = getDevPort();
console.log(`📌 Dev port from config: ${devPort}`);
killPort(devPort);  // Main dev port
killPort(5173);     // Legacy vite port
killPort(3001);     // Legacy server port

// 3. Kill vite processes from THIS project specifically
killPattern(`node.*${PROJECT_DIR.replace(/\//g, '\\/')}.*vite`, 'vite process(es) from this project');
killPattern(`node.*vite.*${devPort}`, 'vite on dev port');

// 4. Kill esbuild service from this project
killPattern(`esbuild.*${PROJECT_DIR.replace(/\//g, '\\/')}`, 'esbuild service(s)');

// 5. Kill dev server binaries from resources (scoped to this project only)
// IMPORTANT: Only kill servers from THIS project's resources dir, not production app servers
const platform = os.platform();
if (platform === 'darwin') {
  killPattern(`${RESOURCES_DIR}/yume-server-macos`, 'dev server(s)');
} else if (platform === 'linux') {
  killPattern(`${RESOURCES_DIR}/yume-server-linux`, 'dev server(s)');
}
// Windows: killPattern skips win32, so no action needed

// 6. Kill node processes running server source files (platform-specific)
if (platform === 'darwin') {
  killPattern('node.*server-claude-macos\\.cjs', 'server source process(es)');
} else if (platform === 'linux') {
  killPattern('node.*server-claude-linux\\.cjs', 'server source process(es)');
}

// 7. Kill any zombie tauri dev processes from this project
killPattern(`cargo.*${PROJECT_DIR.replace(/\//g, '\\/')}`, 'cargo process(es)');

// 8. Clean up git lock - always remove since we're doing cleanup before restart
// This is safe because we're killing all related processes anyway
const gitLockPath = path.join(PROJECT_DIR, '.git', 'index.lock');
try {
  if (fs.existsSync(gitLockPath)) {
    fs.unlinkSync(gitLockPath);
    console.log('🔓 Removed git lock file');
  }
} catch {}

// 9. DO NOT kill Claude processes - they might be running outside of yume
// Previously this killed all claude processes matching certain patterns, but this
// incorrectly killed other Claude CLI instances not associated with yume.
// Yume's ProcessRegistry handles cleanup of its own spawned Claude processes.

// Brief wait for ports to be released
setTimeout(() => {
  console.log('\n✨ Cleanup complete!');
  process.exit(0);
}, 200);
