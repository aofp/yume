import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { 
  IconRobot, 
  IconPlus, 
  IconX, 
  IconEdit, 
  IconTrash, 
  IconCheck,
  IconBrain,
  IconShield,
  IconGitCommit,
  IconCode,
  IconBug,
  IconWand,
  IconRocket,
  IconSearch,
  IconCopy
} from '@tabler/icons-react';
import { useClaudeCodeStore } from '../../stores/claudeCodeStore';
import './AgentsModal.css';

// Agent structure based on claudia format
export interface Agent {
  id: string;
  name: string;
  icon: string;
  model: 'opus' | 'sonnet' | 'haiku';
  default_task: string;
  system_prompt: string;
  created_at: number;
  updated_at: number;
}

interface AgentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAgent?: (agent: Agent) => void;
}

// Icon mapping for agent icons
const iconMap: Record<string, React.ReactNode> = {
  'bot': <IconRobot size={16} />,
  'shield': <IconShield size={16} />,
  'git': <IconGitCommit size={16} />,
  'code': <IconCode size={16} />,
  'bug': <IconBug size={16} />,
  'wand': <IconWand size={16} />,
  'brain': <IconBrain size={16} />,
  'rocket': <IconRocket size={16} />,
};

const getAgentIcon = (iconName: string) => {
  return iconMap[iconName] || <IconRobot size={16} />;
};

