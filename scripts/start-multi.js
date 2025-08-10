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
      shell: true
    });
    
    // Wait a moment for Vite to start
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Start Claude server
    console.log('🤖 Starting Claude server...');
    const serverProcess = spawn('node', ['server-claude-multi.js'], {
      env,
      stdio: 'inherit'
    });
    
    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Start Electron
    console.log('⚡ Starting Electron...');
    const electronProcess = spawn('electron', ['.'], {
      env: {
        ...env,
        ELECTRON_VITE_PORT: vitePort.toString(),
        ELECTRON_SERVER_PORT: serverPort.toString()
      },
      stdio: 'inherit',
      shell: true
    });
    
    console.log('✅ All processes started!');
    console.log(`📱 Access at: http://localhost:${vitePort}`);
    
    // Handle cleanup
    const cleanup = () => {
      console.log('\n🛑 Shutting down...');
      viteProcess.kill();
      serverProcess.kill();
      electronProcess.kill();
      process.exit(0);
    };
    
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    
  } catch (error) {
    console.error('❌ Failed to start:', error);
    process.exit(1);
  }
}

// Start the multi-instance
startMultiInstance();