/**
 * Multi-instance starter that handles dynamic port allocation for both Vite and server
 */

const { spawn } = require('child_process');
const path = require('path');
const net = require('net');

// Find an available port
function getAvailablePort(startPort) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(startPort, () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', () => {
      // Port in use, try next one
      getAvailablePort(startPort + 1).then(resolve).catch(reject);
    });
  });
}

async function startMultiInstance() {
  console.log('🚀 Starting yurucode in multi-instance mode...');
  
  try {
    // Find available ports
    const vitePort = await getAvailablePort(5173);
    const serverPort = await getAvailablePort(3001);
    
    console.log(`📍 Found available ports:`);
    console.log(`   Vite: ${vitePort}`);
    console.log(`   Server: ${serverPort}`);
    
    // Set environment variables
    const env = {
      ...process.env,
      VITE_PORT: vitePort.toString(),
      CLAUDE_SERVER_PORT: serverPort.toString(),
      PORT: vitePort.toString() // For Vite
    };
    
    // Start Vite dev server
    console.log('🌐 Starting Vite dev server...');
    const viteProcess = spawn('npx', ['vite', '--port', vitePort.toString()], {
      env,
      stdio: 'inherit',
      shell: true,
      detached: false  // Ensure child process dies with parent
    });
    
    // Wait a moment for Vite to start
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Start Claude server
    console.log('🤖 Starting Claude server...');
    const serverProcess = spawn('node', ['server-claude-multi.js'], {
      env,
      stdio: 'inherit',
      detached: false  // Ensure child process dies with parent
    });
    
    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Start Electron
    console.log('⚡ Starting Electron...');
    const electronProcess = spawn('npx', ['electron', '.'], {
      env: {
        ...env,
        ELECTRON_VITE_PORT: vitePort.toString(),
        ELECTRON_SERVER_PORT: serverPort.toString()
      },
      stdio: 'inherit',
      shell: true,
      detached: false  // Ensure child process dies with parent
    });
    
    console.log('✅ All processes started!');
    console.log(`📱 Access at: http://localhost:${vitePort}`);
    
    // Handle cleanup
    const cleanup = (code = 0) => {
      console.log('\n🛑 Shutting down all processes...');
      
      // Kill all child processes with process tree on Windows
      if (process.platform === 'win32') {
        // On Windows, use taskkill with /T flag to kill process trees
        if (viteProcess && !viteProcess.killed) {
          console.log(`   Killing Vite process tree (PID: ${viteProcess.pid})...`);
          try {
            require('child_process').execSync(`taskkill /PID ${viteProcess.pid} /T /F`, { stdio: 'ignore' });
          } catch (e) {
            viteProcess.kill('SIGTERM');
          }
        }
        if (serverProcess && !serverProcess.killed) {
          console.log(`   Killing server process tree (PID: ${serverProcess.pid})...`);
          try {
            require('child_process').execSync(`taskkill /PID ${serverProcess.pid} /T /F`, { stdio: 'ignore' });
          } catch (e) {
            serverProcess.kill('SIGTERM');
          }
        }
        if (electronProcess && !electronProcess.killed) {
          console.log(`   Killing Electron process tree (PID: ${electronProcess.pid})...`);
          try {
            require('child_process').execSync(`taskkill /PID ${electronProcess.pid} /T /F`, { stdio: 'ignore' });
          } catch (e) {
            electronProcess.kill('SIGTERM');
          }
        }
      } else {
        // On Unix-like systems, use regular kill
        if (viteProcess && !viteProcess.killed) {
          console.log('   Killing Vite...');
          viteProcess.kill('SIGTERM');
        }
        if (serverProcess && !serverProcess.killed) {
          console.log('   Killing server...');
          serverProcess.kill('SIGTERM');
        }
        if (electronProcess && !electronProcess.killed) {
          console.log('   Killing Electron...');
          electronProcess.kill('SIGTERM');
        }
      }
      
      // Give processes time to clean up, then force exit
      setTimeout(() => {
        console.log('✅ All processes terminated');
        
        // On Windows, check for any remaining Node/Electron processes
        if (process.platform === 'win32') {
          console.log('\n🔍 Checking for remaining processes...');
          require('child_process').exec('wmic process where "name=\'node.exe\' or name=\'electron.exe\'" get ProcessId,Name,CommandLine', (err, stdout) => {
            if (!err && stdout && stdout.trim()) {
              const lines = stdout.split('\n').filter(line => line.trim() && !line.includes('Name'));
              if (lines.length > 0) {
                console.log('⚠️ WARNING: Found remaining processes after cleanup:');
                lines.forEach(line => console.log('   ', line.trim()));
              } else {
                console.log('✅ No Node or Electron processes remaining');
              }
            }
            
            console.log('\nExiting with code:', code || 0);
            process.exit(code || 0);
          });
        } else {
          console.log('Exiting...');
          process.exit(code);
        }
      }, 1000);
    };
    
    // When Electron exits, kill everything
    electronProcess.on('exit', (code) => {
      console.log(`\n📱 Electron exited with code ${code}`);
      cleanup(code);
    });
    
    // Handle manual termination
    process.on('SIGINT', () => cleanup(0));
    process.on('SIGTERM', () => cleanup(0));
    
  } catch (error) {
    console.error('❌ Failed to start:', error);
    process.exit(1);
  }
}

// Start the multi-instance
startMultiInstance();