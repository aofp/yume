/**
 * Windows-compatible server that runs claude CLI directly
 * NO SDK, NO API KEY - just direct claude CLI calls with streaming
 * Hardened for multiple concurrent sessions and long-running operations
 */

// No need for module override when not using asar

// Claude CLI path - try multiple locations
import { execSync, spawn } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { homedir, platform } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let CLAUDE_PATH = 'claude'; // Default to PATH lookup

// Try to find Claude CLI in common Windows locations
const possibleClaudePaths = [
  'C:\\Program Files\\Claude\\claude.exe',
  'C:\\Users\\' + process.env.USERNAME + '\\AppData\\Local\\Programs\\claude\\claude.exe',
  'C:\\claude\\claude.exe',
  process.env.CLAUDE_PATH, // Allow env override
].filter(Boolean);

for (const claudePath of possibleClaudePaths) {
  try {
    if (existsSync(claudePath)) {
      CLAUDE_PATH = claudePath;
      console.log(`✅ Found Claude CLI at: ${CLAUDE_PATH}`);
      break;
    }
  } catch (e) {
    // Continue searching
  }
}

// If still not found, try 'where' command (Windows equivalent of 'which')
if (CLAUDE_PATH === 'claude') {
  try {
    const whereResult = execSync('where claude', { encoding: 'utf8' }).trim().split('\n')[0];
    if (whereResult) {
      CLAUDE_PATH = whereResult;
      console.log(`✅ Found Claude CLI via where: ${CLAUDE_PATH}`);
    }
  } catch (e) {
    console.warn(`⚠️ Claude CLI not found in PATH. Using 'claude' and hoping for the best.`);
  }
}

import express from 'express';
import cors from 'cors';
import net from 'net';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 600000, // 10 minutes - prevent timeout during long operations
  pingInterval: 30000, // 30 seconds heartbeat
  upgradeTimeout: 60000, // 60 seconds for upgrade
  maxHttpBufferSize: 5e8, // 500mb - handle large contexts
  perMessageDeflate: false, // Disable compression for better streaming performance
  httpCompression: false // Disable HTTP compression for streaming
});

app.use(cors());
app.use(express.json());

// ALWAYS use dynamic port - for BOTH development AND production
const PORT = (() => {
  // First check environment variable (passed from Rust)
  if (process.env.PORT) {
    const port = parseInt(process.env.PORT);
    console.log(`✅ Using PORT from Rust: ${port}`);
    return port;
  }
  
  // Otherwise find an available port dynamically
  console.log('🔍 Finding available port in range 20000-65000...');
  let port = 20000 + Math.floor(Math.random() * 45001);
  
  for (let i = 0; i < 100; i++) {
    const testPort = 20000 + ((port - 20000 + i) % 45001);
    const server = net.createServer();
    try {
      server.listen(testPort, '127.0.0.1');
      server.close();
      console.log(`✅ Found available port: ${testPort}`);
      return testPort;
    } catch (e) {
      // Port in use, try next
    }
  }
  
  // Last resort fallback
  console.log('⚠️ Could not find available port, using 3001');
  return 3001;
})();

// Track active Claude processes and assistant message IDs
let sessions = new Map();
let activeProcesses = new Map();  // Map of sessionId -> process
let lastAssistantMessageIds = new Map();  // Map of sessionId -> lastAssistantMessageId
let streamHealthChecks = new Map(); // Map of sessionId -> interval
let streamTimeouts = new Map(); // Map of sessionId -> timeout

// Add process spawn mutex to prevent race conditions
let isSpawningProcess = false;
const processSpawnQueue = [];

