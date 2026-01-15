import React, { memo } from 'react';
import {
  IconPlayerStop,
  IconViewportShort,
  IconFileShredder,
  IconX,
} from '@tabler/icons-react';
import { Watermark } from '../Watermark/Watermark';
import { formatBytes } from '../../utils/chatHelpers';

interface Attachment {
  id: string;
  type: 'image' | 'text' | 'file';
  name: string;
  size?: number;
  content: string;
  preview?: string;
}

interface InputAreaProps {
  input: string;
  setInput: (value: string) => void;
  attachments: Attachment[];
  removeAttachment: (id: string) => void;
  isDragging: boolean;
  isReadOnly: boolean;
  isStreaming: boolean;
  isContextFull: boolean;
  isDictating: boolean;
  isCommandMode: boolean;
  contextPercentage: number;
  bashCommandMode: boolean;
  workingDirectory: string | undefined;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  inputOverlayRef: React.RefObject<HTMLDivElement | null>;
  inputContainerRef: React.RefObject<HTMLDivElement | null>;
  isTextareaFocused: boolean;
  setIsTextareaFocused: (focused: boolean) => void;
  setMentionTrigger: (trigger: string | null) => void;
  setCommandTrigger: (trigger: string | null) => void;
  onTextareaChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onPaste: (e: React.ClipboardEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onInterrupt: () => void;
  onCompactRequest: () => void;
  onClearRequest: () => void;
  children?: React.ReactNode;
}

export const InputArea = memo(function InputArea({
  input,
  setInput,
  attachments,
  removeAttachment,
  isDragging,
  isReadOnly,
  isStreaming,
  isContextFull,
  isDictating,
  isCommandMode,
  contextPercentage,
  bashCommandMode,
  workingDirectory,
  inputRef,
  inputOverlayRef,
  inputContainerRef,
  isTextareaFocused,
  setIsTextareaFocused,
  setMentionTrigger,
  setCommandTrigger,
  onTextareaChange,
  onKeyDown,
  onPaste,
  onDragOver,
  onDragLeave,
  onDrop,
  onInterrupt,
  onCompactRequest,
  onClearRequest,
  children,
}: InputAreaProps) {
  // Check if input contains ultrathink (case insensitive)
  const hasUltrathink = /ultrathink/i.test(input);

  // Render text with ultrathink highlighted
  const renderStyledText = (text: string) => {
    if (!hasUltrathink) return text;
    const parts = text.split(/(ultrathink)/gi);
    return parts.map((part, i) =>
      /ultrathink/i.test(part)
        ? <span key={i} className="ultrathink-wrapper"><span className="ultrathink-text">{part}</span></span>
        : part
    );
  };

  const projectName = workingDirectory?.split(/[/\\]/).pop() || 'project';

  const getPlaceholder = () => {
    if (isContextFull) return "context full - compact or clear required";
    if (isReadOnly) return "read-only session";
    if (bashCommandMode) return "bash command...";
    if (isStreaming) return `append message for ${projectName}...`;
    return `code prompt for ${projectName}...`;
  };

  return (
    <>
      {/* Attachment preview area - outside input container to avoid overflow clipping */}
      {attachments.length > 0 && !isReadOnly && (
        <div className="attachments-container">
          {attachments.map((att) => (
            <div key={att.id} className="attachment-item">
              <span className="attachment-text">
                {att.type === 'image' ? `image: ${formatBytes(att.size || 0)}` : `text: ${att.preview}`}
              </span>
              <button
                className="attachment-remove"
                onClick={() => removeAttachment(att.id)}
                title="remove"
              >
                <IconX size={10} stroke={2} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        className={`chat-input-container ${isDragging ? 'dragging' : ''}`}
        ref={inputContainerRef}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        style={{ display: isReadOnly ? 'none' : 'block' }}
      >
        <div className="input-row">
          <div className="input-text-wrapper">
            {hasUltrathink && (
              <div
                ref={inputOverlayRef}
                className="input-text-overlay"
              >
                {renderStyledText(input)}
              </div>
            )}
            <textarea
              ref={inputRef}
              className={`chat-input ${bashCommandMode ? 'bash-mode' : ''} ${isContextFull ? 'context-full' : ''} ${hasUltrathink ? 'has-ultrathink' : ''} ${isDictating ? 'dictating' : ''} ${isCommandMode ? 'command-mode' : ''}`}
              placeholder={getPlaceholder()}
              value={isReadOnly || isContextFull ? '' : input}
              onChange={onTextareaChange}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              onScroll={() => {
                // Sync overlay scroll with textarea scroll
                if (inputOverlayRef.current && inputRef.current) {
                  inputOverlayRef.current.scrollTop = inputRef.current.scrollTop;
                }
              }}
              style={{
                marginRight: isStreaming ? '46px' : undefined
              }}
              disabled={isReadOnly || isContextFull}
              spellCheck={false}
              onFocus={() => setIsTextareaFocused(true)}
              onBlur={() => {
                // Close autocomplete when textarea loses focus
                setMentionTrigger(null);
                setCommandTrigger(null);
                setIsTextareaFocused(false);
              }}
              onContextMenu={(e) => {
                // Allow default context menu for right-click paste
                e.stopPropagation();
              }}
            />
          </div>
          {isContextFull && (
            <div className="context-full-overlay">
              <div className="context-full-message">
                context {contextPercentage.toFixed(0)}% full
              </div>
              <div className="context-full-actions">
                <button
                  className="btn-compact"
                  onClick={onCompactRequest}
                  title="compress context to continue"
                >
                  <IconViewportShort size={14} stroke={1.5} />
                  compact
                </button>
                <button
                  className="btn-clear"
                  onClick={() => {
                    setInput('');
                    onClearRequest();
                  }}
                  title="clear all messages"
                >
                  <IconFileShredder size={14} stroke={1.5} />
                  clear
                </button>
              </div>
            </div>
          )}
          <Watermark inputLength={input.length} isFocused={isTextareaFocused} isStreaming={isStreaming} />
          {isStreaming && (
            <button
              className="stop-streaming-btn"
              onClick={onInterrupt}
              title="stop streaming (esc)"
            >
              <IconPlayerStop size={16} stroke={1.5} />
            </button>
          )}
        </div>
        {children}
      </div>
    </>
  );
});
