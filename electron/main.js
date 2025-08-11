const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');

// Set app name immediately on import for macOS
if (process.platform === 'darwin') {
  app.name = 'yurucode';
}
const path = require('path');
const { spawn, execSync } = require('child_process');
const Store = require('electron-store');
const fs = require('fs');

// More robust dev mode detection
const isDev = !app.isPackaged || process.env.NODE_ENV === 'development' || process.argv.includes('--dev');

// Initialize electron-store for persistent settings
const store = new Store({
  defaults: {
    windowBounds: {
      width: 1200,
      height: 800,
      x: undefined,
      y: undefined
    },
    windowMaximized: false,
    zoomLevel: 0
  }
});

// Server process management
let serverProcess = null;
let mainWindow = null;
let currentWorkingDirectory = null;
let serverPort = null;
let savedZoomLevel = store.get('zoomLevel', 0); // Load saved zoom level
let isShuttingDown = false; // Flag to prevent server restart during shutdown

// PID file path for development mode server tracking
const SERVER_PID_FILE = path.join(__dirname, '..', '.server.pid');

// Function to kill server by PID file (for development mode)
function killServerByPidFile() {
  try {
    if (!fs.existsSync(SERVER_PID_FILE)) {
      console.log('No server PID file found');
      return false;
    }

    const pidStr = fs.readFileSync(SERVER_PID_FILE, 'utf8').trim();
    const pid = parseInt(pidStr, 10);
    
    if (!pid || isNaN(pid)) {
      console.error('Invalid PID in server PID file:', pidStr);
      return false;
    }

    console.log(`Attempting to kill server process with PID: ${pid}`);
    
    // Check if process exists before trying to kill it
    try {
      process.kill(pid, 0); // Signal 0 just checks if process exists
      console.log(`Process ${pid} exists, sending SIGTERM...`);
      process.kill(pid, 'SIGTERM');
      
      // Give the process time to cleanup gracefully
      setTimeout(() => {
        try {
          process.kill(pid, 0); // Check if still alive
          console.log(`Process ${pid} still alive, sending SIGKILL...`);
          process.kill(pid, 'SIGKILL'); // Force kill
        } catch (err) {
          console.log(`Process ${pid} has terminated`);
        }
      }, 1500);
      
      return true;
    } catch (err) {
      if (err.code === 'ESRCH') {
        console.log(`Process ${pid} was already terminated`);
        return true;
      }
      throw err;
    }
  } catch (error) {
    console.error('Error killing server by PID file:', error);
    return false;
  } finally {
    // Clean up PID file
    try {
      if (fs.existsSync(SERVER_PID_FILE)) {
        fs.unlinkSync(SERVER_PID_FILE);
        console.log('Server PID file cleaned up');
      }
    } catch (err) {
      console.error('Failed to cleanup PID file:', err);
    }
  }
}

// ============================================
// REGISTER IPC HANDLERS IMMEDIATELY
// ============================================
console.log('Registering IPC handlers...');

ipcMain.on('window-close', () => {
  console.log('IPC: window-close received - closing window');
  if (mainWindow) {
    mainWindow.close();
    // Let the window-all-closed event handle the app quit properly
  }
});

ipcMain.on('window-minimize', () => {
  console.log('IPC: window-minimize received');
  if (mainWindow) {
    mainWindow.minimize();
  }
});

ipcMain.on('window-maximize', () => {
  console.log('IPC: window-maximize received');
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('toggle-dev-tools', () => {
  console.log('IPC: toggle-dev-tools received');
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.toggleDevTools();
  }
});

// Folder selection handlers
ipcMain.handle('select-folder', async () => {
  console.log('IPC: select-folder invoked');
  if (!mainWindow) {
    console.error('Cannot show dialog - mainWindow is null');
    return null;
  }
  
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Project Folder',
    buttonLabel: 'Select Folder'
  });
  
  console.log('Dialog result:', result);
  
  if (!result.canceled && result.filePaths.length > 0) {
    const selectedPath = result.filePaths[0];
    console.log('Selected folder:', selectedPath);
    currentWorkingDirectory = selectedPath;
    return selectedPath;
  }
  
  return null;
});

ipcMain.handle('get-working-directory', () => {
  console.log('IPC: get-working-directory invoked');
  return currentWorkingDirectory;
});

ipcMain.handle('get-server-port', () => {
  console.log('IPC: get-server-port invoked, returning:', serverPort);
  return serverPort;
});

