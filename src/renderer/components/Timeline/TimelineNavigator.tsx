import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  IconGitBranch, 
  IconGitCommit,
  IconPlayerPlay,
  IconRestore,
  IconGitFork,
  IconChevronLeft,
  IconChevronRight,
  IconX
} from '@tabler/icons-react';
import { checkpointService, Checkpoint, Timeline } from '../../services/checkpointService';
import { FEATURE_FLAGS } from '../../config/features';
import './TimelineNavigator.css';

interface TimelineNavigatorProps {
  sessionId: string;
  currentMessageCount: number;
  onRestoreCheckpoint?: (checkpointId: string) => void;
  onClose?: () => void;
}

export const TimelineNavigator: React.FC<TimelineNavigatorProps> = ({
  sessionId,
  currentMessageCount,
  onRestoreCheckpoint,
  onClose,
}) => {
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<string | null>(null);
  const [hoveredCheckpoint, setHoveredCheckpoint] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);
  
  // Don't render if feature is disabled
  if (!FEATURE_FLAGS.SHOW_TIMELINE) {
    return null;
  }
  
  useEffect(() => {
    loadTimeline();
    
    // Listen for checkpoint updates
    const handleCheckpointCreated = (event: CustomEvent) => {
      if (event.detail.sessionId === sessionId) {
        loadTimeline();
      }
    };
    
    const handleCheckpointRestored = (event: CustomEvent) => {
      if (event.detail.sessionId === sessionId) {
        setSelectedCheckpoint(event.detail.checkpointId);
      }
    };
    
    window.addEventListener('checkpoint-created' as any, handleCheckpointCreated);
    window.addEventListener('checkpoint-restored' as any, handleCheckpointRestored);
    
    return () => {
      window.removeEventListener('checkpoint-created' as any, handleCheckpointCreated);
      window.removeEventListener('checkpoint-restored' as any, handleCheckpointRestored);
    };
  }, [sessionId]);
  
  const loadTimeline = async () => {
    try {
      setIsLoading(true);
      const data = await checkpointService.getTimeline(sessionId);
      setTimeline(data.timeline);
      setCheckpoints(data.checkpoints);
      
      if (data.timeline?.currentCheckpoint) {
        setSelectedCheckpoint(data.timeline.currentCheckpoint);
      }
    } catch (err) {
      console.error('Failed to load timeline:', err);
      setError('Failed to load timeline');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleRestore = useCallback(async (checkpointId: string) => {
    try {
      setIsLoading(true);
      setError(null);
      await checkpointService.restoreCheckpoint(sessionId, checkpointId);
      setSelectedCheckpoint(checkpointId);
      
      if (onRestoreCheckpoint) {
        onRestoreCheckpoint(checkpointId);
      }
    } catch (err) {
      console.error('Failed to restore checkpoint:', err);
      setError('Failed to restore checkpoint');
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, onRestoreCheckpoint]);
  
  const handleFork = useCallback(async (checkpointId: string) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const checkpoint = checkpoints.find(c => c.id === checkpointId);
      const description = `Fork from "${checkpoint?.metadata.description || 'checkpoint'}"`;
      
      await checkpointService.forkCheckpoint(sessionId, checkpointId, description);
      await loadTimeline();
    } catch (err) {
      console.error('Failed to fork checkpoint:', err);
      setError('Failed to fork checkpoint');
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, checkpoints]);
  
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) {
      return 'just now';
    } else if (diff < 3600000) {
      const mins = Math.floor(diff / 60000);
      return `${mins}m ago`;
    } else if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return `${hours}h ago`;
    } else {
      return date.toLocaleDateString();
    }
  };
  
  const renderCheckpointNode = (checkpoint: Checkpoint, index: number) => {
    const isSelected = selectedCheckpoint === checkpoint.id;
    const isHovered = hoveredCheckpoint === checkpoint.id;
    const isCurrent = timeline?.currentCheckpoint === checkpoint.id;
    
    return (
      <div
        key={checkpoint.id}
        className={`timeline-node ${isSelected ? 'selected' : ''} ${isCurrent ? 'current' : ''}`}
        style={{
          left: `${(index / Math.max(checkpoints.length - 1, 1)) * 100}%`,
        }}
        onClick={() => setSelectedCheckpoint(checkpoint.id)}
        onMouseEnter={() => setHoveredCheckpoint(checkpoint.id)}
        onMouseLeave={() => setHoveredCheckpoint(null)}
      >
        <div className="timeline-node-icon">
          <IconGitCommit size={16} />
        </div>
        
        {(isHovered || isSelected) && (
          <div className="timeline-tooltip">
            <div className="timeline-tooltip-header">
              {checkpoint.metadata.description}
            </div>
            <div className="timeline-tooltip-info">
              <span>📝 {checkpoint.messageCount} messages</span>
              <span>🕐 {formatTime(checkpoint.createdAt)}</span>
              {checkpoint.metadata.trigger !== 'manual' && (
                <span className="timeline-tooltip-trigger">
                  {checkpoint.metadata.trigger}
                </span>
              )}
            </div>
            <div className="timeline-tooltip-actions">
              <button
                className="timeline-action-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRestore(checkpoint.id);
                }}
                disabled={isLoading || isCurrent}
                title="Restore to this checkpoint"
              >
                <IconRestore size={14} />
              </button>
              <button
                className="timeline-action-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleFork(checkpoint.id);
                }}
                disabled={isLoading}
                title="Fork from this checkpoint"
              >
                <IconGitFork size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };
  
  if (isCollapsed) {
    return (
      <div className="timeline-collapsed">
        <button
          className="timeline-expand-btn"
          onClick={() => setIsCollapsed(false)}
          title="Expand timeline"
        >
          <IconGitBranch size={16} />
          <span className="timeline-checkpoint-count">{checkpoints.length}</span>
        </button>
      </div>
    );
  }
  
  return (
    <div className="timeline-navigator">
      <div className="timeline-header">
        <div className="timeline-title">
          <IconGitBranch size={16} />
          <span>Timeline</span>
          <span className="timeline-count">{checkpoints.length} checkpoints</span>
        </div>
        <div className="timeline-controls">
          <button
            className="timeline-control-btn"
            onClick={() => setIsCollapsed(true)}
            title="Collapse timeline"
          >
            <IconChevronLeft size={14} />
          </button>
          {onClose && (
            <button
              className="timeline-control-btn"
              onClick={onClose}
              title="Close timeline"
            >
              <IconX size={14} />
            </button>
          )}
        </div>
      </div>
      
      {error && (
        <div className="timeline-error">{error}</div>
      )}
      
      {checkpoints.length === 0 ? (
        <div className="timeline-empty">
          <span>No checkpoints yet</span>
          <p>Create checkpoints to save your conversation state</p>
        </div>
      ) : (
        <div className="timeline-content" ref={timelineRef}>
          <div className="timeline-track">
            <div className="timeline-line" />
            {checkpoints.map((checkpoint, index) => renderCheckpointNode(checkpoint, index))}
          </div>
          
          {selectedCheckpoint && (
            <div className="timeline-details">
              {(() => {
                const checkpoint = checkpoints.find(c => c.id === selectedCheckpoint);
                if (!checkpoint) return null;
                
                return (
                  <>
                    <h4>{checkpoint.metadata.description}</h4>
                    <div className="timeline-detail-info">
                      <span>📝 {checkpoint.messageCount} messages</span>
                      <span>💰 {checkpoint.metadata.tokensUsed} tokens</span>
                      <span>🤖 {checkpoint.metadata.model}</span>
                      <span>🕐 {new Date(checkpoint.createdAt).toLocaleString()}</span>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      )}
      
      {isLoading && (
        <div className="timeline-loading">
          <span>Loading...</span>
        </div>
      )}
    </div>
  );
};