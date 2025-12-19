import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { IconChevronUp } from '@tabler/icons-react';
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
  const [isHighlighted, setIsHighlighted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
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
  useLayoutEffect(() => {
    if (isOpen && buttonRef.current) {
      const buttonRect = buttonRef.current.getBoundingClientRect();
      // Position above button with 8px gap, but ensure it stays on screen
      const estimatedDropdownHeight = 100;
      let top = buttonRect.top - estimatedDropdownHeight - 8;
      // Ensure dropdown doesn't go above viewport
      if (top < 8) top = 8;
      setDropdownPosition({
        top,
        left: buttonRect.left
      });
    }
  }, [isOpen]);

  // Refine position after dropdown renders
  useEffect(() => {
    if (isOpen && buttonRef.current && dropdownRef.current) {
      const buttonRect = buttonRef.current.getBoundingClientRect();
      const dropdownHeight = dropdownRef.current.offsetHeight;
      let top = buttonRect.top - dropdownHeight - 8;
      // Ensure dropdown doesn't go above viewport
      if (top < 8) top = 8;
      setDropdownPosition({
        top,
        left: buttonRect.left
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
          className="model-dropdown"
        >
          {models.map(model => (
            <div
              key={model.id}
              className={`model-option ${model.id === currentValue ? 'selected' : ''}`}
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