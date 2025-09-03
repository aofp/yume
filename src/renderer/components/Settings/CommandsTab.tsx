import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ConfirmModal } from '../ConfirmModal/ConfirmModal';
import {
  IconPlus,
  IconTrash,
  IconEdit,
  IconX,
  IconCheck,
  IconCommand,
  IconPlayerPlay,
  IconRotateClockwise,
  IconFileText,
  IconFolder,
  IconHash,
  IconCode,
  IconSparkles,
  IconTerminal,
  IconSearch,
  IconBrain,
  IconShield,
  IconBug,
  IconRocket,
  IconGitBranch,
  IconTestPipe,
  IconPackage
} from '@tabler/icons-react';

interface Command {
  id: string;
  name: string;
  description: string;
  template: string;
  category: 'dev' | 'test' | 'git' | 'util' | 'custom';
  icon?: any;
  hasParams?: boolean;
  enabled: boolean;
}

// Default commands inspired by Claudia and Claude Command Suite
const DEFAULT_COMMANDS: Command[] = [
  // Development Commands
  {
    id: 'code-review',
    name: 'code-review',
    description: 'Review code for best practices and improvements',
    template: `Please review the following code for:
- Code quality and best practices
- Potential bugs or issues
- Performance optimizations
- Security concerns
- Suggestions for improvement

$ARGUMENTS`,
    category: 'dev',
    icon: IconCode,
    hasParams: true,
    enabled: true
  },
  {
    id: 'explain',
    name: 'explain',
    description: 'Explain code in detail',
    template: `Please explain the following code in detail:
- What it does
- How it works
- Key concepts used
- Potential use cases

$ARGUMENTS`,
    category: 'dev',
    icon: IconBrain,
    hasParams: true,
    enabled: true
  },
  {
    id: 'optimize',
    name: 'optimize',
    description: 'Optimize code for performance',
    template: `Analyze this code for performance issues and suggest optimizations:
- Identify bottlenecks
- Suggest algorithmic improvements
- Recommend caching strategies
- Provide refactored version

$ARGUMENTS`,
    category: 'dev',
    icon: IconRocket,
    hasParams: true,
    enabled: true
  },
  {
    id: 'refactor',
    name: 'refactor',
    description: 'Refactor code for better structure',
    template: `Refactor this code to improve:
- Readability and maintainability
- Code organization
- Design patterns
- Error handling
- Follow SOLID principles

$ARGUMENTS`,
    category: 'dev',
    icon: IconSparkles,
    hasParams: true,
    enabled: true
  },
  
  // Testing Commands
  {
    id: 'test',
    name: 'test',
    description: 'Generate comprehensive tests',
    template: `Generate comprehensive tests for the following code:
- Unit tests with edge cases
- Integration tests if applicable
- Mock dependencies appropriately
- Use the project's testing framework
- Include test descriptions

$ARGUMENTS`,
    category: 'test',
    icon: IconTestPipe,
    hasParams: true,
    enabled: true
  },
  {
    id: 'debug',
    name: 'debug',
    description: 'Debug and fix issues',
    template: `Help me debug this issue:
- Identify the root cause
- Explain why it's happening
- Provide a fix
- Suggest preventive measures

Issue: $ARGUMENTS`,
    category: 'test',
    icon: IconBug,
    hasParams: true,
    enabled: true
  },
  
  // Git Commands
  {
    id: 'commit',
    name: 'commit',
    description: 'Generate semantic commit message',
    template: `Generate a semantic commit message for these changes:
- Follow conventional commits format
- Be concise but descriptive
- Include scope if applicable

Changes: $ARGUMENTS`,
    category: 'git',
    icon: IconGitBranch,
    hasParams: true,
    enabled: true
  },
  {
    id: 'pr',
    name: 'pr',
    description: 'Create pull request description',
    template: `Create a comprehensive pull request description:
- Summary of changes
- Why these changes were made
- Testing performed
- Breaking changes (if any)
- Related issues

Changes: $ARGUMENTS`,
    category: 'git',
    icon: IconGitBranch,
    hasParams: true,
    enabled: true
  },
  
  // Utility Commands
  {
    id: 'security',
    name: 'security',
    description: 'Security audit for vulnerabilities',
    template: `Review this code for security vulnerabilities:
- SQL injection risks
- XSS vulnerabilities
- Authentication/authorization issues
- Data exposure risks
- Best practice violations

$ARGUMENTS`,
    category: 'util',
    icon: IconShield,
    hasParams: true,
    enabled: true
  },
  {
    id: 'docs',
    name: 'docs',
    description: 'Generate documentation',
    template: `Generate comprehensive documentation for:
- Function/class descriptions
- Parameter explanations
- Return values
- Usage examples
- Edge cases

$ARGUMENTS`,
    category: 'util',
    icon: IconFileText,
    hasParams: true,
    enabled: true
  },
  {
    id: 'search',
    name: 'search',
    description: 'Search codebase for patterns',
    template: `Search the codebase for: $ARGUMENTS

Please look for:
- File locations
- Function/class definitions
- Usage examples
- Related code`,
    category: 'util',
    icon: IconSearch,
    hasParams: true,
    enabled: true
  },
  {
    id: 'deps',
    name: 'deps',
    description: 'Analyze dependencies',
    template: `Analyze project dependencies:
- List all dependencies
- Check for vulnerabilities
- Suggest updates
- Identify unused packages

$ARGUMENTS`,
    category: 'util',
    icon: IconPackage,
    hasParams: false,
    enabled: true
  }
];

