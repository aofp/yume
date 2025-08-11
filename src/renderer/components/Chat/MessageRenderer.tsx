import React, { memo, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vs2015 } from 'react-syntax-highlighter/dist/styles';
import { 
  IconBolt,
  IconFolder, 
  IconAlertTriangle, 
  IconCheck, 
  IconX, 
  IconLock,
  IconDots,
  IconMinus,
  IconChecklist,
  IconLoader2,
  IconCopy,
  IconArrowBackUp,
  IconFile,
  IconFileText,
  IconEdit,
  IconEditCircle,
  IconTerminal,
  IconSearch,
  IconWorld,
  IconDownload,
  IconFileSearch,
  IconFolderOpen,
  IconRobot,
  IconLogout,
  IconNotebook,
  IconServer,
  IconTerminal2,
  IconPlayerStop,
  IconScissors
} from '@tabler/icons-react';
import { useClaudeCodeStore } from '../../stores/claudeCodeStore';
import './MessageRenderer.css';

// Complete Claude Code SDK message types
export interface ClaudeMessage {
  type: 'system' | 'user' | 'assistant' | 'result' | 'error' | 'permission' | 'tool_approval';
  subtype?: 'init' | 'success' | 'error_max_turns' | 'error_during_execution' | 'permission_request' | 'permission_response';
  message?: {
    role?: string;
    content?: string | ContentBlock[];
  };
  session_id?: string;
  timestamp?: number;
  
  // System init fields
  apiKeySource?: string;
  cwd?: string;
  tools?: string[];
  mcp_servers?: any[];
  model?: string;
  permissionMode?: string;
  
  // Result fields
  duration_ms?: number;
  duration_api_ms?: number;
  is_error?: boolean;
  num_turns?: number;
  result?: string;
  total_cost_usd?: number;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  
  // Permission fields
  tool?: string;
  parameters?: any;
  granted?: boolean;
  
  // UI fields
  id?: string;
  streaming?: boolean;
}

interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  name?: string;
  input?: any;
  output?: any;
  content?: any;
  tool_use_id?: string;
  is_error?: boolean;
}

// Tool display configurations
const TOOL_DISPLAYS: Record<string, (input: any) => { icon: React.ReactNode; action: string; detail: string; todos?: any[] }> = {
  'Read': (i) => ({ 
    icon: <IconFileText size={14} stroke={1.5} className="tool-icon" />, 
    action: 'reading', 
    detail: formatPath(i?.file_path) 
  }),
  'Write': (i) => ({ 
    icon: <IconFile size={14} stroke={1.5} className="tool-icon" />, 
    action: 'writing', 
    detail: formatPath(i?.file_path) 
  }),
  'Edit': (i) => ({ 
    icon: <IconEdit size={14} stroke={1.5} className="tool-icon" />, 
    action: 'editing', 
    detail: formatPath(i?.file_path)
  }),
  'MultiEdit': (i) => ({ 
    icon: <IconEditCircle size={14} stroke={1.5} className="tool-icon" />, 
    action: 'editing', 
    detail: formatPath(i?.file_path)
  }),
  'Bash': (i) => ({ 
    icon: <IconTerminal size={14} stroke={1.5} className="tool-icon" />, 
    action: 'running', 
    detail: formatCommand(i?.command)
  }),
  'TodoWrite': (i) => ({ 
    icon: <IconChecklist size={14} stroke={1.5} className="tool-icon" />, 
    action: 'updating todos', 
    detail: formatTodos(i?.todos),
    todos: i?.todos
  }),
  'WebSearch': (i) => ({ 
    icon: <IconWorld size={14} stroke={1.5} className="tool-icon" />, 
    action: 'searching web', 
    detail: `"${i?.query || ''}"`
  }),
  'WebFetch': (i) => ({ 
    icon: <IconDownload size={14} stroke={1.5} className="tool-icon" />, 
    action: 'fetching', 
    detail: formatUrl(i?.url)
  }),
  'Grep': (i) => ({ 
    icon: <IconSearch size={14} stroke={1.5} className="tool-icon" />, 
    action: 'searching', 
    detail: `"${i?.pattern || ''}" in ${formatPath(i?.path || '.')}`
  }),
  'Glob': (i) => ({ 
    icon: <IconFileSearch size={14} stroke={1.5} className="tool-icon" />, 
    action: 'finding', 
    detail: i?.pattern || 'files'
  }),
  'LS': (i) => ({ 
    icon: <IconFolderOpen size={14} stroke={1.5} className="tool-icon" />, 
    action: 'listing', 
    detail: formatPath(i?.path)
  }),
  'Task': (i) => ({ 
    icon: <IconRobot size={14} stroke={1.5} className="tool-icon" />, 
    action: i?.description || 'running task', 
    detail: i?.subagent_type || 'agent'
  }),
  'ExitPlanMode': (i) => ({ 
    icon: <IconLogout size={14} stroke={1.5} className="tool-icon" />, 
    action: 'plan complete', 
    detail: 'ready to execute'
  }),
  'NotebookEdit': (i) => ({ 
    icon: <IconNotebook size={14} stroke={1.5} className="tool-icon" />, 
    action: 'editing notebook', 
    detail: formatPath(i?.notebook_path)
  }),
  'BashOutput': (i) => ({ 
    icon: <IconTerminal2 size={14} stroke={1.5} className="tool-icon" />, 
    action: 'reading output', 
    detail: `bash ${i?.bash_id || 'session'}`
  }),
  'KillBash': (i) => ({ 
    icon: <IconPlayerStop size={14} stroke={1.5} className="tool-icon" />, 
    action: 'stopping', 
    detail: `bash ${i?.shell_id || 'session'}`
  })
};

// Helper function to detect and format MCP tools
// Note: formatToolInput is defined below with other helper functions
const getMCPToolDisplay = (toolName: string, input: any) => {
  // MCP tools follow pattern: mcp__<server>__<tool>
  if (toolName.startsWith('mcp__')) {
    const parts = toolName.split('__');
    const server = parts[1] || 'server';
    const tool = parts[2] || 'tool';
    
    // Use simplified formatting here since formatToolInput isn't defined yet
    let detail = server;
    if (input) {
      if (typeof input === 'string') {
        detail += ` • ${input.substring(0, 50)}`;
      } else if (typeof input === 'object') {
        const keys = Object.keys(input);
        if (keys.length > 0) {
          detail += ` • ${keys.slice(0, 2).join(', ')}`;
        }
      }
    }
    
    return {
      icon: <IconServer size={14} stroke={1.5} className="tool-icon" />,
      action: `mcp: ${tool.replace(/_/g, ' ')}`,
      detail
    };
  }
  return null;
};

