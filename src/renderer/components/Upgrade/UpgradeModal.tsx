import React, { useEffect } from 'react';
import { IconX, IconSparkles } from '@tabler/icons-react';
import { useLicenseStore } from '../../services/licenseManager';
import { APP_NAME, APP_WEBSITE } from '../../config/app';
import './UpgradeModal.css';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  reason?: 'tabLimit' | 'feature' | 'demo';
}

export const UpgradeModal: React.FC<UpgradeModalProps> = ({ isOpen, onClose, reason }) => {
  const features = useLicenseStore.getState().getFeatures();
  const upgradeUrl = `https://${APP_WEBSITE}/${APP_NAME}`;

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;


  return (
    <div className="upgrade-modal-overlay" onClick={onClose} onContextMenu={(e) => e.preventDefault()}>
      <div className="upgrade-modal" onClick={e => e.stopPropagation()}>
        <div className="upgrade-header" onContextMenu={(e) => e.preventDefault()}>
          <h3>
            <IconSparkles size={16} stroke={1.5} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            upgrade to pro
          </h3>
          <button className="upgrade-close" onClick={onClose} title="close (esc)">
            <IconX size={16} />
          </button>
        </div>

        <div className="upgrade-content">
          {reason === 'tabLimit' && (
            <div className="upgrade-reason">
              <p>demo: {features.maxTabs} tabs max</p>
            </div>
          )}

          <div className="upgrade-price">
            <p>upgrade to pro</p>
            <div className="price">$21</div>
            <p className="price-subtitle">one time</p>
            <button 
              className="upgrade-button"
              onClick={async () => {
                // Open upgrade page in default browser
                if (window.__TAURI__) {
                  const { invoke } = await import('@tauri-apps/api/core');
                  // Use our custom command to open URL in default browser
                  await invoke('open_external', { url: upgradeUrl }).catch(() => {
                    // Fallback to window.open if command fails
                    window.open(upgradeUrl, '_blank');
                  });
                } else if (window.electronAPI?.openExternal) {
                  window.electronAPI.openExternal(upgradeUrl);
                } else {
                  window.open(upgradeUrl, '_blank');
                }
              }}
            >
              upgrade now
            </button>
          </div>

          <div className="license-input-section">
            <p>already have a license?</p>
            <div className="license-input-row">
              <input 
                type="text" 
                placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
                className="license-input"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const input = e.target as HTMLInputElement;
                    if (input.value) {
                      // validate license
                      useLicenseStore.getState().validateLicense(input.value).then(valid => {
                        if (valid) {
                          onClose();
                          alert(`thank you for registering ${APP_NAME}`);
                        } else {
                          alert('invalid license key');
                        }
                      });
                    }
                  }
                }}
              />
              <button 
                className="activate-button"
                onClick={() => {
                  const input = document.querySelector('.license-input') as HTMLInputElement;
                  if (input?.value) {
                    useLicenseStore.getState().validateLicense(input.value).then(valid => {
                      if (valid) {
                        onClose();
                        alert(`thank you for registering ${APP_NAME}`);
                      } else {
                        alert('invalid license key');
                      }
                    });
                  }
                }}
              >
                activate
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
