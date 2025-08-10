# production build debugging guide

## fixes applied

### 1. enhanced server logging
- added detailed startup logging to `server-claude-direct.js`
- logs platform, node version, working directory, port binding
- shows clear success/error messages for server startup
- tracks all client connections and disconnections

### 2. improved electron main process
- added multiple path checks for finding server file in production
- uses `ELECTRON_RUN_AS_NODE=1` to run server as pure node.js
- added server startup verification with 10-second timeout
- auto-restart on crash in production mode
- extensive logging of server process lifecycle

### 3. client connection improvements  
- added retry logic with exponential backoff
- health check before websocket connection
- extended reconnection attempts (20 tries)
- supports both websocket and polling transports
- detailed connection error logging

### 4. module loading fix
- added fallback module resolution for production
- handles different node_modules locations
- compatible with electron's packaged structure

## building for windows

1. **from windows cmd/powershell:**
   ```batch
   build-win.bat
   ```

2. **test the production build:**
   ```batch
   test-production.bat
   ```

## what to look for in logs

### successful startup sequence:
1. `===== ELECTRON SERVER STARTUP =====`
2. `✅ FOUND at: <path to server file>`
3. `===== SERVER STARTUP LOGGING =====`
4. `✅ ===== SERVER SUCCESSFULLY STARTED =====`
5. `🚀 Claude Direct Server running on http://0.0.0.0:3001`
6. `✨ ===== NEW CLIENT CONNECTION =====`

### common issues and solutions

#### issue: server file not found
**error:** `❌ Could not find server-claude-direct.js`
**solution:** check that `server-claude-direct.js` exists in the app directory

#### issue: port already in use
**error:** `EADDRINUSE`
**solution:** kill process on port 3001:
```batch
netstat -ano | findstr :3001
taskkill /F /PID <pid>
```

#### issue: module not found
**error:** `MODULE_NOT_FOUND`
**solution:** ensure all dependencies are in `node_modules` and not using `asar`

#### issue: wsl/claude cli not found
**error:** `Claude CLI not found in WSL`
**solution:** ensure wsl is installed and claude cli is installed in wsl:
```bash
wsl
curl -L https://raw.githubusercontent.com/anthropics/claude-cli/main/install.sh | sh
```

#### issue: websocket connection failed
**error:** `xhr poll error`
**solution:** check windows firewall isn't blocking localhost:3001

## debugging tips

1. **enable electron logging:**
   ```batch
   set ELECTRON_ENABLE_LOGGING=1
   yurucode.exe
   ```

2. **check developer tools:**
   - press `F12` in the app
   - check console for client-side errors
   - look for websocket connection attempts

3. **verify server is running:**
   - open browser to `http://localhost:3001/health`
   - should return `{"status":"ok","service":"yurucode-claude"}`

4. **test claude cli directly:**
   ```batch
   wsl claude --version
   ```

## production file structure

after build, the app structure should be:
```
release/
└── win-unpacked/
    ├── yurucode.exe
    ├── server-claude-direct.js
    ├── electron/
    │   ├── main.js
    │   └── preload-simple.js
    ├── dist/
    │   └── renderer/
    │       └── index.html
    └── node_modules/
        ├── express/
        ├── socket.io/
        └── ...
```

## still not working?

1. run `test-production.bat` and capture all console output
2. check windows event viewer for crash reports
3. ensure antivirus isn't blocking the app
4. try running as administrator
5. verify node.js is installed on system (for debugging)