// Integration with the actual Claude Code SDK
// This uses @anthropic-ai/claude-code package
import { query, type SDKMessage, type Options } from '@anthropic-ai/claude-code';

export class ClaudeCodeService {
  private currentQuery?: any;
  
  // Send a query using Claude Code SDK
  async sendQuery(prompt: string, options?: Options): Promise<{ success: boolean; data: string; messages: SDKMessage[] }> {
    try {
      const messages: SDKMessage[] = [];
      let finalResult = '';
      
      // Use the Claude Code SDK query function
      const response = query({ 
        prompt, 
        options: {
          ...options,
          // Allow specific tools for the UI
          allowedTools: options?.allowedTools || [
            'Read', 'Write', 'Edit', 'MultiEdit',
            'LS', 'Glob', 'Grep',
            'Bash',
            'WebFetch', 'WebSearch',
            'TodoWrite'
          ],
          maxTurns: options?.maxTurns || 10,
          permissionMode: options?.permissionMode || 'default',
        }
      });
      
      this.currentQuery = response;
      
      // Collect all messages from the response
      for await (const message of response) {
        messages.push(message);
        
        // Handle different message types
        switch (message.type) {
          case 'assistant':
            // Extract text content from assistant messages
            if (message.message.content) {
              for (const content of message.message.content) {
                if (content.type === 'text') {
                  finalResult += content.text;
                }
              }
            }
            break;
            
          case 'result':
            // Handle final result
            if (message.subtype === 'success') {
              finalResult = message.result || finalResult;
            }
            break;
            
          case 'system':
            // Log system messages
            console.log('Claude Code System:', message);
            break;
        }
      }
      
      return {
        success: true,
        data: finalResult || 'Query completed',
        messages
      };
      
    } catch (error: any) {
      console.error('Claude Code SDK error:', error);
      return {
        success: false,
        data: error.message,
        messages: []
      };
    }
  }
  
  // Stream query for real-time responses
  async* streamQuery(prompt: string, options?: Options): AsyncGenerator<SDKMessage> {
    try {
      const response = query({ 
        prompt,
        options: {
          ...options,
          allowedTools: options?.allowedTools || [
            'Read', 'Write', 'Edit', 'MultiEdit',
            'LS', 'Glob', 'Grep',
            'Bash',
            'WebFetch', 'WebSearch',
            'TodoWrite'
          ],
          maxTurns: options?.maxTurns || 10,
        }
      });
      
      this.currentQuery = response;
      
      // Yield messages as they come
      for await (const message of response) {
        yield message;
      }
      
    } catch (error: any) {
      console.error('Claude Code SDK streaming error:', error);
      throw error;
    }
  }
  
  // Interrupt current query
  async interrupt(): Promise<void> {
    if (this.currentQuery && typeof this.currentQuery.interrupt === 'function') {
      await this.currentQuery.interrupt();
    }
  }
  
  // Create a session (Claude Code manages sessions automatically)
  async createSession(name?: string): Promise<string> {
    // Claude Code SDK manages sessions internally
    // Return a mock session ID for UI compatibility
    return `claude-session-${Date.now()}`;
  }
  
  // Resume a session
  async resumeSession(sessionId: string): Promise<boolean> {
    // Use the resume option in query
    // This would be handled in the next query with options.resume
    return true;
  }
  
  // Continue last conversation
  async continueConversation(): Promise<boolean> {
    // Use the continue option in query
    // This would be handled in the next query with options.continue = true
    return true;
  }
}

export const claudeCodeService = new ClaudeCodeService();