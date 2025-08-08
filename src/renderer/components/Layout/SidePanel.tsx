import React, { useState } from 'react';
import { 
  ChevronLeft, 
  CheckCircle, 
  Circle, 
  Clock,
  Plus,
  Trash2,
  FileText,
  Shield,
  Bot
} from 'lucide-react';
import { useStore } from '../../stores/useStore';
import { TodoPanel } from '../Panels/TodoPanel';
import { FilePanel } from '../Panels/FilePanel';
import { PermissionPanel } from '../Panels/PermissionPanel';
import { AgentPanel } from '../Panels/AgentPanel';
import './SidePanel.css';

interface SidePanelProps {
  isOpen: boolean;
  onToggle: () => void;
}

type PanelTab = 'todo' | 'files' | 'permissions' | 'agents';

export const SidePanel: React.FC<SidePanelProps> = ({ isOpen, onToggle }) => {
  const [activeTab, setActiveTab] = useState<PanelTab>('todo');

  const tabs = [
    { id: 'todo' as PanelTab, label: 'Todo', icon: <CheckCircle size={16} /> },
    { id: 'files' as PanelTab, label: 'Files', icon: <FileText size={16} /> },
    { id: 'permissions' as PanelTab, label: 'Permissions', icon: <Shield size={16} /> },
    { id: 'agents' as PanelTab, label: 'Agents', icon: <Bot size={16} /> },
  ];

  return (
    <div className={`sidepanel ${isOpen ? '' : 'collapsed'}`}>
      <div className="sidepanel-header">
        <div className="sidepanel-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`sidepanel-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
        
        <button className="sidepanel-toggle" onClick={onToggle}>
          <ChevronLeft size={16} />
        </button>
      </div>

      <div className="sidepanel-content">
        {activeTab === 'todo' && <TodoPanel />}
        {activeTab === 'files' && <FilePanel />}
        {activeTab === 'permissions' && <PermissionPanel />}
        {activeTab === 'agents' && <AgentPanel />}
      </div>
    </div>
  );
};