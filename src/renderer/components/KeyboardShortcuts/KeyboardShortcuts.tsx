import React from 'react';
import { IconX } from '@tabler/icons-react';
import './KeyboardShortcuts.css';

interface KeyboardShortcutsProps {
  onClose: () => void;
}

export const KeyboardShortcuts: React.FC<KeyboardShortcutsProps> = ({ onClose }) => {
  // Detect if we're on macOS
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0 || 
                navigator.userAgent.toUpperCase().indexOf('MAC') >= 0;
  const modKey = isMac ? 'cmd' : 'ctrl';
  return (
    <div className="help-modal-overlay" onClick={onClose}>
      <div className="help-modal" onClick={(e) => e.stopPropagation()}>
        <div className="help-header">
          <h3>keyboard shortcuts</h3>
          <button className="help-close" onClick={onClose}>
            <IconX size={16} />
          </button>
        </div>
        <div className="help-content" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gridTemplateRows: 'repeat(2, 1fr)', gap: '20px' }}>
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
          </div>
          
          <div className="help-section">
            <h4>chat</h4>
            <div className="shortcut-item">
              <div className="shortcut-keys">
                <span className="key-btn">enter</span>
              </div>
              <span className="shortcut-dots"></span>
              <span className="shortcut-desc">send message</span>
            </div>
            <div className="shortcut-item">
              <div className="shortcut-keys">
                <span className="key-btn">shift</span>
                <span className="key-plus">+</span>
                <span className="key-btn">enter</span>
              </div>
              <span className="shortcut-dots"></span>
              <span className="shortcut-desc">new line</span>
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
                <span className="key-btn">f</span>
              </div>
              <span className="shortcut-dots"></span>
              <span className="shortcut-desc">search messages</span>
            </div>
            <div className="shortcut-item">
              <div className="shortcut-keys">
                <span className="key-btn">{modKey}</span>
                <span className="key-plus">+</span>
                <span className="key-btn">.</span>
              </div>
              <span className="shortcut-dots"></span>
              <span className="shortcut-desc">session stats</span>
            </div>
          </div>
          
          <div className="help-section">
            <h4>view</h4>
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
                <span className="key-btn">o</span>
              </div>
              <span className="shortcut-dots"></span>
              <span className="shortcut-desc">toggle model</span>
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
  );
};