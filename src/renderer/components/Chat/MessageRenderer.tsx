import React, { memo, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
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
  IconLoader2,
  IconCopy,
  IconArrowBackUp
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

// Helper function to detect and format MCP tools
const getMCPToolDisplay = (toolName: string, input: any) => {
  // MCP tools follow pattern: mcp__<server>__<tool>
  if (toolName.startsWith('mcp__')) {
    const parts = toolName.split('__');
    const server = parts[1] || 'server';
    const tool = parts[2] || 'tool';
    
    return {
      icon: '',
      action: `mcp: ${tool.replace(/_/g, ' ')}`,
      detail: `${server} • ${JSON.stringify(input).substring(0, 50)}...`
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
        style={vscDarkPlus}
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

const renderContent = (content: string | ContentBlock[] | undefined, message?: any) => {
  if (!content) return null;
  
  if (typeof content === 'string') {
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
          if (block.name === 'TodoWrite' && block.input?.todos) {
            const todos = block.input.todos || [];
            return (
              <div key={idx} className="tool-use todo-write">
                <div className="todo-header">
                  <IconChecklist size={14} stroke={1.5} className="todo-header-icon" />
                  <span className="tool-action">{display.action}</span>
                  <span className="tool-detail">{display.detail}</span>
                </div>
                <div className="todo-list">
                  {todos.map((todo: any, todoIdx: number) => (
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
          
          // Check if this is a Read operation
          const isReadOperation = prevBlock?.type === 'tool_use' && prevBlock.name === 'Read';
          
          // Check if this is a search operation (Grep, Glob, LS, WebSearch)
          const isSearchOperation = prevBlock?.type === 'tool_use' && 
            (prevBlock.name === 'Grep' || prevBlock.name === 'Glob' || prevBlock.name === 'LS' || prevBlock.name === 'WebSearch');
          
          // Check if this is a TodoWrite operation
          const isTodoWriteOperation = prevBlock?.type === 'tool_use' && prevBlock.name === 'TodoWrite';
          
          // Hide system reminder messages
          if (resultContent.includes('<system-reminder>') && resultContent.includes('</system-reminder>')) {
            return null;
          }
          
          // Hide TodoWrite success messages and system reminders about todos
          if (isTodoWriteOperation && (
            resultContent.includes('Todos have been modified successfully') ||
            resultContent.includes('Ensure that you continue to use the todo list')
          )) {
            return null;
          }
          
          // Limit Read operation output to 10 lines with expandable option
          if (isReadOperation && resultContent) {
            // Strip out system-reminder tags from read operations
            let cleanContent = resultContent;
            const reminderRegex = /<system-reminder>[\s\S]*?<\/system-reminder>/g;
            cleanContent = cleanContent.replace(reminderRegex, '').trim();
            
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
            const allLines = resultContent.split('\n');
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
const MessageRendererBase: React.FC<{ message: ClaudeMessage; index: number; isLast?: boolean }> = ({ message, index, isLast = false }) => {
  // Get the current session to access previous messages for context
  const store = useClaudeCodeStore.getState();
  const currentSession = store.sessions.find(s => s.id === store.currentSessionId);
  const sessionMessages = currentSession?.messages || [];
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
    
    // Update the session with truncated messages
    useClaudeCodeStore.setState(state => ({
      sessions: state.sessions.map(s => 
        s.id === currentSessionId 
          ? { ...s, messages, updatedAt: new Date() }
          : s
      )
    }));
  };
  
  const getMessageText = (content: any): string => {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .filter(block => block.type === 'text' && block.text)
        .map(block => block.text)
        .join('\n');
    }
    return '';
  };
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
            {displayText}
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
      
      return (
        <div className="message assistant">
          <div className="message-content">
            <div className="message-bubble">
              {message.streaming ? (
                <>
                  {isEmpty ? (
                    <div className="thinking-indicator">
                      <span className="thinking-text">thinking...</span>
                      <IconLoader2 size={14} className="streaming-loader" />
                    </div>
                  ) : (
                    <>
                      {renderContent(message.message?.content, message)}
                      <div className="thinking-indicator inline">
                        <span className="thinking-text">thinking...</span>
                        <IconLoader2 size={14} className="streaming-loader" />
                      </div>
                    </>
                  )}
                </>
              ) : (
                renderContent(message.message?.content, message)
              )}
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
      );
      
    case 'tool_use':
      // Standalone tool use message
      const toolName = message.message?.name || 'unknown tool';
      const toolInput = message.message?.input || {};
      const tool = TOOL_DISPLAYS[toolName];
      const display = tool ? tool(toolInput) : {
        icon: <IconTool size={14} stroke={1.5} />,
        action: toolName.toLowerCase(),
        detail: JSON.stringify(toolInput).substring(0, 100)
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
            <div className="tool-use-edit">
              <div className="edit-header">
                <span className="edit-action">editing</span>
                <span className="edit-file">{filePath}</span>
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
      let contentStr = typeof resultContent === 'string' 
        ? resultContent 
        : JSON.stringify(resultContent, null, 2);
      
      // Strip out system-reminder tags from all tool results
      const reminderRegex = /<system-reminder>[\s\S]*?<\/system-reminder>/g;
      contentStr = contentStr.replace(reminderRegex, '').trim();
      
      // Check if this is an Edit result - they contain "has been updated" and show line numbers
      const isEditResult = contentStr.includes('has been updated') && contentStr.includes('→');
      
      if (isEditResult) {
        // Parse the Edit result to extract the diff
        const lines = contentStr.split('\n');
        const filePathMatch = contentStr.match(/The file (.+?) has been updated/);
        let filePath = filePathMatch ? filePathMatch[1] : 'file';
        
        // Convert Windows path to relative Unix path
        // Remove C:\Users\muuko\Desktop\testproject\ or similar
        filePath = filePath.replace(/^[A-Z]:\\.*\\(testproject|yurucode)\\/, '')
                          .replace(/\\/g, '/');  // Convert backslashes to forward slashes
        
        // Find the actual diff part (after "Here's the result of running")
        const diffStartIdx = lines.findIndex(line => line.includes("Here's the result of running"));
        const diffLines = diffStartIdx >= 0 ? lines.slice(diffStartIdx + 1) : [];
        
        return (
          <div className="message tool-result-message">
            <div className="tool-result standalone file-edit">
              <div className="diff-file-path">{filePath}</div>
              <div className="diff-content">
                {diffLines.map((line, idx) => {
                  // Parse line numbers and content
                  const lineMatch = line.match(/^\s*(\d+)→(.*)$/);
                  if (lineMatch) {
                    const [, lineNum, content] = lineMatch;
                    // Check if content starts with + or - for coloring
                    const isAdded = content.trim().startsWith('+');
                    const isRemoved = content.trim().startsWith('-');
                    const className = isAdded ? 'added' : isRemoved ? 'removed' : '';
                    return (
                      <div key={idx} className={`diff-line ${className}`}>
                        <span className="line-number">{lineNum}</span>
                        <span className="line-content">{content}</span>
                      </div>
                    );
                  }
                  return <div key={idx} className="diff-line">{line}</div>;
                })}
              </div>
            </div>
          </div>
        );
      }
      
      // Check if this is a Read operation result by looking at the previous message
      const prevMessage = index > 0 ? sessionMessages[index - 1] : null;
      const isReadResult = prevMessage?.type === 'tool_use' && 
        prevMessage?.message?.name === 'Read';
      
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
        contentStr.includes('Ensure that you continue to use the todo list')
      )) {
        return null;
      }
      
      // Apply truncation for Read operations
      if (isReadResult && contentStr) {
        const allLines = contentStr.split('\n');
        const visibleLines = allLines.slice(0, 10);
        const hiddenCount = allLines.length - 10;
        const hasMore = hiddenCount > 0;
        
        return (
          <div className="message tool-result-message">
            <div className="tool-result standalone read-output">
              <pre className="result-content">{visibleLines.join('\n')}</pre>
              {hasMore && (
                <div className="read-more">+ {hiddenCount} more lines</div>
              )}
            </div>
          </div>
        );
      }
      
      // Apply truncation for search operations
      if (isSearchResult && contentStr) {
        const allLines = contentStr.split('\n');
        const visibleLines = allLines.slice(0, 10);
        const hiddenCount = allLines.length - 10;
        const hasMore = hiddenCount > 0;
        
        return (
          <div className="message tool-result-message">
            <div className="tool-result standalone search-output">
              <pre className="result-content">{visibleLines.join('\n')}</pre>
              {hasMore && (
                <div className="search-more">+ {hiddenCount} more lines</div>
              )}
            </div>
          </div>
        );
      }
      
      // For other tool results, show as before
      return (
        <div className="message tool-result-message">
          <div className="tool-result standalone">
            <pre className="result-content">{contentStr}</pre>
          </div>
        </div>
      );
      
    case 'result':
      if (message.subtype === 'success') {
        // Show elapsed time for successful completion
        const elapsedMs = message.duration_ms || message.message?.duration_ms || message.duration || 0;
        const elapsedSeconds = (elapsedMs / 1000).toFixed(1);
        
        return (
          <div className="message result-success">
            <div className="elapsed-time">
              {elapsedSeconds}s
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