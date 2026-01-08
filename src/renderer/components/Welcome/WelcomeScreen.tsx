import React, { useState, useEffect, useCallback } from 'react';
import { IconFolderOpen, IconPlus, IconX, IconTrash, IconChevronDown, IconChartDots, IconMessage, IconArtboardFilled, IconSend, IconTool, IconBrain, IconCoin } from '@tabler/icons-react';
import { useClaudeCodeStore } from '../../stores/claudeCodeStore';
import { KeyboardShortcuts } from '../KeyboardShortcuts/KeyboardShortcuts';
import { platformAPI as tauriApi } from '../../services/tauriApi';
import { invoke } from '@tauri-apps/api/core';
import './WelcomeScreen.css';
import '../Chat/ClaudeChat.css'; // for stats modal styles

// format reset time as relative time string
const formatResetTime = (resetAt: string | undefined): string => {
  if (!resetAt) return '';
  const resetDate = new Date(resetAt);
  const now = new Date();
  const diffMs = resetDate.getTime() - now.getTime();
  if (diffMs <= 0) return 'now';
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (diffHours > 24) {
    const days = Math.floor(diffHours / 24);
    const hrs = diffHours % 24;
    return hrs > 0 ? `${days}d ${hrs}h` : `${days}d`;
  }
  if (diffHours > 0) return `${diffHours}h ${diffMins}m`;
  return `${diffMins}m`;
};

interface RecentProject {
  path: string;
  name: string;
  lastOpened: Date | number;
  accessCount?: number;
}

