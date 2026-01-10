import React, { useEffect } from 'react';
import { IconX, IconKeyboard } from '@tabler/icons-react';
import { isMacOS } from '../../services/platformUtils';
import './KeyboardShortcuts.css';

interface KeyboardShortcutsProps {
  onClose: () => void;
}

export const KeyboardShortcuts: React.FC<KeyboardShortcutsProps> = ({ onClose }) => {
  // Use centralized platform detection
  const isMac = isMacOS();
  const modKey = isMac ? 'cmd' : 'ctrl';

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '?' || e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="help-modal-overlay" onClick={onClose}>
      <div className="help-modal" onClick={(e) => e.stopPropagation()}>
        <div className="help-header">
          <h3>
            <IconKeyboard size={16} stroke={1.5} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            keyboard shortcuts
          </h3>
          <button className="help-close" onClick={onClose}>
            <IconX size={16} />
          </button>
        </div>
        <div className="help-content" style={{ display: 'grid', gap: '8px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div className="help-section">
              <h4>tabs</h4>
              <div className="shortcut-item">
                <div className="shortcut-keys">
                  <span className="key-btn">{modKey}</span>
                  <span className="key-plus">+</span>
                  <span className="key-btn">t</span>
                </div>
                <span className="shortcut-dots"></span>
                <span className="shortcut-desc">new tab</span>
              </div>
              <div className="shortcut-item">
                <div className="shortcut-keys">
                  <span className="key-btn">{modKey}</span>
                  <span className="key-plus">+</span>
                  <span className="key-btn">w</span>
                </div>
                <span className="shortcut-dots"></span>
                <span className="shortcut-desc">close tab</span>
              </div>
              <div className="shortcut-item">
                <div className="shortcut-keys">
                  <span className="key-btn">{modKey}</span>
                  <span className="key-plus">+</span>
                  <span className="key-btn">d</span>
                </div>
                <span className="shortcut-dots"></span>
                <span className="shortcut-desc">duplicate tab</span>
              </div>
              <div className="shortcut-item">
                <div className="shortcut-keys">
                  <span className="key-btn">{modKey}</span>
                  <span className="key-plus">+</span>
                  <span className="key-btn">r</span>
                </div>
                <span className="shortcut-dots"></span>
                <span className="shortcut-desc">recent projects</span>
              </div>
              <div className="shortcut-item">
                <div className="shortcut-keys">
                  <span className="key-btn">ctrl</span>
                  <span className="key-plus">+</span>
                  <span className="key-btn">tab</span>
                </div>
                <span className="shortcut-dots"></span>
                <span className="shortcut-desc">next tab</span>
              </div>
              <div className="shortcut-item">
                <div className="shortcut-keys">
                  <span className="key-btn">ctrl</span>
                  <span className="key-plus">+</span>
                  <span className="key-btn">shift</span>
                  <span className="key-plus">+</span>
                  <span className="key-btn">tab</span>
                </div>
                <span className="shortcut-dots"></span>
                <span className="shortcut-desc">prev tab</span>
              </div>
              <div className="shortcut-item">
                <div className="shortcut-keys">
                  <span className="key-btn">{modKey}</span>
                  <span className="key-plus">+</span>
                  <span className="key-btn">1-9</span>
                </div>
                <span className="shortcut-dots"></span>
                <span className="shortcut-desc">switch to tab</span>
              </div>
            </div>

            <div className="help-section">
              <h4>view</h4>
              <div className="shortcut-item">
                <div className="shortcut-keys">
                  <span className="key-btn">{modKey}</span>
                  <span className="key-plus">+</span>
                  <span className="key-btn">e</span>
                </div>
                <span className="shortcut-dots"></span>
                <span className="shortcut-desc">files panel</span>
              </div>
              <div className="shortcut-item">
                <div className="shortcut-keys">
                  <span className="key-btn">{modKey}</span>
                  <span className="key-plus">+</span>
                  <span className="key-btn">g</span>
                </div>
                <span className="shortcut-dots"></span>
                <span className="shortcut-desc">git panel</span>
              </div>
              <div className="shortcut-item">
                <div className="shortcut-keys">
                  <span className="key-btn">{modKey}</span>
                  <span className="key-plus">+</span>
                  <span className="key-btn">0</span>
                </div>
                <span className="shortcut-dots"></span>
                <span className="shortcut-desc">reset zoom</span>
              </div>
              <div className="shortcut-item">
                <div className="shortcut-keys">
                  <span className="key-btn">{modKey}</span>
                  <span className="key-plus">+</span>
                  <span className="key-btn">+</span>
                </div>
                <span className="shortcut-dots"></span>
                <span className="shortcut-desc">zoom in</span>
              </div>
              <div className="shortcut-item">
                <div className="shortcut-keys">
                  <span className="key-btn">{modKey}</span>
                  <span className="key-plus">+</span>
                  <span className="key-btn">-</span>
                </div>
                <span className="shortcut-dots"></span>
                <span className="shortcut-desc">zoom out</span>
              </div>
              <div className="shortcut-item">
                <div className="shortcut-keys">
                  <span className="key-btn">{modKey}</span>
                  <span className="key-plus">+</span>
                  <span className="key-btn">,</span>
                </div>
                <span className="shortcut-dots"></span>
                <span className="shortcut-desc">settings</span>
              </div>
              <div className="shortcut-item">
                <div className="shortcut-keys">
                  <span className="key-btn">{modKey}</span>
                  <span className="key-plus">+</span>
                  <span className="key-btn">y</span>
                </div>
                <span className="shortcut-dots"></span>
                <span className="shortcut-desc">analytics</span>
              </div>
              <div className="shortcut-item">
                <div className="shortcut-keys">
                  <span className="key-btn">{modKey}</span>
                  <span className="key-plus">+</span>
                  <span className="key-btn">n</span>
                </div>
                <span className="shortcut-dots"></span>
                <span className="shortcut-desc">agents</span>
              </div>
              <div className="shortcut-item">
                <div className="shortcut-keys">
                  <span className="key-btn">{modKey}</span>
                  <span className="key-plus">+</span>
                  <span className="key-btn">j</span>
                </div>
                <span className="shortcut-dots"></span>
                <span className="shortcut-desc">sessions browser</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div className="help-section">
              <h4>chat</h4>
              <div className="shortcut-item">
                <div className="shortcut-keys">
                  <span className="key-btn">{modKey}</span>
                  <span className="key-plus">+</span>
                  <span className="key-btn">.</span>
                </div>
                <span className="shortcut-dots"></span>
                <span className="shortcut-desc">session stats</span>
              </div>
              <div className="shortcut-item">
                <div className="shortcut-keys">
                  <span className="key-btn">{modKey}</span>
                  <span className="key-plus">+</span>
                  <span className="key-btn">l</span>
                </div>
                <span className="shortcut-dots"></span>
                <span className="shortcut-desc">clear context</span>
              </div>
              <div className="shortcut-item">
                <div className="shortcut-keys">
                  <span className="key-btn">{modKey}</span>
                  <span className="key-plus">+</span>
                  <span className="key-btn">m</span>
                </div>
                <span className="shortcut-dots"></span>
                <span className="shortcut-desc">compact context</span>
              </div>
              <div className="shortcut-item">
                <div className="shortcut-keys">
                  <span className="key-btn">{modKey}</span>
                  <span className="key-plus">+</span>
                  <span className="key-btn">o</span>
                </div>
                <span className="shortcut-dots"></span>
                <span className="shortcut-desc">toggle model</span>
              </div>
              <div className="shortcut-item">
                <div className="shortcut-keys">
                  <span className="key-btn">{modKey}</span>
                  <span className="key-plus">+</span>
                  <span className="key-btn">shift</span>
                  <span className="key-plus">+</span>
                  <span className="key-btn">o</span>
                </div>
                <span className="shortcut-dots"></span>
                <span className="shortcut-desc">model & tools</span>
              </div>
              <div className="shortcut-item">
                <div className="shortcut-keys">
                  <span className="key-btn">{modKey}</span>
                  <span className="key-plus">+</span>
                  <span className="key-btn">u</span>
                </div>
                <span className="shortcut-dots"></span>
                <span className="shortcut-desc">clear input</span>
              </div>
              <div className="shortcut-item">
                <div className="shortcut-keys">
                  <span className="key-btn">{modKey}</span>
                  <span className="key-plus">+</span>
                  <span className="key-btn">f</span>
                </div>
                <span className="shortcut-dots"></span>
                <span className="shortcut-desc">search messages</span>
              </div>
              <div className="shortcut-item">
                <div className="shortcut-keys">
                  <span className="key-btn">{modKey}</span>
                  <span className="key-plus">+</span>
                  <span className="key-btn">k</span>
                </div>
                <span className="shortcut-dots"></span>
                <span className="shortcut-desc">insert ultrathink</span>
              </div>
              <div className="shortcut-item">
                <div className="shortcut-keys">
                  <span className="key-btn">{modKey}</span>
                  <span className="key-plus">+</span>
                  <span className="key-btn">shift</span>
                  <span className="key-plus">+</span>
                  <span className="key-btn">r</span>
                </div>
                <span className="shortcut-dots"></span>
                <span className="shortcut-desc">resume</span>
              </div>
              <div className="shortcut-item">
                <div className="shortcut-keys">
                  <span className="key-btn">{modKey}</span>
                  <span className="key-plus">+</span>
                  <span className="key-btn">shift</span>
                  <span className="key-plus">+</span>
                  <span className="key-btn">.</span>
                </div>
                <span className="shortcut-dots"></span>
                <span className="shortcut-desc">toggle auto compact</span>
              </div>
              <div className="shortcut-item">
                <div className="shortcut-keys">
                  <span className="key-btn">@</span>
                </div>
                <span className="shortcut-dots"></span>
                <span className="shortcut-desc">mention</span>
              </div>
              <div className="shortcut-item">
                <div className="shortcut-keys">
                  <span className="key-btn">/</span>
                </div>
                <span className="shortcut-dots"></span>
                <span className="shortcut-desc">commands</span>
              </div>
              <div className="shortcut-item">
                <div className="shortcut-keys">
                  <span className="key-btn">!</span> or <span className="key-btn">$</span>
                </div>
                <span className="shortcut-dots"></span>
                <span className="shortcut-desc">bash mode</span>
              </div>
            </div>

            <div className="help-section">
              <h4>app</h4>
              <div className="shortcut-item">
                <div className="shortcut-keys">
                  <span className="key-btn">?</span>
                </div>
                <span className="shortcut-dots"></span>
                <span className="shortcut-desc">show help</span>
              </div>
              <div className="shortcut-item">
                <div className="shortcut-keys">
                  <span className="key-btn">escape</span>
                </div>
                <span className="shortcut-dots"></span>
                <span className="shortcut-desc">stop / close</span>
              </div>
              <div className="shortcut-item">
                <div className="shortcut-keys">
                  <span className="key-btn">{modKey}</span>
                  <span className="key-plus">+</span>
                  <span className="key-btn">q</span>
                </div>
                <span className="shortcut-dots"></span>
                <span className="shortcut-desc">quit app</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};