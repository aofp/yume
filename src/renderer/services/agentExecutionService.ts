import { claudeCodeClient } from './claudeCodeClient';

export interface AgentConfig {
  name: string;
  systemPrompt: string;
  task?: string;
  model?: 'opus' | 'sonnet' | 'haiku';
  maxTokens?: number;
  temperature?: number;
  createCheckpoint?: boolean;
  tools?: string[]; // List of allowed tools
}

export interface AgentRun {
  id: string;
  sessionId: string;
  status: 'starting' | 'running' | 'completed' | 'failed' | 'stopped';
  config: AgentConfig;
  projectPath: string;
  startTime: string;
  endTime: string | null;
  output: Array<{
    timestamp: string;
    data: any;
  }>;
  metrics: {
    messagesProcessed: number;
    tokensUsed: number;
    toolsExecuted: number;
    errors: number;
  };
}

class AgentExecutionService {
  private socket = claudeCodeClient.socket;
  private activeRuns = new Map<string, AgentRun>();
  private runHistory = new Map<string, AgentRun[]>(); // sessionId -> runs

  constructor() {
    this.setupListeners();
  }

  private setupListeners() {
    this.socket.on('agent-started', (data: any) => {
      console.log('🤖 Agent started:', data);
      const { runId, sessionId, config } = data;
      
      // Create initial run record
      const run: AgentRun = {
        id: runId,
        sessionId,
        status: 'running',
        config,
        projectPath: '',
        startTime: new Date().toISOString(),
        endTime: null,
        output: [],
        metrics: {
          messagesProcessed: 0,
          tokensUsed: 0,
          toolsExecuted: 0,
          errors: 0,
        },
      };
      
      this.activeRuns.set(runId, run);
      this.addToHistory(sessionId, run);
      
      // Notify UI
      window.dispatchEvent(new CustomEvent('agent-started', { 
        detail: { runId, sessionId, config } 
      }));
    });

    this.socket.on('agent-progress', (data: any) => {
      const { runId, sessionId, data: progressData, metrics } = data;
      
      const run = this.activeRuns.get(runId);
      if (run) {
        run.output.push({
          timestamp: new Date().toISOString(),
          data: progressData,
        });
        run.metrics = metrics;
      }
      
      // Notify UI with progress
      window.dispatchEvent(new CustomEvent('agent-progress', { 
        detail: { runId, sessionId, data: progressData, metrics } 
      }));
    });

    this.socket.on('agent-completed', (data: any) => {
      console.log('✅ Agent completed:', data);
      const { runId, sessionId, status, metrics } = data;
      
      const run = this.activeRuns.get(runId);
      if (run) {
        run.status = status;
        run.endTime = new Date().toISOString();
        run.metrics = metrics;
        this.activeRuns.delete(runId);
      }
      
      window.dispatchEvent(new CustomEvent('agent-completed', { 
        detail: { runId, sessionId, status, metrics } 
      }));
    });

    this.socket.on('agent-stopped', (data: any) => {
      console.log('⏹️ Agent stopped:', data);
      const { runId } = data;
      
      const run = this.activeRuns.get(runId);
      if (run) {
        run.status = 'stopped';
        run.endTime = new Date().toISOString();
        this.activeRuns.delete(runId);
      }
      
      window.dispatchEvent(new CustomEvent('agent-stopped', { 
        detail: { runId } 
      }));
    });

    this.socket.on('agent-error', (data: any) => {
      console.error('❌ Agent error:', data);
      const { runId, sessionId, error } = data;
      
      const run = this.activeRuns.get(runId);
      if (run) {
        run.metrics.errors++;
      }
      
      window.dispatchEvent(new CustomEvent('agent-error', { 
        detail: { runId, sessionId, error } 
      }));
    });

    this.socket.on('agent-runs-data', (data: any) => {
      const { sessionId, runs } = data;
      this.runHistory.set(sessionId, runs);
      
      window.dispatchEvent(new CustomEvent('agent-runs-updated', { 
        detail: { sessionId, runs } 
      }));
    });
  }

  private addToHistory(sessionId: string, run: AgentRun) {
    if (!this.runHistory.has(sessionId)) {
      this.runHistory.set(sessionId, []);
    }
    this.runHistory.get(sessionId)?.push(run);
  }

