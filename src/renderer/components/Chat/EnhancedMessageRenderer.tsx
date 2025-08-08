import React, { memo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { 
  IconChevronDown,
  IconChevronRight,
  IconLoader2,
  IconCheck,
  IconX,
  IconAlertTriangle,
  IconClock,
  IconFile,
  IconFolder,
  IconTerminal,
  IconSearch,
  IconWorld,
  IconEdit,
  IconPlus,
  IconMinus,
  IconRefresh,
  IconRobot,
  IconChecklist,
  IconCircleCheck,
  IconCircleDot,
  IconCircle
} from '@tabler/icons-react';
import { useClaudeCodeStore } from '../../stores/claudeCodeStore';
import './EnhancedMessageRenderer.css';

// Complete Claude Code SDK message types
export interface ClaudeMessage {
  type: 'system' | 'user' | 'assistant' | 'result' | 'error' | 'permission' | 'tool_approval';
  subtype?: string;
  message?: {
    role?: string;
    content?: string | ContentBlock[];
  };
  session_id?: string;
  timestamp?: number;
  id?: string;
  streaming?: boolean;
  
  // Result fields
  duration_ms?: number;
  total_cost_usd?: number;
  usage?: any;
  num_turns?: number;
  result?: string;
  is_error?: boolean;
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

// Track tool execution times
const toolStartTimes = new Map<string, number>();

// Enhanced tool display with all details
const renderToolUse = (block: ContentBlock, isStreaming: boolean, isLastTool: boolean) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const startTime = toolStartTimes.get(block.tool_use_id || '') || Date.now();
  
  if (!toolStartTimes.has(block.tool_use_id || '')) {
    toolStartTimes.set(block.tool_use_id || '', Date.now());
  }
  
  const getToolIcon = (name: string) => {
    switch(name) {
      case 'Read': return <IconFile size={14} />;
      case 'Write': return <IconEdit size={14} />;
      case 'Edit': 
      case 'MultiEdit': return <IconEdit size={14} />;
      case 'Bash': return <IconTerminal size={14} />;
      case 'Grep':
      case 'WebSearch': return <IconSearch size={14} />;
      case 'WebFetch': return <IconWorld size={14} />;
      case 'Glob':
      case 'LS': return <IconFolder size={14} />;
      case 'Task': return <IconRobot size={14} />;
      case 'TodoWrite': return <IconChecklist size={14} />;
      default: return <IconRefresh size={14} />;
    }
  };
  
  const formatPath = (path?: string) => {
    if (!path) return '';
    const parts = path.split('/');
    if (parts.length > 3) {
      return '.../' + parts.slice(-2).join('/');
    }
    return path;
  };
  
  const getToolDetails = (name: string, input: any) => {
    switch(name) {
      case 'Read':
        return {
          primary: formatPath(input?.file_path),
          secondary: input?.limit ? `Lines ${input.offset || 1}-${(input.offset || 1) + input.limit}` : 'Reading entire file',
          expandable: false
        };
        
      case 'Write':
        const lines = input?.content?.split('\n').length || 0;
        return {
          primary: formatPath(input?.file_path),
          secondary: `Writing ${lines} lines (${input?.content?.length || 0} bytes)`,
          expandable: true,
          expanded: input?.content?.substring(0, 500)
        };
        
      case 'Edit':
        return {
          primary: formatPath(input?.file_path),
          secondary: input?.replace_all ? 'Replace all occurrences' : 'Replace first occurrence',
          expandable: true,
          expanded: (
            <div className="diff-preview">
              <div className="diff-remove">- {input?.old_string?.substring(0, 200)}</div>
              <div className="diff-add">+ {input?.new_string?.substring(0, 200)}</div>
            </div>
          )
        };
        
      case 'MultiEdit':
        return {
          primary: formatPath(input?.file_path),
          secondary: `${input?.edits?.length || 0} edits`,
          expandable: true,
          expanded: (
            <div className="edits-list">
              {input?.edits?.slice(0, 5).map((edit: any, idx: number) => (
                <div key={idx} className="edit-item">
                  <div className="diff-remove">- {edit.old_string?.substring(0, 100)}</div>
                  <div className="diff-add">+ {edit.new_string?.substring(0, 100)}</div>
                </div>
              ))}
              {input?.edits?.length > 5 && <div className="more-edits">...and {input.edits.length - 5} more</div>}
            </div>
          )
        };
        
      case 'Bash':
        return {
          primary: input?.command?.substring(0, 100),
          secondary: input?.timeout ? `Timeout: ${input.timeout}ms` : 'Timeout: 120s',
          expandable: input?.command?.length > 100,
          expanded: input?.command
        };
        
      case 'Grep':
        return {
          primary: `Searching for "${input?.pattern}"`,
          secondary: `in ${formatPath(input?.path || '.')} • ${input?.output_mode || 'files'} mode`,
          expandable: false
        };
        
      case 'WebSearch':
        return {
          primary: `"${input?.query}"`,
          secondary: input?.allowed_domains ? `Limited to: ${input.allowed_domains.join(', ')}` : 'All domains',
          expandable: false
        };
        
      case 'TodoWrite':
        const todos = input?.todos || [];
        const counts = {
          pending: todos.filter((t: any) => t.status === 'pending').length,
          in_progress: todos.filter((t: any) => t.status === 'in_progress').length,
          completed: todos.filter((t: any) => t.status === 'completed').length
        };
        return {
          primary: `${todos.length} todos`,
          secondary: `${counts.completed} done • ${counts.in_progress} active • ${counts.pending} pending`,
          expandable: true,
          expanded: (
            <div className="todos-list">
              {todos.map((todo: any, idx: number) => (
                <div key={idx} className={`todo-item ${todo.status}`}>
                  {todo.status === 'completed' ? <IconCircleCheck size={12} /> :
                   todo.status === 'in_progress' ? <IconCircleDot size={12} /> :
                   <IconCircle size={12} />}
                  <span>{todo.content}</span>
                </div>
              ))}
            </div>
          )
        };
        
      default:
        return {
          primary: name,
          secondary: JSON.stringify(input).substring(0, 100),
          expandable: false
        };
    }
  };
  
  const details = getToolDetails(block.name || '', block.input);
  const isRunning = isStreaming && isLastTool;
  const elapsed = isRunning ? Date.now() - startTime : 0;
  
  return (
    <div className={`tool-use-enhanced ${isRunning ? 'running' : 'completed'}`}>
      <div className="tool-header" onClick={() => details.expandable && setIsExpanded(!isExpanded)}>
        <div className="tool-left">
          {details.expandable && (
            isExpanded ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />
          )}
          {getToolIcon(block.name || '')}
          <span className="tool-name">{block.name}</span>
        </div>
        
        <div className="tool-center">
          <span className="tool-primary">{details.primary}</span>
          <span className="tool-secondary">{details.secondary}</span>
        </div>
        
        <div className="tool-right">
          {isRunning ? (
            <>
              <IconLoader2 size={12} className="spinning" />
              <span className="tool-status running">running {Math.floor(elapsed / 1000)}s</span>
            </>
          ) : (
            <span className="tool-status completed">completed</span>
          )}
        </div>
      </div>
      
      {isExpanded && details.expanded && (
        <div className="tool-expanded">
          {typeof details.expanded === 'string' ? (
            <pre>{details.expanded}</pre>
          ) : (
            details.expanded
          )}
        </div>
      )}
    </div>
  );
};

// Render tool result with proper formatting
const renderToolResult = (block: ContentBlock, prevBlock?: ContentBlock) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Parse the result content
  let content = '';
  if (typeof block.content === 'string') {
    content = block.content;
  } else if (block.content) {
    content = JSON.stringify(block.content, null, 2);
  }
  
  // Determine if this is a significant result
  const isFileOperation = prevBlock?.name === 'Edit' || prevBlock?.name === 'MultiEdit' || prevBlock?.name === 'Write';
  const isSearchResult = prevBlock?.name === 'Grep' || prevBlock?.name === 'Glob' || prevBlock?.name === 'LS';
  const isBashResult = prevBlock?.name === 'Bash';
  
  // Show full diffs for file operations
  if (isFileOperation && content.includes('@@')) {
    return (
      <div className="tool-result file-operation">
        <div className="result-header" onClick={() => setIsExpanded(!isExpanded)}>
          <IconCheck size={12} className="success-icon" />
          <span>File modified successfully</span>
          {isExpanded ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
        </div>
        {isExpanded && (
          <pre className="diff-output">{content}</pre>
        )}
      </div>
    );
  }
  
  // Show search results with counts
  if (isSearchResult) {
    const lines = content.split('\n').filter(l => l.trim());
    const count = lines.length;
    
    if (count > 0) {
      return (
        <div className="tool-result search-result">
          <div className="result-header" onClick={() => setIsExpanded(!isExpanded)}>
            <span className="result-count">{count} {count === 1 ? 'match' : 'matches'} found</span>
            {content.length > 200 && (
              isExpanded ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />
            )}
          </div>
          {(isExpanded || content.length <= 200) && (
            <pre className="search-output">{content.substring(0, 1000)}</pre>
          )}
        </div>
      );
    }
    
    return (
      <div className="tool-result no-matches">
        <span>No matches found</span>
      </div>
    );
  }
  
  // Show command output
  if (isBashResult) {
    if (block.is_error) {
      return (
        <div className="tool-result bash-error">
          <div className="result-header">
            <IconX size={12} className="error-icon" />
            <span>Command failed</span>
          </div>
          <pre className="error-output">{content.substring(0, 500)}</pre>
        </div>
      );
    }
    
    if (content.trim()) {
      return (
        <div className="tool-result bash-output">
          <pre className="command-output">{content.substring(0, 1000)}</pre>
        </div>
      );
    }
    
    return (
      <div className="tool-result bash-success">
        <IconCheck size={12} />
        <span>Command completed</span>
      </div>
    );
  }
  
  // Default minimal display for other results
  if (content.length > 100) {
    return null; // Hide verbose outputs
  }
  
  if (content.trim()) {
    return (
      <div className="tool-result minimal">
        <span>{content.substring(0, 100)}</span>
      </div>
    );
  }
  
  return null;
};

// Main content renderer
const renderContent = (content: string | ContentBlock[] | undefined, message?: any) => {
  if (!content) return null;
  
  if (typeof content === 'string') {
    return <ReactMarkdown className="markdown-content">{content}</ReactMarkdown>;
  }
  
  if (Array.isArray(content)) {
    // Track which tool is currently running
    const toolUses = content.filter(b => b?.type === 'tool_use');
    const toolResults = content.filter(b => b?.type === 'tool_result');
    const lastToolIndex = toolUses.length - 1;
    
    return content.map((block, idx) => {
      if (!block || typeof block !== 'object') return null;
      
      switch (block.type) {
        case 'text':
          return (
            <div key={idx} className="content-text">
              <ReactMarkdown>{block.text || ''}</ReactMarkdown>
            </div>
          );
          
        case 'tool_use':
          const toolIndex = toolUses.indexOf(block);
          const isLastTool = toolIndex === lastToolIndex;
          const hasResult = toolResults.some(r => r.tool_use_id === block.tool_use_id);
          const isRunning = message?.streaming && isLastTool && !hasResult;
          
          return (
            <div key={idx}>
              {renderToolUse(block, isRunning, isLastTool)}
            </div>
          );
          
        case 'tool_result':
          const prevBlock = content[idx - 1];
          return (
            <div key={idx}>
              {renderToolResult(block, prevBlock)}
            </div>
          );
          
        default:
          return null;
      }
    });
  }
  
  return null;
};

// Main message renderer
const EnhancedMessageRendererBase: React.FC<{ message: ClaudeMessage; index: number }> = ({ message, index }) => {
  switch (message.type) {
    case 'system':
      return null; // Hide system messages
      
    case 'user':
      const userContent = message.message?.content || '';
      let displayText = '';
      
      if (typeof userContent === 'string') {
        displayText = userContent;
      } else if (Array.isArray(userContent) && userContent[0]?.text) {
        displayText = userContent[0].text;
      }
      
      // Truncate pasted content
      if (displayText.startsWith('[Attached')) {
        displayText = '[attachment]';
      }
      
      return (
        <div className="message user">
          <div className="message-bubble">{displayText}</div>
        </div>
      );
      
    case 'assistant':
      const assistantContent = message.message?.content;
      const isEmpty = !assistantContent || 
        (typeof assistantContent === 'string' && !assistantContent.trim()) ||
        (Array.isArray(assistantContent) && assistantContent.length === 0);
      
      return (
        <div className="message assistant">
          <div className="message-content">
            {isEmpty && message.streaming ? (
              <div className="thinking-indicator">
                <IconLoader2 size={14} className="spinning" />
                <span>thinking...</span>
              </div>
            ) : (
              renderContent(assistantContent, message)
            )}
          </div>
        </div>
      );
      
    case 'result':
      if (message.subtype === 'success') {
        return (
          <div className="message result-success">
            <div className="result-stats">
              <IconClock size={12} />
              <span>{message.num_turns} turns • {message.duration_ms}ms • ${message.total_cost_usd?.toFixed(4)}</span>
            </div>
          </div>
        );
      } else if (message.is_error) {
        return (
          <div className="message result-error">
            <IconAlertTriangle size={14} />
            <span>Error: {message.result || 'Execution failed'}</span>
          </div>
        );
      }
      return null;
      
    default:
      return null;
  }
};

export const EnhancedMessageRenderer = memo(EnhancedMessageRendererBase);