export const AgentsModal: React.FC<AgentsModalProps> = ({ isOpen, onClose, onSelectAgent }) => {
  const { agents, addAgent, updateAgent, deleteAgent } = useClaudeCodeStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [createMode, setCreateMode] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [showSearch, setShowSearch] = useState(false);
  
  // Form state for editing/creating
  const [formData, setFormData] = useState<Partial<Agent>>({
    name: '',
    icon: 'bot',
    model: 'sonnet',
    default_task: '',
    system_prompt: ''
  });

  // Filter agents based on search
  const filteredAgents = useMemo(() => {
    if (!searchQuery) return agents;
    const query = searchQuery.toLowerCase();
    return agents.filter(agent => 
      agent.name.toLowerCase().includes(query) ||
      agent.default_task.toLowerCase().includes(query) ||
      agent.system_prompt.toLowerCase().includes(query)
    );
  }, [agents, searchQuery]);

  // Reset form when opening create mode
  const handleCreateNew = useCallback(() => {
    setFormData({
      name: '',
      icon: 'bot',
      model: 'sonnet',
      default_task: '',
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
      icon: agent.icon,
      model: agent.model,
      default_task: agent.default_task,
      system_prompt: agent.system_prompt
    });
    setSelectedAgent(agent);
    setEditMode(true);
    setCreateMode(false);
  }, []);

  // Save agent (create or update)
  const handleSave = useCallback(() => {
    if (!formData.name || !formData.system_prompt) {
      alert('Name and system prompt are required');
      return;
    }

    if (createMode) {
      // Create new agent
      const newAgent: Agent = {
        id: `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: formData.name!,
        icon: formData.icon || 'bot',
        model: formData.model || 'sonnet',
        default_task: formData.default_task || '',
        system_prompt: formData.system_prompt!,
        created_at: Date.now(),
        updated_at: Date.now()
      };
      addAgent(newAgent);
    } else if (editMode && selectedAgent) {
      // Update existing agent
      const updatedAgent: Agent = {
        ...selectedAgent,
        name: formData.name!,
        icon: formData.icon || 'bot',
        model: formData.model || 'sonnet',
        default_task: formData.default_task || '',
        system_prompt: formData.system_prompt!,
        updated_at: Date.now()
      };
      updateAgent(updatedAgent);
    }

    // Reset state
    setCreateMode(false);
    setEditMode(false);
    setSelectedAgent(null);
    setFormData({
      name: '',
      icon: 'bot',
      model: 'sonnet',
      default_task: '',
      system_prompt: ''
    });
  }, [formData, createMode, editMode, selectedAgent, addAgent, updateAgent]);

  // Delete agent with confirmation
  const handleDelete = useCallback((agent: Agent) => {
    if (confirm(`Delete agent "${agent.name}"? This cannot be undone.`)) {
      deleteAgent(agent.id);
      if (selectedAgent?.id === agent.id) {
        setSelectedAgent(null);
        setEditMode(false);
      }
    }
  }, [deleteAgent, selectedAgent]);

  // Duplicate an agent
  const handleDuplicate = useCallback((agent: Agent) => {
    const duplicatedAgent: Agent = {
      ...agent,
      id: `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: `${agent.name} (copy)`,
      created_at: Date.now(),
      updated_at: Date.now()
    };
    addAgent(duplicatedAgent);
  }, [addAgent]);

  // Cancel editing
  const handleCancel = useCallback(() => {
    setCreateMode(false);
    setEditMode(false);
    setSelectedAgent(null);
    setFormData({
      name: '',
      icon: 'bot',
      model: 'sonnet',
      default_task: '',
      system_prompt: ''
    });
  }, []);

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
    <div className="agents-modal-overlay" onClick={onClose}>
      <div className="agents-modal" onClick={e => e.stopPropagation()}>
        <div className="agents-header" data-tauri-drag-region>
          <div className="agents-title" data-tauri-drag-region>
            <IconBrain size={16} />
            <span>claude agents</span>
            <span className="agents-count">
              {agents.length} agent{agents.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="agents-header-actions">
            <button 
              className="agents-new"
              onClick={handleCreateNew}
              title="new agent (Ctrl+N)"
              disabled={createMode || editMode}
            >
              <IconPlus size={16} />
            </button>
            <button className="agents-close" onClick={onClose}>
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
              {filteredAgents.length === 0 ? (
                <div className="agents-empty">
                  {searchQuery ? 'no agents match your search' : 'no agents yet'}
                </div>
              ) : (
                <div className="agents-list">
                  {filteredAgents.map((agent, index) => (
                    <div
                      key={agent.id}
                      className={`agent-item ${focusedIndex === index ? 'focused' : ''} ${selectedAgent?.id === agent.id ? 'selected' : ''}`}
                      onClick={() => {
                        if (onSelectAgent) {
                          onSelectAgent(agent);
                          onClose();
                        } else {
                          setSelectedAgent(agent);
                        }
                      }}
                      onMouseEnter={() => setFocusedIndex(index)}
                    >
                      <div className="agent-icon">{getAgentIcon(agent.icon)}</div>
                      <div className="agent-info">
                        <div className="agent-name">{agent.name}</div>
                        <div className="agent-task">{agent.default_task || 'no default task'}</div>
                        <div className="agent-model">{agent.model}</div>
                      </div>
                      <div className="agent-actions">
                        <button
                          className="agent-action"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(agent);
                          }}
                          title="edit"
                        >
                          <IconEdit size={14} />
                        </button>
                        <button
                          className="agent-action"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDuplicate(agent);
                          }}
                          title="duplicate"
                        >
                          <IconCopy size={14} />
                        </button>
                        <button
                          className="agent-action agent-delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(agent);
                          }}
                          title="delete"
                        >
                          <IconTrash size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="agent-editor">
              <div className="editor-title">
                {createMode ? 'create new agent' : `edit: ${selectedAgent?.name}`}
              </div>
              
              <div className="editor-form">
                <div className="form-group">
                  <label>name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    placeholder="e.g. Security Scanner"
                    autoFocus
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>icon</label>
                    <div className="icon-selector">
                      {Object.entries(iconMap).map(([key, icon]) => (
                        <button
                          key={key}
                          className={`icon-option ${formData.icon === key ? 'selected' : ''}`}
                          onClick={() => setFormData({...formData, icon: key})}
                          title={key}
                        >
                          {icon}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="form-group">
                    <label>model</label>
                    <select
                      value={formData.model}
                      onChange={e => setFormData({...formData, model: e.target.value as 'opus' | 'sonnet' | 'haiku'})}
                    >
                      <option value="opus">opus</option>
                      <option value="sonnet">sonnet</option>
                      <option value="haiku">haiku</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>default task</label>
                  <input
                    type="text"
                    value={formData.default_task}
                    onChange={e => setFormData({...formData, default_task: e.target.value})}
                    placeholder="e.g. Review the codebase for security issues"
                  />
                </div>

                <div className="form-group">
                  <label>system prompt</label>
                  <textarea
                    value={formData.system_prompt}
                    onChange={e => setFormData({...formData, system_prompt: e.target.value})}
                    placeholder="Enter the system prompt for this agent..."
                    rows={12}
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
  );
};