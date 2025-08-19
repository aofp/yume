/**
 * Socket.IO client that connects to Claude Code server
 * Gets REAL responses from Claude Code SDK
 */

import { io, Socket } from 'socket.io-client';
import platformAPI, { isTauri } from './tauriApi';

export class ClaudeCodeClient {
  private socket: Socket | null = null;
  private connected = false;
  private messageHandlers = new Map<string, (message: any) => void>();
  private serverPort: number | null = null;
  public connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error' = 'connecting';
  public connectionError: string | null = null;
  public connectionAttempts = 0;
  public debugLog: string[] = [];
  private connectionStartTime = Date.now();

  constructor() {
    console.log('[ClaudeCodeClient] Initializing...');
    console.log('[ClaudeCodeClient] Is Tauri:', isTauri());
    console.log('[ClaudeCodeClient] Window location:', window.location.href);
    
    // Only auto-connect if not in Tauri, or if server is available
    if (!isTauri()) {
      this.discoverAndConnect();
    } else {
      // In Tauri, check if server is available first
      this.checkServerAndConnect();
    }
  }
  
  private async checkServerAndConnect() {
    // Get dynamic port from Tauri backend
    console.log('[ClaudeCodeClient] Getting server port from Tauri...');
    
    let retries = 10; // Try 10 times
    const retryDelay = 1000; // 1 second between retries
    
    const tryConnect = async () => {
      try {
        // Get the dynamic port from Tauri
        const port = await platformAPI.claude.getServerPort();
        console.log('[ClaudeCodeClient] Got server port from Tauri:', port);
        this.serverPort = port;
        
        // Check if server is ready
        const response = await fetch(`http://localhost:${port}/health`, {
          signal: AbortSignal.timeout(2000)
        });
        if (response.ok) {
          console.log('[ClaudeCodeClient] Server health check OK on port', port);
          this.connect();
          return true;
        } else {
          console.error('[ClaudeCodeClient] Server health check failed:', response.status);
          return false;
        }
      } catch (err) {
        console.error('[ClaudeCodeClient] Error in tryConnect:', err);
        console.log('[ClaudeCodeClient] Server not ready yet, retrying...', retries, 'attempts left');
        return false;
      }
    };
    
    // Keep trying until success or max retries
    while (retries > 0) {
      if (await tryConnect()) {
        return; // Success!
      }
      retries--;
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
    
    console.error('[ClaudeCodeClient] Server health check failed after all retries');
    console.log('📡 Node.js server not available. Please check the server console.');
  }

  private async discoverAndConnect() {
    console.log('[ClaudeCodeClient] Starting server discovery...');
    
    // For Tauri, get the dynamic port from the backend
    if (isTauri()) {
      console.log('[ClaudeCodeClient] Tauri mode - getting dynamic port...');
      try {
        const port = await platformAPI.claude.getServerPort();
        console.log('[ClaudeCodeClient] Got dynamic port from Tauri:', port);
        this.serverPort = port;
        this.connectWithRetry();
        return;
      } catch (err) {
        console.error('[ClaudeCodeClient] Failed to get server port from Tauri:', err);
        // Fall through to port discovery
      }
    }
    
    // Fallback: Try to discover running servers by checking multiple ports
    const portsToCheck = [3001, 3002, 3003, 3004, 3005];
    for (const port of portsToCheck) {
      try {
        const response = await fetch(`http://localhost:${port}/health`, { 
          signal: AbortSignal.timeout(1000) 
        });
        if (response.ok) {
          const data = await response.json();
          if (data.service === 'yurucode-claude') {
            this.serverPort = port;
            this.connectWithRetry();
            return;
          }
        }
      } catch (err) {
        // Port not available, continue
      }
    }
    
    // Default to 3001 if no server found
    this.serverPort = 3001;
    
    // Add retry logic for initial connection
    this.connectWithRetry();
  }
  
  private async connectWithRetry(retries = 10, delay = 1000) {
    console.log(`[ClaudeCodeClient] Connection attempt (${10 - retries + 1}/10) to port ${this.serverPort}`);
    
    // First check if server is responding
    try {
      const response = await fetch(`http://localhost:${this.serverPort}/health`);
      if (response.ok) {
        console.log('[ClaudeCodeClient] Health check passed, connecting...');
        this.connect();
        return;
      }
      console.warn('[ClaudeCodeClient] Health check failed:', response.status);
    } catch (err) {
      console.warn('[ClaudeCodeClient] Health check error:', err);
    }
    
    if (retries > 0) {
      console.log(`[ClaudeCodeClient] Retrying in ${delay}ms...`);
      setTimeout(() => {
        this.connectWithRetry(retries - 1, Math.min(delay * 1.5, 5000));
      }, delay);
    } else {
      console.warn('[ClaudeCodeClient] Max retries reached, attempting direct connection');
      // Try to connect anyway - Socket.IO will keep retrying
      this.connect();
    }
  }

  private connect() {
    if (!this.serverPort) {
      console.error('[ClaudeCodeClient] No server port available');
      return;
    }
    
    const serverUrl = `http://localhost:${this.serverPort}`;
    console.log(`[ClaudeCodeClient] Connecting to ${serverUrl}`);
    
    // Connect to the Claude Code server with balanced retry settings
    this.socket = io(serverUrl, {
      reconnection: true,
      reconnectionAttempts: Infinity, // Keep trying forever
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      timeout: 60000, // 60 second connection timeout for long operations
      transports: ['websocket', 'polling'], // Try both transports
      autoConnect: true,
      forceNew: false // Reuse connection if possible
    });

    this.socket.on('connect', () => {
      const timestamp = new Date().toISOString();
      console.log(`[Client] ✅ [${timestamp}] Successfully connected to Claude Code server`);
      console.log('  Socket ID:', this.socket?.id);
      console.log('  Transport:', (this.socket as any)?.io?.engine?.transport?.name);
      console.log('  Server URL:', serverUrl);
      this.connected = true;
    });

    this.socket.on('disconnect', (reason) => {
      const timestamp = new Date().toISOString();
      console.log(`[Client] ❌ [${timestamp}] Disconnected from Claude Code server`);
      console.log('  Reason:', reason);
      console.log('  Was connected:', this.connected);
      this.connected = false;
      
      // Auto-reconnect on unexpected disconnects
      if (reason === 'io server disconnect' || reason === 'transport close') {
        console.log('[Client] 🔄 Attempting to reconnect...');
        setTimeout(() => {
          if (this.socket && !this.connected) {
            this.socket.connect();
          }
        }, 1000);
      }
    });

    this.socket.on('connect_error', (error) => {
      const timestamp = new Date().toISOString();
      console.error(`[Client] 🔴 [${timestamp}] Socket connection error:`, error.message);
      console.error('  Type:', error.type);
      console.error('  Server URL:', serverUrl);
      if (error.message.includes('xhr poll error')) {
        console.error('  This usually means the server is not running or not accessible');
      }
    });
    
    this.socket.on('error', (error) => {
      console.error('🔴 Socket error:', error);
    });
    
    // Log reconnection attempts
    this.socket.io.on('reconnect_attempt', (attemptNumber) => {
      console.log(`🔄 Reconnection attempt #${attemptNumber}`);
    });
    
    this.socket.io.on('reconnect_failed', () => {
      console.error('❌ All reconnection attempts failed');
    });
  }

  isConnected(): boolean {
    return this.connected;
  }

  getServerPort(): number | null {
    return this.serverPort;
  }

  async createSession(name: string, workingDirectory: string, options?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        console.error('[Client] Cannot create session - not connected to server');
        reject(new Error('Not connected to server'));
        return;
      }

      const sessionId = options?.sessionId; // For resuming existing sessions
      console.log('[Client] Creating/resuming session:', { 
        name, 
        workingDirectory, 
        sessionId, 
        options,
        socketId: this.socket?.id 
      });
      
      // Pass all options including loaded session data
      const sessionData = {
        name,
        workingDirectory,
        sessionId,
        ...options  // Spread all options including existingSessionId, claudeSessionId, messages
      };
      
      this.socket.emit('createSession', sessionData, (response: any) => {
        console.log('[Client] Session creation response:', response);
        if (response.success) {
          console.log(`[Client] ✅ Session ready: ${response.sessionId}`);
          console.log(`[Client]   Working dir: ${response.workingDirectory || workingDirectory}`);
          console.log(`[Client]   Messages: ${response.messages?.length || 0}`);
          // Return full response for session resumption
          resolve({
            sessionId: response.sessionId,
            messages: response.messages || [],
            workingDirectory: response.workingDirectory || workingDirectory
          });
        } else {
          console.error('[Client] Session creation failed:', response.error);
          reject(new Error(response.error));
        }
      });
    });
  }

  async getSessionHistory(sessionId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected to server'));
        return;
      }

      this.socket.emit('getSessionHistory', { sessionId }, (response: any) => {
        if (response.success) {
          resolve({ messages: response.messages, workingDirectory: response.workingDirectory });
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }

  async listSessions(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected to server'));
        return;
      }

      this.socket.emit('listSessions', (response: any) => {
        if (response.success) {
          resolve(response.sessions || []);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }

  async deleteSession(sessionId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected to server'));
        return;
      }

      this.socket.emit('deleteSession', { sessionId }, (response: any) => {
        if (response.success) {
          resolve();
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }

  async interrupt(sessionId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected to server'));
        return;
      }
      
      console.log(`⛔ Interrupting session ${sessionId}`);
      this.socket.emit('interrupt', { sessionId }, (response: any) => {
        if (response?.success) {
          console.log(`✅ Interrupted session ${sessionId}`);
          resolve();
        } else {
          console.log(`Failed to interrupt: ${response?.error}`);
          // Still resolve even if error, to allow UI to update
          resolve();
        }
      });
    });
  }
  
  async sendMessage(sessionId: string, content: string, model?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        console.error('[Client] Cannot send message - not connected to server');
        reject(new Error('Not connected to server'));
        return;
      }

      const timestamp = new Date().toISOString();
      console.log(`[Client] 📤 [${timestamp}] Sending message:`, {
        sessionId,
        contentLength: content.length,
        contentPreview: content.substring(0, 100),
        model,
        socketId: this.socket?.id,
        connected: this.connected
      });

      this.socket.emit('sendMessage', { sessionId, content, model }, (response: any) => {
        console.log('[Client] Message send response:', response);
        if (response.success) {
          console.log('[Client] ✅ Message sent successfully');
          resolve();
        } else {
          console.error('[Client] Failed to send message:', response.error);
          reject(new Error(response.error));
        }
      });
    });
  }

  onMessage(sessionId: string, handler: (message: any) => void): () => void {
    if (!this.socket) {
      console.warn('[Client] Cannot listen for messages - not connected');
      return () => {};
    }

    const channel = `message:${sessionId}`;
    
    // Wrap handler with extensive logging
    const loggingHandler = (message: any) => {
      const timestamp = new Date().toISOString();
      console.log(`[Client] 📨 [${timestamp}] Received message:`, {
        channel,
        type: message.type,
        subtype: message.subtype,
        streaming: message.streaming,
        hasContent: !!message.message?.content,
        contentLength: message.message?.content?.length,
        contentPreview: message.message?.content?.substring?.(0, 100),
        id: message.id,
        hasUsage: !!message.usage,
        usage: message.usage,
        fullMessage: JSON.stringify(message).substring(0, 500)
      });
      
      // Log specific message types for debugging
      if (message.type === 'assistant' && message.streaming === false) {
        console.log(`[Client] ⭐ STREAM END detected for assistant message ${message.id}`);
      }
      if (message.type === 'result') {
        console.log(`[Client] ✅ RESULT message received, stream complete`);
      }
      if (message.type === 'error') {
        console.error(`[Client] ❌ ERROR message:`, message.error);
      }
      if (message.type === 'system' && message.subtype === 'stream_end') {
        console.log(`[Client] 🔚 SYSTEM STREAM_END received`);
      }
      
      handler(message);
    };
    
    // Store handler
    this.messageHandlers.set(channel, loggingHandler);
    
    // Listen for messages
    this.socket.on(channel, loggingHandler);
    
    console.log(`[Client] 👂 Listening for messages on ${channel}`);
    
    // Return cleanup function
    return () => {
      if (this.socket) {
        const storedHandler = this.messageHandlers.get(channel);
        if (storedHandler) {
          this.socket.off(channel, storedHandler);
          this.messageHandlers.delete(channel);
          console.log(`[Client] 🔇 Stopped listening on ${channel}`);
        }
      }
    };
  }

  async setWorkingDirectory(sessionId: string, directory: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected to server'));
        return;
      }

      this.socket.emit('setWorkingDirectory', { sessionId, directory }, (response: any) => {
        if (response.success) {
          resolve();
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }

  async updateSessionMetadata(sessionId: string, metadata: any): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected to server'));
        return;
      }

      this.socket.emit('updateSessionMetadata', { sessionId, metadata }, (response: any) => {
        if (response.success) {
          resolve();
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }

  async getSessionMappings(): Promise<Record<string, any>> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected to server'));
        return;
      }

      this.socket.emit('getSessionMappings', {}, (response: any) => {
        if (response.success) {
          resolve(response.mappings);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }

  async clearSession(sessionId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected'));
        return;
      }
      
      console.log(`🧹 [CLIENT] Sending clearSession for session ${sessionId}`);
      this.socket.emit('clearSession', { sessionId }, (response: any) => {
        console.log(`🧹 [CLIENT] clearSession response:`, response);
        if (response?.success) {
          resolve();
        } else {
          reject(new Error(response?.error || 'Clear context failed'));
        }
      });
    });
  }
  
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch('http://localhost:3001/health');
      const data = await response.json();
      return data.status === 'ok' && data.claudeCodeLoaded;
    } catch (error) {
      return false;
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
  
  onTitle(sessionId: string, handler: (title: string) => void): () => void {
    const eventName = `title:${sessionId}`;
    console.log(`[Client] 🏷️ Setting up title listener for ${eventName}`);
    
    if (this.socket) {
      this.socket.on(eventName, (data: any) => {
        console.log(`[Client] 🏷️ Received title event:`, eventName, data);
        if (data?.title) {
          console.log(`[Client] 🏷️ Calling handler with title: "${data.title}"`);
          handler(data.title);
        } else {
          console.log(`[Client] 🏷️ No title in data:`, data);
        }
      });
      
      // Debug: listen to all events
      this.socket.onAny((eventName: string, ...args: any[]) => {
        if (eventName.startsWith('title:')) {
          console.log(`[Client] 🏷️ ANY title event received:`, eventName, args);
        }
      });
      
      // Return cleanup function
      return () => {
        if (this.socket) {
          this.socket.off(eventName);
          this.socket.offAny();
        }
      };
    }
    
    return () => {};
  }
}

// Singleton instance
export const claudeCodeClient = new ClaudeCodeClient();