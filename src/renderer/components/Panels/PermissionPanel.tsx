import React from 'react';
import { Shield, Check, X } from 'lucide-react';
import { useStore } from '../../stores/useStore';
import './PermissionPanel.css';

const tools = [
  { id: 'edit', name: 'Edit Files' },
  { id: 'read', name: 'Read Files' },
  { id: 'write', name: 'Write Files' },
  { id: 'bash', name: 'Run Commands' },
  { id: 'web', name: 'Web Access' },
];

export const PermissionPanel: React.FC = () => {
  const { permissions, setPermission } = useStore();

  return (
    <div className="permission-panel">
      <div className="permission-header">
        <Shield size={16} />
        <span>Tool Permissions</span>
      </div>

      <div className="permission-list">
        {tools.map((tool) => (
          <div key={tool.id} className="permission-item">
            <span className="permission-name">{tool.name}</span>
            <div className="permission-toggle">
              <button
                className={permissions[tool.id] === 'allow' ? 'active allow' : ''}
                onClick={() => setPermission(tool.id, 'allow')}
              >
                <Check size={14} />
              </button>
              <button
                className={permissions[tool.id] === 'deny' ? 'active deny' : ''}
                onClick={() => setPermission(tool.id, 'deny')}
              >
                <X size={14} />
              </button>
              <button
                className={permissions[tool.id] === 'ask' || !permissions[tool.id] ? 'active' : ''}
                onClick={() => setPermission(tool.id, 'ask')}
              >
                Ask
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};