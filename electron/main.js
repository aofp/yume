const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
// More robust dev mode detection
const isDev = !app.isPackaged || process.env.NODE_ENV === 'development' || process.argv.includes('--dev');

// Server process management
let serverProcess = null;
let mainWindow = null;
let currentWorkingDirectory = null;
let serverPort = null;

// ============================================
// REGISTER IPC HANDLERS IMMEDIATELY
// ============================================
console.log('Registering IPC handlers...');

ipcMain.on('window-close', () => {
  console.log('IPC: window-close received - CLOSING APP NOW');
  if (mainWindow) {
    mainWindow.close();
  }
  app.quit();
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

// Start the built-in Claude Code server
async function startServer() {
  console.log('isDev:', isDev, 'isPackaged:', app.isPackaged, 'NODE_ENV:', process.env.NODE_ENV);
  
  if (isDev) {
    // In development mode, server is already running separately via npm script
    console.log('Development mode - server already running via npm script on port 3001');
    serverPort = 3001;
    return;
  }
  
  // Production mode - need to start the server
  console.log('Production mode - starting server...');
  const serverPath = path.join(__dirname, '../server.js');
  console.log('Server path:', serverPath);
  
  serverProcess = spawn('node', [serverPath], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  
  serverPort = 3001;
  
  serverProcess.stdout?.on('data', (data) => {
    console.log('[Server]:', data.toString());
  });
  
  serverProcess.stderr?.on('data', (data) => {
    console.error('[Server Error]:', data.toString());
  });
  
  serverProcess.on('error', (err) => {
    console.error('Failed to start server:', err);
  });
  
  serverProcess.on('exit', (code) => {
    console.log(`Server exited with code ${code}`);
    serverProcess = null;
  });
  
  // Wait a bit for server to start
  await new Promise(resolve => setTimeout(resolve, 2000));
}

function createWindow() {
  const windowConfig = {
    width: 800,
    height: 600,
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
      : path.join(__dirname, '../assets/yurucode.png')
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

  // Register keyboard shortcuts
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') {
      mainWindow.webContents.toggleDevTools();
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
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/renderer/index.html'));
  }
  
  // Send initial directory to renderer
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('initial-directory', currentWorkingDirectory);
  });

  mainWindow.on('closed', () => {
    console.log('Window closed event');
    mainWindow = null;
    if (process.platform === 'win32') {
      app.quit();
    }
  });
}

function createMenu() {
  // On Windows with frameless window, hide the menu bar
  if (process.platform === 'win32') {
    Menu.setApplicationMenu(null);
    return;
  }

  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Folder...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              properties: ['openDirectory']
            });
            
            if (!result.canceled && result.filePaths.length > 0) {
              currentWorkingDirectory = result.filePaths[0];
              console.log('Selected folder:', currentWorkingDirectory);
              
              // Restart server with new working directory
              if (serverProcess) {
                serverProcess.kill();
                setTimeout(() => startServer(), 500);
              }
              
              // Send to renderer
              mainWindow.webContents.send('folder-changed', currentWorkingDirectory);
            }
          }
        },
        { type: 'separator' },
        {
          label: 'New Session',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            mainWindow.webContents.send('new-session');
          }
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { label: 'Select All', accelerator: 'CmdOrCtrl+A', role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { label: 'Toggle Developer Tools', accelerator: 'F12', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus', role: 'zoomIn' },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'about yurucode',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'about yurucode',
              message: 'yurucode',
              detail: 'Minimal Claude Code SDK IDE\nVersion 1.0.0',
              buttons: ['OK']
            });
          }
        }
      ]
    }
  ];

  // macOS specific menu adjustments
  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        { label: 'about yurucode', role: 'about' },
        { type: 'separator' },
        { label: 'Services', role: 'services', submenu: [] },
        { type: 'separator' },
        { label: 'hide yurucode', accelerator: 'Command+H', role: 'hide' },
        { label: 'Hide Others', accelerator: 'Command+Shift+H', role: 'hideothers' },
        { label: 'Show All', role: 'unhide' },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'Command+Q', click: () => app.quit() }
      ]
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Duplicate handlers removed - they are registered at the top of the file

// Handle protocol for opening directories
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('burntcode', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('burntcode');
}

// App lifecycle
app.whenReady().then(async () => {
  await startServer();
  createWindow();
  createMenu();
});

// Allow multiple instances by removing single instance lock
// Each instance will get its own port
const gotTheLock = true; // Always allow new instances

// No longer preventing second instances - each gets its own port

app.on('window-all-closed', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
  
  // On Windows and Linux, quit when all windows are closed
  // On macOS, apps typically stay open even without windows
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('before-quit', () => {
  // Send message to renderer to clear sessions
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('app-before-quit');
  }
  
  if (serverProcess) {
    serverProcess.kill();
  }
});