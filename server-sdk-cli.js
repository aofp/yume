/**
 * Express server that runs Claude Code SDK CLI directly
 * Uses the SDK's CLI in non-interactive mode
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
        createdAt: Date.now(),
        claudeSessionId: null
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

  // Send a message to Claude Code SDK CLI
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
      
      // Path to SDK CLI
      const cliPath = path.join(__dirname, 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js');
      
      // Build arguments
      const args = [
        cliPath,
        '--print',  // Non-interactive mode
        '--output-format', 'stream-json',  // Stream JSON output
        content  // The prompt
      ];
      
      // Add session resume if we have one
      if (session.claudeSessionId) {
        args.push('--resume', session.claudeSessionId);
      }
      
      // Spawn node process to run the SDK CLI
      console.log(`🚀 Running SDK CLI with args:`, args.join(' '));
      const claudeProcess = spawn('/usr/bin/node', args, {
        cwd: workingDir,
        env: {
          ...process.env,
          HOME: process.env.HOME || os.homedir(),
          // Add API key if available
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || ''
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      activeProcesses.set(sessionId, claudeProcess);
      
      // Handle streaming JSON output
      let buffer = '';
      let assistantMessageId = null;
      let assistantContent = '';
      
      claudeProcess.stdout.on('data', (data) => {
        buffer += data.toString();
        
        // Try to parse JSON lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer
        
        for (const line of lines) {
          if (!line.trim()) continue;
          
          try {
            const message = JSON.parse(line);
            console.log(`📦 Message type: ${message.type}`);
            
            // Extract session ID if present
            if (message.session_id && !session.claudeSessionId) {
              session.claudeSessionId = message.session_id;
              console.log(`📌 Got Claude session ID: ${session.claudeSessionId}`);
            }
            
            // Handle different message types
            if (message.type === 'assistant') {
              if (!assistantMessageId) {
                assistantMessageId = `assistant-${sessionId}-${Date.now()}`;
              }
              
              // Extract text content
              if (message.message?.content) {
                if (Array.isArray(message.message.content)) {
                  for (const block of message.message.content) {
                    if (block.type === 'text') {
                      assistantContent = block.text;
                    }
                  }
                } else {
                  assistantContent = message.message.content;
                }
              } else if (message.content) {
                assistantContent = message.content;
              }
              
              // Stream the assistant message
              socket.emit(`message:${sessionId}`, {
                type: 'assistant',
                message: { content: assistantContent },
                streaming: true,
                id: assistantMessageId
              });
              
            } else if (message.type === 'tool_use') {
              socket.emit(`message:${sessionId}`, {
                type: 'tool_use',
                message: message.message || message,
                timestamp: Date.now(),
                id: `tool-${sessionId}-${Date.now()}`
              });
              
            } else if (message.type === 'tool_result') {
              socket.emit(`message:${sessionId}`, {
                type: 'tool_result',
                message: message.message || message,
                timestamp: Date.now(),
                id: `result-${sessionId}-${Date.now()}`
              });
              
            } else if (message.type === 'result') {
              // Finalize assistant message
              if (assistantMessageId && assistantContent) {
                socket.emit(`message:${sessionId}`, {
                  type: 'assistant',
                  message: { content: assistantContent },
                  streaming: false,
                  id: assistantMessageId
                });
                session.messages.push({
                  type: 'assistant',
                  message: { content: assistantContent },
                  id: assistantMessageId
                });
              }
              
              // Send result
              socket.emit(`message:${sessionId}`, {
                type: 'result',
                ...message,
                streaming: false,
                id: `result-${sessionId}-${Date.now()}`
              });
              
            } else if (message.type === 'system' && message.subtype !== 'init') {
              // Forward other system messages
              socket.emit(`message:${sessionId}`, message);
            }
            
          } catch (e) {
            // Not valid JSON, might be plain text output
            console.log('Non-JSON output:', line);
          }
        }
      });
      
      claudeProcess.stderr.on('data', (data) => {
        const error = data.toString();
        console.error('Claude stderr:', error);
        
        // Check for specific errors
        if (error.includes('Invalid API key') || error.includes('/login')) {
          socket.emit(`message:${sessionId}`, {
            type: 'system',
            subtype: 'error',
            message: 'Authentication required. Please set ANTHROPIC_API_KEY in .env file',
            timestamp: Date.now()
          });
        } else {
          socket.emit(`message:${sessionId}`, {
            type: 'system',
            subtype: 'error',
            message: error,
            timestamp: Date.now()
          });
        }
      });
      
      claudeProcess.on('close', (code) => {
        console.log(`Claude process exited with code ${code}`);
        
        // Make sure we send final assistant message if we have content
        if (assistantMessageId && assistantContent && code === 0) {
          socket.emit(`message:${sessionId}`, {
            type: 'assistant',
            message: { content: assistantContent },
            streaming: false,
            id: assistantMessageId
          });
          session.messages.push({
            type: 'assistant',
            message: { content: assistantContent },
            id: assistantMessageId
          });
        }
        
        activeProcesses.delete(sessionId);
      });
      
      claudeProcess.on('error', (error) => {
        console.error('Failed to spawn SDK CLI:', error);
        socket.emit(`message:${sessionId}`, {
          type: 'system',
          subtype: 'error',
          message: `Failed to run SDK CLI: ${error.message}`,
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
  
  // Handle other socket events
  socket.on('listSessions', async (callback) => {
    callback({ success: true, sessions: [] });
  });
  
  socket.on('deleteSession', async (data, callback) => {
    const { sessionId } = data;
    sessions.delete(sessionId);
    callback({ success: true });
  });
  
  socket.on('setWorkingDirectory', async (data, callback) => {
    const { sessionId, directory } = data;
    const session = sessions.get(sessionId);
    if (session) {
      session.workingDirectory = directory;
      callback({ success: true });
    } else {
      callback({ success: false, error: 'Session not found' });
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Load dotenv for API key
require('dotenv').config();

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Claude Code SDK CLI Server running on http://0.0.0.0:${PORT}`);
  console.log(`📝 Using SDK CLI in non-interactive mode`);
  
  if (process.env.ANTHROPIC_API_KEY) {
    console.log(`🔑 API key found: ${process.env.ANTHROPIC_API_KEY.substring(0, 10)}...`);
  } else {
    console.log(`⚠️  No ANTHROPIC_API_KEY in environment`);
    console.log(`📝 Add to .env file: ANTHROPIC_API_KEY=sk-ant-...`);
  }
  
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