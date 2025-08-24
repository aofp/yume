/**
 * Compact Indicator Component
 * 
 * Displays real-time token usage and compact status
 */

import React, { useEffect, useState } from 'react';
import { useClaudeCodeStore } from '../../stores/claudeCodeStore';

interface TokenData {
  current: number;
  max: number;
  percentage: number;
  sessionId: string;
}

interface CompactConfig {
  enabled: boolean;
  auto: boolean;
  threshold: number;
  maxTokens: number;
}

export const CompactIndicator: React.FC = () => {
  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const [isCompacting, setIsCompacting] = useState(false);
  const [compactConfig, setCompactConfig] = useState<CompactConfig | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  
  const { socket, activeSessionId } = useClaudeCodeStore();
  
  useEffect(() => {
    if (!socket || !activeSessionId) return;
    
    // Request compact configuration
    socket.emit('getCompactConfig', (config: CompactConfig) => {
      setCompactConfig(config);
    });
    
    // Listen for token updates
    const handleTokenUpdate = (data: TokenData) => {
      if (data.sessionId === activeSessionId) {
        setTokenData(data);
      }
    };
    
    // Listen for compact events
    const handleCompactStart = () => {
      setIsCompacting(true);
    };
    
    const handleCompactComplete = (data: any) => {
      setIsCompacting(false);
      // Show savings notification
      if (data.saved > 0) {
        showCompactNotification(data);
      }
    };
    
    socket.on(`compact:token-update:${activeSessionId}`, handleTokenUpdate);
    socket.on(`compact:start:${activeSessionId}`, handleCompactStart);
    socket.on(`compact:complete:${activeSessionId}`, handleCompactComplete);
    
    return () => {
      socket.off(`compact:token-update:${activeSessionId}`, handleTokenUpdate);
      socket.off(`compact:start:${activeSessionId}`, handleCompactStart);
      socket.off(`compact:complete:${activeSessionId}`, handleCompactComplete);
    };
  }, [socket, activeSessionId]);
  
  const showCompactNotification = (data: any) => {
    // This could be a toast or modal
    console.log(`Compact saved ${data.saved} tokens (${data.percentage}% reduction)`);
  };
  
  const handleManualCompact = () => {
    if (!socket || !activeSessionId) return;
    
    socket.emit('triggerCompact', { sessionId: activeSessionId });
  };
  
  const getProgressBarColor = () => {
    if (!tokenData) return '#666';
    
    const percentage = tokenData.percentage;
    if (percentage < 0.5) return '#0ea5e9'; // cyan
    if (percentage < 0.75) return '#f59e0b'; // amber
    return '#ef4444'; // red
  };
  
  const formatTokenCount = (count: number) => {
    if (count < 1000) return count.toString();
    if (count < 1000000) return `${(count / 1000).toFixed(1)}k`;
    return `${(count / 1000000).toFixed(2)}m`;
  };
  
  if (!compactConfig?.enabled) {
    return null; // Don't show if compact is disabled
  }
  
  return (
    <div className="compact-indicator" style={styles.container}>
      {/* Main indicator bar */}
      <div 
        style={styles.indicator}
        onClick={() => setShowDetails(!showDetails)}
        title={`Tokens: ${tokenData?.current || 0} / ${tokenData?.max || 100000}`}
      >
        {/* Progress bar */}
        <div style={styles.progressBar}>
          <div 
            style={{
              ...styles.progressFill,
              width: `${(tokenData?.percentage || 0) * 100}%`,
              backgroundColor: getProgressBarColor()
            }}
          />
        </div>
        
        {/* Token count */}
        <div style={styles.tokenCount}>
          {tokenData ? (
            <>
              <span>{formatTokenCount(tokenData.current)}</span>
              <span style={styles.separator}>/</span>
              <span>{formatTokenCount(tokenData.max)}</span>
            </>
          ) : (
            <span>--</span>
          )}
        </div>
        
        {/* Compact status */}
        {isCompacting && (
          <div style={styles.compactingIndicator}>
            <span style={styles.spinner}>⟳</span>
            compacting...
          </div>
        )}
        
        {/* Auto-compact warning */}
        {tokenData && tokenData.percentage > 0.7 && !isCompacting && (
          <div style={styles.warning}>
            ⚠️ auto-compact at {Math.round(compactConfig.threshold / 1000)}k
          </div>
        )}
      </div>
      
      {/* Expanded details */}
      {showDetails && (
        <div style={styles.details}>
          <div style={styles.detailRow}>
            <span>auto-compact:</span>
            <span>{compactConfig.auto ? 'enabled' : 'disabled'}</span>
          </div>
          <div style={styles.detailRow}>
            <span>threshold:</span>
            <span>{formatTokenCount(compactConfig.threshold)} tokens</span>
          </div>
          <div style={styles.detailRow}>
            <span>current usage:</span>
            <span>{Math.round((tokenData?.percentage || 0) * 100)}%</span>
          </div>
          
          {/* Manual compact button */}
          {!isCompacting && (
            <button
              style={styles.compactButton}
              onClick={handleManualCompact}
              title="Manually trigger context compaction"
            >
              compact now
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const styles = {
  container: {
    position: 'fixed' as const,
    bottom: '60px',
    right: '20px',
    zIndex: 1000,
    fontFamily: 'monospace',
    fontSize: '12px',
    color: '#999',
    backgroundColor: '#000',
    border: '1px solid #333',
    borderRadius: '4px',
    padding: '8px',
    minWidth: '200px',
    cursor: 'default'
  },
  
  indicator: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    cursor: 'pointer'
  },
  
  progressBar: {
    width: '100%',
    height: '4px',
    backgroundColor: '#222',
    borderRadius: '2px',
    overflow: 'hidden'
  },
  
  progressFill: {
    height: '100%',
    transition: 'width 0.3s ease, background-color 0.3s ease'
  },
  
  tokenCount: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    color: '#0ea5e9'
  },
  
  separator: {
    color: '#666'
  },
  
  compactingIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    color: '#f59e0b'
  },
  
  spinner: {
    display: 'inline-block',
    animation: 'spin 1s linear infinite'
  },
  
  warning: {
    color: '#f59e0b',
    fontSize: '11px'
  },
  
  details: {
    marginTop: '8px',
    paddingTop: '8px',
    borderTop: '1px solid #333'
  },
  
  detailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '4px',
    fontSize: '11px'
  },
  
  compactButton: {
    marginTop: '8px',
    padding: '4px 8px',
    backgroundColor: '#0ea5e9',
    color: '#000',
    border: 'none',
    borderRadius: '2px',
    fontSize: '11px',
    cursor: 'pointer',
    width: '100%',
    transition: 'background-color 0.2s ease'
  }
};