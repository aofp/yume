/**
 * Multi-instance version of Claude server with dynamic port allocation
 */

const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const portfinder = require('portfinder');

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
  res.json({ status: 'ok', service: 'yurucode-claude', port: actualPort });
});

let sessions = new Map();
let activeProcesses = new Map();
let lastAssistantMessageIds = new Map();
let sessionIdCounter = 0;
let actualPort = null;

// Socket.IO connection handler (same as original)
io.on('connection', (socket) => {
  console.log('✨ ===== NEW CLIENT CONNECTION =====');
  console.log('Client ID:', socket.id);
  console.log('Port:', actualPort);
  console.log('===================================');

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
      
      // Path to claude CLI
      let claudePath = null;
      
      if (process.platform === 'win32') {
        claudePath = 'claude';
        console.log('🪟 Windows detected - will use WSL to run claude');
      } else {
        const homedir = os.homedir();
        const claudePaths = [
          path.join(homedir, '.claude', 'local', 'claude'),
          path.join(homedir, '.local', 'bin', 'claude'),
          'claude'
        ];
        
        for (const cpath of claudePaths) {
          if (fs.existsSync(cpath)) {
            claudePath = cpath;
            console.log(`🔧 Found claude at: ${cpath}`);
            break;
          }
        }
        
        if (!claudePath) {
          socket.emit(`message:${sessionId}`, {
            type: 'system',
            subtype: 'error',
            message: 'Claude CLI not found. Please ensure claude is installed.',
            timestamp: Date.now()
          });
          callback({ success: false, error: 'Claude CLI not found' });
          return;
        }
      }
      
      // Build arguments
      const args = ['--print', '--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions'];
      
      if (model) {
        args.push('--model', model);
        console.log(`🤖 Using model: ${model}`);
      }
      
      if (session.claudeSessionId) {
        args.push('--resume', session.claudeSessionId);
        console.log(`📌 Resuming Claude session: ${session.claudeSessionId}`);
      } else {
        console.log(`🆕 Starting new Claude session`);
      }
      
      console.log(`🚀 Running claude with args:`, args.join(' '));
      
      // Spawn claude process
      let child;
      try {
        if (process.platform === 'win32') {
          const wslArgs = ['-e', 'bash', '-c', 
            `if command -v claude &> /dev/null; then claude ${args.join(' ')}; elif [ -x ~/.claude/local/claude ]; then ~/.claude/local/claude ${args.join(' ')}; elif [ -x ~/.local/bin/claude ]; then ~/.local/bin/claude ${args.join(' ')}; else echo "Claude CLI not found in WSL" >&2 && exit 127; fi`
          ];
          
          child = spawn('wsl.exe', wslArgs, {
            cwd: session.workingDirectory,
            env: process.env,
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: false,
            windowsHide: true
          });
        } else {
          child = spawn(claudePath, args, {
            cwd: workingDir,
            env: process.env,
            stdio: ['pipe', 'pipe', 'pipe']
          });
        }
      } catch (spawnError) {
        console.error('Failed to spawn claude process:', spawnError);
        socket.emit(`message:${sessionId}`, {
          type: 'system',
          subtype: 'error',
          message: `Failed to start Claude: ${spawnError.message}`,
          timestamp: Date.now()
        });
        callback({ success: false, error: `Failed to spawn: ${spawnError.message}` });
        return;
      }
      
      activeProcesses.set(sessionId, child);
      
      socket.emit(`message:${sessionId}`, {
        type: 'system',
        subtype: 'info',
        message: `Starting Claude${process.platform === 'win32' ? ' via WSL' : ''}...`,
        timestamp: Date.now()
      });
      
      console.log(`Process spawned with PID: ${child.pid}`);
      
      // Process streaming output
      let lineBuffer = '';
      
      const processStreamLine = (line) => {
        if (!line.trim()) return;
        
        try {
          const jsonData = JSON.parse(line);
          console.log(`📦 Message type: ${jsonData.type}${jsonData.subtype ? ` (${jsonData.subtype})` : ''}`);
          
          if (jsonData.session_id) {
            // Only update session ID if we don't have one or if it's different
            if (!session.claudeSessionId || session.claudeSessionId !== jsonData.session_id) {
              console.log(`📌 Updating Claude session ID from ${session.claudeSessionId || 'null'} to ${jsonData.session_id}`);
              session.claudeSessionId = jsonData.session_id;
            }
          }
          
          // Handle different message types (simplified for brevity)
          if (jsonData.type === 'assistant') {
            const messageId = `assistant-${sessionId}-${Date.now()}-${Math.random()}`;
            
            if (jsonData.message?.content) {
              for (const block of jsonData.message.content) {
                if (block.type === 'text') {
                  lastAssistantMessageIds.set(sessionId, messageId);
                  socket.emit(`message:${sessionId}`, {
                    type: 'assistant',
                    message: { content: block.text },
                    streaming: true,
                    id: messageId,
                    timestamp: Date.now()
                  });
                  
                  session.messages.push({
                    type: 'assistant',
                    message: { content: block.text },
                    id: messageId,
                    timestamp: Date.now()
                  });
                } else if (block.type === 'tool_use') {
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
                } else if (block.type === 'tool_result') {
                  // Send tool result (like bash output) to client
                  console.log('[Server] Tool result:', block.output ? 'has output' : 'no output');
                  socket.emit(`message:${sessionId}`, {
                    type: 'tool_result',
                    message: {
                      tool_use_id: block.tool_use_id,
                      output: block.output || block.content,
                      is_error: block.is_error
                    },
                    timestamp: Date.now(),
                    id: `tool-result-${sessionId}-${Date.now()}`
                  });
                }
              }
            }
          } else if (jsonData.type === 'user' && jsonData.message?.content) {
            // Handle user messages that contain tool results
            if (Array.isArray(jsonData.message.content)) {
              for (const block of jsonData.message.content) {
                if (block.type === 'tool_result') {
                  console.log('[Server] Tool result from user message:', block.output ? `${block.output.substring(0, 100)}...` : 'no output');
                  socket.emit(`message:${sessionId}`, {
                    type: 'tool_result',
                    message: {
                      tool_use_id: block.tool_use_id,
                      output: block.output || block.content,
                      is_error: block.is_error
                    },
                    timestamp: Date.now(),
                    id: `tool-result-${sessionId}-${Date.now()}`
                  });
                }
              }
            }
          } else if (jsonData.type === 'result') {
            // Log full result message for debugging
            console.log('[Server] Full result message:', JSON.stringify(jsonData, null, 2));
            
            // Check for error_during_execution
            if (jsonData.subtype === 'error_during_execution' || jsonData.is_error) {
              console.error('[Server] ❌ ERROR RESULT:', {
                subtype: jsonData.subtype,
                error: jsonData.error,
                result: jsonData.result,
                message: jsonData.message
              });
              
              // Send error message to client
              socket.emit(`message:${sessionId}`, {
                type: 'system',
                subtype: 'error',
                message: jsonData.error || jsonData.result || 'Claude encountered an error',
                timestamp: Date.now()
              });
            }
            
            const lastAssistantMessageId = lastAssistantMessageIds.get(sessionId);
            if (lastAssistantMessageId) {
              socket.emit(`message:${sessionId}`, {
                type: 'assistant',
                id: lastAssistantMessageId,
                streaming: false,
                timestamp: Date.now()
              });
              lastAssistantMessageIds.delete(sessionId);
            }
            
            socket.emit(`message:${sessionId}`, {
              type: 'result',
              ...jsonData,
              streaming: false,
              id: `result-${sessionId}-${Date.now()}`,
              model: model
            });
          }
        } catch (e) {
          console.log('Plain text output:', line);
        }
      };
      
      child.stdout.on('data', (data) => {
        const str = data.toString();
        lineBuffer += str;
        
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
      
      if (content) {
        const inputContent = content.endsWith('\n') ? content : content + '\n';
        child.stdin.write(inputContent, 'utf8', (err) => {
          if (err) {
            console.error('Error writing to stdin:', err);
            socket.emit(`message:${sessionId}`, {
              type: 'system',
              subtype: 'error',
              message: `Failed to send prompt: ${err.message}`,
              timestamp: Date.now()
            });
          } else {
            console.log('✅ Prompt sent to Claude via stdin');
          }
          child.stdin.end();
        });
      } else {
        child.stdin.end();
      }
      
      child.on('close', (code) => {
        console.log(`Claude process exited with code ${code}`);
        
        if (lineBuffer.trim()) {
          processStreamLine(lineBuffer);
        }
        
        const lastAssistantMessageId = lastAssistantMessageIds.get(sessionId);
        if (lastAssistantMessageId) {
          socket.emit(`message:${sessionId}`, {
            type: 'assistant',
            id: lastAssistantMessageId,
            streaming: false,
            timestamp: Date.now()
          });
          lastAssistantMessageIds.delete(sessionId);
        }
        
        if (code !== 0 && code !== null) {
          console.error(`Claude process failed with exit code ${code}`);
          socket.emit(`message:${sessionId}`, {
            type: 'system',
            subtype: 'info',
            message: `Process completed with code ${code}`,
            timestamp: Date.now()
          });
        }
        
        activeProcesses.delete(sessionId);
      });
      
      child.on('error', (error) => {
        console.error('Failed to spawn claude:', error);
        let errorMessage = `Failed to run Claude: ${error.message}`;
        
        if (error.code === 'ENOENT') {
          if (process.platform === 'win32') {
            errorMessage = 'WSL not found. Please install Windows Subsystem for Linux and ensure Claude CLI is installed in WSL.';
          } else {
            errorMessage = 'Claude CLI not found. Please install Claude CLI and ensure it\'s in your PATH.';
          }
        } else if (error.code === 'EACCES') {
          errorMessage = 'Permission denied. Check that Claude CLI has execute permissions.';
        }
        
        socket.emit(`message:${sessionId}`, {
          type: 'system',
          subtype: 'error',
          message: errorMessage,
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
      console.log(`🛑 Killing claude process for session ${sessionId}`);
      process.kill('SIGINT');
      activeProcesses.delete(sessionId);
      
      // Clear the Claude session ID after interrupt since it can't be resumed
      const session = sessions.get(sessionId);
      if (session) {
        console.log(`🔄 Clearing Claude session ID after interrupt for ${sessionId}`);
        session.claudeSessionId = null; // Can't resume interrupted sessions
      }
      
      const lastAssistantMessageId = lastAssistantMessageIds.get(sessionId);
      if (lastAssistantMessageId) {
        socket.emit(`message:${sessionId}`, {
          type: 'assistant',
          id: lastAssistantMessageId,
          streaming: false,
          timestamp: Date.now()
        });
        lastAssistantMessageIds.delete(sessionId);
      }
      
      // Don't send interrupt message from server - client handles it
      
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
      
      const activeProcess = activeProcesses.get(sessionId);
      if (activeProcess) {
        console.log(`🛑 Killing active process for session ${sessionId}`);
        activeProcess.kill('SIGINT');
        activeProcesses.delete(sessionId);
      }
      
      session.messages = [];
      session.claudeSessionId = null;
      lastAssistantMessageIds.delete(sessionId);
      
      console.log(`✅ Session ${sessionId} cleared`);
      
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
    lastAssistantMessageIds.delete(sessionId);
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
  
  socket.on('disconnect', (reason) => {
    console.log('[Server] 👋 ===== CLIENT DISCONNECTED =====');
    console.log('[Server] Client ID:', socket.id);
    console.log('[Server] Reason:', reason);
    console.log('==================================');
  });
});

// Find available port and start server
async function startServer() {
  try {
    // Try to use environment variable port first
    const envPort = process.env.CLAUDE_SERVER_PORT;
    if (envPort) {
      actualPort = parseInt(envPort);
      console.log(`📌 Using port from environment: ${actualPort}`);
    } else {
      // Find available port starting from 3001
      portfinder.basePort = 3001;
      actualPort = await portfinder.getPortPromise();
      console.log(`🔍 Found available port: ${actualPort}`);
    }
    
    // Write port to a file for Electron to discover
    const portFile = path.join(os.tmpdir(), `yurucode-port-${process.pid}.json`);
    fs.writeFileSync(portFile, JSON.stringify({ port: actualPort, pid: process.pid }));
    console.log(`📝 Port info written to: ${portFile}`);
    
    httpServer.listen(actualPort, '0.0.0.0', () => {
      console.log('✅ ===== SERVER SUCCESSFULLY STARTED =====');
      console.log(`🚀 Claude Direct Server running on http://0.0.0.0:${actualPort}`);
      console.log(`🔑 Using claude CLI directly - NO SDK, NO API KEY`);
      console.log(`📝 Running in ${process.platform === 'linux' ? 'WSL' : 'Windows'}`);
      console.log(`🔌 Instance PID: ${process.pid}`);
      console.log('=========================================');
      
      if (process.send) {
        process.send({ type: 'server-ready', port: actualPort });
      }
    });
    
    httpServer.on('error', (error) => {
      console.error('❌ ===== SERVER STARTUP ERROR =====');
      console.error('Failed to start server:', error);
      if (error.code === 'EADDRINUSE') {
        console.error(`Port ${actualPort} is already in use.`);
      }
      console.error('===================================');
      process.exit(1);
    });
    
  } catch (error) {
    console.error('Failed to find available port:', error);
    process.exit(1);
  }
}

// Cleanup on exit
async function cleanup() {
  console.log('🛑 ===== SERVER SHUTTING DOWN =====');
  console.log('Time:', new Date().toISOString());
  
  for (const [id, process] of activeProcesses) {
    console.log(`Stopping process ${id}`);
    process.kill('SIGTERM');
  }
  activeProcesses.clear();
  sessions.clear();
  
  // Remove port file
  try {
    const portFile = path.join(os.tmpdir(), `yurucode-port-${process.pid}.json`);
    if (fs.existsSync(portFile)) {
      fs.unlinkSync(portFile);
      console.log('📝 Removed port file');
    }
  } catch (err) {
    // Ignore
  }
  
  console.log('✅ Cleanup complete');
  process.exit(0);
}

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);
process.on('beforeExit', cleanup);

// Add uncaught exception handler
process.on('uncaughtException', (error) => {
  console.error('💥 ===== UNCAUGHT EXCEPTION =====');
  console.error('Error:', error);
  console.error('Stack:', error.stack);
  console.error('=================================');
  cleanup();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 ===== UNHANDLED REJECTION =====');
  console.error('Reason:', reason);
  console.error('Promise:', promise);
  console.error('==================================');
});

// Start the server
startServer();