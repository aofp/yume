import React, { useState } from 'react';
import { IconCamera, IconCameraFilled } from '@tabler/icons-react';
import { checkpointService } from '../../services/checkpointService';
import { FEATURE_FLAGS } from '../../config/features';
import './CheckpointButton.css';

interface CheckpointButtonProps {
  sessionId: string;
  messageCount: number;
  disabled?: boolean;
  onCheckpointCreated?: (checkpoint: any) => void;
}

export const CheckpointButton: React.FC<CheckpointButtonProps> = ({
  sessionId,
  messageCount,
  disabled = false,
  onCheckpointCreated,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Don't render if feature is disabled
  if (!FEATURE_FLAGS.ENABLE_CHECKPOINTS) {
    return null;
  }

  const handleCreateCheckpoint = async () => {
    if (!description.trim()) {
      setDescription(`Checkpoint at message ${messageCount}`);
    }
    
    setIsCreating(true);
    setError(null);
    
    try {
      const checkpoint = await checkpointService.createCheckpoint(
        sessionId,
        description.trim() || `Checkpoint at message ${messageCount}`,
        'manual'
      );
      
      console.log('✅ Checkpoint created:', checkpoint);
      setShowDialog(false);
      setDescription('');
      
      if (onCheckpointCreated) {
        onCheckpointCreated(checkpoint);
      }
      
      // Show success animation
      const button = document.querySelector('.checkpoint-button');
      if (button) {
        button.classList.add('checkpoint-success');
        setTimeout(() => {
          button.classList.remove('checkpoint-success');
        }, 1500);
      }
    } catch (err) {
      console.error('❌ Failed to create checkpoint:', err);
      setError(err instanceof Error ? err.message : 'Failed to create checkpoint');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <>
      <button
        className={`checkpoint-button ${isCreating ? 'creating' : ''}`}
        onClick={() => setShowDialog(true)}
        disabled={disabled || isCreating}
        title="Create checkpoint"
      >
        {isCreating ? (
          <IconCameraFilled size={16} className="checkpoint-icon spinning" />
        ) : (
          <IconCamera size={16} className="checkpoint-icon" />
        )}
      </button>
      
      {showDialog && (
        <div className="checkpoint-dialog-overlay" onClick={() => setShowDialog(false)}>
          <div className="checkpoint-dialog" onClick={(e) => e.stopPropagation()}>
            <h3 className="checkpoint-dialog-title">Create Checkpoint</h3>
            
            <input
              type="text"
              className="checkpoint-description-input"
              placeholder={`Checkpoint at message ${messageCount}`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isCreating) {
                  handleCreateCheckpoint();
                }
                if (e.key === 'Escape') {
                  setShowDialog(false);
                }
              }}
              autoFocus
              maxLength={100}
            />
            
            {error && (
              <div className="checkpoint-error">{error}</div>
            )}
            
            <div className="checkpoint-info">
              <span className="checkpoint-info-item">
                📝 {messageCount} messages
              </span>
              <span className="checkpoint-info-item">
                🕐 {new Date().toLocaleTimeString()}
              </span>
            </div>
            
            <div className="checkpoint-dialog-actions">
              <button
                className="checkpoint-cancel-btn"
                onClick={() => {
                  setShowDialog(false);
                  setDescription('');
                  setError(null);
                }}
                disabled={isCreating}
              >
                Cancel
              </button>
              <button
                className="checkpoint-create-btn"
                onClick={handleCreateCheckpoint}
                disabled={isCreating}
              >
                {isCreating ? 'Creating...' : 'Create Checkpoint'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};