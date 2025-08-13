import React, { useState, useEffect } from 'react';
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
  const [isHighlighted, setIsHighlighted] = useState(false);
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  
  const selectedModel = models.find(m => m.id === value) || models[0];

  // Listen for Ctrl+O to highlight the selector
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        // Clear any existing timeout
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        
        setIsHighlighted(true);
        
        // Set timeout for exactly 1 second
        timeoutRef.current = setTimeout(() => {
          setIsHighlighted(false);
        }, 1000);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleToggle = () => {
    // Toggle between the two models
    const currentIndex = models.findIndex(m => m.id === value);
    const nextIndex = (currentIndex + 1) % models.length;
    onChange?.(models[nextIndex].id);
  };

  return (
    <div className="model-selector">
      <button 
        className={`model-selector-trigger ${isHighlighted ? 'highlighted' : ''}`}
        onClick={handleToggle}
        title="switch model (ctrl+o)"
      >
        {selectedModel.name}
      </button>
    </div>
  );
};