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
  // Platform detection for keyboard shortcuts
  const isMac = navigator.platform.toLowerCase().includes('mac');
  const modKey = isMac ? 'cmd' : 'ctrl';

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

  // Listen for Ctrl+O to cycle through models directly
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault(); // Prevent default browser behavior

        // Clear any existing timeout
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }

        // Find current model index
        const currentIndex = models.findIndex(m => m.id === currentValue);
        // Cycle to next model (wrap around to start)
        const nextIndex = (currentIndex + 1) % models.length;
        const nextModel = models[nextIndex];

        // Switch to next model
        onChange?.(nextModel.id);

        // Remove focus from button to prevent stuck hover state
        if (buttonRef.current) {
          buttonRef.current.blur();
        }

        // Highlight to show the change
        setIsHighlighted(true);

        // Set timeout for exactly 1 second
        timeoutRef.current = setTimeout(() => {
          setIsHighlighted(false);
          timeoutRef.current = null;
        }, 1000);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [currentValue, onChange]);

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
        title={`cycle models (${modKey}+o)`}
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