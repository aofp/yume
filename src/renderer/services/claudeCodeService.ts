/**
 * Claude Code Service - Smart wrapper that uses Electron IPC or fallback
 */

export class ClaudeCodeService {
  private useElectron: boolean;

  constructor() {
    // Check if we're in Electron with Claude Code IPC available
    this.useElectron = !!(window as any).electronAPI?.claudeCode;
    
    if (this.useElectron) {
      console.log('✅ Using Claude Code SDK via Electron IPC');
    } else {
      console.log('⚠️ Running in browser mode - Claude Code features limited');
    }
  }

  async createSession(name: string, options?: any): Promise<string> {
    if (this.useElectron) {
      const result = await (window as any).electronAPI.claudeCode.createSession(name, options);
      if (result.success) {
        return result.sessionId;
      }
      throw new Error(result.error);
    }
    
    // Fallback for browser
    return `browser-session-${Date.now()}`;
  }

  async sendMessage(sessionId: string, content: string): Promise<any> {
    if (this.useElectron) {
      const result = await (window as any).electronAPI.claudeCode.sendMessage(sessionId, content);
      if (result.success) {
        return result.messages;
      }
      throw new Error(result.error);
    }
    
    // Fallback for browser - return mock
    return [{
      type: 'assistant',
      message: {
        content: [{
          type: 'text',
          text: `Mock response (run in Electron for real Claude Code SDK): "${content}"`
        }]
      }
    }];
  }

  async getSession(sessionId: string): Promise<any> {
    if (this.useElectron) {
      return await (window as any).electronAPI.claudeCode.getSession(sessionId);
    }
    return null;
  }

  async getAllSessions(): Promise<any[]> {
    if (this.useElectron) {
      return await (window as any).electronAPI.claudeCode.getAllSessions();
    }
    return [];
  }

  async pauseSession(sessionId: string): Promise<boolean> {
    if (this.useElectron) {
      const result = await (window as any).electronAPI.claudeCode.pauseSession(sessionId);
      return result.success;
    }
    return true;
  }

  async resumeSession(sessionId: string): Promise<boolean> {
    if (this.useElectron) {
      const result = await (window as any).electronAPI.claudeCode.resumeSession(sessionId);
      return result.success;
    }
    return true;
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    if (this.useElectron) {
      const result = await (window as any).electronAPI.claudeCode.deleteSession(sessionId);
      return result.success;
    }
    return true;
  }

  onMessage(sessionId: string, callback: (message: any) => void): () => void {
    if (this.useElectron && (window as any).electronAPI.claudeCode.onMessage) {
      return (window as any).electronAPI.claudeCode.onMessage(sessionId, callback);
    }
    // Return no-op cleanup function for browser
    return () => {};
  }

  isAvailable(): boolean {
    return this.useElectron;
  }
}

export const claudeCodeService = new ClaudeCodeService();