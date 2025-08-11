/**
 * Socket.IO client that connects to Claude Code server
 * Gets REAL responses from Claude Code SDK
 */

import { io, Socket } from 'socket.io-client';

export class ClaudeCodeClient {
  private socket: Socket | null = null;
  private connected = false;
  private messageHandlers = new Map<string, (message: any) => void>();
  private serverPort: number | null = null;

  constructor() {
    this.discoverAndConnect();
  }

  private async discoverAndConnect() {
    
    // Try to get port from Electron IPC first
    if (window.electronAPI && window.electronAPI.getServerPort) {
      try {
        const port = await window.electronAPI.getServerPort();
        if (port) {
          this.serverPort = port;
          this.connectWithRetry();
          return;
        }
      } catch (err) {
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
    
    // First check if server is responding
    try {
      const response = await fetch(`http://localhost:${this.serverPort}/health`);
      if (response.ok) {
        this.connect();
        return;
      }
    } catch (err) {
    }
    
    if (retries > 0) {
      setTimeout(() => {
        this.connectWithRetry(retries - 1, Math.min(delay * 1.5, 5000));
      }, delay);
    } else {
      // Try to connect anyway - Socket.IO will keep retrying
      this.connect();
    }
  }

  private connect() {
    if (!this.serverPort) {
      return;
    }
    
    const serverUrl = `http://localhost:${this.serverPort}`;
    
    // Connect to the Claude Code server with extended retry settings for production
    this.socket = io(serverUrl, {
      reconnection: true,
      reconnectionAttempts: 20, // More attempts for production
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000, // 10 second connection timeout
      transports: ['websocket', 'polling'], // Try both transports
    });

    this.socket.on('connect', () => {
      console.log('✅ Successfully connected to Claude Code server');
      console.log('  Socket ID:', this.socket?.id);
      console.log('  Transport:', (this.socket as any)?.io?.engine?.transport?.name);
      this.connected = true;
    });

    this.socket.on('disconnect', (reason) => {
      console.log('❌ Disconnected from Claude Code server');
      console.log('  Reason:', reason);
      this.connected = false;
    });

    this.socket.on('connect_error', (error) => {
      console.error('🔴 Socket connection error:', error.message);
      console.error('  Type:', error.type);
      if (error.message.includes('xhr poll error')) {
        console.error('  This usually means the server is not running or not accessible');
      }
    });
    
    this.socket.on('error', (error) => {
      console.error('🔴 Socket error:', error);
    });
    
    // Listen for title updates
    this.socket.on(/^title:/, (data) => {
      console.log('🏷️ Received title update:', data);
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
      
      this.socket.emit('createSession', { name, workingDirectory, sessionId, options }, (response: any) => {
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

      console.log('[Client] 📤 Sending message:', {
        sessionId,
        contentLength: content.length,
        model,
        socketId: this.socket?.id
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
    
    // Wrap handler with logging
    const loggingHandler = (message: any) => {
      console.log('[Client] 📨 Received message:', {
        channel,
        type: message.type,
        streaming: message.streaming,
        hasContent: !!message.message?.content,
        id: message.id,
        hasUsage: !!message.usage,
        usage: message.usage
      });
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