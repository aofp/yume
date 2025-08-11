/**
 * macOS-compatible server that runs claude CLI directly
 * IDENTICAL TO WINDOWS SERVER - NO SDK, NO API KEY - just direct claude CLI calls with streaming
 */

const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function(id) {
  try {
    return originalRequire.apply(this, arguments);
  } catch (e) {
    if (e.code === 'MODULE_NOT_FOUND' && process.env.ELECTRON_RUN_AS_NODE) {
      console.log(`Module not found: ${id}, attempting alternative resolution...`);
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
const fs = require('fs');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// Track active Claude processes and assistant message IDs - EXACTLY LIKE WINDOWS
let sessions = new Map();
let activeProcesses = new Map();  // Map of sessionId -> process
let lastAssistantMessageIds = new Map();  // Map of sessionId -> lastAssistantMessageId

// Helper function to generate title with Sonnet
async function generateTitle(sessionId, userMessage, socket) {
  try {
    console.log(`🏷️ Generating title for session ${sessionId}`);
    console.log(`🏷️ Message preview: "${userMessage.substring(0, 100)}..."`);
    
    // Spawn a separate claude process just for title generation
    const titleArgs = [
      '--output-format', 'json',
      '--model', 'claude-3-5-sonnet-20241022',
      '--print'  // Non-interactive mode
    ];
    
    const titlePrompt = `user message: "${userMessage.substring(0, 200)}"
task: reply with ONLY 1-3 words describing what user wants. lowercase only. no punctuation. be extremely concise. examples: "echo command", "file search", "debug issue"`;
    
    console.log(`🏷️ Title prompt: "${titlePrompt}"`);
    
    const child = spawn('claude', titleArgs, {
      cwd: process.cwd(),
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let output = '';
    let errorOutput = '';
    
    child.stdout.on('data', (data) => {
      output += data.toString();
      console.log(`🏷️ Title generation stdout: ${data.toString()}`);
    });
    
    child.stderr.on('data', (data) => {
      errorOutput += data.toString();
      console.log(`🏷️ Title generation stderr: ${data.toString()}`);
    });
    
    child.on('close', (code) => {
      console.log(`🏷️ Title generation process closed with code ${code}`);
      console.log(`🏷️ Full output: "${output}"`);
      if (errorOutput) {
        console.log(`🏷️ Error output: "${errorOutput}"`);
      }
      
      try {
        const lines = output.trim().split('\n');
        const lastLine = lines[lines.length - 1];
        console.log(`🏷️ Parsing last line: "${lastLine}"`);
        const response = JSON.parse(lastLine);
        
        // Handle both 'completion' and 'result' fields
        const titleText = response.completion || response.result;
        
        if (titleText) {
          let title = titleText
            .toLowerCase()
            .replace(/[^\w\s]/g, '')
            .trim()
            .substring(0, 30);
          
          if (title && title.length > 2) {
            console.log(`🏷️ Generated title: "${title}" - emitting to client`);
            const eventName = `title:${sessionId}`;
            console.log(`🏷️ Emitting event: ${eventName} with data:`, { title });
            socket.emit(eventName, { title });
          } else {
            console.log(`🏷️ Title too short or empty: "${title}"`);
          }
        } else {
          console.log(`🏷️ No title text in response:`, response);
        }
      } catch (e) {
        console.error('🏷️ Failed to parse title response:', e);
        console.error('🏷️ Raw output was:', output);
      }
    });
    
    child.on('error', (error) => {
      console.error('🏷️ Failed to spawn title generation process:', error);
    });
    
    // Send the prompt
    console.log(`🏷️ Writing prompt to stdin`);
    child.stdin.write(titlePrompt);
    child.stdin.end();
    
  } catch (error) {
    console.error('🏷️ Failed to generate title:', error);
  }
}

// Memory management - EXACTLY LIKE WINDOWS
const MAX_MESSAGE_HISTORY = 1000; // Limit message history per session
const MAX_LINE_BUFFER_SIZE = 10 * 1024 * 1024; // 10MB max buffer

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    pid: process.pid,
    service: 'yurucode-claude',
    claudeCodeLoaded: true
  });
});

// PID file management
const pidFilePath = path.join(__dirname, 'server.pid');

function writePidFile() {
  fs.writeFileSync(pidFilePath, process.pid.toString());
  console.log(`📝 Server PID ${process.pid} written to ${pidFilePath}`);
}

function removePidFile() {
  if (fs.existsSync(pidFilePath)) {
    fs.unlinkSync(pidFilePath);
    console.log(`🗑️ Removed PID file`);
  }
}

// Clean up on exit
process.on('SIGINT', () => {
  console.log('\n🛑 Server shutting down...');
  removePidFile();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Server terminated');
  removePidFile();
  process.exit(0);
});

process.on('exit', () => {
  removePidFile();
});

// Socket.IO connection handling - EXACTLY LIKE WINDOWS
io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id);

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
        claudeSessionId: null,
        hasGeneratedTitle: false
      };
      
      sessions.set(sessionId, sessionData);
      
      console.log(`✅ Session ready: ${sessionId}`);
      console.log(`📁 Working directory: ${workingDirectory}`);
      
      if (callback) {
        callback({
          success: true,
          sessionId: sessionId,
          workingDirectory: workingDirectory
        });
      }
    } catch (error) {
      console.error('❌ Error creating session:', error);
      if (callback) {
        callback({
          success: false,
          error: error.message
        });
      }
    }
  });

  socket.on('sendMessage', async (data, callback) => {
    const { sessionId, content: message, model } = data;
    const session = sessions.get(sessionId);
    
    if (!session) {
      console.error(`❌ Session not found: ${sessionId}`);
      if (callback) callback({ success: false, error: 'Session not found' });
      return;
    }
    
    try {
      console.log('\n📨 Received message request:', {
        sessionId,
        messageLength: message?.length || 0,
        model
      });

      // Kill any existing process for this session
      if (activeProcesses.has(sessionId)) {
        const existingProcess = activeProcesses.get(sessionId);
        console.log(`⚠️ Killing existing process for session ${sessionId}`);
        existingProcess.kill('SIGINT');
        activeProcesses.delete(sessionId);
      }

      // Clear the last assistant message ID for this session
      lastAssistantMessageIds.delete(sessionId);

      // Use session's working directory
      const processWorkingDir = session.workingDirectory || process.cwd();
      console.log(`📂 Using working directory: ${processWorkingDir}`);

      // Build the claude command - EXACTLY LIKE WINDOWS BUT WITH MACOS FLAGS
      const args = ['--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions'];
      
      // Add resume flag if we have a claude session ID
      if (session.claudeSessionId) {
        args.push('--resume', session.claudeSessionId);
        console.log('🔄 Using --resume flag with session:', session.claudeSessionId);
      }

      // Spawn claude process
      console.log(`🚀 Spawning claude with args:`, args);
      const claudeProcess = spawn('claude', args, {
        cwd: processWorkingDir,
        env: { ...process.env },
        shell: false
      });

      // Store process reference
      activeProcesses.set(sessionId, claudeProcess);

      // Send input if not resuming
      if (!session.claudeSessionId && message) {
        console.log(`📝 Sending message to claude (${message.length} chars)`);
        claudeProcess.stdin.write(message + '\n');
        claudeProcess.stdin.end();
      } else if (session.claudeSessionId && message) {
        console.log(`📝 Sending message to resumed session (${message.length} chars)`);
        claudeProcess.stdin.write(message + '\n');
        claudeProcess.stdin.end();
      }
      
      // Generate title with Sonnet (fire and forget) - only for first message
      console.log(`🏷️ Title check: hasGeneratedTitle=${session.hasGeneratedTitle}, messageLength=${message?.length}`);
      if (!session.hasGeneratedTitle && message && message.length > 5) {
        // Extract only text content (no attachments)
        let textContent = message;
        try {
          // Check if content is JSON array (with attachments)
          const parsed = JSON.parse(message);
          if (Array.isArray(parsed)) {
            // Find text blocks only
            const textBlocks = parsed.filter(block => block.type === 'text');
            textContent = textBlocks.map(block => block.text).join(' ');
            console.log(`🏷️ Extracted text from JSON: "${textContent.substring(0, 50)}..."`);
          }
        } catch (e) {
          // Not JSON, use as-is (plain text message)
          console.log(`🏷️ Using plain text content: "${textContent.substring(0, 50)}..."`);
        }
        
        // Only generate title if we have actual text content
        if (textContent && textContent.trim().length > 5) {
          console.log(`🏷️ Calling generateTitle for session ${sessionId}`);
          generateTitle(sessionId, textContent, socket);
          session.hasGeneratedTitle = true;
        } else {
          console.log(`🏷️ Skipping title generation - text too short: "${textContent}"`);
        }
      }

      // Process streaming output - EXACTLY LIKE WINDOWS
      let lineBuffer = '';
      let messageCount = 0;
      
      const processStreamLine = (line) => {
        if (!line.trim()) return;
        
        try {
          const jsonData = JSON.parse(line);
          console.log(`📦 Message type: ${jsonData.type}${jsonData.subtype ? ` (${jsonData.subtype})` : ''}`);
          
          // Extract session ID if present (update it every time to ensure we have the latest)
          if (jsonData.session_id) {
            session.claudeSessionId = jsonData.session_id;
            console.log(`📌 Claude session ID: ${session.claudeSessionId}`);
          }
          
          // Handle different message types - EXACTLY LIKE WINDOWS
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
                
                // Save to session with memory management
                session.messages.push({
                  type: 'assistant',
                  message: { content: textContent },
                  id: messageId,
                  timestamp: Date.now()
                });
                
                // Trim message history if too large
                if (session.messages.length > MAX_MESSAGE_HISTORY) {
                  const trimCount = Math.floor(MAX_MESSAGE_HISTORY * 0.2); // Remove 20%
                  session.messages.splice(0, trimCount);
                  console.log(`🧹 Trimmed ${trimCount} old messages from session ${sessionId}`);
                }
                
                messageCount++;
              } else if (!hasText && jsonData.message?.content) {
                // If there's no text but there are content blocks (e.g., only tool uses),
                // don't send the raw JSON structure as assistant message
                console.log('Assistant message with only tool uses, skipping text message');
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
            console.log(`📦 Message type: result`);
            console.log(`   ✅ Result: success=${!jsonData.is_error}, duration=${jsonData.duration_ms}ms`);
            
            // Log usage/cost information if present
            if (jsonData.usage) {
              console.log(`\n📊 TOKEN USAGE FROM CLAUDE CLI:`);
              console.log(`   input_tokens: ${jsonData.usage.input_tokens || 0}`);
              console.log(`   output_tokens: ${jsonData.usage.output_tokens || 0}`);
              console.log(`   cache_creation_input_tokens: ${jsonData.usage.cache_creation_input_tokens || 0}`);
              console.log(`   cache_read_input_tokens: ${jsonData.usage.cache_read_input_tokens || 0}`);
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

      // Handle stdout
      claudeProcess.stdout.on('data', (data) => {
        const str = data.toString();
        console.log('STDOUT received:', str.length, 'bytes');
        
        // Prevent memory overflow from excessive buffering
        if (lineBuffer.length > MAX_LINE_BUFFER_SIZE) {
          console.error('⚠️ Line buffer overflow, clearing buffer');
          lineBuffer = '';
        }
        
        lineBuffer += str;
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() || '';
        
        for (const line of lines) {
          processStreamLine(line);
        }
      });

      // Handle stderr
      claudeProcess.stderr.on('data', (data) => {
        const error = data.toString();
        console.error('⚠️ Claude stderr:', error);
        socket.emit(`message:${sessionId}`, { 
          type: 'error',
          error, 
          claudeSessionId: session.claudeSessionId,
          streaming: false 
        });
      });

      // Handle process exit
      claudeProcess.on('close', (code) => {
        console.log(`👋 Claude process exited with code ${code}`);
        activeProcesses.delete(sessionId);
        
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
      });

      // Handle process errors
      claudeProcess.on('error', (err) => {
        console.error('❌ Failed to spawn claude:', err);
        socket.emit(`message:${sessionId}`, { 
          type: 'error',
          error: `Failed to spawn claude: ${err.message}`, 
          claudeSessionId: session.claudeSessionId,
          streaming: false 
        });
        activeProcesses.delete(sessionId);
        lastAssistantMessageIds.delete(sessionId);
        if (callback) callback({ success: false, error: err.message });
      });

      // Send success callback
      if (callback) callback({ success: true });

    } catch (error) {
      console.error('❌ Error in sendMessage handler:', error);
      socket.emit(`message:${sessionId}`, { 
        type: 'error',
        error: error.message, 
        claudeSessionId: session.claudeSessionId,
        streaming: false 
      });
      if (callback) callback({ success: false, error: error.message });
    }
  });

  socket.on('interrupt', ({ sessionId }) => {
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
    }
  });
  
  socket.on('clearSession', ({ sessionId }) => {
    const session = sessions.get(sessionId);
    if (!session) {
      console.error(`Session not found: ${sessionId}`);
      return;
    }
    
    // Kill any active process
    const process = activeProcesses.get(sessionId);
    if (process) {
      console.log(`🛑 Killing process for cleared session ${sessionId}`);
      process.kill('SIGINT');
      activeProcesses.delete(sessionId);
    }
    
    // Clear the session data but keep the session alive
    session.messages = [];
    session.claudeSessionId = null;  // Reset Claude session ID so next message starts fresh
    session.hasGeneratedTitle = false;  // Reset title generation flag so next message gets a new title
    lastAssistantMessageIds.delete(sessionId);  // Clear any tracked assistant message IDs
    
    console.log(`✅ Session ${sessionId} cleared - will start fresh Claude session on next message`);
    
    // Send clear confirmation
    socket.emit(`message:${sessionId}`, {
      type: 'system',
      subtype: 'clear',
      message: 'session cleared',
      timestamp: Date.now()
    });
    
    // Emit title reset
    const eventName = `title:${sessionId}`;
    console.log(`🏷️ Emitting title reset for cleared session: ${eventName}`);
    socket.emit(eventName, { title: 'new session' });
  });
  
  socket.on('deleteSession', async (data, callback) => {
    const { sessionId } = data;
    sessions.delete(sessionId);
    lastAssistantMessageIds.delete(sessionId);  // Clean up tracking
    callback({ success: true });
  });

  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected:', socket.id);
    // Clean up any processes associated with this socket
    for (const [sessionId, session] of sessions.entries()) {
      if (session.socketId === socket.id) {
        const process = activeProcesses.get(sessionId);
        if (process) {
          console.log(`🧹 Cleaning up process for session ${sessionId}`);
          process.kill('SIGINT');
          activeProcesses.delete(sessionId);
        }
        lastAssistantMessageIds.delete(sessionId);
      }
    }
  });
});

// Start server
httpServer.listen(PORT, () => {
  writePidFile();
  console.log(`🚀 macOS Claude CLI server running on port ${PORT}`);
  console.log(`📂 Working directory: ${process.cwd()}`);
  console.log(`🖥️ Platform: ${os.platform()}`);
  console.log(`🏠 Home directory: ${os.homedir()}`);
  console.log(`✅ Server configured EXACTLY like Windows server`);
});