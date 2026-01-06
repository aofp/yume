import { claudeCodeClient } from './claudeCodeClient';
import type { Socket } from 'socket.io-client';

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
    data: unknown;
  }>;
  metrics: {
    messagesProcessed: number;
    tokensUsed: number;
    toolsExecuted: number;
    errors: number;
  };
}

// Type definitions for socket events
interface AgentStartedEvent {
  runId: string;
  sessionId: string;
  config: AgentConfig;
  projectPath?: string;
}

// Pending request tracking for projectPath
interface PendingRequest {
  sessionId: string;
  projectPath?: string;
}

interface AgentProgressEvent {
  runId: string;
  sessionId: string;
  data: unknown;
  metrics: AgentRun['metrics'];
}

interface AgentCompletedEvent {
  runId: string;
  sessionId: string;
  status: AgentRun['status'];
  metrics: AgentRun['metrics'];
}

interface AgentStoppedEvent {
  runId: string;
}

interface AgentErrorEvent {
  runId: string;
  sessionId: string;
  error: string;
}

interface AgentRunsDataEvent {
  sessionId: string;
  runs: AgentRun[];
}

class AgentExecutionService {
  // Limits to prevent memory leaks
  private static readonly MAX_RUNS_PER_SESSION = 100;
  private static readonly MAX_OUTPUT_ENTRIES = 1000;

  private activeRuns = new Map<string, AgentRun>();
  private runHistory = new Map<string, AgentRun[]>(); // sessionId -> runs
  private pendingRequests = new Map<string, PendingRequest>(); // sessionId -> pending request
  private currentSocket: Socket | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  private get socket() {
    return claudeCodeClient.getSocket();
  }

  constructor() {
    this.setupListeners();
    // Check for socket changes periodically (handles reconnection)
    this.intervalId = setInterval(() => this.ensureListenersAttached(), 5000);
  }

