import React, { useEffect, useCallback, useRef, useState, useMemo } from 'react';
import { IconX } from '@tabler/icons-react';
import { getModelsForSelector } from '../../config/models';
import {
  ALL_TOOLS,
  getToolsByCategory,
  saveEnabledTools,
  ToolDefinition
} from '../../config/tools';
import './ModelToolsModal.css';

const models = getModelsForSelector();

interface ModelToolsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedModel: string;
  onModelChange: (modelId: string) => void;
  enabledTools: string[];
  onToolsChange: (tools: string[]) => void;
  openedViaKeyboard?: boolean;
}

export const ModelToolsModal: React.FC<ModelToolsModalProps> = ({
  isOpen,
  onClose,
  selectedModel,
  onModelChange,
  enabledTools,
  onToolsChange,
  openedViaKeyboard = false,
}) => {
  const toolsByCategory = getToolsByCategory();
  const modelRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const toggleAllRef = useRef<HTMLButtonElement | null>(null);
  const toolRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());
  const [focusedModelIndex, setFocusedModelIndex] = useState(-1);
  const [focusedToggleAll, setFocusedToggleAll] = useState(false);
  const [focusedToolId, setFocusedToolId] = useState<string | null>(null);
  const [isKeyboardNav, setIsKeyboardNav] = useState(true); // start true since we auto-focus

  // Build flat tool list matching visual layout order
  const flatToolList = useMemo(() => {
    const list: ToolDefinition[] = [];
    // Row 1: file-read + file-write
    list.push(...toolsByCategory['file-read']);
    list.push(...toolsByCategory['file-write']);
    // Row 2: web + terminal
    list.push(...toolsByCategory.web);
    list.push(...toolsByCategory.terminal);
    // Row 3: other + agents
    list.push(...toolsByCategory.other);
    list.push(...toolsByCategory.agents);
    return list;
  }, [toolsByCategory]);

  // Focus the selected model on open (only if opened via keyboard)
  useEffect(() => {
    if (isOpen) {
      const selectedIndex = models.findIndex(m => m.id === selectedModel);
      setFocusedModelIndex(selectedIndex >= 0 ? selectedIndex : 0);
      setFocusedToggleAll(false);
      setFocusedToolId(null);
      setIsKeyboardNav(openedViaKeyboard);
      // Only auto-focus if opened via keyboard
      if (openedViaKeyboard) {
        setTimeout(() => {
          modelRefs.current[selectedIndex >= 0 ? selectedIndex : 0]?.focus();
        }, 10);
      }
    }
  }, [isOpen, selectedModel, openedViaKeyboard]);

  // Track keyboard vs mouse navigation
  const handleMouseDown = useCallback(() => {
    setIsKeyboardNav(false);
  }, []);

  const handleKeyDownGlobal = useCallback((e: React.KeyboardEvent) => {
    // Enable keyboard nav mode on any key press
    if (!isKeyboardNav) {
      setIsKeyboardNav(true);
    }
    // If arrow key pressed and nothing focused, focus first model
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) {
      if (focusedModelIndex === -1 && !focusedToggleAll && !focusedToolId) {
        e.preventDefault();
        const selectedIndex = models.findIndex(m => m.id === selectedModel);
        setFocusedModelIndex(selectedIndex >= 0 ? selectedIndex : 0);
        modelRefs.current[selectedIndex >= 0 ? selectedIndex : 0]?.focus();
      }
    }
  }, [isKeyboardNav, focusedModelIndex, focusedToggleAll, focusedToolId, selectedModel]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose]);

  // Handle keyboard navigation for models
  const handleModelKeyDown = useCallback((e: React.KeyboardEvent, index: number) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const newIndex = e.key === 'ArrowLeft'
        ? (index - 1 + models.length) % models.length
        : (index + 1) % models.length;
      setFocusedModelIndex(newIndex);
      modelRefs.current[newIndex]?.focus();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      onModelChange(models[index].id);
      onClose();
    } else if (e.key === 'ArrowDown' || e.key === 'Tab') {
      // Move to toggle-all button
      e.preventDefault();
      setFocusedModelIndex(-1);
      setFocusedToggleAll(true);
      toggleAllRef.current?.focus();
    }
  }, [onModelChange, onClose]);

  const toggleAll = useCallback(() => {
    const allToolIds = ALL_TOOLS.map(t => t.id);
    const newTools = enabledTools.length === allToolIds.length ? [] : allToolIds;
    onToolsChange(newTools);
    saveEnabledTools(newTools);
  }, [enabledTools, onToolsChange]);

  // Handle keyboard navigation for toggle-all button
  const handleToggleAllKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
      // Go back to models
      e.preventDefault();
      const modelIdx = models.findIndex(m => m.id === selectedModel);
      setFocusedToggleAll(false);
      setFocusedModelIndex(modelIdx >= 0 ? modelIdx : 0);
      modelRefs.current[modelIdx >= 0 ? modelIdx : 0]?.focus();
    } else if (e.key === 'ArrowDown' || e.key === 'Tab') {
      // Move to tools
      e.preventDefault();
      if (flatToolList.length > 0) {
        setFocusedToggleAll(false);
        setFocusedToolId(flatToolList[0].id);
        toolRefs.current.get(flatToolList[0].id)?.focus();
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleAll();
    }
  }, [selectedModel, flatToolList, toggleAll]);

  // Handle keyboard navigation for tools
  const handleToolKeyDown = useCallback((e: React.KeyboardEvent, toolId: string) => {
    const currentIndex = flatToolList.findIndex(t => t.id === toolId);
    if (currentIndex === -1) return;

    if (e.key === 'ArrowRight' || e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey && e.key === 'Tab') {
        // Shift+Tab goes back
        if (currentIndex === 0) {
          // Go back to toggle-all
          setFocusedToolId(null);
          setFocusedToggleAll(true);
          toggleAllRef.current?.focus();
        } else {
          const prevTool = flatToolList[currentIndex - 1];
          setFocusedToolId(prevTool.id);
          toolRefs.current.get(prevTool.id)?.focus();
        }
      } else {
        // Forward navigation
        if (currentIndex < flatToolList.length - 1) {
          const nextTool = flatToolList[currentIndex + 1];
          setFocusedToolId(nextTool.id);
          toolRefs.current.get(nextTool.id)?.focus();
        }
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (currentIndex > 0) {
        const prevTool = flatToolList[currentIndex - 1];
        setFocusedToolId(prevTool.id);
        toolRefs.current.get(prevTool.id)?.focus();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (currentIndex === 0) {
        // Go back to toggle-all
        setFocusedToolId(null);
        setFocusedToggleAll(true);
        toggleAllRef.current?.focus();
      } else {
        // Move up by roughly a row (~6 items per row: 3 read + 3 write, etc)
        const step = 6;
        const newIndex = Math.max(0, currentIndex - step);
        const prevTool = flatToolList[newIndex];
        setFocusedToolId(prevTool.id);
        toolRefs.current.get(prevTool.id)?.focus();
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      // Move down by roughly a row
      const step = 6;
      const newIndex = Math.min(flatToolList.length - 1, currentIndex + step);
      const nextTool = flatToolList[newIndex];
      setFocusedToolId(nextTool.id);
      toolRefs.current.get(nextTool.id)?.focus();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      // Toggle inline to avoid dependency issues
      const newTools = enabledTools.includes(toolId)
        ? enabledTools.filter(t => t !== toolId)
        : [...enabledTools, toolId];
      onToolsChange(newTools);
      saveEnabledTools(newTools);
    }
  }, [flatToolList, selectedModel, enabledTools, onToolsChange]);

  const toggleTool = useCallback((toolId: string) => {
    const newTools = enabledTools.includes(toolId)
      ? enabledTools.filter(t => t !== toolId)
      : [...enabledTools, toolId];
    onToolsChange(newTools);
    saveEnabledTools(newTools);
  }, [enabledTools, onToolsChange]);

  if (!isOpen) return null;

  return (
    <div className="mt-modal-overlay" onClick={onClose}>
      <div
        className={`mt-modal ${isKeyboardNav ? 'keyboard-nav' : ''}`}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={handleMouseDown}
        onKeyDown={handleKeyDownGlobal}
      >
        <div className="mt-header">
          <h3>model & tools</h3>
          <button className="mt-close" onClick={onClose}>
            <IconX size={14} />
          </button>
        </div>

        <div className="mt-content">
          {/* Models - 2 column buttons */}
          <div className="mt-models-row" role="group" aria-label="Model selection">
            {models.map((model, index) => (
              <button
                key={model.id}
                ref={el => modelRefs.current[index] = el}
                className={`mt-model-btn ${selectedModel === model.id ? 'selected' : ''} ${focusedModelIndex === index ? 'focused' : ''}`}
                onClick={() => onModelChange(model.id)}
                onKeyDown={(e) => handleModelKeyDown(e, index)}
                tabIndex={focusedModelIndex === index ? 0 : -1}
              >
                {model.name}
              </button>
            ))}
          </div>

          <hr className="mt-divider" />

          {/* Tools */}
          <div className="mt-section">
            <div className="mt-tools-header">
              <span className="mt-label">tools ({enabledTools.length}/{ALL_TOOLS.length})</span>
              <button
                ref={toggleAllRef}
                className="mt-toggle-all"
                onClick={toggleAll}
                onKeyDown={handleToggleAllKeyDown}
                tabIndex={focusedToggleAll ? 0 : -1}
              >
                {enabledTools.length === ALL_TOOLS.length ? 'none' : 'all'}
              </button>
            </div>

            {/* File read + File write - 2 columns */}
            <div className="mt-category-row">
              {toolsByCategory['file-read'].length > 0 && (
                <div className="mt-category mt-category-half">
                  <div className="mt-category-name">read</div>
                  <div className="mt-tools-grid">
                    {toolsByCategory['file-read'].map(tool => (
                      <button
                        key={tool.id}
                        ref={el => toolRefs.current.set(tool.id, el)}
                        className={`mt-tool ${enabledTools.includes(tool.id) ? 'enabled' : ''}`}
                        onClick={() => toggleTool(tool.id)}
                        onKeyDown={(e) => handleToolKeyDown(e, tool.id)}
                        tabIndex={focusedToolId === tool.id ? 0 : -1}
                        title={tool.description}
                      >
                        {tool.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {toolsByCategory['file-write'].length > 0 && (
                <div className="mt-category mt-category-half">
                  <div className="mt-category-name">write</div>
                  <div className="mt-tools-grid">
                    {toolsByCategory['file-write'].map(tool => (
                      <button
                        key={tool.id}
                        ref={el => toolRefs.current.set(tool.id, el)}
                        className={`mt-tool ${enabledTools.includes(tool.id) ? 'enabled' : ''}`}
                        onClick={() => toggleTool(tool.id)}
                        onKeyDown={(e) => handleToolKeyDown(e, tool.id)}
                        tabIndex={focusedToolId === tool.id ? 0 : -1}
                        title={tool.description}
                      >
                        {tool.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Web + Terminal - 2 columns */}
            <div className="mt-category-row">
              {toolsByCategory.web.length > 0 && (
                <div className="mt-category mt-category-half">
                  <div className="mt-category-name">web</div>
                  <div className="mt-tools-grid">
                    {toolsByCategory.web.map(tool => (
                      <button
                        key={tool.id}
                        ref={el => toolRefs.current.set(tool.id, el)}
                        className={`mt-tool ${enabledTools.includes(tool.id) ? 'enabled' : ''}`}
                        onClick={() => toggleTool(tool.id)}
                        onKeyDown={(e) => handleToolKeyDown(e, tool.id)}
                        tabIndex={focusedToolId === tool.id ? 0 : -1}
                        title={tool.description}
                      >
                        {tool.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {toolsByCategory.terminal.length > 0 && (
                <div className="mt-category mt-category-half">
                  <div className="mt-category-name">terminal</div>
                  <div className="mt-tools-grid">
                    {toolsByCategory.terminal.map(tool => (
                      <button
                        key={tool.id}
                        ref={el => toolRefs.current.set(tool.id, el)}
                        className={`mt-tool ${enabledTools.includes(tool.id) ? 'enabled' : ''}`}
                        onClick={() => toggleTool(tool.id)}
                        onKeyDown={(e) => handleToolKeyDown(e, tool.id)}
                        tabIndex={focusedToolId === tool.id ? 0 : -1}
                        title={tool.description}
                      >
                        {tool.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Other + Agents - 2 columns */}
            <div className="mt-category-row">
              {toolsByCategory.other.length > 0 && (
                <div className="mt-category mt-category-half">
                  <div className="mt-category-name">other</div>
                  <div className="mt-tools-grid">
                    {toolsByCategory.other.map(tool => (
                      <button
                        key={tool.id}
                        ref={el => toolRefs.current.set(tool.id, el)}
                        className={`mt-tool ${enabledTools.includes(tool.id) ? 'enabled' : ''}`}
                        onClick={() => toggleTool(tool.id)}
                        onKeyDown={(e) => handleToolKeyDown(e, tool.id)}
                        tabIndex={focusedToolId === tool.id ? 0 : -1}
                        title={tool.description}
                      >
                        {tool.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {toolsByCategory.agents.length > 0 && (
                <div className="mt-category mt-category-half">
                  <div className="mt-category-name">agents</div>
                  <div className="mt-tools-grid">
                    {toolsByCategory.agents.map(tool => (
                      <button
                        key={tool.id}
                        ref={el => toolRefs.current.set(tool.id, el)}
                        className={`mt-tool ${enabledTools.includes(tool.id) ? 'enabled' : ''}`}
                        onClick={() => toggleTool(tool.id)}
                        onKeyDown={(e) => handleToolKeyDown(e, tool.id)}
                        tabIndex={focusedToolId === tool.id ? 0 : -1}
                        title={tool.description}
                      >
                        {tool.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
