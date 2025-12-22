import React, { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { IconRefresh, IconCopy, IconX, IconTrash, IconTerminal, IconFilter, IconChevronDown, IconChevronRight, IconSearch } from '@tabler/icons-react';
import { parseAndGroupLogs, filterLogs, extractSessions, LogCategory, LogGroup } from '../../utils/logParser';
import './ServerLogs.css';

interface ServerLogsProps {
  isOpen: boolean;
  onClose: () => void;
}

const ALL_CATEGORIES: LogCategory[] = ['system', 'api', 'tokens', 'health', 'error', 'process', 'config', 'data', 'other'];

const CATEGORY_LABELS: Record<LogCategory, string> = {
  system: 'system',
  api: 'api',
  tokens: 'tokens',
  health: 'health',
  error: 'errors',
  process: 'process',
  config: 'config',
  data: 'data',
  other: 'other',
};

export const ServerLogs: React.FC<ServerLogsProps> = ({ isOpen, onClose }) => {
  const [logs, setLogs] = useState<string>('');
  const [logPath, setLogPath] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  // Filters
  const [selectedCategories, setSelectedCategories] = useState<Set<LogCategory>>(new Set(ALL_CATEGORIES));
  const [hideHeartbeats, setHideHeartbeats] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Collapsed groups tracking - using stable IDs instead of indices
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const [logsData, path] = await Promise.all([
        invoke<string>('get_server_logs'),
        invoke<string>('get_server_log_path')
      ]);
      setLogs(logsData);
      setLogPath(path);
    } catch (error) {
      console.error('failed to fetch logs:', error);
      setLogs(`error fetching logs: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchLogs();
      // Auto-refresh every 2 seconds while open
      const interval = setInterval(fetchLogs, 2000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  // Parse and filter logs
  const { groups, sessions, filteredGroups } = useMemo(() => {
    if (!logs) return { groups: [], sessions: [], filteredGroups: [] };

    const parsed = parseAndGroupLogs(logs);
    const sessionList = extractSessions(parsed);
    const filtered = filterLogs(parsed, {
      categories: selectedCategories,
      hideHeartbeats,
      searchText,
      sessionId: selectedSession,
    });

    return { groups: parsed, sessions: sessionList, filteredGroups: filtered };
  }, [logs, selectedCategories, hideHeartbeats, searchText, selectedSession]);

  const copyLogs = () => {
    navigator.clipboard.writeText(logs);
  };

  const clearLogs = async () => {
    try {
      await invoke('clear_server_logs');
      setLogs('');
      setTimeout(fetchLogs, 100);
    } catch (error) {
      console.error('failed to clear logs:', error);
    }
  };

  const toggleCategory = (category: LogCategory) => {
    const newCategories = new Set(selectedCategories);
    if (newCategories.has(category)) {
      newCategories.delete(category);
    } else {
      newCategories.add(category);
    }
    setSelectedCategories(newCategories);
  };

  const toggleAllCategories = () => {
    if (selectedCategories.size === ALL_CATEGORIES.length) {
      setSelectedCategories(new Set());
    } else {
      setSelectedCategories(new Set(ALL_CATEGORIES));
    }
  };

  const toggleGroup = (groupId: string) => {
    const newCollapsed = new Set(collapsedGroups);
    if (newCollapsed.has(groupId)) {
      newCollapsed.delete(groupId);
    } else {
      newCollapsed.add(groupId);
    }
    setCollapsedGroups(newCollapsed);
  };

  const renderGroup = (group: LogGroup) => {
    const isCollapsed = collapsedGroups.has(group.id);

    // Heartbeat group - show condensed view
    if (group.type === 'heartbeat') {
      const lastLog = group.logs[group.logs.length - 1];
      return (
        <div key={group.id} className="log-group log-group-heartbeat">
          <div className="log-line log-health" onClick={() => toggleGroup(group.id)}>
            {isCollapsed ? <IconChevronRight size={12} /> : <IconChevronDown size={12} />}
            <span className="log-timestamp">{lastLog.timestamp}</span>
            <span className="log-content">
              🩺 health checks ({group.count} messages) - last: {lastLog.content.match(/duration: (\d+ms)/)?.[1]}
            </span>
          </div>
          {!isCollapsed && (
            <div className="log-group-expanded">
              {group.logs.map((log, i) => (
                <div key={i} className={`log-line log-${log.severity}`}>
                  <span className="log-timestamp">{log.timestamp}</span>
                  <span className="log-content">{log.content}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    // Table group - collapsible
    if (group.type === 'table') {
      const firstLog = group.logs[0];
      return (
        <div key={group.id} className="log-group log-group-table">
          <div className="log-line log-tokens" onClick={() => toggleGroup(group.id)}>
            {isCollapsed ? <IconChevronRight size={12} /> : <IconChevronDown size={12} />}
            <span className="log-timestamp">{firstLog.timestamp}</span>
            <span className="log-content">
              {firstLog.content.includes('TOKEN') ? '📊 token usage breakdown' : firstLog.content.substring(0, 60)}...
            </span>
          </div>
          {!isCollapsed && (
            <div className="log-group-expanded log-table">
              {group.logs.map((log, i) => (
                <div key={i} className="log-line">
                  <span className="log-content">{log.content}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    // Normal logs
    return (
      <div key={group.id} className="log-group">
        {group.logs.map((log, i) => (
          <div key={i} className={`log-line log-${log.severity} log-cat-${log.category}`}>
            <span className="log-timestamp">{log.timestamp}</span>
            <span className={`log-type log-type-${log.type.toLowerCase()}`}>{log.type}</span>
            <span className="log-content">{log.content}</span>
          </div>
        ))}
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="server-logs-overlay">
      <div className="server-logs-modal">
        <div className="server-logs-header" data-tauri-drag-region>
          <div className="server-logs-title" data-tauri-drag-region>
            <IconTerminal size={16} />
            <span>server logs</span>
            {filteredGroups.length < groups.length && (
              <span className="logs-filtered-count">
                ({filteredGroups.length}/{groups.length})
              </span>
            )}
          </div>
          <div className="server-logs-actions">
            <button
              className={`server-logs-filter ${showFilters ? 'active' : ''}`}
              onClick={() => setShowFilters(!showFilters)}
              title="toggle filters"
            >
              <IconFilter size={16} />
            </button>
            <button className="server-logs-refresh" onClick={fetchLogs} disabled={isLoading} title="refresh">
              <IconRefresh size={16} />
            </button>
            <button className="server-logs-clear" onClick={clearLogs} title="clear logs">
              <IconTrash size={16} />
            </button>
            <button className="server-logs-copy" onClick={copyLogs} title="copy all">
              <IconCopy size={16} />
            </button>
            <button className="server-logs-close" onClick={onClose} title="close (esc)">
              <IconX size={16} />
            </button>
          </div>
        </div>

        {logPath && (
          <div className="server-logs-path">
            log file: {logPath}
          </div>
        )}

        {showFilters && (
          <div className="server-logs-filters">
            <div className="filter-row">
              <div className="filter-search">
                <IconSearch size={14} />
                <input
                  type="text"
                  placeholder="search logs..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                />
              </div>
            </div>

            <div className="filter-row">
              <label className="filter-checkbox">
                <input
                  type="checkbox"
                  checked={hideHeartbeats}
                  onChange={(e) => setHideHeartbeats(e.target.checked)}
                />
                <span>hide heartbeats</span>
              </label>

              <button className="filter-toggle-all" onClick={toggleAllCategories}>
                {selectedCategories.size === ALL_CATEGORIES.length ? 'deselect all' : 'select all'}
              </button>
            </div>

            <div className="filter-categories">
              {ALL_CATEGORIES.map(cat => (
                <label key={cat} className="filter-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedCategories.has(cat)}
                    onChange={() => toggleCategory(cat)}
                  />
                  <span className={`category-badge category-${cat}`}>{CATEGORY_LABELS[cat]}</span>
                </label>
              ))}
            </div>

            {sessions.length > 0 && (
              <div className="filter-row">
                <select
                  className="filter-session"
                  value={selectedSession || ''}
                  onChange={(e) => setSelectedSession(e.target.value || null)}
                >
                  <option value="">all sessions</option>
                  {sessions.map(session => (
                    <option key={session} value={session}>
                      {session}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        <div className="server-logs-content">
          {filteredGroups.length > 0 ? (
            <div className="logs-container">
              {filteredGroups.map(group => renderGroup(group))}
            </div>
          ) : (
            <div className="logs-empty">
              {logs ? 'no logs match current filters' : 'no logs available yet...'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};