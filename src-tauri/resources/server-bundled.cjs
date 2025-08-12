// Server for bundled Tauri app
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

// Set up module paths for bundled dependencies
const resourceDir = path.dirname(__filename);
const nodeModulesPath = path.join(resourceDir, 'node_modules');
require('module').globalPaths.push(nodeModulesPath);

// Now require dependencies
const express = require('express');
const { Server } = require('socket.io');
const cors = require('cors');

// Create Express app
const app = express();
app.use(cors());
app.use(express.json());

// In production, serve the built frontend from the Tauri webview
// The frontend is loaded directly by Tauri, we just need the API

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'yurucode-claude' });
});

// Create HTTP server
const httpServer = http.createServer(app);

// Create Socket.IO server
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling'],
  maxHttpBufferSize: 1e8
});

// Store active Claude processes
const activeProcesses = new Map();
const sessions = new Map();
const lastAssistantMessageIds = new Map();

console.log('🚀 yurucode bundled server starting...');
console.log('📁 Resource directory:', resourceDir);
console.log('📦 Node modules path:', nodeModulesPath);

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('✅ Client connected:', socket.id);

  socket.on('sendMessage', async (data) => {
    const { message, sessionId, workingDirectory, resumeSession } = data;
    console.log(`[Session ${sessionId}] Message received:`, message?.substring(0, 100));

    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, {
        id: sessionId,
        workingDirectory: workingDirectory || process.cwd(),
        created: new Date(),
        messageCount: 0
      });
    }

    const session = sessions.get(sessionId);
    session.messageCount++;

    // Kill existing process if any
    if (activeProcesses.has(sessionId)) {
      const oldProcess = activeProcesses.get(sessionId);
      oldProcess.kill('SIGTERM');
      activeProcesses.delete(sessionId);
    }

    // Clear last assistant message ID when starting new conversation
    if (!resumeSession) {
      lastAssistantMessageIds.delete(sessionId);
    }

    // Spawn Claude CLI
    const args = ['--output-format', 'stream-json'];
    if (resumeSession) {
      args.push('--resume');
    }

    try {
      const claudeProcess = spawn('claude', args, {
        cwd: session.workingDirectory,
        env: { ...process.env },
        shell: process.platform === 'win32'
      });

      activeProcesses.set(sessionId, claudeProcess);

      // Handle stdout
      claudeProcess.stdout.on('data', (data) => {
        const lines = data.toString().split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          try {
            const json = JSON.parse(line);
            
            // Track assistant message IDs to detect streaming
            if (json.type === 'message' && json.role === 'assistant') {
              const lastId = lastAssistantMessageIds.get(sessionId);
              
              if (lastId && lastId === json.id) {
                json.streaming = true;
              }
              
              lastAssistantMessageIds.set(sessionId, json.id);
            }
            
            socket.emit('claudeResponse', json);
          } catch (e) {
            // Not JSON, might be raw output
            if (line.trim()) {
              console.log('[Claude Raw]:', line);
            }
          }
        }
      });

      // Handle stderr
      claudeProcess.stderr.on('data', (data) => {
        console.error('[Claude Error]:', data.toString());
        socket.emit('claudeError', { error: data.toString() });
      });

      // Handle process exit
      claudeProcess.on('close', (code) => {
        console.log(`[Session ${sessionId}] Process exited with code ${code}`);
        activeProcesses.delete(sessionId);
        socket.emit('claudeComplete', { code });
      });

      // Handle spawn error
      claudeProcess.on('error', (err) => {
        console.error('[Claude Spawn Error]:', err);
        socket.emit('claudeError', { 
          error: `Failed to start Claude CLI: ${err.message}. Make sure Claude CLI is installed and in PATH.` 
        });
        activeProcesses.delete(sessionId);
      });

      // Send the user message via stdin
      claudeProcess.stdin.write(message + '\n');
      claudeProcess.stdin.end();
      
    } catch (err) {
      console.error('[Spawn Error]:', err);
      socket.emit('claudeError', { 
        error: `Failed to spawn Claude: ${err.message}` 
      });
    }
  });

  socket.on('interruptSession', (sessionId) => {
    console.log(`[Session ${sessionId}] Interrupt requested`);
    
    if (activeProcesses.has(sessionId)) {
      const process = activeProcesses.get(sessionId);
      process.kill('SIGINT');
      activeProcesses.delete(sessionId);
      socket.emit('claudeResponse', {
        type: 'message',
        role: 'system',
        content: 'Task interrupted by user.',
        interrupted: true
      });
    }
  });

  socket.on('clearSession', (sessionId) => {
    console.log(`[Session ${sessionId}] Clear requested`);
    
    if (activeProcesses.has(sessionId)) {
      const process = activeProcesses.get(sessionId);
      process.kill('SIGTERM');
      activeProcesses.delete(sessionId);
    }
    
    sessions.delete(sessionId);
    lastAssistantMessageIds.delete(sessionId);
  });

  socket.on('disconnect', () => {
    console.log('❌ Client disconnected:', socket.id);
  });
});

// Start server
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log('✅ ===== BUNDLED SERVER STARTED =====');
  console.log(`🚀 yurucode server running on port ${PORT}`);
  console.log(`🔑 Using Claude CLI directly - no API key needed`);
  console.log('📦 Running from Tauri bundle');
  console.log('=====================================');
});

// Cleanup on exit
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down...');
  for (const [id, proc] of activeProcesses) {
    proc.kill('SIGTERM');
  }
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down...');
  for (const [id, proc] of activeProcesses) {
    proc.kill('SIGTERM');
  }
  process.exit(0);
});