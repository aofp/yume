/**
 * Express server that runs Claude Code SDK in Node.js
 * Provides WebSocket connection for real-time streaming
 */

const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { Server } = require('socket.io');
const portfinder = require('portfinder');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*", // Allow all origins since port is dynamic
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Import Claude Code SDK
let claudeCodeModule;
let sessions = new Map();
let messageQueues = new Map(); // Track sent messages to prevent duplicates
let activeQueries = new Map(); // Track active queries for interruption
let claudeSessionIds = new Map(); // Track Claude Code SDK session IDs

// Session storage directory
const SESSION_DIR = path.join(os.homedir(), '.yurucode', 'sessions');

// Session persistence functions
const sessionStorage = {
  async ensureDirectory() {
    try {
      await fs.mkdir(SESSION_DIR, { recursive: true });
    } catch (error) {
      console.error('Failed to create session directory:', error);
    }
  },
  
  async saveSession(sessionId, sessionData) {
    try {
      await this.ensureDirectory();
      const filePath = path.join(SESSION_DIR, `${sessionId}.json`);
      const data = {
        id: sessionData.id,
        name: sessionData.name,
        workingDirectory: sessionData.workingDirectory,
        model: sessionData.model,
        messages: sessionData.messages || [],
        claudeSessionId: sessionData.claudeSessionId || null, // Save Claude SDK session ID
        createdAt: sessionData.createdAt || Date.now(),
        updatedAt: Date.now()
      };
      await fs.writeFile(filePath, JSON.stringify(data, null, 2));
      console.log(`💾 Saved session to disk: ${sessionId}`);
    } catch (error) {
      console.error(`Failed to save session ${sessionId}:`, error);
    }
  },
  
  async loadSession(sessionId) {
    try {
      const filePath = path.join(SESSION_DIR, `${sessionId}.json`);
      const data = await fs.readFile(filePath, 'utf8');
      const session = JSON.parse(data);
      console.log(`📂 Loaded session from disk: ${sessionId}`);
      return session;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error(`Failed to load session ${sessionId}:`, error);
      }
      return null;
    }
  },
  
  async listSessions() {
    try {
      await this.ensureDirectory();
      const files = await fs.readdir(SESSION_DIR);
      const sessions = [];
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const sessionId = file.replace('.json', '');
          const session = await this.loadSession(sessionId);
          if (session) {
            sessions.push({
              id: session.id,
              name: session.name,
              workingDirectory: session.workingDirectory,
              createdAt: session.createdAt,
              updatedAt: session.updatedAt,
              messageCount: session.messages?.length || 0
            });
          }
        }
      }
      
      return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
    } catch (error) {
      console.error('Failed to list sessions:', error);
      return [];
    }
  },
  
  async deleteSession(sessionId) {
    try {
      const filePath = path.join(SESSION_DIR, `${sessionId}.json`);
      await fs.unlink(filePath);
      console.log(`🗑️ Deleted session: ${sessionId}`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error(`Failed to delete session ${sessionId}:`, error);
      }
    }
  }
};

async function initializeClaudeCode() {
  try {
    claudeCodeModule = await import('@anthropic-ai/claude-code');
    console.log('✅ Claude Code SDK loaded successfully');
    console.log('📁 Working directory:', process.env.CLAUDE_CODE_CWD || process.cwd());
    console.log('🖥️ Platform:', process.platform);
    console.log('🔧 Node version:', process.version);
    console.log('📂 Node executable:', process.execPath);
    return true;
  } catch (error) {
    console.error('❌ Failed to load Claude Code SDK:', error);
    return false;
  }
}

// Initialize on startup
initializeClaudeCode();

// Clean up old sessions on server startup (sessions should be ephemeral)
(async () => {
  try {
    const sessionDir = path.join(os.homedir(), '.yurucode', 'sessions');
    if (fsSync.existsSync(sessionDir)) {
      const files = await fs.readdir(sessionDir);
      for (const file of files) {
        await fs.unlink(path.join(sessionDir, file));
      }
      console.log('🧹 Cleaned up old session files');
    }
  } catch (error) {
    console.log('Could not clean up sessions:', error);
  }
})();

