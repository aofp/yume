import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { IconSearch } from '@tabler/icons-react';
import { isMacOS } from '../../services/platformUtils';
import { useClaudeCodeStore } from '../../stores/claudeCodeStore';
import { platformBridge } from '../../services/platformBridge';
import './CommandPalette.css';

export interface CommandItem {
  id: string;
  label: string;
  category: string;
  shortcut?: string[];
  action: () => void;
  isToggle?: boolean;
  getValue?: () => boolean;
  disabled?: boolean;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
  onOpenAnalytics: () => void;
  onOpenAgents: () => void;
  onOpenProjects: () => void;
  onOpenRecent: () => void;
  onOpenHelp: () => void;
  onOpenResume: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onOpenSettings,
  onOpenAnalytics,
  onOpenAgents,
  onOpenProjects,
  onOpenRecent,
  onOpenHelp,
  onOpenResume,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const isMac = isMacOS();
  const modKey = isMac ? 'cmd' : 'ctrl';

  const {
    // Session management
    currentSessionId,
    sessions,
    createSession,
    deleteSession,
    forkSession,
    clearContext,
    interruptSession,
    // Model
    selectedModel,
    toggleModel,
    // Settings
    wordWrap,
    setWordWrap,
    soundOnComplete,
    setSoundOnComplete,
    showResultStats,
    setShowResultStats,
    autoCompactEnabled,
    setAutoCompactEnabled,
    showProjectsMenu,
    setShowProjectsMenu,
    showAgentsMenu,
    setShowAgentsMenu,
    showAnalyticsMenu,
    setShowAnalyticsMenu,
    showCommandsSettings,
    setShowCommandsSettings,
    showMcpSettings,
    setShowMcpSettings,
    showHooksSettings,
    setShowHooksSettings,
    showPluginsSettings,
    setShowPluginsSettings,
    showSkillsSettings,
    setShowSkillsSettings,
    showDictation,
    setShowDictation,
    showHistory,
    setShowHistory,
    rememberTabs,
    setRememberTabs,
    autoGenerateTitle,
    setAutoGenerateTitle,
  } = useClaudeCodeStore();

  const currentSession = sessions.find(s => s.id === currentSessionId);

