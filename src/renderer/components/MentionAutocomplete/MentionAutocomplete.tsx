import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  IconFile, 
  IconFolder, 
  IconClock, 
  IconGitBranch,
  IconCode,
  IconFileText,
  IconSettings,
  IconTestPipe
} from '@tabler/icons-react';
import { searchFiles, getRecentFiles, getGitChangedFiles, getFolderContents, FileSearchResult } from '../../services/fileSearchService';
import './MentionAutocomplete.css';

interface MentionAutocompleteProps {
  trigger: string;
  cursorPosition: number;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  onSelect: (replacement: string, start: number, end: number) => void;
  onClose: () => void;
  workingDirectory?: string;
}

interface MentionItem {
  type: 'file' | 'folder' | 'recent' | 'changed' | 'symbol' | 'doc' | 'test' | 'config';
  path: string;
  name: string;
  icon: React.ReactNode;
  description?: string;
}

export const MentionAutocomplete: React.FC<MentionAutocompleteProps> = ({
  trigger,
  cursorPosition,
  inputRef,
  onSelect,
  onClose,
  workingDirectory
}) => {
  const [items, setItems] = useState<MentionItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [currentView, setCurrentView] = useState<'default' | 'recent' | 'modified'>('default');
  const [currentPath, setCurrentPath] = useState<string>('');
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // The trigger is already the text after @ (without the @ symbol)
  const searchQuery = trigger;

  // Get icon based on file type
  const getFileIcon = (path: string, type: 'file' | 'folder'): React.ReactNode => {
    if (type === 'folder') {
      return <IconFolder size={14} />;
    }
    
    const ext = path.split('.').pop()?.toLowerCase();
    
    // Test files
    if (path.includes('.test.') || path.includes('.spec.') || path.includes('__tests__')) {
      return <IconTestPipe size={14} />;
    }
    
    // Config files
    if (['json', 'yml', 'yaml', 'toml', 'ini', 'env'].includes(ext || '') ||
        path.includes('config') || path.includes('settings')) {
      return <IconSettings size={14} />;
    }
    
    // Documentation
    if (['md', 'txt', 'rst', 'adoc'].includes(ext || '') || 
        path.toLowerCase().includes('readme') || 
        path.toLowerCase().includes('changelog')) {
      return <IconFileText size={14} />;
    }
    
    // Code files
    if (['js', 'ts', 'jsx', 'tsx', 'py', 'rs', 'go', 'java', 'cpp', 'c', 'h'].includes(ext || '')) {
      return <IconCode size={14} />;
    }
    
    return <IconFile size={14} />;
  };

  // Helper to sort items: folders first, then configs, then other files
  const sortItems = (items: MentionItem[]): MentionItem[] => {
    return items.sort((a, b) => {
      // Special items (@recent, @changed) always first
      if (a.type === 'recent' || a.type === 'changed') return -1;
      if (b.type === 'recent' || b.type === 'changed') return 1;
      
      // Then folders
      if (a.type === 'folder' && b.type !== 'folder') return -1;
      if (b.type === 'folder' && a.type !== 'folder') return 1;
      
      // Then config files
      const aIsConfig = a.name.includes('config') || a.name.endsWith('.json') || 
                       a.name.endsWith('.yml') || a.name.endsWith('.yaml') ||
                       a.name.endsWith('.toml') || a.name === 'package.json' ||
                       a.name === 'tsconfig.json' || a.name === '.env';
      const bIsConfig = b.name.includes('config') || b.name.endsWith('.json') || 
                       b.name.endsWith('.yml') || b.name.endsWith('.yaml') ||
                       b.name.endsWith('.toml') || b.name === 'package.json' ||
                       b.name === 'tsconfig.json' || b.name === '.env';
      
      if (aIsConfig && !bIsConfig) return -1;
      if (!aIsConfig && bIsConfig) return 1;
      
      // Finally alphabetical
      return a.name.localeCompare(b.name);
    });
  };

  // Search for files
  useEffect(() => {
    const search = async () => {
      console.log('[MentionAutocomplete] Search triggered with:', { searchQuery, trigger, workingDirectory });
      
      // If no working directory, don't try to search (avoids errors)
      if (!workingDirectory) {
        console.warn('[MentionAutocomplete] No working directory set');
        setItems([]);
        setLoading(false);
        return;
      }
      
      setLoading(true);
      
      try {
        // Handle special @mention types
        if (searchQuery === 'r' || searchQuery === 'recent' || searchQuery.startsWith('recent')) {
          const recentFiles = await getRecentFiles(workingDirectory, 10);
          const mentionItems: MentionItem[] = recentFiles.map(result => ({
            type: 'file',
            path: result.path,
            name: result.name,
            icon: getFileIcon(result.path, 'file'),
            description: result.relativePath
          }));
          setItems(mentionItems);
          setCurrentView('recent');
        } else if (searchQuery === 'm' || searchQuery === 'modified' || searchQuery.startsWith('modified')) {
          const changedFiles = await getGitChangedFiles(workingDirectory);
          const mentionItems: MentionItem[] = changedFiles.map(result => ({
            type: 'file',
            path: result.path,
            name: result.name,
            icon: getFileIcon(result.path, 'file'),
            description: result.relativePath
          }));
          setItems(mentionItems);
          setCurrentView('modified');
        } else if (!searchQuery || searchQuery === '') {
          console.log('[MentionAutocomplete] Empty search query - showing root directory');
          setCurrentView('default');
          
          let contents: FileSearchResult[] = [];
          // Add try-catch to isolate any errors
          try {
            console.log('[MentionAutocomplete] About to call getFolderContents...');
            // When just @ is typed, show root folder contents
            contents = await getFolderContents(workingDirectory, 30);
            console.log('[MentionAutocomplete] Folder contents:', contents.length, 'items');
          } catch (err) {
            console.error('[MentionAutocomplete] Error getting folder contents:', err);
            // Continue with empty results
            contents = [];
          }
          
          const mentionItems: MentionItem[] = contents.map(result => ({
            type: result.type === 'directory' ? 'folder' : 'file',
            path: result.path,
            name: result.name,
            icon: getFileIcon(result.path, result.type === 'directory' ? 'folder' : 'file'),
            description: result.name // Just show name for root items
          }));
          
          // Check if there are git changes before adding @m
          try {
            const changedFiles = await getGitChangedFiles(workingDirectory);
            if (changedFiles.length > 0) {
              mentionItems.unshift({
                type: 'changed',
                path: '@m',
                name: '@m',
                icon: <IconGitBranch size={14} />,
                description: `${changedFiles.length} modified files`
              });
            }
          } catch (error) {
            // Ignore if not a git repo or no changes
          }
          
          // Always add @r for recent files
          mentionItems.unshift({
            type: 'recent',
            path: '@r',
            name: '@r',
            icon: <IconClock size={14} />,
            description: 'recently edited files'
          });
          
          setItems(sortItems(mentionItems).slice(0, 15)); // Show more items
          setCurrentPath('');
        } else if (searchQuery.includes('/')) {
          // Path-based search (user navigating folders)
          const pathParts = searchQuery.split('/');
          const folderPath = pathParts.slice(0, -1).join('/');
          setCurrentPath(folderPath);
          
          // Search within the folder path
          const results = await searchFiles(searchQuery, workingDirectory);
          const mentionItems: MentionItem[] = results.map(result => ({
            type: result.type === 'directory' ? 'folder' : 'file',
            path: result.path,
            name: result.name,
            icon: getFileIcon(result.path, result.type === 'directory' ? 'folder' : 'file'),
            description: result.relativePath
          }));
          
          setItems(sortItems(mentionItems).slice(0, 15));
          setCurrentView('default');
        } else {
          // Regular file search
          const results = await searchFiles(searchQuery, workingDirectory);
          
          // Convert results to MentionItems
          const mentionItems: MentionItem[] = results.map(result => ({
            type: result.type === 'directory' ? 'folder' : 'file',
            path: result.path,
            name: result.name,
            icon: getFileIcon(result.path, result.type === 'directory' ? 'folder' : 'file'),
            description: result.relativePath
          }));
          
          setItems(sortItems(mentionItems).slice(0, 15));
          setCurrentView('default');
          setCurrentPath('');
        }
        
        setSelectedIndex(0);
      } catch (error) {
        console.error('Error searching files:', error);
        setItems([]);
      } finally {
        setLoading(false);
      }
    };
    
    search();
  }, [searchQuery, workingDirectory]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (!items.length) return;
      
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => (prev + 1) % items.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => prev === 0 ? items.length - 1 : prev - 1);
          break;
        case 'ArrowLeft':
          e.preventDefault(); // Always prevent cursor movement when autocomplete is open
          
          // Parse the current trigger to determine where we are
          if (trigger.includes('/')) {
            // We're in a subfolder, go up one level
            const lastSlashIndex = trigger.lastIndexOf('/');
            
            // If the slash is at the end (e.g., "src/"), go back to parent
            if (lastSlashIndex === trigger.length - 1 && trigger.length > 1) {
              // Remove the folder and its slash
              const folderPath = trigger.substring(0, lastSlashIndex);
              const parentSlashIndex = folderPath.lastIndexOf('/');
              
              if (inputRef.current) {
                const text = inputRef.current.value;
                const start = cursorPosition - trigger.length - 1; // -1 for the @
                const end = cursorPosition; // Current cursor position is the end
                
                let newTrigger: string;
                if (parentSlashIndex !== -1) {
                  // Has parent folder, go to parent with trailing slash
                  newTrigger = `@${folderPath.substring(0, parentSlashIndex + 1)}`;
                } else {
                  // No parent folder, go to root
                  newTrigger = '@';
                }
                
                const newValue = text.substring(0, start) + newTrigger + text.substring(end);
                inputRef.current.value = newValue;
                const newCursorPos = start + newTrigger.length;
                inputRef.current.selectionStart = inputRef.current.selectionEnd = newCursorPos;
                
                // Dispatch input event to trigger re-render
                const changeEvent = new Event('input', { bubbles: true });
                inputRef.current.dispatchEvent(changeEvent);
              }
            } else {
              // Slash is in the middle, go up one level normally
              let parentPath = trigger.substring(0, lastSlashIndex);
              
              // If we're going back from a single folder (e.g., "assets/file"), parentPath should be empty
              // If we're going back from nested folders (e.g., "src/components/file"), keep the parent part
              if (parentPath && !parentPath.includes('/')) {
                // Going back from single folder to root
                parentPath = '';
              }
              
              if (inputRef.current) {
                const text = inputRef.current.value;
                const start = cursorPosition - trigger.length - 1; // -1 for the @
                const end = cursorPosition; // Current cursor position is the end
                const newTrigger = parentPath ? `@${parentPath}/` : '@';
                const newValue = text.substring(0, start) + newTrigger + text.substring(end);
                inputRef.current.value = newValue;
                const newCursorPos = start + newTrigger.length;
                inputRef.current.selectionStart = inputRef.current.selectionEnd = newCursorPos;
                
                // Dispatch input event to trigger re-render
                const changeEvent = new Event('input', { bubbles: true });
                inputRef.current.dispatchEvent(changeEvent);
              }
            }
          } else if (trigger === 'r' || trigger === 'recent') {
            // Go back from @recent view to root
            if (inputRef.current) {
              const text = inputRef.current.value;
              const start = cursorPosition - trigger.length - 1; // -1 for the @
              const end = cursorPosition; // Current cursor position is the end
              const newValue = text.substring(0, start) + '@' + text.substring(end);
              inputRef.current.value = newValue;
              const newCursorPos = start + 1;
              inputRef.current.selectionStart = inputRef.current.selectionEnd = newCursorPos;
              
              const changeEvent = new Event('input', { bubbles: true });
              inputRef.current.dispatchEvent(changeEvent);
            }
          } else if (trigger === 'm' || trigger === 'modified') {
            // Go back from @modified view to root
            if (inputRef.current) {
              const text = inputRef.current.value;
              const start = cursorPosition - trigger.length - 1; // -1 for the @
              const end = cursorPosition; // Current cursor position is the end
              const newValue = text.substring(0, start) + '@' + text.substring(end);
              inputRef.current.value = newValue;
              const newCursorPos = start + 1;
              inputRef.current.selectionStart = inputRef.current.selectionEnd = newCursorPos;
              
              const changeEvent = new Event('input', { bubbles: true });
              inputRef.current.dispatchEvent(changeEvent);
            }
          }
          // If we're already at root (trigger is empty or just a search term), do nothing but still prevent cursor movement
          break;
        case 'ArrowRight':
          const selectedItem = items[selectedIndex];
          if (selectedItem) {
            e.preventDefault();
            
            // If it's a file, autocomplete it
            if (selectedItem.type === 'file') {
              handleSelect(selectedItem);
            }
            // Handle @r specially
            else if (selectedItem.type === 'recent') {
              // Load recent files and update input to show @r
              setLoading(true);
              try {
                const recentFiles = await getRecentFiles(workingDirectory, 15);
                const mentionItems: MentionItem[] = recentFiles.map(result => ({
                  type: 'file',
                  path: result.path,
                  name: result.name,
                  icon: getFileIcon(result.path, 'file'),
                  description: result.relativePath
                }));
                setItems(mentionItems);
                setSelectedIndex(0);
                setCurrentView('recent');
                
                // Update input to show @r
                if (inputRef.current) {
                  const text = inputRef.current.value;
                  const start = cursorPosition - trigger.length - 1; // -1 for the @
                  const newValue = text.substring(0, start) + '@r' + text.substring(cursorPosition);
                  inputRef.current.value = newValue;
                  const newCursorPos = start + 2; // Position after '@r'
                  inputRef.current.selectionStart = inputRef.current.selectionEnd = newCursorPos;
                  const changeEvent = new Event('input', { bubbles: true });
                  inputRef.current.dispatchEvent(changeEvent);
                }
              } catch (error) {
                console.error('Error loading recent files:', error);
              }
              setLoading(false);
            } else if (selectedItem.type === 'changed') {
              // Load changed files and update input to show @m
              setLoading(true);
              try {
                const changedFiles = await getGitChangedFiles(workingDirectory);
                const mentionItems: MentionItem[] = changedFiles.map(result => ({
                  type: 'file',
                  path: result.path,
                  name: result.name,
                  icon: getFileIcon(result.path, 'file'),
                  description: result.relativePath
                }));
                setItems(mentionItems);
                setSelectedIndex(0);
                setCurrentView('modified');
                
                // Update input to show @m
                if (inputRef.current) {
                  const text = inputRef.current.value;
                  const start = cursorPosition - trigger.length - 1; // -1 for the @
                  const newValue = text.substring(0, start) + '@m' + text.substring(cursorPosition);
                  inputRef.current.value = newValue;
                  const newCursorPos = start + 2; // Position after '@m'
                  inputRef.current.selectionStart = inputRef.current.selectionEnd = newCursorPos;
                  const changeEvent = new Event('input', { bubbles: true });
                  inputRef.current.dispatchEvent(changeEvent);
                }
              } catch (error) {
                console.error('Error loading changed files:', error);
              }
              setLoading(false);
            } else if (selectedItem.type === 'folder') {
              // Navigate into folder
              if (inputRef.current) {
                const text = inputRef.current.value;
                const start = cursorPosition - trigger.length - 1; // -1 for the @
                
                // Determine the folder path based on current context
                let folderPath: string;
                if (trigger.includes('/')) {
                  // We're already in a subfolder path, replace everything after last folder
                  const lastSlash = trigger.lastIndexOf('/');
                  const basePath = trigger.substring(0, lastSlash);
                  folderPath = `${basePath}/${selectedItem.name}`;
                } else {
                  // We're at root or searching, use just the folder name
                  folderPath = selectedItem.name;
                }
                
                // Replace the entire @mention with the new path
                const newValue = text.substring(0, start) + '@' + folderPath + '/' + text.substring(cursorPosition);
                
                // Update input and trigger
                inputRef.current.value = newValue;
                const newCursorPos = start + folderPath.length + 2; // +2 for @ and /
                inputRef.current.selectionStart = inputRef.current.selectionEnd = newCursorPos;
                
                // Trigger change event to update state
                const changeEvent = new Event('input', { bubbles: true });
                inputRef.current.dispatchEvent(changeEvent);
                
                // Load folder contents
                setLoading(true);
                try {
                  const contents = await getFolderContents(selectedItem.path, 30);
                  const folderItems: MentionItem[] = contents.map(result => ({
                    type: result.type === 'directory' ? 'folder' : 'file',
                    path: result.path,
                    name: result.name,
                    icon: getFileIcon(result.path, result.type === 'directory' ? 'folder' : 'file'),
                    description: `${folderPath}/${result.name}`.replace(/\\/g, '/')
                  }));
                  
                  setItems(sortItems(folderItems));
                  setSelectedIndex(0);
                  setCurrentPath(folderPath);
                } catch (error) {
                  console.error('Error loading folder contents:', error);
                }
                setLoading(false);
              }
            }
          }
          break;
        case 'Tab':
        case 'Enter':
          e.preventDefault();
          handleSelect(items[selectedIndex]);
          break;
        case 'Backspace':
          // If we're at just @ (empty searchQuery), close the autocomplete
          if (searchQuery === '') {
            // Don't prevent default - let it delete @ and close naturally
            onClose();
            return;
          }
          // If we have a single character typed (like @r, @m, @a, etc), go back to @ view
          if (searchQuery.length === 1) {
            e.preventDefault();
            if (inputRef.current) {
              const text = inputRef.current.value;
              const start = cursorPosition - trigger.length - 1; // -1 for the @
              const newValue = text.substring(0, start) + '@' + text.substring(cursorPosition);
              inputRef.current.value = newValue;
              const newCursorPos = start + 1;
              inputRef.current.selectionStart = inputRef.current.selectionEnd = newCursorPos;
              const changeEvent = new Event('input', { bubbles: true });
              inputRef.current.dispatchEvent(changeEvent);
              setCurrentView('default');
            }
          }
          // For any other case, let normal backspace behavior work
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [items, selectedIndex, onClose, trigger, cursorPosition, inputRef, getFileIcon, sortItems]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex]);

  // Handle item selection
  const handleSelect = useCallback(async (item: MentionItem) => {
    // Find the start of the @mention
    const input = inputRef.current;
    if (!input) return;
    
    const text = input.value;
    let start = cursorPosition - trigger.length - 1; // -1 to include the @ symbol
    
    // Build the replacement text
    let replacement = '';
    if (item.type === 'recent' || item.type === 'changed') {
      replacement = item.name + ' ';
    } else if (item.type === 'folder') {
      // For folders, show their contents
      setLoading(true);
      try {
        const contents = await getFolderContents(item.path, 20);
        
        // Convert folder contents to MentionItems
        const folderItems: MentionItem[] = contents.map(result => ({
          type: result.type === 'directory' ? 'folder' : 'file',
          path: result.path,
          name: result.name,
          icon: getFileIcon(result.path, result.type === 'directory' ? 'folder' : 'file'),
          description: `${item.description || item.name}/${result.name}`.replace(/\\/g, '/')
        }));
        
        // If there are contents, show them; otherwise just insert the folder path
        if (folderItems.length > 0) {
          setItems(folderItems);
          setSelectedIndex(0);
          setLoading(false);
          return; // Don't close the autocomplete, show folder contents
        }
      } catch (error) {
        console.error('Error getting folder contents:', error);
      }
      setLoading(false);
      
      // If no contents or error, just insert the folder path
      const path = (item.description || item.path).replace(/\\/g, '/');
      replacement = '@' + path + '/ ';
    } else {
      // Use relative path for files, ensure Unix-style paths
      const path = (item.description || item.path).replace(/\\/g, '/');
      replacement = '@' + path + ' ';
    }
    
    // Call the onSelect callback
    onSelect(replacement, start, cursorPosition);
  }, [trigger, cursorPosition, inputRef, onSelect, getFileIcon]);

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

  // Always show if loading or have items
  // Also show if trigger is empty string (just typed @)
  // In production, give it more time to load
  if (!loading && items.length === 0 && trigger !== '' && searchQuery !== '') {
    // Only hide if not loading, no items, and trigger is not empty string
    return null;
  }

  return (
    <div 
      ref={containerRef}
      className="mention-autocomplete"
      style={{
        bottom: `${position.bottom}px`
      }}
    >
      <div ref={listRef} className="mention-list">
        {loading ? (
          <div className="mention-loading">searching...</div>
        ) : (
          items.map((item, index) => (
            <div
              key={item.path}
              className={`mention-item ${index === selectedIndex ? 'selected' : ''}`}
              onClick={() => handleSelect(item)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <span className="mention-icon">{item.icon}</span>
              <div className="mention-content">
                <span className="mention-name">{item.name}</span>
                {item.description && (
                  <span className="mention-description">{item.description}</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
      <div className="mention-footer">
        <span className="mention-hint">↑↓ navigate</span>
        <span className="mention-hint">← back</span>
        <span className="mention-hint">→ expand</span>
        <span className="mention-hint">tab/enter select</span>
        <span className="mention-hint">esc close</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px' }}>
          <span className={`mention-hint ${currentView === 'recent' ? 'active' : ''}`}>@r</span>
          <span className={`mention-hint ${currentView === 'modified' ? 'active' : ''}`}>@m</span>
        </div>
      </div>
    </div>
  );
};