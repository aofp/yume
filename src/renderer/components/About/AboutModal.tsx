import React, { useEffect } from 'react';
import { IconX } from '@tabler/icons-react';
import './AboutModal.css';

// Version info - manually update this when version changes
// Or use a build script to inject it
const versionInfo = {
  version: '0.8.0',
  author: 'yurufrog',
  website: 'yuru.be',
  isDemo: false // Set to true for demo version
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
          <div className="about-logo" style={{ fontFamily: "'Fira Code', monospace" }}>
            <span className="about-yuru">yuru</span>
            <span style={{ color: 'var(--accent-color)' }}>&gt;</span>
            <span className="about-code">code</span>
          </div>
          
          <div className="about-version">
            version {versionInfo.version} <span style={{ color: 'var(--accent-color)' }}>[{versionInfo.isDemo ? 'demo' : 'full'}]</span>
          </div>
          
          {versionInfo.isDemo && (
            <div className="about-license">
              <button 
                className="about-buy-license"
                onClick={() => {
                  console.log('Buy license clicked - placeholder');
                  // TODO: Implement license purchase flow
                }}
              >
                buy license
              </button>
            </div>
          )}
          
          <div className="about-credits">
            <div className="about-author">
              by <span>yurufrog</span>
            </div>
            <div className="about-site">
              site: <a 
                href="https://yuru.be" 
                onClick={async (e) => {
                  e.preventDefault();
                  // Open in default browser
                  if (window.__TAURI__) {
                    const { invoke } = await import('@tauri-apps/api/core');
                    // Use our custom command to open URL in default browser
                    await invoke('open_external', { url: 'https://yuru.be' }).catch(() => {
                      // Fallback to window.open if command fails
                      window.open('https://yuru.be', '_blank');
                    });
                  } else if (window.electronAPI?.openExternal) {
                    window.electronAPI.openExternal('https://yuru.be');
                  } else {
                    window.open('https://yuru.be', '_blank');
                  }
                }}
                style={{ textDecoration: 'none', cursor: 'pointer' }}
              >
                yuru.be
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};