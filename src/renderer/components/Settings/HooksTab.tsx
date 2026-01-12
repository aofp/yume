import React, { useState, useEffect } from 'react';
import { ConfirmModal } from '../ConfirmModal/ConfirmModal';
import {
  IconPlayerPlay,
  IconPlus,
  IconTrash,
  IconEdit,
  IconX,
  IconCheck,
  IconRotateClockwise,
  IconPuzzle
} from '@tabler/icons-react';
import { hooksService } from '../../services/hooksService';
import { pluginService } from '../../services/pluginService';
import { PluginBadge } from '../common/PluginBadge';
import { invoke } from '@tauri-apps/api/core';
import { YURUCODE_HOOKS } from './hooks-data';

interface HooksTabProps {
  selectedHooks: any;
  setSelectedHooks: (hooks: any) => void;
  hookScripts: any;
  setHookScripts: (scripts: any) => void;
}

export const HooksTab: React.FC<HooksTabProps> = ({
  selectedHooks,
  setSelectedHooks,
  hookScripts,
  setHookScripts
}) => {
  const [customHooks, setCustomHooks] = useState<any[]>([]);
  const [pluginHooks, setPluginHooks] = useState<Array<{
    name: string;
    event: string;
    description: string;
    pluginId: string;
    pluginName: string;
    filePath: string;
  }>>([]);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingHook, setEditingHook] = useState<any>(null);
  const [editingScript, setEditingScript] = useState('');
  const [testResult, setTestResult] = useState('');
  const [testing, setTesting] = useState(false);
  const [customHookName, setCustomHookName] = useState('');
  const [customHookEvent, setCustomHookEvent] = useState('user_prompt_submit');
  const [customHookDescription, setCustomHookDescription] = useState('');
  const [customHookScript, setCustomHookScript] = useState('');
  
  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isDangerous?: boolean;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  useEffect(() => {
    loadCustomHooks();
    loadSavedStates();
    loadPluginHooks();
  }, []);

  const loadPluginHooks = async () => {
    try {
      await pluginService.initialize();
      const hooks = pluginService.getEnabledPluginHooks();
      setPluginHooks(hooks);
    } catch (error) {
      console.error('Failed to load plugin hooks:', error);
    }
  };

  const loadCustomHooks = () => {
    const saved = localStorage.getItem('custom_hooks');
    if (saved) {
      setCustomHooks(JSON.parse(saved));
    }
  };

  const loadSavedStates = () => {
    // Load saved states for yurucode hooks - default to enabled
    const states: any = {};
    const scripts: any = {};
    
    YURUCODE_HOOKS.forEach(hook => {
      const saved = localStorage.getItem(`hook_${hook.id}_enabled`);
      // If never saved before, default to true and save it
      if (saved === null) {
        states[hook.id] = true;
        localStorage.setItem(`hook_${hook.id}_enabled`, 'true');
        hooksService.saveHook(hook.id, { enabled: true, script: hook.script });
      } else {
        states[hook.id] = saved === 'true';
      }
      
      // Load saved scripts or use default
      const savedScript = localStorage.getItem(`hook_${hook.id}_script`);
      if (savedScript === null) {
        scripts[hook.id] = hook.script;
        localStorage.setItem(`hook_${hook.id}_script`, hook.script);
        hooksService.saveHook(hook.id, { script: hook.script });
      } else {
        scripts[hook.id] = savedScript;
      }
    });
    
    setSelectedHooks(states);
    setHookScripts(scripts);
  };

  const toggleHook = (hookId: string, enabled: boolean) => {
    const newStates = { ...selectedHooks, [hookId]: enabled };
    setSelectedHooks(newStates);
    localStorage.setItem(`hook_${hookId}_enabled`, enabled ? 'true' : 'false');
    hooksService.saveHook(hookId, { enabled });
  };

  const editHook = (hook: any) => {
    setEditingHook(hook);
    setEditingScript(hookScripts[hook.id] || hook.script || '');
    setShowEditModal(true);
  };

  const saveHookScript = () => {
    if (!editingHook) return;
    
    setHookScripts({ ...hookScripts, [editingHook.id]: editingScript });
    localStorage.setItem(`hook_${editingHook.id}_script`, editingScript);
    hooksService.saveHook(editingHook.id, { script: editingScript });
    
    setShowEditModal(false);
    setEditingHook(null);
    setEditingScript('');
  };

  const testHookScript = async () => {
    if (!editingHook || !editingScript) return;
    
    setTesting(true);
    setTestResult('');
    
    try {
      const result = await invoke<string>('test_hook', {
        script: editingScript,
        event: editingHook.id
      });
      setTestResult(result);
    } catch (error) {
      setTestResult(`Error: ${error}`);
    } finally {
      setTesting(false);
    }
  };

  const loadSampleHooks = async () => {
    try {
      const samples = await invoke<Array<[string, string, string]>>('get_sample_hooks');
      
      samples.forEach(([name, event, script]) => {
        const hook = YURUCODE_HOOKS.find(h => h.id === event);
        if (hook) {
          setHookScripts({ ...hookScripts, [event]: script });
          localStorage.setItem(`hook_${event}_script`, script);
          hooksService.saveHook(event, { script });
        }
      });
    } catch (error) {
      console.error('Failed to load sample hooks:', error);
    }
  };

  const addCustomHook = () => {
    if (!customHookName) return;
    
    const newHook = {
      id: `custom_${Date.now()}`,
      name: customHookName,
      description: customHookDescription || 'custom hook',
      event: customHookEvent,
      enabled: false,
      script: customHookScript || '#!/bin/bash\necho \'{"action":"continue"}\''
    };
    
    const updated = [...customHooks, newHook];
    setCustomHooks(updated);
    localStorage.setItem('custom_hooks', JSON.stringify(updated));
    
    setShowCustomModal(false);
    setCustomHookName('');
    setCustomHookDescription('');
    setCustomHookScript('');
  };

  const deleteCustomHook = (hookId: string) => {
    const hook = customHooks.find(h => h.id === hookId);
    if (!hook) return;
    
    setConfirmModal({
      isOpen: true,
      title: 'Delete Custom Hook',
      message: `Are you sure you want to delete the custom hook "${hook.name}"? This action cannot be undone.`,
      isDangerous: true,
      onConfirm: () => {
        const updated = customHooks.filter(h => h.id !== hookId);
        setCustomHooks(updated);
        localStorage.setItem('custom_hooks', JSON.stringify(updated));
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const resetAllToDefaults = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Reset Hooks to Defaults',
      message: 'This will reset all yurucode hooks to their default scripts. Your custom hooks and modifications will be lost. Are you sure?',
      isDangerous: true,
      onConfirm: () => {
        // Reset all hooks to defaults
        const defaultStates: any = {};
        const defaultScripts: any = {};
        
        YURUCODE_HOOKS.forEach(hook => {
          defaultStates[hook.id] = true; // All enabled by default
          defaultScripts[hook.id] = hook.script;
          
          // Save to localStorage
          localStorage.setItem(`hook_${hook.id}_enabled`, 'true');
          localStorage.setItem(`hook_${hook.id}_script`, hook.script);
          
          // Save to hooksService
          hooksService.saveHook(hook.id, { 
            enabled: true, 
            script: hook.script,
            name: hook.name
          });
        });
        
        setSelectedHooks(defaultStates);
        setHookScripts(defaultScripts);
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  return (
    <>
      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.title.toLowerCase().includes('delete') ? 'delete' : 'reset'}
        cancelText="cancel"
        isDangerous={confirmModal.isDangerous}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />
      
      {/* Built-in Hooks - only show if there are any */}
      {YURUCODE_HOOKS.length > 0 && (
      <div className="settings-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <h4 style={{ fontSize: '11px', color: 'var(--accent-color)', margin: 0, fontWeight: 500, textTransform: 'lowercase' }}>yurucode hooks</h4>
          <button
            onClick={resetAllToDefaults}
            className="reset-defaults-btn"
            style={{
              background: 'transparent',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: 'rgba(255, 255, 255, 0.4)',
              padding: '2px 6px',
              borderRadius: '4px',
              fontSize: '10px',
              cursor: 'default',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent-color)';
              e.currentTarget.style.color = 'var(--accent-color)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.4)';
            }}
          >
            <IconRotateClockwise size={10} />
            reset to defaults
          </button>
        </div>

        {YURUCODE_HOOKS.map(hook => (
          <div key={hook.id} style={{ marginBottom: '6px' }}>
            <div className="checkbox-setting">
              <span className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {hook.icon && <hook.icon size={12} />}
                {hook.name}
              </span>
              <input 
                type="checkbox" 
                className="checkbox-input"
                id={`hook-${hook.id}`}
                checked={selectedHooks[hook.id] || false}
                onChange={(e) => toggleHook(hook.id, e.target.checked)}
              />
              <div className="toggle-switch-container">
                <label htmlFor={`hook-${hook.id}`} className={`toggle-switch ${selectedHooks[hook.id] ? 'active' : ''}`}>
                  <span className="toggle-switch-slider" />
                  <span className="toggle-switch-label off">OFF</span>
                  <span className="toggle-switch-label on">ON</span>
                </label>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ fontSize: '9px', color: '#666', margin: '2px 0 0 0' }}>{hook.description}</p>
              {selectedHooks[hook.id] && (
                <button
                  onClick={() => editHook(hook)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#666',
                    cursor: 'default',
                    padding: '2px',
                    fontSize: '10px',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--accent-color)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = '#666';
                  }}
                >
                  <IconEdit size={10} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      )}

      {/* Custom Hooks */}
      <div className="settings-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <h4 style={{ fontSize: '11px', color: 'var(--accent-color)', margin: 0, fontWeight: 500, textTransform: 'lowercase' }}>custom hooks</h4>
          <button 
            onClick={() => setShowCustomModal(true)}
            style={{ 
              background: 'transparent',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: 'rgba(255, 255, 255, 0.4)',
              padding: '2px 6px',
              borderRadius: '4px',
              fontSize: '10px',
              cursor: 'default',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent-color)';
              e.currentTarget.style.color = 'var(--accent-color)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.4)';
            }}
          >
            + add custom
          </button>
        </div>
        
        {customHooks.length === 0 ? (
          <p style={{ fontSize: '10px', color: '#666' }}>no custom hooks yet</p>
        ) : (
          customHooks.map(hook => (
            <div key={hook.id} style={{ marginBottom: '6px' }}>
              <div className="checkbox-setting">
                <span className="checkbox-label">{hook.name}</span>
                <input 
                  type="checkbox" 
                  className="checkbox-input"
                  id={`custom-${hook.id}`}
                  checked={hook.enabled}
                  onChange={(e) => {
                    const updated = customHooks.map(h => 
                      h.id === hook.id ? { ...h, enabled: e.target.checked } : h
                    );
                    setCustomHooks(updated);
                    localStorage.setItem('custom_hooks', JSON.stringify(updated));
                  }}
                />
                <div className="toggle-switch-container">
                  <label htmlFor={`custom-${hook.id}`} className={`toggle-switch ${hook.enabled ? 'active' : ''}`}>
                    <span className="toggle-switch-slider" />
                    <span className="toggle-switch-label off">OFF</span>
                    <span className="toggle-switch-label on">ON</span>
                  </label>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ fontSize: '9px', color: '#666', margin: '2px 0 0 0' }}>
                  {hook.description} • <span style={{ color: '#999' }}>{hook.event}</span>
                </p>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {hook.enabled && (
                    <button
                      onClick={() => editHook(hook)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#666',
                        cursor: 'default',
                        padding: '2px',
                        fontSize: '10px',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = 'var(--accent-color)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = '#666';
                      }}
                    >
                      <IconEdit size={10} />
                    </button>
                  )}
                  <button
                    onClick={() => deleteCustomHook(hook.id)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#ff9999',
                      cursor: 'default',
                      padding: '2px',
                      fontSize: '10px'
                    }}
                  >
                    <IconTrash size={10} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Plugin Hooks */}
      {pluginHooks.length > 0 && (
        <div className="settings-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h4 style={{ fontSize: '11px', color: 'var(--accent-color)', margin: 0, fontWeight: 500, textTransform: 'lowercase' }}>
              <IconPuzzle size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
              plugin hooks
            </h4>
          </div>

          {pluginHooks.map(hook => (
            <div key={`${hook.pluginId}-${hook.name}`} style={{ marginBottom: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#999' }}>
                  {hook.name}
                  <PluginBadge pluginName={hook.pluginName} size="small" />
                </span>
                <span style={{ fontSize: '9px', color: '#666', fontFamily: 'var(--font-mono, monospace)' }}>
                  {hook.event}
                </span>
              </div>
              {hook.description && (
                <p style={{ fontSize: '9px', color: '#555', margin: '2px 0 0 0' }}>{hook.description}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Edit Hook Modal */}
      {showEditModal && editingHook && (
        <div className="hook-modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="hook-modal" onClick={(e) => e.stopPropagation()}>
            <div className="hook-modal-header">
              <h4>edit {editingHook.name} <span style={{ fontSize: '10px', color: '#666', fontWeight: 'normal' }}>({editingHook.event || editingHook.id})</span></h4>
              <button onClick={() => setShowEditModal(false)}>
                <IconX size={14} />
              </button>
            </div>
            
            <textarea
              className="hook-script-editor"
              value={editingScript}
              onChange={(e) => setEditingScript(e.target.value)}
              placeholder="Enter hook script..."
              spellCheck={false}
              style={{
                width: '100%',
                height: '200px',
                background: '#111',
                border: '1px solid #333',
                color: '#fff',
                padding: '8px',
                fontSize: '11px',
                fontFamily: 'monospace',
                borderRadius: '4px',
                resize: 'vertical'
              }}
            />
            
            {testResult && (
              <div style={{
                marginTop: '8px',
                padding: '8px',
                background: '#111',
                border: '1px solid #333',
                borderRadius: '4px',
                fontSize: '10px',
                color: '#999',
                fontFamily: 'monospace'
              }}>
                <strong>test result:</strong>
                <pre style={{ margin: '4px 0 0 0' }}>{testResult}</pre>
              </div>
            )}
            
            <div className="hook-modal-actions" style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
              <button
                onClick={testHookScript}
                disabled={testing}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  color: 'rgba(255, 255, 255, 0.4)',
                  padding: '6px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  cursor: 'default'
                }}
              >
                <IconPlayerPlay size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                {testing ? 'testing...' : 'test'}
              </button>
              <button
                onClick={saveHookScript}
                style={{
                  flex: 1,
                  background: 'rgba(153, 187, 255, 0.1)',
                  border: '1px solid rgba(153, 187, 255, 0.3)',
                  color: '#99bbff',
                  padding: '6px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  cursor: 'default'
                }}
              >
                <IconCheck size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Custom Hook Modal */}
      {showCustomModal && (
        <div className="hook-modal-overlay" onClick={() => setShowCustomModal(false)}>
          <div className="hook-modal" onClick={(e) => e.stopPropagation()}>
            <div className="hook-modal-header">
              <h4>add custom hook</h4>
              <button onClick={() => setShowCustomModal(false)}>
                <IconX size={14} />
              </button>
            </div>
            
            <input
              type="text"
              placeholder="hook name..."
              value={customHookName}
              onChange={(e) => setCustomHookName(e.target.value)}
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
              placeholder="description..."
              value={customHookDescription}
              onChange={(e) => setCustomHookDescription(e.target.value)}
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
              value={customHookEvent}
              onChange={(e) => setCustomHookEvent(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 8px',
                background: '#111',
                border: '1px solid #333',
                color: '#fff',
                fontSize: '11px',
                borderRadius: '4px',
                marginBottom: '12px',
                cursor: 'default',
                outline: 'none',
                appearance: 'none',
                WebkitAppearance: 'none',
                MozAppearance: 'none',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 8px center',
                backgroundSize: '12px',
                paddingRight: '28px',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E"), linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0) 100%)`,
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#99bbff';
                e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#333';
                e.target.style.backgroundColor = '#111';
              }}
            >
              <option value="user_prompt_submit" style={{ background: '#111', color: '#fff' }}>user_prompt_submit</option>
              <option value="pre_tool_use" style={{ background: '#111', color: '#fff' }}>pre_tool_use</option>
              <option value="post_tool_use" style={{ background: '#111', color: '#fff' }}>post_tool_use</option>
              <option value="assistant_response" style={{ background: '#111', color: '#fff' }}>assistant_response</option>
              <option value="session_start" style={{ background: '#111', color: '#fff' }}>session_start</option>
              <option value="session_end" style={{ background: '#111', color: '#fff' }}>session_end</option>
              <option value="context_warning" style={{ background: '#111', color: '#fff' }}>context_warning</option>
              <option value="compaction_trigger" style={{ background: '#111', color: '#fff' }}>compaction_trigger</option>
              <option value="error" style={{ background: '#111', color: '#fff' }}>error</option>
            </select>
            
            <textarea
              placeholder="hook script (bash/python)..."
              value={customHookScript}
              onChange={(e) => setCustomHookScript(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                background: '#111',
                backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0) 100%)',
                border: '1px solid #333',
                color: '#fff',
                fontSize: '11px',
                fontFamily: 'var(--font-mono, "Comic Mono", monospace)',
                borderRadius: '4px',
                marginBottom: '12px',
                resize: 'vertical',
                minHeight: '120px',
                outline: 'none',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#99bbff';
                e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#333';
                e.target.style.backgroundColor = '#111';
              }}
              spellCheck={false}
            />
            
            <button
              onClick={addCustomHook}
              disabled={!customHookName}
              style={{
                width: '100%',
                background: 'rgba(153, 187, 255, 0.1)',
                border: '1px solid rgba(153, 187, 255, 0.3)',
                color: '#99bbff',
                padding: '6px',
                borderRadius: '4px',
                fontSize: '11px',
                cursor: 'default'
              }}
            >
              <IconPlus size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
              add hook
            </button>
          </div>
        </div>
      )}

      <style>{`
        .hook-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
        }
        
        .hook-modal {
          background: #000;
          border: 1px solid #333;
          border-radius: 8px;
          padding: 16px;
          width: 90%;
          max-width: 500px;
        }
        
        .hook-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          -webkit-app-region: drag;
        }
        
        .hook-modal-header h4 {
          margin: 0;
          font-size: 14px;
          color: #fff;
        }
        
        .hook-modal-header button {
          background: transparent;
          border: none;
          color: #666;
          cursor: default;
          padding: 4px;
          -webkit-app-region: no-drag;
        }
        
        .hook-modal-header h4 {
          -webkit-app-region: no-drag;
        }
      `}</style>
    </>
  );
};