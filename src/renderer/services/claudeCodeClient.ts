/**
 * Socket.IO client that connects to Claude Code server
 * Gets REAL responses from Claude Code SDK
 */

import { io, Socket } from 'socket.io-client';
import platformAPI, { isTauri, isVSCode, getVSCodePort, getVSCodeCwd } from './tauriApi';
import { hooksService } from './hooksService';
import { APP_ID, APP_NAME, appStorageKey } from '../config/app';
import { debugLog, isDev } from '../utils/helpers';

const SERVICE_NAME = `${APP_ID}-claude`;
const DEBUG_KEY = appStorageKey('debug');
const PORT_KEY = appStorageKey('port');
const ERROR_KEY = appStorageKey('error');
const MONO_FONT_KEY = appStorageKey('mono-font');
const SANS_FONT_KEY = appStorageKey('sans-font');
const FONT_SIZE_KEY = appStorageKey('font-size');
const LINE_HEIGHT_KEY = appStorageKey('line-height');
const WORD_WRAP_KEY = appStorageKey('word-wrap');
const AUTO_GENERATE_TITLE_KEY = appStorageKey('auto-generate-title');
const SOUND_ON_COMPLETE_KEY = appStorageKey('sound-on-complete');
const SHOW_RESULT_STATS_KEY = appStorageKey('show-result-stats');

