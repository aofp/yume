import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  IconX, IconPlus, IconMinus, IconSettings, IconPalette,
  IconPhoto, IconRotateClockwise, IconCrown, IconInfoCircle,
  IconWebhook, IconCommand, IconDatabase, IconBrain,
  IconTrash, IconDownload, IconUpload, IconAlertTriangle,
  IconCheck, IconEdit, IconSparkles, IconBolt, IconPuzzle
} from '@tabler/icons-react';
import './SettingsModal.css';
import './SettingsModalTabbed.css';
import { useClaudeCodeStore } from '../../stores/claudeCodeStore';
import { useLicenseStore } from '../../services/licenseManager';
import { FontPickerModal } from '../FontPicker/FontPickerModal';
import { AboutModal } from '../About/AboutModal';
import { HooksTab } from './HooksTab';
import { MCPTab } from './MCPTab';
import { PluginsTab } from './PluginsTab';
import { SkillsTab } from './SkillsTab';
import { ClaudeSelector } from './ClaudeSelector';
import { SystemPromptSelector } from './SystemPromptSelector';
import { invoke } from '@tauri-apps/api/core';
import { hooksService, HookScriptConfig } from '../../services/hooksService';
import { TabButton } from '../common/TabButton';
import { PluginBadge } from '../common/PluginBadge';
import { pluginService } from '../../services/pluginService';
import { ColorPicker } from './ColorPicker';

// electronAPI type is declared globally elsewhere

interface SettingsModalProps {
  onClose: () => void;
}

// Tab type definition
type SettingsTab = 'general' | 'theme' | 'hooks' | 'commands' | 'mcp' | 'plugins' | 'skills';

// Theme system - imported from shared config
import { BUILT_IN_THEMES, DEFAULT_THEME, DEFAULT_COLORS, type Theme } from '../../config/themes';

