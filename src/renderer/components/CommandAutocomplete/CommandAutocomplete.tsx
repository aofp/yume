import React, { useState, useEffect, useRef } from 'react';
import {
  IconCommand,
  IconTrash,
  IconRefresh,
  IconFile,
  IconEye,
  IconCode,
  IconList,
  IconBrush,
  IconDownload,
  IconSearch,
  IconSettings,
  IconBolt,
  IconArrowsDiagonalMinimize2,
  IconWashDrycleanOff,
  IconWand,
  IconPencil,
  IconPuzzle
} from '@tabler/icons-react';
import './CommandAutocomplete.css';
import { PluginBadge } from '../common/PluginBadge';
import { pluginService } from '../../services/pluginService';

interface CommandAutocompleteProps {
  trigger: string;
  cursorPosition: number;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  onSelect: (replacement: string, start: number, end: number) => void;
  onClose: () => void;
}

interface Command {
  name: string;
  description: string;
  icon: React.ReactNode;
  handleLocally?: boolean; // If true, handle on our side instead of sending to Claude
  isCustom?: boolean; // If true, this is a custom command from settings
  script?: string; // Script for custom commands
  pluginId?: string; // Plugin ID if from a plugin
  pluginName?: string; // Plugin name for badge display
}

// Built-in commands
const builtInCommands: Command[] = [
  { name: 'clear', description: 'clear context and start fresh', icon: <IconWashDrycleanOff size={14} />, handleLocally: true },
  { name: 'model', description: 'switch model (opus/sonnet)', icon: <IconBolt size={14} />, handleLocally: true },
  { name: 'title', description: 'set tab title manually', icon: <IconPencil size={14} />, handleLocally: true },
  { name: 'init', description: 'create/update claude.md file', icon: <IconSettings size={14} />, handleLocally: false },
  { name: 'compact', description: 'compress context to reduce token usage', icon: <IconArrowsDiagonalMinimize2 size={14} />, handleLocally: false },
];

// Load custom commands from localStorage
const loadCustomCommands = (): Command[] => {
  try {
    const saved = localStorage.getItem('custom_commands');
    if (saved) {
      const customCommands = JSON.parse(saved);
      return customCommands.map((cmd: any) => ({
        name: cmd.trigger.startsWith('/') ? cmd.trigger.slice(1) : cmd.trigger,
        description: cmd.description || 'custom command',
        icon: <IconWand size={14} />,
        handleLocally: true,
        isCustom: true,
        script: cmd.script
      }));
    }
  } catch (error) {
    console.error('Failed to load custom commands:', error);
  }
  return [];
};

export const CommandAutocomplete: React.FC<CommandAutocompleteProps> = ({
  trigger,
  cursorPosition,
  inputRef,
  onSelect,
  onClose
}) => {
  const [allCommands, setAllCommands] = useState<Command[]>([]);
  const [filteredCommands, setFilteredCommands] = useState<Command[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Load commands (built-in + custom + plugin)
  useEffect(() => {
    const loadAllCommands = async () => {
      const customCommands = loadCustomCommands();

      // Load plugin commands
      await pluginService.initialize();
      const pluginCommands = pluginService.getEnabledPluginCommands().map(cmd => ({
        name: cmd.name.includes('--') ? cmd.name.split('--')[1] : cmd.name,
        description: cmd.description || 'plugin command',
        icon: <IconPuzzle size={14} />,
        handleLocally: false,
        isCustom: false,
        pluginId: cmd.pluginId,
        pluginName: cmd.pluginName
      }));

      setAllCommands([...builtInCommands, ...customCommands, ...pluginCommands]);
    };

    loadAllCommands();
  }, []);

  // Parse the search query from the trigger
  const searchQuery = trigger.slice(1).toLowerCase(); // Remove / symbol

  // Filter commands based on search
  useEffect(() => {
    if (!searchQuery) {
      // Show all commands when just / is typed
      setFilteredCommands(allCommands);
    } else {
      // Filter commands - be stricter about matching
      const filtered = allCommands.filter(cmd => {
        const cmdName = cmd.name.toLowerCase();
        const query = searchQuery.toLowerCase();
        
        // Only show commands that start with the query
        // Don't do fuzzy matching on "contains" or description
        return cmdName.startsWith(query);
      });
      
      // Sort alphabetically 
      filtered.sort((a, b) => {
        // Prioritize exact matches
        if (a.name.toLowerCase() === searchQuery) return -1;
        if (b.name.toLowerCase() === searchQuery) return 1;
        // Then prioritize built-in commands
        if (!a.isCustom && b.isCustom) return -1;
        if (a.isCustom && !b.isCustom) return 1;
        return a.name.localeCompare(b.name);
      });
      
      setFilteredCommands(filtered);
    }
    setSelectedIndex(0);
  }, [searchQuery, allCommands]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!filteredCommands.length) return;
      
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => (prev + 1) % filteredCommands.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => prev === 0 ? filteredCommands.length - 1 : prev - 1);
          break;
        case 'Tab':
          e.preventDefault();
          if (filteredCommands.length > 0) {
            handleSelect(filteredCommands[selectedIndex]);
          }
          break;
        case 'Enter':
          // Only autocomplete on Enter if there are matches
          // Otherwise let the input be sent as-is
          if (filteredCommands.length > 0) {
            e.preventDefault();
            handleSelect(filteredCommands[selectedIndex]);
          } else {
            // No matches - close autocomplete and let Enter send the command
            onClose();
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredCommands, selectedIndex, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex]);

  // Handle command selection
  const handleSelect = (command: Command) => {
    const input = inputRef.current;
    if (!input) return;
    
    const start = cursorPosition - trigger.length;
    const replacement = '/' + command.name + ' ';
    
    // Pass both replacement and whether to handle locally
    onSelect(replacement, start, cursorPosition);
  };

  // Calculate position for the autocomplete dropdown
  const getPosition = () => {
    if (!inputRef.current) return { bottom: 0 };
    
    const input = inputRef.current;
    const rect = input.getBoundingClientRect();
    
    // Position above the input with extra spacing
    return {
      bottom: window.innerHeight - rect.top + 7
    };
  };

  const position = getPosition();

  if (!filteredCommands.length) {
    return null;
  }

  return (
    <div 
      ref={containerRef}
      className="command-autocomplete"
      style={{
        bottom: `${position.bottom}px`
      }}
    >
      <div ref={listRef} className="command-list">
        {filteredCommands.map((cmd, index) => (
          <div
            key={cmd.name}
            className={`command-item ${index === selectedIndex ? 'selected' : ''}`}
            onClick={() => handleSelect(cmd)}
            onMouseEnter={() => setSelectedIndex(index)}
          >
            <span className="command-icon">{cmd.icon}</span>
            <div className="command-content">
              <div className="command-name-row">
                <span className="command-name">/{cmd.name}</span>
                {cmd.pluginName && (
                  <PluginBadge pluginName={cmd.pluginName} size="small" />
                )}
              </div>
              <span className="command-description">{cmd.description}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="command-footer">
        <span className="command-hint">↑↓ navigate</span>
        <span className="command-hint">tab/enter select</span>
        <span className="command-hint">esc close</span>
      </div>
    </div>
  );
};