import React, { useState, useEffect, useRef } from 'react';
import { getModelsForSelector, DEFAULT_MODEL_ID } from '../../config/models';
import './ModelSelector.css';

// Get models from centralized config
const models = getModelsForSelector();

interface ModelSelectorProps {
  value?: string;
  onChange?: (modelId: string) => void;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  value,
  onChange
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

  // Toggle between sonnet and opus
  const toggleModel = () => {
    // Find current model index
    const currentIndex = models.findIndex(m => m.id === currentValue);
    // Cycle to next model (wrap around to start)
    const nextIndex = (currentIndex + 1) % models.length;
    const nextModel = models[nextIndex];
    onChange?.(nextModel.id);
  };


  return (
    <div className="model-selector">
      <button
        ref={buttonRef}
        className={`model-selector-trigger ${isHovered ? 'hovered' : ''}`}
        onClick={toggleModel}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        title={`toggle model (${modKey}+o)`}
      >
        {selectedModel.name}
      </button>
    </div>
  );
};