ipcMain.handle('is-directory', async (event, path) => {
  console.log('IPC: is-directory invoked for:', path);
  try {
    const stats = fs.statSync(path);
    return stats.isDirectory();
  } catch (err) {
    console.error('Error checking if directory:', err);
    return false;
  }
});

// Zoom handlers
ipcMain.handle('zoom-in', async () => {
  console.log('IPC zoom-in called, mainWindow:', !!mainWindow);
  if (!mainWindow) {
    console.error('No mainWindow available');
    return null;
  }
  const currentZoom = mainWindow.webContents.getZoomLevel();
  const newZoom = currentZoom + 0.5;
  console.log('Setting zoom from', currentZoom, 'to', newZoom);
  mainWindow.webContents.setZoomLevel(newZoom);
  store.set('zoomLevel', newZoom); // Save to store
  mainWindow.webContents.executeJavaScript(`
    localStorage.setItem('zoomLevel', '${newZoom}');
    window.dispatchEvent(new CustomEvent('zoom-changed', { detail: ${newZoom} }));
  `);
  return newZoom;
});

ipcMain.handle('zoom-out', async () => {
  if (!mainWindow) return;
  const currentZoom = mainWindow.webContents.getZoomLevel();
  const newZoom = currentZoom - 0.5;
  mainWindow.webContents.setZoomLevel(newZoom);
  store.set('zoomLevel', newZoom); // Save to store
  mainWindow.webContents.executeJavaScript(`
    localStorage.setItem('zoomLevel', '${newZoom}');
    window.dispatchEvent(new CustomEvent('zoom-changed', { detail: ${newZoom} }));
  `);
  return newZoom;
});

ipcMain.handle('zoom-reset', async () => {
  if (!mainWindow) return;
  mainWindow.webContents.setZoomLevel(0);
  store.set('zoomLevel', 0); // Save to store
  mainWindow.webContents.executeJavaScript(`
    localStorage.setItem('zoomLevel', '0');
    window.dispatchEvent(new CustomEvent('zoom-changed', { detail: 0 }));
  `);
  return 0;
});

ipcMain.handle('get-zoom-level', async () => {
  if (!mainWindow) return 0;
  return mainWindow.webContents.getZoomLevel();
});

console.log('IPC handlers registered!');

// Handle command line arguments
const args = process.argv.slice(2);
if (args.length > 0) {
  // Check if the argument is a directory
  const path = require('path');
  const fs = require('fs');
  const dirPath = path.resolve(args[0]);
  
  if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
    currentWorkingDirectory = dirPath;
    console.log('Opening project directory:', currentWorkingDirectory);
  }
}

// Default to current directory if not specified
if (!currentWorkingDirectory) {
  currentWorkingDirectory = process.cwd();
}

// Additional handlers registered here for compatibility

// Disable GPU caching to prevent Windows permission errors
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-gpu-program-cache');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');

// Additional optimizations to reduce memory and disable unused features
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-features=TranslateUI,BlinkGenPropertyTrees,AudioServiceOutOfProcess');
app.commandLine.appendSwitch('disable-speech-api');
app.commandLine.appendSwitch('disable-features=AudioServiceOutOfProcess,WebRTC,MediaStream');
app.commandLine.appendSwitch('disable-web-security', 'false'); // Keep security enabled but optimize
app.commandLine.appendSwitch('disable-plugins');
app.commandLine.appendSwitch('disable-extensions');
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=512'); // Limit V8 memory

