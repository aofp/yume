/**
 * Express server that runs claude CLI directly like code_service.js
 * NO SDK, NO API KEY - just direct claude CLI calls with streaming
 */

// Production build fix: Handle module loading from different contexts
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function(id) {
  try {
    return originalRequire.apply(this, arguments);
  } catch (e) {
    // If module not found and we're in production, try alternative paths
    if (e.code === 'MODULE_NOT_FOUND' && process.env.ELECTRON_RUN_AS_NODE) {
      console.log(`Module not found: ${id}, attempting alternative resolution...`);
      // Try to load from the app's node_modules
      const alternativePaths = [
        path.join(__dirname, 'node_modules', id),
        path.join(process.cwd(), 'node_modules', id),
        path.join(__dirname, '..', 'node_modules', id)
      ];
      
      for (const altPath of alternativePaths) {
        try {
          return originalRequire.call(this, altPath);
        } catch (altError) {
          // Continue to next path
        }
      }
    }
    throw e;
  }
};

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
let lastAssistantMessageIds = new Map();  // Map of sessionId -> lastAssistantMessageId
let sessionIdCounter = 0;

// Socket.IO connection handler
io.on('connection', (socket) => {
  console.log('✨ ===== NEW CLIENT CONNECTION =====');
  console.log('Client ID:', socket.id);
  console.log('Client address:', socket.handshake.address);
  console.log('Transport:', socket.conn.transport.name);
  console.log('Time:', new Date().toISOString());
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
      
      // Path to claude CLI - check common locations
      let claudePath = null;
      
      // On Windows, we'll use WSL, so just check if WSL exists
      if (process.platform === 'win32') {
        // We'll use 'wsl claude' so no need to check paths
        claudePath = 'claude'; // This will be run through WSL
        console.log('🪟 Windows detected - will use WSL to run claude');
      } else {
        // Unix-like systems - check for claude in common locations
        const homedir = os.homedir();
        const claudePaths = [
          path.join(homedir, '.claude', 'local', 'claude'),
          path.join(homedir, '.local', 'bin', 'claude'),
          'claude'  // Try PATH as last resort
        ];
        
        const fs = require('fs');
        for (const cpath of claudePaths) {
          if (fs.existsSync(cpath)) {
            claudePath = cpath;
            console.log(`🔧 Found claude at: ${cpath}`);
            break;
          }
        }
        
        if (!claudePath) {
          // Send error message to client
          socket.emit(`message:${sessionId}`, {
            type: 'system',
            subtype: 'error',
            message: 'Claude CLI not found. Please ensure claude is installed. Check paths: ' + claudePaths.join(', '),
            timestamp: Date.now()
          });
          callback({ success: false, error: 'Claude CLI not found' });
          return;
        }
      }
      
      // Build arguments - same as code_service.js
      const args = ['--print', '--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions'];
      
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
      
      // Don't add prompt to args - we'll send it via stdin
      // args.push(content);
      
      console.log(`🚀 Running claude with args:`, args.join(' '));
      
      // Spawn claude process - use WSL on Windows
      let child;
      try {
        // On Windows, run through WSL
        if (process.platform === 'win32') {
          console.log('🪟 Windows detected - running claude through WSL');
          console.log('Working directory:', session.workingDirectory);
          console.log('Working directory (WSL format):', workingDir);
          
          // CRITICAL: Find claude in WSL - could be in different locations
          // First try to find claude using 'which' or check common locations
          const findClaudeCommand = 'which claude || echo ~/.claude/local/claude';
          const wslCommand = `bash -c "${findClaudeCommand} | head -1"`;
          
          // For now, try common locations in order
          const claudeCommand = 'bash -c "if command -v claude &> /dev/null; then claude; elif [ -x ~/.claude/local/claude ]; then ~/.claude/local/claude; elif [ -x ~/.local/bin/claude ]; then ~/.local/bin/claude; else echo claude_not_found; fi"';
          
          // Build the full WSL command
          const wslArgs = ['-e', 'bash', '-c', 
            `if command -v claude &> /dev/null; then claude ${args.join(' ')}; elif [ -x ~/.claude/local/claude ]; then ~/.claude/local/claude ${args.join(' ')}; elif [ -x ~/.local/bin/claude ]; then ~/.local/bin/claude ${args.join(' ')}; else echo "Claude CLI not found in WSL" >&2 && exit 127; fi`
          ];
          
          console.log('WSL command:', 'wsl.exe', wslArgs.join(' '));
          console.log('Full args array:', wslArgs);
          
          // Use the session's working directory for spawn
          child = spawn('wsl.exe', wslArgs, {
            cwd: session.workingDirectory, // Use original Windows path
            env: process.env,
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: false,
            windowsHide: true
          });
          
          // Immediately check if process started
          if (!child || !child.pid) {
            throw new Error('Failed to spawn WSL process');
          }
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
          message: `Failed to start Claude: ${spawnError.message}. ${process.platform === 'win32' ? 'Make sure WSL is installed and Claude CLI is installed in WSL.' : `Path: ${claudePath}`}`,
          timestamp: Date.now()
        });
        callback({ success: false, error: `Failed to spawn: ${spawnError.message}` });
        return;
      }
      
      // Store the process for this session so we can interrupt it
      activeProcesses.set(sessionId, child);
      
      // Send immediate feedback that process started
      socket.emit(`message:${sessionId}`, {
        type: 'system',
        subtype: 'info',
        message: `Starting Claude${process.platform === 'win32' ? ' via WSL' : ''}...`,
        timestamp: Date.now()
      });
      
      // Log process info
      console.log(`Process spawned with PID: ${child.pid}`);
      
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
                lastAssistantMessageIds.set(sessionId, messageId); // Track this message ID
                socket.emit(`message:${sessionId}`, {
                  type: 'assistant',
                  message: { content: textContent },
                  streaming: true,  // Set streaming to true during active streaming
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
            console.log(`📦 Message type: result (${jsonData.result})`);
            console.log(`   ✅ Result: success=${jsonData.result === 'success'}, duration=${jsonData.duration}ms`);
            
            // Log the entire result object to see all fields
            console.log(`   📋 Full result data:`, JSON.stringify(jsonData, null, 2));
            
            // Log usage/cost information if present
            if (jsonData.usage) {
              console.log(`   💰 Usage:`, JSON.stringify(jsonData.usage, null, 2));
            }
            if (jsonData.cost) {
              console.log(`   💵 Cost:`, JSON.stringify(jsonData.cost, null, 2));
            }
            
            // If we have a last assistant message, send an update to mark it as done streaming
            const lastAssistantMessageId = lastAssistantMessageIds.get(sessionId);
            if (lastAssistantMessageId) {
              socket.emit(`message:${sessionId}`, {
                type: 'assistant',
                id: lastAssistantMessageId,
                streaming: false,
                timestamp: Date.now()
              });
              lastAssistantMessageIds.delete(sessionId); // Reset
            }
            
            // Just send the result message with model info
            socket.emit(`message:${sessionId}`, {
              type: 'result',
              ...jsonData,
              streaming: false,
              id: `result-${sessionId}-${Date.now()}`,
              model: model // Include the model that was used
            });
          }
          
        } catch (e) {
          // Not JSON, treat as plain text
          console.log('Plain text output:', line);
        }
      };
      
      child.stdout.on('data', (data) => {
        const str = data.toString();
        console.log('STDOUT received:', str.length, 'bytes');
        lineBuffer += str;
        
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
      
      // Write the prompt to stdin with proper encoding and newline
      if (content) {
        // Ensure content ends with newline for proper stdin handling
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
          // Close stdin after writing
          child.stdin.end();
        });
      } else {
        child.stdin.end();
      }
      
      child.on('close', (code) => {
        console.log(`Claude process exited with code ${code}`);
        
        // Process any remaining buffer
        if (lineBuffer.trim()) {
          processStreamLine(lineBuffer);
        }
        
        // If we have a last assistant message, mark it as done streaming
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
        
        // If process exited with error code and no result was sent
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
        
        // Add helpful context based on error type
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
    
    // Get the specific process for this session
    const process = activeProcesses.get(sessionId);
    if (process) {
      console.log(`🛑 Killing claude process for session ${sessionId}`);
      process.kill('SIGINT');  // Use SIGINT for graceful interrupt
      activeProcesses.delete(sessionId);
      
      // If we have a last assistant message, mark it as done streaming
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
      lastAssistantMessageIds.delete(sessionId);  // Clear any tracked assistant message IDs
      
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
    lastAssistantMessageIds.delete(sessionId);  // Clean up tracking
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
    console.log('👋 ===== CLIENT DISCONNECTED =====');
    console.log('Client ID:', socket.id);
    console.log('Reason:', reason);
    console.log('Time:', new Date().toISOString());
    console.log('==================================');
  });
});

