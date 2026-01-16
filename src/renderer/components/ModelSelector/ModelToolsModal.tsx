import React, { useEffect, useCallback, useRef, useState, useMemo } from 'react';
import { IconX, IconTool, IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { ALL_MODELS, PROVIDERS, type ProviderType } from '../../config/models';
import {
  ALL_TOOLS,
  getToolsByCategory,
  saveEnabledTools,
  ToolDefinition
} from '../../config/tools';
import { useEnabledProviders } from '../../hooks/useEnabledProviders';
import './ModelToolsModal.css';

interface ModelToolsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedModel: string;
  onModelChange: (modelId: string) => void;
  enabledTools: string[];
  onToolsChange: (tools: string[]) => void;
  openedViaKeyboard?: boolean;
  lockedProvider?: 'claude' | 'gemini' | 'openai' | null; // Lock to provider when session has messages
}

export const ModelToolsModal: React.FC<ModelToolsModalProps> = ({
  isOpen,
  onClose,
  selectedModel,
  onModelChange,
  enabledTools,
  onToolsChange,
  openedViaKeyboard = false,
  lockedProvider = null,
}) => {
  const toolsByCategory = getToolsByCategory();
  const modelRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const toggleAllRef = useRef<HTMLButtonElement | null>(null);
  const toolRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());
  const [focusedModelIndex, setFocusedModelIndex] = useState(-1);
  const [focusedToggleAll, setFocusedToggleAll] = useState(false);
  const [focusedToolId, setFocusedToolId] = useState<string | null>(null);
  const [isKeyboardNav, setIsKeyboardNav] = useState(true);
  const [toolsExpanded, setToolsExpanded] = useState(false);
  const [collapsedProviders, setCollapsedProviders] = useState<Set<ProviderType>>(new Set());
  const enabledProviders = useEnabledProviders();

  // Check if ALL tools in category are enabled
  const isCategoryAllActive = useCallback((categoryKey: string) => {
    const categoryTools = toolsByCategory[categoryKey as keyof typeof toolsByCategory] || [];
    return categoryTools.length > 0 && categoryTools.every(t => enabledTools.includes(t.id));
  }, [toolsByCategory, enabledTools]);

  // All models displayed at once (filtered by lockedProvider if set, or by enabled providers)
  // Also include the currently selected model even if its provider is disabled
  const displayModels = useMemo(() => {
    let models = lockedProvider
      ? ALL_MODELS.filter(m => m.provider === lockedProvider)
      : ALL_MODELS.filter(m => enabledProviders[m.provider] || m.id === selectedModel);
    return models.map(m => ({
      id: m.id,
      name: m.displayName,
      description: m.description,
      provider: m.provider
    }));
  }, [lockedProvider, enabledProviders, selectedModel]);

  // Build flat tool list matching visual layout order
  const flatToolList = useMemo(() => {
    const list: ToolDefinition[] = [];
    list.push(...toolsByCategory['file-read']);
    list.push(...toolsByCategory['file-write']);
    list.push(...toolsByCategory.web);
    list.push(...toolsByCategory.terminal);
    list.push(...toolsByCategory.other);
    list.push(...toolsByCategory.agents);
    return list;
  }, [toolsByCategory]);

  // Row boundaries for navigation
  const rowInfo = useMemo(() => {
    const fr = toolsByCategory['file-read'].length;
    const fw = toolsByCategory['file-write'].length;
    const wb = toolsByCategory.web.length;
    const tm = toolsByCategory.terminal.length;
    const ot = toolsByCategory.other.length;
    const ag = toolsByCategory.agents.length;
    return [
      { start: 0, leftEnd: fr, rightStart: fr, end: fr + fw },           // row 0
      { start: fr + fw, leftEnd: fr + fw + wb, rightStart: fr + fw + wb, end: fr + fw + wb + tm }, // row 1
      { start: fr + fw + wb + tm, leftEnd: fr + fw + wb + tm + ot, rightStart: fr + fw + wb + tm + ot, end: fr + fw + wb + tm + ot + ag }, // row 2
    ];
  }, [toolsByCategory]);

  // Focus the selected model on open (only if opened via keyboard)
  useEffect(() => {
    if (isOpen) {
      const selectedIndex = displayModels.findIndex(m => m.id === selectedModel);
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
  }, [isOpen, selectedModel, openedViaKeyboard, displayModels]);

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
        const selectedIndex = displayModels.findIndex(m => m.id === selectedModel);
        setFocusedModelIndex(selectedIndex >= 0 ? selectedIndex : 0);
        modelRefs.current[selectedIndex >= 0 ? selectedIndex : 0]?.focus();
      }
    }
  }, [isKeyboardNav, focusedModelIndex, focusedToggleAll, focusedToolId, selectedModel, displayModels]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      // Handle arrow keys to start keyboard nav when modal is open but nothing focused
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        // Check if something inside the modal already has focus
        const modalEl = document.querySelector('.mt-modal');
        const activeEl = document.activeElement;
        if (modalEl && activeEl && modalEl.contains(activeEl) && activeEl !== modalEl) {
          // Let the element-level handlers deal with it
          return;
        }
        // Nothing focused in modal - start keyboard nav
        e.preventDefault();
        e.stopPropagation();
        setIsKeyboardNav(true);
        const selectedIndex = displayModels.findIndex(m => m.id === selectedModel);
        const targetIndex = selectedIndex >= 0 ? selectedIndex : 0;
        setFocusedModelIndex(targetIndex);
        setFocusedToggleAll(false);
        setFocusedToolId(null);
        modelRefs.current[targetIndex]?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose, selectedModel, displayModels]);

  // Handle keyboard navigation for models
  const handleModelKeyDown = useCallback((e: React.KeyboardEvent, index: number) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const newIndex = e.key === 'ArrowLeft'
        ? (index - 1 + displayModels.length) % displayModels.length
        : (index + 1) % displayModels.length;
      setFocusedModelIndex(newIndex);
      modelRefs.current[newIndex]?.focus();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      onModelChange(displayModels[index].id);
      onClose();
    } else if (e.key === 'ArrowDown' || e.key === 'Tab') {
      // Move to toggle-all button
      e.preventDefault();
      setFocusedModelIndex(-1);
      setFocusedToggleAll(true);
      toggleAllRef.current?.focus();
    }
  }, [onModelChange, onClose, displayModels]);

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
      const modelIdx = displayModels.findIndex(m => m.id === selectedModel);
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
  }, [selectedModel, flatToolList, toggleAll, displayModels]);

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
      // Find current row and position within row
      let currentRow = 0;
      for (let r = 0; r < rowInfo.length; r++) {
        if (currentIndex >= rowInfo[r].start && currentIndex < rowInfo[r].end) {
          currentRow = r;
          break;
        }
      }
      const row = rowInfo[currentRow];
      const isInLeftColumn = currentIndex < row.leftEnd;
      const posInColumn = isInLeftColumn ? currentIndex - row.start : currentIndex - row.rightStart;

      if (currentRow === 0) {
        // Go back to toggle-all
        setFocusedToolId(null);
        setFocusedToggleAll(true);
        toggleAllRef.current?.focus();
      } else {
        // Go to same column in prev row
        const prevRow = rowInfo[currentRow - 1];
        let newIndex: number;
        if (isInLeftColumn) {
          const leftSize = prevRow.leftEnd - prevRow.start;
          newIndex = prevRow.start + Math.min(posInColumn, leftSize - 1);
        } else {
          const rightSize = prevRow.end - prevRow.rightStart;
          newIndex = prevRow.rightStart + Math.min(posInColumn, rightSize - 1);
        }
        const prevTool = flatToolList[newIndex];
        setFocusedToolId(prevTool.id);
        toolRefs.current.get(prevTool.id)?.focus();
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      // Find current row and position within row
      let currentRow = 0;
      for (let r = 0; r < rowInfo.length; r++) {
        if (currentIndex >= rowInfo[r].start && currentIndex < rowInfo[r].end) {
          currentRow = r;
          break;
        }
      }
      const row = rowInfo[currentRow];
      const isInLeftColumn = currentIndex < row.leftEnd;
      const posInColumn = isInLeftColumn ? currentIndex - row.start : currentIndex - row.rightStart;

      if (currentRow >= rowInfo.length - 1) {
        // Already on last row, stay put
        return;
      }
      // Go to same column in next row
      const nextRow = rowInfo[currentRow + 1];
      let newIndex: number;
      if (isInLeftColumn) {
        const leftSize = nextRow.leftEnd - nextRow.start;
        newIndex = nextRow.start + Math.min(posInColumn, leftSize - 1);
      } else {
        const rightSize = nextRow.end - nextRow.rightStart;
        newIndex = nextRow.rightStart + Math.min(posInColumn, rightSize - 1);
      }
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
  }, [flatToolList, rowInfo, selectedModel, enabledTools, onToolsChange, displayModels]);

  const toggleTool = useCallback((toolId: string) => {
    const newTools = enabledTools.includes(toolId)
      ? enabledTools.filter(t => t !== toolId)
      : [...enabledTools, toolId];
    onToolsChange(newTools);
    saveEnabledTools(newTools);
  }, [enabledTools, onToolsChange]);

  const toggleProviderCollapse = useCallback((providerId: ProviderType) => {
    setCollapsedProviders(prev => {
      const next = new Set(prev);
      if (next.has(providerId)) {
        next.delete(providerId);
      } else {
        next.add(providerId);
      }
      return next;
    });
  }, []);

  const toggleCategory = useCallback((categoryKey: string) => {
    const categoryTools = toolsByCategory[categoryKey as keyof typeof toolsByCategory] || [];
    const categoryIds = categoryTools.map(t => t.id);
    const allEnabled = categoryIds.every(id => enabledTools.includes(id));

    let newTools: string[];
    if (allEnabled) {
      // Disable all in category
      newTools = enabledTools.filter(id => !categoryIds.includes(id));
    } else {
      // Enable all in category
      newTools = [...new Set([...enabledTools, ...categoryIds])];
    }
    onToolsChange(newTools);
    saveEnabledTools(newTools);
  }, [enabledTools, onToolsChange, toolsByCategory]);

  if (!isOpen) return null;

  return (
    <div className="mt-modal-overlay" onClick={onClose}>
      <div
        className={`mt-modal ${isKeyboardNav ? 'keyboard-nav' : ''}`}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={handleMouseDown}
        onKeyDown={handleKeyDownGlobal}
      >
        <div className="mt-header" onContextMenu={(e) => e.preventDefault()}>
          <h3>
            <IconTool size={14} stroke={1.5} style={{ marginRight: '6px' }} />
            model & tools
          </h3>
          <button className="mt-close" onClick={onClose} title="close (esc)">
            <IconX size={14} />
          </button>
        </div>

        <div className="mt-content">
          {/* Providers - show enabled ones, but always show at least 1 and always show selected model's provider */}
          {!lockedProvider && (
            <>
              {PROVIDERS.filter(p => {
                // Always show the selected model's provider
                const selectedModelProvider = ALL_MODELS.find(m => m.id === selectedModel)?.provider;
                if (p.id === selectedModelProvider) return true;
                // Show if enabled
                if (enabledProviders[p.id]) return true;
                // If no providers enabled, fallback to claude
                const anyEnabled = Object.values(enabledProviders).some(v => v);
                if (!anyEnabled && p.id === 'claude') return true;
                return false;
              }).map((provider, _idx, filteredProviders) => {
                const providerModels = ALL_MODELS.filter(m => m.provider === provider.id);
                const isCollapsed = collapsedProviders.has(provider.id);
                const isDisabled = !enabledProviders[provider.id];
                const selectedModelProvider = ALL_MODELS.find(m => m.id === selectedModel)?.provider;
                const hasSelectedModel = provider.id === selectedModelProvider;
                const isOnlyProvider = filteredProviders.length === 1;
                const canCollapse = !hasSelectedModel && !isOnlyProvider && !isDisabled;
                return (
                  <div key={provider.id} className={`mt-provider-block ${isDisabled ? 'disabled' : ''}`}>
                    <span
                      className={`mt-provider-text ${isCollapsed ? '' : 'active'} ${!canCollapse ? 'no-collapse' : ''}`}
                      onClick={() => canCollapse && toggleProviderCollapse(provider.id)}
                    >
                      {provider.name}
                    </span>
                    {!isCollapsed && (
                      <div className="mt-provider-models">
                        {providerModels.map((model) => (
                          <button
                            key={model.id}
                            className={`mt-model-btn ${selectedModel === model.id ? 'selected' : ''}`}
                            onClick={() => {
                              onModelChange(model.id);
                              onClose();
                            }}
                          >
                            {model.displayName}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {/* Locked to single provider - show models directly */}
          {lockedProvider && (
            <>
              <div className="mt-models-row" role="group" aria-label="Model selection">
                {displayModels.map((model, index) => (
                  <button
                    key={model.id}
                    ref={el => { modelRefs.current[index] = el; }}
                    className={`mt-model-btn ${selectedModel === model.id ? 'selected' : ''} ${focusedModelIndex === index ? 'focused' : ''}`}
                    onClick={() => {
                      onModelChange(model.id);
                      onClose();
                    }}
                    onKeyDown={(e) => handleModelKeyDown(e, index)}
                    tabIndex={focusedModelIndex === index ? 0 : -1}
                  >
                    {model.name}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Tools - collapsible */}
          <div className="mt-section">
            <div className="mt-tools-header" onClick={() => setToolsExpanded(!toolsExpanded)}>
              <span className="mt-label">
                {toolsExpanded ? <IconChevronDown size={12} stroke={1.5} /> : <IconChevronRight size={12} stroke={1.5} />}
                tools ({enabledTools.length}/{ALL_TOOLS.length})
              </span>
              {toolsExpanded && (
                <button
                  ref={toggleAllRef}
                  className="mt-toggle-all"
                  onClick={(e) => { e.stopPropagation(); toggleAll(); }}
                  onKeyDown={handleToggleAllKeyDown}
                  tabIndex={focusedToggleAll ? 0 : -1}
                >
                  {enabledTools.length === ALL_TOOLS.length ? 'none' : 'all'}
                </button>
              )}
            </div>

            {/* File read + File write */}
            {toolsExpanded && <div className="mt-category-row">
              <div className="mt-category mt-category-half">
                <span
                  className={`mt-category-text ${isCategoryAllActive('file-read') ? 'active' : ''}`}
                  onClick={() => toggleCategory('file-read')}
                >
                  read
                </span>
                <div className="mt-tools-grid">
                  {toolsByCategory['file-read'].map(tool => (
                    <button
                      key={tool.id}
                      ref={el => { toolRefs.current.set(tool.id, el); }}
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
              <div className="mt-category mt-category-half">
                <span
                  className={`mt-category-text ${isCategoryAllActive('file-write') ? 'active' : ''}`}
                  onClick={() => toggleCategory('file-write')}
                >
                  write
                </span>
                <div className="mt-tools-grid">
                  {toolsByCategory['file-write'].map(tool => (
                    <button
                      key={tool.id}
                      ref={el => { toolRefs.current.set(tool.id, el); }}
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
            </div>}

            {/* Web + Terminal */}
            {toolsExpanded && <div className="mt-category-row">
              <div className="mt-category mt-category-half">
                <span
                  className={`mt-category-text ${isCategoryAllActive('web') ? 'active' : ''}`}
                  onClick={() => toggleCategory('web')}
                >
                  web
                </span>
                <div className="mt-tools-grid">
                  {toolsByCategory.web.map(tool => (
                    <button
                      key={tool.id}
                      ref={el => { toolRefs.current.set(tool.id, el); }}
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
              <div className="mt-category mt-category-half">
                <span
                  className={`mt-category-text ${isCategoryAllActive('terminal') ? 'active' : ''}`}
                  onClick={() => toggleCategory('terminal')}
                >
                  terminal
                </span>
                <div className="mt-tools-grid">
                  {toolsByCategory.terminal.map(tool => (
                    <button
                      key={tool.id}
                      ref={el => { toolRefs.current.set(tool.id, el); }}
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
            </div>}

            {/* Other + Agents */}
            {toolsExpanded && <div className="mt-category-row">
              <div className="mt-category mt-category-half">
                <span
                  className={`mt-category-text ${isCategoryAllActive('other') ? 'active' : ''}`}
                  onClick={() => toggleCategory('other')}
                >
                  other
                </span>
                <div className="mt-tools-grid">
                  {toolsByCategory.other.map(tool => (
                    <button
                      key={tool.id}
                      ref={el => { toolRefs.current.set(tool.id, el); }}
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
              <div className="mt-category mt-category-half">
                <span
                  className={`mt-category-text ${isCategoryAllActive('agents') ? 'active' : ''}`}
                  onClick={() => toggleCategory('agents')}
                >
                  agents
                </span>
                <div className="mt-tools-grid">
                  {toolsByCategory.agents.map(tool => (
                    <button
                      key={tool.id}
                      ref={el => { toolRefs.current.set(tool.id, el); }}
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
            </div>}
          </div>
        </div>
      </div>
    </div>
  );
};
