// PluginsTab - Plugin management UI for settings modal
// Follows the pattern of HooksTab and MCPTab

import React, { useState, useEffect, useCallback } from 'react';
import {
  IconPuzzle,
  IconChevronDown,
  IconChevronRight,
  IconCommand,
  IconWebhook,
  IconRobot,
  IconBolt,
  IconDatabase,
  IconTrash,
  IconFolderOpen,
  IconAlertCircle,
  IconCheck,
  IconLoader2,
  IconRefresh
} from '@tabler/icons-react';
import { ConfirmModal } from '../ConfirmModal/ConfirmModal';
import { pluginService } from '../../services/pluginService';
import { InstalledPlugin } from '../../types/plugin';
import './PluginsTab.css';

interface PluginsTabProps {
  onPluginChange?: (plugins: InstalledPlugin[]) => void;
}

export const PluginsTab: React.FC<PluginsTabProps> = ({ onPluginChange }) => {
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPlugins, setExpandedPlugins] = useState<Set<string>>(new Set());
  const [notification, setNotification] = useState<{
    message: string;
    type: 'error' | 'success' | 'info';
  } | null>(null);
  const [togglingPlugins, setTogglingPlugins] = useState<Set<string>>(new Set());

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isDangerous?: boolean;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  // Load plugins on mount
  useEffect(() => {
    loadPlugins();
  }, []);

  // Clear notification after delay
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const loadPlugins = async () => {
    try {
      setLoading(true);
      await pluginService.initialize();
      const pluginList = await pluginService.listPlugins();
      setPlugins(pluginList);
      onPluginChange?.(pluginList);
    } catch (error) {
      console.error('Failed to load plugins:', error);
      showNotification('failed to load plugins', 'error');
    } finally {
      setLoading(false);
    }
  };

  const showNotification = (message: string, type: 'error' | 'success' | 'info') => {
    setNotification({ message, type });
  };

  const togglePlugin = async (pluginId: string, enabled: boolean) => {
    setTogglingPlugins(prev => new Set(prev).add(pluginId));

    try {
      if (enabled) {
        await pluginService.enablePlugin(pluginId);
      } else {
        await pluginService.disablePlugin(pluginId);
      }

      setPlugins(prev => prev.map(p =>
        p.id === pluginId ? { ...p, enabled } : p
      ));

      showNotification(
        `plugin ${enabled ? 'enabled' : 'disabled'}`,
        'success'
      );

      onPluginChange?.(plugins.map(p =>
        p.id === pluginId ? { ...p, enabled } : p
      ));
    } catch (error) {
      console.error('Failed to toggle plugin:', error);
      showNotification('failed to update plugin', 'error');
    } finally {
      setTogglingPlugins(prev => {
        const next = new Set(prev);
        next.delete(pluginId);
        return next;
      });
    }
  };

  const toggleExpanded = (pluginId: string) => {
    setExpandedPlugins(prev => {
      const next = new Set(prev);
      if (next.has(pluginId)) {
        next.delete(pluginId);
      } else {
        next.add(pluginId);
      }
      return next;
    });
  };

  const removePlugin = (plugin: InstalledPlugin) => {
    setConfirmModal({
      isOpen: true,
      title: 'remove plugin',
      message: `remove "${plugin.manifest.name}"? this will remove all its commands, hooks, agents, and mcp servers.`,
      isDangerous: true,
      onConfirm: async () => {
        try {
          await pluginService.uninstallPlugin(plugin.id);
          setPlugins(prev => prev.filter(p => p.id !== plugin.id));
          showNotification(`plugin "${plugin.manifest.name}" removed`, 'success');
          onPluginChange?.(plugins.filter(p => p.id !== plugin.id));
        } catch (error) {
          console.error('Failed to remove plugin:', error);
          showNotification('failed to remove plugin', 'error');
        } finally {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const installFromFolder = async () => {
    try {
      const plugin = await pluginService.installPluginFromDialog();
      if (plugin) {
        setPlugins(prev => [...prev, plugin]);
        showNotification(`installed "${plugin.manifest.name}"`, 'success');
        onPluginChange?.([...plugins, plugin]);
      }
    } catch (error) {
      console.error('Failed to install plugin:', error);
      showNotification(
        error instanceof Error ? error.message : 'failed to install plugin',
        'error'
      );
    }
  };

  const refreshPlugins = async () => {
    try {
      setLoading(true);
      const pluginList = await pluginService.refresh();
      setPlugins(pluginList);
      showNotification('plugins refreshed', 'success');
      onPluginChange?.(pluginList);
    } catch (error) {
      showNotification('failed to refresh', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Component count helpers
  const getComponentCounts = (plugin: InstalledPlugin) => {
    return {
      commands: plugin.components.commands.length,
      hooks: plugin.components.hooks.length,
      agents: plugin.components.agents.length,
      skills: plugin.components.skills.length,
      mcp: plugin.components.mcp?.servers ? Object.keys(plugin.components.mcp.servers).length : 0
    };
  };

  // Component icons
  const componentIcons: Record<string, React.ReactNode> = {
    commands: <IconCommand size={10} />,
    hooks: <IconWebhook size={10} />,
    agents: <IconRobot size={10} />,
    skills: <IconBolt size={10} />,
    mcp: <IconDatabase size={10} />
  };

  if (loading) {
    return (
      <div className="plugins-loading">
        <IconLoader2 size={16} className="spin" />
        <span>loading plugins...</span>
      </div>
    );
  }

  return (
    <div className="plugins-tab">
      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText="remove"
        cancelText="cancel"
        isDangerous={confirmModal.isDangerous}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />

      {/* Notification */}
      {notification && (
        <div className={`plugins-notification ${notification.type}`}>
          {notification.type === 'error' && <IconAlertCircle size={12} />}
          {notification.type === 'success' && <IconCheck size={12} />}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="plugins-header">
        <h4>plugins</h4>
        <div className="plugins-actions">
          <button
            className="plugins-action-btn"
            onClick={refreshPlugins}
            title="refresh"
          >
            <IconRefresh size={10} />
          </button>
          <button
            className="plugins-action-btn"
            onClick={installFromFolder}
          >
            <IconFolderOpen size={10} />
            install from folder
          </button>
        </div>
      </div>

      {/* Plugin List */}
      <div className="plugins-list">
        {plugins.length === 0 ? (
          <div className="no-plugins">
            <IconPuzzle size={16} />
            <span>no plugins installed</span>
            <p className="no-plugins-hint">
              install plugins from the claude code plugins repository
            </p>
          </div>
        ) : (
          plugins.map(plugin => {
            const counts = getComponentCounts(plugin);
            const isToggling = togglingPlugins.has(plugin.id);

            return (
              <div key={plugin.id} className={`plugin-item ${plugin.enabled ? 'enabled' : ''}`}>
                {/* Plugin Header Row */}
                <div className="plugin-header">
                  <button
                    className="plugin-expand"
                    onClick={() => toggleExpanded(plugin.id)}
                  >
                    {expandedPlugins.has(plugin.id)
                      ? <IconChevronDown size={12} />
                      : <IconChevronRight size={12} />
                    }
                  </button>

                  <div className="plugin-info">
                    <div className="plugin-name-row">
                      <span className="plugin-name">{plugin.manifest.name}</span>
                      <span className="plugin-version">v{plugin.manifest.version}</span>
                    </div>
                    <div className="plugin-description">{plugin.manifest.description}</div>
                  </div>

                  {/* Component counts as small badges */}
                  <div className="plugin-components">
                    {Object.entries(counts).map(([type, count]) => (
                      count > 0 && (
                        <span key={type} className="component-count" title={type}>
                          {componentIcons[type]}
                          {count}
                        </span>
                      )
                    ))}
                  </div>

                  {/* Toggle + Remove */}
                  <div className="plugin-actions">
                    <div
                      className={`toggle-switch compact ${plugin.enabled ? 'active' : ''} ${isToggling ? 'loading' : ''}`}
                      onClick={() => !isToggling && togglePlugin(plugin.id, !plugin.enabled)}
                    >
                      <span className="toggle-switch-label off">off</span>
                      <span className="toggle-switch-label on">on</span>
                      <div className="toggle-switch-slider" />
                    </div>
                    <button
                      className="plugin-remove"
                      onClick={() => removePlugin(plugin)}
                      title="remove plugin"
                    >
                      <IconTrash size={12} />
                    </button>
                  </div>
                </div>

                {/* Expanded Content - Component Details */}
                {expandedPlugins.has(plugin.id) && (
                  <div className="plugin-details">
                    {plugin.components.commands.length > 0 && (
                      <div className="plugin-detail-section">
                        <span className="detail-label">
                          <IconCommand size={10} /> commands
                        </span>
                        <div className="detail-items">
                          {plugin.components.commands.map(cmd => (
                            <span key={cmd.name} className="detail-item">/{cmd.name}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {plugin.components.hooks.length > 0 && (
                      <div className="plugin-detail-section">
                        <span className="detail-label">
                          <IconWebhook size={10} /> hooks
                        </span>
                        <div className="detail-items">
                          {plugin.components.hooks.map(hook => (
                            <span key={hook.name} className="detail-item">{hook.name}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {plugin.components.agents.length > 0 && (
                      <div className="plugin-detail-section">
                        <span className="detail-label">
                          <IconRobot size={10} /> agents
                        </span>
                        <div className="detail-items">
                          {plugin.components.agents.map(agent => (
                            <span key={agent.name} className="detail-item">{agent.name}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {plugin.components.skills.length > 0 && (
                      <div className="plugin-detail-section">
                        <span className="detail-label">
                          <IconBolt size={10} /> skills
                        </span>
                        <div className="detail-items">
                          {plugin.components.skills.map(skill => (
                            <span key={skill.name} className="detail-item">{skill.name}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {plugin.components.mcp?.servers && Object.keys(plugin.components.mcp.servers).length > 0 && (
                      <div className="plugin-detail-section">
                        <span className="detail-label">
                          <IconDatabase size={10} /> mcp servers
                        </span>
                        <div className="detail-items">
                          {Object.keys(plugin.components.mcp.servers).map(name => (
                            <span key={name} className="detail-item">{name}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {plugin.manifest.author && (
                      <div className="plugin-author">
                        by {plugin.manifest.author.name}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default PluginsTab;