export const SettingsModalTabbed: React.FC<SettingsModalProps> = ({ onClose }) => {
  const { isLicensed } = useLicenseStore();
  const [activeTab, setActiveTab] = useState<SettingsTab>('theme');
  const [isDragging, setIsDragging] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);
  const [zoomLevel, setZoomLevel] = useState(0);
  const [backgroundColor, setBackgroundColor] = useState(DEFAULT_COLORS.background);
  const [foregroundColor, setForegroundColor] = useState(DEFAULT_COLORS.foreground);
  const [accentColor, setAccentColor] = useState(DEFAULT_COLORS.accent);
  const [positiveColor, setPositiveColor] = useState(DEFAULT_COLORS.positive);
  const [negativeColor, setNegativeColor] = useState(DEFAULT_COLORS.negative);
  const [htmlOpacity, setHtmlOpacity] = useState(1.0);
  const [showColorPicker, setShowColorPicker] = useState<'background' | 'foreground' | 'accent' | 'positive' | 'negative' | null>(null);
  const [hoveredColorType, setHoveredColorType] = useState<string | null>(null);
  const [previewColor, setPreviewColor] = useState<string | null>(null);
  const [showFontPicker, setShowFontPicker] = useState<'monospace' | 'sans-serif' | null>(null);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Theme system state
  const [customThemes, setCustomThemes] = useState<Theme[]>([]);
  const [currentThemeId, setCurrentThemeId] = useState<string>('default');
  const [presetDropdownOpen, setPresetDropdownOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [isKeyboardNav, setIsKeyboardNav] = useState(false);
  const themeJustAppliedRef = useRef(false);
  const presetDropdownRef = useRef<HTMLDivElement>(null);
  const dropdownMenuRef = useRef<HTMLDivElement>(null);
  const triggerButtonRef = useRef<HTMLButtonElement>(null);
  const {
    globalWatermarkImage, setGlobalWatermark,
    monoFont, sansFont, setMonoFont, setSansFont,
    rememberTabs, setRememberTabs,
    autoGenerateTitle, setAutoGenerateTitle,
    wordWrapCode, setWordWrapCode,
    soundOnComplete, setSoundOnComplete, playCompletionSound,
    showResultStats, setShowResultStats,
    showProjectsMenu, setShowProjectsMenu,
    showAgentsMenu, setShowAgentsMenu,
    showAnalyticsMenu, setShowAnalyticsMenu,
    showCommandsSettings, setShowCommandsSettings,
    showMcpSettings, setShowMcpSettings,
    showHooksSettings, setShowHooksSettings,
    showPluginsSettings, setShowPluginsSettings,
    showSkillsSettings, setShowSkillsSettings,
    backgroundOpacity, setBackgroundOpacity
  } = useClaudeCodeStore();

  // Handle escape key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Close any sub-modals first
        if (showColorPicker) {
          setShowColorPicker(null);
        } else if (showFontPicker) {
          setShowFontPicker(null);
        } else if (showAboutModal) {
          setShowAboutModal(false);
        } else {
          onClose();
        }
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose, showColorPicker, showFontPicker, showAboutModal]);

  // Handle drag cursor on settings header
  useEffect(() => {
    const handleMouseDown = async (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('button') || target.closest('input')) {
        return;
      }
      setIsDragging(true);
      try {
        if ((window as any).__TAURI__) {
          const windowApi = await import('@tauri-apps/api/window') as any;
          let appWindow;
          if (windowApi.getCurrent) {
            appWindow = windowApi.getCurrent();
          } else if (windowApi.appWindow) {
            appWindow = windowApi.appWindow;
          } else if (windowApi.Window?.getCurrent) {
            appWindow = windowApi.Window.getCurrent();
          }
          if (appWindow) {
            await appWindow.startDragging();
          }
        }
      } catch (error) {
        console.error('Settings: Error starting drag:', error);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    const element = headerRef.current;
    if (element) {
      element.addEventListener('mousedown', handleMouseDown);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        element.removeEventListener('mousedown', handleMouseDown);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, []);

  // Hooks tab state
  const [hooks, setHooks] = useState<HookScriptConfig[]>([]);
  const [selectedHooks, setSelectedHooks] = useState<Record<string, boolean>>({});
  const [hookScripts, setHookScripts] = useState<Record<string, string>>({});

  // Commands tab state
  const [commands, setCommands] = useState<any[]>([]);
  const [pluginCommands, setPluginCommands] = useState<Array<{
    name: string;
    description: string;
    pluginName: string;
  }>>([]);
  const [showAddCommand, setShowAddCommand] = useState(false);
  const [editingCommandIndex, setEditingCommandIndex] = useState<number | null>(null);
  const [newCommand, setNewCommand] = useState({ trigger: '', description: '', script: '' });
  const [editingCommand, setEditingCommand] = useState({ trigger: '', description: '', script: '' });

  useEffect(() => {
    // Load hooks when hooks tab is active
    if (activeTab === 'hooks') {
      loadHooks();
    }
    // Load commands when commands tab is active
    if (activeTab === 'commands') {
      const saved = localStorage.getItem('custom_commands');
      if (saved) {
        try {
          setCommands(JSON.parse(saved));
        } catch (error) {
          console.error('Failed to load commands:', error);
        }
      }
      // Load plugin commands
      const loadPluginCommands = async () => {
        await pluginService.initialize();
        const cmds = pluginService.getEnabledPluginCommands();
        setPluginCommands(cmds.map(c => ({
          name: c.name.includes('--') ? c.name.split('--')[1] : c.name,
          description: c.description,
          pluginName: c.pluginName
        })));
      };
      loadPluginCommands();
    }
  }, [activeTab]);

  const loadHooks = () => {
    const allHooks = hooksService.getAllHooks();
    setHooks(allHooks);
  };

  useEffect(() => {
    // Get current zoom level
    const getZoom = async () => {
      if (window.electronAPI?.zoom?.getLevel) {
        try {
          const level = await window.electronAPI.zoom.getLevel();
          setZoomLevel(level);
        } catch (err) {
          console.error('Failed to get zoom level:', err);
          const saved = localStorage.getItem('zoomLevel');
          if (saved) {
            setZoomLevel(parseFloat(saved));
          }
        }
      } else {
        const saved = localStorage.getItem('zoomLevel');
        if (saved) {
          setZoomLevel(parseFloat(saved));
        }
      }
    };
    getZoom();

    // Get saved colors and apply them
    const savedBackgroundColor = localStorage.getItem('backgroundColor') || DEFAULT_COLORS.background;
    setBackgroundColor(savedBackgroundColor);
    document.documentElement.style.setProperty('--background-color', savedBackgroundColor);
    const bgHex = savedBackgroundColor.replace('#', '');
    const bgR = parseInt(bgHex.substr(0, 2), 16);
    const bgG = parseInt(bgHex.substr(2, 2), 16);
    const bgB = parseInt(bgHex.substr(4, 2), 16);
    document.documentElement.style.setProperty('--background-rgb', `${bgR}, ${bgG}, ${bgB}`);

    const savedForegroundColor = localStorage.getItem('foregroundColor') || DEFAULT_COLORS.foreground;
    setForegroundColor(savedForegroundColor);
    document.documentElement.style.setProperty('--foreground-color', savedForegroundColor);
    const fgHex = savedForegroundColor.replace('#', '');
    const fgR = parseInt(fgHex.substr(0, 2), 16);
    const fgG = parseInt(fgHex.substr(2, 2), 16);
    const fgB = parseInt(fgHex.substr(4, 2), 16);
    document.documentElement.style.setProperty('--foreground-rgb', `${fgR}, ${fgG}, ${fgB}`);

    const savedAccentColor = localStorage.getItem('accentColor') || DEFAULT_COLORS.accent;
    setAccentColor(savedAccentColor);
    document.documentElement.style.setProperty('--accent-color', savedAccentColor);
    const accentHex = savedAccentColor.replace('#', '');
    const accentR = parseInt(accentHex.substr(0, 2), 16);
    const accentG = parseInt(accentHex.substr(2, 2), 16);
    const accentB = parseInt(accentHex.substr(4, 2), 16);
    document.documentElement.style.setProperty('--accent-rgb', `${accentR}, ${accentG}, ${accentB}`);

    const savedPositiveColor = localStorage.getItem('positiveColor') || DEFAULT_COLORS.positive;
    setPositiveColor(savedPositiveColor);
    document.documentElement.style.setProperty('--positive-color', savedPositiveColor);
    const positiveHex = savedPositiveColor.replace('#', '');
    const positiveR = parseInt(positiveHex.substr(0, 2), 16);
    const positiveG = parseInt(positiveHex.substr(2, 2), 16);
    const positiveB = parseInt(positiveHex.substr(4, 2), 16);
    document.documentElement.style.setProperty('--positive-rgb', `${positiveR}, ${positiveG}, ${positiveB}`);

    const savedNegativeColor = localStorage.getItem('negativeColor') || DEFAULT_COLORS.negative;
    setNegativeColor(savedNegativeColor);
    document.documentElement.style.setProperty('--negative-color', savedNegativeColor);
    const negativeHex = savedNegativeColor.replace('#', '');
    const negativeR = parseInt(negativeHex.substr(0, 2), 16);
    const negativeG = parseInt(negativeHex.substr(2, 2), 16);
    const negativeB = parseInt(negativeHex.substr(4, 2), 16);
    document.documentElement.style.setProperty('--negative-rgb', `${negativeR}, ${negativeG}, ${negativeB}`);

    // Load html opacity (user setting, not theme)
    const savedHtmlOpacity = localStorage.getItem('htmlOpacity');
    const opacityValue = savedHtmlOpacity ? parseFloat(savedHtmlOpacity) : 1.0;
    setHtmlOpacity(opacityValue);
    document.documentElement.style.opacity = opacityValue.toString();

    // Listen for zoom changes
    const handleZoomChange = (e: any) => {
      setZoomLevel(e.detail);
    };
    window.addEventListener('zoom-changed', handleZoomChange);
    return () => window.removeEventListener('zoom-changed', handleZoomChange);
  }, []);

  // Load custom themes and current theme from localStorage
  useEffect(() => {
    const savedCustomThemes = localStorage.getItem('customThemes');
    if (savedCustomThemes) {
      try {
        setCustomThemes(JSON.parse(savedCustomThemes));
      } catch (e) {
        console.error('Failed to parse custom themes:', e);
      }
    }
    const savedCurrentTheme = localStorage.getItem('currentThemeId');
    if (savedCurrentTheme) {
      setCurrentThemeId(savedCurrentTheme);
    }
  }, []);

  // Get all themes for keyboard nav
  const allThemes = [...BUILT_IN_THEMES, ...customThemes];

  // Close preset dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const clickedTrigger = presetDropdownRef.current?.contains(target);
      const clickedMenu = dropdownMenuRef.current?.contains(target);
      console.log('handleClickOutside', { clickedTrigger, clickedMenu, themeJustApplied: themeJustAppliedRef.current });
      if (!clickedTrigger && !clickedMenu) {
        if (!themeJustAppliedRef.current) {
          restoreCurrentTheme(true);
        }
        themeJustAppliedRef.current = false;
        setPresetDropdownOpen(false);
        setFocusedIndex(-1);
        setIsKeyboardNav(false);
      }
    };
    if (presetDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [presetDropdownOpen]);

  // Keyboard navigation for dropdown
  useEffect(() => {
    if (!presetDropdownOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setIsKeyboardNav(true);
          setFocusedIndex(prev => prev < 0 ? 0 : Math.min(prev + 1, allThemes.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setIsKeyboardNav(true);
          setFocusedIndex(prev => prev < 0 ? allThemes.length - 1 : Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < allThemes.length) {
            applyTheme(allThemes[focusedIndex]);
            setPresetDropdownOpen(false);
            setFocusedIndex(-1);
          }
          break;
        case 'Escape':
          e.preventDefault();
          restoreCurrentTheme(true);
          setPresetDropdownOpen(false);
          setFocusedIndex(-1);
          triggerButtonRef.current?.focus();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [presetDropdownOpen, focusedIndex, allThemes]);

  // Preview focused theme
  useEffect(() => {
    if (presetDropdownOpen && focusedIndex >= 0 && focusedIndex < allThemes.length) {
      previewTheme(allThemes[focusedIndex]);
    }
  }, [focusedIndex, presetDropdownOpen]);

  // Preview theme on hover
  const previewTheme = (theme: Theme) => {
    document.documentElement.style.setProperty('--background-color', theme.backgroundColor);
    const bgHex = theme.backgroundColor.replace('#', '');
    document.documentElement.style.setProperty('--background-rgb', `${parseInt(bgHex.substr(0, 2), 16)}, ${parseInt(bgHex.substr(2, 2), 16)}, ${parseInt(bgHex.substr(4, 2), 16)}`);
    document.documentElement.style.setProperty('--foreground-color', theme.foregroundColor);
    const fgHex = theme.foregroundColor.replace('#', '');
    document.documentElement.style.setProperty('--foreground-rgb', `${parseInt(fgHex.substr(0, 2), 16)}, ${parseInt(fgHex.substr(2, 2), 16)}, ${parseInt(fgHex.substr(4, 2), 16)}`);
    document.documentElement.style.setProperty('--accent-color', theme.accentColor);
    const accentHex = theme.accentColor.replace('#', '');
    document.documentElement.style.setProperty('--accent-rgb', `${parseInt(accentHex.substr(0, 2), 16)}, ${parseInt(accentHex.substr(2, 2), 16)}, ${parseInt(accentHex.substr(4, 2), 16)}`);
    document.documentElement.style.setProperty('--positive-color', theme.positiveColor);
    document.documentElement.style.setProperty('--negative-color', theme.negativeColor);
  };

  // Restore current theme after preview (only if dropdown still open)
  const restoreCurrentTheme = (force = false) => {
    // Don't restore if dropdown was just closed (theme was applied)
    if (!force && !presetDropdownOpen) return;
    document.documentElement.style.setProperty('--background-color', backgroundColor);
    const bgHex = backgroundColor.replace('#', '');
    document.documentElement.style.setProperty('--background-rgb', `${parseInt(bgHex.substr(0, 2), 16)}, ${parseInt(bgHex.substr(2, 2), 16)}, ${parseInt(bgHex.substr(4, 2), 16)}`);
    document.documentElement.style.setProperty('--foreground-color', foregroundColor);
    const fgHex = foregroundColor.replace('#', '');
    document.documentElement.style.setProperty('--foreground-rgb', `${parseInt(fgHex.substr(0, 2), 16)}, ${parseInt(fgHex.substr(2, 2), 16)}, ${parseInt(fgHex.substr(4, 2), 16)}`);
    document.documentElement.style.setProperty('--accent-color', accentColor);
    const accentHex = accentColor.replace('#', '');
    document.documentElement.style.setProperty('--accent-rgb', `${parseInt(accentHex.substr(0, 2), 16)}, ${parseInt(accentHex.substr(2, 2), 16)}, ${parseInt(accentHex.substr(4, 2), 16)}`);
    document.documentElement.style.setProperty('--positive-color', positiveColor);
    document.documentElement.style.setProperty('--negative-color', negativeColor);
  };

  // Find current theme object
  const getCurrentTheme = (): Theme | null => {
    return allThemes.find(t => t.id === currentThemeId) || null;
  };

  // Check if current colors match a theme
  const findMatchingTheme = (): Theme | null => {
    return allThemes.find(t =>
      t.backgroundColor === backgroundColor &&
      t.foregroundColor === foregroundColor &&
      t.accentColor === accentColor &&
      t.positiveColor === positiveColor &&
      t.negativeColor === negativeColor
    ) || null;
  };

  // Detect if colors have been modified from any theme
  useEffect(() => {
    const matchingTheme = findMatchingTheme();
    if (matchingTheme) {
      setCurrentThemeId(matchingTheme.id);
      localStorage.setItem('currentThemeId', matchingTheme.id);
    } else if (currentThemeId !== 'custom') {
      // Colors don't match any theme - switch to custom
      setCurrentThemeId('custom');
      localStorage.setItem('currentThemeId', 'custom');
    }
  }, [backgroundColor, foregroundColor, accentColor, positiveColor, negativeColor]);

  // Apply a theme (fonts are independent of themes)
  const applyTheme = (theme: Theme) => {
    console.log('applyTheme called', theme.id);
    themeJustAppliedRef.current = true;
    handleBackgroundColorChange(theme.backgroundColor);
    handleForegroundColorChange(theme.foregroundColor);
    handleAccentColorChange(theme.accentColor);
    handlePositiveColorChange(theme.positiveColor);
    handleNegativeColorChange(theme.negativeColor);
    setCurrentThemeId(theme.id);
    localStorage.setItem('currentThemeId', theme.id);
    setPresetDropdownOpen(false);
    setFocusedIndex(-1);
  };

  // Save current colors as a new custom theme (or update existing by name)
  const saveAsCustomTheme = (name: string) => {
    const existingTheme = customThemes.find(t => t.name.toLowerCase() === name.toLowerCase());

    if (existingTheme) {
      // Update existing theme with current colors (fonts are independent of themes)
      const updatedThemes = customThemes.map(t =>
        t.id === existingTheme.id
          ? { ...t, backgroundColor, foregroundColor, accentColor, positiveColor, negativeColor }
          : t
      );
      setCustomThemes(updatedThemes);
      localStorage.setItem('customThemes', JSON.stringify(updatedThemes));
      setCurrentThemeId(existingTheme.id);
      localStorage.setItem('currentThemeId', existingTheme.id);
    } else {
      // Create new theme (fonts are independent of themes)
      const newTheme: Theme = {
        id: `custom-${Date.now()}`,
        name: name,
        backgroundColor,
        foregroundColor,
        accentColor,
        positiveColor,
        negativeColor,
        isBuiltIn: false
      };
      const updatedThemes = [...customThemes, newTheme];
      setCustomThemes(updatedThemes);
      localStorage.setItem('customThemes', JSON.stringify(updatedThemes));
      setCurrentThemeId(newTheme.id);
      localStorage.setItem('currentThemeId', newTheme.id);
    }
  };

  // Rename a custom theme
  const renameTheme = (themeId: string, newName: string) => {
    const updatedThemes = customThemes.map(t =>
      t.id === themeId ? { ...t, name: newName } : t
    );
    setCustomThemes(updatedThemes);
    localStorage.setItem('customThemes', JSON.stringify(updatedThemes));
    setEditingThemeName(null);
  };

  // Delete a custom theme
  const deleteTheme = (themeId: string) => {
    const updatedThemes = customThemes.filter(t => t.id !== themeId);
    setCustomThemes(updatedThemes);
    localStorage.setItem('customThemes', JSON.stringify(updatedThemes));
    if (currentThemeId === themeId) {
      // Switch back to default theme
      const defaultTheme = BUILT_IN_THEMES[0];
      applyTheme(defaultTheme);
    }
  };

  // Check if current colors differ from the selected theme
  const hasThemeChanges = (): boolean => {
    if (currentThemeId === 'custom') return false;
    const theme = getCurrentTheme();
    if (!theme) return false;
    return (
      theme.backgroundColor !== backgroundColor ||
      theme.foregroundColor !== foregroundColor ||
      theme.accentColor !== accentColor ||
      theme.positiveColor !== positiveColor ||
      theme.negativeColor !== negativeColor
    );
  };

  // Reset to current theme's original colors
  const resetToCurrentTheme = () => {
    const theme = getCurrentTheme();
    if (theme) {
      handleBackgroundColorChange(theme.backgroundColor);
      handleForegroundColorChange(theme.foregroundColor);
      handleAccentColorChange(theme.accentColor);
      handlePositiveColorChange(theme.positiveColor);
      handleNegativeColorChange(theme.negativeColor);
    }
  };

  // Get display name for current theme
  const getCurrentThemeDisplayName = (): string => {
    if (currentThemeId === 'custom') return 'custom';
    const theme = getCurrentTheme();
    const name = theme?.name || 'custom';
    return hasThemeChanges() ? `${name}*` : name;
  };

  // Get current theme's default value for a specific color type
  const getThemeDefault = (colorType: 'foreground' | 'accent' | 'positive' | 'negative' | 'background'): string => {
    const theme = getCurrentTheme();
    if (!theme) {
      // Fallback to default theme values
      return DEFAULT_COLORS[colorType];
    }
    const map = {
      foreground: theme.foregroundColor,
      accent: theme.accentColor,
      positive: theme.positiveColor,
      negative: theme.negativeColor,
      background: theme.backgroundColor
    };
    return map[colorType];
  };

  // Get default yurucode font (fonts are independent of themes)
  const getThemeFontDefault = (fontType: 'mono' | 'sans'): string => {
    return fontType === 'mono' ? 'Comic Mono' : 'Comic Neue';
  };

  const handleWatermarkUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file size (limit to 1MB)
    if (file.size > 1024 * 1024) {
      alert('Image must be less than 1MB');
      return;
    }

    // Convert to base64
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setGlobalWatermark(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveWatermark = () => {
    setGlobalWatermark(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };


  const handleZoomIn = async () => {
    if (window.electronAPI?.zoom?.in) {
      try {
        const newZoom = await window.electronAPI.zoom.in();
        if (newZoom !== null && newZoom !== undefined) {
          setZoomLevel(newZoom);
        }
      } catch (err) {
        console.error('Zoom in error:', err);
      }
    }
  };

  const handleZoomOut = async () => {
    if (window.electronAPI?.zoom?.out) {
      try {
        const newZoom = await window.electronAPI.zoom.out();
        if (newZoom !== null && newZoom !== undefined) {
          setZoomLevel(newZoom);
        }
      } catch (err) {
        console.error('Zoom out error:', err);
      }
    }
  };

  const handleResetZoom = async () => {
    if (window.electronAPI?.zoom?.reset) {
      try {
        const newZoom = await window.electronAPI.zoom.reset();
        if (newZoom !== null && newZoom !== undefined) {
          setZoomLevel(0);
        }
      } catch (err) {
        console.error('Reset zoom error:', err);
      }
    }
  };

  const handleBackgroundColorChange = (color: string) => {
    setBackgroundColor(color);
    localStorage.setItem('backgroundColor', color);
    document.documentElement.style.setProperty('--background-color', color);
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    document.documentElement.style.setProperty('--background-rgb', `${r}, ${g}, ${b}`);
  };

  const handleForegroundColorChange = (color: string) => {
    setForegroundColor(color);
    localStorage.setItem('foregroundColor', color);
    document.documentElement.style.setProperty('--foreground-color', color);
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    document.documentElement.style.setProperty('--foreground-rgb', `${r}, ${g}, ${b}`);
  };

  const handleAccentColorChange = (color: string) => {
    setAccentColor(color);
    localStorage.setItem('accentColor', color);
    document.documentElement.style.setProperty('--accent-color', color);
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    document.documentElement.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
  };

  const handlePositiveColorChange = (color: string) => {
    setPositiveColor(color);
    localStorage.setItem('positiveColor', color);
    document.documentElement.style.setProperty('--positive-color', color);
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    document.documentElement.style.setProperty('--positive-rgb', `${r}, ${g}, ${b}`);
  };

  const handleNegativeColorChange = (color: string) => {
    setNegativeColor(color);
    localStorage.setItem('negativeColor', color);
    document.documentElement.style.setProperty('--negative-color', color);
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    document.documentElement.style.setProperty('--negative-rgb', `${r}, ${g}, ${b}`);
  };

  const handleHtmlOpacityChange = (value: number) => {
    const clamped = Math.max(0.70, Math.min(1.00, value));
    const rounded = Math.round(clamped * 100) / 100;
    setHtmlOpacity(rounded);
    localStorage.setItem('htmlOpacity', rounded.toString());
    document.documentElement.style.opacity = rounded.toString();
  };

  // Preview color on hover (temporary, not saved)
  const handleColorPreview = (color: string) => {
    setPreviewColor(color);
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);

    if (showColorPicker === 'background') {
      document.documentElement.style.setProperty('--background-color', color);
      document.documentElement.style.setProperty('--background-rgb', `${r}, ${g}, ${b}`);
    } else if (showColorPicker === 'foreground') {
      document.documentElement.style.setProperty('--foreground-color', color);
      document.documentElement.style.setProperty('--foreground-rgb', `${r}, ${g}, ${b}`);
    } else if (showColorPicker === 'accent') {
      document.documentElement.style.setProperty('--accent-color', color);
      document.documentElement.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
    } else if (showColorPicker === 'positive') {
      document.documentElement.style.setProperty('--positive-color', color);
      document.documentElement.style.setProperty('--positive-rgb', `${r}, ${g}, ${b}`);
    } else if (showColorPicker === 'negative') {
      document.documentElement.style.setProperty('--negative-color', color);
      document.documentElement.style.setProperty('--negative-rgb', `${r}, ${g}, ${b}`);
    }
  };

  // Restore original color when hover ends
  const handleColorPreviewEnd = () => {
    setPreviewColor(null);

    // Restore the actual saved colors
    const restoreColor = (color: string, varName: string, rgbVarName: string) => {
      document.documentElement.style.setProperty(varName, color);
      const hex = color.replace('#', '');
      const r = parseInt(hex.substr(0, 2), 16);
      const g = parseInt(hex.substr(2, 2), 16);
      const b = parseInt(hex.substr(4, 2), 16);
      document.documentElement.style.setProperty(rgbVarName, `${r}, ${g}, ${b}`);
    };

    if (showColorPicker === 'background') {
      restoreColor(backgroundColor, '--background-color', '--background-rgb');
    } else if (showColorPicker === 'foreground') {
      restoreColor(foregroundColor, '--foreground-color', '--foreground-rgb');
    } else if (showColorPicker === 'accent') {
      restoreColor(accentColor, '--accent-color', '--accent-rgb');
    } else if (showColorPicker === 'positive') {
      restoreColor(positiveColor, '--positive-color', '--positive-rgb');
    } else if (showColorPicker === 'negative') {
      restoreColor(negativeColor, '--negative-color', '--negative-rgb');
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'general':
        return (
          <>
            {/* All settings in two columns */}
            <div className="settings-section">
              <div className="settings-columns">
                {/* Left column: Options + Menu */}
                <div className="settings-column">
                  <h4>options</h4>

                  <div className="checkbox-setting compact">
                    <span className="checkbox-label">remember tabs</span>
                    <div
                      className={`toggle-switch compact ${rememberTabs ? 'active' : ''}`}
                      onClick={() => setRememberTabs(!rememberTabs)}
                    >
                      <span className="toggle-switch-label off">off</span>
                      <span className="toggle-switch-label on">on</span>
                      <div className="toggle-switch-slider" />
                    </div>
                  </div>

                  <div className="checkbox-setting compact">
                    <span className="checkbox-label">auto-generate titles</span>
                    <div
                      className={`toggle-switch compact ${autoGenerateTitle ? 'active' : ''}`}
                      onClick={() => setAutoGenerateTitle(!autoGenerateTitle)}
                    >
                      <span className="toggle-switch-label off">off</span>
                      <span className="toggle-switch-label on">on</span>
                      <div className="toggle-switch-slider" />
                    </div>
                  </div>

                  <div className="checkbox-setting compact">
                    <span className="checkbox-label">show result stats</span>
                    <div
                      className={`toggle-switch compact ${showResultStats ? 'active' : ''}`}
                      onClick={() => setShowResultStats(!showResultStats)}
                    >
                      <span className="toggle-switch-label off">off</span>
                      <span className="toggle-switch-label on">on</span>
                      <div className="toggle-switch-slider" />
                    </div>
                  </div>

                  
                  <div className="checkbox-setting compact">
                    <span className="checkbox-label">sound on complete</span>
                    <div
                      className={`toggle-switch compact ${soundOnComplete ? 'active' : ''}`}
                      onClick={() => {
                        const newValue = !soundOnComplete;
                        setSoundOnComplete(newValue);
                        // Play a preview of the sound when enabling
                        if (newValue) {
                          setTimeout(() => playCompletionSound(), 100);
                        }
                      }}
                    >
                      <span className="toggle-switch-label off">off</span>
                      <span className="toggle-switch-label on">on</span>
                      <div className="toggle-switch-slider" />
                    </div>
                  </div>

                  <h4 style={{ marginTop: '16px' }}>menu</h4>

                  <div className="checkbox-setting compact">
                    <span className="checkbox-label">agents</span>
                    <div
                      className={`toggle-switch compact ${showAgentsMenu ? 'active' : ''}`}
                      onClick={() => setShowAgentsMenu(!showAgentsMenu)}
                    >
                      <span className="toggle-switch-label off">off</span>
                      <span className="toggle-switch-label on">on</span>
                      <div className="toggle-switch-slider" />
                    </div>
                  </div>

                  <div className="checkbox-setting compact">
                    <span className="checkbox-label">analytics</span>
                    <div
                      className={`toggle-switch compact ${showAnalyticsMenu ? 'active' : ''}`}
                      onClick={() => setShowAnalyticsMenu(!showAnalyticsMenu)}
                    >
                      <span className="toggle-switch-label off">off</span>
                      <span className="toggle-switch-label on">on</span>
                      <div className="toggle-switch-slider" />
                    </div>
                  </div>

                  <div className="checkbox-setting compact">
                    <span className="checkbox-label">projects</span>
                    <div
                      className={`toggle-switch compact ${showProjectsMenu ? 'active' : ''}`}
                      onClick={() => setShowProjectsMenu(!showProjectsMenu)}
                    >
                      <span className="toggle-switch-label off">off</span>
                      <span className="toggle-switch-label on">on</span>
                      <div className="toggle-switch-slider" />
                    </div>
                  </div>
                </div>

                {/* Right column: Claude Code + Settings */}
                <div className="settings-column">
                  <h4>claude code</h4>
                  <ClaudeSelector onSettingsChange={(settings) => {
                    console.log('Claude settings updated:', settings);
                  }} />
                  <SystemPromptSelector onSettingsChange={(settings) => {
                    console.log('System prompt settings updated:', settings);
                  }} />

                  <h4 style={{ marginTop: '16px' }}>settings</h4>

                  <div className="checkbox-setting compact">
                    <span className="checkbox-label">commands</span>
                    <div
                      className={`toggle-switch compact ${showCommandsSettings ? 'active' : ''}`}
                      onClick={() => setShowCommandsSettings(!showCommandsSettings)}
                    >
                      <span className="toggle-switch-label off">off</span>
                      <span className="toggle-switch-label on">on</span>
                      <div className="toggle-switch-slider" />
                    </div>
                  </div>

                  <div className="checkbox-setting compact">
                    <span className="checkbox-label">mcp</span>
                    <div
                      className={`toggle-switch compact ${showMcpSettings ? 'active' : ''}`}
                      onClick={() => setShowMcpSettings(!showMcpSettings)}
                    >
                      <span className="toggle-switch-label off">off</span>
                      <span className="toggle-switch-label on">on</span>
                      <div className="toggle-switch-slider" />
                    </div>
                  </div>

                  <div className="checkbox-setting compact">
                    <span className="checkbox-label">hooks</span>
                    <div
                      className={`toggle-switch compact ${showHooksSettings ? 'active' : ''}`}
                      onClick={() => setShowHooksSettings(!showHooksSettings)}
                    >
                      <span className="toggle-switch-label off">off</span>
                      <span className="toggle-switch-label on">on</span>
                      <div className="toggle-switch-slider" />
                    </div>
                  </div>

                  <div className="checkbox-setting compact">
                    <span className="checkbox-label">plugins</span>
                    <div
                      className={`toggle-switch compact ${showPluginsSettings ? 'active' : ''}`}
                      onClick={() => setShowPluginsSettings(!showPluginsSettings)}
                    >
                      <span className="toggle-switch-label off">off</span>
                      <span className="toggle-switch-label on">on</span>
                      <div className="toggle-switch-slider" />
                    </div>
                  </div>

                  <div className="checkbox-setting compact">
                    <span className="checkbox-label">skills</span>
                    <div
                      className={`toggle-switch compact ${showSkillsSettings ? 'active' : ''}`}
                      onClick={() => setShowSkillsSettings(!showSkillsSettings)}
                    >
                      <span className="toggle-switch-label off">off</span>
                      <span className="toggle-switch-label on">on</span>
                      <div className="toggle-switch-slider" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions removed from general tab - now in bottom controls */}
          </>
        );

      case 'hooks':
        return (
          <HooksTab
            selectedHooks={selectedHooks}
            setSelectedHooks={setSelectedHooks}
            hookScripts={hookScripts}
            setHookScripts={setHookScripts}
          />
        );

      case 'theme':
        return (
          <>
            {/* Two column layout like general tab */}
            <div className="settings-section">
              <div className="settings-columns">
                {/* Left column: Theme + Colors */}
                <div className="settings-column">
                  <h4>theme</h4>
                  <div className="checkbox-setting compact">
                    <span className="checkbox-label">preset</span>
                    <div className="theme-controls-bg" ref={presetDropdownRef}>
                      <div className="preset-dropdown-container">
                        <button
                          ref={triggerButtonRef}
                          className="preset-dropdown-trigger"
                          onClick={() => {
                            if (!presetDropdownOpen && triggerButtonRef.current) {
                              const rect = triggerButtonRef.current.getBoundingClientRect();
                              setDropdownPosition({ top: rect.bottom + 2, left: rect.left });
                            }
                            setPresetDropdownOpen(!presetDropdownOpen);
                          }}
                        >
                          {getCurrentThemeDisplayName()}
                        </button>
                        {presetDropdownOpen && createPortal(
                          <div ref={dropdownMenuRef} className="preset-dropdown-menu" style={{ top: dropdownPosition.top, left: dropdownPosition.left }} onMouseLeave={() => restoreCurrentTheme(true)}>
                            {BUILT_IN_THEMES.map((theme, idx) => (
                              <div
                                key={theme.id}
                                className={`preset-dropdown-item ${currentThemeId === theme.id ? 'active' : ''} ${isKeyboardNav && focusedIndex === idx ? 'focused' : ''}`}
                                onMouseEnter={() => { setIsKeyboardNav(false); setFocusedIndex(-1); previewTheme(theme); }}
                                onMouseDown={(e) => {
                                  e.stopPropagation();
                                  applyTheme(theme);
                                  setPresetDropdownOpen(false);
                                  setFocusedIndex(-1);
                                }}
                              >
                                {theme.name}
                              </div>
                            ))}
                            {customThemes.length > 0 && (
                              <>
                                <div className="preset-dropdown-divider" />
                                {customThemes.map((theme, idx) => (
                                  <div
                                    key={theme.id}
                                    className={`preset-dropdown-item ${currentThemeId === theme.id ? 'active' : ''} ${isKeyboardNav && focusedIndex === BUILT_IN_THEMES.length + idx ? 'focused' : ''}`}
                                    onMouseEnter={() => { setIsKeyboardNav(false); setFocusedIndex(-1); previewTheme(theme); }}
                                    onMouseDown={(e) => {
                                      e.stopPropagation();
                                      applyTheme(theme);
                                      setPresetDropdownOpen(false);
                                      setFocusedIndex(-1);
                                    }}
                                  >
                                    {theme.name}
                                  </div>
                                ))}
                              </>
                            )}
                          </div>,
                          document.body
                        )}
                      </div>
                    </div>
                  </div>

                  <h4 style={{ marginTop: '16px' }}>colors</h4>
                  <div className="checkbox-setting compact">
                    <span className="checkbox-label">foreground</span>
                    <div className="theme-controls-bg">
                      <button className="color-reset" onClick={() => handleForegroundColorChange(getThemeDefault('foreground'))} disabled={foregroundColor === getThemeDefault('foreground')}>
                        <IconRotateClockwise size={10} />
                      </button>
                      <button className="color-preview" onClick={() => setShowColorPicker('foreground')}>
                        <span style={{ width: '12px', height: '12px', background: foregroundColor }} />
                      </button>
                    </div>
                  </div>
                  <div className="checkbox-setting compact">
                    <span className="checkbox-label">accent</span>
                    <div className="theme-controls-bg">
                      <button className="color-reset" onClick={() => handleAccentColorChange(getThemeDefault('accent'))} disabled={accentColor === getThemeDefault('accent')}>
                        <IconRotateClockwise size={10} />
                      </button>
                      <button className="color-preview" onClick={() => setShowColorPicker('accent')}>
                        <span style={{ width: '12px', height: '12px', background: accentColor }} />
                      </button>
                    </div>
                  </div>
                  <div className="checkbox-setting compact">
                    <span className="checkbox-label">positive</span>
                    <div className="theme-controls-bg">
                      <button className="color-reset" onClick={() => handlePositiveColorChange(getThemeDefault('positive'))} disabled={positiveColor === getThemeDefault('positive')}>
                        <IconRotateClockwise size={10} />
                      </button>
                      <button className="color-preview" onClick={() => setShowColorPicker('positive')}>
                        <span style={{ width: '12px', height: '12px', background: positiveColor }} />
                      </button>
                    </div>
                  </div>
                  <div className="checkbox-setting compact">
                    <span className="checkbox-label">negative</span>
                    <div className="theme-controls-bg">
                      <button className="color-reset" onClick={() => handleNegativeColorChange(getThemeDefault('negative'))} disabled={negativeColor === getThemeDefault('negative')}>
                        <IconRotateClockwise size={10} />
                      </button>
                      <button className="color-preview" onClick={() => setShowColorPicker('negative')}>
                        <span style={{ width: '12px', height: '12px', background: negativeColor }} />
                      </button>
                    </div>
                  </div>
                  <div className="checkbox-setting compact">
                    <span className="checkbox-label">background</span>
                    <div className="theme-controls-bg">
                      <button className="color-reset" onClick={() => handleBackgroundColorChange(getThemeDefault('background'))} disabled={backgroundColor === getThemeDefault('background')}>
                        <IconRotateClockwise size={10} />
                      </button>
                      <button className="color-preview" onClick={() => setShowColorPicker('background')}>
                        <span style={{ width: '12px', height: '12px', background: backgroundColor, border: '1px solid var(--fg-20)' }} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right column: Display + Fonts */}
                <div className="settings-column">
                  <h4>display</h4>
                  <div className="checkbox-setting compact">
                    <span className="checkbox-label">word wrap code</span>
                    <div className="theme-controls-bg">
                      <div
                        className={`toggle-switch compact ${wordWrapCode ? 'active' : ''}`}
                        onClick={() => setWordWrapCode(!wordWrapCode)}
                      >
                        <span className="toggle-switch-label off">off</span>
                        <span className="toggle-switch-label on">on</span>
                        <div className="toggle-switch-slider" />
                      </div>
                    </div>
                  </div>
                  <div className="checkbox-setting compact">
                    <span className="checkbox-label">opacity</span>
                    <div className="theme-controls-bg">
                      <span className="opacity-value">{Math.round(htmlOpacity * 100)}%</span>
                      <div className="opacity-container">
                        <input
                          type="range"
                          min="0.70"
                          max="1.00"
                          step="0.01"
                          value={htmlOpacity}
                          onChange={(e) => handleHtmlOpacityChange(parseFloat(e.target.value))}
                          className="opacity-slider"
                        />
                      </div>
                    </div>
                  </div>

                  <h4 style={{ marginTop: '16px' }}>fonts</h4>
                  <div className="checkbox-setting compact">
                    <span className="checkbox-label">monospace</span>
                    <div className="theme-controls-bg">
                      <button className="color-reset" onClick={() => setMonoFont(getThemeFontDefault('mono'))} disabled={monoFont === getThemeFontDefault('mono')}>
                        <IconRotateClockwise size={10} />
                      </button>
                      <div
                        className="font-input"
                        onClick={() => setShowFontPicker('monospace')}
                        style={{ fontFamily: monoFont || getThemeFontDefault('mono'), fontSize: '9.5px' }}
                      >
                        {monoFont || getThemeFontDefault('mono')}
                      </div>
                    </div>
                  </div>
                  <div className="checkbox-setting compact">
                    <span className="checkbox-label">sans-serif</span>
                    <div className="theme-controls-bg">
                      <button className="color-reset" onClick={() => setSansFont(getThemeFontDefault('sans'))} disabled={sansFont === getThemeFontDefault('sans')}>
                        <IconRotateClockwise size={10} />
                      </button>
                      <div
                        className="font-input"
                        onClick={() => setShowFontPicker('sans-serif')}
                        style={{ fontFamily: sansFont || getThemeFontDefault('sans') }}
                      >
                        {sansFont || getThemeFontDefault('sans')}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </>
        );

      case 'commands':
        return (
          <div className="settings-section">
            {/* Header with add button */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h4 style={{ fontSize: '11px', color: 'var(--accent-color)', margin: 0, fontWeight: 500, textTransform: 'lowercase' }}>custom commands</h4>
              {!showAddCommand && !editingCommandIndex && (
                <button
                  onClick={() => setShowAddCommand(true)}
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    color: 'rgba(255, 255, 255, 0.4)',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    cursor: 'default',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--accent-color)';
                    e.currentTarget.style.color = 'var(--accent-color)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                    e.currentTarget.style.color = 'rgba(255, 255, 255, 0.4)';
                  }}
                >
                  + add command
                </button>
              )}
            </div>

            <div className="commands-list">
              {commands.length === 0 && !showAddCommand && (
                <p style={{ fontSize: '10px', color: '#666' }}>
                  no custom commands yet
                </p>
              )}

              {/* Existing commands */}
              {commands.map((cmd, index) => (
                <div key={index} style={{ marginBottom: '12px' }}>
                  {editingCommandIndex === index ? (
                    // Edit mode
                    <div className="command-edit-form" style={{
                      padding: '8px',
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '4px'
                    }}>
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                        <input
                          type="text"
                          placeholder="/command"
                          className="command-trigger"
                          style={{ flex: '0 0 120px' }}
                          value={editingCommand.trigger}
                          onChange={(e) => setEditingCommand({ ...editingCommand, trigger: e.target.value })}
                        />
                        <input
                          type="text"
                          placeholder="description"
                          className="command-desc"
                          style={{ flex: '1' }}
                          value={editingCommand.description}
                          onChange={(e) => setEditingCommand({ ...editingCommand, description: e.target.value })}
                        />
                      </div>
                      <textarea
                        placeholder="action script..."
                        className="command-script"
                        rows={3}
                        value={editingCommand.script}
                        onChange={(e) => setEditingCommand({ ...editingCommand, script: e.target.value })}
                        style={{ marginBottom: '8px' }}
                      />
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => {
                            if (editingCommand.trigger && editingCommand.script) {
                              const updated = [...commands];
                              updated[index] = editingCommand;
                              setCommands(updated);
                              localStorage.setItem('custom_commands', JSON.stringify(updated));
                              setEditingCommandIndex(null);
                            }
                          }}
                          disabled={!editingCommand.trigger || !editingCommand.script}
                          style={{
                            flex: 1,
                            background: 'rgba(153, 187, 255, 0.1)',
                            border: '1px solid rgba(153, 187, 255, 0.3)',
                            color: '#99bbff',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            cursor: editingCommand.trigger && editingCommand.script ? 'default' : 'not-allowed',
                            opacity: editingCommand.trigger && editingCommand.script ? 1 : 0.5
                          }}
                        >
                          <IconCheck size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                          save
                        </button>
                        <button
                          onClick={() => setEditingCommandIndex(null)}
                          style={{
                            flex: 1,
                            background: 'transparent',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            color: 'rgba(255, 255, 255, 0.4)',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            cursor: 'default'
                          }}
                        >
                          <IconX size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                          cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    // View mode
                    <div className="command-view" style={{
                      padding: '6px 8px',
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '4px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{
                            color: 'var(--accent-color)',
                            fontSize: '11px',
                            fontFamily: 'var(--mono-font)'
                          }}>
                            {cmd.trigger}
                          </span>
                          {cmd.description && (
                            <span style={{
                              color: '#666',
                              fontSize: '10px',
                              marginLeft: '8px'
                            }}>
                              — {cmd.description}
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            onClick={() => {
                              setEditingCommand({ ...cmd });
                              setEditingCommandIndex(index);
                            }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#666',
                              cursor: 'default',
                              padding: '2px',
                              fontSize: '10px',
                              transition: 'color 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = 'var(--accent-color)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = '#666';
                            }}
                          >
                            <IconEdit size={10} />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Delete command "${cmd.trigger}"?`)) {
                                const updated = commands.filter((_, i) => i !== index);
                                setCommands(updated);
                                localStorage.setItem('custom_commands', JSON.stringify(updated));
                              }
                            }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#666',
                              cursor: 'default',
                              padding: '2px',
                              fontSize: '10px',
                              transition: 'color 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = '#ff9999';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = '#666';
                            }}
                          >
                            <IconTrash size={10} />
                          </button>
                        </div>
                      </div>
                      {cmd.script && (
                        <pre style={{
                          margin: '4px 0 0 0',
                          padding: '4px',
                          background: 'rgba(0, 0, 0, 0.3)',
                          borderRadius: '2px',
                          fontSize: '9px',
                          color: '#888',
                          fontFamily: 'var(--mono-font)',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-all',
                          maxHeight: '60px',
                          overflow: 'auto'
                        }}>
                          {cmd.script}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {/* Add new command form */}
              {showAddCommand && (
                <div className="command-edit-form" style={{
                  padding: '8px',
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '4px'
                }}>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                    <input
                      type="text"
                      placeholder="/command"
                      className="command-trigger"
                      style={{ flex: '0 0 120px' }}
                      value={newCommand.trigger}
                      onChange={(e) => setNewCommand({ ...newCommand, trigger: e.target.value })}
                    />
                    <input
                      type="text"
                      placeholder="description"
                      className="command-desc"
                      style={{ flex: '1' }}
                      value={newCommand.description}
                      onChange={(e) => setNewCommand({ ...newCommand, description: e.target.value })}
                    />
                  </div>
                  <textarea
                    placeholder="action script..."
                    className="command-script"
                    rows={3}
                    value={newCommand.script}
                    onChange={(e) => setNewCommand({ ...newCommand, script: e.target.value })}
                    style={{ marginBottom: '8px' }}
                  />
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => {
                        if (newCommand.trigger && newCommand.script) {
                          const updated = [...commands, newCommand];
                          setCommands(updated);
                          localStorage.setItem('custom_commands', JSON.stringify(updated));
                          setNewCommand({ trigger: '', description: '', script: '' });
                          setShowAddCommand(false);
                        }
                      }}
                      disabled={!newCommand.trigger || !newCommand.script}
                      style={{
                        flex: 1,
                        background: 'rgba(153, 187, 255, 0.1)',
                        border: '1px solid rgba(153, 187, 255, 0.3)',
                        color: '#99bbff',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        cursor: newCommand.trigger && newCommand.script ? 'default' : 'not-allowed',
                        opacity: newCommand.trigger && newCommand.script ? 1 : 0.5
                      }}
                    >
                      <IconCheck size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                      save
                    </button>
                    <button
                      onClick={() => {
                        setShowAddCommand(false);
                        setNewCommand({ trigger: '', description: '', script: '' });
                      }}
                      style={{
                        flex: 1,
                        background: 'transparent',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        color: 'rgba(255, 255, 255, 0.4)',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        cursor: 'default'
                      }}
                    >
                      <IconX size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                      cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Plugin Commands Section */}
            {pluginCommands.length > 0 && (
              <div style={{ marginTop: '16px' }}>
                <h4 style={{ fontSize: '11px', color: 'var(--accent-color)', margin: '0 0 8px 0', fontWeight: 500, textTransform: 'lowercase' }}>plugin commands</h4>
                <div className="commands-list">
                  {pluginCommands.map((cmd, index) => (
                    <div key={index} style={{
                      padding: '8px',
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '4px',
                      marginBottom: '6px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: 'var(--fg-80)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>/{cmd.name}</span>
                        <PluginBadge pluginName={cmd.pluginName} size="small" />
                      </div>
                      <p style={{ margin: '4px 0 0 0', fontSize: '10px', color: 'var(--fg-50)' }}>{cmd.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      case 'mcp':
        return <MCPTab />;

      case 'plugins':
        return <PluginsTab />;

      case 'skills':
        return <SkillsTab />;

      default:
        return null;
    }
  };

  return (
    <>
      <div className="settings-modal-overlay">
        <div className="settings-modal">
          <div className={`settings-header${isDragging ? ' is-dragging' : ''}`} ref={headerRef} data-tauri-drag-region onContextMenu={(e) => e.preventDefault()}>
            <div className="settings-header-left" data-tauri-drag-region>
              <IconSettings size={16} stroke={1.5} style={{ color: 'var(--accent-color)', pointerEvents: 'none', userSelect: 'none' }} />
              {/* Tab navigation in header */}
              <div className="header-tabs">
                <TabButton
                  label="theme"
                  active={activeTab === 'theme'}
                  onClick={() => setActiveTab('theme')}
                />
                <TabButton
                  label="general"
                  active={activeTab === 'general'}
                  onClick={() => setActiveTab('general')}
                />
                {showHooksSettings && (
                  <TabButton
                    label="hooks"
                    active={activeTab === 'hooks'}
                    onClick={() => setActiveTab('hooks')}
                  />
                )}
                {showCommandsSettings && (
                  <TabButton
                    label="commands"
                    active={activeTab === 'commands'}
                    onClick={() => setActiveTab('commands')}
                  />
                )}
                {showMcpSettings && (
                  <TabButton
                    label="mcp"
                    active={activeTab === 'mcp'}
                    onClick={() => setActiveTab('mcp')}
                  />
                )}
                {showPluginsSettings && (
                  <TabButton
                    label="plugins"
                    active={activeTab === 'plugins'}
                    onClick={() => setActiveTab('plugins')}
                  />
                )}
                {showSkillsSettings && (
                  <TabButton
                    label="skills"
                    active={activeTab === 'skills'}
                    onClick={() => setActiveTab('skills')}
                  />
                )}
              </div>
            </div>
            <button className="settings-close" onClick={onClose}>
              <IconX size={16} />
            </button>
          </div>

          {/* Tab content */}
          <div className="settings-content">
            {renderTabContent()}
          </div>

          {/* Bottom controls - show upgrade/about on general, zoom/watermark on theme */}
          {(activeTab === 'general' || activeTab === 'theme') && (
            <div className="settings-bottom-controls">
              <div className="settings-bottom-left">
                {activeTab === 'theme' && (
                  <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
                    <div>
                      <h4>zoom</h4>
                      <div className="zoom-controls compact">
                        <button
                          className="zoom-btn small"
                          onClick={handleZoomOut}
                          disabled={zoomLevel <= -50}
                        >
                          <IconMinus size={12} />
                        </button>
                        <button
                          className="zoom-btn small"
                          onClick={handleZoomIn}
                          disabled={zoomLevel >= 200}
                        >
                          <IconPlus size={12} />
                        </button>
                        <button
                          className="zoom-btn small"
                          onClick={handleResetZoom}
                          disabled={zoomLevel === 0}
                        >
                          <IconRotateClockwise size={12} />
                        </button>
                        <span className="zoom-level compact">{zoomLevel > 0 ? `+${Math.round(zoomLevel * 5)}%` : zoomLevel === 0 ? '±0%' : `${Math.round(zoomLevel * 5)}%`}</span>
                      </div>
                    </div>

                    {/* Transparency feature hidden until Tauri v2 supports it */}
                    {/* <div>
                      <h4>transparency</h4>
                      <div className="opacity-controls" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={backgroundOpacity}
                          onChange={(e) => {
                            const value = Number(e.target.value);
                            setBackgroundOpacity(value);
                            // Also immediately apply for testing
                            const alpha = value / 100;
                            document.body.style.backgroundColor = `rgba(0, 0, 0, ${alpha})`;
                            console.log('Set body background to:', `rgba(0, 0, 0, ${alpha})`);
                          }}
                          style={{
                            width: '100px',
                            height: '20px',
                            background: 'transparent',
                            outline: 'none',
                            cursor: 'pointer'
                          }}
                        />
                        <span style={{ 
                          fontSize: '10px', 
                          color: '#666',
                          minWidth: '35px',
                          textAlign: 'right'
                        }}>
                          {backgroundOpacity}%
                        </span>
                      </div>
                    </div> */}
                  </div>
                )}
              </div>

              <div className="settings-bottom-right">
                {activeTab === 'general' && (
                  <button
                    className="settings-action-btn about"
                    onClick={() => setShowAboutModal(true)}
                    style={{
                      background: 'transparent',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#666',
                      padding: '4px 12px',
                      fontSize: '11px',
                      borderRadius: '2px',
                      cursor: 'default',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--accent-color)';
                      e.currentTarget.style.color = 'var(--accent-color)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                      e.currentTarget.style.color = '#666';
                    }}
                  >
                    <IconInfoCircle size={12} />
                    <span>about</span>
                  </button>
                )}
                {activeTab === 'theme' && (
                  <div>
                    <h4>watermark image</h4>
                    <div className="watermark-controls">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleWatermarkUpload}
                        style={{ display: 'none' }}
                        id="watermark-upload-bottom"
                      />
                      {globalWatermarkImage ? (
                        <>
                          <button
                            className="color-reset"
                            onClick={handleRemoveWatermark}
                            title="remove watermark"
                          >
                            <IconRotateClockwise size={12} />
                          </button>
                          <img
                            src={globalWatermarkImage}
                            alt="watermark preview"
                            className="watermark-thumb"
                          />
                        </>
                      ) : (
                        <>
                          <button
                            className="color-reset"
                            onClick={handleRemoveWatermark}
                            title="remove watermark"
                            style={{ visibility: 'hidden' }}
                          >
                            <IconRotateClockwise size={12} />
                          </button>
                          <label htmlFor="watermark-upload-bottom" className="watermark-upload-btn">
                            <IconPhoto size={14} />
                          </label>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Color picker modal */}
      {showColorPicker && (
        <ColorPicker
          color={
            showColorPicker === 'background' ? backgroundColor :
            showColorPicker === 'foreground' ? foregroundColor :
            showColorPicker === 'accent' ? accentColor :
            showColorPicker === 'positive' ? positiveColor :
            negativeColor
          }
          colorType={showColorPicker}
          onChange={(color) => {
            if (showColorPicker === 'background') handleBackgroundColorChange(color);
            else if (showColorPicker === 'foreground') handleForegroundColorChange(color);
            else if (showColorPicker === 'accent') handleAccentColorChange(color);
            else if (showColorPicker === 'positive') handlePositiveColorChange(color);
            else if (showColorPicker === 'negative') handleNegativeColorChange(color);
          }}
          onClose={() => setShowColorPicker(null)}
          onPreview={handleColorPreview}
          onPreviewEnd={handleColorPreviewEnd}
        />
      )}

      {/* Font picker modal */}
      {showFontPicker && (
        <FontPickerModal
          isOpen={true}
          onClose={() => setShowFontPicker(null)}
          onSelect={(font) => {
            if (showFontPicker === 'monospace') {
              setMonoFont(font);
            } else {
              setSansFont(font);
            }
            setShowFontPicker(null);
          }}
          currentFont={showFontPicker === 'monospace' ? monoFont : sansFont}
          fontType={showFontPicker}
        />
      )}

      {/* About modal */}
      {showAboutModal && (
        <AboutModal
          isOpen={true}
          onClose={() => setShowAboutModal(false)}
          onShowUpgrade={() => {
            // Close AboutModal first, then show UpgradeModal
            setShowAboutModal(false);
            // Small delay to ensure AboutModal closes before UpgradeModal opens
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent('showUpgradeModal', {
                detail: { reason: 'trial' }
              }));
            }, 100);
          }}
        />
      )}
    </>
  );
};