import React, { useEffect } from 'react';
import { IconX } from '@tabler/icons-react';
import './AboutModal.css';

// Version info - manually update this when version changes
// Or use a build script to inject it
const versionInfo = {
  version: '0.1.0',
  author: 'yurufrog',
  website: 'yuru.be',
  isDemo: false // Set to true for demo version (limited to 1 session)
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
            <span className="yuru">y</span><span className="code">&gt;</span>
          </div>
          
          <div className="about-name">yuru code</div>
          
          <div className="about-version">
            version {versionInfo.version}<br />
            <span style={{ color: 'var(--accent-color)' }}>[{versionInfo.isDemo ? 'try' : 'pro'}]</span>
          </div>
          
          {versionInfo.isDemo && (
            <div className="about-license">
              <button 
                className="about-buy-license"
                onClick={() => {
                  console.log('Get pro clicked - placeholder');
                  // TODO: Implement pro version purchase flow
                }}
              >
                get pro
              </button>
            </div>
          )}
          
          <div className="about-credits">
            <div className="about-site">
              <a 
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