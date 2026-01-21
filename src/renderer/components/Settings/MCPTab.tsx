import React, { useState, useEffect } from 'react';
import { ConfirmModal } from '../ConfirmModal/ConfirmModal';
import { PluginBadge } from '../Common/PluginBadge';
import {
  IconPlus, IconTrash, IconRefresh,
  IconAlertCircle, IconCheck, IconLoader2,
  IconTerminal, IconWorld, IconFolder, IconUser,
  IconBrain
} from '@tabler/icons-react';
import { mcpService, MCPServer } from '../../services/mcpService';
import { useClaudeCodeStore } from '../../stores/claudeCodeStore';
import './MCPTab.css';

interface MCPTabProps {
  // Optional props can be added here
}

export const MCPTab: React.FC<MCPTabProps> = () => {
  const { memoryEnabled, memoryServerRunning } = useClaudeCodeStore();
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [transport, setTransport] = useState<'stdio' | 'sse'>('stdio');
  const [testingServer, setTestingServer] = useState<string | null>(null);
  const [removingServer, setRemovingServer] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);
  
  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isDangerous?: boolean;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });
  
  // Form state for new server
  const [formData, setFormData] = useState({
    name: '',
    command: '',
    args: '',
    url: '',
    scope: 'local' as 'local' | 'project' | 'user',
    envVars: [] as { key: string; value: string }[]
  });

  useEffect(() => {
    loadServers();
  }, []);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const showNotification = (message: string, type: 'error' | 'success' | 'info' = 'info') => {
    setNotification({ message, type });
  };

  const loadServers = async () => {
    try {
      setLoading(true);
      const serverList = await mcpService.listServers();
      setServers(serverList);
    } catch (error) {
      console.error('Failed to load MCP servers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddServer = async () => {
    const { name, command, args, url, scope, envVars } = formData;
    
    if (!name.trim()) {
      showNotification('Server name is required', 'error');
      return;
    }
    
    if (transport === 'stdio' && !command.trim()) {
      showNotification('Command is required for stdio transport', 'error');
      return;
    }
    
    if (transport === 'sse' && !url.trim()) {
      showNotification('URL is required for SSE transport', 'error');
      return;
    }
    
    try {
      const env = envVars.reduce((acc, { key, value }) => {
        if (key.trim() && value.trim()) {
          acc[key] = value;
        }
        return acc;
      }, {} as Record<string, string>);
      
      const server: MCPServer = {
        name,
        transport,
        scope,
        env,
        ...(transport === 'stdio' 
          ? { command, args: args.trim() ? args.split(/\s+/) : [] }
          : { url }
        )
      };
      
      await mcpService.addServer(server);
      await loadServers();
      showNotification('Server added successfully', 'success');
      
      // Reset form
      setFormData({
        name: '',
        command: '',
        args: '',
        url: '',
        scope: 'local',
        envVars: []
      });
      setShowAddForm(false);
    } catch (error) {
      console.error('Failed to add server:', error);
      showNotification('Failed to add server', 'error');
    }
  };

  const handleRemoveServer = (name: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Remove MCP Server',
      message: `Are you sure you want to remove the MCP server "${name}"?`,
      isDangerous: true,
      onConfirm: async () => {
        try {
          setRemovingServer(name);
          await mcpService.removeServer(name);
          await loadServers();
          showNotification(`Server "${name}" removed`, 'success');
        } catch (error) {
          console.error('Failed to remove server:', error);
          showNotification('Failed to remove server', 'error');
        } finally {
          setRemovingServer(null);
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const handleTestConnection = async (name: string) => {
    try {
      setTestingServer(name);
      const result = await mcpService.testConnection(name);
      showNotification(result ? 'Connection successful' : 'Connection failed', result ? 'success' : 'error');
    } catch (error) {
      console.error('Failed to test connection:', error);
      showNotification('Connection test failed', 'error');
    } finally {
      setTestingServer(null);
    }
  };


  const addEnvVar = () => {
    setFormData(prev => ({
      ...prev,
      envVars: [...prev.envVars, { key: '', value: '' }]
    }));
  };

  const updateEnvVar = (index: number, field: 'key' | 'value', value: string) => {
    setFormData(prev => ({
      ...prev,
      envVars: prev.envVars.map((v, i) => 
        i === index ? { ...v, [field]: value } : v
      )
    }));
  };

  const removeEnvVar = (index: number) => {
    setFormData(prev => ({
      ...prev,
      envVars: prev.envVars.filter((_, i) => i !== index)
    }));
  };

  const getScopeIcon = (scope: string) => {
    switch (scope) {
      case 'local':
        return <IconUser size={10} />;
      case 'project':
        return <IconFolder size={10} />;
      case 'user':
        return <IconWorld size={10} />;
      default:
        return null;
    }
  };

  const getTransportIcon = (transport: string) => {
    return transport === 'stdio' 
      ? <IconTerminal size={10} />
      : <IconWorld size={10} />;
  };

  // Group servers by scope
  const serversByScope = servers.reduce((acc, server) => {
    const scope = server.scope || 'local';
    if (!acc[scope]) acc[scope] = [];
    acc[scope].push(server);
    return acc;
  }, {} as Record<string, MCPServer[]>);

  if (loading) {
    return (
      <div className="mcp-loading">
        <IconLoader2 size={16} className="spin" />
        <span>loading servers...</span>
      </div>
    );
  }

  return (
    <div className="mcp-tab">
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
        <div className={`mcp-notification ${notification.type}`}>
          {notification.type === 'error' && <IconAlertCircle size={12} />}
          {notification.type === 'success' && <IconCheck size={12} />}
          <span>{notification.message}</span>
        </div>
      )}
      {/* Header with actions */}
      <div className="mcp-header">
        <h4>mcp servers</h4>
        <div className="mcp-actions">
          {!showAddForm && (
            <>
              <button 
                className="mcp-action-btn"
                onClick={() => setShowAddForm(true)}
              >
                <IconPlus size={10} />
                add server
              </button>
            </>
          )}
        </div>
      </div>

      {/* Add server form */}
      {showAddForm && (
        <div className="mcp-add-form">
          <div className="form-tabs">
            <button 
              className={`form-tab ${transport === 'stdio' ? 'active' : ''}`}
              onClick={() => setTransport('stdio')}
            >
              <IconTerminal size={10} />
              stdio
            </button>
            <button 
              className={`form-tab ${transport === 'sse' ? 'active' : ''}`}
              onClick={() => setTransport('sse')}
            >
              <IconWorld size={10} />
              sse
            </button>
          </div>

          <div className="form-fields">
            <div className="form-field">
              <label>name</label>
              <input 
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="server name"
              />
            </div>

            {transport === 'stdio' ? (
              <>
                <div className="form-field">
                  <label>command</label>
                  <input 
                    type="text"
                    value={formData.command}
                    onChange={(e) => setFormData({ ...formData, command: e.target.value })}
                    placeholder="npx @modelcontextprotocol/server-filesystem"
                  />
                </div>
                <div className="form-field">
                  <label>arguments</label>
                  <input 
                    type="text"
                    value={formData.args}
                    onChange={(e) => setFormData({ ...formData, args: e.target.value })}
                    placeholder="--path /home/user (optional)"
                  />
                </div>
              </>
            ) : (
              <div className="form-field">
                <label>url</label>
                <input 
                  type="text"
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  placeholder="https://api.example.com/mcp"
                />
              </div>
            )}

            <div className="form-field">
              <label>scope</label>
              <div className="scope-selector">
                {(['local', 'project', 'user'] as const).map(s => (
                  <button
                    key={s}
                    className={`scope-btn ${formData.scope === s ? 'active' : ''}`}
                    onClick={() => setFormData({ ...formData, scope: s })}
                  >
                    {getScopeIcon(s)}
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Environment variables */}
            <div className="form-field">
              <label>
                environment variables
                <button className="add-env-btn" onClick={addEnvVar}>
                  <IconPlus size={10} />
                </button>
              </label>
              {formData.envVars.map((env, index) => (
                <div key={index} className="env-var-row">
                  <input 
                    type="text"
                    value={env.key}
                    onChange={(e) => updateEnvVar(index, 'key', e.target.value)}
                    placeholder="KEY"
                    className="env-key"
                  />
                  <input 
                    type="text"
                    value={env.value}
                    onChange={(e) => updateEnvVar(index, 'value', e.target.value)}
                    placeholder="value"
                    className="env-value"
                  />
                  <button 
                    className="remove-env-btn"
                    onClick={() => removeEnvVar(index)}
                  >
                    <IconTrash size={10} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="form-actions">
            <button 
              className="form-btn save"
              onClick={handleAddServer}
            >
              <IconCheck size={10} />
              save
            </button>
            <button 
              className="form-btn cancel"
              onClick={() => {
                setShowAddForm(false);
                setFormData({
                  name: '',
                  command: '',
                  args: '',
                  url: '',
                  scope: 'local',
                  envVars: []
                });
              }}
            >
              cancel
            </button>
          </div>
        </div>
      )}

      {/* Built-in Memory Server */}
      {!showAddForm && (
        <div className="mcp-builtin">
          <div className="server-group">
            <h5 className="group-title">
              <IconBrain size={10} />
              built-in
            </h5>
            <div className={`server-item memory-server ${memoryEnabled ? 'enabled' : ''}`}>
              <div className="server-info">
                <div className="server-name">
                  <IconBrain size={10} />
                  memory
                  <span className={`server-status ${memoryServerRunning ? 'running' : 'stopped'}`}>
                    {memoryServerRunning ? 'running' : 'stopped'}
                  </span>
                </div>
                <div className="server-details">
                  persistent knowledge graph in ~/.yume/memory.jsonl
                </div>
              </div>
              <div className="server-actions">
                <div
                  className={`toggle-switch compact ${memoryEnabled ? 'active' : ''} disabled`}
                  title="toggle in settings → general → memory"
                >
                  <span className="toggle-switch-label off">off</span>
                  <span className="toggle-switch-label on">on</span>
                  <div className="toggle-switch-slider" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Server list */}
      {!showAddForm && (
        <div className="mcp-servers">
          {Object.keys(serversByScope).length === 0 ? (
            <div className="no-servers">
              <IconAlertCircle size={16} />
              <span>no other mcp servers configured</span>
            </div>
          ) : (
            Object.entries(serversByScope).map(([scope, scopeServers]) => (
              <div key={scope} className="server-group">
                <h5 className="group-title">
                  {getScopeIcon(scope)}
                  {scope}
                </h5>
                {scopeServers.map(server => {
                  const isPluginServer = server.name.includes('--');
                  const pluginName = isPluginServer ? server.name.split('--')[0] : null;
                  const displayName = isPluginServer ? server.name.split('--')[1] : server.name;
                  return (
                  <div key={server.name} className="server-item">
                    <div className="server-info">
                      <div className="server-name">
                        {getTransportIcon(server.transport)}
                        {displayName}
                        {pluginName && (
                          <PluginBadge pluginName={pluginName} size="small" />
                        )}
                      </div>
                      <div className="server-details">
                        {server.transport === 'stdio' 
                          ? `command: ${server.command}`
                          : `url: ${server.url}`}
                      </div>
                    </div>
                    <div className="server-actions">
                      <button 
                        className="server-action-btn"
                        onClick={() => handleTestConnection(server.name)}
                        disabled={testingServer === server.name}
                      >
                        {testingServer === server.name ? (
                          <IconLoader2 size={10} className="spin" />
                        ) : (
                          <IconRefresh size={10} />
                        )}
                        test
                      </button>
                      <button 
                        className="server-action-btn remove"
                        onClick={() => handleRemoveServer(server.name)}
                        disabled={removingServer === server.name}
                      >
                        {removingServer === server.name ? (
                          <IconLoader2 size={10} className="spin" />
                        ) : (
                          <IconTrash size={10} />
                        )}
                        remove
                      </button>
                    </div>
                  </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};