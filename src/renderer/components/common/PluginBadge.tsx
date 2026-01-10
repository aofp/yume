// PluginBadge component - shows plugin source indicator
// Used in CommandAutocomplete, HooksTab, AgentsModal, MCPTab

import React from 'react';
import { IconPuzzle } from '@tabler/icons-react';
import './PluginBadge.css';

interface PluginBadgeProps {
  pluginName: string;
  size?: 'small' | 'medium';
}

export const PluginBadge: React.FC<PluginBadgeProps> = ({
  pluginName,
  size = 'small'
}) => {
  return (
    <span
      className={`plugin-badge ${size}`}
      title={`from plugin: ${pluginName}`}
    >
      <IconPuzzle size={size === 'small' ? 8 : 10} />
      {pluginName}
    </span>
  );
};

export default PluginBadge;