export const CommandsTab: React.FC = () => {
  const [commands, setCommands] = useState<Command[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCommand, setEditingCommand] = useState<Command | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Form state
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newTemplate, setNewTemplate] = useState('');
  const [newCategory, setNewCategory] = useState<Command['category']>('custom');
  const [newHasParams, setNewHasParams] = useState(false);
  
  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isDangerous?: boolean;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });
  
  useEffect(() => {
    loadCommands();
  }, []);
  
  const loadCommands = async () => {
    try {
      // Try to load from localStorage first (as cache)
      const saved = localStorage.getItem('yurucode_commands');
      const cachedCommands = saved ? JSON.parse(saved) : DEFAULT_COMMANDS;
      
      // Load all commands (merges file system with cache)
      const allCommands = await invoke<Command[]>('load_all_commands', {
        cachedCommands: cachedCommands
      });
      
      setCommands(allCommands);
      
      // Update localStorage cache
      localStorage.setItem('yurucode_commands', JSON.stringify(allCommands));
      
      // Migrate any cached-only commands to file system
      const toMigrate = allCommands.filter(cmd => cmd.id.startsWith('cached-'));
      if (toMigrate.length > 0) {
        await invoke('migrate_commands_to_filesystem', { commands: toMigrate });
      }
    } catch (err) {
      console.error('Failed to load commands:', err);
      // Fallback to localStorage if Tauri commands fail
      const saved = localStorage.getItem('yurucode_commands');
      if (saved) {
        setCommands(JSON.parse(saved));
      } else {
        setCommands(DEFAULT_COMMANDS);
      }
    }
  };
  
  const saveCommands = async (newCommands: Command[]) => {
    setCommands(newCommands);
    // Always update localStorage as cache
    localStorage.setItem('yurucode_commands', JSON.stringify(newCommands));
    
    // Note: Individual commands are saved to file system when added/edited
    // This function now mainly updates the UI state and cache
  };
  
  const addCommand = async () => {
    if (!newName) return;
    
    const newCommand: Command = {
      id: `cmd_${Date.now()}`,
      name: newName.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      description: newDescription || 'Custom command',
      template: newTemplate || 'Please help with: $ARGUMENTS',
      category: newCategory,
      hasParams: newHasParams,
      enabled: true
    };
    
    try {
      // Save to file system
      await invoke('save_custom_command', { command: newCommand });
      
      // Update local state
      const updated = [...commands, newCommand];
      await saveCommands(updated);
    } catch (err) {
      console.error('Failed to save command:', err);
      alert('Failed to save command to file system');
    }
    
    // Reset form
    setShowAddModal(false);
    setNewName('');
    setNewDescription('');
    setNewTemplate('');
    setNewCategory('custom');
    setNewHasParams(false);
  };
  
  const editCommand = (command: Command) => {
    setEditingCommand(command);
    setNewName(command.name);
    setNewDescription(command.description);
    setNewTemplate(command.template);
    setNewCategory(command.category);
    setNewHasParams(command.hasParams || false);
    setShowEditModal(true);
  };
  
  const saveEditedCommand = async () => {
    if (!editingCommand || !newName) return;
    
    const editedCommand = { 
      ...editingCommand,
      name: newName.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      description: newDescription,
      template: newTemplate,
      category: newCategory,
      hasParams: newHasParams,
      has_params: newHasParams
    };
    
    try {
      // Check if it's a default command (shouldn't save to file system)
      const isDefault = DEFAULT_COMMANDS.find(d => d.id === editingCommand.id);
      
      if (!isDefault) {
        // Delete old command file if name changed
        if (editingCommand.name !== editedCommand.name) {
          await invoke('delete_custom_command', { commandName: editingCommand.name });
        }
        // Save new/updated command file
        await invoke('save_custom_command', { command: editedCommand });
      }
      
      // Update local state
      const updated = commands.map(cmd => 
        cmd.id === editingCommand.id ? editedCommand : cmd
      );
      
      await saveCommands(updated);
      setShowEditModal(false);
      setEditingCommand(null);
    } catch (err) {
      console.error('Failed to save edited command:', err);
      alert('Failed to save command changes');
    }
  };
  
  const deleteCommand = async (commandId: string) => {
    // Don't allow deleting default commands
    const command = commands.find(c => c.id === commandId);
    if (command && DEFAULT_COMMANDS.find(d => d.id === commandId)) {
      alert('Cannot delete default commands. You can disable them instead.');
      return;
    }
    
    // Show confirmation modal
    setConfirmModal({
      isOpen: true,
      title: 'Delete Command',
      message: `Are you sure you want to delete the command "${command?.name || 'this command'}"? This action cannot be undone.`,
      isDangerous: true,
      onConfirm: async () => {
        console.log('Delete confirmed, removing command:', commandId);
        
        try {
          // Delete from file system if it's a custom command
          const isDefault = DEFAULT_COMMANDS.find(d => d.id === commandId);
          if (!isDefault && command) {
            await invoke('delete_custom_command', { commandName: command.name });
          }
          
          // Update local state
          const updated = commands.filter(cmd => cmd.id !== commandId);
          await saveCommands(updated);
        } catch (err) {
          console.error('Failed to delete command:', err);
          alert('Failed to delete command from file system');
        } finally {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };
  
  const toggleCommand = async (commandId: string) => {
    const command = commands.find(c => c.id === commandId);
    if (!command) return;
    
    const toggledCommand = { ...command, enabled: !command.enabled };
    
    try {
      // Save to file system if it's a custom command
      const isDefault = DEFAULT_COMMANDS.find(d => d.id === commandId);
      if (!isDefault) {
        await invoke('save_custom_command', { command: toggledCommand });
      }
      
      // Update local state
      const updated = commands.map(cmd => 
        cmd.id === commandId ? toggledCommand : cmd
      );
      await saveCommands(updated);
    } catch (err) {
      console.error('Failed to toggle command:', err);
    }
  };
  
  const resetToDefaults = async () => {
    setConfirmModal({
      isOpen: true,
      title: 'Reset to Defaults',
      message: 'Reset all commands to defaults? Your custom commands will be permanently deleted.',
      isDangerous: true,
      onConfirm: async () => {
        try {
          // Delete all custom command files
          const customCommands = commands.filter(cmd => !DEFAULT_COMMANDS.find(d => d.id === cmd.id));
          for (const cmd of customCommands) {
            try {
              await invoke('delete_custom_command', { commandName: cmd.name });
            } catch (err) {
              console.error('Failed to delete command file:', cmd.name, err);
            }
          }
          
          // Reset to defaults
          await saveCommands(DEFAULT_COMMANDS);
        } catch (err) {
          console.error('Failed to reset commands:', err);
          alert('Failed to reset commands');
        } finally {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };
  
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'dev': return <IconCode size={10} />;
      case 'test': return <IconTestPipe size={10} />;
      case 'git': return <IconGitBranch size={10} />;
      case 'util': return <IconPackage size={10} />;
      case 'custom': return <IconSparkles size={10} />;
      default: return <IconCommand size={10} />;
    }
  };
  
  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'dev': return '#99bbff';
      case 'test': return '#99ff99';
      case 'git': return '#ff9999';
      case 'util': return '#ffbb99';
      case 'custom': return '#dd99ff';
      default: return '#999';
    }
  };
  
  const filteredCommands = commands.filter(cmd => 
    cmd.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cmd.description.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  const groupedCommands = filteredCommands.reduce((acc, cmd) => {
    if (!acc[cmd.category]) acc[cmd.category] = [];
    acc[cmd.category].push(cmd);
    return acc;
  }, {} as Record<string, Command[]>);
  
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
      <div className="settings-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div>
            <h4 style={{ fontSize: '12px', color: '#fff', margin: '0 0 4px 0' }}>Custom Commands</h4>
            <p style={{ fontSize: '10px', color: '#666', margin: 0 }}>
              Commands are stored in ~/.claude/commands/
            </p>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button 
              onClick={resetToDefaults}
              style={{ 
                background: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: 'rgba(255, 255, 255, 0.4)',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '10px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <IconRotateClockwise size={10} />
              reset
            </button>
            <button 
              onClick={() => setShowAddModal(true)}
              style={{ 
                background: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: 'rgba(255, 255, 255, 0.4)',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '10px',
                cursor: 'pointer'
              }}
            >
              + add
            </button>
          </div>
        </div>
        
        <input
          type="text"
          placeholder="search commands..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            width: '100%',
            padding: '6px',
            background: '#111',
            border: '1px solid #333',
            color: '#fff',
            fontSize: '11px',
            borderRadius: '4px',
            marginBottom: '12px'
          }}
        />
        
        {Object.keys(groupedCommands).length === 0 ? (
          <p style={{ fontSize: '10px', color: '#666' }}>no commands found</p>
        ) : (
          Object.entries(groupedCommands).map(([category, categoryCommands]) => (
            <div key={category} style={{ marginBottom: '12px' }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '6px',
                marginBottom: '6px'
              }}>
                {getCategoryIcon(category)}
                <span style={{ 
                  fontSize: '10px', 
                  color: getCategoryColor(category),
                  textTransform: 'uppercase',
                  fontWeight: 'bold'
                }}>
                  {category}
                </span>
              </div>
              
              {categoryCommands.map(command => (
                <div 
                  key={command.id} 
                  style={{ 
                    padding: '6px 8px',
                    background: command.enabled ? 'rgba(255, 255, 255, 0.02)' : 'transparent',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '4px',
                    marginBottom: '4px',
                    opacity: command.enabled ? 1 : 0.5
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input 
                        type="checkbox"
                        checked={command.enabled}
                        onChange={() => toggleCommand(command.id)}
                        style={{ cursor: 'pointer' }}
                      />
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ 
                            fontSize: '11px', 
                            fontWeight: 'bold',
                            color: getCategoryColor(category),
                            fontFamily: 'monospace'
                          }}>
                            /{command.name}
                          </span>
                          {command.hasParams && (
                            <span style={{ 
                              fontSize: '9px', 
                              color: '#666',
                              padding: '1px 3px',
                              background: 'rgba(255, 255, 255, 0.1)',
                              borderRadius: '2px'
                            }}>
                              params
                            </span>
                          )}
                        </div>
                        <p style={{ fontSize: '9px', color: '#666', margin: '2px 0 0 0' }}>
                          {command.description}
                        </p>
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        onClick={() => editCommand(command)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#666',
                          cursor: 'pointer',
                          padding: '2px',
                          fontSize: '10px'
                        }}
                      >
                        <IconEdit size={10} />
                      </button>
                      {!DEFAULT_COMMANDS.find(d => d.id === command.id) && (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            // Add small delay to prevent accidental clicks
                            setTimeout(() => deleteCommand(command.id), 100);
                          }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#ff9999',
                            cursor: 'pointer',
                            padding: '2px',
                            fontSize: '10px'
                          }}
                        >
                          <IconTrash size={10} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
        
        <div style={{ 
          marginTop: '12px',
          padding: '8px',
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '4px'
        }}>
          <p style={{ fontSize: '10px', color: '#666', margin: 0 }}>
            <strong>Usage:</strong> Type <code style={{ color: '#99bbff' }}>/command</code> in chat
          </p>
          <p style={{ fontSize: '10px', color: '#666', margin: '4px 0 0 0' }}>
            <strong>Params:</strong> Use <code style={{ color: '#99bbff' }}>$ARGUMENTS</code> in template for parameters
          </p>
          <p style={{ fontSize: '10px', color: '#666', margin: '4px 0 0 0' }}>
            <strong>Example:</strong> <code style={{ color: '#99bbff' }}>/explain MyClass.js</code>
          </p>
        </div>
      </div>
      
      {/* Add Command Modal */}
      {showAddModal && (
        <div 
          className="hook-modal-overlay" 
          onClick={() => setShowAddModal(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000
          }}
        >
          <div 
            className="hook-modal" 
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#000',
              border: '1px solid #333',
              borderRadius: '8px',
              padding: '16px',
              width: '90%',
              maxWidth: '500px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h4 style={{ margin: 0, fontSize: '14px', color: '#fff' }}>Add Command</h4>
              <button 
                onClick={() => setShowAddModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', padding: '4px' }}
              >
                <IconX size={14} />
              </button>
            </div>
            
            <input
              type="text"
              placeholder="Command name (e.g. analyze-code)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              style={{
                width: '100%',
                padding: '6px',
                background: '#111',
                border: '1px solid #333',
                color: '#fff',
                fontSize: '11px',
                borderRadius: '4px',
                marginBottom: '8px'
              }}
            />
            
            <input
              type="text"
              placeholder="Description"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              style={{
                width: '100%',
                padding: '6px',
                background: '#111',
                border: '1px solid #333',
                color: '#fff',
                fontSize: '11px',
                borderRadius: '4px',
                marginBottom: '8px'
              }}
            />
            
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as any)}
              style={{
                width: '100%',
                padding: '6px',
                background: '#111',
                border: '1px solid #333',
                color: '#fff',
                fontSize: '11px',
                borderRadius: '4px',
                marginBottom: '8px'
              }}
            >
              <option value="custom">Custom</option>
              <option value="dev">Development</option>
              <option value="test">Testing</option>
              <option value="git">Git</option>
              <option value="util">Utility</option>
            </select>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <input 
                type="checkbox"
                id="hasParams"
                checked={newHasParams}
                onChange={(e) => setNewHasParams(e.target.checked)}
              />
              <label htmlFor="hasParams" style={{ fontSize: '11px', color: '#fff' }}>
                Command accepts parameters (use $ARGUMENTS in template)
              </label>
            </div>
            
            <textarea
              placeholder={`Command template (markdown):\n\nExample:\nPlease analyze the following code:\n$ARGUMENTS`}
              value={newTemplate}
              onChange={(e) => setNewTemplate(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                background: '#111',
                border: '1px solid #333',
                color: '#fff',
                fontSize: '11px',
                fontFamily: 'monospace',
                borderRadius: '4px',
                marginBottom: '12px',
                minHeight: '150px',
                resize: 'vertical'
              }}
            />
            
            <button
              onClick={addCommand}
              disabled={!newName}
              style={{
                width: '100%',
                background: 'rgba(153, 187, 255, 0.1)',
                border: '1px solid rgba(153, 187, 255, 0.3)',
                color: '#99bbff',
                padding: '6px',
                borderRadius: '4px',
                fontSize: '11px',
                cursor: 'pointer'
              }}
            >
              <IconPlus size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
              Add Command
            </button>
          </div>
        </div>
      )}
      
      {/* Edit Command Modal */}
      {showEditModal && editingCommand && (
        <div 
          className="hook-modal-overlay" 
          onClick={() => setShowEditModal(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000
          }}
        >
          <div 
            className="hook-modal" 
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#000',
              border: '1px solid #333',
              borderRadius: '8px',
              padding: '16px',
              width: '90%',
              maxWidth: '500px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h4 style={{ margin: 0, fontSize: '14px', color: '#fff' }}>Edit Command</h4>
              <button 
                onClick={() => setShowEditModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', padding: '4px' }}
              >
                <IconX size={14} />
              </button>
            </div>
            
            <input
              type="text"
              placeholder="Command name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              style={{
                width: '100%',
                padding: '6px',
                background: '#111',
                border: '1px solid #333',
                color: '#fff',
                fontSize: '11px',
                borderRadius: '4px',
                marginBottom: '8px'
              }}
            />
            
            <input
              type="text"
              placeholder="Description"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              style={{
                width: '100%',
                padding: '6px',
                background: '#111',
                border: '1px solid #333',
                color: '#fff',
                fontSize: '11px',
                borderRadius: '4px',
                marginBottom: '8px'
              }}
            />
            
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as any)}
              style={{
                width: '100%',
                padding: '6px',
                background: '#111',
                border: '1px solid #333',
                color: '#fff',
                fontSize: '11px',
                borderRadius: '4px',
                marginBottom: '8px'
              }}
            >
              <option value="custom">Custom</option>
              <option value="dev">Development</option>
              <option value="test">Testing</option>
              <option value="git">Git</option>
              <option value="util">Utility</option>
            </select>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <input 
                type="checkbox"
                id="hasParamsEdit"
                checked={newHasParams}
                onChange={(e) => setNewHasParams(e.target.checked)}
              />
              <label htmlFor="hasParamsEdit" style={{ fontSize: '11px', color: '#fff' }}>
                Command accepts parameters
              </label>
            </div>
            
            <textarea
              placeholder="Command template..."
              value={newTemplate}
              onChange={(e) => setNewTemplate(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                background: '#111',
                border: '1px solid #333',
                color: '#fff',
                fontSize: '11px',
                fontFamily: 'monospace',
                borderRadius: '4px',
                marginBottom: '12px',
                minHeight: '150px',
                resize: 'vertical'
              }}
            />
            
            <button
              onClick={saveEditedCommand}
              disabled={!newName}
              style={{
                width: '100%',
                background: 'rgba(153, 187, 255, 0.1)',
                border: '1px solid rgba(153, 187, 255, 0.3)',
                color: '#99bbff',
                padding: '6px',
                borderRadius: '4px',
                fontSize: '11px',
                cursor: 'pointer'
              }}
            >
              <IconCheck size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
              Save Changes
            </button>
          </div>
        </div>
      )}
    </>
  );
};