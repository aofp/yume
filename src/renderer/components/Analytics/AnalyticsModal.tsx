import React, { useEffect, useMemo, useState } from 'react';
import { IconX, IconChartBar, IconCoin, IconClock, IconBrain, IconMessage, IconFolder } from '@tabler/icons-react';
import { claudeCodeClient } from '../../services/claudeCodeClient';
import { LoadingIndicator } from '../LoadingIndicator/LoadingIndicator';
import { TabButton } from '../Common/TabButton';
import { ALL_MODELS, PROVIDERS, type ProviderType } from '../../config/models';
import { FEATURE_FLAGS } from '../../config/features';
import './AnalyticsModal.css';

// filter providers based on feature flags
const AVAILABLE_PROVIDERS = PROVIDERS.filter(p => {
  if (p.id === 'gemini') return FEATURE_FLAGS.PROVIDER_GEMINI_AVAILABLE;
  if (p.id === 'openai') return FEATURE_FLAGS.PROVIDER_OPENAI_AVAILABLE;
  return true; // claude always available
});

interface AnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialProject?: string; // Optional: open directly to a specific project
  initialTab?: string; // Optional: open directly to a specific tab (overview, projects)
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

interface ProviderStats {
  sessions: number;
  tokens: number;
  cost: number;
  tokenBreakdown?: TokenBreakdown;
}

interface DateStats {
  sessions: number;
  messages: number;
  tokens: number;
  cost: number;
  tokenBreakdown?: TokenBreakdown;
  byModel?: Record<string, ModelStats>;
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
  '90d': 90,
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

const computeTotalsFromDates = (byDate: Record<string, DateStats>) => {
  const totals = { sessions: 0, messages: 0, tokens: 0, cost: 0 };
  const tokenBreakdown = emptyTokenBreakdown();
  const byModelTotals: Record<string, ModelStats> = {};

  Object.values(byDate).forEach((data) => {
    totals.sessions += data.sessions || 0;
    totals.messages += data.messages || 0;
    totals.tokens += data.tokens || 0;
    totals.cost += data.cost || 0;

    if (data.tokenBreakdown) {
      addTokenBreakdown(tokenBreakdown, data.tokenBreakdown);
    }

    if (data.byModel) {
      Object.entries(data.byModel).forEach(([modelKey, modelStats]) => {
        if (!byModelTotals[modelKey]) {
          byModelTotals[modelKey] = emptyModelStats();
        }
        addModelStats(byModelTotals[modelKey], modelStats);
      });
    }
  });

  return { totals, tokenBreakdown, byModelTotals };
};

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
  byModel: Record<string, ModelStats>;
  byProvider?: {
    claude: ProviderStats;
    gemini: ProviderStats;
    openai: ProviderStats;
  };
  byDate: {
    [date: string]: DateStats;
  };
  byProject: {
    [project: string]: ProjectStats;
  };
}