  // Execute an agent
  executeAgent(sessionId: string, config: AgentConfig, projectPath?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      console.log(`🤖 Executing agent for session ${sessionId}:`, config);
      
      const handleStarted = (event: any) => {
        const detail = event.detail;
        if (detail.sessionId === sessionId) {
          window.removeEventListener('agent-started', handleStarted);
          window.removeEventListener('agent-error', handleError);
          resolve(detail.runId);
        }
      };
      
      const handleError = (event: any) => {
        const detail = event.detail;
        if (detail.sessionId === sessionId) {
          window.removeEventListener('agent-started', handleStarted);
          window.removeEventListener('agent-error', handleError);
          reject(new Error(detail.error));
        }
      };
      
      window.addEventListener('agent-started', handleStarted);
      window.addEventListener('agent-error', handleError);
      
      this.socket.emit('execute-agent', {
        sessionId,
        agentConfig: config,
        projectPath,
      });
      
      // Timeout after 10 seconds
      setTimeout(() => {
        window.removeEventListener('agent-started', handleStarted);
        window.removeEventListener('agent-error', handleError);
        reject(new Error('Agent execution timeout'));
      }, 10000);
    });
  }

  // Stop a running agent
  stopAgent(runId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`⏹️ Stopping agent ${runId}`);
      
      const handleStopped = (event: any) => {
        const detail = event.detail;
        if (detail.runId === runId) {
          window.removeEventListener('agent-stopped', handleStopped);
          window.removeEventListener('agent-error', handleError);
          resolve();
        }
      };
      
      const handleError = (event: any) => {
        const detail = event.detail;
        if (detail.runId === runId) {
          window.removeEventListener('agent-stopped', handleStopped);
          window.removeEventListener('agent-error', handleError);
          reject(new Error(detail.error));
        }
      };
      
      window.addEventListener('agent-stopped', handleStopped);
      window.addEventListener('agent-error', handleError);
      
      this.socket.emit('stop-agent', { runId });
      
      // Timeout after 5 seconds
      setTimeout(() => {
        window.removeEventListener('agent-stopped', handleStopped);
        window.removeEventListener('agent-error', handleError);
        reject(new Error('Agent stop timeout'));
      }, 5000);
    });
  }

  // Get agent runs for a session
  getAgentRuns(sessionId: string): Promise<AgentRun[]> {
    return new Promise((resolve) => {
      // Check cache first
      const cached = this.runHistory.get(sessionId);
      if (cached) {
        resolve(cached);
      }
      
      const handleRuns = (event: any) => {
        const detail = event.detail;
        if (detail.sessionId === sessionId) {
          window.removeEventListener('agent-runs-updated', handleRuns);
          resolve(detail.runs);
        }
      };
      
      window.addEventListener('agent-runs-updated', handleRuns);
      
      this.socket.emit('get-agent-runs', { sessionId });
      
      // Return cached or empty after 2 seconds
      setTimeout(() => {
        window.removeEventListener('agent-runs-updated', handleRuns);
        resolve(cached || []);
      }, 2000);
    });
  }

  // Get active runs
  getActiveRuns(): AgentRun[] {
    return Array.from(this.activeRuns.values());
  }

  // Get specific run
  getRun(runId: string): AgentRun | undefined {
    return this.activeRuns.get(runId);
  }

  // Predefined agent templates
  static readonly AGENT_TEMPLATES = {
    codeReviewer: {
      name: 'Code Reviewer',
      systemPrompt: `You are a thorough code reviewer. Analyze the codebase for:
- Code quality issues
- Performance problems
- Security vulnerabilities
- Best practice violations
- Suggest improvements with specific examples`,
      model: 'opus' as const,
      createCheckpoint: true,
    },
    testWriter: {
      name: 'Test Writer',
      systemPrompt: `You are a test writing specialist. Your task is to:
- Analyze the existing code
- Identify areas lacking test coverage
- Write comprehensive unit tests
- Include edge cases and error scenarios
- Use the project's existing test framework`,
      model: 'sonnet' as const,
      createCheckpoint: true,
    },
    refactorer: {
      name: 'Code Refactorer',
      systemPrompt: `You are a code refactoring expert. Your goals:
- Identify code smells and anti-patterns
- Suggest and implement refactorings
- Improve code readability and maintainability
- Preserve existing functionality
- Follow SOLID principles`,
      model: 'opus' as const,
      createCheckpoint: true,
    },
    documentor: {
      name: 'Documentation Writer',
      systemPrompt: `You are a documentation specialist. Your tasks:
- Add comprehensive JSDoc/TypeDoc comments
- Create or update README files
- Document complex logic and algorithms
- Add inline comments for clarity
- Generate API documentation`,
      model: 'sonnet' as const,
      createCheckpoint: false,
    },
  };
}

export const agentExecutionService = new AgentExecutionService();