// Socket.IO connection handler
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Create or resume a Claude Code session
  socket.on('createSession', async (data, callback) => {
    try {
      if (!claudeCodeModule) {
        await initializeClaudeCode();
      }

      let sessionId = data.sessionId;
      let existingSession = null;
      
      // Try to load existing session if sessionId provided
      if (sessionId) {
        existingSession = await sessionStorage.loadSession(sessionId);
        if (existingSession) {
          console.log(`📂 Resuming existing session: ${sessionId}`);
        }
      }
      
      // Generate new sessionId if needed
      if (!sessionId || !existingSession) {
        sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        console.log(`✨ Creating new session: ${sessionId}`);
      }
      
      const workingDirectory = data.workingDirectory || existingSession?.workingDirectory || process.env.CLAUDE_CODE_CWD || process.cwd();
      
      // Initialize Claude SDK session IMMEDIATELY if we don't have one
      let claudeSessionId = existingSession?.claudeSessionId || null;
      
      // Don't initialize Claude SDK session here - will be created on first message
      // This prevents the "/version" message from appearing in chat
      if (!claudeSessionId) {
        console.log('📝 Claude SDK session will be created on first message');
      }
      
      const sessionData = {
        id: sessionId,
        name: data.name || existingSession?.name || 'new session',
        socketId: socket.id,
        workingDirectory: workingDirectory,
        model: data.options?.model || existingSession?.model || 'claude-opus-4-1-20250805',
        messages: existingSession?.messages || [],
        messageIds: new Set(), // Track message IDs to prevent duplicates
        createdAt: existingSession?.createdAt || Date.now(),
        claudeSessionId: claudeSessionId // Store the Claude SDK session ID
      };
      
      sessions.set(sessionId, sessionData);
      messageQueues.set(sessionId, []);
      
      // Save session to disk
      await sessionStorage.saveSession(sessionId, sessionData);

      console.log(`✅ Session ready: ${sessionId}`);
      console.log(`📁 Working directory: ${workingDirectory}`);
      console.log(`📊 Existing messages: ${sessionData.messages.length}`);
      if (sessionData.claudeSessionId) {
        console.log(`🔄 Claude SDK session ready: ${sessionData.claudeSessionId}`);
      } else {
        console.log(`⚠️ No Claude SDK session - will create on first message`);
      }
      
      callback({ 
        success: true, 
        sessionId,
        messages: existingSession?.messages || [],
        workingDirectory,
        claudeSessionId: sessionData.claudeSessionId // Return Claude SDK session ID
      });
      
    } catch (error) {
      console.error('Error creating/resuming session:', error);
      callback({ success: false, error: error.message });
    }
  });

  // Get session history
  socket.on('getSessionHistory', async (data, callback) => {
    try {
      const { sessionId } = data;
      const session = await sessionStorage.loadSession(sessionId);
      
      if (session) {
        callback({ 
          success: true, 
          messages: session.messages || [],
          workingDirectory: session.workingDirectory
        });
      } else {
        callback({ success: false, error: 'Session not found' });
      }
    } catch (error) {
      console.error('Error getting session history:', error);
      callback({ success: false, error: error.message });
    }
  });

  // List all sessions
  socket.on('listSessions', async (callback) => {
    try {
      const sessionList = await sessionStorage.listSessions();
      callback({ success: true, sessions: sessionList });
    } catch (error) {
      console.error('Error listing sessions:', error);
      callback({ success: false, error: error.message });
    }
  });

  // Delete a session
  socket.on('deleteSession', async (data, callback) => {
    try {
      const { sessionId } = data;
      await sessionStorage.deleteSession(sessionId);
      sessions.delete(sessionId);
      messageQueues.delete(sessionId);
      callback({ success: true });
    } catch (error) {
      console.error('Error deleting session:', error);
      callback({ success: false, error: error.message });
    }
  });

  // Send a message to Claude Code
  socket.on('sendMessage', async (data, callback) => {
    try {
      if (!claudeCodeModule) {
        throw new Error('Claude Code SDK not initialized');
      }

      const { sessionId, content } = data;
      const session = sessions.get(sessionId);
      
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      console.log(`📝 Message for session ${sessionId}: ${content.substring(0, 50)}...`);

      // Add user message to session for persistence (but don't emit it)
      // First check if this exact message was already added recently (within 2 seconds)
      const recentDuplicate = session.messages.some(m => 
        m.type === 'user' && 
        m.message?.content === content &&
        Math.abs((m.timestamp || 0) - Date.now()) < 2000
      );
      
      if (!recentDuplicate) {
        const userMessage = {
          id: `user-${Date.now()}-${Math.random()}`,
          type: 'user',
          message: { content },
          timestamp: Date.now()
        };
        session.messages.push(userMessage);
        console.log(`📝 Added user message to session storage`);
      } else {
        console.log(`⚠️ Skipping duplicate user message`);
      }

      const { query } = claudeCodeModule;
      
      // Use session's working directory
      let workingDir = session.workingDirectory || process.env.CLAUDE_CODE_CWD || process.cwd();
      
      // Keep the original Windows path for process.chdir
      const originalWorkingDir = workingDir;
      
      // Only convert to WSL path if we're running in WSL
      let claudeWorkingDir = workingDir;
      if (process.platform === 'linux' && workingDir.match(/^[A-Z]:\\/)) {
        // Convert C:\path\to\dir to /mnt/c/path/to/dir for Claude SDK in WSL
        const driveLetter = workingDir[0].toLowerCase();
        const pathWithoutDrive = workingDir.substring(2).replace(/\\/g, '/');
        claudeWorkingDir = `/mnt/${driveLetter}${pathWithoutDrive}`;
        console.log(`📂 Will use WSL path for Claude SDK: ${claudeWorkingDir}`);
      }
      
      // Don't change process directory - just pass cwd to Claude SDK
      // This avoids issues with node executable path resolution
      console.log(`📁 Will use directory: ${originalWorkingDir}`);
      
      // Use process.env as-is since we're running in WSL
      const sdkEnv = {
        ...process.env
      };
      
      // Find the CLI path
      console.log(`🔧 __dirname: ${__dirname}`);
      console.log(`🔧 process.platform: ${process.platform}`);
      console.log(`🔧 process.cwd(): ${process.cwd()}`);
      
      let cliPath = path.join(__dirname, 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js');
      console.log(`🔧 Initial CLI path: ${cliPath}`);
      
      const queryOptions = {
        maxTurns: 10,
        model: session.model || 'claude-opus-4-1-20250805',
        allowedTools: [
          'Read', 'Write', 'Edit', 'MultiEdit',
          'LS', 'Glob', 'Grep',
          'Bash',
          'WebFetch', 'WebSearch',
          'TodoWrite'
        ],
        // DO NOT USE apiKey - Claude Code SDK uses your subscription authentication
        cwd: claudeWorkingDir,  // Use the WSL-converted path for Claude SDK
        env: sdkEnv,
        pathToClaudeCodeExecutable: cliPath,
        // Use correct executable based on platform
        executable: process.platform === 'linux' ? '/usr/bin/node' : process.execPath,
        executableArgs: []
      };
      
      console.log(`🔧 Query options CWD: ${queryOptions.cwd}`);
      console.log(`🔧 CLI path: ${cliPath}`);
      console.log(`🔧 Using executable: ${queryOptions.executable}`);
      
      // CRITICAL: Resume existing Claude SDK session if we have one
      if (session.claudeSessionId) {
        console.log(`📌 Resuming Claude SDK session: ${session.claudeSessionId}`);
        queryOptions.resume = session.claudeSessionId;
      } else {
        console.log('🆕 Starting new Claude SDK session');
      }
      
      // Run the query with Claude Code SDK - correct API signature
      let queryResult;
      try {
        console.log('🚀 Attempting to start Claude Code query...');
        
        // Try using the SDK
        queryResult = query({
          prompt: content,
          options: queryOptions
        });
        
        console.log('✅ Claude Code query started successfully');
      } catch (queryError) {
        console.error('❌ Failed to start Claude Code query:', queryError);
        throw new Error(`Failed to spawn Claude Code process: ${queryError.message}`);
      }

      // Store the query iterator for potential interruption
      activeQueries.set(sessionId, { iterator: queryResult, interrupted: false });
      
      let messageBuffer = [];
      let currentMessage = null;
      let messageId = 0;
      let lastAssistantMessageId = null;
      let assistantMessageStarted = false;
      
      // Stream messages back to client
      let claudeSdkSessionId = null;
      for await (const message of queryResult) {
        // Debug: Log the raw message structure
        console.log(`📦 Raw message type: ${message.type}, content type: ${typeof message.message?.content}, content: ${JSON.stringify(message.message?.content || message.content || message).substring(0, 200)}...`);
        
        // Check if query was interrupted
        const queryState = activeQueries.get(sessionId);
        if (queryState?.interrupted) {
          console.log(`⛔ Stopping query for session ${sessionId} due to interruption`);
          break;
        }
        
        // Extract Claude SDK session ID from any message that has it
        if (message.session_id) {
          claudeSdkSessionId = message.session_id;
          console.log(`📌 Got Claude SDK session ID from ${message.type}: ${claudeSdkSessionId}`);
        }
        // Also check in message.message for nested session_id
        if (message.message?.session_id) {
          claudeSdkSessionId = message.message.session_id;
          console.log(`📌 Got Claude SDK session ID from ${message.type}.message: ${claudeSdkSessionId}`);
        }
        
        // Handle user messages that contain tool_results
        if (message.type === 'user') {
          // Check if this user message contains tool_results
          const content = message.message?.content || message.content || [];
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'tool_result') {
                // Send tool_result as a separate message
                const toolResultMessage = {
                  type: 'tool_result',
                  message: {
                    tool_use_id: block.tool_use_id,
                    content: block.content,
                    is_error: block.is_error
                  },
                  timestamp: Date.now(),
                  streaming: false,
                  id: `${sessionId}-toolresult-${Date.now()}-${messageId++}`
                };
                console.log(`📊 TOOL RESULT for ${block.tool_use_id}: ${block.content?.substring(0, 100)}...`);
                socket.emit(`message:${sessionId}`, toolResultMessage);
                session.messages.push(toolResultMessage);
              }
            }
          }
          console.log('Processed user message for tool_results');
          continue;
        }
        
        // Generate unique ID for this message (not used for assistant messages)
        const msgId = `${sessionId}-${Date.now()}-${messageId++}`;
        
        // Skip duplicate checking for assistant messages (they use stable IDs)
        if (message.type !== 'assistant') {
          // Check if we've already sent this exact message (prevent duplicates)
          if (session.messageIds.has(msgId)) {
            continue;
          }
          
          session.messageIds.add(msgId);
        }
        
        // Filter out "session started" and other system messages we don't want
        if (message.type === 'system') {
          const content = message.message?.content || message.content || '';
          if (content.toLowerCase().includes('session started') || 
              content.toLowerCase().includes('session starting')) {
            console.log(`📝 Filtering out system message: ${content.substring(0, 50)}...`);
            continue;
          }
        }
        
        // Handle different message types for proper streaming
        if (message.type === 'assistant') {
          // Parse content array to find tool_use blocks
          const content = message.message?.content || message.content || [];
          const hasToolUse = Array.isArray(content) && content.some(block => block.type === 'tool_use');
          
          // If content has tool_use blocks, send them as separate messages
          if (hasToolUse && Array.isArray(content)) {
            // First, finalize any existing assistant message
            if (currentMessage && currentMessage.type === 'assistant') {
              socket.emit(`message:${sessionId}`, {
                ...currentMessage,
                streaming: false,
                id: lastAssistantMessageId
              });
              session.messages.push(currentMessage);
              currentMessage = null;
            }
            
            // Send each tool_use as a separate message
            for (const block of content) {
              if (block.type === 'tool_use') {
                const toolMessage = {
                  type: 'tool_use',
                  message: {
                    name: block.name,
                    input: block.input,
                    id: block.id
                  },
                  timestamp: Date.now(),
                  streaming: false,
                  id: `${sessionId}-tool-${Date.now()}-${messageId++}`
                };
                console.log(`🔧 TOOL USE: ${block.name} - sending as separate message`);
                socket.emit(`message:${sessionId}`, toolMessage);
                session.messages.push(toolMessage);
              } else if (block.type === 'text' && block.text) {
                // Start a new assistant message for text content
                currentMessage = {
                  type: 'assistant',
                  message: { content: block.text },
                  timestamp: Date.now()
                };
                lastAssistantMessageId = `${sessionId}-assistant-${Date.now()}-${messageId++}`;
                socket.emit(`message:${sessionId}`, {
                  ...currentMessage,
                  streaming: true,
                  id: lastAssistantMessageId
                });
              }
            }
          } else {
            // Regular assistant message handling
            if (!currentMessage || currentMessage.type !== 'assistant') {
              // Start new assistant message
              currentMessage = { ...message };
              lastAssistantMessageId = `${sessionId}-assistant-${Date.now()}-${messageId++}`;
              console.log(`🔷 Starting new assistant message with ID: ${lastAssistantMessageId}`);
            } else {
              // Update existing assistant message content
              if (message.message?.content || message.content) {
                const newContent = message.message?.content || message.content;
                currentMessage.message = currentMessage.message || {};
                currentMessage.message.content = newContent;
              }
            }
            
            // Emit with the same ID to update the existing message
            socket.emit(`message:${sessionId}`, {
              ...currentMessage,
              streaming: true,
              id: lastAssistantMessageId
            });
          }
          
        } else if (message.type === 'tool_use') {
          // TOOL USE - Send immediately with full details
          if (currentMessage) {
            // Finalize any assistant message first
            const finalId = currentMessage.type === 'assistant' && lastAssistantMessageId 
              ? lastAssistantMessageId 
              : `${sessionId}-final-${messageId++}`;
            socket.emit(`message:${sessionId}`, {
              ...currentMessage,
              streaming: false,
              id: finalId
            });
            session.messages.push(currentMessage);
            currentMessage = null;
          }
          
          // Send tool use with full content
          const toolMessage = {
            type: 'tool_use',
            message: message.message || message,
            timestamp: Date.now(),
            streaming: false,
            id: msgId
          };
          console.log(`🔧 TOOL USE: ${message.message?.name || 'unknown'} - sending to client`);
          socket.emit(`message:${sessionId}`, toolMessage);
          session.messages.push(toolMessage);
          
        } else if (message.type === 'tool_result') {
          // TOOL RESULT - Send immediately with full output
          const toolResultMessage = {
            type: 'tool_result',
            message: message.message || message,
            timestamp: Date.now(),
            streaming: false,
            id: msgId
          };
          console.log(`📊 TOOL RESULT: ${JSON.stringify(toolResultMessage.message).substring(0, 100)}...`);
          socket.emit(`message:${sessionId}`, toolResultMessage);
          session.messages.push(toolResultMessage);
          
        } else if (message.type === 'result') {
          // RESULT message - Forward with all usage data
          if (currentMessage) {
            // Finalize any assistant message first
            const finalId = currentMessage.type === 'assistant' && lastAssistantMessageId 
              ? lastAssistantMessageId 
              : `${sessionId}-final-${messageId++}`;
            socket.emit(`message:${sessionId}`, {
              ...currentMessage,
              streaming: false,
              id: finalId
            });
            session.messages.push(currentMessage);
            currentMessage = null;
          }
          
          // Send result message with all data
          const resultMessage = {
            ...message,
            streaming: false,
            id: msgId
          };
          console.log(`📊 RESULT message with usage:`, message.usage);
          socket.emit(`message:${sessionId}`, resultMessage);
          session.messages.push(resultMessage);
          
        } else {
          // For other non-assistant messages, emit immediately
          if (currentMessage) {
            // Finalize any assistant message first with THE SAME ID
            const finalId = currentMessage.type === 'assistant' && lastAssistantMessageId 
              ? lastAssistantMessageId 
              : `${sessionId}-final-${messageId++}`;
            socket.emit(`message:${sessionId}`, {
              ...currentMessage,
              streaming: false,
              id: finalId
            });
            session.messages.push(currentMessage);
            currentMessage = null;
          }
          
          // Send the other message
          socket.emit(`message:${sessionId}`, {
            ...message,
            streaming: false,
            id: msgId
          });
          session.messages.push(message);
        }
        
        // Log non-assistant messages (assistant messages are logged separately)
        if (message.type !== 'assistant') {
          console.log(`📤 Sent message type: ${message.type} (${msgId})`);
        }
      }
      
      // Send any remaining message with streaming: false
      if (currentMessage) {
        const finalId = currentMessage.type === 'assistant' && lastAssistantMessageId 
          ? lastAssistantMessageId 
          : `${sessionId}-${Date.now()}-final`;
        console.log(`📤 Finalizing message type: ${currentMessage.type} with ID: ${finalId}`);
        socket.emit(`message:${sessionId}`, {
          ...currentMessage,
          streaming: false,
          id: finalId
        });
        // Add the final message to session storage only if not already added
        const alreadyAdded = session.messages.some(m => m.id === finalId);
        if (!alreadyAdded) {
          session.messages.push({ ...currentMessage, id: finalId });
        }
      }
      
      // Store the Claude SDK session ID if we got one
      if (claudeSdkSessionId) {
        if (!session.claudeSessionId) {
          session.claudeSessionId = claudeSdkSessionId;
          console.log(`💾 Storing NEW Claude SDK session ID for future use: ${claudeSdkSessionId}`);
        } else if (session.claudeSessionId !== claudeSdkSessionId) {
          console.log(`⚠️ Session ID mismatch! Had: ${session.claudeSessionId}, Got: ${claudeSdkSessionId}`);
          session.claudeSessionId = claudeSdkSessionId;
        } else {
          console.log(`✅ Session ID matches: ${claudeSdkSessionId}`);
        }
      } else {
        console.log('⚠️ No Claude SDK session ID found in response messages');
      }
      
      // Save session to disk after message exchange
      await sessionStorage.saveSession(sessionId, session);
      
      // Clean up and send completion message
      const wasInterrupted = activeQueries.get(sessionId)?.interrupted;
      activeQueries.delete(sessionId);
      
      // Only send a synthetic result message if we didn't get one from the SDK
      const hasResultMessage = session.messages.some(m => m.type === 'result');
      if (!hasResultMessage) {
        // ALWAYS send result message to stop streaming indicator
        const resultMessage = {
          type: 'result',
          id: `${sessionId}-result-${Date.now()}`,
          sessionId,
          streaming: false,
          interrupted: wasInterrupted || false,
          timestamp: Date.now()
        };
        console.log(`📊 Sending synthetic result message for session ${sessionId} (no SDK result)`);
        socket.emit(`message:${sessionId}`, resultMessage);
        session.messages.push(resultMessage);
      } else {
        console.log(`📊 Session ${sessionId} already has result message from SDK`);
      }
      
      // Save final state to disk
      await sessionStorage.saveSession(sessionId, session);

      callback({ success: true });
      
    } catch (error) {
      console.error('Error sending message:', error);
      
      // Clean up on error (sessionId might not be defined in all error cases)
      if (typeof sessionId !== 'undefined') {
        activeQueries.delete(sessionId);
        
        // Only send error messages if we have a sessionId
        socket.emit(`message:${sessionId}`, {
          type: 'system',
          subtype: 'error',
          message: error.message,
          timestamp: Date.now()
        });
        
        socket.emit(`message:${sessionId}`, {
          type: 'result',
          id: `${sessionId}-error-result-${Date.now()}`,
          sessionId,
          streaming: false,
          error: true,
          timestamp: Date.now()
        });
      }
      
      callback({ success: false, error: error.message });
    }
  });

  // Update session working directory
  socket.on('setWorkingDirectory', async (data, callback) => {
    try {
      const { sessionId, directory } = data;
      const session = sessions.get(sessionId);
      
      if (session) {
        session.workingDirectory = directory;
        console.log(`📁 Updated directory for ${sessionId}: ${directory}`);
        callback({ success: true });
      } else {
        callback({ success: false, error: 'Session not found' });
      }
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  });

  // Handle interrupt/stop request
  socket.on('interrupt', (data, callback) => {
    const sessionId = data?.sessionId || data;
    console.log(`⛔ Interrupt requested for session ${sessionId}`);
    
    const activeQuery = activeQueries.get(sessionId);
    if (activeQuery) {
      // Mark query as interrupted
      activeQuery.interrupted = true;
      
      // Send interruption message
      socket.emit(`message:${sessionId}`, {
        type: 'system',
        subtype: 'interrupted',
        message: 'task interrupted by user',
        timestamp: Date.now()
      });
      
      if (callback) callback({ success: true });
    } else {
      if (callback) callback({ success: false, error: 'No active query' });
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// REST API endpoints for session management
app.get('/api/sessions', async (req, res) => {
  try {
    const sessionList = await sessionStorage.listSessions();
    res.json({ success: true, sessions: sessionList });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/sessions/:sessionId', async (req, res) => {
  try {
    const session = await sessionStorage.loadSession(req.params.sessionId);
    if (session) {
      res.json({ success: true, session });
    } else {
      res.status(404).json({ success: false, error: 'Session not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/sessions/:sessionId', async (req, res) => {
  try {
    await sessionStorage.deleteSession(req.params.sessionId);
    sessions.delete(req.params.sessionId);
    messageQueues.delete(req.params.sessionId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check endpoint (less verbose)
let lastHealthCheck = 0;
app.get('/health', (req, res) => {
  const now = Date.now();
  // Only log every 30 seconds
  if (now - lastHealthCheck > 30000) {
    console.log('Health check:', { 
      claudeCodeLoaded: !!claudeCodeModule,
      sessions: sessions.size,
      cwd: process.env.CLAUDE_CODE_CWD || process.cwd()
    });
    lastHealthCheck = now;
  }
  
  res.json({ 
    status: 'ok', 
    claudeCodeLoaded: !!claudeCodeModule,
    sessions: sessions.size,
    workingDirectory: process.env.CLAUDE_CODE_CWD || process.cwd()
  });
});

// Always use port 3001 for simplicity
const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Claude Code Server running on http://0.0.0.0:${PORT}`);
  console.log(`🔑 Claude Code SDK will use your subscription authentication`);
  
  // Send port to parent process if running as child
  if (process.send) {
    process.send({ type: 'server-ready', port: PORT });
  }
});

// Cleanup on exit
async function cleanup() {
  console.log('🛑 Server shutting down...');
  
  // Clean up all active Claude SDK queries
  for (const [sessionId, query] of activeQueries) {
    console.log(`Stopping query for session ${sessionId}`);
    query.interrupted = true;
  }
  activeQueries.clear();
  
  // Clear all sessions
  sessions.clear();
  
  // Delete session files (sessions are ephemeral)
  try {
    const sessionDir = path.join(os.homedir(), '.yurucode', 'sessions');
    if (fsSync.existsSync(sessionDir)) {
      const files = await fs.readdir(sessionDir);
      for (const file of files) {
        await fs.unlink(path.join(sessionDir, file));
      }
      console.log('🧹 Cleaned up session files');
    }
  } catch (error) {
    console.log('Could not clean up session files:', error);
  }
  
  console.log('✅ Cleanup complete');
  process.exit(0);
}

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);
process.on('beforeExit', cleanup);