// Helper functions
const formatPath = (path?: string) => {
  if (!path) return '';
  
  // Convert Windows paths to Unix format
  let unixPath = path.replace(/\\/g, '/');
  
  // Get the current session's working directory from the store
  const store = useClaudeCodeStore.getState();
  const currentSession = store.sessions.find(s => s.id === store.currentSessionId);
  const workingDir = currentSession?.workingDirectory;
  
  if (workingDir) {
    // Convert working directory to Unix format too
    const unixWorkingDir = workingDir.replace(/\\/g, '/');
    
    // Try multiple strategies to make path relative
    
    // 1. Direct match - path starts with working directory
    if (unixPath.toLowerCase().startsWith(unixWorkingDir.toLowerCase())) {
      unixPath = unixPath.slice(unixWorkingDir.length);
      // Remove leading slash if present
      if (unixPath.startsWith('/')) {
        unixPath = unixPath.slice(1);
      }
      // If empty, it's the current directory
      if (!unixPath) {
        unixPath = '.';
      }
    } 
    // 2. Handle macOS/Unix absolute paths - check if path contains project name
    else if (unixPath.startsWith('/')) {
      const projectName = workingDir.split('/').pop() || '';
      const projectIdx = unixPath.toLowerCase().indexOf('/' + projectName.toLowerCase() + '/');
      if (projectIdx !== -1) {
        unixPath = unixPath.slice(projectIdx + projectName.length + 2);
      }
    }
    // 3. Handle Windows absolute paths (C:\, D:\, etc)
    else if (/^[A-Z]:/i.test(unixPath)) {
      const projectName = workingDir.split('/').pop() || '';
      const projectIdx = unixPath.toLowerCase().indexOf('/' + projectName.toLowerCase() + '/');
      if (projectIdx !== -1) {
        unixPath = unixPath.slice(projectIdx + projectName.length + 2);
      }
    }
    // 4. Handle WSL paths
    else if (unixPath.startsWith('/mnt/')) {
      const projectName = workingDir.split('/').pop() || '';
      const projectIdx = unixPath.toLowerCase().indexOf('/' + projectName.toLowerCase() + '/');
      if (projectIdx !== -1) {
        unixPath = unixPath.slice(projectIdx + projectName.length + 2);
      }
    }
  }
  
  // Remove any remaining absolute path prefixes
  if (unixPath.startsWith('/mnt/c/')) {
    const parts = unixPath.split('/');
    // Find project folder (yurucode or testproject)
    const projectIdx = parts.findIndex(p => p === 'yurucode' || p === 'testproject');
    if (projectIdx !== -1) {
      unixPath = parts.slice(projectIdx + 1).join('/');
    }
  }
  
  // If still absolute, try to make it relative
  if (unixPath.startsWith('/')) {
    const parts = unixPath.split('/');
    if (parts.length > 3) {
      return '.../' + parts.slice(-2).join('/');
    }
  }
  
  return unixPath || '.';
};

const formatCommand = (cmd?: string) => {
  if (!cmd) return '';
  if (cmd.length > 50) {
    return cmd.substring(0, 50) + '...';
  }
  return cmd;
};

const formatUrl = (url?: string) => {
  if (!url) return '';
  try {
    const u = new URL(url);
    return u.hostname + (u.pathname !== '/' ? u.pathname : '');
  } catch {
    return url;
  }
};

const formatTodos = (todos?: any[]) => {
  if (!todos || !Array.isArray(todos)) return '0 items';
  const counts = {
    pending: todos.filter(t => t.status === 'pending').length,
    in_progress: todos.filter(t => t.status === 'in_progress').length,
    completed: todos.filter(t => t.status === 'completed').length
  };
  const parts = [];
  if (counts.in_progress > 0) parts.push(`${counts.in_progress} active`);
  if (counts.pending > 0) parts.push(`${counts.pending} pending`);
  if (counts.completed > 0) parts.push(`${counts.completed} done`);
  return parts.length > 0 ? parts.join(', ') : 'No tasks';
};

const getChangePreview = (oldStr?: string, newStr?: string) => {
  if (!oldStr || !newStr) return '';
  const oldPreview = oldStr.length > 20 ? oldStr.substring(0, 20) + '...' : oldStr;
  return `Replacing "${oldPreview}"`;
};

const formatToolInput = (input: any): string => {
  if (!input) return '';
  
  // For simple values
  if (typeof input === 'string') return input.length > 50 ? input.substring(0, 50) + '...' : input;
  if (typeof input === 'number' || typeof input === 'boolean') return String(input);
  
  // For objects/arrays, extract meaningful info
  if (typeof input === 'object') {
    // Check for common patterns
    if (input.file_path) return formatPath(input.file_path);
    if (input.path) return formatPath(input.path);
    if (input.command) return formatCommand(input.command);
    if (input.url) return formatUrl(input.url);
    if (input.query) return `"${input.query}"`;
    if (input.pattern) return `"${input.pattern}"`;
    if (input.prompt) return input.prompt.substring(0, 50) + '...';
    
    // For arrays, show count
    if (Array.isArray(input)) return `${input.length} items`;
    
    // For other objects, show key count
    const keys = Object.keys(input);
    if (keys.length > 0) {
      const preview = keys.slice(0, 2).map(k => `${k}: ${String(input[k]).substring(0, 20)}`).join(', ');
      return preview + (keys.length > 2 ? '...' : '');
    }
  }
  
  return '';
};

