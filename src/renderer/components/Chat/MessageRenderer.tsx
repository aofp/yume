import React, { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import { 
  IconBolt, 
  IconFolder, 
  IconAlertTriangle, 
  IconCheck, 
  IconX, 
  IconLock,
  IconCircleCheck,
  IconCircleDot,
  IconCircle,
  IconChecklist,
  IconLoader2
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
const TOOL_DISPLAYS: Record<string, (input: any) => { icon: string; action: string; detail: string; todos?: any[] }> = {
  'Read': (i) => ({ 
    icon: '', 
    action: 'reading', 
    detail: formatPath(i?.file_path) 
  }),
  'Write': (i) => ({ 
    icon: '', 
    action: 'writing', 
    detail: formatPath(i?.file_path) 
  }),
  'Edit': (i) => ({ 
    icon: '', 
    action: 'editing', 
    detail: formatPath(i?.file_path) + (i?.old_string ? ' • ' + getChangePreview(i.old_string, i.new_string) : '')
  }),
  'MultiEdit': (i) => ({ 
    icon: '', 
    action: 'multi-editing', 
    detail: `${formatPath(i?.file_path)} • ${i?.edits?.length || 0} changes`
  }),
  'Bash': (i) => ({ 
    icon: '', 
    action: 'running', 
    detail: formatCommand(i?.command)
  }),
  'TodoWrite': (i) => ({ 
    icon: '', 
    action: 'updating todos', 
    detail: formatTodos(i?.todos),
    todos: i?.todos
  }),
  'WebSearch': (i) => ({ 
    icon: '', 
    action: 'searching web', 
    detail: `"${i?.query || ''}"`
  }),
  'WebFetch': (i) => ({ 
    icon: '', 
    action: 'fetching', 
    detail: formatUrl(i?.url)
  }),
  'Grep': (i) => ({ 
    icon: '', 
    action: 'searching', 
    detail: `"${i?.pattern || ''}" in ${formatPath(i?.path || '.')}`
  }),
  'Glob': (i) => ({ 
    icon: '', 
    action: 'finding', 
    detail: i?.pattern || 'files'
  }),
  'LS': (i) => ({ 
    icon: '', 
    action: 'listing', 
    detail: formatPath(i?.path)
  }),
  'Task': (i) => ({ 
    icon: '', 
    action: i?.description || 'running task', 
    detail: i?.subagent_type || 'agent'
  }),
  'ExitPlanMode': (i) => ({ 
    icon: '', 
    action: 'plan complete', 
    detail: 'ready to execute'
  }),
  'NotebookEdit': (i) => ({ 
    icon: '', 
    action: 'editing notebook', 
    detail: formatPath(i?.notebook_path)
  })
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
    
    // Make path relative to working directory
    if (unixPath.startsWith(unixWorkingDir)) {
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
  }
  
  // If still too long, show last parts
  const parts = unixPath.split('/');
  if (parts.length > 3) {
    return '.../' + parts.slice(-2).join('/');
  }
  
  return unixPath;
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

// Render content blocks
const renderContent = (content: string | ContentBlock[] | undefined, message?: any) => {
  if (!content) return null;
  
  if (typeof content === 'string') {
    return <ReactMarkdown className="markdown-content">{content}</ReactMarkdown>;
  }
  
  if (Array.isArray(content)) {
    // During streaming, only show the last tool
    let toolsToRender = content;
    if (message?.streaming) {
      const toolUses = content.filter(b => b?.type === 'tool_use');
      if (toolUses.length > 0) {
        // Only keep text blocks and the last tool use
        const lastTool = toolUses[toolUses.length - 1];
        toolsToRender = content.filter(b => 
          b?.type === 'text' || b === lastTool
        );
      }
    }
    
    return toolsToRender.map((block, idx) => {
      if (!block || typeof block !== 'object') return null;
      
      switch (block.type) {
        case 'text':
          return (
            <div key={idx} className="content-text">
              <ReactMarkdown>{block.text || ''}</ReactMarkdown>
            </div>
          );
          
        case 'tool_use':
          const tool = TOOL_DISPLAYS[block.name || ''];
          const display = tool ? tool(block.input) : {
            icon: '',
            action: block.name?.toLowerCase() || 'tool',
            detail: '',
            todos: null
          };
          
          // Special rendering for TodoWrite
          if (block.name === 'TodoWrite' && display.todos) {
            return (
              <div key={idx} className="tool-use todo-write">
                <div className="todo-header">
                  <IconChecklist size={14} stroke={1.5} className="todo-header-icon" />
                  <span className="tool-action">{display.action}</span>
                  <span className="tool-detail">{display.detail}</span>
                </div>
                <div className="todo-list">
                  {display.todos.map((todo: any, todoIdx: number) => (
                    <div key={todoIdx} className={`todo-item ${todo.status}`}>
                      {todo.status === 'completed' ? (
                        <IconCircleCheck size={14} stroke={1.5} className="todo-icon completed" />
                      ) : todo.status === 'in_progress' ? (
                        <IconCircleDot size={14} stroke={1.5} className="todo-icon progress" />
                      ) : (
                        <IconCircle size={14} stroke={1.5} className="todo-icon pending" />
                      )}
                      <span className="todo-content">{todo.content}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          }
          
          // Only show spinner on the last tool_use block if streaming
          const toolUseBlocks = content.filter(b => b?.type === 'tool_use');
          const isLastTool = toolUseBlocks[toolUseBlocks.length - 1] === block;
          
          return (
            <div key={idx} className="tool-use">
              {display.icon && <span className="tool-icon">{display.icon}</span>}
              <span className="tool-action">{display.action}</span>
              {display.detail && <span className="tool-detail">{display.detail}</span>}
              {message?.streaming === true && message?.type === 'assistant' && isLastTool && (
                <IconLoader2 size={12} className="streaming-loader" />
              )}
            </div>
          );
          
        case 'tool_result':
          // Skip tool results during streaming - they clutter the UI
          if (message?.streaming) {
            return null;
          }
          
          // Handle tool results
          const resultContent = typeof block.content === 'string' 
            ? block.content 
            : typeof block.content === 'object' && block.content !== null
              ? JSON.stringify(block.content, null, 2)
              : '';
          
          // Check if this is a file operation result (Edit, MultiEdit, Write)
          const prevBlock = content[idx - 1];
          const isFileOperation = prevBlock?.type === 'tool_use' && 
            (prevBlock.name === 'Edit' || prevBlock.name === 'MultiEdit' || prevBlock.name === 'Write');
          
          // Always show full content for file operations (diffs)
          if (isFileOperation && resultContent) {
            return (
              <div key={idx} className="tool-result file-diff">
                <pre className="diff-content">{resultContent}</pre>
              </div>
            );
          }
          
          // Filter out verbose outputs for non-file operations
          if (resultContent.length > 1000) {
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
          if (resultContent && resultContent.trim()) {
            return (
              <div key={idx} className="tool-result minimal">
                <span className="result-text">{resultContent.substring(0, 100)}{resultContent.length > 100 ? '...' : ''}</span>
              </div>
            );
          }
          
          return null;
          
        default:
          return null;
      }
    });
  }
  
  return null;
};

// Main message renderer component - memoized for performance
const MessageRendererBase: React.FC<{ message: ClaudeMessage; index: number }> = ({ message, index }) => {
  switch (message.type) {
    case 'system':
      // Hide all system messages including session started
      return null;
      
    case 'user':
      const userContent = message.message?.content || '';
      let displayText = '';
      
      if (typeof userContent === 'string') {
        displayText = userContent;
      } else if (Array.isArray(userContent) && userContent[0]?.text) {
        const text = userContent[0].text;
        // Check for pasted content patterns
        if (text.startsWith('[Attached text]:')) {
          displayText = '[pasted text]';
        } else if (text.startsWith('[Attached image')) {
          displayText = '[pasted image]';
        } else {
          displayText = text;
        }
      }
      
      return (
        <div className="message user">
          <div className="message-bubble">
            {displayText}
          </div>
        </div>
      );
      
    case 'assistant':
      return (
        <div className="message assistant">
          <div className="message-content">
            {renderContent(message.message?.content, message)}
          </div>
        </div>
      );
      
    case 'result':
      if (message.subtype === 'success') {
        return (
          <div className="message result-success">
            <span className="result-stats">
              {message.num_turns} turn{message.num_turns !== 1 ? 's' : ''} • 
              {message.duration_ms}ms • 
              ${message.total_cost_usd?.toFixed(4) || '0.0000'}
              {message.usage && ` • ${message.usage.input_tokens + message.usage.output_tokens} tokens`}
            </span>
            {message.result && (
              <div className="result-summary">{message.result}</div>
            )}
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
      if (message.subtype === 'permission_request') {
        return (
          <div className="message permission-request">
            <IconLock size={14} stroke={1.5} className="permission-icon" />
            <span className="permission-text">permission requested for {message.tool}</span>
          </div>
        );
      }
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