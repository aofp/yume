/**
 * Express server that runs claude CLI directly like code_service.js
 * NO SDK, NO API KEY - just direct claude CLI calls with streaming
 */

const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { spawn } = require('child_process');
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
  res.json({ status: 'ok', service: 'yurucode-claude' });
});

let sessions = new Map();
let activeProcesses = new Map();  // Map of sessionId -> process
let sessionIdCounter = 0;

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

  // Send a message to Claude CLI directly
  socket.on('sendMessage', async (data, callback) => {
    try {
      const { sessionId, content, model } = data;
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
      
      // Path to claude CLI - check common locations
      const homedir = os.homedir();
      const claudePaths = [
        path.join(homedir, '.claude', 'local', 'claude'),
        path.join(homedir, '.local', 'bin', 'claude'),
        'claude'  // Try PATH as last resort
      ];
      
      let claudePath = null;
      const fs = require('fs');
      for (const cpath of claudePaths) {
        if (fs.existsSync(cpath)) {
          claudePath = cpath;
          console.log(`🔧 Found claude at: ${cpath}`);
          break;
        }
      }
      
      if (!claudePath) {
        throw new Error('Claude CLI not found. Please ensure claude is installed and in PATH');
      }
      
      // Build arguments - same as code_service.js
      const args = ['--print', '--output-format', 'stream-json', '--verbose'];
      
      // Add model selection if provided
      if (model) {
        args.push('--model', model);
        console.log(`🤖 Using model: ${model}`);
      }
      
      // Add session resume if we have one for follow-up messages
      if (session.claudeSessionId) {
        args.push('--resume', session.claudeSessionId);
        console.log(`📌 Resuming Claude session: ${session.claudeSessionId}`);
      } else {
        console.log(`🆕 Starting new Claude session`);
      }
      
      // Add the prompt
      args.push(content);
      
      console.log(`🚀 Running claude with args:`, args.join(' '));
      
      // Spawn claude process
      const child = spawn(claudePath, args, {
        cwd: workingDir,
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      // Store the process for this session so we can interrupt it
      activeProcesses.set(sessionId, child);
      
      // Process streaming output
      let lineBuffer = '';
      
      const processStreamLine = (line) => {
        if (!line.trim()) return;
        
        // Try to parse as JSON
        try {
          const jsonData = JSON.parse(line);
          console.log(`📦 Message type: ${jsonData.type}${jsonData.subtype ? ` (${jsonData.subtype})` : ''}`);
          
          // Log more details based on message type
          if (jsonData.type === 'assistant' && jsonData.message?.content) {
            for (const block of jsonData.message.content) {
              if (block.type === 'text') {
                console.log(`   💬 Assistant text: "${block.text.substring(0, 100)}${block.text.length > 100 ? '...' : ''}"`);
              } else if (block.type === 'tool_use') {
                console.log(`   🔧 Tool use: ${block.name} (id: ${block.id})`);
              }
            }
          } else if (jsonData.type === 'user' && jsonData.message?.content) {
            for (const block of jsonData.message.content) {
              if (block.type === 'tool_result') {
                const preview = typeof block.content === 'string' 
                  ? block.content.substring(0, 50) 
                  : JSON.stringify(block.content).substring(0, 50);
                console.log(`   📊 Tool result for ${block.tool_use_id}: ${preview}...`);
              }
            }
          } else if (jsonData.type === 'result') {
            console.log(`   ✅ Result: success=${!jsonData.is_error}, duration=${jsonData.duration_ms}ms`);
          }
          
          // Extract session ID if present (update it every time to ensure we have the latest)
          if (jsonData.session_id) {
            session.claudeSessionId = jsonData.session_id;
            console.log(`📌 Claude session ID: ${session.claudeSessionId}`);
          }
          
          // Handle different message types
          if (jsonData.type === 'system' && jsonData.subtype === 'init') {
            // Send system init message
            socket.emit(`message:${sessionId}`, {
              type: 'system',
              subtype: 'init',
              message: jsonData,
              timestamp: Date.now()
            });
            
          } else if (jsonData.type === 'assistant') {
            // Each assistant message should be separate to preserve all content
            const messageId = `assistant-${sessionId}-${Date.now()}-${Math.random()}`;
            
            // Extract content from assistant message
            if (jsonData.message?.content) {
              let hasText = false;
              let textContent = '';
              
              // First check what content we have
              for (const block of jsonData.message.content) {
                if (block.type === 'text') {
                  hasText = true;
                  textContent = block.text;
                } else if (block.type === 'tool_use') {
                  // Send tool use as separate message immediately
                  socket.emit(`message:${sessionId}`, {
                    type: 'tool_use',
                    message: {
                      name: block.name,
                      input: block.input,
                      id: block.id
                    },
                    timestamp: Date.now(),
                    id: `tool-${sessionId}-${Date.now()}`
                  });
                }
              }
              
              // Send text content as separate assistant message
              if (hasText && textContent) {
                socket.emit(`message:${sessionId}`, {
                  type: 'assistant',
                  message: { content: textContent },
                  streaming: false,  // Don't stream, send complete messages
                  id: messageId,
                  timestamp: Date.now()
                });
                
                // Save to session
                session.messages.push({
                  type: 'assistant',
                  message: { content: textContent },
                  id: messageId,
                  timestamp: Date.now()
                });
              }
            }
            
          } else if (jsonData.type === 'user' && jsonData.message?.content) {
            // Handle tool results from user messages
            for (const block of jsonData.message.content) {
              if (block.type === 'tool_result') {
                socket.emit(`message:${sessionId}`, {
                  type: 'tool_result',
                  message: {
                    tool_use_id: block.tool_use_id,
                    content: block.content,
                    is_error: block.is_error
                  },
                  timestamp: Date.now(),
                  id: `toolresult-${sessionId}-${Date.now()}`
                });
              }
            }
            
          } else if (jsonData.type === 'result') {
            // Just send the result message
            socket.emit(`message:${sessionId}`, {
              type: 'result',
              ...jsonData,
              streaming: false,
              id: `result-${sessionId}-${Date.now()}`
            });
          }
          
        } catch (e) {
          // Not JSON, treat as plain text
          console.log('Plain text output:', line);
        }
      };
      
      child.stdout.on('data', (data) => {
        lineBuffer += data.toString();
        
        // Process complete lines
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() || '';
        
        for (const line of lines) {
          processStreamLine(line);
        }
      });
      
      child.stderr.on('data', (data) => {
        const error = data.toString();
        console.error('Claude stderr:', error);
        socket.emit(`message:${sessionId}`, {
          type: 'system',
          subtype: 'error',
          message: error,
          timestamp: Date.now()
        });
      });
      
      // Close stdin immediately
      child.stdin.end();
      
      child.on('close', (code) => {
        console.log(`Claude process exited with code ${code}`);
        
        // Process any remaining buffer
        if (lineBuffer.trim()) {
          processStreamLine(lineBuffer);
        }
        
        activeProcesses.delete(sessionId);
      });
      
      child.on('error', (error) => {
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
    
    // Get the specific process for this session
    const process = activeProcesses.get(sessionId);
    if (process) {
      console.log(`🛑 Killing claude process for session ${sessionId}`);
      process.kill('SIGINT');  // Use SIGINT for graceful interrupt
      activeProcesses.delete(sessionId);
      
      socket.emit(`message:${sessionId}`, {
        type: 'system',
        subtype: 'interrupted',
        message: 'task interrupted by user',
        timestamp: Date.now()
      });
      
      // Send result message to clear streaming state
      socket.emit(`message:${sessionId}`, {
        type: 'result',
        id: `${sessionId}-interrupted-${Date.now()}`,
        sessionId,
        streaming: false,
        interrupted: true,
        timestamp: Date.now()
      });
      
      if (callback) callback({ success: true, interrupted: true });
    } else {
      console.log(`⚠️ No active process found for session ${sessionId}`);
      if (callback) callback({ success: false, error: 'No active process for this session' });
    }
  });
  
  // Handle clear session
  socket.on('clearSession', async (data, callback) => {
    const { sessionId } = data;
    const session = sessions.get(sessionId);
    
    if (session) {
      console.log(`🧹 Clearing session ${sessionId}`);
      
      // Kill any active process
      const activeProcess = activeProcesses.get(sessionId);
      if (activeProcess) {
        console.log(`🛑 Killing active process for session ${sessionId}`);
        activeProcess.kill('SIGINT');
        activeProcesses.delete(sessionId);
      }
      
      // Clear the session data but keep the session alive
      session.messages = [];
      session.claudeSessionId = null;  // Reset Claude session ID so next message starts fresh
      
      console.log(`✅ Session ${sessionId} cleared - will start fresh Claude session on next message`);
      
      // Send clear confirmation
      socket.emit(`message:${sessionId}`, {
        type: 'system',
        subtype: 'clear',
        message: 'session cleared',
        timestamp: Date.now()
      });
      
      callback({ success: true, cleared: true });
    } else {
      callback({ success: false, error: 'Session not found' });
    }
  });
  
  // Handle other socket events
  socket.on('listSessions', async (callback) => {
    const sessionList = Array.from(sessions.values()).map(s => ({
      id: s.id,
      name: s.name,
      workingDirectory: s.workingDirectory,
      createdAt: s.createdAt,
      messageCount: s.messages.length
    }));
    callback({ success: true, sessions: sessionList });
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
      console.log(`📁 Updated directory for ${sessionId}: ${directory}`);
      callback({ success: true });
    } else {
      callback({ success: false, error: 'Session not found' });
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Claude Direct Server running on http://0.0.0.0:${PORT}`);
  console.log(`🔑 Using claude CLI directly - NO SDK, NO API KEY`);
  console.log(`📝 Running in ${process.platform === 'linux' ? 'WSL' : 'Windows'}`);
  
  if (process.send) {
    process.send({ type: 'server-ready', port: PORT });
  }
});

// Cleanup on exit
async function cleanup() {
  console.log('🛑 Server shutting down...');
  
  // Kill all active processes
  for (const [id, process] of activeProcesses) {
    console.log(`Stopping process ${id}`);
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