const SETTINGS_KEYS = [
  MONO_FONT_KEY,
  SANS_FONT_KEY,
  FONT_SIZE_KEY,
  LINE_HEIGHT_KEY,
  WORD_WRAP_KEY,
  AUTO_GENERATE_TITLE_KEY,
  SOUND_ON_COMPLETE_KEY,
  SHOW_RESULT_STATS_KEY
];

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
    debugLog('[ClaudeCodeClient] Is VSCode:', isVSCode());
    debugLog('[ClaudeCodeClient] Window location:', window.location.href);

    // VSCode mode - use port from URL params
    if (isVSCode()) {
      const port = getVSCodePort();
      debugLog('[ClaudeCodeClient] VSCode mode - port from URL:', port);
      if (port) {
        this.serverPort = port;
        this.connect();
      } else {
        debugLog('[ClaudeCodeClient] VSCode mode but no port in URL!');
        this.connectionStatus = 'error';
        this.connectionError = 'No port specified in URL';
      }
    } else if (isTauri()) {
      // In production, use adaptive polling instead of fixed delay
      // This allows faster connection when server is ready
      debugLog('[ClaudeCodeClient] Production mode - using adaptive connection...');
      this.adaptiveConnect();
    } else {
      // Dev mode - connect immediately
      this.discoverAndConnect();
    }
  }
  
  private async adaptiveConnect(attempt = 1) {
    const delays = [100, 200, 400, 800, 1500]; // adaptive delays
    const delay = delays[Math.min(attempt - 1, delays.length - 1)];

    try {
      await this.discoverAndConnect();
    } catch (err) {
      if (attempt < 10) {
        setTimeout(() => this.adaptiveConnect(attempt + 1), delay);
      }
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
    // The server writes port to ~/.<appId>/current-port.txt
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
      window.localStorage.setItem(DEBUG_KEY, JSON.stringify({
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
          window.localStorage.setItem(PORT_KEY, String(port));
        }

        this.serverPort = port;
        this.connectWithRetry();
        return;
      } catch (err: any) {
        console.error('[ClaudeCodeClient] Failed to get server port from Tauri:', err);

        // Store error in localStorage for debugging
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(ERROR_KEY, JSON.stringify({
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
          if (data.service === SERVICE_NAME) {
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
    if (this.socket && (this.socket.connected || (this.socket as any).connecting)) {
      debugLog('[ClaudeCodeClient] Already connected or connecting, skipping duplicate connection');
      return;
    }

    const serverUrl = `http://localhost:${this.serverPort}`;
    debugLog(`[ClaudeCodeClient] Connecting to ${serverUrl}`);
    
    // Connect to the Claude Code server with reliable settings and backoff jitter
    this.socket = io(serverUrl, {
      reconnection: true,
      reconnectionAttempts: 20, // Reasonable limit to prevent infinite loops
      reconnectionDelay: 1000, // Start reconnecting after 1 second
      reconnectionDelayMax: 5000, // Don't wait too long between attempts
      randomizationFactor: 0.5, // Add jitter (0.5-1.5x delay) to prevent thundering herd
      timeout: 120000, // 2 minute connection timeout for very long operations
      transports: ['websocket', 'polling'], // Try both transports
      autoConnect: true,
      forceNew: false, // Reuse connection if possible
      perMessageDeflate: { threshold: 1024 } // Enable compression for messages > 1KB
    });
    
    // Expose socket globally for claudeDetector to use
    (window as any).claudeSocket = this.socket;

    this.socket.on('connect', () => {
      debugLog('[Client] Successfully connected to Claude Code server');
      debugLog('  Socket ID:', this.socket?.id);
      debugLog('  Transport:', (this.socket as any)?.io?.engine?.transport?.name);
      debugLog('  Server URL:', serverUrl);
      this.connected = true;

      // Request vscode status on connect
      this.socket?.emit('vscode:getStatus', (status: { connected: boolean; count: number }) => {
        if (status) {
          debugLog('[Client] VSCode status:', status);
          // Import dynamically to avoid circular deps
          import('../stores/claudeCodeStore').then(({ useClaudeCodeStore }) => {
            useClaudeCodeStore.getState().setVscodeStatus(status.connected, status.count);
          });
        }
      });
    });

    // Listen for vscode status changes
    this.socket?.on('vscode:status', (status: { connected: boolean; count: number }) => {
      debugLog('[Client] VSCode status update:', status);
      import('../stores/claudeCodeStore').then(({ useClaudeCodeStore }) => {
        useClaudeCodeStore.getState().setVscodeStatus(status.connected, status.count);
      });
    });

    // Settings sync for VSCode mode
    if (isVSCode()) {
      // In VSCode mode: listen for settings from main app
      this.socket?.on('settings:sync', (settings: Record<string, any>) => {
        debugLog('[Client] Received settings sync from main app:', settings);
        this.applySettings(settings);
      });
    } else {
      // In main app: send current settings when connected
      this.sendCurrentSettings();
    }

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
      // Let Socket.IO's built-in reconnection handle reconnects
      // Manual reconnection can interfere with the backoff/jitter strategy
      debugLog('[Client] Socket.IO will handle reconnection automatically');
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
      // Debug: log ALL message: events to see if they're being received
      if (eventName.startsWith('message:')) {
        console.log(`[Client] 🔔 onAny received message event: ${eventName}`, args[0]?.type, args[0]?.id);
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
      // ALWAYS log bash messages for debugging
      const isBashMessage = message.id && String(message.id).startsWith('bash-');
      if (isBashMessage) {
        console.log(`[Client] 🐚 BASH MESSAGE RECEIVED on channel ${channel}:`, {
          id: message.id,
          type: message.type,
          streaming: message.streaming,
          contentPreview: JSON.stringify(message.message?.content)?.substring(0, 100)
        });
      }

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

      // Track cleanup state to prevent race condition
      let cleanupRequested = false;

      // Set up a delayed subscription that will activate once connected
      const checkInterval = setInterval(() => {
        if (cleanupRequested) {
          clearInterval(checkInterval);
          return;
        }
        if (this.socket && this.connected) {
          debugLog('[Client] Socket now ready, setting up delayed message listener for', channel);
          clearInterval(checkInterval);

          // Double-check cleanup wasn't requested during this tick
          if (cleanupRequested) return;

          // Store handler
          this.messageHandlers.set(channel, loggingHandler);

          // Listen for messages
          this.socket.on(channel, loggingHandler);

          // Also listen for batched messages
          const batchChannel = `messageBatch:${sessionId}`;
          const batchHandler = (messages: any[]) => {
            for (const message of messages) {
              loggingHandler(message);
            }
          };
          this.messageHandlers.set(batchChannel, batchHandler);
          this.socket.on(batchChannel, batchHandler);
        }
      }, 100);

      // Return cleanup that clears the interval and removes handler if set up
      return () => {
        cleanupRequested = true;
        clearInterval(checkInterval);
        if (this.socket) {
          const storedHandler = this.messageHandlers.get(channel);
          if (storedHandler) {
            this.socket.off(channel, storedHandler);
            this.messageHandlers.delete(channel);
          }
          // Also cleanup batch handler
          const batchChannel = `messageBatch:${sessionId}`;
          const storedBatchHandler = this.messageHandlers.get(batchChannel);
          if (storedBatchHandler) {
            this.socket.off(batchChannel, storedBatchHandler);
            this.messageHandlers.delete(batchChannel);
          }
        }
      };
    }

    // Store handler
    this.messageHandlers.set(channel, loggingHandler);

    // Listen for messages
    console.log(`[Client] 📡 Setting up socket.on listener for channel: ${channel}`);
    this.socket.on(channel, loggingHandler);

    // Also listen for batched messages
    const batchChannel = `messageBatch:${sessionId}`;
    const batchHandler = (messages: any[]) => {
      for (const message of messages) {
        loggingHandler(message);
      }
    };
    this.messageHandlers.set(batchChannel, batchHandler);
    this.socket.on(batchChannel, batchHandler);

    debugLog(`[Client] Listening for messages on ${channel} and ${batchChannel}`);

    // Return cleanup function
    return () => {
      if (this.socket) {
        const storedHandler = this.messageHandlers.get(channel);
        if (storedHandler) {
          this.socket.off(channel, storedHandler);
          this.messageHandlers.delete(channel);
          debugLog(`[Client] Stopped listening on ${channel}`);
        }
        // Also cleanup batch handler
        const storedBatchHandler = this.messageHandlers.get(batchChannel);
        if (storedBatchHandler) {
          this.socket.off(batchChannel, storedBatchHandler);
          this.messageHandlers.delete(batchChannel);
        }
      }
    };
  }

  /**
   * Listen for mid-stream context usage updates
   * These are emitted whenever an assistant message with usage data arrives during streaming
   */
  onContextUpdate(sessionId: string, handler: (usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    totalContextTokens: number;
    timestamp: number;
  }) => void): () => void {
    const channel = `context-update:${sessionId}`;

    if (!this.socket) {
      debugLog('[Client] Socket not ready for context-update listener');
      return () => {};
    }

    this.socket.on(channel, handler);
    debugLog(`[Client] Listening for context updates on ${channel}`);

    return () => {
      if (this.socket) {
        this.socket.off(channel, handler);
        debugLog(`[Client] Stopped listening on ${channel}`);
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
      if (!this.serverPort) return false;
      const response = await fetch(`http://localhost:${this.serverPort}/health`);
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
      // Store handler reference so we can remove only this listener, not all onAny listeners
      let titleDebugHandler: ((eventName: string, ...args: any[]) => void) | null = null;
      if (isDev) {
        titleDebugHandler = (eventName: string, ...args: any[]) => {
          if (eventName.startsWith('title:')) {
            debugLog('[Client] ANY title event received:', eventName, args);
          }
        };
        this.socket.onAny(titleDebugHandler);
      }

      // Return cleanup function
      return () => {
        if (this.socket) {
          this.socket.off(eventName);
          // Only remove our specific onAny handler, not all of them
          if (isDev && titleDebugHandler) {
            this.socket.offAny(titleDebugHandler);
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

  // Settings sync methods
  private sendCurrentSettings(): void {
    const settings = this.gatherSettings();
    debugLog('[Client] Sending current settings to server:', settings);
    this.socket?.emit('settings:update', settings);
  }

  private gatherSettings(): Record<string, any> {
    // Gather all app settings from localStorage
    const settings: Record<string, any> = {};
    for (const key of SETTINGS_KEYS) {
      const value = localStorage.getItem(key);
      if (value !== null) {
        settings[key] = value;
      }
    }
    // Add app name and theme for vscode extension
    // App name from window title or document title
    settings.appName = document.title?.split(' - ')[0] || APP_NAME;
    // Theme colors for vscode
    const themeId = localStorage.getItem('currentThemeId');
    const bgColor = localStorage.getItem('backgroundColor');
    const fgColor = localStorage.getItem('foregroundColor');
    const accentColor = localStorage.getItem('accentColor');
    if (themeId || bgColor) {
      settings.theme = { themeId, bgColor, fgColor, accentColor };
    }
    return settings;
  }

  private applySettings(settings: Record<string, any>): void {
    // Apply settings to localStorage and trigger UI updates
    for (const [key, value] of Object.entries(settings)) {
      localStorage.setItem(key, value);
    }

    // Apply font settings to CSS
    if (settings[MONO_FONT_KEY]) {
      document.documentElement.style.setProperty('--font-mono', `"${settings[MONO_FONT_KEY]}", monospace`);
    }
    if (settings[SANS_FONT_KEY]) {
      document.documentElement.style.setProperty('--font-sans', `"${settings[SANS_FONT_KEY]}", sans-serif`);
    }
    if (settings[FONT_SIZE_KEY]) {
      const size = parseInt(settings[FONT_SIZE_KEY]);
      const xs = Math.round(size * 0.9);
      const sm = Math.round(size * 0.95);
      const lg = Math.round(size * 1.05);
      const xl = Math.round(size * 1.1);
      const xxl = Math.round(size * 1.2);
      document.documentElement.style.setProperty('--text-xs', `${xs}px`);
      document.documentElement.style.setProperty('--text-sm', `${sm}px`);
      document.documentElement.style.setProperty('--text-base', `${size}px`);
      document.documentElement.style.setProperty('--text-lg', `${lg}px`);
      document.documentElement.style.setProperty('--text-xl', `${xl}px`);
      document.documentElement.style.setProperty('--text-2xl', `${xxl}px`);
    }
    if (settings[LINE_HEIGHT_KEY]) {
      const height = parseFloat(settings[LINE_HEIGHT_KEY]);
      const tight = Math.max(1.0, height - 0.3);
      const relaxed = height + 0.25;
      document.documentElement.style.setProperty('--leading-tight', String(tight));
      document.documentElement.style.setProperty('--leading-normal', String(height));
      document.documentElement.style.setProperty('--leading-relaxed', String(relaxed));
    }

    debugLog('[Client] Applied settings from main app');
  }

  // Call this when settings change in main app
  syncSettings(): void {
    if (!isVSCode() && this.socket?.connected) {
      this.sendCurrentSettings();
    }
  }

  // Force disconnect all vscode clients (called when user disables extension)
  disconnectVscodeClients(): void {
    if (this.socket?.connected) {
      debugLog('[Client] Requesting server to disconnect all VSCode clients');
      this.socket.emit('vscode:disconnectAll');
    }
  }
}

// Singleton instance
export const claudeCodeClient = new ClaudeCodeClient();
