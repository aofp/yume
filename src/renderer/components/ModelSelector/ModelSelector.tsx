import React, { useState } from 'react';
import {
  getModelsForProvider,
  PROVIDERS,
  getProviderForModel,
  DEFAULT_MODEL_ID,
} from '../../config/models';
import { useEnabledProviders } from '../../hooks/useEnabledProviders';
import './ModelSelector.css';

interface ModelSelectorProps {
  value?: string;
  onChange?: (modelId: string) => void;
  toolCount?: number;
  onOpenModal?: () => void;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  value,
  onChange,
  toolCount,
  onOpenModal,
}) => {
  const isMac = navigator.platform.toLowerCase().includes('mac');
  const modKey = isMac ? 'cmd' : 'ctrl';

  const [isHovered, setIsHovered] = useState(false);

  const currentValue = value || DEFAULT_MODEL_ID;
  const currentProvider = getProviderForModel(currentValue);
  const enabledProviders = useEnabledProviders();

  // Get all enabled providers with their models
  const providerGroups = PROVIDERS.filter((p) => enabledProviders[p.id]).map((provider) => ({
    provider,
    models: getModelsForProvider(provider.id),
  }));

  // Find current model info
  const allModels = providerGroups.flatMap((g) => g.models);
  const selectedModel = allModels.find((m) => m.id === currentValue) || allModels[0];

  // Click opens the modal
  const handleTriggerClick = () => {
    onOpenModal?.();
  };

  // Right-click cycles through models
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const currentIndex = allModels.findIndex((m) => m.id === currentValue);
    const nextIndex = (currentIndex + 1) % allModels.length;
    onChange?.(allModels[nextIndex].id);
  };

  return (
    <div className="model-selector">
      <button
        className={`model-selector-trigger ${isHovered ? 'hovered' : ''}`}
        onClick={handleTriggerClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        title={`${modKey}+shift+o cycle model • click to select`}
      >
        <span className="model-selector-text">{selectedModel?.shortDisplayName || 'select model'}</span>
        {toolCount !== undefined && <span className="model-selector-tools">{toolCount}</span>}
      </button>
    </div>
  );
};