// Start the built-in Claude Code server
async function startServer() {
  console.log('===== ELECTRON SERVER STARTUP =====');
  console.log('isDev:', isDev);
  console.log('app.isPackaged:', app.isPackaged);
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('__dirname:', __dirname);
  console.log('process.cwd():', process.cwd());
  console.log('====================================');
  
  if (isDev) {
    // In development mode, server is already running separately via npm script
    console.log('Development mode - server already running via npm script on port 3001');
    serverPort = 3001;
    return;
  }
  
  // Production mode - need to start the server
  console.log('PRODUCTION MODE - Starting embedded server...');
  
  // Try multiple possible server locations
  const fs = require('fs');
  let serverPath = null;
  const possiblePaths = [
    path.join(__dirname, '../server-claude-direct.js'),
    path.join(process.resourcesPath, 'app', 'server-claude-direct.js'),
    path.join(process.resourcesPath, 'server-claude-direct.js'),
    path.join(__dirname, '..', '..', 'server-claude-direct.js')
  ];
  
  console.log('Searching for server in these locations:');
  for (const testPath of possiblePaths) {
    console.log(`  Checking: ${testPath}`);
    if (fs.existsSync(testPath)) {
      serverPath = testPath;
      console.log(`  ✅ FOUND at: ${testPath}`);
      break;
    } else {
      console.log(`  ❌ Not found`);
    }
  }
  
  if (!serverPath) {
    console.error('❌ Could not find server-claude-direct.js in any expected location!');
    console.error('This is a packaging issue. The server file is missing from the build.');
    return;
  }
  
  console.log(`Starting server from: ${serverPath}`);
  
  // Use explicit node executable path in production
  const nodePath = process.execPath; // Use electron's node
  console.log(`Using Node/Electron executable: ${nodePath}`);
  
  serverProcess = spawn(nodePath, [serverPath], {
    cwd: path.dirname(serverPath),
    env: { 
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1' // Run as Node.js, not Electron
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true // Hide console window on Windows
  });
  
  serverPort = 3001;
  
  if (!serverProcess) {
    console.error('❌ Failed to spawn server process!');
    return;
  }
  
  console.log(`✅ Server process spawned with PID: ${serverProcess.pid}`);
  
  // Create a promise to track server startup
  const serverReady = new Promise((resolve, reject) => {
    let serverStarted = false;
    const timeout = setTimeout(() => {
      if (!serverStarted) {
        console.error('❌ Server startup timeout after 10 seconds');
        reject(new Error('Server startup timeout'));
      }
    }, 10000);
    
    serverProcess.stdout?.on('data', (data) => {
      const output = data.toString();
      console.log('[Server STDOUT]:', output.trim());
      
      // Check for server ready message
      if (output.includes('Claude Direct Server running') || output.includes('SERVER SUCCESSFULLY STARTED')) {
        console.log('✅ Server is ready!');
        serverStarted = true;
        clearTimeout(timeout);
        resolve();
      }
      
      // Send server logs to renderer for debugging
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.executeJavaScript(`
          console.log('[Server]:', ${JSON.stringify(output)});
        `).catch(() => {});
      }
    });
    
    serverProcess.stderr?.on('data', (data) => {
      const error = data.toString();
      console.error('[Server STDERR]:', error.trim());
      // Send server errors to renderer for debugging
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.executeJavaScript(`
          console.error('[Server Error]:', ${JSON.stringify(error)});
        `).catch(() => {});
      }
    });
  });
  
  serverProcess.on('error', (err) => {
    console.error('❌ Server process error:', err);
    console.error('Error code:', err.code);
    console.error('Error message:', err.message);
    if (err.code === 'ENOENT') {
      console.error('Node executable not found!');
    }
  });
  
  serverProcess.on('exit', (code, signal) => {
    console.log(`🚨 Server process exited`);
    console.log(`  Exit code: ${code}`);
    console.log(`  Signal: ${signal}`);
    serverProcess = null;
    
    // Try to restart if it crashed in production, but not during shutdown
    if (!isDev && code !== 0 && code !== null && !isShuttingDown) {
      console.log('Attempting to restart server in 2 seconds...');
      setTimeout(() => startServer(), 2000);
    }
  });
  
  // Wait for server to be ready
  try {
    await serverReady;
    console.log('✅ Server startup complete!');
  } catch (err) {
    console.error('❌ Server failed to start:', err.message);
  }
}

