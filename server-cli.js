/**
 * Express server that runs Claude CLI directly
 * NO SDK, just direct CLI calls
 */

const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

let sessions = new Map();
let activeProcesses = new Map();

// Session storage directory
const SESSION_DIR = path.join(os.homedir(), '.yurucode', 'sessions');

// Socket.IO connection handler
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Create session
  socket.on('createSession', async (data, callback) => {
    try {
      const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      console.log(`✨ Creating new session: ${sessionId}`);
      
      const workingDirectory = data.workingDirectory || process.cwd();
      
      const sessionData = {
        id: sessionId,
        name: data.name || 'new session',
        socketId: socket.id,
        workingDirectory: workingDirectory,
        messages: [],
        createdAt: Date.now()
      };
      
      sessions.set(sessionId, sessionData);
      
      console.log(`✅ Session ready: ${sessionId}`);
      console.log(`📁 Working directory: ${workingDirectory}`);
      
      callback({ 
        success: true, 
        sessionId,
        messages: [],
        workingDirectory
      });
      
    } catch (error) {
      console.error('Error creating session:', error);
      callback({ success: false, error: error.message });
    }
  });

  // Send a message to Claude CLI
  socket.on('sendMessage', async (data, callback) => {
    try {
      const { sessionId, content } = data;
      const session = sessions.get(sessionId);
      
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      console.log(`📝 Message for session ${sessionId}: ${content.substring(0, 50)}...`);
      
      // Add user message
      const userMessage = {
        id: `user-${Date.now()}`,
        type: 'user',
        message: { content },
        timestamp: Date.now()
      };
      session.messages.push(userMessage);
      
      // Convert Windows path to WSL path if needed
      let workingDir = session.workingDirectory;
      if (process.platform === 'linux' && workingDir.match(/^[A-Z]:\\/)) {
        const driveLetter = workingDir[0].toLowerCase();
        const pathWithoutDrive = workingDir.substring(2).replace(/\\/g, '/');
        workingDir = `/mnt/${driveLetter}${pathWithoutDrive}`;
      }
      
      // Spawn claude CLI process
      console.log(`🚀 Spawning claude CLI...`);
      const claudeProcess = spawn('claude', [], {
        cwd: workingDir,
        env: {
          ...process.env,
          HOME: process.env.HOME || os.homedir()
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      activeProcesses.set(sessionId, claudeProcess);
      
      // Send the user's message to claude
      claudeProcess.stdin.write(content + '\n');
      
      // Collect response
      let responseBuffer = '';
      let errorBuffer = '';
      
      claudeProcess.stdout.on('data', (data) => {
        const chunk = data.toString();
        responseBuffer += chunk;
        
        // Stream the response
        socket.emit(`message:${sessionId}`, {
          type: 'assistant',
          message: { content: responseBuffer },
          streaming: true,
          id: `assistant-${sessionId}-${Date.now()}`
        });
      });
      
      claudeProcess.stderr.on('data', (data) => {
        errorBuffer += data.toString();
        console.error('Claude stderr:', errorBuffer);
      });
      
      claudeProcess.on('close', (code) => {
        console.log(`Claude process exited with code ${code}`);
        
        // Send final message
        if (responseBuffer) {
          const assistantMessage = {
            type: 'assistant',
            message: { content: responseBuffer },
            streaming: false,
            id: `assistant-${sessionId}-${Date.now()}`
          };
          socket.emit(`message:${sessionId}`, assistantMessage);
          session.messages.push(assistantMessage);
        }
        
        if (errorBuffer) {
          socket.emit(`message:${sessionId}`, {
            type: 'system',
            subtype: 'error',
            message: errorBuffer,
            timestamp: Date.now()
          });
        }
        
        // Send result message
        socket.emit(`message:${sessionId}`, {
          type: 'result',
          id: `${sessionId}-result-${Date.now()}`,
          sessionId,
          streaming: false,
          timestamp: Date.now()
        });
        
        activeProcesses.delete(sessionId);
      });
      
      claudeProcess.on('error', (error) => {
        console.error('Failed to spawn claude:', error);
        socket.emit(`message:${sessionId}`, {
          type: 'system',
          subtype: 'error',
          message: `Failed to run claude: ${error.message}`,
          timestamp: Date.now()
        });
        activeProcesses.delete(sessionId);
      });
      
      callback({ success: true });
      
    } catch (error) {
      console.error('Error in sendMessage:', error);
      callback({ success: false, error: error.message });
    }
  });

  // Handle interrupt
  socket.on('interrupt', (data, callback) => {
    const sessionId = data?.sessionId || data;
    console.log(`⛔ Interrupt requested for session ${sessionId}`);
    
    const process = activeProcesses.get(sessionId);
    if (process) {
      process.kill('SIGINT');
      activeProcesses.delete(sessionId);
      
      socket.emit(`message:${sessionId}`, {
        type: 'system',
        subtype: 'interrupted',
        message: 'task interrupted by user',
        timestamp: Date.now()
      });
      
      if (callback) callback({ success: true });
    } else {
      if (callback) callback({ success: false, error: 'No active process' });
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Claude CLI Server running on http://0.0.0.0:${PORT}`);
  console.log(`🔑 Using claude CLI directly - no SDK, no API key needed`);
  console.log(`📝 Make sure you're logged in with: claude login`);
  
  if (process.send) {
    process.send({ type: 'server-ready', port: PORT });
  }
});

// Cleanup on exit
async function cleanup() {
  console.log('🛑 Server shutting down...');
  
  // Kill all active processes
  for (const [sessionId, process] of activeProcesses) {
    console.log(`Stopping process for session ${sessionId}`);
    process.kill('SIGTERM');
  }
  activeProcesses.clear();
  sessions.clear();
  
  console.log('✅ Cleanup complete');
  process.exit(0);
}

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);
process.on('beforeExit', cleanup);