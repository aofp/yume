import React, { useMemo } from 'react';
import {
  IconCoins,
  IconBrain,
  IconClock,
  IconTrendingUp,
  IconChartBar,
  IconDatabase
} from '@tabler/icons-react';
import { useClaudeCodeStore } from '../../stores/claudeCodeStore';
import './AnalyticsDashboard.css';

interface UsageStats {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
  sessionCount: number;
  messageCount: number;
  toolUseCount: number;
  avgTokensPerMessage: number;
  mostUsedTools: { name: string; count: number }[];
}

export const AnalyticsDashboard: React.FC = () => {
  const { sessions, currentSessionId } = useClaudeCodeStore();
  const currentSession = sessions.find(s => s.id === currentSessionId);

  const stats = useMemo(() => {
    if (!currentSession?.analytics) {
      return {
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalCost: 0,
        messageCount: 0,
        toolUseCount: 0,
        avgTokensPerMessage: 0,
        mostUsedTools: [],
        duration: 0,
        userMessages: 0,
        assistantMessages: 0
      };
    }

    const analytics = currentSession.analytics;
    const toolUsage = new Map<string, number>();
    
    // Calculate tool usage from messages
    currentSession.messages.forEach(msg => {
      if (msg.type === 'tool_use' && msg.message?.name) {
        toolUsage.set(msg.message.name, (toolUsage.get(msg.message.name) || 0) + 1);
      }
    });

    // Get top 5 most used tools
    const mostUsedTools = Array.from(toolUsage.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    // Calculate cost (rough estimate: $0.01 per 1000 tokens)
    const totalCost = (analytics.tokens.total / 1000) * 0.01;

    return {
      totalTokens: analytics.tokens.total,
      inputTokens: analytics.tokens.input,
      outputTokens: analytics.tokens.output,
      totalCost,
      messageCount: analytics.totalMessages,
      toolUseCount: analytics.toolUses,
      avgTokensPerMessage: analytics.totalMessages > 0 ? Math.round(analytics.tokens.total / analytics.totalMessages) : 0,
      mostUsedTools,
      duration: analytics.duration,
      userMessages: analytics.userMessages,
      assistantMessages: analytics.assistantMessages
    };
  }, [currentSession]);

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}m`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return num.toString();
  };

  const formatCost = (cost: number) => {
    return `$${cost.toFixed(4)}`;
  };

  // Simple bar chart for token distribution
  const tokenPercentage = stats.totalTokens > 0 
    ? Math.round((stats.inputTokens / stats.totalTokens) * 100)
    : 50;

  return (
    <div className="analytics-dashboard">
      <div className="analytics-header">
        <h3>session analytics</h3>
        <span className="period">{currentSession?.name || 'no session'}</span>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">
            <IconBrain size={16} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{formatNumber(stats.totalTokens)}</div>
            <div className="stat-label">total tokens</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <IconCoins size={16} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{formatCost(stats.totalCost)}</div>
            <div className="stat-label">estimated cost</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <IconDatabase size={16} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{stats.messageCount}</div>
            <div className="stat-label">messages</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <IconTrendingUp size={16} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{stats.avgTokensPerMessage}</div>
            <div className="stat-label">avg tokens/msg</div>
          </div>
        </div>
      </div>

      <div className="chart-section">
        <h4>token distribution</h4>
        <div className="token-bar">
          <div className="token-segment input" style={{ width: `${tokenPercentage}%` }}>
            <span className="token-label">input {tokenPercentage}%</span>
          </div>
          <div className="token-segment output" style={{ width: `${100 - tokenPercentage}%` }}>
            <span className="token-label">output {100 - tokenPercentage}%</span>
          </div>
        </div>
        <div className="token-legend">
          <div className="legend-item">
            <span className="legend-dot input"></span>
            <span>input: {formatNumber(stats.inputTokens)}</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot output"></span>
            <span>output: {formatNumber(stats.outputTokens)}</span>
          </div>
        </div>
      </div>

      <div className="tools-section">
        <h4>most used tools</h4>
        {stats.mostUsedTools.length === 0 ? (
          <div className="no-tools">no tools used yet</div>
        ) : (
          <div className="tools-list">
            {stats.mostUsedTools.map((tool, index) => (
              <div key={tool.name} className="tool-stat">
                <span className="tool-rank">{index + 1}</span>
                <span className="tool-name">{tool.name.toLowerCase()}</span>
                <span className="tool-count">{tool.count}</span>
                <div className="tool-bar">
                  <div 
                    className="tool-bar-fill"
                    style={{ 
                      width: `${(tool.count / stats.mostUsedTools[0].count) * 100}%` 
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="summary-section">
        <div className="summary-item">
          <IconChartBar size={12} />
          <span>{stats.messageCount} total messages</span>
        </div>
        <div className="summary-item">
          <IconClock size={12} />
          <span>{stats.toolUseCount} tool uses</span>
        </div>
      </div>
    </div>
  );
};