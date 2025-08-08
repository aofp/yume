/**
 * COMPLETE Claude Code SDK Integration
 * Uses @anthropic-ai/claude-code for FULL functionality
 * Implements ALL features: sessions, streaming, tools, MCP, etc.
 */

import { 
  query, 
  type SDKMessage, 
  type SDKUserMessage,
  type SDKAssistantMessage,
  type SDKResultMessage,
  type SDKSystemMessage,
  type Options,
  type Query,
  type CanUseTool,
  type PermissionMode,
  type McpServerConfig,
  AbortError
} from '@anthropic-ai/claude-code';

// Session state management
interface Session {
  id: string;
  name: string;
  messages: SDKMessage[];
  currentQuery?: Query;
  options: Options;
  status: 'active' | 'paused' | 'completed';
  createdAt: Date;
  updatedAt: Date;
  cwd: string;
  messageGenerator?: AsyncIterable<SDKUserMessage>;
}

export class ClaudeCodeSDKComplete {
  private sessions: Map<string, Session> = new Map();
  private currentSessionId?: string;
  private messageQueue: Map<string, SDKUserMessage[]> = new Map();

  /**
   * Create a new Claude Code session with FULL SDK capabilities
   */
  async createSession(
    name: string, 
    options?: {
      cwd?: string;
      model?: string;
      allowedTools?: string[];
      mcpServers?: Record<string, McpServerConfig>;
      permissionMode?: PermissionMode;
      maxTurns?: number;
    }
  ): Promise<string> {
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Create message queue for this session
    this.messageQueue.set(sessionId, []);
    
    // Create async generator for streaming user messages
    const messageGenerator = this.createMessageGenerator(sessionId);
    
    const session: Session = {
      id: sessionId,
      name,
      messages: [],
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      cwd: options?.cwd || '/',
      options: {
        cwd: options?.cwd,
        model: options?.model || 'claude-3-5-sonnet-20241022',
        allowedTools: options?.allowedTools || [
          'Read', 'Write', 'Edit', 'MultiEdit',
          'LS', 'Glob', 'Grep',
          'Bash',
          'WebFetch', 'WebSearch',
          'TodoWrite',
          'NotebookEdit'
        ],
        mcpServers: options?.mcpServers,
        permissionMode: options?.permissionMode || 'default',
        maxTurns: options?.maxTurns || 30,
        maxThinkingTokens: 50000,
        // Custom permission handler
        canUseTool: this.createPermissionHandler(sessionId),
      },
      messageGenerator
    };
    
    this.sessions.set(sessionId, session);
    this.currentSessionId = sessionId;
    
    console.log(`✅ Created Claude Code session: ${sessionId}`);
    return sessionId;
  }

  /**
   * Create an async generator for streaming user messages to a session
   */
  private async* createMessageGenerator(sessionId: string): AsyncIterable<SDKUserMessage> {
    const queue = this.messageQueue.get(sessionId);
    if (!queue) return;
    
    while (true) {
      // Wait for messages in the queue
      while (queue.length === 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Check if session is closed
        const session = this.sessions.get(sessionId);
        if (!session || session.status === 'completed') {
          return;
        }
      }
      
      // Yield the next message
      const message = queue.shift();
      if (message) {
        yield message;
      }
    }
  }

  /**
   * Send a message to a session (supports streaming)
   */
  async sendMessage(
    sessionId: string, 
    content: string,
    parentToolUseId?: string
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    // Create user message
    const userMessage: SDKUserMessage = {
      type: 'user',
      message: {
        role: 'user',
        content: content
      },
      parent_tool_use_id: parentToolUseId || null,
      session_id: sessionId
    };
    
    // Add to message queue
    const queue = this.messageQueue.get(sessionId);
    if (queue) {
      queue.push(userMessage);
    }
    
    // If no active query, start one
    if (!session.currentQuery && session.messageGenerator) {
      this.startSessionQuery(sessionId);
    }
  }

  /**
   * Start a query for a session (handles streaming)
   */
  private async startSessionQuery(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.messageGenerator) return;
    