export const AnalyticsModal: React.FC<AnalyticsModalProps> = ({ isOpen, onClose, initialProject, initialTab }) => {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'7d' | '14d' | '30d' | '90d'>('7d');

  // Provider filter - default only available providers selected
  const [selectedProviders, setSelectedProviders] = useState<Set<ProviderType>>(
    new Set(AVAILABLE_PROVIDERS.map(p => p.id))
  );

  // Tab state for Overview vs Projects
  const validTabs = ['overview', 'projects'];
  const [activeTab, setActiveTab] = useState<'overview' | 'projects'>(() => {
    if (initialTab && validTabs.includes(initialTab)) {
      return initialTab as 'overview' | 'projects';
    }
    return 'overview';
  });
  const [projectsDataLoaded, setProjectsDataLoaded] = useState(initialTab === 'projects');

  // Provider toggle helpers
  const toggleProvider = (provider: ProviderType) => {
    setSelectedProviders(prev => {
      const next = new Set(prev);
      if (next.has(provider)) {
        if (next.size > 1) next.delete(provider); // prevent deselecting all
      } else {
        next.add(provider);
      }
      return next;
    });
  };

  const isProviderSelected = (provider: ProviderType) => selectedProviders.has(provider);

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

  // Legacy: support initialProject prop for direct project view
  const [selectedProject] = useState<string | null>(initialProject || null);
  const viewMode = initialProject ? 'project' : 'all';

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
      return { mode: 'daily' as const, items: [] as HeatmapCell[], weeks: [] as Array<Array<HeatmapCell | null>>, label: null };
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

    // Group into weeks (Sun-Sat rows)
    const weeks: Array<Array<HeatmapCell | null>> = [];
    let currentWeek: Array<HeatmapCell | null> = [];

    // Pad first week with nulls if start date isn't Sunday
    const firstDayOfWeek = items.length > 0 ? items[0].date.getDay() : 0;
    for (let i = 0; i < firstDayOfWeek; i++) {
      currentWeek.push(null);
    }

    for (const day of items) {
      currentWeek.push(day);
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }

    // Pad last week with nulls if incomplete
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push(null);
      }
      weeks.push(currentWeek);
    }

    return { mode: 'daily' as const, items, weeks, label: null };
  };

  const getHeatmapIntensity = (tokens: number, maxTokens: number): number => {
    if (tokens <= 0 || maxTokens <= 0) return 0;
    // Use sqrt for better distribution of low values
    return Math.sqrt(tokens / maxTokens);
  };

  // Filter analytics by time range, provider filter, and project
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
        byModel: {} as Record<string, ModelStats>,
        byProvider: analytics.byProvider,
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

    const cutoffDate = toDateKey(new Date(Date.now() - (rangeDays[timeRange] - 1) * 24 * 60 * 60 * 1000));

    const inRange = (dateKey: string) => dateKey >= cutoffDate;
    const filteredByDate = Object.fromEntries(
      Object.entries(sourceByDate).filter(([date]) => inRange(date))
    ) as Record<string, DateStats>;

    const dateTotals = Object.keys(filteredByDate).length > 0
      ? computeTotalsFromDates(filteredByDate)
      : null;

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

    const totalSessions = dateTotals?.totals.sessions ?? fallbackTotals.sessions;
    const totalMessages = dateTotals?.totals.messages ?? fallbackTotals.messages;
    const totalTokens = dateTotals?.totals.tokens ?? fallbackTotals.tokens;
    const totalCost = dateTotals?.totals.cost ?? fallbackTotals.cost;
    const tokenBreakdown = dateTotals?.tokenBreakdown ?? fallbackTotals.tokenBreakdown ?? emptyTokenBreakdown();

    // Get byModel - either from date totals or original data
    const rawByModel = dateTotals?.byModelTotals ?? (viewMode === 'project' ? {} : analytics.byModel);

    // Filter byModel based on selected providers
    const byModel = Object.fromEntries(
      Object.entries(rawByModel).filter(([modelKey]) => {
        // Find which provider this model belongs to
        const model = ALL_MODELS.find(m => m.family === modelKey || m.shortName === modelKey || m.id === modelKey);
        if (!model) {
          // Infer provider from model key pattern
          const keyLower = modelKey.toLowerCase();
          if (keyLower.includes('opus') || keyLower.includes('sonnet') || keyLower.includes('haiku') || keyLower.includes('claude')) {
            return selectedProviders.has('claude');
          }
          if (keyLower.includes('gemini')) {
            return selectedProviders.has('gemini');
          }
          if (keyLower.includes('codex') || keyLower.includes('gpt') || keyLower.includes('openai')) {
            return selectedProviders.has('openai');
          }
          // Unknown model - show if any provider selected
          return true;
        }
        return selectedProviders.has(model.provider);
      })
    ) as Record<string, ModelStats>;

    let byProject: Analytics['byProject'] = analytics.byProject;
    if (viewMode === 'all') {
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
      const filteredProjectByDate = Object.fromEntries(
        Object.entries(projectByDate).filter(([date]) => inRange(date))
      ) as Record<string, DateStats>;
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
      byProvider: analytics.byProvider,
      byDate: filteredByDate,
      byProject
    };
  }, [analytics, timeRange, viewMode, selectedProject, selectedProviders]);


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

  if (!isOpen) return null;

  // Get sorted projects by tokens (all projects for projects tab)
  const allProjects = filteredAnalytics
    ? Object.entries(filteredAnalytics.byProject)
        .filter(([, data]) => data.tokens > 0 || data.messages > 0)
        .sort((a, b) => b[1].tokens - a[1].tokens)
    : [];

  // Top 5 projects for overview tab
  const topProjects = allProjects.slice(0, 5);

  const heatmapGrid = filteredAnalytics ? buildHeatmapGrid(filteredAnalytics.byDate) : {
    mode: 'daily' as const,
    items: [] as HeatmapCell[],
    weeks: [] as Array<Array<HeatmapCell | null>>,
    label: null as string | null
  };
  const heatmapItems = heatmapGrid.items;
  const heatmapWeeks = heatmapGrid.weeks;
  const heatmapTitle = 'daily usage';
  const heatmapMaxTokens = Math.max(...heatmapItems.map((day) => day.tokens), 1);

  return (
    <div className="analytics-modal-overlay" onClick={onClose} onContextMenu={(e) => e.preventDefault()}>
      <div className="analytics-modal" onClick={(e) => e.stopPropagation()}>
        <div className="analytics-header" data-tauri-drag-region onContextMenu={(e) => e.preventDefault()}>
          <div className="analytics-header-left" data-tauri-drag-region>
            <div className="analytics-title" data-tauri-drag-region>
              <IconChartBar size={16} stroke={1.5} />
              <span>analytics</span>
            </div>
          </div>
          <div className="analytics-header-right">
            <div className="header-tabs">
              <TabButton label="overview" active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} />
              <TabButton label="projects" active={activeTab === 'projects'} onClick={() => { setActiveTab('projects'); setProjectsDataLoaded(true); }} />
            </div>
            <button className="analytics-close" onClick={onClose} title="close (esc)">
              <IconX size={16} stroke={1.5} />
            </button>
          </div>
        </div>

        {/* Days filter + Provider filter */}
        <div className="analytics-tabs">
          <div className="analytics-days-filter">
            <TabButton label="7d" active={timeRange === '7d'} onClick={() => setTimeRange('7d')} />
            <TabButton label="14d" active={timeRange === '14d'} onClick={() => setTimeRange('14d')} />
            <TabButton label="30d" active={timeRange === '30d'} onClick={() => setTimeRange('30d')} />
            <TabButton label="90d" active={timeRange === '90d'} onClick={() => setTimeRange('90d')} />
          </div>
          {AVAILABLE_PROVIDERS.length > 1 && (
            <div className="provider-filter">
              {AVAILABLE_PROVIDERS.map(provider => (
                <button
                  key={provider.id}
                  className={`provider-pill ${isProviderSelected(provider.id) ? 'active' : ''}`}
                  onClick={() => toggleProvider(provider.id)}
                  title={`${isProviderSelected(provider.id) ? 'hide' : 'show'} ${provider.name} data`}
                >
                  {provider.name.toLowerCase()}
                </button>
              ))}
            </div>
          )}
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
              {/* OVERVIEW TAB */}
              {activeTab === 'overview' && (
                <>
                  {/* Full-width horizontal heatmap with inline stats */}
                  <div className="overview-main-layout">
                    <div className="analytics-section heatmap-section">
                      <div className="usage-heatmap-container">
                        {heatmapItems.length > 0 ? (
                          <>
                            <div className="heatmap-header">
                              <span className="heatmap-title">{heatmapTitle}</span>
                              <div className="overview-stats-row">
                                <div className="overview-stat-card">
                                  <span className="overview-stat-value">{formatNumber(filteredAnalytics.totalMessages)}</span>
                                  <span className="overview-stat-label">msgs</span>
                                </div>
                                <div className="overview-stat-card">
                                  <span className="overview-stat-value">{formatNumber(filteredAnalytics.totalTokens)}</span>
                                  <span className="overview-stat-label">tokens</span>
                                </div>
                                <div className="overview-stat-card">
                                  <span className="overview-stat-value">{formatCost(filteredAnalytics.totalCost)}</span>
                                  <span className="overview-stat-label">cost</span>
                                </div>
                                <div className="overview-stat-card">
                                  <span className="overview-stat-value">{filteredAnalytics.totalSessions}</span>
                                  <span className="overview-stat-label">sessions</span>
                                </div>
                              </div>
                            </div>
                            <div className="usage-heatmap daily" data-range={timeRange}>
                              {heatmapWeeks.map((week, weekIndex) => (
                                <div key={weekIndex} className="heatmap-week">
                                  {week.map((day, dayIndex) => {
                                    if (!day) {
                                      return <div key={`empty-${weekIndex}-${dayIndex}`} className="heatmap-cell empty" />;
                                    }
                                    const intensity = getHeatmapIntensity(day.tokens, heatmapMaxTokens);
                                    return (
                                      <div
                                        key={day.key}
                                        className="heatmap-cell"
                                        style={{ '--intensity': intensity } as React.CSSProperties}
                                        data-date={day.date.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}
                                        data-tokens={day.tokens.toLocaleString()}
                                        data-sessions={day.sessions}
                                        data-messages={day.messages}
                                        data-cost={day.cost > 0 ? formatCost(day.cost) : '$0.00'}
                                      />
                                    );
                                  })}
                                </div>
                              ))}
                            </div>
                          </>
                        ) : (
                          <div className="usage-heatmap-empty">no data for selected period</div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Model + Provider in compact grid */}
                  <div className="analytics-breakdown-grid">
                    {/* Model Usage */}
                    {Object.keys(filteredAnalytics.byModel).length > 0 && (
                      <div className="breakdown-section">
                        <h3>models</h3>
                        <div className="model-breakdown compact">
                          {Object.entries(filteredAnalytics.byModel)
                            .sort((a, b) => b[1].tokens - a[1].tokens)
                            .map(([modelKey, stats]) => {
                              const modelDef = ALL_MODELS.find(m => m.family === modelKey || m.shortName === modelKey || m.id === modelKey);
                              const displayName = modelDef?.displayName || modelKey;
                              const percentage = filteredAnalytics.totalTokens > 0
                                ? (stats.tokens / filteredAnalytics.totalTokens * 100)
                                : 0;

                              return (
                                <div key={modelKey} className="model-stat compact">
                                  <div className="model-info">
                                    <span className="model-name">{displayName}</span>
                                    <span className="model-tokens">{formatNumber(stats.tokens)} · {formatCost(stats.cost)}</span>
                                  </div>
                                  <div className="model-bar">
                                    <div
                                      className="model-bar-fill"
                                      style={{ width: `${percentage}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    )}

                    {/* Provider Usage - only show if multiple providers available */}
                    {filteredAnalytics.byProvider && AVAILABLE_PROVIDERS.length > 1 && (
                      <div className="breakdown-section">
                        <h3>providers</h3>
                        <div className="provider-breakdown compact">
                          {AVAILABLE_PROVIDERS.map(p => p.id)
                            .filter(provider => isProviderSelected(provider))
                            .map(provider => {
                              const stats = filteredAnalytics.byProvider?.[provider];
                              const totalTokens = AVAILABLE_PROVIDERS.map(p => p.id)
                                .filter(p => isProviderSelected(p))
                                .reduce((sum, p) => sum + (filteredAnalytics.byProvider?.[p]?.tokens || 0), 0);
                              const percentage = totalTokens > 0 ? ((stats?.tokens || 0) / totalTokens * 100) : 0;

                              return (
                                <div key={provider} className="provider-stat compact">
                                  <div className="provider-info">
                                    <span className="provider-name">{provider === 'openai' ? 'codex' : provider}</span>
                                    <span className="provider-tokens">{formatNumber(stats?.tokens || 0)} · {formatCost(stats?.cost || 0)}</span>
                                  </div>
                                  <div className="provider-bar">
                                    <div
                                      className="provider-bar-fill"
                                      style={{ width: `${percentage}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Token Breakdown - collapsed by default */}
                  {filteredAnalytics.tokenBreakdown && (
                    <details className="token-details">
                      <summary>token breakdown</summary>
                      <div className="token-breakdown-compact">
                        <div className="token-row">
                          <span>input</span>
                          <span>{formatNumber(filteredAnalytics.tokenBreakdown.input)}</span>
                        </div>
                        <div className="token-row">
                          <span>output</span>
                          <span>{formatNumber(filteredAnalytics.tokenBreakdown.output)}</span>
                        </div>
                        <div className="token-row">
                          <span>cache read</span>
                          <span>{formatNumber(filteredAnalytics.tokenBreakdown.cacheRead)}</span>
                        </div>
                        <div className="token-row">
                          <span>cache new</span>
                          <span>{formatNumber(filteredAnalytics.tokenBreakdown.cacheCreation)}</span>
                        </div>
                      </div>
                    </details>
                  )}
                </>
              )}

              {/* PROJECTS TAB */}
              {activeTab === 'projects' && (
                <div className="analytics-section">
                  <h3>all projects ({allProjects.length})</h3>
                  {projectsDataLoaded ? (
                    <div className="projects-list">
                      {allProjects.length > 0 ? (
                        allProjects.map(([name, data]) => (
                          <div key={name} className="analytics-project-item">
                            <div className="analytics-project-info">
                              <IconFolder size={12} stroke={1.5} />
                              <span className="analytics-project-name">{name}</span>
                            </div>
                            <div className="analytics-project-stats">
                              <span>{formatNumber(data.tokens)} tokens</span>
                              <span className="cost">{formatCost(data.cost)}</span>
                              <span className="sessions">{data.sessions} sessions</span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="analytics-empty-message">no projects yet</div>
                      )}
                    </div>
                  ) : (
                    <div className="analytics-empty-message">loading projects...</div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="analytics-no-data">
              <span className="icon-opacity-30"><IconChartBar size={32} stroke={1} /></span>
              <div>no analytics data yet</div>
              <div style={{ fontSize: '11px' }}>start using claude to see usage statistics</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
