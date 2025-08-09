import React, { useRef, useState } from 'react';
import { 
  Send, 
  Paperclip, 
  Image, 
  AtSign, 
  Slash,
  StopCircle
} from 'lucide-react';
import './MessageInput.css';

interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
}

export const MessageInput: React.FC<MessageInputProps> = ({
  value,
  onChange,
  onSend,
  disabled = false
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Reset to 3 lines height when empty
      if (!value.trim()) {
        textarea.style.height = '72px'; // Approximately 3 lines
      } else {
        textarea.style.height = 'auto';
        textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
      }
    }
  };

  React.useEffect(() => {
    adjustTextareaHeight();
  }, [value]);
  
  // Set initial height on mount
  React.useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '72px'; // 3 lines initial height
    }
  }, []);

  const handleStop = () => {
    setIsGenerating(false);
    // Call store's cancelGeneration
  };

  return (
    <div className="message-input-container">
      <div className="message-input-wrapper">
        <div className="message-input-actions">
          <button className="input-action" title="Attach file">
            <Paperclip size={18} />
          </button>
          <button className="input-action" title="Add image">
            <Image size={18} />
          </button>
          <button className="input-action" title="Reference file">
            <AtSign size={18} />
          </button>
          <button className="input-action" title="Slash commands">
            <Slash size={18} />
          </button>
        </div>

        <textarea
          ref={textareaRef}
          className="message-input"
          placeholder="Type your message... (Shift+Enter for new line)"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || isGenerating}
          rows={3}
        />

        <div className="message-input-submit">
          {isGenerating ? (
            <button 
              className="input-stop"
              onClick={handleStop}
            >
              <StopCircle size={20} />
              <span>Stop</span>
            </button>
          ) : (
            <button 
              className="input-send"
              onClick={onSend}
              disabled={disabled || !value.trim()}
            >
              <Send size={20} />
              <span>Send</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};