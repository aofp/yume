import React, { useEffect, useMemo, useState } from 'react';
import { IconX, IconChartBar, IconCoin, IconClock, IconBrain, IconMessage, IconTool, IconArrowLeft, IconFolder } from '@tabler/icons-react';
import { claudeCodeClient } from '../../services/claudeCodeClient';
import { LoadingIndicator } from '../LoadingIndicator/LoadingIndicator';
import './AnalyticsModal.css';

interface AnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialProject?: string; // Optional: open directly to a specific project
}

interface Analytics {
  totalSessions: number;
  totalMessages: number;
  totalTokens: number;
  totalCost: number;
  byModel: {
    opus: {
      sessions: number;
      tokens: number;
      cost: number;
    };
    sonnet: {
      sessions: number;
      tokens: number;
      cost: number;
    };
  };
  byDate: {
    [date: string]: {
      sessions: number;
      messages: number;
      tokens: number;
      cost: number;
    };
  };
  byProject: {
    [project: string]: {
      sessions: number;
      messages: number;
      tokens: number;
      cost: number;
      lastUsed: number;
    };
  };
}

export const AnalyticsModal: React.FC<AnalyticsModalProps> = ({ isOpen, onClose, initialProject }) => {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'7d' | '14d' | '30d' | 'all'>('7d');
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

  // Filter analytics by time range and project
  const filteredAnalytics = useMemo(() => {
    if (!analytics) return null;
    
    let filtered: Analytics = analytics;
    
    // Filter by project if in project view
    if (viewMode === 'project' && selectedProject) {
      const projectData = analytics.byProject[selectedProject];
      if (!projectData) {
        // Project not found in analytics
        return {
          totalSessions: 0,
          totalMessages: 0,
          totalTokens: 0,
          totalCost: 0,
          byModel: {
            opus: { sessions: 0, tokens: 0, cost: 0 },
            sonnet: { sessions: 0, tokens: 0, cost: 0 }
          },
          byDate: {},
          byProject: { [selectedProject]: projectData || { sessions: 0, messages: 0, tokens: 0, cost: 0, lastUsed: 0 } }
        };
      }
      
      // Create filtered analytics for just this project
      filtered = {
        totalSessions: projectData.sessions,
        totalMessages: projectData.messages,
        totalTokens: projectData.tokens,
        totalCost: projectData.cost,
        byModel: {
          // We don't have per-project model breakdown, so zero it out for project view
          opus: { sessions: 0, tokens: 0, cost: 0 },
          sonnet: { sessions: 0, tokens: 0, cost: 0 }
        },
        byDate: {}, // Would need session-level data to filter by project
        byProject: { [selectedProject]: projectData }
      };
    }
    
    // Apply time range filter (skip for project view since we don't have date-level project data)
    if (timeRange !== 'all' && viewMode !== 'project') {
      const now = Date.now();
      const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
      const fourteenDaysAgo = now - (14 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
      
      const cutoffTime = timeRange === '7d' ? sevenDaysAgo : 
                         timeRange === '14d' ? fourteenDaysAgo : thirtyDaysAgo;
      const cutoffDate = new Date(cutoffTime).toISOString().split('T')[0];
      
      // Filter by date
      const timeFiltered: Analytics = {
        totalSessions: 0,
        totalMessages: 0,
        totalTokens: 0,
        totalCost: 0,
        byModel: {
          opus: { sessions: 0, tokens: 0, cost: 0 },
          sonnet: { sessions: 0, tokens: 0, cost: 0 }
        },
        byDate: {},
        byProject: filtered.byProject
      };
      
      // Filter dates
      Object.entries(filtered.byDate).forEach(([date, data]) => {
        if (date >= cutoffDate) {
          timeFiltered.byDate[date] = data;
          timeFiltered.totalSessions += data.sessions;
          timeFiltered.totalMessages += data.messages;
          timeFiltered.totalTokens += data.tokens;
          timeFiltered.totalCost += data.cost;
        }
      });
      
      // Keep model data as-is for now
      timeFiltered.byModel = filtered.byModel;
      
      return timeFiltered;
    }
    
    return filtered;
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
      .sort((a, b) => b[1].tokens - a[1].tokens)
      .slice(0, 5) : [];

  // Get recent dates for chart based on time range
  const recentDates = filteredAnalytics ?
    Object.entries(filteredAnalytics.byDate)
      .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime()) // Sort chronologically
      .slice(-(timeRange === '7d' ? 7 : timeRange === '14d' ? 14 : timeRange === '30d' ? 30 : 60)) // Take last N days
      : [];

  // Calculate max tokens for chart scaling
  const maxDailyTokens = Math.max(...recentDates.map(([_, data]) => data.tokens), 1);

  return (
    <div className="analytics-modal-overlay" onClick={onClose}>
      <div className="analytics-modal" onClick={(e) => e.stopPropagation()}>
        <div className="analytics-header" data-tauri-drag-region>
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
          <button className="analytics-close" onClick={onClose}>
            <IconX size={16} stroke={1.5} />
          </button>
        </div>

        {viewMode === 'all' && (
          <div className="analytics-controls">
            <div className="time-range-selector">
              <button 
                className={timeRange === '7d' ? 'active' : ''} 
                onClick={() => setTimeRange('7d')}
              >
                7 days
              </button>
              <button 
                className={timeRange === '14d' ? 'active' : ''} 
                onClick={() => setTimeRange('14d')}
              >
                14 days
              </button>
              <button 
                className={timeRange === '30d' ? 'active' : ''} 
                onClick={() => setTimeRange('30d')}
              >
                30 days
              </button>
              <button 
                className={timeRange === 'all' ? 'active' : ''} 
                onClick={() => setTimeRange('all')}
              >
                all time
              </button>
            </div>
          </div>
        )}

        <div className="analytics-content">
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
              <LoadingIndicator message="loading analytics..." />
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

              {/* Daily Usage Chart - only show in all view */}
              {viewMode === 'all' && (
                <div className="analytics-section">
                  <h3>daily usage</h3>
                <div className="usage-chart">
                  {recentDates.length > 0 ? (
                    recentDates.map(([date, data], index) => (
                      <div key={date} className="chart-bar-container">
                        <div className="chart-bar-wrapper">
                          <div 
                            className="chart-bar"
                            style={{ 
                              height: `${(data.tokens / maxDailyTokens) * 100}%`
                            }}
                          />
                        </div>
                        {/* Only show label every other day for longer ranges */}
                        <div className="chart-label">
                          {(timeRange === '7d' || index % 2 === 0 || index === recentDates.length - 1) ? 
                            (timeRange === 'all' || timeRange === '30d' ? 
                              `${new Date(date).getMonth()+1}/${new Date(date).getDate()}` :
                              new Date(date).toLocaleDateString('en', { month: 'short', day: 'numeric' })
                            ) : ''
                          }
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'center', 
                      alignItems: 'center', 
                      height: '100px',
                      color: 'rgba(255, 255, 255, 0.3)',
                      fontSize: '11px'
                    }}>
                      no data for selected period
                    </div>
                  )}
                </div>
              </div>
              )}

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