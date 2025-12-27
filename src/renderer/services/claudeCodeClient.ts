/**
 * Socket.IO client that connects to Claude Code server
 * Gets REAL responses from Claude Code SDK
 */

import { io, Socket } from 'socket.io-client';
import platformAPI, { isTauri } from './tauriApi';
import { hooksService } from './hooksService';

// Check if we're in development mode
const isDev = import.meta.env?.DEV || process.env.NODE_ENV === 'development';

// Debug logging helper - only logs when in development
const debugLog = (...args: any[]) => {
  if (isDev) {
    console.log(...args);
  }
};

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
    debugLog('[ClaudeCodeClient] Initializing...');
    debugLog('[ClaudeCodeClient] Is Tauri:', isTauri());
    debugLog('[ClaudeCodeClient] Window location:', window.location.href);

    // In production, wait a bit for the server to fully start
    // This prevents race conditions where the client tries to connect too early
    if (isTauri()) {
      debugLog('[ClaudeCodeClient] Production mode - waiting for server to start...');
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
    debugLog('[ClaudeCodeClient] Getting server port from Tauri...');

    let retries = 10; // Try 10 times
    const retryDelay = 1000; // 1 second between retries

    const tryConnect = async () => {
      try {
        // Get the dynamic port from Tauri
        const port = await platformAPI.claude.getServerPort();
        debugLog('[ClaudeCodeClient] Got server port from Tauri:', port);
        this.serverPort = port;

        // Check if server is ready
        const response = await fetch(`http://localhost:${port}/health`, {
          signal: AbortSignal.timeout(2000)
        });
        if (response.ok) {
          debugLog('[ClaudeCodeClient] Server health check OK on port', port);
          this.connect();
          return true;
        } else {
          debugLog('[ClaudeCodeClient] Server health check failed:', response.status);
          return false;
        }
      } catch (err) {
        debugLog('[ClaudeCodeClient] Error in tryConnect:', err);
        debugLog('[ClaudeCodeClient] Server not ready yet, retrying...', retries, 'attempts left');
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

    debugLog('[ClaudeCodeClient] Server health check failed after all retries');
    debugLog('[ClaudeCodeClient] Falling back to port discovery...');
    // Fall back to port discovery
    await this.discoverAndConnect();
  }

  private async discoverAndConnect() {
    debugLog('[ClaudeCodeClient] Starting server discovery...');
    debugLog('[ClaudeCodeClient] isTauri():', isTauri());
    debugLog('[ClaudeCodeClient] window.__TAURI__:', typeof window !== 'undefined' && '__TAURI__' in window);

    // FIRST: Try to get the actual running server port from Tauri
    // The server writes port to ~/.yurucode/current-port.txt
    if (isTauri() && platformAPI && platformAPI.claude && platformAPI.claude.readPortFile) {
      try {
        // Use custom Tauri command to read the port file
        const port = await platformAPI.claude.readPortFile();
        if (port && !isNaN(port)) {
          debugLog(`[ClaudeCodeClient] Found port ${port} from readPortFile command`);
          this.serverPort = port;
          this.connectWithRetry();
          return;
        }
      } catch (err) {
        debugLog('[ClaudeCodeClient] Could not read port via readPortFile:', err);
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
      debugLog('[ClaudeCodeClient] Tauri mode - getting dynamic port...');
      debugLog('[ClaudeCodeClient] platformAPI:', platformAPI);
      debugLog('[ClaudeCodeClient] platformAPI.claude:', platformAPI.claude);
      try {
        const port = await platformAPI.claude.getServerPort();
        debugLog('[ClaudeCodeClient] Got dynamic port from Tauri:', port);

        // Store port in localStorage for debugging
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem('yurucode-port', String(port));
        }

        this.serverPort = port;
        this.connectWithRetry();
        return;
      } catch (err: any) {
        console.error('[ClaudeCodeClient] Failed to get server port from Tauri:', err);

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

    debugLog('[ClaudeCodeClient] Fallback port discovery - checking', portsToCheck.length, 'ports...');

    // Check ports in parallel for faster discovery
    const checkPort = async (port: number) => {
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
        debugLog(`[ClaudeCodeClient] Found server on port ${foundPort} via fallback discovery!`);
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
    debugLog(`[ClaudeCodeClient] Connection attempt (${10 - retries + 1}/10) to port ${this.serverPort}`);

    // Skip health check and connect directly - Socket.IO will handle retries
    // The health check might be failing due to CORS or other issues in production
    debugLog('[ClaudeCodeClient] Connecting directly without health check...');
    this.connect();
  }

  private connect() {
    if (!this.serverPort) {
      console.error('[ClaudeCodeClient] No server port available');
      return;
    }

    // Prevent multiple connections
    if (this.socket && (this.socket.connected || this.socket.connecting)) {
      debugLog('[ClaudeCodeClient] Already connected or connecting, skipping duplicate connection');
      return;
    }

    const serverUrl = `http://localhost:${this.serverPort}`;
    debugLog(`[ClaudeCodeClient] Connecting to ${serverUrl}`);
    
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
    
    // Expose socket globally for claudeDetector to use
    (window as any).claudeSocket = this.socket;

    this.socket.on('connect', () => {
      debugLog('[Client] Successfully connected to Claude Code server');
      debugLog('  Socket ID:', this.socket?.id);
      debugLog('  Transport:', (this.socket as any)?.io?.engine?.transport?.name);
      debugLog('  Server URL:', serverUrl);
      this.connected = true;
    });

    // Handle sessionCreated events from server when it auto-creates a session
    this.socket.on('sessionCreated', (data) => {
      debugLog('[Client] Session auto-created by server:', data);
      // Notify any listeners about the session creation
      if (this.sessionCreatedCallback) {
        this.sessionCreatedCallback(data);
      }
    });

    this.socket.on('disconnect', (reason) => {
      debugLog('[Client] Disconnected from Claude Code server');
      debugLog('  Reason:', reason);
      debugLog('  Was connected:', this.connected);
      this.connected = false;

      // Auto-reconnect on ANY disconnect (more aggressive)
      debugLog('[Client] Will attempt to reconnect...');
      setTimeout(() => {
        if (this.socket && !this.connected) {
          debugLog('[Client] Forcing reconnection attempt...');
          this.socket.connect();
        }
      }, 500); // Faster reconnect
    });

    this.socket.on('connect_error', (error: any) => {
      console.error('[Client] Socket connection error:', error.message);
      if (error.message.includes('xhr poll error')) {
        console.error('[Client] This usually means the server is not running or not accessible');
      }
    });

    this.socket.on('error', (error) => {
      console.error('[Client] Socket error:', error);
    });

    // Log reconnection attempts
    this.socket.io.on('reconnect_attempt', (attemptNumber) => {
      debugLog(`[Client] Reconnection attempt #${attemptNumber}`);
    });

    this.socket.io.on('reconnect_failed', () => {
      console.error('[Client] All reconnection attempts failed');
    });

    // Handle keepalive messages to maintain connection
    this.socket.onAny((eventName: string, ...args: any[]) => {
      if (eventName.startsWith('keepalive:')) {
        debugLog('[Client] Keepalive received');
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
      debugLog('[Client] Socket exists but not connected, waiting for connection before creating session...');
      await new Promise<void>((resolve) => {
        const checkConnection = setInterval(() => {
          // Check actual socket connection state
          if (this.socket && this.socket.connected) {
            debugLog('[Client] Connection established, proceeding with session creation');
            this.connected = true; // Update our flag
            clearInterval(checkConnection);
            resolve();
          }
        }, 100);

        // Timeout after 5 seconds
        setTimeout(() => {
          clearInterval(checkConnection);
          debugLog('[Client] Connection wait timed out after 5 seconds');
          resolve(); // Let it try anyway
        }, 5000);
      });
    }

    return new Promise((resolve, reject) => {
      // Check actual socket connection state
      if (!this.socket || !this.socket.connected) {
        console.error('[Client] Cannot create session - not connected to server');
        reject(new Error('Not connected to server'));
        return;
      }

      const sessionId = options?.sessionId; // For resuming existing sessions
      debugLog('[Client] Creating/resuming session:', {
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
        debugLog('[Client] Session creation response:', response);
        if (response.success) {
          debugLog(`[Client] Session ready: ${response.sessionId}`);
          debugLog(`[Client]   Working dir: ${response.workingDirectory || workingDirectory}`);
          debugLog(`[Client]   Messages: ${response.messages?.length || 0}`);
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

      debugLog(`[Client] Interrupting session ${sessionId}`);

      // Add timeout in case server doesn't respond
      const timeoutId = setTimeout(() => {
        debugLog(`[Client] Interrupt timeout for session ${sessionId} - resolving anyway`);
        resolve();
      }, 5000); // 5 second timeout

      this.socket.emit('interrupt', { sessionId }, (response: any) => {
        clearTimeout(timeoutId);
        if (response?.success) {
          debugLog(`[Client] Interrupted session ${sessionId}`);
          resolve();
        } else {
          debugLog(`[Client] Failed to interrupt: ${response?.error}`);
          // Still resolve even if error, to allow UI to update
          resolve();
        }
      });
    });
  }
  
  async sendMessage(sessionId: string, content: string, model?: string, autoGenerateTitle?: boolean): Promise<void> {
    // Process through hooks first
    try {
      const processedContent = await hooksService.processUserPrompt(content, sessionId);
      content = processedContent;
    } catch (error) {
      console.error('[Hooks] Prompt blocked:', error);
      throw error;
    }

    // Get system prompt settings to pass to server
    let systemPromptSettings = {};
    try {
      const stored = localStorage.getItem('system_prompt_settings');
      if (stored) {
        systemPromptSettings = JSON.parse(stored);
      }
    } catch (err) {
      console.error('[Client] Failed to load system prompt settings:', err);
    }
    // Wait for connection if socket exists but not connected yet
    if (this.socket && !this.socket.connected) {
      debugLog('[Client] Socket exists but not connected, waiting for connection...');
      await new Promise<void>((resolve) => {
        const checkConnection = setInterval(() => {
          // Check actual socket connection state, not our flag
          if (this.socket && this.socket.connected) {
            debugLog('[Client] Connection established, proceeding with message');
            this.connected = true; // Update our flag
            clearInterval(checkConnection);
            resolve();
          }
        }, 100);

        // Timeout after 5 seconds
        setTimeout(() => {
          clearInterval(checkConnection);
          debugLog('[Client] Connection wait timed out after 5 seconds');
          resolve(); // Let it try anyway
        }, 5000);
      });
    }

    return new Promise((resolve, reject) => {
      // Check actual socket connection state
      if (!this.socket || !this.socket.connected) {
        console.error('[Client] Cannot send message - not connected to server');
        reject(new Error('Not connected to server'));
        return;
      }

      debugLog('[Client] Sending message:', {
        sessionId,
        contentLength: content.length,
        contentPreview: content.substring(0, 100),
        model,
        socketId: this.socket?.id,
        connected: this.connected
      });

      this.socket.emit('sendMessage', { sessionId, content, model, autoGenerateTitle, systemPromptSettings }, (response: any) => {
        debugLog('[Client] Message send response:', response);
        if (response.success) {
          debugLog('[Client] Message sent successfully');
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
      debugLog('[Client] Cannot listen for errors - not connected');
      return () => {};
    }

    const channel = `error:${sessionId}`;

    const errorHandler = (error: any) => {
      console.error('[Client] Received error:', {
        channel,
        type: error.type,
        message: error.message
      });
      handler(error);
    };

    this.socket.on(channel, errorHandler);
    debugLog(`[Client] Listening for errors on ${channel}`);

    return () => {
      if (this.socket) {
        this.socket.off(channel, errorHandler);
      }
    };
  }

  onMessage(sessionId: string, handler: (message: any) => void): () => void {
    const channel = `message:${sessionId}`;

    // Wrap handler with logging (only in development)
    const loggingHandler = (message: any) => {
      // Enhanced logging for thinking blocks - only in dev
      if (isDev) {
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

        debugLog('[Client] Received message:', {
          channel,
          type: message.type,
          subtype: message.subtype,
          streaming: message.streaming,
          ...contentInfo,
          id: message.id,
          hasUsage: !!message.usage,
          usage: message.usage
        });

        // Log specific message types for debugging
        if (message.type === 'assistant' && message.streaming === false) {
          debugLog(`[Client] STREAM END detected for assistant message ${message.id}`);
        }
        if (message.type === 'result') {
          debugLog('[Client] RESULT message received, stream complete');
        }
        if (message.type === 'system' && message.subtype === 'stream_end') {
          debugLog('[Client] SYSTEM STREAM_END received');
        }
      }

      // Always log errors
      if (message.type === 'error') {
        console.error('[Client] ERROR message:', message.error);
      }

      handler(message);
    };

    // If socket doesn't exist yet, wait for it
    if (!this.socket) {
      debugLog('[Client] Socket not ready, waiting for connection before setting up message listener for', channel);

      // Set up a delayed subscription that will activate once connected
      const checkInterval = setInterval(() => {
        if (this.socket && this.connected) {
          debugLog('[Client] Socket now ready, setting up delayed message listener for', channel);
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

    debugLog(`[Client] Listening for messages on ${channel}`);

    // Return cleanup function
    return () => {
      if (this.socket) {
        const storedHandler = this.messageHandlers.get(channel);
        if (storedHandler) {
          this.socket.off(channel, storedHandler);
          this.messageHandlers.delete(channel);
          debugLog(`[Client] Stopped listening on ${channel}`);
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

      debugLog(`[Client] Sending clearSession for session ${sessionId}`);
      this.socket.emit('clearSession', { sessionId }, (response: any) => {
        debugLog('[Client] clearSession response:', response);
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
  
  onFocusTrigger(sessionId: string, handler: () => void): () => void {
    const eventName = `trigger:focus:${sessionId}`;
    debugLog(`[Client] Setting up focus trigger listener for ${eventName}`);

    if (this.socket) {
      this.socket.on(eventName, () => {
        debugLog(`[Client] Focus trigger received for session ${sessionId}`);
        handler();
      });

      // Return cleanup function
      return () => {
        if (this.socket) {
          this.socket.off(eventName);
        }
      };
    }

    return () => {};
  }

  onTitle(sessionId: string, handler: (title: string) => void): () => void {
    const eventName = `title:${sessionId}`;
    debugLog(`[Client] Setting up title listener for ${eventName}`);

    if (this.socket) {
      this.socket.on(eventName, (data: any) => {
        debugLog('[Client] Received title event:', eventName, data);
        if (data?.title) {
          debugLog(`[Client] Calling handler with title: "${data.title}"`);
          handler(data.title);
        } else {
          debugLog('[Client] No title in data:', data);
        }
      });

      // Debug: listen to all events (only in dev)
      if (isDev) {
        this.socket.onAny((eventName: string, ...args: any[]) => {
          if (eventName.startsWith('title:')) {
            debugLog('[Client] ANY title event received:', eventName, args);
          }
        });
      }

      // Return cleanup function
      return () => {
        if (this.socket) {
          this.socket.off(eventName);
          if (isDev) {
            this.socket.offAny();
          }
        }
      };
    }

    return () => {};
  }

  // Expose socket for other services (checkpointService, agentExecutionService)
  getSocket(): Socket | null {
    return this.socket;
  }
}

// Singleton instance
export const claudeCodeClient = new ClaudeCodeClient();