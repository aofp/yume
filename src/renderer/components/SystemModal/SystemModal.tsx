import React, { useEffect, useRef } from 'react';
import './SystemModal.css';

interface SystemModalProps {
  message: string;
  type: 'alert' | 'confirm';
  onClose: () => void;
  onConfirm?: () => void;
}

export const SystemModal: React.FC<SystemModalProps> = ({
  message,
  type,
  onClose,
  onConfirm
}) => {
  const primaryButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    primaryButtonRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter') {
        if (type === 'alert') {
          onClose();
        } else if (onConfirm) {
          onConfirm();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [type, onClose, onConfirm]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="system-modal-overlay" onClick={handleOverlayClick} onContextMenu={(e) => e.preventDefault()}>
      <div className="system-modal">
        <div className="system-modal-content">{message}</div>
        <div className="system-modal-buttons">
          {type === 'confirm' && (
            <button 
              className="system-modal-button"
              onClick={onClose}
            >
              cancel
            </button>
          )}
          <button 
            ref={primaryButtonRef}
            className="system-modal-button primary"
            onClick={type === 'alert' ? onClose : onConfirm}
          >
            {type === 'alert' ? 'ok' : 'confirm'}
          </button>
        </div>
      </div>
    </div>
  );
};