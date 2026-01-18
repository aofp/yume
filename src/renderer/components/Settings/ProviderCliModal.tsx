import React, { useEffect } from 'react';
import { IconX, IconRefresh, IconFolder, IconTerminal2 } from '@tabler/icons-react';
import './ProviderCliModal.css';

type ProviderType = 'gemini' | 'openai';

interface ProviderCliModalProps {
  provider: ProviderType;
  cliCommand: string;
  cliInfo: { path: string; version: string };
  onClose: () => void;
  onRefresh: () => void;
  isLoading: boolean;
}

export const ProviderCliModal: React.FC<ProviderCliModalProps> = ({
  provider,
  cliCommand,
  cliInfo,
  onClose,
  onRefresh,
  isLoading,
}) => {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const getTitle = () => {
    return provider === 'openai' ? 'codex cli' : `${provider} cli`;
  };

  const getInstallHint = () => {
    if (provider === 'gemini') {
      return 'install: npm install -g @anthropic-ai/gemini-cli';
    }
    return 'install: npm install -g @openai/codex';
  };

  const getAuthHint = () => {
    if (provider === 'gemini') {
      return `run: ${cliCommand} auth login`;
    }
    return `run: ${cliCommand} login`;
  };

  return (
    <div className="provider-cli-modal-overlay" onClick={onClose} onContextMenu={(e) => e.preventDefault()}>
      <div className="provider-cli-modal" onClick={(e) => e.stopPropagation()}>
        <div className="provider-cli-header" onContextMenu={(e) => e.preventDefault()}>
          <h3>{getTitle()}</h3>
          <button className="close-button" onClick={onClose} title="close (esc)">
            <IconX size={16} stroke={1.5} />
          </button>
        </div>

        <div className="provider-cli-content">
          {cliInfo.path ? (
            <>
              <div className="cli-info-row">
                <IconTerminal2 size={14} />
                <span className="cli-info-label">command</span>
                <span className="cli-info-value">{cliCommand}</span>
              </div>
              <div className="cli-info-row">
                <IconFolder size={14} />
                <span className="cli-info-label">path</span>
                <span className="cli-info-value path">{cliInfo.path}</span>
              </div>
              {cliInfo.version && (
                <div className="cli-info-row">
                  <span className="cli-info-label version-label">version</span>
                  <span className="cli-info-value">{cliInfo.version}</span>
                </div>
              )}
              <div className="cli-auth-hint">
                <span>{getAuthHint()}</span>
              </div>
            </>
          ) : (
            <div className="cli-not-found">
              <span className="not-found-message">{cliCommand} not found in PATH</span>
              <span className="install-hint">{getInstallHint()}</span>
            </div>
          )}
        </div>

        <div className="provider-cli-footer">
          <button
            className="refresh-button"
            onClick={onRefresh}
            disabled={isLoading}
          >
            <IconRefresh size={12} className={isLoading ? 'spinning' : ''} />
            {isLoading ? 'checking...' : 'refresh'}
          </button>
        </div>
      </div>
    </div>
  );
};
