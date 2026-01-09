import React, { useEffect, useState } from 'react';
import { IconX } from '@tabler/icons-react';
import { useLicenseStore } from '../../services/licenseManager';
import { UpgradeModal } from '../Upgrade/UpgradeModal';
import './AboutModal.css';

// Version info - manually update this when version changes
// Or use a build script to inject it
const versionInfo = {
  version: '0.1.0',
  author: 'yurufrog',
  website: 'yuru.be'
};

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShowUpgrade?: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose, onShowUpgrade }) => {
  const { isLicensed, clearLicense } = useLicenseStore();
  
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
    <>
    <div className="about-modal-overlay" onClick={onClose}>
      <div className="about-modal" onClick={(e) => e.stopPropagation()}>
        <div className="about-header" onContextMenu={(e) => e.preventDefault()}>
          <h3>about</h3>
          <button className="about-close" onClick={onClose}>
            <IconX size={16} />
          </button>
        </div>
        
        <div className="about-content">
          <div className="about-logo" style={{ fontFamily: "'Comic Mono', monospace" }}>
            <span className="yuru">y</span><span className="code">&gt;</span>
          </div>
          
          <div className="about-name">yurucode</div>
          
          <div className="about-version">
            {versionInfo.version}<br />
            <span 
              style={{ 
                color: 'var(--accent-color)',
                cursor: 'pointer'
              }}
              onClick={() => {
                if (!isLicensed && onShowUpgrade) {
                  // If we have an onShowUpgrade callback, use it
                  // This will close the AboutModal first when called from Settings
                  onShowUpgrade();
                } else if (!isLicensed) {
                  // If no callback but not licensed, close modal and show upgrade
                  onClose();
                  // Small delay to ensure modal closes before upgrade opens
                  setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('showUpgradeModal', { 
                      detail: { reason: 'trial' } 
                    }));
                  }, 100);
                } else {
                  // If licensed, just close
                  onClose();
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                if (isLicensed) {
                  confirm('forget license?') && clearLicense();
                }
              }}
              title={isLicensed ? 'right-click to forget license' : 'click to upgrade'}
            >[{isLicensed ? 'pro' : 'trial'}]</span>
          </div>
          
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
  </>
  );
};