const PORT = process.env.PORT || 3001;

// Add startup logging
console.log('===== SERVER STARTUP LOGGING =====');
console.log(`📅 Starting server at: ${new Date().toISOString()}`);
console.log(`📁 Current directory: ${process.cwd()}`);
console.log(`🖥️ Platform: ${process.platform}`);
console.log(`🔢 Node version: ${process.version}`);
console.log(`📍 Script location: ${__filename}`);
console.log(`🌐 Attempting to bind to port: ${PORT}`);
console.log(`🏷️ Process argv:`, process.argv);
console.log(`🔧 Environment NODE_ENV:`, process.env.NODE_ENV || 'not set');
console.log('==================================');

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ ===== SERVER SUCCESSFULLY STARTED =====`);
  console.log(`🚀 Claude Direct Server running on http://0.0.0.0:${PORT}`);
  console.log(`🔑 Using claude CLI directly - NO SDK, NO API KEY`);
  console.log(`📝 Running in ${process.platform === 'linux' ? 'WSL' : 'Windows'}`);
  console.log(`🔌 WebSocket ready for connections`);
  console.log('=========================================');
  
  if (process.send) {
    console.log('📤 Sending ready signal to parent process');
    process.send({ type: 'server-ready', port: PORT });
  }
});

// Add error handler for server startup
httpServer.on('error', (error) => {
  console.error('❌ ===== SERVER STARTUP ERROR =====');
  console.error('Failed to start server:', error);
  console.error('Error code:', error.code);
  console.error('Error message:', error.message);
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Try killing the process using it:`);
    console.error(`  Windows: netstat -ano | findstr :${PORT}`);
    console.error(`  Then: taskkill /F /PID <pid>`);
    console.error(`  Linux/Mac: lsof -i :${PORT}`);
    console.error(`  Then: kill -9 <pid>`);
  }
  console.error('===================================');
  process.exit(1);
});

// Add uncaught exception handler
process.on('uncaughtException', (error) => {
  console.error('💥 ===== UNCAUGHT EXCEPTION =====');
  console.error('Error:', error);
  console.error('Stack:', error.stack);
  console.error('=================================');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 ===== UNHANDLED REJECTION =====');
  console.error('Reason:', reason);
  console.error('Promise:', promise);
  console.error('==================================');
});

// Cleanup on exit
async function cleanup() {
  console.log('🛑 ===== SERVER SHUTTING DOWN =====');
  console.log('Time:', new Date().toISOString());
  
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