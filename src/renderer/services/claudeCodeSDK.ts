// Integration with Claude Code CLI (the actual claude command)
import { exec, spawn } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class ClaudeCodeSDK {
  private sessionId?: string;

  // Check if Claude Code is installed
  async checkInstallation(): Promise<boolean> {
    try {
      const { stdout } = await execAsync('which claude');
      return !!stdout.trim();
    } catch {
      return false;
    }
  }

  // Get version
  async getVersion(): Promise<string> {
    try {
      const { stdout } = await execAsync('claude --version');
      return stdout.trim();
    } catch {
      return 'Unknown';
    }
  }

  // Send a query using Claude Code CLI
  async query(prompt: string, options?: any): Promise<any> {
    try {
      // Use claude CLI with -p flag for non-interactive mode
      const command = `claude -p "${prompt.replace(/"/g, '\\"')}"`;
      
      const { stdout, stderr } = await execAsync(command, {
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
        timeout: 60000 // 60 second timeout
      });

      if (stderr) {
        console.warn('Claude Code stderr:', stderr);
      }

      return {
        success: true,
        data: stdout
      };
    } catch (error: any) {
      console.error('Claude Code error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Start interactive session
  async startSession(name?: string): Promise<string> {
    try {
      // Start a new claude session
      const { stdout } = await execAsync('claude');
      // Extract session ID from output if available
      this.sessionId = `session-${Date.now()}`;
      return this.sessionId;
    } catch (error: any) {
      throw new Error(`Failed to start session: ${error.message}`);
    }
  }

  // Resume a session
  async resumeSession(sessionId: string): Promise<boolean> {
    try {
      // Use claude -r to resume session
      const command = `claude -r "${sessionId}"`;
      await execAsync(command);
      this.sessionId = sessionId;
      return true;
    } catch {
      return false;
    }
  }

  // Continue last conversation
  async continueLastConversation(): Promise<boolean> {
    try {
      const { stdout } = await execAsync('claude -c');
      return true;
    } catch {
      return false;
    }
  }

  // Stream query (for real-time responses)
  streamQuery(prompt: string, onData: (data: string) => void, onError?: (error: Error) => void): void {
    const claude = spawn('claude', ['-p', prompt]);

    claude.stdout.on('data', (data) => {
      onData(data.toString());
    });

    claude.stderr.on('data', (data) => {
      console.error('Claude stderr:', data.toString());
      if (onError) {
        onError(new Error(data.toString()));
      }
    });

    claude.on('close', (code) => {
      if (code !== 0) {
        console.error(`Claude process exited with code ${code}`);
      }
    });
  }

  // Get current working directory's sessions
  async listSessions(): Promise<any[]> {
    try {
      // Claude Code stores sessions per directory
      // This would need to parse Claude's internal storage
      return [];
    } catch {
      return [];
    }
  }

  // Use specific model
  async setModel(model: string): Promise<void> {
    try {
      await execAsync(`claude config set model ${model}`);
    } catch (error: any) {
      throw new Error(`Failed to set model: ${error.message}`);
    }
  }

  // Get current configuration
  async getConfig(): Promise<any> {
    try {
      const { stdout } = await execAsync('claude config list');
      // Parse the output to get config
      return stdout;
    } catch {
      return {};
    }
  }
}

export const claudeCodeSDK = new ClaudeCodeSDK();