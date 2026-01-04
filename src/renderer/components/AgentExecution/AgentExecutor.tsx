import React, { useState, useEffect, useRef } from 'react';
import { 
  IconRobot, 
  IconPlayerPlay, 
  IconPlayerStop,
  IconSettings,
  IconChevronDown,
  IconChevronUp,
  IconBolt,
  IconCheck,
  IconX,
  IconRefresh
} from '@tabler/icons-react';
import { agentExecutionService, AgentConfig } from '../../services/agentExecutionService';
import { FEATURE_FLAGS } from '../../config/features';
import { invoke } from '@tauri-apps/api/core';
import './AgentExecutor.css';

// Agent type from backend
interface Agent {
  id?: number;
  name: string;
  icon: string;
  system_prompt: string;
  default_task?: string;
  model: string;
  hooks?: string;
  created_at: string;
  updated_at: string;
}

interface AgentExecutorProps {
  sessionId: string;
  isOpen: boolean;
  onClose: () => void;
}

export const AgentExecutor: React.FC<AgentExecutorProps> = ({
  sessionId,
  isOpen,
  onClose,
}) => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [task, setTask] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [output, setOutput] = useState<string[]>([]);
  const [metrics, setMetrics] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isLoadingAgents, setIsLoadingAgents] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  
  // Load agents from database - auto-load defaults if empty
  useEffect(() => {
    const loadAgents = async () => {
      if (!isOpen) return;

      setIsLoadingAgents(true);
      try {
        let agentList = await invoke<Agent[]>('list_agents');

        // Auto-load default agents if none exist
        if (agentList.length === 0) {
          console.log('No agents found, loading defaults...');
          agentList = await invoke<Agent[]>('load_default_agents');
        }

        setAgents(agentList);

        // Select first agent by default
        if (agentList.length > 0 && !selectedAgentId) {
          setSelectedAgentId(agentList[0].id || null);
        }
      } catch (err) {
        console.error('Failed to load agents:', err);
        setError('Failed to load agents');
      } finally {
        setIsLoadingAgents(false);
      }
    };

    loadAgents();
  }, [isOpen]);
  
  useEffect(() => {
    // Listen for agent events
    const handleProgress = (event: CustomEvent) => {
      if (event.detail.runId === currentRunId) {
        const data = event.detail.data;
        if (data.type === 'assistant' && data.text) {
          setOutput(prev => [...prev, data.text]);
        } else if (data.type === 'tool_use') {
          setOutput(prev => [...prev, `🔧 Using tool: ${data.tool_name}`]);
        }
        setMetrics(event.detail.metrics);
        
        // Auto-scroll to bottom
        if (outputRef.current) {
          outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
      }
    };
    
    const handleCompleted = (event: CustomEvent) => {
      if (event.detail.runId === currentRunId) {
        setIsRunning(false);
        setOutput(prev => [...prev, '\n✅ Agent completed']);
        setMetrics(event.detail.metrics);
      }
    };
    
    const handleError = (event: CustomEvent) => {
      if (event.detail.runId === currentRunId) {
        setIsRunning(false);
        setError(event.detail.error);
      }
    };
    
    window.addEventListener('agent-progress' as any, handleProgress);
    window.addEventListener('agent-completed' as any, handleCompleted);
    window.addEventListener('agent-error' as any, handleError);
    
    return () => {
      window.removeEventListener('agent-progress' as any, handleProgress);
      window.removeEventListener('agent-completed' as any, handleCompleted);
      window.removeEventListener('agent-error' as any, handleError);
    };
  }, [currentRunId]);
  
  // Don't render if feature is disabled
  if (!FEATURE_FLAGS.ENABLE_AGENT_EXECUTION || !isOpen) {
    return null;
  }
  
  const handleExecute = async () => {
    const selectedAgent = agents.find(a => a.id === selectedAgentId);
    if (!selectedAgent) {
      setError('Please select an agent');
      return;
    }
    
    setIsRunning(true);
    setError(null);
    setOutput([]);
    setMetrics(null);
    
    try {
      const config: AgentConfig = {
        name: selectedAgent.name,
        systemPrompt: customPrompt || selectedAgent.system_prompt,
        task: task || selectedAgent.default_task || undefined,
        model: selectedAgent.model as 'opus' | 'sonnet' | 'haiku',
        createCheckpoint: true,
      };
      
      const runId = await agentExecutionService.executeAgent(sessionId, config);
      setCurrentRunId(runId);
      setOutput([`🤖 Starting ${selectedAgent.name}...`]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to execute agent');
      setIsRunning(false);
    }
  };
  
  const handleStop = async () => {
    if (currentRunId) {
      try {
        await agentExecutionService.stopAgent(currentRunId);
        setIsRunning(false);
        setOutput(prev => [...prev, '\n⏹️ Agent stopped']);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to stop agent');
      }
    }
  };
  
  const selectedAgent = agents.find(a => a.id === selectedAgentId);
  
  return (
    <div className="agent-executor-overlay">
      <div className="agent-executor">
        <div className="agent-header">
          <div className="agent-title">
            <IconRobot size={20} />
            <span>Agent Executor</span>
          </div>
          <button className="agent-close-btn" onClick={onClose}>
            <IconX size={16} />
          </button>
        </div>
        
        <div className="agent-content">
          <div className="agent-config">
            <div className="agent-template-selector">
              <label>Select Agent:</label>
              {isLoadingAgents ? (
                <div style={{ padding: '8px', color: 'rgba(255, 255, 255, 0.5)' }}>
                  Loading agents...
                </div>
              ) : agents.length === 0 ? (
                <div style={{ padding: '8px' }}>
                  <div style={{ color: 'rgba(255, 255, 255, 0.5)', marginBottom: '8px' }}>
                    No agents found. Would you like to load the default agents?
                  </div>
                  <button 
                    onClick={async () => {
                      try {
                        await invoke('load_default_agents');
                        // Reload agents
                        const agentList = await invoke<Agent[]>('list_agents');
                        setAgents(agentList);
                        if (agentList.length > 0) {
                          setSelectedAgentId(agentList[0].id || null);
                        }
                      } catch (err) {
                        setError('Failed to load default agents');
                      }
                    }}
                    style={{
                      padding: '4px 12px',
                      background: 'transparent',
                      border: '1px solid var(--accent-color)',
                      color: 'var(--accent-color)',
                      borderRadius: '4px',
                      fontSize: '10px',
                      cursor: 'pointer'
                    }}
                  >
                    Load Default Agents
                  </button>
                </div>
              ) : (
                <select 
                  value={selectedAgentId || ''}
                  onChange={(e) => setSelectedAgentId(Number(e.target.value))}
                  disabled={isRunning}
                >
                  <option value="">Select an agent...</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.icon} {agent.name} ({agent.model})
                    </option>
                  ))}
                </select>
              )}
            </div>
            
            <div className="agent-task-input">
              <label>Task (optional):</label>
              <textarea
                placeholder="Describe what you want the agent to do..."
                value={task}
                onChange={(e) => setTask(e.target.value)}
                disabled={isRunning}
                rows={3}
              />
            </div>
            
            <div className="agent-advanced-toggle">
              <button 
                onClick={() => setShowAdvanced(!showAdvanced)}
                disabled={isRunning}
              >
                <IconSettings size={14} />
                Advanced Settings
                {showAdvanced ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
              </button>
            </div>
            
            {showAdvanced && (
              <div className="agent-advanced">
                <label>Custom System Prompt (overrides agent prompt):</label>
                <textarea
                  placeholder={selectedAgent?.system_prompt || 'Enter custom system prompt...'}
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  disabled={isRunning}
                  rows={5}
                />
                {selectedAgent && (
                  <div style={{ marginTop: '8px', fontSize: '10px', color: 'rgba(255, 255, 255, 0.4)' }}>
                    Default prompt: {selectedAgent.system_prompt.substring(0, 100)}...
                  </div>
                )}
              </div>
            )}
          </div>
          
          <div className="agent-output" ref={outputRef}>
            {output.length === 0 ? (
              <div className="agent-output-empty">
                Agent output will appear here...
              </div>
            ) : (
              <pre>{output.join('\n')}</pre>
            )}
          </div>
          
          {metrics && (
            <div className="agent-metrics">
              <span>📝 {metrics.messagesProcessed} messages</span>
              <span>💰 {metrics.tokensUsed} tokens</span>
              <span>🔧 {metrics.toolsExecuted} tools</span>
              {metrics.errors > 0 && <span className="metric-error">⚠️ {metrics.errors} errors</span>}
            </div>
          )}
          
          {error && (
            <div className="agent-error">
              {error}
            </div>
          )}
        </div>
        
        <div className="agent-actions">
          {!isRunning ? (
            <button 
              className="agent-execute-btn"
              onClick={handleExecute}
            >
              <IconPlayerPlay size={16} />
              Execute Agent
            </button>
          ) : (
            <button 
              className="agent-stop-btn"
              onClick={handleStop}
            >
              <IconPlayerStop size={16} />
              Stop Agent
            </button>
          )}
        </div>
      </div>
    </div>
  );
};