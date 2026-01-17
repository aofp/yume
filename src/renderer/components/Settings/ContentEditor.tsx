/**
 * ContentEditor - Markdown editor with preview for skill content
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  IconEdit,
  IconEye,
  IconCopy,
  IconCheck,
  IconCode,
} from '@tabler/icons-react';
import './ContentEditor.css';

interface ContentEditorProps {
  content: string;
  onChange: (content: string) => void;
  disabled?: boolean;
  placeholder?: string;
  minHeight?: number;
}

// Simple markdown to HTML converter (basic subset)
function markdownToHtml(markdown: string): string {
  let html = markdown
    // Escape HTML
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Headers
    .replace(/^### (.*$)/gm, '<h4>$1</h4>')
    .replace(/^## (.*$)/gm, '<h3>$1</h3>')
    .replace(/^# (.*$)/gm, '<h2>$1</h2>')
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.*?)__/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/_(.*?)_/g, '<em>$1</em>')
    // Code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Lists
    .replace(/^\s*[-*]\s+(.*)$/gm, '<li>$1</li>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    // Line breaks
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>');

  // Wrap in paragraph
  html = '<p>' + html + '</p>';

  // Wrap consecutive <li> in <ul>
  html = html.replace(/(<li>.*?<\/li>)+/g, '<ul>$&</ul>');

  return html;
}

// Count tokens (rough approximation: 1 token ≈ 4 chars)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export const ContentEditor: React.FC<ContentEditorProps> = ({
  content,
  onChange,
  disabled = false,
  placeholder = 'enter skill content (markdown supported)...',
  minHeight = 200,
}) => {
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const tokens = estimateTokens(content);
  const lines = content.split('\n').length;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy:', e);
    }
  }, [content]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  }, [onChange]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current && mode === 'edit') {
      const textarea = textareaRef.current;
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.max(minHeight, textarea.scrollHeight)}px`;
    }
  }, [content, mode, minHeight]);

  return (
    <div className={`content-editor ${disabled ? 'disabled' : ''}`}>
      <div className="content-editor-header">
        <div className="content-editor-tabs">
          <button
            className={`content-tab ${mode === 'edit' ? 'active' : ''}`}
            onClick={() => setMode('edit')}
            disabled={disabled}
          >
            <IconEdit size={12} />
            edit
          </button>
          <button
            className={`content-tab ${mode === 'preview' ? 'active' : ''}`}
            onClick={() => setMode('preview')}
          >
            <IconEye size={12} />
            preview
          </button>
        </div>
        <div className="content-editor-actions">
          <button
            className="content-action-btn"
            onClick={handleCopy}
            title="copy content"
            disabled={!content}
          >
            {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
          </button>
        </div>
      </div>

      <div className="content-editor-body" style={{ minHeight }}>
        {mode === 'edit' ? (
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleChange}
            placeholder={placeholder}
            disabled={disabled}
            className="content-textarea"
            style={{ minHeight }}
          />
        ) : (
          <div
            className="content-preview"
            dangerouslySetInnerHTML={{ __html: markdownToHtml(content) || '<em>no content</em>' }}
          />
        )}
      </div>

      <div className="content-editor-footer">
        <div className="content-stats">
          <span className="content-stat">
            <IconCode size={10} />
            {tokens} tokens (est.)
          </span>
          <span className="content-stat">
            {lines} lines
          </span>
          <span className="content-stat">
            {content.length} chars
          </span>
        </div>
        {tokens > 500 && (
          <span className="content-warning">
            large content may impact performance
          </span>
        )}
      </div>
    </div>
  );
};

export default ContentEditor;
