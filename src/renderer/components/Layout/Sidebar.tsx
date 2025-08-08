import React, { useState } from 'react';
import { 
  MessageSquare, 
  FolderOpen, 
  Shield, 
  GitBranch, 
  Bot, 
  Brain,
  Layers,
  ChevronRight
} from 'lucide-react';
import './Sidebar.css';

interface SidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { id: 'sessions', label: 'Sessions', icon: <Layers size={20} /> },
  { id: 'chat', label: 'Chat', icon: <MessageSquare size={20} /> },
  { id: 'files', label: 'Files', icon: <FolderOpen size={20} /> },
  { id: 'tools', label: 'Tools', icon: <Shield size={20} /> },
  { id: 'git', label: 'Git', icon: <GitBranch size={20} /> },
  { id: 'agents', label: 'Agents', icon: <Bot size={20} /> },
  { id: 'memory', label: 'Memory', icon: <Brain size={20} /> },
];

export const Sidebar: React.FC<SidebarProps> = ({ activeView, onViewChange }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`sidebar ${expanded ? 'expanded' : ''}`}>
      <button 
        className="sidebar-toggle"
        onClick={() => setExpanded(!expanded)}
      >
        <ChevronRight size={16} className={expanded ? 'rotated' : ''} />
      </button>

      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`sidebar-item ${activeView === item.id ? 'active' : ''}`}
            onClick={() => onViewChange(item.id)}
            title={!expanded ? item.label : undefined}
          >
            <span className="sidebar-item-icon">{item.icon}</span>
            {expanded && (
              <span className="sidebar-item-label">{item.label}</span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
};