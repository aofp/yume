/**
 * Background Agent Service
 * Manages background agent queue and provides UI integration
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import type {
  BackgroundAgent,
  AgentResponse,
  QueueAgentRequest,
  AgentOutput,
  AgentStatus,
  AgentType,
} from '../types/backgroundAgents';

// Event listeners
type AgentEventListener = (agents: BackgroundAgent[]) => void;
type AgentUpdateListener = (agent: BackgroundAgent) => void;

class BackgroundAgentService {
  private listeners: Set<AgentEventListener> = new Set();
  private updateListeners: Set<AgentUpdateListener> = new Set();
  private unlistenFn: UnlistenFn | null = null;
  private cachedAgents: BackgroundAgent[] = [];

  /**
   * Initialize the service and start listening to events
   */
  async initialize(): Promise<void> {
    // Listen for backend agent status events
    if (!this.unlistenFn) {
      this.unlistenFn = await listen<BackgroundAgent>('background-agent-status', (event) => {
        const agent = event.payload;

        // Update cached agent
        const index = this.cachedAgents.findIndex(a => a.id === agent.id);
        if (index >= 0) {
          this.cachedAgents[index] = agent;
        } else {
          this.cachedAgents.push(agent);
        }

        // Notify individual agent update listeners
        this.notifyAgentUpdate(agent);

        // Notify all listeners
        this.notifyListeners();
      });

      // Initial fetch
      await this.refresh();
    }
  }

  /**
   * Stop listening and cleanup
   */
  destroy(): void {
    if (this.unlistenFn) {
      this.unlistenFn();
      this.unlistenFn = null;
    }
    this.listeners.clear();
    this.updateListeners.clear();
  }

  /**
   * Subscribe to agent list updates
   */
  subscribe(listener: AgentEventListener): () => void {
    this.listeners.add(listener);
    // Immediately emit current state
    listener(this.cachedAgents);
    return () => this.listeners.delete(listener);
  }

  /**
   * Subscribe to individual agent updates
   */
  subscribeToAgent(listener: AgentUpdateListener): () => void {
    this.updateListeners.add(listener);
    return () => this.updateListeners.delete(listener);
  }

  /**
   * Notify all listeners
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.cachedAgents);
      } catch (e) {
        console.error('Agent listener error:', e);
      }
    });
  }

  /**
   * Notify agent update listeners
   */
  private notifyAgentUpdate(agent: BackgroundAgent): void {
    this.updateListeners.forEach(listener => {
      try {
        listener(agent);
      } catch (e) {
        console.error('Agent update listener error:', e);
      }
    });
  }

  /**
   * Refresh agent list from backend
   */
  async refresh(): Promise<BackgroundAgent[]> {
    try {
      const agents = await invoke<BackgroundAgent[]>('get_agent_queue');

      // Check for status changes
      for (const agent of agents) {
        const cached = this.cachedAgents.find(a => a.id === agent.id);
        if (cached && cached.status !== agent.status) {
          this.notifyAgentUpdate(agent);
        }
      }

      this.cachedAgents = agents;
      this.notifyListeners();
      return agents;
    } catch (e) {
      console.error('Failed to refresh agents:', e);
      return this.cachedAgents;
    }
  }

  /**
   * Get all agents
   */
  getAgents(): BackgroundAgent[] {
    return this.cachedAgents;
  }

  /**
   * Get running agent count
   */
  getRunningCount(): number {
    return this.cachedAgents.filter(a => a.status === 'running').length;
  }

  /**
   * Get queued agent count
   */
  getQueuedCount(): number {
    return this.cachedAgents.filter(a => a.status === 'queued').length;
  }

  /**
   * Queue a new background agent
   */
  async queueAgent(request: QueueAgentRequest): Promise<AgentResponse> {
    try {
      const response = await invoke<AgentResponse>('queue_background_agent', {
        agentType: request.agent_type,
        prompt: request.prompt,
        cwd: request.cwd,
        model: request.model,
        useGitBranch: request.use_git_branch ?? true,
      });

      if (response.success) {
        // Refresh to get updated list
        await this.refresh();
      }

      return response;
    } catch (e) {
      console.error('Failed to queue agent:', e);
      return {
        success: false,
        error: String(e),
      };
    }
  }

  /**
   * Cancel a running or queued agent
   */
  async cancelAgent(agentId: string): Promise<AgentResponse> {
    try {
      const response = await invoke<AgentResponse>('cancel_background_agent', {
        agentId,
      });

      if (response.success) {
        await this.refresh();
      }

      return response;
    } catch (e) {
      console.error('Failed to cancel agent:', e);
      return {
        success: false,
        agent_id: agentId,
        error: String(e),
      };
    }
  }

  /**
   * Remove a completed/failed/cancelled agent
   */
  async removeAgent(agentId: string): Promise<AgentResponse> {
    try {
      const response = await invoke<AgentResponse>('remove_background_agent', {
        agentId,
      });

      if (response.success) {
        await this.refresh();
      }

      return response;
    } catch (e) {
      console.error('Failed to remove agent:', e);
      return {
        success: false,
        agent_id: agentId,
        error: String(e),
      };
    }
  }

  /**
   * Get agent output (session file)
   */
  async getAgentOutput(agentId: string): Promise<AgentOutput | null> {
    try {
      const output = await invoke<string>('get_agent_output', { agentId });
      return JSON.parse(output);
    } catch (e) {
      console.error('Failed to get agent output:', e);
      return null;
    }
  }

  /**
   * Get agent by ID
   */
  async getAgent(agentId: string): Promise<BackgroundAgent | null> {
    try {
      return await invoke<BackgroundAgent | null>('get_background_agent', { agentId });
    } catch (e) {
      console.error('Failed to get agent:', e);
      return null;
    }
  }

  /**
   * Get branch diff for agent
   */
  async getBranchDiff(agentId: string): Promise<string | null> {
    try {
      return await invoke<string>('get_agent_branch_diff', { agentId });
    } catch (e) {
      console.error('Failed to get branch diff:', e);
      return null;
    }
  }

  /**
   * Check for merge conflicts
   */
  async checkMergeConflicts(agentId: string): Promise<boolean> {
    try {
      return await invoke<boolean>('check_agent_merge_conflicts', { agentId });
    } catch (e) {
      console.error('Failed to check merge conflicts:', e);
      return false;
    }
  }

  /**
   * Merge agent branch into main
   */
  async mergeAgentBranch(agentId: string, commitMessage?: string): Promise<AgentResponse> {
    try {
      const response = await invoke<AgentResponse>('merge_agent_branch', {
        agentId,
        commitMessage,
      });

      if (response.success) {
        await this.refresh();
      }

      return response;
    } catch (e) {
      console.error('Failed to merge agent branch:', e);
      return {
        success: false,
        agent_id: agentId,
        error: String(e),
      };
    }
  }

  /**
   * Delete agent branch without merging
   */
  async deleteAgentBranch(agentId: string): Promise<AgentResponse> {
    try {
      return await invoke<AgentResponse>('delete_agent_branch', { agentId });
    } catch (e) {
      console.error('Failed to delete agent branch:', e);
      return {
        success: false,
        agent_id: agentId,
        error: String(e),
      };
    }
  }

  /**
   * Cleanup old agents
   */
  async cleanupOldAgents(): Promise<void> {
    try {
      await invoke('cleanup_old_agents');
      await this.refresh();
    } catch (e) {
      console.error('Failed to cleanup old agents:', e);
    }
  }
}

// Singleton instance
export const backgroundAgentService = new BackgroundAgentService();

export default backgroundAgentService;