// Render content blocks
// Custom code block component with copy button
const CodeBlock = ({ children, className, ...props }: any) => {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';
  const codeString = String(children).replace(/\n$/, '');
  
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(codeString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [codeString]);
  
  // If code is short (under 256 chars), render as inline code
  if (codeString.length < 256 && !codeString.includes('\n')) {
    return <code className={className} {...props}>{codeString}</code>;
  }
  
  return (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        <span className="code-language">{language || 'code'}</span>
        <button onClick={handleCopy} className="code-copy-btn" title={copied ? 'copied!' : 'copy'}>
          {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
        </button>
      </div>
      <SyntaxHighlighter
        language={language || 'text'}
        style={vs2015}
        customStyle={{
          margin: 0,
          padding: '2px',
          border: 'none',
          borderRadius: '2px',
          fontSize: '12px',
          backgroundColor: '#000000'
        }}
        {...props}
      >
        {codeString}
      </SyntaxHighlighter>
    </div>
  );
};

const renderContent = (content: string | ContentBlock[] | undefined, message?: any, searchQuery?: string, isCurrentMatch?: boolean) => {
  if (!content) return null;
  
  if (typeof content === 'string') {
    // Check if this is raw JSON that shouldn't be displayed
    const trimmedContent = content.trim();
    if ((trimmedContent.startsWith('[') && trimmedContent.endsWith(']')) ||
        (trimmedContent.startsWith('{') && trimmedContent.endsWith('}'))) {
      try {
        const parsed = JSON.parse(trimmedContent);
        // If it's an array of content blocks, process them properly
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].type) {
          return renderContent(parsed, message, searchQuery, isCurrentMatch);
        }
        // If it's a single content block, wrap in array and process
        if (parsed.type && (parsed.text || parsed.name)) {
          return renderContent([parsed], message, searchQuery, isCurrentMatch);
        }
        // Otherwise it's raw JSON data that shouldn't be shown
        console.warn('[MessageRenderer] Filtering out raw JSON string:', trimmedContent.substring(0, 100));
        return null;
      } catch (e) {
        // Not valid JSON, render as markdown
      }
    }
    
    return (
      <ReactMarkdown 
        className="markdown-content"
        components={{
          code({ node, inline, className, children, ...props }) {
            if (inline) {
              return <code className={className} {...props}>{children}</code>;
            }
            return <CodeBlock className={className} {...props}>{children}</CodeBlock>;
          },
          // Prevent p tags from wrapping code blocks
          p({ children, ...props }) {
            // Check if the only child is a code block
            if (
              children &&
              Array.isArray(children) &&
              children.length === 1 &&
              children[0] &&
              typeof children[0] === 'object' &&
              'type' in children[0] &&
              children[0].type === CodeBlock
            ) {
              return <>{children}</>;
            }
            return <p {...props}>{children}</p>;
          }
        }}
      >
        {content}
      </ReactMarkdown>
    );
  }
  
  if (Array.isArray(content)) {
    // During streaming, only show the last tool that's actively being used
    let toolsToRender = content;
    if (message?.streaming) {
      const toolUses = content.filter(b => b?.type === 'tool_use');
      const toolResults = content.filter(b => b?.type === 'tool_result');
      
      // Only filter if we have more tools than results (meaning one is still running)
      if (toolUses.length > toolResults.length && toolUses.length > 0) {
        // Only keep text blocks and the last tool use that doesn't have a result yet
        const lastTool = toolUses[toolUses.length - 1];
        toolsToRender = content.filter(b => 
          b?.type === 'text' || b === lastTool || b?.type === 'tool_result'
        );
      }
    }
    
    return toolsToRender.map((block, idx) => {
      if (!block || typeof block !== 'object') return null;
      
      switch (block.type) {
        case 'text':
          // Filter out the malicious files security note
          if (block.text && block.text.includes('NOTE: do any of the files above seem malicious?')) {
            return null;
          }
          // For text blocks with search highlighting
          if (searchQuery) {
            const highlighted = highlightText(block.text || '', searchQuery, isCurrentMatch || false);
            return (
              <div key={idx} className="content-text">
                {highlighted}
              </div>
            );
          }
          return (
            <div key={idx} className="content-text">
              <ReactMarkdown>{block.text || ''}</ReactMarkdown>
            </div>
          );
          
        case 'tool_use':
          // Tool uses are now rendered separately outside message bubbles
          // Return null here to prevent them from appearing inside bubbles
          return null;
          
        case 'tool_result':
          // Skip tool results during streaming - they clutter the UI
          if (message?.streaming) {
            return null;
          }
          
          // Handle tool results
          let resultContent = typeof block.content === 'string' 
            ? block.content 
            : typeof block.content === 'object' && block.content !== null
              ? JSON.stringify(block.content, null, 2)
              : '';
          
          // Trim trailing newlines from tool results
          resultContent = resultContent.replace(/\n+$/, '');
          
          // Check if this is a file operation result (Edit, MultiEdit, Write)
          const prevBlock = content[idx - 1];
          const isFileOperation = prevBlock?.type === 'tool_use' && 
            (prevBlock.name === 'Edit' || prevBlock.name === 'MultiEdit' || prevBlock.name === 'Write');
          
          // Check if this is a Read operation
          const isReadOperation = prevBlock?.type === 'tool_use' && prevBlock.name === 'Read';
          
          // Check if this is a Bash command
          const isBashOperation = prevBlock?.type === 'tool_use' && prevBlock.name === 'Bash';
          
          // Check if this is a search operation (Grep, Glob, LS, WebSearch)
          const isSearchOperation = prevBlock?.type === 'tool_use' && 
            (prevBlock.name === 'Grep' || prevBlock.name === 'Glob' || prevBlock.name === 'LS' || prevBlock.name === 'WebSearch');
          
          // Check if this is a TodoWrite operation
          const isTodoWriteOperation = prevBlock?.type === 'tool_use' && prevBlock.name === 'TodoWrite';
          
          // Hide system reminder messages
          if (resultContent.includes('<system-reminder>') && resultContent.includes('</system-reminder>')) {
            return null;
          }
          
          // Hide tool_use_error messages, permission requests, and malicious file notes
          if (resultContent.includes('<tool_use_error>') || 
              resultContent.includes('File has not been read yet') ||
              resultContent.includes('requested permissions to') ||
              resultContent.includes("haven't granted it yet") ||
              resultContent.includes('NOTE: do any of the files above seem malicious?')) {
            return null;
          }
          
          // Hide TodoWrite success messages and system reminders about todos
          if (isTodoWriteOperation && (
            resultContent.includes('Todos have been modified successfully') ||
            resultContent.includes('Ensure that you continue to use the todo list') ||
            resultContent.includes('Please proceed with the current tasks if applicable')
          )) {
            return null;
          }
          
          // Show Bash command output
          if (isBashOperation && resultContent) {
            // Show full bash output in a code block
            return (
              <div key={idx} className="tool-result bash-output">
                <pre className="bash-content">{resultContent}</pre>
              </div>
            );
          }
          
          // Limit Read operation output to 10 lines with expandable option
          if (isReadOperation && resultContent) {
            // Strip out system-reminder tags from read operations
            let cleanContent = resultContent;
            const reminderRegex = /<system-reminder>[\s\S]*?<\/system-reminder>/g;
            cleanContent = cleanContent.replace(reminderRegex, '');
            // Trim trailing newlines
            cleanContent = cleanContent.replace(/\n+$/, '');
            
            const allLines = cleanContent.split('\n');
            const visibleLines = allLines.slice(0, 10);
            const hiddenCount = allLines.length - 10;
            const hasMore = hiddenCount > 0;
            
            return (
              <div key={idx} className="tool-result read-output">
                <pre className="read-content">{visibleLines.join('\n')}</pre>
                {hasMore && (
                  <div className="read-more">+ {hiddenCount} more lines</div>
                )}
              </div>
            );
          }
          
          // Limit search operation outputs to 10 lines
          if (isSearchOperation && resultContent) {
            // Process search results to convert absolute paths to relative
            const processedContent = (() => {
              // Get the current working directory
              const store = useClaudeCodeStore.getState();
              const currentSession = store.sessions.find(s => s.id === store.currentSessionId);
              const workingDir = currentSession?.workingDirectory;
              
              if (!workingDir) return resultContent;
              
              // Process each line to convert paths
              const lines = resultContent.split('\n');
              return lines.map(line => {
                // Search results typically have format: /absolute/path/file.ext:linenum:content
                // or: /absolute/path/file.ext-content
                const colonIndex = line.indexOf(':');
                const dashIndex = line.indexOf('-');
                const separatorIndex = colonIndex > 0 && (dashIndex < 0 || colonIndex < dashIndex) ? colonIndex : dashIndex;
                
                if (separatorIndex > 0) {
                  const pathPart = line.substring(0, separatorIndex);
                  // Check if this looks like a path
                  if (pathPart.startsWith('/') || pathPart.match(/^[A-Z]:/)) {
                    const relativePath = formatPath(pathPart);
                    return relativePath + line.substring(separatorIndex);
                  }
                }
                return line;
              }).join('\n');
            })();
            
            // Don't trim search results to preserve formatting
            const allLines = processedContent.split('\n');
            const visibleLines = allLines.slice(0, 10);
            const hiddenCount = allLines.length - 10;
            const hasMore = hiddenCount > 0;
            
            return (
              <div key={idx} className="tool-result search-output">
                <pre className="search-content">{visibleLines.join('\n')}</pre>
                {hasMore && (
                  <div className="search-more">+ {hiddenCount} more lines</div>
                )}
              </div>
            );
          }
          
          // Show formatted diff for file operations
          if (isFileOperation && resultContent) {
            // Check if this is an Edit/MultiEdit result
            const isEditResult = (resultContent.includes('has been updated') && resultContent.includes('→')) ||
                                (resultContent.includes('Applied') && resultContent.includes('edits to'));
            
            if (isEditResult) {
              // Parse the Edit result to extract the diff
              const lines = resultContent.split('\n');
              
              // Extract file path from Edit or MultiEdit output
              let filePathMatch = resultContent.match(/The file (.+?) has been updated/);
              if (!filePathMatch) {
                filePathMatch = resultContent.match(/Applied \d+ edits? to (.+?):/);
              }
              let filePath = filePathMatch ? filePathMatch[1] : 'file';
              
              // Convert to relative path
              filePath = formatPath(filePath);
              
              // Find the actual diff part (after "Here's the result of running" or "Applied X edits")
              let diffStartIdx = lines.findIndex(line => line.includes("Here's the result of running"));
              if (diffStartIdx === -1) {
                diffStartIdx = lines.findIndex(line => line.match(/^\d+\./));
              }
              const diffLines = diffStartIdx >= 0 ? lines.slice(diffStartIdx + 1) : [];
              
              // Hide edit results completely
              return null;
            }
            
            // For Write operations, just show success message
            return (
              <div key={idx} className="tool-result file-write">
                <span className="result-text">file written successfully</span>
              </div>
            );
          }
          
          // If we've handled file operations above, don't show them again
          if (isFileOperation) {
            return null;
          }
          
          // Filter out verbose outputs for non-file/non-read operations
          if (!isReadOperation && !isSearchOperation && resultContent.length > 1000) {
            return (
              <div key={idx} className="tool-result collapsed">
                <span className="result-text">output hidden ({resultContent.length} chars)</span>
              </div>
            );
          }
          
          if (block.is_error) {
            return (
              <div key={idx} className="tool-result error">
                <span className="result-text">{resultContent}</span>
              </div>
            );
          }
          
          if (resultContent.includes('successfully') || resultContent.includes('created') || resultContent.includes('updated')) {
            return (
              <div key={idx} className="tool-result success">
                <span className="result-text">{resultContent}</span>
              </div>
            );
          }
          
          // Show other tool results in a minimal way
          if (resultContent && (isSearchOperation ? resultContent.replace(/\n+$/, '') : resultContent.trim())) {
            // For search operations: only remove trailing newlines, preserve leading spaces
            // For other operations: trim all whitespace
            const trimmedContent = isSearchOperation ? resultContent.replace(/\n+$/, '') : resultContent.replace(/\n+$/, '').trim();
            return (
              <div key={idx} className="tool-result minimal">
                <span className="result-text">{trimmedContent.substring(0, 100)}{trimmedContent.length > 100 ? '...' : ''}</span>
              </div>
            );
          }
          
          return null;
          
        default:
          // Never show raw JSON or unknown block types
          console.warn('[MessageRenderer] Unknown content block type:', block.type);
          return null;
      }
    });
  }
  
  return null;
};