  // Build commands list
  const commands = useMemo<CommandItem[]>(() => {
    const cmds: CommandItem[] = [];

    // Navigation
    cmds.push({
      id: 'new-tab',
      label: 'new tab',
      category: 'tabs',
      shortcut: [modKey, 't'],
      action: async () => {
        // Same behavior as Cmd/Ctrl+T - require folder selection
        if (window.electronAPI?.folder?.select) {
          try {
            const folder = await window.electronAPI.folder.select();
            if (folder) {
              // Save to recent projects
              const name = folder.split(/[/\\]/).pop() || folder;
              const newProject = { path: folder, name, lastOpened: Date.now() };
              const stored = localStorage.getItem('yume-recent-projects');
              let recentProjects: any[] = [];
              try {
                if (stored) recentProjects = JSON.parse(stored);
              } catch {}
              const updated = [newProject, ...recentProjects.filter((p: any) => p.path !== folder)].slice(0, 10);
              localStorage.setItem('yume-recent-projects', JSON.stringify(updated));
              await createSession(undefined, folder);
            }
          } catch (err) {
            console.error('Folder selection failed:', err);
          }
        }
      },
    });
    cmds.push({
      id: 'close-tab',
      label: 'close tab',
      category: 'tabs',
      shortcut: [modKey, 'w'],
      action: () => currentSessionId && deleteSession(currentSessionId),
      disabled: !currentSessionId,
    });
    cmds.push({
      id: 'duplicate-tab',
      label: 'duplicate tab',
      category: 'tabs',
      shortcut: [modKey, 'd'],
      action: () => {
        if (currentSession) {
          createSession(currentSession.name ? `${currentSession.name} (copy)` : undefined, currentSession.workingDirectory);
        }
      },
      disabled: !currentSession,
    });
    cmds.push({
      id: 'fork-session',
      label: 'fork session',
      category: 'tabs',
      shortcut: [modKey, 'shift', 'd'],
      action: () => currentSessionId && forkSession(currentSessionId),
      disabled: !currentSession || !currentSession.messages?.length,
    });

    // Panels
    cmds.push({
      id: 'open-settings',
      label: 'open settings',
      category: 'panels',
      shortcut: [modKey, ','],
      action: onOpenSettings,
    });
    cmds.push({
      id: 'open-analytics',
      label: 'open analytics',
      category: 'panels',
      shortcut: [modKey, 'y'],
      action: onOpenAnalytics,
    });
    cmds.push({
      id: 'open-agents',
      label: 'open agents',
      category: 'panels',
      shortcut: [modKey, 'n'],
      action: onOpenAgents,
    });
    cmds.push({
      id: 'open-projects',
      label: 'open projects',
      category: 'panels',
      shortcut: [modKey, 'r'],
      action: onOpenProjects,
    });
    cmds.push({
      id: 'resume-conversation',
      label: 'resume conversation',
      category: 'panels',
      shortcut: [modKey, 'shift', 'r'],
      action: onOpenResume,
    });
    cmds.push({
      id: 'keyboard-shortcuts',
      label: 'keyboard shortcuts',
      category: 'panels',
      shortcut: ['?'],
      action: onOpenHelp,
    });
    cmds.push({
      id: 'files-panel',
      label: 'toggle files panel',
      category: 'panels',
      shortcut: [modKey, 'e'],
      action: () => {
        window.dispatchEvent(new CustomEvent('toggle-files-panel', { detail: 'files' }));
      },
    });
    cmds.push({
      id: 'git-panel',
      label: 'toggle git panel',
      category: 'panels',
      shortcut: [modKey, 'g'],
      action: () => {
        window.dispatchEvent(new CustomEvent('toggle-files-panel', { detail: 'git' }));
      },
    });
    cmds.push({
      id: 'sessions-browser',
      label: 'browse sessions',
      category: 'panels',
      shortcut: [modKey, 'j'],
      action: onOpenResume,
    });
    cmds.push({
      id: 'session-stats',
      label: 'session stats',
      category: 'panels',
      shortcut: [modKey, '.'],
      action: () => {
        window.dispatchEvent(new CustomEvent('toggle-stats-modal'));
      },
    });

    // Session
    const hasMessages = currentSession?.messages?.length;
    const isStreaming = currentSession?.streaming;
    cmds.push({
      id: 'clear-context',
      label: 'clear context',
      category: 'session',
      shortcut: [modKey, 'l'],
      action: () => currentSessionId && clearContext(currentSessionId),
      disabled: !hasMessages,
    });
    cmds.push({
      id: 'compact-context',
      label: 'compact context',
      category: 'session',
      shortcut: [modKey, 'm'],
      action: () => {
        window.dispatchEvent(new CustomEvent('trigger-compaction'));
      },
      disabled: !hasMessages,
    });
    cmds.push({
      id: 'stop-generation',
      label: 'stop generation',
      category: 'session',
      shortcut: ['escape'],
      action: () => currentSessionId && interruptSession(currentSessionId),
      disabled: !isStreaming,
    });

    // Model
    cmds.push({
      id: 'model-tools',
      label: 'model & tools',
      category: 'model',
      shortcut: [modKey, 'o'],
      action: () => {
        window.dispatchEvent(new CustomEvent('open-model-tools'));
      },
    });
    cmds.push({
      id: 'toggle-model',
      label: `toggle model (current: ${selectedModel?.includes('opus') ? 'opus' : 'sonnet'})`,
      category: 'model',
      shortcut: [modKey, 'shift', 'o'],
      action: toggleModel,
    });
    cmds.push({
      id: 'edit-claude-md',
      label: 'edit claude.md',
      category: 'model',
      shortcut: [modKey, 'shift', 'e'],
      action: () => {
        window.dispatchEvent(new CustomEvent('open-claude-md'));
      },
    });

    // Input
    cmds.push({
      id: 'clear-input',
      label: 'clear input',
      category: 'input',
      shortcut: [modKey, 'u'],
      action: () => {
        window.dispatchEvent(new CustomEvent('clear-input'));
      },
    });
    cmds.push({
      id: 'search-messages',
      label: 'search messages',
      category: 'input',
      shortcut: [modKey, 'f'],
      action: () => {
        window.dispatchEvent(new CustomEvent('toggle-search'));
      },
    });
    cmds.push({
      id: 'insert-ultrathink',
      label: 'insert ultrathink',
      category: 'input',
      shortcut: [modKey, 'k'],
      action: () => {
        window.dispatchEvent(new CustomEvent('insert-ultrathink'));
      },
    });
    cmds.push({
      id: 'toggle-dictation',
      label: 'toggle dictation',
      category: 'input',
      shortcut: ['F5'],
      action: () => {
        window.dispatchEvent(new CustomEvent('toggle-dictation'));
      },
    });

    // Zoom
    cmds.push({
      id: 'zoom-in',
      label: 'zoom in',
      category: 'zoom',
      shortcut: [modKey, '+'],
      action: () => platformBridge.zoom.in(),
    });
    cmds.push({
      id: 'zoom-out',
      label: 'zoom out',
      category: 'zoom',
      shortcut: [modKey, '-'],
      action: () => platformBridge.zoom.out(),
    });
    cmds.push({
      id: 'zoom-reset',
      label: 'reset zoom',
      category: 'zoom',
      shortcut: [modKey, '0'],
      action: () => platformBridge.zoom.reset(),
    });

    // Toggles - UI
    cmds.push({
      id: 'toggle-word-wrap',
      label: 'toggle word wrap',
      category: 'settings',
      isToggle: true,
      getValue: () => wordWrap,
      action: () => setWordWrap(!wordWrap),
    });
    cmds.push({
      id: 'toggle-sound',
      label: 'toggle completion sound',
      category: 'settings',
      isToggle: true,
      getValue: () => soundOnComplete,
      action: () => setSoundOnComplete(!soundOnComplete),
    });
    cmds.push({
      id: 'toggle-result-stats',
      label: 'toggle result stats',
      category: 'settings',
      isToggle: true,
      getValue: () => showResultStats,
      action: () => setShowResultStats(!showResultStats),
    });
    cmds.push({
      id: 'toggle-auto-compact',
      label: 'toggle auto compact',
      category: 'settings',
      isToggle: true,
      getValue: () => autoCompactEnabled,
      action: () => setAutoCompactEnabled(!autoCompactEnabled),
    });
    cmds.push({
      id: 'toggle-remember-tabs',
      label: 'toggle remember tabs',
      category: 'settings',
      isToggle: true,
      getValue: () => rememberTabs,
      action: () => setRememberTabs(!rememberTabs),
    });
    cmds.push({
      id: 'toggle-auto-title',
      label: 'toggle auto title',
      category: 'settings',
      isToggle: true,
      getValue: () => autoGenerateTitle,
      action: () => setAutoGenerateTitle(!autoGenerateTitle),
    });
    cmds.push({
      id: 'toggle-dictation-btn',
      label: 'toggle dictation button',
      category: 'settings',
      isToggle: true,
      getValue: () => showDictation,
      action: () => setShowDictation(!showDictation),
    });
    cmds.push({
      id: 'toggle-history-btn',
      label: 'toggle history button',
      category: 'settings',
      isToggle: true,
      getValue: () => showHistory,
      action: () => setShowHistory(!showHistory),
    });

    // Toggles - Menu visibility
    cmds.push({
      id: 'toggle-projects-menu',
      label: 'toggle projects menu',
      category: 'menu',
      isToggle: true,
      getValue: () => showProjectsMenu,
      action: () => setShowProjectsMenu(!showProjectsMenu),
    });
    cmds.push({
      id: 'toggle-agents-menu',
      label: 'toggle agents menu',
      category: 'menu',
      isToggle: true,
      getValue: () => showAgentsMenu,
      action: () => setShowAgentsMenu(!showAgentsMenu),
    });
    cmds.push({
      id: 'toggle-analytics-menu',
      label: 'toggle analytics menu',
      category: 'menu',
      isToggle: true,
      getValue: () => showAnalyticsMenu,
      action: () => setShowAnalyticsMenu(!showAnalyticsMenu),
    });

    // Toggles - Settings tabs
    cmds.push({
      id: 'toggle-commands-tab',
      label: 'toggle commands settings tab',
      category: 'settings tabs',
      isToggle: true,
      getValue: () => showCommandsSettings,
      action: () => setShowCommandsSettings(!showCommandsSettings),
    });
    cmds.push({
      id: 'toggle-mcp-tab',
      label: 'toggle mcp settings tab',
      category: 'settings tabs',
      isToggle: true,
      getValue: () => showMcpSettings,
      action: () => setShowMcpSettings(!showMcpSettings),
    });
    cmds.push({
      id: 'toggle-hooks-tab',
      label: 'toggle hooks settings tab',
      category: 'settings tabs',
      isToggle: true,
      getValue: () => showHooksSettings,
      action: () => setShowHooksSettings(!showHooksSettings),
    });
    cmds.push({
      id: 'toggle-plugins-tab',
      label: 'toggle plugins settings tab',
      category: 'settings tabs',
      isToggle: true,
      getValue: () => showPluginsSettings,
      action: () => setShowPluginsSettings(!showPluginsSettings),
    });
    cmds.push({
      id: 'toggle-skills-tab',
      label: 'toggle skills settings tab',
      category: 'settings tabs',
      isToggle: true,
      getValue: () => showSkillsSettings,
      action: () => setShowSkillsSettings(!showSkillsSettings),
    });

    return cmds;
  }, [
    modKey, currentSessionId, currentSession, selectedModel,
    wordWrap, soundOnComplete, showResultStats, autoCompactEnabled,
    showProjectsMenu, showAgentsMenu, showAnalyticsMenu,
    showCommandsSettings, showMcpSettings, showHooksSettings,
    showPluginsSettings, showSkillsSettings, showDictation, showHistory,
    rememberTabs, autoGenerateTitle,
    createSession, deleteSession, forkSession, clearContext, interruptSession, toggleModel,
    setWordWrap, setSoundOnComplete, setShowResultStats, setAutoCompactEnabled,
    setShowProjectsMenu, setShowAgentsMenu, setShowAnalyticsMenu,
    setShowCommandsSettings, setShowMcpSettings, setShowHooksSettings,
    setShowPluginsSettings, setShowSkillsSettings, setShowDictation, setShowHistory,
    setRememberTabs, setAutoGenerateTitle,
    onOpenSettings, onOpenAnalytics, onOpenAgents, onOpenProjects, onOpenRecent,
    onOpenHelp, onOpenResume,
  ]);