    try {
      // Create the query with streaming input
      const queryInstance = query({
        prompt: session.messageGenerator,
        options: session.options
      });
      
      session.currentQuery = queryInstance;
      
      // Process messages as they come
      for await (const message of queryInstance) {
        session.messages.push(message);
        session.updatedAt = new Date();
        
        // Emit message to UI
        this.emitMessage(sessionId, message);
        
        // Handle different message types
        switch (message.type) {
          case 'system':
            console.log('🔧 System:', message);
            break;
            
          case 'assistant':
            console.log('🤖 Assistant:', this.extractTextContent(message));
            break;
            
          case 'result':
            console.log('✅ Result:', message.subtype);
            if (message.subtype === 'success' || message.subtype.startsWith('error')) {
              // Query completed
              session.currentQuery = undefined;
            }
            break;
        }
      }
      
    } catch (error) {
      if (error instanceof AbortError) {
        console.log('Query interrupted');
      } else {
        console.error('Query error:', error);
      }
      session.currentQuery = undefined;
    }
  }

  /**
   * Resume an existing session
   */
  async resumeSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    
    session.status = 'active';
    session.updatedAt = new Date();
    this.currentSessionId = sessionId;
    
    // Use resume option in next query
    session.options.resume = sessionId;
    
    console.log(`▶️ Resumed session: ${sessionId}`);
    return true;
  }

  /**
   * Continue the last conversation in current session
   */
  async continueLastConversation(): Promise<boolean> {
    if (!this.currentSessionId) return false;
    
    const session = this.sessions.get(this.currentSessionId);
    if (!session) return false;
    
    // Set continue flag for next query
    session.options.continue = true;
    
    console.log(`↩️ Continuing last conversation in session: ${this.currentSessionId}`);
    return true;
  }

  /**
   * Pause a session
   */
  pauseSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    
    session.status = 'paused';
    session.updatedAt = new Date();
    
    // Interrupt current query if active
    if (session.currentQuery) {
      session.currentQuery.interrupt();
    }
    
    console.log(`⏸️ Paused session: ${sessionId}`);
    return true;
  }

  /**
   * Get all sessions
   */
  getAllSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get a specific session
   */
  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Delete a session
   */
  deleteSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    
    // Interrupt any active query
    if (session.currentQuery) {
      session.currentQuery.interrupt();
    }
    
    // Clean up
    this.sessions.delete(sessionId);
    this.messageQueue.delete(sessionId);
    
    if (this.currentSessionId === sessionId) {
      this.currentSessionId = undefined;
    }
    
    console.log(`🗑️ Deleted session: ${sessionId}`);
    return true;
  }

  /**
   * Interrupt the current query in a session
   */
  async interruptSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session?.currentQuery) {
      await session.currentQuery.interrupt();
      console.log(`🛑 Interrupted session: ${sessionId}`);
    }
  }

  /**
   * Run a one-off query (non-streaming)
   */
  async runQuery(
    prompt: string, 
    options?: Options
  ): Promise<{ success: boolean; result: string; messages: SDKMessage[] }> {
    try {
      const messages: SDKMessage[] = [];
      let result = '';
      
      const queryInstance = query({
        prompt,
        options: {
          ...options,
          maxTurns: options?.maxTurns || 10,
        }
      });
      
      for await (const message of queryInstance) {
        messages.push(message);
        
        if (message.type === 'assistant') {
          result += this.extractTextContent(message);
        } else if (message.type === 'result' && message.subtype === 'success') {
          result = message.result || result;
        }
      }
      
      return {
        success: true,
        result,
        messages
      };
      
    } catch (error: any) {
      return {
        success: false,
        result: error.message,
        messages: []
      };
    }
  }

  /**
   * Stream a query (yields messages as they come)
   */
  async* streamQuery(prompt: string, options?: Options): AsyncGenerator<SDKMessage> {
    const queryInstance = query({
      prompt,
      options
    });
    
    for await (const message of queryInstance) {
      yield message;
    }
  }

  /**
   * Create a permission handler for tool usage
   */
  private createPermissionHandler(sessionId: string): CanUseTool {
    return async (toolName: string, input: Record<string, unknown>) => {
      // Emit permission request to UI
      const granted = await this.requestPermission(sessionId, toolName, input);
      
      if (granted) {
        return {
          behavior: 'allow',
          updatedInput: input
        };
      } else {
        return {
          behavior: 'deny',
          message: 'Permission denied by user'
        };
      }
    };
  }

  /**
   * Request permission from UI (to be overridden)
   */
  protected async requestPermission(
    sessionId: string, 
    toolName: string, 
    input: Record<string, unknown>
  ): Promise<boolean> {
    // This should be overridden to show UI permission dialog
    console.log(`🔐 Permission request for ${toolName}:`, input);
    return true; // Auto-allow for now
  }

  /**
   * Emit message to UI (to be overridden)
   */
  protected emitMessage(sessionId: string, message: SDKMessage): void {
    // This should be overridden to send messages to UI
    // For now, just log
    if (message.type === 'assistant') {
      const text = this.extractTextContent(message);
      if (text) {
        console.log(`💬 [${sessionId}]:`, text.substring(0, 100) + '...');
      }
    }
  }

  /**
   * Extract text content from assistant message
   */
  private extractTextContent(message: SDKAssistantMessage): string {
    let text = '';
    if (message.message.content) {
      for (const content of message.message.content) {
        if (content.type === 'text') {
          text += content.text;
        }
      }
    }
    return text;
  }

  /**
   * Configure MCP servers for a session
   */
  async configureMcpServers(
    sessionId: string, 
    servers: Record<string, McpServerConfig>
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.options.mcpServers = servers;
      console.log(`🔌 Configured MCP servers for session ${sessionId}:`, Object.keys(servers));
    }
  }

  /**
   * Set permission mode for a session
   */
  setPermissionMode(sessionId: string, mode: PermissionMode): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.options.permissionMode = mode;
      console.log(`🔒 Set permission mode to ${mode} for session ${sessionId}`);
    }
  }

  /**
   * Update allowed tools for a session
   */
  updateAllowedTools(sessionId: string, tools: string[]): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.options.allowedTools = tools;
      console.log(`🔧 Updated allowed tools for session ${sessionId}:`, tools);
    }
  }

  /**
   * Get session statistics
   */
  getSessionStats(sessionId: string): {
    messageCount: number;
    duration: number;
    cost?: number;
    tokens?: number;
  } {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { messageCount: 0, duration: 0 };
    }
    
    const duration = Date.now() - session.createdAt.getTime();
    const messageCount = session.messages.length;
    
    // Calculate cost and tokens from result messages
    let totalCost = 0;
    let totalTokens = 0;
    
    for (const msg of session.messages) {
      if (msg.type === 'result') {
        totalCost += msg.total_cost_usd || 0;
        if (msg.usage) {
          totalTokens += msg.usage.input_tokens + msg.usage.output_tokens;
        }
      }
    }
    
    return {
      messageCount,
      duration,
      cost: totalCost,
      tokens: totalTokens
    };
  }
}

// Export singleton instance
export const claudeCodeSDK = new ClaudeCodeSDKComplete();

// Export types for UI usage
export type { 
  Session, 
  SDKMessage, 
  SDKUserMessage, 
  SDKAssistantMessage, 
  SDKResultMessage,
  SDKSystemMessage,
  Options,
  PermissionMode,
  McpServerConfig
};