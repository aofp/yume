import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  IconRobot,
  IconPlus,
  IconX,
  IconEdit,
  IconTrash,
  IconCheck,
  IconBrain,
  IconShield,
  IconSearch,
  IconCopy
} from '@tabler/icons-react';
import { useClaudeCodeStore } from '../../stores/claudeCodeStore';
import { TabButton } from '../common/TabButton';
import { ConfirmModal } from '../ConfirmModal/ConfirmModal';
import { PluginBadge } from '../common/PluginBadge';
import { systemPromptService } from '../../services/systemPromptService';
import { pluginService } from '../../services/pluginService';
import './AgentsModal.css';

// Agent structure - simplified
export interface Agent {
  id: string;
  name: string;
  model: 'opus' | 'sonnet' | 'haiku';
  system_prompt: string;
  created_at: number;
  updated_at: number;
  icon?: string;
  pluginId?: string; // Set if agent comes from a plugin
}

interface AgentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAgent?: (agent: Agent) => void;
}


export const AgentsModal: React.FC<AgentsModalProps> = ({ isOpen, onClose, onSelectAgent }) => {
  const { sessions, currentSessionId, selectedModel } = useClaudeCodeStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [createMode, setCreateMode] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [agentScope, setAgentScope] = useState<'yurucode' | 'global' | 'project'>('yurucode');
  const [globalAgents, setGlobalAgents] = useState<Agent[]>([]);
  const [projectAgents, setProjectAgents] = useState<Agent[]>([]);
  const [yurucodeAgents, setYurucodeAgents] = useState<Agent[]>([]);
  const [yurucodePluginEnabled, setYurucodePluginEnabled] = useState(true);

  // Get current session's directory
  const currentSession = sessions.find(s => s.id === currentSessionId);
  const currentDirectory = currentSession?.workingDirectory;
  const projectName = currentDirectory ? currentDirectory.split(/[/\\]/).pop() || currentDirectory : null;

  // Form state for editing/creating
  const [formData, setFormData] = useState<Partial<Agent>>({
    name: '',
    model: 'opus', // Default to latest model
    system_prompt: ''
  });

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isDangerous?: boolean;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  // Derive the current model name from selectedModel
  const currentModelName = useMemo(() => {
    return selectedModel.includes('opus') ? 'opus' : 'sonnet';
  }, [selectedModel]);

  // Load yurucode plugin agents
  useEffect(() => {
    const loadYurucodeAgents = async () => {
      await pluginService.initialize();
      const plugins = await pluginService.listPlugins();
      const yurucodePlugin = plugins.find(p => p.id === 'yurucode');

      if (yurucodePlugin) {
        setYurucodePluginEnabled(yurucodePlugin.enabled);
        // All yurucode agents use the currently selected model
        const agents: Agent[] = yurucodePlugin.components.agents.map(a => ({
          id: `yurucode--${a.name}`,
          name: a.name,
          model: currentModelName as 'opus' | 'sonnet' | 'haiku',
          system_prompt: a.description || '',
          created_at: 0,
          updated_at: 0,
          pluginId: 'yurucode'
        }));
        setYurucodeAgents(agents);
      }
    };

    if (isOpen) {
      loadYurucodeAgents();
    }
  }, [isOpen, currentModelName]);

  // Get current agents based on scope
  const currentAgents = useMemo(() => {
    if (agentScope === 'yurucode') return yurucodeAgents;
    if (agentScope === 'global') {
      // Filter out plugin agents from global tab (including yurucode agents)
      return globalAgents.filter(a => !a.pluginId && !a.name.includes('--') && !a.name.startsWith('yurucode-'));
    }
    return projectAgents;
  }, [agentScope, globalAgents, projectAgents, yurucodeAgents]);

  // Toggle yurucode plugin enabled/disabled
  const handleToggleAgents = useCallback(async () => {
    const newEnabled = !yurucodePluginEnabled;
    try {
      if (newEnabled) {
        await pluginService.enablePlugin('yurucode');
        // Sync agents with the current model
        await pluginService.syncYurucodeAgents(true, currentModelName);
      } else {
        await pluginService.disablePlugin('yurucode');
      }
      setYurucodePluginEnabled(newEnabled);
    } catch (err) {
      console.error('Failed to toggle yurucode plugin:', err);
    }
  }, [yurucodePluginEnabled, currentModelName]);
  
  // Filter agents based on search
  const filteredAgents = useMemo(() => {
    if (!searchQuery) return currentAgents;
    const query = searchQuery.toLowerCase();
    return currentAgents.filter(agent => 
      agent.name.toLowerCase().includes(query) ||
      agent.system_prompt.toLowerCase().includes(query)
    );
  }, [currentAgents, searchQuery]);

  // Reset form when opening create mode
  const handleCreateNew = useCallback(() => {
    setFormData({
      name: '',
      model: 'opus', // Default to latest model
      system_prompt: ''
    });
    setCreateMode(true);
    setEditMode(false);
    setSelectedAgent(null);
  }, []);

  // Start editing an agent
  const handleEdit = useCallback((agent: Agent) => {
    setFormData({
      name: agent.name,
      model: agent.model,
      system_prompt: agent.system_prompt
    });
    setSelectedAgent(agent);
    setEditMode(true);
    setCreateMode(false);
  }, []);

  // Save agent (create or update) - not allowed for plugin agents
  const handleSave = useCallback(async () => {
    if (agentScope === 'yurucode') {
      return; // plugin agents are read-only
    }

    if (!formData.name || !formData.system_prompt) {
      alert('Name and system prompt are required');
      return;
    }

    const agent: Agent = {
      id: selectedAgent?.id || `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: formData.name!,
      model: formData.model || 'opus',
      system_prompt: formData.system_prompt!,
      created_at: selectedAgent?.created_at || Date.now(),
      updated_at: Date.now()
    };

    try {
      // Save to filesystem
      if (agentScope === 'global') {
        await invoke('save_global_agent', { agent });
        const updated = globalAgents.filter(a => a.id !== agent.id);
        updated.push(agent);
        setGlobalAgents(updated);
      } else if (agentScope === 'project' && currentDirectory) {
        await invoke('save_project_agent', { agent, directory: currentDirectory });
        const updated = projectAgents.filter(a => a.id !== agent.id);
        updated.push(agent);
        setProjectAgents(updated);
      }

      console.log('Agent saved:', agent.name);
    } catch (err) {
      console.error('Failed to save agent:', err);
      alert(`Failed to save agent: ${err}`);
      return;
    }

    // Reset state
    setCreateMode(false);
    setEditMode(false);
    setSelectedAgent(null);
    setFormData({
      name: '',
      model: 'opus',
      system_prompt: ''
    });
  }, [formData, selectedAgent, agentScope, currentDirectory, globalAgents, projectAgents]);

  // Delete agent with confirmation - not allowed for plugin agents
  const handleDelete = useCallback((agent: Agent) => {
    if (agent.pluginId || agent.name.includes('--')) {
      return; // plugin agents cannot be deleted
    }

    setConfirmModal({
      isOpen: true,
      title: 'Delete Agent',
      message: `Are you sure you want to delete the agent "${agent.name}"? This action cannot be undone.`,
      isDangerous: true,
      onConfirm: async () => {
        try {
          // Delete from filesystem
          if (agentScope === 'global') {
            await invoke('delete_global_agent', { agentName: agent.name });
            setGlobalAgents(globalAgents.filter(a => a.id !== agent.id));
          } else if (agentScope === 'project' && currentDirectory) {
            await invoke('delete_project_agent', { agentName: agent.name, directory: currentDirectory });
            setProjectAgents(projectAgents.filter(a => a.id !== agent.id));
          }

          if (selectedAgent?.id === agent.id) {
            setSelectedAgent(null);
            setEditMode(false);
          }

          console.log('Agent deleted:', agent.name);
        } catch (err) {
          console.error('Failed to delete agent:', err);
          alert(`Failed to delete agent: ${err}`);
        } finally {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  }, [agentScope, currentDirectory, globalAgents, projectAgents, selectedAgent]);

  // Duplicate an agent
  const handleDuplicate = useCallback(async (agent: Agent) => {
    const duplicatedAgent: Agent = {
      ...agent,
      id: `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: `${agent.name}-copy`,
      created_at: Date.now(),
      updated_at: Date.now()
    };
    
    try {
      // Save to filesystem
      if (agentScope === 'global') {
        await invoke('save_global_agent', { agent: duplicatedAgent });
        setGlobalAgents([...globalAgents, duplicatedAgent]);
      } else if (currentDirectory) {
        await invoke('save_project_agent', { agent: duplicatedAgent, directory: currentDirectory });
        setProjectAgents([...projectAgents, duplicatedAgent]);
      }
      
      console.log('Agent duplicated:', duplicatedAgent.name);
    } catch (err) {
      console.error('Failed to duplicate agent:', err);
      alert(`Failed to duplicate agent: ${err}`);
    }
  }, [agentScope, currentDirectory, globalAgents, projectAgents]);

  // Cancel editing / Go back to list
  const handleCancel = useCallback(() => {
    setCreateMode(false);
    setEditMode(false);
    setSelectedAgent(null);
    setFormData({
      name: '',
      model: 'opus',
      system_prompt: ''
    });
  }, []);

  // Load Claude agents when modal opens or directory changes
  useEffect(() => {
    if (isOpen) {
      // Load global agents
      invoke<Agent[]>('load_claude_agents')
        .then(agents => {
          console.log('Loaded global agents:', agents);
          setGlobalAgents(agents || []);
        })
        .catch(err => {
          console.error('Failed to load global agents:', err);
          setGlobalAgents([]);
        });
      
      // Load project agents if a project is open
      if (currentDirectory) {
        console.log('Loading project agents from:', currentDirectory);
        invoke<Agent[]>('load_project_agents', { directory: currentDirectory })
          .then(agents => {
            console.log('Loaded project agents:', agents);
            setProjectAgents(agents || []);
            // If project agents exist and we're on global, switch to project
            if (agents && agents.length > 0 && agentScope === 'global') {
              setAgentScope('project');
            }
          })
          .catch(err => {
            console.error('Failed to load project agents:', err);
            setProjectAgents([]);
          });
      } else {
        setProjectAgents([]);
        // Switch to global if no project is open
        if (agentScope === 'project') {
          setAgentScope('global');
        }
      }
    }
  }, [isOpen, currentDirectory]);  // Reload when directory changes

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isSearchFocused = document.activeElement === searchInputRef.current;
      const isEditing = editMode || createMode;

      if (e.key === 'Escape') {
        if (isSearchFocused) {
          setShowSearch(false);
          setSearchQuery('');
        } else if (isEditing) {
          handleCancel();
        } else {
          onClose();
        }
      }

      // Ctrl+F to show/focus search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setShowSearch(true);
        setTimeout(() => searchInputRef.current?.focus(), 10);
      }

      // Ctrl+N for new agent
      if ((e.ctrlKey || e.metaKey) && e.key === 'n' && !isEditing) {
        e.preventDefault();
        handleCreateNew();
      }

      // Arrow navigation (when not editing and search not focused)
      if (!isSearchFocused && !isEditing) {
        const maxIndex = filteredAgents.length - 1;

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setFocusedIndex(prev => prev < maxIndex ? prev + 1 : 0);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setFocusedIndex(prev => prev > 0 ? prev - 1 : maxIndex);
        } else if (e.key === 'Enter' && focusedIndex >= 0 && focusedIndex <= maxIndex) {
          e.preventDefault();
          const agent = filteredAgents[focusedIndex];
          if (agent) {
            if (onSelectAgent) {
              onSelectAgent(agent);
              onClose();
            } else {
              handleEdit(agent);
            }
          }
        } else if (e.key === 'Delete' && focusedIndex >= 0 && focusedIndex <= maxIndex) {
          e.preventDefault();
          const agent = filteredAgents[focusedIndex];
          if (agent) {
            handleDelete(agent);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, editMode, createMode, filteredAgents, focusedIndex, onClose, onSelectAgent, handleCreateNew, handleEdit, handleDelete, handleCancel]);

  if (!isOpen) return null;

  return (
    <>
      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText="Delete"
        cancelText="Cancel"
        isDangerous={confirmModal.isDangerous}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />
      
      <div className="agents-modal-overlay" onClick={onClose}>
        <div className="agents-modal" onClick={e => e.stopPropagation()}>
        <div className="agents-header" data-tauri-drag-region onContextMenu={(e) => e.preventDefault()}>
          <div className="agents-header-left" data-tauri-drag-region>
            <div className="agents-title" data-tauri-drag-region>
              <IconRobot size={16} />
              <span>agents</span>
            </div>
            {!editMode && !createMode && (
              <div className="header-tabs">
                <TabButton
                  label="yurucode"
                  active={agentScope === 'yurucode'}
                  onClick={() => setAgentScope('yurucode')}
                  count={yurucodeAgents.length}
                />
                <TabButton
                  label="global"
                  active={agentScope === 'global'}
                  onClick={() => setAgentScope('global')}
                  count={globalAgents.filter(a => !a.pluginId && !a.name.includes('--') && !a.name.startsWith('yurucode-')).length}
                />
                <TabButton
                  label="project"
                  active={agentScope === 'project'}
                  onClick={() => setAgentScope('project')}
                  disabled={!currentDirectory}
                  count={projectAgents.length}
                />
              </div>
            )}
          </div>
          <div className="agents-header-actions">
            <button className="agents-close" onClick={onClose} title="close (esc)">
              <IconX size={16} />
            </button>
          </div>
        </div>

        {showSearch && !editMode && !createMode && (
          <div className="agents-search">
            <IconSearch size={14} />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="search agents..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              autoFocus
            />
          </div>
        )}

        <div className="agents-content">
          {!editMode && !createMode ? (
            <>
              {/* Yurucode agents tab - from plugin, with enable/disable toggle */}
              {agentScope === 'yurucode' && (
                <>
                  <div className="yurucode-toggle">
                    <span className="toggle-label">yurucode agents</span>
                    <input
                      type="checkbox"
                      id="yurucode-agents-toggle"
                      className="checkbox-input"
                      checked={yurucodePluginEnabled}
                      onChange={handleToggleAgents}
                    />
                    <label htmlFor="yurucode-agents-toggle" className={`toggle-switch compact ${yurucodePluginEnabled ? 'active' : ''}`}>
                      <span className="toggle-switch-slider" />
                      <span className="toggle-switch-label off">OFF</span>
                      <span className="toggle-switch-label on">ON</span>
                    </label>
                    <span className="yurucode-model-info">using: {currentModelName}</span>
                  </div>
                  {yurucodeAgents.length === 0 ? (
                    <div className="agents-empty">loading plugin agents...</div>
                  ) : (
                    <div className={`agents-list ${!yurucodePluginEnabled ? 'agents-disabled' : ''}`}>
                      {yurucodeAgents.map((agent, index) => (
                        <div
                          key={agent.id}
                          className={`agent-item yurucode-agent ${focusedIndex === index ? 'focused' : ''}`}
                          onMouseEnter={() => setFocusedIndex(index)}
                        >
                          <div className="agent-info">
                            <div className="agent-name-row">
                              <div className="agent-name">{agent.name}</div>
                              <span className="agent-model">{agent.model}</span>
                            </div>
                          </div>
                          <div className="agent-prompt-preview">{agent.system_prompt}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Global and Project tabs - editable agents */}
              {agentScope !== 'yurucode' && (
                <>
                  {filteredAgents.length === 0 ? (
                    <div className="agents-empty">
                      {searchQuery ? 'no agents match your search' : (
                        <div
                          className="agent-item add-agent-item"
                          onClick={handleCreateNew}
                          style={{ cursor: 'pointer' }}
                        >
                          <div className="agent-info">
                            <IconPlus size={14} style={{ marginRight: 8 }} />
                            <div className="agent-name">add agent</div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="agents-list">
                      {filteredAgents.map((agent, index) => {
                        const isPluginAgent = agent.pluginId || agent.name.includes('--');
                        return (
                          <div
                            key={agent.id}
                            className={`agent-item ${focusedIndex === index ? 'focused' : ''} ${selectedAgent?.id === agent.id ? 'selected' : ''} ${isPluginAgent ? 'plugin-agent' : ''}`}
                            onClick={() => !isPluginAgent && handleEdit(agent)}
                            onMouseEnter={() => setFocusedIndex(index)}
                          >
                            <div className="agent-info">
                              <div className="agent-name-row">
                                <div className="agent-name">{agent.name.includes('--') ? agent.name.split('--')[1] : agent.name}</div>
                                {isPluginAgent && (
                                  <PluginBadge pluginName={agent.pluginId || agent.name.split('--')[0]} size="small" />
                                )}
                              </div>
                              <div className="agent-model">{agent.model}</div>
                            </div>
                            {!isPluginAgent && (
                              <div className="agent-actions">
                                <button
                                  className="agent-action"
                                  onClick={(e) => { e.stopPropagation(); handleEdit(agent); }}
                                  title="edit"
                                >
                                  <IconEdit size={14} />
                                </button>
                                <button
                                  className="agent-action"
                                  onClick={(e) => { e.stopPropagation(); handleDuplicate(agent); }}
                                  title="duplicate"
                                >
                                  <IconCopy size={14} />
                                </button>
                                <button
                                  className="agent-action agent-delete"
                                  onClick={(e) => { e.stopPropagation(); handleDelete(agent); }}
                                  title="delete"
                                >
                                  <IconTrash size={14} />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <div
                        className="agent-item add-agent-item"
                        onClick={handleCreateNew}
                        onMouseEnter={() => setFocusedIndex(filteredAgents.length)}
                      >
                        <div className="agent-info">
                          <IconPlus size={14} style={{ marginRight: 8 }} />
                          <div className="agent-name">add agent</div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <div className="agent-editor">
              <div className="editor-header">
                <button className="btn-back" onClick={handleCancel} title="back to list">
                  ← back
                </button>
                <div className="editor-title">
                  {createMode ? 'new agent' : 'edit agent'}
                </div>
              </div>
              
              <div className="editor-form">
                <div className="form-row">
                  <div className="form-group" style={{flex: 1}}>
                    <label>name</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={e => setFormData({...formData, name: e.target.value})}
                      placeholder="agent name"
                      autoFocus
                    />
                  </div>

                  <div className="form-group">
                    <label>model</label>
                    <div className="model-selector">
                      <select
                        value={formData.model}
                        onChange={e => setFormData({...formData, model: e.target.value as 'opus' | 'sonnet' | 'haiku'})}
                        className="agent-model-select"
                      >
                        <option value="opus">opus (latest)</option>
                        <option value="sonnet">sonnet</option>
                        <option value="haiku">haiku</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label>system prompt</label>
                  <textarea
                    value={formData.system_prompt}
                    onChange={e => setFormData({...formData, system_prompt: e.target.value})}
                    placeholder="Enter the system prompt for this agent..."
                    rows={8}
                  />
                </div>

                <div className="editor-actions">
                  <button className="btn-cancel" onClick={handleCancel}>
                    <IconX size={14} />
                    cancel
                  </button>
                  <button className="btn-save" onClick={handleSave}>
                    <IconCheck size={14} />
                    {createMode ? 'create' : 'save'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  );
};