import React from 'react';
import { Bot, Plus, Settings } from 'lucide-react';
import './AgentPanel.css';

const agents = [
  { id: '1', name: 'Code Reviewer', status: 'active' },
  { id: '2', name: 'Test Writer', status: 'inactive' },
  { id: '3', name: 'Documentation', status: 'active' },
];

export const AgentPanel: React.FC = () => {
  return (
    <div className="agent-panel">
      <div className="agent-header">
        <Bot size={16} />
        <span>Agents</span>
        <button className="agent-add">
          <Plus size={14} />
        </button>
      </div>

      <div className="agent-list">
        {agents.map((agent) => (
          <div key={agent.id} className="agent-item">
            <Bot size={16} />
            <span className="agent-name">{agent.name}</span>
            <span className={`agent-status ${agent.status}`}>
              {agent.status}
            </span>
            <button className="agent-settings">
              <Settings size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};