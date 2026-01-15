import React, { useState, useRef, useEffect } from 'react';
import { PROVIDERS, type ProviderType } from '../../config/models';
import { useEnabledProviders } from '../../hooks/useEnabledProviders';
import './ProviderSelector.css';

interface ProviderSelectorProps {
  value: ProviderType;
  onChange: (provider: ProviderType) => void;
  disabled?: boolean;
}

export const ProviderSelector: React.FC<ProviderSelectorProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Get enabled providers
  const enabledProviders = useEnabledProviders();
  const availableProviders = PROVIDERS.filter((p) => enabledProviders[p.id]);

  // If only one provider, don't show selector
  if (availableProviders.length <= 1) {
    return null;
  }

  const currentProvider = PROVIDERS.find((p) => p.id === value);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
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

  const handleSelect = (provider: ProviderType) => {
    onChange(provider);
    setIsOpen(false);
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        setIsOpen(!isOpen);
        break;
      case 'Escape':
        setIsOpen(false);
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          const currentIndex = availableProviders.findIndex((p) => p.id === value);
          const nextIndex = (currentIndex + 1) % availableProviders.length;
          handleSelect(availableProviders[nextIndex].id);
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          const currentIndex = availableProviders.findIndex((p) => p.id === value);
          const prevIndex =
            currentIndex === 0 ? availableProviders.length - 1 : currentIndex - 1;
          handleSelect(availableProviders[prevIndex].id);
        }
        break;
    }
  };

  return (
    <div
      ref={containerRef}
      className={`provider-selector ${disabled ? 'disabled' : ''}`}
      onKeyDown={handleKeyDown}
      tabIndex={disabled ? -1 : 0}
    >
      <button
        className="provider-selector-trigger"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        title={`provider: ${currentProvider?.name || value}`}
      >
        <span className="provider-icon">{getProviderIcon(value)}</span>
        <span className="provider-name">{currentProvider?.name || value}</span>
        <span className="provider-chevron">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className="provider-dropdown">
          {availableProviders.map((provider) => (
            <button
              key={provider.id}
              className={`provider-option ${provider.id === value ? 'selected' : ''}`}
              onClick={() => handleSelect(provider.id)}
            >
              <span className="provider-icon">{getProviderIcon(provider.id)}</span>
              <div className="provider-info">
                <span className="provider-option-name">{provider.name}</span>
                <span className="provider-option-desc">{provider.description}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

function getProviderIcon(provider: ProviderType): string {
  switch (provider) {
    case 'claude':
      return '◉';
    case 'gemini':
      return '◈';
    case 'openai':
      return '◎';
    default:
      return '○';
  }
}
