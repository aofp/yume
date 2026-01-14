import React, { useEffect, useMemo, useState } from 'react';
import { IconX, IconChartBar, IconCoin, IconClock, IconBrain, IconMessage, IconArrowLeft, IconFolder } from '@tabler/icons-react';
import { claudeCodeClient } from '../../services/claudeCodeClient';
import { LoadingIndicator } from '../LoadingIndicator/LoadingIndicator';
import { TabButton } from '../common/TabButton';
import './AnalyticsModal.css';

interface AnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialProject?: string; // Optional: open directly to a specific project
}

interface TokenBreakdown {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
}

interface ModelStats {
  sessions: number;
  tokens: number;
  cost: number;
}

interface DateStats {
  sessions: number;
  messages: number;
  tokens: number;
  cost: number;
  tokenBreakdown?: TokenBreakdown;
  byModel?: {
    opus: ModelStats;
    sonnet: ModelStats;
  };
}

interface ProjectStats {
  sessions: number;
  messages: number;
  tokens: number;
  cost: number;
  lastUsed: number;
  byDate?: {
    [date: string]: DateStats;
  };
  tokenBreakdown?: TokenBreakdown;
}

interface HeatmapCell {
  key: string;
  date: Date;
  tokens: number;
  cost: number;
  messages: number;
  sessions: number;
  granularity: 'day' | 'month';
}

const rangeDays = {
  '7d': 7,
  '14d': 14,
  '30d': 30,
  '60d': 60,
  '90d': 90
} as const;

const monthLabels = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const emptyTokenBreakdown = (): TokenBreakdown => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheCreation: 0
});

const emptyModelStats = (): ModelStats => ({
  sessions: 0,
  tokens: 0,
  cost: 0
});

const addTokenBreakdown = (target: TokenBreakdown, delta?: TokenBreakdown) => {
  if (!delta) return;
  target.input += delta.input;
  target.output += delta.output;
  target.cacheRead += delta.cacheRead;
  target.cacheCreation += delta.cacheCreation;
};

const addModelStats = (target: ModelStats, delta?: ModelStats) => {
  if (!delta) return;
  target.sessions += delta.sessions;
  target.tokens += delta.tokens;
  target.cost += delta.cost;
};

const toDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const fromDateKey = (dateKey: string): Date => new Date(`${dateKey}T00:00:00`);

interface Analytics {
  totalSessions: number;
  totalMessages: number;
  totalTokens: number;
  totalCost: number;
  tokenBreakdown?: TokenBreakdown;
  byModel: {
    opus: ModelStats;
    sonnet: ModelStats;
  };
  byDate: {
    [date: string]: DateStats;
  };
  byProject: {
    [project: string]: ProjectStats;
  };
}

