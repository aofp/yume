const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

const isDev = process.env.NODE_ENV === 'development';

let mainWindow = null;
let serverProcess = null;
let currentWorkingDirectory = process.cwd();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#000000',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    icon: path.join(__dirname, '../../assets/icon.png'),
  });

  if (isDev || process.env.ELECTRON_DEV) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle window controls
  mainWindow.on('enter-full-screen', () => {
    mainWindow?.webContents.send('fullscreen-status', true);
  });

  mainWindow.on('leave-full-screen', () => {
    mainWindow?.webContents.send('fullscreen-status', false);
  });
}

// Start the Claude Code server
function startServer() {
  const serverPath = path.join(__dirname, '../../server.js');
  
  serverProcess = spawn('node', [serverPath], {
    env: { 
      ...process.env,
      CLAUDE_CODE_CWD: currentWorkingDirectory
    },
    stdio: ['pipe', 'pipe', 'pipe', 'ipc']
  });

  serverProcess.stdout.on('data', (data) => {
    console.log(`Server: ${data}`);
  });

  serverProcess.stderr.on('data', (data) => {
    console.error(`Server Error: ${data}`);
  });

  serverProcess.on('close', (code) => {
    console.log(`Server process exited with code ${code}`);
    serverProcess = null;
  });
}

// App event handlers
app.whenReady().then(async () => {
  // Start the server first
  startServer();
  
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});

// IPC handlers for folder selection
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    currentWorkingDirectory = result.filePaths[0];
    
    // Restart server with new working directory
    if (serverProcess) {
      serverProcess.kill();
      setTimeout(() => startServer(), 500);
    }
    
    // Send to renderer
    mainWindow.webContents.send('folder-changed', currentWorkingDirectory);
    return currentWorkingDirectory;
  }
  
  return null;
});

ipcMain.handle('get-working-directory', () => {
  return currentWorkingDirectory;
});

ipcMain.handle('claude:session:create', async (event, options) => {
  try {
    // Create new session
    return { success: true, sessionId: 'new-session-id' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('claude:session:resume', async (event, sessionId) => {
  try {
    // Resume session
    return { success: true, session: {} };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('claude:session:list', async () => {
  try {
    // List all sessions
    return { success: true, sessions: [] };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Settings management
ipcMain.handle('settings:get', async (event, key) => {
  try {
    // Get settings from store
    return { success: true, value: null };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('settings:set', async (event, key, value) => {
  try {
    // Set settings in store
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// File operations
ipcMain.handle('file:read', async (event, filepath) => {
  try {
    // Read file
    return { success: true, content: '' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('file:write', async (event, filepath, content) => {
  try {
    // Write file
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Tool permission handlers
ipcMain.handle('permission:request', async (event, tool, params) => {
  try {
    // Show permission dialog
    return { success: true, granted: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Create application menu
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
      { role: 'quit' }
    ]
  },
  {
    label: 'Claude Code Studio',
    submenu: [
      { role: 'about' },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' }
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
      { role: 'close' }
    ]
  }
];

const menu = Menu.buildFromTemplate(template);
Menu.setApplicationMenu(menu);