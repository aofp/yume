# Claude Code Studio - Run Instructions

## Prerequisites
1. Make sure you have your Anthropic API key set:
   ```bash
   export ANTHROPIC_API_KEY="your-api-key-here"
   ```

## Running the Application

### Option 1: Electron App (Recommended - Standalone Desktop App)
This runs as a proper desktop application with folder selection:

```bash
# Start both the server and Electron app
npm run electron:dev
```

This will:
1. Start the Claude Code server on port 3001
2. Start the Vite dev server on port 5173
3. Launch the Electron desktop app

### Option 2: Browser Development
If you prefer to run in browser for development:

```bash
# Terminal 1 - Start the Claude Code server
npm run server

# Terminal 2 - Start the Vite dev server
npm run dev
```

Then open http://localhost:5173 in your browser.

## Features Fixed

✅ **Duplicate Messages** - Fixed with proper message ID tracking
✅ **React Rendering Crash** - Fixed tool_use content rendering
✅ **Streaming Support** - Real-time streaming with visual indicators
✅ **Event Logging** - All SDK events properly logged
✅ **Health Check Spam** - Reduced from 2s to 30s intervals
✅ **Electron Main Process** - Proper Electron app with server integration
✅ **Folder Selection** - Open Folder menu option and UI selector
✅ **Working Directory** - Server respects selected folder

## Using the App

1. **Select a Folder**: Use File > Open Folder (Cmd+O) to choose your project directory
2. **Start a Session**: Click "Start Claude Code Session" 
3. **Ask Claude**: Type your coding request and press Enter
4. **Watch the Magic**: Claude Code will analyze your project and help with coding tasks

## Troubleshooting

If you see "Server Disconnected":
- Make sure the server is running (check Terminal 1)
- Check that ANTHROPIC_API_KEY is set
- Verify port 3001 is not in use

If messages aren't appearing:
- Open Developer Tools (View > Toggle Developer Tools)
- Check the Console for errors
- Ensure the Claude Code SDK is properly installed

## Architecture

- **Electron Main Process** (`src/main/index.js`): Manages the desktop app
- **Node.js Server** (`server.js`): Runs Claude Code SDK 
- **React UI** (`src/renderer/`): User interface
- **WebSocket** (Socket.IO): Real-time communication

The app uses a client-server architecture because Claude Code SDK requires Node.js APIs not available in browsers.