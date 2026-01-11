import React from 'react';
import { LoadingIndicator } from '../LoadingIndicator/LoadingIndicator';
import { ThinkingTimer, BashTimer, CompactingTimer } from './VirtualizedMessageList';

interface CompactionState {
  isCompacting?: boolean;
  pendingAutoCompactMessage?: string;
}

interface PendingFollowup {
  sessionId: string;
  content: string;
}

export interface StreamIndicatorProps {
  isStreaming: boolean;
  hasPendingTools: boolean;
  isRunningBash: boolean;
  isUserBash: boolean;
  hasPendingFollowup: boolean;
  pendingFollowup: PendingFollowup | null;
  activityLabel: string;
  thinkingStartTime?: number;
  bashStartTime?: number;
  compactionState?: CompactionState;
  compactingStartTime?: number;
  onStopBash?: () => void;
}

export const StreamIndicator = React.memo(function StreamIndicator({
  isStreaming,
  hasPendingTools,
  isRunningBash,
  isUserBash,
  hasPendingFollowup,
  pendingFollowup,
  activityLabel,
  thinkingStartTime,
  bashStartTime,
  compactionState,
  compactingStartTime,
  onStopBash,
}: StreamIndicatorProps) {
  const isCompacting = compactionState?.isCompacting;

  return (
    <div className="message assistant">
      <div className="message-content">
        <div className="status-indicators">
          {/* Thinking indicator - show when streaming but not running bash */}
          {(isStreaming || hasPendingTools) && !isRunningBash && !isUserBash && (
            <div className="thinking-indicator-bottom">
              <LoadingIndicator size="small" color="red" />
              <span className="thinking-text-wrapper">
                <span className="thinking-text">
                  {activityLabel.split('').map((char, i) => (
                    <span
                      key={i}
                      className="thinking-char"
                      style={{ animationDelay: `${i * 0.05}s` }}
                    >
                      {char}
                    </span>
                  ))}
                  <span className="thinking-dots"></span>
                </span>
                {thinkingStartTime && (
                  <ThinkingTimer startTime={thinkingStartTime} />
                )}
              </span>
            </div>
          )}

          {/* Compacting indicator - show when compacting context */}
          {isCompacting && (
            <div className="compacting-indicator-bottom">
              <LoadingIndicator size="small" color="positive" />
              <span className="compacting-text-wrapper">
                <span className="compacting-text">
                  {'compacting'.split('').map((char, i) => (
                    <span
                      key={i}
                      className="compacting-char"
                      style={{ animationDelay: `${i * 0.05}s` }}
                    >
                      {char}
                    </span>
                  ))}
                  <span className="compacting-dots"></span>
                </span>
                {compactingStartTime && (
                  <CompactingTimer startTime={compactingStartTime} />
                )}
              </span>
              {compactionState?.pendingAutoCompactMessage && (
                <span className="compacting-followup">
                  <span className="compacting-followup-label">then:</span>
                  <span className="compacting-followup-message">
                    {compactionState.pendingAutoCompactMessage.slice(0, 50)}
                    {compactionState.pendingAutoCompactMessage.length > 50 ? '...' : ''}
                  </span>
                </span>
              )}
            </div>
          )}

          {/* Bash indicator - show when running bash */}
          {(isRunningBash || isUserBash) && !isCompacting && (
            <div className="bash-indicator-bottom">
              <LoadingIndicator size="small" color="negative" />
              <span className="bash-text-wrapper">
                <span className="bash-text">
                  {'bash running'.split('').map((char, i) => (
                    <span
                      key={i}
                      className="bash-char"
                      style={{ animationDelay: `${i * 0.05}s` }}
                    >
                      {char}
                    </span>
                  ))}
                  <span className="bash-dots"></span>
                </span>
                {bashStartTime && (
                  <BashTimer startTime={bashStartTime} />
                )}
              </span>
              {onStopBash && (
                <button
                  className="bash-stop-btn"
                  onClick={onStopBash}
                  title="Stop bash command (Esc)"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="4" y="4" width="16" height="16" rx="2" />
                  </svg>
                </button>
              )}
            </div>
          )}

          {/* Queued followup indicator */}
          {hasPendingFollowup && pendingFollowup && (
            <div className="inline-activity-indicator followup">
              <span className="activity-label">queued:</span>
              <span className="activity-preview">
                {pendingFollowup.content.slice(0, 40)}
                {pendingFollowup.content.length > 40 ? '...' : ''}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
