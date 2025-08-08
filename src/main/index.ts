import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV === 'development';

let mainWindow: BrowserWindow | null = null;

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

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
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

// App event handlers
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC handlers for SDK communication
ipcMain.handle('claude:query', async (event, prompt, options) => {
  try {
    // SDK integration will go here
    return { success: true, data: 'Response from Claude SDK' };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('claude:session:create', async (event, options) => {
  try {
    // Create new session
    return { success: true, sessionId: 'new-session-id' };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('claude:session:resume', async (event, sessionId) => {
  try {
    // Resume session
    return { success: true, session: {} };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('claude:session:list', async () => {
  try {
    // List all sessions
    return { success: true, sessions: [] };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

// Settings management
ipcMain.handle('settings:get', async (event, key) => {
  try {
    // Get settings from store
    return { success: true, value: null };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('settings:set', async (event, key, value) => {
  try {
    // Set settings in store
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

// File operations
ipcMain.handle('file:read', async (event, filepath) => {
  try {
    // Read file
    return { success: true, content: '' };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('file:write', async (event, filepath, content) => {
  try {
    // Write file
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

// Tool permission handlers
ipcMain.handle('permission:request', async (event, tool, params) => {
  try {
    // Show permission dialog
    return { success: true, granted: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

// Create application menu
const template: Electron.MenuItemConstructorOptions[] = [
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