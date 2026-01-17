/**
 * TriggerEditor - Tag-based UI for skill triggers (extensions, keywords, regex)
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  IconX,
  IconPlus,
  IconAlertTriangle,
  IconCheck,
  IconFile,
  IconTag,
  IconCode,
} from '@tabler/icons-react';
import { validateRegexPattern, type RegexValidationResult } from '../../utils/regexValidator';
import type { SkillTriggers } from '../../types/skill';
import './TriggerEditor.css';

interface TriggerEditorProps {
  triggers: SkillTriggers;
  onChange: (triggers: SkillTriggers) => void;
  disabled?: boolean;
}

type TriggerType = 'extensions' | 'keywords' | 'patterns';

interface TagInputProps {
  type: TriggerType;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
  validateFn?: (value: string) => { valid: boolean; warning?: string };
}

const TagInput: React.FC<TagInputProps> = ({
  type,
  values,
  onChange,
  placeholder,
  icon,
  label,
  disabled,
  validateFn,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAdd = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    // Check for duplicates
    if (values.includes(trimmed)) {
      setError('already exists');
      return;
    }

    // Validate if function provided
    if (validateFn) {
      const result = validateFn(trimmed);
      if (!result.valid) {
        setError('invalid pattern');
        return;
      }
      if (result.warning) {
        setWarning(result.warning);
      }
    }

    onChange([...values, trimmed]);
    setInputValue('');
    setError(null);
    setWarning(null);
  }, [inputValue, values, onChange, validateFn]);

  const handleRemove = useCallback((index: number) => {
    const newValues = [...values];
    newValues.splice(index, 1);
    onChange(newValues);
  }, [values, onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    } else if (e.key === 'Backspace' && !inputValue && values.length > 0) {
      handleRemove(values.length - 1);
    } else if (e.key === 'Escape') {
      setInputValue('');
      setError(null);
      setWarning(null);
    }
  }, [inputValue, values, handleAdd, handleRemove]);

  // Validate on input change for patterns
  useEffect(() => {
    if (type === 'patterns' && inputValue) {
      const result = validateRegexPattern(inputValue);
      if (!result.isValid) {
        setError(result.error || 'invalid');
      } else if (result.hasRedosRisk) {
        setWarning(result.warning || 'potential performance issue');
        setError(null);
      } else {
        setError(null);
        setWarning(null);
      }
    } else {
      setError(null);
      setWarning(null);
    }
  }, [inputValue, type]);

  return (
    <div className={`tag-input-group ${disabled ? 'disabled' : ''}`}>
      <div className="tag-input-header">
        {icon}
        <span className="tag-input-label">{label}</span>
        <span className="tag-input-count">{values.length}</span>
      </div>
      <div className="tag-input-container">
        <div className="tag-list">
          {values.map((value, index) => (
            <span key={`${type}-${index}`} className="tag">
              <span className="tag-text">{value}</span>
              {!disabled && (
                <button
                  className="tag-remove"
                  onClick={() => handleRemove(index)}
                  title="remove"
                >
                  <IconX size={10} />
                </button>
              )}
            </span>
          ))}
        </div>
        {!disabled && (
          <div className="tag-input-wrapper">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={values.length === 0 ? placeholder : 'add more...'}
              className={`tag-input ${error ? 'error' : ''} ${warning ? 'warning' : ''}`}
            />
            {inputValue && (
              <button
                className="tag-add-btn"
                onClick={handleAdd}
                title="add (Enter)"
              >
                <IconPlus size={12} />
              </button>
            )}
          </div>
        )}
        {error && (
          <div className="tag-error">
            <IconAlertTriangle size={10} />
            <span>{error}</span>
          </div>
        )}
        {warning && !error && (
          <div className="tag-warning">
            <IconAlertTriangle size={10} />
            <span>{warning}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export const TriggerEditor: React.FC<TriggerEditorProps> = ({
  triggers,
  onChange,
  disabled = false,
}) => {
  const handleExtensionsChange = useCallback((extensions: string[]) => {
    onChange({ ...triggers, extensions });
  }, [triggers, onChange]);

  const handleKeywordsChange = useCallback((keywords: string[]) => {
    onChange({ ...triggers, keywords });
  }, [triggers, onChange]);

  const handlePatternsChange = useCallback((patterns: string[]) => {
    onChange({ ...triggers, patterns });
  }, [triggers, onChange]);

  const handleMatchModeChange = useCallback((matchMode: 'any' | 'all') => {
    onChange({ ...triggers, matchMode });
  }, [triggers, onChange]);

  const validatePattern = useCallback((pattern: string): { valid: boolean; warning?: string } => {
    const result = validateRegexPattern(pattern);
    return {
      valid: result.isValid,
      warning: result.warning,
    };
  }, []);

  const totalTriggers = triggers.extensions.length + triggers.keywords.length + triggers.patterns.length;

  return (
    <div className="trigger-editor">
      <div className="trigger-editor-header">
        <span className="trigger-editor-title">triggers</span>
        {totalTriggers > 0 && (
          <span className="trigger-editor-total">{totalTriggers} configured</span>
        )}
      </div>

      <div className="trigger-inputs">
        <TagInput
          type="extensions"
          values={triggers.extensions}
          onChange={handleExtensionsChange}
          placeholder="*.py, *.tsx, test_*.py"
          icon={<IconFile size={12} />}
          label="file patterns"
          disabled={disabled}
        />

        <TagInput
          type="keywords"
          values={triggers.keywords}
          onChange={handleKeywordsChange}
          placeholder="python, react, testing"
          icon={<IconTag size={12} />}
          label="keywords"
          disabled={disabled}
        />

        <TagInput
          type="patterns"
          values={triggers.patterns}
          onChange={handlePatternsChange}
          placeholder="/^import.*react/, /def test_/"
          icon={<IconCode size={12} />}
          label="regex patterns"
          disabled={disabled}
          validateFn={validatePattern}
        />
      </div>

      <div className="trigger-match-mode">
        <span className="match-mode-label">match mode:</span>
        <div className="match-mode-options">
          <button
            className={`match-mode-btn ${triggers.matchMode === 'any' ? 'active' : ''}`}
            onClick={() => handleMatchModeChange('any')}
            disabled={disabled}
          >
            <IconCheck size={10} />
            any (OR)
          </button>
          <button
            className={`match-mode-btn ${triggers.matchMode === 'all' ? 'active' : ''}`}
            onClick={() => handleMatchModeChange('all')}
            disabled={disabled}
          >
            <IconCheck size={10} />
            all (AND)
          </button>
        </div>
      </div>

      {totalTriggers === 0 && !disabled && (
        <div className="trigger-hint">
          add at least one trigger for this skill to activate
        </div>
      )}
    </div>
  );
};

export default TriggerEditor;
