import React from 'react';
import { IconAlertTriangle, IconDownload, IconCommand } from '@tabler/icons-react';
import './ClaudeNotDetected.css';

export const ClaudeNotDetected: React.FC = () => {
  const isWindows = navigator.platform.toLowerCase().includes('win');
  const isMac = navigator.platform.toLowerCase().includes('mac');

  return (
    <div className="claude-not-detected-overlay">
      <div className="claude-not-detected-modal">
        <div className="claude-not-detected-icon">
          <IconAlertTriangle size={48} stroke={1.5} />
        </div>
        
        <h2>Claude CLI Not Found</h2>
        
        <p className="claude-not-detected-message">
          Claude CLI must be installed to use yurucode
        </p>

        <div className="claude-not-detected-instructions">
          <h3>Installation Instructions:</h3>
          
          {isMac && (
            <div className="install-steps">
              <div className="install-step">
                <IconCommand size={16} />
                <code>brew install claude</code>
              </div>
              <p className="install-note">or download from claude.ai</p>
            </div>
          )}
          
          {isWindows && (
            <div className="install-steps">
              <div className="install-step">
                <IconDownload size={16} />
                <span>Download Claude from claude.ai</span>
              </div>
              <div className="install-step">
                <span className="step-number">1.</span>
                <span>Install Claude desktop app</span>
              </div>
              <div className="install-step">
                <span className="step-number">2.</span>
                <span>Enable Developer mode in Claude settings</span>
              </div>
              <div className="install-step">
                <span className="step-number">3.</span>
                <span>Restart yurucode</span>
              </div>
            </div>
          )}
          
          {!isMac && !isWindows && (
            <div className="install-steps">
              <div className="install-step">
                <IconCommand size={16} />
                <code>pip install claude-cli</code>
              </div>
              <p className="install-note">or check claude.ai for installation</p>
            </div>
          )}
        </div>

        <div className="claude-not-detected-footer">
          <a 
            href="https://claude.ai" 
            target="_blank" 
            rel="noopener noreferrer"
            className="claude-download-link"
          >
            <IconDownload size={14} />
            Visit claude.ai
          </a>
        </div>
      </div>
    </div>
  );
};