export const AnalyticsModal: React.FC<AnalyticsModalProps> = ({ isOpen, onClose, initialProject }) => {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'7d' | '14d' | '30d' | '60d' | '90d' | 'all'>('7d');
  
  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);
  const [selectedProject, setSelectedProject] = useState<string | null>(initialProject || null);
  const [viewMode, setViewMode] = useState<'all' | 'project'>(initialProject ? 'project' : 'all');

  // Handle initial project prop changes
  useEffect(() => {
    if (initialProject) {
      setSelectedProject(initialProject);
      setViewMode('project');
    } else {
      setSelectedProject(null);
      setViewMode('all');
    }
  }, [initialProject]);

  // Load analytics from server
  useEffect(() => {
    if (!isOpen) return;

    const loadAnalytics = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Wait for socket connection if needed
        if (!claudeCodeClient.isConnected()) {
          console.log('[AnalyticsModal] waiting for socket connection...');
          let attempts = 0;
          while (!claudeCodeClient.isConnected() && attempts < 50) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
          }
          if (!claudeCodeClient.isConnected()) {
            throw new Error('socket not connected');
          }
        }
        
        const serverPort = claudeCodeClient.getServerPort();
        if (!serverPort) {
          throw new Error('server port not available');
        }
        
        const response = await fetch(`http://localhost:${serverPort}/claude-analytics`);
        if (!response.ok) {
          throw new Error('failed to load analytics');
        }
        
        const data = await response.json();
        setAnalytics(data);
      } catch (err) {
        console.error('failed to load analytics:', err);
        setError('failed to load analytics');
      } finally {
        setLoading(false);
      }
    };
    
    loadAnalytics();
  }, [isOpen]);

  const buildHeatmapGrid = (byDate: Record<string, DateStats>) => {
    const dateKeys = Object.keys(byDate);
    if (dateKeys.length === 0) {
      return { mode: timeRange === 'all' ? 'monthly' as const : 'daily' as const, items: [] as HeatmapCell[], cells: [] as Array<HeatmapCell | null>, label: null };
    }

    if (timeRange === 'all') {
      const monthlyTotals: Record<string, { tokens: number; cost: number; messages: number; sessions: number }> = {};
      dateKeys.forEach((dateKey) => {
        const monthKey = dateKey.slice(0, 7);
        if (!monthlyTotals[monthKey]) {
          monthlyTotals[monthKey] = { tokens: 0, cost: 0, messages: 0, sessions: 0 };
        }
        const data = byDate[dateKey];
        monthlyTotals[monthKey].tokens += data.tokens || 0;
        monthlyTotals[monthKey].cost += data.cost || 0;
        monthlyTotals[monthKey].messages += data.messages || 0;
        monthlyTotals[monthKey].sessions += data.sessions || 0;
      });

      const sortedKeys = dateKeys.sort();
      const earliestDate = fromDateKey(sortedKeys[0]);
      const latestDate = fromDateKey(sortedKeys[sortedKeys.length - 1]);
      const startMonth = new Date(earliestDate.getFullYear(), earliestDate.getMonth(), 1);
      const endMonth = new Date(latestDate.getFullYear(), latestDate.getMonth(), 1);

      const items: HeatmapCell[] = [];
      const cursor = new Date(startMonth);
      while (cursor <= endMonth) {
        const monthKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
        const totals = monthlyTotals[monthKey] || { tokens: 0, cost: 0, messages: 0, sessions: 0 };
        items.push({
          key: monthKey,
          date: new Date(cursor),
          tokens: totals.tokens,
          cost: totals.cost,
          messages: totals.messages,
          sessions: totals.sessions,
          granularity: 'month'
        });
        cursor.setMonth(cursor.getMonth() + 1);
      }

      const startPad = startMonth.getMonth();
      const endPad = 11 - endMonth.getMonth();
      const cells: Array<HeatmapCell | null> = [
        ...Array(startPad).fill(null),
        ...items,
        ...Array(endPad).fill(null)
      ];
      const rangeLabel = `${startMonth.toLocaleDateString('en', { month: 'short', year: 'numeric' })} - ${endMonth.toLocaleDateString('en', { month: 'short', year: 'numeric' })}`;

      return { mode: 'monthly' as const, items, cells, label: rangeLabel };
    }

    const today = new Date();
    const endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    const daysToShow = rangeDays[timeRange] || 7;
    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - (daysToShow - 1));

    const items: HeatmapCell[] = [];
    for (let i = 0; i < daysToShow; i += 1) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      const dateKey = toDateKey(date);
      const data = byDate[dateKey];
      items.push({
        key: dateKey,
        date,
        tokens: data?.tokens || 0,
        cost: data?.cost || 0,
        messages: data?.messages || 0,
        sessions: data?.sessions || 0,
        granularity: 'day'
      });
    }

    const pad = items.length > 0 ? items[0].date.getDay() : 0;
    const cells: Array<HeatmapCell | null> = [...Array(pad).fill(null), ...items];

    return { mode: 'daily' as const, items, cells, label: null };
  };

  const getHeatmapLevel = (tokens: number, maxTokens: number): number => {
    if (tokens <= 0 || maxTokens <= 0) return 0;
    const ratio = tokens / maxTokens;
    if (ratio >= 0.8) return 4;
    if (ratio >= 0.6) return 3;
    if (ratio >= 0.35) return 2;
    return 1;
  };

  // Filter analytics by time range and project
  const filteredAnalytics = useMemo(() => {
    if (!analytics) return null;

    const projectData = viewMode === 'project' && selectedProject ? analytics.byProject[selectedProject] : null;
    if (viewMode === 'project' && selectedProject && !projectData) {
      return {
        totalSessions: 0,
        totalMessages: 0,
        totalTokens: 0,
        totalCost: 0,
        tokenBreakdown: emptyTokenBreakdown(),
        byModel: { opus: emptyModelStats(), sonnet: emptyModelStats() },
        byDate: {},
        byProject: {
          [selectedProject]: {
            sessions: 0,
            messages: 0,
            tokens: 0,
            cost: 0,
            lastUsed: 0
          }
        }
      };
    }
    const sourceByDate = viewMode === 'project'
      ? projectData?.byDate || {}
      : analytics.byDate;

    const cutoffDate = timeRange === 'all'
      ? null
      : toDateKey(new Date(Date.now() - (rangeDays[timeRange] - 1) * 24 * 60 * 60 * 1000));

    const inRange = (dateKey: string) => !cutoffDate || dateKey >= cutoffDate;
    const filteredByDate = Object.fromEntries(
      Object.entries(sourceByDate).filter(([date]) => inRange(date))
    ) as Record<string, DateStats>;

    const computeTotalsFromDates = (byDate: Record<string, DateStats>) => {
      const totals = { sessions: 0, messages: 0, tokens: 0, cost: 0 };
      const tokenBreakdown = emptyTokenBreakdown();
      const byModelTotals = { opus: emptyModelStats(), sonnet: emptyModelStats() };

      Object.values(byDate).forEach((data) => {
        totals.sessions += data.sessions || 0;
        totals.messages += data.messages || 0;
        totals.tokens += data.tokens || 0;
        totals.cost += data.cost || 0;

        if (data.tokenBreakdown) {
          addTokenBreakdown(tokenBreakdown, data.tokenBreakdown);
        }

        if (data.byModel) {
          addModelStats(byModelTotals.opus, data.byModel.opus);
          addModelStats(byModelTotals.sonnet, data.byModel.sonnet);
        }
      });

      return { totals, tokenBreakdown, byModelTotals };
    };

    const hasSourceByDate = Object.keys(sourceByDate).length > 0;
    const dateTotals = hasSourceByDate ? computeTotalsFromDates(filteredByDate) : null;

    const fallbackTotals = viewMode === 'project' && projectData
      ? {
          sessions: projectData.sessions,
          messages: projectData.messages,
          tokens: projectData.tokens,
          cost: projectData.cost,
          tokenBreakdown: projectData.tokenBreakdown
        }
      : {
          sessions: analytics.totalSessions,
          messages: analytics.totalMessages,
          tokens: analytics.totalTokens,
          cost: analytics.totalCost,
          tokenBreakdown: analytics.tokenBreakdown
        };

    const totalSessions = dateTotals ? dateTotals.totals.sessions : fallbackTotals.sessions;
    const totalMessages = dateTotals ? dateTotals.totals.messages : fallbackTotals.messages;
    const totalTokens = dateTotals ? dateTotals.totals.tokens : fallbackTotals.tokens;
    const totalCost = dateTotals ? dateTotals.totals.cost : fallbackTotals.cost;
    const tokenBreakdown = dateTotals ? dateTotals.tokenBreakdown : fallbackTotals.tokenBreakdown;

    const byModel = dateTotals
      ? dateTotals.byModelTotals
      : (viewMode === 'project' ? { opus: emptyModelStats(), sonnet: emptyModelStats() } : analytics.byModel);

    let byProject: Analytics['byProject'] = analytics.byProject;
    if (viewMode === 'all' && timeRange !== 'all') {
      byProject = Object.entries(analytics.byProject).reduce((acc, [name, data]) => {
        if (!data.byDate || Object.keys(data.byDate).length === 0) {
          acc[name] = data;
          return acc;
        }
        const filteredProjectByDate = Object.fromEntries(
          Object.entries(data.byDate).filter(([date]) => inRange(date))
        ) as Record<string, DateStats>;
        const projectTotals = computeTotalsFromDates(filteredProjectByDate);
        acc[name] = {
          ...data,
          sessions: projectTotals.totals.sessions,
          messages: projectTotals.totals.messages,
          tokens: projectTotals.totals.tokens,
          cost: projectTotals.totals.cost,
          tokenBreakdown: projectTotals.tokenBreakdown,
          byDate: filteredProjectByDate
        };
        return acc;
      }, {} as Analytics['byProject']);
    } else if (viewMode === 'project' && projectData && selectedProject) {
      const projectByDate = projectData.byDate || {};
      const filteredProjectByDate = timeRange === 'all'
        ? projectByDate
        : Object.fromEntries(Object.entries(projectByDate).filter(([date]) => inRange(date))) as Record<string, DateStats>;
      const projectTotals = Object.keys(projectByDate).length > 0
        ? computeTotalsFromDates(filteredProjectByDate)
        : null;
      byProject = {
        [selectedProject]: {
          ...projectData,
          sessions: projectTotals ? projectTotals.totals.sessions : projectData.sessions,
          messages: projectTotals ? projectTotals.totals.messages : projectData.messages,
          tokens: projectTotals ? projectTotals.totals.tokens : projectData.tokens,
          cost: projectTotals ? projectTotals.totals.cost : projectData.cost,
          tokenBreakdown: projectTotals ? projectTotals.tokenBreakdown : projectData.tokenBreakdown,
          byDate: filteredProjectByDate
        }
      };
    }

    return {
      totalSessions,
      totalMessages,
      totalTokens,
      totalCost,
      tokenBreakdown,
      byModel,
      byDate: filteredByDate,
      byProject
    };
  }, [analytics, timeRange, viewMode, selectedProject]);


  // Format large numbers
  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}m`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return num.toString();
  };

  // Format cost
  const formatCost = (cost: number): string => {
    if (cost < 0.01) return '<$0.01';
    return `$${cost.toFixed(2)}`;
  };

  // Navigate to project analytics
  const handleProjectClick = (projectName: string) => {
    setSelectedProject(projectName);
    setViewMode('project');
  };

  // Navigate back to all analytics
  const handleBackClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedProject(null);
    setViewMode('all');
  };

  if (!isOpen) return null;

  // Get sorted projects by tokens
  const topProjects = filteredAnalytics ? 
    Object.entries(filteredAnalytics.byProject)
      .filter(([, data]) => data.tokens > 0 || data.messages > 0)
      .sort((a, b) => b[1].tokens - a[1].tokens)
      .slice(0, 5) : [];

  const heatmapGrid = filteredAnalytics ? buildHeatmapGrid(filteredAnalytics.byDate) : {
    mode: timeRange === 'all' ? 'monthly' as const : 'daily' as const,
    items: [] as HeatmapCell[],
    cells: [] as Array<HeatmapCell | null>,
    label: null as string | null
  };
  const heatmapItems = heatmapGrid.items;
  const heatmapCells = heatmapGrid.cells;
  const heatmapMode = heatmapGrid.mode;
  const heatmapRangeLabel = heatmapGrid.label;
  const heatmapTitle = heatmapMode === 'monthly' ? 'monthly usage' : 'daily usage';
  const heatmapMaxTokens = Math.max(...heatmapItems.map((day) => day.tokens), 1);
  const heatmapActiveCount = heatmapItems.filter((day) => day.tokens > 0).length;
  const heatmapTotalTokens = heatmapItems.reduce((sum, day) => sum + day.tokens, 0);
  const heatmapAverageTokens = heatmapItems.length > 0 ? heatmapTotalTokens / heatmapItems.length : 0;
  const heatmapPeakCell = heatmapItems.length > 0
    ? heatmapItems.reduce((max, day) => (day.tokens > max.tokens ? day : max))
    : null;

  return (
    <div className="analytics-modal-overlay" onClick={onClose}>
      <div className="analytics-modal" onClick={(e) => e.stopPropagation()}>
        <div className="analytics-header" data-tauri-drag-region onContextMenu={(e) => e.preventDefault()}>
          <div className="analytics-header-left" data-tauri-drag-region>
            <div className="analytics-title" data-tauri-drag-region>
              {viewMode === 'project' ? (
                <>
                  <button className="analytics-back-button" onClick={handleBackClick} title="back to all analytics">
                    <IconArrowLeft size={14} />
                    <span>back</span>
                  </button>
                  <IconFolder size={16} stroke={1.5} />
                  <span>{selectedProject}</span>
                  <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '11px', marginLeft: '8px' }}>
                    analytics
                  </span>
                </>
              ) : (
                <>
                  <IconChartBar size={16} stroke={1.5} />
                  <span>analytics</span>
                </>
              )}
            </div>
            <div className="header-tabs">
              <TabButton label="7d" active={timeRange === '7d'} onClick={() => setTimeRange('7d')} />
              <TabButton label="14d" active={timeRange === '14d'} onClick={() => setTimeRange('14d')} />
              <TabButton label="30d" active={timeRange === '30d'} onClick={() => setTimeRange('30d')} />
              <TabButton label="60d" active={timeRange === '60d'} onClick={() => setTimeRange('60d')} />
              <TabButton label="90d" active={timeRange === '90d'} onClick={() => setTimeRange('90d')} />
              <TabButton label="all" active={timeRange === 'all'} onClick={() => setTimeRange('all')} />
            </div>
          </div>
          <button className="analytics-close" onClick={onClose} title="close (esc)">
            <IconX size={16} stroke={1.5} />
          </button>
        </div>

        <div className="analytics-content">
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
              <LoadingIndicator />
            </div>
          )}
          
          {error && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
              <div style={{ color: '#ff6666', fontSize: '12px' }}>{error}</div>
            </div>
          )}
          
          {!loading && (filteredAnalytics ? (
            <>
              {/* Overview Stats */}
              <div className="analytics-overview">
                <div className="stat-card">
                  <div className="stat-icon">
                    <IconMessage size={14} stroke={1.5} />
                  </div>
                  <div className="stat-value">{formatNumber(filteredAnalytics.totalMessages)}</div>
                  <div className="stat-label">messages</div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon">
                    <IconBrain size={14} stroke={1.5} />
                  </div>
                  <div className="stat-value">{formatNumber(filteredAnalytics.totalTokens)}</div>
                  <div className="stat-label">tokens</div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon">
                    <IconCoin size={14} stroke={1.5} />
                  </div>
                  <div className="stat-value">{formatCost(filteredAnalytics.totalCost)}</div>
                  <div className="stat-label">total cost</div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon">
                    <IconClock size={14} stroke={1.5} />
                  </div>
                  <div className="stat-value">{filteredAnalytics.totalSessions}</div>
                  <div className="stat-label">sessions</div>
                </div>
              </div>

              {/* Token Breakdown Table - show in both views */}
              {filteredAnalytics.tokenBreakdown && (
                <div className="analytics-section">
                  <h3>token breakdown</h3>
                  <div className="token-breakdown-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Type</th>
                          <th>Actual</th>
                          <th>Cache Read</th>
                          <th>Cache New</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>Input</td>
                          <td>{formatNumber(filteredAnalytics.tokenBreakdown.input)}</td>
                          <td>-</td>
                          <td>-</td>
                        </tr>
                        <tr>
                          <td>Output</td>
                          <td>{formatNumber(filteredAnalytics.tokenBreakdown.output)}</td>
                          <td>-</td>
                          <td>-</td>
                        </tr>
                        <tr>
                          <td>Context</td>
                          <td>-</td>
                          <td>{formatNumber(filteredAnalytics.tokenBreakdown.cacheRead)}</td>
                          <td>{formatNumber(filteredAnalytics.tokenBreakdown.cacheCreation)}</td>
                        </tr>
                        <tr className="total-row">
                          <td>Total</td>
                          <td colSpan={3} style={{ textAlign: 'center' }}>
                            {formatNumber(filteredAnalytics.totalTokens)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Model Breakdown - only show in all view */}
              {viewMode === 'all' && (
                <div className="analytics-section">
                  <h3>model usage</h3>
                <div className="model-breakdown">
                  <div className="model-stat opus">
                    <div className="model-name">opus</div>
                    <div className="model-metrics">
                      <span>{formatNumber(filteredAnalytics.byModel.opus.tokens)} tokens</span>
                      <span className="cost">{formatCost(filteredAnalytics.byModel.opus.cost)}</span>
                    </div>
                    <div className="model-bar">
                      <div 
                        className="model-bar-fill"
                        style={{ 
                          width: `${filteredAnalytics.totalTokens > 0 ? 
                            (filteredAnalytics.byModel.opus.tokens / filteredAnalytics.totalTokens * 100) : 0}%` 
                        }}
                      />
                    </div>
                  </div>
                  <div className="model-stat sonnet">
                    <div className="model-name">sonnet</div>
                    <div className="model-metrics">
                      <span>{formatNumber(filteredAnalytics.byModel.sonnet.tokens)} tokens</span>
                      <span className="cost">{formatCost(filteredAnalytics.byModel.sonnet.cost)}</span>
                    </div>
                    <div className="model-bar">
                      <div 
                        className="model-bar-fill"
                        style={{ 
                          width: `${filteredAnalytics.totalTokens > 0 ? 
                            (filteredAnalytics.byModel.sonnet.tokens / filteredAnalytics.totalTokens * 100) : 0}%` 
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
              )}

              <div className="analytics-section">
                <h3>{heatmapTitle}</h3>
                <div className="usage-heatmap-container">
                  {heatmapItems.length > 0 ? (
                    <>
                      {heatmapMode === 'monthly' && (
                        <div className="usage-heatmap-months">
                          {monthLabels.map((label) => (
                            <span key={label}>{label}</span>
                          ))}
                        </div>
                      )}
                      <div className={`usage-heatmap ${heatmapMode}`}>
                        {heatmapCells.map((day, index) => {
                          if (!day) {
                            return <div key={`empty-${index}`} className="heatmap-cell empty" />;
                          }
                          const level = getHeatmapLevel(day.tokens, heatmapMaxTokens);
                          const dateLabel = day.granularity === 'month'
                            ? day.date.toLocaleDateString('en', { month: 'short', year: 'numeric' })
                            : day.date.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });
                          const costLabel = day.cost > 0 ? formatCost(day.cost) : '$0.00';
                          const tooltip = `${dateLabel} | ${day.tokens.toLocaleString()} tokens | ${day.sessions} sessions | ${day.messages} messages | ${costLabel}`;
                          return (
                            <div
                              key={day.key}
                              className={`heatmap-cell level-${level}`}
                              title={tooltip}
                            />
                          );
                        })}
                      </div>
                      <div className="usage-heatmap-legend">
                        <span>less</span>
                        <div className="heatmap-legend-scale">
                          <span className="heatmap-cell level-0" />
                          <span className="heatmap-cell level-1" />
                          <span className="heatmap-cell level-2" />
                          <span className="heatmap-cell level-3" />
                          <span className="heatmap-cell level-4" />
                        </div>
                        <span>more</span>
                      </div>
                      {heatmapRangeLabel && (
                        <div className="usage-heatmap-note">monthly view {heatmapRangeLabel}</div>
                      )}
                      <div className="usage-heatmap-meta">
                        <span>active {heatmapMode === 'monthly' ? 'months' : 'days'} {heatmapActiveCount}/{heatmapItems.length}</span>
                        <span>avg/{heatmapMode === 'monthly' ? 'month' : 'day'} {formatNumber(Math.round(heatmapAverageTokens))} tokens</span>
                        {heatmapPeakCell && (
                          <span>
                            peak {heatmapPeakCell.date.toLocaleDateString('en', heatmapMode === 'monthly' ? { month: 'short', year: 'numeric' } : { month: 'short', day: 'numeric' })} - {formatNumber(heatmapPeakCell.tokens)} tokens
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="usage-heatmap-empty">no data for selected period</div>
                  )}
                </div>
              </div>

              {/* Top Projects - only show in all view */}
              {viewMode === 'all' && (
                <div className="analytics-section">
                  <h3>top projects</h3>
                  <div className="projects-list">
                    {topProjects.length > 0 ? (
                      topProjects.map(([name, data]) => (
                        <div 
                          key={name} 
                          className="analytics-project-item clickable" 
                          onClick={() => handleProjectClick(name)}
                          title="view project analytics"
                        >
                          <div className="analytics-project-info">
                            <IconFolder size={12} stroke={1.5} />
                            <span className="analytics-project-name">{name}</span>
                          </div>
                          <div className="analytics-project-stats">
                            <span>{formatNumber(data.tokens)} tokens</span>
                            <span className="cost">{formatCost(data.cost)}</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'center', 
                        alignItems: 'center', 
                        padding: '20px',
                        color: 'rgba(255, 255, 255, 0.3)',
                        fontSize: '11px'
                      }}>
                        no projects yet
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '60px 20px',
              color: 'rgba(255, 255, 255, 0.3)',
              fontSize: '12px',
              gap: '20px'
            }}>
              <IconChartBar size={32} stroke={1} style={{ opacity: 0.3 }} />
              <div>no analytics data yet</div>
              <div style={{ fontSize: '11px' }}>start using claude to see usage statistics</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
