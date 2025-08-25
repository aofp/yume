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
  private sessionCreatedCallback: ((data: any) => void) | null = null;

  constructor() {
    console.log('[ClaudeCodeClient] Initializing...');
    console.log('[ClaudeCodeClient] Is Tauri:', isTauri());
    console.log('[ClaudeCodeClient] Window location:', window.location.href);
    
    // In production, wait a bit for the server to fully start
    // This prevents race conditions where the client tries to connect too early
    if (isTauri()) {
      console.log('[ClaudeCodeClient] Production mode - waiting for server to start...');
      setTimeout(() => {
        this.discoverAndConnect();
      }, 2000); // Wait 2 seconds for server to be ready
    } else {
      // Dev mode - connect immediately
      this.discoverAndConnect();
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
    console.log('[ClaudeCodeClient] Falling back to port discovery...');
    // Fall back to port discovery
    await this.discoverAndConnect();
  }

  private async discoverAndConnect() {
    console.log('[ClaudeCodeClient] Starting server discovery...');
    console.log('[ClaudeCodeClient] isTauri():', isTauri());
    console.log('[ClaudeCodeClient] window.__TAURI__:', typeof window !== 'undefined' && '__TAURI__' in window);
    
    // FIRST: Try to get the actual running server port from Tauri
    // The server writes port to ~/.yurucode/current-port.txt
    if (isTauri() && platformAPI && platformAPI.claude && platformAPI.claude.readPortFile) {
      try {
        // Use custom Tauri command to read the port file
        const port = await platformAPI.claude.readPortFile();
        if (port && !isNaN(port)) {
          console.log(`[ClaudeCodeClient] Found port ${port} from readPortFile command`);
          this.serverPort = port;
          this.connectWithRetry();
          return;
        }
      } catch (err) {
        console.log('[ClaudeCodeClient] Could not read port via readPortFile:', err);
        // Fall through to port discovery
      }
    }
    
    // Write debug info to localStorage for production debugging
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('yurucode-debug', JSON.stringify({
        time: new Date().toISOString(),
        isTauri: isTauri(),
        hasTauriGlobal: '__TAURI__' in window,
        platformAPI: !!platformAPI,
        claudeAPI: !!(platformAPI && platformAPI.claude),
        getServerPort: !!(platformAPI && platformAPI.claude && platformAPI.claude.getServerPort)
      }));
    }
    
    // For Tauri, get the dynamic port from the backend
    if (isTauri()) {
      console.log('[ClaudeCodeClient] Tauri mode - getting dynamic port...');
      console.log('[ClaudeCodeClient] platformAPI:', platformAPI);
      console.log('[ClaudeCodeClient] platformAPI.claude:', platformAPI.claude);
      try {
        const port = await platformAPI.claude.getServerPort();
        console.log('[ClaudeCodeClient] Got dynamic port from Tauri:', port);
        
        // Store port in localStorage for debugging
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem('yurucode-port', String(port));
        }
        
        this.serverPort = port;
        this.connectWithRetry();
        return;
      } catch (err) {
        console.error('[ClaudeCodeClient] Failed to get server port from Tauri:', err);
        console.error('[ClaudeCodeClient] Error details:', err.message, err.stack);
        
        // Store error in localStorage for debugging
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem('yurucode-error', JSON.stringify({
            time: new Date().toISOString(),
            error: err.message,
            stack: err.stack
          }));
        }
        // Fall through to port discovery
      }
    }
    
    // Fallback: Try to discover running servers by checking multiple ports
    // Start with most likely production ports based on our pattern
    const commonPorts = [
      55849, 46937, // Current production ports we just saw
      49674, 50349, 63756, 54293, 59931, // Recently seen production ports  
      3001, 3002, 3003, 3004, 3005 // Development ports
    ];
    
    // Scan broader range systematically
    const dynamicPorts = [];
    // Check every 50th port in the typical Tauri range
    for (let p = 35000; p <= 65000; p += 50) {
      dynamicPorts.push(p, p+37, p+49); // Common offsets we've seen
    }
    
    const portsToCheck = [...commonPorts, ...dynamicPorts];
    
    console.log('[ClaudeCodeClient] Fallback port discovery - checking', portsToCheck.length, 'ports...');
    
    // Check ports in parallel for faster discovery
    const checkPort = async (port) => {
      try {
        const response = await fetch(`http://localhost:${port}/health`, { 
          signal: AbortSignal.timeout(500)
        });
        if (response.ok) {
          const data = await response.json();
          if (data.service === 'yurucode-claude') {
            return port;
          }
        }
      } catch (err) {
        // Port not available
      }
      return null;
    };
    
    // Check ports in batches
    const batchSize = 10;
    for (let i = 0; i < portsToCheck.length; i += batchSize) {
      const batch = portsToCheck.slice(i, i + batchSize);
      const results = await Promise.all(batch.map(checkPort));
      const foundPort = results.find(p => p !== null);
      
      if (foundPort) {
        console.log(`[ClaudeCodeClient] Found server on port ${foundPort} via fallback discovery!`);
        this.serverPort = foundPort;
        this.connectWithRetry();
        return;
      }
    }
    
    // Default to 3001 if no server found
    this.serverPort = 3001;
    
    // Add retry logic for initial connection
    this.connectWithRetry();
  }
  
  private async connectWithRetry(retries = 10, delay = 1000) {
    console.log(`[ClaudeCodeClient] Connection attempt (${10 - retries + 1}/10) to port ${this.serverPort}`);
    
    // Skip health check and connect directly - Socket.IO will handle retries
    // The health check might be failing due to CORS or other issues in production
    console.log('[ClaudeCodeClient] Connecting directly without health check...');
    this.connect();
  }

  private connect() {
    if (!this.serverPort) {
      console.error('[ClaudeCodeClient] No server port available');
      return;
    }
    
    // Prevent multiple connections
    if (this.socket && (this.socket.connected || this.socket.connecting)) {
      console.log('[ClaudeCodeClient] Already connected or connecting, skipping duplicate connection');
      return;
    }
    
    const serverUrl = `http://localhost:${this.serverPort}`;
    console.log(`[ClaudeCodeClient] Connecting to ${serverUrl}`);
    
    // Connect to the Claude Code server with ultra-reliable settings
    this.socket = io(serverUrl, {
      reconnection: true,
      reconnectionAttempts: Infinity, // Keep trying forever
      reconnectionDelay: 1000, // Start reconnecting faster
      reconnectionDelayMax: 5000, // Don't wait too long between attempts
      timeout: 120000, // 2 minute connection timeout for very long operations
      transports: ['websocket', 'polling'], // Try both transports
      autoConnect: true,
      forceNew: false, // Reuse connection if possible
      perMessageDeflate: true // Enable compression
    });

    this.socket.on('connect', () => {
      const timestamp = new Date().toISOString();
      console.log(`[Client] ✅ [${timestamp}] Successfully connected to Claude Code server`);
      console.log('  Socket ID:', this.socket?.id);
      console.log('  Transport:', (this.socket as any)?.io?.engine?.transport?.name);
      console.log('  Server URL:', serverUrl);
      this.connected = true;
    });

    // Handle sessionCreated events from server when it auto-creates a session
    this.socket.on('sessionCreated', (data) => {
      console.log('[Client] 📝 Session auto-created by server:', data);
      // Notify any listeners about the session creation
      if (this.sessionCreatedCallback) {
        this.sessionCreatedCallback(data);
      }
    });

    this.socket.on('disconnect', (reason) => {
      const timestamp = new Date().toISOString();
      console.log(`[Client] ❌ [${timestamp}] Disconnected from Claude Code server`);
      console.log('  Reason:', reason);
      console.log('  Was connected:', this.connected);
      this.connected = false;
      
      // Auto-reconnect on ANY disconnect (more aggressive)
      console.log('[Client] 🔄 Will attempt to reconnect...');
      setTimeout(() => {
        if (this.socket && !this.connected) {
          console.log('[Client] 🔄 Forcing reconnection attempt...');
          this.socket.connect();
        }
      }, 500); // Faster reconnect
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
    
    // Handle keepalive messages to maintain connection
    this.socket.onAny((eventName: string, ...args: any[]) => {
      if (eventName.startsWith('keepalive:')) {
        const timestamp = new Date().toISOString();
        console.log(`[Client] 💓 [${timestamp}] Keepalive received`);
      }
    });
  }

  isConnected(): boolean {
    // Return actual socket connection state, not just our flag
    return !!(this.socket && this.socket.connected);
  }

  getServerPort(): number | null {
    return this.serverPort;
  }

  async createSession(name: string, workingDirectory: string, options?: any): Promise<any> {
    // Wait for connection if socket exists but not connected yet
    if (this.socket && !this.socket.connected) {
      console.log('[Client] Socket exists but not connected, waiting for connection before creating session...');
      await new Promise<void>((resolve) => {
        const checkConnection = setInterval(() => {
          // Check actual socket connection state
          if (this.socket && this.socket.connected) {
            console.log('[Client] Connection established, proceeding with session creation');
            this.connected = true; // Update our flag
            clearInterval(checkConnection);
            resolve();
          }
        }, 100);
        
        // Timeout after 5 seconds
        setTimeout(() => {
          clearInterval(checkConnection);
          console.warn('[Client] Connection wait timed out after 5 seconds');
          resolve(); // Let it try anyway
        }, 5000);
      });
    }
    
    return new Promise((resolve, reject) => {
      // Check actual socket connection state
      if (!this.socket || !this.socket.connected) {
        console.error('[Client] Cannot create session - not connected to server', {
          hasSocket: !!this.socket,
          socketConnected: this.socket?.connected,
          socketConnecting: this.socket?.connecting,
          ourFlag: this.connected
        });
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
      
      // Add timeout in case server doesn't respond
      const timeoutId = setTimeout(() => {
        console.warn(`⚠️ Interrupt timeout for session ${sessionId} - resolving anyway`);
        resolve();
      }, 5000); // 5 second timeout
      
      this.socket.emit('interrupt', { sessionId }, (response: any) => {
        clearTimeout(timeoutId);
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
    // Wait for connection if socket exists but not connected yet
    if (this.socket && !this.socket.connected) {
      console.log('[Client] Socket exists but not connected, waiting for connection...');
      await new Promise<void>((resolve) => {
        const checkConnection = setInterval(() => {
          // Check actual socket connection state, not our flag
          if (this.socket && this.socket.connected) {
            console.log('[Client] Connection established, proceeding with message');
            this.connected = true; // Update our flag
            clearInterval(checkConnection);
            resolve();
          }
        }, 100);
        
        // Timeout after 5 seconds
        setTimeout(() => {
          clearInterval(checkConnection);
          console.warn('[Client] Connection wait timed out after 5 seconds');
          resolve(); // Let it try anyway
        }, 5000);
      });
    }
    
    return new Promise((resolve, reject) => {
      // Check actual socket connection state
      if (!this.socket || !this.socket.connected) {
        console.error('[Client] Cannot send message - not connected to server', {
          hasSocket: !!this.socket,
          socketConnected: this.socket?.connected,
          socketConnecting: this.socket?.connecting,
          ourFlag: this.connected
        });
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

  onError(sessionId: string, handler: (error: any) => void): () => void {
    if (!this.socket) {
      console.warn('[Client] Cannot listen for errors - not connected');
      return () => {};
    }

    const channel = `error:${sessionId}`;
    
    const errorHandler = (error: any) => {
      const timestamp = new Date().toISOString();
      console.error(`[Client] ❌ [${timestamp}] Received error:`, {
        channel,
        type: error.type,
        message: error.message,
        timestamp: error.timestamp
      });
      handler(error);
    };
    
    this.socket.on(channel, errorHandler);
    console.log(`[Client] 👂 Listening for errors on ${channel}`);
    
    return () => {
      if (this.socket) {
        this.socket.off(channel, errorHandler);
      }
    };
  }

  onMessage(sessionId: string, handler: (message: any) => void): () => void {
    const channel = `message:${sessionId}`;
    
    // Wrap handler with extensive logging
    const loggingHandler = (message: any) => {
      const timestamp = new Date().toISOString();
      // Enhanced logging for thinking blocks
      let contentInfo: any = {
        hasContent: !!message.message?.content,
        contentLength: message.message?.content?.length,
        contentPreview: message.message?.content?.substring?.(0, 100)
      };
      
      if (Array.isArray(message.message?.content)) {
        const blockTypes = message.message.content.map((b: any) => b?.type || 'unknown');
        const hasThinking = blockTypes.includes('thinking');
        contentInfo = {
          hasContent: true,
          isArray: true,
          blockTypes: blockTypes,
          blockCount: blockTypes.length,
          hasThinking: hasThinking
        };
        if (hasThinking) {
          contentInfo.thinkingBlocks = message.message.content.filter((b: any) => b?.type === 'thinking').map((b: any) => ({
            type: 'thinking',
            preview: (b.thinking || b.text || '').substring(0, 50) + '...'
          }));
        }
      }
      
      console.log(`[Client] 📨 [${timestamp}] Received message:`, {
        channel,
        type: message.type,
        subtype: message.subtype,
        streaming: message.streaming,
        ...contentInfo,
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
    
    // If socket doesn't exist yet, wait for it
    if (!this.socket) {
      console.warn('[Client] Socket not ready, waiting for connection before setting up message listener for', channel);
      
      // Set up a delayed subscription that will activate once connected
      const checkInterval = setInterval(() => {
        if (this.socket && this.connected) {
          console.log('[Client] Socket now ready, setting up delayed message listener for', channel);
          clearInterval(checkInterval);
          
          // Store handler
          this.messageHandlers.set(channel, loggingHandler);
          
          // Listen for messages
          this.socket.on(channel, loggingHandler);
        }
      }, 100);
      
      // Return cleanup that clears the interval and removes handler if set up
      return () => {
        clearInterval(checkInterval);
        if (this.socket) {
          const storedHandler = this.messageHandlers.get(channel);
          if (storedHandler) {
            this.socket.off(channel, storedHandler);
            this.messageHandlers.delete(channel);
          }
        }
      };
    }
    
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
  
  onSessionCreated(handler: (data: any) => void): void {
    this.sessionCreatedCallback = handler;
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