function createWindow() {
  // Get saved window bounds
  const windowBounds = store.get('windowBounds');
  const isMaximized = store.get('windowMaximized', false);
  
  const windowConfig = {
    width: windowBounds.width,
    height: windowBounds.height,
    x: windowBounds.x,
    y: windowBounds.y,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#000000',
    title: 'yurucode',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: false,  // Required for our preload to work
      webSecurity: false, // Allow access to file paths from drag-drop
      preload: path.join(__dirname, 'preload-simple.js')
    },
    icon: process.platform === 'win32' 
      ? path.join(__dirname, '../assets/yurucode.ico')
      : process.platform === 'darwin'
      ? path.join(__dirname, '../yurucode.png')  // Use PNG for window icon on macOS
      : path.join(__dirname, '../yurucode.png')
  };

  // Platform-specific window settings
  if (process.platform === 'win32') {
    // Windows: Frameless window with NO titlebar
    windowConfig.frame = false;
    windowConfig.titleBarStyle = 'hidden';
  } else if (process.platform === 'darwin') {
    // macOS: keep the native style with custom titlebar
    windowConfig.titleBarStyle = 'hiddenInset';
    windowConfig.trafficLightPosition = { x: 8, y: 6 };
  }

  mainWindow = new BrowserWindow(windowConfig);
  
  // Restore maximized state if it was maximized
  if (isMaximized) {
    mainWindow.maximize();
  }
  
  // Save window state on resize and move
  const saveWindowState = () => {
    if (!mainWindow.isMaximized() && !mainWindow.isMinimized()) {
      const bounds = mainWindow.getBounds();
      store.set('windowBounds', bounds);
    }
    store.set('windowMaximized', mainWindow.isMaximized());
  };
  
  // Debounce function to avoid too many saves
  let saveTimeout;
  const debouncedSaveState = () => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveWindowState, 500);
  };
  
  mainWindow.on('resize', debouncedSaveState);
  mainWindow.on('move', debouncedSaveState);
  mainWindow.on('maximize', saveWindowState);
  mainWindow.on('unmaximize', saveWindowState);

  // Register keyboard shortcuts
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') {
      mainWindow.webContents.toggleDevTools();
    }
    
    // Zoom controls
    if ((input.control || input.meta) && input.key === '0' && !input.shift) {
      // Ctrl/Cmd+0 - Reset zoom to 100%
      event.preventDefault();
      mainWindow.webContents.setZoomLevel(0);
      // Save zoom level and notify renderer
      mainWindow.webContents.executeJavaScript(`
        localStorage.setItem('zoomLevel', '0');
        window.dispatchEvent(new CustomEvent('zoom-changed', { detail: 0 }));
      `);
      return;
    }
    if ((input.control || input.meta) && (input.key === '=' || input.key === '+') && !input.shift) {
      // Ctrl/Cmd++ - Zoom in
      event.preventDefault();
      const currentZoom = mainWindow.webContents.getZoomLevel();
      const newZoom = currentZoom + 0.5;
      mainWindow.webContents.setZoomLevel(newZoom);
      // Save zoom level and notify renderer
      mainWindow.webContents.executeJavaScript(`
        localStorage.setItem('zoomLevel', '${newZoom}');
        window.dispatchEvent(new CustomEvent('zoom-changed', { detail: ${newZoom} }));
      `);
      return;
    }
    if ((input.control || input.meta) && input.key === '-' && !input.shift) {
      // Ctrl/Cmd+- - Zoom out
      event.preventDefault();
      const currentZoom = mainWindow.webContents.getZoomLevel();
      const newZoom = currentZoom - 0.5;
      mainWindow.webContents.setZoomLevel(newZoom);
      // Save zoom level and notify renderer
      mainWindow.webContents.executeJavaScript(`
        localStorage.setItem('zoomLevel', '${newZoom}');
        window.dispatchEvent(new CustomEvent('zoom-changed', { detail: ${newZoom} }));
      `);
      return;
    }
    
    // Windows-specific shortcuts since there's no titlebar
    if (process.platform === 'win32') {
      if (input.control && input.key === 'q') {
        // Ctrl+Q to quit
        app.quit();
      }
      if (input.control && input.key === 'm') {
        // Ctrl+M to minimize
        mainWindow.minimize();
      }
    }
  });

  // Load the app
  if (isDev) {
    // Check for dynamic Vite port from environment
    const vitePort = process.env.ELECTRON_VITE_PORT || '5173';
    mainWindow.loadURL(`http://localhost:${vitePort}`);
    console.log(`Loading app from: http://localhost:${vitePort}`);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/renderer/index.html'));
  }
  
  // Send initial directory to renderer and restore zoom level
  mainWindow.webContents.on('did-finish-load', async () => {
    mainWindow.webContents.send('initial-directory', currentWorkingDirectory);
    
    // Restore zoom level from store
    const savedZoom = store.get('zoomLevel', 0);
    mainWindow.webContents.setZoomLevel(savedZoom);
    console.log('Restored zoom level:', savedZoom);
    
    // Also sync to localStorage for consistency
    try {
      await mainWindow.webContents.executeJavaScript(`
        localStorage.setItem('zoomLevel', '${savedZoom}');
        window.dispatchEvent(new CustomEvent('zoom-changed', { detail: ${savedZoom} }));
      `);
    } catch (err) {
      console.error('Failed to sync zoom to localStorage:', err);
    }
  });

  mainWindow.on('closed', () => {
    console.log('Window closed event');
    mainWindow = null;
    // Don't call app.quit() here - let window-all-closed handle it properly
    // This ensures consistent behavior across all platforms
  });
}

