/**
 * AgentQueuePanel - Panel showing background agent queue and status
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  IconX,
  IconPlayerStop,
  IconTrash,
  IconRefresh,
  IconGitMerge,
  IconEye,
  IconChevronDown,
  IconChevronRight,
  IconLoader2,
} from '@tabler/icons-react';
import { backgroundAgentService } from '../../services/backgroundAgentService';
import type { BackgroundAgent } from '../../types/backgroundAgents';
import {
  getStatusInfo,
  getAgentTypeName,
  getAgentTypeIcon,
  formatElapsedTime,
  formatTimestamp,
} from '../../types/backgroundAgents';
import { ProgressIndicator } from './ProgressIndicator';
import './AgentQueuePanel.css';

interface AgentQueuePanelProps {
  isOpen: boolean;
  onClose: () => void;
  onViewOutput?: (agentId: string) => void;
}

export const AgentQueuePanel: React.FC<AgentQueuePanelProps> = ({
  isOpen,
  onClose,
  onViewOutput,
}) => {
  const [agents, setAgents] = useState<BackgroundAgent[]>([]);
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to agent updates
  useEffect(() => {
    const unsubscribe = backgroundAgentService.subscribe((updatedAgents) => {
      setAgents(updatedAgents);
      setLoading(false);
    });

    // Initialize service
    backgroundAgentService.initialize().catch((e) => {
      console.error('Failed to initialize agent service:', e);
      setError('Failed to load agents');
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    await backgroundAgentService.refresh();
    setLoading(false);
  }, []);

  const handleCancel = useCallback(async (agentId: string) => {
    const response = await backgroundAgentService.cancelAgent(agentId);
    if (!response.success) {
      setError(response.error || 'Failed to cancel agent');
    }
  }, []);

  const handleRemove = useCallback(async (agentId: string) => {
    const response = await backgroundAgentService.removeAgent(agentId);
    if (!response.success) {
      setError(response.error || 'Failed to remove agent');
    }
  }, []);

  const handleMerge = useCallback(async (agentId: string) => {
    const response = await backgroundAgentService.mergeAgentBranch(agentId);
    if (!response.success) {
      setError(response.error || 'Failed to merge agent branch');
    }
  }, []);

  const toggleExpand = useCallback((agentId: string) => {
    setExpandedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) {
        next.delete(agentId);
      } else {
        next.add(agentId);
      }
      return next;
    });
  }, []);

  if (!isOpen) return null;

  const runningAgents = agents.filter((a) => a.status === 'running');
  const queuedAgents = agents.filter((a) => a.status === 'queued');
  const completedAgents = agents.filter(
    (a) => a.status === 'completed' || a.status === 'failed' || a.status === 'cancelled'
  );

  return (
    <div className="agent-queue-panel">
      <div className="agent-queue-header">
        <div className="agent-queue-title">
          <span>background agents</span>
          {runningAgents.length > 0 && (
            <span className="agent-count running">{runningAgents.length} running</span>
          )}
          {queuedAgents.length > 0 && (
            <span className="agent-count queued">{queuedAgents.length} queued</span>
          )}
        </div>
        <div className="agent-queue-actions">
          <button
            className="agent-queue-btn"
            onClick={handleRefresh}
            title="refresh"
            disabled={loading}
          >
            <IconRefresh size={14} className={loading ? 'spin' : ''} />
          </button>
          <button className="agent-queue-btn" onClick={onClose} title="close">
            <IconX size={14} />
          </button>
        </div>
      </div>

      {error && (
        <div className="agent-queue-error">
          <span>{error}</span>
          <button onClick={() => setError(null)}>
            <IconX size={12} />
          </button>
        </div>
      )}

      <div className="agent-queue-content">
        {loading && agents.length === 0 ? (
          <div className="agent-queue-loading">
            <IconLoader2 size={16} className="spin" />
            <span>loading agents...</span>
          </div>
        ) : agents.length === 0 ? (
          <div className="agent-queue-empty">
            <span>no background agents</span>
            <p>use "run in background" to queue an agent</p>
          </div>
        ) : (
          <div className="agent-list">
            {/* Running Agents */}
            {runningAgents.length > 0 && (
              <div className="agent-section">
                <div className="agent-section-header">running</div>
                {runningAgents.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    expanded={expandedAgents.has(agent.id)}
                    onToggle={() => toggleExpand(agent.id)}
                    onCancel={() => handleCancel(agent.id)}
                    onRemove={() => handleRemove(agent.id)}
                    onMerge={() => handleMerge(agent.id)}
                    onViewOutput={() => onViewOutput?.(agent.id)}
                  />
                ))}
              </div>
            )}

            {/* Queued Agents */}
            {queuedAgents.length > 0 && (
              <div className="agent-section">
                <div className="agent-section-header">queued</div>
                {queuedAgents.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    expanded={expandedAgents.has(agent.id)}
                    onToggle={() => toggleExpand(agent.id)}
                    onCancel={() => handleCancel(agent.id)}
                    onRemove={() => handleRemove(agent.id)}
                    onMerge={() => handleMerge(agent.id)}
                    onViewOutput={() => onViewOutput?.(agent.id)}
                  />
                ))}
              </div>
            )}

            {/* Completed Agents */}
            {completedAgents.length > 0 && (
              <div className="agent-section">
                <div className="agent-section-header">completed</div>
                {completedAgents.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    expanded={expandedAgents.has(agent.id)}
                    onToggle={() => toggleExpand(agent.id)}
                    onCancel={() => handleCancel(agent.id)}
                    onRemove={() => handleRemove(agent.id)}
                    onMerge={() => handleMerge(agent.id)}
                    onViewOutput={() => onViewOutput?.(agent.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

interface AgentCardProps {
  agent: BackgroundAgent;
  expanded: boolean;
  onToggle: () => void;
  onCancel: () => void;
  onRemove: () => void;
  onMerge: () => void;
  onViewOutput: () => void;
}

const AgentCard: React.FC<AgentCardProps> = ({
  agent,
  expanded,
  onToggle,
  onCancel,
  onRemove,
  onMerge,
  onViewOutput,
}) => {
  const statusInfo = getStatusInfo(agent.status);
  const isRunning = agent.status === 'running';
  const isQueued = agent.status === 'queued';
  const isCompleted = agent.status === 'completed';
  const hasBranch = !!agent.git_branch;

  return (
    <div className={`agent-card ${agent.status}`}>
      <div className="agent-card-header" onClick={onToggle}>
        <button className="agent-expand-btn">
          {expanded ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
        </button>
        <span className="agent-type-icon">{getAgentTypeIcon(agent.agent_type)}</span>
        <div className="agent-info">
          <span className="agent-name">{getAgentTypeName(agent.agent_type)}</span>
          <span className="agent-prompt">{agent.prompt.slice(0, 50)}...</span>
        </div>
        <span className="agent-status" style={{ color: statusInfo.color }}>
          {statusInfo.icon} {statusInfo.label}
        </span>
      </div>

      {isRunning && (
        <ProgressIndicator
          turnCount={agent.progress.turn_count}
          currentAction={agent.progress.current_action}
          startedAt={agent.started_at || agent.created_at}
          tokensUsed={agent.progress.tokens_used}
        />
      )}

      {expanded && (
        <div className="agent-card-details">
          <div className="agent-detail">
            <span className="detail-label">id:</span>
            <span className="detail-value">{agent.id}</span>
          </div>
          <div className="agent-detail">
            <span className="detail-label">model:</span>
            <span className="detail-value">{agent.model}</span>
          </div>
          <div className="agent-detail">
            <span className="detail-label">cwd:</span>
            <span className="detail-value">{agent.cwd}</span>
          </div>
          {hasBranch && (
            <div className="agent-detail">
              <span className="detail-label">branch:</span>
              <span className="detail-value">{agent.git_branch}</span>
            </div>
          )}
          <div className="agent-detail">
            <span className="detail-label">created:</span>
            <span className="detail-value">{formatTimestamp(agent.created_at)}</span>
          </div>
          {agent.started_at && (
            <div className="agent-detail">
              <span className="detail-label">started:</span>
              <span className="detail-value">{formatTimestamp(agent.started_at)}</span>
            </div>
          )}
          {agent.completed_at && (
            <div className="agent-detail">
              <span className="detail-label">completed:</span>
              <span className="detail-value">{formatTimestamp(agent.completed_at)}</span>
            </div>
          )}
          {agent.error_message && (
            <div className="agent-detail error">
              <span className="detail-label">error:</span>
              <span className="detail-value">{agent.error_message}</span>
            </div>
          )}

          <div className="agent-card-actions">
            {(isRunning || isQueued) && (
              <button className="agent-action-btn cancel" onClick={onCancel}>
                <IconPlayerStop size={12} />
                cancel
              </button>
            )}
            {isCompleted && hasBranch && (
              <button className="agent-action-btn merge" onClick={onMerge}>
                <IconGitMerge size={12} />
                merge
              </button>
            )}
            {isCompleted && (
              <button className="agent-action-btn view" onClick={onViewOutput}>
                <IconEye size={12} />
                view
              </button>
            )}
            {!isRunning && !isQueued && (
              <button className="agent-action-btn remove" onClick={onRemove}>
                <IconTrash size={12} />
                remove
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentQueuePanel;
