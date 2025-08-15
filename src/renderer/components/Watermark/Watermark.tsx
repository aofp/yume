import React from 'react';
import { useClaudeCodeStore } from '../../stores/claudeCodeStore';
import './Watermark.css';

interface WatermarkProps {
  inputLength?: number;
  isFocused?: boolean;
  isStreaming?: boolean;
}

export const Watermark: React.FC<WatermarkProps> = ({ inputLength = 0, isFocused = false, isStreaming = false }) => {
  const { globalWatermarkImage } = useClaudeCodeStore();

  if (!globalWatermarkImage) return null;

  // Determine opacity state
  let className = 'watermark-container';
  
  if (isStreaming) {
    // Fade out when streaming
    className += ' fade-out';
  } else if (isFocused && inputLength < 20) {
    // Full opacity when focused and less than 20 chars
    className += ' full-opacity';
  } else if (inputLength > 0) {
    // Fade out when there's any input but not in focus+<20 state
    className += ' fade-out';
  }
  // Otherwise use default 0.8 opacity from CSS

  return (
    <div className={className}>
      <img 
        src={globalWatermarkImage} 
        alt="" 
        className="watermark-image"
        draggable={false}
      />
    </div>
  );
};