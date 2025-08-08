import React, { useState } from 'react';
import {
  IconFolder,
  IconHistory,
  IconChartDots3,
  IconFileText,
  IconChevronRight,
  IconChevronLeft
} from '@tabler/icons-react';
import { ProjectBrowser } from './ProjectBrowser';
import { SessionTimeline } from './SessionTimeline';
import { AnalyticsDashboard } from './AnalyticsDashboard';
import { ClaudeMdEditor } from './ClaudeMdEditor';
import './RightSidebar.css';

type TabType = 'timeline' | 'analytics';

interface Tab {
  id: TabType;
  icon: React.ReactNode;
  label: string;
}

const tabs: Tab[] = [
  { id: 'timeline', icon: <IconHistory size={16} stroke={1.5} />, label: 'timeline' },
  { id: 'analytics', icon: <IconChartDots3 size={16} stroke={1.5} />, label: 'analytics' }
];

export const RightSidebar: React.FC = () => {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('timeline');

  const renderContent = () => {
    switch (activeTab) {
      case 'timeline':
        return <SessionTimeline />;
      case 'analytics':
        return <AnalyticsDashboard />;
      default:
        return null;
    }
  };

  return (
    <div className={`right-sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      {!isCollapsed && (
        <>
          <div className="sidebar-header">
            <div className="sidebar-tabs">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  className={`sidebar-tab ${activeTab === tab.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                  title={tab.label}
                >
                  {tab.icon}
                  <span className="tab-label">{tab.label}</span>
                </button>
              ))}
            </div>
            <button
              className="sidebar-toggle"
              onClick={() => setIsCollapsed(!isCollapsed)}
              title="collapse sidebar"
            >
              <IconChevronRight size={16} />
            </button>
          </div>

          <div className="sidebar-content">
            {renderContent()}
          </div>
        </>
      )}
      
      {isCollapsed && (
        <button
          className="sidebar-toggle"
          onClick={() => setIsCollapsed(!isCollapsed)}
          title="expand sidebar"
        >
          <IconChevronLeft size={16} />
        </button>
      )}
    </div>
  );
};