// Function removed - we're not using menus anymore

// Duplicate handlers removed - they are registered at the top of the file

// Handle protocol for opening directories
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('burntcode', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('burntcode');
}

// Set app name early for macOS
app.setName('yurucode');

// App lifecycle
app.whenReady().then(async () => {
  // Set dock icon for macOS
  if (process.platform === 'darwin' && app.dock) {
    // Use PNG for dock icon - it works reliably
    const pngPath = path.join(__dirname, '../yurucode.png');
    if (fs.existsSync(pngPath)) {
      try {
        app.dock.setIcon(pngPath);
        console.log('✅ Dock icon set successfully');
      } catch (err) {
        console.error('Failed to set dock icon:', err);
      }
    }
  }
  
  await startServer();
  createWindow();
  
  // Create minimal menu for macOS to show proper app name
  if (process.platform === 'darwin') {
    const template = [
      {
        label: 'yurucode',
        submenu: [
          { role: 'about', label: 'About yurucode' },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide', label: 'Hide yurucode' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit', label: 'Quit yurucode' }
        ]
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' }
        ]
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'forceReload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' }
        ]
      },
      {
        label: 'Window',
        submenu: [
          { role: 'minimize' },
          { 
            label: 'Close Tab',
            accelerator: 'CmdOrCtrl+W',
            click: () => {
              // Send close tab event to renderer
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('close-current-tab');
              }
            }
          },
          { 
            label: 'Close Window',
            accelerator: 'CmdOrCtrl+Shift+W',
            role: 'close'
          }
        ]
      }
    ];
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  } else {
    // Remove menu completely on Windows/Linux
    Menu.setApplicationMenu(null);
  }
});

// Allow multiple instances by removing single instance lock
// Each instance will get its own port
const gotTheLock = true; // Always allow new instances

// No longer preventing second instances - each gets its own port

app.on('window-all-closed', () => {
  console.log('All windows closed - shutting down app completely');
  isShuttingDown = true; // Prevent server restart during shutdown
  
  // Always quit when all windows are closed (including macOS)
  // This ensures the server and all processes are properly terminated
  
  if (isDev) {
    // In development mode, kill server by PID file
    console.log('Development mode - killing server by PID file');
    killServerByPidFile();
    // Give the server a moment to clean up its processes
    setTimeout(() => {
      console.log('App quitting after server cleanup');
      app.quit();
    }, 2000);
  } else if (serverProcess) {
    // Production mode - kill the server process we spawned
    console.log('Production mode - sending SIGTERM to server process for graceful shutdown');
    serverProcess.kill('SIGTERM'); // Use SIGTERM for graceful shutdown
    
    // Give the server a moment to clean up its processes
    setTimeout(() => {
      console.log('App quitting after server cleanup');
      app.quit();
    }, 1000);
  } else {
    // No server process running, quit immediately
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('before-quit', (event) => {
  console.log('App before quit - cleaning up processes');
  isShuttingDown = true; // Prevent server restart during shutdown
  
  // Send message to renderer to clear sessions
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('app-before-quit');
  }
  
  if (isDev) {
    // Development mode - kill server by PID file
    console.log('Development mode - killing server by PID file in before-quit');
    killServerByPidFile();
  } else if (serverProcess && !serverProcess.killed) {
    // Production mode - ensure server process is properly terminated
    console.log('Production mode - terminating server process with SIGTERM for graceful cleanup');
    serverProcess.kill('SIGTERM');
    
    // Prevent immediate quit to allow cleanup
    event.preventDefault();
    
    // Force quit after 2 seconds if server doesn't exit gracefully
    const forceQuitTimer = setTimeout(() => {
      console.log('Forcing server process termination with SIGKILL');
      if (serverProcess && !serverProcess.killed) {
        serverProcess.kill('SIGKILL');
      }
      app.quit();
    }, 2000);
    
    // Clean quit when server exits gracefully
    serverProcess.once('exit', () => {
      console.log('Server process exited gracefully');
      clearTimeout(forceQuitTimer);
      serverProcess = null;
      app.quit();
    });
  }
});