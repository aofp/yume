import React from 'react';
import { User, Bot, Copy, Check } from 'lucide-react';
import { Message } from '../../stores/useStore';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import './MessageItem.css';

interface MessageItemProps {
  message: Message;
}

export const MessageItem: React.FC<MessageItemProps> = ({ message }) => {
  const [copiedCode, setCopiedCode] = React.useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className={`message-item ${message.role}`}>
      <div className="message-avatar">
        {message.role === 'user' ? (
          <User size={20} />
        ) : (
          <Bot size={20} />
        )}
      </div>

      <div className="message-content">
        <div className="message-header">
          <span className="message-role">
            {message.role === 'user' ? 'You' : 'Claude'}
          </span>
          <span className="message-time">
            {new Date(message.timestamp).toLocaleTimeString([], { 
              hour: '2-digit', 
              minute: '2-digit' 
            })}
          </span>
        </div>

        <div className="message-body">
          {message.streaming ? (
            <div className="message-streaming">
              {message.content || 'Thinking...'}
              <span className="streaming-indicator">●</span>
            </div>
          ) : (
            <ReactMarkdown
              components={{
                code({ node, inline, className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || '');
                  const codeId = `code-${message.id}-${Math.random()}`;
                  
                  return !inline && match ? (
                    <div className="code-block">
                      <div className="code-block-header">
                        <span className="code-language">{match[1]}</span>
                        <button
                          className="code-copy"
                          onClick={() => copyToClipboard(String(children), codeId)}
                        >
                          {copiedCode === codeId ? (
                            <>
                              <Check size={14} />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy size={14} />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                      <SyntaxHighlighter
                        style={vscDarkPlus}
                        language={match[1]}
                        PreTag="div"
                        {...props}
                      >
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    </div>
                  ) : (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  );
                }
              }}
            >
              {message.content}
            </ReactMarkdown>
          )}
        </div>

        {message.tools && message.tools.length > 0 && (
          <div className="message-tools">
            {message.tools.map((tool, index) => (
              <div key={index} className="tool-call">
                <div className="tool-header">
                  <span className="tool-name">{tool.tool}</span>
                  <span className={`tool-status ${tool.status}`}>
                    {tool.status}
                  </span>
                </div>
                {tool.result && (
                  <div className="tool-result">
                    <pre>{JSON.stringify(tool.result, null, 2)}</pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};