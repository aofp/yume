import React, { useState, useRef, useEffect } from 'react';
import { IconChevronDown } from '@tabler/icons-react';
import './ModelSelector.css';

const models = [
  { id: 'opus', name: 'opus', description: 'most capable model' },
  { id: 'sonnet', name: 'sonnet', description: 'fast & capable' },
];

interface ModelSelectorProps {
  value?: string;
  onChange?: (modelId: string) => void;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({ 
  value = 'opus', 
  onChange 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const selectedModel = models.find(m => m.id === value) || models[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleModelSelect = (modelId: string) => {
    onChange?.(modelId);
    setIsOpen(false);
  };

  return (
    <div className="model-selector" ref={dropdownRef}>
      <button 
        className="model-selector-trigger"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="model-selector-name">{selectedModel.name}</span>
        <IconChevronDown 
          size={12} 
          className={`model-selector-chevron ${isOpen ? 'open' : ''}`}
        />
      </button>
      
      {isOpen && (
        <div className="model-selector-dropdown">
          {models.map(model => (
            <button
              key={model.id}
              className={`model-selector-option ${model.id === value ? 'selected' : ''}`}
              onClick={() => handleModelSelect(model.id)}
            >
              <span className="model-option-name">{model.name}</span>
              <span className="model-option-description">{model.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};