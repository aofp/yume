import React, { useState, useEffect, useRef } from 'react';
import { IconChevronUp } from '@tabler/icons-react';
import './ModelSelector.css';

const models = [
  { id: 'claude-opus-4-1-20250805', name: 'opus 4.1', description: 'most capable model' },
  { id: 'claude-sonnet-4-5-20250929', name: 'sonnet 4.5', description: 'fastest model' },
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
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const selectedModel = models.find(m => m.id === value) || models[0];

  // Listen for Ctrl+O to highlight the selector and open dropdown
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        // Clear any existing timeout
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        setIsHighlighted(true);
        setIsOpen(prev => !prev); // Toggle dropdown

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

  // Calculate dropdown position when opening
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.top - 8, // 8px gap above button
        left: rect.left
      });
    }
  }, [isOpen]);

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
          buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
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

  const handleSelectModel = (modelId: string) => {
    onChange?.(modelId);
    setIsOpen(false);
  };

  return (
    <div className="model-selector">
      <button
        ref={buttonRef}
        className={`model-selector-trigger ${isHighlighted ? 'highlighted' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title="switch model (ctrl+o)"
      >
        {selectedModel.name}
        <IconChevronUp size={12} className="chevron-up" />
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          className="model-dropdown model-dropdown-fixed"
          style={{
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`
          }}
        >
          {models.map(model => (
            <div
              key={model.id}
              className={`model-option ${model.id === value ? 'selected' : ''}`}
              onClick={() => handleSelectModel(model.id)}
            >
              <div className="model-name">{model.name}</div>
              <div className="model-description">{model.description}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};