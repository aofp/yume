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
const fs = require('fs');

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

// Session states for tracking
const SessionState = {
  IDLE: 'idle',
  PROCESSING: 'processing',
  STREAMING: 'streaming',
  INTERRUPTED: 'interrupted',
  ERROR: 'error'
};

// Session management with proper isolation
let sessions = new Map();
let activeProcesses = new Map();  // Map of sessionId -> process
let lastAssistantMessageIds = new Map();  // Map of sessionId -> lastAssistantMessageId
let sessionStates = new Map();  // Map of sessionId -> state
let sessionRetryCount = new Map();  // Map of sessionId -> retry count

// macOS: Handle process cleanup on exit
if (process.platform !== 'win32') {
  process.on('exit', () => {
    // Clean up all active processes
    for (const [sessionId, childProcess] of activeProcesses) {
      try {
        process.kill(-childProcess.pid, 'SIGTERM');
      } catch (e) {
        // Process might already be dead
      }
    }
  });
  
  // Handle signals to clean up child processes
  ['SIGINT', 'SIGTERM'].forEach(signal => {
    process.on(signal, () => {
      console.log(`\n🛑 Received ${signal}, cleaning up...`);
      for (const [sessionId, childProcess] of activeProcesses) {
        try {
          process.kill(-childProcess.pid, 'SIGTERM');
        } catch (e) {
          // Process might already be dead
        }
      }
      process.exit(0);
    });
  });
}
let sessionIdCounter = 0;

