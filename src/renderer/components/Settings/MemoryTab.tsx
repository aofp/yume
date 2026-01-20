// MemoryTab - Memory system management UI for settings modal
// Controls the built-in MCP memory server and knowledge graph

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  IconBrain,
  IconDatabase,
  IconTrash,
  IconRefresh,
  IconLoader2,
  IconChevronDown,
  IconChevronRight
} from '@tabler/icons-react';
import { ConfirmModal } from '../ConfirmModal/ConfirmModal';
import { invoke } from '@tauri-apps/api/core';
import { useClaudeCodeStore } from '../../stores/claudeCodeStore';
import { memoryService, MemoryEntity, parseObservationTimestamp } from '../../services/memoryService';
import { toastService } from '../../services/toastService';
import './MemoryTab.css';

interface GraphStats {
  entityCount: number;
  relationCount: number;
  entitiesByType: Record<string, MemoryEntity[]>;
}

// Navigation item for flat index
interface NavItem {
  type: 'type' | 'entity';
  typeKey: string;
  entityName?: string;
}

// Format relative date
function formatRelativeDate(date: Date | null): string {
  if (!date) return '';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

// Get most recent date from entity observations
function getEntityMostRecentDate(entity: MemoryEntity): Date | null {
  let mostRecent: Date | null = null;
  for (const obs of entity.observations) {
    const { date } = parseObservationTimestamp(obs);
    if (date && (!mostRecent || date > mostRecent)) {
      mostRecent = date;
    }
  }
  return mostRecent;
}

export const MemoryTab: React.FC = () => {
  const { memoryEnabled, memoryServerRunning, memoryRetentionDays, setMemoryRetentionDays } = useClaudeCodeStore();
  const [pruning, setPruning] = useState(false);
  const [memoryFilePath, setMemoryFilePath] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [graphStats, setGraphStats] = useState<GraphStats | null>(null);
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());
  const [expandedEntities, setExpandedEntities] = useState<Set<string>>(new Set());

  // Keyboard navigation state
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isDangerous?: boolean;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  useEffect(() => {
    loadMemoryFilePath();
  }, []);

  // Ref to store loadMemoryGraph for event listener
  const loadGraphRef = useRef<(() => void) | null>(null);

  const showNotification = (message: string, type: 'error' | 'success' | 'info') => {
    toastService[type](message);
  };

  const loadMemoryFilePath = async () => {
    try {
      const path = await memoryService.getMemoryFilePath();
      setMemoryFilePath(path);
    } catch (error) {
      console.error('Failed to get memory file path:', error);
    }
  };

  const loadMemoryGraph = useCallback(async () => {
    try {
      setLoading(true);
      const { entities } = await memoryService.readGraph();

      // Group entities by type
      const entitiesByType = entities.reduce((acc, entity) => {
        if (!acc[entity.entityType]) {
          acc[entity.entityType] = [];
        }
        acc[entity.entityType].push(entity);
        return acc;
      }, {} as Record<string, MemoryEntity[]>);

      setGraphStats({
        entityCount: entities.length,
        relationCount: 0, // Relations counted separately if needed
        entitiesByType
      });

      showNotification('memory graph loaded', 'success');
    } catch (error) {
      console.error('Failed to load memory graph:', error);
      showNotification('failed to load memory', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  // Update ref when loadMemoryGraph changes
  useEffect(() => {
    loadGraphRef.current = loadMemoryGraph;
  }, [loadMemoryGraph]);

  // Auto-load graph when memory server is running and tab is opened
  useEffect(() => {
    if (memoryServerRunning && !graphStats && !loading) {
      loadMemoryGraph();
    }
  }, [memoryServerRunning, graphStats, loading, loadMemoryGraph]);

  // Listen for memory-load-graph event from command palette
  useEffect(() => {
    const handleLoadGraph = () => {
      if (memoryServerRunning && loadGraphRef.current) {
        loadGraphRef.current();
      }
    };
    window.addEventListener('memory-load-graph', handleLoadGraph);
    return () => window.removeEventListener('memory-load-graph', handleLoadGraph);
  }, [memoryServerRunning]);

  const deleteEntity = (entityName: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'delete entity',
      message: `delete entity "${entityName}" and all its relations?`,
      isDangerous: true,
      onConfirm: async () => {
        try {
          const success = await memoryService.deleteEntity(entityName);
          if (success) {
            showNotification('entity deleted', 'success');
            await loadMemoryGraph();
          } else {
            showNotification('failed to delete entity', 'error');
          }
        } catch (error) {
          console.error('Failed to delete entity:', error);
          showNotification('failed to delete entity', 'error');
        } finally {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const pruneOldMemories = async () => {
    try {
      setPruning(true);
      const result = await invoke<{ success: boolean; pruned_count: number; error?: string }>('memory_prune_old', { retentionDays: memoryRetentionDays });
      if (result.success) {
        showNotification(`pruned ${result.pruned_count} old memories`, 'success');
        if (graphStats) {
          await loadMemoryGraph();
        }
      } else {
        showNotification(result.error || 'failed to prune', 'error');
      }
    } catch (error) {
      console.error('Failed to prune memories:', error);
      showNotification('failed to prune memories', 'error');
    } finally {
      setPruning(false);
    }
  };

  const clearAllMemories = () => {
    setConfirmModal({
      isOpen: true,
      title: 'clear all memories',
      message: 'permanently delete all memories? this cannot be undone.',
      isDangerous: true,
      onConfirm: async () => {
        try {
          const result = await invoke<{ success: boolean; error?: string }>('memory_clear_all');
          if (result.success) {
            showNotification('all memories cleared', 'success');
            setGraphStats(null);
          } else {
            showNotification(result.error || 'failed to clear', 'error');
          }
        } catch (error) {
          console.error('Failed to clear memories:', error);
          showNotification('failed to clear memories', 'error');
        } finally {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const toggleTypeExpansion = (type: string) => {
    setExpandedTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const toggleEntityExpansion = (entityName: string) => {
    setExpandedEntities(prev => {
      const next = new Set(prev);
      if (next.has(entityName)) {
        next.delete(entityName);
      } else {
        next.add(entityName);
      }
      return next;
    });
  };

  // Build flat navigation index from current visible items
  const buildNavItems = useCallback((): NavItem[] => {
    if (!graphStats) return [];
    const items: NavItem[] = [];
    const types = Object.keys(graphStats.entitiesByType).sort();

    for (const typeKey of types) {
      items.push({ type: 'type', typeKey });
      if (expandedTypes.has(typeKey)) {
        const entities = graphStats.entitiesByType[typeKey] || [];
        for (const entity of entities) {
          items.push({ type: 'entity', typeKey, entityName: entity.name });
        }
      }
    }
    return items;
  }, [graphStats, expandedTypes]);

  const navItems = buildNavItems();

  // Keyboard navigation handler
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!graphStats || navItems.length === 0) return;

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, navItems.length - 1));
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        break;
      }
      case 'ArrowRight':
      case 'Enter': {
        e.preventDefault();
        if (selectedIndex < 0 || selectedIndex >= navItems.length) return;
        const item = navItems[selectedIndex];
        if (item.type === 'type') {
          if (!expandedTypes.has(item.typeKey)) {
            toggleTypeExpansion(item.typeKey);
          } else if (e.key === 'Enter' && item.entityName) {
            toggleEntityExpansion(item.entityName);
          }
        } else if (item.type === 'entity' && item.entityName) {
          toggleEntityExpansion(item.entityName);
        }
        break;
      }
      case 'ArrowLeft': {
        e.preventDefault();
        if (selectedIndex < 0 || selectedIndex >= navItems.length) return;
        const item = navItems[selectedIndex];
        if (item.type === 'type') {
          if (expandedTypes.has(item.typeKey)) {
            toggleTypeExpansion(item.typeKey);
          }
        } else if (item.type === 'entity' && item.entityName) {
          if (expandedEntities.has(item.entityName)) {
            toggleEntityExpansion(item.entityName);
          } else {
            // go back to parent type
            const typeIdx = navItems.findIndex(n => n.type === 'type' && n.typeKey === item.typeKey);
            if (typeIdx >= 0) setSelectedIndex(typeIdx);
          }
        }
        break;
      }
      case 'Backspace':
      case 'Delete': {
        e.preventDefault();
        if (selectedIndex < 0 || selectedIndex >= navItems.length) return;
        const item = navItems[selectedIndex];
        if (item.type === 'entity' && item.entityName) {
          deleteEntity(item.entityName);
        }
        break;
      }
    }
  }, [graphStats, navItems, selectedIndex, expandedTypes, expandedEntities, toggleTypeExpansion, toggleEntityExpansion, deleteEntity]);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      const selected = listRef.current.querySelector('.memory-nav-selected');
      if (selected) {
        selected.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex]);

  // Helper to check if item is selected
  const isSelected = (item: NavItem) => {
    if (selectedIndex < 0 || selectedIndex >= navItems.length) return false;
    const sel = navItems[selectedIndex];
    return sel.type === item.type && sel.typeKey === item.typeKey && sel.entityName === item.entityName;
  };

  return (
    <div className="memory-tab">
      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText="delete"
        cancelText="cancel"
        isDangerous={confirmModal.isDangerous}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />

      {/* Header */}
      <div className="memory-header">
        <h4>memory system</h4>
      </div>

      {/* Settings Section - only show when memory is enabled */}
      {memoryEnabled && (
        <div className="memory-section">
          <div className="memory-section-header">
            <IconBrain size={12} />
            <span>settings</span>
          </div>

          {/* Retention Days */}
          <div className="memory-settings-row">
            <span className="memory-settings-label">retention days</span>
            <div className="memory-settings-controls">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={memoryRetentionDays}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val) && val >= 1 && val <= 365) {
                    setMemoryRetentionDays(val);
                  }
                }}
                className="memory-input"
              />
              <button
                className="memory-action-btn"
                onClick={pruneOldMemories}
                disabled={pruning}
              >
                {pruning ? <IconLoader2 size={10} className="spin" /> : <IconTrash size={10} />}
                prune
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Disabled State */}
      {!memoryEnabled && (
        <div className="memory-disabled-message">
          enable memory in general tab to use this feature
        </div>
      )}

      {/* Memory Inspector Section */}
      {memoryServerRunning && (
        <div className="memory-section">
          <div className="memory-section-header">
            <IconDatabase size={12} />
            <span>inspector</span>
          </div>

          <div className="memory-actions" style={{ marginBottom: '8px' }}>
            <button
              className="memory-action-btn"
              onClick={loadMemoryGraph}
              disabled={loading}
            >
              {loading ? (
                <IconLoader2 size={10} className="spin" />
              ) : (
                <IconRefresh size={10} />
              )}
              load graph
            </button>
            {graphStats && (
              <button
                className="memory-action-btn danger"
                onClick={clearAllMemories}
              >
                <IconTrash size={10} />
                clear all
              </button>
            )}
          </div>

          {/* Graph Stats */}
          {graphStats && (
            <>
              <div className="memory-stats">
                <div className="memory-stat">
                  <div className="memory-stat-value">{graphStats.entityCount}</div>
                  <div className="memory-stat-label">entities</div>
                </div>
                <div className="memory-stat">
                  <div className="memory-stat-value">
                    {Object.keys(graphStats.entitiesByType).length}
                  </div>
                  <div className="memory-stat-label">types</div>
                </div>
              </div>

              {/* Entities by Type */}
              <div
                className="memory-type-list"
                ref={listRef}
                tabIndex={0}
                onKeyDown={handleKeyDown}
                onFocus={() => { if (selectedIndex < 0 && navItems.length > 0) setSelectedIndex(0); }}
              >
                {Object.entries(graphStats.entitiesByType).sort(([a], [b]) => a.localeCompare(b)).map(([type, entities]) => (
                  <div key={type}>
                    {/* Type Header */}
                    <div
                      className={`memory-type-header ${isSelected({ type: 'type', typeKey: type }) ? 'memory-nav-selected' : ''}`}
                      onClick={() => toggleTypeExpansion(type)}
                    >
                      <div className="memory-type-info">
                        {expandedTypes.has(type) ? (
                          <IconChevronDown size={12} />
                        ) : (
                          <IconChevronRight size={12} />
                        )}
                        <span className="memory-type-name">{type}</span>
                        <span className="memory-type-count">{entities.length}</span>
                      </div>
                    </div>

                    {/* Entities List */}
                    {expandedTypes.has(type) && (
                      <div className="memory-entity-list">
                        {entities.map(entity => {
                          const mostRecentDate = getEntityMostRecentDate(entity);
                          return (
                            <div key={entity.name}>
                              {/* Entity Item */}
                              <div
                                className={`memory-entity-item ${isSelected({ type: 'entity', typeKey: type, entityName: entity.name }) ? 'memory-nav-selected' : ''}`}
                                onClick={() => toggleEntityExpansion(entity.name)}
                              >
                                <div className="memory-entity-info">
                                  {expandedEntities.has(entity.name) ? (
                                    <IconChevronDown size={10} />
                                  ) : (
                                    <IconChevronRight size={10} />
                                  )}
                                  <span className="memory-entity-name">{entity.name}</span>
                                  <span className="memory-entity-obs-count">
                                    {entity.observations.length}
                                  </span>
                                  {mostRecentDate && (
                                    <span className="memory-entity-date" title={mostRecentDate.toLocaleString()}>
                                      {formatRelativeDate(mostRecentDate)}
                                    </span>
                                  )}
                                </div>
                                <button
                                  className="memory-delete-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteEntity(entity.name);
                                  }}
                                  title="delete"
                                >
                                  <IconTrash size={10} />
                                </button>
                              </div>

                              {/* Observations */}
                              {expandedEntities.has(entity.name) && (
                                <div className="memory-observations">
                                  {entity.observations.map((obs, idx) => {
                                    const { date, content } = parseObservationTimestamp(obs);
                                    return (
                                      <div key={idx} className="memory-observation">
                                        {date && (
                                          <span className="memory-observation-date" title={date.toLocaleString()}>
                                            {formatRelativeDate(date)}
                                          </span>
                                        )}
                                        <span className="memory-observation-content">{content}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default MemoryTab;
