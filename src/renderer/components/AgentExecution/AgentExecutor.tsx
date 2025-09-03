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
  IconX
} from '@tabler/icons-react';
import { agentExecutionService, AgentConfig } from '../../services/agentExecutionService';
import { FEATURE_FLAGS } from '../../config/features';
import './AgentExecutor.css';

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
  const [selectedTemplate, setSelectedTemplate] = useState<string>('codeReviewer');
  const [customPrompt, setCustomPrompt] = useState('');
  const [task, setTask] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [output, setOutput] = useState<string[]>([]);
  const [metrics, setMetrics] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  
  // Don't render if feature is disabled
  if (!FEATURE_FLAGS.ENABLE_AGENT_EXECUTION || !isOpen) {
    return null;
  }
  
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
  
  const handleExecute = async () => {
    setIsRunning(true);
    setError(null);
    setOutput([]);
    setMetrics(null);
    
    try {
      const template = (agentExecutionService.constructor as any).AGENT_TEMPLATES[selectedTemplate];
      
      const config: AgentConfig = {
        ...template,
        task: task || undefined,
        systemPrompt: customPrompt || template.systemPrompt,
      };
      
      const runId = await agentExecutionService.executeAgent(sessionId, config);
      setCurrentRunId(runId);
      setOutput([`🤖 Starting ${template.name}...`]);
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
  
  const templates = Object.entries((agentExecutionService.constructor as any).AGENT_TEMPLATES || {});
  const selectedTemplateData = (agentExecutionService.constructor as any).AGENT_TEMPLATES?.[selectedTemplate];
  
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
              <label>Select Agent Template:</label>
              <select 
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
                disabled={isRunning}
              >
                {templates.map(([key, template]) => (
                  <option key={key} value={key}>
                    {(template as any).name}
                  </option>
                ))}
              </select>
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
                <label>Custom System Prompt:</label>
                <textarea
                  placeholder={selectedTemplateData?.systemPrompt}
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  disabled={isRunning}
                  rows={5}
                />
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