  // Fuzzy search
  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;

    const q = query.toLowerCase();
    const scored = commands.map(cmd => {
      const label = cmd.label.toLowerCase();
      const category = cmd.category.toLowerCase();

      // Exact match
      if (label === q) return { cmd, score: 100 };

      // Starts with
      if (label.startsWith(q)) return { cmd, score: 80 };

      // Contains
      if (label.includes(q)) return { cmd, score: 60 };

      // Category match
      if (category.includes(q)) return { cmd, score: 40 };

      // Fuzzy match - each char in sequence
      let fuzzyScore = 0;
      let queryIdx = 0;
      for (let i = 0; i < label.length && queryIdx < q.length; i++) {
        if (label[i] === q[queryIdx]) {
          fuzzyScore += 2;
          queryIdx++;
        }
      }
      if (queryIdx === q.length) {
        return { cmd, score: 20 + fuzzyScore };
      }

      return { cmd, score: 0 };
    });

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(s => s.cmd);
  }, [commands, query]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Focus input when opening
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedEl = listRef.current.querySelector('.cp-item.selected');
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  const executeCommand = useCallback((cmd: CommandItem) => {
    cmd.action();
    onClose();
  }, [onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }

    // Close on backspace when input is empty
    if (e.key === 'Backspace' && query === '') {
      e.preventDefault();
      onClose();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      // Skip disabled items
      let next = selectedIndex + 1;
      while (next < filteredCommands.length && filteredCommands[next]?.disabled) {
        next++;
      }
      if (next < filteredCommands.length) {
        setSelectedIndex(next);
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      // Skip disabled items
      let prev = selectedIndex - 1;
      while (prev >= 0 && filteredCommands[prev]?.disabled) {
        prev--;
      }
      if (prev >= 0) {
        setSelectedIndex(prev);
      }
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = filteredCommands[selectedIndex];
      if (cmd && !cmd.disabled) {
        executeCommand(cmd);
      }
      return;
    }
  }, [filteredCommands, selectedIndex, executeCommand, onClose, query]);

  // Global keyboard handler for Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Group commands by category, with disabled items at end of each category
  const groupedCommands = filteredCommands.reduce((acc, cmd) => {
    if (!acc[cmd.category]) acc[cmd.category] = [];
    acc[cmd.category].push(cmd);
    return acc;
  }, {} as Record<string, CommandItem[]>);

  // Sort each category: enabled first, disabled last
  Object.keys(groupedCommands).forEach(cat => {
    groupedCommands[cat].sort((a, b) => (a.disabled ? 1 : 0) - (b.disabled ? 1 : 0));
  });

  const categoryOrder = ['tabs', 'panels', 'session', 'model', 'input', 'zoom', 'settings', 'menu', 'settings tabs'];
  const sortedCategories = Object.keys(groupedCommands).sort((a, b) => {
    const aIdx = categoryOrder.indexOf(a);
    const bIdx = categoryOrder.indexOf(b);
    return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
  });

  const renderShortcut = (shortcut: string[]) => {
    return (
      <div className="cp-shortcut">
        {shortcut.map((key, i) => (
          <React.Fragment key={i}>
            <span className="cp-key">{key}</span>
            {i < shortcut.length - 1 && <span className="cp-key-plus">+</span>}
          </React.Fragment>
        ))}
      </div>
    );
  };

  return (
    <div className="cp-overlay" onClick={onClose}>
      <div className="cp-modal" onClick={e => e.stopPropagation()}>
        <div className="cp-search">
          <IconSearch size={14} className="cp-search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="cp-input"
            placeholder="search commands..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            autoComplete="off"
          />
        </div>
        <div className="cp-list" ref={listRef}>
          {filteredCommands.length === 0 ? (
            <div className="cp-empty">no commands found</div>
          ) : (
            sortedCategories.map(category => (
              <div key={category} className="cp-category">
                <div className="cp-category-label">{category}</div>
                {groupedCommands[category].map(cmd => {
                  const isSelected = filteredCommands.indexOf(cmd) === selectedIndex;
                  const toggleValue = cmd.isToggle && cmd.getValue ? cmd.getValue() : undefined;

                  return (
                    <div
                      key={cmd.id}
                      className={`cp-item ${isSelected ? 'selected' : ''} ${cmd.disabled ? 'disabled' : ''}`}
                      onClick={() => !cmd.disabled && executeCommand(cmd)}
                      onMouseEnter={() => !cmd.disabled && setSelectedIndex(filteredCommands.indexOf(cmd))}
                    >
                      <span className="cp-label">{cmd.label}</span>
                      {cmd.isToggle && (
                        <span className={`cp-toggle ${toggleValue ? 'on' : 'off'}`}>
                          {toggleValue ? 'on' : 'off'}
                        </span>
                      )}
                      {cmd.shortcut && renderShortcut(cmd.shortcut)}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
