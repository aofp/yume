import React, { useEffect, useRef } from 'react';
import { IconAlertTriangle, IconX } from '@tabler/icons-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import './ConfirmModal.css';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDangerous?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'confirm',
  cancelText = 'cancel',
  isDangerous = false,
  onConfirm,
  onCancel
}) => {
  const modalRef = useRef<HTMLDivElement>(null);

  // Focus trap for accessibility
  useFocusTrap(isOpen, modalRef);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        e.stopPropagation(); // Prevent stopping streaming
        onCancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        onConfirm();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true); // Use capture phase
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onCancel, onConfirm]);
  
  if (!isOpen) return null;

  const handleConfirm = () => {
    // Add a small delay to prevent accidental double-clicks
    setTimeout(() => {
      onConfirm();
    }, 100);
  };

  return (
    <div className="confirm-modal-overlay" onClick={onCancel} onContextMenu={(e) => e.preventDefault()}>
      <div className="confirm-modal" ref={modalRef} onClick={(e) => e.stopPropagation()}>
        <div className="confirm-modal-header" onContextMenu={(e) => e.preventDefault()}>
          <div className="confirm-modal-title">
            {isDangerous && <IconAlertTriangle size={18} className="confirm-modal-warning-icon" />}
            <span>{title}</span>
          </div>
          <button
            className="confirm-modal-close"
            onClick={onCancel}
            aria-label="Close"
            title="close (esc)"
          >
            <IconX size={16} />
          </button>
        </div>
        
        <div className="confirm-modal-body">
          <p>{message}</p>
        </div>
        
        <div className="confirm-modal-footer">
          <button
            className="confirm-modal-btn confirm-modal-btn-cancel"
            onClick={onCancel}
          >
            {cancelText} <span className="confirm-modal-key-hint">(esc)</span>
          </button>
          <button
            className={`confirm-modal-btn confirm-modal-btn-confirm ${isDangerous ? 'dangerous' : ''}`}
            onClick={handleConfirm}
            autoFocus
          >
            {confirmText} <span className="confirm-modal-key-hint">(enter)</span>
          </button>
        </div>
      </div>
    </div>
  );
};