// Helper function to highlight search matches
const highlightText = (text: string, searchQuery: string, isCurrentMatch: boolean) => {
  if (!searchQuery || !text) return text;
  
  const parts = text.split(new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  
  return parts.map((part, i) => {
    if (part.toLowerCase() === searchQuery.toLowerCase()) {
      return (
        <span key={i} className={`search-highlight ${isCurrentMatch ? 'current' : ''}`}>
          {part}
        </span>
      );
    }
    return part;
  });
};

// Main message renderer component - memoized for performance
const MessageRendererBase: React.FC<{ 
  message: ClaudeMessage; 
  index: number; 
  isLast?: boolean;
  searchQuery?: string;
  isCurrentMatch?: boolean;
}> = ({ message, index, isLast = false, searchQuery = '', isCurrentMatch = false }) => {
  // Get the current session to access previous messages for context
  const store = useClaudeCodeStore.getState();
  const currentSession = store.sessions.find(s => s.id === store.currentSessionId);
  const sessionMessages = currentSession?.messages || [];
  
  // Debug logging
  React.useEffect(() => {
    console.log('[MessageRenderer] Rendering message:', {
      type: message.type,
      id: message.id,
      index,
      isLast,
      streaming: message.streaming,
      hasContent: !!message.message?.content
    });
  }, [message, index, isLast]);
  
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };
  
  const handleRestore = () => {
    const store = useClaudeCodeStore.getState();
    const currentSessionId = store.currentSessionId;
    if (!currentSessionId) return;
    
    // Find the current session
    const session = store.sessions.find(s => s.id === currentSessionId);
    if (!session) return;
    
    // Find the actual index of this message in the original messages array
    const actualIndex = session.messages.findIndex(m => 
      (m.id && message.id && m.id === message.id) ||
      (m === message)
    );
    
    if (actualIndex === -1) return;
    
    // Keep messages up to and including this one
    const messages = session.messages.slice(0, actualIndex + 1);
    
    // Update the session with truncated messages and reset Claude session ID
    // This forces Claude to start fresh without the conversation history after the restore point
    useClaudeCodeStore.setState(state => ({
      sessions: state.sessions.map(s => 
        s.id === currentSessionId 
          ? { ...s, messages, claudeSessionId: null, updatedAt: new Date() }
          : s
      )
    }));
  };
  
  const getMessageText = (content: any): string => {
    if (typeof content === 'string') {
      // Check if this is a JSON string (from attachments)
      if (content.startsWith('[') && content.endsWith(']')) {
        try {
          const parsedContent = JSON.parse(content);
          if (Array.isArray(parsedContent)) {
            // Extract text from JSON-parsed content blocks, excluding attachment markers
            return parsedContent
              .filter(block => block.type === 'text' && block.text)
              .map(block => {
                const text = block.text;
                // Skip attachment markers, return only regular text
                if (text.startsWith('[Attached text]:') || 
                    text.startsWith('[Attached image') ||
                    text.includes('[Attached text]:') ||
                    text.includes('[Attached image')) {
                  return '';
                }
                return text;
              })
              .filter(text => text.trim())
              .join('\n');
          }
        } catch (e) {
          // If JSON parsing fails, return as regular string
        }
      }
      return content;
    }
    if (Array.isArray(content)) {
      return content
        .filter(block => block.type === 'text' && block.text)
        .map(block => {
          const text = block.text;
          // Skip attachment markers, return only regular text
          if (text.startsWith('[Attached text]:') || 
              text.startsWith('[Attached image') ||
              text.includes('[Attached text]:') ||
              text.includes('[Attached image')) {
            return '';
          }
          return text;
        })
        .filter(text => text.trim())
        .join('\n');
    }
    return '';
  };
  switch (message.type) {
    case 'system':
      // Show error messages and interruption messages
      if (message.subtype === 'error') {
        return (
          <div className="message system-error">
            <div className="message-content">
              <div className="error-message">
                <IconAlertTriangle size={14} stroke={1.5} />
                <span>{message.message || 'An error occurred'}</span>
              </div>
            </div>
          </div>
        );
      }
      
      if (message.subtype === 'interrupted') {
        return (
          <div className="message system-interrupted">
            <div className="message-content">
              <div className="interrupted-message">
                <IconPlayerStop size={12} stroke={1.5} />
                <span>{message.message}</span>
              </div>
            </div>
          </div>
        );
      }
      
      // Hide other system messages like session started
      return null;
      
    case 'user':
      const userContent = message.message?.content || '';
      let displayText: any = '';
      let pastedCount = 0;
      let attachmentTypes: string[] = [];
      
      if (typeof userContent === 'string') {
        // Check if this is a JSON string (from attachments)
        if (userContent.startsWith('[{') && userContent.endsWith('}]')) {
          try {
            const parsedContent = JSON.parse(userContent);
            if (Array.isArray(parsedContent)) {
              // Handle JSON-parsed content blocks
              let userTexts: string[] = [];
              
              parsedContent.forEach((item) => {
                if (item && typeof item === 'object') {
                  if (item.type === 'text' && item.text) {
                    const text = item.text;
                    
                    // Check if this is an attachment
                    if (text.startsWith('[Attached text]:') || text.includes('[Attached text]:')) {
                      pastedCount++;
                      attachmentTypes.push('text');
                      // Don't add to userTexts - we only show in attachment indicator
                    } else if (text.startsWith('[Attached image') || text.includes('[Attached image')) {
                      pastedCount++;
                      attachmentTypes.push('image');
                      // Don't add to userTexts - we only show in attachment indicator
                    } else {
                      // This is regular user text
                      userTexts.push(text);
                    }
                  } else if (item.type === 'image') {
                    // Count image attachments
                    pastedCount++;
                    attachmentTypes.push('image');
                  }
                }
              });
              
              // Join all regular user texts (usually just one at the end)
              displayText = userTexts.join(' ').trim();
            } else {
              // Not an array, treat as regular string
              displayText = userContent;
            }
          } catch (e) {
            console.log('[MessageRenderer] Failed to parse JSON content, treating as string');
            // If JSON parsing fails, treat as regular string
            displayText = userContent;
          }
        } else {
          // Regular string content
          displayText = userContent;
        }
      } else if (Array.isArray(userContent)) {
        // Handle array content directly (shouldn't happen with proper JSON string storage)
        let userTexts: string[] = [];
        
        userContent.forEach((item) => {
          if (item && typeof item === 'object') {
            if (item.type === 'text' && item.text) {
              const text = item.text;
              
              // Check if this is an attachment
              if (text.startsWith('[Attached text]:') || text.includes('[Attached text]:')) {
                pastedCount++;
                attachmentTypes.push('text');
              } else if (text.startsWith('[Attached image') || text.includes('[Attached image')) {
                pastedCount++;
                attachmentTypes.push('image');
              } else {
                // This is regular user text
                userTexts.push(text);
              }
            } else if (item.type === 'image') {
              // Count image attachments
              pastedCount++;
              attachmentTypes.push('image');
            }
          } else if (typeof item === 'string') {
            // Direct string item - assume it's regular text
            userTexts.push(item);
          }
        });
        
        // Join all regular user texts
        displayText = userTexts.join(' ').trim();
      }
      
      // Add attachment indicator if present with cleaner formatting
      if (pastedCount > 0) {
        // Extract text content to count lines and bytes
        let totalLines = 0;
        let totalBytes = 0;
        const imageCount = attachmentTypes.filter(t => t === 'image').length;
        const textCount = attachmentTypes.filter(t => t === 'text').length;
        
        // Parse content again to get actual attachment data
        if (typeof userContent === 'string' && userContent.startsWith('[{')) {
          try {
            const parsedContent = JSON.parse(userContent);
            parsedContent.forEach((item) => {
              if (item?.type === 'text' && item?.text) {
                const text = item.text;
                if (text.startsWith('[Attached text]:')) {
                  const attachedText = text.substring('[Attached text]:'.length);
                  totalLines += attachedText.split('\n').length;
                  totalBytes += new Blob([attachedText]).size;
                }
              }
            });
          } catch (e) {
            // Ignore parsing errors
          }
        }
        
        let attachmentText = '';
        if (textCount > 0 && totalLines > 0) {
          // Format bytes nicely
          const formatBytes = (bytes: number) => {
            if (bytes < 1024) return `${bytes} bytes`;
            if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}kb`;
            return `${(bytes / (1024 * 1024)).toFixed(1)}mb`;
          };
          attachmentText = `${totalLines} lines, ${formatBytes(totalBytes)}`;
        } else if (imageCount > 0) {
          attachmentText = `${imageCount} image${imageCount > 1 ? 's' : ''}`;
        } else {
          attachmentText = `${pastedCount} attachment${pastedCount > 1 ? 's' : ''}`;
        }
        
        const attachmentPreview = (
          <div className="message-attachment-preview">
            <span className="attachment-text">[attached: {attachmentText}]</span>
          </div>
        );
        displayText = (
          <>
            {displayText && <div>{displayText}</div>}
            {attachmentPreview}
          </>
        );
      }
      
      return (
        <div className="message user">
          <div className="message-actions user-actions">
            {!isLast && (
              <button 
                onClick={handleRestore} 
                className="action-btn"
                title="restore to here"
              >
                <IconArrowBackUp size={12} stroke={1.5} />
              </button>
            )}
            <button 
              onClick={() => handleCopy(getMessageText(message.message?.content))} 
              className="action-btn"
              title="copy"
            >
              <IconCopy size={12} stroke={1.5} />
            </button>
          </div>
          <div className="message-bubble">
            {typeof displayText === 'string' && displayText.includes('\n') ? (
              <pre style={{ 
                whiteSpace: 'pre-wrap', 
                wordBreak: 'break-word',
                margin: 0,
                fontFamily: 'monospace',
                fontSize: '11px',
                lineHeight: '1.4'
              }}>{highlightText(displayText, searchQuery, isCurrentMatch)}</pre>
            ) : typeof displayText === 'string' ? (
              <span>{highlightText(displayText, searchQuery, isCurrentMatch)}</span>
            ) : (
              displayText
            )}
          </div>
        </div>
      );
      
    case 'assistant':
      const assistantContent = message.message?.content;
      const isEmpty = !assistantContent || 
        (typeof assistantContent === 'string' && !assistantContent.trim()) ||
        (Array.isArray(assistantContent) && assistantContent.filter(b => b.type === 'text' && b.text).length === 0);
      
      // Always show buttons for non-streaming assistant messages
      const showButtons = message.streaming !== true;
      
      // Don't render if content is a raw JSON string or object that's not properly formatted
      let contentToRender = message.message?.content;
      if (typeof contentToRender === 'string') {
        // Check if it's a JSON string that shouldn't be shown
        if ((contentToRender.startsWith('{') && contentToRender.endsWith('}')) ||
            (contentToRender.startsWith('[') && contentToRender.endsWith(']'))) {
          try {
            const parsed = JSON.parse(contentToRender);
            // If it successfully parses as JSON and has type/text structure, convert to proper content blocks
            if (Array.isArray(parsed) && parsed.some(item => item.type)) {
              contentToRender = parsed;
            } else if (parsed.type && parsed.text) {
              contentToRender = [parsed];
            } else {
              // It's raw JSON data that shouldn't be shown
              console.warn('[MessageRenderer] Filtering out raw JSON content');
              contentToRender = null;
            }
          } catch (e) {
            // Not JSON, treat as regular text
          }
        }
      }
      
      // Separate text content from tool uses
      let textContent = contentToRender;
      let toolUses: ContentBlock[] = [];
      
      if (Array.isArray(contentToRender)) {
        textContent = contentToRender.filter(b => b.type === 'text');
        toolUses = contentToRender.filter(b => b.type === 'tool_use');
      } else if (typeof contentToRender === 'string') {
        // If it's a string, treat it as text content
        textContent = contentToRender;
        toolUses = [];
      }
      
      return (
        <>
          {/* Render text content in message bubble if there is any */}
          {textContent && ((Array.isArray(textContent) && textContent.length > 0) || (typeof textContent === 'string' && textContent.trim())) && (
            <div className="message assistant">
              <div className="message-content">
                <div className="message-bubble">
                  {renderContent(textContent, message, searchQuery, isCurrentMatch)}
                </div>
              </div>
              {showButtons && (
                <div className="message-actions">
                  {!isLast && (
                    <button 
                      onClick={handleRestore} 
                      className="action-btn"
                      title="restore to here"
                    >
                      <IconArrowBackUp size={12} stroke={1.5} />
                    </button>
                  )}
                  <button 
                    onClick={() => handleCopy(getMessageText(message.message?.content))} 
                    className="action-btn"
                    title="copy"
                  >
                    <IconCopy size={12} stroke={1.5} />
                  </button>
                </div>
              )}
            </div>
          )}
          
          {/* Render tool uses separately outside the message bubble */}
          {toolUses && toolUses.map((toolBlock, idx) => {
            const tool = TOOL_DISPLAYS[toolBlock.name || ''];
            const mcpDisplay = !tool ? getMCPToolDisplay(toolBlock.name || '', toolBlock.input) : null;
            const display = tool ? tool(toolBlock.input) : mcpDisplay || {
              icon: <IconBolt size={14} stroke={1.5} className="tool-icon" />,
              action: toolBlock.name?.toLowerCase() || 'tool',
              detail: toolBlock.input ? formatToolInput(toolBlock.input) : '',
              todos: null
            };
            
            // Special rendering for TodoWrite
            if (toolBlock.name === 'TodoWrite' && toolBlock.input?.todos) {
              const todos = toolBlock.input.todos || [];
              return (
                <div key={`tool-${idx}`} className="tool-use todo-write standalone">
                  <div className="todo-header">
                    <IconChecklist size={14} stroke={1.5} className="todo-header-icon" />
                    <span className="tool-action">{display.action}</span>
                    <span className="tool-detail">{display.detail}</span>
                  </div>
                  <div className="todo-list">
                    {todos.map((todo: any, todoIdx: number) => (
                      <div key={todoIdx} className={`todo-item ${todo.status}`}>
                        {todo.status === 'completed' ? (
                          <IconCheck size={12} stroke={2} className="todo-icon completed" />
                        ) : todo.status === 'in_progress' ? (
                          <IconDots size={12} stroke={2} className="todo-icon progress" />
                        ) : (
                          <IconMinus size={12} stroke={2} className="todo-icon pending" />
                        )}
                        <span className="todo-content">{todo.content}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }
            
            // Regular tool use rendering
            return (
              <div key={`tool-${idx}`} className="tool-use standalone">
                {display.icon && <span className="tool-icon">{display.icon}</span>}
                <span className="tool-action">{display.action}</span>
                {display.detail && <span className="tool-detail">{display.detail}</span>}
                {message?.streaming === true && idx === toolUses.length - 1 && (
                  <IconLoader2 size={12} className="streaming-loader" />
                )}
              </div>
            );
          })}
        </>
      );
      
    case 'tool_use':
      // Standalone tool use message
      const toolName = message.message?.name || 'unknown tool';
      const toolInput = message.message?.input || {};
      const tool = TOOL_DISPLAYS[toolName];
      const mcpDisplay = !tool ? getMCPToolDisplay(toolName, toolInput) : null;
      const display = tool ? tool(toolInput) : mcpDisplay || {
        icon: <IconBolt size={14} stroke={1.5} />,
        action: toolName.toLowerCase(),
        detail: formatToolInput(toolInput)
      };
      
      // For TodoWrite tool, show the full todo list
      if (toolName === 'TodoWrite' && toolInput.todos) {
        const todos = toolInput.todos || [];
        return (
          <div className="message tool-message">
            <div className="tool-use todo-write standalone">
              <div className="todo-header">
                <IconChecklist size={14} stroke={1.5} className="todo-header-icon" />
                <span className="tool-action">updating todos</span>
                <span className="tool-detail">{formatTodos(todos)}</span>
              </div>
              <div className="todo-list">
                {todos.map((todo: any, todoIdx: number) => (
                  <div key={todoIdx} className={`todo-item ${todo.status}`}>
                    {todo.status === 'completed' ? (
                      <IconCheck size={12} stroke={2} className="todo-icon completed" />
                    ) : todo.status === 'in_progress' ? (
                      <IconDots size={12} stroke={2} className="todo-icon progress" />
                    ) : (
                      <IconMinus size={12} stroke={2} className="todo-icon pending" />
                    )}
                    <span className="todo-content">{todo.content}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      }
      
      // For Edit tool, show a proper diff
      if (toolName === 'Edit' || toolName === 'MultiEdit') {
        let filePath = toolInput.file_path || 'file';
        // Convert to relative Unix path
        filePath = filePath.replace(/^[A-Z]:\\.*\\(testproject|yurucode)\\/, '')
                          .replace(/\\/g, '/');
        
        const oldString = toolInput.old_string || '';
        const newString = toolInput.new_string || '';
        
        // Split into lines for diff display
        const oldLines = oldString.split('\n');
        const newLines = newString.split('\n');
        
        return (
          <div className="message tool-message">
            <div className="tool-use standalone">
              <IconEdit size={14} stroke={1.5} className="tool-icon" />
              <span className="tool-action">editing</span>
              <span className="tool-detail">{filePath}</span>
            </div>
            <div className="edit-diff">
              {oldLines.length > 0 && oldLines[0] && (
                <div className="diff-section removed">
                  {oldLines.map((line, idx) => (
                    <div key={`old-${idx}`} className="diff-line removed">
                      <span className="diff-marker">-</span>
                      <span className="diff-text">{line}</span>
                    </div>
                  ))}
                </div>
              )}
              {newLines.length > 0 && newLines[0] && (
                <div className="diff-section added">
                  {newLines.map((line, idx) => (
                    <div key={`new-${idx}`} className="diff-line added">
                      <span className="diff-marker">+</span>
                      <span className="diff-text">{line}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      }
      
      return (
        <div className="message tool-message">
          <div className="tool-use standalone">
            {display.icon && <span className="tool-icon">{display.icon}</span>}
            <span className="tool-action">{display.action}</span>
            {display.detail && <span className="tool-detail">{display.detail}</span>}
          </div>
        </div>
      );
      
    case 'tool_result':
      // Standalone tool result message
      const resultContent = message.message?.content || message.message || '';
      
      // Extract plain text from JSON if it's a tool result with output
      let contentStr = '';
      if (typeof resultContent === 'string') {
        // Check if it's JSON with tool_use_id and output
        if (resultContent.includes('tool_use_id') && resultContent.includes('"output"')) {
          try {
            const parsed = JSON.parse(resultContent);
            if (parsed.output) {
              contentStr = parsed.output;
            } else {
              contentStr = resultContent;
            }
          } catch (e) {
            contentStr = resultContent;
          }
        } else {
          contentStr = resultContent;
        }
      } else if (typeof resultContent === 'object' && resultContent.output) {
        contentStr = resultContent.output;
      } else {
        contentStr = typeof resultContent === 'string' ? resultContent : JSON.stringify(resultContent, null, 2);
      }
      
      // Hide tool_use_error messages like "File has not been read yet"
      if (contentStr.includes('<tool_use_error>') || 
          contentStr.includes('File has not been read yet')) {
        return null;
      }
      
      // Strip out system-reminder tags from all tool results
      const reminderRegex = /<system-reminder>[\s\S]*?<\/system-reminder>/g;
      contentStr = contentStr.replace(reminderRegex, '');
      
      // Trim trailing newlines from tool results  
      contentStr = contentStr.replace(/\n+$/, '');
      
      // Check if we should preserve formatting (for Read and Search operations)
      const prevMessage = index > 0 ? sessionMessages[index - 1] : null;
      const isReadOperation = prevMessage?.type === 'tool_use' && prevMessage?.message?.name === 'Read';
      const isSearchOperation = prevMessage?.type === 'tool_use' && 
        (prevMessage?.message?.name === 'Grep' || 
         prevMessage?.message?.name === 'Glob' ||
         prevMessage?.message?.name === 'LS' ||
         prevMessage?.message?.name === 'WebSearch');
      
      // Only trim if not a Read or Search operation to preserve formatting
      if (!isReadOperation && !isSearchOperation) {
        contentStr = contentStr.trim();
      }
      
      // Check if this is an Edit result - they contain "has been updated" or "Applied" for MultiEdit
      const isEditResult = (contentStr.includes('has been updated') && contentStr.includes('→')) ||
                          (contentStr.includes('Applied') && contentStr.includes('edits to'));
      
      if (isEditResult) {
        // Parse the Edit result to extract the diff
        const lines = contentStr.split('\n');
        // Extract file path from Edit or MultiEdit output
        let filePathMatch = contentStr.match(/The file (.+?) has been updated/);
        if (!filePathMatch) {
          filePathMatch = contentStr.match(/Applied \d+ edits? to (.+?):/);
        }
        let filePath = filePathMatch ? filePathMatch[1] : 'file';
        
        // Convert Windows path to relative Unix path
        // Remove C:\Users\muuko\Desktop\testproject\ or similar
        filePath = filePath.replace(/^[A-Z]:\\.*\\(testproject|yurucode)\\/, '')
                          .replace(/\\/g, '/');  // Convert backslashes to forward slashes
        
        // Find the actual diff part (after "Here's the result of running")
        const diffStartIdx = lines.findIndex(line => line.includes("Here's the result of running"));
        const diffLines = diffStartIdx >= 0 ? lines.slice(diffStartIdx + 1) : [];
        
        // Hide edit results completely
        return null;
      }
      
      // Check if this is a Read operation result (already have prevMessage from above)
      const isReadResult = isReadOperation;
      
      // Check if this is a search operation result
      const isSearchResult = prevMessage?.type === 'tool_use' && 
        (prevMessage?.message?.name === 'Grep' || 
         prevMessage?.message?.name === 'Glob' || 
         prevMessage?.message?.name === 'LS' || 
         prevMessage?.message?.name === 'WebSearch');
      
      // Check if this is a TodoWrite result and hide success messages
      const isTodoWriteResult = prevMessage?.type === 'tool_use' && 
        prevMessage?.message?.name === 'TodoWrite';
      
      if (isTodoWriteResult && (
        contentStr.includes('Todos have been modified successfully') ||
        contentStr.includes('Ensure that you continue to use the todo list') ||
        contentStr.includes('Please proceed with the current tasks if applicable')
      )) {
        return null;
      }
      
      // Apply truncation for Read operations AND all tool results
      if (contentStr) {
        // Process search results to convert absolute paths to relative
        let processedContent = contentStr;
        if (isSearchResult) {
          // Get the current working directory
          const store = useClaudeCodeStore.getState();
          const currentSession = store.sessions.find(s => s.id === store.currentSessionId);
          const workingDir = currentSession?.workingDirectory;
          
          if (workingDir) {
            // Process each line to convert paths
            const lines = contentStr.split('\n');
            processedContent = lines.map(line => {
              // Search results typically have format: /absolute/path/file.ext:linenum:content
              // or: /absolute/path/file.ext-content
              const colonIndex = line.indexOf(':');
              const dashIndex = line.indexOf('-');
              const separatorIndex = colonIndex > 0 && (dashIndex < 0 || colonIndex < dashIndex) ? colonIndex : dashIndex;
              
              if (separatorIndex > 0) {
                const pathPart = line.substring(0, separatorIndex);
                // Check if this looks like a path
                if (pathPart.startsWith('/') || pathPart.match(/^[A-Z]:/)) {
                  const relativePath = formatPath(pathPart);
                  return relativePath + line.substring(separatorIndex);
                }
              }
              return line;
            }).join('\n');
          }
        }
        
        const allLines = processedContent.split('\n');
        const MAX_LINES = 10;
        const visibleLines = allLines.slice(0, MAX_LINES);
        const hiddenCount = allLines.length - MAX_LINES;
        const hasMore = hiddenCount > 0;
        
        // Choose appropriate styling based on operation type
        const className = isReadResult ? 'read-output' : 
                         isSearchResult ? 'search-output' : 
                         'generic-output';
        
        return (
          <div className="message tool-result-message">
            <div className={`tool-result standalone ${className}`}>
              <pre className="result-content">{visibleLines.join('\n')}</pre>
              {hasMore && (
                <div className="result-more">+ {hiddenCount} more lines</div>
              )}
            </div>
          </div>
        );
      }
      
      // If we get here and still have no content, return null
      return null;
      
    case 'result':
      // Check if this is actually a success (even if subtype says error_during_execution)
      const isSuccess = message.subtype === 'success' || 
                       (message.subtype === 'error_during_execution' && message.success === true);
      
      if (isSuccess) {
        // Show elapsed time for successful completion
        const elapsedMs = message.duration_ms || message.message?.duration_ms || message.duration || 0;
        const elapsedSeconds = (elapsedMs / 1000).toFixed(1);
        const totalTokens = message.usage ? (message.usage.input_tokens + message.usage.output_tokens) : 0;
        
        // Count tool uses in the current conversation turn only
        // Look back through messages to count tool_use messages since the last user message
        const currentIndex = sessionMessages.findIndex(m => m === message);
        let toolCount = 0;
        if (currentIndex > 0) {
          // Go backwards from result to find tool uses in this turn
          for (let i = currentIndex - 1; i >= 0; i--) {
            const msg = sessionMessages[i];
            if (msg.type === 'user') {
              // Stop at the user message that triggered this response
              break;
            }
            if (msg.type === 'tool_use' || 
                (msg.type === 'assistant' && msg.message?.content && Array.isArray(msg.message.content))) {
              // Count tool_use messages or assistant messages with tool_use content blocks
              if (msg.type === 'tool_use') {
                toolCount++;
              } else if (msg.message?.content) {
                const content = msg.message.content;
                if (Array.isArray(content)) {
                  toolCount += content.filter(block => block.type === 'tool_use').length;
                }
              }
            }
          }
        }
        
        return (
          <div className="message result-success">
            <div className="elapsed-time">
              {elapsedSeconds}s
              {totalTokens > 0 && ` • ${totalTokens.toLocaleString()} tokens`}
              {toolCount > 0 && ` • ${toolCount} tool${toolCount !== 1 ? 's' : ''}`}
            </div>
          </div>
        );
      } else if (message.is_error) {
        return (
          <div className="message result-error">
            <IconAlertTriangle size={14} stroke={1.5} className="error-icon" />
            <span className="error-text">
              {message.subtype === 'error_max_turns' ? 'max turns reached' : 'error during execution'}
            </span>
          </div>
        );
      }
      return null;
      
    case 'permission':
      // Hide permission request messages
      return null;
      
    case 'tool_approval':
      return (
        <div className="message tool-approval">
          {message.granted ? (
            <IconCheck size={14} stroke={1.5} className="approval-icon approved" />
          ) : (
            <IconX size={14} stroke={1.5} className="approval-icon denied" />
          )}
          <span className="approval-text">
            tool {message.tool} {message.granted ? 'approved' : 'denied'}
          </span>
        </div>
      );
      
    default:
      console.log('Unknown message type:', message.type, message);
      return null;
  }
};

// Export memoized version for performance
export const MessageRenderer = memo(MessageRendererBase, (prevProps, nextProps) => {
  // Custom comparison - only re-render if message content or streaming state changes
  return (
    prevProps.message.id === nextProps.message.id &&
    prevProps.message.streaming === nextProps.message.streaming &&
    JSON.stringify(prevProps.message.message?.content) === JSON.stringify(nextProps.message.message?.content)
  );
});