  // Cleanup method for destroying the service
  destroy(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.currentSocket) {
      this.removeListeners(this.currentSocket);
      this.currentSocket = null;
    }
    this.activeRuns.clear();
    this.runHistory.clear();
    this.pendingRequests.clear();
  }

  private ensureListenersAttached() {
    const socket = this.socket;
    if (socket === this.currentSocket) return;

    // Remove old listeners if socket changed
    if (this.currentSocket) {
      this.removeListeners(this.currentSocket);
    }

    this.currentSocket = socket;
    if (socket) {
      this.attachListeners(socket);
    }
  }

  private removeListeners(socket: Socket) {
    socket.off('agent-started');
    socket.off('agent-progress');
    socket.off('agent-completed');
    socket.off('agent-stopped');
    socket.off('agent-error');
    socket.off('agent-runs-data');
  }

  private attachListeners(socket: Socket) {
    socket.on('agent-started', (data: AgentStartedEvent) => {
      console.log('[Agent] Started:', data);
      const { runId, sessionId, config, projectPath: serverProjectPath } = data;

      // Get projectPath from pending request or server response
      const pending = this.pendingRequests.get(sessionId);
      const projectPath = serverProjectPath || pending?.projectPath || '';
      this.pendingRequests.delete(sessionId);

      // Create initial run record
      const run: AgentRun = {
        id: runId,
        sessionId,
        status: 'running',
        config,
        projectPath,
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
        detail: { runId, sessionId, config, projectPath }
      }));
    });

    socket.on('agent-progress', (data: AgentProgressEvent) => {
      const { runId, sessionId, data: progressData, metrics } = data;

      const run = this.activeRuns.get(runId);
      if (run) {
        // Limit output array size to prevent memory leak
        if (run.output.length < AgentExecutionService.MAX_OUTPUT_ENTRIES) {
          run.output.push({
            timestamp: new Date().toISOString(),
            data: progressData,
          });
        }
        run.metrics = metrics;
      }

      // Notify UI with progress
      window.dispatchEvent(new CustomEvent('agent-progress', {
        detail: { runId, sessionId, data: progressData, metrics }
      }));
    });

    socket.on('agent-completed', (data: AgentCompletedEvent) => {
      console.log('[Agent] Completed:', data);
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

    socket.on('agent-stopped', (data: AgentStoppedEvent) => {
      console.log('[Agent] Stopped:', data);
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

    socket.on('agent-error', (data: AgentErrorEvent) => {
      console.error('[Agent] Error:', data);
      const { runId, sessionId, error } = data;

      const run = this.activeRuns.get(runId);
      if (run) {
        run.metrics.errors++;
      }

      window.dispatchEvent(new CustomEvent('agent-error', {
        detail: { runId, sessionId, error }
      }));
    });

    socket.on('agent-runs-data', (data: AgentRunsDataEvent) => {
      const { sessionId, runs } = data;
      this.runHistory.set(sessionId, runs);

      window.dispatchEvent(new CustomEvent('agent-runs-updated', {
        detail: { sessionId, runs }
      }));
    });
  }

  private setupListeners() {
    const socket = this.socket;
    if (!socket) return;

    this.currentSocket = socket;
    this.attachListeners(socket);
  }

  private addToHistory(sessionId: string, run: AgentRun) {
    if (!this.runHistory.has(sessionId)) {
      this.runHistory.set(sessionId, []);
    }
    const history = this.runHistory.get(sessionId)!;
    history.push(run);

    // Trim old entries to prevent memory leak
    if (history.length > AgentExecutionService.MAX_RUNS_PER_SESSION) {
      history.splice(0, history.length - AgentExecutionService.MAX_RUNS_PER_SESSION);
    }
  }

  // Execute an agent
  executeAgent(sessionId: string, config: AgentConfig, projectPath?: string): Promise<string> {
    // Capture socket reference once to avoid race condition
    const socket = this.socket;
    if (!socket) {
      return Promise.reject(new Error('Socket not connected'));
    }

    return new Promise((resolve, reject) => {
      console.log(`🤖 Executing agent for session ${sessionId}:`, config);

      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout>;

      const cleanup = (clearPending = false) => {
        settled = true;
        clearTimeout(timeoutId);
        window.removeEventListener('agent-started', handleStarted);
        window.removeEventListener('agent-error', handleError);
        if (clearPending) {
          this.pendingRequests.delete(sessionId);
        }
      };

      const handleStarted = (event: Event) => {
        if (settled) return;
        const detail = (event as CustomEvent<{ runId: string; sessionId: string }>).detail;
        if (detail.sessionId === sessionId) {
          cleanup(); // Don't clear pending - agent-started handler will
          resolve(detail.runId);
        }
      };

      const handleError = (event: Event) => {
        if (settled) return;
        const detail = (event as CustomEvent<{ sessionId: string; error: string }>).detail;
        if (detail.sessionId === sessionId) {
          cleanup(true); // Clear pending on error
          reject(new Error(detail.error));
        }
      };

      window.addEventListener('agent-started', handleStarted);
      window.addEventListener('agent-error', handleError);

      // Store pending request for projectPath tracking
      this.pendingRequests.set(sessionId, { sessionId, projectPath });

      socket.emit('execute-agent', {
        sessionId,
        agentConfig: config,
        projectPath,
      });

      // Timeout after 10 seconds
      timeoutId = setTimeout(() => {
        if (!settled) {
          cleanup(true); // Clear pending on timeout
          reject(new Error('Agent execution timeout'));
        }
      }, 10000);
    });
  }

  // Stop a running agent
  stopAgent(runId: string): Promise<void> {
    // Capture socket reference once to avoid race condition
    const socket = this.socket;
    if (!socket) {
      return Promise.reject(new Error('Socket not connected'));
    }

    return new Promise((resolve, reject) => {
      console.log(`⏹️ Stopping agent ${runId}`);

      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout>;

      const cleanup = () => {
        settled = true;
        clearTimeout(timeoutId);
        window.removeEventListener('agent-stopped', handleStopped);
        window.removeEventListener('agent-error', handleError);
      };

      const handleStopped = (event: Event) => {
        if (settled) return;
        const detail = (event as CustomEvent<{ runId: string }>).detail;
        if (detail.runId === runId) {
          cleanup();
          resolve();
        }
      };

      const handleError = (event: Event) => {
        if (settled) return;
        const detail = (event as CustomEvent<{ runId: string; error: string }>).detail;
        if (detail.runId === runId) {
          cleanup();
          reject(new Error(detail.error));
        }
      };

      window.addEventListener('agent-stopped', handleStopped);
      window.addEventListener('agent-error', handleError);

      socket.emit('stop-agent', { runId });

      // Timeout after 5 seconds
      timeoutId = setTimeout(() => {
        if (!settled) {
          cleanup();
          reject(new Error('Agent stop timeout'));
        }
      }, 5000);
    });
  }

  // Get agent runs for a session
  getAgentRuns(sessionId: string): Promise<AgentRun[]> {
    // Return cached immediately if available (including empty arrays)
    if (this.runHistory.has(sessionId)) {
      return Promise.resolve(this.runHistory.get(sessionId)!);
    }

    // Capture socket reference once to avoid race condition
    const socket = this.socket;
    if (!socket) {
      return Promise.resolve([]);
    }

    return new Promise((resolve) => {
      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout>;

      const cleanup = () => {
        settled = true;
        clearTimeout(timeoutId);
        window.removeEventListener('agent-runs-updated', handleRuns);
      };

      const handleRuns = (event: Event) => {
        if (settled) return;
        const detail = (event as CustomEvent<{ sessionId: string; runs: AgentRun[] }>).detail;
        if (detail.sessionId === sessionId) {
          cleanup();
          resolve(detail.runs);
        }
      };

      window.addEventListener('agent-runs-updated', handleRuns);

      socket.emit('get-agent-runs', { sessionId });

      // Return empty after 2 seconds
      timeoutId = setTimeout(() => {
        if (!settled) {
          cleanup();
          resolve([]);
        }
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

  // Clear history for a session (for cleanup)
  clearHistory(sessionId: string): void {
    this.runHistory.delete(sessionId);
  }

  // The 5 Yurucode Core Agents
  static readonly AGENT_TEMPLATES = {
    architect: {
      name: 'architect',
      systemPrompt: `architect agent. plan, design, decompose. think first. output: steps, dependencies, risks. use TodoWrite.`,
      model: 'opus' as const,
      createCheckpoint: true,
    },
    explorer: {
      name: 'explorer',
      systemPrompt: `explorer agent. find, read, understand. use Glob, Grep, Read. output: paths, snippets, structure. no edits.`,
      model: 'sonnet' as const,
      createCheckpoint: false,
    },
    implementer: {
      name: 'implementer',
      systemPrompt: `implementer agent. code, edit, build. read before edit. small changes. output: working code, minimal diff.`,
      model: 'opus' as const,
      createCheckpoint: true,
    },
    guardian: {
      name: 'guardian',
      systemPrompt: `guardian agent. review, audit, verify. check bugs, security, performance. output: issues, severity, fixes.`,
      model: 'opus' as const,
      createCheckpoint: true,
    },
    specialist: {
      name: 'specialist',
      systemPrompt: `specialist agent. adapt to domain: test, docs, devops, data. output: domain artifacts.`,
      model: 'sonnet' as const,
      createCheckpoint: true,
    },
  };
}

export const agentExecutionService = new AgentExecutionService();
