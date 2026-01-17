/**
 * Background Agents - TypeScript types for async agent execution
 */

// Agent status
export type AgentStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

// Agent type (maps to yume core agents)
export type AgentType =
  | 'architect'
  | 'explorer'
  | 'implementer'
  | 'guardian'
  | 'specialist'
  | string; // Custom agents

// Agent type display info
export const AGENT_TYPE_INFO: Record<string, { name: string; icon: string; description: string }> = {
  architect: {
    name: 'Architect',
    icon: '🏗️',
    description: 'Plans, designs, decomposes tasks',
  },
  explorer: {
    name: 'Explorer',
    icon: '🔍',
    description: 'Finds, reads, understands codebase',
  },
  implementer: {
    name: 'Implementer',
    icon: '⚙️',
    description: 'Codes, edits, builds',
  },
  guardian: {
    name: 'Guardian',
    icon: '🛡️',
    description: 'Reviews, audits, verifies',
  },
  specialist: {
    name: 'Specialist',
    icon: '🎯',
    description: 'Domain-specific tasks',
  },
};

// Progress information
export interface AgentProgress {
  turn_count: number;
  current_action: string;
  last_update: number; // Unix timestamp
  tokens_used: number;
}

// Background agent instance
export interface BackgroundAgent {
  id: string;
  agent_type: AgentType;
  prompt: string;
  cwd: string;
  model: string;
  status: AgentStatus;
  progress: AgentProgress;
  git_branch?: string;
  output_file?: string;
  created_at: number;
  started_at?: number;
  completed_at?: number;
  error_message?: string;
}

// Response for agent operations
export interface AgentResponse {
  success: boolean;
  agent_id?: string;
  error?: string;
}

// Queue agent request
export interface QueueAgentRequest {
  agent_type: AgentType;
  prompt: string;
  cwd: string;
  model: string;
  use_git_branch?: boolean;
}

// Agent output (loaded from file)
export interface AgentOutput {
  session: {
    id: string;
    history: Array<{
      role: string;
      content?: string;
      toolCalls?: unknown[];
    }>;
    usage: {
      inputTokens: number;
      outputTokens: number;
    };
  };
  result: {
    success: boolean;
    durationMs: number;
    numTurns: number;
  };
  timestamp: number;
}

// Get status display info
export function getStatusInfo(status: AgentStatus): { label: string; color: string; icon: string } {
  switch (status) {
    case 'queued':
      return { label: 'Queued', color: '#888', icon: '⏳' };
    case 'running':
      return { label: 'Running', color: '#4a9eff', icon: '🔄' };
    case 'completed':
      return { label: 'Completed', color: '#4ade80', icon: '✓' };
    case 'failed':
      return { label: 'Failed', color: '#f87171', icon: '✗' };
    case 'cancelled':
      return { label: 'Cancelled', color: '#fbbf24', icon: '⊘' };
    default:
      return { label: status, color: '#888', icon: '?' };
  }
}

// Get agent type display name
export function getAgentTypeName(type: AgentType): string {
  const info = AGENT_TYPE_INFO[type];
  return info?.name || type;
}

// Get agent type icon
export function getAgentTypeIcon(type: AgentType): string {
  const info = AGENT_TYPE_INFO[type];
  return info?.icon || '🤖';
}

// Format elapsed time
export function formatElapsedTime(startTime: number): string {
  const elapsed = Date.now() / 1000 - startTime;
  if (elapsed < 60) {
    return `${Math.floor(elapsed)}s`;
  } else if (elapsed < 3600) {
    const mins = Math.floor(elapsed / 60);
    const secs = Math.floor(elapsed % 60);
    return `${mins}m ${secs}s`;
  } else {
    const hours = Math.floor(elapsed / 3600);
    const mins = Math.floor((elapsed % 3600) / 60);
    return `${hours}h ${mins}m`;
  }
}

// Format timestamp
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default {
  AGENT_TYPE_INFO,
  getStatusInfo,
  getAgentTypeName,
  getAgentTypeIcon,
  formatElapsedTime,
  formatTimestamp,
};