// Helper function to generate title with Sonnet
async function generateTitle(sessionId, userMessage, socket, onSuccess) {
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
    
    // Windows environment setup for title generation
    const enhancedEnv = { ...process.env };
    
    const child = spawn(CLAUDE_PATH, titleArgs, {
      cwd: process.cwd(),
      env: enhancedEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,  // Always hide windows
      detached: false
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
            // Mark title as successfully generated
            if (onSuccess) onSuccess();
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
    
    // Send the prompt
    child.stdin.write(titlePrompt);
    child.stdin.end();
    
    // Add timeout
    setTimeout(() => {
      if (child.exitCode === null) {
        console.log('🏷️ Title generation timeout, killing process');
        child.kill('SIGTERM');
      }
    }, 5000);
    
  } catch (e) {
    console.error('🏷️ Title generation error:', e);
  }
}

// Create PID directory and file
const PID_DIR = join(homedir(), '.yurucode');
const PID_FILE = join(PID_DIR, `server-${PORT}.pid`);

function writePidFile() {
  try {
    if (!existsSync(PID_DIR)) {
      mkdirSync(PID_DIR, { recursive: true });
    }
    writeFileSync(PID_FILE, process.pid.toString());
    console.log(`📝 PID ${process.pid} written to ${PID_FILE}`);
  } catch (e) {
    console.error('Failed to write PID file:', e);
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    port: PORT, 
    pid: process.pid,
    sessions: sessions.size,
    activeProcesses: activeProcesses.size,
    platform: platform()
  });
});

