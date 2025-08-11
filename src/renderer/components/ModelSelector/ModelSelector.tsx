import React, { useState, useRef, useEffect } from 'react';
import './ModelSelector.css';

const models = [
  { id: 'claude-opus-4-1-20250805', name: 'opus 4.1', description: 'most capable model' },
  { id: 'claude-sonnet-4-20250514', name: 'sonnet 4.0', description: 'fast & capable' },
];

interface ModelSelectorProps {
  value?: string;
  onChange?: (modelId: string) => void;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({ 
  value = 'claude-opus-4-1-20250805', 
  onChange 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isHighlighted, setIsHighlighted] = useState(false);
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

  // Listen for Ctrl+O to highlight the selector
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        setIsHighlighted(true);
        setTimeout(() => setIsHighlighted(false), 1000);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleModelSelect = (modelId: string) => {
    onChange?.(modelId);
    setIsOpen(false);
  };

  return (
    <div className="model-selector" ref={dropdownRef}>
      <button 
        className={`model-selector-trigger ${isHighlighted ? 'highlighted' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title="select model (ctrl+o)"
      >
        {selectedModel.name}
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