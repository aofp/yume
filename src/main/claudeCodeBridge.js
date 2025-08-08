/**
 * Claude Code SDK Bridge for Electron Main Process
 * Runs the SDK in Node.js environment and communicates with renderer via IPC
 */

const { ipcMain } = require('electron');

// Import Claude Code SDK (works in Node.js)
let claudeCodeModule;
let sessions = new Map();
let messageQueues = new Map();

async function initializeClaudeCode() {
  try {
    // Dynamic import for ESM module
    claudeCodeModule = await import('@anthropic-ai/claude-code');
    console.log('✅ Claude Code SDK loaded in main process');
    return true;
  } catch (error) {
    console.error('Failed to load Claude Code SDK:', error);
    return false;
  }
}

// Initialize on startup
initializeClaudeCode();

// IPC Handlers for Claude Code SDK operations

ipcMain.handle('claudeCode:createSession', async (event, name, options) => {
  try {
    if (!claudeCodeModule) {
      await initializeClaudeCode();
    }
    
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Store session info
    sessions.set(sessionId, {
      id: sessionId,
      name,
      options: options || {},
      messages: [],
      status: 'active'
    });
    
    // Create message queue for this session
    messageQueues.set(sessionId, []);
    
    console.log(`Created Claude Code session: ${sessionId}`);
    return { success: true, sessionId };
    
  } catch (error) {
    console.error('Error creating session:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('claudeCode:sendMessage', async (event, sessionId, content) => {
  try {
    if (!claudeCodeModule) {
      throw new Error('Claude Code SDK not initialized');
    }
    
    const session = sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    // Use the query function from Claude Code SDK
    const { query } = claudeCodeModule;
    
    // Run query and collect results
    const messages = [];
    const queryResult = query({
      prompt: content,
      options: {
        ...session.options,
        maxTurns: 10,
        allowedTools: [
          'Read', 'Write', 'Edit', 'MultiEdit',
          'LS', 'Glob', 'Grep',
          'Bash',
          'WebFetch', 'WebSearch',
          'TodoWrite'
        ]
      }
    });
    
    // Stream messages back to renderer
    for await (const message of queryResult) {
      messages.push(message);
      
      // Send each message to renderer as it arrives
      event.sender.send(`claudeCode:message:${sessionId}`, message);
      
      // Store in session
      session.messages.push(message);
    }
    
    return { success: true, messages };
    
  } catch (error) {
    console.error('Error sending message:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('claudeCode:getSession', async (event, sessionId) => {
  const session = sessions.get(sessionId);
  return session || null;
});

ipcMain.handle('claudeCode:getAllSessions', async () => {
  return Array.from(sessions.values());
});

ipcMain.handle('claudeCode:pauseSession', async (event, sessionId) => {
  const session = sessions.get(sessionId);
  if (session) {
    session.status = 'paused';
    return { success: true };
  }
  return { success: false, error: 'Session not found' };
});

ipcMain.handle('claudeCode:resumeSession', async (event, sessionId) => {
  const session = sessions.get(sessionId);
  if (session) {
    session.status = 'active';
    return { success: true };
  }
  return { success: false, error: 'Session not found' };
});

ipcMain.handle('claudeCode:deleteSession', async (event, sessionId) => {
  if (sessions.delete(sessionId)) {
    messageQueues.delete(sessionId);
    return { success: true };
  }
  return { success: false, error: 'Session not found' };
});

module.exports = { initializeClaudeCode };