export const WelcomeScreen: React.FC = () => {
  const { createSession, autoCompactEnabled, setAutoCompactEnabled } = useClaudeCodeStore();
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [usageLimits, setUsageLimits] = useState<{
    five_hour?: { utilization: number; resets_at: string };
    seven_day?: { utilization: number; resets_at: string };
  }>({});

  // Platform detection for keyboard shortcuts
  const isMac = navigator.platform.toLowerCase().includes('mac');
  const modKey = isMac ? 'cmd' : 'ctrl';

  // Fetch usage limits with 10-min cache
  const fetchUsageLimits = useCallback((force = false) => {
    const CACHE_KEY = 'yurucode_usage_limits_cache';
    const CACHE_DURATION = 10 * 60 * 1000;

    if (!force) {
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const { data, timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_DURATION) {
            setUsageLimits(data);
            return;
          }
        }
      } catch (e) {}
    }

    invoke<{
      five_hour?: { utilization: number; resets_at: string };
      seven_day?: { utilization: number; resets_at: string };
    }>('get_claude_usage_limits')
      .then(data => {
        setUsageLimits(data);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
        } catch (e) {}
      })
      .catch(err => console.error('Failed to fetch usage limits:', err));
  }, []);

  useEffect(() => {
    fetchUsageLimits();
    const interval = setInterval(() => fetchUsageLimits(true), 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchUsageLimits]);

  useEffect(() => {
    // Load recent projects from localStorage
    const loadRecentProjects = () => {
      const stored = localStorage.getItem('yurucode-recent-projects');
      if (stored) {
        try {
          const projects = JSON.parse(stored).map((p: any) => ({
            ...p,
            lastOpened: new Date(p.lastOpened)
          }));
          setRecentProjects(projects.slice(0, 10)); // Show max 10 recent projects
        } catch (e) {
          console.error('Failed to load recent projects:', e);
        }
      } else {
        setRecentProjects([]);
      }
    };

    loadRecentProjects();

    // Listen for updates to recent projects
    const handleRecentProjectsUpdate = () => {
      loadRecentProjects();
      // Don't automatically open modal when projects are updated
    };


    window.addEventListener('recentProjectsUpdated', handleRecentProjectsUpdate);
    return () => {
      window.removeEventListener('recentProjectsUpdated', handleRecentProjectsUpdate);
    };
  }, []);

  // Handle keyboard shortcuts (moved after function definitions)
  // Will be set up after all functions are defined

  const handleSelectFolder = async () => {
    // Import the Tauri API dynamically
    if (window.__TAURI__) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const folderPath = await invoke<string | null>('select_folder');
        if (folderPath) {
          openProject(folderPath);
        }
      } catch (error) {
        console.error('Failed to select folder:', error);
      }
    }
  };

  const handleNewSession = async (e?: React.MouseEvent) => {
    // Add ripple effect if it's a mouse event
    if (e) {
      const target = e.currentTarget as HTMLElement;
      const rect = target.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // Create ripple element directly in DOM
      const ripple = document.createElement('div');
      ripple.style.cssText = `
        position: absolute;
        top: ${y}px;
        left: ${x}px;
        width: 0;
        height: 0;
        border-radius: 50%;
        background: rgba(var(--accent-rgb), 0.4);
        transform: translate(-50%, -50%);
        pointer-events: none;
        z-index: 100;
        animation: welcome-ripple-expand 1s ease-out forwards;
      `;
      target.appendChild(ripple);
      
      // Remove ripple after animation completes
      setTimeout(() => {
        if (ripple.parentNode) {
          ripple.parentNode.removeChild(ripple);
        }
      }, 1000);
    }

    let directory = null;
    
    // Check if we're in Tauri environment
    if (window.__TAURI__) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        directory = await invoke<string | null>('select_folder');
        if (!directory) {
          // User cancelled folder selection
          return;
        }
      } catch (error) {
        console.error('Folder selection failed:', error);
        // Don't fall back, just return
        return;
      }
    } else {
      // No folder selection available
      console.error('No folder selection method available - not in Tauri environment');
      return;
    }
    
    // Create session with selected directory
    openProject(directory);
  };

  const openProject = (path: string) => {
    // Update recent projects
    const name = path.split(/[/\\]/).pop() || path;
    const newProject = { path, name, lastOpened: Date.now(), accessCount: 1 };
    
    const updated = [
      newProject,
      ...recentProjects.filter(p => p.path !== path)
    ].slice(0, 10);

    setRecentProjects(updated);
    localStorage.setItem('yurucode-recent-projects', JSON.stringify(updated));

    // Create new session with this folder
    createSession(name, path);
  };

  // Set up keyboard shortcuts after function definitions
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input fields
      const target = e.target as HTMLElement;
      const isInputField = target.tagName === 'INPUT' || 
                           target.tagName === 'TEXTAREA' || 
                           target.contentEditable === 'true';
      
      // Handle ESC to close modals
      if (e.key === 'Escape') {
        if (showHelpModal) {
          setShowHelpModal(false);
        }
        return;
      }
      
      // Handle '1', '2', '3' keys to open recent projects (global shortcuts)
      if (['1', '2', '3'].includes(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey && !isInputField) {
        const index = parseInt(e.key) - 1;
        if (recentProjects.length > index) {
          e.preventDefault();
          openProject(recentProjects[index].path);
        }
        return;
      }

      // Don't process other shortcuts if in input field
      if (isInputField) return;
      
      // Handle ? for help
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setShowHelpModal(true);
      }
      
      // Handle Ctrl+R or Down arrow for recent projects
      if (((e.ctrlKey || e.metaKey) && e.key === 'r') || e.key === 'ArrowDown') {
        e.preventDefault();
        if (recentProjects.length > 0) {
          const event = new CustomEvent('openRecentProjects');
          window.dispatchEvent(event);
        }
      }
      
      // Handle Ctrl+T for new tab
      if ((e.ctrlKey || e.metaKey) && e.key === 't') {
        e.preventDefault();
        handleNewSession();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showHelpModal, recentProjects, handleNewSession]);

  return (
    <div className="welcome-screen">
      <div className="welcome-content">

        <div className="welcome-buttons">
          <button
            className="welcome-new-button"
            onClick={handleNewSession}
            title={`new tab (${modKey}+t)`}
          >
            <IconPlus size={20} />
          </button>

          <button
            className="action-button"
            onClick={(e) => {
              // Add ripple effect
              const target = e.currentTarget as HTMLElement;
              const rect = target.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const y = e.clientY - rect.top;

              // Create ripple element directly in DOM
              const ripple = document.createElement('div');
              ripple.style.cssText = `
                position: absolute;
                top: ${y}px;
                left: ${x}px;
                width: 0;
                height: 0;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.2);
                transform: translate(-50%, -50%);
                pointer-events: none;
                z-index: 100;
                animation: welcome-ripple-expand 1s ease-out forwards;
              `;
              target.appendChild(ripple);

              // Remove ripple after animation completes
              setTimeout(() => {
                if (ripple.parentNode) {
                  ripple.parentNode.removeChild(ripple);
                }
              }, 1000);

              const event = new CustomEvent('openRecentProjects');
              window.dispatchEvent(event);
            }}
            disabled={recentProjects.length === 0}
            title={`recent projects (${modKey}+r)`}
          >
            <span>{recentProjects.length}</span>
            <IconChevronDown size={16} stroke={1.5} />
          </button>
        </div>

        {/* Quick nav to recent projects (up to 3) */}
        {recentProjects.length > 0 && (
          <div className="welcome-quick-nav-container">
            {recentProjects.slice(0, 3).map((project, index) => (
              <span
                key={project.path}
                className="welcome-quick-nav"
                onClick={() => openProject(project.path)}
                title={`press ${index + 1} to open`}
              >
                <span style={{ opacity: 0.9 }}>{index + 1}</span> {project.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Usage limit bars - bottom right like chat */}
      <div className="welcome-usage-container">
        <div className="btn-stats-container">
          <button
            className="btn-stats"
            onClick={() => setShowStatsModal(true)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setAutoCompactEnabled(autoCompactEnabled === false ? true : false);
            }}
            title="context usage (right-click to toggle auto-compact)"
          >
            {autoCompactEnabled !== false ? (
              <span className="btn-stats-auto">auto</span>
            ) : (
              <span className="btn-stats-auto">user</span>
            )}
            <span>context</span>
          </button>
          {/* 5h limit bar */}
          <div className="btn-stats-limit-bar five-hour">
            <div
              className={`btn-stats-limit-fill ${(usageLimits?.five_hour?.utilization ?? 0) >= 90 ? 'warning' : 'normal'}`}
              style={{
                width: `${Math.min(usageLimits?.five_hour?.utilization ?? 0, 100)}%`,
                opacity: 0.2 + (Math.min(usageLimits?.five_hour?.utilization ?? 0, 80) / 80) * 0.8
              }}
            />
          </div>
          {/* 7d limit bar */}
          <div className="btn-stats-limit-bar seven-day">
            <div
              className={`btn-stats-limit-fill ${(usageLimits?.seven_day?.utilization ?? 0) >= 90 ? 'warning' : 'normal'}`}
              style={{
                width: `${Math.min(usageLimits?.seven_day?.utilization ?? 0, 100)}%`,
                opacity: 0.2 + (Math.min(usageLimits?.seven_day?.utilization ?? 0, 80) / 80) * 0.8
              }}
            />
          </div>
        </div>
      </div>

      {/* Stats Modal */}
      {showStatsModal && (
        <div className="stats-modal-overlay" onClick={() => setShowStatsModal(false)}>
          <div className="stats-modal" onClick={(e) => e.stopPropagation()}>
            <div className="stats-header">
              <h3>
                <IconChartDots size={16} stroke={1.5} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                context usage
              </h3>
              <div className="stats-header-right">
                <div className="stats-toggle-container">
                  <span className="stats-toggle-label">auto-compact:</span>
                  <div
                    className={`toggle-switch compact ${autoCompactEnabled !== false ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setAutoCompactEnabled(autoCompactEnabled === false ? true : false);
                    }}
                    title={autoCompactEnabled !== false ? 'auto-compact enabled (60% threshold)' : 'auto-compact disabled'}
                  >
                    <span className="toggle-switch-label off">off</span>
                    <span className="toggle-switch-label on">on</span>
                    <div className="toggle-switch-slider" />
                  </div>
                </div>
                <button className="stats-close" onClick={() => setShowStatsModal(false)}>
                  <IconX size={16} />
                </button>
              </div>
            </div>
            <div className="stats-content" style={{ opacity: 0.5, pointerEvents: 'none' }}>
              {/* Current tab section - disabled since no active tab */}
              <div className="stats-column" style={{ gridColumn: 'span 2' }}>
                <div className="stats-section">
                  <div className="usage-bar-container" style={{ marginBottom: '8px' }}>
                    <div className="usage-bar-label">
                      <span>0 / 200k</span>
                      <span>0.00%</span>
                    </div>
                    <div className="usage-bar">
                      <div className="usage-bar-fill" style={{ width: '0%' }} />
                    </div>
                  </div>
                  <div className="stat-row">
                    <div className="stat-keys">
                      <IconMessage size={14} />
                      <span className="stat-name">actual tokens</span>
                    </div>
                    <span className="stat-dots"></span>
                    <span className="stat-desc">0 (in: 0, out: 0)</span>
                  </div>
                  <div className="stat-row">
                    <div className="stat-keys">
                      <IconArtboardFilled size={14} />
                      <span className="stat-name">cache tokens</span>
                    </div>
                    <span className="stat-dots"></span>
                    <span className="stat-desc">0 (read: 0, new: 0)</span>
                  </div>
                </div>
              </div>
              <div className="stats-column">
                <div className="stats-section">
                  <div className="stat-row">
                    <div className="stat-keys">
                      <IconSend size={14} />
                      <span className="stat-name">messages</span>
                    </div>
                    <span className="stat-dots"></span>
                    <span className="stat-desc">0</span>
                  </div>
                  <div className="stat-row">
                    <div className="stat-keys">
                      <IconTool size={14} />
                      <span className="stat-name">tool uses</span>
                    </div>
                    <span className="stat-dots"></span>
                    <span className="stat-desc">0</span>
                  </div>
                </div>
              </div>
              <div className="stats-column">
                <div className="stats-section">
                  <div className="stat-row">
                    <div className="stat-keys">
                      <IconBrain size={14} />
                      <span className="stat-name">opus %</span>
                    </div>
                    <span className="stat-dots"></span>
                    <span className="stat-desc">0%</span>
                  </div>
                  <div className="stat-row">
                    <div className="stat-keys">
                      <IconCoin size={14} />
                      <span className="stat-name">total</span>
                    </div>
                    <span className="stat-dots"></span>
                    <span className="stat-desc">$0.00</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="stats-footer">
              {/* Session Limit (5-hour) */}
              <div className="stats-footer-row">
                <span className="stats-footer-label"><span className="stats-footer-limit-name">5h limit</span> - resets in {usageLimits?.five_hour?.resets_at ? formatResetTime(usageLimits.five_hour.resets_at) : '...'}</span>
                <span className={`stats-footer-value ${(usageLimits?.five_hour?.utilization ?? 0) >= 90 ? 'usage-negative' : ''}`}>{usageLimits?.five_hour?.utilization != null ? Math.round(usageLimits.five_hour.utilization) : '...'}%</span>
              </div>
              <div className="usage-bar" style={{ marginBottom: '8px' }}>
                <div
                  className="usage-bar-fill"
                  style={{
                    width: `${Math.min(usageLimits?.five_hour?.utilization ?? 0, 100)}%`,
                    background: (usageLimits?.five_hour?.utilization ?? 0) >= 90
                      ? 'var(--negative-color, #ff6b6b)'
                      : 'var(--accent-color)'
                  }}
                />
              </div>

              {/* Weekly Limit (7-day) */}
              <div className="stats-footer-row">
                <span className="stats-footer-label stats-footer-label-bold"><span className="stats-footer-limit-name">7d limit</span> - resets in {usageLimits?.seven_day?.resets_at ? formatResetTime(usageLimits.seven_day.resets_at) : '...'}</span>
                <span className={`stats-footer-value ${(usageLimits?.seven_day?.utilization ?? 0) >= 90 ? 'usage-negative' : ''}`}>{usageLimits?.seven_day?.utilization != null ? Math.round(usageLimits.seven_day.utilization) : '...'}%</span>
              </div>
              <div className="usage-bar">
                <div
                  className="usage-bar-fill"
                  style={{
                    width: `${Math.min(usageLimits?.seven_day?.utilization ?? 0, 100)}%`,
                    background: (usageLimits?.seven_day?.utilization ?? 0) >= 90
                      ? 'var(--negative-color, #ff6b6b)'
                      : 'var(--accent-color)'
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Help Modal - using shared component */}
      {showHelpModal && <KeyboardShortcuts onClose={() => setShowHelpModal(false)} />}
    </div>
  );
};