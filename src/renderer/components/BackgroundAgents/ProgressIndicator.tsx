/**
 * ProgressIndicator - Shows real-time progress for running background agents
 */

import React, { useState, useEffect } from 'react';
import { IconLoader2 } from '@tabler/icons-react';
import { formatElapsedTime } from '../../types/backgroundAgents';
import './ProgressIndicator.css';

interface ProgressIndicatorProps {
  turnCount: number;
  currentAction: string;
  startedAt: number;
  tokensUsed: number;
}

export const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  turnCount,
  currentAction,
  startedAt,
  tokensUsed,
}) => {
  const [elapsedTime, setElapsedTime] = useState('0s');

  // Update elapsed time every second
  useEffect(() => {
    const updateElapsed = () => {
      setElapsedTime(formatElapsedTime(startedAt));
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);

    return () => clearInterval(interval);
  }, [startedAt]);

  return (
    <div className="progress-indicator">
      <div className="progress-spinner">
        <IconLoader2 size={14} className="spin" />
      </div>
      <div className="progress-info">
        <div className="progress-action">{currentAction}</div>
        <div className="progress-stats">
          <span className="progress-stat">turn {turnCount}</span>
          <span className="progress-stat">{elapsedTime}</span>
          {tokensUsed > 0 && <span className="progress-stat">{tokensUsed} tokens</span>}
        </div>
      </div>
    </div>
  );
};

export default ProgressIndicator;
