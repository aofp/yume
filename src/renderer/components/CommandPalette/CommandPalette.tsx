import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { IconSearch, IconChevronLeft, IconCheck } from '@tabler/icons-react';
import { isMacOS } from '../../services/platformUtils';
import { useClaudeCodeStore } from '../../stores/claudeCodeStore';
import { platformBridge } from '../../services/platformBridge';
import { BUILT_IN_THEMES, type Theme } from '../../config/themes';
import { pluginService } from '../../services/pluginService';
import type { InstalledPlugin } from '../../types/plugin';
import './CommandPalette.css';

// Submenu types
type SubmenuType = 'theme' | 'fontSize' | 'lineHeight' | 'opacity' | 'plugins' | null;

interface SubmenuItem {
  id: string;
  label: string;
  data?: any;
  isSelected?: boolean;
}

export interface CommandItem {
  id: string;
  label: string;
  category: string;
  shortcut?: string[];
  action: () => void;
  isToggle?: boolean;
  getValue?: () => boolean;
  disabled?: boolean;
  hasSubmenu?: SubmenuType;
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
  const [activeSubmenu, setActiveSubmenu] = useState<SubmenuType>(null);
  const [submenuIndex, setSubmenuIndex] = useState(0);
  const [previousSelectedIndex, setPreviousSelectedIndex] = useState(0);
  const [originalColors, setOriginalColors] = useState<{bg: string, fg: string, accent: string, positive: string, negative: string} | null>(null);
  const [originalFontSize, setOriginalFontSize] = useState<number | null>(null);
  const [originalLineHeight, setOriginalLineHeight] = useState<number | null>(null);
  const [originalOpacity, setOriginalOpacity] = useState<number | null>(null);
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [ignoreMouseUntilMove, setIgnoreMouseUntilMove] = useState(false);
  const lastMousePos = useRef<{ x: number; y: number } | null>(null);
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
    fontSize,
    setFontSize,
    lineHeight,
    setLineHeight,
    backgroundOpacity,
    setBackgroundOpacity,
  } = useClaudeCodeStore();

  const currentSession = sessions.find(s => s.id === currentSessionId);

  // Load custom themes from localStorage (needed for currentThemeName in commands)
  const customThemes = useMemo(() => {
    try {
      const saved = localStorage.getItem('customThemes');
      return saved ? JSON.parse(saved) as Theme[] : [];
    } catch {
      return [];
    }
  }, [activeSubmenu]); // Re-read when submenu opens

  // All themes for submenu
  const allThemes = useMemo(() => [...BUILT_IN_THEMES, ...customThemes], [customThemes]);

  // Get current theme name
  const currentThemeName = useMemo(() => {
    const themeId = localStorage.getItem('currentThemeId');
    if (!themeId || themeId === 'custom') return 'custom';
    const theme = allThemes.find(t => t.id === themeId);
    return theme?.name || 'custom';
  }, [allThemes]);

  // Check if there are recent projects (for resume when no session)
  const hasRecentProjects = useMemo(() => {
    try {
      const stored = localStorage.getItem('yume-recent-projects');
      if (stored) {
        const projects = JSON.parse(stored);
        return projects.length > 0;
      }
    } catch {}
    return false;
  }, []);

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
      id: 'session-stats',
      label: 'context usage',
      category: 'panels',
      shortcut: [modKey, '.'],
      action: () => {
        window.dispatchEvent(new CustomEvent('toggle-stats-modal'));
      },
      disabled: !currentSession,
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
    // Settings tabs - direct navigation
    cmds.push({
      id: 'settings-general',
      label: 'settings: general',
      category: 'panels',
      action: () => window.dispatchEvent(new CustomEvent('open-settings-tab', { detail: { tab: 'general' } })),
    });
    cmds.push({
      id: 'settings-appearance',
      label: 'settings: appearance',
      category: 'panels',
      action: () => window.dispatchEvent(new CustomEvent('open-settings-tab', { detail: { tab: 'appearance' } })),
    });
    cmds.push({
      id: 'settings-cli',
      label: 'settings: cli',
      category: 'panels',
      action: () => window.dispatchEvent(new CustomEvent('open-settings-tab', { detail: { tab: 'providers' } })),
    });
    if (showPluginsSettings) {
      cmds.push({
        id: 'settings-plugins',
        label: 'settings: plugins',
        category: 'panels',
        action: () => window.dispatchEvent(new CustomEvent('open-settings-tab', { detail: { tab: 'plugins' } })),
      });
    }
    if (showHooksSettings) {
      cmds.push({
        id: 'settings-hooks',
        label: 'settings: hooks',
        category: 'panels',
        action: () => window.dispatchEvent(new CustomEvent('open-settings-tab', { detail: { tab: 'hooks' } })),
      });
    }
    if (showCommandsSettings) {
      cmds.push({
        id: 'settings-commands',
        label: 'settings: commands',
        category: 'panels',
        action: () => window.dispatchEvent(new CustomEvent('open-settings-tab', { detail: { tab: 'commands' } })),
      });
    }
    if (showSkillsSettings) {
      cmds.push({
        id: 'settings-skills',
        label: 'settings: skills',
        category: 'panels',
        action: () => window.dispatchEvent(new CustomEvent('open-settings-tab', { detail: { tab: 'skills' } })),
      });
    }
    if (showMcpSettings) {
      cmds.push({
        id: 'settings-mcp',
        label: 'settings: mcp',
        category: 'panels',
        action: () => window.dispatchEvent(new CustomEvent('open-settings-tab', { detail: { tab: 'mcp' } })),
      });
    }
    cmds.push({
      id: 'open-analytics',
      label: 'open analytics',
      category: 'panels',
      shortcut: [modKey, 'y'],
      action: onOpenAnalytics,
    });
    cmds.push({
      id: 'analytics-overview',
      label: 'analytics: overview',
      category: 'panels',
      action: () => window.dispatchEvent(new CustomEvent('open-analytics-tab', { detail: { tab: 'overview' } })),
    });
    cmds.push({
      id: 'analytics-projects',
      label: 'analytics: projects',
      category: 'panels',
      action: () => window.dispatchEvent(new CustomEvent('open-analytics-tab', { detail: { tab: 'projects' } })),
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
      disabled: !currentSession && !hasRecentProjects,
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
      label: 'open files panel',
      category: 'panels',
      shortcut: [modKey, 'e'],
      action: () => {
        window.dispatchEvent(new CustomEvent('toggle-files-panel', { detail: 'files' }));
      },
      disabled: !currentSession,
    });
    cmds.push({
      id: 'git-panel',
      label: 'open git panel',
      category: 'panels',
      shortcut: [modKey, 'g'],
      action: () => {
        window.dispatchEvent(new CustomEvent('toggle-files-panel', { detail: 'git' }));
      },
      disabled: !currentSession,
    });
    cmds.push({
      id: 'sessions-browser',
      label: 'browse sessions',
      category: 'panels',
      shortcut: [modKey, 'j'],
      action: onOpenResume,
      disabled: !currentSession && !hasRecentProjects,
    });

    // Session
    const hasMessages = currentSession?.messages?.length;
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
    // Model
    cmds.push({
      id: 'model-tools',
      label: 'open model & tools',
      category: 'model',
      shortcut: [modKey, 'o'],
      action: () => {
        window.dispatchEvent(new CustomEvent('open-model-tools'));
      },
    });
    cmds.push({
      id: 'toggle-model',
      label: `toggle model`,
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
      disabled: !currentSession?.workingDirectory,
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
      disabled: !currentSession,
    });
    cmds.push({
      id: 'search-messages',
      label: 'search messages',
      category: 'input',
      shortcut: [modKey, 'f'],
      action: () => {
        window.dispatchEvent(new CustomEvent('toggle-search'));
      },
      disabled: !currentSession,
    });
    cmds.push({
      id: 'toggle-dictation',
      label: 'toggle dictation',
      category: 'input',
      shortcut: ['F5'],
      action: () => {
        window.dispatchEvent(new CustomEvent('toggle-dictation'));
      },
      disabled: !currentSession,
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

    // Appearance with submenus
    cmds.push({
      id: 'select-theme',
      label: `theme (${currentThemeName})`,
      category: 'appearance',
      action: () => {
        // Save current colors for restore on cancel
        const root = document.documentElement;
        setOriginalColors({
          bg: getComputedStyle(root).getPropertyValue('--background-color').trim(),
          fg: getComputedStyle(root).getPropertyValue('--foreground-color').trim(),
          accent: getComputedStyle(root).getPropertyValue('--accent-color').trim(),
          positive: getComputedStyle(root).getPropertyValue('--positive-color').trim(),
          negative: getComputedStyle(root).getPropertyValue('--negative-color').trim(),
        });
        setPreviousSelectedIndex(selectedIndex);
        setActiveSubmenu('theme');
        setSubmenuIndex(0);
        setQuery('');
      },
      hasSubmenu: 'theme',
    });
    cmds.push({
      id: 'select-font-size',
      label: `font size (${fontSize}px)`,
      category: 'appearance',
      action: () => {
        setOriginalFontSize(fontSize);
        setPreviousSelectedIndex(selectedIndex);
        setActiveSubmenu('fontSize');
        setSubmenuIndex(0);
        setQuery('');
      },
      hasSubmenu: 'fontSize',
    });
    cmds.push({
      id: 'select-line-height',
      label: `line height (${lineHeight.toFixed(1)})`,
      category: 'appearance',
      action: () => {
        setOriginalLineHeight(lineHeight);
        setPreviousSelectedIndex(selectedIndex);
        setActiveSubmenu('lineHeight');
        setSubmenuIndex(0);
        setQuery('');
      },
      hasSubmenu: 'lineHeight',
    });
    cmds.push({
      id: 'select-opacity',
      label: `background opacity (${backgroundOpacity}%)`,
      category: 'appearance',
      action: () => {
        setOriginalOpacity(backgroundOpacity);
        setPreviousSelectedIndex(selectedIndex);
        setActiveSubmenu('opacity');
        setSubmenuIndex(0);
        setQuery('');
      },
      hasSubmenu: 'opacity',
    });
    cmds.push({
      id: 'manage-plugins',
      label: 'manage plugins',
      category: 'appearance',
      action: () => {
        setPreviousSelectedIndex(selectedIndex);
        setActiveSubmenu('plugins');
        setSubmenuIndex(0);
        setQuery('');
      },
      hasSubmenu: 'plugins',
    });

    // Toggles - Options (matches settings modal order)
    cmds.push({
      id: 'toggle-result-stats',
      label: 'toggle result stats',
      category: 'settings',
      isToggle: true,
      getValue: () => showResultStats,
      action: () => setShowResultStats(!showResultStats),
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
      id: 'toggle-auto-compact',
      label: 'toggle auto compact',
      category: 'settings',
      isToggle: true,
      getValue: () => autoCompactEnabled,
      action: () => setAutoCompactEnabled(!autoCompactEnabled),
    });
    cmds.push({
      id: 'toggle-word-wrap',
      label: 'toggle word wrap',
      category: 'settings',
      isToggle: true,
      getValue: () => wordWrap,
      action: () => setWordWrap(!wordWrap),
    });

    // Toggles - Menu visibility (matches settings modal order)
    cmds.push({
      id: 'toggle-analytics-menu',
      label: 'toggle analytics menu',
      category: 'menu',
      isToggle: true,
      getValue: () => showAnalyticsMenu,
      action: () => setShowAnalyticsMenu(!showAnalyticsMenu),
    });
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

    // Toggles - Features (matches settings modal order)
    cmds.push({
      id: 'toggle-history-btn',
      label: 'toggle history button',
      category: 'features',
      isToggle: true,
      getValue: () => showHistory,
      action: () => setShowHistory(!showHistory),
    });
    cmds.push({
      id: 'toggle-dictation-btn',
      label: 'toggle dictation button',
      category: 'features',
      isToggle: true,
      getValue: () => showDictation,
      action: () => setShowDictation(!showDictation),
    });

    // Toggles - Settings tabs (matches settings modal order)
    cmds.push({
      id: 'toggle-plugins-tab',
      label: 'toggle plugins settings tab',
      category: 'settings tabs',
      isToggle: true,
      getValue: () => showPluginsSettings,
      action: () => setShowPluginsSettings(!showPluginsSettings),
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
      id: 'toggle-commands-tab',
      label: 'toggle commands settings tab',
      category: 'settings tabs',
      isToggle: true,
      getValue: () => showCommandsSettings,
      action: () => setShowCommandsSettings(!showCommandsSettings),
    });
    cmds.push({
      id: 'toggle-skills-tab',
      label: 'toggle skills settings tab',
      category: 'settings tabs',
      isToggle: true,
      getValue: () => showSkillsSettings,
      action: () => setShowSkillsSettings(!showSkillsSettings),
    });
    cmds.push({
      id: 'toggle-mcp-tab',
      label: 'toggle mcp settings tab',
      category: 'settings tabs',
      isToggle: true,
      getValue: () => showMcpSettings,
      action: () => setShowMcpSettings(!showMcpSettings),
    });

    return cmds;
  }, [
    modKey, currentSessionId, currentSession, selectedModel, hasRecentProjects,
    wordWrap, soundOnComplete, showResultStats, autoCompactEnabled,
    showProjectsMenu, showAgentsMenu, showAnalyticsMenu,
    showCommandsSettings, showMcpSettings, showHooksSettings,
    showPluginsSettings, showSkillsSettings, showDictation, showHistory,
    rememberTabs, autoGenerateTitle, fontSize, lineHeight, backgroundOpacity,
    currentThemeName, selectedIndex, // needed for setPreviousSelectedIndex in submenu actions
    createSession, deleteSession, forkSession, clearContext, toggleModel,
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

  const categoryOrder = ['session', 'tabs', 'panels', 'model', 'input', 'zoom', 'appearance', 'settings', 'menu', 'features', 'settings tabs'];

  // Build visual order: group by category, sort categories, put disabled at end of each category
  const visualOrderCommands = useMemo(() => {
    const grouped = filteredCommands.reduce((acc, cmd) => {
      if (!acc[cmd.category]) acc[cmd.category] = [];
      acc[cmd.category].push(cmd);
      return acc;
    }, {} as Record<string, CommandItem[]>);

    // Sort each category: enabled first, disabled last
    Object.keys(grouped).forEach(cat => {
      grouped[cat].sort((a, b) => (a.disabled ? 1 : 0) - (b.disabled ? 1 : 0));
    });

    const sortedCats = Object.keys(grouped).sort((a, b) => {
      const aIdx = categoryOrder.indexOf(a);
      const bIdx = categoryOrder.indexOf(b);
      return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
    });

    // Flatten to single array in visual order
    return sortedCats.flatMap(cat => grouped[cat]);
  }, [filteredCommands]);

  // Load plugins when opening plugins submenu
  useEffect(() => {
    if (activeSubmenu === 'plugins') {
      pluginService.refresh().then(setPlugins).catch(console.error);
    }
  }, [activeSubmenu]);

  // Font size options (8-24px)
  const fontSizeOptions = useMemo(() =>
    [8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24].map(size => ({
      id: `font-${size}`,
      label: `${size}px`,
      data: size,
      isSelected: fontSize === size,
    })),
  [fontSize]);

  // Line height options (1.0-2.0)
  const lineHeightOptions = useMemo(() =>
    [1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 2.0].map(h => ({
      id: `lh-${h}`,
      label: `${h.toFixed(1)}`,
      data: h,
      isSelected: lineHeight === h,
    })),
  [lineHeight]);

  // Opacity options (50-100%)
  const opacityOptions = useMemo(() =>
    [50, 60, 70, 75, 80, 85, 90, 95, 100].map(o => ({
      id: `opacity-${o}`,
      label: `${o}%`,
      data: o,
      isSelected: backgroundOpacity === o,
    })),
  [backgroundOpacity]);

  // Plugin items
  const pluginItems = useMemo<SubmenuItem[]>(() =>
    plugins.map(p => ({
      id: p.id,
      label: p.manifest.name,
      data: p,
      isSelected: p.enabled,
    })),
  [plugins]);

  // Submenu items based on active submenu
  const submenuItems = useMemo<SubmenuItem[]>(() => {
    switch (activeSubmenu) {
      case 'theme':
        return allThemes.map(t => ({ id: t.id, label: t.name, data: t }));
      case 'fontSize':
        return fontSizeOptions;
      case 'lineHeight':
        return lineHeightOptions;
      case 'opacity':
        return opacityOptions;
      case 'plugins':
        return pluginItems;
      default:
        return [];
    }
  }, [activeSubmenu, allThemes, fontSizeOptions, lineHeightOptions, opacityOptions, pluginItems]);

  // Filter submenu items by query
  const filteredSubmenuItems = useMemo(() => {
    if (!query.trim()) return submenuItems;
    const q = query.toLowerCase();
    return submenuItems.filter(item => item.label.toLowerCase().includes(q));
  }, [submenuItems, query]);

  // Helper to convert hex color to RGB string
  const hexToRgb = (hex: string) => {
    const h = hex.replace('#', '');
    return `${parseInt(h.substring(0, 2), 16)}, ${parseInt(h.substring(2, 4), 16)}, ${parseInt(h.substring(4, 6), 16)}`;
  };

  // Preview theme colors
  const previewTheme = useCallback((theme: Theme) => {
    const root = document.documentElement;
    root.style.setProperty('--background-color', theme.backgroundColor);
    root.style.setProperty('--background-rgb', hexToRgb(theme.backgroundColor));
    root.style.setProperty('--foreground-color', theme.foregroundColor);
    root.style.setProperty('--foreground-rgb', hexToRgb(theme.foregroundColor));
    root.style.setProperty('--accent-color', theme.accentColor);
    root.style.setProperty('--accent-rgb', hexToRgb(theme.accentColor));
    root.style.setProperty('--positive-color', theme.positiveColor);
    root.style.setProperty('--negative-color', theme.negativeColor);
  }, []);

  // Apply theme (save to localStorage)
  const applyTheme = useCallback((theme: Theme) => {
    previewTheme(theme);
    localStorage.setItem('backgroundColor', theme.backgroundColor);
    localStorage.setItem('foregroundColor', theme.foregroundColor);
    localStorage.setItem('accentColor', theme.accentColor);
    localStorage.setItem('positiveColor', theme.positiveColor);
    localStorage.setItem('negativeColor', theme.negativeColor);
    localStorage.setItem('currentThemeId', theme.id);
  }, [previewTheme]);

  // Restore original values (on cancel)
  const restoreOriginals = useCallback(() => {
    if (originalColors) {
      const root = document.documentElement;
      root.style.setProperty('--background-color', originalColors.bg);
      root.style.setProperty('--background-rgb', hexToRgb(originalColors.bg));
      root.style.setProperty('--foreground-color', originalColors.fg);
      root.style.setProperty('--foreground-rgb', hexToRgb(originalColors.fg));
      root.style.setProperty('--accent-color', originalColors.accent);
      root.style.setProperty('--accent-rgb', hexToRgb(originalColors.accent));
      root.style.setProperty('--positive-color', originalColors.positive);
      root.style.setProperty('--negative-color', originalColors.negative);
    }
    if (originalFontSize !== null) {
      setFontSize(originalFontSize);
    }
    if (originalLineHeight !== null) {
      setLineHeight(originalLineHeight);
    }
    if (originalOpacity !== null) {
      setBackgroundOpacity(originalOpacity);
    }
  }, [originalColors, originalFontSize, originalLineHeight, originalOpacity, setFontSize, setLineHeight, setBackgroundOpacity]);

  // Preview when submenu index changes
  useEffect(() => {
    if (!filteredSubmenuItems[submenuIndex]) return;
    const item = filteredSubmenuItems[submenuIndex];

    switch (activeSubmenu) {
      case 'theme':
        previewTheme(item.data as Theme);
        break;
      case 'fontSize':
        setFontSize(item.data as number);
        break;
      case 'lineHeight':
        setLineHeight(item.data as number);
        break;
      case 'opacity':
        setBackgroundOpacity(item.data as number);
        break;
      // plugins don't need preview
    }
  }, [activeSubmenu, submenuIndex, filteredSubmenuItems, previewTheme, setFontSize, setLineHeight, setBackgroundOpacity]);

  // Reset selection when query changes - skip disabled items
  useEffect(() => {
    // Find first non-disabled index
    let firstEnabledIdx = 0;
    if (!activeSubmenu) {
      while (firstEnabledIdx < visualOrderCommands.length && visualOrderCommands[firstEnabledIdx]?.disabled) {
        firstEnabledIdx++;
      }
    }
    setSelectedIndex(firstEnabledIdx);
    if (activeSubmenu) {
      setSubmenuIndex(0);
    }
  }, [query, activeSubmenu, visualOrderCommands]);

  // Focus input when opening
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      setQuery('');
      // Find first non-disabled command
      let firstEnabledIdx = 0;
      while (firstEnabledIdx < visualOrderCommands.length && visualOrderCommands[firstEnabledIdx]?.disabled) {
        firstEnabledIdx++;
      }
      setSelectedIndex(firstEnabledIdx);
      setIgnoreMouseUntilMove(true);
      lastMousePos.current = null;
    }
  }, [isOpen, visualOrderCommands]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedEl = listRef.current.querySelector('.cp-item.selected');
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex, submenuIndex]);

  // Handle mouse movement to re-enable hover after keyboard navigation
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const pos = { x: e.clientX, y: e.clientY };

    if (ignoreMouseUntilMove && lastMousePos.current) {
      const dx = Math.abs(pos.x - lastMousePos.current.x);
      const dy = Math.abs(pos.y - lastMousePos.current.y);
      // Only re-enable if mouse actually moved (not just scroll-induced events)
      if (dx > 3 || dy > 3) {
        setIgnoreMouseUntilMove(false);
      }
    }
    lastMousePos.current = pos;
  }, [ignoreMouseUntilMove]);

  const executeCommand = useCallback((cmd: CommandItem) => {
    // If command has submenu, don't close - action will open submenu
    if (cmd.hasSubmenu) {
      cmd.action();
    } else {
      cmd.action();
      onClose();
    }
  }, [onClose]);

  // Exit submenu and restore original values
  const exitSubmenu = useCallback(() => {
    restoreOriginals();
    setActiveSubmenu(null);
    setSubmenuIndex(0);
    setSelectedIndex(previousSelectedIndex);
    setOriginalColors(null);
    setOriginalFontSize(null);
    setOriginalLineHeight(null);
    setOriginalOpacity(null);
    setQuery('');
  }, [restoreOriginals, previousSelectedIndex]);

  // Handle submenu item selection
  const handleSubmenuSelect = useCallback(async (item: SubmenuItem) => {
    switch (activeSubmenu) {
      case 'theme':
        applyTheme(item.data as Theme);
        setActiveSubmenu(null);
        setOriginalColors(null);
        onClose();
        break;
      case 'fontSize':
        // Already applied via preview, just clear originals and close
        setActiveSubmenu(null);
        setOriginalFontSize(null);
        onClose();
        break;
      case 'lineHeight':
        setActiveSubmenu(null);
        setOriginalLineHeight(null);
        onClose();
        break;
      case 'opacity':
        setActiveSubmenu(null);
        setOriginalOpacity(null);
        onClose();
        break;
      case 'plugins':
        // Toggle plugin enabled state
        const plugin = item.data as InstalledPlugin;
        try {
          if (plugin.enabled) {
            await pluginService.disablePlugin(plugin.id);
          } else {
            await pluginService.enablePlugin(plugin.id);
          }
          // Refresh plugins list
          const refreshed = await pluginService.refresh();
          setPlugins(refreshed);
        } catch (err) {
          console.error('Failed to toggle plugin:', err);
        }
        break;
    }
  }, [activeSubmenu, applyTheme, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Submenu mode
    if (activeSubmenu) {
      // Exit submenu on Escape, or Backspace when query empty or no results
      if (e.key === 'Escape' || (e.key === 'Backspace' && (query === '' || filteredSubmenuItems.length === 0))) {
        e.preventDefault();
        exitSubmenu();
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setIgnoreMouseUntilMove(true);
        if (submenuIndex < filteredSubmenuItems.length - 1) {
          setSubmenuIndex(submenuIndex + 1);
        }
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setIgnoreMouseUntilMove(true);
        if (submenuIndex > 0) {
          setSubmenuIndex(submenuIndex - 1);
        }
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        const item = filteredSubmenuItems[submenuIndex];
        if (item) {
          handleSubmenuSelect(item);
        }
        return;
      }
      return;
    }

    // Main menu mode
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
      setIgnoreMouseUntilMove(true);
      // Skip disabled items - use visualOrderCommands for correct visual order
      let next = selectedIndex + 1;
      while (next < visualOrderCommands.length && visualOrderCommands[next]?.disabled) {
        next++;
      }
      if (next < visualOrderCommands.length) {
        setSelectedIndex(next);
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIgnoreMouseUntilMove(true);
      // Skip disabled items - use visualOrderCommands for correct visual order
      let prev = selectedIndex - 1;
      while (prev >= 0 && visualOrderCommands[prev]?.disabled) {
        prev--;
      }
      if (prev >= 0) {
        setSelectedIndex(prev);
      }
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = visualOrderCommands[selectedIndex];
      if (cmd && !cmd.disabled) {
        executeCommand(cmd);
      }
      return;
    }
  }, [activeSubmenu, visualOrderCommands, filteredSubmenuItems, selectedIndex, submenuIndex, executeCommand, exitSubmenu, handleSubmenuSelect, onClose, query]);

  // Global keyboard handler for Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (activeSubmenu) {
          exitSubmenu();
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isOpen, activeSubmenu, exitSubmenu, onClose]);

  if (!isOpen) return null;

  // Group for rendering
  const groupedCommands = visualOrderCommands.reduce((acc, cmd) => {
    if (!acc[cmd.category]) acc[cmd.category] = [];
    acc[cmd.category].push(cmd);
    return acc;
  }, {} as Record<string, CommandItem[]>);

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

  // Submenu title
  const submenuTitles: Record<string, string> = {
    theme: 'select theme',
    fontSize: 'font size',
    lineHeight: 'line height',
    opacity: 'background opacity',
    plugins: 'plugins',
  };
  const submenuTitle = activeSubmenu ? submenuTitles[activeSubmenu] || '' : '';

  return (
    <div className="cp-overlay" onClick={() => { if (activeSubmenu) { exitSubmenu(); } else { onClose(); } }}>
      <div className="cp-modal" onClick={e => { e.stopPropagation(); inputRef.current?.focus(); }}>
        <div className="cp-search">
          {activeSubmenu ? (
            <button
              className="cp-back-btn"
              onClick={exitSubmenu}
              title="back (esc)"
            >
              <IconChevronLeft size={14} />
            </button>
          ) : (
            <IconSearch size={14} className="cp-search-icon" />
          )}
          <input
            ref={inputRef}
            type="text"
            className="cp-input"
            placeholder={activeSubmenu ? `search ${submenuTitle}...` : "search commands..."}
            value={query}
            onChange={e => { setQuery(e.target.value); setIgnoreMouseUntilMove(true); }}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            autoComplete="off"
          />
        </div>
        <div className="cp-list" ref={listRef} onMouseMove={handleMouseMove}>
          {activeSubmenu ? (
            // Submenu view
            filteredSubmenuItems.length === 0 ? (
              <div className="cp-empty">no items found</div>
            ) : (
              <div className="cp-category">
                <div className="cp-category-label">{submenuTitle}</div>
                {filteredSubmenuItems.map((item, idx) => {
                  const isSelected = idx === submenuIndex;
                  return (
                    <div
                      key={item.id}
                      className={`cp-item ${isSelected ? 'selected' : ''} ${!ignoreMouseUntilMove ? 'hover-enabled' : ''}`}
                      onClick={() => handleSubmenuSelect(item)}
                      onMouseEnter={() => !ignoreMouseUntilMove && setSubmenuIndex(idx)}
                    >
                      <span className="cp-label">{item.label}</span>
                      {/* Theme color swatches */}
                      {activeSubmenu === 'theme' && (
                        <span className="cp-theme-colors">
                          <span style={{ background: (item.data as Theme).foregroundColor }} />
                          <span style={{ background: (item.data as Theme).accentColor }} />
                          <span style={{ background: (item.data as Theme).positiveColor }} />
                          <span style={{ background: (item.data as Theme).negativeColor }} />
                        </span>
                      )}
                      {/* Check mark for selected value or enabled plugin */}
                      {item.isSelected && (
                        <IconCheck size={14} className="cp-check" />
                      )}
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            // Main menu view
            visualOrderCommands.length === 0 ? (
              <div className="cp-empty">no commands found</div>
            ) : (
              sortedCategories.map(category => (
                <div key={category} className="cp-category">
                  <div className="cp-category-label">{category}</div>
                  {groupedCommands[category].map(cmd => {
                    const isSelected = visualOrderCommands.indexOf(cmd) === selectedIndex;
                    const toggleValue = cmd.isToggle && cmd.getValue ? cmd.getValue() : undefined;

                    return (
                      <div
                        key={cmd.id}
                        className={`cp-item ${isSelected ? 'selected' : ''} ${cmd.disabled ? 'disabled' : ''} ${!ignoreMouseUntilMove ? 'hover-enabled' : ''}`}
                        onClick={() => !cmd.disabled && executeCommand(cmd)}
                        onMouseEnter={() => !cmd.disabled && !ignoreMouseUntilMove && setSelectedIndex(visualOrderCommands.indexOf(cmd))}
                      >
                        <span className="cp-label">{cmd.label}</span>
                        {cmd.isToggle && (
                          <span className={`cp-toggle ${toggleValue ? 'on' : 'off'}`}>
                            {toggleValue ? 'on' : 'off'}
                          </span>
                        )}
                        {cmd.hasSubmenu && <span className="cp-submenu-arrow">›</span>}
                        {cmd.shortcut && renderShortcut(cmd.shortcut)}
                      </div>
                    );
                  })}
                </div>
              ))
            )
          )}
        </div>
      </div>
    </div>
  );
};
