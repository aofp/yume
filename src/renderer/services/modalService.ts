import React from 'react';
import ReactDOM from 'react-dom/client';
import { SystemModal } from '../components/SystemModal/SystemModal';

class ModalService {
  private modalContainer: HTMLDivElement | null = null;
  private root: ReactDOM.Root | null = null;

  private ensureContainer() {
    if (!this.modalContainer) {
      this.modalContainer = document.createElement('div');
      this.modalContainer.id = 'system-modal-container';
      document.body.appendChild(this.modalContainer);
      this.root = ReactDOM.createRoot(this.modalContainer);
    }
  }

  private cleanup() {
    if (this.root) {
      this.root.render(React.createElement(React.Fragment));
    }
  }

  alert(message: string): Promise<void> {
    return new Promise((resolve) => {
      this.ensureContainer();
      
      const handleClose = () => {
        this.cleanup();
        resolve();
      };

      this.root?.render(
        React.createElement(SystemModal, {
          message,
          type: 'alert',
          onClose: handleClose
        })
      );
    });
  }

  confirm(message: string): Promise<boolean> {
    return new Promise((resolve) => {
      this.ensureContainer();
      
      const handleClose = () => {
        this.cleanup();
        resolve(false);
      };

      const handleConfirm = () => {
        this.cleanup();
        resolve(true);
      };

      this.root?.render(
        React.createElement(SystemModal, {
          message,
          type: 'confirm',
          onClose: handleClose,
          onConfirm: handleConfirm
        })
      );
    });
  }
}

export const modalService = new ModalService();

// global replacements
(window as unknown as Record<string, unknown>).alert = (message: string) => modalService.alert(message);
(window as unknown as Record<string, unknown>).confirm = (message: string) => modalService.confirm(message);