// Memory management
const MAX_MESSAGE_HISTORY = 1000; // Limit message history per session
const MAX_LINE_BUFFER_SIZE = 10 * 1024 * 1024; // 10MB max buffer
let lastGcTime = Date.now();
const GC_INTERVAL = 5 * 60 * 1000; // Run GC every 5 minutes

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
        claudeSessionId: null,
        lastActivity: Date.now(),
        messageCount: 0,
        errorCount: 0,
        hasGeneratedTitle: false
      };
      
      sessions.set(sessionId, sessionData);
      sessionStates.set(sessionId, SessionState.IDLE);
      sessionRetryCount.set(sessionId, 0);
      
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
      
      // Check session state to prevent concurrent messages
      const currentState = sessionStates.get(sessionId);
      if (currentState === SessionState.PROCESSING || currentState === SessionState.STREAMING) {
        console.warn(`⚠️ Session ${sessionId} is already processing (state: ${currentState})`);
        callback({ success: false, error: 'Session is already processing a message' });
        return;
      }
      
      // Update session state
      sessionStates.set(sessionId, SessionState.PROCESSING);
      session.lastActivity = Date.now();
      session.messageCount++;

      console.log(`📝 Message #${session.messageCount} for session ${sessionId}: ${content.substring(0, 50)}...`);
      
      // Generate title with Sonnet (fire and forget)
      console.log(`🏷️ Title check: hasGeneratedTitle=${session.hasGeneratedTitle}, contentLength=${content?.length}`);
      if (!session.hasGeneratedTitle && content && content.length > 5) {
        // Extract only text content (no attachments)
        let textContent = content;
        try {
          // Check if content is JSON array (with attachments)
          const parsed = JSON.parse(content);
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
      // NOTE: --verbose is REQUIRED for stream-json output format
      // This might be why Claude reports high token counts - it includes system prompts
      const args = ['--print', '--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions'];
      
      // Add yurucode system prompt
      const casualPrompt = "<yurucode>you are in yurucode ui. reply concisely in lowercase. code/variables keep proper case.</yurucode>";
      args.push('--append-system-prompt', casualPrompt);
      
      // Add model selection if provided
      if (model) {
        args.push('--model', model);
        console.log(`🤖 Using model: ${model}`);
      }
      
      // Add session resume if we have one for follow-up messages
      if (session.claudeSessionId) {
        args.push('--resume', session.claudeSessionId);
        console.log(`📌 Resuming Claude session: ${session.claudeSessionId}`);
        console.log(`⚠️ RESUMING WILL INCLUDE ALL PREVIOUS TOKENS FROM THIS CLAUDE SESSION!`);
      } else {
        console.log(`🆕 Starting new Claude session`);
        console.log(`✨ This should start with ~0 tokens (only system prompt)`);
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
          // macOS/Unix-specific options for concurrent processes
          child = spawn(claudePath, args, {
            cwd: workingDir,
            env: { ...process.env },
            stdio: ['pipe', 'pipe', 'pipe'],
            // Critical for macOS: detach process to run independently
            detached: process.platform !== 'win32',
            // Ensure each process gets its own process group
            shell: false,
            // Don't inherit parent's file descriptors beyond stdio
            windowsHide: true
          });
          
          // On macOS/Unix, unref the child to allow parent to exit independently
          if (process.platform !== 'win32') {
            child.unref();
          }
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
      
      // Process streaming output with memory limits
      let lineBuffer = '';
      let messageCount = 0;
      
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
          
          // Handle different message types
          if (jsonData.type === 'system' && jsonData.subtype === 'init') {
            // For system init, this is a NEW session being created
            // Don't update claudeSessionId here - wait for the result message
            console.log(`📌 System init - NEW Claude session will be: ${jsonData.session_id}`);
            
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
                sessionStates.set(sessionId, SessionState.STREAMING); // Update state
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
            console.log(`📦 Message type: result (${jsonData.result})`);
            console.log(`   ✅ Result: success=${jsonData.result === 'success'}, duration=${jsonData.duration}ms`);
            
            // NOW we can save the session ID from a successful conversation
            if (jsonData.session_id && jsonData.result === 'success') {
              session.claudeSessionId = jsonData.session_id;
              console.log(`📌 Saved Claude session ID for resume: ${session.claudeSessionId}`);
            }
            
            // Update session state
            sessionStates.set(sessionId, SessionState.IDLE);
            sessionRetryCount.set(sessionId, 0); // Reset retry count on success
            
            // CRITICAL TOKEN DEBUG - SHOW EXACTLY WHAT CLAUDE IS SENDING
            console.log(`\n🚨🚨🚨 TOKEN DEBUG - CLAUDE CLI RESULT 🚨🚨🚨`);
            console.log(`Session ID: ${session.claudeSessionId}`);
            console.log(`Is this a NEW session? ${!session.claudeSessionId ? 'YES - FRESH START' : 'NO - RESUMING'}`);
            
            // Log usage/cost information if present
            if (jsonData.usage) {
              console.log(`\n📊 EXACT TOKEN USAGE FROM CLAUDE CLI:`);
              console.log(`   input_tokens: ${jsonData.usage.input_tokens || 0}`);
              console.log(`   output_tokens: ${jsonData.usage.output_tokens || 0}`);
              console.log(`   cache_creation_input_tokens: ${jsonData.usage.cache_creation_input_tokens || 0}`);
              console.log(`   cache_read_input_tokens: ${jsonData.usage.cache_read_input_tokens || 0}`);
              const totalInput = (jsonData.usage.input_tokens || 0) + 
                                (jsonData.usage.cache_creation_input_tokens || 0) + 
                                (jsonData.usage.cache_read_input_tokens || 0);
              const totalOutput = jsonData.usage.output_tokens || 0;
              console.log(`   TOTAL INPUT: ${totalInput}`);
              console.log(`   TOTAL OUTPUT: ${totalOutput}`);
              console.log(`   GRAND TOTAL: ${totalInput + totalOutput}`);
            } else {
              console.log(`   ⚠️ NO USAGE DATA IN RESULT`);
            }
            
            if (jsonData.cost) {
              console.log(`\n💵 COST FROM CLAUDE:`);
              console.log(`   Total: $${jsonData.total_cost_usd || 0}`);
            }
            console.log(`🚨🚨🚨 END TOKEN DEBUG 🚨🚨🚨\n`);
            
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
        
        // Prevent memory overflow from excessive buffering
        if (lineBuffer.length > MAX_LINE_BUFFER_SIZE) {
          console.error('⚠️ Line buffer overflow - clearing buffer');
          lineBuffer = '';
          socket.emit(`message:${sessionId}`, {
            type: 'system',
            subtype: 'warning',
            message: 'Stream buffer overflow - some output may be lost',
            timestamp: Date.now()
          });
          return;
        }
        
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
        
        // Handle "No conversation found" error specifically
        if (error.includes('No conversation found with session ID')) {
          // Clear the invalid session ID
          const session = sessions.get(sessionId);
          if (session) {
            session.claudeSessionId = undefined;
            sessionRetryCount.set(sessionId, 0); // Reset retry count
            sessionStates.set(sessionId, SessionState.IDLE); // Reset state
            console.log(`🔄 Cleared invalid Claude session ID for ${sessionId}`);
          }
          
          // Clear streaming state
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
          
          // Don't show the technical error to user
          socket.emit(`message:${sessionId}`, {
            type: 'system',
            subtype: 'info',
            message: 'starting fresh conversation...',
            timestamp: Date.now()
          });
          
          // Send result message to ensure UI clears streaming state
          socket.emit(`message:${sessionId}`, {
            type: 'result',
            id: `${sessionId}-session-reset-${Date.now()}`,
            sessionId,
            streaming: false,
            timestamp: Date.now()
          });
        } else {
          // Show other errors to user
          socket.emit(`message:${sessionId}`, {
            type: 'system',
            subtype: 'error',
            message: error,
            timestamp: Date.now()
          });
          
          // Send result message to ensure UI clears streaming state
          socket.emit(`message:${sessionId}`, {
            type: 'result',
            id: `${sessionId}-error-${Date.now()}`,
            sessionId,
            streaming: false,
            timestamp: Date.now()
          });
          
          // Reset session state to IDLE after error
          sessionStates.set(sessionId, SessionState.IDLE);
        }
      });
      
      // Write the prompt to stdin with proper encoding and newline
      if (content) {
        // Ensure content ends with newline for proper stdin handling
        const inputContent = content.endsWith('\n') ? content : content + '\n';
        
        console.log(`\n🔍 SENDING PROMPT TO CLAUDE:`);
        console.log(`   Length: ${inputContent.length} characters`);
        console.log(`   Content: "${inputContent.substring(0, 500)}${inputContent.length > 500 ? '...' : ''}"`);
        console.log(`   Estimated tokens (rough): ~${Math.ceil(inputContent.length / 4)}`);
        
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
        console.log(`Total messages processed: ${messageCount}`);
        
        // Update state based on exit code
        const currentState = sessionStates.get(sessionId);
        if (currentState !== SessionState.INTERRUPTED) {
          if (code === 0 || code === null) {
            sessionStates.set(sessionId, SessionState.IDLE);
          } else {
            sessionStates.set(sessionId, SessionState.ERROR);
          }
        }
        
        // Process any remaining buffer
        if (lineBuffer.trim()) {
          processStreamLine(lineBuffer);
        }
        
        // Clear line buffer to free memory
        lineBuffer = '';
        
        // Run periodic garbage collection
        const now = Date.now();
        if (now - lastGcTime > GC_INTERVAL && global.gc) {
          console.log('🧹 Running garbage collection');
          global.gc();
          lastGcTime = now;
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
          
          // Handle retry logic
          const session = sessions.get(sessionId);
          if (session && code === 1) {
            const retryCount = sessionRetryCount.get(sessionId) || 0;
            if (retryCount >= 2) {
              // Clear session after multiple failures
              session.claudeSessionId = undefined;
              console.log(`🔄 Cleared Claude session ID for ${sessionId} after ${retryCount} failures`);
              sessionRetryCount.set(sessionId, 0);
            } else {
              // Increment retry count
              sessionRetryCount.set(sessionId, retryCount + 1);
              console.log(`⚠️ Session ${sessionId} failed, retry count: ${retryCount + 1}/2`);
            }
          }
          
          // Send error message to client
          socket.emit(`message:${sessionId}`, {
            type: 'system',
            subtype: 'error',
            message: `Process failed. Starting fresh session for next message.`,
            timestamp: Date.now()
          });
        }
        
        activeProcesses.delete(sessionId);
      });
      
      child.on('error', (error) => {
        console.error('Failed to spawn claude:', error);
        
        // Clean up on error
        lineBuffer = '';
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
        
        // Clear streaming state and Claude session ID on error
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
        
        // Clear Claude session ID on spawn error
        const session = sessions.get(sessionId);
        if (session) {
          session.claudeSessionId = undefined;
          console.log(`🔄 Cleared Claude session ID for ${sessionId} due to spawn error`);
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
    
    // Update state
    const currentState = sessionStates.get(sessionId);
    console.log(`  Current state: ${currentState || 'unknown'}`);
    sessionStates.set(sessionId, SessionState.INTERRUPTED);
    
    // Get the specific process for this session
    const childProcess = activeProcesses.get(sessionId);
    if (childProcess) {
      console.log(`🛑 Killing claude process for session ${sessionId} (PID: ${childProcess.pid})`);
      
      // macOS/Unix: Kill the process group to ensure all children are terminated
      if (process.platform !== 'win32') {
        try {
          // Negative PID kills the entire process group
          process.kill(-childProcess.pid, 'SIGINT');
        } catch (e) {
          // Fallback to regular kill if process group kill fails
          childProcess.kill('SIGINT');
        }
      } else {
        childProcess.kill('SIGINT');
      }
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
      
      // Clear the Claude session ID after interrupt and reset state
      const session = sessions.get(sessionId);
      if (session) {
        session.claudeSessionId = undefined;
        sessionStates.set(sessionId, SessionState.IDLE); // Reset to IDLE after interrupt
        sessionRetryCount.set(sessionId, 0); // Reset retry count
        console.log(`🔄 Cleared Claude session ID and reset state for ${sessionId} after interrupt`);
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
        // macOS/Unix: Kill process group
        if (process.platform !== 'win32') {
          try {
            process.kill(-activeProcess.pid, 'SIGINT');
          } catch (e) {
            activeProcess.kill('SIGINT');
          }
        } else {
          activeProcess.kill('SIGINT');
        }
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

// PID file management for proper cleanup
const PID_FILE = path.join(__dirname, '.server.pid');

function writePidFile() {
  try {
    fs.writeFileSync(PID_FILE, process.pid.toString());
    console.log(`📄 PID file written: ${PID_FILE} (PID: ${process.pid})`);
  } catch (error) {
    console.error('❌ Failed to write PID file:', error);
  }
}

function cleanupPidFile() {
  try {
    if (fs.existsSync(PID_FILE)) {
      fs.unlinkSync(PID_FILE);
      console.log('🗑️ PID file cleaned up');
    }
  } catch (error) {
    console.error('⚠️ Failed to cleanup PID file:', error);
  }
}

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
  console.log(`🧹 GC enabled: ${global.gc ? 'YES' : 'NO (run with --expose-gc)'}`);
  console.log('=========================================');
  
  // Write PID file for cleanup purposes
  writePidFile();
  
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
  
  // Try to clean up before exit
  try {
    for (const [id, process] of activeProcesses) {
      process.kill('SIGTERM');
    }
    activeProcesses.clear();
    sessions.clear();
    lastAssistantMessageIds.clear();
  } catch (cleanupError) {
    console.error('Cleanup error:', cleanupError);
  }
  
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 ===== UNHANDLED REJECTION =====');
  console.error('Reason:', reason);
  console.error('Promise:', promise);
  console.error('==================================');
  
  // Don't exit on unhandled rejection but log memory usage
  const memUsage = process.memoryUsage();
  console.log('Memory usage:');
  console.log(`  RSS: ${Math.round(memUsage.rss / 1024 / 1024)}MB`);
  console.log(`  Heap Used: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
  console.log(`  Heap Total: ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`);
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
  lastAssistantMessageIds.clear();
  
  // Clean up PID file
  cleanupPidFile();
  
  console.log('✅ Cleanup complete');
  process.exit(0);
}

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);
process.on('beforeExit', cleanup);