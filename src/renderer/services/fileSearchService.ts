// Dynamic import for Tauri to support both Tauri and server modes
let tauriInvoke: any = null;
if (typeof window !== 'undefined' && (window as any).__TAURI__) {
  import('@tauri-apps/api/core').then(module => {
    tauriInvoke = module.invoke;
  });
}

export interface FileSearchResult {
  type: 'file' | 'directory';
  path: string;
  name: string;
  relativePath: string;
  lastModified?: number;
}

interface GitStatus {
  modified: string[];
  added: string[];
  deleted: string[];
  renamed: string[];
}

// Cache for file search results
const searchCache = new Map<string, { results: FileSearchResult[]; timestamp: number }>();
const CACHE_TTL = 5000; // 5 seconds

// Fuzzy matching function
function fuzzyMatch(query: string, text: string): boolean {
  if (!query) return true;
  
  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();
  
  // Direct substring match
  if (textLower.includes(queryLower)) {
    return true;
  }
  
  // Fuzzy match - all query chars must appear in order
  let queryIndex = 0;
  for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIndex]) {
      queryIndex++;
    }
  }
  
  return queryIndex === queryLower.length;
}

// Search for files in the working directory
export async function searchFiles(
  query: string, 
  workingDirectory: string,
  options: {
    includeHidden?: boolean;
    maxResults?: number;
    fileTypes?: string[];
  } = {}
): Promise<FileSearchResult[]> {
  const cacheKey = `${workingDirectory}:${query}:${JSON.stringify(options)}`;
  
  // Check cache
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.results;
  }
  
  try {
    // Use Tauri command to search files if available
    if (tauriInvoke) {
      const results = await tauriInvoke<FileSearchResult[]>('search_files', {
        query,
        directory: workingDirectory,
        includeHidden: options.includeHidden || false,
        maxResults: options.maxResults || 50
      });
    
    // Filter results based on fuzzy matching and normalize paths to Unix-style
    const filtered = results.map(result => ({
      ...result,
      relativePath: result.relativePath.replace(/\\/g, '/')
    })).filter(result => 
      fuzzyMatch(query, result.name) || fuzzyMatch(query, result.relativePath)
    );
    
    // Sort results by relevance
    filtered.sort((a, b) => {
      // Exact name matches first
      const aExact = a.name.toLowerCase() === query.toLowerCase();
      const bExact = b.name.toLowerCase() === query.toLowerCase();
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      
      // Then by name starts with query
      const aStarts = a.name.toLowerCase().startsWith(query.toLowerCase());
      const bStarts = b.name.toLowerCase().startsWith(query.toLowerCase());
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      
      // Then by path length (shorter paths first)
      return a.relativePath.length - b.relativePath.length;
    });
    
      // Cache results
      searchCache.set(cacheKey, { results: filtered, timestamp: Date.now() });
      
      return filtered;
    } else {
      // Fallback to mock data when not in Tauri
      return getMockResults(query, workingDirectory);
    }
  } catch (error) {
    console.error('Error searching files:', error);
    
    // Fallback to simple mock data for now
    return getMockResults(query, workingDirectory);
  }
}

// Get recently modified files
export async function getRecentFiles(workingDirectory: string, limit: number = 10): Promise<FileSearchResult[]> {
  try {
    if (tauriInvoke) {
      const results = await tauriInvoke<FileSearchResult[]>('get_recent_files', {
        directory: workingDirectory,
        limit
      });
      
      return results;
    } else {
      // Return mock recent files
      return getMockResults('', workingDirectory).slice(0, limit);
    }
  } catch (error) {
    console.error('Error getting recent files:', error);
    return [];
  }
}

// Get folder contents
export async function getFolderContents(folderPath: string, maxResults: number = 20): Promise<FileSearchResult[]> {
  try {
    if (tauriInvoke) {
      const results = await tauriInvoke<FileSearchResult[]>('get_folder_contents', {
        folderPath,
        maxResults
      });
      
      // Normalize paths to Unix-style
      return results.map(result => ({
        ...result,
        relativePath: result.relativePath.replace(/\\/g, '/')
      }));
    } else {
      // Return mock folder contents
      return [
        {
          type: 'directory',
          path: `${folderPath}/components`,
          name: 'components',
          relativePath: 'components'
        },
        {
          type: 'file',
          path: `${folderPath}/index.ts`,
          name: 'index.ts',
          relativePath: 'index.ts'
        },
        {
          type: 'file',
          path: `${folderPath}/utils.ts`,
          name: 'utils.ts',
          relativePath: 'utils.ts'
        }
      ];
    }
  } catch (error) {
    console.error('Error getting folder contents:', error);
    return [];
  }
}

// Get git changed files
export async function getGitChangedFiles(workingDirectory: string): Promise<FileSearchResult[]> {
  try {
    if (tauriInvoke) {
      const status = await tauriInvoke<GitStatus>('get_git_status', {
        directory: workingDirectory
      });
      
      // Convert git status to FileSearchResult
      const results: FileSearchResult[] = [];
      
      for (const file of status.modified) {
        results.push({
          type: 'file',
          path: `${workingDirectory}/${file}`,
          name: file.split('/').pop() || file,
          relativePath: file
        });
      }
      
      for (const file of status.added) {
        results.push({
          type: 'file',
          path: `${workingDirectory}/${file}`,
          name: file.split('/').pop() || file,
          relativePath: file
        });
      }
      
      return results;
    } else {
      // Return mock git changes
      return [
        {
          type: 'file',
          path: `${workingDirectory}/src/modified.ts`,
          name: 'modified.ts',
          relativePath: 'src/modified.ts'
        }
      ];
    }
  } catch (error) {
    console.error('Error getting git status:', error);
    return [];
  }
}

// Mock results for development
function getMockResults(query: string, workingDirectory: string): FileSearchResult[] {
  const mockFiles = [
    'src/renderer/main.tsx',
    'src/renderer/App.tsx',
    'src/renderer/components/Chat/ClaudeChat.tsx',
    'src/renderer/components/Chat/MessageRenderer.tsx',
    'src/renderer/stores/claudeCodeStore.ts',
    'src/renderer/services/claudeCodeClient.ts',
    'src-tauri/src/main.rs',
    'src-tauri/Cargo.toml',
    'package.json',
    'tsconfig.json',
    'README.md',
    'CLAUDE.md',
    'COMPETITIVE_STRATEGY.md'
  ];
  
  // Normalize working directory path to Unix-style
  const normalizedWorkingDir = workingDirectory.replace(/\\/g, '/');
  
  return mockFiles
    .filter(file => fuzzyMatch(query, file))
    .slice(0, 10)
    .map(file => ({
      type: 'file' as const,
      path: `${normalizedWorkingDir}/${file}`,
      name: file.split('/').pop() || file,
      relativePath: file
    }));
}