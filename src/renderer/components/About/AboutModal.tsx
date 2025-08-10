import React, { useEffect } from 'react';
import { IconX } from '@tabler/icons-react';
import './AboutModal.css';

// Version info
const versionInfo = {
  version: '1.0.0'
};

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="about-modal-overlay" onClick={onClose}>
      <div className="about-modal" onClick={(e) => e.stopPropagation()}>
        <div className="about-header">
          <h3>about</h3>
          <button className="about-close" onClick={onClose}>
            <IconX size={16} />
          </button>
        </div>
        
        <div className="about-content">
          <div className="about-logo">
            <span className="about-yuru">yuru</span>
            <span className="about-code">code</span>
          </div>
          
          <div className="about-version">
            version {versionInfo.version}
          </div>
          
          <div className="about-description">
            {versionInfo.description}
          </div>
          
          <div className="about-credits">
            <div className="about-author">
              by {versionInfo.author}
            </div>
            <div className="about-site">
              site: <a href={`https://${versionInfo.website}`} target="_blank" rel="noopener noreferrer">
                {versionInfo.website}
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};