import React, { useEffect, useState } from 'react';
import { IconX } from '@tabler/icons-react';
import { useLicenseStore } from '../../services/licenseManager';
import { UpgradeModal } from '../Upgrade/UpgradeModal';
import { APP_NAME, APP_VERSION, APP_AUTHOR, APP_WEBSITE } from '../../config/app';
import { checkForUpdates, getVersionInfo } from '../../services/versionCheck';
import './AboutModal.css';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShowUpgrade?: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose, onShowUpgrade }) => {
  const { isLicensed, clearLicense } = useLicenseStore();
  const [updateInfo, setUpdateInfo] = useState<{ hasUpdate: boolean; latest: string | null }>({ hasUpdate: false, latest: null });

  // Check for updates when modal opens
  useEffect(() => {
    if (isOpen) {
      checkForUpdates().then(state => {
        setUpdateInfo({ hasUpdate: state.hasUpdate, latest: state.latestVersion });
      });
    }
  }, [isOpen]);

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
    <div className="about-modal-overlay" onClick={onClose} onContextMenu={(e) => e.preventDefault()}>
      <div className="about-modal" onClick={(e) => e.stopPropagation()}>
        <div className="about-header" onContextMenu={(e) => e.preventDefault()}>
          <h3>about</h3>
          <button className="about-close" onClick={onClose} title="close (esc)">
            <IconX size={16} />
          </button>
        </div>
        
        <div className="about-content">
          <div className="about-logo" style={{ fontFamily: "var(--font-mono, 'Agave', monospace)" }}>
            <span className="yuru">y</span><span className="code">&gt;</span>
          </div>

          <div className="about-name">{APP_NAME}</div>

          <div className="about-version">
            {APP_VERSION}<br />
            <span
              style={{
                color: 'var(--accent-color)',
                cursor: isLicensed ? 'default' : 'pointer'
              }}
              onClick={() => {
                if (isLicensed) return;
                if (onShowUpgrade) {
                  onShowUpgrade();
                } else {
                  onClose();
                  setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('showUpgradeModal', {
                      detail: { reason: 'demo' }
                    }));
                  }, 100);
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                if (isLicensed) {
                  confirm('forget license?') && clearLicense();
                }
              }}
              title={isLicensed ? 'rmb to forget license' : 'click to upgrade'}
            >[{isLicensed ? 'pro' : 'demo'}]</span>
            {updateInfo.hasUpdate && updateInfo.latest && (
              <div
                style={{
                  marginTop: '8px',
                  fontSize: '12px',
                  color: 'var(--accent-color)',
                  cursor: 'pointer'
                }}
                onClick={async () => {
                  const url = 'https://github.com/forkgatherer/yume/releases';
                  if (window.__TAURI__) {
                    const { invoke } = await import('@tauri-apps/api/core');
                    await invoke('open_external', { url }).catch(() => window.open(url, '_blank'));
                  } else {
                    window.open(url, '_blank');
                  }
                }}
                title="click to view releases"
              >
                update available: v{updateInfo.latest}
              </div>
            )}
          </div>
          
          <div className="about-credits" style={{display: 'none'}}>
            <div className="about-site">
              <a
                href={`https://${APP_WEBSITE}`}
                onClick={async (e) => {
                  e.preventDefault();
                  const url = `https://${APP_WEBSITE}`;
                  // Open in default browser
                  if (window.__TAURI__) {
                    const { invoke } = await import('@tauri-apps/api/core');
                    // Use our custom command to open URL in default browser
                    await invoke('open_external', { url }).catch(() => {
                      // Fallback to window.open if command fails
                      window.open(url, '_blank');
                    });
                  } else if (window.electronAPI?.openExternal) {
                    window.electronAPI.openExternal(url);
                  } else {
                    window.open(url, '_blank');
                  }
                }}
                style={{ textDecoration: 'none' }}
              >
                {APP_WEBSITE}
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  </>
  );
};