import React, { useState, useEffect, useRef } from 'react';
import { getModelsForSelector, DEFAULT_MODEL_ID } from '../../config/models';
import './ModelSelector.css';

// Get models from centralized config
const models = getModelsForSelector();

interface ModelSelectorProps {
  value?: string;
  onChange?: (modelId: string) => void;
  toolCount?: number; // Number of enabled tools
  onOpenModal?: () => void; // Opens the model/tools modal
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  value,
  onChange,
  toolCount,
  onOpenModal
}) => {
  // Platform detection for keyboard shortcuts
  const isMac = navigator.platform.toLowerCase().includes('mac');
  const modKey = isMac ? 'cmd' : 'ctrl';

  const [isHovered, setIsHovered] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Find selected model - default to DEFAULT_MODEL_ID if value doesn't match any model
  const currentValue = value || DEFAULT_MODEL_ID;
  const selectedModel = models.find(m => m.id === currentValue) || models[0];

  // Ensure store is updated if value was invalid
  useEffect(() => {
    if (value && !models.find(m => m.id === value)) {
      onChange?.(DEFAULT_MODEL_ID);
    }
  }, [value, onChange]);

  // Click opens modal instead of toggling
  const handleClick = () => {
    if (onOpenModal) {
      onOpenModal();
    } else {
      // Fallback: toggle between sonnet and opus
      const currentIndex = models.findIndex(m => m.id === currentValue);
      const nextIndex = (currentIndex + 1) % models.length;
      onChange?.(models[nextIndex].id);
    }
  };

  // Right-click toggles model directly
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const currentIndex = models.findIndex(m => m.id === currentValue);
    const nextIndex = (currentIndex + 1) % models.length;
    onChange?.(models[nextIndex].id);
  };

  return (
    <div className="model-selector">
      <button
        ref={buttonRef}
        className={`model-selector-trigger ${isHovered ? 'hovered' : ''}`}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        title={`${modKey}+o or rmb toggle model • ${modKey}+shift+o model & tools`}
      >
        <span className="model-selector-text">{selectedModel.name}</span>
        {toolCount !== undefined && (
          <span className="model-selector-tools">[{toolCount}]</span>
        )}
      </button>
    </div>
  );
};