// Increase max line buffer size to handle very large messages
const MAX_LINE_BUFFER_SIZE = 50 * 1024 * 1024; // 50MB max buffer for large responses

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('🔌 New connection from client:', socket.id);
  
  socket.on('createSession', async (data, callback) => {
    const { name, workingDirectory, sessionId, options } = data;
    console.log('📋 Creating/resuming session:', { name, workingDirectory, sessionId, socketId: socket.id, options });
    
    // Get existing session or create new one
    if (sessions.has(sessionId)) {
      const existingSession = sessions.get(sessionId);
      console.log(`♻️ Resuming existing session ${sessionId} with ${existingSession.messages.length} messages`);
      existingSession.socketId = socket.id; // Update socket ID in case of reconnection
      callback({ 
        success: true, 
        sessionId,
        messages: existingSession.messages,
        workingDirectory: existingSession.workingDirectory
      });
    } else {
      const session = {
        id: sessionId,
        name: name || `Session ${sessionId}`,
        socketId: socket.id,
        messages: [],
        createdAt: new Date(),
        workingDirectory: workingDirectory || process.cwd(),
        claudeSessionId: undefined,  // Will be set when Claude responds
        hasGeneratedTitle: false,  // Track if we've generated a title for this session
        wasInterrupted: false, // Track if the last command was interrupted
        ...options // Spread any additional options
      };
      
      sessions.set(sessionId, session);
      console.log(`✅ Created new session: ${sessionId}`);
      callback({ 
        success: true, 
        sessionId,
        messages: [],
        workingDirectory: session.workingDirectory
      });
    }
  });
  
  socket.on('getSessionHistory', ({ sessionId }, callback) => {
    const session = sessions.get(sessionId);
    if (session) {
      callback({ 
        success: true, 
        messages: session.messages,
        workingDirectory: session.workingDirectory
      });
    } else {
      callback({ success: false, error: 'Session not found' });
    }
  });
  
  socket.on('listSessions', (data, callback) => {
    const sessionList = Array.from(sessions.values()).map(s => ({
      id: s.id,
      name: s.name,
      createdAt: s.createdAt,
      messageCount: s.messages.length,
      workingDirectory: s.workingDirectory
    }));
    callback({ success: true, sessions: sessionList });
  });
  
  socket.on('message', async (data) => {
    const { sessionId, message, model } = data;
    console.log('📨 Received message for session:', sessionId, 'Model:', model || 'default', 'Message length:', message?.length || 0);
    
    const session = sessions.get(sessionId);
    if (!session) {
      console.error(`Session not found: ${sessionId}`);
      socket.emit(`message:${sessionId}`, { 
        type: 'error', 
        error: 'Session not found. Please refresh and try again.' 
      });
      return;
    }
    
    // Check if this is likely a followup during streaming
    const wasInterrupted = session.wasInterrupted;
    if (wasInterrupted) {
      console.log('🔄 Last command was interrupted, marking this as a followup');
      session.wasInterrupted = false; // Reset flag
    }
    
    // Store message in session history
    if (message) {
      session.messages.push({
        type: 'user',
        content: message,
        timestamp: new Date()
      });
    }
    
    // Spawn Claude process in background
      try {
        console.log('🚀 Spawning Claude process...', {
          sessionId,
          hasClaudeSessionId: !!session.claudeSessionId,
          messageLength: message?.length || 0,
          model,
          queueLength: processSpawnQueue.length
        });

        // Kill any existing process for this session
        if (activeProcesses.has(sessionId)) {
          const existingProcess = activeProcesses.get(sessionId);
          console.log(`⚠️ Killing existing process for session ${sessionId} (PID: ${existingProcess.pid})`);
          
          // Kill the process on Windows
          existingProcess.kill('SIGTERM');
          
          activeProcesses.delete(sessionId);
          // Wait a bit for the process to fully terminate
          await new Promise(resolve => setTimeout(resolve, 150));
        }

        // Clear the last assistant message ID for this session
        lastAssistantMessageIds.delete(sessionId);

        // Use session's working directory, fallback to home directory (NOT process.cwd() in bundled app)
        const processWorkingDir = session.workingDirectory || homedir();
        console.log(`📂 Using working directory: ${processWorkingDir}`);

      // Build the claude command for Windows
      const args = ['--output-format', 'stream-json', '--verbose'];
      
      // Use --resume if we have a claudeSessionId (for continuing conversations)
      if (session.claudeSessionId) {
        args.push('--resume', session.claudeSessionId);
        console.log('🔄 Using --resume flag with session:', session.claudeSessionId);
      } else {
        console.log('📝 Starting fresh conversation (no previous session)');
      }

      // Spawn claude process with proper PATH for Node.js
      console.log(`🚀 Spawning claude with args:`, args);
      console.log(`🔍 Active processes count: ${activeProcesses.size}`);
      
      // Windows environment setup
      const enhancedEnv = { ...process.env };
      
      // Add unique session identifier to environment to ensure isolation
      enhancedEnv.CLAUDE_SESSION_ID = sessionId;
      enhancedEnv.CLAUDE_INSTANCE = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Explicitly set PWD environment variable for Claude's bash commands
      enhancedEnv.PWD = processWorkingDir;
      enhancedEnv.HOME = homedir(); // Ensure HOME is set correctly
      console.log(`🔧 Set PWD=${processWorkingDir} and HOME=${homedir()} in environment`);
      
      // Add small delay to prevent race conditions with multiple Claude instances
      if (isSpawningProcess) {
        console.log(`⏳ Waiting for previous Claude process to initialize...`);
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      isSpawningProcess = true;
      
      // Ensure the directory exists before spawning
      if (!existsSync(processWorkingDir)) {
        console.warn(`⚠️ Working directory does not exist: ${processWorkingDir}, using home directory`);
        processWorkingDir = homedir();
      }
      
      const spawnOptions = {
        cwd: processWorkingDir,
        env: enhancedEnv,
        shell: false,
        windowsHide: true,  // Always hide windows
        detached: false,  // Windows doesn't support detached well
        stdio: ['pipe', 'pipe', 'pipe']  // Explicit stdio configuration
      };
      
      console.log(`🚀 Spawning claude process with options:`, {
        cwd: spawnOptions.cwd,
        claudePath: CLAUDE_PATH,
        args: args
      });
      
      const claudeProcess = spawn(CLAUDE_PATH, args, spawnOptions);
      
      // Mark spawning as complete after a short delay
      setTimeout(() => {
        isSpawningProcess = false;
      }, 500);

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
          // Only mark as generated after successful generation
          generateTitle(sessionId, textContent, socket, () => {
            console.log(`🏷️ Title successfully generated for session ${sessionId}`);
            session.hasGeneratedTitle = true;
          });
          // Add retry logic if title generation fails
          setTimeout(() => {
            if (!session.hasGeneratedTitle) {
              console.log(`🏷️ Retrying title generation for session ${sessionId}`);
              generateTitle(sessionId, textContent, socket, () => {
                session.hasGeneratedTitle = true;
              });
            }
          }, 5000); // Retry after 5 seconds if first attempt fails
        } else {
          console.log(`🏷️ Skipping title generation - text too short: "${textContent}"`);
        }
      }

      // Process streaming output
      let lineBuffer = '';
      let messageCount = 0;
      let bytesReceived = 0;
      let lastDataTime = Date.now();
      let streamStartTime = Date.now();
      
      // Cleanup any existing health check for this session
      if (streamHealthChecks.has(sessionId)) {
        clearInterval(streamHealthChecks.get(sessionId));
      }
      if (streamTimeouts.has(sessionId)) {
        clearTimeout(streamTimeouts.get(sessionId));
      }
      
      // Log stream health check every 5 seconds
      const streamHealthInterval = setInterval(() => {
        const timeSinceLastData = Date.now() - lastDataTime;
        const streamDuration = Date.now() - streamStartTime;
        console.log(`🩺 STREAM HEALTH CHECK [${sessionId}]`);
        console.log(`   ├─ Stream duration: ${streamDuration}ms`);
        console.log(`   ├─ Time since last data: ${timeSinceLastData}ms`);
        console.log(`   ├─ Bytes received: ${bytesReceived}`);
        console.log(`   ├─ Messages processed: ${messageCount}`);
        console.log(`   ├─ Buffer size: ${lineBuffer.length}`);
        console.log(`   └─ Process alive: ${activeProcesses.has(sessionId)}`);
        
        if (timeSinceLastData > 30000) {
          console.error(`⚠️ WARNING: No data received for ${timeSinceLastData}ms!`);
          // Send keepalive to prevent client timeout
          socket.emit(`keepalive:${sessionId}`, { timestamp: Date.now() });
        }
        
        // If no data for 5 minutes, consider stream dead
        if (timeSinceLastData > 300000) {
          console.error(`💀 Stream appears dead after ${timeSinceLastData}ms, cleaning up`);
          if (activeProcesses.has(sessionId)) {
            const proc = activeProcesses.get(sessionId);
            proc.kill('SIGTERM');
            activeProcesses.delete(sessionId);
          }
          clearInterval(streamHealthInterval);
        }
      }, 5000);
      
      // Store health check interval for cleanup
      streamHealthChecks.set(sessionId, streamHealthInterval);
      
      // Set overall stream timeout (10 minutes max per stream)
      const streamTimeout = setTimeout(() => {
        console.warn(`⏰ Stream timeout reached for session ${sessionId} after 10 minutes`);
        if (activeProcesses.has(sessionId)) {
          const proc = activeProcesses.get(sessionId);
          console.log(`⏰ Terminating long-running process for ${sessionId}`);
          proc.kill('SIGTERM');
        }
      }, 600000); // 10 minutes
      streamTimeouts.set(sessionId, streamTimeout);
      
      const processStreamLine = (line) => {
        if (!line.trim()) {
          console.log(`🔸 [${sessionId}] Empty line received`);
          return;
        }
        
        console.log(`🔹 [${sessionId}] Processing line (${line.length} chars): ${line.substring(0, 100)}...`);
        
        try {
          const jsonData = JSON.parse(line);
          console.log(`📦 [${sessionId}] Message type: ${jsonData.type}${jsonData.subtype ? ` (${jsonData.subtype})` : ''}`);
          
          // Extract session ID if present (update it every time to ensure we have the latest)
          if (jsonData.session_id) {
            session.claudeSessionId = jsonData.session_id;
            console.log(`📌 [${sessionId}] Claude session ID: ${session.claudeSessionId}`);
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
                console.log(`📝 [${sessionId}] Emitting assistant message ${messageId} with streaming=true`);
                console.log(`📝 [${sessionId}] Content length: ${textContent.length} chars`);
                console.log(`📝 [${sessionId}] Content preview: ${textContent.substring(0, 100)}...`);
                socket.emit(`message:${sessionId}`, {
                  type: 'assistant',
                  id: messageId,
                  message: { content: textContent },
                  streaming: true,
                  timestamp: Date.now()
                });
              }
            }
            
          } else if (jsonData.type === 'tool_use') {
            // Tool use message from Claude
            socket.emit(`message:${sessionId}`, {
              type: 'tool_use',
              message: jsonData.message,
              timestamp: Date.now(),
              id: `tool-${sessionId}-${Date.now()}`
            });
            
          } else if (jsonData.type === 'tool_result') {
            // Tool result from Claude
            socket.emit(`message:${sessionId}`, {
              type: 'tool_result',
              message: jsonData.message,
              timestamp: Date.now()
            });
            
          } else if (jsonData.type === 'result') {
            // Final result - MARK STREAMING AS COMPLETE
            console.log(`🏁 [${sessionId}] RESULT message received - marking stream as complete`);
            
            // Clear the streaming state for any tracked assistant message
            const lastAssistantMessageId = lastAssistantMessageIds.get(sessionId);
            if (lastAssistantMessageId) {
              console.log(`🔴 Marking assistant message ${lastAssistantMessageId} as streaming=false`);
              // Emit an update to mark the last assistant message as no longer streaming
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
              subtype: jsonData.subtype,
              message: jsonData.message,
              result: jsonData.result,
              is_error: jsonData.is_error,
              usage: jsonData.usage,
              timestamp: Date.now()
            });
            
          } else if (jsonData.type === 'user') {
            // Echo user message back (shouldn't happen in stream mode)
            socket.emit(`message:${sessionId}`, {
              type: 'user',
              message: jsonData.message,
              timestamp: Date.now()
            });
            
          } else {
            // Unknown message type - send as-is
            console.log(`❓ [${sessionId}] Unknown message type, forwarding as-is:`, jsonData.type);
            socket.emit(`message:${sessionId}`, {
              ...jsonData,
              timestamp: Date.now()
            });
          }
          
          messageCount++;
        } catch (e) {
          console.error(`[${sessionId}] Failed to parse line:`, e);
          console.error(`[${sessionId}] Line was:`, line);
        }
      };
      
      // Handle stdout
      claudeProcess.stdout.on('data', (data) => {
        const str = data.toString();
        bytesReceived += data.length;
        lastDataTime = Date.now();
        
        console.log(`📥 [${sessionId}] STDOUT received: ${str.length} bytes (total: ${bytesReceived})`);
        console.log(`📥 [${sessionId}] Data preview: ${str.substring(0, 200).replace(/\n/g, '\\n')}...`);
        
        // Prevent memory overflow from excessive buffering
        if (lineBuffer.length > MAX_LINE_BUFFER_SIZE) {
          console.error(`⚠️ [${sessionId}] Line buffer overflow (${lineBuffer.length} bytes), processing and clearing`);
          // Try to process what we have
          const lines = lineBuffer.split('\n');
          console.log(`⚠️ [${sessionId}] Processing ${lines.length} buffered lines`);
          for (const line of lines) {
            if (line.trim()) {
              try {
                processStreamLine(line);
              } catch (e) {
                console.error(`[${sessionId}] Failed to process line during overflow:`, e);
              }
            }
          }
          lineBuffer = '';
        }
        
        lineBuffer += str;
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() || '';
        
        console.log(`📋 [${sessionId}] Split into ${lines.length} lines, buffer remaining: ${lineBuffer.length} chars`);
        
        for (let i = 0; i < lines.length; i++) {
          console.log(`📋 [${sessionId}] Processing line ${i + 1}/${lines.length}`);
          processStreamLine(lines[i]);
        }
      });

      // Handle stderr
      claudeProcess.stderr.on('data', (data) => {
        const error = data.toString();
        console.error(`⚠️ [${sessionId}] Claude stderr (${data.length} bytes):`, error);
        lastDataTime = Date.now();
        socket.emit(`message:${sessionId}`, { 
          type: 'error',
          error, 
          claudeSessionId: session.claudeSessionId,
          streaming: false 
        });
      });

      // Handle process exit
      claudeProcess.on('close', (code) => {
        // Clean up all tracking for this session
        if (streamHealthChecks.has(sessionId)) {
          clearInterval(streamHealthChecks.get(sessionId));
          streamHealthChecks.delete(sessionId);
        }
        if (streamTimeouts.has(sessionId)) {
          clearTimeout(streamTimeouts.get(sessionId));
          streamTimeouts.delete(sessionId);
        }
        clearInterval(streamHealthInterval);
        const streamDuration = Date.now() - streamStartTime;
        console.log(`👋 [${sessionId}] Claude process exited with code ${code}`);
        console.log(`📊 [${sessionId}] STREAM SUMMARY:`);
        console.log(`   ├─ Total duration: ${streamDuration}ms`);
        console.log(`   ├─ Total bytes: ${bytesReceived}`);
        console.log(`   ├─ Messages: ${messageCount}`);
        console.log(`   └─ Exit code: ${code}`);
        activeProcesses.delete(sessionId);
        
        // Mark session as completed (not interrupted) when process exits normally
        if (code === 0) {
          const session = sessions.get(sessionId);
          if (session) {
            session.wasInterrupted = false;
            console.log(`✅ Marked session ${sessionId} as completed normally`);
          }
        }
        
        // Process any remaining buffer
        if (lineBuffer.trim()) {
          try {
            processStreamLine(lineBuffer);
          } catch (e) {
            console.error('Failed to process remaining buffer:', e);
          }
        }
        
        // ALWAYS clear streaming state on process exit - send complete message update
        const lastAssistantMessageId = lastAssistantMessageIds.get(sessionId);
        if (lastAssistantMessageId) {
          console.log(`🔴 Forcing streaming=false for assistant message ${lastAssistantMessageId} on process exit`);
          // Get the last assistant message to preserve its content
          const session = sessions.get(sessionId);
          const lastAssistantMsg = session?.messages.find(m => m.id === lastAssistantMessageId);
          
          socket.emit(`message:${sessionId}`, {
            type: 'assistant',
            id: lastAssistantMessageId,
            message: lastAssistantMsg?.message || { content: '' },
            streaming: false,
            timestamp: Date.now()
          });
          lastAssistantMessageIds.delete(sessionId);
        }
        
        // Always ensure streaming is marked as false for all messages
        socket.emit(`message:${sessionId}`, {
          type: 'system',
          subtype: 'stream_end',
          streaming: false,
          timestamp: Date.now()
        });
        
        // Handle unexpected exit codes
        if (code === null || code === -2 || code === 'SIGKILL') {
          console.error(`⚠️ Claude process terminated unexpectedly (code: ${code})`);
          socket.emit(`message:${sessionId}`, {
            type: 'error',
            error: 'session terminated unexpectedly. you can resume by sending another message.',
            streaming: false,
            timestamp: Date.now()
          });
        } else if (code !== 0) {
          console.error(`Claude process failed with exit code ${code}`);
          socket.emit(`message:${sessionId}`, {
            type: 'system',
            subtype: 'info',
            message: `process completed with code ${code}`,
            timestamp: Date.now()
          });
        }
      });

      // Handle process errors
      claudeProcess.on('error', (err) => {
        // Clean up all tracking for this session
        if (streamHealthChecks.has(sessionId)) {
          clearInterval(streamHealthChecks.get(sessionId));
          streamHealthChecks.delete(sessionId);
        }
        if (streamTimeouts.has(sessionId)) {
          clearTimeout(streamTimeouts.get(sessionId));
          streamTimeouts.delete(sessionId);
        }
        clearInterval(streamHealthInterval);
        console.error(`❌ [${sessionId}] Failed to spawn claude:`, err);
        console.error(`❌ [${sessionId}] Error details:`, {
          message: err.message,
          code: err.code,
          syscall: err.syscall,
          path: err.path
        });
        
        // Clean up any streaming state - send complete message update
        const lastAssistantMessageId = lastAssistantMessageIds.get(sessionId);
        if (lastAssistantMessageId) {
          console.log(`🔴 Forcing streaming=false for assistant message ${lastAssistantMessageId} on process error`);
          const session = sessions.get(sessionId);
          const lastAssistantMsg = session?.messages.find(m => m.id === lastAssistantMessageId);
          
          socket.emit(`message:${sessionId}`, {
            type: 'assistant',
            id: lastAssistantMessageId,
            message: lastAssistantMsg?.message || { content: '' },
            streaming: false,
            timestamp: Date.now()
          });
          lastAssistantMessageIds.delete(sessionId);
        }
        
        activeProcesses.delete(sessionId);
        
        // Send appropriate error message based on error type
        let errorMessage = 'Failed to start Claude CLI. ';
        if (err.code === 'ENOENT') {
          errorMessage += 'Claude CLI not found. Please ensure claude is installed and in PATH.';
        } else if (err.code === 'EACCES') {
          errorMessage += 'Permission denied. Please check file permissions.';
        } else {
          errorMessage += err.message;
        }
        
        socket.emit(`message:${sessionId}`, { 
          type: 'error',
          error: errorMessage,
          streaming: false,
          timestamp: Date.now()
        });
      });
      
    } catch (err) {
      console.error('Failed to spawn Claude process:', err);
      
      // Clean up tracking
      lastAssistantMessageIds.delete(sessionId);
      
      socket.emit(`message:${sessionId}`, { 
        type: 'error', 
        error: err.message || 'Failed to start Claude process',
        streaming: false 
      });
    }
  });
  
  socket.on('interrupt', ({ sessionId }, callback) => {
    console.log(`⛔ Interrupt request for session ${sessionId}`);
    const process = activeProcesses.get(sessionId);
    
    if (process) {
      console.log(`🛑 Killing process for session ${sessionId}`);
      
      // Mark session as interrupted
      const session = sessions.get(sessionId);
      if (session) {
        session.wasInterrupted = true;
        console.log(`⚠️ Marked session ${sessionId} as interrupted`);
      }
      
      // Kill the process on Windows
      process.kill('SIGTERM');
      activeProcesses.delete(sessionId);
      
      // Clear any streaming state for this session - send complete message update
      const lastAssistantMessageId = lastAssistantMessageIds.get(sessionId);
      if (lastAssistantMessageId) {
        console.log(`🔴 Forcing streaming=false for assistant message ${lastAssistantMessageId} on interrupt`);
        // Get the last assistant message to preserve its content
        const lastAssistantMsg = session?.messages.find(m => m.id === lastAssistantMessageId);
        
        socket.emit(`message:${sessionId}`, {
          type: 'assistant',
          id: lastAssistantMessageId,
          message: lastAssistantMsg?.message || { content: '' },
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
    session.claudeSessionId = undefined;
    session.hasGeneratedTitle = false;
    session.wasInterrupted = false;
    
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
    // Clean up any processes and intervals associated with this socket
    for (const [sessionId, session] of sessions.entries()) {
      if (session.socketId === socket.id) {
        // Clean up health checks and timeouts
        if (streamHealthChecks.has(sessionId)) {
          clearInterval(streamHealthChecks.get(sessionId));
          streamHealthChecks.delete(sessionId);
        }
        if (streamTimeouts.has(sessionId)) {
          clearTimeout(streamTimeouts.get(sessionId));
          streamTimeouts.delete(sessionId);
        }
        
        const process = activeProcesses.get(sessionId);
        if (process) {
          console.log(`🧹 Cleaning up process for session ${sessionId}`);
          process.kill('SIGINT');
          activeProcesses.delete(sessionId);
        }
      }
    }
  });
});

// Start server with error handling
httpServer.listen(PORT, () => {
  writePidFile();
  console.log(`🚀 Windows Claude CLI server running on port ${PORT}`);
  console.log(`🤖 Claude CLI: ${CLAUDE_PATH}`);
  console.log(`📁 PID file: ${PID_FILE}`);
  console.log(`📂 Working directory: ${process.cwd()}`);
  console.log(`🖥️ Platform: ${platform()}`);
  console.log(`🏠 Home directory: ${homedir()}`);
  console.log(`✅ Server hardened for multiple concurrent sessions`);
});

// Handle port already in use error
httpServer.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use`);
    console.log('Attempting to kill existing process and retry...');
    
    // Try to kill any existing Node.js servers on this port (Windows)
    const { exec } = require('child_process');
    exec(`netstat -ano | findstr :${PORT}`, (err, stdout) => {
      if (!err && stdout) {
        const lines = stdout.trim().split('\n');
        const pids = new Set();
        lines.forEach(line => {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && !isNaN(pid)) pids.add(pid);
        });
        
        if (pids.size > 0) {
          pids.forEach(pid => {
            exec(`taskkill /F /PID ${pid}`, (killErr) => {
              if (!killErr) console.log(`Killed process ${pid}`);
            });
          });
          console.log('Killed existing processes, retrying in 1 second...');
          setTimeout(() => {
            httpServer.listen(PORT);
          }, 1000);
        } else {
          console.error('Failed to find process. Please restart the app.');
          process.exit(1);
        }
      } else {
        console.error('Failed to check for existing process. Please restart the app.');
        process.exit(1);
      }
    });
  } else {
    console.error('Server error:', error);
    process.exit(1);
  }
});

// Clean up on exit
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  
  // Kill all active Claude processes
  for (const [sessionId, process] of activeProcesses.entries()) {
    console.log(`Killing process for session ${sessionId}`);
    process.kill('SIGINT');
  }
  
  // Clean up all intervals and timeouts
  for (const interval of streamHealthChecks.values()) {
    clearInterval(interval);
  }
  for (const timeout of streamTimeouts.values()) {
    clearTimeout(timeout);
  }
  
  // Remove PID file
  try {
    if (existsSync(PID_FILE)) {
      unlinkSync(PID_FILE);
      console.log(`📝 Removed PID file: ${PID_FILE}`);
    }
  } catch (e) {
    console.error('Failed to remove PID file:', e);
  }
  
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down...');
  process.exit(0);
});